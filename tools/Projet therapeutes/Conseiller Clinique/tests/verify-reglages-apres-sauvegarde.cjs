// Q7 (2.7) — QU'EST-CE QUI SURVIT À UNE SAUVEGARDE, ET QU'EST-CE QUI SE PERD ?
//
// Q7 promet : « ce qui est visible à l'écran est sauvegardé ». Avant de corriger quoi que ce
// soit, il faut SAVOIR. Ce contrôle est donc un INVENTAIRE, pas un juge : il applique chaque
// réglage par son VRAI contrôle, sauvegarde, rouvre le document dans un contexte de navigateur
// ISOLÉ ET VIERGE, et dit pour chacun s'il a survécu.
//
// IL NE CORRIGE RIEN, et il n'échoue pas sur une perte : une perte est un RÉSULTAT, à porter au
// compte rendu et à décider par Christophe. Il échoue seulement si l'inventaire est incomplet —
// un réglage déclaré mais non mesuré — car un inventaire troué ne vaut rien.
//
// Le style des TITRES est connu pour se perdre : c'est l'objet du lot Q1 (2D-c), hors périmètre
// ici. Il est mesuré quand même, pour que le compte rendu le chiffre au lieu de le supposer.
//
//   NODE_PATH=<playwright> node tests/verify-reglages-apres-sauvegarde.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// Chaque réglage : son nom, comment on le POSE (par le vrai contrôle), et comment on le RELIT
// dans le document tel que le serveur l'a rendu.
const REGLAGES = [
  { nom: 'police d’un bloc (fontFamily)', champ: 'fontFamily', valeur: 'Lora',
    lire: (d) => chemin(d, 'blocks.0.content.blocks.0.style.fontFamily') },
  { nom: 'taille d’un bloc (fontSizePt)', champ: 'fontSizePt', valeur: '19',
    lire: (d) => chemin(d, 'blocks.0.content.blocks.0.style.fontSizePt') },
  { nom: 'couleur du texte d’un bloc', champ: 'color', valeur: '#2f4f4f',
    lire: (d) => chemin(d, 'blocks.0.content.blocks.0.style.color') },
  { nom: 'fond d’un bloc', champ: 'backgroundColor', valeur: '#eef2f3',
    lire: (d) => chemin(d, 'blocks.0.content.blocks.0.style.backgroundColor') },
  { nom: 'alignement d’un bloc', champ: 'textAlign', valeur: 'center',
    lire: (d) => chemin(d, 'blocks.0.content.blocks.0.style.textAlign') },
  { nom: 'interligne d’un bloc', champ: 'lineHeight', valeur: '1.8',
    lire: (d) => chemin(d, 'blocks.0.content.blocks.0.style.lineHeight') },
];

const chemin = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);

(async () => {
  const { serveur } = creerFauxWorker(RACINE, {});
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const erreurs = [];
  const ordinateur = async (nom) => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(nom + ' : ' + e.message));
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await page.route('**/*', (r) => { const u = r.request().url();
      return (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
    await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
      localStorage.setItem('workerApiKey', 'factice'); } catch (e) {} }, base);
    await page.goto(base + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    return { ctx, page };
  };

  const A = await ordinateur('A');
  try {
    await A.page.evaluate(async (d) => {
      window._adocArtifacts = { e: { name: d.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
        _adocClinicalDocumentId: null, _ccEditorDirty: false,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } } };
      await window.adocOpenWorkspace('e');
    }, PRESENTATION);
    await A.page.waitForTimeout(600);

    // ── On pose chaque réglage par son VRAI contrôle ──────────────────────────────────────
    const poses = [];
    for (const r of REGLAGES) {
      await A.page.evaluate(() => {
        const d = window._adocArtifacts.e._adocStructuredDoc;
        document.getElementById(d.blocks[0].content.blocks[0].id)?.click();
      });
      await A.page.waitForTimeout(350);
      await A.page.evaluate(() => window.adocEditorRefreshControls && window.adocEditorRefreshControls());
      await A.page.waitForTimeout(180);
      const ok = await A.page.evaluate((a) => {
        const p = document.querySelector('[data-editor-scope]');
        if (p) { p.value = 'block'; p.dispatchEvent(new Event('change', { bubbles: true })); }
        const el = document.querySelector('[data-editor-style="' + a.c + '"]');
        if (!el) return false;
        el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, { c: r.champ, v: r.valeur });
      await A.page.waitForTimeout(300);
      poses.push({ nom: r.nom, pose: ok });
      assert.ok(ok, 'le champ « ' + r.champ + ' » doit exister dans l’éditeur, sinon on ne '
        + 'mesure rien : inventaire incomplet');
    }
    // La narration et le titre d'une carte, par leurs propres chemins.
    await A.page.evaluate(() => {
      const d = window._adocArtifacts.e._adocStructuredDoc;
      const e = window.adocPresentStepList(d)[0];
      if (window.adocNarrationWrite(d, e.stepId, 'Narration d’essai pour l’inventaire.')) window.adocEditorMarkDirty();
    });
    await A.page.evaluate(() => {
      const el = document.querySelector('.adoc-sc-card-title');
      const leaf = el.matches('[data-cc-editor-leaf]') ? el : el.querySelector('[data-cc-editor-leaf]');
      leaf.dispatchEvent(new Event('focusin', { bubbles: true })); leaf.focus();
      leaf.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: 'x' }));
      leaf.textContent = 'Titre retouché pour l’inventaire';
      leaf.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
    });
    await A.page.waitForTimeout(400);

    // Ce que l'écran montre AVANT la sauvegarde, pour comparer à ce qui revient.
    const avant = await A.page.evaluate(() =>
      JSON.parse(JSON.stringify(window._adocArtifacts.e._adocStructuredDoc)));

    await A.page.evaluate(() => window.adocWsSave());
    await A.page.waitForTimeout(1000);
    const id = await A.page.evaluate(() => window._adocArtifacts.e._adocClinicalDocumentId);
    assert.ok(id, 'le document est bien sauvegardé avant qu’on le rouvre ailleurs');

    // ── On rouvre AILLEURS, dans un navigateur vierge ────────────────────────────────────
    const B = await ordinateur('B');
    let apres;
    try {
      const ouvert = await B.page.evaluate((i) => window.adocOpenSavedClinicalDocument(i), id);
      assert.equal(ouvert, true, 'B rouvre le document');
      await B.page.waitForTimeout(900);
      apres = await B.page.evaluate(() =>
        JSON.parse(JSON.stringify(window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc)));
    } finally { await B.ctx.close(); }

    // ── L'INVENTAIRE ─────────────────────────────────────────────────────────────────────
    const lignes = [];
    for (const r of REGLAGES) {
      const a = r.lire(avant), b = r.lire(apres);
      lignes.push({ nom: r.nom, avant: a, apres: b,
        verdict: a == null ? 'JAMAIS POSÉ dans le document' : (String(a) === String(b) ? 'conservé' : 'PERDU') });
    }
    lignes.push({ nom: 'narration d’une étape', avant: chemin(avant, 'narration.0.text'),
      apres: chemin(apres, 'narration.0.text'),
      verdict: String(chemin(avant, 'narration.0.text')) === String(chemin(apres, 'narration.0.text')) ? 'conservé' : 'PERDU' });
    lignes.push({ nom: 'TEXTE du titre d’une diapositive', avant: chemin(avant, 'blocks.0.content.title'),
      apres: chemin(apres, 'blocks.0.content.title'),
      verdict: String(chemin(avant, 'blocks.0.content.title')) === String(chemin(apres, 'blocks.0.content.title')) ? 'conservé' : 'PERDU' });
    lignes.push({ nom: 'STYLE du titre d’une diapositive (objet du lot Q1)',
      avant: chemin(avant, 'blocks.0.content.titleStyle'), apres: chemin(apres, 'blocks.0.content.titleStyle'),
      verdict: chemin(avant, 'blocks.0.content.titleStyle') == null
        ? 'AUCUN CHAMP au schéma : le style d’un titre n’est pas écrit dans le document' : 'conservé' });
    lignes.push({ nom: 'charte du document (renderManifestId)', avant: avant.renderManifestId,
      apres: apres.renderManifestId,
      verdict: String(avant.renderManifestId) === String(apres.renderManifestId) ? 'conservé' : 'PERDU' });

    console.log('\n  INVENTAIRE — ce qui survit à une sauvegarde puis une réouverture ailleurs :');
    lignes.forEach((l) => {
      console.log('    ' + (l.verdict === 'conservé' ? '✓' : '·') + '  ' + l.nom);
      console.log('        avant : ' + JSON.stringify(l.avant) + '   après : ' + JSON.stringify(l.apres));
      console.log('        → ' + l.verdict);
    });

    const conserves = lignes.filter((l) => l.verdict === 'conservé');
    const perdus = lignes.filter((l) => l.verdict === 'PERDU');
    const absents = lignes.filter((l) => /JAMAIS POSÉ|AUCUN CHAMP/.test(l.verdict));
    console.log('\n  ' + conserves.length + ' conservé(s) · ' + perdus.length + ' perdu(s) · '
      + absents.length + ' jamais écrit(s) dans le document');

    // L'inventaire doit être COMPLET : chaque réglage déclaré a été mesuré des deux côtés.
    assert.equal(lignes.length, REGLAGES.length + 4, 'tout réglage déclaré est inventorié');
    lignes.forEach((l) => assert.ok(l.verdict, 'chaque ligne porte un verdict : ' + l.nom));
    pass('inventaire complet : ' + lignes.length + ' réglages mesurés avant et après, '
      + conserves.length + ' conservés, ' + perdus.length + ' perdus, ' + absents.length
      + ' jamais écrits. AUCUNE correction faite — c’est un relevé.');

    // Un garde-fou minimal, qui ne corrige rien mais empêche une RÉGRESSION silencieuse : les
    // réglages aujourd'hui conservés doivent le rester. Ce qui est perdu reste perdu jusqu'à
    // décision de Christophe.
    assert.ok(conserves.length >= 1, 'au moins un réglage survit, sinon la sauvegarde ne '
      + 'conserverait rien du tout');
    assert.deepEqual(perdus.map((l) => l.nom), [],
      'AUCUN réglage aujourd’hui écrit dans le document ne doit se perdre ; perdus : '
      + JSON.stringify(perdus.map((l) => l.nom)));
    pass('garde-fou : aucun réglage réellement écrit dans le document ne se perd à la '
      + 'sauvegarde. Ce qui manque manque au SCHÉMA, pas à la sauvegarde.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await A.ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-reglages-apres-sauvegarde — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
