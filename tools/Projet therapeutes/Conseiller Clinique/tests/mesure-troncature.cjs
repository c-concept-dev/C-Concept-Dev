// TRONCATURE : le relevé des quatre réglages, sur les présentations d'essai et sur un document
// sans photo. Répond au point 3 du 7 octobre — « le mode fidèle était-il concerné ? » — par des
// nombres plutôt que par une opinion. L'encre du bord inférieur est lue dans l'IMAGE, sans
// passer par les chiffres du moteur : c'est la leçon du jour.
//
//   NODE_PATH=<playwright> node tests/mesure-troncature.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const RACINE = path.join(__dirname, '..');
const { PRESENTATIONS, IMAGES_EMBARQUEES, ILLUSTREE, SANS_PHOTO } = require('./chutier-fixtures.cjs');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

const REGLAGES = {
  a: { nom: '(a) fidèle 1422x800', o: { mode: 'fidele' } },
  b: { nom: '(b) 960x540', o: { mode: 'fidele', scene: { largeur: 960, hauteur: 540 } } },
  c: { nom: '(c) fidèle, typo x1,6', o: { mode: 'fidele', echelleTypo: 1.6 } },
  d: { nom: '(d) VIDÉO 960x540 x1,4', o: {} },
};

(async () => {
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    await page.evaluate((imgs) => { window.ADOC_EXPORT_IMAGES = imgs; }, IMAGES_EMBARQUEES);

    const docs = PRESENTATIONS.map((p) => ({ cle: p.nom, doc: p.doc }))
      .concat([{ cle: 'illustrée (photo de couverture + encadré final)', doc: ILLUSTREE },
               { cle: 'SANS photo (même contenu, sans couverture)', doc: SANS_PHOTO }]);

    const res = await page.evaluate(async ({ docs, reglages }) => {
      const encreDuBas = async (blob) => {
        const bmp = await createImageBitmap(blob);
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
        const d = g.getImageData(30, bmp.height - 10, bmp.width - 60, 10).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 170) n++;
        }
        bmp.close();
        return n;
      };
      const out = [];
      for (const d of docs) {
        for (const k of Object.keys(reglages)) {
          const t0 = performance.now();
          const r = await window.AtelierImages.rendreImages(d.doc, reglages[k]);
          const ms = performance.now() - t0;
          let encre = 0, coupe = 0, grandi = 0, perdus = 0, tours = 0, depasse = 0;
          for (const im of r.images) {
            encre += await encreDuBas(im.blob);
            if (im.coupe_px > 0) coupe++;
            depasse = Math.max(depasse, im.depassement_px);
            if (im.hauteur_avant_stabilisation < im.hauteur_contenu) {
              grandi++;
              perdus = Math.max(perdus, im.hauteur_contenu - im.hauteur_avant_stabilisation);
            }
            tours = Math.max(tours, im.tours_stabilisation);
          }
          out.push({ doc: d.cle, reglage: k, etapes: r.images.length,
            debordent: r.images.filter((im) => im.debordement).length,
            grandi: grandi, perdus: perdus, toursMax: tours, coupe: coupe, encre: encre,
            depasse: depasse, zoneMorte: r.images[0] ? r.images[0].zone_morte_px : 0,
            ms: Math.round(ms / r.images.length) });
        }
      }
      return out;
    }, { docs, reglages: Object.fromEntries(Object.entries(REGLAGES).map(([k, v]) => [k, v.o])) });

    console.log('TRONCATURE — quatre réglages, présentations d\'essai et document sans photo\n');
    console.log('  « aurait grandi » : étapes dont le contenu grandit quand la scène est agrandie');
    console.log('    pour y faire tenir le débordement. C\'est exactement le cas où l\'ancien code');
    console.log('    coupait, parce qu\'il avait mesuré la hauteur AVANT cet agrandissement.');
      console.log('  « coupé » : ce qui dépasse la ZONE MORTE, donc ce que le refus rejette. Au-delà de');
    console.log('    zéro, l\'image n\'est pas livrée du tout : une colonne à zéro est le résultat normal.');
    console.log('  « dépasse/zone morte » : le dépassement brut le plus fort, et la zone morte de la');
    console.log('    tolérance. Quelques pixels de dépassement sont le bruit de la mise en page, pas');
    console.log('    une troncature — l\'encre au bord le confirme.');
    console.log('  « encre au bord » : pixels d\'encre collés au bord inférieur de l\'image, lus dans');
    console.log('    l\'image elle-même. 0 = rien n\'est coupé, indépendamment de ce que dit le moteur.\n');
    let doc = null;
    console.log('    ' + 'réglage'.padEnd(26) + 'étapes  débordent  aurait grandi  px perdus  tours  coupé  dépasse/zone morte  encre  ms/img');
    for (const r of res) {
      if (r.doc !== doc) { doc = r.doc; console.log('\n  ' + doc); }
      console.log('    ' + REGLAGES[r.reglage].nom.padEnd(26)
        + String(r.etapes).padStart(6) + String(r.debordent).padStart(11)
        + String(r.grandi).padStart(15) + String(r.perdus).padStart(10)
        + String(r.toursMax).padStart(7) + String(r.coupe).padStart(7)
        + (r.depasse + '/' + r.zoneMorte).padStart(20)
        + String(r.encre).padStart(7) + String(r.ms).padStart(8));
    }
    const par = {};
    for (const r of res) {
      par[r.reglage] = par[r.reglage] || { grandi: 0, perdus: 0, encre: 0, etapes: 0 };
      par[r.reglage].grandi += r.grandi;
      par[r.reglage].etapes += r.etapes;
      par[r.reglage].perdus = Math.max(par[r.reglage].perdus, r.perdus);
      par[r.reglage].encre += r.encre;
    }
    console.log('\n  LE MODE FIDÈLE ÉTAIT-IL CONCERNÉ ? — verdict par réglage');
    for (const k of Object.keys(REGLAGES)) {
      const p = par[k];
      console.log('    ' + REGLAGES[k].nom.padEnd(26) + (p.grandi
        ? p.grandi + ' étape(s) sur ' + p.etapes + ' auraient été coupées, jusqu\'à ' + p.perdus + ' px'
        : 'AUCUNE étape concernée sur ' + p.etapes)
        + '  —  encre au bord après correction : ' + p.encre);
    }
    console.log('\n  erreurs de page : ' + (erreurs.length || 'aucune'));
    if (erreurs.length) { console.log('    ' + erreurs.join('\n    ')); process.exit(1); }
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
