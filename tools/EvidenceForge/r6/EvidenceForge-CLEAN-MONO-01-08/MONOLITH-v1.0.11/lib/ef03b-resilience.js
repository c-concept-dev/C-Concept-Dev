"use strict";
/**
 * EvidenceForge MONOLITH v1.0.11 — lib/ef03b-resilience.js
 * EF-03B REVIEW RESILIENCE : ADAPTATEUR ADDITIF autour de `llmCall` remis au lot gele MONO-11 (review-enforcer, INCHANGE).
 * v1.0.11 — LITERALIZATION LINEAGE PRESERVATION (correctif du seul bloc G) : la recomposition apres litteralisation ne remplace plus
 *   le tableau targetEvidenceRefs d'une dimension fautive par la seule reponse du modele ; elle CONSERVE les references originales
 *   deja litterales (controle gele : isStr + content.indexOf) puis ajoute les references reparees qui passent ce meme controle —
 *   FINAL = dedup(VALID_ORIGINAL_REFS ++ VALID_REPAIRED_REFS), ordre : originales (ordre brut) puis reparees (ordre du modele),
 *   deduplication stable (premiere occurrence). Invariant : FINAL ⊇ VALID_ORIGINAL_REFS et FINAL ⊆ RAW_REFS ∪ REPAIR_REFS.
 *   Cause racine v1.0.10 (run efm-20260918-a64167c0, tentative 10 : 12 citations valides perdues, 3 constats vides) : les references
 *   deja litterales etaient exclues des propositions (jamais revues par le modele) puis RE.recompose (gele) remplacait le tableau entier.
 *   Prompts, validateurs, registre, troncature, agregation, rapport : inchanges.
 * Le lot gele garde le prompt EF-03B, le validateur local a schema ferme, les strategies de reprise et le validateur EF-03B gele
 * (seule autorite d'acceptation). Cet adaptateur agit UNIQUEMENT sur ce qui entre et sort du transport :
 *   E. REGISTRE DES REVUES VALID : cle = sha256 du prompt EF-03B de passe 1 (= jumeau + preuves + document + schema) + sceau + contrat ;
 *      une revue logique deja VALID est servie telle quelle (0 appel), puis RE-VALIDEE par le lot gele comme toute reponse.
 *   A. CONTRAT DE BUDGET DE SORTIE : preambule de FORME ajoute au prompt (longueurs, citations courtes copiees octet pour octet, aucune
 *      prose) ; max_tokens dimensionne au contrat (config llm.reviewMaxTokens). Aucune exigence scientifique retiree.
 *   D. TRONCATURE : stop_reason=max_tokens => statut REVIEW_OUTPUT_TRUNCATED ; sauvetage STRUCTUREL des findings complets (framing JSON,
 *      jamais leur contenu), puis UNE completion ciblee des dimensions manquantes ; fusion deterministe (findings complets byte-identiques).
 *   B/G. LITTERALISATION : si les seules erreurs sont TARGET_REF_NOT_LITERAL et qu'un span EXACT du document correspond a la citation
 *      (marqueurs Markdown, puces, espaces), UNE reprise ciblee sur EXTRAITS propose ces spans (le modele choisit ; jamais applique localement).
 * Tout candidat compose est REVALIDE par le validateur gele avant acceptation ; rien de partiel n'est jamais accepte. Aucune donnee
 * sensible tracee : identifiants, compteurs, codes, hachages.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const P = require("./paths.js"); const CL = require("./cost-ledger.js");
const RE = require(path.join(P.MONO11, "core", "review-enforcer.js"));   /* fonctions PURES du lot gele, utilisees telles quelles (jamais modifiees) */
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const REVIEW_OUTPUT_TRUNCATED = "REVIEW_OUTPUT_TRUNCATED";
const STRATEGY = Object.freeze({ REGISTRY: "REGISTRY_REUSE", BASE: "BASE_WITH_OUTPUT_BUDGET", COMPLETION: "TRUNCATION_COMPLETION", LITERALIZATION: "LITERALIZATION_EXCERPTS", PASSTHROUGH: "PASSTHROUGH" });
const REGISTRY_FILE = "reviews-valid.jsonl", TRACE_FILE = "ef03b-trace.jsonl";
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/* ===================== 1. normalisation deterministe pour la detection des citations non litterales ===================== */
/** normalizeForMatch(text, { markdown }) -> { text, map } : map[i] = index dans l'original du i-eme caractere conserve. */
function normalizeForMatch(src, opts) {
  const md = !opts || opts.markdown !== false; const s = String(src == null ? "" : src); const drop = new Uint8Array(s.length);
  const mark = (re) => { let m; re.lastIndex = 0; while ((m = re.exec(s)) !== null) { for (let i = m.index; i < m.index + m[0].length; i++) drop[i] = 1; if (!m[0].length) re.lastIndex++; } };
  if (md) { mark(/\*\*|__|`+/g); mark(/^[ \t]*(?:[-*•]|\d+[.)])[ \t]+/gm); mark(/\[[ xX]\]/g); mark(/^[ \t]*#{1,6}[ \t]+/gm); mark(/^[ \t]*>[ \t]?/gm); }   /* marqueurs : gras/italique/code, puces et numeros en debut de ligne, cases a cocher, titres, citations */
  let out = "", map = [], prevSpace = true;   /* prevSpace=true : espaces de tete supprimes */
  for (let i = 0; i < s.length; i++) { if (drop[i]) continue; const ch = s[i]; if (/\s/.test(ch)) { if (prevSpace) continue; out += " "; map.push(i); prevSpace = true; } else { out += ch; map.push(i); prevSpace = false; } }
  if (out.endsWith(" ")) { out = out.slice(0, -1); map.pop(); }
  return { text: out, map: map };
}
/** findExactSpan(ref, content, opts) -> { found, unique, span, start, end, occurrences } : span = sous-chaine EXACTE de content dont la forme normalisee = celle de ref. */
function findExactSpan(ref, content, opts) {
  const nd = normalizeForMatch(content, opts), nr = normalizeForMatch(ref, opts).text; if (!nr) return { found: false, unique: false, span: null, occurrences: 0 };
  let idx = nd.text.indexOf(nr), n = 0, first = -1; while (idx !== -1) { if (first === -1) first = idx; n++; idx = nd.text.indexOf(nr, idx + 1); }
  if (first === -1) return { found: false, unique: false, span: null, occurrences: 0 };
  const start = nd.map[first], end = nd.map[first + nr.length - 1] + 1; const span = content.slice(start, end);
  return { found: content.indexOf(span) !== -1, unique: n === 1, span: span, start: start, end: end, occurrences: n };
}
/** classifyNonLiteralRef(ref, content) -> { klass, exactSpan, unique } — deterministe, sans autorite : LITERAL | WHITESPACE_LINEBREAK_ONLY | JOINED_LIST_ITEMS | MARKDOWN_MARKERS_STRIPPED | PARTIAL_LITERAL | PARAPHRASE_OR_ABSENT */
function classifyNonLiteralRef(ref, content) {
  const r = String(ref == null ? "" : ref), c = String(content == null ? "" : content);
  if (r && c.indexOf(r) !== -1) return { klass: "LITERAL", exactSpan: r, unique: true };
  const ws = findExactSpan(r, c, { markdown: false }); if (ws.found) return { klass: "WHITESPACE_LINEBREAK_ONLY", exactSpan: ws.span, unique: ws.unique };
  const mdm = findExactSpan(r, c, { markdown: true }); if (mdm.found) return { klass: /\n[ \t]*(?:[-*•]|\d+[.)])[ \t]/.test(mdm.span) ? "JOINED_LIST_ITEMS" : "MARKDOWN_MARKERS_STRIPPED", exactSpan: mdm.span, unique: mdm.unique };
  const lf = RE.literalFragments(r, c); return { klass: lf.coverage > 0.5 && lf.fragments.length >= 1 ? "PARTIAL_LITERAL" : "PARAPHRASE_OR_ABSENT", exactSpan: null, unique: false, fragments: lf.fragments.map((f) => f.text) };
}

/* ===================== 2. contexte de revue, lu dans le prompt EF-03B gele (forme fixe) ===================== */
const H_DOC = "DOCUMENT CIBLE RÉEL (targetId=", H_BASIS = "\n\nBASE DOCUMENTAIRE DU PROFESSIONNEL", H_DIMS = "\nDIMENSIONS (une entrée par dimension, dans cet ordre)\n";
/** parseReviewPromptContext(prompt) -> { targetId, content, workRefs, dims:[{id,label,definition}], basisLine } | null (forme inattendue => aucune interception). */
function parseReviewPromptContext(prompt) {
  try { const s = String(prompt || ""); const a = s.indexOf(H_DOC); const b = s.indexOf(H_BASIS, a); if (a < 0 || b < 0) return null;
    const head = s.slice(a + H_DOC.length, s.indexOf("\n", a)); const targetId = JSON.parse(head.slice(0, head.indexOf(", rôle=")));
    const content = s.slice(s.indexOf("\n", a) + 1, b); const basisLine = s.slice(b + H_BASIS.length); const bl = basisLine.slice(basisLine.indexOf("\n") + 1); const basis = JSON.parse(bl.slice(0, bl.indexOf("\n")));
    const workRefs = Array.isArray(basis.worksUsed) ? basis.worksUsed.map((w) => w && w.workRef).filter(isStr) : []; const d0 = s.indexOf(H_DIMS); if (d0 < 0) return null; const dimsBlock = s.slice(d0 + H_DIMS.length, s.indexOf("\n\n", d0 + H_DIMS.length));
    const dims = dimsBlock.split("\n").map((l) => { const m = /^([^:\s]+): (.*?) — ([\s\S]*)$/.exec(l); return m ? { id: m[1], label: m[2], definition: m[3] } : null; }).filter(Boolean); if (!dims.length || !content) return null;
    return { targetId: targetId, content: content, workRefs: workRefs, dims: dims, basisLine: bl.slice(0, bl.indexOf("\n")) }; } catch (e) { return null; }
}
const twinLike = (ctx) => ({ twinId: null, documentaryBasis: { worksUsed: ctx.workRefs.map((r) => ({ workRef: r })) } });
const docLike = (ctx) => ({ targetId: ctx.targetId, content: ctx.content });
const schemaLike = (ctx) => ({ dimensions: ctx.dims.map((d) => ({ id: d.id })) });
/** validation LOCALE avec le validateur du lot gele (fonction pure exportee), sur le contexte lu dans le prompt. */
function validateCandidate(text, ctx) { return RE.validateReviewCandidate(text, twinLike(ctx), docLike(ctx), schemaLike(ctx)); }

/* ===================== 3. budget de sortie (forme seule) ===================== */
const OUTPUT_BUDGET = Object.freeze({ findingMaxChars: 600, rationaleMaxChars: 600, refsMax: 3, refMaxChars: 200, limitationsMax: 2, limitationMaxChars: 200 });
function outputBudgetPreamble(dims, budget) {
  const b = Object.assign({}, OUTPUT_BUDGET, budget || {});
  return "\n\nCONTRAT DE BUDGET DE SORTIE (forme seule ; toutes les exigences ci-dessus restent entieres) :\n"
    + "- reponse CONCISE : \"finding\" ≤ " + b.findingMaxChars + " caracteres, \"rationale\" ≤ " + b.rationaleMaxChars + " caracteres, \"limitations\" ≤ " + b.limitationsMax + " elements de ≤ " + b.limitationMaxChars + " caracteres ;\n"
    + "- \"targetEvidenceRefs\" : 1 a " + b.refsMax + " citations COURTES (≤ " + b.refMaxChars + " caracteres), chacune sur UNE SEULE LIGNE du document, copiee OCTET POUR OCTET telle qu'elle apparait ci-dessus — y compris les marqueurs de mise en forme (**, puces « - », numeros, [ ] ), sans jamais joindre plusieurs lignes ou items de liste, sans retirer ni ajouter un caractere ;\n"
    + "- INTERDIT : resume general du dossier, repetition des documents, citations longues, justification dupliquee entre finding et rationale, toute prose hors du JSON ;\n"
    + "- " + dims.length + " findings exactement, dans l'ordre " + dims.map((d) => d.id).join(", ") + " ; rien d'autre que le JSON.";
}

/* ===================== 4. troncature : sauvetage STRUCTUREL + completion ciblee + fusion deterministe ===================== */
/** salvageTruncatedFindings(text, dims) -> { complete:[findings], missingDims:[ids], startedDims } : ne conserve que les objets finding COMPLETS et parsables (framing JSON seul). */
function salvageTruncatedFindings(text, dims) {
  const s = String(text || ""); const a = s.indexOf("\"findings\""); const out = []; const ids = dims.map((d) => (typeof d === "string" ? d : d.id));
  if (a !== -1) { let i = s.indexOf("[", a); if (i !== -1) { i++; let depth = 0, start = -1, inStr = false, esc = false;
    for (; i < s.length; i++) { const ch = s[i]; if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === "\"") inStr = false; continue; } if (ch === "\"") { inStr = true; continue; }
      if (ch === "{") { if (depth === 0) start = i; depth++; } else if (ch === "}") { depth--; if (depth === 0 && start !== -1) { try { const o = JSON.parse(s.slice(start, i + 1)); if (o && typeof o === "object" && isStr(o.dimensionId) && ids.indexOf(o.dimensionId) !== -1 && !out.some((x) => x.dimensionId === o.dimensionId)) out.push(o); } catch (e) { /* objet incomplet : ignore */ } start = -1; } } else if (ch === "]" && depth === 0) break; } } }
  const have = new Set(out.map((o) => o.dimensionId)); return { complete: out, missingDims: ids.filter((id) => !have.has(id)), startedDims: (s.match(/"dimensionId"\s*:\s*"[^"]+"/g) || []).length };
}
/** mergeFindings(kept, produced, dims) -> findings dans l'ordre du schema ; les findings conserves sont REPRIS TELS QUELS (byte-identiques), les produits ne couvrent que les dimensions manquantes. */
function mergeFindings(kept, produced, dims) {
  const ids = dims.map((d) => (typeof d === "string" ? d : d.id)); const byId = {}; (kept || []).forEach((f) => { if (f && isStr(f.dimensionId)) byId[f.dimensionId] = f; });
  const added = []; (produced || []).forEach((f) => { if (f && isStr(f.dimensionId) && !byId[f.dimensionId] && ids.indexOf(f.dimensionId) !== -1) { byId[f.dimensionId] = f; added.push(f.dimensionId); } });
  return { findings: ids.map((id) => byId[id]).filter(Boolean), reusedDims: (kept || []).map((f) => f.dimensionId), regeneratedDims: added, missingDims: ids.filter((id) => !byId[id]) };
}
function buildCompletionPrompt(basePrompt, ctx, missingDims, keptDims, budget) {
  return String(basePrompt) + "\n\nCOMPLETION CIBLEE (sortie precedente tronquee par la limite de longueur) : les findings des dimensions " + (keptDims.join(", ") || "(aucune)") + " ont deja ete produits et sont CONSERVES tels quels — ne les reecrivez pas. "
    + "Produisez UNIQUEMENT les findings manquants, pour les dimensions " + missingDims.join(", ") + ", dans cet ordre, avec exactement les memes regles, le meme contrat de forme et le meme budget de sortie. Reponse attendue : {\"findings\":[ " + missingDims.length + " objet(s), un par dimension manquante ]} — rien d'autre." + outputBudgetPreamble(ctx.dims.filter((d) => missingDims.indexOf(d.id) !== -1), budget);
}
/* ===================== 5. litteralisation sur extraits (proposition deterministe, choix du modele) ===================== */
function buildLiteralizationPrompt(ctx, proposals, opts) {
  const ex = Number((opts && opts.excerptChars) || 300); const lines = ["REPRISE CIBLEE SUR EXTRAITS — votre analyse a ete refusee par la validation locale UNIQUEMENT pour le champ \"targetEvidenceRefs\" des dimensions ci-dessous (citations non litterales : mise en forme Markdown, puces, sauts de ligne ou espaces modifies). Les autres champs et dimensions sont conserves tels quels."];
  /* empreinte de contexte deterministe (repairContext du lot gele : jumeau, cible, document, constat par dimension) : une reparation n'est jamais reutilisable pour un autre constat (regle v0.3-r1) */
  const rc = opts && opts.context; if (!rc || !isStr(rc.fingerprint)) throw Object.assign(new Error("REPAIR_CONTEXT_REQUIRED"), { code: "REPAIR_CONTEXT_REQUIRED" });
  lines.push("CONTEXTE DE REPARATION (identification deterministe du constat repare ; sans effet sur la tache) : jumeau=" + JSON.stringify(rc.twinId) + " ; cible=" + JSON.stringify(rc.targetId) + " ; document sha256=" + rc.documentSha256 + " ; constat(s) : " + rc.dimensions.map((d) => d.dimensionId + "=" + d.findingSha256).join(", ") + " ; empreinte=" + rc.fingerprint);
  lines.push("REGLE (contrat inchange) : chaque citation doit etre une SOUS-CHAINE CONTIGUE du document, copiee OCTET POUR OCTET (marqueurs **, puces, numeros, espaces et sauts de ligne inclus). Pour chaque citation rejetee, le passage exact correspondant a ete localise de facon deterministe dans l'EXTRAIT ci-dessous : reprenez-le TEL QUEL (copie exacte), ou choisissez un autre passage contigu de l'extrait, ou repondez [] si aucune citation adequate n'existe. Aucune paraphrase, aucune fusion.");
  lines.push("");
  proposals.forEach((p) => { lines.push("- dimension " + p.dimensionId + " :"); p.refs.forEach((r) => { lines.push("  citation rejetee : " + JSON.stringify(r.ref.slice(0, 300))); if (r.exactSpan) { const s = Math.max(0, r.start - ex), e = Math.min(ctx.content.length, r.end + ex); lines.push("  passage exact localise (a copier tel quel) : " + JSON.stringify(r.exactSpan)); lines.push("  EXTRAIT DU DOCUMENT (contexte) :\n  «" + ctx.content.slice(s, e) + "»"); } else lines.push("  aucun passage exact localise : repondez [] pour cette citation ou copiez un passage contigu que vous connaissez exactement." ); }); });
  lines.push(""); lines.push("REPONSE ATTENDUE — UNIQUEMENT cet objet JSON, sans autre cle ni texte : {\"repairs\":[" + proposals.map((p) => "{\"dimensionId\":" + JSON.stringify(p.dimensionId) + ",\"targetEvidenceRefs\":[\"…\"]}").join(",") + "]}");
  return lines.join("\n");
}

/* ===================== 5 bis. v1.0.11 — preservation de la lignee : fusion des references (fonction PURE) ===================== */
/** isLiteralRef(ref, content) : le controle de litteralite du lot gele (review-enforcer : isStr(ref) && content.indexOf(ref) !== -1), reproduit a l'identique. */
function isLiteralRef(ref, content) { return isStr(ref) && String(content == null ? "" : content).indexOf(ref) !== -1; }
/**
 * mergeLiteralRefs(rawRefs, repairedRefs, content) -> { refs, validOriginal, invalidOriginal, validRepaired, droppedRepaired }
 * FINAL = dedup(VALID_ORIGINAL_REFS ++ VALID_REPAIRED_REFS) : originales litterales dans leur ordre brut, puis reparees litterales dans
 * l'ordre de retour du modele ; deduplication stable par egalite exacte de chaine (premiere occurrence gagnante) ; aucune autre transformation.
 * Garanties : refs ⊇ validOriginal ; refs ⊆ rawRefs ∪ repairedRefs ; chaque element passe isLiteralRef. Une reference originale deja
 * litterale n'est JAMAIS supprimee par une litteralisation. Fonction pure : meme entree => meme sortie.
 */
function mergeLiteralRefs(rawRefs, repairedRefs, content) {
  const raw = Array.isArray(rawRefs) ? rawRefs : [], rep = Array.isArray(repairedRefs) ? repairedRefs : [];
  const validOriginal = raw.filter((r) => isLiteralRef(r, content)), invalidOriginal = raw.filter((r) => !isLiteralRef(r, content));
  const validRepaired = rep.filter((r) => isLiteralRef(r, content)), droppedRepaired = rep.filter((r) => !isLiteralRef(r, content));
  const refs = []; validOriginal.concat(validRepaired).forEach((r) => { if (refs.indexOf(r) === -1) refs.push(r); });
  return { refs: refs, validOriginal: validOriginal, invalidOriginal: invalidOriginal, validRepaired: validRepaired, droppedRepaired: droppedRepaired };
}
/**
 * preserveLineageRepairs(parsed, repairs, content) -> repairs' : pour chaque dimension reparee, targetEvidenceRefs = mergeLiteralRefs(refs brutes
 * de la dimension dans `parsed`, refs reparees, content).refs. Les dimensions non reparees ne figurent pas dans repairs' (RE.recompose, gele,
 * les laisse intactes). Seul le champ targetEvidenceRefs est concerne : aucun autre champ du constat n'est lu ni modifie.
 */
function preserveLineageRepairs(parsed, repairs, content) {
  const byDim = {}; (parsed && Array.isArray(parsed.findings) ? parsed.findings : []).forEach((f) => { if (f && isStr(f.dimensionId)) byDim[f.dimensionId] = f; });
  const out = {}; Object.keys(repairs || {}).forEach((d) => { out[d] = mergeLiteralRefs(byDim[d] ? byDim[d].targetEvidenceRefs : [], repairs[d], content).refs; });
  return out;
}

/* ===================== 6. registre des revues VALID (par run ; cle = prompt de passe 1 + sceau + contrat) ===================== */
function createReviewRegistry(opts) {
  const file = path.join(opts.runDir, REGISTRY_FILE); const extra = (opts.extraFiles || []).filter((f) => fs.existsSync(f));
  const read = () => [file].concat(extra).flatMap((f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []);
  function find(basePromptSha256, sealHash, contract) { const all = read().filter((e) => e.basePromptSha256 === basePromptSha256 && e.validationContract === contract && (e.sourceSealHash || null) === (sealHash || null) && e.status === "VALID"); return all.length ? all[all.length - 1] : null; }
  function put(entry) { fs.mkdirSync(opts.runDir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(Object.assign({ schema: "EvidenceForge.ValidReviewRecord", schemaVersion: "MONOLITH-v1.0.11", status: "VALID", recordedAt: new Date().toISOString() }, entry)) + "\n"); return entry; }
  return { find, put, list: read, file };
}

/* ===================== 7. l'adaptateur ===================== */
/**
 * createReviewAdapter({ llm, runDir, runId, attemptId, sealHash, config, onTrace, twinsTotal }) -> { llmCall, onValidation, stats, registry }
 * config : { maxTokens (defaut 12288), enableOutputBudget, enableCompletion, enableLiteralization, maxCompletionDims (4), excerptChars (300), budget }
 */
function createReviewAdapter(opts) {
  const llm = opts.llm; const cfg = Object.assign({ maxTokens: 12288, enableOutputBudget: true, enableCompletion: true, enableLiteralization: true, maxCompletionDims: 4, excerptChars: 300, registryExtraFiles: [] }, (P.CONFIG.llm && P.CONFIG.llm.reviewResilience) || {}, opts.config || {}); delete cfg.$comment;
  const registry = createReviewRegistry({ runDir: opts.runDir, extraFiles: cfg.registryExtraFiles }); const TRACE = process.env.EVIDENCEFORGE_TRACE_REVIEWS === "1"; const CONTRACT = "MONO-11-v2";
  const reviews = {}; const byCallId = {}; const order = []; const stats = { reviewsSeen: 0, registryReuses: 0, truncations: 0, completions: 0, literalizations: 0, realCalls: 0, cumulativeReviewCostUsd: 0, validated: 0, contextUnparsed: 0 };
  const costOf = (callId) => { try { const e = CL.readEntries(opts.runDir).find((x) => x.callId === callId); return e && e.cost ? e.cost.totalUsd : 0; } catch (e) { return 0; } };
  const trace = (rec) => { const line = Object.assign({ at: new Date().toISOString(), runId: opts.runId || null, attemptId: opts.attemptId || null }, rec); try { fs.appendFileSync(path.join(opts.runDir, TRACE_FILE), JSON.stringify(line) + "\n"); } catch (e) { /* observabilite */ }
    if (opts.onTrace) { try { opts.onTrace(Object.assign({ event: "ef03b_pass" }, line)); } catch (e) { /* */ } }
    if (TRACE) { try { console.log("[EF REVIEW] twin=" + (rec.twinId || "-") + " review=" + (rec.reviewIndex || "?") + "/" + (rec.twinsTotal || "?") + " pass=" + rec.reviewPass + "/" + rec.maxPasses + " strategy=" + rec.strategy + " stopReason=" + (rec.stopReason || "-") + " input=" + (rec.inputTokens == null ? "-" : rec.inputTokens) + " output=" + (rec.outputTokens == null ? "-" : rec.outputTokens) + " errorsBefore=" + (rec.validationErrorsCountBefore == null ? "-" : rec.validationErrorsCountBefore) + " errorsAfter=" + (rec.validationErrorsCount == null ? "-" : rec.validationErrorsCount) + " codes=" + (rec.validationErrorCodes || []).join(",") + " repairScope=" + ((rec.repairScope || []).join(",") || "-") + " reused=" + (rec.reusedFieldsCount == null ? "-" : rec.reusedFieldsCount) + " regenerated=" + (rec.regeneratedFieldsCount == null ? "-" : rec.regeneratedFieldsCount) + " state=" + rec.state + " costUsd=" + rec.costUsd + " cumulativeReviewCostUsd=" + rec.cumulativeReviewCostUsd); } catch (e) { /* */ } } };
  const stateOf = (meta) => { const key = String(meta.twinId) + "|" + String(meta.targetId); if (!reviews[key]) { reviews[key] = { key, twinId: meta.twinId, targetId: meta.targetId, index: ++stats.reviewsSeen, ctx: null, basePromptSha256: null, parsed: null, passes: [], costUsd: 0, candidates: {} }; order.push(key); } return reviews[key]; };
  const maxPasses = Number(P.CONFIG.llm.reviewMaxPasses || 3);
  const base = (st, meta, extra) => Object.assign({ twinId: st.twinId, targetId: st.targetId, reviewIndex: st.index, twinsTotal: typeof opts.twinsTotal === "function" ? opts.twinsTotal() : null, reviewPass: meta.pass, maxPasses: maxPasses, enforcerStrategy: meta.strategy || null }, extra || {});
  async function call(prompt, meta, extraMeta) { const m = Object.assign({}, meta, { maxTokens: cfg.maxTokens }, extraMeta || {}); const r = await llm.llmCall(prompt, m); if (!r.reused) stats.realCalls++; return r; }
  function record(st, meta, r, cand, v, extra) { const cost = r && r.callId ? costOf(r.callId) : 0; st.costUsd = Math.round((st.costUsd + cost) * 1e4) / 1e4; stats.cumulativeReviewCostUsd = Math.round((stats.cumulativeReviewCostUsd + cost) * 1e4) / 1e4;
    const rec = base(st, meta, Object.assign({ strategy: extra.strategy, stopReason: r && r.stopReason || null, inputTokens: r && r.usage ? r.usage.input_tokens : null, outputTokens: r && r.usage ? r.usage.output_tokens : null, validationErrorsCount: v ? v.errors.length : null, validationErrorCodes: v ? Array.from(new Set(v.errors.map((e) => e.code))) : [], state: extra.state, costUsd: Math.round(cost * 1e4) / 1e4, cumulativeReviewCostUsd: stats.cumulativeReviewCostUsd, candidateSha256: cand ? sha(cand) : null, callId: r && r.callId || null }, extra)); st.passes.push(rec); trace(rec); return rec; }
  function mirrorParsed(st, cand) { if (!st.ctx) return; const v = validateCandidate(cand, st.ctx); if (v.parsed && Array.isArray(v.parsed.findings)) st.parsed = v.parsed; return v; }

  async function reviewCall(prompt, meta) {
    const st = stateOf(meta); const isBase = meta.pass === 1 || meta.strategy === "BASE_EF03B"; const isTargeted = /TARGETED/.test(String(meta.strategy || ""));
    if (isBase) { st.basePromptSha256 = sha(prompt); st.ctx = parseReviewPromptContext(prompt); if (!st.ctx) stats.contextUnparsed++;
      /* E — registre : revue logique deja VALID (meme prompt gele de passe 1 = meme jumeau, memes preuves, meme document, meme schema ; meme sceau, meme contrat) */
      const hit = registry.find(st.basePromptSha256, opts.sealHash || null, CONTRACT);
      if (hit && (!st.ctx || validateCandidate(hit.candidate, st.ctx).ok)) { stats.registryReuses++; const callId = "ef03b-registry-" + hit.candidateSha256; st.candidates[callId] = hit.candidate; byCallId[callId] = st; mirrorParsed(st, hit.candidate);
        if (typeof llm.recordReuse === "function") llm.recordReuse({ purpose: meta.purpose, twinId: meta.twinId, targetId: meta.targetId, callId: hit.candidateSha256, sourceRunId: hit.sourceRunId || hit.runId || null, reason: "revue logique VALID reutilisee (registre EF-03B : prompt de passe 1 + sceau + contrat identiques)", kind: "REVIEW_REGISTRY" });
        record(st, meta, null, hit.candidate, { errors: [] }, { strategy: STRATEGY.REGISTRY, state: "REUSED_VALID", reusedFieldsCount: st.ctx ? st.ctx.dims.length : null, regeneratedFieldsCount: 0, repairScope: [], sourceAttemptId: hit.attemptId || null });
        return { text: hit.candidate, callId: callId, providerId: hit.providerId || "anthropic", modelId: hit.modelId || llm.model, providerRequestId: null, transportKind: "REVIEW_REGISTRY_REUSE", httpStatus: 200, reused: true, stopReason: "end_turn", usage: null }; } }
    if (isTargeted || !st.ctx) {   /* reparation ciblee gelee (petite sortie) ou contexte illisible : transport seul */
      const r = await call(prompt, meta); if (isTargeted && st.ctx && st.parsed) { const rp = RE.parseRepair(r.text, Object.keys(st.parsed.findings.reduce((o, f) => { o[f.dimensionId] = 1; return o; }, {}))); const cand = JSON.stringify(RE.recompose(st.parsed, rp.repairs || {})); st.candidates[r.callId] = cand; byCallId[r.callId] = st; const v = mirrorParsed(st, cand); record(st, meta, r, cand, v, { strategy: STRATEGY.PASSTHROUGH, state: v && v.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID", repairScope: Object.keys(rp.repairs || {}), reusedFieldsCount: st.ctx.dims.length - Object.keys(rp.repairs || {}).length, regeneratedFieldsCount: Object.keys(rp.repairs || {}).length }); }
      else { st.candidates[r.callId] = r.text; byCallId[r.callId] = st; record(st, meta, r, r.text, st.ctx ? mirrorParsed(st, r.text) : null, { strategy: STRATEGY.PASSTHROUGH, state: "PASSTHROUGH" }); }
      return r; }
    /* A — passe complete (BASE ou INFORMED) avec budget de sortie et max_tokens dimensionne */
    const dims = st.ctx.dims; const sent = cfg.enableOutputBudget ? prompt + outputBudgetPreamble(dims, cfg.budget) : prompt; const r = await call(sent, meta); let cand = r.text, callId = r.callId, composite = false; let v = mirrorParsed(st, cand); const errorsBefore = v.errors.length;
    const rec0 = record(st, meta, r, cand, v, { strategy: isBase ? STRATEGY.BASE : STRATEGY.PASSTHROUGH, state: r.stopReason === "max_tokens" ? REVIEW_OUTPUT_TRUNCATED : (v.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID"), truncated: r.stopReason === "max_tokens" });
    /* D — troncature : jamais soumise telle quelle comme complete ; sauvetage structurel + completion ciblee */
    if (r.stopReason === "max_tokens") { stats.truncations++; if (typeof llm.onValidation === "function") llm.onValidation({ callId: r.callId, valid: false, errors: [REVIEW_OUTPUT_TRUNCATED], stage: "EF-03B-adapter" });   /* la reponse brute tronquee n'est jamais reutilisable */
      const sv = salvageTruncatedFindings(r.text, dims);
      if (cfg.enableCompletion && sv.complete.length && sv.missingDims.length && sv.missingDims.length <= cfg.maxCompletionDims) {
        const rc = await call(buildCompletionPrompt(prompt, st.ctx, sv.missingDims, sv.complete.map((f) => f.dimensionId), cfg.budget), meta, { purpose: "EF-03B review completion", strategy: STRATEGY.COMPLETION, repairScope: sv.missingDims }); stats.completions++;
        const j = RE.extractJson(rc.text); const produced = j.ok && Array.isArray(j.value.findings) ? j.value.findings : []; const mg = mergeFindings(sv.complete, produced, dims); const merged = JSON.stringify({ findings: mg.findings }); const vm = mirrorParsed(st, merged);
        record(st, meta, rc, merged, vm, { strategy: STRATEGY.COMPLETION, state: rc.stopReason === "max_tokens" ? REVIEW_OUTPUT_TRUNCATED : (vm.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID"), repairScope: sv.missingDims, reusedFieldsCount: mg.reusedDims.length, regeneratedFieldsCount: mg.regeneratedDims.length, validationErrorsCountBefore: errorsBefore, salvagedFindings: sv.complete.length, stillMissing: mg.missingDims });
        if (mg.regeneratedDims.length) { cand = merged; composite = true; v = vm; } else if (sv.complete.length) { cand = JSON.stringify({ findings: sv.complete }); composite = true; v = mirrorParsed(st, cand); } }   /* completion illisible : le candidat reste le sauvetage structurel (incomplet => refuse par le lot gele, jamais un JSON tronque) */
      else if (sv.complete.length) { cand = JSON.stringify({ findings: sv.complete }); composite = true; v = mirrorParsed(st, cand); } }
    /* G — litteralisation sur extraits : uniquement si les seules erreurs restantes sont TARGET_REF_NOT_LITERAL et qu'un span exact existe */
    if (cfg.enableLiteralization && v && !v.ok && RE.onlyTargetRefErrors(v.errors) && v.parsed) { const faulty = RE.faultyDimensions(v.errors); const rejected = RE.rejectedRefsOf(v.errors, v.parsed);
      const proposals = faulty.map((d) => ({ dimensionId: d, refs: (rejected[d] || []).map((ref) => { if (st.ctx.content.indexOf(ref) !== -1) return null; const c = classifyNonLiteralRef(ref, st.ctx.content); const sp = c.exactSpan ? findExactSpan(ref, st.ctx.content, { markdown: c.klass !== "WHITESPACE_LINEBREAK_ONLY" }) : null; return { ref, klass: c.klass, exactSpan: c.exactSpan, start: sp ? sp.start : null, end: sp ? sp.end : null }; }).filter(Boolean) }));
      if (proposals.some((p) => p.refs.some((x) => x.exactSpan))) { const rctx = RE.repairContext({ twin: { twinId: meta.twinId, professionalRef: meta.professionalRef || null }, targetDoc: docLike(st.ctx), parsed: v.parsed, faultyDimensions: faulty });
        const rl = await call(buildLiteralizationPrompt(st.ctx, proposals, { excerptChars: cfg.excerptChars, context: rctx }), meta, { purpose: "EF-03B review literalization", strategy: STRATEGY.LITERALIZATION, repairScope: faulty, repairContextFingerprint: rctx.fingerprint }); stats.literalizations++;
        const rp = RE.parseRepair(rl.text, faulty); const kept = preserveLineageRepairs(v.parsed, rp.repairs || {}, st.ctx.content);   /* v1.0.11 : originales litterales conservees + reparees litterales ; jamais un remplacement du tableau */
        const lit = rp.ok || Object.keys(rp.repairs || {}).length ? JSON.stringify(RE.recompose(v.parsed, kept)) : null; const vl = lit ? mirrorParsed(st, lit) : null;
        record(st, meta, rl, lit || cand, vl || v, { strategy: STRATEGY.LITERALIZATION, state: vl ? (vl.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID") : "REPAIR_UNPARSABLE", repairScope: faulty, reusedFieldsCount: dims.length - faulty.length, regeneratedFieldsCount: Object.keys(rp.repairs || {}).length, validationErrorsCountBefore: v.errors.length, classes: proposals.flatMap((p) => p.refs.map((x) => x.klass)), lineagePreservedRefs: Object.keys(kept).reduce((n, d) => n + mergeLiteralRefs(((v.parsed.findings.find((f) => f && f.dimensionId === d) || {}).targetEvidenceRefs), [], st.ctx.content).validOriginal.length, 0) });
        if (vl && vl.errors.length < v.errors.length) { cand = lit; composite = true; v = vl; } } }
    if (composite) callId = "ef03b-composite-" + sha(cand); st.candidates[callId] = cand; byCallId[callId] = st;
    return Object.assign({}, r, { text: cand, callId: callId, stopReason: "end_turn", composite: composite, transportKind: composite ? "EF03B_COMPOSITE_CANDIDATE" : r.transportKind });
  }
  async function llmCall(prompt, meta) { if (!meta || !/^EF-03B/.test(String(meta.purpose || ""))) return llm.llmCall(prompt, meta); return reviewCall(prompt, meta); }
  function onValidation(v) { if (typeof llm.onValidation === "function") llm.onValidation(v);
    if (!v || !v.callId) return; const st = byCallId[v.callId]; if (!st) return; const cand = st.candidates[v.callId]; if (v.valid === true && cand) { stats.validated++;
      if (!/^ef03b-registry-/.test(String(v.callId))) registry.put({ basePromptSha256: st.basePromptSha256, twinId: st.twinId, targetId: st.targetId, runId: opts.runId || null, attemptId: opts.attemptId || null, acceptedPass: st.passes.length ? st.passes[st.passes.length - 1].reviewPass : null, candidateSha256: sha(cand), candidate: cand, validationContract: CONTRACT, sourceSealHash: opts.sealHash || null, modelId: llm.model || null, providerId: "anthropic", calls: st.passes.map((p) => ({ strategy: p.strategy, callId: p.callId || null, costUsd: p.costUsd })), costUsd: st.costUsd, source: st.passes.some((p) => p.strategy === STRATEGY.REGISTRY) ? "REGISTRY_REUSE" : "VALIDATED_IN_RUN" });
      trace(base(st, { pass: st.passes.length ? st.passes[st.passes.length - 1].reviewPass : null, strategy: null }, { strategy: "VALIDATED", state: "VALIDATED", costUsd: st.costUsd, cumulativeReviewCostUsd: stats.cumulativeReviewCostUsd, validationErrorsCount: 0, validationErrorCodes: [] })); }
    else if (v.valid === false && cand && st) trace(base(st, { pass: null, strategy: null }, { strategy: "REJECTED_BY_ENFORCER", state: "REJECTED", validationErrorCodes: Array.isArray(v.errors) ? v.errors : [], validationErrorsCount: Array.isArray(v.errors) ? v.errors.length : null, costUsd: 0, cumulativeReviewCostUsd: stats.cumulativeReviewCostUsd })); }
  return { llmCall, onValidation, stats: () => Object.assign({}, stats, { reviews: order.map((k) => ({ twinId: reviews[k].twinId, targetId: reviews[k].targetId, passes: reviews[k].passes.length, costUsd: reviews[k].costUsd })) }), registry, config: cfg, STRATEGY };
}

module.exports = { createReviewAdapter, createReviewRegistry, parseReviewPromptContext, validateCandidate, outputBudgetPreamble, OUTPUT_BUDGET, salvageTruncatedFindings, mergeFindings, buildCompletionPrompt, buildLiteralizationPrompt, normalizeForMatch, findExactSpan, classifyNonLiteralRef, isLiteralRef, mergeLiteralRefs, preserveLineageRepairs, REVIEW_OUTPUT_TRUNCATED, STRATEGY, REGISTRY_FILE, TRACE_FILE };
