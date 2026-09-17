#!/usr/bin/env node
"use strict";
// MONO-09 v0.2 — suite de tests. Aucun reseau, aucun LLM, aucun run EF-02 reel.
// Usage : node test/test-mono09-v0.2.js <bundleRoot>

const path = require("path"), fs = require("fs"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
if (!fs.existsSync(path.join(KIT, "MONO-01", "index.js"))) {
  console.error("MONO-01 introuvable sous \"" + KIT + "\".");
  console.error("Usage: node test/test-mono09-v0.2.js <bundleRoot>");
  process.exit(2);
}
const REG = path.join(KIT, "MONO-01", "registry", "mono-00-frozen-baseline-registry-v1.json");
const { createMono01 } = require(path.join(KIT, "MONO-01", "index.js"));
const { nodeRunners } = require(path.join(KIT, "MONO-02", "lib", "node-runners.js"));

const AD = require("../lib/professional-adapter.js");
const NZ = require("../lib/corpus-snapshot-normalizer.js");
const IP = require("../lib/identifier-policy.js");
const SG = require("../lib/scientific-readiness-gate.js");
const LR = require("../lib/llm-readiness.js");

let pass = 0, fail = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + d : "")); } };

// ---- fixtures : forme REELLE du CorpusSnapshot recu par EF-02A ----
const CS = {
  schema: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1", id: "corpus-fx", missionId: "m1", protocolRef: "p1",
  sources: [
    { id: "source-1", titre: "T1", auteurOuOrganisme: "Ada Lovelace, Alan Turing", discipline: "epistemologie",
      provenance: { connectorId: "openalex", originalReference: "https://openalex.org/W1", retrievalMethod: "proxy" }, statutScreening: "inclus" },
    { id: "source-2", titre: "T2", auteurOuOrganisme: "Zoe Exclue", discipline: "ethique-appliquee",
      provenance: { connectorId: "openalex", originalReference: "https://openalex.org/W2" }, statutScreening: "exclu" },
    { id: "source-3", titre: "T3", auteurOuOrganisme: "Ada Lovelace", discipline: "ethique-appliquee",
      provenance: { connectorId: "openalex", originalReference: "https://openalex.org/W3" }, statutScreening: "inclus" },
  ],
};
const MDS = { schema: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", dimensions: [{ id: "epistemologie" }, { id: "ethique-appliquee" }] };

function makeAdapter(over) {
  return AD.createProfessionalPipelineAdapter(Object.assign({
    resolveAuthorIdentity: async (s) =>
      s.displayName === "Ada Lovelace" ? { providerAuthorId: "https://openalex.org/A1", orcid: "0000-0001-2345-6789", affiliation: "Univ A" }
        : s.displayName === "Alan Turing" ? { providerAuthorId: "https://openalex.org/A2" } : {},
    expandRelatedAuthors: async (s) =>
      s.providerAuthorId === "https://openalex.org/A1"
        ? [{ providerAuthorId: "https://openalex.org/A9", displayName: "Grace Hopper", relation: "COAUTHOR_ON_TOPIC", orcid: "0000-0002-1111-2222" },
           { providerAuthorId: "https://openalex.org/A1", displayName: "Ada Lovelace", relation: "SELF" }]
        : [],
    fetchAuthorWorks: async () => [
      { id: "https://openalex.org/W100", display_name: "Vrai travail", doi: "https://doi.org/10.1002/psp.590", publication_year: 2019 },
      { id: "https://openalex.org/W101", display_name: "Sans DOI", publication_year: 2020 },
      { id: "https://openalex.org/W102", display_name: "DOI fabrique", doi: "10.0000/mono08-abc123" },
      { display_name: "Sans identifiant du tout" },
    ],
  }, over || {}));
}

(async () => {
  console.log("MONO-09 v0.2 — adaptateur professionnel injectable\n");
  const mono01 = createMono01(REG);
  const port = mono01.professionalPipelinePort;

  // ================= T01/T02 — reproduction des bloqueurs v0.1 =================
  const V01 = path.join(KIT, "MONO-09", "v0.1", "lib");
  if (fs.existsSync(V01)) {
    const v01 = Object.assign({}, require(path.join(V01, "seed-discovery.js")), require(path.join(V01, "identifier-policy.js")));
    const miss = ["discoverProfessionals", "verifyProfessionals", "buildProfessionalCorpus"].filter((m) => typeof v01[m] !== "function");
    check("T01. v0.1 n'implemente aucune methode du port : injection refusee", miss.length === 3, JSON.stringify(miss));
    const r = await port.discoverProfessionals(CS, MDS, { adapter: v01, runId: "t01" });
    check("T01b. le VRAI port refuse v0.1 avec DEPENDENCY_UNAVAILABLE",
      r.status !== "SUCCESS" && r.diagnostics.error.code === "DEPENDENCY_UNAVAILABLE", r.status);
    const seedsV01 = require(path.join(V01, "seed-discovery.js")).extractSeedAuthors({ snapshot: CS, auditDecisions: { snapshotHash: CS.snapshotHash, decisions: [] } });
    check("T02. v0.1 rend 0 graine EN SILENCE sur le CorpusSnapshot reel (echec silencieux)", seedsV01.length === 0, "seeds=" + seedsV01.length);
  } else console.log("  SKIP  T01/T02. MONO-09 v0.1 absent du bundle");

  // ================= T03/T04 — adaptateur v0.2 =================
  const adapter = makeAdapter();
  check("T03. v0.2 exporte les 3 methodes exactes du port",
    ["discoverProfessionals", "verifyProfessionals", "buildProfessionalCorpus"].every((m) => typeof adapter[m] === "function"));
  const a1 = await port.discoverProfessionals(CS, MDS, { adapter, runId: "t03" });
  check("T04. v0.2 est injectable : le port valide entree ET sortie et renvoie SUCCESS",
    a1.status === "SUCCESS", a1.status + " " + JSON.stringify(a1.diagnostics || {}).slice(0, 200));
  check("T04b. la sortie porte le schemaVersion exige par le contrat gele",
    a1.output.schema === "EvidenceForge.ProfessionalDiscovery" && a1.output.schemaVersion === "EF-02A-v2");

  // ================= T05/T06 — normalisation et graines =================
  const nz = NZ.normalizeProfessionalDiscoveryInput(CS, MDS);
  check("T05. le CorpusSnapshot reel est normalise (id, provenance.originalReference, statutScreening)",
    nz.stats.included === 2 && nz.includedSources[0].providerWorkId === "https://openalex.org/W1", JSON.stringify(nz.stats));
  check("T05b. une forme inattendue est REFUSEE, jamais rendue vide en silence",
    (function () { try { NZ.normalizeProfessionalDiscoveryInput({ schema: "EvidenceForge.CorpusSnapshot", sources: [{ sourceId: "x", providerNativeId: "y" }] }, MDS); return false; }
      catch (e) { return e.code === "CORPUS_SNAPSHOT_SHAPE_UNEXPECTED"; } })());
  check("T05c. un sources[] vide est refuse explicitement",
    (function () { try { NZ.normalizeProfessionalDiscoveryInput({ schema: "EvidenceForge.CorpusSnapshot", sources: [] }, MDS); return false; }
      catch (e) { return e.code === "CORPUS_SNAPSHOT_SOURCES_EMPTY"; } })());
  const names = a1.output.candidates.map((c) => c.displayName);
  check("T06. seules les sources incluses deviennent des graines (Zoe Exclue absente)", !names.includes("Zoe Exclue"), JSON.stringify(names));
  check("T06b. le lineage documentaire est conserve (queryLineage + evidenceProvenance)",
    a1.output.candidates[0].provenance[0].queryLineage.discipline === "epistemologie"
    && !!a1.output.candidates[0].provenance[0].evidenceProvenance.corpusSnapshotId);

  // ================= T07/T08/T09 — identite =================
  const ada = a1.output.candidates.filter((c) => c.displayName === "Ada Lovelace");
  const turing = a1.output.candidates.find((c) => c.displayName === "Alan Turing");
  check("T07. les identifiants auteur du fournisseur sont conserves tels quels", ada[0].candidateRef === "https://openalex.org/A1");
  check("T08. un ORCID absent reste absent", turing.orcid === null && turing.candidateRef === "https://openalex.org/A2");
  check("T08b. deux occurrences d'un meme nom sur des oeuvres distinctes restent DISTINCTES et signalees homonymes",
    ada.length === 2 && ada.every((c) => c.identityAmbiguity === "HOMONYM_UNRESOLVED_WITHOUT_PROVIDER_ID"), "occurrences=" + ada.length);
  check("T09. aucune graine n'est auto-verifiee par la decouverte",
    a1.output.candidates.filter((c) => c.candidateStatus === "SEED_CANDIDATE").length > 0
    && a1.output.antiCircularity.verifiedByDiscovery === 0
    && !a1.output.candidates.some((c) => c.candidateStatus === "VERIFIED_PROFESSIONAL"));

  // ================= T10 — decouverte secondaire =================
  const hopper = a1.output.candidates.find((c) => c.displayName === "Grace Hopper");
  check("T10. un candidat secondaire different de toutes les graines est produit",
    !!hopper && hopper.candidateStatus === "DISCOVERED_CANDIDATE" && hopper.provenance[0].origin === "SECONDARY_DISCOVERY");
  check("T10b. une graine renvoyee par l'expansion n'est pas dupliquee",
    a1.output.candidates.filter((c) => c.displayName === "Ada Lovelace" && c.candidateStatus === "DISCOVERED_CANDIDATE").length === 0);

  // ================= T11 — handoff EF-02A -> EF-02B =================
  const b1 = await port.verifyProfessionals(a1.output, { adapter, runId: "t11" });
  check("T11. la sortie EF-02A valide comme entree EF-02B, sans adaptation de test", b1.status === "SUCCESS", b1.status + " " + JSON.stringify(b1.diagnostics || {}).slice(0, 200));
  check("T11b. les homonymes non resolus restent AMBIGUOUS, jamais promus", b1.output.summary.ambiguous === 2, JSON.stringify(b1.output.summary));
  check("T11c. un candidat sans ORCID reste UNVERIFIED", b1.output.verified.find((v) => v.displayName === "Alan Turing").verificationStatus === "UNVERIFIED");

  // ================= T12/T13/T14 — identifiants =================
  const c1 = await port.buildProfessionalCorpus(b1.output, { adapter, runId: "t12" });
  check("T12. EF-02C reussit et n'emet aucun DOI synthetique", c1.status === "SUCCESS", c1.status);
  const works = c1.output.professionalCorpora[0].corpus.works;
  check("T12b. DOI fournisseur conserve exactement", works.find((w) => w.workRef === "https://openalex.org/W100").doi === "https://doi.org/10.1002/psp.590");
  check("T12c. DOI absent reste null et trace", (function () { const w = works.find((x) => x.workRef === "https://openalex.org/W101"); return w.doi === null && w.doiStatus === "ABSENT_AT_PROVIDER"; })());
  check("T12d. DOI fabrique rejete", (function () { const w = works.find((x) => x.workRef === "https://openalex.org/W102"); return w.doi === null && w.doiStatus === "REJECTED_FABRICATED"; })());
  check("T12e. oeuvre sans identifiant natif ecartee, jamais completee", c1.output.professionalCorpora[0].summary.discardedWithoutIdentity === 1);
  const patterns = [["10.0000/mono08-abcdef", true], ["10.0000/mono08-ab1", true], ["work-ab1", true], ["work-abcdef", true],
    ["mono08-generated-x", true], ["https://doi.org/10.0000/mono08-zz", true],
    ["https://doi.org/10.1002/psp.590", false], ["https://openalex.org/W4211176385", false], ["10.22459/caepr38.11.2016", false], ["0000-0001-2345-6789", false]];
  check("T13. motif synthetique court ferme, ET aucun identifiant fournisseur reel rejete",
    patterns.every(([v, exp]) => IP.isFabricatedIdentifier(v) === exp),
    JSON.stringify(patterns.filter(([v, exp]) => IP.isFabricatedIdentifier(v) !== exp)));
  check("T14. un corpus contamine est refuse (fail-closed)",
    (function () { try { IP.assertNoFabricatedIdentifiers([{ corpus: { works: [{ workRef: "work-ab1" }] } }]); return false; } catch (e) { return e.code === "IDENTIFIER_FABRICATION_DETECTED"; } })());

  // ================= T15/T16 — VRAI chemin runtime (node-runners MONO-02) =================
  const ctx = { missionId: "m1", adapter, dependenciesAvailable: {}, nodeOutputs: { "EF-PR-GEN-01": { missionDimensionSet: MDS }, "EF-ORCH-SUBSYSTEM": CS } };
  const nA = await nodeRunners["EF-02A"](mono01, ctx);
  check("T15. le VRAI runner de noeud EF-02A (MONO-02/lib/node-runners.js) atteint l'adaptateur et rend un resultat NON VIDE",
    nA.status === "SUCCESS" && nA.output.candidates.length === 4, nA.status + " candidats=" + (nA.output ? nA.output.candidates.length : 0));
  ctx.nodeOutputs["EF-02A"] = nA.output;   // exactement ce que fait l'engine (orchestration-engine.js l.220)
  const nB = await nodeRunners["EF-02B"](mono01, ctx);
  check("T16. le VRAI runner EF-02B recoit la sortie reelle d'EF-02A, sans mock", nB.status === "SUCCESS" && nB.output.verified.length === 4, nB.status);
  ctx.nodeOutputs["EF-02B"] = nB.output;
  const nC = await nodeRunners["EF-02C"](mono01, ctx);
  check("T16b. le VRAI runner EF-02C poursuit la chaine", nC.status === "SUCCESS" && Array.isArray(nC.output.professionalCorpora), nC.status);
  const noAdapter = await nodeRunners["EF-02A"](mono01, { missionId: "m1", adapter: undefined, dependenciesAvailable: {}, nodeOutputs: ctx.nodeOutputs });
  check("T16d. adaptateur absent => DEPENDENCY_UNAVAILABLE sur le vrai chemin",
    noAdapter.status !== "SUCCESS" && noAdapter.diagnostics.error.code === "DEPENDENCY_UNAVAILABLE", noAdapter.status);

  // ================= T17 — LLM fail-closed sur donnees non vides =================
  const counts = { professionalCorpora: nC.output.professionalCorpora.length, twinsCreated: 0, reviewTargets: 3 };
  check("T17. donnees non vides issues du VRAI chemin + LLM absent => fail-closed",
    (function () { try { LR.assertLlmReadiness({ counts: counts, workerCallFn: null, credentialsPresent: false }); return false; }
      catch (e) { return e.code === "LLM_DEPENDENCY_NOT_READY"; } })(), "corpora=" + counts.professionalCorpora);
  check("T17b. donnees vides => jamais un faux READY",
    LR.assertLlmReadiness({ counts: { professionalCorpora: 0, twinsCreated: 0, reviewTargets: 3 } }).status === "NO_LLM_NEEDED_DATA_EMPTY");

  // ================= T18 — gate de vidage preserve =================
  const nodes14 = Array.from({ length: 14 }, (_, i) => ({ nodeId: "N" + i, state: "SUCCESS" }));
  const F = { testMode: true, scientificValidity: false, humanProfessionalValidation: false };
  const scen = [
    ["candidats>0, 0 verifie", { professionalsDiscovered: 4, professionalsVerified: 0, professionalCorpora: 0, twinsCreated: 0, reviewsCompleted: 0 }],
    ["verifies>0, corpus 0", { professionalsDiscovered: 4, professionalsVerified: 2, professionalCorpora: 0, twinsCreated: 0, reviewsCompleted: 0 }],
    ["corpus>0, 0 twin", { professionalsDiscovered: 4, professionalsVerified: 2, professionalCorpora: 2, twinsCreated: 0, reviewsCompleted: 0 }],
    ["twins>0, 0 revue", { professionalsDiscovered: 4, professionalsVerified: 2, professionalCorpora: 2, twinsCreated: 2, reviewsCompleted: 0 }],
  ];
  check("T18. aucun scenario partiellement vide ne devient SCIENTIFICALLY_USABLE",
    scen.every(([, c]) => { const r = SG.classifyRun({ graphNodes: nodes14, counts: c, flags: F }); return r.scientificallyUsable === false; }));
  check("T18b. chacun interdit l'emission d'un verdict",
    scen.every(([, c]) => { const r = SG.classifyRun({ graphNodes: nodes14, counts: c, flags: F });
      try { SG.assertVerdictAllowed(r); return false; } catch (e) { return e.code === "SCIENTIFIC_VERDICT_FORBIDDEN"; } }));

  // ================= T19 — drapeaux legacy intacts =================
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const libSrc = fs.readdirSync(path.join(__dirname, "..", "lib")).map((f) => strip(fs.readFileSync(path.join(__dirname, "..", "lib", f), "utf8")));
  check("T19. MONO-09 v0.2 n'AFFECTE jamais scientificValidity=true ni humanProfessionalValidation=true (hors commentaires)",
    !libSrc.some((s) => /scientificValidity\s*[:=]\s*true/.test(s)) && !libSrc.some((s) => /humanProfessionalValidation\s*[:=]\s*true/.test(s)));
  check("T19b. le scan d'hygiene est discriminant", /scientificValidity\s*[:=]\s*true/.test(strip("const x = { scientificValidity: true };")));
  check("T19c. aucun acces disque, reseau ou environnement dans lib/",
    !libSrc.some((s) => /require\(\s*["']https?|fetch\(|process\.env|writeFileSync/.test(s)));

  // ================= T20 — lots geles, methode par reference croisee =================
  const h = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  let compared = 0, diverg = 0;
  for (const sub of ["dependencies", "ports"]) {
    const a = path.join(KIT, "MONO-01", sub), b = path.join(KIT, "MONO-02", "dependencies", "MONO-01", sub);
    if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
    for (const f of fs.readdirSync(a)) {
      const pa = path.join(a, f), pb = path.join(b, f);
      if (fs.statSync(pa).isDirectory()) continue;
      compared++;
      if (!fs.existsSync(pb) || h(pa) !== h(pb)) { diverg++; console.log("      DIVERGENT " + sub + "/" + f); }
    }
  }
  check("T20. MONO-01 byte-identique a la copie imbriquee dans MONO-02 (reference croisee, pas une constante auto-ecrite)",
    compared > 0 && diverg === 0, "compares=" + compared + " divergents=" + diverg);
  check("T20b. les 8 modules a drapeaux ne portent que des litteraux false",
    ["ef-02d1d2-orchestrator-v1", "ef-02d3-coverage-panel-v1", "ef-02e-twin-builder-v1", "ef-03a-review-schema-v1",
     "ef-03b-review-runner-v1", "ef-03c-aggregation-v1", "ef-03d-stability-contradiction-v1", "ef-04a-unified-report-v1"]
      .every((f) => { const s = fs.readFileSync(path.join(KIT, "MONO-01", "dependencies", f + ".js"), "utf8");
        return !/scientificValidity\s*:\s*true/.test(s) && /scientificValidity\s*:\s*false/.test(s); }));

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
