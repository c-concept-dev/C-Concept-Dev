"use strict";
/**
 * MONO-10 v0.7 — core/downstream-authorization.js  (§5, §6, §23, §24)
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
const { sanitizeByAllowlist } = require("./caller-assertion-guard.js");

const AUTHORIZATION = { AUTHORIZED: "AUTHORIZED", NOT_AUTHORIZED: "NOT_AUTHORIZED", DEFERRED: "DEFERRED" };

/**
 * §39/§40/§41 — FERMETURE C02 puis de l'echec constate en v0.6.
 *
 * v0.6 defendait par LISTE NOIRE et expression reguliere. L'audit a montre
 * deux fuites : `trusted` (le motif exigeait une majuscule apres « trust ») et
 * `legacyVerificationGrantsEligibility` (absent de la liste). Une liste noire
 * doit enumerer les attaques ; elle en oublie toujours une.
 *
 * v0.7 inverse : LISTE BLANCHE. Seules ces cles metier, sans effet de
 * securite, sont retenues. Toute autre est retiree et consignee avec son
 * motif. Une liste blanche n'a rien a deviner.
 *
 * `reservationPolicy` et `blockOnNonBlockingReservations` ne peuvent que
 * DURCIR : `narrowOnly` refuse toute valeur qui relacherait le contrat.
 */
const POLICY_ALLOWLIST = Object.freeze({
  /** true = bloquer aussi sur des reserves non bloquantes : durcissement. */
  blockOnNonBlockingReservations: { type: "boolean", narrowOnly: true, secureDefault: false },
  /** libelle metier de l'etape aval envisagee ; aucun effet de securite. */
  downstreamClass: { type: "string" },
  /** RECORD | BLOCK ; BLOCK durcit, RECORD est le defaut. */
  reservationPolicy: { type: "string", narrowOnly: true, secureDefault: "RECORD",
    narrower: (c) => c === "BLOCK" || c === "RECORD" },
});

/** §24 — ce qu'aucune politique ne desactive, quelle que soit sa formulation. */
const NON_NEGOTIABLE = Object.freeze(["trustVerification", "artifactBinding", "lineageResolution",
  "qualificationRevalidation", "fixtureRejection", "humanAcceptance", "nonceConsumption",
  "provenanceAuthentication", "capabilityEnforcement"]);

function sanitizePolicy(rawPolicy) {
  const sanitized = sanitizeByAllowlist(rawPolicy, { allow: POLICY_ALLOWLIST });
  const policy = Object.assign({}, sanitized.policy);
  // Consigne dans l'artefact : ces controles ne sont pas negociables.
  policy.revalidationAlwaysMandatory = true;
  policy.nonNegotiableControls = NON_NEGOTIABLE.slice();
  return { policy: policy, refusedOverrides: sanitized.refused.slice(),
    refusalMotives: Object.assign({}, sanitized.refusalMotives),
    allowlistedKeys: sanitized.allowlisted.slice() };
}

/**
 * §41 — monotonicite. `secureBaseline` resume les contraintes effectives ; une
 * politique d'appelant ne peut que les maintenir ou les durcir.
 */
function secureBaseline(policy) {
  const p = policy || {};
  return Object.freeze({
    revalidationMandatory: true,
    humanAcceptanceRequired: true,
    nonceConsumptionForced: true,
    provenanceAuthenticationRequired: true,
    capabilityEnforcementRequired: true,
    blockOnNonBlockingReservations: p.blockOnNonBlockingReservations === true,
    reservationPolicyBlocks: p.reservationPolicy === "BLOCK",
  });
}
function baselineAtLeastAsStrict(candidate, reference) {
  const keys = Object.keys(reference);
  return keys.every(function (k) {
    const a = candidate[k], b = reference[k];
    if (typeof b === "boolean") return b === true ? a === true : true;   // ne peut que durcir
    return a === b;
  });
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
    // §7 — le franchissement de run passe par la capacite provisionnee, jamais
    // par un contrat redige par l'appelant.
    historicalInputAuthority: OTV.isOperatorTrustVerifier(ctx.verifier) ? ctx.verifier.historicalInputAuthority() : null,
    historicalInputRequests: Array.isArray(input.historicalInputRequests) ? input.historicalInputRequests : [] });
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

module.exports = { POLICY_ALLOWLIST, NON_NEGOTIABLE, secureBaseline, baselineAtLeastAsStrict, resolveDownstreamUseAuthorization, sanitizePolicy, AUTHORIZATION, NON_NEGOTIABLE };
