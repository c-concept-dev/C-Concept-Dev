"use strict";
/**
 * EvidenceForge MONOLITH v1.0.12 — test/test-v1012-lineage-parity.js : GLOBAL LINEAGE PRESERVATION (V12-01…V12-18).
 * Charge par test/test-ef03b.js. Aucun reseau, aucun fournisseur : lot gele MONO-11 v0.4 (review-enforcer, runEnforcedReview) et parseur
 * EF-03B gele (MONO-01) executes REELLEMENT, adaptateur v1.0.12 branche sur un LLM factice scripte.
 * Objet : parite MIROIR (adaptateur) == LOT (MONO-11 v0.4) sur la lignee (R5 de l'audit independant v1.0.11), contrat MONO-11-v3 (R6),
 * fail-closed inter-sceau / inter-contrat (registre, import), et non-regression semantique.
 */
const fs = require("fs"), path = require("path"), os = require("os");
module.exports = async function (h) {
  const { T, assert, tmp, sha, P } = h;
  const EF3 = require("../lib/ef03b-resilience.js"); const SP = require("../lib/stage-professionals.js");
  const RE = require(path.join(P.MONO11, "core", "review-enforcer.js")); const { F, SEAL } = SP.loadSealedMono11();
  console.log("\n— v1.0.12 : GLOBAL LINEAGE PRESERVATION (miroir == lot MONO-11 v0.4) —");
  const TN14 = require(path.join(P.MONO11, "core", "target-normalizer.js"));   /* v1.0.14 : autorite = contenu NORMALISE (celui que MONO-11 examine) */
  const DIMS = ["DIM-01", "DIM-02", "DIM-03"];
  const DOC = "# Fiche de recueil\n\nIntroduction generale du document cible.\n\n**Attention :** ne pas transformer ces distinctions en categories definitives.\n\nLa fiche permet de recueillir librement les activites realisees.\n\nConclusion : la structure reste prudente et generique.\n";
  const AUTHORITY = TN14.normalizeTargetDocument({ targetId: "target-01", content: DOC }).document.content;
  const VALID_A = "La fiche permet de recueillir librement les activites realisees.", VALID_B = "Conclusion : la structure reste prudente et generique.", VALID_C = "Introduction generale du document cible.";
  const INVALID_B = "Attention : ne pas transformer ces distinctions en categories definitives.";   /* marqueurs Markdown retires */
  const mkDoc = () => ({ targetId: "target-01", label: "Document", role: "review_target_not_evidence", content: DOC, sourceDocumentRef: sha(DOC) });
  const mkTwin = (i) => ({ twinId: "twin-" + i, professionalRef: "pro-" + i, referenceIdentity: { displayName: "Professionnel " + i }, documentaryBasis: { worksUsed: ["Work A " + i, "Work B " + i].map((w) => ({ workRef: w, title: w })), dimensionCoverage: {} } });
  const schema = { schema: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1", stage: "EF-03A", missionQuestion: "Question de mission de test.", dimensions: DIMS.map((id, i) => ({ id, label: "Dimension " + (i + 1), definition: "Definition de la dimension " + (i + 1) + "." })), reviewTargets: [{ targetId: "target-01" }], schemaHash: sha("schema") };
  const finding = (id, i, refs) => ({ dimensionId: id, disposition: "support", epistemicStatus: "documented", finding: "Constat pour " + id + ".", rationale: "Justification pour " + id + ".", targetEvidenceRefs: refs, twinBasisWorkRefs: ["Work A " + i], confidenceQualitative: "medium", limitations: ["Limite " + id] });
  const reviewJson = (i, byDim) => JSON.stringify({ findings: DIMS.map((id) => finding(id, i, byDim[id] || [VALID_A])) });
  const repairJson = (rep) => JSON.stringify({ repairs: Object.keys(rep).map((d) => ({ dimensionId: d, targetEvidenceRefs: rep[d] })) });
  function fakeLlm(handler) { const calls = [], validations = []; let n = 0;
    return { calls, validations, model: "fake-model", async llmCall(prompt, meta) { n++; const r = await handler(prompt, meta, n); calls.push({ prompt, meta, text: r.text }); return { text: r.text, callId: "c" + n + "-" + sha(r.text).slice(0, 12), providerRequestId: "fake-" + n, modelId: "fake-model", providerId: "fake", usage: { input_tokens: 10, output_tokens: 10 }, stopReason: "end_turn", reused: false }; }, onValidation(v) { validations.push(v); }, recordReuse() {} }; }
  /** execute une revue complete a travers l'ADAPTATEUR (miroir) et rend le candidat inscrit au registre + la revue acceptee */
  const viaAdapter = async (i, raw, repairs) => { const d = tmp(); const llm = fakeLlm((prompt, meta) => meta.strategy && /TARGETED/.test(meta.strategy) ? { text: repairJson(repairs) } : { text: raw });
    const adapter = EF3.createReviewAdapter({ llm, runDir: d, runId: "t", attemptId: 1, sealHash: SEAL.runtimeSealSha256, config: { maxTokens: 12288, excerptChars: 40, enableLiteralization: false }, twinsTotal: () => 1, targetDocuments: [{ targetId: "target-01", title: "Document", content: DOC }] });
    const r = await RE.runEnforcedReview({ frozen: F, twin: mkTwin(i), targetDoc: mkDoc(), reviewSchema: schema, llmCall: adapter.llmCall, maxPasses: 3, onValidation: adapter.onValidation, runId: "t" });
    return { r, adapter, dir: d, registry: adapter.registry.list(), trace: fs.existsSync(path.join(d, EF3.TRACE_FILE)) ? fs.readFileSync(path.join(d, EF3.TRACE_FILE), "utf8").trim().split("\n").map(JSON.parse) : [] }; };
  /** meme scenario SANS adaptateur : le lot gele seul (reference de parite) */
  const viaLot = async (i, raw, repairs) => { const llm = fakeLlm((prompt, meta) => meta.strategy && /TARGETED/.test(meta.strategy) ? { text: repairJson(repairs) } : { text: raw });
    const r = await RE.runEnforcedReview({ frozen: F, twin: mkTwin(i), targetDoc: mkDoc(), reviewSchema: schema, llmCall: llm.llmCall, maxPasses: 3, runId: "t" }); return { r }; };
  const refsOf = (r, id) => r.review.findings.find((f) => f.dimensionId === id).targetEvidenceRefs;
  const parity = async (label, i, byDim, repairs) => { const raw = reviewJson(i, byDim); const A = await viaAdapter(i, raw, repairs), L = await viaLot(i, raw, repairs);   /* meme jumeau : les twinBasisWorkRefs du brut doivent rester connus du validateur */
    assert((A.r.review.reviewStatus) === (L.r.review.reviewStatus), label + " : meme statut (miroir " + A.r.review.reviewStatus + " / lot " + L.r.review.reviewStatus + ")");
    assert((A.r.trace.acceptedPass) === (L.r.trace.acceptedPass), label + " : meme passe acceptee");
    if (A.r.review.reviewStatus === "complete") DIMS.forEach((d) => assert((JSON.stringify(refsOf(A.r, d))) === (JSON.stringify(refsOf(L.r, d))), label + " / " + d + " : miroir " + JSON.stringify(refsOf(A.r, d)) + " vs lot " + JSON.stringify(refsOf(L.r, d))));
    return { A, L }; };

  await T("V12-01", "lot gele MONO-11 v0.4 charge : version, sceau, runCodeHash, contrat MONO-11-v3 ; zip canonique verifie ; 0 divergence sur les lots composes", () => {
    assert((SEAL.mono11Version) === ("v0.4"), "version scellee : " + SEAL.mono11Version); assert((SEAL.runtimeSealSha256) === ("110db4de24709926d4a5fb6d0e951530f0afc2c1c807a09127852a92aa182c3d")); assert((SEAL.runCodeHash) === ("27610c84502104b3dc9643a9cc0289aef4ae40ae65ee34e4fe82f31a73e381ad"));
    assert((P.CONFIG.frozenLots["MONO-11"].contractVersion) === ("MONO-11-v3")); assert((require(path.join(P.MONO11, "contracts", "mono11-contracts.json")).contractVersion) === ("MONO-11-v3"));
    const lots = P.verifyFrozenLots(); Object.keys(lots).forEach((k) => assert((lots[k].divergences.length) === (0), k)); assert((typeof RE.mergeRepairLineage) === ("function")); assert((typeof RE.partitionRefsOf) === ("function")); });

  await T("V12-02", "MIRROR PARITY (R5) : valide + invalide + reparation valide — le candidat du miroir est byte-identique a celui du lot ; les deux conservent la reference originale litterale", async () => {
    const { A } = await parity("V12-02", 1, { "DIM-02": [VALID_A, INVALID_B] }, { "DIM-02": [VALID_B] });
    assert(JSON.stringify(refsOf(A.r, "DIM-02")) === JSON.stringify([VALID_A, VALID_B])); assert((A.registry.length) === (1));
    const cand = JSON.parse(A.registry[0].candidate); assert(JSON.stringify(cand.findings.find((f) => f.dimensionId === "DIM-02").targetEvidenceRefs) === JSON.stringify([VALID_A, VALID_B]), "le registre inscrit le candidat AVEC la conservee (v1.0.11 l'amputait)"); });

  await T("V12-03", "MIRROR PARITY : le modele omet la reference valide (ne rend que le remplacement) — miroir == lot, la valide survit des deux cotes", async () => {
    const { A, L } = await parity("V12-03", 2, { "DIM-01": [VALID_A, INVALID_B] }, { "DIM-01": [VALID_C] });
    assert(JSON.stringify(refsOf(A.r, "DIM-01")) === JSON.stringify([VALID_A, VALID_C])); assert(JSON.stringify(refsOf(L.r, "DIM-01")) === JSON.stringify([VALID_A, VALID_C])); });

  await T("V12-04", "CAS A PARITY : raw [] — aucune reparation declenchee, [] conserve, miroir == lot", async () => {
    const { A } = await parity("V12-04", 3, { "DIM-03": [] }, {}); assert(JSON.stringify(refsOf(A.r, "DIM-03")) === JSON.stringify([])); assert((A.r.trace.acceptedPass) === (1)); });

  await T("V12-05", "CAS B PARITY : raw non vide, aucune valide, reparation [] — miroir ET lot en erreur (fail-closed), jamais un [] silencieux ; le registre reste vide", async () => {
    const { A, L } = await parity("V12-05", 4, { "DIM-02": [INVALID_B] }, { "DIM-02": [] });
    assert((A.r.review.reviewStatus) === ("error")); assert((L.r.review.reviewStatus) === ("error")); assert((A.registry.length) === (0), "aucune revue en erreur au registre");
    const inv = A.trace.filter((t) => t.state === "CANDIDATE_INVALID" || t.state === "PASSTHROUGH"); assert(inv.length >= 1, "passes tracees"); });

  await T("V12-06", "reparation renvoyant une reference non litterale : ecartee des deux cotes ; la conservee reste ; miroir == lot", async () => {
    const { A } = await parity("V12-06", 5, { "DIM-02": [VALID_A, INVALID_B] }, { "DIM-02": ["", "citation inventee absente"] });
    assert(JSON.stringify(refsOf(A.r, "DIM-02")) === JSON.stringify([VALID_A])); });

  await T("V12-07", "doublons et sous-ensembles : dedup stable, ordre brut puis modele ; miroir == lot", async () => {
    const { A } = await parity("V12-07", 6, { "DIM-02": [VALID_A, INVALID_B] }, { "DIM-02": [VALID_A, VALID_B, VALID_B] }); assert(JSON.stringify(refsOf(A.r, "DIM-02")) === JSON.stringify([VALID_A, VALID_B])); });

  await T("V12-08", "non-regression semantique : sur les scenarios de parite, seuls targetEvidenceRefs different du brut ; disposition / epistemicStatus / finding / rationale / confidence / limitations / twinBasisWorkRefs byte-identiques", async () => {
    const raw = reviewJson(7, { "DIM-01": [VALID_C, INVALID_B], "DIM-02": [VALID_A, INVALID_B], "DIM-03": [INVALID_B] }); const before = JSON.parse(raw).findings;
    const A = await viaAdapter(7, raw, { "DIM-01": [VALID_B], "DIM-02": [VALID_B], "DIM-03": [VALID_B] });
    assert((A.r.review.reviewStatus) === ("complete"));
    before.forEach((b) => { const a = A.r.review.findings.find((x) => x.dimensionId === b.dimensionId); Object.keys(b).forEach((k) => { if (k !== "targetEvidenceRefs") assert((JSON.stringify(a[k])) === (JSON.stringify(b[k])), b.dimensionId + "." + k); }); }); });

  await T("V12-09", "contrat courant (R6) : lib/llm.js et l'adaptateur lisent MONO-11-v3 depuis la configuration du lot gele ; plus aucun epinglage MONO-11-v2 normatif dans lib/ ni tools/", () => {
    const srcLlm = fs.readFileSync(path.join(P.ROOT, "lib", "llm.js"), "utf8"), srcAd = fs.readFileSync(path.join(P.ROOT, "lib", "ef03b-resilience.js"), "utf8"), srcImp = fs.readFileSync(path.join(P.ROOT, "tools", "ef03b-registry-import.js"), "utf8");
    [["lib/llm.js", srcLlm], ["lib/ef03b-resilience.js", srcAd], ["tools/ef03b-registry-import.js", srcImp]].forEach(([n, s]) => assert(/=\s*"MONO-11-v[0-9]"/.test(s) === false, n + " : contrat epingle en dur (il doit venir de la configuration du lot gele)"));
    const readsConfig = (x) => /frozenLots\["MONO-11"\][^;\n]*contractVersion/.test(x); assert(readsConfig(srcLlm) && readsConfig(srcAd) && readsConfig(srcImp), "contrat lu dans la configuration du lot gele"); });

  await T("V12-10", "registre : une entree d'un autre contrat ou d'un autre sceau n'est JAMAIS servie (fail-closed) ; l'entree courante l'est", async () => {
    const d = tmp(); const reg = EF3.createReviewRegistry({ runDir: d }); const cand = reviewJson(8, {});
    reg.put({ basePromptSha256: "p".repeat(64), candidateSha256: sha(cand), candidate: cand, validationContract: "MONO-11-v2", sourceSealHash: SEAL.runtimeSealSha256 });
    reg.put({ basePromptSha256: "q".repeat(64), candidateSha256: sha(cand), candidate: cand, validationContract: "MONO-11-v3", sourceSealHash: "z".repeat(64) });
    reg.put({ basePromptSha256: "r".repeat(64), candidateSha256: sha(cand), candidate: cand, validationContract: "MONO-11-v3", sourceSealHash: SEAL.runtimeSealSha256 });
    assert((reg.find("p".repeat(64), SEAL.runtimeSealSha256, "MONO-11-v3")) === (null), "ancien contrat refuse");
    assert((reg.find("q".repeat(64), SEAL.runtimeSealSha256, "MONO-11-v3")) === (null), "autre sceau refuse");
    assert(reg.find("r".repeat(64), SEAL.runtimeSealSha256, "MONO-11-v3"), "entree courante servie"); });

  await T("V12-11", "import hors ligne (R6 / Q5) : un run produit sous un autre sceau MONO-11 est REFUSE (REGISTRY_IMPORT_SEAL_MISMATCH) ; aucune migration, aucun import automatique", () => {
    const d = tmp(); fs.writeFileSync(path.join(d, "enforcement-traces.json"), JSON.stringify({ reviews: [] }));
    fs.writeFileSync(path.join(d, "state.json"), JSON.stringify({ runId: "r", seal: { runtimeSealSha256: "9fbef4126d437e0bb2ee4b2564b5ebcc381e8a338eacba40a590eff8402c079c" } }));
    const IMP = require("../tools/ef03b-registry-import.js"); let e = null; try { IMP.importRun(d, { dryRun: true }); } catch (x) { e = x; }
    assert(e && e.code === "REGISTRY_IMPORT_SEAL_MISMATCH", "refus attendu : " + (e && (e.code || e.message)));
    /* meme run sous le sceau courant mais registre portant un ancien contrat : refuse aussi */
    fs.writeFileSync(path.join(d, "state.json"), JSON.stringify({ runId: "r", seal: { runtimeSealSha256: SEAL.runtimeSealSha256 } }));
    EF3.createReviewRegistry({ runDir: d }).put({ basePromptSha256: "p".repeat(64), candidateSha256: "c", candidate: "{}", validationContract: "MONO-11-v2", sourceSealHash: SEAL.runtimeSealSha256 });
    let e2 = null; try { IMP.importRun(d, { dryRun: true }); } catch (x) { e2 = x; } assert(e2 && e2.code === "REGISTRY_IMPORT_CONTRACT_MISMATCH", "refus contrat attendu : " + (e2 && (e2.code || e2.message))); });

  await T("V12-12", "cache LLM : une reponse mise en cache sous MONO-11-v2 n'est pas reutilisee sous MONO-11-v3 (contrat de validation lu dans la configuration)", () => {
    const src = fs.readFileSync(path.join(P.ROOT, "lib", "llm.js"), "utf8");
    assert(/entry\.validationContract \|\| null\) !== VALIDATION_CONTRACT/.test(src), "reuseContextCheck compare le contrat");
    assert(/entry\.sourceSealHash !== opts\.sealHash/.test(src), "reuseContextCheck compare le sceau"); });

  await T("V12-13", "SHADOW A10 (lecture seule ; SKIPPED si intrants absents) : sous v1.0.12, la recomposition (litteralisation + reparation ciblee) restaure 12/12 citations et reproduit reviews-restored.json ; aucune ecriture dans le run", () => {
    const RUN = process.env.EVIDENCEFORGE_A10_SHADOW_RUN_DIR || path.join(os.homedir(), "evidenceforge-work", "reports", "h1-v105-runs", "efm-20260918-a64167c0");
    const RESTORED = process.env.EVIDENCEFORGE_A10_SHADOW_RESTORED || path.join(os.homedir(), "evidenceforge-work", "reports", "a10-lineage-restoration", "reviews-restored.json");
    const need = ["llm-calls.jsonl", "cost-ledger.jsonl", "reviews.json", "twins.json", "target-document-set.json", "review-schema.json"].map((f) => path.join(RUN, f)).concat([RESTORED]);
    if (!need.every((f) => fs.existsSync(f))) { console.log("       SKIPPED : intrants archives A10 absents"); return; }
    const J = (f) => JSON.parse(fs.readFileSync(f, "utf8")); const L = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const before = fs.readdirSync(RUN).map((f) => f + ":" + fs.statSync(path.join(RUN, f)).mtimeMs).join("|");
    const calls = L(path.join(RUN, "llm-calls.jsonl")); const ledger = {}; L(path.join(RUN, "cost-ledger.jsonl")).forEach((e) => { ledger[e.callId] = e; });
    const reviews = J(path.join(RUN, "reviews.json")), restored = J(RESTORED), twins = J(path.join(RUN, "twins.json")), tds = J(path.join(RUN, "target-document-set.json")), rschema = J(path.join(RUN, "review-schema.json"));
    const twinById = {}; twins.twins.forEach((t) => { twinById[t.twinId] = t; }); const doc = tds.documents[0]; const content = doc.content;
    const textOf = (id) => J(path.join(RUN, "llm-cache", id + ".response.json")).content.filter((c) => c.type === "text").map((c) => c.text).join("");
    const a10All = calls.filter((c) => c.kind === "LLM_CALL" && /^EF-03B/.test(c.purpose || "") && c.twinId && ledger[c.responseSha256] && ledger[c.responseSha256].attemptId === 10).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const SCOPE = Array.from(new Set(a10All.filter((c) => c.purpose === "EF-03B review").map((c) => c.twinId))); let checked = 0, restoredRefs = 0;
    SCOPE.forEach((twinId) => { const twin = twinById[twinId]; const a10 = a10All.filter((c) => c.twinId === twinId); const base = a10.find((c) => c.purpose === "EF-03B review");
      let cur = RE.validateReviewCandidate(textOf(base.responseSha256), twin, doc, rschema).parsed;
      a10.slice(1).forEach((c) => { const faulty = RE.faultyDimensions(RE.validateReviewCandidate(JSON.stringify(cur), twin, doc, rschema).errors); const rp = RE.parseRepair(textOf(c.responseSha256), faulty);
        const kept = /literalization/.test(c.purpose) ? EF3.preserveLineageRepairs(cur, rp.repairs || {}, content) : RE.mergeRepairLineage(cur, rp.repairs || {}, content).applied;   /* litteralisation : adaptateur ; reparation ciblee : lot v0.4 */
        cur = RE.recompose(cur, kept); });
      const hist = reviews.reviews.find((r) => r.twinId === twinId), rest = restored.reviews.find((r) => r.twinId === twinId);
      hist.findings.forEach((f, i) => { const g = rest.findings[i], n = cur.findings.find((x) => x.dimensionId === f.dimensionId);
        assert((JSON.stringify(n.targetEvidenceRefs)) === (JSON.stringify(g.targetEvidenceRefs)), twinId + "/" + f.dimensionId);
        restoredRefs += g.targetEvidenceRefs.filter((x) => f.targetEvidenceRefs.indexOf(x) === -1).length; checked++; }); });
    assert((checked) === (70), "70 constats compares : " + checked); assert((restoredRefs) === (12), "12 citations restaurees : " + restoredRefs);
    assert((fs.readdirSync(RUN).map((f) => f + ":" + fs.statSync(path.join(RUN, f)).mtimeMs).join("|")) === (before), "aucune ecriture dans le run");
    console.log("       shadow A10 sous v1.0.12 : " + checked + " constats, " + restoredRefs + " citations restaurees"); });

  await T("V12-14", "checkpoint sous un autre sceau : la garde de reprise compare runtimeSealSha256 et refuse (CHECKPOINT_SEAL_MISMATCH) — sceau courant v0.4 != sceau des runs v0.3-r1", () => {
    const src = fs.readFileSync(path.join(P.ROOT, "lib", "stage-professionals.js"), "utf8");
    assert(/cp\.seal\.runtimeSealSha256 !== SEAL\.runtimeSealSha256/.test(src) && /CHECKPOINT_SEAL_MISMATCH/.test(src), "garde presente");
    assert((SEAL.runtimeSealSha256) !== ("9fbef4126d437e0bb2ee4b2564b5ebcc381e8a338eacba40a590eff8402c079c"), "le sceau courant differe de celui des runs v0.3-r1"); });

  await T("V12-15", "litteralisation (v1.0.11) inchangee : preserveLineageRepairs conserve les originales litterales ; bloc G non modifie par v1.0.12", () => {
    const m = EF3.mergeLiteralRefs([VALID_A, INVALID_B], [VALID_B, "x"], DOC); assert(JSON.stringify(m.refs) === JSON.stringify([VALID_A, VALID_B]));
    const rp = EF3.preserveLineageRepairs({ findings: [{ dimensionId: "DIM-01", targetEvidenceRefs: [VALID_A, INVALID_B] }] }, { "DIM-01": [VALID_B] }, DOC); assert(JSON.stringify(rp["DIM-01"]) === JSON.stringify([VALID_A, VALID_B])); });

  await T("V12-16", "invariant de lignee identique des deux cotes : pour 24 combinaisons (brut x reparation), FINAL(miroir) == FINAL(lot) et FINAL ⊇ originales litterales", async () => {
    const raws = [[VALID_A, INVALID_B], [INVALID_B], [VALID_A, VALID_C, INVALID_B], []];
    const reps = [[VALID_B], [], [VALID_A], [INVALID_B, VALID_B], ["", VALID_C], [VALID_B, VALID_B]];
    let n = 0;
    for (const raw of raws) for (const rep of reps) { n++;
      const rawJson = reviewJson(9, { "DIM-02": raw }); const A = await viaAdapter(9, rawJson, { "DIM-02": rep }), L = await viaLot(9, rawJson, { "DIM-02": rep });
      assert((A.r.review.reviewStatus) === (L.r.review.reviewStatus), "statut " + JSON.stringify([raw, rep]));
      if (A.r.review.reviewStatus === "complete") { const fa = refsOf(A.r, "DIM-02"), fl = refsOf(L.r, "DIM-02"); assert(JSON.stringify(fa) === JSON.stringify(fl), "parite " + JSON.stringify([raw, rep]));
        raw.filter((x) => DOC.indexOf(x) !== -1).forEach((x) => assert(fa.indexOf(x) !== -1, "P1 " + JSON.stringify([raw, rep])));
        fa.forEach((x) => assert(raw.indexOf(x) !== -1 || rep.indexOf(x) !== -1, "P2 " + JSON.stringify([raw, rep]))); } }
    assert((n) === (24), "24 combinaisons"); });

  await T("V12-17", "trace : la passe ciblee du miroir expose la lignee (lineage, repairUnresolvedDimensions) ; aucun prompt ni reponse complete dans la trace", async () => {
    const A = await viaAdapter(10, reviewJson(10, { "DIM-02": [VALID_A, INVALID_B] }), { "DIM-02": [VALID_B] });
    const t = A.trace.find((x) => x.lineage); assert(t && t.lineage["DIM-02"] && JSON.stringify(t.lineage["DIM-02"].preservedRefs) === JSON.stringify([VALID_A]), JSON.stringify(t && t.lineage));
    const raw = fs.readFileSync(path.join(A.dir, EF3.TRACE_FILE), "utf8"); assert((/CONTRAT DE BUDGET|DOCUMENT CIBLE|Introduction generale/.test(raw)) === (false), "trace sans prompt"); });

  await T("V12-18", "version du produit et frontiere : config MONOLITH-v1.0.15, lot MONO-11 v0.4 ; le monolithe ne fabrique aucun prompt de revue (hors adaptateur EF-03B) ; lots geles 0 divergence", () => {
    assert((P.CONFIG.product.version) === ("MONOLITH-v1.0.15")); assert((P.CONFIG.frozenLots["MONO-11"].dir) === ("MONO-11/v0.4"));
    const libSrc = fs.readdirSync(path.join(P.ROOT, "lib")).filter((f) => f !== "ef03b-resilience.js").map((f) => fs.readFileSync(path.join(P.ROOT, "lib", f), "utf8")).join("\n");
    assert((/targetedRepairPrompt|informedRepairPrompt|buildReviewPrompt|REPRISE CIBLEE/.test(libSrc)) === false);
    const ad = fs.readFileSync(path.join(P.ROOT, "lib", "ef03b-resilience.js"), "utf8"); assert((/RE\.targetedRepairPrompt|RE\.informedRepairPrompt/.test(ad)) === (false), "l'adaptateur n'appelle aucun constructeur de prompt gele"); });
};
