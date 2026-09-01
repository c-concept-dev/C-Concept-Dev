"use strict";
// test/test_t08_r5_closure.js — LOCAL_CONTROLLED, AUCUN RESEAU REEL.
//
// REMEDIATION R5 (audit independant round 4, EvidenceForge-AUDIT-
// INDEPENDANT-R4.md) : prouve separement chaque garantie R4-A01 (le
// mission-gate PRE_RETRIEVAL n'exige plus d'auditDecisions — la
// dependance cyclique temporelle mission-gate <-> auditDecisions <->
// retrieval est cassee), R4-A02 (workflow gouverne en deux phases
// PREPARE_REAL_SCREENING / RESUME_REAL_SCREENING, avec RetrievalSnapshot
// durable, hashe, immuable), et R4-A03 (readiness a trois niveaux —
// couvert structurellement ici, documente en detail dans
// AUDIT-REMEDIATION/26-READINESS-SEMANTICS.md).
//
// Sections : R5-A01 (PRE/POST_RETRIEVAL_GATE), R5-A02 (mecanique
// PREPARE/RESUME + durabilite), integrite du snapshot (alteration =>
// SNAPSHOT_INTEGRITY_ERROR), coherence des auditDecisions (rejets
// specifiques), et une preuve CROSS_PROCESS reelle (deux processus Node
// distincts, aucun backend memoire partage — mandat R5 section 31).

const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function jsonResponse(body) { return { ok: true, status: 200, json: async function () { return body; } }; }
const HASH64 = "5".repeat(64);

function buildMission() {
  return { dimensions: [{ id: "DIM_A", label: "Dimension A" }], targetDocuments: [{ documentId: "t1", title: "Target 1", url: "https://example.invalid/t1" }] };
}
function buildRealProvenance() {
  return {
    resolverRuns: [{ provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64, proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, targetContextReport: [] }],
    plannerRun: { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
    plannerOutput: {
      sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "j" }],
      queries: [{ discipline: "DIM_A", connectorId: "openalex", requete: "q", justification: "j" }],
      retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "s", retryPolicy: "r", rateLimitPolicy: "rl", budgetMax: "b" }],
      criteresInclusion: ["c1"], criteresExclusion: ["e1"], regleDedoublonnage: "DOI", methodeQualification: "Q",
    },
    humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel (test R5)" },
  };
}
function buildTwoRecordFetchImpl(counterRef) {
  return async function () {
    counterRef.count++;
    return jsonResponse({ results: [
      { display_name: "Record R5 A", authorships: [{ author: { display_name: "Author A" } }], publication_date: "2024-01-01", doi: "10.1/R5A", id: "https://openalex.org/W5A" },
      { display_name: "Record R5 B", authorships: [{ author: { display_name: "Author B" } }], publication_date: "2024-02-02", doi: "10.1/R5B", id: "https://openalex.org/W5B" },
    ] });
  };
}
function validAuditDecisionsInputFor(snapshot) {
  return {
    snapshotId: snapshot.snapshotId, snapshotHash: snapshot.snapshotHash, missionId: snapshot.missionId,
    decisions: snapshot.sources.map(function (s) { return { sourceId: s.sourceId, acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "Pertinent (test R5)." }; }),
  };
}

function runWorker(scriptPath, args) {
  return new Promise(function (resolve) {
    const child = spawn(process.execPath, [scriptPath].concat(args), { stdio: ["ignore", "pipe", "pipe"] });
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
  const { buildDurableComponents } = require("../lib/durable-real-env");
  const { createFileDurableBackend } = require("../lib/file-durable-backend");
  const {
    buildRetrievalSnapshot, verifySnapshotIntegrity, prepareRealScreening, resumeRealScreening, buildAuditDecisionsTemplate,
  } = require("../lib/real-screening-workflow");
  const {
    loadEForchDeps, validatePreRetrievalProvenance, validateRealEForchProvenance, validatePostRetrievalAuditDecisions,
    buildConfirmedRunContractForMission,
  } = require("../lib/eforch-artifacts");
  const { describeMissionGateStatus } = require("../bin/run-real-smoke");

  const workRoot = path.join(os.tmpdir(), "mono08-r5-closure-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
  freshDir(workRoot);
  const mono05Root = extractFrozenMono05(kitRoot, workRoot);

  // =====================================================================
  // R5-A01 — PRE_RETRIEVAL_GATE ne depend plus des auditDecisions
  // =====================================================================
  {
    const mission = buildMission();
    const prov = buildRealProvenance();

    const missionWithoutAuditDecisions = Object.assign({}, mission, {
      readyForExecution: true,
      eForchProvenance: { resolverRuns: prov.resolverRuns, plannerRun: prov.plannerRun, plannerOutput: prov.plannerOutput, humanValidation: prov.humanValidation },
      // AUCUNE cle auditDecisions — R5-A01-01/02.
    });

    check("R5-A01-01. mission pre-retrieval complete SANS auditDecisions => validatePreRetrievalProvenance PASS", validatePreRetrievalProvenance(missionWithoutAuditDecisions).valid === true, JSON.stringify(validatePreRetrievalProvenance(missionWithoutAuditDecisions).problems));

    check("R5-A01-02. la MEME mission (sans auditDecisions) => describeMissionGateStatus (chemin nominal bin/run-real-smoke.js) ne bloque plus (status=PASS, jamais MISSION_NOT_READY)", describeMissionGateStatus(missionWithoutAuditDecisions).status === "PASS", JSON.stringify(describeMissionGateStatus(missionWithoutAuditDecisions)));

    check("R5-A01-02b. validateRealEForchProvenance() (conservee, wrapper retro-compatible) continue elle EXIGE auditDecisions — comportement historique inchange, jamais supprime, seulement plus appelee par le mission-gate", validateRealEForchProvenance(missionWithoutAuditDecisions).valid === false);

    check("R5-A01-03. POST_RETRIEVAL_GATE sans auditDecisionsInput => invalid (OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS)", validatePostRetrievalAuditDecisions({ snapshotId: "s1", sources: [] }, undefined).valid === false);

    check("R5-A01-04. auditDecisions soumises AVANT qu'aucun snapshot n'existe (snapshot absent/null) => refuse structurellement", validatePostRetrievalAuditDecisions(null, { snapshotId: "s1", decisions: [] }).valid === false);
  }

  // =====================================================================
  // R5-A02 — PREPARE_REAL_SCREENING / RESUME_REAL_SCREENING (mecanique
  // complete, meme processus) + durabilite + no-refetch
  // =====================================================================
  let sharedSnapshot = null, sharedSnapshotBackend = null, sharedSnapshotBackendDir = null;
  {
    const eforchBackendDir = path.join(workRoot, "durable-eforch-a02");
    const mono03BackendDir = path.join(workRoot, "durable-mono03-a02");
    sharedSnapshotBackendDir = path.join(workRoot, "durable-snapshots-a02");
    const env = buildDurableComponents(mono05Root, { eforchBackendDir: eforchBackendDir, mono03BackendDir: mono03BackendDir, providerConfigs: {}, secrets: {} });
    sharedSnapshotBackend = createFileDurableBackend(sharedSnapshotBackendDir);

    const mission = buildMission();
    const documentBytesByUrl = { "https://example.invalid/t1": new TextEncoder().encode("contenu R5-A02") };
    const counter = { count: 0 };

    const prepResult = await prepareRealScreening(env, {
      mission: mission, missionQuestion: "Question R5-A02 ?", documentBytesByUrl: documentBytesByUrl,
      openAlexFetchImpl: buildTwoRecordFetchImpl(counter), realProvenance: buildRealProvenance(), snapshotBackend: sharedSnapshotBackend,
    });

    check("R5-A02-01. PREPARE_REAL_SCREENING execute le retrieval EXACTEMENT une fois", counter.count === 1, "count=" + counter.count);
    check("R5-A02-04. PREPARE_REAL_SCREENING s'arrete explicitement sur OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS (jamais ne tente EF-01D)", prepResult.state === "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS");

    const persisted = await sharedSnapshotBackend.get("retrieval-snapshots", prepResult.snapshotId);
    check("R5-A02-02. le RetrievalSnapshot est reellement PERSISTE (relu depuis le backend durable, pas seulement retourne en memoire)", !!persisted && persisted.snapshotId === prepResult.snapshotId);
    check("R5-A02-03. le snapshot contient des sourceId REELS et DISTINCTS (>= 2, jamais fabriques avant retrieval)", persisted.sourceCount === 2 && new Set(persisted.sources.map(function (s) { return s.sourceId; })).size === 2, JSON.stringify(persisted.sources.map(function (s) { return s.sourceId; })));
    check("R5-A01-05. aucun sourceId predictif/fictif : chaque source du snapshot porte des metadonnees derivees du retrieval reel (titre/auteur distincts pour chaque enregistrement)", persisted.sources[0].titre !== persisted.sources[1].titre && persisted.sources[0].auteurOuOrganisme !== persisted.sources[1].auteurOuOrganisme);

    const template = buildAuditDecisionsTemplate(persisted);
    check("R5-A02-05. le template d'auditDecisions genere depuis le snapshot ne pre-remplit JAMAIS acteur/date/decision/justification (tous null)", template.decisions.every(function (d) { return d.acteur === null && d.date === null && d.decision === null && d.justification === null; }));
    check("R5-A02-05b. le template pre-remplit uniquement sourceId/titre/reference (aide operateur), coherent avec le snapshot", template.snapshotId === persisted.snapshotId && template.snapshotHash === persisted.snapshotHash);

    const auditDecisionsInput = validAuditDecisionsInputFor(persisted);
    const runId = "r5-a02-" + Date.now().toString(36);
    const documentContentByUrl = { "https://example.invalid/t1": "contenu R5-A02" };
    const resumeResult = await resumeRealScreening(env, {}, async function () { return "{}"; }, {
      runId: runId, snapshotBackend: sharedSnapshotBackend, snapshotId: persisted.snapshotId, auditDecisionsInput: auditDecisionsInput,
      mission: mission, documentContentByUrl: documentContentByUrl,
    });
    check("R5-A02-07. RESUME_REAL_SCREENING avec des decisions valides reprend correctement (missionId coherent avec le snapshot)", resumeResult && resumeResult.missionId === persisted.missionId);
    check("R5-A02-08. RESUME_REAL_SCREENING n'effectue AUCUN retrieval supplementaire (compteur d'appels provider reste a 1 apres RESUME)", counter.count === 1, "count=" + counter.count);

    const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));
    await driveRun(env.operatorApi, runId, { stopBeforeNode: "EF-PR-GEN-01" });
    const graph = await env.operatorApi.getGraph(runId);
    const efOrch = graph.nodes.find(function (n) { return n.nodeId === "EF-ORCH-SUBSYSTEM"; });
    check("R5-A02-07b. le graphe reel (EF-ORCH-SUBSYSTEM) atteint SUCCESS depuis les artefacts REJOUES du snapshot, sans second retrieval", !!efOrch && efOrch.state === "SUCCESS", JSON.stringify(efOrch));
    check("R5-A02-08b. AUCUN retrieval supplementaire meme apres avoir fait tourner le graphe (compteur toujours a 1)", counter.count === 1, "count=" + counter.count);

    sharedSnapshot = persisted;
  }

  // =====================================================================
  // Integrite du snapshot — toute alteration => SNAPSHOT_INTEGRITY_ERROR
  // =====================================================================
  {
    const eforchBackendDir = path.join(workRoot, "durable-eforch-integrity");
    const cfgProbe = require(path.join(mono05Root, "app", "server", "config.js"));
    const deps = loadEForchDeps(cfgProbe.MONO01_PATH);

    check("INTEGRITY-00. le snapshot NON altere reussit verifySnapshotIntegrity (pas de faux positif)", await verifySnapshotIntegrity(deps, sharedSnapshot).then(function () { return true; }).catch(function () { return false; }));

    const tamperFields = [
      { label: "titre d'une source", mutate: function (s) { s.sources = s.sources.slice(); s.sources[0] = Object.assign({}, s.sources[0], { titre: "TITRE ALTERE" }); } },
      { label: "sourceId d'une source", mutate: function (s) { s.sources = s.sources.slice(); s.sources[0] = Object.assign({}, s.sources[0], { sourceId: "sourceId-fabrique" }); } },
      { label: "searchProtocolHash", mutate: function (s) { s.searchProtocolHash = HASH64; } },
      { label: "runContractHash", mutate: function (s) { s.runContractHash = HASH64; } },
      { label: "plannerOutputHash", mutate: function (s) { s.plannerOutputHash = HASH64; } },
      { label: "retrievalResultHash", mutate: function (s) { s.retrievalResultHash = HASH64; } },
      { label: "snapshotHash lui-meme", mutate: function (s) { s.snapshotHash = HASH64; } },
    ];
    for (const t of tamperFields) {
      const tampered = JSON.parse(JSON.stringify(sharedSnapshot));
      t.mutate(tampered);
      let threw = null;
      try { await verifySnapshotIntegrity(deps, tampered); } catch (e) { threw = e; }
      check("INTEGRITY-01. alteration de \"" + t.label + "\" => SNAPSHOT_INTEGRITY_ERROR (fail-closed reel)", !!threw && threw.code === "SNAPSHOT_INTEGRITY_ERROR", threw ? threw.message.slice(0, 120) : "aucune exception");
    }
  }

  // =====================================================================
  // Coherence des auditDecisions (POST_RETRIEVAL_GATE) — rejets specifiques
  // =====================================================================
  {
    const validInput = validAuditDecisionsInputFor(sharedSnapshot);
    check("AUDIT-DEC-00. decisions valides, exhaustives, indexees par les vrais sourceId => PASS", validatePostRetrievalAuditDecisions(sharedSnapshot, validInput).valid === true, JSON.stringify(validatePostRetrievalAuditDecisions(sharedSnapshot, validInput).problems));

    const unknownSourceId = Object.assign({}, validInput, { decisions: validInput.decisions.concat([{ sourceId: "source-inconnue-fabriquee", acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "x" }]) });
    check("AUDIT-DEC-01. decision ciblant un sourceId inconnu du snapshot => FAIL", validatePostRetrievalAuditDecisions(sharedSnapshot, unknownSourceId).valid === false);

    const incoherentSnapshotId = Object.assign({}, validInput, { snapshotId: "snapshot-different" });
    check("AUDIT-DEC-02. snapshotId incoherent => FAIL", validatePostRetrievalAuditDecisions(sharedSnapshot, incoherentSnapshotId).valid === false);

    const incoherentSnapshotHash = Object.assign({}, validInput, { snapshotHash: HASH64 });
    check("AUDIT-DEC-03. snapshotHash incoherent => FAIL", validatePostRetrievalAuditDecisions(sharedSnapshot, incoherentSnapshotHash).valid === false);

    const incoherentMissionId = Object.assign({}, validInput, { missionId: "mission-differente" });
    check("AUDIT-DEC-04. missionId incoherent => FAIL", validatePostRetrievalAuditDecisions(sharedSnapshot, incoherentMissionId).valid === false);

    const contradictoryDuplicate = Object.assign({}, validInput, {
      decisions: validInput.decisions.concat([Object.assign({}, validInput.decisions[0], { decision: "exclu", justification: "Decision CONTRADICTOIRE pour la meme source." })]),
    });
    check("AUDIT-DEC-05. doublon CONTRADICTOIRE (deux decisions differentes sur le meme sourceId) => FAIL", validatePostRetrievalAuditDecisions(sharedSnapshot, contradictoryDuplicate).valid === false);

    const nonContradictoryDuplicate = Object.assign({}, validInput, { decisions: validInput.decisions.concat([validInput.decisions[0]]) });
    check("AUDIT-DEC-05b. doublon IDENTIQUE (meme decision repetee) reste accepte (pas une contradiction)", validatePostRetrievalAuditDecisions(sharedSnapshot, nonContradictoryDuplicate).valid === true);

    const missingDecision = Object.assign({}, validInput, { decisions: validInput.decisions.slice(0, validInput.decisions.length - 1) });
    check("AUDIT-DEC-06. decision manquante pour une source du snapshot (exhaustivite requise) => FAIL", validatePostRetrievalAuditDecisions(sharedSnapshot, missingDecision).valid === false);

    const syntheticActor = Object.assign({}, validInput, { decisions: validInput.decisions.map(function (d, i) { return i === 0 ? Object.assign({}, d, { acteur: "system" }) : d; }) });
    check("AUDIT-DEC-07. decision synthetique (acteur != \"human\") en mode REAL => FAIL (jamais une decision automatisee acceptee)", validatePostRetrievalAuditDecisions(sharedSnapshot, syntheticActor).valid === false);
  }

  // =====================================================================
  // Preuve CROSS_PROCESS reelle du workflow deux phases (mandat section 31)
  // =====================================================================
  {
    const eforchBackendDir = path.join(workRoot, "durable-eforch-cp");
    const mono03BackendDir = path.join(workRoot, "durable-mono03-cp");
    const snapshotBackendDir = path.join(workRoot, "durable-snapshots-cp");
    const runId = "r5-cross-process-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);

    const a = await runWorker(path.join(__dirname, "cross-process", "worker-prepare-screening.js"), [mono05Root, eforchBackendDir, mono03BackendDir, snapshotBackendDir, runId]);
    const aResult = extractResultLine(a.stdout, "WORKER_PREPARE_RESULT:");
    check("CROSS-PROCESS-01. processus A (PREPARE_REAL_SCREENING, sous-processus reellement spawn) termine avec exit code 0", a.code === 0, "code=" + a.code + " stderr=" + a.stderr.slice(0, 500));
    check("CROSS-PROCESS-02. processus A atteint OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS avec >=2 sourceId reels et distincts", aResult && aResult.state === "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS" && aResult.sourceCount === 2 && new Set(aResult.sourceIds).size === 2, JSON.stringify(aResult));
    check("CROSS-PROCESS-03. le template de decisions du processus A ne pre-remplit aucune decision", aResult && aResult.templateDecisionsAllNull === true);
    check("CROSS-PROCESS-04. processus A a un pid distinct du processus de test courant", aResult && aResult.pid && aResult.pid !== process.pid);

    const sourceIdsJson = JSON.stringify(aResult.sourceIds);
    const b = await runWorker(path.join(__dirname, "cross-process", "worker-resume-screening.js"), [mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, snapshotBackendDir, runId, aResult.snapshotId, sourceIdsJson]);
    const bResult = extractResultLine(b.stdout, "WORKER_RESUME_RESULT:");
    check("CROSS-PROCESS-05. processus B (RESUME_REAL_SCREENING, lance APRES la sortie complete de A) termine avec exit code 0", b.code === 0, "code=" + b.code + " stderr=" + b.stderr.slice(0, 500));
    check("CROSS-PROCESS-06. processus B a un pid different de A ET du processus de test (deux OS process reellement distincts)", aResult && bResult && aResult.pid !== bResult.pid && bResult.pid !== process.pid);
    check("CROSS-PROCESS-07. processus B a reussi a charger le snapshot PAR SON snapshotId depuis le disque (aucun objet JS partage avec A) et a fait progresser EF-ORCH-SUBSYSTEM a SUCCESS", bResult && bResult.ok === true, JSON.stringify(bResult));
    check("R5-A02-06. un NOUVEAU processus (B) peut relire le snapshot persiste par un AUTRE processus (A) et reprendre a partir de lui — aucun backend memoire partage", bResult && bResult.ok === true);
  }

  const passed = results.every(function (r) { return r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("\n" + (passed ? "R5_CLOSURE = PASS" : "R5_CLOSURE = FAIL"));
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
