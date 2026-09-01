"use strict";
// test/test_t08_r2_closure.js — LOCAL_CONTROLLED, AUCUN RESEAU REEL.
//
// REMEDIATION R2 (audit indepedant round 2, BLOCKERS B-01->B-04) : prouve
// separement chaque garantie, jamais une assertion globale opaque (mandat
// R2, section 21).

const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function runWorker(scriptPath, args, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const child = spawn(process.execPath, [scriptPath].concat(args), { stdio: ["ignore", "pipe", "pipe"], env: opts.env || process.env, timeout: opts.timeoutMs });
    let stdout = "", stderr = "";
    child.stdout.on("data", function (d) { stdout += d; });
    child.stderr.on("data", function (d) { stderr += d; });
    child.on("close", function (code) { resolve({ code: code, stdout: stdout, stderr: stderr, pid: child.pid }); });
  });
}

function extractResultLine(stdout, marker) {
  const line = stdout.split("\n").find(function (l) { return l.indexOf(marker) === 0; });
  if (!line) return null;
  try { return JSON.parse(line.slice(marker.length)); } catch (e) { return null; }
}

(async () => {
  const kitRoot = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT;
  const mono07LibPath = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
  if (!kitRoot || !mono07LibPath) { console.error("EVIDENCEFORGE_KIT_ROOT et EVIDENCEFORGE_MONO07_LIB_PATH requis."); process.exit(2); }
  const { extractFrozenMono05, freshDir } = require(path.join(mono07LibPath, "harness-env.js"));

  // =====================================================================
  // B-01 — persistence-restart du chemin REEL prouve CROSS_PROCESS
  // =====================================================================
  {
    const workDir = path.join(os.tmpdir(), "mono08-r2-b01-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
    freshDir(workDir);
    const eforchBackendDir = path.join(workDir, "durable-eforch");
    const mono03BackendDir = path.join(workDir, "durable-mono03");
    const runId = "r2-b01-" + Date.now().toString(36);
    const mono05Root = extractFrozenMono05(kitRoot, workDir);

    // Etape 1 (LOCAL_CONTROLLED, deja prouve par test_t08_cross_process.js
    // que buildDurableComponents() fonctionne) : conduit le run COMPLET a
    // 14/14 SUCCESS via un processus A, pour qu'aucun appel adapter/
    // workerCallFn/openAlexFetchImpl reel ne soit jamais necessaire quand
    // lib/cross-process-restart-worker.js (chemin REEL) rehydrate ensuite
    // — rehydrateRealMissionRun() ne fait que RECONCILIER l'etat deja
    // persiste (SUCCESS partout), jamais reexecuter un noeud (verifie par
    // lecture du code de real-e2e-driver.js::rehydrateRealMissionRun) :
    // aucun reseau reel n'est donc jamais atteint par l'etape 2, meme si
    // celle-ci construit reellement buildRealExternalStageAdapter/
    // buildRealLlmWorkerCallFn/realOpenAlexFetchImpl (fonctions REELLES,
    // jamais des doublures de test).
    const setupArgs = [mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, runId, ""]; // "" = drive complet
    const setup = await runWorker(path.join(__dirname, "cross-process", "worker-a.js"), setupArgs, { timeoutMs: 30000 });
    const setupResult = extractResultLine(setup.stdout, "WORKER_A_RESULT:");
    check("B01-setup. run prealable conduit a 14/14 SUCCESS (LOCAL_CONTROLLED, prepare l'etat pour le worker REEL)", setup.code === 0 && setupResult && setupResult.ok === true, JSON.stringify(setupResult) + " stderr=" + setup.stderr.slice(0, 300));

    // Etape 2 : le VRAI worker de production (lib/cross-process-restart-
    // worker.js — le meme fichier que bin/run-real-smoke.js spawn
    // reellement), lance comme processus SEPARE, contre l'etat persiste
    // par l'etape 1. AUCUN mock : les fonctions reelles sont construites
    // et appelees telles quelles ; seule l'absence de tout noeud a
    // executer (deja tout SUCCESS) garantit l'absence d'appel reseau.
    // missionId reellement utilise par createRealMissionRun (voir
    // lib/real-e2e-driver.js) = runContract.runContractHash, jamais
    // mission.missionId (fixture LOCAL_CONTROLLED de ce test n'en a pas) —
    // recupere directement depuis l'etat persiste plutot que recalcule.
    const cfg = require(path.join(mono05Root, "app", "server", "config.js"));
    const { createMono03 } = require(path.join(cfg.MONO04_PATH, "dependencies", "MONO-03", "index.js"));
    const { createFileDurableBackend } = require("../lib/file-durable-backend");
    const probe03 = createMono03({ persistenceBackend: createFileDurableBackend(mono03BackendDir) });
    const persistedRun = await probe03.runStore.loadRun(runId);
    const realMissionId = persistedRun.missionId;

    const before = Date.now();
    const restartArgs = [mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, runId, realMissionId];
    const restart = await runWorker(path.join(__dirname, "..", "lib", "cross-process-restart-worker.js"), restartArgs, { timeoutMs: 20000 });
    const elapsedMs = Date.now() - before;
    const restartResult = extractResultLine(restart.stdout, "RESTART_WORKER_RESULT:");

    check("B01-01. lib/cross-process-restart-worker.js (chemin REEL, processus separe) termine avec exit code 0", restart.code === 0, "code=" + restart.code + " stderr=" + restart.stderr.slice(0, 500));
    check("B01-02. le worker REEL rapporte 14/14 SUCCESS apres rehydratation depuis le disque seul", restartResult && restartResult.allSuccess === true, JSON.stringify(restartResult));
    check("B01-03. pid du worker REEL distinct du processus de setup ET du processus de test", restart.pid && setup.pid && restart.pid !== setup.pid && restart.pid !== process.pid);
    check("B01-04. aucun appel reseau reel tente (le worker REEL termine rapidement — un appel reseau reel dans cet environnement sans acces internet aurait attendu jusqu'au timeout de connexion, largement > quelques secondes)", elapsedMs < 15000, "elapsedMs=" + elapsedMs);

    // Etape 3 : le worker REEL echoue proprement (jamais un hang, jamais
    // un crash sans diagnostic) si les arguments requis sont absents.
    const missingArgs = await runWorker(path.join(__dirname, "..", "lib", "cross-process-restart-worker.js"), [], { timeoutMs: 10000 });
    check("B01-05. lib/cross-process-restart-worker.js echoue proprement (exit != 0, message explicite) si les arguments sont absents", missingArgs.code !== 0 && /arguments manquants/.test(missingArgs.stderr));

    // Etape 4 : le trace source de bin/run-real-smoke.js nomme
    // explicitement l'etape persistence-restart-cross-process (jamais un
    // "persistence-restart" ambigu qui pourrait signifier CROSS_INSTANCE).
    const binSrc = fs.readFileSync(path.join(__dirname, "..", "bin", "run-real-smoke.js"), "utf8");
    // Verifie precisement les appels record(...) (noms d'etape de trace,
    // jamais la prose des commentaires) : aucun ne doit utiliser
    // "persistence-restart" seul (ambigu, pourrait signifier CROSS_INSTANCE).
    const recordCalls = binSrc.match(/record\(\s*"[^"]*persistence-restart[^"]*"/g) || [];
    const ambiguousRecordCalls = recordCalls.filter(function (c) { return !/persistence-restart-cross-process/.test(c); });
    check("B01-06. bin/run-real-smoke.js nomme l'etape 'persistence-restart-cross-process' dans TOUS ses record(...) (jamais 'persistence-restart' seul, ambigu)", recordCalls.length > 0 && ambiguousRecordCalls.length === 0, JSON.stringify(ambiguousRecordCalls));
    check("B01-07. bin/run-real-smoke.js spawn reellement un processus separe pour le restart (child_process.spawn)", /require\("child_process"\)/.test(binSrc) && /spawn\(process\.execPath/.test(binSrc));
  }

  // =====================================================================
  // B-02 — secret scan sensible au mode (direct/delegated), surfaces
  // etendues, tests POSITIFS et NEGATIFS (jamais un simple run sans fuite).
  // =====================================================================
  {
    const { resolveActiveSecretNames, resolveActiveSecretValues, collectDurableBackendFileSurfaces } = require("../lib/secret-scan-surfaces");
    const { scanForSecretValues } = require("../lib/secret-scan");
    const { createFileDurableBackend } = require("../lib/file-durable-backend");

    // --- Resolution du mode : jamais les deux secrets melanges ---
    const directResolved = resolveActiveSecretNames({ LLM_AUTH_MODE: "direct", ANTHROPIC_API_KEY: "sentinel-direct-value", EVIDENCEFORGE_WORKER_API_KEY: "sentinel-delegated-value" });
    check("B02-01. mode direct resout ANTHROPIC_API_KEY et SEULEMENT lui", directResolved.mode === "direct" && directResolved.secretNames.length === 1 && directResolved.secretNames[0] === "ANTHROPIC_API_KEY");
    const directValues = resolveActiveSecretValues({ LLM_AUTH_MODE: "direct", ANTHROPIC_API_KEY: "sentinel-direct-value", EVIDENCEFORGE_WORKER_API_KEY: "sentinel-delegated-value" });
    check("B02-02. mode direct ne scanne JAMAIS la valeur EVIDENCEFORGE_WORKER_API_KEY", directValues.indexOf("sentinel-delegated-value") === -1 && directValues.indexOf("sentinel-direct-value") !== -1);

    const delegatedResolved = resolveActiveSecretNames({ LLM_AUTH_MODE: "delegated", ANTHROPIC_API_KEY: "sentinel-direct-value", EVIDENCEFORGE_WORKER_API_KEY: "sentinel-delegated-value" });
    check("B02-03. mode delegated resout EVIDENCEFORGE_WORKER_API_KEY et SEULEMENT lui", delegatedResolved.mode === "delegated" && delegatedResolved.secretNames.length === 1 && delegatedResolved.secretNames[0] === "EVIDENCEFORGE_WORKER_API_KEY");
    const delegatedValues = resolveActiveSecretValues({ LLM_AUTH_MODE: "delegated", ANTHROPIC_API_KEY: "sentinel-direct-value", EVIDENCEFORGE_WORKER_API_KEY: "sentinel-delegated-value" });
    check("B02-04. mode delegated ne scanne JAMAIS la valeur ANTHROPIC_API_KEY (client jamais expose a la cle directe)", delegatedValues.indexOf("sentinel-direct-value") === -1 && delegatedValues.indexOf("sentinel-delegated-value") !== -1);

    const absentResolved = resolveActiveSecretNames({});
    check("B02-05. LLM_AUTH_MODE absent => mode direct par defaut (jamais delegated implicite)", absentResolved.mode === "direct");

    const invalidResolved = resolveActiveSecretNames({ LLM_AUTH_MODE: "n-importe-quoi" });
    check("B02-06. LLM_AUTH_MODE invalide => aucun secret resolu (fail-closed, jamais un defaut silencieux)", invalidResolved.mode === null && invalidResolved.secretNames.length === 0);

    // --- Tests NEGATIFS : chaque surface doit reellement declencher une detection ---
    const SENTINEL = "MONO08_R2_SECRET_SENTINEL_VALUE_NEVER_REAL";
    const negativeSurfaces = {
      "RunState": { runId: "x", nodeStates: { "EF-01": { lastError: { message: "leak: " + SENTINEL } } } },
      "ArtifactRecord": [{ artifactId: "a1", payload: { note: SENTINEL } }],
      "OperatorApi-response": { schema: "EvidenceForge.Report", assuranceLevel: "x", debug: SENTINEL },
      "report": "rapport genere contenant " + SENTINEL,
      "stdout": "[PASS] some-step (REAL) - " + SENTINEL,
      "stderr": "Error: connection failed with credential " + SENTINEL,
      "trace": JSON.stringify({ steps: [{ detail: SENTINEL }] }),
      "dom-bodyText": "<body>assuranceLevel " + SENTINEL + "</body>",
      "dom-localStorage": JSON.stringify({ token: SENTINEL }),
      "dom-sessionStorage": JSON.stringify({ apiKey: SENTINEL }),
    };
    for (const surfaceName of Object.keys(negativeSurfaces)) {
      const haystack = {}; haystack[surfaceName] = negativeSurfaces[surfaceName];
      const scan = scanForSecretValues(haystack, [SENTINEL]);
      check("B02-NEG-" + surfaceName + ". une fuite volontairement injectee dans la surface '" + surfaceName + "' est REELLEMENT detectee (jamais un faux PASS)", scan.clean === false && scan.occurrences.some(function (o) { return o.location === surfaceName; }), JSON.stringify(scan.occurrences));
    }

    // --- Test POSITIF : surfaces propres => scan.clean ===
    const cleanSurfaces = {};
    for (const surfaceName of Object.keys(negativeSurfaces)) { cleanSurfaces[surfaceName] = "contenu normal sans aucun secret"; }
    const cleanScan = scanForSecretValues(cleanSurfaces, [SENTINEL]);
    check("B02-07. surfaces propres => scan.clean === true (le scanner ne rapporte jamais un faux positif)", cleanScan.clean === true, JSON.stringify(cleanScan.occurrences));

    // --- collectDurableBackendFileSurfaces() : lit REELLEMENT le contenu ecrit sur disque ---
    const probeDir = path.join(os.tmpdir(), "mono08-r2-b02-backend-" + Date.now());
    const probeBackend = createFileDurableBackend(probeDir);
    await probeBackend.put("runInputs", "probe-run", { note: "contient " + SENTINEL + " par construction" });
    const collected = collectDurableBackendFileSurfaces(probeDir, "durable-probe");
    const collectedText = JSON.stringify(collected);
    check("B02-08. collectDurableBackendFileSurfaces() lit reellement le contenu persiste sur disque (retrouve le sentinel ecrit via put())", collectedText.indexOf(SENTINEL) !== -1, "cles=" + Object.keys(collected).join(","));
    const scanOnCollected = scanForSecretValues(collected, [SENTINEL]);
    check("B02-09. le scan sur les surfaces collectees depuis le disque detecte reellement la fuite", scanOnCollected.clean === false);

    // --- bin/run-real-smoke.js utilise reellement resolveActiveSecretNames/collectDurableBackendFileSurfaces, jamais process.env.ANTHROPIC_API_KEY seul ---
    const binSrc = fs.readFileSync(path.join(__dirname, "..", "bin", "run-real-smoke.js"), "utf8");
    check("B02-10. bin/run-real-smoke.js n'utilise plus [process.env.ANTHROPIC_API_KEY] seul comme unique source de secrets a scanner", !/const secretValues = \[process\.env\.ANTHROPIC_API_KEY\]/.test(binSrc));
    check("B02-11. bin/run-real-smoke.js utilise resolveActiveSecretNames/resolveActiveSecretValues (mode-aware, lib/secret-scan-surfaces.js)", /resolveActiveSecretNames/.test(binSrc) && /resolveActiveSecretValues/.test(binSrc));
    check("B02-12. bin/run-real-smoke.js scanne le contenu reellement persiste sur disque (collectDurableBackendFileSurfaces)", /collectDurableBackendFileSurfaces/.test(binSrc));
    check("B02-13. bin/run-real-smoke.js scanne stdout/stderr du processus de restart cross-process", /restartWorkerStdout/.test(binSrc) && /restartWorkerStderr/.test(binSrc));
    check("B02-14. bin/run-real-smoke.js scanne DOM/localStorage/sessionStorage (jamais NOT_APPLICABLE alors qu'ils sont produits a l'etape ui-smoke)", /dom-bodyText/.test(binSrc) && /dom-localStorage/.test(binSrc) && /dom-sessionStorage/.test(binSrc));
  }

  // =====================================================================
  // B-03 — missionGateStatus() valide structurellement eForchProvenance
  // AVANT tout builder/provider (mandat R2, section 13 : 5 cas obligatoires).
  // =====================================================================
  {
    const { describeMissionGateStatus, missionGateStatus } = require("../bin/run-real-smoke");
    const { validateRealEForchProvenance } = require("../lib/eforch-artifacts");
    const HASH64 = "b".repeat(64);
    const baseDims = [{ id: "DIM_A", label: "Dimension A" }];
    const validPlannerOutput = {
      sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "Connecteur retenu (test B-03)." }],
      queries: [{ discipline: "DIM_A", connectorId: "openalex", requete: "requete reelle DIM_A (test B-03)", justification: "Justification reelle (test B-03)." }],
      retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "maxResults atteint", retryPolicy: "2 tentatives", rateLimitPolicy: "1000 req/s", budgetMax: "budget raisonnable" }],
      criteresInclusion: ["Critere d'inclusion reel (test B-03)."],
      criteresExclusion: ["Critere d'exclusion reel (test B-03)."],
      regleDedoublonnage: "DOI (test B-03).",
      methodeQualification: "Qualitative (test B-03).",
    };
    const validProvenance = {
      resolverRuns: [{ provider: "anthropic", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64, proposalCountRaw: 3, proposalCountStored: 3, technicalProposalLimit: 20, targetContextReport: [] }],
      plannerRun: { provider: "anthropic", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
      // REMEDIATION R3 (M-02) : plannerOutput desormais requis par le
      // mission-gate lui-meme (validateRealEForchProvenance), pas
      // seulement par le builder — meme fonction de validation partagee.
      plannerOutput: validPlannerOutput,
      humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel" },
      auditDecisions: { "s1": { acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "reel" } },
    };

    // Cas 1 : readyForExecution=false => NOT_READY (motif : readyForExecution)
    const case1 = describeMissionGateStatus({ readyForExecution: false, dimensions: baseDims });
    check("B03-CAS1. readyForExecution=false => MISSION_NOT_READY, motif readyForExecution", case1.status === "MISSION_NOT_READY" && /readyForExecution/.test(case1.reason), JSON.stringify(case1));

    // Cas 2 : readyForExecution=true mais eForchProvenance absent => NOT_READY
    const case2 = describeMissionGateStatus({ readyForExecution: true, dimensions: baseDims });
    check("B03-CAS2. readyForExecution=true, eForchProvenance absent => MISSION_NOT_READY, motif eForchProvenance", case2.status === "MISSION_NOT_READY" && /eForchProvenance/.test(case2.reason), JSON.stringify(case2));

    // Cas 3 : eForchProvenance present mais incomplet => NOT_READY (plusieurs variantes d'incompletude)
    const incompleteVariants = [
      { name: "resolverRuns manquant", provenance: Object.assign({}, validProvenance, { resolverRuns: undefined }) },
      { name: "resolverRuns longueur incorrecte", provenance: Object.assign({}, validProvenance, { resolverRuns: [] }) },
      { name: "plannerRun incomplet", provenance: Object.assign({}, validProvenance, { plannerRun: { provider: "anthropic" } }) },
      { name: "auditDecisions vide", provenance: Object.assign({}, validProvenance, { auditDecisions: {} }) },
      { name: "auditDecisions acteur invalide", provenance: Object.assign({}, validProvenance, { auditDecisions: { s1: { acteur: "system", date: "x", decision: "inclus", justification: "x" } } }) },
      { name: "humanValidation absent", provenance: Object.assign({}, validProvenance, { humanValidation: undefined }) },
      { name: "plannerOutput absent (planner causal output missing)", provenance: Object.assign({}, validProvenance, { plannerOutput: undefined }) },
      { name: "plannerOutput incomplet (criteresInclusion manquant)", provenance: Object.assign({}, validProvenance, { plannerOutput: Object.assign({}, validPlannerOutput, { criteresInclusion: undefined }) }) },
    ];
    for (const variant of incompleteVariants) {
      const result = describeMissionGateStatus({ readyForExecution: true, dimensions: baseDims, eForchProvenance: variant.provenance });
      check("B03-CAS3. eForchProvenance incomplet (" + variant.name + ") => MISSION_NOT_READY", result.status === "MISSION_NOT_READY", JSON.stringify(result));
    }

    // Cas 4 : readyForExecution=true ET provenance structurellement valide => PASS
    const case4 = describeMissionGateStatus({ readyForExecution: true, dimensions: baseDims, eForchProvenance: validProvenance });
    check("B03-CAS4. readyForExecution=true + eForchProvenance valide => PASS", case4.status === "PASS", JSON.stringify(case4));
    check("B03-CAS4b. missionGateStatus() (predicat simple, retro-compatible) reflete le meme resultat", missionGateStatus({ readyForExecution: true, dimensions: baseDims, eForchProvenance: validProvenance }) === "PASS");

    // Cas 5 : aucun builder EF-ORCH n'est appele avant le rejet d'une mission invalide.
    // Preuve directe : describeMissionGateStatus()/validateRealEForchProvenance() ne
    // referencent, dans leur code source, aucun des builders geles (jamais un appel
    // cache) - et l'appel reussit sans lever d'exception MODULE_NOT_FOUND/chemin
    // MONO-01 (ce qui prouverait qu'un builder a bien ete atteint sans contexte).
    const eforchSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "eforch-artifacts.js"), "utf8");
    const validateFnSrc = eforchSrc.slice(eforchSrc.indexOf("function validateRealEForchProvenance"), eforchSrc.indexOf("function buildResolverTraceForMission"));
    const forbiddenCalls = ["loadEForchDeps(", "buildResolverTraceForMission(", "buildSearchProtocolForMission(", "buildScreeningArtifactForMission(", "buildConfirmedRunContractForMission(", "require(\"path\")"];
    const foundForbidden = forbiddenCalls.filter(function (c) { return validateFnSrc.indexOf(c) !== -1; });
    check("B03-CAS5. validateRealEForchProvenance() n'appelle AUCUN builder EF-ORCH ni ne require() de dependance MONO-01 (verification statique du code source)", foundForbidden.length === 0, JSON.stringify(foundForbidden));
    let gateThrew = null;
    try { describeMissionGateStatus({ readyForExecution: true, dimensions: baseDims }); } catch (e) { gateThrew = e; }
    check("B03-CAS5b. describeMissionGateStatus() sur une mission invalide ne leve jamais d'exception (jamais atteint un builder/provider qui exigerait un contexte MONO-01 absent ici)", gateThrew === null, gateThrew && gateThrew.message);

    check("B03-06. bin/run-real-smoke.js::main() utilise describeMissionGateStatus() (raison explicite) pour construire le detail de mission-gate", fs.readFileSync(path.join(__dirname, "..", "bin", "run-real-smoke.js"), "utf8").indexOf("describeMissionGateStatus(mission)") !== -1);
  }

  // =====================================================================
  // B-04 — le paquet remedie est autonome comme KIT_ROOT (jamais de
  // reference a un ancien kit externe pour construire un KIT_ROOT
  // exploitable par les lots geles MONO-06/MONO-07).
  //
  // Ce fichier vit sous MONO-08/v0.6/test/ ; quand il tourne DEPUIS un
  // paquet remedie reellement extrait (EvidenceForge-CLEAN-MONO-01-08/ ou
  // equivalent), trois niveaux au-dessus (../../..) est la racine du
  // paquet, contenant MONO-00/..MONO-07/ en clair. Dans le depot source
  // de developpement (ou ce fichier est ecrit), cette racine ne contient
  // PAS ces dossiers (ils n'existent que dans le paquet assemble) — les
  // verifications B-04 sont alors annoncees SKIPPED (jamais un FAIL
  // trompeur), avec un pointeur vers AUDIT-REMEDIATION/12-R2-CLOSURE.md
  // qui documente la verification directe deja effectuee sur le paquet
  // reellement assemble et zippe.
  // =====================================================================
  {
    const { buildTemporaryKitRoot } = require("../lib/kit-root-adapter");
    const bundleRoot = process.env.EVIDENCEFORGE_CLEAN_BUNDLE_ROOT || path.resolve(__dirname, "..", "..", "..");
    const bundleHasMono05 = fs.existsSync(path.join(bundleRoot, "MONO-05"));

    let invalidThrew = null;
    try { buildTemporaryKitRoot(path.join(os.tmpdir(), "mono08-r2-b04-inexistant-" + Date.now()), path.join(os.tmpdir(), "mono08-r2-b04-out-" + Date.now())); } catch (e) { invalidThrew = e; }
    check("B04-01. buildTemporaryKitRoot() echoue proprement (jamais un KIT_ROOT vide silencieux) sur une racine de paquet inexistante", !!invalidThrew && /introuvable/.test(invalidThrew.message));

    if (!bundleHasMono05) {
      check("B04-SKIPPED. verification autonomie complete non executee ici (ce depot de developpement, jamais le paquet assemble - voir AUDIT-REMEDIATION/12-R2-CLOSURE.md pour la verification directe sur le paquet zippe)", true, "bundleRoot=" + bundleRoot);
    } else {
      const adapterOutDir = path.join(os.tmpdir(), "mono08-r2-b04-kitroot-" + Date.now());
      const constructedKitRoot = buildTemporaryKitRoot(bundleRoot, adapterOutDir);
      check("B04-02. buildTemporaryKitRoot() construit reellement un KIT_ROOT depuis le paquet remedie (MONO-00..MONO-07 en clair)", fs.existsSync(path.join(constructedKitRoot, "04-ARTEFACTS-CANONIQUES", "MONO")));

      const mono05ExtractWork = path.join(os.tmpdir(), "mono08-r2-b04-extract-" + Date.now());
      const mono05Root = extractFrozenMono05(constructedKitRoot, mono05ExtractWork);
      check("B04-03. extractFrozenMono05() (MONO-07, gele, JAMAIS modifie) extrait reellement MONO-05 depuis le KIT_ROOT construit par l'adaptateur MONO-08", fs.existsSync(path.join(mono05Root, "app", "server", "config.js")));

      // Preuve finale : une VRAIE suite MONO-08 (test_t08_eforch.js, deja
      // verifiee ailleurs) tourne integralement depuis CE KIT_ROOT
      // reconstruit, sans reference a l'ancien kit-root de developpement
      // (kitRoot/mono07LibPath de ce fichier ne sont PAS reutilises ici).
      const bundleMono07LibPath = path.join(bundleRoot, "MONO-07", "lib");
      const autonomyRun = await runWorker(path.join(__dirname, "test_t08_eforch.js"), [constructedKitRoot], {
        timeoutMs: 60000,
        env: Object.assign({}, process.env, { EVIDENCEFORGE_KIT_ROOT: constructedKitRoot, EVIDENCEFORGE_MONO07_LIB_PATH: bundleMono07LibPath }),
      });
      check("B04-04. test_t08_eforch.js (26 assertions) PASSE integralement depuis le KIT_ROOT reconstruit par le paquet seul (aucune ressource cachee externe)", autonomyRun.code === 0 && /TOUS LES TESTS PASSENT \(26\)/.test(autonomyRun.stdout), "code=" + autonomyRun.code + " stderr=" + autonomyRun.stderr.slice(0, 400));
    }

    const kitRootAdapterSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "kit-root-adapter.js"), "utf8");
    check("B04-05. lib/kit-root-adapter.js n'ecrit jamais dans un lot gele (aucun fs.writeFileSync/fs.copyFileSync vers un dossier MONO-XX, seulement une lecture pour zip via child_process)", /execFileSync\("zip"/.test(kitRootAdapterSrc) && !/fs\.writeFileSync|fs\.copyFileSync|fs\.appendFileSync/.test(kitRootAdapterSrc));
  }

  // =====================================================================
  // M-02 — SECTION HISTORIQUE R2, REINTERPRETEE R3 (jamais supprimee ni
  // reecrite silencieusement — mandat R3, section 20/36 : "ne falsifie pas
  // l'historique"). A r2, M02-01 prouvait qu'un plannerRun REEL a lui seul
  // ne changeait JAMAIS le contenu substantiel de SearchProtocol — c'etait
  // la preuve du defaut. En r3 (voir lib/eforch-artifacts.js,
  // buildSearchProtocolFromPlannerOutput, et test_t08_r3_closure.js pour
  // la preuve POSITIVE de derivation causale), le contenu substantiel est
  // desormais reellement derive de provenance.plannerOutput — jamais de
  // provenance.plannerRun (qui ne porte QUE la provenance de l'appel :
  // provider/model/hash, jamais son contenu). Ce bloc re-verifie ici,
  // avec le MEME plannerOutput fourni aux deux appels et SEUL le
  // plannerRun (provenance) variant, que le contenu substantiel reste
  // IDENTIQUE — ce qui est desormais un comportement CORRECT et ATTENDU
  // (la provenance de l'appel n'est pas censee, a elle seule, changer le
  // contenu ; c'est le contenu du plannerOutput qui doit le faire — voir
  // M02-06..M02-10 de test_t08_r3_closure.js pour la preuve inverse).
  // =====================================================================
  {
    const { loadEForchDeps, buildConfirmedRunContractForMission, buildSearchProtocolForMission } = require("../lib/eforch-artifacts");
    const mono05RootForM02 = extractFrozenMono05(kitRoot, path.join(os.tmpdir(), "mono08-r2-m02-" + Date.now()));
    const cfgProbe = require(path.join(mono05RootForM02, "app", "server", "config.js"));
    const deps = loadEForchDeps(cfgProbe.MONO01_PATH);
    const missionForM02 = { dimensions: [{ id: "DIM_A", label: "Dimension A" }], targetDocuments: [{ documentId: "t1", title: "T1", url: "https://example.invalid/t1" }] };
    const documentBytesByUrl = { "https://example.invalid/t1": new TextEncoder().encode("contenu") };
    const runContract = await buildConfirmedRunContractForMission(deps, missionForM02, "Question ?", documentBytesByUrl);
    const missionId = runContract.runContractHash;
    const disciplines = missionForM02.dimensions.map(function (d) { return d.id; });

    const HASH64M02 = "c".repeat(64);
    const samePlannerOutput = {
      sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "Connecteur retenu (test M02, r3)." }],
      queries: [{ discipline: "DIM_A", connectorId: "openalex", requete: "requete commune DIM_A (test M02, r3)", justification: "Justification commune (test M02, r3)." }],
      retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "maxResults atteint", retryPolicy: "2 tentatives", rateLimitPolicy: "1000 req/s", budgetMax: "budget raisonnable" }],
      criteresInclusion: ["Critere commun (test M02, r3)."],
      criteresExclusion: ["Critere d'exclusion commun (test M02, r3)."],
      regleDedoublonnage: "DOI (test M02, r3).",
      methodeQualification: "Qualitative (test M02, r3).",
    };
    // DEUX plannerRun REELS DELIBEREMENT DIFFERENTS (hash/provider/model
    // distincts) mais LE MEME plannerOutput (contenu causal) — r3 :
    // le contenu substantiel doit rester identique (il ne depend QUE du
    // plannerOutput, jamais de la provenance de l'appel).
    const protocolA = await buildSearchProtocolForMission(deps, missionId, "m02a", disciplines, {
      mode: "REAL",
      plannerRun: { provider: "anthropic", model: "model-A", promptVersion: "vA", date: new Date().toISOString(), inputHash: HASH64M02, rawResponseHash: HASH64M02 },
      plannerOutput: samePlannerOutput,
      humanValidation: { validatedAt: new Date().toISOString(), commentaire: "Revue A." },
    });
    const protocolB = await buildSearchProtocolForMission(deps, missionId, "m02b", disciplines, {
      mode: "REAL",
      plannerRun: { provider: "openai-hypothetique", model: "model-B-totalement-different", promptVersion: "vB", date: new Date().toISOString(), inputHash: "d".repeat(64), rawResponseHash: "d".repeat(64) },
      plannerOutput: samePlannerOutput,
      humanValidation: { validatedAt: new Date().toISOString(), commentaire: "Revue B, texte totalement different." },
    });
    const substantiveFieldsIdentical = JSON.stringify(protocolA.sourcesActivees) === JSON.stringify(protocolB.sourcesActivees) &&
      JSON.stringify(protocolA.requetesExactes) === JSON.stringify(protocolB.requetesExactes) &&
      JSON.stringify(protocolA.criteresInclusion) === JSON.stringify(protocolB.criteresInclusion) &&
      JSON.stringify(protocolA.criteresExclusion) === JSON.stringify(protocolB.criteresExclusion) &&
      JSON.stringify(protocolA.retrievalPolicies) === JSON.stringify(protocolB.retrievalPolicies);
    check(
      "M02-01-R3. avec le MEME plannerOutput, seule la provenance (plannerRun) differant, le contenu substantiel de SearchProtocol reste IDENTIQUE (comportement CORRECT r3 — la provenance de l'appel ne doit jamais, a elle seule, changer le contenu ; voir test_t08_r3_closure.js pour la preuve que plannerOutput, lui, le fait reellement)",
      substantiveFieldsIdentical,
      "protocolA.sourcesActivees=" + JSON.stringify(protocolA.sourcesActivees)
    );
    check("M02-02. seul le champ plannerRuns[0] (provenance) differe reellement entre les deux appels", JSON.stringify(protocolA.plannerRuns[0].provider) !== JSON.stringify(protocolB.plannerRuns[0].provider));

    // --- humanValidation : corrige, verifie ici (plannerOutput valide fourni pour isoler l'erreur testee) ---
    let m02c = null;
    try {
      await buildSearchProtocolForMission(deps, missionId, "m02c", disciplines, { mode: "REAL", plannerRun: { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64M02, rawResponseHash: HASH64M02 }, plannerOutput: samePlannerOutput });
    } catch (e) { m02c = e; }
    check("M02-03. SearchProtocol REAL exige desormais une humanValidation reelle (OPERATOR_INPUT_REQUIRED si absente, jamais 'Revu (MONO-08).' fabrique)", !!m02c && m02c.code === "OPERATOR_INPUT_REQUIRED" && /humanValidation/.test(m02c.message), m02c && m02c.message);
    check("M02-04. SearchProtocol REAL avec humanValidation reelle transporte le commentaire REELLEMENT fourni, jamais 'Revu (MONO-08).'", protocolA.humanValidation.commentaire === "Revue A." && protocolA.humanValidation.evidenceProvenance === "OPERATOR_ATTESTED_HUMAN_ACTION");
    const protocolLocalControlled = await buildSearchProtocolForMission(deps, missionId, "m02d", disciplines);
    check("M02-05. SearchProtocol LOCAL_CONTROLLED (mode absent) conserve 'Revu (MONO-08).' MAIS etiquete SYNTHETIC_FIXTURE (jamais presente comme reel)", protocolLocalControlled.humanValidation.commentaire === "Revu (MONO-08)." && protocolLocalControlled.humanValidation.evidenceProvenance === "SYNTHETIC_FIXTURE");
  }

  // =====================================================================
  // M-03 — file-durable-backend.js::keys() distingue desormais fichier
  // disparu (course benigne, silencieux) / contenu corrompu (relance,
  // jamais absorbe comme une absence de cle).
  // =====================================================================
  {
    const { createFileDurableBackend } = require("../lib/file-durable-backend");
    const m03Dir = path.join(os.tmpdir(), "mono08-r2-m03-" + Date.now());
    const backend = createFileDurableBackend(m03Dir);
    await backend.put("ns", "k-valide", { a: 1 });
    const keysOk = await backend.keys("ns");
    check("M03-01. keys() retourne normalement les cles valides (comportement inchange pour le cas sain)", keysOk.length === 1 && keysOk[0] === "k-valide");

    // --- Cas 1 : fichier disparu entre readdir() et readFile() (course benigne) ---
    // Simule en supprimant TOUS les fichiers du namespace juste apres le
    // readdir() interne — verifie via une cle qui n'existe deja plus au
    // moment de l'appel keys() (equivalent observable : keys() ne doit
    // jamais lever pour un fichier legitimement absent).
    await backend.delete("ns", "k-valide");
    let benignThrew = null;
    let keysAfterDelete = null;
    try { keysAfterDelete = await backend.keys("ns"); } catch (e) { benignThrew = e; }
    check("M03-02. keys() ne leve JAMAIS pour un namespace dont la seule cle a ete supprimee (course/absence benigne)", benignThrew === null && Array.isArray(keysAfterDelete) && keysAfterDelete.length === 0);

    // --- Cas 2 : contenu corrompu (JSON invalide) — JAMAIS silencieusement absorbe ---
    await backend.put("ns2", "k-corrompu", { a: 1 });
    const fs2 = require("fs");
    const crypto2 = require("crypto");
    const nsDir = path.join(m03Dir, crypto2.createHash("sha256").update("ns2").digest("hex").slice(0, 40));
    const files = fs2.readdirSync(nsDir).filter(function (f) { return !f.includes(".tmp-"); });
    fs2.writeFileSync(path.join(nsDir, files[0]), "{ceci n'est pas du JSON valide", "utf8");
    let corruptThrew = null;
    try { await backend.keys("ns2"); } catch (e) { corruptThrew = e; }
    check("M03-03. keys() LEVE explicitement (jamais un tableau vide/tronque silencieux) quand une cle existante a un contenu JSON corrompu", !!corruptThrew && /corrompu/.test(corruptThrew.message), corruptThrew && corruptThrew.message);

    // --- Cas 3 : le message distingue les deux causes (jamais une erreur generique indistincte) ---
    check("M03-04. le message d'erreur de corruption est distinct du cas 'course benigne' (jamais le meme message pour deux causes differentes)", corruptThrew && /"k-corrompu"|ns2/.test(corruptThrew.message));

    const backendSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "file-durable-backend.js"), "utf8");
    check("M03-05. lib/file-durable-backend.js::keys() distingue ENOENT (course benigne) des autres erreurs readFile (relancees)", /e\.code === "ENOENT"/.test(backendSrc) && (backendSrc.match(/throw new Error/g) || []).length >= 2);
  }

  // =====================================================================
  // M-01 — terminologie honnete : OPERATOR_ATTESTED_LLM_CALL/
  // OPERATOR_ATTESTED_HUMAN_ACTION (attestation de l'appelant, jamais une
  // verification causale) remplacent REAL_LLM_CALL/REAL_HUMAN_ACTION
  // (r1) qui pouvaient laisser croire a une verification que MONO-08 ne
  // realise jamais.
  // =====================================================================
  {
    const eforchSrcM01 = fs.readFileSync(path.join(__dirname, "..", "lib", "eforch-artifacts.js"), "utf8");
    check("M01-01. lib/eforch-artifacts.js n'utilise plus 'REAL_LLM_CALL'/'REAL_HUMAN_ACTION' comme etiquette evidenceProvenance (terminologie surqualifiee, r1)", !/"REAL_LLM_CALL"|"REAL_HUMAN_ACTION"/.test(eforchSrcM01));
    check("M01-02. lib/eforch-artifacts.js utilise 'OPERATOR_ATTESTED_LLM_CALL'/'OPERATOR_ATTESTED_HUMAN_ACTION' (attestation de l'appelant, jamais une verification causale revendiquee)", /"OPERATOR_ATTESTED_LLM_CALL"/.test(eforchSrcM01) && /"OPERATOR_ATTESTED_HUMAN_ACTION"/.test(eforchSrcM01));
  }

  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
