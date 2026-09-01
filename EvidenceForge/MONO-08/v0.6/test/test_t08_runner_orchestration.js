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
const { missionGateStatus, extractDocumentPayloads } = require("../bin/run-real-smoke");

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
    // BUG_TEST corrige (audit MONO-08, F-14 / AUDIT-REMEDIATION/02-FINDINGS-
    // DISPOSITION.md) : T08-RUNNER-04/05 asseraient auparavant que la
    // mission FOURNIE resterait TOUJOURS incomplete (readyForExecution=
    // false, au moins une reference OPERATOR_INPUT_REQUIRED) — vrai quand
    // ce test a ete ecrit, devenu FAUX en v0.6 des lors que l'operateur a
    // reellement complete/valide les references restantes (voir git log de
    // fixtures/mission-real-smoke-v1.json). Ce n'etait jamais un bug du
    // runner : la mission a legitimement progresse vers readyForExecution=
    // true. On teste desormais (a) l'invariant de COHERENCE du champ, qui
    // reste vrai a chaque etape du cycle de vie de la mission, et (b) le
    // comportement fail-closed REEL du mission-gate (bin/run-real-smoke.js)
    // sur une mission SYNTHETIQUE construite ici — jamais sur le contenu
    // mutable du fixture partage.
    const missionPath = path.join(__dirname, "..", "fixtures", "mission-real-smoke-v1.json");
    const mission = JSON.parse(fs.readFileSync(missionPath, "utf8"));
    const hasUnresolved = mission.professionalCandidates.some(function (p) { return p.status === "OPERATOR_INPUT_REQUIRED"; }) || mission.targetDocuments.some(function (d) { return d.status === "OPERATOR_INPUT_REQUIRED"; });
    check(
      "T08-RUNNER-04. coherence readyForExecution vs references non resolues (jamais true avec une reference bloquee, jamais false sans motif documente)",
      mission.readyForExecution === true ? !hasUnresolved : (mission.readyForExecution === false && !!mission.blockedReason),
      "readyForExecution=" + mission.readyForExecution + ", blockedReason=" + JSON.stringify(mission.blockedReason) + ", hasUnresolved=" + hasUnresolved
    );

    const syntheticIncomplete = {
      readyForExecution: false, blockedReason: "T08-RUNNER-05 (mission synthetique) : document cible non verifie.",
      professionalCandidates: [{ status: "VERIFIED" }],
      targetDocuments: [{ documentId: "d1", url: "https://example.org/d1", status: "OPERATOR_INPUT_REQUIRED" }],
      dimensions: [{ id: "DIM_A", label: "Dimension A" }],
    };
    check("T08-RUNNER-05a. mission-gate (bin/run-real-smoke.js::missionGateStatus) bloque reellement une mission synthetique incomplete", missionGateStatus(syntheticIncomplete) === "MISSION_NOT_READY");

    // REMEDIATION R2 (B-03) : readyForExecution=true ne suffit plus a lui
    // seul — une provenance eForchProvenance structurellement valide est
    // desormais requise (voir describeMissionGateStatus()/
    // validateRealEForchProvenance()). "complete" sans provenance doit
    // rester bloque ; "complete" AVEC provenance valide doit passer.
    const readyWithoutProvenance = Object.assign({}, syntheticIncomplete, { readyForExecution: true });
    check("T08-RUNNER-05b. mission-gate reste MISSION_NOT_READY si readyForExecution=true mais eForchProvenance absent (jamais un PASS premature avant OPERATOR_INPUT_REQUIRED tardif)", missionGateStatus(readyWithoutProvenance) === "MISSION_NOT_READY");
    const HASH64 = "a".repeat(64);
    const readyWithProvenance = Object.assign({}, readyWithoutProvenance, {
      eForchProvenance: {
        resolverRuns: [{ provider: "anthropic", model: "claude-sonnet-5", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64, proposalCountRaw: 3, proposalCountStored: 3, technicalProposalLimit: 20, targetContextReport: [] }],
        plannerRun: { provider: "anthropic", model: "claude-sonnet-5", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
        humanValidation: { validatedAt: new Date().toISOString(), commentaire: "Protocole de recherche reellement revu (test)." },
        auditDecisions: { "source-1": { acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "Decision humaine reelle (test)." } },
      },
    });
    check("T08-RUNNER-05b2. mission-gate accepte une mission synthetique complete AVEC eForchProvenance structurellement valide", missionGateStatus(readyWithProvenance) === "PASS");

    let payloadsThrew = null;
    try {
      extractDocumentPayloads({ targetDocuments: [{ documentId: "d1", url: "https://example.org/d1", status: "VERIFIED" /* content manquant */ }] });
    } catch (e) { payloadsThrew = e; }
    check("T08-RUNNER-05c. extractDocumentPayloads refuse (fail-closed) un document VERIFIED sans contenu reel fourni, jamais un contenu invente", !!payloadsThrew && /content/i.test(payloadsThrew.message));
    const skipped = extractDocumentPayloads({ targetDocuments: [{ documentId: "d2", url: "https://example.org/d2", status: "OPERATOR_INPUT_REQUIRED" }] });
    check("T08-RUNNER-05d. extractDocumentPayloads ignore silencieusement (jamais ne fabrique) un document encore OPERATOR_INPUT_REQUIRED", Object.keys(skipped.documentBytesByUrl).length === 0 && Object.keys(skipped.documentContentByUrl).length === 0);
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
