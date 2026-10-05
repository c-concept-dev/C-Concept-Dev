#!/usr/bin/env node
// COMPLÉMENT 7 (suite) — LES CINQ VARIANTES DANS LE SAFARI RÉEL
//
// Playwright n'a pas de canal « safari » : son navigateur « webkit » est une compilation de WebKit,
// pas l'application Safari. Le Safari réel se pilote uniquement par `safaridriver` (WebDriver), qui
// EST disponible ici — session ouverte sur Safari 26.3, vérifié avant d'écrire ce banc.
//
// C'est la différence qui compte : le CDC note que le Safari réel n'avait été éprouvé que pour la
// page de netteté. Les chiffres « WebKit piloté » ne sont pas des chiffres de Safari.
//
// Même page, même mesure, mêmes deux méthodes de comptage (rappels de requestVideoFrameCallback,
// et compteur presentedFrames du navigateur) que le banc Chrome/WebKit.

const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'controle-humain');
const MESURES = path.join(RACINE, 'mesures');
const PAGE = 'G-images-presentees.html';
const PORT_WD = 47901;
const VARIANTES = [
  ['V1', 'V1-images-tenues-plage-pleine.mp4'],
  ['V2', 'V2-cadence-constante-30ips.mp4'],
  ['V3', 'V3-images-tenues-plus-une-par-seconde.mp4'],
  ['V4', 'V4-cadence-constante-plage-limitee-reetiquetee.mp4'],
  ['V5', 'V5-temoin-ffmpeg-libx264.mp4'],
];
const REPET = Math.max(1, parseInt(process.argv[2] || '1', 10) || 1);
const FILTRE = process.argv.slice(3).filter((x) => /^V[1-5]$/.test(x));
const CHOIX = FILTRE.length ? VARIANTES.filter((v) => FILTRE.includes(v[0])) : VARIANTES;
const TYPES = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4' };
const PROD = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(MESURES, 'variantes.json'), 'utf8')).variantes; }
  catch (e) { return []; }
})();

// Serveur avec plages d'octets : sans Range, un <video> ne peut pas chercher.
function servir() {
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

async function wd(methode, chemin, corps) {
  const r = await fetch('http://127.0.0.1:' + PORT_WD + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { throw new Error('réponse illisible : ' + t.slice(0, 160)); }
  if (j && j.value && j.value.error) throw new Error(j.value.error + ' — ' + (j.value.message || '').slice(0, 200));
  return j && j.value;
}

(async () => {
  for (const [, f] of CHOIX) {
    if (!fs.existsSync(path.join(PAQUET, f))) {
      console.error('variante absente : ' + f + ' — lancer outils/produire-variantes.cjs'); process.exit(1);
    }
  }
  if (!fs.existsSync(path.join(PAQUET, PAGE))) {
    console.error('page absente : ' + PAGE + ' — lancer outils/paquet-controle-humain.cjs'); process.exit(1);
  }

  const { serveur, port } = await servir();
  const pilote = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['-p', String(PORT_WD)],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let journal = '';
  pilote.stdout.on('data', (d) => { journal += d; });
  pilote.stderr.on('data', (d) => { journal += d; });
  await new Promise((r) => setTimeout(r, 2000));

  let session = null;
  const tout = [];
  try {
    // alwaysAllowAutoplay : sans lui, Safari peut refuser play() sans geste de l'utilisateur, et la
    // mesure ne porterait alors sur rien.
    const v = await wd('POST', '/session', { capabilities: { alwaysMatch: {
      browserName: 'safari', 'safari:alwaysAllowAutoplay': true } } });
    session = v.sessionId;
    console.log('LES CINQ VARIANTES DANS LE SAFARI RÉEL');
    console.log('  Safari ' + (v.capabilities && v.capabilities.browserVersion)
      + ' sur macOS ' + (v.capabilities && v.capabilities['safari:platformVersion'])
      + '   (pilotage safaridriver, PAS WebKit de Playwright)');
    console.log('  « A/B » = rappels requestVideoFrameCallback / compteur presentedFrames du navigateur');
    console.log('  « * » = rappels coalescés : le compte par rappels sous-estime');
    console.log('');
    // 150 s : une lecture dure 40 s, et Safari peut mettre du temps à démarrer la première.
    await wd('POST', '/session/' + session + '/timeouts', { script: 150000 });
    await wd('POST', '/session/' + session + '/url',
      { url: 'http://127.0.0.1:' + port + '/' + PAGE });

    for (const [cle, fichier] of CHOIX) {
      const prod = PROD.find((p) => p.cle === cle) || {};
      const ko = prod.octets ? Math.round(prod.octets / 1024) : null;
      const encMs = prod.encodage_ms || null;
      for (let essai = 1; essai <= REPET; essai++) {
        let r;
        try {
          r = await wd('POST', '/session/' + session + '/execute/async', {
            script: 'var f = arguments[0], cb = arguments[1];'
                  + 'window.__bancApi.mesurer(f).then(function (x) {'
                  + '  if (x && x.images) { x.nb_images_journalisees = x.images.length; delete x.images; }'
                  + '  cb(x); }).catch(function (e) { cb({ erreur: String(e && e.message || e) }); });',
            args: [fichier],
          });
        } catch (e) { r = { erreur: String(e.message).slice(0, 160) }; }
        if (!r || r.erreur || r.supporte === false) {
          console.log('  ' + cle + ' #' + essai + '  ' + ((r && r.erreur) || 'requestVideoFrameCallback absent'));
        } else {
          const co = (x) => String(x.images_presentees).padStart(2) + '/' + String(x.compteur_navigateur).padStart(2)
            + (x.rappels_coalesces ? '*' : ' ');
          console.log('  ' + cle + ' #' + essai
            + '  flashs ' + String(r.flashs_vus).padStart(2) + '/9'
            + '   fondu1 ' + co(r.fondus[0]) + '  fondu2 ' + co(r.fondus[1])
            + '   rappels ' + String(r.images_presentees_total).padStart(4)
            + '  compteur ' + String(r.total_compteur_navigateur).padStart(4)
            + '  manqués ' + String(r.rappels_manques_sur_toute_la_lecture).padStart(3)
            + '   écartées ' + String(r.qualite ? r.qualite.droppedVideoFrames : '?').padStart(3)
            + (ko ? '   ' + String(ko).padStart(5) + ' Ko' : '')
            + (encMs ? '   ' + (encMs / 1000).toFixed(1) + ' s' : ''));
        }
        tout.push(Object.assign({ navigateur: 'Safari réel (safaridriver)', variante: cle, essai,
                                  poids_ko: ko, encodage_ms: encMs }, r || {}));
      }
    }
  } catch (e) {
    console.error('ÉCHEC du pilotage de Safari : ' + e.message);
    if (journal.trim()) console.error('journal safaridriver : ' + journal.trim().slice(0, 300));
    console.error('Si « Allow Remote Automation » est décoché dans le menu Développement de Safari,');
    console.error('aucun pilotage n\'est possible : la mesure est alors à faire à la main par Christophe.');
  } finally {
    if (session) { try { await wd('DELETE', '/session/' + session); } catch (e) {} }
    pilote.kill(); serveur.close();
  }
  if (tout.length) {
    fs.mkdirSync(MESURES, { recursive: true });
    fs.writeFileSync(path.join(MESURES, 'images-presentees-safari.json'),
      JSON.stringify({ navigateur: 'Safari réel piloté par safaridriver', resultats: tout }, null, 2), 'utf8');
    console.log('');
    console.log('relevé : mesures/images-presentees-safari.json');
  }
})();
