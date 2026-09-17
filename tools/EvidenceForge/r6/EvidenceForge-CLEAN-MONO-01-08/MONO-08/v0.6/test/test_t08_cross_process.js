"use strict";
// test/test_t08_cross_process.js — LOCAL_CONTROLLED (aucun reseau reel)
//
// REMEDIATION (mission de remediation MONO-01-08, section 5) : le seul test
// de reprise existant (MONO-07 e2e/test_t07_e2e_resume.js) prouve un
// scenario CROSS_INSTANCE — meme processus OS, meme backend en memoire
// reutilise, seulement un nouvel objet JS wrapper. Ce fichier prouve un
// scenario CROSS_PROCESS DISTINCT et REEL :
//   - Processus A (test/cross-process/worker-a.js), lance via
//     child_process.spawn("node", [...]) : construit ses propres
//     mono01/mono03 avec un backend durable FICHIER (lib/file-durable-
//     backend.js), cree un run, l'avance jusqu'a EF-ORCH-SUBSYSTEM=SUCCESS
//     SEULEMENT (stopBeforeNode:"EF-PR-GEN-01", 13/14 noeuds restants
//     NOT_STARTED), persiste, puis se termine COMPLETEMENT (process.exit).
//   - Processus B (test/cross-process/worker-b.js), lance SEULEMENT apres
//     la sortie confirmee du processus A : processus Node totalement
//     distinct (cache de modules propre, aucun objet/Map/mono01/mono03
//     partage — verifie possible seulement parce que ce sont deux OS
//     process differents, jamais simule), ouvre UNIQUEMENT le meme
//     dossier sur disque, reconstruit mono01/mono03/runRegistry/
//     operatorApi a neuf, rehydrate via rehydrateRealMissionRun() (deja
//     teste ailleurs, jamais reimplemente ici), puis termine l'execution
//     jusqu'a 14/14 SUCCESS.
//
// Couvre T-NEW-01 (CROSS_PROCESS avec deux vrais processus Node), T-NEW-02
// (runtime B ne partage aucun objet avec A), T-NEW-03 (rehydratation
// complete des dependances reconstructibles).

const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");
const mono07LibPath = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
if (!mono07LibPath) {
  console.error("EVIDENCEFORGE_MONO07_LIB_PATH non fourni — necessaire pour reutiliser extractFrozenMono05()/driveRun() sans dupliquer leur logique.");
  process.exit(2);
}
const { extractFrozenMono05, freshDir } = require(path.join(mono07LibPath, "harness-env.js"));
const { createFileDurableBackend } = require("../lib/file-durable-backend");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

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
  if (!kitRoot) { console.error("EVIDENCEFORGE_KIT_ROOT (ou argv[2]) requis."); process.exit(2); }

  const workDir = path.join(os.tmpdir(), "mono08-cross-process-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
  freshDir(workDir);
  const eforchBackendDir = path.join(workDir, "durable-eforch");
  const mono03BackendDir = path.join(workDir, "durable-mono03");
  const runId = "cross-process-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);

  // === Contrat du backend fichier lui-meme, avant tout scenario multi-processus ===
  {
    const dir = path.join(workDir, "backend-contract-check");
    const b1 = createFileDurableBackend(dir);
    await b1.put("ns", "k1", { a: 1, nested: { b: [1, 2, 3] } });
    const b2 = createFileDurableBackend(dir); // seconde instance JS, MEME dossier — jamais le meme objet
    check("BACKEND-01. get() depuis une seconde instance (meme dossier) restitue la valeur ecrite par la premiere", JSON.stringify(await b2.get("ns", "k1")) === JSON.stringify({ a: 1, nested: { b: [1, 2, 3] } }));
    check("BACKEND-02. has() vrai apres put(), faux pour une cle absente", (await b2.has("ns", "k1")) === true && (await b2.has("ns", "absente")) === false);
    check("BACKEND-03. keys() retourne la cle reellement ecrite", (await b2.keys("ns")).includes("k1"));
    await b2.delete("ns", "k1");
    check("BACKEND-04. delete() reellement visible depuis l'autre instance (get() -> undefined)", typeof (await b1.get("ns", "k1")) === "undefined");
    check("BACKEND-05. bindingType != IN_MEMORY_TEST_ONLY (backend de production nomme)", b1.bindingType === "FILE_DURABLE");
  }

  const mono05Root = extractFrozenMono05(kitRoot, workDir);

  // === Processus A : cree le run, avance jusqu'a EF-ORCH-SUBSYSTEM=SUCCESS uniquement, persiste, sort completement ===
  const workerAArgs = [mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, runId];
  const a = await runWorker(path.join(__dirname, "cross-process", "worker-a.js"), workerAArgs);
  const aResult = extractResultLine(a.stdout, "WORKER_A_RESULT:");
  check("T-NEW-01a. processus A (pid distinct, sous-processus reellement spawn) termine avec exit code 0", a.code === 0, "code=" + a.code + " stderr=" + a.stderr.slice(0, 500));
  check("T-NEW-01b. processus A a fait progresser EF-ORCH-SUBSYSTEM a SUCCESS et AUCUN autre noeud execute (etat partiel volontaire)", aResult && aResult.ok === true, JSON.stringify(aResult));
  check("T-NEW-01c. processus A a un pid different du processus de test courant", aResult && aResult.pid && aResult.pid !== process.pid);

  // === Verification independante (depuis le processus de test, jamais l'objet du worker A) : le disque contient bien l'etat ===
  const mono03RunsDir = fs.existsSync(mono03BackendDir);
  check("T-NEW-01d. le dossier durable MONO-03 existe reellement sur disque apres la sortie du processus A", mono03RunsDir);

  // === Processus B : lance APRES la sortie confirmee de A, ouvre UNIQUEMENT le disque, rehydrate, termine a 14/14 ===
  const workerBArgs = [mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, runId];
  const b = await runWorker(path.join(__dirname, "cross-process", "worker-b.js"), workerBArgs);
  const bResult = extractResultLine(b.stdout, "WORKER_B_RESULT:");
  check("T-NEW-01e. processus B (pid distinct de A ET du processus de test) termine avec exit code 0", b.code === 0, "code=" + b.code + " stderr=" + b.stderr.slice(0, 500));
  check("T-NEW-02a. processus B a un pid different de A (deux OS process reellement distincts, jamais simules)", aResult && bResult && aResult.pid !== bResult.pid);
  check("T-NEW-03. processus B a reellement rehydrate et termine le run a 14/14 SUCCESS, en lisant SEULEMENT le disque", bResult && bResult.allSuccess === true, JSON.stringify(bResult));

  const passed = results.every(function (r) { return r.pass; });

  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");

  console.log("\n" + (passed ? "CROSS_PROCESS = PASS" : "CROSS_PROCESS = FAIL"));
  console.log("Support durable utilise : FILE_DURABLE (fichiers JSON individuels, ecriture atomique temp+rename) — lib/file-durable-backend.js, dossiers :");
  console.log("  EF-ORCH : " + eforchBackendDir);
  console.log("  MONO-03 : " + mono03BackendDir);
  console.log("Processus A pid=" + (aResult && aResult.pid) + " (exit " + a.code + ") ; Processus B pid=" + (bResult && bResult.pid) + " (exit " + b.code + ").");

  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
