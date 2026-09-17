# MONO-09 v0.1 — Correspondance avec les contrats gelés

| Nœud | Mode | Dépendances | Vide autorisé | Où le vide est accepté | Drapeaux scientifiques |
|---|---|---|---|---|---|
| EF-02A | `ASYNC_EXTERNAL` | `externalStageAdapter.discoverProfessionals` | oui | `candidates: []` est une sortie valide | aucun |
| EF-02B | `ASYNC_EXTERNAL` | `externalStageAdapter.verifyProfessionals` | oui | boucle sur `candidates`, vide → `verified: []` | aucun |
| EF-02C | `ASYNC_EXTERNAL` | `externalStageAdapter.buildProfessionalCorpus` | oui | filtre `if (!orcid) continue` puis `professionalCorpora: []` | aucun |
| EF-02D | `ASYNC_EXTERNAL` | **`llm`** | oui | boucle sur `professionalCorpora` — vide → aucun appel LLM | littéraux (l.70, 297, 299) |
| EF-02E | `ASYNC` | — | oui | `panelSize: 0` → `twins: []` | littéraux (l.236) |
| EF-03A | `ASYNC` | — | oui | schéma produit même sans jumeau | littéraux (l.120) |
| EF-03B | `ASYNC_EXTERNAL` | **`llm`** | oui | boucle `twins × targets` — vide → aucun appel LLM | littéraux (l.187, 234) |
| EF-03C | `ASYNC` | — | oui | `aggregates: []` | littéraux (l.221) |
| EF-03D | `SYNC` | — | oui | `analyses: []` | littéraux (l.265) |
| EF-04-LINEAGE | `SYNC` | — | oui | lignée valide sur un ensemble vide | — |
| EF-04A | `ASYNC` | — | oui | rapport unifié à zéro constat | littéraux (l.159) |

## Distinctions demandées par le mandat

- **Exigence contractuelle** — `requiredInputs`, `requiredUpstreamNodes`,
  `requiredDependencies` du graphe MONO-02 ; le fail-closed d'EF-03B sur
  `workerCallFn`.
- **Détail d'implémentation** — le filtre ORCID d'EF-02C, la recherche par slug
  d'EF-02A : ce sont des choix de l'adaptateur MONO-08 v0.6, pas des contrats.
  C'est précisément pourquoi un successeur additif peut les remplacer.
- **Drapeau de harnais de test** — `testMode: true` : marqueur d'honnêteté du
  lot, non un mode d'exécution commutable.
- **Vraie porte scientifique** — **aucune n'existe aujourd'hui.**
  `scientificValidity` n'est pas une porte : c'est une constante. Voir `BLOCKERS.md`.

## Point d'injection utilisé

`createRealMissionRunFromSnapshot(env, adapter, workerCallFn, opts)` et
`rehydrateRealMissionRun(env, adapter, workerCallFn, fetchImpl, runId)` reçoivent
`adapter` en paramètre. Un adaptateur corrigé se substitue donc **sans modifier
aucun lot gelé**.
