"use strict";
// MONO-08 v0.7 — banc cible. LOCAL_CONTROLLED, ZERO reseau, zero provider.
// argv[2] = bundleRoot ; argv[3] = workspaceRoot (artefacts reels de mission).

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const bundleRoot = process.argv[2];
const wsRoot = process.argv[3];
if (!bundleRoot || !wsRoot) { console.error("Usage: node test-mono08-v0.7.js <bundleRoot> <workspaceRoot>"); process.exit(2); }

const V07 = path.join(bundleRoot, "MONO-08", "v0.7");
const V06 = path.join(bundleRoot, "MONO-08", "v0.6");
const PEA = require(path.join(V07, "lib", "prepare-existing-artifacts.js"));
const FQC = require(path.join(V07, "lib", "fair-query-coverage.js"));
const { runReadinessV2 } = require(path.join(V07, "lib", "readiness-v2.js"));
const { loadEForchDeps, buildOpenAlexConnectorRunner } = require(path.join(V06, "lib", "eforch-artifacts.js"));

const cfg = { MONO01_PATH: path.join(bundleRoot, "MONO-01"), MONO08_V06_PATH: V06 };
const deps = loadEForchDeps(cfg.MONO01_PATH);
const W = (f) => path.join(wsRoot, f);
const load = (f) => JSON.parse(fs.readFileSync(W(f), "utf8"));

const RC = load("runcontract-confirmed.json");
const SP = load("searchprotocol-confirmed.json");
const PROV = load("eforch-provenance.json");
const EXEC = load("mission-real-jmjs-execution.json");
const PINNED = load("documents-detectes.json");
const RCH = "00c24be4426458639bbca5de12df14937a8408ddabacd5ae2fdb55c1b50c5c97";
const SPH = "c26415e3300ab926b0ef8447913e6db45ce4d2897b85f0c73e27076cb0c457c9";
const MID = "ma-mission-001";

const results = [];
const check = (n, c, d) => results.push({ name: n, pass: !!c, detail: d || "" });
const clone = (o) => JSON.parse(JSON.stringify(o));
async function rejects(fn) { try { await fn(); return null; } catch (e) { return e; } }

function fakeFetch(opts) {
  opts = opts || {};
  const state = { calls: 0 };
  return { state, fn: async function (url) {
    state.calls++;
    if (opts.fail) throw new Error("panne reseau simulee");
    const u = new URL(url);
    const per = parseInt(u.searchParams.get("per_page") || u.searchParams.get("per-page") || "25", 10);
    const n = opts.empty ? 0 : (opts.shortPage ? Math.min(3, per) : per);
    const dup = !!opts.duplicates;
    const results = Array.from({ length: n }, (_, i) => ({
      id: dup ? "https://openalex.org/WDUP" : "https://openalex.org/W" + state.calls + "_" + i,
      display_name: "Doc " + i, publication_year: 2020, doi: null, authorships: [], primary_location: null, type: "article",
    }));
    return { ok: true, status: 200, json: async () => ({ results, meta: { count: 99999 } }) };
  } };
}
const buildExecMission = () => {
  const m = clone(EXEC);
  m.dimensions = RC.disciplinesProposees.filter(d => d.statut === "retenue").map(d => ({ id: d.discipline, label: d.discipline }));
  return m;
};
const bytesByUrl = () => { const o = {}; for (const d of EXEC.targetDocuments) if (d.status === "VERIFIED") o[d.url] = Buffer.from(d.contentBase64, "base64"); return o; };
const baseOpts = (over) => Object.assign({
  v06LibPath: path.join(V06, "lib"), mission: buildExecMission(),
  existingRunContract: RC, existingSearchProtocol: SP, existingEForchProvenance: PROV,
  expectedRunContractHash: RCH, expectedProtocolHash: SPH,
  documentBytesByUrl: bytesByUrl(), openAlexFetchImpl: fakeFetch().fn,
}, over || {});

(async () => {
  // ---- RunContract (T01-T04) ----
  const pre = await PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts());
  check("T01. existing RunContract accepte et UTILISE", pre.runContract === RC && pre.runContractHash === RCH);
  check("T02. RunContract invalide rejete", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ existingRunContract: { disciplinesProposees: [] } })))));
  const rcBad = clone(RC); rcBad.niveauRevue = "MODIFIE_APRES_COUP";
  check("T03. RunContract altere -> hash mismatch rejete (verifyRunContractIntegrity gelee)", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ existingRunContract: rcBad })))));
  check("T03b. runContractHash different de l attendu rejete", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ expectedRunContractHash: "0".repeat(64) })))));
  check("T04. RUNCONTRACT_REBUILD_CALLS = 0", pre.rebuildCalls.runContract === 0);

  // ---- SearchProtocol (T05-T08) ----
  check("T05. existing SearchProtocol accepte et UTILISE", pre.searchProtocol === SP);
  check("T06. SearchProtocol invalide rejete (contrat gele MONO-01)", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ existingSearchProtocol: { schema: "x" } })))));
  check("T07. protocolHash mismatch rejete", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ expectedProtocolHash: "f".repeat(64) })))));
  check("T08. SEARCHPROTOCOL_REBUILD_CALLS = 0", pre.rebuildCalls.searchProtocol === 0);
  const spRw = clone(SP); spRw.requetesExactes[0].requete = "REQUETE REECRITE";
  check("T08b. requete reecrite vs plannerOutput -> rejet", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ existingSearchProtocol: spRw })))));

  // ---- eForchProvenance (T09-T10) ----
  check("T09. eForchProvenance existante acceptee et UTILISEE", pre.eForchProvenance === PROV);
  const provBad = clone(PROV); provBad.resolverRuns.reverse();
  check("T10. ordre resolverRuns divergent du RunContract -> rejet", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ existingEForchProvenance: provBad })))));
  const provNoHv = clone(PROV); delete provNoHv.humanValidation;
  check("T10b. humanValidation absente -> rejet", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ existingEForchProvenance: provNoHv })))));

  // ---- missionId (T11-T12) ----
  check("T11. missionId canonique preserve", pre.missionId === MID);
  check("T11b. missionId JAMAIS remplace par runContractHash", pre.missionId !== pre.runContractHash);
  const spMid = clone(SP); spMid.missionId = "autre-mission";
  const e12 = await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ existingSearchProtocol: spMid })));
  // Le contrat GELE detecte la falsification AVANT notre propre controle : changer
  // missionId casse protocolHash, et assertSearchProtocolFrozenAndValid le voit en
  // premier. C'est une defense PLUS FORTE que celle attendue — on l'atteste telle quelle.
  check("T12. missionId falsifie rejete AVANT tout reseau (integrite gelee en premiere ligne)", !!e12 && /protocolHash|intégrité|integrite/i.test(e12.message));
  // Et notre controle missionId, isole, sur un protocole par ailleurs valide :
  const e12b = await rejects(() => PEA.assertExistingSearchProtocol(deps, SP, { mono01Path: cfg.MONO01_PATH, missionId: "mission-differente" }));
  check("T12c. controle missionId propre au successeur : MISSION_ID_MISMATCH", !!e12b && /MISSION_ID_MISMATCH/.test(JSON.stringify(e12b.details || {})));
  const mNoId = buildExecMission(); delete mNoId.missionId;
  check("T12b. mission sans missionId canonique -> rejet", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ mission: mNoId })))));

  // ---- documents (T13-T17) ----
  check("T13. noms de documents EXACTS conserves", EXEC.targetDocuments.every(d => PINNED.some(p => p.nom === d.title)));
  const mNoBytes = buildExecMission();
  check("T14. octets manquants -> echec", !!(await rejects(() => PEA.buildPreRetrievalArtifactsFromExisting(cfg, baseOpts({ mission: mNoBytes, documentBytesByUrl: {} })))));
  check("T16. empreintes documents conformes aux valeurs pinees", EXEC.targetDocuments.every(d => { const h = crypto.createHash("sha256").update(Buffer.from(d.contentBase64, "base64")).digest("hex"); return h === d.hashSha256 && PINNED.find(p => p.nom === d.title).hashSha256 === h; }));
  check("T17. content ET contentBase64 coherents (exigence extractDocumentPayloads)", EXEC.targetDocuments.every(d => d.status === "VERIFIED" && typeof d.content === "string" && d.content.length > 0 && Buffer.from(d.contentBase64, "base64").toString("utf8") === d.content));
  check("T17b. 3 documents materialises", EXEC.targetDocuments.length === 3);

  // ---- legacy (T18) ----
  check("T18. v0.6 intact : buildOpenAlexConnectorRunner toujours memoise", (function () {
    const src = fs.readFileSync(path.join(V06, "lib", "eforch-artifacts.js"), "utf8");
    return /if \(!cachedCall\) cachedCall = rawRunner\(connector, protocol\);/.test(src);
  })());
  check("T18b. v0.6 expose toujours buildConfirmedRunContractForMission et buildSearchProtocolForMission", (function () {
    const ea = require(path.join(V06, "lib", "eforch-artifacts.js"));
    return typeof ea.buildConfirmedRunContractForMission === "function" && typeof ea.buildSearchProtocolForMission === "function";
  })());

  // ---- politique (T19-T20) ----
  const rcPol = RC.strategieRecherche.retrievalPoliciesParNiveau;
  const spPol = SP.retrievalPolicies.find(p => p.connectorId === "openalex");
  check("T19. divergence de politique detectee", rcPol.maxPages !== spPol.maxPages && rcPol.maxResultsParConnecteur !== spPol.maxResults);
  check("T20. SearchProtocol = autorite d execution (le runner ne lit que retrievalPolicies)", (function () {
    const src = fs.readFileSync(path.join(cfg.MONO01_PATH, "dependencies", "ef-orch-ef01c2-runner-openalex-v0.1.js"), "utf8");
    return /protocol\.retrievalPolicies/.test(src) && !/retrievalPoliciesParNiveau/.test(src);
  })());

  // ---- B-07 (T21-T28) ----
  const ff1 = fakeFetch();
  const memoRunner = buildOpenAlexConnectorRunner(deps, "base", ff1.fn);
  const baseline = await memoRunner({ connectorId: "openalex" }, SP);
  const baseDisc = new Set(baseline.sourcesTrouvees.map(s => s.discipline));
  check("T21. baseline sequentielle reproduit la famine (1 discipline sur 7)", baseDisc.size === 1, [...baseDisc].join(","));
  const ff2 = fakeFetch();
  const fairRunner = FQC.buildFairCoverageConnectorRunner(deps, "fair", ff2.fn);
  const fair = await fairRunner({ connectorId: "openalex" }, SP);
  const fairDisc = new Set(fair.sourcesTrouvees.map(s => s.discipline));
  check("T22. mode equitable execute les 7 requetes", fair.coverage.queriesExecuted === 7 && fairDisc.size === 7);
  check("T23. plafond global <= 100 preserve", fair.log.resultsCount <= 100 && fair.log.resultsCount === 100);
  check("T23b. semantique GLOBALE de maxResults preservee (somme des parts = budget)", fair.coverage.shares.reduce((a, b) => a + b, 0) === 100);
  check("T24. maxPages reste PAR requete (jamais globalise)", fair.coverage.perQuery.every(q => q.httpRequests <= spPol.maxPages));
  check("T25. aucune requete reecrite", fair.coverage.perQuery.every((q, i) => q.requete === SP.requetesExactes[i].requete));
  const spEmpty = clone(SP); spEmpty.requetesExactes[2].requete = "   ";
  const rawFor = (fetchFn) => deps.createOpenAlexRunner({ fetchImpl: fetchFn, genId: (() => { let n = 0; return () => "r-" + (++n); })(), nowIso: () => "t" });
  const fe = await FQC.fairQueryCoverageRetrieval({ runner: rawFor(fakeFetch().fn), protocol: spEmpty });
  check("T26. requete vide ecartee proprement (6 restantes, budget preserve)", fe.coverage.queriesTotal === 6 && fe.log.resultsCount <= 100);
  const failFetch = fakeFetch({ fail: true });
  const fr = await FQC.fairQueryCoverageRetrieval({ runner: deps.createOpenAlexRunner({ fetchImpl: failFetch.fn, genId: (() => { let n = 0; return () => "x-" + (++n); })(), nowIso: () => "t" }), protocol: SP });
  check("T27. requete en echec : erreur attribuee, les autres continuent", fr.coverage.perQuery.length === 7 && fr.log.errors.length > 0);
  const dupFetch = fakeFetch({ duplicates: true });
  const fd = await FQC.fairQueryCoverageRetrieval({ runner: rawFor(dupFetch.fn), protocol: SP });
  check("T28. doublons inter-requetes dedupliques par identite EXTERNE", fd.log.resultsCount === 1 && fd.coverage.perQuery.filter(q => q.duplicatesDropped > 0).length >= 1);
  const spShort = clone(SP); spShort.retrievalPolicies[0].maxResults = 3;
  const fs3 = await FQC.fairQueryCoverageRetrieval({ runner: rawFor(fakeFetch().fn), protocol: spShort });
  check("T28b. budget < nombre de requetes : famine SIGNALEE, jamais silencieuse", fs3.coverage.starvedQueries.length === 4 && fs3.log.resultsCount === 3);
  const fsp = await FQC.fairQueryCoverageRetrieval({ runner: rawFor(fakeFetch({ shortPage: true }).fn), protocol: SP });
  check("T28c. requete terminee apres 1 page courte : pas de blocage", fsp.coverage.queriesExecuted === 7);

  // ---- readiness v2 (T29-T32) ----
  const readyCfg = () => ({
    deps, MONO01_PATH: cfg.MONO01_PATH, MONO08_V06_PATH: V06,
    executionMission: buildExecMission(), runContract: RC, searchProtocol: SP, eForchProvenance: PROV,
    pinnedHashes: PINNED.reduce((a, d) => (a[d.nom] = d.hashSha256, a), {}),
    plannerInputMissionId: MID, expectedRunContractHash: RCH, expectedProtocolHash: SPH,
    entrypointSource: "// consomme la mission fournie", rebuildCalls: { runContract: 0, searchProtocol: 0 },
    connectorRunner: fairRunner,
    coverageSimulation: { queriesTotal: 7, queriesExecuted: 7, totalResults: 100, globalBudget: 100 },
  });
  const r29 = await runReadinessV2(readyCfg());
  check("T29. readiness v2 PASS sur les artefacts reels", r29.READINESS_V2 === "PASS", r29.failedChecks.join(","));
  check("T29b. 14 controles executes", r29.checks.length === 14);
  const c30 = readyCfg(); c30.executionMission.targetDocuments = c30.executionMission.targetDocuments.map(d => { const x = clone(d); delete x.contentBase64; return x; });
  check("T30. readiness v2 ECHOUE si octets absents", (await runReadinessV2(c30)).failedChecks.includes("DOCUMENT_BYTES_READY"));
  const c31 = readyCfg(); c31.rebuildCalls = { runContract: 1, searchProtocol: 1 };
  const r31 = await runReadinessV2(c31);
  check("T31. readiness v2 ECHOUE si un rebuild a eu lieu", r31.failedChecks.includes("NO_RUNCONTRACT_REBUILD") && r31.failedChecks.includes("NO_SEARCHPROTOCOL_REBUILD"));
  const c32 = readyCfg(); c32.plannerInputMissionId = "autre";
  check("T32. readiness v2 ECHOUE sur missionId divergent", (await runReadinessV2(c32)).failedChecks.includes("MISSION_ID_BOUND"));
  const c33 = readyCfg(); c33.entrypointSource = "const m = loadMission();";
  check("T33. readiness v2 ECHOUE si l entrypoint appelle loadMission() (B-01)", (await runReadinessV2(c33)).failedChecks.includes("RUNTIME_ENTRYPOINT_READY"));
  check("T34. divergence de politique rapportee, PAS comme erreur d empreinte", r29.policy.POLICY_DIVERGENCE_DETECTED === "YES" && r29.policy.POLICY_AUTHORITY === "SEARCHPROTOCOL_CONFIRMED" && r29.reserves.length === 1);

  const failed = results.filter(r => !r.pass);
  results.forEach(r => console.log((r.pass ? "PASS — " : "FAIL — ") + r.name + (r.detail ? "  [" + r.detail + "]" : "")));
  console.log("");
  if (failed.length) { console.log("ECHECS (" + failed.length + ") :"); failed.forEach(r => console.log("  - " + r.name)); console.log(""); console.log("MONO08_V07_TESTS = FAIL"); process.exit(1); }
  console.log("TOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("");
  console.log("MONO08_V07_TESTS = PASS");
})().catch(e => { console.error("TEST_HARNESS_FAILED:", e && e.stack || e); process.exit(1); });
