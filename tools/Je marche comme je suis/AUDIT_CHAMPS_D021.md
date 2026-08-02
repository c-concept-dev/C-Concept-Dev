# D-021 — Audit exhaustif des champs

> Cet audit distingue la couverture structurelle de la complétude fonctionnelle. Un champ enregistré n’est pas automatiquement considéré comme entièrement réalisé.

## Résumé

- Champs visibles : **41**
- Groupes de choix : **5**
- Choix visibles : **62**
- Entrées complètes : **25**
- Entrées partielles : **21**
- Champs orphelins : **0**
- Choix orphelins : **0**

## Matrice

| Champ / groupe | Type | Effet | Sévérité | Données requises | Inconnu | État | Observation |
|---|---|---|---|---|---|---|---|
| place | field | generation | information | geocoding | block | complete | Géocodage et génération depuis un départ réel. |
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
| noStairs | field | generation-audit | imperative | steps | block | complete | Évitement ORS et contrôle des données de marches. |
| noExposure | field | audit | imperative | exposure | block | partial | Contrôle prévu mais preuve d’exposition encore souvent absente. |
| limitationSide | field | explanation | preparation | — | preserve-unknown | complete | Côté déclaré conservé comme contexte, sans diagnostic ni déduction. |
| limitationTrigger | field | generation-audit | imperative | confirmed-functional-effect | confirm | complete | Déclencheur concret raccordé aux règles fonctionnelles D-024. |
| limitationConsequence | field | generation-audit | imperative | confirmed-functional-effect | confirm | complete | Conséquence appliquée uniquement après confirmation explicite. |
| limitationTemporality | field | explanation | preparation | — | preserve-unknown | complete | Temporalité conservée dans chaque règle dérivée. |
| maxWithoutPause | field | generation-audit | imperative | pause-plan | block-if-set | complete | Seuil facultatif conservé et utilisé sans remplacement automatique. |
| maxStanding | field | audit | imperative | standing-duration | block-if-set | complete | Seuil facultatif audité ; une mesure absente reste à vérifier. |
| helperAvailable | field | preparation | preparation | — | preserve-unknown | complete | Contexte de préparation sans bonus de capacité. |
| limitationConfirmed | field | confirmation | imperative | confirmed-functional-effect | confirm | complete | Confirmation obligatoire avant toute règle dérivée. |
| effort | field | generation-ranking | preference | elevation | rank-only | complete | Classement par profil et métriques d’effort. |
| ascentMinutes | field | generation-audit | conditional | elevation, segment-times | block-if-set | partial | Champ compilé ; mesure continue à consolider. |
| upSlope | field | generation-audit | conditional | steepness | block-if-set | complete | Pente montante auditée lorsqu’elle est disponible. |
| downSlope | field | generation-audit | conditional | steepness | block-if-set | complete | Pente descendante auditée lorsqu’elle est disponible. |
| recovery | field | audit | conditional | elevation, segment-times, benches | block-if-set | partial | Règle compilée ; segment facile ou banc pas toujours prouvé. |
| weather | field | generation-audit | preparation | observed-weather | preserve-unknown | partial | Constat manuel conservé ; Open-Meteo n’est pas encore intégré. |
| pauses | field | generation-audit | preparation | pause-places | block-if-required | partial | Temps inclus dans le budget ; positionnement réel à compléter. |
| freeText | field | explanation-confirmation | preparation | structured-limitations | confirm | partial | Texte explicatif uniquement tant qu’il n’est pas confirmé en paramètres. |
| strict | field | selection | imperative | — | block-unknown-hard | complete | Empêche les assouplissements silencieux. |
| shortcuts | field | generation-audit | conditional | shortcut-routes | block-if-required | partial | Demande compilée ; calcul de raccourcis réels à compléter. |
| bothWays | field | generation-audit | conditional | reverse-audit | block-if-required | complete | Les deux sens sont audités. |
| private | field | persistence | preparation | — | allow | partial | Intention de non-persistance présente ; audit complet du stockage à faire. |
| gpxFile | field | route-source | imperative | geometry | block | complete | Import multi-traces/segments ; distance et altitude recalculées ; audit universel ORS/GPX ; données terrain absentes préservées comme invérifiables. |
| equipment | choice-group | generation-audit | conditional | surface, width, kerb, steps | block-if-imperative | partial | Options ORS et audits présents pour certains équipements seulement. |
| limits | choice-group | generation-audit | conditional | surface, slope, width, services | block-if-imperative | partial | Plusieurs limitations sont traduites ; seuils fonctionnels à structurer. |
| terrain | choice-group | generation-ranking-audit | preference | surface, waytype, traffic | preserve-unknown | partial | Influence génération et classement ; régularité/largeur restent souvent inconnues. |
| wishes | choice-group | generation-ranking | preference | green, noise, pois | rank-only | partial | Classement partiel ; plusieurs envies nécessitent des POI avant sélection. |
| services | choice-group | generation-audit | imperative | pois | block | partial | Recherche possible après sélection ; impératifs avant sélection à réaliser. |

## Conclusion

La couverture structurelle passe : aucun contrôle visible ni choix visible n’est orphelin.

Les entrées marquées **partial** restent visibles parce qu’elles ont déjà un effet réel, mais elles ne doivent pas être présentées comme complètement conformes au cahier des charges. Elles alimentent la feuille de route P0.2.
