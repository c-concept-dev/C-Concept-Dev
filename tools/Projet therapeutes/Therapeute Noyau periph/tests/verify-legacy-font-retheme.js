// LOT 11 — Changement de police d'un document legacy par remplacement littéral du texte
// (jamais par structure CSS, cf. investigation : le motif CSS body{}/h1{} varie, les noms
// littéraux "IBM Plex Sans"/"Source Serif 4" non). Couvre : les 5 variantes de l'investigation
// (toutes doivent être couvertes, contrairement au détecteur structurel initial), un vrai
// document généré via le pipeline complet (pas le gabarit LOT 30), la balise <link> Google
// Fonts mise à jour de façon déterministe, le complément palette ("Police" dans la colonne de
// gauche produit un résultat identique au bouton "Reteinter" de la carte), et la non-régression
// du reteintage de couleurs (LOT 9).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const ROOT_BLOCK = ':root{--mer:#1f5053;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#FFFFFF}';

const FONT_VARIANTS = [
  { label: 'A — body{} et h1{} autonomes', css: 'body{font-family:"IBM Plex Sans",sans-serif;} h1{font-family:"Source Serif 4",serif;}' },
  { label: 'B — niveaux de titre groupés (h1, h2, h3{...})', css: 'body{font-family:"IBM Plex Sans",sans-serif;} h1, h2, h3{font-family:"Source Serif 4",serif;}' },
  { label: 'C — sélecteur universel + classe de titre', css: '*{font-family:"IBM Plex Sans",sans-serif;} .hero-title, article h1{font-family:"Source Serif 4",serif;}' },
  { label: 'D — indirection par variable CSS', css: ':root{--font-body:"IBM Plex Sans";--font-heading:"Source Serif 4";} body{font-family:var(--font-body);} h1{font-family:var(--font-heading);}' },
  { label: 'E — sélecteur :is() moderne', css: 'body{font-family:"IBM Plex Sans",sans-serif;} :is(h1,h2){font-family:"Source Serif 4",serif;}' },
];

function buildDoc(fontCss) {
  return '<!DOCTYPE html><html><head><style>' + ROOT_BLOCK + ' ' + fontCss + '</style></head><body><h1>Titre de test</h1><p>Contenu de test.</p></body></html>';
}

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

const BRAND_KIT_ALT = {
  id: 'bk-alt-001', name: 'Charte Alternative',
  colors: { primary: '#3a1f5a', accent: '#c97a2b', background: '#eef1f5', text: '#1b1b2e', warning: '#c0392b' },
  typography: {}, version: 1,
};

async function setupPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits') && method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Charte par défaut', colors: { primary: '#102f31', accent: '#9b4e36', background: '#f6f2ea', text: '#273331', warning: '#9b4e36' }, typography: {} }, BRAND_KIT_ALT] }) });
      return;
    }
    if (url.endsWith('/brand-kits/' + BRAND_KIT_ALT.id)) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BRAND_KIT_ALT) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.endsWith('/clinical-documents') && method === 'POST') { route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1', created_at: new Date().toISOString() }) }); return; }
    if (url.includes('/clinical-documents/') && url.endsWith('/versions') && method === 'POST') { route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v2', created_at: new Date().toISOString() }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) { route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'simulation échec structuré' } }) }); return; }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(buildDoc(FONT_VARIANTS[0].css)) }); return; }
      if (body.includes('evaluate_clarity')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'test police', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1. Les 5 variantes de l'investigation sont TOUTES couvertes ═══
  {
    const { page, errors } = await setupPage(browser);
    for (const v of FONT_VARIANTS) {
      const storeKey = 'test-' + Math.random().toString(36).slice(2, 8);
      const res = await page.evaluate(async ({ storeKey, html, brandKitId }) => {
        window._adocArtifacts = window._adocArtifacts || {};
        window._adocArtifacts[storeKey] = { html, name: 'Test', fmt: 'html' };
        await window.adocOpenLegacyReThemePanel(storeKey);
        const select = document.getElementById('cc-legacy-retheme-font-select');
        select.value = 'inter-lora';
        await window.adocPreviewLegacyRetheme(brandKitId);
        const candidate = window._adocLegacyReThemeCandidate;
        return {
          hasCandidate: !!candidate,
          hasInter: candidate ? candidate.html.includes('Inter') : false,
          hasLora: candidate ? candidate.html.includes('Lora') : false,
          stillHasOldBody: candidate ? candidate.html.includes('IBM Plex Sans') : true,
          stillHasOldHeading: candidate ? candidate.html.includes('Source Serif 4') : true,
          fontApplied: !!(candidate && candidate.fontLabel),
        };
      }, { storeKey, html: buildDoc(v.css), brandKitId: '00000000-0000-4000-8000-000000000001' });
      const ok = res.hasCandidate && res.fontApplied && res.hasInter && res.hasLora && !res.stillHasOldBody && !res.stillHasOldHeading;
      log('1. Variante "' + v.label + '" — police remplacée intégralement', ok, res);
      await page.evaluate(() => window.adocCloseLegacyReThemePanel());
    }
    log('1z. Aucune erreur JS sur les 5 variantes', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 2. "keep" ne modifie rien ; motif absent → refus propre (couleurs quand même appliquées) ═══
  {
    const { page, errors } = await setupPage(browser);
    const resKeep = await page.evaluate(async ({ html, brandKitId }) => {
      const storeKey = 'test-keep';
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts[storeKey] = { html, name: 'Test', fmt: 'html' };
      await window.adocOpenLegacyReThemePanel(storeKey);
      // valeur par défaut du <select> == 'keep', on ne la change pas.
      await window.adocPreviewLegacyRetheme(brandKitId);
      const candidate = window._adocLegacyReThemeCandidate;
      return { hasCandidate: !!candidate, fontApplied: !!(candidate && candidate.fontLabel), stillHasBody: candidate ? candidate.html.includes('IBM Plex Sans') : false };
    }, { html: buildDoc(FONT_VARIANTS[0].css), brandKitId: '00000000-0000-4000-8000-000000000001' });
    log('2a. "Ne pas changer la police" (keep) laisse les noms de police intacts', resKeep.hasCandidate && !resKeep.fontApplied && resKeep.stillHasBody, resKeep);
    await page.evaluate(() => window.adocCloseLegacyReThemePanel());

    const NO_FONT_DOC = '<!DOCTYPE html><html><head><style>' + ROOT_BLOCK + ' body{color:red;}</style></head><body><p>Sans mention de police.</p></body></html>';
    const resMissing = await page.evaluate(async ({ html, brandKitId }) => {
      const storeKey = 'test-missing';
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts[storeKey] = { html, name: 'Test', fmt: 'html' };
      await window.adocOpenLegacyReThemePanel(storeKey);
      document.getElementById('cc-legacy-retheme-font-select').value = 'inter-lora';
      await window.adocPreviewLegacyRetheme(brandKitId);
      const candidate = window._adocLegacyReThemeCandidate;
      return { hasCandidate: !!candidate, fontApplied: !!(candidate && candidate.fontLabel), bodyHtml: document.getElementById('cc-legacy-retheme-body')?.innerHTML || '' };
    }, { html: NO_FONT_DOC, brandKitId: '00000000-0000-4000-8000-000000000001' });
    log('2b. Motif de police absent → refus propre, mais couleurs quand même appliquées', resMissing.hasCandidate && !resMissing.fontApplied, resMissing);
    log('2c. Message honnête affiché quand la police est refusée', resMissing.bodyHtml.includes('police n\'a pas pu être changée'), resMissing.bodyHtml.length);
    log('2d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3. Vrai document généré via le pipeline complet (pas le gabarit LOT 30) + balise <link> ═══
  {
    const { page, errors } = await setupPage(browser);
    await page.click('#format-summary');
    await page.fill('#clinical-question', 'Explique-moi les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForSelector('.adoc-artifact-card', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts || {})[0] || null);
    log('3a. Un vrai document a bien été généré via le pipeline complet', !!storeKey, storeKey);

    await page.evaluate((sk) => window.adocOpenLegacyReThemePanel(sk), storeKey);
    await page.waitForTimeout(100);
    await page.selectOption('#cc-legacy-retheme-font-select', 'public-merriweather');
    await page.click('.cc-clarity-reply-btn'); // 1er bouton = 1re charte de la liste
    await page.waitForTimeout(200);
    await page.click('button:has-text("Confirmer")');
    await page.waitForTimeout(400);
    const finalHtml = await page.evaluate((sk) => window._adocArtifacts[sk].html, storeKey);
    log('3b. Le texte "Public Sans" est présent dans le document final', finalHtml.includes('Public Sans'), finalHtml.length);
    log('3c. Le texte "Merriweather" est présent dans le document final', finalHtml.includes('Merriweather'));
    log('3d. Plus aucune trace de "IBM Plex Sans"', !finalHtml.includes('IBM Plex Sans'));
    log('3e. Plus aucune trace de "Source Serif 4"', !finalHtml.includes('Source Serif 4'));
    const linkMatch = finalHtml.match(/<link[^>]+fonts\.googleapis\.com[^>]*>/i);
    log('3f. La balise <link> Google Fonts est mise à jour et pointe vers Public Sans/Merriweather (encodage "+")', !!linkMatch && linkMatch[0].includes('Public+Sans') && linkMatch[0].includes('Merriweather'), linkMatch && linkMatch[0]);
    log('3g. Vérification "fichier exporté isolément" — le document final, ouvert seul, contient un <style> avec le bon nom', /<style[^>]*>[\s\S]*Public Sans[\s\S]*<\/style>/.test(finalHtml));
    log('3h. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 4. Complément palette — même résultat que le bouton "Reteinter" de la carte ═══
  {
    const { page, errors } = await setupPage(browser);
    const res = await page.evaluate(async ({ html, brandKitId }) => {
      const storeKey = 'test-palette';
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts[storeKey] = { html, name: 'Test', fmt: 'html' };
      // Aucun document ouvert dans l'espace de travail — doit refuser proprement.
      window._adocWsState = window._adocWsState || {};
      window._adocWsState.storeKey = null;
      let alertMsgNoDoc = null;
      window.alert = (m) => { alertMsgNoDoc = m; };
      window.adocOpenLegacyFontPanelFromPalette();
      const modalOpenNoDoc = document.getElementById('cc-legacy-retheme-modal')?.classList.contains('open');

      // Document ouvert — doit ouvrir EXACTEMENT le même panneau que le bouton de la carte.
      window._adocWsState.storeKey = storeKey;
      window.adocOpenLegacyFontPanelFromPalette();
      const modalOpenWithDoc = document.getElementById('cc-legacy-retheme-modal')?.classList.contains('open');
      const modalStoreKey = document.getElementById('cc-legacy-retheme-modal')?.dataset.storeKey;
      document.getElementById('cc-legacy-retheme-font-select').value = 'karla-playfair';
      await window.adocPreviewLegacyRetheme(brandKitId);
      const candidateViaPalette = window._adocLegacyReThemeCandidate;

      return {
        alertMsgNoDoc, modalOpenNoDoc: !!modalOpenNoDoc, modalOpenWithDoc: !!modalOpenWithDoc,
        modalStoreKey, hasKarla: candidateViaPalette ? candidateViaPalette.html.includes('Karla') : false,
        hasPlayfair: candidateViaPalette ? candidateViaPalette.html.includes('Playfair Display') : false,
      };
    }, { html: buildDoc(FONT_VARIANTS[0].css), brandKitId: '00000000-0000-4000-8000-000000000001' });
    log('4a. Aucun document ouvert → message clair, jamais un panneau vide', !res.modalOpenNoDoc && !!res.alertMsgNoDoc, res.alertMsgNoDoc);
    log('4b. Document ouvert → le même panneau s\'ouvre, sur le bon document', res.modalOpenWithDoc && res.modalStoreKey === 'test-palette');
    log('4c. Le résultat obtenu via la palette est identique à celui du bouton "Reteinter"', res.hasKarla && res.hasPlayfair, res);
    log('4d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — LOT 11, changement de police (remplacement littéral) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
