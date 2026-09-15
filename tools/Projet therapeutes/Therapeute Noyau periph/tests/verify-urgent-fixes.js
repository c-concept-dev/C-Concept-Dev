// Vérifie le lot CORRECTIFS URGENTS : BUG 1 (blocage muet), BUG 2 (citations non
// cliquables), BUG 3 (emojis dans le rendu structuré). Réseau MOQUÉ (Worker réel
// inatteignable depuis ce sandbox). Deux scénarios de ce fichier attendent réellement les
// délais de timeout implémentés (~20s et ~45s) plutôt que de les simuler — c'est la seule
// façon de prouver que le mécanisme déclenche vraiment, pas seulement qu'il est présent
// dans le code.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse — critique, mépris, attitude défensive, obstruction — prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

function toolResponse(blocks) {
  return {
    content: [
      {
        type: 'tool_use', name: 'emit_fiche_document',
        input: {
          title: 'Fiche test', purpose: 'supervision', audience: 'clinicien',
          blocks: blocks.map(b => Object.assign({
            type: 'paragraph', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
            headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [],
          }, b)),
        },
      },
    ],
  };
}
const WEB_SEARCH_NOT_USED = { content: [{ type: 'text', text: 'ok' }] };

// Le 1er appel (décision web_search) est désormais AUSSI streamé (lot streaming appel 1).
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

// Le 2e appel (génération structurée forcée) est désormais streamé (lot streaming) : le mock
// doit renvoyer un vrai flux SSE fragmenté, jamais un unique bloc JSON.
function toolResponseSSE(blocks) {
  const resp = toolResponse(blocks);
  const inputJson = JSON.stringify(resp.content[0].input);
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

function isSearchCall(body) {
  return body.payload && body.payload.tools && body.payload.tools[0] && body.payload.tools[0].name === 'web_search' && body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
}
function isStructuredCall(body) {
  return body.payload && body.payload.tool_choice && body.payload.tool_choice.name === 'emit_fiche_document';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log('=== BUG 1a — QC bloquant (contenu tronqué) → repli automatique, JAMAIS de blocage muet ===');
  {
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || ''; let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
        if (isSearchCall(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(WEB_SEARCH_NOT_USED.content[0].text) }); return; }
        if (isStructuredCall(body)) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: 'Titre', level: 1 },
            { type: 'paragraph', text: 'Ce paragraphe se termine sans ponctuation finale et donc' },
          ]) });
          return;
        }
      }
      route.continue();
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    const consoleLines = [];
    page.on('console', m => { if (m.text().includes('UX-8A.1')) consoleLines.push(m.text()); });
    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
      const rendered = await window.adocRenderClinicalDocument(struct.doc, struct.sourceSnapshot);
      return { blocking: rendered.qc.blocking };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log('QC bloquant détecté (préalable au test du hook complet):', result.blocking);
    console.log('=> au moins 1 problème bloquant confirmé, condition du repli automatique réunie:', result.blocking.length > 0);
  }

  console.log('\n=== BUG 1b — succès structuré : indicateur de frappe retiré, bouton réactivé, adocThinking remis à false ===');
  {
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: MOCK_RAG_CHUNKS }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || ''; let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
        if (isSearchCall(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(WEB_SEARCH_NOT_USED.content[0].text) }); return; }
        if (isStructuredCall(body)) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: 'Les cavaliers de Gottman', level: 1 },
            { type: 'paragraph', text: 'Le mépris est le signal le plus toxique du couple.', citationEntryIds: ['entry-1'] },
          ]) });
          return;
        }
        const bodyStr = bodyRaw;
        if (bodyStr.includes('needs_rag') || bodyStr.includes('TÂCHE')) {
          const plan = { needs_rag: true, searches: [{ terms: ['gottman'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'chat', audience_type: 'praticien', registre: 'clinique', topic_summary: 'gottman', deep_scan: false, max_tokens: 2000 };
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
          return;
        }
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
        return;
      }
      route.continue();
    });
    await page.reload();
    await page.waitForTimeout(300);
    await page.fill('#clinical-question', 'Fais-moi une fiche synthèse sur les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => {
      const artifacts = window._adocArtifacts || {};
      const structuredEntry = Object.values(artifacts).find(a => a._adocStructuredDoc);
      return {
        typingIndicatorsLeft: document.querySelectorAll('.adoc-typing, [id^="typing-"]').length,
        typingLabelTextsLeft: [...document.querySelectorAll('.adoc-typing-label')].map(e => e.textContent),
        sendBtnDisabled: document.getElementById('adoc-send-btn')?.disabled,
        // Lot streaming/parité : le document n'est plus une bulle isolée mais un artifact
        // (carte + sidebar), cf. adocDeliverStructuredFicheArtifact.
        hasStructuredArtifact: !!structuredEntry,
        sidebarEntryCount: document.querySelectorAll('#adoc-outputs-list .adoc-output-item').length,
      };
    });
    console.log(state);
    console.log('=> aucun indicateur "Génération structurée…" résiduel:', !state.typingLabelTextsLeft.some(t => t.includes('Génération structurée')));
    console.log('=> bouton d\'envoi réactivé:', state.sendBtnDisabled === false);
    console.log('=> document livré comme artifact (parité sidebar):', state.hasStructuredArtifact && state.sidebarEntryCount > 0);
  }

  console.log('\n=== BUG 1c — timeout appel 1 (web_search, 20s) : requête qui ne répond jamais → repli GRACIEUX vers le 2e appel, jamais un blocage ===');
  {
    const t0 = Date.now();
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || ''; let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
        if (isSearchCall(body)) { return; } // jamais de fulfill ni de continue — requête qui ne répond jamais
        if (isStructuredCall(body)) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: 'Titre', level: 1 },
            { type: 'paragraph', text: 'Contenu valide.' },
          ]) });
          return;
        }
      }
      route.continue();
    });
    await page.reload();
    await page.waitForTimeout(300);
    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
      return { title: struct.doc.title, blockCount: struct.doc.blocks.length };
    }, { chunks: MOCK_RAG_CHUNKS });
    const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('résultat:', result, '— temps écoulé:', elapsedS + 's');
    console.log('=> la génération a quand même abouti malgré le 1er appel qui ne répond jamais:', !!result.title);
    console.log('=> le délai observé est cohérent avec un timeout ~20s (pas une attente infinie):', Date.now() - t0 < 40000 && Date.now() - t0 >= 19000);
  }

  console.log('\n=== BUG 1d — timeout appel 2 (génération forcée, 45s) : requête qui ne répond jamais → erreur claire, jamais une attente infinie ===');
  {
    const t0 = Date.now();
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || ''; let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
        if (isSearchCall(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(WEB_SEARCH_NOT_USED.content[0].text) }); return; }
        if (isStructuredCall(body)) { return; } // jamais de fulfill ni de continue
      }
      route.continue();
    });
    await page.reload();
    await page.waitForTimeout(300);
    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      try {
        await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
        return { threw: false };
      } catch (e) {
        return { threw: true, message: e.message };
      }
    }, { chunks: MOCK_RAG_CHUNKS });
    const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('résultat:', result, '— temps écoulé:', elapsedS + 's');
    console.log('=> erreur claire levée (jamais une attente infinie ni un plantage silencieux):', result.threw && /inactivité du flux/.test(result.message));
    console.log('=> le délai observé est cohérent avec un timeout ~45s:', Date.now() - t0 < 65000 && Date.now() - t0 >= 44000);
  }

  console.log('\n=== BUG 2 — citations cliquables, ancrées vers une note en bas de document avec extrait exact ===');
  {
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || ''; let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
        if (isSearchCall(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(WEB_SEARCH_NOT_USED.content[0].text) }); return; }
        if (isStructuredCall(body)) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: 'Titre', level: 1 },
            { type: 'paragraph', text: 'Le mépris est le signal le plus toxique du couple.', citationEntryIds: ['entry-1'] },
          ]) });
          return;
        }
      }
      route.continue();
    });
    await page.reload();
    await page.waitForTimeout(300);
    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
      const rendered = await window.adocRenderClinicalDocument(struct.doc, struct.sourceSnapshot);
      const citationId = struct.doc.citations[0] && struct.doc.citations[0].citationId;
      document.body.innerHTML = '<div style="max-width:700px;margin:40px auto;">' + rendered.html + '</div>';
      const link = document.querySelector('.adoc-sc-cite a');
      const target = link ? document.querySelector(link.getAttribute('href')) : null;
      return {
        citationId,
        hasAnchorLink: !!link,
        href: link && link.getAttribute('href'),
        targetFound: !!target,
        targetText: target && target.textContent.slice(0, 160),
        hasExcerpt: rendered.html.includes('cavaliers de l'.replace(/'/g, '’')) || rendered.html.includes('adoc-sc-citation-excerpt'),
      };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log(result);
    await page.screenshot({ path: OUT + '/bug2-citations-cliquables.png', fullPage: true });
    console.log('=> lien <a href="#cite-...> présent (plus un simple <span>):', result.hasAnchorLink);
    console.log('=> la cible de l\'ancre existe bien dans le document (note en bas de page):', result.targetFound);
    console.log('=> le href pointe vers le bon citationId:', result.href === '#cite-' + result.citationId);
  }

  console.log('\n=== BUG 3 — emojis/pictogrammes retirés du texte structuré (paragraphe + tableau) ===');
  {
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || ''; let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
        if (isSearchCall(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(WEB_SEARCH_NOT_USED.content[0].text) }); return; }
        if (isStructuredCall(body)) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: '🔥 Titre avec emoji', level: 1 },
            { type: 'paragraph', text: 'Texte normal sans emoji, ne doit pas être modifié.' },
            { type: 'table', headers: ['Signal', 'Niveau'], rows: [['Mépris', '🔴 élevé'], ['Critique', '🟢 modéré'], ['Défense', '⚫ neutre']] },
          ]) });
          return;
        }
      }
      route.continue();
    });
    await page.reload();
    await page.waitForTimeout(300);
    const consoleLines = [];
    page.on('console', m => { if (m.text().includes('emoji')) consoleLines.push(m.text()); });
    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
      return { blocks: struct.doc.blocks };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log(JSON.stringify(result.blocks, null, 2));
    console.log('logs emoji:', consoleLines);
    const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    const allText = JSON.stringify(result.blocks);
    console.log('=> AUCUN emoji résiduel dans le document produit:', !EMOJI_RE.test(allText));
    console.log('=> titre nettoyé correctement:', result.blocks[0].content.text === 'Titre avec emoji');
    console.log('=> texte normal (sans emoji) inchangé:', result.blocks[1].content.text === 'Texte normal sans emoji, ne doit pas être modifié.');
    console.log('=> cellules de tableau nettoyées, texte conservé (élevé/modéré/neutre):', result.blocks[2].content.rows[0][1] === 'élevé' && result.blocks[2].content.rows[1][1] === 'modéré' && result.blocks[2].content.rows[2][1] === 'neutre');
  }

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
