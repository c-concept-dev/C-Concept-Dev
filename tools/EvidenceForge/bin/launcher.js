#!/usr/bin/env node
"use strict";
/**
 * tools/EvidenceForge/bin/launcher.js — LANCEUR UNIQUE d'EvidenceForge depuis le dépôt (start / doctor / setup-write / stop / status).
 * Point d'entrée utilisateur : start.sh, setup.sh, doctor.sh (enveloppes minces). Toute la logique est ici, testable (test/test-launch.js).
 *
 *   - version ACTIVE = tools/EvidenceForge/ACTIVE_VERSION (une seule référence à changer pour passer à une v1.0.6) ;
 *   - configuration locale = tools/EvidenceForge/.env.local (gitignoré, chmod 600, lu au lancement, jamais affiché) ;
 *   - vérifications AVANT tout lancement : placeholders (TON_URL_WORKER / TA_CLE / example / changeme …), URL, runs root inscriptible,
 *     sonde GRATUITE du worker (DNS / HTTP / auth, aucun appel amont), modèle tarifé, lots gelés, port ;
 *   - port : même EvidenceForge même version => réutilisée (rien n'est tué) ; EvidenceForge d'une autre version => arrêt PROPRE
 *     (SIGTERM, processus identifié : node + server.js + dossier EvidenceForge) ; application étrangère => JAMAIS tuée, port de repli ;
 *   - /api/config vérifié : la version retournée doit être EXACTEMENT la version active ;
 *   - aucun secret n'est imprimé, journalisé ni écrit ailleurs que dans .env.local.
 */
const fs = require("fs"), path = require("path"), os = require("os"), net = require("net"), { spawn, spawnSync, execFileSync } = require("child_process");

const EF_ROOT = path.resolve(__dirname, "..");                 // tools/EvidenceForge
const REPO_ROOT = path.resolve(EF_ROOT, "..", "..");            // dépôt
const ACTIVE_FILE = path.join(EF_ROOT, "ACTIVE_VERSION");
const ENV_FILE = path.join(EF_ROOT, ".env.local");
const REQUIRED = ["LLM_AUTH_MODE", "LLM_WORKER_BASE_URL", "EVIDENCEFORGE_WORKER_API_KEY"];
const SECRET_KEYS = ["EVIDENCEFORGE_WORKER_API_KEY"];
const DEFAULT_PORT = 8768, DEFAULT_MODEL = "claude-sonnet-4-6";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- sortie sans secret : toute valeur secrète connue est masquée avant impression ---------- */
let SECRETS = []; const redact = (s) => { let t = String(s); SECRETS.forEach((v) => { if (v && v.length >= 6) t = t.split(v).join("<masqué>"); }); return t; };
const out = (s) => process.stdout.write(redact(s) + "\n"); const err = (s) => process.stderr.write(redact(s) + "\n");

/* ---------- version active ---------- */
function activeVersion() {
  if (!fs.existsSync(ACTIVE_FILE)) throw Object.assign(new Error("ACTIVE_VERSION absent : " + ACTIVE_FILE), { code: "ACTIVE_VERSION_MISSING" });
  const v = fs.readFileSync(ACTIVE_FILE, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))[0];
  if (!v || !/^MONOLITH-v[0-9][A-Za-z0-9.-]*$/.test(v)) throw Object.assign(new Error("ACTIVE_VERSION illisible : " + JSON.stringify(v)), { code: "ACTIVE_VERSION_INVALID" });
  return v;
}
function activeDir(version) {
  version = version || activeVersion(); const r6 = path.join(EF_ROOT, "r6"); const cands = [];
  (fs.existsSync(r6) ? fs.readdirSync(r6) : []).forEach((b) => { const d = path.join(r6, b, version); if (fs.existsSync(path.join(d, "server.js"))) cands.push(d); });
  if (!cands.length) throw Object.assign(new Error("dossier de la version active introuvable : " + version), { code: "ACTIVE_DIR_MISSING" });
  return cands[0];
}

/* ---------- .env.local ---------- */
function parseEnvFile(text) {
  const o = {}; String(text || "").split("\n").forEach((line) => { const l = line.trim(); if (!l || l.startsWith("#")) return; const m = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(l); if (!m) return; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); o[m[1]] = v; });
  return o;
}
function loadEnvLocal(file) { file = file || ENV_FILE; if (!fs.existsSync(file)) return null; const o = parseEnvFile(fs.readFileSync(file, "utf8")); SECRET_KEYS.forEach((k) => { if (o[k]) SECRETS.push(o[k]); }); return o; }
function writeEnvLocal(values, file) {
  file = file || ENV_FILE; const lines = ["# EvidenceForge — configuration LOCALE (gitignorée, jamais dans un zip ni un manifeste). Écrite par setup.sh le " + new Date().toISOString(), "# Ne partagez jamais ce fichier : il contient la clé du worker."];
  ["LLM_AUTH_MODE", "LLM_WORKER_BASE_URL", "EVIDENCEFORGE_WORKER_API_KEY", "EVIDENCEFORGE_LLM_MODEL", "EVIDENCEFORGE_PORT", "EVIDENCEFORGE_RUNS_ROOT", "EVIDENCEFORGE_HTTP_TIMEOUT_MS"].forEach((k) => { if (values[k] != null && values[k] !== "") lines.push(k + "=" + values[k]); });
  fs.writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 }); try { fs.chmodSync(file, 0o600); } catch (e) { /* plateformes sans chmod */ }
  return file;
}

/* ---------- vérifications (chacune : { ok, code, message, action? }) ---------- */
function loadActiveLibs(dir) { return { PD: require(path.join(dir, "lib", "provider-diagnostic.js")), pricing: require(path.join(dir, "lib", "pricing.js")), paths: () => require(path.join(dir, "lib", "paths.js")), config: JSON.parse(fs.readFileSync(path.join(dir, "config", "monolith.config.json"), "utf8")) }; }

function checkRepo() {
  const git = (args) => { try { return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) { return null; } };
  const sha = git(["rev-parse", "--short", "HEAD"]); if (!sha) return { ok: false, code: "NOT_A_GIT_REPO", message: "dépôt git introuvable : " + REPO_ROOT, action: "cd ~/Documents/GitHub/C-Concept-Dev" };
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]); const dirty = (git(["status", "--porcelain"]) || "").split("\n").filter(Boolean).length;
  let remote = "inconnu"; try { execFileSync("git", ["fetch", "-q", "origin", "main"], { cwd: REPO_ROOT, timeout: 8000, stdio: "ignore" }); const behind = Number(git(["rev-list", "--count", "HEAD..origin/main"]) || 0), ahead = Number(git(["rev-list", "--count", "origin/main..HEAD"]) || 0); remote = behind === 0 ? (ahead ? "à jour (+" + ahead + " commit(s) locaux non poussés)" : "à jour") : "en retard de " + behind + " commit(s)"; if (behind) remote += " → git pull --ff-only"; } catch (e) { remote = "inconnu (hors ligne ?)"; }
  return { ok: true, code: "OK", sha, branch, dirty, remote, message: "git " + sha + " (" + branch + ") · GitHub main : " + remote + (dirty ? " · " + dirty + " modification(s) locale(s) conservée(s)" : ""), action: /en retard/.test(remote) ? "git pull --ff-only" : null };
}
function checkConfig(env) {
  if (!env) return { ok: false, code: "NO_ENV_LOCAL", message: "aucune configuration locale (" + path.relative(REPO_ROOT, ENV_FILE) + ")", action: "./tools/EvidenceForge/setup.sh" };
  const missing = REQUIRED.filter((k) => !env[k]); if (missing.length) return { ok: false, code: "ENV_INCOMPLETE", message: "variables manquantes : " + missing.join(", "), action: "./tools/EvidenceForge/setup.sh" };
  if (env.LLM_AUTH_MODE !== "delegated") return { ok: false, code: "AUTH_MODE_INVALID", message: "LLM_AUTH_MODE doit valoir delegated", action: "./tools/EvidenceForge/setup.sh" };
  return { ok: true, code: "OK", message: "configuration locale chargée (" + Object.keys(env).length + " variables)" };
}
function checkPlaceholders(env, PD) { const cs = PD.credentialsStatus(env); if (cs.placeholderDetected) return { ok: false, code: "PLACEHOLDER", message: "valeur factice détectée : " + cs.placeholders.join(", ") + " (ex. TON_URL_WORKER / TA_CLE)", action: "./tools/EvidenceForge/setup.sh" }; if (!cs.urlValid) return { ok: false, code: "URL_INVALID", message: "LLM_WORKER_BASE_URL n'est pas une URL valide", action: "./tools/EvidenceForge/setup.sh" }; return { ok: true, code: "OK", message: "aucun placeholder · clé présente (" + cs.keyLength + " caractères) · worker " + cs.host }; }
async function checkWorker(env, PD, timeoutMs) { const d = await PD.probeWorker({ env, timeoutMs: timeoutMs || 15000 }); const cause = { PROVIDER_DNS_ERROR: "DNS", PROVIDER_CONNECTION_REFUSED: "CONNEXION", PROVIDER_TLS_ERROR: "TLS", PROVIDER_TIMEOUT: "TIMEOUT", PROVIDER_AUTH_ERROR: "AUTH", PROVIDER_ROUTE_NOT_FOUND: "ROUTE", NETWORK_UNAVAILABLE: "RÉSEAU", PROVIDER_CAPACITY: "CAPACITÉ", PROVIDER_RATE_LIMITED: "DÉBIT" }[d.code] || d.code;
  return { ok: d.ready === true, code: d.code, reachable: d.reachable, authOk: d.authOk, httpStatus: d.httpStatus, ms: d.ms, message: d.ready ? "joignable, clé acceptée (sonde gratuite, " + d.ms + " ms)" : "Worker inaccessible — Cause : " + cause + " — " + d.userMessage, action: d.ready ? null : (d.code === "PROVIDER_TIMEOUT" || d.code === "NETWORK_UNAVAILABLE" ? "vérifier la connexion réseau puis réessayer" : "./tools/EvidenceForge/setup.sh") }; }
function checkModel(env, libs) { const model = env.EVIDENCEFORGE_LLM_MODEL || libs.config.llm.model; let pr; try { pr = libs.pricing.createPricing({ file: path.join(activeDir(), "config", "llm-pricing.json") }); } catch (e) { return { ok: false, code: "PRICING_INVALID", message: "autorité de tarification illisible : " + e.message, model }; }
  const entry = pr.resolve(model); return { ok: !!entry, code: entry ? "OK" : "MODEL_NOT_PRICED", model, pricingVersion: pr.version, message: entry ? model + " tarifé (tarification " + pr.version + ")" : model + " ABSENT de l'autorité de tarification " + pr.version + " : un budget refuserait tout appel", action: entry ? null : "choisir un modèle tarifé dans config/llm-pricing.json (setup.sh)" }; }
function checkFrozen(libs) { try { const r = libs.paths().verifyFrozenLots(); const lots = Object.keys(r); return { ok: lots.every((k) => r[k].verified), code: "OK", message: lots.map((k) => k + " (" + r[k].files + ")").join(", ") + " vérifiés" }; } catch (e) { return { ok: false, code: e.code || "FROZEN_LOT_ALTERED", message: String(e.message).slice(0, 200), action: "git status / git checkout -- tools/EvidenceForge (les lots gelés ont été altérés localement)" }; } }
function checkRunsRoot(env) { const root = env.EVIDENCEFORGE_RUNS_ROOT ? path.resolve(env.EVIDENCEFORGE_RUNS_ROOT.replace(/^~/, os.homedir())) : null; if (!root) return { ok: false, code: "RUNS_ROOT_MISSING", message: "EVIDENCEFORGE_RUNS_ROOT absent", action: "./tools/EvidenceForge/setup.sh" };
  try { fs.mkdirSync(root, { recursive: true }); const t = path.join(root, ".ef-write-test-" + process.pid); fs.writeFileSync(t, "ok"); fs.unlinkSync(t); } catch (e) { return { ok: false, code: "RUNS_ROOT_NOT_WRITABLE", message: root + " non inscriptible (" + e.code + ")", action: "choisir un autre dossier de runs (setup.sh)" }; }
  if (root.startsWith(REPO_ROOT + path.sep)) return { ok: false, code: "RUNS_ROOT_IN_REPO", message: root + " est DANS le dépôt : les runs seraient versionnés", action: "choisir un dossier hors dépôt (setup.sh)" };
  const n = fs.readdirSync(root).filter((x) => x.startsWith("efm-")).length; return { ok: true, code: "OK", root, message: root + " (" + n + " run(s))" }; }

/* ---------- port ---------- */
async function apiConfig(port, timeoutMs) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs || 2500); try { const r = await fetch("http://127.0.0.1:" + port + "/api/config", { signal: ac.signal }); if (!r.ok) return { status: "foreign", httpStatus: r.status }; const j = await r.json(); return (j && j.product === "EvidenceForge" && j.version) ? { status: "evidenceforge", config: j } : { status: "foreign", httpStatus: r.status }; } catch (e) { return null; } finally { clearTimeout(t); } }
function portFree(port) { return new Promise((resolve) => { const s = net.createServer(); s.once("error", () => resolve(false)); s.listen(port, "127.0.0.1", () => s.close(() => resolve(true))); }); }
async function portStatus(port, version) { if (await portFree(port)) return { state: "free", port }; const c = await apiConfig(port); if (!c) return { state: "foreign", port, detail: "occupé, ne répond pas en HTTP" }; if (c.status === "foreign") return { state: "foreign", port, detail: "occupé par une autre application (HTTP " + c.httpStatus + ")" }; return { state: c.config.version === version ? "ours-same" : "ours-other", port, version: c.config.version, pid: c.config.runtime && c.config.runtime.pid || null, model: c.config.model }; }
function listeningPids(port) { try { return execFileSync("lsof", ["-nP", "-t", "-iTCP:" + port, "-sTCP:LISTEN"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean).map(Number); } catch (e) { return []; } }
function isEvidenceForgeProcess(pid) { try { const cmd = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim(); const cwd = (execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").find((l) => l.startsWith("n")) || "").slice(1); return /node/.test(cmd) && /server\.js/.test(cmd) && (/EvidenceForge|MONOLITH/.test(cwd) || /EvidenceForge|MONOLITH/.test(cmd)); } catch (e) { return false; } }
async function stopEvidenceForge(port, pidHint) {
  const pids = (pidHint ? [pidHint] : []).concat(listeningPids(port)).filter((v, i, a) => a.indexOf(v) === i); const stopped = [];
  for (const pid of pids) { if (!isEvidenceForgeProcess(pid)) return { ok: false, code: "NOT_EVIDENCEFORGE", message: "le processus " + pid + " sur le port " + port + " n'est pas identifiable comme EvidenceForge : il n'est PAS arrêté" }; try { process.kill(pid, "SIGTERM"); stopped.push(pid); } catch (e) { /* déjà parti */ } }
  for (let i = 0; i < 40; i++) { if (await portFree(port)) return { ok: true, code: "OK", stopped, message: "ancienne EvidenceForge arrêtée proprement (pid " + stopped.join(", ") + "), port " + port + " libéré" }; await sleep(250); }
  return { ok: false, code: "PORT_STILL_BUSY", message: "le port " + port + " n'a pas été libéré après SIGTERM (pid " + stopped.join(", ") + ")" };
}
/** Autres instances EvidenceForge sur les ports voisins (information : l'utilisateur n'a pas a connaitre les PID). */
async function otherInstances(port, version) { const found = []; for (let p = 8765; p <= 8775; p++) { if (p === port) continue; if (await portFree(p)) continue; const c = await apiConfig(p, 800); if (c && c.status === "evidenceforge") found.push({ port: p, version: c.config.version, pid: c.config.runtime && c.config.runtime.pid || null, model: c.config.model }); } return found; }
async function pickFallbackPort(from) { for (let p = from + 1; p < from + 30; p++) if (await portFree(p)) return p; return null; }

/* ---------- serveur ---------- */
function openBrowser(url) { try { if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref(); else if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref(); else spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref(); } catch (e) { /* ouverture manuelle */ } }
function startServer(dir, env, port, opts) {
  opts = opts || {}; const child = spawn(process.execPath, [path.join(dir, "server.js")], { cwd: dir, env: Object.assign({}, process.env, env, { EVIDENCEFORGE_PORT: String(port) }), stdio: ["ignore", "pipe", "pipe"] });
  const logPath = opts.logPath || null; const logFd = logPath ? fs.openSync(logPath, "a") : null; const onData = (d) => { const t = redact(String(d)); if (logFd) fs.writeSync(logFd, t); if (opts.echo) process.stdout.write(t); };
  child.stdout.on("data", onData); child.stderr.on("data", onData); return child;
}
async function waitForServer(port, version, child, timeoutMs) { const t0 = Date.now(); while (Date.now() - t0 < (timeoutMs || 30000)) { if (child && child.exitCode !== null) return { ok: false, code: "SERVER_EXITED", message: "le serveur s'est arrêté au démarrage (code " + child.exitCode + ") — voir le journal" }; const c = await apiConfig(port, 1500); if (c && c.status === "evidenceforge") { if (c.config.version !== version) return { ok: false, code: "VERSION_MISMATCH", message: "/api/config renvoie " + c.config.version + " au lieu de " + version, config: c.config }; return { ok: true, code: "OK", config: c.config }; } await sleep(300); } return { ok: false, code: "SERVER_TIMEOUT", message: "le serveur ne répond pas sur /api/config après " + Math.round((timeoutMs || 30000) / 1000) + " s" }; }

/* ---------- commandes ---------- */
async function doctor(opts) {
  opts = opts || {}; const lines = []; let fails = 0; const row = (label, r) => { lines.push((r.ok ? "[OK]   " : "[FAIL] ") + label + " : " + r.message + (r.ok || !r.action ? "" : "\n       Action : " + r.action)); if (!r.ok) fails++; return r; };
  let version, dir, libs; try { version = activeVersion(); dir = activeDir(version); libs = loadActiveLibs(dir); row("dépôt", checkRepo()); row("version active", { ok: true, message: version + " (" + path.relative(REPO_ROOT, dir) + ")" }); } catch (e) { row("version active", { ok: false, message: e.message, action: "vérifier tools/EvidenceForge/ACTIVE_VERSION" }); return { ok: false, lines, fails }; }
  const env = opts.env !== undefined ? opts.env : loadEnvLocal(opts.envFile); const cfg = row("configuration locale", checkConfig(env)); if (!cfg.ok) return { ok: false, lines, fails, version };
  row("secrets présents", { ok: true, message: "clé présente (" + (env.EVIDENCEFORGE_WORKER_API_KEY || "").length + " caractères, jamais affichée)" });
  const ph = row("aucun placeholder", checkPlaceholders(env, libs.PD)); const port = Number(env.EVIDENCEFORGE_PORT || DEFAULT_PORT);
  const worker = ph.ok ? await checkWorker(env, libs.PD, opts.timeoutMs) : { ok: false, code: "SKIPPED", message: "non testé (placeholder)", action: "./tools/EvidenceForge/setup.sh" };
  row("worker DNS / HTTP", worker.ok || worker.reachable ? { ok: true, message: worker.reachable ? "joignable" + (worker.httpStatus ? " (HTTP " + worker.httpStatus + ")" : "") : "" } : worker); row("worker auth", worker.ok ? { ok: true, message: "clé acceptée (sonde gratuite, aucun appel amont)" } : (worker.reachable ? worker : { ok: false, code: "SKIPPED", message: "non testable (worker injoignable)", action: worker.action }));
  const model = row("modèle / pricing", checkModel(env, libs)); row("lots gelés", checkFrozen(libs)); row("runs root", checkRunsRoot(env));
  const ps = await portStatus(port, version); row("port " + port, ps.state === "free" ? { ok: true, message: "libre" } : ps.state === "ours-same" ? { ok: true, message: "EvidenceForge " + version + " déjà en cours (pid " + (ps.pid || "?") + ")" } : ps.state === "ours-other" ? { ok: true, message: "occupé par EvidenceForge " + ps.version + " (sera arrêtée proprement par start.sh)" } : { ok: true, message: "occupé par une autre application — start.sh utilisera un port de repli" });
  const others = await otherInstances(port, version); if (others.length) lines.push("[INFO] autres instances EvidenceForge : " + others.map((o) => "port " + o.port + " (" + o.version + (o.pid ? ", pid " + o.pid : "") + ")").join(", ") + " — ./tools/EvidenceForge/stop.sh <port> pour arrêter une instance");
  if (ps.state === "ours-same" || ps.state === "ours-other") row("/api/config", { ok: ps.state === "ours-same", message: "version " + ps.version + (ps.state === "ours-same" ? " = version active" : " ≠ " + version), action: ps.state === "ours-same" ? null : "./tools/EvidenceForge/start.sh" });
  row("EvidenceForge " + version, { ok: fails === 0, message: fails === 0 ? "prête à démarrer" : fails + " vérification(s) en échec", action: fails === 0 ? null : "corriger les points [FAIL] ci-dessus" });
  return { ok: fails === 0, lines, fails, version, worker, model };
}

async function start(opts) {
  opts = opts || {}; const version = activeVersion(), dir = activeDir(version), libs = loadActiveLibs(dir);
  const env = opts.env !== undefined ? opts.env : loadEnvLocal(opts.envFile);
  const stop = (r) => { const e = new Error(r.message); e.code = r.code; e.action = r.action; throw e; };
  const cfg = checkConfig(env); if (!cfg.ok) stop(cfg); const ph = checkPlaceholders(env, libs.PD); if (!ph.ok) stop(ph);
  const runs = checkRunsRoot(env); if (!runs.ok) stop(runs); const worker = await checkWorker(env, libs.PD, opts.timeoutMs); if (!worker.ok) stop(worker);
  const model = checkModel(env, libs); if (!model.ok) stop(model); const frozen = checkFrozen(libs); if (!frozen.ok) stop(frozen);
  let port = Number(env.EVIDENCEFORGE_PORT || DEFAULT_PORT); const ps = await portStatus(port, version); const notes = [];
  if (ps.state === "ours-same") { const url = "http://localhost:" + port; if (!opts.noBrowser) openBrowser(url); return { reused: true, port, url, version, config: (await apiConfig(port)).config, notes: ["EvidenceForge " + version + " est déjà en cours (pid " + (ps.pid || "?") + ") : réutilisée, rien n'a été arrêté."] }; }
  if (ps.state === "ours-other") { const st = await stopEvidenceForge(port, ps.pid); if (!st.ok) stop(st); notes.push(st.message + " (" + ps.version + " → " + version + ")"); }
  if (ps.state === "foreign") { const fb = await pickFallbackPort(port); if (!fb) stop({ code: "NO_PORT", message: "aucun port libre entre " + port + " et " + (port + 30) }); notes.push("Port " + port + " utilisé par un autre processus (" + ps.detail + ") : il n'est PAS arrêté. Utilisation temporaire du port " + fb + "."); port = fb; }
  const repo = checkRepo(); const gitSha = repo.ok ? repo.sha : null; const logPath = path.join(runs.root, "server-" + version + ".log");
  const child = startServer(dir, Object.assign({}, env, { EVIDENCEFORGE_GIT_SHA: gitSha || "" }), port, { logPath, echo: opts.echo });
  const w = await waitForServer(port, version, child, opts.timeoutMs ? opts.timeoutMs * 2 : 30000); if (!w.ok) { try { child.kill("SIGTERM"); } catch (e) { /* */ } stop(w); }
  const url = "http://localhost:" + port; if (!opts.noBrowser) openBrowser(url);
  return { reused: false, child, port, url, version, gitSha, repo, worker, model, frozen, runs, logPath, config: w.config, notes };
}

async function setupWrite(values, opts) {
  opts = opts || {}; const version = activeVersion(), dir = activeDir(version), libs = loadActiveLibs(dir);
  const env = { LLM_AUTH_MODE: "delegated", LLM_WORKER_BASE_URL: String(values.LLM_WORKER_BASE_URL || "").trim(), EVIDENCEFORGE_WORKER_API_KEY: String(values.EVIDENCEFORGE_WORKER_API_KEY || "").trim(), EVIDENCEFORGE_LLM_MODEL: String(values.EVIDENCEFORGE_LLM_MODEL || DEFAULT_MODEL).trim(), EVIDENCEFORGE_PORT: String(values.EVIDENCEFORGE_PORT || DEFAULT_PORT).trim(), EVIDENCEFORGE_RUNS_ROOT: String(values.EVIDENCEFORGE_RUNS_ROOT || "").trim(), EVIDENCEFORGE_HTTP_TIMEOUT_MS: String(values.EVIDENCEFORGE_HTTP_TIMEOUT_MS || 180000) };
  if (env.EVIDENCEFORGE_WORKER_API_KEY) SECRETS.push(env.EVIDENCEFORGE_WORKER_API_KEY);
  const stop = (r) => { const e = new Error(r.message); e.code = r.code; e.action = r.action; throw e; };
  const cfg = checkConfig(env); if (!cfg.ok) stop(cfg); const ph = checkPlaceholders(env, libs.PD); if (!ph.ok) stop(ph); if (!/^\d+$/.test(env.EVIDENCEFORGE_PORT)) stop({ code: "PORT_INVALID", message: "port invalide : " + env.EVIDENCEFORGE_PORT });
  const runs = checkRunsRoot(env); if (!runs.ok) stop(runs); const model = checkModel(env, libs); if (!model.ok) stop(model);
  const worker = await checkWorker(env, libs.PD, opts.timeoutMs); if (!worker.ok && !opts.allowUnreachable) stop(worker);
  const file = writeEnvLocal(env, opts.envFile); return { file, worker, model, runs, port: env.EVIDENCEFORGE_PORT, host: libs.PD.credentialsStatus(env).host };
}

/* ---------- CLI ---------- */
async function main() {
  const cmd = process.argv[2] || "start"; const flags = new Set(process.argv.slice(3));
  try {
    if (cmd === "doctor") { const r = await doctor(); r.lines.forEach(out); out(""); out(r.ok ? "Diagnostic : tout est en ordre. Lancez ./tools/EvidenceForge/start.sh" : "Diagnostic : " + r.fails + " problème(s). Suivez les actions indiquées."); process.exit(r.ok ? 0 : 1); }
    if (cmd === "setup-write") {
      const v = { LLM_WORKER_BASE_URL: process.env.EF_SETUP_URL, EVIDENCEFORGE_WORKER_API_KEY: process.env.EF_SETUP_KEY, EVIDENCEFORGE_LLM_MODEL: process.env.EF_SETUP_MODEL, EVIDENCEFORGE_PORT: process.env.EF_SETUP_PORT, EVIDENCEFORGE_RUNS_ROOT: process.env.EF_SETUP_RUNS };
      const r = await setupWrite(v, { allowUnreachable: flags.has("--allow-unreachable") });
      out("Configuration écrite : " + path.relative(REPO_ROOT, r.file) + " (chmod 600, gitignoré)"); out("  Worker : " + (r.worker.ok ? "joignable" : "NON joignable — " + r.worker.message)); out("  Clé : présente"); out("  Modèle : " + r.model.model + " (tarifé, " + r.model.pricingVersion + ")"); out("  Runs : accessible (" + r.runs.root + ")"); out("  Port : " + r.port); process.exit(0);
    }
    if (cmd === "status") { const version = activeVersion(); const env = loadEnvLocal() || {}; const ps = await portStatus(Number(env.EVIDENCEFORGE_PORT || DEFAULT_PORT), version); out(JSON.stringify(ps)); process.exit(0); }
    if (cmd === "stop") { const version = activeVersion(); const env = loadEnvLocal() || {}; const port = Number(process.argv[3] || env.EVIDENCEFORGE_PORT || DEFAULT_PORT); const ps = await portStatus(port, version); if (ps.state === "free") { out("Aucune EvidenceForge sur le port " + port + "."); process.exit(0); } if (ps.state === "foreign") { out("Port " + port + " occupé par une autre application : rien n'est arrêté."); process.exit(1); } const st = await stopEvidenceForge(port, ps.pid); out(st.message); process.exit(st.ok ? 0 : 1); }
    if (cmd === "start") {
      const r = await start({ noBrowser: flags.has("--no-browser"), echo: flags.has("--verbose") });
      out(""); out("EvidenceForge"); out("Version : " + r.version + (r.reused ? " (déjà en cours, réutilisée)" : "")); if (!r.reused) { out("Git : " + (r.gitSha || "?") + (r.repo && r.repo.remote ? " · GitHub main : " + r.repo.remote : "")); out("Worker : OK (" + r.worker.ms + " ms, sonde gratuite)"); out("Model : " + r.model.model); out("Pricing : OK (" + r.model.pricingVersion + ")"); out("Frozen lots : OK"); out("Runs : " + r.runs.root); }
      out("Server : " + r.url); r.notes.forEach((n) => out("Note : " + n)); if (r.repo && r.repo.action) out("Note : dépôt en retard — exécutez : " + r.repo.action);
      if (r.reused) process.exit(0);
      out("Journal : " + r.logPath); out("Arrêter : Ctrl+C"); const child = r.child; const bye = () => { try { child.kill("SIGTERM"); } catch (e) { /* */ } }; process.on("SIGINT", bye); process.on("SIGTERM", bye); child.on("exit", (code) => { out("EvidenceForge arrêtée" + (code ? " (code " + code + ")" : ".")); process.exit(code || 0); }); return;
    }
    err("commande inconnue : " + cmd + " (start | doctor | setup-write | status | stop)"); process.exit(2);
  } catch (e) { err(""); err("EvidenceForge ne démarre pas : " + (e.message || e)); if (e.action) err("Action : " + e.action); if (e.code) err("Code : " + e.code); process.exit(1); }
}
if (require.main === module) main();
module.exports = { otherInstances, activeVersion, activeDir, parseEnvFile, loadEnvLocal, writeEnvLocal, checkRepo, checkConfig, checkPlaceholders, checkWorker, checkModel, checkFrozen, checkRunsRoot, portStatus, portFree, stopEvidenceForge, isEvidenceForgeProcess, pickFallbackPort, startServer, waitForServer, doctor, start, setupWrite, redact, EF_ROOT, REPO_ROOT, ENV_FILE, ACTIVE_FILE, DEFAULT_PORT, DEFAULT_MODEL };
