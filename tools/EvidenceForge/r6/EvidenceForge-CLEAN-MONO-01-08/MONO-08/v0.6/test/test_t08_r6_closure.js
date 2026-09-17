"use strict";
// test/test_t08_r6_closure.js — LOCAL_CONTROLLED, AUCUN RESEAU REEL.
//
// REMEDIATION R6 (audit independant round 5,
// EvidenceForge-AUDIT-INDEPENDANT-R5.md) : ferme R6-F01
// (NOMINAL_REAL_SMOKE_TWO_PHASE_INTEGRATION = NOT_IMPLEMENTED — les
// primitives R5 (prepareRealScreening()/resumeRealScreening()) etaient
// valides mais jamais branchees derriere un point d'entree operateur
// reel) et R6-F02 (readiness surqualifiee — separe desormais
// CODE_READINESS/PREPARATION_READINESS/RESUME_READINESS).
//
// Les points d'entree testes ici (bin/run-real-smoke.js::runPreparePhase/
// runResumePhase/parseCliArgs/computeReadinessReport, `--phase prepare`/
// `--phase resume`) sont les VRAIES fonctions du binaire CLI reel, jamais
// une reimplementation — voir test/cli/cli-prepare-runner.js et
// test/cli/cli-resume-runner.js (sous-processus dedies, necessaires car
// runPreparePhase()/runResumePhase() appellent process.exit() via
// finish() en interne).

const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function runNode(scriptPath, args) {
  return new Promise(function (resolve) {
    const child = spawn(process.execPath, [scriptPath].concat(args), { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", function (d) { stdout += d; });
    child.stderr.on("data", function (d) { stderr += d; });
    child.on("close", function (code) { resolve({ code: code, stdout: stdout, stderr: stderr }); });
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

  const binPath = path.join(__dirname, "..", "bin", "run-real-smoke.js");
  const cliPreparePath = path.join(__dirname, "cli", "cli-prepare-runner.js");
  const cliResumePath = path.join(__dirname, "cli", "cli-resume-runner.js");
  const runner = require("../bin/run-real-smoke");

  const workRoot = path.join(os.tmpdir(), "mono08-r6-closure-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
  fs.mkdirSync(workRoot, { recursive: true });

  // =====================================================================
  // R6-F02 (structurel, en-process) — readiness a plusieurs niveaux
  // =====================================================================
  const missionFixturePath = path.join(__dirname, "..", "fixtures", "mission-real-smoke-v1.json");
  const canonicalMission = JSON.parse(fs.readFileSync(missionFixturePath, "utf8"));
  const HASH64 = "6".repeat(64);
  const completeMission = Object.assign({}, canonicalMission, {
    readyForExecution: true,
    eForchProvenance: {
      resolverRuns: canonicalMission.dimensions.map(function () { return { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64, proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, targetContextReport: [] }; }),
      plannerRun: { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
      plannerOutput: {
        sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "j" }],
        queries: canonicalMission.dimensions.map(function (d) { return { discipline: d.id, connectorId: "openalex", requete: "q", justification: "j" }; }),
        retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "s", retryPolicy: "r", rateLimitPolicy: "rl", budgetMax: "b" }],
        criteresInclusion: ["c1"], criteresExclusion: ["e1"], regleDedoublonnage: "DOI", methodeQualification: "Q",
      },
      humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel" },
    },
  });

  {
    const r08 = runner.computeReadinessReport(canonicalMission);
    check("R6-08. mission canonique incomplete : CODE_READINESS=READY", r08.REAL_SMOKE_CODE_READINESS === "READY");
    check("R6-08. mission canonique incomplete : PREPARATION_READINESS=NOT_READY", r08.REAL_SMOKE_PREPARATION_READINESS === "NOT_READY", JSON.stringify(r08));
    check("R6-08. mission canonique incomplete : PREPARE_NEXT=NOT_READY", r08.REAL_SMOKE_PREPARE_NEXT === "NOT_READY");

    const r09 = runner.computeReadinessReport(completeMission);
    check("R6-09. fixture LOCAL_CONTROLLED complete : CODE_READINESS=READY", r09.REAL_SMOKE_CODE_READINESS === "READY");
    check("R6-09. fixture LOCAL_CONTROLLED complete : PREPARATION_READINESS=READY", r09.REAL_SMOKE_PREPARATION_READINESS === "READY", JSON.stringify(r09));
    check("R6-09. fixture LOCAL_CONTROLLED complete : PREPARE_NEXT=READY_FOR_INDEPENDENT_REAL_RUN", r09.REAL_SMOKE_PREPARE_NEXT === "READY_FOR_INDEPENDENT_REAL_RUN");

    // R6-10 : jamais de combinaison contradictoire, sur un large echantillon
    // de scenarios (aucune snapshot, snapshot sans decisions, snapshot +
    // decisions valides, snapshot + decisions invalides).
    const fakeSnapshot = { snapshotId: "s1", snapshotHash: "h1", missionId: "m1", sources: [{ sourceId: "src-1" }] };
    const scenarios = [
      { snapshot: null, decisions: null },
      { snapshot: fakeSnapshot, decisions: null },
      { snapshot: fakeSnapshot, decisions: { snapshotId: "s1", snapshotHash: "h1", missionId: "m1", decisions: [{ sourceId: "src-1", acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "j" }] } },
      { snapshot: fakeSnapshot, decisions: { snapshotId: "wrong", snapshotHash: "h1", missionId: "m1", decisions: [] } },
    ];
    let noContradiction = true;
    const allReports = [canonicalMission, completeMission].map(function (m) { return runner.computeReadinessReport(m); })
      .concat(scenarios.map(function (s) { return runner.computeReadinessReport(completeMission, { snapshot: s.snapshot, auditDecisionsInput: s.decisions }); }));
    allReports.forEach(function (r) {
      if (r.REAL_SMOKE_PREPARE_NEXT === "READY_FOR_INDEPENDENT_REAL_RUN" && r.REAL_SMOKE_PREPARATION_READINESS !== "READY") noContradiction = false;
      if (r.REAL_SMOKE_RESUME_NEXT === "READY" && r.REAL_SMOKE_RESUME_READINESS !== "READY") noContradiction = false;
      if (r.REAL_SMOKE_RESUME_NEXT === "WAITING_FOR_OPERATOR_INPUT" && r.REAL_SMOKE_RESUME_READINESS !== "WAITING_FOR_OPERATOR_INPUT") noContradiction = false;
      if (r.REAL_SMOKE_PREPARE_NEXT === "NOT_READY" && r.REAL_SMOKE_CODE_READINESS === "READY" && r.REAL_SMOKE_PREPARATION_READINESS === "READY") noContradiction = false;
    });
    check("R6-10. aucune combinaison READY/NOT_READY contradictoire sur " + allReports.length + " scenarios de readiness", noContradiction, JSON.stringify(allReports));
  }

  // =====================================================================
  // R6-F01 (CLI, sous-processus reels) — arguments invalides, fail-closed
  // =====================================================================
  {
    const badPhase = await runNode(binPath, ["--phase", "bogus"]);
    check("R6-ARGS-01. --phase invalide => echec explicite, jamais devine (exit 2)", badPhase.code === 2 && /ARGS_INVALID_PHASE/.test(badPhase.stdout));

    const resumeNoArgs = await runNode(binPath, ["--phase", "resume"]);
    check("R6-ARGS-02. --phase resume sans --run-id => echec explicite (exit 2)", resumeNoArgs.code === 2 && /ARGS_MISSING_RUN_ID/.test(resumeNoArgs.stdout));

    const resumeNoSnapshot = await runNode(binPath, ["--phase", "resume", "--run-id", "x"]);
    check("R6-ARGS-03. --phase resume sans --snapshot-id => echec explicite (exit 2)", resumeNoSnapshot.code === 2 && /ARGS_MISSING_SNAPSHOT_ID/.test(resumeNoSnapshot.stdout));

    const resumeNoDecisions = await runNode(binPath, ["--phase", "resume", "--run-id", "x", "--snapshot-id", "y"]);
    check("R6-06a. --phase resume sans --audit-decisions => echec explicite (exit 2), jamais devine", resumeNoDecisions.code === 2 && /ARGS_MISSING_AUDIT_DECISIONS/.test(resumeNoDecisions.stdout));

    // R6-08 (preuve CLI reelle, sous-processus) : mission canonique livree
    // (jamais artificiellement completee) => --phase prepare refuse
    // explicitement au PRE_RETRIEVAL_GATE, jamais un appel provider tente.
    const prepareCanonical = await runNode(binPath, ["--phase", "prepare", "--kit-root", kitRoot]);
    check("R6-08b. --phase prepare (sous-processus reel) sur la mission canonique incomplete => MISSION_NOT_READY (exit 2)", prepareCanonical.code === 2 && /MISSION_NOT_READY/.test(prepareCanonical.stdout), prepareCanonical.stdout.slice(0, 300));
  }

  // =====================================================================
  // R6-01/02/03/04/09 — cycle PREPARE -> RESUME complet, sous-processus
  // dedies (cli-prepare-runner.js / cli-resume-runner.js), qui appellent
  // REELLEMENT runPreparePhase()/runResumePhase() (bin/run-real-smoke.js),
  // qui appellent REELLEMENT prepareRealScreening()/resumeRealScreening()
  // (lib/real-screening-workflow.js, R5, jamais dupliquees).
  // =====================================================================
  let sharedSnapshotId = null, sharedSnapshotBackendDir = null, sharedWork = null;
  {
    const workDir = path.join(workRoot, "cycle-ok");
    fs.mkdirSync(workDir, { recursive: true });
    const fetchCountFile = path.join(workDir, "fetch-count.txt");
    sharedWork = workDir;

    const prep = await runNode(cliPreparePath, [kitRoot, mono07LibPath, workDir, fetchCountFile]);
    const prepResult = extractResultLine(prep.stdout, "CLI_PREPARE_RESULT:");
    check("R6-01. le sous-processus CLI PREPARE termine sur OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS (exit 4) — prepareRealScreening() reellement appele via runPreparePhase()", prep.code === 4 && prepResult && prepResult.state === "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS", "code=" + prep.code + " stderr=" + prep.stderr.slice(0, 300));
    check("R6-02a. PREPARE produit un snapshotId/snapshotHash/sourceCount/sourceIds reels (>=2 sources distinctes)", prepResult && prepResult.sourceCount === 2 && new Set(prepResult.sourceIds).size === 2);
    check("R6-02b. PREPARE indique le chemin du template auditDecisions (jamais un identifiant sans support concret)", prepResult && fs.existsSync(prepResult.auditDecisionsTemplatePath));
    check("R6-09b (preuve CLI reelle). readiness de la reponse PREPARE : CODE_READINESS=READY, PREPARATION_READINESS=READY", prepResult && prepResult.readiness.REAL_SMOKE_CODE_READINESS === "READY" && prepResult.readiness.REAL_SMOKE_PREPARATION_READINESS === "READY");

    let templateContent = null;
    if (prepResult) templateContent = JSON.parse(fs.readFileSync(prepResult.auditDecisionsTemplatePath, "utf8"));
    check("R6-02c. le template genere ne pre-remplit AUCUNE decision (acteur/date/decision/justification tous null)", templateContent && templateContent.decisions.every(function (d) { return d.acteur === null && d.date === null && d.decision === null && d.justification === null; }));

    check("R6-A01-fetch. compteur d'appels provider = 1 apres PREPARE (jamais 0, jamais >1)", fs.readFileSync(fetchCountFile, "utf8").trim() === "1");

    if (prepResult) {
      sharedSnapshotId = prepResult.snapshotId;
      sharedSnapshotBackendDir = prepResult.snapshotBackendDir;
      const decisionsInput = {
        snapshotId: prepResult.snapshotId, snapshotHash: prepResult.snapshotHash, missionId: prepResult.missionId,
        decisions: prepResult.sourceIds.map(function (sid) { return { sourceId: sid, acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "Pertinent (test R6)." }; }),
      };
      const decisionsPath = path.join(workDir, "decisions-valid.json");
      fs.writeFileSync(decisionsPath, JSON.stringify(decisionsInput, null, 2));

      const resume = await runNode(cliResumePath, [kitRoot, mono07LibPath, workDir, "r6-run-ok", prepResult.snapshotId, decisionsPath]);
      const resumeResult = extractResultLine(resume.stdout, "CLI_RESUME_RESULT:");
      check("R6-03. le sous-processus CLI RESUME termine sur RESUME_COMPLETE (exit 0) — resumeRealScreening() reellement appele via runResumePhase()", resume.code === 0 && resumeResult && resumeResult.state === "RESUME_COMPLETE", "code=" + resume.code + " stderr=" + resume.stderr.slice(0, 300) + " stdout=" + resume.stdout.slice(-500));
      check("R6-04. RESUME n'effectue AUCUN retrieval supplementaire (compteur toujours a 1 apres RESUME)", fs.readFileSync(fetchCountFile, "utf8").trim() === "1");
      check("R6-09c (preuve CLI reelle). readiness de la reponse RESUME : RESUME_READINESS=READY, RESUME_NEXT=READY", resumeResult && resumeResult.readiness.REAL_SMOKE_RESUME_READINESS === "READY" && resumeResult.readiness.REAL_SMOKE_RESUME_NEXT === "READY");
    }
  }

  // =====================================================================
  // R6-05 — RESUME sans snapshot (snapshotId inconnu) => FAIL
  // =====================================================================
  {
    const workDir = path.join(workRoot, "no-snapshot");
    fs.mkdirSync(workDir, { recursive: true });
    const decisionsPath = path.join(workDir, "decisions.json");
    fs.writeFileSync(decisionsPath, JSON.stringify({ snapshotId: "snapshot-inexistant", snapshotHash: "h", missionId: "m", decisions: [] }));
    const resume = await runNode(cliResumePath, [kitRoot, mono07LibPath, workDir, "r6-run-no-snap", "snapshot-inexistant", decisionsPath]);
    check("R6-05. RESUME avec un snapshotId inconnu (aucun snapshot persiste) => FAIL explicite (exit 2, SNAPSHOT_NOT_FOUND)", resume.code === 2 && /SNAPSHOT_NOT_FOUND/.test(resume.stdout), "code=" + resume.code + " stdout=" + resume.stdout.slice(-400));
  }

  // =====================================================================
  // R6-06b — RESUME avec un fichier auditDecisions VIDE (fourni mais
  // structurellement insuffisant) => OPERATOR_INPUT_REQUIRED (exit 4),
  // jamais silencieusement accepte.
  // =====================================================================
  if (sharedSnapshotId) {
    const workDir = path.join(workRoot, "empty-decisions");
    fs.mkdirSync(workDir, { recursive: true });
    const decisionsPath = path.join(workDir, "decisions-empty.json");
    fs.writeFileSync(decisionsPath, JSON.stringify({ snapshotId: sharedSnapshotId, snapshotHash: "n-importe-quoi", missionId: "n-importe-quoi", decisions: [] }));
    const resume = await runNode(cliResumePath, [kitRoot, mono07LibPath, sharedWork, "r6-run-empty-dec", sharedSnapshotId, decisionsPath]);
    check("R6-06b. RESUME avec un fichier auditDecisions structurellement vide/invalide => OPERATOR_INPUT_REQUIRED (exit 4), jamais accepte silencieusement", resume.code === 4 && /OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS/.test(resume.stdout), "code=" + resume.code + " stdout=" + resume.stdout.slice(-400));
  }

  // =====================================================================
  // R6-07 — snapshot altere sur disque entre PREPARE et RESUME => FAIL
  // =====================================================================
  if (sharedSnapshotId && sharedSnapshotBackendDir) {
    const workDir = path.join(workRoot, "tampered-snapshot");
    fs.mkdirSync(workDir, { recursive: true });
    const { createFileDurableBackend } = require("../lib/file-durable-backend");
    const backend = createFileDurableBackend(sharedSnapshotBackendDir);
    const snapshot = await backend.get("retrieval-snapshots", sharedSnapshotId);
    const tampered = Object.assign({}, snapshot, { sources: snapshot.sources.map(function (s, i) { return i === 0 ? Object.assign({}, s, { titre: "TITRE ALTERE (R6-07)" }) : s; }) });
    await backend.put("retrieval-snapshots", sharedSnapshotId, tampered);

    const decisionsInput = {
      snapshotId: sharedSnapshotId, snapshotHash: snapshot.snapshotHash, missionId: snapshot.missionId,
      decisions: snapshot.sources.map(function (s) { return { sourceId: s.sourceId, acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "j" }; }),
    };
    const decisionsPath = path.join(workDir, "decisions.json");
    fs.writeFileSync(decisionsPath, JSON.stringify(decisionsInput));

    // REMEDIATION (auto-relecture) : persistenceDir transmis au sous-
    // processus DOIT rester `sharedWork` (celui de la section PREPARE
    // ci-dessus), jamais `workDir` (local a cette section) — c'est
    // `sharedWork` qui determine le dossier snapshotBackendDir OU le
    // snapshot altere a ete ecrit juste au-dessus ; un dossier different
    // ne trouverait simplement AUCUN snapshot (SNAPSHOT_NOT_FOUND), pas
    // celui altere (SNAPSHOT_INTEGRITY_ERROR) qu'on veut prouver ici.
    const resume = await runNode(cliResumePath, [kitRoot, mono07LibPath, sharedWork, "r6-run-tampered", sharedSnapshotId, decisionsPath]);
    check("R6-07. snapshot altere sur disque entre PREPARE et RESUME => FAIL explicite (exit 1, SNAPSHOT_INTEGRITY_ERROR), jamais accepte silencieusement", resume.code === 1 && /SNAPSHOT_INTEGRITY_ERROR/.test(resume.stdout), "code=" + resume.code + " stdout=" + resume.stdout.slice(-400));

    // Restaure le snapshot original — jamais laisser un etat altere
    // pollueur pour un test ulterieur qui relirait le meme backend.
    await backend.put("retrieval-snapshots", sharedSnapshotId, snapshot);
  }

  const passed = results.every(function (r) { return r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("\n" + (passed ? "R6_CLOSURE = PASS" : "R6_CLOSURE = FAIL"));
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
