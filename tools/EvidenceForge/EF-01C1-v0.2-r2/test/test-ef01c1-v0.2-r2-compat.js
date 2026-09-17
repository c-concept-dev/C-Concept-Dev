"use strict";
// EF-01C1-v0.2-r1 — test/test-ef01c1-v0.2-r1.js — LOCAL_CONTROLLED, aucun
// reseau reel. argv[2] = bundleRoot.

const path = require("path");
const fs = require("fs");
const os = require("os");

const { acquirePlannerRun } = require("../lib/executor.js");
const { PROMPT_TEMPLATE, buildPlannerPrompt } = require("../prompts/ef01c1-planner-prompt-v0.2-r1.js");
const { loadHashDeps, computeInputHash, computeRawResponseHash, computeCanonicalContentHash } = require("../lib/hash.js");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function fakeGateway(opts) {
  opts = opts || {};
  let calls = 0;
  return {
    gateway: {
      executeRequest: async function () {
        calls++;
        const resultBody = { content: [{ type: "text", text: opts.text }] };
        if (opts.echoedModel) resultBody.model = opts.echoedModel;
        if (opts.echoedId) resultBody.id = opts.echoedId;
        return { status: "SUCCESS", result: resultBody };
      },
    },
    providerRegistry: {
      getProviderConfig: function (providerId) {
        if (providerId !== "llm-worker") throw new Error("provider inattendu: " + providerId);
        return { requiredSecret: opts.requiredSecret || "ANTHROPIC_API_KEY" };
      },
    },
    getCallCount: function () { return calls; },
  };
}

const RESOLVED_DISCIPLINES = [
  { id: "DIM_A", label: "Epidemiologie", rationale: "Directement pertinente pour la question de mission." },
  { id: "DIM_B", label: "Sciences cognitives", rationale: "Eclaire le mecanisme sous-jacent." },
];
const DISCIPLINE_IDS = RESOLVED_DISCIPLINES.map(function (d) { return d.id; });
const RESOLVER_OUTPUT_HASH_A = "1".repeat(64);
const RESOLVER_OUTPUT_HASH_B = "2".repeat(64);

function validPlannerJson() {
  return JSON.stringify({
    sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "Seul connecteur reellement cable." }],
    queries: DISCIPLINE_IDS.map(function (id) { return { discipline: id, connectorId: "openalex", requete: "requete reelle pour " + id, justification: "j" + id }; }),
    retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 3, maxResults: 75, stopCondition: "3 pages.", retryPolicy: "3 tentatives.", rateLimitPolicy: "1 req/s.", budgetMax: "75 resultats." }],
    criteresInclusion: ["Pertinence directe."],
    criteresExclusion: ["Hors champ."],
    regleDedoublonnage: "DOI, puis titre + auteur.",
    methodeQualification: "Lecture qualitative.",
  });
}

function baseOpts(bundleRoot, evidenceRoot, mono04, resolverOutputHash) {
  return {
    bundleRoot: bundleRoot,
    mono04: mono04,
    missionContext: { runId: "test-run", missionId: "test-mission-hash" },
    missionQuestion: "Question de test ?",
    runContractHash: "a".repeat(64),
    resolvedDisciplines: RESOLVED_DISCIPLINES,
    resolverOutputHash: resolverOutputHash || RESOLVER_OUTPUT_HASH_A,
    classification: "LOCAL_CONTROLLED_FIXTURE",
    evidenceRoot: evidenceRoot,
    env: { LLM_REAL_MODEL: "claude-test-model" },
  };
}

(async () => {
  const bundleRoot = process.argv[2] || process.env.EVIDENCEFORGE_R6_BUNDLE_ROOT;
  if (!bundleRoot) { console.error("bundleRoot requis (argv[2] ou EVIDENCEFORGE_R6_BUNDLE_ROOT)."); process.exit(2); }
  const workRoot = path.join(os.tmpdir(), "ef01c1-v02-r1-test-" + Date.now());

  const p1 = buildPlannerPrompt({ missionQuestion: "Q", resolvedDisciplines: RESOLVED_DISCIPLINES, resolverOutputHash: RESOLVER_OUTPUT_HASH_A });
  const p2 = buildPlannerPrompt({ missionQuestion: "Q", resolvedDisciplines: RESOLVED_DISCIPLINES, resolverOutputHash: RESOLVER_OUTPUT_HASH_A });
  check("T01. prompt stable -> texte identique pour memes entrees", p1 === p2);

  const hashDeps = loadHashDeps(bundleRoot);
  const h1 = await computeInputHash(hashDeps, { stage: "EF-01C1", prompt: p1 });
  const h2 = await computeInputHash(hashDeps, { stage: "EF-01C1", prompt: p1 });
  check("T01b. inputHash stable pour un objet canonique identique", h1 === h2);

  // === F-07 : contenu resolver different (meme count) -> prompt ET inputHash differents ===
  const differentRationaleDisciplines = [
    { id: "DIM_A", label: "Epidemiologie", rationale: "Justification COMPLETEMENT DIFFERENTE." },
    { id: "DIM_B", label: "Sciences cognitives", rationale: "Autre rationale, meme discipline, meme count." },
  ];
  const p3 = buildPlannerPrompt({ missionQuestion: "Q", resolvedDisciplines: differentRationaleDisciplines, resolverOutputHash: RESOLVER_OUTPUT_HASH_B });
  check("T-F07-02. meme count de disciplines, contenu resolver different -> texte de prompt different", p1 !== p3);
  const h3 = await computeInputHash(hashDeps, { stage: "EF-01C1", prompt: p3 });
  check("T-F07-01. meme count de disciplines, contenu resolver different -> inputHash different", h1 !== h3);

  // Meme si (hypothese) le texte de rationale coincidait, resolverOutputHash seul suffit a distinguer :
  const pSameTextDifferentHash1 = buildPlannerPrompt({ missionQuestion: "Q", resolvedDisciplines: RESOLVED_DISCIPLINES, resolverOutputHash: RESOLVER_OUTPUT_HASH_A });
  const pSameTextDifferentHash2 = buildPlannerPrompt({ missionQuestion: "Q", resolvedDisciplines: RESOLVED_DISCIPLINES, resolverOutputHash: RESOLVER_OUTPUT_HASH_B });
  check("T-F07-01b. meme texte de rationale, seul resolverOutputHash differe -> prompt (et donc inputHash) differe quand meme", pSameTextDifferentHash1 !== pSameTextDifferentHash2);

  const rh1 = await computeRawResponseHash(hashDeps, validPlannerJson());
  const rh2 = await computeRawResponseHash(hashDeps, validPlannerJson() + " ");
  check("T03. reponse brute modifiee -> rawResponseHash different", rh1 !== rh2);

  // === JSON valide ===
  {
    const evidenceRoot = path.join(workRoot, "case-valid");
    const mono04 = fakeGateway({ text: validPlannerJson() });
    const out = await acquirePlannerRun(baseOpts(bundleRoot, evidenceRoot, mono04));
    check("T04. JSON valide -> plannerRun/plannerOutput produits sans exception", !!out.plannerRun && !!out.plannerOutput);
    check("T04b. plannerRun ne porte que la provenance de l'appel", Object.keys(out.plannerRun).sort().join(",") === ["date", "inputHash", "model", "promptVersion", "provider", "rawResponseHash"].sort().join(","));
    check("T09. classification LOCAL_CONTROLLED clairement portee", out.provenance.classification === "LOCAL_CONTROLLED_FIXTURE");
    check("T-F05-01. rawResponseHashScope = \"assistant_text\" (F-05)", out.provenance.rawResponseHashScope === "assistant_text");
    check("T-F07-03. provenance porte le resolverOutputHash utilise (F-07, tracable)", out.provenance.resolverOutputHash === RESOLVER_OUTPUT_HASH_A);

    const evidenceFiles = fs.readdirSync(out.evidenceDir).map(function (f) { return fs.readFileSync(path.join(out.evidenceDir, f), "utf8"); }).join("\n");
    check("T07. aucune reference a une valeur de secret dans l'evidence ecrite", !/sk-ant-[A-Za-z0-9]/.test(evidenceFiles));
  }

  // === JSON invalide -> fail closed ===
  {
    const evidenceRoot = path.join(workRoot, "case-invalid-json");
    const mono04 = fakeGateway({ text: "ceci n'est pas du JSON" });
    let threw = null;
    try { await acquirePlannerRun(baseOpts(bundleRoot, evidenceRoot, mono04)); } catch (e) { threw = e; }
    check("T05. reponse non-JSON -> fail closed (LLM_RESPONSE_INVALID)", !!threw && threw.code === "LLM_RESPONSE_INVALID");
  }
  {
    const evidenceRoot = path.join(workRoot, "case-human-validation-forbidden");
    const raw = JSON.parse(validPlannerJson());
    raw.humanValidation = { validatedAt: new Date().toISOString(), commentaire: "Fabrique par le LLM." };
    const mono04 = fakeGateway({ text: JSON.stringify(raw) });
    let threw = null;
    try { await acquirePlannerRun(baseOpts(bundleRoot, evidenceRoot, mono04)); } catch (e) { threw = e; }
    check("T05e. humanValidation dans la reponse LLM -> fail closed (jamais un acte humain synthetise)", !!threw && threw.code === "PLANNER_OUTPUT_INVALID");
  }

  // === F-03 : model observe, jamais declaratif ===
  {
    const evidenceRoot = path.join(workRoot, "case-model-echoed");
    const mono04 = fakeGateway({ text: validPlannerJson(), echoedModel: "claude-echoed-y" });
    const opts = Object.assign({}, baseOpts(bundleRoot, evidenceRoot, mono04), { env: { LLM_REAL_MODEL: "claude-env-resolved-x" } });
    const out = await acquirePlannerRun(opts);
    check("T-F03-01. modele observe (echo provider) prime sur la resolution locale", out.provenance.model === "claude-echoed-y");
  }
  {
    const evidenceRoot = path.join(workRoot, "case-model-mismatch");
    const mono04 = fakeGateway({ text: validPlannerJson(), echoedModel: "claude-echoed-y" });
    const opts = Object.assign({}, baseOpts(bundleRoot, evidenceRoot, mono04), { declaredModel: "claude-declared-wrong" });
    let threw = null;
    try { await acquirePlannerRun(opts); } catch (e) { threw = e; }
    check("T-F03-02. modele declare divergent -> fail closed (MODEL_PROVENANCE_MISMATCH)", !!threw && threw.code === "MODEL_PROVENANCE_MISMATCH");
  }

  // === F-04 : transport observe ===
  {
    const evidenceRoot = path.join(workRoot, "case-transport-delegated");
    const mono04 = fakeGateway({ text: validPlannerJson(), requiredSecret: "EVIDENCEFORGE_WORKER_API_KEY" });
    const out = await acquirePlannerRun(baseOpts(bundleRoot, evidenceRoot, mono04));
    check("T-F04-01. transport observe = mode d'authentification reellement configure (delegated)", out.provenance.transport === "delegated");
  }
  {
    const evidenceRoot = path.join(workRoot, "case-transport-mismatch");
    const mono04 = fakeGateway({ text: validPlannerJson(), requiredSecret: "EVIDENCEFORGE_WORKER_API_KEY" });
    const opts = Object.assign({}, baseOpts(bundleRoot, evidenceRoot, mono04), { declaredTransport: "direct" });
    let threw = null;
    try { await acquirePlannerRun(opts); } catch (e) { threw = e; }
    check("T-F04-01b. transport declare contredisant la config reelle -> fail closed (TRANSPORT_PROVENANCE_MISMATCH)", !!threw && threw.code === "TRANSPORT_PROVENANCE_MISMATCH");
  }

  // === F-06 : localInvocationId != providerRequestId ===
  {
    const evidenceRoot = path.join(workRoot, "case-provider-id-present");
    const mono04 = fakeGateway({ text: validPlannerJson(), echoedId: "msg_real_provider_id_456" });
    const out = await acquirePlannerRun(baseOpts(bundleRoot, evidenceRoot, mono04));
    check("T-F06-01. providerRequestId observe distinct de localInvocationId", out.provenance.providerRequestId === "msg_real_provider_id_456" && out.provenance.localInvocationId !== out.provenance.providerRequestId);
  }
  {
    const evidenceRoot = path.join(workRoot, "case-provider-id-absent");
    const mono04 = fakeGateway({ text: validPlannerJson() });
    const out = await acquirePlannerRun(baseOpts(bundleRoot, evidenceRoot, mono04));
    check("T-F06-02. providerRequestId absent -> null, localInvocationId present", out.provenance.providerRequestId === null && !!out.provenance.localInvocationId);
  }

  // === Compatibilite structurelle v0.1 (bout-en-bout jusqu'au SearchProtocol fige) ===
  {
    const eforchArtifacts = require(path.join(bundleRoot, "MONO-08", "v0.6", "lib", "eforch-artifacts.js"));
    const { validateRealPlannerRunFields, buildSearchProtocolForMission, loadEForchDeps } = eforchArtifacts;
    const evidenceRoot = path.join(workRoot, "case-v01-compat");
    const mono04 = fakeGateway({ text: validPlannerJson() });
    const out = await acquirePlannerRun(baseOpts(bundleRoot, evidenceRoot, mono04));

    const missing = validateRealPlannerRunFields(out.plannerRun);
    check("T10. STRUCTURAL_COMPATIBILITY_V01 : validateRealPlannerRunFields() accepte le plannerRun produit", missing.length === 0, JSON.stringify(missing));

    const humanValidation = { validatedAt: new Date().toISOString(), commentaire: "Revue humaine reelle simulee par le test (LOCAL_CONTROLLED)." };
    const deps = loadEForchDeps(path.join(bundleRoot, "MONO-01"));
    const protocol = await buildSearchProtocolForMission(
      deps, "test-mission-hash", "s1", DISCIPLINE_IDS,
      { mode: "REAL", plannerRun: out.plannerRun, plannerOutput: out.plannerOutput, humanValidation: humanValidation }
    );
    const { assertSearchProtocolFrozenAndValid } = require(path.join(bundleRoot, "MONO-01", "dependencies", "ef-orch-ef01c1-planner-trace-v0.1.js"));
    let assertThrew = null;
    try { await assertSearchProtocolFrozenAndValid(protocol); } catch (e) { assertThrew = e; }
    check("T10b. STRUCTURAL_COMPATIBILITY_V01 : assertSearchProtocolFrozenAndValid() (MONO-01, v0.1, gele) accepte le SearchProtocol construit", assertThrew === null, assertThrew && assertThrew.message);
  }

  const passed = results.every(function (r) { return r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("\n" + (passed ? "EF01C1_V02_R1_TESTS = PASS" : "EF01C1_V02_R1_TESTS = FAIL"));
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
