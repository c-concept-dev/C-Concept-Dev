"use strict";
/**
 * MONO-10 v0.3 — adapters/declared-authority-identity-adapter.js
 *
 * HORS NOYAU. Le noyau ne sait pas QUI emet un identifiant : il refuse de le
 * deviner, parce qu'un prefixe d'URL ne demontre aucune independance (A-04).
 * L'autorite emettrice et la famille d'autorites sont donc des DONNEES, que
 * seul un adaptateur de domaine peut fournir.
 *
 * Ce module ne contient AUCUN registre en dur : la table est fournie par
 * l'appelant. Deux identifiants ne comptent comme independants que si le
 * declarant l'a explicitement etabli.
 *
 *   authorityTable : { "<cle>": { authorityId, familyId } }
 *   keyOf(identifierOrValue) -> "<cle>"   (injectee ; defaut : identite)
 *
 * Une cle absente de la table produit une autorite NULLE — donc une
 * independance INCONNUE, jamais presumee.
 */

const { DISPLAY_NAME_TYPE } = require("../core/identity-evidence.js");

function isStr(x) { return typeof x === "string" && x.trim().length > 0; }

function createDeclaredAuthorityExtractor(authorityTable, opts) {
  opts = opts || {};
  const table = authorityTable || {};
  const keyOf = typeof opts.keyOf === "function" ? opts.keyOf : function (x) { return x; };

  function lookup(explicitAuthority, explicitFamily, identifier) {
    if (isStr(explicitAuthority)) return { authorityId: explicitAuthority, familyId: isStr(explicitFamily) ? explicitFamily : null };
    const k = isStr(identifier) ? keyOf(identifier) : null;
    const e = (isStr(k) && Object.prototype.hasOwnProperty.call(table, k)) ? table[k] : null;
    // Absence de declaration => autorite inconnue. Le noyau en tirera
    // INDEPENDENCE_UNKNOWN, jamais INDEPENDENT.
    return { authorityId: (e && e.authorityId) || null, familyId: (e && e.familyId) || null };
  }

  return function declaredAuthorityIdentityExtractor(c, v) {
    const out = [];
    const push = (type, identifier, explicitAuthority, explicitFamily, binding, verif, contrib) => {
      if (!isStr(identifier)) return;
      const a = lookup(explicitAuthority, explicitFamily, identifier);
      out.push({
        evidenceType: type, sourceAuthorityId: a.authorityId, sourceFamilyId: a.familyId,
        identifier: identifier, assertedValue: null, subjectBinding: binding,
        provenance: { origin: "DISCOVERY", authorityDeclared: isStr(a.authorityId) },
        verificationStatus: verif, confidenceContribution: contrib,
      });
    };
    push("provider-native-id", c.candidateRef, c.sourceAuthorityId, c.sourceFamilyId,
      "CONFIRMED", (v && v.verificationStatus === "VERIFIED") ? "VERIFIED" : "UNVERIFIED", 0.6);
    (Array.isArray(c.identifiers) ? c.identifiers : []).forEach(function (x) {
      push(x.type || "external-id", x.value, x.sourceAuthorityId, x.sourceFamilyId,
        x.subjectBinding || "CONFIRMED", x.verificationStatus || "UNVERIFIED",
        typeof x.confidenceContribution === "number" ? x.confidenceContribution : 0.5);
    });
    if (isStr(c.displayName)) {
      out.push({
        evidenceType: DISPLAY_NAME_TYPE, sourceAuthorityId: null, sourceFamilyId: null,
        identifier: null, assertedValue: c.displayName,
        subjectBinding: c.identityAmbiguity ? "AMBIGUOUS" : "ASSERTED",
        provenance: { origin: "DISCOVERY", authorityDeclared: false },
        verificationStatus: "UNKNOWN", confidenceContribution: 0,
      });
    }
    return out;
  };
}

module.exports = { createDeclaredAuthorityExtractor };
