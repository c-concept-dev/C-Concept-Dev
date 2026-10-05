// ESSAI 2 — LES CANDIDATS, dans WebKit (le moteur de Safari), comparés aux références.
//
// DOUBLE CAPTURE À CHAQUE ÉTAPE : un bug WebKit connu rend la PREMIÈRE capture vide quand des
// polices ou des images sont intégrées. Les deux sont donc mesurées séparément — si seule la
// seconde est bonne, la recommandation devra dire « capturer deux fois et jeter la première »,
// jamais le taire.
//
// LES BIBLIOTHÈQUES SONT INJECTÉES DEPUIS vendeur/ (même origine), jamais depuis un CDN : un banc
// qui dépend du réseau ne mesure pas ce qu'on croit.
const fs = require('node:fs');
const path = require('node:path');
const pw = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const RACINE = __dirname;
const ENTREES = path.join(RACINE, 'entrees');
const IMAGES = path.join(RACINE, 'images');
const SELECTEUR = '#cc-ws-present-slide-inner';
// 800 ms, et non 320 : adocPresentAnimateNumberIfEligible anime 700 ms en requestAnimationFrame
// tout bloc de texte simple commençant par un chiffre. MESURÉ sur la fixture « nombres » : à
// t+0 ms la capture montre « 1 % », à t+300 ms « 16 % », et la valeur finale « 37 % » n'apparaît
// qu'à t+800 ms. Un repos de 320 ms produisait donc une image plausible portant un CHIFFRE FAUX —
// le pire défaut possible pour une présentation clinique. 700 ms d'animation + une image de marge.
const REPOS_MS = 800;
// Même fenêtre que les références : c'est la seule où l'échelle vaut 1 et où les deux manières de
// capturer (mise en page pour les bibliothèques, rendu pour le moteur) donnent la même géométrie.
const FENETRE = { width: 1596, height: 898 };
// La sortie visée pour le montage : 1920 de large, soit 1920/1422 de rapport de pixels.
const RAPPORT_1920 = +(1920 / 1422).toFixed(4);
const { servir } = require('./outils/serveur.cjs');
const SEUIL_PIXEL = 0.12;   // tolérance par pixel de pixelmatch ; justifiée dans le rapport

function comparer(cheminA, cheminB) {
  if (!fs.existsSync(cheminA) || !fs.existsSync(cheminB)) return { comparable: false, raison: 'image absente' };
  const a = PNG.sync.read(fs.readFileSync(cheminA)), b = PNG.sync.read(fs.readFileSync(cheminB));
  if (a.width !== b.width || a.height !== b.height) {
    return { comparable: false, raison: 'tailles différentes : ' + a.width + 'x' + a.height + ' contre ' + b.width + 'x' + b.height,
             taille_ref: a.width + 'x' + a.height, taille_cand: b.width + 'x' + b.height };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: SEUIL_PIXEL });
  return { comparable: true, pixels_differents: n, total: a.width * a.height,
           part: +(100 * n / (a.width * a.height)).toFixed(3), diff: diff };
}

// Une image « vide » = une seule couleur, ou quasi. C'est le symptôme du bug WebKit.
function estVide(chemin) {
  if (!fs.existsSync(chemin)) return { vide: true, raison: 'fichier absent' };
  const p = PNG.sync.read(fs.readFileSync(chemin));
  const couleurs = new Set();
  for (let i = 0; i < p.data.length && couleurs.size < 12; i += 4 * 97) {
    couleurs.add(p.data[i] + ',' + p.data[i + 1] + ',' + p.data[i + 2]);
  }
  return { vide: couleurs.size <= 2, couleurs_echantillonnees: couleurs.size, octets: fs.statSync(chemin).size };
}

async function lancerCandidat(nomJeu, url, candidat) {
  const nav = await pw.webkit.launch();
  const page = await nav.newPage({ viewport: FENETRE });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(url);
  await page.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));

  // Injection depuis vendeur/, même origine.
  if (candidat === 'snapdom') {
    // Module ES : importé par URL servie, jamais par addScriptTag — un module injecté n'expose
    // rien sur window, et sous file:// l'import échoue purement et simplement (constaté).
    await page.evaluate(async () => {
      const m = await import('/vendeur/snapdom.mjs');
      window.__snapdom = m.snapdom;
    });
  } else {
    await page.addScriptTag({ path: path.join(RACINE, 'vendeur', 'html-to-image.js') });
  }
  const pret = await page.evaluate((c) => c === 'snapdom'
    ? typeof window.__snapdom === 'function'
    : !!(window.htmlToImage && typeof window.htmlToImage.toPng === 'function'), candidat);

  const etapes = [];
  let precedent = null, garde = 0;
  if (pret) {
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(REPOS_MS);
    for (;;) {
      const e = await page.evaluate(() => {
        const s = window._adocPresentState;
        return s ? { index: s.index, revealIndex: s.revealIndex } : null;
      });
      if (!e) break;
      const cle = e.index + ':' + e.revealIndex;
      if (precedent === cle) break;
      precedent = cle;
      const prises = [];
      // DEUX captures de suite : c'est le bug WebKit qu'on mesure, pas qu'on contourne en silence.
      for (const rang of [1, 2]) {
        const t0 = Date.now();
        const r = await page.evaluate(async (args) => {
          const el = document.querySelector(args.sel);
          try {
            if (args.cand === 'snapdom') {
              const png = await window.__snapdom(el, { scale: 1 });
              const url = await png.toPng().then((img) => img.src);
              return { ok: true, url: url };
            }
            const url = await window.htmlToImage.toPng(el, { pixelRatio: 1 });
            return { ok: true, url: url };
          } catch (err) { return { ok: false, erreur: String(err && err.message || err) }; }
        }, { sel: SELECTEUR, cand: candidat });
        const ms = Date.now() - t0;
        let nom = null;
        if (r.ok && r.url && r.url.startsWith('data:image/png;base64,')) {
          nom = nomJeu + '-' + candidat + '-' + String(etapes.length).padStart(2, '0') + '-p' + rang + '.png';
          fs.writeFileSync(path.join(IMAGES, nom), Buffer.from(r.url.split(',')[1], 'base64'));
        }
        prises.push({ rang, ok: !!r.ok, erreur: r.erreur || null, image: nom, duree_ms: ms,
                      etat: nom ? estVide(path.join(IMAGES, nom)) : { vide: true, raison: 'aucune image produite' } });
      }
      // Comparaison : la SECONDE prise contre la référence WebKit de la même étape.
      const ref = path.join(IMAGES, nomJeu + '-webkit-ref-' + String(etapes.length).padStart(2, '0') + '.png');
      const derniere = prises[1].image ? path.join(IMAGES, prises[1].image) : null;
      const cmp = derniere ? comparer(ref, derniere) : { comparable: false, raison: 'aucune image' };
      if (cmp.diff) {
        const nd = nomJeu + '-' + candidat + '-' + String(etapes.length).padStart(2, '0') + '-diff.png';
        fs.writeFileSync(path.join(IMAGES, nd), PNG.sync.write(cmp.diff));
        cmp.image_diff = nd; delete cmp.diff;
      }
      etapes.push({ etape: etapes.length, index: e.index, revealIndex: e.revealIndex, prises, comparaison: cmp });
      if (++garde > 40) break;
      await page.evaluate(() => window.adocPresentNext());
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.waitForTimeout(REPOS_MS);
    }
  }
  await nav.close();
  return { candidat, jeu: nomJeu, pret, etapes, erreurs };
}

(async () => {
  fs.mkdirSync(IMAGES, { recursive: true });
  const { serveur, port } = await servir(RACINE, 0);
  const jeux = fs.readdirSync(ENTREES).filter((f) => f.endsWith('.html'));
  const tout = [];
  console.log('CANDIDATS DANS WEBKIT (moteur de Safari) — seuil pixelmatch ' + SEUIL_PIXEL);
  console.log('');
  console.log('  candidat        jeu              étapes  1re prise vide  2e prise vide  écart médian  durée médiane');
  for (const candidat of ['snapdom', 'html-to-image']) {
    for (const j of jeux) {
      const nomJeu = path.basename(j, '.html');
      const r = await lancerCandidat(nomJeu, 'http://127.0.0.1:' + port + '/entrees/' + j, candidat);
      tout.push(r);
      if (!r.pret) { console.log('  ' + candidat.padEnd(16) + nomJeu.padEnd(17) + 'BIBLIOTHÈQUE NON CHARGÉE'); continue; }
      const v1 = r.etapes.filter((e) => e.prises[0].etat.vide).length;
      const v2 = r.etapes.filter((e) => e.prises[1].etat.vide).length;
      const ecarts = r.etapes.map((e) => e.comparaison.comparable ? e.comparaison.part : null).filter((x) => x !== null).sort((a, b) => a - b);
      const durees = r.etapes.flatMap((e) => e.prises.map((p) => p.duree_ms)).sort((a, b) => a - b);
      console.log('  ' + candidat.padEnd(16) + nomJeu.padEnd(17) + String(r.etapes.length).padEnd(8)
        + (v1 + '/' + r.etapes.length).padEnd(16) + (v2 + '/' + r.etapes.length).padEnd(15)
        + (ecarts.length ? ecarts[Math.floor(ecarts.length / 2)] + ' %' : 'incomparable').padEnd(14)
        + (durees.length ? durees[Math.floor(durees.length / 2)] + ' ms' : '—'));
    }
  }
  serveur.close();
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai2-candidats.json'),
    JSON.stringify({ seuil_pixel: SEUIL_PIXEL, selecteur: SELECTEUR, resultats: tout }, null, 2), 'utf8');
  console.log('\n  relevé dans mesures/essai2-candidats.json');
})();
