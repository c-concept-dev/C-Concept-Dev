"use strict";
/**
 * MONO-10 v0.3 — core/final-report-acceptance.js
 *
 * Acceptation humaine du rapport. Ne modifie ni preuves, ni qualification, ni
 * verdict : elle alimente uniquement l'autorisation d'usage aval.
 *
 * Fermeture v0.3 :
 *   §19 — UNE ACCEPTATION PORTE SUR UN RAPPORT CONCRET. En v0.2 la validation
 *         s'ecrivait `if (report) { assertRefMatches(...) }` : appelee sans le
 *         rapport, elle acceptait n'importe quelle `reportRef`. L'objet de
 *         l'acte humain etait facultatif. v0.3 exige le rapport, exige qu'il
 *         RESOLVE contre les artefacts disponibles, et exige que son empreinte
 *         soit celle qui a ete presentee a l'humain.
 */

const { isNonEmptyStr, fail, sha256Of } = require("./run-evidence-manifest.js");
const { assertProductionEvidence, assertArtifactBoundToRun } = require("./run-evidence-manifest.js");
const { artifactRef, assertHumanAct, assertRefMatches, resolveLineage } = require("./lineage.js");

const DECISION = { ACCEPT: "ACCEPT_AS_REPORTED", ACCEPT_WITH_RESERVATIONS: "ACCEPT_WITH_RESERVATIONS", REJECT: "REJECT_FOR_REVIEW" };
const ALLOWED = [DECISION.ACCEPT, DECISION.ACCEPT_WITH_RESERVATIONS, DECISION.REJECT];
const CONTINUATION_OK = [DECISION.ACCEPT, DECISION.ACCEPT_WITH_RESERVATIONS];
const FORBIDDEN_FIELDS = ["finalVerdict", "verdict", "priorVerdict", "scientificallyActionableVerdict", "qualificationStatus", "downstreamUseAuthorized"];

function presentedDigest(report) {
  return sha256Of({
    reservations: (report.reservations || []).slice(),
    unknowns: (report.unknowns || []).map((u) => (u && u.reason) || u),
    qualificationId: report.qualificationId || null,
  });
}

/**
 * Empreinte de ce que l'acceptation affirme AVOIR PRESENTE a l'humain.
 * Elle est calculee sur les champs de l'acceptation elle-meme : vider
 * `reservationsPresented` change cette empreinte, meme si `presentedDigest`
 * a ete laisse intact.
 */
function displayedDigest(acceptance) {
  return sha256Of({
    reservations: (acceptance.reservationsPresented || []).slice(),
    unknowns: (acceptance.unknownsPresented || []).slice(),
    qualificationId: acceptance.qualificationId || null,
  });
}

function buildAcceptanceTemplate(report, opts) {
  opts = opts || {};
  if (!report || report.schema !== "EvidenceForge.ScientificUnifiedReport") throw fail("ACCEPTANCE_TEMPLATE_INPUT_INVALID", "ScientificUnifiedReport requis.");
  return {
    _readme: "Acceptation du rapport. Ne modifie ni preuves, ni qualification, ni verdict. Alimente uniquement l'autorisation d'usage aval. "
      + "Remplir decision, actorType=\"human\", actorIdentity, decidedAt. Aucune valeur ne doit etre pre-remplie a votre place.",
    schema: "EvidenceForge.FinalReportAcceptance", schemaVersion: "MONO-10-v3",
    reportRef: artifactRef(report, "scientific-unified-report"),
    reportRunId: report.runId || null,
    qualificationId: report.qualificationId || null,
    presentedDigest: presentedDigest(report),
    reservationsPresented: (report.reservations || []).slice(),
    unknownsPresented: (report.unknowns || []).map((u) => (u && u.reason) || u),
    decision: null, reservationsAcknowledged: [], actorType: null, actorIdentity: null, decidedAt: null,
  };
}

/**
 * validateAcceptance(acceptance, report, mode)
 * §19 — `report` est OBLIGATOIRE. Sans l'objet de l'acte, il n'y a pas d'acte.
 * mode.artifactRegistry, quand il est fourni, exige en plus que le rapport
 * resolve parmi les artefacts reellement disponibles.
 */
function validateAcceptance(acceptance, report, mode) {
  mode = mode || {};
  const problems = [];
  if (!acceptance || acceptance.schema !== "EvidenceForge.FinalReportAcceptance") {
    return { valid: false, problems: ["schema inattendu ou artefact absent"], continuationAllowed: false };
  }
  if (!report || report.schema !== "EvidenceForge.ScientificUnifiedReport") {
    return {
      valid: false,
      problems: ["aucun ScientificUnifiedReport fourni : une acceptation sans objet concret n'est pas un acte. La reference seule ne prouve rien."],
      continuationAllowed: false,
    };
  }
  if (mode.production === true) {
    if (!mode.runManifest) problems.push("aucun manifeste de run : acceptation de production non rattachable.");
    else {
      try { assertArtifactBoundToRun(acceptance, mode.runManifest, "FinalReportAcceptance"); } catch (e) { problems.push(e.message); }
      try { assertProductionEvidence(acceptance, mode.runManifest, "FinalReportAcceptance"); } catch (e) { problems.push(e.message); }
    }
  }
  try { assertRefMatches(acceptance.reportRef, report, "reportRef"); } catch (e) { problems.push(e.message); }

  if (mode.artifactRegistry) {
    const r = resolveLineage([acceptance.reportRef], mode.artifactRegistry, { requiredRelations: ["EvidenceForge.ScientificUnifiedReport"] });
    if (!r.resolved) problems.push("le rapport accepte ne resout pas parmi les artefacts disponibles : " + r.problems.join(" ; "));
  }

  // §19 — l'humain a decide au vu de CE qui lui a ete presente. Deux controles
  // independants : l'empreinte enregistree, et le contenu reellement affiche.
  const reportDigest = presentedDigest(report);
  if (isNonEmptyStr(acceptance.presentedDigest) && acceptance.presentedDigest !== reportDigest) {
    problems.push("l'empreinte du contenu presente a l'humain differe de celle du rapport : l'acceptation ne porte pas sur ce contenu.");
  }
  if (displayedDigest(acceptance) !== reportDigest) {
    problems.push("les reserves ou inconnus presentes a l'humain different de ceux que porte le rapport : "
      + (acceptance.reservationsPresented || []).length + " reserve(s) et " + (acceptance.unknownsPresented || []).length
      + " inconnu(s) affiches, contre " + (report.reservations || []).length + " et " + (report.unknowns || []).length + " dans le rapport.");
  }
  if (isNonEmptyStr(acceptance.qualificationId) && isNonEmptyStr(report.qualificationId) && acceptance.qualificationId !== report.qualificationId) {
    problems.push("qualificationId de l'acceptation different de celui du rapport.");
  }
  if (isNonEmptyStr(acceptance.reportRunId) && isNonEmptyStr(report.runId) && acceptance.reportRunId !== report.runId) {
    problems.push("runId de l'acceptation different de celui du rapport.");
  }

  if (ALLOWED.indexOf(acceptance.decision) === -1) problems.push("decision invalide " + JSON.stringify(acceptance.decision));
  try { assertHumanAct(acceptance, "FinalReportAcceptance"); } catch (e) { problems.push(e.message); }
  FORBIDDEN_FIELDS.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(acceptance, k)) problems.push("champ \"" + k + "\" present : une acceptation ne reecrit jamais un verdict, une qualification ni une autorisation");
  });
  if (problems.length) return { valid: false, problems: problems, continuationAllowed: false };
  return { valid: true, problems: [], continuationAllowed: CONTINUATION_OK.indexOf(acceptance.decision) !== -1 };
}

module.exports = { buildAcceptanceTemplate, validateAcceptance, presentedDigest, displayedDigest, DECISION, ALLOWED, CONTINUATION_OK, FORBIDDEN_FIELDS };
