"use strict";
/**
 * MONO-10 v0.6 — core/final-report-acceptance.js  (§22)
 *
 * Acceptation humaine du rapport. Ne modifie ni preuves, ni qualification, ni
 * verdict : elle alimente uniquement l'autorisation d'usage aval.
 *
 * FERMETURE v0.5 B01 (cote artefact). La fonction de validation n'est plus
 * destinee a etre PASSEE par un appelant : `OperatorAcceptanceBoundary`,
 * provisionnee par la frontiere, l'appelle elle-meme (§5, §6).
 *
 * §50 — l'acceptation est liee a la RACINE DE REGISTRE en plus du rapport, de
 * la qualification, de la mission, du run et de l'attestation, et exige une
 * PREUVE D'ACTE portant sur cette decision precise (§21).
 *
 * Acquis v0.3 : le rapport CONCRET est obligatoire, et le contenu presente a
 * l'humain est compare a celui du rapport (deux empreintes independantes).
 * Ajouts v0.4 (§22) : mission, run et attestation doivent concorder, et l'acte
 * humain doit etre AUTHENTIFIE selon le mode d'execution (§11) — une
 * declaration `actorType: "human"` ne suffit jamais.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { artifactRef, assertRefMatches, resolveLineage, RELATION } = require("./lineage.js");
const { verifyHumanActAuthenticity } = require("./human-act.js");
const HAP = require("./human-act-proof.js");
const AAR = require("./authenticated-artifact-registry.js");
const RM = require("./run-evidence-manifest.js");

const DECISION = { ACCEPT: "ACCEPT_AS_REPORTED", ACCEPT_WITH_RESERVATIONS: "ACCEPT_WITH_RESERVATIONS", REJECT: "REJECT_FOR_REVIEW" };
const ALLOWED = [DECISION.ACCEPT, DECISION.ACCEPT_WITH_RESERVATIONS, DECISION.REJECT];
const CONTINUATION_OK = [DECISION.ACCEPT, DECISION.ACCEPT_WITH_RESERVATIONS];
const FORBIDDEN_FIELDS = ["finalVerdict", "verdict", "priorVerdict", "scientificallyActionableVerdict", "qualificationStatus", "downstreamUseAuthorized"];

function presentedDigest(report) {
  return sha256Of({ reservations: (report.reservations || []).slice(),
    unknowns: (report.unknowns || []).map((u) => (u && u.reason) || u),
    qualificationId: report.qualificationId || null });
}
function displayedDigest(acceptance) {
  return sha256Of({ reservations: (acceptance.reservationsPresented || []).slice(),
    unknowns: (acceptance.unknownsPresented || []).slice(),
    qualificationId: acceptance.qualificationId || null });
}

/** §50 — l'empreinte de decision que la preuve d'acte humain devra porter. */
function acceptanceDecisionHash(report, decision) {
  return HAP.computeDecisionHash({ actionType: HAP.ACTION_TYPE.REPORT_ACCEPTANCE,
    runId: report.runId, missionHash: report.missionHash,
    subjectId: report.qualificationId, decision: decision,
    boundArtifactHash: report.qualificationHash, evidenceRefsHash: report.registryRootHash || null });
}

function buildAcceptanceTemplate(report, opts) {
  opts = opts || {};
  if (!report || report.schema !== "EvidenceForge.ScientificUnifiedReport") throw fail("ACCEPTANCE_TEMPLATE_INPUT_INVALID", "ScientificUnifiedReport requis.");
  return {
    _readme: "Acceptation du rapport. Ne modifie ni preuves, ni qualification, ni verdict. "
      + "Remplir decision, actorType=\"human\", actorIdentity, decidedAt. Aucune valeur n'est pre-remplie. "
      + "En mode TEST, authenticationMode doit valoir TEST_FIXTURE_DECLARED ; en PRODUCTION, un mecanisme d'authentification est exige.",
    schema: "EvidenceForge.FinalReportAcceptance", schemaVersion: "MONO-10-v6",
    reportRef: artifactRef(report, "scientific-unified-report", RELATION.REPORT),
    reportRunId: report.runId || null, reportMissionHash: report.missionHash || null,
    reportAttestationHash: report.attestationHash || null,
    reportRegistryRootHash: report.registryRootHash || null,
    qualificationId: report.qualificationId || null,
    presentedDigest: presentedDigest(report),
    reservationsPresented: (report.reservations || []).slice(),
    unknownsPresented: (report.unknowns || []).map((u) => (u && u.reason) || u),
    decision: null, reservationsAcknowledged: [], actorType: null, actorIdentity: null, decidedAt: null,
    authenticationMode: null, decisionHash: null, humanActProof: null,
  };
}

/**
 * validateAcceptanceArtifact(acceptance, report, ctx)
 * Validation de l'ARTEFACT seul, appelee par la frontiere d'acceptation.
 */
function validateAcceptanceArtifact(acceptance, report, ctx) {
  ctx = ctx || {};
  const problems = [];
  if (!acceptance || acceptance.schema !== "EvidenceForge.FinalReportAcceptance") {
    return { valid: false, problems: ["schema inattendu ou artefact absent"], continuationAllowed: false, humanActAuthenticated: false };
  }
  if (!report || report.schema !== "EvidenceForge.ScientificUnifiedReport") {
    return { valid: false, continuationAllowed: false, humanActAuthenticated: false,
      problems: ["aucun ScientificUnifiedReport fourni : une acceptation sans objet concret n'est pas un acte. La reference seule ne prouve rien."] };
  }
  if (ctx.manifest) {
    if (RM.isProductionContext(ctx)) {
      try { RM.assertProductionEvidence(acceptance, ctx, "FinalReportAcceptance"); } catch (e) { problems.push(e.message); }
    } else {
      try { RM.assertArtifactBoundToRun(acceptance, ctx.manifest, "FinalReportAcceptance"); } catch (e) { problems.push(e.message); }
    }
  }
  try { assertRefMatches(acceptance.reportRef, report, "reportRef"); } catch (e) { problems.push(e.message); }

  // §42 — le registre doit etre celui du run authentifie.
  if (!AAR.isAuthenticatedRegistry(ctx.artifactRegistry)) {
    problems.push("aucun registre d'artefacts authentifie : le rapport accepte ne peut pas etre resolu.");
  } else {
    const r = resolveLineage([acceptance.reportRef], ctx.artifactRegistry, { relation: RELATION.ACCEPTANCE,
      expectedRunId: ctx.manifest ? ctx.manifest.runId : undefined,
      expectedMissionHash: ctx.manifest ? ctx.manifest.missionHash : undefined,
      expectedAttestationHash: ctx.manifest ? ctx.manifest.runtimeAttestationHash : undefined });
    if (!r.resolved) problems.push("le rapport accepte ne resout pas parmi les artefacts disponibles : " + r.problems.join(" ; "));
  }

  const reportDigest = presentedDigest(report);
  if (isNonEmptyStr(acceptance.presentedDigest) && acceptance.presentedDigest !== reportDigest) {
    problems.push("l'empreinte du contenu presente a l'humain differe de celle du rapport.");
  }
  if (displayedDigest(acceptance) !== reportDigest) {
    problems.push("les reserves ou inconnus presentes a l'humain different de ceux que porte le rapport : "
      + (acceptance.reservationsPresented || []).length + " reserve(s) et " + (acceptance.unknownsPresented || []).length
      + " inconnu(s) affiches, contre " + (report.reservations || []).length + " et " + (report.unknowns || []).length + " dans le rapport.");
  }
  // §22 — mission, run, attestation : comparees, jamais sautees.
  if (acceptance.qualificationId !== report.qualificationId) problems.push("qualificationId de l'acceptation different de celui du rapport.");
  if (acceptance.reportRunId !== report.runId) problems.push("runId de l'acceptation different de celui du rapport.");
  if (acceptance.reportMissionHash !== report.missionHash) problems.push("missionHash de l'acceptation different de celui du rapport.");
  if (acceptance.reportAttestationHash !== report.attestationHash) problems.push("attestation de l'acceptation differente de celle du rapport.");
  if (isNonEmptyStr(report.registryRootHash) || isNonEmptyStr(acceptance.reportRegistryRootHash)) {
    if (acceptance.reportRegistryRootHash !== report.registryRootHash) problems.push("racine de registre de l'acceptation differente de celle du rapport.");
  }
  if (ctx.artifactRegistry && isNonEmptyStr(report.registryRootHash)
      && typeof ctx.artifactRegistry.sequenceOf === "function") {
    const seq = ctx.artifactRegistry.sequenceOf("scientific-unified-report");
    const expectedRoot = seq ? ctx.artifactRegistry.rootBeforeSequence(seq) : null;
    if (expectedRoot && expectedRoot !== report.registryRootHash) {
      problems.push("la racine de registre du rapport ne correspond pas a l'etat du registre au moment de sa redaction.");
    }
  }
  const expectedDecisionHash = acceptanceDecisionHash(report, acceptance.decision);
  if (acceptance.decisionHash !== expectedDecisionHash) {
    problems.push("decisionHash absent ou ne portant pas sur cette decision, ce rapport et cette racine de registre.");
  }
  if (ctx.manifest && report.runId !== ctx.manifest.runId) problems.push("le rapport accepte n'appartient pas au run atteste.");

  if (ALLOWED.indexOf(acceptance.decision) === -1) problems.push("decision invalide " + JSON.stringify(acceptance.decision));

  // §42 — l'authenticite vient de la frontiere operateur, jamais d'un callback appelant.
  const auth = verifyHumanActAuthenticity(acceptance, ctx, "FinalReportAcceptance", {
    actionType: HAP.ACTION_TYPE.REPORT_ACCEPTANCE, decisionHash: expectedDecisionHash,
    runId: report.runId, missionHash: report.missionHash });
  if (!auth.authenticated) problems.push(auth.problems.join(" ; "));

  FORBIDDEN_FIELDS.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(acceptance, k)) problems.push("champ \"" + k + "\" present : une acceptation ne reecrit jamais un verdict, une qualification ni une autorisation");
  });
  if (problems.length) return { valid: false, problems: problems, continuationAllowed: false, humanActAuthenticated: auth.authenticated };
  return { valid: true, problems: [], continuationAllowed: CONTINUATION_OK.indexOf(acceptance.decision) !== -1, humanActAuthenticated: true };
}

module.exports = { buildAcceptanceTemplate, validateAcceptanceArtifact, acceptanceDecisionHash, presentedDigest, displayedDigest, DECISION, ALLOWED, CONTINUATION_OK, FORBIDDEN_FIELDS };
