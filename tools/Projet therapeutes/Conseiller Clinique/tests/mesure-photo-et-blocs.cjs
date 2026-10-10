// LE BANDEAU PHOTO ET L'EMPILEMENT DES BLOCS — mesures du 8 octobre.
//
// Christophe a vérifié le correctif de troncature sur sa vraie présentation en (d) et relevé que
// les hauteurs réelles y sont de 1,52 à 4,39 fois le cadre : (d) ne convient pas à ce contenu.
// Il a aussi nommé la cause restante : « la photo plafonnée à 45 % de la hauteur de la carte
// grandit avec le contenu ».
//
// Ce script mesure, SANS RIEN APPLIQUER PAR DÉFAUT :
//   passe A — les quatre réglages tels quels, par diapositive ;
//   passe B — un plafond ABSOLU du bandeau photo (fraction de la hauteur du CADRE) ;
//   passe C — « bloc courant seul » en mode vidéo, par étape ;
//   passe D — ce que l'empilement ou son absence change pour le fondu entre étapes (CDC Ef1).
//
// Il lit la présentation de Christophe dans banc-chutier/entrees/ si elle y est, sinon il mesure
// les présentations d'essai en le disant. Rien de ce qu'il lit ou écrit n'entre dans le dépôt :
// banc-chutier/ est ignoré par git.
//
//   NODE_PATH=<playwright> node tests/mesure-photo-et-blocs.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const RACINE = path.join(__dirname, '..');
const { INSPECTEUR } = require('./chutier-inspecteur.cjs');
const { lireExport } = require('./lire-export-html.cjs');
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');

const ENTREES = path.join(RACINE, 'banc-chutier', 'entrees');
const PLANCHES = path.join(RACINE, 'banc-chutier', 'planches');
const PLAFOND = 0.25;              // la valeur que Christophe propose d'éprouver
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };

const REGLAGES = {
  a: { nom: '(a) fidèle 1422x800', o: { mode: 'fidele' } },
  b: { nom: '(b) fidèle 960x540', o: { mode: 'fidele', scene: { largeur: 960, hauteur: 540 } } },
  c: { nom: '(c) fidèle, typo x1,6', o: { mode: 'fidele', echelleTypo: 1.6 } },
  d: { nom: '(d) VIDÉO 960x540 x1,4', o: {} },
};

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

function trouverExport() {
  if (!fs.existsSync(ENTREES)) return null;
  const f = fs.readdirSync(ENTREES).filter((x) => /\.html?$/i.test(x)).sort()[0];
  return f ? path.join(ENTREES, f) : null;
}

// Le rendu d'un réglage, dans la page. Ne renvoie que des métadonnées : garder 19 images de
// 1920x4746 pour quatre réglages épuiserait la mémoire de l'onglet sans rien apprendre.
const RENDRE = async ({ doc, opts, src }) => {
  const inspecter = eval('(' + src + ')');
  const t0 = performance.now();
  const r = await window.AtelierImages.rendreImages(doc, Object.assign({ inspecter }, opts));
  const ms = performance.now() - t0;
  const corps = (insp) => {
    if (!insp || !insp.tailles) return null;
    const t = insp.tailles.filter((x) => x.balise === 'p' || x.balise === 'li')
      .map((x) => x.pc_hauteur).sort((a, b) => a - b);
    return t.length ? t[Math.floor(t.length / 2)] : null;
  };
  return {
    scene: r.scene, echelle_typo: r.echelle_typo,
    plafond_photo: r.plafond_photo, plafond_photo_px: r.plafond_photo_px,
    bloc_courant_seul: r.bloc_courant_seul,
    ms_total: Math.round(ms), ms_par_image: Math.round(ms / r.images.length),
    octets: r.octets_total,
    images: r.images.map((im) => ({
      cardIndex: im.cardIndex, rang: im.rang, surRang: im.surRang, stepId: im.stepId,
      titre: im.titre, hauteur: im.hauteur, hauteurScene: im.hauteurScene,
      contenu: im.hauteur_contenu, coupe: im.coupe_px,
      verdict: im.debordement_verdict, rapport: im.debordement_rapport,
      photo_px: im.photo_px, photo_pc_cadre: im.photo_pc_cadre, photo_pc_image: im.photo_pc_image,
      photo_plafond: im.photo_plafond_calcule,
      texte_pc: corps(im.inspection),
      octets: im.octets,
    })),
  };
};

// Par diapositive : la pire étape, puisque c'est elle qui décide de la taille de l'image.
function parDiapositive(images) {
  const g = new Map();
  for (const im of images) {
    const k = im.cardIndex;
    if (!g.has(k)) g.set(k, { cardIndex: k, titre: im.titre, etapes: 0, hauteur: 0, rapport: 0,
                              verdict: 'aucun', photo_px: 0, photo_pc_cadre: 0, photo_pc_image: 0,
                              texte_pc: null, plafond: im.photo_plafond, hauteurs: [] });
    const d = g.get(k);
    d.etapes++;
    d.hauteurs.push(im.hauteur);
    if (im.hauteur > d.hauteur) {
      d.hauteur = im.hauteur; d.rapport = im.rapport;
      d.photo_px = im.photo_px; d.photo_pc_cadre = im.photo_pc_cadre; d.photo_pc_image = im.photo_pc_image;
    }
    const ordre = { aucun: 0, defilement: 1, scission: 2 };
    if (ordre[im.verdict] > ordre[d.verdict]) d.verdict = im.verdict;
    if (im.texte_pc != null && (d.texte_pc == null || im.texte_pc < d.texte_pc)) d.texte_pc = im.texte_pc;
  }
  return Array.from(g.values()).sort((x, y) => x.cardIndex - y.cardIndex);
}

const pc = (x) => (x == null ? '—' : x.toFixed(2) + ' %');

(async () => {
  const chemin = trouverExport();
  let doc, images, source;
  if (chemin) {
    const lu = lireExport(chemin);
    doc = lu.doc; images = lu.images;
    source = 'export de Christophe : ' + path.basename(chemin);
  } else {
    doc = PRESENTATIONS[0].doc; images = IMAGES_EMBARQUEES;
    source = 'AUCUN export dans banc-chutier/entrees/ — mesuré sur une présentation d\'essai';
  }

  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    await page.evaluate((imgs) => { window.ADOC_EXPORT_IMAGES = imgs; }, images);
    const nEtapes = await page.evaluate((d) => window.adocPresentStepList(d).length, doc);

    console.log('LE BANDEAU PHOTO ET L\'EMPILEMENT DES BLOCS — ' + source);
    console.log('  ' + (doc.blocks || []).length + ' diapositives, ' + nEtapes + ' étapes, '
      + Object.keys(images).length + ' images embarquées. Aucun appel réseau, aucune connexion.');
    console.log('  Hauteurs données en pixels de SORTIE (cadre de référence 1920x1080), comme les');
    console.log('  relevés de Christophe. Le rapport est la hauteur divisée par 1080.\n');

    const A = {}, B = {};
    for (const k of Object.keys(REGLAGES)) {
      A[k] = await page.evaluate(RENDRE, { doc, opts: REGLAGES[k].o, src: INSPECTEUR.toString() });
      B[k] = await page.evaluate(RENDRE,
        { doc, opts: Object.assign({ plafondPhoto: PLAFOND }, REGLAGES[k].o), src: INSPECTEUR.toString() });
    }
    const C = await page.evaluate(RENDRE,
      { doc, opts: { blocCourantSeul: true, plafondPhoto: PLAFOND }, src: INSPECTEUR.toString() });

    // ── PASSE A — les quatre réglages tels quels ───────────────────────────────────────────────
    console.log('PASSE A — LES QUATRE RÉGLAGES TELS QUELS (aucune option)\n');
    for (const k of Object.keys(REGLAGES)) {
      const r = A[k];
      console.log('  ' + REGLAGES[k].nom + '  —  scène ' + r.scene.largeur + 'x' + r.scene.hauteur
        + ', typo x' + r.echelle_typo + ', plafond photo calculé « ' + (r.images[1] ? r.images[1].photo_plafond : '—') + ' »');
      console.log('    diapo  étapes   image      rapport  verdict       photo px   % cadre  % image   texte');
      for (const d of parDiapositive(r.images)) {
        console.log('      ' + String(d.cardIndex + 1).padEnd(5)
          + String(d.etapes).padStart(5)
          + String('1920x' + d.hauteur).padStart(12)
          + d.rapport.toFixed(2).padStart(9)
          + ('  ' + d.verdict).padEnd(14)
          + String(d.photo_px || '—').padStart(9)
          + (d.photo_pc_cadre ? d.photo_pc_cadre.toFixed(0) + ' %' : '—').padStart(10)
          + (d.photo_pc_image ? d.photo_pc_image.toFixed(0) + ' %' : '—').padStart(9)
          + pc(d.texte_pc).padStart(10));
      }
      console.log('    ' + r.ms_par_image + ' ms par image, ' + (r.octets / 1048576).toFixed(1) + ' Mo au total\n');
    }

    // ── PASSE B — plafond absolu du bandeau photo ──────────────────────────────────────────────
    console.log('PASSE B — PLAFOND ABSOLU DU BANDEAU PHOTO À ' + (PLAFOND * 100) + ' % DE LA HAUTEUR DU CADRE');
    console.log('  En pixels, calculé une fois sur le cadre : il ne grandit pas quand la scène est');
    console.log('  agrandie pour contenir le débordement. C\'est la différence avec max-height:45%.\n');
    console.log('    réglage                     plafond   diapo  photo avant  photo après   image avant   image après   gain');
    for (const k of Object.keys(REGLAGES)) {
      const av = parDiapositive(A[k].images), ap = parDiapositive(B[k].images);
      for (let i = 0; i < av.length; i++) {
        console.log('    ' + (i === 0 ? REGLAGES[k].nom.padEnd(26) : ''.padEnd(26))
          + (i === 0 ? (B[k].plafond_photo_px + ' px').padStart(9) : ''.padStart(9))
          + String(av[i].cardIndex + 1).padStart(8)
          + String(av[i].photo_px || 0).padStart(13)
          + String(ap[i].photo_px || 0).padStart(13)
          + String(av[i].hauteur).padStart(14)
          + String(ap[i].hauteur).padStart(14)
          + (av[i].hauteur - ap[i].hauteur > 0 ? '  -' + (av[i].hauteur - ap[i].hauteur) + ' px' : '  —'));
      }
      const sa = parDiapositive(A[k].images).reduce((m, d) => Math.max(m, d.rapport), 0);
      const sb = parDiapositive(B[k].images).reduce((m, d) => Math.max(m, d.rapport), 0);
      console.log('      rapport maximal : ' + sa.toFixed(2) + ' → ' + sb.toFixed(2)
        + '   |   étapes qui débordent : ' + A[k].images.filter((im) => im.verdict !== 'aucun').length
        + ' → ' + B[k].images.filter((im) => im.verdict !== 'aucun').length + ' sur ' + nEtapes + '\n');
    }

    // ── PASSE C — bloc courant seul ────────────────────────────────────────────────────────────
    console.log('PASSE C — « BLOC COURANT SEUL » EN MODE VIDÉO (avec le plafond photo à '
      + (PLAFOND * 100) + ' %)');
    console.log('  Chaque étape n\'affiche que son bloc, plus le titre de la diapositive et le');
    console.log('  bandeau photo. Les blocs précédents sont retirés de la mise en page.\n');
    console.log('    diapo  étape   image      rapport  verdict      photo px   texte     vs empilé');
    const Cd = C.images, Dd = A.d.images;
    for (let i = 0; i < Cd.length; i++) {
      const im = Cd[i], ref = Dd[i];
      console.log('      ' + String(im.cardIndex + 1).padEnd(5)
        + String(im.rang + '/' + im.surRang).padStart(7)
        + String('1920x' + im.hauteur).padStart(12)
        + im.rapport.toFixed(2).padStart(9)
        + ('  ' + im.verdict).padEnd(13)
        + String(im.photo_px || '—').padStart(9)
        + pc(im.texte_pc).padStart(10)
        + ('   ' + ref.hauteur + ' → ' + im.hauteur + ' px').padStart(22));
    }
    console.log('\n    rapport maximal : ' + Math.max(...Dd.map((x) => x.rapport)).toFixed(2)
      + ' (empilé) → ' + Math.max(...Cd.map((x) => x.rapport)).toFixed(2) + ' (bloc seul)');
    console.log('    étapes qui débordent : ' + Dd.filter((x) => x.verdict !== 'aucun').length
      + ' → ' + Cd.filter((x) => x.verdict !== 'aucun').length + ' sur ' + nEtapes);
    console.log('    poids : ' + (A.d.octets / 1048576).toFixed(1) + ' Mo → ' + (C.octets / 1048576).toFixed(1) + ' Mo');
    console.log('    temps : ' + A.d.ms_par_image + ' → ' + C.ms_par_image + ' ms par image\n');

    // ── PASSE D — ce que cela change pour le fondu entre étapes ────────────────────────────────
    const fondu = await page.evaluate(async ({ doc, plafond, src }) => {
      const inspecter = eval('(' + src + ')');
      const mesurer = async (opts) => {
        const r = await window.AtelierImages.rendreImages(doc, Object.assign({ inspecter }, opts));
        const paires = [];
        for (let i = 1; i < r.images.length; i++) {
          const a = r.images[i - 1], b = r.images[i];
          if (a.cardId !== b.cardId) continue;       // un changement de diapositive n'est pas un fondu d'étape
          const lire = async (blob) => {
            const bmp = await createImageBitmap(blob);
            const c = document.createElement('canvas');
            c.width = bmp.width; c.height = bmp.height;
            c.getContext('2d').drawImage(bmp, 0, 0);
            const d = c.getContext('2d').getImageData(0, 0, bmp.width, bmp.height);
            bmp.close();
            return d;
          };
          const da = await lire(a.blob), db = await lire(b.blob);
          const h = Math.min(da.height, db.height), w = Math.min(da.width, db.width);
          let diff = 0;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const ia = (y * da.width + x) * 4, ib = (y * db.width + x) * 4;
              if (Math.abs(da.data[ia] - db.data[ib]) > 8
                || Math.abs(da.data[ia + 1] - db.data[ib + 1]) > 8
                || Math.abs(da.data[ia + 2] - db.data[ib + 2]) > 8) diff++;
            }
          }
          // `rang` est déjà en base 1 dans les métadonnées : y rajouter 1 décalerait l'étiquette
          // d'un cran, comme cela m'est arrivé deux fois dans ce script.
          paires.push({ carte: a.cardIndex + 1, de: a.rang, vers: b.rang,
            memeTaille: da.width === db.width && da.height === db.height,
            pc: +((diff / (w * h)) * 100).toFixed(1) });
        }
        return paires;
      };
      return { empile: await mesurer({}),
               blocSeul: await mesurer({ blocCourantSeul: true, plafondPhoto: plafond }) };
    }, { doc, plafond: PLAFOND, src: INSPECTEUR.toString() });

    console.log('PASSE D — LE FONDU ENTRE ÉTAPES (CDC Ef1 suppose un empilement cumulatif)');
    console.log('  Part des pixels qui changent d\'une étape à la suivante, dans la même diapositive.');
    console.log('  Un fondu croisé lit comme « un bloc apparaît » quand la part est faible, et comme');
    console.log('  un changement de diapositive quand elle est forte.\n');
    console.log('    paire            empilé          bloc seul       même taille (bloc seul)');
    for (let i = 0; i < fondu.empile.length; i++) {
      const e = fondu.empile[i], b = fondu.blocSeul[i];
      console.log('    diapo ' + e.carte + ', ' + e.de + '→' + e.vers
        + String(e.pc + ' %').padStart(15)
        + String(b.pc + ' %').padStart(16)
        + (b.memeTaille ? '       oui' : '       NON — hauteurs différentes'));
    }
    const moy = (xs) => (xs.reduce((a, x) => a + x.pc, 0) / xs.length).toFixed(1);
    console.log('\n    moyenne : empilé ' + moy(fondu.empile) + ' %, bloc seul ' + moy(fondu.blocSeul) + ' %');
    console.log('    paires de tailles différentes en bloc seul : '
      + fondu.blocSeul.filter((x) => !x.memeTaille).length + ' sur ' + fondu.blocSeul.length
      + '  (un fondu croisé entre deux images de hauteurs différentes n\'est pas défini)\n');

    // ── LA PLANCHE À L'ŒIL — diapositive 5, les deux options ───────────────────────────────────
    const derniere = (doc.blocks || []).filter((b) => b.type === 'card').length - 1;
    const planche = await page.evaluate(async ({ doc, carte, plafond, src }) => {
      const inspecter = eval('(' + src + ')');
      const prendre = async (opts) => {
        const r = await window.AtelierImages.rendreImages(doc, Object.assign({ inspecter, type: 'image/jpeg', qualite: 0.9 }, opts));
        const voulues = r.images.filter((im) => im.cardIndex === carte);
        const out = [];
        for (const im of voulues) {
          out.push({ rang: im.rang + 1, surRang: im.surRang, hauteur: im.hauteur,
            rapport: im.debordement_rapport, verdict: im.debordement_verdict,
            photo: im.photo_px,
            url: await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(im.blob); }) });
        }
        return out;
      };
      return {
        tel: await prendre({}),
        plafonne: await prendre({ plafondPhoto: plafond }),
        blocSeul: await prendre({ blocCourantSeul: true, plafondPhoto: plafond }),
      };
    }, { doc, carte: derniere, plafond: PLAFOND, src: INSPECTEUR.toString() });

    fs.mkdirSync(PLANCHES, { recursive: true });
    const colonne = (titre, legende, imgs) => '<section><h2>' + titre + '</h2><p class="l">' + legende + '</p>'
      + imgs.map((x) => '<figure><img src="' + x.url + '"><figcaption>étape ' + x.rang + '/' + x.surRang
          + ' — 1920x' + x.hauteur + ', rapport ' + x.rapport.toFixed(2) + ', ' + x.verdict
          + (x.photo ? ', photo ' + x.photo + ' px' : '') + '</figcaption></figure>').join('')
      + '</section>';
    const html = '<!doctype html><meta charset="utf-8"><title>Planche — diapositive ' + (derniere + 1) + '</title>'
      + '<style>body{margin:0;background:#201d1a;color:#f2ece3;font:14px/1.5 ui-sans-serif,system-ui;padding:20px}'
      + 'h1{font-size:19px;margin:0 0 4px}p.i{color:#b8ada0;max-width:1100px;margin:0 0 18px}'
      + '.g{display:flex;gap:18px;align-items:flex-start}section{flex:1 1 0;min-width:0}'
      + 'h2{font-size:15px;margin:0 0 2px}p.l{color:#b8ada0;font-size:12px;margin:0 0 10px;min-height:46px}'
      + 'figure{margin:0 0 14px}img{width:100%;height:auto;display:block;background:#fff}'
      + 'figcaption{font-size:11px;color:#b8ada0;margin-top:4px}</style>'
      + '<h1>Diapositive ' + (derniere + 1) + ' — mode vidéo (d), les deux options à juger</h1>'
      + '<p class="i">Les trois colonnes montrent les mêmes étapes. À gauche, le mode vidéo tel qu\'il est '
      + 'aujourd\'hui. Au milieu, le bandeau photo plafonné à ' + (PLAFOND * 100) + ' % de la hauteur du cadre. '
      + 'À droite, « bloc courant seul » avec ce même plafond. Les images ne sont pas centrées '
      + 'verticalement et sont affichées à la même largeur : leur hauteur relative est donc lisible '
      + 'à l\'œil. Aucune des deux options n\'est active par défaut.</p>'
      + '<div class="g">'
      + colonne('(d) tel quel', 'Empilement cumulatif, bandeau photo à 45 % de la hauteur de la carte — il grandit avec le contenu.', planche.tel)
      + colonne('(d) + plafond photo', 'Empilement cumulatif, bandeau photo plafonné en pixels : il ne grandit plus.', planche.plafonne)
      + colonne('(d) + bloc courant seul', 'Un seul bloc par étape, titre et bandeau photo conservés, plafond photo actif.', planche.blocSeul)
      + '</div>';
    const cible = path.join(PLANCHES, 'planche-photo-et-blocs.html');
    fs.writeFileSync(cible, html);
    console.log('PLANCHE À L\'ŒIL : ' + cible);
    console.log('  (dossier ignoré par git — rien n\'entre dans le dépôt)\n');
    console.log('  erreurs de page : ' + (erreurs.length || 'aucune'));
    if (erreurs.length) { console.log('    ' + erreurs.join('\n    ')); process.exit(1); }
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
