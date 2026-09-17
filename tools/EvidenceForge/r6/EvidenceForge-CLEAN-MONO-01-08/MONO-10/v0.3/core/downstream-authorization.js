"use strict";
/**
 * MONO-10 v0.3 — core/downstream-authorization.js
 *
 * Concept GENERIQUE : "ce resultat peut-il etre utilise par une etape aval ?"
 * Aucun nom de phase metier n'apparait ici. Un cas d'application qui aurait
 * besoin d'un nom propre doit le faire HORS de ce noyau (voir adapters/).
 *
 * Cette autorisation ne reecrit JAMAIS le verdict.
 *
 * Fermeture v0.3 :
 *   §17 — REVALIDER, PAS RELIRE. En v0.2 l'autorisation lisait
 *         `qualification.qualificationStatus` et `qualification.unknowns` tels
 *         que presentes : un objet fabrique portant QUALIFIED et un tableau
 *         d'inconnus vide obtenait AUTHORIZED. L'ultime porte faisait confiance
 *         a ce qu'elle etait censee controler. v0.3 revalide TOUTES ses
 *         entrees : la qualification est recalculee sur ses artefacts sources,
 *         le rapport doit etre lie a CETTE qualification, l'acceptation doit
 *         porter sur CE rapport, la lignee doit resoudre, et chaque chaine
 *         d'inconnu doit etre integre.
 */

const { fail, isNonEmptyStr, sha256Of } = require("./run-evidence-manifest.js");
const { resolveLineage } = require("./lineage.js");
const { qualifyProcess, QUALIFICATION, ACTIONABLE_NONE } = require("./scientific-qualification.js");
const { assertReportBoundToQualification } = require("./scientific-unified-report.js");
const { blockingOpen, openOnes, assertChainValid } = require("./unknowns.js");

const AUTHORIZATION = { AUTHORIZED: "AUTHORIZED", NOT_AUTHORIZED: "NOT_AUTHORIZED", DEFERRED: "DEFERRED" };

/**
 * resolveDownstreamUseAuthorization({ qualification, qualificationSources, report,
 *   acceptance, acceptanceValidator, artifactRegistry, lineageRefs, policy, production })
 *
 * policy.humanAcceptanceRequired         defaut true
 * policy.revalidationRequired            defaut true  — §17
 * policy.blockOnNonBlockingReservations  defaut false
 */
function resolveDownstreamUseAuthorization(input) {
  input = input || {};
  const mode = { production: input.production === true, runManifest: input.runManifest, artifactRegistry: input.artifactRegistry };
  const policy = Object.assign({ humanAcceptanceRequired: true, revalidationRequired: true, blockOnNonBlockingReservations: false }, input.policy || {});
  const reasons = [];
  const q = input.qualification;
  const revalidation = { attempted: false, performed: false, agrees: null, problems: [] };

  if (!q || q.schema !== "EvidenceForge.ScientificQualification") {
    return emit(AUTHORIZATION.NOT_AUTHORIZED, ["ScientificQualification absente"], policy, input, mode, revalidation);
  }

  // ---- §17.a : la qualification est RECALCULEE, jamais relue sur parole.
  if (policy.revalidationRequired) {
    revalidation.attempted = true;
    if (!input.qualificationSources) {
      reasons.push("revalidation exigee mais aucun artefact source fourni : une qualification qui ne peut etre recalculee n'autorise rien.");
    } else {
      let recomputed = null;
      try { recomputed = qualifyProcess(Object.assign({}, input.qualificationSources, { production: mode.production, runManifest: mode.runManifest })); }
      catch (e) { revalidation.problems.push("recalcul impossible : " + ((e && e.message) || e)); }
      if (recomputed) {
        revalidation.performed = true;
        if (recomputed.qualificationStatus !== q.qualificationStatus) {
          revalidation.problems.push("qualificationStatus presente " + q.qualificationStatus + ", recalcule " + recomputed.qualificationStatus + ".");
        }
        if (isNonEmptyStr(q.qualificationId) && recomputed.qualificationId !== q.qualificationId) {
          revalidation.problems.push("qualificationId presente " + q.qualificationId + ", recalcule " + recomputed.qualificationId + ".");
        }
        const recoBlocking = blockingOpen(recomputed.unknowns || []);
        if (recoBlocking.length > blockingOpen(q.unknowns || []).length) {
          revalidation.problems.push(recoBlocking.length + " inconnu(s) bloquant(s) au recalcul, absent(s) de la qualification presentee.");
        }
        revalidation.agrees = revalidation.problems.length === 0;
        revalidation.problems.forEach((p) => reasons.push("revalidation : " + p));
      } else {
        revalidation.agrees = false;
        revalidation.problems.forEach((p) => reasons.push("revalidation : " + p));
      }
    }
  }

  // ---- §17.b : les chaines d'inconnus sont verifiees, jamais crues.
  const allUnknowns = (q.unknowns || []).concat((input.report && input.report.unknowns) || []);
  let forged = 0;
  allUnknowns.forEach(function (u, i) {
    try { assertChainValid(u, "unknowns[" + i + "]"); } catch (e) { forged++; reasons.push("chaine d'inconnu alteree : " + e.message); }
  });

  if (q.qualificationStatus === QUALIFICATION.NOT_QUALIFIED || q.qualificationStatus === QUALIFICATION.IMPOSSIBLE) {
    reasons.push("qualificationStatus = " + q.qualificationStatus + " : usage aval bloque. Le verdict anterieur reste enregistre.");
  }
  if (q.scientificallyActionableVerdict === ACTIONABLE_NONE) reasons.push("scientificallyActionableVerdict = NONE");

  const blocking = blockingOpen(allUnknowns);
  if (blocking.length) reasons.push(blocking.length + " inconnu(s) bloquant(s) ouverts");
  if (policy.blockOnNonBlockingReservations && (q.reservations || []).length) {
    reasons.push("politique du run : toute reserve bloque l'usage aval");
  }

  // ---- §17.c : le rapport doit porter sur CETTE qualification.
  if (input.report) {
    try { assertReportBoundToQualification(input.report, q, "autorisation aval"); }
    catch (e) { reasons.push(e.message); }
  } else if (policy.humanAcceptanceRequired) {
    reasons.push("aucun ScientificUnifiedReport : l'acceptation humaine n'aurait pas d'objet.");
  }

  // ---- §17.d : la lignee doit RESOUDRE.
  const lin = resolveLineage(input.lineageRefs || (input.report && input.report.lineage), input.artifactRegistry, { requiredRelations: input.requiredLineageRelations || [] });
  if (!lin.resolved) reasons.push("lignee non resolue : " + lin.problems.join(" ; "));

  // ---- §17.e : l'acceptation doit porter sur CE rapport.
  if (policy.humanAcceptanceRequired) {
    if (!input.acceptance) return emit(AUTHORIZATION.DEFERRED, reasons.concat(["acceptation humaine requise et absente"]), policy, input, mode, revalidation);
    const validate = typeof input.acceptanceValidator === "function" ? input.acceptanceValidator : null;
    if (!validate) return emit(AUTHORIZATION.NOT_AUTHORIZED, reasons.concat(["aucun validateur d'acceptation injecte"]), policy, input, mode, revalidation);
    const v = validate(input.acceptance, input.report, mode);
    if (!v.valid) return emit(AUTHORIZATION.NOT_AUTHORIZED, reasons.concat(["acceptation invalide : " + v.problems.join(" ; ")]), policy, input, mode, revalidation);
    if (v.continuationAllowed !== true) return emit(AUTHORIZATION.NOT_AUTHORIZED, reasons.concat(["decision d'acceptation incompatible avec une continuation"]), policy, input, mode, revalidation);
  }

  if (reasons.length) return emit(AUTHORIZATION.NOT_AUTHORIZED, reasons, policy, input, mode, revalidation);
  return emit(AUTHORIZATION.AUTHORIZED, ["toutes les conditions du contrat generique sont satisfaites, apres recalcul de la qualification sur ses artefacts sources"], policy, input, mode, revalidation);
}

function emit(status, reasons, policy, input, mode, revalidation) {
  return {
    schema: "EvidenceForge.DownstreamUseAuthorization", schemaVersion: "MONO-10-v3",
    downstreamUseAuthorized: status === AUTHORIZATION.AUTHORIZED,
    authorization: status, reasons: reasons, policy: policy,
    revalidation: revalidation,
    qualificationRef: input.qualificationRef || null, reportRef: input.reportRef || null,
    rewritesVerdict: false,
    note: "Autorise ou non l'usage du resultat par une etape aval. Ne reecrit jamais le verdict, ne modifie aucune preuve. "
      + "Toutes les entrees sont revalidees : rien n'est admis sur sa propre declaration.",
  };
}

module.exports = { resolveDownstreamUseAuthorization, AUTHORIZATION };
