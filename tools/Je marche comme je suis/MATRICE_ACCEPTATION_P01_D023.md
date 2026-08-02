# D-023 — Matrice de clôture P0.1

Statut de campagne : **automatisation locale et production exécutées ; validation GitHub Actions en attente**. Une case n'est déclarée passée qu'avec une preuve enregistrée.

| Critère P0.1 | Preuve attendue | Automatisation | Statut D-023 |
|---|---|---|---|
| Mode LLM et champs de clés absents | inspection UI + test de structure | tests Node existants | **PASS local** — test Node dédié passé dans la suite 30/30 |
| Worker ORS produit une vraie boucle GeoJSON | test Worker + essai production | tests Worker | **PASS** — test Worker 7/7 et Pages réelle : 3 boucles distinctes compatibles, 12 requêtes maximum |
| `compileConstraints()` et `auditRoute()` communs à ORS et GPX | tests unitaires et GPX | tests Node | **PASS local** — noyau et scénarios GPX dans la suite 30/30 |
| Durée, heure limite, marge et pauses sans dépassement silencieux | scénarios unitaires + E2E | Node + Playwright | **PASS local / CI en attente** — scénarios Node passés, E2E à exécuter par Actions |
| Tous les champs visibles sont enregistrés | rapport D-021 sans orphelin | `npm run audit:fields` | **PASS** — 33 champs, 62 choix, aucune entrée orpheline |
| Respecté / Violé / Invérifiable visibles | création et GPX partiel | Playwright | **PASS production pour Respecté / CI en attente pour les autres états** |
| Chaussures, marches, pentes, surfaces et retour audités | tests noyau + fixtures | Node | **PASS local** — scénarios Node passés et contrôles visibles en production |
| Moins de trois routes affichées si diversité insuffisante | fixture quasi-doublons | à compléter si nécessaire | **PASS local** — test D-019 passé |
| Scores fixes absents | inspection de la sortie | Node + E2E | **PASS local** — test D-018 passé, sortie production factuelle |
| Exports GPX et JSON téléchargeables | téléchargements navigateur | Playwright | **CI en attente** |
| Erreur ORS sans repli fictif | Worker 503 simulé | Playwright | **CI en attente** |
| Import GPX avec altitude partielle honnête | fixture dédiée | Node + Playwright | **PASS Node / CI en attente** |
| Fonctionnement desktop Chromium | suite critique | Playwright | **CI en attente** — lancement local interdit par l'environnement macOS |
| Fonctionnement desktop WebKit/Safari | suite critique | Playwright | **CI en attente** — lancement local interdit par l'environnement macOS |
| Fonctionnement iPhone | suite critique + contrôle manuel | Playwright + terrain | **CI en attente / contrôle iPhone réel restant** |
| Worker CORS, validation, quotas et rate limit | tests Worker | Node | **PASS local** — 7/7 |
| HTML généré identique au build attendu | build sans diff Git | commande Git | **PASS** — `git diff --exit-code` réussi après build |

## Commandes de preuve

```bash
npm --prefix "tools/Je marche comme je suis" install
npx --prefix "tools/Je marche comme je suis" playwright install --with-deps chromium webkit
npm --prefix "tools/Je marche comme je suis" run check
npm --prefix WalkServicesWorker test
npm --prefix "tools/Je marche comme je suis" run e2e:critical
git diff --exit-code -- "tools/Je marche comme je suis/je-marche-comme-je-suis-p0.html"
```

## Règle de clôture

La P0.1 ne peut être déclarée conforme si un test critique échoue, si un champ devient orphelin, si le build modifie le HTML sans commit, ou si un impératif inconnu apparaît comme respecté.
