// STUDIO CLINIQUE — Trois correctifs de l'investigation troncature Présentation (Points 1/2/3),
// construits dans le même lot mais chacun indépendamment testable (principe 0D). Preuve réelle en
// navigateur (Playwright), jamais un appel réel à l'API Anthropic (SSE mockée via page.route,
// même convention que tous les tests précédents de ce projet).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}
function flatBlock(overrides) {
  return Object.assign({
    type: 'paragraph', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
    imageQuery: '', imageAlt: '', quizOptions: [], quizCorrectIndex: 0, quizExplanation: '',
    citationEntryIds: [],
  }, overrides);
}
function presentationToolSSE(cards, toolUseId) {
  const input = JSON.stringify({ title: 'Présentation test', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: toolUseId || 'toolu_x', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}
function decisionRoundSSE({ webResults, text, stopReason }) {
  const events = [];
  if (webResults) {
    events.push({ type: 'content_block_start', index: 0, content_block: { type: 'web_search_tool_result', content: webResults } });
  }
  if (text) {
    events.push({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } });
  }
  events.push({ type: 'message_delta', delta: { stop_reason: stopReason || 'end_turn' } });
  events.push({ type: 'message_stop' });
  return sse(events);
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const KNOWN_ENV_FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
  page.on('pageerror', (e) => { if (e.message !== KNOWN_ENV_FLAKE) errors.push(e.message); });
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
  return { page, errors };
}
async function generate(page, { text, plan, decisionSSE, toolSSE, typingId, toolStatus }) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch {}
    if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
      if (toolStatus && toolStatus !== 200) return route.fulfill({ status: toolStatus, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolSSE });
    }
    if (body.payload) {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: decisionSSE });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await page.evaluate(async ({ text, plan, typingId }) => {
    const area = document.getElementById('adoc-messages');
    const el = document.createElement('div'); el.id = typingId; el.innerHTML = '<div class="adoc-bubble"></div>';
    area.appendChild(el);
    const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }], chunkLen: 900, isDeep: false };
    await window.adocRunGenerationPipeline(text, plan, typingId, 'https://clone-proxy.test.local', precomputedRag);
  }, { text, plan, typingId });
  await page.unroute('**/*');
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  let failCount = 0;
  function check(cond, label) {
    if (cond) console.log('PASS —', label);
    else { console.log('FAIL —', label); failCount++; }
  }
  try {

    // ══════════════════════════════════════════════════════════════════════
    // POINT 1 — le message de repli nomme le VRAI type (presentation), jamais "Fiche" en dur.
    // ══════════════════════════════════════════════════════════════════════
    {
      const { page } = await newPage(browser);
      const warnings = [];
      page.on('console', (msg) => { if (msg.type() === 'warning') warnings.push(msg.text()); });
      // Appel 2 renvoie HTTP 500 (jamais un statut transitoire retenté) — déclenche à coup sûr le
      // repli, sans dépendre d'un contenu spécifique.
      await generate(page, {
        text: 'Prépare un exposé sur le stress chronique.',
        plan: { needs_rag: true, documentKind: 'presentation', intent: 'chat', _formatClarityResolved: true },
        decisionSSE: decisionRoundSSE({ text: 'Bibliothèque suffisante.' }),
        toolSSE: '', toolStatus: 500,
        typingId: 'typing-p1',
      });
      await page.waitForTimeout(400);
      const fallbackWarning = warnings.find((w) => w.includes('[UX-8A.1]') && w.includes('en échec'));
      check(!!fallbackWarning, 'Point 1 — un avertissement de repli a bien été émis');
      check(!!fallbackWarning && fallbackWarning.includes('présentation'), 'Point 1 — le message nomme "présentation", jamais "Fiche" par défaut');
      check(!!fallbackWarning && !fallbackWarning.includes('Fiche'), 'Point 1 — le mot "Fiche" n\'apparaît plus dans ce message pour un type non-fiche');
      await page.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    // POINT 2 — un round de l'appel 1 tronqué par max_tokens après web_search ne contamine JAMAIS
    // le prompt de l'appel 2 avec du texte coupé en plein mot ; les sources, elles, sont conservées.
    // ══════════════════════════════════════════════════════════════════════
    {
      const { page } = await newPage(browser);
      const warnings = [];
      page.on('console', (msg) => { if (msg.type() === 'warning') warnings.push(msg.text()); });
      let capturedCall2System = null;
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith('file:')) return route.continue();
        let body = {};
        try { body = route.request().postDataJSON() || {}; } catch {}
        if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
          capturedCall2System = body.payload.system;
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationToolSSE([
            { title: 'Carte 1', coverImageQuery: '', coverImageAlt: '', blocks: [flatBlock({ type: 'paragraph', text: 'Contenu.' })] },
          ]) });
        }
        if (body.payload) {
          // UN SEUL round : web_search_tool_result + texte coupé en plein mot + stop_reason=max_tokens.
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: decisionRoundSSE({
            webResults: [{ type: 'web_search_result', title: 'Étude X', url: 'https://example.test/etude-x' }],
            text: 'Les recherches montrent que le stress chronique affecte le système nerveux de manière pro',
            stopReason: 'max_tokens',
          }) });
        }
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      });
      await page.evaluate(async () => {
        const area = document.getElementById('adoc-messages');
        const el = document.createElement('div'); el.id = 'typing-p2a'; el.innerHTML = '<div class="adoc-bubble"></div>';
        area.appendChild(el);
        const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }], chunkLen: 900, isDeep: false };
        await window.adocRunGenerationPipeline(
          'Prépare un exposé sur le stress chronique.',
          { needs_rag: true, documentKind: 'presentation', intent: 'chat', _formatClarityResolved: true },
          'typing-p2a', 'https://clone-proxy.test.local', precomputedRag
        );
      });
      await page.unroute('**/*');
      check(!!capturedCall2System, 'Point 2 — l\'appel 2 a bien été atteint (round unique, pas de HAL)');
      check(!!capturedCall2System && !capturedCall2System.includes('de manière pro'),
        'Point 2 — le texte narratif tronqué en plein mot N\'APPARAÎT PAS dans le prompt de l\'appel 2');
      check(!!capturedCall2System && capturedCall2System.includes('Sources web consultées') && capturedCall2System.includes('https://example.test/etude-x'),
        'Point 2 — les sources web (titres/URLs), elles, restent présentes malgré la troncature du texte');
      const truncWarning = warnings.find((w) => w.includes('tronqué par max_tokens'));
      check(!!truncWarning, 'Point 2 — un avertissement explicite signale l\'exclusion du texte tronqué');
      await page.close();
    }

    // RÉGRESSION — un round web_search COMPLET (stop_reason normal, jamais tronqué) continue de
    // nourrir le prompt de l'appel 2 exactement comme avant ce correctif.
    {
      const { page } = await newPage(browser);
      let capturedCall2System = null;
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith('file:')) return route.continue();
        let body = {};
        try { body = route.request().postDataJSON() || {}; } catch {}
        if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
          capturedCall2System = body.payload.system;
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationToolSSE([
            { title: 'Carte 1', coverImageQuery: '', coverImageAlt: '', blocks: [flatBlock({ type: 'paragraph', text: 'Contenu.' })] },
          ]) });
        }
        if (body.payload) {
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: decisionRoundSSE({
            webResults: [{ type: 'web_search_result', title: 'Étude Y', url: 'https://example.test/etude-y' }],
            text: 'Les recherches montrent que le stress chronique affecte le système nerveux de manière profonde et durable.',
            stopReason: 'end_turn',
          }) });
        }
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      });
      await page.evaluate(async () => {
        const area = document.getElementById('adoc-messages');
        const el = document.createElement('div'); el.id = 'typing-p2b'; el.innerHTML = '<div class="adoc-bubble"></div>';
        area.appendChild(el);
        const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }], chunkLen: 900, isDeep: false };
        await window.adocRunGenerationPipeline(
          'Prépare un exposé sur le stress chronique.',
          { needs_rag: true, documentKind: 'presentation', intent: 'chat', _formatClarityResolved: true },
          'typing-p2b', 'https://clone-proxy.test.local', precomputedRag
        );
      });
      await page.unroute('**/*');
      check(!!capturedCall2System && capturedCall2System.includes('de manière profonde et durable'),
        'RÉGRESSION Point 2 — un round web_search COMPLET (non tronqué) continue d\'être injecté intégralement, comme avant ce correctif');
      await page.close();
    }

    // ══════════════════════════════════════════════════════════════════════
    // POINT 3 — déduplication passagesListing/ragCtx : réduction mesurable + intégrité des citations.
    // ══════════════════════════════════════════════════════════════════════
    {
      const { page } = await newPage(browser);
      const chunks = Array.from({ length: 45 }, (_, i) => ({
        content: 'CONTENU_CHUNK_' + (i + 1) + '_' + 'texte de remplissage distinct '.repeat(20) + i,
        book_title: 'Ouvrage ' + (1 + (i % 9)),
        author: 'Auteur ' + (1 + (i % 9)),
        page_number: 10 + i,
        _score: 0.9 - i * 0.001,
      }));
      let capturedCall2System = null;
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith('file:')) return route.continue();
        let body = {};
        try { body = route.request().postDataJSON() || {}; } catch {}
        if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
          capturedCall2System = body.payload.system;
          // Cite entry-20 (doit exister dans le SourceSnapshot réduit) et entry-40 (au-delà du
          // garde-fou pour chunkLen=900 → floor(18000/900)=20 — doit être filtré, jamais un
          // décalage vers une autre entrée).
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationToolSSE([
            { title: 'Carte citée', coverImageQuery: '', coverImageAlt: '', blocks: [
              flatBlock({ type: 'paragraph', text: 'Affirmation sourcée par entry-20 et entry-40.', citationEntryIds: ['entry-20', 'entry-40'] }),
            ] },
          ]) });
        }
        if (body.payload) {
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: decisionRoundSSE({ text: 'Bibliothèque suffisante.' }) });
        }
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      });
      let storeKey;
      await page.evaluate(async ({ chunks }) => {
        const area = document.getElementById('adoc-messages');
        const el = document.createElement('div'); el.id = 'typing-p3'; el.innerHTML = '<div class="adoc-bubble"></div>';
        area.appendChild(el);
        const precomputedRag = { chunks, chunkLen: 900, isDeep: false };
        await window.adocRunGenerationPipeline(
          'Prépare un exposé complet sur le sujet, en citant largement la bibliothèque.',
          { needs_rag: true, documentKind: 'presentation', intent: 'chat', _formatClarityResolved: true },
          'typing-p3', 'https://clone-proxy.test.local', precomputedRag
        );
      }, { chunks });
      await page.unroute('**/*');
      storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts || {}).slice(-1)[0]);
      check(!!storeKey, 'Point 3 — un artefact a bien été créé');

      // Mesure réelle de passagesListing (section "Passages disponibles :" du prompt appel 2).
      const passagesSection = capturedCall2System
        ? capturedCall2System.slice(capturedCall2System.indexOf('Passages disponibles :'), capturedCall2System.indexOf('── ILLUSTRATION'))
        : '';
      const entryIdsInListing = Array.from(new Set((passagesSection.match(/entry-\d+/g) || [])));
      check(entryIdsInListing.length > 0, 'Point 3 — passagesListing contient bien des entrées');
      check(entryIdsInListing.length <= 20, 'Point 3 — passagesListing est réduit à ' + entryIdsInListing.length + ' entrée(s) (≤ 20, le même plafond que ragCtx pour chunkLen=900), jamais les 45 chunks bruts');
      check(!passagesSection.includes('CONTENU_CHUNK_25_') && !passagesSection.includes('CONTENU_CHUNK_45_'),
        'Point 3 — le contenu des chunks au-delà du plafond (25e, 45e) n\'apparaît plus dans passagesListing');
      check(passagesSection.includes('CONTENU_CHUNK_1_') || passagesSection.includes('entry-1 '),
        'Point 3 — le contenu des premiers chunks (toujours les plus pertinents) reste bien présent');

      // Intégrité des citations — jamais un décalage d'index après réduction.
      const snapshotEntries = await page.evaluate((sk) => (window._adocArtifacts[sk]._adocStructuredSnapshot || {}).entries || [], storeKey);
      check(snapshotEntries.length <= 20, 'Point 3 — SourceSnapshot réellement réduit dans l\'artefact final (' + snapshotEntries.length + ' entrée(s))');
      const entry20 = snapshotEntries.find((e) => e.sourceSnapshotEntryId === 'entry-20');
      check(!!entry20 && entry20.exactText.includes('CONTENU_CHUNK_20_'),
        'Point 3 — entry-20 correspond EXACTEMENT au 20e chunk d\'origine (aucun décalage d\'index introduit par la réduction)');
      const entry40 = snapshotEntries.find((e) => e.sourceSnapshotEntryId === 'entry-40');
      check(!entry40, 'Point 3 — entry-40 (au-delà du plafond) n\'existe plus dans le SourceSnapshot réduit');

      // La citation vers entry-40 (hors plafond) doit être silencieusement filtrée, jamais un
      // crash ni une citation erronément rattachée à une autre entrée.
      const doc = await page.evaluate((sk) => window._adocArtifacts[sk]._adocStructuredDoc, storeKey);
      const citedBlock = doc.blocks[0].content.blocks[0];
      check(Array.isArray(citedBlock.citationIds), 'Point 3 — le bloc cité a bien une liste citationIds (jamais un crash)');
      const citedEntryIds = (doc.citations || []).filter((c) => citedBlock.citationIds.includes(c.citationId)).map((c) => c.sourceSnapshotEntryId);
      check(citedEntryIds.includes('entry-20'), 'Point 3 — la citation valide (entry-20) est bien conservée et correctement rattachée');
      check(!citedEntryIds.includes('entry-40'), 'Point 3 — la citation hors plafond (entry-40) est filtrée, jamais rattachée à une mauvaise entrée par erreur');
      await page.close();
    }

  } finally {
    await browser.close();
  }
  console.log('\n' + (failCount === 0 ? 'TOUS LES TESTS PASSENT' : failCount + ' ÉCHEC(S)'));
  process.exit(failCount === 0 ? 0 : 1);
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
