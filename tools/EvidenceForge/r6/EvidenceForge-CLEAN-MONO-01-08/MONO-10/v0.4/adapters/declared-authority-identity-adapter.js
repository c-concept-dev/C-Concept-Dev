"use strict";
/**
 * MONO-10 v0.4 — adapters/declared-authority-identity-adapter.js — HORS NOYAU.
 *
 * Le noyau ne sait pas QUI emet un identifiant et refuse de le deviner. Cet
 * adaptateur traduit les identifiants d'un domaine en preuves d'identite
 * portant un libelle d'autorite ET une empreinte de provenance.
 *
 * Un libelle ne suffit pas : il devra encore etre RESOLU dans le registre
 * d'autorites exterieur (core/identity-evidence.js) pour compter comme une
 * source independante. Une cle absente de la table produit une autorite nulle
 * — donc une independance INCONNUE, jamais presumee.
 */
const { sha256Of } = require("../core/canonical.js");
const { DISPLAY_NAME_TYPE } = require("../core/identity-evidence.js");
const isStr = (x) => typeof x === "string" && x.trim().length > 0;

function createDeclaredAuthorityExtractor(authorityTable, opts) {
  opts = opts || {};
  const table = authorityTable || {};
  const keyOf = typeof opts.keyOf === "function" ? opts.keyOf : (x) => x;

  function lookup(explicitAuthority, explicitFamily, identifier) {
    if (isStr(explicitAuthority)) return { authorityId: explicitAuthority, familyId: isStr(explicitFamily) ? explicitFamily : null };
    const k = isStr(identifier) ? keyOf(identifier) : null;
    const e = (isStr(k) && Object.prototype.hasOwnProperty.call(table, k)) ? table[k] : null;
    return { authorityId: (e && e.authorityId) || null, familyId: (e && e.familyId) || null };
  }

  return function declaredAuthorityIdentityExtractor(c, v) {
    const out = [];
    const push = (type, identifier, expA, expF, prov, binding, verif, contrib) => {
      if (!isStr(identifier)) return;
      const a = lookup(expA, expF, identifier);
      out.push({ evidenceType: type, sourceAuthorityId: a.authorityId, sourceFamilyId: a.familyId,
        identifier: identifier, assertedValue: null,
        provenanceRecordHash: isStr(prov) ? prov : null,
        subjectBinding: binding, verificationStatus: verif, confidenceContribution: contrib });
    };
    push("provider-native-id", c.candidateRef, c.sourceAuthorityId, c.sourceFamilyId, c.provenanceRecordHash,
      "CONFIRMED", (v && v.verificationStatus === "VERIFIED") ? "VERIFIED" : "UNVERIFIED", 0.6);
    (Array.isArray(c.identifiers) ? c.identifiers : []).forEach(function (x) {
      push(x.type || "external-id", x.value, x.sourceAuthorityId, x.sourceFamilyId, x.provenanceRecordHash,
        x.subjectBinding || "CONFIRMED", x.verificationStatus || "UNVERIFIED",
        typeof x.confidenceContribution === "number" ? x.confidenceContribution : 0.5);
    });
    if (isStr(c.displayName)) {
      out.push({ evidenceType: DISPLAY_NAME_TYPE, sourceAuthorityId: null, sourceFamilyId: null,
        identifier: null, assertedValue: c.displayName, provenanceRecordHash: null,
        subjectBinding: c.identityAmbiguity ? "AMBIGUOUS" : "ASSERTED", verificationStatus: "UNKNOWN", confidenceContribution: 0 });
    }
    return out;
  };
}
module.exports = { createDeclaredAuthorityExtractor };
