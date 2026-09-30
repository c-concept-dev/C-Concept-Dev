// PHASE 3 — LE GRAPHE D'EXPORT, VÉRIFIÉ PAR UN EXPORT RÉELLEMENT CONSTRUIT ET OUVERT.
//
// Une lecture de engineFnRefs ne prouve rien : le piège de cette nuit était précisément une fonction
// absente de la liste (adocPresentOpenDeepDive) et, deux fois, une CONSTANTE de portée de module que
// la liste ne transporte pas (elle ne sérialise que des fonctions — d'où dataText). Les deux ne se
// manifestent qu'à l'ouverture du fichier, jamais à la lecture du source.
//
// Ici : une page de 12 paragraphes (au-dessus du seuil de 9) dans un export autonome, ouvert pour de
// vrai, révélé à la flèche. Une seule fonction oubliée ou ADOC_DOOR_REVEAL_SEUIL non émise, et la
// porte lève une erreur — que ce test transforme en échec au lieu de la laisser passer en silence.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const K = 12;
const DOC = {
  documentKind: 'presentation', title: 'Révélation exportée', citations: [],
  blocks: [{ id: 'c1', type: 'card', content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
    { id: 'p1', type: 'paragraph', content: { text: 'Un texte.' }, citationIds: [], validation: {},
      deepDiveLinks: [{ text: 'Un texte', targetId: 'n1' }] },
    { id: 'p2', type: 'paragraph', content: { text: 'Un second bloc.' }, citationIds: [], validation: {} }] } }],
  deepDives: [{ id: 'n1', title: 'Page longue exportée', imageQuery: '', imageAlt: '',
    paragraphs: Array.from({ length: K }, (_, i) => 'Paragraphe ' + (i + 1)
      + " d'une page assez fournie pour occuper plusieurs lignes une fois mise en page dans la "
      + 'colonne de la porte, et éprouver ainsi le plafond de hauteur.') }],
};

// Jamais dans le dépôt : un fichier produit par une mesure n'y entre pas (dépôt public).
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'porte-revelation-'));
const fichier = path.join(dossier, 'presentation.html');

(async () => {
  const browser = await chromium.launch();
  try {
    // ── 1. CONSTRUCTION RÉELLE de l'export ──
    const atelier = await browser.newPage();
    const erreursAtelier = [];
    atelier.on('pageerror', (e) => erreursAtelier.push(e.message));
    await atelier.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await atelier.goto('file://' + path.join(__dirname, '..', 'studio-clinique.html'));
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate((d) => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    fs.writeFileSync(fichier, html, 'utf8');
    await atelier.close();
    assert.deepEqual(erreursAtelier, [], 'erreur pendant la construction : ' + erreursAtelier.join(' | '));
    console.log('PASS 1/5 — export construit (' + (html.length / 1024).toFixed(0) + ' Ko).');

    // ── 2. CONTRÔLE STRUCTUREL — complément, JAMAIS la preuve (cf. en-tête) ──
    const manquants = ['adocDoorRevealUnites', 'adocDoorRevealApply', 'adocDoorRevealNext', 'adocDoorRevealPrev']
      .filter((n) => !new RegExp('function\\s+' + n + '\\s*\\(').test(html));
    assert.deepEqual(manquants, [], 'fonction(s) absente(s) du fichier exporté : ' + manquants.join(', '));
    assert.ok(/var ADOC_DOOR_REVEAL_SEUIL = 12|var ADOC_DOOR_REVEAL_SEUIL = \d+/.test(html),
      'ADOC_DOOR_REVEAL_SEUIL doit être émise par dataText — une constante de module n\'est jamais sérialisée par engineFnRefs');
    assert.ok(/\.adoc-door-cache\{display:none;\}/.test(html), 'la règle CSS de masquage doit être embarquée');
    console.log('PASS 2/5 — les 4 fonctions, la constante et la règle CSS sont présentes dans le fichier.');

    // ── 3. OUVERTURE RÉELLE, et masquage effectif DANS le fichier ──
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto('file://' + fichier);
    // Depuis la phase 3 du plein écran, un export attend le geste « ▶ Démarrer ».
    await page.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    assert.deepEqual(erreurs, [], 'erreur dès l\'ouverture de l\'export : ' + erreurs.join(' | '));

    await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip').click());
    await page.waitForTimeout(450);
    const lire = () => page.evaluate(() => {
      const z = document.querySelector('.cc-ws-present-door-text');
      const u = Array.from(z.querySelectorAll(':scope > p, :scope > ul.cc-ws-present-door-list'));
      return { curseur: window._adocPresentState.doorRevealIndex, unites: u.length,
        masquees: u.filter((e) => e.classList.contains('adoc-door-cache')).length,
        visibles: u.filter((e) => e.offsetParent !== null).length,
        visible: z.clientHeight, contenu: z.scrollHeight };
    });
    const ouvert = await lire();
    assert.equal(ouvert.unites, K, 'les ' + K + ' paragraphes donnent ' + K + ' unités dans l\'export');
    assert.equal(ouvert.curseur, 0, 'le curseur de révélation existe DANS l\'export (donc la constante a bien été émise)');
    assert.equal(ouvert.masquees, K - 1, 'une seule unité révélée à l\'ouverture');
    assert.ok(ouvert.contenu <= ouvert.visible + 1,
      'le masquage libère la place dans l\'export aussi (contenu ' + ouvert.contenu + ' px, visible ' + ouvert.visible + ' px)');
    assert.deepEqual(erreurs, [], 'erreur à l\'ouverture de la page : ' + erreurs.join(' | '));
    console.log('PASS 3/5 — DANS le fichier exporté : 1 unité sur ' + K + ', colonne sans défilement ('
      + ouvert.contenu + ' px pour ' + ouvert.visible + ' px).');

    // ── 4. LA FLÈCHE FONCTIONNE DANS L'EXPORT — c'est ce qui prouve le gestionnaire de touches ──
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const avance = await lire();
    assert.equal(avance.curseur, 2, 'ArrowRight avance la révélation dans le fichier exporté');
    assert.equal(avance.visibles, 3, 'trois unités visibles après deux flèches');
    await page.keyboard.press('ArrowLeft');
    const recule = await lire();
    assert.equal(recule.curseur, 1, 'ArrowLeft recule la révélation dans le fichier exporté');
    assert.deepEqual(erreurs, [], 'erreur pendant la révélation : ' + erreurs.join(' | '));
    console.log('PASS 4/5 — ArrowRight/ArrowLeft opérants dans l\'export (curseur 0 → 2 → 1).');

    // ── 5. AUCUNE ERREUR sur l'ensemble, et le retour ferme bien la porte ──
    await page.evaluate(() => window.adocPresentDeepDiveHome());
    await page.waitForTimeout(300);
    const fermee = await page.evaluate(() => !document.getElementById('cc-ws-present-door').classList.contains('open'));
    assert.equal(fermee, true, 'le retour à la diapositive doit refermer la porte, révélation ou non');
    assert.deepEqual(erreurs, [], 'aucune erreur JS sur tout le scénario exporté : ' + JSON.stringify(erreurs));
    console.log('PASS 5/5 — retour à la diapositive, zéro erreur JS sur tout le scénario.');

    console.log('\nTOUS LES TESTS RÉVÉLATION — EXPORT RÉEL PASSENT (5/5)');
    await page.close();
  } finally {
    await browser.close();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
