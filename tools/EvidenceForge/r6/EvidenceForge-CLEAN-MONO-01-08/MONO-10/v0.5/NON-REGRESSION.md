# MONO-10 v0.5 — Non-régression

## 1. Règle

> **Les lots gelés ne sont jamais réécrits, et leur statut historique n'est
> jamais réinterprété.** (Charte §20, §21)

MONO-01 → MONO-09 sont **GELÉS**. MONO-10 v0.1 à v0.4 sont **HISTORIQUES, immuables et `NON_GELABLE`**.
v0.5 est un lot **successeur**.

MONO-10 v0.4 a été déclaré `NON_GELABLE` par les audits indépendants Claude et
Codex, qui convergeaient : la cryptographie fonctionnait, mais la racine de
confiance restait choisie par l'appelant. Ce jugement **reste** celui qui a été
porté. v0.5 ne le réhabilite pas : elle lui succède.

## 2. Preuve d'intégrité — indépendante de tout script

Chaque lot vérifie contre son propre `SHA256SUMS.txt`, scellé à son gel :

| Lot | Fichiers vérifiés | Divergents |
|---|---|---|
| MONO-08/v0.7 | 7 | **0** |
| MONO-10/v0.4 | 40 | **0** |
| MONO-08/v0.8 | 11 | **0** |
| MONO-09/v0.1 | 8 | **0** |
| MONO-09/v0.2 | 9 | **0** |
| MONO-10/v0.1 | 16 | **0** |
| MONO-10/v0.2 | 25 | **0** |
| MONO-10/v0.3 | 30 | **0** |

Contrôle croisé (`NR-03`) : MONO-01 est **octet pour octet identique** à la
copie imbriquée `MONO-02/dependencies/MONO-01`.

## 3. Baseline agrégée — cette fois rejouable

L'audit A de v0.3 avait relevé que la baseline pré-travaux n'était pas rejouable,
son script d'agrégation ayant été écrasé. `tools/aggregate-hash.js` est livré
**dans ce lot** depuis v0.3 ; la baseline ci-dessous a été capturée avant tout
travail v0.4 et revérifiée après, avec le même outil livré :

```
$ node MONO-10/v0.4/tools/aggregate-hash.js MONO-00 MONO-01 … MONO-10/v0.3
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
| MONO-10/v0.3 | `2d215745d8d991f194022e226b8cfac120aa02c9fddc83fc3daab995dc8037ea` | 32 |
| MONO-10/v0.4 | `94c49a32499d97bf20c5482fdd6b342af8754a016eb5c6ffa0a4c96bb26082ef` | 42 |

**Comparaison avant / après travaux v0.5 : identique, 17 lots sur 17.**

## 4. Trois constats distincts — *unknown remains unknown*

| Constat | Valeur | Fondement |
|---|---|---|
| `MONO10_V05_CAUSED_REGRESSION` | **NO** | baseline agrégée identique avant/après ; 8 lots à 0 divergent contre leurs manifestes scellés ; aucun fichier créé ou modifié hors de `MONO-10/v0.5/` |
| `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | **NO** | seuls 8 lots sur 17 portent une référence autoritaire scellée |
| `UNVERIFIABLE_HISTORICAL_LOTS` | MONO-00, MONO-01 … MONO-07, MONO-08/v0.6 — **9 lots** | aucun `SHA256SUMS.txt` : leur identité byte-à-byte d'origine n'est pas vérifiable indépendamment |

La baseline agrégée atteste qu'ils n'ont **pas changé pendant ces travaux**.
Elle n'atteste pas qu'ils sont conformes à leur état de gel d'origine : cela
resterait inconnu, et le reste.

## 5. Périmètre des écritures

```
MONO-10/v0.5/
├── core/        22 modules
├── adapters/     2 modules + README
├── validators/   1 module
├── schemas/      1 fichier
├── tools/        2 outils
├── test/         3 fichiers
├── governance/   la charte
└── *.md          10 documents
```

Aucun fichier hors de `MONO-10/v0.4/` n'a été créé, modifié ou supprimé.

## 6. Écarts de comportement volontaires

Intentionnels : ce sont les corrections. Documentés dans `MIGRATION-v0.3-v0.4.md`.

| Situation | v0.3 | v0.4 | Raison |
|---|---|---|---|
| Chaîne synthétique complète | `AUTHORIZED` | `NOT_QUALIFIED` | une chaîne cohérente n'est pas une preuve de production |
| `revalidationRequired: false` | honoré | supprimé et consigné | un appelant ne désactive pas un contrôle critique |
| Deux libellés d'autorité | `STRONG` | `MODERATE` | l'indépendance n'était pas démontrée |
| Même identifiant, deux autorités | `indep = 2` | `indep = 1` | une source dupliquée n'est pas deux sources |
| `evidenceRefs` de décision réécrites | accepté | porte invalidée | l'humain a vu ces preuves-là |
| Inconnu fermé par référence inexistante | accepté | `UNKNOWN_EVIDENCE_UNRESOLVED` | *unknown remains unknown* |
| Dimensions fabriquées | promeuvent la phase | `READINESS_DIMENSIONS_UNSOURCED` | une dimension sans source ne promeut rien |
| Lignée inter-run | résolue | refusée par défaut | substitution inter-run |

Chacun est prouvé dans les deux sens par une mutation différentielle `M01`–`M24`
exécutant le lot v0.3 **tel quel**, en lecture seule.
