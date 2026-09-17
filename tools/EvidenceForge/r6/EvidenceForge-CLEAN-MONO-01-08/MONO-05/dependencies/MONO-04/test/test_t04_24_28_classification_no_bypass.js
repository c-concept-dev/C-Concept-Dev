"use strict";
const path = require("path");
const fs = require("fs");
const { MONO01_PATH, startTestServer, buildMono04 } = require("./fixtures.js");
const { createMono01 } = require(path.join(MONO01_PATH, "index.js"));

const REGISTRY_PATH = path.join(MONO01_PATH, "registry", "mono-00-frozen-baseline-registry-v1.json");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);

  {
    const b = mono01.externalExecutionPort.classify("EF-ORCH", "llm", "EF-01B");
    const c1 = mono01.externalExecutionPort.classify("EF-ORCH", "llm", "EF-01C1");
    check("T04-24. EF-01B/EF-01C1 restent INDIRECT_UPSTREAM (jamais aplati en DIRECT_RUNTIME ni en booléen) — MONO-04 n'a rien reclassifié", b.classification === "INDIRECT_UPSTREAM" && c1.classification === "INDIRECT_UPSTREAM", JSON.stringify({ b, c1 }));
  }

  {
    const net = mono01.externalExecutionPort.classify("EF-ORCH", "network", "EF-01C2");
    check("T04-25. EF-01C2 (OpenAlex/Crossref/PubMed) reste DIRECT_RUNTIME, exactement comme déjà gelé dans MONO-01.x", net.classification === "DIRECT_RUNTIME", JSON.stringify(net));
  }

  {
    const server = await startTestServer({
      "/llm": (req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text: JSON.stringify({ judgments: [{ dimensionId: "d1", relevanceStatus: "mission_relevant", epistemicStatus: "documented", rationale: "x" }], dimensions: [{ id: "d1", level: "strong", relevanceStatus: "mission_relevant", epistemicStatus: "documented", rationale: "x", evidenceWorks: ["Étude p1"] }] }) }));
      },
    });
    const mono04 = buildMono04({ "clone-proxy": { endpoint: server.baseUrl + "/llm", timeoutMs: 500, method: "POST" } });
    const workerCallFn = mono04.createGatewayWorkerCallFn({ provider: "clone-proxy", operation: "eligibility" });
    const EF02D1D2Orchestrator = require(path.join(MONO01_PATH, "dependencies", "ef-02d1d2-orchestrator-v1.js"));
    check("T04-26. le module gelé EF-02D1D2Orchestrator expose bien le point d'injection workerCallFn déjà connu — MONO-04 s'y branche sans le modifier", typeof EF02D1D2Orchestrator.buildEligibilityRelevanceSet === "function");
    const text = await workerCallFn("prompt de test D2/D3");
    const parsed = JSON.parse(text);
    check("T04-26b. le workerCallFn technique MONO-04 retourne un texte exploitable tel quel par le module gelé (aucune interprétation ajoutée)", Array.isArray(parsed.judgments), text.slice(0, 80));
    await server.close();
  }

  {
    const runnerSrc = fs.readFileSync(path.join(MONO01_PATH, "dependencies", "ef-03b-review-runner-v1.js"), "utf8");
    check("T04-27. ef-03b-review-runner-v1.js (gelé) utilise bien workerCallFn(prompt) -> string comme point d'injection — MONO-04 ne fait que router vers ce point déjà existant, jamais un nouveau", /await workerCallFn\(prompt\)/.test(runnerSrc));
  }

  {
    const libDir = path.join(__dirname, "..", "lib");
    const violations = [];
    for (const f of fs.readdirSync(libDir)) {
      const src = fs.readFileSync(path.join(libDir, f), "utf8");
      const requireMatches = [...src.matchAll(/require\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]);
      for (const r of requireMatches) {
        if (r.startsWith(".") && (r.includes("dependencies") || r.includes("ports/") || r.includes("MONO-0"))) {
          violations.push({ file: f, require: r });
        }
      }
    }
    check("T04-28. aucun fichier lib/ de MONO-04 ne require() directement un module métier gelé ni un port MONO-01.x — seuls les fichiers internes de lib/ sont requis entre eux", violations.length === 0, JSON.stringify(violations));
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
