// D3 et D4 — LA PAGE INSÉRÉE EST PARTOUT, DANS SON ORDRE, ET RIEN D'AUTRE N'A BOUGÉ.
//
// Cinq surfaces, comparées étape par étape à l'état d'avant :
//   1. les étapes calculées (adocPresentStepList) ;
//   2. le mode présentation : le compteur « N / M » et le sommaire ;
//   3. l'export HTML autonome, capturé au vrai bouton et lu tel qu'il est téléchargé ;
//   4. le chutier visuel du lot 2 (AtelierImages.rendreImages), signature par étape ;
//   5. la narration, les identifiants et les blocs des autres diapositives.
//
//   NODE_PATH=<playwright> node tests/verify-page-inseree-partout.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
const PAGE_NEUVE = { title: 'La page insérée au milieu', blocks: [
  { type: 'paragraph', text: 'Le premier paragraphe de la page insérée.' },
  { type: 'paragraph', text: 'Le second paragraphe de la page insérée.' } ] };
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const serveur = http.createServer((q, r) => {
    if (q.method === 'POST') {
      let c = ''; q.on('data', (d) => { c += d; });
      q.on('end', () => {
        r.writeHead(200, { 'content-type': 'application/json' });
        r.end(q.url === '/' ? JSON.stringify({ content: [{ type: 'tool_use',
          name: 'emit_new_slide', input: PAGE_NEUVE }] }) : '{}');
      });
      return;
    }
    const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.addInitScript((p) => { try { localStorage.setItem('workerUrl', 'http://127.0.0.1:' + p); } catch (e) {} }, port);

  const releve = () => page.evaluate(async () => {
    const d = window._adocArtifacts.e._adocStructuredDoc;
    const res = await window.AtelierImages.rendreImages(d, { modeCapture: true, type: 'image/jpeg', qualite: 0.92 });
    return { cartes: d.blocks.map((c) => c.id),
             titres: d.blocks.map((c) => c.content.title),
             blocs: d.blocks.map((c) => (c.content.blocks || []).map((b) => b.id)),
             etapes: window.adocPresentStepList(d).map((e) => e.cardId + '/' + e.stepId + '/' + e.rang + '-' + e.surRang),
             narration: (d.narration || []).map((x) => x.stepId + ' :: ' + x.text),
             images: res.images.map((im) => im.stepId + ' :: ' + im.signature) };
  });

  try {
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    await page.waitForFunction(() => window.AtelierImages && typeof window.AtelierImages.rendreImages === 'function', { timeout: 30000 });
    await page.evaluate(async (d) => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.e = { name: d.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
      await window.adocOpenWorkspace('e');
    }, PRESENTATION);
    const avant = await releve();
    assert.equal(avant.cartes.length, 5, 'cinq diapositives au départ');

    // ── L'INSERTION, par les vrais gestes, après la 3e diapositive ─────────────────────────
    await page.evaluate(() => { const d = window._adocArtifacts.e._adocStructuredDoc;
      document.getElementById(d.blocks[2].content.blocks[0].id)?.click(); });
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
    await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
      .find((x) => (x.textContent || '').trim() === 'Créer la page'); b.click(); });
    await page.waitForSelector('[data-page-apercu]', { timeout: 20000 });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
      .find((x) => (x.textContent || '').trim() === 'Insérer'); b.click(); });
    await page.waitForFunction(() => window._adocArtifacts.e._adocStructuredDoc.blocks.length === 6, { timeout: 20000 });
    const apres = await releve();

    // ── 1. LES ÉTAPES, DANS L'ORDRE ───────────────────────────────────────────────────────
    assert.equal(apres.titres[3], PAGE_NEUVE.title, 'la page neuve est en 4e position : ' + apres.titres[3]);
    const idNeuf = apres.cartes[3];
    const sansLaNeuve = apres.cartes.filter((c) => c !== idNeuf);
    assert.deepEqual(sansLaNeuve, avant.cartes, 'les cinq autres gardent leur identifiant ET leur rang');
    // Les étapes portent `cardId/stepId`, mais une image est repérée par son SEUL stepId.
    // Les deux filtres ne peuvent donc pas s'écrire pareil : premier piège, et il m'a eu.
    const blocsNeufs = new Set(apres.blocs[3].concat([idNeuf]));
    const etapesNeuves = apres.etapes.filter((e) => e.startsWith(idNeuf + '/'));
    assert.ok(etapesNeuves.length > 0, 'la page neuve doit produire au moins une étape');
    assert.deepEqual(apres.etapes.filter((e) => !e.startsWith(idNeuf + '/')), avant.etapes,
      'les étapes des autres diapositives sont inchangées, rang compris');
    pass('étapes : ' + etapesNeuves.length + ' étape(s) neuve(s) au bon rang ; les ' + avant.etapes.length
      + ' autres inchangées, identifiant et rang compris.');

    // ── 2. LE MODE PRÉSENTATION : COMPTEUR ET SOMMAIRE ────────────────────────────────────
    await page.evaluate(() => window.adocPresentOpen());
    await page.waitForFunction(() => document.getElementById('cc-ws-present-counter'), { timeout: 15000 });
    const vuPresent = await page.evaluate(async () => {
      const lis = () => ({ compteur: (document.getElementById('cc-ws-present-counter') || {}).textContent || '',
                           titre: (document.querySelector('.adoc-sc-card-title, .adoc-sc-cover-title') || {}).textContent || '' });
      const depart = lis();
      // On va jusqu'à la 4e diapositive, celle qui vient d'être insérée.
      for (let i = 0; i < 3; i++) { window.adocPresentGoTo ? window.adocPresentGoTo(i + 1) : null; }
      await new Promise((r) => setTimeout(r, 500));
      const toc = [...document.querySelectorAll('.cc-ws-present-toc-item')].map((b) => (b.textContent || '').trim());
      return { depart: depart, arrivee: lis(), toc: toc };
    });
    assert.ok(/\/ 6$/.test(vuPresent.depart.compteur.trim()),
      'le compteur doit dire « … / 6 » : ' + JSON.stringify(vuPresent.depart.compteur));
    assert.ok(/^4 \//.test(vuPresent.arrivee.compteur.trim()),
      'la page insérée est la 4e : ' + JSON.stringify(vuPresent.arrivee.compteur));
    assert.ok(vuPresent.toc.length === 0 || vuPresent.toc.some((t) => t.includes(PAGE_NEUVE.title)),
      'le sommaire, s\'il est rendu, doit porter la page neuve : ' + JSON.stringify(vuPresent.toc.slice(0, 8)));
    pass('mode présentation : compteur « ' + vuPresent.arrivee.compteur.trim() + ' » sur six, '
      + (vuPresent.toc.length ? 'sommaire de ' + vuPresent.toc.length + ' entrées dont la page neuve'
                              : 'sommaire non déployé'));
    await page.evaluate(() => window.adocPresentClose && window.adocPresentClose());
    // Le mode présentation masque la barre : on attend que le bouton d'export redevienne
    // réellement cliquable, plutôt que de supposer un délai.
    await page.click('#cc-ws-export-menu-trigger');
    await page.waitForFunction(() => {
      const b = document.getElementById('cc-ws-export-standalone-presentation-btn');
      if (!b || b.hidden) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none';
    }, { timeout: 20000 });

    // ── 3. L'EXPORT HTML AUTONOME, CAPTURÉ AU VRAI BOUTON ─────────────────────────────────
    const [telechargement] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.locator('#cc-ws-export-standalone-presentation-btn').click(),
    ]);
    const chemin = await telechargement.path();
    const html = fs.readFileSync(chemin, 'utf8');
    const rang = (t) => html.indexOf(t);
    assert.ok(rang(PAGE_NEUVE.title) > 0, 'la page neuve doit être dans l\'export autonome');
    assert.ok(rang(avant.titres[2]) < rang(PAGE_NEUVE.title) && rang(PAGE_NEUVE.title) < rang(avant.titres[3]),
      'elle doit y être DANS SON ORDRE, entre la 3e et l\'ancienne 4e');
    for (const t of avant.titres) assert.ok(rang(t) > 0, 'l\'ancienne diapositive « ' + t + ' » est toujours là');
    pass('export HTML autonome (' + Math.round(html.length / 1024) + ' Ko) : la page neuve y est, '
      + 'entre la 3e et l\'ancienne 4e, et les cinq autres aussi.');

    // ── 4. LE CHUTIER, ET CE QUI NE DOIT PAS AVOIR BOUGÉ ──────────────────────────────────
    const imagesAutres = apres.images.filter((im) => !blocsNeufs.has(im.split(' :: ')[0]));
    assert.deepEqual(imagesAutres, avant.images,
      'les images des autres étapes doivent être IDENTIQUES, signature comprise');
    assert.equal(apres.images.length, apres.etapes.length, 'une image par étape');
    assert.ok(apres.images.some((im) => blocsNeufs.has(im.split(' :: ')[0])), 'la page neuve a ses images');
    pass('chutier : ' + apres.images.length + ' images pour ' + apres.etapes.length + ' étapes ; les '
      + imagesAutres.length + ' autres signatures sont inchangées, au bit près.');

    // ── 5. NARRATION, BLOCS, IDENTIFIANTS ─────────────────────────────────────────────────
    assert.deepEqual(apres.narration, avant.narration, 'la narration ne bouge pas');
    assert.deepEqual(apres.blocs.filter((_, i) => i !== 3), avant.blocs, 'aucun bloc des autres cartes ne change');
    const tous = apres.blocs.flat().concat(apres.cartes);
    assert.equal(tous.length, new Set(tous).size, 'aucun identifiant en double');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
    pass('narration, blocs et identifiants des cinq autres diapositives : intacts.');
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-page-inseree-partout — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
