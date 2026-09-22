# EVIDENCEFORGE v1.0.12 — RAPPORT D'INTÉGRATION (GLOBAL LINEAGE PRESERVATION)

**Statut proposé : GELABLE** — NON GELÉ · généré 2026-09-22T12:20:30+00:00 · `ACTIVE_VERSION` reste **MONOLITH-v1.0.10** · 0 appel fournisseur, 0 run réel.

**Définition** : v1.0.12 = MONOLITH-v1.0.11 (inchangee sur la litteralisation, le transport, le proxy v0.8, Panel Sufficiency, l economic-panel et stage-professionals) + LOT GELE MONO-11 v0.4 (contrat MONO-11-v3) + les deux conditions d integration R5 et R6 de l audit independant v1.0.11 — et rien d autre.

**Objectif** : GLOBAL_LINEAGE_PRESERVATION sur les deux chemins connus : litteralisation (adaptateur, corrigee en v1.0.11) et reparation ciblee (lot gele v0.4).

## Bascule du lot gelé

| | avant (v1.0.11) | après (v1.0.12) |
|---|---|---|
| MONO-11 | v0.3-r1 | **v0.4** (GELE FROZEN_WITH_RESERVATIONS (2026-09-22)) |
| zip canonique | `3c44b397dda0997d…` | `79c16d08a0a52bc1…` |
| runtimeSealSha256 | `9fbef4126d437e0b…` | `110db4de24709926…` |
| runCodeHash | — | `27610c84502104b3…` |
| contractVersion | MONO-11-v2 | **MONO-11-v3** |

Conséquences : CHECKPOINT_SEAL_MISMATCH pour tout checkpoint produit sous v0.3-r1 (dont efm-20260918-a64167c0) — voulu, fail-closed ; aucune reutilisation de cache ni de registre inter-sceau ou inter-contrat ; aucune migration, aucun run historique modifie.

## R5 — condition d'intégration (bloquante)

- **Condition** : le miroir de l adaptateur doit respecter exactement l invariant du lot et la semantique CAS A / CAS B ; meme entree => meme resultat de lignee
- **Implémentation** : `lib/ef03b-resilience.js, branche isTargeted : const mg = RE.mergeRepairLineage(st.parsed, rp.repairs || {}, st.ctx.content); const cand = JSON.stringify(RE.recompose(st.parsed, mg.applied));`
- **Preuve** : V12-02, V12-03, V12-04, V12-05, V12-06, V12-07, V12-16 (24 combinaisons brut x reparation) : statut, passe acceptee et targetEvidenceRefs identiques entre le miroir et le lot ; V12-02 verifie en outre que le registre inscrit le candidat AVEC la conservee (v1.0.11 l amputait)

## R6 — condition d'intégration (bloquante)

- **Condition** : aligner lib/llm.js, lib/ef03b-resilience.js et tools/ef03b-registry-import.js sur MONO-11-v3 ; import fail-closed
- **Implémentation** : `contrat lu dans config.frozenLots[MONO-11].contractVersion (3 fichiers) ; import : REGISTRY_IMPORT_SEAL_MISMATCH si le run a un autre sceau, REGISTRY_IMPORT_CONTRACT_MISMATCH si le registre porte un autre contrat ou un autre sceau ; reconstruction historique via mergeRepairLineage`
- **Preuve** : V12-09 (aucun contrat epingle en dur), V12-10 (registre : ancien contrat et autre sceau refuses, entree courante servie), V12-11 (import : deux refus), V12-12 (cache : contrat et sceau compares), RUN-SAFETY-21 (les memes entrees sous MONO-11-v2 ne sont jamais reutilisees, refus journalises)

## Diff v1.0.11 → v1.0.12

| fichier | avant | après | nature |
|---|---|---|---|
| `lib/ef03b-resilience.js` | `18739b7aac10…` | `564a0e3d7a50…` | R5 — miroir de la reparation ciblee (branche isTargeted) : RE.mergeRepairLineage(st.parsed, rp.repairs, content) puis RE.recompose(st.parsed, mg.applied) ; trace lineage / repairUnresolvedDimensions ; R6 — CONTRACT lu dans config.frozenLots[MONO-11].contractVersion ; en-tete et schemaVersion du registre |
| `lib/llm.js` | `b9d1c4799179…` | `34816352ef0e…` | R6 — VALIDATION_CONTRACT lu dans la configuration du lot gele (plus d epinglage MONO-11-v2) ; reuseContextCheck inchange (compare contrat et sceau) |
| `lib/pipeline.js` | `7e2d718bf11e…` | `204862ccdb2e…` | schemaVersion de ef03b-resilience.json -> MONOLITH-v1.0.12 (une chaine) |
| `config/monolith.config.json` | `2451b2a5f299…` | `a34cc964c141…` | frozenLots[MONO-11] -> dir MONO-11/v0.4, version v0.4, zip 79c16d08…, contractVersion MONO-11-v3 ; product.version MONOLITH-v1.0.12 |
| `tools/ef03b-registry-import.js` | `3a6708539e6d…` | `c6d694ac4a03…` | R6 / Q5 — CONTRACT depuis la configuration ; fail-closed REGISTRY_IMPORT_SEAL_MISMATCH et REGISTRY_IMPORT_CONTRACT_MISMATCH ; reconstruction historique via RE.mergeRepairLineage |
| `tools/build-manifest.js` | `8c9a6469626e…` | `af1f086c5935…` | predecesseur v1.0.11, provenance, statut candidat v1.0.12, ef03b.mirrorAlignedWithLot / contractFromConfig, contrat mesure depuis la configuration, zip MONO-11 v0.4 |
| `tools/ef03b-autopsy.js` | `00e244afeb9b…` | `bb310c6ae708…` | schemaVersion du replay -> v1.0.12 (une chaine) |
| `tools/package.sh` | `5bb461bb7009…` | `93400b4f8fd6…` | nom du zip v1.0.12 |
| `README.md` | `9d866155d42e…` | `661c8d6d862a…` | en-tete v1.0.12 (historique conserve) |
| `test/test-monolith.js` | `698840623519…` | `e03756172dcf…` | assertions de version du lot (v0.4), chemins, zip canonique, contrat lu dans la configuration, MANIFEST du lot (83) |
| `test/test-v105.js` | `377395ec762e…` | `a682411efccb…` | NONREG-01 (55 fichiers, zip v0.4) ; NONREG-02 (frozenLots : MONO-11 volontairement bascule, autres lots identiques a v1.0.4) |
| `test/test-stream.js` | `aa37e0118fd0…` | `dd23140a619c…` | T-STREAM-20 : version du produit v1.0.12 |
| `test/test-run-safety.js` | `998f388f9763…` | `cb7a018e228f…` | RUN-SAFETY-21 : reuse sous le contrat COURANT + refus des memes entrees sous MONO-11-v2 (fail-closed), run historique intact |
| `test/test-panel.js` | `cc36770ba83b…` | `578afc808fa6…` | zip canonique MONO-11 v0.4 |
| `test/test-ef03b.js` | `62e2c335d2a7…` | `0e0b7d530f15…` | contrat des entrees de registre lu dans la configuration ; chargement du module de parite v1.0.12 |
| `test/test-ef03b-lineage.js` | `7c4922017101…` | `35508d776d6d…` | T-EF03B-34 : le miroir applique desormais la fusion du lot (R5) |
| `test/results.json` | `e4c3496ad38a…` | `4ff7dc2080f2…` | resultats (292/292) |
| `test/results-chunking.json` | `35a8d50902d1…` | `17a17576bbfa…` | resultats (21/21) |
| `MANIFEST.json` | `331e2d4ca675…` | `d8bb0d3e7c28…` | mesure (292/292, 158 fichiers, contentHash 9552b45e484c…) |
| `SHA256SUMS.txt` | `e1708a3cef29…` | `3c1c736fd19b…` | sceau du paquet |
| `test/test-v1012-lineage-parity.js` | — | `a077d59b2722…` | AJOUT — V12-01..V12-18 : parite miroir/lot, CAS A/CAS B, contrat courant, registre / import / cache fail-closed, shadow A10, checkpoint, frontiere |

Inchangés : tout le reste : server.js, index.html, lib/llm-stream.js, lib/live-status.js, lib/cost-view.js, lib/stage-professionals.js, lib/stage-report.js, lib/panel-sufficiency.js, lib/economic-panel.js, worker/ (proxy v0.8), vendor/, governance/, fixtures/ — byte-identiques a v1.0.11

### Diff de l'adaptateur (R5 + R6)

```diff
--- MONOLITH-v1.0.11/lib/ef03b-resilience.js	2026-09-21 08:00:40
+++ MONOLITH-v1.0.12/lib/ef03b-resilience.js	2026-09-22 14:02:30
@@ -1,7 +1,10 @@
 "use strict";
 /**
- * EvidenceForge MONOLITH v1.0.11 — lib/ef03b-resilience.js
+ * EvidenceForge MONOLITH v1.0.12 — lib/ef03b-resilience.js
  * EF-03B REVIEW RESILIENCE : ADAPTATEUR ADDITIF autour de `llmCall` remis au lot gele MONO-11 (review-enforcer, INCHANGE).
+ * v1.0.12 — GLOBAL LINEAGE PRESERVATION : le miroir de la reparation ciblee gelee (branche isTargeted) applique RE.mergeRepairLineage du lot
+ *   MONO-11 v0.4 (contrat MONO-11-v3) AVANT RE.recompose : le candidat trace / inscrit au registre est byte-identique a celui que le lot
+ *   gele valide (R5 de l'audit independant v1.0.11). Le contrat de validation vient de la configuration du lot (R6). Bloc G inchange.
  * v1.0.11 — LITERALIZATION LINEAGE PRESERVATION (correctif du seul bloc G) : la recomposition apres litteralisation ne remplace plus
  *   le tableau targetEvidenceRefs d'une dimension fautive par la seule reponse du modele ; elle CONSERVE les references originales
  *   deja litterales (controle gele : isStr + content.indexOf) puis ajoute les references reparees qui passent ce meme controle —
@@ -153,7 +156,7 @@
   const file = path.join(opts.runDir, REGISTRY_FILE); const extra = (opts.extraFiles || []).filter((f) => fs.existsSync(f));
   const read = () => [file].concat(extra).flatMap((f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []);
   function find(basePromptSha256, sealHash, contract) { const all = read().filter((e) => e.basePromptSha256 === basePromptSha256 && e.validationContract === contract && (e.sourceSealHash || null) === (sealHash || null) && e.status === "VALID"); return all.length ? all[all.length - 1] : null; }
-  function put(entry) { fs.mkdirSync(opts.runDir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(Object.assign({ schema: "EvidenceForge.ValidReviewRecord", schemaVersion: "MONOLITH-v1.0.11", status: "VALID", recordedAt: new Date().toISOString() }, entry)) + "\n"); return entry; }
+  function put(entry) { fs.mkdirSync(opts.runDir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(Object.assign({ schema: "EvidenceForge.ValidReviewRecord", schemaVersion: "MONOLITH-v1.0.12", status: "VALID", recordedAt: new Date().toISOString() }, entry)) + "\n"); return entry; }
   return { find, put, list: read, file };
 }
 
@@ -164,7 +167,7 @@
  */
 function createReviewAdapter(opts) {
   const llm = opts.llm; const cfg = Object.assign({ maxTokens: 12288, enableOutputBudget: true, enableCompletion: true, enableLiteralization: true, maxCompletionDims: 4, excerptChars: 300, registryExtraFiles: [] }, (P.CONFIG.llm && P.CONFIG.llm.reviewResilience) || {}, opts.config || {}); delete cfg.$comment;
-  const registry = createReviewRegistry({ runDir: opts.runDir, extraFiles: cfg.registryExtraFiles }); const TRACE = process.env.EVIDENCEFORGE_TRACE_REVIEWS === "1"; const CONTRACT = "MONO-11-v2";
+  const registry = createReviewRegistry({ runDir: opts.runDir, extraFiles: cfg.registryExtraFiles }); const TRACE = process.env.EVIDENCEFORGE_TRACE_REVIEWS === "1"; const CONTRACT = P.CONFIG.frozenLots["MONO-11"].contractVersion || "MONO-11-v3";   /* v1.0.12 (R6) : contrat de validation lu dans la configuration du lot gele (MONO-11 v0.4 : MONO-11-v3) — plus d'epinglage v2 en dur ; une entree de registre d'un autre contrat n'est jamais servie (find() exige l'egalite) */
   const reviews = {}; const byCallId = {}; const order = []; const stats = { reviewsSeen: 0, registryReuses: 0, truncations: 0, completions: 0, literalizations: 0, realCalls: 0, cumulativeReviewCostUsd: 0, validated: 0, contextUnparsed: 0 };
   const costOf = (callId) => { try { const e = CL.readEntries(opts.runDir).find((x) => x.callId === callId); return e && e.cost ? e.cost.totalUsd : 0; } catch (e) { return 0; } };
   const trace = (rec) => { const line = Object.assign({ at: new Date().toISOString(), runId: opts.runId || null, attemptId: opts.attemptId || null }, rec); try { fs.appendFileSync(path.join(opts.runDir, TRACE_FILE), JSON.stringify(line) + "\n"); } catch (e) { /* observabilite */ }
@@ -188,7 +191,9 @@
         record(st, meta, null, hit.candidate, { errors: [] }, { strategy: STRATEGY.REGISTRY, state: "REUSED_VALID", reusedFieldsCount: st.ctx ? st.ctx.dims.length : null, regeneratedFieldsCount: 0, repairScope: [], sourceAttemptId: hit.attemptId || null });
         return { text: hit.candidate, callId: callId, providerId: hit.providerId || "anthropic", modelId: hit.modelId || llm.model, providerRequestId: null, transportKind: "REVIEW_REGISTRY_REUSE", httpStatus: 200, reused: true, stopReason: "end_turn", usage: null }; } }
     if (isTargeted || !st.ctx) {   /* reparation ciblee gelee (petite sortie) ou contexte illisible : transport seul */
-      const r = await call(prompt, meta); if (isTargeted && st.ctx && st.parsed) { const rp = RE.parseRepair(r.text, Object.keys(st.parsed.findings.reduce((o, f) => { o[f.dimensionId] = 1; return o; }, {}))); const cand = JSON.stringify(RE.recompose(st.parsed, rp.repairs || {})); st.candidates[r.callId] = cand; byCallId[r.callId] = st; const v = mirrorParsed(st, cand); record(st, meta, r, cand, v, { strategy: STRATEGY.PASSTHROUGH, state: v && v.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID", repairScope: Object.keys(rp.repairs || {}), reusedFieldsCount: st.ctx.dims.length - Object.keys(rp.repairs || {}).length, regeneratedFieldsCount: Object.keys(rp.repairs || {}).length }); }
+      const r = await call(prompt, meta); if (isTargeted && st.ctx && st.parsed) { const rp = RE.parseRepair(r.text, Object.keys(st.parsed.findings.reduce((o, f) => { o[f.dimensionId] = 1; return o; }, {})));
+        const mg = RE.mergeRepairLineage(st.parsed, rp.repairs || {}, st.ctx.content);   /* v1.0.12 (R5) : MIROIR ALIGNE SUR LE LOT GELE v0.4 — meme fusion de lignee, meme semantique CAS A / CAS B ; le candidat trace est byte-identique a celui que le lot valide */
+        const cand = JSON.stringify(RE.recompose(st.parsed, mg.applied)); st.candidates[r.callId] = cand; byCallId[r.callId] = st; const v = mirrorParsed(st, cand); record(st, meta, r, cand, v, { strategy: STRATEGY.PASSTHROUGH, state: v && v.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID", repairScope: Object.keys(rp.repairs || {}), reusedFieldsCount: st.ctx.dims.length - Object.keys(rp.repairs || {}).length, regeneratedFieldsCount: Object.keys(rp.repairs || {}).length, lineage: mg.dimensions, repairUnresolvedDimensions: mg.unresolvedDimensions }); }
       else { st.candidates[r.callId] = r.text; byCallId[r.callId] = st; record(st, meta, r, r.text, st.ctx ? mirrorParsed(st, r.text) : null, { strategy: STRATEGY.PASSTHROUGH, state: "PASSTHROUGH" }); }
       return r; }
     /* A — passe complete (BASE ou INFORMED) avec budget de sortie et max_tokens dimensionne */
```

### Diff de `lib/llm.js` (R6)

```diff
--- MONOLITH-v1.0.11/lib/llm.js	2026-09-19 16:39:53
+++ MONOLITH-v1.0.12/lib/llm.js	2026-09-22 14:09:00
@@ -68,7 +68,7 @@
   const extraCacheDirs = (opts.extraCacheDirs || cfg.reuseCacheDirs || []).map((d) => path.resolve(P.ROOT, d));
 
   let REFUSED = 0;
-  const PROVIDER_ID = "anthropic", VALIDATION_CONTRACT = "MONO-11-v2";   /* contrat SCIENTIFIQUE de validation des reponses (contractVersion MONO-11-v2, inchange en v0.3-r1 ; distinct de la version du CODE = sceau) */
+  const PROVIDER_ID = "anthropic", VALIDATION_CONTRACT = (P.CONFIG.frozenLots["MONO-11"] || {}).contractVersion || "MONO-11-v3";   /* v1.0.12 (R6) : contrat SCIENTIFIQUE lu dans la configuration du lot gele (MONO-11 v0.4 : MONO-11-v3) ; une reponse mise en cache sous un autre contrat n'est jamais reutilisee (reuseContextCheck) */   /* contrat SCIENTIFIQUE de validation des reponses (contractVersion MONO-11-v3 (lot MONO-11 v0.4) ; distinct de la version du CODE = sceau) */
   function cacheBodyPath(entry) { const c = [entry.cachePath, path.join(CACHE, entry.responseSha256 + ".response.json")].concat(extraCacheDirs.map((dir) => path.join(dir, entry.responseSha256 + ".response.json"))).filter(Boolean); return c.find((f) => fs.existsSync(f)) || null; }
   function reuseContextCheck(entry, model) {
     model = model || MODEL; if (!entry) return { ok: false, reason: "entree absente" };
```

### Diff de `tools/ef03b-registry-import.js` (R6 / Q5)

```diff
--- MONOLITH-v1.0.11/tools/ef03b-registry-import.js	2026-09-19 16:39:53
+++ MONOLITH-v1.0.12/tools/ef03b-registry-import.js	2026-09-22 14:02:50
@@ -1,7 +1,7 @@
 #!/usr/bin/env node
 "use strict";
 /**
- * MONOLITH v1.0.10 — tools/ef03b-registry-import.js : IMPORT HORS LIGNE des revues EF-03B deja VALID d'un run dans son registre
+ * MONOLITH v1.0.12 — tools/ef03b-registry-import.js : IMPORT HORS LIGNE des revues EF-03B deja VALID d'un run dans son registre
  * `reviews-valid.jsonl` (lib/ef03b-resilience.js), pour qu'un replay cible (POST /api/runs/:id/replay-reviews) les serve a 0 appel.
  * Deux sources, toutes deux RE-VALIDEES par le validateur local gele (MONO-11) ET le parseur EF-03B gele (MONO-01) avant import :
  *   1. les revues `complete` du reviewSet final (reviews.json) — candidat = projection des 9 cles du contrat, dans l'ordre du schema ;
@@ -13,10 +13,16 @@
 const fs = require("fs"), path = require("path"), crypto = require("crypto");
 const ROOT = path.resolve(__dirname, ".."); const P = require(path.join(ROOT, "lib", "paths.js")); const SP = require(path.join(ROOT, "lib", "stage-professionals.js")); const EF3 = require(path.join(ROOT, "lib", "ef03b-resilience.js"));
 const RE = require(path.join(P.MONO11, "core", "review-enforcer.js")); const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
+const CONTRACT = (P.CONFIG.frozenLots["MONO-11"] || {}).contractVersion || "MONO-11-v3";   /* v1.0.12 (R6) : contrat courant lu dans la configuration du lot gele */
 const lines = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
 const json = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
 function importRun(runDir, opts) {
-  opts = opts || {}; const { F, SEAL } = SP.loadSealedMono11(); const state = json(path.join(runDir, "state.json")); const traces = json(path.join(runDir, "enforcement-traces.json")).reviews; const reviews = json(path.join(runDir, "reviews.json")).reviews;
+  opts = opts || {}; const { F, SEAL } = SP.loadSealedMono11(); const state = json(path.join(runDir, "state.json"));
+  /* v1.0.12 (R6, decision proprietaire Q5) : FAIL CLOSED — aucun import automatique d'un run produit sous un autre sceau MONO-11 ou sous un autre contrat de validation. */
+  const runSeal = state.seal && state.seal.runtimeSealSha256 || null;
+  if (runSeal && runSeal !== SEAL.runtimeSealSha256) throw Object.assign(new Error("REGISTRY_IMPORT_SEAL_MISMATCH: le run a ete produit sous le sceau MONO-11 " + String(runSeal).slice(0, 12) + "… ; sceau courant " + SEAL.runtimeSealSha256.slice(0, 12) + "… — import refuse (aucune migration, aucune reutilisation inter-sceau)"), { code: "REGISTRY_IMPORT_SEAL_MISMATCH", runSeal: runSeal, currentSeal: SEAL.runtimeSealSha256 });
+  const foreign = EF3.createReviewRegistry({ runDir }).list().filter((e) => (e.validationContract || null) !== CONTRACT || (e.sourceSealHash || null) !== SEAL.runtimeSealSha256);
+  if (foreign.length) throw Object.assign(new Error("REGISTRY_IMPORT_CONTRACT_MISMATCH: " + foreign.length + " entree(s) du registre portent un autre contrat ou un autre sceau (contrat courant " + CONTRACT + ") — import refuse"), { code: "REGISTRY_IMPORT_CONTRACT_MISMATCH", entries: foreign.length, contract: CONTRACT }); const traces = json(path.join(runDir, "enforcement-traces.json")).reviews; const reviews = json(path.join(runDir, "reviews.json")).reviews;
   const twins = json(path.join(runDir, "twins.json")).twins; const tds = json(path.join(runDir, "target-document-set.json")); const schema = json(path.join(runDir, "review-schema.json")); const twinById = {}; twins.forEach((t) => { twinById[t.twinId] = t; });
   const calls = lines(path.join(runDir, "llm-calls.jsonl")).filter((c) => c.kind === "LLM_CALL" && /^EF-03B/.test(c.purpose || "") && c.httpStatus === 200); const led = {}; lines(path.join(runDir, "cost-ledger.jsonl")).forEach((e) => { if (e.callId && !led[e.callId]) led[e.callId] = e; }); const store = {}; lines(path.join(P.RUNS, "llm-reuse-store.jsonl")).forEach((e) => { if (e.responseSha256) store[e.responseSha256] = e; });
   const registry = EF3.createReviewRegistry({ runDir }); const existing = new Set(registry.list().map((e) => e.basePromptSha256 + "|" + e.candidateSha256)); const out = { imported: [], skipped: [], refused: [] };
@@ -25,12 +31,12 @@
   const tryImport = (t, twin, doc, candidate, source, extra) => { const v = RE.validateReviewCandidate(candidate, twin, doc, schema); if (!v.ok) { out.refused.push({ twinId: t.twinId, source, errors: v.errors.slice(0, 3).map((e) => e.code) }); return false; }
     try { F.M01.RR.parseReviewResponse(candidate, twin, doc, schema); } catch (e) { out.refused.push({ twinId: t.twinId, source, errors: ["EF03B_FROZEN_PARSER: " + String(e.message).slice(0, 80)] }); return false; }
     const key = t.passes[0].promptSha256 + "|" + sha(candidate); if (existing.has(key)) { out.skipped.push({ twinId: t.twinId, source, reason: "deja au registre" }); return true; }
-    const entry = Object.assign({ basePromptSha256: t.passes[0].promptSha256, twinId: t.twinId, targetId: t.targetId, runId: state.runId, candidateSha256: sha(candidate), candidate, validationContract: "MONO-11-v2", sourceSealHash: SEAL.runtimeSealSha256, modelId: null, providerId: "anthropic", source }, extra || {}); if (!opts.dryRun) registry.put(entry); existing.add(key); out.imported.push({ twinId: t.twinId, source, candidateSha256: entry.candidateSha256, attemptId: entry.attemptId || finalAttempt }); return true; };
+    const entry = Object.assign({ basePromptSha256: t.passes[0].promptSha256, twinId: t.twinId, targetId: t.targetId, runId: state.runId, candidateSha256: sha(candidate), candidate, validationContract: CONTRACT, sourceSealHash: SEAL.runtimeSealSha256, modelId: null, providerId: "anthropic", source }, extra || {}); if (!opts.dryRun) registry.put(entry); existing.add(key); out.imported.push({ twinId: t.twinId, source, candidateSha256: entry.candidateSha256, attemptId: entry.attemptId || finalAttempt }); return true; };
   for (const t of traces) { const twin = twinById[t.twinId]; const doc = F.M01.TDS.getDocumentForTarget(tds, t.targetId); if (!twin || !doc || !t.passes.length) continue; const rv = reviews.find((r) => r.twinId === t.twinId && r.targetId === t.targetId);
     if (rv && rv.reviewStatus === "complete" && Array.isArray(rv.findings)) { const findings = rv.findings.map((f) => { const o = {}; RE.FINDING_KEYS.forEach((k) => { o[k] = f[k]; }); return o; }); tryImport(t, twin, doc, JSON.stringify({ findings }), "FINAL_REVIEWSET_COMPLETE", { attemptId: finalAttempt, acceptedPass: t.acceptedPass }); continue; }
     /* revue en erreur : candidat VALID d'une tentative precedente, reconstruit et re-valide (preuves inchangees exigees par le validateur) */
     const hist = calls.filter((x) => x.twinId === t.twinId && led[x.responseSha256] && led[x.responseSha256].attemptId < finalAttempt).sort((a, b) => (led[a.responseSha256].attemptId - led[b.responseSha256].attemptId) || (a.pass - b.pass)); let parsed = null, done = false;
-    for (const x of hist) { const text = textOf(x.responseSha256); if (text == null) continue; let candidate = text; const j0 = RE.extractJson(text); if (j0.ok && j0.value && Array.isArray(j0.value.repairs) && parsed) { const rp = RE.parseRepair(text, parsed.findings.map((f) => f.dimensionId)); candidate = JSON.stringify(RE.recompose(parsed, rp.repairs || {})); }
+    for (const x of hist) { const text = textOf(x.responseSha256); if (text == null) continue; let candidate = text; const j0 = RE.extractJson(text); if (j0.ok && j0.value && Array.isArray(j0.value.repairs) && parsed) { const rp = RE.parseRepair(text, parsed.findings.map((f) => f.dimensionId)); candidate = JSON.stringify(RE.recompose(parsed, RE.mergeRepairLineage(parsed, rp.repairs || {}, doc.content).applied)); }
       const v = RE.validateReviewCandidate(candidate, twin, doc, schema); if (v.parsed && Array.isArray(v.parsed.findings)) parsed = v.parsed;
       if ((store[x.responseSha256] || {}).validationStatus === "VALID" && !done) { done = tryImport(t, twin, doc, candidate, "HISTORICAL_VALID_REVALIDATED_OFFLINE", { attemptId: led[x.responseSha256].attemptId, acceptedPass: x.pass, historicalCallId: x.responseSha256 }); } }
   }
```

## Tests

- `node test/test-monolith.js` : **292/292 (v1.0.11 : 274 ; +18 V12)** · `test-chunking` 21/21 · secret-scan 0 · anti-hardcoding 0 hit (75 fichiers) · `build-manifest --verify` ok 158 · lots gelés MONO-10 79 / MONO-09 9 / MONO-01 106 / MONO-11 55 (v0.4), 0 divergence

Liste minimale du mandat :

| # | exigence | couverture |
|---|---|---|
| 1 | tests v1.0.11 | repris (274 conserves, 3 assertions de version adaptees) |
| 2 | tests MONO-11 v0.4 | executes dans le lot (83/83) ; le monolithe verifie le MANIFEST du lot (83) |
| 3 | mirror parity | V12-02/03/06/07/16 |
| 4 | CAS A parity | V12-04 |
| 5 | CAS B parity | V12-05 |
| 6 | valid+invalid+repair | V12-02 |
| 7 | model omits valid ref | V12-03 |
| 8 | repair returns invalid ref | V12-06 |
| 9 | registry import old seal rejected | V12-11 |
| 10 | registry import old contract rejected | V12-11 |
| 11 | current v3 accepted | V12-10 |
| 12 | checkpoint old seal rejected | V12-14 (+ V5 existant) |
| 13 | no semantic field changed | V12-08 |
| 14 | shadow A10 12/12 | V12-13 (70 constats, 12 citations) |
| 15 | no regression aggregation/report | suite complete (V8, NONREG-01..03, T-EF03B-*) |
| 16 | secret scan | 0 |
| 17 | anti-hardcoding | 0 |
| 18 | manifest/seals | I3, I4, NONREG-01/02, T-STREAM-20, build-manifest --verify |

Manifeste : 158 fichiers, contentHash `9552b45e484cf2e3cdc4f7ef08e275cd1de117055e2643ac854e7a196178f3e2`.

## Réserves transportées

| id | énoncé | disposition |
|---|---|---|
| R3 | prompt de passe 3 potentiellement trompeur (« REPRODUISAIT A L IDENTIQUE ») quand la re-presentation vient du mecanisme CAS B | non traite (lot gele ; toucher au prompt = nouveau lot MONO-11) ; a verifier/reformuler dans un lot ulterieur, sans modifier la substance |
| R4 | parseRepair illisible : repairUnresolvedDimensions vaut [] et la lignee est absente | non traite (lot gele) ; l echec reste visible (repair.parsed=false, REPAIR_JSON_INVALID, passe invalide) |
| R12 | CAS B devient fail-closed : plus d echecs reels possibles qu avant | comportement attendu (Q6) ; a mesurer lors d un smoke reel, hors de ce lot |
| R13 | zip non garanti reproductible bit-a-bit | aucun zip canonique v1.0.12 produit a ce stade ; integrite par MANIFEST + SHA256SUMS ; ne pas revendiquer de reproductibilite deterministe |
| R2 | producedBy du lot annonce encore v0.3-r1 | champ non consomme par v1.0.12 (verifie : aucune lecture de producedBy dans lib/, tools/, server.js) ; observation transportee |
| R11 | regeneration INFORMED hors perimetre du contrat v3 | non elargie ; aucune garantie de lignee revendiquee sur ce chemin |

## Limites connues

- aucun run reel de validation (interdit avant decision proprietaire)
- aucun zip canonique produit
- audit independant de v1.0.12 requis avant gel et avant activation
- ACTIVE_VERSION reste MONOLITH-v1.0.10

**STOP avant audit indépendant et activation.**
