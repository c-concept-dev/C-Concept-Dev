"use strict";
/**
 * MONO-10 v0.6 — core/human-act-proof.js   (§20, §21, §22)
 *
 * FERMETURE v0.5 B05.
 *
 * En v0.5, l'appartenance de `actorIdentity` au registre d'acteurs suffisait :
 * n'importe quelle decision portant un nom connu etait authentifiee. Or
 * l'appartenance d'un acteur au registre ne prouve PAS qu'il a accompli CET
 * acte-la.
 *
 * v0.6 exige une PREUVE D'ACTE, liee a la decision precise, au run et a la
 * mission, et emise par un mecanisme provisionne par l'exploitant :
 *
 *   HumanActProof {
 *     actorId, actionType, decisionHash, runId, missionHash,
 *     issuedAt, mechanismRef, proofValue
 *   }
 *
 * Aucune technologie n'est imposee : carte a puce, SSO, parapheur, registre
 * signe. Le noyau ne verifie que la FORME et la LIAISON ; l'authenticite de
 * `proofValue` est etablie par le mecanisme de la frontiere.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");

const ACTION_TYPE = { PANEL_DECISION: "PANEL_DECISION", REPORT_ACCEPTANCE: "REPORT_ACCEPTANCE" };

/**
 * decisionHash — empreinte de l'acte PRECIS, pas de l'acteur.
 * Deux decisions differentes du meme acteur ont deux empreintes differentes :
 * une preuve ne peut donc pas etre transplantee d'une decision a une autre.
 */
function computeDecisionHash(input) {
  input = input || {};
  ["actionType", "runId", "missionHash", "subjectId", "decision"].forEach(function (f) {
    if (!isNonEmptyStr(input[f])) throw fail("DECISION_HASH_INPUT_INVALID", "champ \"" + f + "\" requis.");
  });
  return sha256Of({ actionType: input.actionType, runId: input.runId, missionHash: input.missionHash,
    subjectId: input.subjectId, decision: input.decision,
    boundArtifactHash: isNonEmptyStr(input.boundArtifactHash) ? input.boundArtifactHash : null,
    evidenceRefsHash: isNonEmptyStr(input.evidenceRefsHash) ? input.evidenceRefsHash : null });
}

function assertProofShape(proof, label) {
  label = label || "HumanActProof";
  if (!proof || typeof proof !== "object") throw fail("HUMAN_ACT_PROOF_MISSING", label + " : preuve d'acte absente — l'appartenance au registre ne prouve pas l'acte.");
  ["actorId", "actionType", "decisionHash", "runId", "missionHash", "issuedAt", "mechanismRef", "proofValue"].forEach(function (f) {
    if (!isNonEmptyStr(proof[f])) throw fail("HUMAN_ACT_PROOF_INVALID", label + " : champ \"" + f + "\" requis.");
  });
  if (isNaN(Date.parse(proof.issuedAt))) throw fail("HUMAN_ACT_PROOF_INVALID", label + " : issuedAt doit etre un horodatage reel.");
  if (!ACTION_TYPE[proof.actionType]) throw fail("HUMAN_ACT_PROOF_INVALID", label + " : actionType \"" + proof.actionType + "\" inconnu.");
  return true;
}

/**
 * assertProofBoundTo(proof, expected, label) — la preuve porte-t-elle sur CET acte ?
 * expected : { actorId, actionType, decisionHash, runId, missionHash }
 */
function assertProofBoundTo(proof, expected, label) {
  label = label || "HumanActProof";
  assertProofShape(proof, label);
  [["actorId", "acteur"], ["actionType", "type d'action"], ["decisionHash", "empreinte de decision"],
   ["runId", "run"], ["missionHash", "mission"]].forEach(function (p) {
    if (isNonEmptyStr(expected[p[0]]) && proof[p[0]] !== expected[p[0]]) {
      throw fail("HUMAN_ACT_PROOF_MISMATCH", label + " : " + p[1] + " de la preuve differe de l'acte presente — une preuve ne se transplante pas.");
    }
  });
  return true;
}

module.exports = { computeDecisionHash, assertProofShape, assertProofBoundTo, ACTION_TYPE };
