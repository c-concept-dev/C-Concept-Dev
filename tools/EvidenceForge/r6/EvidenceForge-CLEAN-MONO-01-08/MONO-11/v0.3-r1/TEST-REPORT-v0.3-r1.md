# TEST-REPORT — MONO-11 v0.3-r1

Exécution hors ligne (aucun appel réseau, aucun appel LLM réel ; tous les LLM des tests sont des scripts locaux ou des fixtures byte-exactes). Mesures reproduites par `tools/build-manifest.js` dans `MANIFEST.json`.

## Suite `test/test-mono11-v0.3-r1.js` — 69 tests
- 44 tests hérités v0.2 (gate, panel, qualification, normalisation, enforcement, scellement, reuse, règle 100 %, persistance) : inchangés.
- 15 tests v0.3 (T1–T12, R1–R3) : inchangés dans leur objet ; **T9, T12, R3 rendus autonomes** (référence d'empreintes v0.2 embarquée, comparaison vivante optionnelle).
- 10 tests v0.3-r1 (mandat §3) :

| Test | Objet | Résultat attendu |
|---|---|---|
| r1-T1 | même jumeau + même contexte : reuse toujours possible (`REUSE_VALID`, sourceCallId de la réparation antérieure, 0 appel réel supplémentaire pour la réparation) | PASS |
| r1-T2 | jumeaux différents, même document, même erreur textuelle, constats différents : aucune réutilisation croisée ; témoin : sans la ligne de contexte les prompts sont byte-identiques | PASS |
| r1-T3 | même jumeau, constat différent : empreintes/prompts distincts, aucun reuse ; même constat ⇒ même empreinte ; champ réparé exclu de l'empreinte ; autre document / autre dimension ⇒ autre empreinte | PASS |
| r1-T4 | STOP/reprise : magasin persisté relu par un nouveau transport, nouveau runId ⇒ même empreinte, même prompt, reuse conservé ; constat différent à la reprise ⇒ pas de reuse | PASS |
| r1-T5 | déterminisme : deux exécutions ⇒ mêmes objets/prompts ; JSON canonique stable ; aucun champ non canonique ; `REPAIR_CONTEXT_REQUIRED` sans contexte ; ligne de contexte = identification seule | PASS |
| r1-T6 | fixtures historiques (11) : mêmes agrégats qu'en v0.3 ; 5 prompts ciblés, 0 collision, 5 contextes distincts, empreinte portée | PASS |
| r1-T7 | R2 (`A5021753875` anonymisé) : correction historique recomposée toujours ACCEPTÉE | PASS |
| r1-T8 | R1 (`A5065832154` anonymisé) : réparation ciblée fonctionnellement inchangée (2 fragments, répétitions exactes p2/p3, feedback identique hors ligne de contexte) | PASS |
| r1-T9 | aucune fausse acceptation : réparation non littérale refusée, jamais réutilisable (INVALID) ; rejeu historique 0 | PASS |
| r1-T10 | aucune régression : 4 fonctions byte-identiques à la référence v0.2, `maxPasses 3`, stratégies v0.3, `contractVersion MONO-11-v2`, fail-closed après 3 passes, rejeu 0 régression | PASS |

Résultat mesuré (build) : voir `MANIFEST.json → measurements.tests` (attendu 69/69/0).

## Benchmark historique (`node benchmark/replay.js`)
11 fixtures ; 12 occurrences `TARGET_REF_NOT_LITERAL` ; 12 collages ; 0 invention ; 5 répétitions exactes ; 5 séquences éligibles ; 2 corrections historiques acceptées par recomposition ; 0 fausse acceptation ; 0 régression ; **5 prompts ciblés construits, 0 collision, 5 contextes de réparation distincts**. Tokens gaspillés en passes identiques (mesuré v0.2) : 22 401 in / 17 193 out.

## Anti-hardcoding
`tools/anti-hardcoding-scan.js` avec `EVIDENCEFORGE_CASE_ARTIFACTS` = 8 artefacts (P0.1 panel + discovery ; H1 panel + discovery + mission ; v1.0.1 panel + discovery + mission), provenance consignée dans `MANIFEST.json` (`caseArtifacts` : nom + sha256) : **3 039 jetons de cas, 0 hit**, six drapeaux NO. Note de méthode : un premier balayage de v0.3-r1 a détecté un libellé de dimension codé en dur dans un nouveau test (r1-T8) — corrigé (valeur lue dans la fixture) avant scellement. `benchmark/` (hors `SCAN_DIRS`) : voir `P2-CLOSURE.md` P2-09.

## Autonomie du package
Attendu : la suite s'exécute depuis le ZIP seul (sans lot v0.2 adjacent), avec `EVIDENCEFORGE_BUNDLE_ROOT` pointant sur les lots gelés composés : 69/69. Vérification effective consignée dans le rapport final du micro-lot (hors lot).

## Non-régression des prédécesseurs
Suites v0.2 (44) et v0.3 (59) ré-exécutées sur leurs lots inchangés, sceaux vérifiés : consigné dans le rapport final (hors lot).
