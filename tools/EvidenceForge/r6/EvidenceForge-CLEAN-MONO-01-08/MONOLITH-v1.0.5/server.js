#!/usr/bin/env node
"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — server.js
 * Serveur LOCAL (127.0.0.1 uniquement) : interface index.html + API JSON + flux d'evenements (SSE).
 * Demarrage fail-closed : integrite des lots geles verifiee avant d'ecouter. Aucun secret n'est lu ailleurs que dans
 * l'environnement du processus, jamais renvoye a l'interface (seule la PRESENCE est indiquee).
 *   node server.js            -> http://127.0.0.1:8765
 * v1.0.5 : GET /api/runs/:id/cost (cout reel + budget + projection), POST /api/runs/:id/budget, GET /api/runs/:id/economics,
 *          POST /api/preflight (controle de cadrage hors run, jamais une creation de run) ; /api/config expose la version du tarif.
 */
const http = require("http"), fs = require("fs"), path = require("path");   /* v1.0.5 : WHATWG URL (plus de url.parse deprecie) */
const P = require("./lib/paths.js");
const RS = require("./lib/run-store.js");
const PL = require("./lib/pipeline.js");
const { createLlm } = require("./lib/llm.js"); const PD = require("./lib/provider-diagnostic.js"); const CL = require("./lib/cost-ledger.js"); const PA = require("./lib/preflight-assistant.js"); const SM = require("./lib/stage-mission.js"); const { createPricing } = require("./lib/pricing.js");

const INTEGRITY = P.verifyFrozenLots();   // leve FROZEN_LOT_ALTERED : le produit ne demarre pas sur un lot altere
const INTERRUPTED = RS.markInterruptedRuns();   // runs laisses RUNNING par un arret : STOPPED reprenables (jamais un faux "en cours")
const HOST = P.CONFIG.server.host || "127.0.0.1", PORT = Number(process.env.EVIDENCEFORGE_PORT || P.CONFIG.server.port || 8765);
const INDEX = path.join(P.ROOT, "index.html");
const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((resolve, reject) => { const c = []; let n = 0; req.on("data", (d) => { n += d.length; if (n > 64 * 1024 * 1024) { reject(Object.assign(new Error("PAYLOAD_TOO_LARGE"), { code: "PAYLOAD_TOO_LARGE" })); req.destroy(); } c.push(d); }); req.on("end", () => { try { resolve(c.length ? JSON.parse(Buffer.concat(c).toString("utf8")) : {}); } catch (e) { reject(Object.assign(new Error("BAD_JSON"), { code: "BAD_JSON" })); } }); req.on("error", reject); });
const errOut = (res, e) => send(res, e.code === "RUN_NOT_FOUND" ? 404 : (["GATE_NOT_OPEN", "HUMAN_IDENTITY_REQUIRED", "MISSION_INVALID", "BAD_JSON", "DOCUMENTS_REJECTED", "REPORT_IMPORT_INVALID", "BUDGET_INVALID", "PREFLIGHT_INVALID"].indexOf(e.code) !== -1) ? 400 : (["PROVIDER_NOT_CONFIGURED", "PROVIDER_NOT_READY", "BUDGET_LIMIT_REACHED", "PRICING_UNKNOWN_FOR_MODEL"].indexOf(e.code) !== -1 ? 409 : 500), { error: e.code || "ERROR", message: e.userMessage || e.message, details: e.details || null });
const safeName = (n) => /^[A-Za-z0-9_.-]+\.json$/.test(n) && n.indexOf("..") === -1;

let PRICING = null; try { PRICING = createPricing(); } catch (e) { PRICING = null; }
/* v1.0.5 — ETAT DU FOURNISSEUR en trois niveaux : identifiants presents (sans placeholder, URL valide) / worker joignable / pret (auth acceptee).
   La sonde est GRATUITE (corps `{}` refuse par le Worker apres authentification, aucun appel amont) ; resultat cache PROVIDER_TTL_MS ; jamais la clef. */
const PROVIDER_TTL_MS = 30000; let PROVIDER_DIAG = null, PROVIDER_PENDING = null; const STARTED_AT = new Date().toISOString();
async function providerDiagnostic(force) {
  if (!force && PROVIDER_DIAG && Date.now() - Date.parse(PROVIDER_DIAG.checkedAt) < PROVIDER_TTL_MS) return PROVIDER_DIAG;
  if (PROVIDER_PENDING) return PROVIDER_PENDING;
  PROVIDER_PENDING = PD.probeWorker({ env: process.env, timeoutMs: 15000 }).then((d) => { PROVIDER_DIAG = d; PROVIDER_PENDING = null; return d; }, (e) => { PROVIDER_PENDING = null; PROVIDER_DIAG = { ready: false, reachable: false, authOk: false, code: "PROVIDER_UNAVAILABLE", userMessage: PD.USER.PROVIDER_UNAVAILABLE, checkedAt: new Date().toISOString(), detail: String(e.message).slice(0, 120) }; return PROVIDER_DIAG; });
  return PROVIDER_PENDING;
}
function providerSummary() {
  const cs = PD.credentialsStatus(process.env); const d = PROVIDER_DIAG;
  return { credentialsPresent: cs.credentialsPresent, placeholderDetected: cs.placeholderDetected, placeholders: cs.placeholders, urlValid: cs.urlValid, host: cs.host, credentialsCode: cs.code,
    reachable: d ? d.reachable : null, authOk: d ? d.authOk : null, ready: d ? d.ready === true : false, code: d ? d.code : (cs.usable ? "PROVIDER_UNCHECKED" : cs.code), userMessage: d ? d.userMessage : (cs.usable ? "Diagnostic du fournisseur non encore effectué." : cs.userMessage), checkedAt: d ? d.checkedAt : null, httpStatus: d ? d.httpStatus : null, ms: d ? d.ms : null };
}   /* v1.0.5 : autorite de tarification (config/llm-pricing.json) ; absente ou invalide => signalee, jamais un tarif invente */
function publicConfig() {
  const model = process.env.EVIDENCEFORGE_LLM_MODEL || P.CONFIG.llm.model;
  const prov = providerSummary();
  /* providerConfigured = providerReady (strict) : un placeholder non vide n'est plus "configuré" */
  return { product: P.CONFIG.product.name, version: P.CONFIG.product.version, model, providerConfigured: prov.ready, providerCredentialsPresent: prov.credentialsPresent, providerReachable: prov.reachable, providerReady: prov.ready, provider: prov,
    runtime: { pid: process.pid, startedAt: STARTED_AT, port: PORT, gitSha: process.env.EVIDENCEFORGE_GIT_SHA || null, runsRoot: P.RUNS, node: process.version },
    pricing: PRICING ? { version: PRICING.version, currency: PRICING.currency, snapshotHash: PRICING.hash, modelPriced: !!PRICING.resolve(model), verifiedAt: PRICING.snapshot().verifiedAt || null, source: PRICING.snapshot().source || null } : { version: null, modelPriced: false, error: "PRICING_UNAVAILABLE" },
    budgetDefaults: P.CONFIG.budget || { costBudgetUsd: null, warningThresholdUsd: null }, professionals: { maxCandidatesToEvaluate: P.CONFIG.professionals && P.CONFIG.professionals.maxCandidatesToEvaluate },
    frozenLots: Object.keys(INTEGRITY).map((k) => ({ lot: k, files: INTEGRITY[k].files, verified: INTEGRITY[k].verified, canonicalZipSha256: INTEGRITY[k].canonicalZipSha256 || null })), documents: P.CONFIG.documents, stages: RS.STAGES.map((s) => ({ id: s, label: RS.STAGE_LABELS[s] })) };
}

const server = http.createServer(async function (req, res) {
  const u = new URL(req.url, "http://127.0.0.1"); const p = u.pathname; const m = req.method;
  try {
    if (m === "GET" && (p === "/" || p === "/index.html")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(fs.readFileSync(INDEX)); }
    if (m === "GET" && p === "/api/config") return send(res, 200, publicConfig());
    /* v1.0.5 — diagnostic fournisseur a la demande (sonde gratuite, cache 30 s ; ?refresh=1 force) ; jamais un secret */
    if (m === "GET" && p === "/api/provider") { await providerDiagnostic(u.searchParams.get("refresh") === "1"); return send(res, 200, providerSummary()); }
    if (m === "GET" && p === "/api/runs") return send(res, 200, { runs: RS.listRuns() });
    if (m === "POST" && p === "/api/runs") { const b = await readBody(req);
      /* v1.0.5 — AUCUN run n'est cree si le fournisseur n'est pas pret (diagnostic frais, gratuit), verifie APRES la validation de la demande et AVANT la creation du dossier : pas d'artefact fantome, message precis */
      const assertProviderReady = async () => { const d = await providerDiagnostic(false); if (!d.ready) { const e = new Error("PROVIDER_NOT_READY: " + d.code); e.code = "PROVIDER_NOT_READY"; e.userMessage = "Le service d'analyse n'est pas prêt : " + d.userMessage; e.details = providerSummary(); throw e; } }; const files = (b.files || []).map((f) => ({ name: f.name, bytes: Buffer.from(String(f.contentBase64 || ""), "base64") })); const r = await PL.startRun({ question: b.question, files, acknowledgeRejected: b.acknowledgeRejected === true, budget: b.budget || null, assertProviderReady }); PL.advance(r.runId); return send(res, 201, r); }
    /* v1.0.5 — controle de cadrage HORS RUN : 1 appel reel (facture, journalise dans runs/_preflight/), aucun run cree, aucune porte franchie */
    if (m === "POST" && p === "/api/preflight") { const b = await readBody(req); const intake = SM.intakeDocuments((b.files || []).map((f) => ({ name: f.name, bytes: Buffer.from(String(f.contentBase64 || ""), "base64") })));
      const dir = path.join(P.RUNS, "_preflight"); fs.mkdirSync(dir, { recursive: true }); const ledger = CL.createCostLedger({ runDir: dir, runId: "_preflight" }); ledger.setStage("PREFLIGHT_ASSISTANT");
      const llm = createLlm({ runDir: dir, runId: "_preflight-" + Date.now().toString(36), ledger, storePath: path.join(dir, "llm-reuse-store.jsonl") });
      const before = ledger.totals().totalUsd; const r = await PA.reviewRequest({ llm, question: b.question, documents: intake.documents }); const after = ledger.totals().totalUsd;
      return send(res, 200, Object.assign(r, { rejectedDocuments: intake.rejected, cost: { thisCheckUsd: Math.round((after - before) * 100) / 100, currency: "USD", label: "ACTUAL_COST", pricingVersion: ledger.pricing().version } })); }
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
      /* v1.0.5 — cout reel + budget + projection ; budget modifiable a tout moment (acte explicite) ; economie du panel */
      if (m === "GET" && action === "cost") return send(res, 200, PL.costView(runId));
      if (m === "POST" && action === "budget") { const b = await readBody(req); return send(res, 200, PL.updateBudget(runId, b)); }
      if (m === "GET" && action === "economics") return send(res, 200, PL.economicsView(runId) || { status: "NOT_AVAILABLE" });
      if (m === "POST" && action === "confirm-plan") { const b = await readBody(req); return send(res, 200, await PL.confirmPlan(runId, b)); }
      if (m === "POST" && action === "ratify-sources") { const b = await readBody(req); return send(res, 200, await PL.ratifySources(runId, b)); }
      if (m === "POST" && action === "resume") { if (state.status === "RUNNING") return send(res, 409, { error: "ALREADY_RUNNING", message: "Le run est déjà en cours." }); if (state.status === "FAILED" && !PL.isResumable(state)) return send(res, 409, { error: "NOT_RESUMABLE", message: "Ce run s'est arrêté sur une erreur de contrat : il n'est pas reprenable. Créez un nouveau run." }); PL.advance(runId); return send(res, 202, { ok: true }); }
      if (m === "GET" && action === "report") { const r = store.loadJson("report.json"); return r ? send(res, 200, r) : send(res, 404, { error: "REPORT_NOT_READY", message: "Le rapport n'est pas encore produit." }); }
      if (m === "GET" && action === "artifacts" && !arg) { const files = fs.readdirSync(store.dir).filter((f) => f.endsWith(".json") || f.endsWith(".jsonl")).sort().map((f) => ({ name: f, bytes: fs.statSync(path.join(store.dir, f)).size })); const ev = path.join(store.dir, "evidence"); const evidence = fs.existsSync(ev) ? fs.readdirSync(ev).map((d) => ({ dir: d, files: fs.readdirSync(path.join(ev, d)).length })) : []; return send(res, 200, { files, evidence }); }
      if (m === "GET" && action === "artifacts" && arg) { if (!safeName(arg) && arg !== "llm-calls.jsonl" && arg !== "events.jsonl" && arg !== "cost-ledger.jsonl") return send(res, 400, { error: "BAD_NAME" }); const f = path.join(store.dir, arg); if (!fs.existsSync(f)) return send(res, 404, { error: "NOT_FOUND" }); res.writeHead(200, { "content-type": arg.endsWith(".jsonl") ? "text/plain; charset=utf-8" : "application/json; charset=utf-8" }); return res.end(fs.readFileSync(f)); }
      if (m === "GET" && action === "evidence" && arg) { const d = path.join(store.dir, "evidence", arg); if (!/^[A-Za-z0-9_-]+$/.test(arg) || !fs.existsSync(d)) return send(res, 404, { error: "NOT_FOUND" }); return send(res, 200, { dir: arg, files: fs.readdirSync(d).map((f) => ({ name: f, content: JSON.parse(fs.readFileSync(path.join(d, f), "utf8")) })).slice(0, 200) }); }
    }
    send(res, 404, { error: "NOT_FOUND", message: "Route inconnue." });
  } catch (e) { errOut(res, e); }
});
server.listen(PORT, HOST, function () {
  console.log("EvidenceForge " + P.CONFIG.product.version + " — http://" + HOST + ":" + PORT);
  console.log("  lots gelés vérifiés : " + Object.keys(INTEGRITY).map((k) => k + " (" + INTEGRITY[k].files + " fichiers)").join(", "));
  if (INTERRUPTED.length) console.log("  runs interrompus par le redémarrage, reprenables : " + INTERRUPTED.join(", "));
  const cs0 = PD.credentialsStatus(process.env); console.log("  fournisseur d'analyse : identifiants " + (cs0.credentialsPresent ? "présents" : "ABSENTS") + (cs0.placeholderDetected ? " — VALEUR FACTICE DETECTEE (" + cs0.placeholders.join(", ") + ")" : "") + (cs0.credentialsPresent && !cs0.urlValid ? " — URL invalide" : "") + " (jamais affichés)");
  providerDiagnostic(true).then((d) => console.log("  diagnostic fournisseur : " + (d.ready ? "PRÊT (worker joignable, clé acceptée, sonde gratuite)" : d.code + " — " + d.userMessage)));
  const pc = publicConfig(); console.log("  tarification : " + (pc.pricing.version || "ABSENTE") + " · modèle " + pc.model + (pc.pricing.modelPriced ? " tarifé" : " NON TARIFÉ (un budget refusera tout appel)"));
});
module.exports = { server };
