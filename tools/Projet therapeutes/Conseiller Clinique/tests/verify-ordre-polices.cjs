// Q3 — L'ORDRE DU SÉLECTEUR DE POLICE, LU SUR LA PAGE RÉELLE.
//
// Demandé : « Police de la charte », puis les polices des chartes et des paires, puis celles de
// cet ordinateur, et EN DERNIER la valeur du document absente d'ici.
//
// L'ordre alphabétique DANS chaque groupe ne change pas ; la valeur choisie, la note « police
// installée sur cet ordinateur » et le rafraîchissement du panneau non plus.
//
//   NODE_PATH=<playwright> node tests/verify-ordre-polices.cjs
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
const ORDRE_VOULU = ['Polices des chartes et des paires', 'Catalogue historique (à vérifier)',
                     'Valeur du document, absente de cet ordinateur'];
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const serveur = http.createServer((q, r) => {
    if (q.method === 'POST') { let c = ''; q.on('data', (d) => { c += d; });
      q.on('end', () => { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{}'); }); return; }
    const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.addInitScript((p) => { try { localStorage.setItem('workerUrl', 'http://127.0.0.1:' + p); } catch (e) {} }, port);

  // Ouvre le document, pose la situation demandée, sélectionne un bloc, et REND le sélecteur.
  const situation = (doc, cas) => page.evaluate(async (a) => {
    window._adocArtifacts = window._adocArtifacts || {};
    const art = { name: a.d.title, _adocGenerationEngine: 'structured',
      _adocStructuredDoc: JSON.parse(JSON.stringify(a.d)), _adocStructuredSnapshot: null,
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
        blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
    // ── CE QUI EST SIMULÉ, ET CE QUI NE PEUT PAS L'ÊTRE ──────────────────────────────────
    // « Polices de cet ordinateur » vient d'une LISTE FIGÉE du cœur (ADOC_MAC_FONT_FAMILIES,
    // 227 noms) : elle ne lit pas la machine, donc ce contrôle n'en dépend pas non plus.
    // `_adocEditorLocalFonts` est interne au cœur : y écrire depuis `window` ne ferait rien.
    // La charte active d'un document structuré se lit dans `_adocRenderManifestOverride`
    // (adocEditorActiveBrandKitId), et NON dans `_adocBrandKitId`.
    // Et `brandKitId` n'est PAS une propriété du schéma des documents, qui refuse tout champ
    // inventé : l'écrire rendait le document invalide, l'espace de travail refusait de
    // s'ouvrir, et le sélecteur n'existait pas. C'est ce qui a fait échouer ce contrôle
    // ailleurs que sur ce qu'il mesure.
    if (a.cas.charte) {
      window._adocBrandKits = [{ id: 'kit-essai', typography: {
        headingFont: 'Charte Titre', bodyFont: 'Charte Texte',
        availableFonts: [{ candidate: 'Charte Accent' }] } }];
      // On ne pose PAS de _adocRenderManifestOverride incomplet : il est validé contre
      // render-manifest.schema.json à l'ouverture, et un faux rendrait le document inouvrable.
      // Le groupe « chartes et paires » est de toute façon alimenté par ADOC_LEGACY_FONT_PAIRS,
      // qui suffit à éprouver l'ORDRE — le seul objet de ce contrôle.
      void 0;
    } else {
      window._adocBrandKits = [];
    }
    if (a.cas.policeAbsente) {
      const b = art._adocStructuredDoc.blocks[0].content.blocks[0];
      b.style = Object.assign({}, b.style, { fontFamily: a.cas.policeAbsente });
    }
    window._adocArtifacts.e = art;
    await window.adocOpenWorkspace('e');
    const bloc = art._adocStructuredDoc.blocks[0].content.blocks[0];
    document.getElementById(bloc.id)?.click();
    await new Promise((r) => setTimeout(r, 450));
    // Les outils de style vivent DANS le panneau du correcteur ; leur rendu est déclenché par
    // l'éditeur à chaque édition, et exposé sous ce nom. On l'appelle comme lui.
    if (typeof window.adocEditorRefreshControls === 'function') window.adocEditorRefreshControls();
    await new Promise((r) => setTimeout(r, 200));
    const sel = document.querySelector('select[data-editor-style="fontFamily"]');
    if (!sel) return { absent: true };
    return {
      groupes: [...sel.querySelectorAll('optgroup')].map((g) => g.label),
      premiere: sel.options[0] ? sel.options[0].textContent : null,
      // L'ordre RÉEL des options, groupe par groupe, tel que l'œil les parcourt.
      parGroupe: [...sel.querySelectorAll('optgroup')].map((g) => ({
        label: g.label, options: [...g.querySelectorAll('option')].map((o) => o.textContent) })),
      valeur: sel.value,
      noteVisible: !(document.querySelector('.cc-editor-police-locale') || { hidden: true }).hidden,
      blocId: bloc.id,
    };
  }, { d: doc, cas: cas });

  try {
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });

    // ── 1. AVEC UNE CHARTE ET DES POLICES LOCALES ─────────────────────────────────────────
    const avecCharte = await situation(PRESENTATION, { charte: true });
    assert.ok(!avecCharte.absent, 'le sélecteur de police doit exister');
    assert.equal(avecCharte.premiere, 'Police de la charte', 'la première option reste « Police de la charte »');
    assert.deepEqual(avecCharte.groupes, ORDRE_VOULU.slice(0, 2),
      'les groupes doivent venir dans cet ordre : chartes et paires, PUIS cet ordinateur — vu : '
      + JSON.stringify(avecCharte.groupes));
    pass('avec une charte : « Police de la charte », puis « ' + avecCharte.groupes.join(' », puis « ') + ' ».');

    // ── 2. L'ORDRE ALPHABÉTIQUE DANS CHAQUE GROUPE EST INTACT ─────────────────────────────
    for (const g of avecCharte.parGroupe) {
      const trie = g.options.slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      assert.deepEqual(g.options, trie, 'le groupe « ' + g.label + ' » doit rester alphabétique');
    }
    const chartes = avecCharte.parGroupe.find((g) => /chartes et des paires/.test(g.label));
    const ordi = avecCharte.parGroupe.find((g) => /Catalogue historique/.test(g.label));
    // LIMITE DE CE CONTRÔLE, dite plutôt que cachée : une VRAIE charte importée n'est pas
    // simulée. Elle se lit dans `_adocRenderManifestOverride`, qui est validé contre
    // render-manifest.schema.json à l'ouverture : en poser un faux rendrait le document
    // inouvrable. Le groupe « chartes et paires » est donc éprouvé tel qu'il existe sans
    // charte — alimenté par ADOC_LEGACY_FONT_PAIRS — ce qui suffit à juger l'ORDRE, seul
    // objet de Q3. L'ordre avec une charte réelle reste à juger par Christophe.
    assert.ok(chartes && chartes.options.length >= 5,
      'le groupe des chartes et des paires doit porter les polices des paires : '
      + JSON.stringify(chartes && chartes.options));
    assert.ok(ordi && ordi.options.length > 200,
      'le groupe de cet ordinateur est la liste FIGÉE du cœur, environ 227 entrées : '
      + (ordi && ordi.options.length));
    pass('ordre alphabétique intact ; ' + chartes.options.length + ' polices de chartes et de paires, '
      + ordi.options.length + ' polices de cet ordinateur (liste figée, indépendante de la machine).');

    // ── 3. SANS CHARTE ────────────────────────────────────────────────────────────────────
    const sans = await situation(PRESENTATION, { charte: false });
    assert.equal(sans.premiere, 'Police de la charte', 'la première option ne change pas');
    const i1 = sans.groupes.indexOf('Polices des chartes et des paires');
    const i2 = sans.groupes.indexOf('Catalogue historique (à vérifier)');
    assert.ok(i1 === -1 || i2 === -1 || i1 < i2,
      'sans charte, si les deux groupes sont là, les chartes et paires passent en premier : '
      + JSON.stringify(sans.groupes));
    pass('sans charte : ' + JSON.stringify(sans.groupes));

    // ── 4. UNE VALEUR ABSENTE DE CET ORDINATEUR RESTE EN DERNIER ──────────────────────────
    const absente = await situation(PRESENTATION, { charte: true, policeAbsente: 'Police Fantome dAilleurs' });
    assert.deepEqual(absente.groupes, ORDRE_VOULU,
      'les trois groupes, dans l\'ordre, la valeur absente EN DERNIER : ' + JSON.stringify(absente.groupes));
    assert.equal(absente.valeur, 'Police Fantome dAilleurs', 'la valeur du document est conservée');
    pass('valeur absente : les trois groupes dans l\'ordre voulu, et la valeur est gardée.');

    // ── 5. LE CHOIX D'UNE POLICE DE CHAQUE GROUPE SURVIT AU RAFRAÎCHISSEMENT ──────────────
    // Une police de CHAQUE groupe, prises parmi celles qui s'y trouvent réellement :
    // « Lora » vient des paires, « American Typewriter » de la liste figée de l'ordinateur.
    for (const police of ['Lora', 'American Typewriter']) {
      const garde = await page.evaluate(async (p) => {
        const sel = document.querySelector('select[data-editor-style="fontFamily"]');
        sel.value = p;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
        // Rafraîchissement du panneau, comme le fait chaque édition.
        if (typeof window.adocEditorRefreshControls === 'function') window.adocEditorRefreshControls();
        const bloc = window._adocArtifacts.e._adocStructuredDoc.blocks[0].content.blocks[0];
        document.getElementById(bloc.id)?.click();
        await new Promise((r) => setTimeout(r, 400));
        if (typeof window.adocEditorRefreshControls === 'function') window.adocEditorRefreshControls();
        await new Promise((r) => setTimeout(r, 200));
        const s2 = document.querySelector('select[data-editor-style="fontFamily"]');
        return { valeur: s2 ? s2.value : null,
                 dansLeDoc: (bloc.style || {}).fontFamily || null };
      }, police);
      assert.equal(garde.valeur, police, '« ' + police + ' » doit rester choisie après rafraîchissement ; vu : ' + garde.valeur);
      assert.equal(garde.dansLeDoc, police, '« ' + police + ' » doit être écrite dans le document ; vu : ' + garde.dansLeDoc);
    }
    pass('une police de chaque groupe reste choisie et écrite dans le document après rafraîchissement.');
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-ordre-polices — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
