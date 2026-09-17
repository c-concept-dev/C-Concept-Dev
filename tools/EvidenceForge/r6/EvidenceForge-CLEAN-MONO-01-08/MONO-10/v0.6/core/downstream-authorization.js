"use strict";
/**
 * MONO-10 v0.5 — core/downstream-authorization.js  (§5, §6, §23, §24)
 *
 * Concept GENERIQUE : « ce resultat peut-il etre utilise par une etape aval ? »
 * Aucun nom de phase metier ici. Un cas d'application qui a besoin d'un nom
 * propre le declare dans adapters/.
 *
 * FERMETURES v0.3 B-2 :
 *
 * §5 — `revalidationRequired = false` faisait passer une qualification
 *      entierement fabriquee en AUTHORIZED. La revalidation n'est plus une
 *      option : elle est TOUJOURS executee. Une politique peut elargir des
 *      exigences, jamais desactiver un controle critique (§24).
 *
 * §6 — l'artefact emis affirmait « apres recalcul de la qualification sur ses
 *      artefacts sources » alors que `revalidation.performed` valait false.
 *      Aucun motif n'est desormais ecrit a l'avance : chaque phrase est
 *      DERIVEE de ce qui a reellement ete execute.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { resolveLineage, RELATION } = require("./lineage.js");
const { qualifyProcess, QUALIFICATION, ACTIONABLE_NONE } = require("./scientific-qualification.js");
const { assertReportBoundToQualification } = require("./scientific-unified-report.js");
const { blockingOpen, openOnes, assertChainValid } = require("./unknowns.js");
const RM = require("./run-evidence-manifest.js");
const OTV = require("./operator-trust-verifier.js");
const AAR = require("./authenticated-artifact-registry.js");
const OAB = require("./operator-acceptance-boundary.js");

const AUTHORIZATION = { AUTHORIZED: "AUTHORIZED", NOT_AUTHORIZED: "NOT_AUTHORIZED", DEFERRED: "DEFERRED" };

/** §24 — ce qu'une politique ne peut jamais desactiver. */
const NON_NEGOTIABLE = ["trustVerification", "artifactBinding", "lineageResolution", "qualificationRevalidation", "fixtureRejection"];

/**
 * §72 — FERMETURE v0.6. Une politique d'appelant n'est pas un canal de
 * decision. Deux familles de cles sont RETIREES de la politique, quelle que
 * soit leur valeur, et le retrait est CONSIGNE :
 *
 *  - BOUNDARY_OWNED : la decision appartient a la frontiere operateur ou au
 *    contrat du lot. La laisser dans la politique donnerait a un lecteur
 *    l'impression qu'elle a produit un effet. Y compris quand la valeur
 *    fournie irait dans le sens du durcissement : ce n'est pas a l'appelant
 *    de decider, donc sa valeur n'est jamais lue.
 *  - forme de contournement : tout nom de cle construit pour desactiver
 *    (force*, skip*, allow*, bypass*, ignore*, disable*, unsafe*, override*,
 *    unchecked*, trust*). Une cle inconnue de cette forme est retiree meme si
 *    aucune version du lot ne l'a jamais interpretee : elle ne doit pas
 *    pouvoir devenir un canal a la faveur d'une evolution ulterieure.
 *
 * Le retrait n'est pas silencieux : `refusedOverrides` est repris dans
 * l'artefact d'autorisation et dans ses motifs.
 */
const BOUNDARY_OWNED = ["humanAcceptanceRequired", "acceptanceValidator", "humanActVerifier",
  "trustVerifier", "transport", "consumeNonce", "crossRunAllowedRelations", "requireResolvableEvidence",
  "historicalInputContract", "readOnlyRevalidation"];
const BYPASS_SHAPED = /^(force|skip|allow|bypass|ignore|disable|unsafe|unchecked|override|trust)(?=[A-Z_]|$)/;

function sanitizePolicy(rawPolicy) {
  const p = Object.assign({ blockOnNonBlockingReservations: false,
    downstreamClass: null, reservationPolicy: "RECORD" }, rawPolicy || {});
  const refused = [];
  const motives = {};
  const drop = (k, why) => { if (refused.indexOf(k) === -1) { refused.push(k); motives[k] = why; } delete p[k]; };

  NON_NEGOTIABLE.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(p, k) && p[k] === false) drop(k, "CONTROLE_NON_NEGOCIABLE");
  });
  // Semantique heritee de v0.3 : explicitement neutralisee.
  if (Object.prototype.hasOwnProperty.call(p, "revalidationRequired")) {
    if (p.revalidationRequired === false) drop("revalidationRequired", "CONTROLE_NON_NEGOCIABLE");
    else drop("revalidationRequired", "TOUJOURS_OBLIGATOIRE");
  }
  BOUNDARY_OWNED.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(p, k)) drop(k, "DECISION_DE_LA_FRONTIERE_OPERATEUR");
  });
  Object.keys(p).forEach(function (k) {
    if (BYPASS_SHAPED.test(k)) drop(k, "FORME_DE_CONTOURNEMENT");
  });

  p.revalidationAlwaysMandatory = true;
  return { policy: p, refusedOverrides: refused, refusalMotives: motives };
}

function resolveDownstreamUseAuthorization(input) {
  input = input || {};
  const ctx = input.runContext || {};
  const production = RM.isProductionContext(ctx);
  const sp = sanitizePolicy(input.policy);
  const policy = sp.policy;
  const reasons = [];
  const q = input.qualification;
  const revalidation = { mandatory: true, attempted: false, performed: false, agrees: null, problems: [] };
  const refusedNote = sp.refusedOverrides.length
    ? "politique : tentative de desactivation refusee pour " + sp.refusedOverrides.join(", ") + " — un appelant ne desactive pas un controle critique."
    : null;
  if (refusedNote) reasons.push(refusedNote);

  // §5 — la validation d'acceptation est une CAPACITE de la frontiere operateur.
  const acceptanceBoundary = OTV.isOperatorTrustVerifier(ctx.verifier) ? ctx.verifier.acceptanceBoundary() : null;
  if (typeof input.acceptanceValidator === "function") {
    reasons.push("acceptanceValidator fourni par l'appelant : IGNORE. La validation d'acceptation est provisionnee par la "
      + "frontiere operateur — celui qui produit l'acceptation ne decide pas de sa validite.");
  }
  const humanAcceptanceRequired = OAB.isProvisionedAcceptanceBoundary(acceptanceBoundary)
    ? acceptanceBoundary.humanAcceptanceRequired : true;

  const emitNow = (status, why) => emit(status, reasons.concat(why), policy, input, ctx, revalidation, sp.refusedOverrides);

  if (!q || q.schema !== "EvidenceForge.ScientificQualification") return emitNow(AUTHORIZATION.NOT_AUTHORIZED, ["ScientificQualification absente"]);

  // ---- §43 — frontiere operateur d'abord, puis attestation.
  let trustOk = false;
  if (!ctx.manifest) {
    reasons.push("aucun contexte de run atteste : la chaine ne peut pas etre authentifiee.");
  } else if (!OTV.isOperatorTrustVerifier(ctx.verifier)) {
    reasons.push("aucun verificateur issu d'une frontiere operateur — un appelant ne fournit pas sa racine de confiance.");
  } else {
    try { RM.assertManifestAuthentic(ctx.manifest, ctx); trustOk = true; }
    catch (e) { reasons.push("attestation runtime : " + e.message); }
  }
  if (production) {
    try { OTV.assertProductionVerifier(ctx.verifier, "autorisation aval"); }
    catch (e) { reasons.push(e.message); }
  }
  if (!AAR.isAuthenticatedRegistry(input.artifactRegistry)) {
    reasons.push("registre d'artefacts non rattache a un run authentifie — la lignee ne peut pas etre resolue contre une realite declaree.");
  }
  if (production && !trustOk) reasons.push("mode PRODUCTION sans attestation runtime verifiee — fail-closed.");

  // ---- §5/§23 — la revalidation est TOUJOURS tentee, jamais optionnelle.
  revalidation.attempted = true;
  if (!input.qualificationSources) {
    reasons.push("revalidation impossible : aucun artefact source fourni. Une qualification qui ne peut etre recalculee n'autorise rien.");
  } else {
    let recomputed = null;
    try { recomputed = qualifyProcess(Object.assign({}, input.qualificationSources, { runContext: ctx })); }
    catch (e) { revalidation.problems.push("recalcul impossible : " + ((e && e.message) || e)); }
    if (recomputed) {
      revalidation.performed = true;
      if (recomputed.qualificationStatus !== q.qualificationStatus) revalidation.problems.push("qualificationStatus presente " + q.qualificationStatus + ", recalcule " + recomputed.qualificationStatus + ".");
      if (isNonEmptyStr(q.qualificationId) && recomputed.qualificationId !== q.qualificationId) revalidation.problems.push("qualificationId presente " + q.qualificationId + ", recalcule " + recomputed.qualificationId + ".");
      if (recomputed.evidenceClass !== q.evidenceClass) revalidation.problems.push("classe de preuve presentee " + q.evidenceClass + ", recalculee " + recomputed.evidenceClass + ".");
      if (blockingOpen(recomputed.unknowns || []).length > blockingOpen(q.unknowns || []).length) {
        revalidation.problems.push("inconnu(s) bloquant(s) au recalcul, absent(s) de la qualification presentee.");
      }
      revalidation.agrees = revalidation.problems.length === 0;
    } else { revalidation.agrees = false; }
    revalidation.problems.forEach((p) => reasons.push("revalidation : " + p));
  }

  // ---- §0 — une chaine coherente n'autorise pas une etape aval de production.
  if (production && q.authenticatedProductionExecution !== true) {
    reasons.push("la qualification ne porte pas une execution de PRODUCTION authentifiee (classe de preuve : " + q.evidenceClass + ").");
  }

  // ---- chaines d'inconnus.
  const allUnknowns = (q.unknowns || []).concat((input.report && input.report.unknowns) || []);
  allUnknowns.forEach(function (u, i) {
    try { assertChainValid(u, "unknowns[" + i + "]", { requireResolvableEvidence: false }); }
    catch (e) { reasons.push("chaine d'inconnu alteree : " + e.message); }
  });

  if (q.qualificationStatus === QUALIFICATION.NOT_QUALIFIED || q.qualificationStatus === QUALIFICATION.IMPOSSIBLE) {
    reasons.push("qualificationStatus = " + q.qualificationStatus + " : usage aval bloque. Le verdict anterieur reste enregistre.");
  }
  if (q.scientificallyActionableVerdict === ACTIONABLE_NONE) reasons.push("scientificallyActionableVerdict = NONE");

  const blocking = blockingOpen(allUnknowns);
  if (blocking.length) reasons.push(blocking.length + " inconnu(s) bloquant(s) ouverts");
  if (policy.blockOnNonBlockingReservations && (q.reservations || []).length) reasons.push("politique du run : toute reserve bloque l'usage aval");

  // ---- rapport lie a CETTE qualification.
  if (input.report) {
    try { assertReportBoundToQualification(input.report, q, ctx, "autorisation aval"); } catch (e) { reasons.push(e.message); }
  } else if (humanAcceptanceRequired) {
    reasons.push("aucun ScientificUnifiedReport : l'acceptation humaine n'aurait pas d'objet.");
  }

  // ---- lignee typee et resolue.
  const lin = resolveLineage(input.lineageRefs || (input.report && input.report.lineage), input.artifactRegistry, {
    relation: RELATION.AUTHORIZATION,
    expectedRunId: ctx.manifest ? ctx.manifest.runId : undefined,
    expectedMissionHash: ctx.manifest ? ctx.manifest.missionHash : undefined,
    expectedAttestationHash: ctx.manifest ? ctx.manifest.runtimeAttestationHash : undefined,
    historicalInputContract: input.historicalInputContract });
  if (!lin.resolved) reasons.push("lignee non resolue : " + lin.problems.join(" ; "));

  // ---- §5/§7/§8/§9 — acceptation humaine, validee PAR LA FRONTIERE.
  if (humanAcceptanceRequired) {
    if (!OAB.isProvisionedAcceptanceBoundary(acceptanceBoundary)) {
      return emitNow(AUTHORIZATION.NOT_AUTHORIZED,
        ["aucune frontiere d'acceptation provisionnee : la validation finale ne peut pas etre etablie — fail closed."]);
    }
    if (!input.acceptance) return emitNow(AUTHORIZATION.DEFERRED, ["acceptation humaine requise et absente"]);
    const v = acceptanceBoundary.validateAcceptance(input.acceptance, input.report, ctx);
    // §7 — un refus humain explicite est ABSOLU.
    if (v.blockingDecision === true) return emitNow(AUTHORIZATION.NOT_AUTHORIZED, v.problems);
    if (!v.valid) return emitNow(AUTHORIZATION.NOT_AUTHORIZED, ["acceptation invalide : " + v.problems.join(" ; ")]);
    if (v.continuationAllowed !== true) return emitNow(AUTHORIZATION.NOT_AUTHORIZED, ["decision d'acceptation incompatible avec une continuation"]);
    if (production && v.humanActAuthenticated !== true) return emitNow(AUTHORIZATION.NOT_AUTHORIZED, ["acte humain non authentifie sous un run de production"]);
  }

  const blockers = reasons.filter((r) => r !== refusedNote);
  if (blockers.length) return emit(AUTHORIZATION.NOT_AUTHORIZED, reasons, policy, input, ctx, revalidation, sp.refusedOverrides);

  // §6 — le motif est DERIVE de ce qui a reellement ete fait.
  const done = [];
  done.push(revalidation.performed ? "qualification recalculee sur ses artefacts sources et concordante"
    : "qualification NON recalculee — cette autorisation ne peut donc pas etre emise");
  done.push(trustOk ? "attestation runtime verifiee aupres d'une autorite ancree" : "run NON atteste");
  done.push(lin.resolved ? lin.resolvedRefs.length + " arete(s) de lignee resolue(s) et typee(s)" : "lignee non resolue");
  return emit(AUTHORIZATION.AUTHORIZED, reasons.concat(["conditions du contrat generique satisfaites : " + done.join(" ; ") + "."]),
    policy, input, ctx, revalidation, sp.refusedOverrides);
}

function emit(status, reasons, policy, input, ctx, revalidation, refusedOverrides) {
  const out = {
    schema: "EvidenceForge.DownstreamUseAuthorization", schemaVersion: "MONO-10-v5",
    downstreamUseAuthorized: status === AUTHORIZATION.AUTHORIZED,
    authorization: status, reasons: reasons, policy: policy,
    refusedPolicyOverrides: refusedOverrides || [],
    nonNegotiableControls: NON_NEGOTIABLE.slice(),
    revalidation: revalidation,
    executionMode: RM.effectiveMode(ctx),
    runId: ctx.manifest ? ctx.manifest.runId : null,
    attestationHash: ctx.manifest ? ctx.manifest.runtimeAttestationHash : null,
    qualificationRef: input.qualificationRef || null, reportRef: input.reportRef || null,
    rewritesVerdict: false,
    note: "Autorise ou non l'usage du resultat par une etape aval. Ne reecrit jamais le verdict, ne modifie aucune preuve.",
  };
  // §6 — garde-fou explicite : aucun artefact ne peut affirmer un recalcul non effectue.
  if (out.downstreamUseAuthorized === true && revalidation.performed !== true) {
    throw fail("FALSE_REVALIDATION_CLAIM", "refus d'emettre une autorisation affirmant une revalidation qui n'a pas eu lieu.");
  }
  return out;
}

module.exports = { resolveDownstreamUseAuthorization, sanitizePolicy, AUTHORIZATION, NON_NEGOTIABLE };
