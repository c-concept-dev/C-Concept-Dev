# L'étape 0 est finie : Christophe a vu l'application

**Vérifié par Christophe le 10 novembre 2026, à l'écran** — niveau 3, la seule preuve que ni les
octets ni les contrôles ne peuvent produire. Ses mots :

> « Regard sur la nouvelle application : **tout est bon**. Elle s'ouvre, la bibliothèque musicale
> aussi, Bass Aerobics affiche ses pages et ses liens comme le 5 novembre. »

C'était la **sixième et dernière case** de l'étape 0. Elle est cochée dans le cahier de pilotage sur
son instruction explicite — « coche la dernière case de l'étape 0 (niveau 3, mes mots), et
inscris-le » —, le cahier étant par ailleurs versé intact et corrigé par lui seul.

## L'application qu'il a vue

Celle installée dans `/Applications` le 9 novembre à 22 h 11, et aucun essai de la nuit ne l'a
modifiée : les preuves par l'exécution lançaient sa chaîne de côté, jamais l'application.

| | |
|---|---|
| paquet | hermétique — 0 chargement hors du paquet (`otool -L` sur les 21 Mach-O, et `vmmap` sur un processus vivant) |
| Siegfried | embarqué, binaire annexe, signatures PRONOM en ressource, démarre avec elles |
| licences | 17 composants, 30 textes, plus l'inventaire et l'avis de modification |
| signature | vérifiée, `codesign --verify --deep --strict` |
| rendu des pages | mesuré sur sa propre chaîne : **500 images et 500 vignettes**, 7,8 Mo |

## Pourquoi cette case ne pouvait pas être cochée autrement

Le § 4.8 range la vérification de Christophe au niveau 3, et le § 7 en fait un critère
d'acceptation à part. Les cinq autres cases de l'étape 0 sont du niveau 1 : des octets, des
références de chargement, des empreintes, une course verte. Celle-ci demande un œil sur l'écran, et
j'ai dû la laisser ouverte quatre messages de suite en le disant — c'est la bonne manière d'échouer
à la cocher.

Ce que j'ai pu établir seul : que l'application se lance depuis `/Applications`, qu'elle vit, qu'elle
ne plante pas, qu'elle ne charge rien hors de son paquet, et que sa chaîne écrit bien les images
des pages. Ce que je n'ai jamais pu voir : **ce qu'elle montre**. `osascript` n'a pas l'accès
d'assistance sur ce poste, et un processus vivant ne prouve pas une fenêtre juste.

## Ce que l'étape 0 a tenu, en six jours

1. `preparer-moteurs.py` réécrit tous les liens, et échoue au lieu de se taire (`28baedaf`) ;
2. `paquet-hermetique` juge `otool -L` sur **tous** les binaires embarqués ;
3. l'application refabriquée, réinstallée, et `DYLD_PRINT_LIBRARIES` pour preuve ;
4. les textes de licence embarqués, collectés par mesure et non par une table écrite à la main
   (`0b6cc977`) ;
5. l'archive des moteurs publiée, son empreinte épinglée, et la CI macOS lisant avec **le même
   programme** que l'application — dette D1 levée, 33 contrôles réveillés, 0 rouge ;
6. **le regard de Christophe.**

## Ce qui reste, et qui n'appartient plus à l'étape 0

Les lots **0g** (brancher la chaîne sur Siegfried, après les étapes 1 à 3), **0h** (D24, les polices
standard de la couche texte) et **0i** (l'option `pages` qui borne la lecture mais pas l'export des
images) sont dans la file. Aucun ne tient l'étape 0 ouverte : le premier dépend d'une décision, le
deuxième est un avertissement sans conséquence de lecture, le troisième est une question.
