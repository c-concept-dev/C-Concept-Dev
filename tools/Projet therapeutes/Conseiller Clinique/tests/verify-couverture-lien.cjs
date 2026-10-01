// LIEN SUR L'IMAGE DE COUVERTURE D'UNE DIAPOSITIVE.
//
// ÉTAT PRÉCÉDENT, établi par ce test et conservé ici pour mémoire : la couverture ne portait AUCUN
// onclick — ni agrandissement, ni renvoi. Ce test l'affirmait, en prévenant que « si cette assertion
// tombe un jour parce que la couverture devient cliquable, il faudra décider explicitement ce que fait
// ce clic face à la puce ». Elle est tombée, et la décision a été prise explicitement (alignement,
// option 4) : UN SEUL CONTRAT sur les deux porteurs — le clic AGRANDIT, la puce mène à la page.
//
// L'invariant tenu ici reste donc le même, et c'est lui qui compte : le renvoi ne doit JAMAIS être
// capté par l'image, ce qu'aucun contrôle de présence de puce ne verrait. Ce qui change, c'est que
// l'image porte désormais un geste à elle — l'agrandissement — au lieu de n'en porter aucun. Le
// renvoi se manifeste toujours par une puce « ↳ Approfondir » SOUS la couverture, et ce test éprouve
// la coexistence des DEUX gestes par de vrais clics, pas seulement la présence de la puce.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');

// Document CONVERTI (forme de stockage), pour les contrôles de rendu.
const DOC = {
  documentKind: 'presentation', title: 'Couverture', citations: [],
  blocks: [
    { id: 'slide-01', type: 'card', content: {
      title: 'Avec couverture et renvoi', imageRef: 'therapist office chairs', imageAlt: 'Un cabinet',
      coverDeepDiveLinks: [{ text: 'cabinet', targetId: 'n1' }],
      blocks: [{ id: 'p1', type: 'paragraph', content: { text: 'Un texte.' }, citationIds: [], validation: {} }] } },
    { id: 'slide-02', type: 'card', content: {
      title: 'Avec couverture, sans renvoi', imageRef: 'calm room', imageAlt: 'Une pièce',
      blocks: [{ id: 'p2', type: 'paragraph', content: { text: 'Un autre texte.' }, citationIds: [], validation: {} }] } },
  ],
  deepDives: [{ id: 'n1', title: 'La page de couverture', paragraphs: [{ text: 'Un paragraphe assez long pour être conservé.', links: [] }] }],
};

async function ouvrir(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(url);
  return { page, erreurs };
}

async function entrerEnPresentation(page, doc) {
  await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('assistdoc-screen')?.classList.add('active');
    document.getElementById('cc-workspace')?.classList.add('open');
  });
  await page.evaluate((d) => window.adocPresentOpenWithDoc(d), doc);
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'couverture-lien-'));
  let n = 0;
  try {
    // ── 1 — LA CHAÎNE D'ANALYSE ET DE FILTRAGE, sur les deux briques réellement atteignables ──
    // PÉRIMÈTRE HONNÊTE : la conversion complète vit à l'intérieur du pipeline de génération (elle lit
    // toolUseInput de sa portée englobante) et n'est pas extractible sans refonte. Ce qui est éprouvé
    // ici est donc la composition exacte que la conversion applique — adocParseLienFleche puis
    // adocFilterBlockDeepDiveLinks — et non l'appel du pipeline. La règle « pas de couverture, pas de
    // clé » reste, elle, couverte par les contrôles de rendu ci-dessous (diapositive 2 sans renvoi) et
    // non par un appel direct : c'est une limite assumée, pas un oubli.
    {
      const { page, erreurs } = await ouvrir(browser, PAGE);
      await page.waitForFunction(() => typeof window.adocParseLienFleche === 'function'
        && typeof window.adocFilterBlockDeepDiveLinks === 'function');
      const r = await page.evaluate(() => {
        const brut = ['le cabinet → n1', 'variante ascii -> n1', 'cible morte → nX', 'sans fleche',
                      '   → n1', 'expression → ', 'avec emoji 🙂 → n1'];
        const analyses = brut.map(window.adocParseLienFleche);
        const retenues = analyses.filter(Boolean);
        const filtres = window.adocFilterBlockDeepDiveLinks(
          { type: 'paragraph', deepDiveLinks: retenues }, new Set(['n1']), { n1: 'La page' });
        return { analyses: analyses.map((a) => a && a.text + '|' + a.targetId), filtres: filtres };
      });
      assert.deepEqual(r.analyses, [
        'le cabinet|n1', 'variante ascii|n1', 'cible morte|nX', null, null, null, 'avec emoji|n1',
      ], 'l\'analyseur : « → » et « -> » acceptés, entrée sans flèche refusée, expression vide refusée, '
       + 'id vide refusé, emoji retiré. Reçu : ' + JSON.stringify(r.analyses));
      assert.deepEqual(r.filtres, [
        { text: 'le cabinet', targetId: 'n1' },
        { text: 'variante ascii', targetId: 'n1' },
        { text: 'avec emoji', targetId: 'n1' },
      ], 'le filtre retire la cible inexistante EN SILENCE, comme pour les renvois de bloc — jamais un '
       + 'rejet du bloc entier. Reçu : ' + JSON.stringify(r.filtres));
      assert.deepEqual(erreurs, [], 'erreurs JS : ' + erreurs.join(' | '));
      console.log('PASS ' + (++n) + ' — analyse « expression → id » et filtrage par le mécanisme de bloc, cible morte retirée.');
      await page.close();
    }

    // ── 2 — LE RENDU en mode présentation : puce présente, et UNIQUEMENT où il y a un renvoi ──
    const { page, erreurs } = await ouvrir(browser, PAGE);
    await entrerEnPresentation(page, DOC);
    const etatSlide = (i) => page.evaluate((idx) => {
      // On se place sur la diapositive demandée puis on lit son rendu réel.
      window.adocPresentGoTo(idx);
      return new Promise((res) => setTimeout(() => {
        const inner = document.getElementById('cc-ws-present-slide-inner');
        const img = inner.querySelector('img.adoc-sc-card-img');
        const chips = Array.from(inner.querySelectorAll('.adoc-sc-card-cover-chips .adoc-sc-deepdive-chip'));
        res({
          image: !!img,
          onclickImage: img ? (img.getAttribute('onclick') || '') : '',
          puces: chips.length,
          cible: chips.length ? (chips[0].getAttribute('onclick') || '') : '',
          puceApresImage: !!(img && chips.length
            && (img.compareDocumentPosition(chips[0]) & Node.DOCUMENT_POSITION_FOLLOWING)),
        });
      }, 350));
    }, i);

    const s1 = await etatSlide(0);
    assert.equal(s1.image, true, 'la diapositive 1 a bien une couverture');
    assert.equal(s1.puces, 1, 'une puce « ↳ Approfondir » sous la couverture de la diapositive 1');
    assert.ok(/adocPresentOpenDeepDive\('n1'\)/.test(s1.cible), 'la puce pointe vers la bonne page : ' + s1.cible);
    assert.equal(s1.puceApresImage, true, 'la puce est SOUS l\'image, jamais au-dessus');
    console.log('PASS ' + (++n) + ' — puce rendue sous la couverture, pointant vers la bonne page.');

    // ── 3 — COEXISTENCE : le clic sur l'image garde l'agrandissement ──
    assert.ok(!/adocPresentOpenDeepDive/.test(s1.onclickImage),
      'le renvoi ne doit JAMAIS être capté par l\'image de couverture — ce serait deux sens pour un seul '
      + 'geste, et cela retirerait silencieusement le comportement existant. Reçu : ' + JSON.stringify(s1.onclickImage));
    // CETTE ASSERTION EST TOMBÉE, et c'était prévu ici même : « il faudra décider explicitement ce
    // que fait ce clic face à la puce — jamais le laisser se décider par accident ». La décision a
    // été prise explicitement (alignement, option 4) : le clic AGRANDIT, la puce mène à la page.
    // L'assertion est donc remplacée par celle du geste décidé, et NON retirée — l'assertion qui la
    // protège, juste au-dessus (le renvoi ne doit jamais être capté par l'image), reste intacte.
    //
    // Ce que l'état d'avant cachait : la couverture n'était pas « inchangée », elle n'avait AUCUN
    // geste. Mesuré — clic AUCUN, curseur auto, hors tabulation — alors qu'un commentaire de
    // adocRenderCardHTML affirmait que « le clic sur l'image reste l'agrandissement ». Une
    // illustration de couverture pleine largeur ne pouvait donc pas être agrandie du tout.
    assert.equal(s1.onclickImage, 'window.adocPresentOpenImageDoor(this)',
      'le clic sur la couverture ouvre désormais l\'AGRANDISSEMENT : un seul contrat sur les deux '
      + 'porteurs, « le clic agrandit, la puce mène ailleurs ». Reçu : ' + JSON.stringify(s1.onclickImage));
    console.log('PASS ' + (++n) + ' — la puce n\'a pas capté l\'image : celle-ci agrandit, la puce mène à la page.');

    const s2 = await etatSlide(1);
    assert.equal(s2.image, true, 'la diapositive 2 a une couverture');
    assert.equal(s2.puces, 0, 'aucune puce sur une diapositive sans renvoi de couverture');
    console.log('PASS ' + (++n) + ' — aucune puce là où aucun renvoi n\'est posé.');

    // ── 4 — LES DEUX GESTES, RÉELLEMENT CLIQUÉS ──
    await page.evaluate(() => window.adocPresentGoTo(0));
    await page.waitForTimeout(350);
    await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card-cover-chips .adoc-sc-deepdive-chip').click());
    await page.waitForTimeout(450);
    const titre = await page.evaluate(() => document.querySelector('.cc-ws-present-door-title')?.textContent);
    assert.equal(titre, 'La page de couverture', 'le clic sur la puce ouvre la page d\'approfondissement');
    await page.evaluate(() => window.adocPresentDeepDiveHome());
    await page.waitForTimeout(350);
    await page.evaluate(() => document.querySelector('#cc-ws-present-slide-inner img.adoc-sc-card-img').click());
    await page.waitForTimeout(450);
    const apresImage = await page.evaluate(() => {
      const porte = document.getElementById('cc-ws-present-door');
      const ouverte = porte.classList.contains('open');
      // Le titre n'est lu QUE si la porte est ouverte : une porte refermée conserve son innerHTML,
      // et lire ce résidu ferait croire à une page ouverte alors que rien ne s'affiche.
      return { porte: ouverte, titre: ouverte ? (porte.querySelector('.cc-ws-present-door-title')?.textContent || null) : null };
    });
    assert.equal(apresImage.porte, true,
      'un clic sur la couverture ouvre désormais une porte : l\'AGRANDISSEMENT');
    // Le titre n'est pas lu pour trancher la SORTE de porte : adocPresentOpenImageDoor masque
    // .cc-ws-present-door-text sans réécrire son contenu, donc un titre de page précédemment ouverte
    // y reste lisible alors qu'il n'est plus affiché. C'est `hidden` qui le dit — ici la page du
    // renvoi vient justement d'être ouverte deux lignes plus haut, ce résidu existe donc vraiment.
    const sorte = await page.evaluate(() => {
      const t = document.querySelector('#cc-ws-present-door .cc-ws-present-door-text');
      return (t && !t.hidden) ? 'PAGE' : 'AGRANDISSEMENT';
    });
    assert.equal(sorte, 'AGRANDISSEMENT',
      'et c\'est bien l\'agrandissement, JAMAIS la page du renvoi : l\'image ne doit pas capter le '
      + 'renvoi, c\'est l\'invariant que ce test protège depuis l\'origine');
    assert.deepEqual(erreurs, [], 'erreurs JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + ' — clics RÉELS : la puce ouvre la page, l\'image ouvre l\'agrandissement.');

    // ── 5 — HORS mode présentation : aucune puce ──
    await page.close();

    // ── 6 — EXPORT RÉELLEMENT CONSTRUIT ET OUVERT ──
    const { page: atelier } = await ouvrir(browser, PAGE);
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate((d) => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    await atelier.close();

    const { page: exp, erreurs: errExp } = await ouvrir(browser, 'file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await exp.waitForTimeout(350);
    const dansExport = await exp.evaluate(() => {
      const inner = document.getElementById('cc-ws-present-slide-inner');
      const chips = inner.querySelectorAll('.adoc-sc-card-cover-chips .adoc-sc-deepdive-chip');
      const img = inner.querySelector('img.adoc-sc-card-img');
      return { puces: chips.length, onclickImage: img ? (img.getAttribute('onclick') || '') : '' };
    });
    assert.equal(dansExport.puces, 1, 'la puce doit être rendue DANS le fichier exporté');
    assert.equal(dansExport.onclickImage, 'window.adocPresentOpenImageDoor(this)',
      'DANS L\'EXPORT aussi, la couverture porte l\'agrandissement — et jamais le renvoi : c\'est la '
      + 'puce qui y mène. Reçu : ' + JSON.stringify(dansExport.onclickImage));
    assert.ok(!/adocPresentOpenDeepDive/.test(dansExport.onclickImage),
      'le renvoi ne doit pas être capté par l\'image, dans l\'export non plus');
    await exp.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card-cover-chips .adoc-sc-deepdive-chip').click());
    await exp.waitForTimeout(450);
    const titreExport = await exp.evaluate(() => document.querySelector('.cc-ws-present-door-title')?.textContent);
    assert.equal(titreExport, 'La page de couverture', 'la puce ouvre la bonne page DANS l\'export');
    assert.deepEqual(errExp, [], 'aucune erreur JS dans l\'export : ' + errExp.join(' | '));
    console.log('PASS ' + (++n) + ' — export construit et ouvert : puce rendue, page ouverte, couverture agrandissable, 0 erreur.');

    // ── 7 — LA GARDE DE MODE PRÉSENTATION, éprouvée là où adocRenderCardHTML est accessible ──
    // Dans un fichier exporté, les fonctions de engineFnRefs sont des globales : on peut donc rendre la
    // MÊME carte avec le drapeau à false et vérifier que la puce disparaît. C'est la seule façon de
    // prouver la garde par exécution — adocRenderCardHTML n'est pas exposée sur window côté atelier.
    const garde = await exp.evaluate((d) => {
      /* eslint-disable no-undef */
      const avant = _adocRenderingForPresentDoor;
      _adocRenderingForPresentDoor = true;
      const enPresentation = adocRenderCardHTML(d.blocks[0], 0, 2);
      _adocRenderingForPresentDoor = false;
      const horsPresentation = adocRenderCardHTML(d.blocks[0], 0, 2);
      _adocRenderingForPresentDoor = avant;
      return {
        pucePresentation: /adoc-sc-card-cover-chips/.test(enPresentation),
        puceHors: /adoc-sc-card-cover-chips/.test(horsPresentation),
        imageHors: /adoc-sc-card-img/.test(horsPresentation),
      };
    }, DOC);
    assert.equal(garde.pucePresentation, true, 'préalable : la puce est bien rendue quand le mode présentation est actif');
    assert.equal(garde.puceHors, false,
      'AUCUNE puce hors mode présentation : dans l\'atelier ou un export classique, un renvoi de page ne mène nulle part');
    assert.equal(garde.imageHors, true, 'et la couverture elle-même reste rendue hors présentation — seule la puce disparaît');
    console.log('PASS ' + (++n) + ' — garde vérifiée par exécution : puce uniquement en mode présentation, couverture intacte.');
    await exp.close();

    console.log('\nTOUS LES TESTS LIEN DE COUVERTURE PASSENT (' + n + ')');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
