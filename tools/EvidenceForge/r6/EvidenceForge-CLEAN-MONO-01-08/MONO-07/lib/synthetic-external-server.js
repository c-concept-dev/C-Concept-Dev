"use strict";
/**
 * MONO-07 — synthetic-external-server.js
 *
 * Vrai serveur HTTP local (comme MONO-04/test/fixtures.js::startTestServer)
 * — jamais un mock de fonction, jamais un accès réseau réel obligatoire.
 *
 * Le scénario (succès/erreur/timeout/invalide) est encodé dans le CHEMIN de
 * la route, jamais dans un en-tête personnalisé ni un champ de payload : le
 * Gateway MONO-04 (gelé) construit lui-même ses en-têtes et envoie le
 * payload métier tel quel, sans espace prévu pour une métadonnée de test.
 * Chaque scénario a donc son propre `providerConfig.endpoint` distinct côté
 * appelant (voir provider-configs.js) — jamais un contournement du contrat
 * gelé du Gateway.
 *
 * Routes :
 *   POST /worker/success    -> 200, { text: <réponse du workerResponder> }
 *   POST /worker/error      -> 500
 *   POST /worker/timeout    -> ne répond jamais (le vrai timeoutMs du
 *                              ProviderRegistry déclenche l'abort côté client)
 *   POST /worker/invalid    -> 200, corps non-JSON
 *   POST /openalex/success  -> 200, { <réponse du openAlexResponder> }
 *   POST /openalex/error | /timeout | /invalid -> idem worker
 */

const http = require("http");

function startSyntheticExternalServer({ workerResponder, openAlexResponder } = {}) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parts = req.url.split("/").filter(Boolean); // ["worker","success"] ou ["openalex","timeout"]
      const [kind, scenario] = parts;

      if (scenario === "timeout") {
        req.socket.on("close", () => { try { res.destroy(); } catch { /* deja ferme */ } });
        return;
      }
      if (scenario === "error") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "erreur technique synthétique (scénario MONO-07)" }));
        return;
      }
      if (scenario === "invalid") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{ceci n'est pas du JSON valide");
        return;
      }

      let parsedPayload = null;
      try { parsedPayload = JSON.parse(body).payload; } catch { /* payload non-JSON, laisse null */ }

      if (kind === "worker") {
        const text = workerResponder ? workerResponder(parsedPayload) : JSON.stringify({ findings: [] });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text }));
        return;
      }
      if (kind === "openalex") {
        const json = openAlexResponder ? openAlexResponder(parsedPayload) : { results: [] };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "route inconnue (MONO-07 synthetic server)" }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}

module.exports = { startSyntheticExternalServer };
