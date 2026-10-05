// POINT 3 — LA DIAPOSITIVE DOIT REMPLIR UN CADRE DE 1920x1080, exactement 1920 de large.
//
// La mise en page de #cc-ws-present-slide-inner est TOUJOURS 1422x800 (mesuré). 1422x800 est en
// 16:9 à 0,02 % près (1,7775 contre 1,7778), donc un cadre 1920x1080 est atteignable sans
// déformer. Reste à savoir COMMENT, et ce que cela coûte en netteté :
//   (a) capturer à l'échelle 1 (1422x800) puis AGRANDIR sur canvas jusqu'à 1920x1080 ;
//   (b) capturer directement à l'échelle native 1920/1422.
// La netteté est mesurée par l'ÉNERGIE DE GRADIENT (somme des écarts entre voisins) sur la zone de
// texte : un agrandissement bicubique lisse les contours et fait chuter cette énergie. Les deux
// images sont aussi versées à la feuille de comparaison, pour l'œil.
const fs = require('node:fs'), path = require('node:path'), pw = require('playwright');
const { PNG } = require('pngjs');
const { servir } = require('./serveur.cjs');
const RACINE = path.join(__dirname, '..');
const FENETRE = { width: 1596, height: 898 };
const CIBLE_L = 1920, CIBLE_H = 1080;

// Énergie de gradient par pixel, sur une bande horizontale centrale (là où vit le texte).
function nettete(chemin) {
  const p = PNG.sync.read(fs.readFileSync(chemin));
  const y0 = Math.round(p.height * 0.25), y1 = Math.round(p.height * 0.75);
  let somme = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 1; x < p.width; x++) {
      const i = (y * p.width + x) * 4, j = i - 4;
      somme += Math.abs(p.data[i] - p.data[j]) + Math.abs(p.data[i+1] - p.data[j+1]) + Math.abs(p.data[i+2] - p.data[j+2]);
      n++;
    }
  }
  return { largeur: p.width, hauteur: p.height, energie_par_pixel: +(somme / n).toFixed(3) };
}

(async () => {
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const page = await nav.newPage({ viewport: FENETRE });
  await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto('http://127.0.0.1:' + port + '/entrees/nombres.html');
  await page.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
  await page.evaluate(async () => { window.__snapdom = (await import('/vendeur/snapdom.mjs')).snapdom; });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(800);   // l'animation de nombre dure 700 ms

  // D'abord : quelle option donne EXACTEMENT 1920 ?
  console.log('QUELLE OPTION DONNE EXACTEMENT 1920 DE LARGE ?');
  const options = [
    { etiquette: 'scale: 1920/1422', opts: { scale: 1920 / 1422 } },
    { etiquette: 'scale: 1.3503',    opts: { scale: 1.3503 } },
    { etiquette: 'width: 1920',      opts: { width: CIBLE_L } },
    { etiquette: 'width+height',     opts: { width: CIBLE_L, height: CIBLE_H } },
  ];
  const essais = [];
  for (const o of options) {
    const r = await page.evaluate(async (a) => {
      try {
        const s = await window.__snapdom(document.querySelector('#cc-ws-present-slide-inner'), a);
        const url = (await s.toPng()).src;
        return { ok: true, url };
      } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
    }, o.opts);
    let taille = null, nom = null;
    if (r.ok) {
      const buf = Buffer.from(r.url.split(',')[1], 'base64');
      nom = 'geo-' + o.etiquette.replace(/[^a-z0-9]+/gi, '_') + '.png';
      fs.writeFileSync(path.join(RACINE, 'images', nom), buf);
      const im = PNG.sync.read(buf); taille = im.width + 'x' + im.height;
    }
    const exact = taille === CIBLE_L + 'x' + CIBLE_H;
    console.log('  ' + o.etiquette.padEnd(20) + (taille || 'échec : ' + r.erreur).padEnd(12)
      + (exact ? '  ← EXACTEMENT 1920x1080' : (taille && taille.startsWith('1920') ? '  largeur juste' : '')));
    essais.push({ option: o.etiquette, opts: o.opts, taille, exact, image: nom, erreur: r.erreur || null });
  }

  // Ensuite : (a) échelle 1 puis agrandissement, contre (b) échelle native.
  console.log('');
  console.log('NETTETÉ — agrandissement après coup contre capture à l\'échelle native');
  const retenue = essais.filter((e) => e.exact)[0] || essais.filter((e) => e.taille && e.taille.startsWith('1920'))[0];
  const aUrl = await page.evaluate(async (cible) => {
    // (a) capture à l'échelle 1, puis agrandissement bicubique sur canvas.
    const s = await window.__snapdom(document.querySelector('#cc-ws-present-slide-inner'), { scale: 1 });
    const img = await s.toPng();
    await img.decode();
    const c = document.createElement('canvas'); c.width = cible.l; c.height = cible.h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, cible.l, cible.h);
    return c.toDataURL('image/png');
  }, { l: CIBLE_L, h: CIBLE_H });
  fs.writeFileSync(path.join(RACINE, 'images', 'geo-a-echelle1-puis-agrandi.png'), Buffer.from(aUrl.split(',')[1], 'base64'));
  const a = nettete(path.join(RACINE, 'images', 'geo-a-echelle1-puis-agrandi.png'));
  const b = retenue && retenue.image ? nettete(path.join(RACINE, 'images', retenue.image)) : null;
  console.log('  (a) échelle 1 puis agrandi   ' + a.largeur + 'x' + a.hauteur + '   énergie ' + a.energie_par_pixel);
  if (b) console.log('  (b) ' + ('échelle native (' + retenue.option + ')').padEnd(26) + b.largeur + 'x' + b.hauteur + '   énergie ' + b.energie_par_pixel);
  if (b) {
    const gain = +((b.energie_par_pixel / a.energie_par_pixel - 1) * 100).toFixed(1);
    console.log('  → la capture native est ' + (gain >= 0 ? 'PLUS nette de ' + gain + ' %' : 'moins nette de ' + (-gain) + ' %'));
  }
  await nav.close(); serveur.close();
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai2-geometrie.json'), JSON.stringify({
    mise_en_page: '1422x800', rapport_1422x800: +(1422 / 800).toFixed(4), rapport_16_9: +(16 / 9).toFixed(4),
    cible: CIBLE_L + 'x' + CIBLE_H, options: essais,
    nettete: { agrandi_apres_coup: a, echelle_native: b, option_native: retenue ? retenue.option : null },
  }, null, 2), 'utf8');
})();
