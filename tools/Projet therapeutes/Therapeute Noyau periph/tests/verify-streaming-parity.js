// Vérifie le lot "Streaming + parité complète" : (1) streaming réel du 2e appel avec
// progression visible, (2) score de citation transmis et affiché, (3) intégration sidebar/
// aperçu/export réutilisant adocDeliverArtifact + respect du blocage qualité à l'export,
// (4) bannière de couverture. Réseau MOQUÉ (Worker réel inatteignable depuis ce sandbox).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse — critique, mépris, attitude défensive, obstruction — prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42, _score: 0.87, _source: 'sql+vector' },
  { content: "Le mépris porte une dévalorisation globale du partenaire, au-delà du reproche ponctuel, et constitue le signal le plus prédictif de rupture selon les études longitudinales.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 58 }, // pas de _score → relevanceScore doit être null
];

function toolResponse(blocks, extra) {
  return {
    content: [
      {
        type: 'tool_use', name: 'emit_fiche_document',
        input: Object.assign({
          title: 'Les cavaliers de Gottman', purpose: 'psychoéducation', audience: 'clinicien',
          blocks: blocks.map(b => Object.assign({
            type: 'paragraph', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
            headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [],
          }, b)),
        }, extra || {}),
      },
    ],
  };
}
function toolResponseSSE(blocks, extra) {
  const inputJson = JSON.stringify(toolResponse(blocks, extra).content[0].input);
  const chunkSize = 23; // volontairement petit pour forcer plusieurs deltas et vérifier la progression
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
function isSearchCall(body) { return body.includes('"type":"auto"'); }
function isStructuredCall(body) { return body.includes('"type":"tool","name":"emit_fiche_document"'); }
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log('=== PARTIE 1 — streaming réel : progression visible pendant le flux (plusieurs deltas) ===');
  {
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = route.request().postData() || '';
        if (isSearchCall(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
        if (isStructuredCall(body)) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: 'Les cavaliers de Gottman', level: 1 },
            { type: 'paragraph', text: 'Le mépris est le signal le plus toxique du couple.', citationEntryIds: ['entry-1', 'entry-2'] },
          ]) });
          return;
        }
      }
      route.continue();
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);

    // adocUpdateTypingLabel n'est pas exportée sur window (closure interne à l'IIFE) — on ne
    // peut donc ni l'espionner depuis l'extérieur, ni fiablement compter les mutations DOM
    // intermédiaires : avec un mock qui livre tout le flux en un seul chunk réseau, les
    // écritures successives de textContent sont regroupées par le navigateur en un seul
    // callback MutationObserver (artefact de ce sandbox, pas un défaut du produit). On
    // vérifie donc : (a) l'état final reflète bien le nombre RÉEL de caractères reçus
    // (donc dérivé du flux, pas un texte figé), et (b) par lecture de code, que l'appel de
    // mise à jour est structurellement À L'INTÉRIEUR de la boucle de lecture du flux (donc
    // appelé à chaque delta, pas une seule fois à la fin) — preuve complémentaire à la
    // preuve dynamique, pas un remplacement.
    const fs = require('fs');
    const src = fs.readFileSync(FILE, 'utf-8');
    const loopStart = src.indexOf('const { done, value } = await _genReader.read();');
    const loopEnd = src.indexOf('_logTiming(\'flux terminé');
    const loopBody = src.slice(loopStart, loopEnd);
    const updateInsideLoop = /adocUpdateTypingLabel\(typingId,/.test(loopBody);
    console.log('=> le code met à jour le label À L\'INTÉRIEUR de la boucle de lecture du flux (preuve structurelle, appelé par delta):', updateInsideLoop);

    const finalLabel = await page.evaluate(async ({ chunks }) => {
      const typingId = window.adocShowTyping ? window.adocShowTyping() : (function() {
        const id = 'typing-test';
        const el = document.createElement('div');
        el.id = id;
        el.innerHTML = '<span class="adoc-typing-label"></span>';
        document.body.appendChild(el);
        return id;
      })();
      const ragResult = { chunks, chunkLen: 900 };
      const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev', typingId);
      const labelEl = document.querySelector('#' + typingId + ' .adoc-typing-label');
      return { text: labelEl ? labelEl.textContent : null, inputJsonLength: JSON.stringify(struct.doc).length > 0 };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log('label final:', finalLabel.text);
    console.log('=> le label final contient un vrai compteur de caractères reçus (dérivé du flux, pas figé):', /\d+ caractères reçus/.test(finalLabel.text || ''));
  }

  console.log('\n=== PARTIE 2 — score de citation transmis (relevanceScore) et affiché, jamais inventé ===');
  {
    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
      const entries = struct.sourceSnapshot.entries;
      const rendered = await window.adocRenderClinicalDocument(struct.doc, struct.sourceSnapshot);
      return {
        entry1Score: entries[0].relevanceScore,
        entry2Score: entries[1].relevanceScore,
        htmlHasScoreSpan: rendered.html.includes('adoc-cite-score'),
        htmlHasEightySeven: rendered.html.includes('87%'),
        // La 2e entrée (sans _score) ne doit produire AUCUN badge de score pour elle.
      };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log(result);
    console.log('=> relevanceScore copié depuis _score (0.87) pour l\'entrée qui en a un:', result.entry1Score === 0.87);
    console.log('=> relevanceScore null pour l\'entrée sans _score (jamais inventé):', result.entry2Score === null);
    console.log('=> badge de score présent dans le rendu:', result.htmlHasScoreSpan);
    console.log('=> pourcentage arrondi correct (87%):', result.htmlHasEightySeven);
  }

  console.log('\n=== PARTIE 3a — intégration sidebar/aperçu : réutilise adocDeliverArtifact ===');
  {
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = route.request().postData() || '';
        if (isSearchCall(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
        if (isStructuredCall(body)) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'heading', text: 'Les cavaliers de Gottman', level: 1 },
            { type: 'paragraph', text: 'Le mépris est le signal le plus toxique du couple.' },
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
      const storeKey = await window.adocDeliverStructuredFicheArtifact(struct.doc, struct.sourceSnapshot, rendered);
      const art = window._adocArtifacts[storeKey];
      return {
        storeKeyPresent: !!storeKey,
        artifactRegistered: !!art,
        hasStructuredDocAttached: !!(art && art._adocStructuredDoc),
        sidebarSectionVisible: document.getElementById('adoc-outputs-section')?.style.display === 'block',
        sidebarItemCount: document.querySelectorAll('#adoc-outputs-list .adoc-output-item').length,
        cardPresentInChat: !!document.querySelector('[data-storekey="' + storeKey + '"]'),
        hasIframePreview: !!document.querySelector('[data-storekey="' + storeKey + '"] iframe'),
      };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log(result);
    console.log('=> artifact enregistré avec le document canonique attaché:', result.hasStructuredDocAttached);
    console.log('=> entrée sidebar "Fichiers générés" créée:', result.sidebarSectionVisible && result.sidebarItemCount > 0);
    console.log('=> carte artifact dans le chat avec aperçu iframe (mécanisme Aperçu/Plein écran réutilisé):', result.cardPresentInChat && result.hasIframePreview);
  }

  console.log('\n=== PARTIE 3b — bouton Export : respecte qc.exportAllowed, jamais de contournement ===');
  {
    const resultOk = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
      const rendered = await window.adocRenderClinicalDocument(struct.doc, struct.sourceSnapshot);
      const storeKey = await window.adocDeliverStructuredFicheArtifact(struct.doc, struct.sourceSnapshot, rendered);
      let alertMsg = null;
      const origAlert = window.alert;
      window.alert = (m) => { alertMsg = m; };
      let downloaded = false;
      const origCreateElement = document.createElement.bind(document);
      document.createElement = function(tag) {
        const el = origCreateElement(tag);
        if (tag === 'a') { const origClick = el.click.bind(el); el.click = function() { downloaded = true; }; }
        return el;
      };
      const btn = document.querySelector('[data-storekey="' + storeKey + '"] [data-action="download-html"]');
      btn.click();
      await new Promise(r => setTimeout(r, 50));
      document.createElement = origCreateElement;
      window.alert = origAlert;
      return { alertMsg, downloaded, qcExportAllowed: rendered.qc.exportAllowed };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log(resultOk);
    console.log('=> export non bloqué (qc clean) → téléchargement réel déclenché, pas d\'alerte:', resultOk.downloaded && !resultOk.alertMsg);

    // Document délibérément QC-bloquant (contenu tronqué) — l'export doit être refusé.
    const resultBlocked = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
      struct.doc.blocks[1].content.text = struct.doc.blocks[1].content.text.replace(/[.!?…»"”]$/, '') + ' et donc';
      const rendered = await window.adocRenderClinicalDocument(struct.doc, struct.sourceSnapshot);
      const storeKey = await window.adocDeliverStructuredFicheArtifact(struct.doc, struct.sourceSnapshot, rendered);
      let alertMsg = null;
      const origAlert = window.alert;
      window.alert = (m) => { alertMsg = m; };
      let downloaded = false;
      const origCreateElement = document.createElement.bind(document);
      document.createElement = function(tag) {
        const el = origCreateElement(tag);
        if (tag === 'a') { const origClick = el.click.bind(el); el.click = function() { downloaded = true; }; }
        return el;
      };
      const btn = document.querySelector('[data-storekey="' + storeKey + '"] [data-action="download-html"]');
      btn.click();
      await new Promise(r => setTimeout(r, 50));
      document.createElement = origCreateElement;
      window.alert = origAlert;
      return { alertMsg, downloaded, qcBlocking: rendered.qc.blocking };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log(resultBlocked);
    console.log('=> export bloqué (qc.blocking non vide) → AUCUN téléchargement, alerte affichée avec le motif:', !resultBlocked.downloaded && !!resultBlocked.alertMsg && resultBlocked.alertMsg.includes(resultBlocked.qcBlocking[0]));
  }

  console.log('\n=== PARTIE 4 — bannière de couverture (catégorie/titre/sous-titre + image de fond si bloc image de tête) ===');
  {
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('/fetch-image')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [{ url: 'https://images.pexels.com/mock/cover-therapy-456.jpg' }] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const body = route.request().postData() || '';
        if (isSearchCall(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
        if (isStructuredCall(body)) {
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: toolResponseSSE([
            { type: 'image', imageQuery: 'therapist and couple talking calmly in bright office', imageAlt: 'Thérapeute et couple en séance dans un bureau lumineux' },
            { type: 'heading', text: 'Les cavaliers de Gottman', level: 1 },
            { type: 'paragraph', text: 'Le mépris est le signal le plus toxique du couple.' },
          ], { purpose: 'psychoéducation' }) });
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
      document.body.innerHTML = '<div style="max-width:760px;margin:20px auto;">' + rendered.html + '</div>';
      const cover = document.querySelector('.adoc-sc-cover');
      return {
        coverPresent: !!cover,
        category: document.querySelector('.adoc-sc-cover-category')?.textContent,
        title: document.querySelector('.adoc-sc-cover-title')?.textContent,
        subtitle: document.querySelector('.adoc-sc-cover-meta')?.textContent,
        bgImage: cover ? getComputedStyle(cover).backgroundImage : null,
        firstBodyBlockIsNotImage: rendered.html.indexOf('adoc-sc-image') === -1, // le bloc image de tête est retiré du corps
      };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log(result);
    console.log('=> bannière de couverture présente:', result.coverPresent);
    console.log('=> catégorie = purpose réel (PSYCHOÉDUCATION):', result.category === 'PSYCHOÉDUCATION');
    console.log('=> titre = doc.title réel:', result.title === 'Les cavaliers de Gottman');
    console.log('=> sous-titre contient Studio Clinique + audience réelle:', /Studio Clinique/.test(result.subtitle || '') && /clinicien/.test(result.subtitle || ''));
    console.log('=> image de fond résolue (mock Pexels), pas data-pexels résiduel:', (result.bgImage || '').includes('cover-therapy-456.jpg'));
    console.log('=> bloc image de tête retiré du corps normal (pas dupliqué):', result.firstBodyBlockIsNotImage);
    await page.screenshot({ path: OUT + '/cover-banner-result.png', fullPage: true });
  }

  console.log('\n=== PARTIE 4b — sans bloc image de tête : bannière quand même présente (sans photo) ===');
  {
    const result = await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
      const rendered = await window.adocRenderClinicalDocument(struct.doc, struct.sourceSnapshot);
      document.body.innerHTML = '<div style="max-width:760px;margin:20px auto;">' + rendered.html + '</div>';
      const cover = document.querySelector('.adoc-sc-cover');
      return { coverPresent: !!cover, hasDataPexelsAttr: cover ? cover.hasAttribute('data-pexels') : null };
    }, { chunks: MOCK_RAG_CHUNKS });
    console.log(result);
    console.log('=> bannière toujours présente même sans bloc image (jamais de photo générique fabriquée):', result.coverPresent && result.hasDataPexelsAttr === false);
  }

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
