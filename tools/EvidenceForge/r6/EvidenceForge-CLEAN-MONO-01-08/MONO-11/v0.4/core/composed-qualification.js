"use strict";
/**
 * MONO-11 v0.2 — core/composed-qualification.js   (audit §8 : readiness / qualification composees)
 *
 * MONO-10 v0.19 `scientific-readiness.js` et `scientific-qualification.js` exigent
 * `professionalPanelGate` = approbation humaine + capacite HUMAN_AUTHENTICATED.
 * Ils ne sont pas modifies. MONO-11 REUTILISE leurs briques (capacite LLM
 * `assertCapabilityUsable`, inconnus, registre authentifie, contrats d'etats) et
 * remplace UNIQUEMENT le critere de porte par `evidence_gate_passed`.
 *
 * Invariants conserves :
 *   - qualification du processus != verdict ;
 *   - une admission machine est TOUJOURS une reserve consignee : jamais QUALIFIED sans reserve ;
 *   - 0 admis, 0 jumeau, 0 revue, LLM non prouve, lignee rompue => NOT_QUALIFIED ;
 *   - un intrant absent => IMPOSSIBLE_TO_ASSESS, jamais un succes par defaut.
 */
const path = require("path");
const CONTRACTS = require(path.join(__dirname, "..", "contracts", "mono11-contracts.json"));
const ADMITS = CONTRACTS.gateStates.admitsToCorpus;
const arr = (v) => (Array.isArray(v) ? v : []);
const DIM = Object.freeze({ SATISFIED: "SATISFIED", UNSATISFIED: "UNSATISFIED", NOT_ASSESSED: "NOT_ASSESSED" });
const READINESS = Object.freeze({ READY: "READY", READY_WITH_RESERVATIONS: "READY_WITH_RESERVATIONS", NOT_READY: "NOT_READY" });
const PRE = ["candidateAssessment", "evidenceGate", "blockingAmbiguities", "llmCapability", "lineage", "unknowns"];
const FULL_ONLY = ["professionalCorpus", "twins", "reviews", "aggregation"];

/** Cardinalite attendue des revues : jumeaux actifs x cibles resolues ; acceptee = revues complete. Egalite stricte exigee. */
function reviewCardinality(reviewSet, twinSet) {
  const reviews = arr(reviewSet && reviewSet.reviews);
  const accepted = reviews.filter((r) => r && r.reviewStatus === "complete").length;
  const summ = (reviewSet && reviewSet.summary) || {};
  let expected;
  if (Number.isInteger(summ.reviewsExpected)) expected = summ.reviewsExpected;
  else {
    const twins = arr(twinSet && twinSet.twins).filter((t) => !t.retracted).length;
    const targets = Number.isInteger(summ.targets) ? summ.targets - arr(reviewSet && reviewSet.unresolvedTargets).length : null;
    expected = twins && targets !== null ? twins * targets : reviews.length;
  }
  return { accepted: accepted, expected: expected, produced: reviews.length };
}

function admitted(panel) {
  return arr(panel && panel.decisions).filter((d) => (d.humanOverride && d.humanOverride.effect === "ADMITTED_BY_HUMAN_OVERRIDE") || (ADMITS.indexOf(d.state) !== -1 && !(d.humanOverride && d.humanOverride.effect === "REMOVED_BY_HUMAN_OVERRIDE")));
}

/**
 * evaluateReadiness({ phase, frozen, assessment, panel, llmCapability, llmConfig, runContext, ledger, registry, corpusSet, twinSet, reviewSet, aggregation })
 */
function evaluateReadiness(input) {
  input = input || {};
  const phase = input.phase === "FULL" ? "FULL" : "PRE";
  const F = input.frozen;
  const dims = [];
  const d = (name, status, reasons) => dims.push({ dimension: name, status: status, reasons: arr(reasons) });
  const a = input.assessment, p = input.panel;
  d("candidateAssessment", a && arr(a.assessments).length ? DIM.SATISFIED : DIM.UNSATISFIED, a ? [arr(a.assessments).length + " candidat(s) evalue(s)"] : ["aucune evaluation"]);
  const adm = admitted(p);
  d("evidenceGate", p && p.schema === "EvidenceForge.MachineEvidenceGatePanel" && adm.length ? DIM.SATISFIED : DIM.UNSATISFIED,
    p ? [adm.length + " admis par gate machine" + (p.humanOverrideApplied ? " (+override humain)" : ""), "acteur " + (p.machineActor && p.machineActor.actorType)] : ["aucun panel machine"]);
  const badAmb = adm.filter((x) => x.state === "AMBIGUOUS" || x.identityConfidence === "AMBIGUOUS");
  d("blockingAmbiguities", badAmb.length ? DIM.UNSATISFIED : DIM.SATISFIED, badAmb.length ? [badAmb.length + " admis sur identite ambigue"] : ["aucun admis ambigu"]);
  let cap = { usable: false, problems: ["capacite non evaluee"] };
  if (input.llmCapability && F) cap = F.M10.LLM.assertCapabilityUsable(input.llmCapability, input.llmConfig, input.runContext || {});
  d("llmCapability", cap.usable ? DIM.SATISFIED : DIM.UNSATISFIED, cap.usable ? ["capacite LLM prouvee par sonde reelle (MONO-10)"] : arr(cap.problems).slice(0, 3));
  const ledgerOk = input.ledger ? input.ledger.verifyChain() : { valid: false, problems: ["registre MONO-11 absent"] };
  const regOk = input.registry && typeof input.registry.verifyEventChain === "function" ? input.registry.verifyEventChain() : { valid: false, problems: ["registre MONO-10 absent"] };
  d("lineage", ledgerOk.valid && regOk.valid ? DIM.SATISFIED : DIM.UNSATISFIED, [].concat(ledgerOk.problems || [], regOk.problems || []).slice(0, 3).concat(ledgerOk.valid && regOk.valid ? ["deux chaines verifiees : MONO-10 (" + regOk.eventCount + " ev.) + MONO-11 (" + ledgerOk.eventCount + " ev.)"] : []));
  const blockingUnknowns = F ? F.M10.UNK.blockingOpen(arr(a && a.unknowns)).length : arr(a && a.unknowns).filter((u) => u.blockingStatus === "BLOCKING").length;
  const admittedWithBlocking = adm.filter((x) => arr(x.reasonCodes).indexOf("BLOCKING_UNKNOWN_PRESENT") !== -1).length;
  d("unknowns", admittedWithBlocking ? DIM.UNSATISFIED : DIM.SATISFIED, [blockingUnknowns + " inconnu(s) bloquant(s) ouverts en amont, " + admittedWithBlocking + " chez les admis"]);
  if (phase === "FULL") {
    const admIds = new Set(adm.map((x) => x.candidateId));
    const corpora = arr(input.corpusSet && input.corpusSet.professionalCorpora);
    const okCorp = corpora.filter((c) => c.status === "complete" && admIds.has(c.professionalRef));
    d("professionalCorpus", okCorp.length && corpora.every((c) => admIds.has(c.professionalRef)) ? DIM.SATISFIED : DIM.UNSATISFIED, [okCorp.length + "/" + corpora.length + " corpus complets, tous admis=" + corpora.every((c) => admIds.has(c.professionalRef))]);
    const twins = arr(input.twinSet && input.twinSet.twins).filter((t) => !t.retracted);
    d("twins", twins.length && twins.every((t) => admIds.has(t.professionalRef)) ? DIM.SATISFIED : DIM.UNSATISFIED, [twins.length + " jumeau(x), hors panel=" + twins.filter((t) => !admIds.has(t.professionalRef)).length]);
    const rc = reviewCardinality(input.reviewSet, input.twinSet);
    d("reviews", rc.expected > 0 && rc.accepted === rc.expected ? DIM.SATISFIED : DIM.UNSATISFIED, [rc.accepted + "/" + rc.expected + " revue(s) acceptee(s) (attendues = jumeaux actifs x cibles resolues)"]);
    const aggs = arr(input.aggregation && input.aggregation.aggregates);
    d("aggregation", aggs.length ? DIM.SATISFIED : DIM.UNSATISFIED, [aggs.length + " groupe(s) agrege(s)"]);
  }
  const blocking = dims.filter((x) => x.status !== DIM.SATISFIED).map((x) => x.dimension);
  const status = blocking.length ? READINESS.NOT_READY : READINESS.READY_WITH_RESERVATIONS;
  return { schema: "EvidenceForge.Mono11Readiness", schemaVersion: "MONO-11-v1", phase: phase, status: status, dimensions: dims, blockingDimensions: blocking,
    reservations: [CONTRACTS.mandatoryReservations.values[0]], note: "READY sans reserve est inatteignable par construction : une admission machine est toujours une reserve consignee" };
}

/**
 * qualifyProcess(input) — memes entrees que evaluateReadiness + { upstreamReservations[], readinessPre, readinessFull }
 */
function qualifyProcess(input) {
  input = input || {};
  const criteria = [];
  const crit = (id, pass, detail) => criteria.push({ criterion: id, pass: pass === true, detail: detail });
  const missing = ["assessment", "panel", "corpusSet", "twinSet", "reviewSet", "aggregation", "llmCapability"].filter((k) => !input[k]);
  if (missing.length) {
    return out("IMPOSSIBLE_TO_ASSESS", [{ code: "INPUT_MISSING", detail: "intrant(s) absent(s) : " + missing.join(", ") }], missing.map((k) => ({ reason: k + " absent", blocking: true })));
  }
  const pre = input.readinessPre || evaluateReadiness(Object.assign({}, input, { phase: "PRE" }));
  const full = input.readinessFull || evaluateReadiness(Object.assign({}, input, { phase: "FULL" }));
  const p = input.panel, adm = admitted(p);
  crit("evidence_gate_present", p.schema === "EvidenceForge.MachineEvidenceGatePanel" && p.machineActor && p.machineActor.actorType === "machine", "panel machine, acteur " + (p.machineActor && p.machineActor.actorIdentity));
  crit("evidence_gate_passed", adm.length > 0, adm.length + " professionnel(s) admis (" + adm.map((x) => x.state).join(",") + ")");
  crit("no_ambiguous_admitted", adm.every((x) => x.state !== "AMBIGUOUS"), "aucun admis AMBIGUOUS");
  crit("relevance_real_for_admitted", adm.every((x) => (x.humanOverride && x.humanOverride.effect === "ADMITTED_BY_HUMAN_OVERRIDE") || x.relevanceClass === "SUPPORTED"), "chaque admis machine porte une pertinence SUPPORTED (oracle reel)");
  crit("corpus_sufficient_for_admitted", adm.every((x) => (x.humanOverride && x.humanOverride.effect === "ADMITTED_BY_HUMAN_OVERRIDE") || x.corpusStatus === "SUFFICIENT"), "chaque admis machine porte un corpus SUFFICIENT (sonde reelle)");
  crit("anti_circularity", adm.every((x) => arr(x.reasonCodes).indexOf("SEED_ONLY_SUPPORT") === -1), "aucun admis soutenu par la seule oeuvre-graine");
  crit("readiness_pre", pre.status !== READINESS.NOT_READY, "PRE = " + pre.status + (pre.blockingDimensions.length ? " (" + pre.blockingDimensions.join(",") + ")" : ""));
  crit("readiness_full", full.status !== READINESS.NOT_READY, "FULL = " + full.status + (full.blockingDimensions.length ? " (" + full.blockingDimensions.join(",") + ")" : ""));
  const rc = reviewCardinality(input.reviewSet, input.twinSet);
  crit("reviews_present", rc.accepted > 0, rc.accepted + " revue(s) acceptee(s)");
  /* REGLE SCIENTIFIQUE : accepted_reviews == expected_reviews (100 %), expected = jumeaux actifs x cibles resolues — jamais un nombre en dur, jamais un ratio tolere. */
  crit("reviews_complete", rc.expected > 0 && rc.accepted === rc.expected, rc.accepted + "/" + rc.expected + (rc.accepted === rc.expected ? " (100 %)" : " (incomplet : " + (rc.expected - rc.accepted) + " manquante(s))"));
  crit("llm_capability_validated", full.dimensions.find((x) => x.dimension === "llmCapability").status === DIM.SATISFIED, "sonde reelle liee au run");
  crit("lineage_valid", full.dimensions.find((x) => x.dimension === "lineage").status === DIM.SATISFIED, "chaines MONO-10 + MONO-11 verifiees");
  crit("no_human_act_simulated", arr(p.decisions).every((x) => x.machineActor && x.machineActor.actorType === "machine" && (!x.humanOverride || x.humanOverride.actorType === "human")), "actes machine declares machine ; overrides humains valides par MONO-10");
  const failed = criteria.filter((c) => !c.pass);
  const reservations = [{ code: CONTRACTS.mandatoryReservations.values[0], detail: adm.length + " admission(s) par gate machine, sans acte humain" }]
    .concat(arr(p.reservations).filter((r) => r.code !== CONTRACTS.mandatoryReservations.values[0]))
    .concat(arr(input.upstreamReservations));
  const unknowns = arr(input.assessment.unknowns).map((u) => ({ unknownId: u.unknownId, reason: u.reason, blockingStatus: u.blockingStatus }))
    .concat(arr(p.decisions).flatMap((x) => arr(x.unresolvedFacts).map((f) => ({ candidateId: x.candidateId, reason: f, blockingStatus: "NON_BLOCKING" }))));
  const status = failed.length ? "NOT_QUALIFIED" : "QUALIFIED_WITH_RESERVATIONS";
  return out(status, reservations, unknowns);

  function out(status, reservations, unknowns) {
    if (CONTRACTS.qualificationStates.values.indexOf(status) === -1) throw new Error("QUALIFICATION_STATE_INVALID");
    return { schema: "EvidenceForge.ScientificQualification", schemaVersion: "MONO-11-v1", status: status, criteria: criteria,
      failedCriteria: criteria.filter((c) => !c.pass).map((c) => c.criterion), reservations: reservations, unknowns: unknowns,
      panelGateKind: "MACHINE_EVIDENCE_GATE_WITH_OPTIONAL_HUMAN_OVERRIDE", humanPanelGateRequired: false,
      disclaimer: "qualifie le PROCESSUS, jamais le contenu du verdict ; un succes technique n'est pas un succes scientifique" };
  }
}

module.exports = { evaluateReadiness, qualifyProcess, admitted, reviewCardinality, DIM, READINESS, PRE, FULL_ONLY };
