# Rapport D103B — `activityIntent` + accueil

**Date :** 19 août 2026  
**Base :** D103A2 gelée / candidate poussée sur `main`  
**Périmètre :** D103B uniquement. D103C n'est pas commencé.

## 1. Références appliquées

- D103 v2.1 — lot D103B = `activityIntent` + accueil.
- CDC UX D103 chapitres 1–5 v0.2.
- Maquettes desktop/responsive validées dans la discussion.
- Quatre intentions canoniques : `leisure`, `gentle_return`, `maintain`, `progress`.
- Aucune présélection automatique depuis l'historique.
- Première visite sans faux historique.
- Utilisateur revenant uniquement si une vraie session incluse dans l'historique existe.
- Même DOM logique desktop/mobile.
- `leisure` conserve l'entrée dans le parcours stable D102G3.

## 2. Implémentation

### Nouveau cœur pur D103B

Fichier ajouté :

`src/core/activity-intent-home-core.js`

Responsabilités :

- copie UX des quatre intentions ;
- validation d'un `activityIntent` ;
- création pure et réversible d'un choix d'intention ;
- dérivation déterministe de l'état `first_visit` / `returning` ;
- aucune persistance, aucun DOM, aucune horloge implicite.

### Accueil D103B

La nouvelle page d'accueil s'appuie sur un DOM unique et responsive :

- hero de marque ;
- question « Qu’avez-vous envie de faire aujourd’hui ? » ;
- quatre cartes parallèles ;
- bloc `Reprendre là où j’en suis`, masqué sans historique réel ;
- bandeau `Votre prochaine balade` commun desktop/mobile ;
- trois principes ;
- avertissement de prudence ;
- accès GPX conservé.

Les anciennes maquettes bitmap/hotspots D064/D074 restent physiquement dans le template pour limiter le risque de suppression destructive, mais elles sont neutralisées par D103B (`display:none!important`). Elles pourront être retirées dans un lot de nettoyage après stabilisation.

### Persistance du choix

Le choix utilise D103A + D103A2 :

- il met à jour `currentActivityIntent` ;
- il ne crée aucune session ;
- une intention seule ne transforme jamais l'utilisateur en « revenant » ;
- la dernière intention n'est jamais présélectionnée au chargement.

### Frontière D103B / D103C

- `leisure` ouvre immédiatement le parcours D102G3 existant (`mode("api")`).
- `gentle_return`, `maintain` et `progress` sont sélectionnables et persistés, mais D103B ne les envoie pas silencieusement dans la préparation existante : la baseline / état du jour qui doit suivre appartient à D103C.

Cette frontière évite de faire croire que « Reprendre doucement », « Maintenir » ou « Progresser » modifient déjà le moteur de balade avant l'implémentation de D103C/H.

## 3. Non-régression

### Tests ciblés D103B

`node --test test/d103b-activity-intent-home.test.mjs`

**10 / 10 OK**

Couverture :

1. quatre `activityIntent` et aucun cinquième ;
2. intention persistée seule ≠ historique ;
3. état revenant seulement avec vraie session incluse ;
4. choix pur, réversible et conservant les autres données ;
5. aucune intention/horodatage inventé ;
6. DOM unique desktop/mobile et quatre cartes ;
7. aucun faux historique ;
8. GPX + `leisure` stable ;
9. aucune présélection depuis la dernière intention ;
10. `Votre prochaine balade` présent dans le DOM responsive commun.

### Suite complète

`npm run check`

- build : **OK** ;
- audit champs : **46 champs, 58 choix, aucune entrée orpheline** ;
- tests : **408 / 408 OK**.

### E2E navigateur

`npm run e2e:critical` n'a pas pu être exécuté dans l'environnement de travail : la dépendance Playwright n'est pas installée dans l'archive et la commande disponible dans l'environnement répond `unknown command 'test'`.

Une validation visuelle navigateur desktop + mobile reste donc obligatoire avant gel humain D103B.

## 4. Points volontairement non gelés

1. **Wording `maintain`** : `Maintenir mon rythme` est conservé conformément à la maquette/CDC UX actuel, mais reste Niveau B. Le document directeur contient aussi `Maintenir mon niveau` : ne pas arbitrer silencieusement avant le test utilisateur.
2. **Couleurs / perception de hiérarchie** : les quatre cartes utilisent la même structure et le même traitement fonctionnel ; la perception réelle reste à tester.
3. **Mes balades** : l'accès historique détaillé n'est pas implémenté dans D103B afin de ne pas commencer D103I. Ce point doit être raccordé au moment où l'espace historique existe réellement.
4. **Parcours longitudinal après sélection** : D103C doit fournir la baseline / état habituel / état du jour avant qu'un choix `gentle_return`, `maintain` ou `progress` puisse continuer proprement.

## 5. Fichiers modifiés / ajoutés

- `src/core/activity-intent-home-core.js` — ajouté
- `src/app.js`
- `scripts/build.mjs`
- `je-marche-comme-je-suis.template.html`
- `je-marche-comme-je-suis-p0.html` — reconstruit
- `test/d103b-activity-intent-home.test.mjs` — ajouté

## 6. Statut proposé

**D103B = candidat à validation visuelle, pas encore gel humain.**

Conditions avant gel :

1. ouvrir le HTML construit sur desktop ;
2. ouvrir le même HTML en responsive/mobile ;
3. vérifier la fidélité aux maquettes validées ;
4. vérifier que `Me balader` ouvre bien le parcours existant ;
5. vérifier que les trois intentions longitudinales se sélectionnent sans lancer une adaptation inexistante ;
6. vérifier première visite sans faux historique ;
7. si possible, injecter une vraie session de test pour vérifier l'état revenant.

Après validation humaine : gel D103B, puis ouverture D103C.
