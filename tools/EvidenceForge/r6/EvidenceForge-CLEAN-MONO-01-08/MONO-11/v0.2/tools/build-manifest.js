#!/usr/bin/env node
"use strict";
/** Construit MANIFEST.json depuis des MESURES (tests, balayage, sceaux), jamais des valeurs tapees. */
const fs = require("fs"), path = require("path"), crypto = require("crypto"), cp = require("child_process");
const LOT = path.resolve(__dirname, "..");
const KIT = process.env.EVIDENCEFORGE_BUNDLE_ROOT || path.resolve(LOT, "..", "..");
process.env.EVIDENCEFORGE_BUNDLE_ROOT = KIT;
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const t = cp.spawnSync("node", ["--test", "test/test-mono11-v0.2.js"], { cwd: LOT, encoding: "utf8", env: process.env });
const out = t.stdout + t.stderr;
const n = (k) => { const m = new RegExp("^ℹ " + k + " (\\d+)", "m").exec(out); return m ? Number(m[1]) : null; };
const tests = { total: n("tests"), pass: n("pass"), fail: n("fail"), skipped: n("skipped"), exitCode: t.status };
const scan = require("./anti-hardcoding-scan.js").scan();
const FB = require("../core/frozen-bridge.js");
const F = FB.loadFrozen({ bundleRoot: KIT });
const seals = {}; Object.keys(F.seals).forEach((k) => { seals[k] = { files: F.seals[k].files, divergences: F.seals[k].divergences.length }; });
const zip = path.join(KIT, "MONO-10", "EvidenceForge-MONO10-SCIENTIFIC-QUALIFICATION-v0.19.zip");
const gateSha = sha(path.join(LOT, "core", "machine-evidence-gate.js"));
const m = {
  lot: "MONO-11", version: "v0.2", name: "Autonomous Panel Successor — correctif minimal post-audit (normalisation cible, enforcement EF-02D3/EF-03B, reprise informee, reuse, scellement avant run, persistance)", predecessor: { version: "v0.1", zipSha256: "ba9dd877aea77248edf63a5c1c9fad5475f2e56c9df398426d229089a253ea26", intact: true }, builtAt: new Date().toISOString(),
  status: "IMPLEMENTE / TESTE — verdict technique propose, NON GELE (gel = decision ChatGPT/proprietaire apres audit independant)",
  charte: { version: "v2", file: "governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE-v2.md", sha256: sha(path.join(LOT, "governance", "EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE-v2.md")),
    v1Historical: { file: "governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE-v1-HISTORIQUE.md", sha256: sha(path.join(LOT, "governance", "EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE-v1-HISTORIQUE.md")) } },
  composes: { "MONO-10": "v0.19 (gele, intact)", "MONO-09": "v0.2 (gele, intact)", "MONO-01": "dependencies EF-02D1/D2/D3, EF-02E, EF-03A/B/C, EF-PR-GEN (gele, intact)" },
  frozenIntegrity: { seals: seals, mono10CanonicalZipSha256: fs.existsSync(zip) ? sha(zip) : null, mono10Modified: seals.MONO10.divergences === 0 ? "NO" : "YES" },
  measurements: { tests: tests, antiHardcodingScan: { hits: scan.hits.length, caseArtifactsDeclared: scan.caseArtifactsDeclared, caseTokens: scan.caseTokens,
    FIXED_PROFESSION_LIST: scan.FIXED_PROFESSION_LIST, FIXED_DISCIPLINE_LIST: scan.FIXED_DISCIPLINE_LIST, FIXED_EXPERT_LIST: scan.FIXED_EXPERT_LIST, FIXED_PANEL_SIZE: scan.FIXED_PANEL_SIZE,
    CASE_SPECIFIC_LEAK_FOUND: scan.CASE_SPECIFIC_LEAK_FOUND, DOMAIN_HARDCODING_FOUND: scan.DOMAIN_HARDCODING_FOUND }, gateModuleSha256: gateSha },
  contracts: "contracts/mono11-contracts.json",
  auditFindingsAddressed: ["3 revues rejetees (2 FORMAT_NORMALIZATION_ONLY, 1 SCHEMA_DRIFT) -> normalisation a l'ingestion + enforcement local + reprise informee", "F1 run sur code pre-sceau -> run-seal-guard (RUN_ON_UNSEALED_CODE) + sceau epingle dans l'ancre du ledger", "F2 no-replay par prompt -> politique de reuse par reponse avec validationStatus", "F3 worksSubmitted -> worksAttributed + worksSubmittedToOracle", "F6 preuves non persistees -> ledger.exportArtifacts", "F7/M9 regle 100 % faiblement epinglee -> T39/T40 (N=100, mutants 99/90/80 %)", "F10 eligibilite fabriquee sur override -> retiree", "F13 topics cites comme oeuvres -> coverage-enforcer"],
  debts: [
    { id: "D-M11-01", class: "CONTRACT_GAP", statement: "L'acte machine n'est pas signe par l'autorite de la frontiere ; son authenticite tient a la liaison au run atteste, a l'ancrage du ledger sur le registre MONO-10 et au hash du module de gate.", blocking: false },
    { id: "D-M11-02", class: "SCIENTIFIC_LIMITATION", statement: "La pertinence est jugee sur les METADONNEES des oeuvres attribuees (titres, DOI, annees, themes), pas sur leur texte integral.", blocking: false },
    { id: "D-M11-03", class: "TEST_GAP", statement: "corpusSufficiencyPolicy est test_unvalidated : garde-fou technique, sans validation methodologique separee.", blocking: false },
    { id: "D-M11-04", class: "INTEGRATION_GAP", statement: "Les artefacts de phase 1 sont reutilises par re-enregistrement a l'identique, non via l'autorite d'entree historique de MONO-10 (§7/§8).", blocking: false },
    { id: "D-M11-05", class: "SCIENTIFIC_LIMITATION", statement: "G-11 est syntaxique dans le gate (references presentes), la resolution contre le ledger n'est pas rejouee par le gate lui-meme.", blocking: false },
    { id: "D-M11-06", class: "CONTRACT_GAP", statement: "Le bridge des lots geles n'epingle pas le fichier de sceau lui-meme (un attaquant reecrivant le sceau ET le fichier n'est pas vu par le bridge ; le zip canonique MONO-10 est verifie par le run reel).", blocking: false },
    { id: "D-M11-07", class: "CONFIGURATION", statement: "Attestation de run portee a 8 h par l'exploitant (defaut MONO-10 : 1 h) pour un run long — consignee dans l'etat du run.", blocking: false },
  ],
  technicalVerdict: (tests.fail === 0 && tests.pass === tests.total && scan.hits.length === 0 && seals.MONO10.divergences === 0 && seals.MONO09.divergences === 0 && seals.MONO01.divergences === 0) ? "GELABLE_TECHNIQUEMENT" : "NON_GELABLE",
  notFrozen: true,
};
fs.writeFileSync(path.join(LOT, "MANIFEST.json"), JSON.stringify(m, null, 2) + "\n");
console.log(JSON.stringify({ tests, scanHits: scan.hits.length, seals, verdict: m.technicalVerdict }));
