"use strict";
/**
 * EvidenceForge MONOLITH v1.0.11 — test/test-ef03b-lineage.js : EF-03B LITERALIZATION LINEAGE PRESERVATION (T-EF03B-27…35).
 * Charge par test/test-ef03b.js. Aucun reseau, aucun fournisseur : lot gele MONO-11 (runEnforcedReview, validateReviewCandidate) execute
 * REELLEMENT avec l'adaptateur v1.0.11 et un LLM factice scripte. Invariant teste : FINAL = dedup(VALID_ORIGINAL_REFS ++ VALID_REPAIRED_REFS),
 * FINAL ⊇ VALID_ORIGINAL_REFS, FINAL ⊆ RAW ∪ REPAIR ; une litteralisation ne supprime jamais une reference originale deja litterale.
 * T-EF03B-32 : fixture derivee des cas observes (test/fixtures/ef03b-lineage-a10-cases.json : document synthetique, jetons de cas anonymises, sans le run).
 * T-EF03B-35 : test SHADOW historique, LECTURE SEULE, ignore (SKIPPED, jamais FAIL) si les intrants archives ne sont pas presents.
 */
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
module.exports = async function (h) {
  const { T, assert, tmp, sha, P } = h;
  const EF3 = require("../lib/ef03b-resilience.js"); const SP = require("../lib/stage-professionals.js");
  const RE = require(path.join(P.MONO11, "core", "review-enforcer.js")); const { F } = SP.loadSealedMono11();
  console.log("\n— v1.0.11 : EF-03B LITERALIZATION LINEAGE PRESERVATION —");
  const DIMS = ["DIM-01", "DIM-02", "DIM-03"];
  const DOC = "# Fiche de recueil\n\nIntroduction generale du document cible.\n\n**Attention :** ne pas transformer ces distinctions en categories definitives.\n\n3. Faut-il demander ce qui est :\n   - difficile ;\n   - impossible ;\n   - evite ;\n   - seulement inconfortable ?\n\nLa fiche permet de recueillir librement les activites realisees.\n\n- [ ] Oui\n- [ ] Non\n\nConclusion : la structure reste prudente et generique.\n";
  const VALID_A = "La fiche permet de recueillir librement les activites realisees.", VALID_B = "Attention :** ne pas transformer ces distinctions en categories definitives.", VALID_C = "Conclusion : la structure reste prudente et generique.";
  const INVALID_B = "Attention : ne pas transformer ces distinctions en categories definitives.";   /* marqueurs Markdown retires : non litteral, span exact localisable */
  const mkDoc = () => ({ targetId: "target-01", label: "Document", role: "review_target_not_evidence", content: DOC, sourceDocumentRef: sha(DOC) });
  const mkTwin = (i) => ({ twinId: "twin-" + i, professionalRef: "pro-" + i, referenceIdentity: { displayName: "Professionnel " + i }, documentaryBasis: { worksUsed: ["Work A " + i, "Work B " + i].map((w) => ({ workRef: w, title: w })), dimensionCoverage: {} } });
  const schema = { schema: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1", stage: "EF-03A", missionQuestion: "Question de mission de test.", dimensions: DIMS.map((id, i) => ({ id, label: "Dimension " + (i + 1), definition: "Definition de la dimension " + (i + 1) + "." })), reviewTargets: [{ targetId: "target-01" }], schemaHash: sha("schema") };
  const finding = (id, i, refs) => ({ dimensionId: id, disposition: "support", epistemicStatus: "documented", finding: "Constat pour " + id + ".", rationale: "Justification pour " + id + ".", targetEvidenceRefs: refs, twinBasisWorkRefs: ["Work A " + i], confidenceQualitative: "medium", limitations: ["Limite " + id] });
  const reviewJson = (i, refsByDim) => JSON.stringify({ findings: DIMS.map((id) => finding(id, i, refsByDim[id] || [VALID_A])) });
  const repairJson = (repairs) => JSON.stringify({ repairs: Object.keys(repairs).map((d) => ({ dimensionId: d, targetEvidenceRefs: repairs[d] })) });
  function fakeLlm(handler) { const calls = [], validations = [], reuses = []; let n = 0;
    return { calls, validations, reuses, model: "fake-model", async llmCall(prompt, meta) { n++; const r = await handler(prompt, meta, n); calls.push({ prompt, meta, text: r.text }); return { text: r.text, callId: "c" + n + "-" + sha(r.text).slice(0, 12), providerRequestId: "fake-" + n, modelId: "fake-model", providerId: "fake", usage: { input_tokens: 10, output_tokens: 10 }, stopReason: "end_turn", reused: false }; }, onValidation(v) { validations.push(v); }, recordReuse(i) { reuses.push(i); } }; }
  const run = async (llm, i) => { const d = tmp(); const adapter = EF3.createReviewAdapter({ llm, runDir: d, runId: "t", attemptId: 1, sealHash: "s".repeat(64), config: { maxTokens: 12288, excerptChars: 40 }, twinsTotal: () => 1 }); const r = await RE.runEnforcedReview({ frozen: F, twin: mkTwin(i), targetDoc: mkDoc(), reviewSchema: schema, llmCall: adapter.llmCall, maxPasses: 3, onValidation: adapter.onValidation, runId: "t" }); return { r, adapter, trace: fs.existsSync(path.join(d, EF3.TRACE_FILE)) ? fs.readFileSync(path.join(d, EF3.TRACE_FILE), "utf8").trim().split("\n").map(JSON.parse) : [] }; };
  /** lance une revue dont le brut a `rawByDim` et dont la litteralisation repond `repairs` ; rend les findings acceptes + le brut */
  const scenario = async (i, rawByDim, repairs) => { const raw = reviewJson(i, rawByDim); const llm = fakeLlm((prompt, meta) => meta.strategy === "LITERALIZATION_EXCERPTS" ? { text: repairJson(repairs) } : { text: raw }); const out = await run(llm, i); return Object.assign(out, { rawFindings: JSON.parse(raw).findings, llm }); };
  const refsOf = (r, id) => r.review.findings.find((f) => f.dimensionId === id).targetEvidenceRefs;
  const stripRefs = (f) => { const o = Object.assign({}, f); delete o.targetEvidenceRefs; return JSON.stringify(o); };
  /* le parseur EF-03B gele AJOUTE findingId / twinId / professionalRef / targetId : la comparaison porte sur les cles du brut (hors targetEvidenceRefs), valeur par valeur */
  const sameOnRawKeys = (b, a, withRefs) => Object.keys(b).every((k) => (k === "targetEvidenceRefs" && !withRefs) || JSON.stringify(b[k]) === JSON.stringify(a[k]));
  const semanticallyIdentical = (before, after) => before.every((b) => { const a = after.find((x) => x.dimensionId === b.dimensionId); return a && sameOnRawKeys(b, a, false); });

  await T("T-EF03B-27", "T1 — preserve valid originals : brut [validA, invalidB] + reparation [validB] => [validA, validB] (originale litterale conservee, ordre brut puis modele) ; acceptee a la passe 1 ; 1 seule litteralisation", async () => {
    const s = await scenario(1, { "DIM-02": [VALID_A, INVALID_B] }, { "DIM-02": [VALID_B] });
    assert(s.r.review.reviewStatus === "complete" && s.r.trace.acceptedPass === 1 && s.llm.calls.length === 2, JSON.stringify([s.r.review.error, s.llm.calls.length]));
    assert(JSON.stringify(refsOf(s.r, "DIM-02")) === JSON.stringify([VALID_A, VALID_B]), "attendu [validA, validB] : " + JSON.stringify(refsOf(s.r, "DIM-02")));
    const lt = s.trace.find((t) => t.strategy === "LITERALIZATION_EXCERPTS"); assert(lt && lt.lineagePreservedRefs === 1 && lt.state === "CANDIDATE_VALID", "trace : originales conservees comptees : " + JSON.stringify(lt));
    assert(semanticallyIdentical(s.rawFindings, s.r.review.findings), "aucun autre champ modifie"); });

  await T("T-EF03B-28", "T2 — all originals valid : brut [validA, validB] => aucune litteralisation declenchee, refs byte-identiques ; fonction pure : reparation [] => [validA, validB], aucune perte", async () => {
    const s = await scenario(2, { "DIM-02": [VALID_A, VALID_B] }, { "DIM-02": [] });
    assert(s.r.review.reviewStatus === "complete" && s.llm.calls.length === 1 && JSON.stringify(refsOf(s.r, "DIM-02")) === JSON.stringify([VALID_A, VALID_B]), JSON.stringify([s.llm.calls.length, refsOf(s.r, "DIM-02")]));
    const m = EF3.mergeLiteralRefs([VALID_A, VALID_B], [], DOC); assert(JSON.stringify(m.refs) === JSON.stringify([VALID_A, VALID_B]) && m.invalidOriginal.length === 0 && m.droppedRepaired.length === 0, JSON.stringify(m));
    const m2 = EF3.mergeLiteralRefs([VALID_A, VALID_B], [VALID_C], DOC); assert(JSON.stringify(m2.refs) === JSON.stringify([VALID_A, VALID_B, VALID_C]), "reparee litterale ajoutee apres les originales : " + JSON.stringify(m2.refs)); });

  await T("T-EF03B-29", "T3 — invalid repaired to valid : brut [invalidB] + reparation [validB] => [validB] ; une reparation NON litterale est ecartee (jamais inscrite), [] restant valide par contrat", async () => {
    const s = await scenario(3, { "DIM-02": [INVALID_B] }, { "DIM-02": [VALID_B] }); assert(s.r.review.reviewStatus === "complete" && JSON.stringify(refsOf(s.r, "DIM-02")) === JSON.stringify([VALID_B]), JSON.stringify(refsOf(s.r, "DIM-02")));
    const m = EF3.mergeLiteralRefs([INVALID_B], ["", "citation inventee absente du document", VALID_B], DOC); assert(JSON.stringify(m.refs) === JSON.stringify([VALID_B]) && m.droppedRepaired.length === 2 && m.invalidOriginal.length === 1, JSON.stringify(m));
    const s2 = await scenario(31, { "DIM-02": [INVALID_B] }, { "DIM-02": [] }); assert(s2.r.review.reviewStatus === "complete" && JSON.stringify(refsOf(s2.r, "DIM-02")) === "[]", "[] accepte par contrat : " + JSON.stringify(refsOf(s2.r, "DIM-02"))); });

  await T("T-EF03B-30", "T4 — duplicate repaired ref : brut [validA] + reparation [validA] => [validA] ; brut [validA, invalidB] + reparation [validA, validB] => [validA, validB] (premiere occurrence gagnante, jamais de doublon)", async () => {
    const m = EF3.mergeLiteralRefs([VALID_A], [VALID_A], DOC); assert(JSON.stringify(m.refs) === JSON.stringify([VALID_A]), JSON.stringify(m.refs));
    const s = await scenario(4, { "DIM-02": [VALID_A, INVALID_B] }, { "DIM-02": [VALID_A, VALID_B, VALID_B] }); assert(JSON.stringify(refsOf(s.r, "DIM-02")) === JSON.stringify([VALID_A, VALID_B]), JSON.stringify(refsOf(s.r, "DIM-02")));
    const m3 = EF3.mergeLiteralRefs([VALID_A, VALID_A], [VALID_B], DOC); assert(JSON.stringify(m3.refs) === JSON.stringify([VALID_A, VALID_B]), "doublon du brut lui-meme dedoublonne : " + JSON.stringify(m3.refs)); });

  await T("T-EF03B-31", "T5 — mixed multi-dimension : DIM-02 reparee, DIM-01 / DIM-03 uniquement valides => DIM-01 / DIM-03 byte-identiques (refs comprises), DIM-02 fusionnee ; repairScope = [DIM-02]", async () => {
    const s = await scenario(5, { "DIM-01": [VALID_A, VALID_C], "DIM-02": [VALID_A, INVALID_B], "DIM-03": [VALID_C] }, { "DIM-02": [VALID_B] });
    assert(s.r.review.reviewStatus === "complete" && s.r.trace.acceptedPass === 1, JSON.stringify(s.r.review.error));
    const raw = s.rawFindings, out = s.r.review.findings; assert(sameOnRawKeys(raw[0], out[0], true) && sameOnRawKeys(raw[2], out[2], true), "DIM-01 / DIM-03 intactes (refs comprises)");
    assert(JSON.stringify(refsOf(s.r, "DIM-02")) === JSON.stringify([VALID_A, VALID_B]) && JSON.stringify(s.llm.calls[1].meta.repairScope) === JSON.stringify(["DIM-02"]), JSON.stringify([refsOf(s.r, "DIM-02"), s.llm.calls[1].meta.repairScope]));
    const rp = EF3.preserveLineageRepairs({ findings: raw }, { "DIM-02": [VALID_B] }, DOC); assert(Object.keys(rp).length === 1 && JSON.stringify(rp["DIM-02"]) === JSON.stringify([VALID_A, VALID_B]), "preserveLineageRepairs ne touche que la dimension reparee : " + JSON.stringify(rp)); });

  await T("T-EF03B-32", "T6 — historical regression fixture (4 revues observees CASE-A..D : 3 litteralisations + 1 reparation ciblee, document synthetique anonymise, sans le run) : les 12 references historiquement perdues sont conservees, les 3 constats vides retrouvent leur citation, invariant FINAL ⊇ VALID_ORIGINAL et FINAL ⊆ RAW ∪ REPAIR", () => {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "ef03b-lineage-a10-cases.json"), "utf8")); let lost = 0, restoredEmptied = [];
    fx.cases.forEach((c) => { assert(sha(c.content) === c.contentSha256, "fixture intacte : " + c.case);
      c.dims.forEach((d) => { const invalid = d.raw.filter((x) => !EF3.isLiteralRef(x, c.content)); invalid.forEach((x) => assert(c.content.indexOf(x) === -1, "une reference non litterale ne doit pas figurer dans le document synthetique : " + c.case + "/" + d.dimensionId));
        let cur = d.raw; d.repairs.forEach((rep) => { cur = EF3.mergeLiteralRefs(cur, rep, c.content).refs; });   /* chaine des reparations tracees (litteralisation puis reparation ciblee), comme au run */
        assert(JSON.stringify(cur) === JSON.stringify(d.expectedFinal), c.case + "/" + d.dimensionId + " attendu " + JSON.stringify(d.expectedFinal) + " obtenu " + JSON.stringify(cur));
        const validOriginal = d.raw.filter((x) => EF3.isLiteralRef(x, c.content)); const union = d.raw.concat(d.repairs.flat());
        assert(validOriginal.every((x) => cur.indexOf(x) !== -1), "FINAL ⊇ VALID_ORIGINAL : " + c.case + "/" + d.dimensionId); assert(cur.every((x) => union.indexOf(x) !== -1 && EF3.isLiteralRef(x, c.content)), "FINAL ⊆ RAW ∪ REPAIR et litteral : " + c.case + "/" + d.dimensionId);
        d.persistedA10.forEach((x) => assert(cur.indexOf(x) !== -1, "persiste A10 ⊆ restaure : " + c.case + "/" + d.dimensionId));
        lost += d.lostByV110.filter((x) => cur.indexOf(x) !== -1).length; if (d.persistedA10.length === 0 && cur.length > 0) restoredEmptied.push(c.case + "/" + d.dimensionId); }); });
    assert(lost === 12, "12 references historiquement perdues conservees, obtenu " + lost); assert(JSON.stringify(restoredEmptied) === JSON.stringify(["CASE-A/DISC-07", "CASE-B/DISC-03", "CASE-C/DISC-06"]), "3 constats vides restaures : " + JSON.stringify(restoredEmptied)); });

  await T("T-EF03B-33", "non-regression semantique : avant / apres litteralisation, tous les champs sauf targetEvidenceRefs sont byte-identiques (disposition, epistemicStatus, finding, rationale, confidence, limitations, twinBasisWorkRefs) ; le registre inscrit exactement le candidat accepte", async () => {
    const s = await scenario(6, { "DIM-01": [VALID_C, INVALID_B], "DIM-02": [VALID_A, INVALID_B], "DIM-03": [INVALID_B] }, { "DIM-01": [VALID_B], "DIM-02": [VALID_B], "DIM-03": [VALID_B] });
    assert(s.r.review.reviewStatus === "complete", JSON.stringify(s.r.review.error)); assert(semanticallyIdentical(s.rawFindings, s.r.review.findings), "champs substantiels modifies");
    const diffs = s.rawFindings.map((b, i) => Object.keys(b).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(s.r.review.findings[i][k]))); assert(diffs.every((d) => d.length === 0 || (d.length === 1 && d[0] === "targetEvidenceRefs")), "seule targetEvidenceRefs differe : " + JSON.stringify(diffs));
    assert(JSON.stringify(refsOf(s.r, "DIM-01")) === JSON.stringify([VALID_C, VALID_B]) && JSON.stringify(refsOf(s.r, "DIM-02")) === JSON.stringify([VALID_A, VALID_B]) && JSON.stringify(refsOf(s.r, "DIM-03")) === JSON.stringify([VALID_B]), "fusion par dimension");
    const reg = s.adapter.registry.list(); assert(reg.length === 1 && JSON.parse(reg[0].candidate).findings.every((f, i) => JSON.stringify(f.targetEvidenceRefs) === JSON.stringify(s.r.review.findings[i].targetEvidenceRefs)), "registre = candidat accepte"); });

  await T("T-EF03B-34", "purete et frontiere : mergeLiteralRefs / preserveLineageRepairs sont pures (meme entree => meme sortie, entrees non mutees), n'inventent aucune chaine, ne lisent que targetEvidenceRefs ; le seul point d'appel cote adaptateur est la recomposition apres litteralisation (bloc G) ; le miroir de la reparation ciblee delegue a RE.mergeRepairLineage du lot gele (v1.0.12) ; RE.recompose gele inchange", () => {
    const raw = [VALID_A, INVALID_B], rep = [VALID_B, "x"]; const a = EF3.mergeLiteralRefs(raw, rep, DOC), b = EF3.mergeLiteralRefs(raw, rep, DOC); assert(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(raw) === JSON.stringify([VALID_A, INVALID_B]) && JSON.stringify(rep) === JSON.stringify([VALID_B, "x"]), "pure, non mutante");
    assert(JSON.stringify(EF3.mergeLiteralRefs(null, undefined, DOC).refs) === "[]" && JSON.stringify(EF3.mergeLiteralRefs([VALID_A], [VALID_B], "").refs) === "[]", "entrees degradees : jamais d'exception, jamais une chaine hors document");
    const src = fs.readFileSync(path.join(__dirname, "..", "lib", "ef03b-resilience.js"), "utf8"); assert((src.match(/preserveLineageRepairs\(v\.parsed/g) || []).length === 1 && /RE\.recompose\(v\.parsed, kept\)/.test(src), "un seul point de fusion cote adaptateur : la litteralisation");
    assert(/RE\.mergeRepairLineage\(st\.parsed/.test(src) && /RE\.recompose\(st\.parsed, mg\.applied\)/.test(src), "v1.0.12 : le miroir de la reparation ciblee applique la fusion de lignee du lot gele MONO-11 v0.4 (R5) avant le recompose gele");
    assert(P.verifyFrozenLots()["MONO-11"].divergences.length === 0, "lot MONO-11 inchange"); });

  await T("T-EF03B-35", "SHADOW historique (lecture seule ; SKIPPED si intrants absents) : intrants archives A10 (llm-cache, llm-calls, cost-ledger, twins, document, schema) + nouvelle recomposition seule => targetEvidenceRefs byte-identiques a reviews-restored.json pour les 7 revues reelles (4 reparees, 3 intactes) ; autres champs == reviews.json du run ; aucune ecriture dans le run", () => {
    const RUN = process.env.EVIDENCEFORGE_A10_SHADOW_RUN_DIR || path.join(os.homedir(), "evidenceforge-work", "reports", "h1-v105-runs", "efm-20260918-a64167c0");
    const RESTORED = process.env.EVIDENCEFORGE_A10_SHADOW_RESTORED || path.join(os.homedir(), "evidenceforge-work", "reports", "a10-lineage-restoration", "reviews-restored.json");
    const need = ["llm-calls.jsonl", "cost-ledger.jsonl", "reviews.json", "twins.json", "target-document-set.json", "review-schema.json"].map((f) => path.join(RUN, f)).concat([RESTORED]);
    if (!need.every((f) => fs.existsSync(f))) { console.log("       SKIPPED : intrants archives A10 absents (" + RUN + ")"); return; }
    const J = (f) => JSON.parse(fs.readFileSync(f, "utf8")); const L = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const before = fs.readdirSync(RUN).map((f) => f + ":" + fs.statSync(path.join(RUN, f)).mtimeMs).join("|");
    const calls = L(path.join(RUN, "llm-calls.jsonl")); const ledger = {}; L(path.join(RUN, "cost-ledger.jsonl")).forEach((e) => { ledger[e.callId] = e; });
    const reviews = J(path.join(RUN, "reviews.json")), restored = J(RESTORED), twins = J(path.join(RUN, "twins.json")), tds = J(path.join(RUN, "target-document-set.json")), schema = J(path.join(RUN, "review-schema.json"));
    const twinById = {}; (twins.twins || twins).forEach((t) => { twinById[t.twinId] = t; }); const doc = (tds.targets || tds.documents || tds)[0]; const content = doc.content;
    const textOf = (id) => J(path.join(RUN, "llm-cache", id + ".response.json")).content.filter((c) => c.type === "text").map((c) => c.text).join("");
    /* perimetre derive du run lui-meme : toutes les revues produites par appel REEL a la tentative 10 (base EF-03B), sans identifiant code en dur ; les revues sans reparation tracee doivent rester identiques */
    const a10All = calls.filter((c) => c.kind === "LLM_CALL" && /^EF-03B/.test(c.purpose || "") && c.twinId && ledger[c.responseSha256] && ledger[c.responseSha256].attemptId === 10).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const SCOPE = Array.from(new Set(a10All.filter((c) => c.purpose === "EF-03B review").map((c) => c.twinId))); let checked = 0, repaired = 0;
    SCOPE.forEach((twinId) => { const twin = twinById[twinId]; const a10 = a10All.filter((c) => c.twinId === twinId);
      const base = a10.find((c) => c.purpose === "EF-03B review"); let cur = RE.validateReviewCandidate(textOf(base.responseSha256), twin, doc, schema).parsed; if (a10.length > 1) repaired++;
      a10.slice(1).forEach((c) => { const faulty = RE.faultyDimensions(RE.validateReviewCandidate(JSON.stringify(cur), twin, doc, schema).errors); const rp = RE.parseRepair(textOf(c.responseSha256), faulty); cur = RE.recompose(cur, EF3.preserveLineageRepairs(cur, rp.repairs || {}, content)); });   /* NOUVELLE recomposition seule, chainee sur les reparations tracees */
      const hist = reviews.reviews.find((r) => r.twinId === twinId), rest = restored.reviews.find((r) => r.twinId === twinId);
      hist.findings.forEach((f, i) => { const g = rest.findings[i], n = cur.findings.find((x) => x.dimensionId === f.dimensionId); assert(JSON.stringify(n.targetEvidenceRefs) === JSON.stringify(g.targetEvidenceRefs), twinId + "/" + f.dimensionId + " refs != shadow : " + JSON.stringify(n.targetEvidenceRefs) + " vs " + JSON.stringify(g.targetEvidenceRefs)); assert(stripRefs(f) === stripRefs(g), "autres champs == run : " + f.findingId); checked++; }); });
    assert(SCOPE.length === 7 && repaired === 4 && checked === 70, "7 revues reelles A10 (dont 4 reparees) x 10 constats : " + JSON.stringify([SCOPE.length, repaired, checked])); assert(fs.readdirSync(RUN).map((f) => f + ":" + fs.statSync(path.join(RUN, f)).mtimeMs).join("|") === before, "aucune ecriture dans le run"); console.log("       shadow A10 : " + checked + " constats, " + SCOPE.length + " revues reelles (" + repaired + " reparees) byte-identiques a reviews-restored.json"); });
};
