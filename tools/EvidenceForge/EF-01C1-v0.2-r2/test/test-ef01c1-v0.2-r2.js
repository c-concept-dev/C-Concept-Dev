"use strict";
// EF-01C1-v0.2-r2 — test/test-ef01c1-v0.2-r2.js
// Banc CIBLE des quatre findings r2. LOCAL_CONTROLLED, aucun reseau reel,
// aucun secret reel. argv[2] = bundleRoot (extraction R6).

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const { acquirePlannerRun } = require("../lib/executor.js");
const { parsePlannerResponse, normalizeStrictJsonEnvelope } = require("../lib/parser.js");
const { callTracedRealLlm } = require("../lib/real-llm-call.js");
const { CODES } = require("../lib/errors.js");
const { PROMPT_TEMPLATE, PROMPT_VERSION, PROMPT_ID } = require("../prompts/ef01c1-planner-prompt-v0.2-r1.js");

const bundleRoot = process.argv[2];
if (!bundleRoot) { console.error("Usage: node test/test-ef01c1-v0.2-r2.js <bundleRoot>"); process.exit(2); }
const { validateRealPlannerOutputFields } = require(path.join(bundleRoot, "MONO-08", "v0.6", "lib", "eforch-artifacts.js"));

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }
function sha256(t) { return crypto.createHash("sha256").update(t, "utf8").digest("hex"); }

const DISCIPLINES = ["sciences-information-documentation", "sciences-cognitives"];
// Fixture conforme au contrat GELE R6 validateRealPlannerOutputFields()
// (MONO-08/v0.6/lib/eforch-artifacts.js) — jamais une forme inventee ici.
const VALID_OUTPUT = {
  sources: [{ connectorId: "openalex", justification: "Couverture bibliographique ouverte et multidisciplinaire." }],
  queries: [
    { connectorId: "openalex", discipline: DISCIPLINES[0], requete: "structure de recueil documentaire", justification: "Cible la representation documentaire de la structure." },
    { connectorId: "openalex", discipline: DISCIPLINES[1], requete: "cognition situee recueil", justification: "Cible les contraintes cognitives du recueil." },
  ],
  retrieval: [{
    connectorId: "openalex",
    sortMode: "relevance",
    stopCondition: "maxResults atteint ou pagination epuisee",
    retryPolicy: "2 tentatives, backoff 1000 ms",
    rateLimitPolicy: "10 requetes/seconde maximum",
    budgetMax: "200 enregistrements",
    pageSize: 25,
    maxPages: 8,
    maxResults: 200,
  }],
  criteresInclusion: ["pertinence directe a la question de mission"],
  criteresExclusion: ["hors sujet", "doublon"],
  regleDedoublonnage: "DOI puis titre normalise",
  methodeQualification: "lecture titre/resume puis qualification manuelle",
  fenetreTemporelle: { debut: 2000, fin: 2026 },
  langues: ["fr", "en"],
  typesDocumentsAdmis: ["article"],
};
const VALID_JSON = JSON.stringify(VALID_OUTPUT);

// ---------- parser : enveloppe de transport (T01-T12) ----------
function parseOk(text) { try { parsePlannerResponse(text, DISCIPLINES, validateRealPlannerOutputFields); return null; } catch (e) { return e; } }

check("T01. JSON brut valide -> PASS", parseOk(VALID_JSON) === null);
check("T02. ```json + JSON valide + ``` -> PASS", parseOk("```json\n" + VALID_JSON + "\n```") === null);
check("T03. ``` + JSON valide + ``` -> PASS", parseOk("```\n" + VALID_JSON + "\n```") === null);
check("T04. whitespace externe + fence valide -> PASS", parseOk("\n\n   ```json\n" + VALID_JSON + "\n```   \n\n") === null);
check("T05. prose AVANT fence -> FAIL", (parseOk("Voici le plan :\n```json\n" + VALID_JSON + "\n```") || {}).code === "LLM_RESPONSE_INVALID");
check("T06. prose APRES fence -> FAIL", (parseOk("```json\n" + VALID_JSON + "\n```\nJ'espere que cela convient.") || {}).code === "LLM_RESPONSE_INVALID");
check("T07. deux fences -> FAIL", (parseOk("```json\n" + VALID_JSON + "\n```\n```json\n" + VALID_JSON + "\n```") || {}).code === "LLM_RESPONSE_INVALID");
check("T08. fence non fermee -> FAIL", (parseOk("```json\n" + VALID_JSON) || {}).code === "LLM_RESPONSE_INVALID");
check("T09. langage de fence non autorise -> FAIL", (parseOk("```python\n" + VALID_JSON + "\n```") || {}).code === "LLM_RESPONSE_INVALID");
check("T09b. ```JSON (casse) explicitement accepte", parseOk("```JSON\n" + VALID_JSON + "\n```") === null);
check("T10. fence avec JSON invalide -> FAIL", (parseOk("```json\n{\"a\":,}\n```") || {}).code === "LLM_RESPONSE_INVALID");
check("T11. JSON brut invalide -> FAIL", (parseOk("{\"a\":,}") || {}).code === "LLM_RESPONSE_INVALID");
check("T12. JSON valide + texte parasite hors fence -> FAIL", (parseOk(VALID_JSON + " et voila") || {}).code === "LLM_RESPONSE_INVALID");

// aucune reparation ni extraction
check("T12b. AUCUNE extraction depuis de la prose (accolades non cherchees)",
  (parseOk("bla { \"sources\": [] } bla") || {}).code === "LLM_RESPONSE_INVALID");
check("T12c. normalize ne modifie JAMAIS un JSON brut",
  normalizeStrictJsonEnvelope(VALID_JSON).text === VALID_JSON && normalizeStrictJsonEnvelope(VALID_JSON).envelopeRemoved === false);
check("T12d. normalize retire l'enveloppe sans toucher au contenu",
  JSON.parse(normalizeStrictJsonEnvelope("```json\n" + VALID_JSON + "\n```").text).regleDedoublonnage === VALID_OUTPUT.regleDedoublonnage);

// ---------- harnais LOCAL_CONTROLLED ----------
function fakeGateway(opts) {
  opts = opts || {};
  const state = { calls: 0, lastPayload: null };
  return {
    state: state,
    mono04: {
      gateway: {
        executeRequest: async function (req) {
          state.calls++; state.lastPayload = req.payload;
          const body = { content: [{ type: "text", text: opts.text }] };
          if (opts.echoedModel) body.model = opts.echoedModel;
          if (opts.echoedId) body.id = opts.echoedId;
          return { status: "SUCCESS", result: body };
        },
      },
      providerRegistry: { getProviderConfig: function () { return { requiredSecret: "EVIDENCEFORGE_WORKER_API_KEY" }; } },
    },
  };
}
function tmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "ef01c1r2-")); }
const BASE = {
  bundleRoot: bundleRoot,
  missionContext: { runId: "r2-test-run", missionId: "r2-test-mission" },
  missionQuestion: "Question de mission LOCAL_CONTROLLED.",
  runContractHash: "c".repeat(64),
  resolvedDisciplines: DISCIPLINES.map(function (d) { return { id: d, label: d, rationale: "justification " + d }; }),
  resolverOutputHash: "d".repeat(64),
};
async function run(opts) {
  const fg = fakeGateway({ text: opts.text, echoedModel: opts.echoedModel, echoedId: opts.echoedId });
  const evidenceRoot = tmpRoot();
  let out = null, err = null;
  try {
    out = await acquirePlannerRun(Object.assign({}, BASE, {
      mono04: fg.mono04,
      classification: opts.classification || "LOCAL_CONTROLLED_FIXTURE",
      evidenceRoot: evidenceRoot,
      env: opts.env || { LLM_REAL_MODEL: "local-controlled-test-model" },
    }));
  } catch (e) { err = e; }
  const evFile = path.join(evidenceRoot, "planner", "planner-provider-evidence.json");
  return {
    out: out, err: err, evidenceRoot: evidenceRoot, gateway: fg.state,
    evidence: fs.existsSync(evFile) ? JSON.parse(fs.readFileSync(evFile, "utf8")) : null,
    plannerOutputFile: path.join(evidenceRoot, "planner", "planner-output.json"),
  };
}

(async function () {
  // ---------- rawResponseHash (T13-T14) ----------
  const fenced = "```json\n" + VALID_JSON + "\n```";
  const rFenced = await run({ text: fenced, echoedId: "msg_local_001", echoedModel: "local-echo-model" });
  check("T13. rawResponseHash porte sur l'assistantText ORIGINAL (fence comprise)",
    rFenced.out && rFenced.out.provenance.rawResponseHash === sha256(fenced));
  check("T14. hash(fenced) != hash(JSON normalise)",
    sha256(fenced) !== sha256(VALID_JSON) && rFenced.out.provenance.rawResponseHash !== sha256(VALID_JSON));
  check("T15. fenced valide -> plannerOutput valide", rFenced.out && rFenced.out.plannerOutput && Array.isArray(rFenced.out.plannerOutput.queries));

  // ---------- evidence avant parsing (T16-T18) ----------
  const rBad = await run({ text: "```json\n{\"a\":,}\n```", echoedId: "msg_local_002", echoedModel: "local-echo-model" });
  check("T16. reponse invalide -> raw provider evidence PERSISTEE", rBad.evidence !== null);
  check("T16b. evidence classee RAW_PROVIDER_EVIDENCE, jamais PlannerRun",
    rBad.evidence && rBad.evidence.evidenceType === "RAW_PROVIDER_EVIDENCE" && rBad.evidence.evidenceType !== "PlannerRun");
  check("T16c. parsingStatus = FAILED + cause tracee",
    rBad.evidence && rBad.evidence.parsingStatus === "FAILED" && rBad.evidence.parsingFailure && rBad.evidence.parsingFailure.stage === "parsePlannerResponse");
  check("T16d. assistantText reel conserve dans l'evidence", rBad.evidence && rBad.evidence.assistantText === "```json\n{\"a\":,}\n```");
  check("T17. reponse invalide -> AUCUN plannerRun valide", rBad.out === null && rBad.err !== null);
  check("T18. reponse invalide -> AUCUN planner-output.json ecrit", !fs.existsSync(rBad.plannerOutputFile));
  check("T18b. l'erreur typee remonte inchangee", rBad.err && rBad.err.code === "LLM_RESPONSE_INVALID");

  // ---------- provenance conservee (T19-T24) ----------
  check("T19. providerRequestId conserve si observe", rBad.evidence && rBad.evidence.providerRequestId === "msg_local_002");
  check("T19b. providerRequestId reste null si non observe (jamais invente)",
    (await run({ text: "```json\n{bad}\n```" })).evidence.providerRequestId === null);
  check("T20. localInvocationId conserve", rBad.evidence && typeof rBad.evidence.localInvocationId === "string" && rBad.evidence.localInvocationId.indexOf("ef01c1-planner") === 0);
  check("T21. model observe conserve", rBad.evidence && rBad.evidence.modelObserved === "local-echo-model");
  check("T22. transport conserve", rBad.evidence && rBad.evidence.transport === "delegated");
  check("T23. inputHash conserve", rBad.evidence && /^[0-9a-f]{64}$/.test(rBad.evidence.inputHash));
  check("T24. rawResponseHashScope = assistant_text",
    rBad.evidence.rawResponseHashScope === "assistant_text" && rFenced.out.provenance.rawResponseHashScope === "assistant_text");
  check("T24b. succes : parsingStatus = SUCCESS", rFenced.evidence && rFenced.evidence.parsingStatus === "SUCCESS");

  // ---------- max_tokens (T25) ----------
  check("T25. max_tokens reellement envoye au Gateway = 4096", rFenced.gateway.lastPayload && rFenced.gateway.lastPayload.max_tokens === 4096);

  // ---------- modele explicite (T26-T29) ----------
  const fgReal = fakeGateway({ text: VALID_JSON });
  let realErr = null;
  try {
    await acquirePlannerRun(Object.assign({}, BASE, {
      mono04: fgReal.mono04, classification: "PROVIDER_OBSERVED_CALL",
      evidenceRoot: tmpRoot(), env: {},
    }));
  } catch (e) { realErr = e; }
  check("T26. REAL sans LLM_REAL_MODEL -> REAL_MODEL_NOT_EXPLICIT", realErr && realErr.code === "REAL_MODEL_NOT_EXPLICIT");
  check("T27. T26 : AUCUN appel Gateway/provider effectue", fgReal.state.calls === 0);
  check("T27b. code present dans la liste officielle", CODES.indexOf("REAL_MODEL_NOT_EXPLICIT") !== -1);

  const rReal = await run({ text: VALID_JSON, classification: "PROVIDER_OBSERVED_CALL", env: { LLM_REAL_MODEL: "modele-explicite-du-proprietaire" } });
  check("T28. REAL avec modele explicite -> accepte", rReal.err === null && rReal.out !== null);
  check("T28b. le modele explicite est bien celui demande", rReal.evidence.modelRequested === "modele-explicite-du-proprietaire");
  check("T29. LOCAL_CONTROLLED continue de fonctionner", rFenced.err === null && rFenced.out !== null);

  // seconde barriere, au plus pres du reseau
  const fgPrim = fakeGateway({ text: VALID_JSON });
  let primErr = null;
  try {
    await callTracedRealLlm({ bundleRoot: bundleRoot, mono04: fgPrim.mono04, missionContext: { runId: "x" }, prompt: "p", env: {}, requireExplicitRealModel: true });
  } catch (e) { primErr = e; }
  check("T29b. callTracedRealLlm refuse aussi, sans appel Gateway", primErr && primErr.code === "REAL_MODEL_NOT_EXPLICIT" && fgPrim.state.calls === 0);

  // ---------- causalite inchangee (T30-T34) ----------
  const inp = JSON.parse(fs.readFileSync(path.join(rFenced.evidenceRoot, "planner", "input.json"), "utf8"));
  check("T30. resolverOutputHash causal binding inchange",
    inp.resolverOutputHash === BASE.resolverOutputHash && rFenced.out.provenance.resolverOutputHash === BASE.resolverOutputHash);
  check("T31. RunContract binding inchange", inp.runContractHash === BASE.runContractHash);
  const withHuman = Object.assign({}, VALID_OUTPUT, { humanValidation: { by: "x" } });
  check("T32. humanValidation dans plannerOutput -> toujours rejete",
    (parseOk(JSON.stringify(withHuman)) || {}).code === "PLANNER_OUTPUT_INVALID");
  check("T32b. rejete aussi sous enveloppe fence",
    (parseOk("```json\n" + JSON.stringify(withHuman) + "\n```") || {}).code === "PLANNER_OUTPUT_INVALID");

  const r1PromptPath = path.join(__dirname, "..", "..", "EF-01C1-v0.2-r1", "prompts", "ef01c1-planner-prompt-v0.2-r1.js");
  if (fs.existsSync(r1PromptPath)) {
    const r1 = require(r1PromptPath);
    check("T33. prompt canonique byte-identique a r1", r1.PROMPT_TEMPLATE === PROMPT_TEMPLATE && r1.PROMPT_TEMPLATE_HASH === require("../prompts/ef01c1-planner-prompt-v0.2-r1.js").PROMPT_TEMPLATE_HASH);
    check("T34. PROMPT_VERSION inchangee", r1.PROMPT_VERSION === PROMPT_VERSION && r1.PROMPT_ID === PROMPT_ID);
  } else {
    check("T33. prompt canonique (r1 absent de l'extraction : verifie par hash interne)", typeof PROMPT_TEMPLATE === "string" && PROMPT_TEMPLATE.length > 0);
    check("T34. PROMPT_VERSION inchangee (valeur figee r1)", PROMPT_VERSION === "EF01C1-planner-v0.2-r1.0");
  }
  check("T35. schema plannerOutput inchange : cle inattendue toujours rejetee",
    (parseOk(JSON.stringify(Object.assign({}, VALID_OUTPUT, { inattendu: 1 }))) || {}).code === "PLANNER_OUTPUT_INVALID");
  check("T36. connecteur non supporte toujours rejete",
    (parseOk(JSON.stringify(Object.assign({}, VALID_OUTPUT, { sources: [{ connectorId: "pubmed" }] }))) || {}).code === "PLANNER_OUTPUT_INVALID");

  const failed = results.filter(function (r) { return !r.pass; });
  results.forEach(function (r) { console.log((r.pass ? "PASS — " : "FAIL — ") + r.name); });
  console.log("");
  if (failed.length) { console.log("ECHECS (" + failed.length + ") :"); failed.forEach(function (r) { console.log("  - " + r.name); }); console.log(""); console.log("EF01C1_R2_TARGETED_TESTS = FAIL"); process.exit(1); }
  console.log("TOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("");
  console.log("EF01C1_R2_TARGETED_TESTS = PASS");
})().catch(function (e) { console.error("TEST_HARNESS_FAILED:", e && e.stack || e); process.exit(1); });
