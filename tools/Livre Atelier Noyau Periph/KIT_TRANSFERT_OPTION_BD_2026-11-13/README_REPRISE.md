# Kit de reprise — Option bande dessinée

Date : 13 novembre 2026  
Projet : Livre de Vie — Atelier Biographie  
Éditeur : C Concept&Dev — Christophe BONNET

## Objectif

Ajouter une variante **bande dessinée / roman graphique** au système modulaire existant, sans casser le parcours autobiographique romancé actuel.

Le noyau existant produit la matière littéraire. La nouvelle chaîne doit :

1. adapter le livre en scénario visuel ;
2. construire une bible visuelle validée ;
3. découper le récit en pages et cases ;
4. générer ou importer les images ;
5. poser les bulles et récitatifs hors des images ;
6. contrôler la fidélité autobiographique et la continuité visuelle ;
7. exporter un PDF, un EPUB illustré et, plus tard, un CBZ.

## Ordre de lecture obligatoire

1. `CDC_ATELIER_BD_V0.1.md`
2. `ARCHITECTURE_CIBLE.md`
3. `CONTRATS_DE_DONNEES.md`
4. `PLAN_IMPLEMENTATION.md`
5. `RECETTE_ACCEPTATION.md`
6. `PROMPTS_BD.md`
7. `SECURITE_DROITS_ET_VIE_PRIVEE.md`
8. `DECISIONS_OUVERTES.md`
9. les schémas JSON du dossier `schemas/`

## Sources existantes à relire avant tout code

- `../atelier-auteur-core.js`
- `../atelier-editeur-core.js`
- `../shell-biographie.html`
- `../integration.js`
- `../shell-best-seller.html`
- `../shell-relecture-universel.html`

## État vérifié au moment du transfert

- Branche : `main`
- Dépôt local en avance d’un commit sur `origin/main`.
- Dépôt distant configuré : `https://github.com/c-concept-dev/C-Concept-Dev.git`.
- Aucun push n’est autorisé sans demande explicite de Christophe.
- Élément non suivi hors de ce dossier : `tools/lienotheque/.claude/`. Il ne faut ni le modifier ni le supprimer.
- Noyau Auteur observé : version `7.4.2-alpha`.
- Shell Biographie observé : version `7.4.2-alpha`.
- Le noyau accepte déjà `ctx.llmCall` par injection de dépendance.
- Le shell sait sauvegarder et restaurer un projet `.ldv.json`.
- Le noyau exporte déjà un EPUB textuel.

Ces informations sont un instantané. La nouvelle conversation doit les revérifier.

## Première livraison attendue

Un **pilote d’un seul chapitre**, de 8 à 12 pages, avec :

- une bible visuelle de 1 à 3 personnages ;
- un storyboard entièrement modifiable ;
- un mode image manuel ChatGPT ;
- un adaptateur image simulé pour les tests ;
- une planche finale avec images sans texte intégré ;
- des bulles éditables en HTML/SVG ;
- un export PDF ;
- sauvegarde et reprise du projet ;
- recette automatique déterministe et contrôle humain documenté.

## Frontière importante

Le ZIP de transfert est un **instantané des documents de cadrage**, pas l’historique complet de la conversation ni une copie du dépôt. Le dépôt local reste la source du code.

