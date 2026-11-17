# Sourcelis — contrôle S6

Date du contrôle : 17 novembre 2026.

## Recherche hybride

Preuve d’acceptation fournie par Christophe depuis Sourcelis publié, onglet « Tester la recherche », avec `clone-proxy` version `5413de68-dca1-4f79-b772-8374ef74c9e9` :

- « défusion cognitive pensée » : 15 extraits renvoyés ;
- « différence entre valeur et objectif » : 5 extraits renvoyés ;
- les résultats contiennent `book_title`, `author`, page, langue et traduction automatique pour les extraits anglais ;
- exemples observés : « 05-Ngô » p. 6, « Learning ACT » p. 76 et p. 157, « La therapie d'Acceptation et d'Engagement ACT. que sais je » p. 92 ;
- dans Parcours ACT, Ari cite des extraits cohérents avec ceux affichés par Sourcelis.

Cette preuve est une observation humaine en production. Codex n’a ni demandé ni extrait la clé d’administration et n’a pas rejoué `/rag-search`.

## État de référence de la bibliothèque

Le 17 novembre 2026, l’appel public en lecture seule à `/library-stats` renvoie HTTP 200 avec :

- 245 ouvrages distincts ;
- 24 421 chunks.

Il n’existe pas de relevé comparable de la veille. Ces valeurs deviennent donc la référence initiale ; elles ne prouvent pas à elles seules une absence de variation antérieure.

## Absence d’écriture

Les contrôles S6 n’ont déclenché aucune route de modification de la bibliothèque. L’appel effectué par Codex était limité à `/library-stats`, en lecture seule.
