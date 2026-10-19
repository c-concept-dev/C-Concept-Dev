// D1 — OÙ LA PAGE VA SE POSER, ET DANS QUELS DOCUMENTS LE GESTE EXISTE.
//
// Ce contrôle est écrit AVANT le code qu'il juge, et il doit d'abord échouer.
//
// Ce qu'il mesure, et rien d'autre (D2 — la page créée par le Studio — est une autre étape) :
//
//   1. La cible est résolue depuis les TROIS façons dont une diapositive peut être sélectionnée :
//        a) le titre de la diapositive, convention `root:card-title:<id>` ;
//        b) la diapositive elle-même, `blockId = <id>` avec `zone: 'cover'` ;
//        c) un bloc de CONTENU à l'intérieur — on remonte alors à la diapositive qui le porte.
//      Les trois doivent désigner la MÊME diapositive et le même rang.
//
//   2. « avant » la première diapositive est ACCEPTÉ et donne le rang 0. La couverture du
//      document (titre, visée, public) n'est pas une diapositive : elle ne bouge pas, et la
//      nouvelle page devient la première DIAPOSITIVE. C'est la décision prise pour D1, et elle
//      est mesurée ici plutôt qu'affirmée.
//
//   3. Les gestes de page n'existent que pour une PRÉSENTATION : pour un carrousel ou un
//      document ancien, les boutons sont absents, et la fonction refuse avec une phrase claire.
//
//   NODE_PATH=<playwright> node tests/verify-insertion-page-cible.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const s = http.createServer((q, r) => {
    const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const port = s.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // ── CE QU'ON MESURE ICI, ET CE QU'ON NE DIT PAS ────────────────────────────────────────
  // L'application appelle son Worker au démarrage (bibliothèque, kits de marque). Ces appels
  // sont COUPÉS avant de partir. Une requête tentée puis coupée n'est pas une fuite ; une
  // RÉPONSE venue du dehors en serait une. On compte donc les réponses, et on se contente de
  // compter les tentatives.
  // Et l'on n'imprime JAMAIS ces adresses : une première version de ce contrôle recrachait
  // l'adresse du Worker de Christophe dans sa sortie d'échec, donc potentiellement dans un
  // rapport ou un journal. Seuls des nombres sortent d'ici.
  let tentativesDehors = 0;
  const reponsesDehors = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    tentativesDehors++; return route.abort();
  });
  page.on('response', (r) => {
    const u = r.url();
    if (!(u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))) {
      reponsesDehors.push(r.status());
    }
  });
  try {
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });

    const ouvrir = async (doc, moteur) => page.evaluate(async (a) => {
      const cle = 'cible-essai';
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts[cle] = { name: a.d.title, _adocGenerationEngine: a.moteur,
        _adocStructuredDoc: JSON.parse(JSON.stringify(a.d)), _adocStructuredSnapshot: null,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
      return !!(await window.adocOpenWorkspace(cle));
    }, { d: doc, moteur: moteur || 'structured' });

    // ── 1. LA FONCTION EXISTE ET RÉPOND AUX TROIS CONVENTIONS ──────────────────────────────
    assert.ok(await ouvrir(PRESENTATION), 'la présentation doit s\'ouvrir');
    const r1 = await page.evaluate(() => {
      if (typeof window.adocResolvePageInsertion !== 'function') return { absente: true };
      const art = window._adocArtifacts['cible-essai'];
      const doc = art._adocStructuredDoc;
      const essai = (blockId, zone, direction) => {
        try { const t = window.adocResolvePageInsertion(doc, blockId, zone, direction);
              return { carte: t.cardId, rang: t.index }; }
        catch (e) { return { refus: e && e.message }; }
      };
      const troisieme = doc.blocks[2];                 // card-03
      const blocDedans = troisieme.content.blocks[0];  // un bloc de CONTENU de cette carte
      return {
        parLeTitre:   essai('root:card-title:' + troisieme.id, null, 'after'),
        parLaCarte:   essai(troisieme.id, 'cover', 'after'),
        parUnContenu: essai(blocDedans.id, null, 'after'),
        avantLaCarte: essai('root:card-title:' + troisieme.id, null, 'before'),
        avantLaPremiere: essai('root:card-title:' + doc.blocks[0].id, null, 'before'),
        aLaFin:       essai('root:card-title:' + doc.blocks[0].id, null, 'end'),
        total: doc.blocks.length,
        idTroisieme: troisieme.id,
      };
    });
    assert.ok(!r1.absente, 'la fonction adocResolvePageInsertion doit exister (D1)');
    assert.deepEqual(r1.parLeTitre, { carte: r1.idTroisieme, rang: 3 },
      'par le titre, « après » la 3e carte donne le rang 3 : ' + JSON.stringify(r1.parLeTitre));
    assert.deepEqual(r1.parLaCarte, r1.parLeTitre,
      'la carte sélectionnée en zone « cover » doit donner exactement la même cible : '
      + JSON.stringify(r1.parLaCarte));
    assert.deepEqual(r1.parUnContenu, r1.parLeTitre,
      'un bloc de contenu doit remonter à sa diapositive et donner la même cible : '
      + JSON.stringify(r1.parUnContenu));
    pass('les trois conventions de sélection désignent la même diapositive et le même rang.');

    // ── 2. AVANT LA PREMIÈRE DIAPOSITIVE ───────────────────────────────────────────────────
    assert.deepEqual(r1.avantLaCarte, { carte: r1.idTroisieme, rang: 2 },
      '« avant » la 3e carte donne le rang 2 : ' + JSON.stringify(r1.avantLaCarte));
    assert.equal(r1.avantLaPremiere.rang, 0,
      '« avant » la première diapositive est accepté et donne le rang 0 : '
      + JSON.stringify(r1.avantLaPremiere));
    assert.equal(r1.aLaFin.rang, r1.total,
      '« à la fin » donne le rang ' + r1.total + ' : ' + JSON.stringify(r1.aLaFin));
    pass('« avant la première » vaut rang 0 (la couverture n\'est pas une diapositive) ; '
      + '« à la fin » vaut rang ' + r1.total + '.');

    // ── 3. LES BOUTONS SONT LÀ POUR UNE PRÉSENTATION ───────────────────────────────────────
    const voirPanneau = async () => {
      await page.evaluate(() => {
        const art = window._adocArtifacts['cible-essai'];
        const id = art._adocStructuredDoc.blocks[2].content.blocks[0].id;
        document.getElementById(id)?.click();
      });
      await page.waitForTimeout(400);
      return page.evaluate(() => {
        const p = document.querySelector('.cc-block-edit-controls');
        if (!p) return { absent: true };
        return { boutons: [...p.querySelectorAll('button')].map((b) => (b.textContent || '').trim()) };
      });
    };
    const pres = await voirPanneau();
    assert.ok(!pres.absent, 'le panneau du correcteur doit s\'ouvrir');
    const gestes = (pres.boutons || []).filter((t) => /page/i.test(t));
    assert.ok(gestes.length >= 3,
      'le panneau doit offrir « Insérer une page avant », « … après » et « Ajouter une page à la fin » — vu : '
      + JSON.stringify(pres.boutons));
    pass('les trois gestes de page sont offerts pour une présentation : ' + JSON.stringify(gestes));

    // ── 4. ABSENTS, ET REFUSÉS, HORS PRÉSENTATION ──────────────────────────────────────────
    for (const cas of [{ kind: 'carrousel', moteur: 'structured', quoi: 'un carrousel' },
                       { kind: 'presentation', moteur: 'legacy-html', quoi: 'un document ancien' }]) {
      const doc = JSON.parse(JSON.stringify(PRESENTATION));
      doc.documentKind = cas.kind;
      assert.ok(await ouvrir(doc, cas.moteur), cas.quoi + ' doit s\'ouvrir');
      const vu = await voirPanneau();
      const g = ((vu.boutons) || []).filter((t) => /page/i.test(t));
      assert.deepEqual(g, [], 'aucun geste de page pour ' + cas.quoi + ' : ' + JSON.stringify(g));
      // On interroge le chemin que prend RÉELLEMENT le clic, pas seulement le résolveur : le
      // moteur d'un document n'est pas dans le document mais sur l'artefact, et c'est au point
      // d'entrée que la règle s'applique. Une première version de ce contrôle n'interrogeait que
      // le résolveur, et laissait donc passer un document ancien étiqueté « présentation ».
      const refus = await page.evaluate(() => {
        const doc = window._adocArtifacts['cible-essai']._adocStructuredDoc;
        const messages = [];
        const vraiAlert = window.alert;
        window.alert = (m) => messages.push(String(m));
        window._adocBlockEditState = { storeKey: 'cible-essai',
          blockId: 'root:card-title:' + doc.blocks[0].id, zone: null, panelEl: null };
        const rendu = window.adocRequestPageInsert('after');
        window.alert = vraiAlert;
        return { passe: rendu !== null, message: messages[0] || '' };
      });
      assert.ok(!refus.passe, 'le clic doit être REFUSÉ pour ' + cas.quoi);
      assert.ok(/présentation/i.test(refus.message || ''),
        'le refus doit dire pourquoi, en clair, pour ' + cas.quoi + ' : ' + JSON.stringify(refus.message));
      pass('aucun geste de page pour ' + cas.quoi + ', et un refus explicite : « ' + refus.message + ' »');
    }

    assert.equal(reponsesDehors.length, 0,
      'aucune réponse ne doit venir de l\'extérieur ; ' + reponsesDehors.length + ' reçue(s)');
    pass('réseau : ' + tentativesDehors + ' tentative(s) de l\'application coupées avant de partir, '
      + '0 réponse venue du dehors.');
  } finally {
    await ctx.close(); await nav.close(); s.close();
  }
  console.log('\nPASS verify-insertion-page-cible — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC ' + (e && e.message)); process.exit(1); });
