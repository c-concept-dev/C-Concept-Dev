# MONO-10 — migration v0.14 → v0.15

MONO-10 v0.14 est **HISTORIQUE / IMMUTABLE**. v0.15 est un successeur
**strictement documentaire**, comme v0.14 l'était de v0.13, v0.13 de v0.12 et
v0.12 de v0.11.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée. Aucune réserve n'est fermée.** Un appelant de v0.11 à v0.14 n'a rien
> à modifier.

## 0. Pourquoi ce lot existe

L'audit final indépendant de v0.14 a rendu `NON_GELABLE`, **sans aucun bloqueur
runtime** et sans aucun risque de sécurité nouveau : runtime byte-identique à
v0.11, v0.12 et v0.13 ; 19 détecteurs sur 19 causaux ; toutes les commandes
imprimées reproduites. Restaient **deux résidus documentaires** (B1, B2) et des
**lacunes de détecteurs**. Ce lot ferme uniquement cela.

> `unknown remains unknown` — et **`known false must not remain stated as true`**.

## 1. B1 — `OPEN-FINDINGS.md` R4 : le cadre est nommé

| | |
|---|---|
| **Résidu** | R4 affirmait au présent « trouve **24 lots historiques scellés**, **1 577 références** », sans cadre. Dans l'arbre livré de v0.14, la même recherche donnait 27 / 1 787 (cadre v0.14). Le lot énonçait lui-même la règle (`NON-REGRESSION.md` §2) : citer « 24 lots » sans dire « cadre v0.11 » est une inexactitude — et la violait à un endroit que `DOC-05` ne regardait pas |
| **Correction** | R4 nomme désormais les deux cadres, séparément : **cadre historique v0.11** (24 / 1 577 / 9 / 0, celui où les divergences ont été trouvées) et **cadre courant v0.15** (28 / 1 860 / 9 / 0, mesuré après scellement). Les neuf divergences sont les mêmes dans tous les cadres |
| **Détecteur** | `DOC-05` refuse tout chiffre de cadre — 24…28 lots, 1 577…1 860 références — cité sans son cadre dans la même phrase ou cellule. Six témoins : phrase libre (le résidu B1 exact), ligne de tableau, puce, parenthèse, gras, chaîne JSON du `MANIFEST`. Il accepte « dans le cadre v0.11 : 24 / 1 577 », « historique v0.11 : … », et toute citation explicite d'une erreur corrigée |
| **Vérifié par** | `DOC-05`, `SEAL-01` à `SEAL-07`, `DOC-13` |

## 2. B2 — fenêtre de construction : dérivée, jamais saisie

| | |
|---|---|
| **Résidu** | `MANIFEST.v014BuildWindowOpened = 1789291393` était l'heure du premier `MANIFEST` de v0.14, saisie par le constructeur ; le mtime minimal du lot était `1789290199`. Aucune commande publiée ne reproduisait la valeur |
| **Méthode canonique** | `buildWindowOpened` = mtime UNIX **minimal** de tous les fichiers du lot, hors zip de livraison, **arrondi à la seconde paire supérieure** (granularité du format zip : l'arbre source et toute extraction donnent la même valeur). `NON-REGRESSION.md` §7 |
| **Dérivation** | le `MANIFEST` porte le mtime de chaque fichier (`files[].mtime`) ; `sealInventory.v015BuildWindowOpened` est calculé depuis ces mtimes par le constructeur, avant l'écriture finale du champ — il n'est saisi nulle part |
| **Commande publiée** | `find MONO-10/v0.15 -type f ! -name '*.zip' -exec stat -f %m {} + \| sort -n \| head -1 \| awk '{print $1 + ($1 % 2)}'`, suivie de son `# attendu`, rejouée par `DOC-13` |
| **Détecteur** | `DOC-20` : re-dérive la valeur depuis `files[].mtime`, la re-mesure sur disque quand les dates y sont d'origine, exige que la méthode soit énoncée dans le `MANIFEST`. Témoins : la valeur décalée **d'une seconde** → `FAIL` ; la méthode remplacée par « valeur saisie » → `FAIL` ; revert → `PASS` |
| **Historique** | les fenêtres de v0.11 à v0.14 sont conservées telles que leurs lots les ont rapportées, et la valeur fautive de v0.14 est dite telle quelle (`NON-REGRESSION.md` §7) — un lot historique n'est pas réécrit |

## 3. Lacunes de détecteurs fermées

| Détecteur | Lacune relevée | Fermeture | Témoins |
|---|---|---|---|
| `DOC-03` | `se trouvent?` ne rendait optionnel que le « t » final : « se trouve attesté » n'était jamais reconnu ; verbes de présence absents | `se trouv(e\|ent)`, « figurent », « sont présents », « sont tous / toutes attestés », sujets « toutes les propriétés », « chaque attribut » | 15 variantes, chacune un témoin distinct — les huit de v0.14 plus « se trouvent », « se trouve », « sont présentes », « figure », « sont tous attestés », « toutes les propriétés », « chaque attribut » |
| `DOC-04` | masculin singulier seulement (« inscrit ») | flexions genre / nombre de *inscrit*, *enregistré*, *attesté*, *consigné* : `(e\|s\|es)` | 11 témoins de flexion, plus le test d'isolement de v0.14 |
| `DOC-09` | « au nombre de N », « il existe N réserves », « les N constats » non reconnus | reconnus, toujours restreints aux **constats ouverts** (une phrase parlant de nonces, de réserve anti-rejeu ou de réserve technique est ignorée) | « au nombre de **quatre** (R1 à R5) » ; « Il existe quatre réserves ouvertes » ; « Les quatre constats R1 à R5 » |
| `DOC-14` | aveugle à un déplacement de puces séparé par des lignes vides (forme correcte, place fausse) | **structure déclarée** : `MANIFEST.documentStructure` donne, pour `README.md`, `THREAT-MODEL.md`, `NON-REGRESSION.md` et `OPEN-FINDINGS.md`, le nombre d'items de liste attendu par section ; tout déplacement change les comptes | les six puces de §6 déplacées sous §7 **avec** lignes vides ; une hypothèse déplacée sous « Lecture » |
| `DOC-21` (nouveau) | `AUDIT-REMEDIATION-MATRIX.md` §4 « Mesures » portait des chiffres de v0.9 sous un heading non versionné | toute section « Mesures » d'un document couvrant plusieurs versions doit nommer sa version ; §4 devient « Mesures historiques v0.9 » | le heading redevient « Mesures » → `FAIL` |

Deux titres (`TRUST-MODEL.md`, `ARTIFACT-REGISTRY-TRUST.md`) disaient encore
« v0.12 » alors que le contenu avait été corrigé en v0.14 ; ils nomment
désormais le lot courant et la version d'origine du contenu. `OPEN-FINDINGS.md`
R4 précise que la fenêtre de v0.11 est donnée en UTC et la liste des fichiers en
heure locale.

## 4. Règle des témoins causaux

Inchangée depuis v0.14 : chaque détecteur est validé par `PASS_CLEAN`,
`FAIL_SINGLE_TARGET_FAULT` (une faute, un document, le harnais vérifie qu'un
seul fichier a changé) et `PASS_AFTER_REVERT`, sur le document réel, en
mémoire, sans écriture. Vingt-et-un détecteurs, `DOCUMENTARY_CHECKS_CAUGHT =
DOCUMENTARY_CHECKS_TOTAL`.

## 5. Ce qui n'a PAS changé — et comment le vérifier

`core/`, `adapters/`, `validators/`, `schemas/`, `contracts/`, la **Charte**, les
trois fichiers de test hérités de v0.11 et les trois outils de v0.11 sont
**identiques octet pour octet** à v0.11, v0.12, v0.13 **et** v0.14.
`tools/seal-inventory.js` est identique à v0.12, v0.13 et v0.14. La commande et
son résultat attendu sont dans `NON-REGRESSION.md` §1, rejoués par `DOC-13`.

Delta v0.14 → v0.15, classé :

| Classe | Fichiers |
|---|---|
| `DOCUMENTATION` | `README.md`, `governance/README.md`, `OPEN-FINDINGS.md`, `THREAT-MODEL.md`, `TRUST-MODEL.md`, `ARTIFACT-REGISTRY-TRUST.md`, `AUDIT-REMEDIATION-MATRIX.md`, `MIGRATION-v0.11-v0.12.md` (un cadre nommé), `MIGRATION-v0.13-v0.14.md` (un statut daté), `MIGRATION-v0.14-v0.15.md` (nouveau) |
| `NON_REGRESSION` | `NON-REGRESSION.md` |
| `MANIFEST` | `MANIFEST.json`, `SHA256SUMS.txt` |
| `DOCUMENTARY_TEST` | `test/test-mono10-v0.15-documentary.js` (remplace `test/test-mono10-v0.14-documentary.js`) |
| `READ_ONLY_AUDIT_TOOL` | aucun ajout ; `tools/seal-inventory.js` inchangé |
| `RUNTIME` / `TEST_RUNTIME` / `OTHER` | **0** |

## 6. Ce que v0.15 ne fait pas

- il ne ferme **aucune** des cinq réserves R1 à R5 (`NOT_FIXED_IN_V015`) ;
- il ne corrige pas les neuf divergences de `MONO-07` et `MONO-08/v0.6` ;
- il n'ajoute aucune sécurité, ne touche à aucune API, n'implémente pas P0.2 ;
- il ne réécrit aucun lot historique, v0.14 compris ;
- il ne lance aucun run réel : `NETWORK_CALLS = 0`, `REAL_LLM_CALLS = 0`,
  `REAL_EF02_RUNS = 0`, `REAL_PROFESSIONAL_RUNS = 0`, `REAL_HUMAN_ACTS = 0` ;
- il ne déclare pas v0.15 gelé — ce statut appartient au propriétaire
  (CHARTE §19).
