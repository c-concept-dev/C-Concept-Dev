// UX-8B Lot 2 — preuve réelle que le sélecteur de charte fonctionne de bout en bout sur un
// vrai document généré : deux chartes (seed migration 0001 + seed migration 0002, valeurs
// EXACTES reprises des fichiers SQL réels, jamais réinventées ici) servies via un vrai mock
// réseau de GET /brand-kits et GET /brand-kits/:id (le Worker réel est inatteignable depuis ce
// sandbox, cf. verify-live-fiche-mocked.js). Génère un document complet avec chaque charte via
// le vrai flux adocSend() (planner + RAG mocké + tool_use structuré mocké, même patron que
// verify-live-fiche-mocked.js), puis vérifie :
//  1. le rendu (couleur/police) est réellement différent entre les deux documents produits ;
//  2. le badge de charte dans la barre UX-8W reflète le nom réel de la charte utilisée ;
//  3. le chrome (topbar UX-8W, --petrol-950) reste identique quelle que soit la charte du doc ;
//  4. ré-ouvrir un document déjà généré ne déclenche AUCUN appel réseau (donc jamais de RAG).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

// ── Valeurs EXACTES des deux migrations réelles (0001 = seed initial, 0002 = ce lot) ──
const BRAND_KIT_1 = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Studio Clinique — pétrole/terracotta (par défaut)',
  version: 1,
  colors: { primary: '#102F31', accent: '#9B4E36', background: '#F6F2EA', text: '#273331', success: '#2F6E52', warning: '#8A3F29', critical: '#A13327' },
  typography: { headingFont: '"Source Serif 4", Georgia, serif', bodyFont: '"IBM Plex Sans", system-ui, sans-serif' },
  status: 'active',
};
const BRAND_KIT_2 = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Humaniste accessible',
  version: 1,
  colors: { primary: '#1B3A5C', accent: '#9C561A', background: '#FBF8F3', text: '#2B2620', success: '#2E7D4F', warning: '#A8431D', critical: '#A32C2C' },
  typography: { headingFont: '"Literata", Georgia, serif', bodyFont: '"Atkinson Hyperlegible", Arial, sans-serif' },
  status: 'active',
};

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse — critique, mépris, attitude défensive, obstruction — prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
  { content: 'Le mépris porte une dévalorisation globale du partenaire, au-delà du reproche ponctuel.', book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 58 },
];
const MOCK_TOOL_INPUT = {
  title: "Les cavaliers de l'apocalypse — Gottman",
  purpose: 'supervision', audience: 'clinicien',
  blocks: [
    { type: 'heading', text: "Les cavaliers de l'apocalypse", level: 1, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
    { type: 'paragraph', text: "Les quatre cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: ['entry-1'] },
    { type: 'callout', text: 'Le mépris est le signal le plus toxique du couple.', level: 2, visualRole: 'warning', items: [], ordered: false, headers: [], rows: [], citationEntryIds: ['entry-2'] },
  ],
};
function mockToolResponseSSE() {
  const inputJson = JSON.stringify(MOCK_TOOL_INPUT);
  const chunkSize = 37;
  const fragments = [];
  for (let i = 0; i < inputJson.length; i += chunkSize) fragments.push(inputJson.slice(i, i + chunkSize));
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 100 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'emit_fiche_document', input: {} } },
    ...fragments.map(f => ({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: f } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 50 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let ragCallCount = 0;
  let brandKitsListCallCount = 0;
  let brandKitGetCallCount = 0;
  let allCallCountSinceReset = 0;
  let trackingEnabled = true;

  await page.route('**/*', route => {
    const url = route.request().url();
    if (trackingEnabled) allCallCountSinceReset++;
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    if (url.endsWith('/brand-kits') && route.request().method() === 'GET') {
      brandKitsListCallCount++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [BRAND_KIT_1, BRAND_KIT_2] }) });
      return;
    }
    if (/\/brand-kits\/[^/]+$/.test(new URL(url).pathname) && route.request().method() === 'GET') {
      brandKitGetCallCount++;
      const id = new URL(url).pathname.split('/').pop();
      const kit = id === BRAND_KIT_2.id ? BRAND_KIT_2 : BRAND_KIT_1;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kit) });
      return;
    }
    if (url.includes('/d1-query') || url.includes('/search-library')) {
      ragCallCount++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = route.request().postData() || '';
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE() });
        return;
      }
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('needs_rag') || body.includes('TÂCHE')) {
        const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'cavaliers Gottman', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      if (body.includes('"type":"auto"')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(400);

  console.log('=== 0. Sélecteur de charte alimenté par un vrai GET /brand-kits (jamais codé en dur) ===');
  const selectorInfo = await page.evaluate(() => {
    const select = document.querySelector('#cc-brandkit-select');
    return {
      optionCount: select ? select.options.length : 0,
      optionLabels: select ? Array.from(select.options).map(o => o.textContent) : [],
      defaultSelectedId: select ? select.value : null,
    };
  });
  console.log(selectorInfo);
  console.log('=> GET /brand-kits appelé au chargement:', brandKitsListCallCount >= 1);
  console.log('=> 2 options réelles (charte 1 + charte 2), charte 1 sélectionnée par défaut:',
    selectorInfo.optionCount === 2 && selectorInfo.defaultSelectedId === BRAND_KIT_1.id);

  // ── Chrome AVANT toute génération (référence) ──
  const chromeBefore = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--petrol-950').trim());

  async function generateWithBrandKit(brandKitId, label) {
    // #cc-landing passe en display:none après une 1re demande (comportement existant, hors
    // périmètre de ce lot) — window.adocReturnToLanding() (mécanisme déjà existant du bouton
    // "retour") le réaffiche et masque #assistdoc-screen, pour permettre une 2e demande ici.
    await page.evaluate(() => { if (typeof window.adocReturnToLanding === 'function') window.adocReturnToLanding(); });
    if (brandKitId) {
      await page.selectOption('#cc-brandkit-select', brandKitId);
    }
    await page.fill('#clinical-question', 'Fais-moi une fiche synthèse sur les cavaliers de Gottman (' + label + ')');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const artifacts = window._adocArtifacts || {};
      const entries = Object.entries(artifacts).filter(([, a]) => a._adocStructuredDoc);
      const [storeKey] = entries[entries.length - 1] || [];
      return { storeKey, brandKitName: storeKey ? artifacts[storeKey]._adocBrandKitName : null, hasOverride: storeKey ? !!artifacts[storeKey]._adocRenderManifestOverride : false };
    });
    return info;
  }

  console.log('\n=== 1. Génération avec la charte PAR DÉFAUT (pétrole/terracotta) ===');
  const gen1 = await generateWithBrandKit(null, 'défaut');
  console.log(gen1);

  await page.evaluate((storeKey) => window.adocOpenWorkspace(storeKey), gen1.storeKey);
  await page.waitForTimeout(150);
  const doc1Style = await page.evaluate(() => {
    const art = document.querySelector('#cc-ws-doc-card .adoc-sc-doc');
    const cs = art ? getComputedStyle(art) : null;
    return {
      headingColorVar: art ? art.style.getPropertyValue('--adoc-sc-heading-color') : null,
      bodyFontVar: art ? art.style.getPropertyValue('--adoc-sc-body-font') : null,
      badgeText: document.getElementById('cc-ws-brandkit')?.textContent || '',
      topbarBg: getComputedStyle(document.querySelector('.cc-ws-topbar')).backgroundColor,
    };
  });
  console.log(doc1Style);
  await page.screenshot({ path: OUT + '/ux8b-lot2-doc-charte1.png', fullPage: false });
  await page.evaluate(() => window.adocCloseWorkspace());

  console.log('\n=== 2. Génération avec la charte 2 (Humaniste accessible), choisie AU MOMENT de la demande ===');
  const gen2 = await generateWithBrandKit(BRAND_KIT_2.id, 'humaniste');
  console.log(gen2);

  await page.evaluate((storeKey) => window.adocOpenWorkspace(storeKey), gen2.storeKey);
  await page.waitForTimeout(150);
  const doc2Style = await page.evaluate(() => {
    const art = document.querySelector('#cc-ws-doc-card .adoc-sc-doc');
    return {
      headingColorVar: art ? art.style.getPropertyValue('--adoc-sc-heading-color') : null,
      bodyFontVar: art ? art.style.getPropertyValue('--adoc-sc-body-font') : null,
      badgeText: document.getElementById('cc-ws-brandkit')?.textContent || '',
      topbarBg: getComputedStyle(document.querySelector('.cc-ws-topbar')).backgroundColor,
    };
  });
  console.log(doc2Style);
  await page.screenshot({ path: OUT + '/ux8b-lot2-doc-charte2.png', fullPage: false });

  console.log('\n=== 3. Rendu RÉELLEMENT différent entre les deux documents (couleur ET police) ===');
  console.log({
    colorDiffers: doc1Style.headingColorVar !== doc2Style.headingColorVar,
    fontDiffers: doc1Style.bodyFontVar !== doc2Style.bodyFontVar,
    doc1Color: doc1Style.headingColorVar, doc2Color: doc2Style.headingColorVar,
    doc1Font: doc1Style.bodyFontVar, doc2Font: doc2Style.bodyFontVar,
  });

  console.log('\n=== 4. Badge de charte réel dans la barre UX-8W (jamais un libellé fixe) ===');
  console.log({
    doc1BadgeIsDefault: doc1Style.badgeText === BRAND_KIT_1.name,
    doc2BadgeIsHumaniste: doc2Style.badgeText === BRAND_KIT_2.name,
    doc1Badge: doc1Style.badgeText, doc2Badge: doc2Style.badgeText,
  });

  console.log('\n=== 5. Chrome (topbar UX-8W, --petrol-950) IDENTIQUE quelle que soit la charte du document ===');
  const chromeAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--petrol-950').trim());
  console.log({
    chromeBefore, chromeAfter,
    chromeNeverChanged: chromeBefore === chromeAfter,
    topbarBgIdenticalAcrossCharts: doc1Style.topbarBg === doc2Style.topbarBg,
    topbarBg: doc1Style.topbarBg,
  });

  console.log('\n=== 6. Ré-ouvrir un document déjà généré ne déclenche AUCUN appel réseau (donc jamais de RAG) ===');
  await page.evaluate(() => window.adocCloseWorkspace());
  await page.waitForTimeout(100);
  const ragCallsBeforeReopen = ragCallCount;
  const allCallsBeforeReopen = allCallCountSinceReset;
  allCallCountSinceReset = 0;
  await page.evaluate((storeKey) => window.adocOpenWorkspace(storeKey), gen2.storeKey);
  await page.waitForTimeout(200);
  console.log({
    ragCallsDuringReopen: ragCallCount - ragCallsBeforeReopen,
    anyNetworkCallDuringReopen: allCallCountSinceReset,
    noRagTriggeredByBrandKitReopen: ragCallCount === ragCallsBeforeReopen,
  });

  await page.evaluate(() => window.adocCloseWorkspace());

  console.log('\n=== Résumé compteurs réseau ===');
  console.log({ ragCallCount, brandKitsListCallCount, brandKitGetCallCount });

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
