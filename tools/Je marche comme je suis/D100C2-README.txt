D100C2 — Souhaité / Nécessaire
Date : 2026-08-16

Base : ZIP Claude fourni par l'utilisateur (Je marche comme je suis(20260816-170636).zip)

Implémenté :
- 6 services principaux visibles : Banc, Toilettes, Eau potable, Café/restauration, Transport public, Parking.
- Pharmacie dans « Autres besoins » replié.
- Réseau téléphonique retiré de l'interface tant qu'aucune source réelle de couverture n'est câblée.
- Chaque service a 3 états exclusifs : Pas important / Souhaité / Nécessaire.
- Souhaité : recherche réelle des POI et score utilisé dans le classement final des routes.
- Nécessaire : recherche réelle ; la route ne peut être qualifiée compatible si le service n'est pas documenté.
- Absence de POI dans les données : état inconnu pour le parcours D100C2, jamais preuve d'inexistence.
- Café/restauration : satisfait par un POI Café OU Restaurant documenté.
- Banc nécessaire : réglage 15 / 20 / 30 / 45 min.
- Répartition des bancs : projection des bancs OSM sur la trace, calcul des intervalles depuis le départ jusqu'au retour, comparaison au temps de marche réel.
- Bancs recherchés via l'endpoint Overpass /overpass/benches déjà présent dans la base D100C1.
- Résumé final : distinction Services souhaités / Services nécessaires / Pause assise régulière.
- Persistance du profil : desiredServices, requiredServices et fréquence de banc restaurés.
- Charte : crème/blanc neutre, sauge pour Souhaité, terracotta uniquement pour Nécessaire/limite, IBM Plex Sans.

Validation :
- npm run build : OK
- npm run audit:fields : OK — 45 champs, 58 choix, aucune entrée orpheline
- npm test : OK — 261/261 tests
- nouveau lot test/d100c2-service-priority.test.mjs : 8/8 OK
- Playwright @critical : non exécutable dans l'environnement actuel ; navigateurs Playwright absents et Chromium système bloque les navigations locales avec ERR_BLOCKED_BY_ADMINISTRATOR. Aucun échec fonctionnel de test n'a donc été établi par Playwright dans cet environnement.
