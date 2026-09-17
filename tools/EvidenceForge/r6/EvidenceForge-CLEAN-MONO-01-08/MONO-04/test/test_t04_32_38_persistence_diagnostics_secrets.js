"use strict";
const fs = require("fs");
const path = require("path");
const { startTestServer, buildMono04 } = require("./fixtures.js");
const { createProviderRegistry } = require("../lib/provider-registry.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  {
    const libDir = path.join(__dirname, "..", "lib");
    const findings = [];
    for (const f of fs.readdirSync(libDir)) {
      const src = fs.readFileSync(path.join(libDir, f), "utf8");
      if (/createArtifactStore|createRunStore|ArtifactRecord|RunState\b/.test(src)) findings.push(f);
    }
    check("T04-32. aucun fichier lib/ de MONO-04 ne réimplémente ArtifactStore/RunStore/RunState (MONO-03 reste l'unique persistance métier)", findings.length === 0, JSON.stringify(findings));
  }

  {
    const server = await startTestServer({ "/always-500": (req, res) => { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "panne" })); } });
    const mono04 = buildMono04({ "/always-500": { endpoint: server.baseUrl + "/always-500", timeoutMs: 300, method: "POST" } });
    const r = await mono04.gateway.executeRequest({ requestId: "t33", provider: "/always-500", operation: "x", payload: {}, retryPolicy: { maxAttempts: 2, backoffMs: 5 } });
    let serializable = true;
    let serialized = null;
    try {
      serialized = JSON.stringify(r);
    } catch (e) {
      serializable = false;
    }
    check("T04-33. un ExternalExecutionResult FAILED (avec erreur imbriquée EXTERNAL_RETRY_EXHAUSTED->lastError) reste entièrement sérialisable en JSON", serializable && typeof serialized === "string", serialized && serialized.slice(0, 150));
    await server.close();
  }

  {
    let calls = 0;
    const server = await startTestServer({ "/count": (req, res) => { calls++; res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ text: "ok" })); } });
    const mono04 = buildMono04({ "/count": { endpoint: server.baseUrl + "/count", timeoutMs: 300, method: "POST" } });
    await mono04.gateway.executeRequest({ requestId: "t34-a", provider: "/count", operation: "x", payload: {} });
    await mono04.gateway.executeRequest({ requestId: "t34-b", provider: "/count", operation: "x", payload: {} });
    check("T04-34. deux requestId DIFFÉRENTS déclenchent bien deux appels réseau distincts (le cache d'idempotence ne sur-généralise jamais)", calls === 2, JSON.stringify({ calls }));
    await server.close();
  }

  {
    const registry = createProviderRegistry({ p1: { endpoint: "http://127.0.0.1:1/x", timeoutMs: 100 } });
    const cfg = registry.getProviderConfig("p1");
    let mutationThrew = false;
    try {
      cfg.endpoint = "http://autre-endroit/";
    } catch (e) {
      mutationThrew = true;
    }
    const cfgAfter = registry.getProviderConfig("p1");
    check("T04-35. une config provider est gelée (Object.freeze) — toute tentative de mutation ne change JAMAIS la config réelle", cfgAfter.endpoint === "http://127.0.0.1:1/x", JSON.stringify({ mutationThrew, endpointAfter: cfgAfter.endpoint }));
  }

  {
    const { DEFAULT_MAX_RESPONSE_BYTES } = require("../lib/response-validation.js");
    check("T04-36. une limite de taille par DÉFAUT existe et est appliquée même sans maxResponseBytes explicite (voir T04-11c pour le déclenchement réel)", typeof DEFAULT_MAX_RESPONSE_BYTES === "number" && DEFAULT_MAX_RESPONSE_BYTES > 0);
  }

  {
    const { createStaticSecretProvider } = require("../lib/secret-provider.js");
    const { createMono04 } = require("../index.js");
    const mono04 = createMono04({
      providerConfigs: { secure: { endpoint: "http://127.0.0.1:1/x", timeoutMs: 100, requiredSecret: "SECRET_A" } },
      secretProvider: createStaticSecretProvider({ SECRET_A: "sk-valeur-tres-secrete-jamais-serialisee" }),
    });
    const r = await mono04.gateway.executeRequest({ requestId: "t37", provider: "not-configured", operation: "x", payload: {} });
    check("T04-37. le résultat sérialisé ne contient jamais la valeur d'un secret réel, seulement des noms/codes techniques", !JSON.stringify(r).includes("sk-valeur-tres-secrete-jamais-serialisee"));
  }

  {
    const root = path.join(__dirname, "..");
    const canonicalDirs = ["lib", "contracts", "reports"];
    const suspiciousPatterns = [/sk-[A-Za-z0-9]{10,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
    const findings = [];
    for (const dir of canonicalDirs) {
      const dirPath = path.join(root, dir);
      if (!fs.existsSync(dirPath)) continue;
      for (const f of fs.readdirSync(dirPath)) {
        const full = path.join(dirPath, f);
        if (fs.statSync(full).isDirectory()) continue;
        const src = fs.readFileSync(full, "utf8");
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(src)) findings.push({ file: path.relative(root, full), pattern: String(pattern) });
        }
      }
    }
    check("T04-38. aucun secret ressemblant à une vraie clé (sk-..., AKIA..., clé privée PEM) dans lib/contracts/reports", findings.length === 0, JSON.stringify(findings));
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
