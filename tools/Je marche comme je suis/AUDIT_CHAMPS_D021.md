# D-021 — Audit exhaustif des champs

> Cet audit distingue la couverture structurelle de la complétude fonctionnelle. Un champ enregistré n’est pas automatiquement considéré comme entièrement réalisé.

## Résumé

- Champs visibles : **43**
- Groupes de choix : **5**
- Choix visibles : **62**
- Entrées complètes : **33**
- Entrées partielles : **16**
- Champs orphelins : **0**
- Choix orphelins : **0**

## Matrice

| Champ / groupe | Type | Effet | Sévérité | Données requises | Inconnu | État | Observation |
|---|---|---|---|---|---|---|---|
| place | field | generation | information | geocoding | block | complete | Géocodage et génération depuis un départ réel. |
| departureMode | field | generation-context | information | departure-schedule | use-now | complete | Choisit un départ immédiat ou programmé. |
| departureDate | field | generation-context | information | departure-schedule | required-if-scheduled | complete | Date utilisée pour la météo et la lumière du jour lorsque le départ est programmé. |
| departureTime | field | generation-context | information | departure-schedule | required-if-scheduled | complete | Heure utilisée pour la météo et la lumière du jour lorsque le départ est programmé. |
| lat | field | generation | information | coordinate | fallback-place | complete | Coordonnée utilisée par la génération. |
| lon | field | generation | information | coordinate | fallback-place | complete | Coordonnée utilisée par la génération. |
| returnRadius | field | audit | imperative | geometry | block | complete | Fermeture contrôlée après calcul. |
| returnTime | field | generation-audit | imperative | clock | block | complete | Réduit le budget disponible. |
| duration | field | generation-audit | imperative | duration | block | complete | Plafond audité sur la durée réelle. |
| timeIncludes | field | generation-audit | imperative | pause-plan | block | complete | Détermine les composantes incluses dans le budget. |
| margin | field | generation-audit | imperative | duration | block | complete | Soustraite avant génération et auditée. |
| pace | field | generation | information | duration | use-prudent-default | complete | Transforme le budget de marche en cible de distance. |
| age | field | explanation | preparation | — | allow | partial | N’interdit rien ; son effet de confirmation reste limité. |
| level | field | generation-ranking | preference | — | use-prudent-default | partial | Influence la prudence de génération, sans calibration terrain. |
| company | field | generation-audit | preparation | — | allow | partial | Conservé dans la demande ; isolement et traversées restent incomplets. |
| fitness | field | generation | preference | — | use-prudent-default | partial | Influence la cible, sans calibration terrain. |
| fatigue | field | generation-audit | conditional | shortcuts | use-prudent-default | partial | Réduit la cible et favorise les replis ; contrôle des replis incomplet. |
| pain | field | generation-audit | conditional | functional-effects | confirm | partial | Déclenche une prudence générale ; conséquences structurées à compléter. |
| balance | field | generation-audit | conditional | surface, width | block-if-imperative | partial | Favorise régularité et prudence ; largeur/dévers encore incomplets. |
| painDetail | field | explanation | preparation | structured-limitations | confirm | partial | Texte conservé mais aucune extraction automatique non confirmée. |
| footwear | field | generation-audit | imperative | surface | block | complete | Matrice de surfaces et audit des incompatibilités documentées. |
| limitationTrigger | field | generation-audit | conditional | confirmed-functional-effect | confirm | complete | Déclencheur traduit en conséquence fonctionnelle confirmée. |
| maxWithoutPause | field | generation-audit | conditional | segment-times | block-if-set | complete | Seuil utilisateur transformé en plan de pause et règle explicite. |
| maxStanding | field | generation-audit | conditional | pause-places | block-if-set | complete | Seuil utilisateur transformé en règle de préparation contrôlable. |
| helperAvailable | field | explanation | information | — | preserve-unknown | complete | Information de préparation conservée sans bonus de capacité. |
| limitationSide | field | explanation | information | — | preserve-unknown | complete | Côté déclaré, conservé dans la demande et expliqué. |
| limitationConsequence | field | generation-audit | conditional | confirmed-functional-effect | confirm | complete | Éviter, limiter, ralentir, pause ou repli modifient la demande. |
| limitationTemporality | field | explanation | information | — | preserve-unknown | complete | Contexte temporel conservé dans la règle dérivée. |
| noStairs | field | generation-audit | imperative | steps | block | complete | Évitement ORS et contrôle des données de marches. |
| noExposure | field | audit | imperative | exposure | block | partial | Contrôle prévu mais preuve d’exposition encore souvent absente. |
| effort | field | generation-ranking | preference | elevation | rank-only | complete | Classement par profil et métriques d’effort. |
| ascentMinutes | field | generation-audit | conditional | elevation, segment-times | block-if-set | complete | Durée maximale de montée continue calculée par le noyau altimétrique D-025. |
| descentMinutes | field | generation-audit | conditional | elevation, segment-times | block-if-set | complete | Durée maximale de descente continue calculée par le noyau altimétrique D-025. |
| upSlope | field | generation-audit | conditional | steepness | block-if-set | complete | Pente montante auditée lorsqu’elle est disponible. |
| downSlope | field | generation-audit | conditional | steepness | block-if-set | complete | Pente descendante auditée lorsqu’elle est disponible. |
| recovery | field | audit | conditional | elevation, segment-times, benches | block-if-set | complete | Séquence facile mesurée après effort ; banc jamais présumé. |
| pauses | field | generation-audit | preparation | pause-places | block-if-required | complete | Budget conservé et pauses positionnées sur la géométrie ; les lieux non prouvés restent invérifiables. |
| freeText | field | explanation-confirmation | preparation | structured-limitations | confirm | partial | Texte explicatif uniquement tant qu’il n’est pas confirmé en paramètres. |
| strict | field | selection | imperative | — | block-unknown-hard | complete | Empêche les assouplissements silencieux. |
| shortcuts | field | generation-audit | conditional | shortcut-routes | block-if-required | complete | Replis sur ses pas calculés sur la géométrie réelle ; raccourcis seulement aux points de passage communs prouvés. |
| bothWays | field | generation-audit | conditional | reverse-audit | block-if-required | complete | Les deux sens sont audités. |
| private | field | persistence | preparation | — | allow | complete | Le mode privé efface immédiatement le profil local et bloque toute nouvelle persistance sans interrompre le calcul. |
| gpxFile | field | route-source | imperative | geometry | block | complete | Import multi-traces/segments ; distance et altitude recalculées ; audit universel ORS/GPX ; données terrain absentes préservées comme invérifiables. |
| equipment | choice-group | generation-audit | conditional | surface, width, kerb, steps | block-if-imperative | partial | Options ORS et audits présents pour certains équipements seulement. |
| limits | choice-group | generation-audit | conditional | surface, slope, width, services | block-if-imperative | partial | Plusieurs limitations sont traduites ; seuils fonctionnels à structurer. |
| terrain | choice-group | generation-ranking-audit | preference | surface, waytype, traffic | preserve-unknown | partial | D-026 qualifie la couverture des surfaces et la force de preuve ; largeur et exposition restent invérifiables sans source dédiée. |
| wishes | choice-group | generation-ranking | preference | green, noise, pois | rank-only | partial | Classement partiel ; plusieurs envies nécessitent des POI avant sélection. |
| services | choice-group | generation-audit | imperative | pois | block | partial | Les services impératifs sont audités ; disponibilité, horaires et accessibilité restent dépendants des sources. |
| limitationConfirmed | internal-field | generation-audit | conditional | confirmed-functional-effect | confirm | unreviewed | État fonctionnel non qualifié. |
| weather | internal-field | generation-audit | preparation | observed-weather | preserve-unknown | partial | Prévision horaire analysée ; la couverture réelle dépend encore du service et de sa fraîcheur. |

## Conclusion

La couverture structurelle passe : aucun contrôle visible ni choix visible n’est orphelin.

Les entrées marquées **partial** restent visibles parce qu’elles ont déjà un effet réel, mais elles ne doivent pas être présentées comme complètement conformes au cahier des charges. Elles alimentent la feuille de route P0.2.
