"use strict";
/**
 * MONO-10 v0.9 — core/evidence-source-provenance.js   (§32, §33, §34)
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
 * FERMETURE v0.7 de l'observation non declaree de l'audit v0.6. Resoudre la
 * reference contre le registre prouvait la LIAISON AU RUN, pas l'authenticite
 * des racines : `sourceRootId`, `authorityRootId` et `familyRootId` etaient des
 * chaines que l'appelant avait ecrites dans l'artefact un instant plus tot. Un
 * appelant obtenait donc STRONG en presentant la meme source sous deux
 * etiquettes d'autorite inventees.
 *
 * v0.7 : les racines sont RESOLUES par `EvidenceProvenanceAuthority`, une
 * capacite provisionnee par l'exploitant. Ce que porte l'artefact n'est plus
 * qu'une DEMANDE. Sans autorite provisionnee, la provenance vaut UNRESOLVED.
 *
 * Non authentifiee, la provenance ne compte jamais comme une independance.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { resolveLineage, RELATION } = require("./lineage.js");

const CC = require("./canonical-contracts.js");
const OPA = require("./operator-provenance-authority.js");
const OTV = require("./operator-trust-verifier.js");
/** Etats importes de la source canonique (§36). AUTHENTICATED remplace RESOLVED. */
const PROVENANCE_STATUS = CC.PROVENANCE_STATUS;

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
    schema: "EvidenceForge.DocumentaryEvidenceRecord", schemaVersion: "MONO-10-v6",
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
      problems: ["l'enregistrement documentaire ne porte pas de racine de source demandee"] };
  }

  // §32 — l'autorite de provenance est la SEULE source des racines.
  /**
   * §9/§10 (v0.9) — FERMETURE R3. SEUL un verificateur issu d'une frontiere
   * operateur peut designer l'autorite de provenance.
   *
   * En v0.8, `opts.verifier` etait un objet libre : l'audit A a fourni
   * `{ operatorTrustBoundaryId, provenanceAuthority: () => monAutorite }` et a
   * obtenu AUTHENTICATED, puis STRONG, puis PRESENT_FOR_HUMAN_REVIEW, avec ses
   * propres etiquettes de racines. L'identite attendue etait lue sur l'objet
   * FOURNI PAR L'APPELANT : la verification se comparait a elle-meme.
   *
   * v0.9 : `opts.verifier` doit etre marque par `operator-trust-verifier`.
   * `opts.provenanceAuthority` n'est plus une entree autoritaire. Un callback
   * d'appelant a zero effet.
   */
  if (opts.verifier && !OTV.isOperatorTrustVerifier(opts.verifier)) {
    return { status: PROVENANCE_STATUS.UNRESOLVED, sourceRootId: null, authorityRootId: null, familyRootId: null,
      contentHash: rec.contentHash || null,
      problems: ["verificateur fourni par l'appelant : IGNORE. Seul un verificateur issu d'une frontiere operateur "
        + "provisionnee peut designer l'autorite de provenance — un callback n'est pas un verificateur de confiance."] };
  }
  const verifier = OTV.isOperatorTrustVerifier(opts.verifier) ? opts.verifier : null;
  const authority = verifier ? verifier.provenanceAuthority() : null;
  const expectedIdentity = verifier ? verifier.boundaryIdentity : null;
  if (opts.provenanceAuthority && authority !== opts.provenanceAuthority) {
    // Consigne, sans effet : une autorite fournie en argument n'est pas retenue.
    // (le champ reste lisible dans le resultat pour la tracabilite)
  }
  if (!OPA.isProvisionedProvenanceAuthority(authority, expectedIdentity || undefined)) {
    return { status: PROVENANCE_STATUS.UNRESOLVED, sourceRootId: null, authorityRootId: null, familyRootId: null,
      contentHash: rec.contentHash || null,
      problems: ["aucune EvidenceProvenanceAuthority issue de la frontiere de ce run : les racines portees par "
        + "l'artefact sont des DECLARATIONS de l'appelant et ne sont pas authentifiables — fail closed"],
      callerAuthoritySupplied: !!opts.provenanceAuthority, callerAuthorityIgnored: true };
  }
  const resolved = authority.resolveRoots({ sourceRootId: rec.sourceRootId, locator: rec.locator || null,
    contentHash: rec.contentHash || null });
  if (resolved.status !== PROVENANCE_STATUS.AUTHENTICATED) {
    return { status: resolved.status, sourceRootId: resolved.sourceRootId, authorityRootId: null, familyRootId: null,
      contentHash: rec.contentHash || null, problems: resolved.problems,
      declaration: authority.declaredVersusAuthenticated(rec, resolved) };
  }
  return { status: PROVENANCE_STATUS.AUTHENTICATED,
    /** Racines AUTHENTIFIEES : celles du registre de l'exploitant. */
    sourceRootId: resolved.sourceRootId, authorityRootId: resolved.authorityRootId, familyRootId: resolved.familyRootId,
    /** §33 — l'empreinte du CONTENU : deux preuves au meme contenu n'en font qu'une. */
    contentHash: rec.contentHash || null,
    provenanceAuthorityId: authority.authorityId, derivationRef: resolved.derivationRef,
    declaration: authority.declaredVersusAuthenticated(rec, resolved),
    recordHash: sha256Of({ e: rec.evidenceId, s: resolved.sourceRootId, a: authority.authorityId }), problems: [] };
}

module.exports = { makeDocumentaryEvidenceRecord, resolveEvidenceSourceProvenance, PROVENANCE_STATUS };
