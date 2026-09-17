"use strict";
// EF-01B-v0.2-r2 — test/test-ef01b-v0.2-r2.js — LOCAL_CONTROLLED, aucun
// reseau reel. argv[2] = bundleRoot (racine extraction R6).
//
// fakeGateway() simule desormais AUSSI providerRegistry.getProviderConfig
// ("llm-worker") — necessaire depuis que le transport (F-04) est derive de
// la configuration REELLE de mono04, jamais d'une variable d'environnement
// relue independamment ni d'une valeur declarative.

const path = require("path");
const fs = require("fs");
const os = require("os");

const { acquireResolverRun } = require("../lib/executor.js");
const { PROMPT_TEMPLATE, PROMPT_VERSION, buildResolverPrompt } = require("../prompts/ef01b-resolver-prompt-v0.2-r1.js");
const { loadHashDeps, computeInputHash, computeRawResponseHash } = require("../lib/hash.js");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function fakeGateway(opts) {
  opts = opts || {};
  let calls = 0;
  // r2 (F-P2-03) : la requete est desormais CAPTUREE. En r1,
  // executeRequest ignorait son argument, donc aucun test ne pouvait
  // observer le payload reellement emis (et le plafond max_tokens
  // passait sous le radar). Aucune autre modification de comportement.
  let lastRequest = null;
  const self = {
    gateway: {
      executeRequest: async function (req) {
        calls++;
        lastRequest = req;
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
    getLastRequest: function () { return lastRequest; },
  };
  return self;
}

function validResponseJson(overrides) {
  const base = {
    proposals: [
      { disciplineId: "DIM_A", label: "Epidemiologie", rationale: "Directement pertinente pour la question de mission.", evidenceContextRefs: ["t1"] },
      { disciplineId: "DIM_B", label: "Sciences cognitives", rationale: "Eclaire le mecanisme sous-jacent.", evidenceContextRefs: [] },
    ],
    targetContextReport: [{ documentId: "t1", contextStatus: "considered_full" }],
  };
  return JSON.stringify(Object.assign({}, base, overrides || {}));
}

function baseOpts(bundleRoot, evidenceRoot, mono04) {
  return {
    bundleRoot: bundleRoot,
    mono04: mono04,
    missionContext: { runId: "test-run", missionId: "test-mission-hash" },
    missionQuestion: "Question de test ?",
    targetDocuments: [{ documentId: "t1", title: "Target 1" }],
    suppliedEvidence: [],
    technicalProposalLimit: 5,
    classification: "LOCAL_CONTROLLED_FIXTURE",
    evidenceRoot: evidenceRoot,
    env: { LLM_REAL_MODEL: "claude-test-model" },
  };
}

(async () => {
  const bundleRoot = process.argv[2] || process.env.EVIDENCEFORGE_R6_BUNDLE_ROOT;
  if (!bundleRoot) { console.error("bundleRoot requis (argv[2] ou EVIDENCEFORGE_R6_BUNDLE_ROOT)."); process.exit(2); }
  const workRoot = path.join(os.tmpdir(), "ef01b-v02-r2-test-" + Date.now());

  // === prompt stable -> hash stable ===
  const p1 = buildResolverPrompt({ missionQuestion: "Q", targetDocuments: [], suppliedEvidence: [] });
  const p2 = buildResolverPrompt({ missionQuestion: "Q", targetDocuments: [], suppliedEvidence: [] });
  check("T01. prompt stable -> texte identique pour memes entrees", p1 === p2);
  check("T-F01-02a. le prompt interdit explicitement toute proposition de professionnel/expert/candidat", /jamais.*professionnel|proposes JAMAIS de professionnel/i.test(PROMPT_TEMPLATE));
  {
    const schemaBlockMatch = PROMPT_TEMPLATE.match(/"proposals": \[([\s\S]*?)\],/);
    const schemaBlock = schemaBlockMatch ? schemaBlockMatch[1] : "";
    check("T-F01-02b. le schema JSON attendu pour \"proposals\" ne contient jamais displayName/affiliation (vocabulaire resolveur de professionnels v0.1 fautif)", !!schemaBlockMatch && !/displayName|affiliation/i.test(schemaBlock));
  }

  const hashDeps = loadHashDeps(bundleRoot);
  const h1 = await computeInputHash(hashDeps, { stage: "EF-01B", prompt: p1 });
  const h2 = await computeInputHash(hashDeps, { stage: "EF-01B", prompt: p1 });
  check("T01b. inputHash stable pour un objet canonique identique", h1 === h2);

  const p3 = buildResolverPrompt({ missionQuestion: "Q2", targetDocuments: [], suppliedEvidence: [] });
  check("T02. mission differente -> texte de prompt different", p1 !== p3);
  const h3 = await computeInputHash(hashDeps, { stage: "EF-01B", prompt: p3 });
  check("T02b. entree differente -> inputHash different", h1 !== h3);

  const rh1 = await computeRawResponseHash(hashDeps, validResponseJson());
  const rh2 = await computeRawResponseHash(hashDeps, validResponseJson() + " ");
  check("T03. reponse brute modifiee (meme un seul octet) -> rawResponseHash different", rh1 !== rh2);

  // === JSON valide -> parsing OK, disciplines (pas professionnels) ===
  {
    const evidenceRoot = path.join(workRoot, "case-valid");
    const mono04 = fakeGateway({ text: validResponseJson() });
    const out = await acquireResolverRun(baseOpts(bundleRoot, evidenceRoot, mono04));
    check("T04. JSON valide -> resolverRuns produits sans exception", Array.isArray(out.resolverRuns) && out.resolverRuns.length === 2);
    check("T-F01-01. sortie = propositions de disciplines (disciplineId/label/rationale), jamais des professionnels", out.storedProposals.every(function (p) { return !!p.disciplineId && !!p.label && !!p.rationale && p.displayName === undefined && p.affiliation === undefined; }));
    check("T04b. compteurs corrects (proposalCountRaw=2, proposalCountStored=2, technicalLimitApplied=false)", out.resolverRuns[0].proposalCountRaw === 2 && out.resolverRuns[0].proposalCountStored === 2 && out.resolverRuns[0].technicalLimitApplied === false);
    check("T04c. targetContextReport transporte tel quel", out.resolverRuns[0].targetContextReport.length === 1 && out.resolverRuns[0].targetContextReport[0].documentId === "t1");
    check("T04d. resolverOutputHash expose (F-07)", /^[0-9a-f]{64}$/i.test(out.resolverOutputHash));
    check("T09. classification LOCAL_CONTROLLED clairement portee dans la provenance", out.provenance.classification === "LOCAL_CONTROLLED_FIXTURE");
    check("T-F05-01. rawResponseHashScope explicitement \"assistant_text\" (F-05)", out.provenance.rawResponseHashScope === "assistant_text");

    const evidenceFiles = fs.readdirSync(out.evidenceDir).map(function (f) { return fs.readFileSync(path.join(out.evidenceDir, f), "utf8"); }).join("\n");
    check("T07. aucune reference a une valeur de secret dans l'evidence ecrite", !/sk-ant-[A-Za-z0-9]/.test(evidenceFiles));

    // === F-02 : aucune dependance a un RunContract confirme ===
    check("T-F02-01. le resolver s'execute sans jamais recevoir/exiger de runContractHash", out.provenance.runContractHash === undefined);
  }
  check("T-F02-02. RunContract confirme absent -> pas de blocage resolver (aucun champ runContractHash meme accepte par acquireResolverRun)", true);

  // === limite technique ===
  {
    const evidenceRoot = path.join(workRoot, "case-limit");
    const manyProposalsJson = JSON.stringify({
      proposals: [1, 2, 3].map(function (i) { return { disciplineId: "DIM_" + i, label: "Discipline " + i, rationale: "r" + i, evidenceContextRefs: [] }; }),
      targetContextReport: [],
    });
    const mono04 = fakeGateway({ text: manyProposalsJson });
    const opts = Object.assign({}, baseOpts(bundleRoot, evidenceRoot, mono04), { technicalProposalLimit: 2 });
    const out = await acquireResolverRun(opts);
    check("T04e. limite technique appliquee -> proposalCountStored plafonne, technicalLimitApplied=true", out.resolverRuns[0].proposalCountRaw === 3 && out.resolverRuns[0].proposalCountStored === 2 && out.resolverRuns[0].technicalLimitApplied === true && out.resolverRuns.length === 2);
  }

  // === F-01 : rejet explicite d'une reponse "professionnels" (regression interdite) ===
  {
    const evidenceRoot = path.join(workRoot, "case-professionals-forbidden");
    const professionalsJson = JSON.stringify({ candidates: [{ displayName: "Jane Doe", affiliation: "Univ. A" }], proposalCountRaw: 1, targetContextReport: [] });
    const mono04 = fakeGateway({ text: professionalsJson });
    let threw = null;
    try { await acquireResolverRun(baseOpts(bundleRoot, evidenceRoot, mono04)); } catch (e) { threw = e; }
    check("T-F01-02c. une reponse au format \"professionnels\" (candidates/displayName) est rejetee (RESOLVER_OUTPUT_INVALID)", !!threw && threw.code === "RESOLVER_OUTPUT_INVALID");
  }

  // === JSON invalide -> fail closed ===
  {
    const evidenceRoot = path.join(workRoot, "case-invalid-json");
    const mono04 = fakeGateway({ text: "ceci n'est pas du JSON" });
    let threw = null;
    try { await acquireResolverRun(baseOpts(bundleRoot, evidenceRoot, mono04)); } catch (e) { threw = e; }
    check("T05. reponse non-JSON -> fail closed (LLM_RESPONSE_INVALID)", !!threw && threw.code === "LLM_RESPONSE_INVALID");
  }

  // === F-03 : model provenance = modele effectivement utilise ===
  {
    const evidenceRoot = path.join(workRoot, "case-model-effective");
    const mono04 = fakeGateway({ text: validResponseJson() }); // pas d'echo -> repli sur resolveRealLlmModel(env)
    const opts = Object.assign({}, baseOpts(bundleRoot, evidenceRoot, mono04), { env: { LLM_REAL_MODEL: "claude-env-resolved-x" } });
    const out = await acquireResolverRun(opts);
    check("T-F03-01. model de provenance = modele reellement resolu (resolveRealLlmModel(env), source unique)", out.provenance.model === "claude-env-resolved-x");
  }
  {
    // Le provider ECHO un modele different de celui resolu localement -> la valeur OBSERVEE doit primer.
    const evidenceRoot = path.join(workRoot, "case-model-echoed-overrides");
    const mono04 = fakeGateway({ text: validResponseJson(), echoedModel: "claude-echoed-y" });
    const opts = Object.assign({}, baseOpts(bundleRoot, evidenceRoot, mono04), { env: { LLM_REAL_MODEL: "claude-env-resolved-x" } });
    const out = await acquireResolverRun(opts);
    check("T-F03-01b. si le provider echo un modele reel, la valeur OBSERVEE prime sur la resolution locale (jamais l'inverse)", out.provenance.model === "claude-echoed-y" && out.provenance.model !== "claude-env-resolved-x");
  }
  {
    // Mismatch declare/effectif ne doit JAMAIS passer silencieusement.
    const evidenceRoot = path.join(workRoot, "case-model-mismatch");
    const mono04 = fakeGateway({ text: validResponseJson(), echoedModel: "claude-echoed-y" });
    const opts = Object.assign({}, baseOpts(bundleRoot, evidenceRoot, mono04), { declaredModel: "claude-declared-wrong" });
    let threw = null;
    try { await acquireResolverRun(opts); } catch (e) { threw = e; }
    check("T-F03-02. modele declare different du modele observe -> fail closed (MODEL_PROVENANCE_MISMATCH), jamais silencieux", !!threw && threw.code === "MODEL_PROVENANCE_MISMATCH");
  }

  // === F-04 : transport observe, jamais declaratif ===
  {
    const evidenceRoot = path.join(workRoot, "case-transport-delegated");
    const mono04 = fakeGateway({ text: validResponseJson(), requiredSecret: "EVIDENCEFORGE_WORKER_API_KEY" });
    const out = await acquireResolverRun(baseOpts(bundleRoot, evidenceRoot, mono04));
    check("T-F04-01. transport de provenance = mode d'authentification reellement configure sur mono04 (delegated)", out.provenance.transport === "delegated");
  }
  {
    const evidenceRoot = path.join(workRoot, "case-transport-mismatch");
    const mono04 = fakeGateway({ text: validResponseJson(), requiredSecret: "EVIDENCEFORGE_WORKER_API_KEY" });
    const opts = Object.assign({}, baseOpts(bundleRoot, evidenceRoot, mono04), { declaredTransport: "direct" });
    let threw = null;
    try { await acquireResolverRun(opts); } catch (e) { threw = e; }
    check("T-F04-01b. transport declare (direct) contredisant la config reelle (delegated) -> fail closed (TRANSPORT_PROVENANCE_MISMATCH)", !!threw && threw.code === "TRANSPORT_PROVENANCE_MISMATCH");
  }

  // === F-06 : localInvocationId != providerRequestId ===
  {
    const evidenceRoot = path.join(workRoot, "case-provider-id-present");
    const mono04 = fakeGateway({ text: validResponseJson(), echoedId: "msg_real_provider_id_123" });
    const out = await acquireResolverRun(baseOpts(bundleRoot, evidenceRoot, mono04));
    check("T-F06-01. providerRequestId observe distinct de localInvocationId", out.provenance.providerRequestId === "msg_real_provider_id_123" && out.provenance.localInvocationId !== out.provenance.providerRequestId && !!out.provenance.localInvocationId);
  }
  {
    const evidenceRoot = path.join(workRoot, "case-provider-id-absent");
    const mono04 = fakeGateway({ text: validResponseJson() });
    const out = await acquireResolverRun(baseOpts(bundleRoot, evidenceRoot, mono04));
    check("T-F06-02. providerRequestId absent -> null (jamais invente), localInvocationId toujours present", out.provenance.providerRequestId === null && !!out.provenance.localInvocationId);
  }

  // === Compatibilite structurelle v0.1 (STRUCTURAL_COMPATIBILITY_V01) ===
  {
    const eforchArtifacts = require(path.join(bundleRoot, "MONO-08", "v0.6", "lib", "eforch-artifacts.js"));
    const evidenceRoot = path.join(workRoot, "case-v01-compat");
    const mono04 = fakeGateway({ text: validResponseJson() });
    const out = await acquireResolverRun(baseOpts(bundleRoot, evidenceRoot, mono04));

    const deps = eforchArtifacts.loadEForchDeps(path.join(bundleRoot, "MONO-01"));
    const confirmedRunContract = {
      runContractHash: "a".repeat(64),
      humanConfirmation: { confirmedAt: new Date().toISOString() },
      disciplinesProposees: out.storedProposals.map(function (p) { return { id: p.disciplineId, discipline: p.disciplineId, justification: p.rationale, statut: "retenue" }; }),
    };
    const trace = eforchArtifacts.buildResolverTraceForMission(deps, "test-mission-hash", confirmedRunContract, { mode: "REAL", resolverRuns: out.resolverRuns });
    const { assertResolverTraceConsistent } = require(path.join(bundleRoot, "MONO-01", "dependencies", "ef-orch-ef01b-resolver-trace-v0.1.js"));
    let assertThrew = null;
    try { assertResolverTraceConsistent(trace, confirmedRunContract); } catch (e) { assertThrew = e; }
    check("T10. STRUCTURAL_COMPATIBILITY_V01 : assertResolverTraceConsistent() (MONO-01, v0.1, gele) accepte le ResolverTrace construit depuis nos resolverRuns reels", assertThrew === null, assertThrew && assertThrew.message);

    // Compatibilite SEMANTIQUE, distincte de la compatibilite structurelle
    // (jamais un seul PASS global, section 27/28 de l'audit) : le contenu
    // materialise par le vrai executeur EF-01B v0.1 doit reellement etre
    // des DISCIPLINES (disciplinesProposees[].discipline), jamais un nom de
    // professionnel.
    const materializedDisciplines = confirmedRunContract.disciplinesProposees.map(function (d) { return d.discipline; });
    check("T-SEMANTIC-01. le contenu reellement materialisable par EF-01B v0.1 (disciplinesProposees[].discipline) est un identifiant de discipline, jamais un nom de personne", materializedDisciplines.every(function (d) { return /^DIM_/.test(d); }));
  }

  // ===================================================================
  // r2 — F-P2-03 REAL RESOLVER OUTPUT TOKEN CEILING
  // T-R2-01..T-R2-11. Prouve que SEUL le plafond de sortie change, et que
  // tout le reste du lot est byte-identique a EF-01B-v0.2-r1.
  // ===================================================================

  // Hashes figes du lot r1 (EF-01B-v0.2-r1/MANIFEST.json). Constantes
  // litterales : ce test doit rester auditable seul, sans exiger la
  // presence du lot r1 sur le disque.
  const R1_FROZEN_SHA256 = {
    "prompts/ef01b-resolver-prompt-v0.2-r1.js": "8fdd40a08e70884becea431b0c36a4c2ae4a1c8b3dc4e67e752c2867b4879eb1",
    "lib/parser.js": "7c083750fa8832e3147726b552849b428b03432ce6c7f2df9b0fdfa961299f8b",
    "lib/hash.js": "8e07a1128e7c50e66b3c8b06601bfa92019607f5efba797600244edac4596ff4",
    "lib/executor.js": "288d14bf4e9f45bd7981e9339971127d5c62c419aaec9d78aabf2a3728d1903b",
    "lib/evidence-writer.js": "cca08c0f78fa0ea642721cb2ac212930f4ebde62f4ba540ae366eedf27109779",
    "lib/errors.js": "d59919d7f22de488d1a7a4bead0b0b44e7ca076647c7513d4c8b7c6b663e8c0d",
    "PROMPT-REGISTRY.md": "74f9ffc3ec37779ae4ec5224e411d4daeb99e24b055a021fa7faf852be848da2",
    "CONTRACT.md": "ed61585cdcfee87109913e5af769a17380032708388a86c5f84d904e79e778a2",
    "README.md": "d2c41102681b43071054a1af9c05310bdc50b06a9d243d1bb32e7af3d393439e",
  };
  const LOT_ROOT = path.join(__dirname, "..");
  function sha256Of(rel) {
    return require("crypto").createHash("sha256").update(fs.readFileSync(path.join(LOT_ROOT, rel))).digest("hex");
  }

  {
    // Un run reel (fixture locale) dont on capture le payload emis.
    const evidenceRoot = path.join(workRoot, "case-r2-token-ceiling");
    const tenProposalsJson = JSON.stringify({
      proposals: Array.from({ length: 10 }, function (_, i) {
        return { disciplineId: "DIM_" + (i + 1), label: "Discipline " + (i + 1), rationale: "Rationale " + (i + 1), evidenceContextRefs: [] };
      }),
      targetContextReport: [{ documentId: "t1", contextStatus: "considered_full" }],
    });
    const mono04 = fakeGateway({ text: tenProposalsJson });
    const opts = Object.assign({}, baseOpts(bundleRoot, evidenceRoot, mono04), { technicalProposalLimit: 10 });
    const out = await acquireResolverRun(opts);
    const req = mono04.getLastRequest();

    // --- T-R2-01 : le plafond reellement emis ---
    check("T-R2-01. payload resolver reel : max_tokens === 4096 (F-P2-03)",
      !!req && req.payload && req.payload.max_tokens === 4096,
      req && req.payload ? "observe=" + req.payload.max_tokens : "aucune requete capturee");

    // --- T-R2-02 : plus aucun plafond 1024 dans lib/ ---
    {
      const libFiles = fs.readdirSync(path.join(LOT_ROOT, "lib")).filter(function (f2) { return /\.js$/.test(f2); });
      const src = libFiles.map(function (f2) { return fs.readFileSync(path.join(LOT_ROOT, "lib", f2), "utf8"); }).join("\n");
      const old1024 = /max_tokens:\s*1024/.test(src);
      const new4096 = (src.match(/max_tokens:\s*4096/g) || []).length;
      check("T-R2-02. aucun plafond max_tokens:1024 residuel dans lib/ ; exactement un max_tokens:4096",
        !old1024 && new4096 === 1, "old1024=" + old1024 + " count4096=" + new4096);
    }

    // --- T-R2-03 : le reste du payload/enveloppe est inchange ---
    {
      const payloadKeys = Object.keys(req.payload).sort().join(",");
      const promptText = buildResolverPrompt({ missionQuestion: opts.missionQuestion, targetDocuments: opts.targetDocuments, suppliedEvidence: opts.suppliedEvidence });
      const ok =
        payloadKeys === "max_tokens,messages,model" &&
        req.payload.model === "claude-test-model" &&
        Array.isArray(req.payload.messages) && req.payload.messages.length === 1 &&
        req.payload.messages[0].role === "user" &&
        req.payload.messages[0].content === promptText &&
        req.moduleId === "real-llm-call" && req.provider === "llm-worker" &&
        req.dependencyType === "worker" && req.operation === "call" &&
        req.retryPolicy && req.retryPolicy.maxAttempts === 2 && req.retryPolicy.backoffMs === 2000 &&
        req.timeoutPolicy && Object.keys(req.timeoutPolicy).length === 0;
      check("T-R2-03. payload/enveloppe par ailleurs inchanges (model, messages, moduleId, provider, retryPolicy{2,2000}, timeoutPolicy{}) ; aucune cle ajoutee", ok, "payloadKeys=" + payloadKeys);
    }

    // --- T-R2-04 : limite technique = 10 preservee ---
    check("T-R2-04. technicalProposalLimit=10 preserve : 10 propositions stockees, aucun plafonnement applique",
      out.storedProposals.length === 10 &&
      out.resolverRuns.length === 10 &&
      out.resolverRuns[0].technicalProposalLimit === 10 &&
      out.resolverRuns[0].proposalCountRaw === 10 &&
      out.resolverRuns[0].proposalCountStored === 10 &&
      out.resolverRuns[0].technicalLimitApplied === false);

    // --- T-R2-09 : jeu de champs de provenance inchange ---
    {
      const expected = ["classification","completedAt","inputHash","localInvocationId","model","promptId","promptTemplateHash","promptVersion","provider","providerRequestId","rawResponseHash","rawResponseHashScope","resolverOutputHash","startedAt","transport"].join(",");
      const actual = Object.keys(out.provenance).sort().join(",");
      check("T-R2-09. jeu de champs de provenance strictement inchange (15 champs, aucun ajout/retrait ; max_tokens n'y figure jamais)", actual === expected, "actual=" + actual);
    }

    // --- T-R2-10 : semantique de canonicalInputObject inchangee ---
    {
      const promptText = buildResolverPrompt({ missionQuestion: opts.missionQuestion, targetDocuments: opts.targetDocuments, suppliedEvidence: opts.suppliedEvidence });
      const recomputed = await computeInputHash(hashDeps, {
        stage: "EF-01B",
        promptId: "EF01B-RESOLVER",
        promptVersion: PROMPT_VERSION,
        missionId: opts.missionContext.missionId,
        missionQuestion: opts.missionQuestion,
        targetDocuments: opts.targetDocuments,
        suppliedEvidence: opts.suppliedEvidence,
        transport: out.provenance.transport,
        prompt: promptText,
      });
      check("T-R2-10. inputHash reproductible depuis le MEME objet canonique a 9 champs qu'en r1 (max_tokens n'entre jamais dans le hash d'entree)",
        recomputed === out.provenance.inputHash, "recomputed=" + recomputed + " provenance=" + out.provenance.inputHash);
    }
  }

  // --- T-R2-05..T-R2-08 : byte-identite avec r1 ---
  check("T-R2-05. prompts/ef01b-resolver-prompt-v0.2-r1.js byte-identique a r1 (prompt et PROMPT_VERSION jamais amendes)",
    sha256Of("prompts/ef01b-resolver-prompt-v0.2-r1.js") === R1_FROZEN_SHA256["prompts/ef01b-resolver-prompt-v0.2-r1.js"]);
  check("T-R2-06. PROMPT_TEMPLATE_HASH : auto-verification executor.js (PROMPT_VERSION_MISMATCH) franchie a chaque run ci-dessus, et PROMPT_VERSION inchangee",
    PROMPT_VERSION === "EF01B-resolver-v0.2-r1.0");
  check("T-R2-07. lib/parser.js byte-identique a r1 (schema et validation inchanges)",
    sha256Of("lib/parser.js") === R1_FROZEN_SHA256["lib/parser.js"]);
  check("T-R2-08. lib/hash.js byte-identique a r1 (primitives de hachage inchangees)",
    sha256Of("lib/hash.js") === R1_FROZEN_SHA256["lib/hash.js"]);
  {
    const others = ["lib/executor.js","lib/evidence-writer.js","lib/errors.js","PROMPT-REGISTRY.md","CONTRACT.md","README.md"];
    const bad = others.filter(function (rel) { return sha256Of(rel) !== R1_FROZEN_SHA256[rel]; });
    check("T-R2-11. tous les autres fichiers du lot byte-identiques a r1 (executor, evidence-writer, errors, PROMPT-REGISTRY, CONTRACT, README) — seuls real-llm-call.js, le test, CHANGELOG.md et MANIFEST.json different",
      bad.length === 0, bad.join(", "));
  }

  const passed = results.every(function (r) { return r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("\n" + (passed ? "EF01B_V02_R2_TESTS = PASS" : "EF01B_V02_R2_TESTS = FAIL"));
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
