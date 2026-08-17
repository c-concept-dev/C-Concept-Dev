D101I — Base stable avant D102

Objectif : corriger les régressions de concordance desktop/responsive sans modifier le moteur métier.

Corrections :
- restauration du libellé « D’où partez-vous ? » ;
- services responsive compactés en conservant le même DOM, les mêmes 3 états et la même logique ;
- neutralisation de l’auto-agrandissement Safari uniquement dans les zones services/vérification concernées ;
- étape Vérifier raccourcie : les Points à contrôler gardent l’essentiel, tandis que les détails de provenance restent accessibles dans « Voir tous les détails » ;
- aucune modification ORS, POI, GPX, services métier, envies, météo, PWA ou routage.

Règle : Responsive = Desktop pour structure, contenu et logique. Le CSS ne fait que replier/compacter la présentation.
