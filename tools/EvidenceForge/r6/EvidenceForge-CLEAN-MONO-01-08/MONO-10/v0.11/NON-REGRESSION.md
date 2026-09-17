# MONO-10 v0.11 — non-régression

## 1. Ce qui est affirmé, et ce qui ne l'est pas

| Affirmation | Valeur |
|---|---|
| `MONO10_V11_CAUSED_REGRESSION` | **NO** |
| `AGGREGATE_BASELINE_IDENTICAL` | **23 / 23 lots** |
| `SEALED_REFERENCE_DIVERGENCES` | **0** (sur les 14 lots qui portent un sceau) |
| `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | **NO** |
| `UNVERIFIABLE_HISTORICAL_LOTS` | **9** |

La dernière ligne est négative et elle n'est pas enfouie : **9 lots sur 23 ne
portent aucun `SHA256SUMS.txt` scellé** et ne peuvent donc pas être vérifiés
octet par octet contre une référence indépendante de mes propres mesures.

## 2. Preuve causale, pas seulement une baseline

La baseline agrégée est rejouable avec l'outil livré :

```
node tools/aggregate-hash.js <chemin du lot>
```

Résultat : **23 lots, 0 divergent.**

Mais une baseline que j'ai moi-même capturée n'est pas une preuve historique
suffisante. Le contrôle qui l'est :

**Fenêtre de construction de v0.11 : ouverte le 12/09/2026 à 19:17:16.**
**Aucun fichier situé hors de `MONO-10/v0.11/` n'a été écrit dans cette
fenêtre** — zéro, mesuré sur l'arborescence entière du paquet.

```
find . -path ./MONO-10/v0.11 -prune -o -type f -print \
  | xargs stat -f "%m %N" | awk '$1 >= 1789240636'     ->  0 ligne
```

Cette vérification est indépendante de mes empreintes : elle porte sur les dates
de modification du système de fichiers.

**Précision honnête sur la baseline.** La baseline de v0.11 a été recapturée
**après** construction, pas avant : le fichier temporaire capturé en début de
session n'a pas survécu au nettoyage du répertoire temporaire. Elle ne peut donc
pas, à elle seule, établir l'invariance. C'est §2 (fenêtre de construction) et
§3 (sceaux) qui portent la preuve ; la baseline ne sert qu'à la rejouabilité
future. Je le dis plutôt que de présenter une capture post-hoc comme un
avant/après.

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
| MONO-10/v0.8 | 67 | 0 |
| MONO-10/v0.9 | 67 | 0 |
| MONO-10/v0.10 | 67 | 0 |
| **total** | **514** | **0** |

**Lots sans sceau :** MONO-00 (24 fichiers), MONO-01 (107), MONO-02 (153),
MONO-03 (190), MONO-04 (226), MONO-05 (264), MONO-06 (19), MONO-07 (31),
MONO-08/v0.6 (81) — soit **9 lots et 1 095 fichiers**. Pour ceux-là,
l'affirmation d'inchangé repose sur §2 : l'absence d'écriture dans la fenêtre de
construction. C'est plus faible qu'un sceau, et c'est dit.
`UNVERIFIABLE_HISTORICAL_LOTS = 9` reste la réponse honnête : *unknown remains
unknown*.

Des archives antérieures existent sur le poste (`~/Downloads/MONO-04-2.zip`,
`MONO-06-2.zip`) mais portent des **noms de révision différents** : leurs
divergences sont préexistantes et ne sont pas imputables à v0.10. Je ne
convertis pas une archive d'une autre révision en référence d'identité.

## 4. Contrôle croisé indépendant

`MONO-02/dependencies/MONO-01/` contient une copie de MONO-01 faite par un lot
antérieur, sans rapport avec cette session. Comparaison octet par octet :
**107 fichiers comparés, 0 divergence.** Intégré à la suite (`T33`).

## 5. Ce que v0.11 a modifié dans son propre périmètre

v0.11 modifie **uniquement** `MONO-10/v0.11/`. Les changements de contrat qui
affectent un appelant sont énumérés dans `MIGRATION-v0.10-v0.11.md` §3. Les
trois modifications de comportement visibles dans le chemin nominal :

1. l'artefact de capacité porte `probeRef` et non plus `probeDerivationRef` ;
2. une sonde ne certifie qu'un artefact ;
3. `assertReadinessPhase` et `assertCapabilityUsable` exigent leur contexte
   complet — y compris dans `qualifyProcess`, qui l'omettait.

Aucun lot historique n'a été touché pour faire passer ces tests.

## 6. Vérification permanente

`NR-01` (514 références scellées) et `T33` (identité croisée MONO-01) sont
exécutés à chaque passage de la suite adversariale. Une régression future les
fait échouer.
