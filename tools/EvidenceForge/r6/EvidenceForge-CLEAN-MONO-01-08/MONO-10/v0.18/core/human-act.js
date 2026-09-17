"use strict";
/**
 * MONO-10 v0.6 — core/human-act.js   (§17, §18, §44)
 *
 * Un acte humain n'est pas authentique parce qu'il PORTE `actorType: "human"`
 * et `actorIdentity: "Alice"`. v0.5 separe strictement :
 *
 *   DECLARATION   la forme de l'acte est correcte
 *   AUTHENTICITE  la FRONTIERE OPERATEUR reconnait l'acte
 *
 * FERMETURE v0.4 B09 : le mecanisme n'est plus un callback passe par l'appelant
 * — celui-la meme qui fabriquait les decisions decidait si elles etaient
 * authentiques. En v0.5, il est provisionne par la frontiere, et seule
 * `verifier.verifyHumanAct` peut repondre OUI.
 *
 * §44 — distinction explicite :
 *   INFRASTRUCTURE_CALLBACK  provisionne par l'exploitant  -> peut authentifier
 *   CALLER_CALLBACK          fourni par l'appelant         -> jamais
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const OTV = require("./operator-trust-verifier.js");
const { AUTHENTICATION } = require("./operator-human-auth-boundary.js");

const CALLBACK_ORIGIN = { INFRASTRUCTURE: "INFRASTRUCTURE_CALLBACK", CALLER: "CALLER_CALLBACK" };

function assertHumanActDeclaration(act, label) {
  label = label || "acte humain";
  if (!act || typeof act !== "object") throw fail("HUMAN_ACT_MISSING", label + " : acte absent.");
  if (act.actorType !== "human") throw fail("HUMAN_ACT_INVALID", label + " : actorType doit valoir exactement \"human\".");
  if (!isNonEmptyStr(act.actorIdentity)) throw fail("HUMAN_ACT_INVALID", label + " : actorIdentity non vide requise.");
  if (!isNonEmptyStr(act.decidedAt) || isNaN(Date.parse(act.decidedAt))) throw fail("HUMAN_ACT_INVALID", label + " : decidedAt doit etre un horodatage reel.");
  return true;
}

/**
 * verifyHumanActAuthenticity(act, ctx, label)
 * ctx.verifier  verificateur issu de la frontiere operateur — SEULE voie.
 * Un `ctx.humanActVerifier` fourni par l'appelant est IGNORE et signale.
 */
function verifyHumanActAuthenticity(act, ctx, label, expected) {
  ctx = ctx || {}; label = label || "acte humain";
  try { assertHumanActDeclaration(act, label); }
  catch (e) { return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, mechanismId: null, callbackOrigin: null, problems: [e.message] }; }

  const callerSupplied = typeof ctx.humanActVerifier === "function";
  if (!OTV.isOperatorTrustVerifier(ctx.verifier)) {
    return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, mechanismId: null,
      callbackOrigin: callerSupplied ? CALLBACK_ORIGIN.CALLER : null,
      problems: [label + " : aucun verificateur issu d'une frontiere operateur"
        + (callerSupplied ? ". Un mecanisme fourni par l'appelant est refuse : celui qui produit les decisions ne decide pas de leur authenticite." : "")
        + " Aucune signature humaine n'est inventee : fail-closed."] };
  }
  const res = ctx.verifier.verifyHumanAct(act, Object.assign({
    runId: ctx.manifest ? ctx.manifest.runId : null,
    missionHash: ctx.manifest ? ctx.manifest.missionHash : null }, expected || {}));
  if (!res.authenticated) {
    return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, mechanismId: res.mechanismId || null,
      callbackOrigin: CALLBACK_ORIGIN.INFRASTRUCTURE, problems: res.problems };
  }
  return { authenticated: true, authentication: res.authentication, mechanismId: res.mechanismId,
    actorRecordHash: res.actorRecordHash || null, callbackOrigin: CALLBACK_ORIGIN.INFRASTRUCTURE, problems: [] };
}

function assertHumanActAuthentic(act, ctx, label, expected) {
  const v = verifyHumanActAuthenticity(act, ctx, label, expected);
  if (!v.authenticated) throw fail("HUMAN_ACT_NOT_AUTHENTICATED", v.problems.join(" ; "));
  return v;
}

function humanActHash(act) {
  return sha256Of({ actorType: act.actorType, actorIdentity: act.actorIdentity, decidedAt: act.decidedAt,
    decision: act.decision === undefined ? null : act.decision, authenticationMode: act.authenticationMode || null });
}

module.exports = { assertHumanActDeclaration, verifyHumanActAuthenticity, assertHumanActAuthentic, humanActHash,
  AUTHENTICATION, CALLBACK_ORIGIN };
