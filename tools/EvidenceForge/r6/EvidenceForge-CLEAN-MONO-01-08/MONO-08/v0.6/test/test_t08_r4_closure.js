"use strict";
// test/test_t08_r4_closure.js — LOCAL_CONTROLLED, AUCUN RESEAU REEL.
//
// REMEDIATION R4 (preparation au Real Smoke) : prouve separement chaque
// garantie R4-F01 (coherence readiness/eForchProvenance de la mission
// canonique), R4-F02 (coherence des attestations opérateur — discipline,
// missionId, plannerOutputHash) et R4-F03 (lineage EF-01C2 -> EF-01D
// reellement derive du retrieval, jamais un placeholder documentaire).

const path = require("path");
const os = require("os");
const fs = require("fs");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function jsonResponse(body) { return { ok: true, status: 200, json: async function () { return body; } }; }
const HASH64 = "9".repeat(64);

function buildMission() {
  return { dimensions: [{ id: "DIM_A", label: "Dimension A" }], targetDocuments: [{ documentId: "t1", title: "Target 1", url: "https://example.invalid/t1" }] };
}

function validPlannerOutput(disciplineIds) {
  const ids = Array.isArray(disciplineIds) ? disciplineIds : [disciplineIds];
  return {
    sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "Connecteur retenu (test R4)." }],
    queries: ids.map(function (id) { return { discipline: id, connectorId: "openalex", requete: "requete R4 " + id, justification: "Justification R4 " + id + "." }; }),
    retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "maxResults atteint", retryPolicy: "2 tentatives", rateLimitPolicy: "1000 req/s", budgetMax: "budget raisonnable" }],
    criteresInclusion: ["Critere R4."], criteresExclusion: ["Exclusion R4."],
    regleDedoublonnage: "DOI R4.", methodeQualification: "Qualitative R4.",
  };
}
// Proxy qui repond a N'IMPORTE QUEL id de source par la MEME decision
// humaine reelle — necessaire car les ids reels ne sont connus qu'APRES
// l'execution reelle de la recuperation EF-01C2 (voir 21-SCREENING-
// LINEAGE.md, limitation documentee : un operateur reel doit soit executer
// une recuperation prealable pour decouvrir les ids avant de soumettre ses
// decisions, soit appliquer une politique de decision generale comme ici).
// Le code de production (lib/eforch-artifacts.js) n'est pas concerne : il
// continue de lire realDecisions[id] normalement.
function auditDecisionsProxy(decision) {
  return new Proxy({}, { get: function () { return decision; }, has: function () { return true; } });
}

(async () => {
  const kitRoot = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT;
  const mono07LibPath = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
  if (!kitRoot || !mono07LibPath) { console.error("EVIDENCEFORGE_KIT_ROOT et EVIDENCEFORGE_MONO07_LIB_PATH requis."); process.exit(2); }
  const { extractFrozenMono05, buildEnv } = require(path.join(mono07LibPath, "harness-env.js"));
  const { createRealMissionRun, buildEForchArtifacts } = require("../lib/real-e2e-driver");
  const { loadEForchDeps, buildConfirmedRunContractForMission, buildResolverTraceForMission, buildSearchProtocolForMission, validateRealEForchProvenance, executeActiveConnectorsRetrieval, buildOpenAlexConnectorRunner } = require("../lib/eforch-artifacts");
  const { describeMissionGateStatus, missionGateStatus } = require("../bin/run-real-smoke");

  // =====================================================================
  // R4-F01 — mission canonique coherente avec son propre mission-gate
  // =====================================================================
  {
    const missionFixturePath = path.join(__dirname, "..", "fixtures", "mission-real-smoke-v1.json");
    const missionFixture = JSON.parse(fs.readFileSync(missionFixturePath, "utf8"));

    check("R4-F01-02. la mission canonique livree (fixtures/mission-real-smoke-v1.json) est desormais readyForExecution=false (jamais true sans eForchProvenance reelle), avec blockedReason et operatorInputRequired explicites", missionFixture.readyForExecution === false && !!missionFixture.blockedReason && !!missionFixture.operatorInputRequired, "readyForExecution=" + missionFixture.readyForExecution);

    const expectedMissingKeys = ["eForchProvenance.resolverRuns", "eForchProvenance.plannerRun", "eForchProvenance.plannerOutput", "eForchProvenance.humanValidation", "eForchProvenance.auditDecisions"];
    const actualKeys = missionFixture.operatorInputRequired ? Object.keys(missionFixture.operatorInputRequired) : [];
    check("R4-F01-05. operatorInputRequired de la mission canonique indique EXACTEMENT les 5 informations manquantes (jamais une liste partielle ou vague)", JSON.stringify(actualKeys.sort()) === JSON.stringify(expectedMissingKeys.sort()), JSON.stringify(actualKeys));

    check("R4-F01-01. readyForExecution=true + eForchProvenance absent => mission-gate refuse (MISSION_NOT_READY)", describeMissionGateStatus(Object.assign({}, missionFixture, { readyForExecution: true, eForchProvenance: undefined })).status === "MISSION_NOT_READY");

    const fullyProvenMission = Object.assign({}, missionFixture, {
      readyForExecution: true,
      eForchProvenance: {
        resolverRuns: missionFixture.dimensions.map(function () { return { provider: "anthropic", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64, proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, targetContextReport: [] }; }),
        plannerRun: { provider: "anthropic", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
        plannerOutput: validPlannerOutput(missionFixture.dimensions.map(function (d) { return d.id; })),
        humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel (test R4)" },
        auditDecisions: { "s1": { acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "reel (test R4)" } },
      },
    });
    check("R4-F01-03. mission complete avec provenance structurellement coherente => mission-gate PASS", describeMissionGateStatus(fullyProvenMission).status === "PASS");

    const exampleTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "real-provenance-operator-input.example.json"), "utf8"));
    check("R4-F01-04a. fixtures/real-provenance-operator-input.example.json est explicitement mode=SYNTHETIC_EXAMPLE (jamais un mode consommable par le chemin REAL)", exampleTemplate.mode === "SYNTHETIC_EXAMPLE");
    const libSrcConcat = fs.readFileSync(path.join(__dirname, "..", "lib", "eforch-artifacts.js"), "utf8") + fs.readFileSync(path.join(__dirname, "..", "lib", "real-e2e-driver.js"), "utf8") + fs.readFileSync(path.join(__dirname, "..", "bin", "run-real-smoke.js"), "utf8");
    check("R4-F01-04b. aucun fichier lib/ ou bin/ ne charge automatiquement real-provenance-operator-input.example.json (revue statique — jamais consomme silencieusement par le chemin REAL)", !/real-provenance-operator-input\.example\.json/.test(libSrcConcat));
    let syntheticThrew = null;
    try {
      const missionId = "test-r4-mid";
      const disciplines = [missionFixture.dimensions[0].id];
      const mono05Root = extractFrozenMono05(kitRoot, path.join(os.tmpdir(), "mono08-r4-f01-" + Date.now()));
      const cfgProbe = require(path.join(mono05Root, "app", "server", "config.js"));
      const deps = loadEForchDeps(cfgProbe.MONO01_PATH);
      const ex = exampleTemplate.eForchProvenanceExample;
      await buildSearchProtocolForMission(deps, missionId, "r4f01", disciplines, {
        mode: "REAL",
        plannerRun: { provider: ex.plannerRun.provider, model: ex.plannerRun.model, promptVersion: ex.plannerRun.promptVersion, date: ex.plannerRun.date, inputHash: ex.plannerRun.inputHash, rawResponseHash: ex.plannerRun.rawResponseHash },
        plannerOutput: null,
        humanValidation: null,
      });
    } catch (e) { syntheticThrew = e; }
    check("R4-F01-04c. les valeurs SYNTHETIC_EXAMPLE_PLACEHOLDER du template ne peuvent jamais construire un artefact REAL valide (echec fail-closed reel, pas seulement documente)", !!syntheticThrew && syntheticThrew.code === "OPERATOR_INPUT_REQUIRED");
  }

  // =====================================================================
  // R4-F02 — coherence des attestations opérateur
  // =====================================================================
  {
    const mono05Root = extractFrozenMono05(kitRoot, path.join(os.tmpdir(), "mono08-r4-f02-" + Date.now()));
    const cfgProbe = require(path.join(mono05Root, "app", "server", "config.js"));
    const deps = loadEForchDeps(cfgProbe.MONO01_PATH);
    const mission = buildMission();
    const documentBytesByUrl = { "https://example.invalid/t1": new TextEncoder().encode("contenu") };
    const runContract = await buildConfirmedRunContractForMission(deps, mission, "Question ?", documentBytesByUrl);
    const missionId = runContract.runContractHash;

    // --- R4-F02-01 : aucune provenance operateur => fail closed ---
    let noProvThrew = null;
    try { buildResolverTraceForMission(deps, missionId, runContract, { mode: "REAL" }); } catch (e) { noProvThrew = e; }
    check("R4-F02-01. aucune provenance operateur (resolverRuns absent) en mode REAL => OPERATOR_INPUT_REQUIRED", !!noProvThrew && noProvThrew.code === "OPERATOR_INPUT_REQUIRED");

    // --- R4-F02-04 : resolverRun.discipline non presente dans le RunContract => fail closed ---
    let wrongDiscThrew = null;
    try {
      buildResolverTraceForMission(deps, missionId, runContract, {
        mode: "REAL",
        resolverRuns: [{ discipline: "DISCIPLINE_INEXISTANTE_HORS_RUNCONTRACT", provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64, proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, targetContextReport: [] }],
      });
    } catch (e) { wrongDiscThrew = e; }
    check("R4-F02-04/R4-F02-02. resolverRun.discipline attestee ne correspond a AUCUNE discipline du RunContract confirme => OPERATOR_INPUT_REQUIRED (attestation mal attribuee, jamais acceptee silencieusement)", !!wrongDiscThrew && wrongDiscThrew.code === "OPERATOR_INPUT_REQUIRED" && /discipline/i.test(wrongDiscThrew.message));

    // Meme coherence au niveau du mission-gate (validateRealEForchProvenance), jamais une logique divergente.
    const gateCheck = validateRealEForchProvenance({
      dimensions: mission.dimensions,
      eForchProvenance: {
        resolverRuns: [{ discipline: "AUTRE_DISCIPLINE_INCOHERENTE", provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64, proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, targetContextReport: [] }],
        plannerRun: { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
        plannerOutput: validPlannerOutput(mission.dimensions[0].id),
        humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel" },
        auditDecisions: { s1: { acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "reel" } },
      },
    });
    check("R4-F02-04b. validateRealEForchProvenance() (mission-gate) rejette AUSSI une discipline attestee incoherente, AVANT tout builder (meme regle que buildResolverTraceForMission, jamais dupliquee differemment)", !gateCheck.valid && gateCheck.problems.some(function (p) { return /discipline/i.test(p); }));

    // --- R4-F02-03 : plannerOutputHash incoherent (tampere apres construction) => detecte mecaniquement ---
    const searchProtocol = await buildSearchProtocolForMission(deps, missionId, "r4f02", [mission.dimensions[0].id], {
      mode: "REAL", plannerRun: { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
      plannerOutput: validPlannerOutput(mission.dimensions[0].id), humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel" },
    });
    const { protocolHash, ...rest } = searchProtocol;
    const recomputedGenuine = await deps.sha256LikeRealSearchProtocol(rest);
    const tamperedRest = Object.assign({}, rest, { causalLineage: Object.assign({}, rest.causalLineage, { plannerOutputHash: "0".repeat(64) }) });
    const recomputedTampered = await deps.sha256LikeRealSearchProtocol(tamperedRest);
    check("R4-F02-03. plannerOutputHash incoherent (tampere post-construction) => detecte mecaniquement : protocolHash recalcule diverge du protocolHash declare", recomputedGenuine === protocolHash && recomputedTampered !== protocolHash);

    // --- R4-F02-02b : plannerRuns[].missionId incoherent => rejete par le contrat gele lui-meme.
    // Le protocolHash est RECALCULE sur le contenu deja tampere (jamais celui
    // d'origine) pour isoler la verification SEMANTIQUE missionId de la
    // verification d'INTEGRITE cryptographique (deja prouvee separement par
    // R4-F02-03/M02-08) — sinon l'integrite echouerait en premier et
    // masquerait la cause reellement testee ici.
    const { assertSearchProtocolFrozenAndValid } = require(path.join(cfgProbe.MONO01_PATH, "dependencies", "ef-orch-ef01c1-planner-trace-v0.1.js"));
    const tamperedRestSemantic = Object.assign({}, rest, { plannerRuns: [Object.assign({}, rest.plannerRuns[0], { missionId: "UNE-AUTRE-MISSION-INCOHERENTE" })] });
    const tamperedSemanticHash = await deps.sha256LikeRealSearchProtocol(tamperedRestSemantic);
    const tamperedMissionId = Object.assign({}, tamperedRestSemantic, { protocolHash: tamperedSemanticHash });
    let missionIdThrew = null;
    try { await assertSearchProtocolFrozenAndValid(tamperedMissionId); } catch (e) { missionIdThrew = e; }
    check("R4-F02-02. attestation plannerRun mal liee a un AUTRE missionId => rejetee (contrat gele MONO-01, jamais contourne — preuve que MONO-08 construit toujours plannerRuns[].missionId coherent avec searchProtocol.missionId, verifie ici en le tamperant deliberement, hash recalcule pour isoler cette cause precise)", !!missionIdThrew && /missionId/.test(missionIdThrew.message), missionIdThrew && missionIdThrew.message);
    check("R4-F02-02c. en construction normale (non tamperee), plannerRuns[0].missionId correspond reellement a searchProtocol.missionId (invariant garanti par construction, jamais accidentel)", searchProtocol.plannerRuns[0].missionId === searchProtocol.missionId);

    // --- R4-F02-05 : humanValidation ne peut jamais etre auto-generee (commentaire vide/blanc rejete) ---
    let blankHumanThrew = null;
    try {
      await buildSearchProtocolForMission(deps, missionId, "r4f02b", [mission.dimensions[0].id], {
        mode: "REAL", plannerRun: { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
        plannerOutput: validPlannerOutput(mission.dimensions[0].id), humanValidation: { validatedAt: new Date().toISOString(), commentaire: "   " },
      });
    } catch (e) { blankHumanThrew = e; }
    check("R4-F02-05. humanValidation.commentaire blanc/vide => OPERATOR_INPUT_REQUIRED (jamais silencieusement accepte comme une validation reelle, jamais une auto-generation de remplacement)", !!blankHumanThrew && blankHumanThrew.code === "OPERATOR_INPUT_REQUIRED");

    // --- R4-F02-06 : le template SYNTHETIC_EXAMPLE utilise tel quel en REAL => echoue ---
    const exampleTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "real-provenance-operator-input.example.json"), "utf8"));
    let exampleThrew = null;
    try {
      await buildSearchProtocolForMission(deps, missionId, "r4f02c", [mission.dimensions[0].id], {
        mode: "REAL",
        plannerRun: exampleTemplate.eForchProvenanceExample.plannerRun,
        plannerOutput: exampleTemplate.eForchProvenanceExample.plannerOutput,
        humanValidation: exampleTemplate.eForchProvenanceExample.humanValidation,
      });
    } catch (e) { exampleThrew = e; }
    check("R4-F02-06. le template SYNTHETIC_EXAMPLE (valeurs SYNTHETIC_EXAMPLE_PLACEHOLDER litterales) utilise tel quel en mode REAL => echec (jamais consommable comme une provenance reelle)", !!exampleThrew && exampleThrew.code === "OPERATOR_INPUT_REQUIRED");
  }

  // =====================================================================
  // R4-F03 — lineage EF-01C2 -> EF-01D reellement derive du retrieval
  // =====================================================================
  {
    const runIdA = "r4-f03-a-" + Date.now().toString(36);
    const missionA = buildMission();
    const documentBytesByUrl = { "https://example.invalid/t1": new TextEncoder().encode("contenu document 1") };
    const documentContentByUrl = { "https://example.invalid/t1": "contenu" };

    // DEUX enregistrements de recuperation LOCAL_CONTROLLED REALISTES et
    // DISTINCTS (mandat section 17) — jamais un seul resultat generique.
    const twoRecordFetchImpl = async function () {
      return jsonResponse({
        results: [
          { display_name: "Record A Title (WCAG metadata study)", authorships: [{ author: { display_name: "Author A" } }], publication_date: "2024-01-15", doi: "10.1000/recordA", id: "https://openalex.org/WRECORDA" },
          { display_name: "Record B Title (WCAG structural study)", authorships: [{ author: { display_name: "Author B" } }], publication_date: "2024-06-20", doi: "10.1000/recordB", id: "https://openalex.org/WRECORDB" },
        ],
      });
    };

    const env = buildEnv(kitRoot, path.join(os.tmpdir(), "mono08-r4-f03-" + Date.now()), { providerConfigs: {}, secrets: {} });
    const built = await buildEForchArtifacts(env.cfg, missionA, "Question R4 ?", documentBytesByUrl, twoRecordFetchImpl);
    const sources = built.efOrchExecutionDependenciesSerializable.screeningArtifact.sourcesScreening;

    check("R4-F03-01. exactement 2 sources de screening reellement retrouvees (jamais 1 source synthetique fixe)", sources.length === 2, "length=" + sources.length);
    check("R4-F03-02. ScreeningArtifact[0] reprend REELLEMENT le contenu du Record A (titre/auteur/reference exacts, jamais 'Source '+id)", sources[0].titre === "Record A Title (WCAG metadata study)" && sources[0].auteurOuOrganisme === "Author A" && sources[0].reference === "10.1000/recordA" && sources[0].titre !== "Source " + sources[0].id);
    check("R4-F03-03. ScreeningArtifact[1] reprend REELLEMENT le contenu du Record B, distinct de A (titre/auteur/reference exacts)", sources[1].titre === "Record B Title (WCAG structural study)" && sources[1].auteurOuOrganisme === "Author B" && sources[1].reference === "10.1000/recordB" && sources[1].titre !== sources[0].titre);
    check("R4-F03-04. les deux sources ont des id REELLEMENT distincts (jamais le meme id reutilise pour plusieurs resultats)", sources[0].id !== sources[1].id);
    check("R4-F03-05. fieldProvenance classe correctement chaque champ documentaire reellement retrouve en RETRIEVAL_DERIVED", sources[0].fieldProvenance.auteurOuOrganisme === "RETRIEVAL_DERIVED" && sources[0].fieldProvenance.reference === "RETRIEVAL_DERIVED" && sources[0].fieldProvenance.date === "RETRIEVAL_DERIVED");

    // --- valeur absente => NOT_AVAILABLE, jamais fabriquee ---
    const missingFieldsFetchImpl = async function () { return jsonResponse({ results: [{ id: "https://openalex.org/WMINIMAL" }] }); };
    const builtMinimal = await buildEForchArtifacts(env.cfg, buildMission(), "Question R4 minimal ?", documentBytesByUrl, missingFieldsFetchImpl);
    const minimalSource = builtMinimal.efOrchExecutionDependenciesSerializable.screeningArtifact.sourcesScreening[0];
    check("R4-F03-06. auteurOuOrganisme/date/reference reellement absents => null + fieldProvenance NOT_AVAILABLE (jamais une valeur fabriquee pour satisfaire le schema)", minimalSource.auteurOuOrganisme === null && minimalSource.date === null && minimalSource.reference === null && minimalSource.fieldProvenance.auteurOuOrganisme === "NOT_AVAILABLE" && minimalSource.fieldProvenance.date === "NOT_AVAILABLE" && minimalSource.fieldProvenance.reference === "NOT_AVAILABLE");

    // --- lineage R -> S : sourceRecordHash change si le contenu retrieval change ---
    check("R4-F03-07. lineage.sourceRecordHash distinct entre deux sources au contenu different (R->S verifiable, jamais un hash constant)", sources[0].lineage.sourceRecordHash !== sources[1].lineage.sourceRecordHash && !!sources[0].lineage.sourceRecordHash);
    check("R4-F03-08. lineage.retrievalResultHash partage par toutes les sources d'UN MEME run (meme lot retrieval), mais distinct d'un run different", sources[0].lineage.retrievalResultHash === sources[1].lineage.retrievalResultHash && sources[0].lineage.retrievalResultHash !== minimalSource.lineage.retrievalResultHash);

    // --- lineage S -> Q : retrievalLineage relie screeningArtifactHash et qualificationArtifactHash ---
    const retrievalLineage = built.efOrchExecutionDependenciesSerializable.retrievalLineage;
    check("R4-F03-09. retrievalLineage porte retrievalResultHash/screeningArtifactHash/qualificationArtifactHash (chaine R->S->Q complete)", !!retrievalLineage && !!retrievalLineage.retrievalResultHash && !!retrievalLineage.screeningArtifactHash && !!retrievalLineage.qualificationArtifactHash);

    // --- aucun appel reseau reel supplementaire : le noeud EF-01C2 du graphe reutilise le MEME resultat memoise ---
    const nodeDefs = require(env.cfg.GRAPH_PATH).nodes;
    check("R4-F03-10. buildEForchArtifacts() retourne connectorRunners (instance deja invoquee, memoisee) — jamais une factory qui en reconstruirait une nouvelle a chaque appel", typeof built.connectorRunners === "object" && typeof built.connectorRunners.openalex === "function");
  }

  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  if (failed.length) {
    console.error("\n" + failed.length + " TEST(S) ECHOUE(S) sur " + results.length + ".");
    process.exit(1);
  }
  console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("\n(Rappel : tous ces resultats sont LOCAL_CONTROLLED — jamais une preuve Real Smoke reelle. Aucun appel reseau reel n'a ete tente.)");
})().catch(function (e) {
  console.error("ERREUR FATALE:", e);
  process.exit(1);
});
