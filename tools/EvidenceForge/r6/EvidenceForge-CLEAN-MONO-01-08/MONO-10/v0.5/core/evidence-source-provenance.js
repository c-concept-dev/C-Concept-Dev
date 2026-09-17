"use strict";
/**
 * MONO-10 v0.5 — core/evidence-source-provenance.js   (§24, §25, §26)
 *
 * En v0.4, `sourceAuthorityId` etait un libelle inline. Meme resolu dans un
 * registre d'autorites, ce registre restait un objet fourni par l'appelant.
 *
 * v0.5 : la provenance d'une preuve d'identite est RESOLUE contre le registre
 * d'artefacts AUTHENTIFIE du run. Une preuve declare `provenanceRef` — une
 * reference de lignee vers un artefact `documentary-evidence` reellement lie au
 * run. Les racines de source, d'autorite et de famille sont lues SUR CET
 * ARTEFACT, jamais sur le libelle porte par la preuve.
 *
 * Non resolue, la provenance vaut UNKNOWN — et l'inconnu ne compte jamais comme
 * une independance.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { resolveLineage, RELATION } = require("./lineage.js");

const PROVENANCE_STATUS = { RESOLVED: "RESOLVED", UNRESOLVED: "UNRESOLVED", ABSENT: "ABSENT" };

/**
 * makeDocumentaryEvidenceRecord — l'artefact qui PORTE la provenance. Il est
 * enregistre dans le registre authentifie, donc lie au run par empreinte croisee.
 */
function makeDocumentaryEvidenceRecord(d) {
  d = d || {};
  ["evidenceId", "sourceRootId"].forEach(function (f) {
    if (!isNonEmptyStr(d[f])) throw fail("DOCUMENTARY_EVIDENCE_INVALID", "champ \"" + f + "\" requis.");
  });
  return {
    schema: "EvidenceForge.DocumentaryEvidenceRecord", schemaVersion: "MONO-10-v5",
    evidenceId: d.evidenceId,
    /** Racine de la SOURCE : deux preuves partageant cette racine sont une seule source. */
    sourceRootId: d.sourceRootId,
    /** Racine de l'AUTORITE emettrice, telle qu'etablie par la collecte documentaire. */
    authorityRootId: isNonEmptyStr(d.authorityRootId) ? d.authorityRootId : null,
    /** Groupe d'autorites (un meme groupe n'est pas une corroboration independante). */
    familyRootId: isNonEmptyStr(d.familyRootId) ? d.familyRootId : null,
    retrievedAt: isNonEmptyStr(d.retrievedAt) ? d.retrievedAt : null,
    locator: isNonEmptyStr(d.locator) ? d.locator : null,
    contentHash: isNonEmptyStr(d.contentHash) ? d.contentHash : null,
  };
}

/**
 * resolveEvidenceSourceProvenance(evidence, registry, opts)
 * -> { status, sourceRootId, authorityRootId, familyRootId, problems }
 */
function resolveEvidenceSourceProvenance(evidence, registry, opts) {
  opts = opts || {};
  const ref = evidence && evidence.provenanceRef;
  if (!ref) {
    return { status: PROVENANCE_STATUS.ABSENT, sourceRootId: null, authorityRootId: null, familyRootId: null,
      problems: ["aucune reference de provenance : l'origine reelle de la preuve est inconnue"] };
  }
  const res = resolveLineage([ref], registry, {
    expectedRunId: opts.expectedRunId, expectedMissionHash: opts.expectedMissionHash,
    expectedAttestationHash: opts.expectedAttestationHash });
  if (!res.resolved) {
    return { status: PROVENANCE_STATUS.UNRESOLVED, sourceRootId: null, authorityRootId: null, familyRootId: null, problems: res.problems };
  }
  const entry = registry.get(ref.artifactId);
  if (!entry || entry.relation !== RELATION.DOCUMENTARY_EVIDENCE) {
    return { status: PROVENANCE_STATUS.UNRESOLVED, sourceRootId: null, authorityRootId: null, familyRootId: null,
      problems: ["la reference de provenance ne designe pas un enregistrement de preuve documentaire"] };
  }
  const rec = entry.artifact;
  if (!isNonEmptyStr(rec.sourceRootId)) {
    return { status: PROVENANCE_STATUS.UNRESOLVED, sourceRootId: null, authorityRootId: null, familyRootId: null,
      problems: ["l'enregistrement documentaire ne porte pas de racine de source"] };
  }
  return { status: PROVENANCE_STATUS.RESOLVED, sourceRootId: rec.sourceRootId,
    authorityRootId: rec.authorityRootId || null, familyRootId: rec.familyRootId || null,
    recordHash: sha256Of({ e: rec.evidenceId, s: rec.sourceRootId }), problems: [] };
}

module.exports = { makeDocumentaryEvidenceRecord, resolveEvidenceSourceProvenance, PROVENANCE_STATUS };
