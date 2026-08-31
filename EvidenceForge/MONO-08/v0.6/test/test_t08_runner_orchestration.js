"use strict";
// test/test_t08_runner_orchestration.js — LOCAL_CONTROLLED
//
// T08-RUNNER-01 a 06 : garde-fous et fail-closed du runner (fail-closed
// anti-synthetique, mission incomplete correctement bloquee, independance
// reseau de l'integrite ZIP).
//
// La preuve du HAPPY PATH READY complet (createRealMissionRun -> driveRun
// -> EF-ORCH-SUBSYSTEM SUCCESS -> 14/14 -> rehydrateRealMissionRun ->
// readback -> UI smoke) vit desormais dans test/test_t08_eforch.js
// (T08-EFORCH-01 a 14 + T08-RUNNER-READY-01 a 05, 23/23) — jamais dupliquee
// ici pour eviter deux sources de verite sur le meme sous-systeme.

const path = require("path");
const fs = require("fs");
const { buildRealProviderConfigs } = require("../lib/real-provider-configs");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

(async () => {
  {
    let threw = null;
    try { buildRealProviderConfigs({ OPENALEX_BASE_URL: "http://localhost:8080" }); } catch (e) { threw = e; }
    check("T08-RUNNER-01. runner refuse un endpoint localhost en mode REAL_SMOKE (fail-closed)", !!threw && /fail-closed/i.test(threw.message));

    let threw2 = null;
    try { buildRealProviderConfigs({ CROSSREF_BASE_URL: "https://synthetic-fixture.example.com" }); } catch (e) { threw2 = e; }
    check("T08-RUNNER-02. runner refuse un endpoint contenant synthetic en mode REAL_SMOKE", !!threw2 && /fail-closed/i.test(threw2.message));

    let ok = null;
    try { ok = buildRealProviderConfigs({}); } catch (e) { ok = null; }
    check("T08-RUNNER-03. runner accepte les vrais endpoints par defaut", ok && ok.openalex.endpoint === "https://api.openalex.org");
  }

  {
    const missionPath = path.join(__dirname, "..", "fixtures", "mission-real-smoke-v1.json");
    const mission = JSON.parse(fs.readFileSync(missionPath, "utf8"));
    check("T08-RUNNER-04. la mission fournie est explicitement marquee incomplete (readyForExecution=false)", mission.readyForExecution === false, JSON.stringify(mission.blockedReason));
    const hasUnresolved = mission.professionalCandidates.some(function (p) { return p.status === "OPERATOR_INPUT_REQUIRED"; }) || mission.targetDocuments.some(function (d) { return d.status === "OPERATOR_INPUT_REQUIRED"; });
    check("T08-RUNNER-05. au moins une reference reste explicitement OPERATOR_INPUT_REQUIRED", hasUnresolved);
  }

  {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib", "frozen-zip-integrity.js"), "utf8");
    check("T08-RUNNER-06. lib/frozen-zip-integrity.js ne depend d'aucun module reseau (http/https)", !/require\(["'](https?)["']\)/.test(src));
  }

  const failed = results.filter(function (r) { return !r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("\n(Rappel : ces resultats sont LOCAL_CONTROLLED - ils valident le RUNNER, jamais le Real Smoke lui-meme. Voir test_t08_eforch.js pour la preuve du happy path READY complet.)");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
