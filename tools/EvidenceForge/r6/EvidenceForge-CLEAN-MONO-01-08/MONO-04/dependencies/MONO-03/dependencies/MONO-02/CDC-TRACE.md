# MONO-02 - Tracabilite CDC -> implementation

| Section CDC | Exigence | Implementation | Statut |
|---|---|---|---|
| CONTEXTE GELE | MONO-00/MONO-01 autorites d'entree, jamais modifies | Copie bytewise verifiee 71/71 dans dependencies/MONO-01/ | OK |
| GRAPHE CIBLE | 14 etapes + dependances laterales | graph/mono-02-orchestration-graph-v1.json | OK T02-01 |
| REGLE FONDAMENTALE | jamais d'appel direct, jamais de reconstruction d'input, jamais de reparation | lib/node-runners.js appelle exclusivement mono01.<port>.* | OK T02-16, T02-17, T02-20 |
| STATE MACHINE | 7 etats, 9 transitions, aucune implicite | lib/state-machine.js | OK T02-03 |
| ORCHESTRATION GRAPH | registre machine-readable, 12 champs par noeud | graph/mono-02-orchestration-graph-v1.json | OK T02-01 |
| ORDRE ET DEPENDANCES | exemples EF-02A/EF-02E/EF-03B/EF-04A | requiredInputs/requiredUpstreamNodes par noeud | OK T02-07, T02-09, T02-10 |
| LINEAGE | noeud de garde distinct EF-04-LINEAGE | jamais EF-03D->EF-04A direct | OK T02-01 test4, T02-11, T02-12 |
| DEPENDANCES EXTERNES | classification fine MONO-01, jamais un booleen | requiredDependencies nommees (llm, externalStageAdapter.<methode>) | OK T02-06, T02-08 |
| FAIL-CLOSED | refus sur input/upstream/dependency/lineage manquant | checkPreconditions() dans orchestration-engine.js | OK T02-04, T02-05, T02-06 |
| RETRY/RESUME | 6 valeurs, mapping derive de la baseline | retryPolicy/resumePolicy + resumePolicySource par noeud | OK T02-14, T02-15 |
| EXECUTION | OrchestrationEngine : getNodeState/computeReadyNodes/canRun/runNode/markBlocked/markFailed/transition | lib/orchestration-engine.js | OK |
| PARALLELISME | scheduler sequentiel, pas d'optimisation qui change l'ordre | computeReadyNodes()+runNode() sequentiel dans les tests | OK |
| ERREURS | reutilise les erreurs MONO-01, 4 codes d'orchestration minimaux | lib/orchestration-errors.js | OK |
| INTERDICTIONS | pas de RunStore/UI/pipeline E2E reel, pas de modification MONO-00/01 | aucun ajoute ; hashes MONO-01 inchanges (71/71) | OK |
| TESTS T02-01 a T02-24 | suite complete (T02-23, T02-24 ajoutes post-audit) | test/test_t02_*.js - 324/324 PASS | OK |
| NON-REGRESSION | MONO-00, MONO-01, 7 lots geles | 27/27 + 115/115 + 1223/1223 rejoues | OK |
| RECHERCHE STATIQUE | termes interdits + invocation directe | reports/mono-02-static-search-report-v1.md | OK |
| LIVRABLES | arborescence complete | voir README.md | OK |
| CRITERE DE DONE | reponses machine-readable testees | voir reports/mono-02-graph-coverage-report-v1.md | OK |

## Corrections de conception effectuees pendant la construction (avant tout gel)

## Revision post-audit (apres le premier rapport NON GELABLE)

## Revision post-audit (2e passe) — durabilite cross-process EF-ORCH

MONO-01.x corrige : backend injectable explicitement (options.durableBackend),
resume()/getStatus()/getResult() rehydrates depuis le backend durable, plus
de Map locale comme autorite. MONO-02 ne change RIEN a sa propre architecture
pour cette correction — EF-ORCH-SUBSYSTEM continue d'appeler
EFOrchExecutionPort.start()/resume() a l'identique ; seule la copie imbriquee
de MONO-01.x (dependencies/MONO-01/) est mise a jour (105/105 verifie).
317/317 tests MONO-02 rejoues sans aucune modification, aucune regression.

## Revision post-audit (3e passe) — frontiere d'injection stricte

Defaut confirme : createMono01() construisait EFOrchExecutionPort sans
jamais transmettre d'option, donc le chemin standard MONO-02 retombait
systematiquement sur un backend memoire implicite cote MONO-01. Corrige :
createMono01(registry, { efOrchDurableBackend }) recoit desormais
explicitement le backend ; test/fixtures.js::buildMono01() en construit un
explicitement a chaque appel (jamais de fallback implicite, MONO-01 lui-meme
refusant fail-closed sans injection). Nouveau test
test/test_t02_24_explicit_eforch_backend_injection.js (7/7 PASS) confirmant
le chemin complet durableBackend -> createMono01(...) -> EFOrchExecutionPort
-> EF-ORCH-SUBSYSTEM a travers l'OrchestrationEngine, y compris entre deux
instances createMono01() distinctes partageant explicitement le meme
backend. Copie imbriquee de MONO-01.x mise a jour (106/106 verifie).
324/324 tests MONO-02, aucune regression.

1. EF-ORCH-SUBSYSTEM remplace le faux noeud EF-ORCH (passthrough d'un
   CorpusSnapshot externe suppose deja produit). Le graphe commence
   desormais reellement par un RunContract. Le noeud appelle
   EFOrchExecutionPort.start()/resume() (MONO-01.x, sous-systeme orchestre
   autonome gele compose sans reecriture) puis CorpusSnapshotPort.receive()
   au succes — jamais un pilotage individuel d'EF-01A/B/C1/C2/D/E/F.
2. lib/node-runners.js n'implemente plus localement le predicat
   usableRecords — appel exclusif a
   mono01.eligibilityPanelPort.selectUsableRecords() (MONO-01.x), garde par
   test/test_t02_23_no_local_usable_records_duplication.js (4/4 PASS).
3. test/fixtures.js reconstruit desormais un vrai RunContract confirme et
   les artefacts EF-ORCH associes (resolverTrace, searchProtocol,
   screeningArtifact, qualificationTestArtifact), en reutilisant
   directement les fixtures deja prouvees de MONO-01.x
   (dependencies/MONO-01/test/fixtures-eforch.js) — jamais une
   reconstruction separee du meme materiel de test.

1. lib/orchestration-engine.js::canRun() decouple de l'etat READY pour
   inspecter les preconditions independamment - voir
   reports/mono-02-state-machine-report-v1.md.
2. lib/node-runners.js compense un angle mort de validation booleenne dans
   MissionPort (MONO-01, gele) sans jamais modifier MONO-01 lui-meme - voir
   commentaire LIMITE CONNUE #1 dans le fichier et le rapport final.
3. lib/node-runners.js reproduit le predicat de selection "usableRecords"
   du module gele EF-02D1D2, non expose comme methode de port par MONO-01 -
   voir commentaire LIMITE CONNUE #2 dans le fichier.

Aucune de ces corrections ne modifie MONO-00 ou MONO-01 (geles, hashes
inchanges) - toutes vivent exclusivement dans le code neuf de MONO-02.
