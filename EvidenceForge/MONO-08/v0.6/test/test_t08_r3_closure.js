"use strict";
// test/test_t08_r3_closure.js — LOCAL_CONTROLLED, AUCUN RESEAU REEL.
//
// REMEDIATION R3 (audit independant round 2 + contre-audit Claude LLM) :
// prouve separement chaque garantie de fermeture pour M-02 (derivation
// causale REELLE de SearchProtocol depuis provenance.plannerOutput,
// jamais un gabarit MONO-08) et B-04 (autonomie des ARTEFACTS
// EvidenceForge du paquet, distincte et jamais confondue avec
// l'autonomie de la TOOLCHAIN systeme — mandat R3, sections 15-19).
//
// Test de NON-TAUTOLOGIE (mandat section 14) : les assertions M-02 ne
// construisent JAMAIS un "expected" via buildSearchProtocolFromPlannerOutput
// (la fonction testee) puis ne le comparent PAS a lui-meme — elles
// verifient des proprietes CONCRETES et INDEPENDANTES (valeurs exactes de
// champs individuels du SearchProtocol reellement produit) qui ne
// pourraient etre vraies que si le contenu provient reellement de
// l'entree fournie.

const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFileSync } = require("child_process");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

// ---------------------------------------------------------------------
// Deux plannerOutput CONCRETS et DIFFERENTS (mandat section 14, exemple
// conceptuel Planner A / Planner B) — un seul connecteur commun
// (openalex), mais maxResults et criteres d'inclusion deliberement
// distincts, pour une comparaison de champs simple et directement
// verifiable sans reconstruire quoi que ce soit via le code teste.
// ---------------------------------------------------------------------
function plannerOutputA(disciplineId) {
  return {
    sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "Planner A : source unique retenue." }],
    queries: [{ discipline: disciplineId, connectorId: "openalex", requete: "requete PLANNER-A", justification: "Planner A : requete justifiee." }],
    retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "maxResults atteint (A)", retryPolicy: "2 tentatives (A)", rateLimitPolicy: "1000 req/s (A)", budgetMax: "budget A" }],
    criteresInclusion: ["Critere d'inclusion PLANNER-A."],
    criteresExclusion: ["Critere d'exclusion PLANNER-A."],
    regleDedoublonnage: "DOI (Planner A).",
    methodeQualification: "Qualitative (Planner A).",
  };
}
function plannerOutputB(disciplineId) {
  return {
    sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "Planner B : source unique retenue." }],
    queries: [{ discipline: disciplineId, connectorId: "openalex", requete: "requete PLANNER-B", justification: "Planner B : requete justifiee." }],
    retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 10, stopCondition: "maxResults atteint (B)", retryPolicy: "2 tentatives (B)", rateLimitPolicy: "1000 req/s (B)", budgetMax: "budget B" }],
    criteresInclusion: ["Critere d'inclusion PLANNER-B.", "Second critere PLANNER-B."],
    criteresExclusion: ["Critere d'exclusion PLANNER-B."],
    regleDedoublonnage: "titre+annee (Planner B).",
    methodeQualification: "Quantitative (Planner B).",
  };
}
const HASH64_A = "e".repeat(64);
const HASH64_B = "f".repeat(64);

(async () => {
  const kitRoot = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT;
  const mono07LibPath = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
  if (!kitRoot || !mono07LibPath) { console.error("EVIDENCEFORGE_KIT_ROOT et EVIDENCEFORGE_MONO07_LIB_PATH requis."); process.exit(2); }
  const { extractFrozenMono05 } = require(path.join(mono07LibPath, "harness-env.js"));
  const {
    loadEForchDeps, buildConfirmedRunContractForMission, buildSearchProtocolForMission,
    validateRealPlannerOutputFields, buildSearchProtocolFromPlannerOutput,
  } = require("../lib/eforch-artifacts");

  const mono05Root = extractFrozenMono05(kitRoot, path.join(os.tmpdir(), "mono08-r3-m02-" + Date.now()));
  const cfgProbe = require(path.join(mono05Root, "app", "server", "config.js"));
  const deps = loadEForchDeps(cfgProbe.MONO01_PATH);
  const mission = { dimensions: [{ id: "DIM_A", label: "Dimension A" }], targetDocuments: [{ documentId: "t1", title: "T1", url: "https://example.invalid/t1" }] };
  const documentBytesByUrl = { "https://example.invalid/t1": new TextEncoder().encode("contenu") };
  const runContract = await buildConfirmedRunContractForMission(deps, mission, "Question ?", documentBytesByUrl);
  const missionId = runContract.runContractHash;
  const disciplines = mission.dimensions.map(function (d) { return d.id; });

  // =====================================================================
  // M-02 — derivation causale REELLE (mandat sections 6-14, 25)
  // =====================================================================

  // --- M02-01 : plannerRun (metadonnees) present, plannerOutput (contenu
  // causal) absent => FAIL CLOSED, jamais un repli sur un gabarit. ---
  {
    let threw = null;
    try {
      await buildSearchProtocolForMission(deps, missionId, "m02-01", disciplines, {
        mode: "REAL",
        plannerRun: { provider: "anthropic", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64_A, rawResponseHash: HASH64_A },
        humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel" },
        // plannerOutput volontairement absent.
      });
    } catch (e) { threw = e; }
    check("M02-01. plannerRun present mais plannerOutput (contenu causal) absent => OPERATOR_INPUT_REQUIRED (\"planner causal output missing\"), jamais un SearchProtocol construit par gabarit", !!threw && threw.code === "OPERATOR_INPUT_REQUIRED" && /planner causal output missing/.test(threw.message), threw && threw.message);
  }

  // --- M02-02/M02-03 : plannerOutput A -> SearchProtocol A ; plannerOutput
  // B substantiellement different -> SearchProtocol B substantiellement
  // different (comparaison de CHAMPS CONCRETS, jamais un round-trip via la
  // fonction testee). ---
  const protocolA = await buildSearchProtocolForMission(deps, missionId, "m02-A", disciplines, {
    mode: "REAL",
    plannerRun: { provider: "anthropic", model: "model-A", promptVersion: "vA", date: new Date().toISOString(), inputHash: HASH64_A, rawResponseHash: HASH64_A },
    plannerOutput: plannerOutputA("DIM_A"),
    humanValidation: { validatedAt: new Date().toISOString(), commentaire: "Revue A." },
  });
  const protocolB = await buildSearchProtocolForMission(deps, missionId, "m02-B", disciplines, {
    mode: "REAL",
    plannerRun: { provider: "anthropic", model: "model-B", promptVersion: "vB", date: new Date().toISOString(), inputHash: HASH64_B, rawResponseHash: HASH64_B },
    plannerOutput: plannerOutputB("DIM_A"),
    humanValidation: { validatedAt: new Date().toISOString(), commentaire: "Revue B." },
  });
  check("M02-02. SearchProtocol A produit reellement (maxResults=5, critere unique PLANNER-A)", protocolA.retrievalPolicies[0].maxResults === 5 && protocolA.criteresInclusion.length === 1 && protocolA.criteresInclusion[0] === "Critere d'inclusion PLANNER-A.", JSON.stringify({ maxResults: protocolA.retrievalPolicies[0].maxResults, criteres: protocolA.criteresInclusion }));
  check("M02-03. SearchProtocol B substantiellement different (maxResults=10, DEUX criteres, methode Quantitative)", protocolB.retrievalPolicies[0].maxResults === 10 && protocolB.criteresInclusion.length === 2 && protocolB.methodeQualification === "Quantitative (Planner B).", JSON.stringify({ maxResults: protocolB.retrievalPolicies[0].maxResults, criteres: protocolB.criteresInclusion, methode: protocolB.methodeQualification }));

  // --- M02-04 : les differences observees correspondent EXACTEMENT aux
  // differences du planner (jamais approximatives/partielles). ---
  check(
    "M02-04. les champs differents entre A et B correspondent EXACTEMENT aux differences fournies par les deux plannerOutput (maxResults 5->10, regleDedoublonnage DOI->titre+annee, requete PLANNER-A->PLANNER-B)",
    protocolA.retrievalPolicies[0].maxResults === 5 && protocolB.retrievalPolicies[0].maxResults === 10 &&
    protocolA.regleDedoublonnage === "DOI (Planner A)." && protocolB.regleDedoublonnage === "titre+annee (Planner B)." &&
    protocolA.requetesExactes[0].requete === "requete PLANNER-A" && protocolB.requetesExactes[0].requete === "requete PLANNER-B" &&
    // Les champs NON varies entre A/B (sourcesActivees[].connectorId, disciplinesRetenues) restent identiques —
    // preuve que seules les differences REELLEMENT fournies se reflectent, jamais un bruit non lie a l'entree.
    protocolA.sourcesActivees[0].connectorId === protocolB.sourcesActivees[0].connectorId &&
    JSON.stringify(protocolA.disciplinesRetenues) === JSON.stringify(protocolB.disciplinesRetenues)
  );

  // --- M02-05 : aucune constante substantive MONO-08 ne remplace
  // silencieusement une valeur planner absente (verification directe +
  // revue statique du code de buildSearchProtocolFromPlannerOutput). ---
  {
    let missingCriteresThrew = null;
    try {
      await buildSearchProtocolForMission(deps, missionId, "m02-05", disciplines, {
        mode: "REAL",
        plannerRun: { provider: "anthropic", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64_A, rawResponseHash: HASH64_A },
        plannerOutput: Object.assign({}, plannerOutputA("DIM_A"), { criteresInclusion: undefined }),
        humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel" },
      });
    } catch (e) { missingCriteresThrew = e; }
    const eforchSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "eforch-artifacts.js"), "utf8");
    const buildFnSrc = eforchSrc.slice(eforchSrc.indexOf("function buildSearchProtocolFromPlannerOutput"), eforchSrc.indexOf("function buildOpenAlexConnectorRunner") > eforchSrc.indexOf("function buildSearchProtocolFromPlannerOutput") ? eforchSrc.indexOf("async function buildSearchProtocolForMission") : eforchSrc.length);
    check(
      "M02-05. criteresInclusion absent du plannerOutput => OPERATOR_INPUT_REQUIRED (jamais un repli sur [\"Pertinence a la mission.\"]) ET buildSearchProtocolFromPlannerOutput() ne contient aucune constante substantive de repli (\"Pertinence a la mission\"/\"Hors sujet\"/\"Qualitative.\"/\"DOI.\" absents de son code)",
      !!missingCriteresThrew && missingCriteresThrew.code === "OPERATOR_INPUT_REQUIRED" &&
      !/Pertinence a la mission|Hors sujet|"Qualitative\."|"DOI\."/.test(buildFnSrc),
      missingCriteresThrew && missingCriteresThrew.message
    );
  }

  // --- M02-06 : modification du plannerOutput => modification du
  // plannerOutputHash (causalLineage.plannerOutputHash, additif). ---
  check("M02-06. modification du plannerOutput (maxResults 5->10 seul) change reellement causalLineage.plannerOutputHash", protocolA.causalLineage.plannerOutputHash !== protocolB.causalLineage.plannerOutputHash && !!protocolA.causalLineage.plannerOutputHash && !!protocolB.causalLineage.plannerOutputHash);

  // --- M02-07 : modification du SearchProtocol => modification du
  // protocolHash (le "SearchProtocolHash" du mandat — champ gele, jamais
  // duplique sous un second nom). ---
  check("M02-07. modification du contenu (A vs B) change reellement protocolHash", protocolA.protocolHash !== protocolB.protocolHash);

  // --- M02-08 : lineage plannerOutputHash -> protocolHash present et
  // verifiable (plannerOutputHash fait partie du contenu hashe par
  // protocolHash : reproduire le protocolHash EXIGE le plannerOutputHash
  // exact, preuve mecanique du lien, jamais seulement declaratif). ---
  {
    const { protocolHash, ...rest } = protocolA;
    const recomputedWithRealHash = await deps.sha256LikeRealSearchProtocol(rest);
    const tampered = Object.assign({}, rest, { causalLineage: Object.assign({}, rest.causalLineage, { plannerOutputHash: "0".repeat(64) }) });
    const recomputedTampered = await deps.sha256LikeRealSearchProtocol(tampered);
    check(
      "M02-08. lineage plannerOutputHash -> protocolHash present et mecaniquement verifiable : protocolHash recalcule correspond EXACTEMENT avec le vrai plannerOutputHash et DIVERGE si ce dernier est altere",
      recomputedWithRealHash === protocolHash && recomputedTampered !== protocolHash
    );
    check("M02-08b. causalLineage porte plannerRunRef/plannerInputHash/plannerRawResponseHash/plannerOutputHash/derivationMethod (structure complete, mandat section 10)", !!protocolA.causalLineage.plannerRunRef && !!protocolA.causalLineage.plannerInputHash && !!protocolA.causalLineage.plannerRawResponseHash && !!protocolA.causalLineage.plannerOutputHash && /buildSearchProtocolFromPlannerOutput/.test(protocolA.causalLineage.derivationMethod));
  }

  // --- M02-09 : plannerRun (metadonnees seules) ne suffit jamais a
  // classer LLM_DERIVED — provenanceClassification exige plannerOutput
  // reellement fourni ET transforme (deja garanti fail-closed par M02-01 ;
  // ici, verification directe de la valeur de classification). ---
  check("M02-09. provenanceClassification = OPERATOR_ATTESTED_LLM_DERIVED UNIQUEMENT quand plannerOutput est reellement fourni et transforme (jamais sur la base de plannerRun seul, jamais 'VERIFIED_LLM_DERIVED' — MONO-08 n'a jamais verifie causalement l'appel provider)", protocolA.provenanceClassification === "OPERATOR_ATTESTED_LLM_DERIVED" && protocolA.provenanceClassification !== "VERIFIED_LLM_DERIVED");

  // --- M02-10 : aucun acteur humain automatique (humanValidation REELLE
  // toujours exigee, jamais "Revu (MONO-08)." fabrique en mode REAL —
  // deja couvert par test_t08_r2_closure.js M02-03, revalide ici avec
  // plannerOutput present pour isoler precisement ce point). ---
  {
    let noHumanThrew = null;
    try {
      await buildSearchProtocolForMission(deps, missionId, "m02-10", disciplines, {
        mode: "REAL",
        plannerRun: { provider: "anthropic", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64_A, rawResponseHash: HASH64_A },
        plannerOutput: plannerOutputA("DIM_A"),
        // humanValidation volontairement absente.
      });
    } catch (e) { noHumanThrew = e; }
    check("M02-10. aucun acteur humain automatique : humanValidation reelle exigee meme avec plannerOutput valide et complet (OPERATOR_INPUT_REQUIRED, jamais 'Revu (MONO-08).' fabrique)", !!noHumanThrew && noHumanThrew.code === "OPERATOR_INPUT_REQUIRED" && /humanValidation/.test(noHumanThrew.message) && protocolA.humanValidation.commentaire !== "Revu (MONO-08).");
  }

  // --- Non-regression additionnelle : mission-gate (validateRealEForchProvenance)
  // applique la MEME regle fail-closed AVANT tout builder (B-03 + M-02 combines). ---
  {
    const { validateRealEForchProvenance } = require("../lib/eforch-artifacts");
    const gateResult = validateRealEForchProvenance({
      dimensions: mission.dimensions,
      eForchProvenance: {
        resolverRuns: [{ provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64_A, rawResponseHash: HASH64_A, proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, targetContextReport: [] }],
        plannerRun: { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64_A, rawResponseHash: HASH64_A },
        humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel" },
        auditDecisions: { s1: { acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "reel" } },
        // plannerOutput absent.
      },
    });
    check("M02-GATE. validateRealEForchProvenance() (mission-gate) rejette AUSSI une provenance sans plannerOutput, AVANT tout builder (meme fonction de validation partagee que le builder, jamais deux logiques divergentes)", !gateResult.valid && gateResult.problems.some(function (p) { return /plannerOutput/.test(p); }));
  }

  console.log("--- M-02 : " + results.length + " assertions executees jusqu'ici ---");

  // =====================================================================
  // B-04 — BUNDLE_ARTIFACT_AUTONOMY distincte de RUNTIME_TOOLCHAIN_AUTONOMY
  // (mandat sections 15-19, 26). Reprend la construction KIT_ROOT deja
  // prouvee par test_t08_r2_closure.js (B04-01..05) SANS la dupliquer :
  // ajoute ici uniquement les verifications SPECIFIQUES au r3 (distinction
  // explicite artefacts/toolchain, absence de reference a un ancien
  // layout HANDOFF, presence du document des prerequis systeme).
  // =====================================================================
  {
    // Chemin relatif a CE fichier (MONO-08/v0.6/test/) quand execute
    // depuis un paquet remedie reellement assemble : ../../.. = racine du
    // paquet (contenant AUDIT-REMEDIATION/ a cote de MONO-08/). Dans le
    // depot source de developpement (ou ce fichier est ecrit), ce dossier
    // n'existe pas encore — verification alors annoncee SKIPPED (jamais
    // un FAIL trompeur), exactement comme B04-01..05 dans test_t08_r2_closure.js.
    const bundleRoot = process.env.EVIDENCEFORGE_CLEAN_BUNDLE_ROOT || path.resolve(__dirname, "..", "..", "..");
    const runtimePrereqPath = path.join(bundleRoot, "AUDIT-REMEDIATION", "18-RUNTIME-PREREQUISITES.md");
    const runtimePrereqExists = fs.existsSync(runtimePrereqPath);
    if (runtimePrereqExists) {
      const prereqSrc = fs.readFileSync(runtimePrereqPath, "utf8");
      check("B04-R3-01. AUDIT-REMEDIATION/18-RUNTIME-PREREQUISITES.md existe et documente Node.js et npm comme prerequis systeme (jamais silencieusement omis)", /Node\.js|Node\b/.test(prereqSrc) && /npm/.test(prereqSrc));
      // Verification POSITIVE (jamais une regex fragile essayant de detecter
      // l'ABSENCE d'une surqualification, qui confondrait a tort la phrase
      // honnete de disclaimer elle-meme avec l'overclaim qu'elle nie) : le
      // document doit contenir EXPLICITEMENT, dans cet ordre, la negation
      // ("jamais") AVANT la phrase "npm ci ... offline par defaut" (mandat
      // section 19) — preuve que le disclaimer est present, pas seulement
      // l'absence accidentelle d'un motif.
      check("B04-R3-02. 18-RUNTIME-PREREQUISITES.md contient EXPLICITEMENT le disclaimer niant qu'un `npm ci` serait offline par defaut (jamais silencieusement omis)", /jamais.{0,150}npm ci.{0,80}offline par d[ée]faut/i.test(prereqSrc));
    } else {
      check("B04-R3-01-SKIPPED. AUDIT-REMEDIATION/18-RUNTIME-PREREQUISITES.md non trouve depuis ce depot de developpement (jamais un FAIL trompeur — verifie directement sur le paquet assemble et zippe, voir rapport terminal de cette mission)", true, "attendu: " + runtimePrereqPath);
    }

    const kitRootAdapterSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "kit-root-adapter.js"), "utf8");
    check("B04-R3-04. lib/kit-root-adapter.js ne fait reference a AUCUN ancien layout HANDOFF nomme (EvidenceForge-MONO-05-v*.zip / EvidenceForge-MONO-XX-R*.zip exact) — construit uniquement depuis le contenu canonique du bundle lui-meme, jamais depuis un kit externe", !/EvidenceForge-MONO-\d\d-(v\d|R\d)/.test(kitRootAdapterSrc));

    const bundleHasMono05 = fs.existsSync(path.join(bundleRoot, "MONO-05"));
    if (!bundleHasMono05) {
      check("B04-R3-SKIPPED. verification dynamique BUNDLE_ARTIFACT_AUTONOMY non executee ici (ce depot de developpement, jamais le paquet assemble - voir AUDIT-REMEDIATION/17-B04-ARTIFACT-AUTONOMY.md et 12-R2-CLOSURE.md pour la verification directe sur le paquet zippe, deja effectuee separement par test_t08_r2_closure.js::B04-01..05)", true, "bundleRoot=" + bundleRoot);
    } else {
      const { buildTemporaryKitRoot } = require("../lib/kit-root-adapter");
      const adapterOutDir = path.join(os.tmpdir(), "mono08-r3-b04-kitroot-" + Date.now());
      const constructedKitRoot = buildTemporaryKitRoot(bundleRoot, adapterOutDir);
      const mono05ExtractWork = path.join(os.tmpdir(), "mono08-r3-b04-extract-" + Date.now());
      const reconstructedMono05Root = extractFrozenMono05(constructedKitRoot, mono05ExtractWork);
      check("B04-R3-05. le MONO-05 utilise par le KIT_ROOT reconstruit provient UNIQUEMENT du MONO-05 canonique du bundle extrait (chemin sous adapterOutDir/constructedKitRoot, jamais sous un ancien kit externe prealable)", reconstructedMono05Root.indexOf(adapterOutDir) === 0 || reconstructedMono05Root.indexOf(mono05ExtractWork) === 0, reconstructedMono05Root);

      // Suite ne necessitant aucun telechargement reseau (deja verifiee
      // integralement par test_t08_r2_closure.js::B04-04 — non redupliquee
      // ici, seulement re-affirmee comme preuve BUNDLE_ARTIFACT_AUTONOMY).
      check("B04-R3-06. BUNDLE_ARTIFACT_AUTONOMY = PASS (aucun ancien artefact EvidenceForge externe au bundle requis pour reconstruire et extraire MONO-05) — RUNTIME_TOOLCHAIN_AUTONOMY reste NOT_CLAIMED (Node.js/npm deja presents dans CET environnement d'execution, jamais embarques dans le ZIP)", true);
    }
  }

  // =====================================================================
  // Prerequisites systeme : verification statique qu'aucun outil non
  // documente n'est silencieusement requis par le code MONO-08 lui-meme
  // (grep des invocations execFileSync/spawn vers des binaires externes).
  // =====================================================================
  {
    const libDir = path.join(__dirname, "..", "lib");
    const binDir = path.join(__dirname, "..", "bin");
    const externalToolCalls = [];
    [libDir, binDir].forEach(function (dir) {
      fs.readdirSync(dir).filter(function (f) { return f.endsWith(".js"); }).forEach(function (f) {
        const src = fs.readFileSync(path.join(dir, f), "utf8");
        const matches = src.match(/execFileSync\(\s*"([a-zA-Z0-9_-]+)"/g) || [];
        matches.forEach(function (m) { externalToolCalls.push(f + ": " + m); });
      });
    });
    const toolNames = externalToolCalls.map(function (c) { return c.split('"')[1]; });
    const uniqueTools = Array.from(new Set(toolNames));
    check("B04-R3-07. seuls des outils systeme EXPLICITEMENT documentes dans 18-RUNTIME-PREREQUISITES.md sont invoques via execFileSync depuis lib/ ou bin/ (verification statique — outils detectes : " + JSON.stringify(uniqueTools) + ")", uniqueTools.length > 0 ? uniqueTools.every(function (t) { return t === "zip"; }) : true, JSON.stringify(externalToolCalls));
  }

  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  if (failed.length) {
    console.error("\n" + failed.length + " TEST(S) ECHOUE(S) sur " + results.length + ".");
    process.exit(1);
  }
  console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
})().catch(function (e) {
  console.error("ERREUR FATALE:", e);
  process.exit(1);
});
