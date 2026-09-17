"use strict";
/**
 * MONO-10 v0.7 — core/lineage.js   (§38, §39, §40, §23)
 *
 * FERMETURES v0.5 B05 (partielle) et B11.
 *
 * §38 — les relations ne sont plus de simples etiquettes : une table
 *       AUTORITAIRE lie TYPE D'ARTEFACT ↔ RELATION. Un MissionArtifact ne peut
 *       plus devenir une preuve documentaire par simple relabellisation.
 * §39 — l'exception inter-run ne vient plus d'un parametre d'appel. Elle exige
 *       un CONTRAT OPERATEUR authentifie (`IMMUTABLE_HISTORICAL_INPUT`), porte
 *       par la frontiere de confiance et non par la mission.
 * §40 — toute metadonnee requise absente vaut INVALIDE, jamais « je ne peux pas
 *       verifier, donc j'accepte ».
 */

const { sha256Of, artifactHash, bareArtifact, isNonEmptyStr, isHash, fail } = require("./canonical.js");
const OHIA = require("./operator-historical-input-authority.js");

const RELATION = {
  MISSION: "mission", PRIOR_REPORT: "prior-report", DOCUMENTARY_EVIDENCE: "documentary-evidence",
  DISCOVERY: "discovery", VERIFICATION: "verification", ASSESSMENT: "assessment",
  PANEL_DECISION: "panel-decision", EFFECTIVE_ELIGIBILITY: "effective-eligibility",
  CORPUS: "corpus", TWINS: "twins", REVIEWS: "reviews", AGGREGATION: "aggregation",
  READINESS_PRE: "readiness-pre", READINESS_FULL: "readiness-full", CAPABILITY: "capability",
  QUALIFICATION: "qualification", REPORT: "report", ACCEPTANCE: "acceptance",
  AUTHORIZATION: "downstream-authorization",
};

/** §38 — table AUTORITAIRE : chaque relation n'accepte qu'UN type d'artefact. */
const ARTIFACT_TYPE_OF_RELATION = {
  [RELATION.MISSION]: "EvidenceForge.Mission",
  [RELATION.PRIOR_REPORT]: "EvidenceForge.PriorUnifiedReport",
  [RELATION.DOCUMENTARY_EVIDENCE]: "EvidenceForge.DocumentaryEvidenceRecord",
  [RELATION.DISCOVERY]: "EvidenceForge.ProfessionalDiscovery",
  [RELATION.VERIFICATION]: "EvidenceForge.ProfessionalVerification",
  [RELATION.ASSESSMENT]: "EvidenceForge.ProfessionalCandidateAssessment",
  [RELATION.PANEL_DECISION]: "EvidenceForge.ProfessionalPanelValidation",
  [RELATION.EFFECTIVE_ELIGIBILITY]: "EvidenceForge.EffectiveCorpusEligibilitySet",
  [RELATION.CORPUS]: "EvidenceForge.ProfessionalCorpusSet",
  [RELATION.TWINS]: "EvidenceForge.DocumentaryTwinSet",
  [RELATION.REVIEWS]: "EvidenceForge.ReviewSet",
  [RELATION.AGGREGATION]: "EvidenceForge.Aggregation",
  [RELATION.READINESS_PRE]: "EvidenceForge.ScientificReadiness",
  [RELATION.READINESS_FULL]: "EvidenceForge.ScientificReadiness",
  [RELATION.CAPABILITY]: "EvidenceForge.LlmCapability",
  [RELATION.QUALIFICATION]: "EvidenceForge.ScientificQualification",
  [RELATION.REPORT]: "EvidenceForge.ScientificUnifiedReport",
  [RELATION.ACCEPTANCE]: "EvidenceForge.FinalReportAcceptance",
  [RELATION.AUTHORIZATION]: "EvidenceForge.DownstreamUseAuthorization",
};

const EXPECTED_PARENTS = {
  [RELATION.MISSION]: [],
  [RELATION.PRIOR_REPORT]: [],
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

/** §23 — classes de preuve admissibles pour une approbation documentaire humaine. */
const HUMAN_EVIDENCE_RELATIONS = [RELATION.DOCUMENTARY_EVIDENCE];

function artifactRef(artifact, artifactId, relation) {
  if (!artifact || typeof artifact !== "object") throw fail("LINEAGE_REF_INVALID", "artefact absent.");
  if (!isNonEmptyStr(relation) || !Object.prototype.hasOwnProperty.call(EXPECTED_PARENTS, relation)) {
    throw fail("LINEAGE_RELATION_UNKNOWN", "relation \"" + relation + "\" hors du graphe canonique.");
  }
  // §38 — on refuse de FABRIQUER une reference dont le type contredit la relation.
  const expectedType = ARTIFACT_TYPE_OF_RELATION[relation];
  if (expectedType && artifact.schema !== expectedType) {
    throw fail("LINEAGE_TYPE_RELATION_MISMATCH", "la relation \"" + relation + "\" exige le type \"" + expectedType
      + "\", l'artefact porte \"" + artifact.schema + "\" — une etiquette ne change pas la nature d'un artefact.");
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
 * FERMETURE B2 (§7, §8). En v0.6, franchir un run demandait un objet
 *   `historicalInputContract` portant `operatorAuthenticated: true`.
 *   `LINEAGE.md` presentait ce booleen comme LE controle. L'audit a montre
 *   qu'il suffisait de l'ecrire : le controle documente etait une
 *   auto-declaration de l'appelant.
 *
 * v0.7 : le droit d'entree historique est une CAPACITE PROVISIONNEE.
 *   opts.historicalInputAuthority   autorite obtenue de la frontiere operateur
 *   opts.historicalInputRequest     la DEMANDE de l'appelant (§8, onze champs)
 *
 *   L'appelant DEMANDE ; il ne declare plus. Tout objet
 *   `historicalInputContract` est desormais IGNORE et signale, de meme que
 *   `crossRunAllowedRelations`.
 */
function resolveLineage(refs, registry, opts) {
  opts = opts || {};
  const problems = [];
  // §7 — DEFAULT DENY. Seule une autorite d'entree historique PROVISIONNEE
  // peut lever le refus, et seulement pour la reference exacte qu'elle a
  // autorisee. Aucun booleen, aucun tableau d'appelant n'y donne acces.
  const crossAuthorized = new Map();   // artifactId -> autorisation branded
  if (opts.historicalInputContract) {
    problems.push("historicalInputContract fourni par l'appelant : IGNORE. Un contrat d'entree historique n'est pas "
      + "un objet que l'appelant redige, et `operatorAuthenticated: true` n'est pas une authentification. "
      + "Utiliser la capacite OperatorHistoricalInputAuthority provisionnee par l'exploitant.");
  }
  if (Array.isArray(opts.crossRunAllowedRelations) && opts.crossRunAllowedRelations.length) {
    problems.push("crossRunAllowedRelations fourni par l'appelant : IGNORE. Une exception inter-run exige une autorite provisionnee.");
  }
  const hiAuthority = opts.historicalInputAuthority
    || (opts.verifier && typeof opts.verifier.historicalInputAuthority === "function" ? opts.verifier.historicalInputAuthority() : null);
  const hiRequests = Array.isArray(opts.historicalInputRequests) ? opts.historicalInputRequests
    : (opts.historicalInputRequest ? [opts.historicalInputRequest] : []);
  if (hiRequests.length) {
    if (!OHIA.isProvisionedHistoricalInputAuthority(hiAuthority)) {
      problems.push("entree historique demandee sans OperatorHistoricalInputAuthority provisionnee — refus par defaut.");
    } else {
      hiRequests.forEach(function (req, i) {
        const r = hiAuthority.authorize(req);
        if (r.authorized && OHIA.isHistoricalInputAuthorization(r.authorization)) {
          crossAuthorized.set(r.authorization.artifactId, r.authorization);
        } else {
          problems.push("demande d'entree historique[" + i + "] refusee : " + (r.problems || []).slice(0, 2).join(" ; "));
        }
      });
    }
  }
  if (!Array.isArray(refs) || refs.length === 0) {
    return { resolved: false, problems: problems.concat(["lineage vide — jamais accepte"]), resolvedRefs: [], missingRelations: [] };
  }
  if (!registry || typeof registry.get !== "function") {
    return { resolved: false, problems: problems.concat(["aucun registre d'artefacts : une reference ne peut pas etre resolue"]), resolvedRefs: [], missingRelations: [] };
  }
  const resolvedRefs = [];
  refs.forEach(function (r, i) {
    const tag = "lineage[" + i + "]";
    if (!r || typeof r !== "object") { problems.push(tag + " : reference absente."); return; }
    if (!isHash(r.sha256)) { problems.push(tag + " : sha256 absent ou invalide."); return; }
    if (!isNonEmptyStr(r.artifactId)) { problems.push(tag + " : artifactId absent."); return; }
    let entry;
    try { entry = registry.get(r.artifactId); }
    catch (e) { problems.push(tag + " : " + e.message); return; }
    if (!entry) { problems.push(tag + " : artifactId \"" + r.artifactId + "\" introuvable parmi les artefacts disponibles."); return; }
    if (entry.hash !== r.sha256) { problems.push(tag + " : empreinte ne correspond pas a l'artefact \"" + r.artifactId + "\"."); return; }
    // §40 — type et relation obligatoires, et coherents avec la table autoritaire.
    if (!isNonEmptyStr(entry.relation)) { problems.push(tag + " : relation absente au registre — metadonnee requise manquante."); return; }
    if (isNonEmptyStr(r.relation) && r.relation !== entry.relation) {
      problems.push(tag + " : relation declaree \"" + r.relation + "\" alors que l'artefact occupe \"" + entry.relation + "\"."); return;
    }
    const expectedType = ARTIFACT_TYPE_OF_RELATION[entry.relation];
    if (expectedType && entry.artifactType !== expectedType) {
      problems.push(tag + " : type \"" + entry.artifactType + "\" incompatible avec la relation \"" + entry.relation + "\"."); return;
    }
    if (r.artifactType && entry.artifactType && r.artifactType !== entry.artifactType) {
      problems.push(tag + " : type attendu \"" + r.artifactType + "\", registre \"" + entry.artifactType + "\"."); return;
    }
    const needRun = isNonEmptyStr(opts.expectedRunId), needMission = isNonEmptyStr(opts.expectedMissionHash);
    if (needRun || needMission || opts.requireRunBinding === true) {
      if (!isNonEmptyStr(entry.runId)) { problems.push(tag + " : artefact sans liaison de run — metadonnee requise absente, echec ferme."); return; }
      if (!isNonEmptyStr(entry.missionHash)) { problems.push(tag + " : artefact sans mission — metadonnee requise absente, echec ferme."); return; }
    }
    // §8 — l'autorisation porte sur L'ARTEFACT EXACT, pas sur une relation.
    // Une autorisation ne s'etend jamais a un autre artefact de meme type.
    const hiAuth = crossAuthorized.get(r.artifactId) || null;
    const crossOkHere = !!hiAuth
      && hiAuth.artifactHash === entry.hash
      && hiAuth.artifactType === (entry.artifactType || null)
      && hiAuth.relation === entry.relation
      && hiAuth.sourceRunId === entry.runId
      && hiAuth.sourceMissionHash === entry.missionHash
      && (!isNonEmptyStr(opts.expectedRunId) || hiAuth.destinationRunId === opts.expectedRunId)
      && (!isNonEmptyStr(opts.expectedMissionHash) || hiAuth.destinationMissionHash === opts.expectedMissionHash);
    if (hiAuth && !crossOkHere) {
      problems.push(tag + " : autorisation d'entree historique presente mais desappariee (artefact, type, relation, "
        + "run source, mission source, run ou mission de destination) — refus.");
      return;
    }
    if (needMission && entry.missionHash !== opts.expectedMissionHash && !crossOkHere) { problems.push(tag + " : mission differente de la mission attendue."); return; }
    if (needRun && entry.runId !== opts.expectedRunId && !crossOkHere) {
      problems.push(tag + " : artefact issu du run \"" + entry.runId + "\" — lignee inter-run interdite par defaut."); return;
    }
    if (isNonEmptyStr(opts.expectedAttestationHash) && entry.attestationHash !== opts.expectedAttestationHash && !crossOkHere) {
      problems.push(tag + " : artefact atteste par un autre run."); return;
    }
    // §23 — classes de preuve admissibles, quand l'appelant en exige une.
    if (Array.isArray(opts.acceptedRelations) && opts.acceptedRelations.indexOf(entry.relation) === -1) {
      problems.push(tag + " : relation \"" + entry.relation + "\" hors des classes de preuve admissibles (" + opts.acceptedRelations.join(", ") + ")."); return;
    }
    resolvedRefs.push({ artifactId: r.artifactId, relation: entry.relation, artifactType: entry.artifactType,
      sha256: r.sha256, runId: entry.runId, capabilities: (entry.capabilities || []).slice() });
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
  RELATION, EXPECTED_PARENTS, ARTIFACT_TYPE_OF_RELATION, HUMAN_EVIDENCE_RELATIONS, artifactHash, bareArtifact, sha256Of };
