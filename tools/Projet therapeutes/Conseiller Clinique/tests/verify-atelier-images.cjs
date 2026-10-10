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
const { PRESENTATIONS, IMAGES_EMBARQUEES, ILLUSTREE } = require('./chutier-fixtures.cjs');

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
// Un PNG de 40x40, opaque, en dur : le contrôle 22 a besoin d'une image que le serveur retarde
// volontairement, pour éprouver que le moteur attend bien le décodage. `__inexistante__` répond
// 404, pour éprouver qu'une image cassée ne suspend pas un rendu.
const PNG_40 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAJklEQVRo3u3NMQEAAAgDoK0//6'
  + '9BOEBu7QEAAAAAAAAAAAAAAPAbHwkAASZbLbIAAAAASUVORK5CYII=', 'base64');
function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const chemin = decodeURIComponent(q.url.split('?')[0]);
      if (chemin === '/tests/__lente__.png') {
        return setTimeout(() => {
          r.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
          r.end(PNG_40);
        }, 300);
      }
      if (chemin === '/tests/__inexistante__.png') { r.writeHead(404); return r.end(); }
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
            scene: res.scene, mode: res.mode, echelle_typo: res.echelle_typo,
            scene_par_diapositive: res.scene_par_diapositive,
            plancher_lisibilite_pc: res.plancher_lisibilite_pc,
            scenes_par_carte: Object.keys(res.scenes_par_carte || {}).map((k) => ({
              carte: k, largeur: res.scenes_par_carte[k].scene.largeur,
              hauteur: res.scenes_par_carte[k].scene.hauteur,
              texte_pc: res.scenes_par_carte[k].texte_pc,
              deborde: res.scenes_par_carte[k].deborde,
              essais: res.scenes_par_carte[k].essais.length,
              raison: res.scenes_par_carte[k].raison })),
            debordements: res.debordements, seuil: res.seuil_scission, tolerance: res.tolerance_debordement,
          },
          images: res.images.map((im) => ({
            stepId: im.stepId, cardId: im.cardId, cardIndex: im.cardIndex, rang: im.rang,
            surRang: im.surRang, largeur: im.largeur, hauteur: im.hauteur,
            debordement: im.debordement, hauteurScene: im.hauteurScene,
            scene_largeur: im.scene_largeur, scene_hauteur: im.scene_hauteur,
            scene_raison: im.scene_raison, texte_pc: im.texte_pc, plancher_pc: im.plancher_pc,
            debordement_px: im.debordement_px, debordement_rapport: im.debordement_rapport,
            debordement_verdict: im.debordement_verdict, debordement_regle: im.debordement_regle,
            debordement_sous_tolerance: im.debordement_sous_tolerance,
            debordement_px_sortie: im.debordement_px_sortie,
            signature: im.signature, octets: im.octets, type: im.type, textes: im.textes,
          })),
        };
      }, p.doc);
      rendus[p.cle] = r;
      assert.equal(r.images.length, r.etapes,
        p.cle + ' : ' + r.images.length + ' images pour ' + r.etapes + ' étapes');
      assert.equal(r.etapes_annoncees === undefined ? r.meta.etapes_annoncees : r.etapes_annoncees, r.etapes);
      // Plus aucune dimension de scène codée en dur : elles se lisent dans le relevé, parce que
      // le mode vidéo a changé la scène et qu'un contrôle qui fige 1422×800 ne vérifierait plus
      // le contrat mais une valeur d'hier.
      const sc = r.meta.scene;
      r.images.forEach((im) => {
        assert.equal(im.largeur, 1920, p.cle + '/' + im.stepId + ' : largeur ' + im.largeur);
        if (!im.debordement) {
          assert.equal(im.hauteur, 1080, p.cle + '/' + im.stepId + ' : hauteur ' + im.hauteur + ' sans débordement');
          assert.ok(im.hauteurScene <= im.scene_hauteur * r.meta.tolerance,
            p.cle + '/' + im.stepId + ' : hauteur de scène ' + im.hauteurScene
            + ' pour une scène de ' + im.scene_hauteur);
        } else {
          assert.ok(im.hauteurScene > im.scene_hauteur, 'un débordement doit porter sa hauteur de scène');
          assert.equal(im.hauteur, Math.round(im.hauteurScene * 1920 / im.scene_largeur),
            p.cle + '/' + im.stepId + ' : hauteur de sortie incohérente avec la hauteur de scène');
        }
        assert.ok(im.octets > 2000, 'une image de ' + im.octets + ' octets est forcément vide');
      });
      assert.equal(r.etatRendu, true, 'l\'état du lecteur doit être rendu tel qu\'il était');
      assert.equal(r.scenesRestantes, 0, 'aucune scène hors écran ne doit subsister');
      // DÉCISION DU 9 OCTOBRE : plus de scène unique ni d'échelle typographique. La scène se
      // choisit par diapositive, et le texte reste tel quel à l'écran.
      assert.equal(r.meta.scene_par_diapositive, true,
        'le DÉFAUT est la scène par diapositive, décision du 9 octobre');
      assert.equal(r.meta.echelle_typo, 1,
        'le texte reste tel quel : aucune échelle typographique (' + r.meta.echelle_typo + ')');
      assert.equal(r.meta.mode, 'video');
      assert.equal(r.meta.plancher_lisibilite_pc, 2,
        'plancher de lisibilité à 2,0 %, décidé par Christophe');
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
      'le questionnaire DOIT déborder et être capturé sur toute sa hauteur (V3) ; '
      + 'aucun débordement détecté, hauteurs de scène : '
      + rendus.questionnaire.images.map((im) => im.hauteurScene).join(', '));
    debordantsQuestionnaire.forEach((im) => {
      assert.ok(im.hauteurScene > rendus.questionnaire.meta.scene.hauteur, 'hauteur de scène ' + im.hauteurScene);
      assert.ok(im.hauteur > 1080, 'une image débordante doit être plus haute que 1080 : ' + im.hauteur);
      assert.ok(im.debordement_px > 0, 'elle doit porter son ampleur : ' + im.debordement_px);
      assert.ok(['defilement', 'scission'].indexOf(im.debordement_verdict) !== -1,
        'et son verdict : ' + im.debordement_verdict);
    });
    // LA ZONE MORTE. Quatre étapes dépassaient de six pixels de scène — du bruit de mise en page,
    // pas un débordement. Sans tolérance, l'atelier ferait défiler une diapositive de douze pixels.
    //
    // Elle s'éprouve sur une SCÈNE FIXE. Depuis le 9 octobre, la scène se choisit par
    // diapositive pour que le contenu tienne : en mode par défaut, plus rien ne tombe dans la
    // zone morte, par construction. Ce n'est pas que la zone morte a disparu — c'est qu'elle ne
    // sert plus dans ce mode. Elle sert encore dès qu'une scène est imposée.
    const surSceneFixe = await page.evaluate(async (docs) => {
      const out = [];
      for (const d of docs) {
        // La scène de 960×540 : c'est elle qui produisait les six pixels de bruit relevés le
        // 7 octobre. Sur 1422×800, le même contenu tombe à zéro ou franchement au-dessus —
        // la zone morte ne s'y exerce pas.
        // Les conditions EXACTES où les six pixels de bruit ont été relevés le 7 octobre :
        // scène 960×540 ET échelle typographique ×1,4 — l'ancien mode vidéo. Ce réglage n'est
        // plus le défaut depuis le 9 octobre, mais il reste atteignable, et la zone morte doit
        // continuer d'y faire son travail. Sans échelle, le contenu tombe pile ou franchement
        // au-dessus : la zone morte ne s'exerce pas, et le contrôle serait vide.
        const r = await window.AtelierImages.rendreImages(d.doc,
          { mode: 'fidele', scene: { largeur: 960, hauteur: 540 }, echelleTypo: 1.4 });
        r.images.forEach((im) => out.push({ stepId: im.stepId,
          sous: im.debordement_sous_tolerance, px: im.debordement_px,
          verdict: im.debordement_verdict, sceneH: im.scene_hauteur,
          capture: im.hauteur_capture, h: im.hauteur, l: im.largeur }));
      }
      return out;
    }, PRESENTATIONS);
    const sousTolerance = surSceneFixe.filter((im) => im.sous);
    assert.ok(sousTolerance.length >= 1,
      'au moins une étape doit tomber sous la tolérance SUR SCÈNE FIXE, sinon ce contrôle ne '
      + 'vérifie rien : ' + JSON.stringify(surSceneFixe.map((x) => x.px)));
    sousTolerance.forEach((im) => {
      assert.equal(im.verdict, 'aucun', im.stepId + ' : sous tolérance mais verdict ' + im.verdict);
      assert.ok(im.px > 0 && im.px <= im.sceneH * 0.02 + 1,
        im.stepId + ' : ' + im.px + ' px pour une scène de ' + im.sceneH + ', hors de la zone morte');
    });
    // ET L'IMAGE RESTE LE CADRE. La zone morte est le SEUL endroit où la hauteur de capture et
    // la hauteur nécessaire diffèrent : le dépassement n'est pas un débordement, donc on capture
    // le cadre et on abandonne ces quelques pixels. Une capture qui suivrait son contenu sortirait
    // du 16:9 — 1092 px de haut au lieu de 1080 — tout en se déclarant sans débordement. Les
    // métadonnées, elles, resteraient irréprochables : c'est exactement le défaut crédible du
    // 7 octobre, et seule la TAILLE DE L'IMAGE le dit.
    surSceneFixe.filter((im) => im.verdict === 'aucun').forEach((im) => {
      assert.equal(im.capture, im.sceneH,
        im.stepId + ' : déclarée sans débordement mais capturée sur ' + im.capture
        + ' px au lieu du cadre (' + im.sceneH + ' px)');
      assert.equal(im.l, 1920, im.stepId + ' : largeur ' + im.l);
      assert.equal(im.h, 1080,
        im.stepId + ' : déclarée sans débordement et pourtant haute de ' + im.h + ' px');
    });
    console.log('      sous tolérance (donc « aucun ») : '
      + sousTolerance.map((im) => im.stepId + ' ' + im.debordement_px + 'px').join(', '));
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

    // ── 12. QUARANTE IMAGES — la mesure que le CDC demande, et qui n'avait pas été faite ─────
    // Le tableau des exigences non fonctionnelles dit « Mémoire images : une image 1920×1080
    // décodée, environ 8,3 Mo ; décodage une à la fois — Mesure sur 40 images ». Onze images ne
    // sont pas quarante. On construit donc une Présentation de 40 étapes et on la rend.
    const quarante = await page.evaluate(async (modele) => {
      const d = JSON.parse(JSON.stringify(modele));
      d.documentId = 'chutier-40'; d.versionId = 'chutier-40-v1';
      d.blocks = [];
      // 10 diapositives de 4 blocs : 40 étapes, le rythme d'une présentation réelle.
      for (let c = 1; c <= 10; c++) {
        const blocs = [];
        for (let b = 1; b <= 4; b++) {
          blocs.push({ id: 'paragraph-' + c + '-' + b, type: 'paragraph',
            content: { text: 'Diapositive ' + c + ', bloc ' + b + '. Une phrase de longueur ordinaire, '
              + 'pour que la mise en page ressemble à celle d\'une presentation reelle.' },
            citationIds: [], validation: {} });
        }
        d.blocks.push({ id: 'slide-' + String(c).padStart(2, '0'), type: 'card',
          content: { title: 'Diapositive ' + c, imageRef: null, imageAlt: null, blocks: blocs },
          citationIds: [], validation: {} });
      }
      const valide = window.adocValidateSchema('clinicalDocument', d);
      const t0 = performance.now();
      const res = await window.AtelierImages.rendreImages(d);
      const duree = Math.round(performance.now() - t0);
      // Décodage une à la fois sur les quarante : le compteur suit les bitmaps vivants.
      let maxDecodees = 0;
      for (const im of res.images) {
        await window.AtelierImages.decoder(im);
        maxDecodees = Math.max(maxDecodees, window.AtelierImages.nombreDecodees());
      }
      window.AtelierImages.libererDecodee();
      return {
        valide: !!valide.valid, etapes: window.adocPresentStepList(d).length,
        images: res.images.length, duree_ms: duree, octets: res.octets_total,
        maxDecodees, apres: window.AtelierImages.nombreDecodees(),
        tailles: Array.from(new Set(res.images.map((im) => im.largeur + 'x' + im.hauteur))),
        signaturesDistinctes: new Set(res.images.map((im) => im.signature)).size,
      };
    }, PRESENTATIONS[1].doc);
    assert.equal(quarante.valide, true, 'la présentation de 40 étapes doit être valide');
    assert.equal(quarante.etapes, 40, '40 étapes attendues, ' + quarante.etapes);
    assert.equal(quarante.images, 40, '40 images attendues, ' + quarante.images);
    assert.deepEqual(quarante.tailles, ['1920x1080'], 'toutes à 1920x1080 : ' + quarante.tailles.join(', '));
    assert.equal(quarante.maxDecodees, 1, 'jamais plus d\'une image décodée sur 40 : ' + quarante.maxDecodees);
    assert.equal(quarante.apres, 0, 'tout est libéré à la fin');
    assert.equal(quarante.signaturesDistinctes, 40, '40 signatures distinctes attendues, '
      + quarante.signaturesDistinctes + ' — deux étapes partageraient leur verdict de péremption');
    console.log('      40 images : ' + quarante.duree_ms + ' ms ('
      + Math.round(quarante.duree_ms / 40) + ' ms par image), '
      + (quarante.octets / 1048576).toFixed(2) + ' Mo compressés ('
      + Math.round(quarante.octets / 40 / 1024) + ' Ko par image), '
      + 'jamais plus d\'une décodée.');
    console.log('      À comparer : 40 images DÉCODÉES tiendraient '
      + (40 * 1920 * 1080 * 4 / 1048576).toFixed(0) + ' Mo en mémoire — c\'est ce que le décodage '
      + 'une à la fois évite.');
    pass('quarante images rendues : taille, durée, poids compressé et décodage unique mesurés.');

    // ── 13. CE QUE LA CAPTURE RETIRE, et qu'elle doit retirer ────────────────────────────────
    // Décision de Christophe du 6 octobre, après avoir vu les premières images. On mesure le
    // RENDU, pas le balisage : les options restent des <button> dans le DOM, mais plus rien à
    // l'image ne les désigne comme tels, et c'est cela seul qui se voit sur une vidéo.
    const { INSPECTEUR } = require('./chutier-inspecteur.cjs');
    const retire = await page.evaluate(async ({ docs, src }) => {
      const inspecter = eval('(' + src + ')');
      const sortie = {};
      // EN MODE FIDÈLE : les chiffres d'avant la décision (1496 px pour le questionnaire) ont été
      // mesurés sur la scène du lecteur, et c'est à eux qu'on compare. La couche de capture, elle,
      // s'applique dans les deux modes — c'est précisément ce que ce contrôle vérifie.
      for (const d of docs) {
        const res = await window.AtelierImages.rendreImages(d.doc, { inspecter, mode: 'fidele' });
        sortie[d.cle] = res.images.map((im) => ({ stepId: im.stepId, hauteur: im.hauteur,
          debordement: im.debordement, i: im.inspection }));
      }
      const v = await window.AtelierImages.rendreImages(docs[2].doc);
      sortie._video = v.images.map((im) => ({ stepId: im.stepId, hauteur: im.hauteur }));
      return sortie;
    }, { docs: PRESENTATIONS.map((p) => ({ cle: p.cle, doc: p.doc })), src: INSPECTEUR.toString() });

    const enVideo = retire._video; delete retire._video;
    const toutes = Object.values(retire).flat();
    toutes.forEach((im) => {
      assert.equal(im.i.carte.bordure, '0px', im.stepId + ' : la carte garde une bordure de ' + im.i.carte.bordure);
      assert.equal(im.i.carte.rayon, '0px', im.stepId + ' : la carte garde un rayon de ' + im.i.carte.rayon);
      assert.equal(im.i.carte.ombre, 'aucune', im.stepId + ' : la carte garde une ombre');
      assert.equal(im.i.badges_loupe.visibles, 0, im.stepId + ' : une loupe d\'agrandissement est visible');
      assert.deepEqual(im.i.habilles_en_bouton, [],
        im.stepId + ' : des éléments ont encore l\'habillage d\'un bouton : '
        + JSON.stringify(im.i.habilles_en_bouton));
    });
    // La couverture porte bien une loupe dans le DOM : sans cela, « aucune visible » ne prouverait
    // rien — ce serait vrai parce qu'il n'y en a jamais eu.
    const avecLoupe = toutes.filter((im) => im.i.badges_loupe.total > 0);
    assert.ok(avecLoupe.length >= 1, 'au moins une étape doit porter une loupe dans son DOM, sinon le contrôle est vide');
    // Le questionnaire : plus de barème, plus de « Voir mon résultat », et il raccourcit d'autant.
    const quest = retire.questionnaire.find((im) => im.stepId === 'questionnaire-01');
    const texteQuest = quest.i.textes_rendus.join(' ');
    assert.equal(/\(\+[0-9]\)/.test(texteQuest), false, 'les barèmes (+0, +1…) ne doivent plus être rendus : ' + texteQuest.slice(0, 120));
    assert.equal(/Voir mon r/.test(texteQuest), false, '« Voir mon résultat » ne doit plus être rendu');
    assert.ok(/Jamais/.test(texteQuest) && /Vous evitez/.test(texteQuest),
      'les questions et les libellés de réponses, eux, DOIVENT rester : ' + texteQuest.slice(0, 120));
    assert.ok(quest.hauteur < 1496, 'le questionnaire doit raccourcir : ' + quest.hauteur + ' px contre 1496 avant');
    assert.equal(quest.debordement, true, 'il déborde toujours, et c\'est normal');
    console.log('      questionnaire : ' + quest.hauteur + ' px en mode fidèle (contre 1496 avant le retrait), '
      + enVideo.find((x) => x.stepId === 'questionnaire-01').hauteur + ' px en mode vidéo, '
      + quest.i.cliquables + ' éléments encore cliquables dans le DOM, 0 habillé en bouton');
    pass('capture dépouillée : ni loupe, ni habillage de bouton, ni barème, ni « Voir mon résultat » ; questions et réponses intactes.');

    // ── 14. LA PUCE « APPROFONDIR », LES CITATIONS, LES SOURCES ──────────────────────────────
    // Trois éléments relevés par Christophe sur sa présentation. La puce part toujours — une
    // vidéo n'a pas de clic. Les citations et les lignes « Sources » restent par DÉFAUT, et ne
    // partent que sur option : il n'a pas tranché, et l'image montre en attendant ce que le
    // lecteur montre.
    const marques = await page.evaluate(async ({ d, src }) => {
      const inspecter = eval('(' + src + ')');
      const avec = await window.AtelierImages.rendreImages(d, { inspecter });
      const sans = await window.AtelierImages.rendreImages(d, { inspecter, masquerCitations: true });
      const lire = (res) => res.images.map((im) => im.inspection);
      return { avec: lire(avec), sans: lire(sans),
               sourcesAvec: avec.sources, masqueAvec: avec.citations_masquees, masqueSans: sans.citations_masquees };
    }, { d: PRESENTATIONS[1].doc, src: INSPECTEUR.toString() });

    // La fixture DOIT porter ces éléments, sinon le contrôle vérifierait une absence sans présence.
    const puceDansDom = marques.avec.reduce((a, i) => a + i.puces_approfondir.total, 0);
    const citeDansDom = marques.avec.reduce((a, i) => a + i.appels_citation.total, 0);
    const srcDansDom = marques.avec.reduce((a, i) => a + i.lignes_sources.total, 0);
    assert.ok(puceDansDom >= 1, 'la présentation d\'essai doit porter une puce « Approfondir » : ' + puceDansDom);
    assert.ok(citeDansDom >= 1, 'et un appel de citation : ' + citeDansDom);

    marques.avec.forEach((i, k) => {
      assert.equal(i.puces_approfondir.visibles, 0,
        'étape ' + (k + 1) + ' : ' + i.puces_approfondir.visibles + ' puce(s) « Approfondir » encore visible(s)');
    });
    const citeVisiblesAvec = marques.avec.reduce((a, i) => a + i.appels_citation.visibles, 0);
    const citeVisiblesSans = marques.sans.reduce((a, i) => a + i.appels_citation.visibles, 0);
    const srcVisiblesSans = marques.sans.reduce((a, i) => a + i.lignes_sources.visibles, 0);
    assert.ok(citeVisiblesAvec >= 1, 'par défaut, les appels de citation RESTENT visibles : ' + citeVisiblesAvec);
    assert.equal(citeVisiblesSans, 0, 'avec l\'option, ils disparaissent : ' + citeVisiblesSans);
    assert.equal(srcVisiblesSans, 0, 'et les lignes « Sources » aussi : ' + srcVisiblesSans);
    assert.equal(marques.masqueAvec, false, 'le relevé doit dire que les citations sont visibles');
    assert.equal(marques.masqueSans, true, 'et qu\'elles sont masquées quand elles le sont');

    // Les sources, extraites pour le kit (X2) : la citation appelée y figure, avec ses étapes.
    const S = marques.sourcesAvec;
    assert.equal(S.declarees, 1, 'une citation déclarée');
    assert.equal(S.utilisees, 1, 'et elle est appelée : ' + JSON.stringify(S));
    assert.equal(S.sources[0].displayLabel, 'Ouvrage de reference, chapitre 3');
    assert.ok(S.sources[0].etapes.length >= 1, 'elle doit nommer les étapes qui l\'appellent');
    assert.deepEqual(S.jamais_appelees, [], 'aucune citation déclarée sans appel ici');
    console.log('      puces « Approfondir » : ' + puceDansDom + ' dans le DOM, 0 visible  |  '
      + 'citations : ' + citeDansDom + ' dans le DOM, ' + citeVisiblesAvec + ' visibles par défaut, '
      + citeVisiblesSans + ' avec l\'option  |  lignes « Sources » : ' + srcDansDom + ' dans le DOM');
    console.log('      sources extraites : « ' + S.sources[0].displayLabel + ' », appelée aux étapes '
      + S.sources[0].etapes.join(', '));
    pass('puce « Approfondir » toujours masquée ; citations et sources visibles par défaut, masquables sur option ; sources extraites pour le kit.');

    // ── 15. AUCUNE IMAGE PLUS COURTE QUE SON CONTENU, dans les quatre réglages ───────────────
    // LE DÉFAUT DU 7 OCTOBRE. Le dernier bloc de chaque diapositive illustrée se retrouvait coupé
    // en bas de l'image, sans avertissement. Cause mesurée : dans la scène, la carte est en
    // height:100% et son image de couverture en max-height:45%. Agrandir la scène pour y faire
    // tenir un débordement agrandit l'image d'autant, qui repousse le texte — et la hauteur
    // mesurée AVANT cet agrandissement est toujours trop courte.
    const { SANS_PHOTO } = require('./chutier-fixtures.cjs');
    const REGLAGES = { a: { mode: 'fidele' }, b: { mode: 'fidele', scene: { largeur: 960, hauteur: 540 } },
                       c: { mode: 'fidele', echelleTypo: 1.6 }, d: {} };
    const troncature = await page.evaluate(async ({ docs, reglages }) => {
      // MESURE INDÉPENDANTE DU MOTEUR : on regarde l'encre dans la dernière bande de l'IMAGE.
      // Les hauteurs ci-dessous sont les chiffres du moteur ; s'y fier seuls reviendrait à lui
      // demander s'il a bien travaillé. Une capture coupée a de l'encre jusqu'au bord inférieur,
      // une capture complète a la marge intérieure de la carte. C'est vrai des pixels livrés,
      // quoi que le moteur raconte.
      const encreDuBas = async (blob) => {
        const bmp = await createImageBitmap(blob);
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
        const BANDE = 10, MARGE = 30;
        const d = g.getImageData(MARGE, bmp.height - BANDE, bmp.width - 2 * MARGE, BANDE).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 170) n++;
        }
        bmp.close();
        return n;
      };
      const out = {};
      for (const d of docs) {
        out[d.cle] = {};
        for (const cle of Object.keys(reglages)) {
          const res = await window.AtelierImages.rendreImages(d.doc, reglages[cle]);
          const images = [];
          for (const im of res.images) {
            images.push({
              rang: im.rang, hauteur: im.hauteur, hauteurScene: im.hauteurScene,
              contenu: im.hauteur_contenu, avant: im.hauteur_avant_stabilisation,
              tours: im.tours_stabilisation, verdict: im.debordement_verdict,
              encreBas: await encreDuBas(im.blob) });
          }
          out[d.cle][cle] = { scene: res.scene, images: images };
        }
      }
      return out;
    }, { docs: [{ cle: 'illustree', doc: ILLUSTREE }, { cle: 'sansPhoto', doc: SANS_PHOTO }],
         reglages: REGLAGES });

    let aurait = 0, verifies = 0;
    ['illustree', 'sansPhoto'].forEach((cleDoc) => {
      Object.keys(REGLAGES).forEach((cle) => {
        const r = troncature[cleDoc][cle];
        r.images.forEach((im) => {
          const cadre = im.verdict === 'aucun' ? r.scene.hauteur : im.hauteurScene;
          assert.ok(im.contenu <= Math.ceil(cadre * 1.02),
            cleDoc + '/' + cle + ' étape ' + im.rang + ' : contenu ' + im.contenu
            + ' px pour une capture de ' + cadre + ' px — image plus courte que son contenu');
          assert.ok(im.tours >= 1 && im.tours <= 12, 'nombre de tours de stabilisation : ' + im.tours);
          // Et la preuve qui ne passe pas par le moteur : pas d'encre contre le bord du bas.
          assert.equal(im.encreBas, 0, cleDoc + '/' + cle + ' étape ' + im.rang + ' : '
            + im.encreBas + ' pixels d\'encre collés au bord inférieur de l\'image — le texte y est '
            + 'coupé net. (hauteurs annoncées : contenu ' + im.contenu + ' px, cadre ' + cadre + ' px)');
          // Ce que l'ancien code aurait retenu, et donc coupé.
          if (im.avant < im.contenu) aurait++;
          verifies++;
        });
      });
    });
    // La fixture DOIT reproduire le défaut, sinon ce contrôle ne vérifie rien.
    assert.ok(aurait >= 4, 'la présentation illustrée doit reproduire le cas où la hauteur grandit '
      + 'après l\'agrandissement, sinon ce contrôle est vide : ' + aurait + ' cas sur ' + verifies);
    // Et SANS photo, rien ne bouge : c'est ce qui établit la cause.
    Object.keys(REGLAGES).forEach((cle) => {
      troncature.sansPhoto[cle].images.forEach((im) => {
        assert.equal(im.avant, im.contenu,
          'sans photo, la hauteur ne doit pas changer après agrandissement : ' + im.avant + ' → ' + im.contenu);
      });
    });
    const d4 = troncature.illustree.d.images[3];
    console.log('      illustrée, réglage (d), dernière étape : ' + d4.avant + ' px avant stabilisation, '
      + d4.contenu + ' px après — ' + (d4.contenu - d4.avant) + ' px qui auraient été coupés, en '
      + d4.tours + ' redimensionnements');
    console.log('      ' + aurait + ' cas sur ' + verifies + ' où la hauteur grandit ; sans photo, aucun');
    pass('aucune image plus courte que son contenu, dans les quatre réglages, avec et sans photo.');

    // Le REFUS lui-même, éprouvé seul : c'est le garde-fou qui doit tenir le jour où la
    // stabilisation ne suffira plus.
    const refusCourt = await page.evaluate(() => {
      const A = window.AtelierImages, essai = (c, h, t) => {
        try { A.refuserSiTropCourte(c, h, t, 'etape-x'); return 'accepté'; }
        catch (e) { return String(e.message).slice(0, 60); }
      };
      return { pile: essai(540, 540, 1.02), sousTolerance: essai(550, 540, 1.02),
               auDela: essai(600, 540, 1.02), strict: essai(545, 540, 1.0) };
    });
    assert.equal(refusCourt.pile, 'accepté', 'un contenu qui tient exactement est accepté');
    assert.equal(refusCourt.sousTolerance, 'accepté', '10 px sur 540 restent dans la zone morte');
    assert.match(refusCourt.auDela, /plus courte que son contenu/, '60 px de trop doivent être refusés : ' + refusCourt.auDela);
    assert.match(refusCourt.strict, /plus courte que son contenu/, 'et la tolérance est réglable : ' + refusCourt.strict);
    pass('le refusCourt d\'une image plus courte que son contenu, éprouvé seul : accepte la zone morte, refuse au-delà.');

    // ── 17. L'ÉCHELLE TYPOGRAPHIQUE fait ce qu'elle annonce ──────────────────────────────────
    const typo = await page.evaluate(async ({ d, src }) => {
      const inspecter = eval('(' + src + ')');
      // Base : le mode FIDÈLE, pour que les deux leviers s'éprouvent chacun à partir de zéro.
      const un = await window.AtelierImages.rendreImages(d, { inspecter, mode: 'fidele' });
      const gros = await window.AtelierImages.rendreImages(d, { inspecter, mode: 'fidele', echelleTypo: 1.6 });
      const petit = await window.AtelierImages.rendreImages(d, { inspecter, mode: 'fidele', scene: { largeur: 960, hauteur: 540 } });
      const lire = (res) => res.images.map((im) => im.inspection.tailles.map((t) => t.sortie));
      return { un: lire(un), gros: lire(gros), petit: lire(petit),
               sceneUn: un.scene, scenePetit: petit.scene, defautUn: un.scene_par_defaut, defautPetit: petit.scene_par_defaut };
    }, { d: PRESENTATIONS[1].doc, src: INSPECTEUR.toString() });
    const premier = (x) => x[0][0];
    // SUR TOUTES LES ÉTAPES, pas seulement la première. L'échelle est appliquée à chaque étape,
    // sur les blocs qui viennent d'apparaître : si la garde « déjà mis à l'échelle » sautait, les
    // étapes suivantes se verraient multipliées deux fois, et seule une vérification étape par
    // étape le verrait.
    let compares = 0;
    for (let k = 0; k < typo.un.length; k++) {
      for (let j = 0; j < typo.un[k].length; j++) {
        const r = typo.gros[k][j] / typo.un[k][j];
        assert.ok(Math.abs(r - 1.6) < 0.02,
          'étape ' + (k + 1) + ', texte ' + (j + 1) + ' : rapport ' + r.toFixed(3) + ' au lieu de 1,6 ('
          + typo.un[k][j] + ' → ' + typo.gros[k][j] + ')');
        compares++;
      }
    }
    assert.ok(compares >= 8, 'il faut comparer plusieurs étapes, pas une : ' + compares);
    // Scène deux fois plus petite, agrandissement deux fois plus fort : la taille de SORTIE double,
    // alors que la taille de SCÈNE n'a pas bougé. C'est l'autre levier, et il est bien distinct.
    assert.ok(Math.abs(premier(typo.petit) / premier(typo.un) - (1422 / 960)) < 0.02,
      'une scène de 960 doit agrandir le texte dans le rapport 1422/960 : ' + premier(typo.un) + ' → ' + premier(typo.petit));
    assert.deepEqual(typo.scenePetit, { largeur: 960, hauteur: 540 });
    assert.equal(typo.defautUn, true, 'en mode fidèle, la scène est celle du lecteur');
    assert.equal(typo.defautPetit, false, 'avec option, le relevé doit le dire');
    // L'interligne suit la taille SANS qu'on y touche, parce que tous les interlignes du lecteur
    // sont sans unité. On le vérifie quand même : c'est l'hypothèse sur laquelle repose le fait
    // de ne multiplier QUE la taille, et elle tomberait sans un mot si un interligne en pixels
    // apparaissait un jour dans une diapositive.
    const inter = await page.evaluate(async (d) => {
      const lire = (inner) => {
        const el = inner.querySelector('.adoc-sc-card > .adoc-sc-block p')
          || inner.querySelector('.adoc-sc-card > .adoc-sc-block');
        const s = getComputedStyle(el);
        return { taille: parseFloat(s.fontSize), interligne: parseFloat(s.lineHeight),
                 pose: !!el.style.lineHeight };
      };
      let un = null, gros = null;
      await window.AtelierImages.rendreImages(d, { mode: 'fidele', inspecter: (inner) => { if (!un) un = lire(inner); } });
      await window.AtelierImages.rendreImages(d, { mode: 'fidele', echelleTypo: 1.6, inspecter: (inner) => { if (!gros) gros = lire(inner); } });
      return { un, gros };
    }, PRESENTATIONS[1].doc);
    const rapportInter = inter.gros.interligne / inter.un.interligne;
    assert.ok(Math.abs(rapportInter - 1.6) < 0.03,
      'l\'interligne doit suivre la taille : ' + inter.un.interligne + ' → ' + inter.gros.interligne
      + ' (rapport ' + rapportInter.toFixed(3) + ')');
    assert.equal(inter.gros.pose, false,
      'et il doit la suivre SEUL : aucune valeur d\'interligne ne doit être posée en ligne');
    console.log('      texte de sortie : ' + premier(typo.un) + ' px (défaut), '
      + premier(typo.gros) + ' px (×1,6), ' + premier(typo.petit) + ' px (scène 960)'
      + ' — interligne de scène ' + inter.un.interligne + ' → ' + inter.gros.interligne + ' px');
    pass('les deux leviers sont distincts, appliqués à toutes les étapes (' + compares
      + ' comparaisons), interligne compris.');

    // ── 18. RIEN NE FUIT HORS CAPTURE ────────────────────────────────────────────────────────
    // Le point sur lequel Christophe a été explicite : « ne change rien au lecteur hors capture ».
    const fuite = await page.evaluate(async (d) => {
      // Un document rendu dans l'espace de travail, AVANT toute capture.
      const snap = { sourceSnapshotId: d.sourceSnapshotId, entries: [] };
      const bac = document.createElement('div');
      bac.id = 'temoin-hors-capture';
      document.body.appendChild(bac);
      const lire = async () => {
        const r = await window.adocRenderClinicalDocument(d, snap, null);
        bac.innerHTML = r.html;
        const carte = bac.querySelector('.adoc-sc-card');
        const texte = bac.querySelector('.adoc-sc-card p') || bac.querySelector('p');
        const sc = getComputedStyle(carte);
        return { bordure: sc.borderTopWidth, rayon: sc.borderTopLeftRadius, ombre: sc.boxShadow,
                 taille: texte ? getComputedStyle(texte).fontSize : null,
                 interligne: texte ? getComputedStyle(texte).lineHeight : null };
      };
      const avant = await lire();
      await window.AtelierImages.rendreImages(d, { scene: { largeur: 960, hauteur: 540 }, echelleTypo: 1.6 });
      const apres = await lire();
      // Aucune marque de capture ne doit survivre nulle part dans le document.
      const marques = {
        scenes: document.querySelectorAll('[data-atelier-scene]').length,
        captures: document.querySelectorAll('[data-atelier-capture]').length,
        typo: document.querySelectorAll('[data-atelier-typo]').length,
      };
      // Et la feuille de capture ne doit porter QUE des règles portées par la marque.
      const feuille = document.getElementById('atelier-capture-css');
      const regles = feuille ? Array.from(feuille.sheet.cssRules).map((r) => r.selectorText || '') : null;
      const horsMarque = (regles || []).filter((sel) =>
        sel.split(',').map((x) => x.trim()).some((x) => x.indexOf('[data-atelier-capture]') !== 0));
      bac.remove();
      return { avant, apres, marques, nbRegles: regles ? regles.length : 0, horsMarque,
               reference: window.adocPresentReference };
    }, PRESENTATIONS[1].doc);
    assert.deepEqual(fuite.apres, fuite.avant,
      'le rendu hors capture doit être identique avant et après : ' + JSON.stringify(fuite));
    // Pas de valeur codée en dur ici : j'avais écrit « 1px », et la carte d'une Présentation en
    // porte 4 dans l'espace de travail. L'assertion utile n'est pas la valeur, c'est qu'elle ne
    // soit PAS celle que la capture impose — autrement dit que les règles de capture n'aient pas
    // débordé hors de leur marque.
    assert.notEqual(fuite.avant.bordure, '0px', 'hors capture, la carte GARDE une bordure : ' + fuite.avant.bordure);
    assert.notEqual(fuite.avant.rayon, '0px', 'hors capture, la carte GARDE un rayon : ' + fuite.avant.rayon);
    assert.deepEqual(fuite.marques, { scenes: 0, captures: 0, typo: 0 }, 'aucune marque de capture ne survit');
    assert.ok(fuite.nbRegles >= 8, 'la feuille de capture doit porter ses règles : ' + fuite.nbRegles);
    assert.deepEqual(fuite.horsMarque, [],
      'TOUTE règle de capture doit être portée par [data-atelier-capture] : ' + JSON.stringify(fuite.horsMarque));
    assert.deepEqual(fuite.reference, { largeur: 1422, hauteur: 800 }, 'la référence du lecteur ne bouge pas');
    console.log('      hors capture : bordure ' + fuite.avant.bordure + ', rayon ' + fuite.avant.rayon
      + ', texte ' + fuite.avant.taille + ' — identiques avant et après une capture à 960×540 ×1,6');
    pass('le lecteur hors capture est inchangé, et les ' + fuite.nbRegles + ' règles de capture sont toutes portées par la marque.');

    // ── 19. LA POLITIQUE DE DÉBORDEMENT, règle par règle ──────────────────────────────────────
    const politique = await page.evaluate(() => {
      const A = window.AtelierImages;
      const v = (contenu, cadre, opts) => A.verdictDebordement(contenu, cadre, opts);
      return {
        defauts: { tolerance: A.TOLERANCE_DEBORDEMENT, seuil: A.SEUIL_SCISSION, vitesse: A.VITESSE_PAN_MAX },
        exact: v(540, 540),
        bruit: v(546, 540),                       // +1,1 % : la zone morte
        justeAuDessus: v(552, 540),               // +2,2 % : au-delà de la tolérance
        modere: v(800, 540),                      // rapport 1,48
        enorme: v(1082, 540),                     // rapport 2,00
        seuilRegle: v(800, 540, { seuil: 1.2 }),  // seuil abaissé : le même contenu devient scission
        toleranceReglee: v(546, 540, { tolerance: 1.001 }),
        // Quand la durée est connue, c'est la VITESSE qui décide, pas le rapport.
        // 520 px de sortie, et la durée utile retire les DEUX poses de 0,8 s :
        lentEtLong: v(800, 540, { dureeS: 60, echelleSortie: 2 }),   // 520 px/58,4 s = 8,9 px/s
        lentEtCourt: v(800, 540, { dureeS: 4, echelleSortie: 2 }),   // 520 px/2,4 s = 216,7 px/s
      };
    });
    assert.deepEqual(politique.defauts, { tolerance: 1.02, seuil: 1.8, vitesse: 60 });
    assert.equal(politique.exact.verdict, 'aucun');
    assert.equal(politique.bruit.verdict, 'aucun', 'six pixels de scène ne sont pas un débordement');
    assert.equal(politique.bruit.sous_tolerance, true, 'mais l\'ampleur est rapportée quand même');
    assert.equal(politique.bruit.px, 6);
    assert.equal(politique.justeAuDessus.verdict, 'defilement');
    assert.equal(politique.modere.verdict, 'defilement', 'rapport 1,48 : ça défile');
    assert.equal(politique.enorme.verdict, 'scission', 'rapport 2,00 : scission conseillée');
    assert.equal(politique.seuilRegle.verdict, 'scission', 'le seuil doit être réglable');
    assert.equal(politique.toleranceReglee.verdict, 'defilement', 'la tolérance aussi');
    assert.equal(politique.lentEtLong.verdict, 'defilement', 'une étape longue laisse le temps de défiler');
    assert.equal(politique.lentEtLong.regle, 'vitesse', 'et la règle employée est dite');
    assert.equal(politique.lentEtCourt.verdict, 'scission',
      'la MÊME hauteur sur une étape courte ne se défile pas : ' + JSON.stringify(politique.lentEtCourt));
    assert.equal(politique.modere.regle, 'rapport', 'sans durée, c\'est le rapport qui tranche');
    // LE VERDICT ET LE PLAN SONT LE MÊME CALCUL. Deux formules se seraient séparées un jour, et
    // un plan de travelling qui contredit son propre verdict est un défaut crédible de plus.
    assert.equal(politique.lentEtLong.plan.tenable, true, 'le plan doit dire tenable');
    assert.equal(politique.lentEtLong.plan.pose_s, 0.8, 'avec sa pose : ' + politique.lentEtLong.plan.pose_s);
    assert.equal(politique.lentEtLong.plan.duree_utile_s, 58.4,
      'la durée utile retire les deux poses : ' + politique.lentEtLong.plan.duree_utile_s);
    assert.equal(politique.lentEtLong.plan.vitesse_px_par_s, politique.lentEtLong.vitesse_px_par_s,
      'la vitesse du verdict est celle du plan');
    assert.equal(politique.lentEtCourt.plan.tenable, false, 'et l\'étape courte n\'est pas tenable');
    assert.equal(politique.modere.plan, undefined, 'sans durée, aucun plan n\'est promis');
    console.log('      tolérance ' + politique.defauts.tolerance + ', seuil ' + politique.defauts.seuil
      + ', vitesse maximale ' + politique.defauts.vitesse + ' px/s — même hauteur, 60 s : '
      + politique.lentEtLong.verdict + ' (' + politique.lentEtLong.vitesse_px_par_s + ' px/s) ; 4 s : '
      + politique.lentEtCourt.verdict + ' (' + politique.lentEtCourt.vitesse_px_par_s + ' px/s)');
    pass('politique de débordement : zone morte, seuil réglable, et la durée l\'emporte sur le rapport quand elle est connue.');

    // ── 20. LE PLAFOND ABSOLU DU BANDEAU PHOTO — sur option, et à l'arrêt par défaut ─────────
    // Christophe a nommé la cause restante le 8 octobre : « la photo plafonnée à 45 % de la
    // hauteur de la carte grandit avec le contenu ». Un plafond en POURCENTAGE suit la carte ;
    // un plafond en PIXELS ne la suit pas. Le contrôle éprouve les deux affirmations.
    const plafond = await page.evaluate(async (d) => {
      const A = window.AtelierImages;
      // Scène FIXE : le plafond suppose une scène unique, et la scène par diapositive le
      // refuse désormais explicitement (décision du 9 octobre).
      const FIXE = { mode: 'fidele', scene: { largeur: 960, hauteur: 540 }, echelleTypo: 1.4 };
      const sans = await A.rendreImages(d, FIXE);
      const avec = await A.rendreImages(d, Object.assign({ plafondPhoto: 0.25 }, FIXE));
      // Le témoin : le MÊME document dans une scène qui le contient sans agrandissement. La
      // photo y occupe sa part nominale, 45 % du cadre. C'est la comparaison des deux qui
      // établit « la photo grandit avec le contenu », et non un seuil choisi au hasard.
      const tient = await A.rendreImages(d, { mode: 'fidele' });
      // Et le refus de la combinaison, nommé.
      let refus = null;
      try { await A.rendreImages(d, { plafondPhoto: 0.25 }); }
      catch (e) { refus = e.message; }
      const haut = (r) => Math.max.apply(null, r.images.map((im) => im.hauteur));
      return {
        sansDefaut: sans.plafond_photo, sansPx: sans.plafond_photo_px,
        avecDefaut: avec.plafond_photo, avecPx: avec.plafond_photo_px,
        calculeSans: sans.images.map((im) => im.photo_plafond_calcule),
        calculeAvec: avec.images.map((im) => im.photo_plafond_calcule),
        photoSans: sans.images.map((im) => im.photo_px),
        photoAvec: avec.images.map((im) => im.photo_px),
        pcCadreSans: sans.images.map((im) => im.photo_pc_cadre),
        pcCadreTient: tient.images.map((im) => im.photo_pc_cadre),
        verdictsTient: tient.images.map((im) => im.debordement_verdict),
        hautSans: haut(sans), hautAvec: haut(avec), scene: sans.scene, refus: refus,
      };
    }, ILLUSTREE);
    assert.equal(plafond.sansDefaut, null, 'le plafond doit être ABSENT par défaut');
    assert.equal(plafond.sansPx, 0, 'et sa valeur en pixels nulle');
    assert.ok(plafond.calculeSans.every((x) => x === '45%'),
      'sans option, le lecteur garde son max-height en POURCENTAGE : ' + plafond.calculeSans.join(','));
    assert.ok(plafond.refus && /scène unique/.test(plafond.refus),
      'combiner le plafond et la scène par diapositive doit être REFUSÉ, nommément : ' + plafond.refus);
    assert.equal(plafond.avecPx, Math.round(0.25 * plafond.scene.hauteur),
      'avec option, le plafond vaut 25 % de la hauteur du CADRE en pixels');
    assert.ok(plafond.calculeAvec.every((x) => x === plafond.avecPx + 'px'),
      'et la règle appliquée est en pixels : ' + plafond.calculeAvec.join(','));
    // LA DÉMONSTRATION DU DÉFAUT NOMMÉ PAR CHRISTOPHE, en deux points. Dans une scène qui
    // contient le document, la photo occupe sa part nominale de 45 % du cadre. Dans une scène
    // qu'il faut agrandir, elle dépasse cette part — puisque 45 % s'appliquent à une carte
    // devenue plus haute que le cadre. Sur sa vraie présentation, diapositive 4, elle atteint
    // 116 % de la hauteur du cadre : une photo plus haute que l'image qu'elle illustre.
    assert.ok(plafond.verdictsTient.every((v) => v === 'aucun'),
      'le témoin doit être une scène où RIEN ne déborde, sinon il ne vaut rien : '
      + plafond.verdictsTient.join(','));
    plafond.pcCadreTient.forEach((x) => {
      assert.ok(Math.abs(x - 45) <= 3, 'sans agrandissement, la photo occupe 45 % du cadre, '
        + 'comme la règle du lecteur l\'annonce : ' + x + ' %');
    });
    assert.ok(Math.max.apply(null, plafond.pcCadreSans) > 50,
      'avec agrandissement, elle doit dépasser nettement ces 45 %, sinon ce contrôle ne démontre '
      + 'rien : ' + plafond.pcCadreSans.join(','));
    assert.ok(Math.max.apply(null, plafond.photoAvec) <= plafond.avecPx,
      'avec plafond, aucune photo ne doit dépasser ' + plafond.avecPx + ' px : ' + plafond.photoAvec.join(','));
    assert.ok(plafond.hautAvec < plafond.hautSans,
      'plafonner la photo doit raccourcir l\'image : ' + plafond.hautSans + ' → ' + plafond.hautAvec);
    console.log('      photo : ' + plafond.pcCadreTient[0] + ' % du cadre dans une scène qui contient le '
      + 'document, jusqu\'à ' + Math.max.apply(null, plafond.pcCadreSans) + ' % dans une scène agrandie ('
      + Math.max.apply(null, plafond.photoSans) + ' px) ; plafonnée : ' + plafond.avecPx + ' px — image '
      + plafond.hautSans + ' → ' + plafond.hautAvec + ' px');
    pass('plafond absolu du bandeau photo : absent par défaut, en pixels sur option, et il mord.');

    // ── 21. « BLOC COURANT SEUL » — sur option, et à l'arrêt par défaut ───────────────────────
    const blocSeul = await page.evaluate(async (d) => {
      const A = window.AtelierImages;
      const compter = async (opts) => {
        const sc = await A.ouvrirScene(d, opts);
        const out = [];
        try {
          for (let i = 0; i < sc.etapes.length; i++) {
            await sc.allerA(i);
            const blocs = Array.from(sc.inner.querySelectorAll('.adoc-sc-card > .adoc-sc-block'));
            const vus = blocs.filter((el) => {
              const s = getComputedStyle(el);
              return s.display !== 'none' && s.visibility !== 'hidden';
            });
            const titre = sc.inner.querySelector('.adoc-sc-card-title');
            out.push({ rang: sc.etapes[i].rang, vus: vus.length, total: blocs.length,
              titreVisible: !!titre && getComputedStyle(titre).display !== 'none'
                && titre.getBoundingClientRect().height > 0,
              horsPage: blocs.filter((el) => getComputedStyle(el).display === 'none').length });
          }
        } finally { sc.fermer(); }
        return out;
      };
      // Scène FIXE, pour la même raison qu'au contrôle 20 : « bloc courant seul » suppose
      // une scène unique, et la scène par diapositive refuse la combinaison.
      // 960×540 ×1,4 : sur 1422×800 cette fixture TIENT, et « bloc courant seul » n'aurait
      // rien à raccourcir — le contrôle serait vide.
      const FIXE = { mode: 'fidele', scene: { largeur: 960, hauteur: 540 }, echelleTypo: 1.4 };
      const empile = await compter(FIXE);
      const seul = await compter(Object.assign({ blocCourantSeul: true }, FIXE));
      const rEmpile = await A.rendreImages(d, FIXE);
      const rSeul = await A.rendreImages(d, Object.assign({ blocCourantSeul: true }, FIXE));
      return { empile, seul,
        defautEmpile: rEmpile.bloc_courant_seul, defautSeul: rSeul.bloc_courant_seul,
        hEmpile: rEmpile.images.map((im) => im.hauteur_contenu),
        hSeul: rSeul.images.map((im) => im.hauteur_contenu),
        textesEmpile: rEmpile.images.map((im) => im.textes.length),
        textesSeul: rSeul.images.map((im) => im.textes.length) };
    }, ILLUSTREE);
    assert.equal(blocSeul.defautEmpile, false, 'l\'option doit être ABSENTE par défaut');
    assert.equal(blocSeul.defautSeul, true, 'et le relevé doit la dire quand elle est active');
    // L'empilement du lecteur : à l'étape k, k blocs sont à l'écran. C'est le témoin.
    blocSeul.empile.forEach((e) => {
      assert.equal(e.vus, e.rang, 'empilé, l\'étape ' + e.rang + ' doit montrer ' + e.rang
        + ' bloc(s), pas ' + e.vus);
      assert.equal(e.horsPage, 0, 'et l\'empilement ne retire RIEN de la mise en page');
    });
    blocSeul.seul.forEach((e) => {
      assert.equal(e.vus, 1, 'bloc courant seul : l\'étape ' + e.rang + ' doit montrer 1 bloc, pas ' + e.vus);
      assert.equal(e.titreVisible, true, 'le titre de la diapositive doit RESTER visible');
      assert.equal(e.horsPage, e.total - 1, 'les autres blocs doivent sortir de la mise en page '
        + '(display:none), sinon la carte reste aussi haute : ' + e.horsPage + '/' + (e.total - 1));
    });
    // Et la conséquence mesurable : la carte raccourcit, et les métadonnées ne décrivent plus
    // que ce qui est à l'image.
    const derEmpile = blocSeul.hEmpile[blocSeul.hEmpile.length - 1];
    const derSeul = blocSeul.hSeul[blocSeul.hSeul.length - 1];
    assert.ok(derSeul < derEmpile, 'la dernière étape doit raccourcir : ' + derEmpile + ' → ' + derSeul);
    assert.ok(blocSeul.textesSeul.every((x) => x === 1),
      'les métadonnées ne doivent lister qu\'un texte par étape : ' + blocSeul.textesSeul.join(','));
    assert.ok(Math.max.apply(null, blocSeul.textesEmpile) > 1,
      'alors qu\'empilé elles en listent plusieurs : ' + blocSeul.textesEmpile.join(','));
    console.log('      empilé : ' + blocSeul.empile.map((e) => e.vus).join(',') + ' blocs par étape, hauteur '
      + derEmpile + ' px  |  bloc seul : ' + blocSeul.seul.map((e) => e.vus).join(',') + ', hauteur ' + derSeul + ' px');
    pass('« bloc courant seul » : absent par défaut, un seul bloc sur option, titre conservé, carte raccourcie.');

    // ── 22. LE DÉCODAGE DES PHOTOS EST ATTENDU ────────────────────────────────────────────────
    // Un <img> non décodé occupe 0 px de haut. Mesurer la hauteur du contenu ou du bandeau photo
    // avant le décodage donne un nombre juste en apparence et faux en fait — et la capture montre
    // un trou. Éprouvé sur une image que le serveur retarde volontairement.
    const decodagePhotos = await page.evaluate(async () => {
      const A = window.AtelierImages;
      const hote = document.createElement('div');
      hote.style.cssText = 'position:fixed;left:-20000px;top:0;width:400px;';
      const img = document.createElement('img');
      img.style.cssText = 'width:200px;height:auto;display:block;';
      img.src = '/tests/__lente__.png?t=' + Date.now();
      hote.appendChild(img);
      document.body.appendChild(hote);
      const avant = { complete: img.complete, h: Math.round(img.getBoundingClientRect().height) };
      const etat = await A.attendreImages(hote);
      const apres = { complete: img.complete, h: Math.round(img.getBoundingClientRect().height) };
      // Une image cassée ne doit pas suspendre le rendu : le délai est borné.
      const casse = document.createElement('div');
      const img2 = document.createElement('img');
      img2.src = '/tests/__inexistante__.png';
      casse.appendChild(img2);
      document.body.appendChild(casse);
      const t0 = performance.now();
      await A.attendreImages(casse);
      const msCasse = performance.now() - t0;
      hote.remove(); casse.remove();
      return { avant, apres, etat, msCasse, borne: A.ATTENTE_IMAGES_MS };
    });
    assert.equal(decodagePhotos.avant.h, 0, 'une image non décodée doit bien occuper 0 px — sinon ce '
      + 'contrôle ne démontre rien : ' + JSON.stringify(decodagePhotos.avant));
    assert.equal(decodagePhotos.apres.complete, true, 'après l\'attente, l\'image doit être décodée');
    assert.ok(decodagePhotos.apres.h > 0, 'et occuper une hauteur réelle : ' + decodagePhotos.apres.h + ' px');
    assert.equal(decodagePhotos.etat.pretes, 1, 'l\'attente doit rendre le compte des images prêtes');
    assert.ok(decodagePhotos.msCasse < decodagePhotos.borne + 500,
      'une image cassée ne doit pas suspendre le rendu au-delà de la borne : '
      + Math.round(decodagePhotos.msCasse) + ' ms pour une borne de ' + decodagePhotos.borne + ' ms');
    // ET LE CALL SITE, car une fonction juste qui n'est pas appelée ne protège de rien. Une
    // présentation dont la photo de couverture vient d'une adresse que le serveur retarde de
    // 300 ms : sans l'attente, la première étape capture une carte sans photo, et le bandeau se
    // mesure à zéro. Le dictionnaire d'images embarquées accepte une adresse comme une data-URI,
    // ce qui permet de l'éprouver sans toucher au moteur.
    const decodageRendu = await page.evaluate(async (d) => {
      const cle = 'photo volontairement lente, controle 22';
      window.ADOC_EXPORT_IMAGES = Object.assign({}, window.ADOC_EXPORT_IMAGES || {},
        { [cle]: '/tests/__lente__.png?lente=' + Date.now() });
      const doc = JSON.parse(JSON.stringify(d));
      doc.blocks[0].content.imageRef = cle;
      delete doc.blocks[0].content.imageAssetId;
      const r = await window.AtelierImages.rendreImages(doc, {});
      return r.images.map((im) => im.photo_px);
    }, ILLUSTREE);
    assert.ok(decodageRendu.every((x) => x > 0),
      'chaque étape doit capturer une photo d\'une hauteur réelle, même servie avec 300 ms de '
      + 'retard : ' + decodageRendu.join(','));
    console.log('      photo servie avec 300 ms de retard : ' + decodageRendu.join(', ') + ' px par étape');
    console.log('      image retardée : 0 px avant l\'attente, ' + decodagePhotos.apres.h
      + ' px après  |  image cassée : rendue en ' + Math.round(decodagePhotos.msCasse)
      + ' ms (borne ' + decodagePhotos.borne + ' ms)');
    pass('le décodage des photos est attendu avant toute mesure, et une image cassée ne bloque pas.');

    // ── 23. UNE SCÈNE PAR DIAPOSITIVE — décision du 9 octobre ────────────────────────────────
    // Le texte reste tel quel, tout le visuel reste présent, et c'est la SCÈNE qui s'adapte :
    // la plus petite où la diapositive tient en entier, sans descendre sous le plancher de
    // lisibilité. Deux diapositives de densités différentes doivent donc recevoir deux scènes
    // différentes — sans quoi le mécanisme ne fait rien.
    // UNE CARTE D'UN TITRE ET D'UN SEUL PARAGRAPHE. Elle existe pour une raison précise : sur
    // toutes les autres, la médiane tombe sur 15 px même si l'on recompte les titres, parce que
    // les paragraphes y sont plus nombreux. Avec DEUX tailles et une seule valeur de chacune, la
    // médiane d'un ensemble de deux éléments est la PLUS GRANDE — donc le titre. C'est le seul
    // cas où la mutation « inclure les titres » se voit, et le falsifieur l'a dit en la signalant
    // non détectée sur mes trois présentations.
    const DEUX_TAILLES = JSON.parse(JSON.stringify(PRESENTATIONS[1].doc));
    DEUX_TAILLES.documentId = 'chutier-deux-tailles';
    DEUX_TAILLES.versionId = 'chutier-deux-tailles-v1';
    DEUX_TAILLES.citations = [];
    delete DEUX_TAILLES.deepDives;
    DEUX_TAILLES.blocks = [{ id: 'slide-01', type: 'card', citationIds: [], validation: {},
      content: { title: 'Un titre et un paragraphe', imageRef: null, imageAlt: null, blocks: [
        { id: 'heading-01', type: 'heading', content: { text: 'Un seul titre', level: 2 },
          citationIds: [], validation: {} },
        { id: 'paragraph-01', type: 'paragraph', citationIds: [], validation: {},
          content: { text: 'Un seul paragraphe, qui porte le corps du texte de cette carte.' } },
      ] } }];

    const parDiapo = await page.evaluate(async (docs) => {
      const A = window.AtelierImages;
      const out = {};
      for (const d of docs) {
        // LE TÉMOIN VIENT DE LA PAGE, PAS DU MODULE. On relève, à chaque étape, la taille de
        // police du PREMIER bloc qui n'est pas un titre — par un chemin entièrement différent de
        // celui que `mesureTexte` emploie. C'est ce témoin qui dit si le moteur a mesuré le
        // corps du texte ou le titre, et c'est la question que Christophe a posée par le calcul.
        const temoins = {};
        const r = await A.rendreImages(d.doc, {
          inspecter: function (inner, etape) {
            const carte = inner.querySelector('.adoc-sc-card');
            if (!carte || temoins[etape.cardId]) return null;
            const blocs = Array.prototype.slice.call(
              carte.querySelectorAll(':scope > .adoc-sc-block'));
            const corps = blocs.filter(function (b) {
              return !b.classList.contains('adoc-sc-heading')
                && getComputedStyle(b).display !== 'none'; })[0];
            const titre = blocs.filter(function (b) {
              return b.classList.contains('adoc-sc-heading'); })[0];
            // L'APPAREIL DE CITATION, relevé lui aussi : appels, notes et puce
            // d'approfondissement descendent à 7,7 px. Ce ne sont pas des textes à lire, et la
            // taille mesurée par le moteur doit rester AU-DESSUS d'eux.
            const apparat = Array.prototype.slice.call(carte.querySelectorAll(
              '.adoc-sc-cite, .adoc-sc-cite-flagged, .adoc-sc-cite-note, .adoc-sc-deepdive-chip'))
              .filter(function (el) { return getComputedStyle(el).display !== 'none'
                && (el.textContent || '').trim(); })
              .map(function (el) { return parseFloat(getComputedStyle(el).fontSize); })
              .filter(function (t) { return t; });
            temoins[etape.cardId] = {
              corps: corps ? parseFloat(getComputedStyle(corps).fontSize) : null,
              titre: titre ? parseFloat(getComputedStyle(titre).fontSize) : null,
              apparatMin: apparat.length ? Math.min.apply(null, apparat) : null,
              nbBlocs: blocs.length,
            };
            return null;
          },
        });
        const parCarte = {};
        r.images.forEach((im) => {
          (parCarte[im.cardId] = parCarte[im.cardId] || []).push({
            stepId: im.stepId, l: im.scene_largeur, h: im.scene_hauteur,
            texte_pc: im.texte_pc, raison: im.scene_raison,
            corps_px: im.corps_px, petit_px: im.plus_petit_texte_px,
            petit_pc: im.plus_petit_texte_pc,
            contenu: im.hauteur_contenu, verdict: im.debordement_verdict });
        });
        out[d.cle] = { parCarte: parCarte, plancher: r.plancher_lisibilite_pc,
                       choisie: r.scene_par_diapositive, typo: r.echelle_typo,
                       scenes: r.scenes_par_carte, temoins: temoins,
                       sortie: r.sortie };
      }
      out.__bornes = { largeurMin: A.SCENE_LARGEUR_MIN };
      // Témoin : une scène imposée doit DÉSACTIVER le choix.
      const impose = await A.rendreImages(docs[0].doc, { scene: { largeur: 1000, hauteur: 563 } });
      out.__impose = { choisie: impose.scene_par_diapositive,
                       l: impose.images[0].scene_largeur, raison: impose.images[0].scene_raison };
      return out;
    }, PRESENTATIONS.concat([{ cle: 'deuxTailles', doc: DEUX_TAILLES }]));

    const toutesScenes = [];
    ['couverture', 'dense', 'questionnaire', 'deuxTailles'].forEach((cle) => {
      const d = parDiapo[cle];
      assert.equal(d.choisie, true, cle + ' : la scène doit être choisie par diapositive');
      assert.equal(d.typo, 1, cle + ' : aucune échelle typographique');
      Object.entries(d.parCarte).forEach(([carte, etapes]) => {
        // LA SCÈNE EST CONSTANTE SUR LES ÉTAPES D'UNE MÊME DIAPOSITIVE.
        const largeurs = Array.from(new Set(etapes.map((e) => e.l)));
        assert.equal(largeurs.length, 1,
          cle + '/' + carte + ' : la scène doit être la MÊME sur toutes les étapes : ' + largeurs.join(','));
        const e = etapes[0];
        toutesScenes.push(e.l);
        // LE PLANCHER DE LISIBILITÉ est respecté, toujours.
        assert.ok(e.texte_pc >= d.plancher - 0.01,
          cle + '/' + carte + ' : texte à ' + e.texte_pc + ' % sous le plancher de ' + d.plancher + ' %');
        // ── CE QUE LA COLONNE MESURE, et c'est le corps du texte ────────────────────────────
        // L'IDENTITÉ D'ABORD : le pourcentage annoncé est bien celui de la taille annoncée dans
        // la scène retenue. Une colonne juste sur une mauvaise taille resterait fausse, mais une
        // colonne qui ne découle même pas de sa propre taille serait fausse deux fois.
        const attendu = e.corps_px * d.sortie.largeur / e.l / d.sortie.hauteur * 100;
        assert.ok(Math.abs(e.texte_pc - attendu) <= 0.02,
          cle + '/' + carte + ' : ' + e.texte_pc + ' % annoncé pour ' + e.corps_px
          + ' px dans une scène de ' + e.l + ' px, qui en donne ' + attendu.toFixed(2) + ' %');
        // PUIS LE TÉMOIN, relevé dans la page : la taille mesurée est celle du corps, et non
        // celle du titre. Le défaut valait exactement 1,5 — 22,5 px au lieu de 15.
        const t = d.temoins[carte] || {};
        if (t.corps) {
          assert.equal(e.corps_px, t.corps,
            cle + '/' + carte + ' : le moteur annonce ' + e.corps_px + ' px là où le premier bloc '
            + 'de texte de la page en fait ' + t.corps + ' px');
          if (t.titre) {
            assert.ok(e.corps_px < t.titre,
              cle + '/' + carte + ' : la taille mesurée (' + e.corps_px + ' px) est celle du '
              + 'titre (' + t.titre + ' px), pas celle du corps');
          }
        }
        // ET LE PLUS PETIT TEXTE DE LECTURE EST DIT, qu'il tienne le plancher ou non.
        assert.ok(e.petit_px === null || e.petit_px <= e.corps_px,
          cle + '/' + carte + ' : le plus petit texte (' + e.petit_px + ') ne peut pas dépasser '
          + 'le corps (' + e.corps_px + ')');
        // L'APPAREIL DE CITATION N'EST PAS DU TEXTE À LIRE. Un appel de 7,7 px protégé par un
        // plancher de 2 % imposerait une scène de 683 px et ferait déborder toute la
        // présentation : la mesure doit rester strictement au-dessus de lui.
        if (t.apparatMin) {
          assert.ok(e.petit_px > t.apparatMin,
            cle + '/' + carte + ' : le plus petit texte mesuré (' + e.petit_px + ' px) descend à '
            + 'la taille de l\'appareil de citation (' + t.apparatMin + ' px) — ce sont des '
            + 'marques, pas de la lecture');
        }
        // ET LA DIAPOSITIVE TIENT, sauf si le choix a dit qu'elle débordait.
        const deborde = /dépasse/.test(e.raison || '');
        // LA SCÈNE RETENUE EST LA PLUS PETITE OÙ LA DIAPOSITIVE TIENT, et non une autre qui
        // « tiendrait aussi ». Sans ce contrôle, une recherche qui retiendrait la PLUS GRANDE
        // scène lisible passerait tout ce qui précède : le contenu y tient, le plancher y est
        // respecté, et le texte serait simplement au plus petit possible — exactement ce que
        // la scène par diapositive est censée éviter. Mesuré en inversant la dichotomie :
        // 1422 px retenus au lieu de 647, soit 2,08 % de texte au lieu de 6,18 %.
        //
        // Le grain est celui de la recherche : elle s'arrête quand l'intervalle descend à 8 px.
        // Deux cas, et deux seulement :
        //   · aucune sonde n'a échoué → la plus petite scène possible est la borne basse, et la
        //     retenue doit y être collée ;
        //   · une sonde a échoué → la retenue est juste au-dessus de la plus large qui a échoué.
        const GRAIN = 8;
        const essais = (d.scenes[carte] || {}).essais || [];
        assert.ok(essais.length >= 1, cle + '/' + carte + ' : le choix doit relever ses sondes');
        if (!deborde) {
          const basBorne = Math.min(essais[0].largeur, parDiapo.__bornes.largeurMin);
          const echecs = essais.filter((x) => !x.tient).map((x) => x.largeur);
          if (!echecs.length) {
            assert.ok(e.l <= basBorne + GRAIN,
              cle + '/' + carte + ' : tout tient jusqu\'à la borne basse (' + basBorne
              + ' px) et la scène retenue est pourtant de ' + e.l + ' px — la recherche ne rend '
              + 'pas la plus petite scène, donc pas le plus grand texte lisible');
          } else {
            const plusLargeEchec = Math.max.apply(null, echecs);
            assert.ok(e.l > plusLargeEchec && e.l - plusLargeEchec <= GRAIN,
              cle + '/' + carte + ' : la scène retenue (' + e.l + ' px) doit être à ' + GRAIN
              + ' px au plus au-dessus de la plus large qui ne tient pas (' + plusLargeEchec
              + ' px) ; sondes : ' + essais.map((x) => x.largeur + (x.tient ? '+' : '-')).join(' '));
          }
        }
        if (!deborde) {
          assert.ok(e.contenu <= e.h * 1.02,
            cle + '/' + carte + ' : contenu ' + e.contenu + ' px pour une scène de ' + e.h);
          assert.equal(e.verdict, 'aucun', cle + '/' + carte + ' : verdict ' + e.verdict);
        } else {
          assert.notEqual(e.verdict, 'aucun',
            cle + '/' + carte + ' : annoncé débordant mais verdict « aucun »');
        }
      });
    });
    // DEUX DENSITÉS, DEUX SCÈNES : sans cela, le mécanisme pourrait rendre la même scène partout.
    assert.ok(new Set(toutesScenes).size >= 2,
      'des diapositives de densités différentes doivent recevoir des scènes différentes : '
      + Array.from(new Set(toutesScenes)).join(', '));
    // LE TÉMOIN : une scène imposée désactive le choix.
    assert.equal(parDiapo.__impose.choisie, false, 'une scène imposée désactive le choix');
    assert.equal(parDiapo.__impose.l, 1000, 'et c\'est bien elle qui sert : ' + parDiapo.__impose.l);
    assert.equal(parDiapo.__impose.raison, null, 'aucune raison de choix à annoncer');
    console.log('      scènes retenues : ' + Array.from(new Set(toutesScenes)).sort((a, b) => a - b).join(', ')
      + ' px de large  |  plancher ' + parDiapo.couverture.plancher + ' %');
    // LA CARTE À DEUX TAILLES : son corps DOIT être le paragraphe, pas le titre.
    const dt = Object.values(parDiapo.deuxTailles.scenes)[0];
    const tdt = parDiapo.deuxTailles.temoins['slide-01'] || {};
    assert.equal(dt.taille_px, tdt.corps,
      'carte d\'un titre et d\'un paragraphe : corps mesuré ' + dt.taille_px + ' px pour un '
      + 'paragraphe à ' + tdt.corps + ' px (titre à ' + tdt.titre + ' px)');
    assert.ok(dt.taille_px < tdt.titre,
      'et il doit être strictement plus petit que le titre : ' + dt.taille_px + ' vs ' + tdt.titre);
    console.log('      carte d\'un titre (' + tdt.titre + ' px) et d\'un paragraphe ('
      + tdt.corps + ' px) : corps retenu ' + dt.taille_px + ' px → ' + dt.texte_pc + ' %');

    ['couverture', 'dense', 'questionnaire', 'deuxTailles'].forEach((cle) => {
      Object.entries(parDiapo[cle].scenes).forEach(([carte, s]) => {
        console.log('      ' + (cle + '/' + carte).padEnd(28) + s.scene.largeur + 'x' + s.scene.hauteur
          + '  corps ' + s.taille_px + ' px → ' + s.texte_pc + ' %'
          + (s.plus_petit_px && s.plus_petit_px < s.taille_px
             ? '  (plus petit ' + s.plus_petit_px + ' px → ' + s.plus_petit_pc + ' %)' : '')
          + '  ' + s.essais.length + ' essai(s)  '
          + (s.deborde ? 'DÉBORDE — ' : '') + s.raison);
      });
    });
    pass('une scène par diapositive : constante sur ses étapes, au-dessus du plancher, et elle varie avec la densité.');

    // ── 24. LA PRÉMISSE DE LA SCÈNE PAR DIAPOSITIVE : UNE CARTE, UNE SEULE HAUTEUR ───────────
    // Toute la scène par diapositive repose sur un fait du lecteur, et sur lui seul : la
    // révélation masque en `opacity:0; visibility:hidden`, qui CONSERVENT la mise en page. Les
    // blocs pas encore révélés occupent donc déjà leur place, et une carte a la MÊME hauteur de
    // contenu à toutes ses étapes. C'est ce qui autorise à choisir la scène une fois, sur la
    // première étape, et à s'y tenir pour les suivantes.
    //
    // Si cette prémisse tombait — une révélation en `display:none`, une hauteur mesurée sur les
    // seuls blocs visibles — la scène choisie sur l'étape 1 serait trop petite pour l'étape 4,
    // et le dernier bloc serait coupé : le défaut du 7 octobre, revenu par la porte d'à côté.
    // Rien d'autre dans ces contrôles ne dit cette prémisse ; elle se mesure donc ici.
    //
    // La scène est volontairement petite (640×360) : il faut que la carte DÉBORDE, sans quoi la
    // hauteur mesurée serait celle de la scène à chaque étape et le contrôle serait vide.
    const premisse = await page.evaluate(async (doc) => {
      const A = window.AtelierImages;
      const sc = await A.ouvrirScene(doc, { scene: { largeur: 640, hauteur: 360 } });
      try {
        const etapes = [];
        for (let i = 0; i < sc.etapes.length; i++) {
          await sc.allerA(i);
          const m = sc.mesurer();
          etapes.push({ step: sc.etapes[i].stepId, carte: sc.etapes[i].cardId,
                        contenu: 360 + m.px, px: m.px });
        }
        return { etapes: etapes, scene: sc.scene };
      } finally { sc.fermer(); }
    }, PRESENTATIONS[1].doc);
    const cartesPremisse = {};
    premisse.etapes.forEach((e) => { (cartesPremisse[e.carte] = cartesPremisse[e.carte] || []).push(e); });
    let etapesComparees = 0;
    Object.entries(cartesPremisse).forEach(([carte, etapes]) => {
      assert.ok(etapes.length >= 2,
        carte + ' : il faut au moins deux étapes pour comparer (' + etapes.length + ')');
      // ELLE DOIT DÉBORDER, sinon la hauteur mesurée est celle de la scène et ne dit rien.
      etapes.forEach((e) => assert.ok(e.px > 0,
        carte + '/' + e.step + ' : la carte doit déborder de cette petite scène pour que la '
        + 'comparaison porte sur une vraie hauteur de contenu (' + e.contenu + ' px)'));
      const hauteurs = Array.from(new Set(etapes.map((e) => e.contenu)));
      assert.equal(hauteurs.length, 1,
        carte + ' : la hauteur de contenu doit être la MÊME à toutes les étapes — '
        + etapes.map((e) => e.step + ' ' + e.contenu + ' px').join(', ')
        + ' — sinon la scène choisie sur la première étape ne vaut pas pour les suivantes');
      etapesComparees += etapes.length;
    });
    console.log('      prémisse : ' + etapesComparees + ' étapes d\'une même carte, toutes à '
      + premisse.etapes[0].contenu + ' px de contenu dans une scène de 640x360 (les blocs non '
      + 'révélés occupent déjà leur place).');
    pass('une carte a la même hauteur de contenu à toutes ses étapes : la scène peut se choisir une fois.');

    // ── 25. LE TRAVELLING : UN PLAN, CALCULÉ SUR LA DURÉE DU COMMENTAIRE ─────────────────────
    // Une diapositive qui déborde est livrée sur TOUTE sa hauteur — c'est acquis depuis le
    // 7 octobre. Ce qui manquait, c'est le plan : de combien, pendant combien de temps, à quelle
    // vitesse, et avec quel temps de pose aux deux bouts. Sans lui, le montage aurait à refaire
    // le calcul, donc à le refaire AUTREMENT.
    //
    // La durée vient de la narration du lot 1a (mots ÷ 2,5). Les trois présentations d'essai n'en
    // portent pas : on en écrit une ici, validée contre le schéma réel, en deux versions qui ne
    // diffèrent que par la LONGUEUR du commentaire — assez long pour défiler, trop court pour
    // défiler. C'est la comparaison des deux qui montre que la durée décide.
    const NARRE = JSON.parse(JSON.stringify(PRESENTATIONS[2].doc));
    NARRE.documentId = 'chutier-narre'; NARRE.versionId = 'chutier-narre-v1';
    const motsLongs = 'Prenez le temps de lire chaque question avant de repondre, sans chercher '
      + 'la bonne reponse : il n y en a pas, et c est le mouvement qui compte ici plus que le '
      + 'resultat lui meme, quel qu il soit au bout du compte.';   // 40 mots → 16 s
    NARRE.narration = [{ stepId: 'questionnaire-01', text: motsLongs }];
    const PRESSE = JSON.parse(JSON.stringify(NARRE));
    PRESSE.documentId = 'chutier-presse'; PRESSE.versionId = 'chutier-presse-v1';
    PRESSE.narration = [{ stepId: 'questionnaire-01', text: 'Repondez vite.' }];   // 2 mots → 0,8 s

    // ET UNE TROISIÈME VERSION, SANS NARRATION DU TOUT, qui déborde au-delà du seuil de
    // scission. C'est le cas de la vraie présentation de Christophe : un export ne porte jamais
    // de narration, donc le plan n'a pas de durée et le verdict retombe sur le rapport. Les deux
    // lignes du relevé doivent quand même dire la même chose. Le paragraphe est fabriqué ici,
    // assez long pour dépasser le seuil même à la scène la plus large que le plancher autorise.
    const MUETTE = JSON.parse(JSON.stringify(PRESENTATIONS[1].doc));
    MUETTE.documentId = 'chutier-muette'; MUETTE.versionId = 'chutier-muette-v1';
    const phrase = (i) => 'Phrase numero ' + i + ' d un paragraphe volontairement long, ecrite '
      + 'pour occuper plusieurs lignes et pousser la carte bien au-dela de son cadre, sans rien '
      + 'dire de particulier.';
    MUETTE.blocks = [{ id: 'slide-01', type: 'card', citationIds: [], validation: {},
      content: { title: 'Carte tres longue', imageRef: null, imageAlt: null, blocks: [
        { id: 'heading-01', type: 'heading', content: { text: 'Un titre', level: 2 },
          citationIds: [], validation: {} },
        { id: 'paragraph-01', type: 'paragraph', citationIds: [], validation: {},
          content: { text: Array.from({ length: 90 }, (_, i) => phrase(i + 1)).join(' ') } },
      ] } }];
    // `citations` est obligatoire dans le schéma : on la vide, on ne la retire pas. Mesuré —
    // AJV refusait le document, et le contrôle a d'abord échoué là.
    MUETTE.citations = []; delete MUETTE.narration; delete MUETTE.deepDives;

    const trav = await page.evaluate(async (docs) => {
      const A = window.AtelierImages;
      const P = A.planTravelling;
      // L'UNITÉ, AUX BORNES. 600 px en 11,6 s : la durée utile fait 10 s, donc 60 px/s pile —
      // la borne est tenable, et un pixel de plus ne l'est plus. C'est là que se joue la règle,
      // et nulle part ailleurs.
      const unite = {
        rien: P(0, 30), negatif: P(-40, 30), sansDuree: P(400, null),
        // 1,6 s : les deux poses, pile — il reste zéro seconde pour défiler. 1,0 s : il en
        // manque. Les deux doivent être refusés, et le second compte autant que le premier :
        // une durée utile NÉGATIVE donnerait une vitesse négative, donc « sous la borne ».
        poseTropGrande: P(400, 1.6), poseTropGrandeStricte: P(400, 1.0),
        pile: P(600, 11.6), unPeuTrop: P(601, 11.6),
      };
      const sorties = {};
      for (const d of docs) {
        const v = window.adocValidateSchema('clinicalDocument', d.doc);
        const r = await A.rendreImages(d.doc, {});
        sorties[d.cle] = {
          valide: !!v.valid, ignore: !!v.skipped,
          erreurs: (v.errors || []).slice(0, 2).map(String),
          pose: r.pose_travelling_s, resume: r.travellings,
          images: r.images.map((im) => ({ step: im.stepId, rang: im.rang, h: im.hauteur,
            verdict: im.debordement_verdict, scission: im.scission_conseillee,
            regle: im.debordement_regle, t: im.travelling,
            visible: im.hauteur_visible, visibleSortie: im.hauteur_visible_sortie })),
        };
      }
      return { unite: unite, sorties: sorties, poseDefaut: A.POSE_TRAVELLING_S };
    }, [{ cle: 'narre', doc: NARRE }, { cle: 'presse', doc: PRESSE }, { cle: 'muette', doc: MUETTE }]);

    assert.equal(trav.unite.rien, null, 'rien à faire défiler : aucun plan');
    assert.equal(trav.unite.negatif, null, 'une course négative n\'est pas un travelling');
    assert.equal(trav.unite.sansDuree.tenable, null, 'sans durée, « tenable » ne se prononce pas');
    assert.equal(trav.unite.sansDuree.vitesse_px_par_s, null, 'et aucune vitesse n\'est inventée');
    assert.equal(trav.unite.sansDuree.fin_y, 400, 'la course, elle, est connue');
    assert.equal(trav.unite.poseTropGrande.tenable, false,
      'un commentaire qui ne dépasse pas les deux poses ne laisse aucun temps pour défiler');
    assert.equal(trav.unite.poseTropGrande.duree_utile_s, 0, 'et la durée utile est nulle');
    assert.equal(trav.unite.poseTropGrandeStricte.tenable, false,
      'un commentaire plus court que les deux poses ne défile pas non plus : '
      + JSON.stringify(trav.unite.poseTropGrandeStricte));
    assert.equal(trav.unite.poseTropGrandeStricte.vitesse_px_par_s, null,
      'et aucune vitesse négative n\'est rendue');
    assert.equal(trav.unite.pile.vitesse_px_par_s, 60, 'la borne, pile : ' + trav.unite.pile.vitesse_px_par_s);
    assert.equal(trav.unite.pile.tenable, true, 'à 60 px/s exactement, c\'est tenable');
    assert.equal(trav.unite.unPeuTrop.tenable, false,
      'un pixel de plus ne l\'est plus : ' + trav.unite.unPeuTrop.vitesse_px_par_s + ' px/s');
    assert.equal(trav.poseDefaut, 0.8, 'la pose par défaut');

    ['narre', 'presse', 'muette'].forEach((cle) => {
      const d = trav.sorties[cle];
      assert.equal(d.ignore, false, cle + ' : AJV doit être actif');
      assert.equal(d.valide, true, cle + ' : document invalide — ' + d.erreurs.join(' | '));
      assert.equal(d.pose, 0.8, cle + ' : la pose doit être dite dans le relevé');
      // ET L'ÉCART ENTRE « ça déborde » ET « il y a une course » EST COMPTÉ, au lieu d'être
      // laissé à l'interprétation : une étape qui ne montre que le haut de sa diapositive
      // déborde sans avoir quoi que ce soit à faire défiler.
      assert.equal(d.resume.sans_course,
        d.images.filter((im) => im.verdict !== 'aucun' && !im.t).length,
        cle + ' : ' + d.resume.sans_course + ' annoncée(s) sans course pour '
        + d.images.filter((im) => im.verdict !== 'aucun' && !im.t).length + ' observée(s)');
      // LES DEUX LIGNES DU RELEVÉ DISENT LA MÊME CHOSE. Mesuré sur la vraie présentation de
      // Christophe : quatre étapes « scission » d'un côté, « 0 à scinder » de l'autre, parce que
      // l'export ne porte pas de narration et que les deux lignes ne suivaient pas la même règle.
      assert.equal(d.resume.a_scinder.length, d.images.filter((im) => im.scission).length,
        cle + ' : ' + d.images.filter((im) => im.scission).length + ' étape(s) à scinder et '
        + d.resume.a_scinder.length + ' dans le résumé');
      d.images.forEach((im) => {
        // AUCUN PLAN QUAND L'IMAGE TIENT DANS LE CADRE, et un plan dès qu'elle en sort.
        if (im.h <= 1080) {
          assert.equal(im.t, null, cle + '/' + im.step + ' : image de ' + im.h + ' px, aucun plan attendu');
          return;
        }
        if (im.visibleSortie <= 1080) {
          // L'IMAGE EST HAUTE, MAIS CETTE ÉTAPE NE MONTRE QUE LE HAUT : rien à faire défiler.
          assert.equal(im.t, null, cle + '/' + im.step + ' : ' + im.visibleSortie
            + ' px de visible dans un cadre de 1080, aucun travelling ne doit être proposé');
          return;
        }
        assert.ok(im.t, cle + '/' + im.step + ' : image de ' + im.h + ' px sans plan de travelling');
        // LA COURSE EST CELLE DU VISIBLE À CETTE ÉTAPE, bornée par la hauteur de l'image : on ne
        // fait pas défiler du vide. Les blocs pas encore révélés occupent leur place dans
        // l'image — c'est ce qui permet le fondu de l'Ef1 — mais ils ne portent pas d'encre.
        assert.equal(im.t.course_px, Math.min(im.h, im.visibleSortie) - 1080,
          cle + '/' + im.step + ' : course ' + im.t.course_px + ' px pour ' + im.visibleSortie
          + ' px de visible dans une image de ' + im.h);
        assert.equal(im.t.debut_y, 0, 'le travelling part du haut');
        assert.equal(im.t.fin_y, im.t.course_px, 'et finit au bas de ce qui est révélé');
        // LE VERDICT ET LE PLAN DISENT LA MÊME CHOSE — chacun sous sa règle, et les deux
        // nommées. Sans durée, le verdict retombe sur le rapport et le plan ne se prononce pas :
        // c'est cohérent, à condition que les deux le DISENT.
        if (im.t.tenable === null) {
          assert.equal(im.regle, 'rapport',
            cle + '/' + im.step + ' : sans durée, la règle doit être le rapport (' + im.regle + ')');
          assert.equal(im.t.vitesse_px_par_s, null, cle + '/' + im.step + ' : aucune vitesse inventée');
        } else {
          assert.equal(im.regle, 'vitesse', cle + '/' + im.step + ' : règle ' + im.regle);
          assert.equal(im.verdict, im.t.tenable ? 'defilement' : 'scission',
            cle + '/' + im.step + ' : verdict ' + im.verdict + ' et plan tenable=' + im.t.tenable);
        }
        assert.equal(im.scission, im.verdict === 'scission', cle + '/' + im.step + ' : conseil incohérent');
      });
    });
    // LES DEUX VERSIONS DOIVENT SE SÉPARER : même image, même course, et deux verdicts. Sans
    // cela, ce contrôle ne montrerait pas que la durée du commentaire décide.
    const dNarre = trav.sorties.narre.images.find((im) => im.h > 1080);
    const dPresse = trav.sorties.presse.images.find((im) => im.h > 1080);
    assert.ok(dNarre && dPresse, 'il faut une étape qui déborde dans les deux versions');
    assert.equal(dNarre.t.course_px, dPresse.t.course_px, 'la même course dans les deux versions');
    assert.equal(dNarre.t.tenable, true, 'commenté 16 s, il défile : ' + dNarre.t.raison);
    assert.equal(dPresse.t.tenable, false, 'commenté 0,8 s, il ne défile pas : ' + dPresse.t.raison);
    assert.equal(trav.sorties.narre.resume.tenables, 1, 'le relevé compte un travelling tenable');
    assert.deepEqual(trav.sorties.presse.resume.a_scinder.map((x) => x.stepId), [dPresse.step],
      'et l\'autre version nomme l\'étape à scinder');
    assert.equal(trav.sorties.narre.resume.course_max_px, dNarre.t.course_px, 'la course maximale est relevée');
    // LA TROISIÈME VERSION : elle déborde au-delà du seuil, sans aucune narration. C'est le cas
    // réel, et c'est celui où les deux lignes du relevé se contredisaient.
    // ── LA COURSE ÉTAPE PAR ÉTAPE, sur une carte haute à plusieurs étapes ───────────────────
    // La question de Christophe : le plan suit-il le contenu VISIBLE ou la carte entière ? La
    // carte « muette » porte un titre puis un très long paragraphe : à la première étape, seul
    // le titre a de l'encre, et l'image fait déjà toute sa hauteur. Si la course suivait la
    // carte, le travelling parcourrait une page blanche pendant tout le commentaire.
    const parEtape = trav.sorties.muette.images.map((im) => im.t ? im.t.course_px : 0);
    assert.equal(parEtape[0], 0,
      'première étape : rien de révélé en bas, donc aucune course — ' + parEtape.join(', '));
    assert.ok(parEtape[parEtape.length - 1] > 0,
      'dernière étape : tout est révélé, donc une course — ' + parEtape.join(', '));
    for (let i = 1; i < parEtape.length; i++) {
      assert.ok(parEtape[i] >= parEtape[i - 1],
        'la course ne peut que croître au fil des étapes : ' + parEtape.join(', '));
    }
    assert.equal(trav.sorties.muette.resume.sans_course, 1,
      'la première étape de la carte haute déborde sans avoir de course : '
      + trav.sorties.muette.resume.sans_course);
    console.log('      course par étape (carte haute) : ' + trav.sorties.muette.images
      .map((im) => 'étape ' + im.rang + ' → ' + im.visibleSortie + ' px visibles, course '
        + (im.t ? im.t.course_px : 0) + ' px').join('  |  '));

    const dMuette = trav.sorties.muette.images.filter((im) => im.t && im.t.course_px > 0).pop();
    assert.ok(dMuette, 'la carte très longue doit déborder : '
      + trav.sorties.muette.images.map((im) => im.h).join(', '));
    assert.ok(dMuette.h / 1080 > 1.8,
      'et dépasser le seuil de scission, sinon ce cas ne se distingue pas : rapport '
      + (dMuette.h / 1080).toFixed(2));
    assert.equal(trav.sorties.muette.resume.sans_duree, trav.sorties.muette.resume.nombre,
      'aucune de ses étapes n\'a de durée connue');
    assert.equal(dMuette.verdict, 'scission', 'son verdict : ' + dMuette.verdict);
    // TOUTES ses étapes, et non la dernière : la carte a une seule hauteur, donc elle déborde
    // dès sa première étape (contrôle 24).
    // TOUTES ses étapes : le conseil porte sur la diapositive, et la carte a une seule hauteur
    // (contrôle 24), donc elle déborde dès sa première étape — même si cette étape n'a encore
    // rien à faire défiler.
    assert.equal(trav.sorties.muette.resume.a_scinder.length, trav.sorties.muette.images.length,
      'chaque étape de la diapositive à scinder doit être nommée : '
      + JSON.stringify(trav.sorties.muette.resume.a_scinder.map((x) => x.stepId)));
    trav.sorties.muette.resume.a_scinder.forEach((x) => {
      assert.equal(x.regle, 'rapport', x.stepId + ' : règle ' + x.regle);
      assert.match(x.raison, /durée du commentaire n'est pas encore connue/,
        x.stepId + ' : le résumé doit dire que la durée manque — ' + x.raison);
    });
    console.log('      sans narration : image de ' + dMuette.h + ' px (rapport '
      + (dMuette.h / 1080).toFixed(2) + '), ' + trav.sorties.muette.resume.a_scinder[0].raison);
    console.log('      travelling : ' + dNarre.t.course_px + ' px de course sur une image de '
      + dNarre.h + ' px  |  commenté ' + dNarre.t.duree_s + ' s → ' + dNarre.t.vitesse_px_par_s
      + ' px/s en ' + dNarre.t.duree_utile_s + ' s utiles (borne 60)');
    console.log('      le même, commenté ' + dPresse.t.duree_s + ' s → ' + dPresse.t.raison);
    pass('le travelling a un plan : course, poses, durée utile, vitesse, et le verdict en découle.');

    // ── 26. LE TRAVELLING N'OUBLIE AUCUNE ENCRE — vérifié sur les PIXELS ─────────────────────
    // La course s'arrête au bas de ce qui est RÉVÉLÉ, et non au bas de l'image. Mesuré sur la
    // vraie présentation de Christophe : à la dernière étape de sa diapositive à questionnaire,
    // l'image fait 3208 px et le visible s'arrête à 2230 — près de mille pixels d'image que le
    // travelling ne parcourt pas. Deux lectures possibles, et une seule est acceptable : soit
    // cette zone est vide (la scène a été agrandie, le bandeau photo a grandi avec elle et a
    // laissé du blanc en bas), soit elle porte du texte, et alors le travelling le manquerait.
    //
    // La question ne se tranche pas en lisant le code : elle se tranche en LISANT LES PIXELS. On
    // décode l'image livrée et on compare chaque pixel sous la fin du travelling au fond de la
    // carte. La carte illustrée d'essai est faite pour ce cas : photo de couverture, du texte, un
    // encadré en dernier bloc — c'est elle qui a révélé la troncature du 7 octobre.
    const encre = await page.evaluate(async (doc) => {
      const A = window.AtelierImages;
      // SCÈNE IMPOSÉE, et c'est voulu : en scène par diapositive, cette carte TIENT — c'est
      // tout l'objet du 9 octobre. Pour éprouver la zone que le travelling ne parcourt pas, il
      // faut une diapositive qui déborde, donc une scène qu'il faut agrandir : c'est
      // l'agrandissement qui fait grandir le bandeau photo et laisse du blanc en bas, exactement
      // le mécanisme observé sur la vraie présentation (image 3208 px, visible 2230 px).
      // 640x360 : mesuré, c'est la scène où cette carte laisse le plus grand écart entre
      // l'image (2127 px) et le visible (1611 px à la dernière étape), soit 516 px que le
      // travelling ne parcourt pas. C'est la zone à examiner.
      const r = await A.rendreImages(doc, { mode: 'fidele', scene: { largeur: 640, hauteur: 360 } });
      const im = r.images.filter((x) => x.travelling && x.travelling.course_px > 0).pop()
        || r.images[r.images.length - 1];
      const bmp = await createImageBitmap(im.blob);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const fin = im.travelling ? im.travelling.fin_y : 0;
      const y0 = Math.min(bmp.height, fin + r.sortie.hauteur);
      // LA RÉFÉRENCE EST PRISE DANS L'IMAGE, et non déclarée : `im.fond` vaut null ici, parce que
      // c'est la CARTE qui porte la couleur de fond, pas la scène. Le coin bas-gauche de l'image
      // est du fond dans toute mise en page ; si jamais il portait de l'encre, ce contrôle
      // échouerait bruyamment, ce qui est le bon sens de l'erreur.
      const coin = ctx.getImageData(4, bmp.height - 4, 1, 1).data;
      const fond = [coin[0], coin[1], coin[2]];
      let examines = 0, differents = 0, pire = 0, premiereLigne = null;
      if (y0 < bmp.height) {
        const d = ctx.getImageData(0, y0, bmp.width, bmp.height - y0).data;
        for (let i = 0; i < d.length; i += 4) {
          examines++;
          const ecart = Math.max(Math.abs(d[i] - fond[0]), Math.abs(d[i + 1] - fond[1]),
                                 Math.abs(d[i + 2] - fond[2]));
          if (ecart > 8) {
            differents++;
            if (ecart > pire) pire = ecart;
            if (premiereLigne === null) premiereLigne = y0 + Math.floor((i / 4) / bmp.width);
          }
        }
      }
      // LA HAUTEUR SE LIT AVANT `close()` : après, elle vaut 0, et le contrôle croyait n'avoir
      // rien à examiner. Mesuré — c'est ce qu'il a d'abord annoncé.
      const hauteur = bmp.height;
      c.width = 0; c.height = 0; bmp.close();
      return { step: im.stepId, h: hauteur, fin: fin, y0: y0,
               fond: 'rgb(' + fond.join(', ') + ') lu dans l\'image',
               visible: im.hauteur_visible_sortie, examines, differents, pire, premiereLigne,
               course: im.travelling ? im.travelling.course_px : 0 };
    }, ILLUSTREE);

    assert.ok(encre.course > 0,
      'la carte illustrée doit déborder pour que ce contrôle porte : course ' + encre.course);
    assert.ok(encre.y0 < encre.h,
      'il doit rester de l\'image sous la fin du travelling, sinon rien n\'est examiné : '
      + encre.y0 + ' / ' + encre.h);
    assert.ok(encre.examines > 0, 'aucun pixel examiné : ' + JSON.stringify(encre));
    // AUCUNE ENCRE SOUS LA FIN DU TRAVELLING. Tolérance de 8 niveaux sur 255 : l'antialiasing du
    // fond et la composition sur le canvas ne donnent pas deux fois le même octet.
    assert.equal(encre.differents, 0,
      'le travelling s\'arrête à ' + encre.y0 + ' px et il reste de l\'encre en dessous : '
      + encre.differents + ' pixel(s) sur ' + encre.examines + ', premier à la ligne '
      + encre.premiereLigne + ', écart maximal ' + encre.pire + ' niveaux — le travelling '
      + 'manquerait du contenu');
    console.log('      pixels sous la fin du travelling : ' + encre.examines + ' examinés entre '
      + encre.y0 + ' et ' + encre.h + ' px, aucun ne s\'écarte du fond ' + encre.fond
      + ' de plus de 8 niveaux (course ' + encre.course + ' px, visible ' + encre.visible + ' px).');
    pass('le travelling n\'oublie aucune encre : la zone qu\'il ne parcourt pas est vide, vérifié pixel à pixel.');

    // ── 27. Aucune erreur de page pendant tout cela ───────────────────────────────────────────
    assert.deepEqual(erreurs, [], 'la page ne doit lever aucune erreur : ' + erreurs.join(' | '));
    pass('aucune erreur de page sur l\'ensemble des rendus.');

    console.log('\nPASS verify-atelier-images — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
