"use strict";
// test/unit/test_t07_pkg_portability.js — T07-PKG-01/02/03

const path = require("path");
const fs = require("fs");
const { resolveKitRoot } = require("../../lib/kit-root");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  {
    let threw = null;
    const savedEnv = process.env.EVIDENCEFORGE_KIT_ROOT;
    delete process.env.EVIDENCEFORGE_KIT_ROOT;
    try {
      resolveKitRoot(["node", "script.js"]);
    } catch (e) {
      threw = e;
    }
    if (savedEnv !== undefined) process.env.EVIDENCEFORGE_KIT_ROOT = savedEnv;
    check("T07-PKG-01. aucun kitRoot fourni -> KIT_ROOT_REQUIRED, jamais un chemin par défaut", threw && threw.code === "KIT_ROOT_REQUIRED", threw && threw.message);
    check("T07-PKG-01b. le message d'erreur ne contient jamais un chemin de session (/home/claude)", threw && !threw.message.includes("/home/claude"));
  }

  {
    const resolvedFromCli = resolveKitRoot(["node", "script.js", "/explicit/cli/path"]);
    check("T07-PKG-02a. argument CLI explicite résolu correctement", resolvedFromCli === "/explicit/cli/path", resolvedFromCli);

    const savedEnv = process.env.EVIDENCEFORGE_KIT_ROOT;
    process.env.EVIDENCEFORGE_KIT_ROOT = "/explicit/env/path";
    const resolvedFromEnv = resolveKitRoot(["node", "script.js"]);
    if (savedEnv !== undefined) process.env.EVIDENCEFORGE_KIT_ROOT = savedEnv; else delete process.env.EVIDENCEFORGE_KIT_ROOT;
    check("T07-PKG-02b. variable d'environnement EVIDENCEFORGE_KIT_ROOT utilisée en l'absence d'argument CLI", resolvedFromEnv === "/explicit/env/path", resolvedFromEnv);

    const saved2 = process.env.EVIDENCEFORGE_KIT_ROOT;
    process.env.EVIDENCEFORGE_KIT_ROOT = "/env/path";
    const priorityResult = resolveKitRoot(["node", "script.js", "/cli/priority/path"]);
    if (saved2 !== undefined) process.env.EVIDENCEFORGE_KIT_ROOT = saved2; else delete process.env.EVIDENCEFORGE_KIT_ROOT;
    check("T07-PKG-02c. l'argument CLI est prioritaire sur la variable d'environnement", priorityResult === "/cli/priority/path", priorityResult);
  }

  {
    const root = path.join(__dirname, "..", "..");
    const scanDirs = ["lib", "test", "fixtures"].map((d) => path.join(root, d));
    let occurrences = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(abs); continue; }
        if (!/\.(js|json|md)$/.test(entry.name)) continue;
        if (abs === __filename) continue; // cet outil de recherche contient légitimement le motif qu'il recherche (même principe que scripts/static-search.sh, MONO-06)
        const content = fs.readFileSync(abs, "utf8");
        if (content.includes("/home/claude")) occurrences.push(path.relative(root, abs));
      }
    }
    for (const d of scanDirs) if (fs.existsSync(d)) walk(d);
    check("T07-PKG-03. recherche statique du paquet complet (lib/test/fixtures, hors cet outil de recherche lui-même) -> zéro occurrence fonctionnelle d'un chemin de session", occurrences.length === 0, JSON.stringify(occurrences));
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
