# Pourquoi une page vide coûte 240 ms, et ce qu'on en a fait — lot 16b

**Ordonné par Christophe le 10 novembre 2026**, aussitôt la barre de marge proposée :

> « Barre : reste `null` pour l'instant. D'abord le lot 16b (2,5 s pour lire deux fois un PDF de
> cinq pages vides) : **comprendre et réduire, sans toucher au délai.** »

## Ce qui coûte, mesuré

Le corps du contrôle le plus serré du dépôt — ×1,03 sur le coureur macOS — faisait **deux**
lectures d'un PDF de cinq pages vides.

| ce qui a été lu | corps |
|---|---|
| 1re lecture (à froid) | 1 800 ms |
| 2e, 3e, 4e, 5e lectures | 1 216, 1 210, 1 198, 1 206 ms |
| un document d'**une** page vide | 240 ms |
| un document de **vingt** pages vides | 4 909 ms |

Le coût est **linéaire : 245 ms par page vide**, et le démarrage ne pèse qu'une fois (~600 ms sur
la première lecture d'un processus). Ce n'est donc pas un démarrage payé deux fois, comme je l'avais
supposé en nommant le lot : c'est **la page elle-même**.

## Pourquoi, et c'est voulu

Une page **sans image** dont la couche de texte est insuffisante n'est **pas tenue pour vide**.
`outils/ingestion/src/texte.ts:310` la rend entière par pdf.js, à 1 800 pixels, et la donne à la
reconnaissance.

**Prouvé par l'exécution**, et non par une lecture du code : un faux `tesseract` placé en tête du
`PATH` journalise son appel puis délègue au vrai. Pour cinq pages vides, il journalise **cinq
appels** :

```
APPEL …/lienotheque-texte-5UtPpe/page-1.pgm stdout -l eng --psm 3 -c tessedit_create_tsv=1
APPEL …/lienotheque-texte-5UtPpe/page-2.pgm stdout -l eng --psm 3 -c tessedit_create_tsv=1
…
```

La raison est écrite là où la décision se prend, et elle tient : « les objets compressés de treize
PDF réels échappent au lecteur structurel, alors que pdf.js rend parfaitement leur page. Une couche
pauvre déclenche donc le rendu complet. » **Tenir ces pages pour vides les perdrait.** Le produit a
raison, et on ne touche pas à cette décision.

## Ce qui a été réduit, et ce qui ne l'a pas été

Deux gestes, aucun sur le produit, aucun sur un délai.

**1. Le contrôle portait deux affirmations indépendantes, et payait leurs deux lectures contre un
seul délai.** L'une porte sur la lecture ordinaire, l'autre sur la feuille double ; chacune demande
sa propre lecture du document. Séparées en deux contrôles, chacune a son délai. **Rien n'est
affaibli** : les mêmes assertions, le même document, le même travail réel. Ce qui change est qu'un
délai borne désormais **une** lecture.

> Ce qu'il ne faut **pas** faire, et que j'ai écarté : déplacer les deux lectures dans un
> `beforeAll` partagé. Le corps paraîtrait instantané et la marge superbe — mais le travail serait
> seulement passé sous un autre délai, le `hookTimeout`, que le garde-fou ne regarde pas. Ce serait
> truquer la mesure, pas raccourcir le corps.

**2. La fixture comptait cinq feuilles là où trois prouvent la même chose.** « Trois, pas six »
distingue une feuille d'une page exactement comme « cinq, pas dix » : le nombre ne portait aucun
sens. Il portait un prix — 245 ms par page.

## Ce que cela donne

| | avant | après |
|---|---|---|
| machine de Christophe | **×2,01** (2 493 ms / 5 000) | **×5,97** et **×6,85** (838 et 730 ms) |
| coureur macOS, mesuré | **×1,03** (4 842 ms / 5 000) | *à mesurer* |
| coureur macOS, projection au facteur ×1,94 | — | ×3,08 et ×3,53 |

La projection n'est pas une mesure, et elle est nommée comme telle : c'est la course suivante qui
tranchera. Mais la marge la plus courte du dépôt n'est plus celle-ci.

## Et la question que Christophe a posée ensuite : peut-on reconnaître une page vide avant la reconnaissance ?

> « Regarde la cause dans le produit : pourquoi Tesseract est-il lancé sur une page entièrement
> blanche ? Si la chaîne peut reconnaître une page vide AVANT la reconnaissance (formes sombres
> déjà détectées, rien de calibré), elle gagnera du temps sur les vrais livres (pages de garde,
> versos). La page est alors marquée « vide », jamais « non lue ». Propose avant d'appliquer si
> cela touche la chaîne. »

**Où vont les 245 ms**, mesuré phase par phase :

| | par page |
|---|---|
| rendu pdf.js à 1 800 px | 17 ms |
| passage en gris | 15 ms |
| `boiteSombre` (`outils/images/src/pixels.ts:50`, déjà là, déjà éprouvé, rien à calibrer) | **7 ms** |
| **la reconnaissance elle-même** | **~213 ms** |

Tesseract porte **87 %** du coût. Détecter la page vide avant lui coûterait 7 ms et en sauverait
213 : trente contre un.

**Mais sur les vrais livres, le gain mesuré est nul.** 96 pages de 20 documents de la bibliothèque
musicale, rendues en mémoire — premières, dernières et voisines, là où vivent gardes et versos ;
rien n'a été écrit ni copié, les œuvres n'ont pas quitté le volume.

- **zéro** page entièrement blanche sur 96 ;
- part de pixels sombres la plus faible : **1,1 %** ; la plupart entre 2 et 12 % ; les couvertures
  jusqu'à 92 % ;
- ce sont des **numérisations** : même un verso porte le cadre sombre du scanner.

Aucune page n'approche « presque rien ». L'hypothèse du gain sur les gardes et les versos n'est
donc pas soutenue — avec la limite qu'il faut nommer : 96 pages, une seule bibliothèque, et celle
de Studio Clinique peut porter des PDF natifs où de vraies pages blanches existent.

**Ce qui change tout, c'est l'endroit.** Placé avant toute reconnaissance, le test serait 7 ms
× 10 418 pages de pure perte sur la bibliothèque musicale. Placé sur la seule branche **sans
image** — celle de `texte.ts:310` —, les numérisations n'y passent jamais, et les 7 ms ne tombent
que là où les 213 peuvent être gagnés.

**Décision de Christophe, le même jour : ni l'un ni l'autre maintenant.** Les deux partent à
l'**étape 2**, lots **3a** (distinguer « page vide » de « page non lue » : contrat
`SourceLecture`, journal, écran Vérifier) et **3b** (le test, sur la branche sans image
seulement, avec un contrôle exigé — une page au texte très pâle n'est **jamais** déclarée vide).

La partie qui vaut le plus n'est pas la vitesse : aujourd'hui « cette page est blanche » et « nous
n'avons pas su lire cette page » sont confondues dans un seul nombre, et le second doit alerter
quand le premier non.

## Éprouvé par mutation, et chaque moitié sur sa propre faute

Séparer un contrôle en deux n'a de valeur que si chaque moitié garde son pouvoir d'accusation.

| faute posée dans `texte.ts` | ce qui tombe | ce qui tient |
|---|---|---|
| `sansTexte += 2` sur une feuille double — **la faute historique** | « n'en double pas le nombre sur une feuille double » | « compte des pages, une par feuille » |
| une page sans texte perdue au lieu d'être gardée | « compte des pages, une par feuille » | — |

Chaque moitié tombe sur sa faute, et seulement sur la sienne.
