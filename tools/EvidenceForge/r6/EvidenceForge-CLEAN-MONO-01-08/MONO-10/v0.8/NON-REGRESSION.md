# MONO-10 v0.8 — non-régression

## 1. Ce qui est affirmé, et ce qui ne l'est pas

| Affirmation | Valeur |
|---|---|
| `MONO10_V08_CAUSED_REGRESSION` | **NO** |
| `AGGREGATE_BASELINE_IDENTICAL` | **20 / 20 lots** |
| `SEALED_REFERENCE_DIVERGENCES` | **0** (sur les 11 lots qui portent un sceau) |
| `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | **NO** |
| `UNVERIFIABLE_HISTORICAL_LOTS` | **9** |

La dernière ligne est négative et elle n'est pas enfouie : **9 lots sur 20 ne
portent aucun `SHA256SUMS.txt` scellé** et ne peuvent donc pas être vérifiés
octet par octet contre une référence indépendante de mes propres mesures.

## 2. Preuve causale, pas seulement une baseline

La baseline `/tmp/baseline-pre-v08.txt` a été capturée **avant** tout travail
v0.8 et est rejouable avec l'outil livré :

```
node tools/aggregate-hash.js <chemin du lot>
```

Résultat : **20 lots identiques, 0 divergent.**

Mais une baseline que j'ai moi-même capturée n'est pas une preuve historique
suffisante. Le contrôle qui l'est :

**Fenêtre de construction de v0.8 : 12/09 17:02:24 → 17:15:24.**
**Aucun fichier d'aucun lot historique n'a été écrit dans cette fenêtre** — zéro,
mesuré lot par lot. La dernière écriture dans MONO-10/v0.7 date de 16:28:45,
soit avant le début de v0.8 ; v0.7 reste conforme à ses 64 références scellées.

Cette vérification est indépendante de mes empreintes : elle porte sur les dates
de modification du système de fichiers.

## 3. Références scellées, indépendantes de mes outils

Un `SHA256SUMS.txt` présent **dans** un lot y a été scellé lors de sa
production ; il ne dépend d'aucun script de cette session.

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
| MONO-10/v0.6 | 56 | 0 |
| MONO-10/v0.7 | 64 | 0 |
| **total** | **313** | **0** |

**Lots sans sceau :** MONO-00, MONO-01, MONO-02, MONO-03, MONO-04, MONO-05,
MONO-06, MONO-07, MONO-08/v0.6 — soit **9 lots et 1 095 fichiers**. Pour
ceux-là, l'affirmation d'inchangé repose sur §2 : une baseline que j'ai
capturée, et l'absence d'écriture dans la fenêtre de construction. C'est plus
faible qu'un sceau, et c'est dit. `UNVERIFIABLE_HISTORICAL_LOTS = 9` reste la
réponse honnête : *unknown remains unknown*.

Des archives antérieures existent sur le poste (`~/Downloads/MONO-04-2.zip`,
`MONO-06-2.zip`, datées des 29–30 août) mais portent des **noms de révision
différents** : leurs divergences sont préexistantes et ne sont pas imputables à
v0.8. *Unknown remains unknown* — je ne convertis pas une archive d'une autre
révision en référence d'identité.

## 4. Contrôle croisé indépendant

`MONO-02/dependencies/MONO-01/` contient une copie de MONO-01 faite par un lot
antérieur, sans rapport avec cette session. Comparaison octet par octet :
**0 divergence**. Intégré à la suite (`NR-02`).

## 5. Vérification permanente

`NR-01` (313 références scellées) et `NR-02` (identité croisée MONO-01) sont
exécutés à chaque passage de la suite adversariale. Une régression future les
fait échouer.
