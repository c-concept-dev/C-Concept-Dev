// LOT IMAGES — la mesure à VRAI APPEL de l'embarquement des images dans l'export autonome.
//
// AUCUNE GÉNÉRATION : le document est RÉCUPÉRÉ depuis un export déjà produit (il y est embarqué
// sous ADOC_EXPORT_DOC). Seuls partent des appels /fetch-image et des téléchargements d'images —
// pas un jeton de modèle. C'est ce qui permet de mesurer sans repayer un cours de 3 h.
//
//   STUDIO_WORKER_API_KEY=... node tests/lot-b/mesure-images-export.cjs [--source=<fichier.html>]
//
// Adresse du Worker FIGÉE. Tout autre hôte que le Worker et les CDN d'images est bloqué et signalé.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const WORKER = 'https://clone-proxy.11drumboy11.workers.dev';
const CLE = (process.env.STUDIO_WORKER_API_KEY || '').trim();
if (!CLE || /[^\x20-\x7E]/.test(CLE) || /^[.…]+$/.test(CLE)) {
  console.error('Cle du Worker absente, incomplete ou non ASCII. AUCUN appel emis.'); process.exit(2);
}
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const SOURCE = path.resolve(__dirname, arg('source', 'cours-exporte.html'));
const ORIGINE = 'https://c-concept-dev.github.io';
const BASE = ORIGINE + '/C-Concept-Dev/tools/Projet%20therapeutes/Conseiller%20Clinique/';
const RACINE = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

// Le document, extrait de l'export existant. Analyse par comptage d'accolades : le JSON contient
// des accolades dans ses chaines, une expression reguliere gloutonne se tromperait.
function extraireDoc(fichier) {
  const h = fs.readFileSync(fichier, 'utf8');
  const marque = 'var ADOC_EXPORT_DOC = ';
  const i = h.indexOf(marque);
  if (i < 0) throw new Error('ADOC_EXPORT_DOC absent de ' + fichier);
  let j = h.indexOf('{', i), p = 0, dans = false, ech = false;
  for (let k = j; k < h.length; k++) {
    const c = h[k];
    if (ech) { ech = false; continue; }
    if (c === '\\') { ech = true; continue; }
    if (c === '"') { dans = !dans; continue; }
    if (dans) continue;
    if (c === '{') p++;
    else if (c === '}') { p--; if (!p) return { doc: JSON.parse(h.slice(j, k + 1)), koSource: Math.round(h.length / 1024) }; }
  }
  throw new Error('document non terminé dans ' + fichier);
}

const releve = { debut: new Date().toISOString(), source: path.basename(SOURCE), cas: [],
  hotesContactes: [], hotesBloques: [] };

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const { doc, koSource } = extraireDoc(SOURCE);
    console.log('Document repris de : ' + path.basename(SOURCE) + ' (' + koSource + ' Ko, '
      + (doc.blocks || []).length + ' diapositives, ' + ((doc.modules || []).length || 'aucun') + ' module(s))');
    try {
      releve.commit = require('node:child_process').execSync('git rev-parse --short HEAD', { cwd: RACINE, encoding: 'utf8' }).trim();
      const sale = require('node:child_process').execSync(
        'git status --porcelain -- studio-clinique-core.js tests/lot-b/mesure-images-export.cjs',
        { cwd: RACINE, encoding: 'utf8' }).trim();
      console.log('Code mesure : ' + releve.commit + (sale ? ' + NON COMMITE : ' + sale.replace(/\s+/g, ' ') : ' (arbre propre)'));
      releve.arbreModifie = !!sale;
    } catch (_) { releve.commit = '(inconnu)'; }

    // Une PRÉSENTATION SEULE et un COURS ASSEMBLÉ. La présentation est une TRANCHE du cours réel
    // (ses premières diapositives) : aucune génération n'est repayée, et c'est dit comme tel.
    const cartesPresentation = (doc.blocks || []).slice(0, 12);
    const cas = [
      { nom: 'presentation-seule', doc: Object.assign({}, doc, { blocks: cartesPresentation, modules: undefined,
          title: (doc.title || 'Presentation') + ' — extrait' }) },
      { nom: 'cours-assemble', doc: doc },
    ];

    const contactes = new Set(), bloques = new Set();
    for (const c of cas) {
      console.log('\n═══ ' + c.nom.toUpperCase() + ' — ' + (c.doc.blocks || []).length + ' diapositives ═══');
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.route('**/*', route => {
        const u = route.request().url();
        if (/^(data|blob|file):/.test(u)) return route.continue();
        if (u.startsWith(BASE)) {
          const rel = decodeURIComponent(u.slice(BASE.length).split('?')[0].split('#')[0]);
          try { return route.fulfill({ status: 200, body: fs.readFileSync(path.join(RACINE, rel)),
            contentType: TYPES[path.extname(rel).toLowerCase()] || 'application/octet-stream' }); }
          catch (e) { console.error('  fichier local illisible : ' + rel); return route.abort(); }
        }
        if (u.startsWith(WORKER) || /^https:\/\/(images\.pexels\.com|([a-z0-9-]+\.)?pixabay\.com|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com)\//.test(u)) {
          contactes.add(new URL(u).host); return route.continue();
        }
        try { bloques.add(new URL(u).host); } catch (_) { bloques.add(u.slice(0, 40)); }
        return route.abort();
      });
      await page.addInitScript(o => { try { localStorage.setItem('workerApiKey', o.c); localStorage.setItem('workerUrl', o.w); } catch (_) {} },
        { c: CLE, w: WORKER });
      await page.goto(BASE + 'studio-clinique.html');
      await page.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');

      // ── AVANT : le fichier tel qu'il était produit jusqu'ici ──
      const avant = await page.evaluate(async d => (await window.adocBuildStandalonePresentationHTML(d, { embedImages: false })).length, c.doc);

      // ── APRÈS : avec embarquement, chronométré ──
      console.log('  téléchargement des images…');
      const t0 = Date.now();
      const r = await page.evaluate(async d => {
        const html = await window.adocBuildStandalonePresentationHTML(d);
        return { octets: html.length, rapport: window._adocLastExportImageReport, html: html };
      }, c.doc);
      const secondes = (Date.now() - t0) / 1000;
      const fichier = path.join(__dirname, 'images-' + c.nom + '.html');
      fs.writeFileSync(fichier, r.html, 'utf8');
      await page.close();

      const ko = n => Math.round(n / 1024);
      console.log('  poids : ' + ko(avant) + ' Ko → ' + ko(r.octets) + ' Ko (+' + ko(r.octets - avant) + ' Ko)');
      console.log('  préparation : ' + secondes.toFixed(1) + ' s pour ' + r.rapport.requetes + ' requête(s), '
        + r.rapport.telecharges + ' téléchargée(s), ' + r.rapport.echecs.length + ' échec(s)');
      r.rapport.echecs.slice(0, 6).forEach(e => console.log('    échec : « ' + e.requete + ' » — ' + e.cause));

      // ── SÉCURITÉ : aucune clé dans le fichier ──
      // Cohérence du dictionnaire : autant d'aplats de repli DANS LE CACHE que d'échecs relevés.
      // Le compte par DIAPOSITIVE ne dit rien (une requête sert souvent plusieurs cartes) — c'est
      // au niveau de la requête que l'égalité doit tenir, sinon un repli s'est glissé sans cause.
      // Lu ICI, dans Node, sur la chaîne déjà rapatriée : la page est fermée à ce stade, et
      // l'interroger levait « Target page has been closed ».
      const repliesDansCache = (() => {
        const m = r.html.match(/window\.ADOC_EXPORT_IMAGES = ([\s\S]*?);\n/);
        if (!m) return null;
        try {
          const c = JSON.parse(m[1]);
          const cles = Object.keys(c);
          return { total: cles.length, replis: cles.filter(k => c[k].startsWith('data:image/svg')).length };
        } catch (e) { return null; }
      })();
      const hex64 = (r.html.match(/\b[0-9a-fA-F]{64}\b/g) || []);
      const cleDansLeFichier = r.html.includes(CLE);
      console.log('  dictionnaire : ' + (repliesDansCache ? repliesDansCache.total + ' entrée(s), dont '
        + repliesDansCache.replis + ' repli(s)' : 'ILLISIBLE'));
      console.log('  chaînes de 64 caractères hexadécimaux : ' + (hex64.length || 'aucune')
        + ' · la clé de session figure-t-elle dans le fichier ? ' + (cleDansLeFichier ? 'OUI — GRAVE' : 'non'));

      // ── OUVERTURE HORS LIGNE, LOCALSTORAGE VIDÉ ──
      const vue = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const sorties = [], erreursVue = [];
      vue.on('pageerror', e => erreursVue.push(e.message));
      await vue.route('**/*', route => {
        const u = route.request().url();
        if (/^file:/.test(u)) return route.continue();
        sorties.push(u.split('?')[0]); return route.abort();      // RÉSEAU TOTALEMENT COUPÉ
      });
      await vue.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
      const t1 = Date.now();
      await vue.goto('file://' + fichier);
      await vue.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'), null, { timeout: 90000 });
      const ouverture = Date.now() - t1;
      const bilan = { embarquee: 0, 'aplat SVG': 0, 'AUCUN src': 0, distante: 0 };
      let avecImage = 0;
      const total = (c.doc.blocks || []).length;
      for (let i = 0; i < total; i++) {
        const etats = await vue.evaluate(() => [...document.querySelectorAll('#cc-ws-present-slide-inner img')]
          .map(x => { const s = x.getAttribute('src');
            return !s ? 'AUCUN src' : s.startsWith('data:image/svg') ? 'aplat SVG' : s.startsWith('data:') ? 'embarquee' : 'distante'; }));
        if (etats.length) { avecImage++; etats.forEach(e => { bilan[e] = (bilan[e] || 0) + 1; }); }
        await vue.keyboard.press('ArrowRight');
        await vue.waitForTimeout(90);
      }
      const credits = await vue.evaluate(() => {
        const el = document.querySelector('.cc-ws-present-credits');
        return el ? el.textContent.trim() : null;
      });
      await vue.waitForTimeout(1500);
      const versWorker = sorties.filter(u => /workers\.dev/.test(u));
      console.log('  ouverture hors ligne : ' + ouverture + ' ms · ' + avecImage + ' diapositive(s) à image sur ' + total);
      console.log('  images : ' + JSON.stringify(bilan));
      console.log('  appels au Worker à l\'ouverture : ' + (versWorker.length || 'AUCUN')
        + (versWorker.length ? ' — ' + versWorker.slice(0, 3).join(', ') : ''));
      console.log('  crédits affichés : ' + (credits ? '« ' + credits + ' »' : 'AUCUN'));
      console.log('  erreurs de page : ' + (erreursVue.length ? erreursVue.join(' | ') : 'aucune'));
      await vue.close();

      releve.cas.push({ nom: c.nom, diapositives: total, koAvant: ko(avant), koApres: ko(r.octets),
        secondesPreparation: Number(secondes.toFixed(1)), rapport: r.rapport, hex64: hex64.length,
        cleDansLeFichier: cleDansLeFichier, dictionnaire: repliesDansCache,
        ouvertureMs: ouverture, diapositivesAvecImage: avecImage,
        bilanImages: bilan, appelsWorkerOuverture: versWorker, credits: credits, erreursVue: erreursVue });
    }
    releve.hotesContactes = [...contactes].sort();
    releve.hotesBloques = [...bloques].sort();
    releve.fin = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, 'resultats-images-export.json'), JSON.stringify(releve, null, 2));
    console.log('\nReleve : tests/lot-b/resultats-images-export.json (jamais commite)');
    console.log('Hotes contactes : ' + releve.hotesContactes.join(', '));
    if (releve.hotesBloques.length) console.log('HOTES BLOQUES : ' + releve.hotesBloques.join(', '));
    // Ce qui fait ECHOUER la mesure : les garanties du lot, jamais un CDN qui a bronché sur une
    // image. Un téléchargement raté est RAPPORTE et retombe proprement — c'est prévu. Mais si AUCUN
    // n'aboutit, le mecanisme n'a rien prouvé, et cela doit échouer.
    const griefs = [];
    releve.cas.forEach(c => {
      if (c.cleDansLeFichier) griefs.push(c.nom + ' : LA CLE DE SESSION FIGURE DANS LE FICHIER');
      if (c.hex64) griefs.push(c.nom + ' : ' + c.hex64 + ' chaîne(s) de 64 caractères hexadécimaux');
      if (c.appelsWorkerOuverture.length) griefs.push(c.nom + ' : ' + c.appelsWorkerOuverture.length + ' appel(s) au Worker à l\'ouverture');
      if (c.erreursVue.length) griefs.push(c.nom + ' : erreur de page à l\'ouverture');
      if (!c.dictionnaire) griefs.push(c.nom + ' : dictionnaire d\'images illisible dans le fichier');
      else {
        if (c.dictionnaire.total !== c.rapport.requetes) griefs.push(c.nom + ' : ' + c.dictionnaire.total
          + ' entrée(s) au dictionnaire pour ' + c.rapport.requetes + ' requête(s) — une requête manquante repartirait sur le réseau');
        if (c.dictionnaire.replis !== c.rapport.echecs.length) griefs.push(c.nom + ' : ' + c.dictionnaire.replis
          + ' repli(s) au dictionnaire pour ' + c.rapport.echecs.length + ' échec(s) relevé(s)');
      }
      if (c.rapport.requetes && !c.rapport.telecharges) griefs.push(c.nom + ' : AUCUNE image téléchargée sur '
        + c.rapport.requetes + ' — le mécanisme n\'a rien prouvé');
      if (c.bilanImages.distante) griefs.push(c.nom + ' : ' + c.bilanImages.distante + ' image(s) encore distante(s)');
    });
    releve.griefs = griefs;
    console.log('\n' + (griefs.length ? '=== ' + griefs.length + ' POINT(S) EN ECHEC ===\n  - ' + griefs.join('\n  - ')
                                       : '=== TOUS LES POINTS VERIFIES ==='));
    const rate = griefs.length > 0;
    process.exitCode = rate ? 1 : 0;
  } catch (e) {
    console.error('\nECHEC : ' + (e && e.message));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
