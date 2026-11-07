# Audit ciblé de parité — Studio Clinique, 7 novembre 2026

## Périmètre vérifié

Six types de document : présentation, carrousel, fiche, tableau, script et liens. Les contrôles ont été exécutés sur le même moteur d'édition structuré, dans WebKit pour les gestes de souris, et dans le navigateur automatisé pour les autres scénarios. Aucun document utilisateur n'a été modifié par ces essais.

| Fonction | Présentation | Carrousel | Fiche, tableau, script, liens |
| --- | --- | --- | --- |
| Rédiger/réécrire un bloc écrit, style et référence | Vérifié | Vérifié | Vérifié |
| Réglages d'image et texte sur image | Vérifié | Vérifié | Vérifié |
| Poignées de taille uniquement sur sélection | Vérifié | Vérifié | Vérifié |
| Réordonner les blocs avec la souris | Vérifié, y compris entre diapositives | Vérifié dans la carte | Vérifié dans le document |
| Panneau sous le bloc sélectionné, sans cacher la photo | Vérifié | Même montage commun | Même montage commun |
| Narration de l'étape et ajout de diapositive | Spécifique à la présentation | Sans objet | Sans objet |

Le glissement reprend sur le bord, avec curseur main visible ; le texte reste sélectionnable au centre. Le panneau ne s'ouvre plus pendant un glissement. Le panneau photo ne chevauche ni l'image ni le bloc suivant aux largeurs 1100, 1400 et 1800 px.

## Contrôles passés

- `verify-item63f-block-drag-reorder.cjs` dans WebKit : 9/9, dont annulation, diapositives distinctes et défilement intérieur.
- `verify-panel-image-no-overlap.cjs` dans WebKit : 3 largeurs.
- `verify-contextual-ux.cjs` dans WebKit : références et approfondissements manuels.
- `verify-editor-parity-six-kinds.cjs` : six types, blocs écrits, correction contextuelle, image et couverture.
- `verify-resize-handles-selected-only.cjs`, `verify-narration-blocs.cjs`, `verify-acte3-deepdive-cycle.cjs` et `verify-acte3-export-standalone.cjs` : réussis.

## Limites relevées dans les contrôles complémentaires

- `verify-image-fit-cross.cjs` échoue sur la hauteur supposée stable d'une image de présentation (`contain` donne environ 67 px pour la fixture). Ce point demande une investigation séparée de cadrage ; le présent correctif ne change pas les réglages d'image.
- `verify-image-crop-cross.cjs` ne démarre pas dans cet environnement : dépendance de test `pngjs` absente.

Ces limites empêchent de conclure à une parité **totale** de toutes les fonctions d'image. Elles ne remettent pas en cause les gestes et panneaux contrôlés ci-dessus.
