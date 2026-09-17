"use strict";
/**
 * MONO-10 v0.8 — adapters/upstream-evidence-binder.js   (§17 a §25, §32)
 *
 * FERMETURE B5 et B6.
 *
 * v0.6 avait livre ce pont parce que les lots amont expriment leurs preuves par
 * des CHAINES D'IDENTIFIANTS et non par des references de lignee resolvables.
 * L'audit independant a montre que le pont faisait deux choses qu'un pont ne
 * doit jamais faire :
 *
 *   B5 — il AFFIRMAIT de sa propre autorite `subjectBinding: "CONFIRMED"` et
 *        `verificationStatus: "VERIFIED"` sur un identifiant que l'amont
 *        n'avait jamais verifie, avec une contribution inventee de 0.6. Or
 *        CONFIRMED + VERIFIED suffit a atteindre MODERATE, c'est-a-dire
 *        exactement le seuil qui decide si un humain voit le candidat. Le pont
 *        fabriquait la propriete qui declenche la revue humaine.
 *
 *   B6 — deux sources DIFFERENTES portant le meme identifiant amont etaient
 *        resolues en silence par la derniere arrivee : `refByProviderWorkId`
 *        etait une Map, et `unidentified` restait vide.
 *
 * v0.7 — LE PONT EST UN TRADUCTEUR, PAS UNE AUTORITE (§18).
 *
 *   OUTPUT_TRUST_LEVEL <= INPUT_TRUST_LEVEL
 *
 * Il peut resoudre un identifiant, retrouver un artefact, produire une
 * reference structuree et conserver les proprietes amont. Il ne peut pas
 * augmenter la force epistemique :
 *
 *   - sans preuve amont correspondante, l'assertion vaut UNKNOWN (§19) ;
 *   - aucune contribution n'est inventee : elle vaut 0 (§20) ;
 *   - un identifiant ambigu n'est JAMAIS resolu (§22, §23) : la reference
 *     n'est pas produite, l'ambiguite est rendue explicite, et le candidat
 *     reste AMBIGUOUS — ce que l'ADN exige ;
 *   - les racines d'autorite et de famille ne sont plus des parametres : elles
 *     sont resolues par `EvidenceProvenanceAuthority` (§32).
 */

const { sha256Of, isNonEmptyStr, fail } = require("../core/canonical.js");
const { artifactRef, RELATION } = require("../core/lineage.js");
const { makeDocumentaryEvidenceRecord } = require("../core/evidence-source-provenance.js");
const CC = require("../core/canonical-contracts.js");
const AC = require("../core/artifact-capabilities.js");
const OPA = require("../core/operator-provenance-authority.js");
const RM = require("../core/run-evidence-manifest.js");

const UPSTREAM = CC.UPSTREAM_ASSERTION;

/**
 * createUpstreamEvidenceBinder({ registry, manifest, provenanceAuthority, artifactIdPrefix })
 *
 * `provenanceAuthority` n'est pas optionnelle pour obtenir une preuve
 * presentable a un humain : sans elle, l'artefact est enregistre (donc
 * RUN_BOUND) mais n'obtient jamais AUTHENTICATED_PROVENANCE, et le sink
 * `panel-gate:evidence-presented-to-human` le refusera.
 */
function createUpstreamEvidenceBinder(input) {
  input = input || {};
  const registry = input.registry, manifest = input.manifest;
  if (!registry || typeof registry.register !== "function") throw fail("BINDER_REGISTRY_REQUIRED", "registre d'artefacts authentifie requis.");
  if (!manifest) throw fail("BINDER_MANIFEST_REQUIRED", "manifeste de run requis.");
  const prefix = isNonEmptyStr(input.artifactIdPrefix) ? input.artifactIdPrefix : "upstream-evidence";
  /**
   * §5/§12 (v0.8) — l'autorite doit appartenir a la frontiere qui a ouvert CE
   * run. Une autorite construite ailleurs, meme authentiquement marquee, est
   * refusee : le pont ne choisit pas qui authentifie la provenance.
   */
  const expectedBoundaryId = manifest.operatorTrustBoundaryId || null;
  const expect = { operatorBoundaryId: expectedBoundaryId };
  const fromVerifier = (input.verifier && typeof input.verifier.provenanceAuthority === "function")
    ? input.verifier.provenanceAuthority() : null;
  const authority = OPA.isProvisionedProvenanceAuthority(input.provenanceAuthority, expect) ? input.provenanceAuthority
    : (OPA.isProvisionedProvenanceAuthority(fromVerifier, expect) ? fromVerifier : null);

  /**
   * bind(descriptor) — enregistre la preuve amont OBSERVEE, puis DEMANDE son
   * authentification de provenance. L'autorite decide ; le pont n'affirme rien.
   */
  function bind(descriptor) {
    if (!descriptor || !isNonEmptyStr(descriptor.evidenceId)) throw fail("BINDER_DESCRIPTOR_INVALID", "evidenceId requis.");
    if (!isNonEmptyStr(descriptor.sourceRootId)) {
      return { artifactId: null, ref: null, provenanceStatus: CC.PROVENANCE_STATUS.ABSENT,
        reason: "aucun identifiant de source : rien n'est enregistre, rien n'est invente" };
    }
    const artifactId = prefix + ":" + descriptor.evidenceId;
    // §32 — le pont ne declare AUCUNE racine d'autorite ni de famille.
    const record = makeDocumentaryEvidenceRecord({
      evidenceId: descriptor.evidenceId, sourceRootId: descriptor.sourceRootId,
      retrievedAt: descriptor.retrievedAt || null, locator: descriptor.locator || null,
      contentHash: descriptor.contentHash || null,
    });
    const bound = RM.bindArtifact(manifest, record, artifactId, record.schema);
    registry.register({ artifactId: artifactId, relation: RELATION.DOCUMENTARY_EVIDENCE, artifact: bound });
    const entry = registry.get(artifactId);
    const ref = artifactRef(entry.artifact, artifactId, RELATION.DOCUMENTARY_EVIDENCE);

    let provenanceStatus = CC.PROVENANCE_STATUS.UNRESOLVED, problems = ["aucune autorite de provenance provisionnee"];
    if (authority) {
      const resolved = authority.resolveRoots({ sourceRootId: descriptor.sourceRootId,
        locator: descriptor.locator || null, contentHash: descriptor.contentHash || null });
      provenanceStatus = resolved.status;
      problems = resolved.problems;
      if (resolved.status === CC.PROVENANCE_STATUS.AUTHENTICATED) {
        // La capacite est EMISE PAR L'AUTORITE, avec la derivation qui l'etablit.
        const grant = AC.mintCapabilityGrant({ issuer: authority, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
          artifactId: artifactId, artifactHash: entry.hash, artifactSchema: entry.artifactType,
          runId: manifest.runId, missionHash: manifest.missionHash,
          /** §11 (v0.8) — la capacite nomme la frontiere qui a ouvert ce run. */
          operatorBoundaryId: manifest.operatorTrustBoundaryId,
          issuerId: authority.authorityId, derivationRef: resolved.derivationRef });
        registry.grantCapability(artifactId, grant);
      }
    }
    return { artifactId: artifactId, ref: ref, provenanceStatus: provenanceStatus, problems: problems, reason: null };
  }

  return { bind: bind, artifactIdPrefix: prefix, provenanceAuthorityBound: !!authority };
}

/**
 * bindScreenedSources — §22 a §25.
 *
 * `screenedSources` : [{ localSourceId, providerWorkId, observed, retrievedAt }]
 *
 * Rend :
 *   refByProviderWorkId  identifiant -> reference UNIQUE (uniquement si prouvee unique)
 *   candidatesByIdentifier  identifiant -> [toutes les references enregistrees]  (§23 multimap)
 *   ambiguous[]          identifiants a plusieurs contenus distincts — JAMAIS resolus
 *   unidentified[]       sources sans identifiant fort — jamais comblees
 *   deduplicated[]       identifiants dont l'egalite canonique est PROUVEE
 */
function bindScreenedSources(input) {
  input = input || {};
  const binder = input.binder || createUpstreamEvidenceBinder(input);
  const byIdentifier = new Map();      // identifiant -> [{ref, contentHash, localSourceId, provenanceStatus}]
  const unidentified = [];

  (input.screenedSources || []).forEach(function (s) {
    if (!s || !isNonEmptyStr(s.providerWorkId)) {
      unidentified.push({ localSourceId: (s && s.localSourceId) || null,
        reason: "source retenue sans identifiant fort : aucune reference de lignee n'est creee, aucun identifiant n'est fabrique" });
      return;
    }
    const contentHash = sha256Of({ observedSourceRecord: s.observed || s });
    const r = binder.bind({ evidenceId: "source:" + (s.localSourceId || s.providerWorkId),
      sourceRootId: s.providerWorkId, retrievedAt: isNonEmptyStr(s.retrievedAt) ? s.retrievedAt : null,
      locator: s.providerWorkId, contentHash: contentHash });
    if (!byIdentifier.has(s.providerWorkId)) byIdentifier.set(s.providerWorkId, []);
    byIdentifier.get(s.providerWorkId).push({ ref: r.ref, contentHash: contentHash,
      localSourceId: s.localSourceId || null, artifactId: r.artifactId, provenanceStatus: r.provenanceStatus });
  });

  const refByProviderWorkId = new Map();
  const ambiguous = [];
  const deduplicated = [];
  byIdentifier.forEach(function (list, identifier) {
    const distinctContent = [];
    list.forEach(function (x) { if (distinctContent.indexOf(x.contentHash) === -1) distinctContent.push(x.contentHash); });
    if (distinctContent.length === 1) {
      // §24 — egalite canonique PROUVEE par l'empreinte de contenu : une seule
      // preuve, la deduplication est licite et consignee.
      refByProviderWorkId.set(identifier, list[0].ref);
      if (list.length > 1) {
        deduplicated.push({ identifier: identifier, occurrences: list.length,
          contentHash: distinctContent[0], localSourceIds: list.map((x) => x.localSourceId),
          reason: "meme identifiant ET meme contenu : egalite canonique prouvee" });
      }
      return;
    }
    // §22 — AMBIGU. Ni le premier, ni le dernier, ni un choix silencieux.
    ambiguous.push({ identifier: identifier, occurrences: list.length,
      distinctContentHashes: distinctContent.slice(),
      artifactIds: list.map((x) => x.artifactId),
      localSourceIds: list.map((x) => x.localSourceId),
      reason: "le meme identifiant amont designe " + distinctContent.length + " contenus distincts — "
        + "aucune reference n'est produite ; l'ambiguite reste ouverte jusqu'a resolution explicite" });
  });

  return { binder: binder, refByProviderWorkId: refByProviderWorkId,
    candidatesByIdentifier: byIdentifier, ambiguous: ambiguous, unidentified: unidentified,
    deduplicated: deduplicated,
    summary: { identifiers: byIdentifier.size, resolved: refByProviderWorkId.size,
      ambiguous: ambiguous.length, unidentified: unidentified.length, deduplicated: deduplicated.length } };
}

/** bindResolvedIdentities — meme discipline : aucune racine declaree, ambiguite explicite. */
function bindResolvedIdentities(input) {
  input = input || {};
  const binder = input.binder || createUpstreamEvidenceBinder(input);
  const byCandidate = new Map();
  const unresolved = [];
  ((input.discovery && input.discovery.candidates) || []).forEach(function (c) {
    if (!c || !isNonEmptyStr(c.candidateRef)) {
      unresolved.push({ displayName: (c && c.displayName) || null,
        reason: "identite non resolue par le lot amont : aucune reference de lignee n'est creee" });
      return;
    }
    if (byCandidate.has(c.candidateRef)) {
      unresolved.push({ candidateRef: c.candidateRef,
        reason: "identifiant d'auteur amont presente plusieurs fois : ambiguite, aucune resolution silencieuse" });
      byCandidate.set(c.candidateRef, null);
      return;
    }
    const r = binder.bind({ evidenceId: "identite:" + c.candidateRef, sourceRootId: c.candidateRef,
      retrievedAt: isNonEmptyStr(input.retrievedAt) ? input.retrievedAt : null, locator: c.candidateRef,
      contentHash: sha256Of({ candidateRef: c.candidateRef, resolutionStatus: c.resolutionStatus || null,
        affiliation: c.affiliation || null, provenance: c.provenance || [] }) });
    byCandidate.set(c.candidateRef, r.ref);
  });
  const refByCandidateRef = new Map();
  byCandidate.forEach(function (v, k) { if (v) refByCandidateRef.set(k, v); });
  return { binder: binder, refByCandidateRef: refByCandidateRef, unresolved: unresolved };
}

/**
 * bindUpstreamDiscovery — §17 a §21.
 *
 * L'artefact amont n'est NI modifie NI remplace. Les proprietes amont sont
 * CONSERVEES ; aucune n'est renforcee.
 *
 * `upstreamVerification` (facultatif) : l'artefact de verification produit par
 * le lot amont. S'il atteste explicitement un candidat, le pont le CONSIGNE
 * tel quel. Sinon l'assertion reste UNKNOWN — jamais CONFIRMED, jamais VERIFIED.
 */
function bindUpstreamDiscovery(input) {
  input = input || {};
  const discovery = input.discovery;
  if (!discovery || discovery.schema !== "EvidenceForge.ProfessionalDiscovery") {
    throw fail("BINDER_DISCOVERY_INVALID", "ProfessionalDiscovery amont requise.");
  }
  const sourceRefs = input.sourceRefByProviderWorkId || new Map();
  const identityRefs = input.identityRefByCandidateRef || new Map();
  const ambiguousIdentifiers = new Set((input.ambiguousIdentifiers || []).map((a) => (a && a.identifier) || a));
  const verifiedByRef = new Map();
  ((input.upstreamVerification && input.upstreamVerification.verified) || []).forEach(function (v) {
    if (v && isNonEmptyStr(v.candidateRef)) verifiedByRef.set(v.candidateRef, v);
  });
  const unbound = [];
  const ambiguousCandidates = [];

  const candidates = (discovery.candidates || []).map(function (c) {
    const refs = [], missing = [], ambiguousHere = [];
    (Array.isArray(c.evidenceRefs) ? c.evidenceRefs : []).forEach(function (key) {
      if (ambiguousIdentifiers.has(key)) { ambiguousHere.push(key); return; }
      const r = sourceRefs.get(key);
      if (r) refs.push(r); else missing.push(key);
    });
    if (missing.length) unbound.push({ candidateRef: c.candidateRef || null, missing: missing });
    if (ambiguousHere.length) ambiguousCandidates.push({ candidateRef: c.candidateRef || null, ambiguous: ambiguousHere });

    const identityRef = identityRefs.get(c.candidateRef) || null;
    const up = verifiedByRef.get(c.candidateRef) || null;

    /**
     * §19/§20 — l'assertion amont est CONSIGNEE, jamais renforcee.
     * Une chaine d'identifiant sans preuve amont correspondante vaut UNKNOWN,
     * et sa contribution vaut 0 : elle ne franchit aucun seuil a elle seule.
     */
    const upstreamAssertion = (up && up.verificationStatus === "VERIFIED") ? UPSTREAM.CONFIRMED
      : (up && up.verificationStatus === "AMBIGUOUS") ? UPSTREAM.AMBIGUOUS
      : (up && up.verificationStatus === "UNVERIFIED") ? UPSTREAM.ASSERTED
      : UPSTREAM.UNKNOWN;
    const identifiers = [];
    if (isNonEmptyStr(input.strongIdentifierField) && isNonEmptyStr(c[input.strongIdentifierField])) {
      identifiers.push({
        type: "identifiant-amont", value: c[input.strongIdentifierField],
        provenanceRef: identityRef,
        /** §19 — jamais CONFIRMED de l'autorite du pont. */
        subjectBinding: UPSTREAM.UNKNOWN,
        verificationStatus: UPSTREAM.UNKNOWN,
        /** §20 — aucune force inventee. */
        confidenceContribution: 0,
        upstreamAssertion: upstreamAssertion,
        note: "assertion CONSIGNEE depuis le lot amont ; le pont n'augmente aucune force epistemique (§18)",
      });
    }

    return Object.assign({}, c, {
      evidenceRefs: refs,
      provenanceRef: identityRef,
      identifiers: identifiers,
      upstreamEvidenceRefs: (Array.isArray(c.evidenceRefs) ? c.evidenceRefs.slice() : []),
      upstreamVerificationStatus: (up && up.verificationStatus) || null,
      /** L'ambiguite amont se PROPAGE : elle ne disparait pas au passage du pont. */
      identityAmbiguity: ambiguousHere.length ? "UPSTREAM_IDENTIFIER_AMBIGUOUS" : (c.identityAmbiguity || null),
      evidenceBinding: { boundSources: refs.length, unboundUpstreamRefs: missing,
        ambiguousUpstreamRefs: ambiguousHere, identityProvenanceBound: identityRef !== null,
        assertionCeiling: upstreamAssertion,
        invariant: "OUTPUT_TRUST_LEVEL <= INPUT_TRUST_LEVEL" },
    });
  });

  return {
    schema: "EvidenceForge.ProfessionalDiscovery",
    schemaVersion: (discovery.schemaVersion || "?") + "+MONO-10-v7-evidence-bound",
    missionId: discovery.missionId || null,
    discoveryPolicy: discovery.discoveryPolicy || null,
    candidates: candidates,
    inputStats: discovery.inputStats || null,
    antiCircularity: discovery.antiCircularity || null,
    derivedFrom: { upstreamDiscoveryRef: input.upstreamDiscoveryRef || null,
      note: "artefact DERIVE : l'artefact amont n'est ni modifie ni remplace ; seules les references de preuve sont "
        + "resolues contre le registre authentifie, et aucune propriete amont n'est renforcee." },
    evidenceBindingSummary: { candidates: candidates.length,
      withBoundSources: candidates.filter((c) => c.evidenceRefs.length > 0).length,
      withBoundIdentityProvenance: candidates.filter((c) => c.provenanceRef !== null).length,
      withAmbiguousUpstreamIdentifier: ambiguousCandidates.length,
      unbound: unbound, ambiguousCandidates: ambiguousCandidates },
  };
}

module.exports = { createUpstreamEvidenceBinder, bindScreenedSources, bindResolvedIdentities,
  bindUpstreamDiscovery, UPSTREAM };
