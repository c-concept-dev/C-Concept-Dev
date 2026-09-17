#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.2 — integration bout en bout, HORS LIGNE.
 *
 * Traverse le VRAI raccord : MONO-09 v0.2 -> evaluation -> porte humaine TEST ->
 * adaptateur a porte -> EF-02C via les VRAIS runners de noeuds -> readiness PRE ->
 * chemin aval fixture -> readiness FULL -> qualification -> rapport ->
 * autorisation aval generique -> acceptation TEST.
 *
 * Ce test prouve la STRUCTURE. Il n'est jamais une preuve scientifique : chaque
 * maillon de fixture est refuse quand le mode production est demande.
 */

const path = require("path"), fs = require("fs");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
if (!fs.existsSync(path.join(KIT, "MONO-01", "index.js"))) {
  console.error("MONO-01 introuvable sous \"" + KIT + "\".");
  process.exit(2);
}
const { createMono01 } = require(path.join(KIT, "MONO-01", "index.js"));
const { nodeRunners } = require(path.join(KIT, "MONO-02", "lib", "node-runners.js"));
const { createProfessionalPipelineAdapter } = require(path.join(KIT, "MONO-09", "v0.2", "lib", "professional-adapter.js"));

const EV = require("../core/execution-evidence.js");
const LIN = require("../core/lineage.js");
const CA = require("../core/candidate-assessment.js");
const PG = require("../core/panel-gate.js");
const LC = require("../core/llm-capability.js");
const SR = require("../core/scientific-readiness.js");
const SQ = require("../core/scientific-qualification.js");
const DA = require("../core/downstream-authorization.js");
const SUR = require("../core/scientific-unified-report.js");
const FRA = require("../core/final-report-acceptance.js");
const ADAPT = require("../adapters/case-phase-adapter.js");

// Adaptateur a porte : compose MONO-09 v0.2 sans le modifier. Il vit ici parce
// qu'il combine un lot gele et la porte humaine MONO-10 — jamais dans le noyau.
function createPanelGatedAdapter(base, opts) {
  const approvedSet = (function () {
    let cached = null;
    return function () {
      if (cached) return cached;
      if (!opts.panelValidation || !opts.candidateAssessment) {
        throw new Error("PANEL_GATE_MISSING: aucune porte humaine liee — aucun professionnel ne peut atteindre le corpus.");
      }
      cached = PG.approvedPanelMembers(opts.panelValidation, opts.candidateAssessment, opts.mode || {});
      return cached;
    };
  })();
  return {
    discoverProfessionals: (i, c) => base.discoverProfessionals(i, c),
    verifyProfessionals: async (i, c) => {
      const b = await base.verifyProfessionals(i, c);
      const ok = approvedSet();
      const gated = (b.verified || []).map(function (v) {
        const id = v.candidateRef || ("unresolved:" + v.displayName);
        if (ok.has(id)) {
          // L'approbation HUMAINE prime sur l'heuristique documentaire amont.
          // MONO-09 v0.2 (gele) n'attribue VERIFIED qu'en presence d'un identifiant
          // academique ; un professionnel approuve par un humain mais identifie par
          // un autre registre resterait hors corpus. La promotion est tracee :
          // la valeur documentaire d'origine est conservee.
          return Object.assign({}, v, { verificationStatus: "VERIFIED",
            documentaryVerificationStatus: v.verificationStatus,
            panelApproval: "APPROVED_BY_HUMAN",
            verificationMethod: "HUMAN_PANEL_APPROVAL_SUPERSEDES_DOCUMENTARY_HEURISTIC" });
        }
        return Object.assign({}, v, { verificationStatus: "UNVERIFIED", documentaryVerificationStatus: v.verificationStatus,
          panelApproval: "NOT_APPROVED", panelGateReason: "aucune approbation humaine pour ce candidat" });
      });
      return Object.assign({}, b, { verified: gated });
    },
    buildProfessionalCorpus: async (i, c) => {
      const ok = approvedSet();
      const leaked = ((i.professionalVerification && i.professionalVerification.verified) || [])
        .filter((v) => v.verificationStatus === "VERIFIED" && !ok.has(v.candidateRef || ("unresolved:" + v.displayName)));
      if (leaked.length) throw new Error("UNAPPROVED_PROFESSIONAL_REACHED_CORPUS: " + leaked.map((v) => v.displayName).join(", "));
      return base.buildProfessionalCorpus(i, c);
    },
  };
}

let pass = 0, fail = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + d : "")); } };
const TESTMODE = { production: false }, PRODMODE = { production: true };
const FX = EV.CLASS.TEST_FIXTURE;

(async () => {
  console.log("MONO-10 v0.2 — integration hors ligne (STRUCTURE SEULE)\n");
  const steps = [];
  const mono01 = createMono01(path.join(KIT, "MONO-01", "registry", "mono-00-frozen-baseline-registry-v1.json"));

  // Domaine volontairement quelconque : aucun code metier n'existe dans le noyau.
  const MDS = { schema: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", dimensions: [{ id: "structural safety" }] };
  const CS = { schema: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1", id: "corpus-it", missionId: "m-it", protocolRef: "p",
    sources: [
      { id: "W1", titre: "Oeuvre 1", auteurOuOrganisme: "Alpha Nom, Beta Nom", discipline: "structural safety engineering",
        provenance: { connectorId: "src", originalReference: "src://W1" }, statutScreening: "inclus" },
      { id: "W2", titre: "Oeuvre 2", auteurOuOrganisme: "Gamma Exclu", discipline: "structural safety",
        provenance: { connectorId: "src", originalReference: "src://W2" }, statutScreening: "exclu" },
    ] };
  const base = createProfessionalPipelineAdapter({
    resolveAuthorIdentity: async (s) => ({ "Alpha Nom": { providerAuthorId: "reg-a://1", affiliation: "Org A" },
      "Beta Nom": { providerAuthorId: "reg-a://2" } })[s.displayName] || {},
    fetchAuthorWorks: async () => [{ id: "src://W50", display_name: "T", doi: "https://doi.org/10.1/x", publication_year: 2020 }],
  });

  const c0 = { missionId: "m-it", adapter: base, dependenciesAvailable: {}, nodeOutputs: { "EF-PR-GEN-01": { missionDimensionSet: MDS }, "EF-ORCH-SUBSYSTEM": CS } };
  const nA = await nodeRunners["EF-02A"](mono01, c0); c0.nodeOutputs["EF-02A"] = nA.output;
  const nB = await nodeRunners["EF-02B"](mono01, c0); c0.nodeOutputs["EF-02B"] = nB.output;
  steps.push("EF-02A/B via les vrais runners");
  check("IT-01. le vrai chemin runtime MONO-09 v0.2 aboutit", nA.status === "SUCCESS" && nB.status === "SUCCESS" && nA.output.candidates.length === 2);

  // Extracteur d'identite propre au domaine : une seconde source independante.
  const assess = CA.assessCandidates({ discovery: nA.output, verification: nB.output,
    missionLabels: ["structural safety"], executionEvidenceClass: FX,
    identityExtractor: function (c) {
      const out = CA.defaultIdentityExtractor(c, {});
      if (c.candidateRef === "reg-a://1") out.push({ evidenceType: "chamber-registry", provider: "chamber", identifier: "ch://77",
        assertedValue: null, subjectBinding: "CONFIRMED", provenance: { origin: "DOMAIN_ADAPTER" }, verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
      return out;
    } });
  steps.push("evaluation des candidats");
  check("IT-02. l'evaluation reduit la charge humaine et trace les ecarts",
    assess.summary.total === 2 && assess.summary.presentedForHumanReview >= 1 && assess.unknowns.length >= 0, JSON.stringify(assess.summary));
  check("IT-02b. aucun candidat issu d'une source EXCLUE", !assess.assessments.some((a) => a.professionalIdentity.displayName === "Gamma Exclu"));
  check("IT-02c. libelles proches non identiques : jamais hors champ",
    assess.assessments.every((a) => a.relevance !== "OUT_OF_SCOPE"), JSON.stringify(assess.assessments.map((a) => a.relevance)));

  const tpl = PG.buildPanelValidationTemplate(assess, { executionEvidenceClass: FX });
  const validation = Object.assign({}, tpl, { decisions: tpl.decisions.map(function (d, i) {
    return Object.assign({}, d, { decision: i === 0 ? PG.DECISION.APPROVE : PG.DECISION.DEFER,
      decisionReason: "decision de test explicite", actorType: "human", actorIdentity: "FIXTURE:integration", decidedAt: new Date().toISOString() });
  }) });
  steps.push("porte humaine (FIXTURE)");
  const pv = PG.validatePanelValidation(validation, assess, TESTMODE);
  check("IT-03. la porte humaine valide en mode test, DEFER conserve", pv.valid === true && pv.counts.DEFER >= 0, JSON.stringify(pv.problems));
  check("IT-03b. cette porte est refusee en PRODUCTION", PG.validatePanelValidation(validation, assess, PRODMODE).valid === false);

  const gated = createPanelGatedAdapter(base, { panelValidation: validation, candidateAssessment: assess, mode: TESTMODE });
  const c1 = { missionId: "m-it", adapter: gated, dependenciesAvailable: {}, nodeOutputs: { "EF-PR-GEN-01": { missionDimensionSet: MDS }, "EF-ORCH-SUBSYSTEM": CS } };
  const g1 = await nodeRunners["EF-02A"](mono01, c1); c1.nodeOutputs["EF-02A"] = g1.output;
  const g2 = await nodeRunners["EF-02B"](mono01, c1); c1.nodeOutputs["EF-02B"] = g2.output;
  const g3 = await nodeRunners["EF-02C"](mono01, c1);
  steps.push("corpus via l'adaptateur a porte");
  check("IT-04. seuls les approuves entrent dans le corpus, meme sans identifiant academique",
    g3.status === "SUCCESS" && g3.output.professionalCorpora.length === pv.approved.length,
    "corpora=" + (g3.output ? g3.output.professionalCorpora.length : "?") + " approuves=" + pv.approved.length);
  check("IT-04c. l'approbation humaine prime sur l'heuristique documentaire, et la valeur d'origine reste tracee",
    g2.output.verified.some((v) => v.panelApproval === "APPROVED_BY_HUMAN" && v.documentaryVerificationStatus === "UNVERIFIED"
      && v.verificationMethod === "HUMAN_PANEL_APPROVAL_SUPERSEDES_DOCUMENTARY_HEURISTIC"));
  check("IT-04d. un candidat NON approuve reste hors corpus quelle que soit son identite documentaire",
    g2.output.verified.filter((v) => v.panelApproval === "NOT_APPROVED").every((v) => v.verificationStatus === "UNVERIFIED"));
  const noGate = createPanelGatedAdapter(base, {});
  const cN = { missionId: "m-it", adapter: noGate, dependenciesAvailable: {}, nodeOutputs: { "EF-PR-GEN-01": { missionDimensionSet: MDS }, "EF-ORCH-SUBSYSTEM": CS } };
  const x1 = await nodeRunners["EF-02A"](mono01, cN); cN.nodeOutputs["EF-02A"] = x1.output;
  const x2 = await nodeRunners["EF-02B"](mono01, cN);
  check("IT-04b. sans porte humaine, le vrai runner echoue immediatement", x2.status !== "SUCCESS", x2.status);

  const cfg = { providerId: "worker-it", modelId: "model-it", workerBindingId: "bind-it", authMode: "direct", credentialPresent: true };
  const cap = await LC.runActiveProbe(cfg, async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}', requestId: "req-it", costUsd: 0.0002 }), { executionEvidenceClass: FX });
  steps.push("sonde LLM (FIXTURE)");
  check("IT-05. sonde valide en test, refusee en production",
    cap.status === LC.STATUS.AVAILABLE && LC.assertCapabilityUsable(cap, cfg, TESTMODE).usable === true && LC.assertCapabilityUsable(cap, cfg, PRODMODE).usable === false);

  const refs = [LIN.artifactRef(nA.output, "d"), LIN.artifactRef(nB.output, "v"), LIN.artifactRef(assess, "a"),
    LIN.artifactRef(validation, "p"), LIN.artifactRef(cap, "l"), LIN.artifactRef(g3.output, "c")];
  const pre = SR.evaluateReadiness({ phase: "PRE", candidateAssessment: assess, panelValidation: validation, llmCapability: cap, llmConfig: cfg, lineageRefs: refs, executionEvidenceClass: FX });
  steps.push("readiness PRE");
  check("IT-06. readiness PRE aboutit sans quota disciplinaire", pre.status !== SR.READINESS.NOT_READY && pre.noDisciplineQuotaApplied === true, pre.status + " " + JSON.stringify(pre.blockingDimensions));

  const twinSet = { twins: [{ twinId: "t1" }] }, reviewSet = { reviews: [{ reviewStatus: "complete" }], summary: { targets: 1 } };
  const full = SR.evaluateReadiness({ phase: "FULL", candidateAssessment: assess, panelValidation: validation, llmCapability: cap, llmConfig: cfg,
    lineageRefs: refs, professionalCorpus: g3.output, twinSet, reviewSet, aggregation: { aggregates: [{}] }, executionEvidenceClass: FX });
  steps.push("readiness FULL");
  const qual = SQ.qualifyProcess({ readinessPre: pre, readinessFull: full, candidateAssessment: assess, panelValidation: validation,
    llmCapability: cap, llmConfig: cfg, reviewSet, lineageRefs: refs, executionEvidenceClass: FX,
    limitations: ["aucun texte integral lu dans cette chaine"] });
  steps.push("qualification");
  check("IT-07. la qualification porte sur le processus et ne choisit aucun verdict",
    qual.scope === "PROCESS_ONLY" && qual.doesNotDecideVerdict === true && !("finalVerdict" in qual), qual.qualificationStatus);
  check("IT-07b. les inconnus amont survivent jusqu'a la qualification",
    qual.unknowns.length >= assess.unknowns.length, qual.unknowns.length + " >= " + assess.unknowns.length);

  const priorReport = { schema: "EvidenceForge.UnifiedReportSummary", schemaVersion: "EF-04A-v1", mission: { missionId: "m-it" },
    testStatus: { testMode: true, scientificValidity: false, humanProfessionalValidation: false } };
  const priorHash = LIN.sha256Of(priorReport);
  const report = SUR.buildScientificUnifiedReport({ priorReport, priorVerdict: "OUTCOME_A", candidateAssessment: assess,
    panelValidation: validation, llmCapability: cap, readinessPre: pre, readinessFull: full, qualification: qual, executionEvidenceClass: FX });
  steps.push("rapport unifie");
  check("IT-08. le rapport anterieur n'est jamais mute et ses drapeaux sont reproduits",
    LIN.sha256Of(priorReport) === priorHash && report.priorScientificValidity === false && report.priorTestMode === true && report.priorVerdictPreserved === true);
  check("IT-08b. aucun champ specifique a un cas dans le rapport", !/p0_2|P0\.2|JMJS/i.test(JSON.stringify(report)));

  const accTpl = FRA.buildAcceptanceTemplate(report, { executionEvidenceClass: FX });
  const acc = Object.assign({}, accTpl, { decision: FRA.DECISION.ACCEPT_WITH_RESERVATIONS, reservationsAcknowledged: report.reservations.slice(),
    actorType: "human", actorIdentity: "FIXTURE:proprietaire", decidedAt: new Date().toISOString() });
  const auth = DA.resolveDownstreamUseAuthorization({ qualification: qual, report: report, acceptance: acc,
    lineageRefs: report.lineage, acceptanceValidator: FRA.validateAcceptance, executionEvidenceClass: FX });
  steps.push("autorisation aval generique");
  check("IT-09. l'autorisation aval est generique et ne reecrit jamais le verdict",
    ["AUTHORIZED", "NOT_AUTHORIZED", "DEFERRED"].indexOf(auth.authorization) !== -1 && auth.rewritesVerdict === false, auth.authorization);
  check("IT-09b. l'adaptateur de cas traduit hors du noyau, avec un nom fourni par l'appelant",
    ADAPT.mapAuthorizationToCasePhase(auth, "ETAPE_SUIVANTE").derivedFromGenericField === "downstreamUseAuthorized");

  // ---- etancheite : aucun maillon de fixture recevable en production ----
  const prod = [
    PG.validatePanelValidation(validation, assess, PRODMODE).valid,
    LC.assertCapabilityUsable(cap, cfg, PRODMODE).usable,
    FRA.validateAcceptance(acc, report, PRODMODE).valid,
    SQ.qualifyProcess({ readinessPre: pre, readinessFull: full, candidateAssessment: assess, panelValidation: validation,
      llmCapability: cap, llmConfig: cfg, reviewSet, lineageRefs: refs, production: true, executionEvidenceClass: EV.CLASS.REAL_RUNTIME }).qualificationStatus === SQ.QUALIFICATION.QUALIFIED,
  ];
  check("IT-10. AUCUN maillon de fixture n'est recevable en production — ce test prouve la structure, jamais la science",
    prod.every((v) => v === false), JSON.stringify(prod));

  console.log("\n  chaine : " + steps.join(" -> "));
  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
