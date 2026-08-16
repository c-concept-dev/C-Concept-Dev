D101E — Vérification compacte

Objectif : réduire fortement la hauteur de l’étape « Vérifier avant de calculer » sans supprimer d’information ni modifier la logique métier.

Principes :
- 4 blocs principaux seulement : Départ, Temps, Terrain & envies, Besoins.
- Les limites réellement déclarées apparaissent dans « Points à contrôler ».
- En l’absence de limite particulière, un état compact le signale sans garantie de sécurité.
- Les réglages détaillés restent accessibles via « Voir tous les détails ».
- Desktop et responsive partagent le même DOM et la même logique ; seule la mise en page change.
- D100C2, D100C3, D101, D101C et D101D restent conservés.

Validation :
- build OK
- audit champs : 46 champs, 58 choix, 0 orphelin
- tests : 281 / 281
