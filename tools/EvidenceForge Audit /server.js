#!/usr/bin/env node
"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — server.js
 * Serveur LOCAL (127.0.0.1 uniquement) : interface index.html + API JSON + flux d'evenements (SSE).
 * Demarrage fail-closed : integrite des lots geles verifiee avant d'ecouter. Aucun secret n'est lu ailleurs que dans
 * l'environnement du processus, jamais renvoye a l'interface (seule la PRESENCE est indiquee).
 *   node server.js            -> http://127.0.0.1:8765
 */
const http = require("http"), fs = require("fs"), path = require("path"), url = require("url");
const P = require("./lib/paths.js");
const RS = require("./lib/run-store.js");
const PL = require("./lib/pipeline.js");

const INTEGRITY = P.verifyFrozenLots();   // leve FROZEN_LOT_ALTERED : le produit ne demarre pas sur un lot altere
const INTERRUPTED = RS.markInterruptedRuns();   // runs laisses RUNNING par un arret : STOPPED reprenables (jamais un faux "en cours")
const HOST = P.CONFIG.server.host || "127.0.0.1", PORT = Number(process.env.EVIDENCEFORGE_PORT || P.CONFIG.server.port || 8765);
const INDEX = path.join(P.ROOT, "index.html");
const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((resolve, reject) => { const c = []; let n = 0; req.on("data", (d) => { n += d.length; if (n > 64 * 1024 * 1024) { reject(Object.assign(new Error("PAYLOAD_TOO_LARGE"), { code: "PAYLOAD_TOO_LARGE" })); req.destroy(); } c.push(d); }); req.on("end", () => { try { resolve(c.length ? JSON.parse(Buffer.concat(c).toString("utf8")) : {}); } catch (e) { reject(Object.assign(new Error("BAD_JSON"), { code: "BAD_JSON" })); } }); req.on("error", reject); });
const errOut = (res, e) => send(res, e.code === "RUN_NOT_FOUND" ? 404 : (["GATE_NOT_OPEN", "HUMAN_IDENTITY_REQUIRED", "MISSION_INVALID", "BAD_JSON", "DOCUMENTS_REJECTED", "REPORT_IMPORT_INVALID"].indexOf(e.code) !== -1) ? 400 : 500, { error: e.code || "ERROR", message: e.userMessage || e.message, details: e.details || null });
const safeName = (n) => /^[A-Za-z0-9_.-]+\.json$/.test(n) && n.indexOf("..") === -1;

function publicConfig() {
  return { product: P.CONFIG.product.name, version: P.CONFIG.product.version, model: process.env.EVIDENCEFORGE_LLM_MODEL || P.CONFIG.llm.model, providerConfigured: !!(process.env.LLM_WORKER_BASE_URL && process.env.EVIDENCEFORGE_WORKER_API_KEY),
    frozenLots: Object.keys(INTEGRITY).map((k) => ({ lot: k, files: INTEGRITY[k].files, verified: INTEGRITY[k].verified, canonicalZipSha256: INTEGRITY[k].canonicalZipSha256 || null })), documents: P.CONFIG.documents, stages: RS.STAGES.map((s) => ({ id: s, label: RS.STAGE_LABELS[s] })) };
}

const server = http.createServer(async function (req, res) {
  const u = url.parse(req.url, true); const p = u.pathname; const m = req.method;
  try {
    if (m === "GET" && (p === "/" || p === "/index.html")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(fs.readFileSync(INDEX)); }
    if (m === "GET" && p === "/api/config") return send(res, 200, publicConfig());
    if (m === "GET" && p === "/api/runs") return send(res, 200, { runs: RS.listRuns() });
    if (m === "POST" && p === "/api/runs") { const b = await readBody(req); const files = (b.files || []).map((f) => ({ name: f.name, bytes: Buffer.from(String(f.contentBase64 || ""), "base64") })); const r = await PL.startRun({ question: b.question, files, acknowledgeRejected: b.acknowledgeRejected === true }); PL.advance(r.runId); return send(res, 201, r); }
    if (m === "POST" && p === "/api/reports/import") { const b = await readBody(req); return send(res, 201, PL.importReport(b.report || b)); }
    const mr = /^\/api\/runs\/([A-Za-z0-9-]+)(?:\/([A-Za-z0-9_.-]+))?(?:\/([A-Za-z0-9_.-]+))?$/.exec(p);
    if (mr) {
      const runId = mr[1], action = mr[2] || null, arg = mr[3] || null; const store = RS.createRunStore(runId); const state = store.read();
      if (!state) return send(res, 404, { error: "RUN_NOT_FOUND", message: "Run inconnu." });
      if (m === "GET" && !action) return send(res, 200, store.publicState(state));
      if (m === "GET" && action === "events") {
        res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
        const w = (o) => res.write("data: " + JSON.stringify(o) + "\n\n");
        w({ type: "state", state: store.publicState(state) }); store.events().slice(-200).forEach((e) => w({ type: "event", event: e }));
        const un = store.subscribe(w); const ka = setInterval(() => res.write(": ka\n\n"), 15000); req.on("close", () => { un(); clearInterval(ka); }); return;
      }
      if (m === "GET" && action === "log") return send(res, 200, { events: store.events() });
      if (m === "GET" && action === "gate") return send(res, 200, PL.gateView(runId) || { gate: null });
      if (m === "POST" && action === "confirm-plan") { const b = await readBody(req); return send(res, 200, await PL.confirmPlan(runId, b)); }
      if (m === "POST" && action === "ratify-sources") { const b = await readBody(req); return send(res, 200, await PL.ratifySources(runId, b)); }
      if (m === "POST" && action === "resume") { if (state.status === "RUNNING") return send(res, 409, { error: "ALREADY_RUNNING", message: "Le run est déjà en cours." }); if (state.status === "FAILED" && !PL.isResumable(state)) return send(res, 409, { error: "NOT_RESUMABLE", message: "Ce run s'est arrêté sur une erreur de contrat : il n'est pas reprenable. Créez un nouveau run." }); PL.advance(runId); return send(res, 202, { ok: true }); }
      if (m === "GET" && action === "report") { const r = store.loadJson("report.json"); return r ? send(res, 200, r) : send(res, 404, { error: "REPORT_NOT_READY", message: "Le rapport n'est pas encore produit." }); }
      if (m === "GET" && action === "artifacts" && !arg) { const files = fs.readdirSync(store.dir).filter((f) => f.endsWith(".json") || f.endsWith(".jsonl")).sort().map((f) => ({ name: f, bytes: fs.statSync(path.join(store.dir, f)).size })); const ev = path.join(store.dir, "evidence"); const evidence = fs.existsSync(ev) ? fs.readdirSync(ev).map((d) => ({ dir: d, files: fs.readdirSync(path.join(ev, d)).length })) : []; return send(res, 200, { files, evidence }); }
      if (m === "GET" && action === "artifacts" && arg) { if (!safeName(arg) && arg !== "llm-calls.jsonl" && arg !== "events.jsonl") return send(res, 400, { error: "BAD_NAME" }); const f = path.join(store.dir, arg); if (!fs.existsSync(f)) return send(res, 404, { error: "NOT_FOUND" }); res.writeHead(200, { "content-type": arg.endsWith(".jsonl") ? "text/plain; charset=utf-8" : "application/json; charset=utf-8" }); return res.end(fs.readFileSync(f)); }
      if (m === "GET" && action === "evidence" && arg) { const d = path.join(store.dir, "evidence", arg); if (!/^[A-Za-z0-9_-]+$/.test(arg) || !fs.existsSync(d)) return send(res, 404, { error: "NOT_FOUND" }); return send(res, 200, { dir: arg, files: fs.readdirSync(d).map((f) => ({ name: f, content: JSON.parse(fs.readFileSync(path.join(d, f), "utf8")) })).slice(0, 200) }); }
    }
    send(res, 404, { error: "NOT_FOUND", message: "Route inconnue." });
  } catch (e) { errOut(res, e); }
});
server.listen(PORT, HOST, function () {
  console.log("EvidenceForge " + P.CONFIG.product.version + " — http://" + HOST + ":" + PORT);
  console.log("  lots gelés vérifiés : " + Object.keys(INTEGRITY).map((k) => k + " (" + INTEGRITY[k].files + " fichiers)").join(", "));
  if (INTERRUPTED.length) console.log("  runs interrompus par le redémarrage, reprenables : " + INTERRUPTED.join(", "));
  console.log("  fournisseur d'analyse : " + (publicConfig().providerConfigured ? "configuré (identifiants présents dans l'environnement, jamais affichés)" : "NON configuré — aucun run ne pourra démarrer"));
});
module.exports = { server };
