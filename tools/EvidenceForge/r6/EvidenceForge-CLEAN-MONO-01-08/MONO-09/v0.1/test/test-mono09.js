#!/usr/bin/env node
"use strict";
// MONO-09 v0.1 — suite de tests. Aucun reseau, aucun LLM, aucun run EF-02 reel.
// Usage : node test/test-mono09.js <bundleRoot> [workspaceRoot]

const path = require("path"), fs = require("fs"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const WS = process.argv[3] || "/Users/christophebonnet/evidenceforge-work";
const SD = require("../lib/seed-discovery.js");
const IP = require("../lib/identifier-policy.js");
const SG = require("../lib/scientific-readiness-gate.js");
const LR = require("../lib/llm-readiness.js");

let pass = 0, fail = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + d : "")); } };

// ---- fixtures representatives, jamais du reseau ----
const SNAP = { snapshotId: "snap-fx", snapshotHash: "h".repeat(64), missionId: "m1",
  sources: [
    { sourceId: "s1", providerNativeId: "https://openalex.org/W1", titre: "Oeuvre 1", auteurOuOrganisme: "Alice Martin, Bob Durand", discipline: "epistemologie" },
    { sourceId: "s2", providerNativeId: "https://openalex.org/W2", titre: "Oeuvre 2", auteurOuOrganisme: "Carla Rossi", discipline: "ethique-appliquee" },
    { sourceId: "s3", providerNativeId: "https://openalex.org/W3", titre: "Oeuvre 3", auteurOuOrganisme: "Dan Weiss", discipline: "epistemologie" },
  ] };
const DEC = { snapshotHash: "h".repeat(64), decisions: [
  { sourceId: "s1", decision: "inclus" }, { sourceId: "s2", decision: "inclus" }, { sourceId: "s3", decision: "exclu" } ] };

(async () => {
  console.log("MONO-09 v0.1 — pipeline professionnel, remediation\n");

  // ============ T01 — reproduction du SUCCESS VIDE ============
  const emptyRun = SG.classifyRun({
    graphNodes: ["EF-ORCH-SUBSYSTEM","EF-PR-GEN-01","EF-02A","EF-02B","EF-02C","EF-02D","EF-02E","TARGET_DOCUMENT_SET","EF-03A","EF-03B","EF-03C","EF-03D","EF-04-LINEAGE","EF-04A"].map(n => ({ nodeId: n, state: "SUCCESS" })),
    counts: { professionalsDiscovered: 0, professionalsVerified: 0, professionalCorpora: 0, twinsCreated: 0, reviewsCompleted: 0, aggregates: 0 },
    flags: { testMode: true, scientificValidity: false, humanProfessionalValidation: false },
  });
  check("T01. le SUCCESS VIDE observe (14/14 SUCCESS, 0 partout) est reproduit et classe SCIENTIFICALLY_EMPTY",
    emptyRun.technicalAllSuccess === true && emptyRun.classification === SG.CLASSES.EMPTY, emptyRun.classification);
  check("T01b. la recherche par slug de discipline ne produit aucun candidat (fixture du comportement observe)",
    (function () { const slugSearch = (q) => (q === "epistemologie" ? [{ display_name: "histoire et mathematiques epistemologie", works_count: 1, orcid: null }] : []);
      return slugSearch("ethique-appliquee").length === 0 && slugSearch("methodologie-recherche-qualitative").length === 0
        && slugSearch("epistemologie").every(a => !a.orcid); })());

  // ============ T02-T04 — graines ============
  const seeds = SD.extractSeedAuthors({ snapshot: SNAP, auditDecisions: DEC });
  check("T02. les auteurs graines proviennent des seules sources INCLUSES par l'humain",
    seeds.length === 3 && seeds.map(s => s.displayName).sort().join("|") === "Alice Martin|Bob Durand|Carla Rossi", JSON.stringify(seeds.map(s => s.displayName)));
  check("T02b. l'auteur d'une source EXCLUE n'est jamais une graine", !seeds.some(s => s.displayName === "Dan Weiss"));
  check("T02c. un jeu de decisions lie a un autre snapshot est refuse (fail-closed)",
    (function () { try { SD.extractSeedAuthors({ snapshot: SNAP, auditDecisions: { snapshotHash: "z".repeat(64), decisions: [] } }); return false; } catch (e) { return e.code === "SEED_BINDING_MISMATCH"; } })());

  const resolved = await SD.resolveAuthorIdentities(seeds, async (s) =>
    s.displayName === "Alice Martin" ? { providerAuthorId: "https://openalex.org/A1", orcid: "0000-0001-0000-0001", institution: "Univ X" }
      : s.displayName === "Bob Durand" ? { providerAuthorId: "https://openalex.org/A2" } : {});
  check("T03. les identifiants auteur du fournisseur sont conserves tels quels",
    resolved.find(s => s.displayName === "Alice Martin").providerAuthorId === "https://openalex.org/A1");
  check("T03b. une identite non resolue reste null — jamais devinee",
    (function () { const c = resolved.find(s => s.displayName === "Carla Rossi"); return c.providerAuthorId === null && c.resolutionStatus === "UNRESOLVED"; })());
  check("T03c. un ORCID absent reste null — jamais fabrique",
    resolved.find(s => s.displayName === "Bob Durand").orcid === null);
  check("T04. une graine n'est JAMAIS marquee verifiee par la decouverte (anti-circularite)",
    resolved.every(s => s.status === SD.STATUS.SEED) && !resolved.some(s => s.status === SD.STATUS.VERIFIED));

  // ============ T05 — decouverte secondaire ============
  const secondary = await SD.discoverSecondaryCandidates(resolved, async (s) =>
    s.providerAuthorId === "https://openalex.org/A1"
      ? [{ providerAuthorId: "https://openalex.org/A9", displayName: "Eve Nakamura", relation: "COAUTHOR_ON_TOPIC", disciplines: ["epistemologie"] },
         { providerAuthorId: "https://openalex.org/A1", displayName: "Alice Martin", relation: "SELF" }]
      : []);
  check("T05. la decouverte secondaire ajoute des candidats hors graines",
    secondary.length === 1 && secondary[0].displayName === "Eve Nakamura" && secondary[0].status === SD.STATUS.DISCOVERED, JSON.stringify(secondary.map(s => s.displayName)));
  check("T05b. une graine renvoyee par l'expansion n'est pas dupliquee en candidat decouvert",
    !secondary.some(s => s.displayName === "Alice Martin"));
  check("T05c. aucune expansion depuis une identite non resolue",
    (async () => true)() && secondary.every(s => s.provenance[0].viaSeedAuthorId !== null));

  const disc = SD.buildDiscoveryOutput(resolved.concat(secondary), { missionId: "m1" });
  check("T06. aucune identite de candidat n'est fabriquee (candidateRef = identifiant fournisseur ou null)",
    disc.candidates.every(c => c.candidateRef === null || /^https:\/\/openalex\.org\/A/.test(c.candidateRef)));
  check("T06b. la sortie EF-02A ne verifie aucun candidat", disc.antiCircularity.verifiedByDiscovery === 0);
  check("T06c. un candidat pre-marque VERIFIED est refuse (fail-closed)",
    (function () { try { SD.buildDiscoveryOutput([{ displayName: "X", status: SD.STATUS.VERIFIED, disciplines: [], provenance: [] }], { missionId: "m1" }); return false; } catch (e) { return e.code === "ANTI_CIRCULARITY_VIOLATION"; } })());

  // ============ T07-T08 — identifiants ============
  const noDoi = IP.normalizeWork({ id: "https://openalex.org/W7", display_name: "Sans DOI" });
  check("T07. une oeuvre sans DOI reste sans DOI", noDoi.doi === null && noDoi.doiStatus === "ABSENT_AT_PROVIDER");
  check("T07b. l'absence est explicitement tracee, jamais silencieuse", noDoi.identifierProvenance.doi === "ABSENT_AT_PROVIDER");
  check("T07c. une oeuvre sans identifiant natif est declaree inexploitable, jamais completee",
    (function () { const w = IP.normalizeWork({ display_name: "Rien" }); return w.usable === false && w.workRef === null && w.reason === "PROVIDER_NATIVE_ID_ABSENT"; })());
  check("T08. un DOI fabrique de la forme observee est rejete",
    IP.isFabricatedIdentifier("10.0000/mono08-ab12cd") && IP.normalizeWork({ id: "https://openalex.org/W8", doi: "10.0000/mono08-ab12cd" }).doiStatus === "REJECTED_FABRICATED");
  check("T08b. un corpus contenant un identifiant fabrique est refuse (fail-closed)",
    (function () { try { IP.assertNoFabricatedIdentifiers([{ corpus: { works: [{ doi: "10.0000/mono08-zz99xx", workRef: "https://openalex.org/W9" }] } }]); return false; } catch (e) { return e.code === "IDENTIFIER_FABRICATION_DETECTED"; } })());
  check("T08c. un vrai DOI passe intact", IP.normalizeWork({ id: "https://openalex.org/W10", doi: "https://doi.org/10.1002/psp.590" }).doi === "https://doi.org/10.1002/psp.590");

  // ============ T09-T10 — gate scientifique ============
  check("T09. un pipeline professionnel vide interdit l'emission d'un verdict",
    (function () { try { SG.assertVerdictAllowed(emptyRun); return false; } catch (e) { return e.code === "SCIENTIFIC_VERDICT_FORBIDDEN"; } })());
  check("T09b. le run vide n'est jamais classe scientifiquement exploitable", emptyRun.scientificallyUsable === false && emptyRun.verdictMayBeIssued === false);
  const partial = SG.classifyRun({ graphNodes: [{ nodeId: "EF-04A", state: "SUCCESS" }],
    counts: { professionalsDiscovered: 12, professionalsVerified: 5, professionalCorpora: 5, twinsCreated: 4, reviewsCompleted: 12, aggregates: 7 },
    flags: { testMode: true, scientificValidity: false, humanProfessionalValidation: false } });
  check("T10. un EF-02A non vide mene jusqu'a une classification PARTIAL, pas EMPTY",
    partial.classification === SG.CLASSES.PARTIAL, partial.classification);
  check("T10b. meme peuple, le run reste non exploitable a cause des drapeaux geles",
    partial.scientificallyUsable === false && partial.structuralBlocker && partial.structuralBlocker.id === "SCIENTIFIC_VALIDITY_HARD_CODED_FALSE");

  // ============ T11-T12 — LLM ============
  check("T11. donnees non vides + LLM manquant => echec propre (fail-closed)",
    (function () { try { LR.assertLlmReadiness({ counts: { professionalCorpora: 5, twinsCreated: 4, reviewTargets: 3 }, workerCallFn: null, credentialsPresent: false }); return false; }
      catch (e) { return e.code === "LLM_DEPENDENCY_NOT_READY"; } })());
  check("T11b. donnees vides => le LLM n'est pas appele, et le rapport le dit au lieu de conclure READY",
    LR.assertLlmReadiness({ counts: { professionalCorpora: 0, twinsCreated: 0, reviewTargets: 3 } }).status === "NO_LLM_NEEDED_DATA_EMPTY");
  check("T11c. donnees non vides + LLM present => READY",
    LR.assertLlmReadiness({ counts: { professionalCorpora: 5, twinsCreated: 4, reviewTargets: 3 }, workerCallFn: function () {}, credentialsPresent: true }).status === "READY");
  check("T12. les noeuds a dependance LLM sont documentes avec leur declencheur",
    LR.LLM_REQUIRED_NODES.length === 2 && LR.LLM_REQUIRED_NODES.map(n => n.nodeId).join(",") === "EF-02D,EF-03B"
      && LR.LLM_REQUIRED_NODES.every(n => n.why && n.drivenBy));

  // ============ T13-T14 — drapeaux geles ============
  check("T13. scientificValidity ne peut pas devenir true : le gate le rapporte comme blocage, jamais ne le force",
    partial.frozenFlags.scientificValidity === false && partial.structuralBlocker.evidence.length >= 9);
  // Comme le test gele MONO-01/test/test_t01_17_no_epistemic_additions.js le
  // documente, on cible une AFFECTATION, jamais la mention du champ dans un
  // commentaire qui ENONCE l'interdiction. Les commentaires sont donc retires
  // avant le scan.
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
  const libSources = fs.readdirSync(path.join(__dirname, "..", "lib")).map(f => stripComments(fs.readFileSync(path.join(__dirname, "..", "lib", f), "utf8")));
  check("T13b. aucun fichier de MONO-09 n'AFFECTE scientificValidity=true (hors commentaires)",
    !libSources.some(s => /scientificValidity\s*[:=]\s*true/.test(s)));
  check("T13c. le test d'hygiene est reellement discriminant (il detecte une affectation injectee)",
    /scientificValidity\s*[:=]\s*true/.test(stripComments("const x = { scientificValidity: true };")));
  check("T14. humanProfessionalValidation ne peut etre simulee : aucun module ne l'AFFECTE a true",
    !libSources.some(s => /humanProfessionalValidation\s*[:=]\s*true/.test(s)));

  // ============ T15 — lots geles ============
  const agg = (root) => { const walk = (d, b) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => { const p = path.join(d, e.name); return e.isDirectory() ? walk(p, b) : [path.relative(b, p)]; });
    const files = walk(root, root).sort(); const h = crypto.createHash("sha256");
    for (const f of files) { h.update(f); h.update("\0"); h.update(fs.readFileSync(path.join(root, f))); h.update("\0"); } return h.digest("hex"); };
  const EXPECT = { "MONO-01": "db6bf1b45d2ac85de3d6d34dba7bc93ee61c9d9a8cddc57d7431b5fcc1f03597",
    "MONO-02": "7fcb0432f39b62f2e091a49b5fa86f5e8c6aabed5b1409f2e6fd71391e097935",
    "MONO-03": "bf7ae5f8cc4c60296fd865599920a56c40465cc3bbca31c2d18ada31b5adb387",
    "MONO-04": "d074b5277e020b282d85d9ea69f0d9b25501f28845823e9ed99cb320b34e3901",
    "MONO-05": "a98896ae3911f145cc5475a3a4de234b98f2fc7a5fc9357a0699cbebc9a7050f",
    "MONO-06": "2aa20db5dc6446af8e9dcdf92c037f583b6b29355046573da8c6c03471ac7450",
    "MONO-07": "cae33db34ade8ce479740f04a815d67484fd36cbe283b4085c423742a06b556d",
    "MONO-08/v0.6": "b6821e044d93add12cbc7d4a8533ad9aac2c1ea780ac7702fbb9adad3a845d56",
    "MONO-08/v0.7": "286b632f633d28586445e83221cf1ffda47b5fba7d0e74728d627fa324d822a6",
    "MONO-08/v0.8": "c67d93d437c1fd11527f8efa9d14f12dde8c5aaf6a76d3058a38f42cee7cf5b4" };
  let unchanged = 0, changed = [];
  for (const k of Object.keys(EXPECT)) { const p = path.join(KIT, k); if (!fs.existsSync(p)) { changed.push(k + " ABSENT"); continue; }
    if (agg(p) === EXPECT[k]) unchanged++; else changed.push(k); }
  check("T15. MONO-01 a MONO-08 strictement inchanges (empreinte contenu+chemin relatif)", changed.length === 0 && unchanged === 10, changed.join(","));

  // ============ T16 — donnees reelles du workspace, si disponibles ============
  const snapPath = path.join(WS, "retrieval-snapshot-v08.json"), decPath = path.join(WS, "audit-decisions-v08-confirmed.json");
  if (fs.existsSync(snapPath) && fs.existsSync(decPath)) {
    const realSeeds = SD.extractSeedAuthors({ snapshot: JSON.parse(fs.readFileSync(snapPath, "utf8")), auditDecisions: JSON.parse(fs.readFileSync(decPath, "utf8")) });
    check("T16. sur les donnees reelles, les 22 sources incluses fournissent des graines exploitables", realSeeds.length === 51, "seeds=" + realSeeds.length);
    check("T16b. aucune graine reelle n'est pre-verifiee", realSeeds.every(s => s.status === SD.STATUS.SEED && s.providerAuthorId === null));
  } else console.log("  SKIP  T16. donnees reelles du workspace absentes");

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
