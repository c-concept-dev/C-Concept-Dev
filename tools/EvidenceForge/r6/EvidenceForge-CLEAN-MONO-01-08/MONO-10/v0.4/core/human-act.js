"use strict";
/**
 * MONO-10 v0.4 — core/human-act.js  (§11)
 *
 * Un acte humain n'est pas authentique parce qu'il PORTE `actorType: "human"`
 * et `actorIdentity: "Alice"`. Ces champs sont une DECLARATION. v0.4 separe
 * strictement :
 *
 *   DECLARATION   la forme de l'acte est correcte (structure, horodatage)
 *   AUTHENTICITE  l'acte est rattache a un mecanisme d'acte humain accepte
 *
 * TEST        : une fixture est admise, mais SEULEMENT sous un manifeste TEST,
 *               et seulement si elle se declare explicitement comme fixture.
 * PRODUCTION  : l'acte doit etre valide par un mecanisme d'authentification
 *               INJECTE. Aucune signature humaine n'est inventee ici : si
 *               aucun mecanisme n'est configure, le resultat est
 *               NOT_AUTHENTICATED et la chaine echoue fermee.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { MODE } = require("./trusted-runtime-authority.js");

const AUTHENTICATION = {
  TEST_FIXTURE: "TEST_FIXTURE_DECLARED",
  PRODUCTION_MECHANISM: "PRODUCTION_MECHANISM_VERIFIED",
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
};

/** Forme seule. Ne dit RIEN de l'authenticite. */
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
 * ctx.executionMode        DERIVE du manifeste atteste, jamais declare par l'acte
 * ctx.humanActVerifier(act, ctx) -> { authenticated: bool, mechanismId, reason }
 * ctx.allowTestFixtureActs defaut TRUE en mode TEST uniquement
 */
function verifyHumanActAuthenticity(act, ctx, label) {
  ctx = ctx || {};
  label = label || "acte humain";
  const problems = [];
  try { assertHumanActDeclaration(act, label); } catch (e) { return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, problems: [e.message], mechanismId: null }; }

  const mode = ctx.executionMode;
  if (mode !== MODE.TEST && mode !== MODE.PRODUCTION) {
    return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, mechanismId: null,
      problems: [label + " : mode d'execution indetermine — l'authenticite d'un acte humain ne s'evalue pas hors d'un run atteste."] };
  }

  if (mode === MODE.TEST) {
    if (ctx.allowTestFixtureActs === false) problems.push(label + " : les actes de fixture sont desactives pour ce run de test.");
    if (act.authenticationMode !== AUTHENTICATION.TEST_FIXTURE) {
      problems.push(label + " : un acte de TEST doit se declarer explicitement comme fixture (authenticationMode = \"" + AUTHENTICATION.TEST_FIXTURE + "\").");
    }
    if (problems.length) return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, problems: problems, mechanismId: null };
    return { authenticated: true, authentication: AUTHENTICATION.TEST_FIXTURE, mechanismId: "test-fixture", problems: [],
      note: "acte de fixture, valable uniquement sous un manifeste TEST — ne vaut jamais acte humain reel." };
  }

  // PRODUCTION
  if (act.authenticationMode === AUTHENTICATION.TEST_FIXTURE) {
    return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, mechanismId: null,
      problems: [label + " : acte de fixture presente sous un run de PRODUCTION."] };
  }
  if (typeof ctx.humanActVerifier !== "function") {
    return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, mechanismId: null,
      problems: [label + " : aucun mecanisme d'authentification d'acte humain n'est configure pour ce run de production. "
        + "Aucune signature humaine n'est inventee : fail-closed."] };
  }
  let v = null;
  try { v = ctx.humanActVerifier(act, ctx); } catch (e) { v = { authenticated: false, reason: String((e && e.message) || e) }; }
  if (!v || v.authenticated !== true) {
    return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, mechanismId: (v && v.mechanismId) || null,
      problems: [label + " : mecanisme d'authentification refuse l'acte" + (v && v.reason ? " — " + v.reason : "") + "."] };
  }
  if (!isNonEmptyStr(v.mechanismId)) {
    return { authenticated: false, authentication: AUTHENTICATION.NOT_AUTHENTICATED, mechanismId: null,
      problems: [label + " : le mecanisme n'identifie pas lui-meme — une authentification anonyme n'en est pas une."] };
  }
  return { authenticated: true, authentication: AUTHENTICATION.PRODUCTION_MECHANISM, mechanismId: v.mechanismId, problems: [] };
}

function assertHumanActAuthentic(act, ctx, label) {
  const v = verifyHumanActAuthenticity(act, ctx, label);
  if (!v.authenticated) throw fail("HUMAN_ACT_NOT_AUTHENTICATED", v.problems.join(" ; "));
  return v;
}

function humanActHash(act) {
  return sha256Of({ actorType: act.actorType, actorIdentity: act.actorIdentity, decidedAt: act.decidedAt,
    decision: act.decision === undefined ? null : act.decision, authenticationMode: act.authenticationMode || null });
}

module.exports = { assertHumanActDeclaration, verifyHumanActAuthenticity, assertHumanActAuthentic, humanActHash, AUTHENTICATION };
