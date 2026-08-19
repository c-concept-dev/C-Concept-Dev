# Rapport D103A2 — persistance, migrations et confidentialité

**Date :** 19 août 2026  
**Base reçue :** ZIP gelé `Je marche comme je suis(20260819-131827).zip`  
**Lot :** D103A2

## 1. Contrôle préalable de la base gelée

Une incohérence de packaging a été détectée avant D103A2 :

- la copie racine `activity-progression-core.js` contenait bien la refonte D103A canonique ;
- mais le fichier réellement utilisé par le build, `src/core/activity-progression-core.js`, contenait encore l'ancien D103A avec stockage, anciens modes et ancien vocabulaire ;
- idem pour le test : la copie racine était à jour, tandis que `test/d103a-activity-progression-contracts.test.mjs` était l'ancien test.

Le build référence explicitement `src/core/activity-progression-core.js`. La base gelée n'embarquait donc pas réellement D103A dans le chemin de production.

Correction préalable appliquée : synchronisation des copies D103A validées vers :

- `src/core/activity-progression-core.js`
- `test/d103a-activity-progression-contracts.test.mjs`

Validation après correction préalable : D103A 17/17 et `npm run check` 390/390.

## 2. Implémentation D103A2

Nouveau module :

- `src/core/activity-progression-persistence.js`

Responsabilités :

- persistance locale uniquement ;
- préfixe de clés `jmmjs-activity-progression-` ;
- validation/migration via le core D103A ;
- refus propre des versions futures ;
- gestion de JSON corrompu sans exception non contrôlée ;
- mode privé : purge immédiate + blocage des écritures ;
- purge exhaustive de toutes les clés D103A2 ;
- suppression des clés de session devenues orphelines ;
- sessions stockées séparément du state principal pour éviter un historique monolithique réécrit à chaque enregistrement.

Clés principales :

- `jmmjs-activity-progression-state-v1`
- `jmmjs-activity-progression-session-index-v1`
- `jmmjs-activity-progression-session-v1:<id>`

## 3. Intégration minimale

`scripts/build.mjs` inclut désormais le module de persistance immédiatement après le core D103A.

`src/app.js` instancie l'adaptateur D103A2, mais ne lui confie encore aucune logique UX ou métier. Le seul raccordement fonctionnel ajouté est l'intégration à **Effacer mes données**, qui appelle désormais aussi `activityProgressionPersistence.purge()`.

D103B n'est pas commencé.

## 4. Tests D103A2

Nouveau fichier :

- `test/d103a2-activity-progression-persistence.test.mjs`

Couverture :

1. préfixe obligatoire `jmmjs-` ;
2. aller-retour document validé ;
3. conservation provenance et `unknown` ;
4. sessions séparées du state ;
5. refus d'une version future sans écrasement ;
6. corruption JSON gérée proprement ;
7. mode privé ;
8. purge exhaustive, y compris clé orpheline ;
9. nettoyage d'une session supprimée.

Résultat D103A + D103A2 ciblé : **25/25 OK**.

## 5. Non-régression globale

Commande exécutée :

```text
npm run check
```

Résultat final :

- build : OK ;
- audit champs : OK ;
- tests : **398/398 OK** ;
- échec : 0.

Aucune ancienne clé `jmjs.activityProgression*` ne subsiste dans `src`, `test` ou `scripts`.

## 6. Statut

**D103A2 est candidat au gel technique.**

Aucun D103B/C n'a été implémenté dans ce lot.
