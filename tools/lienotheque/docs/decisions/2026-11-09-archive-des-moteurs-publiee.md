# L'archive des moteurs est publiée, et la CI lit avec elle

**Autorisé par Christophe le 9 novembre 2026**, sous condition, et la condition est remplie :

> « Publication de l'archive des moteurs AUTORISÉE, après avoir confirmé sur les textes embarqués
> qu'aucun composant n'impose d'obligation que nous ne remplissons pas (liblzma, lz4 : bibliothèque
> seule). Puis l'empreinte épinglée et la CI macOS lisant avec ce programme. »

La confirmation est dans
[`2026-11-09-licences-aucune-obligation-non-remplie.md`](2026-11-09-licences-aucune-obligation-non-remplie.md).
Elle a fait apparaître un point — le § 4(b) de l'Apache-2.0 — qui est **fermé par un fait** plutôt
que laissé à une lecture juridique : l'avis de modification est écrit, et il voyage dans l'archive.

## Ce qui est publié

| | |
|---|---|
| étiquette | `lienotheque-moteurs-macos-arm64-2026-11-09` |
| fichier | `moteurs-macos-arm64-2026-11-09.tar.gz` |
| empreinte sha256 | `373005d51aa85b3a25ab6330debea9ff3ae95e24e86cc0a32a384a9989a3a231` |
| poids | 112 Mo comprimés, 294 Mo déployés |
| adresse | `https://github.com/c-concept-dev/C-Concept-Dev/releases/download/lienotheque-moteurs-macos-arm64-2026-11-09/moteurs-macos-arm64-2026-11-09.tar.gz` |

**Ce n'est pas l'application** : c'est l'ensemble de ce qu'elle redistribue, dans les octets exacts
qu'elle porte.

## L'archive soumise la veille au soir est remplacée

Celle que j'avais soumise à 21 h portait `sha256 024b1fca…` et pesait 96 Mo. Elle **n'a jamais été
publiée**, et elle est périmée : entre les deux, le paquet des moteurs a gagné le binaire annexe de
`sf` (dette D21), une chaîne refabriquée, et l'avis de modification. Publier la première aurait
publié un paquet qui n'est plus celui de l'application — exactement ce que la dette D1 reproche.

**La version 25.4 du cahier cite encore `024b1fca…`** à son étape 0. Le cahier se verse intact :
l'écart est signalé, pas corrigé.

## Éprouvée avant publication, et après

Avant : déployée dans un dossier neuf, elle rend le paquet `diff -r` **muet**, fichier par fichier ;
le `tesseract` extrait annonce `5.5.1 / leptonica-1.86.0`, le `sf` extrait `siegfried 1.11.9` avec
les signatures de l'archive ; `otool -L` sur ses 21 Mach-O donne **0** référence hors du paquet.

Après : l'asset a été **retéléchargé depuis son adresse publique**, exactement comme la CI le fera.
L'empreinte obtenue est celle qui est épinglée, au caractère près ; l'archive se déploie et les deux
programmes démarrent. Une empreinte épinglée qui ne serait pas celle de l'objet servi ferait rougir
toutes les courses, et c'est le genre de défaut qui se découvre au pire moment.

## Ce que la CI en fait (voie 3, dette D1 levée)

Le coureur macOS **relève l'adresse et l'empreinte dans la fixture**, jamais recopiées dans le
workflow ; reprend les moteurs en cache avec l'**empreinte pour clef** ; télécharge, **vérifie** et
s'arrête si l'empreinte diffère ; puis met `moteurs/bin` en tête du `PATH` et pose
`TESSDATA_PREFIX`. Les contrôles qui lisent y tournent donc sur **le même programme que
l'application**, et non sur un Tesseract voisin installé par un gestionnaire de paquets.

Le coureur Linux ne change pas : il n'a pas Tesseract et saute ces contrôles en nommant leur raison.

## Ce qui n'est pas prouvé, et qui le sera par la course

Que des binaires **signés ad hoc** démarrent sur un coureur GitHub. C'est vérifié ici, sur cette
machine. Si macOS les refuse là-bas, la course rougira et le dira — comportement voulu, pas
surprise. L'étiquette de la publication pointe sur `e1729981`, dernier commit poussé au moment de
la publication, alors que les octets viennent de l'arbre de `961ada1a` : l'étiquette est un repère,
l'**empreinte** est l'identité, et les notes de la publication le disent.
