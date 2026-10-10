"use strict";
/**
 * EvidenceForge MONOLITH v1.0.14 — test/test-v1014-e2e-wiring.js : E2E DU CABLAGE REEL (RA2-E2E-01…08) + MUTATION MATRIX (M1…M5) + REGISTRY IMPORT (RI-01…07).
 * Charge par test/test-ef03b.js. Aucun reseau, aucun fournisseur.
 *
 * MOTIF (B3 de l'audit independant v1.0.13) : les tests RA2 de la candidate rejetee injectaient `documentAuthority: () => doc.content`
 * et court-circuitaient `lib/pipeline.js` ; une mutation du cablage passait inapercue (303/303 avec un index decale et une autorite tronquee).
 *
 * v1.0.15 (R1) : le cablage de production ne fabrique plus de table d'autorite et ne fournit plus de lambda — il remet a l'adaptateur le jeu
 * de documents cibles (`targetDocuments: targetDocs`), le MEME objet que celui remis au lot gele. Ces tests construisent donc l'adaptateur
 * EXACTEMENT comme la production et lisent l'autorite effectivement utilisee (adapter.authorityFor) : il n'y a plus de ligne de cablage a
 * extraire, et la classe de defaut « autorite d'une autre cible » n'est plus exprimable (gardes d'identite, cf. test-v1015).
 */
const fs = require("fs"), path = require("path");
module.exports = async function (h) {
  const { T, assert, tmp, sha, P } = h;
  const EF3 = require("../lib/ef03b-resilience.js"); const SP = require("../lib/stage-professionals.js");
  const RE = require(path.join(P.MONO11, "core", "review-enforcer.js")); const TN = require(path.join(P.MONO11, "core", "target-normalizer.js"));
  const { F, SEAL } = SP.loadSealedMono11();
  console.log("\n— v1.0.14 : E2E CABLAGE REEL + MUTATION MATRIX + REGISTRY IMPORT —");
  /* ---------- CABLAGE REEL : la production construit l'adaptateur avec les documents cibles ; l'autorite est celle qu'il derive ---------- */
  const PIPE_SRC = fs.readFileSync(path.join(P.ROOT, "lib", "pipeline.js"), "utf8");
  /** rend la table { targetId: autorite } telle que l'adaptateur de PRODUCTION la derive des documents cibles du run */
  function wiredAuthorities(targetDocs) {
    const a = EF3.createReviewAdapter({ llm: { model: "probe", async llmCall() { throw new Error("AUCUN APPEL"); }, onValidation() {} }, runDir: tmp(), runId: "probe", targetDocuments: targetDocs });
    const out = {}; a.canonicalTargetIds.forEach((tid) => { out[tid] = a.authorityFor(tid); }); return out;
  }
  const DIMS = ["DIM-01", "DIM-02", "DIM-03"];
  const schema = { schema: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1", stage: "EF-03A", missionQuestion: "Question de mission.", dimensions: DIMS.map((id, i) => ({ id, label: "Dimension " + (i + 1), definition: "Definition " + (i + 1) + "." })), reviewTargets: [{ targetId: "target-01" }], schemaHash: sha("schema") };
  const mkTwin = (i) => ({ twinId: "twin-" + i, professionalRef: "pro-" + i, referenceIdentity: { displayName: "P" + i }, documentaryBasis: { worksUsed: [{ workRef: "Work A", title: "Work A" }], dimensionCoverage: {} } });
  const finding = (id, refs) => ({ dimensionId: id, disposition: "support", epistemicStatus: "documented", finding: "Constat " + id + ".", rationale: "Justification " + id + ".", targetEvidenceRefs: refs, twinBasisWorkRefs: ["Work A"], confidenceQualitative: "medium", limitations: ["Limite " + id] });
  const reviewJson = (byDim, dflt) => JSON.stringify({ findings: DIMS.map((id) => finding(id, byDim[id] || [dflt])) });
  const fakeLlm = (handler) => { const calls = []; let n = 0; return { calls, model: "fake", async llmCall(prompt, meta) { n++; const r = await handler(prompt, meta, n); calls.push({ prompt, meta, text: r.text }); return { text: r.text, callId: "c" + n + "-" + sha(r.text).slice(0, 12), providerRequestId: "f" + n, modelId: "fake", providerId: "fake", usage: { input_tokens: 10, output_tokens: 10 }, stopReason: "end_turn", reused: false }; }, onValidation() {}, recordReuse() {} }; };
  /**
   * E2E : documents BRUTS -> normalisation MONO-11 (comme autonomous-run.js) -> targetDocumentSet gele -> adaptateur cable comme en production
   * -> runEnforcedReview du lot -> registre. Rend le resultat, l'autorite cablee et le document reellement examine par le lot.
   */
  async function e2e(rawDocs, targetIndex, handler, opts) {
    const targetDocs = rawDocs.map((d, i) => ({ documentId: "d" + i, title: d.title, content: d.content, hashSha256: sha(d.content) }));
    const authorities = wiredAuthorities(targetDocs);                                  /* cablage LIVRE */
    const normalization = targetDocs.map((t, i) => TN.normalizeTargetDocument({ targetId: "target-" + String(i + 1).padStart(2, "0"), label: t.title, content: t.content }));
    const tds = await F.M01.TDS.buildTargetDocumentSet("m1", normalization.map((n) => n.document));   /* meme chaine que le lot gele */
    const targetId = "target-" + String(targetIndex).padStart(2, "0");
    const lotDoc = F.M01.TDS.getDocumentForTarget(tds, targetId);                      /* document REELLEMENT examine par MONO-11 */
    const d = tmp(); const llm = fakeLlm(handler);
    const adapter = EF3.createReviewAdapter(Object.assign({ llm, runDir: d, runId: "t", attemptId: 1, sealHash: SEAL.runtimeSealSha256, config: { maxTokens: 12288, excerptChars: 40 }, twinsTotal: () => 1,
      targetDocuments: targetDocs }, opts || {}));   /* v1.0.15 : cablage de production a l'identique (aucune lambda) */
    const r = await RE.runEnforcedReview({ frozen: F, twin: mkTwin(1), targetDoc: lotDoc, reviewSchema: Object.assign({}, schema, { reviewTargets: [{ targetId: targetId }] }), llmCall: adapter.llmCall, maxPasses: 3, onValidation: adapter.onValidation, runId: "t" });
    return { r, adapter, dir: d, llm, authorities, authority: authorities[targetId], lotDoc, registry: adapter.registry.list(), stats: adapter.stats(),
      trace: fs.existsSync(path.join(d, EF3.TRACE_FILE)) ? fs.readFileSync(path.join(d, EF3.TRACE_FILE), "utf8").trim().split("\n").map(JSON.parse) : [] };
  }
  const refsOf = (r, id) => r.review.findings.find((f) => f.dimensionId === id).targetEvidenceRefs;
  /* ---------- fixtures de normalisation : la citation n'existe QUE dans le document normalise ---------- */
  const CASES = [
    { id: "RA2-E2E-01", name: "typographic apostrophe", raw: "# Fiche\n\nLa fiche demande ce qui devient difficile et l’activite qu’elle decrit.\n", cite: "La fiche demande ce qui devient difficile et l'activite qu'elle decrit." },
    { id: "RA2-E2E-02", name: "NBSP", raw: "# Fiche\n\nUn espace insecable et un autre espace fin dans la meme phrase.\n", cite: "Un espace insecable et un autre espace fin dans la meme phrase." },
    { id: "RA2-E2E-03", name: "CRLF", raw: "# Fiche\r\n\r\nPremiere ligne du document.\r\nSeconde ligne du document.\r\n", cite: "Premiere ligne du document.\nSeconde ligne du document." },
    { id: "RA2-E2E-04", name: "Unicode NFC", raw: "# Fiche\n\nUne cita" + "t" + "ion avec un é decompose et un ç decompose.\n", cite: "Une citation avec un é decompose et un ç decompose." },
  ];
  for (const c of CASES) {
    await T(c.id, c.name + " : le lot examine le document NORMALISE ; l'autorite cablee est identique (parite de hash) et la citation issue du document normalise est jugee litterale des deux cotes", async () => {
      const normalized = TN.normalizeTargetDocument({ targetId: "target-01", content: c.raw }).document.content;
      assert(normalized !== c.raw, c.id + " : le brut differe du normalise");
      assert(normalized.indexOf(c.cite) !== -1 && c.raw.indexOf(c.cite) === -1, c.id + " : la citation n'existe que dans le normalise");
      const o = await e2e([{ title: "Doc", content: c.raw }], 1, () => ({ text: reviewJson({ "DIM-01": [c.cite] }, c.cite) }));
      assert(sha(o.authority) === sha(o.lotDoc.content), "PARITE : autorite cablee == document examine par MONO-11 (" + sha(o.authority).slice(0, 12) + " vs " + sha(o.lotDoc.content).slice(0, 12) + ")");
      assert(o.authority !== c.raw, "l'autorite n'est JAMAIS le contenu brut");
      assert(o.r.review.reviewStatus === "complete" && o.r.trace.acceptedPass === 1, c.id + " : acceptee passe 1 : " + JSON.stringify(o.r.review.error));
      assert(JSON.stringify(refsOf(o.r, "DIM-01")) === JSON.stringify([c.cite]), c.id + " : citation conservee");
      assert(o.registry.length === 1 && o.registry[0].documentAuthoritySha256 === sha(o.lotDoc.content), c.id + " : empreinte du registre = document normalise"); });
  }
  const MARKER = "BASE DOCUMENTAIRE DU PROFESSIONNEL"; const JSONLINE = "{\"worksUsed\":[{\"workRef\":\"Work A\"}]}";
  const AFTER = "Passage situe apres le marqueur, a citer litteralement.";
  await T("RA2-E2E-05", "embedded marker + JSON line : le document cible contient le marqueur du prompt suivi d'une structure ressemblante — aucune troncature de l'autorite, citation apres le marqueur conservee", async () => {
    const raw = "# Fiche\n\nAvant le marqueur.\n\n" + MARKER + "\n" + JSONLINE + "\n\n" + AFTER + "\n";
    const o = await e2e([{ title: "Doc", content: raw }], 1, () => ({ text: reviewJson({ "DIM-02": [AFTER] }, "Avant le marqueur.") }));
    assert(sha(o.authority) === sha(o.lotDoc.content), "parite autorite / document du lot");
    assert(o.authority.indexOf(AFTER) !== -1, "autorite NON tronquee au marqueur");
    assert(o.r.review.reviewStatus === "complete" && JSON.stringify(refsOf(o.r, "DIM-02")) === JSON.stringify([AFTER]), "citation apres marqueur conservee : " + JSON.stringify([o.r.review.reviewStatus, refsOf(o.r, "DIM-02")]));
    assert(o.stats.contextContentMismatch >= 1, "ecart prompt / autorite compte : " + o.stats.contextContentMismatch);
    assert(o.trace.some((t) => t.strategy === "DOCUMENT_AUTHORITY_MISMATCH"), "ecart trace"); });
  await T("RA2-E2E-06", "marker alone : meme garantie (contexte du prompt illisible) — aucune troncature, citation conservee, aucun jugement sur une reconstruction", async () => {
    const raw = "# Fiche\n\nAvant le marqueur.\n\n" + MARKER + " (mention interne)\n\n" + AFTER + "\n";
    const o = await e2e([{ title: "Doc", content: raw }], 1, () => ({ text: reviewJson({ "DIM-02": [AFTER] }, "Avant le marqueur.") }));
    assert(sha(o.authority) === sha(o.lotDoc.content), "parite autorite / document du lot");
    assert(o.r.review.reviewStatus === "complete" && JSON.stringify(refsOf(o.r, "DIM-02")) === JSON.stringify([AFTER]), "citation conservee"); });
  await T("RA2-E2E-07", "wrong target index : le cablage doit associer CHAQUE targetId a SON document (3 documents distincts) ; une association decalee est detectee", async () => {
    const docs = [{ title: "D1", content: "# D1\n\nCitation propre au premier document.\n" }, { title: "D2", content: "# D2\n\nCitation propre au deuxieme document.\n" }, { title: "D3", content: "# D3\n\nCitation propre au troisieme document.\n" }];
    const targetDocs = docs.map((d, i) => ({ documentId: "d" + i, title: d.title, content: d.content, hashSha256: sha(d.content) }));
    const auth = wiredAuthorities(targetDocs);
    docs.forEach((d, i) => { const tid = "target-" + String(i + 1).padStart(2, "0"); const expected = TN.normalizeTargetDocument({ targetId: tid, content: d.content }).document.content;
      assert(auth[tid] === expected, tid + " : autorite = document " + (i + 1) + " normalise (cablage correct)");
      docs.forEach((other, j) => { if (j !== i) assert(auth[tid].indexOf("Citation propre au " + ["premier", "deuxieme", "troisieme"][j] + " document.") === -1, tid + " : ne contient pas le document " + (j + 1)); }); });
    /* bout en bout sur la cible 2 et la cible 3 : le lot et l'adaptateur voient le meme document */
    for (const idx of [2, 3]) { const o = await e2e(docs, idx, () => ({ text: reviewJson({}, "Citation propre au " + ["premier", "deuxieme", "troisieme"][idx - 1] + " document.") }));
      assert(sha(o.authority) === sha(o.lotDoc.content), "target-0" + idx + " : parite autorite / document du lot");
      assert(o.r.review.reviewStatus === "complete", "target-0" + idx + " : revue acceptee : " + JSON.stringify(o.r.review.error)); } });
  await T("RA2-E2E-08", "raw / truncated / absent authority : les trois sont REFUSEES (fail closed) — v1.0.14 ACCEPTAIT l'autorite tronquee (point fixe) en se contentant de la compter et de la tracer ; v1.0.15 l'arrete par identite et n'ecrit rien", async () => {
    const raw = "# Fiche\n\nCitation avec l\u2019apostrophe typographique du document.\n"; const cite = "Citation avec l'apostrophe typographique du document.";
    const normalized = TN.normalizeTargetDocument({ targetId: "target-01", content: raw }).document.content;
    const caught = async (opts) => { try { await e2e([{ title: "Doc", content: raw }], 1, () => ({ text: reviewJson({ "DIM-01": [cite] }, cite) }), opts); return null; } catch (x) { return x; } };
    /* reference : cablage de production, aucune divergence */
    const ok = await e2e([{ title: "Doc", content: raw }], 1, () => ({ text: reviewJson({ "DIM-01": [cite] }, cite) }));
    assert(ok.stats.contextContentMismatch === 0 && sha(ok.authority) === sha(ok.lotDoc.content) && ok.registry.length === 1, "reference : autorite canonique, 0 ecart, 1 entree");
    /* autorite BRUTE : garde de point fixe (conservee de v1.0.14) */
    const e1 = await caught({ documentAuthority: () => raw });
    assert(e1 && e1.code === "DOCUMENT_AUTHORITY_NOT_NORMALIZED" && e1.fatal === true, "brute refusee : " + (e1 && e1.code));
    /* autorite TRONQUEE mais NORMALISEE : point fixe => acceptee en v1.0.14, refusee ici par IDENTITE, et AUCUNE entree de registre n'est ecrite */
    const trunc = normalized.slice(0, 20); assert(TN.normalizeText(trunc).normalized === trunc, "prealable : la troncature est un point fixe");
    const d = tmp(); const e2 = await (async () => { try { await e2e([{ title: "Doc", content: raw }], 1, () => ({ text: reviewJson({ "DIM-01": [cite] }, cite) }), { documentAuthority: () => trunc, runDir: d }); return null; } catch (x) { return x; } })();
    assert(e2 && e2.code === "DOCUMENT_AUTHORITY_IDENTITY_MISMATCH" && e2.fatal === true, "tronquee refusee : " + (e2 && e2.code));
    assert(EF3.createReviewRegistry({ runDir: d }).list().length === 0, "aucune entree ecrite sous autorite tronquee (v1.0.14 en inscrivait une, porteuse d'une empreinte tronquee)");
    /* autorite ABSENTE */
    const e3 = await caught({ documentAuthority: () => undefined });
    assert(e3 && e3.code === "DOCUMENT_AUTHORITY_REQUIRED" && e3.fatal === true, "absente refusee : " + (e3 && e3.code)); });

  /* ---------- REGISTRY IMPORT (B4) ---------- */
  const IMP = require("../tools/ef03b-registry-import.js");
  await T("RI-01..RI-03", "[SOURCE_TEXT_ASSERTION, sans valeur comportementale — couverture comportementale : R4-01..R4-05] import de registre : l'empreinte est calculee sur le document NORMALISE (jamais le brut) ; autorite manquante ou non normalisee => IMPORT FAIL CLOSED", () => {
    const src = fs.readFileSync(path.join(P.ROOT, "tools", "ef03b-registry-import.js"), "utf8");
    assert(/documentAuthoritySha256: authoritySha\(doc\)/.test(src), "RI-01 : chaque entree importee porte l'empreinte d'autorite");
    assert(/REGISTRY_IMPORT_AUTHORITY_MISSING/.test(src) && /REGISTRY_IMPORT_AUTHORITY_NOT_NORMALIZED/.test(src), "RI-03 : fail closed si l'autorite manque ou n'est pas normalisee");
    assert(/TN\.normalizeText\(c\)\.normalized !== c/.test(src), "RI-02 : l'empreinte n'est acceptee que sur un contenu normalise (jamais le brut)");
    /* le jeu de documents cibles persiste par un run EST le jeu normalise (produit par MONO-11) : l'import s'y refere */
    assert(/getDocumentForTarget/.test(src), "RI-02 : le document d'autorite vient du targetDocumentSet du run"); });
  await T("RI-04..RI-07", "registre : empreinte differente, empreinte absente, ancien contrat, ancien sceau => jamais servis ; empreinte et contrat et sceau courants => servi", () => {
    const d = tmp(); const reg = EF3.createReviewRegistry({ runDir: d }); const CT = P.CONFIG.frozenLots["MONO-11"].contractVersion; const cand = reviewJson({}, "x"); const key = "k".repeat(64);
    const A = sha("autorite-courante"), B = sha("autre-autorite");
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: CT, sourceSealHash: SEAL.runtimeSealSha256 });
    assert(reg.find(key, SEAL.runtimeSealSha256, CT, A) === null, "RI-05 : entree sans empreinte refusee");
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: CT, sourceSealHash: SEAL.runtimeSealSha256, documentAuthoritySha256: B });
    assert(reg.find(key, SEAL.runtimeSealSha256, CT, A) === null, "RI-04 : empreinte differente refusee");
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: "MONO-11-v2", sourceSealHash: SEAL.runtimeSealSha256, documentAuthoritySha256: A });
    assert(reg.find(key, SEAL.runtimeSealSha256, CT, A) === null, "RI-06 : ancien contrat refuse");
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: CT, sourceSealHash: "z".repeat(64), documentAuthoritySha256: A });
    assert(reg.find(key, SEAL.runtimeSealSha256, CT, A) === null, "RI-07 : ancien sceau refuse");
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: CT, sourceSealHash: SEAL.runtimeSealSha256, documentAuthoritySha256: A });
    const hit = reg.find(key, SEAL.runtimeSealSha256, CT, A); assert(hit && hit.documentAuthoritySha256 === A, "RI-01 : entree courante servie"); });
};
