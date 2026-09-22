# EVIDENCEFORGE v1.0.13 — RA2 DOCUMENT CONTENT AUTHORITY FIX (+ RA1 TRACE PARITY) — RAPPORT

**Statut proposé : GELABLE** — NON GELÉ · généré 2026-09-22T14:40:05+00:00 · `ACTIVE_VERSION` reste **MONOLITH-v1.0.10** · 0 appel fournisseur, 0 run réel.

**Définition** : v1.0.13 = MONOLITH-v1.0.12 (gelee) + RA2_DOCUMENT_CONTENT_AUTHORITY_FIX + RA1_TRACE_PARITY_FIX, tous deux LOCAUX a l adaptateur EF-03B et a son cablage — et rien d autre.

## Cause racine (R-A2, défaut préexistant)

la litteralite etait jugee sur st.ctx.content, reconstruit par parseReviewPromptContext depuis le prompt EF-03B ; ce parseur coupe le document au premier marqueur « BASE DOCUMENTAIRE DU PROFESSIONNEL ». Si ce marqueur figure dans le CORPS du document cible et qu une ligne JSON le suit, le parse REUSSIT sur un contenu TRONQUE (contextUnparsed reste 0) : une citation valide situee apres le marqueur devient non litterale, le candidat est ampute, inscrit VALID au registre, puis servi a 0 appel.

Deux formes du déclencheur :
- marqueur suivi d une ligne JSON => contexte tronque MAIS parsable (cas dangereux, aucune alerte)
- marqueur sans ligne JSON => contexte illisible (parse null) => l adaptateur n intercepte pas ; le lot gele juge sur doc.content (deja sur)

## Principe appliqué

- **DOCUMENT_CONTENT_AUTHORITY** : le document original charge / scelle utilise pour la revue (celui remis au lot gele) ; l adaptateur le recoit explicitement via documentAuthority(targetId)
- **forbidden** : reparse(prompt) comme autorite finale de litteralite lorsque doc.content est disponible
- **promptRole** : artefact de generation ; sert a lire la FORME (dimensions, targetId, base documentaire), jamais a decider si une citation est litterale

## Invariant

pour toute reference r, isLiteral(r) est evalue contre le MEME contenu documentaire que celui utilise par le lot MONO-11

Mise en œuvre : adapterDocumentContent = documentAuthority(targetId) ; si l egalite avec le contenu reconstruit n est pas etablie, l AUTORITE fait foi et l ecart est compte (contextContentMismatch) et trace (DOCUMENT_AUTHORITY_MISMATCH) ; si l autorite est absente ou vide : FAIL CLOSED (DOCUMENT_AUTHORITY_REQUIRED / DOCUMENT_AUTHORITY_EMPTY, erreurs fatales remontees au run)

## Registre

- **writes** : chaque entree porte documentAuthoritySha256 (empreinte du contenu d autorite reellement utilise)
- **reads** : find() exige l egalite de cette empreinte ; une entree sans empreinte (ere <= v1.0.12, autorite indemontrable) ou d une autre autorite n est JAMAIS servie ; le refus est compte (registryRefusedForeignAuthority) et trace (REGISTRY_REFUSED / FOREIGN_DOCUMENT_AUTHORITY)

## R-A1 (trace)

dans le miroir de la reparation ciblee, une reparation illisible (parseRepair KO) n est plus recomposee ; la trace porte REPAIR_UNPARSABLE avec les dimensions fautives du lot et les codes d erreur de parseRepair

Inchangé : aucune regle d acceptation, aucun prompt, aucun lot gele ; le resultat final reste celui du lot (RA1-03)

## Diff v1.0.12 → v1.0.13

| fichier | avant | après | nature |
|---|---|---|---|
| `lib/ef03b-resilience.js` | `564a0e3d7a50…` | `d13c1752d1f2…` | R-A2 : resolveur documentAuthority obligatoire (fail closed fatal si absent/vide), withAuthority (forme du prompt + CONTENU de l autorite, ecart compte et trace), registre cle par documentAuthoritySha256 + refus trace d une entree d autre autorite ; R-A1 : reparation illisible non recomposee, trace REPAIR_UNPARSABLE, dimensions fautives du lot ; en-tete et schemaVersion du registre |
| `lib/pipeline.js` | `204862ccdb2e…` | `f5d48c534f29…` | cablage de l autorite documentaire (meme indexation target-NN que runDownstreamFromCheckpoint) ; schemaVersion de ef03b-resilience.json |
| `config/monolith.config.json` | `a34cc964c141…` | `b025bd30fc94…` | product.version MONOLITH-v1.0.13 ; $comment de definition |
| `tools/build-manifest.js` | `af1f086c5935…` | `bf94bd0455f9…` | predecesseur v1.0.12, provenance, statut candidat v1.0.13, champs ef03b.documentContentAuthority / traceParity |
| `tools/ef03b-autopsy.js` | `bb310c6ae708…` | `86e3d0bf1e4c…` | schemaVersion (une chaine) |
| `tools/package.sh` | `93400b4f8fd6…` | `5d494cf0d76a…` | nom du zip v1.0.13 |
| `README.md` | `661c8d6d862a…` | `75fab7e51b31…` | en-tete v1.0.13 (historique conserve) |
| `test/test-ef03b.js` | `0e0b7d530f15…` | `44eeac98e584…` | documentAuthority injecte dans les constructions d adaptateur ; documentAuthoritySha256 sur les entrees de registre ecrites directement ; chargement du module RA2/RA1 |
| `test/test-ef03b-lineage.js` | `35508d776d6d…` | `f285595d37f2…` | documentAuthority injecte |
| `test/test-v1012-lineage-parity.js` | `a077d59b2722…` | `a94de4ad49d1…` | documentAuthority injecte ; version du produit (V12-18) |
| `test/test-stream.js` | `dd23140a619c…` | `3b2402ff12df…` | version du produit (T-STREAM-20) |
| `test/results.json` | `4ff7dc2080f2…` | `56d509b75818…` | resultats (303/303) |
| `test/results-chunking.json` | `17a17576bbfa…` | `4064b3e7c92e…` | resultats (21/21) |
| `MANIFEST.json` | `d8bb0d3e7c28…` | `d6859435dfb5…` | mesure (303/303, 166 fichiers, contentHash 6f8e037a853b…) |
| `SHA256SUMS.txt` | `3c1c736fd19b…` | `6bf4ee166b1e…` | sceau du paquet |
| `test/test-v1013-document-authority.js` | — | `e1f3a26d1aac…` | AJOUT — RA2-01..08 et RA1-01..03 |

Byte-identiques : lib/llm.js, lib/stage-professionals.js, lib/stage-report.js, lib/panel-sufficiency.js, lib/economic-panel.js, lib/llm-stream.js, lib/live-status.js, lib/cost-view.js, lib/budget-guard.js, lib/run-stop.js, lib/run-store.js, server.js, index.html, tools/ef03b-registry-import.js, tools/secret-scan.js, tools/anti-hardcoding-scan.js, worker/ (proxy v0.8), vendor/, governance/, fixtures/. Lots gelés : MONO-01 / MONO-09 / MONO-10 / MONO-11 v0.4 : 0 divergence ; aucun lot modifie.

### Diff de `lib/ef03b-resilience.js`

```diff
--- MONOLITH-v1.0.12/lib/ef03b-resilience.js	2026-09-22 14:02:30
+++ MONOLITH-v1.0.13/lib/ef03b-resilience.js	2026-09-22 16:36:29
@@ -1,7 +1,20 @@
 "use strict";
 /**
- * EvidenceForge MONOLITH v1.0.12 — lib/ef03b-resilience.js
+ * EvidenceForge MONOLITH v1.0.13 — lib/ef03b-resilience.js
  * EF-03B REVIEW RESILIENCE : ADAPTATEUR ADDITIF autour de `llmCall` remis au lot gele MONO-11 (review-enforcer, INCHANGE).
+ * v1.0.13 — RA2 DOCUMENT CONTENT AUTHORITY FIX : la litteralite n'est JAMAIS jugee sur une reconstruction du prompt. L'adaptateur exige une
+ *   AUTORITE DOCUMENTAIRE (`documentAuthority(targetId) -> contenu`, le document reellement charge / scelle remis au lot gele) et l'utilise pour
+ *   toute decision de litteralite (miroir, propositions de litteralisation, validation locale, registre). Le prompt reste un artefact de
+ *   generation : il sert a lire la FORME (dimensions, targetId, base documentaire), jamais a decider si une citation est litterale.
+ *   - autorite absente ou vide => FAIL CLOSED (DOCUMENT_AUTHORITY_REQUIRED / DOCUMENT_AUTHORITY_EMPTY), jamais de repli silencieux ;
+ *   - contenu reconstruit != autorite => l'AUTORITE fait foi, l'ecart est compte (contextContentMismatch) et trace (jamais silencieux) ;
+ *   - registre : chaque entree porte documentAuthoritySha256 ; une entree sans cette empreinte ou avec une empreinte differente n'est JAMAIS servie.
+ *   Cause corrigee (R-A2 de l'audit independant v1.0.12, defaut PREEXISTANT) : parseReviewPromptContext coupe le document au marqueur
+ *   « BASE DOCUMENTAIRE DU PROFESSIONNEL » ; si ce marqueur figure dans le corps du document cible, le contenu etait silencieusement tronque,
+ *   une citation valide devenait « non litterale », le candidat ampute etait inscrit VALID au registre puis servi a 0 appel.
+ * v1.0.13 — RA1 TRACE PARITY : dans le miroir de la reparation ciblee, une reparation illisible (parseRepair KO) n'est plus recomposee ;
+ *   la trace reflete le statut du lot gele (REPAIR_UNPARSABLE / CANDIDATE_INVALID), et seules les dimensions fautives sont reparables.
+ *   Aucune regle d'acceptation, aucun prompt, aucun lot gele n'est modifie.
  * v1.0.12 — GLOBAL LINEAGE PRESERVATION : le miroir de la reparation ciblee gelee (branche isTargeted) applique RE.mergeRepairLineage du lot
  *   MONO-11 v0.4 (contrat MONO-11-v3) AVANT RE.recompose : le candidat trace / inscrit au registre est byte-identique a celui que le lot
  *   gele valide (R5 de l'audit independant v1.0.11). Le contrat de validation vient de la configuration du lot (R6). Bloc G inchange.
@@ -75,6 +88,7 @@
     return { targetId: targetId, content: content, workRefs: workRefs, dims: dims, basisLine: bl.slice(0, bl.indexOf("\n")) }; } catch (e) { return null; }
 }
 const twinLike = (ctx) => ({ twinId: null, documentaryBasis: { worksUsed: ctx.workRefs.map((r) => ({ workRef: r })) } });
+/** v1.0.13 — le document remis au validateur est TOUJOURS l'autorite documentaire (ctx.content est l'autorite depuis withAuthority). */
 const docLike = (ctx) => ({ targetId: ctx.targetId, content: ctx.content });
 const schemaLike = (ctx) => ({ dimensions: ctx.dims.map((d) => ({ id: d.id })) });
 /** validation LOCALE avec le validateur du lot gele (fonction pure exportee), sur le contexte lu dans le prompt. */
@@ -155,8 +169,10 @@
 function createReviewRegistry(opts) {
   const file = path.join(opts.runDir, REGISTRY_FILE); const extra = (opts.extraFiles || []).filter((f) => fs.existsSync(f));
   const read = () => [file].concat(extra).flatMap((f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []);
-  function find(basePromptSha256, sealHash, contract) { const all = read().filter((e) => e.basePromptSha256 === basePromptSha256 && e.validationContract === contract && (e.sourceSealHash || null) === (sealHash || null) && e.status === "VALID"); return all.length ? all[all.length - 1] : null; }
-  function put(entry) { fs.mkdirSync(opts.runDir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(Object.assign({ schema: "EvidenceForge.ValidReviewRecord", schemaVersion: "MONOLITH-v1.0.12", status: "VALID", recordedAt: new Date().toISOString() }, entry)) + "\n"); return entry; }
+  /** v1.0.13 (RA2-07) : une entree n'est servie que si elle porte la MEME empreinte d'autorite documentaire ; une entree sans empreinte (ere <= v1.0.12, autorite indemontrable) n'est jamais servie. */
+  function find(basePromptSha256, sealHash, contract, documentAuthoritySha256) { const all = read().filter((e) => e.basePromptSha256 === basePromptSha256 && e.validationContract === contract && (e.sourceSealHash || null) === (sealHash || null) && e.status === "VALID"
+    && (documentAuthoritySha256 ? e.documentAuthoritySha256 === documentAuthoritySha256 : true)); return all.length ? all[all.length - 1] : null; }
+  function put(entry) { fs.mkdirSync(opts.runDir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(Object.assign({ schema: "EvidenceForge.ValidReviewRecord", schemaVersion: "MONOLITH-v1.0.13", status: "VALID", recordedAt: new Date().toISOString() }, entry)) + "\n"); return entry; }
   return { find, put, list: read, file };
 }
 
@@ -167,32 +183,59 @@
  */
 function createReviewAdapter(opts) {
   const llm = opts.llm; const cfg = Object.assign({ maxTokens: 12288, enableOutputBudget: true, enableCompletion: true, enableLiteralization: true, maxCompletionDims: 4, excerptChars: 300, registryExtraFiles: [] }, (P.CONFIG.llm && P.CONFIG.llm.reviewResilience) || {}, opts.config || {}); delete cfg.$comment;
+  /* v1.0.13 (RA2) — AUTORITE DOCUMENTAIRE : documentAuthority(targetId) -> contenu du document reellement remis au lot gele (chaine non vide),
+     ou une table { targetId: contenu }. OBLIGATOIRE : sans elle, l'adaptateur refuse d'intercepter (fail closed) — jamais de repli sur le prompt. */
+  const authorityOf = (function (src) {
+    if (typeof src === "function") return (targetId) => src(targetId);
+    if (src && typeof src === "object") return (targetId) => src[targetId];
+    if (typeof src === "string") return () => src;
+    return null;
+  })(opts.documentAuthority);
+  if (!authorityOf) throw Object.assign(new Error("DOCUMENT_AUTHORITY_REQUIRED: l'adaptateur EF-03B exige l'autorite documentaire (documentAuthority) ; la litteralite ne peut pas etre jugee sur une reconstruction du prompt"), { code: "DOCUMENT_AUTHORITY_REQUIRED", fatal: true });   /* fatal : remonte au run (fail closed), jamais consomme comme une passe fournisseur */
+  function requireAuthority(targetId) {
+    let c; try { c = authorityOf(targetId); } catch (e) { c = null; }
+    if (typeof c !== "string") throw Object.assign(new Error("DOCUMENT_AUTHORITY_REQUIRED: aucun contenu documentaire d'autorite pour la cible " + JSON.stringify(targetId)), { code: "DOCUMENT_AUTHORITY_REQUIRED", targetId: targetId || null, fatal: true });
+    if (!c.length) throw Object.assign(new Error("DOCUMENT_AUTHORITY_EMPTY: contenu documentaire d'autorite vide pour la cible " + JSON.stringify(targetId)), { code: "DOCUMENT_AUTHORITY_EMPTY", targetId: targetId || null, fatal: true });
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
+  /** v1.0.13 (RA2) — le contexte lu dans le prompt donne la FORME ; le CONTENU vient de l'autorite documentaire. Tout ecart est compte et trace, jamais silencieux. */
+  function withAuthority(st, ctx, meta) {
+    const authority = requireAuthority(meta && meta.targetId);
+    st.authorityContent = authority; st.authoritySha256 = sha(authority);
+    if (!ctx) return null;
+    const mismatch = ctx.content !== authority;
+    if (mismatch) { stats.contextContentMismatch++; trace({ twinId: st.twinId, targetId: st.targetId, reviewIndex: st.index, event: "ef03b_pass", strategy: "DOCUMENT_AUTHORITY_MISMATCH", state: "AUTHORITY_ENFORCED", promptParsedContentSha256: sha(ctx.content), documentAuthoritySha256: st.authoritySha256, promptParsedContentLength: ctx.content.length, documentAuthorityLength: authority.length }); }
+    return Object.assign({}, ctx, { content: authority, promptParsedContentSha256: sha(ctx.content), contentFromAuthority: true, contentMismatch: mismatch });
+  }
   const maxPasses = Number(P.CONFIG.llm.reviewMaxPasses || 3);
   const base = (st, meta, extra) => Object.assign({ twinId: st.twinId, targetId: st.targetId, reviewIndex: st.index, twinsTotal: typeof opts.twinsTotal === "function" ? opts.twinsTotal() : null, reviewPass: meta.pass, maxPasses: maxPasses, enforcerStrategy: meta.strategy || null }, extra || {});
   async function call(prompt, meta, extraMeta) { const m = Object.assign({}, meta, { maxTokens: cfg.maxTokens }, extraMeta || {}); const r = await llm.llmCall(prompt, m); if (!r.reused) stats.realCalls++; return r; }
   function record(st, meta, r, cand, v, extra) { const cost = r && r.callId ? costOf(r.callId) : 0; st.costUsd = Math.round((st.costUsd + cost) * 1e4) / 1e4; stats.cumulativeReviewCostUsd = Math.round((stats.cumulativeReviewCostUsd + cost) * 1e4) / 1e4;
     const rec = base(st, meta, Object.assign({ strategy: extra.strategy, stopReason: r && r.stopReason || null, inputTokens: r && r.usage ? r.usage.input_tokens : null, outputTokens: r && r.usage ? r.usage.output_tokens : null, validationErrorsCount: v ? v.errors.length : null, validationErrorCodes: v ? Array.from(new Set(v.errors.map((e) => e.code))) : [], state: extra.state, costUsd: Math.round(cost * 1e4) / 1e4, cumulativeReviewCostUsd: stats.cumulativeReviewCostUsd, candidateSha256: cand ? sha(cand) : null, callId: r && r.callId || null }, extra)); st.passes.push(rec); trace(rec); return rec; }
-  function mirrorParsed(st, cand) { if (!st.ctx) return; const v = validateCandidate(cand, st.ctx); if (v.parsed && Array.isArray(v.parsed.findings)) st.parsed = v.parsed; return v; }
+  function mirrorParsed(st, cand) { if (!st.ctx) return; const v = validateCandidate(cand, st.ctx); if (v.parsed && Array.isArray(v.parsed.findings)) st.parsed = v.parsed; st.lastErrors = v.errors || []; return v; }   /* v1.0.13 (RA1) : les erreurs de la derniere validation miroir servent a cibler les dimensions fautives */
 
   async function reviewCall(prompt, meta) {
     const st = stateOf(meta); const isBase = meta.pass === 1 || meta.strategy === "BASE_EF03B"; const isTargeted = /TARGETED/.test(String(meta.strategy || ""));
-    if (isBase) { st.basePromptSha256 = sha(prompt); st.ctx = parseReviewPromptContext(prompt); if (!st.ctx) stats.contextUnparsed++;
+    if (isBase) { st.basePromptSha256 = sha(prompt); st.ctx = withAuthority(st, parseReviewPromptContext(prompt), meta); if (!st.ctx) stats.contextUnparsed++;   /* v1.0.13 (RA2) : forme lue dans le prompt, CONTENU = autorite documentaire (fail closed si absente) */
       /* E — registre : revue logique deja VALID (meme prompt gele de passe 1 = meme jumeau, memes preuves, meme document, meme schema ; meme sceau, meme contrat) */
-      const hit = registry.find(st.basePromptSha256, opts.sealHash || null, CONTRACT);
+      const hit = registry.find(st.basePromptSha256, opts.sealHash || null, CONTRACT, st.authoritySha256);   /* v1.0.13 (RA2-07) : meme autorite documentaire exigee */
+      if (!hit) { const foreign = registry.find(st.basePromptSha256, opts.sealHash || null, CONTRACT); if (foreign) { stats.registryRefusedForeignAuthority++; trace({ twinId: st.twinId, targetId: st.targetId, reviewIndex: st.index, event: "ef03b_pass", strategy: "REGISTRY_REFUSED", state: "FOREIGN_DOCUMENT_AUTHORITY", entryAuthoritySha256: foreign.documentAuthoritySha256 || null, documentAuthoritySha256: st.authoritySha256 }); } }   /* v1.0.13 (RA2-07) : entree d'une autre autorite (ou sans empreinte) : jamais servie, refus trace */
       if (hit && (!st.ctx || validateCandidate(hit.candidate, st.ctx).ok)) { stats.registryReuses++; const callId = "ef03b-registry-" + hit.candidateSha256; st.candidates[callId] = hit.candidate; byCallId[callId] = st; mirrorParsed(st, hit.candidate);
         if (typeof llm.recordReuse === "function") llm.recordReuse({ purpose: meta.purpose, twinId: meta.twinId, targetId: meta.targetId, callId: hit.candidateSha256, sourceRunId: hit.sourceRunId || hit.runId || null, reason: "revue logique VALID reutilisee (registre EF-03B : prompt de passe 1 + sceau + contrat identiques)", kind: "REVIEW_REGISTRY" });
         record(st, meta, null, hit.candidate, { errors: [] }, { strategy: STRATEGY.REGISTRY, state: "REUSED_VALID", reusedFieldsCount: st.ctx ? st.ctx.dims.length : null, regeneratedFieldsCount: 0, repairScope: [], sourceAttemptId: hit.attemptId || null });
         return { text: hit.candidate, callId: callId, providerId: hit.providerId || "anthropic", modelId: hit.modelId || llm.model, providerRequestId: null, transportKind: "REVIEW_REGISTRY_REUSE", httpStatus: 200, reused: true, stopReason: "end_turn", usage: null }; } }
     if (isTargeted || !st.ctx) {   /* reparation ciblee gelee (petite sortie) ou contexte illisible : transport seul */
-      const r = await call(prompt, meta); if (isTargeted && st.ctx && st.parsed) { const rp = RE.parseRepair(r.text, Object.keys(st.parsed.findings.reduce((o, f) => { o[f.dimensionId] = 1; return o; }, {})));
-        const mg = RE.mergeRepairLineage(st.parsed, rp.repairs || {}, st.ctx.content);   /* v1.0.12 (R5) : MIROIR ALIGNE SUR LE LOT GELE v0.4 — meme fusion de lignee, meme semantique CAS A / CAS B ; le candidat trace est byte-identique a celui que le lot valide */
+      if (isTargeted && st.ctx) st.ctx = withAuthority(st, st.ctx, meta) || st.ctx;   /* v1.0.13 (RA2) : l'autorite est revalidee a chaque passe ciblee (fail closed si elle disparait) */
+      const r = await call(prompt, meta); if (isTargeted && st.ctx && st.parsed) { const faulty = RE.faultyDimensions(st.lastErrors || []); const rp = RE.parseRepair(r.text, faulty.length ? faulty : Object.keys(st.parsed.findings.reduce((o, f) => { o[f.dimensionId] = 1; return o; }, {})));   /* v1.0.13 (RA1) : memes dimensions fautives que le lot gele */
+        if (!rp.ok) { st.candidates[r.callId] = JSON.stringify(st.parsed); byCallId[r.callId] = st; record(st, meta, r, JSON.stringify(st.parsed), { errors: st.lastErrors || [], parsed: st.parsed }, { strategy: STRATEGY.PASSTHROUGH, state: "REPAIR_UNPARSABLE", repairScope: faulty, repairErrors: (rp.errors || []).map((e) => e.code), reusedFieldsCount: st.ctx.dims.length, regeneratedFieldsCount: 0 }); return r; }   /* v1.0.13 (RA1) : reparation illisible => aucune recomposition, trace alignee sur le rejet du lot */
+        const mg = RE.mergeRepairLineage(st.parsed, rp.repairs || {}, st.ctx.content);   /* v1.0.12 (R5) : MIROIR ALIGNE SUR LE LOT GELE v0.4 — meme fusion de lignee, meme semantique CAS A / CAS B ; le candidat trace est byte-identique a celui que le lot valide ; v1.0.13 : contenu = autorite documentaire */
         const cand = JSON.stringify(RE.recompose(st.parsed, mg.applied)); st.candidates[r.callId] = cand; byCallId[r.callId] = st; const v = mirrorParsed(st, cand); record(st, meta, r, cand, v, { strategy: STRATEGY.PASSTHROUGH, state: v && v.ok ? "CANDIDATE_VALID" : "CANDIDATE_INVALID", repairScope: Object.keys(rp.repairs || {}), reusedFieldsCount: st.ctx.dims.length - Object.keys(rp.repairs || {}).length, regeneratedFieldsCount: Object.keys(rp.repairs || {}).length, lineage: mg.dimensions, repairUnresolvedDimensions: mg.unresolvedDimensions }); }
       else { st.candidates[r.callId] = r.text; byCallId[r.callId] = st; record(st, meta, r, r.text, st.ctx ? mirrorParsed(st, r.text) : null, { strategy: STRATEGY.PASSTHROUGH, state: "PASSTHROUGH" }); }
       return r; }
@@ -223,7 +266,7 @@
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
+++ MONOLITH-v1.0.13/lib/pipeline.js	2026-09-22 16:31:26
@@ -264,11 +264,14 @@
         /* v1.0.10 — EF-03B REVIEW RESILIENCE : l'aval gele recoit un llm dont llmCall / onValidation passent par l'adaptateur (registre des revues VALID, budget de sortie,
            troncature => completion ciblee, litteralisation sur extraits) ; le lot gele valide et accepte seul. Transport, verrou, compteurs : ceux du llm reel (delegues). */
         let twinsBuilt = null; const logDown = (e) => { if (e && e.event === "twins_built" && typeof e.built === "number") twinsBuilt = e.built; return log(e); };
-        const adapter = EF3.createReviewAdapter({ llm, runDir: store.dir, runId, attemptId: state.attempts, sealHash, config: { maxTokens: P.CONFIG.llm.reviewMaxTokens }, onTrace: logDown, twinsTotal: () => twinsBuilt });
+        const adapter = EF3.createReviewAdapter({ llm, runDir: store.dir, runId, attemptId: state.attempts, sealHash, config: { maxTokens: P.CONFIG.llm.reviewMaxTokens }, onTrace: logDown, twinsTotal: () => twinsBuilt,
+          documentAuthority: (targetId) => {   /* v1.0.13 (RA2) : AUTORITE DOCUMENTAIRE = le document reellement remis au lot gele (meme indexation que runDownstreamFromCheckpoint : target-NN), jamais une reconstruction du prompt ; cible inconnue => undefined => l'adaptateur fail-close */
+            const m = /^target-(\d+)$/.exec(String(targetId || "")); const d = m ? targetDocs[Number(m[1]) - 1] : null; return d && typeof d.content === "string" ? d.content : undefined;
+          } });
         const llmDown = Object.assign({}, llm, { llmCall: adapter.llmCall, onValidation: adapter.onValidation });
         const r = await SP.runDownstreamFromCheckpoint({ runDir: store.dir, runId, attemptId: state.attempts, attemptRunId, missionId, missionHash: state.mission.questionSha256, missionQuestion, runContract: disciplines.runContract, corpusSnapshot, discovery: disc.discovery, verification: disc.verification,
           checkpoint: cpPro, targetDocuments: targetDocs, llm: llmDown, upstreamReservations, log: logDown });   /* v1.0.7 : cibles = dossier de mission (ou par document, explicite) */
-        const ef03b = adapter.stats(); r.summary.ef03b = ef03b; store.saveJson("ef03b-resilience.json", Object.assign({ schema: "EvidenceForge.EF03BResilienceSummary", schemaVersion: "MONOLITH-v1.0.12", attemptId: state.attempts }, ef03b));   /* v1.0.10 : reuse registre / troncatures / completions / litteralisations / cout cumule des revues */
+        const ef03b = adapter.stats(); r.summary.ef03b = ef03b; store.saveJson("ef03b-resilience.json", Object.assign({ schema: "EvidenceForge.EF03BResilienceSummary", schemaVersion: "MONOLITH-v1.0.13", attemptId: state.attempts }, ef03b));   /* v1.0.10 : reuse registre / troncatures / completions / litteralisations / cout cumule des revues */
         const ref = store.saveCheckpoint("checkpoint-downstream.json", r.checkpoint); cpDown = store.loadCheckpoint("checkpoint-downstream.json"); log({ event: "checkpoint_saved", checkpoint: "downstream", contentHash: ref.contentHash });
         store.saveJson("corpora-admitted.json", cpDown.corpusSet); store.saveJson("twins.json", cpDown.twinSet); store.saveJson("coverage.json", cpDown.coverageMatrix); store.saveJson("panel-selection.json", cpDown.panelSelection); store.saveJson("review-schema.json", cpDown.reviewSchema);
         store.saveJson("target-document-set.json", cpDown.targetDocumentSet); store.saveJson("reviews.json", cpDown.reviewSet); store.saveJson("normalization-records.json", cpDown.normalizationRecords); store.saveJson("enforcement-traces.json", cpDown.enforcementTraces);
```

## Tests

- `node test/test-monolith.js` : **303/303 (292 de v1.0.12 conserves + 11 nouveaux)** · chunking 21/21 · secret 0 · anti-hardcoding 0 hit (76 fichiers) · `--verify` ok 166 · lots gelés 0 divergence · shadow A10 70 constats / 12 citations / 3 constats vides restaures (V12-13)

| test | contenu |
|---|---|
| **RA2-01** | document ordinaire : comportement inchange, 0 ecart, empreinte d autorite au registre |
| **RA2-02** | marqueur dans le document : citation apres le marqueur conservee ; reconstruction du prompt prouvee tronquee ; ecart compte et trace ; seconde forme (contexte illisible) : aucune interception, citation conservee par le lot |
| **RA2-03** | marqueurs multiples : aucune troncature silencieuse |
| **RA2-04** | l autorite fait foi dans les deux sens (citation absente de l autorite jamais acceptee) |
| **RA2-05** | fail closed a la construction, a l appel et sur autorite vide ; aucun repli sur le prompt |
| **RA2-06** | inscription au registre avec l empreinte d autorite ; candidat non ampute |
| **RA2-07** | entree sans empreinte ou d une autre autorite : jamais servie ; entree de la bonne autorite : servie |
| **RA2-08** | fixture adversariale historique : ancienne regle => citation perdue ; v1.0.13 => citation conservee ; entree amputee non servie |
| **RA1-01** | trace REPAIR_UNPARSABLE, jamais CANDIDATE_VALID, dimensions fautives du lot, motif trace |
| **RA1-02** | aucune ecriture au registre, echec explicite |
| **RA1-03** | resultat final identique au lot seul (memes passes) |

Manifeste : 166 fichiers, contentHash `6f8e037a853b1e46f12d21e95e6d6d516db84a73f2ebddb6e0e10ca5378c4ead`.

## Non-régression

- **292 tests v1.0.12** : conserves (adaptations : injection de documentAuthority dans les constructions d adaptateur des tests, empreinte d autorite sur 3 entrees de registre ecrites directement, 2 assertions de version)
- **MONO-11 v0.4** : inchange (0 divergence, sceau 110db4de…)
- **R5 parity** : V12-02..07/16 verts
- **R6 fail-closed** : V12-09..12 verts
- **shadow A10** : 70/12/3
- **aggregation** : 13/9/7/0/67/10 ; QUALIFIED_WITH_RESERVATIONS ; SCIENTIFICALLY_USABLE = NO
- **semantique** : aucune modification (aucun champ substantiel touche)

## Limites connues

- aucun run reel (interdit)
- aucun zip canonique
- audit independant requis avant gel
- ACTIVE_VERSION reste MONOLITH-v1.0.10 ; smoke reel R12 requis avant activation
- R-A3 (commentaire build-manifest) et R-A5 (annotation post-hash du shadow) non traitees, par decision

**STOP avant audit indépendant, gel et activation.**
