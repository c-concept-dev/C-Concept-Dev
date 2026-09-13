# RAPPORT LOT 10G.3B.3E — Routing Engine v1

## Verdict

**PASS**

## Objectif atteint

Création d'un Routing Engine universel dans `core/adn/routing-engine.js`.

La route n'est plus conceptualisée comme une conséquence de la longueur, du domaine, du nombre de sections, du nombre de contraintes ou du nombre de verrous. Elle exprime un seul besoin :

> **La demande exploitable nécessite-t-elle réellement une préparation substantielle avant exécution ?**

## Principe de routage

```text
demande non exploitable
→ route = null

provider disponible + décision valide
→ décision provider conservée

provider indisponible
→ examiner les signaux de préparation génériques

aucun signal positif
→ Rapide

au moins un signal positif
→ Architecte
```

## Correction architecturale apportée

Le nouveau moteur sépare explicitement :

```text
indisponibilité du classifieur
≠ complexité de la demande
```

Cette règle corrige, au niveau du nouveau Routing Engine, la cause identifiée en 3A pour S07, S08 et S09 : le double échec provider n'entraîne plus automatiquement `Architecte`.

Le module n'est pas encore branché dans le HTML produit. L'intégration effective est réservée au lot adapters afin de ne pas mélanger conception du routage et branchement moteurs.

## Signaux génériques autorisés

- `strategy_design`
- `dependent_components`
- `constraint_arbitration`
- `linked_scenarios`
- `architecture_coordination`
- `research_planning`

Aucun signal métier n'est accepté.

## Invariants

Le moteur garantit :
- panne provider ≠ complexité ;
- longueur ≠ complexité ;
- domaine ≠ route ;
- nombre de verrous ≠ route ;
- Architecte en fallback exige une preuve positive de préparation ;
- aucune route avant exploitabilité.

## Validation

- `npm test` : **77/77 PASS**
- `npm run guard` : **PASS**
- aucune erreur de whitespace via `git diff --no-index --check`
- hashes gelés strictement inchangés
- HTML produit inchangé
- aucun appel réseau
- aucun déploiement

## Modifications

Fichier existant modifié :
- `core/adn/index.js` : export du Routing Engine.

Nouveaux fichiers :
- `core/adn/routing-engine.js`
- `tests/routing-engine.test.mjs`
- dossier `audit/lot10g3b3e/`

## Limite volontaire

3E construit et valide le moteur de routage, mais ne remplace pas encore `adpFallbackLocal()` dans le HTML historique.

Cette intégration relève du prochain lot :

**10G.3B.3F — Engine Adapters / branchement du contrat ADN vers Rapide et Architecte.**

C'est à ce moment que le nouveau routage pourra devenir effectif dans le produit derrière une intégration réversible et testée.
