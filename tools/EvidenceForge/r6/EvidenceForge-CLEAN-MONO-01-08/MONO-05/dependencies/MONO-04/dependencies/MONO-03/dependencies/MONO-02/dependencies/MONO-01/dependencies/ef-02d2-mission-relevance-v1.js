// EvidenceForge — EF-02D2 — Mission Relevance — v1 (corrigé)
//
// Deux dimensions sémantiques ORTHOGONALES, jamais unifiées :
//   relevanceStatus  — la pertinence des documents pour la mission
//                       (mission_relevant / partially_relevant /
//                        mission_irrelevant / not_determinable)
//   epistemicStatus  — le niveau de preuve documentaire sur lequel repose
//                       CE jugement (documented / cautious_inference /
//                       not_determinable)
// Un jugement "mission_irrelevant" peut parfaitement être "documented" —
// être bien documenté ne rend pas pertinent, et être pertinent ne prouve
// pas que ce soit documenté.
//
// Un jugement est produit PAR DIMENSION (pas un seul verdict global par
// professionnel), pour que EF-02D3/EF-02E sachent, dimension par dimension,
// à la fois la pertinence et le niveau de preuve.
"use strict";

const RELEVANCE_STATUSES = ["mission_relevant", "partially_relevant", "mission_irrelevant", "not_determinable"];
const EPISTEMIC_STATUSES = ["documented", "cautious_inference", "not_determinable"];

function arr(v) { return Array.isArray(v) ? v : []; }
function str(v) { return String(v == null ? "" : v).trim(); }

function assertDimensionSet(dimensionSet) {
  if (!dimensionSet || dimensionSet.schema !== "EvidenceForge.MissionDimensionSet" || dimensionSet.schemaVersion !== "EF-PR-GEN-v1" || !Array.isArray(dimensionSet.dimensions) || !dimensionSet.dimensions.length) {
    throw new Error("EF-02D2: MissionDimensionSet invalide ou manquant — aucune dimension codée en dur n'est utilisée.");
  }
}

function corpusWorkRefs(corpus) {
  return arr(corpus.corpus && corpus.corpus.works).map((w) => ({ title: w.title || null, doi: w.doi || null }));
}

function compactWorksForPrompt(corpus, maxWorks) {
  const works = arr(corpus.corpus && corpus.corpus.works).slice(0, maxWorks);
  return works.map((w) => ({
    title: w.title || null, doi: w.doi || null, year: w.publicationYear || null,
    topics: arr(w.topics).slice(0, 5).map((t) => t.name).filter(Boolean),
    concepts: arr(w.concepts).slice(0, 5).map((c) => c.name).filter(Boolean)
  }));
}

// ---------------------------------------------------------------------------
// buildRelevancePrompt(corpus, missionQuestion, dimensionSet, opts)
// ---------------------------------------------------------------------------
function buildRelevancePrompt(corpus, missionQuestion, dimensionSet, opts) {
  assertDimensionSet(dimensionSet);
  const q = str(missionQuestion);
  if (!q) throw new Error("EF-02D2: question de mission absente.");
  const maxWorks = (opts && opts.maxWorks) || 10;
  const works = compactWorksForPrompt(corpus, maxWorks);
  const dimBlock = dimensionSet.dimensions.map((d) => d.id + ": " + d.label + " — " + d.definition).join("\n");
  const template = dimensionSet.dimensions.map((d) =>
    `{"dimensionId":"${d.id}","relevanceStatus":"mission_relevant|partially_relevant|mission_irrelevant|not_determinable","epistemicStatus":"documented|cautious_inference|not_determinable","rationale":"...","supportingWorkRefs":["titre exact ou DOI exact tiré du corpus"],"limitations":["..."]}`
  ).join(",\n");

  return `Tu es EvidenceForge EF-02D2, un classificateur CONSERVATEUR de pertinence documentaire.

MISSION
${q}

DIMENSIONS DE MISSION (source unique — ne pas en inventer d'autres, ne pas en omettre)
${dimBlock}

CORPUS DOCUMENTAIRE DU PROFESSIONNEL (métadonnées réelles uniquement)
${JSON.stringify({ displayName: corpus.identityRef && corpus.identityRef.displayName, works })}

RÈGLES STRICTES
1. Pour CHAQUE dimension ci-dessus, produis DEUX jugements séparés et indépendants :
   - relevanceStatus : la pertinence des documents POUR CETTE DIMENSION de la mission.
   - epistemicStatus : le niveau de preuve documentaire sur lequel repose TON jugement lui-même.
   Ce sont deux questions différentes. Un corpus peut être parfaitement documenté (epistemicStatus="documented") tout en étant hors sujet pour une dimension (relevanceStatus="mission_irrelevant"). L'inverse est également possible.
2. "documented" = ton jugement repose directement sur des éléments attribuables du corpus fourni (titres, résumés, métadonnées réelles).
3. "cautious_inference" = lien plausible mais indirect, non directement démontré par les métadonnées.
4. "not_determinable" (épistémique) = métadonnées insuffisantes pour trancher.
5. Si relevanceStatus="not_determinable", alors epistemicStatus doit normalement aussi être "not_determinable" (on ne peut pas juger la pertinence si on ne peut rien établir). L'inverse n'est jamais forcé : "mission_irrelevant" peut être "documented".
6. supportingWorkRefs ne doit contenir QUE des titres ou DOI EXACTS présents dans le corpus fourni — jamais un titre inventé ou reformulé.
7. N'infère jamais une compétence, une opinion ou une expertise personnelle non directement documentée.

Retourne UNIQUEMENT ce JSON valide, un objet par dimension, dans cet ordre :
{"professionalRef":${JSON.stringify(corpus.professionalRef)},"judgments":[
${template}
]}`;
}

// ---------------------------------------------------------------------------
// parseRelevanceResponse(text, dimensionSet, corpus)
// Valide strictement : une entrée par dimension, vocabulaire correct pour
// les deux statuts, cohérence not_determinable, et AUCUNE preuve inventée
// (supportingWorkRefs doit correspondre à un titre/DOI réel du corpus).
// ---------------------------------------------------------------------------
function parseRelevanceResponse(text, dimensionSet, corpus) {
  assertDimensionSet(dimensionSet);
  const s = str(text).replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("EF-02D2: JSON introuvable dans la réponse LLM.");
  const d = JSON.parse(s.slice(a, b + 1));
  if (!Array.isArray(d.judgments) || d.judgments.length !== dimensionSet.dimensions.length) {
    throw new Error("EF-02D2: " + dimensionSet.dimensions.length + " jugement(s) de dimension attendu(s).");
  }
  const validIds = new Set(dimensionSet.dimensions.map((x) => x.id));
  const knownRefs = corpus ? new Set(corpusWorkRefs(corpus).flatMap((w) => [w.title, w.doi]).filter(Boolean)) : null;
  const seen = new Set();
  for (const j of d.judgments) {
    if (!validIds.has(j.dimensionId) || seen.has(j.dimensionId)) throw new Error("EF-02D2: dimensionId invalide ou dupliqué (\"" + j.dimensionId + "\").");
    seen.add(j.dimensionId);
    if (!RELEVANCE_STATUSES.includes(j.relevanceStatus)) throw new Error("EF-02D2: relevanceStatus invalide (\"" + j.relevanceStatus + "\").");
    if (!EPISTEMIC_STATUSES.includes(j.epistemicStatus)) throw new Error("EF-02D2: epistemicStatus invalide (\"" + j.epistemicStatus + "\").");
    if (typeof j.rationale !== "string") throw new Error("EF-02D2: rationale absente pour \"" + j.dimensionId + "\".");
    if (!Array.isArray(j.supportingWorkRefs)) throw new Error("EF-02D2: supportingWorkRefs[] absent pour \"" + j.dimensionId + "\".");
    if (!Array.isArray(j.limitations)) throw new Error("EF-02D2: limitations[] absent pour \"" + j.dimensionId + "\".");
    if (j.relevanceStatus === "not_determinable" && j.epistemicStatus !== "not_determinable") {
      throw new Error("EF-02D2: incohérence pour \"" + j.dimensionId + "\" — relevanceStatus not_determinable exige epistemicStatus not_determinable.");
    }
    if (knownRefs) {
      for (const ref of j.supportingWorkRefs) {
        if (!knownRefs.has(ref)) throw new Error("EF-02D2: supportingWorkRefs contient une référence absente du corpus (\"" + ref + "\") — aucune preuve inventée n'est acceptée.");
      }
    }
  }
  d.professionalRef = corpus ? corpus.professionalRef : d.professionalRef;
  return d;
}

// ---------------------------------------------------------------------------
// evaluateMissionRelevance(corpus, missionQuestion, dimensionSet, workerCallFn, opts)
// -> {professionalRef, judgments:[{dimensionId,relevanceStatus,epistemicStatus,rationale,supportingWorkRefs,limitations}], jsonRepairUsed}
// ---------------------------------------------------------------------------
async function evaluateMissionRelevance(corpus, missionQuestion, dimensionSet, workerCallFn, opts) {
  if (typeof workerCallFn !== "function") throw new Error("EF-02D2: workerCallFn manquant — aucun appel réseau codé en dur ici.");
  const prompt = buildRelevancePrompt(corpus, missionQuestion, dimensionSet, opts);
  let text = await workerCallFn(prompt);
  try {
    const d = parseRelevanceResponse(text, dimensionSet, corpus);
    return { ...d, jsonRepairUsed: false };
  } catch (firstErr) {
    const repairPrompt = "Répare UNIQUEMENT la syntaxe ou la cohérence JSON de la réponse suivante pour respecter exactement le schéma et les règles demandées, sans changer le sens. Retourne uniquement le JSON valide.\n\n" + text;
    text = await workerCallFn(repairPrompt);
    const d = parseRelevanceResponse(text, dimensionSet, corpus);
    return { ...d, jsonRepairUsed: true };
  }
}

const EF02D2MissionRelevance = { buildRelevancePrompt, parseRelevanceResponse, evaluateMissionRelevance, RELEVANCE_STATUSES, EPISTEMIC_STATUSES };

if (typeof module !== "undefined" && module.exports) module.exports = EF02D2MissionRelevance;
if (typeof window !== "undefined") window.EF02D2MissionRelevance = EF02D2MissionRelevance;
