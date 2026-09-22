# EvidenceForge MONOLITH v1.0.13 — AUDIT INDÉPENDANT DE GEL (adversarial, lecture seule)

**Auditeur** : agent indépendant adversarial (lecture seule) · **Date** : 2026-09-22 · **Sujet** : `MONOLITH-v1.0.13` (candidat, non gelé, non commité)
**Prédécesseur gelé** : `MONOLITH-v1.0.12` (`ACTIVATION_BLOCKED_BY_RA2`) · **Lot** : MONO-11 v0.4, sceau `110db4de…`, contrat `MONO-11-v3`
**État mesuré du paquet livré AVANT toute écriture de ce rapport** : `MANIFEST.json` 166 fichiers, `contentHash` `6f8e037a853b1e46f12d21e95e6d6d516db84a73f2ebddb6e0e10ca5378c4ead`, `node tools/build-manifest.js --verify` → `{"ok":true,"files":166,"bad":[]}`.

---

## VERDICT

# `V1_0_13_FREEZE_AUDIT_FAIL`

### Recommandations

| Décision | Recommandation |
|---|---|
| Gel | **NE PAS GELER** |
| Smoke réel | **NE PAS SMOKE** (un smoke réel sur le câblage actuel produirait des revues dégradées et des citations détruites, à coût fournisseur réel) |
| `ACTIVE_VERSION` | rester sur `MONOLITH-v1.0.10` (inchangée, vérifiée) |

### Statuts

| Objet | Statut |
|---|---|
| **R-A2** | `RA2_PARTIALLY_CLOSED` — fermé au niveau du contrat de l'adaptateur, **rouvert par le câblage** (`lib/pipeline.js`) |
| **R-A1** | `TRACE_PARITY_PASS` (sous réserve que l'autorité soit correcte ; voir B1) |
| **R5** | `ADAPTER_MONO11_PARITY_PASS` (24/24 combinaisons, candidat de registre byte-identique) — **sous la même précondition** |
| **R6** | `PASS` (contrat lu dans la configuration, 4 cas fail-closed vérifiés) |
| **GLOBAL_LINEAGE_PRESERVATION** | `KNOWN_GAP_REMAINS` |

---

## BLOQUANTS

| # | Sévérité | Bloquant |
|---|---|---|
| **B1** | **critique** | `lib/pipeline.js:269` fournit comme « autorité documentaire » le contenu **BRUT** `targetDocs[i].content`, alors que le document réellement remis au lot gelé est le contenu **NORMALISÉ** par `MONO-11/v0.4/core/target-normalizer.js` (appliqué dans `core/autonomous-run.js:158-161` avant `buildTargetDocumentSet`). L'invariant annoncé (« `isLiteral(r)` est évalué contre le MÊME contenu documentaire que celui utilisé par le lot MONO-11 ») est **faux dès qu'un document contient `’ “ ” NBSP CRLF` ou une forme non-NFC** — c'est-à-dire pour tout texte français ou produit sous Windows. |
| **B2** | **critique** | Conséquence prouvée de B1 : l'adaptateur **détruit** une citation valide et **dégrade le résultat du lot**. Cas reproduit : revue acceptée `complete` en passe 1 par le lot seul → `reviewStatus: error`, 0 constat, 3 passes consommées, citation valide perdue sous v1.0.13. **Le même cas est correct sous v1.0.12 (gelée)** : c'est une **régression vis-à-vis du prédécesseur**. |
| **B3** | **majeur** | Le câblage de l'autorité — la seule moitié du correctif qui s'exécute en production — n'est protégé par **aucun test**. Mutation adversariale de `lib/pipeline.js:269` (décalage d'index + troncature à 20 caractères) : **303/303 tests passent**. |
| **B4** | **majeur** | `tools/ef03b-registry-import.js` (byte-identique à v1.0.12) n'écrit **pas** `documentAuthoritySha256`. Sous v1.0.13, `find()` refuse toute entrée sans empreinte : **toutes les entrées importées hors ligne deviennent inservables**. La fonctionnalité annoncée « replay ciblé servi à 0 appel » est cassée ; ce n'est pas dit dans le rapport de l'auteur, qui affirme au contraire « **writes** : chaque entrée porte `documentAuthoritySha256` ». |

---

## RÉSERVES

| # | Sévérité | Réserve |
|---|---|---|
| R-N1 | moyenne | `RA2-04` est **tautologique** au regard du correctif : elle passe à l'identique avec le correctif R-A2 retiré (voir « revert-check »). |
| R-N2 | moyenne | `RA1-02` et `RA1-03` ne protègent pas le correctif R-A1 : elles passent aussi avec le correctif retiré (elles constatent le résultat du lot, que le miroir ne modifiait déjà pas). Seule `RA1-01` est décisive. Problème de même nature que `R-A4` de l'audit v1.0.12, non traité. |
| R-N3 | faible | `registry.find()` est **permissif** quand l'appelant omet l'empreinte d'autorité (`documentAuthoritySha256 ? … : true`). Le seul appel omettant l'empreinte est celui qui sert à tracer le refus (`lib/ef03b-resilience.js:229`), donc sans effet aujourd'hui — mais la garde est portée par l'appelant, pas par le registre. |
| R-N4 | faible | Chemin non-base : si la première interception pour un couple `(twinId,targetId)` n'est pas une passe de base, `st.authoritySha256` reste `null` et une entrée de registre peut être écrite avec `documentAuthoritySha256: null`. Inexploitable en pratique (la passe 1 est toujours `BASE_EF03B`) et jamais servie, mais contredit « chaque entrée porte l'empreinte ». |
| R-N5 | faible | `withAuthority` rejoué sur une passe ciblée recalcule `promptParsedContentSha256 = sha(st.ctx.content)`, or `st.ctx.content` est déjà l'autorité : le champ ne désigne plus le contenu reconstruit depuis le prompt. Fidélité de trace. |
| R-A3 (héritée) | faible | **NON TRAITÉE** : `tools/build-manifest.js:16` annonce toujours que le contrat est « MESURE en chargeant le module » ; il est en réalité déduit par expression régulière sur `lib/llm.js` puis relu dans la configuration (l. 18). |
| R-A5 (héritée) | info | **NON TRAITÉE** (observation) : `report-restored.json` déclare `88145afc…` ; recalculé avec la clé `restoration` → `9b41504d…`, sans elle → `59f152e1…`. Artefact A10, hors périmètre. |
| R-A6 (héritée) | faible | `tools/package.sh` appelle `build-manifest.js` : un gel régénérera le manifeste et y **inclura** les présents rapports d'audit. Décision explicite requise au gel. |
| R3 (héritée) | moyenne | **Toujours non bloquante et inchangée** : libellé de passe 3 du lot gelé (lot inchangé, 0 divergence). |
| R4 (héritée) | faible | **Améliorée côté trace** par R-A1 : `REPAIR_UNPARSABLE` + `repairErrors` + `repairScope` = dimensions fautives du lot sont désormais tracés par le miroir. Le lot gelé reste inchangé (`repairUnresolvedDimensions = []`). |
| R12 (héritée) | info | **Ne peut pas être levée** : aucun smoke réel (interdit ici) — et un smoke serait de toute façon prématuré tant que B1 n'est pas corrigé. |
| R13 (héritée) | faible | Aucun zip canonique v1.0.13. Non bloquant avant gel. |
| R-N6 | faible | Le chiffre « shadow A10 **70**/12/3 » repris du rapport v1.0.12 n'est **pas reproductible** : je mesure **180** constats (18 revues × 10 dimensions), 147 constats à citations non vides, 40 constats dans le périmètre A10. Les chiffres substantiels (12 citations restaurées, 3 constats vidés restaurés, 0 autre champ modifié) sont **exactement** reproduits. |
| R-N7 | faible | Les « Limites connues » du rapport de l'auteur ne mentionnent ni B1, ni B2, ni B3, ni B4. L'honnêteté est bonne sur R-A3 / R-A5 / absence de zip / absence de smoke, incomplète sur le reste. |

---

## 1. DIFF RÉEL v1.0.12 → v1.0.13

`diff -rq` (hors `.DS_Store`) sur les copies de travail : **17 entrées**, exactement celles annoncées par l'auteur, plus les deux fichiers de son propre rapport.

| Fichier | Fonction / ligne | Comportement avant → après | Annoncé ? |
|---|---|---|---|
| `lib/ef03b-resilience.js` `564a0e3d…`→`d13c1752…` | `createReviewAdapter` l.188-200 (`authorityOf`, `requireAuthority`) | inexistant → autorité obligatoire, `DOCUMENT_AUTHORITY_REQUIRED` / `_EMPTY` avec `fatal:true` | oui |
| idem | `withAuthority` l.209-216 | inexistant → `ctx.content` remplacé par l'autorité, écart compté (`contextContentMismatch`) et tracé (`DOCUMENT_AUTHORITY_MISMATCH`) | oui |
| idem | `reviewCall` l.226 | `st.ctx = parseReviewPromptContext(prompt)` → `st.ctx = withAuthority(st, parseReviewPromptContext(prompt), meta)` | oui |
| idem | `reviewCall` l.228-229 | `registry.find(p,seal,contract)` → `+ st.authoritySha256` ; refus d'une entrée étrangère compté et tracé | oui |
| idem | `reviewCall` l.235 | inexistant → autorité revalidée à chaque passe ciblée | oui |
| idem | `reviewCall` l.236-237 (R-A1) | `parseRepair(r.text, toutes les dimensions)` puis recomposition inconditionnelle → `RE.faultyDimensions(st.lastErrors)` puis, si `!rp.ok`, **aucune recomposition** + trace `REPAIR_UNPARSABLE` | oui |
| idem | `mirrorParsed` l.222 | ajout `st.lastErrors = v.errors` | oui |
| idem | `createReviewRegistry.find` l.173-174 | filtre supplémentaire sur `documentAuthoritySha256` | oui |
| idem | `onValidation` l.269 | `registry.put({…})` → `+ documentAuthoritySha256: st.authoritySha256` | oui |
| `lib/pipeline.js` `204862cc…`→`f5d48c53…` | l.267-271 | ajout du résolveur `documentAuthority: (targetId) => targetDocs[Number(m[1])-1].content` ; `schemaVersion` v1.0.13 | oui (mais **incorrect**, cf. §2) |
| `config/monolith.config.json`, `tools/build-manifest.js`, `tools/ef03b-autopsy.js`, `tools/package.sh`, `README.md` | — | version / provenance / `schemaVersion` / nom du zip | oui |
| `test/test-ef03b.js`, `test/test-ef03b-lineage.js`, `test/test-v1012-lineage-parity.js`, `test/test-stream.js` | — | injection de `documentAuthority`, empreintes, versions | oui |
| `test/test-v1013-document-authority.js` | **AJOUT** | RA2-01…08, RA1-01…03 | oui |
| `test/results.json`, `test/results-chunking.json`, `MANIFEST.json`, `SHA256SUMS.txt` | — | fichiers mesurés | oui |
| `EVIDENCEFORGE-v1.0.13-RA2-RA1-FIX-AUDIT.{md,json}` | **AJOUT** | rapport de l'auteur | non listé dans son tableau de diff (sans conséquence) |

**Byte-identité vérifiée (sha256 identiques entre v1.0.12 et v1.0.13)** : `lib/llm.js` `34816352…`, `lib/stage-professionals.js` `46f2b48f…`, `lib/stage-report.js` `0e67295b…`, `tools/ef03b-registry-import.js` `c6d694ac…`, `server.js` `8f567af1…`, `index.html` `d3541fa6…`, `lib/panel-sufficiency.js`, `lib/economic-panel.js`, `lib/llm-stream.js`, `lib/paths.js`, et tout `worker/`, `vendor/`, `governance/`, `fixtures/` (absents du `diff -rq`).

**MONO-11 v0.4 intact** : `shasum -c SHA256SUMS.txt` → **55/55 OK, 0 divergence** ; `verifyFrozenLots()` → MONO-01 106 fichiers / 0, MONO-09 9 / 0, MONO-10 79 / 0 (zip `f5a41654…` ✔), MONO-11 55 / 0 (zip `79c16d08…` ✔) ; sceau chargé `110db4de24709926d4a5fb6d0e951530f0afc2c1c807a09127852a92aa182c3d`, `runCodeHash` `27610c84502104b3dc9643a9cc0289aef4ae40ae65ee34e4fe82f31a73e381ad`, contrat `MONO-11-v3` — conformes au `MONO-11-v0.4-FREEZE-RECORD.json`. Suite propre du lot : **83/83**.

**Rien de changé qui ne soit annoncé.**

---

## 2. R-A2 — AUTORITÉ DOCUMENTAIRE

### 2.1 Lecture complète de `lib/ef03b-resilience.js` (275 lignes)

Aucun chemin de décision de littéralité ne repose plus sur le prompt **une fois `st.ctx` construit** :

| Point | Source du contenu | Verdict |
|---|---|---|
| `requireAuthority(targetId)` l.195-200 | `opts.documentAuthority(meta.targetId)` uniquement | OK |
| `withAuthority` l.209-216 | remplace `ctx.content` par l'autorité, **avant** tout usage | OK |
| `validateCandidate` → `docLike(ctx)` l.92, 95 | `ctx.content` = autorité | OK |
| `mirrorParsed` l.222 | idem | OK |
| littéralisation, `classifyNonLiteralRef`, `findExactSpan`, extraits l.255-262 | `st.ctx.content` = autorité | OK |
| `preserveLineageRepairs` / `mergeLiteralRefs` l.259 | `st.ctx.content` = autorité | OK |
| `RE.mergeRepairLineage` (miroir ciblé) l.238 | `st.ctx.content` = autorité | OK |
| `RE.repairContext` l.257 → `documentSha256` | `docLike(st.ctx)` = autorité | OK (mais voir B1 : diverge alors de l'empreinte calculée par le lot) |
| registre (écriture l.269, lecture l.228) | `st.authoritySha256` | OK |

**Le contrat de l'adaptateur est correct.** 21 sondes indépendantes (§11) passent quand l'autorité est le document du lot.

### 2.2 Câblage — **LE DÉFAUT**

`lib/stage-professionals.js:329` construit `targets` à partir de `input.targetDocuments` (indexation `target-NN`, `padStart(2,"0")`), puis les passe à `M11.autonomousRun.runDownstream`. **L'indexation de `lib/pipeline.js:269` (`targetDocs[Number(m[1])-1]`) correspond exactement** (`Number("02") === 2`) — vérifié pour `target-01`, `target-02`, `target-03`.

Mais `MONO-11/v0.4/core/autonomous-run.js` l.158-161 :

```
const normalization = arr(input.targetDocuments).map((t) => TN.normalizeTargetDocument(t));
const targetDocumentSet = await F.M01.TDS.buildTargetDocumentSet(input.missionId, normalization.map((n) => n.document));
```

et `core/target-normalizer.js` l.60-62 : `document = { …, content: normalized }` (règles NFC, `’→'`, `”→"`, NBSP→espace, CRLF→LF).
Puis `core/review-enforcer.js:389` : `doc = getDocumentForTarget(tds, target.targetId)` → `doc.content` = **normalisé** ; c'est ce `doc` que `validateReviewCandidate` et le prompt EF-03B utilisent.

⇒ **le document réellement remis au lot est le contenu NORMALISÉ ; `documentAuthority` rend le contenu BRUT.**

**Mesure de reproduction (scratch)** :

```
RAW  sha=835d03b9197f len=110      NORM sha=31c5ac884524 len=103
docForLot.content === NORM : true
CITE (copiée du document que voit le modèle) littérale dans NORM : true / dans RAW : false
```

**Portée réelle** — `normalization-records.json` du seul run réel disponible (`efm-20260918-a64167c0`) :

```
targetId=target-01  changed=true  APOSTROPHE:153
originalSha256=384a263fff93…   normalizedSha256=7885c6ec4016…
```

⇒ sur le seul corpus réel existant, l'invariant R-A2 est violé **dès la première revue**, pour **toutes** les revues, et pour toute citation contenant une apostrophe (omniprésente en français).

### 2.3 Conséquence prouvée (B2)

Cas construit : document contenant une NBSP ; le modèle cite littéralement le document **qu'il voit** (normalisé).

| Configuration | Statut | Passes | Citation DIM-02 | Trace |
|---|---|---|---|---|
| **A. v1.0.13 livrée (autorité = BRUT)** | **`error`** | **3** | **perdue** | `DOCUMENT_AUTHORITY_MISMATCH` → `BASE/CANDIDATE_INVALID` → `LITERALIZATION/CANDIDATE_VALID` → `REJECTED` ×3 |
| B. autorité = document du lot (contrôle) | `complete` | 1 | conservée | `BASE/CANDIDATE_VALID` → `VALIDATED` |
| C. lot seul, sans adaptateur | `complete` | 1 | conservée | — |
| D. **v1.0.12 gelée, même cas** | `complete` | 1 | conservée | — |

Mécanisme : le miroir juge sur le BRUT → citation correcte déclarée non littérale → passe de littéralisation → proposition du span **BRUT** (avec NBSP) → le modèle le recopie → `preserveLineageRepairs` écarte la citation originale (non littérale dans le BRUT) → candidat recomposé amputé et corrompu → **le lot le rejette**. L'adaptateur n'est donc plus additif : il **dégrade** le lot, consomme des passes et du coût fournisseur, et trace `CANDIDATE_VALID` pour un candidat que le lot rejette (violation de l'objectif R-A1 par une autre porte).

**Classification R-A2 : `RA2_PARTIALLY_CLOSED`.**

---

## 3. AUTORITÉ ABSENTE / VIDE — fail-closed

| Cas | Attendu | Mesuré | Verdict |
|---|---|---|---|
| (A) `documentAuthority` absent à la construction | `DOCUMENT_AUTHORITY_REQUIRED`, `fatal:true` | idem (l.194) | ✔ |
| (A′) cible inconnue à l'appel | `DOCUMENT_AUTHORITY_REQUIRED`, `fatal:true` | idem (l.197) | ✔ |
| (B) autorité vide `""` | `DOCUMENT_AUTHORITY_EMPTY`, `fatal:true` | idem (l.198) | ✔ |
| (C) repli silencieux sur le prompt | interdit | `withAuthority` appelle `requireAuthority` **avant** de regarder `ctx` : aucun chemin de repli | ✔ |
| (D) passe invalide enregistrée VALID | interdit | l'erreur remonte hors de `runEnforcedReview` | ✔ |

Propagation vérifiée dans le lot gelé (`core/review-enforcer.js`, boucle de passes) :
`try { r = await input.llmCall(prompt, meta); } catch (e) { if (e && e.fatal === true) throw e; … }` — l'erreur **n'est pas convertie en passe consommée** ; sondes S11-1/2/3 : l'exception traverse `runEnforcedReview`, aucune passe enregistrée, aucun registre écrit. **Aucune continuation silencieuse.**

---

## 4. ÉCART PROMPT ↔ DOCUMENT

Sondes indépendantes, document réellement remis au lot = autorité (cas nominal) :

| Sonde | Contexte reconstruit | `contextContentMismatch` | `contextUnparsed` | Citation conservée |
|---|---|---|---|---|
| S4-1 marqueur + ligne JSON (tronqué **mais parsable**) | 58 / 191 car. | **1** | 0 | ✔ |
| S4-2 marqueur seul (illisible) | `null` | 0 | **1** | ✔ (aucune interception) |
| S4-3 marqueur en tout début | 186 / 186 | 0 | 0 | ✔ |
| S4-4 marqueur en toute fin | `null` | 0 | **1** | ✔ |
| S4-5 plusieurs marqueurs | 58 / 282 | **1** | 0 | ✔ |
| S4-6 autorité **plus courte** que le contenu du prompt | — | **1** | 0 | l'autorité fait foi ✔ |
| S4-7 autorité **plus longue** que le contenu du prompt | — | **1** | 0 | l'autorité fait foi ✔ |

`DOCUMENT_AUTHORITY_MISMATCH` est tracé avec `promptParsedContentSha256`, `documentAuthoritySha256` et les deux longueurs. Aucune citation présente dans `doc.content` n'est écartée pour absence du contexte reparsé. **PASS** (au niveau du contrat).

---

## 5. CHAÎNE ADVERSARIALE R-A2 — reproduction sous les deux versions

Document contenant le marqueur au milieu ; `DIM-02` = une citation valide **après** le marqueur + une citation non littérale réparable (items de liste joints).

| | v1.0.12 (gelée) | v1.0.13 (autorité correcte) |
|---|---|---|
| littéralisations | 1 | 1 |
| refs DIM-02 finales | `["Premier point du document\n- Second point du document"]` | `["Passage situe APRES le marqueur…", "Premier point du document\n- Second point du document"]` |
| citation valide conservée | **NON** | **OUI** |
| candidat au registre | **amputé**, marqué VALID | complet |
| `documentAuthoritySha256` au registre | `undefined` (réutilisable à 0 appel) | `8e5196b9…` |

La chaîne historique est donc **réellement fermée par le correctif d'adaptateur**. Elle est **rouverte par une autre porte** (§2.3) dès que la normalisation modifie le document.
**Classification : `RA2_PARTIALLY_CLOSED`.**

---

## 6. REGISTRE — EMPREINTE DOCUMENTAIRE

| Cas | Attendu | Mesuré |
|---|---|---|
| même sceau + même contrat + même autorité | admissible | ✔ servie |
| entrée **sans** `documentAuthoritySha256` (ère ≤ v1.0.12) | refusée | ✔ `null` |
| empreinte d'autorité **différente** | refusée | ✔ `null` |
| **ancien sceau** | refusée | ✔ `null` |
| **ancien contrat** (`MONO-11-v2`) | refusée | ✔ `null` |
| réutilisation 0 appel sous une autre autorité | refusée **et tracée** | ✔ `registryReuses=0`, `registryRefusedForeignAuthority=1`, trace `REGISTRY_REFUSED / FOREIGN_DOCUMENT_AUTHORITY` |
| réutilisation 0 appel sous la même autorité | admise | ✔ `registryReuses=1` |

**Écritures** : l'adaptateur écrit toujours l'empreinte (l.269) — sauf le cas limite R-N4.
**MAIS** : `tools/ef03b-registry-import.js` (l. `const entry = Object.assign({ basePromptSha256…, sourceSealHash: SEAL.runtimeSealSha256, … })`) **n'écrit pas** `documentAuthoritySha256` (`grep documentAuthoritySha256` → aucune occurrence). Toute entrée importée hors ligne est donc **définitivement inservable** sous v1.0.13 → **B4**.

---

## 7. R-A1 — PARITÉ DE TRACE

| Contrôle | Mesuré |
|---|---|
| `parseRepair` KO → aucune recomposition miroir | ✔ (l.237, `return r` avant `mergeRepairLineage`) |
| `REPAIR_UNPARSABLE` émis | ✔ (2 occurrences sur 3 passes) |
| dimensions fautives = celles du lot (`RE.faultyDimensions(st.lastErrors)`) | ✔ `repairScope=["DIM-02"]` |
| codes d'erreur de `parseRepair` portés | ✔ `repairErrors` non vide |
| jamais `CANDIDATE_VALID` sur une passe rejetée (branche `PASSTHROUGH`) | ✔ |
| aucune écriture au registre | ✔ 0 entrée |
| décision finale du lot inchangée | ✔ `error`/`acceptedPass=null`, mêmes passes que le lot seul |

**`TRACE_PARITY_PASS`** — avec la réserve que sous B1 la branche **littéralisation** peut encore tracer `CANDIDATE_VALID` pour un candidat que le lot rejette (§2.3) ; ce n'est pas la branche visée par R-A1, mais c'est le même symptôme.

---

## 8. NON-RÉGRESSION MONO-11 v0.4

- Lot **byte-identique** (55/55, 0 divergence), sceau et `runCodeHash` conformes au registre de gel.
- Suite propre du lot : **83/83** (`node test/test-mono11-v0.4.js`), couvrant `lineageMonotonicityDuringRepair` P1–P6, CAS A / CAS B, fail-closed, refs préservées, rejetées = invalides seulement, dedup stable, ordre déterministe, contrat `MONO-11-v3`.
- Côté monolithe : `V12-01…18` verts dans les 303.
- `verifyFrozenLots()` : **0 divergence** sur les 4 lots.

---

## 9. R5 / R6

### R5 — matrice de parité indépendante (24 combinaisons RAW × REPAIR)

RAW ∈ {`[]`,`[V1]`,`[V1,X1]`,`[X1]`,`[V1,V2]`,`[X1,X2]`} × REPAIR ∈ {`[]`,`[V2]`,`[X2]`,`[V1,V2]`}.
Comparaison **adaptateur+lot vs lot seul** : statut, `acceptedPass`, nombre de passes, refs finales de chaque dimension, **suite complète des `responseSha256` de chaque passe**.

**24 / 24 `IDENTIQUE`**, 0 divergence. Candidat de registre vs texte accepté par le lot : **byte-identique** dans les 18 cas où un candidat est accepté (`n/a` dans les 6 cas `error`).

### R6 — provenance du contrat et fail-closed

- `lib/llm.js` : aucun épinglage littéral (`VALIDATION_CONTRACT = "…"` absent) ; contrat lu dans `P.CONFIG.frozenLots["MONO-11"].contractVersion` = `MONO-11-v3` (lot chargé v0.4). ✔
- entrée d'un autre contrat : **non servie** ✔ · entrée d'un autre sceau : **non servie** ✔
- import hors ligne, autre sceau : `REGISTRY_IMPORT_SEAL_MISMATCH` ✔ · autre contrat : `REGISTRY_IMPORT_CONTRACT_MISMATCH` ✔

**R5 `PASS`, R6 `PASS`** — le correctif R-A2 ne les rouvre pas *au niveau du contrat* ; sous B1 la parité R5 est en revanche **factuellement rompue en production** (le miroir fusionne sur le BRUT, le lot sur le NORMALISÉ).

---

## 10. TESTS LIVRÉS ET REVERT-CHECK

| Mesure | Annoncé | Mesuré (dans la copie) |
|---|---|---|
| `node test/test-monolith.js` | 303/303 | **303/303** ✔ |
| `node test/test-chunking.js` | 21/21 | **21/21** ✔ |
| `node tools/secret-scan.js` | 0 | **0** ✔ |
| `node tools/anti-hardcoding-scan.js` | 0 | **0** ✔ |
| `node tools/build-manifest.js --verify` | 166 | **`{"ok":true,"files":166,"bad":[]}`** ✔ |
| `verifyFrozenLots()` | 0 divergence | **0** ✔ |
| MONO-11 v0.4 (suite propre) | — | **83/83** ✔ |

### Ce que testent réellement RA2-01…08 / RA1-01…03

Toutes exercent **réellement** le lot gelé (`RE.runEnforcedReview`) avec un LLM factice — pas de simulacre. **Mais** le harnais `viaAdapter` (l.37-40) appelle `runEnforcedReview({ targetDoc: doc })` **directement**, court-circuitant `autonomousRun.runDownstream` : il fixe `documentAuthority: () => doc.content`, donc **l'autorité est correcte par construction**. Aucun test ne vérifie que le câblage réel fournit le bon document. C'est le trou qui laisse passer B1.

### Revert-check (décisif)

| Retrait | Tests en échec | Détail |
|---|---|---|
| **correctif R-A2** (adaptateur v1.0.12 + R-A1 seul) | **296/303 — 7 échecs** | RA2-01, 02, 03, 05, 06, 07, 08 · **RA2-04 passe quand même → tautologique** |
| **correctif R-A1** (retrait de `faultyDimensions` + du retour anticipé) | **302/303 — 1 échec** | RA1-01 seule · **RA1-02 et RA1-03 passent quand même → non protectrices** |
| **mutation du câblage** `lib/pipeline.js:269` (index décalé **+** troncature à 20 car.) | **303/303 — 0 échec** | **aucun test ne protège le câblage** |

---

## 11. SONDES ADVERSARIALES INDÉPENDANTES (scratch)

| Sonde | Résultat v1.0.13 |
|---|---|
| marqueur exact dans `doc.content` | citation conservée, `complete` ✔ |
| plusieurs marqueurs | conservée, écart compté ✔ |
| ligne JSON après le marqueur | conservée, écart compté ✔ |
| autorité plus **courte** que le prompt | l'autorité fait foi ✔ |
| autorité plus **longue** que le prompt | l'autorité fait foi ✔ |
| autorité manquante | `DOCUMENT_AUTHORITY_REQUIRED`, `fatal`, run arrêté ✔ |
| autorité vide | `DOCUMENT_AUTHORITY_EMPTY`, `fatal`, run arrêté ✔ |
| empreinte d'autorité différente (registre) | refusée + tracée ✔ |
| entrée de registre périmée (sans empreinte / autre sceau / autre contrat) | refusée ✔ |
| `parseRepair` malformé | `REPAIR_UNPARSABLE` ×2, 0 registre, jamais `CANDIDATE_VALID` ✔ |
| original valide omis par le modèle | conservé par `mergeLiteralRefs` ✔ |
| refs valides + invalides mélangées | valide conservée, invalide écartée ✔ |
| **document normalisable (NBSP / `’` / CRLF), câblage réel** | **ÉCHEC — citation détruite, revue en `error` (B2)** |
| idem sous v1.0.12 | correct (`complete`, pass 1) — **régression confirmée** |

Comparatif global (mêmes sondes) : v1.0.13 **21 PASS / 0 FAIL**, v1.0.12 **12 PASS / 9 FAIL** — le contrat d'adaptateur est bien un progrès réel.

---

## 12. SHADOW A10 (hors ligne, lecture seule, 0 appel, 0 réseau)

Script indépendant ; comparaison `reviews.json` (run historique) ↔ `reviews-restored.json`.

| Mesure | Attendu | Mesuré |
|---|---|---|
| revues comparées | 18 | **18** |
| constats comparés | « 70 » | **180** (18 × 10) — voir R-N6 |
| citations **restaurées** | 12 | **12** ✔ (389 → 401 refs) |
| citations supprimées | 0 | **0** ✔ |
| constats historiquement vidés puis restaurés | 3 | **3** ✔ (DISC-07 / DISC-03 / DISC-06) |
| autres champs substantiels modifiés | 0 | **0** ✔ |
| citations ajoutées **non littérales** | 0 | **0** ✔ |
| stabilité sous `mergeLiteralRefs` de v1.0.13 | — | **0 anomalie** |

Hachages : `reviews.json` `2d87507b…` = `inputHashes` A10 ✔ · `reviews-restored.json` `e5e5daee…` = `outputHashes` A10 ✔ · `report.json` `44b0242b…`, `reportHash` interne `a962d5ee…` ✔ (conforme au mandat).
**Aucune écriture runtime, aucun réseau, aucun appel fournisseur.**

---

## 13. AGRÉGATION / RAPPORT

Comparaison hors ligne `report.json` (historique) ↔ `report-restored.json` :

| Contrôle | Résultat |
|---|---|
| `counts` | `{etabli:13, convergent:9, divergent:7, provisoire:0, nonEtabli:67, reservations:10}` — **identiques** ✔ **13 / 9 / 7 / 0 / 67 / 10** |
| `qualification` | **identique**, `QUALIFIED_WITH_RESERVATIONS` ✔ |
| `headline` (dont `SCIENTIFICALLY_USABLE`) | **identique octet pour octet**, `SCIENTIFICALLY_USABLE = "NO"` ✔ |
| `reservations` | 10 vs 10, **identiques** ✔ |
| `limits` | identiques ✔ |
| longueurs des listes d'énoncés | 13 / 9 / 7 / 0 / 67 — identiques ✔ |
| champs de rapport qui diffèrent | `generatedAt`, `statements`, `reportHash` uniquement |
| champs d'énoncé qui diffèrent | `etabli.targetEvidence`, `etabli.why`, `convergent.why`, `convergent.targetEvidence`, `divergent.branches`, `nonEtabli.why` — **tous porteurs de citations** |

**Aucune dérive sémantique.** 0 appel fournisseur.

---

## 14. RÉSERVES HÉRITÉES

| Réserve | État |
|---|---|
| **R3** (libellé passe 3 du lot gelé) | inchangée, **non bloquante** (lot gelé intact) |
| **R4** (`repairUnresolvedDimensions = []` sur réparation illisible) | **améliorée côté trace** par R-A1 (`REPAIR_UNPARSABLE`, `repairErrors`, `repairScope` = dimensions fautives du lot) ; le lot reste inchangé |
| **R12** (sévérité attendue plus forte en réel) | **non levée** — aucun smoke réel, et prématuré tant que B1 subsiste |
| **R13** (aucun zip canonique) | confirmée, **non bloquante avant gel** |
| **R-A3** (provenance du contrat dans `build-manifest.js`) | **non traitée** — observation confirmée l.16/18 |
| **R-A5** (annotation post-hash du shadow A10) | **non traitée** — observation confirmée (`88145afc…` déclaré, `9b41504d…` recalculé avec la clé `restoration`) |
| **R-A4** (tests non détectifs) | **non traitée et reproduite** sur les nouveaux tests : RA2-04, RA1-02, RA1-03 non protectrices ; câblage non testé |
| **R-A6** (`package.sh` régénère le manifeste) | confirmée — à décider explicitement au gel |
| Réserves propres de l'auteur | honnêtes sur R-A3 / R-A5 / zip / smoke ; **muettes** sur B1, B2, B3, B4 (R-N7) |

---

## 15. PRÉSERVATION GLOBALE DE LA LIGNÉE

### Réponse : `KNOWN_GAP_REMAINS`

Chemin connu subsistant, **prouvé** : *littéralisation* (et *réparation ciblée* miroir) opérant sur une autorité documentaire **différente du document réellement jugé par le lot** (normalisation MONO-11 non appliquée par le résolveur `documentAuthority`). Une référence littérale valide dans le document du lot y est classée non littérale, exclue de `validOriginal` par `mergeLiteralRefs`, donc **silencieusement supprimée** du candidat recomposé — et remplacée par un span brut que le lot rejettera. Voir §2.3.

Les deux autres chemins (littéralisation sur autorité correcte, réparation ciblée gelée v0.4) sont **fermés** et vérifiés (§5, §9).

**R11 / régénération informée** : hors du contrat monotone de réparation, comme attendu. Vérification effectuée : ni `lib/ef03b-resilience.js`, ni `README.md`, ni `config/monolith.config.json` ne qualifient la reprise informée (`INFORMED_REPAIR_V02`) de préservatrice de lignée — la seule mention est un commentaire de branche (`/* A — passe complete (BASE ou INFORMED) … */`). **Aucun étiquetage abusif.**

---

## CONTRAINTES RESPECTÉES

- **Lecture seule** partout hors des deux livrables. Empreinte sha256 récursive de `EvidenceForge-CLEAN-MONO-01-08` (4 101 fichiers) prise **avant** l'audit et re-comparée : `diff` = **0 ligne**.
- Toutes les suites, tous les reverts et toutes les sondes exécutés dans la copie `scratchpad/audit-v1013/tools/EvidenceForge/…` (disposition relative identique, kits `EF-01B-v0.2-r2` et `EF-01C1-v0.2-r2` inclus, zips MONO-* conservés).
- **0 appel fournisseur, 0 réseau** — aucun `doctor.sh` / `start.sh` / `setup.sh` / serveur exécuté ; `build-manifest.js` lu avant usage, invoqué uniquement en `--verify` (fonction `verify()` : lecture seule).
- **0 smoke réel, 0 commit**, `ACTIVE_VERSION` inchangée (`MONOLITH-v1.0.10`, relue).
- D103 (`jmmjs-p01-closure/`) et le run historique `efm-20260918-a64167c0` **non modifiés** (lecture seule ; hachages conformes).

## NOTE SUR LE MANIFESTE

Les deux livrables de cet audit (`EVIDENCEFORGE-v1.0.13-INDEPENDENT-FREEZE-AUDIT.md` / `.json`) sont écrits **après** la mesure du manifeste livré : ils sont donc **hors** des 166 fichiers de `MANIFEST.json` / `SHA256SUMS.txt`, par construction et de façon assumée. `verify()` (lu avant exécution) contrôle les fichiers **listés**, pas l'absence d'extras : `node tools/build-manifest.js --verify` reste **`{"ok":true,"files":166,"bad":[]}`** en leur présence. Les régénérer (`build-manifest.js` / `package.sh`) les incorporerait au manifeste — décision R-A6, à prendre explicitement au gel.

---

## CONCLUSION

Le correctif R-A2 est **conceptuellement juste, bien écrit et correctement testé au niveau de l'adaptateur** : la chaîne causale historique est réellement fermée, le fail-closed est authentique et fatal, le registre est correctement lié à l'empreinte documentaire, R-A1 est réel, R5 et R6 tiennent (24/24, 4/4).

Mais la moitié du correctif qui s'exécute en production — le résolveur `documentAuthority` de `lib/pipeline.js` — **désigne le mauvais document**, n'est couverte par **aucun test**, et fait **régresser** le produit par rapport à la version gelée v1.0.12 sur le seul corpus réel dont le projet dispose. Un gel, et *a fortiori* un smoke réel, propageraient cette régression.

**Correctif attendu (une ligne, à retester)** : faire rendre par `documentAuthority(targetId)` le contenu **normalisé** par `MONO-11/v0.4/core/target-normalizer.js` — c'est-à-dire exactement `TN.normalizeTargetDocument(target).document.content`, ou le `content` lu dans le `targetDocumentSet` que le lot construit — accompagné (i) d'un test **bout en bout par le vrai câblage** avec un document contenant `’`, NBSP et CRLF, et (ii) de l'ajout de `documentAuthoritySha256` dans `tools/ef03b-registry-import.js`.
