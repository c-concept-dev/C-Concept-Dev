// REPÈRE DE DÉFILEMENT D'UNE DIAPOSITIVE — indicateur PASSIF signalant qu'il reste du contenu sous la
// ligne de flottaison. La carte défile déjà (overflow:auto) : rien n'était perdu, mais rien ne le
// disait.
//
// PÉRIMÈTRE MESURÉ qui justifie ce chantier (banc séparé, document comparable de 132 diapositives passé
// par le pipeline réel) : 12 diapositives débordent, TOUTES des questionnaires, et tout questionnaire
// déborde quelle que soit sa taille — ×1,1 à 3 questions, ×1,7 à 5 (le minimum que le prompt impose),
// ×4,6 à 15. Identique à 1920×1080 et 3840×2160, la boîte de diapositive étant une référence fixe de
// 1422×800 mise à l'échelle : le débordement ne dépend pas de la résolution.
//
// Le contenu de ce test emploie des paragraphes denses plutôt qu'un questionnaire : le mécanisme ne
// regarde que la géométrie (scrollHeight vs clientHeight), il est indifférent au type de bloc, et un
// paragraphe ne couple pas le test à la forme d'un questionnaire.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const PHRASE = "Cette formulation occupe plusieurs lignes une fois mise en page dans la diapositive, de "
  + "façon à reproduire la densité réelle d'un contenu clinique rédigé et non un texte de remplissage.";

const par = (i) => ({ id: 'p' + i, type: 'paragraph', content: { text: PHRASE }, citationIds: [], validation: {} });
const DOC = {
  documentKind: 'presentation', title: 'Repère', citations: [],
  blocks: [
    // Diapositive DENSE : 30 paragraphes. Mesuré : 14 paragraphes de cette longueur TIENNENT encore
    // dans la boîte de 800 px (798/798) — cohérent avec le périmètre relevé, où aucune diapositive de
    // prose ne débordait et où seuls les questionnaires le faisaient. Il faut donc une densité
    // franchement supérieure pour éprouver le mécanisme sur de la prose.
    { id: 'slide-01', type: 'card', content: { title: 'Dense', imageRef: null, imageAlt: null,
      blocks: Array.from({ length: 30 }, (_, i) => par(i + 1)) } },
    // Diapositive COURTE : le repère ne doit jamais apparaître.
    { id: 'slide-02', type: 'card', content: { title: 'Courte', imageRef: null, imageAlt: null,
      blocks: [par(90), par(91)] } },
  ],
  deepDives: [],
};

async function ouvrir(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(url);
  return { page, erreurs };
}

const lire = (page) => page.evaluate(() => {
  const inner = document.getElementById('cc-ws-present-slide-inner');
  const carte = inner.querySelector('.adoc-sc-card');
  const st = getComputedStyle(inner, '::after');
  return {
    repere: inner.classList.contains('cc-ws-present-suite'),
    affichage: st.display,
    clics: st.pointerEvents,
    contenu: carte.scrollHeight, fenetre: carte.clientHeight, position: Math.round(carte.scrollTop),
  };
});

(async () => {
  const browser = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'repere-defilement-'));
  let n = 0;
  try {
    const { page, erreurs } = await ouvrir(browser, PAGE);
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      // #cc-workspace sans .open est display:none : la carte mesurerait 0×0 et tous les chiffres
      // seraient faux sans rien signaler.
      document.getElementById('cc-workspace')?.classList.add('open');
    });
    await page.evaluate((d) => window.adocPresentOpenWithDoc(d), DOC);
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await page.waitForTimeout(400);

    // ── 1 — le repère apparaît sur une diapositive qui déborde réellement ──
    const dense = await lire(page);
    assert.ok(dense.contenu > dense.fenetre + 2,
      'préalable : cette diapositive DOIT déborder, sinon le test ne prouve rien (' + dense.contenu + '/' + dense.fenetre + ' px)');
    assert.equal(dense.repere, true, 'le repère doit être posé sur une diapositive en débordement');
    assert.equal(dense.affichage, 'flex', 'et réellement affiché (::after en display:flex)');
    console.log('PASS ' + (++n) + '/7 — repère présent sur une diapositive dense (' + dense.contenu + '/' + dense.fenetre + ' px).');

    // ── 2 — il ne bloque NI la molette NI le clic ──
    assert.equal(dense.clics, 'none',
      'pointer-events:none est indispensable : sans lui le dégradé intercepterait la molette et le clic '
      + 'dans la bande basse, et le repère empêcherait de faire ce qu\'il invite à faire');
    console.log('PASS ' + (++n) + '/7 — pointer-events:none : le repère n\'intercepte ni molette ni clic.');

    // ── 3 — il DISPARAÎT au bas, et REVIENT si on remonte ──
    await page.evaluate(() => {
      const c = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
      c.scrollTop = c.scrollHeight; // tout en bas
    });
    await page.waitForTimeout(120);
    const enBas = await lire(page);
    assert.equal(enBas.repere, false, 'au bas de la diapositive, le repère doit disparaître — il n\'y a plus rien à annoncer');
    await page.evaluate(() => { document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card').scrollTop = 0; });
    await page.waitForTimeout(120);
    const remonte = await lire(page);
    assert.equal(remonte.repere, true, 'et réapparaître si on remonte');
    console.log('PASS ' + (++n) + '/7 — disparaît au bas (scrollTop ' + enBas.position + '), réapparaît en remontant.');

    // ── 4 — AUCUN repère sur une diapositive qui tient ──
    await page.evaluate(() => window.adocPresentGoTo(1));
    await page.waitForTimeout(400);
    const courte = await lire(page);
    assert.ok(courte.contenu <= courte.fenetre + 2,
      'préalable : cette diapositive doit tenir (' + courte.contenu + '/' + courte.fenetre + ' px)');
    assert.equal(courte.repere, false, 'aucun repère sur une diapositive qui tient — jamais un signal qui ne veut rien dire');
    assert.equal(courte.affichage, 'none', 'et le ::after reste masqué');
    console.log('PASS ' + (++n) + '/7 — aucun repère sur une diapositive courte (' + courte.contenu + '/' + courte.fenetre + ' px).');

    // ── 5 — le repère est réévalué au CHANGEMENT de diapositive, dans les deux sens ──
    await page.evaluate(() => window.adocPresentGoTo(0));
    await page.waitForTimeout(400);
    assert.equal((await lire(page)).repere, true, 'revenir sur la diapositive dense doit reposer le repère');
    await page.evaluate(() => window.adocPresentGoTo(1));
    await page.waitForTimeout(400);
    assert.equal((await lire(page)).repere, false, 'et repartir sur la courte doit le retirer');
    console.log('PASS ' + (++n) + '/7 — réévalué à chaque changement de diapositive, dans les deux sens.');

    // ── 6 — LA HAUTEUR NE BOUGE PAS PENDANT LE MONTAGE PROGRESSIF ──
    // C'est ce qui justifie UN SEUL contrôle au montage plutôt qu'une réinstallation après chaque
    // révélation. Si cette assertion tombait un jour, il faudrait réévaluer le repère à chaque étape.
    await page.evaluate(() => window.adocPresentGoTo(0));
    await page.waitForTimeout(400);
    const stabilite = await page.evaluate(async () => {
      const c = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
      const avant = c.scrollHeight;
      document.querySelectorAll('#cc-ws-present-slide-inner .adoc-sc-card > .adoc-sc-block')
        .forEach((el) => el.classList.add('adoc-sc-reveal-shown'));
      await new Promise((x) => setTimeout(x, 80));
      return { avant: avant, apres: c.scrollHeight };
    });
    assert.equal(stabilite.apres, stabilite.avant,
      'la hauteur d\'une diapositive ne doit PAS changer pendant son montage progressif (opacity + '
      + 'visibility conservent la place) : ' + stabilite.avant + ' → ' + stabilite.apres
      + '. Si elle changeait, un seul contrôle au montage ne suffirait plus.');
    console.log('PASS ' + (++n) + '/7 — hauteur stable pendant le montage progressif (' + stabilite.avant + ' px inchangée).');
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    await page.close();

    // ── 7 — DANS UN EXPORT RÉELLEMENT CONSTRUIT ET OUVERT ──
    const { page: atelier } = await ouvrir(browser, PAGE);
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate((d) => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    await atelier.close();
    // Contrôle structurel, complément et non preuve : la constante de portée de module doit avoir été
    // émise par dataText, sinon l'export lèverait « ADOC_PRESENT_REPERE_MARGE is not defined ».
    assert.ok(/var ADOC_PRESENT_REPERE_MARGE = \d+;/.test(html), 'ADOC_PRESENT_REPERE_MARGE doit être émise par dataText');

    const { page: exp, erreurs: errExp } = await ouvrir(browser, 'file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await exp.waitForTimeout(400);
    const expDense = await lire(exp);
    assert.equal(expDense.repere, true, 'le repère doit fonctionner DANS le fichier exporté');
    assert.equal(expDense.clics, 'none', 'et y garder pointer-events:none');
    await exp.evaluate(() => {
      const c = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
      c.scrollTop = c.scrollHeight;
    });
    await exp.waitForTimeout(140);
    assert.equal((await lire(exp)).repere, false, 'et disparaître au bas DANS l\'export — donc l\'écouteur scroll y est bien posé');
    assert.deepEqual(errExp, [], 'aucune erreur JS dans l\'export : ' + errExp.join(' | '));
    console.log('PASS ' + (++n) + '/7 — export construit et ouvert : repère posé, écouteur scroll actif, 0 erreur.');
    await exp.close();

    console.log('\nTOUS LES TESTS REPÈRE DE DÉFILEMENT PASSENT (' + n + '/7)');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
