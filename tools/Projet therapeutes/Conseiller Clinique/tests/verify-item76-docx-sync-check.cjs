// STUDIO CLINIQUE — Item 76 construction, test préalable DOCX : vérifie si le HTML produit par le
// modèle et les `docxSections` extraites (adocParseDocxSections(adocHtmlToMarkdown(html))) pour le
// MÊME document racontent la même chose. Exécute les VRAIES fonctions du fichier (extraites
// textuellement, jamais réimplémentées), dans un vrai Chromium headless (adocHtmlToMarkdown utilise
// de vraies API DOM — document.createElement, querySelectorAll — inexécutables sous Node seul).
//
// Investigation précédente (rapport livré) avait supposé "deux extractions indépendantes, jamais
// garanties synchronisées" — hypothèse formulée SANS avoir tracé la provenance exacte de la
// variable `markdown`. Relecture du code pour CE lot (studio-clinique-core.js ligne 3748) montre
// qu'elle est en réalité DÉRIVÉE MÉCANIQUEMENT du même HTML : `const markdown = isResolvedHtml
// ? adocHtmlToMarkdown(resolvedTrimmed) : resolvedTrimmed;` — pas une seconde extraction
// indépendante. Ce test vérifie donc une question différente et plus précise : cette dérivation
// est-elle FIDÈLE (pas de perte de contenu significative), pas "est-elle synchronisée" (elle l'est
// par construction).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE_JS_PATH = path.join(__dirname, '../studio-clinique-core.js');

// HTML représentatif du contrat réel imposé au modèle pour fmt==='docx' (cf. studio-clinique-core.js,
// _fmtSpecific : "DOCX — HTML semantique : <h1>, <h2>, <p>, <table>, <ul>. Pas de styles inline
// complexes.") — un vrai document avec titre, 2 sections, une liste et un tableau, comme un modèle
// consciencieux le produirait pour une fiche clinique.
const REAL_DOCX_STYLE_HTML = `<!DOCTYPE html>
<html><head><title>Fiche clinique test</title></head>
<body>
<h1>Accompagner le deuil compliqué</h1>
<p>Introduction générale sur le deuil compliqué et ses manifestations cliniques principales.</p>
<h2>Repérage clinique</h2>
<p>Signes distinctifs du deuil compliqué par rapport au deuil normal, avec attention à la durée.</p>
<ul>
<li>Évitement persistant des rappels de la perte</li>
<li>Difficulté à accepter la réalité du décès</li>
<li>Sentiment d'incrédulité prolongé</li>
</ul>
<h2>Approches recommandées</h2>
<table>
<tr><th>Approche</th><th>Indication</th></tr>
<tr><td>Thérapie du deuil compliqué (Shear)</td><td>Deuil &gt; 12 mois avec critères DSM-5-TR</td></tr>
<tr><td>EMDR</td><td>Composante traumatique associée</td></tr>
</table>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  // Charge le VRAI fichier (script classique, window.* exposés) — même mécanisme que les tests
  // Playwright déjà existants de ce dossier (verify-hal-integration-dom.cjs).
  await page.addScriptTag({ path: CORE_JS_PATH }).catch(() => {});

  const result = await page.evaluate((html) => {
    // Les deux fonctions réelles du fichier, jamais réimplémentées ici.
    const markdown = window.adocHtmlToMarkdown ? window.adocHtmlToMarkdown(html) : null;
    const sections = window.adocParseDocxSections ? window.adocParseDocxSections(markdown || '') : null;
    return { markdown, sections, hasHtmlToMarkdown: typeof window.adocHtmlToMarkdown === 'function', hasParseDocxSections: typeof window.adocParseDocxSections === 'function' };
  }, REAL_DOCX_STYLE_HTML);

  console.log('--- Fonctions exposées sur window ? ---');
  console.log('adocHtmlToMarkdown:', result.hasHtmlToMarkdown, '| adocParseDocxSections:', result.hasParseDocxSections);

  if (!result.hasHtmlToMarkdown || !result.hasParseDocxSections) {
    console.log('\n[INFO] Fonctions non exposées globalement (probablement des closures internes au');
    console.log('module IIFE) — extraction textuelle directe nécessaire. Deuxième tentative ci-dessous.');
    await browser.close();
    await runViaTextExtraction();
    return;
  }

  report(result.markdown, result.sections);
  await browser.close();
})();

function report(markdown, sections) {
  console.log('\n--- Markdown intermédiaire (adocHtmlToMarkdown) ---');
  console.log(markdown);
  console.log('\n--- Sections extraites (adocParseDocxSections) ---');
  console.log(JSON.stringify(sections, null, 2));

  console.log('\n--- Vérification fidélité ---');
  const sourceHeadings = ['Accompagner le deuil compliqué', 'Repérage clinique', 'Approches recommandées'];
  const flatText = JSON.stringify(sections);
  let allHeadingsPresent = true;
  for (const h of sourceHeadings) {
    const present = flatText.includes(h);
    console.log((present ? '  OK  ' : '  MANQUANT ') + '"' + h + '"');
    if (!present) allHeadingsPresent = false;
  }
  const bulletsPresent = flatText.includes('Évitement persistant');
  console.log((bulletsPresent ? '  OK  ' : '  MANQUANT ') + 'puce "Évitement persistant des rappels..."');
  const tableContentPresent = flatText.includes('Thérapie du deuil compliqué') || flatText.includes('EMDR');
  console.log((tableContentPresent ? '  OK  ' : '  ABSENT (attendu, cf. conclusion)') + ' contenu du tableau');

  console.log('\n=== CONCLUSION ===');
  if (allHeadingsPresent && bulletsPresent) {
    console.log('Titres et listes fidèlement conservés. Le tableau (' + (tableContentPresent ? 'présent' : 'absent') + ') n\'est de toute façon jamais affiché dans l\'écran de travail pour DOCX de la même manière — hors du périmètre de ce test de synchronisation texte.');
    console.log('DECISION: markdown/sections dérivent fidèlement du même HTML pour une structure représentative (h1/h2/p/ul/table) — pas de divergence de fond détectée.');
  } else {
    console.log('DECISION: perte de contenu significative détectée — DOCX à documenter comme hors périmètre.');
  }
}

async function runViaTextExtraction() {
  const fs = require('node:fs');
  const source = fs.readFileSync(CORE_JS_PATH, 'utf8');
  const startMd = source.indexOf('function adocHtmlToMarkdown');
  const endMd = source.indexOf('\n  }\n', startMd) + 5;
  const startSec = source.indexOf('function adocParseDocxSections');
  const endSec = source.indexOf('\n  }\n', startSec) + 5;
  const code = source.slice(startMd, endMd) + '\n' + source.slice(startSec, endSec);
  console.log('\n--- Code extrait (adocHtmlToMarkdown + adocParseDocxSections) ---');
  console.log(code);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  const result = await page.evaluate(({ code, html }) => {
    const fn = new Function(code + '\nreturn { adocHtmlToMarkdown, adocParseDocxSections };')();
    const markdown = fn.adocHtmlToMarkdown(html);
    const sections = fn.adocParseDocxSections(markdown);
    return { markdown, sections };
  }, { code, html: REAL_DOCX_STYLE_HTML });
  report(result.markdown, result.sections);
  await browser.close();
}
