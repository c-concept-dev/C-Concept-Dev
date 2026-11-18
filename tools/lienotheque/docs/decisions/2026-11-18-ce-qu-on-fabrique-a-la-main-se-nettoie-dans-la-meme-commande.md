# Ce qu'on fabrique à la main se nettoie dans la même commande

**Décidé par** Christophe, dans la fenêtre de la session du 18 novembre 2026.
**Date** : 18 novembre 2026.

## La règle

> « Une règle : ce que tu fabriques à la main hors du contrôle (cibles de compilation, dépôts
> d'essai), tu le nettoies dans la même commande. »

Elle vise mes propres commandes — celles que je tape pour mesurer, éprouver ou vérifier quelque
chose en dehors de la suite de contrôles. Pas la suite : ce qu'elle fabrique est désormais couvert
par le **bac de la course** du lot `0c quater`, qui pose son propre dossier temporaire et l'efface.

## Ce qui l'a fait écrire

Le 17 novembre 2026, le disque de cette machine s'est rempli au point qu'aucune commande ne
démarrait plus. Le dossier temporaire a été relevé le lendemain : les **5,8 Go** n'étaient pas les
deux cents dossiers oubliés par les contrôles — presque tous vides, 0 ko —, c'étaient **trois
cibles de compilation Rust de 1,9 Go chacune**, `.rustc_info.json` et `debug/`. Rien dans le dépôt
ne demande de cible temporaire : ni `CARGO_TARGET_DIR`, ni `--target-dir`, vérifié par recherche
sur tout le dépôt. Elles venaient de commandes de **mesure** que j'ai lancées à la main, et que
j'ai laissées derrière moi.

## Pourquoi elle ne se mécanise pas, et ce qu'elle demande donc

Une commande tapée à la main n'a pas de fin de suite où brancher un nettoyage : il n'y a aucun
endroit où poser un garde-fou qui la suivrait. Seule la commande elle-même peut se nettoyer, dans
la même ligne — un `trap` pour qu'une interruption l'emporte aussi, ou un effacement explicite à
la suite. Ce n'est donc pas un garde-fou mécanique de plus, et le § 4.6 du cahier le dit ainsi :
c'est une règle qui se tient à la main, comme celle du 17 novembre sur les autorisations.

## Portée

Toute commande de mesure, d'épreuve ou d'essai lancée hors de la suite de contrôles, dans ce
projet. Le bac de la course couvre le reste : voir la [décision du 18 novembre sur le relevé du
dépôt](2026-11-18-git-status-enumere-l-empreinte-juge.md), née du même lot.
