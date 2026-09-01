"use strict";
/**
 * MONO-08 — lib/secret-scan-surfaces.js
 *
 * REMEDIATION R2 (B-02, audit indépendant round 2) : avant ce correctif,
 * bin/run-real-smoke.js ne scannait que `[process.env.ANTHROPIC_API_KEY]`
 * (jamais EVIDENCEFORGE_WORKER_API_KEY en mode delegated) contre la seule
 * `trace` — ni RunState, ni ArtifactRecord, ni le contenu réellement
 * persisté sur disque (backends FILE_DURABLE), ni stdout/stderr du
 * processus de restart cross-process.
 *
 * resolveActiveSecretNames()/resolveActiveSecretValues() résolvent le(s)
 * secret(s) à scanner selon le SEUL mode réellement actif
 * (LLM_AUTH_MODE), réutilisant resolveAuthMode() (lib/real-provider-
 * configs.js — même fonction que buildRealProviderConfigs()/preflight,
 * jamais une troisième logique de résolution) — jamais les deux modes
 * mélangés : `direct` ne scanne QUE ANTHROPIC_API_KEY,
 * `delegated` ne scanne QUE EVIDENCEFORGE_WORKER_API_KEY.
 */
const fs = require("fs");
const path = require("path");
const { resolveAuthMode } = require("./real-provider-configs");

function resolveActiveSecretNames(env) {
  env = env || process.env;
  const authModeResolution = resolveAuthMode(env);
  if (!authModeResolution.valid) return { mode: null, secretNames: [] };
  if (authModeResolution.mode === "delegated") {
    return { mode: "delegated", secretNames: ["EVIDENCEFORGE_WORKER_API_KEY"] };
  }
  return { mode: "direct", secretNames: ["ANTHROPIC_API_KEY"] };
}

function resolveActiveSecretValues(env) {
  env = env || process.env;
  const resolved = resolveActiveSecretNames(env);
  return resolved.secretNames.map(function (name) { return env[name]; }).filter(Boolean);
}

/**
 * collectDurableBackendFileSurfaces(baseDir, labelPrefix) — lit
 * récursivement tous les fichiers d'un dossier de backend FILE_DURABLE
 * (lib/file-durable-backend.js) et les retourne comme surfaces de scan
 * nommées par chemin relatif — l'ETAT REELLEMENT PERSISTE SUR DISQUE,
 * jamais une approximation reconstruite en mémoire. Une erreur de
 * lecture individuelle (fichier en cours d'écriture concurrente) est
 * ignorée pour ce fichier seul, jamais bloquante pour le reste du scan.
 */
function collectDurableBackendFileSurfaces(baseDir, labelPrefix) {
  const surfaces = {};
  if (!baseDir || !fs.existsSync(baseDir)) return surfaces;
  const stack = [baseDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      try {
        surfaces[(labelPrefix || "durable-backend") + ":" + path.relative(baseDir, full)] = fs.readFileSync(full, "utf8");
      } catch (e) { /* ecriture concurrente ou suppression entre readdir() et readFile() - jamais bloquant */ }
    }
  }
  return surfaces;
}

module.exports = { resolveActiveSecretNames: resolveActiveSecretNames, resolveActiveSecretValues: resolveActiveSecretValues, collectDurableBackendFileSurfaces: collectDurableBackendFileSurfaces };
