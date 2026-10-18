// LE ZIP DU BANC CONTRE CELUI DE L'OUTIL PROVISOIRE (lot 2B, point 2.8).
//
// CE QUE CE SCRIPT MESURE, ET CE QU'IL NE PRÉTEND PAS. Il n'affirme pas que les deux zips sont
// identiques : il les COMPARE sur la même présentation synthétique et DIT les écarts, entrée par
// entrée et colonne par colonne. C'est une mesure, pas un contrôle : rien n'y est exigé, tout y
// est relevé, et c'est ce relevé qui dit si l'outil provisoire peut être rangé.
//
//   NODE_PATH=<playwright> node tests/comparer-zip-et-planche.cjs
const { chromium } = require('playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DIX_NEUF_ETAPES } = require('./chutier-fixtures.cjs');

const RACINE = path.join(__dirname, '..');
const OUTIL = path.join(os.homedir(), 'Downloads', 'planche-vers-zip.py');
const RACINE_ZIP = 'images-presentation-par-etape';
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

function lire(fichier) {
  const programme = `
import json, hashlib, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
out = {"mauvais": z.testzip(), "entrees": []}
for i in z.infolist():
    d = z.read(i.filename)
    out["entrees"].append({"nom": i.filename, "octets": len(d), "methode": i.compress_type,
                           "comprime": i.compress_size,
                           "sha256": hashlib.sha256(d).hexdigest()})
print(json.dumps(out))
`;
  return JSON.parse(execFileSync('/usr/bin/python3', ['-I', '-c', programme, fichier],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }));
}

function csvDe(zipFichier, dossier) {
  execFileSync('/usr/bin/unzip', ['-q', '-o', zipFichier, '-d', dossier]);
  return fs.readFileSync(path.join(dossier, RACINE_ZIP, 'index.csv'), 'utf8').trim().split('\n');
}

(async () => {
  if (!fs.existsSync(OUTIL)) {
    console.error('Outil provisoire absent : ' + OUTIL);
    process.exit(2);
  }
  execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' });
  const { serveur, port } = await servir();
  const navigateur = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comparer-'));
  try {
    const ctx = await navigateur.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    const recus = [];
    page.on('download', async (d) => {
      const dest = path.join(temp, d.suggestedFilename());
      await d.saveAs(dest);
      recus.push({ nom: d.suggestedFilename(), chemin: dest });
    });
    await page.goto('http://127.0.0.1:' + port + '/banc-chutier/chutier.html');
    await page.waitForSelector('#banc-chutier', { timeout: 15000 });
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');

    const json = path.join(temp, 'dix-neuf.json');
    fs.writeFileSync(json, JSON.stringify(DIX_NEUF_ETAPES));
    await page.setInputFiles('#bc-fichier', json);
    await page.waitForFunction(() => /19 étapes|19 etapes/.test(document.getElementById('bc-etat').textContent),
      { timeout: 20000 });
    await page.selectOption('#bc-format', 'image/jpeg');
    await page.click('#bc-rendre');
    await page.waitForFunction(() => !document.getElementById('bc-zip').disabled, { timeout: 240000 });

    // LES DEUX SORTIES DU MÊME RENDU : le zip du banc, et la planche que l'outil lira.
    await page.click('#bc-zip');
    await page.waitForFunction(() => /zip (écrit|ecrit)/i.test(document.getElementById('bc-etat').textContent),
      { timeout: 240000 });
    await page.waitForTimeout(800);
    await page.click('#bc-planche');
    await page.waitForFunction(() => /planche/i.test(document.getElementById('bc-etat').textContent)
      && !/planche : image/i.test(document.getElementById('bc-etat').textContent), { timeout: 240000 });
    await page.waitForTimeout(1500);

    const zipBanc = recus.find((r) => r.nom.endsWith('.zip'));
    const planche = recus.find((r) => r.nom.endsWith('.html'));
    if (!zipBanc) throw new Error('aucun zip reçu du banc');
    if (!planche) throw new Error('aucune planche reçue : ' + JSON.stringify(recus.map((r) => r.nom)));

    // L'OUTIL PROVISOIRE, SUR LA MÊME PLANCHE.
    const sortieOutil = path.join(temp, 'outil');
    fs.mkdirSync(sortieOutil, { recursive: true });
    const journal = execFileSync('/usr/bin/python3', ['-I', OUTIL, planche.chemin, sortieOutil],
      { encoding: 'utf8' });
    const zipOutil = fs.readdirSync(sortieOutil).filter((f) => f.endsWith('.zip'))
      .map((f) => path.join(sortieOutil, f))[0];
    if (!zipOutil) throw new Error('l\'outil n\'a produit aucun zip :\n' + journal);

    const a = lire(zipBanc.chemin);
    const b = lire(zipOutil);
    const dA = fs.mkdtempSync(path.join(temp, 'a-')), dB = fs.mkdtempSync(path.join(temp, 'b-'));
    const csvA = csvDe(zipBanc.chemin, dA), csvB = csvDe(zipOutil, dB);

    console.log('\n── CE QUI EST COMPARÉ ────────────────────────────────────────────────────────');
    console.log('  banc  : ' + path.basename(zipBanc.chemin) + '  ('
      + Math.round(fs.statSync(zipBanc.chemin).size / 1024) + ' Ko, ' + a.entrees.length + ' entrées)');
    console.log('  outil : ' + path.basename(zipOutil) + '  ('
      + Math.round(fs.statSync(zipOutil).size / 1024) + ' Ko, ' + b.entrees.length + ' entrées)');

    console.log('\n── LES NOMS ──────────────────────────────────────────────────────────────────');
    const nomsA = a.entrees.map((e) => e.nom), nomsB = b.entrees.map((e) => e.nom);
    const manquants = nomsA.filter((x) => nomsB.indexOf(x) < 0);
    const enTrop = nomsB.filter((x) => nomsA.indexOf(x) < 0);
    console.log('  identiques : ' + (JSON.stringify(nomsA) === JSON.stringify(nomsB) ? 'OUI' : 'non'));
    if (manquants.length) console.log('  absents du zip de l\'outil : ' + manquants.join(', '));
    if (enTrop.length) console.log('  en trop dans le zip de l\'outil : ' + enTrop.join(', '));

    console.log('\n── LES IMAGES, OCTET POUR OCTET ──────────────────────────────────────────────');
    let memes = 0, differentes = 0;
    const ecarts = [];
    a.entrees.filter((e) => !e.nom.endsWith('.csv')).forEach((e) => {
      const autre = b.entrees.find((x) => x.nom === e.nom);
      if (!autre) return;
      if (autre.sha256 === e.sha256) memes++;
      else {
        differentes++;
        ecarts.push({ nom: e.nom, banc: e.octets, outil: autre.octets });
      }
    });
    console.log('  identiques : ' + memes + ' · différentes : ' + differentes);
    if (ecarts.length) {
      const pA = ecarts.reduce((t, x) => t + x.banc, 0), pB = ecarts.reduce((t, x) => t + x.outil, 0);
      console.log('  poids des images différentes : banc ' + Math.round(pA / 1024)
        + ' Ko, outil ' + Math.round(pB / 1024) + ' Ko ('
        + (pB / pA * 100 - 100).toFixed(1) + ' %)');
      console.log('  trois exemples : ' + ecarts.slice(0, 3)
        .map((x) => x.nom.split('/').pop() + ' ' + x.banc + ' contre ' + x.outil + ' octets').join(' · '));
    }

    console.log('\n── LA MÉTHODE DE COMPRESSION ─────────────────────────────────────────────────');
    const mA = [...new Set(a.entrees.map((e) => e.methode))];
    const mB = [...new Set(b.entrees.map((e) => e.methode))];
    const nom = (m) => (m === 0 ? 'stockée' : m === 8 ? 'dégonflée' : 'méthode ' + m);
    console.log('  banc  : ' + mA.map(nom).join(', '));
    console.log('  outil : ' + mB.map(nom).join(', '));

    console.log('\n── L\'INDEX ───────────────────────────────────────────────────────────────────');
    console.log('  en-tête banc  : ' + csvA[0]);
    console.log('  en-tête outil : ' + csvB[0]);
    console.log('  en-têtes identiques : ' + (csvA[0] === csvB[0] ? 'OUI' : 'non'));
    console.log('  lignes : banc ' + (csvA.length - 1) + ', outil ' + (csvB.length - 1));
    let lignesPareilles = 0;
    const diffsLignes = [];
    for (let i = 1; i < Math.min(csvA.length, csvB.length); i++) {
      if (csvA[i] === csvB[i]) lignesPareilles++;
      else if (diffsLignes.length < 3) diffsLignes.push({ i, a: csvA[i], b: csvB[i] });
    }
    console.log('  lignes identiques : ' + lignesPareilles + ' sur ' + (csvA.length - 1));
    diffsLignes.forEach((d) => {
      const ca = d.a.split(';'), cb = d.b.split(';');
      const colonnes = csvA[0].split(';');
      const quoi = colonnes.map((c, k) => (ca[k] === cb[k] ? null : c + ' : « ' + ca[k]
        + ' » contre « ' + cb[k] + ' »')).filter(Boolean);
      console.log('    ligne ' + d.i + ' — ' + quoi.join(' | '));
    });
    console.log('\n' + journal.trim().split('\n').map((l) => '  outil> ' + l).join('\n'));
  } finally {
    await navigateur.close();
    serveur.close();
  }
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
