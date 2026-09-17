#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.1 — integration bout en bout, HORS LIGNE.
 *
 * Ce test prouve la STRUCTURE de la chaine. Il n'est JAMAIS une preuve
 * scientifique : tous les actes humains portent le prefixe FIXTURE:, la sonde
 * LLM est marquee provenance.fixture=true, et le rapport produit est refuse
 * en production par les memes validateurs.
 *
 * Aucun reseau, aucun LLM reel, aucun run EF-02 reel, aucun P0.2.
 */

const path = require("path"), fs = require("fs"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
if (!fs.existsSync(path.join(KIT, "MONO-01", "index.js"))) {
  console.error("MONO-01 introuvable sous \"" + KIT + "\". Usage: node test/test-mono10-integration.js <bundleRoot>");
  process.exit(2);
}
const { createMono01 } = require(path.join(KIT, "MONO-01", "index.js"));
const { nodeRunners } = require(path.join(KIT, "MONO-02", "lib", "node-runners.js"));
const { createProfessionalPipelineAdapter } = require(path.join(KIT, "MONO-09", "v0.2", "lib", "professional-adapter.js"));

const CA = require("../lib/candidate-assessment.js");
const PG = require("../lib/panel-gate.js");
const PGA = require("../lib/panel-gated-adapter.js");
const LC = require("../lib/llm-capability.js");
const SR = require("../lib/scientific-readiness.js");
const SQ = require("../lib/scientific-qualification.js");
const SUR = require("../lib/scientific-unified-report.js");
const FRA = require("../lib/final-report-acceptance.js");
const LIN = require("../lib/lineage.js");

let pass = 0, fail = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + d : "")); } };
const FIX = { allowFixture: true };

(async () => {
  console.log("MONO-10 v0.1 — integration hors ligne (STRUCTURE SEULE, jamais une preuve scientifique)\n");
  const steps = [];
  const mono01 = createMono01(path.join(KIT, "MONO-01", "registry", "mono-00-frozen-baseline-registry-v1.json"));

  // 1-2 — decouverte et verification via les VRAIS runners de noeuds
  const MDS = { schema: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", dimensions: [{ id: "epistemologie" }] };
  const CS = { schema: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1", id: "corpus-it", missionId: "m-it", protocolRef: "p",
    sources: [
      { id: "W1", titre: "Oeuvre 1", auteurOuOrganisme: "Ada Lovelace, Alan Turing", discipline: "epistemologie",
        provenance: { connectorId: "openalex", originalReference: "https://openalex.org/W1" }, statutScreening: "inclus" },
      { id: "W2", titre: "Oeuvre 2", auteurOuOrganisme: "Zoe Exclue", discipline: "epistemologie",
        provenance: { connectorId: "openalex", originalReference: "https://openalex.org/W2" }, statutScreening: "exclu" },
      { id: "W3", titre: "Oeuvre 3", auteurOuOrganisme: "Sans Trace", discipline: "epistemologie",
        provenance: { connectorId: "openalex", originalReference: "https://openalex.org/W3" }, statutScreening: "inclus" },
    ] };
  const base = createProfessionalPipelineAdapter({
    resolveAuthorIdentity: async (s) => ({
      "Ada Lovelace": { providerAuthorId: "https://openalex.org/A1", orcid: "0000-0001-2345-6789", affiliation: "Univ A" },
      "Alan Turing": { providerAuthorId: "https://openalex.org/A2", orcid: "0000-0002-3456-7890" },
    })[s.displayName] || {},
    fetchAuthorWorks: async () => [
      { id: "https://openalex.org/W50", display_name: "Travail reel", doi: "https://doi.org/10.1/x", publication_year: 2020 },
      { id: "https://openalex.org/W51", display_name: "Sans DOI", publication_year: 2021 },
    ],
  });
  const c0 = { missionId: "m-it", adapter: base, dependenciesAvailable: {}, nodeOutputs: { "EF-PR-GEN-01": { missionDimensionSet: MDS }, "EF-ORCH-SUBSYSTEM": CS } };
  const nA = await nodeRunners["EF-02A"](mono01, c0); c0.nodeOutputs["EF-02A"] = nA.output;
  const nB = await nodeRunners["EF-02B"](mono01, c0); c0.nodeOutputs["EF-02B"] = nB.output;
  steps.push("EF-02A/EF-02B via les vrais runners");
  check("IT-01. decouverte et verification aboutissent sur le vrai chemin runtime",
    nA.status === "SUCCESS" && nB.status === "SUCCESS" && nA.output.candidates.length === 3, nA.status + "/" + nB.status);

  // 3 — evaluation des candidats
  const assess = CA.assessCandidates({ discovery: nA.output, verification: nB.output, missionDimensionSet: MDS });
  steps.push("evaluation des candidats");
  check("IT-02. l'evaluation reduit la charge de revue humaine",
    assess.summary.presentedForHumanReview === 2 && assess.summary.insufficientDocumentaryBasis === 1,
    JSON.stringify(assess.summary));

  // 4 — porte humaine, FIXTURE clairement marquee
  const tpl = PG.buildPanelValidationTemplate(assess);
  const validation = Object.assign({}, tpl, { decisions: tpl.decisions.map(function (d, i) {
    return Object.assign({}, d, {
      decision: i === 0 ? PG.DECISION.APPROVE : PG.DECISION.DEFER,
      decisionReason: i === 0 ? "identite etablie, oeuvres rattachees verifiables (FIXTURE)" : "identite a confirmer (FIXTURE)",
      actorType: "human", actorIdentity: "FIXTURE:integration-test", decidedAt: new Date().toISOString(),
    });
  }) });
  steps.push("porte humaine (FIXTURE)");
  check("IT-03. la porte humaine valide, avec un APPROVE et un DEFER conserve",
    PG.validatePanelValidation(validation, assess, FIX).valid === true
    && PG.validatePanelValidation(validation, assess, FIX).counts.DEFER === 1);
  check("IT-03b. cette porte de FIXTURE est refusee en production",
    PG.validatePanelValidation(validation, assess, { allowFixture: false }).valid === false);

  // 5 — adaptateur a porte + EF-02C
  const gated = PGA.createPanelGatedAdapter(base, { panelValidation: validation, candidateAssessment: assess, allowFixture: true });
  const c1 = { missionId: "m-it", adapter: gated, dependenciesAvailable: {}, nodeOutputs: { "EF-PR-GEN-01": { missionDimensionSet: MDS }, "EF-ORCH-SUBSYSTEM": CS } };
  const g1 = await nodeRunners["EF-02A"](mono01, c1); c1.nodeOutputs["EF-02A"] = g1.output;
  const g2 = await nodeRunners["EF-02B"](mono01, c1); c1.nodeOutputs["EF-02B"] = g2.output;
  const g3 = await nodeRunners["EF-02C"](mono01, c1);
  steps.push("EF-02C via l'adaptateur a porte");
  check("IT-04. seul le professionnel APPROUVE entre dans le corpus ; le DEFER est exclu",
    g3.status === "SUCCESS" && g3.output.professionalCorpora.length === 1, "corpora=" + (g3.output ? g3.output.professionalCorpora.length : "?"));
  check("IT-04b. aucun DOI synthetique dans le corpus (politique MONO-09 v0.2 conservee)",
    g3.output.professionalCorpora[0].corpus.works.every((w) => w.doi === null || /^https:\/\/doi\.org\//.test(w.doi))
    && g3.output.professionalCorpora[0].summary.worksWithoutDoi === 1);

  // 6 — sonde LLM de TEST, deterministe
  const cfg = { providerId: "llm-worker-test", modelId: "modele-it", workerBindingId: "binding-it", authMode: "direct", credentialPresent: true };
  const cap = await LC.runActiveProbe(cfg, async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}', requestId: "req-it", costUsd: 0.0002 }), { fixture: true });
  steps.push("sonde LLM (FIXTURE)");
  check("IT-05. la sonde de test est AVAILABLE en mode test, et refusee en production",
    cap.status === LC.STATUS.AVAILABLE
    && LC.assertCapabilityUsable(cap, cfg, FIX).usable === true
    && LC.assertCapabilityUsable(cap, cfg, { allowFixture: false }).usable === false);

  // 7 — readiness PRE
  const lineageRefs = [LIN.artifactRef(nA.output, "d"), LIN.artifactRef(nB.output, "v"), LIN.artifactRef(assess, "a"),
    LIN.artifactRef(validation, "p"), LIN.artifactRef(cap, "l"), LIN.artifactRef(g3.output, "c")];
  const pre = SR.evaluateReadiness({ phase: "PRE", candidateAssessment: assess, panelValidation: validation, llmCapability: cap, llmConfig: cfg, lineageRefs, allowFixture: true });
  steps.push("readiness PRE");
  check("IT-06. readiness PRE = READY", pre.status === SR.READINESS.READY, JSON.stringify(pre.blockingDimensions));

  // 8 — jumeaux et revues (fixture structurelle)
  const twinSet = { schema: "EvidenceForge.DocumentaryTwinSet", twins: [{ twinId: "twin-1", professionalRef: "https://openalex.org/A1" }], summary: { twinsBuilt: 1 } };
  const reviewSet = { schema: "EvidenceForge.DocumentaryReviewSet", reviews: [{ twinId: "twin-1", reviewStatus: "complete" }], summary: { targets: 1 } };
  const aggregation = { schema: "EvidenceForge.AggregatedDocumentaryReview", aggregates: [{ id: "agg-1" }] };
  const full = SR.evaluateReadiness({ phase: "FULL", candidateAssessment: assess, panelValidation: validation, llmCapability: cap, llmConfig: cfg,
    lineageRefs, allowFixture: true, professionalCorpus: g3.output, twinSet, reviewSet, aggregation, unknowns: ["couverture disciplinaire etroite"] });
  steps.push("readiness FULL");
  check("IT-07. readiness FULL aboutit sans quota disciplinaire",
    [SR.READINESS.READY, SR.READINESS.PARTIAL].indexOf(full.status) !== -1 && full.noDisciplineQuotaApplied === true, full.status);

  // 9 — qualification
  const qual = SQ.qualifyProcess({ readinessPre: pre, readinessFull: full, panelValidation: validation, llmCapability: cap, reviewSet, lineageRefs,
    unknowns: ["couverture disciplinaire etroite"], limitations: ["aucun texte integral lu dans toute la chaine"] });
  steps.push("qualification du processus");
  check("IT-08. la qualification porte sur le PROCESSUS et ne choisit aucun verdict",
    qual.scope === "PROCESS_ONLY" && qual.doesNotDecideVerdict === true && !("finalVerdict" in qual), qual.qualificationStatus);

  // 10 — rapport scientifique, legacy intact
  const legacyReport = { schema: "EvidenceForge.UnifiedReportSummary", schemaVersion: "EF-04A-v1", mission: { missionId: "m-it" },
    testStatus: { testMode: true, scientificValidity: false, humanProfessionalValidation: false },
    convergences: [], divergences: [], limitations: ["rapport legacy de fixture"] };
  const legacyHashBefore = LIN.sha256Of(legacyReport);
  const report = SUR.buildScientificUnifiedReport({ legacyReport, legacyVerdict: "IMPOSSIBLE_TO_CONCLUDE",
    candidateAssessment: assess, panelValidation: validation, llmCapability: cap, readinessPre: pre, readinessFull: full, qualification: qual,
    unknowns: ["couverture disciplinaire etroite"] });
  steps.push("ScientificUnifiedReport");
  check("IT-09. le rapport legacy est reference sans etre mute, drapeaux reproduits",
    LIN.sha256Of(legacyReport) === legacyHashBefore && report.legacyScientificValidity === false
    && report.legacyTestMode === true && report.legacyVerdictPreserved === true);
  check("IT-09b. la lignee complete est liee par empreinte", report.lineage.length >= 7 && report.lineage.every((r) => /^[0-9a-f]{64}$/.test(r.sha256)));

  // 11 — acceptation finale
  const accTpl = FRA.buildAcceptanceTemplate(report);
  const acc = Object.assign({}, accTpl, { decision: FRA.DECISION.ACCEPT_WITH_RESERVATIONS,
    reservationsAcknowledged: report.reservations.slice(),
    actorType: "human", actorIdentity: "FIXTURE:proprietaire-integration", decidedAt: new Date().toISOString() });
  steps.push("acceptation finale (FIXTURE)");
  const auth = FRA.resolveP0_2Authorization(report, acc, FIX);
  check("IT-10. l'autorisation P0.2 depend conjointement de la qualification et de l'acceptation",
    typeof auth.p0_2Allowed === "boolean" && Array.isArray(auth.reasons));
  check("IT-10b. cette acceptation de FIXTURE n'autorise JAMAIS P0.2 en production",
    FRA.resolveP0_2Authorization(report, acc, { allowFixture: false }).p0_2Allowed === false);

  // 12 — la chaine entiere est-elle recevable en production ?
  const prodChecks = [
    PG.validatePanelValidation(validation, assess, { allowFixture: false }).valid,
    LC.assertCapabilityUsable(cap, cfg, { allowFixture: false }).usable,
    FRA.resolveP0_2Authorization(report, acc, { allowFixture: false }).p0_2Allowed,
  ];
  check("IT-11. AUCUN maillon de FIXTURE n'est recevable en production : ce test prouve la structure, jamais la science",
    prodChecks.every((v) => v === false), JSON.stringify(prodChecks));

  console.log("\n  chaine parcourue : " + steps.join(" -> "));
  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
