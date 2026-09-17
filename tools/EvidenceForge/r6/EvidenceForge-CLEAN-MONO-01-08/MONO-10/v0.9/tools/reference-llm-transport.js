"use strict";
/**
 * MONO-10 v0.6 — tools/reference-llm-transport.js
 *
 * TRANSPORT DE REFERENCE, provisionne par l'exploitant. N'est importe par aucun
 * module de core/ : la frontiere le charge par `transportModuleRef`, depuis un
 * chemin que l'exploitant configure.
 *
 * Cette implementation de reference ne touche AUCUN reseau : elle sert a
 * eprouver le CONTRAT de frontiere. Un deploiement reel fournit son propre
 * module, au meme emplacement contractuel.
 */
const crypto = require("crypto");

async function probe(intent) {
  intent = intent || {};
  // Aucun appel sortant. La reponse est conforme au schema ferme attendu.
  return {
    httpStatus: 200,
    text: '{"ok":true,"probe":"evidenceforge"}',
    requestId: "ref-" + crypto.createHash("sha256")
      .update(String(intent.providerId) + "|" + String(intent.modelId) + "|" + String(intent.runId)).digest("hex").slice(0, 16),
    credentialProbeSkipped: false,
    costUsd: 0,
    transportKind: "REFERENCE_OFFLINE",
  };
}
module.exports = { probe };
