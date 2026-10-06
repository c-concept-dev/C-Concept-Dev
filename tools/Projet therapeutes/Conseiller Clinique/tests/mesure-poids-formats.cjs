#!/usr/bin/env node
// POIDS ET TEMPS, PNG CONTRE JPEG 0,92 — et ce que la compression fait au texte.
//
// Christophe relève 1 035 Ko par image en PNG, jusqu'à 1,9 Mo pour celles qui portent une photo.
// La question « qu'est-ce que ça change à l'œil sur le texte » est la sienne ; ce qui se mesure,
// lui, est l'écart pixel à pixel entre les deux formats, et SÉPARÉMENT sur les lignes qui portent
// du texte — parce qu'une moyenne sur toute l'image est diluée par les grandes zones unies.
//
// Les présentations d'essai distinguent les deux cas : « couverture » porte une photo raster,
// « dense » n'a que du texte.
//
//   NODE_PATH=<playwright> node tests/mesure-poids-formats.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
// sharp et non pngjs : il faut décoder un JPEG aussi bien qu'un PNG, et un décodeur PNG rend
// « unrecognised content at end of stream » sur un JPEG — mesuré en le tentant.
const sharp = require('sharp');
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');

const RACINE = path.join(__dirname, '..');
const BANC = path.join(RACINE, 'banc-chutier');
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
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
async function decoder(b64) {
  const { data, info } = await sharp(Buffer.from(b64, 'base64')).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// L'écart entre deux images, globalement ET sur les seules lignes qui portent du texte. Une ligne
// « porte du texte » si elle contient au moins 20 pixels sombres : c'est la même définition que
// le profil d'encre du lot 0, au seuil près.
function ecart(a, b) {
  if (a.width !== b.width || a.height !== b.height) return null;
  const L = a.width, H = a.height;
  let maxG = 0, sommeG = 0, nG = 0, maxT = 0, sommeT = 0, nT = 0, lignesTexte = 0;
  for (let y = 0; y < H; y++) {
    let encre = 0;
    for (let x = 0; x < L; x++) if (lum(a.data, (y * L + x) * 4) < 170) encre++;
    const estTexte = encre >= 20;
    if (estTexte) lignesTexte++;
    for (let x = 0; x < L; x++) {
      const i = (y * L + x) * 4;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]),
                         Math.abs(a.data[i + 2] - b.data[i + 2]));
      if (d > 0) { nG++; sommeG += d; if (d > maxG) maxG = d; }
      if (estTexte && d > 0) { nT++; sommeT += d; if (d > maxT) maxT = d; }
    }
  }
  return {
    global: { pixels: nG, part: +((100 * nG) / (L * H)).toFixed(1), max: maxG, moyen: nG ? +(sommeG / nG).toFixed(1) : 0 },
    texte: { lignes: lignesTexte, pixels: nT, max: maxT, moyen: nT ? +(sommeT / nT).toFixed(1) : 0 },
  };
}

(async () => {
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    await page.evaluate((i) => { window.ADOC_EXPORT_IMAGES = i; }, IMAGES_EMBARQUEES);

    console.log('POIDS ET TEMPS EN MODE VIDÉO — mêmes étapes, deux formats.');
    console.log('« couverture » porte une photo raster ; « dense » et « questionnaire » n\'ont que du texte.');
    console.log('');
    console.log('PRÉSENTATION'.padEnd(16) + 'FORMAT'.padEnd(14) + 'POIDS TOTAL'.padEnd(14)
      + 'PAR IMAGE'.padEnd(12) + 'TEMPS'.padEnd(12) + 'PAR IMAGE');
    const releve = [];
    for (const p of PRESENTATIONS) {
      const r = await page.evaluate(async (d) => {
        const sorties = {};
        for (const f of [{ cle: 'png', type: 'image/png', q: undefined },
                         { cle: 'jpeg', type: 'image/jpeg', q: 0.92 }]) {
          const t0 = performance.now();
          const res = await window.AtelierImages.rendreImages(d, { type: f.type, qualite: f.q });
          const duree = Math.round(performance.now() - t0);
          const images = [];
          for (const im of res.images) {
            images.push({ stepId: im.stepId, octets: im.octets, largeur: im.largeur, hauteur: im.hauteur,
              b64: await new Promise((ok) => {
                const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]);
                fr.readAsDataURL(im.blob);
              }) });
          }
          sorties[f.cle] = { duree, total: res.octets_total, images };
        }
        return sorties;
      }, p.doc);
      for (const cle of ['png', 'jpeg']) {
        const x = r[cle], n = x.images.length;
        console.log(p.cle.padEnd(16) + (cle === 'png' ? 'PNG' : 'JPEG 0,92').padEnd(14)
          + ((x.total / 1048576).toFixed(2) + ' Mo').padEnd(14)
          + (Math.round(x.total / n / 1024) + ' Ko').padEnd(12)
          + (x.duree + ' ms').padEnd(12) + Math.round(x.duree / n) + ' ms');
      }
      releve.push({ cle: p.cle, nom: p.nom, r });
    }

    console.log('');
    console.log('CE QUE LA COMPRESSION CHANGE — écart pixel à pixel entre le PNG et le JPEG 0,92 :');
    console.log('ÉTAPE'.padEnd(26) + 'GLOBAL (part, max, moyen)'.padEnd(30) + 'SUR LES LIGNES DE TEXTE');
    for (const e of releve) {
      for (let k = 0; k < e.r.png.images.length; k++) {
        const a = await decoder(e.r.png.images[k].b64);
        const b = await decoder(e.r.jpeg.images[k].b64);
        const d = ecart(a, b);
        if (!d) { console.log('  tailles différentes'); continue; }
        console.log(('  ' + e.cle + '/' + e.r.png.images[k].stepId).padEnd(26)
          + (d.global.part + ' %, max ' + d.global.max + ', moy ' + d.global.moyen).padEnd(30)
          + (d.texte.lignes + ' lignes, max ' + d.texte.max + ', moy ' + d.texte.moyen));
      }
    }

    // ── La politique de débordement, évaluée au rapport que Christophe a relevé ───────────────
    console.log('');
    console.log('VERDICT DE L\'INDICATEUR pour un rapport donné, sans durée connue :');
    const verdicts = await page.evaluate(() => {
      const A = window.AtelierImages, out = {};
      [1.04, 1.5, 1.8, 1.95, 2.0, 2.5].forEach((r) => {
        out[r] = A.verdictDebordement(Math.round(540 * r), 540).verdict;
      });
      return out;
    });
    Object.keys(verdicts).forEach((r) => console.log('  rapport ' + r + '  →  ' + verdicts[r]));

    fs.writeFileSync(path.join(BANC, 'poids-formats.json'),
      JSON.stringify(releve.map((e) => ({ cle: e.cle,
        png: { total: e.r.png.total, duree: e.r.png.duree, images: e.r.png.images.map((i) => ({ stepId: i.stepId, octets: i.octets })) },
        jpeg: { total: e.r.jpeg.total, duree: e.r.jpeg.duree, images: e.r.jpeg.images.map((i) => ({ stepId: i.stepId, octets: i.octets })) },
      })), null, 1), 'utf8');
    console.log('');
    console.log('relevé : ' + path.join(BANC, 'poids-formats.json'));
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('ÉCHEC', e.message); process.exit(1); });
