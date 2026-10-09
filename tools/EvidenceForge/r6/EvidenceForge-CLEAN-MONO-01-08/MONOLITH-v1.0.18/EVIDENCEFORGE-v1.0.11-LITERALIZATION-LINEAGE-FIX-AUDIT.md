# EVIDENCEFORGE v1.0.11 — LITERALIZATION LINEAGE FIX — AUDIT DU LOT

**Date :** 2026-09-21 · **Base :** MONOLITH-v1.0.10 (intacte, zip `9f19e639…`, historique du run `efm-20260918-a64167c0` tentative 10) · **Définition :** `v1.0.11 = v1.0.10 + EF-03B LITERALIZATION LINEAGE PRESERVATION` et rien d'autre.
**Coût du lot :** 0 USD — 0 appel fournisseur, 0 réseau, 0 tentative 11, 0 run réel. Run historique, `a962d5ee…`, D103, lots gelés, `ACTIVE_VERSION` (= MONOLITH-v1.0.10) : **inchangés**.
**Statut proposé : GELABLE** (candidat ; le gel appartient au propriétaire / à l'audit indépendant — jamais prononcé ici).

## 1. Cause racine (v1.0.10, `lib/ef03b-resilience.js`, bloc G)

| étape v1.0.10 | ligne | effet |
|---|---|---|
| propositions de littéralisation | l.172 `if (st.ctx.content.indexOf(ref) !== -1) return null;` | les références **déjà littérales** d'une dimension fautive sont exclues des propositions : le modèle ne les voit jamais |
| recomposition | l.175 `RE.recompose(v.parsed, rp.repairs)` (gelé : remplace `targetEvidenceRefs` de chaque dimension réparée par le tableau rendu) | le tableau rendu par le modèle **remplace** l'ensemble des références de la dimension, y compris les originales valides |

Impact observé (audit indépendant `EVIDENCEFORGE-A10-INDEPENDENT-AUDIT-v1`, réserve R1 ; reconstruction `EVIDENCEFORGE-A10-LINEAGE-RESTORATION-v1` = `LINEAGE_RESTORATION_PASS`) : 12 citations valides perdues (4 + 5 + 3 sur 3 revues), 3 constats vidés de citation ; 0 changement de disposition / epistemicStatus / finding / rationale / confiance / limitations ; agrégation et qualification identiques.

## 2. Invariant implémenté

Pour chaque dimension réparée par littéralisation :
`VALID_ORIGINAL_REFS` = refs du brut qui passent le contrôle de littéralité gelé (`isStr(ref) && content.indexOf(ref) !== -1`, `review-enforcer.js` l.90, reproduit à l'identique par `isLiteralRef`) ; `REPAIRED_REFS` = refs rendues par la réparation qui passent le même contrôle ;
**`FINAL_REFS = dedup(VALID_ORIGINAL_REFS ++ REPAIRED_REFS)`** — ordre : originales valides dans l'ordre brut, puis réparées valides dans l'ordre de retour du modèle ; déduplication stable (première occurrence gagnante, égalité exacte de chaîne) ; aucun tri, aucune autre transformation.
Garanties : `FINAL ⊇ VALID_ORIGINAL_REFS` ; `FINAL ⊆ RAW_REFS ∪ REPAIR_REFS` ; chaque élément est littéral. **Une littéralisation ne supprime jamais une référence originale déjà littérale.** Une référence réparée non littérale (ex. `""`) est écartée ; `[]` reste un résultat valide par contrat.

## 3. Diff exact (fichier / fonction / lignes)

### 3.1 `lib/ef03b-resilience.js` (seul changement de comportement)

| fonction | v1.0.10 | v1.0.11 | avant → après |
|---|---|---|---|
| `isLiteralRef(ref, content)` | — | l.125 (AJOUT, pure) | contrôle de littéralité du lot gelé, reproduit |
| `mergeLiteralRefs(rawRefs, repairedRefs, content)` | — | l.133–139 (AJOUT, pure) | rend `{ refs, validOriginal, invalidOriginal, validRepaired, droppedRepaired }` selon l'invariant § 2 |
| `preserveLineageRepairs(parsed, repairs, content)` | — | l.145–149 (AJOUT, pure) | pour chaque dimension réparée : `refs = mergeLiteralRefs(refs brutes de la dimension, refs réparées, content).refs` ; dimensions non réparées absentes (laissées intactes par `RE.recompose`) |
| `reviewCall` — bloc G, recomposition après littéralisation | l.175 : `RE.recompose(v.parsed, rp.repairs)` | l.211–212 : `kept = preserveLineageRepairs(v.parsed, rp.repairs, st.ctx.content)` puis `RE.recompose(v.parsed, kept)` | remplacement du tableau → fusion originales valides + réparées valides |
| `record(...)` de la passe LITERALIZATION | — | l.213 : champ de trace `lineagePreservedRefs` (compteur) | observabilité seule |
| `createReviewRegistry.put` | `schemaVersion: "MONOLITH-v1.0.10"` | `"MONOLITH-v1.0.11"` | version de l'écrivain du registre |
| `module.exports` | — | + `isLiteralRef, mergeLiteralRefs, preserveLineageRepairs` | testabilité |

Non modifiés dans ce fichier : prompts (`buildLiteralizationPrompt`, `buildCompletionPrompt`, préambule de budget), proposition des spans (l.172 conserve son exclusion : les originales littérales n'ont pas besoin d'être proposées, elles sont désormais **conservées** à la recomposition), registre / reuse, troncature / complétion / `mergeFindings`, miroir de la réparation ciblée gelée (`RE.recompose(st.parsed, rp.repairs)`, l.~205 : reste le recompose gelé, pour rester byte-identique au candidat que le lot gelé valide lui-même).

```diff
--- MONOLITH-v1.0.10/lib/ef03b-resilience.js	2026-09-19 16:39:53
+++ MONOLITH-v1.0.11/lib/ef03b-resilience.js	2026-09-21 08:00:40
@@ -1,7 +1,15 @@
 "use strict";
 /**
- * EvidenceForge MONOLITH v1.0.10 — lib/ef03b-resilience.js
+ * EvidenceForge MONOLITH v1.0.11 — lib/ef03b-resilience.js
  * EF-03B REVIEW RESILIENCE : ADAPTATEUR ADDITIF autour de `llmCall` remis au lot gele MONO-11 (review-enforcer, INCHANGE).
+ * v1.0.11 — LITERALIZATION LINEAGE PRESERVATION (correctif du seul bloc G) : la recomposition apres litteralisation ne remplace plus
+ *   le tableau targetEvidenceRefs d'une dimension fautive par la seule reponse du modele ; elle CONSERVE les references originales
+ *   deja litterales (controle gele : isStr + content.indexOf) puis ajoute les references reparees qui passent ce meme controle —
+ *   FINAL = dedup(VALID_ORIGINAL_REFS ++ VALID_REPAIRED_REFS), ordre : originales (ordre brut) puis reparees (ordre du modele),
+ *   deduplication stable (premiere occurrence). Invariant : FINAL ⊇ VALID_ORIGINAL_REFS et FINAL ⊆ RAW_REFS ∪ REPAIR_REFS.
+ *   Cause racine v1.0.10 (run efm-20260918-a64167c0, tentative 10 : 12 citations valides perdues, 3 constats vides) : les references
+ *   deja litterales etaient exclues des propositions (jamais revues par le modele) puis RE.recompose (gele) remplacait le tableau entier.
+ *   Prompts, validateurs, registre, troncature, agregation, rapport : inchanges.
  * Le lot gele garde le prompt EF-03B, le validateur local a schema ferme, les strategies de reprise et le validateur EF-03B gele
  * (seule autorite d'acceptation). Cet adaptateur agit UNIQUEMENT sur ce qui entre et sort du transport :
  *   E. REGISTRE DES REVUES VALID : cle = sha256 du prompt EF-03B de passe 1 (= jumeau + preuves + document + schema) + sceau + contrat ;
@@ -112,12 +120,40 @@
   return lines.join("\n");
 }
 
+/* ===================== 5 bis. v1.0.11 — preservation de la lignee : fusion des references (fonction PURE) ===================== */
+/** isLiteralRef(ref, content) : le controle de litteralite du lot gele (review-enforcer : isStr(ref) && content.indexOf(ref) !== -1), reproduit a l'identique. */
+function isLiteralRef(ref, content) { return isStr(ref) && String(content == null ? "" : content).indexOf(ref) !== -1; }
+/**
+ * mergeLiteralRefs(rawRefs, repairedRefs, content) -> { refs, validOriginal, invalidOriginal, validRepaired, droppedRepaired }
+ * FINAL = dedup(VALID_ORIGINAL_REFS ++ VALID_REPAIRED_REFS) : originales litterales dans leur ordre brut, puis reparees litterales dans
+ * l'ordre de retour du modele ; deduplication stable par egalite exacte de chaine (premiere occurrence gagnante) ; aucune autre transformation.
+ * Garanties : refs ⊇ validOriginal ; refs ⊆ rawRefs ∪ repairedRefs ; chaque element passe isLiteralRef. Une reference originale deja
+ * litterale n'est JAMAIS supprimee par une litteralisation. Fonction pure : meme entree => meme sortie.
+ */
+function mergeLiteralRefs(rawRefs, repairedRefs, content) {
+  const raw = Array.isArray(rawRefs) ? rawRefs : [], rep = Array.isArray(repairedRefs) ? repairedRefs : [];
+  const validOriginal = raw.filter((r) => isLiteralRef(r, content)), invalidOriginal = raw.filter((r) => !isLiteralRef(r, content));
+  const validRepaired = rep.filter((r) => isLiteralRef(r, content)), droppedRepaired = rep.filter((r) => !isLiteralRef(r, content));
+  const refs = []; validOriginal.concat(validRepaired).forEach((r) => { if (refs.indexOf(r) === -1) refs.push(r); });
+  return { refs: refs, validOriginal: validOriginal, invalidOriginal: invalidOriginal, validRepaired: validRepaired, droppedRepaired: droppedRepaired };
+}
+/**
+ * preserveLineageRepairs(parsed, repairs, content) -> repairs' : pour chaque dimension reparee, targetEvidenceRefs = mergeLiteralRefs(refs brutes
+ * de la dimension dans `parsed`, refs reparees, content).refs. Les dimensions non reparees ne figurent pas dans repairs' (RE.recompose, gele,
+ * les laisse intactes). Seul le champ targetEvidenceRefs est concerne : aucun autre champ du constat n'est lu ni modifie.
+ */
+function preserveLineageRepairs(parsed, repairs, content) {
+  const byDim = {}; (parsed && Array.isArray(parsed.findings) ? parsed.findings : []).forEach((f) => { if (f && isStr(f.dimensionId)) byDim[f.dimensionId] = f; });
+  const out = {}; Object.keys(repairs || {}).forEach((d) => { out[d] = mergeLiteralRefs(byDim[d] ? byDim[d].targetEvidenceRefs : [], repairs[d], content).refs; });
+  return out;
+}
+
 /* ===================== 6. registre des revues VALID (par run ; cle = prompt de passe 1 + sceau + contrat) ===================== */
 function createReviewRegistry(opts) {
   const file = path.join(opts.runDir, REGISTRY_FILE); const extra = (opts.extraFiles || []).filter((f) => fs.existsSync(f));
   const read = () => [file].concat(extra).flatMap((f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []);
   function find(basePromptSha256, sealHash, contract) { const all = read().filter((e) => e.basePromptSha256 === basePromptSha256 && e.validationContract === contract && (e.sourceSealHash || null) === (sealHash || null) && e.status === "VALID"); return all.length ? all[all.length - 1] : null; }
-  function put(entry) { fs.mkdirSync(opts.runDir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(Object.assign({ schema: "EvidenceForge.ValidReviewRecord", schemaVersion: "MONOLITH-v1.0.10", status: "VALID", recordedAt: new Date().toISOString() }, entry)) + "\n"); return entry; }
+  function put(entry) { fs.mkdirSync(opts.runDir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(Object.assign({ schema: "EvidenceForge.ValidReviewRecord", schemaVersion: "MONOLITH-v1.0.11", status: "VALID", recordedAt: new Date().toISOString() }, entry)) + "\n"); return entry; }
   return { find, put, list: read, file };
 }
 
@@ -172,8 +208,9 @@
       const proposals = faulty.map((d) => ({ dimensionId: d, refs: (rejected[d] || []).map((ref) => { if (st.ctx.content.indexOf(ref) !== -1) return null; const c = classifyNonLiteralRef(ref, st.ctx.content); const sp = c.exactSpan ? findExactSpan(ref, st.ctx.content, { markdown: c.klass !== "WHITESPACE_LINEBREAK_ONLY" }) : null; return { ref, klass: c.klass, exactSpan: c.exactSpan, start: sp ? sp.start : null, end: sp ? sp.end : null }; }).filter(Boolean) }));
       if (proposals.some((p) => p.refs.some((x) => x.exactSpan))) { const rctx = RE.repairContext({ twin: { twinId: meta.twinId, professionalRef: meta.professionalRef || null }, targetDoc: docLike(st.ctx), parsed: v.parsed, faultyDimensions: faulty });
         const rl = await call(buildLiteralizationPrompt(st.ctx, proposals, { excerptChars: cfg.excerptChars, context: rctx }), meta, { purpose: "EF-03B review literalization", strategy: STRATEGY.LITERALIZATION, repairScope: faulty, repairContextFingerprint: rctx.fingerprint }); stats.literalizations++;
-        const rp = RE.parseRepair(rl.text, faulty); const lit = rp.ok || Object.keys(rp.repairs || {}).length ? JSON.stringify(RE.recompose(v.parsed, rp.repairs || {})) : null; const vl = lit ? mirrorParsed(st, lit) : null;
-        record(st, meta, rl, lit || cand, vl || v, { strategy: STRATEGY.LITERALIZATION, state: vl ? (vl.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID") : "REPAIR_UNPARSABLE", repairScope: faulty, reusedFieldsCount: dims.length - faulty.length, regeneratedFieldsCount: Object.keys(rp.repairs || {}).length, validationErrorsCountBefore: v.errors.length, classes: proposals.flatMap((p) => p.refs.map((x) => x.klass)) });
+        const rp = RE.parseRepair(rl.text, faulty); const kept = preserveLineageRepairs(v.parsed, rp.repairs || {}, st.ctx.content);   /* v1.0.11 : originales litterales conservees + reparees litterales ; jamais un remplacement du tableau */
+        const lit = rp.ok || Object.keys(rp.repairs || {}).length ? JSON.stringify(RE.recompose(v.parsed, kept)) : null; const vl = lit ? mirrorParsed(st, lit) : null;
+        record(st, meta, rl, lit || cand, vl || v, { strategy: STRATEGY.LITERALIZATION, state: vl ? (vl.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID") : "REPAIR_UNPARSABLE", repairScope: faulty, reusedFieldsCount: dims.length - faulty.length, regeneratedFieldsCount: Object.keys(rp.repairs || {}).length, validationErrorsCountBefore: v.errors.length, classes: proposals.flatMap((p) => p.refs.map((x) => x.klass)), lineagePreservedRefs: Object.keys(kept).reduce((n, d) => n + mergeLiteralRefs(((v.parsed.findings.find((f) => f && f.dimensionId === d) || {}).targetEvidenceRefs), [], st.ctx.content).validOriginal.length, 0) });
         if (vl && vl.errors.length < v.errors.length) { cand = lit; composite = true; v = vl; } } }
     if (composite) callId = "ef03b-composite-" + sha(cand); st.candidates[callId] = cand; byCallId[callId] = st;
     return Object.assign({}, r, { text: cand, callId: callId, stopReason: "end_turn", composite: composite, transportKind: composite ? "EF03B_COMPOSITE_CANDIDATE" : r.transportKind });
@@ -187,4 +224,4 @@
   return { llmCall, onValidation, stats: () => Object.assign({}, stats, { reviews: order.map((k) => ({ twinId: reviews[k].twinId, targetId: reviews[k].targetId, passes: reviews[k].passes.length, costUsd: reviews[k].costUsd })) }), registry, config: cfg, STRATEGY };
 }
 
-module.exports = { createReviewAdapter, createReviewRegistry, parseReviewPromptContext, validateCandidate, outputBudgetPreamble, OUTPUT_BUDGET, salvageTruncatedFindings, mergeFindings, buildCompletionPrompt, buildLiteralizationPrompt, normalizeForMatch, findExactSpan, classifyNonLiteralRef, REVIEW_OUTPUT_TRUNCATED, STRATEGY, REGISTRY_FILE, TRACE_FILE };
+module.exports = { createReviewAdapter, createReviewRegistry, parseReviewPromptContext, validateCandidate, outputBudgetPreamble, OUTPUT_BUDGET, salvageTruncatedFindings, mergeFindings, buildCompletionPrompt, buildLiteralizationPrompt, normalizeForMatch, findExactSpan, classifyNonLiteralRef, isLiteralRef, mergeLiteralRefs, preserveLineageRepairs, REVIEW_OUTPUT_TRUNCATED, STRATEGY, REGISTRY_FILE, TRACE_FILE };
```

### 3.2 Autres fichiers (version, tests, outillage — aucun comportement runtime)

| fichier | sha256 v1.0.10 → v1.0.11 | nature |
|---|---|---|
| `config/monolith.config.json` | `3339894a9db1…` → `2451b2a5f299…` | `product.version` → `MONOLITH-v1.0.11` ; `$comment` de définition ; **aucune valeur d'exploitation changée** (`reviewMaxTokens`, `reviewResilience`, streaming, budget : identiques) |
| `lib/pipeline.js` | `ea2dadeb88e0…` → `7e2d718bf11e…` | `schemaVersion` de `ef03b-resilience.json` → v1.0.11 (une chaîne) |
| `tools/ef03b-autopsy.js` | `ccab1b6ea881…` → `00e244afeb9b…` | `schemaVersion` du replay hors ligne → v1.0.11 (une chaîne) |
| `tools/build-manifest.js` | `b187d62965a7…` → `8c9a6469626e…` | prédécesseur = v1.0.10 (zip `9f19e639…`), provenance, statut CANDIDAT (v1.0.11), champ `ef03b.lineagePreservation` |
| `tools/package.sh` | `e2b36bc3edce…` → `5bb461bb7009…` | nom du zip v1.0.11 |
| `README.md` | `7423fef528c6…` → `9d866155d42e…` | en-tête v1.0.11 ajouté (historique conservé) |
| `test/test-ef03b.js` | `0ccb5236c301…` → `62e2c335d2a7…` | en-tête ; chargement de `test/test-ef03b-lineage.js` |
| `test/test-stream.js` | `9c208e31ec56…` → `aa37e0118fd0…` | T-STREAM-20 : version attendue `MONOLITH-v1.0.11` (une chaîne) |
| `test/test-ef03b-lineage.js` | — → `7c4922017101…` | **AJOUT** : T-EF03B-27…35 |
| `test/fixtures/ef03b-lineage-a10-cases.json` | — → `557b118885ef…` | **AJOUT** : fixture historique anonymisée (§ 4, T6) |
| `test/results.json`, `test/results-chunking.json` | régénérés | résultats des suites (274/274, 21/21) |
| `MANIFEST.json`, `SHA256SUMS.txt` | régénérés par `tools/build-manifest.js` | provenance mesurée |

Fichiers **non touchés** (byte-identiques à v1.0.10, vérifiés par `diff -rq`) : `server.js`, `index.html`, `lib/llm.js`, `lib/llm-stream.js`, `lib/llm-transport.js`, `lib/live-status.js`, `lib/cost-view.js`, `lib/stage-professionals.js`, `lib/stage-report.js`, `lib/panel-sufficiency.js`, `lib/economic-panel.js`, `lib/budget-guard.js`, `lib/run-stop.js`, `lib/run-store.js`, tous les autres `lib/*`, `worker/` (proxy v0.8), `vendor/`, `governance/`, `fixtures/`, documents de lot. Lots gelés MONO-01 / 09 / 10 / 11 : **0 divergence** (`P.verifyFrozenLots()` : 106 / 9 / 79 / 52 fichiers) ; `MONO-11/v0.3-r1/core/review-enforcer.js` sha256 `42de4c51daa1e33d…` inchangé ; `RE.recompose`, `RE.parseRepair`, `validateReviewCandidate` : jamais modifiés.

## 4. Tests

| id | mandat | contenu | résultat |
|---|---|---|---|
| T-EF03B-27 | **T1** preserve valid originals | brut `[validA, invalidB]` + réparation `[validB]` → `[validA, validB]` ; accepté passe 1 ; 1 littéralisation ; trace `lineagePreservedRefs = 1` ; autres champs intacts | ok |
| T-EF03B-28 | **T2** all originals valid | brut `[validA, validB]` → aucune littéralisation, refs byte-identiques ; fonction pure : réparation `[]` → `[validA, validB]` ; réparée littérale ajoutée après les originales | ok |
| T-EF03B-29 | **T3** invalid repaired to valid | `[invalidB]` + `[validB]` → `[validB]` ; réparations non littérales (`""`, chaîne inventée) écartées ; `[]` accepté par contrat | ok |
| T-EF03B-30 | **T4** duplicate repaired ref | `[validA]` + `[validA]` → `[validA]` ; `[validA, invalidB]` + `[validA, validB, validB]` → `[validA, validB]` ; doublon du brut dédoublonné | ok |
| T-EF03B-31 | **T5** mixed multi-dimension | DIM-02 réparée ; DIM-01 / DIM-03 (uniquement valides) byte-identiques refs comprises ; `repairScope = [DIM-02]` ; `preserveLineageRepairs` ne rend que la dimension réparée | ok |
| T-EF03B-32 | **T6** historical regression fixture | 4 revues observées (CASE-A..D = 3 littéralisations + 1 réparation ciblée), 16 dimensions, document synthétique anonymisé (jetons de cas substitués de façon injective ; références non littérales absentes du document, vérifié) : chaîne des réparations tracées → `expectedFinal` 16/16 ; **12 références historiquement perdues conservées** ; **3 constats vides restaurés** (CASE-A/DISC-07, CASE-B/DISC-03, CASE-C/DISC-06) ; invariants ⊇ / ⊆ / littéral ; persisté A10 ⊆ restauré | ok |
| T-EF03B-33 | non-régression sémantique | 3 dimensions réparées : tous les champs du brut sauf `targetEvidenceRefs` byte-identiques (disposition, epistemicStatus, finding, rationale, confidenceQualitative, limitations, twinBasisWorkRefs) ; registre = candidat accepté | ok |
| T-EF03B-34 | pureté et frontière | fonctions pures, non mutantes, entrées dégradées sans exception ni chaîne hors document ; **un seul point de fusion** (littéralisation) ; miroir de la réparation ciblée = recompose gelé ; MONO-11 0 divergence | ok |
| T-EF03B-35 | **shadow historique** (lecture seule ; SKIPPED si intrants absents) | intrants archivés A10 (llm-cache, llm-calls, cost-ledger, twins, document, schéma) + nouvelle recomposition seule, chaînée sur les réparations tracées → **70 constats (7 revues réelles A10, dont 4 réparées) byte-identiques à `reviews-restored.json`** sur `targetEvidenceRefs` ; autres champs == `reviews.json` du run ; aucune écriture dans le run (mtimes vérifiés) | ok (exécuté, non SKIPPED) |

Suites : `node test/test-monolith.js` **274/274** (v1.0.10 : 265/265 + 9 nouveaux ; inclut EF-03B 01–25, streaming, panel, économie, run safety, anti-hardcoding, secrets, intégrité) ; `node test/test-chunking.js` **21/21** ; `node tools/secret-scan.js` 0 hit ; `node tools/anti-hardcoding-scan.js` ok (74 fichiers, 0 hit — la fixture et le test sont anonymisés) ; `node tools/build-manifest.js --verify` ok. Non exécuté : `tools/EvidenceForge/test/test-launch.js` (teste la version **active**, v1.0.10 — inchangée) et les tests navigateur (CDP).

## 5. Preuve de non-régression sémantique

- Tests T-EF03B-31 / 33 : sur fixtures, avant / après littéralisation, seul `targetEvidenceRefs` diffère (comparaison clé par clé sur les clés du brut ; le parseur gelé ajoute `findingId` / `twinId` / `professionalRef` / `targetId`, inchangé).
- Le correctif ne lit que `targetEvidenceRefs` (`preserveLineageRepairs` : `byDim[d].targetEvidenceRefs`) et ne produit que ce champ ; `RE.recompose` (gelé) copie les autres champs tels quels (`Object.assign({}, f, { targetEvidenceRefs })`).
- Le candidat recomposé est ensuite **revalidé** par `validateCandidate` (lot gelé) puis par le lot gelé lui-même avant acceptation — inchangé.

## 6. Comparaison avec la shadow restoration

`~/evidenceforge-work/reports/a10-lineage-restoration/reviews-restored.json` (sha256 `e5e5daeeb4b0549d195bf1efdfeab03233aeabe0ce9e255a3c7e09e089e5f358`) = référence produite hors ligne par l'auditeur indépendant avec la règle « A (ordre brut) ∪ réparées valides (ordre modèle), dédup exacte ». T-EF03B-35 applique la **fonction du patch** (`preserveLineageRepairs` + `RE.recompose`) aux intrants archivés : 70/70 constats byte-identiques sur `targetEvidenceRefs` (4 revues réparées + 3 revues réelles sans réparation), autres champs identiques au run. La règle du patch et la règle de la reconstruction sont donc la même fonction.

## 7. Conséquence de comportement à connaître (hors non-régression, à décider au gel)

Sous v1.0.10, une réparation rendant une chaîne non littérale (ex. `""`) laissait le candidat invalide et déclenchait la réparation ciblée gelée (passe 2). Sous v1.0.11, cette chaîne est écartée (mandat : `REPAIRED_REFS` = réparées **qui passent le contrôle**) ; si la dimension n'avait aucune originale valide, elle devient `[]` — résultat **valide par contrat** (« répondez [] si aucune citation adéquate n'existe ») — et la passe 2 gelée n'est plus déclenchée pour cette seule raison. Cela réduit les appels sans relâcher le contrat (le validateur gelé reste seule autorité) ; le contenu des jugements n'est jamais touché. Le test shadow (T-EF03B-35) chaîne les réparations **tracées** telles qu'elles ont eu lieu ; il ne rejoue pas la décision de déclencher la passe 2.

Limite (hors périmètre, lot gelé) : la réparation ciblée **gelée** (passe ≥ 2, `review-enforcer.js` : `parseRepair` + `recompose`) remplace elle aussi le tableau entier par la réponse du modèle ; elle n'a rien perdu au run A10 (A5081732198 : 2 originales conservées par le modèle), mais l'invariant § 2 n'y est garanti que par le modèle, pas par le code. Toute garantie à ce niveau exigerait une v0.3-r2 du lot MONO-11 (audit + gel séparés).

## 8. Hashes (fichiers modifiés / ajoutés, v1.0.11)

```
18739b7aac108f915edef04d53001d33e072c48b8a0f74497e4fca6bc4b76487  lib/ef03b-resilience.js
7e2d718bf11efc2efb788912f91382887269226509d36a5da6260e25eb8d5e0a  lib/pipeline.js
2451b2a5f2994ea14c92e035641cc44aeca01cf1e79683aed174f1596322dae6  config/monolith.config.json
8c9a6469626e9c6723cd30081bc279b6b53ccf12c4dbe1ac87a148e4eee1a5fa  tools/build-manifest.js
00e244afeb9b3eda31980723c14259ebe30f53bd442e4c9559581856df8a75f6  tools/ef03b-autopsy.js
5bb461bb700995774d6b8333ecf91c9c1be08076fc854c686cce81dbf1d00a8a  tools/package.sh
9d866155d42e114ed7309b5ac7a3365176f2be677597d12662a3cc4083fbdfa6  README.md
62e2c335d2a70726696fef19f4b8e345d3b1e7d418a389b0a693d0d096ac6254  test/test-ef03b.js
7c4922017101569389d5ea613692de6308e78007d887e160e5baef5ab08e5e9c  test/test-ef03b-lineage.js
557b118885ef1d0bc531ddede309632735180755a4dbb8e43bf42a9a6c9fea64  test/fixtures/ef03b-lineage-a10-cases.json
aa37e0118fd0921d86c793f498425bdf91c32ffcc9e901d1af7e2659ff799a56  test/test-stream.js
```

## 9. Liste exacte des fichiers modifiés / ajoutés

Modifiés (11) : `lib/ef03b-resilience.js`, `lib/pipeline.js`, `config/monolith.config.json`, `tools/build-manifest.js`, `tools/ef03b-autopsy.js`, `tools/package.sh`, `README.md`, `test/test-ef03b.js`, `test/test-stream.js`, `test/results.json`, `test/results-chunking.json`. Ajoutés (3) : `test/test-ef03b-lineage.js`, `test/fixtures/ef03b-lineage-a10-cases.json`, ce rapport. Régénérés : `MANIFEST.json`, `SHA256SUMS.txt`. Exclus de la copie : `EvidenceForge-MONOLITH-v1.0.10.zip(.sha256)` (restent dans v1.0.10).

## 10. Interdictions respectées

0 appel fournisseur · 0 réseau · 0 tentative 11 · 0 run · 0 modification du run historique (`efm-20260918-a64167c0` : mtimes vérifiés par T-EF03B-35) · 0 modification D103 · `a962d5ee…` non remplacé · `ACTIVE_VERSION` = MONOLITH-v1.0.10 inchangé · 0 changement scientifique (validateurs, prompts, agrégation, rapport intacts) · 0 nouvelle logique métier (une fusion de chaînes, pure, sur un seul champ) · MONOLITH-v1.0.10 non écrasée.

**Statut proposé : GELABLE** — sous réserve d'un audit indépendant du lot et de la décision propriétaire de bascule (`ACTIVE_VERSION`). Aucun run réel de validation n'a été effectué ; le comportement du § 7 est à confirmer au gel.
