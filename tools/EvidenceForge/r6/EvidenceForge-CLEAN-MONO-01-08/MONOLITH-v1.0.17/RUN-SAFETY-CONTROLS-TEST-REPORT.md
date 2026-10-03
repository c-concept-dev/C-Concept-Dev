# RAPPORT DE TESTS — RUN SAFETY CONTROLS (2026-09-18, 0 USD, aucun appel fournisseur)

| Suite | Résultat |
|---|---|
| `test/test-monolith.js` (monolith + v1.0.5 + panel + sufficiency + screening cost + **RUN-SAFETY-01…21**) | **198/198** |
| `tools/browser-tests-v105.js` (Chrome headless, + 8 tests RUN-SAFETY UI) | **33/33** |
| `test/test-launch.js` (lanceur) | **14/14** |
| `tools/secret-scan.js` | 0 hit |
| `tools/anti-hardcoding-scan.js` (8 580 jetons de 4 runs réels dont f78528fe) | 0 hit |
| Lots gelés MONO-01/09/10/11 | vérifiés, 0 divergence |
| Runs historiques | lecture seule (f78528fe : `state.json` inchangé, 00:12:12) |

## RUN-SAFETY-01…21
| Test | Ce qui est démontré |
|---|---|
| 01 | budget absent / vide / mode inconnu / plafond 0 / sans confirmation ⇒ `BUDGET_REQUIRED`, aucun run créé ; UI : panneau ouvert, aucune interprétation implicite |
| 02 | LIMITED ⇒ `budget.json` (mode, plafond, alerte, setBy, createdAt, history) avant `state.json`, aucun appel ; alerte ≥ plafond refusée ; compat plafond sans mode |
| 03 | UNLIMITED sans `confirmedUnlimited: true` ⇒ refus ; texte de confirmation UI exact |
| 04 | UNLIMITED_CONFIRMED ⇒ `budget.json` existe ; vue de coût ; absence de `budget.json` = anomalie `BUDGET_FILE_MISSING` |
| 05 | stop avant premier appel ⇒ 0 appel, STOPPED / STOPPED_BY_USER immédiat, `stop-request.json` honoré, `run-stop-state.json` |
| 06 | stop entre deux lots de screening ⇒ aucun lot suivant ; transport : refus avant réutilisation et avant réseau, verrou posé |
| 07 | stop entre deux professionnels (pipeline) ⇒ 1 appel puis STOPPED_BY_USER, PROFESSIONALS INTERRUPTED, aucun checkpoint, état partiel + `panelPartialState`, cause USER_STOP |
| 08 | stop entre deux jumeaux ⇒ 1 revue puis STOPPED_BY_USER, checkpoint professionnel conservé, `lastCompletedUnit` = jumeau 1 |
| 09 | persistance : state.json, stop-request honoré, artefacts intacts, idempotence, `RUN_NOT_ACTIVE` sur run terminé |
| 10 | `run-stop-state.json` : champs exigés, notAVerdict / notACheckpoint |
| 11 | reprise uniquement explicite : `markInterruptedRuns` ne consomme ni ne relance ; `advance()` consomme et journalise |
| 12 | reprise = checkpoint + cache : runPanel jamais rappelé, revue A réutilisée (REUSE), revue B réelle, fournisseur appelé une seule fois pour A |
| 13 | fixture de reprise : 2 appels réels, 1 REUSE à 0 USD, chaque prompt facturé une fois |
| 14 | plafond prioritaire : BUDGET_LIMIT_REACHED avant le contenu ; verrou déjà posé garde sa cause (jamais fusionné) |
| 15 | panne de transport ≠ arrêt utilisateur (TRANSPORT_FAILURE, aucun `run-stop-state.json`) |
| 16 | INTERRUPTED_BY_RESTART ≠ STOPPED_BY_USER (jamais requalifié) ; libellés UI distincts |
| 17 | route `/stop`, bouton visible seulement RUNNING, confirmation exacte, résumé avant reprise, aucune suppression |
| 18 | wording plateau corrigé ; `panel-sufficiency.js` byte-identique à HEAD ; policy inchangée |
| 19 | lots gelés byte-identiques |
| 20 | aucun hardcoding |
| 21 | **cas f78528fe** (lecture seule) : ses 4 revues EF-03B VALID copiées dans un run temporaire ⇒ 4 REUSE, 0 réseau ; une 5ᵉ revue inconnue part réellement ⇒ la reprise commencerait au prochain travail manquant ; run réel intact |

## Navigateur (RUN-SAFETY UI)
panneau budget ouvert / mode plafond par défaut / aperçu « Plafond requis » ; mode sans plafond ⇒ aperçu explicite, champ désactivé ; refus de `confirm()` ⇒
aucune requête ; plafond vide ⇒ alerte, aucune requête ; run RUNNING ⇒ bouton stop visible, reprise masquée ; clic + confirmation ⇒ `POST /stop`,
STOPPED / STOPPED_BY_USER, libellé, bouton masqué, résumé avant reprise ; artefacts persistés ; aucune exception console.

## Non couvert par un test (documenté)
Arrêt pendant un appel HTTP réellement en vol (l'appel se termine et est facturé) ; absorption par les boucles gelées MONO-11 réelles sous
`STOPPED_BY_USER` (mécanisme identique au plafond de budget déjà observé en réel : `corpus_fetch_error` puis frontière d'étape).
