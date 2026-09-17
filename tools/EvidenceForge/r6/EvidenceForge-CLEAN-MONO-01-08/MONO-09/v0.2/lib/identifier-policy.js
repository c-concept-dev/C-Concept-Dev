"use strict";
/**
 * MONO-09 v0.2 — lib/identifier-policy.js
 * REGLE ABSOLUE : un identifiant absent reste absent.
 *
 * DURCISSEMENT A-03 (audit v0.1). La detection v0.1 exigeait exactement
 * `work-` + 6 caracteres : un `work-ab1` plus court passait. La defense etait
 * accrochee a UN generateur precis plutot qu'a la CLASSE de motifs synthetiques
 * locaux produits par l'ancien adaptateur (MONO-08/v0.6/lib/real-external-adapter.js
 * l.177 et l.179).
 *
 * REGLE EXACTE v0.2 — un identifiant est tenu pour fabrique si :
 *   1. c'est un DOI dont le prefixe d'enregistrant est 10.0000 (plage
 *      officiellement NON attribuee : aucun DOI reel ne commence ainsi), ou
 *   2. il contient le marqueur de lot `mono08-` / `mono09-`, ou
 *   3. il correspond a `work-<suffixe alphanumerique minuscule de 1 a 12>`
 *      SANS aucun separateur de chemin ni schema — forme locale de l'ancien
 *      generateur, jamais une forme fournisseur.
 *
 * NON rejetes (verifie par test) : DOI reels, identifiants OpenAlex
 * (https://openalex.org/W…), ORCID, tout identifiant portant un schema
 * d'URL ou un prefixe d'enregistrant reel.
 */

const UNASSIGNED_DOI_PREFIX = /(^|\/)10\.0000\//;
const LOT_MARKER = /mono0[89]-/i;
const LOCAL_WORK_REF = /^work-[a-z0-9]{1,12}$/;

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }

function isFabricatedIdentifier(v) {
  if (!isNonEmptyStr(v)) return false;
  const s = v.trim();
  if (/^https?:\/\//i.test(s) && !LOT_MARKER.test(s)) {
    // Un identifiant porte par une URL fournisseur n'est jamais tenu pour
    // fabrique — sauf s'il porte le marqueur de lot.
    return UNASSIGNED_DOI_PREFIX.test(s);
  }
  if (UNASSIGNED_DOI_PREFIX.test(s)) return true;
  if (LOT_MARKER.test(s)) return true;
  if (LOCAL_WORK_REF.test(s)) return true;
  return false;
}

function normalizeWork(w) {
  w = w || {};
  const providerNativeId = isNonEmptyStr(w.id) ? w.id : null;
  const rawDoi = isNonEmptyStr(w.doi) ? w.doi : null;
  let doi = rawDoi, doiStatus;
  if (rawDoi && isFabricatedIdentifier(rawDoi)) { doi = null; doiStatus = "REJECTED_FABRICATED"; }
  else if (rawDoi) doiStatus = "PROVIDER_SUPPLIED";
  else doiStatus = "ABSENT_AT_PROVIDER";

  if (!providerNativeId || isFabricatedIdentifier(providerNativeId)) {
    return { workRef: null, providerNativeId: null, doi: doi, doiStatus: doiStatus,
      title: isNonEmptyStr(w.display_name) ? w.display_name : null,
      publicationYear: typeof w.publication_year === "number" ? w.publication_year : null,
      topics: Array.isArray(w.topics) ? w.topics : [],
      usable: false, reason: providerNativeId ? "PROVIDER_NATIVE_ID_FABRICATED" : "PROVIDER_NATIVE_ID_ABSENT",
      identifierProvenance: { workRef: "NONE", doi: doiStatus } };
  }
  return { workRef: providerNativeId, providerNativeId: providerNativeId, doi: doi, doiStatus: doiStatus,
    title: isNonEmptyStr(w.display_name) ? w.display_name : null,
    publicationYear: typeof w.publication_year === "number" ? w.publication_year : null,
    topics: Array.isArray(w.topics) ? w.topics : [],
    usable: true, reason: null,
    identifierProvenance: { workRef: "PROVIDER_NATIVE_ID", doi: doiStatus } };
}

function assertNoFabricatedIdentifiers(professionalCorpora) {
  const offenders = [];
  (professionalCorpora || []).forEach(function (pc, i) {
    ((pc.corpus && pc.corpus.works) || []).forEach(function (w, j) {
      if (isFabricatedIdentifier(w.doi) || isFabricatedIdentifier(w.workRef) || isFabricatedIdentifier(w.providerNativeId)) {
        offenders.push({ corpusIndex: i, workIndex: j, doi: w.doi, workRef: w.workRef });
      }
    });
  });
  if (offenders.length) {
    const e = new Error("IDENTIFIER_FABRICATION_DETECTED: " + offenders.length + " identifiant(s) fabrique(s) — un identifiant absent doit rester absent.");
    e.code = "IDENTIFIER_FABRICATION_DETECTED"; e.offenders = offenders; throw e;
  }
  return true;
}

module.exports = { normalizeWork, isFabricatedIdentifier, assertNoFabricatedIdentifiers,
  UNASSIGNED_DOI_PREFIX, LOT_MARKER, LOCAL_WORK_REF };
