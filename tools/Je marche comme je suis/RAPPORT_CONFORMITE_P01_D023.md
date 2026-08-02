# Rapport de conformité P0.1 — D-023

## Statut

**PASS AVEC RÉSERVES — preuves automatisées et production conformes ; contrôle Safari iPhone réel à clôturer.**

D-023 a été exécutée le 2 août 2026 sur le dépôt réel. Les suites Node et Worker passent, le build autonome est stable, GitHub Actions valide les navigateurs cibles et la version GitHub Pages produit de vraies boucles ORS auditées. L'exécution Playwright locale reste bloquée avant les scénarios par les restrictions de lancement des navigateurs de l'environnement macOS ; GitHub Actions Linux fournit la preuve reproductible correspondante.

## Résultats enregistrés

- `npm --prefix "tools/Je marche comme je suis" run check` : **30 tests réussis, 0 échec** ; build réussi ; audit D-021 à **33 champs et 62 choix sans orphelin**.
- `npm --prefix WalkServicesWorker test` : **7 tests réussis, 0 échec**.
- `git diff --exit-code -- "tools/Je marche comme je suis/je-marche-comme-je-suis-p0.html"` : **réussi** après build.
- `npm --prefix "tools/Je marche comme je suis" run e2e:critical` en local : **0 scénario exécuté, 18 lancements de navigateur bloqués par l'environnement** (`bootstrap_check_in ... Permission denied` pour Chromium ; arrêt WebKit au lancement). Ce résultat est une réserve d'infrastructure, pas une preuve fonctionnelle négative.
- [`Validate repository` — run 30761123582](https://github.com/c-concept-dev/C-Concept-Dev/actions/runs/30761123582) : **succès**, application **30/30**, Worker **7/7**, Playwright **16 réussis et 2 ignorés comme prévu**. L'artefact `playwright-report` (`8837505384`) contient le rapport HTML et le JUnit.
- GitHub Pages réelle : **Worker ORS connecté**, **12 requêtes**, **24 candidates**, **3 géométries distinctes compatibles** affichées et contrôlées. Aucune position précise n'est conservée dans ce rapport.
- Profil de l'essai de production effacé du stockage local après contrôle.

## Changement CI D-023

Le workflow `Validate repository` installe désormais Chromium et WebKit, exécute `e2e:critical`, puis archive le rapport HTML, le JUnit, les traces, captures et vidéos disponibles pendant 14 jours. La première exécution sur la PR est réussie.

## Réserves à clôturer

1. Contrôle manuel de la version GitHub Pages sur Safari iPhone réel.

## Réserves hors P0.1

Les services impératifs avant sélection, la météo complète, les pauses positionnées, les raccourcis réels, la navigation PWA et les modules professionnels restent dans les versions ultérieures. Ils ne doivent pas être ajoutés pendant la certification D-023.
