# Rapport de conformité P0.1 — D-023

## Statut

**PASS AVEC RÉSERVES — preuves locales et production conformes ; GitHub Actions et contrôle iPhone réel à clôturer.**

D-023 a été exécutée le 2 août 2026 sur le dépôt réel. Les suites Node et Worker passent, le build autonome est stable et la version GitHub Pages produit de vraies boucles ORS auditées. L'exécution Playwright locale est bloquée avant les scénarios par les restrictions de lancement des navigateurs de l'environnement macOS ; la même suite est donc ajoutée au workflow GitHub Actions Linux.

## Résultats enregistrés

- `npm --prefix "tools/Je marche comme je suis" run check` : **30 tests réussis, 0 échec** ; build réussi ; audit D-021 à **33 champs et 62 choix sans orphelin**.
- `npm --prefix WalkServicesWorker test` : **7 tests réussis, 0 échec**.
- `git diff --exit-code -- "tools/Je marche comme je suis/je-marche-comme-je-suis-p0.html"` : **réussi** après build.
- `npm --prefix "tools/Je marche comme je suis" run e2e:critical` en local : **0 scénario exécuté, 18 lancements de navigateur bloqués par l'environnement** (`bootstrap_check_in ... Permission denied` pour Chromium ; arrêt WebKit au lancement). Ce résultat est une réserve d'infrastructure, pas une preuve fonctionnelle négative.
- GitHub Pages réelle : **Worker ORS connecté**, **12 requêtes**, **24 candidates**, **3 géométries distinctes compatibles** affichées et contrôlées. Aucune position précise n'est conservée dans ce rapport.
- Profil de l'essai de production effacé du stockage local après contrôle.

## Changement CI D-023

Le workflow `Validate repository` installe désormais Chromium et WebKit, exécute `e2e:critical`, puis archive le rapport HTML, le JUnit, les traces, captures et vidéos disponibles pendant 14 jours.

## Réserves à clôturer

1. Résultat final du workflow GitHub Actions de la PR et lien vers son artefact Playwright.
2. Contrôle manuel de la version GitHub Pages sur Safari iPhone réel.

## Réserves hors P0.1

Les services impératifs avant sélection, la météo complète, les pauses positionnées, les raccourcis réels, la navigation PWA et les modules professionnels restent dans les versions ultérieures. Ils ne doivent pas être ajoutés pendant la certification D-023.
