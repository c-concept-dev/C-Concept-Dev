"use strict";

const path = require("path");
const MONO01_PATH = path.join(__dirname, "..", "..", "dependencies", "MONO-04", "dependencies", "MONO-03", "dependencies", "MONO-02", "dependencies", "MONO-01");
const MONO02_PATH = path.join(__dirname, "..", "..", "dependencies", "MONO-04", "dependencies", "MONO-03", "dependencies", "MONO-02");
const MONO04_PATH = path.join(__dirname, "..", "..", "dependencies", "MONO-04");

const { createMono01 } = require(path.join(MONO01_PATH, "index.js"));
const EFOrchDurableBackend = require(path.join(MONO01_PATH, "dependencies", "ef-orch-durable-backend-v0.1.js"));
const { createMono03, createInMemoryBackend } = require(path.join(MONO04_PATH, "dependencies", "MONO-03", "index.js"));
const { createMono04 } = require(path.join(MONO04_PATH, "index.js"));
const { createStaticSecretProvider } = require(path.join(MONO04_PATH, "lib", "secret-provider.js"));

const REGISTRY_PATH = path.join(MONO01_PATH, "registry", "mono-00-frozen-baseline-registry-v1.json");
const GRAPH_PATH = path.join(MONO02_PATH, "graph", "mono-02-orchestration-graph-v1.json");

// createOperatorBackends() — construit UNE INSTANCE des backends
// nécessaires (EF-ORCH durable, MONO-03 persistance, secrets). Ce sont des
// backends de démonstration EN MÉMOIRE, injectés explicitement — ni MONO-01
// ni MONO-03 ni MONO-04 n'en fournissent un par défaut (frontière
// d'injection déjà établie par ces lots). MONO-05 ne construit aucune
// implémentation de production — la fourniture d'un backend persistant réel
// reste hors périmètre (comme documenté par MONO-03/MONO-04 eux-mêmes).
//
// Un namespace supplémentaire "runInputs" est utilisé sur le MÊME backend
// MONO-03 injecté pour conserver le bundle d'entrées externes fourni par
// l'opérateur à la création d'un run (RunContract + executionDependencies) —
// ce n'est PAS un artefact métier (ArtifactStore reste l'unique source pour
// cela) mais une donnée technique nécessaire pour reconstruire un moteur
// d'orchestration après un redémarrage du serveur (voir run-registry.js).
function createOperatorBackends(secrets) {
  const efOrchBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
  const mono03Backend = createInMemoryBackend();
  const mono01 = createMono01(REGISTRY_PATH, { efOrchDurableBackend: efOrchBackend });
  const mono03 = createMono03({ persistenceBackend: mono03Backend });
  const mono04 = createMono04({
    providerConfigs: (secrets && secrets.providerConfigs) || {},
    secretProvider: createStaticSecretProvider((secrets && secrets.secrets) || {}),
  });
  return { mono01, mono03, mono04, efOrchBackend, mono03Backend };
}

module.exports = { createOperatorBackends, REGISTRY_PATH, GRAPH_PATH, MONO01_PATH, MONO02_PATH, MONO04_PATH };
