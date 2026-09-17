"use strict";

// test/package-check.js — CDC MONO-05, correction post-audit (reproductibilité
// du package). `npm ci` installe le PAQUET JS `playwright` (déclaré en
// devDependency, version figée, avec package-lock.json commité) — mais le
// BINAIRE Chromium lui-même n'est PAS garanti par `npm ci` seul sur une
// machine neuve sans cache préexistant. Ce script vérifie explicitement les
// deux étapes séparément, avec un message actionnable, avant que
// run-all.js ne décide d'exécuter ou non les tests navigateur — jamais un
// crash cryptique "Cannot find module" ni une prétention silencieuse à
// l'autosuffisance.
//
// Procédure d'installation complète et réellement testée :
//   npm ci
//   npx playwright install chromium   (si le binaire n'est pas déjà disponible)
//   npm test

async function checkPackageResolution() {
  try {
    require.resolve("playwright");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: "MODULE_NOT_RESOLVED",
      message: 'Le paquet "playwright" (devDependency, voir package.json) n\'est pas résolu depuis la racine MONO-05. Exécuter : npm ci',
    };
  }
}

async function checkChromiumLaunch() {
  let chromium;
  try {
    chromium = require("playwright").chromium;
  } catch (e) {
    return { ok: false, reason: "MODULE_NOT_RESOLVED", message: "playwright non résolu (voir checkPackageResolution)." };
  }
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    return {
      ok: false,
      reason: "CHROMIUM_NOT_AVAILABLE",
      message: 'Le binaire Chromium de Playwright n\'est pas disponible dans cet environnement. "npm ci" installe uniquement le paquet JS — le binaire du navigateur doit être obtenu séparément. Exécuter : npx playwright install chromium',
      cause: String(e && e.message),
    };
  }
  await browser.close();
  return { ok: true };
}

async function runPackageCheck() {
  const moduleCheck = await checkPackageResolution();
  if (!moduleCheck.ok) return moduleCheck;
  const chromiumCheck = await checkChromiumLaunch();
  return chromiumCheck;
}

module.exports = { runPackageCheck, checkPackageResolution, checkChromiumLaunch };

if (require.main === module) {
  runPackageCheck().then((result) => {
    if (result.ok) {
      console.log("PASS — playwright résolu (require.resolve) et chromium.launch() réussit dans cet environnement.");
      process.exit(0);
    } else {
      console.log(`FAIL — [${result.reason}] ${result.message}` + (result.cause ? `\n  cause: ${result.cause}` : ""));
      process.exit(1);
    }
  });
}
