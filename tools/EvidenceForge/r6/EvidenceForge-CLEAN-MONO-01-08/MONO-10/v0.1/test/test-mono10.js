#!/usr/bin/env node
"use strict";
// MONO-10 v0.1 — suite de tests. Aucun reseau, aucun LLM reel, aucun run EF-02, aucun P0.2.
// Usage : node test/test-mono10.js <bundleRoot>

const path = require("path"), fs = require("fs"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
if (!fs.existsSync(path.join(KIT, "MONO-01", "index.js"))) {
  console.error("MONO-01 introuvable sous \"" + KIT + "\". Usage: node test/test-mono10.js <bundleRoot>");
  process.exit(2);
}
const { createMono01 } = require(path.join(KIT, "MONO-01", "index.js"));
const { nodeRunners } = require(path.join(KIT, "MONO-02", "lib", "node-runners.js"));
const V02 = path.join(KIT, "MONO-09", "v0.2", "lib");
const { createProfessionalPipelineAdapter } = require(path.join(V02, "professional-adapter.js"));

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
const FIXTURE = { allowFixture: true };
const now = () => new Date().toISOString();

// ---------- fixtures ----------
const MDS = { schema: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", dimensions: [{ id: "epistemologie" }, { id: "ethique-appliquee" }] };
const mkCS = (srcs) => ({ schema: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1", id: "corpus-fx", missionId: "m1", protocolRef: "p1", sources: srcs });
const S = (id, st, auth, disc) => ({ id: id, titre: "T" + id, auteurOuOrganisme: auth, discipline: disc || "epistemologie",
  provenance: { connectorId: "openalex", originalReference: "https://openalex.org/" + id }, statutScreening: st });

function baseAdapter(over) {
  return createProfessionalPipelineAdapter(Object.assign({
    resolveAuthorIdentity: async (s) => ({
      "Ada Lovelace": { providerAuthorId: "https://openalex.org/A1", orcid: "0000-0001-2345-6789", affiliation: "Univ A" },
      "Alan Turing": { providerAuthorId: "https://openalex.org/A2" },
      "Sans Trace": {},
    })[s.displayName] || {},
    fetchAuthorWorks: async () => [{ id: "https://openalex.org/W50", display_name: "W", doi: "https://doi.org/10.1/x", publication_year: 2020 }],
  }, over || {}));
}
async function discoverAndVerify(cs, ad) {
  const a = await ad.discoverProfessionals({ corpusSnapshot: cs, missionDimensionSet: MDS });
  const b = await ad.verifyProfessionals({ professionalDiscovery: a });
  return { a, b };
}
function humanDecision(candidateId, decision, confidence, evidenceRefs) {
  return { candidateId, decision, decisionReason: "motif de test explicite", identityConfidence: confidence || "STRONG",
    evidenceRefs: evidenceRefs || ["https://openalex.org/W1"], actorType: "human",
    actorIdentity: "FIXTURE:auditeur-test", decidedAt: now() };
}
function fullValidation(assessment, mapFn) {
  const tpl = PG.buildPanelValidationTemplate(assessment);
  tpl.decisions = tpl.decisions.map((d) => Object.assign({}, d, mapFn(d)));
  return tpl;
}

(async () => {
  console.log("MONO-10 v0.1 — qualification scientifique et portes humaines\n");

  const CS = mkCS([S("W1", "inclus", "Ada Lovelace, Alan Turing"), S("W2", "exclu", "Zoe Exclue"), S("W3", "inclus", "Sans Trace", "ethique-appliquee")]);
  const ad = baseAdapter();
  const { a: disc, b: ver } = await discoverAndVerify(CS, ad);
  const assess = CA.assessCandidates({ discovery: disc, verification: ver, missionDimensionSet: MDS });

  // ===== A — evaluation des candidats (amendement 1) =====
  check("T10-06. le vivier brut n'est pas converti en autant de revues humaines obligatoires",
    assess.summary.humanReviewBurden < assess.summary.total && assess.summary.humanReviewBurden > 0,
    JSON.stringify(assess.summary));
  check("T10-06b. un candidat sans identifiant fort est ecarte de la revue humaine",
    assess.assessments.find((x) => x.professionalIdentity.displayName === "Sans Trace").assessmentStatus === CA.STATUS.INSUFFICIENT);
  check("T10-07. aucun statut d'evaluation ne vaut approbation au panel",
    Object.values(CA.STATUS).every((s) => !/APPROVE|ADMITTED|PANEL_MEMBER/.test(s)));
  check("T10-07b. une entree invalide est refusee (fail-closed)",
    (function () { try { CA.assessCandidates({ discovery: { schema: "X" }, verification: ver }); return false; } catch (e) { return e.code === "ASSESSMENT_INPUT_INVALID"; } })());
  check("T10-08. base documentaire insuffisante n'est PAS un rejet scientifique",
    /pas un rejet de la personne/.test(assess.assessments.find((x) => x.assessmentStatus === CA.STATUS.INSUFFICIENT).assessmentReasons.join(" "))
    && /ne sont pas des rejets scientifiques/.test(assess.disclaimer));
  check("T10-08b. seuls les PRESENT_FOR_HUMAN_REVIEW sont presentes a la porte",
    PG.buildPanelValidationTemplate(assess).decisions.length === assess.summary.presentedForHumanReview);
  check("T10-08c. le gabarit ne pre-remplit aucune decision",
    PG.buildPanelValidationTemplate(assess).decisions.every((d) => d.decision === null && d.actorIdentity === null && d.decidedAt === null));

  // ===== B — porte humaine =====
  const approveAll = fullValidation(assess, (d) => humanDecision(d.candidateId, PG.DECISION.APPROVE, d.identityConfidence, d.evidenceRefs));
  check("T10-01. un ORCID seul n'approuve jamais : sans decision humaine, rien n'est approuve",
    (function () { const none = fullValidation(assess, () => ({})); const r = PG.validatePanelValidation(none, assess, FIXTURE);
      return r.valid === false && r.approved.length === 0; })());
  check("T10-01b. une approbation valide exige un acte humain complet",
    PG.validatePanelValidation(approveAll, assess, FIXTURE).valid === true);
  check("T10-03. DEFER reste DEFER et n'approuve personne",
    (function () { const v = fullValidation(assess, (d) => humanDecision(d.candidateId, PG.DECISION.DEFER, d.identityConfidence, d.evidenceRefs));
      const r = PG.validatePanelValidation(v, assess, FIXTURE); return r.valid === true && r.approved.length === 0 && r.counts.DEFER > 0; })());
  check("T10-04. une identite AMBIGUOUS ne peut pas etre approuvee",
    (function () { const v = fullValidation(assess, (d) => Object.assign(humanDecision(d.candidateId, PG.DECISION.APPROVE, "AMBIGUOUS", d.evidenceRefs)));
      const r = PG.validatePanelValidation(v, assess, FIXTURE);
      return r.valid === false && r.problems.some((p) => /AMBIGUOUS/.test(p)); })());
  check("T10-04b. une approbation sans evidenceRefs est refusee",
    (function () { const v = fullValidation(assess, (d) => humanDecision(d.candidateId, PG.DECISION.APPROVE, d.identityConfidence, []));
      return PG.validatePanelValidation(v, assess, FIXTURE).valid === false; })());
  check("T10-05. un acte humain fabrique est rejete (actorType non human)",
    (function () { const v = fullValidation(assess, (d) => Object.assign(humanDecision(d.candidateId, PG.DECISION.APPROVE, d.identityConfidence, d.evidenceRefs), { actorType: "llm" }));
      return PG.validatePanelValidation(v, assess, FIXTURE).valid === false; })());
  check("T10-05b. une fixture est refusee en PRODUCTION",
    PG.validatePanelValidation(approveAll, assess, { allowFixture: false }).valid === false);
  check("T10-05c. exhaustivite : un candidat sans decision bloque",
    (function () { const v = fullValidation(assess, (d) => humanDecision(d.candidateId, PG.DECISION.APPROVE, d.identityConfidence, d.evidenceRefs));
      v.decisions = v.decisions.slice(0, 1);
      const r = PG.validatePanelValidation(v, assess, FIXTURE);
      return v.decisions.length === 1 ? r.valid === false : true; })());

  // ===== C — adaptateur a porte =====
  const gated = PGA.createPanelGatedAdapter(ad, { panelValidation: approveAll, candidateAssessment: assess, allowFixture: true });
  const mono01 = createMono01(path.join(KIT, "MONO-01", "registry", "mono-00-frozen-baseline-registry-v1.json"));
  const ctx = { missionId: "m1", adapter: gated, dependenciesAvailable: {}, nodeOutputs: { "EF-PR-GEN-01": { missionDimensionSet: MDS }, "EF-ORCH-SUBSYSTEM": CS } };
  const nA = await nodeRunners["EF-02A"](mono01, ctx); ctx.nodeOutputs["EF-02A"] = nA.output;
  const nB = await nodeRunners["EF-02B"](mono01, ctx); ctx.nodeOutputs["EF-02B"] = nB.output;
  const nC = await nodeRunners["EF-02C"](mono01, ctx); ctx.nodeOutputs["EF-02C"] = nC.output;
  check("T10-02a. avec approbation humaine, le chemin runtime reel atteint EF-02C",
    nA.status === "SUCCESS" && nB.status === "SUCCESS" && nC.status === "SUCCESS" && nC.output.professionalCorpora.length > 0,
    nC.status + " corpora=" + (nC.output ? nC.output.professionalCorpora.length : 0));

  const rejectAll = fullValidation(assess, (d) => humanDecision(d.candidateId, PG.DECISION.REJECT, d.identityConfidence, d.evidenceRefs));
  const gatedReject = PGA.createPanelGatedAdapter(ad, { panelValidation: rejectAll, candidateAssessment: assess, allowFixture: true });
  const ctx2 = { missionId: "m1", adapter: gatedReject, dependenciesAvailable: {}, nodeOutputs: { "EF-PR-GEN-01": { missionDimensionSet: MDS }, "EF-ORCH-SUBSYSTEM": CS } };
  const r2A = await nodeRunners["EF-02A"](mono01, ctx2); ctx2.nodeOutputs["EF-02A"] = r2A.output;
  const r2B = await nodeRunners["EF-02B"](mono01, ctx2); ctx2.nodeOutputs["EF-02B"] = r2B.output;
  const r2C = await nodeRunners["EF-02C"](mono01, ctx2);
  check("T10-02. un professionnel VERIFIE sans approbation humaine n'atteint JAMAIS EF-02C",
    r2C.status === "SUCCESS" && r2C.output.professionalCorpora.length === 0,
    "corpora=" + (r2C.output ? r2C.output.professionalCorpora.length : "?"));
  check("T10-02b. il est retrograde avec un motif explicite, sa verification documentaire restant tracee",
    r2B.output.verified.every((v) => v.panelApproval === "NOT_APPROVED" && /aucun APPROVE/.test(v.panelGateReason || ""))
    && r2B.output.verified.some((v) => v.documentaryVerificationStatus === "VERIFIED"));
  check("T10-02c. sans porte humaine du tout, EF-02B echoue immediatement (fail-closed)",
    await (async () => { const g = PGA.createPanelGatedAdapter(ad, {});
      const c = { missionId: "m1", adapter: g, dependenciesAvailable: {}, nodeOutputs: { "EF-PR-GEN-01": { missionDimensionSet: MDS }, "EF-ORCH-SUBSYSTEM": CS } };
      const x = await nodeRunners["EF-02A"](mono01, c); c.nodeOutputs["EF-02A"] = x.output;
      const y = await nodeRunners["EF-02B"](mono01, c); return y.status !== "SUCCESS"; })());
  check("T10-02d. un verrou secondaire bloque une verification non filtree passee de force a EF-02C",
    await (async () => { try { await gatedReject.buildProfessionalCorpus({ professionalVerification: nB.output }); return false; }
      catch (e) { return e.code === "UNAPPROVED_PROFESSIONAL_REACHED_EF02C"; } })());

  // ===== D/E/F — capacite LLM =====
  const cfg = { providerId: "llm-worker", modelId: "modele-test", workerBindingId: "binding-test", authMode: "direct", credentialPresent: true };
  const okTransport = async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}', requestId: "req-1", costUsd: 0.0001 });
  const capOk = await LC.runActiveProbe(cfg, okTransport, { fixture: true });
  check("T10-09. dependenciesAvailable.llm=true seul ne vaut que DECLARED",
    LC.classifyLegacyDeclaration({ llm: true }).status === LC.STATUS.DECLARED);
  check("T10-09b. cette declaration n'est jamais AVAILABLE",
    LC.assertCapabilityUsable(LC.classifyLegacyDeclaration({ llm: true }), cfg, FIXTURE).usable === false);
  check("T10-10. credentialProbeSkipped plafonne a DEGRADED",
    (await LC.runActiveProbe(cfg, async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}', credentialProbeSkipped: true }), { fixture: true })).status === LC.STATUS.DEGRADED);
  check("T10-11. sans liaison worker reelle, la capacite est UNAVAILABLE",
    (await LC.runActiveProbe({ providerId: "p", modelId: "m" }, okTransport, { fixture: true })).status === LC.STATUS.UNAVAILABLE);
  check("T10-12. une reponse hors schema donne DEGRADED, jamais AVAILABLE",
    (await LC.runActiveProbe(cfg, async () => ({ httpStatus: 200, text: "oui" }), { fixture: true })).status === LC.STATUS.DEGRADED);
  check("T10-12b. la sonde valide une VRAIE reponse structuree, pas un jeton (amendement 2)",
    LC.PROBE_MAX_TOKENS >= 64 && LC.validateProbePayload('{"ok":true,"probe":"evidenceforge"}').valid
    && !LC.validateProbePayload('{"ok":false,"probe":"evidenceforge"}').valid);
  check("T10-12c. la sonde n'utilise aucune donnee de mission ni de cas sentinelle",
    capOk.probeContract.usesMissionData === false && capOk.probeContract.usesSentinelData === false
    && !/S01|S02|sentinelle|mission/i.test(LC.PROBE_PROMPT));
  check("T10-13. une sonde reussie conserve provider, modele, requestId, horodatage",
    capOk.providerId === cfg.providerId && capOk.modelId === cfg.modelId && capOk.requestId === "req-1"
    && !!capOk.probeTimestamp && capOk.workerBindingId === cfg.workerBindingId && capOk.costUsd === 0.0001);
  check("T10-13b. aucun secret n'est stocke",
    capOk.credentialPresenceAttested === true && !JSON.stringify(capOk).includes("sk-") && typeof capOk.credentialPresenceAttested === "boolean");
  check("T10-13c. un modele different du modele configure est refuse",
    LC.assertCapabilityUsable(Object.assign({}, capOk, { modelId: "autre" }), cfg, FIXTURE).usable === false);
  check("T10-14. une sonde de FIXTURE n'est jamais recevable comme preuve de production",
    LC.assertCapabilityUsable(capOk, cfg, { allowFixture: false }).usable === false
    && LC.assertCapabilityUsable(capOk, cfg, FIXTURE).usable === true);

  // ===== G/H — readiness =====
  const lineageRefs = [LIN.artifactRef(disc, "d"), LIN.artifactRef(ver, "v"), LIN.artifactRef(assess, "a"), LIN.artifactRef(approveAll, "p")];
  const preOk = SR.evaluateReadiness({ phase: "PRE", candidateAssessment: assess, panelValidation: approveAll, llmCapability: capOk, llmConfig: cfg, lineageRefs, allowFixture: true });
  check("T10-15. PRE sans panel approuve => NOT_READY",
    SR.evaluateReadiness({ phase: "PRE", candidateAssessment: assess, panelValidation: rejectAll, llmCapability: capOk, llmConfig: cfg, lineageRefs, allowFixture: true }).status === SR.READINESS.NOT_READY);
  check("T10-15b. PRE sans porte humaine du tout => NOT_READY",
    SR.evaluateReadiness({ phase: "PRE", candidateAssessment: assess, llmCapability: capOk, llmConfig: cfg, lineageRefs, allowFixture: true }).status === SR.READINESS.NOT_READY);
  check("T10-16. PRE sans LLM AVAILABLE alors que des noeuds LLM tourneront => NOT_READY",
    SR.evaluateReadiness({ phase: "PRE", candidateAssessment: assess, panelValidation: approveAll, llmCapability: LC.classifyLegacyDeclaration({ llm: true }), llmConfig: cfg, lineageRefs, allowFixture: true }).status === SR.READINESS.NOT_READY);
  check("T10-16b. PRE complet => READY", preOk.status === SR.READINESS.READY, JSON.stringify(preOk.blockingDimensions));
  const twinSet = { schema: "EvidenceForge.DocumentaryTwinSet", twins: [{ twinId: "t1" }] };
  const reviewSetFull = { schema: "EvidenceForge.DocumentaryReviewSet", reviews: [{ reviewStatus: "complete" }], summary: { targets: 1 } };
  const fullOk = SR.evaluateReadiness({ phase: "FULL", candidateAssessment: assess, panelValidation: approveAll, llmCapability: capOk, llmConfig: cfg, lineageRefs, allowFixture: true, professionalCorpus: nC.output, twinSet, reviewSet: reviewSetFull, aggregation: { aggregates: [{}] } });
  check("T10-17. FULL sans jumeau => NOT_READY",
    SR.evaluateReadiness({ phase: "FULL", candidateAssessment: assess, panelValidation: approveAll, llmCapability: capOk, llmConfig: cfg, lineageRefs, allowFixture: true, professionalCorpus: nC.output, twinSet: { twins: [] }, reviewSet: { reviews: [] } }).status === SR.READINESS.NOT_READY);
  check("T10-18. revues incompletes => PARTIAL",
    SR.evaluateReadiness({ phase: "FULL", candidateAssessment: assess, panelValidation: approveAll, llmCapability: capOk, llmConfig: cfg, lineageRefs, allowFixture: true, professionalCorpus: nC.output, twinSet: { twins: [{ twinId: "t1" }, { twinId: "t2" }] }, reviewSet: { reviews: [{ reviewStatus: "complete" }], summary: { targets: 2 } }, aggregation: { aggregates: [{}] } }).status === SR.READINESS.PARTIAL);
  check("T10-18b. aucun quota disciplinaire n'est applique", preOk.noDisciplineQuotaApplied === true && fullOk.noDisciplineQuotaApplied === true);

  // ===== I/J — qualification =====
  const qualOk = SQ.qualifyProcess({ readinessPre: preOk, readinessFull: fullOk, panelValidation: approveAll, llmCapability: capOk, reviewSet: reviewSetFull, lineageRefs });
  check("T10-19. rupture de lignee => NOT_QUALIFIED",
    SQ.qualifyProcess({ readinessPre: preOk, readinessFull: fullOk, panelValidation: approveAll, llmCapability: capOk, reviewSet: reviewSetFull, lineageRefs: [{ sha256: "trop-court" }] }).qualificationStatus === SQ.QUALIFICATION.NOT_QUALIFIED);
  check("T10-19b. defaut IMPOSSIBLE_TO_ASSESS sans artefacts de readiness",
    SQ.qualifyProcess({}).qualificationStatus === SQ.QUALIFICATION.IMPOSSIBLE);
  check("T10-19c. le nombre d'experts n'est jamais un critere",
    qualOk.expertCountUsedAsCriterion === false && !qualOk.criteria.some((c) => /count|nombre/i.test(c.id)));
  check("T10-20. un processus QUALIFIED peut porter un verdict NO_GO",
    qualOk.qualificationStatus === SQ.QUALIFICATION.QUALIFIED
    && SQ.applyLegacyVerdictPolicy(qualOk, "NO_GO").scientificallyActionableVerdict === "NO_GO", qualOk.qualificationStatus);
  check("T10-21. un processus QUALIFIED peut porter IMPOSSIBLE_TO_CONCLUDE",
    SQ.applyLegacyVerdictPolicy(qualOk, "IMPOSSIBLE_TO_CONCLUDE").scientificallyActionableVerdict === "IMPOSSIBLE_TO_CONCLUDE");
  check("T10-21b. la qualification ne choisit jamais le verdict",
    qualOk.scope === "PROCESS_ONLY" && qualOk.doesNotDecideVerdict === true && !("finalVerdict" in qualOk));
  const qualNot = SQ.qualifyProcess({ readinessPre: preOk, readinessFull: fullOk, panelValidation: rejectAll, llmCapability: capOk, reviewSet: reviewSetFull, lineageRefs });
  const pol = SQ.applyLegacyVerdictPolicy(qualNot, "NO_GO");
  check("T10-22. NOT_QUALIFIED conserve le verdict legacy mais rend l'usage NONE (amendement 3)",
    qualNot.qualificationStatus === SQ.QUALIFICATION.NOT_QUALIFIED
    && pol.legacyVerdict === "NO_GO" && pol.legacyVerdictPreserved === true
    && pol.scientificallyActionableVerdict === SQ.ACTIONABLE_NONE);
  check("T10-23. NOT_QUALIFIED => P0_2_ALLOWED = false", pol.p0_2Allowed === false);

  // ===== K — rapport scientifique =====
  const legacyReport = { schema: "EvidenceForge.UnifiedReportSummary", schemaVersion: "EF-04A-v1",
    mission: { missionId: "m1" }, testStatus: { testMode: true, scientificValidity: false, humanProfessionalValidation: false },
    convergences: [], divergences: [] };
  const legacyBefore = LIN.sha256Of(legacyReport);
  const report = SUR.buildScientificUnifiedReport({ legacyReport, legacyVerdict: "NO_GO", candidateAssessment: assess, panelValidation: approveAll, llmCapability: capOk, readinessPre: preOk, readinessFull: fullOk, qualification: qualOk });
  check("T10-24. scientificValidity legacy reste false", report.legacyScientificValidity === false);
  check("T10-25. humanProfessionalValidation legacy reste false", report.legacyHumanProfessionalValidation === false);
  check("T10-26. le rapport legacy n'est jamais mute",
    LIN.sha256Of(legacyReport) === legacyBefore && SUR.assertLegacyUntouched(report, legacyReport) === true);
  check("T10-26b. toutes les references exigees sont presentes et liees par empreinte",
    ["legacyReportReference", "candidateAssessmentReference", "professionalPanelValidationReference", "llmCapabilityReference", "readinessPreReference", "readinessFullReference", "scientificQualificationReference"]
      .every((k) => report[k] && /^[0-9a-f]{64}$/.test(report[k].sha256)));
  check("T10-26c. le rapport n'autorise jamais P0.2 par lui-meme", report.p0_2Allowed === false);

  // ===== L — acceptation finale =====
  const accTpl = FRA.buildAcceptanceTemplate(report);
  check("T10-27b. le gabarit d'acceptation ne pre-remplit rien",
    accTpl.decision === null && accTpl.actorIdentity === null && accTpl.decidedAt === null);
  const acc = Object.assign({}, accTpl, { decision: FRA.DECISION.ACCEPT_WITH_RESERVATIONS, actorType: "human", actorIdentity: "FIXTURE:proprietaire-test", decidedAt: now() });
  check("T10-27. une acceptation ne peut pas reecrire le verdict",
    FRA.validateAcceptance(Object.assign({}, acc, { finalVerdict: "GO" }), report, FIXTURE).valid === false
    && FRA.validateAcceptance(acc, report, FIXTURE).valid === true);
  check("T10-28. sans acceptation, P0.2 n'est pas autorise",
    FRA.resolveP0_2Authorization(report, null, FIXTURE).p0_2Allowed === false);
  check("T10-28b. REJECT_FOR_REVIEW bloque P0.2 sans changer le verdict",
    (function () { const r = FRA.resolveP0_2Authorization(report, Object.assign({}, acc, { decision: FRA.DECISION.REJECT }), FIXTURE);
      return r.p0_2Allowed === false && report.legacyVerdict === "NO_GO"; })());
  check("T10-28c. avec qualification suffisante et acceptation valide, P0.2 est autorise",
    FRA.resolveP0_2Authorization(report, acc, FIXTURE).p0_2Allowed === true,
    JSON.stringify(FRA.resolveP0_2Authorization(report, acc, FIXTURE).reasons));

  // ===== M — inconnus =====
  check("T10-M. DEFER, AMBIGUOUS, NOT_ASSESSED et IMPOSSIBLE_TO_ASSESS existent tous",
    PG.ALLOWED.includes("DEFER") && CA.STATUS.AMBIGUOUS === "IDENTITY_AMBIGUOUS"
    && SR.DIM.NOT_ASSESSED === "NOT_ASSESSED" && SQ.QUALIFICATION.IMPOSSIBLE === "IMPOSSIBLE_TO_ASSESS");

  // ===== hygiene et non-regression =====
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const libSrc = fs.readdirSync(path.join(__dirname, "..", "lib")).map((f) => strip(fs.readFileSync(path.join(__dirname, "..", "lib", f), "utf8")));
  check("T10-H1. aucun module MONO-10 n'AFFECTE scientificValidity=true ni humanProfessionalValidation=true",
    !libSrc.some((s) => /scientificValidity\s*[:=]\s*true/.test(s)) && !libSrc.some((s) => /humanProfessionalValidation\s*[:=]\s*true/.test(s)));
  check("T10-H2. le scan d'hygiene est discriminant", /scientificValidity\s*[:=]\s*true/.test(strip("const x = { scientificValidity: true };")));
  check("T10-H3. aucun acces reseau dans lib/", !libSrc.some((s) => /fetch\(|require\(\s*["']https?|https?\.request/.test(s)));
  const h = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  let cmp = 0, div = 0;
  for (const sub of ["dependencies", "ports", "lib"]) {
    const A = path.join(KIT, "MONO-01", sub), B = path.join(KIT, "MONO-02", "dependencies", "MONO-01", sub);
    if (!fs.existsSync(A) || !fs.existsSync(B)) continue;
    for (const f of fs.readdirSync(A)) { const pa = path.join(A, f), pb = path.join(B, f);
      if (fs.statSync(pa).isDirectory()) continue; cmp++; if (!fs.existsSync(pb) || h(pa) !== h(pb)) div++; }
  }
  check("T10-29. MONO-01 inchange (reference croisee interne, jamais une constante auto-ecrite)", cmp > 0 && div === 0, "compares=" + cmp + " divergents=" + div);
  check("T10-29b. MONO-09 v0.1 et v0.2 inchanges a leurs propres SHA256SUMS",
    ["v0.1", "v0.2"].every(function (v) {
      const d = path.join(KIT, "MONO-09", v); if (!fs.existsSync(path.join(d, "SHA256SUMS.txt"))) return false;
      return fs.readFileSync(path.join(d, "SHA256SUMS.txt"), "utf8").trim().split("\n").every(function (line) {
        const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) return false;
        const p = path.join(d, m[2]); return fs.existsSync(p) && h(p) === m[1]; });
    }));

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
