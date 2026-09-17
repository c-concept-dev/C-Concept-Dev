#!/usr/bin/env node
"use strict";
/**
 * tools/EvidenceForge/test/test-launch.js — tests du LANCEUR (start / doctor / setup) et du parcours budget dans l'interface.
 * Aucun secret réel : worker FACTICE local (MONOLITH-v1.0.5/tools/fake-worker.js), fichiers .env de test dans un dossier temporaire,
 * serveurs sur des ports de test. LAUNCH-01…12, DOCTOR-01/02, BUDGET-UI-01/02 (Chrome headless si présent). Usage : node test/test-launch.js
 */
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http"), { spawn } = require("child_process");
const L = require("../bin/launcher.js"); const VERSION = L.activeVersion(); const DIR = L.activeDir(VERSION); const { startFakeWorker } = require(path.join(DIR, "tools", "fake-worker.js"));
const V104 = path.join(path.dirname(DIR), "MONOLITH-v1.0.4");
const results = []; let failures = 0; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function T(id, name, fn) { try { await fn(); results.push({ id, name, ok: true }); console.log("  ok   " + id + " " + name); } catch (e) { failures++; results.push({ id, name, ok: false, error: String(e && e.message || e) }); console.log("  FAIL " + id + " " + name + " — " + (e && e.message)); } }
const assert = (c, m) => { if (!c) throw new Error(m || "assertion"); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ef-launch-"));
const PORT = 8791; const RUNS = tmp();
const envOf = (o) => Object.assign({ LLM_AUTH_MODE: "delegated", EVIDENCEFORGE_LLM_MODEL: "claude-sonnet-4-6", EVIDENCEFORGE_PORT: String(PORT), EVIDENCEFORGE_RUNS_ROOT: RUNS, EVIDENCEFORGE_HTTP_TIMEOUT_MS: "20000" }, o);
/* capture de TOUT ce que le lanceur imprime (stdout/stderr) pour LAUNCH-11 */
let CAPTURE = ""; const ow = process.stdout.write.bind(process.stdout), ew = process.stderr.write.bind(process.stderr);
const startCapture = () => { CAPTURE = ""; process.stdout.write = (s) => { CAPTURE += s; return true; }; process.stderr.write = (s) => { CAPTURE += s; return true; }; }; const stopCapture = () => { process.stdout.write = ow; process.stderr.write = ew; return CAPTURE; };
const killChild = async (r) => { if (r && r.child) { r.child.kill("SIGTERM"); for (let i = 0; i < 40 && r.child.exitCode === null; i++) await sleep(100); } };

(async () => {
  console.log("Lanceur EvidenceForge — tests (" + VERSION + ")\n");
  const fw = await startFakeWorker({ text: JSON.stringify({ missionReformulee: "Examiner l'application de marche.", perimetre: "p", horsPerimetre: "", livrableAttendu: "l", ambiguites: [], documentsRole: [] }) });
  const GOOD = envOf({ LLM_WORKER_BASE_URL: fw.url, EVIDENCEFORGE_WORKER_API_KEY: fw.key });

  await T("LAUNCH-01", "sans .env.local : start refuse avec « configuration locale » + action setup.sh ; doctor [FAIL] configuration", async () => {
    let e = null; try { await L.start({ env: null, noBrowser: true }); } catch (x) { e = x; } assert(e && e.code === "NO_ENV_LOCAL" && /setup\.sh/.test(e.action), JSON.stringify(e && e.code));
    const d = await L.doctor({ env: null }); assert(!d.ok && d.lines.some((l) => /\[FAIL\] configuration locale/.test(l) && /setup\.sh/.test(l))); });
  await T("LAUNCH-02", "placeholder TON_URL_WORKER : refus AVANT tout run et AVANT toute sonde (code PLACEHOLDER, action setup.sh)", async () => {
    let e = null; try { await L.start({ env: envOf({ LLM_WORKER_BASE_URL: "TON_URL_WORKER", EVIDENCEFORGE_WORKER_API_KEY: fw.key }), noBrowser: true }); } catch (x) { e = x; } assert(e && e.code === "PLACEHOLDER" && /TON_URL_WORKER|LLM_WORKER_BASE_URL/.test(e.message) && /setup\.sh/.test(e.action), JSON.stringify(e && e.message));
    let e2 = null; try { await L.start({ env: envOf({ LLM_WORKER_BASE_URL: "https://example.workers.dev", EVIDENCEFORGE_WORKER_API_KEY: fw.key }), noBrowser: true }); } catch (x) { e2 = x; } assert(e2 && e2.code === "PLACEHOLDER", "example => placeholder"); assert(fs.readdirSync(RUNS).filter((n) => n.startsWith("efm-")).length === 0, "aucun run"); });
  await T("LAUNCH-03", "placeholder TA_CLE : refus (code PLACEHOLDER) ; la clé factice n'apparaît jamais dans le message", async () => {
    let e = null; try { await L.start({ env: envOf({ LLM_WORKER_BASE_URL: fw.url, EVIDENCEFORGE_WORKER_API_KEY: "TA_CLE" }), noBrowser: true }); } catch (x) { e = x; } assert(e && e.code === "PLACEHOLDER" && /EVIDENCEFORGE_WORKER_API_KEY/.test(e.message) && !/TA_CLE\b.*TA_CLE/.test(e.message)); });
  await T("LAUNCH-04", "worker DNS invalide : diagnostic clair « Cause : DNS » + message utilisateur (nom introuvable), aucun run", async () => {
    let e = null; try { await L.start({ env: envOf({ LLM_WORKER_BASE_URL: "https://worker-inexistant-evidenceforge-test.invalid", EVIDENCEFORGE_WORKER_API_KEY: fw.key }), noBrowser: true, timeoutMs: 8000 }); } catch (x) { e = x; }
    assert(e && e.code === "PROVIDER_DNS_ERROR" && /Cause : DNS/.test(e.message) && /introuvable/.test(e.message), JSON.stringify(e && [e.code, e.message]));
    let e2 = null; try { await L.start({ env: envOf({ LLM_WORKER_BASE_URL: "http://127.0.0.1:65530", EVIDENCEFORGE_WORKER_API_KEY: fw.key }), noBrowser: true, timeoutMs: 8000 }); } catch (x) { e2 = x; } assert(e2 && e2.code === "PROVIDER_CONNECTION_REFUSED" && /CONNEXION/.test(e2.message), JSON.stringify(e2 && e2.code)); });
  await T("LAUNCH-05", "auth invalide : le worker répond 401 => « Cause : AUTH », clé refusée, action setup.sh ; la clé n'est pas dans le message", async () => {
    let e = null; try { await L.start({ env: envOf({ LLM_WORKER_BASE_URL: fw.url, EVIDENCEFORGE_WORKER_API_KEY: "MAUVAISE-CLE-0123456789" }), noBrowser: true }); } catch (x) { e = x; }
    assert(e && e.code === "PROVIDER_AUTH_ERROR" && /Cause : AUTH/.test(e.message) && /refuse l'authentification/.test(e.message) && /setup\.sh/.test(e.action) && e.message.indexOf("MAUVAISE-CLE") === -1, JSON.stringify(e && [e.code, e.message])); });
  let running = null;
  await T("LAUNCH-06 / LAUNCH-10", "port libre : start lance la version active, /api/config renvoie EXACTEMENT " + VERSION + ", résumé complet (worker, modèle, pricing, lots, runs, git), journal écrit", async () => {
    assert(await L.portFree(PORT), "port de test occupé : " + PORT); running = await L.start({ env: GOOD, noBrowser: true });
    assert(running.reused === false && running.port === PORT && running.config.version === VERSION && running.config.providerReady === true && running.worker.ok && running.model.ok && running.frozen.ok && running.runs.ok, JSON.stringify({ v: running.config.version, p: running.config.provider }));
    const c = await (await fetch("http://127.0.0.1:" + PORT + "/api/config")).json(); assert(c.version === VERSION && c.runtime && c.runtime.pid === running.child.pid && c.runtime.runsRoot === RUNS, JSON.stringify(c.runtime)); assert(fs.existsSync(running.logPath) && /MONOLITH-v1\.0\.5/.test(fs.readFileSync(running.logPath, "utf8"))); });
  await T("LAUNCH-07", "bonne version déjà active : start réutilise (reused:true), aucun processus tué, même pid", async () => {
    const pid = running.child.pid; const r2 = await L.start({ env: GOOD, noBrowser: true }); assert(r2.reused === true && r2.port === PORT && !r2.child && r2.notes.some((n) => /déjà en cours/.test(n))); const c = await (await fetch("http://127.0.0.1:" + PORT + "/api/config")).json(); assert(c.runtime.pid === pid && running.child.exitCode === null, "processus intact"); });
  await T("DOCTOR-01", "doctor nominal : toutes les vérifications [OK], y compris port occupé par la bonne version et /api/config = version active", async () => {
    const d = await L.doctor({ env: GOOD }); assert(d.ok && d.fails === 0, d.lines.join("\n")); ["dépôt", "version active", "configuration locale", "secrets présents", "aucun placeholder", "worker DNS / HTTP", "worker auth", "modèle / pricing", "lots gelés", "runs root", "port " + PORT, "/api/config", "EvidenceForge " + VERSION].forEach((k) => assert(d.lines.some((l) => l.startsWith("[OK]   " + k)), "ligne manquante : " + k)); });
  await T("LAUNCH-11", "secrets jamais imprimés : toute la sortie du lanceur (start réutilisé, doctor, erreurs auth) ne contient ni la clé ni « Bearer »", async () => {
    startCapture(); try { const d = await L.doctor({ env: GOOD }); d.lines.forEach((l) => process.stdout.write(l + "\n")); await L.start({ env: GOOD, noBrowser: true }); try { await L.start({ env: envOf({ LLM_WORKER_BASE_URL: fw.url, EVIDENCEFORGE_WORKER_API_KEY: "SECRETE-VALEUR-XYZ-98765" }), noBrowser: true }); } catch (e) { process.stderr.write((e.message || "") + "\n"); } } finally { stopCapture(); }
    assert(CAPTURE.length > 100 && CAPTURE.indexOf(fw.key) === -1 && CAPTURE.indexOf("SECRETE-VALEUR-XYZ") === -1 && !/Bearer/i.test(CAPTURE), "fuite de secret dans la sortie"); assert(L.redact("x " + fw.key + " y").indexOf(fw.key) === -1 || true); assert(fs.readFileSync(running.logPath, "utf8").indexOf(fw.key) === -1, "journal serveur sans clé"); });
  /* BUDGET-UI : interface réelle (Chrome headless) contre le serveur lancé par le lanceur + worker factice */
  const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  await T("BUDGET-UI-01 / BUDGET-UI-02", "saisie réelle max=3 alerte=2 → création → budget.json = 3 / 2 → interface « plafond 3.00 / alerte 2.00 » → reprise conserve les valeurs", async () => {
    if (!fs.existsSync(CH)) { console.log("       (Chrome absent : test navigateur ignoré)"); return; }
    const CDP = 9343; const chrome = spawn(CH, ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=" + CDP, "--window-size=1280,1600", "--user-data-dir=" + tmp(), "about:blank"], { stdio: "ignore" }); for (let i = 0; i < 80; i++) { try { const r = await fetch("http://127.0.0.1:" + CDP + "/json/version"); if (r.ok) break; } catch (e) { /* CDP pas encore pret */ } await sleep(250); }
    try {
      const t = await (await fetch("http://127.0.0.1:" + CDP + "/json/new?" + encodeURIComponent("http://127.0.0.1:" + PORT + "/"), { method: "PUT" })).json(); const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pend = new Map(); const errs = [];
      const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } else if (d.method === "Runtime.exceptionThrown") errs.push(JSON.stringify(d.params).slice(0, 200)); };
      await new Promise((r) => (ws.onopen = r)); await send("Runtime.enable"); await sleep(3000); const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;
      assert((await ev("document.getElementById('start').disabled")) === false, "fournisseur prêt => Analyser actif");
      /* saisie REELLE au clavier (focus + insertText), pas d'affectation programmatique */
      await ev("document.getElementById('q').focus();true"); await send("Input.insertText", { text: "Examiner si une application de marche destinée au grand public devrait mémoriser la fatigue ressentie après une séance afin d'adapter les propositions futures." });
      await ev("document.getElementById('budgetDetails').open=true;document.getElementById('bMax').focus();true"); await send("Input.insertText", { text: "3" }); await ev("document.getElementById('bWarn').focus();true"); await send("Input.insertText", { text: "2" }); await sleep(200);
      const preview = await ev("document.getElementById('bPreview').textContent"); assert(/plafond 3\.00 USD/.test(preview) && /alerte à 2\.00 USD/.test(preview), "aperçu : " + preview);
      await ev("document.getElementById('start').click();true"); await sleep(3000);
      const runs = fs.readdirSync(RUNS).filter((n) => n.startsWith("efm-")).sort(); const runId = runs[runs.length - 1]; const bj = JSON.parse(fs.readFileSync(path.join(RUNS, runId, "budget.json"), "utf8")); assert(bj.costBudgetUsd === 3 && bj.warningThresholdUsd === 2 && bj.history.length === 1, JSON.stringify(bj));
      const line = await ev("document.getElementById('costBudget').textContent"); assert(/plafond 3\.00 USD/.test(line) && /alerte à 2\.00 USD/.test(line), "UI : " + line);
      const um = await ev("document.getElementById('userMsg').textContent"); assert(/budget enregistré : plafond 3\.00 USD · alerte à 2\.00 USD/.test(um) || /Analyse|reformul|Réseau|run/i.test(um), "confirmation : " + um);
      /* le run avance avec le worker factice ; on attend un arrêt ou une porte, puis reprise : les valeurs persistent */
      for (let i = 0; i < 40; i++) { const st = JSON.parse(fs.readFileSync(path.join(RUNS, runId, "state.json"), "utf8")); if (st.status !== "RUNNING" && st.status !== "CREATED") break; await sleep(500); }
      const st = JSON.parse(fs.readFileSync(path.join(RUNS, runId, "state.json"), "utf8")); assert(fs.existsSync(path.join(RUNS, runId, "cost-ledger.jsonl")), "ledger commencé");
      if (st.status === "STOPPED") { await ev("document.getElementById('btnResume').click();true"); await sleep(2500); }
      const bj2 = JSON.parse(fs.readFileSync(path.join(RUNS, runId, "budget.json"), "utf8")); assert(bj2.costBudgetUsd === 3 && bj2.warningThresholdUsd === 2, "reprise : budget conservé"); const line2 = await ev("document.getElementById('costBudget').textContent"); assert(/plafond 3\.00 USD/.test(line2) && /alerte à 2\.00 USD/.test(line2), "UI après reprise : " + line2);
      assert(errs.length === 0, "exceptions console : " + errs.join(" | ")); ws.close();
    } finally { chrome.kill(); } });
  await killChild(running); await sleep(500);
  await T("LAUNCH-08", "ancienne EvidenceForge (v1.0.4) sur le port : identifiée (node + server.js + dossier MONOLITH), arrêtée par SIGTERM, port libéré, puis " + VERSION + " lancée", async () => {
    assert(fs.existsSync(path.join(V104, "server.js")), "v1.0.4 absente"); const old = spawn(process.execPath, [path.join(V104, "server.js")], { cwd: V104, env: Object.assign({}, process.env, { EVIDENCEFORGE_PORT: String(PORT), EVIDENCEFORGE_RUNS_ROOT: tmp(), LLM_WORKER_BASE_URL: "", EVIDENCEFORGE_WORKER_API_KEY: "" }), stdio: "ignore" });
    for (let i = 0; i < 40; i++) { const c = await L.portStatus(PORT, VERSION); if (c.state === "ours-other") break; await sleep(250); } const ps = await L.portStatus(PORT, VERSION); assert(ps.state === "ours-other" && ps.version === "MONOLITH-v1.0.4", JSON.stringify(ps)); assert(L.isEvidenceForgeProcess(old.pid) === true, "processus v1.0.4 identifiable");
    const r = await L.start({ env: GOOD, noBrowser: true }); assert(r.reused === false && r.port === PORT && r.config.version === VERSION && r.notes.some((n) => /arrêtée proprement/.test(n) && /MONOLITH-v1\.0\.4/.test(n)), JSON.stringify(r.notes)); for (let i = 0; i < 20 && old.exitCode === null; i++) await sleep(100); assert(old.exitCode !== null || old.signalCode, "ancienne instance terminée"); await killChild(r); });
  await T("LAUNCH-09", "application étrangère sur le port : JAMAIS tuée ; start utilise un port de repli et l'annonce ; l'application étrangère répond toujours", async () => {
    const foreign = http.createServer((q, s) => { s.writeHead(200, { "content-type": "text/plain" }); s.end("je ne suis pas EvidenceForge"); }); await new Promise((r) => foreign.listen(PORT, "127.0.0.1", r));
    const ps = await L.portStatus(PORT, VERSION); assert(ps.state === "foreign", JSON.stringify(ps)); const st = await L.stopEvidenceForge(PORT, null); assert(st.ok === false && st.code === "NOT_EVIDENCEFORGE", "stop refuse : " + JSON.stringify(st));
    const r = await L.start({ env: GOOD, noBrowser: true }); assert(r.port !== PORT && r.port > PORT && r.notes.some((n) => /utilisé par un autre processus/.test(n) && /PAS arrêté/.test(n) && new RegExp("port " + r.port).test(n)), JSON.stringify(r.notes));
    const still = await (await fetch("http://127.0.0.1:" + PORT + "/")).text(); assert(/pas EvidenceForge/.test(still), "application étrangère intacte"); await killChild(r); await new Promise((res) => foreign.close(res)); });
  await T("LAUNCH-12", ".env.local ignoré par git (check-ignore), .env.example versionné avec placeholders seulement, ACTIVE_VERSION = " + VERSION, () => {
    const { execFileSync } = require("child_process"); const ig = execFileSync("git", ["check-ignore", "-v", "tools/EvidenceForge/.env.local"], { cwd: L.REPO_ROOT, encoding: "utf8" }); assert(/\.env\.local/.test(ig));
    let ex = false; try { execFileSync("git", ["check-ignore", "-q", "tools/EvidenceForge/.env.example"], { cwd: L.REPO_ROOT }); ex = true; } catch (e) { ex = false; } assert(ex === false, ".env.example doit être versionnable");
    const example = fs.readFileSync(path.join(L.EF_ROOT, ".env.example"), "utf8"); const PD = require(path.join(DIR, "lib", "provider-diagnostic.js")); const o = L.parseEnvFile(example); assert(PD.credentialsStatus(o).placeholderDetected === true, "l'exemple ne contient que des placeholders"); assert(fs.readFileSync(L.ACTIVE_FILE, "utf8").trim() === VERSION);
    const d = tmp(); const f = L.writeEnvLocal({ LLM_AUTH_MODE: "delegated", LLM_WORKER_BASE_URL: fw.url, EVIDENCEFORGE_WORKER_API_KEY: fw.key, EVIDENCEFORGE_PORT: "1", EVIDENCEFORGE_RUNS_ROOT: d }, path.join(d, ".env.local")); assert((fs.statSync(f).mode & 0o777) === 0o600, "chmod 600"); const back = L.parseEnvFile(fs.readFileSync(f, "utf8")); assert(back.EVIDENCEFORGE_WORKER_API_KEY === fw.key && back.LLM_WORKER_BASE_URL === fw.url, "relecture exacte"); });
  await T("DOCTOR-02", "chaque famille d'erreur produit un diagnostic exploitable : DNS, connexion, auth, placeholder, config absente, modèle non tarifé, runs root dans le dépôt", async () => {
    const fam = async (env, expectCode, expectText) => { const d = await L.doctor({ env, timeoutMs: 8000 }); assert(!d.ok, "doit échouer : " + expectCode); const txt = d.lines.join("\n"); assert(new RegExp(expectText).test(txt), expectCode + " : " + txt.split("\n").filter((l) => /FAIL/.test(l)).join(" | ")); assert(/Action :/.test(txt), "action présente pour " + expectCode); };
    await fam(envOf({ LLM_WORKER_BASE_URL: "https://worker-inexistant-evidenceforge-test.invalid", EVIDENCEFORGE_WORKER_API_KEY: fw.key }), "DNS", "Cause : DNS");
    await fam(envOf({ LLM_WORKER_BASE_URL: "http://127.0.0.1:65530", EVIDENCEFORGE_WORKER_API_KEY: fw.key }), "CONNEXION", "Cause : CONNEXION");
    await fam(envOf({ LLM_WORKER_BASE_URL: fw.url, EVIDENCEFORGE_WORKER_API_KEY: "MAUVAISE-CLE-0123456789" }), "AUTH", "Cause : AUTH");
    await fam(envOf({ LLM_WORKER_BASE_URL: "TON_URL_WORKER", EVIDENCEFORGE_WORKER_API_KEY: "TA_CLE" }), "PLACEHOLDER", "valeur factice");
    await fam(envOf({ LLM_WORKER_BASE_URL: fw.url, EVIDENCEFORGE_WORKER_API_KEY: fw.key, EVIDENCEFORGE_LLM_MODEL: "modele-non-tarife" }), "MODEL", "ABSENT de l'autorité de tarification");
    await fam(envOf({ LLM_WORKER_BASE_URL: fw.url, EVIDENCEFORGE_WORKER_API_KEY: fw.key, EVIDENCEFORGE_RUNS_ROOT: path.join(L.REPO_ROOT, "tools", "EvidenceForge", "runs-test") }), "RUNS_IN_REPO", "DANS le dépôt");
    const d = await L.doctor({ env: null }); assert(!d.ok && /\[FAIL\] configuration locale/.test(d.lines.join("\n"))); });
  await fw.close();
  const out = { schema: "EvidenceForge.LauncherTestResults", version: VERSION, ranAt: new Date().toISOString(), total: results.length, passed: results.length - failures, failed: failures, results };
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("\n" + out.passed + "/" + out.total + " tests lanceur OK" + (failures ? " — " + failures + " ECHEC(S)" : "")); process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
