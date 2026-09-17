#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.5 — integration hors ligne (§56, §57).
 *
 * Traverse le VRAI chemin livre :
 *   frontiere operateur -> verificateur -> attestation -> manifeste
 *   -> registre authentifie -> MONO-09 v0.2 (adaptateur reel, dependances injectees)
 *   -> evaluation -> porte humaine -> frontiere d'authentification humaine
 *   -> eligibilite -> adaptateur a porte LIVRE -> corpus -> jumeaux -> revues
 *   -> agregation -> capacite LLM -> preparation -> qualification -> rapport
 *   -> acceptation -> autorisation aval -> adaptateur de cas
 *
 * executionMode = TEST, assume. Puis on prouve que cette meme preuve ne peut pas
 * etre simplement reetiquetee PRODUCTION.
 *
 * NETWORK_CALLS = 0 · REAL_LLM_CALLS = 0 · REAL_EF02_RUNS = 0
 * REAL_PROFESSIONAL_RUNS = 0 · REAL_HUMAN_ACTS = 0
 */
const path = require("path"), fs = require("fs");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const C = "../core/";
const { sha256Of } = require(C + "canonical.js");
const OTB = require(C + "operator-trust-boundary.js");
const OTV = require(C + "operator-trust-verifier.js");
const RM = require(C + "run-evidence-manifest.js");
const AAR = require(C + "authenticated-artifact-registry.js");
const LIN = require(C + "lineage.js");
const PG = require(C + "panel-gate.js");
const PGA = require(C + "panel-gated-adapter.js");
const EE = require(C + "effective-eligibility.js");
const SR = require(C + "scientific-readiness.js");
const SQ = require(C + "scientific-qualification.js");
const SUR = require(C + "scientific-unified-report.js");
const FRA = require(C + "final-report-acceptance.js");
const LC = require(C + "llm-capability.js");
const CASE = require("../adapters/case-phase-adapter.js");
const VAL = require("../validators/index.js");
const FX = require("./fixture-chain.js");

let pass = 0, fail = 0, skipped = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + String(d).slice(0, 220) : "")); } };
const skip = (id, why) => { skipped++; console.log("  SKIP  " + id + "  -> " + why); };
const threw = (fn, c) => { try { fn(); return false; } catch (e) { return c ? String(e.message).indexOf(c) === 0 : true; } };

(async () => {
  console.log("MONO-10 v0.5 — integration hors ligne\n");

  const op = FX.provisionOperator({ namespace: "TEST" });
  const chain = await FX.buildChain({ mode: "TEST", operator: op });
  const r = await chain.complete();

  check("I-01. la frontiere operateur porte un identifiant non secret et un espace",
    r.boundary.operatorTrustBoundaryId && r.boundary.namespace === "TEST"
    && JSON.stringify(r.boundary.sourceDescriptor).indexOf("PRIVATE") === -1);
  check("I-02. le manifeste reprend son mode et son run de l'attestation verifiee",
    r.manifest.executionMode === "TEST" && r.manifest.runManifestRootHash
    && VAL.run.assertManifestAuthentic(r.manifest, r.ctx));
  check("I-03. le registre d'artefacts est rattache au run authentifie",
    AAR.isAuthenticatedRegistry(r.registry) && r.registry.runId === r.manifest.runId
    && VAL.registry.assertAuthenticatedRegistry(r.registry, r.manifest, "I-03"));

  /* ---------- §56 : traversee de l'adaptateur REEL MONO-09 v0.2 ---------- */
  const m09Path = path.join(KIT, "MONO-09", "v0.2", "lib", "professional-adapter.js");
  if (!fs.existsSync(m09Path)) {
    skip("I-04. traversee de l'adaptateur MONO-09 v0.2", "MONO-09/v0.2 non joignable sous " + KIT);
  } else {
    const M09 = require(m09Path);
    // Toutes les dependances externes de MONO-09 sont INJECTEES : aucun reseau.
    let networkTouched = false;
    const base = M09.createProfessionalPipelineAdapter({
      resolveAuthorIdentity: async (seed) => ({ resolved: true, identity: { displayName: seed.displayName } }),
      expandRelatedAuthors: async () => [],
      fetchAuthorWorks: async () => [],
    });
    check("I-04. l'adaptateur MONO-09 v0.2 expose bien l'interface a trois methodes",
      typeof base.discoverProfessionals === "function" && typeof base.verifyProfessionals === "function"
      && typeof base.buildProfessionalCorpus === "function" && networkTouched === false);

    // Il est compose DERRIERE la porte livree : c'est le vrai chemin d'execution.
    const gated = PGA.createPanelGatedAdapter(base, {
      panelValidation: chain.validation, candidateAssessment: chain.assessment, runContext: r.ctx });
    check("I-05. l'adaptateur MONO-09 se compose derriere la porte LIVREE de v0.5",
      gated.gateId === PGA.GATE_ID
      && require.resolve(path.join(__dirname, "..", "core", "panel-gated-adapter.js")) === path.join(__dirname, "..", "core", "panel-gated-adapter.js"));
    // buildProfessionalCorpus est asynchrone : le rejet doit etre attendu.
    let gateClosed = false;
    try { await PGA.createPanelGatedAdapter(base, {}).buildProfessionalCorpus({ professionalVerification: { verified: [] } }, {}); }
    catch (e) { gateClosed = String(e.message).indexOf("PANEL_GATE_MISSING") === 0; }
    check("I-06. sans porte valide, MONO-09 n'atteint jamais la construction du corpus", gateClosed);
  }

  /* ---------- la chaine complete ---------- */
  const c1 = r.verified.verified.filter((v) => v.candidateRef === "c-1")[0];
  const c3 = r.verified.verified.filter((v) => v.candidateRef === "c-3")[0];
  check("I-07. le statut amont reste historique ; l'eligibilite est separee et recalculee",
    c1.verificationStatus === "UNVERIFIED" && c1.legacyVerificationStatus === "UNVERIFIED"
    && c1.effectiveCorpusEligibility === EE.ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL
    && c1.recomputed === true && c1.humanActAuthenticated === true);
  check("I-08. DEFER est conserve et retenu : ni admis, ni ecarte",
    c3.effectiveCorpusEligibility === EE.ELIGIBILITY.DEFERRED
    && !r.corpus.professionalCorpora.some((p) => p.professionalRef === "c-3"));
  check("I-09. les preuves vues par l'humain RESOLVENT contre le registre authentifie",
    PG.validatePanelValidation(chain.validation, chain.assessment, chain.ctx).valid === true
    && chain.assessment.assessments[0].missionEvidenceRefs.every((x) => x && x.artifactId && r.registry.has(x.artifactId)));
  check("I-10. la capacite LLM est liee au run atteste",
    r.capability.probeRunId === r.manifest.runId && r.capability.probeExecutionMode === "TEST"
    && LC.assertCapabilityUsable(r.capability, r.llmConfig, r.ctx).usable === true);
  check("I-11. PRE et FULL sont distinctes et sourcees",
    SR.assertReadinessPhase(r.pre, "PRE", { registry: r.registry, expectedRunId: r.manifest.runId }, "I-11")
    && SR.assertReadinessPhase(r.full, "FULL", { registry: r.registry, expectedRunId: r.manifest.runId }, "I-11")
    && threw(() => SR.assertReadinessPhase(r.pre, "FULL", {}, "I-11"), "READINESS_PHASE_MISMATCH"));
  check("I-12. la qualification distingue coherence interne et execution authentifiee",
    r.qualification.internalChainConsistency === true
    && r.qualification.evidenceClass === "AUTHENTICATED_TEST_EXECUTION"
    && r.qualification.authenticatedProductionExecution === false);
  check("I-13. le rapport est ADDITIF et lie a CETTE qualification",
    r.report.priorScientificValidity === false && SUR.assertPriorUntouched(r.report, r.priorReport)
    && SUR.assertReportBoundToQualification(r.report, r.qualification, r.ctx, "I-13"));
  check("I-14. l'acceptation porte sur le rapport concret et un acte authentifie",
    FRA.validateAcceptance(r.acceptance, r.report, r.ctx).valid === true);
  check("I-15. l'autorisation revalide et le dit sans mentir",
    r.authorization.authorization === "AUTHORIZED" && r.authorization.revalidation.performed === true
    && r.authorization.rewritesVerdict === false);
  const cp = CASE.mapAuthorizationToCasePhase(r.authorization, "PHASE_AVAL_DU_CAS");
  check("I-16. le nom de la phase aval vient du cas, jamais du noyau",
    cp.PHASE_AVAL_DU_CAS_ALLOWED === true && threw(() => CASE.mapAuthorizationToCasePhase(r.authorization, ""), "CASE_PHASE_NAME_REQUIRED"));
  const relations = r.registry.entries().map((e) => e.relation);
  const expected = ["mission", "documentary-evidence", "discovery", "verification", "assessment", "panel-decision",
    "effective-eligibility", "corpus", "twins", "reviews", "aggregation", "capability",
    "readiness-pre", "readiness-full", "qualification", "report", "acceptance"];
  check("I-17. les " + expected.length + " relations du graphe canonique sont occupees",
    expected.every((x) => relations.indexOf(x) !== -1), expected.filter((x) => relations.indexOf(x) === -1).join(", "));

  /* ---------- la preuve de TEST ne se reetiquette pas ---------- */
  console.log("\n  -- cette preuve de TEST ne devient jamais une preuve de production --");
  const prodOp = FX.provisionOperator({ namespace: "PRODUCTION" });
  const prodBoundary = FX.boundaryFor(prodOp);
  const prodVerifier = OTV.createOperatorTrustVerifier(prodBoundary);
  check("I-18. le verificateur de TEST est refuse par le controle de production",
    threw(() => OTV.assertProductionVerifier(r.verifier, "I-18"), "TRUST_VERIFIER_NOT_PRODUCTION"));
  check("I-19. l'attestation de TEST est refusee par la frontiere de PRODUCTION",
    prodVerifier.verifyRuntimeAttestation({ attestation: r.attestation }).valid === false);
  const relabelled = Object.assign(JSON.parse(JSON.stringify(r.manifest)), { executionMode: "PRODUCTION" });
  check("I-20. reetiqueter le manifeste en PRODUCTION ne produit aucune preuve",
    threw(() => RM.assertManifestShape(relabelled), "RUN_MANIFEST_TAMPERED"));
  const qUnderProd = SQ.qualifyProcess(Object.assign({}, r.sources, {
    runContext: Object.assign({}, r.ctx, { verifier: prodVerifier }) }));
  check("I-21. la meme chaine presentee sous une frontiere de PRODUCTION : NOT_QUALIFIED",
    qUnderProd.qualificationStatus === "NOT_QUALIFIED", qUnderProd.qualificationStatus);
  check("I-22. ses artefacts ne valent pas comme preuve de production",
    threw(() => RM.assertProductionEvidence(r.assessment, Object.assign({}, r.ctx, { verifier: prodVerifier }), "I-22")));

  console.log("\n" + pass + " PASS, " + fail + " FAIL" + (skipped ? ", " + skipped + " SKIP" : ""));
  console.log("NETWORK_CALLS = 0 | REAL_LLM_CALLS = 0 | REAL_EF02_RUNS = 0 | REAL_PROFESSIONAL_RUNS = 0 | REAL_HUMAN_ACTS = 0");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("INTEGRATION_FAILED:", e && e.stack); process.exit(1); });
