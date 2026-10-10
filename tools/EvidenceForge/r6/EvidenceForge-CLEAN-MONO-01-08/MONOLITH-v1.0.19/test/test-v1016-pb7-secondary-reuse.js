"use strict";
/**
 * EvidenceForge MONOLITH v1.0.16 — test/test-v1016-pb7-secondary-reuse.js : PB-B7 SECONDARY REUSE FIX.
 * Charge par test/test-ef03b.js. Aucun fournisseur : fetch est remplace par un serveur factice LOCAL (compte les appels) ; la chaine exercee est
 * la chaine de production — transport reel (lib/llm.js, magasin fichier reel) -> adaptateur EF-03B reel -> lot GELE MONO-11 v0.4 execute reellement.
 *
 * Cause (audit PB-B7, cas T3b) : registre EF-03B lie a targetId + documentAuthoritySha256 -> refus -> repli sur llm-reuse-store indexe sur
 * promptSha256 + contexte generique -> ancienne reponse servie -> validation acceptee -> onValidation l'inscrit sous la NOUVELLE autorite.
 * Invariant v1.0.16 : une reutilisation EF-03B exige CURRENT.{targetId, documentAuthoritySha256, contractVersion, runtimeSeal} ===
 * REUSED.{...} ; une entree EF-03B sans targetId ou sans documentAuthoritySha256 = NON_REUSABLE_FOR_EF03B_V3 (aucune migration).
 *
 * PB7-01..12 : matrice du mandat. PB7-13 : les 20 entrees EF-03B reelles du smoke phase B (metadonnees seules, fixture en lecture seule).
 */
const fs = require("fs"), path = require("path");
module.exports = async function (h) {
  const { T, assert, tmp, sha, P, setEnv, createLlm } = h;
  const EF3 = require("../lib/ef03b-resilience.js"); const SP = require("../lib/stage-professionals.js"); const TI = require("../lib/target-identity.js");
  const LLM = require("../lib/llm.js");
  const RE = require(path.join(P.MONO11, "core", "review-enforcer.js")); const TN = require(path.join(P.MONO11, "core", "target-normalizer.js"));
  const { F, SEAL } = SP.loadSealedMono11(); const CONTRACT = P.CONFIG.frozenLots["MONO-11"].contractVersion;
  console.log("\n— v1.0.16 : PB-B7 SECONDARY REUSE FIX (PB7-01..13) —");

  /* ---------- fixtures ---------- */
  const DIMS = ["DIM-01", "DIM-02", "DIM-03"];
  const CITE_A = "La citation litterale du document A figure ici.";
  const CITE_C = "Le document C porte une citation qui lui est propre.";
  const rawA = "# Fiche PB7\n\nIntroduction du document cible, avec l’apostrophe typographique.\n\n" + CITE_A + "\n";
  const rawB = rawA + "\nParagraphe ajoute apres coup : il n'existait pas lors de la premiere revue.\n";   /* B PROLONGE A */
  const rawC = "# Fiche C\n\nUn autre document.\n\n" + CITE_C + "\n";
  const DOC = (title, content) => ({ documentId: title, title, content, hashSha256: sha(content) });
  const DOC_A = DOC("Document A", rawA), DOC_B = DOC("Document A (prolonge)", rawB), DOC_C = DOC("Document C", rawC);
  const norm = (d, i) => TN.normalizeTargetDocument({ targetId: TI.targetIdAt(i || 0), label: d.title, content: d.content }).document.content;
  const normA = norm(DOC_A), normB = norm(DOC_B), AUTH_A = sha(normA), AUTH_B = sha(normB);
  const schemaFor = (tid) => ({ schema: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1", stage: "EF-03A", missionQuestion: "Question de mission de test.", dimensions: DIMS.map((id, i) => ({ id, label: "Dimension " + (i + 1), definition: "Definition " + (i + 1) + "." })), reviewTargets: [{ targetId: tid }], schemaHash: sha("schema") });
  const TWIN = { twinId: "twin-pb7", professionalRef: "pro-pb7", referenceIdentity: { displayName: "Professionnel PB7" }, documentaryBasis: { worksUsed: [{ workRef: "Work A", title: "Work A" }], dimensionCoverage: {} } };
  const finding = (id, ref, tag) => ({ dimensionId: id, disposition: "support", epistemicStatus: "documented", finding: "Constat " + id + (tag || "") + ".", rationale: "Justification " + id + (tag || "") + ".", targetEvidenceRefs: [ref], twinBasisWorkRefs: ["Work A"], confidenceQualitative: "medium", limitations: ["Limite " + id] });
  const reviewJson = (ref, tag) => JSON.stringify({ findings: DIMS.map((id) => finding(id, ref, tag)) });

  /* ---------- fournisseur factice LOCAL (aucun reseau) ---------- */
  const K_KEY = "EVIDENCEFORGE_WORKER" + "_API_KEY", K_URL = "LLM_WORKER" + "_BASE_URL";
  let NET = 0;
  async function withNet(textFor, fn) {
    const prevStream = process.env.EVIDENCEFORGE_LLM_STREAM, prevSpacing = process.env.EVIDENCEFORGE_LLM_MIN_SPACING_MS;
    setEnv(K_KEY, "TESTKEY-not-a-real-secret-0000"); setEnv(K_URL, "http://127.0.0.1:1"); process.env.EVIDENCEFORGE_LLM_MIN_SPACING_MS = "0"; process.env.EVIDENCEFORGE_LLM_STREAM = "0";
    const orig = global.fetch;
    global.fetch = async (u, init) => { NET++; const body = JSON.parse(init.body); const text = textFor(body.messages[0].content, NET);
      return new Response(JSON.stringify({ id: "msg_pb7_" + NET, model: body.model, content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }), { status: 200, headers: { "content-type": "application/json" } }); };
    try { return await fn(); } finally { global.fetch = orig; setEnv(K_KEY, null); setEnv(K_URL, null); setEnv("EVIDENCEFORGE_LLM_STREAM", prevStream == null ? null : prevStream); setEnv("EVIDENCEFORGE_LLM_MIN_SPACING_MS", prevSpacing == null ? null : prevSpacing); }
  }
  const lines = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map(JSON.parse) : [];
  const logOf = (dir) => lines(path.join(dir, "llm-calls.jsonl"));
  const refusalsOf = (dir) => logOf(dir).filter((x) => x.kind === "LLM_REUSE_REFUSED");
  const storeReusesOf = (dir) => logOf(dir).filter((x) => x.kind === "LLM_REUSE" && !x.reuseKind);

  /** CHAINE DE PRODUCTION : transport reel + magasin -> adaptateur (carte canonique = adapterDocs) -> lot gele (examine lotDocs). */
  async function chain(o) {
    const dir = o.dir || tmp();
    if (o.registryEntries) fs.writeFileSync(path.join(dir, EF3.REGISTRY_FILE), o.registryEntries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const llm = createLlm(Object.assign({ runDir: dir, runId: "pb7-" + path.basename(dir), storePath: o.store, sealHash: SEAL.runtimeSealSha256 }, o.llmOpts || {}));
    const adapter = EF3.createReviewAdapter({ llm, runDir: dir, runId: "pb7", attemptId: 1, sealHash: SEAL.runtimeSealSha256, config: { maxTokens: 12288 }, twinsTotal: () => 1, targetDocuments: o.adapterDocs });
    const tds = await F.M01.TDS.buildTargetDocumentSet("m-pb7", o.lotDocs.map((d, i) => ({ targetId: TI.targetIdAt(i), label: d.title, content: norm(d, i) })));
    const out = []; const n0 = NET;
    for (const tid of (o.tids || ["target-01"])) { const lotDoc = F.M01.TDS.getDocumentForTarget(tds, tid);
      out.push(await RE.runEnforcedReview({ frozen: F, twin: TWIN, targetDoc: lotDoc, reviewSchema: schemaFor(tid), llmCall: adapter.llmCall, maxPasses: 3, onValidation: adapter.onValidation, runId: "pb7" })); }
    return { r: out[0], all: out, dir, llm, adapter, net: NET - n0, stats: adapter.stats(), registry: adapter.registry.list(), refusals: refusalsOf(dir), storeReuses: storeReusesOf(dir) };
  }
  const ef03bEntries = (store) => lines(store).filter((e) => /^EF-03B/.test(e.purpose || ""));
  const copyStore = (store) => { const s2 = path.join(tmp(), "store.jsonl"); fs.copyFileSync(store, s2); return s2; };

  /* etat de reference : une revue EF-03B de A produite et VALIDEE sous v1.0.16 (entree du magasin portant son identite) */
  let BASE = null;
  async function base() {
    if (BASE) return BASE;
    const store = path.join(tmp(), "store.jsonl");
    const run1 = await withNet(() => reviewJson(CITE_A), () => chain({ store, adapterDocs: [DOC_A], lotDocs: [DOC_A] }));
    assert(run1.r.review.reviewStatus === "complete" && run1.net === 1, "revue de reference : 1 appel reel, acceptee : " + JSON.stringify(run1.r.review.error));
    const entry = ef03bEntries(store)[0]; const prompt = JSON.parse(fs.readFileSync(path.join(run1.dir, "llm-cache", entry.promptSha256 + ".request.json"), "utf8")).prompt;
    BASE = { store, run1, entry, prompt, textA: reviewJson(CITE_A), candidateA: run1.registry[0].candidate };
    return BASE;
  }
  /** essai au niveau du MAGASIN (transport seul) : meme prompt que la reference, entree eventuellement alteree, identite courante eventuellement alteree */
  async function transportTry(o) {
    const b = await base(); const dir = tmp(); const store = path.join(dir, "store.jsonl");
    const e = Object.assign({}, b.entry, o.entryPatch || {}); (o.entryDelete || []).forEach((k) => { delete e[k]; }); fs.writeFileSync(store, JSON.stringify(e) + "\n");
    const llm = createLlm(Object.assign({ runDir: dir, runId: "pb7t", storePath: store, sealHash: SEAL.runtimeSealSha256 }, o.llmOpts || {}));
    const meta = Object.assign({ purpose: "EF-03B review", pass: 1, twinId: TWIN.twinId, targetId: "target-01", documentAuthoritySha256: AUTH_A }, o.metaPatch || {});
    const n0 = NET; const r = await withNet(() => "recalcule", () => llm.llmCall(b.prompt, meta));
    return { served: r.reused === true, net: NET - n0, codes: refusalsOf(dir).map((x) => x.code) };
  }

  /* ============================== PB7-01..12 ============================== */

  await T("PB7-01", "same prompt + same target + same authority + same contract + same seal => reuse AUTORISE : l'entree ecrite porte son identite (targetId, documentAuthoritySha256, contrat, sceau) ; nouvelle execution (nouveau run, meme magasin) servie a 0 appel, meme revue", async () => {
    const b = await base();
    assert(b.entry.validationStatus === "VALID" && b.entry.targetId === "target-01" && b.entry.documentAuthoritySha256 === AUTH_A && b.entry.validationContract === CONTRACT && b.entry.sourceSealHash === SEAL.runtimeSealSha256 && b.entry.reuseIdentity === "EF03B-v1.0.16", "entree du magasin liee : " + JSON.stringify(b.entry));
    const run2 = await withNet(() => { throw new Error("AUCUN APPEL ATTENDU"); }, () => chain({ store: copyStore(b.store), adapterDocs: [DOC_A], lotDocs: [DOC_A] }));
    assert(run2.net === 0 && run2.storeReuses.length === 1 && run2.refusals.length === 0, "servi par le magasin, 0 appel : " + JSON.stringify({ net: run2.net, refusals: run2.refusals.map((x) => x.code) }));
    assert(run2.r.review.reviewStatus === "complete" && JSON.stringify(run2.r.review.findings) === JSON.stringify(b.run1.r.review.findings), "revue identique");
    const t = transportTry({}); const tt = await t; assert(tt.served === true && tt.net === 0 && tt.codes.length === 0, "transport : servi sous identite identique " + JSON.stringify(tt)); });

  await T("PB7-02", "same prompt + DIFFERENT target => reuse REFUSE (EF03B_REUSE_TARGET_MISMATCH), recalcul reel", async () => {
    const t = await transportTry({ metaPatch: { targetId: "target-02" } }); assert(t.served === false && t.net === 1 && t.codes.join() === "EF03B_REUSE_TARGET_MISMATCH", JSON.stringify(t)); });

  await T("PB7-03", "same prompt + DIFFERENT authority => reuse REFUSE (EF03B_REUSE_AUTHORITY_MISMATCH), recalcul reel", async () => {
    const t = await transportTry({ metaPatch: { documentAuthoritySha256: sha("autre document") } }); assert(t.served === false && t.net === 1 && t.codes.join() === "EF03B_REUSE_AUTHORITY_MISMATCH", JSON.stringify(t)); });

  await T("PB7-04", "[BLOCKING — cas T3b de l'audit PB-B7, chaine de production] autorite B PROLONGE A, prompt du lot identique, registre refusant l'entree A : le magasin REFUSE aussi, la revue est recalculee et AUCUNE reponse A n'est inscrite sous B", async () => {
    const b = await base();
    assert(normB !== normA && normB.indexOf(normA) === 0, "precondition : B prolonge A (A est un prefixe strict de B)");
    const run = await withNet(() => reviewJson(CITE_A, " (recalcule sous B)"), () => chain({ store: copyStore(b.store), registryEntries: b.run1.registry, adapterDocs: [DOC_B], lotDocs: [DOC_A] }));
    assert(run.stats.registryRefusedForeignAuthority === 1 && run.stats.contextContentMismatch >= 1, "registre : entree A refusee (autorite etrangere) ; ecart prompt/autorite observe : " + JSON.stringify(run.stats));
    assert(run.storeReuses.length === 0 && run.refusals.length === 1 && run.refusals[0].code === "EF03B_REUSE_AUTHORITY_MISMATCH" && run.refusals[0].entryAuthoritySha256 === AUTH_A && run.refusals[0].documentAuthoritySha256 === AUTH_B, "magasin : refus d'autorite journalise : " + JSON.stringify(run.refusals));
    assert(run.net === 1 && run.r.review.reviewStatus === "complete", "revue recalculee normalement (1 appel reel)");
    const underB = run.registry.filter((e) => e.documentAuthoritySha256 === AUTH_B);
    assert(underB.length === 1 && underB.every((e) => e.candidate !== b.candidateA && e.candidate.indexOf("(recalcule sous B)") !== -1), "aucune reponse A inscrite sous B ; seule la reponse recalculee l'est : " + JSON.stringify(underB.map((e) => e.candidateSha256)));
    assert(run.registry.filter((e) => e.candidate === b.candidateA).every((e) => e.documentAuthoritySha256 === AUTH_A), "la reponse A n'existe que sous l'autorite A"); });

  await T("PB7-05", "same prompt + DIFFERENT contract => refus (EF03B_REUSE_CONTRACT_MISMATCH)", async () => {
    const t = await transportTry({ entryPatch: { validationContract: "MONO-11-v2" } }); assert(t.served === false && t.net === 1 && t.codes.join() === "EF03B_REUSE_CONTRACT_MISMATCH", JSON.stringify(t)); });

  await T("PB7-06", "same prompt + DIFFERENT seal => refus (EF03B_REUSE_SEAL_MISMATCH) ; appel EF-03B SANS sceau => refus (EF03B_REUSE_SEAL_REQUIRED) — le controle de sceau n'est plus conditionnel pour EF-03B", async () => {
    const t = await transportTry({ entryPatch: { sourceSealHash: sha("autre sceau") } }); assert(t.served === false && t.net === 1 && t.codes.join() === "EF03B_REUSE_SEAL_MISMATCH", JSON.stringify(t));
    const t2 = await transportTry({ llmOpts: { sealHash: undefined } }); assert(t2.served === false && t2.net === 1 && t2.codes.join() === "EF03B_REUSE_SEAL_REQUIRED", JSON.stringify(t2)); });

  await T("PB7-07", "entree legacy SANS targetId => refus NON_REUSABLE_FOR_EF03B_V3 (aucune deduction depuis le prompt)", async () => {
    const t = await transportTry({ entryDelete: ["targetId"] }); assert(t.served === false && t.net === 1 && t.codes.join() === "NON_REUSABLE_FOR_EF03B_V3", JSON.stringify(t)); });

  await T("PB7-08", "entree legacy SANS documentAuthoritySha256 => refus NON_REUSABLE_FOR_EF03B_V3 ; entree v1.0.15 (ni cible ni autorite) idem", async () => {
    const t = await transportTry({ entryDelete: ["documentAuthoritySha256"] }); assert(t.served === false && t.net === 1 && t.codes.join() === "NON_REUSABLE_FOR_EF03B_V3", JSON.stringify(t));
    const t2 = await transportTry({ entryDelete: ["targetId", "documentAuthoritySha256", "twinId", "reuseIdentity"] }); assert(t2.served === false && t2.codes.join() === "NON_REUSABLE_FOR_EF03B_V3", JSON.stringify(t2)); });

  await T("PB7-09", "registre refusant sur AUTORITE => le magasin generique ne contourne pas (adaptateur pilote directement avec le prompt de lot de A, carte canonique = B, exactement comme le cas T3b de l'audit) ; onValidation n'inscrit pas la reponse A sous B", async () => {
    const b = await base(); const dir = tmp(); fs.writeFileSync(path.join(dir, EF3.REGISTRY_FILE), b.run1.registry.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const llm = createLlm({ runDir: dir, runId: "pb7-09", storePath: copyStore(b.store), sealHash: SEAL.runtimeSealSha256 });
    const adapter = EF3.createReviewAdapter({ llm, runDir: dir, runId: "pb7-09", attemptId: 1, sealHash: SEAL.runtimeSealSha256, config: { maxTokens: 12288 }, twinsTotal: () => 1, targetDocuments: [DOC_B] });
    const tds = await F.M01.TDS.buildTargetDocumentSet("m-pb7", [{ targetId: "target-01", label: DOC_A.title, content: normA }]); const lotDocA = F.M01.TDS.getDocumentForTarget(tds, "target-01");
    const lotPromptA = F.M01.RR.buildReviewPrompt(TWIN, lotDocA, schemaFor("target-01")) + RE.enforcementPreamble(schemaFor("target-01"));
    const n0 = NET; const r = await withNet(() => reviewJson(CITE_A, " (recalcule)"), () => adapter.llmCall(lotPromptA, { purpose: "EF-03B review", pass: 1, strategy: "BASE", twinId: TWIN.twinId, targetId: "target-01" }));
    assert(r.reused !== true && NET - n0 === 1, "aucune reutilisation, recalcul reel");
    const st = adapter.stats(); assert(st.registryRefusedForeignAuthority === 1, "registre refuse l'autorite A");
    const ref = refusalsOf(dir); assert(ref.length === 1 && ref[0].code === "EF03B_REUSE_AUTHORITY_MISMATCH", "magasin refuse : " + JSON.stringify(ref.map((x) => x.code)));
    adapter.onValidation({ callId: r.callId, valid: true, errors: [], stage: "EF-03B-local" });
    const underB = adapter.registry.list().filter((e) => e.documentAuthoritySha256 === AUTH_B); assert(underB.length === 1 && underB[0].candidate !== b.candidateA, "la reponse A n'est jamais inscrite sous B"); });

  await T("PB7-10", "registre refusant sur CIBLE => le magasin generique ne contourne pas : entree de registre ET entree de magasin produites pour target-02 sous le meme prompt, cible courante target-01 => double refus, recalcul reel", async () => {
    const b = await base(); const s2 = path.join(tmp(), "store.jsonl"); fs.writeFileSync(s2, JSON.stringify(Object.assign({}, b.entry, { targetId: "target-02" })) + "\n");
    const regForeign = b.run1.registry.map((e) => Object.assign({}, e, { targetId: "target-02" }));
    const run = await withNet(() => reviewJson(CITE_A, " (recalcule)"), () => chain({ store: s2, registryEntries: regForeign, adapterDocs: [DOC_A], lotDocs: [DOC_A] }));
    assert(run.stats.registryRefusedForeignTarget === 1, "registre : cible etrangere refusee : " + JSON.stringify(run.stats));
    assert(run.storeReuses.length === 0 && run.refusals.length === 1 && run.refusals[0].code === "EF03B_REUSE_TARGET_MISMATCH" && run.net === 1, "magasin : refus de cible, 1 appel reel : " + JSON.stringify(run.refusals.map((x) => x.code)));
    assert(run.registry.filter((e) => e.targetId === "target-01").every((e) => e.candidate !== b.candidateA), "aucune reponse etrangere inscrite sous target-01"); });

  await T("PB7-11", "reuse EF-03B VALIDE reste fonctionnel : deux cibles distinctes (A, C) dans un run, puis reprise (nouvelle instance, nouveau run, meme magasin) => 0 appel, chaque revue servie sous SA cible et SON autorite, registre de la reprise lie a chaque cible", async () => {
    const store = path.join(tmp(), "store.jsonl"); const docs = [DOC_A, DOC_C];
    const textFor = (prompt) => (prompt.indexOf(CITE_C) !== -1 ? reviewJson(CITE_C) : reviewJson(CITE_A));
    const r1 = await withNet(textFor, () => chain({ store, adapterDocs: docs, lotDocs: docs, tids: ["target-01", "target-02"] }));
    assert(r1.net === 2 && r1.all.every((x) => x.review.reviewStatus === "complete"), "2 revues reelles acceptees");
    const es = ef03bEntries(store); assert(es.length === 2 && es.map((e) => e.targetId).sort().join() === "target-01,target-02" && new Set(es.map((e) => e.documentAuthoritySha256)).size === 2 && es.every((e) => e.validationStatus === "VALID"), "deux entrees, deux identites : " + JSON.stringify(es.map((e) => [e.targetId, e.documentAuthoritySha256.slice(0, 8)])));
    const r2 = await withNet(() => { throw new Error("AUCUN APPEL ATTENDU"); }, () => chain({ store, adapterDocs: docs, lotDocs: docs, tids: ["target-01", "target-02"] }));
    assert(r2.net === 0 && r2.storeReuses.length === 2 && r2.refusals.length === 0, "reprise : 2 revues servies a 0 appel");
    assert(r2.storeReuses.map((x) => x.targetId + ":" + x.documentAuthoritySha256).sort().join() === es.map((e) => e.targetId + ":" + e.documentAuthoritySha256).sort().join(), "reutilisations journalisees avec leur identite");
    assert(JSON.stringify(r2.all.map((x) => x.review.findings)) === JSON.stringify(r1.all.map((x) => x.review.findings)), "revues identiques");
    assert(r2.registry.length === 2 && r2.registry.every((e) => e.documentAuthoritySha256 === (e.targetId === "target-01" ? AUTH_A : sha(norm(DOC_C, 1)))), "registre de la reprise lie a chaque cible et a son autorite"); });

  await T("PB7-12", "reuse NON EF-03B : comportement historique inchange (REUSE_VALID sur prompt identique, entree sans champ d'identite EF-03B) ; une entree EF-03B n'est jamais servie a une autre finalite, ni une entree d'une autre finalite a EF-03B", async () => {
    const dir = tmp(); const store = path.join(dir, "store.jsonl"); const llm = createLlm({ runDir: dir, runId: "pb7-12", storePath: store, sealHash: SEAL.runtimeSealSha256 });
    await withNet(() => "reponse generique", async () => {
      const a = await llm.llmCall("prompt generique PB7", { purpose: "EF-02D2 relevance" }); llm.onValidation({ callId: a.callId, valid: true, errors: [], stage: "t" });
      const n0 = NET; const b2 = await llm.llmCall("prompt generique PB7", { purpose: "EF-02D2 relevance" }); assert(b2.reused === true && NET === n0, "reuse historique conserve");
      const e = lines(store)[0]; ["targetId", "documentAuthoritySha256", "twinId", "reuseIdentity"].forEach((k) => assert(!(k in e), "entree non EF-03B : pas de champ " + k));
      const n1 = NET; const c = await llm.llmCall("prompt generique PB7", { purpose: "EF-03B review", targetId: "target-01", documentAuthoritySha256: AUTH_A }); assert(c.reused !== true && NET === n1 + 1, "entree d'une autre finalite : jamais servie a EF-03B");
      assert(refusalsOf(dir).pop().code === "EF03B_REUSE_PURPOSE_MISMATCH", "motif journalise"); });
    const b = await base(); const d2 = tmp(); const s2 = path.join(d2, "store.jsonl"); fs.writeFileSync(s2, JSON.stringify(b.entry) + "\n"); const llm2 = createLlm({ runDir: d2, runId: "pb7-12b", storePath: s2, sealHash: SEAL.runtimeSealSha256 });
    const n2 = NET; const x = await withNet(() => "autre", () => llm2.llmCall(b.prompt, { purpose: "worker" })); assert(x.reused !== true && NET === n2 + 1 && refusalsOf(d2)[0].code === "EF03B_REUSE_IDENTITY_MISSING", "entree EF-03B jamais servie hors EF-03B"); });

  await T("PB7-13", "fixture reelle : les 20 entrees EF-03B du smoke phase B (efm-20260923-78fd8c4b, v1.0.15, TELLES QUELLES) sont toutes NON_REUSABLE_FOR_EF03B_V3 ; la variante qu'ecrirait v1.0.16 (identite mesuree) n'est reutilisable que sous SA cible et SON autorite (20 acceptees, 40 refus de cible, 20 refus d'autorite) — 0 fournisseur", () => {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "pb7-phaseB-ef03b-store-entries.json"), "utf8"));
    assert(fx.entries.length === 20 && fx.entries.every((x) => !("targetId" in x.entry) && !("documentAuthoritySha256" in x.entry)), "20 entrees historiques sans identite");
    const cur = (id) => ({ targetId: id.targetId, documentAuthoritySha256: id.documentAuthoritySha256, validationContract: fx.validationContract, sealHash: fx.runtimeSealSha256 });
    const ids = {}; fx.entries.forEach((x) => { ids[x.measuredIdentity.targetId] = x.measuredIdentity; }); assert(Object.keys(ids).length === 3, "3 cibles");
    let legacy = 0, ok = 0, tgt = 0, auth = 0;
    fx.entries.forEach((x) => {
      if (LLM.checkEf03bReuseIdentity(x.entry, cur(x.measuredIdentity)).code === "NON_REUSABLE_FOR_EF03B_V3") legacy++;
      const ctx = Object.assign({}, x.entry, x.measuredIdentity);
      if (LLM.checkEf03bReuseIdentity(ctx, cur(x.measuredIdentity)).ok) ok++;
      Object.keys(ids).filter((t) => t !== x.measuredIdentity.targetId).forEach((t) => { if (LLM.checkEf03bReuseIdentity(ctx, cur(ids[t])).code === "EF03B_REUSE_TARGET_MISMATCH") tgt++; });
      if (LLM.checkEf03bReuseIdentity(ctx, cur({ targetId: x.measuredIdentity.targetId, documentAuthoritySha256: sha("autorite prolongee " + x.measuredIdentity.documentAuthoritySha256) })).code === "EF03B_REUSE_AUTHORITY_MISMATCH") auth++;
    });
    assert(legacy === 20 && ok === 20 && tgt === 40 && auth === 20, JSON.stringify({ legacy, ok, tgt, auth })); });
};
