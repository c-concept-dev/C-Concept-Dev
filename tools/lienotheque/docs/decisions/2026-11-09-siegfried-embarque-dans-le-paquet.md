# Siegfried voyage dans le paquet, et il y démarre

**Décidé par Christophe le 9 novembre 2026** : « Embarque Siegfried (`sf`), hermétique et avec sa
licence (D21). » Lève la dette **D21**.

## Ce qui était en désaccord

Le § 3.6 du cahier de pilotage nomme `sf` parmi ce que l'application redistribue. Elle ne
l'emportait pas : `tauri.conf.json` ne déclarait que `tesseract` et `node` en binaires annexes, et
`moteurs/siegfried` n'était dans aucune ressource. La règle disait une chose, le paquet en faisait
une autre, et rien ne le signalait.

## Ce qui est fait

- `tauri.conf.json` déclare `moteurs/bin/sf` en **binaire annexe** — il voyage donc à côté de
  `node` et de `tesseract`, dans `Contents/MacOS`, c'est-à-dire **en tête du `PATH`** que
  `ou_sont_les_moteurs` donne à la chaîne ;
- `moteurs/siegfried` devient une **ressource** : le fichier de signatures PRONOM arrive dans
  `Contents/Resources/moteurs/siegfried/default.sig` ;
- `preparer-moteurs.py` fabrique le binaire annexe `sf-<triplet>` que Tauri exige, signé, par le
  même geste que pour Tesseract ;
- son texte de licence était déjà collecté (`licences/siegfried-1.11.9/LICENSE.txt`, Apache-2.0) :
  la collecte part des fichiers du paquet, et `bin/sf` en faisait déjà partie.

Le garde-fou `siegfried-embarque` regarde, dans cet ordre : que `sf` est là, qu'il **ne charge rien
hors du paquet**, qu'il **démarre avec le fichier de signatures du paquet**, que son texte de
licence voyage avec lui — et qu'il **s'arrête** quand on l'appelle sans ses signatures, ce qui
prouve que le `-sig` du contrôle précédent n'est pas décoratif.

## Ce que ce lot NE fait pas, et qu'il faut savoir

**La chaîne n'appelle pas Siegfried.** Mesuré le 9 novembre sur le programme livré,
`moteurs/chaine/moteur.js` (2,7 Mo) :

| Chaîne cherchée | Occurrences |
|---|---|
| `"sf"` | **0** |
| `"-sig"` | **0** |
| `"-json"` | **0** |
| `siegfried` | **0** |

Le point d'entrée empaqueté est `outils/ingestion/src/moteur.ts`, et le graphe qu'esbuild en tire
n'atteint pas la branche Siegfried d'`identifier()`. Embarquer `sf` met donc le paquet **en accord
avec la règle 3.6** et rend l'outil disponible ; cela **ne change pas ce que l'application fait
aujourd'hui**. Le jour où la chaîne l'appellera est un autre lot, et il devra prouver l'appel, pas
la présence.

## Une correction d'ordre trouvée en chemin

En rejouant les préparations, un défaut est apparu dans ce que j'avais écrit la veille : la collecte
des licences était branchée au bout de `preparer-moteurs.py`, **qui tourne en premier**. Elle
passait donc avant que `preparer-moteur-node.py` ne pose `moteurs/chaine`, et n'aurait pas vu les
**neuf textes** que la chaîne porte. Le garde-fou ne l'aurait pas vu non plus : il vérifie que
chaque texte **annoncé** est là, pas qu'aucun ne manque à l'annonce.

Deux gestes, et le second est le vrai garde-fou :

1. la collecte passe au bout de `preparer-moteur-node.py`, là où le paquet est complet ;
2. `collecter-licences.py` **refuse** de tourner si `bin`, `lib`, `tessdata` ou `chaine` manque —
   un paquet incomplet se refuse, il ne se sous-compte pas. Éprouvé : la chaîne écartée, la
   collecte s'arrête et dit quoi faire.
