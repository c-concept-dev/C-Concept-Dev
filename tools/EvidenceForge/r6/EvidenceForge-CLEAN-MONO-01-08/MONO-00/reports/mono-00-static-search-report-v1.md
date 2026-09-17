# MONO-00 — Rapport de recherche statique

Recherche exhaustive sur les sept paquets extraits à froid, termes du CDC section 10.

## Méthode

Chaque occurrence a été inspectée avec son contexte exact (pas seulement comptée) et classée : `CORE_GENERIC`, `PILOT_ADAPTER`, `FIXTURE`, `TEST`, `HISTORICAL_DOC`, `COMMENT`, ou `REAL_HARDCODING`.

## Résultats par terme

| Terme | Occurrences dans le code cœur (`src/`, hors test/fixtures/dependencies) | Classement |
|---|---|---|
| `JMJS` | 0 dans le code exécutable hors chaînes de recherche des tests eux-mêmes | `TEST` (le mécanisme de recherche statique lui-même) |
| `S01` / `S02` | 0 hors deux commentaires d'en-tête (EF-PR-GEN-01) expliquant leur retrait | `HISTORICAL_DOC` |
| `DIMS` | 0 hors deux commentaires d'en-tête expliquant leur retrait | `HISTORICAL_DOC` |
| `d4` / `d5` | 0, aucune occurrence dans le code cœur | — |
| `truthScore` / `truth_score` | 0 | — |
| `prestige` | 0 hors champs `noPrestigeWeighting: true` et commentaires d'interdiction | `CORE_GENERIC` (garde-fou) |
| `majority` / `majorité` | 0 hors commentaires d'interdiction et texte de prompt LLM interdisant le vote | `COMMENT` / `CORE_GENERIC` |
| `vote` | 0 hors champs `noVoting: true`, commentaires, et texte de prompt LLM | `CORE_GENERIC` (garde-fou) |
| `consensus` | 0 hors commentaires d'interdiction et texte de prompt LLM | `COMMENT` |
| `scientificValidity:true` (motif exact) | 3 dans EF-ORCH monolithe : 2 dans un validateur qui **rejette explicitement** toute sortie le portant, 1 dans un ternaire `testMode ? false : true` jamais atteint en pratique (testMode toujours true dans ce projet) et neutralisé par ledit validateur en aval | `CORE_GENERIC` |
| `professional opinion` / `opinion réelle` | Présent uniquement dans les tableaux `limitations` des rapports produits, en négation explicite (« n'est jamais l'opinion réelle ») | `CORE_GENERIC` (le garde-fou lui-même) |
| `experts validate` / `experts estiment` | 0 | — |

## Occurrences dans les outils HTML historiques (tools/)

`target-02`/`target-03` et `JMJS` apparaissent dans 3 fichiers HTML explicitement conservés comme prototypes historiques pré-généralisation :
- `EF-PR-GEN-01/tools/EF-02D1-D2-Eligibility-Mission-Relevance-v0.2-TEST.html`
- `EF-PR-GEN-01/tools/EF-03B-Review-Runner-v0.3-COMPACT-JSON-FIX-TEST.html`
- `EF-PR-GEN-01/tools/EF-03B-Coverage-Repair-v0.1-TEST.html`

Classement : `HISTORICAL_DOC` / `PILOT_ADAPTER`. Ces fichiers ne sont **jamais** le cœur générique (déjà vérifié séparément et propre) — ils sont explicitement documentés comme prototypes de référence dans les rapports de migration des lots concernés, jamais réintégrés.

## Verdict de cette recherche

**Aucun `REAL_HARDCODING` trouvé** dans le code cœur d'aucun module gelé. Toutes les occurrences résiduelles sont soit des garde-fous actifs (champs déclarant une interdiction, validateurs qui rejettent), soit des commentaires/documentation expliquant une suppression passée, soit des prototypes historiques explicitement hors périmètre du cœur générique.
