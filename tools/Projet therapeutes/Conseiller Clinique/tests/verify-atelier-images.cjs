// CHUTIER VISUEL — LE MOTEUR (lot 2, exigences V1 à V7 du CDC v2).
//
// Tout est mesuré dans un vrai navigateur : SnapDOM lit la mise en page réelle, et rien de ce
// qu'il produit ne peut être vérifié sous Node seul.
//
// CE QUE CE TEST NE PROUVE PAS, et qui appartient à Christophe : que la netteté du texte agrandi
// soit acceptable en vidéoprojection, et que les captures soient fidèles dans SON Safari. Ce
// Chromium n'est pas son Safari.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-atelier-images.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');

const http = require('node:http');

const RACINE = path.join(__dirname, '..');
const SNAPDOM_SHA256 = '0932f35f12bc0137f9857cc965949d69afb986333fd5884c0ffeaf922bc932e9';

// SERVI EN HTTP, et non en file://. Ce n'est pas un confort : Chromium REFUSE d'importer un
// module ES depuis file:// (« Failed to fetch dynamically imported module »), et SnapDOM est un
// module. Mesuré en le tentant. C'est aussi l'environnement réel de l'application, qui tourne en
// https — un test en file:// aurait validé un chemin que la production n'emprunte jamais.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
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
  // ── 1. La copie épinglée de SnapDOM est bien celle qui a servi aux mesures du lot 0 ─────────
  const chemin = path.join(RACINE, 'vendor', 'snapdom.mjs');
  const octets = fs.readFileSync(chemin);
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'), SNAPDOM_SHA256,
    'vendor/snapdom.mjs n\'est plus la copie épinglée : les mesures de netteté du lot 0 ne s\'y appliquent plus');
  assert.match(octets.slice(0, 200).toString('utf8'), /v3\.3\.0/, 'l\'en-tête doit annoncer 3.3.0');
  pass('SnapDOM épinglé : v3.3.0, SHA-256 conforme (' + octets.length + ' octets).');

  const { serveur, port } = await servir();
  const PAGE = 'http://127.0.0.1:' + port + '/studio-clinique.html';
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.AtelierImages === 'object'
      && typeof window.adocPresentStepList === 'function'
      && typeof window.adocValidateSchema === 'function');
    await page.evaluate((imgs) => { window.ADOC_EXPORT_IMAGES = imgs; }, IMAGES_EMBARQUEES);

    // ── 2. Les trois présentations d'essai sont valides pour le vrai AJV ──────────────────────
    // Sans cela, tout ce qui suit mesurerait le rendu de documents que l'application refuserait.
    const validites = await page.evaluate((docs) => docs.map((d) => {
      const r = window.adocValidateSchema('clinicalDocument', d.doc);
      return { cle: d.cle, valid: !!r.valid, skipped: !!r.skipped, erreurs: (r.errors || []).slice(0, 3).map(String) };
    }), PRESENTATIONS);
    validites.forEach((v) => {
      assert.equal(v.skipped, false, 'AJV doit être actif');
      assert.equal(v.valid, true, 'présentation « ' + v.cle +' » invalide : ' + v.erreurs.join(' | '));
    });
    pass('les trois présentations d\'essai valident contre le schéma réel.');

    // ── 3. Le moteur refuse ce qui n'est pas une Présentation ─────────────────────────────────
    const refus = await page.evaluate(async (d) => {
      const copie = JSON.parse(JSON.stringify(d)); copie.documentKind = 'fiche';
      try { await window.AtelierImages.rendreImages(copie); return null; }
      catch (e) { return String(e.message); }
    }, PRESENTATIONS[0].doc);
    assert.match(String(refus), /ne rend que des Présentations/, 'un document non-Présentation doit être refusé : ' + refus);
    pass('un document qui n\'est pas une Présentation est refusé, avec son documentKind nommé.');

    // ── 4. Une image par étape, et la taille exacte ───────────────────────────────────────────
    const rendus = {};
    for (const p of PRESENTATIONS) {
      const r = await page.evaluate(async (d) => {
        const etapes = window.adocPresentStepList(d);
        const avantEtat = window._adocPresentState;
        const res = await window.AtelierImages.rendreImages(d);
        return {
          etapes: etapes.length,
          etatRendu: window._adocPresentState === avantEtat,
          modeRendu: window._adocPresentModeCapture,
          scenesRestantes: document.querySelectorAll('[data-atelier-scene]').length,
          meta: {
            duree_ms: res.duree_ms, octets_total: res.octets_total, mode_capture: res.mode_capture,
            etapes_annoncees: res.etapes_annoncees, snapdom: res.snapdom,
          },
          images: res.images.map((im) => ({
            stepId: im.stepId, cardId: im.cardId, cardIndex: im.cardIndex, rang: im.rang,
            surRang: im.surRang, largeur: im.largeur, hauteur: im.hauteur,
            debordement: im.debordement, hauteurScene: im.hauteurScene,
            signature: im.signature, octets: im.octets, type: im.type, textes: im.textes,
          })),
        };
      }, p.doc);
      rendus[p.cle] = r;
      assert.equal(r.images.length, r.etapes,
        p.cle + ' : ' + r.images.length + ' images pour ' + r.etapes + ' étapes');
      assert.equal(r.etapes_annoncees === undefined ? r.meta.etapes_annoncees : r.etapes_annoncees, r.etapes);
      r.images.forEach((im) => {
        assert.equal(im.largeur, 1920, p.cle + '/' + im.stepId + ' : largeur ' + im.largeur);
        if (!im.debordement) {
          assert.equal(im.hauteur, 1080, p.cle + '/' + im.stepId + ' : hauteur ' + im.hauteur + ' sans débordement');
          assert.equal(im.hauteurScene, 800, p.cle + '/' + im.stepId + ' : hauteur de scène ' + im.hauteurScene);
        } else {
          assert.ok(im.hauteurScene > 800, 'un débordement doit porter sa hauteur de scène');
          assert.equal(im.hauteur, Math.round(im.hauteurScene * 1920 / 1422),
            p.cle + '/' + im.stepId + ' : hauteur de sortie incohérente avec la hauteur de scène');
        }
        assert.ok(im.octets > 2000, 'une image de ' + im.octets + ' octets est forcément vide');
      });
      assert.equal(r.etatRendu, true, 'l\'état du lecteur doit être rendu tel qu\'il était');
      assert.equal(r.scenesRestantes, 0, 'aucune scène hors écran ne doit subsister');
      console.log('      ' + p.cle.padEnd(14) + r.images.length + ' images, '
        + (r.meta.octets_total / 1048576).toFixed(2) + ' Mo, ' + r.meta.duree_ms + ' ms, '
        + Math.round(r.meta.duree_ms / r.images.length) + ' ms par image'
        + (r.images.some((i) => i.debordement) ? '   (débordement : ' + r.images.filter((i) => i.debordement).map((i) => i.hauteurScene + 'px').join(', ') + ')' : ''));
    }
    pass('une image par étape sur les trois présentations, largeur 1920 et hauteur exacte.');

    // ── 5. Le texte du DOM au moment de la capture est le texte FINAL ─────────────────────────
    // Le défaut à rendre impossible : une capture partie pendant l'animation de nombre, qui
    // montrait 16 % au lieu de 37 % au lot 0.
    //
    // LE CRITÈRE, et pourquoi ce n'est pas un motif. Premier jet : « aucun texte capturé ne
    // commence par un chiffre autre que la valeur finale ». Il tombait sur « 1. Vous evitez… » —
    // une question NUMÉROTÉE du questionnaire, qui commence par un chiffre sans rien animer. Le
    // critère retenu ne devine rien : pour chaque image, le k-ième bloc révélé doit porter
    // EXACTEMENT le texte final du k-ième bloc de sa carte, tel qu'il est dans le document. Une
    // valeur intermédiaire échoue par construction, et une question numérotée passe.
    const normaliser = (t) => String(t || '').trim().replace(/\s+/g, ' ');
    const PORTEURS = ['paragraph', 'heading', 'callout', 'quote'];
    let blocsCompares = 0, chiffresCompares = 0;
    for (const p of PRESENTATIONS) {
      const r = rendus[p.cle];
      for (const im of r.images) {
        const carte = p.doc.blocks.find((c) => c.id === im.cardId);
        const blocs = carte.content.blocks;
        assert.equal(im.textes.length, Math.max(1, im.rang),
          p.cle + '/' + im.stepId + ' : ' + im.textes.length + ' blocs visibles pour l\'étape ' + im.rang);
        for (let k = 0; k < im.textes.length; k++) {
          const b = blocs[k];
          if (!b || PORTEURS.indexOf(b.type) === -1) continue;
          const attendu = normaliser(b.content.text);
          assert.ok(normaliser(im.textes[k]).indexOf(attendu) === 0,
            p.cle + '/' + im.stepId + ' bloc ' + k + ' : le DOM portait « ' + normaliser(im.textes[k]).slice(0, 48)
            + ' » au lieu de « ' + attendu.slice(0, 48) + ' »');
          blocsCompares++;
          if (/^\d/.test(attendu)) chiffresCompares++;
        }
      }
    }
    assert.ok(blocsCompares >= 10, 'il faut comparer un nombre réel de blocs, pas deux : ' + blocsCompares);
    assert.ok(chiffresCompares >= 2, 'au moins deux blocs commençant par un chiffre doivent être comparés, trouvé ' + chiffresCompares);
    const tousLesTextes = Object.values(rendus).flatMap((r) => r.images).flatMap((im) => im.textes).join(' | ');
    assert.ok(/37 % des personnes/.test(tousLesTextes), 'la valeur finale « 37 % » doit être dans une capture');
    assert.ok(/12 semaines/.test(tousLesTextes), 'la valeur finale « 12 semaines » doit être dans une capture');
    pass('texte du DOM conforme au document pour ' + blocsCompares + ' blocs capturés, dont '
      + chiffresCompares + ' commençant par un chiffre : aucune valeur intermédiaire.');

    // ── 6. Le questionnaire DÉBORDE, et il faut l'exiger, pas le constater ────────────────────
    // Premier jet : cette section se contentait d'imprimer les débordements trouvés. La
    // falsification l'a montré creux — un moteur qui ne détecterait AUCUN débordement passait le
    // test, puisque le contrôle 4 n'exige la hauteur de scène de 800 que s'il n'y a pas de
    // débordement. Le questionnaire doit donc en produire au moins un, et c'est affirmé ici.
    const debordants = Object.values(rendus).flatMap((r) => r.images).filter((im) => im.debordement);
    const debordantsQuestionnaire = rendus.questionnaire.images.filter((im) => im.debordement);
    assert.ok(debordantsQuestionnaire.length >= 1,
      'le questionnaire DOIT déborder de la scène de 800 px et être capturé sur toute sa hauteur (V3) ; '
      + 'aucun débordement détecté, hauteurs de scène : '
      + rendus.questionnaire.images.map((im) => im.hauteurScene).join(', '));
    debordantsQuestionnaire.forEach((im) => {
      assert.ok(im.hauteurScene > 800, 'hauteur de scène ' + im.hauteurScene);
      assert.ok(im.hauteur > 1080, 'une image débordante doit être plus haute que 1080 : ' + im.hauteur);
    });
    console.log('      débordements : ' + debordants.map((im) => im.stepId + ' → ' + im.hauteurScene
      + 'px de scène, image ' + im.largeur + 'x' + im.hauteur).join(' ; '));
    pass('le questionnaire déborde, est capturé sur toute sa hauteur, et la porte dans ses métadonnées (V3).');

    // ── 7. La signature change quand le contenu change, et seulement alors ────────────────────
    const sig = await page.evaluate(async (d) => {
      const base = JSON.parse(JSON.stringify(d));
      const etapes = window.adocPresentStepList(base);
      const avant = await window.AtelierImages.signatureEtape(base, etapes[0]);
      // (a) même document, deux fois : même signature.
      const encore = await window.AtelierImages.signatureEtape(JSON.parse(JSON.stringify(base)), etapes[0]);
      // (b) clés réordonnées : même signature (canonicalisation).
      const reordonne = JSON.parse(JSON.stringify(base));
      const c = reordonne.blocks[0].content;
      reordonne.blocks[0].content = { blocks: c.blocks, imageAlt: c.imageAlt, imageRef: c.imageRef, title: c.title };
      const apresOrdre = await window.AtelierImages.signatureEtape(reordonne, window.adocPresentStepList(reordonne)[0]);
      // (c) texte d'un bloc modifié : signature différente.
      const modifie = JSON.parse(JSON.stringify(base));
      modifie.blocks[0].content.blocks[0].content.text += ' (modifié)';
      const apresTexte = await window.AtelierImages.signatureEtape(modifie, window.adocPresentStepList(modifie)[0]);
      // (d) un bloc AJOUTÉ EN FIN de carte change l'étape 1, parce que les blocs cachés occupent
      //     leur place (opacity:0 + visibility:hidden conservent la mise en page).
      const ajoute = JSON.parse(JSON.stringify(base));
      ajoute.blocks[1].content.blocks.push({ id: 'paragraph-99', type: 'paragraph',
        content: { text: 'Un bloc de plus.' }, citationIds: [], validation: {} });
      const etapesAjoute = window.adocPresentStepList(ajoute);
      const premiereDeLaCarte2 = etapesAjoute.find((e) => e.cardId === 'slide-02');
      const apresAjout = await window.AtelierImages.signatureEtape(ajoute, premiereDeLaCarte2);
      const avantCarte2 = await window.AtelierImages.signatureEtape(base,
        window.adocPresentStepList(base).find((e) => e.cardId === 'slide-02'));
      // (e) le texte d'un bloc PLUS TARD dans la même carte change l'image de l'étape 1, parce que
      //     ce bloc occupe déjà sa place (visibility:hidden conserve la mise en page). C'est LE cas
      //     qui rend nécessaire de signer la carte entière et non les seuls blocs visibles : la
      //     falsification a montré que sans lui, signer les blocs visibles passait le test, le
      //     nombre total d'étapes suffisant à masquer la différence.
      const texteSuivant = JSON.parse(JSON.stringify(base));
      texteSuivant.blocks[1].content.blocks[1].content.text += ' Une phrase de plus, qui change la hauteur.';
      const apresTexteSuivant = await window.AtelierImages.signatureEtape(texteSuivant,
        window.adocPresentStepList(texteSuivant).find((e) => e.cardId === 'slide-02'));
      return { avant, encore, apresOrdre, apresTexte, apresAjout, avantCarte2, apresTexteSuivant, longueur: avant.length };
    }, PRESENTATIONS[0].doc);
    assert.equal(sig.longueur, 16, 'la signature fait 16 caractères, comme l\'empreinte du schéma d\'outil');
    assert.equal(sig.encore, sig.avant, 'deux fois le même document donnent la même signature');
    assert.equal(sig.apresOrdre, sig.avant, 'réordonner les clés ne change pas la signature');
    assert.notEqual(sig.apresTexte, sig.avant, 'modifier un texte DOIT changer la signature');
    assert.notEqual(sig.apresAjout, sig.avantCarte2,
      'ajouter un bloc en fin de carte DOIT périmer l\'étape 1 : les blocs cachés occupent leur place');
    assert.notEqual(sig.apresTexteSuivant, sig.avantCarte2,
      'modifier le texte d\'un bloc PLUS TARD dans la carte DOIT périmer l\'étape 1, pour la même raison');
    pass('signature stable sur le même contenu, différente dès qu\'un texte change ou qu\'un bloc s\'ajoute.');

    // ── 8. La péremption se SIGNALE, en trois états distincts ─────────────────────────────────
    const perime = await page.evaluate(async (d) => {
      const base = JSON.parse(JSON.stringify(d));
      const res = await window.AtelierImages.rendreImages(base);
      const legeres = res.images.map((im) => ({ stepId: im.stepId, signature: im.signature }));
      const inchange = await window.AtelierImages.comparerAuDocument(legeres, base);
      const modifie = JSON.parse(JSON.stringify(base));
      modifie.blocks[0].content.blocks[0].content.text += ' (modifié)';
      const apresModif = await window.AtelierImages.comparerAuDocument(legeres, modifie);
      const amputé = JSON.parse(JSON.stringify(base));
      amputé.blocks[1].content.blocks.splice(1, 1);
      const apresRetrait = await window.AtelierImages.comparerAuDocument(legeres, amputé);
      const augmenté = JSON.parse(JSON.stringify(base));
      augmenté.blocks.push({ id: 'slide-99', type: 'card',
        content: { title: 'Nouvelle', imageRef: null, imageAlt: null,
                   blocks: [{ id: 'paragraph-98', type: 'paragraph', content: { text: 'Neuf.' }, citationIds: [], validation: {} }] },
        citationIds: [], validation: {} });
      const apresAjout = await window.AtelierImages.comparerAuDocument(legeres, augmenté);
      return { inchange, apresModif, apresRetrait, apresAjout };
    }, PRESENTATIONS[0].doc);
    assert.equal(perime.inchange.a_jour, true, 'un document inchangé ne périme rien : ' + JSON.stringify(perime.inchange));
    assert.deepEqual(perime.apresModif.perimees, ['heading-01'], 'le texte modifié périme son étape : ' + JSON.stringify(perime.apresModif));
    assert.equal(perime.apresModif.a_jour, false);
    assert.ok(perime.apresRetrait.disparues.length >= 1, 'une étape retirée est signalée disparue : ' + JSON.stringify(perime.apresRetrait));
    assert.ok(perime.apresAjout.nouvelles.length >= 1, 'une étape ajoutée est signalée nouvelle : ' + JSON.stringify(perime.apresAjout));
    pass('péremption signalée en trois états : périmée, disparue, nouvelle — jamais un remplacement silencieux.');

    // ── 9. Une seule image décodée à la fois (V5) ─────────────────────────────────────────────
    const decodage = await page.evaluate(async (d) => {
      const res = await window.AtelierImages.rendreImages(d);
      const compteurs = [];
      for (const im of res.images) {
        const bm = await window.AtelierImages.decoder(im);
        compteurs.push({ decodees: window.AtelierImages.nombreDecodees(), l: bm.width, h: bm.height });
      }
      window.AtelierImages.libererDecodee();
      return { compteurs, apresLiberation: window.AtelierImages.nombreDecodees(),
               compresse: res.images.every((im) => im.blob && im.blob.size > 0 && !im.canvas) };
    }, PRESENTATIONS[1].doc);
    assert.ok(decodage.compteurs.every((c) => c.decodees === 1), 'jamais plus d\'une image décodée : '
      + JSON.stringify(decodage.compteurs.map((c) => c.decodees)));
    assert.ok(decodage.compteurs.every((c) => c.l === 1920), 'chaque image décodée fait 1920 de large');
    assert.equal(decodage.apresLiberation, 0, 'la libération rend la mémoire');
    assert.equal(decodage.compresse, true, 'les images restent sous forme compressée, aucun canvas conservé');
    pass('images gardées compressées, décodées une seule à la fois, libérées sur demande.');

    // ── 10. Export JPEG de haute qualité, et noms de fichiers conformes à X5 ──────────────────
    const jpeg = await page.evaluate(async (d) => {
      const res = await window.AtelierImages.rendreImages(d);
      const im = res.images[0];
      const hq = await window.AtelierImages.versType(im, 'image/jpeg', 0.92);
      const bas = await window.AtelierImages.versType(im, 'image/jpeg', 0.3);
      return { png: im.octets, jpegHaut: hq.size, jpegBas: bas.size, typeHaut: hq.type,
               nom: window.AtelierImages.nomFichier(im, 'jpg'),
               noms: res.images.map((x) => window.AtelierImages.nomFichier(x, 'jpg')) };
    }, PRESENTATIONS[1].doc);
    assert.equal(jpeg.typeHaut, 'image/jpeg');
    assert.ok(jpeg.jpegHaut > jpeg.jpegBas, 'la haute qualité doit peser plus que la basse : '
      + jpeg.jpegHaut + ' contre ' + jpeg.jpegBas);
    assert.match(jpeg.nom, /^[0-9a-zA-Z.-]+$/, 'nom de fichier sans espace ni accent (X5) : ' + jpeg.nom);
    assert.deepEqual(jpeg.noms.slice().sort(), jpeg.noms, 'les noms doivent se trier dans l\'ordre des étapes (X5)');
    console.log('      PNG ' + Math.round(jpeg.png / 1024) + ' Ko, JPEG 0,92 ' + Math.round(jpeg.jpegHaut / 1024)
      + ' Ko, JPEG 0,30 ' + Math.round(jpeg.jpegBas / 1024) + ' Ko, premier nom ' + jpeg.nom);
    pass('export JPEG haute qualité disponible, noms de fichiers triés et sans accent.');

    // ── 11. L'AUTRE branche de V6 : l'attente de 800 ms, sans mode capture ───────────────────
    // L'exigence offre deux voies, et les deux doivent tenir. Le mode capture est le défaut parce
    // qu'il garantit la valeur finale ; l'attente, elle, la laisse arriver. On vérifie qu'elle y
    // arrive vraiment, et on relève ce qu'elle coûte.
    const lent = await page.evaluate(async (d) => {
      const t0 = performance.now();
      const res = await window.AtelierImages.rendreImages(d, { modeCapture: false });
      return {
        duree_ms: Math.round(performance.now() - t0), attente: res.attente_animations_ms,
        mode: res.mode_capture, images: res.images.length,
        textes: res.images.map((im) => im.textes),
        tailles: res.images.map((im) => im.largeur + 'x' + im.hauteur),
      };
    }, PRESENTATIONS[2].doc);
    assert.equal(lent.mode, false, 'le mode capture doit être réellement désactivé');
    assert.equal(lent.attente, 800, 'l\'attente annoncée doit être de 800 ms');
    assert.equal(lent.images, rendus.questionnaire.images.length, 'même nombre d\'images dans les deux modes');
    const platLent = lent.textes.flat().join(' | ');
    assert.ok(/37 % des personnes/.test(platLent), 'sans mode capture, l\'attente doit laisser arriver « 37 % » : ' + platLent.slice(0, 180));
    assert.ok(/12 semaines/.test(platLent), 'et « 12 semaines »');
    assert.deepEqual(lent.tailles, rendus.questionnaire.images.map((im) => im.largeur + 'x' + im.hauteur),
      'les tailles doivent être identiques dans les deux modes');
    console.log('      mode capture ' + rendus.questionnaire.meta.duree_ms + ' ms, attente de 800 ms '
      + lent.duree_ms + ' ms pour ' + lent.images + ' images — soit '
      + Math.round((lent.duree_ms - rendus.questionnaire.meta.duree_ms) / lent.images) + ' ms de plus par image');
    pass('les deux voies de V6 donnent la valeur finale ; le coût de l\'attente est relevé ci-dessus.');

    // ── 12. Aucune erreur de page pendant tout cela ───────────────────────────────────────────
    assert.deepEqual(erreurs, [], 'la page ne doit lever aucune erreur : ' + erreurs.join(' | '));
    pass('aucune erreur de page sur l\'ensemble des rendus.');

    console.log('\nPASS verify-atelier-images — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
