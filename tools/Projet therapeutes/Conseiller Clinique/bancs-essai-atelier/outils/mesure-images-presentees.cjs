#!/usr/bin/env node
// COMPLÉMENT 7, POINTS 1 ET 3 — QUELLES IMAGES SONT RÉELLEMENT PRÉSENTÉES
//
// Pilote banc-images.html sur les cinq variantes, dans chaque navigateur disponible, et compte
// ce qui est PRÉSENTÉ (requestVideoFrameCallback), pas ce que le fichier contient.
//
// LECTURE À VITESSE RÉELLE, et c'est délibéré : la question n'est pas ce que le navigateur sait
// décoder au plus vite, mais ce qu'il affiche. Chaque variante dure 40 s, d'où ~10 min pour la
// matrice complète.
//
// ARTEFACT DE DÉMARRAGE MESURÉ, À NE PAS REPRODUIRE : sur les 2 premières secondes, Chrome ne
// présente que ~17 images par seconde (mise en route, remplissage du tampon) ; sur 3 s il en
// présente 90, soit 30 par seconde, 0 écartée. Une première sonde m'a fait prendre ce démarrage
// pour un défaut de Chrome — il n'en est pas un. Les flashs commencent à 3 s, donc hors de cette
// zone ; le compte total d'images, lui, l'inclut et n'est pas comparable d'un navigateur à l'autre.
//
// CE QUE CE BANC NE DIT PAS : il pilote Chrome et WebKit par Playwright. Le Safari réel de
// Christophe n'est PAS éprouvé ici (safaridriver exige une autorisation manuelle), et un
// navigateur piloté n'est pas une lecture humaine — d'où la page livrée dans controle-humain/.

const fs = require('node:fs'), path = require('node:path');
const http = require('node:http');
const pw = require('playwright');

const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'controle-humain');
const MESURES = path.join(RACINE, 'mesures');
const PAGE = 'G-images-presentees.html';
const VARIANTES = [
  ['V1', 'V1-images-tenues-plage-pleine.mp4'],
  ['V2', 'V2-cadence-constante-30ips.mp4'],
  ['V3', 'V3-images-tenues-plus-une-par-seconde.mp4'],
  ['V4', 'V4-cadence-constante-plage-limitee-reetiquetee.mp4'],
  ['V5', 'V5-temoin-ffmpeg-libx264.mp4'],
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4' };

// Serveur avec plages d'octets : sans Range, un <video> ne peut pas chercher dans le fichier.
function servirPaquet() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(PAQUET, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(PAQUET) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      const st = fs.statSync(p), ct = TYPES[path.extname(p)] || 'application/octet-stream';
      const range = q.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : st.size - 1;
        r.writeHead(206, { 'content-type': ct, 'accept-ranges': 'bytes',
          'content-range': 'bytes ' + a + '-' + b + '/' + st.size, 'content-length': b - a + 1 });
        return fs.createReadStream(p, { start: a, end: b }).pipe(r);
      }
      r.writeHead(200, { 'content-type': ct, 'accept-ranges': 'bytes', 'content-length': st.size });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

(async () => {
  for (const [, f] of VARIANTES) {
    if (!fs.existsSync(path.join(PAQUET, f))) {
      console.error('variante absente : ' + f + ' — lancer outils/produire-variantes.cjs');
      process.exit(1);
    }
  }
  if (!fs.existsSync(path.join(PAQUET, PAGE))) {
    console.error('page absente : ' + PAGE + ' — lancer outils/paquet-controle-humain.cjs');
    process.exit(1);
  }
  const { serveur, port } = await servirPaquet();
  const base = 'http://127.0.0.1:' + port + '/' + PAGE;

  const cibles = [
    { nom: 'Chrome installé', lancer: () => pw.chromium.launch({ channel: 'chrome' }) },
    { nom: 'Chromium Playwright', lancer: () => pw.chromium.launch() },
    { nom: 'WebKit Playwright', lancer: () => pw.webkit.launch() },
  ];
  const tout = [];

  for (const c of cibles) {
    let nav = null;
    try { nav = await c.lancer(); }
    catch (e) {
      console.log(c.nom + ' : INDISPONIBLE — ' + String(e.message).split('\n')[0].slice(0, 110));
      tout.push({ navigateur: c.nom, indisponible: String(e.message).split('\n')[0].slice(0, 160) });
      continue;
    }
    console.log(c.nom);
    const page = await nav.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(base);
    const ua = await page.evaluate(() => navigator.userAgent);
    for (const [cle, fichier] of VARIANTES) {
      let r;
      try { r = await page.evaluate((f) => window.__bancApi.mesurer(f), fichier); }
      catch (e) { r = { fichier, erreur: String(e.message).slice(0, 140) }; }
      if (r.erreur || r.supporte === false) {
        console.log('  ' + cle + '  ' + (r.erreur || 'requestVideoFrameCallback absent'));
      } else {
        const f1 = r.fondus[0], f2 = r.fondus[1];
        console.log('  ' + cle + '  flashs ' + String(r.flashs_vus).padStart(2) + '/9'
          + '   fondu1 ' + String(f1.images_presentees).padStart(2) + '/12 (' + (f1.duree_apparente_ms === null ? '—' : f1.duree_apparente_ms + ' ms') + ')'
          + '   fondu2 ' + String(f2.images_presentees).padStart(2) + '/12 (' + (f2.duree_apparente_ms === null ? '—' : f2.duree_apparente_ms + ' ms') + ')'
          + '   présentées ' + String(r.images_presentees_total).padStart(4)
          + '   écartées ' + (r.qualite ? r.qualite.droppedVideoFrames : '?'));
      }
      tout.push(Object.assign({ navigateur: c.nom, ua, variante: cle },
        r.images ? Object.assign({}, r, { images: undefined, nb_images_journalisees: r.images.length }) : r));
    }
    await nav.close();
  }
  serveur.close();
  fs.mkdirSync(MESURES, { recursive: true });
  fs.writeFileSync(path.join(MESURES, 'images-presentees.json'),
    JSON.stringify({ portee: 'navigateurs pilotés ; Safari réel non éprouvé', resultats: tout }, null, 2), 'utf8');
  console.log('');
  console.log('relevé : mesures/images-presentees.json');
})();
