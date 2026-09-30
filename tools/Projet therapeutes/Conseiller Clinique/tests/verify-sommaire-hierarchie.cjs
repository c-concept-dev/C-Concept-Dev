// SOMMAIRE — HIÉRARCHIE DES APPROFONDISSEMENTS, DÉRIVÉE DU GRAPHE EXISTANT.
// doc.deepDives est un tableau PLAT : aucune relation page→page n'y figure. La structure est
// reconstruite en parcourant les renvois déjà présents (block.deepDiveLinks pour les racines,
// paragraphe.links pour les arêtes). Aucun champ de document, aucun changement de schéma.
//
// Le document forgé ici couvre les quatre cas qui comptent : une chaîne à trois niveaux, une page
// atteinte UNIQUEMENT depuis une autre page, une page atteignable par DEUX chemins, un CYCLE, et une
// page qu'aucun renvoi n'atteint.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const par = (t) => ({ text: t, links: [] });
const parLien = (t, cible) => ({ text: t, links: [{ text: t, targetId: cible }] });

// Graphe : diapositive → n1 et n5.  n1 → n2 → n3.  n2 → n4.  n3 → n1 (CYCLE).  n1 → n4 (2e chemin).
// n6 n'est atteinte par RIEN.
const DOC = {
  documentKind: 'presentation', title: 'Hiérarchie', citations: [],
  blocks: [{ id: 'c1', type: 'card', content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
    { id: 'p1', type: 'paragraph', content: { text: 'Vers la première page' }, citationIds: [], validation: {},
      deepDiveLinks: [{ text: 'première page', targetId: 'n1' }] },
    { id: 'p2', type: 'paragraph', content: { text: 'Vers la cinquième page' }, citationIds: [], validation: {},
      deepDiveLinks: [{ text: 'cinquième page', targetId: 'n5' }] }] } }],
  deepDives: [
    // Ordre de STOCKAGE volontairement différent de l'ordre d'exploration.
    { id: 'n4', title: 'Quatre', paragraphs: [par('Une page terminale.')] },
    { id: 'n1', title: 'Un', paragraphs: [parLien('vers deux', 'n2'), parLien('vers quatre', 'n4')] },
    { id: 'n6', title: 'Six (orpheline)', paragraphs: [par('Aucun renvoi ne mène ici.')] },
    { id: 'n2', title: 'Deux', paragraphs: [parLien('vers trois', 'n3'), parLien('vers quatre aussi', 'n4')] },
    { id: 'n5', title: 'Cinq', paragraphs: [par('Une seconde racine.')] },
    { id: 'n3', title: 'Trois', paragraphs: [parLien('retour vers un', 'n1')] },
  ],
};

async function sommaire(page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#cc-ws-present-toc .cc-ws-present-toc-dive'));
    return items.map((b) => ({
      id: b.getAttribute('data-dive'),
      niveau: Number(b.getAttribute('data-niveau')),
      ariaLevel: Number(b.getAttribute('aria-level')),
      titre: b.querySelector('.cc-ws-present-toc-title').textContent,
      retrait: Math.round(parseFloat(getComputedStyle(b).paddingLeft)),
    }));
  });
}

async function ouvrir(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(url);
  return { page, erreurs };
}

(async () => {
  const browser = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'toc-hierarchie-'));
  try {
    // ── 1 à 4 : EN DIRECT ──
    const { page, erreurs } = await ouvrir(browser, PAGE);
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      document.getElementById('cc-workspace')?.classList.add('open');
    });
    await page.evaluate((d) => window.adocPresentOpenWithDoc(d), DOC);
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await page.evaluate(() => window.adocPresentToggleToc());
    await page.waitForTimeout(250);
    const s = await sommaire(page);

    // 1 — l'ordre suit l'EXPLORATION, jamais le stockage
    assert.deepEqual(s.map((x) => x.id), ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'],
      "l'ordre doit suivre l'exploration (n1 → n2 → n3, puis n4, puis la 2e racine n5, puis l'orpheline n6), "
      + "jamais l'ordre de stockage qui était n4, n1, n6, n2, n5, n3");
    console.log('PASS 1/7 — ordre dérivé de l\'exploration, pas du stockage : ' + s.map((x) => x.id).join(' → '));

    // 2 — les profondeurs
    assert.deepEqual(s.map((x) => x.niveau), [0, 1, 2, 2, 0, 0],
      'profondeurs attendues : n1=0, n2=1, n3=2, n4=2 (rencontrée sous n2), n5=0 (racine), n6=0 (orpheline)');
    assert.deepEqual(s.map((x) => x.ariaLevel), [1, 2, 3, 3, 1, 1],
      'aria-level doit valoir la profondeur + 1 — l\'indentation seule est invisible sans affichage');
    console.log('PASS 2/7 — profondeurs et aria-level cohérents : ' + s.map((x) => x.id + '=' + x.niveau).join(' '));

    // 3 — le retrait visuel suit réellement la profondeur
    const retraits = s.map((x) => x.retrait);
    // Un pas d'au moins 10 px par niveau : mesuré, un pas de 4 px (première version, qui écrivait
    // 14 px là où la base valait déjà 10) ne se lisait pas à l'oeil. Le test le refuse désormais.
    assert.ok(retraits[1] - retraits[0] >= 10 && retraits[2] - retraits[1] >= 10,
      'le retrait doit croître d\'au moins 10 px par niveau pour être lisible, mesuré : ' + retraits.join(', ') + ' px');
    assert.equal(retraits[4], retraits[0], 'une seconde racine revient au retrait de niveau 0');
    console.log('PASS 3/7 — retrait mesuré croissant : ' + retraits.join(' / ') + ' px.');

    // 4 — cas limites : une seule occurrence par page, cycle non bouclé, orpheline conservée
    assert.equal(s.length, DOC.deepDives.length,
      'chaque page apparaît EXACTEMENT une fois : ' + s.length + ' entrées pour ' + DOC.deepDives.length + ' pages');
    assert.equal(s.filter((x) => x.id === 'n4').length, 1,
      'n4 est atteinte par DEUX chemins (n1 et n2) et ne doit apparaître qu\'une fois');
    assert.ok(s.some((x) => x.id === 'n6' && x.niveau === 0),
      'la page orpheline n\'est JAMAIS escamotée : listée à plat, elle reste ouvrable depuis le sommaire');
    assert.ok(s.some((x) => x.id === 'n3' && x.niveau === 2),
      'le cycle n3 → n1 ne doit ni boucler ni réinsérer n1');
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS 4/7 — une occurrence par page, cycle coupé, orpheline conservée, chemin multiple non dupliqué.');

    // 5 — le clic depuis le sommaire ouvre toujours la bonne page, indentation ou non
    await page.evaluate(() => document.querySelector('#cc-ws-present-toc .cc-ws-present-toc-dive[data-dive="n3"]').click());
    await page.waitForTimeout(450);
    const titre = await page.evaluate(() => document.querySelector('.cc-ws-present-door-title')?.textContent);
    assert.equal(titre, 'Trois', 'une entrée indentée doit rester cliquable et ouvrir sa page');
    console.log('PASS 5/7 — une entrée de niveau 2 reste cliquable et ouvre la bonne page.');
    await page.close();

    // ── 6 et 7 : DANS UN EXPORT RÉELLEMENT CONSTRUIT ET OUVERT ──
    const { page: atelier } = await ouvrir(browser, PAGE);
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate((d) => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    await atelier.close();
    assert.ok(/function\s+adocPresentTocDeepDiveOrdre\s*\(/.test(html),
      'adocPresentTocDeepDiveOrdre doit être dans engineFnRefs — le sommaire de l\'export l\'appelle');
    console.log('PASS 6/7 — export construit (' + (html.length / 1024).toFixed(0) + ' Ko), la fonction y est.');

    const { page: exp, erreurs: errExp } = await ouvrir(browser, 'file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await exp.evaluate(() => window.adocPresentToggleToc());
    await exp.waitForTimeout(250);
    const se = await sommaire(exp);
    assert.deepEqual(se.map((x) => x.id), s.map((x) => x.id), 'l\'export doit produire le MÊME ordre qu\'en direct');
    assert.deepEqual(se.map((x) => x.niveau), s.map((x) => x.niveau), 'et les MÊMES profondeurs');
    assert.ok(se[1].retrait > se[0].retrait, 'le retrait doit s\'appliquer dans l\'export aussi (CSS embarquée)');
    assert.deepEqual(errExp, [], 'aucune erreur JS dans l\'export : ' + errExp.join(' | '));
    console.log('PASS 7/7 — DANS l\'export : même ordre, mêmes profondeurs, retrait appliqué, 0 erreur.');
    await exp.close();

    console.log('\nTOUS LES TESTS HIÉRARCHIE DU SOMMAIRE PASSENT (7/7)');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
