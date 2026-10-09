// LA RÉPARTITION DES MOTS SUR UNE VRAIE PRÉSENTATION — sans aucun appel au modèle.
//
// Le calcul est entièrement local : il ne dépend que du document. Ce script le montre étape par
// étape, pour que Christophe juge les cibles avant qu'un seul jeton soit dépensé.
//
// Il lit un export autonome depuis banc-chutier/entrees/ — dossier ignoré par git. Rien de ce
// qu'il lit n'entre dans le dépôt, et il n'écrit aucun fichier.
//
//   NODE_PATH=<playwright> node tests/mesure-repartition-reelle.cjs [minutes]
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const RACINE = path.join(__dirname, '..');
const ENTREES = path.join(RACINE, 'banc-chutier', 'entrees');
const MINUTES = Number(process.argv[2] || 8);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
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

// Appariement d'accolades qui respecte les chaînes : une recherche naïve de la dernière
// accolade couperait au premier « } » d'un texte de diapositive.
function extraireObjet(source, nom) {
  const depart = source.indexOf(nom);
  if (depart === -1) return null;
  let i = source.indexOf('{', depart), p = 0, chaine = null;
  const echap = String.fromCharCode(92);
  for (let j = i; j < source.length; j++) {
    const c = source[j];
    if (chaine) { if (c === echap) { j++; continue; } if (c === chaine) chaine = null; continue; }
    if (c === '"' || c === "'") { chaine = c; continue; }
    if (c === '{') p++;
    else if (c === '}') { p--; if (p === 0) return source.slice(i, j + 1); }
  }
  return null;
}

(async () => {
  if (!fs.existsSync(ENTREES)) { console.error('Aucun dossier ' + ENTREES); process.exit(1); }
  const fichiers = fs.readdirSync(ENTREES).filter((f) => /\.html?$/i.test(f)).sort();
  if (!fichiers.length) { console.error('Aucun export dans ' + ENTREES); process.exit(1); }

  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const sorties = [];
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === '127.0.0.1' && u.port === String(port)) return route.continue();
      sorties.push(u.hostname);
      return route.abort();
    });
    await page.addInitScript(() => {
      try { localStorage.setItem('workerApiKey', 'cle-de-test-sans-valeur'); } catch (e) {}
    });
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => window.NarrationIA && window.adocPresentStepList);

    for (const f of fichiers) {
      const texte = fs.readFileSync(path.join(ENTREES, f), 'utf8');
      const brut = extraireObjet(texte, 'window.ADOC_EXPORT_DOC');
      if (!brut) { console.log('— ' + f + ' : pas de document embarqué, ignoré\n'); continue; }
      const doc = JSON.parse(brut);
      if (doc.documentKind !== 'presentation') continue;

      const r = await page.evaluate(({ d, min }) => {
        const A = window.NarrationIA;
        const etapes = A.contenuParEtape(d);
        const rep = A.repartirMots(etapes, min);
        const titres = {};
        etapes.forEach((e) => { titres[e.stepId] = e; });
        return {
          rep, etapes: etapes.length,
          lignes: rep.cibles.map((c) => ({
            stepId: c.stepId, type: c.type, motsBloc: c.mots_du_bloc, poids: c.poids, cible: c.mots,
            carte: titres[c.stepId].cardTitle, rang: titres[c.stepId].rang,
            surRang: titres[c.stepId].surRang,
            secondes: Math.round(c.mots / 2.5),
            extrait: (titres[c.stepId].texte || '').replace(/\s+/g, ' ').slice(0, 44),
          })),
          poidsType: A.POIDS_TYPE, min: A.MOTS_MIN_ETAPE, max: A.MOTS_MAX_ETAPE,
        };
      }, { d: doc, min: MINUTES });

      console.log('═'.repeat(100));
      console.log('« ' + doc.title + ' »');
      console.log((doc.blocks || []).filter((b) => b.type === 'card').length + ' diapositives, '
        + r.etapes + ' étapes  —  durée visée ' + MINUTES + ' min, soit ' + r.rep.total_vise + ' mots\n');
      console.log('  diapositive / étape          type           mots du bloc   poids   CIBLE   durée   contenu');
      let carte = null;
      r.lignes.forEach((l) => {
        if (l.carte !== carte) { carte = l.carte; console.log('  ── ' + carte); }
        console.log('    étape ' + String(l.rang + '/' + l.surRang).padEnd(6)
          + l.type.padEnd(16)
          + String(l.motsBloc).padStart(8)
          + String(l.poids).padStart(10)
          + String(l.cible).padStart(8) + ' mots'
          + String(l.secondes + ' s').padStart(7) + '   '
          + l.extrait);
      });
      console.log('\n  total réparti : ' + r.rep.total_reparti + ' mots pour ' + r.rep.total_vise
        + ' visés  —  ' + Math.round(r.rep.duree_estimee_s / 60 * 10) / 10 + ' min');
      console.log('  atteignable : ' + (r.rep.atteignable ? 'OUI'
        : 'NON (' + r.rep.limite + ' — ' + r.rep.bornees + ' étape(s) bornée(s))'));
      console.log('  bornes : ' + r.min + ' à ' + r.max + ' mots par étape');
      console.log('  poids par type : ' + Object.entries(r.poidsType)
        .map(([k, v]) => k + ' ' + v).join(', ') + '\n');
    }
    console.log('sorties réseau pendant la mesure : ' + (sorties.length
      ? Array.from(new Set(sorties)).join(', ') + ' (démarrage de l\'application)' : 'aucune'));
    console.log('AUCUN appel au modèle : le calcul est entièrement local.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('ÉCHEC : ' + e.message); process.exit(1); });
