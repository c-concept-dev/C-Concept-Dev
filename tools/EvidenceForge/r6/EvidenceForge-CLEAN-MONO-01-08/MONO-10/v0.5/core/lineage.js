"use strict";
/**
 * MONO-10 v0.5 — core/lineage.js   (§30, §31, §32, §33)
 *
 * La lignee resout un GRAPHE, pas des noeuds isoles. Pour chaque reference :
 * existence, empreinte, type, relation, mission, run, attestation. Et pour
 * l'ensemble : couverture des aretes parentes attendues.
 *
 * §33 — l'absence de metadonnee necessaire vaut INVALIDE, jamais
 * « je ne peux pas verifier, donc j'accepte ».
 */

const { sha256Of, artifactHash, bareArtifact, isNonEmptyStr, isHash, fail } = require("./canonical.js");

const RELATION = {
  MISSION: "mission", DISCOVERY: "discovery", VERIFICATION: "verification",
  ASSESSMENT: "assessment", PANEL_DECISION: "panel-decision", EFFECTIVE_ELIGIBILITY: "effective-eligibility",
  CORPUS: "corpus", TWINS: "twins", REVIEWS: "reviews", AGGREGATION: "aggregation",
  READINESS_PRE: "readiness-pre", READINESS_FULL: "readiness-full",
  CAPABILITY: "capability", QUALIFICATION: "qualification", REPORT: "report",
  ACCEPTANCE: "acceptance", AUTHORIZATION: "downstream-authorization",
  DOCUMENTARY_EVIDENCE: "documentary-evidence",
};

const EXPECTED_PARENTS = {
  [RELATION.MISSION]: [],
  [RELATION.DOCUMENTARY_EVIDENCE]: [RELATION.MISSION],
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
    relation: relation, artifactType: artifact.schema || null, schemaVersion: artifact.schemaVersion || null,
    sha256: artifactHash(artifact),
    runId: b ? b.runId : null, missionHash: b ? b.missionHash : null, attestationHash: b ? b.attestationHash : null,
  };
}

/**
 * resolveLineage(refs, registry, opts)
 * opts.requireRunBinding  §33 — defaut TRUE des qu'un run est attendu : un
 *   artefact sans liaison de run ne peut pas etre confronte, donc il echoue.
 */
function resolveLineage(refs, registry, opts) {
  opts = opts || {};
  const problems = [];
  const crossOk = new Set(opts.crossRunAllowedRelations || []);
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
    if (isNonEmptyStr(r.relation) && r.relation !== entry.relation) {
      problems.push(tag + " : relation declaree \"" + r.relation + "\" alors que l'artefact occupe \"" + entry.relation + "\"."); return;
    }
    const needRun = isNonEmptyStr(opts.expectedRunId);
    const needMission = isNonEmptyStr(opts.expectedMissionHash);
    if (needRun || needMission || opts.requireRunBinding === true) {
      // §33 — metadonnee absente => INVALIDE, jamais « non verifiable donc accepte ».
      if (!isNonEmptyStr(entry.runId)) { problems.push(tag + " : artefact sans liaison de run — metadonnee necessaire absente, echec ferme."); return; }
      if (!isNonEmptyStr(entry.missionHash)) { problems.push(tag + " : artefact sans mission — metadonnee necessaire absente, echec ferme."); return; }
    }
    if (needMission && entry.missionHash !== opts.expectedMissionHash) { problems.push(tag + " : mission differente de la mission attendue."); return; }
    if (needRun && entry.runId !== opts.expectedRunId && !crossOk.has(entry.relation)) {
      problems.push(tag + " : artefact issu du run \"" + entry.runId + "\" — lignee inter-run interdite par defaut."); return;
    }
    if (isNonEmptyStr(opts.expectedAttestationHash) && entry.attestationHash !== opts.expectedAttestationHash && !crossOk.has(entry.relation)) {
      problems.push(tag + " : artefact atteste par un autre run."); return;
    }
    resolvedRefs.push({ artifactId: r.artifactId, relation: entry.relation, artifactType: entry.artifactType, sha256: r.sha256, runId: entry.runId });
  });

  let missing = [];
  if (isNonEmptyStr(opts.relation)) {
    if (!Object.prototype.hasOwnProperty.call(EXPECTED_PARENTS, opts.relation)) {
      problems.push("relation aval \"" + opts.relation + "\" hors du graphe canonique.");
    } else {
      const have = new Set(resolvedRefs.map((x) => x.relation));
      missing = EXPECTED_PARENTS[opts.relation].filter((p) => !have.has(p));
      if (missing.length) problems.push("aretes de lignee manquantes pour \"" + opts.relation + "\" : " + missing.join(", ") + ".");
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

module.exports = { artifactRef, resolveLineage, assertLineageResolved, assertRefMatches,
  RELATION, EXPECTED_PARENTS, artifactHash, bareArtifact, sha256Of };
