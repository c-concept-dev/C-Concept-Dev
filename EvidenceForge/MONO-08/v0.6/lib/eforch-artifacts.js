"use strict";
/**
 * MONO-08 — lib/eforch-artifacts.js
 *
 * Construit chaque artefact prerequis du sous-pipeline EF-ORCH-SUBSYSTEM
 * (EF-01A a EF-01F) EXCLUSIVEMENT via les builders/factories geles deja
 * identifies par inspection directe de :
 *   MONO-01/test/fixtures-eforch.js (preuve de constructibilite),
 *   MONO-01/dependencies/ef-orch-runcontract-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01b-resolver-trace-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01c2-runner-openalex-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01-output-contracts-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01e-test-qualification-generator-v0.1.js,
 *   MONO-01/dependencies/ef-orch-hash-v0.1.js.
 *
 * Jamais un objet ad hoc devine pour un artefact qui a un builder gele —
 * seuls ScreeningArtifact et les objets "injected" EF-01A/EF-01F sont
 * construits directement (fixtures-eforch.js fait de meme : aucun builder
 * dedie n'existe pour eux au-dela de la validation inline de l'executeur).
 *
 * REMEDIATION F-02/F-03 (integrite epistemique) : ResolverTrace (EF-01B),
 * SearchProtocol.plannerRuns (EF-01C1) et ScreeningArtifact.auditDecisions
 * (EF-01D) portent une provenance epistemique (appel LLM reel, decision
 * humaine reelle) qui ne doit JAMAIS etre fabriquee et presentee comme
 * reelle. Chaque builder concerne accepte donc un parametre `provenance`
 * optionnel `{ mode: "REAL" | "LOCAL_CONTROLLED", ... }` :
 *   - mode absent ou "LOCAL_CONTROLLED" (defaut, jamais implicite en REAL) :
 *     construit un fixture SYNTHETIQUE explicitement marque
 *     evidenceProvenance="SYNTHETIC_FIXTURE" — comportement fonctionnel
 *     identique a l'existant (RÈGLE CARDINALE : aucune valeur fixture
 *     changee), seule l'etiquette honnete est ajoutee.
 *   - mode "REAL" : exige que l'appelant fournisse les donnees REELLES
 *     (appel LLM reellement effectue, decision humaine reellement prise) ;
 *     si elles sont absentes ou incompletes, leve une exception
 *     "OPERATOR_INPUT_REQUIRED: ..." (err.code = "OPERATOR_INPUT_REQUIRED")
 *     plutot que d'inventer un acteur="human" ou un provider/model/hash —
 *     fail-closed explicite, jamais une fabrication silencieuse.
 * Note EF-01D : le contrat gele MONO-01 (ef-orch-ef01d-screening-artifact-
 * v0.1.js::assertScreeningArtifactComplete) exige litteralement
 * acteur==="human" pour toute AuditDecision de screening (vocabulaire de
 * stage, jamais "system_test" contrairement a EF-01E) — ce champ reste
 * donc "human" dans les deux modes, mais n'est plus jamais fabrique SANS
 * qu'une decision reelle (REAL) ou explicitement synthetique (LOCAL_
 * CONTROLLED, etiquetee evidenceProvenance) ne l'accompagne.
 */

function loadEForchDeps(mono01Path) {
  const path = require("path");
  function dep(name) { return require(path.join(mono01Path, "dependencies", name)); }
  return {
    EFOrchRunContract: dep("ef-orch-runcontract-v0.1.js"),
    ResolverTraceSchema: dep("ef-orch-ef01b-resolver-trace-v0.1.js"),
    createOpenAlexRunner: dep("ef-orch-ef01c2-runner-openalex-v0.1.js").createOpenAlexRunner,
    sha256LikeRealSearchProtocol: dep("ef-orch-ef01-output-contracts-v0.1.js").sha256LikeRealSearchProtocol,
    generateQualificationTestArtifact: dep("ef-orch-ef01e-test-qualification-generator-v0.1.js").generateQualificationTestArtifact,
    sha256Bytes: dep("ef-orch-hash-v0.1.js").sha256Bytes,
  };
}

async function buildConfirmedRunContractForMission(deps, mission, missionQuestion, documentBytesByUrl) {
  const EFOrchRunContract = deps.EFOrchRunContract;
  const sha256Bytes = deps.sha256Bytes;
  const documentsDetectes = [];
  for (const doc of mission.targetDocuments) {
    const bytes = documentBytesByUrl[doc.url];
    if (!bytes) throw new Error("buildConfirmedRunContractForMission: octets manquants pour \"" + doc.url + "\".");
    const hash = await sha256Bytes(bytes);
    documentsDetectes.push({ nom: doc.title || doc.documentId, type: "document_public", hashSha256: hash });
  }
  const disciplinesProposees = mission.dimensions.map(function (d) { return { discipline: d.id, justification: d.label || d.id }; });
  const draft = EFOrchRunContract.buildRunContractDraft({
    demandeBrute: missionQuestion,
    missionReformulee: missionQuestion,
    documentsDetectes: documentsDetectes,
    sourcesFournies: [],
    disciplinesProposees: disciplinesProposees,
    connecteursDisponibles: ["openalex"],
    niveauRevue: "standard",
    webPublicActive: false,
    governanceRef: { usageStatus: "research_internal" },
  });
  return EFOrchRunContract.confirmRunContract(draft, { confirmedAt: new Date().toISOString() });
}

function operatorInputRequired(message) {
  const err = new Error("OPERATOR_INPUT_REQUIRED: " + message);
  err.code = "OPERATOR_INPUT_REQUIRED";
  return err;
}

function isSha256Hex(v) {
  return typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);
}

function resolveMode(provenance) {
  return provenance && provenance.mode === "REAL" ? "REAL" : "LOCAL_CONTROLLED";
}

function buildResolverTraceForMission(deps, missionId, confirmedRunContract, provenance) {
  const ResolverTraceSchema = deps.ResolverTraceSchema;
  const mode = resolveMode(provenance);
  const disciplines = confirmedRunContract.disciplinesProposees;
  const realRuns = provenance && provenance.resolverRuns;
  if (mode === "REAL") {
    if (!Array.isArray(realRuns) || realRuns.length !== disciplines.length) {
      throw operatorInputRequired(
        "ResolverTrace (EF-01B) requiert un resolverRuns[] REEL fourni par l'operateur (un par discipline proposee, " +
        disciplines.length + " attendu(s)) — aucune trace d'appel LLM synthetique n'est acceptee en mode REAL."
      );
    }
    realRuns.forEach(function (run, i) {
      const missing = [];
      ["provider", "model", "promptVersion", "date"].forEach(function (f) { if (!run || typeof run[f] !== "string" || !run[f].trim()) missing.push(f); });
      if (!run || !isSha256Hex(run.inputHash)) missing.push("inputHash");
      if (!run || !isSha256Hex(run.rawResponseHash)) missing.push("rawResponseHash");
      if (missing.length) {
        throw operatorInputRequired("ResolverTrace resolverRuns[" + i + "] (discipline \"" + (disciplines[i] && disciplines[i].discipline) + "\") — champ(s) reel(s) manquant(s) ou invalide(s) : " + missing.join(", ") + ".");
      }
    });
  }
  return {
    schema: ResolverTraceSchema.SCHEMA,
    schemaVersion: ResolverTraceSchema.SCHEMA_VERSION,
    runContractHash: confirmedRunContract.runContractHash,
    evidenceProvenance: mode === "REAL" ? "REAL_LLM_CALL" : "SYNTHETIC_FIXTURE",
    resolverRuns: disciplines.map(function (d, i) {
      if (mode === "REAL") {
        const run = realRuns[i];
        return {
          runId: "r" + (i + 1), date: run.date, provider: run.provider, model: run.model,
          promptVersion: run.promptVersion, missionId: missionId, inputHash: run.inputHash, rawResponseHash: run.rawResponseHash,
          proposalCountRaw: typeof run.proposalCountRaw === "number" ? run.proposalCountRaw : 1,
          proposalCountStored: typeof run.proposalCountStored === "number" ? run.proposalCountStored : 1,
          technicalProposalLimit: typeof run.technicalProposalLimit === "number" ? run.technicalProposalLimit : 20,
          technicalLimitApplied: !!run.technicalLimitApplied,
          targetContextReport: Array.isArray(run.targetContextReport) ? run.targetContextReport : [],
          evidenceProvenance: "REAL_LLM_CALL",
        };
      }
      return {
        runId: "r" + (i + 1), date: new Date().toISOString(), provider: "anthropic", model: "claude-sonnet-4-6",
        promptVersion: "EF01B-discipline-resolver-v2", missionId: missionId, inputHash: "1".repeat(64), rawResponseHash: "2".repeat(64),
        proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, technicalLimitApplied: false, targetContextReport: [],
        evidenceProvenance: "SYNTHETIC_FIXTURE",
      };
    }),
  };
}

async function buildSearchProtocolForMission(deps, missionId, idSuffix, disciplines, provenance) {
  const sha256LikeRealSearchProtocol = deps.sha256LikeRealSearchProtocol;
  const mode = resolveMode(provenance);
  const realPlanner = provenance && provenance.plannerRun;
  if (mode === "REAL") {
    const missing = [];
    ["provider", "model", "promptVersion", "date"].forEach(function (f) { if (!realPlanner || typeof realPlanner[f] !== "string" || !realPlanner[f].trim()) missing.push(f); });
    if (!realPlanner || !isSha256Hex(realPlanner.inputHash)) missing.push("inputHash");
    if (!realPlanner || !isSha256Hex(realPlanner.rawResponseHash)) missing.push("rawResponseHash");
    if (missing.length) {
      throw operatorInputRequired("SearchProtocol (EF-01C1) requiert un plannerRun REEL fourni par l'operateur — champ(s) manquant(s) ou invalide(s) : " + missing.join(", ") + ".");
    }
  }
  const sourcesActivees = [{ connectorId: "openalex", label: "OpenAlex", access: "", constraint: "", active: true, justification: "Justification." }];
  const requetesExactes = disciplines.map(function (d, i) { return { id: "q" + (i + 1), connectorId: "openalex", discipline: d, requete: d, justification: "Requete pour la dimension " + d + "." }; });
  // Cardinalite exigee par le validateur reel (validateEF01C1Output) :
  // retrievalPolicies.length === sourcesActivees.length (une politique par
  // SOURCE active, jamais par discipline) — un seul connecteur openalex
  // actif ici, donc une seule politique, quel que soit le nombre de
  // disciplines/requetes.
  const retrievalPolicies = [{ connectorId: "openalex", requete: disciplines.join(", "), sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "maxResults atteint", retryPolicy: "2 tentatives", rateLimitPolicy: "1000 req/s", budgetMax: "budget raisonnable" }];
  const protoBase = {
    schema: "EvidenceForge.SearchProtocol", schemaVersion: "EF-01C1-v1", id: "protocol-" + idSuffix, missionId: missionId,
    disciplinesRetenues: disciplines, sourcesActivees: sourcesActivees, requetesExactes: requetesExactes,
    fenetreTemporelle: { debut: "", fin: "" }, langues: [], typesDocumentsAdmis: [],
    criteresInclusion: ["Pertinence a la mission."], criteresExclusion: ["Hors sujet."],
    regleDedoublonnage: "DOI.", methodeQualification: "Qualitative.",
    retrievalPolicies: retrievalPolicies,
    statut: "figé", createdAt: new Date().toISOString(), validatedAt: new Date().toISOString(), frozenAt: new Date().toISOString(),
    humanValidation: { validatedAt: new Date().toISOString(), commentaire: "Revu (MONO-08)." },
    evidenceProvenance: mode === "REAL" ? "REAL_LLM_CALL" : "SYNTHETIC_FIXTURE",
    plannerRuns: mode === "REAL"
      ? [{ runId: "planner-" + idSuffix, date: realPlanner.date, provider: realPlanner.provider, model: realPlanner.model, promptVersion: realPlanner.promptVersion, missionId: missionId, inputHash: realPlanner.inputHash, rawResponseHash: realPlanner.rawResponseHash, evidenceProvenance: "REAL_LLM_CALL" }]
      : [{ runId: "planner-" + idSuffix, date: new Date().toISOString(), provider: "anthropic", model: "claude-sonnet-4-6", promptVersion: "EF01C1-search-planner-v2-compact", missionId: missionId, inputHash: "3".repeat(64), rawResponseHash: "4".repeat(64), evidenceProvenance: "SYNTHETIC_FIXTURE" }],
  };
  const protocolHash = await sha256LikeRealSearchProtocol(protoBase);
  return Object.assign({}, protoBase, { protocolHash: protocolHash });
}

function buildOpenAlexConnectorRunner(deps, sourceId, fetchImpl) {
  const createOpenAlexRunner = deps.createOpenAlexRunner;
  return createOpenAlexRunner({ fetchImpl: fetchImpl, genId: function () { return sourceId; }, nowIso: function () { return new Date().toISOString(); } });
}
function buildScreeningArtifactForMission(sourceIds, protocolHash, provenance) {
  const mode = resolveMode(provenance);
  const realDecisions = provenance && provenance.auditDecisions; // objet { [sourceId]: { acteur:"human", date, decision, justification, ... } }
  if (mode === "REAL") {
    const missing = sourceIds.filter(function (id) { return !realDecisions || !realDecisions[id]; });
    if (missing.length) {
      throw operatorInputRequired(
        "ScreeningArtifact (EF-01D) requiert une decision humaine REELLE pour chaque source (manquante(s) : " + missing.join(", ") +
        ") — jamais d'acteur=\"human\" invente en mode REAL."
      );
    }
    sourceIds.forEach(function (id) {
      const d = realDecisions[id];
      const invalid = !d || d.acteur !== "human" || typeof d.justification !== "string" || !d.justification.trim() ||
        typeof d.date !== "string" || !d.date.trim() || ["inclus", "exclu", "doublon"].indexOf(d.decision) === -1;
      if (invalid) {
        throw operatorInputRequired("ScreeningArtifact: decision reelle fournie pour \"" + id + "\" incomplete ou invalide (acteur=\"human\", justification, date, decision requis).");
      }
    });
  }
  const sources = sourceIds.map(function (id) {
    const real = mode === "REAL" ? realDecisions[id] : null;
    return {
      id: id, titre: "Source " + id, auteurOuOrganisme: "", date: "", reference: "", discipline: "MONO-08", theme: "",
      provenance: { connectorId: "openalex", connectorType: "api", retrievalMethod: "automatic", originalReference: null },
      qualification: null, dependancesConnues: [], extraitUtilise: "", dateConsultation: new Date().toISOString(),
      statutScreening: real ? real.decision : "inclus",
      motifExclusion: real && (real.decision === "exclu" || real.decision === "doublon") ? real.justification : "",
      screeningDecisionRef: "dec-" + id,
    };
  });
  return {
    evidenceProvenance: mode === "REAL" ? "REAL_HUMAN_ACTION" : "SYNTHETIC_FIXTURE",
    sourcesScreening: sources,
    auditDecisions: sources.map(function (s) {
      const real = mode === "REAL" ? realDecisions[s.id] : null;
      return {
        decisionId: s.screeningDecisionRef, typeDecision: "screening_inclusion", date: real ? real.date : new Date().toISOString(), acteur: "human",
        modelProvider: null, modelId: null, promptVersion: null, protocolRef: protocolHash, inputSourceRef: s.id,
        decision: real ? real.decision : "inclus", justification: real ? real.justification : "Pertinent (MONO-08).",
        confidenceQualitative: real ? (real.confidenceQualitative || "humaine") : "humaine",
        humanOverride: real ? (real.humanOverride || null) : null,
        evidenceProvenance: mode === "REAL" ? "REAL_HUMAN_ACTION" : "SYNTHETIC_FIXTURE",
      };
    }),
    completedAt: new Date().toISOString(),
  };
}

function buildQualificationArtifactForMission(deps, screeningArtifact, searchProtocol) {
  const generateQualificationTestArtifact = deps.generateQualificationTestArtifact;
  const ef01dOutputApprox = Object.assign({}, screeningArtifact, { stage: "EF-01D", searchProtocol: searchProtocol });
  return Object.assign({}, generateQualificationTestArtifact(ef01dOutputApprox, { nowIso: function () { return new Date().toISOString(); } }), { completedAt: new Date().toISOString() });
}

function buildEF01AInjectedForMission(missionId, documentBytesByHash, mission) {
  const targetDocuments = mission.targetDocuments.map(function () {
    return { id: "doc-" + Math.random().toString(36).slice(2, 8), ajouteLe: new Date().toISOString() };
  });
  return { metadata: { missionId: missionId, dateCreation: new Date().toISOString(), documents: { targetDocuments: targetDocuments, suppliedEvidence: [] } }, documentBytes: documentBytesByHash };
}

function buildEF01FInjectedForMission(idSuffix) {
  return { corpusId: "corpus-" + idSuffix, dateGel: new Date().toISOString(), completedAt: new Date().toISOString() };
}

module.exports = {
  loadEForchDeps: loadEForchDeps,
  buildConfirmedRunContractForMission: buildConfirmedRunContractForMission,
  buildResolverTraceForMission: buildResolverTraceForMission,
  buildSearchProtocolForMission: buildSearchProtocolForMission,
  buildOpenAlexConnectorRunner: buildOpenAlexConnectorRunner,
  buildScreeningArtifactForMission: buildScreeningArtifactForMission,
  buildQualificationArtifactForMission: buildQualificationArtifactForMission,
  buildEF01AInjectedForMission: buildEF01AInjectedForMission,
  buildEF01FInjectedForMission: buildEF01FInjectedForMission,
};
