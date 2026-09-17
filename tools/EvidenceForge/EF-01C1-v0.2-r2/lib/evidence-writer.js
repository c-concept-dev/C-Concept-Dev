"use strict";
// EF-01C1-v0.2 — lib/evidence-writer.js — voir EF-01B-v0.2/lib/evidence-
// writer.js (meme principe). Un seul repertoire "planner" par mission
// (contrairement au resolver, qui a un repertoire par discipline — le
// planner produit UN plan de recherche couvrant toutes les disciplines
// retenues en un seul appel).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * writePlannerEvidence(evidenceRoot, evidence) — evidence : { inputObject,
 * promptText, rawResponseText, provenance, plannerOutput }. Ecrit sous
 * <evidenceRoot>/planner/{input.json,prompt.txt,raw-response.txt,
 * provenance.json,planner-output.json,SHA256SUMS.txt}.
 */
function writePlannerEvidence(evidenceRoot, evidence) {
  const dir = path.join(evidenceRoot, "planner");
  fs.mkdirSync(dir, { recursive: true });

  const files = {
    "input.json": JSON.stringify(evidence.inputObject, null, 2),
    "prompt.txt": evidence.promptText,
    "raw-response.txt": evidence.rawResponseText,
    "provenance.json": JSON.stringify(evidence.provenance, null, 2),
    "planner-output.json": JSON.stringify(evidence.plannerOutput, null, 2),
  };

  const sums = [];
  Object.keys(files).forEach(function (name) {
    const full = path.join(dir, name);
    fs.writeFileSync(full, files[name]);
    sums.push(sha256Hex(files[name]) + "  " + name);
  });
  fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), sums.join("\n") + "\n");

  return dir;
}

/**
 * writeRawProviderEvidence(evidenceRoot, evidence) — EF-01C1-v0.2-r2,
 * F-C1-R2-03.
 *
 * ECRIT AVANT TOUT PARSING. Une reponse provider REELLEMENT RECUE doit
 * laisser une trace meme si son parsing echoue ensuite : les deux appels
 * planner reels perdus avant ce lot l'ont ete parce que l'ecriture n'avait
 * lieu qu'apres un parsing reussi.
 *
 * FRONTIERE EXPLICITE ET NON NEGOCIABLE : l'artefact produit est classe
 * `RAW_PROVIDER_EVIDENCE`. Ce N'EST PAS un plannerRun et il ne doit jamais
 * etre lu comme tel. Un plannerRun n'existe QUE si le parsing ET la
 * validation R6 ont reussi. Le contrat gele n'est pas modifie : cet
 * artefact est ADDITIF et propre au successeur.
 *
 * Le fichier est reecrit une seconde fois apres le parsing pour porter
 * `parsingStatus` (SUCCESS ou FAILED) : le premier passage garantit la
 * survie de la preuve, le second en dit l'issue.
 */
function writeRawProviderEvidence(evidenceRoot, evidence) {
  const dir = path.join(evidenceRoot, "planner");
  fs.mkdirSync(dir, { recursive: true });
  const name = "planner-provider-evidence.json";
  const body = JSON.stringify(evidence, null, 2) + "\n";
  fs.writeFileSync(path.join(dir, name), body);
  return path.join(dir, name);
}

module.exports = {
  writePlannerEvidence: writePlannerEvidence,
  writeRawProviderEvidence: writeRawProviderEvidence,
};
