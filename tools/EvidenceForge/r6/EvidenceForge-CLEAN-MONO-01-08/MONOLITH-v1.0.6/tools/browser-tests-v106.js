#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0.6 — tools/browser-tests-v106.js : tests NAVIGATEUR reels (Chrome headless via CDP) de l'AUTO-CHUNK UPLOAD dans
 * l'interface : selection d'un long document => « N segments generes automatiquement » + « document complet » + compte « 1 document » ;
 * un court + un long => « 2 documents » (jamais le nombre de segments) ; un fichier vide => « document vide — non exploitable » ;
 * aucune exception console. Serveur v1.0.6 demarre SANS identifiants fournisseur (aucun appel reel possible) ; aucun run cree.
 * Usage : node tools/browser-tests-v106.js [port]
 */
const { spawn } = require("child_process"); const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.resolve(__dirname, ".."); const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PORT = Number(process.argv[2] || 8770); const BASE = "http://127.0.0.1:" + PORT; const CDP = 9342;
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond, info: info || "" }); console.log((cond ? "  ok   " : "  FAIL ") + name + (info && !cond ? " — " + info : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  if (!fs.existsSync(CH)) { console.log("Chrome absent : tests navigateur ignores"); process.exit(0); }
  const RR = fs.mkdtempSync(path.join(os.tmpdir(), "efm-ui106-")); const FIX = path.join(ROOT, "fixtures", "real-documents");
  const longDoc = fs.readdirSync(FIX).filter((f) => /CDC-v4/.test(f)).map((f) => path.join(FIX, f))[0]; const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), "efm-ui106-files-"));
  const shortDoc = path.join(tmpd, "court.txt"); fs.writeFileSync(shortDoc, "Un document court de test pour l'interface."); const emptyDoc = path.join(tmpd, "vide.txt"); fs.writeFileSync(emptyDoc, "   \n");
  const expectedChunks = require("../lib/document-chunker.js").chunkDocumentText(fs.readFileSync(longDoc, "utf8")).totalChunks; const longChars = fs.readFileSync(longDoc, "utf8").length;
  const env = Object.assign({}, process.env, { EVIDENCEFORGE_PORT: String(PORT), EVIDENCEFORGE_RUNS_ROOT: RR }); delete env.EVIDENCEFORGE_WORKER_API_KEY; delete env.LLM_WORKER_BASE_URL;
  const srv = spawn(process.execPath, [path.join(ROOT, "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] }); let srvOut = ""; srv.stdout.on("data", (d) => { srvOut += d; }); srv.stderr.on("data", (d) => { srvOut += d; });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + "/api/config"); if (r.ok) break; } catch (e) { /* pas encore */ } await sleep(250); }
  const cfg = await (await fetch(BASE + "/api/config")).json(); ok("serveur v1.0.6 : /api/config version = config + chunking expose", cfg.version === require("../config/monolith.config.json").product.version && cfg.documents && cfg.documents.chunking && cfg.documents.chunking.maxChunkChars === 4500, JSON.stringify(cfg.documents));
  const chrome = spawn(CH, ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=" + CDP, "--window-size=1280,1600", "--user-data-dir=" + fs.mkdtempSync(path.join(os.tmpdir(), "cdp106-")), "about:blank"], { stdio: "ignore" }); for (let i = 0; i < 80; i++) { try { const r = await fetch("http://127.0.0.1:" + CDP + "/json/version"); if (r.ok) break; } catch (e) { /* attente */ } await sleep(250); }
  async function page(url) {
    const t = await (await fetch("http://127.0.0.1:" + CDP + "/json/new?" + encodeURIComponent(url), { method: "PUT" })).json(); const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pending = new Map(); const consoleErrors = [];
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } else if (d.method === "Runtime.exceptionThrown") consoleErrors.push(JSON.stringify(d.params.exceptionDetails && (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text)).slice(0, 300)); };
    await new Promise((r) => (ws.onopen = r)); await send("Runtime.enable"); await send("DOM.enable"); await sleep(3000);
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
    const setFiles = async (files) => { const doc = await send("DOM.getDocument", { depth: 1 }); const q = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#files" }); await send("DOM.setFileInputFiles", { nodeId: q.nodeId, files }); /* Chrome emet lui-meme l'evenement change */ for (let i = 0; i < 40; i++) { await sleep(250); const t = await ev("document.getElementById('fileList').textContent"); if (t && !/Analyse des documents/.test(t)) break; } return ev("document.getElementById('fileList').textContent"); };
    return { ev, setFiles, consoleErrors, close: () => { ws.close(); fetch("http://127.0.0.1:" + CDP + "/json/close/" + t.id).catch(() => {}); } };
  }
  try {
    const p = await page(BASE + "/");
    /* 1 — un long document : N segments, document complet, 1 document */
    let txt = await p.setFiles([longDoc]);
    ok("long document : « " + expectedChunks + " segments générés automatiquement » affiche", new RegExp(expectedChunks + " segments générés automatiquement").test(txt), txt);
    ok("long document : nombre de caracteres affiche (" + longChars + ") et « document complet »", txt.indexOf(longChars.toLocaleString("fr-FR")) !== -1 && /document complet/.test(txt), txt);
    ok("long document : compte « 1 document » (pas " + expectedChunks + " documents), segments lus integralement", /(^|\D)1 document\b/.test(txt) && !/\b" + expectedChunks + " documents/.test(txt) && /lus intégralement/.test(txt), txt);
    ok("long document : une seule ligne de document (pas de liste de sous-fichiers)", (await p.ev("document.querySelectorAll('#fileList .docrow').length")) === 1);
    /* 2 — un court + un long : 2 documents */
    txt = await p.setFiles([shortDoc, longDoc]);
    ok("court + long : « 2 documents » et « 1 segment » pour le court", /(^|\D)2 documents\b/.test(txt) && /court\.txt · \d+ caractères → 1 segment/.test(txt), txt);
    ok("court + long : 2 lignes de document, statuts COMPLETE", (await p.ev("Array.from(document.querySelectorAll('#fileList .docrow')).map(d=>d.dataset.docStatus).join(',')")) === "COMPLETE,COMPLETE");
    /* 3 — fichier vide : liste, non exploitable, non compte */
    txt = await p.setFiles([emptyDoc, shortDoc]);
    ok("fichier vide : « document vide — non exploitable », compte « 1 document »", /document vide — non exploitable/.test(txt) && /(^|\D)1 document\b/.test(txt), txt);
    ok("fichier vide : ligne marquee DOCUMENT_EMPTY", (await p.ev("Array.from(document.querySelectorAll('#fileList .docrow')).map(d=>d.dataset.docStatus).join(',')")).indexOf("DOCUMENT_EMPTY") !== -1);
    /* 4 — apercu = aucun run cree, aucun appel */
    const runs = await (await fetch(BASE + "/api/runs")).json(); ok("apercu : aucun run cree, aucun dossier _preflight", runs.runs.length === 0 && !fs.existsSync(path.join(RR, "_preflight")), JSON.stringify(runs));
    ok("aucune exception console", p.consoleErrors.length === 0, p.consoleErrors.join(" | ")); p.close();
  } finally { chrome.kill(); srv.kill(); }
  const failed = results.filter((r) => !r.ok).length; console.log("\n" + (results.length - failed) + "/" + results.length + " tests navigateur v1.0.6 OK");
  fs.writeFileSync(path.join(ROOT, "test", "browser-results-v106.json"), JSON.stringify({ schema: "EvidenceForge.MonolithBrowserTestResults", version: "MONOLITH-v1.0.6", ranAt: new Date().toISOString(), total: results.length, passed: results.length - failed, failed, results }, null, 2) + "\n");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
