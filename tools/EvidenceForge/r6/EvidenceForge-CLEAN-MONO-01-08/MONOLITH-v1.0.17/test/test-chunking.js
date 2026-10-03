#!/usr/bin/env node
"use strict";
/**
 * EvidenceForge MONOLITH v1.0.6 — test/test-chunking.js : AUTO-CHUNK UPLOAD.
 * T-CHUNK-01..16 (fonction pure lib/document-chunker.js + intake + prompt de cadrage + persistance par run) et T-CHUNK-REAL-* (fixture
 * reelle : documents de gouvernance complets du projet pilote, fixtures/real-documents/ ; l'analyse descriptive des cas est lue depuis un dossier
 * LOCAL hors depot si present — les fiches de cas ne sont jamais utilisees).
 * Aucun reseau, aucun fournisseur, aucun LLM : le cadrage n'est exerce qu'au niveau du PROMPT construit (texte), jamais appele.
 */
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const results = []; let failures = 0;
async function T(id, name, fn) { try { await fn(); results.push({ id, name, ok: true }); console.log("  ok   " + id + " " + name); } catch (e) { failures++; results.push({ id, name, ok: false, error: String(e && e.message || e) }); console.log("  FAIL " + id + " " + name + " — " + (e && e.message || e)); } }
const assert = (c, m) => { if (!c) throw new Error(m || "assertion"); };
const sha = (s) => crypto.createHash("sha256").update(Buffer.from(String(s), "utf8")).digest("hex");
const RUNS_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "efm-chunk-")); process.env.EVIDENCEFORGE_RUNS_ROOT = RUNS_TMP;
const P = require("../lib/paths.js"); const DC = require("../lib/document-chunker.js"); const SM = require("../lib/stage-mission.js"); const PL = require("../lib/pipeline.js"); const RS = require("../lib/run-store.js"); const PA = require("../lib/preflight-assistant.js");
const MAX = DC.MAX_CHUNK_CHARS;
const wellFormed = (s) => Buffer.from(s, "utf8").toString("utf8") === s;
const check = (text, opts) => { const r = DC.chunkDocumentText(text, opts); assert(DC.reconstructText(r.chunks) === text, "reconstitution"); assert(r.chunks.every((c) => c.text.length <= (opts && opts.maxChunkChars || MAX)), "un chunk depasse la limite"); assert(r.chunks.every((c, i) => c.sequence === i + 1 && c.totalChunks === r.totalChunks), "sequence"); assert(r.chunks.every((c, i) => c.startChar === (i ? r.chunks[i - 1].endChar : 0) && c.endChar - c.startChar === c.text.length), "bornes contigues"); return r; };
const para = (n, seed) => Array.from({ length: n }, (_, i) => "Paragraphe " + (seed || "") + i + " : " + "lorem ipsum dolor sit amet, consectetur. ".repeat(18)).join("\n\n");
const FIX = path.join(ROOT, "fixtures", "real-documents");   /* donnees (hors perimetre du scanner anti-hardcoding, qui couvre le code/config/tests) */
const EXTERNAL = path.join(os.homedir(), "evidenceforge-work", "reports", "real-documents-external");

(async () => {
  console.log("MONOLITH v1.0.6 — tests AUTO-CHUNK UPLOAD (MAX_CHUNK_CHARS = " + MAX + ")");
  assert(P.CONFIG.documents.chunking.maxChunkChars === 4500, "config maxChunkChars = 4500");

  await T("T-CHUNK-01", "texte de 1000 caracteres -> 1 chunk", () => { const r = check("a".repeat(1000)); assert(r.totalChunks === 1 && r.chunks[0].text.length === 1000); });
  await T("T-CHUNK-02", "texte de 4500 caracteres exacts -> 1 chunk (aucun decoupage artificiel)", () => { const r = check("b".repeat(4500)); assert(r.totalChunks === 1 && r.chunks[0].text.length === 4500); });
  await T("T-CHUNK-03", "texte de 4501 caracteres -> >= 2 chunks, aucun > 4500", () => { const r = check("c".repeat(4501)); assert(r.totalChunks >= 2 && r.chunks.every((c) => c.text.length <= 4500) && r.chunks[0].text.length === 4500 && r.chunks[1].text.length === 1); });
  await T("T-CHUNK-04", "long document a paragraphes -> coupe sur double saut de ligne en priorite (chaque chunk hors dernier se termine par \\n\\n)", () => {
    const t = para(60); const r = check(t); assert(r.totalChunks >= 5, "plusieurs chunks"); r.chunks.slice(0, -1).forEach((c) => { assert(c.splitLevel === "paragraph" && c.text.endsWith("\n\n"), "chunk " + c.sequence + " coupe " + c.splitLevel); }); });
  await T("T-CHUNK-05", "aucun separateur avant 4500 -> repli correct (coupe brute a 4500, reconstitution exacte)", () => {
    const t = "d".repeat(12000); const r = check(t); assert(r.totalChunks === 3 && r.chunks[0].text.length === 4500 && r.chunks[0].splitLevel === "hard" && r.chunks[2].text.length === 3000);
    const t2 = "mot ".repeat(3000).trim(); const r2 = check(t2); assert(r2.chunks[0].splitLevel === "space" && r2.chunks[0].text.endsWith(" "), "espace en repli avant coupe brute");
    const t3 = ("Phrase numero un. ").repeat(700); const r3 = check(t3); assert(r3.chunks[0].splitLevel === "sentence" && /\. $/.test(r3.chunks[0].text), "fin de phrase avant espace"); });
  await T("T-CHUNK-06", "accents, apostrophes typographiques, tirets longs, emoji, multioctets -> contenu recompose identique, aucun substitut coupe, chunks bien formes", () => {
    const samples = ["é’—😀".repeat(3000), "abcde😀".repeat(2000), "日本語のテキスト、多バイト。".repeat(800), "L’été — « ça » va ! ".repeat(600), "á̈".repeat(3000)];
    samples.forEach((t) => { const r = check(t); assert(r.chunks.every((c) => wellFormed(c.text) && !/[\uD800-\uDBFF]$/.test(c.text) && !/^[\uDC00-\uDFFF]/.test(c.text)), "chunk bien forme (aucune paire de substitution coupee)"); }); });
  await T("T-CHUNK-07", "concat(chunks) === source sur 5 textes varies (y compris CRLF et lignes vides conservees)", () => {
    ["x", para(30), "ligne1\r\nligne2\r\n\r\n\r\nligne3".repeat(500), "  espaces  \n\n\n  et tabulations\t\t".repeat(400), "z".repeat(4500 * 7 + 1)].forEach((t) => { const r = check(t); assert(DC.reconstructText(r.chunks) === t); }); });
  await T("T-CHUNK-08", "aucun caractere duplique : somme des longueurs === longueur source et bornes strictement contigues", () => {
    const t = para(120); const r = check(t); assert(r.chunks.reduce((n, c) => n + c.text.length, 0) === t.length); assert(r.chunks[r.chunks.length - 1].endChar === t.length); });
  await T("T-CHUNK-09", "sequence complete : commence a 1, finit a totalChunks, sans trou ni doublon, ordre strict", () => {
    const r = check(para(200)); const seqs = r.chunks.map((c) => c.sequence); assert(seqs[0] === 1 && seqs[seqs.length - 1] === r.totalChunks && new Set(seqs).size === seqs.length && seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1)); });
  await T("T-CHUNK-10", "hash source stable : deux decoupages du meme texte donnent le meme sourceTextSha256 et les memes bornes ; sourceSha256 (octets) inchange par le decoupage", () => {
    const t = para(50); const a = DC.chunkDocumentText(t), b = DC.chunkDocumentText(t); assert(a.sourceTextSha256 === b.sourceTextSha256 && JSON.stringify(a.chunks.map((c) => [c.startChar, c.endChar])) === JSON.stringify(b.chunks.map((c) => [c.startChar, c.endChar])));
    const bytes = Buffer.from(t, "utf8"); const before = sha(bytes); const d = DC.buildChunkedDocument({ documentId: "doc-x", name: "x.md", sha256: before, bytes: bytes.length, content: t }); assert(d.sourceSha256 === before && sha(Buffer.from(DC.reconstructText(d.chunks), "utf8")) === before); });
  await T("T-CHUNK-11", "hash chunk stable et verifiable : chunkSha256 === sha256(text) pour chaque chunk, identique entre deux executions", () => {
    const t = para(40); const a = DC.chunkDocumentText(t), b = DC.chunkDocumentText(t); a.chunks.forEach((c, i) => { assert(c.chunkSha256 === sha(c.text) && c.chunkSha256 === b.chunks[i].chunkSha256); }); });
  await T("T-CHUNK-12", "chunk manquant -> INPUT_DOCUMENT_CHUNK_MISSING (nombre annonce != present) ; trou de sequence / bornes -> DOCUMENT_INCOMPLETE ; texte altere -> INPUT_DOCUMENT_TRUNCATED", () => {
    const t = para(30); const d = DC.buildChunkedDocument({ documentId: "doc-m", name: "m.md", content: t }); assert(DC.verifyChunkedDocument(d, t).ok);
    const missing = JSON.parse(JSON.stringify(d)); missing.chunks.splice(1, 1); assert(DC.verifyChunkedDocument(missing).status === DC.STATUS.CHUNK_MISSING);
    const gap = JSON.parse(JSON.stringify(d)); gap.chunks[1].sequence = 99; assert(DC.verifyChunkedDocument(gap).status === DC.STATUS.INCOMPLETE);
    const dup = JSON.parse(JSON.stringify(d)); dup.chunks[1] = JSON.parse(JSON.stringify(dup.chunks[0])); assert(DC.verifyChunkedDocument(dup).status === DC.STATUS.INCOMPLETE);
    const trunc = JSON.parse(JSON.stringify(d)); trunc.chunks[0].text = trunc.chunks[0].text.slice(0, -10); const v = DC.verifyChunkedDocument(trunc, t); assert(!v.ok && v.status === DC.STATUS.TRUNCATED, JSON.stringify(v));
    const wrongTotal = JSON.parse(JSON.stringify(d)); wrongTotal.totalChunks = d.totalChunks + 1; assert(DC.verifyChunkedDocument(wrongTotal).status === DC.STATUS.CHUNK_MISSING); });
  await T("T-CHUNK-13", "document vide (0 octet, espaces seuls, BOM seul) -> DOCUMENT_EMPTY : refuse explicitement, jamais un faux chunk vide, jamais presente comme exploitable", () => {
    assert(DC.chunkDocumentText("").totalChunks === 0 && DC.chunkDocumentText("").status === DC.STATUS.EMPTY);
    const e = DC.buildChunkedDocument({ documentId: "e", name: "e.txt", content: "  \n\t\n" }); assert(e.ingestionStatus === DC.STATUS.EMPTY && e.totalChunks === 0 && e.chunks.length === 0 && e.complete === false);
    const r = SM.intakeDocuments([{ name: "a.txt", bytes: Buffer.alloc(0) }, { name: "b.md", bytes: Buffer.from("   \n") }, { name: "c.md", bytes: Buffer.from("﻿") }, { name: "ok.md", bytes: Buffer.from("Un contenu.") }]);
    assert(r.documents.length === 1 && r.rejected.length === 3 && r.rejected.every((x) => x.code === "DOCUMENT_EMPTY"), JSON.stringify(r.rejected));
    assert(DC.renderForPrompt([e]).text.indexOf("VIDE") !== -1 && DC.renderForPrompt([e]).chunkCount === 0, "rendu : vide, sans segment"); });
  await T("T-CHUNK-14", "document de 30 000+ caracteres -> tous les chunks <= 4500, reconstitution exacte ; 300 000 caracteres traites en < 1 s", () => {
    const t = para(60); assert(t.length > 30000); check(t); const big = para(520); assert(big.length > 300000); const t0 = Date.now(); check(big); assert(Date.now() - t0 < 1000, "performance"); });
  await T("T-CHUNK-15", "deux documents longs -> provenance non melangee : chunkId prefixe par sourceDocumentId, hashes de texte disjoints, rendu par document", () => {
    const r = SM.intakeDocuments([{ name: "un.md", bytes: Buffer.from(para(40, "A")) }, { name: "deux.md", bytes: Buffer.from(para(40, "B")) }]);
    assert(r.documents.length === 2); const [a, b] = r.documents; assert(a.chunked.chunks.every((c) => c.sourceDocumentId === a.documentId && c.chunkId.indexOf(a.documentId + "-part-") === 0)); assert(b.chunked.chunks.every((c) => c.sourceDocumentId === b.documentId));
    const ha = new Set(a.chunked.chunks.map((c) => c.chunkSha256)); assert(b.chunked.chunks.every((c) => !ha.has(c.chunkSha256)), "aucun chunk partage");
    const p = SM.REFORMULATION_PROMPT("Examiner ces deux documents de test.", r.documents); assert((p.match(/### DOCUMENT SOURCE : /g) || []).length === 2 && p.indexOf("[un.md — PART-01-OF-") !== -1 && p.indexOf("[deux.md — PART-01-OF-") !== -1); });
  await T("T-CHUNK-16", "un document court + un long -> compte documents = 2 (pas le nombre total de chunks) : intake, prompt, run cree, documents-chunks.json, apercu", async () => {
    const files = [{ name: "court.txt", bytes: Buffer.from("Un court document de test.") }, { name: "long.md", bytes: Buffer.from(para(80)) }];
    const r = SM.intakeDocuments(files); assert(r.documents.length === 2 && r.documents[0].chunking.totalChunks === 1 && r.documents[1].chunking.totalChunks > 3);
    const p = SM.REFORMULATION_PROMPT("Examiner ces documents de test s.v.p.", r.documents); assert(/DOCUMENTS FOURNIS : 2 document\(s\) source/.test(p) && (p.match(/### DOCUMENT SOURCE : /g) || []).length === 2 && !/TRONQUE a \d|suite non montree/i.test(p) && /\(2 au total, jamais par segment\)/.test(p), "prompt");
    const run = await PL.startRun({ question: "Examiner ces documents de test s.v.p.", files, budget: { mode: "LIMITED", costBudgetUsd: 5 } }); assert(run.documents.length === 2 && run.documents[1].chunking.totalChunks > 3, "run.documents");
    const store = RS.createRunStore(run.runId); const meta = store.loadJson("documents-chunks.json"); assert(meta && meta.documentCount === 2 && meta.chunkCount === 1 + run.documents[1].chunking.totalChunks && meta.documents.every((d) => d.chunks.every((c) => c.text === undefined)), "metadonnees sans texte, comptes distincts");
    const loaded = PL._loadDocuments(store, store.read()); assert(loaded.length === 2 && loaded[1].chunked.totalChunks === meta.documents[1].totalChunks, "rechargement verifie");
    /* alteration des metadonnees enregistrees : un segment retire => INPUT_DOCUMENT_CHUNK_MISSING ; un hash de segment altere => INPUT_DOCUMENT_TRUNCATED (erreurs, jamais des avertissements) */
    const m2 = JSON.parse(JSON.stringify(meta)); m2.documents[1].chunks.pop(); m2.documents[1].totalChunks -= 1; store.saveJson("documents-chunks.json", m2); let code = null; try { PL._loadDocuments(store, store.read()); } catch (e) { code = e.code; } assert(code === "INPUT_DOCUMENT_CHUNK_MISSING", "code " + code);
    const m3 = JSON.parse(JSON.stringify(meta)); m3.documents[1].chunks[0].chunkSha256 = sha("autre"); store.saveJson("documents-chunks.json", m3); code = null; try { PL._loadDocuments(store, store.read()); } catch (e) { code = e.code; } assert(code === "INPUT_DOCUMENT_TRUNCATED", "code " + code);
    store.saveJson("documents-chunks.json", meta); assert(PL._loadDocuments(store, store.read()).length === 2, "retabli");
    /* apercu (meme intake que le serveur) : 2 documents, N segments */
    const pv = SM.intakeDocuments(files); assert(pv.documents.length === 2 && pv.documents.reduce((n, d) => n + d.chunking.totalChunks, 0) === meta.chunkCount); });

  /* ——— fixture reelle (documents de gouvernance complets ; analyse descriptive des cas hors depot ; fiches de cas jamais utilisees) ——— */
  const fixtures = fs.readdirSync(FIX).filter((f) => /\.md$/.test(f)).sort().map((f) => ({ name: f, bytes: fs.readFileSync(path.join(FIX, f)) }));
  const ext = fs.existsSync(EXTERNAL) ? fs.readdirSync(EXTERNAL).filter((f) => /analyse-descriptive/.test(f) && /\.md$/.test(f)).map((f) => ({ name: f, bytes: fs.readFileSync(path.join(EXTERNAL, f)) })) : [];
  const real = fixtures.concat(ext);
  console.log("  fixture reelle : " + fixtures.map((f) => f.name).join(", ") + (ext.length ? " + analyse descriptive des cas (dossier local hors depot)" : " — analyse descriptive des cas ABSENTE (dossier local hors depot introuvable : " + EXTERNAL + ")"));
  await T("T-CHUNK-REAL-01", "chaque document reel est complet : totalChunks coherent, reconstitution byte-identique, sourceSha256 inchange, aucun chunk > 4500", () => {
    assert(fixtures.length >= 3, "au moins trois documents de gouvernance"); const r = SM.intakeDocuments(real); assert(r.rejected.length === 0 && r.documents.length === real.length, JSON.stringify(r.rejected));
    r.documents.forEach((d) => { const v = DC.verifyChunkedDocument(d.chunked, d.content); assert(v.ok && v.status === "COMPLETE", d.name + " " + JSON.stringify(v)); assert(d.chunked.chunks.every((c) => c.text.length <= 4500), d.name + " chunk > 4500"); assert(DC.reconstructText(d.chunked.chunks) === d.content && sha(Buffer.from(DC.reconstructText(d.chunked.chunks), "utf8")) === d.sha256, d.name + " reconstitution"); assert(d.chunked.totalChunks >= 4, d.name + " attendu >= 4 segments (" + d.chunked.totalChunks + ")"); }); });
  await T("T-CHUNK-REAL-02", "ordre exact : sequences 1..n, bornes contigues, coupes majoritairement sur paragraphes (documents markdown)", () => {
    const r = SM.intakeDocuments(real); r.documents.forEach((d) => { const cs = d.chunked.chunks; cs.forEach((c, i) => { assert(c.sequence === i + 1 && c.startChar === (i ? cs[i - 1].endChar : 0), d.name + " ordre"); }); const paragraphCuts = cs.slice(0, -1).filter((c) => c.splitLevel === "paragraph").length; assert(paragraphCuts >= Math.floor((cs.length - 1) * 0.8), d.name + " coupes paragraphe " + paragraphCuts + "/" + (cs.length - 1)); }); });
  await T("T-CHUNK-REAL-03", "le cadrage voit N documents source (N = fichiers uploades, pas 25+ segments), tous les segments PART-k-OF-n, aucune alerte « tronque »", () => {
    const r = SM.intakeDocuments(real); const p = SM.REFORMULATION_PROMPT("Réaliser une revue documentaire de structure à partir des documents fournis.", r.documents);
    const heads = (p.match(/### DOCUMENT SOURCE : /g) || []).length; assert(heads === real.length, "documents source annonces : " + heads + " != " + real.length); assert(new RegExp("DOCUMENTS FOURNIS : " + real.length + " document\\(s\\) source").test(p));
    const totalChunks = r.documents.reduce((n, d) => n + d.chunking.totalChunks, 0); assert(totalChunks > real.length * 3, "segments " + totalChunks); assert((p.match(/ — PART-\d+-OF-\d+ — /g) || []).length === totalChunks, "chaque segment etiquete");
    r.documents.forEach((d) => { assert(p.indexOf("[" + d.name + " — " + DC.partLabel(1, d.chunking.totalChunks) + " — ") !== -1 && p.indexOf("[" + d.name + " — " + DC.partLabel(d.chunking.totalChunks, d.chunking.totalChunks) + " — ") !== -1, d.name + " premier/dernier segment"); assert(p.indexOf(d.content) !== -1 || d.chunked.chunks.every((c) => p.indexOf(c.text) !== -1), d.name + " contenu integral present"); });
    assert(!/TRONQUE a \d|tronqu[ée] a \d+ caract|suite non montree/i.test(p), "aucune alerte tronque"); assert((p.match(/ — COMPLET \(DOCUMENT_CHUNKED_COMPLETE\)/g) || []).length === real.length && !/ — INCOMPLET \(/.test(p), "statut COMPLET par document");
    const pp = PA.PROMPT ? PA.PROMPT("Question de test suffisante.", r.documents) : null; if (pp) assert(!/TRONQUE\b|suite non montree/.test(pp) && (pp.match(/### DOCUMENT SOURCE : /g) || []).length === real.length, "preflight sans troncature"); });
  await T("T-CHUNK-REAL-04", "run cree avec la fixture reelle : state.mission.documents = N documents (chunking resume), documents-chunks.json coherent, rechargement verifie sans erreur", async () => {
    const run = await PL.startRun({ question: "Réaliser une revue documentaire de structure à partir des documents fournis.", files: real, budget: { mode: "LIMITED", costBudgetUsd: 5 } });
    assert(run.documents.length === real.length && run.documents.every((d) => d.chunking.ingestionStatus === "COMPLETE" && d.chunking.totalChunks >= 4)); const store = RS.createRunStore(run.runId); const meta = store.loadJson("documents-chunks.json"); assert(meta.documentCount === real.length && meta.documents.every((d) => d.chunks.length === d.totalChunks));
    const loaded = PL._loadDocuments(store, store.read()); assert(loaded.length === real.length && loaded.every((d) => DC.verifyChunkedDocument(d.chunked, d.content).ok)); });
  await T("T-CHUNK-REAL-05", "les fiches de cas ne sont ni dans les fixtures du depot ni utilisees comme regles : aucune valeur de cas dans le chunker, l'intake, le serveur ni l'interface", () => {
    const names = fs.readdirSync(FIX).join(" "); assert(!/sentinelle|cas-/i.test(names) && names.indexOf("S0" + "1") === -1 && names.indexOf("S0" + "2") === -1, "aucune fiche de cas en fixture");
    /* jetons assembles par fragments : ce fichier ne doit pas se declencher lui-meme */
    const tokens = ["S0" + "1", "S0" + "2", "20 m" + "in", "45 m" + "in", "5 k" + "m", "4 ét" + "ages", "ostéo" + "por", "frac" + "ture", "chev" + "ille", "car" + "dio"];
    ["lib/document-chunker.js", "lib/stage-mission.js", "lib/preflight-assistant.js", "server.js", "index.html"].forEach((f) => { const s = fs.readFileSync(path.join(ROOT, f), "utf8").toLowerCase(); tokens.forEach((t) => { assert(s.indexOf(t.toLowerCase()) === -1, f + " contient le jeton de cas « " + t + " »"); }); }); });

  const out = { schema: "EvidenceForge.MonolithChunkingTestResults", version: P.CONFIG.product.version, ranAt: new Date().toISOString(), maxChunkChars: MAX, fixtureExternalCaseAnalysis: ext.length > 0, total: results.length, passed: results.length - failures, failed: failures, results };
  fs.writeFileSync(path.join(ROOT, "test", "results-chunking.json"), JSON.stringify(out, null, 2) + "\n");
  console.log((failures ? "ECHEC " : "OK ") + (results.length - failures) + "/" + results.length + " — test/results-chunking.json");
  process.exit(failures ? 1 : 0);
})();
