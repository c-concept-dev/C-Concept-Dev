# MONO-11 v0.2 — Anti-hardcoding (Charte §18, mandat §5)

## Ce que le lot ne contient pas (mesuré)

`tools/anti-hardcoding-scan.js` balaye code, contrats, fixtures, tests, outils et docs :

- motifs génériques : mots de domaine, mapping sujet→profession, taille/quota de panel, nombre attendu de jumeaux, `if (… cas …)`, décision sur `dimensionRef` / `discipline` / `queryLineage` ;
- jetons **spécifiques au cas** : lus au moment du balayage dans les artefacts du cas d'application (`EVIDENCEFORGE_CASE_ARTIFACTS`, ex. le panel et la découverte P0.1 : noms des candidats, identifiants d'auteurs, affiliations, libellés de discipline du RunContract). **Ces jetons ne sont pas écrits dans le lot** — les y écrire serait la fuite recherchée.

Résultat au moment de la livraison, avec les artefacts du cas courant déclarés (348 jetons) :

```text
FIXED_PROFESSION_LIST = NO
FIXED_DISCIPLINE_LIST = NO
FIXED_EXPERT_LIST = NO
FIXED_PANEL_SIZE = NO
CASE_SPECIFIC_LEAK_FOUND = NO
DOMAIN_HARDCODING_FOUND = NO
```

Le balayage se prouve lui-même (T10b) : un fichier mutant `if (mission === '<cas>') { panelSize = 5 }` est détecté (`IF_CASE`, `FIXED_PANEL_SIZE`).

## Classification des constantes présentes

| Constante | Où | Classe (Charte §18) | Justification |
|---|---|---|---|
| états du gate, codes de raison, critères G-1…G-11 | `contracts/mono11-contracts.json` | CONTRACTUAL_CONSTANT | vocabulaire épistémique universel, sans domaine |
| `minIdentityConfidence = MODERATE` | contrats | CONTRACTUAL_CONSTANT | identique au minimum SECURE de MONO-10 `candidate-assessment.js` ; MONO-11 ne peut que resserrer |
| `minWorks 3 / minDoi 1 / minYears 2 / minTopics 2` | contrats (`corpusSufficiencyPolicy`, `status: test_unvalidated`) | CONTRACTUAL_CONSTANT | garde-fou **technique** pour qu'un jumeau (EF-02E) puisse citer par titre/DOI et distinguer documenté/inféré ; lu par EF-02D1 gelé qui refuse toute constante locale ; surchargeable par l'exploitant (consigné) ; testé sur 3 domaines (T06, T27) ; jamais une vérité métier |
| `coverageThreshold = moderate`, `maxPanel = 0` | contrats (`coveragePolicy`) | CONTRACTUAL_CONSTANT | seule `coverageThreshold` est lue ; `selectPanel` d'EF-02D3 n'est pas appelé : **aucun plafond, aucun quota** |
| relations du graphe, schémas | héritées de MONO-10 / MONO-01 | NECESSARY_INFRASTRUCTURE_CONSTANT | — |
| règles de normalisation (apostrophes, guillemets, espaces insécables, fins de ligne, NFC) | `core/target-normalizer.js`, contrats `targetNormalization` | CONTRACTUAL_CONSTANT | variantes typographiques d'un même signe, aucun mot, aucun sens ; fondée sur la preuve de l'audit (3/3 rejets) |
| `reviewMaxPasses` / `coverageMaxPasses` = 3 | contrats `informedRetry` | CONFIGURATION | borne d'exploitation de la reprise informée |
| `reviews_complete` : `accepted == expected` | `core/composed-qualification.js` | CONTRACTUAL_CONSTANT | 100 %, jamais un nombre en dur (T39/T40) |

## Ce que le gate lit — et ne lit pas

Le gate (`core/machine-evidence-gate.js`) lit : `identityConfidence`, `identityAmbiguity`, `CorpusSufficiencyEvidence`, `RelevanceEvidence`, `seedWorkRefs`, unknowns, références d'artefacts ; il lit aussi les affiliations, **uniquement** pour la réserve non décisive `DIVERSITY_NOT_OBSERVED` (F8). Il ne lit **ni** `dimensionRef`, `disciplines`, `queryLineage`, noms, ORCID, citations (T09, T14 : vérifié sur le source sans commentaires). Permuter les candidats (T07), les renommer (T08) ou changer leurs libellés (T09) ne change aucun état.

## Fixtures

Trois missions synthétiques (`test/fixtures/domains.js`) : libellés abstraits (`dimA1`, « Personne A-ok »…), identifiants `example.test`, DOI de préfixe de test. Elles se déclarent fixtures et ne sont jamais présentées comme preuve REAL.
