"use strict";
/**
 * MONO-06 — test/run-all.js
 *
 * Suite de tests de MONO-06 lui-meme. Ne teste jamais un lot gele via ce
 * fichier (leurs propres suites restent la seule source de verite sur
 * leur propre comportement) — teste uniquement que le HARNAIS se comporte
 * correctement : detection d'anomalies injectees (adversarial), non-
 * regression du harnais (rejoue deux fois), portabilite (aucun chemin de
 * session).
 *
 * Usage : node test/run-all.js --kit-root <chemin vers le kit HANDOFF>
 * (le chemin est TOUJOURS un argument explicite — jamais un defaut).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { runHarness } = require("../lib/harness");
const { ARTIFACTS } = require("../lib/artifact-registry");

// Resout toujours le chemin de ZIP depuis le registre (source unique de
// verite), jamais un nom de fichier fige en dur ici — une future rebaseline
// (ex: R1, R2...) ne doit jamais casser silencieusement ces scenarios
// adversariaux (lecon tiree de la rebaseline R1 elle-meme, ou une premiere
// version de ce fichier codait encore "EvidenceForge-MONO-02-v1.zip").
function zipRelFor(artifactId) {
  const a = ARTIFACTS.find((x) => x.id === artifactId);
  if (!a) throw new Error(`zipRelFor: artefact inconnu "${artifactId}"`);
  return a.zipPath;
}

let passCount = 0;
let failCount = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`PASS — ${label}`);
    passCount++;
  } else {
    console.log(`FAIL — ${label}`);
    failCount++;
  }
}

function freshTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function copyKit(srcKitRoot) {
  const dest = freshTmp("mono06-testkit-");
  execFileSync("cp", ["-r", srcKitRoot, dest]);
  return path.join(dest, path.basename(srcKitRoot));
}

function rebuildZip(kitRoot, relZipPath, mutateFn) {
  const absZipPath = path.join(kitRoot, relZipPath);
  const extractDir = freshTmp("mono06-mutate-");
  execFileSync("unzip", ["-oq", absZipPath, "-d", extractDir]);
  const rootDirName = fs.readdirSync(extractDir)[0];
  mutateFn(path.join(extractDir, rootDirName));
  fs.rmSync(absZipPath);
  execFileSync("bash", ["-c", `cd "${extractDir}" && zip -qr "${absZipPath}" "${rootDirName}"`]);
}

function main() {
  const args = process.argv.slice(2);
  const kitRootIdx = args.indexOf("--kit-root");
  if (kitRootIdx === -1 || !args[kitRootIdx + 1]) {
    console.error("Usage: node test/run-all.js --kit-root <chemin vers le kit HANDOFF>");
    process.exit(2);
  }
  const originalKitRoot = path.resolve(args[kitRootIdx + 1]);

  // T06-HARNESS-01 : le kit propre (non mute) doit passer integralement
  {
    const work = freshTmp("mono06-work-clean-");
    const report = runHarness({ kitRoot: originalKitRoot, workRoot: work, skipTestExecution: true });
    assert(report.overallStatus !== "FAIL", "T06-HARNESS-01. kit propre (non mute) -> pas de FAIL en mode integrite seule");
    fs.rmSync(work, { recursive: true, force: true });
  }

  // T06-HARNESS-02 (critere audit #2a) : octet modifie dans une dependance imbriquee -> detecte
  {
    const mutatedKit = copyKit(originalKitRoot);
    rebuildZip(mutatedKit, zipRelFor("MONO-02"), (root) => {
      const target = path.join(root, "dependencies/MONO-01/dependencies/ef-orch-hash-v0.1.js");
      const buf = fs.readFileSync(target);
      buf[50] ^= 0xff;
      fs.writeFileSync(target, buf);
    });
    const work = freshTmp("mono06-work-adv02-");
    const report = runHarness({ kitRoot: mutatedKit, workRoot: work, skipTestExecution: true });
    const mono02 = report.perArtifact["MONO-02"];
    const detected = mono02.artifactStatus === "FAIL" &&
      (mono02.manifest.status === "FAIL" || (mono02.nested || []).some((n) => n.status === "FAIL"));
    assert(detected, "T06-HARNESS-02. octet modifie dans dependance imbriquee -> FROZEN_FILE_MUTATION detectee (manifest ou nested)");
    assert(report.overallStatus === "FAIL", "T06-HARNESS-02b. le statut global reflete l'anomalie (jamais un faux vert)");
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(path.dirname(mutatedKit), { recursive: true, force: true });
  }

  // T06-HARNESS-03 (critere audit #2b) : contrat JSON retire -> detecte par T06-12
  {
    const mutatedKit = copyKit(originalKitRoot);
    rebuildZip(mutatedKit, zipRelFor("MONO-03"), (root) => {
      fs.rmSync(path.join(root, "contracts/run-state-v1.json"));
    });
    const work = freshTmp("mono06-work-adv03-");
    const report = runHarness({ kitRoot: mutatedKit, workRoot: work, skipTestExecution: true });
    const mono03 = report.perArtifact["MONO-03"];
    assert(mono03.contracts.status === "FAIL" && mono03.contracts.countMismatch === true, "T06-HARNESS-03. contrat JSON retire -> T06-12 detecte explicitement (countMismatch)");
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(path.dirname(mutatedKit), { recursive: true, force: true });
  }

  // T06-HARNESS-04 (critere audit #2c) : chaine JMJS injectee dans un fichier de lib MONO -> detectee
  {
    const mutatedKit = copyKit(originalKitRoot);
    rebuildZip(mutatedKit, zipRelFor("MONO-02"), (root) => {
      const target = path.join(root, "lib/node-runners.js");
      const content = fs.readFileSync(target, "utf8");
      fs.writeFileSync(target, "// pilote JMJS force ici\n" + content);
    });
    const work = freshTmp("mono06-work-adv04-");
    const report = runHarness({ kitRoot: mutatedKit, workRoot: work, skipTestExecution: true });
    const mono02 = report.perArtifact["MONO-02"];
    assert(mono02.staticSearch.pilotHardcoding.status === "FAIL", "T06-HARNESS-04. injection JMJS dans lib/ MONO-02 -> T06-13 detecte");
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(path.dirname(mutatedKit), { recursive: true, force: true });
  }

  // T06-HARNESS-05 (critere audit #1, corrige) : T06-15 est FAIL-CLOSED —
  // un secret reel doit etre detecte QUEL QUE SOIT son emplacement,
  // y compris .md/test/fixtures/scripts (plus aucune exclusion automatique
  // par dossier depuis la correction post-audit du 30 aout 2026).
  {
    const REAL_SECRET = "sk-REALSECRET1234567890";
    const scenarios = [
      { label: "lib/", zipRel: zipRelFor("MONO-04"), fileRel: "lib/external-execution-gateway.js", artifactId: "MONO-04" },
      { label: "README.md (documentation)", zipRel: zipRelFor("MONO-04"), fileRel: "README.md", artifactId: "MONO-04" },
      { label: "test/ (test)", zipRel: zipRelFor("MONO-04"), fileRel: "test/test_t04_idempotence_conflict_01_07.js", artifactId: "MONO-04" },
      { label: "fixtures/ (fixture)", zipRel: zipRelFor("EF-04"), fileRel: "fixtures/case-report-3dims-TEST.json", artifactId: "EF-04" }
    ];

    for (const sc of scenarios) {
      const mutatedKit = copyKit(originalKitRoot);
      rebuildZip(mutatedKit, sc.zipRel, (root) => {
        const target = path.join(root, sc.fileRel);
        const content = fs.readFileSync(target, "utf8");
        fs.writeFileSync(target, `// ${REAL_SECRET}\n` + content);
      });
      const work = freshTmp("mono06-work-adv05-");
      const report = runHarness({ kitRoot: mutatedKit, workRoot: work, skipTestExecution: true });
      const entry = report.perArtifact[sc.artifactId];
      assert(entry.staticSearch.realSecrets.status === "FAIL", `T06-HARNESS-05. secret reel injecte dans ${sc.label} (${sc.artifactId}) -> T06-15 FAIL (fail-closed, aucune exclusion par dossier)`);

      // Verification de redaction (correction post-audit #2) : la valeur complete
      // ne doit JAMAIS apparaitre dans le rapport serialise, sous aucune forme.
      const reportJson = JSON.stringify(report);
      assert(!reportJson.includes(REAL_SECRET), `T06-HARNESS-05b. (${sc.label}) la chaine complete du secret est ABSENTE du rapport JSON (redaction verifiee)`);

      fs.rmSync(work, { recursive: true, force: true });
      fs.rmSync(path.dirname(mutatedKit), { recursive: true, force: true });
    }
  }

  // T06-HARNESS-05c : un secret synthetique DEJA CONNU (allowlist exacte
  // fichier+hash) reste exempte, mais toute AUTRE valeur au meme endroit
  // (meme motif sk-, valeur differente) doit rester detectee — l'allowlist
  // ne doit jamais se comporter comme une exclusion de dossier deguisee.
  {
    const mutatedKit = copyKit(originalKitRoot);
    rebuildZip(mutatedKit, zipRelFor("MONO-05"), (root) => {
      const target = path.join(root, "README.md");
      const content = fs.readFileSync(target, "utf8");
      // ajoute une DEUXIEME valeur sk- distincte du marqueur allowliste existant,
      // dans le meme fichier README.md deja partiellement allowliste.
      fs.writeFileSync(target, content + "\n<!-- sk-UNE-AUTRE-VALEUR-JAMAIS-VUE-9999 -->\n");
    });
    const work = freshTmp("mono06-work-adv05c-");
    const report = runHarness({ kitRoot: mutatedKit, workRoot: work, skipTestExecution: true });
    const mono05 = report.perArtifact["MONO-05"];
    assert(mono05.staticSearch.realSecrets.status === "FAIL", "T06-HARNESS-05c. une valeur sk- NON allowlistee dans un fichier partiellement allowliste reste detectee (allowlist par hash exact, jamais par fichier entier)");
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(path.dirname(mutatedKit), { recursive: true, force: true });
  }

  // T06-HARNESS-07 (correction post-audit #3) : MONO-05 utilise reellement
  // `npm ci`, jamais `npm install` (protocole gele du lot).
  {
    const { ARTIFACTS } = require("../lib/artifact-registry");
    const mono05Def = ARTIFACTS.find((a) => a.id === "MONO-05");
    assert(mono05Def.npmInstallMode === "ci", "T06-HARNESS-07. MONO-05 est declare avec npmInstallMode='ci' dans le registre (protocole gele respecte)");
  }

  // T06-HARNESS-08 (correction post-audit #4) : installations historiques deterministes
  {
    const { ARTIFACTS } = require("../lib/artifact-registry");
    for (const id of ["EF-PR-GEN-01", "EF-02ABC"]) {
      const def = ARTIFACTS.find((a) => a.id === id);
      assert(typeof def.npmInstallPackageVersion === "string" && def.npmInstallPackageVersion !== "latest", `T06-HARNESS-08. ${id} declare une version jsdom figee et documentee (jamais 'latest')`);
    }
  }

  // T06-HARNESS-09 (correction post-audit #5) : timeout explicite fonctionnel,
  // ne bloque jamais le harnais, produit un resultat structure.
  {
    const { execWithTimeout } = require("../lib/exec-with-timeout");
    const start = Date.now();
    const result = execWithTimeout("sleep", ["5"], { encoding: "utf8" }, 500, "TEST_TIMEOUT");
    const elapsed = Date.now() - start;
    assert(result.timedOut === true, "T06-HARNESS-09a. un processus synthetique qui dort au-dela du timeout est marque timedOut=true");
    assert(elapsed < 4000, "T06-HARNESS-09b. le timeout est reellement applique (pas d'attente jusqu'a la fin naturelle du processus)");
  }


  // T06-HARNESS-06 (critere audit #3) : le harnais ne modifie jamais les ZIP canoniques du kit original
  {
    const zipsToCheck = [
      "04-ARTEFACTS-CANONIQUES/MONO/EvidenceForge-MONO-00-v1.zip",
      "04-ARTEFACTS-CANONIQUES/HISTORIQUES/EF-ORCH-RELEASE-v0.1.zip"
    ];
    const crypto = require("crypto");
    const hashBefore = zipsToCheck.map((p) => crypto.createHash("sha256").update(fs.readFileSync(path.join(originalKitRoot, p))).digest("hex"));
    const work = freshTmp("mono06-work-integrity-");
    runHarness({ kitRoot: originalKitRoot, workRoot: work, skipTestExecution: true });
    const hashAfter = zipsToCheck.map((p) => crypto.createHash("sha256").update(fs.readFileSync(path.join(originalKitRoot, p))).digest("hex"));
    assert(JSON.stringify(hashBefore) === JSON.stringify(hashAfter), "T06-HARNESS-06. les ZIP canoniques du kit original restent bit-a-bit identiques apres un run complet");
    fs.rmSync(work, { recursive: true, force: true });
  }

  // T06-18 : non-regression du harnais (le rejouer deux fois donne le meme resultat, hors horodatage)
  {
    const work1 = freshTmp("mono06-work-repro1-");
    const work2 = freshTmp("mono06-work-repro2-");
    const r1 = runHarness({ kitRoot: originalKitRoot, workRoot: work1, skipTestExecution: true });
    const r2 = runHarness({ kitRoot: originalKitRoot, workRoot: work2, skipTestExecution: true });
    const strip = (r) => { const c = JSON.parse(JSON.stringify(r)); delete c.generatedAt; delete c.kitRoot; return c; };
    assert(JSON.stringify(strip(r1)) === JSON.stringify(strip(r2)), "T06-18. deux executions independantes du harnais produisent un rapport identique");
    fs.rmSync(work1, { recursive: true, force: true });
    fs.rmSync(work2, { recursive: true, force: true });
  }

  // Portabilite : aucun chemin de session code en dur dans lib/ ou bin/
  {
    const libDir = path.join(__dirname, "..", "lib");
    const binDir = path.join(__dirname, "..", "bin");
    let found = false;
    for (const dir of [libDir, binDir]) {
      for (const f of fs.readdirSync(dir)) {
        const content = fs.readFileSync(path.join(dir, f), "utf8");
        if (/\/home\/claude|\/tmp\/mono00-verify/.test(content)) found = true;
      }
    }
    assert(!found, "T06-PORTABILITY. aucun chemin de session code en dur dans lib/ ou bin/");
  }

  console.log(`\n============================================`);
  console.log(`TOTAL CUMULE : ${passCount + failCount} tests`);
  if (failCount === 0) {
    console.log("AUCUNE REGRESSION");
    process.exit(0);
  } else {
    console.log(`${failCount} ECHEC(S)`);
    process.exit(1);
  }
}

main();
