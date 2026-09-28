// Présentation ACTE 3 — LE test qui compte pour l'export autonome.
//
// Écrit réellement le fichier .html exporté, puis l'OUVRE dans un navigateur et CLIQUE dedans
// jusqu'au niveau 3. C'est le seul test qui couvre les deux classes de risque que le garde-fou
// générique `onclick` ne voit JAMAIS :
//   — un élément DOM présent dans la page vivante mais absent de la coquille codée en dur
//     (.cc-ws-present-door-text l'était depuis la Phase 2) ;
//   — une fonction interne PARTAGÉE oubliée d'engineFnRefs — elle n'est pas un onclick, donc
//     invisible au garde-fou ; elle ne se manifeste qu'en ReferenceError au clic réel.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lien = (text, targetId) => ({ text, targetId });
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'Export ACTE 3', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{
    id: 'card-01', type: 'card',
    content: {
      title: 'Diapositive de départ', imageRef: null, imageAlt: '',
      // Jeu de blocs ÉLARGI : le garde-fou ci-dessous inspecte le HTML exporté, où figure le code
      // source sérialisé — il verrait donc un onclick même non rendu. Mais seul un rendu RÉEL de
      // chaque type éprouve les fonctions internes qu'il appelle en cascade (rendu de liste, de
      // quiz, de questionnaire, d'image) : une seule d'entre elles oubliée d'engineFnRefs suffit
      // à casser l'export, sans qu'aucun onclick ne manque. Tous les types produits par le
      // générateur sont donc représentés ici.
      blocks: [
        { id: 'heading-01', type: 'heading', content: { text: 'Le corps sous tension', level: 2 }, citationIds: [], validation: {} },
        { id: 'paragraph-01', type: 'paragraph',
          content: { text: 'Le stress chronique agit sur le corps entier.' },
          citationIds: [], validation: {}, deepDiveLinks: [lien('stress chronique', 'n1')] },
        { id: 'list-01', type: 'list', content: { items: ['Sommeil', 'Appétit', 'Attention'], ordered: false }, citationIds: [], validation: {} },
        { id: 'callout-01', type: 'callout', content: { text: 'À rappeler en séance.', visualRole: 'info' }, citationIds: [], validation: {} },
        { id: 'quote-01', type: 'quote', content: { text: 'Le corps garde le compte.' }, citationIds: [], validation: {} },
        { id: 'image-01', type: 'image', content: { query: 'cortisol', alt: 'Coupe du cerveau' }, citationIds: [], validation: {}, deepDiveLinks: [lien('Coupe du cerveau', 'n2')] },
        { id: 'quiz-01', type: 'quiz', content: { question: 'Le cortisol est-il un neurotransmetteur ?', options: ['Oui', 'Non'], correctIndex: 1, explanation: "C'est une hormone." }, citationIds: [], validation: {} },
        { id: 'questionnaire-01', type: 'questionnaire', content: {
            questions: [
              { text: 'Sommeil rÃ©parateur ?'.replace('Ã©', 'é'), options: [{ text: 'Souvent', points: 0 }, { text: 'Rarement', points: 2 }] },
              { text: 'Tensions au réveil ?', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] },
            ],
            profiles: [
              { label: 'Charge basse', minScore: 0, maxScore: 1, interpretation: 'Rien de notable.' },
              { label: 'Charge élevée', minScore: 2, maxScore: 4, interpretation: 'À explorer en séance.' },
            ],
            allowTwoPartners: true,
          }, citationIds: [], validation: {} },
      ],
    },
    citationIds: [], validation: {},
  }],
  deepDives: [
    { id: 'n1', title: 'Niveau 1', paragraphs: [{ text: "Le cortisol et la boucle de retour.", deepDiveLinks: [lien('boucle de retour', 'n2')] }] },
    { id: 'n2', title: 'Niveau 2', paragraphs: [{ text: "L'hippocampe cesse de freiner l'axe.", deepDiveLinks: [lien("l'axe", 'n3')] }] },
    { id: 'n3', title: 'Niveau 3', paragraphs: ['Terminus de la branche.'] },
  ],
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'acte3-export-'));
  const fichier = path.join(dossier, 'presentation.html');
  try {
    // ── Construction du fichier exporté, par la vraie fonction d'export ──
    const atelier = await browser.newPage();
    await atelier.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate(d => window.adocBuildStandalonePresentationHTML(d), DOC);
    fs.writeFileSync(fichier, html, 'utf8');
    await atelier.close();
    console.log('       fichier exporté : ' + (html.length / 1024).toFixed(0) + ' Ko');

    // ── 1. INSPECTION DU SCRIPT — la classe que le garde-fou ne voit jamais ──
    for (const nom of ['adocDeepDivePopulateDoor', 'adocDeepDivePathHTML', 'adocDeepDiveActionsHTML',
                       'adocDeepDiveWrapInFragment']) {
      assert.ok(html.includes('function ' + nom), 'interne PARTAGÉE absente du script exporté : ' + nom);
    }
    for (const nom of ['adocPresentOpenDeepDive', 'adocPresentDeepDiveBack', 'adocPresentDeepDiveHome']) {
      assert.ok(html.includes('window.' + nom + ' ='), 'geste absent du script exporté : ' + nom);
    }
    // Assertion volontairement PRÉCISE : chercher la simple chaîne « cc-ws-present-door-text »
    // passerait sur le CSS exporté, présent depuis la Phase 2 alors que l'ÉLÉMENT, lui, manquait.
    assert.ok(/<div class="cc-ws-present-door-text"[^>]*><\/div>/.test(html),
      "l'ÉLÉMENT .cc-ws-present-door-text est absent de la coquille (le CSS seul ne suffit pas)");
    console.log('PASS 1/6  script exporté : 4 internes partagées + 3 gestes + la porte texte, tous présents.');

    // ── 2. GARDE-FOU GÉNÉRIQUE — tout onclick="window.X(...)" du HTML rendu doit être exporté ──
    const appeles = new Set();
    for (const m of html.matchAll(/onclick="window\.(\w+)\(/g)) appeles.add(m[1]);
    const manquants = [...appeles].filter(n => !html.includes('window.' + n + ' ='));
    assert.deepEqual(manquants, [], 'onclick sans fonction exportée : ' + manquants.join(', '));
    console.log('PASS 2/6  garde-fou onclick : ' + appeles.size + ' fonction(s) appelée(s), toutes exportées.');

    // ── 3. OUVERTURE RÉELLE du fichier, et descente à 3 niveaux DEDANS ──
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('file://' + fichier);
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    assert.equal(erreurs.length, 0, 'erreur dès l\'ouverture : ' + erreurs.join(' | '));

    const diapo = () => page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    const titre = () => page.evaluate(() => document.querySelector('.cc-ws-present-door-title')?.textContent);
    const chemin = () => page.evaluate(() => document.querySelector('.cc-ws-present-door-path')?.textContent);
    const pile = () => page.evaluate(() => (window._adocPresentState.deepDiveStack || []).slice());
    const porte = () => page.evaluate(() => document.getElementById('cc-ws-present-door').classList.contains('open'));
    const REFERENCE = await diapo();

    await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip').click());
    assert.equal(await titre(), 'Niveau 1', 'le niveau 1 ne s\'est pas affiché DANS LE FICHIER EXPORTÉ');
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    assert.equal(await titre(), 'Niveau 2');
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    assert.equal(await titre(), 'Niveau 3');
    assert.deepEqual(await pile(), ['n1', 'n2', 'n3']);
    assert.equal(erreurs.length, 0, 'erreur pendant la descente : ' + erreurs.join(' | '));
    assert.equal(await diapo(), REFERENCE, 'la diapositive a été modifiée dans le fichier exporté');
    console.log('PASS 3/6  descente à 3 niveaux DANS LE FICHIER EXPORTÉ ; 0 erreur ; diapositive intacte.');

    // ── 4. FIL D'ARIANE et BOUTONS présents dans l'export ──
    const c = await chemin();
    assert.ok(c && c.includes('Diapositive 1') && c.includes('Niveau 3'), 'fil d\'Ariane absent ou incomplet : ' + c);
    const boutons = await page.evaluate(() => [...document.querySelectorAll('.cc-ws-present-door-btn')].map(b => b.textContent.trim()));
    assert.equal(boutons.length, 2, 'les deux gestes de retour doivent être présents : ' + JSON.stringify(boutons));
    console.log('PASS 4/6  fil d\'Ariane « ' + c.replace(/\s+/g, ' ').trim() + ' » et boutons ' + JSON.stringify(boutons) + '.');

    // ── 5. RECULER ×3 depuis le niveau 3, par les VRAIS boutons ──
    await page.evaluate(() => [...document.querySelectorAll('.cc-ws-present-door-btn')][0].click());
    assert.equal(await titre(), 'Niveau 2');
    await page.evaluate(() => [...document.querySelectorAll('.cc-ws-present-door-btn')][0].click());
    assert.equal(await titre(), 'Niveau 1');
    await page.evaluate(() => [...document.querySelectorAll('.cc-ws-present-door-btn')][0].click());
    assert.equal(await porte(), false, 'pile vide → la porte doit se refermer');
    assert.equal(await diapo(), REFERENCE, 'diapositive modifiée par Reculer dans l\'export');
    assert.equal(erreurs.length, 0, 'erreur pendant le recul : ' + erreurs.join(' | '));
    console.log('PASS 5/6  Reculer ×3 par les vrais boutons DANS L\'EXPORT ; diapositive intacte.');

    // ── 6. PAGE MAÎTRE depuis le niveau 3, par le VRAI bouton ──
    await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip').click());
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    await page.evaluate(() => document.querySelector('.cc-ws-present-door-text .adoc-sc-deepdive-chip').click());
    assert.deepEqual(await pile(), ['n1', 'n2', 'n3']);
    await page.evaluate(() => [...document.querySelectorAll('.cc-ws-present-door-btn')][1].click());
    assert.equal(await porte(), false, 'Page maître doit refermer la porte');
    assert.deepEqual(await pile(), [], 'la pile doit être vidée d\'un coup');
    assert.equal(await diapo(), REFERENCE, 'diapositive modifiée par Page maître dans l\'export');
    assert.equal(erreurs.length, 0, 'erreur pendant Page maître : ' + erreurs.join(' | '));
    console.log('PASS 6/6  Page maître depuis le niveau 3 DANS L\'EXPORT ; diapositive intacte.');

    await page.close();
    console.log('\nPASS verify-acte3-export-standalone — 6/6, fichier réellement ouvert et cliqué.');
  } finally {
    await browser.close();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
