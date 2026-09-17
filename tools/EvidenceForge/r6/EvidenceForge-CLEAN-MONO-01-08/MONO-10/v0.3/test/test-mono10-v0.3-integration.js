#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.3 — test d'integration.
 *
 * §21 — ce test importe l'adaptateur a porte REELLEMENT LIVRE
 * (`core/panel-gated-adapter.js`), pas une copie locale definie dans le test.
 * Si le module livre disparaissait ou changeait de contrat, ce test tomberait.
 *
 * Aucun reseau, aucun LLM reel, aucun run EF-02, aucune execution aval.
 * Le manifeste de run est declare TEST — parce qu'il l'est. La derniere section
 * prouve que cette meme chaine ne peut PAS etre presentee comme une preuve de
 * production.
 */

const path = require("path"), fs = require("fs");

const RM = require("../core/run-evidence-manifest.js");
const LIN = require("../core/lineage.js");
const UNK = require("../core/unknowns.js");
const CA = require("../core/candidate-assessment.js");
const PG = require("../core/panel-gate.js");
const EE = require("../core/effective-eligibility.js");
const PGA = require("../core/panel-gated-adapter.js");          // <-- module LIVRE
const LC = require("../core/llm-capability.js");
const SR = require("../core/scientific-readiness.js");
const SQ = require("../core/scientific-qualification.js");
const SUR = require("../core/scientific-unified-report.js");
const FRA = require("../core/final-report-acceptance.js");
const DA = require("../core/downstream-authorization.js");
const CASE = require("../adapters/case-phase-adapter.js");
const AUTHAD = require("../adapters/declared-authority-identity-adapter.js");

let pass = 0, fail = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + d : "")); } };
const now = () => new Date().toISOString();
const threw = (fn, code) => { try { fn(); return false; } catch (e) { return code ? String(e.message).indexOf(code) === 0 : true; } };

(async () => {
  console.log("MONO-10 v0.3 — integration de bout en bout (mode TEST assume)\n");

  // ---------- 0. manifeste de run : TEST, parce que c'en est un ----------
  const man = RM.createRunEvidenceManifest({
    runId: "run-integration-v03", executionMode: RM.MODE.TEST,
    producers: [{ producerId: "MONO-10", producerVersion: "v0.3" }],
    missionBinding: { missionId: "mission-integration" },
  });
  check("I-01. le manifeste du run declare honnetement le mode TEST", man.executionMode === RM.MODE.TEST && RM.assertManifest(man));

  // ---------- 1. artefacts amont (fixtures opaques, aucun domaine) ----------
  const mk = (ref) => ({
    candidateRef: ref, displayName: "Sujet " + ref, disciplines: ["libelle-alpha"], dimensionRef: "libelle-alpha",
    identifiers: [{ type: "seconde-source", value: "second:" + ref, sourceAuthorityId: "AUT-B", sourceFamilyId: "FAM-2", subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 }],
    affiliations: [], candidateStatus: "SEED_CANDIDATE", sourceAuthorityId: "AUT-A", sourceFamilyId: "FAM-1",
    evidenceRefs: ["oeuvre-1", "oeuvre-2"], provenance: [{ origin: "SEED" }],
  });
  const discovery = { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", missionId: "mission-integration", candidates: [mk("c-1"), mk("c-2"), mk("c-3")] };
  const verification = {
    schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", missionId: "mission-integration",
    verified: [
      { candidateRef: "c-1", displayName: "Sujet c-1", verificationStatus: "UNVERIFIED" },
      { candidateRef: "c-2", displayName: "Sujet c-2", verificationStatus: "VERIFIED" },
      { candidateRef: "c-3", displayName: "Sujet c-3", verificationStatus: "VERIFIED" },
    ],
  };

  // ---------- 2. evaluation documentaire ----------
  const assessment = CA.assessCandidates({
    discovery: discovery, verification: verification, missionLabels: ["libelle-alpha"],
    identityExtractor: AUTHAD.createDeclaredAuthorityExtractor({}),   // table vide : rien n'est presume
  });
  check("I-02. les trois candidats sont presentes a une revue humaine, sans decider a sa place",
    assessment.summary.presentedForHumanReview === 3 && assessment.assessments.every((a) => a.assessmentStatus === CA.STATUS.PRESENT),
    JSON.stringify(assessment.summary));

  // ---------- 3. porte humaine ----------
  const tpl = PG.buildPanelValidationTemplate(assessment);
  check("I-03. le gabarit de porte humaine ne pre-remplit aucune decision",
    tpl.decisions.length === 3 && tpl.decisions.every((d) => d.decision === null && d.actorIdentity === null));

  const acts = { "c-1": PG.DECISION.APPROVE, "c-2": PG.DECISION.APPROVE, "c-3": PG.DECISION.DEFER };
  const validation = Object.assign({}, tpl, {
    decisions: tpl.decisions.map((d) => Object.assign({}, d, {
      decision: acts[d.candidateId], decisionReason: "motif consigne par l'auditeur pour " + d.candidateId,
      actorType: "human", actorIdentity: "FIXTURE:auditeur d'integration", decidedAt: now(),
    })),
  });
  const pv = PG.validatePanelValidation(validation, assessment, { production: false });
  check("I-04. la porte humaine est valide, exhaustive et liee a l'evaluation", pv.valid && pv.approved.length === 2, pv.problems.join(" ; "));

  // ---------- 4. adaptateur A PORTE LIVRE ----------
  const baseAdapter = {
    async discoverProfessionals() { return discovery; },
    async verifyProfessionals() { return Object.assign({}, verification, { summary: { total: 3 } }); },
    async buildProfessionalCorpus(inputs) {
      return { schema: "EvidenceForge.ProfessionalCorpusSet", missionId: "mission-integration",
        professionalCorpora: inputs.professionalVerification.verified.map((v) => ({ professionalRef: v.candidateRef, works: v.evidenceRefs || ["oeuvre-1"] })) };
    },
  };
  const gated = PGA.createPanelGatedAdapter(baseAdapter, { panelValidation: validation, candidateAssessment: assessment, production: false });
  check("I-05. l'adaptateur consomme est bien le module livre du lot",
    require.resolve("../core/panel-gated-adapter.js") === path.join(__dirname, "..", "core", "panel-gated-adapter.js")
    && gated.gateId === PGA.GATE_ID);

  const verified = await gated.verifyProfessionals({}, {});
  const c1 = verified.verified.filter((v) => v.candidateRef === "c-1")[0];
  const c3 = verified.verified.filter((v) => v.candidateRef === "c-3")[0];
  check("I-06. le constat amont est conserve intact et l'eligibilite est un champ SEPARE",
    c1.verificationStatus === "UNVERIFIED" && c1.legacyVerificationStatus === "UNVERIFIED"
    && c1.effectiveCorpusEligibility === EE.ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL
    && c3.verificationStatus === "VERIFIED" && c3.effectiveCorpusEligibility === EE.ELIGIBILITY.DEFERRED,
    c1.verificationStatus + "/" + c1.effectiveCorpusEligibility + " | " + c3.verificationStatus + "/" + c3.effectiveCorpusEligibility);

  const corpusSet = await gated.buildProfessionalCorpus({ professionalVerification: verified }, {});
  check("I-07. seuls les approuves atteignent le corpus ; le defere est retenu sans etre rejete",
    corpusSet.professionalCorpora.length === 2 && !corpusSet.professionalCorpora.some((p) => p.professionalRef === "c-3"),
    JSON.stringify(corpusSet.professionalCorpora.map((p) => p.professionalRef)));

  // ---------- 5. capacite LLM constatee (transport injecte, aucun reseau) ----------
  const llmConfig = { providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture", credentialPresent: true };
  const transport = async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}', requestId: "req-integration", credentialProbeSkipped: false, costUsd: 0 });
  const capability = await LC.runActiveProbe(llmConfig, transport, {});
  check("I-08. la capacite est CONSTATEE par sonde active complete, jamais declaree",
    capability.status === LC.STATUS.AVAILABLE && capability.probeExecuted === true
    && capability.credentialProbeSkippedAttested === true && LC.assertCapabilityUsable(capability, llmConfig, {}).usable,
    capability.status + " / " + capability.failureReason);

  // ---------- 6. artefacts aval fictifs mais coherents ----------
  const twinSet = { schema: "EvidenceForge.DocumentaryTwinSet", twins: corpusSet.professionalCorpora.map((p) => ({ twinRef: "twin-" + p.professionalRef, professionalRef: p.professionalRef })) };
  const reviewSet = {
    schema: "EvidenceForge.ReviewSet",
    reviews: twinSet.twins.map((t) => ({ reviewRef: "review-" + t.twinRef, twinRef: t.twinRef, targetRef: "cible-1", reviewStatus: "complete" })),
    summary: { targets: 1 },
  };
  const aggregation = { schema: "EvidenceForge.Aggregation", aggregates: [{ aggregateRef: "agg-1", reviews: reviewSet.reviews.length }] };

  // ---------- 7. registre de lignee : les artefacts REELLEMENT disponibles ----------
  const named = [
    ["professional-discovery", discovery], ["professional-verification", verification],
    ["candidate-assessment", assessment], ["panel-validation", validation],
    ["llm-capability", capability], ["professional-corpus", corpusSet],
    ["twin-set", twinSet], ["review-set", reviewSet], ["aggregation", aggregation],
  ];
  const registry = LIN.createArtifactRegistry(named.map((p) => ({ artifactId: p[0], artifact: p[1] })));
  const lineageRefs = named.map((p) => LIN.artifactRef(p[1], p[0]));
  check("I-09. toutes les references de lignee RESOLVENT contre les artefacts disponibles",
    LIN.resolveLineage(lineageRefs, registry, { requiredRelations: ["EvidenceForge.ProfessionalCandidateAssessment"] }).resolved);

  const sources = {
    candidateAssessment: assessment, panelValidation: validation,
    llmCapability: capability, llmConfig: llmConfig,
    professionalCorpus: corpusSet, twinSet: twinSet, reviewSet: reviewSet, aggregation: aggregation,
    lineageRefs: lineageRefs, artifactRegistry: registry,
  };

  // ---------- 8. preparation PRE puis FULL ----------
  const pre = SR.evaluateReadiness(Object.assign({ phase: "PRE" }, sources));
  const full = SR.evaluateReadiness(Object.assign({ phase: "FULL" }, sources));
  check("I-10. la preparation PRE est READY et porte bien le jeu de dimensions PRE",
    pre.status === SR.READINESS.READY && SR.assertReadinessPhase(pre, "PRE", "I-10"),
    pre.status + " " + JSON.stringify(pre.blockingDimensions));
  check("I-11. la preparation FULL est READY et evalue les quatre dimensions supplementaires",
    full.status === SR.READINESS.READY && SR.assertReadinessPhase(full, "FULL", "I-11")
    && SR.FULL_ONLY_DIMENSIONS.every((n) => full.assessedDimensions.indexOf(n) !== -1),
    full.status + " " + JSON.stringify(full.blockingDimensions));
  check("I-12. la PRE de ce run ne peut pas etre presentee comme une FULL",
    threw(() => SR.assertReadinessPhase(pre, "FULL", "I-12"), "READINESS_PHASE_MISMATCH"));

  // ---------- 9. qualification du PROCESSUS ----------
  const qualification = SQ.qualifyProcess(Object.assign({ readinessPre: pre, readinessFull: full }, sources));
  check("I-13. le processus est QUALIFIED, apres recalcul des deux preparations sur les sources",
    qualification.qualificationStatus === SQ.QUALIFICATION.QUALIFIED && qualification.readinessRecomputed === true,
    qualification.qualificationStatus + " :: " + qualification.reservations.join(" ; ")
      + " :: " + qualification.criteria.filter((c) => !c.satisfied).map((c) => c.id + "=" + c.reason).join(" | "));
  check("I-14. la qualification porte sur le PROCESSUS et ne decide jamais du verdict",
    qualification.scope === "PROCESS_ONLY" && qualification.doesNotDecideVerdict === true && qualification.expertCountUsedAsCriterion === false);

  // ---------- 10. rapport unifie ADDITIF ----------
  const priorReport = {
    schema: "EvidenceForge.PriorUnifiedReport", mission: { missionId: "mission-integration" },
    testStatus: { scientificValidity: false, testMode: true, humanProfessionalValidation: false },
  };
  const priorVerdict = { verdictRef: "verdict-anterieur-1", content: "verdict enregistre anterieurement" };
  const report = SUR.buildScientificUnifiedReport(Object.assign({ priorReport: priorReport, qualification: qualification, priorVerdict: priorVerdict, readinessPre: pre, readinessFull: full }, sources));
  check("I-15. le rapport anterieur est reference, jamais reecrit, et ses drapeaux sont reproduits a l'identique",
    report.priorScientificValidity === false && report.priorTestMode === true && report.priorHumanProfessionalValidation === false
    && SUR.assertPriorUntouched(report, priorReport));
  check("I-16. le rapport est lie a CETTE qualification (identifiant, empreinte, mission)",
    SUR.assertReportBoundToQualification(report, qualification, "I-16") && report.missionId === "mission-integration");
  check("I-17. le verdict anterieur est conserve tel quel", report.priorVerdictPreserved === true && report.priorVerdict === priorVerdict);

  // ---------- 11. acceptation humaine ----------
  const accTpl = FRA.buildAcceptanceTemplate(report);
  check("I-18. le gabarit d'acceptation ne pre-remplit aucune decision humaine",
    accTpl.decision === null && accTpl.actorIdentity === null && accTpl.actorType === null);
  const acceptance = Object.assign({}, accTpl, {
    decision: FRA.DECISION.ACCEPT, actorType: "human",
    actorIdentity: "FIXTURE:auditeur d'integration", decidedAt: now(),
    reservationsAcknowledged: accTpl.reservationsPresented.slice(),
  });
  const accV = FRA.validateAcceptance(acceptance, report, { artifactRegistry: LIN.createArtifactRegistry([{ artifactId: "scientific-unified-report", artifact: report }]) });
  check("I-19. l'acceptation porte sur un rapport concret, resolu, et sur le contenu reellement presente",
    accV.valid && accV.continuationAllowed, accV.problems.join(" ; "));

  // ---------- 12. autorisation aval GENERIQUE ----------
  // Le registre presente a l'ultime porte contient TOUS les artefacts
  // disponibles a ce stade, rapport unifie compris.
  const fullRegistry = LIN.createArtifactRegistry(
    named.concat([["scientific-unified-report", report], ["scientific-qualification", qualification],
                  ["readiness-pre", pre], ["readiness-full", full]])
      .map((p) => ({ artifactId: p[0], artifact: p[1] })));
  const authorization = DA.resolveDownstreamUseAuthorization({
    qualification: qualification, qualificationSources: Object.assign({ readinessPre: pre, readinessFull: full }, sources),
    report: report, acceptance: acceptance, acceptanceValidator: FRA.validateAcceptance,
    lineageRefs: lineageRefs, artifactRegistry: fullRegistry,
  });
  check("I-20. l'usage aval est autorise apres revalidation complete de toutes les entrees",
    authorization.authorization === DA.AUTHORIZATION.AUTHORIZED && authorization.revalidation.performed === true && authorization.revalidation.agrees === true,
    authorization.reasons.join(" | "));
  check("I-21. l'autorisation ne reecrit aucun verdict", authorization.rewritesVerdict === false);

  const casePhase = CASE.mapAuthorizationToCasePhase(authorization, "PHASE_AVAL_DU_CAS");
  check("I-22. le nom de la phase aval vient du cas d'application, jamais du noyau",
    casePhase.PHASE_AVAL_DU_CAS_ALLOWED === true && casePhase.casePhase === "PHASE_AVAL_DU_CAS");

  // ---------- 13. la meme chaine ne peut PAS etre blanchie en production ----------
  console.log("\n  -- la chaine de test ne devient pas une preuve reelle --");
  const prodMan = RM.createRunEvidenceManifest({ runId: "run-production-pretendu", executionMode: RM.MODE.PRODUCTION });
  const laundered = Object.assign({}, assessment, { executionEvidenceClass: "REAL_RUNTIME" });
  check("I-23. reetiqueter l'evaluation en REAL_RUNTIME ne la rattache a aucun run de production",
    threw(() => RM.assertProductionEvidence(laundered, prodMan, "I-23"), "RUN_BINDING_MISSING"));
  const pvProd = PG.validatePanelValidation(validation, assessment, { production: true, runManifest: prodMan });
  check("I-24. la meme porte humaine, presentee en production, est refusee faute de provenance verifiable",
    pvProd.valid === false && pvProd.problems.some((p) => /RUN_BINDING|RUN_NOT_PRODUCTION/.test(p)), pvProd.problems.join(" ; "));
  const qualProd = SQ.qualifyProcess(Object.assign({ readinessPre: pre, readinessFull: full, production: true, runManifest: prodMan }, sources));
  check("I-25. la meme qualification, presentee en production, n'est pas QUALIFIED",
    qualProd.qualificationStatus === SQ.QUALIFICATION.NOT_QUALIFIED, qualProd.qualificationStatus);

  // ---------- 14. aucun inconnu n'a disparu en route ----------
  const opened = UNK.openOnes(report.unknowns || []);
  check("I-26. tous les inconnus ouverts amont sont encore presents dans le rapport final",
    UNK.assertNoSilentLoss(qualification.unknowns || [], report.unknowns || [], "I-26") && opened.length === UNK.openOnes(qualification.unknowns || []).length);

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("INTEGRATION_FAILED:", e && e.stack); process.exit(1); });
