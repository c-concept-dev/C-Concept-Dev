// Q7 — « APPLIQUER (N) » DU PANNEAU « RÉDIGER LA NARRATION » DOIT LEVER LE DRAPEAU.
//
// LE GESTE QUI A MONTRÉ LE DÉFAUT, en production : Christophe clique « Appliquer (19) », le
// panneau répond « 19 narration(s) écrite(s) dans le document », et le badge continue de dire
// « Sauvegardé ». Dix-neuf narrations écrites dans le document, et l'écran affirme qu'il n'y a
// rien à sauvegarder : en fermant, il les perdait toutes sans un mot d'avertissement.
//
// POURQUOI MON AUDIT L'AVAIT MANQUÉ. J'avais écrit « adocNarrationApply n'a aucun appelant » —
// vrai, mais sans portée : le panneau ne passe pas par elle, il appelle adocNarrationWrite en
// boucle. Et je n'avais cherché que dans le cœur et la page, jamais dans narration-ia.js, qui
// est un module SÉPARÉ. Un audit qui ne regarde pas tous les fichiers n'est pas un audit.
//
// Ce contrôle joue le VRAI panneau, avec le VRAI bouton, et un modèle simulé par le point
// d'injection du module. Il mesure le drapeau ET l'état affiché, avant et après, puis après
// « Annuler ce geste » — car annuler écrit aussi dans le document.
//
//   NODE_PATH=<playwright> node tests/verify-drapeau-narration-appliquee.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// TROIS étapes, toutes vides : « Appliquer » en écrira donc exactement trois.
let _i = 0;
const bloc = (t) => ({ id: 'p' + (++_i), type: 'paragraph', content: { text: t },
  citationIds: [], validation: {} });
const DOC = {
  schemaVersion: 1, documentId: 'narr-drapeau', versionId: 'narr-drapeau-v1',
  previousVersionId: null, requestId: 'narr-r', sourceSnapshotId: 'narr-s',
  createdAt: '2026-10-20T09:00:00Z', language: 'fr', status: 'draft',
  title: 'Trois étapes sans narration', purpose: 'Essai du drapeau',
  audience: 'clinicien', documentKind: 'presentation',
  renderManifestId: 'manifest-default-001', derivedFrom: null,
  blocks: [{ id: 'c1', type: 'card',
    content: { title: 'Une page, trois étapes', imageRef: null, imageAlt: null,
      blocks: [bloc('Premier temps : nommer ce qui se passe.'),
               bloc('Deuxième temps : laisser le corps revenir.'),
               bloc('Troisième temps : décider d’un geste.')] },
    citationIds: [], validation: {} }],
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                accessibility: 'pending', humanClinicalReview: 'required' },
  narration: [],
};

(async () => {
  const { serveur } = creerFauxWorker(RACINE, {});
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.route('**/*', (r) => { const u = r.request().url();
    return (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
  await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
    localStorage.setItem('workerApiKey', 'factice'); } catch (e) {} }, base);

  // Ce que l'utilisatrice VOIT, et ce que le cœur PENSE : les deux, toujours ensemble.
  const vu = () => page.evaluate(() => ({
    drapeau: !!(window._adocArtifacts.e || {})._ccEditorDirty,
    etat: (document.getElementById('cc-ws-save-status') || {}).textContent || '',
    narrations: ((window._adocArtifacts.e._adocStructuredDoc.narration) || []).length,
  }));

  try {
    await page.goto(base + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    await page.waitForFunction(() => window.NarrationIA && window.NarrationIA._transportDEssai !== undefined
      || (window.NarrationIA && typeof window.NarrationIA.rediger === 'function'), { timeout: 15000 });

    await page.evaluate(async (d) => {
      window._adocArtifacts = { e: { name: d.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: JSON.parse(JSON.stringify(d)),
        _adocStructuredSnapshot: { sourceSnapshotId: d.sourceSnapshotId, entries: [] },
        _adocClinicalDocumentId: 'doc-deja-sauvegarde', _ccEditorDirty: false,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } } };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'e' });
      await window.adocOpenWorkspace('e');
      window._adocArtifacts.e._ccEditorDirty = false;
    }, DOC);
    await page.waitForTimeout(500);

    // Le modèle SIMULÉ : une narration par étape demandée, par le point d'injection du module.
    await page.evaluate(() => {
      window.NarrationIA._transportDEssai = async (req) => {
        const bloc = req.messages[0].content;
        const ids = (bloc.match(/stepId: (\S+)/g) || []).map((x) => x.slice(8));
        return JSON.stringify(ids.map((id) => ({ stepId: id,
          text: 'Voici ce que je dirai pendant cette étape, calmement, sans me presser.' })));
      };
    });

    // On ouvre le VRAI panneau depuis la boîte Narration d'une étape sélectionnée.
    await page.evaluate(async () => {
      const d = window._adocArtifacts.e._adocStructuredDoc;
      const e = window.adocPresentStepList(d)[0];
      const el = document.getElementById(e.stepId);
      if (el) el.click();
      await new Promise((r) => setTimeout(r, 450));
      const boite = document.querySelector('.cc-editor-narration');
      const btn = boite && boite.querySelector('.nia-bouton');
      if (!btn) throw new Error('le bouton « Rédiger la narration » est absent de la boîte Narration');
      btn.click();
    });
    await page.waitForTimeout(400);
    // Toutes les étapes, pas seulement les vides — ici elles sont toutes vides de toute façon.
    await page.evaluate(() => {
      const p = document.querySelector('.nia-panneau');
      if (!p || p.hidden) throw new Error('le panneau « Rédiger la narration » ne s’est pas ouvert');
      p.querySelector('.nia-generer').click();
    });
    await page.waitForFunction(() => {
      const b = document.querySelector('.nia-appliquer');
      return b && !b.disabled && /^Appliquer \(/.test(b.textContent);
    }, { timeout: 20000 });

    const libelle = await page.evaluate(() => document.querySelector('.nia-appliquer').textContent);
    assert.match(libelle, /^Appliquer \(3\)$/,
      'le bouton annonce les TROIS étapes qu’il écrira ; lu : ' + JSON.stringify(libelle));

    // ── AVANT ────────────────────────────────────────────────────────────────────────────
    const avant = await vu();
    assert.equal(avant.drapeau, false, 'repère : avant d’appliquer, rien n’est en attente');
    assert.match(avant.etat, /^Sauvegardé/, 'et l’état dit « Sauvegardé » ; lu : ' + JSON.stringify(avant.etat));
    assert.equal(avant.narrations, 0, 'et le document ne porte encore aucune narration');

    // ── LE GESTE : « Appliquer (3) » ─────────────────────────────────────────────────────
    await page.evaluate(() => document.querySelector('.nia-appliquer').click());
    await page.waitForTimeout(700);
    const apres = await vu();
    const message = await page.evaluate(() =>
      (document.querySelector('.nia-etat') || {}).textContent || '');
    assert.match(message, /3 narration\(s\) écrite\(s\) dans le document/,
      'le panneau confirme bien avoir écrit ; lu : ' + JSON.stringify(message));
    assert.equal(apres.narrations, 3, 'les 3 narrations sont RÉELLEMENT dans le document');
    assert.equal(apres.drapeau, true,
      'APRÈS « Appliquer », le drapeau « modifié » doit être LEVÉ — sinon le document a changé '
      + 'et l’écran l’ignore');
    assert.equal(apres.etat, 'Modifications non sauvegardées',
      'et l’état doit le DIRE, sinon Christophe ferme et perd les 3 narrations ; lu : '
      + JSON.stringify(apres.etat));
    pass('« Appliquer (3) » : 3 narrations écrites, drapeau levé, état « '
      + apres.etat + ' ».');

    // ── « ANNULER CE GESTE » écrit aussi dans le document ────────────────────────────────
    // On remet le drapeau à faux pour ne mesurer QUE ce que l'annulation fait. L'affichage,
    // lui, reste sur son ancien texte jusqu'au prochain rafraîchissement : c'est
    // adocEditorMarkDirty qui le remet à jour, et c'est justement ce qu'on veut mesurer.
    await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = false; });
    const avantAnnul = await vu();
    assert.equal(avantAnnul.drapeau, false, 'repère : on repart d’un document propre');
    await page.evaluate(() => document.querySelector('.nia-annuler').click());
    await page.waitForTimeout(600);
    const apresAnnul = await vu();
    assert.equal(apresAnnul.narrations, 0, 'annuler a bien retiré les 3 narrations du document');
    assert.equal(apresAnnul.drapeau, true,
      'APRÈS « Annuler ce geste », le drapeau doit être LEVÉ : annuler écrit dans le document '
      + 'tout autant qu’appliquer');
    assert.equal(apresAnnul.etat, 'Modifications non sauvegardées',
      'et l’état doit le dire ; lu : ' + JSON.stringify(apresAnnul.etat));
    pass('« Annuler ce geste » : narrations retirées, drapeau levé, état « '
      + apresAnnul.etat + ' ».');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-drapeau-narration-appliquee — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
