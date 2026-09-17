# MONO-10 — migration v0.18 → v0.19

MONO-10 v0.18 est **HISTORIQUE / IMMUTABLE**. v0.19 est un successeur
**strictement documentaire / test**, comme chacun des lots depuis v0.12.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée. Aucune réserve n'est fermée.** Un appelant de v0.11 à v0.18 n'a rien
> à modifier.

## 0. Pourquoi ce lot existe

L'audit final indépendant de v0.18 a rendu `NON_GELABLE`, **sans aucun bloqueur
runtime** : runtime byte-identique à v0.11–v0.17, la faute B2 de v0.16
réinjectée verbatim attrapée, l'ordre continuité → couplage → citation confirmé
par lecture du code, 32/32 formes de continuité **après** le token attrapées.
Cinq résidus, tous documentaires ou de test :

| # | Résidu |
|---|---|
| **B1** | continuité **avant** le token : 26/32. Le motif utilisait `\b`, qui en JavaScript ne précède jamais un caractère non ASCII — « à ce jour » ne matchait jamais — et omettait « depuis » |
| **B2** | `README.md` et `MIGRATION-v0.17-v0.18.md` promettaient les huit mots des deux côtés |
| **B3** | `README.md` citait une clé `fixLocation` inexistante dans le `MANIFEST` |
| **B4** | `MANIFEST.measurements.documentaryChecks` annonçait « 94 témoins », saisi ; le run en comptait 113 (+ 4 contrôles) |
| **B5** | `MANIFEST.documentHistoryNote` disait « v0.1..v0.16 », copié de v0.17 |

> `unknown remains unknown` — et **`known false must not remain stated as true`**.

## 1. B1 / B2 — `DOC-19` : continuité avant le token, frontières Unicode

Les deux motifs de continuité utilisent désormais des frontières Unicode —
`(?<![\p{L}])` avant le mot, `(?![\p{L}])` après — avec le drapeau `u`, et
portent tous deux les huit mots : depuis, encore, toujours, à ce jour,
aujourd'hui, reste, demeure, désormais. L'ordre des contrôles est inchangé :
continuité adjacente → couplage version du cadre / version du token →
citation adjacente (sans « à l'époque ») → sinon `FAIL`.

Témoins, sur `MIGRATION-v0.14-v0.15.md` (document réel), une ligne à la fois :

| Forme | Contexte | Nombre | Verdict |
|---|---|---|---|
| mot **avant** le token de v0.15 | A — cadre couplé « À l'époque de v0.15, … » | 8 | `FAIL` |
| mot **avant** le token de v0.15 | B — citation explicite « Comme v0.16 l'annonçait, … » | 8 | `FAIL` |
| mot **après** le token de v0.15 | A — cadre couplé | 8 | `FAIL` |
| mot **après** le token de v0.15 | B — citation explicite | 8 | `FAIL` |

Le cadre ou la citation est légitime ; c'est la continuité adjacente qui
condamne la phrase, et elle est évaluée avant eux. Contrôles, qui ne doivent
**pas** mordre : « À l'époque de v0.14 : NOT_FIXED_IN_V014 » ; « À l'époque de
v0.15 : NOT_FIXED_IN_V015 » ; « Dans le cadre v0.14 : NOT_FIXED_IN_V014 » ;
« Statut courant : NOT_FIXED_IN_V019 ». Les témoins de v0.18 (faute B2 de v0.16
verbatim, sept variantes) sont conservés.

Ce qui est testé est exactement ce qui est promis : les huit mots, adjacents,
avant ou après, sous cadre ou sous citation. La limite déjà dite en v0.18
demeure et est dite : une continuité **non adjacente** relève de l'étape 4.

## 2. B4 — grandeurs documentaires dérivées du run

Le test imprime, à la fin de la boucle des détecteurs, une ligne
`DOCUMENTARY_MEASUREMENTS = { … }` calculée par le harnais : nombre de
détecteurs, de témoins, de contrôles, de témoins exigeant les lots
(structure), et nombre de détecteurs ayant obtenu `PASS_CLEAN`,
`FAIL_SINGLE_TARGET_FAULT`, `PASS_AFTER_REVERT`, contrôles `PASS` (run). Le
constructeur la lit et l'écrit telle quelle dans
`MANIFEST.measurements.documentaryMeasurements` ; `documentaryChecks` est une
phrase composée à partir de ces valeurs. **Aucun nombre n'est saisi.** Comme
`knownFalseStatementsRemaining` et ces grandeurs dépendent du `MANIFEST` qui
les porte (`DOC-17`, `DOC-28`, `MEAS-01` le lisent), le constructeur itère —
run, réécriture du `MANIFEST` avec les valeurs mesurées, run — jusqu'au
**point fixe** où le run reproduit exactement ce que le `MANIFEST` déclare ;
le run final livré est ce point fixe.

`DOC-28` re-dérive les grandeurs de structure depuis les détecteurs eux-mêmes
et les compare au `MANIFEST`, et vérifie que les nombres annoncés en prose
(`README.md`, `NON-REGRESSION.md`, cette migration) égalent le nombre réel de
détecteurs ; `MEAS-01` compare les grandeurs de run à ce run. Témoins :
`witnessCount` −1, `passControlCount` +1, `detectorCount` = 26, « 26 / 26 »
dans `README.md` → `FAIL`.

## 3. B3 — clés du `MANIFEST` citées

`README.md` cite désormais `textFixLocation` et `detectorFixLocation`, les clés
qui existent. `DOC-29` : dans toute phrase mentionnant `MANIFEST` ou `where`,
tout identifiant en backticks doit exister comme clé (profonde) de
`MANIFEST.json`. Témoin : `textFixLocation` → `fixLocation` → `FAIL`.

## 4. B5 — plage de mesure de l'historique

Le constructeur écrit `MANIFEST.documentHistoryMeasuredRange = { from, to }`
(premier et dernier lot scellé joignable) et compose `documentHistoryNote`
avec cette plage. `DOC-27` exige que la note nomme la plage déclarée et, lots
joignables, que la plage déclarée soit celle des lots réellement présents.
Témoin : note ramenée à « v0.1..v0.16 » → `FAIL`.

## 5. `DOC-06` — localisation des divergences

Le tableau de `OPEN-FINDINGS.md` R4 (lot | nombre | fichiers) est comparé lot
par lot et fichier par fichier à `MANIFEST.sealInventory.divergences`,
lui-même comparé à la mesure (`SEAL-05`). Témoins : `MONO-07` → `MONO-06`
dans le tableau (le nom `MONO-07` restant dans la prose) → `FAIL` ;
`package.json` → `index.js` → `FAIL`. **Limite documentée, `NON_BLOCKING`** :
la prose de R4 hors tableau (dates, attribution) reste contrôlée par présence
de négation et de mots, pas par comparaison structurelle.

## 6. `DOC-25` — non-régression

Inchangé et re-vérifié : `executionMode` retiré de R1 → `FAIL` ; `artifactHash`
retiré de `REQUIRED` → `FAIL` ; `ghostDimension` ajoutée → `FAIL` ; permutation
seule → contrôle `PASS`.

## 7. Règle des témoins causaux

Inchangée : `PASS_CLEAN`, `FAIL_SINGLE_TARGET_FAULT` (une faute, un document,
un seul fichier changé), `PASS_AFTER_REVERT`, sur le document réel, en mémoire,
sans écriture, plus des contrôles `PASS` explicites. Vingt-huit détecteurs
(DOC-01 à DOC-25, DOC-27 à DOC-29) ; les nombres de témoins et de contrôles
sont dans `MANIFEST.measurements.documentaryMeasurements`, dérivés du run.

## 8. Ce qui n'a PAS changé — et comment le vérifier

`core/`, `adapters/`, `validators/`, `schemas/`, `contracts/`, la **Charte**, les
trois fichiers de test hérités de v0.11 et les trois outils de v0.11 sont
**identiques octet pour octet** à v0.11 … v0.18. `tools/seal-inventory.js` est
identique à v0.12 et à tous les lots depuis. La commande et son résultat
attendu sont dans `NON-REGRESSION.md` §1, rejoués par `DOC-13`.

Delta v0.18 → v0.19, classé :

| Classe | Fichiers |
|---|---|
| `DOCUMENTATION` | `README.md`, `governance/README.md`, `OPEN-FINDINGS.md`, `THREAT-MODEL.md`, `AUDIT-REMEDIATION-MATRIX.md`, `LLM-CAPABILITY-BOUNDARY.md`, `TRUST-MODEL.md`, `ARTIFACT-REGISTRY-TRUST.md`, `READINESS.md`, `CAPABILITY-AUTHORITIES.md`, `REPLAY-PROTECTION.md` (H1), `MIGRATION-v0.17-v0.18.md` (claim invalidée, annotée), `MIGRATION-v0.18-v0.19.md` (nouveau), `AUDIT-VERDICTS.v0.12-v0.19.md` (renommé depuis `AUDIT-VERDICTS.v0.12-v0.18.md`, ligne v0.18 ajoutée) |
| `NON_REGRESSION` | `NON-REGRESSION.md` |
| `MANIFEST` | `MANIFEST.json`, `SHA256SUMS.txt` |
| `DOCUMENTARY_TEST` | `test/test-mono10-v0.19-documentary.js` (remplace `test/test-mono10-v0.18-documentary.js`) |
| `READ_ONLY_AUDIT_TOOL` | aucun ajout ; `tools/seal-inventory.js` inchangé |
| `RUNTIME` / `TEST_RUNTIME` / `OTHER` | **0** |

## 9. Ce que v0.19 ne fait pas

- il ne ferme **aucune** des cinq réserves R1 à R5 (à l'époque de v0.19 : `NOT_FIXED_IN_V019` ; le statut courant est dans `OPEN-FINDINGS.md`) ;
- il ne corrige pas les neuf divergences de `MONO-07` et `MONO-08/v0.6` ;
- il n'ajoute aucune sécurité, ne touche à aucune API, n'implémente pas P0.2 ;
- il ne réécrit aucun lot historique, v0.18 compris ;
- il ne lance aucun run réel : `NETWORK_CALLS = 0`, `REAL_LLM_CALLS = 0`,
  `REAL_EF02_RUNS = 0`, `REAL_PROFESSIONAL_RUNS = 0`, `REAL_HUMAN_ACTS = 0` ;
- il ne déclare pas v0.19 gelé — ce statut appartient au propriétaire
  (CHARTE §19).
