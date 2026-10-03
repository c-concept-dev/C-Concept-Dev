"use strict";
/**
 * EvidenceForge MONOLITH v1.0.15 — test/test-v1015-authority-identity.js : AUTHORITY IDENTITY HARDENING.
 * Charge par test/test-ef03b.js. Aucun reseau, aucun fournisseur : lot gele MONO-11 v0.4 execute REELLEMENT avec un LLM factice scripte.
 *
 * Objet, strictement les trois reserves BLOQUANTES POUR ACTIVATION de l'audit independant v1.0.14 :
 *   R1 (R1-01…06) — IDENTITE CIBLE <-> DOCUMENT : l'autorite servie pour une cible est le document normalise de CETTE cible ; le mutant
 *      survivant X1 de l'audit (autorite de target-01 rendue pour toutes les cibles) est tue ; le registre est lie a la cible.
 *   R2 (R2-01…08) — IDENTITE, PAS POINT FIXE : une autorite TRONQUEE mais normalisee, ou un AUTRE document normalise, etaient des points
 *      fixes ACCEPTES en v1.0.14 ; ils sont refuses ici (DOCUMENT_AUTHORITY_IDENTITY_MISMATCH), la garde de point fixe restant en
 *      assertion secondaire. La consequence prouvee par l'audit (reference litterale valide silencieusement ecartee sous autorite
 *      tronquee) n'est plus atteignable.
 *   R4 (R4-01…05) — IMPORT DE REGISTRE : tests COMPORTEMENTAUX (importRun execute sur un run de fixture), plus aucune assertion de texte
 *      source ; le mutant M4c (garde neutralisee en conservant le texte source) est tue.
 */
const fs = require("fs"), path = require("path");
module.exports = async function (h) {
  const { T, assert, tmp, sha, P } = h;
  const EF3 = require("../lib/ef03b-resilience.js"); const SP = require("../lib/stage-professionals.js"); const TI = require("../lib/target-identity.js");
  const IMP = require("../tools/ef03b-registry-import.js");
  const RE = require(path.join(P.MONO11, "core", "review-enforcer.js")); const TN = require(path.join(P.MONO11, "core", "target-normalizer.js"));
  const { F, SEAL } = SP.loadSealedMono11(); const CONTRACT = P.CONFIG.frozenLots["MONO-11"].contractVersion;
  console.log("\n— v1.0.15 : AUTHORITY IDENTITY HARDENING (R1 / R2 / R4) —");

  /* ---------- fixtures : 3 documents DISTINCTS, chacun porteur d'une citation qui n'existe que chez lui ---------- */
  const DIMS = ["DIM-01", "DIM-02", "DIM-03"];
  const RANK = ["premier", "deuxieme", "troisieme"];
  const CITE = RANK.map((r) => "Citation propre au " + r + " document de la fixture.");
  /* apostrophe typographique + CRLF + NBSP : le brut differe du normalise, la citation n'existe QUE dans le normalise */
  const RAWDOC = RANK.map((r, i) => "# Fiche " + (i + 1) + "\r\n\r\nCitation propre au " + r + " document de l’fixture.\r\n\r\n" + CITE[i].replace("propre", "propre").replace(/ /g, " ") + "\r\n");
  const rawOf = (i) => "# Fiche " + (i + 1) + "\r\n\r\nIntroduction du document " + (i + 1) + ", avec l’apostrophe typographique.\r\n\r\n" + CITE[i] + "\r\n";
  const DOCS = [0, 1, 2].map((i) => ({ documentId: "d" + (i + 1), title: "Document " + (i + 1), content: rawOf(i), hashSha256: sha(rawOf(i)) }));
  const normOf = (i) => TN.normalizeTargetDocument({ targetId: TI.targetIdAt(i), label: DOCS[i].title, content: DOCS[i].content }).document.content;
  const schemaFor = (tid) => ({ schema: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1", stage: "EF-03A", missionQuestion: "Question de mission de test.", dimensions: DIMS.map((id, i) => ({ id, label: "Dimension " + (i + 1), definition: "Definition " + (i + 1) + "." })), reviewTargets: [{ targetId: tid }], schemaHash: sha("schema") });
  const mkTwin = (i) => ({ twinId: "twin-" + i, professionalRef: "pro-" + i, referenceIdentity: { displayName: "Professionnel " + i }, documentaryBasis: { worksUsed: [{ workRef: "Work A", title: "Work A" }], dimensionCoverage: {} } });
  const finding = (id, refs) => ({ dimensionId: id, disposition: "support", epistemicStatus: "documented", finding: "Constat " + id + ".", rationale: "Justification " + id + ".", targetEvidenceRefs: refs, twinBasisWorkRefs: ["Work A"], confidenceQualitative: "medium", limitations: ["Limite " + id] });
  const reviewJson = (dflt, byDim) => JSON.stringify({ findings: DIMS.map((id) => finding(id, (byDim || {})[id] || [dflt])) });
  const fakeLlm = (handler) => { const calls = []; let n = 0; return { calls, model: "fake", async llmCall(prompt, meta) { n++; const r = await handler(prompt, meta, n); calls.push({ prompt, meta, text: r.text }); return { text: r.text, callId: "c" + n + "-" + sha(r.text).slice(0, 12), providerRequestId: "f" + n, modelId: "fake", providerId: "fake", usage: { input_tokens: 10, output_tokens: 10 }, stopReason: "end_turn", reused: false }; }, onValidation() {}, recordReuse() {} }; };

  /** CABLAGE DE PRODUCTION a l'identique (lib/pipeline.js) : le MEME jeu de documents cibles est remis a l'adaptateur et au lot gele. */
  async function e2e(targetIndex1, handler, opts) {
    const dir = tmp(); const llm = fakeLlm(handler);
    const adapter = EF3.createReviewAdapter(Object.assign({ llm, runDir: dir, runId: "t", attemptId: 1, sealHash: SEAL.runtimeSealSha256, config: { maxTokens: 12288, excerptChars: 40 }, twinsTotal: () => 3, targetDocuments: DOCS }, opts || {}));
    const tid = TI.targetIdAt(targetIndex1 - 1);
    const tds = await F.M01.TDS.buildTargetDocumentSet("m1", [0, 1, 2].map((i) => ({ targetId: TI.targetIdAt(i), label: DOCS[i].title, content: normOf(i) })));
    const lotDoc = F.M01.TDS.getDocumentForTarget(tds, tid);
    const r = await RE.runEnforcedReview({ frozen: F, twin: mkTwin(targetIndex1), targetDoc: lotDoc, reviewSchema: schemaFor(tid), llmCall: adapter.llmCall, maxPasses: 3, onValidation: adapter.onValidation, runId: "t" });
    return { r, adapter, dir, llm, tid, lotDoc, authority: adapter.authorityFor(tid), registry: adapter.registry.list(), stats: adapter.stats(),
      trace: fs.existsSync(path.join(dir, EF3.TRACE_FILE)) ? fs.readFileSync(path.join(dir, EF3.TRACE_FILE), "utf8").trim().split("\n").map(JSON.parse) : [] };
  }
  const refsOf = (r, id) => r.review.findings.find((f) => f.dimensionId === id).targetEvidenceRefs;
  const caught = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

  /* ============================== R1 — IDENTITE CIBLE <-> DOCUMENT ============================== */

  await T("R1-01", "PER_DOCUMENT, 3 documents distincts : pour CHAQUE cible, l'autorite derivee par l'adaptateur de production est le document normalise de CETTE cible (et d'aucune autre) ; la revue traverse pipeline -> adaptateur -> MONO-11 -> registre", async () => {
    for (let i = 1; i <= 3; i++) {
      const o = await e2e(i, () => ({ text: reviewJson(CITE[i - 1]) }));
      assert(o.authority === normOf(i - 1) && sha(o.authority) === sha(o.lotDoc.content), o.tid + " : autorite == document normalise de la cible == document examine par le lot");
      assert(o.authority !== DOCS[i - 1].content, o.tid + " : l'autorite n'est jamais le contenu brut");
      [0, 1, 2].filter((j) => j !== i - 1).forEach((j) => assert(o.authority.indexOf(CITE[j]) === -1, o.tid + " : l'autorite ne contient pas le document " + (j + 1)));
      assert(o.r.review.reviewStatus === "complete" && o.r.trace.acceptedPass === 1, o.tid + " : revue acceptee passe 1 : " + JSON.stringify(o.r.review.error));
      assert(JSON.stringify(refsOf(o.r, "DIM-01")) === JSON.stringify([CITE[i - 1]]), o.tid + " : citation du bon document conservee");
      assert(o.registry.length === 1 && o.registry[0].targetId === o.tid && o.registry[0].documentAuthoritySha256 === sha(normOf(i - 1)), o.tid + " : entree de registre liee a la cible et a son autorite");
      assert(o.stats.authorityIdentityVerified >= 1 && o.stats.authorityContextDivergences === 0, o.tid + " : gardes d'identite passees");
    } });

  await T("R1-02", "MUTANT X1 DE L'AUDIT v1.0.14 (autorite de target-01 rendue pour TOUTES les cibles) : refus fatal DOCUMENT_AUTHORITY_IDENTITY_MISMATCH sur target-02 et target-03 — la classe de defaut n'est plus exprimable", async () => {
    const x1 = () => normOf(0);   /* exactement la mutation qui survivait 313/313 en v1.0.14 */
    const ok = await e2e(1, () => ({ text: reviewJson(CITE[0]) }), { documentAuthority: x1 });
    assert(ok.r.review.reviewStatus === "complete", "target-01 : inchangee (c'est bien SA propre autorite)");
    for (const i of [2, 3]) {
      const e = await caught(() => e2e(i, () => ({ text: reviewJson(CITE[i - 1]) }), { documentAuthority: x1 }));
      assert(e && e.code === "DOCUMENT_AUTHORITY_IDENTITY_MISMATCH" && e.fatal === true && e.targetId === TI.targetIdAt(i - 1), "target-0" + i + " : " + (e && e.code));
      assert(e.expectedAuthoritySha256 === sha(normOf(i - 1)) && e.receivedAuthoritySha256 === sha(normOf(0)), "target-0" + i + " : empreintes attendue / recue tracees");
    } });

  await T("R1-03", "verification INDEPENDANTE de la carte : l'identifiant de cible du PROMPT gele et le prefixe du contexte reconstruit doivent concorder — cible etrangere au jeu du run et cible du prompt divergente refusees (fail closed)", async () => {
    const dir = tmp(); const adapter = EF3.createReviewAdapter({ llm: fakeLlm(() => ({ text: reviewJson(CITE[0]) })), runDir: dir, runId: "t", sealHash: SEAL.runtimeSealSha256, targetDocuments: DOCS });
    const tds = await F.M01.TDS.buildTargetDocumentSet("m1", [0, 1, 2].map((i) => ({ targetId: TI.targetIdAt(i), label: DOCS[i].title, content: normOf(i) })));
    /* (a) cible hors du jeu du run */
    const e1 = await caught(() => adapter.llmCall("prompt sans contexte", { twinId: "twin-1", targetId: "target-09", pass: 1, strategy: "BASE_EF03B", purpose: "EF-03B review" }));
    assert(e1 && e1.code === "DOCUMENT_AUTHORITY_UNKNOWN_TARGET" && e1.fatal === true, "cible inconnue : " + (e1 && e1.code));
    /* (b) le prompt gele porte target-02 mais la passe declare target-01 : divergence detectee par le PROMPT, pas par la carte */
    const prompt2 = F.M01.RR.buildReviewPrompt(mkTwin(2), F.M01.TDS.getDocumentForTarget(tds, "target-02"), schemaFor("target-02")) + RE.enforcementPreamble(schemaFor("target-02"));
    assert(EF3.parseReviewPromptContext(prompt2).targetId === "target-02", "prompt lisible, cible target-02");
    const e2 = await caught(() => adapter.llmCall(prompt2, { twinId: "twin-2", targetId: "target-01", pass: 1, strategy: "BASE_EF03B", purpose: "EF-03B review" }));
    assert(e2 && e2.code === "DOCUMENT_AUTHORITY_TARGET_MISMATCH" && e2.promptTargetId === "target-02", "cible du prompt divergente : " + (e2 && e2.code)); });

  await T("R1-04", "registre lie a la cible : une entree produite pour target-01 n'est JAMAIS servie pour target-02 (meme autorite, meme sceau, meme contrat) ; elle reste servie pour sa propre cible", async () => {
    const d = tmp(); const reg = EF3.createReviewRegistry({ runDir: d }); const cand = reviewJson(CITE[0]); const key = "k".repeat(64); const A = sha(normOf(0));
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: CONTRACT, sourceSealHash: SEAL.runtimeSealSha256, documentAuthoritySha256: A, targetId: "target-01" });
    assert(reg.find(key, SEAL.runtimeSealSha256, CONTRACT, A, "target-02") === null, "entree de target-01 refusee pour target-02");
    const hit = reg.find(key, SEAL.runtimeSealSha256, CONTRACT, A, "target-01"); assert(hit && hit.targetId === "target-01", "entree servie pour sa propre cible");
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: CONTRACT, sourceSealHash: SEAL.runtimeSealSha256, documentAuthoritySha256: A });   /* ere <= v1.0.14 : aucune cible */
    assert(reg.find(key, SEAL.runtimeSealSha256, CONTRACT, A, "target-02") === null, "entree sans cible (ere <= v1.0.14) : jamais servie quand la cible est exigee");
    /* refus trace et compte par l'adaptateur */
    const dir = tmp(); const reg2 = EF3.createReviewRegistry({ runDir: dir });
    const tds = await F.M01.TDS.buildTargetDocumentSet("m1", [0, 1, 2].map((i) => ({ targetId: TI.targetIdAt(i), label: DOCS[i].title, content: normOf(i) })));
    const lotDoc = F.M01.TDS.getDocumentForTarget(tds, "target-02");
    const basePrompt = F.M01.RR.buildReviewPrompt(mkTwin(2), lotDoc, schemaFor("target-02")) + RE.enforcementPreamble(schemaFor("target-02"));
    reg2.put({ basePromptSha256: sha(basePrompt), candidateSha256: sha(cand), candidate: cand, validationContract: CONTRACT, sourceSealHash: SEAL.runtimeSealSha256, documentAuthoritySha256: sha(normOf(1)), targetId: "target-01" });   /* bonne autorite de target-02 mais cible declaree target-01 */
    const llm = fakeLlm(() => ({ text: reviewJson(CITE[1]) }));
    const adapter = EF3.createReviewAdapter({ llm, runDir: dir, runId: "t", sealHash: SEAL.runtimeSealSha256, targetDocuments: DOCS });
    const r = await RE.runEnforcedReview({ frozen: F, twin: mkTwin(2), targetDoc: lotDoc, reviewSchema: schemaFor("target-02"), llmCall: adapter.llmCall, maxPasses: 3, onValidation: adapter.onValidation, runId: "t" });
    assert(r.review.reviewStatus === "complete" && llm.calls.length === 1 && adapter.stats().registryReuses === 0, "aucune reutilisation : appel reel effectue");
    assert(adapter.stats().registryRefusedForeignTarget === 1, "refus de cible etrangere compte : " + adapter.stats().registryRefusedForeignTarget);
    const tr = fs.readFileSync(path.join(dir, EF3.TRACE_FILE), "utf8").trim().split("\n").map(JSON.parse);
    assert(tr.some((t) => t.strategy === "REGISTRY_REFUSED" && t.state === "FOREIGN_TARGET" && t.entryTargetId === "target-01"), "refus trace"); });

  await T("R1-05", "source UNIQUE de l'identite : attribution par position, fail closed sur jeu vide / doublon / contenu manquant ; carte canonique = document normalise de chaque cible", () => {
    assert(TI.targetIdAt(0) === "target-01" && TI.targetIdAt(11) === "target-12", "schema d'identifiant");
    assert(TI.assignTargetIds(DOCS).map((t) => t.targetId).join(",") === "target-01,target-02,target-03", "attribution par position");
    assert(TI.targetIdOf({ targetId: "target-07" }, 0) === "target-07" && TI.targetIdOf({}, 4) === "target-05", "identifiant porte conserve, sinon position");
    const codes = ["TARGET_DOCUMENT_SET_EMPTY", "TARGET_ID_DUPLICATE", "TARGET_DOCUMENT_CONTENT_MISSING", "TARGET_ID_MALFORMED"];
    const got = [ (() => { try { TI.assignTargetIds([]); } catch (e) { return e.code; } })(),
      (() => { try { TI.assignTargetIds([{ targetId: "target-01", content: "a" }, { targetId: "target-01", content: "b" }]); } catch (e) { return e.code; } })(),
      (() => { try { TI.assignTargetIds([{ content: "" }]); } catch (e) { return e.code; } })(),
      (() => { try { TI.assignTargetIds([{ targetId: "cible-1", content: "a" }]); } catch (e) { return e.code; } })() ];
    assert(JSON.stringify(got) === JSON.stringify(codes), "fail closed : " + JSON.stringify(got));
    const map = TI.buildCanonicalAuthorityMap(DOCS);
    assert(map.targetIds.length === 3 && map.byTarget["target-02"].content === normOf(1) && map.byTarget["target-02"].sha256 === sha(normOf(1)) && map.ruleSetId === TN.RULE_SET_ID, "carte canonique"); });

  await T("R1-06", "[SOURCE_TEXT_ASSERTION, sans valeur comportementale] le monolithe ne fabrique plus d'identifiant de cible hors lib/target-identity.js ; lib/pipeline.js remet a l'adaptateur le MEME jeu de documents cibles qu'au lot gele, sans lambda d'autorite", () => {
    const pipe = fs.readFileSync(path.join(P.ROOT, "lib", "pipeline.js"), "utf8");
    assert(/createReviewAdapter\(\{[\s\S]{0,400}?targetDocuments: targetDocs \}\)/.test(pipe), "l'adaptateur recoit targetDocuments: targetDocs");
    assert(pipe.indexOf("documentAuthority") === -1 && pipe.indexOf("authorityByTarget") === -1, "aucune lambda ni table d'autorite dans le pipeline");
    assert(/runDownstreamFromCheckpoint\(\{[\s\S]{0,600}?targetDocuments: targetDocs,/.test(pipe), "le lot gele recoit le MEME jeu de documents cibles");
    /* EXEMPTION EXPLICITE, JAMAIS SILENCIEUSE : lib/stage-professionals.js conserve son expression positionnelle parce que
       runDownstreamFromCheckpoint est BYTE-IDENTIQUE a v1.0.4 par contrat (assertions PROF-ECON-04 et PRO-EARLY-08) ; cette frontiere
       n'est pas franchie par v1.0.15. Sa derivation est la MEME (position 1-based) et un desaccord eventuel ne peut pas produire
       d'appariement silencieux : il est arrete par la garde fondee sur le PROMPT gele (R1-03, DOCUMENT_AUTHORITY_TARGET_MISMATCH). */
    const EXEMPT = ["target-identity.js", "stage-professionals.js"];
    const libs = fs.readdirSync(path.join(P.ROOT, "lib")).filter((f) => /\.js$/.test(f) && EXEMPT.indexOf(f) === -1);
    const offenders = libs.filter((f) => /"target-" \+ String\(/.test(fs.readFileSync(path.join(P.ROOT, "lib", f), "utf8")));
    assert(offenders.length === 0, "fabrique d'identifiant de cible hors de la source unique : " + offenders.join(", "));
    const sp = fs.readFileSync(path.join(P.ROOT, "lib", "stage-professionals.js"), "utf8");
    assert((sp.match(/"target-" \+ String\(i \+ 1\)\.padStart\(2, "0"\)/g) || []).length === 1 && TI.targetIdAt(0) === "target-01" && TI.targetIdAt(1) === "target-02", "l'exemption porte sur UNE seule expression, de meme semantique que TI.targetIdAt"); });

  /* ============================== R2 — IDENTITE, PAS POINT FIXE ============================== */

  await T("R2-01", "autorite TRONQUEE mais normalisee : elle EST un point fixe des regles gelees (la garde v1.0.14 la laissait passer) et elle est desormais REFUSEE (DOCUMENT_AUTHORITY_IDENTITY_MISMATCH)", async () => {
    const trunc = normOf(0).slice(0, 25);
    assert(TN.normalizeText(trunc).normalized === trunc, "prealable : la troncature est un point fixe (la garde de v1.0.14 ne la detecte pas)");
    const e = await caught(() => e2e(1, () => ({ text: reviewJson(CITE[0]) }), { documentAuthority: () => trunc }));
    assert(e && e.code === "DOCUMENT_AUTHORITY_IDENTITY_MISMATCH" && e.fatal === true && e.receivedLength === trunc.length, "refus : " + (e && e.code)); });

  await T("R2-02", "consequence prouvee par l'audit v1.0.14 (reference litterale valide silencieusement ecartee sous autorite tronquee) : plus atteignable — la chaine s'arrete, et sous l'autorite canonique la reference est conservee", async () => {
    const trunc = normOf(0).slice(0, normOf(0).indexOf(CITE[0]));   /* tronquee JUSTE avant la citation : exactement le cas de perte */
    assert(trunc.length > 0 && trunc.indexOf(CITE[0]) === -1 && normOf(0).indexOf(CITE[0]) !== -1, "prealable : la citation est hors de l'autorite tronquee");
    const e = await caught(() => e2e(1, () => ({ text: reviewJson(CITE[0]) }), { documentAuthority: () => trunc }));
    assert(e && e.code === "DOCUMENT_AUTHORITY_IDENTITY_MISMATCH", "aucune revue n'est produite sous autorite tronquee : " + (e && e.code));
    const o = await e2e(1, () => ({ text: reviewJson(CITE[0]) }));
    assert(o.r.review.reviewStatus === "complete" && JSON.stringify(refsOf(o.r, "DIM-01")) === JSON.stringify([CITE[0]]), "sous l'autorite canonique : reference conservee"); });

  await T("R2-03", "AUTRE document, integralement normalise : point fixe egalement, refus par identite (ce n'est pas le document de la cible)", async () => {
    const other = normOf(2);
    assert(TN.normalizeText(other).normalized === other, "prealable : l'autre document est un point fixe");
    const e = await caught(() => e2e(1, () => ({ text: reviewJson(CITE[0]) }), { documentAuthority: () => other }));
    assert(e && e.code === "DOCUMENT_AUTHORITY_IDENTITY_MISMATCH" && e.expectedAuthoritySha256 === sha(normOf(0)), "refus : " + (e && e.code)); });

  await T("R2-04", "garde de point fixe CONSERVEE en assertion secondaire : une autorite BRUTE (non normalisee) est refusee par DOCUMENT_AUTHORITY_NOT_NORMALIZED, avant meme l'identite", async () => {
    const e = await caught(() => e2e(1, () => ({ text: reviewJson(CITE[0]) }), { documentAuthority: () => DOCS[0].content }));
    assert(e && e.code === "DOCUMENT_AUTHORITY_NOT_NORMALIZED" && e.fatal === true, "ordre des gardes : " + (e && e.code)); });

  await T("R2-05", "garde de PREFIXE, independante de la carte : sans carte canonique (appelant heritant d'une simple autorite), une autorite tronquee est encore refusee (DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE) car le contexte du prompt gele ne la prolonge pas", async () => {
    const dir = tmp(); const trunc = normOf(0).slice(0, 25);
    const adapter = EF3.createReviewAdapter({ llm: fakeLlm(() => ({ text: reviewJson(CITE[0]) })), runDir: dir, runId: "t", sealHash: SEAL.runtimeSealSha256, documentAuthority: () => trunc });   /* aucune carte : seule la garde de prefixe peut trancher */
    const tds = await F.M01.TDS.buildTargetDocumentSet("m1", [{ targetId: "target-01", label: DOCS[0].title, content: normOf(0) }]);
    const lotDoc = F.M01.TDS.getDocumentForTarget(tds, "target-01");
    const e = await caught(() => RE.runEnforcedReview({ frozen: F, twin: mkTwin(1), targetDoc: lotDoc, reviewSchema: schemaFor("target-01"), llmCall: adapter.llmCall, maxPasses: 3, onValidation: adapter.onValidation, runId: "t" }));
    assert(e && e.code === "DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE" && e.fatal === true, "refus par le prompt : " + (e && e.code));
    assert(e.promptParsedContentLength > e.documentAuthorityLength, "le contexte du prompt est plus long que l'autorite tronquee"); });

  await T("R2-06", "autorite absente ou vide : fail closed inchange (DOCUMENT_AUTHORITY_REQUIRED / _EMPTY) ; construction sans documents cibles ni autorite refusee", async () => {
    let e0 = null; try { EF3.createReviewAdapter({ llm: fakeLlm(() => ({ text: "{}" })), runDir: tmp(), runId: "t" }); } catch (x) { e0 = x; }
    assert(e0 && e0.code === "DOCUMENT_AUTHORITY_REQUIRED" && e0.fatal === true, "construction : " + (e0 && e0.code));
    const e1 = await caught(() => e2e(1, () => ({ text: reviewJson(CITE[0]) }), { documentAuthority: () => undefined }));
    assert(e1 && e1.code === "DOCUMENT_AUTHORITY_REQUIRED", "autorite absente : " + (e1 && e1.code));
    const e2 = await caught(() => e2e(1, () => ({ text: reviewJson(CITE[0]) }), { documentAuthority: () => "" }));
    assert(e2 && e2.code === "DOCUMENT_AUTHORITY_EMPTY", "autorite vide : " + (e2 && e2.code)); });

  await T("R2-07", "autorite CANONIQUE : aucune erreur d'identite, compteurs coherents ; le document contenant le marqueur du prompt reste integralement l'autorite (ecart prompt/autorite compte, jamais une troncature)", async () => {
    const MARKER = "BASE DOCUMENTAIRE DU PROFESSIONNEL"; const AFTER = "Passage situe apres le marqueur, a citer litteralement.";
    const raw = "# Fiche\r\n\r\nAvant le marqueur.\r\n\r\n" + MARKER + "\r\n{\"worksUsed\":[{\"workRef\":\"Work A\"}]}\r\n\r\n" + AFTER + "\r\n";
    const docs = [{ documentId: "dm", title: "Doc marqueur", content: raw, hashSha256: sha(raw) }];
    const dir = tmp(); const norm = TN.normalizeTargetDocument({ targetId: "target-01", label: "Doc marqueur", content: raw }).document.content;
    const adapter = EF3.createReviewAdapter({ llm: fakeLlm(() => ({ text: reviewJson(AFTER) })), runDir: dir, runId: "t", sealHash: SEAL.runtimeSealSha256, targetDocuments: docs });
    const tds = await F.M01.TDS.buildTargetDocumentSet("m1", [{ targetId: "target-01", label: "Doc marqueur", content: norm }]);
    const lotDoc = F.M01.TDS.getDocumentForTarget(tds, "target-01");
    const r = await RE.runEnforcedReview({ frozen: F, twin: mkTwin(1), targetDoc: lotDoc, reviewSchema: schemaFor("target-01"), llmCall: adapter.llmCall, maxPasses: 3, onValidation: adapter.onValidation, runId: "t" });
    const st = adapter.stats();
    assert(r.review.reviewStatus === "complete" && JSON.stringify(refsOf(r, "DIM-01")) === JSON.stringify([AFTER]), "citation apres le marqueur conservee : " + JSON.stringify(r.review.error));
    assert(adapter.authorityFor("target-01") === norm && norm.indexOf(AFTER) !== -1, "autorite integrale (aucune troncature au marqueur)");
    assert(st.authorityContextDivergences === 0 && st.authorityIdentityVerified >= 1 && st.contextContentMismatch >= 1, "compteurs : " + JSON.stringify({ d: st.authorityContextDivergences, v: st.authorityIdentityVerified, m: st.contextContentMismatch })); });

  await T("R2-08", "l'identite est verifiee A CHAQUE passe : une autorite qui devient tronquee entre la passe de base et la passe ciblee est refusee (jamais de bascule silencieuse d'autorite en cours de revue)", async () => {
    let pass = 0; const good = normOf(0), trunc = normOf(0).slice(0, 40);
    const e = await caught(() => e2e(1, (prompt, meta, n) => { pass = n; return { text: n === 1 ? JSON.stringify({ findings: DIMS.map((id) => finding(id, ["citation inventee absente du document " + id])) }) : JSON.stringify({ repairs: [{ dimensionId: "DIM-01", targetEvidenceRefs: [CITE[0]] }] }) }; },
      { documentAuthority: () => (pass >= 2 ? trunc : good) }));
    assert(e && e.code === "DOCUMENT_AUTHORITY_IDENTITY_MISMATCH" && e.fatal === true, "bascule d'autorite refusee a la passe ciblee : " + (e && e.code) + " (passes=" + pass + ")");
    assert(pass >= 2, "la passe ciblee a bien ete atteinte : " + pass); });

  /* ============================== R4 — IMPORT DE REGISTRE : TESTS COMPORTEMENTAUX ============================== */

  /** construit un run de fixture complet, puis execute REELLEMENT tools/ef03b-registry-import.js dessus (aucun appel fournisseur) */
  async function fixtureRun(opts) {
    opts = opts || {}; const dir = tmp(); const tid = "target-01"; const twin = mkTwin(1); const schema = schemaFor(tid);
    const normalized = normOf(0); const docContent = opts.rawTargetDocument ? DOCS[0].content : normalized;
    const tds = await F.M01.TDS.buildTargetDocumentSet("m1", [{ targetId: tid, label: DOCS[0].title, content: docContent }]);
    const lotDoc = F.M01.TDS.getDocumentForTarget(tds, tid);
    const basePrompt = F.M01.RR.buildReviewPrompt(twin, lotDoc, schema) + RE.enforcementPreamble(schema);
    const cite = opts.rawTargetDocument ? "Introduction du document 1, avec l’apostrophe typographique." : CITE[0];
    const findings = DIMS.map((id) => finding(id, [cite]));
    const w = (f, o) => fs.writeFileSync(path.join(dir, f), JSON.stringify(o));
    w("state.json", { runId: "efm-fixture", seal: { runtimeSealSha256: SEAL.runtimeSealSha256 } });
    w("twins.json", { twins: [twin] });
    w("target-document-set.json", tds);
    w("review-schema.json", schema);
    w("enforcement-traces.json", { reviews: [{ twinId: twin.twinId, targetId: tid, acceptedPass: 1, passes: [{ reviewPass: 1, promptSha256: sha(basePrompt) }] }] });
    w("reviews.json", { reviews: [{ twinId: twin.twinId, targetId: tid, reviewStatus: "complete", findings: findings }] });
    fs.writeFileSync(path.join(dir, "cost-ledger.jsonl"), JSON.stringify({ callId: "c1", attemptId: 1 }) + "\n");
    return { dir, tid, twin, schema, normalized, lotDoc, basePromptSha256: sha(basePrompt) };
  }

  await T("R4-01", "[COMPORTEMENTAL] importRun sur un run de fixture : l'entree ecrite porte l'empreinte du document NORMALISE et la cible — aucune assertion de texte source", async () => {
    const f = await fixtureRun(); const out = IMP.importRun(f.dir, {});
    assert(out.imported.length === 1 && out.refused.length === 0, "import : " + JSON.stringify({ i: out.imported.length, r: out.refused }));
    const entries = EF3.createReviewRegistry({ runDir: f.dir }).list();
    assert(entries.length === 1 && entries[0].documentAuthoritySha256 === sha(f.normalized), "empreinte = document normalise : " + JSON.stringify(entries[0] && entries[0].documentAuthoritySha256));
    assert(entries[0].documentAuthoritySha256 !== sha(DOCS[0].content), "jamais l'empreinte du brut");
    assert(entries[0].targetId === f.tid && entries[0].basePromptSha256 === f.basePromptSha256 && entries[0].validationContract === CONTRACT && entries[0].sourceSealHash === SEAL.runtimeSealSha256, "cle complete : cible, prompt de passe 1, contrat, sceau"); });

  await T("R4-02", "[COMPORTEMENTAL — tue le mutant M4c] document d'autorite NON normalise dans le run : l'import s'arrete (REGISTRY_IMPORT_AUTHORITY_NOT_NORMALIZED) ; une garde neutralisee en conservant son texte source ferait passer l'import", async () => {
    const f = await fixtureRun({ rawTargetDocument: true });
    assert(TN.normalizeText(f.lotDoc.content).normalized !== f.lotDoc.content, "prealable : le document du run n'est pas normalise");
    let e = null; try { IMP.importRun(f.dir, {}); } catch (x) { e = x; }
    assert(e && e.code === "REGISTRY_IMPORT_AUTHORITY_NOT_NORMALIZED", "import refuse : " + (e && (e.code || e.message))); });

  await T("R4-03", "[COMPORTEMENTAL] fail closed : apres le refus, AUCUNE entree n'a ete ecrite au registre du run", async () => {
    const f = await fixtureRun({ rawTargetDocument: true });
    try { IMP.importRun(f.dir, {}); } catch (x) { /* attendu */ }
    assert(EF3.createReviewRegistry({ runDir: f.dir }).list().length === 0 && !fs.existsSync(path.join(f.dir, "reviews-valid.jsonl")), "registre vide"); });

  await T("R4-04", "[COMPORTEMENTAL] l'entree importee n'est servie que sous SON autorite ET SA cible ; jamais sous une autre", async () => {
    const f = await fixtureRun(); IMP.importRun(f.dir, {});
    const reg = EF3.createReviewRegistry({ runDir: f.dir });
    assert(reg.find(f.basePromptSha256, SEAL.runtimeSealSha256, CONTRACT, sha(f.normalized), f.tid), "servie sous son autorite et sa cible");
    assert(reg.find(f.basePromptSha256, SEAL.runtimeSealSha256, CONTRACT, sha(normOf(1)), f.tid) === null, "jamais sous une autre autorite");
    assert(reg.find(f.basePromptSha256, SEAL.runtimeSealSha256, CONTRACT, sha(f.normalized), "target-02") === null, "jamais sous une autre cible");
    assert(reg.find(f.basePromptSha256, "z".repeat(64), CONTRACT, sha(f.normalized), f.tid) === null, "jamais sous un autre sceau");
    assert(reg.find(f.basePromptSha256, SEAL.runtimeSealSha256, "MONO-11-v2", sha(f.normalized), f.tid) === null, "jamais sous un autre contrat"); });

  await T("R4-05", "[COMPORTEMENTAL] --dry-run n'ecrit rien ; un second import est idempotent (aucun doublon) ; un run produit sous un autre sceau est refuse", async () => {
    const f1 = await fixtureRun(); const dry = IMP.importRun(f1.dir, { dryRun: true });
    assert(dry.imported.length === 1 && EF3.createReviewRegistry({ runDir: f1.dir }).list().length === 0, "dry-run : rien ecrit");
    const f2 = await fixtureRun(); IMP.importRun(f2.dir, {}); const again = IMP.importRun(f2.dir, {});
    assert(again.imported.length === 0 && again.skipped.length === 1 && EF3.createReviewRegistry({ runDir: f2.dir }).list().length === 1, "idempotent : " + JSON.stringify({ i: again.imported.length, s: again.skipped.length }));
    const f3 = await fixtureRun(); fs.writeFileSync(path.join(f3.dir, "state.json"), JSON.stringify({ runId: "efm-fixture", seal: { runtimeSealSha256: "a".repeat(64) } }));
    let e = null; try { IMP.importRun(f3.dir, {}); } catch (x) { e = x; }
    assert(e && e.code === "REGISTRY_IMPORT_SEAL_MISMATCH", "sceau etranger refuse : " + (e && e.code)); });
};
