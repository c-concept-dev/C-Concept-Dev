"use strict";
/**
 * MONO-08 — lib/real-screening-workflow.js
 *
 * REMEDIATION R5 (correction des defauts BLOQUANT/MAJOR R4-A01/A02,
 * audit independant round 4) : workflow REAL en DEUX PHASES.
 *
 * Probleme corrige : le chemin nominal historique (bin/run-real-smoke.js
 * -> lib/real-e2e-driver.js::createRealMissionRun()) exigeait
 * `auditDecisions` (indexees par des sourceId REELLEMENT retrouves par
 * le retrieval EF-01C2) AVANT que ce retrieval n'ait meme eu lieu — une
 * dependance cyclique temporelle impossible a satisfaire honnetement
 * sans inventer a l'avance des decisions sur des sources encore
 * inconnues.
 *
 * Solution : deux fonctions, separees par une PAUSE OPERATEUR explicite,
 * autour d'un artefact durable intermediaire (RetrievalSnapshot) :
 *
 *   PREPARE_REAL_SCREENING (prepareRealScreening)
 *     PRE_RETRIEVAL_GATE (validatePreRetrievalProvenance — resolverRuns/
 *     plannerRun/plannerOutput/humanValidation, JAMAIS auditDecisions)
 *     -> construction RunContract/ResolverTrace/SearchProtocol
 *     -> EF-01C2 EXECUTE REELLEMENT (une seule fois)
 *     -> RetrievalSnapshot construit, hashe, PERSISTE (durable, disque)
 *     -> ARRET explicite : OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS
 *
 *   [ PAUSE OPERATEUR : l'operateur fournit auditDecisions REELLES,
 *     indexees par les sourceId REELS du snapshot desormais connus ]
 *
 *   RESUME_REAL_SCREENING (resumeRealScreening)
 *     -> charge le snapshot EXACT depuis le disque (eventuellement dans
 *        un AUTRE processus — voir test_t08_r5_closure.js, preuve
 *        cross-process)
 *     -> verifie son integrite cryptographique (SNAPSHOT_INTEGRITY_ERROR
 *        si alteree)
 *     -> POST_RETRIEVAL_GATE (validatePostRetrievalAuditDecisions —
 *        LA SEULE fonction habilitee a exiger/valider auditDecisions)
 *     -> construit ScreeningArtifact/QualificationTestArtifact DEPUIS LE
 *        SNAPSHOT (REJOUE, jamais un second retrieval — voir
 *        lib/eforch-artifacts.js::buildReplayConnectorRunners)
 *     -> demarre/poursuit le run reel (createRealMissionRunFromSnapshot)
 *
 * Voir AUDIT-REMEDIATION/24-REAL-SCREENING-TWO-PHASE-WORKFLOW.md et
 * 25-RETRIEVAL-SNAPSHOT-CONTRACT.md pour le detail complet.
 *
 * Aucune ligne de MONO-01->07 modifiee : ce fichier compose exclusivement
 * des builders/factories deja identifies (lib/eforch-artifacts.js,
 * lib/real-e2e-driver.js) et le backend durable deja valide
 * (lib/file-durable-backend.js, R2/B-01).
 */

const {
  loadEForchDeps,
  validatePreRetrievalProvenance,
  executeActiveConnectorsRetrieval,
} = require("./eforch-artifacts");

const SNAPSHOT_SCHEMA_VERSION = "MONO08.RetrievalSnapshot-v1";
const SNAPSHOT_NAMESPACE = "retrieval-snapshots";

function isNonEmptyStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function classifyField(v) {
  return isNonEmptyStr(v) ? "RETRIEVAL_DERIVED" : "NOT_AVAILABLE";
}

/**
 * serializeEf01aInjected / deserializeEf01aInjected — ef01aInjected.
 * documentBytes est une map hash->Uint8Array (octets bruts des documents
 * cibles), jamais JSON/canonical-JSON-serialisable telle quelle (ni
 * hashable par sha256CanonicalJson, ni persistable proprement par un
 * backend qui ecrit du JSON). Convertie en base64 UNIQUEMENT pour le
 * stockage/hashage du RetrievalSnapshot — jamais une perte de fidelite
 * (round-trip exact), jamais une modification du contenu documentaire
 * lui-meme.
 */
function serializeEf01aInjected(ef01aInjected) {
  const documentBytesBase64 = {};
  Object.keys(ef01aInjected.documentBytes || {}).forEach(function (hash) {
    documentBytesBase64[hash] = Buffer.from(ef01aInjected.documentBytes[hash]).toString("base64");
  });
  return { metadata: ef01aInjected.metadata, documentBytesBase64: documentBytesBase64 };
}
function deserializeEf01aInjected(serialized) {
  const documentBytes = {};
  Object.keys(serialized.documentBytesBase64 || {}).forEach(function (hash) {
    documentBytes[hash] = new Uint8Array(Buffer.from(serialized.documentBytesBase64[hash], "base64"));
  });
  return { metadata: serialized.metadata, documentBytes: documentBytes };
}

function operatorInputRequired(message) {
  const err = new Error("OPERATOR_INPUT_REQUIRED: " + message);
  err.code = "OPERATOR_INPUT_REQUIRED";
  return err;
}
/**
 * buildRetrievalSnapshot(deps, params) — construit l'artefact
 * RetrievalSnapshot (voir 25-RETRIEVAL-SNAPSHOT-CONTRACT.md pour le
 * schema documente en detail). `snapshotHash` couvre TOUT le reste du
 * contenu (canonical JSON hash, meme algorithme que causalLineage/R3) :
 * toute alteration ulterieure d'un seul champ (source, hash amont,
 * upstreamArtifacts...) le rend detectable (SNAPSHOT_INTEGRITY_ERROR).
 */
async function buildRetrievalSnapshot(deps, params) {
  const sources = params.retrievalResult.sourcesTrouvees.map(function (rec) {
    return {
      sourceId: rec.id,
      connectorId: (rec.provenance && rec.provenance.connectorId) || null,
      connectorType: (rec.provenance && rec.provenance.connectorType) || null,
      providerNativeId: (rec.provenance && rec.provenance.originalReference) || null,
      titre: isNonEmptyStr(rec.titre) ? rec.titre : null,
      auteurOuOrganisme: isNonEmptyStr(rec.auteurOuOrganisme) ? rec.auteurOuOrganisme : null,
      date: isNonEmptyStr(rec.date) ? rec.date : null,
      reference: isNonEmptyStr(rec.reference) ? rec.reference : null,
      discipline: isNonEmptyStr(rec.discipline) ? rec.discipline : null,
      fieldProvenance: {
        titre: classifyField(rec.titre), auteurOuOrganisme: classifyField(rec.auteurOuOrganisme),
        date: classifyField(rec.date), reference: classifyField(rec.reference), discipline: classifyField(rec.discipline),
      },
    };
  });

  const retrievalResultHash = await deps.sha256CanonicalJson(params.retrievalResult);

  const snapshotWithoutHash = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId: "snapshot-" + params.runContract.runContractHash.slice(0, 12) + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    missionId: params.missionId,
    missionQuestion: params.missionQuestion,
    runContractHash: params.runContract.runContractHash,
    searchProtocolHash: params.searchProtocol.protocolHash,
    plannerOutputHash: (params.searchProtocol.causalLineage && params.searchProtocol.causalLineage.plannerOutputHash) || null,
    retrievalTimestamp: new Date().toISOString(),
    // Identite non-secrete du provider utilise — JAMAIS de secret brut
    // (aucune cle/token n'est jamais passee ici par construction ;
    // secret-scan etendu, voir 27 dans le mandat R5 / 20-checklist).
    providerIdentity: params.providerIdentity || {},
    sourceCount: sources.length,
    sources: sources,
    retrievalResultHash: retrievalResultHash,
    // Donnee BRUTE, exacte, necessaire au rejeu sans second retrieval
    // (lib/eforch-artifacts.js::buildReplayConnectorRunners) — jamais
    // reconstruite approximativement depuis `sources` ci-dessus.
    retrievalRaw: params.retrievalResult,
    // Additif au-dela du minimum mandate (section 10) : necessaire pour
    // que RESUME_REAL_SCREENING reprenne SANS jamais recalculer
    // RunContract/SearchProtocol (qui produiraient des hash DIFFERENTS
    // a chaque appel — confirmedAt horodate a chaque confirmation).
    upstreamArtifacts: {
      runContract: params.runContract,
      resolverTrace: params.resolverTrace,
      searchProtocol: params.searchProtocol,
      ef01aInjected: serializeEf01aInjected(params.ef01aInjected),
      ef01fInjected: params.ef01fInjected,
    },
  };
  const snapshotHash = await deps.sha256CanonicalJson(snapshotWithoutHash);
  return Object.assign({}, snapshotWithoutHash, { snapshotHash: snapshotHash });
}

async function verifySnapshotIntegrity(deps, snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !isNonEmptyStr(snapshot.snapshotHash)) {
    throw operatorInputRequired("SNAPSHOT_INTEGRITY_ERROR: snapshot absent, invalide, ou sans snapshotHash.");
  }
  const rest = {};
  Object.keys(snapshot).forEach(function (k) { if (k !== "snapshotHash") rest[k] = snapshot[k]; });
  const recomputed = await deps.sha256CanonicalJson(rest);
  if (recomputed !== snapshot.snapshotHash) {
    const err = new Error("SNAPSHOT_INTEGRITY_ERROR: le hash recalcule (" + recomputed + ") ne correspond pas au snapshotHash declare (" + snapshot.snapshotHash + ") — le snapshot a ete modifie apres sa creation, jamais accepte tel quel.");
    err.code = "SNAPSHOT_INTEGRITY_ERROR";
    throw err;
  }
}

/**
 * prepareRealScreening(env, opts) — PHASE 1.
 * opts : { mission:{dimensions,targetDocuments}, missionQuestion,
 * documentBytesByUrl, openAlexFetchImpl, realProvenance:{resolverRuns,
 * plannerRun, plannerOutput, humanValidation}, providerIdentity?,
 * snapshotBackend (obligatoire — backend durable, ex. createFileDurableBackend) }.
 * Retourne { state:"OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS", snapshotId,
 * snapshotHash, missionId, sourceCount, sourceIds } — ne construit et ne
 * peut jamais construire ScreeningArtifact/auditDecisions ici.
 */
async function prepareRealScreening(env, opts) {
  opts = opts || {};
  const snapshotBackend = opts.snapshotBackend;
  if (!snapshotBackend) throw new Error("prepareRealScreening: opts.snapshotBackend requis (backend durable pour persister le RetrievalSnapshot, jamais en memoire uniquement).");
  const cfg = env.cfg;
  const mission = opts.mission;
  const missionQuestion = opts.missionQuestion || "Real Smoke MONO-08";
  const documentBytesByUrl = opts.documentBytesByUrl || {};
  const openAlexFetchImpl = opts.openAlexFetchImpl;
  if (typeof openAlexFetchImpl !== "function") throw new Error("prepareRealScreening: opts.openAlexFetchImpl requis (LOCAL_CONTROLLED ou REEL).");
  const realProvenance = opts.realProvenance || {};

  // PRE_RETRIEVAL_GATE — LA MEME fonction que bin/run-real-smoke.js::describeMissionGateStatus(),
  // jamais une seconde logique de validation (R5-A01).
  const gateCheck = validatePreRetrievalProvenance({
    dimensions: mission.dimensions,
    eForchProvenance: { resolverRuns: realProvenance.resolverRuns, plannerRun: realProvenance.plannerRun, plannerOutput: realProvenance.plannerOutput, humanValidation: realProvenance.humanValidation },
  });
  if (!gateCheck.valid) {
    throw operatorInputRequired("PRE_RETRIEVAL_GATE a rejete la provenance fournie — " + gateCheck.problems.join("; ") + ".");
  }

  const { buildPreRetrievalArtifacts } = require("./real-e2e-driver");
  const pre = await buildPreRetrievalArtifacts(cfg, mission, missionQuestion, documentBytesByUrl, openAlexFetchImpl, {
    mode: "REAL", resolverRuns: realProvenance.resolverRuns, plannerRun: realProvenance.plannerRun, plannerOutput: realProvenance.plannerOutput, humanValidation: realProvenance.humanValidation,
  });

  // EF-01C2 EXECUTE REELLEMENT — une seule fois, jamais devine.
  const retrievalResult = await executeActiveConnectorsRetrieval(pre.connectorRunners, pre.searchProtocol);

  const snapshot = await buildRetrievalSnapshot(pre.deps, {
    missionId: pre.missionId, missionQuestion: missionQuestion, runContract: pre.runContract, resolverTrace: pre.resolverTrace,
    searchProtocol: pre.searchProtocol, ef01aInjected: pre.ef01aInjected, ef01fInjected: pre.ef01fInjected,
    retrievalResult: retrievalResult, providerIdentity: opts.providerIdentity || {},
  });

  await snapshotBackend.put(SNAPSHOT_NAMESPACE, snapshot.snapshotId, snapshot);

  // ARRET explicite — ne tente JAMAIS de poursuivre vers EF-01D sans
  // decisions humaines reelles.
  return {
    state: "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS",
    snapshotId: snapshot.snapshotId,
    snapshotHash: snapshot.snapshotHash,
    missionId: snapshot.missionId,
    sourceCount: snapshot.sourceCount,
    sourceIds: snapshot.sources.map(function (s) { return s.sourceId; }),
  };
}

/**
 * buildAuditDecisionsTemplate(snapshot) — genere un TEMPLATE VIDE de
 * saisie des decisions depuis un snapshot reel (mandat R5, section 14).
 * Prefillit UNIQUEMENT snapshotId/snapshotHash/missionId/sourceId/titre/
 * reference (aide a l'operateur) — JAMAIS acteur/date/decision/
 * justification (null explicite), qui ne doivent JAMAIS etre presumes
 * representer une action humaine reelle avant qu'elle n'ait ete
 * REELLEMENT prise.
 */
function buildAuditDecisionsTemplate(snapshot) {
  return {
    _readme: "TEMPLATE genere depuis un RetrievalSnapshot reel (MONO-08, R5). Completer decisions[].acteur/date/decision/justification avec des valeurs REELLEMENT fournies par un operateur humain pour CHAQUE source. Ne JAMAIS remplir automatiquement — voir AUDIT-REMEDIATION/20-REAL-SMOKE-OPERATOR-CHECKLIST.md.",
    snapshotId: snapshot.snapshotId,
    snapshotHash: snapshot.snapshotHash,
    missionId: snapshot.missionId,
    decisions: snapshot.sources.map(function (s) {
      return { sourceId: s.sourceId, titre: s.titre, reference: s.reference, acteur: null, date: null, decision: null, justification: null };
    }),
  };
}

/**
 * resumeRealScreening(env, adapter, workerCallFn, opts) — PHASE 2.
 * opts : { runId, snapshotBackend, snapshotId, auditDecisionsInput,
 * mission:{dimensions,targetDocuments}, documentContentByUrl,
 * heuristicPolicy?, exclusionRegistry? }.
 * Charge le snapshot EXACT depuis le disque (potentiellement un AUTRE
 * processus que celui de prepareRealScreening()), verifie son integrite,
 * puis delegue a createRealMissionRunFromSnapshot() (lib/real-e2e-driver.js
 * — POST_RETRIEVAL_GATE + construction + demarrage du run, jamais une
 * logique dupliquee ici).
 */
async function resumeRealScreening(env, adapter, workerCallFn, opts) {
  opts = opts || {};
  const snapshotBackend = opts.snapshotBackend;
  const snapshotId = opts.snapshotId;
  if (!snapshotBackend || !snapshotId) throw new Error("resumeRealScreening: opts.snapshotBackend et opts.snapshotId requis.");

  const snapshot = await snapshotBackend.get(SNAPSHOT_NAMESPACE, snapshotId);
  if (!snapshot) {
    const err = new Error("SNAPSHOT_NOT_FOUND: aucun RetrievalSnapshot persiste pour \"" + snapshotId + "\".");
    err.code = "SNAPSHOT_NOT_FOUND";
    throw err;
  }

  const deps = loadEForchDeps(env.cfg.MONO01_PATH);
  await verifySnapshotIntegrity(deps, snapshot);

  const { createRealMissionRunFromSnapshot } = require("./real-e2e-driver");
  return createRealMissionRunFromSnapshot(env, adapter, workerCallFn, Object.assign({}, opts, { snapshot: snapshot }));
}

module.exports = {
  SNAPSHOT_NAMESPACE: SNAPSHOT_NAMESPACE,
  SNAPSHOT_SCHEMA_VERSION: SNAPSHOT_SCHEMA_VERSION,
  buildRetrievalSnapshot: buildRetrievalSnapshot,
  verifySnapshotIntegrity: verifySnapshotIntegrity,
  prepareRealScreening: prepareRealScreening,
  resumeRealScreening: resumeRealScreening,
  buildAuditDecisionsTemplate: buildAuditDecisionsTemplate,
  serializeEf01aInjected: serializeEf01aInjected,
  deserializeEf01aInjected: deserializeEf01aInjected,
};
