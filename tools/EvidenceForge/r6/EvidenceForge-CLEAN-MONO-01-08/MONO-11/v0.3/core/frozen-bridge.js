"use strict";
/**
 * MONO-11 v0.1 — core/frozen-bridge.js
 *
 * MONO-11 est ADDITIF : il COMPOSE des lots geles, il n'en copie ni n'en modifie
 * aucun. Ce module est le SEUL endroit qui sait ou vivent les lots geles, et il
 * verifie leur sceau AVANT de les charger : un lot altere n'est pas compose.
 *
 * Aucune constante metier ici : des chemins et des sceaux.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const FROZEN = Object.freeze({
  MONO10: { rel: "MONO-10/v0.19", seal: "SHA256SUMS.txt", excluded: ["SHA256SUMS.txt", "MANIFEST.json"] },
  MONO09: { rel: "MONO-09/v0.2", seal: "SHA256SUMS.txt", excluded: ["SHA256SUMS.txt", "MANIFEST.json"] },
  MONO01: { rel: "MONO-01", seal: "manifest/SHA256SUMS", excluded: [] },
});

function sha256File(p) { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }

/** Verifie un sceau SHA256SUMS (format `hash  chemin`). Rend { verified, divergences[] }. */
function verifySeal(lotDir, sealRel) {
  const sealPath = path.join(lotDir, sealRel);
  if (!fs.existsSync(sealPath)) return { verified: false, divergences: ["sceau absent : " + sealPath], files: 0 };
  const lines = fs.readFileSync(sealPath, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  const divergences = [];
  lines.forEach(function (line) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
    if (!m) { divergences.push("ligne illisible : " + line); return; }
    const p = path.join(lotDir, m[2]);
    if (!fs.existsSync(p)) { divergences.push("absent : " + m[2]); return; }
    if (sha256File(p) !== m[1]) divergences.push("modifie : " + m[2]);
  });
  return { verified: divergences.length === 0, divergences: divergences, files: lines.length };
}

function resolveBundleRoot(opts) {
  const root = (opts && opts.bundleRoot) || process.env.EVIDENCEFORGE_BUNDLE_ROOT;
  if (!root || !fs.existsSync(root)) {
    const e = new Error("FROZEN_BUNDLE_ROOT_MISSING: racine des lots geles absente (bundleRoot ou EVIDENCEFORGE_BUNDLE_ROOT).");
    e.code = "FROZEN_BUNDLE_ROOT_MISSING"; throw e;
  }
  return root;
}

/**
 * loadFrozen({ bundleRoot, skipSealCheck })
 * Charge les modules geles necessaires a la composition. Le sceau de chaque lot
 * est verifie ; une divergence est une erreur (FROZEN_LOT_ALTERED), jamais un
 * avertissement. `skipSealCheck` n'existe que pour les tests de mutation qui
 * PROUVENT ce refus — il est consigne dans le resultat.
 */
function loadFrozen(opts) {
  opts = opts || {};
  const root = resolveBundleRoot(opts);
  const seals = {};
  Object.keys(FROZEN).forEach(function (k) {
    const dir = path.join(root, FROZEN[k].rel);
    const r = opts.skipSealCheck ? { verified: null, divergences: [], files: null, skipped: true } : verifySeal(dir, FROZEN[k].seal);
    seals[k] = Object.assign({ dir: dir }, r);
    if (r.verified === false) {
      const e = new Error("FROZEN_LOT_ALTERED: " + k + " — " + r.divergences.slice(0, 3).join(" ; "));
      e.code = "FROZEN_LOT_ALTERED"; e.lot = k; e.divergences = r.divergences; throw e;
    }
  });
  const m10 = seals.MONO10.dir, m09 = seals.MONO09.dir, m01 = seals.MONO01.dir;
  const C = (f) => require(path.join(m10, "core", f));
  return Object.freeze({
    bundleRoot: root, seals: seals,
    M10: Object.freeze({
      dir: m10,
      OTB: C("operator-trust-boundary.js"), RM: C("run-evidence-manifest.js"), AAR: C("authenticated-artifact-registry.js"),
      LIN: C("lineage.js"), CA: C("candidate-assessment.js"), PG: C("panel-gate.js"), REL: C("relevance.js"),
      LLM: C("llm-capability.js"), UNK: C("unknowns.js"), AC: C("artifact-capabilities.js"),
      CANON: C("canonical.js"), CC: C("canonical-contracts.js"),
      UEB: require(path.join(m10, "adapters", "upstream-evidence-binder.js")),
      OP: require(path.join(m10, "tools", "operator-provisioning.js")),
      contracts: JSON.parse(fs.readFileSync(path.join(m10, "contracts", "canonical-contracts.json"), "utf8")),
    }),
    M09: Object.freeze({ dir: m09, adapter: require(path.join(m09, "lib", "professional-adapter.js")),
      identifierPolicy: require(path.join(m09, "lib", "identifier-policy.js")) }),
    M01: Object.freeze({
      dir: m01,
      D1: require(path.join(m01, "dependencies", "ef-02d1-eligibility-v1.js")),
      D2: require(path.join(m01, "dependencies", "ef-02d2-mission-relevance-v1.js")),
      D3: require(path.join(m01, "dependencies", "ef-02d3-coverage-panel-v1.js")),
      E: require(path.join(m01, "dependencies", "ef-02e-twin-builder-v1.js")),
      EXCL: require(path.join(m01, "dependencies", "ef-02e-exclusion-registry-v1.js")),
      DIM: require(path.join(m01, "dependencies", "ef-pr-gen-mission-dimension-set-v1.js")),
      POL: require(path.join(m01, "dependencies", "ef-pr-gen-heuristic-policy-v1.js")),
      TDS: require(path.join(m01, "dependencies", "ef-03-target-document-set-v1.js")),
      RS: require(path.join(m01, "dependencies", "ef-03a-review-schema-v1.js")),
      RR: require(path.join(m01, "dependencies", "ef-03b-review-runner-v1.js")),
      AGG: require(path.join(m01, "dependencies", "ef-03c-aggregation-v1.js")),
      HASH: require(path.join(m01, "dependencies", "ef-orch-hash-v0.1.js")),
    }),
  });
}

module.exports = { loadFrozen, verifySeal, resolveBundleRoot, FROZEN, sha256File };
