// Schéma du DOCUMENT — champ racine optionnel `narration` (lot 1a, narration par étape).
//
// Validé par l'AJV RÉEL de l'application, chargé depuis la copie embarquée de studio-clinique.html :
// c'est cette copie-là qui sert en production, et c'est elle qui a déjà divergé du disque une fois.
// Un document SANS `narration` — toute présentation d'avant ce lot — doit rester valide et inchangé.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-narration-schema.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const carte = (id, titre) => ({ id, type: 'card', content: { title: titre, imageRef: null, imageAlt: null, blocks: [
  { id: 'paragraph-' + id, type: 'paragraph', content: { text: 'Texte.' }, citationIds: [], validation: {} }] },
  citationIds: [], validation: {} });
const BASE = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'T', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [carte('card-01', 'Une'), carte('card-02', 'Deux')],
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocValidateSchema === 'function');
    const valider = doc => page.evaluate(d => {
      const r = window.adocValidateSchema('clinicalDocument', d);
      return { valid: !!r.valid, skipped: !!r.skipped, errors: (r.errors || []).slice(0, 4).map(String) };
    }, doc);

    // ── 1. AJV doit réellement valider, sinon ce test ne prouve rien ───────────────────────────
    const sans = await valider(BASE);
    assert.equal(sans.skipped, false, 'AJV doit être chargé : sans lui ce test ne vérifie rien');
    assert.equal(sans.valid, true, 'un document SANS narration doit rester valide : ' + sans.errors.join(' | '));
    console.log('PASS 1/7  document sans `narration` : valide (AJV réellement actif).');

    // ── 2. Avec une narration bien formée ─────────────────────────────────────────────────────
    const avec = await valider({ ...BASE, narration: [
      { stepId: 'paragraph-card-01', text: 'Vous introduisez le sujet ici.' },
      { stepId: 'card-02', text: 'Vous laissez un silence.' }] });
    assert.equal(avec.valid, true, 'un document AVEC narration doit être valide : ' + avec.errors.join(' | '));
    console.log('PASS 2/7  document avec `narration` bien formée : valide.');

    // ── 3. Champ inconnu refusé ───────────────────────────────────────────────────────────────
    const enTrop = await valider({ ...BASE, narration: [{ stepId: 'x', text: 'T', duree: 12 }] });
    assert.equal(enTrop.valid, false, 'additionalProperties:false doit refuser un champ inconnu');
    console.log('PASS 3/7  champ inconnu dans une entrée : refusé.');

    // ── 4. Champ manquant refusé ──────────────────────────────────────────────────────────────
    const manque = await valider({ ...BASE, narration: [{ stepId: 'x' }] });
    assert.equal(manque.valid, false, 'text est requis');
    console.log('PASS 4/7  entrée sans `text` : refusée.');

    // ── 5. Texte vide refusé — une étape sans narration n'a PAS d'entrée, jamais une entrée vide
    const vide = await valider({ ...BASE, narration: [{ stepId: 'x', text: '' }] });
    assert.equal(vide.valid, false, 'minLength 1 doit refuser un texte vide');
    const videId = await valider({ ...BASE, narration: [{ stepId: '', text: 'T' }] });
    assert.equal(videId.valid, false, 'minLength 1 doit refuser un stepId vide');
    console.log('PASS 5/7  texte vide et identifiant vide : refusés.');

    // ── 6. La narration n'entre PAS dans les cartes ni dans les blocs ──────────────────────────
    // L'emplacement est une décision, pas une préférence : le schéma doit refuser l'autre.
    const surCarte = JSON.parse(JSON.stringify(BASE));
    surCarte.blocks[0].content.narration = 'Vous dites ceci.';
    assert.equal((await valider(surCarte)).valid, false, 'cardContent est clos : narration doit y être refusée');
    const surBloc = JSON.parse(JSON.stringify(BASE));
    surBloc.blocks[0].content.blocks[0].narration = 'Vous dites ceci.';
    assert.equal((await valider(surBloc)).valid, false, 'nestedBlock est clos : narration doit y être refusée');
    console.log('PASS 6/7  narration sur une carte ou sur un bloc : refusée par le schéma.');

    // ── 7. LES DEUX COPIES DU SCHÉMA CONCORDENT ───────────────────────────────────────────────
    // La copie embarquée a déjà divergé du disque une fois : on le vérifie plutôt que de l'espérer.
    const embarquee = await page.evaluate(() =>
      JSON.parse(document.getElementById('adoc-sc-schemas').textContent)['clinical-document.schema.json'].properties.narration);
    const disqueDoc = JSON.parse(fs.readFileSync(path.join(__dirname, '../Schemas/clinical-document.schema.json'), 'utf8'));
    assert.deepEqual(embarquee, disqueDoc.properties.narration, 'la copie embarquée et le fichier disque doivent définir `narration` à l\'identique');
    assert.equal(disqueDoc.required.includes('narration'), false, '`narration` ne doit JAMAIS entrer dans required');
    const cles = Object.keys(disqueDoc.properties);
    assert.equal(cles[cles.indexOf('modules') + 1], 'narration', '`narration` doit suivre `modules`, sur son patron');
    console.log('PASS 7/7  copies concordantes, champ optionnel, placé après `modules`.');

    console.log('\nPASS verify-narration-schema — 7/7.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
