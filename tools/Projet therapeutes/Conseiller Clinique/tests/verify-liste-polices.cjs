// LISTE FERMÉE DE POLICES — zéro saisie, donc zéro faute de frappe possible.
//
// Safari n'expose pas window.queryLocalFonts() (choix d'Apple contre le pistage, jamais contournable
// depuis la page) : aucune énumération n'est possible en JavaScript. La liste des polices réellement
// installées est relevée HORS navigateur par tests/LISTER-POLICES.sh et figée dans
// ADOC_MAC_FONT_FAMILIES.
//
// Ce test pilote le VRAI panneau d'édition — document ouvert, bloc cliqué, <select> réellement rendu.
// Aucune logique n'est réimplémentée ici : un test qui reconstruirait les options passerait même si la
// production était cassée, exactement le piège qui avait laissé passer la perte de imageQuery.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const para = (id, text) => ({ id, type: 'paragraph', content: { text }, citationIds: [], validation: {} });
function ficheDoc(blocks) {
  return {
    schemaVersion: 1, documentId: 'doc-pol-001', versionId: 'doc-pol-001-v1', previousVersionId: null,
    requestId: 'request-pol-001', sourceSnapshotId: 'snapshot-pol-001',
    createdAt: '2026-09-30T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test polices', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}

async function ouvrirPanneau(page, doc, blocId) {
  const cle = 'adocArt_polices';
  await page.evaluate(({ cle, doc }) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[cle] = { name: 'Test polices', _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: doc };
  }, { cle, doc });
  const ok = await page.evaluate((k) => window.adocOpenWorkspace(k), cle);
  assert.equal(ok, true, 'adocOpenWorkspace doit réussir');
  await page.waitForTimeout(150);
  await page.locator('#' + blocId).click();
  await page.waitForTimeout(200);
  // Le contrôle de police vit dans <details class="cc-editor-text-format">, replié par défaut : on
  // l'ouvre par un clic sur son résumé, comme le ferait l'utilisatrice — un élément dans un details
  // fermé n'est pas interactif, et le forcer par script contournerait le geste réel.
  const resume = page.locator('details.cc-editor-text-format > summary');
  if (await resume.count()) {
    const ouvert = await page.evaluate(() => document.querySelector('details.cc-editor-text-format').open);
    if (!ouvert) { await resume.first().click(); await page.waitForTimeout(150); }
  }
  return cle;
}

const lireSelect = (page) => page.evaluate(() => {
  const s = document.querySelector('select[data-editor-style="fontFamily"]');
  if (!s) return null;
  return {
    valeur: s.value,
    options: Array.from(s.options).map((o) => ({ v: o.value, desactivee: o.disabled, groupe: o.parentElement.label || null })),
    groupes: Array.from(s.querySelectorAll('optgroup')).map((g) => g.label),
    champLibre: !!document.querySelector('input[data-editor-style="fontFamily"]'),
    datalist: !!document.querySelector('#cc-editor-fonts'),
  };
});

(async () => {
  const browser = await chromium.launch();
  let n = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function');

    // ── 1 — le contrôle RÉELLEMENT rendu est une liste fermée ──
    await ouvrirPanneau(page, ficheDoc([para('blk-a', 'Un paragraphe.'), para('blk-b', 'Un autre.')]), 'blk-a');
    const s1 = await lireSelect(page);
    assert.ok(s1, 'un <select data-editor-style="fontFamily"> doit être rendu dans le panneau réel');
    assert.equal(s1.champLibre, false,
      'plus aucun <input> pour la police : un champ texte laisse taper n\'importe quoi, et une police '
      + 'inexistante est ignorée en silence par le navigateur');
    assert.equal(s1.datalist, false, 'la datalist de suggestions a disparu avec le champ libre');
    console.log('PASS ' + (++n) + '/5 — le panneau réel rend un <select>, sans champ libre ni datalist.');

    // ── 2 — les polices du Mac priment, et la liste est saine ──
    const mac = s1.options.filter((o) => o.groupe === 'Polices de cet ordinateur').map((o) => o.v);
    assert.ok(mac.length > 100, 'la liste des polices de cet ordinateur doit être substantielle, reçu ' + mac.length);
    assert.equal(s1.groupes[0], 'Polices de cet ordinateur',
      'elles passent en PREMIER : ce sont les seules qui s\'afficheront vraiment chez l\'utilisatrice');
    assert.equal(mac.filter((f) => f.trim().startsWith('.')).length, 0,
      'aucune famille interne de macOS (préfixe point) ne doit être proposée');
    assert.equal(mac.filter((f) => /\p{Cf}/u.test(f)).length, 0,
      'aucun caractère de format Unicode invisible : macOS en glisse dans certains noms internes, ce qui '
      + 'déplace le point initial et en laisse passer un si le filtre ne les retire pas');
    assert.equal(mac.length - new Set(mac).size, 0, 'aucun doublon');
    assert.equal(s1.options[0].v, '', 'la première option reste « Police de la charte », soit aucun réglage');
    console.log('PASS ' + (++n) + '/5 — ' + mac.length + ' polices de cet ordinateur, en tête, sans famille interne ni doublon.');

    // ── 3 — AUCUNE valeur hors liste n'est atteignable ──
    const horsListe = await page.evaluate(() => {
      const s = document.querySelector('select[data-editor-style="fontFamily"]');
      s.value = 'Police Inventée Qui N Existe Pas';
      const apres = s.value;
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return { apres, options: s.options.length };
    });
    assert.equal(horsListe.apres, '',
      'une valeur hors liste ne peut PAS être imposée au select : c\'est toute la garantie de la liste '
      + 'fermée, reçu ' + JSON.stringify(horsListe.apres));
    await page.waitForTimeout(120);
    const apresEvenement = await page.evaluate(() => {
      const d = window._adocArtifacts['adocArt_polices']._adocStructuredDoc;
      const b = d.blocks.find((x) => x.id === 'blk-a');
      return (b.style || {}).fontFamily == null ? null : b.style.fontFamily;
    });
    assert.equal(apresEvenement, null,
      'et le document ne retient RIEN d\'une valeur hors liste, même après un événement change forcé');
    console.log('PASS ' + (++n) + '/5 — valeur hors liste refusée par le select ET absente du document.');

    // ── 4 — un choix RÉEL de la liste atteint bien le document ──
    const choisie = mac[0];
    await page.selectOption('select[data-editor-style="fontFamily"]', choisie);
    await page.waitForTimeout(150);
    const retenue = await page.evaluate(() => {
      const d = window._adocArtifacts['adocArt_polices']._adocStructuredDoc;
      return (d.blocks.find((x) => x.id === 'blk-a').style || {}).fontFamily || null;
    });
    assert.equal(retenue, choisie, 'choisir « ' + choisie + '  » dans la liste doit l\'écrire dans le document');
    console.log('PASS ' + (++n) + '/5 — un choix de la liste atteint réellement le document (« ' + choisie + ' »).');

    // ── 5 — UNE POLICE HÉRITÉE ABSENTE D'ICI N'EST JAMAIS PERDUE ──
    // Sans son option, affecter select.value la remettrait à vide et le premier réglage suivant
    // l'effacerait du document. Elle doit rester visible, sélectionnée, et non re-choisissable.
    const docHerite = ficheDoc([para('blk-a', 'Un paragraphe.')]);
    docHerite.blocks[0].style = { fontFamily: 'Police Du Poste Voisin' };
    await ouvrirPanneau(page, docHerite, 'blk-a');
    const s2 = await lireSelect(page);
    const o = s2.options.find((x) => x.v === 'Police Du Poste Voisin');
    assert.ok(o, 'la police du document, même absente de cet ordinateur, doit figurer dans la liste');
    assert.equal(s2.valeur, 'Police Du Poste Voisin', 'et rester effectivement sélectionnée');
    assert.equal(o.desactivee, true, 'montrée pour ce qu\'elle est, jamais re-choisissable : disabled');
    assert.equal(o.groupe, 'Valeur du document, absente de cet ordinateur', 'et annoncée comme telle');
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/5 — police héritée inconnue : conservée, sélectionnée, non re-choisissable.');
    await page.close();

    console.log('\nTOUS LES TESTS LISTE DE POLICES PASSENT (' + n + '/5)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
