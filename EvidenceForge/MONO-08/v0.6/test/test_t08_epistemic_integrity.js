"use strict";
// test/test_t08_epistemic_integrity.js — LOCAL_CONTROLLED
//
// REMEDIATION F-02/F-03/F-04 (audit independant MONO-00-08) : prouve que
// lib/eforch-artifacts.js / lib/real-e2e-driver.js ne fabriquent plus
// jamais un acteur="human" ou un provider/model/hash LLM synthetique
// PRESENTE COMME REEL en mode REAL — et que le mode LOCAL_CONTROLLED
// continue de fonctionner a l'identique, desormais explicitement etiquete
// SYNTHETIC_FIXTURE. Couvre T-NEW-05, T-NEW-06, T-NEW-07, T-NEW-08, T-NEW-09
// (voir mission de remediation, section 16).

const path = require("path");
const os = require("os");
const mono07LibPath = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
if (!mono07LibPath) {
  console.error("EVIDENCEFORGE_MONO07_LIB_PATH non fourni — necessaire pour reutiliser buildEnv de MONO-07 sans dupliquer sa logique.");
  process.exit(2);
}
const { buildEnv } = require(path.join(mono07LibPath, "harness-env.js"));
const { createRealMissionRun, buildEForchArtifacts } = require("../lib/real-e2e-driver");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function buildMission() {
  return { dimensions: [{ id: "DIM_A", label: "Dimension A" }], targetDocuments: [{ documentId: "t1", title: "Target 1", url: "https://example.invalid/t1" }] };
}

function jsonResponse(body) { return { ok: true, status: 200, json: async function () { return body; } }; }

const HASH64 = "a".repeat(64);
// sourceId est derive de runContractHash, lui-meme non deterministe entre
// deux appels (confirmedAt horodate a chaque confirmation) — un Proxy
// renvoie la MEME decision humaine reelle quel que soit le sourceId
// effectivement genere, sans jamais devoir le predire ici. Le code de
// production (lib/eforch-artifacts.js) n'est pas concerne : il continue de
// lire realDecisions[id] normalement, ignorant qu'il s'agit d'un Proxy.
function realAuditDecisionsProxy() {
  const decision = { acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "Decision humaine reellement prise (test T-NEW)." };
  return new Proxy({}, { get: function () { return decision; }, has: function () { return true; } });
}
function realProvenanceFixture() {
  return {
    mode: "REAL",
    // REMEDIATION R2 (M-02) : proposalCountRaw/proposalCountStored/
    // technicalProposalLimit/targetContextReport desormais exiges
    // explicitement en mode REAL (jamais un repli implicite 1/1/20/[]).
    resolverRuns: [{
      provider: "anthropic", model: "claude-sonnet-5", promptVersion: "EF01B-discipline-resolver-v2", date: new Date().toISOString(),
      inputHash: HASH64, rawResponseHash: HASH64,
      proposalCountRaw: 3, proposalCountStored: 3, technicalProposalLimit: 20, technicalLimitApplied: false, targetContextReport: [],
    }],
    plannerRun: { provider: "anthropic", model: "claude-sonnet-5", promptVersion: "EF01C1-search-planner-v2-compact", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
    // REMEDIATION R3 (M-02) : plannerOutput (contenu CAUSAL reellement
    // decide par le planificateur) desormais exige explicitement en mode
    // REAL, distinct de plannerRun (provenance de l'appel uniquement) —
    // jamais un repli sur l'ancien gabarit fixe MONO-08.
    plannerOutput: {
      sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "Connecteur retenu par le planificateur (test T-NEW)." }],
      queries: [{ discipline: "DIM_A", connectorId: "openalex", requete: "requete reelle DIM_A (test T-NEW)", justification: "Justification reelle DIM_A (test T-NEW)." }],
      retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "maxResults atteint", retryPolicy: "2 tentatives", rateLimitPolicy: "1000 req/s", budgetMax: "budget raisonnable" }],
      criteresInclusion: ["Critere d'inclusion reel (test T-NEW)."],
      criteresExclusion: ["Critere d'exclusion reel (test T-NEW)."],
      regleDedoublonnage: "DOI (test T-NEW).",
      methodeQualification: "Qualitative (test T-NEW).",
    },
    // REMEDIATION R2 (M-02) : humanValidation desormais exige explicitement
    // en mode REAL (jamais "Revu (MONO-08)." fabrique par defaut).
    humanValidation: { validatedAt: new Date().toISOString(), commentaire: "Protocole de recherche reellement revu par l'operateur (test T-NEW)." },
    auditDecisions: realAuditDecisionsProxy(),
  };
}

(async () => {
  const kitRoot = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT;
  if (!kitRoot) { console.error("EVIDENCEFORGE_KIT_ROOT (ou argv[2]) requis."); process.exit(2); }

  const env = buildEnv(kitRoot, path.join(os.tmpdir(), "mono08-epistemic-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6)), { providerConfigs: {}, secrets: {} });
  const mission = buildMission();
  const documentBytesByUrl = { "https://example.invalid/t1": new TextEncoder().encode("Contenu de test document 1") };
  const openAlexFetchImpl = async function () { return jsonResponse({ results: [{ display_name: "Source OA locale (LOCAL_CONTROLLED_FIXTURE)" }] }); };

  // === T-NEW-09 : mode absent (defaut LOCAL_CONTROLLED) reste fonctionnel, desormais etiquete SYNTHETIC_FIXTURE ===
  {
    const built = await buildEForchArtifacts(env.cfg, mission, "Question ?", documentBytesByUrl, openAlexFetchImpl);
    check("T-NEW-09a. mode absent => LOCAL_CONTROLLED (comportement fixture inchange, mais fonctionnel)", !!built.efOrchExecutionDependenciesSerializable.resolverTrace);
    check("T-NEW-09b. ResolverTrace etiquete SYNTHETIC_FIXTURE en LOCAL_CONTROLLED", built.efOrchExecutionDependenciesSerializable.resolverTrace.evidenceProvenance === "SYNTHETIC_FIXTURE");
    check("T-NEW-09c. SearchProtocol.plannerRuns etiquete SYNTHETIC_FIXTURE en LOCAL_CONTROLLED", built.efOrchExecutionDependenciesSerializable.searchProtocol.plannerRuns[0].evidenceProvenance === "SYNTHETIC_FIXTURE");
    check("T-NEW-09d. ScreeningArtifact.auditDecisions etiquete SYNTHETIC_FIXTURE en LOCAL_CONTROLLED", built.efOrchExecutionDependenciesSerializable.screeningArtifact.auditDecisions[0].evidenceProvenance === "SYNTHETIC_FIXTURE");
  }

  // === T-NEW-06/T-NEW-07 : mode REAL sans resolverRuns/plannerRun reels => OPERATOR_INPUT_REQUIRED, jamais de hash invente ===
  {
    let threw = null;
    try { await buildEForchArtifacts(env.cfg, mission, "Question ?", documentBytesByUrl, openAlexFetchImpl, { mode: "REAL" }); } catch (e) { threw = e; }
    check("T-NEW-06. mode REAL sans resolverRuns/plannerRun reels leve OPERATOR_INPUT_REQUIRED (jamais de hash '1'.repeat(64) fabrique)", !!threw && threw.code === "OPERATOR_INPUT_REQUIRED");
    check("T-NEW-07. le message d'echec REAL identifie explicitement le stage manquant (ResolverTrace/SearchProtocol)", !!threw && /ResolverTrace|SearchProtocol/.test(threw.message));
  }

  // === T-NEW-05/T-NEW-08 : mode REAL avec LLM reel mais sans decision humaine reelle => OPERATOR_INPUT_REQUIRED, jamais acteur="human" invente ===
  {
    const partialProvenance = realProvenanceFixture();
    delete partialProvenance.auditDecisions; // decision humaine volontairement absente
    let threw = null;
    try {
      await createRealMissionRun(env, {}, async function () { return "{}"; }, {
        runId: "epistemic-test-" + Date.now().toString(36), mission: mission, missionQuestion: "Question ?",
        documentBytesByUrl: documentBytesByUrl, documentContentByUrl: { "https://example.invalid/t1": "contenu" },
        openAlexFetchImpl: openAlexFetchImpl, mode: "REAL", realProvenance: partialProvenance,
      });
    } catch (e) { threw = e; }
    check("T-NEW-05/T-NEW-08. mode REAL avec LLM reel mais sans decision humaine reelle leve OPERATOR_INPUT_REQUIRED (jamais acteur=\"human\" invente)", !!threw && threw.code === "OPERATOR_INPUT_REQUIRED" && /ScreeningArtifact/.test(threw.message));
  }

  // === mode REAL avec provenance COMPLETE et reelle : le pipeline construit reellement l'artefact, etiquete REAL ===
  {
    const provenance = realProvenanceFixture();
    const builtReal = await buildEForchArtifacts(env.cfg, mission, "Question ?", documentBytesByUrl, openAlexFetchImpl, provenance);
    check("REAL-01. mode REAL avec provenance complete construit reellement ResolverTrace, etiquete OPERATOR_ATTESTED_LLM_CALL", builtReal.efOrchExecutionDependenciesSerializable.resolverTrace.evidenceProvenance === "OPERATOR_ATTESTED_LLM_CALL");
    check("REAL-02. mode REAL avec provenance complete construit reellement SearchProtocol, etiquete OPERATOR_ATTESTED_LLM_CALL", builtReal.efOrchExecutionDependenciesSerializable.searchProtocol.evidenceProvenance === "OPERATOR_ATTESTED_LLM_CALL");
    check("REAL-03. mode REAL avec provenance complete construit reellement ScreeningArtifact, etiquete OPERATOR_ATTESTED_HUMAN_ACTION, acteur=\"human\" (reellement fourni, jamais invente)", builtReal.efOrchExecutionDependenciesSerializable.screeningArtifact.auditDecisions[0].evidenceProvenance === "OPERATOR_ATTESTED_HUMAN_ACTION" && builtReal.efOrchExecutionDependenciesSerializable.screeningArtifact.auditDecisions[0].acteur === "human");
    check("REAL-04. le ResolverTrace REAL transporte le provider/model/hash reellement fournis, jamais 'claude-sonnet-4-6'/'1'.repeat(64)", builtReal.efOrchExecutionDependenciesSerializable.resolverTrace.resolverRuns[0].inputHash === HASH64 && builtReal.efOrchExecutionDependenciesSerializable.resolverTrace.resolverRuns[0].inputHash !== "1".repeat(64));
  }

  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("\n(Rappel : ces resultats sont LOCAL_CONTROLLED - le mode REAL est exerce ici avec une provenance SIMULEE explicitement fournie par le test, jamais un appel LLM/humain reel.)");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
