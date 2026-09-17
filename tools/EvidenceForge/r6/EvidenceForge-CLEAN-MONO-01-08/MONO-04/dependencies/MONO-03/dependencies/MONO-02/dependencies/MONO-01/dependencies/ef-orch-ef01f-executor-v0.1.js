// EvidenceForge — EF-ORCH-03K — Exécuteur EF-01F — v0.1
//
// Dernier module du pipeline EF-01. Contrairement à D et E, aucun artefact
// externe n'est requis ici : statistiquesFlux, testMode/scientificValidity et
// hashOuChecksum sont tous déterministes à partir de la sortie EF-01E validée.
// Seules deux métadonnées volatiles (id du corpus, dateGel) doivent être
// injectées — jamais générées silencieusement ici (Date.now() dans le vrai
// module, comme partout ailleurs dans EF-ORCH).
"use strict";

const { validateEF01EOutput, sha256LikeRealCorpusSnapshot } = require("./ef-orch-ef01-output-contracts-v0.1.js");

function str(v) {
  return String(v == null ? "" : v).trim();
}

// ---------------------------------------------------------------------------
// connectorStats / disciplineStats — copiés fidèlement du vrai EF-01F.
// ---------------------------------------------------------------------------
function connectorStats(srcs) {
  const map = {};
  srcs.forEach((s) => {
    const k = str(s.provenance && s.provenance.connectorId) || "unknown";
    if (!map[k]) map[k] = { total: 0, incluses: 0, exclues: 0, doublons: 0 };
    map[k].total++;
    if (s.statutScreening === "inclus") map[k].incluses++;
    else if (s.statutScreening === "exclu") map[k].exclues++;
    else if (s.statutScreening === "doublon") map[k].doublons++;
  });
  return map;
}
function disciplineStats(srcs) {
  const map = {};
  srcs.forEach((s) => {
    const k = str(s.discipline) || "non_attribuée";
    if (!map[k]) map[k] = { total: 0, incluses: 0, exclues: 0, doublons: 0 };
    map[k].total++;
    if (s.statutScreening === "inclus") map[k].incluses++;
    else if (s.statutScreening === "exclu") map[k].exclues++;
    else if (s.statutScreening === "doublon") map[k].doublons++;
  });
  return map;
}

// ---------------------------------------------------------------------------
// buildEF01FOutputFromEF01E(ef01eOutput, { corpusId, dateGel })
// corpusId et dateGel : métadonnées volatiles injectées, jamais générées ici.
// ---------------------------------------------------------------------------
async function buildEF01FOutputFromEF01E(ef01eOutput, injected) {
  if (!validateEF01EOutput(ef01eOutput, { allowTestMode: true })) {
    throw new Error("buildEF01FOutputFromEF01E: ef01eOutput fourni n'est pas une sortie EF-01E valide (mode TEST autorisé).");
  }
  const inj = injected || {};
  if (!str(inj.corpusId)) {
    throw new Error("buildEF01FOutputFromEF01E: injected.corpusId manquant — l'identifiant du corpus est une métadonnée volatile qui doit être injectée, jamais générée ici.");
  }
  if (!str(inj.dateGel)) {
    throw new Error("buildEF01FOutputFromEF01E: injected.dateGel manquant — même règle que corpusId.");
  }
  const completedAt = str(inj.completedAt);
  if (!completedAt) {
    throw new Error("buildEF01FOutputFromEF01E: injected.completedAt manquant — métadonnée volatile, jamais générée ici (Date.now() interdit).");
  }

  const sources = ef01eOutput.sourcesQualified;
  const testMode = !!(ef01eOutput.qualificationSummary && ef01eOutput.qualificationSummary.testMode === true);

  const base = {
    schema: "EvidenceForge.CorpusSnapshot",
    schemaVersion: "EF-01F-v1",
    id: str(inj.corpusId),
    missionId: ef01eOutput.id,
    dateGel: str(inj.dateGel),
    protocolRef: (ef01eOutput.searchProtocol && ef01eOutput.searchProtocol.protocolHash) || null,
    targetDocumentsRef: (ef01eOutput.targetDocuments || []).map((d) => ({ id: d.id, nom: d.nom, hashSha256: d.hashSha256 || null })),
    sources,
    auditDecisions: ef01eOutput.auditDecisions,
    statistiquesFlux: {
      total: sources.length,
      incluses: sources.filter((s) => s.statutScreening === "inclus").length,
      exclues: sources.filter((s) => s.statutScreening === "exclu").length,
      doublons: sources.filter((s) => s.statutScreening === "doublon").length,
      parConnecteur: connectorStats(sources),
      parDiscipline: disciplineStats(sources)
    },
    testMode,
    scientificValidity: testMode ? false : true,
    warning: testMode ? "PIPELINE TEST ONLY — ce corpus provient de décisions de screening et qualifications de test ; aucune interprétation scientifique." : null
  };

  const hashOuChecksum = await sha256LikeRealCorpusSnapshot(base);
  const corpusSnapshot = { ...base, hashOuChecksum };

  const output = {
    ...ef01eOutput,
    stage: "EF-01F",
    stageVersion: "EF-01F-v1",
    corpusSnapshot,
    corpusFreezeSummary: {
      frozen: true,
      testMode: corpusSnapshot.testMode,
      scientificValidity: corpusSnapshot.scientificValidity,
      hashOuChecksum: corpusSnapshot.hashOuChecksum,
      completedAt
    }
  };
  delete output.sourcesQualified; // conforme au vrai export ($("#freeze").onclick : delete out.sourcesQualified)
  return output;
}

// ---------------------------------------------------------------------------
// createEF01FExecutor(injected) -> executor(input)
// `input` attendu = sortie EF-01E (pipeline inputFrom:["EF-01E"]).
// ---------------------------------------------------------------------------
function createEF01FExecutor(injected) {
  return async function ef01fExecutor(input) {
    const output = await buildEF01FOutputFromEF01E(input, injected);
    return { status: "ok", output };
  };
}

const EFOrchEF01FExecutor = { buildEF01FOutputFromEF01E, createEF01FExecutor };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01FExecutor;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01FExecutor = EFOrchEF01FExecutor;
}
