#!/usr/bin/env node
// COMPLÉMENT 3, POINT 2 — DEUX CANDIDATS DE RASTÉRISATION, À TAILLE ÉGALE
//
// Acquis : SnapDOM lit la MISE EN PAGE (1422x800), jamais le rendu, et son `scale` agrandit une
// rastérisation faite à 1x. Quatre chemins mesurés jusqu'ici donnent tous gradient 92,5, contre
// 162,5 pour le moteur rendant à 1920 — l'équivalent du moteur flouté d'environ 1 px.
//
// Deux candidats restent à éprouver, et c'est l'objet de ce banc :
//   (a) SnapDOM toSvg(), puis rastérisation par drawImage sur un canvas 1920x1080 — le navigateur
//       rastérise alors le SVG DIRECTEMENT à la taille cible, au lieu d'étirer un bitmap 1x ;
//   (b) html-to-image avec pixelRatio = 1920/1422.
//
// Les deux tournent dans la page forgée par forger-page-nettete.cjs, celle-là même que Christophe
// ouvre dans son Safari : les chiffres automatisés et les siens sont donc directement comparables.
//
// DEUX PARITÉS SONT EXIGÉES avant toute conclusion :
//   1. la métrique embarquée dans la page doit redonner, sur le même PNG, celle de contours.cjs ;
//   2. (c) le moteur à 1920 doit redonner ses chiffres publiés (0,208 % / 162,5 / 232).
// Sans elles, un écart entre candidats pourrait n'être qu'un écart d'implémentation.

const fs = require('node:fs'), path = require('node:path');
const pw = require('playwright');
const { PNG } = require('pngjs');
const { servir } = require('./serveur.cjs');
const { contoursPixels, flouBoite } = require('./contours.cjs');

const RACINE = path.join(__dirname, '..');
const IMG = (n) => path.join(RACINE, 'images', n);
const CIBLE = { l: 1920, h: 1080 };
const REF_MOTEUR = { densite: 0.208, moyen: 162.5, pic: 232 };
const PAGE = '/entrees/nombres-nettete.html';

function mesurerPng(fichier) {
  const p = PNG.sync.read(fs.readFileSync(fichier));
  return Object.assign(contoursPixels(p.data, p.width, p.height),
                       { octets: fs.statSync(fichier).size });
}
function mesurerPngFloute(fichier, rayon) {
  const p = PNG.sync.read(fs.readFileSync(fichier));
  return contoursPixels(flouBoite(p.data, p.width, p.height, rayon), p.width, p.height);
}
function ecrirePng(fichier, dataUrl) {
  fs.writeFileSync(fichier, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
}
async function ouvrir(nav, fenetre) {
  const page = await nav.newPage({ viewport: fenetre });
  await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
  return page;
}

(async () => {
  if (!fs.existsSync(path.join(RACINE, 'entrees', 'nombres-nettete.html'))) {
    console.error('Page absente — lancer d\'abord outils/forger-page-nettete.cjs'); process.exit(1);
  }
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const base = 'http://127.0.0.1:' + port;
  let rouges = 0;

  // ── (c) la référence : le MOTEUR rendant à 1920x1080 (fenêtre 2094x1178, mesurée au lot 0) ──
  let p = await ouvrir(nav, { width: 2094, height: 1178 });
  await p.goto(base + PAGE);
  await p.evaluate(() => window.__netteteApi.preparer());
  const boite = await p.evaluate(() => {
    const r = document.getElementById('cc-ws-present-slide-inner').getBoundingClientRect();
    return Math.round(r.width) + 'x' + Math.round(r.height);
  });
  await (await p.$('#cc-ws-present-slide-inner')).screenshot({ path: IMG('n3-c-moteur-1920.png') });
  await p.close();

  // ── (a) et (b) dans la page forgée, fenêtre 1596x898 (échelle 1 : rendu = mise en page) ──
  p = await ouvrir(nav, { width: 1596, height: 898 });
  await p.goto(base + PAGE);
  const prep = await p.evaluate(() => window.__netteteApi.preparer());
  const a = await p.evaluate(() => window.__netteteApi.candidatA());
  const b = await p.evaluate(() => window.__netteteApi.candidatB());
  const ua = await p.evaluate(() => navigator.userAgent);
  await p.close();
  await nav.close(); serveur.close();

  console.log('DEUX CANDIDATS DE RASTÉRISATION — WebKit piloté (Playwright)');
  console.log('  ' + ua);
  console.log('  diapositive préparée : ' + (prep.pret ? 'mise en page ' + prep.mise_en_page : 'ÉCHEC'));
  console.log('  boîte rendue par le moteur à la fenêtre 2094x1178 : ' + boite);
  console.log('');

  // ── parité 2 : le moteur redonne-t-il ses chiffres publiés ? ──
  const moteur = mesurerPng(IMG('n3-c-moteur-1920.png'));
  const pariteMoteur = Math.abs(moteur.moyen - REF_MOTEUR.moyen) < 1
    && Math.abs(moteur.densite - REF_MOTEUR.densite) < 0.01 && moteur.pic === REF_MOTEUR.pic;
  console.log('  parité de la référence : moteur à 1920 → densité ' + moteur.densite + ' %, gradient '
    + moteur.moyen + ', pic ' + moteur.pic + '  (publiés ' + REF_MOTEUR.densite + ' / '
    + REF_MOTEUR.moyen + ' / ' + REF_MOTEUR.pic + ') → ' + (pariteMoteur ? 'OK' : 'ROUGE'));
  if (!pariteMoteur) rouges++;

  const lignes = [];
  const ajoute = (etiquette, m, extra) => lignes.push({ etiquette, m, extra: extra || '' });
  ajoute('(c) le MOTEUR rendant à 1920', moteur);
  ajoute('(c) + flou de boîte 1 px', mesurerPngFloute(IMG('n3-c-moteur-1920.png'), 1));

  // ── parité 1 : la métrique de la page contre celle de Node, sur le même PNG ──
  const parites = [];
  for (const [cle, r, nom] of [['a', a, '(a) SnapDOM toSvg → drawImage 1920'],
                               ['b', b, '(b) html-to-image pixelRatio 1,3502']]) {
    if (r.refus) {
      console.log('  ' + nom + ' : ' + r.refus);
      console.log('    → REFUS DE SAFARI/WebKit sur foreignObject vers canvas, à signaler tel quel.');
      rouges++; continue;
    }
    if (r.erreur) { console.log('  ' + nom + ' : ' + r.erreur); rouges++; continue; }
    const f = IMG('n3-' + cle + '-candidat.png');
    ecrirePng(f, r.png);
    const node = mesurerPng(f);
    const parite = Math.abs(node.moyen - r.moyen) < 0.5 && node.pic === r.pic;
    parites.push({ cle, page: { densite: r.densite, moyen: r.moyen, pic: r.pic }, node, parite });
    if (!parite) rouges++;
    ajoute(nom, node, r.ms + ' ms'
      + (r.svg_naturel ? ', SVG ' + r.svg_naturel : '')
      + (r.rendu ? ', rendu ' + r.rendu + (r.redimensionne ? ' puis redimensionné' : '') : ''));
  }
  for (const x of parites) {
    console.log('  parité de la métrique (' + x.cle + ') : page ' + x.page.moyen + '/' + x.page.pic
      + ' contre Node ' + x.node.moyen + '/' + x.node.pic + ' → ' + (x.parite ? 'OK' : 'ROUGE'));
  }

  console.log('');
  console.log('  chemin                                          taille      densité   gradient  pic   détail');
  for (const l of lignes) {
    console.log('  ' + l.etiquette.padEnd(46).slice(0, 46) + '  ' + String(l.m.taille).padEnd(11)
      + ' ' + String(l.m.densite + ' %').padEnd(9) + ' ' + String(l.m.moyen).padEnd(9)
      + ' ' + String(l.m.pic).padEnd(5) + ' ' + l.extra);
  }

  // ── conclusion : un candidat ne vaut que s'il remonte vers le moteur ──
  console.log('');
  const flou1 = lignes[1].m.moyen;
  for (const l of lignes.slice(2)) {
    const versMoteur = +(100 * (l.m.moyen - flou1) / (moteur.moyen - flou1)).toFixed(0);
    console.log('  ' + l.etiquette + ' : gradient ' + l.m.moyen
      + ' — ' + (l.m.taille === CIBLE.l + 'x' + CIBLE.h ? 'à taille égale' : 'TAILLE DIFFÉRENTE, non comparable')
      + ', soit ' + versMoteur + ' % du chemin entre le moteur flouté d\'1 px (' + flou1
      + ') et le moteur net (' + moteur.moyen + ')');
  }

  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai2-candidats-nettete.json'),
    JSON.stringify({ navigateur: ua, boite_moteur: boite, reference_publiee: REF_MOTEUR,
                     parite_reference: pariteMoteur, parites_metrique: parites,
                     lignes: lignes.map((l) => ({ chemin: l.etiquette, mesure: l.m, detail: l.extra })),
                     brut: { a, b: Object.assign({}, b, { png: undefined }) } }, null, 2), 'utf8');
  console.log('');
  console.log('  ' + (rouges ? rouges + ' ROUGE(S)' : 'verts : ' + (2 + parites.length) + '   rouges : 0'));
  process.exit(rouges ? 1 : 0);
})();
