# D-055 — UX/UI dynamique et vivante

## Périmètre implémenté

- Accueil restructuré autour du visuel validé : paysage d'ambiance, `je suis` bleu, note manuscrite non présentée comme témoignage.
- CTA principal renforcé avec profondeur, mouvement de flèche et feedback visuel.
- Trois univers qualitatifs Confortable / Agréable / Tonique sans fausses métriques.
- Bloc de garanties factuelles : données inconnues conservées comme inconnues, vérification terrain selon disponibilité des sources, profil du jour prioritaire, réponses locales.
- Progression du wizard transformée en chemin visuel : étape active, étapes terminées, transitions douces.
- Panneau droit avant calcul rendu vivant : tracé abstrait progressif et synthèse en direct uniquement à partir des réponses réellement saisies.
- Feedback visuel des chips/options sélectionnées.
- Apparition légèrement décalée des trois propositions réelles.
- Animation du profil d'altitude lorsqu'une vraie route est affichée.
- Respect de `prefers-reduced-motion`.
- Image d'ambiance ajoutée au cache PWA.

## Règle de vérité

Aucune animation ajoutée ne simule une distance, un dénivelé, une durée, une validation, une progression de calcul ou un résultat qui n'existe pas réellement. Le tracé visible avant calcul est explicitement décoratif et abstrait ; le panneau de synthèse ne reflète que des valeurs présentes dans le formulaire local.

## Hors périmètre volontaire

- Pas de tilt 3D.
- Pas de parallaxe liée au curseur.
- Pas de vidéo de fond.
- Pas d'emojis pour les choix santé/chaussures.
- Pas de pourcentage de calcul fictif.
- Pas de modification du moteur de routage, de la logique de contraintes, des exports ou de la navigation GPS.

## Vérifications

`npm run check` : **191/191 tests passés**, audit de champs conforme (**43 champs, 62 choix, aucune entrée orpheline**).

Les E2E Playwright n'ont pas pu être exécutés dans l'environnement de travail faute de binaires navigateur installés (`chromium_headless_shell` absent). Cet échec d'environnement ne constitue pas un échec fonctionnel démontré.
