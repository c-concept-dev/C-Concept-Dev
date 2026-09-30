// RÉVÉLATION PROGRESSIVE DANS UNE PAGE D'APPROFONDISSEMENT — le seuil et la hauteur sont portés ici
// comme ASSERTIONS, pas comme commentaires : ce sont les deux chiffres qui justifient le mécanisme.
//
// Seuil : mesuré, la colonne de la porte ne déborde qu'à partir de 9 paragraphes (1280×800 : 676 px
// visibles pour 718 px de contenu à k=9, contre 652/652 à k=8). En dessous, révéler n'ajouterait
// qu'un clic. ADOC_DOOR_REVEAL_SEUIL vaut donc 9, et ce test échouerait si on le déplaçait.
//
// Hauteur : le masquage emploie display:none et JAMAIS visibility/opacity. Mesuré sur 14 paragraphes,
// visibility:hidden laisse le contenu à 1047 px — aucune place libérée, la colonne défile toujours
// autant. Le test 3 assure que la hauteur du contenu s'effondre réellement quand tout est masqué.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');

function doc(k, avecImage) {
  return {
    documentKind: 'presentation', title: 'Révélation', citations: [],
    blocks: [{ id: 'c1', type: 'card', content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
      { id: 'p1', type: 'paragraph', content: { text: 'Un texte.' }, citationIds: [], validation: {},
        deepDiveLinks: [{ text: 'Un texte', targetId: 'n1' }] },
      // Deux blocs : la diapositive a ainsi son PROPRE montage progressif (revealIndex non nul),
      // ce qui permet de vérifier que la révélation de page ne le touche jamais.
      { id: 'p2', type: 'paragraph', content: { text: 'Un second bloc.' }, citationIds: [], validation: {} }] } }],
    deepDives: [{ id: 'n1', title: 'Page mesurée',
      imageQuery: avecImage ? 'therapist office chairs' : '', imageAlt: avecImage ? 'Un cabinet' : '',
      paragraphs: Array.from({ length: k }, (_, i) => 'Paragraphe ' + (i + 1)
        + " d'une page assez fournie pour occuper plusieurs lignes une fois mise en page dans la "
        + 'colonne de la porte, et éprouver ainsi le plafond de hauteur.') }],
  };
}

async function ouvrir(browser, k, avecImage) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('assistdoc-screen')?.classList.add('active');
    // #cc-workspace sans .open est display:none : la porte mesurerait 0×0 et tous les chiffres
    // seraient faux sans rien signaler.
    document.getElementById('cc-workspace')?.classList.add('open');
  });
  await page.evaluate((d) => window.adocPresentOpenWithDoc(d), doc(k, avecImage));
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    window.adocPresentOpenDeepDive('n1');
    // 400 ms : la transition de la porte. Plus tôt, on relève un état intermédiaire.
    await new Promise((x) => setTimeout(x, 400));
  });
  return { page, erreurs };
}

const etat = (page) => page.evaluate(() => {
  const z = document.querySelector('.cc-ws-present-door-text');
  const s = window._adocPresentState;
  const unites = Array.from(z.querySelectorAll(':scope > p, :scope > ul.cc-ws-present-door-list'));
  return {
    curseur: s.doorRevealIndex, total: s.doorRevealTotal, revealDiapo: s.revealIndex,
    unites: unites.length, masquees: unites.filter((e) => e.classList.contains('adoc-door-cache')).length,
    visibles: unites.filter((e) => e.offsetParent !== null).length,
    visible: z.clientHeight, contenu: z.scrollHeight,
  };
});

(async () => {
  const browser = await chromium.launch();
  let n = 0;
  try {
    // ── 1 — SOUS le seuil : rien n'est masqué, aucun curseur, et les flèches restent sans effet ──
    {
      const { page, erreurs } = await ouvrir(browser, 8, false);
      const av = await etat(page);
      assert.equal(av.curseur, null, '8 paragraphes (sous le seuil de 9) : aucun curseur de révélation');
      assert.equal(av.masquees, 0, 'sous le seuil, aucune unité ne doit être masquée');
      assert.ok(av.contenu <= av.visible + 1, 'sous le seuil la colonne ne défile pas : contenu ' + av.contenu + ' px pour ' + av.visible + ' px visibles');
      await page.keyboard.press('ArrowRight');
      const ap = await etat(page);
      assert.deepEqual([ap.curseur, ap.masquees], [null, 0], 'sous le seuil, ArrowRight est un no-op');
      assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + JSON.stringify(erreurs));
      console.log('PASS ' + (++n) + '/7 — 8 paragraphes : mécanisme inactif, flèches sans effet, aucun défilement.');
      await page.close();
    }

    // ── 2 — AU seuil : masquage actif, une seule unité visible, et la colonne ne défile plus ──
    {
      const { page, erreurs } = await ouvrir(browser, 9, false);
      const e = await etat(page);
      assert.equal(e.curseur, 0, '9 paragraphes : le curseur démarre à 0');
      assert.equal(e.unites, 9, 'les 9 paragraphes donnent 9 unités révélables');
      assert.equal(e.masquees, 8, 'seule la première unité est révélée, les 8 autres sont masquées');
      assert.equal(e.visibles, 1, 'une seule unité réellement visible (display:none, pas visibility)');
      assert.ok(e.contenu <= e.visible + 1,
        'le masquage LIBÈRE la place : la colonne ne défile plus (contenu ' + e.contenu + ' px, visible ' + e.visible + ' px)');
      assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + JSON.stringify(erreurs));
      console.log('PASS ' + (++n) + '/7 — 9 paragraphes (le seuil) : 1 visible sur 9, colonne sans défilement.');
      await page.close();
    }

    // ── 3 — LA MESURE DE HAUTEUR : display:none effondre réellement le contenu ──
    {
      const { page } = await ouvrir(browser, 14, false);
      const masque = await etat(page);
      const tout = await page.evaluate(() => {
        const z = document.querySelector('.cc-ws-present-door-text');
        z.querySelectorAll('.adoc-door-cache').forEach((e) => e.classList.remove('adoc-door-cache'));
        return { contenu: z.scrollHeight, visible: z.clientHeight };
      });
      assert.ok(tout.contenu > masque.contenu * 3,
        'une page de 14 paragraphes entièrement révélée doit être BEAUCOUP plus haute que réduite à sa première unité — '
        + 'mesuré : ' + tout.contenu + ' px contre ' + masque.contenu + ' px. Si ces deux chiffres étaient proches, '
        + 'le masquage ne libérerait pas la place (c\'est précisément ce que fait visibility:hidden).');
      assert.ok(tout.contenu > tout.visible + 1, 'tout révélé, cette page DOIT déborder — sinon le mécanisme ne sert à rien ici');
      console.log('PASS ' + (++n) + '/7 — hauteur : ' + masque.contenu + ' px masqué contre ' + tout.contenu + ' px révélé (facteur '
        + (tout.contenu / masque.contenu).toFixed(1) + '), débordement réel confirmé.');
      await page.close();
    }

    // ── 4 — Les flèches avancent et reculent la révélation ──
    {
      const { page, erreurs } = await ouvrir(browser, 12, false);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      const ap = await etat(page);
      assert.equal(ap.curseur, 2, 'deux ArrowRight avancent le curseur de 0 à 2');
      assert.equal(ap.visibles, 3, 'trois unités visibles après deux révélations');
      await page.keyboard.press('ArrowLeft');
      const re = await etat(page);
      assert.equal(re.curseur, 1, 'ArrowLeft recule le curseur');
      assert.equal(re.visibles, 2, 'une unité est de nouveau masquée');
      assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + JSON.stringify(erreurs));
      console.log('PASS ' + (++n) + '/7 — ArrowRight/ArrowLeft avancent et reculent la révélation dans la porte.');
      await page.close();
    }

    // ── 5 — Bornes : au bout, ArrowRight ne déborde pas ; au début, ArrowLeft non plus ──
    {
      const { page } = await ouvrir(browser, 9, false);
      for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
      const fin = await etat(page);
      assert.equal(fin.curseur, 8, 'le curseur s\'arrête à la dernière unité (8 pour 9 unités), jamais au-delà');
      assert.equal(fin.masquees, 0, 'tout est révélé au bout');
      for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
      const debut = await etat(page);
      assert.equal(debut.curseur, 0, 'le curseur s\'arrête à 0, jamais négatif');
      assert.equal(debut.visibles, 1, 'la première unité reste toujours visible');
      console.log('PASS ' + (++n) + '/7 — bornes tenues aux deux extrémités, la première unité ne se masque jamais.');
      await page.close();
    }

    // ── 6 — Le curseur de DIAPOSITIVE n'est JAMAIS touché par la révélation de page ──
    {
      const { page } = await ouvrir(browser, 12, false);
      const avant = await etat(page);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      const apres = await etat(page);
      assert.equal(apres.revealDiapo, avant.revealDiapo,
        'revealIndex (montage de la diapositive sous la porte) doit rester INCHANGÉ : les deux curseurs sont distincts');
      assert.notEqual(apres.curseur, avant.curseur, 'préalable : la révélation de page a bien avancé, sinon le test ne prouve rien');
      console.log('PASS ' + (++n) + '/7 — curseurs distincts : revealIndex de la diapositive intact (' + apres.revealDiapo + ') pendant la révélation de page.');
      await page.close();
    }

    // ── 7 — SURVIE à la réécriture asynchrone du contenu par la résolution d'image ──
    {
      const { page, erreurs } = await ouvrir(browser, 9, true);
      // La résolution échoue ici (réseau coupé) et retombe sur un SVG de repli : le .then() s'exécute
      // donc bel et bien et REMPLACE innerHTML. C'est exactement le cas qui effaçait le masquage.
      await page.waitForTimeout(1200);
      const e = await etat(page);
      assert.equal(e.masquees, 8, 'après la réécriture par la résolution d\'image, le masquage doit être RÉAPPLIQUÉ');
      assert.equal(e.curseur, 0, 'le curseur survit à la réécriture');
      assert.ok(e.contenu <= e.visible + 1, 'la colonne ne défile toujours pas après la réécriture');
      assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + JSON.stringify(erreurs));
      console.log('PASS ' + (++n) + '/7 — le masquage survit à la réécriture asynchrone de la résolution d\'image.');
      await page.close();
    }

    console.log('\nTOUS LES TESTS RÉVÉLATION DANS LA PORTE PASSENT (' + n + '/7)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
