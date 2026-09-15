// A12 (audit Codex, P1) — l'export PDF supprimait tout paragraphe de 1-3 chiffres, sans
// discernement du sens clinique. Investigation complète (rapport de lot) : aucune pagination
// native n'est jamais produite par cette route (aucun header/footer/@page), et aucun marqueur
// structurel fiable n'existe pour distinguer un éventuel numéro de page d'un contenu clinique
// court — une détection par séquence a été testée et rejetée (un contenu clinique isolé entre
// deux marqueurs casse toute suite consécutive). Décision confirmée : retirer la suppression
// entièrement plutôt que risquer un seul faux positif sur un contenu clinique réel.
// Ce test EXTRAIT LE CODE RÉEL de Worker/index.js (jamais une réimplémentation à la main) et
// l'exécute dans un vrai navigateur (Playwright), exactement comme Cloudflare Browser Rendering
// le fait avant la capture PDF.
const fs = require('fs');
const { chromium } = require('playwright');

const WORKER_PATH = '/home/user/C-Concept-Dev/Worker/index.js';

function extractDomScript(src) {
  const startMarker = 'const domScript = `<script>';
  const endMarker = '<\\/script>`;';
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) throw new Error('domScript start marker introuvable');
  const bodyStart = startIdx + startMarker.length;
  const endIdx = src.indexOf(endMarker, bodyStart);
  if (endIdx === -1) throw new Error('domScript end marker introuvable');
  return src.slice(bodyStart, endIdx);
}

// Document réaliste : contenu clinique légitime (un score PHQ-9 "12" et une durée "45" minutes,
// chacun isolé) + une suite de marqueurs "1","2","3","4" comme en produirait une hypothétique
// pagination — pour prouver qu'ils survivent désormais TOUS, comme n'importe quel autre contenu.
const FIXTURE_HTML = `<!DOCTYPE html><html><body>
<h1>Fiche clinique — évaluation PHQ-9</h1>
<p>1</p>
<h2>Section 1 — Évaluation initiale</h2>
<p>Le score obtenu à l'échelle PHQ-9 pour cette patiente est de :</p>
<p>12</p>
<p>Ce score indique une dépression modérée nécessitant un suivi rapproché.</p>
<p>2</p>
<h2>Section 2 — Plan de séance</h2>
<p>La durée recommandée de la séance de restructuration cognitive est de :</p>
<p>45</p>
<p>minutes, réparties en trois phases égales.</p>
<p>3</p>
<h2>Section 3 — Suivi</h2>
<div class="callout" style="background:#eef;">Point de vigilance important pour la suite du suivi.</div>
<p>4</p>
<h2>Section 4 — Synthèse</h2>
<p>Un contenu clinique final, sans rapport avec la pagination.</p>
<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" alt="test" />
</body></html>`;

async function runScriptInPage(browser, jsCode) {
  const page = await browser.newPage();
  await page.setContent(FIXTURE_HTML);
  await page.evaluate(jsCode);
  const state = await page.evaluate(() => {
    const all = [...document.querySelectorAll('p')];
    const callout = document.querySelector('.callout');
    const img = document.querySelector('img');
    return {
      paragraphs: all.map(p => ({ text: p.textContent.trim(), hidden: p.style.display === 'none' })),
      calloutBreakInside: callout ? callout.style.pageBreakInside : null,
      imgMaxHeight: img ? img.style.maxHeight : null,
    };
  });
  await page.close();
  return state;
}

function isVisibleByText(paragraphs, text) {
  const entries = paragraphs.filter(s => s.text === text);
  return entries.length > 0 && entries.every(e => !e.hidden);
}

(async () => {
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);
  const browser = await chromium.launch();

  const src = fs.readFileSync(WORKER_PATH, 'utf8');
  log('0a. Précondition — le prétraitement texte brut (regex sur <p>N</p>) a bien été retiré', !src.includes("h.replace(/<p[^>]*>\\s*\\d{1,3}\\s*<\\/p>/gi, '')"));
  log('0b. Précondition — le masquage DOM par contenu numérique (1-3 chiffres) a bien été retiré', !/style\.display\s*=\s*['"]none['"]\s*;\s*\n?\s*\}\s*\n?\s*\}\s*\n?\s*\}\s*\n\s*\/\/ Limiter/.test(src) && !src.includes("Supprimer les éléments qui ne contiennent que 1-3 chiffres"));
  const domScript = extractDomScript(src);
  const state = await runScriptInPage(browser, domScript);
  const p = state.paragraphs;

  // ═══ 1. Contenu clinique légitime — SURVIT ═══
  log('1a. Le score clinique "12" (PHQ-9) SURVIT à l\'export après correctif', isVisibleByText(p, '12'), p);
  log('1b. La durée clinique "45" (minutes) SURVIT à l\'export après correctif', isVisibleByText(p, '45'), p);

  // ═══ 2. Tout marqueur numérique court (y compris ce qui aurait pu ressembler à une pagination)
  // survit désormais aussi — décision explicite : plus aucun risque de faux positif sur du réel ═══
  log('2a. Le marqueur "1" survit également (plus aucune suppression aveugle par contenu)', isVisibleByText(p, '1'), p);
  log('2b. Le marqueur "2" survit également', isVisibleByText(p, '2'), p);
  log('2c. Le marqueur "3" survit également', isVisibleByText(p, '3'), p);
  log('2d. Le marqueur "4" survit également', isVisibleByText(p, '4'), p);

  // ═══ 3. Non-régression — le reste du script DOM (break-inside, images) fonctionne toujours ═══
  log('3a. Non-régression — page-break-inside:avoid toujours appliqué aux encadrés colorés', state.calloutBreakInside === 'avoid', state.calloutBreakInside);
  log('3b. Non-régression — le redimensionnement des images est toujours appliqué', state.imgMaxHeight === '260px', state.imgMaxHeight);

  console.log('=== Résultats — A12 : export PDF, suppression de paragraphes numériques retirée ===');
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
  }
  const failCount = results.filter(r => !r[1]).length;
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
