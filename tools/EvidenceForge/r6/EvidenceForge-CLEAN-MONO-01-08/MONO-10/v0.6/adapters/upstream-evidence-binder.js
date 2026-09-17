"use strict";
/**
 * MONO-10 v0.6 — adapters/upstream-evidence-binder.js   (§13)
 *
 * CONSTAT v0.6. Les lots amont expriment leurs preuves par des CHAINES
 * D'IDENTIFIANTS (identifiant de travail fournisseur, identifiant d'auteur
 * fournisseur). MONO-10 exige, depuis v0.5, que toute preuve presentee a un
 * humain RESOLVE contre le registre d'artefacts authentifie du run. Les deux
 * contrats ne se rejoignent pas d'eux-memes : une chaine n'est pas une
 * reference de lignee.
 *
 * Tant que ce pont n'etait pas livre, le raccord reel ne pouvait pas etre
 * traverse — seules des fixtures qui inventaient deja des references de lignee
 * passaient la porte. C'etait un defaut de LIVRAISON, pas de verification :
 * le garde faisait exactement son travail en refusant.
 *
 * Ce module fait le seul geste legitime : il ENREGISTRE la preuve amont
 * observee comme artefact `DocumentaryEvidenceRecord` dans le registre
 * authentifie, puis produit une ProfessionalDiscovery DERIVEE dont les
 * references sont resolvables. Il n'invente aucune racine :
 *
 *   - une source sans identifiant fort ne recoit AUCUNE reference : elle est
 *     rendue dans `unidentified`, jamais comblee ;
 *   - `contentHash` est l'empreinte de l'ENREGISTREMENT TEL QU'OBSERVE, pas
 *     celle du document lui-meme — le nom du champ ne promet rien de plus ;
 *   - les racines d'autorite et de famille sont celles DECLAREES PAR LA
 *     COLLECTE (connecteur de corpus, service de resolution d'identite). Deux
 *     preuves issues du meme connecteur partagent donc leur racine : elles ne
 *     produiront jamais une fausse independance.
 *
 * Ce module ne connait aucun metier, aucune discipline, aucun fournisseur : il
 * ne lit que la forme du contrat amont, et le nom du champ portant
 * l'identifiant fort lui est PASSE par l'appelant.
 */

const { sha256Of, isNonEmptyStr, fail } = require("../core/canonical.js");
const { artifactRef, RELATION } = require("../core/lineage.js");
const { makeDocumentaryEvidenceRecord } = require("../core/evidence-source-provenance.js");
const RM = require("../core/run-evidence-manifest.js");

/**
 * createUpstreamEvidenceBinder({ registry, manifest, artifactIdPrefix })
 * Enregistre des preuves documentaires dans le registre AUTHENTIFIE du run.
 */
function createUpstreamEvidenceBinder(input) {
  input = input || {};
  const registry = input.registry, manifest = input.manifest;
  if (!registry || typeof registry.register !== "function") throw fail("BINDER_REGISTRY_REQUIRED", "registre d'artefacts authentifie requis.");
  if (!manifest) throw fail("BINDER_MANIFEST_REQUIRED", "manifeste de run requis.");
  const prefix = isNonEmptyStr(input.artifactIdPrefix) ? input.artifactIdPrefix : "upstream-evidence";

  function bind(descriptor) {
    if (!descriptor || !isNonEmptyStr(descriptor.evidenceId)) throw fail("BINDER_DESCRIPTOR_INVALID", "evidenceId requis.");
    if (!isNonEmptyStr(descriptor.sourceRootId)) return { artifactId: null, ref: null, reason: "aucun identifiant de source : rien n'est enregistre" };
    const artifactId = prefix + ":" + descriptor.evidenceId;
    const record = makeDocumentaryEvidenceRecord(descriptor);
    const bound = RM.bindArtifact(manifest, record, artifactId, record.schema);
    registry.register({ artifactId: artifactId, relation: RELATION.DOCUMENTARY_EVIDENCE, artifact: bound });
    return { artifactId: artifactId, ref: artifactRef(registry.get(artifactId).artifact, artifactId, RELATION.DOCUMENTARY_EVIDENCE), reason: null };
  }

  return { bind: bind, artifactIdPrefix: prefix };
}

/**
 * bindScreenedSources — une source retenue par un humain devient une preuve
 * documentaire enregistree. `screenedSources` porte la forme du contrat amont :
 *   { localSourceId, providerWorkId, titre, reference, retrievedAt, observed }
 * `observed` est l'enregistrement brut tel que recu ; son empreinte est
 * consignee sans pretendre etre celle du document.
 */
function bindScreenedSources(input) {
  input = input || {};
  const binder = input.binder || createUpstreamEvidenceBinder(input);
  const authority = isNonEmptyStr(input.collectionAuthorityId) ? input.collectionAuthorityId : null;
  const family = isNonEmptyStr(input.collectionFamilyId) ? input.collectionFamilyId : null;
  const refByProviderWorkId = new Map();
  const unidentified = [];
  (input.screenedSources || []).forEach(function (s) {
    if (!s || !isNonEmptyStr(s.providerWorkId)) { unidentified.push({ localSourceId: (s && s.localSourceId) || null,
      reason: "source retenue sans identifiant fort : aucune reference de lignee n'est creee" }); return; }
    const r = binder.bind({ evidenceId: "source:" + (s.localSourceId || s.providerWorkId),
      sourceRootId: s.providerWorkId, authorityRootId: authority, familyRootId: family,
      retrievedAt: isNonEmptyStr(s.retrievedAt) ? s.retrievedAt : null,
      locator: s.providerWorkId,
      contentHash: sha256Of({ observedSourceRecord: s.observed || s }) });
    if (r.ref) refByProviderWorkId.set(s.providerWorkId, r.ref);
  });
  return { binder: binder, refByProviderWorkId: refByProviderWorkId, unidentified: unidentified };
}

/**
 * bindResolvedIdentities — la resolution d'identite amont est une preuve d'une
 * AUTRE autorite que le corpus. Elle est enregistree comme telle ; si elle n'a
 * pas abouti, aucune reference n'est creee.
 */
function bindResolvedIdentities(input) {
  input = input || {};
  const binder = input.binder || createUpstreamEvidenceBinder(input);
  const authority = isNonEmptyStr(input.resolverAuthorityId) ? input.resolverAuthorityId : null;
  const family = isNonEmptyStr(input.resolverFamilyId) ? input.resolverFamilyId : null;
  const refByCandidateRef = new Map();
  const unresolved = [];
  ((input.discovery && input.discovery.candidates) || []).forEach(function (c) {
    if (!c || !isNonEmptyStr(c.candidateRef)) { unresolved.push({ displayName: (c && c.displayName) || null,
      reason: "identite non resolue par le lot amont : aucune reference de lignee n'est creee" }); return; }
    const r = binder.bind({ evidenceId: "identite:" + c.candidateRef,
      sourceRootId: c.candidateRef, authorityRootId: authority, familyRootId: family,
      retrievedAt: isNonEmptyStr(input.retrievedAt) ? input.retrievedAt : null,
      locator: c.candidateRef,
      contentHash: sha256Of({ candidateRef: c.candidateRef, resolutionStatus: c.resolutionStatus || null,
        affiliation: c.affiliation || null, provenance: c.provenance || [] }) });
    if (r.ref) refByCandidateRef.set(c.candidateRef, r.ref);
  });
  return { binder: binder, refByCandidateRef: refByCandidateRef, unresolved: unresolved };
}

/**
 * bindUpstreamDiscovery — produit une ProfessionalDiscovery DERIVEE dont les
 * references resolvent contre le registre authentifie. L'artefact amont n'est
 * NI modifie NI remplace : il reste enregistre et il est reference.
 *
 * `strongIdentifierField` : nom du champ portant l'identifiant fort du lot
 * amont. L'appelant le declare ; ce module n'en connait aucun.
 */
function bindUpstreamDiscovery(input) {
  input = input || {};
  const discovery = input.discovery;
  if (!discovery || discovery.schema !== "EvidenceForge.ProfessionalDiscovery") {
    throw fail("BINDER_DISCOVERY_INVALID", "ProfessionalDiscovery amont requise.");
  }
  const sourceRefs = input.sourceRefByProviderWorkId || new Map();
  const identityRefs = input.identityRefByCandidateRef || new Map();
  const field = isNonEmptyStr(input.strongIdentifierField) ? input.strongIdentifierField : null;
  const unbound = [];

  const candidates = (discovery.candidates || []).map(function (c) {
    const refs = [], missing = [];
    (Array.isArray(c.evidenceRefs) ? c.evidenceRefs : []).forEach(function (key) {
      const r = sourceRefs.get(key);
      if (r) refs.push(r); else missing.push(key);
    });
    if (missing.length) unbound.push({ candidateRef: c.candidateRef || null, missing: missing });
    const identityRef = identityRefs.get(c.candidateRef) || null;
    const identifiers = [];
    if (field && isNonEmptyStr(c[field]) && refs.length) {
      // L'identifiant fort amont est corrobore par la SOURCE de corpus, pas par
      // le service qui l'a resolu : sa provenance pointe vers la preuve de corpus.
      identifiers.push({ type: "identifiant-fort-amont", value: c[field], provenanceRef: refs[0],
        subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
    }
    return Object.assign({}, c, {
      evidenceRefs: refs,
      provenanceRef: identityRef,
      identifiers: identifiers,
      upstreamEvidenceRefs: (Array.isArray(c.evidenceRefs) ? c.evidenceRefs.slice() : []),
      evidenceBinding: { boundSources: refs.length, unboundUpstreamRefs: missing,
        identityProvenanceBound: identityRef !== null },
    });
  });

  return {
    schema: "EvidenceForge.ProfessionalDiscovery",
    schemaVersion: (discovery.schemaVersion || "?") + "+MONO-10-v6-evidence-bound",
    missionId: discovery.missionId || null,
    discoveryPolicy: discovery.discoveryPolicy || null,
    candidates: candidates,
    inputStats: discovery.inputStats || null,
    antiCircularity: discovery.antiCircularity || null,
    derivedFrom: { upstreamDiscoveryRef: input.upstreamDiscoveryRef || null,
      note: "artefact DERIVE : l'artefact amont n'est ni modifie ni remplace ; seules les references de preuve sont resolues contre le registre authentifie." },
    evidenceBindingSummary: { candidates: candidates.length,
      withBoundSources: candidates.filter((c) => c.evidenceRefs.length > 0).length,
      withBoundIdentityProvenance: candidates.filter((c) => c.provenanceRef !== null).length,
      unbound: unbound },
  };
}

module.exports = { createUpstreamEvidenceBinder, bindScreenedSources, bindResolvedIdentities, bindUpstreamDiscovery };
