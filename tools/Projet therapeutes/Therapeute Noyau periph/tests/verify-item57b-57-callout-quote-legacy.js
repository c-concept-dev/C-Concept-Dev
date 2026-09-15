// Items 57b + 57 (volet quote) — TEST DÉDIÉ, EXCLUSIVEMENT EN MOCK (contrainte D1 en cours,
// cf. document maître Partie 4 étape 0bis : quota Cloudflare D1 épuisé jusqu'à minuit UTC, tout
// appel réel au Worker échoue en 500). Aucun appel réseau réel n'est fait ici — même patron de
// mock déjà utilisé pour item 57c Lot 1/2 (page.route intercepte tout, y compris clone-proxy).
//
// Objet : callout et quote deviennent corrigibles côté ancien moteur (57b), quote devient
// insérable avant/après un bloc ciblé (57 volet quote) — image reste exclue (décision Christophe).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}

// Document fixture : un encadré INSÉRÉ par un lot antérieur (Phase 2, <p class="adoc-sc-callout
// adoc-sc-callout-info">) et une citation en bloc PRODUITE PAR LE MODÈLE (<blockquote>, jamais
// imposée par un prompt système déterministe, cf. investigation) coexistent avec les 4 types déjà
// couverts (heading/paragraph/list/cellule) — preuve que les deux origines possibles sont couvertes.
const LEGACY_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;}</style></head><body>'
  + '<h1>Titre du document</h1>'
  + '<p>Paragraphe ordinaire.</p>'
  + '<p class="adoc-sc-callout adoc-sc-callout-info">Encadré déjà présent dans le document.</p>'
  + '<blockquote>Citation déjà présente, produite librement par le modèle.</blockquote>'
  + '<ul><li>Item de liste</li></ul>'
  + '</body></html>';

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

function baseRoutes(page) {
  // Item 57b's scénario confirme (via adocConfirmLegacyBlockCorrection, déjà existant, inchangé)
  // que CHAQUE correction confirmée déclenche elle-même une sauvegarde automatique — la première
  // crée le document (POST /clinical-documents), toutes les suivantes ajoutent une version
  // (POST .../versions, même enveloppe {document:...}, cf. adocWsSave). Les DEUX doivent être
  // capturées : ne capturer que la création manquerait tout ce qui suit la toute première
  // correction confirmée dans ce scénario multi-corrections.
  const captured = { createBody: null, versionBody: null };
  page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
    if (url.endsWith('/clinical-documents') && req.method() === 'POST') {
      captured.createBody = JSON.parse(req.postData() || '{}');
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1' }) });
      return;
    }
    if (url.includes('/clinical-documents/') && url.endsWith('/versions')) {
      captured.versionBody = JSON.parse(req.postData() || '{}');
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ version_id: 'v2' }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"name":"emit_block_correction"')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text: 'Corrigé par IA.', items: ['Corrigé par IA.'], headers: [], rows: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'carrousel', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Test', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
  return captured;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const captured = baseRoutes(page);

  await page.goto('file://' + FILE);
  await page.click('#format-carousel');
  await page.fill('#clinical-question', 'Fais-moi un carrousel sur ACT');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 15000 });
  const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocGenerationEngine === 'legacy-html')[0]);
  await page.evaluate((k) => window.adocOpenWorkspace(k), storeKey);
  await page.waitForTimeout(200);

  // ── Investigation point 1/2 confirmée en conditions réelles : le sélecteur étendu détecte bien
  // l'encadré ET la citation, en plus des 4 types déjà couverts (les classifications précises par
  // "kind" sont vérifiées individuellement plus bas via window._adocLegacyBlockEditState, seul
  // état réellement exposé sur window — adocLegacyBlockKind lui-même reste privé à l'IIFE). ──
  const blockTags = await page.evaluate(() => [...document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')].map(el => el.tagName.toLowerCase() + (el.className ? '.' + el.className.replace(/\s+/g, '.') : '')));
  log('[57b] 1a. Sélecteur étendu : 5 blocs détectés (h1, p, encadré, citation, ul)', blockTags.length === 5, blockTags);
  log('[57b] 1b. L\'encadré (.adoc-sc-callout) est bien détecté comme bloc sélectionnable', blockTags.some(t => t.includes('adoc-sc-callout')), null);
  log('[57b] 1c. Le <blockquote> est bien détecté comme bloc sélectionnable', blockTags.some(t => t.startsWith('blockquote')), null);

  // ── Correction de l'ENCADRÉ déjà présent (57b) ──
  await page.click('#cc-ws-doc-card .adoc-sc-callout[data-cc-legacy-block-id]');
  await page.waitForSelector('.cc-block-edit-panel');
  const calloutSelected = await page.evaluate(() => window._adocLegacyBlockEditState && window._adocLegacyBlockEditState.kind);
  log('[57b] 2a. L\'encadré est bien classé kind="callout" (plus "paragraph" par défaut)', calloutSelected === 'callout', calloutSelected);
  await page.click('.cc-block-edit-panel button:has-text("Réécrire")');
  await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
  const beforeLabel = await page.evaluate(() => document.querySelector('.cc-block-edit-before .cc-block-edit-label')?.parentElement?.textContent || '');
  await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
  await page.waitForFunction((k) => window._adocArtifacts[k].html.includes('Corrigé par IA') && document.querySelector('#cc-ws-doc-card .adoc-sc-callout')?.textContent.includes('Corrigé par IA'), storeKey, { timeout: 10000 });
  log('[57b] 2b. La correction IA de l\'encadré est bien appliquée et sauvegardée dans art.html', true, null);
  log('[57b] 2c. L\'encadré garde bien sa classe adoc-sc-callout après correction (apparence préservée)', await page.evaluate(() => !!document.querySelector('#cc-ws-doc-card .adoc-sc-callout')), null);

  // ── Correction de la CITATION déjà présente, produite librement par le modèle (57b) ──
  const quoteBlockKey = await page.evaluate(() => {
    const bq = document.querySelector('#cc-ws-doc-card blockquote[data-cc-legacy-block-id]');
    return bq ? bq.getAttribute('data-cc-legacy-block-id') : null;
  });
  log('[57b] 3a. Le <blockquote> pré-existant (jamais inséré par nous) est bien sélectionnable', !!quoteBlockKey, quoteBlockKey);
  await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${quoteBlockKey}"]`);
  await page.waitForSelector('.cc-block-edit-panel');
  const quoteSelectedKind = await page.evaluate(() => window._adocLegacyBlockEditState && window._adocLegacyBlockEditState.kind);
  log('[57b] 3b. La citation est bien classée kind="quote"', quoteSelectedKind === 'quote', quoteSelectedKind);
  await page.click('.cc-block-edit-panel button:has-text("Réécrire")');
  await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
  await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
  await page.waitForFunction((k) => document.querySelector('#cc-ws-doc-card blockquote')?.textContent.includes('Corrigé par IA'), storeKey, { timeout: 10000 });
  log('[57b] 3c. La correction IA de la citation est bien appliquée', true, null);

  // ── Insertion d'une NOUVELLE citation avant/après un bloc ciblé (57, volet quote) ──
  // Lit les boutons RÉELLEMENT rendus par le panneau (ADOC_LEGACY_BLOCK_INSERT_TYPES est privé à
  // l'IIFE, jamais exposé sur window — comportement observable en UI, pas les internes, cf. 0E).
  await page.click('#cc-ws-doc-card h1[data-cc-legacy-block-id]');
  await page.waitForSelector('.cc-block-edit-panel');
  await page.click('.cc-block-edit-panel button:has-text("Insérer un bloc après")');
  await page.waitForSelector('.cc-block-edit-result button');
  const offeredLabels = await page.evaluate(() => [...document.querySelectorAll('.cc-block-edit-result button')].map(b => b.textContent.trim()));
  log('[57] 4a. "Citation" fait maintenant partie des types insérables côté legacy', offeredLabels.includes('Citation'), offeredLabels);
  log('[57] 4b. "Image" reste exclue (décision Christophe, inchangée)', !offeredLabels.includes('Image'), null);

  await page.click('.cc-block-edit-result button:has-text("Citation")');
  await page.waitForTimeout(300);
  const insertedQuote = await page.evaluate(() => {
    const bqs = [...document.querySelectorAll('#cc-ws-doc-card blockquote')];
    return bqs.map(b => ({ text: b.textContent, classes: b.className }));
  });
  log('[57] 4c. Une nouvelle citation (<blockquote class="adoc-sc-quote">) a bien été insérée', insertedQuote.some(b => b.text.includes('Nouvelle citation') && b.classes.includes('adoc-sc-quote')), insertedQuote);
  log('[57] 4d. Le panneau de correction se rouvre automatiquement sur le nouveau bloc (même geste que les autres types)', await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel')), null);

  // ── Non-régression : heading/paragraph/list/cellule toujours corrigibles (Phase 1) ──
  await page.click('#cc-ws-doc-card ul[data-cc-legacy-block-id]');
  await page.waitForSelector('.cc-block-edit-panel');
  const listKind = await page.evaluate(() => window._adocLegacyBlockEditState && window._adocLegacyBlockEditState.kind);
  log('[non-régression] 5a. La liste reste classée kind="list" (inchangé)', listKind === 'list', listKind);
  await page.click('.cc-block-edit-panel button:has-text("Réécrire")');
  await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
  await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
  await page.waitForFunction((k) => document.querySelector('#cc-ws-doc-card ul li')?.textContent.includes('Corrigé par IA'), storeKey, { timeout: 10000 });
  log('[non-régression] 5b. Correction de liste toujours fonctionnelle (Phase 1 intact)', true, null);

  // ── Sauvegarde finale + vérification du contenu envoyé ──
  // La toute PREMIÈRE correction confirmée plus haut (encadré) a déjà créé le document
  // (POST /clinical-documents) — ce clic final ajoute donc une NOUVELLE VERSION
  // (POST .../versions, cf. adocWsSave), jamais une seconde création : c'est versionBody, pas
  // createBody, qui porte l'état final complet à vérifier ici.
  await page.click('#cc-ws-save-btn');
  await page.waitForTimeout(300);
  const savedHtml = captured.versionBody ? captured.versionBody.document.html : (captured.createBody && captured.createBody.document.html);
  log('[global] 6a. La sauvegarde a bien été envoyée', !!savedHtml, null);
  log('[global] 6b. Le HTML envoyé contient la correction de l\'encadré', savedHtml && savedHtml.includes('Corrigé par IA'), null);
  log('[global] 6c. Le HTML envoyé contient la nouvelle citation insérée', !!(savedHtml && (savedHtml.includes('Nouvelle citation') || savedHtml.includes('adoc-sc-quote'))), savedHtml && savedHtml.slice(0, 500));
  log('[global] 6d. Aucune erreur JS sur tout le scénario', errors.length === 0, errors);

  console.log('=== Résultats — Items 57b + 57 (volet quote) : callout/quote legacy ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
