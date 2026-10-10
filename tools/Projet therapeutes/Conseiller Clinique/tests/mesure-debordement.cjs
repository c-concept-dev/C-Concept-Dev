#!/usr/bin/env node
// POLITIQUE DE DÉBORDEMENT — combien d'étapes débordent en mode vidéo, et de combien.
//
// Le mode vidéo (scène 960×540, échelle ×1,4) grossit le texte dans des boîtes qui ne
// grandissent pas : il fait donc déborder davantage d'étapes que le mode fidèle. Cet outil
// mesure l'ampleur réelle, étape par étape, parce qu'un seuil posé sans mesure n'est qu'un avis.
//
// LE SEUIL EST UN RAPPORT, pas un nombre de pixels : ce qui décide si une diapositive peut
// défiler pendant son commentaire, c'est la distance à parcourir rapportée à ce qu'on voit.
// Deux fois la hauteur du cadre se défile ; quatre fois ne se lit pas.
//
// UNE VRAIE PRÉSENTATION : déposez son JSON dans banc-chutier/entrees/ (ignoré par git).
//
//   NODE_PATH=<playwright> node tests/mesure-debordement.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');

const RACINE = path.join(__dirname, '..');
const ENTREES = path.join(RACINE, 'banc-chutier', 'entrees');
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
function reelles() {
  if (!fs.existsSync(ENTREES)) return [];
  return fs.readdirSync(ENTREES).filter((f) => f.endsWith('.json')).map((f) => {
    const brut = JSON.parse(fs.readFileSync(path.join(ENTREES, f), 'utf8'));
    const doc = brut.clinicalDocument || brut;
    if (!doc || doc.documentKind !== 'presentation') return null;
    return { cle: 'reelle', nom: 'RÉELLE — ' + (doc.title || f), doc, reelle: true };
  }).filter(Boolean);
}

(async () => {
  const vraies = reelles();
  const jeux = PRESENTATIONS.concat(vraies);
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    await page.evaluate((i) => { window.ADOC_EXPORT_IMAGES = i; }, IMAGES_EMBARQUEES);

    console.log('DÉBORDEMENT EN MODE VIDÉO (scène 960×540, échelle ×1,4) — et en mode fidèle pour comparer.');
    console.log(vraies.length ? 'Présentation réelle : ' + vraies[0].nom
      : 'AUCUNE présentation réelle dans banc-chutier/entrees/ — mesure sur les trois présentations');
    console.log(vraies.length ? '' : 'd\'essai SEULEMENT. Elles sont courtes : leurs débordements ne disent rien des vôtres.');
    console.log('');

    const lignes = [];
    for (const mode of ['video', 'fidele']) {
      for (const p of jeux) {
        const r = await page.evaluate(async ({ d, mode }) => {
          const t0 = performance.now();
          const res = await window.AtelierImages.rendreImages(d, { mode });
          return { duree: Math.round(performance.now() - t0), scene: res.scene, recap: res.debordements,
                   seuil: res.seuil_scission, octets: res.octets_total,
                   images: res.images.map((im) => ({ stepId: im.stepId, titre: im.titre, rang: im.rang,
                     surRang: im.surRang, hauteur: im.hauteur, hauteurScene: im.hauteurScene,
                     px: im.debordement_px, pxSortie: im.debordement_px_sortie,
                     rapport: im.debordement_rapport, verdict: im.debordement_verdict })) };
        }, { d: p.doc, mode });
        lignes.push({ mode, p, r });
      }
    }

    for (const mode of ['video', 'fidele']) {
      const dedans = lignes.filter((l) => l.mode === mode);
      const toutes = dedans.flatMap((l) => l.r.images);
      const debordantes = toutes.filter((im) => im.verdict !== 'aucun');
      const sc = dedans[0].r.scene;
      console.log('── mode ' + (mode === 'video' ? 'VIDÉO' : 'FIDÈLE') + ' — scène ' + sc.largeur + '×' + sc.hauteur
        + ', seuil de scission ' + dedans[0].r.seuil + ' '.repeat(2) + '─'.repeat(10));
      console.log('   ' + debordantes.length + ' étapes débordent sur ' + toutes.length
        + '  —  défilement ' + toutes.filter((im) => im.verdict === 'defilement').length
        + ', scission ' + toutes.filter((im) => im.verdict === 'scission').length);
      debordantes.sort((a, b) => b.rapport - a.rapport).forEach((im) => {
        console.log('     ' + (im.titre + ' ' + im.rang + '/' + im.surRang).padEnd(36)
          + 'déborde de ' + String(im.px).padStart(4) + ' px de scène ('
          + im.pxSortie + ' px à l\'image)   rapport ' + im.rapport.toFixed(2)
          + '   → ' + im.verdict);
      });
      if (!debordantes.length) console.log('     aucune');
      console.log('');
    }

    // De quoi proposer un seuil : la distribution des rapports observés.
    const rapportsVideo = lignes.filter((l) => l.mode === 'video').flatMap((l) => l.r.images)
      .map((im) => im.rapport).filter((x) => x > 1).sort((a, b) => a - b);
    console.log('Rapports de débordement observés en mode vidéo, du plus faible au plus fort :');
    console.log('  ' + (rapportsVideo.length ? rapportsVideo.map((x) => x.toFixed(2)).join('  ') : 'aucun'));
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('ÉCHEC', e.message); process.exit(1); });
