#!/usr/bin/env node
// SUITE 1 — EXPORT DE 10 MINUTES EN CADENCE CONSTANTE, MESURÉ ET NON EXTRAPOLÉ
//
// 40 diapositives, fondus de 0,4 s, 30 images par seconde sur 600 s : 18 000 images écrites, contre
// 1 200 pour l'essai de 40 s. Extrapoler ×15 depuis l'essai court supposerait un coût linéaire et
// une mémoire constante — deux hypothèses que seule la mesure peut valider.
//
// MÉMOIRE : aucune API ne donne à une page la mémoire de son processus. `performance.memory`
// n'existe que sous Chrome et ne rapporte que le TAS JS, pas le processus. On échantillonne donc
// depuis l'EXTÉRIEUR la mémoire résidente (RSS) de l'arbre de processus du navigateur, toutes les
// 500 ms. C'est une vraie mesure, avec sa limite dite : pour Safari, d'autres onglets déjà ouverts
// comptent dans le total, d'où un relevé de référence AVANT la session et un écart.

const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const pw = require('playwright');

const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'controle-humain');
const MESURES = path.join(RACINE, 'mesures');
const PAGE = 'H-export-long.html';
const PORT_WD = 47903;
const TYPES = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.mjs': 'text/javascript', '.js': 'text/javascript' };

function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(PAQUET, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(PAQUET) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      const st = fs.statSync(p), ct = TYPES[path.extname(p)] || 'application/octet-stream';
      r.writeHead(200, { 'content-type': ct, 'accept-ranges': 'bytes', 'content-length': st.size });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

// ── mémoire résidente ───────────────────────────────────────────────────────────────────────
function descendants(pid) {
  const vus = [pid];
  const file = [pid];
  while (file.length) {
    const p = file.shift();
    let out = '';
    try { out = execFileSync('/usr/bin/pgrep', ['-P', String(p)], { encoding: 'utf8' }); } catch (e) { out = ''; }
    for (const l of out.split('\n')) {
      const n = parseInt(l.trim(), 10);
      if (n && !vus.includes(n)) { vus.push(n); file.push(n); }
    }
  }
  return vus;
}
function rssArbre(pid) {
  const pids = descendants(pid);
  let total = 0;
  try {
    const out = execFileSync('/bin/ps', ['-o', 'rss=', '-p', pids.join(',')], { encoding: 'utf8' });
    for (const l of out.split('\n')) { const v = parseInt(l.trim(), 10); if (v) total += v; }
  } catch (e) {}
  return total * 1024;
}
function rssParNom(motifs) {
  let total = 0;
  try {
    const out = execFileSync('/bin/ps', ['-axo', 'rss=,command='], { encoding: 'utf8' });
    for (const l of out.split('\n')) {
      const m = /^\s*(\d+)\s+(.*)$/.exec(l);
      if (!m) continue;
      if (motifs.some((x) => m[2].includes(x))) total += parseInt(m[1], 10) * 1024;
    }
  } catch (e) {}
  return total * 1;
}
function echantillonneur(lire) {
  const etat = { pic: 0, n: 0, actif: true };
  const t = setInterval(() => {
    if (!etat.actif) return;
    const v = lire();
    etat.n++;
    if (v > etat.pic) etat.pic = v;
  }, 500);
  return { etat, arreter: () => { etat.actif = false; clearInterval(t); } };
}
const mo = (o) => (o / 1048576).toFixed(0);

async function wd(methode, chemin, corps) {
  const r = await fetch('http://127.0.0.1:' + PORT_WD + chemin, {
    method: methode, headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const j = JSON.parse(await r.text());
  if (j && j.value && j.value.error) throw new Error(j.value.error + ' — ' + (j.value.message || '').slice(0, 160));
  return j && j.value;
}

(async () => {
  if (!fs.existsSync(path.join(PAQUET, PAGE))) {
    console.error('page absente : ' + PAGE); process.exit(1);
  }
  const { serveur, port } = await servir();
  const url = 'http://127.0.0.1:' + port + '/' + PAGE;
  const resultats = [];

  console.log('EXPORT DE 10 MINUTES EN CADENCE CONSTANTE — 40 diapositives, fondus de 0,4 s');
  console.log('  18 000 images attendues. Mémoire résidente échantillonnée toutes les 500 ms,');
  console.log('  depuis l\'extérieur du navigateur.');
  console.log('');

  // ── Chrome installé ───────────────────────────────────────────────────────────────────────
  try {
    // launchServer expose le PROCESSUS du navigateur ; launch() ne l expose pas dans cette
    // version de Playwright (nav.process n est pas une fonction, mesuré). Sans ce PID, aucune
    // mesure de mémoire résidente n est possible côté Chrome.
    const serveurNav = await pw.chromium.launchServer({ channel: 'chrome' });
    const pid = serveurNav.process() && serveurNav.process().pid;
    const nav = await pw.chromium.connect(serveurNav.wsEndpoint());
    const page = await nav.newPage();
    await page.goto(url);
    await page.waitForFunction(() => typeof window.__exportLongApi === 'object');
    const base = pid ? rssArbre(pid) : 0;
    const ech = echantillonneur(() => (pid ? rssArbre(pid) : 0));
    const t0 = Date.now();
    const r = await page.evaluate(() => window.__exportLongApi.exporterLong(), { timeout: 0 });
    ech.arreter();
    const murs = Date.now() - t0;
    console.log('  Chrome installé');
    console.log('    images écrites      : ' + r.images_ecrites);
    console.log('    durée d\'encodage    : ' + (r.duree_encodage_ms / 1000).toFixed(1) + ' s'
      + '   (horloge extérieure ' + (murs / 1000).toFixed(1) + ' s)');
    console.log('    poids               : ' + (r.octets / 1048576).toFixed(1) + ' Mo');
    console.log('    pic du tas JS       : ' + (r.tas_js_disponible ? (r.pic_tas_js_octets / 1048576).toFixed(1) + ' Mo' : 'indisponible'));
    console.log('    mémoire résidente   : ' + mo(base) + ' Mo avant, pic ' + mo(ech.etat.pic)
      + ' Mo, soit +' + mo(Math.max(0, ech.etat.pic - base)) + ' Mo   (' + ech.etat.n + ' échantillons)');
    resultats.push(Object.assign({ navigateur: 'Chrome installé', murs_ms: murs,
      rss_avant: base, rss_pic: ech.etat.pic, echantillons: ech.etat.n }, r));
    await nav.close(); await serveurNav.close();
  } catch (e) { console.log('  Chrome : ÉCHEC — ' + String(e.message).slice(0, 200)); }
  console.log('');

  // ── Safari réel ───────────────────────────────────────────────────────────────────────────
  const MOTIFS = ['/Applications/Safari.app', 'com.apple.WebKit.WebContent', 'com.apple.WebKit.Networking', 'com.apple.WebKit.GPU'];
  const baseSafari = rssParNom(MOTIFS);
  const pilote = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['-p', String(PORT_WD)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2000));
  let session = null;
  try {
    const v = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
    session = v.sessionId;
    await wd('POST', '/session/' + session + '/timeouts', { script: 900000 });
    await wd('POST', '/session/' + session + '/url', { url });
    const ech = echantillonneur(() => rssParNom(MOTIFS));
    const t0 = Date.now();
    const r = await wd('POST', '/session/' + session + '/execute/async', {
      script: 'var cb = arguments[0];'
            + 'window.__exportLongApi.exporterLong().then(cb).catch(function (e) { cb({ erreur: String(e && e.message || e) }); });',
      args: [],
    });
    ech.arreter();
    const murs = Date.now() - t0;
    console.log('  Safari ' + (v.capabilities && v.capabilities.browserVersion) + ' réel');
    if (r && r.erreur) { console.log('    ÉCHEC DE L\'EXPORT : ' + r.erreur); }
    else {
      console.log('    images écrites      : ' + r.images_ecrites);
      console.log('    durée d\'encodage    : ' + (r.duree_encodage_ms / 1000).toFixed(1) + ' s'
        + '   (horloge extérieure ' + (murs / 1000).toFixed(1) + ' s)');
      console.log('    poids               : ' + (r.octets / 1048576).toFixed(1) + ' Mo');
      console.log('    pic du tas JS       : ' + (r.tas_js_disponible ? (r.pic_tas_js_octets / 1048576).toFixed(1) + ' Mo' : 'performance.memory absent de Safari'));
      console.log('    mémoire résidente   : ' + mo(baseSafari) + ' Mo avant, pic ' + mo(ech.etat.pic)
        + ' Mo, soit +' + mo(Math.max(0, ech.etat.pic - baseSafari)) + ' Mo   (' + ech.etat.n + ' échantillons)');
      console.log('    LIMITE : le total inclut les autres onglets de Safari déjà ouverts ; seul');
      console.log('    l\'écart est attribuable à l\'export, et même lui approximativement.');
    }
    resultats.push(Object.assign({ navigateur: 'Safari réel', murs_ms: murs,
      rss_avant: baseSafari, rss_pic: ech.etat.pic, echantillons: ech.etat.n }, r || {}));
  } catch (e) { console.log('  Safari : ÉCHEC — ' + String(e.message).slice(0, 200)); }
  finally {
    if (session) { try { await wd('DELETE', '/session/' + session); } catch (e) {} }
    pilote.kill();
  }
  serveur.close();
  fs.mkdirSync(MESURES, { recursive: true });
  fs.writeFileSync(path.join(MESURES, 'export-long-cfr.json'),
    JSON.stringify({ plan: '40 diapositives, fondus 0,4 s, 30 i/s, 600 s', resultats }, null, 2), 'utf8');
  console.log('');
  console.log('relevé : mesures/export-long-cfr.json');
})();
