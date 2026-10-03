# EVIDENCEFORGE v1.0.14 — SINGLE NORMALIZED DOCUMENT AUTHORITY — RAPPORT

**Statut proposé : GELABLE** — NON GELÉ · généré 2026-09-22T17:39:33+00:00 · `ACTIVE_VERSION` reste **MONOLITH-v1.0.10** · statut de lignée : **GLOBAL_LINEAGE_PRESERVATION_CANDIDATE** · 0 appel fournisseur, 0 run réel, 0 smoke.

**Base** : construite depuis **MONOLITH-v1.0.12 (GELEE)**. MONOLITH-v1.0.13 (REJECTED_CANDIDATE_AFTER_INDEPENDENT_AUDIT) — aucune copie aveugle ; seuls le correctif R-A1 valide et une NOUVELLE implementation R-A2 ont ete reimportes.

## Preuve : brut ≠ normalisé (run réel)

`run reel efm-20260918-a64167c0, normalization-records.json` — `target-01` : `changed = true`, original `384a263fff937610…` ≠ normalisé `7885c6ec401676cc…`, transformations : **APOSTROPHE ×153**, NFC/DOUBLE_QUOTE/NBSP/LINE_ENDINGS : 0. Une citation du document normalisé peut donc être **absente du brut exact** — c'est exactement le défaut B1/B2 de v1.0.13.

## Source d'autorité retenue

- **chosen** : reproduction avec le module GELE du lot (TN.normalizeTargetDocument) sur la MEME entree et la MEME indexation que runDownstreamFromCheckpoint
- **why** : le targetDocumentSet normalise est construit a l interieur du lot gele et n est pas expose a l appelant avant l execution ; la reproduction est deterministe et idempotente (regles fermees, RULE_SET_ID "MONO11-TARGET-NORMALIZATION-v1")
- **parityAssertion** : l adaptateur verifie que l autorite est un point fixe des regles gelees (TN.normalizeText(c) === c) ; les tests E2E verifient en plus sha(autorite) === sha(getDocumentForTarget(tds, targetId).content)
- **failClosed** : absence, vide, ou non-normalisation => erreur fatale ; aucun repli sur le brut, aucun repli sur le prompt

## Bloquants traités

### B1

- **Constat** : l autorite cablee n etait pas le document remis au lot : MONO-11 normalise (core/target-normalizer.js, applique par core/autonomous-run.js l.158-161 avant buildTargetDocumentSet) et juge contre le contenu NORMALISE ; v1.0.13 fournissait le BRUT
- **Correctif** : lib/pipeline.js : table target-NN -> TNorm.normalizeTargetDocument(...).document.content avec le module GELE du lot, meme entree, meme indexation ; lib/ef03b-resilience.js : garde de normalisation (point fixe) => DOCUMENT_AUTHORITY_NOT_NORMALIZED (fatal) si l autorite n est pas le contenu normalise
- **Preuve** : RA2-E2E-01..04 verifient sha(autorite cablee) === sha(document examine par le lot) sur apostrophe / NBSP / CRLF / NFC ; M1 tue par 5 tests

### B2

- **Constat** : regression prouvee : citation valide detruite, revue degradee en error
- **Correctif** : consequence directe de B1 ; la citation issue du document normalise est litterale des deux cotes
- **Preuve** : RA2-E2E-01..04 : revue acceptee passe 1, citation conservee, registre correct ; RA2-04 : autorite brute refusee (fatal), autorite normalisee acceptee

### B3

- **Constat** : le cablage n etait protege par aucun test (mutation -> 303/303)
- **Correctif** : RA2-E2E-01..08 executent le CODE REEL de lib/pipeline.js (extrait de la source et evalue) ; aucune injection directe d autorite
- **Preuve** : matrice de mutation M1 / M2 / M3 : chaque mutant du cablage est tue par des tests nommes

### B4

- **Constat** : tools/ef03b-registry-import.js n ecrivait pas documentAuthoritySha256 : entrees inservables
- **Correctif** : empreinte calculee sur le document NORMALISE du run ; autorite manquante / non normalisee => IMPORT FAIL CLOSED
- **Preuve** : RI-01..RI-03 ; M4 et M4b tues

## Diff v1.0.12 → v1.0.14

| fichier | avant | après | nature |
|---|---|---|---|
| `lib/ef03b-resilience.js` | `564a0e3d7a50…` | `ea86f11528be…` | R-A2 : resolveur documentAuthority obligatoire + garde de NORMALISATION (point fixe des regles gelees TN.normalizeText) => DOCUMENT_AUTHORITY_REQUIRED / _EMPTY / _NOT_NORMALIZED (fatal) ; withAuthority (forme du prompt, CONTENU de l autorite normalisee, ecart compte et trace) ; registre cle par documentAuthoritySha256 + refus trace ; R-A1 : reparation illisible non recomposee (REPAIR_UNPARSABLE, dimensions fautives du lot) |
| `lib/pipeline.js` | `204862ccdb2e…` | `de4049c45394…` | cablage de l AUTORITE NORMALISEE : table target-NN -> TNorm.normalizeTargetDocument(...).document.content avec le module GELE du lot, meme entree et meme indexation que runDownstreamFromCheckpoint ; schemaVersion |
| `tools/ef03b-registry-import.js` | `c6d694ac4a03…` | `70502a66a141…` | B4 : documentAuthoritySha256 calcule sur le document NORMALISE du run (authoritySha) ; REGISTRY_IMPORT_AUTHORITY_MISSING / _NOT_NORMALIZED (fail closed) |
| `config/monolith.config.json` | `a34cc964c141…` | `e46902287520…` | product.version MONOLITH-v1.0.14 ; $comment de definition |
| `tools/build-manifest.js` | `af1f086c5935…` | `40f7b8330b5b…` | predecesseur v1.0.12 (+ mention du rejet de v1.0.13), provenance, statut candidat v1.0.14, champs ef03b.singleNormalizedDocumentAuthority / registryImportAuthority / traceParity |
| `tools/ef03b-autopsy.js` | `bb310c6ae708…` | `e3315b01a3e5…` | schemaVersion |
| `tools/package.sh` | `93400b4f8fd6…` | `b1383566cee2…` | nom du zip |
| `README.md` | `661c8d6d862a…` | `263d1a4d42a6…` | en-tete v1.0.14 (historique conserve) |
| `test/test-ef03b.js` | `0e0b7d530f15…` | `91aa3513a710…` | autorite NORMALISEE (AUTHORITY) injectee dans les constructions d adaptateur ; documentAuthoritySha256 sur les entrees de registre ecrites directement ; chargement des 2 modules v1.0.14 |
| `test/test-ef03b-lineage.js` | `35508d776d6d…` | `1690f79ba97d…` | autorite normalisee injectee |
| `test/test-v1012-lineage-parity.js` | `a077d59b2722…` | `52e1be342b75…` | autorite normalisee injectee ; version du produit |
| `test/test-stream.js` | `dd23140a619c…` | `c852cbf1b1db…` | version du produit |
| `test/results.json` | `4ff7dc2080f2…` | `8385109288af…` | resultats (313/313) |
| `test/results-chunking.json` | `17a17576bbfa…` | `e7fcfb92a949…` | resultats (21/21) |
| `MANIFEST.json` | `d8bb0d3e7c28…` | `4ae8962b3d25…` | mesure (313/313, 160 fichiers, contentHash 77c05052d052…) |
| `SHA256SUMS.txt` | `3c1c736fd19b…` | `328411701477…` | sceau du paquet |
| `test/test-v1014-normalized-authority.js` | — | `3b0938fe4b0d…` | AJOUT — RA2-01..08 (autorite normalisee) et RA1-01..03 (tautologies remplacees par des assertions discriminantes) |
| `test/test-v1014-e2e-wiring.js` | — | `b4911c4eb4a1…` | AJOUT — RA2-E2E-01..08 (cablage REEL extrait de lib/pipeline.js et execute) + RI-01..07 (import de registre) |

Byte-identiques : lib/llm.js, lib/stage-professionals.js, lib/stage-report.js, lib/panel-sufficiency.js, lib/economic-panel.js, lib/llm-stream.js, lib/live-status.js, lib/cost-view.js, server.js, index.html, worker/ (proxy v0.8), vendor/, governance/, fixtures/. Lots gelés : MONO-01 / MONO-09 / MONO-10 / MONO-11 v0.4 : 0 divergence ; aucun lot modifie.

### Diff de `lib/ef03b-resilience.js`

```diff
--- MONOLITH-v1.0.12/lib/ef03b-resilience.js	2026-09-22 14:02:30
+++ MONOLITH-v1.0.14/lib/ef03b-resilience.js	2026-09-22 19:17:26
@@ -1,7 +1,19 @@
 "use strict";
 /**
- * EvidenceForge MONOLITH v1.0.12 — lib/ef03b-resilience.js
+ * EvidenceForge MONOLITH v1.0.14 — lib/ef03b-resilience.js
  * EF-03B REVIEW RESILIENCE : ADAPTATEUR ADDITIF autour de `llmCall` remis au lot gele MONO-11 (review-enforcer, INCHANGE).
+ * v1.0.14 — SINGLE NORMALIZED DOCUMENT AUTHORITY (R-A2, correctif de la candidate v1.0.13 REJETEE) : la litteralite n'est jamais jugee
+ *   sur une reconstruction du prompt NI sur le contenu BRUT. L'adaptateur exige une AUTORITE DOCUMENTAIRE `documentAuthority(targetId)`
+ *   qui doit rendre EXACTEMENT le contenu NORMALISE examine par MONO-11 (core/target-normalizer.js, applique par autonomous-run.js avant
+ *   buildTargetDocumentSet). Le correctif v1.0.13 fournissait le contenu BRUT : faux des qu'un document contient ' " NBSP CRLF ou une
+ *   forme non-NFC (audit independant v1.0.13, B1/B2 — regression prouvee).
+ *   - autorite absente / vide => FAIL CLOSED (DOCUMENT_AUTHORITY_REQUIRED / DOCUMENT_AUTHORITY_EMPTY, erreurs fatales) ;
+ *   - autorite NON NORMALISEE (TN.normalizeText(c) !== c, controle avec le module GELE du lot) => FAIL CLOSED
+ *     (DOCUMENT_AUTHORITY_NOT_NORMALIZED) : jamais de repli sur le brut, jamais de repli sur le prompt ;
+ *   - ecart prompt-autorite compte (contextContentMismatch) et trace (DOCUMENT_AUTHORITY_MISMATCH) ; l'autorite fait toujours foi ;
+ *   - registre : chaque entree porte documentAuthoritySha256 (empreinte du contenu NORMALISE) et n'est servie qu'a empreinte identique.
+ * v1.0.14 — RA1 TRACE PARITY (reimporte de v1.0.13, forme validee par l'audit) : une reparation illisible n'est plus recomposee par le
+ *   miroir ; trace REPAIR_UNPARSABLE, dimensions fautives du lot, codes d'erreur ; aucune ecriture au registre ; decision du lot inchangee.
  * v1.0.12 — GLOBAL LINEAGE PRESERVATION : le miroir de la reparation ciblee gelee (branche isTargeted) applique RE.mergeRepairLineage du lot
  *   MONO-11 v0.4 (contrat MONO-11-v3) AVANT RE.recompose : le candidat trace / inscrit au registre est byte-identique a celui que le lot
  *   gele valide (R5 de l'audit independant v1.0.11). Le contrat de validation vient de la configuration du lot (R6). Bloc G inchange.
@@ -28,7 +40,8 @@
  */
 const fs = require("fs"), path = require("path"), crypto = require("crypto");
 const P = require("./paths.js"); const CL = require("./cost-ledger.js");
-const RE = require(path.join(P.MONO11, "core", "review-enforcer.js"));   /* fonctions PURES du lot gele, utilisees telles quelles (jamais modifiees) */
+const RE = require(path.join(P.MONO11, "core", "review-enforcer.js"));
+const TN = require(path.join(P.MONO11, "core", "target-normalizer.js"));   /* v1.0.14 : module GELE de normalisation du lot — seule reference pour prouver qu'une autorite est bien le contenu normalise */   /* fonctions PURES du lot gele, utilisees telles quelles (jamais modifiees) */
 const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
 const REVIEW_OUTPUT_TRUNCATED = "REVIEW_OUTPUT_TRUNCATED";
 const STRATEGY = Object.freeze({ REGISTRY: "REGISTRY_REUSE", BASE: "BASE_WITH_OUTPUT_BUDGET", COMPLETION: "TRUNCATION_COMPLETION", LITERALIZATION: "LITERALIZATION_EXCERPTS", PASSTHROUGH: "PASSTHROUGH" });
@@ -74,6 +87,7 @@
     const dims = dimsBlock.split("\n").map((l) => { const m = /^([^:\s]+): (.*?) — ([\s\S]*)$/.exec(l); return m ? { id: m[1], label: m[2], definition: m[3] } : null; }).filter(Boolean); if (!dims.length || !content) return null;
     return { targetId: targetId, content: content, workRefs: workRefs, dims: dims, basisLine: bl.slice(0, bl.indexOf("\n")) }; } catch (e) { return null; }
 }
+/** v1.0.14 — le document remis au validateur porte TOUJOURS le contenu normalise d'autorite (ctx.content vient de withAuthority). */
 const twinLike = (ctx) => ({ twinId: null, documentaryBasis: { worksUsed: ctx.workRefs.map((r) => ({ workRef: r })) } });
 const docLike = (ctx) => ({ targetId: ctx.targetId, content: ctx.content });
 const schemaLike = (ctx) => ({ dimensions: ctx.dims.map((d) => ({ id: d.id })) });
@@ -155,8 +169,10 @@
 function createReviewRegistry(opts) {
   const file = path.join(opts.runDir, REGISTRY_FILE); const extra = (opts.extraFiles || []).filter((f) => fs.existsSync(f));
   const read = () => [file].concat(extra).flatMap((f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []);
-  function find(basePromptSha256, sealHash, contract) { const all = read().filter((e) => e.basePromptSha256 === basePromptSha256 && e.validationContract === contract && (e.sourceSealHash || null) === (sealHash || null) && e.status === "VALID"); return all.length ? all[all.length - 1] : null; }
-  function put(entry) { fs.mkdirSync(opts.runDir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(Object.assign({ schema: "EvidenceForge.ValidReviewRecord", schemaVersion: "MONOLITH-v1.0.12", status: "VALID", recordedAt: new Date().toISOString() }, entry)) + "\n"); return entry; }
+  /** v1.0.14 : une entree n'est servie que si elle porte la MEME empreinte d'autorite documentaire NORMALISEE ; une entree sans empreinte (ere <= v1.0.13, autorite indemontrable) n'est jamais servie. */
+  function find(basePromptSha256, sealHash, contract, documentAuthoritySha256) { const all = read().filter((e) => e.basePromptSha256 === basePromptSha256 && e.validationContract === contract && (e.sourceSealHash || null) === (sealHash || null) && e.status === "VALID"
+    && (documentAuthoritySha256 ? e.documentAuthoritySha256 === documentAuthoritySha256 : true)); return all.length ? all[all.length - 1] : null; }
+  function put(entry) { fs.mkdirSync(opts.runDir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(Object.assign({ schema: "EvidenceForge.ValidReviewRecord", schemaVersion: "MONOLITH-v1.0.14", status: "VALID", recordedAt: new Date().toISOString() }, entry)) + "\n"); return entry; }
   return { find, put, list: read, file };
 }
 
@@ -167,32 +183,64 @@
  */
 function createReviewAdapter(opts) {
   const llm = opts.llm; const cfg = Object.assign({ maxTokens: 12288, enableOutputBudget: true, enableCompletion: true, enableLiteralization: true, maxCompletionDims: 4, excerptChars: 300, registryExtraFiles: [] }, (P.CONFIG.llm && P.CONFIG.llm.reviewResilience) || {}, opts.config || {}); delete cfg.$comment;
+  /* v1.0.14 (R-A2) — AUTORITE DOCUMENTAIRE UNIQUE ET NORMALISEE : documentAuthority(targetId) doit rendre le contenu NORMALISE que MONO-11
+     examine (TN.normalizeTargetDocument, module GELE du lot). OBLIGATOIRE et VERIFIEE : sans elle, ou si elle n'est pas normalisee, l'adaptateur
+     refuse d'intercepter (fail closed) — jamais de repli sur le brut, jamais de repli sur le prompt. */
+  const authorityOf = (function (src) {
+    if (typeof src === "function") return (targetId) => src(targetId);
+    if (src && typeof src === "object") return (targetId) => src[targetId];
+    if (typeof src === "string") return () => src;
+    return null;
+  })(opts.documentAuthority);
+  if (!authorityOf) throw Object.assign(new Error("DOCUMENT_AUTHORITY_REQUIRED: l'adaptateur EF-03B exige l'autorite documentaire NORMALISEE (documentAuthority) ; la litteralite ne peut etre jugee ni sur le brut ni sur une reconstruction du prompt"), { code: "DOCUMENT_AUTHORITY_REQUIRED", fatal: true });
+  function requireAuthority(targetId) {
+    let c; try { c = authorityOf(targetId); } catch (e) { c = null; }
+    if (typeof c !== "string") throw Object.assign(new Error("DOCUMENT_AUTHORITY_REQUIRED: aucun contenu documentaire d'autorite pour la cible " + JSON.stringify(targetId)), { code: "DOCUMENT_AUTHORITY_REQUIRED", targetId: targetId || null, fatal: true });
+    if (!c.length) throw Object.assign(new Error("DOCUMENT_AUTHORITY_EMPTY: contenu documentaire d'autorite vide pour la cible " + JSON.stringify(targetId)), { code: "DOCUMENT_AUTHORITY_EMPTY", targetId: targetId || null, fatal: true });
+    /* PARITE DE NORMALISATION (B1) : le contenu d'autorite doit etre un point fixe des regles GELEES du lot — c'est la preuve structurelle
+       qu'il s'agit bien du document examine par MONO-11 (normalisation deterministe et idempotente) et non du brut. */
+    const again = TN.normalizeText(c).normalized;
+    if (again !== c) throw Object.assign(new Error("DOCUMENT_AUTHORITY_NOT_NORMALIZED: l'autorite documentaire de la cible " + JSON.stringify(targetId) + " n'est pas le contenu normalise examine par MONO-11 (regles " + TN.RULE_SET_ID + ") — brut ou reconstruction refuses"), { code: "DOCUMENT_AUTHORITY_NOT_NORMALIZED", targetId: targetId || null, ruleSetId: TN.RULE_SET_ID, authoritySha256: sha(c), normalizedSha256: sha(again), fatal: true });
+    return c;
+  }
   const registry = createReviewRegistry({ runDir: opts.runDir, extraFiles: cfg.registryExtraFiles }); const TRACE = process.env.EVIDENCEFORGE_TRACE_REVIEWS === "1"; const CONTRACT = P.CONFIG.frozenLots["MONO-11"].contractVersion || "MONO-11-v3";   /* v1.0.12 (R6) : contrat de validation lu dans la configuration du lot gele (MONO-11 v0.4 : MONO-11-v3) — plus d'epinglage v2 en dur ; une entree de registre d'un autre contrat n'est jamais servie (find() exige l'egalite) */
-  const reviews = {}; const byCallId = {}; const order = []; const stats = { reviewsSeen: 0, registryReuses: 0, truncations: 0, completions: 0, literalizations: 0, realCalls: 0, cumulativeReviewCostUsd: 0, validated: 0, contextUnparsed: 0 };
+  const reviews = {}; const byCallId = {}; const order = []; const stats = { reviewsSeen: 0, registryReuses: 0, truncations: 0, completions: 0, literalizations: 0, realCalls: 0, cumulativeReviewCostUsd: 0, validated: 0, contextUnparsed: 0, contextContentMismatch: 0, registryRefusedForeignAuthority: 0 };
   const costOf = (callId) => { try { const e = CL.readEntries(opts.runDir).find((x) => x.callId === callId); return e && e.cost ? e.cost.totalUsd : 0; } catch (e) { return 0; } };
   const trace = (rec) => { const line = Object.assign({ at: new Date().toISOString(), runId: opts.runId || null, attemptId: opts.attemptId || null }, rec); try { fs.appendFileSync(path.join(opts.runDir, TRACE_FILE), JSON.stringify(line) + "\n"); } catch (e) { /* observabilite */ }
     if (opts.onTrace) { try { opts.onTrace(Object.assign({ event: "ef03b_pass" }, line)); } catch (e) { /* */ } }
     if (TRACE) { try { console.log("[EF REVIEW] twin=" + (rec.twinId || "-") + " review=" + (rec.reviewIndex || "?") + "/" + (rec.twinsTotal || "?") + " pass=" + rec.reviewPass + "/" + rec.maxPasses + " strategy=" + rec.strategy + " stopReason=" + (rec.stopReason || "-") + " input=" + (rec.inputTokens == null ? "-" : rec.inputTokens) + " output=" + (rec.outputTokens == null ? "-" : rec.outputTokens) + " errorsBefore=" + (rec.validationErrorsCountBefore == null ? "-" : rec.validationErrorsCountBefore) + " errorsAfter=" + (rec.validationErrorsCount == null ? "-" : rec.validationErrorsCount) + " codes=" + (rec.validationErrorCodes || []).join(",") + " repairScope=" + ((rec.repairScope || []).join(",") || "-") + " reused=" + (rec.reusedFieldsCount == null ? "-" : rec.reusedFieldsCount) + " regenerated=" + (rec.regeneratedFieldsCount == null ? "-" : rec.regeneratedFieldsCount) + " state=" + rec.state + " costUsd=" + rec.costUsd + " cumulativeReviewCostUsd=" + rec.cumulativeReviewCostUsd); } catch (e) { /* */ } } };
-  const stateOf = (meta) => { const key = String(meta.twinId) + "|" + String(meta.targetId); if (!reviews[key]) { reviews[key] = { key, twinId: meta.twinId, targetId: meta.targetId, index: ++stats.reviewsSeen, ctx: null, basePromptSha256: null, parsed: null, passes: [], costUsd: 0, candidates: {} }; order.push(key); } return reviews[key]; };
+  const stateOf = (meta) => { const key = String(meta.twinId) + "|" + String(meta.targetId); if (!reviews[key]) { reviews[key] = { key, twinId: meta.twinId, targetId: meta.targetId, index: ++stats.reviewsSeen, ctx: null, basePromptSha256: null, parsed: null, passes: [], costUsd: 0, candidates: {}, authorityContent: null, authoritySha256: null, lastErrors: [] }; order.push(key); } return reviews[key]; };
+  /** v1.0.14 (R-A2) — le prompt donne la FORME (dimensions, cible, base documentaire) ; le CONTENU vient de l'autorite NORMALISEE. Tout ecart est compte et trace. */
+  function withAuthority(st, ctx, meta) {
+    const authority = requireAuthority(meta && meta.targetId);
+    st.authorityContent = authority; st.authoritySha256 = sha(authority);
+    if (!ctx) return null;
+    const mismatch = ctx.content !== authority;
+    if (mismatch) { stats.contextContentMismatch++; trace({ twinId: st.twinId, targetId: st.targetId, reviewIndex: st.index, event: "ef03b_pass", strategy: "DOCUMENT_AUTHORITY_MISMATCH", state: "AUTHORITY_ENFORCED", promptParsedContentSha256: sha(ctx.content), documentAuthoritySha256: st.authoritySha256, promptParsedContentLength: ctx.content.length, documentAuthorityLength: authority.length, ruleSetId: TN.RULE_SET_ID }); }
+    return Object.assign({}, ctx, { content: authority, promptParsedContentSha256: sha(ctx.content), contentFromAuthority: true, contentMismatch: mismatch });
+  }
   const maxPasses = Number(P.CONFIG.llm.reviewMaxPasses || 3);
   const base = (st, meta, extra) => Object.assign({ twinId: st.twinId, targetId: st.targetId, reviewIndex: st.index, twinsTotal: typeof opts.twinsTotal === "function" ? opts.twinsTotal() : null, reviewPass: meta.pass, maxPasses: maxPasses, enforcerStrategy: meta.strategy || null }, extra || {});
   async function call(prompt, meta, extraMeta) { const m = Object.assign({}, meta, { maxTokens: cfg.maxTokens }, extraMeta || {}); const r = await llm.llmCall(prompt, m); if (!r.reused) stats.realCalls++; return r; }
   function record(st, meta, r, cand, v, extra) { const cost = r && r.callId ? costOf(r.callId) : 0; st.costUsd = Math.round((st.costUsd + cost) * 1e4) / 1e4; stats.cumulativeReviewCostUsd = Math.round((stats.cumulativeReviewCostUsd + cost) * 1e4) / 1e4;
     const rec = base(st, meta, Object.assign({ strategy: extra.strategy, stopReason: r && r.stopReason || null, inputTokens: r && r.usage ? r.usage.input_tokens : null, outputTokens: r && r.usage ? r.usage.output_tokens : null, validationErrorsCount: v ? v.errors.length : null, validationErrorCodes: v ? Array.from(new Set(v.errors.map((e) => e.code))) : [], state: extra.state, costUsd: Math.round(cost * 1e4) / 1e4, cumulativeReviewCostUsd: stats.cumulativeReviewCostUsd, candidateSha256: cand ? sha(cand) : null, callId: r && r.callId || null }, extra)); st.passes.push(rec); trace(rec); return rec; }
-  function mirrorParsed(st, cand) { if (!st.ctx) return; const v = validateCandidate(cand, st.ctx); if (v.parsed && Array.isArray(v.parsed.findings)) st.parsed = v.parsed; return v; }
+  function mirrorParsed(st, cand) { if (!st.ctx) return; const v = validateCandidate(cand, st.ctx); if (v.parsed && Array.isArray(v.parsed.findings)) st.parsed = v.parsed; st.lastErrors = v.errors || []; return v; }   /* v1.0.14 (R-A1) : erreurs de la derniere validation miroir = dimensions fautives du lot */
 
   async function reviewCall(prompt, meta) {
     const st = stateOf(meta); const isBase = meta.pass === 1 || meta.strategy === "BASE_EF03B"; const isTargeted = /TARGETED/.test(String(meta.strategy || ""));
-    if (isBase) { st.basePromptSha256 = sha(prompt); st.ctx = parseReviewPromptContext(prompt); if (!st.ctx) stats.contextUnparsed++;
+    if (isBase) { st.basePromptSha256 = sha(prompt); st.ctx = withAuthority(st, parseReviewPromptContext(prompt), meta); if (!st.ctx) stats.contextUnparsed++;   /* v1.0.14 : forme du prompt, CONTENU = autorite normalisee (fail closed si absente / non normalisee) */
       /* E — registre : revue logique deja VALID (meme prompt gele de passe 1 = meme jumeau, memes preuves, meme document, meme schema ; meme sceau, meme contrat) */
-      const hit = registry.find(st.basePromptSha256, opts.sealHash || null, CONTRACT);
+      const hit = registry.find(st.basePromptSha256, opts.sealHash || null, CONTRACT, st.authoritySha256);   /* v1.0.14 : meme autorite documentaire normalisee exigee */
+      if (!hit) { const foreign = registry.find(st.basePromptSha256, opts.sealHash || null, CONTRACT); if (foreign) { stats.registryRefusedForeignAuthority++; trace({ twinId: st.twinId, targetId: st.targetId, reviewIndex: st.index, event: "ef03b_pass", strategy: "REGISTRY_REFUSED", state: "FOREIGN_DOCUMENT_AUTHORITY", entryAuthoritySha256: foreign.documentAuthoritySha256 || null, documentAuthoritySha256: st.authoritySha256 }); } }   /* v1.0.14 : entree d'une autre autorite (ou sans empreinte) : jamais servie, refus trace */
       if (hit && (!st.ctx || validateCandidate(hit.candidate, st.ctx).ok)) { stats.registryReuses++; const callId = "ef03b-registry-" + hit.candidateSha256; st.candidates[callId] = hit.candidate; byCallId[callId] = st; mirrorParsed(st, hit.candidate);
         if (typeof llm.recordReuse === "function") llm.recordReuse({ purpose: meta.purpose, twinId: meta.twinId, targetId: meta.targetId, callId: hit.candidateSha256, sourceRunId: hit.sourceRunId || hit.runId || null, reason: "revue logique VALID reutilisee (registre EF-03B : prompt de passe 1 + sceau + contrat identiques)", kind: "REVIEW_REGISTRY" });
         record(st, meta, null, hit.candidate, { errors: [] }, { strategy: STRATEGY.REGISTRY, state: "REUSED_VALID", reusedFieldsCount: st.ctx ? st.ctx.dims.length : null, regeneratedFieldsCount: 0, repairScope: [], sourceAttemptId: hit.attemptId || null });
         return { text: hit.candidate, callId: callId, providerId: hit.providerId || "anthropic", modelId: hit.modelId || llm.model, providerRequestId: null, transportKind: "REVIEW_REGISTRY_REUSE", httpStatus: 200, reused: true, stopReason: "end_turn", usage: null }; } }
     if (isTargeted || !st.ctx) {   /* reparation ciblee gelee (petite sortie) ou contexte illisible : transport seul */
-      const r = await call(prompt, meta); if (isTargeted && st.ctx && st.parsed) { const rp = RE.parseRepair(r.text, Object.keys(st.parsed.findings.reduce((o, f) => { o[f.dimensionId] = 1; return o; }, {})));
-        const mg = RE.mergeRepairLineage(st.parsed, rp.repairs || {}, st.ctx.content);   /* v1.0.12 (R5) : MIROIR ALIGNE SUR LE LOT GELE v0.4 — meme fusion de lignee, meme semantique CAS A / CAS B ; le candidat trace est byte-identique a celui que le lot valide */
+      if (isTargeted && st.ctx) st.ctx = withAuthority(st, st.ctx, meta) || st.ctx;   /* v1.0.14 : autorite revalidee a chaque passe ciblee (fail closed si elle disparait ou n'est plus normalisee) */
+      const r = await call(prompt, meta); if (isTargeted && st.ctx && st.parsed) { const faulty = RE.faultyDimensions(st.lastErrors || []); const rp = RE.parseRepair(r.text, faulty.length ? faulty : Object.keys(st.parsed.findings.reduce((o, f) => { o[f.dimensionId] = 1; return o; }, {})));   /* v1.0.14 (R-A1) : memes dimensions fautives que le lot gele */
+        if (!rp.ok) { st.candidates[r.callId] = JSON.stringify(st.parsed); byCallId[r.callId] = st; record(st, meta, r, JSON.stringify(st.parsed), { errors: st.lastErrors || [], parsed: st.parsed }, { strategy: STRATEGY.PASSTHROUGH, state: "REPAIR_UNPARSABLE", repairScope: faulty, repairErrors: (rp.errors || []).map((e) => e.code), reusedFieldsCount: st.ctx.dims.length, regeneratedFieldsCount: 0 }); return r; }   /* v1.0.14 (R-A1) : reparation illisible => aucune recomposition, trace alignee sur le rejet du lot */
+        const mg = RE.mergeRepairLineage(st.parsed, rp.repairs || {}, st.ctx.content);   /* v1.0.12 (R5) : MIROIR ALIGNE SUR LE LOT GELE v0.4 — meme fusion de lignee, meme semantique CAS A / CAS B ; v1.0.14 : contenu = autorite normalisee */
         const cand = JSON.stringify(RE.recompose(st.parsed, mg.applied)); st.candidates[r.callId] = cand; byCallId[r.callId] = st; const v = mirrorParsed(st, cand); record(st, meta, r, cand, v, { strategy: STRATEGY.PASSTHROUGH, state: v && v.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID", repairScope: Object.keys(rp.repairs || {}), reusedFieldsCount: st.ctx.dims.length - Object.keys(rp.repairs || {}).length, regeneratedFieldsCount: Object.keys(rp.repairs || {}).length, lineage: mg.dimensions, repairUnresolvedDimensions: mg.unresolvedDimensions }); }
       else { st.candidates[r.callId] = r.text; byCallId[r.callId] = st; record(st, meta, r, r.text, st.ctx ? mirrorParsed(st, r.text) : null, { strategy: STRATEGY.PASSTHROUGH, state: "PASSTHROUGH" }); }
       return r; }
@@ -223,7 +271,7 @@
   async function llmCall(prompt, meta) { if (!meta || !/^EF-03B/.test(String(meta.purpose || ""))) return llm.llmCall(prompt, meta); return reviewCall(prompt, meta); }
   function onValidation(v) { if (typeof llm.onValidation === "function") llm.onValidation(v);
     if (!v || !v.callId) return; const st = byCallId[v.callId]; if (!st) return; const cand = st.candidates[v.callId]; if (v.valid === true && cand) { stats.validated++;
-      if (!/^ef03b-registry-/.test(String(v.callId))) registry.put({ basePromptSha256: st.basePromptSha256, twinId: st.twinId, targetId: st.targetId, runId: opts.runId || null, attemptId: opts.attemptId || null, acceptedPass: st.passes.length ? st.passes[st.passes.length - 1].reviewPass : null, candidateSha256: sha(cand), candidate: cand, validationContract: CONTRACT, sourceSealHash: opts.sealHash || null, modelId: llm.model || null, providerId: "anthropic", calls: st.passes.map((p) => ({ strategy: p.strategy, callId: p.callId || null, costUsd: p.costUsd })), costUsd: st.costUsd, source: st.passes.some((p) => p.strategy === STRATEGY.REGISTRY) ? "REGISTRY_REUSE" : "VALIDATED_IN_RUN" });
+      if (!/^ef03b-registry-/.test(String(v.callId))) registry.put({ basePromptSha256: st.basePromptSha256, documentAuthoritySha256: st.authoritySha256, twinId: st.twinId, targetId: st.targetId, runId: opts.runId || null, attemptId: opts.attemptId || null, acceptedPass: st.passes.length ? st.passes[st.passes.length - 1].reviewPass : null, candidateSha256: sha(cand), candidate: cand, validationContract: CONTRACT, sourceSealHash: opts.sealHash || null, modelId: llm.model || null, providerId: "anthropic", calls: st.passes.map((p) => ({ strategy: p.strategy, callId: p.callId || null, costUsd: p.costUsd })), costUsd: st.costUsd, source: st.passes.some((p) => p.strategy === STRATEGY.REGISTRY) ? "REGISTRY_REUSE" : "VALIDATED_IN_RUN" });
       trace(base(st, { pass: st.passes.length ? st.passes[st.passes.length - 1].reviewPass : null, strategy: null }, { strategy: "VALIDATED", state: "VALIDATED", costUsd: st.costUsd, cumulativeReviewCostUsd: stats.cumulativeReviewCostUsd, validationErrorsCount: 0, validationErrorCodes: [] })); }
     else if (v.valid === false && cand && st) trace(base(st, { pass: null, strategy: null }, { strategy: "REJECTED_BY_ENFORCER", state: "REJECTED", validationErrorCodes: Array.isArray(v.errors) ? v.errors : [], validationErrorsCount: Array.isArray(v.errors) ? v.errors.length : null, costUsd: 0, cumulativeReviewCostUsd: stats.cumulativeReviewCostUsd })); }
   return { llmCall, onValidation, stats: () => Object.assign({}, stats, { reviews: order.map((k) => ({ twinId: reviews[k].twinId, targetId: reviews[k].targetId, passes: reviews[k].passes.length, costUsd: reviews[k].costUsd })) }), registry, config: cfg, STRATEGY };
```

### Diff de `lib/pipeline.js`

```diff
--- MONOLITH-v1.0.12/lib/pipeline.js	2026-09-22 14:18:39
+++ MONOLITH-v1.0.14/lib/pipeline.js	2026-09-22 19:17:57
@@ -264,11 +264,18 @@
         /* v1.0.10 — EF-03B REVIEW RESILIENCE : l'aval gele recoit un llm dont llmCall / onValidation passent par l'adaptateur (registre des revues VALID, budget de sortie,
            troncature => completion ciblee, litteralisation sur extraits) ; le lot gele valide et accepte seul. Transport, verrou, compteurs : ceux du llm reel (delegues). */
         let twinsBuilt = null; const logDown = (e) => { if (e && e.event === "twins_built" && typeof e.built === "number") twinsBuilt = e.built; return log(e); };
-        const adapter = EF3.createReviewAdapter({ llm, runDir: store.dir, runId, attemptId: state.attempts, sealHash, config: { maxTokens: P.CONFIG.llm.reviewMaxTokens }, onTrace: logDown, twinsTotal: () => twinsBuilt });
+        /* v1.0.14 (R-A2, B1) — AUTORITE DOCUMENTAIRE UNIQUE ET NORMALISEE : MONO-11 normalise chaque document (core/target-normalizer.js,
+           applique par core/autonomous-run.js AVANT buildTargetDocumentSet) puis juge les citations contre ce contenu normalise. L'adaptateur
+           doit voir EXACTEMENT ce contenu : il est reproduit ici avec le module GELE du lot, sur la MEME entree et dans le MEME ordre
+           (targetId target-NN = position, cf. runDownstreamFromCheckpoint). Le contenu BRUT n'est jamais une autorite de litteralite. */
+        const TNorm = require(path.join(P.MONO11, "core", "target-normalizer.js"));
+        const authorityByTarget = {}; targetDocs.forEach((d, i) => { authorityByTarget["target-" + String(i + 1).padStart(2, "0")] = TNorm.normalizeTargetDocument({ targetId: "target-" + String(i + 1).padStart(2, "0"), label: d.title, content: d.content }).document.content; });
+        const adapter = EF3.createReviewAdapter({ llm, runDir: store.dir, runId, attemptId: state.attempts, sealHash, config: { maxTokens: P.CONFIG.llm.reviewMaxTokens }, onTrace: logDown, twinsTotal: () => twinsBuilt,
+          documentAuthority: (targetId) => authorityByTarget[targetId] });
         const llmDown = Object.assign({}, llm, { llmCall: adapter.llmCall, onValidation: adapter.onValidation });
         const r = await SP.runDownstreamFromCheckpoint({ runDir: store.dir, runId, attemptId: state.attempts, attemptRunId, missionId, missionHash: state.mission.questionSha256, missionQuestion, runContract: disciplines.runContract, corpusSnapshot, discovery: disc.discovery, verification: disc.verification,
           checkpoint: cpPro, targetDocuments: targetDocs, llm: llmDown, upstreamReservations, log: logDown });   /* v1.0.7 : cibles = dossier de mission (ou par document, explicite) */
-        const ef03b = adapter.stats(); r.summary.ef03b = ef03b; store.saveJson("ef03b-resilience.json", Object.assign({ schema: "EvidenceForge.EF03BResilienceSummary", schemaVersion: "MONOLITH-v1.0.12", attemptId: state.attempts }, ef03b));   /* v1.0.10 : reuse registre / troncatures / completions / litteralisations / cout cumule des revues */
+        const ef03b = adapter.stats(); r.summary.ef03b = ef03b; store.saveJson("ef03b-resilience.json", Object.assign({ schema: "EvidenceForge.EF03BResilienceSummary", schemaVersion: "MONOLITH-v1.0.14", attemptId: state.attempts }, ef03b));   /* v1.0.10 : reuse registre / troncatures / completions / litteralisations / cout cumule des revues */
         const ref = store.saveCheckpoint("checkpoint-downstream.json", r.checkpoint); cpDown = store.loadCheckpoint("checkpoint-downstream.json"); log({ event: "checkpoint_saved", checkpoint: "downstream", contentHash: ref.contentHash });
         store.saveJson("corpora-admitted.json", cpDown.corpusSet); store.saveJson("twins.json", cpDown.twinSet); store.saveJson("coverage.json", cpDown.coverageMatrix); store.saveJson("panel-selection.json", cpDown.panelSelection); store.saveJson("review-schema.json", cpDown.reviewSchema);
         store.saveJson("target-document-set.json", cpDown.targetDocumentSet); store.saveJson("reviews.json", cpDown.reviewSet); store.saveJson("normalization-records.json", cpDown.normalizationRecords); store.saveJson("enforcement-traces.json", cpDown.enforcementTraces);
```

### Diff de `tools/ef03b-registry-import.js`

```diff
--- MONOLITH-v1.0.12/tools/ef03b-registry-import.js	2026-09-22 14:02:50
+++ MONOLITH-v1.0.14/tools/ef03b-registry-import.js	2026-09-22 19:17:57
@@ -1,7 +1,7 @@
 #!/usr/bin/env node
 "use strict";
 /**
- * MONOLITH v1.0.12 — tools/ef03b-registry-import.js : IMPORT HORS LIGNE des revues EF-03B deja VALID d'un run dans son registre
+ * MONOLITH v1.0.14 — tools/ef03b-registry-import.js : IMPORT HORS LIGNE des revues EF-03B deja VALID d'un run dans son registre
  * `reviews-valid.jsonl` (lib/ef03b-resilience.js), pour qu'un replay cible (POST /api/runs/:id/replay-reviews) les serve a 0 appel.
  * Deux sources, toutes deux RE-VALIDEES par le validateur local gele (MONO-11) ET le parseur EF-03B gele (MONO-01) avant import :
  *   1. les revues `complete` du reviewSet final (reviews.json) — candidat = projection des 9 cles du contrat, dans l'ordre du schema ;
@@ -28,10 +28,17 @@
   const registry = EF3.createReviewRegistry({ runDir }); const existing = new Set(registry.list().map((e) => e.basePromptSha256 + "|" + e.candidateSha256)); const out = { imported: [], skipped: [], refused: [] };
   const textOf = (id) => { try { const j = json(path.join(runDir, "llm-cache", id + ".response.json")); return j.content.filter((c) => c.type === "text").map((c) => c.text).join(""); } catch (e) { return null; } };
   const finalAttempt = Math.max.apply(null, Object.values(led).map((e) => e.attemptId || 0));
+  /* v1.0.14 (B4) — l'empreinte d'autorite est calculee sur le document NORMALISE du run (target-document-set.json est deja le jeu normalise
+     produit par MONO-11) ; jamais sur le brut, jamais sur le prompt. Document d'autorite indisponible ou non normalise => IMPORT FAIL CLOSED. */
+  const TN = require(path.join(P.MONO11, "core", "target-normalizer.js"));
+  const authoritySha = (doc) => { const c = doc && typeof doc.content === "string" ? doc.content : null;
+    if (!c || !c.length) throw Object.assign(new Error("REGISTRY_IMPORT_AUTHORITY_MISSING: aucun document d'autorite pour la cible " + JSON.stringify(doc && doc.targetId)), { code: "REGISTRY_IMPORT_AUTHORITY_MISSING" });
+    if (TN.normalizeText(c).normalized !== c) throw Object.assign(new Error("REGISTRY_IMPORT_AUTHORITY_NOT_NORMALIZED: le document d'autorite de la cible " + JSON.stringify(doc.targetId) + " n'est pas normalise (regles " + TN.RULE_SET_ID + ")"), { code: "REGISTRY_IMPORT_AUTHORITY_NOT_NORMALIZED" });
+    return sha(c); };
   const tryImport = (t, twin, doc, candidate, source, extra) => { const v = RE.validateReviewCandidate(candidate, twin, doc, schema); if (!v.ok) { out.refused.push({ twinId: t.twinId, source, errors: v.errors.slice(0, 3).map((e) => e.code) }); return false; }
     try { F.M01.RR.parseReviewResponse(candidate, twin, doc, schema); } catch (e) { out.refused.push({ twinId: t.twinId, source, errors: ["EF03B_FROZEN_PARSER: " + String(e.message).slice(0, 80)] }); return false; }
     const key = t.passes[0].promptSha256 + "|" + sha(candidate); if (existing.has(key)) { out.skipped.push({ twinId: t.twinId, source, reason: "deja au registre" }); return true; }
-    const entry = Object.assign({ basePromptSha256: t.passes[0].promptSha256, twinId: t.twinId, targetId: t.targetId, runId: state.runId, candidateSha256: sha(candidate), candidate, validationContract: CONTRACT, sourceSealHash: SEAL.runtimeSealSha256, modelId: null, providerId: "anthropic", source }, extra || {}); if (!opts.dryRun) registry.put(entry); existing.add(key); out.imported.push({ twinId: t.twinId, source, candidateSha256: entry.candidateSha256, attemptId: entry.attemptId || finalAttempt }); return true; };
+    const entry = Object.assign({ basePromptSha256: t.passes[0].promptSha256, documentAuthoritySha256: authoritySha(doc), twinId: t.twinId, targetId: t.targetId, runId: state.runId, candidateSha256: sha(candidate), candidate, validationContract: CONTRACT, sourceSealHash: SEAL.runtimeSealSha256, modelId: null, providerId: "anthropic", source }, extra || {}); if (!opts.dryRun) registry.put(entry); existing.add(key); out.imported.push({ twinId: t.twinId, source, candidateSha256: entry.candidateSha256, attemptId: entry.attemptId || finalAttempt }); return true; };
   for (const t of traces) { const twin = twinById[t.twinId]; const doc = F.M01.TDS.getDocumentForTarget(tds, t.targetId); if (!twin || !doc || !t.passes.length) continue; const rv = reviews.find((r) => r.twinId === t.twinId && r.targetId === t.targetId);
     if (rv && rv.reviewStatus === "complete" && Array.isArray(rv.findings)) { const findings = rv.findings.map((f) => { const o = {}; RE.FINDING_KEYS.forEach((k) => { o[k] = f[k]; }); return o; }); tryImport(t, twin, doc, JSON.stringify({ findings }), "FINAL_REVIEWSET_COMPLETE", { attemptId: finalAttempt, acceptedPass: t.acceptedPass }); continue; }
     /* revue en erreur : candidat VALID d'une tentative precedente, reconstruit et re-valide (preuves inchangees exigees par le validateur) */
```

## Tests

- `node test/test-monolith.js` : **313/313** · chunking 21/21 · secret 0 · anti-hardcoding 0 hit (77 fichiers) · `--verify` ok 160 · lots gelés 0 divergence · lot MONO-11 83/83 (suite du lot, inchangee)

| famille | contenu |
|---|---|
| **RA2-01..08** | autorite normalisee (document ordinaire, marqueur + ligne JSON, marqueurs multiples, autorite brute refusee, fail closed, ecriture et reutilisation du registre, fixture adversariale) |
| **RA1-01..03** | trace REPAIR_UNPARSABLE, aucune ecriture registre, resultat identique au lot — assertions discriminantes (tautologies de v1.0.13 remplacees) |
| **RA2-E2E-01..08** | cablage REEL : apostrophe, NBSP, CRLF, NFC, marqueur + JSON, marqueur seul, 3 documents distincts (target-01/02/03), autorite brute / tronquee / absente |
| **RI-01..07** | import de registre : empreinte normalisee, fail closed, contrat, sceau, empreinte differente ou absente |

## Matrice de mutation (B3)

| mutant | mutation | tué par | suite |
|---|---|---|---|
| **M1** | autorite = contenu BRUT (le defaut exact de v1.0.13) | RA2-E2E-01, RA2-E2E-02, RA2-E2E-03, RA2-E2E-04, RA2-E2E-08 | 308/313 |
| **M2** | index cible decale (target-NN -> target-NN+1) | RA2-E2E-01..08, T-STREAM-21 | 304/313 |
| **M3** | autorite tronquee (slice 0,40) | RA2-E2E-01..08 | 305/313 |
| **M4** | documentAuthoritySha256 absent a l import | RI-01..RI-03 | 312/313 |
| **M4b** | empreinte d import calculee sur un contenu non normalise | RI-01..RI-03 | 312/313 |
| **M5** | correctif R-A1 retire (recomposition d une reparation illisible) | RA1-01, RA1-02, RA1-03 | 310/313 |
| **M6** | garde de normalisation retiree de l adaptateur | RA2-04, RA2-E2E-08 | 311/313 |

Chaque mutant est tué par au moins un test nommé ; aucun correctif n'est décoratif.

## Shadow A10 — correction de vocabulaire

- le rapport v1.0.12 annoncait « 70 constats » : chiffre corrige ici, sans modifier aucun artefact historique.
- revues concernées : **7** · revues du jeu complet : 18 · constats du jeu complet : **180** · constats vérifiés dans le sous-ensemble ciblé : **70** · citations restaurées : **12** · constats historiquement vidés restaurés : **3**.
- 7 revues reelles de la tentative 10 x 10 constats = 70 constats verifies dans le sous-ensemble cible ; la collection complete contient 18 revues et 180 constats. Aucun artefact historique modifié.

## Non-régression

- **MONO-11 v0.4** : intact (0 divergence, sceau 110db4de…)
- **R5 parity** : V12-02..07 / V12-16 verts
- **R6 fail-closed** : V12-09..12 verts
- **lineageMonotonicity** : CAS A / CAS B / dedup / ordre : V12-04, V12-05, V12-16
- **shadow** : 12 citations et 3 constats restaures
- **aggregation** : 13/9/7/0/67/10 ; QUALIFIED_WITH_RESERVATIONS ; SCIENTIFICALLY_USABLE = NO
- **semantique** : aucun changement substantiel de revue

Manifeste : 160 fichiers, contentHash `77c05052d052e1ca1c4e1c81097254702bd57fe6c60f81c533178d24b6c53111`.

## Limites connues

- aucun run reel (interdit)
- aucun zip canonique
- audit independant requis avant gel
- ACTIVE_VERSION reste MONOLITH-v1.0.10 ; smoke reel R12 requis avant activation
- R-A3 / R-A5 / R-A6 non traitees (observations)
- la parite d autorite repose sur la reproduction deterministe des regles gelees : si le lot changeait ses regles de normalisation sans changer de sceau, la garde de point fixe ne le verrait pas (le sceau MONO-11 couvre core/ : un tel changement change le sceau)

**STOP après livraison du candidat : ni gel, ni commit comme baseline, ni activation, ni smoke.**
