# MONO-10 v0.6 — non-régression

## 1. Ce qui est affirmé, et ce qui ne l'est pas

| Affirmation | Valeur |
|---|---|
| `HISTORICAL_LOTS_MODIFIED` | **0** |
| `AGGREGATE_BASELINE_IDENTICAL` | **18 / 18 lots** |
| `SEALED_REFERENCE_DIVERGENCES` | **0** (sur les 9 lots qui portent un sceau) |
| `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | **NO** |

La dernière ligne est la plus importante et elle est négative. Elle n'est pas
enfouie : **9 lots sur 18 ne portent aucun `SHA256SUMS.txt` scellé** et ne
peuvent donc pas être vérifiés octet par octet contre une référence
indépendante de mes propres mesures.

## 2. Méthode à trois niveaux

### 2.1 Empreinte agrégée, rejouable

`/tmp/baseline-pre-v06.txt` a été capturée **avant** tout travail v0.6. Elle est
rejouable avec l'outil livré dans le lot :

```
node tools/aggregate-hash.js <chemin du lot>
```

L'empreinte combine le **contenu** et le **chemin relatif au lot**, jamais le
chemin d'extraction absolu — c'est pourquoi elle survit à une extraction dans un
autre répertoire, contrairement à un `shasum` brut qui inclut le chemin écrit.

Résultat : **18 lots identiques, 0 divergent.**

| Lot | Fichiers | Empreinte agrégée |
|---|---|---|
| MONO-00 | 24 | `7b125649c537edf3489640003dc9cd057b3a2488030321c98d716107f458e96f` |
| MONO-01 | 107 | `5d72474ac99af796cb065e22b0df26c53310461ddf9d2da4578143fa1252d266` |
| MONO-02 | 153 | `e6748eb39ff21ba2088be9a75aa52b5d5d63552b558bfd10c410dac84d7e838c` |
| MONO-03 | 190 | `4d47fe30c7516d61d3df7e18600eebe4cc57884d538a024abd9442ff19a4e553` |
| MONO-04 | 226 | `e281c72f447ed7e9781dfc881fcdfbffac9e7151d76d506c6efffa2d608bb80b` |
| MONO-05 | 264 | `c20174d68f117b133004a083ab92c9bbddf135855d853b77ebfbef38478400ae` |
| MONO-06 | 19 | `9993f82bc411bd240c35f25144b2456e48fe6ac9cd61480f5a42cb65654461ca` |
| MONO-07 | 31 | `30e8bc0579ce0393b557279b0b2668439afe3d0f43ad78ae7380ae5a74985ada` |
| MONO-08/v0.6 | 81 | `41c25c17445a9815be43a2dfddc694acbb774075c3746c595b583f6a58bfe162` |
| MONO-08/v0.7 | 9 | `c3b7ccd893c9ad64891886a2f6d381093f095d6aa9545de4d5a3503e48dd3357` |
| MONO-08/v0.8 | 13 | `e0b77853b12c9aaf191afac38b9ed4edd3690e938e9f4715d938df9abce20497` |
| MONO-09/v0.1 | 10 | `d2cb4836faa04d46e168fa2381b157e147d823216998e4c2da0960112af8e1fc` |
| MONO-09/v0.2 | 11 | `c0b525526987b14cc6664a70a0cb6645cb2396d2c3921ccac6b474bbf0406e33` |
| MONO-10/v0.1 | 18 | `eeecc33daf8bc96f9dd2b2c2627b24189bae438ec87f0dcea901d2fbd8c178a2` |
| MONO-10/v0.2 | 27 | `ba14db17e8c649126f10f41833860c22932e559a471142fbb374d743d4d83c8c` |
| MONO-10/v0.3 | 32 | `2d215745d8d991f194022e226b8cfac120aa02c9fddc83fc3daab995dc8037ea` |
| MONO-10/v0.4 | 42 | `94c49a32499d97bf20c5482fdd6b342af8754a016eb5c6ffa0a4c96bb26082ef` |
| MONO-10/v0.5 | 49 | `30661d5d60c006feb8685bb419ab1ac15c7b9281cecf4cf876ca8ca38bb37b52` |

### 2.2 Références scellées, indépendantes de mes outils

Un `SHA256SUMS.txt` présent **dans** un lot a été scellé lorsque ce lot a été
produit : il ne dépend d'aucun script de cette session. Chaque référence a été
revérifiée fichier par fichier.

| Lots avec sceau | Références | Divergences |
|---|---|---|
| MONO-08/v0.7 | 7 | 0 |
| MONO-08/v0.8 | 11 | 0 |
| MONO-09/v0.1 | 8 | 0 |
| MONO-09/v0.2 | 9 | 0 |
| MONO-10/v0.1 | 16 | 0 |
| MONO-10/v0.2 | 25 | 0 |
| MONO-10/v0.3 | 30 | 0 |
| MONO-10/v0.4 | 40 | 0 |
| MONO-10/v0.5 | 47 | 0 |
| **total** | **193** | **0** |

**Lots sans sceau, donc non vérifiables de cette manière :** MONO-00, MONO-01,
MONO-02, MONO-03, MONO-04, MONO-05, MONO-06, MONO-07, MONO-08/v0.6 — soit
**9 lots et 1 095 fichiers**. Pour ceux-là, l'affirmation d'inchangé repose
uniquement sur §2.1, c'est-à-dire sur une référence que j'ai moi-même capturée.
C'est plus faible, et c'est dit.

### 2.3 Contrôle croisé indépendant

`MONO-02/dependencies/MONO-01/` contient une copie de MONO-01 faite par un lot
antérieur, sans rapport avec cette session. La comparaison octet par octet des
deux arborescences est un contrôle qui ne dépend ni de ma baseline ni de mes
outils.

Résultat : **0 divergence.** Il est intégré à la suite adversariale (`NR-02`).

## 3. Ce que v0.6 ajoute, sans rien retirer

v0.6 est **additif**. Aucun fichier des lots MONO-00…MONO-09 ni des
MONO-10 v0.1…v0.5 n'a été lu en écriture. Les reproductions du §2 de la matrice
de remédiation ont été exécutées **en lecture seule sur v0.5**, en chargeant ses
modules depuis leur emplacement d'origine.

## 4. Vérification permanente

Les contrôles `NR-01` (références scellées) et `NR-02` (identité croisée
MONO-01) sont exécutés à chaque passage de la suite adversariale. Ils ne sont pas
un rapport ponctuel : une régression future les fait échouer.
