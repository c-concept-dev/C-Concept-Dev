# MONO-11 v0.2 — Anti-circularité (Charte v2 §28, mandat §6)

## Le risque

```text
source incluse → auteur découvert → auteur présenté → (preuve automatique de pertinence) → jumeau → conclusion confirmant la source
```

## Les barrières, et leur test

| Barrière | Mécanisme | Test |
|---|---|---|
| être auteur d'une source retenue ne prouve rien | la pertinence est évaluée sur le **corpus attribué** du candidat (oracle EF-02D2 réel), jamais sur la source-graine ni le libellé de requête | T11 : auteur de source incluse, corpus hors mission ⇒ `AUTO_REJECTED` |
| G-8 SEED_ONLY | si les seules œuvres qui soutiennent la pertinence sont les œuvres-graines (sources incluses), `SEED_ONLY_SUPPORT` ⇒ `AUTO_DEFERRED`, jamais admis | T12b |
| découverte secondaire | un candidat non-graine (auteur d'œuvre liée) est évaluable et admissible sur son propre corpus | T12 |
| ORCID ≠ pertinence ; citations ≠ pertinence | le gate ne lit ni l'ORCID ni un compte de citations ; sans corpus attribué ⇒ `INSUFFICIENT` | T13, T14 |
| G-7 indépendance du verdict | le gate refuse structurellement tout artefact aval (corpus construit, jumeaux, revues, agrégation, rapport) ; l'ordre causal gate → corpus → jumeaux → revues est prouvé par la lignée | T26 |
| oracle menteur | une référence non présente dans le corpus attribué est refusée par le parseur gelé (EF-02D2) ⇒ `UNKNOWN` | T24, T25 |
| label de requête trompeur | changer `dimensionRef`/`disciplines` n'a aucun effet | T09 |
| divergences conservées | G-10 : aucun candidat n'est écarté pour divergence ; EF-03C conserve convergences ET divergences | T29 (agrégation) |

## Ce qui reste consigné, pas résolu

- la couverture d'une dimension par aucun admis est une **réserve** (`DIMENSION_UNCOVERED`), jamais comblée par quota ;
- l'absence de diversité d'affiliation observée est une réserve (`DIVERSITY_NOT_OBSERVED`), jamais une exigence ;
- le corpus amont (sources incluses) porte ses propres réserves (R-P01-01/02 du cas courant) qui se propagent à la qualification.
