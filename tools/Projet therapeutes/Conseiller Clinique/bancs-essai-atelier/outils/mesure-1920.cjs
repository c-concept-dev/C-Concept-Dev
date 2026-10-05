// LA SORTIE RÉELLEMENT VISÉE : 1920x1080. La diapositive a 1422x800 de mise en page, soit
// 1920/1422 = 1.3502 de rapport. On mesure si les candidats savent émettre cette taille
// directement, et ce qu'elle coûte — c'est le chiffre qui compte pour un montage de 40 images.
const fs = require('node:fs'), path = require('node:path'), pw = require('playwright');
const { PNG } = require('pngjs');
const { servir } = require('./serveur.cjs');
const RACINE = path.join(__dirname, '..');
const RAPPORT = +(1920 / 1422).toFixed(4);

(async () => {
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const releve = [];
  console.log('SORTIE 1920 DE LARGE (rapport ' + RAPPORT + ' sur une mise en page de 1422x800)');
  console.log('  candidat        jeu              taille obtenue   durée    octets');
  for (const cand of ['snapdom', 'html-to-image']) {
    for (const jeu of ['couverture', 'dense', 'questionnaire']) {
      const page = await nav.newPage({ viewport: { width: 1596, height: 898 } });
      await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
      await page.goto('http://127.0.0.1:' + port + '/entrees/' + jeu + '.html');
      await page.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
      await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
      if (cand === 'snapdom') await page.evaluate(async () => { window.__snapdom = (await import('/vendeur/snapdom.mjs')).snapdom; });
      else await page.addScriptTag({ path: path.join(RACINE, 'vendeur', 'html-to-image.js') });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.waitForTimeout(320);
      const t0 = Date.now();
      const r = await page.evaluate(async (a) => {
        const el = document.querySelector('#cc-ws-present-slide-inner');
        try {
          if (a.cand === 'snapdom') {
            const s = await window.__snapdom(el, { scale: a.rapport });
            return { ok: true, url: (await s.toPng()).src };
          }
          return { ok: true, url: await window.htmlToImage.toPng(el, { pixelRatio: a.rapport }) };
        } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
      }, { cand, rapport: RAPPORT });
      const ms = Date.now() - t0;
      let taille = '—', octets = 0, nom = null;
      if (r.ok && r.url && r.url.startsWith('data:image/png;base64,')) {
        const buf = Buffer.from(r.url.split(',')[1], 'base64');
        nom = jeu + '-' + cand + '-1920.png';
        fs.writeFileSync(path.join(RACINE, 'images', nom), buf);
        const p = PNG.sync.read(buf); taille = p.width + 'x' + p.height; octets = buf.length;
      }
      console.log('  ' + cand.padEnd(16) + jeu.padEnd(17) + taille.padEnd(17)
        + (ms + ' ms').padEnd(9) + (octets ? (octets / 1024).toFixed(0) + ' Ko' : (r.erreur || 'échec')));
      releve.push({ candidat: cand, jeu, taille, duree_ms: ms, octets, image: nom, erreur: r.erreur || null });
      await page.close();
    }
  }
  await nav.close(); serveur.close();
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai2-1920.json'),
    JSON.stringify({ rapport: RAPPORT, mise_en_page: '1422x800', cible: '1920x1080', releve }, null, 2), 'utf8');
})();
