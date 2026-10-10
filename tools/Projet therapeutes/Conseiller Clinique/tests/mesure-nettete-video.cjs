#!/usr/bin/env node
// NETTETÉ DU MODE VIDÉO — par la voie du lot 0 : comparaison À TAILLE ÉGALE avec un rendu natif.
//
// LE PIÈGE QUE CETTE MÉTHODE ÉVITE, et dans lequel je suis d'abord tombé. Le lot 0 a établi qu'un
// gradient sur contours n'est PAS comparable entre deux images dont le contenu n'est pas à la
// même échelle : le zoom CSS et un SVG à viewBox donnaient des gradients plus élevés que le
// moteur, et c'étaient deux faux gains. J'ai refait la faute au premier jet, en comparant le mode
// vidéo (scène 960, typo ×1,4) à une scène de 1920 avec typo ×2,8 : 1,4 × 2 = 2,8 donne bien la
// même taille de texte, mais les marges et les bordures sont en PIXELS et ne suivent pas, donc la
// colonne de texte passe de 1848 à 1884 px de sortie et les retours à la ligne changent. La
// corrélation des profils d'encre est tombée à 0,17–0,42, et le garde-fou a refusé la mesure.
// C'est exactement ce pour quoi il existe.
//
// DEUX COMPARAISONS, chacune à mise en page ET taille identiques. Elles ne se comparent pas entre
// elles — chacune répond à une question distincte.
//
//   A. CE QUE COÛTE SNAPDOM, SANS AGRANDISSEMENT. Une scène de 1920×1080, rastérisée par le
//      NAVIGATEUR puis par SnapDOM à l'échelle 1. Même scène, même instant, même mise en page.
//
//   B. CE QUE COÛTE L'AGRANDISSEMENT ×2 DU MODE VIDÉO. La scène du mode vidéo (960×540, typo
//      ×1,4), rastérisée par le NAVIGATEUR sous transform:scale(2) — le navigateur redessine
//      alors le texte à sa taille doublée, c'est l'idéal inatteignable — puis par SnapDOM à
//      l'échelle 2, qui est le chemin du produit. Même mise en page exactement, même taille de
//      sortie.
//
// La corrélation des profils d'encre est reportée pour chaque paire : en dessous de 0,5, la
// mesure est refusée au lieu d'être publiée.
//
//   NODE_PATH=<playwright> node tests/mesure-nettete-video.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PNG } = require('pngjs');
// pixelmatch 7 exporte un OBJET, pas une fonction, là où la 5 exportait la fonction. Le lot 0
// s'était arrêté sur « pixelmatch is not a function » pour cette raison exacte ; on accepte les
// deux formes plutôt que d'épingler une version.
const _pm = require('pixelmatch');
const pixelmatch = typeof _pm === 'function' ? _pm : _pm.default;
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');

const RACINE = path.join(__dirname, '..');
const BANC = path.join(RACINE, 'banc-chutier');
const DOSSIER = path.join(BANC, 'nettete');
const SEUIL_CONTOUR = 40;        // identique au lot 0
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

// Gradient horizontal sur la MOITIÉ MÉDIANE des lignes, seuil 40 — la métrique du lot 0, reprise
// telle quelle pour que les chiffres restent comparables aux siens.
function contours(png) {
  const { width: L, height: H, data: d } = png;
  const y0 = Math.floor(H * 0.25), y1 = Math.floor(H * 0.75);
  let n = 0, somme = 0, pic = 0, total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 1; x < L; x++) {
      const i = (y * L + x) * 4;
      const g = Math.abs(lum(d, i) - lum(d, i - 4));
      total++;
      if (g > SEUIL_CONTOUR) { n++; somme += g; if (g > pic) pic = g; }
    }
  }
  return { densite: +((100 * n) / total).toFixed(3), moyenne: +(somme / Math.max(1, n)).toFixed(1), pic: Math.round(pic) };
}

// Profil d'encre par ligne, puis corrélation de Pearson : le garde-fou du lot 0 contre la
// comparaison de deux mises en page différentes. En dessous de 0,5, les images ne montrent pas
// la même chose et leurs gradients ne se comparent pas.
function profilEncre(png) {
  const { width: L, height: H, data: d } = png;
  const marge = 30, profil = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = marge; x < L - marge; x++) if (lum(d, (y * L + x) * 4) < 170) n++;
    profil[y] = n;
  }
  return profil;
}
function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return (da && db) ? +(num / Math.sqrt(da * db)).toFixed(3) : 0;
}

(async () => {
  fs.mkdirSync(DOSSIER, { recursive: true });
  for (const f of fs.readdirSync(DOSSIER)) fs.unlinkSync(path.join(DOSSIER, f));
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const PRESENTATION = PRESENTATIONS[1];      // texte dense : c'est du texte que la netteté se mesure
  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    await page.evaluate((i) => { window.ADOC_EXPORT_IMAGES = i; }, IMAGES_EMBARQUEES);

    // La capture NATIVE : la page amène la scène à l'écran, Node la photographie, la page la
    // remet où elle était. Aucun SnapDOM sur ce chemin — c'est tout l'objet de la référence.
    const natifs = {};
    await page.exposeFunction('__photographier', async (cle) => {
      const el = await page.$('[data-atelier-scene] .cc-ws-present-slide-inner');
      natifs[cle] = await el.screenshot({ type: 'png' });
      return true;
    });

    const resultats = [];

    // ── A. Une scène de 1920×1080 : le navigateur, puis SnapDOM à l'échelle 1 ────────────────
    const grand = await page.evaluate(async (d) => {
      let n = 0;
      const res = await window.AtelierImages.rendreImages(d, {
        scene: { largeur: 1920, hauteur: 1080 }, echelleTypo: 2.8,
        inspecter: async (inner, etape, scene, sc) => {
          const avant = sc.hote.style.cssText;
          sc.hote.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;display:block;background:#fff;';
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          await window.__photographier('A' + (n++));
          sc.hote.style.cssText = avant;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return null;
        },
      });
      const sorties = [];
      for (const im of res.images) {
        sorties.push({ stepId: im.stepId, largeur: im.largeur, hauteur: im.hauteur,
          b64: await new Promise((ok) => {
            const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]);
            fr.readAsDataURL(im.blob);
          }) });
      }
      return sorties;
    }, PRESENTATION.doc);

    // ── B. La scène du mode vidéo : le navigateur à transform:scale(2), puis SnapDOM à 2 ─────
    const video = await page.evaluate(async (d) => {
      let n = 0;
      const res = await window.AtelierImages.rendreImages(d, {
        inspecter: async (inner, etape, scene, sc) => {
          const avantHote = sc.hote.style.cssText, avantOuter = sc.outer.style.cssText,
                avantInner = sc.inner.style.cssText;
          // transform:scale(2) : le navigateur REDESSINE le texte à la taille doublée, il ne
          // grossit pas des pixels. C'est précisément l'idéal auquel comparer SnapDOM.
          //
          // DEUX FAUTES D'AFFILÉE, instructives toutes les deux. D'abord je n'avais mis à l'échelle
          // que l'intérieur : l'enveloppe, qui porte overflow:hidden, coupait ce qui dépassait, et
          // trois étapes rendaient la même densité — un chiffre identique là où le contenu
          // différait, signature d'un clip. Puis j'ai ouvert l'enveloppe à 1920 : l'intérieur, qui
          // est en width:100%, a suivi, et la capture est sortie en 3840×2160. Les deux tailles
          // doivent donc être posées EXPLICITEMENT, l'intérieur à la scène et l'enveloppe au double.
          //
          // La hauteur suit celle que la capture utilisera : une étape qui déborde produit une
          // image plus haute que 1080, et comparer deux images de hauteurs différentes n'a pas
          // de sens. C'est le même calcul que celui du moteur, au même endroit du geste.
          const hNecessaire = Math.max(scene.hauteur, sc.inner.scrollHeight,
            (sc.inner.querySelector('.adoc-sc-card') || { scrollHeight: 0 }).scrollHeight);
          sc.hote.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;display:block;background:#fff;';
          sc.outer.style.cssText = 'width:' + (scene.largeur * 2) + 'px;height:' + (hNecessaire * 2) + 'px;'
            + 'min-width:' + (scene.largeur * 2) + 'px;min-height:' + (hNecessaire * 2) + 'px;'
            + 'flex:0 0 auto;overflow:visible;';
          sc.inner.style.cssText = 'width:' + scene.largeur + 'px;height:' + hNecessaire + 'px;'
            + 'overflow:visible;transform:scale(2);transform-origin:0 0;';
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          await window.__photographier('B' + (n++));
          sc.hote.style.cssText = avantHote;
          sc.outer.style.cssText = avantOuter;
          sc.inner.style.cssText = avantInner;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return null;
        },
      });
      const sorties = [];
      for (const im of res.images) {
        sorties.push({ stepId: im.stepId, titre: im.titre, rang: im.rang, surRang: im.surRang,
          largeur: im.largeur, hauteur: im.hauteur, octets: im.octets,
          b64: await new Promise((ok) => {
            const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]);
            fr.readAsDataURL(im.blob);
          }) });
      }
      return sorties;
    }, PRESENTATION.doc);

    console.log('NETTETÉ DU MODE VIDÉO — métrique du lot 0 : gradient horizontal, seuil '
      + SEUIL_CONTOUR + ', moitié médiane des lignes.');
    console.log('Repères du lot 0 : moteur natif 162,5 — SnapDOM agrandi 92,5 — moteur flouté de 1 px 89.');
    console.log('Les deux comparaisons ne se comparent PAS entre elles : chacune a sa propre référence.');
    console.log('');

    const COMPARAISONS = [
      { cle: 'A', titre: 'A. SnapDOM sans agrandissement — scène de 1920×1080',
        ref: 'natif', snap: grand, suffixe: 'snapdom1' },
      { cle: 'B', titre: 'B. Le mode vidéo — scène de 960×540 à ×1,4, sortie 1920×1080',
        ref: 'natif agrandi par le navigateur', snap: video, suffixe: 'snapdom2' },
    ];

    for (const comp of COMPARAISONS) {
      console.log('── ' + comp.titre + ' ' + '─'.repeat(Math.max(0, 70 - comp.titre.length)));
      console.log('   ÉTAPE  IMAGE'.padEnd(34) + 'DENSITÉ'.padEnd(10) + 'MOYENNE'.padEnd(10)
        + 'PIC'.padEnd(7) + 'CORRÉL.'.padEnd(10) + 'PIXELS DIFFÉRENTS');
      const lignes = [];
      for (let k = 0; k < comp.snap.length; k++) {
        const brutNatif = natifs[comp.cle + k];
        if (!brutNatif) { console.log('   étape ' + (k + 1) + ' : capture native absente'); continue; }
        const natif = PNG.sync.read(brutNatif);
        const snap = PNG.sync.read(Buffer.from(comp.snap[k].b64, 'base64'));
        fs.writeFileSync(path.join(DOSSIER, comp.cle + (k + 1) + '-natif.png'), brutNatif);
        fs.writeFileSync(path.join(DOSSIER, comp.cle + (k + 1) + '-' + comp.suffixe + '.png'),
          Buffer.from(comp.snap[k].b64, 'base64'));
        const corr = correlation(profilEncre(natif), profilEncre(snap));
        let differents = null;
        if (natif.width === snap.width && natif.height === snap.height) {
          const diff = new PNG({ width: natif.width, height: natif.height });
          differents = pixelmatch(natif.data, snap.data, diff.data, natif.width, natif.height, { threshold: 0.1 });
          fs.writeFileSync(path.join(DOSSIER, comp.cle + (k + 1) + '-ecart.png'), PNG.sync.write(diff));
        }
        const mn = contours(natif), ms = contours(snap);
        const valide = corr >= 0.5;
        lignes.push({ etape: k + 1, stepId: comp.snap[k].stepId, correlation: corr, valide,
          tailles: natif.width + 'x' + natif.height + ' / ' + snap.width + 'x' + snap.height,
          natif: mn, snapdom: ms,
          pixels_differents: differents,
          part_differente: differents === null ? null : +((100 * differents) / (natif.width * natif.height)).toFixed(2) });
        console.log(('   ' + (k + 1) + '      natif').padEnd(34) + String(mn.densite).padEnd(10)
          + String(mn.moyenne).padEnd(10) + String(mn.pic).padEnd(7) + '—'.padEnd(10)
          + (natif.width + '×' + natif.height));
        console.log('          SnapDOM'.padEnd(34) + String(ms.densite).padEnd(10)
          + String(ms.moyenne).padEnd(10) + String(ms.pic).padEnd(7)
          + String(corr).padEnd(10)
          + (differents === null ? 'tailles différentes'
             : differents + ' sur ' + (natif.width * natif.height) + '  ('
               + ((100 * differents) / (natif.width * natif.height)).toFixed(2) + ' %)')
          + (valide ? '' : '   ✗ MISES EN PAGE DIFFÉRENTES : mesure refusée'));
      }
      const valides = lignes.filter((l) => l.valide);
      if (valides.length) {
        const m = (f, q) => +(valides.reduce((a, l) => a + l[q][f], 0) / valides.length).toFixed(1);
        const part = +(valides.reduce((a, l) => a + (l.part_differente || 0), 0) / valides.length).toFixed(2);
        const mn = m('moyenne', 'natif'), ms = m('moyenne', 'snapdom');
        console.log('   MOYENNE sur ' + valides.length + ' étapes : natif ' + mn
          + '  —  SnapDOM ' + ms
          + (mn > 0 ? '  (' + Math.round((100 * ms) / mn) + ' % du natif)' : '  (natif à zéro : rien à rapporter)')
          + '  —  ' + part + ' % de pixels différents');
      } else {
        console.log('   AUCUNE mesure valide : les mises en page ne concordent pas.');
      }
      console.log('');
      resultats.push({ comparaison: comp.cle, titre: comp.titre, lignes });
    }

    // ── TÉMOIN — la chaîne de mesure DOIT savoir voir une différence ─────────────────────────
    // « Zéro pixel différent » n'est crédible que si l'on montre que la mesure n'est pas aveugle.
    // Deux témoins : deux étapes voisines de la même série (un paragraphe de plus), et la capture
    // native de la scène de 1920 opposée à celle de la scène de 960 agrandie — deux mises en page
    // différentes. Les deux doivent montrer BEAUCOUP de pixels différents, sans quoi tout ce qui
    // précède ne mesure rien.
    console.log('── TÉMOINS — la mesure doit savoir voir une différence ' + '─'.repeat(18));
    const temoins = [];
    const lire = (f) => PNG.sync.read(fs.readFileSync(path.join(DOSSIER, f)));
    const comparer = (nom, a, b) => {
      if (a.width !== b.width || a.height !== b.height) {
        console.log('   ' + nom.padEnd(52) + 'tailles différentes (' + a.width + 'x' + a.height
          + ' contre ' + b.width + 'x' + b.height + ')');
        temoins.push({ nom, differents: null });
        return;
      }
      const d = new PNG({ width: a.width, height: a.height });
      const n = pixelmatch(a.data, b.data, d.data, a.width, a.height, { threshold: 0.1 });
      const pc = +((100 * n) / (a.width * a.height)).toFixed(2);
      console.log('   ' + nom.padEnd(52) + n + ' pixels différents (' + pc + ' %)'
        + (n > 1000 ? '   ✓ la mesure voit' : '   ✗ LA MESURE EST AVEUGLE'));
      temoins.push({ nom, differents: n, part: pc });
    };
    comparer('étape 3 contre étape 4, rendus natifs de la scène 1920', lire('A3-natif.png'), lire('A4-natif.png'));
    comparer('scène 1920 contre scène 960 agrandie, natives toutes deux', lire('A4-natif.png'), lire('B4-natif.png'));
    const aveugle = temoins.some((t) => t.differents !== null && t.differents <= 1000);
    if (aveugle) console.log('   ARRÊT DE LECTURE : un témoin n’a vu aucune différence là où il devait en voir.');
    console.log('');

    // La planche, pour l'œil.
    const bloc = (r) => '<h2>' + r.titre + '</h2><table><thead><tr><th>Étape</th>'
      + '<th>Natif (navigateur)</th><th>SnapDOM</th><th>Écart, pixel à pixel</th></tr></thead><tbody>'
      + r.lignes.map((l) => '<tr><th>' + l.etape + '<br><span>' + l.stepId + '</span></th>'
          + '<td><img src="nettete/' + r.comparaison + l.etape + '-natif.png" alt="natif">'
            + '<p>gradient moyen ' + l.natif.moyenne + ' — densité ' + l.natif.densite + ' % — pic ' + l.natif.pic + '</p></td>'
          + '<td><img src="nettete/' + r.comparaison + l.etape + '-'
            + (r.comparaison === 'A' ? 'snapdom1' : 'snapdom2') + '.png" alt="snapdom">'
            + '<p>gradient moyen ' + l.snapdom.moyenne + ' — densité ' + l.snapdom.densite + ' % — pic ' + l.snapdom.pic
            + '<br>corrélation des profils d’encre ' + l.correlation + (l.valide ? '' : ' — MESURE REFUSÉE') + '</p></td>'
          + '<td><img src="nettete/' + r.comparaison + l.etape + '-ecart.png" alt="écart">'
            + '<p>' + (l.pixels_differents === null ? 'tailles différentes'
                : l.pixels_differents + ' pixels différents, soit ' + l.part_differente + ' %') + '</p></td>'
          + '</tr>').join('')
      + '</tbody></table>';
    const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Netteté du mode vidéo</title>'
      + '<style>body{font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:20px 24px 60px;background:#f6f2ea;color:#273331;}'
      + 'h1{font-size:19px;margin:0 0 4px;} h2{font-size:15px;margin:26px 0 8px;} p.note{color:#667;font-size:13px;max-width:82ch;}'
      + 'table{border-collapse:collapse;} td,th{vertical-align:top;border:1px solid #c9c3b8;padding:8px;background:#fffdf9;}'
      + 'th{text-align:left;font-size:13px;} th span{font-weight:400;color:#667;font-size:12px;}'
      + 'td img{width:560px;height:auto;display:block;border:1px solid #e3ded3;}'
      + 'td p{margin:5px 0 0;font-size:11px;color:#667;}</style></head><body>'
      + '<h1>Netteté : ce que coûte SnapDOM, et ce que coûte l’agrandissement</h1>'
      + '<p class="note">Deux comparaisons, chacune à mise en page et taille identiques. <strong>Elles '
      + 'ne se comparent pas entre elles.</strong> La première isole la rastérisation de SnapDOM, sans '
      + 'aucun agrandissement. La seconde oppose le chemin du produit — SnapDOM agrandi deux fois — à '
      + 'ce que le navigateur dessinerait à la même taille. Les vignettes font 560 px : '
      + '<strong>ouvrez une image dans un onglet pour juger à sa taille réelle.</strong> La troisième '
      + 'colonne montre les pixels qui diffèrent.</p>'
      + resultats.map(bloc).join('')
      + '</body></html>';
    fs.writeFileSync(path.join(BANC, 'planche-nettete.html'), html, 'utf8');
    fs.writeFileSync(path.join(BANC, 'nettete-video.json'),
      JSON.stringify({ resultats, temoins }, null, 1), 'utf8');
    console.log('planche : ' + path.join(BANC, 'planche-nettete.html'));
    console.log('');
    console.log('  python3 -m http.server 8765 --directory ' + JSON.stringify(RACINE)
      + ' & sleep 1 && open -a Safari "http://127.0.0.1:8765/banc-chutier/planche-nettete.html"');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('ÉCHEC', e.message); process.exit(1); });
