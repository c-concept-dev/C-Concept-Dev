"use strict";
// test/test_t08_preflight.js — T08-PREFLIGHT-01 a 10 (LOCAL_CONTROLLED)

const { checkProvider, buildProviders } = require("../lib/preflight");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

async function checkWithLocalProbe(provider, probeResult) {
  return checkProvider(Object.assign({}, provider, { probe: function () { return Promise.resolve(probeResult); } }));
}

(async () => {
  const openalexValidator = buildProviders({})[0];
  const crossrefValidator = buildProviders({})[1];
  const llmValidator = buildProviders({})[3];

  {
    const r = await checkWithLocalProbe(openalexValidator, { reached: true, statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ meta: {}, results: [{ id: "W1" }] }) });
    check("T08-PREFLIGHT-01. OpenAlex payload valide (results[] present) -> READY", r.status === "READY", r.status);
  }

  {
    const r = await checkWithLocalProbe(openalexValidator, { reached: true, statusCode: 404, headers: { "content-type": "text/plain" }, body: "not found" });
    check("T08-PREFLIGHT-02. OpenAlex HTTP 404 -> jamais READY", r.status !== "READY", r.status);
  }

  {
    const r = await checkWithLocalProbe(crossrefValidator, { reached: true, statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "ok", "message-type": "work-list", message: { items: [] } }) });
    check("T08-PREFLIGHT-03. Crossref payload valide (message-type=work-list) -> READY", r.status === "READY", r.status);
  }

  {
    const r = await checkWithLocalProbe(openalexValidator, { reached: true, statusCode: 405, headers: {}, body: '{"type":"error"}' });
    check("T08-PREFLIGHT-04. HTTP 405 -> jamais READY (regression du faux-READY corrigee)", r.status !== "READY" && r.status === "INVALID_RESPONSE", r.status);
  }

  {
    const r = await checkWithLocalProbe(llmValidator, { reached: true, statusCode: 401, headers: {}, body: "", credentialProbeSkipped: true });
    check("T08-PREFLIGHT-05. LLM credential absent -> AUTHENTICATION_BLOCKED", r.status === "AUTHENTICATION_BLOCKED", r.status);
  }

  {
    const llmWithKey = buildProviders({ ANTHROPIC_API_KEY: "fake-key" })[3];
    const r = await checkWithLocalProbe(llmWithKey, { reached: true, statusCode: 401, headers: {}, body: '{"type":"error","error":{"type":"authentication_error"}}' });
    check("T08-PREFLIGHT-06. LLM credential present + 401 -> AUTHENTICATION_BLOCKED, jamais READY", r.status === "AUTHENTICATION_BLOCKED" && r.status !== "READY", r.status);
  }

  {
    const llmWithKey = buildProviders({ ANTHROPIC_API_KEY: "fake-key" })[3];
    const r = await checkWithLocalProbe(llmWithKey, { reached: true, statusCode: 405, headers: {}, body: '{"type":"error","error":{"type":"invalid_request_error","message":"Method Not Allowed"}}' });
    check("T08-PREFLIGHT-07. LLM credential present + 405 -> INVALID_RESPONSE, jamais READY (defaut exact de l'audit)", r.status === "INVALID_RESPONSE" && r.status !== "READY", r.status);
  }

  {
    const r = await checkWithLocalProbe(openalexValidator, { reached: true, statusCode: 403, headers: { "x-deny-reason": "host_not_allowed" }, body: "Host not in allowlist" });
    check("T08-PREFLIGHT-08. proxy x-deny-reason -> NETWORK_BLOCKED", r.status === "NETWORK_BLOCKED", r.status);
  }

  {
    const r = await checkWithLocalProbe(openalexValidator, { reached: true, statusCode: 429, headers: {}, body: "" });
    check("T08-PREFLIGHT-09. HTTP 429 -> RATE_LIMITED", r.status === "RATE_LIMITED", r.status);
  }

  {
    const r = await checkWithLocalProbe(openalexValidator, { reached: true, statusCode: 200, headers: { "content-type": "text/html" }, body: "<html>proxy landing page</html>" });
    check("T08-PREFLIGHT-10. 200 HTML de proxy -> INVALID_RESPONSE, jamais READY", r.status === "INVALID_RESPONSE" && r.status !== "READY", r.status);
  }

  const failed = results.filter(function (r) { return !r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
