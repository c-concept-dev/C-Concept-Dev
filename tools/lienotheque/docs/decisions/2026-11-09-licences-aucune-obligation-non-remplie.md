# Les licences embarquées : ce qu'elles obligent, et ce que nous faisons

**Demandé par Christophe le 9 novembre 2026**, comme condition de la publication de l'archive :

> « Publication de l'archive des moteurs AUTORISÉE, **après avoir confirmé sur les textes embarqués
> qu'aucun composant n'impose d'obligation que nous ne remplissons pas** (liblzma, lz4 :
> bibliothèque seule). Puis l'empreinte épinglée et la CI macOS lisant avec ce programme. »

Voici cette confirmation, lue **dans les textes embarqués** et non de mémoire. Je ne suis pas
juriste : ce qui suit est un relevé de ce que les textes disent, avec un point résiduel nommé à la
fin, qui appartient à Christophe.

## Les 17 composants et leur famille de licence

| Composant | Texte embarqué | Famille |
|---|---|---|
| tesseract 5.5.1 (+ `libtesseract`) | `LICENSE` | Apache-2.0 |
| tessdata (eng, fra) | `LICENSE` | Apache-2.0 |
| siegfried 1.11.9 | `LICENSE.txt` | Apache-2.0 |
| node 24.11.1 | `LICENSE` | MIT, puis **2 666 lignes** portant les licences de ce que Node embarque |
| leptonica 1.86.0 | `leptonica-license.txt` | famille BSD |
| jpeg-turbo 3.1.2 | `LICENSE.md` | famille BSD |
| libtiff 4.7.1 | `LICENSE.md` | famille BSD |
| openjpeg 2.5.4 | `LICENSE` | famille BSD |
| libarchive 3.8.2 | `COPYING` | famille BSD |
| webp 1.6.0 (+ `webpmux`, `sharpyuv`) | `COPYING` | BSD-3 (la clause « Neither the name » y est) |
| giflib 5.2.2 | `COPYING` | MIT ou proche |
| libpng 1.6.50 | `LICENSE` | PNG Reference Library License v2 |
| libb2 0.98.1 | `COPYING` | CC0 |
| xz 5.8.1 (`liblzma`) | `COPYING`, `COPYING.0BSD`, `COPYING.GPLv2`, `COPYING.GPLv3`, `COPYING.LGPLv2.1` | **0BSD** pour la bibliothèque |
| lz4 1.10.0 | `LICENSE` | **BSD-2** pour `lib`, GPL-2+ pour le reste |
| zstd 1.5.7 | `LICENSE`, `COPYING` | BSD pour la bibliothèque, GPL-2 en option |
| chaîne (pdf.js, canvas) | 9 textes, dans la chaîne elle-même | — |

## Ce que ces textes obligent

**Une seule obligation, et elle est de la même nature partout : l'attribution.** Joindre le texte de
la licence et l'avis de copyright à ce qu'on distribue. C'est exactement ce que
`moteurs/licences/` fait, et le garde-fou `licences-embarquees` le maintient — il part des fichiers
réellement présents dans le paquet et demande pour chacun qui en répond.

**Le texte de node porte 2 666 lignes**, et ce n'est pas du remplissage : après sa propre licence
MIT viennent celles de tout ce que Node embarque. Le joindre couvre donc aussi ses dépendances.

## Les textes de copyleft présents couvrent ce que nous ne livrons pas

C'est le point que Christophe nomme, et les textes amont le disent eux-mêmes :

- **xz** — son `COPYING` écrit noir sur blanc : « liblzma is under the BSD Zero Clause License
  (0BSD) », et la GPL ne concerne que les scripts `xzgrep`, `xzdiff`, `xzless`, `xzmore` ; la
  LGPL-2.1 ne concerne que `getopt_long`, compilé seulement sur les systèmes qui n'en ont pas.
  Le 0BSD **n'impose rien du tout**, pas même l'attribution.
- **lz4** — son `LICENSE` écrit : « all files in the `lib` directory use a BSD 2-Clause license /
  all other files use a GPL-2.0-or-later license ». Les fichiers GPL sont dans `programs`, `tests`
  et `examples`.
- **zstd** — les deux textes sont embarqués ; la bibliothèque est sous BSD, la GPL-2 est l'autre
  branche d'un choix laissé au destinataire.

**Et nous ne livrons que les bibliothèques.** Vérifié sur le paquet : `moteurs/bin/` ne contient
que `node`, `sf`, `tesseract` et leurs deux binaires annexes — **aucun** exécutable `xz`, `lz4` ou
`zstd`.

## Aucun NOTICE à joindre

L'Apache-2.0 demande, à son § 4(d), de joindre les avis d'attribution **si l'œuvre porte un fichier
NOTICE**. Vérifié à l'amont, aux étiquettes de version que nous embarquons :

| Dépôt | À l'étiquette | NOTICE |
|---|---|---|
| `tesseract-ocr/tesseract` | `5.5.1` | aucun |
| `tesseract-ocr/tessdata_fast` | `main` | aucun |
| `richardlehane/siegfried` | `v1.11.9` | aucun |

Le § 4(d) n'ajoute donc rien.

## Le seul point ouvert, et il est fermé par un fait plutôt que par un avis juridique

L'Apache-2.0, à son § 4(b), demande que **les fichiers modifiés portent un avis disant qu'ils l'ont
été**. Or `preparer-moteurs.py` réécrit les références de chargement des Mach-O embarqués avec
`install_name_tool` : les octets de `libtesseract.5.dylib` que nous distribuons ne sont pas ceux
que Homebrew a posés. Savoir si cela fait du binaire un « fichier modifié » au sens du § 4(b) est
une **lecture juridique**, pas une mesure — et ce n'est donc pas à moi de la trancher.

Plutôt que de publier avec cette question ouverte, **l'avis est écrit**. La collecte produit
`moteurs/licences/MODIFICATIONS.txt`, qui voyage dans l'application et dans l'archive, et qui dit
ce qui a été fait **à chaque fichier** :

- **17 Mach-O dont les références de chargement ont été réécrites** — `tesseract`, son binaire
  annexe, et les quinze bibliothèques ;
- **4 copiés tels quels, aucune référence touchée** — `node`, `sf` et leurs binaires annexes ;
- tous re-signés ensuite, parce que toute modification d'un Mach-O, et la copie elle-même sur cette
  architecture, invalide la signature précédente ;
- aucun changement de code, de comportement ni de données, et le script qui le fait est public.

**L'avis est produit, jamais écrit à la main** : il classe chaque Mach-O par ce que ses octets
montrent — une référence en `@rpath` ou `@loader_path` pointe dans le paquet, donc elle a été
réécrite. La première version de cet avis comptait `node` et `sf` parmi les fichiers réécrits :
c'était faux, et c'est la mesure qui l'a corrigé. Un avis de modification qui en dit trop ne vaut
pas mieux qu'un avis qui en dit trop peu. Un contrôle vérifie qu'il est là, qu'il nomme des
fichiers, et qu'il dit les **deux** moitiés.

**Conclusion** : aucune obligation relevée dans les textes embarqués n'est laissée non remplie. Le
§ 4(b) de l'Apache-2.0 est tenu que sa lecture soit large ou étroite, puisque l'avis existe.
