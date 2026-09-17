# MONO-05 — Rapport de tests

8 fichiers, 65 tests au total, tous PASS.

| Fichier | Type | Tests | Statut |
|---|---|---|---|
| test/unit/test_t05_unit_core.js | Unit | 2 | PASS |
| test/unit/test_t05_static_search.js | Unit | 6 | PASS |
| test/integration/test_t05_integration_core.js | Intégration | 19 | PASS |
| test/integration/test_t05_restart_concurrency.js | Intégration | 5 | PASS |
| test/integration/test_t05_resume_retry_policies.js | Intégration | 4 | PASS |
| test/integration/test_t05_lineage_pass.js | Intégration | 3 | PASS |
| test/integration/test_t05_41_44_nonregression.js | Intégration | 4 | PASS |
| test/browser/test_t05_browser_core.js | Navigateur (Playwright/Chromium réel) | 22 | PASS |
| **Total** | | **65** | **PASS** |

`test/package-check.js` (gate binaire, non compté dans les 65 — vérifie la
résolution du module `playwright` et un `chromium.launch()` réel avant
toute tentative des tests navigateur) : PASS.

## Ce qui rend ces tests réels, pas des façades

- Tous les scénarios réseau utilisent de vrais serveurs HTTP locaux
  (`test/helpers.js::startTestUpstreamServer`), jamais un mock de fonction.
- Le scénario de redémarrage (`test_t05_restart_concurrency.js`) construit
  une **seconde instance complète** du serveur (nouveaux `mono01`/`mono04`/
  moteurs), jamais un simple nouveau rendu, pour prouver que MONO-05 ne
  possède pas l'état.
- Le scénario de concurrence prouve le fond, pas seulement les codes HTTP :
  il compte les VRAIS appels réseau reçus par le serveur upstream pour
  confirmer qu'une seule exécution logique a eu lieu, même quand les deux
  réponses HTTP renvoyées au client sont 200.
- Les tests navigateur utilisent un **vrai Chromium** (`playwright`), avec
  un vrai payload XSS injecté et rendu, un vrai secret synthétique recherché
  dans le DOM/`localStorage`/`sessionStorage`/console, et un vrai double-clic
  natif (deux appels `.click()` DOM synchrones, pas deux clics Playwright
  bloqués par les contrôles d'actionabilité).
- Les tests de non-régression exécutent réellement `npm test` dans les
  répertoires imbriqués MONO-01/02/03/04 via `child_process.execSync`,
  avec vérification des comptes exacts (172/324/64/69).

## Bug de test découvert et corrigé pendant l'écriture des tests eux-mêmes

Un premier essai du test de concurrence utilisait
`Promise.all([runButton.click(), runButton.click()])` — mais Playwright
attend qu'un élément soit "actionable" (visible+activé+stable) avant de
cliquer, et comme le premier clic désactive immédiatement le bouton côté
client, le second appel restait bloqué indéfiniment en attente. Corrigé en
déclenchant deux `element.click()` natifs dans un seul appel
`page.evaluate()` synchrone, qui contourne les contrôles d'actionabilité et
reproduit fidèlement un vrai double-clic rapide.

## Défaut de reproductibilité du package (correction post-audit)

`playwright` n'était initialement déclaré nulle part dans `package.json` —
une extraction ZIP neuve suivie de `npm ci` échouait avec
`Cannot find module 'playwright'`. Corrigé : `devDependencies.playwright`
fixé à `1.56.0` (version réellement testée, jamais `latest`),
`package-lock.json` généré via une installation propre et inclus dans le
manifeste. `test/package-check.js` vérifie désormais séparément la
résolution du module et le lancement réel de Chromium, avec un message
actionnable (`npx playwright install chromium`) si le binaire manque —
jamais une prétention silencieuse à l'autosuffisance. Revérifié par une
extraction ZIP strictement neuve suivie de `npm ci` réel (voir rapport
final) : 65/65 tests, y compris les 22 tests navigateur, avec Playwright
résolu **localement** depuis `node_modules/playwright` (jamais un repli sur
une installation globale).
