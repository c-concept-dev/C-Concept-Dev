"use strict";
/**
 * MONO-10 v0.9 — core/authenticated-artifact-registry.js   (§15–§19, §57)
 *
 * FERMETURES v0.5 B04 et §16.
 *
 * v0.5 : la fabrique n'exigeait que `assertManifestShape` — la COHERENCE du
 * manifeste, pas son AUTHENTICITE. Et un artefact fabrique apres l'attestation,
 * hache puis insere, obtenait le meme poids qu'une preuve authentifiee : le
 * registre transformait « enregistre » en « authentifie ».
 *
 * v0.6 apporte quatre changements :
 *
 *   §16  la fabrique EXIGE `assertManifestAuthentic` : sans attestation
 *        verifiee, aucun registre authentifie n'existe.
 *   §15  chaque artefact est canonicalise, hache, GELE EN PROFONDEUR, et relu
 *        avec recalcul : une mutation apres enregistrement est detectee.
 *   §17  les enregistrements forment une CHAINE APPEND-ONLY : chaque evenement
 *        depend du precedent (`previousEventHash`, `sequence`). Toute
 *        suppression, reordonnancement ou modification invalide la chaine.
 *   §19  `REGISTERED_IN_RUN` n'est jamais synonyme d'`AUTHENTICATED_AS_EVIDENCE` :
 *        le niveau de confiance est porte explicitement par chaque entree.
 */

const { canonical, sha256Of, artifactHash, bareArtifact, isNonEmptyStr, fail } = require("./canonical.js");
const { EXPECTED_PARENTS, ARTIFACT_TYPE_OF_RELATION } = require("./lineage.js");
const AC = require("./artifact-capabilities.js");
const RM = require("./run-evidence-manifest.js");

const REGISTRY_BRAND = new WeakSet();
function isAuthenticatedRegistry(r) { return !!r && REGISTRY_BRAND.has(r); }

function assertAuthenticatedRegistry(r, manifest, label) {
  label = label || "registre d'artefacts";
  if (!isAuthenticatedRegistry(r)) {
    throw fail("ARTIFACT_REGISTRY_FORGED", label + " : registre non issu d'une fabrique authentifiee — un appelant ne declare pas sa propre realite.");
  }
  if (manifest) {
    if (r.runId !== manifest.runId) throw fail("ARTIFACT_REGISTRY_RUN_MISMATCH", label + " : registre d'un autre run.");
    if (r.attestationHash !== manifest.runtimeAttestationHash) throw fail("ARTIFACT_REGISTRY_RUN_MISMATCH", label + " : registre atteste autrement.");
  }
  return true;
}

/** Gel en profondeur : le contenu enregistre ne peut plus bouger silencieusement. */
function deepFreeze(o) {
  if (o === null || typeof o !== "object" || Object.isFrozen(o)) return o;
  Object.getOwnPropertyNames(o).forEach((k) => { deepFreeze(o[k]); });
  return Object.freeze(o);
}

/** §17 — un evenement d'enregistrement, chaine au precedent. */
function registryEvent(input) {
  return {
    sequence: input.sequence, previousEventHash: input.previousEventHash,
    runId: input.runId, missionHash: input.missionHash,
    artifactId: input.artifactId, artifactHash: input.artifactHash,
    artifactType: input.artifactType, relation: input.relation,
    producerRef: input.producerRef || null, capabilities: input.capabilities,
    timestamp: input.timestamp,
  };
}
function eventHash(e) { return sha256Of(e); }

/**
 * openAuthenticatedArtifactRegistry(manifest, ctx)
 * ctx : { verifier, attestation, now } — le meme contexte que le manifeste.
 * §16 — l'authenticite est verifiee ICI, pas supposee.
 */
function openAuthenticatedArtifactRegistry(manifest, ctx) {
  RM.assertManifestAuthentic(manifest, ctx || {});
  const byId = new Map();
  const events = [];
  let lastHash = manifest.runManifestRootHash;   // §18 — la racine d'ouverture amorce la chaine
  let seq = 0;

  function append(entry) {
    const tag = "enregistrement[" + entry.artifactId + "]";
    if (!isNonEmptyStr(entry.artifactId)) throw fail("REGISTRY_INVALID", "artifactId requis.");
    if (byId.has(entry.artifactId)) throw fail("REGISTRY_DUPLICATE", tag + " : artifactId deja enregistre — la chaine est append-only, pas reinscriptible.");
    if (!isNonEmptyStr(entry.relation) || !Object.prototype.hasOwnProperty.call(EXPECTED_PARENTS, entry.relation)) {
      throw fail("REGISTRY_INVALID", tag + " : relation \"" + entry.relation + "\" hors du graphe canonique.");
    }
    // §38 — le TYPE doit correspondre a la relation, pas seulement l'etiquette.
    const expectedType = ARTIFACT_TYPE_OF_RELATION[entry.relation];
    const actualType = entry.artifact && entry.artifact.schema;
    if (expectedType && actualType !== expectedType) {
      throw fail("REGISTRY_TYPE_RELATION_MISMATCH", tag + " : la relation \"" + entry.relation + "\" exige le type \""
        + expectedType + "\", l'artefact porte \"" + actualType + "\".");
    }
    // L'appartenance au run est VERIFIEE, jamais declaree.
    RM.assertArtifactBoundToRun(entry.artifact, manifest, tag);
    const frozen = deepFreeze(JSON.parse(JSON.stringify(entry.artifact)));
    const h = artifactHash(frozen);
    const b = frozen.runBinding;

    // §26/§31 — a l'enregistrement, l'artefact ne porte qu'une seule capacite :
    // RUN_BOUND. Elle est etablie par la liaison verifiee ci-dessus, et elle ne
    // dit rien de l'authenticite de la preuve ni d'un acte humain.
    const capabilities = [AC.CAPABILITY.RUN_BOUND];
    seq += 1;
    const ev = registryEvent({ sequence: seq, previousEventHash: lastHash, runId: manifest.runId,
      missionHash: manifest.missionHash, artifactId: entry.artifactId, artifactHash: h,
      artifactType: actualType || null, relation: entry.relation,
      producerRef: entry.producerRef || null, capabilities: capabilities.slice(),
      timestamp: entry.timestamp || new Date().toISOString() });
    ev.eventHash = eventHash(ev);
    lastHash = ev.eventHash;
    events.push(Object.freeze(ev));
    byId.set(entry.artifactId, Object.freeze({ relation: entry.relation, artifactType: actualType || null,
      artifact: frozen, hash: h, runId: b.runId, missionHash: b.missionHash, attestationHash: b.attestationHash,
      capabilities: Object.freeze(capabilities.slice()), artifactId: entry.artifactId,
      sequence: seq, eventHash: ev.eventHash }));
    return ev;
  }

  const reg = {
    schema: "EvidenceForge.AuthenticatedArtifactRegistry", schemaVersion: "MONO-10-v8",
    runId: manifest.runId, missionHash: manifest.missionHash,
    attestationHash: manifest.runtimeAttestationHash,
    operatorTrustBoundaryId: manifest.operatorTrustBoundaryId,
    executionMode: manifest.executionMode,
    initialRootHash: manifest.runManifestRootHash,
    register(entry) { return append(entry); },
    registerAll(entries) { return (entries || []).map(append); },
    /** §18 — la racine courante, deterministe, derivee de toute la chaine. */
    get registryRootHash() { return lastHash; },
    get size() { return byId.size; },
    get eventCount() { return events.length; },
    eventLog() { return events.slice(); },
    /** §49 — la racine telle qu'elle etait AVANT l'evenement `n` (1-indexe). */
    rootBeforeSequence(n) {
      if (typeof n !== "number" || n < 1) return null;
      if (n === 1) return manifest.runManifestRootHash;
      const prev = events[n - 2];
      return prev ? prev.eventHash : null;
    },
    sequenceOf(artifactId) { const e = byId.get(artifactId); return e ? e.sequence : null; },
    /**
     * §15 — get() relit avec RECALCUL : si le contenu avait ete mute, la
     * relecture le detecterait. L'objet rendu est gele en profondeur.
     */
    get(artifactId) {
      const e = byId.get(artifactId);
      if (!e) return null;
      const now = artifactHash(e.artifact);
      if (now !== e.hash) {
        throw fail("ARTIFACT_CONTENT_MUTATED", "artefact \"" + artifactId + "\" modifie apres enregistrement — detecte au recalcul.");
      }
      return e;
    },
    has(artifactId) { return byId.has(artifactId); },
    entries() { return Array.from(byId.entries()).map(([id, e]) => ({ artifactId: id, relation: e.relation, sha256: e.hash, capabilities: e.capabilities.slice(), sequence: e.sequence })); },
    forEach(fn) { byId.forEach((v, k) => fn(v, k)); },
    /** §19 — eleve un artefact a AUTHENTICATED_PROVENANCE, sur preuve explicite. */
    /**
     * §27 — grantCapability(artifactId, grant)
     *
     * Remplace `elevate(id, niveau, justificationHash)` de v0.6, qui acceptait
     * n'importe quelle chaine comme justification : un artefact documentaire
     * synthetique atteignait le niveau le plus eleve avec le hash d'un texte
     * arbitraire. Ici, `grant` doit etre une CONCESSION EMISE par la capacite
     * operateur competente (`artifact-capabilities.mintCapabilityGrant`) et
     * porter la derivation qui l'etablit. Un objet de forme compatible, un
     * hash ou une chaine sont refuses.
     */
    grantCapability(artifactId, grant) {
      const e = byId.get(artifactId);
      if (!e) throw fail("REGISTRY_UNKNOWN_ARTIFACT", "artefact \"" + artifactId + "\" inconnu.");
      if (!AC.isCapabilityGrant(grant)) {
        throw fail("CAPABILITY_GRANT_FORGED",
          "concession de capacite absente ou fabriquee : seule une capacite operateur provisionnee en emet une. "
          + "Un hash fourni par l'appelant n'est pas une justification.");
      }
      // §4 (v0.9) — l'identite COMPOSITE de frontiere est comparee D'ABORD :
      // une concession venue d'une autre configuration doit etre diagnostiquee
      // comme telle, et non masquee par un ecart de run.
      AC.assertGrantBoundary(grant, { operatorBoundaryId: manifest.operatorTrustBoundaryId,
        configBindingHash: manifest.configBindingHash, executionMode: manifest.executionMode },
        "enregistrement de capacite");
      if (grant.artifactId !== artifactId) throw fail("CAPABILITY_GRANT_MISBOUND", "la concession vise un autre artefact.");
      if (grant.artifactHash !== e.hash) throw fail("CAPABILITY_GRANT_MISBOUND", "la concession vise un autre contenu que celui enregistre.");
      if (grant.artifactSchema !== e.artifactType) throw fail("CAPABILITY_GRANT_MISBOUND", "la concession vise un autre type d'artefact.");
      if (grant.runId !== manifest.runId || grant.missionHash !== manifest.missionHash) {
        throw fail("CAPABILITY_GRANT_MISBOUND", "la concession n'appartient pas a ce run ou a cette mission.");
      }
      // §12 — une concession emise sous une AUTRE frontiere operateur est refusee,
      // meme si l'artefact, le run et la mission concordent.
      if (e.capabilities.indexOf(grant.capability) !== -1) return true;
      seq += 1;
      const caps = e.capabilities.concat([grant.capability]);
      const ev = registryEvent({ sequence: seq, previousEventHash: lastHash, runId: manifest.runId,
        missionHash: manifest.missionHash, artifactId: artifactId, artifactHash: e.hash,
        artifactType: e.artifactType, relation: e.relation, producerRef: grant.grantHash,
        capabilities: caps.slice(), timestamp: new Date().toISOString() });
      ev.eventHash = eventHash(ev);
      lastHash = ev.eventHash;
      events.push(Object.freeze(ev));
      byId.set(artifactId, Object.freeze(Object.assign({}, e, { capabilities: Object.freeze(caps),
        capabilityGrants: Object.freeze((e.capabilityGrants || []).concat([grant])) })));
      return true;
    },
    /** §4 — l'identite composite du run, pour les sinks. */
    boundaryIdentity: Object.freeze({ operatorBoundaryId: manifest.operatorTrustBoundaryId,
      configBindingHash: manifest.configBindingHash || null, executionMode: manifest.executionMode }),
    /** Lecture : ce que porte l'artefact, sans jugement. */
    capabilitiesOf(artifactId) {
      const e = byId.get(artifactId);
      return e ? e.capabilities.slice() : [];
    },
    /** §18/§21 — rejoue toute la chaine : suppression, reordonnancement, mutation. */
    verifyEventChain() {
      const problems = [];
      let prev = manifest.runManifestRootHash;
      events.forEach(function (e, i) {
        if (e.sequence !== i + 1) problems.push("evenement[" + i + "] : sequence " + e.sequence + " attendue " + (i + 1) + " — reordonnancement ou suppression.");
        if (e.previousEventHash !== prev) problems.push("evenement[" + i + "] : ne chaine pas le precedent.");
        const bare = Object.assign({}, e); delete bare.eventHash;
        if (e.eventHash !== eventHash(bare)) problems.push("evenement[" + i + "] : eventHash invalide — evenement modifie.");
        prev = e.eventHash;
      });
      if (prev !== lastHash) problems.push("la racine courante ne correspond pas a la fin de la chaine.");
      return { valid: problems.length === 0, problems: problems, registryRootHash: lastHash, eventCount: events.length };
    },
  };
  REGISTRY_BRAND.add(reg);
  return reg;
}

/** Verifie une chaine d'evenements EXPORTEE, independamment du registre vivant. */
function verifyExportedEventChain(initialRootHash, exportedEvents) {
  const problems = [];
  let prev = initialRootHash;
  (exportedEvents || []).forEach(function (e, i) {
    if (e.sequence !== i + 1) problems.push("evenement[" + i + "] : sequence incoherente.");
    if (e.previousEventHash !== prev) problems.push("evenement[" + i + "] : chainage rompu.");
    const bare = Object.assign({}, e); delete bare.eventHash;
    if (e.eventHash !== eventHash(bare)) problems.push("evenement[" + i + "] : eventHash invalide.");
    prev = e.eventHash;
  });
  return { valid: problems.length === 0, problems: problems, registryRootHash: prev };
}

module.exports = { openAuthenticatedArtifactRegistry, isAuthenticatedRegistry, assertAuthenticatedRegistry,
  verifyExportedEventChain, eventHash, deepFreeze };
