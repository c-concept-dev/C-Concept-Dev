# EF-01C1 v0.2-r1 — Real Planner Executor

Correctif ciblé du lot `EF-01C1-v0.2`, fermant le finding **F-07** (lien
causal planner↔resolver) et réutilisant les fixes F-03/F-04/F-05/F-06
d'EF-01B-v0.2-r1. Voir `CONTRACT.md`/`CHANGELOG.md` pour le détail.

**Ne modifie ni ne réimplémente EF-01C1 v0.1, MONO-01→07, ni R6.**

## Contenu

- `prompts/ef01c1-planner-prompt-v0.2-r1.js` — embarque désormais le
  contenu RÉEL des disciplines retenues (rationale) + `resolverOutputHash`.
- `lib/real-llm-call.js` — identique à EF-01B-v0.2-r1 (F-03/F-04/F-06).
- `lib/hash.js`, `lib/parser.js`, `lib/evidence-writer.js` — repris de
  v0.2 (parser délègue toujours à `validateRealPlannerOutputFields()`, R6).
- `lib/executor.js` — `acquirePlannerRun(opts)`, exige désormais
  `resolvedDisciplines[]` + `resolverOutputHash`.
- `lib/errors.js` — ajoute `MODEL_PROVENANCE_MISMATCH`/
  `TRANSPORT_PROVENANCE_MISMATCH`.
- `test/test-ef01c1-v0.2-r1.js` — 22 assertions LOCAL_CONTROLLED.

## Usage minimal

```js
const { acquirePlannerRun } = require("./lib/executor.js");

const result = await acquirePlannerRun({
  bundleRoot: "/chemin/vers/EvidenceForge-CLEAN-MONO-01-08",
  mono04: monMono04Reel,
  missionContext: { runId, missionId },
  missionQuestion: mission.question,
  runContractHash: runContract.runContractHash,
  resolvedDisciplines: disciplinesRetenues.map(d => ({ id: d.discipline, label: d.discipline, rationale: d.justification })),
  resolverOutputHash: resolverAcquisition.resolverOutputHash, // depuis EF-01B-v0.2-r1
  classification: "PROVIDER_OBSERVED_CALL",
  evidenceRoot: "/chemin/vers/REAL-LLM-EVIDENCE",
});
```

Voir `CONTRACT.md` pour le détail des garanties, `CHANGELOG.md` pour
l'historique de version.
