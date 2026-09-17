// EvidenceForge — EF-ORCH-03G — Exécuteur EF-01C2 — v0.1
//
// Invariants figés après audit du vrai executeAll()/runOpenAlex/runCrossref/
// runPubmed :
//   - un connecteur automatique ne reste JAMAIS dans un état intermédiaire :
//     soit il n'a pas encore été tenté, soit il a un checkpoint terminal
//     "completed" (avec ou sans erreurs internes — le vrai format ne porte
//     aucun statut de succès/échec séparé, seulement log.errors/stopReason) ;
//   - un connecteur manuel sans donnée fournie déclenche un
//     RuntimeDecisionGate ("manual_import_required") et RESTE bloquant tant
//     que la donnée n'est pas fournie — jamais ignoré, jamais silencieusement
//     transformé en connecteur retiré du protocole ;
//   - "EF-01C2:<connectorId>" et "EF-01C2:manual:<connectorId>" sont des
//     IDENTIFIANTS DE CHECKPOINT INTERNES À CE MODULE, jamais des stages de
//     la State Machine ou de la registry — ils ne sont JAMAIS passés à
//     registry.getStageAdapter() ni à runStage().
//
// Point architectural important : cet exécuteur NE PASSE JAMAIS par le
// mécanisme d'injection de décision de runStage (context.auditDecisions)
// pour résoudre les gates manuels. La fourniture d'une donnée manuelle se
// fait par écriture DIRECTE dans RunOutputStore (provideManualImportCheckpoint,
// appelée par l'appelant AVANT resumeRun), pas par une décision injectée dans
// le même appel de runStage. Cela évite qu'un SECOND connecteur manuel
// encore non résolu, découvert après la résolution du premier au sein d'un
// même appel, ne soit pris à tort pour une "boucle de gate" par
// runStage — chaque connecteur manuel obtient son propre cycle
// pause/fourniture/reprise, sur des appels executeStage strictement séparés.
"use strict";

const { validateEF01C1Output } = require("./ef-orch-ef01-output-contracts-v0.1.js");
const { capabilityFor } = require("./ef-orch-ef01c2-connector-capabilities-v0.1.js");
const { assertConnectorCheckpointOutputValid } = require("./ef-orch-ef01c2-checkpoint-contract-v0.1.js");

function str(v) {
  return String(v == null ? "" : v).trim();
}

function subStageId(connectorId, capability) {
  return capability === "automatic" ? "EF-01C2:" + connectorId : "EF-01C2:manual:" + connectorId;
}

async function getSubCheckpointOrThrow(store, identity, connectorId) {
  const exists = await store.hasSuccessfulOutput(identity);
  if (!exists) return null;
  const verify = await store.verifySuccessfulOutput(identity);
  if (!verify.valid) {
    throw new Error(
      "EF-01C2 executor: checkpoint interne corrompu pour le connecteur \"" + connectorId + "\" (storedHash=" + verify.storedHash +
      ", computedHash=" + verify.computedHash + ") — jamais relancé silencieusement, décision explicite requise."
    );
  }
  return store.getSuccessfulOutput(identity);
}

// ---------------------------------------------------------------------------
// provideManualImportCheckpoint — écrit DIRECTEMENT le checkpoint d'un
// connecteur manuel, appelée par l'appelant (UI/orchestrateur) après que
// l'humain a fourni ses sources, AVANT resumeRun. N'appelle jamais
// l'exécuteur elle-même.
// ---------------------------------------------------------------------------
async function provideManualImportCheckpoint({ store, runId, runContractHash, protocolHash, connectorId, sourcesTrouvees, log }) {
  const cid = str(connectorId);
  if (!cid) {
    throw new Error("provideManualImportCheckpoint: connectorId manquant ou vide — jamais de checkpoint sous un identifiant de connecteur vide.");
  }
  if (capabilityFor(cid) === "automatic") {
    throw new Error("provideManualImportCheckpoint: \"" + cid + "\" est un connecteur automatique — ne pas fournir d'import manuel pour lui.");
  }
  const output = { sourcesTrouvees: Array.isArray(sourcesTrouvees) ? sourcesTrouvees : [], log: log || null };
  assertConnectorCheckpointOutputValid({ connectorId: cid, capability: "manual_required", output }); // lève AVANT tout putSuccessfulOutput
  const identity = { runId, runContractHash, stageId: subStageId(cid, "manual_required"), protocolHash };
  return store.putSuccessfulOutput({ ...identity, output });
}

// ---------------------------------------------------------------------------
// createEF01C2Executor({ store, runId, runContractHash, connectorRunners })
// connectorRunners : { [connectorId]: async (connector, protocol) -> { sourcesTrouvees, log } }
// — implémentation réelle des appels réseau injectée séparément, jamais
// codée en dur ici (périmètre de cette brique : orchestration/checkpoint,
// pas le portage fidèle des appels OpenAlex/Crossref/PubMed eux-mêmes).
// ---------------------------------------------------------------------------
function createEF01C2Executor({ store, runId, runContractHash, connectorRunners }) {
  return async function ef01c2Executor(input) {
    if (!(await validateEF01C1Output(input))) {
      throw new Error("EF-01C2 executor: input fourni n'est pas une sortie EF-01C1 valide.");
    }
    const protocol = input.searchProtocol;
    const protocolHash = protocol.protocolHash;
    const activeConnectors = (protocol.sourcesActivees || []).filter((c) => c && c.active !== false);

    // Passe 1 : s'assurer que chaque connecteur actif a un checkpoint
    // terminal, dans l'ordre. Le premier connecteur manuel sans donnée
    // interrompt IMMÉDIATEMENT ici avec un gate — les connecteurs suivants
    // ne sont même pas examinés à ce tour (ils le seront à l'appel suivant,
    // une fois ce gate résolu et l'exécution reprise).
    for (const c of activeConnectors) {
      const capability = capabilityFor(c.connectorId);
      const identity = { runId, runContractHash, stageId: subStageId(c.connectorId, capability), protocolHash };
      const existing = await getSubCheckpointOrThrow(store, identity, c.connectorId);
      if (existing) continue; // déjà terminal pour ce run, jamais rejoué

      if (capability === "manual_required") {
        return { status: "gate_required", reason: "manual_import_required", affectedItems: [c.connectorId] };
      }

      // automatic, jamais encore tenté pour ce run : exécuter UNE fois.
      const runner = connectorRunners && connectorRunners[c.connectorId];
      if (typeof runner !== "function") {
        throw new Error("EF-01C2 executor: aucun connectorRunner fourni pour le connecteur automatique \"" + c.connectorId + "\".");
      }
      const result = await runner(c, protocol);
      const sourcesTrouvees = Array.isArray(result && result.sourcesTrouvees) ? result.sourcesTrouvees : [];
      const log = (result && result.log) || null;
      const outputCandidate = { sourcesTrouvees, log };
      // Rejet AVANT toute écriture : un runner défectueux ne doit jamais
      // pouvoir figer une sortie structurellement invalide dans RunOutputStore.
      assertConnectorCheckpointOutputValid({ connectorId: c.connectorId, capability, output: outputCandidate });
      // Terminal QUEL QUE SOIT log.errors.length — le vrai executeAll() ne
      // distingue jamais "réussi" de "terminé avec erreurs" au niveau statut ;
      // seul le contenu du log porte cette information.
      await store.putSuccessfulOutput({ ...identity, output: outputCandidate });
    }

    // Passe 2 : tous les connecteurs actifs ont désormais un checkpoint
    // terminal (sinon on serait déjà sorti sur un gate ci-dessus) -> agrégation.
    let allSources = [];
    let allLogs = [];
    for (const c of activeConnectors) {
      const capability = capabilityFor(c.connectorId);
      const identity = { runId, runContractHash, stageId: subStageId(c.connectorId, capability), protocolHash };
      const got = await getSubCheckpointOrThrow(store, identity, c.connectorId);
      if (!got) {
        // Ne devrait jamais arriver après la passe 1 — garde-fou défensif.
        throw new Error("EF-01C2 executor: checkpoint attendu mais absent pour \"" + c.connectorId + "\" au moment de l'agrégation.");
      }
      allSources = allSources.concat(got.output.sourcesTrouvees);
      if (got.output.log) allLogs.push(got.output.log);
    }

    const output = {
      ...input,
      stage: "EF-01C2",
      stageVersion: "EF-01C2-v1",
      sourcesTrouvees: allSources,
      executionLog: allLogs
    };
    return { status: "ok", output };
  };
}

const EFOrchEF01C2Executor = { createEF01C2Executor, provideManualImportCheckpoint };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01C2Executor;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01C2Executor = EFOrchEF01C2Executor;
}
