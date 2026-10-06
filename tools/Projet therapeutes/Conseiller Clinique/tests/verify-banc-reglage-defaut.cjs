// LE RÉGLAGE QUE LA PAGE EMPLOIE VRAIMENT — et non celui qu'elle annonce.
//
// LE DÉFAUT QUE CE TEST REND IMPOSSIBLE. Le moteur avait le mode vidéo (d) pour défaut, et je
// l'avais annoncé comme tel. La page du banc, elle, envoyait « scène du lecteur » et « typo x1 »
// de façon EXPLICITE, ce qui écrasait ce défaut sans que rien ne le dise : elle rendait (a) en
// affichant deux listes dont les valeurs de départ n'avaient jamais été rapprochées de la
// décision du 6 octobre. Christophe l'a vu sur ses propres images — un corps de texte à 20 px
// là où (d) en donne 42 — c'est-à-dire par la mesure, pas par la lecture du code.
//
// Ce test vérifie ce que la page OBTIENT, pas ce qu'elle déclare : il rend des images par le
// bouton réel et lit la scène et l'échelle employées.
//
//   NODE_PATH=<playwright> node tests/verify-banc-reglage-defaut.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream',
                         'content-length': fs.statSync(p).size });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' });
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    await page.goto('http://127.0.0.1:' + port + '/banc-chutier/chutier.html');
    await page.waitForSelector('#banc-chutier');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');

    // ── 1. Un seul sélecteur, quatre réglages, (d) choisi au départ ───────────────────────────
    const sel = await page.evaluate(() => {
      const s = document.getElementById('bc-reglage');
      return { existe: !!s, valeur: s && s.value,
               options: s ? Array.from(s.options).map((o) => o.value) : [],
               libelle: s ? s.options[s.selectedIndex].textContent : null,
               anciens: !!document.getElementById('bc-scene') || !!document.getElementById('bc-typo') };
    });
    assert.equal(sel.existe, true, 'la page doit porter un sélecteur de réglage');
    assert.deepEqual(sel.options, ['a', 'b', 'c', 'd'], 'les quatre réglages de la planche');
    assert.equal(sel.valeur, 'd', 'et (d) doit être choisi au départ : ' + sel.valeur);
    assert.match(sel.libelle, /MODE VIDÉO/, 'libellé : ' + sel.libelle);
    assert.equal(sel.anciens, false, 'les deux anciennes listes, qui écrasaient le défaut, doivent avoir disparu');
    pass('un seul sélecteur, (d) choisi au départ — ' + sel.libelle.trim());

    // ── 2. CE QUE LA PAGE OBTIENT, en rendant vraiment ────────────────────────────────────────
    await page.click('#bc-rendre');
    await page.waitForFunction(() => /terminé/.test(document.getElementById('bc-etat').textContent), { timeout: 120000 });
    const recap = await page.$$eval('#bc-recap tr', (r) => r.map((x) => x.cells[0].textContent + ' = ' + x.cells[1].textContent));
    const trouve = (c) => recap.find((l) => l.indexOf(c) === 0) || '';
    assert.match(trouve('scène puis sortie'), /960x540/,
      'la page doit rendre à la scène du mode vidéo : ' + trouve('scène puis sortie'));
    assert.match(trouve('échelle typographique'), /x1,4/,
      'et à son échelle typographique : ' + trouve('échelle typographique'));
    assert.match(trouve('format'), /image\/png/, 'PNG par défaut : ' + trouve('format'));
    assert.match(trouve('citations et sources'), /visibles/, 'citations visibles par défaut (décision en attente)');
    console.log('      ' + trouve('scène puis sortie'));
    console.log('      ' + trouve('échelle typographique') + '   |   ' + trouve('citations et sources'));
    pass('la page REND bien en mode vidéo, scène et échelle lues dans le relevé.');

    // ── 3. Le réglage (a) reste atteignable, et donne l'ancien rendu ──────────────────────────
    await page.selectOption('#bc-reglage', 'a');
    // L'état porte encore « terminé » du rendu précédent : sans le vider, l'attente se satisfait
    // aussitôt et on relirait l'ancien tableau. Mesuré — le contrôle échouait sur un tableau vide.
    await page.evaluate(() => { document.getElementById('bc-etat').textContent = ''; });
    await page.click('#bc-rendre');
    await page.waitForFunction(() => /terminé/.test(document.getElementById('bc-etat').textContent), { timeout: 120000 });
    const recapA = await page.$$eval('#bc-recap tr', (r) => r.map((x) => x.cells[0].textContent + ' = ' + x.cells[1].textContent));
    const trouveA = (c) => recapA.find((l) => l.indexOf(c) === 0) || '';
    assert.match(trouveA('scène puis sortie'), /1422x800/, 'réglage (a) : ' + trouveA('scène puis sortie'));
    assert.match(trouveA('échelle typographique'), /aucune/, 'et sans échelle : ' + trouveA('échelle typographique'));
    pass('le réglage (a) reste disponible et rend bien 1422x800 sans échelle.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    pass('aucune erreur de page.');
    console.log('\nPASS verify-banc-reglage-defaut — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
