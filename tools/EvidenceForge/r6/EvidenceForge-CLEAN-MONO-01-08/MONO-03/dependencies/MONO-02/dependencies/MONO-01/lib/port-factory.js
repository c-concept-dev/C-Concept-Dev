"use strict";

const { createIntegrationError, statusForCode } = require("./errors");

// port-factory.js — mécanique commune à tous les ports (CDC sections 5, 8, 9, 10).
//
// Un port ne fait jamais que : valider la frontière, appeler le module gelé
// EXACTEMENT tel quel (aucune donnée recalculée, aucun champ inventé), puis
// valider la sortie. Il ne mute jamais l'entrée ni la sortie — la sortie
// renvoyée dans l'enveloppe est la même référence que celle produite par le
// module gelé (voir T01-12).

function buildResultEnvelope({ runId, moduleId, status, outputContract, output, diagnostics }) {
  return Object.freeze({
    schema: "EvidenceForge.IntegrationResult",
    schemaVersion: "MONO-01-v1",
    runId: runId || null,
    moduleId,
    status,
    outputContract: outputContract || null,
    output: output === undefined ? null : output,
    diagnostics: diagnostics || {},
  });
}

function blockedOrFailed({ runId, moduleId, code, message, details }) {
  const err = createIntegrationError(code, message, details);
  return buildResultEnvelope({
    runId,
    moduleId,
    status: statusForCode(code),
    diagnostics: { error: err },
  });
}

/**
 * portConfig:
 *   portId                 — identifiant du port (pour les diagnostics/erreurs)
 *   moduleId               — moduleId MONO-00 dont ce port formalise la frontière
 *   expectedCanonicalVersion — (optionnel) version canonique attendue dans le registre
 *   requiredInputs         — liste des clés obligatoires dans `inputs`
 *   inputContracts         — { nomEntrée: { schema, schemaVersion } } — validé si présent
 *   outputContract         — { schema, schemaVersion } — validé sur la sortie si fourni
 *   externalDependencies   — liste de noms de dépendances externes requises
 *   callType               — "SYNC" | "ASYNC" | "ASYNC_EXTERNAL"
 *   gate                   — (optionnel) (inputs) => null | {code, message, details}
 *                            vérifié APRÈS les contrôles génériques, AVANT l'appel
 *
 * callArgs:
 *   runId, missionId, inputs, dependenciesAvailable, invoke, executionContext
 */
function invokePort(portConfig, baselinePort, callArgs) {
  const {
    runId,
    inputs = {},
    dependenciesAvailable = {},
    invoke,
    executionContext,
  } = callArgs || {};
  const moduleId = portConfig.moduleId;

  // 1. Le module doit exister dans le registre MONO-00.
  const def = baselinePort.getModuleDefinition(moduleId);
  if (!def) {
    return blockedOrFailed({
      runId,
      moduleId,
      code: "MODULE_NOT_IN_BASELINE",
      message: `Module "${moduleId}" absent du registre MONO-00 — aucune variante ne peut être acceptée.`,
      details: { moduleId },
    });
  }

  // 2. La version canonique déclarée doit correspondre à celle attendue par le port.
  if (
    portConfig.expectedCanonicalVersion &&
    def.canonicalVersion !== portConfig.expectedCanonicalVersion
  ) {
    return blockedOrFailed({
      runId,
      moduleId,
      code: "MODULE_VERSION_MISMATCH",
      message:
        `Version canonique inattendue pour "${moduleId}": attendu ` +
        `${portConfig.expectedCanonicalVersion}, trouvé ${def.canonicalVersion}.`,
      details: { moduleId, expected: portConfig.expectedCanonicalVersion, found: def.canonicalVersion },
    });
  }

  // 3. Toutes les entrées requises doivent être présentes.
  for (const reqName of portConfig.requiredInputs || []) {
    if (!(reqName in inputs) || inputs[reqName] === undefined || inputs[reqName] === null) {
      return blockedOrFailed({
        runId,
        moduleId,
        code: "MISSING_REQUIRED_INPUT",
        message: `Entrée requise manquante pour "${moduleId}": "${reqName}".`,
        details: { moduleId, missing: reqName },
      });
    }
  }

  // 4. Les entrées portant un contrat déclaré doivent respecter schema/schemaVersion exacts.
  for (const [name, contract] of Object.entries(portConfig.inputContracts || {})) {
    const val = inputs[name];
    if (val === undefined || val === null) continue; // déjà couvert par le contrôle 3 si requis
    if (contract.schema && val.schema !== contract.schema) {
      return blockedOrFailed({
        runId,
        moduleId,
        code: "SCHEMA_VERSION_MISMATCH",
        message: `Schema inattendu pour l'entrée "${name}" de "${moduleId}": attendu ${contract.schema}, trouvé ${val.schema}.`,
        details: { moduleId, input: name, expected: contract.schema, found: val.schema },
      });
    }
    if (contract.schemaVersion && val.schemaVersion !== contract.schemaVersion) {
      return blockedOrFailed({
        runId,
        moduleId,
        code: "SCHEMA_VERSION_MISMATCH",
        message: `schemaVersion inattendue pour l'entrée "${name}" de "${moduleId}": attendu ${contract.schemaVersion}, trouvé ${val.schemaVersion}.`,
        details: { moduleId, input: name, expected: contract.schemaVersion, found: val.schemaVersion },
      });
    }
  }

  // 5. Cohérence de mission : toute entrée porteuse d'un missionId doit s'accorder
  //    avec les autres, et avec callArgs.missionId si fourni.
  const missionIds = new Set();
  for (const val of Object.values(inputs)) {
    if (val && typeof val === "object" && val.missionId !== undefined && val.missionId !== null) {
      missionIds.add(val.missionId);
    }
  }
  if (callArgs && callArgs.missionId !== undefined && callArgs.missionId !== null) {
    missionIds.add(callArgs.missionId);
  }
  if (missionIds.size > 1) {
    return blockedOrFailed({
      runId,
      moduleId,
      code: "MISSION_ID_MISMATCH",
      message: `Identifiants de mission divergents pour "${moduleId}": ${[...missionIds].join(", ")}.`,
      details: { moduleId, missionIds: [...missionIds] },
    });
  }

  // 6. Dépendances externes déclarées comme requises par ce port doivent être
  //    EXPLICITEMENT confirmées disponibles — fail-closed strict : une
  //    dépendance absente du contexte ({}) bloque EXACTEMENT comme une
  //    dépendance explicitement déclarée indisponible ({ dep: false }).
  //    Seule une valeur strictement === true autorise l'appel.
  for (const dep of portConfig.externalDependencies || []) {
    if (dependenciesAvailable[dep] !== true) {
      return blockedOrFailed({
        runId,
        moduleId,
        code: "DEPENDENCY_UNAVAILABLE",
        message:
          `Dépendance externe non confirmée pour "${moduleId}": "${dep}" — fail-closed : ` +
          `absente ou différente de true, jamais un défaut permissif. Le module n'est jamais appelé sans elle.`,
        details: { moduleId, dependency: dep, received: dependenciesAvailable[dep] },
      });
    }
  }

  // 7. Verrou sémantique spécifique au port (ex : LineagePort PASS requis avant ReportPort).
  if (typeof portConfig.gate === "function") {
    const gateFailure = portConfig.gate(inputs);
    if (gateFailure) {
      return blockedOrFailed({
        runId,
        moduleId,
        code: gateFailure.code,
        message: gateFailure.message,
        details: gateFailure.details,
      });
    }
  }

  if (typeof invoke !== "function") {
    return blockedOrFailed({
      runId,
      moduleId,
      code: "DEPENDENCY_UNAVAILABLE",
      message:
        `Aucune fonction d'invocation fournie pour "${moduleId}" — la frontière est ` +
        `formalisée mais son exécution n'est pas câblée dans cet appel.`,
      details: { moduleId },
    });
  }

  // 8. Appel du module gelé, en respectant le mode sync/async déclaré.
  let rawResult;
  try {
    rawResult = invoke(inputs, { dependenciesAvailable, executionContext });
  } catch (e) {
    return buildResultEnvelope({
      runId,
      moduleId,
      status: "FAILED",
      diagnostics: {
        error: createIntegrationError(
          "INTEGRATION_CONTRACT_ERROR",
          `Échec technique à l'appel de "${moduleId}": ${e && e.message ? e.message : e}`,
          { moduleId, cause: String((e && e.message) || e) }
        ),
      },
    });
  }

  const isPromise = rawResult && typeof rawResult.then === "function";

  if (portConfig.callType === "SYNC" && isPromise) {
    return buildResultEnvelope({
      runId,
      moduleId,
      status: "FAILED",
      diagnostics: {
        error: createIntegrationError(
          "INTEGRATION_CONTRACT_ERROR",
          `Port "${portConfig.portId}" déclaré SYNC mais l'invocation de "${moduleId}" a renvoyé une Promise — jamais accepté sans await.`,
          { moduleId }
        ),
      },
    });
  }
  if ((portConfig.callType === "ASYNC" || portConfig.callType === "ASYNC_EXTERNAL") && !isPromise) {
    return buildResultEnvelope({
      runId,
      moduleId,
      status: "FAILED",
      diagnostics: {
        error: createIntegrationError(
          "INTEGRATION_CONTRACT_ERROR",
          `Port "${portConfig.portId}" déclaré ${portConfig.callType} mais l'invocation de "${moduleId}" n'a pas renvoyé de Promise.`,
          { moduleId }
        ),
      },
    });
  }

  if (isPromise) {
    return rawResult.then(
      (output) => finalizeOutput(portConfig, moduleId, runId, output),
      (e) =>
        buildResultEnvelope({
          runId,
          moduleId,
          status: "FAILED",
          diagnostics: {
            error: createIntegrationError(
              "INTEGRATION_CONTRACT_ERROR",
              `Échec technique asynchrone de "${moduleId}": ${e && e.message ? e.message : e}`,
              { moduleId, cause: String((e && e.message) || e) }
            ),
          },
        })
    );
  }
  return finalizeOutput(portConfig, moduleId, runId, rawResult);
}

function finalizeOutput(portConfig, moduleId, runId, output) {
  const contract = portConfig.outputContract;
  if (contract) {
    if (output === undefined || output === null || typeof output !== "object") {
      return buildResultEnvelope({
        runId,
        moduleId,
        status: "FAILED",
        diagnostics: {
          error: createIntegrationError(
            "INVALID_MODULE_OUTPUT",
            `Sortie absente ou non-objet pour "${moduleId}".`,
            { moduleId }
          ),
        },
      });
    }
    if (contract.schema && output.schema !== contract.schema) {
      return buildResultEnvelope({
        runId,
        moduleId,
        status: "FAILED",
        diagnostics: {
          error: createIntegrationError(
            "INVALID_MODULE_OUTPUT",
            `Schema de sortie inattendu pour "${moduleId}": attendu ${contract.schema}, trouvé ${output.schema}.`,
            { moduleId, expected: contract.schema, found: output.schema }
          ),
        },
      });
    }
    if (contract.schemaVersion && output.schemaVersion !== contract.schemaVersion) {
      return buildResultEnvelope({
        runId,
        moduleId,
        status: "FAILED",
        diagnostics: {
          error: createIntegrationError(
            "INVALID_MODULE_OUTPUT",
            `schemaVersion de sortie inattendue pour "${moduleId}": attendu ${contract.schemaVersion}, trouvé ${output.schemaVersion}.`,
            { moduleId, expected: contract.schemaVersion, found: output.schemaVersion }
          ),
        },
      });
    }
  }
  return buildResultEnvelope({
    runId,
    moduleId,
    status: "SUCCESS",
    outputContract: contract ? `${contract.schema}/${contract.schemaVersion}` : null,
    output, // même référence que celle produite par le module gelé — jamais clonée/mutée
  });
}

module.exports = { invokePort, buildResultEnvelope, blockedOrFailed };
