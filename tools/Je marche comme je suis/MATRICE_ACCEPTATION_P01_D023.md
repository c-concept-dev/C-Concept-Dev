# D-023 — Matrice de clôture P0.1

Statut initial : **à certifier par exécution sur le dépôt réel**. Une case ne doit être cochée qu’avec une preuve enregistrée.

| Critère P0.1 | Preuve attendue | Automatisation | Statut avant Codex |
|---|---|---|---|
| Mode LLM et champs de clés absents | inspection UI + test de structure | tests Node existants | À confirmer |
| Worker ORS produit une vraie boucle GeoJSON | test Worker + essai production | tests Worker | À confirmer en production |
| `compileConstraints()` et `auditRoute()` communs à ORS et GPX | tests unitaires et GPX | tests Node | Couvert, à rejouer |
| Durée, heure limite, marge et pauses sans dépassement silencieux | scénarios unitaires + E2E | Node + Playwright | À rejouer |
| Tous les champs visibles sont enregistrés | rapport D-021 sans orphelin | `npm run audit:fields` | Couvert, à rejouer |
| Respecté / Violé / Invérifiable visibles | création et GPX partiel | Playwright | À exécuter |
| Chaussures, marches, pentes, surfaces et retour audités | tests noyau + fixtures | Node | À rejouer |
| Moins de trois routes affichées si diversité insuffisante | fixture quasi-doublons | à compléter si nécessaire | À vérifier |
| Scores fixes absents | inspection de la sortie | Node + E2E | Couvert, à rejouer |
| Exports GPX et JSON téléchargeables | téléchargements navigateur | Playwright | À exécuter |
| Erreur ORS sans repli fictif | Worker 503 simulé | Playwright | À exécuter |
| Import GPX avec altitude partielle honnête | fixture dédiée | Node + Playwright | À exécuter |
| Fonctionnement desktop Chromium | suite critique | Playwright | À exécuter |
| Fonctionnement desktop WebKit/Safari | suite critique | Playwright | À exécuter |
| Fonctionnement iPhone | suite critique + contrôle manuel | Playwright + terrain | À exécuter |
| Worker CORS, validation, quotas et rate limit | tests Worker | Node | À rejouer |
| HTML généré identique au build attendu | build sans diff Git | commande Git | À exécuter |

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
