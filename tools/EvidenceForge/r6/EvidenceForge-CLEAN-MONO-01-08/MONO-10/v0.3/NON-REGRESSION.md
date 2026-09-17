# MONO-10 v0.3 — Non-régression

## 1. Règle

> **Les lots gelés ne sont jamais réécrits, et leur statut historique n'est
> jamais réinterprété.**

MONO-01 → MONO-08 sont **GELÉS**. MONO-09 v0.1 et v0.2, MONO-10 v0.1 et v0.2 sont
**HISTORIQUES**. La v0.3 est un lot **successeur** : elle n'a modifié aucun
fichier d'aucun de ces lots.

MONO-10 v0.2 a été déclaré `NON_GELABLE` par l'audit A. Ce jugement **reste**
celui qui a été porté à l'époque, sur ce lot-là. La v0.3 ne le réhabilite pas et
ne le réécrit pas : elle lui succède.

## 2. Preuves d'intégrité — indépendantes de tout script d'agrégation

La preuve principale ne dépend d'aucun outil ad hoc : **chaque lot vérifie contre
son propre `SHA256SUMS.txt`**, produit au moment de son gel.

```
$ cd <lot> && shasum -a 256 -c SHA256SUMS.txt
```

| Lot | Fichiers vérifiés | Divergents |
|---|---|---|
| MONO-08/v0.8 | 11 | **0** |
| MONO-09/v0.1 | 8 | **0** |
| MONO-09/v0.2 | 9 | **0** |
| MONO-10/v0.1 | 16 | **0** |
| MONO-10/v0.2 | 25 | **0** |

Contrôle croisé supplémentaire, exécuté par la suite de tests (`NR-01`) :
MONO-01 est **octet pour octet identique** à la copie imbriquée
`MONO-02/dependencies/MONO-01` (`dependencies`, `ports`, `lib`).

`NR-02` rejoue les quatre `SHA256SUMS.txt` des lots successeurs à chaque
exécution de la suite.

## 3. Baseline agrégée publiée

Une empreinte agrégée par lot, **indépendante du chemin absolu** — `shasum` seul
ne convient pas, car il inclut le chemin tel qu'il est écrit, et une même
arborescence lue depuis deux endroits produirait deux empreintes différentes.

L'outil qui la produit est **livré dans ce lot**, `tools/aggregate-hash.js`, afin
que cette baseline reste rejouable :

```
$ node MONO-10/v0.3/tools/aggregate-hash.js MONO-01 MONO-02 …
```

| Lot | Empreinte agrégée | Fichiers |
|---|---|---|
| MONO-00 | `7b125649c537edf3489640003dc9cd057b3a2488030321c98d716107f458e96f` | 24 |
| MONO-01 | `5d72474ac99af796cb065e22b0df26c53310461ddf9d2da4578143fa1252d266` | 107 |
| MONO-02 | `e6748eb39ff21ba2088be9a75aa52b5d5d63552b558bfd10c410dac84d7e838c` | 153 |
| MONO-03 | `4d47fe30c7516d61d3df7e18600eebe4cc57884d538a024abd9442ff19a4e553` | 190 |
| MONO-04 | `e281c72f447ed7e9781dfc881fcdfbffac9e7151d76d506c6efffa2d608bb80b` | 226 |
| MONO-05 | `c20174d68f117b133004a083ab92c9bbddf135855d853b77ebfbef38478400ae` | 264 |
| MONO-06 | `9993f82bc411bd240c35f25144b2456e48fe6ac9cd61480f5a42cb65654461ca` | 19 |
| MONO-07 | `30e8bc0579ce0393b557279b0b2668439afe3d0f43ad78ae7380ae5a74985ada` | 31 |
| MONO-08/v0.6 | `41c25c17445a9815be43a2dfddc694acbb774075c3746c595b583f6a58bfe162` | 81 |
| MONO-08/v0.7 | `c3b7ccd893c9ad64891886a2f6d381093f095d6aa9545de4d5a3503e48dd3357` | 9 |
| MONO-08/v0.8 | `e0b77853b12c9aaf191afac38b9ed4edd3690e938e9f4715d938df9abce20497` | 13 |
| MONO-09/v0.1 | `d2cb4836faa04d46e168fa2381b157e147d823216998e4c2da0960112af8e1fc` | 10 |
| MONO-09/v0.2 | `c0b525526987b14cc6664a70a0cb6645cb2396d2c3921ccac6b474bbf0406e33` | 11 |
| MONO-10/v0.1 | `eeecc33daf8bc96f9dd2b2c2627b24189bae438ec87f0dcea901d2fbd8c178a2` | 18 |
| MONO-10/v0.2 | `ba14db17e8c649126f10f41833860c22932e559a471142fbb374d743d4d83c8c` | 27 |

### Réserve honnête

La baseline capturée avant travaux, dans un répertoire temporaire, **n'est pas
rejouable** : le script d'agrégation qui l'avait produite y a été écrasé en cours
de session, et ses valeurs ne se reproduisent avec aucune variante de format
testée. Ce n'est **pas** un constat de modification — c'est un constat
d'irrejouabilité de ma propre mesure.

Je ne la présente donc pas comme une preuve. La preuve d'intégrité est celle du
§2, qui ne dépend d'aucun de mes scripts : les `SHA256SUMS.txt` scellés dans
chaque lot, tous à **0 divergent**. La baseline ci-dessus est publiée avec son
outil pour que ce défaut de méthode ne puisse pas se reproduire.

## 4. Ce que la v0.3 a ajouté, et rien d'autre

```
MONO-10/v0.3/
├── core/            15 modules
├── adapters/         2 modules + README
├── schemas/          1 fichier
├── test/             2 suites
├── tools/            1 outil
└── *.md              7 documents
```

Aucun fichier hors de `MONO-10/v0.3/` n'a été créé, modifié ou supprimé.

## 5. Comportements volontairement modifiés

Ces écarts par rapport à la v0.2 sont **intentionnels** ; ce sont les
corrections, et ils sont documentés dans `MIGRATION-v0.2-v0.3.md`.

| Situation | v0.2 | v0.3 | Raison |
|---|---|---|---|
| Deux identifiants sans autorité déclarée | `STRONG` | `MODERATE` | l'indépendance n'était pas démontrée |
| Nom affiché seul | `MODERATE` | `WEAK` | un nom n'est pas une identité résolue |
| Fixture réétiquetée `REAL_RUNTIME` | preuve de production | refusée | une déclaration n'est pas une preuve |
| Sonde sans attestation d'identifiant | `AVAILABLE` | `DEGRADED` | l'absence n'est pas la conformité |
| Qualification fabriquée | `AUTHORIZED` | `NOT_AUTHORIZED` | l'ultime porte ne croit pas ce qu'elle contrôle |

Chacun de ces cinq écarts est prouvé dans les deux sens par une mutation
différentielle `MUT-D*`, qui exécute le lot v0.2 **tel quel**, en lecture seule.
