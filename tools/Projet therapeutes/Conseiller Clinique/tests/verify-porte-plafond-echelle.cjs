// La colonne de texte de la porte ne doit JAMAIS sortir de l'écran.
//
// Régression introduite par la mise à l'échelle de la présentation : `max-height` est résolue en
// pixels CSS AVANT le transform, qui multiplie ensuite la hauteur rendue. Avec
// transform-origin:center, la colonne débordait des DEUX côtés — et en 4K le défilement interne
// disparaissait aussi, rendant le début et la fin d'une page inatteignables.
//
// Mesuré sur une page de 14 paragraphes, avant correctif :
//   1920×1080 : la colonne s'étendait de −47 à 1127 sur un écran de 1080
//   3840×2160 : de −792 à 2952 sur un écran de 2160, SANS barre de défilement
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-porte-plafond-echelle.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'v', previousVersionId: null, requestId: 'r',
  sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z', language: 'fr', status: 'draft',
  title: 'Porte', purpose: 'p', audience: 'clinicien', documentKind: 'presentation',
  renderManifestId: 'manifest-default-001', derivedFrom: null, citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{ id: 'c1', type: 'card', citationIds: [], validation: {},
    content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
      { id: 'p1', type: 'paragraph', content: { text: 'Un texte.' }, citationIds: [], validation: {},
        deepDiveLinks: [{ text: 'Un texte', targetId: 'n1' }] }] } }],
  // 14 paragraphes : la page la plus longue qu'un modèle produise en pratique, et celle sur
  // laquelle la régression a été mesurée.
  deepDives: [{ id: 'n1', title: 'Une page d\'approfondissement volontairement longue',
    paragraphs: Array.from({ length: 14 }, (_, i) => 'Paragraphe ' + (i + 1)
      + ' d\'une page assez fournie pour occuper plusieurs lignes une fois mise en page dans la '
      + 'colonne de la porte, et éprouver ainsi le plafond de hauteur.') }],
};
const TAILLES = [{ w: 1280, h: 800 }, { w: 1920, h: 1080 }, { w: 3840, h: 2160 }];

async function mesurer(browser, t, cssAnnulation) {
  const page = await browser.newPage({ viewport: { width: t.w, height: t.h } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
  await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('assistdoc-screen')?.classList.add('active');
    document.getElementById('cc-workspace')?.classList.add('open');
  });
  await page.evaluate(d => window.adocPresentOpenWithDoc(d), DOC);
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
  if (cssAnnulation) await page.addStyleTag({ content: cssAnnulation });
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => {
    window.adocPresentOpenDeepDive('n1');
    // 320 ms : la transition de la porte, comme pour une diapositive. Plus tôt, on relève un état
    // intermédiaire et les chiffres sont faux sans rien signaler.
    await new Promise(x => setTimeout(x, 400));
    const txt = document.querySelector('.cc-ws-present-door-text');
    // RÉVÉLATION PROGRESSIVE (lot « site de poche ») : une page de 14 paragraphes n'affiche plus que
    // sa première unité à l'ouverture, puisqu'elle dépasse le seuil de 9. Ce test porte sur le
    // PLAFOND DE HAUTEUR, dont le rôle est justement de borner la colonne une fois TOUT révélé —
    // c'est le pire cas, et c'est celui qu'il faut mesurer. On révèle donc avant de mesurer, plutôt
    // que de relever un état partiel : l'assertion « une page de 14 paragraphes DOIT défiler » garde
    // exactement son sens, et le test devient plus strict puisqu'il ne dépend plus de l'état
    // d'affichage par défaut.
    txt.querySelectorAll('.adoc-door-cache').forEach(function (e) { e.classList.remove('adoc-door-cache'); });
    const b = txt.getBoundingClientRect();
    const m = getComputedStyle(txt).transform;
    return { haut: Math.round(b.top), bas: Math.round(b.bottom),
      hauteur: Math.round(b.height), largeur: Math.round(b.width),
      ecran: window.innerHeight, largeurEcran: window.innerWidth,
      defile: txt.scrollHeight > txt.clientHeight,
      echelle: m === 'none' ? 1 : parseFloat(m.match(/matrix\(([^,]+)/)[1]) };
  });
  await page.close();
  return { r, erreurs };
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    // ── 1. AUCUN DÉPASSEMENT, AUX TROIS RÉSOLUTIONS ─────────────────────────────────────────
    const apres = [];
    for (const t of TAILLES) {
      const { r, erreurs } = await mesurer(browser, t, null);
      apres.push({ t, r });
      assert.ok(r.haut >= 0, t.w + '×' + t.h + ' : le haut de la colonne sort de l\'écran (' + r.haut + ')');
      assert.ok(r.bas <= r.ecran, t.w + '×' + t.h + ' : le bas sort de l\'écran (' + r.bas + ' > ' + r.ecran + ')');
      assert.ok(r.largeur <= r.largeurEcran, t.w + '×' + t.h + ' : la colonne est plus large que l\'écran');
      assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    }
    console.log('PASS 1/3  aucun dépassement : '
      + apres.map(x => x.t.w + '×' + x.t.h + ' → ' + x.r.haut + '–' + x.r.bas + '/' + x.r.ecran).join(' · '));

    // ── 2. LE DÉFILEMENT INTERNE SURVIT — c'est lui qui rend la page atteignable ─────────────
    // En 4K, avant correctif, scrollHeight valait clientHeight : plus de barre, et le début comme
    // la fin de la page étaient perdus. Ce n'était pas un détail d'affichage.
    apres.forEach(({ t, r }) => {
      assert.equal(r.defile, true, t.w + '×' + t.h + ' : une page de 14 paragraphes DOIT défiler');
    });
    console.log('PASS 2/3  défilement interne présent aux trois résolutions (échelles '
      + apres.map(x => x.r.echelle.toFixed(2)).join(', ') + ').');

    // ── 3. CONTRE-PREUVE — l'ancien plafond fait revenir le dépassement ──────────────────────
    // Sans elle, ce test passerait tout aussi bien si la page forgée était simplement trop courte
    // pour déborder : il ne prouverait rien.
    const ancien = '.cc-ws-present-door-text{max-height:calc(100% - 60px) !important}';
    const avant = [];
    for (const t of TAILLES) { const { r } = await mesurer(browser, t, ancien); avant.push({ t, r }); }
    const debordaient = avant.filter(x => x.r.haut < 0 || x.r.bas > x.r.ecran);
    assert.ok(debordaient.length >= 2,
      'l\'ancien plafond doit faire déborder au moins deux résolutions : '
      + JSON.stringify(avant.map(x => x.t.w + '→' + x.r.haut + '..' + x.r.bas)));
    const sansDefilement = avant.filter(x => !x.r.defile);
    assert.ok(sansDefilement.length >= 1,
      'l\'ancien plafond doit aussi faire perdre le défilement sur au moins une résolution');
    console.log('PASS 3/3  contre-preuve : ancien plafond → ' + debordaient.length + '/3 débordent, '
      + sansDefilement.length + '/3 perdent leur défilement ('
      + avant.map(x => x.t.w + ' : ' + x.r.haut + '–' + x.r.bas).join(' · ') + ').');

    console.log('\nTOUT PASSE — 3/3, aucun appel réseau.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
