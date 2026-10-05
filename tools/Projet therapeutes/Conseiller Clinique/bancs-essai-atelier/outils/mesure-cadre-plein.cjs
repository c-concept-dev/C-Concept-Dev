// POINT 3, suite — LA DIAPOSITIVE OCCUPANT TOUT LE CADRE 1920x1080, rendue par le MOTEUR.
//
// Pourquoi cette mesure : les deux chemins SnapDOM (échelle 1 puis agrandissement, ou échelle
// native) donnent des contours IDENTIQUES — densité 0,208 %, gradient moyen 92,5 pour les deux.
// SnapDOM rastérise donc à 1x puis agrandit, quelle que soit l'option. La référence du moteur à
// 1422x800, elle, a un gradient moyen de 185 : deux fois plus franc par contour. Reste à savoir ce
// que donne le MOTEUR quand c'est LUI qui rend à 1920 — c'est la seule façon d'obtenir des contours
// nets à cette taille, si la netteté compte.
const fs = require('node:fs'), path = require('node:path'), pw = require('playwright');
const { PNG } = require('pngjs');
const { servir } = require('./serveur.cjs');
const RACINE = path.join(__dirname, '..');
const SEUIL = 60;

function contours(fichier) {
  const p = PNG.sync.read(fs.readFileSync(fichier));
  const y0 = Math.round(p.height * 0.25), y1 = Math.round(p.height * 0.75);
  let francs = 0, total = 0, somme = 0, pic = 0;
  for (let y = y0; y < y1; y++) for (let x = 1; x < p.width; x++) {
    const i = (y * p.width + x) * 4, j = i - 4;
    const g = Math.abs(p.data[i] - p.data[j]) + Math.abs(p.data[i+1] - p.data[j+1]) + Math.abs(p.data[i+2] - p.data[j+2]);
    total++;
    if (g > SEUIL) { francs++; somme += g; if (g > pic) pic = g; }
  }
  return { taille: p.width + 'x' + p.height, densite_contours: +(100 * francs / total).toFixed(3),
           gradient_moyen: +(somme / (francs || 1)).toFixed(1), gradient_pic: pic,
           octets: fs.statSync(fichier).size };
}

(async () => {
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const essais = [];
  console.log('QUELLE FENÊTRE FAIT RENDRE LA DIAPOSITIVE À 1920x1080 PAR LE MOTEUR ?');
  let retenu = null;
  for (const [w, h] of [[1920, 1080], [2094, 1178], [2100, 1182], [2160, 1215]]) {
    const page = await nav.newPage({ viewport: { width: w, height: h } });
    await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto('http://127.0.0.1:' + port + '/entrees/nombres.html');
    await page.evaluate(() => { const b = document.querySelector('#cc-ws-present-start button'); if (b) b.click(); });
    try { await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')
            && document.getElementById('cc-ws-present-overlay').classList.contains('open'), null, { timeout: 15000 }); }
    catch (e) { console.log('  ' + (w + 'x' + h).padEnd(13) + 'ouverture impossible'); await page.close(); continue; }
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(800);   // l'animation de nombre dure 700 ms
    const m = await page.evaluate(() => {
      const r = document.getElementById('cc-ws-present-slide-inner').getBoundingClientRect();
      return { l: Math.round(r.width), h: Math.round(r.height) };
    });
    const plein = m.l === 1920 && m.h === 1080;
    console.log('  ' + (w + 'x' + h).padEnd(13) + (m.l + 'x' + m.h) + (plein ? '   ← CADRE PLEIN' : ''));
    essais.push({ fenetre: w + 'x' + h, rendu: m.l + 'x' + m.h, cadre_plein: plein });
    if (plein && !retenu) {
      const el = await page.$('#cc-ws-present-slide-inner');
      const f = path.join(RACINE, 'images', 'geo-c-moteur-1920.png');
      await el.screenshot({ path: f });
      retenu = { fenetre: w + 'x' + h, fichier: f };
      // L'EXPÉRIENCE DÉCISIVE : si le DOM rend DÉJÀ à 1920, SnapDOM à l'échelle 1 n'a plus rien à
      // agrandir — il rastérise une mise en page de 1920 de large. C'est le seul chemin qui soit à
      // la fois net ET disponible dans le Safari réel, où page.screenshot n'existe pas.
      await page.evaluate(async () => { window.__snapdom = (await import('/vendeur/snapdom.mjs')).snapdom; });
      const url = await page.evaluate(async () => {
        const s = await window.__snapdom(document.querySelector('#cc-ws-present-slide-inner'), { scale: 1 });
        return (await s.toPng()).src;
      });
      fs.writeFileSync(path.join(RACINE, 'images', 'geo-d-snapdom-dom1920.png'),
        Buffer.from(url.split(',')[1], 'base64'));
    }
    await page.close();
  }
  await nav.close(); serveur.close();

  console.log('');
  console.log('NETTETÉ DES CONTOURS (seuil ' + SEUIL + ', bande centrale)');
  const lignes = [];
  const ajoute = (etiquette, fichier) => {
    if (!fs.existsSync(fichier)) return;
    const c = contours(fichier);
    lignes.push({ etiquette, ...c });
    console.log('  ' + etiquette.padEnd(34) + c.taille.padEnd(11)
      + 'densité ' + String(c.densite_contours + ' %').padEnd(9)
      + 'gradient moyen ' + String(c.gradient_moyen).padEnd(7) + 'pic ' + String(c.gradient_pic).padEnd(5)
      + (c.octets / 1024).toFixed(0) + ' Ko');
  };
  const I = (n) => path.join(RACINE, 'images', n);
  ajoute('(réf. moteur à 1422x800)', I('nombres-webkit-ref-00.png'));
  ajoute('(a) SnapDOM 1x puis agrandi', I('geo-a-echelle1-puis-agrandi.png'));
  ajoute('(b) SnapDOM échelle native', I('geo-scale_1920_1422.png'));
  ajoute('(c) MOTEUR à 1920x1080', I('geo-c-moteur-1920.png'));
  ajoute('(d) SnapDOM, DOM déjà à 1920', I('geo-d-snapdom-dom1920.png'));
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai2-cadre-plein.json'),
    JSON.stringify({ seuil_contour: SEUIL, fenetres: essais, retenu, nettete: lignes }, null, 2), 'utf8');
})();
