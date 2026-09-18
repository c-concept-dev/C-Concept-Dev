"use strict";
/**
 * MONOLITH v1.0.5 — tools/fake-worker.js : WORKER FACTICE pour les tests (jamais en production). Reproduit le contrat du Worker
 * evidenceforge-llm-proxy : POST /v1/messages uniquement ; Bearer verifie AVANT le payload (401 sinon) ; corps non conforme => 400
 * invalid_request (sans appel amont) ; corps conforme => reponse Anthropic synthetique (texte fixe ou fourni par `reply(prompt)`),
 * avec `usage` factice. Options : { key, reply(prompt) -> texte, status (force un statut), delayMs }. Aucun secret reel.
 */
const http = require("http");
function startFakeWorker(opts) {
  opts = opts || {}; const key = opts.key || "FAKE-WORKER-KEY-not-a-secret"; let calls = 0;
  const srv = http.createServer((req, res) => {
    const send = (st, obj) => { res.writeHead(st, { "content-type": "application/json", "x-evidenceforge-proxy": "evidenceforge-llm-proxy" }); res.end(JSON.stringify(obj)); };
    if (req.method !== "POST" || req.url !== "/v1/messages") return send(404, { error: "not_found", message: "Seule la route POST /v1/messages est supportee." });
    const auth = req.headers.authorization || ""; if (auth !== "Bearer " + key) return send(401, { error: "unauthorized", message: "Credential Worker absent ou invalide." });
    let body = ""; req.on("data", (d) => { body += d; }); req.on("end", () => {
      let p; try { p = JSON.parse(body); } catch (e) { return send(400, { error: "invalid_request", message: "Corps JSON malforme." }); }
      if (!p || typeof p.model !== "string" || typeof p.max_tokens !== "number" || !Array.isArray(p.messages) || !p.messages.length) return send(400, { error: "invalid_request", message: "Payload non conforme au contrat Anthropic Messages API (model, max_tokens, messages requis)." });
      calls++; if (opts.status) return send(opts.status, { error: { type: "forced", message: "statut force " + opts.status } });
      const prompt = String(p.messages[0].content || ""); const text = typeof opts.reply === "function" ? opts.reply(prompt, calls) : (opts.text || "ok");
      const out = () => send(200, { id: "msg_fake_" + calls, type: "message", role: "assistant", model: p.model, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: Math.ceil(prompt.length / 4), output_tokens: Math.ceil(String(text).length / 4), cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });
      if (opts.delayMs) setTimeout(out, opts.delayMs); else out();
    });
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ url: "http://127.0.0.1:" + srv.address().port, key, calls: () => calls, close: () => new Promise((r) => srv.close(r)) })));
}
module.exports = { startFakeWorker };
