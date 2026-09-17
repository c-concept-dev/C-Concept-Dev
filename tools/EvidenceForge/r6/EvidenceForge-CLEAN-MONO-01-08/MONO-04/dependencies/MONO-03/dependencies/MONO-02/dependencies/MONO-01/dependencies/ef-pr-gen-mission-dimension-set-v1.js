// EvidenceForge — EF-PR-GEN-01 — MissionDimensionSet — v1
//
// Brique additive, séparée de EF-ORCH v0.1 (jamais rouvert). Remplace les
// copies dupliquées de la constante DIMS trouvées dans EF-02D3 (x2) et
// EF-03C — dont l'une avait déjà divergé de l'autre (un mot perdu dans le
// libellé de d9) — par une source unique, injectée, sans nombre de
// dimensions fixé (jamais "10" en dur).
"use strict";

const { sha256CanonicalJson } = require("./ef-orch-hash-v0.1.js");

function str(v) { return String(v == null ? "" : v).trim(); }

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

// ---------------------------------------------------------------------------
// buildMissionDimensionSet({missionId, dimensions, createdAt})
// Ne génère JAMAIS le contenu des dimensions elle-même (aucun appel LLM ici
// — la découverte de dimensions reste hors périmètre de ce lot). Valide,
// hash, DEEP FREEZE (le hash reste revérifiable après sérialisation/
// rechargement, puisque sha256CanonicalJson opère sur la forme sérialisée,
// jamais sur l'objet en mémoire lui-même).
// ---------------------------------------------------------------------------
async function buildMissionDimensionSet({ missionId, dimensions, createdAt }) {
  const mid = str(missionId);
  if (!mid) throw new Error("buildMissionDimensionSet: missionId manquant.");
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error("buildMissionDimensionSet: dimensions[] manquant ou vide.");
  }
  const seenIds = new Set();
  const cleaned = dimensions.map((d, i) => {
    const id = str(d && d.id), label = str(d && d.label), definition = str(d && d.definition);
    const weight = d && d.weight;
    if (!id) throw new Error("buildMissionDimensionSet: dimension #" + i + " sans id.");
    if (seenIds.has(id)) throw new Error("buildMissionDimensionSet: id de dimension dupliqué (\"" + id + "\").");
    seenIds.add(id);
    if (!label) throw new Error("buildMissionDimensionSet: dimension \"" + id + "\" sans label.");
    if (!definition) throw new Error("buildMissionDimensionSet: dimension \"" + id + "\" sans definition.");
    if (typeof weight !== "number" || !(weight > 0)) {
      throw new Error("buildMissionDimensionSet: dimension \"" + id + "\" — weight doit être un nombre strictement positif.");
    }
    return { id, label, definition, weight };
  });
  const ca = str(createdAt);
  if (!ca) throw new Error("buildMissionDimensionSet: createdAt manquant — jamais généré ici (Date.now() interdit).");

  const dimensionSetHash = await sha256CanonicalJson(cleaned);
  return deepFreeze({
    schema: "EvidenceForge.MissionDimensionSet",
    schemaVersion: "EF-PR-GEN-v1",
    missionId: mid,
    dimensions: cleaned,
    createdAt: ca,
    dimensionSetHash
  });
}

// ---------------------------------------------------------------------------
// validateMissionDimensionSet(d) -> Promise<boolean> — revérifie le hash,
// rejette toute incohérence structurelle.
// ---------------------------------------------------------------------------
async function validateMissionDimensionSet(d) {
  if (!d || d.schema !== "EvidenceForge.MissionDimensionSet" || d.schemaVersion !== "EF-PR-GEN-v1") return false;
  if (!Array.isArray(d.dimensions) || d.dimensions.length === 0) return false;
  const recomputed = await sha256CanonicalJson(d.dimensions);
  return recomputed === d.dimensionSetHash;
}

// ---------------------------------------------------------------------------
// renderDimensionsBlock(dimensionSet) — génère dynamiquement le bloc texte
// "DIMENSIONS\n..." pour un prompt. Jamais un identifiant littéral déroulé
// à la main (corrige le défaut trouvé dans le prompt historique de D3).
// ---------------------------------------------------------------------------
function renderDimensionsBlock(dimensionSet) {
  if (!dimensionSet || !Array.isArray(dimensionSet.dimensions)) {
    throw new Error("renderDimensionsBlock: MissionDimensionSet invalide.");
  }
  return dimensionSet.dimensions.map((d) => d.id + ": " + d.label + " — " + d.definition).join("\n");
}

// ---------------------------------------------------------------------------
// renderDimensionJudgmentTemplate(dimensionSet) — génère dynamiquement le
// gabarit JSON de sortie attendu du LLM, un bloc par dimension. Corrige
// précisément le défaut historique où d1...d10 étaient répétés à la main.
// ---------------------------------------------------------------------------
function renderDimensionJudgmentTemplate(dimensionSet) {
  if (!dimensionSet || !Array.isArray(dimensionSet.dimensions)) {
    throw new Error("renderDimensionJudgmentTemplate: MissionDimensionSet invalide.");
  }
  const blocks = dimensionSet.dimensions.map((d) =>
    '{"id":"' + d.id + '","level":"strong|moderate|weak|absent|not_determinable","evidenceWorks":["titre exact"],"rationale":"...","contradictionWithMissing":false}'
  );
  return "[\n" + blocks.join(",\n") + "\n]";
}

const EFPrGenMissionDimensionSet = {
  buildMissionDimensionSet, validateMissionDimensionSet,
  renderDimensionsBlock, renderDimensionJudgmentTemplate
};

if (typeof module !== "undefined" && module.exports) module.exports = EFPrGenMissionDimensionSet;
if (typeof window !== "undefined") window.EFPrGenMissionDimensionSet = EFPrGenMissionDimensionSet;
