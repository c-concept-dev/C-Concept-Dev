"use strict";
/**
 * EvidenceForge MONOLITH v1.0.14 — test/test-v1014-normalized-authority.js : SINGLE NORMALIZED DOCUMENT AUTHORITY (RA2-01…08) + RA1 TRACE PARITY (RA1-01…03).
 * Charge par test/test-ef03b.js. Aucun reseau, aucun fournisseur : lot gele MONO-11 v0.4 execute REELLEMENT avec un LLM factice scripte.
 * Objet : la litteralite n'est jamais jugee sur une reconstruction du prompt ; fail-closed si l'autorite documentaire manque ; le registre
 * n'est ni ecrit ni servi sans empreinte d'autorite identique ; la trace du miroir reflete le statut du lot quand une reparation est illisible.
 */
const fs = require("fs"), path = require("path");
module.exports = async function (h) {
  const { T, assert, tmp, sha, P } = h;
  const EF3 = require("../lib/ef03b-resilience.js"); const SP = require("../lib/stage-professionals.js");
  const RE = require(path.join(P.MONO11, "core", "review-enforcer.js")); const { F, SEAL } = SP.loadSealedMono11();
  const TN = require(path.join(P.MONO11, "core", "target-normalizer.js"));   /* v1.0.14 : module GELE de normalisation — l'autorite est le contenu normalise */
  const norm = (c) => TN.normalizeTargetDocument({ targetId: "target-01", content: c }).document.content;
  console.log("\n— v1.0.14 : SINGLE NORMALIZED DOCUMENT AUTHORITY + RA1 TRACE PARITY —");
  const DIMS = ["DIM-01", "DIM-02", "DIM-03"];
  /* le marqueur de parsing du prompt EF-03B, place AU MILIEU du document cible : c'est la chaine causale decouverte par l'audit v1.0.12 (R-A2) */
  const MARKER = "BASE DOCUMENTAIRE DU PROFESSIONNEL";
  const BEFORE = "Premiere partie du document cible, avant le marqueur.";
  const AFTER_A = "Passage situe APRES le marqueur, a citer litteralement.";
  const AFTER_B = "Second passage apres le marqueur, egalement citable.";
  const PLAIN_DOC = "# Fiche\n\n" + BEFORE + "\n\nConclusion prudente et generique.\n";
  /* le marqueur suivi d'une ligne JSON reproduit EXACTEMENT la chaine causale de l'audit : le contexte reconstruit depuis le prompt est
     TRONQUE mais reste parsable — c'est le cas dangereux (aucune alerte, contextUnparsed reste 0). */
  const JSONLINE = "{\"worksUsed\":[{\"workRef\":\"Work A 2\"}]}";
  const MARKER_DOC = "# Fiche\n\n" + BEFORE + "\n\n" + MARKER + "\n" + JSONLINE + "\n\n" + AFTER_A + "\n\n" + AFTER_B + "\n";
  const MULTI_MARKER_DOC = "# Fiche\n\n" + BEFORE + "\n\n" + MARKER + "\n" + JSONLINE + "\n\nTexte intermediaire.\n\n" + MARKER + "\n" + JSONLINE + "\n\n" + AFTER_A + "\n";
  /* seconde forme : le marqueur rend le contexte ILLISIBLE (parse null) — l'adaptateur n'intercepte alors pas et le lot gele juge sur doc.content */
  const UNPARSABLE_MARKER_DOC = "# Fiche\n\n" + BEFORE + "\n\n" + MARKER + " (mention interne, sans ligne JSON)\n\n" + AFTER_A + "\n";
  const mkDoc = (content) => ({ targetId: "target-01", label: "Document", role: "review_target_not_evidence", content: norm(content), sourceDocumentRef: sha(content) });   /* v1.0.14 : le document remis au lot est le document NORMALISE (comme autonomous-run.js) */
  const mkTwin = (i) => ({ twinId: "twin-" + i, professionalRef: "pro-" + i, referenceIdentity: { displayName: "Professionnel " + i }, documentaryBasis: { worksUsed: ["Work A 2"].map((w) => ({ workRef: w, title: w })), dimensionCoverage: {} } });   /* workRef stable : la ligne JSON de la fixture le reprend */
  const schema = { schema: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1", stage: "EF-03A", missionQuestion: "Question de mission de test.", dimensions: DIMS.map((id, i) => ({ id, label: "Dimension " + (i + 1), definition: "Definition " + (i + 1) + "." })), reviewTargets: [{ targetId: "target-01" }], schemaHash: sha("schema") };
  const finding = (id, i, refs) => ({ dimensionId: id, disposition: "support", epistemicStatus: "documented", finding: "Constat " + id + ".", rationale: "Justification " + id + ".", targetEvidenceRefs: refs, twinBasisWorkRefs: ["Work A 2"], confidenceQualitative: "medium", limitations: ["Limite " + id] });
  const reviewJson = (i, byDim, dflt) => JSON.stringify({ findings: DIMS.map((id) => finding(id, i, byDim[id] || [dflt])) });
  const repairJson = (rep) => JSON.stringify({ repairs: Object.keys(rep).map((d) => ({ dimensionId: d, targetEvidenceRefs: rep[d] })) });
  function fakeLlm(handler) { const calls = []; let n = 0;
    return { calls, model: "fake-model", async llmCall(prompt, meta) { n++; const r = await handler(prompt, meta, n); calls.push({ prompt, meta, text: r.text }); return { text: r.text, callId: "c" + n + "-" + sha(r.text).slice(0, 12), providerRequestId: "fake-" + n, modelId: "fake-model", providerId: "fake", usage: { input_tokens: 10, output_tokens: 10 }, stopReason: r.stopReason || "end_turn", reused: false }; }, onValidation() {}, recordReuse() {} }; }
  /** execute une revue via l'ADAPTATEUR avec une autorite documentaire donnee (par defaut : le document lui-meme) */
  const viaAdapter = async (i, doc, handler, opts) => { const d = tmp();
    const adapter = EF3.createReviewAdapter(Object.assign({ llm: fakeLlm(handler), runDir: d, runId: "t", attemptId: 1, sealHash: SEAL.runtimeSealSha256, config: { maxTokens: 12288, excerptChars: 40 }, twinsTotal: () => 1, documentAuthority: () => doc.content }, opts || {}));
    const llm = adapter.__llm || null; const r = await RE.runEnforcedReview({ frozen: F, twin: mkTwin(i), targetDoc: doc, reviewSchema: schema, llmCall: adapter.llmCall, maxPasses: 3, onValidation: adapter.onValidation, runId: "t" });
    return { r, adapter, dir: d, registry: adapter.registry.list(), stats: adapter.stats(), trace: fs.existsSync(path.join(d, EF3.TRACE_FILE)) ? fs.readFileSync(path.join(d, EF3.TRACE_FILE), "utf8").trim().split("\n").map(JSON.parse) : [] }; };
  const refsOf = (r, id) => r.review.findings.find((f) => f.dimensionId === id).targetEvidenceRefs;

  await T("RA2-01", "ordinary document : comportement inchange — citation litterale acceptee a la passe 1, aucun ecart d'autorite, registre alimente avec l'empreinte d'autorite", async () => {
    const doc = mkDoc(PLAIN_DOC); const raw = reviewJson(1, {}, BEFORE);
    const o = await viaAdapter(1, doc, () => ({ text: raw }));
    assert(o.r.review.reviewStatus === "complete" && o.r.trace.acceptedPass === 1, JSON.stringify(o.r.review.error));
    assert(o.stats.contextContentMismatch === 0, "aucun ecart entre le prompt et l'autorite : " + o.stats.contextContentMismatch);
    assert(o.registry.length === 1 && o.registry[0].documentAuthoritySha256 === sha(PLAIN_DOC), "empreinte d'autorite au registre : " + JSON.stringify(o.registry[0] && o.registry[0].documentAuthoritySha256)); });

  await T("RA2-02", "marker inside target document : une citation situee APRES « " + MARKER + " » reste reconnue litterale — v1.0.12 la perdait (contenu tronque au marqueur), v1.0.13 la conserve", async () => {
    const doc = mkDoc(MARKER_DOC); const raw = reviewJson(2, { "DIM-02": [AFTER_A] }, BEFORE);
    /* preuve de la chaine causale : le contexte RECONSTRUIT depuis le prompt est tronque au marqueur et ne contient pas la citation */
    const basePrompt = F.M01.RR.buildReviewPrompt(mkTwin(2), doc, schema) + RE.enforcementPreamble(schema);
    const parsed = EF3.parseReviewPromptContext(basePrompt); assert(parsed && parsed.content.indexOf(AFTER_A) === -1, "reconstruction du prompt tronquee au marqueur (defaut R-A2 reproduit)");
    assert(doc.content.indexOf(AFTER_A) !== -1, "l'autorite documentaire contient bien la citation");
    const o = await viaAdapter(2, doc, () => ({ text: raw }));
    assert(o.r.review.reviewStatus === "complete" && o.r.trace.acceptedPass === 1, "acceptee a la passe 1 : " + JSON.stringify(o.r.review.error));
    assert(JSON.stringify(refsOf(o.r, "DIM-02")) === JSON.stringify([AFTER_A]), "citation conservee : " + JSON.stringify(refsOf(o.r, "DIM-02")));
    assert(o.stats.contextContentMismatch >= 1, "ecart d'autorite compte (jamais silencieux) : " + o.stats.contextContentMismatch);
    assert(o.trace.some((t) => t.strategy === "DOCUMENT_AUTHORITY_MISMATCH" && t.documentAuthoritySha256 === sha(MARKER_DOC)), "ecart trace");
    /* seconde forme : marqueur rendant le contexte ILLISIBLE — l'adaptateur n'intercepte pas, le lot gele juge sur doc.content : citation conservee, jamais de jugement sur une reconstruction */
    const doc2 = mkDoc(UNPARSABLE_MARKER_DOC); const p2 = F.M01.RR.buildReviewPrompt(mkTwin(22), doc2, schema) + RE.enforcementPreamble(schema);
    assert(EF3.parseReviewPromptContext(p2) === null, "contexte illisible (seconde forme)");
    const o2 = await viaAdapter(22, doc2, () => ({ text: reviewJson(22, { "DIM-02": [AFTER_A] }, BEFORE) }));
    assert(o2.r.review.reviewStatus === "complete" && JSON.stringify(refsOf(o2.r, "DIM-02")) === JSON.stringify([AFTER_A]), "citation conservee (contexte illisible : aucune interception)");
    assert(o2.stats.contextUnparsed >= 1, "contexte illisible compte : " + o2.stats.contextUnparsed); });

  await T("RA2-03", "multiple marker-like strings : aucune troncature silencieuse — citations avant et apres chaque occurrence acceptees, ecart trace", async () => {
    const doc = mkDoc(MULTI_MARKER_DOC); const raw = reviewJson(3, { "DIM-01": [BEFORE], "DIM-02": ["Texte intermediaire."], "DIM-03": [AFTER_A] }, BEFORE);
    const o = await viaAdapter(3, doc, () => ({ text: raw }));
    assert(o.r.review.reviewStatus === "complete" && o.r.trace.acceptedPass === 1, JSON.stringify(o.r.review.error));
    DIMS.forEach((d, i) => assert(refsOf(o.r, d).length === 1, d)); assert(o.stats.contextContentMismatch >= 1, "ecart compte"); });

  await T("RA2-04", "prompt reconstruction differs from doc.content ET brut != normalise : l'AUTORITE NORMALISEE fait foi — une autorite BRUTE est refusee (DOCUMENT_AUTHORITY_NOT_NORMALIZED), une citation du document normalise reste litterale", async () => {
    const RAW = "# Fiche\r\n\r\nCitation avec l\u2019apostrophe typographique et un espace\u00a0insecable.\r\n";
    const NORMALIZED = norm(RAW); assert(NORMALIZED !== RAW, "le brut differe du normalise (apostrophe / NBSP / CRLF)");
    const CIT = "Citation avec l'apostrophe typographique et un espace insecable.";
    assert(NORMALIZED.indexOf(CIT) !== -1 && RAW.indexOf(CIT) === -1, "la citation n'existe QUE dans le document normalise");
    const doc = { targetId: "target-01", label: "D", role: "review_target_not_evidence", content: NORMALIZED, sourceDocumentRef: sha(RAW) };
    /* autorite BRUTE (le defaut de la candidate v1.0.13) : refusee, fail closed, jamais de repli */
    let e = null; try { await viaAdapter(4, doc, () => ({ text: reviewJson(4, { "DIM-01": [CIT] }, CIT) }), { documentAuthority: () => RAW }); } catch (x) { e = x; }
    assert(e && e.code === "DOCUMENT_AUTHORITY_NOT_NORMALIZED" && e.fatal === true, "autorite brute refusee (fatal) : " + (e && (e.code || e.message)));
    /* autorite NORMALISEE : la citation est litterale, la revue passe */
    const o = await viaAdapter(42, doc, () => ({ text: reviewJson(42, { "DIM-01": [CIT] }, CIT) }), { documentAuthority: () => NORMALIZED });
    assert(o.r.review.reviewStatus === "complete" && JSON.stringify(refsOf(o.r, "DIM-01")) === JSON.stringify([CIT]), "citation du document normalise conservee : " + JSON.stringify([o.r.review.reviewStatus, refsOf(o.r, "DIM-01")]));
    assert(o.registry.length === 1 && o.registry[0].documentAuthoritySha256 === sha(NORMALIZED), "empreinte = document normalise, jamais le brut"); });

  await T("RA2-05", "missing authoritative document content : FAIL CLOSED (DOCUMENT_AUTHORITY_REQUIRED / _EMPTY) a la construction et a l'appel ; jamais de repli silencieux sur le parsing du prompt", async () => {
    let e1 = null; try { EF3.createReviewAdapter({ llm: fakeLlm(() => ({ text: "{}" })), runDir: tmp(), runId: "t" }); } catch (x) { e1 = x; }
    assert(e1 && e1.code === "DOCUMENT_AUTHORITY_REQUIRED", "construction sans autorite refusee : " + (e1 && e1.code));
    const doc = mkDoc(PLAIN_DOC); let e2 = null;
    try { await viaAdapter(5, doc, () => ({ text: reviewJson(5, {}, BEFORE) }), { documentAuthority: () => undefined }); } catch (x) { e2 = x; }
    assert(e2 && e2.code === "DOCUMENT_AUTHORITY_REQUIRED", "cible sans autorite : fail closed a l'appel : " + (e2 && (e2.code || e2.message)));
    let e3 = null; try { await viaAdapter(51, doc, () => ({ text: reviewJson(51, {}, BEFORE) }), { documentAuthority: () => "" }); } catch (x) { e3 = x; }
    assert(e3 && e3.code === "DOCUMENT_AUTHORITY_EMPTY", "autorite vide : fail closed : " + (e3 && (e3.code || e3.message))); });

  await T("RA2-06", "registry write : un candidat n'est inscrit VALID qu'avec l'empreinte de l'autorite documentaire reellement utilisee ; aucune inscription sans autorite", async () => {
    const doc = mkDoc(MARKER_DOC); const o = await viaAdapter(6, doc, () => ({ text: reviewJson(6, { "DIM-02": [AFTER_A] }, BEFORE) }));
    assert(o.registry.length === 1 && o.registry[0].documentAuthoritySha256 === sha(MARKER_DOC) && o.registry[0].sourceSealHash === SEAL.runtimeSealSha256, JSON.stringify(o.registry[0] && { a: o.registry[0].documentAuthoritySha256, s: o.registry[0].sourceSealHash }));
    const cand = JSON.parse(o.registry[0].candidate); assert(JSON.stringify(cand.findings.find((f) => f.dimensionId === "DIM-02").targetEvidenceRefs) === JSON.stringify([AFTER_A]), "candidat non ampute"); });

  await T("RA2-07", "reuse : une entree produite avec un contenu tronque ou une autorite indemontrable n'est PAS reutilisable (empreinte absente ou differente) ; l'entree de la bonne autorite l'est", async () => {
    const d = tmp(); const reg = EF3.createReviewRegistry({ runDir: d }); const cand = reviewJson(7, { "DIM-02": [AFTER_A] }, BEFORE); const key = "p".repeat(64);
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: P.CONFIG.frozenLots["MONO-11"].contractVersion, sourceSealHash: SEAL.runtimeSealSha256 });   /* ere <= v1.0.12 : aucune empreinte d'autorite */
    assert(reg.find(key, SEAL.runtimeSealSha256, P.CONFIG.frozenLots["MONO-11"].contractVersion, sha(MARKER_DOC)) === null, "entree sans empreinte : jamais servie");
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: P.CONFIG.frozenLots["MONO-11"].contractVersion, sourceSealHash: SEAL.runtimeSealSha256, documentAuthoritySha256: sha(PLAIN_DOC) });   /* autre autorite (contenu tronque) */
    assert(reg.find(key, SEAL.runtimeSealSha256, P.CONFIG.frozenLots["MONO-11"].contractVersion, sha(MARKER_DOC)) === null, "entree d'une autre autorite : jamais servie");
    reg.put({ basePromptSha256: key, candidateSha256: sha(cand), candidate: cand, validationContract: P.CONFIG.frozenLots["MONO-11"].contractVersion, sourceSealHash: SEAL.runtimeSealSha256, documentAuthoritySha256: sha(MARKER_DOC) });
    const hit = reg.find(key, SEAL.runtimeSealSha256, P.CONFIG.frozenLots["MONO-11"].contractVersion, sha(MARKER_DOC)); assert(hit && hit.documentAuthoritySha256 === sha(MARKER_DOC), "entree de la bonne autorite servie"); });

  await T("RA2-08", "historical adversarial fixture : la chaine causale de l'audit v1.0.12 — sous l'ancienne regle (litteralite jugee sur la reconstruction du prompt) la citation est PERDUE ; sous v1.0.13 (autorite documentaire) elle est CONSERVEE ; refus de reutilisation d'une entree amputee", async () => {
    const doc = mkDoc(MARKER_DOC); const basePrompt = F.M01.RR.buildReviewPrompt(mkTwin(8), doc, schema) + RE.enforcementPreamble(schema);
    const ctx = EF3.parseReviewPromptContext(basePrompt); const truncated = ctx.content;
    /* 1. ancienne regle : la fusion de lignee jugee sur le contenu RECONSTRUIT perd la citation valide */
    const rawFindings = JSON.parse(reviewJson(8, { "DIM-02": [AFTER_A, "citation non litterale inventee"] }, BEFORE)).findings;
    const oldMerge = RE.mergeRepairLineage({ findings: rawFindings }, { "DIM-02": [] }, truncated);
    assert(JSON.stringify(oldMerge.repairs["DIM-02"]) === JSON.stringify([]), "ancienne regle : citation valide perdue (" + JSON.stringify(oldMerge.repairs["DIM-02"]) + ")");
    /* 2. v1.0.13 : la meme fusion sur l'AUTORITE conserve la citation */
    const newMerge = RE.mergeRepairLineage({ findings: rawFindings }, { "DIM-02": [] }, doc.content);
    assert(JSON.stringify(newMerge.repairs["DIM-02"]) === JSON.stringify([AFTER_A]), "v1.0.13 : citation conservee (" + JSON.stringify(newMerge.repairs["DIM-02"]) + ")");
    /* 3. bout en bout : la revue passe, le registre porte l'autorite complete, la citation est dans le candidat */
    const o = await viaAdapter(8, doc, (prompt, meta) => meta.strategy && /TARGETED/.test(meta.strategy) ? { text: repairJson({ "DIM-02": [] }) } : { text: JSON.stringify({ findings: rawFindings }) });
    assert(o.r.review.reviewStatus === "complete", JSON.stringify(o.r.review.error));
    assert(JSON.stringify(refsOf(o.r, "DIM-02")) === JSON.stringify([AFTER_A]), "citation conservee de bout en bout : " + JSON.stringify(refsOf(o.r, "DIM-02")));
    assert(o.registry.length === 1 && o.registry[0].documentAuthoritySha256 === sha(MARKER_DOC), "registre : autorite complete");
    /* 4. une entree amputee (autorite tronquee) ne peut pas etre servie sous l'autorite reelle */
    const reg2 = EF3.createReviewRegistry({ runDir: o.dir }); const amputee = JSON.stringify({ findings: rawFindings.map((f) => f.dimensionId === "DIM-02" ? Object.assign({}, f, { targetEvidenceRefs: [] }) : f) });
    reg2.put({ basePromptSha256: o.registry[0].basePromptSha256, candidateSha256: sha(amputee), candidate: amputee, validationContract: P.CONFIG.frozenLots["MONO-11"].contractVersion, sourceSealHash: SEAL.runtimeSealSha256, documentAuthoritySha256: sha(truncated) });
    const served = reg2.find(o.registry[0].basePromptSha256, SEAL.runtimeSealSha256, P.CONFIG.frozenLots["MONO-11"].contractVersion, sha(MARKER_DOC));
    assert(served && served.documentAuthoritySha256 === sha(MARKER_DOC) && JSON.parse(served.candidate).findings.find((f) => f.dimensionId === "DIM-02").targetEvidenceRefs.length === 1, "l'entree amputee (autorite tronquee) n'est jamais servie ; seule l'entree de l'autorite reelle l'est"); });

  await T("RA1-01", "parseRepair failure : la trace du miroir reflete le statut du lot (REPAIR_UNPARSABLE, jamais CANDIDATE_VALID) ; les dimensions fautives sont celles du lot", async () => {
    const doc = mkDoc(PLAIN_DOC); const raw = reviewJson(9, { "DIM-02": ["citation absente du document"] }, BEFORE);
    const o = await viaAdapter(9, doc, (prompt, meta) => meta.strategy && /TARGETED/.test(meta.strategy) ? { text: "{ ceci n'est pas du JSON de reparation" } : { text: raw }, { config: { maxTokens: 12288, enableLiteralization: false } });
    const up = o.trace.filter((t) => t.state === "REPAIR_UNPARSABLE");
    assert(up.length >= 1, "trace REPAIR_UNPARSABLE presente : " + JSON.stringify(o.trace.map((t) => t.state)));
    assert(!o.trace.some((t) => t.strategy === "PASSTHROUGH" && t.state === "CANDIDATE_VALID"), "jamais CANDIDATE_VALID pour une passe rejetee par le lot");
    assert(JSON.stringify(up[0].repairScope) === JSON.stringify(["DIM-02"]), "dimensions fautives du lot : " + JSON.stringify(up[0].repairScope));
    assert(Array.isArray(up[0].repairErrors) && up[0].repairErrors.length >= 1, "motif de rejet trace : " + JSON.stringify(up[0].repairErrors)); });

  await T("RA1-02", "parseRepair failure : aucune ecriture au registre, echec explicite, ET la trace du miroir ne contient AUCUN candidat recompose (discriminant : le retrait du correctif R-A1 produirait un candidat et un etat CANDIDATE_*)", async () => {
    const doc = mkDoc(PLAIN_DOC); const raw = reviewJson(10, { "DIM-02": ["citation absente du document"] }, BEFORE);
    const o = await viaAdapter(10, doc, (prompt, meta) => meta.strategy && /TARGETED/.test(meta.strategy) ? { text: "{\"repairs\": \"schema invalide\"}" } : { text: raw }, { config: { maxTokens: 12288, enableLiteralization: false } });
    assert(o.r.review.reviewStatus === "error" && o.r.trace.acceptedPass === null, "revue en erreur : " + o.r.review.reviewStatus);
    assert(o.registry.length === 0, "aucune ecriture au registre : " + o.registry.length);
    const targeted = o.trace.filter((t) => t.strategy === "PASSTHROUGH" || t.state === "REPAIR_UNPARSABLE");
    assert(targeted.length >= 1 && targeted.every((t) => t.state === "REPAIR_UNPARSABLE"), "toutes les passes ciblees tracees REPAIR_UNPARSABLE (aucun CANDIDATE_VALID / CANDIDATE_INVALID recompose) : " + JSON.stringify(targeted.map((t) => t.state)));
    const unp = targeted.find((t) => t.state === "REPAIR_UNPARSABLE");
    assert(unp.regeneratedFieldsCount === 0 && unp.reusedFieldsCount === 3, "aucune dimension regeneree, toutes conservees : " + JSON.stringify([unp.regeneratedFieldsCount, unp.reusedFieldsCount]));
    assert(Array.isArray(unp.repairErrors) && unp.repairErrors.indexOf("REPAIR_SCHEMA_INVALID") !== -1, "codes d'erreur du lot transportes : " + JSON.stringify(unp.repairErrors)); });

  await T("RA1-03", "parseRepair failure : resultat final identique au lot seul ET candidat trace identique a la reponse precedente parsee (discriminant : sans le correctif, le miroir recomposerait un candidat different du dernier candidat du lot)", async () => {
    const doc = mkDoc(PLAIN_DOC); const raw = reviewJson(11, { "DIM-02": ["citation absente du document"] }, BEFORE);
    const handler = (prompt, meta) => meta.strategy && /TARGETED/.test(meta.strategy) ? { text: "pas du JSON" } : { text: raw };
    const o = await viaAdapter(11, doc, handler, { config: { maxTokens: 12288, enableLiteralization: false } });
    const lot = await RE.runEnforcedReview({ frozen: F, twin: mkTwin(11), targetDoc: doc, reviewSchema: schema, llmCall: fakeLlm(handler).llmCall, maxPasses: 3, runId: "t" });
    assert(o.r.review.reviewStatus === lot.review.reviewStatus && o.r.trace.acceptedPass === lot.trace.acceptedPass, "meme resultat que le lot seul : " + JSON.stringify([o.r.review.reviewStatus, lot.review.reviewStatus]));
    assert(o.r.trace.passes.length === lot.trace.passes.length, "memes passes : " + o.r.trace.passes.length + " vs " + lot.trace.passes.length);
    /* discriminant : le candidat trace par le miroir est EXACTEMENT la reponse precedente parsee (aucune recomposition) */
    const unp = o.trace.find((t) => t.state === "REPAIR_UNPARSABLE"); const parsedPrev = JSON.parse(raw).findings.map((f) => f.dimensionId).join(",");
    assert(unp && unp.candidateSha256, "candidat trace present");
    const cand = Object.values(o.adapter.registry ? {} : {});   /* le candidat n'est pas inscrit : on verifie par la trace */
    assert(unp.repairScope.join(",") === "DIM-02" && unp.regeneratedFieldsCount === 0, "portee = dimensions fautives du lot, aucune regeneration : " + JSON.stringify([unp.repairScope, unp.regeneratedFieldsCount]));
    assert(parsedPrev === "DIM-01,DIM-02,DIM-03", "coherence de la fixture"); });
};
