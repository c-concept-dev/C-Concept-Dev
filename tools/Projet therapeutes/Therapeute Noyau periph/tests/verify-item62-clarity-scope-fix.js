// Item 62 — TEST DÉDIÉ APRÈS CORRECTIF (protocole v2 : un seul passage propre).
//
// Vérifie, sur le code CORRIGÉ :
// (1) Après une porte de clarté (déclenchée par un envoi normal), le modal "Charte" reste
//     intact ET fonctionnel : clic sur "Charte" ouvre bien le panneau avec la vraie liste des
//     chartes disponibles (GET /brand-kits), sur un document de l'ancien moteur généré
//     directement (Carrousel).
// (2) Non-régression complète du comportement des cartes de clarification elles-mêmes : une
//     seule à la fois (la précédente bien retirée dès l'apparition d'une nouvelle), y compris à
//     travers PLUSIEURS portes de clarté consécutives dans la même session.
// (3) Non-régression : le panneau de correction de bloc (Phase 1, cc-clarity-card réutilisé pour
//     le style) continue de fonctionner après une porte de clarté.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const CARROUSEL_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#FFFFFF;}</style></head><body><h1>Carrousel ACT</h1><p>Diapositive 1.</p></body></html>';
const BRAND_KIT = { id: 'kit-1', name: 'Charte Test', version: 1, colors: { primary: '#ff0000', accent: '#cc0000', background: '#fff0f0', text: '#330000', warning: '#aa0000' }, typography: { headingFont: 'Georgia', bodyFont: 'Arial' } };

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let clarityCallCount = 0;
  let brandKitsCalls = 0;
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { brandKitsCalls++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [BRAND_KIT] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        clarityCallCount++;
        // 2 premiers envois jugés ambigus (deux portes de clarté consécutives, cf. non-régression
        // point 2) ; le 3e "ready" pour laisser la génération réelle se produire.
        const needsClarif = clarityCallCount <= 2;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          content: [{ type: 'tool_use', name: 'evaluate_clarity', input: needsClarif
            ? { status: 'needs_clarification', understood_so_far: 'Un carrousel sur ACT', missing: ['public visé'], question: 'Précision ' + clarityCallCount + ' ?', quick_replies: ['Option A', 'Option B'], assumptions_if_proceeding: [] }
            : { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }]
        }) });
        return;
      }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(CARROUSEL_HTML) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['act'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'carrousel', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Carrousel ACT', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);

  // ── Deux portes de clarté consécutives (non-régression #2 : une seule carte à la fois) ──
  await page.click('#format-carousel');
  await page.fill('#clinical-question', 'Fais-moi un carrousel sur ACT');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1000);
  let cardCount = await page.evaluate(() => document.querySelectorAll('#adoc-messages .cc-clarity-card').length);
  log('(2a) Une seule carte de clarification affichée après la 1ère porte', cardCount === 1, cardCount);

  await page.click('.cc-clarity-reply-btn');
  await page.waitForTimeout(1000);
  cardCount = await page.evaluate(() => document.querySelectorAll('#adoc-messages .cc-clarity-card').length);
  log('(2b) Toujours une seule carte après la 2e porte (l\'ancienne bien retirée)', cardCount === 1, cardCount);

  await page.click('.cc-clarity-reply-btn');
  await page.waitForFunction(() => Object.keys(window._adocArtifacts || {}).length > 0, { timeout: 15000 });
  await page.waitForTimeout(300);

  const artifactInfo = await page.evaluate(() => {
    const entries = Object.entries(window._adocArtifacts || {});
    const [storeKey, art] = entries[entries.length - 1];
    return { storeKey, fmt: art.fmt, hasCapabilities: !!art._adocCapabilities };
  });
  log('(0) Document Carrousel généré, fmt===html, capacités présentes', artifactInfo.fmt === 'html' && artifactInfo.hasCapabilities, artifactInfo);

  // ── (1) Le bouton Charte reste fonctionnel après ces 2 portes de clarté ──
  const btnId = 'retheme-btn-' + artifactInfo.storeKey;
  const btnVisible = await page.evaluate((id) => { const b = document.getElementById(id); return !!b && !b.hidden; }, btnId);
  log('(1a) Bouton "Charte" visible sur la carte', btnVisible, btnVisible);
  await page.click('#' + btnId);
  await page.waitForTimeout(400);
  const modalOpen = await page.evaluate(() => document.getElementById('cc-legacy-retheme-modal')?.classList.contains('open'));
  log('(1b) Modal "Charte" bien ouvert après clic', modalOpen === true, modalOpen);
  const kitListed = await page.evaluate(() => (document.getElementById('cc-legacy-retheme-body')?.innerHTML || '').includes('Charte Test'));
  log('(1c) La vraie liste des chartes disponibles (GET /brand-kits) est bien affichée', kitListed, kitListed);
  log('(1d) GET /brand-kits a bien été appelé (pas une liste figée)', brandKitsCalls > 0, brandKitsCalls);

  // ── (3) Non-régression : le panneau de correction de bloc partage la même classe pour le
  // style mais reste un composant totalement séparé — sanity check structurel uniquement ici
  // (le scénario complet de correction de bloc est couvert par les tests Phase 1/2 dédiés dans
  // la régression ciblée) : confirmer que #cc-ws-doc-card existe hors de #adoc-messages, jamais
  // affecté par la portée restreinte de adocRemoveClarityCard.
  const wsCardOutsideMessages = await page.evaluate(() => {
    const msgs = document.getElementById('adoc-messages');
    const wsCard = document.getElementById('cc-ws-doc-card');
    return !!msgs && !!wsCard && !msgs.contains(wsCard);
  });
  log('(3) #cc-ws-doc-card (panneaux de bloc) est bien hors de #adoc-messages, non affecté', wsCardOutsideMessages, wsCardOutsideMessages);

  log('Aucune erreur JS', errors.length === 0, errors);

  console.log('=== Résultats — Item 62 : portée de adocRemoveClarityCard restreinte à #adoc-messages ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
