# EVIDENCEFORGE v1.0.15 — AUTHORITY IDENTITY HARDENING — RAPPORT

- **Objet** : candidate `MONOLITH-v1.0.15`, construite **à partir de `MONOLITH-v1.0.14` GELÉE**, portée **strictement limitée** aux trois réserves *bloquantes pour activation* de l'audit indépendant `V1_0_14_FREEZE_AUDIT_PASS_WITH_RESERVATIONS` : **R1**, **R2**, **R4**.
- **Auteur du correctif** : agent d'implémentation (ce rapport n'est **pas** un audit indépendant).
- **Date** : 2026-09-22T21:51:55 — **0 appel fournisseur, 0 USD, aucun run réel, aucun smoke.**
- **Statut proposé** : `GELABLE` — **NON GELÉE, NON ACTIVE, NON FUMÉE**. `ACTIVE_VERSION` reste `MONOLITH-v1.0.10`.
- **Statut de lignée maximal revendiqué** : `GLOBAL_LINEAGE_PRESERVATION_HARDENED_CANDIDATE` (jamais « prouvé en production » : aucun run réel).

---

## 1. Ce qui est corrigé, et pourquoi c'était un trou

### R1 — identité cible ↔ document (mutant `X1` survivant en v1.0.14)

**Constat de l'audit** : `lib/pipeline.js` fabriquait une table d'autorité et la passait à l'adaptateur sous forme de **lambda opaque** ; la mutation `documentAuthority: (targetId) => authorityByTarget["target-01"]` passait **313/313**. Les E2E extrayaient la ligne de câblage par expression régulière et fournissaient **leur propre** lambda : aucun test ne faisait passer l'adaptateur par la vraie association cible → document.

**Correctif** : l'adaptateur **ne reçoit plus d'autorité**, il la **dérive**. `lib/pipeline.js` lui remet `targetDocuments: targetDocs` — **le même objet** que celui remis au lot gelé par `SP.runDownstreamFromCheckpoint` juste après. `lib/ef03b-resilience.js` construit alors, via `lib/target-identity.js` (**source unique** de l'identifiant `target-NN`) et du module **gelé** `MONO-11/v0.4/core/target-normalizer.js`, la **carte canonique** des documents normalisés. La classe de défaut « autorité d'une autre cible » n'est plus **exprimable** dans le câblage : le mutant `M7` (= `X1`) est **tué**.

### R2 — identité du document, pas simple point fixe de normalisation

**Constat de l'audit** : `DOCUMENT_AUTHORITY_NOT_NORMALIZED` prouve « ce contenu est un point fixe des règles gelées », **jamais** « c'est le bon document ». Une autorité **tronquée mais normalisée** est un point fixe : elle était **acceptée** (G3), tout comme un **autre** document normalisé (G7) ; conséquence **prouvée** par l'auditeur : `mergeLiteralRefs` écartait alors **silencieusement** une référence littérale valide. `contextContentMismatch` n'était pas discriminant.

**Correctif** — trois gardes, toutes *fail closed*, dans cet ordre :

1. `DOCUMENT_AUTHORITY_UNKNOWN_TARGET` — la cible n'appartient pas au jeu de cibles du run ;
2. `DOCUMENT_AUTHORITY_REQUIRED` / `_EMPTY` — inchangées ;
3. `DOCUMENT_AUTHORITY_NOT_NORMALIZED` — **conservée**, explicitement rétrogradée au rang d'**assertion secondaire** (condition nécessaire, jamais suffisante) ;
4. `DOCUMENT_AUTHORITY_IDENTITY_MISMATCH` — **égalité** au document canonique de la cible demandée (la garde de v1.0.15) ;
5. `DOCUMENT_AUTHORITY_TARGET_MISMATCH` — l'identifiant de cible lu dans le **prompt gelé** doit être celui de la passe ;
6. `DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE` — le contexte reconstruit depuis le **prompt gelé** doit être un **préfixe** de l'autorité.

La garde 6 est la seule **indépendante de la carte** : le prompt est construit par le lot gelé **à partir du document qu'il examine**, et le contexte reconstruit en est toujours un préfixe (tronqué au premier marqueur de section). Elle attrape donc la troncature et le mauvais document **même si la carte elle-même était fausse**. Les gardes sont **revérifiées à chaque passe** (`R2-08`).

### R4 — couverture comportementale de l'import de registre (mutant `M4c` survivant)

**Constat de l'audit** : `RI-01..RI-03` assertaient du **texte source** ; `if (false && TN.normalizeText(c).normalized !== c) throw ...` survivait **313/313**.

**Correctif** : `R4-01..R4-05` exécutent **réellement** `tools/ef03b-registry-import.js` (`importRun`) sur un **run de fixture** complet (état, jumeaux, jeu de documents cibles, schéma, traces d'enforcement, revues, grand livre) : empreinte calculée sur le document **normalisé**, refus *fail closed* sur document non normalisé, **rien écrit** après refus, entrée servie seulement sous **son** autorité **et sa** cible, `--dry-run` sans écriture, idempotence, sceau étranger refusé. `RI-01..RI-03` sont **conservés** mais désormais **étiquetés** `[SOURCE_TEXT_ASSERTION, sans valeur comportementale]`. Aucun appel fournisseur.

### Effet de bord assumé sur `RA2-E2E-08` (réserve R3 de l'audit)

L'audit relevait que le libellé de `RA2-E2E-08` annonçait « autorité tronquée REFUSÉE » alors que son corps prouvait qu'elle était **acceptée**. En v1.0.15 elle **est** refusée : le test a donc été **réécrit** (libellé désormais exact, assertion supplémentaire : **aucune entrée de registre n'est écrite** sous autorité tronquée, là où v1.0.14 en inscrivait une porteuse d'une empreinte tronquée). Aucune assertion n'a été retirée ni affaiblie.

---

## 2. Registre lié à la cible

`createReviewRegistry().find(basePromptSha256, sealHash, contract, documentAuthoritySha256, targetId)` : une entrée produite pour `target-01` **n'est jamais servie** pour `target-02` ; une entrée **sans** cible (ère ≤ v1.0.14, liaison indémontrable) n'est jamais servie quand la cible est exigée. Le refus est **compté** (`registryRefusedForeignTarget`) et **tracé** (`REGISTRY_REFUSED` / `FOREIGN_TARGET`). Preuve : `R1-04`, `R4-04`.

---

## 3. Périmètre : ce qui n'a PAS été touché

- **Aucun lot gelé** : MONO-01, MONO-09, MONO-10, MONO-11 v0.4 (83/83) — 0 divergence.
- `lib/stage-professionals.js` **byte-identique à v1.0.14** : `runDownstreamFromCheckpoint` est byte-identique à v1.0.4 **par contrat** (assertions `PROF-ECON-04`, `PRO-EARLY-08`). Son expression positionnelle `target-NN` est donc **exemptée explicitement** dans `R1-06` : elle a la **même sémantique** que `TI.targetIdAt`, et un désaccord éventuel ne peut pas produire d'appariement silencieux — il est arrêté par la garde fondée sur le **prompt gelé** (`R1-03`).
- `tools/ef03b-registry-import.js` **byte-identique à v1.0.14** (R4 était une réserve de **couverture de test**, pas de comportement : l'auditeur avait exercé l'outil et conclu « comportement conforme »).
- D103 (P0.1 / P0.2 / P0.3), le run historique `efm-20260918-a64167c0`, `ACTIVE_VERSION`, les versions v1.0.10 / v1.0.12 / v1.0.13 / v1.0.14 : **non modifiés**.

---

## 4. Fichiers modifiés (sha256 v1.0.15)

| Fichier | État | sha256 |
|---|---|---|
| `lib/target-identity.js` | NOUVEAU | `02f6d2e90bf846359f3ba6163c022e0391d8b832570f29c5939f8509b6cf16ad` |
| `lib/ef03b-resilience.js` | MODIFIE | `f3fd0fa14675afc9f840cddc9ac1df23f6e7405c029585db075f280cd57d504f` |
| `lib/pipeline.js` | MODIFIE | `b7a5d5e6e6cf63989992a5049504402fd8ac863228ad940c32f06c9dd0b89abd` |
| `lib/stage-report.js` | MODIFIE | `ae1dec38d2b3870af49cc71172969773904c5bf0600a54693fc0286b04021b9d` |
| `test/test-v1015-authority-identity.js` | NOUVEAU | `1cdbc59ba9848987b2b310d995273183fce958e1bb4c62d25c283e62db2497e5` |
| `test/test-v1014-e2e-wiring.js` | MODIFIE | `73a15455ca2bbed1193a144f68dc9f7ab333103f7f75718ca04fa89fd9d90059` |
| `test/test-v1014-normalized-authority.js` | INCHANGE | `3b0938fe4b0dd3f33f02df66eb1d4249fb568f476868e8acd9f1b8c83eafe7da` |
| `test/test-ef03b.js` | MODIFIE | `430e661908c1606f208dde38ff60fca3ef688c740e8c8de32ad1e85b837c3305` |
| `test/test-ef03b-lineage.js` | MODIFIE | `1749be9089abc222bda9436adc8d01fb11a22bfd81c04e7c6fd54151d1f2dad8` |
| `test/test-v1012-lineage-parity.js` | MODIFIE | `eee55db2aec804c55d59e9b90fd8c87d6ccd05b54c80f644e7faf2266b25823c` |
| `test/test-stream.js` | MODIFIE | `b2a93b1b1d2576836bddf8e2ae606f44d6401871ed7ac2bed65138c9f86413e9` |
| `config/monolith.config.json` | MODIFIE | `a4ea57357437ae557e7831b709c125dab8602426ed7f217f9b06323590a1163f` |
| `tools/build-manifest.js` | MODIFIE | `e0f295e854f626cde5f642acc68a8e012cd83a3d8a7add4ee417e83122732907` |
| `tools/package.sh` | MODIFIE | `a2415be1e23fd1fa1dcf221b20567fda0fe939402522c2e8736db67b8ed28c33` |
| `tools/ef03b-autopsy.js` | MODIFIE | `f693a382c5317b311a2245872795416fe3eaf7119e1f8758026b35a75159a63b` |
| `README.md` | MODIFIE | `ea598be935f8f42959b4d147ead7deae73972eb0fbb50ec023dd0f0c96b99187` |

Fichiers critiques **inchangés** (contrôle) :

| Fichier | État vs v1.0.14 | sha256 |
|---|---|---|
| `lib/stage-professionals.js` | INCHANGE | `46f2b48f63ee268b7fdbe4c44098204948d2f53b6e439caec46dfb36e481b085` |
| `tools/ef03b-registry-import.js` | INCHANGE | `70502a66a14134c41f2c0f2aae63b85f47f469b8fa32a267a2de14ab69d7b1c5` |
| `lib/llm.js` | INCHANGE | `34816352ef0ef5dc63ea66998b259d1532d2a079972669e7fdde864828f8fac2` |
| `lib/run-store.js` | INCHANGE | `ab41ebc31f4505ff2f9825ea09767e76af091150df323346514655ff63a5be7d` |
| `lib/document-chunker.js` | INCHANGE | `6a7953968a7d7472273ef2a09869b8f4813af3606ae19e482ac6295d164e9935` |
| `server.js` | INCHANGE | `8f567af101b7a4d444eb04938a28a8575aa60d75c0ec1587d625b59ef17f073b` |

---

## 5. Tests

- **Harnais complet : 332/332 tests OK** (313 de v1.0.14 **tous conservés** + 19 nouveaux) ; chunking **21/21**.
- Nouveaux identifiants : `R1-01..R1-06`, `R2-01..R2-08`, `R4-01..R4-05`.
- Tests **modifiés** (et pourquoi) : `RA2-E2E-01..08` (câblage de production : plus de lambda ni d'`eval` de la source), `RA2-E2E-08` (comportement changé, cf. § 1), `RI-01..RI-03` (étiquetage), `V12-18` et `T-STREAM-20` (chaîne de version), et les sites d'appel hérités qui passent désormais `targetDocuments` au lieu d'une lambda (`test-ef03b.js`, `test-ef03b-lineage.js`, `test-v1012-lineage-parity.js`). `test/test-v1014-normalized-authority.js` est **inchangé** : il conserve volontairement l'appel par `documentAuthority` seul (sans carte canonique), ce qui exerce le mode « autorité fournie » et la garde de **préfixe** indépendante (cf. `R2-05`). **Aucune assertion retirée ni assouplie.**
- Manifeste : `{"ok":true,"files":169,"bad":[]}` — `fileCount` = 169, `contentHash` = `1e2196504aa217fbb5bb654e4e8529bee6f732a74a7b15daec732d509f356ea4`, version produit `MONOLITH-v1.0.15`.
- Secret scan : ok=True, fichiers=171, hits=0
- Anti-hardcoding : ok=True, fichiers=79, hits=0, jetons de cas=0

---

## 6. Matrice de mutation

Chaque mutant est appliqué **au code livré**, le harnais **complet** est réexécuté, puis le code est restauré à l'identique.

| Mutant | Mutation | Fichier | Score | Résultat | Tué par |
|---|---|---|---|---|---|
| `M1` | autorite = contenu BRUT (defaut exact de la candidate v1.0.13) | `lib/target-identity.js` | 316/332 tests OK — 16 ECHEC(S) | **TUÉ** | `R1-01`, `R1-02`, `R1-03`, `R1-04`, `R1-05`, `R2-01`, `R2-02`, `R2-03` … |
| `M2` | index de cible decale (target-NN -> target-NN+1) dans la source unique | `lib/target-identity.js` | 317/332 tests OK — 15 ECHEC(S) | **TUÉ** | `P2`, `R1-03`, `R1-04`, `R1-05`, `R1-06`, `R2-07`, `RA2-E2E-01`, `RA2-E2E-02` … |
| `M3` | autorite tronquee (slice(0, 20)) dans la carte canonique | `lib/target-identity.js` | 282/332 tests OK — 50 ECHEC(S) | **TUÉ** | `R1-01`, `R1-02`, `R1-04`, `R1-05`, `R2-02`, `R2-03`, `R2-07`, `R2-08` … |
| `M4` | documentAuthoritySha256 absent a l'import de registre | `tools/ef03b-registry-import.js` | 327/332 tests OK — 5 ECHEC(S) | **TUÉ** | `R4-01`, `R4-02`, `R4-03`, `R4-04`, `RI-01..RI-03` |
| `M4c` | garde d'import neutralisee en CONSERVANT le texte source (if (false && ...)) — mutant SURVIVANT de l'audit v1.0.14 | `tools/ef03b-registry-import.js` | 330/332 tests OK — 2 ECHEC(S) | **TUÉ** | `R4-02`, `R4-03` |
| `M5` | correctif R-A1 retire (reparation illisible recomposee) | `lib/ef03b-resilience.js` | 329/332 tests OK — 3 ECHEC(S) | **TUÉ** | `RA1-01`, `RA1-02`, `RA1-03` |
| `M6` | garde d'IDENTITE retiree (retour a la seule garde de point fixe de v1.0.14) | `lib/ef03b-resilience.js` | 326/332 tests OK — 6 ECHEC(S) | **TUÉ** | `R1-02`, `R2-01`, `R2-02`, `R2-03`, `R2-08`, `RA2-E2E-08` |
| `M7` | autorite de la PREMIERE cible rendue pour TOUTES les cibles — mutant X1 SURVIVANT de l'audit v1.0.14 | `lib/ef03b-resilience.js` | 327/332 tests OK — 5 ECHEC(S) | **TUÉ** | `R1-01`, `R1-02`, `R1-03`, `R1-04`, `RA2-E2E-07` |
| `X2` | normalisation appliquee deux fois (idempotente) | `lib/target-identity.js` | 332/332 tests OK | SURVIVANT | — |

- `M7` et `M4c` sont **exactement** les deux mutants **survivants** de l'audit indépendant v1.0.14.
- `X2` (double normalisation) est un survivant **attendu et correct** : la normalisation est idempotente, aucune destruction.

---

## 7. Ce que ce rapport ne prouve pas

1. **Aucun run réel, aucun smoke** : la chaîne n'a pas été exercée contre un fournisseur (décision propriétaire D6 de v1.0.14 : `DO_NOT_SMOKE`). Les garanties ci-dessus sont des garanties **de code et de test**.
2. **Aucun zip canonique** n'est produit pour v1.0.15.
3. Réserves **non traitées** parce que **hors portée exclusive** fixée par le propriétaire (R1/R2/R4) : `R5` (`REGISTRY_IMPORT_AUTHORITY_MISSING` pratiquement inatteignable), `R6` (garde d'autorité non exigée sur une passe ni base ni ciblée sans contexte — inatteignable dans le pipeline de production), `R7` (comptage d'identifiants de tests), `R-A3` / `R-A5` / `R-A6`. Elles restent **ouvertes** et **transportées**.
4. `R1-06` est une **assertion de texte source** : elle est étiquetée comme telle et n'a **aucune** valeur comportementale (leçon de `M4c`). La garantie comportementale correspondante est portée par `R1-01..R1-05`.
5. Ce rapport est produit par l'**auteur du correctif**. Un **audit indépendant en lecture seule** reste requis **avant tout gel**.

---

## 8. Verdict proposé

> **`GELABLE`** — sous réserve d'audit indépendant, et sans aucune activation ni smoke.
>
> `READY_FOR_ACTIVATION = false` · `SMOKE_AUTHORIZED = false` · `ACTIVE_VERSION = MONOLITH-v1.0.10` (inchangée).
