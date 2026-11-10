# Une épingle ne nomme aucun contrôle disparu

**Né d'un incident du 10 novembre 2026, et d'un incident que ce dépôt ne pouvait pas voir venir en
local.**

## Ce qui s'est passé

Le lot 16b a **séparé en deux** le contrôle « compte des pages, et n'en double pas le nombre sur une
feuille double ». L'épingle `tesseract-absent-aucune-page-lue` nommait l'ancien nom. Je ne l'ai pas
mise à jour.

Le contrôle complet local a été **accepté**, et la poussée autorisée. Puis la course
**42823695147** :

| travail | verdict |
|---|---|
| `Rendu (Chromium, Firefox, WebKit)` | success |
| `Vérification (macos-latest)` | success |
| **`Vérification (ubuntu-latest)`** | **failure** |

```
3148 contrôle(s) lu(s) · 3 rouge(s) · 117 sauté(s) · 2 épingle(s) dans la liste
RÉGRESSION — test/aucune-page-lue.test.ts · … compte des pages, une par feuille, et n'en invente aucune
RÉGRESSION — test/aucune-page-lue.test.ts · … n'en double pas le nombre sur une feuille double
```

Ce ne sont pas deux régressions : ce sont les **deux moitiés du contrôle séparé**, rouges faute de
Tesseract sur Ubuntu, et que l'épingle ne reconnaissait plus.

## Pourquoi le contrôle local ne pouvait pas le voir

Sur la machine de Christophe, **Tesseract est présent**. Les deux moitiés y **passent**, et
l'épingle est rangée « hors contexte » — ni tenue, ni périmée, et surtout pas regardée. Le
renommage était donc **invisible ici**, et visible seulement là où l'outil manque.

C'est la forme la plus coûteuse d'un défaut : celle qu'un contrôle vert ne peut pas attraper.

## Le garde-fou

Une épingle qui nomme un contrôle qu'**aucun rapport ne porte** refuse le passage, et nomme
l'épingle et le nom perdu :

```
ÉPINGLE SANS CONTRÔLE — « tesseract-absent-aucune-page-lue » nomme « … compte des pages, et
n'en double pas le nombre sur une feuille double », qu'aucun rapport ne porte.
    Le contrôle a été renommé, déplacé ou retiré : mettez l'épingle d'accord, sinon elle ne
    protège plus rien.
```

Trois choix de conception, et chacun vient de l'incident :

1. **Toutes les épingles sont interrogées, hors contexte comprises.** C'est précisément là que le
   renommage se cachait. Une épingle qui ne vaut pas ici nomme quand même des contrôles qui doivent
   exister.
2. **Un contrôle sauté ne tombe pas.** Il figure au rapport sous son nom. Sans cette distinction,
   le garde-fou crierait au feu sur les **117** contrôles sautés d'Ubuntu.
3. **Le fichier compte autant que le nom.** Deux fichiers peuvent nommer leur contrôle pareil ;
   comparer le seul nom laisserait passer un déplacement.

## Éprouvé, et d'abord sur l'incident lui-même

**La preuve qui compte** : l'état d'avant remis — l'épingle nommant l'ancien contrôle —, le juge
relancé sur les rapports de cette machine, **avec l'épingle hors contexte**. Il refuse, et il
nomme. Il aurait donc arrêté la poussée.

**Quatre mutations**, toutes rattrapées :

| faute posée | contrôle qui refuse |
|---|---|
| accepter malgré un nom inconnu | « refuse le passage, et nomme l'épingle et le nom perdu » |
| n'interroger que les épingles en contexte | « le voit même quand l'épingle est hors contexte » |
| comparer le nom sans le fichier | « exige le bon fichier, et non le seul nom » |
| accuser un contrôle simplement sauté | « ne dit rien d'un contrôle SAUTÉ » |

## Ce que l'incident a révélé d'autre, et que je n'ai pas affaibli

Cinq épreuves de `packages/banc/test/epingles.test.ts` passaient des rapports **partiels** : une
épingle nommant deux contrôles, un seul fourni. La production ne fait jamais cela — un rapport porte
**tous** les contrôles d'un fichier. Le garde-fou a rendu cette infidélité visible.

Elles fournissent désormais le voisin **sauté**, ce qui ne change aucune de leurs mesures : un
contrôle sauté n'est ni rouge ni vert. L'alternative aurait été de relâcher le garde-fou pour
qu'il tolère un rapport partiel — c'est-à-dire de désarmer le neuf pour garder la commodité des
anciens.

Et **mon propre contrôle neuf était faux** à son premier jet : j'y faisais *passer* un contrôle
épinglé pour prouver qu'une épingle complète est acceptée. Un contrôle épinglé qui passe rend
l'épingle **périmée**, et le passage est refusé pour cette autre raison. Corrigé : il échoue, et
pour la cause épinglée — le seul état où une épingle est tenue.

## La leçon, et elle est à moi

Renommer un contrôle est un geste qui **traverse une frontière** : son nom est une donnée, lue par
`fixtures/references/echecs-connus.json`. Je l'ai traité comme un geste local. Le dépôt a maintenant
une mécanique à la place de mon attention — c'est la règle du § 4.6, et elle vaut ici comme
ailleurs.
