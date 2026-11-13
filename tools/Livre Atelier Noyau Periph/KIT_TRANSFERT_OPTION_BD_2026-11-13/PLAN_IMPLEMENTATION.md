# Plan d’implémentation

## Lot 0 — Préflight

- Lire tous les documents du kit.
- Vérifier branche, HEAD, statut et remote.
- Ne pas toucher à `tools/lienotheque/.claude/`.
- Exécuter les tests actuels.
- Créer une branche dédiée préfixée `codex/` si Christophe le demande ou l’autorise dans la nouvelle conversation.

Sortie : état de départ documenté.

## Lot 1 — Contrats et noyau BD

- Écrire d’abord les tests rouges.
- Implémenter création, validation, sauvegarde et restauration du projet.
- Importer un chapitre depuis une session Auteur.
- Aucun appel LLM ni image dans ce lot.

Preuves : tests déterministes et aller-retour JSON strict.

## Lot 2 — Adaptation et storyboard

- Générer les prompts structurés.
- Accepter uniquement du JSON conforme aux schémas.
- Refuser les cases sans source narrative.
- Marquer les dépendances obsolètes après modification.

Preuves : fixtures et tests d’entrées invalides.

## Lot 3 — Bible visuelle

- Interface de création des personnages et lieux.
- Import d’images de référence.
- Consentement et provenance obligatoires.
- Planche de référence approuvée avant storyboard final.

Preuves : scénario avec deux périodes d’âge et refus d’une référence non autorisée.

## Lot 4 — Mode manuel ChatGPT

- Prompt prêt à copier.
- Liste explicite des références à joindre.
- Import du résultat.
- Historique des versions et décisions.
- Aucune automatisation de l’interface ChatGPT.

Preuves : parcours complet sans clé API.

## Lot 5 — Mise en page

- Grille de page paramétrable.
- Images cadrées sans déformation.
- Bulles et récitatifs SVG.
- Détection des textes débordants.
- Aperçu page et double page.

Preuves : PDF du pilote, contrôle à 100 %.

## Lot 6 — Adaptateur API

- Contrat `imageCall`.
- Worker sécurisé.
- Génération, édition et références multiples.
- Confirmation avant transfert externe.
- Gestion des erreurs, quotas et reprises.

Preuves : tests mockés, puis essai réel autorisé sur matière fictive uniquement.

## Lot 7 — Recette du chapitre pilote

- 8 à 12 pages.
- Relecture éditoriale.
- Relecture du sujet si matière réelle.
- Contrôle de continuité visuelle.
- Export PDF.
- Rapport des écarts et coût.

## Règle de progression

Un lot n’est déclaré terminé qu’avec ses preuves. Les tests automatiques ne remplacent jamais la validation humaine de la ressemblance, de la fidélité autobiographique ou de la qualité graphique.

