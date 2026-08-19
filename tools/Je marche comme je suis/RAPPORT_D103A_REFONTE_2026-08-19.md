# D103A — Rapport de refonte du coeur longitudinal

Date : 19 août 2026
Base : D102G3 fournie par l'utilisateur
Références : D103 v2.1 + Carnet de route D103 v0.1

## Périmètre exécuté

- Refactor de `src/core/activity-progression-core.js` uniquement côté domaine D103A.
- Réécriture de `test/d103a-activity-progression-contracts.test.mjs`.
- Reconstruction du HTML autonome via la chaîne de build existante.
- Aucun raccordement à `src/app.js`.
- Aucun stockage local ajouté.
- Aucun changement du moteur ORS ou du routage.

## Contrats désormais exposés

- `activityIntent`: `leisure | gentle_return | maintain | progress`
- `progressionDecision`: `explore | maintain | reduce | clarify`
- `baselineState`
- `functionalGoal`
- `activityExposure`
- `environmentContext`
- `dailyContext`
- `sessionRecord`
- réactions `during | post_activity | later`
- `observedToleranceProfile`
- enveloppe `jmmjs.activity-progression`, version 1
- validation du document longitudinal
- migration pure de la version courante + rejet propre d'une version future

## Garde-fous couverts par tests

- coeur sans stockage ni dépendance navigateur
- absence d'horloge et de hasard implicites
- immutabilité des entrées
- `unknown` conservé
- `planned` jamais promu vers `actual`
- provenance et qualité distinctes
- aucune amplitude numérique de progression dans le contrat de décision
- aucune règle numérique universelle ajoutée
- aucune capacité maximale dans `observedToleranceProfile`
- raison obligatoire pour toute `progressionDecision`
- `leisure` n'entre dans l'historique que sur choix explicite
- aucune intégration D103A dans `app.js`

## Vérifications exécutées

Commande : `node --test test/d103a-activity-progression-contracts.test.mjs`
Résultat : 17/17 tests D103A passent.

Commande : `npm run check`
Résultat :
- build : OK
- audit champs : 46 champs, 58 choix, aucune entrée orpheline
- tests : 369/369 passent

## Statut proposé

D103A est techniquement candidat au gel, sous réserve de validation humaine du contrat avant ouverture de D103A2.
