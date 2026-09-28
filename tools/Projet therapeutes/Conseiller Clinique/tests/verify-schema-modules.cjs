// Schéma du DOCUMENT — champ racine optionnel `modules` (cours en puzzle).
//
// Validé par l'AJV RÉEL de l'application, chargé depuis la copie embarquée de studio-clinique.html :
// c'est cette copie-là qui sert en production, et c'est elle qui a déjà divergé du disque une fois.
// Un document SANS `modules` — toute présentation ordinaire — doit rester valide et inchangé.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-schema-modules.cjs
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
    assert.equal(sans.valid, true, 'un document SANS modules doit rester valide : ' + sans.errors.join(' | '));
    console.log('PASS 1/6  document sans `modules` : valide (AJV réellement actif).');

    // ── 2. Avec modules bien formés ───────────────────────────────────────────────────────────
    const avec = await valider({ ...BASE, modules: [
      { id: 'm1', title: 'Module 1', cardId: 'card-01' },
      { id: 'm2', title: 'Module 2', cardId: 'card-02' }] });
    assert.equal(avec.valid, true, 'un document AVEC modules doit être valide : ' + avec.errors.join(' | '));
    console.log('PASS 2/6  document avec `modules` bien formés : valide.');

    // ── 3. Champ inconnu refusé ───────────────────────────────────────────────────────────────
    const enTrop = await valider({ ...BASE, modules: [{ id: 'm1', title: 'M', cardId: 'card-01', couleur: 'bleu' }] });
    assert.equal(enTrop.valid, false, 'additionalProperties:false doit refuser un champ inconnu');
    console.log('PASS 3/6  champ inconnu dans une entrée : refusé.');

    // ── 4. Champ manquant refusé ──────────────────────────────────────────────────────────────
    const manque = await valider({ ...BASE, modules: [{ id: 'm1', title: 'M' }] });
    assert.equal(manque.valid, false, 'cardId est requis');
    console.log('PASS 4/6  entrée sans cardId : refusée.');

    // ── 5. Chaîne vide refusée ────────────────────────────────────────────────────────────────
    const vide = await valider({ ...BASE, modules: [{ id: '', title: 'M', cardId: 'card-01' }] });
    assert.equal(vide.valid, false, 'minLength 1 doit refuser une chaîne vide');
    console.log('PASS 5/6  identifiant vide : refusé.');

    // ── 6. LES DEUX COPIES DU SCHÉMA CONCORDENT ───────────────────────────────────────────────
    // La copie embarquée a déjà divergé du disque une fois (editorPresentation disparu) : on le
    // vérifie plutôt que de l'espérer.
    const embarquee = await page.evaluate(() =>
      JSON.parse(document.getElementById('adoc-sc-schemas').textContent)['clinical-document.schema.json'].properties.modules);
    const disque = JSON.parse(fs.readFileSync(path.join(__dirname, '../Schemas/clinical-document.schema.json'), 'utf8')).properties.modules;
    assert.deepEqual(embarquee, disque, 'la copie embarquée et le fichier disque doivent définir `modules` à l\'identique');
    console.log('PASS 6/6  copie embarquée et fichier disque : définitions identiques.');

    console.log('\nPASS verify-schema-modules — 6/6.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
