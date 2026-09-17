"use strict";
/**
 * MONO-09 v0.1 — lib/scientific-readiness-gate.js
 *
 * Le run reel du 2026-09-08 a rendu 14/14 noeuds SUCCESS avec 0 professionnel,
 * 0 twin et 0 revue. Aucun noeud gele n'a menti : chacun a produit un artefact
 * valide et vide. C'est la LECTURE du resultat qui etait piegee.
 *
 * Ce gate est ADDITIF et n'appelle aucun noeud gele. Il classe un run en :
 *   TECHNICAL_SUCCESS_SCIENTIFICALLY_EMPTY
 *   TECHNICAL_SUCCESS_SCIENTIFICALLY_PARTIAL
 *   TECHNICAL_SUCCESS_SCIENTIFICALLY_USABLE   (voir BLOCKER ci-dessous)
 *   TECHNICAL_FAILURE
 *
 * BLOCKER STRUCTUREL, constate et non contourne :
 * testMode:true / scientificValidity:false / humanProfessionalValidation:false
 * sont des LITTERAUX codes en dur dans les modules geles EF-02D1D2, EF-02D3,
 * EF-02E, EF-03A, EF-03B, EF-03C, EF-03D et EF-04A. Aucun chemin d'execution
 * ne les calcule. De plus MONO-01/dependencies/ef-orch-ef01-output-contracts-v0.1.js
 * l.143 REJETTE activement toute sortie portant scientificValidity===true, et
 * le test gele MONO-01/test/test_t01_17_no_epistemic_additions.js interdit
 * d'introduire une telle affectation.
 *
 * => Aucun lot additif ne peut faire emettre scientificValidity:true au
 *    pipeline reel. Ce gate ne tente pas de le faire : il le RAPPORTE.
 */

const CLASSES = {
  EMPTY: "TECHNICAL_SUCCESS_SCIENTIFICALLY_EMPTY",
  PARTIAL: "TECHNICAL_SUCCESS_SCIENTIFICALLY_PARTIAL",
  USABLE: "TECHNICAL_SUCCESS_SCIENTIFICALLY_USABLE",
  FAILURE: "TECHNICAL_FAILURE",
};

function num(v) { return typeof v === "number" && Number.isFinite(v) ? v : 0; }

/**
 * classifyRun({ graphNodes, counts, flags }) -> classification complete.
 * counts : { professionalsDiscovered, professionalsVerified, professionalCorpora,
 *            twinsCreated, reviewsCompleted, aggregates }
 * flags  : { testMode, scientificValidity, humanProfessionalValidation }
 */
function classifyRun(input) {
  input = input || {};
  const nodes = input.graphNodes || [];
  const c = input.counts || {};
  const f = input.flags || {};
  const failed = nodes.filter(function (n) { return n.state === "FAILED" || n.state === "BLOCKED"; });
  const allSuccess = nodes.length > 0 && nodes.every(function (n) { return n.state === "SUCCESS"; });

  const reasons = [];
  let cls;
  if (failed.length) {
    cls = CLASSES.FAILURE;
    reasons.push(failed.length + " noeud(s) en echec : " + failed.map(function (n) { return n.nodeId; }).join(", "));
  } else if (num(c.reviewsCompleted) === 0 || num(c.twinsCreated) === 0 || num(c.professionalsVerified) === 0) {
    cls = CLASSES.EMPTY;
    if (num(c.professionalsDiscovered) === 0) reasons.push("aucun professionnel decouvert");
    if (num(c.professionalsVerified) === 0) reasons.push("aucun professionnel verifie");
    if (num(c.professionalCorpora) === 0) reasons.push("corpus professionnel vide");
    if (num(c.twinsCreated) === 0) reasons.push("aucun jumeau documentaire construit");
    if (num(c.reviewsCompleted) === 0) reasons.push("aucune revue produite");
  } else if (f.scientificValidity !== true || f.humanProfessionalValidation !== true || f.testMode === true) {
    cls = CLASSES.PARTIAL;
    reasons.push("le pipeline a produit des revues, mais les artefacts restent marques testMode/scientificValidity/humanProfessionalValidation par le code gele");
  } else {
    cls = CLASSES.USABLE;
  }

  const flagsBlocked = f.scientificValidity !== true || f.humanProfessionalValidation !== true;
  return {
    schema: "EvidenceForge.ScientificReadinessClassification", schemaVersion: "MONO-09-v0.1",
    classification: cls,
    technicalAllSuccess: allSuccess,
    scientificallyUsable: cls === CLASSES.USABLE,
    verdictMayBeIssued: cls === CLASSES.USABLE,
    reasons: reasons,
    counts: {
      professionalsDiscovered: num(c.professionalsDiscovered), professionalsVerified: num(c.professionalsVerified),
      professionalCorpora: num(c.professionalCorpora), twinsCreated: num(c.twinsCreated),
      reviewsCompleted: num(c.reviewsCompleted), aggregates: num(c.aggregates),
    },
    frozenFlags: { testMode: f.testMode, scientificValidity: f.scientificValidity, humanProfessionalValidation: f.humanProfessionalValidation },
    structuralBlocker: flagsBlocked ? {
      id: "SCIENTIFIC_VALIDITY_HARD_CODED_FALSE",
      statement: "scientificValidity et humanProfessionalValidation sont des litteraux codes en dur dans les modules geles MONO-01. Aucun chemin d'execution ne peut les porter a true, et le contrat de sortie rejette activement scientificValidity===true.",
      consequence: "Meme un run professionnel parfaitement peuple resterait classe " + CLASSES.PARTIAL + ". La levee de ce blocage exige une decision sur MONO-01, hors perimetre d'un lot additif.",
      evidence: [
        "MONO-01/dependencies/ef-02d1d2-orchestrator-v1.js l.70",
        "MONO-01/dependencies/ef-02d3-coverage-panel-v1.js l.297,299",
        "MONO-01/dependencies/ef-02e-twin-builder-v1.js l.236",
        "MONO-01/dependencies/ef-03a-review-schema-v1.js l.120",
        "MONO-01/dependencies/ef-03b-review-runner-v1.js l.187,234",
        "MONO-01/dependencies/ef-03c-aggregation-v1.js l.221",
        "MONO-01/dependencies/ef-03d-stability-contradiction-v1.js l.265",
        "MONO-01/dependencies/ef-04a-unified-report-v1.js l.159",
        "MONO-01/dependencies/ef-orch-ef01-output-contracts-v0.1.js l.143 (rejet actif)",
        "MONO-01/test/test_t01_17_no_epistemic_additions.js (interdiction gelee)",
      ],
    } : null,
  };
}

/** assertVerdictAllowed — fail-closed : interdit d'emettre un verdict scientifique sur un run vide. */
function assertVerdictAllowed(classification) {
  if (classification.classification === CLASSES.EMPTY) {
    const e = new Error("SCIENTIFIC_VERDICT_FORBIDDEN: " + classification.reasons.join(" ; ") + ". Un verdict emis ici serait fabrique.");
    e.code = "SCIENTIFIC_VERDICT_FORBIDDEN"; e.classification = classification; throw e;
  }
  return true;
}

module.exports = { classifyRun, assertVerdictAllowed, CLASSES };
