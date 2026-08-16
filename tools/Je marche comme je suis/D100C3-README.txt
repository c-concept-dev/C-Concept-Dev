D100C3 — « Juste prendre l’air »

Objectif fonctionnel
- Ajouter un choix réel « Juste prendre l’air » dans Envies.
- Ce choix signifie : aucun détour ni cible POI n’est demandé pour donner une destination à la promenade.
- Le temps, le terrain, les limitations, les services souhaités et les services nécessaires restent actifs.

Comportement
- L’activation vide les envies de destination sélectionnées.
- La sélection ultérieure d’une envie de destination désactive automatiquement « Juste prendre l’air ».
- buildRequest expose walkIntent="fresh_air" et force preferences=[].
- fetchPoiTargets() refuse explicitement toute recherche de cible POI lorsque walkIntent="fresh_air".
- L’audit POI post-calcul ignore lui aussi les envies de destination dans ce mode.
- Le résumé et l’écran de vérification affichent explicitement cette intention.
- Le choix est volontairement un état du jour : il n’est pas restauré comme habitude persistante.

Ce lot ne modifie pas les contraintes, le terrain ni D100C2 Souhaité/Nécessaire.
