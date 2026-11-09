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
Mesuré le 9 novembre, le Tesseract embarqué chargeait **sept bibliothèques depuis
`/opt/homebrew/opt`, par neuf renvois**. Le paquet se chargeait donc ici, où Homebrew est installé,
et ne se serait pas chargé chez un testeur.

> **Compte corrigé le 9 novembre 2026**, en relevant la preuve avant de supprimer le témoin. J'avais
> écrit « six codecs d'image ». Le relevé exact donne **sept bibliothèques distinctes** et **neuf
> renvois** — `zstd` et `jpeg` sont chargés deux fois, par deux bibliothèques différentes. Le
> tableau ci-dessous est ce relevé, et non un souvenir. La préparation prétendait réécrire ces références et échouait en
silence : `install_name_tool` y tournait avec `check=False`.

Le contrôle qui existait demandait « le moteur démarre-t-il ? ». Il ne pouvait pas voir le défaut —
il démarre très bien sur la machine qui l'a fabriqué. Un garde-fou qui demande qu'on lise
attentivement n'est pas un garde-fou : on regarde désormais les **références elles-mêmes**.

## La preuve, en neuf lignes

Le paquet d'**avant** l'étape 0 avait été gardé de côté sous le nom `moteurs.casse-avant-etape-0`,
dans la copie liée `C-Concept-Dev-main-fusion-wt` — 269 Mo que `preparer-moteurs.py`, corrigé, ne
sait plus produire. Avant de le supprimer sur le mot de Christophe du 9 novembre, voici ce qu'il
prouvait. Relevé par `otool -L` sur ses bibliothèques, le 9 novembre 2026 :

| Bibliothèque du paquet | Chargeait, hors du paquet |
|---|---|
| `libleptonica.6.dylib` | `/opt/homebrew/opt/jpeg-turbo/lib/libjpeg.8.dylib` |
| | `/opt/homebrew/opt/giflib/lib/libgif.dylib` |
| | `/opt/homebrew/opt/webp/lib/libwebp.7.dylib` |
| | `/opt/homebrew/opt/webp/lib/libwebpmux.3.dylib` |
| | `/opt/homebrew/opt/openjpeg/lib/libopenjp2.7.dylib` |
| `libtiff.6.dylib` | `/opt/homebrew/opt/zstd/lib/libzstd.1.dylib` |
| | `/opt/homebrew/opt/jpeg-turbo/lib/libjpeg.8.dylib` |
| `libarchive.13.dylib` | `/opt/homebrew/opt/zstd/lib/libzstd.1.dylib` |
| | `/opt/homebrew/opt/lz4/lib/liblz4.1.dylib` |

**Neuf renvois, sept bibliothèques distinctes** (`jpeg-turbo`, `giflib`, `webp`, `webpmux`,
`openjpeg`, `zstd`, `lz4`). Dans le paquet en service, le même relevé donne **zéro**. Les cinq
binaires des deux paquets (`tesseract`, `node`, `sf`, et les deux variantes nommées par
l'architecture) n'ont, eux, jamais rien chargé hors du paquet : le défaut était entièrement dans
les bibliothèques.

C'est une preuve **par contraste**, et elle valait mieux que ses 269 Mo : neuf lignes la portent
entièrement. Ce qu'elle ne dit pas reste inchangé — elle montre que l'ancien paquet **chargeait**
depuis `/opt/homebrew`, pas qu'il **échouait** sans lui.

## Ce qui est tenu, et ce qui ne l'est pas

Tenu, par `28baedaf` (intégration continue 42540275093 verte) : la préparation réécrit sur le nom
résolu et échoue au lieu de se taire ; le garde-fou `paquet-hermetique` juge les références de tous
les Mach-O du paquet ; `DYLD_PRINT_LIBRARIES` compte **0** chargement hors du paquet contre 6
avant, et 15 depuis `Contents/Resources/moteurs/lib` dans l'application empaquetée et signée.

Non tenu : les **licences** ne sont pas embarquées.

> **Compte corrigé le 9 novembre 2026.** J'avais écrit « 13 textes présents, 4 manquants
> (leptonica, node, siegfried, tessdata_fast) ». Le texte de `tessdata` **est** sur la machine,
> livré avec les fichiers de langue que l'application embarque. Il en manque donc **trois** :
> `leptonica` (son dossier d'installation n'en porte aucun), `node` (installé hors Homebrew ; seul
> celui de `npm` est là) et `siegfried` (absent de Homebrew, obtenu depuis une version publiée).
> Trois empreintes à épingler, non quatre.
Et il n'est **pas prouvé que l'ancien paquet échoue** sans Homebrew : masquer `/opt/homebrew`
demande des droits d'administration. Ce qui est prouvé, c'est qu'il chargeait depuis
`/opt/homebrew/Cellar`.
