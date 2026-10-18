// L'INSERTION D'UNE PAGE CRÉÉE PAR LE STUDIO (lot 2C, D1 à D5), SUR LE VRAI CHEMIN.
//
// CE QUE CE CONTRÔLE N'APPELLE JAMAIS : le vrai Worker. L'appel au modèle est SIMULÉ par un
// serveur local qui répond dans la forme exacte que le cœur attend — un bloc `tool_use` nommé
// comme l'outil — et l'adresse du Worker est détournée vers lui par `localStorage.workerUrl`,
// que `adocGetWorkerUrl()` consulte avant son adresse de repli. Rien ne sort de 127.0.0.1 :
// toute requête ailleurs est refusée et consignée.
//
// CE QU'IL MESURE (D3, l'exigence qui compte) : après l'insertion, les cinq autres diapositives
// gardent les MÊMES identifiants, la MÊME narration AUX MÊMES ÉTAPES, et les MÊMES images —
// comparées par la signature de contenu que le moteur d'images calcule, étape par étape.
//
//   NODE_PATH=<playwright> node tests/verify-page-generee.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION, PAGE_SIMULEE } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };

// ── LE SERVEUR : il sert le dossier, ET il joue le modèle ───────────────────────────────────
// Une réponse POST à la racine imite la forme du Worker. Le compteur d'appels sert à prouver
// qu'un double clic n'insère pas deux pages (D2).
function servir(etat) {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      if (q.method === 'POST') {
        let corps = '';
        q.on('data', (c) => { corps += c; });
        q.on('end', () => {
          // L'APPLICATION POSTE AUSSI, pour elle-même (bibliothèque, facettes), vers la même
          // adresse détournée. Seuls les POST vers la RACINE sont des appels au modèle : tout
          // compter faisait croire à deux appels là où il n'y en avait qu'un, et aurait masqué
          // un vrai double appel.
          if (q.url !== '/') { etat.autresPosts = (etat.autresPosts || 0) + 1;
                               r.writeHead(200, { 'content-type': 'application/json' });
                               return r.end('{}'); }
          etat.appels.push({ corps: corps, quand: Date.now() });
          if (etat.refuser) { r.writeHead(500, { 'content-type': 'application/json' });
                              return r.end(JSON.stringify({ error: 'simulé' })); }
          const outil = etat.nomDOutil || 'emit_new_slide';
          r.writeHead(200, { 'content-type': 'application/json' });
          return r.end(JSON.stringify({
            content: [{ type: 'tool_use', name: outil, input: etat.reponse || PAGE_SIMULEE }],
          }));
        });
        return;
      }
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        r.writeHead(404); return r.end();
      }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream',
                         'content-length': fs.statSync(p).size });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const etat = { appels: [], refuser: false, reponse: null, nomDOutil: null };
  const { serveur, port } = await servir(etat);
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const ctx = await nav.newContext();
    const page = await ctx.newPage();
    const erreurs = [];
    const dehors = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:')) {
        return route.continue();
      }
      dehors.push(1);
      return route.abort();
    });
    // Une requête TENTÉE puis coupée n'est pas une fuite ; une RÉPONSE venue du dehors en serait
    // une. L'application appelle ses propres points d'entrée au démarrage : on les compte, et on
    // vérifie que rien ne lui est jamais revenu de l'extérieur. On n'imprime aucune adresse.
    const reponsesDehors = [];
    page.on('response', (r) => {
      const u = r.url();
      if (!(u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))) {
        reponsesDehors.push(r.status());
      }
    });
    // L'ADRESSE DU WORKER EST DÉTOURNÉE AVANT TOUT CHARGEMENT : le vrai Worker ne doit pas même
    // être joignable depuis ce contrôle.
    await page.addInitScript((p) => {
      try { localStorage.setItem('workerUrl', 'http://127.0.0.1:' + p); } catch (e) {}
    }, port);
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    await page.waitForFunction(() => typeof window.adocPresentStepList === 'function', { timeout: 30000 });

    // ── LE DOCUMENT EST OUVERT PAR L'API DE L'APPLICATION, pas par un raccourci ────────────
    const ouvert = await page.evaluate(async (doc) => {
      const cle = 'lot2c-essai';
      window._adocArtifacts = window._adocArtifacts || {};
      // LES CAPACITÉS SONT CELLES QUE L'APPLICATION POSE ELLE-MÊME pour un document structuré
      // (ligne 13659 du cœur) : sans `workspace`, `adocOpenWorkspace` rend `false` dès sa
      // deuxième ligne, et sans `blockEditing` le correcteur de bloc n'est jamais câblé. Ce
      // n'est pas un contournement : c'est l'état dans lequel un vrai document arrive.
      window._adocArtifacts[cle] = { name: doc.title, _adocGenerationEngine: 'structured',
                                     _adocStructuredDoc: JSON.parse(JSON.stringify(doc)),
                                     _adocStructuredSnapshot: null,
                                     _adocCapabilities: { workspace: true, persist: true,
                                       fineCitations: true, blockEditing: true, transform: true,
                                       export: true, qualityControlledExport: true } };
      const ok = await window.adocOpenWorkspace(cle);
      const d = window._adocArtifacts[cle]._adocStructuredDoc;
      return { ok: !!ok, diapositives: d.blocks.length,
               etapes: window.adocPresentStepList(d).length,
               kind: d.documentKind };
    }, PRESENTATION);
    assert.ok(ouvert.ok, 'le document doit s\'ouvrir dans l\'espace de travail');
    assert.equal(ouvert.diapositives, 5, '5 diapositives au départ : ' + ouvert.diapositives);
    assert.equal(ouvert.etapes, 8, '8 étapes au départ : ' + ouvert.etapes);
    pass('présentation synthétique ouverte : 5 diapositives, 8 étapes, 2 commentaires.');

    // ── L'ÉTAT AVANT : identifiants, narration par étape, et signature d'image par étape ──
    const avant = await page.evaluate(async () => {
      const d = window._adocArtifacts['lot2c-essai']._adocStructuredDoc;
      const etapes = window.adocPresentStepList(d);
      const res = await window.AtelierImages.rendreImages(d, { modeCapture: true,
        type: 'image/jpeg', qualite: 0.92 });
      return {
        cartes: d.blocks.map((c) => c.id),
        blocs: d.blocks.map((c) => (c.content.blocks || []).map((b) => b.id)),
        etapes: etapes.map((e) => e.cardId + '/' + e.stepId + '/' + e.rang + '-' + e.surRang),
        narration: (d.narration || []).map((x) => x.stepId + ' :: ' + x.text),
        images: res.images.map((im) => im.stepId + ' :: ' + im.signature),
      };
    });
    assert.equal(avant.images.length, 8, 'une image par étape avant : ' + avant.images.length);
    pass('état AVANT relevé : ' + avant.cartes.length + ' cartes, ' + avant.etapes.length
      + ' étapes, ' + avant.images.length + ' images signées.');

    // ── LE GESTE : SÉLECTIONNER UN BLOC DE LA 2e PAGE, PUIS « INSÉRER UNE PAGE APRÈS » ────
    // Le panneau du correcteur s'ancre au bloc sélectionné : on sélectionne donc par le vrai
    // chemin (un clic sur le bloc), puis on cherche le bouton. Tant qu'il n'existe pas, ce
    // contrôle doit échouer — c'est son objet.
    await page.click('#paragraph-03');
    await page.waitForFunction(() => window._adocBlockEditState
      && window._adocBlockEditState.blockId === 'paragraph-03', { timeout: 20000 });
    const panneau = await page.evaluate(() => {
      const st = window._adocBlockEditState;
      const p = st && st.panelEl;
      return { ancre: !!p, zone: st && st.zone,
               boutons: p ? [...p.querySelectorAll('button')].map((b) => (b.textContent || '').trim()) : [] };
    });
    assert.ok(panneau.ancre, 'le panneau du correcteur doit s\'ancrer au bloc sélectionné');
    const aInserer = panneau.boutons.filter((t) => /Insérer une page/i.test(t));
    assert.ok(aInserer.length >= 2,
      'le panneau doit offrir « Insérer une page avant » et « Insérer une page après » (D1) — '
      + 'boutons présents : ' + JSON.stringify(panneau.boutons));
    pass('le panneau offre les gestes de page (D1).');

    // ── L'INSERTION, AVEC L'APERÇU PUIS « INSÉRER » ───────────────────────────────────────
    await page.getByRole('button', { name: /Insérer une page après/i }).click();
    // Le champ d'instruction : une phrase suffit (D2). On l'exerce ici ; la branche « champ
    // vide, le Studio propose » est exercée plus bas.
    await page.locator('[data-page-instruction]').fill('Parler du troisieme temps, celui du retour au calme.');
    // DOUBLE CLIC sur « Créer la page » : un seul appel doit partir.
    // Les deux clics sont portés coup sur coup SUR LE BOUTON VIVANT, dans le même tour de
    // boucle : c'est ce que fait une main qui clique deux fois, et c'est le seul moment où la
    // garde est réellement mise à l'épreuve. Passer par deux clics successifs de l'automate ne
    // mesurait rien : le bouton a déjà disparu quand le second part.
    const deuxClics = (libelle) => page.evaluate((t) => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === t);
      if (!b) throw new Error('bouton introuvable : ' + t);
      b.click(); b.click();
    }, libelle);
    await deuxClics('Créer la page');
    await page.waitForFunction(() => document.querySelector('[data-page-apercu]'), { timeout: 12000 })
      .catch(async () => { console.log('>>> panneau : '
        + await page.evaluate(() => { const r = document.querySelector('.cc-block-edit-result');
            return r ? r.textContent.slice(0, 220) : '(disparu)'; })
        + '\n>>> état : ' + await page.evaluate(() => JSON.stringify(window._adocPageInsertState
            ? { enCours: window._adocPageInsertState.enCours, page: !!window._adocPageInsertState.page } : null))
        + '\n>>> appels modèle : ' + etat.appels.length + ' · autres POST : ' + (etat.autresPosts || 0)
        + '\n>>> erreurs : ' + JSON.stringify(erreurs.slice(0, 3))); throw new Error('pas d_apercu'); });
    assert.equal(etat.appels.length, 1,
      'un double clic sur « Créer la page » ne doit partir qu\'une fois : ' + etat.appels.length);
    // L'OUTIL APPELÉ EST LE NOUVEAU, ET JAMAIS LE SCHÉMA GELÉ.
    const envoye = JSON.parse(etat.appels[0].corps).payload;
    assert.equal(envoye.tool_choice && envoye.tool_choice.name, 'emit_new_slide',
      'l\'outil forcé doit être emit_new_slide : ' + JSON.stringify(envoye.tool_choice));
    assert.deepEqual((envoye.tools || []).map((t) => t.name), ['emit_new_slide'],
      'un seul outil est envoyé, et c\'est le nouveau');
    assert.ok(!/emit_presentation_document/.test(etat.appels[0].corps),
      'le schéma gelé ne doit jamais partir dans cet appel');
    assert.ok(/instruction de l|troisieme temps/i.test(JSON.stringify(envoye.system) + JSON.stringify(envoye.messages)),
      'la phrase de l\'utilisatrice doit être transmise');
    assert.ok(/aucune référence bibliographique|AUCUNE référence/i.test(envoye.system || ''),
      'la consigne « aucune référence bibliographique » doit être dans le prompt système');
    // DOUBLE CLIC sur « Insérer » : une seule page doit entrer.
    await deuxClics('Insérer');
    await page.waitForFunction(() => {
      const d = window._adocArtifacts['lot2c-essai']._adocStructuredDoc;
      return d.blocks.length === 6;
    }, { timeout: 30000 });

    // ── L'ÉTAT APRÈS, ET CE QUI NE DOIT PAS AVOIR BOUGÉ (D3) ──────────────────────────────
    const apres = await page.evaluate(async () => {
      const d = window._adocArtifacts['lot2c-essai']._adocStructuredDoc;
      const etapes = window.adocPresentStepList(d);
      const res = await window.AtelierImages.rendreImages(d, { modeCapture: true,
        type: 'image/jpeg', qualite: 0.92 });
      return {
        cartes: d.blocks.map((c) => c.id),
        titres: d.blocks.map((c) => c.content.title),
        blocs: d.blocks.map((c) => (c.content.blocks || []).map((b) => b.id)),
        etapes: etapes.map((e) => e.cardId + '/' + e.stepId + '/' + e.rang + '-' + e.surRang),
        narration: (d.narration || []).map((x) => x.stepId + ' :: ' + x.text),
        images: res.images.map((im) => im.stepId + ' :: ' + im.signature),
        validations: d.blocks[2].content.blocks.map((b) => JSON.stringify(b.validation || {})),
        relectureDocument: (d.validation || {}).humanClinicalReview,
      };
    });

    assert.equal(apres.cartes.length, 6, 'six diapositives après : ' + apres.cartes.length);
    // LA NOUVELLE EST EN 3e POSITION, et les cinq autres sont dans le même ordre.
    const sansLaNeuve = apres.cartes.filter((id) => avant.cartes.indexOf(id) >= 0);
    assert.deepEqual(sansLaNeuve, avant.cartes,
      'les cinq cartes d\'origine gardent leurs identifiants ET leur ordre : '
      + JSON.stringify(apres.cartes));
    assert.equal(apres.cartes.indexOf(sansLaNeuve[1]), 1, 'la 2e reste 2e');
    assert.ok(avant.cartes.indexOf(apres.cartes[2]) < 0,
      'la 3e doit être la carte NEUVE : ' + apres.cartes[2]);
    // LES BLOCS DES AUTRES CARTES SONT INTACTS, identifiants compris.
    const blocsAutres = apres.cartes.map((id, i) => (avant.cartes.indexOf(id) >= 0 ? apres.blocs[i] : null))
      .filter(Boolean);
    assert.deepEqual(blocsAutres, avant.blocs, 'aucun bloc des autres cartes ne change');
    // LA NARRATION EST LA MÊME, AUX MÊMES ÉTAPES.
    assert.deepEqual(apres.narration, avant.narration,
      'la narration ne doit pas bouger d\'une étape (D3) : ' + JSON.stringify(apres.narration));
    // LES ÉTAPES DES AUTRES CARTES SONT INCHANGÉES, rang et sur-rang compris.
    const etapesAutres = apres.etapes.filter((e) => avant.cartes.indexOf(e.split('/')[0]) >= 0);
    assert.deepEqual(etapesAutres, avant.etapes,
      'les étapes des autres cartes ne changent pas (D3/D4)');
    // ET LES IMAGES : même signature de contenu, étape par étape.
    const imagesAutres = apres.images.filter((x) => avant.images.some((y) => y.split(' :: ')[0] === x.split(' :: ')[0]));
    assert.deepEqual(imagesAutres, avant.images,
      'aucune image des autres étapes ne devient périmée (D3)');
    // LES BLOCS DE LA PAGE NEUVE SONT NON VALIDÉS (D2).
    // « Non validé » se mesure à deux endroits, parce que le schéma des blocs n'admet aucun
    // marqueur de relecture (seulement citationLinks, additionalProperties: false) : la
    // validation de chaque bloc neuf est VIDE — rien n'y est attesté — et c'est le DOCUMENT
    // qui porte « relecture humaine requise », là où l'application la pose elle-même.
    assert.equal(apres.relectureDocument, 'required',
      'le document doit redemander une relecture humaine : ' + apres.relectureDocument);
    assert.ok(apres.validations.length > 0
      && apres.validations.every((v) => v === '{}'),
      'chaque bloc inséré reste non validé (D2) : ' + JSON.stringify(apres.validations));
    // UN SEUL APPEL AU MODÈLE SIMULÉ, et le vrai Worker n'a jamais été joint.
    assert.equal(etat.appels.length, 1, 'un seul appel au modèle : ' + etat.appels.length);
    assert.equal(apres.cartes.length, new Set(apres.cartes).size, 'aucun identifiant de carte en double');
    const tousBlocs = apres.blocs.flat();
    assert.equal(tousBlocs.length, new Set(tousBlocs).size, 'aucun identifiant de bloc en double');
    assert.deepEqual(tousBlocs.filter((id) => avant.blocs.flat().includes(id)).sort(),
      avant.blocs.flat().sort(), 'aucun identifiant existant n\'a été réutilisé pour la page neuve');
    // On ne recrache jamais ces adresses (celle du Worker en fait partie) : un nombre suffit.
    assert.equal(reponsesDehors.length, 0,
      'aucune réponse ne doit venir de l\'extérieur ; ' + reponsesDehors.length + ' reçue(s) pour ' + dehors.length + ' tentative(s) coupée(s)');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 3)));

    console.log('      cartes après : ' + apres.cartes.join(', '));
    console.log('      neuve en 3e : ' + apres.cartes[2] + ' — « ' + apres.titres[2] + ' »');
    console.log('      narration : ' + apres.narration.length + ' commentaire(s), inchangés');
    pass('page insérée en 3e position : 6 diapositives, identifiants, narration, étapes et '
      + 'images des cinq autres inchangés (D1 à D4).');
  } finally {
    await nav.close();
    serveur.close();
  }
  console.log('\nPASS verify-page-generee — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
