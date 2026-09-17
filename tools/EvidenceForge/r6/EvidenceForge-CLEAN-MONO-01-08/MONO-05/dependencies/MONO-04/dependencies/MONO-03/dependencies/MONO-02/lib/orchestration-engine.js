"use strict";

const fs = require("fs");
const { transition } = require("./state-machine");
const { createOrchestrationError } = require("./orchestration-errors");
const { nodeRunners } = require("./node-runners");

// OrchestrationEngine — CDC MONO-02 section EXÉCUTION.
//
// Responsabilités AUTORISÉES uniquement : inspecter l'état, vérifier les
// préconditions, choisir le prochain nœud, appeler le port MONO-01,
// enregistrer le résultat technique, avancer ou bloquer. Ne reconstruit
// jamais un input métier, ne répare jamais une sortie invalide, ne convertit
// jamais silencieusement une version, n'interprète jamais un résultat
// métier (à l'exception documentée et minimale d'isMissionPortValidationTrue,
// voir lib/node-runners.js LIMITE CONNUE #1 — une lecture de statut
// technique, jamais un jugement sur le contenu).

function loadGraph(graphPathOrObject) {
  const raw = typeof graphPathOrObject === "string" ? JSON.parse(fs.readFileSync(graphPathOrObject, "utf8")) : graphPathOrObject;
  if (!raw || raw.schema !== "EvidenceForge.OrchestrationGraph") {
    throw new Error(`OrchestrationEngine: schema de graphe inattendu ("${raw && raw.schema}") — refus de démarrer.`);
  }
  if (raw.schemaVersion !== "MONO-02-v1") {
    throw new Error(`OrchestrationEngine: schemaVersion de graphe inattendue ("${raw.schemaVersion}").`);
  }
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    throw new Error("OrchestrationEngine: graphe sans aucun nœud déclaré — refus de démarrer.");
  }
  return raw;
}

// Pour chaque nœud, quelles entrées de requiredInputs doivent être trouvées
// dans ctx.externalInputs (fournies par l'opérant) — les autres proviennent
// de la sortie d'un nœud amont déjà SUCCESS et sont extraites par le câblage
// fixe de lib/node-runners.js (qui sait exactement où chaque valeur vit dans
// la sortie du nœud amont, y compris les sorties composites comme
// EF-PR-GEN-01 ou EF-02D). Cette table ne décide rien de métier — elle
// documente uniquement l'ORIGINE (externe vs amont) de chaque entrée
// déclarée dans le graphe, condition nécessaire pour un contrôle fail-closed
// précis sans dupliquer le câblage réel des node-runners.
const EXTERNAL_INPUTS_BY_NODE = {
  "EF-ORCH-SUBSYSTEM": ["runContract"],
  "EF-PR-GEN-01": ["missionDimensionSet", "missionDocumentMapping", "heuristicPolicy"],
  "EF-02A": [],
  "EF-02B": [],
  "EF-02C": [],
  "EF-02D": [],
  "EF-02E": ["exclusionRegistry"],
  "TARGET_DOCUMENT_SET": ["documents"],
  "EF-03A": ["reviewTargets"],
  "EF-03B": [],
  "EF-03C": [],
  "EF-03D": [],
  "EF-04-LINEAGE": [],
  "EF-04A": [],
};

function createOrchestrationEngine(graphPathOrObject, mono01, context) {
  const graph = loadGraph(graphPathOrObject);
  const byId = new Map(graph.nodes.map((n) => [n.nodeId, n]));
  const runtimeState = new Map(graph.nodes.map((n) => [n.nodeId, n.state || "NOT_STARTED"]));

  const ctx = context || {};
  ctx.nodeOutputs = ctx.nodeOutputs || {};
  ctx.nodeResults = ctx.nodeResults || {};
  ctx.externalInputs = ctx.externalInputs || {};
  ctx.dependenciesAvailable = ctx.dependenciesAvailable || {};

  function getNodeDef(nodeId) {
    return byId.has(nodeId) ? byId.get(nodeId) : null;
  }

  function getNodeState(nodeId) {
    if (!byId.has(nodeId)) return null;
    return runtimeState.get(nodeId);
  }

  function listNodeIds() {
    // Ordre du graphe — déterministe (T02-21), jamais un ordre d'itération
    // d'objet dépendant de l'insertion dynamique.
    return graph.nodes.map((n) => n.nodeId);
  }

  function applyTransition(nodeId, toState) {
    const fromState = runtimeState.get(nodeId);
    const result = transition(fromState, toState);
    if (!result.ok) return result;
    runtimeState.set(nodeId, toState);
    return result;
  }

  // Vérification fail-closed des préconditions ORCHESTRATION-LEVEL
  // (CDC section FAIL-CLOSED). Ne duplique jamais les contrôles internes de
  // MONO-01 (schema/version/mission) — uniquement : nœud connu, upstream
  // SUCCESS, inputs présents dans le contexte, dépendances confirmées.
  function checkPreconditions(nodeId) {
    const def = getNodeDef(nodeId);
    if (!def) {
      return { ok: false, error: createOrchestrationError("ORCHESTRATION_BLOCKED", `Nœud inconnu du graphe: "${nodeId}".`, { nodeId }) };
    }

    for (const upstream of def.requiredUpstreamNodes || []) {
      if (runtimeState.get(upstream) !== "SUCCESS") {
        return {
          ok: false,
          error: createOrchestrationError(
            "UPSTREAM_NOT_SUCCESS",
            `Nœud "${nodeId}" requiert "${upstream}" au statut SUCCESS (actuel: ${runtimeState.get(upstream)}).`,
            { nodeId, upstream, upstreamState: runtimeState.get(upstream) }
          ),
        };
      }
    }

    for (const inputName of def.requiredInputs || []) {
      const mustBeExternal = (EXTERNAL_INPUTS_BY_NODE[nodeId] || []).includes(inputName);
      if (mustBeExternal) {
        if (!(inputName in ctx.externalInputs) || ctx.externalInputs[inputName] === undefined || ctx.externalInputs[inputName] === null) {
          return {
            ok: false,
            error: createOrchestrationError(
              "ORCHESTRATION_BLOCKED",
              `Nœud "${nodeId}" requiert l'entrée externe "${inputName}", absente du contexte d'orchestration.`,
              { nodeId, missingInput: inputName }
            ),
          };
        }
      }
      // Les entrées non-externes proviennent d'un nœud amont déjà vérifié
      // SUCCESS ci-dessus — leur extraction précise est le rôle du câblage
      // fixe de lib/node-runners.js, jamais reconstruite ici.
    }

    for (const dep of def.requiredDependencies || []) {
      if (dep.startsWith("externalStageAdapter")) {
        const method = dep.split(".")[1];
        const available = ctx.adapter && typeof ctx.adapter[method] === "function";
        if (!available) {
          return {
            ok: false,
            error: createOrchestrationError("ORCHESTRATION_BLOCKED", `Nœud "${nodeId}" requiert la dépendance "${dep}", non disponible.`, { nodeId, dependency: dep }),
          };
        }
      } else if (ctx.dependenciesAvailable[dep] !== true) {
        return {
          ok: false,
          error: createOrchestrationError("ORCHESTRATION_BLOCKED", `Nœud "${nodeId}" requiert la dépendance "${dep}", non confirmée disponible (fail-closed).`, { nodeId, dependency: dep }),
        };
      }
    }

    return { ok: true };
  }

  // canRun(nodeId) — CDC EXÉCUTION : inspecte SEULEMENT si les préconditions
  // (upstream, inputs, dépendances) sont satisfaites, indépendamment de
  // l'état courant du nœud. runNode() applique séparément la garde d'état
  // (state===READY -> NODE_NOT_READY sinon) avant d'appeler ce contrôle.
  function canRun(nodeId) {
    return checkPreconditions(nodeId);
  }

  // computeReadyNodes() — déterministe (T02-21) : parcourt les nœuds dans
  // l'ordre du graphe, transitionne NOT_STARTED->READY pour ceux dont les
  // préconditions sont satisfaites MAINTENANT, et retourne la liste des
  // nœuds actuellement READY (nouveaux + déjà prêts). Ne transitionne
  // JAMAIS automatiquement FAILED/BLOCKED/PAUSED->READY — cela reste un acte
  // explicite de l'appelant (CDC : "jamais automatique").
  function computeReadyNodes() {
    for (const nodeId of listNodeIds()) {
      if (runtimeState.get(nodeId) === "NOT_STARTED") {
        const pre = checkPreconditions(nodeId);
        if (pre.ok) applyTransition(nodeId, "READY");
      }
    }
    return listNodeIds().filter((id) => runtimeState.get(id) === "READY");
  }

  async function runNode(nodeId) {
    const def = getNodeDef(nodeId);
    if (!def) {
      return { ok: false, error: createOrchestrationError("ORCHESTRATION_BLOCKED", `Nœud inconnu du graphe: "${nodeId}".`, { nodeId }) };
    }
    const stateCheck = getNodeState(nodeId);
    if (stateCheck !== "READY") {
      return { ok: false, error: createOrchestrationError("NODE_NOT_READY", `Nœud "${nodeId}" n'est pas READY (état actuel: ${stateCheck}).`, { nodeId, state: stateCheck }) };
    }
    const readiness = canRun(nodeId);
    if (!readiness.ok) return readiness;

    const runningTransition = applyTransition(nodeId, "RUNNING");
    if (!runningTransition.ok) return runningTransition;

    // Re-vérification fail-closed juste avant l'appel (défense en
    // profondeur — le contexte peut avoir changé entre READY et l'appel).
    const recheck = checkPreconditions(nodeId);
    if (!recheck.ok) {
      applyTransition(nodeId, "BLOCKED");
      return recheck;
    }

    const runner = nodeRunners[nodeId];
    if (typeof runner !== "function") {
      applyTransition(nodeId, "BLOCKED");
      return { ok: false, error: createOrchestrationError("ORCHESTRATION_BLOCKED", `Aucun exécuteur de nœud enregistré pour "${nodeId}".`, { nodeId }) };
    }

    let result;
    try {
      result = await runner(mono01, ctx);
    } catch (e) {
      applyTransition(nodeId, "FAILED");
      return { ok: false, error: createOrchestrationError("ORCHESTRATION_BLOCKED", `Échec technique non intercepté dans le nœud "${nodeId}": ${e && e.message}`, { nodeId, cause: String((e && e.message) || e) }) };
    }

    ctx.nodeResults[nodeId] = result;

    if (result.status === "SUCCESS") {
      ctx.nodeOutputs[nodeId] = result.output;
      applyTransition(nodeId, "SUCCESS");
      return { ok: true, result };
    }
    if (result.status === "BLOCKED") {
      applyTransition(nodeId, "BLOCKED");
      return { ok: false, result, error: result.diagnostics && result.diagnostics.error };
    }
    // FAILED (ou tout autre statut non-SUCCESS/BLOCKED — jamais accepté comme succès implicite)
    applyTransition(nodeId, "FAILED");
    return { ok: false, result, error: result.diagnostics && result.diagnostics.error };
  }

  // transition(nodeId, toState) — pour les reprises EXPLICITES
  // (FAILED->READY, BLOCKED->READY, PAUSED->READY) et l'interruption
  // contrôlée (RUNNING->PAUSED). Jamais appelé automatiquement par le
  // moteur lui-même pour ces cas.
  function requestTransition(nodeId, toState) {
    if (!byId.has(nodeId)) {
      return { ok: false, error: createOrchestrationError("ORCHESTRATION_BLOCKED", `Nœud inconnu du graphe: "${nodeId}".`, { nodeId }) };
    }
    return applyTransition(nodeId, toState);
  }

  function markFailed(nodeId, details) {
    if (getNodeState(nodeId) !== "RUNNING") {
      return { ok: false, error: createOrchestrationError("INVALID_STATE_TRANSITION", `markFailed("${nodeId}") requiert l'état RUNNING (actuel: ${getNodeState(nodeId)}).`, { nodeId }) };
    }
    return applyTransition(nodeId, "FAILED", details);
  }

  function markBlocked(nodeId, details) {
    if (getNodeState(nodeId) !== "RUNNING") {
      return { ok: false, error: createOrchestrationError("INVALID_STATE_TRANSITION", `markBlocked("${nodeId}") requiert l'état RUNNING (actuel: ${getNodeState(nodeId)}).`, { nodeId }) };
    }
    return applyTransition(nodeId, "BLOCKED", details);
  }

  return {
    graph,
    context: ctx,
    listNodeIds,
    getNodeDef,
    getNodeState,
    computeReadyNodes,
    canRun,
    runNode,
    transition: requestTransition,
    markFailed,
    markBlocked,
  };
}

module.exports = { createOrchestrationEngine };
