// EvidenceForge — EF-02D3 — Coverage Matrix & Panel Selection — v1
//
// Remplace la chaîne historique Resume→Adjudication→Fusion (réparation
// incrémentale d'un run JMJS spécifique) par un moteur générique qui
// possède NATIVEMENT la capacité "ne rejouer que les éléments manquants ou
// invalides, fusionner sans jamais toucher un résultat déjà valide" —
// disponible pour n'importe quelle mission, jamais spécifique à D4/D5.
//
// Chaque entrée de dimension dans la matrice porte TROIS informations
// distinctes, jamais fusionnées :
//   level            — force de la COUVERTURE documentaire (jugement propre à D3)
//   relevanceStatus  — pertinence mission pour CETTE dimension (reporté depuis D2)
//   epistemicStatus  — niveau de preuve du jugement D2 sous-jacent (reporté depuis D2)
//
// LEVELS est un vocabulaire épistémique UNIVERSEL (fort/modéré/faible/absent/
// indéterminable), pas une donnée de mission — il reste fixe, à la différence
// des dimensions elles-mêmes qui viennent toujours de MissionDimensionSet.
"use strict";

const LEVELS = ["strong", "moderate", "weak", "absent", "not_determinable"];
const LV = { strong: 3, moderate: 2, weak: 1, absent: 0, not_determinable: 0 };

function arr(v) { return Array.isArray(v) ? v : []; }
function str(v) { return String(v == null ? "" : v).trim(); }

function assertDimensionSet(dimensionSet) {
  if (!dimensionSet || dimensionSet.schema !== "EvidenceForge.MissionDimensionSet" || dimensionSet.schemaVersion !== "EF-PR-GEN-v1" || !Array.isArray(dimensionSet.dimensions) || !dimensionSet.dimensions.length) {
    throw new Error("EF-02D3: MissionDimensionSet invalide ou manquant — aucune dimension codée en dur n'est utilisée.");
  }
}
const REQUIRED_D3_POLICY_KEYS = ["coverageThreshold", "maxPanel", "minMarginalGain", "redundancyPenalty"];
function assertPolicy(heuristicPolicy) {
  if (!heuristicPolicy || heuristicPolicy.schema !== "EvidenceForge.HeuristicPolicy" || heuristicPolicy.schemaVersion !== "EF-PR-GEN-v1") {
    throw new Error("EF-02D3: HeuristicPolicy invalide ou manquante — aucun seuil de secours codé en dur n'est utilisé.");
  }
  const missing = REQUIRED_D3_POLICY_KEYS.filter((k) => !(k in heuristicPolicy.values));
  if (missing.length) throw new Error("EF-02D3: HeuristicPolicy incomplète — clés manquantes : " + missing.join(", ") + ".");
}
function thresholdValue(heuristicPolicy) { return LV[heuristicPolicy.values.coverageThreshold] ?? 2; }

function judgmentsByDimension(record) {
  const list = Array.isArray(record.dimensionRelevance) ? record.dimensionRelevance : [];
  return new Map(list.map((j) => [j.dimensionId, j]));
}

function corpusWorkRefs(corpus) {
  return arr(corpus && corpus.corpus && corpus.corpus.works).map((w) => ({ title: w.title || null, doi: w.doi || null }));
}
function compactWorksForPrompt(corpus, maxWorks) {
  const works = arr(corpus && corpus.corpus && corpus.corpus.works).slice(0, maxWorks || 15);
  return works.map((w) => ({
    title: w.title || null, doi: w.doi || null, year: w.publicationYear || null,
    topics: arr(w.topics).slice(0, 5).map((t) => t.name).filter(Boolean)
  }));
}

// ---------------------------------------------------------------------------
// Prompt & parsing — générés dynamiquement depuis dimensionSet, jamais un
// gabarit déroulé à la main pour un nombre de dimensions fixe. Le CORPUS RÉEL
// (travaux) est inclus explicitement : sans lui, le LLM n'aurait rien à
// regarder pour juger la couverture — c'est le même corpus déjà utilisé par
// EF-02D2, jamais du texte inventé.
// ---------------------------------------------------------------------------
function buildCoveragePrompt(record, corpus, dimensionSet, missionQuestion) {
  assertDimensionSet(dimensionSet);
  const byDim = judgmentsByDimension(record);
  const dimBlock = dimensionSet.dimensions.map((d) => {
    const j = byDim.get(d.id);
    const d2Info = j ? ` [EF-02D2 déjà établi : pertinence=${j.relevanceStatus}, preuve=${j.epistemicStatus}]` : "";
    return d.id + ": " + d.label + " — " + d.definition + d2Info;
  }).join("\n");
  const template = dimensionSet.dimensions.map((d) =>
    `{"id":"${d.id}","level":"strong|moderate|weak|absent|not_determinable","evidenceWorks":["titre exact ou DOI exact tiré du corpus"],"rationale":"...","contradictionWithMissing":false}`
  ).join(",\n");
  const works = compactWorksForPrompt(corpus);

  return `Tu es EvidenceForge EF-02D3. Évalue la COUVERTURE DOCUMENTAIRE (force des preuves disponibles) du corpus suivant pour chacune des ${dimensionSet.dimensions.length} dimensions de la mission.

MISSION
${str(missionQuestion)}

DIMENSIONS (avec le jugement de pertinence déjà établi en EF-02D2, à titre de contexte uniquement — tu juges ici la COUVERTURE, pas la pertinence)
${dimBlock}

CORPUS DOCUMENTAIRE RÉEL DU PROFESSIONNEL (métadonnées réelles uniquement)
${JSON.stringify({ professionalRef: record.professionalRef, displayName: record.displayName, works })}

RÈGLES STRICTES
1. Évalue uniquement ce que les éléments fournis DOCUMENTENT. N'infère jamais une opinion réelle du professionnel.
2. "strong" = plusieurs preuves documentaires directes et substantielles. "moderate" = au moins une preuve directe substantielle. "weak" = lien indirect ou analogique. "absent" = aucun élément positif identifiable. "not_determinable" = données insuffisantes ou contradictoires.
3. Ne crédite jamais une dimension uniquement parce que son vocabulaire apparaît dans la rationale.
4. Si EF-02D2 a établi relevanceStatus="mission_irrelevant" pour une dimension, la couverture peut néanmoins être documentée si des preuves existent — la couverture et la pertinence restent deux jugements distincts.
5. evidenceWorks ne doit contenir QUE des titres ou DOI EXACTS présents dans le corpus fourni ci-dessus — jamais un titre inventé ou reformulé.

Retourne UNIQUEMENT ce JSON valide :
{"professionalRef":${JSON.stringify(record.professionalRef)},"dimensions":[
${template}
],"overallNote":"..."}`;
}

function parseCoverageJudgment(text, dimensionSet, expectedRef, corpus) {
  assertDimensionSet(dimensionSet);
  const s = str(text).replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("EF-02D3: JSON introuvable.");
  const d = JSON.parse(s.slice(a, b + 1));
  d.professionalRef = expectedRef;
  if (!Array.isArray(d.dimensions) || d.dimensions.length !== dimensionSet.dimensions.length) {
    throw new Error("EF-02D3: " + dimensionSet.dimensions.length + " dimensions attendues.");
  }
  const validIds = new Set(dimensionSet.dimensions.map((x) => x.id));
  const knownRefs = corpus ? new Set(corpusWorkRefs(corpus).flatMap((w) => [w.title, w.doi]).filter(Boolean)) : null;
  const seen = new Set();
  for (const x of d.dimensions) {
    if (!validIds.has(x.id) || seen.has(x.id) || !LEVELS.includes(x.level)) throw new Error("EF-02D3: dimension/level invalide (\"" + x.id + "\"/\"" + x.level + "\").");
    seen.add(x.id);
    if (!Array.isArray(x.evidenceWorks)) x.evidenceWorks = [];
    if (typeof x.rationale !== "string") x.rationale = "";
    if (knownRefs) {
      for (const ref of x.evidenceWorks) {
        if (!knownRefs.has(ref)) throw new Error("EF-02D3: evidenceWorks contient une référence absente du corpus (\"" + ref + "\") — aucune preuve inventée n'est acceptée.");
      }
    }
  }
  return d;
}

// Enrichit chaque entrée de dimension de la matrice avec relevanceStatus et
// epistemicStatus reportés depuis EF-02D2 — jamais fusionnés avec level,
// toujours trois champs distincts et consultables séparément.
function enrichWithD2(coverageDims, record) {
  const byDim = judgmentsByDimension(record);
  return coverageDims.map((x) => {
    const j = byDim.get(x.id);
    return { ...x, relevanceStatus: j ? j.relevanceStatus : "not_determinable", epistemicStatus: j ? j.epistemicStatus : "not_determinable" };
  });
}

async function evaluateCoverageOne(record, corpus, dimensionSet, missionQuestion, workerCallFn) {
  if (typeof workerCallFn !== "function") throw new Error("EF-02D3: workerCallFn manquant.");
  const prompt = buildCoveragePrompt(record, corpus, dimensionSet, missionQuestion);
  let text = await workerCallFn(prompt);
  try {
    const d = parseCoverageJudgment(text, dimensionSet, record.professionalRef, corpus);
    return { professionalRef: d.professionalRef, dimensions: enrichWithD2(d.dimensions, record), overallNote: d.overallNote || "", jsonRepairUsed: false, error: null };
  } catch (firstErr) {
    try {
      text = await workerCallFn("Répare uniquement ce JSON pour respecter exactement le schéma demandé, sans changer le sens. Retourne uniquement le JSON valide.\n\n" + text);
      const d = parseCoverageJudgment(text, dimensionSet, record.professionalRef, corpus);
      return { professionalRef: d.professionalRef, dimensions: enrichWithD2(d.dimensions, record), overallNote: d.overallNote || "", jsonRepairUsed: true, error: null };
    } catch (secondErr) {
      return { professionalRef: record.professionalRef, dimensions: [], overallNote: "", error: secondErr.message };
    }
  }
}

// ---------------------------------------------------------------------------
// isValidEvaluation — critère générique pour la reprise (jamais spécifique
// à D4/D5) : une évaluation est valide si elle ne porte pas d'erreur et
// couvre exactement les dimensions attendues, avec les trois champs présents.
// ---------------------------------------------------------------------------
function isValidEvaluation(evaluation, dimensionSet) {
  if (!evaluation || evaluation.error) return false;
  if (!Array.isArray(evaluation.dimensions) || evaluation.dimensions.length !== dimensionSet.dimensions.length) return false;
  const validIds = new Set(dimensionSet.dimensions.map((x) => x.id));
  return evaluation.dimensions.every((x) => validIds.has(x.id) && LEVELS.includes(x.level) && "relevanceStatus" in x && "epistemicStatus" in x);
}

function makeMatrix(evaluations, dimensionSet, missionQuestion) {
  return {
    schema: "EvidenceForge.CoverageMatrix",
    schemaVersion: "EF-02D3-v4",
    missionQuestion: missionQuestion || null,
    dimensions: dimensionSet.dimensions,
    evaluations,
    generatedAt: new Date().toISOString(),
    testMode: true,
    scientificValidity: false
  };
}

// ---------------------------------------------------------------------------
// buildCoverageMatrix — construction complète, fraîche.
// corpusByRef : Map<professionalRef, ProfessionalCorpus> — permet à D3
// d'accéder au corpus réel (travaux) de chaque professionnel usable.
// ---------------------------------------------------------------------------
async function buildCoverageMatrix(usableRecords, corpusByRef, dimensionSet, missionQuestion, workerCallFn) {
  assertDimensionSet(dimensionSet);
  const evaluations = [];
  for (const record of usableRecords) evaluations.push(await evaluateCoverageOne(record, corpusByRef.get(record.professionalRef), dimensionSet, missionQuestion, workerCallFn));
  return makeMatrix(evaluations, dimensionSet, missionQuestion);
}

// ---------------------------------------------------------------------------
// resumeCoverageMatrix — CAPACITÉ GÉNÉRIQUE (pas liée à D4/D5) : identifie
// les professionnels de usableRecords sans évaluation VALIDE dans
// existingMatrix, ne (ré)évalue QUE ceux-là, fusionne SANS jamais toucher
// une évaluation déjà valide (même référence d'objet conservée).
// ---------------------------------------------------------------------------
async function resumeCoverageMatrix(existingMatrix, usableRecords, corpusByRef, dimensionSet, missionQuestion, workerCallFn) {
  assertDimensionSet(dimensionSet);
  const existingByRef = new Map(arr(existingMatrix && existingMatrix.evaluations).map((e) => [e.professionalRef, e]));
  const missing = usableRecords.filter((r) => !isValidEvaluation(existingByRef.get(r.professionalRef), dimensionSet));

  const newlyEvaluated = [];
  for (const record of missing) newlyEvaluated.push(await evaluateCoverageOne(record, corpusByRef.get(record.professionalRef), dimensionSet, missionQuestion, workerCallFn));

  const merged = usableRecords.map((r) => {
    const existing = existingByRef.get(r.professionalRef);
    if (isValidEvaluation(existing, dimensionSet)) return existing;
    return newlyEvaluated.find((e) => e.professionalRef === r.professionalRef) || { professionalRef: r.professionalRef, dimensions: [], overallNote: "", error: "not_evaluated" };
  });

  return {
    ...makeMatrix(merged, dimensionSet, missionQuestion || (existingMatrix && existingMatrix.missionQuestion)),
    resumeSummary: { totalUsable: usableRecords.length, alreadyValid: usableRecords.length - missing.length, reEvaluated: missing.length, stillInvalid: merged.filter((e) => e.error).length }
  };
}

// ---------------------------------------------------------------------------
// selectPanel — greedy weighted set-cover. maxPanel est un PLAFOND de
// sécurité TEST, jamais un objectif ; la boucle s'arrête dès que le gain
// marginal descend sous minMarginalGain, quel que soit le nombre de
// professionnels déjà retenus (y compris zéro — panel vide possible).
// ---------------------------------------------------------------------------
function selectPanel(matrix, dimensionSet, heuristicPolicy) {
  assertDimensionSet(dimensionSet);
  assertPolicy(heuristicPolicy);
  const thr = thresholdValue(heuristicPolicy);
  const max = Math.max(0, heuristicPolicy.values.maxPanel);
  const minGain = heuristicPolicy.values.minMarginalGain;
  const redPenalty = heuristicPolicy.values.redundancyPenalty;

  const rows = arr(matrix.evaluations).filter((e) => !e.error);
  const chosen = [], covered = new Set(), trace = [];

  while (chosen.length < max) {
    let best = null, bestScore = -Infinity, bestGain = 0, bestRedundancy = 0;
    for (const row of rows) {
      if (chosen.includes(row)) continue;
      let gain = 0, red = 0, strong = 0;
      for (const d of dimensionSet.dimensions) {
        const x = row.dimensions.find((z) => z.id === d.id);
        const v = LV[x && x.level] || 0;
        if (v >= thr) {
          const val = d.weight * (v / 3);
          if (!covered.has(d.id)) gain += val; else red += val;
          if (v === 3) strong++;
        }
      }
      gain += strong * 0.03;
      const objective = gain - redPenalty * red;
      if (!best || objective > bestScore) { best = row; bestScore = objective; bestGain = gain; bestRedundancy = red; }
    }
    if (!best || bestGain < minGain) break;
    chosen.push(best);
    for (const d of dimensionSet.dimensions) {
      const x = best.dimensions.find((z) => z.id === d.id);
      if ((LV[x && x.level] || 0) >= thr) covered.add(d.id);
    }
    trace.push({ rank: chosen.length, professionalRef: best.professionalRef, gain: +bestGain.toFixed(4), redundancy: +bestRedundancy.toFixed(4), score: +bestScore.toFixed(4) });
    if (covered.size === dimensionSet.dimensions.length) break;
  }

  const coverageSummary = {};
  for (const d of dimensionSet.dimensions) {
    coverageSummary[d.id] = {
      label: d.label,
      providers: chosen.filter((p) => { const x = p.dimensions.find((z) => z.id === d.id); return (LV[x && x.level] || 0) >= thr; }).map((p) => p.professionalRef)
    };
  }

  return {
    schema: "EvidenceForge.PanelSelection",
    schemaVersion: "EF-02D3-PANEL-v4",
    missionQuestion: matrix.missionQuestion || null,
    selectionPolicy: {
      algorithm: "greedy weighted set-cover over coverage judgments",
      coverageThreshold: heuristicPolicy.values.coverageThreshold,
      maxPanel: heuristicPolicy.values.maxPanel,
      minMarginalGain: heuristicPolicy.values.minMarginalGain,
      redundancyPenalty: heuristicPolicy.values.redundancyPenalty,
      heuristicPolicyId: heuristicPolicy.policyId,
      heuristicPolicyStatus: heuristicPolicy.status,
      fixedQuota: false,
      noPrestigeWeighting: true,
      noVoting: true
    },
    dimensions: dimensionSet.dimensions,
    selectedPanel: chosen.map((p, i) => ({ rank: i + 1, professionalRef: p.professionalRef, dimensionJudgments: p.dimensions, overallNote: p.overallNote || "" })),
    selectionTrace: trace,
    coverageSummary,
    summary: {
      panelSize: chosen.length,
      coveredDimensions: Object.values(coverageSummary).filter((c) => c.providers.length).length,
      uncoveredDimensions: Object.entries(coverageSummary).filter(([, c]) => !c.providers.length).map(([id]) => id),
      testMode: true, scientificValidity: false, humanProfessionalValidation: false
    },
    testMode: true, scientificValidity: false, humanProfessionalValidation: false
  };
}

const EF02D3CoveragePanel = {
  LEVELS, LV,
  buildCoveragePrompt, parseCoverageJudgment, evaluateCoverageOne,
  isValidEvaluation, buildCoverageMatrix, resumeCoverageMatrix,
  selectPanel
};

if (typeof module !== "undefined" && module.exports) module.exports = EF02D3CoveragePanel;
if (typeof window !== "undefined") window.EF02D3CoveragePanel = EF02D3CoveragePanel;
