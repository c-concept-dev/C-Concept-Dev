// COMPATIBILITÉ ASCENDANTE — un document portant un champ INCONNU s'ouvre, et le champ survit.
//
// EXIGENCE (CDC, non fonctionnelle) : « Tout champ ajouté au document est facultatif et son
// absence donne l'affichage actuel ; un document portant un champ inconnu s'ouvre avec un
// avertissement en console et le champ est conservé à la sauvegarde ; une vraie erreur (type
// invalide, champ obligatoire manquant, type de bloc inconnu) reste refusée et la sortie du
// modèle reste validée strictement. »
//
// POURQUOI. Mesuré le 20 octobre : l'ancien code REFUSE un document portant `titleStyle`
// (« must NOT have additional properties »). Conséquence : annuler un lot qui ajoute un champ
// rendrait inouvrables les documents déjà sauvegardés. Ce socle enlève ce mur — sans jamais
// relâcher une vraie erreur, ni la sortie du modèle.
//
// COMMENT la tolérance est décidée : à l'échec strict, on REVALIDE contre une copie des schémas
// dont `additionalProperties: false` est retiré récursivement. Si la revalidation passe, le seul
// défaut était un champ inconnu. Un filtre « toutes les erreurs sont de classe
// additionalProperties » NE SUFFIRAIT PAS : le refus réel porte aussi des erreurs `oneOf` et
// `then`, conséquences de la première — mesuré.
//
//   NODE_PATH=<playwright> node tests/verify-tolerance-champs-inconnus.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// Les champs inconnus de l'étape suivante (Q1), utilisés ici comme fixture SYNTHÉTIQUE.
const VALEUR_CARTE = { reglage: 'carte', intensite: 20, teinte: '#8a3f29' };
const VALEUR_RACINE = { reglage: 'racine', intensite: 26 };

const base = () => ({ schemaVersion: 1, documentId: 'tol', versionId: 'tol-v1',
  previousVersionId: null, requestId: 'r', sourceSnapshotId: 's',
  createdAt: '2026-10-20T09:00:00Z', language: 'fr', status: 'draft',
  title: 'Document de tolérance', purpose: 'Essai', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  blocks: [{ id: 'c1', type: 'card',
    content: { title: 'Première page', imageRef: null, imageAlt: null,
      blocks: [{ id: 'p1', type: 'paragraph', content: { text: 'Un paragraphe d’origine.' },
        citationIds: [], validation: {} }] }, citationIds: [], validation: {} }],
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                accessibility: 'pending', humanClinicalReview: 'required' }, narration: [] });

// LE NOM DU CHAMP D'ESSAI, ET POURQUOI IL A CHANGÉ (20 octobre).
// Ce contrôle a d'abord pris `titleStyle` comme champ inconnu, parce que c'était le cas RÉEL
// mesuré avant l'étape 1a. Le lot Q1 ajoute justement `titleStyle` aux schémas : le champ
// devient CONNU, le document valide strictement, aucun avertissement n'est émis, et ce contrôle
// tombait sur le résultat fusionné — mesuré. Un contrôle de compatibilité ascendante ne peut pas
// dépendre d'un champ qu'un lot futur rendra légitime : il lui faut un nom qu'aucun lot
// n'ajoutera jamais. D'où `__champDEssaiInconnu`, réservé aux essais.
const CHAMP = '__champDEssaiInconnu';

function avecChampsInconnus() {
  const d = base();
  d[CHAMP] = VALEUR_RACINE;
  d.blocks[0].content[CHAMP] = VALEUR_CARTE;
  return d;
}

(async () => {
  const { serveur, etat } = creerFauxWorker(RACINE, {});
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [], avertissements = [], alertes = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'warning') avertissements.push(m.text()); });
  page.on('dialog', (d) => { alertes.push(d.message()); d.accept().catch(() => {}); });
  await page.route('**/*', (r) => { const u = r.request().url();
    return (u.startsWith(url + '/') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
  await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
    localStorage.setItem('workerApiKey', 'factice'); } catch (e) {} }, url);

  // Rendre : on appelle le VRAI point d'entrée du rendu, celui qu'emprunte toute ouverture.
  const rendre = (doc) => page.evaluate(async (d) => {
    try {
      const r = await window.adocRenderClinicalDocument(d,
        { sourceSnapshotId: d.sourceSnapshotId, entries: [] }, null);
      return { ok: true, octets: (r.html || '').length };
    } catch (e) { return { ok: false, message: String(e.message).slice(0, 300) }; }
  }, doc);

  try {
    await page.goto(url + '/studio-clinique.html?atelier-local=1');
    await page.evaluate((d) => { window.__docTolBase = d; }, base());
    await page.waitForFunction(() => typeof window.adocRenderClinicalDocument === 'function', { timeout: 30000 });

    // ── 1. UN DOCUMENT PORTANT DES CHAMPS INCONNUS S'OUVRE ────────────────────────────────
    avertissements.length = 0;
    const r1 = await rendre(avecChampsInconnus());
    assert.equal(r1.ok, true,
      'un document portant des champs inconnus doit se rendre ; refus : ' + r1.message);
    const avert = avertissements.filter((a) => /compatibilit|inconnu/i.test(a));
    assert.ok(avert.length >= 1,
      'un avertissement en console doit le dire ; avertissements vus : '
      + JSON.stringify(avertissements.slice(0, 3)));
    assert.match(avert[0], new RegExp('/' + CHAMP),
      'l’avertissement nomme les CHEMINS exacts ; lu : ' + JSON.stringify(avert[0]));
    assert.match(avert[0], new RegExp('/blocks/0/content/' + CHAMP),
      'y compris celui de la carte ; lu : ' + JSON.stringify(avert[0]));
    pass('document à champs inconnus : rendu, et l’avertissement nomme les deux chemins.');

    // ── 2. LES VRAIES ERREURS RESTENT REFUSÉES ────────────────────────────────────────────
    const FAUTES = [
      ['type invalide', (d) => { d.blocks[0].content.title = 42; }],
      ['champ obligatoire manquant', (d) => { delete d.blocks[0].content.title; }],
      ['type de bloc inconnu', (d) => { d.blocks[0].type = 'type-inexistant'; }],
      ['structure oneOf cassée', (d) => { d.blocks[0].content.blocks = 'pas un tableau'; }],
      ['documentKind incohérent', (d) => { d.documentKind = 'fiche'; }],
      ['champ inconnu ET vraie erreur', (d) => { d[CHAMP] = VALEUR_RACINE; d.title = 123; }],
    ];
    for (const [nom, casser] of FAUTES) {
      const d = base(); casser(d);
      const r = await rendre(d);
      assert.equal(r.ok, false, nom + ' : doit RESTER refusé, mais le rendu a réussi');
      assert.match(String(r.message), /Validation de schéma échouée/,
        nom + ' : le message doit être celui d’avant ; lu : ' + r.message);
    }
    pass('les ' + FAUTES.length + ' vraies erreurs restent refusées, avec le message d’avant.');

    // ── 3. D8 ET LA SORTIE DU MODÈLE RESTENT STRICTS ──────────────────────────────────────
    // Ce que le code fait, lu puis mesuré. adocPageNeuveCandidat reconstruit chaque bloc CHAMP
    // PAR CHAMP ({id, type, content, citationIds, validation}) mais copie `content` EN BLOC
    // (JSON.parse(JSON.stringify(b.content))). Deux conséquences distinctes :
    //   — un champ inventé À CÔTÉ de `type` est JETÉ à la reconstruction : la page est valide, et
    //     l'exiger refusée serait exiger le mauvais comportement (un contrôle existant le dit
    //     déjà — verify-page-generee-imparfaite — et il a raison) ;
    //   — un champ inventé DANS `content` ATTEINT le candidat, et D8 doit le REFUSER.
    // C'est le second qui éprouve la strictesse, et c'est lui qu'on mesure, sur le validateur
    // STRICT que D8 emploie — celui que le cœur exporte, inchangé par ce lot.
    const refusStrict = await page.evaluate(() => {
      const d = JSON.parse(JSON.stringify(window.__docTolBase));
      d.blocks[0].content.blocks[0].content.inventeDansContent = 1;
      const r = window.adocValidateSchema('clinicalDocument', d);
      return { valid: r.valid, errors: (r.errors || []).join(' | ').slice(0, 220) };
    });
    assert.equal(refusStrict.valid, false,
      'le validateur STRICT doit refuser un champ inconnu DANS content — c’est celui que D8 '
      + 'emploie, et il ne doit jamais devenir tolérant ; obtenu : ' + JSON.stringify(refusStrict));
    assert.match(refusStrict.errors, /must NOT have additional properties/,
      'avec le message d’avant ; lu : ' + refusStrict.errors);
    // Et le même document passe par la voie TOLÉRANTE : les deux cohabitent sans se confondre.
    const tolere = await page.evaluate(() => {
      const d = JSON.parse(JSON.stringify(window.__docTolBase));
      d.blocks[0].content.blocks[0].content.inventeDansContent = 1;
      return window.adocRenderClinicalDocument(d,
        { sourceSnapshotId: d.sourceSnapshotId, entries: [] }, null)
        .then(() => true).catch(() => false);
    });
    assert.equal(tolere, true,
      'le MÊME document doit se rendre par la voie tolérante : strict et tolérant cohabitent');
    pass('strict et tolérant cohabitent : le validateur de D8 refuse un champ inconnu dans '
      + '`content`, la voie d’ouverture le tolère.');

    // Et le site d'appel de D8 est bien resté sur le validateur strict — lu dans la source.
    const sourceD8 = await page.evaluate(async () => {
      const t = await (await fetch('studio-clinique-core.js')).text();
      const i = t.indexOf('function adocPageNeuveRefus');
      return t.slice(i, i + 260);
    });
    assert.match(sourceD8, /adocValidateSchema\('clinicalDocument'/,
      'adocPageNeuveRefus doit appeler le validateur STRICT ; lu : ' + JSON.stringify(sourceD8.slice(0, 180)));
    assert.doesNotMatch(sourceD8, /adocValidateSchemaTolerant/,
      'et jamais le tolérant');
    pass('adocPageNeuveRefus (D8) appelle toujours adocValidateSchema, jamais le tolérant.');

    // ── 4. OUVRIR, MODIFIER, SAUVEGARDER, ROUVRIR : le champ est PRÉSERVÉ ─────────────────
    await page.evaluate(async (d) => {
      window._adocArtifacts = { t: { name: d.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: JSON.parse(JSON.stringify(d)),
        _adocStructuredSnapshot: { sourceSnapshotId: d.sourceSnapshotId, entries: [] },
        _adocClinicalDocumentId: null, _ccEditorDirty: false,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } } };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 't' });
      if (!await window.adocOpenWorkspace('t')) throw new Error('ouverture refusée');
    }, avecChampsInconnus());
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const d = window._adocArtifacts.t._adocStructuredDoc;
      const el = document.getElementById(d.blocks[0].content.blocks[0].id);
      const leaf = el.matches('[data-cc-editor-leaf]') ? el : el.querySelector('[data-cc-editor-leaf]');
      leaf.dispatchEvent(new Event('focusin', { bubbles: true })); leaf.focus();
      leaf.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: ' modifié' }));
      leaf.textContent = 'Un paragraphe modifié.';
      leaf.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' modifié' }));
      await new Promise((r) => setTimeout(r, 400));
    });
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(1100);
    const id = await page.evaluate(() => window._adocArtifacts.t._adocClinicalDocumentId);
    assert.ok(id, 'le document doit être sauvegardé');
    const ecrit = [...etat.documents.values()][0].versions.slice(-1)[0].charge.document.clinicalDocument;
    assert.deepEqual(ecrit.blocks[0].content[CHAMP], VALEUR_CARTE,
      'le champ de la carte doit être ÉCRIT tel quel ; lu : ' + JSON.stringify(ecrit.blocks[0].content[CHAMP]));
    assert.deepEqual(ecrit[CHAMP], VALEUR_RACINE,
      'le champ de la racine aussi ; lu : ' + JSON.stringify(ecrit[CHAMP]));
    assert.equal(ecrit.blocks[0].content.blocks[0].content.text, 'Un paragraphe modifié.',
      'et la modification est bien là');
    const rouvert = await page.evaluate((i) => window.adocOpenSavedClinicalDocument(i), id);
    await page.waitForTimeout(900);
    assert.equal(rouvert, true, 'le document se rouvre');
    const relu = await page.evaluate((c) => {
      const d = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
      return { carte: d.blocks[0].content[c], racine: d[c] };
    }, CHAMP);
    assert.deepEqual(relu.carte, VALEUR_CARTE, 'à la réouverture, le champ de la carte est identique');
    assert.deepEqual(relu.racine, VALEUR_RACINE, 'et celui de la racine aussi');
    pass('ouvrir, modifier, sauvegarder, rouvrir : les champs inconnus sont PRÉSERVÉS, identiques.');

    // ── 5. SANS CHAMP INCONNU : AUCUN AVERTISSEMENT, ET LE RENDU EST LE MÊME ──────────────
    avertissements.length = 0;
    const r5 = await rendre(base());
    assert.equal(r5.ok, true, 'un document ordinaire se rend');
    assert.deepEqual(avertissements.filter((a) => /compatibilit|inconnu/i.test(a)), [],
      'un document SANS champ inconnu ne doit déclencher AUCUN avertissement ; vus : '
      + JSON.stringify(avertissements.slice(0, 2)));
    pass('document ordinaire : aucun avertissement, le chemin strict n’est même pas quitté.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-tolerance-champs-inconnus — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
