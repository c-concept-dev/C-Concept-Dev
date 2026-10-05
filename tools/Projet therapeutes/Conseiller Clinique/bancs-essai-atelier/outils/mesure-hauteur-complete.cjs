// POINT 4 — SNAPDOM CAPTURE-T-IL LA HAUTEUR COMPLÈTE D'UN QUESTIONNAIRE QUI DÉBORDE ?
//
// Mesuré : la carte du questionnaire a 2507 px de contenu pour 798 px visibles — 1709 px hors
// champ. Une capture de la boîte visible en perd donc les deux tiers. On éprouve quatre cibles,
// de la plus naïve à la plus explicite, et on donne POIDS et TEMPS pour chacune.
const fs = require('node:fs'), path = require('node:path'), pw = require('playwright');
const { PNG } = require('pngjs');
const { servir } = require('./serveur.cjs');
const RACINE = path.join(__dirname, '..');

(async () => {
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const page = await nav.newPage({ viewport: { width: 1596, height: 898 } });
  await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto('http://127.0.0.1:' + port + '/entrees/questionnaire.html');
  await page.evaluate(() => { const b = document.querySelector('#cc-ws-present-start button'); if (b) b.click(); });
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')
    && document.getElementById('cc-ws-present-overlay').classList.contains('open'));
  await page.evaluate(async () => { window.__snapdom = (await import('/vendeur/snapdom.mjs')).snapdom; });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(800);

  const geo = await page.evaluate(() => {
    const inner = document.getElementById('cc-ws-present-slide-inner');
    const carte = inner.querySelector('.adoc-sc-card');
    return { inner: { l: inner.offsetWidth, h: inner.offsetHeight },
             carte: { l: carte.offsetWidth, h: carte.offsetHeight,
                      contenu: carte.scrollHeight, visible: carte.clientHeight } };
  });
  console.log('GÉOMÉTRIE RÉELLE');
  console.log('  enveloppe de diapositive : ' + geo.inner.l + 'x' + geo.inner.h);
  console.log('  carte                    : ' + geo.carte.l + 'x' + geo.carte.h
    + '   contenu ' + geo.carte.contenu + ' px pour ' + geo.carte.visible + ' px visibles  → '
    + (geo.carte.contenu - geo.carte.visible) + ' px hors champ');
  console.log('');

  const cibles = [
    { nom: 'enveloppe (ce que fait le banc)', sel: '#cc-ws-present-slide-inner', opts: {} },
    { nom: 'la carte elle-même', sel: '.adoc-sc-card', opts: {} },
    { nom: 'la carte, hauteur imposée', sel: '.adoc-sc-card', opts: { height: geo.carte.contenu } },
    { nom: 'la carte, débordement visible', sel: '.adoc-sc-card', opts: {}, deplier: true },
  ];
  const releve = [];
  console.log('QUATRE CIBLES');
  console.log('  cible                             taille obtenue   hauteur captée   durée    poids');
  for (const c of cibles) {
    if (c.deplier) {
      // On force la carte à montrer tout son contenu AVANT la capture : overflow visible et
      // hauteur explicite. C'est la seule manière d'obtenir la hauteur complète par une
      // bibliothèque qui lit la mise en page.
      await page.evaluate((h) => {
        const carte = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
        carte.dataset.ancienOverflow = carte.style.overflow || '';
        carte.dataset.ancienneHauteur = carte.style.height || '';
        carte.style.overflow = 'visible';
        carte.style.height = h + 'px';
      }, geo.carte.contenu);
      await page.waitForTimeout(300);
    }
    const t0 = Date.now();
    const r = await page.evaluate(async (a) => {
      try {
        const el = document.querySelector('#cc-ws-present-slide-inner ' + a.sel) || document.querySelector(a.sel);
        const s = await window.__snapdom(el, a.opts);
        return { ok: true, url: (await s.toPng()).src };
      } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
    }, { sel: c.sel, opts: c.opts });
    const ms = Date.now() - t0;
    let taille = '—', octets = 0;
    if (r.ok) {
      const buf = Buffer.from(r.url.split(',')[1], 'base64');
      const nom = 'hauteur-' + c.nom.replace(/[^a-z0-9]+/gi, '_') + '.png';
      fs.writeFileSync(path.join(RACINE, 'images', nom), buf);
      const im = PNG.sync.read(buf); taille = im.width + 'x' + im.height; octets = buf.length;
      releve.push({ cible: c.nom, selecteur: c.sel, options: c.opts, taille, hauteur: im.hauteur || im.height,
                    part_captee: +(100 * im.height / geo.carte.contenu).toFixed(1), duree_ms: ms, octets, image: nom });
    } else releve.push({ cible: c.nom, erreur: r.erreur });
    const part = r.ok ? (100 * PNG.sync.read(Buffer.from(r.url.split(',')[1], 'base64')).height / geo.carte.contenu).toFixed(0) + ' %' : '—';
    console.log('  ' + c.nom.padEnd(34) + taille.padEnd(17) + part.padEnd(17)
      + (ms + ' ms').padEnd(9) + (octets ? (octets / 1024).toFixed(0) + ' Ko' : r.erreur));
    if (c.deplier) {
      await page.evaluate(() => {
        const carte = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
        carte.style.overflow = carte.dataset.ancienOverflow;
        carte.style.height = carte.dataset.ancienneHauteur;
      });
    }
  }
  await nav.close(); serveur.close();
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai2-hauteur.json'),
    JSON.stringify({ geometrie: geo, hors_champ_px: geo.carte.contenu - geo.carte.visible, releve }, null, 2), 'utf8');
})();
