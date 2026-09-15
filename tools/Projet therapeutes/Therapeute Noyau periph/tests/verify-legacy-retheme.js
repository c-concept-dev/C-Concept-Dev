// Modernisation ancien moteur — personnalisation des couleurs d'un document déjà généré, en un
// clic. PORTÉE : UNIQUEMENT les couleurs (décision actée), UNIQUEMENT fmt==='html' du moteur
// legacy, jamais le moteur structuré. Réutilise adocBrandKitToTokensSnapshot (mécanisme de
// charte déjà existant), jamais un second système de couleurs. Génère un VRAI document via le
// pipeline complet (même patron que verify-fallback-trace.js : échec non-transitoire de l'appel
// structuré → repli legacy réel), pour exercer adocShowArtifactCard/adocArtifactCardHtml tels
// quels (non exposés sur window, jamais reconstruits à la main dans ce test).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

// Document HTML "ancien moteur" réaliste — reproduit EXACTEMENT le bloc :root imposé par le
// prompt système (adocBuildSystemPrompt, ~ligne 4437), avec du contenu et un script inline.
const LEGACY_HTML = '<!DOCTYPE html><html><head><style>\n' +
  ':root { --mer:#1f5053; --deep:#102f31; --vert-sauge:#c9c3b8; --beige:#ddd7cc; --sable:#f6f2ea; --surf:#f6f2ea; --text:#273331; --muted:#5d6966; --blanc:#FFFFFF }\n' +
  'body{font-family:\'IBM Plex Sans\',sans-serif;background:var(--sable);color:var(--text);}\n' +
  'h1{font-family:\'Source Serif 4\',serif;color:var(--deep);border-bottom:2px solid var(--mer);}\n' +
  '</style></head><body>' +
  '<h1>Titre du document de test</h1>' +
  '<p>Un paragraphe de contenu clinique qui ne doit JAMAIS être modifié par ce lot, quel que soit le nombre de mots ou la ponctuation — accents, apostrophes, tout doit rester identique au caractère près.</p>' +
  '<script>console.log("script inline conservé tel quel");<\/script>' +
  '</body></html>';

const OLD_HTML_NO_ROOT = '<!DOCTYPE html><html><head><style>body{color:#273331;background:#f6f2ea;}h1{color:#102f31;}</style></head><body><h1>Ancien document</h1><p>Contenu antérieur à ce lot, sans bloc :root reconnaissable.</p></body></html>';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

const BRAND_KIT_ALT = {
  id: 'bk-alt-001', name: 'Charte Alternative',
  colors: { primary: '#3a1f5a', accent: '#c97a2b', background: '#eef1f5', text: '#1b1b2e', warning: '#c0392b' },
  typography: { headingFont: '"Merriweather", serif', bodyFont: '"Inter", sans-serif' },
  version: 1,
};

async function setupPage(browser, legacyHtml) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  let versionCallCount = 0, createCallCount = 0;
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits') && method === 'GET') {
      // Le VRAI Worker (handleBrandKitsList, SELECT * ... adocBrandKitRowToJSON) renvoie des
      // chartes COMPLÈTES dans la liste, pas de simples {id, name} — sinon adocGetBrandKitById
      // (cache-first sur cette même liste) court-circuiterait la résolution complète avec un
      // objet tronqué. Reproduit fidèlement pour ne pas fausser le test.
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Charte par défaut', colors: { primary: '#102f31', accent: '#9b4e36', background: '#f6f2ea', text: '#273331', warning: '#9b4e36' }, typography: {} }, BRAND_KIT_ALT] }) });
      return;
    }
    if (url.endsWith('/brand-kits/' + BRAND_KIT_ALT.id)) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BRAND_KIT_ALT) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
    if (url.endsWith('/clinical-documents') && method === 'POST') {
      createCallCount++;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1', created_at: new Date().toISOString() }) });
      return;
    }
    if (url.includes('/clinical-documents/') && url.endsWith('/versions') && method === 'POST') {
      versionCallCount++;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v' + (versionCallCount + 1), created_at: new Date().toISOString() }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
        // Échec non-transitoire de l'appel structuré → déclenche le VRAI repli legacy.
        route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'simulation échec structuré (non transitoire)' } }) });
        return;
      }
      // Kit v2.4 (Volet 1) — correctif du test lui-même : "max_tokens":200 (sans virgule) est
      // aussi un préfixe littéral de "max_tokens":2000 (appel planner), donc ce test capturait
      // par erreur l'appel planner ici depuis toujours — masqué avant ce lot car le texte tapé
      // contenait encore le mot "fiche" via l'ancien préfixe formatPhrases, ce qui suffisait au
      // repli local (_fallback) à deviner le bon intent MÊME quand le vrai plan mocké n'était
      // jamais utilisé. Volet 1 supprime ce préfixe : le bug de correspondance devient visible.
      // Virgule ajoutée pour ne matcher QUE 200, jamais 2000.
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(legacyHtml) }); return; }
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  return { page, errors, getVersionCallCount: () => versionCallCount, getCreateCallCount: () => createCallCount };
}

async function generateLegacyDoc(page, question) {
  // Kit v2.4 (Volet 1) — aucune présélection au chargement ; ce test a spécifiquement besoin
  // d'un VRAI repli structuré→legacy, donc sélectionne explicitement "Fiche synthèse", qui
  // est désormais un vrai <button aria-pressed> (plus un <input type="radio"> masqué sous un
  // <label>) : on clique le bouton directement.
  await page.click('#format-summary');
  await page.fill('#clinical-question', question);
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForSelector('.adoc-artifact-card', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  return page.evaluate(() => Object.keys(window._adocArtifacts || {})[0] || null);
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  // ══════════════════════════════════════════════════════════════════════
  // 1-2. Bouton visible, sélecteur, aperçu, confirmation — couleurs changées, reste identique
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, getCreateCallCount } = await setupPage(browser, LEGACY_HTML);
    const storeKey = await generateLegacyDoc(page, 'Explique-moi les cavaliers de Gottman');
    const engine = await page.evaluate((sk) => window._adocArtifacts[sk]._adocGenerationEngine, storeKey);
    log('0. Pré-condition — vrai repli legacy-html obtenu via le pipeline complet', engine === 'legacy-html');

    const btnVisible = await page.evaluate((sk) => !document.getElementById('retheme-btn-' + sk).hidden, storeKey);
    log('1a. Le bouton "Charte" est visible pour un document legacy', btnVisible);

    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    const pickerVisible = await page.evaluate(() => document.getElementById('cc-legacy-retheme-modal').classList.contains('open'));
    log('1b. Le sélecteur de charte s\'ouvre au clic', pickerVisible);
    const kitLabels = await page.$$eval('#cc-legacy-retheme-body .cc-clarity-reply-btn', els => els.map(e => e.textContent));
    log('1c. Les chartes disponibles sont proposées', kitLabels.includes('Charte Alternative'));

    await page.click('#cc-legacy-retheme-body .cc-clarity-reply-btn:has-text("Charte Alternative")');
    await page.waitForTimeout(200);
    const htmlBeforeConfirm = await page.evaluate((sk) => window._adocArtifacts[sk].html, storeKey);
    log('1d. Rien ne change tant que "Confirmer" n\'a pas été cliqué', htmlBeforeConfirm === LEGACY_HTML);
    log('1e. Un aperçu (iframe) est affiché avant confirmation', await page.evaluate(() => !!document.querySelector('#cc-legacy-retheme-body iframe')));
    log('1f. Boutons Confirmer et Annuler tous deux présents', await page.evaluate(() => !!document.querySelector('#cc-legacy-retheme-body button[onclick*="adocConfirmLegacyRetheme"]') && !!document.querySelector('#cc-legacy-retheme-body button[onclick*="adocCloseLegacyReThemePanel"]')));

    await page.click('#cc-legacy-retheme-body button[onclick*="adocConfirmLegacyRetheme"]');
    await page.waitForTimeout(400);
    const afterHtml = await page.evaluate((sk) => window._adocArtifacts[sk].html, storeKey);
    log('2a. Les couleurs ont changé (--deep n\'est plus l\'ancienne valeur)', !/--deep\s*:\s*#102f31/i.test(afterHtml));
    log('2b. --deep correspond à la couleur primaire de la charte choisie (#3a1f5a)', /--deep\s*:\s*#3a1f5a/i.test(afterHtml));
    const originalBody = LEGACY_HTML.slice(LEGACY_HTML.indexOf('<body>'));
    const afterBody = afterHtml.slice(afterHtml.indexOf('<body>'));
    log('2c. Le <body> (contenu, structure, script inline) reste IDENTIQUE au caractère près', originalBody === afterBody);
    log('2d. Sauvegardé via adocWsSave (mécanisme UX-10A réutilisé — 1re sauvegarde de ce document : POST /clinical-documents, jamais /versions)', getCreateCallCount() === 1);
    log('2e. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. Annuler avant confirmation — rien ne change
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, getVersionCallCount, getCreateCallCount } = await setupPage(browser, LEGACY_HTML);
    const storeKey = await generateLegacyDoc(page, 'Explique-moi les cavaliers de Gottman');
    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    await page.click('#cc-legacy-retheme-body .cc-clarity-reply-btn:has-text("Charte Alternative")');
    await page.waitForTimeout(200);
    await page.click('#cc-legacy-retheme-body button[onclick*="adocCloseLegacyReThemePanel"]');
    await page.waitForTimeout(200);
    const stillOriginal = await page.evaluate((sk) => window._adocArtifacts[sk].html, storeKey);
    log('3a. Annuler avant confirmation — document strictement identique', stillOriginal === LEGACY_HTML);
    log('3b. Le sélecteur se ferme après Annuler', await page.evaluate(() => !document.getElementById('cc-legacy-retheme-modal').classList.contains('open')));
    log('3c. Aucune sauvegarde déclenchée par une annulation', getVersionCallCount() === 0 && getCreateCallCount() === 0);
    log('3d. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4. Document déjà généré AVANT ce lot (pas de bloc :root reconnu) — jamais corrompu
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors } = await setupPage(browser, OLD_HTML_NO_ROOT);
    const storeKey = await generateLegacyDoc(page, 'Explique-moi un ancien concept sans charte reconnaissable');
    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    await page.click('#cc-legacy-retheme-body .cc-clarity-reply-btn:has-text("Charte Alternative")');
    await page.waitForTimeout(200);
    const bodyText = await page.evaluate(() => document.getElementById('cc-legacy-retheme-body').textContent);
    log('4a. Message honnête affiché — palette non reconnue, refus explicite', bodyText.includes('ne peut pas être re-thématisé'));
    const unchanged = await page.evaluate((sk) => window._adocArtifacts[sk].html, storeKey);
    log('4b. Le document ancien reste BYTE-IDENTIQUE — jamais corrompu par la tentative', unchanged === OLD_HTML_NO_ROOT);
    log('4c. Aucun bouton Confirmer proposé dans ce cas', await page.evaluate(() => !document.querySelector('#cc-legacy-retheme-body button[onclick*="adocConfirmLegacyRetheme"]')));
    log('4d. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // 5. Document du moteur structuré — item 61 : le bouton "Charte" est désormais VISIBLE
  // (Option A de Christophe, même bouton pour les deux moteurs), mais le CLIC route vers un flux
  // interne SÉPARÉ (adocOpenStructuredReThemePanel), jamais adocOpenLegacyReThemePanel — cf.
  // verify-item61-charte-structuree.js pour la couverture complète du nouveau flux structuré ;
  // ce cas-ci vérifie seulement la NON-régression : le flux legacy n'est jamais atteint par erreur.
  // ══════════════════════════════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    await page.route('**/*', (route) => {
      const req = route.request();
      const url = req.url();
      if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Charte par défaut', colors: {}, typography: {} }] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = req.postData() || '';
        if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
          const inputJson = JSON.stringify({ title: 'Fiche de test', purpose: 'supervision', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'x', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] }] });
          const events = [
            { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } },
            { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
          ];
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n' });
          return;
        }
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
        return;
      }
      route.continue();
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    const storeKey = await page.evaluate(async () => {
      window.openAssistDoc();
      document.getElementById('cc-landing').style.display = 'none';
      const ragResult = { chunks: [{ content: 'x', book_title: 'Y', author: 'Z', page_number: 1 }], chunkLen: 900 };
      const structured = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
      const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
      const storeKey = await window.adocDeliverStructuredFicheArtifact(structured.doc, structured.sourceSnapshot, rendered, null);
      window._adocArtifacts[storeKey]._adocRenderManifestOverride = rendered.renderManifest || null;
      return storeKey;
    });
    await page.waitForTimeout(200);
    const btnVisible = await page.evaluate((sk) => !document.getElementById('retheme-btn-' + sk).hidden, storeKey);
    log('5a. Item 61 — le bouton "Charte" est désormais VISIBLE pour un document du moteur structuré (changement intentionnel, plus MASQUÉ)', btnVisible === true);
    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    const hasLegacyFontSelect = await page.evaluate(() => !!document.getElementById('cc-legacy-retheme-font-select'));
    log('5b. Le clic route vers le flux STRUCTURÉ, jamais adocOpenLegacyReThemePanel (sélecteur de police LOT 11, exclusivement legacy, absent)', !hasLegacyFontSelect);
    log('5c. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  console.log('=== Résultats — Modernisation ancien moteur (couleurs) ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'FAIL ') + label));
  const failCount = results.filter(([, ok]) => !ok).length;
  console.log('\nTotal:', results.length, '- failCount:', failCount);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
