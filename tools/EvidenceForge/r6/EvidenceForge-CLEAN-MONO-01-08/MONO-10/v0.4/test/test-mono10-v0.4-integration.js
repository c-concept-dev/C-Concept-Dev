#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.4 — test d'integration.
 *
 * Traverse le VRAI chemin : l'adaptateur a porte LIVRE (core/panel-gated-adapter.js)
 * et les validateurs livres (validators/index.js). Aucun substitut local.
 *
 * Aucun reseau, aucun LLM reel, aucun run EF-02, aucune execution aval.
 * Autonome : ne depend d'aucun autre lot.
 */
const path = require("path");
const TRA = require("../core/trusted-runtime-authority.js");
const LIN = require("../core/lineage.js");
const PG = require("../core/panel-gate.js");
const PGA = require("../core/panel-gated-adapter.js");
const EE = require("../core/effective-eligibility.js");
const SR = require("../core/scientific-readiness.js");
const SQ = require("../core/scientific-qualification.js");
const SUR = require("../core/scientific-unified-report.js");
const FRA = require("../core/final-report-acceptance.js");
const DA = require("../core/downstream-authorization.js");
const CASE = require("../adapters/case-phase-adapter.js");
const V = require("../validators/index.js");
const { createEphemeralAuthority } = require("../tools/ephemeral-authority.js");
const { buildChain, testHumanActVerifier } = require("./fixture-chain.js");

let pass = 0, fail = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + d : "")); } };
const threw = (fn, c) => { try { fn(); return false; } catch (e) { return c ? String(e.message).indexOf(c) === 0 : true; } };

(async () => {
  console.log("MONO-10 v0.4 — integration de bout en bout\n");

  const PROD = createEphemeralAuthority("AUT-OPERATEUR-PROD", TRA.MODE.PRODUCTION);
  const TEST = createEphemeralAuthority("AUT-OPERATEUR-TEST", TRA.MODE.TEST);
  const ANCHORS = TRA.createTrustAnchorSet([PROD.anchor(), TEST.anchor()]);
  const HV = testHumanActVerifier(["auditeur-panel"]);

  check("I-01. les ancrages de confiance ne contiennent aucune matiere privee",
    threw(() => TRA.createTrustAnchorSet([{ authorityId: "A", executionMode: "PRODUCTION", publicKeyPem: "-----BEGIN PRIVATE KEY-----" }]), "TRUST_ANCHOR_CONTAINS_SECRET"));

  const r = await buildChain({ mode: TRA.MODE.PRODUCTION, authority: PROD, anchorSet: ANCHORS, humanActVerifier: HV }).complete();

  check("I-02. le manifeste reprend son mode de l'attestation, il ne le declare pas",
    r.manifest.executionMode === "PRODUCTION" && r.manifest.trustedRuntimeAttestationHash
    && V.run.assertManifestAuthentic(r.manifest, r.anchorSet, r.attestation, {}));
  check("I-03. l'adaptateur consomme est le module LIVRE du lot",
    require.resolve("../core/panel-gated-adapter.js") === path.join(__dirname, "..", "core", "panel-gated-adapter.js")
    && r.corpus.professionalCorpora.length > 0);

  const c1 = r.verified.verified.filter((v) => v.candidateRef === "c-1")[0];
  const c3 = r.verified.verified.filter((v) => v.candidateRef === "c-3")[0];
  check("I-04. le statut amont reste historique, l'eligibilite est un champ separe",
    c1.verificationStatus === "UNVERIFIED" && c1.legacyVerificationStatus === "UNVERIFIED"
    && c1.effectiveCorpusEligibility === EE.ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL
    && c1.humanActAuthenticated === true);
  check("I-05. DEFER est conserve et retenu : ni admis, ni ecarte",
    c3.humanPanelDecision === "DEFER" && c3.effectiveCorpusEligibility === EE.ELIGIBILITY.DEFERRED
    && !r.corpus.professionalCorpora.some((p) => p.professionalRef === "c-3"));

  check("I-06. la preparation PRE et la preparation FULL sont distinctes et sourcees",
    SR.assertReadinessPhase(r.pre, "PRE", { registry: r.registry, expectedRunId: r.manifest.runId }, "I-06")
    && SR.assertReadinessPhase(r.full, "FULL", { registry: r.registry, expectedRunId: r.manifest.runId }, "I-06")
    && threw(() => SR.assertReadinessPhase(r.pre, "FULL", {}, "I-06"), "READINESS_PHASE_MISMATCH"));

  check("I-07. la qualification distingue coherence interne et execution authentifiee",
    r.qualification.internalChainConsistency === true
    && r.qualification.authenticatedProductionExecution === true
    && r.qualification.evidenceClass === "AUTHENTICATED_PRODUCTION_EXECUTION"
    && r.qualification.scope === "PROCESS_ONLY" && r.qualification.doesNotDecideVerdict === true);

  check("I-08. le rapport est ADDITIF : les drapeaux anterieurs sont reproduits a l'identique",
    r.report.priorScientificValidity === false && r.report.priorTestMode === true
    && SUR.assertPriorUntouched(r.report, r.priorReport)
    && SUR.assertReportBoundToQualification(r.report, r.qualification, r.ctx, "I-08"));
  check("I-09. le verdict anterieur est conserve tel quel", r.report.priorVerdictPreserved === true && r.report.priorVerdict.verdictRef === "verdict-anterieur-1");

  check("I-10. l'acceptation porte sur le rapport concret et sur ce qui a ete presente",
    FRA.validateAcceptance(r.acceptance, r.report, r.ctx).valid === true);

  check("I-11. l'autorisation aval revalide et l'affirme sans mentir",
    r.authorization.authorization === "AUTHORIZED" && r.authorization.revalidation.performed === true
    && r.authorization.revalidation.mandatory === true && r.authorization.rewritesVerdict === false);

  const cp = CASE.mapAuthorizationToCasePhase(r.authorization, "PHASE_AVAL_DU_CAS");
  check("I-12. le nom de la phase aval vient du cas, jamais du noyau",
    cp.PHASE_AVAL_DU_CAS_ALLOWED === true && threw(() => CASE.mapAuthorizationToCasePhase(r.authorization, ""), "CASE_PHASE_NAME_REQUIRED"));

  // §13 — le graphe canonique est bien celui que la chaine a parcouru.
  const relations = Array.from(r.registry.values()).map((e) => e.relation);
  const expected = ["mission", "discovery", "verification", "assessment", "panel-decision", "effective-eligibility",
    "corpus", "twins", "reviews", "aggregation", "capability", "readiness-pre", "readiness-full",
    "qualification", "report", "acceptance"];
  check("I-13. les " + expected.length + " relations du graphe canonique sont toutes occupees",
    expected.every((x) => relations.indexOf(x) !== -1), expected.filter((x) => relations.indexOf(x) === -1).join(", "));

  // La chaine de TEST ne peut pas etre presentee comme une preuve de production.
  console.log("\n  -- une chaine de TEST ne devient jamais une preuve de production --");
  const t = await buildChain({ mode: TRA.MODE.TEST, authority: TEST, anchorSet: ANCHORS }).complete();
  check("I-14. la chaine de TEST est complete et honnete sur sa classe de preuve",
    t.authorization.authorization === "AUTHORIZED" && t.qualification.evidenceClass === "AUTHENTICATED_TEST_EXECUTION"
    && t.qualification.authenticatedProductionExecution === false);
  check("I-15. ses artefacts ne valent pas sous un manifeste de PRODUCTION",
    threw(() => V.run.assertProductionEvidence(t.assessment, r.ctx, "I-15"), "RUN_BINDING_MISMATCH"));
  check("I-16. sa sonde LLM ne prouve aucune capacite de production",
    V.capability.assertCapabilityUsable(t.capability, t.llmConfig, r.ctx).usable === false);
  const qCross = SQ.qualifyProcess(Object.assign({}, t.sources, { runContext: r.ctx }));
  check("I-17. sa chaine presentee sous le run de production : NOT_QUALIFIED",
    qCross.qualificationStatus === "NOT_QUALIFIED", qCross.qualificationStatus);

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("INTEGRATION_FAILED:", e && e.stack); process.exit(1); });
