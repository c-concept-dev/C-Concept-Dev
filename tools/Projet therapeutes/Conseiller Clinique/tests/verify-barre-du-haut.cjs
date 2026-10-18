// LA BARRE DU HAUT, MESURÉE SUR LA PAGE RÉELLE (lot 2C, 2.2 bis).
//
// CE QUI EST MESURÉ, ET NON DÉCLARÉ : pour chaque bouton de la barre, son CADRE est-il
// entièrement dans la fenêtre ? Christophe a constaté sur une capture que le dernier bouton
// était coupé à droite dans une fenêtre d'environ 1 270 px. On relève donc, à trois largeurs,
// la position de chaque bouton, la hauteur de son libellé en lignes, l'ordre, et le défilement
// horizontal de la barre.
//
//   NODE_PATH=<playwright> node tests/verify-barre-du-haut.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
const LARGEURS = [1024, 1272, 1440];

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

// L'ordre attendu, repris de la capture de Christophe. Ce sont les ids, donc l'ordre du DOCUMENT :
// un bouton déplacé dans la source se verrait ici.
// La place réservée de D7 est APRÈS « Exporter en JPEG » et avant « Exporter en PDF » : au
// milieu du groupe de sortie, entre deux exports. J'avais d'abord écrit cette liste avec le
// bouton un rang plus haut que là où je l'avais posé, et le contrôle d'ordre l'a dit — c'était
// la liste qui était fausse, pas le document.
const ORDRE = ['cc-ws-panel-toggle-btn', 'cc-ws-save-btn', 'cc-ws-save-as-btn', 'cc-ws-delete-btn',
               'cc-ws-transform-btn', 'cc-ws-export-btn', 'cc-ws-export-jpeg-btn',
               'cc-ws-texte-diapositives-btn', 'cc-ws-export-pdf-carrousel-btn',
               'cc-ws-export-pptx-carrousel-btn'];

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const { serveur, port } = await servir();
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    for (const kind of ['presentation', 'carrousel']) {
      const doc = JSON.parse(JSON.stringify(PRESENTATION));
      doc.documentKind = kind;
      for (const largeur of LARGEURS) {
        const ctx = await nav.newContext({ viewport: { width: largeur, height: 900 } });
        const page = await ctx.newPage();
        await page.route('**/*', (route) => {
          const u = route.request().url();
          return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
            ? route.continue() : route.abort();
        });
        await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
        await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
        const ouvert = await page.evaluate(async (d) => {
          const cle = 'barre-essai';
          window._adocArtifacts = window._adocArtifacts || {};
          window._adocArtifacts[cle] = { name: d.title, _adocGenerationEngine: 'structured',
            _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
            _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
              blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
          return !!(await window.adocOpenWorkspace(cle));
        }, doc);
        assert.ok(ouvert, kind + ' à ' + largeur + ' px : le document doit s\'ouvrir');
        // On force l'état « enregistré », qui est celui où le libellé long apparaissait.
        await page.evaluate(() => {
          const l = document.querySelector('#cc-ws-save-btn span');
          if (l) l.textContent = 'Nouvelle version';
        });
        await page.waitForTimeout(250);

        const vu = await page.evaluate((ordre) => {
          const barre = document.querySelector('.cc-ws-topbar');
          const r = barre.getBoundingClientRect();
          const lignePx = parseFloat(getComputedStyle(barre).fontSize) * 1.4;
          const boutons = [...barre.querySelectorAll('button')].map((b) => {
            const bb = b.getBoundingClientRect();
            const sp = b.querySelector('span');
            const hs = sp ? sp.getBoundingClientRect().height : 0;
            const hl = sp ? parseFloat(getComputedStyle(sp).lineHeight) || lignePx : lignePx;
            return { id: b.id, cache: !!b.hidden,
                     gauche: Math.round(bb.left), droite: Math.round(bb.right),
                     haut: Math.round(bb.top), bas: Math.round(bb.bottom),
                     lignes: hs ? Math.round(hs / hl) : 0,
                     libelle: (b.textContent || '').trim().slice(0, 40) };
          });
          return {
            barre: { gauche: Math.round(r.left), droite: Math.round(r.right),
                     hauteur: Math.round(r.height) },
            defilement: barre.scrollWidth - barre.clientWidth,
            fenetre: window.innerWidth,
            boutons: boutons,
            ordreDocument: boutons.map((b) => b.id).filter((id) => ordre.indexOf(id) >= 0),
          };
        }, ORDRE);

        // ── 1. AUCUN DÉFILEMENT HORIZONTAL ────────────────────────────────────────────────
        assert.ok(vu.defilement <= 1,
          kind + ' à ' + largeur + ' px : la barre ne doit pas défiler horizontalement, '
          + vu.defilement + ' px de trop');
        // ── 2. TOUT BOUTON VISIBLE A SON CADRE ENTIÈREMENT DANS LA FENÊTRE ───────────────
        const dehors = vu.boutons.filter((b) => !b.cache
          && (b.droite > vu.fenetre + 1 || b.gauche < -1));
        assert.deepEqual(dehors.map((b) => b.id + ' (droite ' + b.droite + ' > ' + vu.fenetre + ')'), [],
          kind + ' à ' + largeur + ' px : un bouton dépasse la fenêtre');
        // ── 3. AUCUN LIBELLÉ SUR PLUS DE DEUX LIGNES ─────────────────────────────────────
        const trop = vu.boutons.filter((b) => !b.cache && b.lignes > 2);
        assert.deepEqual(trop.map((b) => b.id + ' : ' + b.lignes + ' lignes (« ' + b.libelle + ' »)'), [],
          kind + ' à ' + largeur + ' px : un libellé dépasse deux lignes');
        // ── 4. L'ORDRE N'A PAS CHANGÉ ────────────────────────────────────────────────────
        const attendu = ORDRE.filter((id) => vu.ordreDocument.indexOf(id) >= 0);
        assert.deepEqual(vu.ordreDocument, attendu,
          kind + ' à ' + largeur + ' px : l\'ordre des boutons a changé');

        if (largeur === 1272) {
          const visibles = vu.boutons.filter((b) => !b.cache);
          const lignes = [...new Set(visibles.map((b) => b.haut))].length;
          console.log('      ' + kind + ' à ' + largeur + ' px : ' + visibles.length
            + ' boutons visibles sur ' + lignes + ' ligne(s), barre de ' + vu.barre.hauteur
            + ' px, défilement ' + vu.defilement + ', le plus à droite finit à '
            + Math.max(...visibles.map((b) => b.droite)) + ' pour ' + vu.fenetre + ' px de fenêtre');
        }
        await ctx.close();
      }
      pass('barre complète et jamais tronquée pour un ' + kind + ', à 1 024, 1 272 et 1 440 px.');
    }

    // ── 5. AUCUN BOUTON N'A PERDU SON ACTION ────────────────────────────────────────────
    // On les clique sur un document synthétique : ce qui compte est qu'une action PARTE (le
    // bouton n'est pas inerte), pas qu'elle aboutisse — le réseau est coupé.
    const ctx = await nav.newContext({ viewport: { width: 1272, height: 900 } });
    const page = await ctx.newPage();
    const appels = [];
    await page.route('**/*', (route) => {
      const u = route.request().url();
      return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
        ? route.continue() : route.abort();
    });
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    await page.evaluate(async (d) => {
      const cle = 'barre-essai';
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts[cle] = { name: d.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
      await window.adocOpenWorkspace(cle);
      // On instrumente les gestes de la barre : chaque fonction appelée est consignée, sans
      // être exécutée pour de vrai (aucun enregistrement, aucune suppression).
      window.__gestes = [];
      // LA LISTE EST CELLE DES `onclick` DE LA BARRE, RELEVÉE DANS LE DOCUMENT — pas une liste
      // écrite de mémoire. J'en avais oublié trois, et le contrôle a désigné les trois boutons
      // muets : « Présenter », « Exporter présentation interactive » et la fermeture. Pire, le
      // clic sur « Présenter » ouvrait POUR DE VRAI le mode plein écran, qui recouvrait ensuite
      // la barre et faisait échouer les clics suivants — un contrôle qui se saborde lui-même.
      [...document.querySelectorAll('.cc-ws-topbar button[onclick]')]
        .map((b) => (b.getAttribute('onclick') || '').replace(/^window\./, '').replace(/\(.*$/, ''))
        .filter((nom, i, a) => nom && a.indexOf(nom) === i).forEach((nom) => {
        if (typeof window[nom] === 'function') {
          window[nom] = function () { window.__gestes.push(nom); return false; };
        }
      });
    }, PRESENTATION);
    // LA VISIBILITÉ SE MESURE, elle ne se déduit pas de l'attribut `hidden` : le bouton des
    // sources est masqué par une CLASSE (`.cc-ws-panel-toggle { display: none }`, affordance
    // réservée aux écrans étroits), et mon premier filtre le comptait comme cliquable — d'où
    // quatre gestes attendus en trop. On relève donc le cadre et le style calculé, comme
    // ailleurs dans ce fichier.
    const cliquables = await page.evaluate(() =>
      [...document.querySelectorAll('.cc-ws-topbar button')].filter((b) => {
        const r = b.getBoundingClientRect();
        const st = getComputedStyle(b);
        return !b.hidden && r.width > 0 && r.height > 0
          && st.display !== 'none' && st.visibility !== 'hidden';
      }).map((b) => b.id));
    // UN CLIC À LA FOIS, ET ON DIT CE QUI S'EST PASSÉ POUR CHACUN : un contrôle qui compte
    // seulement les gestes dit « 4 sur 7 » sans désigner les trois manquants, ce qui ne sert à
    // personne. On relève donc, bouton par bouton, si le clic a abouti et quel geste est parti.
    const detail = [];
    for (const id of cliquables) {
      if (!id) continue;
      const avant = (await page.evaluate(() => window.__gestes.length));
      let clic = 'ok';
      await page.click('#' + id, { timeout: 5000 }).catch((e) => {
        clic = 'clic refusé : ' + String(e && e.message).split('\n')[0].slice(0, 70);
      });
      const apres = await page.evaluate(() => window.__gestes);
      detail.push({ id: id, clic: clic,
                    geste: apres.length > avant ? apres[apres.length - 1] : 'AUCUN',
                    onclick: await page.getAttribute('#' + id, 'onclick') });
    }
    const gestes = await page.evaluate(() => window.__gestes);
    detail.filter((d) => d.geste === 'AUCUN').forEach((d) => {
      console.log('      ' + d.id + ' : ' + d.clic + ' · onclick = ' + (d.onclick || 'AUCUN'));
    });
    await ctx.close();
    // UN GESTE PAR BOUTON VISIBLE, sans exception : un bouton qui ne déclenche rien a perdu son
    // action, et c'est exactement ce que ce contrôle doit attraper.
    assert.equal(gestes.length, cliquables.filter(Boolean).length,
      'un geste par bouton visible attendu : ' + cliquables.filter(Boolean).length + ' boutons, '
      + gestes.length + ' gestes — ' + JSON.stringify(gestes));
    console.log('      gestes partis au clic : ' + gestes.join(', '));
    pass('aucun bouton n\'a perdu son action : ' + gestes.length + ' gestes déclenchés sur '
      + cliquables.filter(Boolean).length + ' boutons visibles.');
  } finally {
    await nav.close();
    serveur.close();
  }
  console.log('\nPASS verify-barre-du-haut — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
