# VERSION-R1.md — EvidenceForge-MONO-02-R1

```
supersedes: EvidenceForge-MONO-02-v1
reason: demonstrated E2E regression (real end-to-end run via MONO-07, first
        genuine execution of EF-02D's coverage-matrix loop with a non-empty
        usableRecords set)
regressionId: MONO02-CORPUS-BY-REF-MAP
status of EvidenceForge-MONO-02-v1: HISTORICAL SNAPSHOT — GELÉ puis
  SUPERSEDED_BY_REGRESSION_FIX (jamais réécrit, jamais nié : le ZIP v1
  original reste disponible tel quel, cf. 08-VERIFICATION du kit).
```

## Régression démontrée

`lib/node-runners.js::corpusByRefOf()` retournait un `Object` JavaScript
simple là où `MONO-01/dependencies/ef-02d3-coverage-panel-v1.js`
(`buildCoverageMatrix`/`resumeCoverageMatrix`, tous deux gelés) exigent et
documentent explicitement une `Map<professionalRef, ProfessionalCorpus>`
(appel `corpusByRef.get(record.professionalRef)`).

Le défaut a échappé aux 324 tests historiques de MONO-02 : aucun d'entre
eux n'exécutait la boucle réelle de `buildCoverageMatrix` avec un
`usableRecords` non vide (seul `test_t02_23_no_local_usable_records_duplication.js`
vérifiait *statiquement*, par grep du code source, que
`selectUsableRecords()` est bien appelé — jamais une exécution réelle
avec au moins un professionnel usable). Démontré pour la première fois
par un run End-to-End réel construit dans le cadre de MONO-07, avec deux
professionnels synthétiques réellement usables.

## Correctif

`lib/node-runners.js::corpusByRefOf()` construit désormais une vraie
`Map` (`.set()`/`.get()`), au lieu d'un `Object` (`obj[key]`). Recherche
exhaustive préalable de tous les usages de `corpusByRefOf`/`corpusByRef`
dans MONO-02 et ses tests : un seul point d'usage (`lib/node-runners.js`
ligne ~197), aucun test n'attend un `Object` simple — voir CDC-TRACE.md.

Aucun fichier de `dependencies/MONO-01/` n'a été modifié : le bug est
dans l'adaptation MONO-02, jamais dans `ef-02d3-coverage-panel-v1.js`
(qui demande correctement une Map).

## Tests de régression ajoutés

`test/test_t02_25_r1_corpus_by_ref_map.js` — 10 assertions (T02-R1-01 à
T02-R1-04), exécutant réellement `EF-02D` à travers le moteur
d'orchestration avec des `ProfessionalCorpus` synthétiques non vides —
jamais seulement `instanceof Map`. Preuve AVANT/APRÈS produite : la
version buguée échoue 9/10 sur ce même fichier de test, avec exactement
`corpusByRef.get is not a function` ; la version corrigée passe 10/10.

## Non-régression

`324 (historiques) + 10 (R1) = 334/334` — aucun test historique supprimé
ou affaibli.
