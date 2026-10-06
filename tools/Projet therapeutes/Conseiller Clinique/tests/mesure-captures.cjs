#!/usr/bin/env node
// CE QUE LES IMAGES MONTRENT VRAIMENT — mesure, pas impression.
//
// Christophe a ouvert le banc et sorti les JPEG. Trois choses sautent aux yeux sur ses captures :
// le texte paraît petit dans un cadre de 1920×1080, une grande partie du cadre est vide, et un
// bouton de loupe apparaît sur la couverture. « Paraît » ne décide de rien. Cet outil mesure.
//
// Il observe la scène VIVANTE juste avant la rastérisation, par le crochet `inspecter` du moteur :
// c'est exactement ce que SnapDOM va capturer, et non une seconde scène montée à côté.
//
//   NODE_PATH=<playwright> node tests/mesure-captures.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');

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

const INSPECTEUR = function (inner, etape) {
  const ECHELLE = 1920 / 1422;
  const carte = inner.querySelector('.adoc-sc-card');
  const rc = carte ? carte.getBoundingClientRect() : null;
  const sc = carte ? getComputedStyle(carte) : null;

  // Les blocs réellement visibles — ceux que la capture montre.
  const visibles = Array.from(inner.querySelectorAll('.adoc-sc-card > .adoc-sc-block'))
    .filter((el) => getComputedStyle(el).visibility !== 'hidden');

  // Encre : l'union des rectangles de tout élément de texte non vide réellement visible.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const origine = inner.getBoundingClientRect();
  const marque = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    x0 = Math.min(x0, r.left - origine.left); y0 = Math.min(y0, r.top - origine.top);
    x1 = Math.max(x1, r.right - origine.left); y1 = Math.max(y1, r.bottom - origine.top);
  };
  visibles.forEach((bloc) => {
    if (getComputedStyle(bloc).visibility === 'hidden') return;
    marque(bloc);
    bloc.querySelectorAll('img').forEach(marque);
  });

  // Taille de police du corps de texte, en pixels de SCÈNE puis de SORTIE.
  const tailles = [];
  visibles.forEach((bloc) => {
    const cible = bloc.matches('p, .adoc-sc-block-text') ? bloc : bloc.querySelector('p, .adoc-sc-block-text');
    const el = cible || bloc;
    const t = parseFloat(getComputedStyle(el).fontSize);
    if (t) tailles.push({ balise: el.tagName.toLowerCase(), scene: +t.toFixed(1), sortie: +(t * ECHELLE).toFixed(1) });
  });

  // Éléments interactifs embarqués dans l'image : ils n'ont aucun sens dans une vidéo.
  const interactifs = Array.from(inner.querySelectorAll('button, [role="button"], a[href], [onclick]'))
    .filter((el) => {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .map((el) => ({
      balise: el.tagName.toLowerCase(),
      classe: (el.className || '').toString().split(' ')[0] || null,
      texte: (el.textContent || '').trim().slice(0, 28) || null,
      aria: el.getAttribute('aria-label'),
    }));

  return {
    carte: rc ? { l: Math.round(rc.width), h: Math.round(rc.height),
                  bordure: sc.borderTopWidth, rayon: sc.borderTopLeftRadius, fond: sc.backgroundColor } : null,
    encre: isFinite(x0) ? {
      x: Math.round(x0), y: Math.round(y0), l: Math.round(x1 - x0), h: Math.round(y1 - y0),
      part_hauteur: +(((y1 - y0) / 800) * 100).toFixed(1),
      part_surface: +((((x1 - x0) * (y1 - y0)) / (1422 * 800)) * 100).toFixed(1),
    } : null,
    tailles: tailles,
    interactifs: interactifs,
  };
};

(async () => {
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    await page.evaluate((imgs) => { window.ADOC_EXPORT_IMAGES = imgs; }, IMAGES_EMBARQUEES);
    await page.exposeFunction('__rien', () => {});

    console.log('CE QUE MONTRENT LES CAPTURES — mesuré sur la scène vivante, juste avant SnapDOM.');
    console.log('Échelle scène → sortie : 1920/1422 = 1,3502. Scène 1422×800.');
    console.log('');

    const tousInteractifs = [];
    for (const p of PRESENTATIONS) {
      const r = await page.evaluate(async ({ d, src }) => {
        const inspecter = eval('(' + src + ')');
        const res = await window.AtelierImages.rendreImages(d, { inspecter });
        return res.images.map((im) => ({ stepId: im.stepId, titre: im.titre, rang: im.rang,
          surRang: im.surRang, hauteur: im.hauteur, debordement: im.debordement, i: im.inspection }));
      }, { d: p.doc, src: INSPECTEUR.toString() });

      console.log('── ' + p.nom + ' ' + '─'.repeat(Math.max(0, 62 - p.nom.length)));
      for (const im of r) {
        const i = im.i;
        const t = i.tailles.length
          ? i.tailles.map((x) => x.balise + ' ' + x.scene + '→' + x.sortie + 'px').join(', ')
          : '—';
        console.log('  ' + (im.titre + ', étape ' + im.rang + '/' + im.surRang).padEnd(42)
          + 'image ' + 1920 + 'x' + im.hauteur);
        console.log('      encre : ' + (i.encre
          ? i.encre.l + 'x' + i.encre.h + ' à (' + i.encre.x + ',' + i.encre.y + ')  —  '
            + i.encre.part_hauteur + ' % de la hauteur, ' + i.encre.part_surface + ' % de la surface'
          : 'aucune'));
        console.log('      texte : ' + t);
        if (i.carte) console.log('      carte : ' + i.carte.l + 'x' + i.carte.h
          + ', bordure ' + i.carte.bordure + ', rayon ' + i.carte.rayon + ', fond ' + i.carte.fond);
        if (i.interactifs.length) {
          console.log('      INTERACTIFS DANS L\'IMAGE : ' + i.interactifs.length);
          i.interactifs.slice(0, 6).forEach((x) => console.log('        <' + x.balise + '> '
            + (x.classe ? '.' + x.classe + ' ' : '') + (x.aria ? '[' + x.aria + '] ' : '')
            + (x.texte ? '« ' + x.texte + ' »' : '')));
          if (i.interactifs.length > 6) console.log('        … et ' + (i.interactifs.length - 6) + ' autres');
          tousInteractifs.push({ presentation: p.nom, stepId: im.stepId, n: i.interactifs.length });
        }
      }
      console.log('');
    }

    console.log('RÉCAPITULATIF DES ÉLÉMENTS INTERACTIFS CAPTURÉS');
    if (!tousInteractifs.length) console.log('  aucun');
    else tousInteractifs.forEach((x) => console.log('  ' + x.presentation + ' / ' + x.stepId + ' : ' + x.n));
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('ÉCHEC', e.message); process.exit(1); });
