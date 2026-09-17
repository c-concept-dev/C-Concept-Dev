#!/usr/bin/env node
"use strict";
// MONO-10 v0.2 — suite de tests. Aucun reseau, aucun LLM reel, aucun run EF-02, aucune execution aval.
// Usage : node test/test-mono10-v0.2.js <bundleRoot>

const path = require("path"), fs = require("fs"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
if (!fs.existsSync(path.join(KIT, "MONO-01", "index.js"))) {
  console.error("MONO-01 introuvable sous \"" + KIT + "\". Usage: node test/test-mono10-v0.2.js <bundleRoot>");
  process.exit(2);
}
const EV = require("../core/execution-evidence.js");
const LIN = require("../core/lineage.js");
const IDE = require("../core/identity-evidence.js");
const REL = require("../core/relevance.js");
const UNK = require("../core/unknowns.js");
const CA = require("../core/candidate-assessment.js");
const PG = require("../core/panel-gate.js");
const LC = require("../core/llm-capability.js");
const SR = require("../core/scientific-readiness.js");
const SQ = require("../core/scientific-qualification.js");
const DA = require("../core/downstream-authorization.js");
const SUR = require("../core/scientific-unified-report.js");
const FRA = require("../core/final-report-acceptance.js");
const ADAPT = require("../adapters/case-phase-adapter.js");

let pass = 0, fail = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + d : "")); } };
const PROD = { production: true };
const TEST = { production: false };
const now = () => new Date().toISOString();

// ---------- fabriques generiques : aucun domaine, identifiants opaques ----------
const cand = (ref, name, labels, evid, ids, amb) => ({
  candidateRef: ref, displayName: name, disciplines: labels, dimensionRef: labels[0] || null,
  identifiers: ids || [], affiliations: [], candidateStatus: "SEED_CANDIDATE",
  identityAmbiguity: amb || null, evidenceRefs: evid, provenance: [{ origin: "SEED" }],
});
const mkDisc = (missionId, cands) => ({ schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", missionId, candidates: cands });
const mkVer = (disc, statusFn) => ({ schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", missionId: disc.missionId,
  verified: disc.candidates.map((c) => ({ candidateRef: c.candidateRef, displayName: c.displayName, verificationStatus: statusFn ? statusFn(c) : "VERIFIED" })) });
// forme consommee par defaultIdentityExtractor (candidate.identifiers[])
const ID = (type, provider, value, binding, verif, contrib) => ({ type, provider, value, subjectBinding: binding, verificationStatus: verif, confidenceContribution: contrib });
// forme consommee directement par makeIdentityEvidence
const EVID = (type, provider, identifier, binding, verif, contrib) => ({ evidenceType: type, provider, identifier, subjectBinding: binding, verificationStatus: verif, confidenceContribution: contrib });

function assessOf(cands, missionLabels, opts) {
  const disc = mkDisc("m1", cands);
  return CA.assessCandidates(Object.assign({ discovery: disc, verification: mkVer(disc), missionLabels: missionLabels,
    executionEvidenceClass: EV.CLASS.TEST_FIXTURE }, opts || {}));
}
function decide(assessment, fn, cls) {
  const tpl = PG.buildPanelValidationTemplate(assessment, { executionEvidenceClass: cls || EV.CLASS.TEST_FIXTURE });
  tpl.decisions = tpl.decisions.map((d) => Object.assign({}, d, fn(d)));
  return tpl;
}
const humanTest = (decision) => ({ decision, decisionReason: "motif de test explicite", actorType: "human", actorIdentity: "FIXTURE:auditeur", decidedAt: now() });
const humanReal = (decision, who) => ({ decision, decisionReason: "motif reel", actorType: "human", actorIdentity: who || "Personne Reelle", decidedAt: now() });

(async () => {
  console.log("MONO-10 v0.2 — noyau generique, portes humaines, qualification\n");

  // ================= F-01 : aucun couplage de cas dans le noyau =================
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const coreSrc = fs.readdirSync(path.join(__dirname, "..", "core")).map((f) => strip(fs.readFileSync(path.join(__dirname, "..", "core", f), "utf8")));
  check("F01-01. le noyau ne contient aucun identifiant de cas (JMJS / P0.2 / p0_2)",
    !coreSrc.some((s) => /JMJS|p0_2|P0\.2/i.test(s)));
  check("F01-02. le noyau ne contient aucun nom de fournisseur ni de registre",
    !coreSrc.some((s) => /orcid|openalex|crossref|pubmed|anthropic/i.test(s)));
  check("F01-03. le concept generique downstreamUseAuthorized existe",
    typeof DA.resolveDownstreamUseAuthorization === "function" && DA.AUTHORIZATION.AUTHORIZED === "AUTHORIZED");
  check("F01-04. le scan d'hygiene est discriminant", /p0_2/i.test(strip("const x = { p0_2Allowed: true };")));
  check("F01-05. l'adaptateur de cas vit hors du noyau et ne code aucun nom de phase",
    fs.existsSync(path.join(__dirname, "..", "adapters", "case-phase-adapter.js"))
    && !/p0_2|P0\.2|JMJS/i.test(strip(fs.readFileSync(path.join(__dirname, "..", "adapters", "case-phase-adapter.js"), "utf8"))));
  check("F01-06. l'adaptateur exige que le nom de phase soit fourni par l'appelant",
    (function () { try { ADAPT.mapAuthorizationToCasePhase({ schema: "EvidenceForge.DownstreamUseAuthorization", authorization: "AUTHORIZED", reasons: [], downstreamUseAuthorized: true }); return false; }
      catch (e) { return /CASE_PHASE_NAME_REQUIRED/.test(e.message); } })());

  // ================= F-02 : identite generique =================
  const strongTwo = IDE.deriveIdentityConfidence([
    IDE.makeIdentityEvidence(EVID("registry-a", "reg-a", "reg-a://1", "CONFIRMED", "VERIFIED", 0.6)),
    IDE.makeIdentityEvidence(EVID("registry-b", "reg-b", "reg-b://9", "CONFIRMED", "VERIFIED", 0.6)),
  ]);
  check("F02-01. STRONG atteignable SANS aucun identifiant academique (deux registres independants)",
    strongTwo.confidence === IDE.CONFIDENCE.STRONG, strongTwo.confidence);
  const ambBinding = IDE.deriveIdentityConfidence([
    IDE.makeIdentityEvidence(EVID("registry-a", "reg-a", "reg-a://1", "AMBIGUOUS", "VERIFIED", 0.9)),
    IDE.makeIdentityEvidence(EVID("registry-b", "reg-b", "reg-b://9", "CONFIRMED", "VERIFIED", 0.9)),
  ]);
  check("F02-02. une liaison au sujet AMBIGUOUS empeche STRONG, meme avec une preuve forte",
    ambBinding.confidence === IDE.CONFIDENCE.AMBIGUOUS, ambBinding.confidence);
  const conflicting = IDE.deriveIdentityConfidence([
    IDE.makeIdentityEvidence(EVID("registry-a", "reg-a", "reg-a://1", "CONFIRMED", "VERIFIED", 0.6)),
    IDE.makeIdentityEvidence(EVID("registry-a", "reg-a", "reg-a://2", "CONFIRMED", "VERIFIED", 0.6)),
  ]);
  check("F02-03. deux identifiants differents du meme type => AMBIGUOUS", conflicting.confidence === IDE.CONFIDENCE.AMBIGUOUS);
  check("F02-04. un nom seul n'est jamais STRONG",
    IDE.deriveIdentityConfidence([IDE.makeIdentityEvidence({ evidenceType: "display-name", assertedValue: "X", subjectBinding: "ASSERTED" })]).confidence !== IDE.CONFIDENCE.STRONG);
  const single = IDE.deriveIdentityConfidence([IDE.makeIdentityEvidence(EVID("registry-a", "reg-a", "reg-a://1", "CONFIRMED", "VERIFIED", 0.9))]);
  check("F02-05. une source unique, meme verifiee, ne suffit pas a STRONG (corroboration exigee)", single.confidence === IDE.CONFIDENCE.MODERATE, single.confidence);

  // ================= F-02 : pertinence sans egalite de libelles =================
  const r1 = REL.assessRelevance({ candidateLabels: ["civil engineering"], missionLabels: ["engineering"] });
  check("F02-06. \"civil engineering\" vs \"engineering\" n'est JAMAIS hors champ",
    r1.relevance !== REL.RELEVANCE.OUT_OF_SCOPE && r1.relevance === REL.RELEVANCE.PLAUSIBLE, r1.relevance);
  const r2 = REL.assessRelevance({ candidateLabels: ["marine biology"], missionLabels: ["contract law"] });
  check("F02-07. sans oracle, l'absence de recouvrement donne UNKNOWN, jamais OUT_OF_SCOPE",
    r2.relevance === REL.RELEVANCE.UNKNOWN, r2.relevance);
  const r3 = REL.assessRelevance({ candidateLabels: ["marine biology"], missionLabels: ["contract law"],
    semanticOracle: () => ({ related: false, explicit: true, reason: "domaines disjoints" }) });
  check("F02-08. OUT_OF_SCOPE n'est prononce que sur avis EXPLICITE d'un oracle injecte", r3.relevance === REL.RELEVANCE.OUT_OF_SCOPE);
  check("F02-09. un oracle qui relie deux libelles produit SUPPORTED",
    REL.assessRelevance({ candidateLabels: ["hydro"], missionLabels: ["water"], semanticOracle: () => ({ related: true }) }).relevance === REL.RELEVANCE.SUPPORTED);
  check("F02-10. aucune taxonomie metier dans le module de pertinence",
    !/discipline|profession|medic|legal|engineer/i.test(strip(fs.readFileSync(path.join(__dirname, "..", "core", "relevance.js"), "utf8"))));

  // ================= assessment =================
  const A = assessOf([
    cand("reg-a://1", "Alpha", ["civil engineering"], ["w1", "w2"], [ID("registry-b", "reg-b", "reg-b://1", "CONFIRMED", "VERIFIED", 0.6)]),
    cand("reg-a://2", "Beta", ["engineering"], []),
    cand(null, "Gamma", ["engineering"], ["w3"], [], "HOMONYM"),
  ], ["engineering"]);
  check("A-01. seuls les candidats a base suffisante sont presentes",
    A.summary.presentedForHumanReview === 1 && A.summary.insufficientDocumentaryBasis === 1 && A.summary.identityAmbiguous === 1, JSON.stringify(A.summary));
  check("A-02. aucun etat ne vaut approbation ni jugement de competence",
    Object.values(CA.STATUS).every((s) => !/APPROVE|EXPERT|PANEL_MEMBER/.test(s)) && /jamais.*jugement|aucun.*jugement/i.test(CA.NOT_A_JUDGEMENT));
  check("A-03. INSUFFICIENT est borne a CE RUN, jamais un rejet de la personne",
    /DANS CE RUN/.test(CA.NOT_A_JUDGEMENT) && !/NOT_EXPERT|IRRELEVANT_PERSON|REJECTED_PROFESSIONAL/.test(JSON.stringify(A)));
  check("A-04. lineageRefs et evidenceRefs obligatoires", A.assessments.every((a) => a.lineageRefs.length > 0));
  check("A-05. les ecarts produisent des unknowns traces", A.unknowns.length >= 2, "unknowns=" + A.unknowns.length);

  // ================= F-03 : binding reel de la porte =================
  const V = decide(A, (d) => humanTest(PG.DECISION.APPROVE));
  check("P01-base. une porte coherente est valide en mode test", PG.validatePanelValidation(V, A, TEST).valid === true,
    JSON.stringify(PG.validatePanelValidation(V, A, TEST).problems));
  const A2 = JSON.parse(JSON.stringify(A)); A2.assessments[0].missionEvidenceRefs = ["PREUVE-CHANGEE"];
  check("P03. un changement de evidenceRefs invalide l'approbation", PG.validatePanelValidation(V, A2, TEST).valid === false);
  const A3 = JSON.parse(JSON.stringify(A)); A3.missionLabels = ["autre-mission"];
  check("P02. un changement de mission invalide l'approbation", PG.validatePanelValidation(V, A3, TEST).valid === false);
  const A4 = JSON.parse(JSON.stringify(A)); A4.assessments[0].candidateId = "reg-a://999";
  check("P04. un changement de candidateId invalide l'approbation", PG.validatePanelValidation(V, A4, TEST).valid === false);
  const A5 = JSON.parse(JSON.stringify(A)); A5.policy.minMissionEvidenceRefs = 99;
  check("P01. un changement de l'evaluation invalide l'approbation (hash recalcule)", PG.validatePanelValidation(V, A5, TEST).valid === false);
  check("P05. une porte de fixture est refusee en PRODUCTION", PG.validatePanelValidation(V, A, PROD).valid === false);
  const VD = decide(A, () => humanTest(PG.DECISION.DEFER));
  const rd = PG.validatePanelValidation(VD, A, TEST);
  check("P06. DEFER reste DEFER et n'approuve personne", rd.valid === true && rd.approved.length === 0 && rd.counts.DEFER === 1);
  check("P07. ORCID n'existe pas dans le noyau : aucune approbation ne peut en deriver",
    !coreSrc.some((s) => /orcid/i.test(s)) && rd.approved.length === 0);

  // ================= F-05 / F-12 : capacite LLM =================
  const cfg = { providerId: "worker-x", modelId: "model-y", workerBindingId: "bind-z", authMode: "direct", credentialPresent: true };
  const tOk = async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}', requestId: "req-1", costUsd: 0.0001 });
  const capTest = await LC.runActiveProbe(cfg, tOk, { executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  const capReal = await LC.runActiveProbe(cfg, tOk, { executionEvidenceClass: EV.CLASS.REAL_RUNTIME });
  check("L01. dependenciesAvailable.llm=true ne vaut que DECLARED",
    LC.classifyLegacyDeclaration({ llm: true }).status === LC.STATUS.DECLARED
    && LC.assertCapabilityUsable(LC.classifyLegacyDeclaration({ llm: true }), cfg, TEST).usable === false);
  check("L02. providerId absent => UNAVAILABLE", (await LC.runActiveProbe({ modelId: "m", workerBindingId: "b", credentialPresent: true }, tOk, {})).status === LC.STATUS.UNAVAILABLE);
  check("L03. modelId absent => UNAVAILABLE", (await LC.runActiveProbe({ providerId: "p", workerBindingId: "b", credentialPresent: true }, tOk, {})).status === LC.STATUS.UNAVAILABLE);
  check("L04. requestId absent => jamais AVAILABLE",
    (await LC.runActiveProbe(cfg, async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}' }), {})).status !== LC.STATUS.AVAILABLE);
  check("L05. horodatage absent => jamais utilisable", LC.assertCapabilityUsable(Object.assign({}, capReal, { probeTimestamp: null }), cfg, TEST).usable === false);
  check("L06. credentialPresenceAttested=false => jamais AVAILABLE",
    (await LC.runActiveProbe(Object.assign({}, cfg, { credentialPresent: false }), tOk, {})).status !== LC.STATUS.AVAILABLE);
  check("L07. schema invalide => DEGRADED, jamais AVAILABLE",
    (await LC.runActiveProbe(cfg, async () => ({ httpStatus: 200, text: "oui", requestId: "r" }), {})).status === LC.STATUS.DEGRADED);
  check("L08. texte autour du JSON => rejete",
    !LC.validateProbePayload('oui {"ok":true,"probe":"evidenceforge"}').valid && !LC.validateProbePayload('{"ok":true,"probe":"evidenceforge"} fin').valid);
  check("L09. champ supplementaire => rejete (schema ferme)", !LC.validateProbePayload('{"ok":true,"probe":"evidenceforge","x":1}').valid);
  check("L09b. champ manquant => rejete", !LC.validateProbePayload('{"ok":true}').valid);
  check("L10. sonde de fixture jamais recevable en production",
    LC.assertCapabilityUsable(capTest, cfg, PROD).usable === false && LC.assertCapabilityUsable(capReal, cfg, PROD).usable === true);
  check("L11. aucun secret n'est stocke", !/sk-|api[_-]?key|secret/i.test(JSON.stringify(capReal)) && typeof capReal.credentialPresenceAttested === "boolean");
  check("L12. la sonde n'utilise aucune donnee de mission ni de cas", capReal.probeContract.usesMissionData === false && capReal.probeContract.usesCaseData === false);

  // ================= F-06 : unknowns =================
  const u1 = UNK.makeUnknown({ originArtifact: "assessment", reason: "relation inconnue", blockingStatus: UNK.BLOCKING.NON_BLOCKING });
  const uB = UNK.makeUnknown({ originArtifact: "assessment", reason: "identite ambigue", blockingStatus: UNK.BLOCKING.BLOCKING });
  // Assessment PROPRE pour la chaine readiness/qualification : A contient un
  // candidat ambigu, qui produit legitimement un unknown BLOQUANT. Melanger les
  // deux masquerait ce que U05 et U06 cherchent a distinguer.
  const AC = assessOf([cand("reg-a://1", "Alpha", ["civil engineering"], ["w1", "w2"],
    [ID("registry-b", "reg-b", "reg-b://1", "CONFIRMED", "VERIFIED", 0.6)])], ["engineering"]);
  const VC = decide(AC, () => humanTest(PG.DECISION.APPROVE));
  const refs = [LIN.artifactRef(AC, "a"), LIN.artifactRef(VC, "v")];
  const preU = SR.evaluateReadiness({ phase: "PRE", candidateAssessment: AC, panelValidation: VC, llmNodesWillRun: false, lineageRefs: refs, upstreamUnknowns: [u1], executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  check("U01. un unknown amont survit au readiness PRE", preU.unknowns.some((u) => u.unknownId === u1.unknownId));
  const twinSet = { twins: [{ twinId: "t1" }] }, reviewSet = { reviews: [{ reviewStatus: "complete" }], summary: { targets: 1 } };
  const fullU = SR.evaluateReadiness({ phase: "FULL", candidateAssessment: AC, panelValidation: VC, llmCapability: capTest, llmConfig: cfg,
    lineageRefs: refs, upstreamUnknowns: [u1], professionalCorpus: { professionalCorpora: [{}] }, twinSet, reviewSet, aggregation: { aggregates: [{}] }, executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  check("U02. un unknown survit au readiness FULL", fullU.unknowns.some((u) => u.unknownId === u1.unknownId));
  const qU = SQ.qualifyProcess({ readinessPre: preU, readinessFull: fullU, candidateAssessment: AC, panelValidation: VC,
    llmCapability: capTest, llmConfig: cfg, reviewSet, lineageRefs: refs, executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  check("U03. un unknown survit a la qualification", qU.unknowns.some((u) => u.unknownId === u1.unknownId), "unknowns=" + qU.unknowns.length);
  const priorReport = { schema: "EvidenceForge.UnifiedReportSummary", schemaVersion: "EF-04A-v1", mission: { missionId: "m1" },
    testStatus: { testMode: true, scientificValidity: false, humanProfessionalValidation: false } };
  const rep = SUR.buildScientificUnifiedReport({ priorReport, priorVerdict: "OUTCOME_A", candidateAssessment: AC, panelValidation: VC,
    llmCapability: capTest, readinessPre: preU, readinessFull: fullU, qualification: qU, executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  check("U04. un unknown survit au rapport unifie", rep.unknowns.some((u) => u.unknownId === u1.unknownId));
  const fullB = SR.evaluateReadiness({ phase: "FULL", candidateAssessment: AC, panelValidation: VC, llmCapability: capTest, llmConfig: cfg,
    lineageRefs: refs, upstreamUnknowns: [uB], professionalCorpus: { professionalCorpora: [{}] }, twinSet, reviewSet, aggregation: { aggregates: [{}] }, executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  const qB = SQ.qualifyProcess({ readinessPre: preU, readinessFull: fullB, candidateAssessment: AC, panelValidation: VC,
    llmCapability: capTest, llmConfig: cfg, reviewSet, lineageRefs: refs, upstreamUnknowns: [uB], executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  check("U05. un unknown BLOQUANT empeche QUALIFIED", qB.qualificationStatus === SQ.QUALIFICATION.NOT_QUALIFIED, qB.qualificationStatus);
  check("U06. un unknown non bloquant permet au mieux QUALIFIED_WITH_RESERVATIONS et reste visible",
    qU.qualificationStatus === SQ.QUALIFICATION.WITH_RESERVATIONS && qU.reservations.some((r) => /inconnu non bloquant/.test(r)), qU.qualificationStatus);
  check("U07. une resolution exige une preuve explicite",
    (function () { try { UNK.transition(u1, "RESOLVED", { reason: "ok" }); return false; } catch (e) { return e.code === "UNKNOWN_TRANSITION_REQUIRES_EVIDENCE"; } })()
    && UNK.transition(u1, "RESOLVED", { reason: "ok", evidenceRefs: ["e"] }).status === "RESOLVED");
  check("U08. une suppression silencieuse est detectee",
    (function () { try { UNK.assertNoSilentLoss([u1, uB], [uB], "t"); return false; } catch (e) { return e.code === "UNKNOWN_SILENTLY_DROPPED"; } })());

  // ================= lignee vide =================
  check("LN-01. une lignee vide donne NOT_READY, jamais READY",
    SR.evaluateReadiness({ phase: "PRE", candidateAssessment: AC, panelValidation: VC, llmNodesWillRun: false, lineageRefs: [], executionEvidenceClass: EV.CLASS.TEST_FIXTURE }).status === SR.READINESS.NOT_READY);
  check("LN-02. une lignee vide donne NOT_QUALIFIED",
    SQ.qualifyProcess({ readinessPre: preU, readinessFull: fullU, candidateAssessment: AC, panelValidation: VC, llmCapability: capTest, llmConfig: cfg, reviewSet, lineageRefs: [], executionEvidenceClass: EV.CLASS.TEST_FIXTURE }).qualificationStatus === SQ.QUALIFICATION.NOT_QUALIFIED);

  // ================= F-04 : la qualification appelle les validateurs =================
  const qProd = SQ.qualifyProcess({ readinessPre: preU, readinessFull: fullU, candidateAssessment: AC, panelValidation: VC,
    llmCapability: capTest, llmConfig: cfg, reviewSet, lineageRefs: refs, production: true, executionEvidenceClass: EV.CLASS.REAL_RUNTIME });
  check("F04-01. en mode production, une porte de fixture fait echouer la qualification",
    qProd.qualificationStatus === SQ.QUALIFICATION.NOT_QUALIFIED, qProd.qualificationStatus);
  check("F04-02. la qualification rapporte l'echec de validation, pas un statut de surface",
    qProd.criteria.some((c) => c.id === "panel_gate_validated" && c.satisfied === false));
  check("F04-03. une capacite de fixture fait echouer la qualification en production",
    qProd.criteria.some((c) => c.id === "llm_capability_validated" && c.satisfied === false));

  // ================= capacite n'est pas qualification =================
  const qNoPanel = SQ.qualifyProcess({ readinessPre: preU, readinessFull: fullU, candidateAssessment: A, panelValidation: decide(AC, () => humanTest(PG.DECISION.REJECT)),
    llmCapability: capTest, llmConfig: cfg, reviewSet, lineageRefs: refs, executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  check("CAP-01. AVAILABLE avec un panel vide ne qualifie jamais", qNoPanel.qualificationStatus === SQ.QUALIFICATION.NOT_QUALIFIED);

  // ================= verdict anterieur =================
  ["OUTCOME_A", "OUTCOME_B", "NO_GO"].forEach(function (v) {
    const p = SQ.applyPriorVerdictPolicy(qNoPanel, v);
    check("VD-" + v + ". NOT_QUALIFIED conserve le verdict anterieur et bloque son usage",
      p.priorVerdict === v && p.priorVerdictPreserved === true && p.scientificallyActionableVerdict === SQ.ACTIONABLE_NONE);
  });
  check("VD-sep. la qualification ne choisit jamais le verdict", qU.scope === "PROCESS_ONLY" && qU.doesNotDecideVerdict === true && !("finalVerdict" in qU));

  // ================= rapport =================
  const priorHash = LIN.sha256Of(priorReport);
  check("R-01. le rapport anterieur n'est jamais mute",
    LIN.sha256Of(priorReport) === priorHash && SUR.assertPriorUntouched(rep, priorReport) === true);
  check("R-02. les drapeaux anterieurs sont reproduits a l'identique", rep.priorScientificValidity === false && rep.priorTestMode === true);
  check("R-03. toutes les references sont liees par empreinte", rep.lineage.length >= 6 && rep.lineage.every((r) => /^[0-9a-f]{64}$/.test(r.sha256)));
  check("R-04. le rapport ne porte aucun champ specifique a un cas", !/p0_2|P0\.2|JMJS/i.test(JSON.stringify(rep)));

  // ================= autorisation aval generique =================
  const accTpl = FRA.buildAcceptanceTemplate(rep, { executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  const acc = Object.assign({}, accTpl, humanTest(FRA.DECISION.ACCEPT_WITH_RESERVATIONS));
  const authNoAcc = DA.resolveDownstreamUseAuthorization({ qualification: qU, report: rep, lineageRefs: rep.lineage, acceptanceValidator: FRA.validateAcceptance, executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  check("DA-01. sans acceptation humaine requise et absente => DEFERRED", authNoAcc.authorization === DA.AUTHORIZATION.DEFERRED);
  const authOk = DA.resolveDownstreamUseAuthorization({ qualification: qU, report: rep, acceptance: acc, lineageRefs: rep.lineage, acceptanceValidator: FRA.validateAcceptance, executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  check("DA-02. avec qualification suffisante et acceptation valide => AUTHORIZED", authOk.authorization === DA.AUTHORIZATION.AUTHORIZED, JSON.stringify(authOk.reasons));
  const authNQ = DA.resolveDownstreamUseAuthorization({ qualification: qNoPanel, report: rep, acceptance: acc, lineageRefs: rep.lineage, acceptanceValidator: FRA.validateAcceptance, executionEvidenceClass: EV.CLASS.TEST_FIXTURE });
  check("DA-03. NOT_QUALIFIED => NOT_AUTHORIZED, verdict anterieur intact", authNQ.authorization === DA.AUTHORIZATION.NOT_AUTHORIZED && rep.priorVerdict === "OUTCOME_A");
  check("DA-04. l'autorisation ne reecrit jamais le verdict", authOk.rewritesVerdict === false && !("priorVerdict" in authOk));
  check("DA-05. une acceptation portant un champ de verdict est refusee",
    FRA.validateAcceptance(Object.assign({}, acc, { finalVerdict: "OUTCOME_B" }), rep, TEST).valid === false);
  check("DA-06. une acceptation de fixture est refusee en production", FRA.validateAcceptance(acc, rep, PROD).valid === false);
  check("DA-07. l'adaptateur de cas traduit sans toucher au noyau",
    (function () { const m = ADAPT.mapAuthorizationToCasePhase(authOk, "PHASE_SUIVANTE"); return m.PHASE_SUIVANTE_ALLOWED === true && m.derivedFromGenericField === "downstreamUseAuthorized"; })());

  // ================= universalite : 4 domaines + cas supplementaire =================
  const DOMAINS = [
    { n: 1, label: "ingenierie", mission: ["engineering"], c: cand("reg://eng/1", "A", ["civil engineering"], ["w1"], [ID("chamber", "chamber", "ch://1", "CONFIRMED", "VERIFIED", 0.6)]) },
    { n: 2, label: "juridique", mission: ["law"], c: cand("bar://p/1", "B", ["administrative law"], ["w1"], [ID("court-registry", "court", "court://9", "CONFIRMED", "VERIFIED", 0.6)]) },
    { n: 3, label: "environnemental", mission: ["water management"], c: cand("env://1", "C", ["water"], ["w1"], [ID("agency", "agency", "ag://1", "CONFIRMED", "VERIFIED", 0.6)]) },
    { n: 4, label: "sciences humaines", mission: ["social research"], c: cand("hum://1", "D", ["social research methods"], ["w1"], [ID("institute", "inst", "in://1", "CONFIRMED", "VERIFIED", 0.6)]) },
  ];
  const uniResults = DOMAINS.map(function (dm) {
    const a = assessOf([dm.c], dm.mission);
    return { n: dm.n, ok: a.summary.presentedForHumanReview === 1, conf: a.assessments[0].identityConfidence, rel: a.assessments[0].relevance };
  });
  uniResults.forEach((r) => check("UNI-" + r.n + ". le moteur traite le domaine " + DOMAINS[r.n - 1].label + " sans code metier (identite " + r.conf + ", pertinence " + r.rel + ")", r.ok && r.conf === IDE.CONFIDENCE.STRONG));
  const noAcad = assessOf([cand("registry://order/778", "Sans registre academique", ["structural safety"], ["w1"], [ID("order", "order", "ord://778", "CONFIRMED", "VERIFIED", 0.6)])], ["safety engineering"]);
  check("UNI-5. aucun identifiant academique, libelles proches mais non identiques : presente avec identite STRONG",
    noAcad.summary.presentedForHumanReview === 1 && noAcad.assessments[0].identityConfidence === IDE.CONFIDENCE.STRONG
    && noAcad.assessments[0].relevance !== REL.RELEVANCE.OUT_OF_SCOPE,
    noAcad.assessments[0].identityConfidence + "/" + noAcad.assessments[0].relevance);

  // ================= non-regression =================
  const h = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  let cmp = 0, div = 0;
  for (const sub of ["dependencies", "ports", "lib"]) {
    const X = path.join(KIT, "MONO-01", sub), Y = path.join(KIT, "MONO-02", "dependencies", "MONO-01", sub);
    if (!fs.existsSync(X) || !fs.existsSync(Y)) continue;
    for (const f of fs.readdirSync(X)) { const pa = path.join(X, f), pb = path.join(Y, f);
      if (fs.statSync(pa).isDirectory()) continue; cmp++; if (!fs.existsSync(pb) || h(pa) !== h(pb)) div++; }
  }
  check("NR-01. MONO-01 byte-identique a la copie imbriquee dans MONO-02", cmp > 0 && div === 0, "compares=" + cmp + " divergents=" + div);
  check("NR-02. MONO-09 v0.1/v0.2 et MONO-10 v0.1 conformes a leurs propres SHA256SUMS",
    [["MONO-09", "v0.1"], ["MONO-09", "v0.2"], ["MONO-10", "v0.1"]].every(function (p) {
      const dir = path.join(KIT, p[0], p[1]); const f = path.join(dir, "SHA256SUMS.txt");
      if (!fs.existsSync(f)) return false;
      return fs.readFileSync(f, "utf8").trim().split("\n").every(function (line) {
        const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) return false;
        const fp = path.join(dir, m[2]); return fs.existsSync(fp) && h(fp) === m[1]; });
    }));

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
