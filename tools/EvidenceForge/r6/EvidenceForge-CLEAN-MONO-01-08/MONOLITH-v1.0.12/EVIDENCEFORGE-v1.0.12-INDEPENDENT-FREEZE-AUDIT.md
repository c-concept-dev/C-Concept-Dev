# EVIDENCEFORGE MONOLITH v1.0.12 — AUDIT INDÉPENDANT AVANT GEL

**Auditeur** : agent indépendant, adversarial, **lecture seule** — aucun contexte préalable, aucune confiance accordée au rapport d'intégration de l'auteur.
**Audité le** : 2026-09-22
**Sujet** : `MONOLITH-v1.0.12` (CANDIDAT, construit, non gelé, non commité)
**Méthode** : état livré enregistré en lecture seule d'abord ; toute exécution faite dans une copie `rsync` de l'arbre `EvidenceForge-CLEAN-MONO-01-08` sous `/private/tmp/.../scratchpad/audit-v1012/` ; arbre livré re-vérifié octet pour octet à la fin.

---

## 1. VERDICT

### `V1_0_12_FREEZE_AUDIT_PASS_WITH_RESERVATIONS`

### RECOMMANDATION : **GELER**

Geler en `FROZEN_WITH_RESERVATIONS`, **sans activer** : `ACTIVE_VERSION` doit rester `MONOLITH-v1.0.10` jusqu'à un smoke réel mesurant R12. Les deux conditions d'intégration posées par l'audit indépendant v1.0.11 (R5, R6) sont **tenues et prouvées par exécution**. Les réserves listées ci-dessous sont soit préexistantes (v1.0.10 / v1.0.11 les portent à l'identique ou en pire), soit sans effet sur un artefact livré ; **aucune n'est une régression**. Refuser le gel laisserait actif un état strictement moins bon.

| Statut demandé | Valeur |
|---|---|
| R5 (parité adaptateur / lot) | **ADAPTER_MONO11_PARITY_PASS** — sous la précondition `st.ctx.content === doc.content` (voir R-A2) |
| R6 (contrat / registre / import) | **PASS** |
| Préservation globale de la lignée | **KNOWN_GAP_REMAINS** (brèche prouvée, **préexistante**, non introduite par v1.0.12) |
| CAS A / CAS B | `CAS_A_CORRECT` / `CAS_B_FAIL_CLOSED_CORRECT` |
| Contrainte lecture seule | respectée intégralement (preuves §12) |

---

## 2. BLOQUANTS

**Aucun (0).**

Aucun défaut constaté ne produit, dans un artefact livré (`reviews.json`, `aggregation.json`, `report.json`), une fausse acceptation, une perte silencieuse non préexistante, ou une régression par rapport à `MONOLITH-v1.0.10` / `v1.0.11`.

---

## 3. RÉSERVES

| Id | Sévérité | Résumé (une ligne) |
|---|---|---|
| **R-A1** | medium | La parité octet du candidat **tracé** ne tient pas sur les passes où `parseRepair` échoue côté lot (18 cas /48) : l'adaptateur ignore `rp.ok` et passe **toutes** les dimensions au lieu des seules fautives ; la trace EF-03B peut afficher `CANDIDATE_VALID` pour une passe que le lot gelé a **rejetée** (cas 25 prouvé). Aucune écriture au registre, aucune fausse acceptation. |
| **R-A2** | medium/high | Le miroir lit le document dans `st.ctx.content` (re-analysé depuis le texte du prompt) et non dans `doc.content` ; rien n'assure l'égalité. Si le corps d'un document cible contient le marqueur `BASE DOCUMENTAIRE DU PROFESSIONNEL`, `parseReviewPromptContext` rend un contenu **silencieusement tronqué** (aucun compteur, `contextUnparsed` reste 0) ⇒ le registre reçoit un candidat **amputé** marqué VALID, réutilisable à 0 appel. **Préexistant** (v1.0.11 amputait sans condition). |
| **R-A3** | low | `tools/build-manifest.js` l.15 annonce que le contrat de validation est « MESURE en chargeant le module » ; il est en réalité **déduit par expression régulière** sur la source de `lib/llm.js` puis relu dans la config. Écart entre la provenance annoncée et la provenance réelle (discipline « provenance mesurée »). |
| **R-A4** | low | 17 des 18 tests `V12-*` **ne détectent pas** un retour arrière de R5 : l'assistant `parity()` compare deux sorties produites toutes deux par le lot gelé, donc insensibles au miroir. Seul `V12-02` (assertion sur le candidat du registre) est décisif, avec `T-EF03B-34` (partiellement textuel). |
| **R-A5** | info | `report-restored.json` ne se vérifie pas sous le module de rapport gelé (calculé `ec0ef55a…` ≠ déclaré `88145afc…`) **uniquement** à cause d'une clé d'annotation `restoration` ajoutée après le hachage : en la retirant, `88145afc…` est reproduit exactement. Artefact A10, préexistant, hors périmètre v1.0.12. |
| **R3** (transportée) | medium | Libellé de passe 3 du lot gelé (l.245) : « elle REPRODUISAIT A L'IDENTIQUE la citation fautive » alors qu'en CAS B c'est v0.4 qui la re-présente (`applied = raw`). **Risque de comportement modèle**, pas cosmétique, non bloquant. |
| **R4** (transportée) | low | Un `parseRepair` illisible laisse `repairUnresolvedDimensions = []` ; l'échec reste néanmoins **explicite** (`repair.parsed=false` + `REPAIR_JSON_INVALID` dans `errorCodes` + `reviewStatus: error`). Aucun risque de fausse réussite ; traçabilité indirecte. |
| **R12** (transportée) | info | **EXPECTED_STRICTNESS** : plus d'échecs `reviewStatus error` attendus en réel (CAS B fail-closed). À mesurer en smoke réel avant activation. |
| **R13** (transportée) | low | Aucun zip canonique v1.0.12. **Non bloquant** : v1.0.11 a été gelée sans zip ; le zip relève de l'acte de gel (`tools/package.sh`, présent et à la bonne version). |
| **R-A6** | low | `tools/package.sh` appelle `node tools/build-manifest.js` : l'exécuter au gel **régénérera** `MANIFEST.json` / `SHA256SUMS.txt` et y **inclura** les présents rapports d'audit. Décision à prendre explicitement (le lot MONO-11 v0.4 a choisi D2 = ne pas re-sceller pour les rapports d'audit). |

---

## 4. §1 — INTÉGRITÉ ET DIFF v1.0.11 → v1.0.12

### 4.1 État livré enregistré AVANT toute exécution

| Élément | Valeur |
|---|---|
| `node tools/build-manifest.js --verify` (arbre livré) | `{"ok":true,"files":158,"bad":[]}` |
| `MANIFEST.json` | `d8bb0d3e7c28a6cc419333432e32193534d85c1bf593e267bf97cce88f4f5c6f` |
| `SHA256SUMS.txt` | `3c1c736fd19bb1a79626b4908ff9438523b26625fe997f8358c9dbb75c80aa6d` |
| `test/results.json` | `4ff7dc2080f2feb3d18d138e4318db330c821c95008ce37c3d1b0894e1dae902` (292/292/0, `2026-09-22T12:17:48.572Z`) |
| `MANIFEST.contentHash` | `9552b45e484cf2e3cdc4f7ef08e275cd1de117055e2643ac854e7a196178f3e2` |
| Recensement complet | 162 fichiers sur disque (`DELIVERED-v1012.sha256`) |

`MANIFEST.contentHash` **recalculé** par mes soins : `9552b45e…` — identique. `fileCount` 158 = `files.length` 158 = lignes de `SHA256SUMS.txt` 158. Les 158 fichiers listés vérifiés un par un (sha256 **et** taille) : tous conformes.

**Lecture de `verify()`** (`tools/build-manifest.js`, dernière ligne) : elle parcourt les lignes de `SHA256SUMS.txt` et vérifie existence + hash. Elle **ne contrôle pas l'absence de fichiers supplémentaires**. L'ajout des présents livrables ne peut donc pas faire échouer `--verify` — confirmé par exécution après écriture (§12).

### 4.2 Fichiers présents hors MANIFEST (4)

`MANIFEST.json`, `SHA256SUMS.txt` (exclus par construction), plus `EVIDENCEFORGE-v1.0.12-INTEGRATION-REPORT.md` / `.json` (écrits à 14:20, après le manifeste de 14:18). **Même discipline que v1.0.11 et que le lot MONO-11 v0.4** (décision D2 : les rapports de gouvernance restent hors sceau). Les deux présents livrables suivent la même règle et sont donc, eux aussi, absents du MANIFEST à 158 fichiers.

**Aucun fichier parasite** : aucun `.DS_Store`, aucune sauvegarde, aucun reliquat non scellé, aucune sortie de test égarée.

### 4.3 Diff exhaustif (`diff -rq` + `diff -u` fichier par fichier)

| Fichier | sha256 v1.0.11 | sha256 v1.0.12 | Nature | Annoncé ? |
|---|---|---|---|---|
| `config/monolith.config.json` | `2451b2a5…` | `a34cc964…` | MONO-11 `v0.3-r1`→`v0.4`, zip `3c44b397…`→`79c16d08…`, **ajout** `contractVersion: "MONO-11-v3"`, version produit, `$comment` | oui |
| `lib/ef03b-resilience.js` | `18739b7a…` | `564a0e3d…` | **R5** : `mergeRepairLineage` avant `recompose` (l.195) + trace `lineage`/`repairUnresolvedDimensions` ; **R6** : `CONTRACT` lu dans la config (l.183) ; `schemaVersion` du registre | oui |
| `lib/llm.js` | `b9d1c479…` | `34816352…` | **R6** : `VALIDATION_CONTRACT` lu dans la config (l.70) | oui |
| `lib/pipeline.js` | `7e2d718b…` | `204862cc…` | **1 seule ligne** : `schemaVersion` de `ef03b-resilience.json` `v1.0.11`→`v1.0.12` | cosmétique, sans effet runtime |
| `tools/build-manifest.js` | `8c9a6469…` | `af1f086c…` | provenance, prédécesseur, mesure du contrat (voir **R-A3**) | oui |
| `tools/ef03b-autopsy.js` | `00e244af…` | `bb310c6a…` | **1 seule ligne** : `schemaVersion` du replay | cosmétique |
| `tools/ef03b-registry-import.js` | `3a670853…` | `c6d694ac…` | **R6** : `CONTRACT` config, fail-closed sceau + contrat, `mergeRepairLineage` dans la reconstruction historique | oui |
| `tools/package.sh` | `5bb461bb…` | `93400b4f…` | nom du zip `v1.0.11`→`v1.0.12` | trivial |
| `README.md`, `MANIFEST.json`, `SHA256SUMS.txt`, `test/results*.json` | — | — | régénérés | oui |
| `test/*.js` (8 fichiers) + `test/test-v1012-lineage-parity.js` (**nouveau**) | — | — | 18 tests ajoutés, 7 libellés ajustés | oui |
| **Ajoutés** | — | — | `EVIDENCEFORGE-v1.0.12-INTEGRATION-REPORT.md` / `.json` | oui |

**Aucun autre changement runtime.** `server.js`, `index.html`, `worker/`, `vendor/`, `governance/`, `fixtures/`, `lib/llm-stream.js`, `lib/live-status.js`, `lib/cost-view.js`, `lib/stage-professionals.js`, `lib/stage-report.js`, `lib/panel-sufficiency.js`, `lib/economic-panel.js`, `lib/run-store.js`, `lib/paths.js` : **absents du `diff -rq`**, donc octet pour octet identiques à v1.0.11. L'affirmation correspondante du rapport d'intégration (l.59) est **vérifiée**.

Deux changements **non mentionnés** dans le tableau de changements de l'auteur : `lib/pipeline.js` et `tools/ef03b-autopsy.js`. Inspection : **une ligne chacun**, strictement le libellé `schemaVersion`. Sans effet sur le comportement. Signalé pour exhaustivité, pas comme défaut.

### 4.4 Intégration MONO-11 v0.4 — exacte

Hachage indépendant du lot sur disque, ligne à ligne de son `SHA256SUMS.txt` :

| Contrôle | Mesuré | FREEZE RECORD | Config v1.0.12 | MANIFEST |
|---|---|---|---|---|
| fichiers scellés | **55**, 0 divergence | 55 | — | 55 |
| sceau (`SHA256SUMS.txt`) | `110db4de24709926d4a5fb6d0e951530f0afc2c1c807a09127852a92aa182c3d` | idem | — | idem |
| `runCodeHash` | `27610c8450…` (par `loadSealedMono11`) | idem | — | idem |
| zip canonique | `79c16d08a0a52bc1b9ae3c6884cc22f6161145bed18158d6c9b6a44df1a7c474` | idem | idem | idem |
| `review-enforcer.js` | `cd620ab30ca1fbe863987dee6711b358930721d57c1b7d086c7bab87d985636a` | idem | — | — |
| `contracts/mono11-contracts.json` | `b3e5ac7dc3a7a70deef015b1f26b93d173cf79e83c9644c4d37f65059d2c75d2` | idem | — | — |
| `contractVersion` | `MONO-11-v3` (lu dans le contrat du lot) | idem | idem | idem |
| `dir` / `version` | `MONO-11/v0.4` / `v0.4` | — | idem | idem |

Fichiers hors sceau sous `v0.4` : exactement `MANIFEST.json` + les deux rapports d'audit indépendant — conforme à la décision D2 du lot.

### 4.5 Lots composés intacts

`P.verifyFrozenLots()` exécuté dans la copie :

| Lot | vérifié | fichiers | divergences | sceau |
|---|---|---|---|---|
| MONO-01 | true | 106 | **0** | `4ba8903ceaeb…` |
| MONO-09 | true | 9 | **0** | `f1f1e94bdcca…` |
| MONO-10 | true | 79 | **0** | `e050af0545ab…` (zip `f5a4165414f4…`) |
| MONO-11 | true | 55 | **0** | `110db4de2470…` (zip `79c16d08a0a5…`) |

---

## 5. §2 — R5 : PARITÉ ADAPTATEUR / LOT (CRITIQUE)

### 5.1 Lecture du code

**Lot gelé** (`MONO-11/v0.4/core/review-enforcer.js`, `runEnforcedReview` l.344-347) :
```
const rp = parseRepair(raw, targeted.dims);              // dims = faultyDimensions(errors)
if (rp.ok) { const mg = mergeRepairLineage(parsed, rp.repairs, doc.content);
             candidateText = JSON.stringify(recompose(parsed, mg.applied)); }
else       { v = { ok:false, errors: <erreurs précédentes>, parsed }; candidateText = raw; }
```

**Adaptateur v1.0.12** (`MONOLITH-v1.0.12/lib/ef03b-resilience.js` l.194-196) :
```
const rp = RE.parseRepair(r.text, Object.keys(<TOUTES les dimensionId de st.parsed>));
const mg = RE.mergeRepairLineage(st.parsed, rp.repairs || {}, st.ctx.content);
const cand = JSON.stringify(RE.recompose(st.parsed, mg.applied));
```

Trois écarts structurels subsistent : (a) l'adaptateur passe **toutes** les dimensions à `parseRepair`, le lot les seules **fautives** ; (b) l'adaptateur **ignore `rp.ok`** ; (c) l'adaptateur lit le contenu dans `st.ctx.content`, le lot dans `doc.content`.

**Écriture au registre** : `onValidation` (l.226) écrit `st.candidates[v.callId]` — le candidat **du miroir** — lorsque le **lot** déclare `valid === true`. C'est donc bien « verdict du lot × octets du miroir » : le point exact visé par R5.

### 5.2 Matrice indépendante — 48 combinaisons BRUT × RÉPARATION

Harnais écrit par mes soins (scratch), exécutant **réellement** `RE.runEnforcedReview` du lot gelé **deux fois** par cas : avec adaptateur branché, et lot seul. Comparés : `reviewStatus`, `acceptedPass`, `targetEvidenceRefs` par dimension, `responseSha256` de chaque passe du lot, et **sha256 du candidat inscrit au registre vs sha256 du candidat accepté par le lot**.

Couverture : brut vide, tout valide, tout invalide, mixte, doublons dans le brut, doublons dans la réparation, réparation sous-ensemble, sur-ensemble, non littérale, vide, blancs seuls, entrées non-chaîne, `null`, références sous-chaînes l'une de l'autre (dans les deux sens), multi-dimensions (1/2/3), réparation partielle, dimension non fautive, dimension inconnue, et 15 réparations malformées (JSON invalide, mauvais schéma, clés en trop, dimension manquante, `targetEvidenceRefs` non tableau, racine tableau, objet vide, `repairs` vide, entrée `null`, revue complète à la place, JSON tronqué, prose + JSON, `dimensionId` non-chaîne, `repairs` imbriqué, texte vide), plus 3 bruts malformés.

| Critère | Résultat |
|---|---|
| Cas exécutés | **48** |
| `reviewStatus` identique | **48/48** |
| `acceptedPass` identique | **48/48** |
| `targetEvidenceRefs` par dimension identiques | **48/48** |
| `responseSha256` de **toutes** les passes du lot identiques | **48/48** |
| Écritures au registre | **25** |
| **Candidat du registre == candidat accepté par le lot, octet pour octet** | **25/25** |
| **MISMATCHES sur les critères R5** | **0** |

`VALID_ORIGINAL ⊆ FINAL`, `FINAL ⊆ VALID_ORIGINAL ∪ VALID_REPAIR`, même état de réparation, même CAS A, même CAS B, même ordre, même déduplication, même fail-closed, **même candidat inscrit au registre** : tenus sur l'ensemble de la matrice.

### 5.3 Résidu mesuré (R-A1)

Sur **18 cas /48**, le candidat **tracé** par le miroir diffère octet pour octet de celui que le lot construit. Tous sont des cas où `rp.ok === false` côté lot (échec de `parseRepair`, clé en trop, dimension non fautive, dimension manquante) : le lot ne recompose pas (candidat = texte brut du modèle) tandis que le miroir recompose avec `rp.repairs || {}`. **Les 18 finissent en `reviewStatus: error`, registre vide.**

Cas 25 (réparation nommant une dimension **non fautive**, références littérales) — le plus parlant :

| | passe 2 | passe 3 |
|---|---|---|
| MIROIR (trace EF-03B) | `state: CANDIDATE_VALID`, cand `116ca3674a…` | `CANDIDATE_VALID`, `116ca3674a…` |
| LOT (trace du lot) | `valid: false`, `REPAIR_SCHEMA_INVALID`, resp `5db08dbc38…` | idem |

La trace EF-03B annonce donc `CANDIDATE_VALID` pour une passe que le validateur gelé a rejetée. **Conséquence bornée** : observabilité trompeuse, aucun effet sur `reviews.json`, aucune écriture au registre, revue en erreur. → réserve R-A1, pas un bloquant.

La formulation du rapport d'intégration « le candidat **tracé** / inscrit au registre est byte-identique à celui que le lot valide » est donc **exacte pour « inscrit au registre » et trop large pour « tracé »**.

### 5.4 Classification R5

**`ADAPTER_MONO11_PARITY_PASS`**, sous la précondition explicite `st.ctx.content === doc.content` (voir §7 / R-A2), avec la réserve R-A1 sur la fidélité de la trace des passes rejetées.

---

## 6. §3 — R6 : CONTRAT / REGISTRE / IMPORT

### 6.1 Provenance du contrat — prouvée à l'exécution

Lecture du code : `lib/llm.js` l.70, `lib/ef03b-resilience.js` l.183, `tools/ef03b-registry-import.js` l.16 lisent tous `P.CONFIG.frozenLots["MONO-11"].contractVersion`. Aucun épinglage `"MONO-11-v2"` normatif ne subsiste dans `lib/` ni `tools/` (vérifié par expression régulière sur les trois sources).

**Preuve d'exécution** : copie `MONOLITH-PROBE` créée dans la copie de travail, avec `contractVersion` forcé à `AUDIT-PROBE-v9` (aucun fichier livré modifié). Une revue réelle passée à travers l'adaptateur :

| Racine | `config.contractVersion` | Contrat **inscrit** au registre par l'adaptateur |
|---|---|---|
| `MONOLITH-v1.0.12` | `MONO-11-v3` | **`MONO-11-v3`** |
| `MONOLITH-PROBE` | `AUDIT-PROBE-v9` | **`AUDIT-PROBE-v9`** |

La constante **suit la configuration** : R6 tenue, pas seulement déclarée.

### 6.2 Les quatre cas d'admissibilité — REGISTRE (`createReviewRegistry.find`, exercé par l'adaptateur)

| Cas | `registryReuses` | appels réels | Résultat |
|---|---|---|---|
| ancien sceau (`9fbef412…`) + `MONO-11-v3` | 0 | 1 | **REFUSÉ** |
| nouveau sceau (`110db4de…`) + `MONO-11-v2` | 0 | 1 | **REFUSÉ** |
| ancien sceau + `MONO-11-v2` | 0 | 1 | **REFUSÉ** |
| **nouveau sceau + contrat courant** | **1** | **0** | **ADMIS** |

Résultat identique sous `MONOLITH-PROBE` (contrat `AUDIT-PROBE-v9`) : la règle est bien paramétrée par la config, pas par une constante.

### 6.3 Les quatre cas — CACHE LLM (`reuseContextCheck`, `lib/llm.js` l.71-81)

Lecture : refus explicite et fail-closed sur `validationStatus ≠ VALID`, `providerId` différent, `modelId` différent, **`validationContract ≠ VALIDATION_CONTRACT`** (l.76), **`sourceSealHash ≠ opts.sealHash`** (l.77), corps de cache absent, corps de cache altéré. `sealHash` est bien injecté par `lib/pipeline.js` l.120/129 depuis `loadSealedMono11()`. Seul (nouveau sceau + contrat courant) est admissible. Confirmé par le retour arrière (§9.2) : épingler `VALIDATION_CONTRACT` à `MONO-11-v2` fait échouer `X7`, `V1`, `V2`, `V8`, `RUN-SAFETY-21`, `T-STREAM-05`, `V12-09`.

### 6.4 Import hors ligne (`tools/ef03b-registry-import.js`)

- `REGISTRY_IMPORT_SEAL_MISMATCH` levé si `state.seal.runtimeSealSha256 ≠ SEAL.runtimeSealSha256` — **aucune migration, aucun import silencieux**.
- `REGISTRY_IMPORT_CONTRACT_MISMATCH` levé si une entrée du registre porte un autre contrat **ou** un autre sceau.
- Entrées écrites avec `validationContract: CONTRACT` (config), plus d'épinglage.
- **Reconstruction historique** : `RE.recompose(parsed, RE.mergeRepairLineage(parsed, rp.repairs || {}, doc.content).applied)` — l'ancien `recompose` nu a bien disparu (vérifié : `recompose(parsed, rp.repairs` absent du fichier).

**Aucune réutilisation d'artefact v1.0.10 / v1.0.11 sous v1.0.12** : les sceaux diffèrent (`9fbef412…` vs `110db4de…`) et tous les points de réutilisation (registre, cache, checkpoint) comparent le sceau.

### 6.5 Statut R6

**PASS.**

---

## 7. §4 — PRÉSERVATION GLOBALE DE LA LIGNÉE

### Réponse : `KNOWN_GAP_REMAINS`

| Chemin | Verdict | Preuve |
|---|---|---|
| **A — littéralisation (bloc G)** | **SÛR** | `preserveLineageRepairs` / `mergeLiteralRefs` inchangés depuis v1.0.11 ; bloc G non touché par v1.0.12 (diff) ; shadow A10 restaure 12/12 (§8). |
| **B — réparation ciblée (lot + miroir)** | **SÛR sous précondition** | 48/48 en parité, 25/25 au registre (§5). Précondition : `st.ctx.content === doc.content`. |
| **C — import de registre** | **SÛR** | fail-closed sceau + contrat ; reconstruction via `mergeRepairLineage` (§6.4). |
| **D — replay / réutilisation (registre, cache)** | **BRÈCHE** | voir ci-dessous. |
| **E — régénération informée** | **CORRECTEMENT ÉTIQUETÉE** | stratégie distincte `INFORMED_REPAIR_V02` ; `preservedRefs = null`, `repairUnresolvedDimensions = []` sur ce chemin ; le rapport d'intégration (l.212) déclare explicitement « aucune garantie de lignée revendiquée ». **N'est pas présentée comme une réparation préservant la lignée.** Conforme à R11. |

### 7.1 Chemin D — brèche prouvée (R-A2)

Le miroir alimente `RE.mergeRepairLineage` avec `st.ctx.content`, contenu **ré-analysé depuis le texte du prompt** par `parseReviewPromptContext` (l.69-76), et non avec `doc.content`. Le parseur découpe le contenu entre l'en-tête `DOCUMENT CIBLE RÉEL (targetId=` et la **première** occurrence de `\n\nBASE DOCUMENTAIRE DU PROFESSIONNEL`. Si le **corps du document cible** contient ce marqueur, le contenu rendu est **tronqué** — et si la ligne suivante est analysable en JSON, le parseur rend un contexte **non nul**, donc `contextUnparsed` reste **0** : rien ne signale la troncature.

**Chaîne causale mesurée** (document de 183 octets, marqueur + une ligne JSON) :

| Étape | Mesure |
|---|---|
| `ctx.content` vs `doc.content` | **23 octets vs 183** — tronqué, `ctx ≠ null`, `contextUnparsed = 0` |
| Citation littérale placée après le marqueur | littérale pour le **LOT** : `true` ; pour le **MIROIR** : `false` |
| Tentative 1 — revue livrée par le lot | `complete`, passe 2, refs = `[<citation>, "Debut reel du document."]` ✔ |
| Tentative 1 — candidat inscrit au registre | refs = `["Debut reel du document."]` ✘ **amputé**, `status: VALID`, contrat `MONO-11-v3`, sceau courant |
| sha registre vs sha accepté par le lot | **différents** |
| Tentative 2 (replay, tout appel fournisseur interdit) | `registryReuses = 1`, `realCalls = 0` |
| Tentative 2 — revue livrée | `complete`, passe 1, refs = `["Debut reel du document."]` — **CITATION PERDUE, SILENCIEUSEMENT** |

**Qualification honnête** :
- Le déclencheur est **peu probable mais réel** : l'amputation du registre (tentative 1) ne demande que le marqueur suivi, deux lignes plus loin, d'une ligne analysable en JSON (une année isolée, `null`, `[]`, une chaîne entre guillemets suffisent). La réutilisation silencieuse (tentative 2) exige en plus que le JSON porte les vrais `worksUsed` — nettement plus artificiel.
- **Ce n'est PAS une régression de v1.0.12** : sous v1.0.11 le miroir appliquait `recompose(st.parsed, rp.repairs)`, donc l'amputation était **inconditionnelle**, pas seulement en cas de collision. v1.0.12 **réduit** la brèche sans la refermer.
- **Correctif naturel** (hors périmètre du gel) : faire porter `doc.content` jusqu'au miroir, ou asserter `st.ctx.content === doc.content` et compter l'écart.

La revendication « GLOBAL LINEAGE PRESERVATION sur les deux chemins connus » du rapport d'intégration est donc **vraie pour le chemin nominal et trop forte prise au pied de la lettre** : elle repose sur une précondition d'analyse de prompt ni asserrée ni mesurée.

---

## 8. §5 — CAS A / CAS B DANS LE MONOLITHE INTÉGRÉ

| Scénario | Attendu | Mesuré (miroir **et** lot) |
|---|---|---|
| `raw = []` (1 dim, puis 3 dims) | `NO_REFS_EXPECTED` → `[]`, aucune réparation déclenchée | `complete`, passe **1**, refs `[]` — cas 01, 28 ✔ |
| `raw ≠ []`, aucune originale valide, aucune réparation valide | `REFS_PRESENT_BUT_UNRESOLVED` → fail-closed | `error`, 3 passes, registre **vide** — cas 04, 12, 23, 29 ✔ |
| brut invalide seul | fail-closed ou réparé | cas 03 (réparé), 04 (fail-closed) ✔ |
| valide + invalide | la valide survit | cas 05, 06, 07, 21, 24, 27 ✔ |
| le modèle omet la valide | la valide survit quand même | cas 06 : `[VA, VC]` des deux côtés ✔ |
| réparation non littérale | écartée, la conservée reste | cas 11, 12, 13, 14, 20 ✔ |
| `parseRepair` en échec (JSON malformé, mauvais schéma, clés en trop, dimension manquante) | jamais une réussite | cas 31-45 : **15/15 en `error`**, registre vide ✔ |
| 3ᵉ passe | fail-closed borné, jamais de 4ᵉ | `passes = 3` puis `error` sur tous les cas d'échec ✔ |

**Aucun `[]` faussement réussi sur les 48 cas. Jamais de fausse réussite.**

### 8.1 Inspection de R4

Mesure sur le cas 31 (`parseRepair` échoue, JSON malformé) :

| Source | Contenu |
|---|---|
| Lot, passe 2 | `valid: false`, `repair.parsed: false`, `errorCodes: ["TARGET_REF_NOT_LITERAL","REPAIR_JSON_INVALID"]`, `repairUnresolvedDimensions: []` |
| Miroir, trace | `state: CANDIDATE_INVALID` puis `REJECTED_BY_ENFORCER` portant `REPAIR_JSON_INVALID` |
| Revue finale | `reviewStatus: error` |

**L'échec reste explicite** : il est porté par `repair.parsed = false` **et** par le code `REPAIR_JSON_INVALID` dans `errorCodes`, aux deux niveaux de trace, et la revue échoue. `repairUnresolvedDimensions = []` est une **absence** (le champ n'est pas renseigné faute de fusion), non une affirmation de résolution : elle est ambiguë pour un lecteur automatique qui ne croiserait que ce champ, mais ne peut pas produire une fausse réussite. **R4 = réserve de traçabilité, aucun risque de fausse réussite.**

---

## 9. §8 — TESTS LIVRÉS, DIFF D'IDENTIFIANTS, RETOUR ARRIÈRE

### 9.1 Mesures vs annoncé

| Contrôle | Annoncé | Mesuré (dans la copie) | Verdict |
|---|---|---|---|
| `node test/test-monolith.js` | 292/292 | **292/292** | ✔ |
| `node test/test-chunking.js` | 21/21 | **21/21** | ✔ |
| `node tools/secret-scan.js` | 0 | **0 hit** (162 fichiers) | ✔ |
| `node tools/anti-hardcoding-scan.js` | 0 | **0 hit** (75 fichiers, 0 jeton de cas) | ✔ |
| `node tools/build-manifest.js --verify` | 158 fichiers | **`{"ok":true,"files":158,"bad":[]}`** | ✔ |
| `verifyFrozenLots` | 0 divergence | **0 sur les 4 lots** | ✔ |

*Note de méthode* : au premier passage, `NONREG-01` a échoué (291/292). Diagnostic : le test exige la présence des kits opérateur `EF-01B-v0.2-r2` / `EF-01C1-v0.2-r2`, qui vivent **hors du bundle** (`tools/EvidenceForge/`) et que mon `rsync` initial n'avait pas repris. Après copie des kits à la position relative équivalente : **292/292**. Ce n'est pas un défaut du candidat ; c'est une **dépendance d'environnement hors paquet** du test, qui mérite d'être connue (le paquet n'est pas auto-suffisant pour sa propre suite).

### 9.2 Diff des identifiants de test v1.0.11 → v1.0.12

- **Ajoutés : 18** — `V12-01` … `V12-18`.
- **Retirés : 0.**
- **Libellés ajustés : 7** — `I3`, `L5`, `V1`, `V8`, `NONREG-01`, `RUN-SAFETY-21`, `T-EF03B-34` : tous des mises à jour `v0.3-r1 → v0.4` / `MONO-11-v2 → v3` / `52 → 55 fichiers`.
- **Aucun test affaibli.** `RUN-SAFETY-21` a été **renforcé** : il rejoue désormais le magasin sous le contrat courant *et* ajoute l'assertion que les mêmes entrées sous `MONO-11-v2` sont **refusées**.
- Échecs : 0 en v1.0.11 (274/274), 0 en v1.0.12 (292/292).

### 9.3 Les 18 tests `V12-*` testent-ils ce qu'ils annoncent ?

Lecture intégrale de `test/test-v1012-lineage-parity.js` (163 lignes). L'ossature est **saine** : le lot gelé (`RE.runEnforcedReview`) et le parseur EF-03B gelé sont **réellement exécutés**, avec un LLM factice scripté ; aucun réseau, aucun fournisseur. Ce ne sont pas des assertions sur du texte source (sauf `V12-09`, `V12-18`, partiellement, qui inspectent légitimement l'absence d'épinglage).

**Mais** — et c'est le constat adversarial central (**R-A4**) — l'assistant `parity()` compare `reviewStatus`, `acceptedPass` et les `targetEvidenceRefs` de la **revue livrée**. Or dans les deux branches la revue livrée est produite par le **même lot gelé** : elle est donc insensible à ce que fait le miroir. Ces tests sont, du point de vue de R5, **largement tautologiques**. Le seul test réellement décisif est `V12-02`, qui assertionne sur `A.registry[0].candidate`.

### 9.4 Retour arrière (RÉVERT) — le contrôle décisif

Chaque correctif a été **annulé dans ma copie** (`REVERT/`), puis la suite relancée :

| Retour arrière appliqué | Tests en échec | Verdict |
|---|---|---|
| **R5** : `recompose(st.parsed, mg.applied)` → `recompose(st.parsed, rp.repairs \|\| {})` | **2** : `T-EF03B-34`, **`V12-02`** → 290/292 | **détecté** |
| **R6a** : `lib/llm.js` `VALIDATION_CONTRACT = "MONO-11-v2"` en dur | **7** : `X7`, `V1`, `V2`, `V8`, `RUN-SAFETY-21`, `T-STREAM-05`, `V12-09` → 285/292 | **détecté** |
| **R6b** : adaptateur `CONTRACT = "MONO-11-v2"` en dur | **4** : `T-EF03B-08`, `T-EF03B-11`, `T-EF03B-12`, `V12-09` → 288/292 | **détecté** |
| **R6c** : import — suppression du fail-closed sceau/contrat + `recompose` nu | **1** : `V12-11` → 291/292 | **détecté** |

**Conclusion du révert** : aucun correctif n'est « décoratif » — chacun est protégé par au moins un test qui échoue s'il est annulé. Mais **17 des 18 tests `V12-*` passent toujours avec R5 annulé** : la couverture de R5 tient à **un seul** test comportemental (`V12-02`). C'est mince pour une condition d'intégration de sévérité `high_at_integration`. Recommandation (non bloquante) : ajouter à `parity()` une comparaison systématique `sha(registre) == sha(candidat accepté par le lot)`, comme dans mon harnais.

---

## 10. §6 — SHADOW A10 (REJEU HORS LIGNE, LECTURE SEULE)

Script de rejeu **écrit par mes soins** (je n'ai pas seulement relancé `V12-13`), exécuté sous les modules de v1.0.12 :

| Contrôle | Attendu | Mesuré |
|---|---|---|
| constats comparés | 70 | **70** ✔ |
| citations restaurées | 12 | **12** ✔ |
| constats historiquement vidés puis restaurés | 3 | **3** ✔ |
| écarts vs `reviews-restored.json` | 0 | **0** ✔ |
| autres champs substantiels modifiés (`disposition`, `epistemicStatus`, `finding`, `rationale`, `twinBasisWorkRefs`, `confidenceQualitative`, `limitations`, `dimensionId`) | 0 | **0** ✔ |
| écriture dans le répertoire du run (mtime + taille, récursif) | aucune | **aucune** ✔ |
| appels réseau / fournisseur | 0 | **0** ✔ |

Empreinte complète du run (1493 fichiers) prise **avant** et **après** l'ensemble de l'audit : `diff` = **0 ligne** sur les sha256 **et** sur les mtimes.

---

## 11. §7 — AGRÉGATION / RAPPORT DEPUIS LE SHADOW RESTAURÉ

| Contrôle | Historique | Restauré | Verdict |
|---|---|---|---|
| `counts` | `{etabli:13, convergent:9, divergent:7, provisoire:0, nonEtabli:67, reservations:10}` | **identiques** | ✔ **13 / 9 / 7 / 0 / 67 / 10** |
| `PROCESS_QUALIFICATION` | `QUALIFIED_WITH_RESERVATIONS` | idem | ✔ |
| `SCIENTIFICALLY_USABLE` | `NO` | idem | ✔ |
| `headline` complet (règle, inputs, warning) | — | **octet pour octet identique** | ✔ |
| `reservations` | 10 | **10, identiques (`JSON.stringify` égal)** | ✔ |
| longueurs des listes d'énoncés | 13 / 9 / 7 / 0 / 67 | **identiques** | ✔ |
| agrégats | 10 | 10 ; **nombre de convergences inchangé pour les 10** | ✔ |
| champs d'agrégat qui diffèrent | — | **`targetEvidenceRefs`, `convergences`** (et dans `convergences`, uniquement `targetEvidenceRefs`) | lignée seule ✔ |
| champs d'énoncé qui diffèrent | — | **`targetEvidence`, `why`, `branches`** — tous porteurs de citations | lignée seule ✔ |
| `divergences`, `notDeterminable`, `evidenceGaps`, `epistemicProfile`, `independentTwinCount`, `contributingReviewRefs`, `allFindingIds` | — | **identiques** | ✔ |
| `runBinding` | présent | **absent** du restauré | attendu : attestation de run non reproductible hors ligne, non substantielle |

**Conclusion** : la lignée est **enrichie**, la **substance est identique**. Aucun changement de disposition, d'agrégation, de compte, de qualification ni de réserve. Aucun appel fournisseur.

### 11.1 Hachages de rapport recalculés

| Artefact | `reportHash` déclaré | Recalculé par `lib/stage-report.js` de v1.0.12 | Verdict |
|---|---|---|---|
| `h1-v105-runs/efm-20260918-a64167c0/report.json` | `a962d5eefeb033ac4dd9f76627989a72d423737f3ca13cd2e4e65730de7a441c` | **`a962d5ee…` — identique** | ✔ le module de rapport de v1.0.12 est **compatible hachage** avec le run historique |
| `a10-lineage-restoration/report-restored.json` | `88145afc76b05abf48a3e328e42c437e0b50496414752a378e7f632bdf3937af` | `ec0ef55a60c1…` brut / **`88145afc…` après retrait de la clé `restoration`** | ✔ sous réserve **R-A5** |

`lib/stage-report.js` est **octet pour octet identique** en v1.0.10, v1.0.11 et v1.0.12 (`0e67295b…`) : l'écart de R-A5 est donc **préexistant et étranger à v1.0.12**. Diagnostic exact : `report-restored.json` porte une clé supplémentaire `restoration`, ajoutée par l'outillage A10 **après** le calcul du hash et absente de `HASH_EXCLUDED` ; en la retirant, `88145afc…` est reproduit au bit près. Le fichier lui-même est intact (sha256 `398dcc3c…`, conforme à son `SHA256SUMS.txt`).

---

## 12. §10 — RÉSERVES R3 / R4 / R12 / R13

**R3 — libellé de passe 3.** Localisé : `MONO-11/v0.4/core/review-enforcer.js` **l.245**, dans le **lot gelé** — v1.0.12 ne peut pas le corriger et ne doit pas le tenter. En CAS B, `applied = raw` re-présente la citation fautive ; si `exactRepeat` s'arme, le prompt accuse le modèle d'avoir « REPRODUIT A L'IDENTIQUE » une citation que **v0.4** a re-présentée. **Classification : risque de comportement modèle — ni cosmétique, ni bloquant.** Atténuation mesurée : une citation inventée sous cette pression est **non littérale**, donc refusée par le validateur gelé, et la politique bornée à 3 passes échoue en fail-closed (vérifié, cas 04/12/23). Le pire cas est une passe perdue de plus, **jamais une fausse acceptation**. À corriger dans un futur lot MONO-11, pas ici.

**R4 — traçabilité d'un `parseRepair` illisible.** Voir §8.1. **Échec explicite, jamais une réussite** ; traçabilité **indirecte mais réelle** (`repair.parsed=false` + `REPAIR_JSON_INVALID` + `reviewStatus: error`). Le seul défaut est l'ambiguïté du champ `repairUnresolvedDimensions = []`, qui signifie ici « non renseigné » et non « rien d'irrésolu ». **Aucun risque de fausse réussite.**

**R12 — CAS B fail-closed.** **`EXPECTED_STRICTNESS`.** Le changement est voulu (décision Q6 du lot) et mesuré : une revue que v0.3-r1 acceptait (CAS B avec réparation `[]` ⇒ `[]` silencieux) échoue désormais. J'ai reproduit ce comportement (cas 04, 12) : la revue part en `error`, aucun candidat partiel n'est accepté, le registre reste vide. C'est un **durcissement correct**, pas une régression : l'ancien comportement livrait un `[]` faussement réussi. Conséquence opérationnelle réelle : **davantage de `reviewStatus: error` en run réel**. → à mesurer en smoke réel **avant activation**, ce qui justifie de maintenir `ACTIVE_VERSION = MONOLITH-v1.0.10`.

**R13 — zip canonique.** **Non bloquant.** Constat du dépôt : v1.0 à v1.0.10 portent chacune leur zip ; **v1.0.11 a été gelée SANS zip** (son `FREEZE-RECORD.json` n'a pas de `canonicalZipSha256`, seulement `parentZipSha256`). Le workflow n'exige donc le zip qu'à l'acte de gel, et l'a déjà accepté absent. `tools/package.sh` existe, est à la bonne version, et produit `EvidenceForge-MONOLITH-v1.0.12.zip` + son sha256. Deux avertissements pour le propriétaire : (a) le `zip -q -r -X` n'annule pas les horodatages d'entrée ⇒ **reconstruction déterministe bit-à-bit non garantie**, exactement comme pour le lot MONO-11 v0.4 (R13 du lot) — l'intégrité repose sur le hash publié ; (b) `package.sh` appelle `build-manifest.js`, qui **régénérera** `MANIFEST.json` / `SHA256SUMS.txt` et y **inclura les présents rapports d'audit** s'ils sont présents (**R-A6**).

---

## 13. §11 — SCEAUX

### 13.1 Correction de vocabulaire du mandat

Le mandat parle du « runCodeHash / runtimeSeal » du monolithe. **Ces deux notions n'appartiennent pas au monolithe.** Précisément :

- Le **monolithe** possède un `MANIFEST.json` + un `SHA256SUMS.txt` (158 fichiers) et un **`contentHash`** (`9552b45e…`) qui est le sha256 de la liste `sha256␣␣chemin`. C'est **sa seule empreinte de paquet**. Il n'a ni « runtimeSeal » ni « runCodeHash » propres.
- **`runtimeSealSha256`** (`110db4de…`) et **`runCodeHash`** (`27610c84…`) appartiennent au **lot gelé MONO-11 v0.4** : le premier est le sha256 du `SHA256SUMS.txt` du lot (et la clé de contexte de la réutilisation, `lib/llm.js` `reuseContextCheck`) ; le second ne couvre que `core/` + `contracts` + `index.js` du lot.
- Le monolithe **charge** ces valeurs via `SP.loadSealedMono11()` et les **inscrit** dans son MANIFEST (`integration.mono11`) : provenance mesurée, jamais tapée.

Le rapport corrige donc la formulation du mandat : il n'y a pas de « sceau runtime du monolithe » à comparer ; il y a un `contentHash` de paquet et un sceau de lot référencé.

### 13.2 Nouvelle base de référence

`MANIFEST.contentHash` = `9552b45e484cf2e3cdc4f7ef08e275cd1de117055e2643ac854e7a196178f3e2`, **distinct** de celui de v1.0.11 (les fichiers diffèrent). Le futur gel portera donc bien un manifeste et un `contentHash` neufs. `product.version` = `MONOLITH-v1.0.12`. `integration.tests` = `{total:292, passed:292, failed:0}` — **conforme à ma mesure**.

### 13.3 Référencement exact de MONO-11 v0.4

`config.frozenLots["MONO-11"]` et `MANIFEST.frozenLots["MONO-11"]` portent `dir: MONO-11/v0.4`, `version: v0.4`, `canonicalZipSha256: 79c16d08…`, `contractVersion: MONO-11-v3` — **les quatre conformes au FREEZE RECORD et au disque** (§4.4). `MANIFEST.integration.mono11` ajoute `runtimeSealSha256`, `runCodeHash`, `manifestSha256`, `validationContract`, tous **mesurés** par la garde réelle à la construction.

### 13.4 Fail-closed d'un checkpoint v1.0.10 / v1.0.11

`lib/stage-professionals.js` **l.319** : `if (cp.seal.runtimeSealSha256 !== SEAL.runtimeSealSha256) throw CHECKPOINT_SEAL_MISMATCH`. Le run historique `efm-20260918-a64167c0` porte, dans son `state.json`, `seal.runtimeSealSha256 = 9fbef412…` (MONO-11 v0.3-r1). Sous v1.0.12, `SEAL.runtimeSealSha256 = 110db4de…`. La comparaison échoue ⇒ **reprise refusée, message utilisateur explicite, aucune migration**. Raisonné sans exécuter le monolithe de bout en bout, conformément au mandat ; corroboré par les tests `V5` et `V12-14`, qui passent.

---

## 14. §12 — D103 ET RUN HISTORIQUE

| Contrôle | Résultat |
|---|---|
| `efm-20260918-a64167c0` lié à | `MONOLITH-v1.0` / MONO-11 **v0.3-r1**, sceau `9fbef412…`, `runCodeHash e156590d…` — **inchangé** |
| `report.json` `reportHash` | `a962d5ee…` — **recalculé identique** (§11.1) |
| Shadow `report-restored.json` | `88145afc…` — artefact **parallèle**, jamais substitué au run ; fichier intact (`398dcc3c…`) |
| Run (1493 fichiers) sha256 avant/après | **0 ligne de diff** |
| Run (1493 fichiers) mtimes avant/après | **0 ligne de diff** |
| D103 `jmmjs-p01-closure` (151 fichiers) sha256 avant/après | **0 ligne de diff** |
| Échantillon de `D103-P0.1-CANONICAL-v1.SHA256SUMS.txt` re-vérifié | 4/4 conformes |

---

## 15. §9 — SONDES ADVERSARIALES INDÉPENDANTES (scratch uniquement)

| # | Sonde | Résultat |
|---|---|---|
| 1 | Valide originale **omise** par le modèle | Conservée des deux côtés : `[VA, VC]` — miroir == lot ✔ |
| 2 | Réparation en **doublon** (`[VB,VB,VB]`) | Dédup stable ⇒ `[VA, VB]` — miroir == lot ✔ |
| 3 | Réparation **non littérale** | Écartée ; la conservée reste ⇒ `[VA]` ✔ |
| 4 | Brut **tout invalide** + réparation `[]` | `error`, 3 passes, fail-closed, registre vide ✔ |
| 5 | **Dimensions mixtes** (1/2/3 fautives, réparation partielle) | Parité totale ; réparation partielle ⇒ `error` ✔ |
| 6 | Entrée de registre **périmée** (autre sceau) | Refusée, appel réel — aucun service ✔ |
| 7 | **Ancien contrat** (`MONO-11-v2`) | Refusé au registre **et** au cache ✔ |
| 8 | **Ancien sceau** (`9fbef412…`) | Refusé partout ; import lève `REGISTRY_IMPORT_SEAL_MISMATCH` ✔ |
| 9 | Réparation **malformée** (15 variantes) | 15/15 en `error`, jamais de réussite ; **18 cas de divergence de trace** (R-A1) ⚠ |
| 10 | Refs **vides légitimes** (`raw = []`) | `NO_REFS_EXPECTED` ⇒ `[]`, passe 1, aucune réparation ✔ |
| 11 | **Collision de marqueur de prompt** dans le document cible | **BRÈCHE** : registre amputé puis servi à 0 appel, citation perdue silencieusement (R-A2) ⚠ |
| 12 | Références **sous-chaînes** l'une de l'autre (deux sens) | Parité exacte, aucune fusion parasite ✔ |
| 13 | Entrées **non-chaîne** / `null` dans le brut et la réparation | Parité exacte, jamais d'exception ✔ |
| 14 | Le contrat **suit-il** la configuration ? | Oui : config sonde `AUDIT-PROBE-v9` ⇒ constante `AUDIT-PROBE-v9` ✔ |

---

## 16. CONTRAINTES RESPECTÉES

| Contrainte | Preuve |
|---|---|
| Lecture seule partout | `DELIVERED-v1012.sha256` vs `DELIVERED-AFTER.sha256` : **0 ligne de diff** sur les 162 fichiers |
| `--verify` toujours vert sur l'arbre livré | `{"ok":true,"files":158,"bad":[]}` après l'audit |
| 0 appel fournisseur, 0 réseau | aucun `doctor.sh` / `start.sh` / `setup.sh` / serveur lancé ; tout LLM est factice ; la sonde de replay lève `APPEL_FOURNISSEUR_INTERDIT` si un appel est tenté |
| 0 run réel, 0 commit | aucun |
| `ACTIVE_VERSION` inchangée | **`MONOLITH-v1.0.10`** |
| D103 / run historique non modifiés | 0 diff (§14) |
| Aucun octet d'artefact livré édité | les retours arrière et la sonde de contrat ont été faits dans `audit-v1012/REVERT/` et `audit-v1012/MONOLITH-PROBE/` |
| Sondes écrites hors du paquet | `scratchpad/probes/` uniquement |

**Note assumée** : les deux présents livrables sont écrits dans `MONOLITH-v1.0.12/` **après** l'enregistrement de l'état du manifeste. Ils sont donc **absents** du `MANIFEST.json` / `SHA256SUMS.txt` à 158 fichiers — exactement comme le rapport d'intégration de l'auteur, comme l'audit indépendant de v1.0.11, et comme les rapports d'audit du lot MONO-11 v0.4 (décision D2). `build-manifest.js --verify` reste vert en leur présence : lecture faite du code, `verify()` ne contrôle que les fichiers **listés**, jamais l'absence de fichiers supplémentaires ; confirmé par exécution.

---

## 17. RECOMMANDATION FINALE

**GELER** `MONOLITH-v1.0.12` en `FROZEN_WITH_RESERVATIONS`, **sans activation**, sous les conditions suivantes :

1. **Ne pas basculer `ACTIVE_VERSION`** : rester sur `MONOLITH-v1.0.10` jusqu'à un smoke réel mesurant R12 (davantage de `reviewStatus: error` attendus).
2. **Transporter explicitement** R-A1, R-A2, R-A3, R-A4, R3, R4, R12, R13 dans le FREEZE RECORD, R-A2 en tête (brèche de lignée prouvée, préexistante, chemin D).
3. **Ouvrir un chantier ciblé R-A2** avant toute activation : faire porter `doc.content` jusqu'au miroir (ou asserter `st.ctx.content === doc.content` et compter l'écart), de sorte que le registre ne puisse plus recevoir un candidat amputé.
4. **Décider explicitement** (comme la décision D2 du lot MONO-11) si `tools/package.sh` doit être exécuté après l'écriture des rapports d'audit — il régénérerait le manifeste et les y inclurait (R-A6).
5. Corriger, quand l'occasion se présentera, la mention « MESURE en chargeant le module » de `build-manifest.js` (R-A3) et renforcer `parity()` d'une comparaison `sha(registre) == sha(candidat du lot)` (R-A4).

Les deux conditions d'intégration posées par l'audit indépendant de v1.0.11 — **R5** et **R6** — sont **tenues, et prouvées par exécution, pas seulement par lecture**.
