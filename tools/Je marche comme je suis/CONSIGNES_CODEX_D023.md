# Mission Codex — certifier D-023 sans changer les décisions produit

## Objectif

Exécuter la campagne de clôture P0.1 sur le dépôt réel, corriger uniquement les anomalies empêchant les tests critiques de passer, puis produire un rapport factuel.

## Décisions immuables

Ne pas annuler ou contourner D-013 à D-022 :

- aucune géométrie inventée ;
- ORS via Worker uniquement ;
- aucun repli silencieux ;
- inconnu conservé comme inconnu ;
- contraintes impératives avant préférences ;
- audit commun ORS/GPX ;
- temps réel audité ;
- maximum 12 requêtes ORS ;
- profils distincts ;
- diversité géométrique ;
- aucun score fixe en pourcentage ;
- synthèse avant calcul ;
- couverture exhaustive des champs ;
- parité GPX.

## Procédure

1. Lire `MATRICE_ACCEPTATION_P01_D023.md` et le cahier des charges.
2. Exécuter :

```bash
npm --prefix "tools/Je marche comme je suis" install
npx --prefix "tools/Je marche comme je suis" playwright install --with-deps chromium webkit
npm --prefix "tools/Je marche comme je suis" run check
npm --prefix WalkServicesWorker test
npm --prefix "tools/Je marche comme je suis" run e2e:critical
```

3. Corriger les erreurs par modifications minimales. Ne pas ajouter de fonction P0.2/P1.
4. Relancer toute la suite après chaque correction significative.
5. Vérifier que le build ne laisse aucun diff inattendu :

```bash
git diff --exit-code -- "tools/Je marche comme je suis/je-marche-comme-je-suis-p0.html"
```

6. Tester l’URL GitHub Pages réelle avec un calcul ORS réel. Ne jamais enregistrer une position précise dans les logs ou le rapport.
7. Mettre à jour les colonnes de statut de `MATRICE_ACCEPTATION_P01_D023.md` avec les preuves exactes.
8. Mettre à jour `RAPPORT_CONFORMITE_P01_D023.md` : PASS, PASS AVEC RÉSERVES ou ÉCHEC.

## Corrections autorisées

- sélecteurs E2E devenus trop fragiles ;
- problèmes de temporisation ou d’attente ;
- erreurs réelles de build ;
- régressions UI ;
- erreurs GPX ou export ;
- défauts d’accessibilité bloquants ;
- incohérences entre template, modules et HTML généré.

## Corrections interdites sans nouvelle décision fonctionnelle

- assouplir une contrainte impérative ;
- transformer Invérifiable en Respecté ;
- remettre des scores fixes ;
- dépasser le plafond d’appels ORS ;
- dupliquer une route pour obtenir trois cartes ;
- utiliser une route de secours non auditée ;
- ajouter météo, services impératifs ou PWA dans ce lot.

## Livrable final Codex

- commit unique ou petite série de commits clairement nommés ;
- liste des fichiers modifiés ;
- commandes exécutées ;
- nombre de tests réussis/échoués par suite ;
- anomalies corrigées ;
- réserves restantes ;
- `git status --short` final ;
- verdict P0.1.
