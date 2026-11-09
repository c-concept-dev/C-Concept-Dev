# Les licences se collectent par mesure, et s'embarquent dans le paquet

**Autorisé par Christophe le 9 novembre 2026** : « Licences : collecte et embarquement autorisés. »
Lève la dette **D2**, quatrième case de l'étape 0.

## Ce qui est tenu

Le paquet redistribue **23 fichiers** écrits par d'autres : 5 programmes (`tesseract` et son binaire
annexe, `node` et le sien, `sf`), 15 bibliothèques, 2 fichiers de langue, 1 fichier de signatures.
Chacun a maintenant son texte de licence dans le paquet — **17 composants, 30 textes**, 356 ko.

## Comment on sait à qui appartient un fichier

On ne le devine pas, et on n'écrit pas de table à la main : on **retrouve le fichier sous le Cellar
de Homebrew**, et c'est le chemin qui nomme la formule et sa version. Un codec qui entre ou qui sort
du paquet est donc suivi sans toucher au code — le paquet a changé trois fois en deux jours.

Trois textes ne sont pas sur la machine et viennent de l'amont, à **étiquette de version figée** et
empreinte vérifiée, comme Siegfried lui-même :

| Composant | Version | Pourquoi l'amont | Empreinte sha256 |
|---|---|---|---|
| leptonica | 1.86.0 | sa formule Homebrew ne livre aucun texte | `87829abb5bbb00b5…` |
| node | 24.11.1 | installé hors Homebrew ; seul le texte de npm est là | `537308465103a306…` |
| siegfried | 1.11.9 | vient d'une version publiée sur GitHub, pas d'une formule | `cfc7749b96f63bd3…` |

Les adresses portent une étiquette (`1.86.0`, `v24.11.1`, `v1.11.9`), jamais une branche : le texte
d'une branche change sous les pieds, et l'empreinte épinglée deviendrait un faux rouge. Un contrôle
le vérifie.

**Une correction de compte, à sa date.** J'avais annoncé **quatre** textes manquants, dont
`tessdata_fast`. Son texte **est** sur la machine, livré avec les fichiers de langue que
l'application embarque (`share/tessdata/LICENSE`, Apache 2.0, 202 lignes). Il en manquait **trois**.

## Le garde-fou part des fichiers, pas de la liste

`packages/banc/test/licences-embarquees.test.ts` ouvre le paquet, **énumère ce qui s'y trouve
vraiment**, et demande pour chaque fichier qui en répond. L'inverse — partir d'une liste et vérifier
qu'elle est satisfaite — resterait vert sur un codec ajouté hier et oublié.

Il vérifie aussi que chaque texte annoncé est là **aux octets annoncés**, que les trois textes de
l'amont portent l'empreinte épinglée, et que l'**application installée** emporte le dossier — car
collecter sans embarquer ne tient pas la règle 3.6 : c'est le paquet livré qui doit les porter.

Il **saute en nommant sa raison** quand les moteurs sont absents : `moteurs/` est ignoré par Git,
et un coureur d'intégration continue n'a rien à inspecter.

## Ce que ce lot ne dit pas

- Il ne dit pas que le paquet a le **droit** de redistribuer : il dit que le texte qui l'accorde est
  embarqué. Lire les conditions — l'attribution, le copyleft de `liblzma` et de `lz4` — est une
  porte de Christophe, pas une mesure.
- Il ne couvre pas `sf` **dans l'application** : `tauri.conf.json` ne déclare que `tesseract` et
  `node` comme binaires annexes, et `moteurs/siegfried` n'est pas dans ses ressources. Le paquet de
  l'application **n'emporte donc pas Siegfried**, alors que la règle 3.6 le nomme parmi ce qu'elle
  redistribue. L'identification retombe sur les signatures intégrées, proprement — mais l'écart
  entre la règle et le paquet est réel, et il **se signale** ici au lieu d'être tranché.
