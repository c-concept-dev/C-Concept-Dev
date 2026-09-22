"use strict";
/**
 * MONO-11 v0.2 — core/review-enforcer.js   (mandat v0.2 §3, §5 ; audit v0.1 : revue 2 SCHEMA_DRIFT, reparation aveugle)
 *
 * ENFORCEMENT DU SCHEMA AVANT EF-03B, EF-03B INCHANGE.
 *
 * EF-03B (MONO-01, gele) fournit le PROMPT (`buildReviewPrompt`) et le VALIDATEUR FINAL
 * (`parseReviewResponse`, octet-exact, anti-fabrication). Ce qu'il ne fait pas, et que ce
 * module ajoute EN AMONT :
 *   - validation LOCALE a schema ferme : exactement N findings (N = dimensions), chaque
 *     dimensionId une seule fois et dans l'ordre, aucune cle supplementaire, enumerations,
 *     cardinalites, citations litterales dans le document cible (normalise a l'ingestion),
 *     references d'oeuvres du jumeau connues ;
 *   - REPRISE INFORMEE : toute passe >= 2 recoit les erreurs structurees de la passe
 *     precedente, l'artefact fautif, le document cible, le schema attendu et les contraintes
 *     de citation/cardinalite. Aucun retry aveugle.
 *   - un compte-rendu de validation par reponse (pour la politique de reuse de l'exploitant).
 *
 * Le texte remis a `parseReviewResponse` gele est celui qui a passe la validation locale ;
 * si le validateur gele refuse malgre tout, la revue est en erreur — jamais forcee.
 *
 * v0.3 (chantier RETRY CIBLE TARGET_REF_NOT_LITERAL) — PERIMETRE : ce module uniquement.
 * v0.3-r1 (micro-correctif pre-gel) — REPAIR REUSE = SAME SEMANTIC CONTEXT ONLY : le prompt de reparation ciblee porte une
 *   EMPREINTE DE CONTEXTE deterministe (jumeau, professionnel, cible, sha256 du document, sha256 du constat repare par dimension).
 *   Motif : la politique de reuse (core/llm-response-reuse.js, cle = octets du prompt) pouvait servir a un jumeau B la reparation
 *   VALID d'un jumeau A (meme document, meme dimension, meme citation fautive) : litterale, mais issue d'un autre constat.
 *   Aucune donnee aleatoire, aucun horodatage, aucun nonce ; identification seule, la tache demandee au LLM est inchangee.
 *   - PASS 1 : inchangee (prompt EF-03B gele + preambule) ;
 *   - PASS >= 2, si TOUTES les erreurs sont TARGET_REF_NOT_LITERAL et que la reponse precedente est parsable :
 *       REPARATION CIBLEE (TARGETED_REPAIR) — seul le champ targetEvidenceRefs des dimensions fautives est redemande
 *       (schema de reparation ferme {"repairs":[...]}) ; le reste de la reponse deja valide est CONSERVE et recompose
 *       localement ; la recomposition est revalidee INTEGRALEMENT par le meme validateur (inchange) puis par EF-03B gele ;
 *       feedback deterministe : fragments contigus de la citation rejetee reellement presents dans le document (jamais
 *       choisis a la place du modele) ; repli [] rappele ; la reponse fautive n'est PAS reinjectee integralement ;
 *   - PASS 3 apres echec cible : CHANGEMENT DE STRATEGIE explicite (rejet signale, repetition signalee le cas echeant,
 *       citations fautives interdites, nouvelle extraction depuis le document, repli []) ;
 *   - EXACT_RETRY_REPEAT : une reponse byte-identique a la precedente avec les memes erreurs est detectee et journalisee ;
 *       aucune passe supplementaire n'est lancee avec une strategie identique a celle qui vient de se repeter (fail-closed) ;
 *   - autres codes d'erreur : comportement v0.2 conserve (reprise informee), plus la garde anti-repetition ci-dessus ;
 *   - validateur, contrat de litteralite, nombre maximal de passes, fail-closed : INCHANGES.
 * v0.4 (TARGETED REPAIR LINEAGE PRESERVATION — contrat MONO-11-v3 : LINEAGE_MONOTONICITY_DURING_REPAIR) — PERIMETRE : ce module.
 *   Cause corrigee (v0.3-r1) : rejectedRefsOf rendait TOUTES les references de la dimension fautive (valides comprises), elles
 *   entraient dans forbiddenRefs et dans « citation(s) rejetee(s) », et recompose REMPLACAIT le tableau entier par la reponse du
 *   modele : une reference originale deja litterale pouvait disparaitre sans qu'aucun validateur ne le voie.
 *   Invariant v0.4, pour toute dimension soumise a une reparation ciblee :
 *     VALID_ORIGINAL_REFS = refs du brut qui passent le controle de litteralite (isStr && content.indexOf) ;
 *     VALID_REPAIR_REFS   = refs rendues par la reparation qui passent le meme controle ;
 *     FINAL_REFS = stableDedup(VALID_ORIGINAL_REFS ++ VALID_REPAIR_REFS)
 *     P1 FINAL ⊇ VALID_ORIGINAL · P2 FINAL ⊆ RAW ∪ REPAIR · P3 tout FINAL est litteral · P4 ordre brut puis modele ·
 *     P5 deduplication stable (premiere occurrence) · P6 aucun autre champ du constat n'est touche.
 *   - rejectedRefsOf(errors, parsed, content) ne rend que les refs NON litterales ; partitionRefsOf rend aussi les CONSERVEES ;
 *   - forbiddenRefs / repeatedFaultyRef ne portent que sur des refs non litterales ; jamais une ref valide n'est interdite ;
 *   - targetedRepairPrompt distingue PRESERVED_VALID_REFS (acquises, jamais a reemettre) et REFS_TO_REPAIR ;
 *   - mergeRepairLineage fusionne AVANT recompose (recompose, pur, inchange) ;
 *   - etat technique de reparation par dimension : NO_REFS_EXPECTED (brut []) / RESOLVED (FINAL non vide) /
 *     REFS_PRESENT_BUT_UNRESOLVED (brut non vide, aucune originale valide, aucune reparation valide) : dans ce dernier cas les
 *     refs invalides sont CONSERVEES dans le candidat (jamais un [] silencieux), le validateur les refuse a nouveau et la
 *     politique bornee continue (passe suivante puis fail-closed) — aucune citation inventee, aucun jugement touche.
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const arr = (v) => (Array.isArray(v) ? v : []);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

const FINDING_KEYS = Object.freeze(["dimensionId", "disposition", "epistemicStatus", "finding", "rationale", "targetEvidenceRefs", "twinBasisWorkRefs", "confidenceQualitative", "limitations"]);
const DISPOSITIONS = Object.freeze(["support", "concern", "gap", "recommendation", "not_determinable"]);
const EPISTEMIC = Object.freeze(["documented", "cautious_inference", "not_determinable"]);
const CONFIDENCE = Object.freeze(["high", "medium", "low"]);
const DEFAULT_MAX_PASSES = 3;

function extractJson(text) {
  const s = String(text == null ? "" : text).trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return { ok: false, error: "JSON introuvable" };
  try { return { ok: true, value: JSON.parse(s.slice(a, b + 1)) }; } catch (e) { return { ok: false, error: "JSON invalide : " + e.message }; }
}

/** Validation LOCALE a schema ferme. Rend { ok, errors: [{code, dimensionId?, detail}] }. */
function validateReviewCandidate(text, twin, targetDoc, reviewSchema) {
  const errors = [];
  const E = (code, detail, dimensionId) => errors.push({ code: code, detail: detail, dimensionId: dimensionId || null });
  const j = extractJson(text);
  if (!j.ok) { E("JSON_INVALID", j.error); return { ok: false, errors: errors }; }
  const d = j.value;
  const topKeys = Object.keys(d || {});
  if (!d || typeof d !== "object" || Array.isArray(d)) { E("ROOT_NOT_OBJECT", "objet attendu"); return { ok: false, errors: errors }; }
  topKeys.filter((k) => k !== "findings").forEach((k) => E("EXTRA_KEY", "cle racine non prevue : " + k));
  const dims = arr(reviewSchema && reviewSchema.dimensions).map((x) => x.id);
  if (!Array.isArray(d.findings)) { E("FINDINGS_MISSING", "findings[] absent"); return { ok: false, errors: errors }; }
  if (d.findings.length !== dims.length) E("CARDINALITY", d.findings.length + " findings, " + dims.length + " attendus (un par dimension)");
  const seen = new Map();
  const known = new Set(arr(twin && twin.documentaryBasis && twin.documentaryBasis.worksUsed).map((w) => w.workRef));
  const content = targetDoc && typeof targetDoc.content === "string" ? targetDoc.content : "";
  d.findings.forEach(function (f, i) {
    if (!f || typeof f !== "object" || Array.isArray(f)) { E("FINDING_NOT_OBJECT", "findings[" + i + "]"); return; }
    Object.keys(f).filter((k) => FINDING_KEYS.indexOf(k) === -1).forEach((k) => E("EXTRA_KEY", "findings[" + i + "] cle non prevue : " + k, f.dimensionId));
    FINDING_KEYS.forEach((k) => { if (!(k in f)) E("MISSING_KEY", "findings[" + i + "] cle absente : " + k, f.dimensionId); });
    if (dims.indexOf(f.dimensionId) === -1) E("DIMENSION_UNKNOWN", "findings[" + i + "] dimensionId inconnu : " + String(f.dimensionId), f.dimensionId);
    else if (seen.has(f.dimensionId)) E("DIMENSION_DUPLICATE", "dimensionId en double : " + f.dimensionId + " (findings[" + seen.get(f.dimensionId) + "] et [" + i + "])", f.dimensionId);
    else seen.set(f.dimensionId, i);
    if (dims.indexOf(f.dimensionId) !== -1 && dims[i] !== undefined && f.dimensionId !== dims[i]) E("DIMENSION_ORDER", "findings[" + i + "] : " + f.dimensionId + ", attendu " + dims[i] + " (ordre du schema)", f.dimensionId);
    if (DISPOSITIONS.indexOf(f.disposition) === -1) E("ENUM_DISPOSITION", "disposition invalide : " + String(f.disposition) + " (attendu : " + DISPOSITIONS.join("|") + ")", f.dimensionId);
    if (EPISTEMIC.indexOf(f.epistemicStatus) === -1) E("ENUM_EPISTEMIC", "epistemicStatus invalide : " + String(f.epistemicStatus), f.dimensionId);
    if (CONFIDENCE.indexOf(f.confidenceQualitative) === -1) E("ENUM_CONFIDENCE", "confidenceQualitative invalide : " + String(f.confidenceQualitative), f.dimensionId);
    if (!isStr(f.finding)) E("FINDING_EMPTY", "finding vide", f.dimensionId);
    if (typeof f.rationale !== "string") E("RATIONALE_MISSING", "rationale absente", f.dimensionId);
    if (!Array.isArray(f.targetEvidenceRefs)) E("TARGET_REFS_NOT_ARRAY", "targetEvidenceRefs[] absent", f.dimensionId);
    else f.targetEvidenceRefs.forEach((ref) => { if (!isStr(ref) || content.indexOf(ref) === -1) E("TARGET_REF_NOT_LITERAL", "citation absente du document cible (doit etre un passage EXACT, caractere pour caractere) : " + JSON.stringify(String(ref).slice(0, 160)), f.dimensionId); });
    if (!Array.isArray(f.twinBasisWorkRefs)) E("TWIN_REFS_NOT_ARRAY", "twinBasisWorkRefs[] absent", f.dimensionId);
    else f.twinBasisWorkRefs.forEach((ref) => { if (!known.has(ref)) E("TWIN_REF_UNKNOWN", "reference absente de worksUsed du jumeau : " + JSON.stringify(String(ref).slice(0, 120)), f.dimensionId); });
    if (!Array.isArray(f.limitations)) E("LIMITATIONS_NOT_ARRAY", "limitations[] absent", f.dimensionId);
    if (f.epistemicStatus === "documented" && (!Array.isArray(f.twinBasisWorkRefs) || f.twinBasisWorkRefs.length === 0)) E("DOCUMENTED_WITHOUT_TWIN_REF", "documented exige au moins un twinBasisWorkRef", f.dimensionId);
  });
  dims.forEach((id) => { if (!seen.has(id)) E("DIMENSION_MISSING", "aucun finding pour la dimension " + id, id); });
  return { ok: errors.length === 0, errors: errors, parsed: d };
}

/** Rappel de contrat AJOUTE au prompt gele (premiere passe) : n'introduit aucun domaine. */
function enforcementPreamble(reviewSchema) {
  const dims = arr(reviewSchema.dimensions).map((d) => d.id);
  return "\n\nCONTRAT DE FORME (verifie localement avant toute acceptation) :\n"
    + "- exactement " + dims.length + " findings, UN par dimension, dans cet ordre : " + dims.join(", ") + " ; aucune dimension en double, aucune omise ;\n"
    + "- aucune cle autre que : " + FINDING_KEYS.join(", ") + " ; racine = {\"findings\":[...]} sans autre cle ;\n"
    + "- disposition ∈ {" + DISPOSITIONS.join(", ") + "} ; epistemicStatus ∈ {" + EPISTEMIC.join(", ") + "} ; confidenceQualitative ∈ {" + CONFIDENCE.join(", ") + "} ;\n"
    + "- targetEvidenceRefs : copie EXACTE, caractere pour caractere (apostrophes et guillemets tels qu'ils apparaissent ci-dessus), d'un passage du document cible ; sinon [] ;\n"
    + "- twinBasisWorkRefs : uniquement des workRef EXACTS de worksUsed ; sinon [] (et alors epistemicStatus ≠ documented).";
}

/** Prompt de REPRISE INFORMEE : erreurs structurees + artefact fautif + document cible + schema + contraintes. */
function informedRepairPrompt(previousText, errors, twin, targetDoc, reviewSchema, pass) {
  const dims = arr(reviewSchema.dimensions).map((d) => d.id);
  return "REPRISE (passe " + pass + ") — votre reponse precedente a ete REFUSEE par la validation locale. Corrigez-la en respectant le contrat ci-dessous. Ne changez que ce qui est necessaire ; conservez les constats deja valides.\n\n"
    + "ERREURS DE VALIDATION (structurees) :\n" + errors.map((e) => "- [" + e.code + "]" + (e.dimensionId ? " dimension " + e.dimensionId : "") + " : " + e.detail).join("\n") + "\n\n"
    + "SCHEMA ATTENDU : {\"findings\":[ " + dims.length + " objets, un par dimension, dans l'ordre " + dims.join(", ") + " ]} ; cles d'un finding : " + FINDING_KEYS.join(", ") + " ; disposition ∈ {" + DISPOSITIONS.join(", ") + "} ; epistemicStatus ∈ {" + EPISTEMIC.join(", ") + "} ; confidenceQualitative ∈ {" + CONFIDENCE.join(", ") + "}.\n\n"
    + "CONTRAINTES DE CITATION : targetEvidenceRefs = passages copies EXACTEMENT (caractere pour caractere, apostrophes/guillemets tels quels) du DOCUMENT CIBLE ci-dessous ; twinBasisWorkRefs = uniquement les workRef listes dans WORKS_USED ci-dessous.\n\n"
    + "DOCUMENT CIBLE (targetId=" + JSON.stringify(targetDoc.targetId) + ") :\n" + (targetDoc.content || "(document vide)") + "\n\n"
    + "WORKS_USED (workRef exacts) : " + JSON.stringify(arr(twin.documentaryBasis && twin.documentaryBasis.worksUsed).map((w) => w.workRef)) + "\n\n"
    + "VOTRE REPONSE PRECEDENTE (fautive) :\n" + String(previousText).slice(0, 60000) + "\n\n"
    + "Retournez UNIQUEMENT le JSON valide.";
}

/* ===================== v0.3 — reparation ciblee, feedback deterministe, anti-repetition ===================== */
const TARGET_REF_CODE = "TARGET_REF_NOT_LITERAL";
const STRATEGY = Object.freeze({ BASE: "BASE_EF03B", INFORMED: "INFORMED_REPAIR_V02", TARGETED: "TARGETED_REPAIR", TARGETED_CHANGE: "TARGETED_REPAIR_STRATEGY_CHANGE" });
const FRAGMENT_MIN_LEN = 12;

/**
 * literalFragments(ref, content) — DETERMINISTE, sans autorite semantique : decompose une citation NON litterale en ses
 * fragments contigus maximaux reellement presents dans le document (balayage gauche -> droite, >= FRAGMENT_MIN_LEN caracteres).
 * Rend { literal: bool, fragments: [{ text, index }], contiguous: bool, coverage } ; ne choisit jamais une citation.
 */
function literalFragments(ref, content) {
  const r = String(ref == null ? "" : ref), c = String(content == null ? "" : content);
  if (!r) return { literal: false, fragments: [], contiguous: false, coverage: 0 };
  if (c.indexOf(r) !== -1) return { literal: true, fragments: [{ text: r, index: c.indexOf(r) }], contiguous: true, coverage: 1 };
  const out = []; let i = 0;
  while (i < r.length) {
    let found = null;
    for (let j = r.length; j - i >= FRAGMENT_MIN_LEN; j--) { const sub = r.slice(i, j); const at = c.indexOf(sub); if (at !== -1) { found = { text: sub, index: at }; break; } }
    if (found) { out.push(found); i += found.text.length; } else i++;
  }
  const covered = out.reduce((n, f) => n + f.text.length, 0);
  const contiguous = out.length >= 2 && out.every((f, k) => k === 0 || out[k - 1].index + out[k - 1].text.length <= f.index);
  return { literal: false, fragments: out, contiguous: false, coverage: r.length ? covered / r.length : 0, orderedInDocument: contiguous };
}

function onlyTargetRefErrors(errors) { return arr(errors).length > 0 && arr(errors).every((e) => e && e.code === TARGET_REF_CODE); }
function faultyDimensions(errors) { return Array.from(new Set(arr(errors).filter((e) => e.code === TARGET_REF_CODE && isStr(e.dimensionId)).map((e) => e.dimensionId))); }
/** v0.4 — controle de litteralite du validateur (l.90), reproduit a l'identique : isStr(ref) && content.indexOf(ref) !== -1. */
function isLiteralRef(ref, content) { return isStr(ref) && String(content == null ? "" : content).indexOf(ref) !== -1; }
/**
 * v0.4 — partitionRefsOf(errors, parsed, content) -> { rejected: {dim:[refs NON litterales]}, preserved: {dim:[refs litterales, ordre brut]}, raw: {dim:[toutes]} }
 * pour les seules dimensions fautives. `content` = document cible ; sans document (usage legacy), rien n'est conserve et tout est rejete.
 */
function partitionRefsOf(errors, parsed, content) {
  const rejected = {}, preserved = {}, raw = {}; const byDim = {}; arr(parsed && parsed.findings).forEach((f) => { if (f && isStr(f.dimensionId)) byDim[f.dimensionId] = f; });
  const hasDoc = typeof content === "string";
  faultyDimensions(errors).forEach((d) => { const all = arr(byDim[d] && byDim[d].targetEvidenceRefs); raw[d] = all.slice(); preserved[d] = hasDoc ? all.filter((r) => isLiteralRef(r, content)) : []; rejected[d] = hasDoc ? all.filter((r) => !isLiteralRef(r, content)).filter((r) => typeof r === "string") : all.filter(isStr); });
  return { rejected: rejected, preserved: preserved, raw: raw };
}
function rejectedRefsOf(errors, parsed, content) {
  /* v0.4 : citations REELLEMENT rejetees (non litterales) de chaque dimension fautive, relues dans la reponse parsee ; une reference deja litterale n'est jamais « rejetee » */
  return partitionRefsOf(errors, parsed, content).rejected;
}
const REPAIR_STATE = Object.freeze({ NO_REFS_EXPECTED: "NO_REFS_EXPECTED", RESOLVED: "RESOLVED", UNRESOLVED: "REFS_PRESENT_BUT_UNRESOLVED" });
/**
 * v0.4 — mergeRepairLineage(parsed, repairs, content) -> { repairs: {dim: FINAL_REFS}, applied: {dim: refs a recomposer}, dimensions: {dim: lineage}, unresolvedDimensions: [dims] }
 * FINAL(d) = stableDedup(VALID_ORIGINAL(d) ++ VALID_REPAIR(d)) ; pur ; ne lit que targetEvidenceRefs.
 * applied(d) = FINAL(d) si l'etat est RESOLVED (ou NO_REFS_EXPECTED) ; si REFS_PRESENT_BUT_UNRESOLVED, applied(d) = refs brutes INCHANGEES
 * (les invalides restent visibles : le validateur les refuse a nouveau, la politique bornee continue — jamais un [] silencieux).
 */
function mergeRepairLineage(parsed, repairs, content) {
  const byDim = {}; arr(parsed && parsed.findings).forEach((f) => { if (f && isStr(f.dimensionId)) byDim[f.dimensionId] = f; });
  const out = { repairs: {}, applied: {}, dimensions: {}, unresolvedDimensions: [] };
  Object.keys(repairs || {}).forEach(function (d) {
    const raw = arr(byDim[d] && byDim[d].targetEvidenceRefs), rep = arr(repairs[d]);
    const validOriginal = raw.filter((r) => isLiteralRef(r, content)), invalidOriginal = raw.filter((r) => !isLiteralRef(r, content));
    const validRepaired = rep.filter((r) => isLiteralRef(r, content)), droppedRepaired = rep.filter((r) => !isLiteralRef(r, content));
    const final = []; validOriginal.concat(validRepaired).forEach((r) => { if (final.indexOf(r) === -1) final.push(r); });
    const state = raw.length === 0 ? REPAIR_STATE.NO_REFS_EXPECTED : (final.length ? REPAIR_STATE.RESOLVED : REPAIR_STATE.UNRESOLVED);
    out.repairs[d] = final; out.applied[d] = state === REPAIR_STATE.UNRESOLVED ? raw.slice() : final; if (state === REPAIR_STATE.UNRESOLVED) out.unresolvedDimensions.push(d);
    out.dimensions[d] = { state: state, preservedRefs: validOriginal, rejectedRefs: invalidOriginal, validRepairedRefs: validRepaired, droppedRepairedRefs: droppedRepaired, finalRefs: final,
      unresolvedInvalidRefs: validRepaired.length ? [] : invalidOriginal,   /* invalides sans remplacement valide : tracees comme reparation non resolue, meme si la dimension reste RESOLVED par ses conservees */
      repairOutcome: validRepaired.length ? "REPAIRED" : (validOriginal.length ? "INVALID_DROPPED_NO_REPLACEMENT" : (raw.length ? "UNRESOLVED" : "NOTHING_TO_REPAIR")) };
  });
  return out;
}

/* ---------- v0.3-r1 : empreinte deterministe du contexte de reparation ---------- */
function canonicalJson(v) {
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
const REPAIR_CONTEXT_SCHEMA = "EvidenceForge.RepairContext";
const REPAIR_CONTEXT_VERSION = "MONO-11-v0.3-r1";
/**
 * repairContext({ twin, targetDoc, parsed, faultyDimensions }) -> { schema, version, twinId, professionalRef, targetId, documentSha256,
 *   dimensions: [{ dimensionId, findingSha256 }], fingerprint }
 * findingSha256 = sha256 du constat parse de la dimension (toutes ses cles SAUF le champ repare targetEvidenceRefs), en JSON canonique.
 * Deux reparations ne partagent une cle de reuse que si jumeau, professionnel, cible, document et constat(s) sont identiques.
 */
function repairContext(input) {
  const twin = input.twin || {}, doc = input.targetDoc || {}, byDim = {};
  arr(input.parsed && input.parsed.findings).forEach((f) => { if (f && isStr(f.dimensionId)) byDim[f.dimensionId] = f; });
  const dimensions = arr(input.faultyDimensions).slice().sort().map(function (d) {
    const f = Object.assign({}, byDim[d] || {}); delete f.targetEvidenceRefs;
    return { dimensionId: d, findingSha256: sha(canonicalJson(f)) };
  });
  const ctx = { schema: REPAIR_CONTEXT_SCHEMA, version: REPAIR_CONTEXT_VERSION, twinId: twin.twinId == null ? null : String(twin.twinId), professionalRef: twin.professionalRef == null ? null : String(twin.professionalRef),
    targetId: doc.targetId == null ? null : String(doc.targetId), documentSha256: sha(typeof doc.content === "string" ? doc.content : ""), dimensions: dimensions };
  return Object.assign(ctx, { fingerprint: sha(canonicalJson(ctx)) });
}
function repairContextLines(ctx) {
  return ["CONTEXTE DE REPARATION (identification deterministe du constat repare ; sans effet sur la tache) : jumeau=" + JSON.stringify(ctx.twinId) + " ; professionnel=" + JSON.stringify(ctx.professionalRef) + " ; cible=" + JSON.stringify(ctx.targetId) + " ; document sha256=" + ctx.documentSha256 + " ; constat(s) : " + ctx.dimensions.map((d) => d.dimensionId + "=" + d.findingSha256).join(", ") + " ; empreinte=" + ctx.fingerprint];
}

/** Prompt de REPARATION CIBLEE (passe >= 2) : seul le champ fautif est redemande ; schema de reparation ferme. */
function targetedRepairPrompt(input) {
  const doc = input.targetDoc, dims = input.faultyDimensions, rejected = input.rejectedRefs, fr = input.fragments, pass = input.pass, change = input.strategyChange === true;
  const lines = [];
  lines.push((change ? "REPRISE CIBLEE — CHANGEMENT DE STRATEGIE (passe " + pass + ")" : "REPRISE CIBLEE (passe " + pass + ")") + " — votre analyse a ete refusee par la validation locale UNIQUEMENT pour le champ \"targetEvidenceRefs\" des dimensions listees ci-dessous. Les autres champs et les autres dimensions sont deja valides et CONSERVES tels quels : ne les reecrivez pas.");
  if (!input.context || !isStr(input.context.fingerprint)) throw Object.assign(new Error("REPAIR_CONTEXT_REQUIRED"), { code: "REPAIR_CONTEXT_REQUIRED" });   /* v0.3-r1 : jamais de prompt cible sans contexte */
  repairContextLines(input.context).forEach((l) => lines.push(l));
  if (change) lines.push("La tentative precedente de reparation a ete REJETEE" + (input.exactRepeat ? " et elle REPRODUISAIT A L'IDENTIQUE la citation fautive" : "") + ". Il est INTERDIT de reutiliser textuellement une citation deja rejetee : procedez a une NOUVELLE EXTRACTION depuis le document cible.");
  lines.push("");
  const preserved = input.preservedRefs || {};   /* v0.4 : PRESERVED_VALID_REFS par dimension (acquises, jamais a reemettre) */
  lines.push("CHAMPS A REPARER :");
  dims.forEach(function (d) {
    lines.push("- dimension " + d + " — champ targetEvidenceRefs — citation(s) rejetee(s) (REFS_TO_REPAIR) : " + JSON.stringify(rejected[d] || []));
    lines.push("  citation(s) CONSERVEE(S) (PRESERVED_VALID_REFS, deja litterales, acquises : elles restent quoi que vous rendiez, ne les reecrivez pas) : " + JSON.stringify(arr(preserved[d])));
    arr(fr[d]).forEach(function (f) {
      if (f.literal) return;
      if (f.fragments.length >= 2) lines.push("  Analyse deterministe de " + JSON.stringify(f.ref.slice(0, 160)) + " : ce n'est PAS un passage du document ; elle JOINT " + f.fragments.length + " fragments qui existent SEPAREMENT et NE SONT PAS CONTIGUS : " + f.fragments.map((x) => JSON.stringify(x.text)).join(" + ") + ". Une citation valide est UN SEUL de ces fragments (ou tout autre passage contigu), jamais leur jonction.");
      else if (f.fragments.length === 1) lines.push("  Analyse deterministe de " + JSON.stringify(f.ref.slice(0, 160)) + " : ce n'est pas un passage du document ; seul le fragment " + JSON.stringify(f.fragments[0].text) + " y figure tel quel.");
      else lines.push("  Analyse deterministe de " + JSON.stringify(f.ref.slice(0, 160)) + " : aucun fragment significatif de cette citation ne figure dans le document.");
    });
  });
  lines.push("");
  lines.push("REGLES (contrat inchange) : chaque element de targetEvidenceRefs est UNE SOUS-CHAINE CONTIGUE du DOCUMENT CIBLE ci-dessous, copiee EXACTEMENT caractere pour caractere (apostrophes, accents, ponctuation tels quels) ; aucune paraphrase ; aucune fusion de deux fragments ; aucune reconstruction de phrase ; aucun mot ajoute ou retire. Ne rendez que les REMPLACEMENTS des citations rejetees : les citations conservees sont reunies automatiquement au resultat (les repeter est sans effet). Si aucune citation litterale adequate n'existe pour remplacer une citation rejetee, rendez [] pour cette dimension : les citations conservees restent ; s'il n'y a aucune citation conservee, la dimension est enregistree comme reparation NON RESOLUE (jamais comme un resultat vide accepte) — n'inventez rien.");
  lines.push("");
  lines.push("DOCUMENT CIBLE (targetId=" + JSON.stringify(doc.targetId) + ") :");
  lines.push(doc.content || "(document vide)");
  lines.push("");
  lines.push("REPONSE ATTENDUE — UNIQUEMENT cet objet JSON, sans autre cle ni texte : {\"repairs\":[" + dims.map((d) => "{\"dimensionId\":" + JSON.stringify(d) + ",\"targetEvidenceRefs\":[\"…\"]}").join(",") + "]}");
  return lines.join("\n");
}

/** Parse strict de la reponse de reparation : {repairs:[{dimensionId, targetEvidenceRefs}]} couvrant exactement les dimensions fautives. */
function parseRepair(text, faultyDims) {
  const j = extractJson(text); if (!j.ok) return { ok: false, errors: [{ code: "REPAIR_JSON_INVALID", detail: j.error, dimensionId: null }] };
  const d = j.value; const errors = [];
  if (!d || typeof d !== "object" || Array.isArray(d) || !Array.isArray(d.repairs)) return { ok: false, errors: [{ code: "REPAIR_SCHEMA_INVALID", detail: "objet {repairs:[...]} attendu", dimensionId: null }] };
  Object.keys(d).filter((k) => k !== "repairs").forEach((k) => errors.push({ code: "REPAIR_SCHEMA_INVALID", detail: "cle non prevue : " + k, dimensionId: null }));
  const repairs = {};
  d.repairs.forEach(function (r, i) {
    if (!r || typeof r !== "object") { errors.push({ code: "REPAIR_SCHEMA_INVALID", detail: "repairs[" + i + "] non objet", dimensionId: null }); return; }
    if (faultyDims.indexOf(r.dimensionId) === -1) { errors.push({ code: "REPAIR_SCHEMA_INVALID", detail: "repairs[" + i + "] dimension non fautive ou inconnue : " + String(r.dimensionId), dimensionId: r.dimensionId || null }); return; }
    if (!Array.isArray(r.targetEvidenceRefs)) { errors.push({ code: "REPAIR_SCHEMA_INVALID", detail: "repairs[" + i + "] targetEvidenceRefs[] absent", dimensionId: r.dimensionId }); return; }
    repairs[r.dimensionId] = r.targetEvidenceRefs;
  });
  faultyDims.forEach((dm) => { if (!(dm in repairs)) errors.push({ code: "REPAIR_INCOMPLETE", detail: "aucune reparation pour la dimension " + dm, dimensionId: dm }); });
  return { ok: errors.length === 0, errors: errors, repairs: repairs };
}

/** Recomposition LOCALE : la reponse precedente (parsee) avec, pour les seules dimensions fautives, les targetEvidenceRefs repares. */
function recompose(parsed, repairs) {
  const findings = arr(parsed && parsed.findings).map((f) => (f && typeof f === "object" && Object.prototype.hasOwnProperty.call(repairs, f.dimensionId)) ? Object.assign({}, f, { targetEvidenceRefs: repairs[f.dimensionId] }) : f);
  return { findings: findings };
}
/* ===================== fin v0.3 ===================== */

/**
 * runEnforcedReview({ frozen, twin, targetDoc, reviewSchema, llmCall, maxPasses, onValidation })
 * -> { review (forme EF-03B), trace: { passes: [...], acceptedPass } }
 * `llmCall(prompt, meta)` doit rendre { text, ... } ; `onValidation({ callId?, responseSha256, valid, errors })` est notifie a chaque passe.
 */
async function runEnforcedReview(input) {
  input = input || {};
  const F = input.frozen, twin = input.twin, doc = input.targetDoc, schema = input.reviewSchema;
  if (!F || typeof input.llmCall !== "function") throw Object.assign(new Error("ENFORCER_INPUT_INVALID"), { code: "ENFORCER_INPUT_INVALID" });
  const maxPasses = Number.isInteger(input.maxPasses) && input.maxPasses > 0 ? input.maxPasses : DEFAULT_MAX_PASSES;
  const basePrompt = F.M01.RR.buildReviewPrompt(twin, doc, schema) + enforcementPreamble(schema);
  const passes = [];
  let text = null, errors = null, accepted = null;
  /* v0.3 — etat de reprise : reponse parsee valide en forme (pour recomposition), texte brut precedent, strategie precedente, repetition */
  let parsed = null, prevRaw = null, prevStrategy = null, prevErrorKey = null, exactRepeatSeen = false, forbiddenRefs = [], failClosedReason = null;
  const errKey = (es) => JSON.stringify(arr(es).map((e) => [e.code, e.dimensionId || null]).sort());
  for (let p = 1; p <= maxPasses; p++) {
    /* ---- choix de la strategie de la passe (v0.3) ---- */
    let strategy, prompt, targeted = null;
    if (p === 1) { strategy = STRATEGY.BASE; prompt = basePrompt; }
    else if (onlyTargetRefErrors(errors) && parsed && Array.isArray(parsed.findings)) {
      const dims = faultyDimensions(errors); const part = partitionRefsOf(errors, parsed, doc.content); const rejected = part.rejected;   /* v0.4 : non litterales seulement ; part.preserved = conservees */
      const fragments = {}; dims.forEach((d) => { fragments[d] = rejected[d].map((ref) => Object.assign({ ref: ref }, literalFragments(ref, doc.content))); });
      const change = prevStrategy === STRATEGY.TARGETED || prevStrategy === STRATEGY.TARGETED_CHANGE || exactRepeatSeen;
      if (prevStrategy === STRATEGY.TARGETED_CHANGE && exactRepeatSeen) { failClosedReason = "EXACT_RETRY_REPEAT apres changement de strategie : aucune strategie differente sure — fail-closed"; break; }   /* I7 */
      strategy = change ? STRATEGY.TARGETED_CHANGE : STRATEGY.TARGETED;
      /* la meme citation fautive resoumise a une passe >= 2 est signalee (meme sans reponse byte-identique) */
      const repeatedFaultyRef = dims.some((d) => arr(rejected[d]).some((r) => forbiddenRefs.indexOf(r) !== -1));
      dims.forEach((d) => { arr(rejected[d]).forEach((r) => { if (forbiddenRefs.indexOf(r) === -1) forbiddenRefs.push(r); }); });
      const ctx = repairContext({ twin: twin, targetDoc: doc, parsed: parsed, faultyDimensions: dims });   /* v0.3-r1 */
      prompt = targetedRepairPrompt({ targetDoc: doc, faultyDimensions: dims, rejectedRefs: rejected, preservedRefs: part.preserved, fragments: fragments, pass: p, strategyChange: change, exactRepeat: exactRepeatSeen || repeatedFaultyRef, forbiddenRefs: forbiddenRefs, context: ctx });
      targeted = { dims: dims, rejected: rejected, preserved: part.preserved, fragments: fragments, repeatedFaultyRef: repeatedFaultyRef, context: ctx };
    } else {
      /* autres codes (ou reponse non parsable) : comportement v0.2 conserve ; I7 : jamais une passe identique apres une repetition exacte */
      if (exactRepeatSeen && prevStrategy === STRATEGY.INFORMED) { failClosedReason = "EXACT_RETRY_REPEAT sur reprise informee v0.2 : aucune strategie differente sure — fail-closed"; break; }
      strategy = STRATEGY.INFORMED; prompt = informedRepairPrompt(text, errors, twin, doc, schema, p);
    }
    const meta = { purpose: p === 1 ? "EF-03B review" : "EF-03B review informed-retry", pass: p, strategy: strategy, twinId: twin.twinId, targetId: doc.targetId, runId: input.runId || null,
      repairContextFingerprint: targeted ? targeted.context.fingerprint : null };   /* v0.3-r1 : exposee aux transports a cle structuree ; la cle effective reste le prompt (qui porte l'empreinte) */
    let r;
    try { r = await input.llmCall(prompt, meta); }
    catch (e) {
      /* une indisponibilite FATALE du fournisseur (credit epuise, transport hors service) remonte : fail-closed du run, jamais une passe consommee */
      if (e && e.fatal === true) throw e;
      passes.push({ pass: p, strategy: strategy, promptSha256: sha(prompt), error: "LLM_CALL_FAILED: " + String(e.message) }); errors = [{ code: "LLM_CALL_FAILED", detail: String(e.message) }]; text = ""; prevStrategy = strategy; continue;
    }
    const raw = typeof r === "string" ? r : (r && r.text) || "";
    /* ---- validation : reponse complete (BASE/INFORMED) ou recomposition locale (TARGETED) ---- */
    let candidateText = raw, v, repairInfo = null;
    if (targeted) {
      const rp = parseRepair(raw, targeted.dims); repairInfo = { parsed: rp.ok, errors: rp.errors };
      if (rp.ok) { const mg = mergeRepairLineage(parsed, rp.repairs, doc.content); repairInfo.lineage = mg.dimensions; repairInfo.unresolvedDimensions = mg.unresolvedDimensions;   /* v0.4 : fusion AVANT recompose ; dimensions non resolues : refs brutes conservees (jamais un [] silencieux) */
        Object.keys(mg.dimensions).forEach((d) => { mg.dimensions[d].droppedRepairedRefs.forEach((x) => { if (isStr(x) && forbiddenRefs.indexOf(x) === -1) forbiddenRefs.push(x); }); });   /* v0.4 : une reparation non litterale ecartee compte comme citation deja rejetee (anti-repetition) ; jamais une ref valide */
        const rc = recompose(parsed, mg.applied); candidateText = JSON.stringify(rc); v = validateReviewCandidate(candidateText, twin, doc, schema); }
      else v = { ok: false, errors: arr(errors), parsed: parsed };   /* reparation illisible (schema de reparation viole) : les erreurs cibles PRECEDENTES restent, la recomposition n'a pas lieu ; le motif est journalise dans rec.repair */
    } else { v = validateReviewCandidate(raw, twin, doc, schema); }
    const rawSha = sha(raw); const exactRepeat = p > 1 && prevRaw !== null && rawSha === sha(prevRaw) && errKey(v.errors) === prevErrorKey;
    const rec = { pass: p, informed: p > 1, strategy: strategy, promptSha256: sha(prompt), responseSha256: sha(candidateText), rawResponseSha256: rawSha, previousResponseSha256: prevRaw === null ? null : sha(prevRaw),
      previousErrorCodes: p > 1 ? Array.from(new Set(arr(errors).map((e) => e.code))) : [], exactRepeat: exactRepeat, targetedDimensions: targeted ? targeted.dims : [],
      proposedFragments: targeted ? Object.keys(targeted.fragments).map((d) => ({ dimensionId: d, refs: targeted.fragments[d].map((f) => ({ ref: f.ref, literal: f.literal, fragments: f.fragments.map((x) => x.text) })) })) : [],
      preservedRefs: targeted ? targeted.preserved : null, repairUnresolvedDimensions: repairInfo && repairInfo.unresolvedDimensions ? repairInfo.unresolvedDimensions : [],   /* v0.4 : lignee de la reparation */
      repair: repairInfo, repeatedFaultyRef: targeted ? targeted.repeatedFaultyRef === true : false, repairContext: targeted ? targeted.context : null, callId: r && (r.callId || r.providerRequestId || r.localRequestId) || null, valid: v.ok, errors: v.errors.slice(0, 20), errorCodes: Array.from(new Set(v.errors.map((e) => e.code))).concat(repairInfo && !repairInfo.parsed ? repairInfo.errors.map((e) => e.code) : []) };
    if (exactRepeat) { rec.event = "EXACT_RETRY_REPEAT"; exactRepeatSeen = true; }
    passes.push(rec);
    if (typeof input.onValidation === "function") { try { input.onValidation({ callId: rec.callId, promptSha256: rec.promptSha256, responseSha256: rawSha, valid: v.ok, errors: rec.errorCodes, stage: "EF-03B-local", strategy: strategy, exactRepeat: exactRepeat }); } catch (e) { /* observabilite seule */ } }
    prevRaw = raw; prevStrategy = strategy; prevErrorKey = errKey(v.errors);
    errors = v.errors; text = candidateText;
    if (v.parsed && Array.isArray(v.parsed.findings)) parsed = v.parsed;   /* une reponse de forme parsable (meme refusee) sert de base a la reparation ciblee */
    if (v.ok) { accepted = p; break; }
  }
  const base = { twinId: twin.twinId, professionalRef: twin.professionalRef, targetId: doc.targetId };
  if (accepted === null) {
    return { review: Object.assign(base, { reviewStatus: "error", findings: [], error: "validation locale refusee apres " + passes.length + " passe(s) : " + (errors || []).slice(0, 3).map((e) => e.code + " " + e.detail).join(" ; ") + (failClosedReason ? " ; " + failClosedReason : ""), enforcement: { passes: passes.length, acceptedPass: null, failClosedReason: failClosedReason, strategies: passes.map((x) => x.strategy) } }), trace: { passes: passes, acceptedPass: null, failClosedReason: failClosedReason } };
  }
  /* VALIDATEUR GELE, inchange : c'est lui qui accepte, jamais ce module. */
  try {
    const findings = F.M01.RR.parseReviewResponse(text, twin, doc, schema);
    return { review: Object.assign(base, { reviewStatus: "complete", findings: findings, error: null, enforcement: { passes: passes.length, acceptedPass: accepted, validatedBy: "EF-03B parseReviewResponse (gele)", strategies: passes.map((x) => x.strategy) } }), trace: { passes: passes, acceptedPass: accepted } };
  } catch (e) {
    return { review: Object.assign(base, { reviewStatus: "error", findings: [], error: "EF-03B: " + String(e.message), enforcement: { passes: passes.length, acceptedPass: accepted, frozenValidatorRefused: true } }), trace: { passes: passes, acceptedPass: accepted, frozenValidatorRefused: String(e.message) } };
  }
}

/**
 * buildEnforcedReviewSet({ frozen, reviewSchema, twinSet, targetDocumentSet, llmCall, maxPasses, onValidation, runId })
 * Meme forme que EF-03B `buildDocumentaryReviewSet` (schemaVersion EF-03B-v1, consommee par EF-03C gele),
 * produite par composition : prompt gele + enforcement local + validateur gele.
 */
async function buildEnforcedReviewSet(input) {
  const F = input.frozen;
  const schema = input.reviewSchema, twinSet = input.twinSet, tds = input.targetDocumentSet;
  if (!schema || schema.schema !== "EvidenceForge.ReviewSchema") throw Object.assign(new Error("REVIEW_SCHEMA_REQUIRED"), { code: "REVIEW_SCHEMA_REQUIRED" });
  if (!twinSet || !Array.isArray(twinSet.twins)) throw Object.assign(new Error("TWIN_SET_REQUIRED"), { code: "TWIN_SET_REQUIRED" });
  const activeTwins = twinSet.twins.filter((t) => !t.retracted);
  const reviews = [], traces = [], unresolvedTargets = [];
  for (const target of arr(schema.reviewTargets)) {
    const doc = F.M01.TDS.getDocumentForTarget(tds, target.targetId);
    if (!doc) { unresolvedTargets.push(target.targetId); continue; }
    for (const twin of activeTwins) {
      const r = await runEnforcedReview({ frozen: F, twin: twin, targetDoc: doc, reviewSchema: schema, llmCall: input.llmCall, maxPasses: input.maxPasses, onValidation: input.onValidation, runId: input.runId });
      reviews.push(r.review); traces.push(Object.assign({ twinId: twin.twinId, targetId: doc.targetId }, r.trace));
    }
  }
  const expected = activeTwins.length * (arr(schema.reviewTargets).length - unresolvedTargets.length);
  const complete = reviews.filter((r) => r.reviewStatus === "complete").length;
  return {
    reviewSet: { schema: "EvidenceForge.DocumentaryReviewSet", schemaVersion: "EF-03B-v1", missionId: twinSet.missionId || null, reviewSchemaHash: schema.schemaHash,
      reviews: reviews, unresolvedTargets: unresolvedTargets,
      summary: { twins: activeTwins.length, targets: arr(schema.reviewTargets).length, reviewsExpected: expected, reviewsComplete: complete, reviewsError: reviews.length - complete,
        unresolvedTargets: unresolvedTargets.length, testMode: true, scientificValidity: false, humanProfessionalValidation: false },
      producedBy: "MONO-11 v0.3-r1 review-enforcer : prompt EF-03B gele + validation locale a schema ferme + reprise informee / reparation ciblee TARGET_REF_NOT_LITERAL + anti-repetition + contexte de reparation (reuse = meme contexte semantique) + validateur EF-03B gele", testMode: true },
    traces: traces,
  };
}

module.exports = { validateReviewCandidate, runEnforcedReview, buildEnforcedReviewSet, enforcementPreamble, informedRepairPrompt, extractJson, FINDING_KEYS, DISPOSITIONS, EPISTEMIC, CONFIDENCE, DEFAULT_MAX_PASSES,
  isLiteralRef, partitionRefsOf, mergeRepairLineage, REPAIR_STATE,   /* v0.4 */
  /* v0.3 */ literalFragments, targetedRepairPrompt, parseRepair, recompose, onlyTargetRefErrors, faultyDimensions, rejectedRefsOf, STRATEGY, TARGET_REF_CODE, FRAGMENT_MIN_LEN,
  /* v0.3-r1 */ repairContext, canonicalJson, REPAIR_CONTEXT_SCHEMA, REPAIR_CONTEXT_VERSION };
