D101C — Harmonisation desktop / responsive et garde anti-régression
16/08/2026

Base : D101B, avec consolidation de la source canonique.

Corrections structurelles :
- le template source est réaligné sur le HTML D101B validé ; un rebuild ne peut plus réintroduire l'ancien formulaire ;
- src/app.js est réaligné sur la logique réellement utilisée par le build ;
- latitude/longitude restent internes et invisibles ;
- la position est présentée via un statut utilisateur ;
- le retour à heure fixe est uniquement dans « Combien de temps ? » avec case à cocher et champ d'heure déplié ;
- vocabulaire visible : « Limites à respecter » / « À respecter » ; logique interne hard/imperative conservée ;
- D100C2, D100C3 et D101 conservés ;
- desktop et responsive utilisent le même DOM de questionnaire ; seuls les styles responsive varient ;
- cache PWA incrémenté.

Garde anti-régression : test/d101c-responsive-harmonization.test.mjs.
