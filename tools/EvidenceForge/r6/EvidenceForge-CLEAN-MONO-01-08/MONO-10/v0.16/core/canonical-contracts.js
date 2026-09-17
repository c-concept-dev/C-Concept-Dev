"use strict";
/**
 * MONO-10 v0.7 — core/canonical-contracts.js   (§35, §36)
 *
 * FERMETURE M8. En v0.6, `KEY-MANAGEMENT.md` annoncait quatre statuts de cle
 * alors que le code n'en connaissait que trois. Le test cense garder la liste
 * (`KL-01`) verifiait la constante du CODE : on pouvait injecter deux statuts
 * inventes dans le document et la suite passait toujours.
 *
 * v0.7 : les enumerations critiques ont UNE SEULE source, machine-lisible
 * (`contracts/canonical-contracts.json`). Le code l'IMPORTE — il ne la
 * recopie pas — et la documentation est VALIDEE contre elle par un test qui
 * lit reellement les documents (voir `contractDocumentedTokens`).
 *
 * Consequence : une divergence entre le code et la documentation n'est plus
 * possible sans faire echouer un test.
 */

const fs = require("fs");
const path = require("path");
const { fail, isNonEmptyStr, sha256Of } = require("./canonical.js");

const SOURCE_PATH = path.resolve(__dirname, "..", "contracts", "canonical-contracts.json");

let raw;
try { raw = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8")); }
catch (e) {
  throw fail("CANONICAL_CONTRACTS_UNREADABLE",
    "source canonique des contrats illisible (" + SOURCE_PATH + ") : " + ((e && e.message) || e)
    + ". Aucune enumeration critique n'est reconstruite de memoire — fail closed.");
}

function values(name) {
  const c = raw[name];
  if (!c || !Array.isArray(c.values) || c.values.length === 0) {
    throw fail("CANONICAL_CONTRACT_MISSING", "contrat \"" + name + "\" absent ou vide dans la source canonique.");
  }
  return c.values.slice();
}
/** Enumeration objet { VALEUR: "VALEUR" } derivee de la source, jamais ecrite a la main. */
function enumOf(name) {
  const out = {};
  values(name).forEach(function (v) { out[v] = v; });
  return Object.freeze(out);
}
function note(name) { return (raw[name] && raw[name].note) || null; }

/**
 * contractDocumentedTokens(markdown, contractName)
 * Extrait les jetons `BACKTICKED` du bloc delimite par
 *   <!-- contract:NOM -->  ...  <!-- /contract -->
 * Rend null si le bloc est absent : un document qui ne declare pas le contrat
 * est un echec, pas un succes par defaut.
 */
function contractDocumentedTokens(markdown, contractName) {
  if (!isNonEmptyStr(markdown) || !isNonEmptyStr(contractName)) return null;
  const open = "<!-- contract:" + contractName + " -->";
  const i = markdown.indexOf(open);
  if (i === -1) return null;
  const j = markdown.indexOf("<!-- /contract -->", i);
  if (j === -1) return null;
  const block = markdown.slice(i + open.length, j);
  const found = [];
  const re = /`([A-Z][A-Z0-9_]{2,})`/g;
  let m;
  while ((m = re.exec(block)) !== null) { if (found.indexOf(m[1]) === -1) found.push(m[1]); }
  return found;
}

/** Compare l'ensemble documente a l'ensemble canonique. */
function verifyDocumentedContract(markdown, contractName) {
  const expected = values(contractName).slice().sort();
  const documented = contractDocumentedTokens(markdown, contractName);
  if (documented === null) {
    return { valid: false, contract: contractName, problems: ["bloc <!-- contract:" + contractName + " --> absent du document"],
      expected: expected, documented: null, extra: [], missing: expected };
  }
  const got = documented.slice().sort();
  const extra = got.filter((x) => expected.indexOf(x) === -1);
  const missing = expected.filter((x) => got.indexOf(x) === -1);
  const problems = [];
  if (extra.length) problems.push("valeurs documentees INEXISTANTES dans le code : " + extra.join(", "));
  if (missing.length) problems.push("valeurs du code ABSENTES de la documentation : " + missing.join(", "));
  return { valid: problems.length === 0, contract: contractName, problems: problems,
    expected: expected, documented: got, extra: extra, missing: missing };
}

const KEY_STATUS = enumOf("keyStatuses");
const CAPABILITY = enumOf("artifactCapabilities");
const QUALIFICATION_STATE = enumOf("qualificationStates");
const EVIDENCE_CLASS = enumOf("evidenceClasses");
const ELIGIBILITY_STATE = enumOf("eligibilityStates");
const PANEL_DECISION = enumOf("panelDecisions");
const ACCEPTANCE_DECISION = enumOf("acceptanceDecisions");
const READINESS_PHASE = enumOf("readinessPhases");
const PROVENANCE_STATUS = enumOf("provenanceStatuses");
const UPSTREAM_ASSERTION = enumOf("upstreamAssertionStates");
const CAPABILITY_ELIGIBLE_SCHEMAS = Object.freeze(Object.assign({}, raw.capabilityEligibleSchemas || {}));
const DOCUMENTED_CONTRACTS = Object.freeze((raw.documentedContracts || []).map((d) => Object.freeze(Object.assign({}, d))));
const CONTRACT_SOURCE_HASH = sha256Of(raw);

module.exports = {
  SOURCE_PATH, CONTRACT_SOURCE_HASH, contractVersion: raw.contractVersion,
  values, enumOf, note, contractDocumentedTokens, verifyDocumentedContract,
  KEY_STATUS, CAPABILITY, QUALIFICATION_STATE, EVIDENCE_CLASS, ELIGIBILITY_STATE,
  PANEL_DECISION, ACCEPTANCE_DECISION, READINESS_PHASE, PROVENANCE_STATUS, UPSTREAM_ASSERTION,
  CAPABILITY_ELIGIBLE_SCHEMAS, DOCUMENTED_CONTRACTS,
};
