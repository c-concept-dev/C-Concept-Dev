JMJS — D102G3
==============

Lot ciblé appliqué sur le projet complet fourni le 18/08/2026.

Correctifs intégrés :
- négation locale des zones corporelles ;
- distinction des mentions historiques explicitement non gênantes aujourd'hui ;
- extraction Descente / Montée / Terrain irrégulier indépendante de la position grammaticale ;
- latéralité confinée à la zone concernée (pas de propagation épaule -> cou) ;
- vocabulaire Cou / cervical / Épaules ;
- conflit texte douloureux <-> curseur douleur recalculé dans les deux sens ;
- protection D102G1 : « aucun souci » / « ça va » ne deviennent pas une absence globale de douleur ;
- tendances baseline : habituel, amélioration, aggravation ;
- durée « trois quarts d'heure » -> environ 45 min ;
- champ texte libre toujours accessible avec douleur = 0 ;
- changement du curseur douleur relance immédiatement la confrontation texte/curseur.

Gouvernance conservée :
texte -> interprétation candidate -> confirmation utilisateur -> modèle structuré.
Aucune contrainte n'est appliquée avant « Prendre en compte » puis confirmation de la limitation existante.

Fichiers principaux modifiés :
- src/core/free-text-interpretation-core.js
- src/app.js
- test/d102g3-targeted-regression.test.mjs (nouveau)
- je-marche-comme-je-suis-p0.html (reconstruit par npm run build)

Validation finale :
- npm run build : OK
- audit champs : 46 champs / 58 choix / 0 orphelin
- npm test : 390 / 390 tests verts

D103 présent dans le projet fourni n'a pas été développé davantage dans ce lot.
