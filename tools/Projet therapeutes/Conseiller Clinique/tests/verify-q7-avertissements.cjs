// Q7, 2.4 et 2.5 — L'AVERTISSEMENT AVANT DE PERDRE SON TRAVAIL.
//
// Q7 exige « un avertissement avant de fermer le document ou d'en ouvrir un autre avec des
// modifications non enregistrées ». Sans lui, fermer l'espace de travail jette en silence tout
// ce qui n'a pas été enregistré : c'est la perte de travail, pas le confort, qui est en jeu.
//
// Le composant de confirmation est celui qui EXISTE DÉJÀ dans le cœur — le confirm() natif,
// utilisé partout ailleurs (suppression d'un document, retrait d'une charte, lien vidéo,
// document supprimé entre-temps). Aucun second mécanisme n'est introduit.
//
// Chaque contrôle mesure : la question a-t-elle été posée, avec quel texte, et qu'advient-il
// d'un REFUS comme d'une ACCEPTATION.
//
//   NODE_PATH=<playwright> node tests/verify-q7-avertissements.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const { serveur, etat } = creerFauxWorker(RACINE, {});
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port; const base = 'http://127.0.0.1:' + port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));

  // Les questions posées à l'utilisatrice sont RELEVÉES, jamais seulement acceptées : c'est leur
  // texte et leur nombre qui sont mesurés. `reponse` décide du refus ou de l'acceptation.
  let questions = [];
  let reponse = false;
  page.on('dialog', async (d) => {
    questions.push({ type: d.type(), texte: d.message() });
    if (d.type() === 'beforeunload' || reponse) await d.accept().catch(() => {});
    else await d.dismiss().catch(() => {});
  });
  await page.route('**/*', (r) => { const u = r.request().url();
    return (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
  await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
    localStorage.setItem('workerApiKey', 'factice'); } catch (e) {} }, base);

  const ouvrir = (sale) => page.evaluate(async (a) => {
    window._adocArtifacts = { e: { name: a.d.title, _adocGenerationEngine: 'structured',
      _adocStructuredDoc: JSON.parse(JSON.stringify(a.d)), _adocStructuredSnapshot: null,
      _adocClinicalDocumentId: null, _ccEditorDirty: false,
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
        blockEditing: true, transform: true, export: true, qualityControlledExport: true } } };
    await window.adocOpenWorkspace('e');
    window._adocArtifacts.e._ccEditorDirty = !!a.sale;
    window.adocUpdateSaveStatusUI && window.adocUpdateSaveStatusUI(window._adocArtifacts.e);
    await new Promise((r) => setTimeout(r, 200));
  }, { d: PRESENTATION, sale: sale });
  const ouvert = () => page.evaluate(() =>
    document.getElementById('cc-workspace').classList.contains('open'));
  const versions = () => [...etat.documents.values()].reduce((t, d) => t + d.versions.length, 0);

  try {
    await page.goto(base + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });

    // ── 2.4 — FERMETURE ──────────────────────────────────────────────────────
    // (1) Modifications en attente + REFUS : la question est posée, et l'espace de travail
    //     RESTE OUVERT. C'est le contrôle qui compte : un avertissement qu'on peut refuser mais
    //     qui ferme quand même ne protège rien.
    await ouvrir(true); questions = []; reponse = false;
    await page.evaluate(() => window.adocCloseWorkspace());
    await page.waitForTimeout(300);
    assert.equal(questions.length, 1,
      'fermer avec des modifications en attente pose UNE question ; posées : ' + questions.length);
    assert.match(questions[0].texte, /modifications non enregistrées/i,
      'la question nomme les modifications non enregistrées ; lue : ' + JSON.stringify(questions[0].texte));
    assert.equal(await ouvert(), true, 'un REFUS laisse l’espace de travail ouvert');
    pass('fermeture avec des modifications en attente : la question est posée et un refus ne ferme rien.');

    // (2) Modifications en attente + ACCEPTATION : l'espace de travail se ferme.
    questions = []; reponse = true;
    await page.evaluate(() => window.adocCloseWorkspace());
    await page.waitForTimeout(300);
    assert.equal(questions.length, 1, 'une seule question à l’acceptation');
    assert.equal(await ouvert(), false, 'une ACCEPTATION ferme bien l’espace de travail');
    pass('fermeture avec des modifications en attente : une acceptation ferme.');

    // (3) RIEN en attente : AUCUNE question. Un avertissement qui se déclenche à tort rend
    //     l'application pénible et apprend à cliquer « oui » sans lire.
    await ouvrir(false); questions = []; reponse = false;
    await page.evaluate(() => window.adocCloseWorkspace());
    await page.waitForTimeout(300);
    assert.deepEqual(questions, [], 'sans modification en attente, aucune question : '
      + JSON.stringify(questions));
    assert.equal(await ouvert(), false, 'et la fermeture a bien eu lieu');
    pass('fermeture sans modification en attente : aucune question, fermeture immédiate.');

    // ── 2.4 — OUVERTURE D'UN AUTRE DOCUMENT ──────────────────────────────────
    // Un document enregistré existe chez le serveur : on l'ouvrira depuis « Mes créations ».
    await ouvrir(false);
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(800);
    const idEnregistre = [...etat.documents.keys()][0];
    assert.ok(idEnregistre, 'le faux Worker détient bien un document enregistré');

    // (4) Modifications en attente + REFUS : la question est posée et le document COURANT reste.
    await ouvrir(true);
    const titreAvant = await page.evaluate(() => window._adocArtifacts.e._adocStructuredDoc.title);
    await page.evaluate(() => { window._adocArtifacts.e._adocStructuredDoc.title = 'Titre modifié, pas enregistré'; });
    questions = []; reponse = false;
    const resultat = await page.evaluate((id) => window.adocOpenSavedClinicalDocument(id), idEnregistre);
    await page.waitForTimeout(400);
    assert.equal(questions.length, 1,
      'ouvrir un autre document avec des modifications en attente pose UNE question ; posées : '
      + questions.length);
    assert.match(questions[0].texte, /modifications non enregistrées/i,
      'la question nomme les modifications non enregistrées ; lue : ' + JSON.stringify(questions[0].texte));
    assert.equal(resultat, false, 'un refus renvoie faux : l’ouverture n’a pas eu lieu');
    assert.equal(await page.evaluate(() => window._adocWsState.storeKey), 'e',
      'le document COURANT est toujours celui qui est ouvert');
    assert.equal(await page.evaluate(() => window._adocArtifacts.e._adocStructuredDoc.title),
      'Titre modifié, pas enregistré',
      'et la modification non enregistrée est intacte');
    pass('ouverture d’un autre document avec des modifications en attente : question posée, refus = rien ne bouge.');

    // (5) Modifications en attente + ACCEPTATION : l'autre document s'ouvre.
    questions = []; reponse = true;
    const ouvre = await page.evaluate((id) => window.adocOpenSavedClinicalDocument(id), idEnregistre);
    await page.waitForTimeout(600);
    assert.equal(questions.length, 1, 'une seule question à l’acceptation ; posées : ' + questions.length);
    assert.equal(ouvre, true, 'une acceptation ouvre bien l’autre document');
    assert.equal(await page.evaluate(() => window._adocWsState.storeKey),
      'adocArt_saved_' + idEnregistre, 'et c’est bien l’autre document qui est ouvert');
    assert.equal(titreAvant, PRESENTATION.title, 'repère de lecture du titre d’origine');
    pass('ouverture d’un autre document avec des modifications en attente : une acceptation ouvre.');

    // (6) RIEN en attente : aucune question à l'ouverture d'un autre document.
    await ouvrir(false); questions = []; reponse = false;
    const sansQuestion = await page.evaluate((id) => window.adocOpenSavedClinicalDocument(id), idEnregistre);
    await page.waitForTimeout(600);
    assert.deepEqual(questions, [], 'sans modification en attente, aucune question : '
      + JSON.stringify(questions));
    assert.equal(sansQuestion, true, 'et l’ouverture a bien eu lieu');
    pass('ouverture d’un autre document sans modification en attente : aucune question.');

    // ── 2.5 — DOCUMENT SUPPRIMÉ ENTRE-TEMPS ──────────────────────────────────
    // Mécanisme DÉJÀ présent dans le cœur (404 sur POST .../versions) : ce contrôle le MESURE,
    // il ne l'ajoute pas. Une acceptation doit créer un NOUVEAU document, pas écraser.
    await ouvrir(false);
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(800);
    const idVictime = await page.evaluate(() => window._adocArtifacts.e._adocClinicalDocumentId);
    assert.ok(idVictime, 'le document a bien été enregistré avant d’être supprimé');
    etat.documents.delete(idVictime);
    etat.supprimes.add(idVictime);
    const avant = versions();
    questions = []; reponse = true;
    await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = true; });
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(900);
    assert.equal(questions.length, 1,
      'un document supprimé entre-temps pose UNE question ; posées : ' + questions.length);
    assert.match(questions[0].texte, /supprimé/i,
      'la question dit que le document a été supprimé ; lue : ' + JSON.stringify(questions[0].texte));
    assert.equal(versions(), avant + 1, 'une acceptation crée un NOUVEAU document avec sa version');
    assert.notEqual(await page.evaluate(() => window._adocArtifacts.e._adocClinicalDocumentId),
      idVictime, 'et son identifiant n’est plus celui du document supprimé');
    assert.equal(await page.evaluate(() => !!window._adocArtifacts.e._adocEnregistreA), true,
      'l’état dit bien « enregistré » après cette création');
    pass('document supprimé entre-temps : la question est posée, une acceptation crée un nouveau document.');

    // (7) Et un REFUS ne crée RIEN, sans perdre les modifications.
    await ouvrir(false);
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(800);
    const idVictime2 = await page.evaluate(() => window._adocArtifacts.e._adocClinicalDocumentId);
    etat.documents.delete(idVictime2);
    const avant2 = versions();
    questions = []; reponse = false;
    await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = true; });
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(900);
    assert.equal(questions.length, 1, 'une question est posée ; posées : ' + questions.length);
    assert.equal(versions(), avant2, 'un REFUS ne crée aucun document ni aucune version');
    assert.equal(await page.evaluate(() => window._adocArtifacts.e._ccEditorDirty), true,
      'et les modifications restent en attente, jamais déclarées enregistrées');
    pass('document supprimé entre-temps : un refus ne crée rien et ne perd rien.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-q7-avertissements — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
