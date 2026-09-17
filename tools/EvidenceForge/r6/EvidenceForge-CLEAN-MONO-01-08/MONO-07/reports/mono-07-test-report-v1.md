# Rapport de tests — MONO-07 (baseline R3)

## Resultat global

**Node/API : 107/107. Browser : 20/20. TOTAL : 127/127, aucune regression fonctionnelle.**

## Detail par fichier

| Fichier | Tests | Statut |
|---|---|---|
| unit/test_t07_fixtures_regression.js | 3 | PASS |
| unit/test_t07_pkg_portability.js | 6 | PASS |
| unit/test_t07_runner_policy.js | 14 | PASS |
| e2e/test_t07_determinism.js | 6 | PASS |
| e2e/test_t07_e2e_contradiction.js | 6 | PASS |
| e2e/test_t07_e2e_failure.js | 9 | PASS |
| e2e/test_t07_e2e_happy.js | 29 | PASS |
| e2e/test_t07_e2e_lineage_negative.js | 11 | PASS |
| e2e/test_t07_e2e_resume.js | 6 | PASS |
| e2e/test_t07_e2e_secrets.js | 7 | PASS |
| e2e/test_t07_idempotence_concurrency.js | 5 | PASS |
| e2e/test_t07_no_live_function_persisted.js | 5 | PASS |
| browser/test_t07_browser_e2e.js | 20 | PASS |

## Bugs reels trouves (MONO-07 uniquement, jamais un lot gele)

1. Branchement D2/D3 ambigu - corrige, test T07-FIX-01a/b.
2. Couverture identique entre les deux professionnels synthetiques -
   corrige, test T07-FIX-02.
3. rehydrateForNewProcess() de MONO-07 dupliquait REG-02 - corrige,
   couvert par test_t07_e2e_resume.js.
4. Chemin de session en dur (portabilite) - corrige via lib/kit-root.js,
   tests T07-PKG-01/02/03.
5. Runner appliquait un retry a tout echec de fichier, y compris un echec
   fonctionnel reel (pouvait masquer une regression) - corrige via
   lib/runner-policy.js (classification stricte PASS/FUNCTIONAL/
   INFRASTRUCTURE, retry jamais applique au groupe Node/API, retry
   unique pour le groupe Browser uniquement sur infrastructure
   explicitement reconnue), tests T07-RUNNER-01 a 06.

Les cinq sont classes BUG MONO-07 - aucun lot gele modifie.

## Instabilite environnementale documentee (deux formes distinctes)

1. Fragilite de synchronisation dans test_t07_browser_e2e.js lui-meme
   (selecteur de clic ambigu) - corrigee, confirmee stable sur 5+
   executions consecutives.
2. Instabilite residuelle du gate MONO-06 imbrique (comptage de tests
   Playwright imbriques a deux niveaux de profondeur, sous charge
   cumulee) - ne correspond a aucun motif d'infrastructure reconnu,
   donc jamais retentee automatiquement (comportement correct de la
   politique corrigee) ; resolue par une seconde invocation manuelle.
   Voir CDC-TRACE.md pour le detail complet.
