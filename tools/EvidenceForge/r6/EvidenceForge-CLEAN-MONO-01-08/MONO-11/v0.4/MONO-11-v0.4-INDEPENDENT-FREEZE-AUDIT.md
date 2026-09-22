# MONO-11 v0.4 « TARGETED REPAIR LINEAGE PRESERVATION » — AUDIT INDÉPENDANT PRÉ-DÉCISION DE GEL

- **Auditeur** : agent indépendant, adversarial, **lecture seule**. Aucun contexte préalable ; seuls les octets lus sur disque font foi.
- **Date** : 2026-09-22
- **Sujet** : lot candidat `MONO-11/v0.4/` (scellé, non figé, non commité), zip canonique `EvidenceForge-MONO11-AUTONOMOUS-PANEL-v0.4.zip`
- **Contraintes respectées** : 0 appel fournisseur, 0 réseau, 0 run réel, 0 commit, 0 build MONOLITH-v1.0.12, 0 migration de checkpoint, 0 octet modifié dans un artefact livré. Toute exécution (suite de tests, `build-manifest.js`, `seal.js`, benchmark, sondes) a eu lieu **dans une copie** `rsync -a` du kit, dans le répertoire de travail temporaire. Les seuls fichiers écrits hors copie sont les deux livrables nommés en fin de document.

---

## 0. VERDICT

# `MONO11_V0_4_FREEZE_AUDIT_PASS_WITH_RESERVATIONS`

**Recommandation : GELER** — sous les conditions d'intégration R5 et R6 ci-dessous, à inscrire explicitement dans la décision.

Le défaut visé (`LINEAGE_PRESERVATION_GAP`, audit indépendant MONOLITH-v1.0.11 § 4) est **réellement corrigé dans le code**, pas seulement dans les tests. Je l'ai prouvé par un différentiel exécuté moi-même entre `v0.3-r1/core/review-enforcer.js` et `v0.4/core/review-enforcer.js` sur la fixture réelle anonymisée, et par 20 000 tirages aléatoires sur les propriétés P1–P6. Tous les chiffres annoncés se reproduisent à l'identique. Aucun bloqueur.

| Classification demandée | Verdict |
|---|---|
| CAS A / CAS B | **`CAS_B_FAIL_CLOSED_CORRECT`** |
| schemaVersion des traces | **`SCHEMA_V2_ADDITIVE_COMPATIBLE`** (pas de bump requis) |

---

## 1. BLOQUEURS

**Aucun.** Aucun élément relevé n'empêche la décision de gel du lot.

## 2. RÉSERVES

| # | Réserve | Gravité | Portée |
|---|---|---|---|
| R1 | Divergence contrat / code sur `NO_REFS_EXPECTED` : le contrat écrit « RAW_REFS = [] : FINAL_REFS = [] », le code rend `FINAL = VALID_REPAIR` (non vide si la réparation est littérale). **Inatteignable** depuis `runEnforcedReview` (une dimension à `raw = []` n'est jamais fautive — sonde CASE A'). | faible | texte du contrat vs API publique |
| R2 | `buildEnforcedReviewSet` l.403 : `producedBy` annonce toujours « **MONO-11 v0.3-r1** review-enforcer ». Le `DocumentaryReviewSet` produit par v0.4 se déclarerait donc produit par v0.3-r1. | faible | traçabilité d'un artefact livré |
| R3 | Passe 3 en CAS B : le prompt porte « elle **REPRODUISAIT A L'IDENTIQUE** la citation fautive » alors que le modèle a pu rendre `[]`. La re-présentation de la citation invalide est causée par v0.4 lui-même (`applied = raw`). Accusation factuellement fausse, pression possible vers l'invention. | moyenne | qualité du prompt |
| R4 | Si `parseRepair` échoue, `rec.repairUnresolvedDimensions` vaut **silencieusement `[]`** et `repair.lineage` est absent : le statut non résolu n'est porté que par `repair.parsed = false` + `REPAIR_JSON_INVALID`. | moyenne | trace |
| R5 | **CONDITION D'INTÉGRATION (v1.0.12)** — le miroir de l'adaptateur `RE.recompose(st.parsed, rp.repairs)` (`MONOLITH-v1.0.11/lib/ef03b-resilience.js` l.191 ; v1.0.10 l.155) **diverge octet pour octet** du candidat du lot sous v0.4. Mesuré : miroir `["Troisieme option lisible"]` vs lot `["ALPHA beta GAMMA","Troisieme option lisible"]`. En CAS B le miroir est **VALIDE** (`[]`) là où le candidat du lot est **INVALIDE**. Le registre EF-03B inscrirait un candidat amputé de ses références conservées. | **haute (à l'intégration)** | MONOLITH-v1.0.12 |
| R6 | **CONDITION D'INTÉGRATION (v1.0.12)** — `validationContract` / `CONTRACT` épinglés à `MONO-11-v2` (`lib/llm.js` l.71, `lib/ef03b-resilience.js` l.167, `tools/ef03b-registry-import.js` l.33 en dur) alors que `contractVersion` passe à `MONO-11-v3` ; `ef03b-registry-import.js` reconstruit en outre les candidats avec l'ancien `recompose`. | **haute (à l'intégration)** | MONOLITH-v1.0.12 |
| R7 | `forbiddenRefs` est passé à `targetedRepairPrompt` mais **jamais rendu dans le prompt** (paramètre mort, déjà en v0.3-r1). La garantie « aucune valide interdite » repose sur la règle d'accumulation, pas sur le texte : risque latent si une version future décide d'afficher la liste. | faible | dette |
| R8 | La fixture `test/fixtures/tr8-targeted-repair-case.json` reprend **mot pour mot** les trois citations historiques (`A10 restorationTable[15]`). « Anonymisée » = désidentifiée (aucun identifiant de jumeau, d'auteur, de document), pas décontextualisée. Le `MANIFEST.json` consigne « aucun artefact de cas déclaré » alors qu'un artefact dérivé d'un cas existe désormais. | faible | documentation / ANTI-HARDCODING |
| R9 | Croissance de la trace : +28 % sur une passe ciblée minimale (1 237 → 1 578 octets) ; `repair.lineage` duplique les chaînes de citations par dimension. Les consommateurs sont tolérants, mais `checkpoint-downstream.json` (5,4 Mo sur le run historique) transporte les traces. | faible | dimensionnement |
| R10 | `mergeRepairLineage` n'a pas la garde `typeof content === "string"` de `partitionRefsOf` : avec un `targetDoc.content` non-chaîne et non-nul, le validateur utiliserait `""` et `isLiteralRef` utiliserait `String(content)`. Inatteignable en pratique. | très faible | robustesse défensive |
| R11 | **Résidu assumé** : le chemin `INFORMED_REPAIR_V02` (régénération complète) n'offre **aucune** garantie de lignée — mesuré, la référence valide `VA` disparaît. Ce n'est **pas** une perte de lignée de réparation mais une **nouvelle réponse complète légitime**, validée par le validateur figé, explicitement hors du `scope` du contrat v3. À énoncer au propriétaire. | information | périmètre |
| R12 | Changement de comportement voulu (Q6 propriétaire) : une revue que v0.3-r1 **acceptait** (CAS B avec réparation `[]` → `[]` silencieux accepté) **échoue désormais en fail-closed**. Un run réel peut donc produire davantage de `reviewStatus: "error"`. Coût opérationnel réel et assumé. | information | exploitation |
| R13 | Le zip canonique est produit par une commande `zip -X` ad hoc : aucun script de construction n'existe dans le lot. La reproductibilité octet pour octet du zip **n'est pas garantie** ; l'intégrité est assurée par le hash seul (ce que le lot ne prétend pas dépasser). | faible | build |

---

## 3. SECTION 1 — INTÉGRITÉ DU LOT

### 3.1 v0.3-r1 intact

| Contrôle | Résultat |
|---|---|
| `shasum -a 256 -c v0.3-r1/SHA256SUMS.txt` | **52/52 OK, 0 échec** |
| Fichiers sur disque hors sceau | `MANIFEST.json`, `SHA256SUMS.txt` (auto-exclusion voulue par `tools/seal.js`) |
| `v0.3-r1/core/review-enforcer.js` | `42de4c51daa1e33d40058f18dc8eef79beaee7ae3aca134c33118601ade92b3b` ✅ valeur attendue |
| `v0.3-r1/SHA256SUMS.txt` | `9fbef4126d437e0bb2ee4b2564b5ebcc381e8a338eacba40a590eff8402c079c` |
| zip canonique v0.3-r1 | `3c44b397dda0997d0fff6ab4c8e8a8b311430e6a5ac7aeee38149f8349296b0b` ✅ |
| `assertSealedRuntime` (v0.3-r1) | `sealed: true`, `runtimeSealSha256 = 9fbef412…`, `runCodeHash = e156590d…`, 52 fichiers scellés, **15 fichiers de code** |

Le dossier `v0.3-r1/` n'a subi **aucune** modification : chaque octet correspond à son propre sceau **et** au zip canonique.

### 3.2 v0.4 — sceau, manifeste, zip

| Contrôle | Résultat |
|---|---|
| `shasum -a 256 -c v0.4/SHA256SUMS.txt` | **55/55 OK, 0 échec** |
| Fichiers du lot | 57 sur disque ; 55 scellés ; hors sceau : `MANIFEST.json`, `SHA256SUMS.txt` (auto-exclusion) |
| Fichier caché / sauvegarde / résidu d'éditeur | **aucun** (`find . -name '.*'`, `*.bak`, `*~`, `*.orig`, `*.swp`, `.DS_Store` : zéro) |
| Fichier de code non scellé sous `core/` ou `contracts/` | **aucun** |
| `v0.4/SHA256SUMS.txt` | `110db4de24709926d4a5fb6d0e951530f0afc2c1c807a09127852a92aa182c3d` ✅ annoncé |
| `v0.4/MANIFEST.json` | `9acc820d698f7da05a9cd65795fc2cded93c1f0fe4820735bed25c4c3a29514b` |
| `v0.4/core/review-enforcer.js` | `cd620ab30ca1fbe863987dee6711b358930721d57c1b7d086c7bab87d985636a` |
| zip v0.4 | `79c16d08a0a52bc1b9ae3c6884cc22f6161145bed18158d6c9b6a44df1a7c474` ✅ = contenu de `.zip.sha256` ✅ = valeur annoncée |
| `assertSealedRuntime` (v0.4) | `sealed: true`, `runtimeSealSha256 = 110db4de…`, `runCodeHash = 27610c84…`, **55** fichiers scellés, **15** fichiers de code |

Les deux valeurs de sceau ont été **recalculées par moi** en exécutant `v0.4/core/run-seal-guard.js` sur le lot livré (lecture seule), et non reprises du rapport de l'auteur.

### 3.3 Valeurs mesurées du MANIFEST — recoupement indépendant

| Mesure du MANIFEST | Valeur annoncée | Ma mesure | Verdict |
|---|---|---|---|
| `measurements.tests` | 83 / 83, 0 échec, exit 0 | 83 / 83, 0 échec | ✅ |
| `antiHardcodingScan.hits` | 0 | 0 (30 fichiers) | ✅ |
| `gateModuleSha256` | `734ab97a…` | `734ab97a062d92f51c42967bfcb56e3dc2a18a7a027a4283d3bba04b0ce31d06` | ✅ |
| `frozenIntegrity` MONO-10 / MONO-09 / MONO-01 | 79 / 9 / 106, 0 divergence | 79 / 9 / 106, 0 divergence | ✅ |
| `mono10CanonicalZipSha256` | `f5a41654…` | `f5a4165414f4aacc32f48f50eb14d59c87a09e3f138e24f8bd14b956972c2e04` | ✅ |
| `predecessor.zipSha256` | `3c44b397…` | identique | ✅ |
| `contractVersion` | `MONO-11-v3` | `contracts/mono11-contracts.json` → `MONO-11-v3` | ✅ |
| `notFrozen` / `technicalVerdict` | `true` / `GELABLE_TECHNIQUEMENT` | cohérent avec l'état du lot | ✅ |

### 3.4 `diff -rq` v0.3-r1 → v0.4 (exact)

```
Only in v0.4: CHANGELOG-v0.3-r1-to-v0.4.md
Files v0.3-r1/MANIFEST.json and v0.4/MANIFEST.json differ
Files v0.3-r1/README.md and v0.4/README.md differ
Files v0.3-r1/SHA256SUMS.txt and v0.4/SHA256SUMS.txt differ
Only in v0.4: TEST-REPORT-v0.4.md
Files v0.3-r1/benchmark/replay-results.json and v0.4/benchmark/replay-results.json differ
Files v0.3-r1/benchmark/replay.js and v0.4/benchmark/replay.js differ
Files v0.3-r1/contracts/mono11-contracts.json and v0.4/contracts/mono11-contracts.json differ
Files v0.3-r1/core/review-enforcer.js and v0.4/core/review-enforcer.js differ
Files v0.3-r1/index.js and v0.4/index.js differ
Only in v0.4/test/fixtures: tr8-targeted-repair-case.json
Only in v0.3-r1/test: test-mono11-v0.3-r1.js
Only in v0.4/test: test-mono11-v0.4.js
Files v0.3-r1/tools/build-manifest.js and v0.4/tools/build-manifest.js differ
```

### 3.5 Identité octet pour octet, fichier par fichier

| Fichier | v0.3-r1 → v0.4 |
|---|---|
| `core/autonomous-panel-adapter.js`, `core/autonomous-run.js`, `core/composed-qualification.js`, `core/corpus-sufficiency-probe.js`, `core/coverage-enforcer.js`, `core/frozen-bridge.js`, `core/llm-response-reuse.js`, `core/machine-evidence-gate.js`, `core/mono11-ledger.js`, `core/run-seal-guard.js`, `core/semantic-relevance-oracle.js`, `core/target-normalizer.js` | **IDENTIQUES** (12/13 modules `core/`) |
| `core/review-enforcer.js` | **DIFFÉRENT** (seul module `core/` modifié) |
| `test/harness.js`, `test/fixtures/domains.js`, `test/fixtures/v0.2-reference.json` | **IDENTIQUES** |
| `tools/seal.js`, `tools/anti-hardcoding-scan.js` | **IDENTIQUES** |
| `index.js` | différent — **commentaire d'en-tête uniquement** (`diff -u` : 1 ligne, `/** MONO-11 v0.3-r1 … */` → `/** MONO-11 v0.4 … */`). Aucune ligne exécutable touchée. |
| `tools/build-manifest.js` | différent — **données du manifeste** : nom du fichier de tests lancé, `version`, `name`, `status`, `predecessor`, `contractVersionPolicy`, `auditFindingsAddressed`. Aucune logique de mesure modifiée. |
| `benchmark/replay.js` | différent — **comportement de mesure modifié** (voir ci-dessous) |

**Confirmation nuancée du mandat.** Le seul module de **runtime** au comportement modifié est bien `core/review-enforcer.js`. Mais `benchmark/replay.js` **change aussi de comportement** : l.28 `RE.rejectedRefsOf(v.errors, v.parsed, doc.content)` (passage du document) et l.38 `RE.mergeRepairLineage(parsed1, repairs, doc.content)` avant `RE.recompose(parsed1, mg.applied)`. C'est un outil de mesure hors ligne, non chargé par `index.js`, non scellé comme code par `run-seal-guard.js` (`CODE_DIRS = ["core","contracts"]` + `index.js`) et donc **hors `runCodeHash`** — mais il faut le dire : l'affirmation « seul `review-enforcer.js` change de comportement » est vraie du runtime, pas du benchmark. Les décomptes qu'il produit sont inchangés ; seuls les hashes des prompts ciblés changent (les conservées y sont listées), ce que le CHANGELOG annonce.

Le reste est bien du contrat / version / documentation / tests / manifeste / sceau.

---

## 4. SECTION 2 — CONTRAT MONO-11-v3 : ÉNONCÉ **ET** IMPLÉMENTATION

`contracts/mono11-contracts.json` → `lineageMonotonicityDuringRepair` :

| Propriété | Énoncé du contrat | Implémentation lue | Vérification indépendante |
|---|---|---|---|
| P1 | `FINAL ⊇ VALID_ORIGINAL` | `review-enforcer.js` l.197-199 : `validOriginal` inséré en premier dans `final` | 20 000 tirages ✅ |
| P2 | `FINAL ⊆ RAW ∪ REPAIR` | l.199 : `final` construit exclusivement depuis `validOriginal.concat(validRepaired)` | 20 000 tirages ✅ |
| P3 | tout `FINAL` littéral | l.197-198 : deux filtres `isLiteralRef` | 20 000 tirages ✅ |
| P4 | ordre brut puis modèle | l.199 : `validOriginal` puis `validRepaired`, ordres d'origine préservés | 20 000 tirages ✅ |
| P5 | dédup stable, première occurrence | l.199 : `if (final.indexOf(r) === -1) final.push(r)` | 20 000 tirages ✅ |
| P6 | aucun autre champ touché | `recompose` l.288 : `Object.assign({}, f, { targetEvidenceRefs: … })` | 20 000 tirages : même jeu de clés, toutes les autres valeurs `JSON.stringify`-identiques ✅ |

**`isLiteralRef` vs validateur figé.** Validateur l.108 : `if (!isStr(ref) || content.indexOf(ref) === -1)`. `isLiteralRef` l.170 : `isStr(ref) && String(content == null ? "" : content).indexOf(ref) !== -1`. Sonde A1 : sur 14 références adverses (`null`, `undefined`, nombre, objet, tableau, chaîne vide, espaces seuls, tabulation, sous-chaîne, document entier, double espace interne…), **`validateur.rejette(ref) ⇔ !isLiteralRef(ref)` pour chacune** : contrôle rigoureusement identique. Seule divergence théorique : un `content` non-chaîne et non-nul (R10), inatteignable.

**Sondes fonctionnelles indépendantes** (`partitionRefsOf`) :

| Sonde | Résultat |
|---|---|
| A3 `preserved` = littérales uniquement | ✅ `["ALPHA beta"]` sur `["ALPHA beta","nope",42,"  "]` |
| A4 `rejected` = non littérales **de type chaîne** uniquement (non-chaînes écartées) | ✅ `["nope","  "]` |
| A5 `raw` intact | ✅ 4 éléments |
| A6 usage legacy (sans `content`) : rien de conservé, tout rejeté (conservateur) | ✅ |
| A7 `rejectedRefsOf(e,p,c) === partitionRefsOf(e,p,c).rejected` | ✅ |
| A8 `NO_REFS_EXPECTED` : le contrat dit `FINAL = []`, le code rend `["ALPHA beta"]` | ❌ **R1** |

**Sondes de bout en bout** (`runEnforcedReview`, faux LLM scripté, stub du bridge figé, 0 appel) : 26 sondes, **26 succès** — voir §5 et §6.

---

## 5. SECTION 3 — CAUSE RACINE

| Question du mandat | Réponse, avec preuve |
|---|---|
| Seules les non-littérales sont « rejetées » ? | **Oui.** `partitionRefsOf` l.178 : `rejected[d] = all.filter(r => !isLiteralRef(r, content)).filter(r => typeof r === "string")`. `rejectedRefsOf` délègue (l.183). Sondes A3/A4/A7. |
| Une littérale peut-elle entrer dans `forbiddenRefs` ? | **Non, par deux chemins.** (a) l.321 alimente `forbiddenRefs` depuis `rejected[d]`, qui ne contient que des non-littérales. (b) Nouvelle ligne l.345 : alimentée par `mg.dimensions[d].droppedRepairedRefs`, défini l.198 comme `rep.filter(r => !isLiteralRef(r, content))` — **une littérale ne peut pas y atterrir par construction**, et un garde `isStr(x)` filtre encore les non-chaînes. Vérifié sur 20 000 tirages (aucune littérale dans `droppedRepairedRefs` ni dans `rejectedRefs`). |
| Les références valides dépendent-elles encore de leur réémission par le modèle ? | **Non.** Sonde B1 : le modèle ne rend **que** le remplacement → `FINAL = [VA, VC]`, acceptée passe 2. Sonde TR8-D1 (différentiel sur la fixture réelle) : **v0.3-r1 rend `["terminée comme prévu ou non ;"]` (les deux originales valides perdues), v0.4 rend les trois**. Le défaut est objectivement corrigé. |
| La fusion a-t-elle lieu avant `recompose` ? | **Oui.** l.344 `mergeRepairLineage(...)` puis l.346 `recompose(parsed, mg.applied)`. `recompose` reste pur et **byte-identique** à v0.3-r1. |
| Un autre chemin remplace-t-il silencieusement les conservées ? | **Un seul, et il est légitime** : `INFORMED_REPAIR_V02` (l.328), régénération **complète**. Mesuré : `VA` disparaît. Ce n'est **pas** une perte de lignée de réparation mais une **nouvelle réponse complète** du modèle sur tous les champs, validée par le validateur figé ; le `scope` du contrat v3 la place explicitement hors périmètre (« réparation ciblée, passe ≥ 2 »). Sur cette passe, `preservedRefs = null` et `repairUnresolvedDimensions = []` : la trace ne prétend rien. **Réserve R11** (à énoncer, pas à corriger). |
| `buildEnforcedReviewSet` et autres écrivains de `targetEvidenceRefs` | `buildEnforcedReviewSet` (l.381-406) n'écrit **jamais** `targetEvidenceRefs` : il délègue à `runEnforcedReview` et agrège. Recherche exhaustive dans le kit : les seuls écrivains sont `recompose` (l.288) et, hors lot, `MONOLITH-v1.0.11/lib/ef03b-resilience.js` (chemin de littéralisation, déjà corrigé en v1.0.11 par `preserveLineageRepairs`) et le miroir l.191 (**R5**). |
| Ligne « INTERDIT » de la passe 3 vs contenu de `forbiddenRefs` | `forbiddenRefs` est passé à `targetedRepairPrompt` **mais n'est jamais rendu** : la ligne l.245 est générique (« une citation déjà rejetée »), aucune liste n'est affichée. Sonde F : le prompt de passe 3 ne contient ni le mot `forbiddenRefs`, ni la référence conservée dans une clause d'interdiction, ni même la réparation écartée. Aucune valide ne peut donc être nommée interdite. **Paramètre mort → R7.** |

---

## 6. SECTION 4 — CAS A / CAS B (critique)

### CAS A — `raw = []`

| Sonde | Résultat |
|---|---|
| `raw = []` sur toutes les dimensions | acceptée **passe 1**, `FINAL = []`, **aucune** réparation ciblée déclenchée, rien d'inventé ✅ |
| CASE A' : `D1` à `raw = []`, `D2` fautive | `D1` n'est **jamais** une `faultyDimension` (elle ne produit pas d'erreur `TARGET_REF_NOT_LITERAL`), n'apparaît pas dans le prompt ciblé, reste `[]` ✅ |

`NO_REFS_EXPECTED` est donc, dans le flux réel, un état **défensif inatteignable** : `faultyDimensions` (l.168) exige une erreur `TARGET_REF_NOT_LITERAL` portant un `dimensionId`, laquelle exige une référence présente et fautive. C'est ce qui neutralise la divergence R1.

### CAS B — `raw ≠ []`, aucune originale valide, aucune réparation valide

Mécanisme v0.4 vérifié : `mergeRepairLineage` l.201 → `applied(d) = raw.slice()` ; `recompose` réinjecte donc les **références invalides inchangées** ; le validateur figé les refuse à nouveau ; la politique bornée continue ; fail-closed après 3 passes.

| Question | Réponse |
|---|---|
| **(A) CAS B confondable avec CAS A ?** | **Non.** Trois discriminants indépendants observés sur la même trace : `repair.lineage.D1.state = "REFS_PRESENT_BUT_UNRESOLVED"` ; `repairUnresolvedDimensions = ["D1"]` ; le candidat conserve la référence invalide, donc le pass porte `errorCodes: ["TARGET_REF_NOT_LITERAL"]` et la revue finit en `error`. En CAS A, `FINAL = []` est accepté **passe 1** sans aucune passe ciblée. Aucun chemin ne produit un `[]` accepté à partir d'un `raw` non vide sans conservée. |
| **(B) Le statut `REFS_PRESENT_BUT_UNRESOLVED` peut-il être perdu ?** | **Partiellement, sur un seul chemin.** (1) `parseRepair` en échec (l.347) : `mg` n'est pas calculé, `repair.lineage` est **absent** et `repairUnresolvedDimensions` vaut **`[]`** ; le statut n'est plus porté que par `repair.parsed = false` + `REPAIR_JSON_INVALID` + le maintien des erreurs cibles précédentes. Sondé : la revue finit bien en `error`, donc **aucun faux succès**, mais un consommateur qui lirait seulement `repairUnresolvedDimensions` conclurait « rien de non résolu » → **R4**. (2) Passe 3 / changement de stratégie : le statut est recalculé à chaque passe, non perdu. (3) Trace non persistée : `autonomous-run.js` l.173 enregistre l'intégralité de `rv.traces` dans le ledger et `pipeline.js` l.274 écrit `enforcement-traces.json` — persistée. (4) **Miroir de l'adaptateur MONOLITH-v1.0.11** (`RE.recompose(st.parsed, rp.repairs)`, l.191) : sous v0.4 il calculerait `D1 = []`, **valide**, là où le candidat réel du lot est **invalide** ; il inscrirait `state: "CANDIDATE_VALID"` dans sa propre trace et mettrait ce candidat dans `st.candidates[callId]`. Le registre n'est alimenté que sur `onValidation(valid === true)` — piloté par le lot, donc pas de fausse acceptation — mais sur un cas **RESOLVED** le registre stockerait un candidat **amputé des conservées**. Ce n'est pas un défaut du lot (non intégré ; v1.0.11 est épinglé à v0.3-r1 par le sceau), c'est une **condition d'intégration : R5**. |
| **(C) Boucle inutile / répétition ?** | **Non, bornée.** Sonde C : exactement 3 passes, jamais plus, `DEFAULT_MAX_PASSES = 3`. Le `EXACT_RETRY_REPEAT` se déclenche normalement sur une réponse byte-identique. Effet secondaire mesuré : la re-présentation de la référence invalide par v0.4 rend `repeatedFaultyRef` **systématiquement vrai** à la passe 3 en CAS B, ce qui active la clause « elle REPRODUISAIT A L'IDENTIQUE la citation fautive » **même si le modèle a rendu `[]`** → **R3**. Aucun surcoût de passe : le plafond reste 3. |
| **(D) Règle des 3 passes cohérente ?** | **Oui.** `DEFAULT_MAX_PASSES = 3` inchangé (r1-T10 le rejoue, ma sonde le confirme). Stratégies observées en CAS B : `["BASE_EF03B","TARGETED_REPAIR","TARGETED_REPAIR_STRATEGY_CHANGE"]`. Les gardes I7 (`EXACT_RETRY_REPEAT` après changement de stratégie, `EXACT_RETRY_REPEAT` sur reprise informée) sont intactes et byte-identiques. |
| **(E) Échec final explicite et traçable ?** | **Oui.** `review.reviewStatus = "error"` ; `review.error` cite les codes et détails (`TARGET_REF_NOT_LITERAL citation absente du document cible …`) ; `review.enforcement = { passes: 3, acceptedPass: null, failClosedReason, strategies }` ; `trace.passes[]` porte par passe `preservedRefs`, `repairUnresolvedDimensions`, `repair.lineage[dim] = { state, preservedRefs, rejectedRefs, validRepairedRefs, droppedRepairedRefs, finalRefs, unresolvedInvalidRefs, repairOutcome }`. |

### Classification

# `CAS_B_FAIL_CLOSED_CORRECT`

Le CAS B échoue en fermeture, sans `[]` silencieux, sans citation inventée, avec un état technique nommé et persisté. La réserve R4 porte sur un **champ** de trace dans un sous-cas (`parseRepair` illisible), pas sur le verdict.

---

## 7. SECTION 5 — PROMPT DE RÉPARATION CIBLÉE (0 appel fournisseur)

Prompts construits par moi dans la copie, avec mes propres entrées.

| Contrôle | Résultat |
|---|---|
| `PRESERVED_VALID_REFS` et `REFS_TO_REPAIR` distincts et non ambigus | ✅ deux lignes séparées par dimension (l.250-251), libellés explicites, contenus disjoints par construction (`preserved` ∩ `rejected` = ∅) |
| Une conservée n'apparaît jamais comme à réparer | ✅ sonde B1b : `"ALPHA beta GAMMA"` figure dans la ligne `PRESERVED_VALID_REFS` et **jamais** dans `REFS_TO_REPAIR` |
| Le modèle est averti de ne pas réécrire les acquises | ✅ « elles restent quoi que vous rendiez, **ne les réécrivez pas** » + « les citations conservées sont **réunies automatiquement au résultat** (les répéter est sans effet) » |
| Sémantique de `[]` énoncée | ✅ « rendez `[]` pour cette dimension : les citations conservées restent ; s'il n'y a aucune citation conservée, la dimension est enregistrée comme **réparation NON RÉSOLUE** (jamais comme un résultat vide accepté) — n'inventez rien » |
| Aucune valide déclarée interdite (ligne « INTERDIT » passe 3 vs `forbiddenRefs`) | ✅ `forbiddenRefs` n'est jamais rendu ; la clause est générique et ne vise que « une citation déjà rejetée », c'est-à-dire non littérale par construction |
| Aucune instruction nouvelle sur `disposition` / `epistemicStatus` / `finding` / `rationale` / `confidenceQualitative` / `limitations` / `twinBasisWorkRefs` | ✅ sonde H : **aucun** de ces noms de champ n'apparaît dans le prompt ciblé |
| Empreinte déterministe du contexte de réparation (propriété R1 de v0.3-r1) | ✅ sonde G : le prompt porte `empreinte=<fingerprint>` et `REPAIR_CONTEXT_REQUIRED` est toujours levé sans contexte (l.243) ; sonde G2 : l'empreinte est **inchangée** par la fusion de lignée (elle exclut `targetEvidenceRefs`) |
| Réserve | **R3** : la clause « REPRODUISAIT A L'IDENTIQUE » en passe 3 CAS B accuse le modèle d'une répétition causée par v0.4 |

---

## 8. SECTION 6 — TESTS TR-1..TR-14 : REJEU **ET** ÉQUIVALENTS INDÉPENDANTS

Rejeu dans la copie : `EVIDENCEFORGE_BUNDLE_ROOT=<copie> node --test test/test-mono11-v0.4.js` → **83 / 83, 0 échec**, TR-1..TR-14 tous verts.

Pour TR-3, TR-8, TR-12, TR-13, TR-14 j'ai **réécrit mes propres équivalents**, sans réutiliser le fichier de tests livré (stub du bridge figé, faux LLM scripté écrit par moi) :

| Test livré | Mon équivalent | Résultat |
|---|---|---|
| TR-3 (omission d'une valide par le modèle) | B1 / B1b | `FINAL = [VA, VC]` ; `VA` listée CONSERVÉE et jamais dans `REFS_TO_REPAIR` ✅ |
| TR-12 (CAS B) | 8 sondes CAS B + variante `parseRepair` en échec | fail-closed, état, stratégies, persistance ✅ (R4 relevée **en plus** du test livré) |
| TR-13 (conservée + réparation échouée) | B2 / E | `FINAL = [VA]`, `unresolvedInvalidRefs = [IB]`, `repairOutcome = "INVALID_DROPPED_NO_REPLACEMENT"` ✅ |
| TR-14 (omission délibérée + passe 3) | B1 / F | la valide demeure ; en passe 3, aucune valide n'est à réparer ni interdite ✅ |
| TR-8 (fixture réelle) | 11 sondes dédiées (voir ci-dessous) | ✅ |

### TR-8 — la fixture encode-t-elle vraiment le cas ?

| Sonde | Résultat |
|---|---|
| `contentSha256` du fixture correspond à son propre `content` | ✅ `4154c050d49445c0f819dfc779446260d836e07859f2e7caef30ffae71933b20` |
| La fixture encode bien **2 littérales + 1 non littérale** testées contre son `content` | ✅ `[true, true, false]` |
| `validOriginal` / `invalidOriginal` déclarés = résultat du test de littéralité | ✅ |
| Le `replacement` déclaré est littéral dans le `content` | ✅ (différence : `prevu` → `prévu`) |
| Aucun identifiant réel (openalex / ORCID / DOI / id de jumeau / uuid / e-mail) | ✅ |
| **Les 4 comportements du modèle donnent-ils le même FINAL ?** | Nuance importante : **les 2 conservées survivent dans les 4 cas** ✅, la non littérale n'apparaît **jamais** ✅, tout élément de tout FINAL est littéral ✅. Mais les FINAL ne sont pas tous identiques : `[]` et « réémet les 2 valides » donnent `[v1, v2]` ; « rend le remplacement » et « rend tout + remplacement » donnent `[v1, v2, remplacement]`. **C'est le comportement correct et voulu** (le remplacement n'existe que si le modèle le fournit) ; la formulation du libellé TR-8 (« même FINAL quel que soit le comportement ») est donc **imprécise** : ce qui est invariant, c'est la **survie des conservées**, pas le FINAL entier. |

### TR-8 — fidélité à l'anonymisation du cas historique

Comparaison avec `~/evidenceforge-work/reports/a10-lineage-restoration/EVIDENCEFORGE-A10-LINEAGE-RESTORATION-v1.json`, `restorationTable[15]` :

| Champ A10 | Fixture TR-8 |
|---|---|
| `reviewId: twin-https://openalex.org/A5081732198`, `findingId: …-target-01-DISC-01`, `targetId: target-01`, `documentSha256: 7885c6ec…` | **absents** (désidentification effective) |
| `rawTargetEvidenceRefs` (3) | **identiques mot pour mot** |
| `validOriginalLiteralRefs` (2) | identiques |
| `invalidOriginalRefs` (1) | identique |
| `repairedRefs[0].refs` = les 2 valides, réémises par le modèle | correspond à la note de la fixture « le modèle avait ré-émis lui-même les 2 valides » ✅ **c'est exactement le défaut visé** |
| document cible réel | remplacé par un `content` synthétique ; le `replacement` est synthétique |

**Conclusion** : la fixture est une **désidentification fidèle** du cas historique — structure (3 refs, 2 littérales, 1 non littérale), comportement du modèle et cause du défaut sont exacts. Les chaînes de citation sont reprises **verbatim** ; elles ne contiennent aucun identifiant (vérifié aussi par balayage adversarial, ci-dessous) mais ce sont du contenu de cas dans un lot déclaré agnostique → **R8**.

### Différentiel décisif

Même entrée, même fixture, comportement « le modèle ne rend que le remplacement » :

| Moteur | `targetEvidenceRefs` final |
|---|---|
| `v0.3-r1/core/review-enforcer.js` | `["terminée comme prévu ou non ;"]` — **les 2 originales littérales sont perdues** |
| `v0.4/core/review-enforcer.js` | `["La fiche demande à partir de quand une activité choisie devient difficile.","réaction pendant l'activité ;","terminée comme prévu ou non ;"]` |

Le `LINEAGE_PRESERVATION_GAP` est reproduit sur v0.3-r1 et **fermé** sur v0.4, par le code.

---

## 9. SECTION 7 — SUITE COMPLÈTE (exécutée dans la copie)

| Mesure | Annoncé | Mesuré par moi | Verdict |
|---|---|---|---|
| `node --test test/test-mono11-v0.4.js` | 83 / 83 | **83 / 83**, 0 échec, 0 ignoré, 0 todo | ✅ |
| `benchmark/replay.js` — occurrences `TARGET_REF_NOT_LITERAL` | 12 | **12** | ✅ |
| — collages (`splices`) | 12 | **12** | ✅ |
| — répétitions exactes | 5 | **5** | ✅ |
| — séquences éligibles | 5 | **5** | ✅ |
| — fausses acceptations | 0 | **0** | ✅ |
| — régressions | 0 | **0** | ✅ |
| — corrections historiques acceptées par recomposition | 2 | **2** | ✅ |
| — collisions de prompt ciblé | 0 | **0** (`distinctRepairContexts = 5`, `targetedPromptsBuilt = 5`) | ✅ |
| — `inventions` / `truncations` | 0 / 0 | **0 / 0** | ✅ |
| `benchmark/replay-results.json` livré | — | **identique** à ma sortie (`summary` champ par champ) | ✅ |
| `tools/anti-hardcoding-scan.js` | 0 hit | **0 hit**, 30 fichiers | ✅ |
| Balayage **adversarial** avec les artefacts du cas réel (`twins.json`, `professionals-selection.json`, `mission.json`, `disciplines.json`, `panel.json`, `review-schema.json` du run `efm-20260918-a64167c0`) | non exécuté par l'auteur | **322 jetons de cas chargés → 0 hit**, `CASE_SPECIFIC_LEAK_FOUND: NO` | ✅ aucune fuite |
| Lots figés : MONO-10 / MONO-09 / MONO-01 | 79 / 9 / 106, 0 divergence | **79 / 9 / 106, 0 divergence** (`frozen-bridge.loadFrozen`) | ✅ |

**Aucune divergence avec les chiffres annoncés.**

---

## 10. SECTION 8 — NON-RÉGRESSION SÉMANTIQUE

| Contrôle | Résultat |
|---|---|
| `disposition`, `epistemicStatus`, `finding`, `rationale`, `confidenceQualitative`, `limitations`, `twinBasisWorkRefs` octet pour octet hors réparation des refs | ✅ sur tous mes scénarios de bout en bout et sur 20 000 tirages aléatoires (`JSON.stringify` par clé) |
| Jeu de clés du constat inchangé | ✅ (aucune clé ajoutée ni retirée par `recompose`) |
| Dimensions non ciblées intactes, **refs comprises** | ✅ `D2` reste `[VB]` |
| `recompose` copie-t-il toujours tout ? | ✅ byte-identique à v0.3-r1 ; `Object.assign({}, f, {targetEvidenceRefs})`. Il ne rend que `{findings}` (les clés racine surnuméraires seraient perdues) — comportement **inchangé** depuis v0.3, et inatteignable sur ce chemin puisque `onlyTargetRefErrors` exclut `EXTRA_KEY`. |
| Le parseur ajoute-t-il / retire-t-il quelque chose ? | `parseRepair` **byte-identique** à v0.3-r1 ; `validateReviewCandidate`, `enforcementPreamble`, `informedRepairPrompt`, `extractJson` byte-identiques à la référence v0.2 (rejoué par r1-T10 et par le `diff -u` que j'ai produit) |
| La trace grossit-elle au point de gêner un consommateur ? | Mesuré : passe ciblée 1 237 → 1 578 octets (**+28 %**) ; trace complète 2 025 → 2 419 octets. Nouveaux champs : `preservedRefs`, `repairUnresolvedDimensions` (niveau passe), `repair.lineage`, `repair.unresolvedDimensions`. Consommateurs **sélectifs par champ** (aucune validation de schéma, aucune énumération stricte de clés) → tolérants. **R9** (dimensionnement de `checkpoint-downstream.json`, 5,4 Mo sur le run historique). |
| Autre champ que le patch pourrait toucher ? | Recherche exhaustive : `mergeRepairLineage` ne lit que `targetEvidenceRefs` (l.196) ; `repairContext` supprime explicitement `targetEvidenceRefs` avant hachage (l.227), donc l'empreinte de reuse est **insensible** à la fusion (sonde G2) ; `rec.responseSha256` change (c'est le candidat recomposé, attendu). Aucun autre champ atteint. |

---

## 11. SECTION 9 — `schemaVersion` DES TRACES

### Faits

- `core/autonomous-run.js` l.173 (fichier **byte-identique** à v0.3-r1) émet toujours `{ schema: "EvidenceForge.ReviewEnforcementTrace", schemaVersion: "MONO-11-v2", traces: rv.traces }`, alors que `contractVersion` passe à `MONO-11-v3` et que la trace gagne `preservedRefs`, `repairUnresolvedDimensions`, `repair.lineage`, `repair.unresolvedDimensions`.
- Règle historique (`CHANGELOG-v0.3-to-v0.3-r1.md` § « contractVersion / schemaVersion ») : « ajouts de champs **purement additifs**, lecteurs tolérants ⇒ pas de bump » ; et règle de gouvernance proposée : « seules les clés **consommées** font version de contrat ».

### Consommateurs effectivement recensés (recherche sur tout le kit)

| Consommateur | Ce qu'il lit | Tolérant aux ajouts ? |
|---|---|---|
| `MONOLITH-v1.0.10/.11/tools/ef03b-autopsy.js` | `t.passes`, `p.pass`, `p.strategy`, `p.valid`, `p.costUsd`, `p.errors`, `p.errorCodes`, `p.targetedDimensions`, `p.exactRepeat`, `p.callId`, `.acceptedPass` | **Oui** — accès par nom, aucune validation de schéma |
| `MONOLITH-v1.0.10/.11/tools/ef03b-registry-import.js` | `traces[].twinId`, `.targetId`, `.passes[0].promptSha256`, `.acceptedPass` | **Oui** (mais → R6 : `validationContract` en dur `MONO-11-v2`, reconstruction par l'ancien `recompose`) |
| `MONOLITH-v1.0.*/lib/pipeline.js` l.274 / l.421 | persiste / archive le bloc tel quel | **Oui** (opaque) |
| `MONOLITH-v1.0.*/lib/stage-professionals.js` l.345 | transporte `enforcementTraces` dans le checkpoint | **Oui** (opaque) |
| `MONO-11/v0.4/test/test-mono11-v0.4.js` | `dn.enforcementTraces.reviews[].acceptedPass / .passes[].errorCodes / .error` | **Oui** |
| MONO-10, MONO-09, MONO-01 | **aucune** lecture de ces traces | — |

Aucun parseur strict, aucun schéma fermé, aucune énumération de clés : **les ajouts sont purement additifs et tous les lecteurs sont tolérants**. Le run est par ailleurs discriminé par `state.seal.mono11Version` / `runtimeSealSha256` / `mono11ZipSha256` (vérifié sur le run historique), et la présence de `repair.lineage` est elle-même un discriminant direct.

### Décision

# `SCHEMA_V2_ADDITIVE_COMPATIBLE`

**Pas de bump requis.** Un bump n'est pas dû au seul changement de `contractVersion` (le mandat le rappelle, et la règle historique du lot va dans le même sens). Il n'apporterait aucune information qui ne soit déjà portée par le sceau, et coûterait une divergence gratuite de filtre.

**Mais** (réserves R5/R6) : la compatibilité de **schéma** ne vaut pas compatibilité de **sémantique**. Sous contrat v3, une trace `MONO-11-v2` décrit un moteur dont le comportement a changé (`[]` après réparation échouée n'est plus une acceptation). Toute reconstruction forensique à partir des traces (`ef03b-registry-import.js`, outillage de type A10) qui rejouerait `RE.recompose(parsed, rp.repairs)` reconstruirait la sémantique **v0.3-r1**. À aligner en MONOLITH-v1.0.12, en même temps que `VALIDATION_CONTRACT`.

---

## 12. SECTION 10 — SCEAUX / CHECKPOINTS

| Contrôle | Résultat |
|---|---|
| v0.3-r1 `runtimeSealSha256` | **`9fbef4126d437e0bb2ee4b2564b5ebcc381e8a338eacba40a590eff8402c079c`** ✅ (recalculé) |
| v0.3-r1 `runCodeHash` | **`e156590d1605a8873b7b9814ad44a314084ad8946c8993dff4e5e7f86b452755`** ✅ (recalculé) |
| v0.4 `runtimeSealSha256` | **`110db4de24709926d4a5fb6d0e951530f0afc2c1c807a09127852a92aa182c3d`** ✅ (recalculé) |
| v0.4 `runCodeHash` | **`27610c84502104b3dc9643a9cc0289aef4ae40ae65ee34e4fe82f31a73e381ad`** ✅ (recalculé) |
| Composition de `runCodeHash` | `core/` + `contracts/` + `index.js` uniquement, 15 entrées, triées par nom (`run-seal-guard.js` l.64-65) |

### `CHECKPOINT_SEAL_MISMATCH` — raisonnement, sans exécuter le monolithe

`MONOLITH-v1.0.10/lib/stage-professionals.js` l.319 (identique en v1.0.11) :

```js
if (cp.seal.runtimeSealSha256 !== SEAL.runtimeSealSha256) throw Object.assign(new Error("CHECKPOINT_SEAL_MISMATCH"), …);
```

Le run historique `efm-20260918-a64167c0` porte, dans `state.json`, `checkpoint-professionals.json` **et** `checkpoint-downstream.json` :

```json
{"mono11Version":"v0.3-r1","runtimeSealSha256":"9fbef412…c079c","runCodeHash":"e156590d…2755",
 "mono11ZipSha256":"3c44b397…6b0b","mono11ManifestSha256":"9cbf02d4…0cb5"}
```

Sous un monolithe chargeant v0.4 (`SEAL.runtimeSealSha256 = 110db4de…`), la comparaison `9fbef412… !== 110db4de…` est vraie ⇒ **`CHECKPOINT_SEAL_MISMATCH` levé, reprise refusée**. Le run historique reste **lié à son runtime d'origine**. Aucun checkpoint n'a été touché.

### Refus inter-sceaux du registre et du cache

| Garde | Code | Effet |
|---|---|---|
| Cache LLM | `lib/llm.js` l.79 : `if (opts.sealHash && entry.sourceSealHash !== opts.sealHash) return { ok:false, reason:"sceau different (…)" }` | réutilisation refusée d'un sceau à l'autre |
| Registre EF-03B | `lib/ef03b-resilience.js` l.155 : `find()` filtre sur `(e.sourceSealHash \|\| null) === (sealHash \|\| null)` **et** `e.validationContract === contract` **et** `e.status === "VALID"` | double verrou (sceau **et** contrat) |
| Bridge des lots figés | `frozen-bridge.loadFrozen` : 79 / 9 / 106, 0 divergence | lots composés intacts |

**Aucun chemin de migration, aucun chemin de compatibilité silencieuse** : recherche sur tout `MONOLITH-v1.0.11/lib/` d'un `sealHash` associé à `skip` / `ignore` / `allow` / `compat` / `migrat` / `force` / `legacy` → **0 occurrence**. Le sceau est une condition dure, jamais un avertissement (`run-seal-guard.js` l.63 : `throw fail("RUN_ON_UNSEALED_CODE", …)`).

Contrôle positif exécuté dans la copie : l'ajout d'un `core/stray.js` non scellé fait lever `RUN_ON_UNSEALED_CODE: fichier de code NON scelle present : core/stray.js`. Le garde fonctionne bien dans les deux sens.

`ACTIVE_VERSION` = **`MONOLITH-v1.0.10`** (inchangé, vérifié avant et après mes travaux).

---

## 13. SECTION 11 — ZIP CANONIQUE

| Contrôle | Résultat |
|---|---|
| sha256 du zip | `79c16d08a0a52bc1b9ae3c6884cc22f6161145bed18158d6c9b6a44df1a7c474` ✅ = `.zip.sha256` ✅ = valeur annoncée `79c16d08…` |
| Nombre d'entrées | **66** ✅ (57 fichiers + 9 répertoires) |
| Racine | une seule, `v0.4/` |
| `shasum -c SHA256SUMS.txt` **dans l'extraction** | **55/55 OK** |
| `diff -rq extraction v0.4/` sur disque | **arbre identique**, aucune différence |
| Secret / clé / jeton / `.env` | **aucun**. Unique occurrence des motifs : `test/test-mono11-v0.4.js` l.488, qui est une **assertion d'absence** (`assert.equal(/EVIDENCEFORGE_WORKER_API_KEY\|sk-ant-\|Bearer /.test(txt), false)`) |
| Identifiant réel dans `test/fixtures/tr8-targeted-repair-case.json` | **aucun** (ni openalex, ni ORCID, ni DOI, ni uuid, ni e-mail, ni id de jumeau/cible/document). Anonymisation **tenue** — voir R8 pour la nuance contenu vs identité |
| Reproductibilité | `tools/seal.js` est déterministe (parcours trié, exclusion de `SHA256SUMS.txt` / `MANIFEST.json` / fichiers commençant par `.`). `tools/build-manifest.js` **n'est pas** reproductible (`builtAt: new Date().toISOString()`), ce qui est sans effet : `MANIFEST.json` est hors sceau. **Le zip, lui, est produit par une commande `zip -X` ad hoc : aucun script de build n'existe dans le lot, les horodatages des entrées ne sont pas neutralisés ⇒ une reconstruction déterministe octet pour octet n'est PAS garantie.** Le lot ne le prétend d'ailleurs pas : l'intégrité repose sur le hash publié. **R13.** |

---

## 14. ÉTAT DU SCEAU AU MOMENT DE L'ÉCRITURE DE CE RAPPORT

Déclaration explicite, exigée par le mandat :

1. **Le sceau et le manifeste du lot ont été calculés AVANT l'existence de ces deux fichiers d'audit.** Ils ont été **vérifiés et enregistrés avant** toute écriture : `shasum -a 256 -c v0.4/SHA256SUMS.txt` → 55/55 OK ; `SHA256SUMS.txt` = `110db4de…` ; `MANIFEST.json` = `9acc820d…` ; `core/review-enforcer.js` = `cd620ab3…` ; zip = `79c16d08…`.
2. **Aucun fichier scellé n'a été modifié.** Vérification finale après écriture : identique aux valeurs ci-dessus.
3. Les deux fichiers d'audit (`MONO-11-v0.4-INDEPENDENT-FREEZE-AUDIT.md` / `.json`) sont déposés à la racine du lot et **ne figurent pas dans le sceau** : `shasum -a 256 -c v0.4/SHA256SUMS.txt` continue de passer (55/55) mais deux fichiers du dossier ne sont plus couverts. C'est le motif déjà retenu pour MONOLITH-v1.0.11.
4. **`assertSealedRuntime` passe toujours avec les fichiers d'audit présents** — vérifié dans la copie, avec deux fichiers homonymes déposés à la racine : `sealed: true`, `runtimeSealSha256 = 110db4de…`, `runCodeHash = 27610c84…`, 55 fichiers scellés, 15 fichiers de code. Le garde ne refuse un fichier non scellé que sous `core/` ou `contracts/` (`CODE_DIRS`, l.20 et l.51-52) : du markdown et du JSON à la racine sont hors de son champ. Contrôle positif : un `core/stray.js` non scellé le fait bien échouer.
5. **La décision de gel doit trancher** entre :
   - **re-sceller** le lot avec les fichiers d'audit → `SHA256SUMS.txt` change, donc **`runtimeSealSha256` change** (le sceau est le hash de ce fichier), **mais `runCodeHash` NE change PAS** (il ne couvre que `core/` + `contracts/` + `index.js`, l.64-65 — aucun de ces fichiers n'est touché). Le zip canonique devrait alors être reconstruit ;
   - **conserver** les fichiers d'audit hors sceau, comme documents d'accompagnement — option cohérente avec le précédent v1.0.11 et avec le fait que le zip canonique `79c16d08…` a été produit avant eux.

---

## 15. RECOMMANDATION

# GELER

Le lot fait ce qu'il annonce. La cause racine identifiée par l'audit MONOLITH-v1.0.11 § 4 est corrigée **dans le code** — je l'ai vérifié par un différentiel d'exécution v0.3-r1 / v0.4 sur la fixture réelle et par 20 000 tirages sur P1–P6, sans reprendre une seule assertion du fichier de tests livré. Le périmètre est resserré (12 modules `core/` sur 13 byte-identiques, `test/harness.js`, `tools/seal.js`, `tools/anti-hardcoding-scan.js` byte-identiques), le validateur figé est intact, l'intégrité des lots composés est parfaite, tous les chiffres annoncés se reproduisent, aucun secret ni identifiant réel n'est embarqué, et le CAS B ferme correctement.

**Conditions à inscrire dans la décision :**

1. **R5 — obligatoire avant tout run réel sous v0.4.** `MONOLITH-v1.0.12` doit aligner le miroir de l'adaptateur (`lib/ef03b-resilience.js` l.191) sur `mergeRepairLineage` + `recompose(applied)`, faute de quoi le registre EF-03B inscrirait des candidats amputés de leurs références conservées et marquerait `CANDIDATE_VALID` un candidat que le lot refuse.
2. **R6 — obligatoire à l'intégration.** Aligner `VALIDATION_CONTRACT` / `CONTRACT` (`lib/llm.js` l.71, `lib/ef03b-resilience.js` l.167) et `tools/ef03b-registry-import.js` (contrat en dur, reconstruction par l'ancien `recompose`) sur `MONO-11-v3`.
3. **R1 / R2 — correctifs documentaires souhaitables.** Aligner le texte `NO_REFS_EXPECTED` du contrat sur le code (ou ajouter la garde `raw.length === 0 ⇒ FINAL = []`), et corriger `producedBy` en « MONO-11 v0.4 ». Ces deux corrections imposeraient un **re-sceau** et donc une **v0.4-r1** : à arbitrer par le propriétaire entre rigueur documentaire et stabilité du sceau. Ni l'une ni l'autre n'invalide la garantie de lignée.
4. **R3 / R4 — à porter au backlog v0.5.** Ne pas accuser le modèle d'une répétition causée par la conservation système ; renseigner `repairUnresolvedDimensions` même lorsque `parseRepair` échoue.
5. **R11 / R12 — à énoncer au propriétaire.** Le chemin `INFORMED` ne garantit pas la lignée (nouvelle réponse complète légitime) ; le CAS B, désormais fermé, produira davantage de `reviewStatus: "error"` qu'en v0.3-r1.

Le lot est **gelable techniquement**. Le gel reste une décision propriétaire.

---

## 16. TRAÇABILITÉ DE L'AUDIT

| Élément | Valeur |
|---|---|
| Copie de travail | `…/scratchpad/audit-m11v04/copy/` (`rsync -a`, exclusion `.DS_Store`, zips MONO-10/MONO-11 inclus) |
| Sondes écrites par l'auditeur | `probe-props.js` (8 sondes, dont 20 000 tirages P1–P6), `probe-e2e.js` (26 sondes de bout en bout), `probe-tr8.js` (11 sondes fixture + différentiel), `probe-size-informed.js` (taille de trace, chemin INFORMED, miroir adaptateur), `seal-probe.js` |
| Résultat des sondes | 44 succès ; 1 échec **volontaire** (A8 = sonde de divergence contrat/code, → R1) |
| Appels fournisseur / réseau | **0** |
| Runs réels / commits / builds | **0** |
| Octets modifiés dans un artefact livré | **0** |
| Fichiers écrits hors scratch | ces 2 livrables |
