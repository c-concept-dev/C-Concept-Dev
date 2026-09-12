# Anti-hardcoding

La nouvelle couche `execution-readiness.js` ne contient :
- aucune taxonomie de domaine ;
- aucun questionnaire par type de demande ;
- aucun mapping voyage/CV/médical/informatique/etc. ;
- aucun nombre arbitraire de questions nécessaires.

La décision porte uniquement sur des primitives universelles :
objectif, livrable, impact, substituabilité, autorité de décision, inconnue, complétude et risque
d'invention.

La limite historique de trois clarifications du pré-pipeline a été supprimée. La protection contre
les boucles repose sur la détection des questions déjà posées, pas sur un compteur arbitraire.
