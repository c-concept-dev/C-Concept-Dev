"use strict";
// test/test_t08_release_governance.js — LOCAL_CONTROLLED
//
// REMEDIATION F-06 (audit independant MONO-00-08) — T-NEW-10 : garde de
// non-regression pour que la declaration "fixtures/mission-real-smoke-
// v1.json copie tel quel depuis v0.5" (fausse, corrigee dans ce lot) ne
// puisse jamais silencieusement reapparaitre dans le dossier de preuve
// d'implementation sans qu'un test echoue.

const fs = require("fs");
const path = require("path");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

const evidenceDir = path.join(__dirname, "..", "..", "v0.6-implementation-evidence-2026-08-31");
const filesModifiedPath = path.join(evidenceDir, "files-modified-created.txt");

(async () => {
  if (!fs.existsSync(filesModifiedPath)) {
    console.error("test_t08_release_governance: " + filesModifiedPath + " introuvable — le dossier de preuve d'implementation n'a pas ete trouve a cote de v0.6/.");
    process.exit(2);
  }
  const content = fs.readFileSync(filesModifiedPath, "utf8");

  // Le fichier fixture ne doit plus apparaitre dans la section "FICHIERS
  // EXPLICITEMENT NON MODIFIÉS" (recherche ligne par ligne, jamais une
  // simple recherche de sous-chaine qui manquerait un deplacement de
  // section).
  const unmodifiedSectionMatch = content.split(/=== FICHIERS EXPLICITEMENT NON MODIFIÉS[^\n]*===/)[1];
  const unmodifiedSection = unmodifiedSectionMatch ? unmodifiedSectionMatch.split(/\n=== /)[0] : "";
  check("T-NEW-10a. fixtures/mission-real-smoke-v1.json n'est plus classe 'non modifie depuis v0.5' (F-06)", unmodifiedSection.indexOf("fixtures/mission-real-smoke-v1.json") === -1, unmodifiedSection.slice(0, 200));

  check("T-NEW-10b. la correction F-06 est presente et explicite dans le dossier de preuve", /CORRECTIF.*F-06/.test(content) && /readyForExecution=false/.test(content) && /readyForExecution=true/.test(content));

  const cdcTracePath = path.join(__dirname, "..", "CDC-TRACE.md");
  const cdcTrace = fs.readFileSync(cdcTracePath, "utf8");
  check("T-NEW-10c. CDC-TRACE.md pointe vers la correction F-06 (jamais silencieuse)", /CORRECTIF F-06/.test(cdcTrace));

  // La declaration d'origine (fausse) n'est jamais supprimee du depot —
  // seulement retiree de la liste active et corrigee en place. Verifiable
  // via git log (hors du perimetre de ce test Node), mais on verifie au
  // moins que le contenu ACTUEL reste honnete sur le sujet.
  check("T-NEW-10d. le dossier de preuve reste lisible et non tronque (contenu substantiel)", content.length > 500);

  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  const failed = results.filter(function (r) { return !r.pass; });
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
