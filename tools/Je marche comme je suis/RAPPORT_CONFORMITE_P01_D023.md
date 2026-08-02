# Rapport de conformité P0.1 — D-023

## Statut

**PROVISOIRE — campagne Codex et essais manuels non encore exécutés.**

D-023 fournit l’outillage de certification ; il ne constitue pas à lui seul une preuve que tous les navigateurs et la production passent.

## Périmètre automatisé ajouté

- création de boucles ORS avec Worker simulé ;
- absence de repli fictif lorsque le Worker échoue ;
- synthèse des contraintes avant calcul ;
- import GPX et préservation de l’invérifiable ;
- téléchargement GPX et JSON ;
- contrôle iPhone du débordement horizontal ;
- exécution Chromium desktop, WebKit desktop et iPhone émulé ;
- conservation des traces, vidéos et captures en cas d’échec.

## Preuves à joindre après exécution

1. sortie de `npm run check` ;
2. sortie des tests Worker ;
3. rapport HTML Playwright ;
4. fichiers JUnit ;
5. capture de la version GitHub Pages sur Safari iPhone réel ;
6. résultat d’un calcul ORS réel en production ;
7. résultat de `git status --short` après build et tests.

## Réserves hors P0.1

Les services impératifs avant sélection, la météo complète, les pauses positionnées, les raccourcis réels, la navigation PWA et les modules professionnels restent dans les versions ultérieures. Ils ne doivent pas être ajoutés pendant la certification D-023.
