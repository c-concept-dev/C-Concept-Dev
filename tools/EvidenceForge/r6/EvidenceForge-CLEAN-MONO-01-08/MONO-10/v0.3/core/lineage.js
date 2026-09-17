"use strict";
/**
 * MONO-10 v0.3 — core/lineage.js
 *
 * FERMETURE B-06 / A-05 / §10. Une reference syntaxiquement valide ne suffit
 * jamais : elle doit RESOUDRE contre un artefact reellement disponible.
 */

const { isNonEmptyStr, fail, sha256Of, canonical } = require("./run-evidence-manifest.js");

function artifactRef(artifact, artifactId, artifactType) {
  if (!artifact || typeof artifact !== "object") throw fail("LINEAGE_REF_INVALID", "artefact absent.");
  const bare = Object.assign({}, artifact); delete bare.runBinding;
  return {
    artifactId: isNonEmptyStr(artifactId) ? artifactId : (artifact.artifactId || artifact.id || null),
    artifactType: isNonEmptyStr(artifactType) ? artifactType : (artifact.schema || null),
    schemaVersion: artifact.schemaVersion || null,
    sha256: sha256Of(bare),
    runId: (artifact.runBinding && artifact.runBinding.runId) || null,
  };
}

function assertBound(ref, label) {
  if (!ref || typeof ref !== "object") throw fail("LINEAGE_UNBOUND", label + " : reference absente.");
  if (!/^[0-9a-f]{64}$/.test(String(ref.sha256 || ""))) throw fail("LINEAGE_UNBOUND", label + " : sha256 absent ou invalide.");
  if (!isNonEmptyStr(ref.artifactId)) throw fail("LINEAGE_UNBOUND", label + " : artifactId absent.");
  return true;
}

/**
 * createArtifactRegistry(entries) — table des artefacts REELLEMENT disponibles.
 * entries : [{ artifactId, artifactType, artifact }]
 */
function createArtifactRegistry(entries) {
  const map = new Map();
  (entries || []).forEach(function (e) {
    if (!e || !isNonEmptyStr(e.artifactId) || !e.artifact) throw fail("REGISTRY_INVALID", "chaque entree exige artifactId et artifact.");
    const bare = Object.assign({}, e.artifact); delete bare.runBinding;
    map.set(e.artifactId, { artifactType: e.artifactType || e.artifact.schema || null, artifact: e.artifact, hash: sha256Of(bare) });
  });
  return map;
}

/**
 * resolveLineage(refs, registry, opts) — §10. Chaque reference doit :
 *   1. exister dans le registre,
 *   2. porter l'empreinte exacte de l'artefact enregistre,
 *   3. porter le type attendu,
 *   4. couvrir les relations exigees.
 * Une empreinte "000…0" ou l'empreinte d'un objet sans rapport ECHOUE.
 */
function resolveLineage(refs, registry, opts) {
  opts = opts || {};
  const problems = [];
  if (!Array.isArray(refs) || refs.length === 0) {
    return { resolved: false, problems: ["lineage vide — jamais accepte"], resolvedRefs: [], missingRelations: opts.requiredRelations || [] };
  }
  if (!registry || typeof registry.get !== "function") {
    return { resolved: false, problems: ["aucun registre d'artefacts fourni : une reference ne peut pas etre resolue"], resolvedRefs: [], missingRelations: opts.requiredRelations || [] };
  }
  const resolvedRefs = [];
  refs.forEach(function (r, i) {
    const tag = "lineage[" + i + "]";
    try { assertBound(r, tag); } catch (e) { problems.push(e.message); return; }
    const entry = registry.get(r.artifactId);
    if (!entry) { problems.push(tag + " : artifactId \"" + r.artifactId + "\" introuvable parmi les artefacts disponibles."); return; }
    if (entry.hash !== r.sha256) { problems.push(tag + " : empreinte ne correspond pas a l'artefact \"" + r.artifactId + "\" (reference obsolete ou sans rapport)."); return; }
    if (r.artifactType && entry.artifactType && r.artifactType !== entry.artifactType) {
      problems.push(tag + " : type attendu \"" + r.artifactType + "\", registre \"" + entry.artifactType + "\"."); return;
    }
    resolvedRefs.push({ artifactId: r.artifactId, artifactType: entry.artifactType, sha256: r.sha256 });
  });
  const have = new Set(resolvedRefs.map((r) => r.artifactType));
  const missing = (opts.requiredRelations || []).filter((t) => !have.has(t));
  if (missing.length) problems.push("relations de lignee manquantes : " + missing.join(", "));
  return { resolved: problems.length === 0, problems: problems, resolvedRefs: resolvedRefs, missingRelations: missing };
}

function assertLineageResolved(refs, registry, opts, label) {
  const r = resolveLineage(refs, registry, opts);
  if (!r.resolved) throw fail("LINEAGE_UNRESOLVED", (label || "lineage") + " : " + r.problems.join(" ; "));
  return r;
}

function assertRefMatches(ref, currentArtifact, label) {
  assertBound(ref, label);
  const bare = Object.assign({}, currentArtifact); delete bare.runBinding;
  const now = sha256Of(bare);
  if (ref.sha256 !== now) throw fail("BINDING_MISMATCH", label + " : l'artefact reference a change.");
  return true;
}

function assertHumanAct(act, label) {
  if (!act || typeof act !== "object") throw fail("HUMAN_ACT_MISSING", label + " : acte absent.");
  if (act.actorType !== "human") throw fail("HUMAN_ACT_INVALID", label + " : actorType doit valoir exactement \"human\".");
  if (!isNonEmptyStr(act.actorIdentity)) throw fail("HUMAN_ACT_INVALID", label + " : actorIdentity non vide requise.");
  if (!isNonEmptyStr(act.decidedAt) || isNaN(Date.parse(act.decidedAt))) throw fail("HUMAN_ACT_INVALID", label + " : decidedAt doit etre un horodatage reel.");
  return true;
}

module.exports = { artifactRef, assertBound, assertRefMatches, assertHumanAct, createArtifactRegistry, resolveLineage, assertLineageResolved, sha256Of, canonical };
