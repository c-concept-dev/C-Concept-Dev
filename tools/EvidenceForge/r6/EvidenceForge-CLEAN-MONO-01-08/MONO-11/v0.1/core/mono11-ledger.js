"use strict";
/**
 * MONO-11 v0.1 — core/mono11-ledger.js
 *
 * REGISTRE DE LIGNEE MONO-11, append-only, ANCRE au run MONO-10.
 *
 * Pourquoi un second registre : le registre authentifie de MONO-10 v0.19 n'accepte
 * que les relations de SON graphe canonique (§38) et refuse — a raison — un type
 * d'artefact qu'il ne connait pas. Les artefacts MONO-11 (preuves de suffisance,
 * preuves de pertinence, decisions du gate, panel machine) ne sont donc pas
 * RE-ETIQUETES pour y entrer : ils sont LIES au run par `RM.bindArtifact` (ils
 * figurent dans `manifest.artifacts`) et chaines ici, avec pour racine la racine
 * du manifeste ET la racine courante du registre MONO-10 au moment de l'ouverture.
 *
 * Rien n'est reinscriptible ; chaque evenement porte le hash du precedent.
 */
const crypto = require("crypto");
const sha = (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

function openMono11Ledger(input) {
  input = input || {};
  const manifest = input.manifest, registry = input.registry, RM = input.RM, CANON = input.CANON;
  if (!manifest || !isStr(manifest.runId)) throw Object.assign(new Error("LEDGER_MANIFEST_REQUIRED"), { code: "LEDGER_MANIFEST_REQUIRED" });
  if (!registry || typeof registry.get !== "function") throw Object.assign(new Error("LEDGER_REGISTRY_REQUIRED"), { code: "LEDGER_REGISTRY_REQUIRED" });
  if (!RM || !CANON) throw Object.assign(new Error("LEDGER_FROZEN_REQUIRED"), { code: "LEDGER_FROZEN_REQUIRED" });
  const anchor = { runId: manifest.runId, missionHash: manifest.missionHash, attestationHash: manifest.runtimeAttestationHash,
    runManifestRootHash: manifest.runManifestRootHash, mono10RegistryRootAtOpen: registry.registryRootHash,
    operatorTrustBoundaryId: manifest.operatorTrustBoundaryId, executionMode: manifest.executionMode };
  const events = [], byId = new Map();
  let last = sha({ ledger: "MONO-11-v1", anchor: anchor });
  return Object.freeze({
    schema: "EvidenceForge.Mono11LineageLedger", schemaVersion: "MONO-11-v1", anchor: Object.freeze(anchor),
    get rootHash() { return last; }, get size() { return byId.size; },
    /** Lie l'artefact au run MONO-10 (manifeste) et l'inscrit ici. Rend l'artefact lie. */
    record(artifactId, kind, artifact, derivedFrom) {
      if (!isStr(artifactId) || byId.has(artifactId)) throw Object.assign(new Error("LEDGER_DUPLICATE_OR_INVALID: " + artifactId), { code: "LEDGER_DUPLICATE_OR_INVALID" });
      const bound = RM.bindArtifact(manifest, artifact, artifactId, artifact.schema || kind);
      const h = CANON.artifactHash(bound);
      const ev = { sequence: events.length + 1, previousEventHash: last, artifactId: artifactId, kind: kind, artifactType: bound.schema || null,
        artifactHash: h, derivedFrom: (derivedFrom || []).map((r) => ({ artifactId: r.artifactId, sha256: r.sha256, registry: r.registry || "mono11" })),
        runId: manifest.runId, timestamp: new Date().toISOString() };
      ev.eventHash = sha(ev); last = ev.eventHash;
      events.push(Object.freeze(ev)); byId.set(artifactId, Object.freeze({ artifact: bound, hash: h, event: ev, kind: kind }));
      return bound;
    },
    ref(artifactId) {
      const e = byId.get(artifactId); if (!e) return null;
      return { artifactId: artifactId, sha256: e.hash, artifactType: e.artifact.schema || null, registry: "mono11", runId: manifest.runId };
    },
    get(artifactId) { const e = byId.get(artifactId); return e ? e.artifact : null; },
    entries() { return events.map((e) => Object.assign({}, e)); },
    verifyChain() {
      const problems = []; let prev = sha({ ledger: "MONO-11-v1", anchor: anchor });
      events.forEach(function (e, i) {
        if (e.sequence !== i + 1) problems.push("sequence " + e.sequence);
        if (e.previousEventHash !== prev) problems.push("chaine rompue a " + e.artifactId);
        const bare = Object.assign({}, e); delete bare.eventHash;
        if (sha(bare) !== e.eventHash) problems.push("evenement modifie : " + e.artifactId);
        const cur = byId.get(e.artifactId);
        if (!cur || CANON.artifactHash(cur.artifact) !== e.artifactHash) problems.push("artefact modifie : " + e.artifactId);
        prev = e.eventHash;
      });
      return { valid: problems.length === 0 && prev === last, problems: problems, rootHash: last, eventCount: events.length };
    },
    export() { return { schema: "EvidenceForge.Mono11LineageLedger", schemaVersion: "MONO-11-v1", anchor: anchor, rootHash: last, events: events.map((e) => Object.assign({}, e)) }; },
  });
}

module.exports = { openMono11Ledger };
