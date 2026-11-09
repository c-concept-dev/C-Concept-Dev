# Étape 0 : le paquet des moteurs doit être hermétique, et le prouver

**Décidé et autorisé par Christophe le 9 novembre 2026**, dans la fenêtre de la session. Ses mots :

> « Étape 0 AUTORISÉE, en priorité : rendre le paquet des moteurs hermétique. Corrige `reecrire()`
> dans `preparer-moteurs.py` (apparier sur le nom résolu), retire son silence (`check=True`, échec
> s'il reste un seul `/opt/homebrew`), et un contrôle au dépôt sur `otool -L`. Étends la
> vérification à TOUS les binaires embarqués (node, sf, tesseract). Puis rejoue la préparation,
> refabrique et réinstalle l'application, et prouve par `DYLD_PRINT_LIBRARIES` que rien ne sort du
> paquet. »

> « Licences : textes embarqués dans l'archive ET dans l'application (Tesseract, tessdata,
> leptonica, codecs, et ceux de node et sf). »

L'application ne charge **rien** hors de son paquet, et embarque les textes de licence de tout ce
qu'elle redistribue. La vérification porte sur **tous** les binaires embarqués, pas sur le seul qui
avait montré le défaut.

## La raison

Ce n'était pas une faiblesse de l'intégration continue : c'était un **défaut de ce qui est livré**.
Mesuré le 9 novembre, le Tesseract embarqué chargeait **six codecs d'image depuis
`/opt/homebrew/Cellar`**. Le paquet se chargeait donc ici, où Homebrew est installé, et ne se
serait pas chargé chez un testeur. La préparation prétendait réécrire ces références et échouait en
silence : `install_name_tool` y tournait avec `check=False`.

Le contrôle qui existait demandait « le moteur démarre-t-il ? ». Il ne pouvait pas voir le défaut —
il démarre très bien sur la machine qui l'a fabriqué. Un garde-fou qui demande qu'on lise
attentivement n'est pas un garde-fou : on regarde désormais les **références elles-mêmes**.

## Ce qui est tenu, et ce qui ne l'est pas

Tenu, par `28baedaf` (intégration continue 42540275093 verte) : la préparation réécrit sur le nom
résolu et échoue au lieu de se taire ; le garde-fou `paquet-hermetique` juge les références de tous
les Mach-O du paquet ; `DYLD_PRINT_LIBRARIES` compte **0** chargement hors du paquet contre 6
avant, et 15 depuis `Contents/Resources/moteurs/lib` dans l'application empaquetée et signée.

Non tenu : les **licences** ne sont pas embarquées — 13 textes présents sur la machine, 4 manquants
(leptonica, node, siegfried, tessdata_fast), dont l'obtention ajoute quatre empreintes à épingler.
Et il n'est **pas prouvé que l'ancien paquet échoue** sans Homebrew : masquer `/opt/homebrew`
demande des droits d'administration. Ce qui est prouvé, c'est qu'il chargeait depuis
`/opt/homebrew/Cellar`.
