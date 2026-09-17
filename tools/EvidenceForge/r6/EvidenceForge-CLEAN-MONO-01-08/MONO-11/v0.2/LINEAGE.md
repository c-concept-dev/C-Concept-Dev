# MONO-11 v0.2 — Lignée

## Deux chaînes, une ancre

- **Registre MONO-10 (gelé)** : mission, découverte, vérification, preuves documentaires amont, évaluation des candidats, capacité LLM, override humain éventuel. Graphe canonique de MONO-10, relations et types vérifiés (§38).
- **Ledger MONO-11** (`core/mono11-ledger.js`) : preuves de suffisance, preuves de pertinence, décisions et panel du gate, matrice de couverture, jumeaux, revues, agrégation, qualification. Append-only, chaque événement porte le hash du précédent ; **ancre** = `{runId, missionHash, attestationHash, runManifestRootHash, racine du registre MONO-10 à l'ouverture}`.

Pourquoi deux chaînes : le registre MONO-10 refuse — à raison — un type d'artefact hors de son graphe. Les artefacts MONO-11 ne sont pas ré-étiquetés pour y entrer ; ils sont **liés au même run** par `RM.bindArtifact` (ils figurent dans `manifest.artifacts`) et chaînés dans le ledger. `verifyChain()` recalcule le hash de chaque artefact enregistré (T15).

## Graphe d'un run autonome

```text
mission ─┐
discovery ─┤ (registre MONO-10)
verification ─┤
documentary-evidence (sources, identités) ─┤
candidate-assessment ─────────────────────┼──► mono11:corpus-sufficiency:<id> ──► mono11:relevance:<id> ──┐
llm-capability (sonde réelle certifiée)   │                                                              ├──► mono11:gate-panel
                                          │                                                              │        │
[panel-validation = override humain]──────┘                                                              │        ▼
                                                                                          mono11:coverage-matrix ──► mono11:twin-set ──► mono11:review-set ──► mono11:aggregation ──► mono11:scientific-qualification
```

Chaque décision du gate porte `evidenceRefs` = références par hash de l'évaluation, de la sonde et de la preuve de pertinence (G-11) ; une référence manquante ⇒ `PROVENANCE_UNRESOLVED` ⇒ `INSUFFICIENT` (T16).

## v0.2 — ancre scellée et artefacts persistés
L'ancre du ledger porte `runtimeSeal` (`mono11Version`, `runtimeSealSha256`, `runCodeHash`, `mono11ManifestSha256`, `mono11ZipSha256`) ; `exportArtifacts()` rend tous les artefacts enregistrés pour persistance (`P0.1-EVIDENCE/`). Nouveaux nœuds : `mono11:target-normalization` (originaux/normalisés hachés), `mono11:coverage-enforcement-trace`, `mono11:review-enforcement-trace`.

## Réutilisation inter-run (cas courant)

La phase 2 du run réel réutilise les artefacts de la phase 1 **par hash** (découverte, vérification, entrées canoniques, journal), les re-lie au nouveau run attesté et consigne `reusedFromPhase1` dans l'état du run. L'autorité d'entrée historique de MONO-10 (§7/§8) n'est pas invoquée : aucune référence inter-run n'est résolue à travers le registre, les artefacts sont re-enregistrés à l'identique (même contenu, même hash) — c'est dit, pas caché.
