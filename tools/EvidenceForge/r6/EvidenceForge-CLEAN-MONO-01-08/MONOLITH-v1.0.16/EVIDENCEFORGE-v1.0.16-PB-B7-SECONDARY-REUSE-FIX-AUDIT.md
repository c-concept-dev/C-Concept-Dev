# EvidenceForge MONOLITH v1.0.16 — PB-B7 : correctif de la réutilisation secondaire

> Mandat : `CHANTIER CIBLÉ — MONOLITH v1.0.16 — PB-B7 SECONDARY REUSE GAP`. Date : 2026-09-23. **0 fournisseur, 0 USD.**

## Verdict proposé

| | |
|---|---|
| v1.0.16 | **`GELABLE`** (proposé, **non gelé**) |
| PB-B7 | **`PB_B7_CLOSED_CANDIDATE`** |
| `ACTIVE_VERSION` | `MONOLITH-v1.0.10`, inchangée |
| Suite | audit indépendant, puis décision de gel ; smoke réel avant toute activation |

Tests **345/345**, chunking 21/21, secret scan 0, anti-hardcoding 0, lots gelés intacts. Le test bloquant **PB7-04** est vert sur v1.0.16 et **rouge sur v1.0.15** : il reproduit bien le défaut. **Matrice de mutation : 12 mutants, 0 survivant.**

---

## 1. Base

- Source : `MONOLITH-v1.0.15` du bundle. `--verify` 169/169, `contentHash` `1e219650…`, identique à la copie d'audit PB-B7 (`diff -rq` vide).
- v1.0.16 est une copie, dans `r6/EvidenceForge-CLEAN-MONO-01-08/MONOLITH-v1.0.16/`.
- **v1.0.15 n'est pas modifiée** : aucun fichier suivi par git n'a changé.

## 2. Cause racine

Enchaînement du défaut :

1. EF-03B passe les gardes d'autorité ;
2. le **registre**, lié à `targetId` + `documentAuthoritySha256`, **refuse** l'entrée ;
3. l'exécution se replie sur `llm-reuse-store.jsonl`, dont la clé est `promptSha256` + contexte générique ;
4. le magasin **sert l'ancienne réponse** ;
5. MONO-11 la valide ;
6. `onValidation` l'**inscrit sous la nouvelle autorité**.

C'est le cas T3b de l'audit PB-B7.

## 3. Stratégie choisie : **A**, le magasin applique les mêmes contraintes que le registre

- **Cohérence.** Le registre est déjà un filtre d'identité. Le magasin reçoit le même filtre, à l'endroit où il a déjà son filtre de contexte (`lib/llm.js`, au-dessus de la politique gelée MONO-11, qui reste intacte).
- **Pourquoi pas B.** B (« tout refus du registre interdit le magasin ») refuserait aussi une entrée de magasin dont l'identité est **prouvée** identique. Il ne garantit rien de plus que A et couple deux modules sans nécessité.
- **Le refus du registre n'est plus contournable.** L'entrée que le registre refuse porte la même identité étrangère dans le magasin, qui la refuse donc pour la même raison (PB7-04, 09, 10).
- **Conséquence voulue, et documentée.** Une entrée de registre ancienne est refusée ; si le magasin contient une entrée v1.0.16 d'identité **identique**, elle est servie. Ce n'est pas un contournement : l'identité est prouvée.

## 4. Chemin de code et diff exact

Diffs complets : `evidence/DIFF-{lib,test,config,tools,README}-v1015-v1016.patch`.

### `lib/llm.js`

- **Nouvelle fonction pure exportée `checkEf03bReuseIdentity(entry, current)`.** Contrôles, dans l'ordre :
  1. entrée présente ;
  2. finalité EF-03B ;
  3. identité courante présente (cible + sha256 d'autorité) ;
  4. **entrée legacy** (sans `targetId` ou sans `documentAuthoritySha256`) → `NON_REUSABLE_FOR_EF03B_V3` ;
  5. cible ;
  6. autorité ;
  7. contrat ;
  8. **sceau obligatoire** ;
  9. sceau égal.
- **Décision de réutilisation.** Si l'appel **ou** l'entrée relève d'EF-03B, `checkEf03bReuseIdentity` est appliquée **avant** `reuseContextCheck` (fournisseur, modèle, contrat, sceau, hash du corps). Toute divergence produit `LLM_REUSE_REFUSED` avec son code, puis un appel réel. Hors EF-03B : **inchangé**.
- **`recordReal`.** Une entrée EF-03B est écrite avec `targetId`, `documentAuthoritySha256`, `twinId` et `reuseIdentity: "EF03B-v1.0.16"`. Les entrées non EF-03B gardent leur forme historique.

### `lib/ef03b-resilience.js`

- `call(st, prompt, meta, extraMeta)` : les 4 sites d'appel (base, ciblé, complétion, littéralisation) transmettent `{ targetId: st.targetId, documentAuthoritySha256: st.authoritySha256 }`.
- C'est l'autorité **canonique** établie par `requireAuthority`, **jamais** l'empreinte du contenu relu dans le prompt (mutant M8 tué).
- Ces champs écrasent toute valeur fournie par l'appelant.

### Chaînes de version

`lib/pipeline.js` (`schemaVersion`), config, `tools/*` et `README.md` (texte seulement) : v1.0.15 → v1.0.16.

### Ce qui ne change pas

- MONO-11 v0.4 : sceau `110db4de…`, `runCodeHash` `27610c84…`, contrat `MONO-11-v3`.
- Prompts, validateurs, recomposition, lignée, agrégation.
- `llm-response-reuse.js` (gelé), `stage-professionals.js`, `tools/ef03b-registry-import.js`.
- D103, runs historiques, résultats des smokes.

## 5. Schéma de réutilisation, avant et après

| | v1.0.15 | v1.0.16 (EF-03B) |
|---|---|---|
| Clé | `promptSha256` + VALID + fournisseur + modèle + contrat + sceau *(conditionnel)* + hash du corps | idem **+ `targetId` + `documentAuthoritySha256`**, sceau **obligatoire** |
| Champs d'entrée ajoutés | — | `targetId`, `documentAuthoritySha256`, `twinId`, `reuseIdentity` |
| Entrée sans identité | servie | **`NON_REUSABLE_FOR_EF03B_V3`** |
| Non EF-03B | — | inchangé |

## 6. Entrées legacy

Une entrée EF-03B sans `targetId` **ou** sans `documentAuthoritySha256` est **`NON_REUSABLE_FOR_EF03B_V3`** :

- aucune migration ;
- aucune déduction depuis le prompt ;
- aucun enrichissement rétroactif.

Effet : toutes les entrées EF-03B antérieures à v1.0.16 deviennent non réutilisables, y compris les 20 du smoke phase B. La reprise d'un ancien run recalculerait donc ses revues : c'est un coût ponctuel, sans perte de preuve.

## 7. Tests PB7 (`test/test-v1016-pb7-secondary-reuse.js`)

Les tests exercent la chaîne de production réelle : transport `lib/llm.js` et magasin fichier, adaptateur, puis **lot gelé MONO-11 exécuté**. Le fournisseur est remplacé par un factice **local** qui compte les appels.

| Test | Attendu | Résultat |
|---|---|---|
| PB7-01 | même prompt, cible, autorité, contrat et sceau → reuse | ✅ entrée écrite avec son identité ; nouveau run servi à **0 appel**, revue identique |
| PB7-02 | cible différente → refus | ✅ `EF03B_REUSE_TARGET_MISMATCH`, 1 appel réel |
| PB7-03 | autorité différente → refus | ✅ `EF03B_REUSE_AUTHORITY_MISMATCH` |
| **PB7-04** *(bloquant)* | B prolonge A → aucune réutilisation A → B | ✅ chaîne de production : **le registre refuse A, le magasin refuse A→B**, revue recalculée (1 appel), **aucune réponse A inscrite sous B** |
| PB7-05 | contrat différent → refus | ✅ `EF03B_REUSE_CONTRACT_MISMATCH` |
| PB7-06 | sceau différent → refus | ✅ `EF03B_REUSE_SEAL_MISMATCH` ; sans sceau → `EF03B_REUSE_SEAL_REQUIRED` |
| PB7-07 | legacy sans `targetId` → refus | ✅ `NON_REUSABLE_FOR_EF03B_V3` |
| PB7-08 | legacy sans autorité → refus | ✅ `NON_REUSABLE_FOR_EF03B_V3` (idem pour une entrée v1.0.15 complète) |
| PB7-09 | le registre refuse l'autorité → pas de contournement | ✅ réplique exacte du T3b de l'audit ; `onValidation` n'inscrit pas A sous B |
| PB7-10 | le registre refuse la cible → pas de contournement | ✅ double refus, 1 appel réel |
| PB7-11 | la réutilisation EF-03B valide fonctionne toujours | ✅ 2 cibles, reprise à **0 appel**, chaque revue sous sa cible et son autorité |
| PB7-12 | finalités non EF-03B inchangées | ✅ réutilisation historique ; aucun croisement de finalités |
| PB7-13 | fixture réelle phase B (20 entrées) | ✅ **20/20 legacy refusées** ; variante contextualisée : 20 acceptées, 40 refus de cible, 20 refus d'autorité |

**Fixture PB7-13.** `test/fixtures/pb7-phaseB-ef03b-store-entries.json` contient les métadonnées seules : aucun corps de réponse, aucun prompt, aucun chemin local. L'identité mesurée de chaque entrée est rangée **à côté** de l'entrée, jamais dedans.

## 8. Tests hérités adaptés (6 sur 332, aucun supprimé)

Ces six tests appelaient le transport en EF-03B **sans identité**, c'est-à-dire exactement la réutilisation sur `promptSha256` seul que PB-B7 interdit. Aucun ne signalait une régression de production.

| Test | Adaptation |
|---|---|
| T-STREAM-05 | identité dans META ; **ajout** : le même prompt sans autorité est refusé (`EF03B_REUSE_IDENTITY_MISSING`) |
| T-STREAM-22 | sceau fourni (obligatoire pour EF-03B) |
| RUN-SAFETY-12 | identité + `pass: 1` : l'adaptateur de production établit alors l'autorité canonique |
| RUN-SAFETY-13 | identité + sceau |
| V3 | lot piloté sans adaptateur : l'identité est ajoutée comme le ferait l'adaptateur |
| **RUN-SAFETY-21** | **inversion délibérée** (§4 du mandat) : les 4 entrées historiques f78528fe ne sont plus réutilisées (`NON_REUSABLE_FOR_EF03B_V3`, 4 appels réels) |

## 9. Matrice de mutation

**Méthode.**

- Une copie sœur temporaire est créée dans le bundle, car des tests comparent aux versions sœurs.
- Chaque mutation textuelle exacte est appliquée, puis la **suite complète** est exécutée, puis la copie est supprimée.
- Contrôle M0 : 345/345.
- Le script `evidence/mutate.py` et les résultats `evidence/mutation-results.json` sont conservés.

| Mutant | Tué par | |
|---|---|---|
| **M1** contrôle `targetId` supprimé | PB7-02, 10, 13 | ✅ |
| **M2** contrôle d'autorité supprimé | PB7-03, **04**, 09, 13 | ✅ |
| **M3** contrôle de contrat EF-03B supprimé | PB7-05 | ✅ ¹ |
| M3b contrat supprimé partout | V12-12, PB7-05 | ✅ |
| **M4** égalité de sceau EF-03B supprimée | PB7-06 | ✅ ¹ |
| M4b sceau redevenu conditionnel | PB7-06 | ✅ (comportement) |
| **M5** le registre refuse, le magasin sert (garde contournée) | 12 tests, dont PB7-04 | ✅ |
| **M6** entrée legacy acceptée | RUN-SAFETY-21, PB7-07, 08, 13 | ✅ |
| M7 l'adaptateur ne transmet plus l'identité | 9 tests | ✅ |
| M8 autorité relue dans le prompt au lieu de l'autorité canonique | PB7-04, 09 | ✅ |
| M9 entrée écrite sans identité | 13 tests | ✅ |
| **R0** retour aux fichiers v1.0.15 | 15 tests, **dont PB7-04** | ✅ |

¹ M3 et M4 ne sont tués que par l'assertion du **code** de refus. Le contrôle générique (`reuseContextCheck`) refuse encore un contrat ou un sceau différent : ces deux mutants restent donc **sûrs** sur le comportement (défense en profondeur). Les variantes qui retirent les deux couches (M3b, M4b) sont tuées sur le comportement.

**Survivants : 0.**

## 10. Non-régression

- **332/332 tests hérités passent**, dont R1-01…06, R2-01…08, R4-01…05, RA1, R5/R6 (V12-01…18), identité cible ↔ document, gardes d'autorité, import de registre, monotonie de la lignée et CAS A / CAS B, shadow A10, agrégation historique.
- MONO-11 v0.4 intact (sceau et zip) ; MONO-01, MONO-09 et MONO-10 intacts.
- **Aucune modification sémantique des revues.**

## 11. Réserves résiduelles

| Id | Gravité | |
|---|---|---|
| V16-R1 | LOW | Le transport fait confiance à l'identité déclarée par l'appelant. En production, le seul appelant EF-03B est l'adaptateur (`pipeline.js:274`), qui impose l'identité canonique (M8 tué). |
| V16-R2 | LOW | La politique gelée ne propose que l'entrée VALID la plus récente. Si son identité diverge, la réutilisation est refusée même si une entrée plus ancienne concorde : fail-closed, surcoût possible, aucun risque. |
| V16-R3 | LOW | `contextContentMismatch` reste non fatal dans l'adaptateur (hors périmètre). Sa conséquence via le magasin est fermée. |
| V16-R4 | INFO | RUN-SAFETY-21 inversé ; M3 et M4 tués par code de refus. |
| V16-R5 | INFO | Les anciennes entrées EF-03B deviennent non réutilisables : coût de recalcul ponctuel. |
| V16-R6 | INFO | Manifeste de 180 fichiers : il inclut les fichiers de gel / audit / plan de smoke de v1.0.15, hérités par la copie. |
| **V16-R7** | MEDIUM | **Non fumé** : un smoke réel reste requis avant toute activation. |

## 12. Empreintes

| | sha256 |
|---|---|
| Manifeste v1.0.16 | 180 fichiers, `contentHash` **`54266d0db6a0ce73…`**, `--verify` 180/180 |
| `MANIFEST.json` / `SHA256SUMS.txt` | `babd86b6…` / `b619e1fb…` |
| `lib/llm.js` | `9012d888…` |
| `lib/ef03b-resilience.js` | `0ec0a08a…` |
| `lib/pipeline.js` | `2cc40b6a…` |
| `test/test-v1016-pb7-secondary-reuse.js` | `82c9e9e7…` |
| fixture phase B | `37841668…` |
| `test/results.json` (345/345) | `8780bcdb…` |
| MONO-11 v0.4 | sceau `110db4de…`, `runCodeHash` `27610c84…` |

Les preuves sont dans `~/evidenceforge-work/reports/pb-b7-fix-v1016/evidence/` ; leurs empreintes figurent dans le JSON.

## 13. Ce qui n'a pas été fait

- v1.0.15 non modifiée.
- v1.0.16 **ni gelée, ni activée, ni commitée**.
- Aucun fournisseur appelé ; Phase B non relancée.
- MONO-11, D103 et les runs historiques non touchés.
- `ACTIVE_VERSION` inchangée.

**STOP — v1.0.16 candidate livrée.**
