"use strict";
/**
 * MONO-09 v0.1 — lib/identifier-policy.js
 *
 * REGLE ABSOLUE : un identifiant absent reste absent.
 *
 * Defaut ferme (observe dans MONO-08/v0.6/lib/real-external-adapter.js,
 * l.177 et l.179) :
 *     workRef: w.id || ("work-" + Math.random()...)
 *     doi:     w.doi || ("10.0000/mono08-" + Math.random()...)
 * Une oeuvre sans DOI recevait un DOI FABRIQUE, syntaxiquement plausible et
 * introuvable. Aucun consommateur aval ne pouvait le distinguer d'un vrai.
 *
 * Ce module ne fabrique JAMAIS : DOI, ORCID, identifiant OpenAlex, PMID,
 * institution, identite d'auteur. Il expose l'absence explicitement.
 */

const FABRICATED_DOI_PREFIX = "10.0000/mono08-";

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }

/** Detecte un identifiant fabrique par l'ancien adaptateur. */
function isFabricatedIdentifier(v) {
  if (!isNonEmptyStr(v)) return false;
  return v.indexOf(FABRICATED_DOI_PREFIX) === 0 || /^work-[a-z0-9]{6}$/.test(v);
}

/**
 * normalizeWork(rawWork) -> { workRef, providerNativeId, doi, doiStatus,
 *                             title, publicationYear, topics, identifierProvenance }
 * Aucune valeur n'est inventee. `doi` vaut null si absent, et `doiStatus`
 * dit pourquoi — jamais un silence.
 */
function normalizeWork(w) {
  w = w || {};
  const providerNativeId = isNonEmptyStr(w.id) ? w.id : null;
  const rawDoi = isNonEmptyStr(w.doi) ? w.doi : null;
  let doi = rawDoi, doiStatus;
  if (rawDoi && isFabricatedIdentifier(rawDoi)) { doi = null; doiStatus = "REJECTED_FABRICATED"; }
  else if (rawDoi) doiStatus = "PROVIDER_SUPPLIED";
  else doiStatus = "ABSENT_AT_PROVIDER";

  if (!providerNativeId) {
    // Sans identifiant natif, l'oeuvre n'est pas referencable. On ne lui en
    // invente pas un : on la signale inexploitable.
    return { workRef: null, providerNativeId: null, doi: doi, doiStatus: doiStatus,
      title: isNonEmptyStr(w.display_name) ? w.display_name : null,
      publicationYear: typeof w.publication_year === "number" ? w.publication_year : null,
      topics: Array.isArray(w.topics) ? w.topics : [],
      usable: false, reason: "PROVIDER_NATIVE_ID_ABSENT",
      identifierProvenance: { workRef: "NONE", doi: doiStatus } };
  }
  return { workRef: providerNativeId, providerNativeId: providerNativeId, doi: doi, doiStatus: doiStatus,
    title: isNonEmptyStr(w.display_name) ? w.display_name : null,
    publicationYear: typeof w.publication_year === "number" ? w.publication_year : null,
    topics: Array.isArray(w.topics) ? w.topics : [],
    usable: true, reason: null,
    identifierProvenance: { workRef: "PROVIDER_NATIVE_ID", doi: doiStatus } };
}

/** Refuse un corpus contenant un identifiant fabrique. Fail-closed. */
function assertNoFabricatedIdentifiers(professionalCorpora) {
  const offenders = [];
  (professionalCorpora || []).forEach(function (pc, i) {
    ((pc.corpus && pc.corpus.works) || []).forEach(function (w, j) {
      if (isFabricatedIdentifier(w.doi) || isFabricatedIdentifier(w.workRef)) {
        offenders.push({ corpusIndex: i, workIndex: j, doi: w.doi, workRef: w.workRef });
      }
    });
  });
  if (offenders.length) {
    const e = new Error("IDENTIFIER_FABRICATION_DETECTED: " + offenders.length + " identifiant(s) fabrique(s) dans le corpus professionnel — un identifiant absent doit rester absent.");
    e.code = "IDENTIFIER_FABRICATION_DETECTED";
    e.offenders = offenders;
    throw e;
  }
  return true;
}

module.exports = { normalizeWork, isFabricatedIdentifier, assertNoFabricatedIdentifiers, FABRICATED_DOI_PREFIX };
