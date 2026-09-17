# MONO-02 - Rapport de tests

## Resultats

23 fichiers T02-01 a T02-23, 317 tests au total, tous PASS. Aucun echec,
aucune regression.

| Fichier | Tests | Resultat |
|---|---|---|
| T02-01 graph completeness | 175 | PASS |
| T02-02 unknown node rejected | 5 | PASS |
| T02-03 invalid transition rejected | 10 | PASS |
| T02-04 upstream gating | 7 | PASS |
| T02-05 required input gating | 5 | PASS |
| T02-06 dependency gating | 6 | PASS |
| T02-07 EF-02A requires CorpusSnapshot + MissionDimensionSet | 4 | PASS |
| T02-08 EF-02ABC requires ExternalStageAdapter | 5 | PASS |
| T02-09 EF-02E requires ExclusionRegistrySet | 4 | PASS |
| T02-10 EF-03B requires MissionDocumentMapping + TargetDocumentSet | 5 | PASS |
| T02-11 lineage FAIL blocks report | 8 | PASS |
| T02-12 lineage PASS unlocks report | 6 | PASS |
| T02-13 failed node does not unlock downstream | 6 | PASS |
| T02-14 retry policy respected | 9 | PASS |
| T02-15 resume policy represented correctly | 17 | PASS |
| T02-16 no direct frozen-module invocation | 4 | PASS |
| T02-17 no smart repair | 3 | PASS |
| T02-18 no pilot hardcoding | 2 | PASS |
| T02-19 no epistemic additions | 3 | PASS |
| T02-20 MONO-01 port-only invocation | 17 | PASS |
| T02-21 deterministic ready-node computation | 6 | PASS |
| T02-22 graph serialization/reload identical | 6 | PASS |
| T02-23 no local usableRecords duplication | 4 | PASS |
| **Total** | **317** | **PASS** |

## Ce que les tests exercent reellement (pas des doubles superficiels)

- T02-01 verifie la forme EXACTE du graphe JSON (175 assertions : 12 champs
  requis x 14 noeuds + verifications structurelles).
- T02-11/T02-12 utilisent une chaine EF-02E..EF-03D REELLEMENT construite via
  les ports MONO-01 (seedRealisticChain), avec de vraies reviews non vides,
  pour tester une vraie rupture de lignee (documents vides) et une vraie
  chaine intacte - jamais un mock de LineagePort.
- T02-07 a T02-10 font tourner la chaine complete via l'OrchestrationEngine
  reel, avec de vrais adaptateurs de test et un vrai workerCallFn, jusqu'a
  produire des objets ProfessionalDiscovery/DocumentaryReviewSet reels
  verifies par schema/schemaVersion.
- T02-13 provoque un VRAI echec technique (exception levee par un
  adaptateur) et verifie la non-propagation en aval sur toute la chaine
  restante (8 noeuds verifies rester NOT_STARTED).
- T02-20 verifie, par lecture de code, qu'aucun appel n'existe en dehors du
  motif mono01.<port>.<methode>(...) dans lib/node-runners.js.

## Limites des tests (mises à jour post-audit)

Le panel professionnel simulé (EF-02A→EF-02D) reste vide dans les tests
génériques de gating (T02-07/08/09/10/13/14) — le moteur D1/D2/D3 n'y est pas
réglé finement. Les tests de lignée (T02-11/12) contournent cette limite via
`seedRealisticChain`. Cette limite est INCHANGÉE par la révision post-audit.

Ce qui a changé : le point de départ du graphe est désormais un vrai
`RunContract`, plus un `CorpusSnapshot` supposé déjà produit — les fixtures
`buildFullContext`/`buildFullEngine` construisent réellement les artefacts
EF-ORCH (RunContract confirmé, resolverTrace, searchProtocol,
screeningArtifact, qualificationTestArtifact) via les fixtures déjà prouvées
de MONO-01.x, jamais une reconstruction séparée du même prédicat.
