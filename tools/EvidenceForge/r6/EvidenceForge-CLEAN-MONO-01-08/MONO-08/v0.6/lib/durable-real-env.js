"use strict";
/**
 * MONO-08 — lib/durable-real-env.js
 *
 * REMEDIATION R2 (B-01, audit indépendant round 2) : construit
 * mono01/mono03/mono04/runRegistry/operatorApi avec des backends DURABLES
 * (lib/file-durable-backend.js) au lieu des backends en mémoire de
 * MONO-05/app/server/config.js::createOperatorBackends() — jamais un
 * contournement différent de l'Option A déjà utilisée pour la preuve
 * CROSS_PROCESS LOCAL_CONTROLLED (test/cross-process/), simplement
 * PROMUE ici en composant de production, pour que le chemin RÉEL de
 * bin/run-real-smoke.js (pas seulement un test) prouve lui-même une
 * persistance cross-processus authentique.
 *
 * Factorisé ici pour être RÉUTILISÉ À L'IDENTIQUE par :
 *   - bin/run-real-smoke.js (processus A — construit le run, avance le
 *     pipeline, persiste, se termine)
 *   - lib/cross-process-restart-worker.js (processus B — spawné par A,
 *     rouvre UNIQUEMENT le disque, réhydrate, termine le run)
 * Jamais deux mécaniques parallèles pour la même garantie (voir mandat
 * R2, section 6 : « Ne réimplémente pas en parallèle une deuxième
 * mécanique »).
 *
 * Forme de retour IDENTIQUE à MONO-07/lib/harness-env.js::buildEnv() —
 * {mono05Root, cfg, mono01, mono03, mono04, efOrchBackend, mono03Backend,
 * runRegistry, operatorApi} — un remplacement direct partout où l'ancien
 * env in-memory était utilisé, jamais une forme nouvelle à réapprendre.
 *
 * MONO-01/MONO-03/MONO-04/MONO-05 (lots gelés) : AUCUNE ligne modifiée.
 * `createMono01({efOrchDurableBackend})`/`createMono03({persistenceBackend})`
 * sont la frontière d'injection déjà documentée par ces lots eux-mêmes.
 */

const path = require("path");
const { createFileDurableBackend } = require("./file-durable-backend");

/**
 * buildDurableComponents(mono05Root, opts)
 * opts.eforchBackendDir, opts.mono03BackendDir : chemins disque (déjà
 * résolus par l'appelant, jamais devinés ici — process A et process B
 * doivent recevoir EXACTEMENT les mêmes chemins pour partager l'état).
 * opts.providerConfigs, opts.secrets : identiques à ce que
 * cfg.createOperatorBackends(secrets) attendait — jamais une nouvelle
 * convention.
 */
function buildDurableComponents(mono05Root, opts) {
  opts = opts || {};
  if (!opts.eforchBackendDir || !opts.mono03BackendDir) {
    throw new Error("buildDurableComponents: eforchBackendDir et mono03BackendDir sont obligatoires (backends durables explicites, jamais un défaut implicite en mémoire).");
  }
  const serverDir = path.join(mono05Root, "app", "server");
  const cfg = require(path.join(serverDir, "config.js"));
  const { createMono01 } = require(path.join(cfg.MONO01_PATH, "index.js"));
  const { createMono03 } = require(path.join(cfg.MONO04_PATH, "dependencies", "MONO-03", "index.js"));
  const { createMono04 } = require(path.join(cfg.MONO04_PATH, "index.js"));
  const { createStaticSecretProvider } = require(path.join(cfg.MONO04_PATH, "lib", "secret-provider.js"));
  const { createRunRegistry } = require(path.join(serverDir, "run-registry.js"));
  const { createOperatorApi } = require(path.join(serverDir, "operator-api.js"));

  const efOrchBackend = createFileDurableBackend(opts.eforchBackendDir);
  const mono03Backend = createFileDurableBackend(opts.mono03BackendDir);
  const mono01 = createMono01(cfg.REGISTRY_PATH, { efOrchDurableBackend: efOrchBackend });
  const mono03 = createMono03({ persistenceBackend: mono03Backend });
  const mono04 = createMono04({
    providerConfigs: opts.providerConfigs || {},
    secretProvider: createStaticSecretProvider(opts.secrets || {}),
  });
  const runRegistry = createRunRegistry(mono01, mono03);
  const operatorApi = createOperatorApi({ mono01: mono01, mono03: mono03, mono04: mono04, runRegistry: runRegistry });

  return { mono05Root: mono05Root, cfg: cfg, mono01: mono01, mono03: mono03, mono04: mono04, efOrchBackend: efOrchBackend, mono03Backend: mono03Backend, runRegistry: runRegistry, operatorApi: operatorApi };
}

module.exports = { buildDurableComponents };
