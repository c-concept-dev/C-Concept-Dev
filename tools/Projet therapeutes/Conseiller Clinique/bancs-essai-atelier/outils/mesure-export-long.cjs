#!/usr/bin/env node
// EXPORT DE 15 MINUTES EN CADENCE CONSTANTE, MESURÉ ET NON EXTRAPOLÉ
//
// Quinze minutes est la limite de conception : c'est donc le cas à mesurer, et non celui à
// déduire. 60 diapositives, fondus de 0,4 s, 30 images par seconde sur 900 s : 27 000 images
// écrites. Le rythme est celui de la mesure à 10 minutes (une diapositive toutes les 15 s), pour
// que seule la durée change entre les deux relevés.
//
// CONTRE-PRESSION : la page borne elle-même la file de l'encodeur et mesure l'attente. Les
// chiffres remontent ici ; si la file n'est pas lisible dans la version embarquée de Mediabunny,
// c'est dit et rien n'est conclu à sa place.
//
// MÉMOIRE : aucune API ne donne à une page la mémoire de son processus. `performance.memory`
// n'existe que sous Chrome et ne rapporte que le TAS JS, pas le processus. On échantillonne donc
// depuis l'EXTÉRIEUR la mémoire résidente (RSS) de l'arbre de processus du navigateur, toutes les
// 500 ms, et on en tire une série sur grille de 30 s. Un pic et une accumulation ne se
// distinguent pas sur un seul maximum : il faut la pente pendant l'export ET le retour après.
// On continue donc d'échantillonner 60 s APRÈS la fin de l'encodage. Pour Safari, d'autres
// onglets déjà ouverts comptent dans le total, d'où un relevé de référence AVANT la session.

const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const pw = require('playwright');

const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'controle-humain');
const MESURES = path.join(RACINE, 'mesures');
const PAGE = 'H-export-long.html';
const PORT_WD = 47903;
const PLAN = { duree: 900, diapos: 60 };
const RELACHE_MS = 60000;          // on regarde si la mémoire redescend après l'export
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
  return total;
}
// Échantillonne toutes les 500 ms ET conserve la série complète : le pic seul ne distingue pas
// un pic d'une accumulation, la pente le fait.
function echantillonneur(lire) {
  const t0 = Date.now();
  const etat = { pic: 0, n: 0, actif: true, serie: [], fin_encodage_ms: null };
  const t = setInterval(() => {
    if (!etat.actif) return;
    const v = lire();
    etat.n++;
    etat.serie.push([Date.now() - t0, v]);
    if (v > etat.pic) etat.pic = v;
  }, 500);
  return { etat, arreter: () => { etat.actif = false; clearInterval(t); } };
}
const mo = (o) => (o / 1048576).toFixed(0);

// Valeur de la série la plus proche d'un instant donné.
function au(serie, ms) {
  let meilleur = null, ecart = Infinity;
  for (const [t, v] of serie) { const e = Math.abs(t - ms); if (e < ecart) { ecart = e; meilleur = v; } }
  return meilleur;
}
// Grille de 30 s pendant l'encodage, puis relevés de relâche après la fin.
function grille(etat, base) {
  const finEnc = etat.fin_encodage_ms;
  const pendant = [], apres = [];
  for (let t = 30000; t <= finEnc; t += 30000) {
    const v = au(etat.serie, t);
    if (v !== null) pendant.push({ t_s: Math.round(t / 1000), rss: v, ecart: v - base });
  }
  for (let d = 15000; d <= RELACHE_MS; d += 15000) {
    const v = au(etat.serie, finEnc + d);
    if (v !== null) apres.push({ apres_s: Math.round(d / 1000), rss: v, ecart: v - base });
  }
  return { pendant, apres };
}
// Pente en Mo par minute sur la grille de 30 s, par moindres carrés. Une pente proche de zéro
// avec un pic en début d'export décrit un pic ; une pente soutenue décrit une accumulation.
function pente(pts) {
  const n = pts.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of pts) { const x = p.t_s / 60, y = p.ecart / 1048576; sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const d = n * sxx - sx * sx;
  if (d === 0) return null;
  return +(((n * sxy - sx * sy) / d)).toFixed(1);
}
function afficherMemoire(etat, base, etiquette) {
  const g = grille(etat, base);
  console.log('    mémoire résidente   : ' + mo(base) + ' Mo avant, pic ' + mo(etat.pic)
    + ' Mo, soit +' + mo(Math.max(0, etat.pic - base)) + ' Mo   (' + etat.n + ' échantillons à 500 ms)');
  console.log('    toutes les 30 s pendant l\'encodage (écart par rapport à l\'avant) :');
  let l = '      ';
  for (const p of g.pendant) {
    l += p.t_s + 's +' + mo(p.ecart) + '  ';
    if (l.length > 92) { console.log(l); l = '      '; }
  }
  if (l.trim()) console.log(l);
  const pm = pente(g.pendant);
  console.log('    pente pendant l\'encodage : ' + (pm === null ? 'trop peu de points' : (pm >= 0 ? '+' : '') + pm + ' Mo par minute'));
  console.log('    après la fin de l\'encodage : '
    + g.apres.map((p) => '+' + p.apres_s + 's +' + mo(p.ecart) + ' Mo').join('   '));
  if (g.apres.length) {
    const fin = g.apres[g.apres.length - 1].ecart;
    const pc = etat.pic - base > 0 ? Math.round(100 * fin / (etat.pic - base)) : 0;
    console.log('    60 s après : ' + pc + ' % de l\'écart maximal est encore détenu.');
  }
  return { grille: g, pente_mo_par_min: pm };
}

async function wd(methode, chemin, corps) {
  const r = await fetch('http://127.0.0.1:' + PORT_WD + chemin, {
    method: methode, headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const j = JSON.parse(await r.text());
  if (j && j.value && j.value.error) throw new Error(j.value.error + ' — ' + (j.value.message || '').slice(0, 160));
  return j && j.value;
}

function afficherContrePression(c) {
  if (!c) { console.log('    contre-pression     : non remontée par la page'); return; }
  console.log('    file de l\'encodeur  : ' + (c.file_lisible
    ? 'lisible, maximum observé ' + c.file_max + ' (plafond imposé ' + c.plafond + ')'
    : 'NON LISIBLE dans cette version de Mediabunny — notre barrière n\'a pu être appliquée'));
  console.log('    attente dans add()  : ' + (c.attente_add_ms / 1000).toFixed(1) + ' s au total sur '
    + 'l\'encodage, ' + c.adds_bloquants + ' images bloquantes, maximum ' + c.attente_add_max_ms.toFixed(0) + ' ms');
  console.log('    barrière explicite  : ' + c.barriere_declenchee + ' déclenchements, '
    + (c.attente_barriere_ms / 1000).toFixed(1) + ' s d\'attente, ' + c.barriere_abandons + ' abandons');
}
function afficherJournal(j) {
  if (!j || !j.length) return;
  const avecTas = j.some((x) => x.tas_js_octets !== null);
  console.log('    journal interne, toutes les 30 s (images écrites' + (avecTas ? ', tas JS' : '') + ') :');
  let l = '      ';
  for (const p of j) {
    l += p.t_s + 's ' + p.images + (avecTas && p.tas_js_octets !== null ? '/' + mo(p.tas_js_octets) + 'Mo' : '') + '  ';
    if (l.length > 92) { console.log(l); l = '      '; }
  }
  if (l.trim()) console.log(l);
}

(async () => {
  if (!fs.existsSync(path.join(PAQUET, PAGE))) {
    console.error('page absente : ' + PAGE); process.exit(1);
  }
  const { serveur, port } = await servir();
  const url = 'http://127.0.0.1:' + port + '/' + PAGE;
  const resultats = [];

  console.log('EXPORT DE 15 MINUTES EN CADENCE CONSTANTE — 60 diapositives, fondus de 0,4 s');
  console.log('  27 000 images attendues (900 s à 30 i/s). Limite de conception, donc mesurée.');
  console.log('  Mémoire résidente échantillonnée toutes les 500 ms depuis l\'extérieur du');
  console.log('  navigateur, restituée sur une grille de 30 s, et suivie 60 s après la fin.');
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
    const r = await page.evaluate((p) => window.__exportLongApi.exporterLong(p), PLAN, { timeout: 0 });
    const murs = Date.now() - t0;
    ech.etat.fin_encodage_ms = Date.now() - t0;   // la série démarre avec l'échantillonneur
    await new Promise((ok) => setTimeout(ok, RELACHE_MS));
    ech.arreter();
    console.log('  Chrome installé');
    console.log('    images écrites      : ' + r.images_ecrites);
    console.log('    durée d\'encodage    : ' + (r.duree_encodage_ms / 1000).toFixed(1) + ' s'
      + '   (horloge extérieure ' + (murs / 1000).toFixed(1) + ' s)');
    console.log('    poids               : ' + (r.octets / 1048576).toFixed(1) + ' Mo');
    console.log('    pic du tas JS       : ' + (r.tas_js_disponible ? (r.pic_tas_js_octets / 1048576).toFixed(1) + ' Mo' : 'indisponible'));
    afficherContrePression(r.contre_pression);
    const m = afficherMemoire(ech.etat, base, 'Chrome');
    afficherJournal(r.journal_30s);
    resultats.push(Object.assign({ navigateur: 'Chrome installé', murs_ms: murs,
      rss_avant: base, rss_pic: ech.etat.pic, echantillons: ech.etat.n,
      rss_grille_30s: m.grille, rss_pente_mo_par_min: m.pente_mo_par_min }, r));
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
    await wd('POST', '/session/' + session + '/timeouts', { script: 1800000 });
    await wd('POST', '/session/' + session + '/url', { url });
    const ech = echantillonneur(() => rssParNom(MOTIFS));
    const t0 = Date.now();
    const r = await wd('POST', '/session/' + session + '/execute/async', {
      script: 'var p = arguments[0], cb = arguments[1];'
            + 'window.__exportLongApi.exporterLong(p).then(cb).catch(function (e) { cb({ erreur: String(e && e.message || e) }); });',
      args: [PLAN],
    });
    const murs = Date.now() - t0;
    ech.etat.fin_encodage_ms = murs;
    await new Promise((ok) => setTimeout(ok, RELACHE_MS));
    ech.arreter();
    console.log('  Safari ' + (v.capabilities && v.capabilities.browserVersion) + ' réel');
    if (r && r.erreur) { console.log('    ÉCHEC DE L\'EXPORT : ' + r.erreur); }
    else {
      console.log('    images écrites      : ' + r.images_ecrites);
      console.log('    durée d\'encodage    : ' + (r.duree_encodage_ms / 1000).toFixed(1) + ' s'
        + '   (horloge extérieure ' + (murs / 1000).toFixed(1) + ' s)');
      console.log('    poids               : ' + (r.octets / 1048576).toFixed(1) + ' Mo');
      console.log('    pic du tas JS       : ' + (r.tas_js_disponible ? (r.pic_tas_js_octets / 1048576).toFixed(1) + ' Mo' : 'performance.memory absent de Safari'));
      afficherContrePression(r.contre_pression);
      const m = afficherMemoire(ech.etat, baseSafari, 'Safari');
      afficherJournal(r.journal_30s);
      console.log('    LIMITE : le total inclut les autres onglets de Safari déjà ouverts ; seul');
      console.log('    l\'écart est attribuable à l\'export, et même lui approximativement.');
      resultats.push(Object.assign({ navigateur: 'Safari réel', murs_ms: murs,
        rss_avant: baseSafari, rss_pic: ech.etat.pic, echantillons: ech.etat.n,
        rss_grille_30s: m.grille, rss_pente_mo_par_min: m.pente_mo_par_min }, r));
    }
    if (r && r.erreur) resultats.push({ navigateur: 'Safari réel', erreur: r.erreur });
  } catch (e) { console.log('  Safari : ÉCHEC — ' + String(e.message).slice(0, 200)); }
  finally {
    if (session) { try { await wd('DELETE', '/session/' + session); } catch (e) {} }
    pilote.kill();
  }
  serveur.close();
  fs.mkdirSync(MESURES, { recursive: true });
  fs.writeFileSync(path.join(MESURES, 'export-long-15min.json'),
    JSON.stringify({ plan: '60 diapositives, fondus 0,4 s, 30 i/s, 900 s', relache_ms: RELACHE_MS, resultats }, null, 2), 'utf8');
  console.log('');
  console.log('relevé : mesures/export-long-15min.json');
  // Le relevé précédent est resté suspendu sur un processus résiduel jusqu'à la limite de
  // temps de la tâche de fond, après avoir pourtant tout imprimé. On sort explicitement.
  process.exit(0);
})();
