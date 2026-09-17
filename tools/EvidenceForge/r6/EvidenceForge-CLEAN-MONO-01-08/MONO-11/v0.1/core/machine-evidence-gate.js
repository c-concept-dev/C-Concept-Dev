"use strict";
/**
 * MONO-11 v0.1 — core/machine-evidence-gate.js   (audit §8, §9 : G-1 … G-11)
 *
 * LE GATE AUTONOME. Il remplace, dans le chemin nominal, la porte humaine
 * obligatoire de MONO-10 v0.19 par une DECISION MACHINE FONDEE SUR PREUVES,
 * sans jamais se presenter comme un acte humain (actorType: "machine").
 *
 * Ce qu'il consomme — des ARTEFACTS deja lies au run, jamais un jugement :
 *   - ProfessionalCandidateAssessment (MONO-10 v0.19, gele) : identite derivee
 *     de provenance authentifiee, preuves de mission resolues, unknowns ;
 *   - CorpusSufficiencyEvidence (MONO-11) ;
 *   - RelevanceEvidence (MONO-11, oracle reel) ;
 *   - l'origine de decouverte du candidat (graine / secondaire) et les
 *     identifiants des oeuvres-graines, pour l'anti-circularite.
 *
 * Ce qu'il ne voit JAMAIS (G-7) : corpus professionnel construit, jumeaux,
 * revues, agregation, verdict. Leur presence dans l'entree est un REFUS.
 *
 * Ce qu'il ne contient pas : metier, discipline, expert, panel, quota, seuil
 * de cas. Les seuils sont ceux des contrats (identite : MODERATE, comme
 * MONO-10 ; corpus : politique EF-02D1 contractuelle).
 *
 * Etats rendus (contrat gateStates) :
 *   AUTO_APPROVED_FOR_DOCUMENTARY_PANEL | AUTO_REJECTED | AUTO_DEFERRED |
 *   AMBIGUOUS | INSUFFICIENT_DOCUMENTARY_BASIS
 * AMBIGUOUS et INSUFFICIENT ne sont jamais promus ; AUTO_DEFERRED est terminal
 * dans le run nominal. Un critere non evaluable est UNKNOWN, jamais SATISFIED.
 */
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const CONTRACTS = require(path.join(__dirname, "..", "contracts", "mono11-contracts.json"));

const STATE = Object.freeze({
  APPROVED: "AUTO_APPROVED_FOR_DOCUMENTARY_PANEL", REJECTED: "AUTO_REJECTED", DEFERRED: "AUTO_DEFERRED",
  AMBIGUOUS: "AMBIGUOUS", INSUFFICIENT: "INSUFFICIENT_DOCUMENTARY_BASIS",
});
const CRIT = Object.freeze({ SAT: "SATISFIED", UNSAT: "UNSATISFIED", UNKNOWN: "UNKNOWN", RES: "RESERVATION" });
const RANK = { WEAK: 0, AMBIGUOUS: 0, MODERATE: 1, STRONG: 2 };
const DOWNSTREAM_KEYS = ["professionalCorpus", "corpusSet", "twinSet", "twins", "reviewSet", "reviews", "aggregation", "verdict", "report", "qualification"];
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);
const sha = (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const GATE_MODULE_SHA256 = crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex");
const GATE_VERSION = "MONO-11-v1";

Object.values(STATE).forEach((s) => { if (CONTRACTS.gateStates.values.indexOf(s) === -1) throw new Error("GATE_STATE_NOT_CONTRACTUAL: " + s); });

/** Identite reelle de l'acteur machine : ce module, sous cette frontiere, dans ce run. Jamais "human". */
function machineActor(ctx) {
  return {
    actorType: "machine",
    actorIdentity: "mono11-machine-evidence-gate@" + ((ctx && ctx.operatorTrustBoundaryId) || "unbound"),
    mechanismRef: "MONO-11/v0.1/core/machine-evidence-gate.js",
    gateVersion: GATE_VERSION, gateModuleSha256: GATE_MODULE_SHA256,
    runId: (ctx && ctx.runId) || null, attestationHash: (ctx && ctx.attestationHash) || null,
    notAHumanAct: true,
  };
}

function crit(id, state, reason, evidenceRefs) {
  if (CONTRACTS.gateCriteria.values.indexOf(id) === -1) throw new Error("GATE_CRITERION_NOT_CONTRACTUAL: " + id);
  return { criterion: id, state: state, reason: reason, evidenceRefs: arr(evidenceRefs) };
}

/**
 * gateCandidate(input) — decision pour UN candidat.
 * input : { assessment (entree de assessments[] MONO-10), candidate (entree de discovery.candidates[]),
 *           corpusEvidence, relevanceEvidence, seedWorkRefs[], evidenceArtifactRefs{corpus,relevance,assessment},
 *           ctx: { runId, missionHash, operatorTrustBoundaryId, attestationHash }, minIdentityConfidence? }
 */
function gateCandidate(input) {
  input = input || {};
  DOWNSTREAM_KEYS.forEach(function (k) {
    if (input[k] !== undefined || (input.ctx && input.ctx[k] !== undefined)) {
      const e = new Error("GATE_SEES_DOWNSTREAM: l'artefact aval \"" + k + "\" a ete presente au gate — refus (G-7, independance du verdict).");
      e.code = "GATE_SEES_DOWNSTREAM"; throw e;
    }
  });
  const a = input.assessment || {}, c = input.candidate || {}, ce = input.corpusEvidence || null, re = input.relevanceEvidence || null;
  const ctx = input.ctx || {};
  const refs = input.evidenceArtifactRefs || {};
  const candidateId = isStr(a.candidateId) ? a.candidateId : (isStr(c.candidateRef) ? c.candidateRef : null);
  const minConf = isStr(input.minIdentityConfidence) && RANK[input.minIdentityConfidence] >= RANK[CONTRACTS.identityPolicy.minIdentityConfidence]
    ? input.minIdentityConfidence : CONTRACTS.identityPolicy.minIdentityConfidence;
  const criteria = [], reasonCodes = [], unresolvedFacts = [];

  /* G-1 identite */
  const conf = a.identityConfidence || null;
  if (!candidateId || !conf) { criteria.push(crit("G1_IDENTITY_RESOLVED", CRIT.UNKNOWN, "aucune evaluation d'identite", [refs.assessment])); reasonCodes.push("IDENTITY_UNRESOLVED"); }
  else if (conf === "AMBIGUOUS" || c.identityAmbiguity) { criteria.push(crit("G1_IDENTITY_RESOLVED", CRIT.UNSAT, "identite AMBIGUOUS : " + arr(a.identityConfidenceReasons).join(" ; "), [refs.assessment])); reasonCodes.push("IDENTITY_AMBIGUOUS"); }
  else if ((RANK[conf] || 0) < RANK[minConf]) { criteria.push(crit("G1_IDENTITY_RESOLVED", CRIT.UNSAT, "confiance " + conf + " < " + minConf, [refs.assessment])); reasonCodes.push("IDENTITY_CONFIDENCE_BELOW_MINIMUM"); }
  else criteria.push(crit("G1_IDENTITY_RESOLVED", CRIT.SAT, "identite " + conf + " derivee de provenance authentifiee (MONO-10)", [refs.assessment]));
  if (ce && arr(ce.identityContradictions).length) { criteria.push(crit("G1_IDENTITY_RESOLVED", CRIT.UNSAT, ce.identityContradictions.join(" ; "), [refs.corpus])); reasonCodes.push("IDENTITY_AMBIGUOUS"); }

  /* G-2 rattachement des preuves : oeuvres ATTRIBUEES au candidat (pas seulement la source-graine) */
  if (!ce) { criteria.push(crit("G2_EVIDENCE_ATTRIBUTED", CRIT.UNKNOWN, "aucune sonde de corpus", [])); reasonCodes.push("NO_ATTRIBUTED_EVIDENCE"); }
  else if (ce.attribution && ce.attribution.status === "UNKNOWN") { criteria.push(crit("G2_EVIDENCE_ATTRIBUTED", CRIT.UNKNOWN, "attribution non constatable", [refs.corpus])); reasonCodes.push("CORPUS_NOT_ATTRIBUTABLE"); }
  else if (!ce.attribution || arr(ce.attribution.attributedWorkRefs).length === 0) { criteria.push(crit("G2_EVIDENCE_ATTRIBUTED", CRIT.UNSAT, "aucune oeuvre attribuee", [refs.corpus])); reasonCodes.push("NO_ATTRIBUTED_EVIDENCE"); }
  else criteria.push(crit("G2_EVIDENCE_ATTRIBUTED", CRIT.SAT, ce.attribution.attributedWorkRefs.length + " oeuvre(s) attribuee(s) (" + ce.attribution.method + ")", [refs.corpus]));

  /* G-4 suffisance du corpus */
  if (!ce) criteria.push(crit("G4_CORPUS_SUFFICIENT", CRIT.UNKNOWN, "aucune sonde de corpus", []));
  else if (ce.status === "SUFFICIENT") criteria.push(crit("G4_CORPUS_SUFFICIENT", CRIT.SAT, "politique " + (ce.policy && ce.policy.policyId) + " satisfaite : " + JSON.stringify(ce.eligibility && ce.eligibility.observed), [refs.corpus]));
  else if (ce.status === "UNKNOWN") criteria.push(crit("G4_CORPUS_SUFFICIENT", CRIT.UNKNOWN, arr(ce.limitations).join(" ; "), [refs.corpus]));
  else { criteria.push(crit("G4_CORPUS_SUFFICIENT", CRIT.UNSAT, arr(ce.reasonCodes).join(",") + " : " + JSON.stringify(ce.eligibility && ce.eligibility.observed), [refs.corpus])); arr(ce.reasonCodes).forEach((r) => { if (r !== "IDENTITY_AMBIGUOUS") reasonCodes.push(r); }); }

  /* G-3 pertinence reelle */
  const rc = re ? re.relevanceClass : "UNKNOWN";
  if (!re || rc === "UNKNOWN") { criteria.push(crit("G3_REAL_RELEVANCE", CRIT.UNKNOWN, re ? (re.oracle && re.oracle.error) || "classe UNKNOWN" : "aucune preuve de pertinence", [refs.relevance])); reasonCodes.push("RELEVANCE_UNKNOWN"); }
  else if (rc === "SUPPORTED") criteria.push(crit("G3_REAL_RELEVANCE", CRIT.SAT, re.supportingDimensions.length + " dimension(s) mission_relevant documentee(s) sur oeuvres attribuees", [refs.relevance]));
  else if (rc === "PARTIAL") { criteria.push(crit("G3_REAL_RELEVANCE", CRIT.UNSAT, "pertinence partielle ou non documentee seulement", [refs.relevance])); reasonCodes.push("RELEVANCE_PARTIAL_ONLY"); }
  else if (rc === "OUT_OF_SCOPE") { criteria.push(crit("G3_REAL_RELEVANCE", CRIT.UNSAT, "toutes les dimensions jugees mission_irrelevant", [refs.relevance])); reasonCodes.push("RELEVANCE_OUT_OF_SCOPE"); }
  else { criteria.push(crit("G3_REAL_RELEVANCE", CRIT.UNKNOWN, "pertinence non determinable", [refs.relevance])); reasonCodes.push("RELEVANCE_NOT_DETERMINABLE"); }
  if (re && arr(re.reasonCodes).indexOf("RELEVANCE_EVIDENCE_NOT_ATTRIBUTED") !== -1) reasonCodes.push("RELEVANCE_EVIDENCE_NOT_ATTRIBUTED");

  /* G-5 ambiguites non bloquantes (unknowns du candidat dans l'evaluation MONO-10) */
  const blocking = arr(input.candidateUnknowns).filter((u) => u && u.blockingStatus === "BLOCKING");
  if (blocking.length) { criteria.push(crit("G5_NO_BLOCKING_AMBIGUITY", CRIT.UNSAT, blocking.length + " inconnu(s) BLOQUANT(s)", [refs.assessment])); reasonCodes.push("BLOCKING_UNKNOWN_PRESENT"); }
  else criteria.push(crit("G5_NO_BLOCKING_AMBIGUITY", CRIT.SAT, "aucun inconnu bloquant", [refs.assessment]));

  /* G-8 anti-circularite : le soutien de pertinence ne peut pas reposer UNIQUEMENT sur l'oeuvre-graine */
  const seedRefs = new Set(arr(input.seedWorkRefs).filter(isStr));
  const isSeed = c.candidateStatus === "SEED_CANDIDATE" || a.discoveryOrigin === "SEED_CANDIDATE";
  if (rc === "SUPPORTED") {
    const supportWorks = arr(re.supportingWorks).map((w) => w.workRef).filter(isStr);
    const nonSeed = supportWorks.filter((w) => !seedRefs.has(w));
    if (isSeed && supportWorks.length && nonSeed.length === 0) { criteria.push(crit("G8_ANTI_CIRCULARITY", CRIT.UNSAT, "seule l'oeuvre-graine soutient la pertinence (SEED_ONLY)", [refs.relevance])); reasonCodes.push("SEED_ONLY_SUPPORT"); }
    else criteria.push(crit("G8_ANTI_CIRCULARITY", CRIT.SAT, (isSeed ? nonSeed.length + " oeuvre(s) hors graine soutien(nen)t la pertinence" : "candidat de decouverte secondaire : soutien independant du corpus retenu"), [refs.relevance]));
  } else criteria.push(crit("G8_ANTI_CIRCULARITY", CRIT.UNKNOWN, "sans pertinence SUPPORTED, la circularite n'est pas evaluee", []));
  if (!isSeed) reasonCodes.push("SECONDARY_DISCOVERY");

  /* G-7 independance du verdict : structurelle (refus ci-dessus) */
  criteria.push(crit("G7_VERDICT_INDEPENDENCE", CRIT.SAT, "aucun artefact aval presente au gate", []));

  /* G-11 provenance complete : chaque preuve porte une reference d'artefact lie au run */
  const missingRefs = ["assessment", "corpus", "relevance"].filter((k) => !refs[k] || !isStr(refs[k].sha256));
  if (missingRefs.length) { criteria.push(crit("G11_PROVENANCE_COMPLETE", CRIT.UNKNOWN, "references d'artefact manquantes : " + missingRefs.join(","), [])); reasonCodes.push("PROVENANCE_UNRESOLVED"); }
  else criteria.push(crit("G11_PROVENANCE_COMPLETE", CRIT.SAT, "assessment, corpus et relevance references par hash", [refs.assessment, refs.corpus, refs.relevance]));

  /* G-9 diversite observee (jamais exigee) ; G-6 et G-10 sont evalues au niveau du panel */
  const div = ce && ce.diversityObserved;
  criteria.push(crit("G9_EMERGENT_DIVERSITY", div ? CRIT.RES : CRIT.UNKNOWN, div ? "annees=" + div.distinctYears + " themes=" + div.distinctTopics : "non observee", [refs.corpus]));

  /* DECISION — ordre contractuel : AMBIGUOUS > INSUFFICIENT > REJECTED > DEFERRED > APPROVED */
  const st = (id) => criteria.filter((x) => x.criterion === id).map((x) => x.state);
  const unsat = (id) => st(id).indexOf(CRIT.UNSAT) !== -1;
  const unknown = (id) => st(id).indexOf(CRIT.UNKNOWN) !== -1;
  let state;
  if (unsat("G1_IDENTITY_RESOLVED") && reasonCodes.indexOf("IDENTITY_AMBIGUOUS") !== -1) state = STATE.AMBIGUOUS;
  else if (unknown("G1_IDENTITY_RESOLVED") || unsat("G1_IDENTITY_RESOLVED")) state = STATE.INSUFFICIENT;
  else if (unsat("G2_EVIDENCE_ATTRIBUTED") || unknown("G2_EVIDENCE_ATTRIBUTED") || unsat("G4_CORPUS_SUFFICIENT") || unknown("G4_CORPUS_SUFFICIENT") || unknown("G11_PROVENANCE_COMPLETE")) state = STATE.INSUFFICIENT;
  else if (rc === "OUT_OF_SCOPE") state = STATE.REJECTED;
  else if (unsat("G5_NO_BLOCKING_AMBIGUITY") || unknown("G3_REAL_RELEVANCE") || unsat("G3_REAL_RELEVANCE") || unsat("G8_ANTI_CIRCULARITY")) state = STATE.DEFERRED;
  else state = STATE.APPROVED;
  if (state === STATE.APPROVED && rc !== "SUPPORTED") throw new Error("GATE_INVARIANT_VIOLATION: approbation sans pertinence SUPPORTED");
  if (state === STATE.APPROVED && reasonCodes.indexOf("IDENTITY_AMBIGUOUS") !== -1) throw new Error("GATE_INVARIANT_VIOLATION: approbation sur identite ambigue");

  criteria.forEach((x) => { if (x.state === CRIT.UNKNOWN) unresolvedFacts.push(x.criterion + " : " + x.reason); });
  const evidenceRefs = [refs.assessment, refs.corpus, refs.relevance].filter((r) => r && isStr(r.sha256));
  const actor = machineActor(ctx);
  const decision = {
    schema: "EvidenceForge.MachineEvidenceGateDecision", schemaVersion: GATE_VERSION,
    candidateId: candidateId, displayName: c.displayName || (a.professionalIdentity && a.professionalIdentity.displayName) || null,
    state: state, reasonCodes: Array.from(new Set(reasonCodes)),
    criteria: criteria, unresolvedFacts: unresolvedFacts,
    evidenceRefs: evidenceRefs,
    relevanceClass: rc, corpusStatus: ce ? ce.status : null, identityConfidence: conf, discoveryOrigin: isSeed ? "SEED_CANDIDATE" : (c.candidateStatus || a.discoveryOrigin || null),
    supportingWorks: rc === "SUPPORTED" ? arr(re.supportingWorks) : [],
    missionHash: ctx.missionHash || null, runId: ctx.runId || null,
    machineActor: actor, decidedAt: new Date().toISOString(),
    humanOverride: null,
    notAHumanDecision: "decision MACHINE fondee sur preuves ; presentable a un humain pour audit ou override, jamais comme acte humain",
  };
  decision.decisionHash = sha({ candidateId: decision.candidateId, state: decision.state, reasonCodes: decision.reasonCodes,
    evidenceRefs: evidenceRefs.map((r) => r.sha256), missionHash: decision.missionHash, runId: decision.runId, actor: actor.actorIdentity, gate: GATE_MODULE_SHA256 });
  return decision;
}

/**
 * gatePanel(input) — applique gateCandidate a chaque candidat, puis evalue G-6 (couverture) et G-10.
 * input : { candidates: [gateCandidate inputs], dimensionSet, ctx }
 */
function gatePanel(input) {
  input = input || {};
  DOWNSTREAM_KEYS.forEach(function (k) { if (input[k] !== undefined) { const e = new Error("GATE_SEES_DOWNSTREAM: " + k); e.code = "GATE_SEES_DOWNSTREAM"; throw e; } });
  const decisions = arr(input.candidates).map((ci) => gateCandidate(Object.assign({}, ci, { ctx: input.ctx })));
  const approved = decisions.filter((d) => d.state === STATE.APPROVED);
  const counts = {}; CONTRACTS.gateStates.values.forEach((s) => { counts[s] = decisions.filter((d) => d.state === s).length; });
  /* G-6 couverture : consignee, jamais remplie par quota */
  const dims = arr(input.dimensionSet && input.dimensionSet.dimensions);
  const inputById = new Map();
  arr(input.candidates).forEach((ci) => { const id = ci.assessment && ci.assessment.candidateId; if (id) inputById.set(id, ci); });
  const coverage = dims.map(function (d) {
    const providers = approved.filter(function (a) {
      const ci = inputById.get(a.candidateId);
      return !!ci && arr(ci.relevanceEvidence && ci.relevanceEvidence.supportingDimensions).some((s) => s.dimensionId === d.id);
    }).map((a) => a.candidateId);
    return { dimensionId: d.id, label: d.label, providers: providers, covered: providers.length > 0 };
  });
  const uncovered = coverage.filter((c) => !c.covered).map((c) => c.dimensionId);
  const reservations = [];
  if (uncovered.length) reservations.push({ code: "DIMENSION_UNCOVERED", detail: "dimension(s) sans professionnel approuve : " + uncovered.join(", ") + " — consignee, jamais comblee par quota" });
  const affiliations = new Set(approved.map((a) => (inputById.get(a.candidateId) || {}).candidate).map((c) => c && c.affiliation).filter(isStr));
  if (approved.length > 1 && affiliations.size <= 1) reservations.push({ code: "DIVERSITY_NOT_OBSERVED", detail: "les professionnels approuves partagent une seule affiliation observee" });
  reservations.push({ code: "PANEL_ADMITTED_BY_MACHINE_EVIDENCE_GATE_WITHOUT_HUMAN_ACT", detail: approved.length + " admission(s) par gate machine ; aucun acte humain (Charte v2)" });
  const actor = machineActor(input.ctx || {});
  const panel = {
    schema: "EvidenceForge.MachineEvidenceGatePanel", schemaVersion: GATE_VERSION,
    missionHash: (input.ctx && input.ctx.missionHash) || null, runId: (input.ctx && input.ctx.runId) || null,
    dimensionSetRef: input.dimensionSet ? { missionId: input.dimensionSet.missionId, dimensionSetHash: input.dimensionSet.dimensionSetHash } : null,
    decisions: decisions, counts: counts,
    approvedCandidateIds: approved.map((a) => a.candidateId),
    coverage: { byDimension: coverage, uncoveredDimensions: uncovered, criterion: "G6_MISSION_COVERAGE", state: uncovered.length ? CRIT.RES : CRIT.SAT },
    disagreementPolicy: { criterion: "G10_DISAGREEMENT_PRESERVED", state: CRIT.SAT, rule: "aucun candidat n'est ecarte pour divergence ; les divergences sont conservees par l'agregation aval" },
    reservations: reservations,
    fixedQuota: false, fixedPanelSize: false, humanOverrideApplied: false,
    machineActor: actor, decidedAt: new Date().toISOString(),
  };
  panel.panelHash = sha({ decisions: decisions.map((d) => d.decisionHash), missionHash: panel.missionHash, runId: panel.runId, actor: actor.actorIdentity });
  return panel;
}

module.exports = { gateCandidate, gatePanel, machineActor, STATE, CRIT, GATE_VERSION, GATE_MODULE_SHA256, DOWNSTREAM_KEYS };
