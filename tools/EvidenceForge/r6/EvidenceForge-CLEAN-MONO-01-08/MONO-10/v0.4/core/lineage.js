"use strict";
/**
 * MONO-10 v0.4 — core/lineage.js
 *
 * FERMETURES v0.3 B-7 (§12, §13).
 *
 * v0.3 resolvait des NOEUDS : existence, empreinte, type. Trois trous :
 *   - un artefact issu d'un AUTRE run resolvait (runId jamais compare) ;
 *   - aucune ARETE n'etait typee : `requiredRelations` ne verifiait que la
 *     presence d'un type dans la liste, jamais la relation attendue ;
 *   - la mission n'etait pas confrontee.
 *
 * v0.4 resout un GRAPHE : chaque artefact occupe une RELATION nommee, et la
 * lignee d'une relation doit couvrir exactement les relations parentes
 * attendues. Un artefact reel de mauvaise relation ne satisfait pas la lignee.
 *
 * Les noms de relations sont ceux du pipeline canonique d'EvidenceForge. Ce
 * sont des roles structurels, pas des metiers : aucune discipline, aucun
 * fournisseur, aucun cas d'usage n'y apparait.
 */

const { sha256Of, artifactHash, bareArtifact, isNonEmptyStr, isHash, fail } = require("./canonical.js");

/** §13 — le graphe attendu. Chaque relation declare ses parents obligatoires. */
const RELATION = {
  MISSION: "mission", DISCOVERY: "discovery", VERIFICATION: "verification",
  ASSESSMENT: "assessment", PANEL_DECISION: "panel-decision", EFFECTIVE_ELIGIBILITY: "effective-eligibility",
  CORPUS: "corpus", TWINS: "twins", REVIEWS: "reviews", AGGREGATION: "aggregation",
  READINESS_PRE: "readiness-pre", READINESS_FULL: "readiness-full",
  CAPABILITY: "capability", QUALIFICATION: "qualification", REPORT: "report",
  ACCEPTANCE: "acceptance", AUTHORIZATION: "downstream-authorization",
};

const EXPECTED_PARENTS = {
  [RELATION.MISSION]: [],
  [RELATION.DISCOVERY]: [RELATION.MISSION],
  [RELATION.VERIFICATION]: [RELATION.DISCOVERY],
  [RELATION.ASSESSMENT]: [RELATION.DISCOVERY, RELATION.VERIFICATION],
  [RELATION.PANEL_DECISION]: [RELATION.ASSESSMENT],
  [RELATION.EFFECTIVE_ELIGIBILITY]: [RELATION.PANEL_DECISION],
  [RELATION.CORPUS]: [RELATION.EFFECTIVE_ELIGIBILITY],
  [RELATION.TWINS]: [RELATION.CORPUS],
  [RELATION.REVIEWS]: [RELATION.TWINS],
  [RELATION.AGGREGATION]: [RELATION.REVIEWS],
  [RELATION.READINESS_PRE]: [RELATION.ASSESSMENT, RELATION.PANEL_DECISION],
  [RELATION.READINESS_FULL]: [RELATION.CORPUS, RELATION.TWINS, RELATION.REVIEWS, RELATION.AGGREGATION],
  [RELATION.CAPABILITY]: [RELATION.MISSION],
  [RELATION.QUALIFICATION]: [RELATION.READINESS_PRE, RELATION.READINESS_FULL],
  [RELATION.REPORT]: [RELATION.QUALIFICATION],
  [RELATION.ACCEPTANCE]: [RELATION.REPORT],
  [RELATION.AUTHORIZATION]: [RELATION.QUALIFICATION, RELATION.REPORT, RELATION.ACCEPTANCE],
};

function artifactRef(artifact, artifactId, relation) {
  if (!artifact || typeof artifact !== "object") throw fail("LINEAGE_REF_INVALID", "artefact absent.");
  if (!isNonEmptyStr(relation) || !Object.prototype.hasOwnProperty.call(EXPECTED_PARENTS, relation)) {
    throw fail("LINEAGE_RELATION_UNKNOWN", "relation \"" + relation + "\" hors du graphe canonique.");
  }
  const b = artifact.runBinding || null;
  return {
    artifactId: isNonEmptyStr(artifactId) ? artifactId : (artifact.artifactId || null),
    relation: relation,
    artifactType: artifact.schema || null,
    schemaVersion: artifact.schemaVersion || null,
    sha256: artifactHash(artifact),
    runId: b ? b.runId : null,
    missionHash: b ? b.missionHash : (isNonEmptyStr(artifact.missionHash) ? artifact.missionHash : null),
    attestationHash: b ? b.attestationHash : null,
  };
}

/** entries : [{ artifactId, relation, artifact }] */
function createArtifactRegistry(entries) {
  const map = new Map();
  (entries || []).forEach(function (e, i) {
    if (!e || !isNonEmptyStr(e.artifactId) || !e.artifact) throw fail("REGISTRY_INVALID", "entree[" + i + "] : artifactId et artifact requis.");
    if (!isNonEmptyStr(e.relation) || !Object.prototype.hasOwnProperty.call(EXPECTED_PARENTS, e.relation)) {
      throw fail("REGISTRY_INVALID", "entree[" + i + "] : relation \"" + e.relation + "\" hors du graphe canonique.");
    }
    const b = e.artifact.runBinding || null;
    map.set(e.artifactId, { relation: e.relation, artifactType: e.artifact.schema || null,
      artifact: e.artifact, hash: artifactHash(e.artifact),
      runId: b ? b.runId : null, missionHash: b ? b.missionHash : null, attestationHash: b ? b.attestationHash : null });
  });
  return map;
}

/**
 * resolveLineage(refs, registry, opts)
 * opts.relation        relation de l'artefact AVAL dont on resout la lignee
 * opts.expectedRunId   §12 — liaison au run
 * opts.expectedMissionHash
 * opts.expectedAttestationHash
 * opts.allowCrossRun   defaut FALSE — la lignee scientifique inter-run est interdite
 * opts.crossRunAllowedRelations  relations explicitement autorisees comme entrees
 *                                historiques immuables (contrat explicite)
 */
function resolveLineage(refs, registry, opts) {
  opts = opts || {};
  const problems = [];
  const crossOk = new Set(opts.allowCrossRun === true ? Object.keys(EXPECTED_PARENTS) : (opts.crossRunAllowedRelations || []));
  if (!Array.isArray(refs) || refs.length === 0) {
    return { resolved: false, problems: ["lineage vide — jamais accepte"], resolvedRefs: [], missingRelations: [] };
  }
  if (!registry || typeof registry.get !== "function") {
    return { resolved: false, problems: ["aucun registre d'artefacts : une reference ne peut pas etre resolue"], resolvedRefs: [], missingRelations: [] };
  }
  const resolvedRefs = [];
  refs.forEach(function (r, i) {
    const tag = "lineage[" + i + "]";
    if (!r || typeof r !== "object") { problems.push(tag + " : reference absente."); return; }
    if (!isHash(r.sha256)) { problems.push(tag + " : sha256 absent ou invalide."); return; }
    if (!isNonEmptyStr(r.artifactId)) { problems.push(tag + " : artifactId absent."); return; }
    const entry = registry.get(r.artifactId);
    if (!entry) { problems.push(tag + " : artifactId \"" + r.artifactId + "\" introuvable parmi les artefacts disponibles."); return; }
    if (entry.hash !== r.sha256) { problems.push(tag + " : empreinte ne correspond pas a l'artefact \"" + r.artifactId + "\"."); return; }
    if (r.artifactType && entry.artifactType && r.artifactType !== entry.artifactType) {
      problems.push(tag + " : type attendu \"" + r.artifactType + "\", registre \"" + entry.artifactType + "\"."); return;
    }
    // §13 — la RELATION doit correspondre, pas seulement le type.
    if (isNonEmptyStr(r.relation) && r.relation !== entry.relation) {
      problems.push(tag + " : relation declaree \"" + r.relation + "\" alors que l'artefact occupe la relation \"" + entry.relation + "\"."); return;
    }
    // §12 — mission, run, attestation.
    if (isNonEmptyStr(opts.expectedMissionHash) && isNonEmptyStr(entry.missionHash) && entry.missionHash !== opts.expectedMissionHash) {
      problems.push(tag + " : mission differente de la mission attendue."); return;
    }
    if (isNonEmptyStr(opts.expectedRunId)) {
      if (!isNonEmptyStr(entry.runId)) { problems.push(tag + " : artefact non lie a un run alors qu'un run est attendu."); return; }
      if (entry.runId !== opts.expectedRunId && !crossOk.has(entry.relation)) {
        problems.push(tag + " : artefact issu du run \"" + entry.runId + "\" — lignee scientifique inter-run interdite par defaut."); return;
      }
    }
    if (isNonEmptyStr(opts.expectedAttestationHash) && isNonEmptyStr(entry.attestationHash)
        && entry.attestationHash !== opts.expectedAttestationHash && !crossOk.has(entry.relation)) {
      problems.push(tag + " : artefact atteste par un autre run."); return;
    }
    resolvedRefs.push({ artifactId: r.artifactId, relation: entry.relation, artifactType: entry.artifactType, sha256: r.sha256, runId: entry.runId });
  });

  // §13 — couverture exacte des relations parentes attendues.
  let missing = [];
  if (isNonEmptyStr(opts.relation)) {
    if (!Object.prototype.hasOwnProperty.call(EXPECTED_PARENTS, opts.relation)) {
      problems.push("relation aval \"" + opts.relation + "\" hors du graphe canonique.");
    } else {
      const have = new Set(resolvedRefs.map((x) => x.relation));
      missing = EXPECTED_PARENTS[opts.relation].filter((p) => !have.has(p));
      if (missing.length) problems.push("aretes de lignee manquantes pour \"" + opts.relation + "\" : " + missing.join(", ") + ".");
      if (opts.strictParents === true) {
        const extra = resolvedRefs.map((x) => x.relation).filter((p) => EXPECTED_PARENTS[opts.relation].indexOf(p) === -1);
        if (extra.length) problems.push("relations hors graphe pour \"" + opts.relation + "\" : " + Array.from(new Set(extra)).join(", ") + ".");
      }
    }
  }
  return { resolved: problems.length === 0, problems: problems, resolvedRefs: resolvedRefs, missingRelations: missing };
}

function assertLineageResolved(refs, registry, opts, label) {
  const r = resolveLineage(refs, registry, opts);
  if (!r.resolved) throw fail("LINEAGE_UNRESOLVED", (label || "lineage") + " : " + r.problems.join(" ; "));
  return r;
}

function assertRefMatches(ref, currentArtifact, label) {
  if (!ref || !isHash(ref.sha256)) throw fail("LINEAGE_UNBOUND", label + " : reference absente ou invalide.");
  if (ref.sha256 !== artifactHash(currentArtifact)) throw fail("BINDING_MISMATCH", label + " : l'artefact reference a change.");
  return true;
}

module.exports = { artifactRef, createArtifactRegistry, resolveLineage, assertLineageResolved, assertRefMatches,
  RELATION, EXPECTED_PARENTS, artifactHash, bareArtifact, sha256Of };
