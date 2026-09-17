# EF-01B v0.2-r1 — Real Discipline Resolver Executor

Correctif ciblé du lot `EF-01B-v0.2`, en réponse à l'audit indépendant
(`EvidenceForge-AUDIT-INDEPENDANT-EF-01B-C1-v0.2.md`), fermant les findings
**F-01, F-02, F-03, F-04, F-05, F-06** — voir `CONTRACT.md` pour le détail
de chaque correction et `CHANGELOG.md` pour l'historique.

**Changement de rôle sémantique (F-01/F-02)** : ce lot propose désormais
des **DISCIPLINES** (jamais des professionnels), en **UN SEUL appel LLM au
niveau mission** (jamais un appel par discipline déjà connue), et **ne
dépend jamais** d'un RunContract confirmé (qui n'existe pas encore à ce
stade du pipeline réel).

**Ne modifie ni ne réimplémente EF-01B v0.1, MONO-01→07, ni R6.**

## Contenu

- `prompts/ef01b-resolver-prompt-v0.2-r1.js` — prompt canonique versionné,
  produit des propositions de disciplines, interdit explicitement toute
  proposition de professionnel.
- `lib/hash.js` — hachage via les primitives gelées R6, inchangé.
- `lib/real-llm-call.js` — **nouveau** : appelle `gateway.executeRequest()`
  directement (jamais `buildRealLlmWorkerCallFn()`, qui jette l'enveloppe
  de réponse) pour observer réellement le modèle/transport utilisés et
  distinguer `localInvocationId`/`providerRequestId` (F-03/F-04/F-06).
- `lib/parser.js` — parsing JSON strict, rejette toute régression vers un
  format de résolution de professionnels.
- `lib/executor.js` — `acquireResolverRun(opts)`, orchestrateur principal.
- `lib/evidence-writer.js` — persistance non secrète des preuves.
- `lib/errors.js` — erreurs typées.
- `test/test-ef01b-v0.2-r1.js` — 29 assertions LOCAL_CONTROLLED (voir
  `CONTRACT.md`).

## Usage minimal

```js
const { acquireResolverRun } = require("./lib/executor.js");

const result = await acquireResolverRun({
  bundleRoot: "/chemin/vers/EvidenceForge-CLEAN-MONO-01-08",
  mono04: monMono04Reel, // construit via MONO-04::createMono04(...), reutilise tel quel
  missionContext: { runId, missionId },
  missionQuestion: mission.question,        // EF-01A.question
  targetDocuments: mission.targetDocuments, // EF-01A.targetDocuments
  suppliedEvidence: mission.suppliedEvidence,
  technicalProposalLimit: 10,
  classification: "PROVIDER_OBSERVED_CALL",
  evidenceRoot: "/chemin/vers/REAL-LLM-EVIDENCE",
});
// result.resolverRuns[] : un enregistrement par discipline proposee,
// injectable dans mission.eForchProvenance.resolverRuns[] APRES
// resolution/validation humaine des disciplines retenues.
// result.resolverOutputHash : a transmettre au planner (EF-01C1-v0.2-r1).
```

Voir `CONTRACT.md` pour le détail des garanties, `CHANGELOG.md` pour
l'historique de version.
