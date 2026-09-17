// EvidenceForge — EF-PR-GEN-01 — MissionDocumentMapping — v1
//
// Brique additive, séparée de EF-ORCH v0.1. Remplace la table codée en dur
// trouvée dans EF-03B (Review Runner + Coverage Repair) qui associait
// littéralement target-02<->motifs "S01", target-03<->motifs "S02", etc.
// AUCUNE connaissance de JMJS, S01, S02 ou d'aucune autre mission
// particulière n'existe dans ce fichier. La correspondance historique
// devient une fixture d'adaptateur séparée (voir
// ef-pr-gen-jmjs-document-mapping-fixture-v1.js), jamais réintroduite ici.
"use strict";

function str(v) { return String(v == null ? "" : v).trim(); }

function compileRegexOrThrow(pattern, context) {
  try {
    return new RegExp(pattern, "i");
  } catch (e) {
    const err = new Error("INVALID_MISSION_MAPPING: motif regex invalide fourni par la mission (" + context + " : \"" + pattern + "\") — " + e.message);
    err.code = "INVALID_MISSION_MAPPING";
    throw err;
  }
}

function norm(s) {
  return str(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const STOPWORDS = new Set(["cahier", "grille", "revue", "synthese", "reelle", "desidentifiee"]);
function tokens(s) {
  return new Set(norm(s).split(/\s+/).filter((x) => x.length > 2 && !STOPWORDS.has(x)));
}
function tokenSimilarity(a, b) {
  const A = tokens(a), B = tokens(b);
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.max(1, Math.min(A.size, B.size));
}

// ---------------------------------------------------------------------------
// buildMissionDocumentMapping({missionId, slots, ambiguityFloor})
// Toute regex invalide fournie par la mission est rejetée ICI, explicitement
// — jamais différée à l'exécution du score, où elle serait silencieusement
// ignorée. Les regex compilées sont conservées (compiledFilenamePatterns /
// compiledContentPatterns), jamais recompilées à chaque appel de score.
// ---------------------------------------------------------------------------
function buildMissionDocumentMapping({ missionId, slots, ambiguityFloor }) {
  const mid = str(missionId);
  if (!mid) throw new Error("buildMissionDocumentMapping: missionId manquant.");
  if (!Array.isArray(slots) || slots.length === 0) throw new Error("buildMissionDocumentMapping: slots[] manquant ou vide.");
  const seenIds = new Set();
  const cleaned = slots.map((s, i) => {
    const targetId = str(s && s.targetId), role = str(s && s.role);
    if (!targetId) throw new Error("buildMissionDocumentMapping: slot #" + i + " sans targetId.");
    if (seenIds.has(targetId)) throw new Error("buildMissionDocumentMapping: targetId dupliqué (\"" + targetId + "\").");
    seenIds.add(targetId);
    if (!role) throw new Error("buildMissionDocumentMapping: slot \"" + targetId + "\" sans role.");
    const m = (s && s.matchers) || {};
    if (m !== null && typeof m !== "object") throw new Error("buildMissionDocumentMapping: slot \"" + targetId + "\" — matchers doit être un objet.");
    const aliases = Array.isArray(m.aliases) ? m.aliases.map(str).filter(Boolean) : [];
    const filenamePatterns = Array.isArray(m.filenamePatterns) ? m.filenamePatterns.map(str).filter(Boolean) : [];
    const contentPatterns = Array.isArray(m.contentPatterns) ? m.contentPatterns.map(str).filter(Boolean) : [];
    // Compilation immédiate pour VALIDATION seulement — une regex invalide
    // rejette TOUT le mapping ici. Les objets RegExp compilés ne sont
    // JAMAIS stockés dans l'objet public (non sérialisables en JSON ; une
    // fixture rechargée depuis un fichier doit être recompilée à l'usage,
    // voir resolveDocumentSlots).
    filenamePatterns.forEach((p) => compileRegexOrThrow(p, "slot \"" + targetId + "\", filenamePatterns"));
    contentPatterns.forEach((p) => compileRegexOrThrow(p, "slot \"" + targetId + "\", contentPatterns"));
    return { targetId, role, matchers: { aliases, filenamePatterns, contentPatterns } };
  });
  if (typeof ambiguityFloor !== "undefined" && (typeof ambiguityFloor !== "number" || !(ambiguityFloor >= 0))) {
    throw new Error("buildMissionDocumentMapping: ambiguityFloor doit être un nombre >= 0.");
  }
  const floor = typeof ambiguityFloor === "number" ? ambiguityFloor : 0.12;

  return Object.freeze({
    schema: "EvidenceForge.MissionDocumentMapping",
    schemaVersion: "EF-PR-GEN-v1",
    missionId: mid,
    slots: cleaned,
    ambiguityFloor: floor
  });
}

// ---------------------------------------------------------------------------
// validateMissionDocumentMapping(d) — validation STRICTE, jamais laxiste :
// targetId obligatoire et unique, role obligatoire, matchers structuré,
// ambiguityFloor valide. Rejette tout objet malformé plutôt que de
// l'accepter partiellement.
// ---------------------------------------------------------------------------
function validateMissionDocumentMapping(d) {
  if (!d || d.schema !== "EvidenceForge.MissionDocumentMapping" || d.schemaVersion !== "EF-PR-GEN-v1") return false;
  if (!Array.isArray(d.slots) || d.slots.length === 0) return false;
  if (typeof d.ambiguityFloor !== "number" || !(d.ambiguityFloor >= 0)) return false;
  const seenIds = new Set();
  for (const s of d.slots) {
    if (!s || typeof s !== "object") return false;
    const targetId = str(s.targetId), role = str(s.role);
    if (!targetId || !role) return false;
    if (seenIds.has(targetId)) return false;
    seenIds.add(targetId);
    const m = s.matchers;
    if (!m || typeof m !== "object") return false;
    if (!Array.isArray(m.aliases) || !Array.isArray(m.filenamePatterns) || !Array.isArray(m.contentPatterns)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// scoreSlotForFile(slot, file) — score générique par défaut (similarité de
// tokens), avec un bonus déterministe si un matcher explicite de la mission
// (alias exact, ou motif déjà compilé et validé à la construction) touche.
// file = {name, content}
// ---------------------------------------------------------------------------
function scoreSlotForFile(slot, file, compiledCache) {
  const fn = norm(file.name), ct = norm(str(file.content).slice(0, 1200));
  let score = tokenSimilarity(slot.role, file.name);

  for (const alias of slot.matchers.aliases) {
    if (norm(alias) === fn) score = Math.max(score, 0.99);
  }
  const compiled = compiledCache.get(slot.targetId);
  for (const rx of compiled.filename) {
    if (rx.test(fn)) score = Math.max(score, 0.98);
  }
  for (const rx of compiled.content) {
    if (rx.test(ct)) score = Math.max(score, 0.92);
  }
  return score;
}

// ---------------------------------------------------------------------------
// resolveDocumentSlots(mapping, files) -> { resolved: {targetId: file}, statuses: {targetId: "resolved"|"ambiguous"|"unresolved"} }
//
// Recompile les motifs à chaque appel (jamais un cache stocké dans l'objet
// public, non sérialisable) — et rejette EXPLICITEMENT et IMMÉDIATEMENT,
// avant tout traitement de fichier, si une seule regex de tout le mapping
// est invalide (couvre le cas d'une fixture rechargée depuis JSON, jamais
// validée par buildMissionDocumentMapping).
//
// Amélioration RÉELLE par rapport au mécanisme historique : le code
// d'origine (associate(), EF-03B) ne vérifiait qu'un plancher de score
// minimal (score<0.18 => non résolu) — jamais l'écart entre le meilleur et
// le second candidat. Ce résolveur ajoute un vrai test d'ambiguïté
// (ambiguityFloor) : ceci est un comportement NOUVEAU, pas une simple
// extraction du code historique, et doit être compris comme tel.
// ---------------------------------------------------------------------------
function resolveDocumentSlots(mapping, files) {
  if (!validateMissionDocumentMapping(mapping)) throw new Error("resolveDocumentSlots: MissionDocumentMapping invalide.");

  const compiledCache = new Map();
  for (const slot of mapping.slots) {
    compiledCache.set(slot.targetId, {
      filename: slot.matchers.filenamePatterns.map((p) => compileRegexOrThrow(p, "slot \"" + slot.targetId + "\", filenamePatterns")),
      content: slot.matchers.contentPatterns.map((p) => compileRegexOrThrow(p, "slot \"" + slot.targetId + "\", contentPatterns"))
    });
  }

  const used = new Set();
  const resolved = {}, statuses = {};

  for (const slot of mapping.slots) {
    const candidates = files
      .map((f, i) => ({ i, f, score: scoreSlotForFile(slot, f, compiledCache) }))
      .filter((c) => !used.has(c.i))
      .sort((a, b) => b.score - a.score);

    if (!candidates.length || candidates[0].score < 0.18) {
      statuses[slot.targetId] = "unresolved";
      continue;
    }
    const best = candidates[0], second = candidates[1];
    const gap = second ? best.score - second.score : Infinity;
    if (gap < mapping.ambiguityFloor) {
      statuses[slot.targetId] = "ambiguous";
      continue;
    }
    used.add(best.i);
    resolved[slot.targetId] = best.f;
    statuses[slot.targetId] = "resolved";
  }
  return { resolved, statuses };
}

const EFPrGenMissionDocumentMapping = {
  buildMissionDocumentMapping, validateMissionDocumentMapping,
  resolveDocumentSlots, scoreSlotForFile, tokenSimilarity
};

if (typeof module !== "undefined" && module.exports) module.exports = EFPrGenMissionDocumentMapping;
if (typeof window !== "undefined") window.EFPrGenMissionDocumentMapping = EFPrGenMissionDocumentMapping;
