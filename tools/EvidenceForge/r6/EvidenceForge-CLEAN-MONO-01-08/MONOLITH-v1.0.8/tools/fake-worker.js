"use strict";
/**
 * MONOLITH v1.0.5 — tools/fake-worker.js : WORKER FACTICE pour les tests (jamais en production). Reproduit le contrat du Worker
 * evidenceforge-llm-proxy : POST /v1/messages uniquement ; Bearer verifie AVANT le payload (401 sinon) ; corps non conforme => 400
 * invalid_request (sans appel amont) ; corps conforme => reponse Anthropic synthetique (texte fixe ou fourni par `reply(prompt)`),
 * avec `usage` factice. Options : { key, reply(prompt) -> texte, status (force un statut), delayMs }. Aucun secret reel.
 * v1.0.8 — contrat du proxy v0.7 (relais SSE) : si le payload porte `stream: true`, la reponse est un flux `text/event-stream`
 * (message_start, content_block_start, content_block_delta…, content_block_stop, message_delta, message_stop) emis evenement par
 * evenement. `opts.streamMode` (ou `setStreamMode(m)`) simule les cas de test : "full" (defaut), "buffered" (ancien proxy : SSE
 * bufferise en application/json), "buffered-incomplete", "slow" (delai par evenement `eventDelayMs`), "cut" (connexion coupee en
 * pleine generation), "cut0" (coupee avant message_start), "stall" (message_start puis silence), "nostop" (fin sans message_stop),
 * "empty" (flux vide), "emptytext" (complet sans texte), "malformed" (JSON invalide), "error-overloaded" / "error-other" (evenement
 * `error`), "hang" (aucun en-tete). `opts.statusOnce` force UN statut (429/5xx) puis repasse en mode normal. `opts.streamMs` : delai
 * avant chaque evenement. Aucun secret reel ; aucun appel amont.
 */
const http = require("http");
function sseEvents(p, text, calls) {
  const prompt = String(p.messages[0].content || ""); const parts = String(text).match(/[\s\S]{1,7}/g) || [];
  return [{ type: "message_start", message: { id: "msg_fake_" + calls, type: "message", role: "assistant", model: p.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: Math.ceil(prompt.length / 4), output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }]
    .concat(parts.map((t) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } })))
    .concat([{ type: "content_block_stop", index: 0 }, { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: Math.ceil(String(text).length / 4) } }, { type: "message_stop" }]);
}
const sseText = (evs) => evs.map((e) => "event: " + e.type + "\ndata: " + JSON.stringify(e) + "\n\n").join("");
function startFakeWorker(opts) {
  opts = opts || {}; const key = opts.key || "FAKE-WORKER-KEY-not-a-secret"; let calls = 0, streamCalls = 0; let streamMode = opts.streamMode || "full"; let statusOnce = opts.statusOnce || null; const open = new Set(); const requests = [];
  const srv = http.createServer((req, res) => {
    const send = (st, obj, extra) => { res.writeHead(st, Object.assign({ "content-type": "application/json", "x-evidenceforge-proxy": "evidenceforge-llm-proxy", "x-evidenceforge-transport": "buffered" }, extra || {})); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };
    if (req.method !== "POST" || req.url !== "/v1/messages") return send(404, { error: "not_found", message: "Seule la route POST /v1/messages est supportee." });
    const auth = req.headers.authorization || ""; if (auth !== "Bearer " + key) return send(401, { error: "unauthorized", message: "Credential Worker absent ou invalide." });
    let body = ""; req.on("data", (d) => { body += d; }); req.on("end", () => {
      let p; try { p = JSON.parse(body); } catch (e) { return send(400, { error: "invalid_request", message: "Corps JSON malforme." }); }
      if (!p || typeof p.model !== "string" || typeof p.max_tokens !== "number" || !Array.isArray(p.messages) || !p.messages.length) return send(400, { error: "invalid_request", message: "Payload non conforme au contrat Anthropic Messages API (model, max_tokens, messages requis)." });
      calls++; requests.push({ stream: p.stream === true, accept: req.headers.accept || null, model: p.model, max_tokens: p.max_tokens, promptChars: String(p.messages[0].content || "").length, at: new Date().toISOString() });
      if (statusOnce) { const st = statusOnce; statusOnce = null; return send(st, { error: { type: st === 429 ? "rate_limit_error" : "api_error", message: "statut force " + st } }, { "retry-after": "1" }); }
      if (opts.status) return send(opts.status, { error: { type: "forced", message: "statut force " + opts.status } });
      const prompt = String(p.messages[0].content || ""); const text = typeof opts.reply === "function" ? opts.reply(prompt, calls) : (opts.text || "ok");
      const json = () => send(200, { id: "msg_fake_" + calls, type: "message", role: "assistant", model: p.model, content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: Math.ceil(prompt.length / 4), output_tokens: Math.ceil(String(text).length / 4), cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });
      if (p.stream !== true || opts.noStream) { if (opts.delayMs) setTimeout(json, opts.delayMs); else json(); return; }
      /* v1.0.8 — relais SSE (proxy v0.7) */
      streamCalls++; const mode = streamMode; let evs = sseEvents(p, mode === "emptytext" ? "" : text, calls);
      if (mode === "hang") { open.add(res); return; }
      if (mode === "buffered") return send(200, sseText(evs));
      if (mode === "buffered-incomplete") return send(200, sseText(evs.slice(0, 4)));
      if (mode === "cut0") { res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "x-evidenceforge-transport": "sse-stream" }); res.write(": ping\n\n"); return setTimeout(() => res.destroy(), 20); }
      if (mode === "malformed") evs = null;
      if (mode === "error-overloaded" || mode === "error-other") evs = evs.slice(0, 3).concat([{ type: "error", error: { type: mode === "error-overloaded" ? "overloaded_error" : "api_error", message: "simulated" } }]);
      if (mode === "cut" || mode === "stall") evs = evs.slice(0, mode === "stall" ? 1 : 4);
      if (mode === "nostop") evs = evs.slice(0, -1);
      if (mode === "empty") evs = [];
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-store", "x-evidenceforge-proxy": "evidenceforge-llm-proxy/0.7-stream", "x-evidenceforge-transport": "sse-stream" }); open.add(res);
      if (mode === "malformed") { res.write("event: message_start\ndata: {not json\n\n"); return res.end(); }
      let i = 0; const delay = mode === "slow" ? (opts.eventDelayMs || 100) : (opts.streamMs || 2);
      const tick = () => { if (res.destroyed) return; if (i >= evs.length) { if (mode === "cut") return res.destroy(); if (mode === "stall") return; open.delete(res); return res.end(); } const e = evs[i++]; res.write("event: " + e.type + "\ndata: " + JSON.stringify(e) + "\n\n"); setTimeout(tick, delay); };
      tick();
    });
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ url: "http://127.0.0.1:" + srv.address().port, key, calls: () => calls, streamCalls: () => streamCalls, requests, setStreamMode: (m) => { streamMode = m; }, setStatusOnce: (s) => { statusOnce = s; }, abortOpen: () => { open.forEach((r) => { try { r.destroy(); } catch (e) { /* */ } }); open.clear(); },
    close: () => { open.forEach((r) => { try { r.destroy(); } catch (e) { /* */ } }); open.clear(); return new Promise((r) => srv.close(r)); } })));
}
module.exports = { startFakeWorker, sseEvents, sseText };
