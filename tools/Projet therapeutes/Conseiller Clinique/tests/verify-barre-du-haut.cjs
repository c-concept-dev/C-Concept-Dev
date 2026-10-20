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
// Les deux états de la barre. L'état ENREGISTRÉ est le plus chargé : il ajoute « Supprimer »
// et allonge « Enregistrer » en « Nouvelle version ». C'est lui qui décide de la hauteur.
const ETATS = [{ nom: 'non enregistré', enregistre: false }, { nom: 'enregistré', enregistre: true }];

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
               'cc-ws-texte-word-btn', 'cc-ws-texte-diapositives-btn', 'cc-ws-export-pdf-carrousel-btn',
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
       for (const etat of ETATS) {
        const ctx = await nav.newContext({ viewport: { width: largeur, height: 900 } });
        const page = await ctx.newPage();
        await page.route('**/*', (route) => {
          const u = route.request().url();
          return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
            ? route.continue() : route.abort();
        });
        await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
        await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
        const ouvert = await page.evaluate(async (a) => {
          const cle = 'barre-essai';
          window._adocArtifacts = window._adocArtifacts || {};
          const art = { name: a.d.title, _adocGenerationEngine: 'structured',
            _adocStructuredDoc: JSON.parse(JSON.stringify(a.d)), _adocStructuredSnapshot: null,
            _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
              blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
          // ── L'ÉTAT ENREGISTRÉ S'OBTIENT PAR L'ÉTAT, PAS PAR LE LIBELLÉ ────────────────
          // Ce contrôle a d'abord « simulé » l'état enregistré en réécrivant le texte du
          // bouton. C'était un trompe-l'œil : le libellé changeait, mais l'application, elle,
          // restait dans l'état NON enregistré — et le bouton « Supprimer », qui n'apparaît
          // que lorsqu'un document a été enregistré, restait caché. La barre la plus chargée
          // n'a donc jamais été mesurée. On marque maintenant l'artefact comme l'application
          // le marque (`_adocClinicalDocumentId`) et c'est elle qui en déduit le libellé long
          // ET le bouton supplémentaire.
          if (a.enregistre) { art._adocClinicalDocumentId = 'document-synthetique-0001'; art._ccEditorDirty = false; }
          window._adocArtifacts[cle] = art;
          return !!(await window.adocOpenWorkspace(cle));
        }, { d: doc, enregistre: etat.enregistre });
        assert.ok(ouvert, kind + ' ' + etat.nom + ' à ' + largeur + ' px : le document doit s\'ouvrir');
        await page.waitForTimeout(250);
        // Le libellé long et le bouton « Supprimer » doivent venir de l'application elle-même :
        // si cette précondition tombe, l'état mesuré n'est pas celui qu'on croit.
        if (etat.enregistre) {
          const reel = await page.evaluate(() => ({
            libelle: (document.querySelector('#cc-ws-save-btn span') || {}).textContent || '',
            infobulle: (document.getElementById('cc-ws-save-btn') || {}).title || '',
            supprimerVisible: (() => { const b = document.getElementById('cc-ws-delete-btn');
              if (!b) return false; const r = b.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none'; })() }));
          // Q7 (lot 2D-0a) — le libellé est « Enregistrer » dans tous les cas ; c'est l'INFOBULLE
          // qui dit désormais si le document est déjà enregistré. La précondition de ce
          // contrôle — mesurer la barre dans son état le plus chargé — est inchangée.
          assert.ok(/la version précédente reste conservée/.test(reel.infobulle || ''),
            kind + ' ' + etat.nom + ' à ' + largeur + ' px : l\'infobulle doit dire que le document est déjà enregistré ; vue « ' + reel.infobulle + ' »');
          assert.ok(reel.supprimerVisible,
            kind + ' à ' + largeur + ' px, état enregistré : « Supprimer » doit être visible, sinon l\'état n\'est pas celui qu\'on mesure');
        }

        const vu = await page.evaluate((ordre) => {
          const barre = document.querySelector('.cc-ws-topbar');
          const r = barre.getBoundingClientRect();
          const lignePx = parseFloat(getComputedStyle(barre).fontSize) * 1.4;
          const boutons = [...barre.querySelectorAll('button')].map((b) => {
            const bb = b.getBoundingClientRect();
            const sp = b.querySelector('span');
            const hs = sp ? sp.getBoundingClientRect().height : 0;
            const hl = sp ? parseFloat(getComputedStyle(sp).lineHeight) || lignePx : lignePx;
            const st = getComputedStyle(b);
            // ── UNE SEULE DÉFINITION DE « VISIBLE », ET ELLE MESURE ────────────────────
            // L'attribut `hidden` ne suffit pas : le bouton des sources est masqué par une
            // CLASSE (`display: none`), donc son cadre fait 0 × 0 et son `top` vaut 0. Compté
            // comme visible, il ajoutait une RANGÉE FANTÔME à l'ordonnée zéro — la barre
            // faisait deux rangées de 80 px et le contrôle en annonçait trois. C'est la
            // deuxième fois dans ce contrôle que `hidden` m'a trompé : la définition vit
            // désormais ici, une fois, et tout le reste s'en sert.
            return { id: b.id,
                     cache: !!b.hidden || bb.width === 0 || bb.height === 0
                            || st.display === 'none' || st.visibility === 'hidden',
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
          kind + ' ' + etat.nom + ' à ' + largeur + ' px : la barre ne doit pas défiler horizontalement, '
          + vu.defilement + ' px de trop');
        // ── 2. TOUT BOUTON VISIBLE A SON CADRE ENTIÈREMENT DANS LA FENÊTRE ───────────────
        const dehors = vu.boutons.filter((b) => !b.cache
          && (b.droite > vu.fenetre + 1 || b.gauche < -1));
        assert.deepEqual(dehors.map((b) => b.id + ' (droite ' + b.droite + ' > ' + vu.fenetre + ')'), [],
          kind + ' ' + etat.nom + ' à ' + largeur + ' px : un bouton dépasse la fenêtre');
        // ── 3. AUCUN LIBELLÉ SUR PLUS DE DEUX LIGNES ─────────────────────────────────────
        const trop = vu.boutons.filter((b) => !b.cache && b.lignes > 2);
        assert.deepEqual(trop.map((b) => b.id + ' : ' + b.lignes + ' lignes (« ' + b.libelle + ' »)'), [],
          kind + ' ' + etat.nom + ' à ' + largeur + ' px : un libellé dépasse deux lignes');
        // ── 4. L'ORDRE N'A PAS CHANGÉ ────────────────────────────────────────────────────
        const attendu = ORDRE.filter((id) => vu.ordreDocument.indexOf(id) >= 0);
        assert.deepEqual(vu.ordreDocument, attendu,
          kind + ' ' + etat.nom + ' à ' + largeur + ' px : l\'ordre des boutons a changé');

        // ── LA HAUTEUR ET LE NOMBRE DE LIGNES, SELON LA LARGEUR ─────────────────────────
        // Objectif de Christophe : DEUX lignes au plus et QUATRE-VINGTS pixels au plus dès
        // 1 200 px de large ; trois lignes restent acceptables sous 1 000 px, où la place
        // manque vraiment.
        const visibles0 = vu.boutons.filter((b) => !b.cache);
        // ── COMPTER LES RANGÉES, PAS LES `top` DISTINCTS ────────────────────────────────
        // Mon premier compteur prenait les valeurs de `top` distinctes et annonçait TROIS
        // lignes là où il y en avait deux : dans une rangée centrée verticalement, une icône
        // de 20 px et un bouton de 30 px n'ont pas le même `top` (y = 12, 17, 18, 19 pour une
        // seule rangée, mesuré). On regroupe donc par CENTRE vertical, à la demi-hauteur de
        // bouton près — c'est ce qu'un œil appelle une ligne.
        const centres = visibles0.map((b) => (b.haut + b.bas) / 2).sort((a, b) => a - b);
        const rangees = [];
        centres.forEach((c) => {
          if (!rangees.length || c - rangees[rangees.length - 1] > 14) rangees.push(c);
        });
        const lignesBarre = rangees.length;
        if (process.env.BARRE_DETAIL) {
          console.log('        centres : ' + centres.map((c) => Math.round(c)).join(' ')
            + ' → rangées ' + rangees.map((c) => Math.round(c)).join(' ')
            + ' · hauteurs : ' + visibles0.map((b) => (b.bas - b.haut)).join(' '));
        }
        if (largeur >= 1200) {
          assert.ok(lignesBarre <= 2,
            kind + ' ' + etat.nom + ' à ' + largeur + ' px : deux lignes au plus, mesuré ' + lignesBarre);
          assert.ok(vu.barre.hauteur <= 80,
            kind + ' ' + etat.nom + ' à ' + largeur + ' px : 80 px au plus, mesuré ' + vu.barre.hauteur);
        } else {
          assert.ok(lignesBarre <= 3,
            kind + ' ' + etat.nom + ' à ' + largeur + ' px : trois lignes au plus, mesuré ' + lignesBarre);
        }
        console.log('      ' + kind + ' ' + etat.nom + ' à ' + largeur + ' px : ' + lignesBarre + ' ligne(s), '
          + vu.barre.hauteur + ' px, défilement ' + vu.defilement + ', bord droit à '
          + Math.max(...visibles0.map((b) => b.droite)) + ' pour ' + vu.fenetre);

        await ctx.close();
       }
      }
      pass('barre complète et jamais tronquée pour un ' + kind + ', à 1 024, 1 272 et 1 440 px, '
        + 'dans les deux états (non enregistré et enregistré, ce dernier portant « Supprimer »).');
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
