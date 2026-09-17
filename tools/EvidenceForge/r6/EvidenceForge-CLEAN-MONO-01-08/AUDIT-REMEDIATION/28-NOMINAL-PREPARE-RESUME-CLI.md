# 28 — Nominal PREPARE/RESUME CLI (R6)

Ferme R6-F01 (`NOMINAL_REAL_SMOKE_TWO_PHASE_INTEGRATION = NOT_IMPLEMENTED`,
audit indépendant round 5). Les primitives R5
(`prepareRealScreening()`/`resumeRealScreening()`,
`lib/real-screening-workflow.js`) étaient valides et testées mais
n'étaient branchées derrière AUCUN point d'entrée opérateur réel. R6
ajoute deux points d'entrée CLI explicites à `bin/run-real-smoke.js` —
`--phase prepare` et `--phase resume` — qui appellent DIRECTEMENT ces
primitives, sans les dupliquer ni en créer de nouvelles.

## Commandes

```
node bin/run-real-smoke.js --phase prepare [--kit-root <chemin>]

node bin/run-real-smoke.js --phase resume \
  --run-id <id> \
  --snapshot-id <id-produit-par-prepare> \
  --audit-decisions <chemin-vers-fichier-JSON> \
  [--kit-root <chemin>]
```

Sans `--phase`, le chemin historique single-shot (`main()`, inchangé
depuis R1-R5) reste utilisé — R6 ne modifie AUCUN comportement de ce
chemin. `--kit-root` est optionnel : à défaut, `EVIDENCEFORGE_KIT_ROOT`
est utilisé (même convention que le chemin legacy, jamais un troisième
comportement implicite).

### Pourquoi `--kit-root` explicite et jamais argv[2] en mode deux-phases

`resolveKitRoot()` (`lib/kit-root.js`, gelé pour l'usage single-shot)
lit historiquement `argv[2]` comme chemin positionnel du `KIT_ROOT`. En
mode `--phase`, `argv[2]` vaut `"--phase"` lui-même — jamais un chemin.
`mainCli()` ne transmet donc JAMAIS `process.argv` brut à
`resolveKitRoot()` en mode deux-phases : `--kit-root <chemin>` explicite
est prioritaire, sinon repli sur `EVIDENCEFORGE_KIT_ROOT` — jamais une
tentative de lire `"--phase"` lui-même comme un chemin de kit.

## Architecture (aucune duplication)

```
bin/run-real-smoke.js
  mainCli()
    parseCliArgs(argv) ──► { phase, runId, snapshotId, auditDecisionsPath, kitRoot }
      │
      ├─ phase absent ──► main()                         (legacy, inchangé)
      │
      ├─ phase="prepare" ──► runPreparePhase(...)
      │                        │
      │                        ├─ describeMissionGateStatus(mission)  (PRE_RETRIEVAL_GATE)
      │                        ├─ prepareRealScreening(env, {...})    (lib/real-screening-workflow.js, R5 — INCHANGÉ)
      │                        ├─ buildAuditDecisionsTemplate(snapshot) (idem)
      │                        └─ fail-closed / rapport OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS
      │
      └─ phase="resume" ──► runResumePhase(...)
                               │
                               ├─ lecture --audit-decisions (fichier JSON opérateur)
                               ├─ resumeRealScreening(env, adapter, workerCallFn, {...}) (idem, INCHANGÉ)
                               └─ fail-closed / driveRun() jusqu'à EF-ORCH-SUBSYSTEM=SUCCESS
```

`runPreparePhase()`/`runResumePhase()` sont de simples ASSEMBLAGES :
gate + construction d'environnement (`buildDurableComponents()`, R2) +
appel direct à la fonction R5 correspondante + mise en forme du rapport.
Aucune ligne de `lib/real-screening-workflow.js` ni de
`lib/eforch-artifacts.js` n'est modifiée par R6 (voir `git diff` du
commit R6 — uniquement `bin/run-real-smoke.js` et les nouveaux tests).

## PHASE PREPARE — sortie

Sur succès, `PREPARE_REAL_SCREENING` s'arrête toujours sur
`OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS` (jamais un RESUME automatique,
jamais une décision fabriquée) et imprime un rapport JSON contenant :

```json
{
  "state": "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS",
  "snapshotId": "...", "snapshotHash": "...", "missionId": "...",
  "sourceCount": 2, "sourceIds": ["...", "..."],
  "snapshotBackendDir": "...",
  "auditDecisionsTemplatePath": ".../audit-decisions-input.template.json",
  "nextStep": "node bin/run-real-smoke.js --phase resume --run-id <id> --snapshot-id <snapshotId> --audit-decisions <chemin>",
  "readiness": { "REAL_SMOKE_CODE_READINESS": "...", ... }
}
```

Un template vide de saisie (`audit-decisions-input.template.json`, voir
`buildAuditDecisionsTemplate()`, R5) est écrit sur disque au chemin
indiqué — jamais seulement un identifiant sans support concret.

## Repertoire durable du snapshot — stable entre deux invocations CLI

`PREPARE` et `RESUME` sont deux invocations CLI **séparées**,
potentiellement heures ou jours d'écart (la pause opérateur est le
point central du workflow R5). `resolveSnapshotBackendDir(workRoot)`
utilise donc un chemin **STABLE**, jamais horodaté comme
`eforchBackendDir`/`mono03BackendDir` (qui n'ont pas besoin d'être
retrouvés plus tard, `RESUME_REAL_SCREENING` démarrant toujours un
NOUVEAU run MONO-03 depuis le snapshot, jamais une reprise d'un run
MONO-03 déjà en cours — voir `createRealMissionRunFromSnapshot()`, R5) :

```
EVIDENCEFORGE_SNAPSHOT_DIR (si fourni)
  ou
<workRoot>/mono08-real-screening-snapshots
```

où `workRoot = EVIDENCEFORGE_PERSISTENCE_DIR || os.tmpdir()` — même
convention que le reste du binaire.

## PHASE RESUME — fail-closed par cause réelle (mandat R6 section 4)

`runResumePhase()` ne renvoie jamais un seul statut `FAIL` générique :

| Cause | Code sortie | Détection |
|---|---|---|
| `--phase` absent ou invalide | 2 | `parseCliArgs()` — `ARGS_INVALID_PHASE` |
| `--phase resume` sans `--run-id`/`--snapshot-id`/`--audit-decisions` | 2 | `parseCliArgs()` — `ARGS_MISSING_*` |
| fichier `--audit-decisions` illisible/JSON invalide | 2 | lecture directe, avant tout appel réseau/disque durable |
| snapshot introuvable (`--snapshot-id` inconnu) | 2 | `resumeRealScreening()` — `SNAPSHOT_NOT_FOUND` |
| snapshot altéré (intégrité compromise) | 1 | `resumeRealScreening()` — `SNAPSHOT_INTEGRITY_ERROR` |
| décisions manquantes/incomplètes/incohérentes | 4 | `resumeRealScreening()` — `OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS` (POST_RETRIEVAL_GATE) |
| échec technique de connectivité | 1 | `FAIL` générique, cause réelle réellement inattendue |
| succès (EF-ORCH-SUBSYSTEM=SUCCESS) | 0 | — |

Jamais de comportement deviné : chaque cas est un branchement explicite
sur `e.code`, jamais un `catch` unique masquant la différence entre une
erreur opérateur (mauvais id, décisions absentes) et une compromission
réelle (intégrité).

## Preuve no-refetch au niveau CLI (mandat R6 section 3)

`test/test_t08_r6_closure.js::R6-A01-fetch`/`R6-04` prouvent, via un
compteur d'appels provider persisté sur disque par le
`openAlexFetchImpl` de test (`test/cli/cli-prepare-runner.js`), que :

```
provider fetch count apres --phase prepare = 1
provider fetch count apres --phase resume  = 1 (inchangé, jamais 2)
```

## Injection `deps` — testabilité, jamais un chemin CLI réel

`runPreparePhase(kitRoot, mono07LibPath, mission, cliArgs, deps)` et
`runResumePhase(..., deps)` acceptent un 5ᵉ paramètre `deps` optionnel
(`openAlexFetchImpl`, `adapter`, `workerCallFn`, `driveRunOpts`) —
réservé aux appelants PROGRAMMATIQUES (`test_t08_r6_closure.js`,
`test/cli/cli-{prepare,resume}-runner.js`), pour prouver l'intégration
sans réseau réel. **Jamais exposé par un flag CLI**, jamais utilisé par
`mainCli()` : la commande réelle (`node bin/run-real-smoke.js --phase
...`) appelle toujours ces fonctions SANS `deps`, avec exactement le
comportement réel (`realOpenAlexFetchImpl`,
`buildRealExternalStageAdapter`, `buildRealLlmWorkerCallFn`) — aucun
risque qu'un opérateur masque accidentellement un retrieval réel.

## Sous-processus de test dédiés

`runPreparePhase()`/`runResumePhase()` appellent `finish()` →
`process.exit()` en interne (comportement CLI normal et voulu — chaque
invocation est une commande shell distincte). Les tests qui les
appellent directement (pour prouver l'intégration sans dupliquer la
logique) doivent donc s'exécuter dans leur PROPRE sous-processus :
`test/cli/cli-prepare-runner.js` et `test/cli/cli-resume-runner.js`,
lancés via `child_process.spawn()` par `test_t08_r6_closure.js` — même
convention que les workers cross-process de R2/R5
(`test/cross-process/`).
