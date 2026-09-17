"use strict";

const crypto = require("crypto");

// canonicalStringify — sérialisation JSON déterministe (clés triées
// récursivement), pour que deux objets structurellement identiques
// produisent toujours le même hash, indépendamment de l'ordre d'insertion
// des clés. Composant nouveau et autonome de MONO-03 — ne réutilise pas la
// fonction de hachage interne d'EF-ORCH (domaine distinct, jamais un
// couplage aux fichiers gelés d'EF-ORCH).
function canonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(value[k])).join(",") + "}";
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

module.exports = { canonicalStringify, sha256Hex };
