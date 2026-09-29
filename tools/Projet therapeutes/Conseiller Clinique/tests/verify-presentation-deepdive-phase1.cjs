// STUDIO CLINIQUE — Présentation "site de poche", ACTE 2, PHASE 1 : schéma + génération pour les
// liens d'approfondissement. Phase 1 UNIQUEMENT (schéma + conversion) — aucun rendu, aucune porte,
// aucun export à vérifier ici (Phases 2/3, hors périmètre). Preuve directe sur le JSON produit
// (doc.deepDives, doc.blocks[].deepDiveLinks), jamais via une interaction visuelle.
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
    questionnaireQuestions: [], questionnaireProfiles: [], questionnaireTwoPartners: false,
    deepDiveLinks: [], citationEntryIds: [],
  }, overrides);
}
function presentationSSE(input) {
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_deepdive', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

async function runGeneration(page, input, typingSuffix) {
  return page.evaluate(async ({ input, typingSuffix }) => {
    const area = document.getElementById('adoc-messages');
    const el = document.createElement('div'); el.id = 'typing-' + typingSuffix; el.innerHTML = '<div class="adoc-bubble"></div>';
    area.appendChild(el);
    const precomputedRag = { chunks: [{ content: 'Le cortisol est une hormone du stress.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
    await window.adocRunGenerationPipeline(
      'Prépare un exposé avec un complément sur le cortisol.',
      { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
      'typing-' + typingSuffix, 'https://clone-proxy.test.local', precomputedRag
    );
    const key = Object.keys(window._adocArtifacts || {}).slice(-1)[0];
    const art = window._adocArtifacts[key];
    return { key, doc: art && art._adocStructuredDoc };
  }, { input, typingSuffix });
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    const KNOWN_ENV_FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    page.on('pageerror', (e) => { if (e.message !== KNOWN_ENV_FLAKE) errors.push(e.message); });
    page.on('dialog', (d) => d.dismiss());
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    let currentInput = null;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool' && body.payload.tool_choice.name === 'emit_presentation_document') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationSSE(currentInput) });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    // ══════════════════════════════════════════════════════════════════════
    // 1. GÉNÉRATION RÉELLE — un document dont le texte suggère un approfondissement doit produire
    //    doc.deepDives ET un bloc dont deepDiveLinks référence exactement cet id.
    // ══════════════════════════════════════════════════════════════════════
    currentInput = {
      title: 'Le stress chronique', purpose: 'formation', audience: 'praticien',
      cards: [{
        title: 'Le rôle du cortisol', coverImageQuery: '', coverImageAlt: '',
        blocks: [
          flatBlock({ type: 'paragraph', text: 'Le cortisol joue un rôle central dans la réponse au stress.', deepDiveLinks: [{ text: 'cortisol', targetId: 'deepdive-cortisol' }] }),
        ],
      }],
      deepDives: [
        { id: 'deepdive-cortisol', title: 'Le cortisol', paragraphs: ['Le cortisol est une hormone stéroïde sécrétée par les glandes surrénales.', 'Un taux chroniquement élevé est associé à plusieurs troubles cliniques.'] },
      ],
    };
    const result1 = await runGeneration(page, currentInput, 'deepdive-ok');
    assert.ok(result1.key, 'un artefact Présentation doit avoir été créé');
    const doc1 = result1.doc;
    assert.ok(doc1, 'le document structuré doit être accessible');
    assert.ok(Array.isArray(doc1.deepDives) && doc1.deepDives.length === 1, 'doc.deepDives doit contenir exactement 1 entrée exploitable');
    assert.equal(doc1.deepDives[0].id, 'deepdive-cortisol');
    assert.equal(doc1.deepDives[0].title, 'Le cortisol');
    assert.deepEqual(doc1.deepDives[0].paragraphs, ['Le cortisol est une hormone stéroïde sécrétée par les glandes surrénales.', 'Un taux chroniquement élevé est associé à plusieurs troubles cliniques.']);
    const para1 = doc1.blocks[0].content.blocks[0];
    assert.equal(para1.type, 'paragraph');
    assert.ok(Array.isArray(para1.deepDiveLinks) && para1.deepDiveLinks.length === 1, 'le bloc paragraph doit porter exactement 1 deepDiveLink');
    assert.equal(para1.deepDiveLinks[0].text, 'cortisol');
    assert.equal(para1.deepDiveLinks[0].targetId, 'deepdive-cortisol', 'le targetId doit correspondre EXACTEMENT à l\'id produit dans deepDives');
    console.log('PASS 1/3 — génération réelle : doc.deepDives + deepDiveLinks cohérents, targetId exact. Extrait :', JSON.stringify({ deepDives: doc1.deepDives, deepDiveLinks: para1.deepDiveLinks }));

    // ══════════════════════════════════════════════════════════════════════
    // 2. FILET DÉFENSIF — un targetId inventé (aucune entrée deepDives correspondante) doit être
    //    retiré SILENCIEUSEMENT du bloc à la conversion, jamais un crash, jamais un rejet du bloc.
    // ══════════════════════════════════════════════════════════════════════
    currentInput = {
      title: 'Le stress chronique (variante)', purpose: 'formation', audience: 'praticien',
      cards: [{
        title: 'Diapositive avec lien orphelin', coverImageQuery: '', coverImageAlt: '',
        blocks: [
          flatBlock({ type: 'paragraph', text: 'Un texte tout à fait normal, sans rapport.', deepDiveLinks: [{ text: 'cortisol', targetId: 'deepdive-INEXISTANT' }] }),
          flatBlock({ type: 'heading', text: 'Titre de section', level: 2 }),
        ],
      }],
      deepDives: [],
    };
    const result2 = await runGeneration(page, currentInput, 'deepdive-orphan');
    assert.ok(result2.key, 'un artefact doit être créé même avec un targetId orphelin (jamais un crash)');
    const doc2 = result2.doc;
    assert.equal(doc2.blocks.length, 1, 'la diapositive doit être conservée entière (jamais rejetée pour un seul lien orphelin)');
    const cardBlocks2 = doc2.blocks[0].content.blocks;
    assert.equal(cardBlocks2.length, 2, 'les 2 blocs de la diapositive doivent être conservés');
    const para2 = cardBlocks2[0];
    assert.equal(para2.type, 'paragraph');
    assert.equal(para2.content.text, 'Un texte tout à fait normal, sans rapport.', 'le texte du bloc reste parfaitement exploitable');
    assert.ok(!para2.deepDiveLinks, 'deepDiveLinks doit être entièrement OMIS (le lien orphelin a été retiré, aucune clé vide laissée)');
    assert.ok(!doc2.deepDives, 'doc.deepDives doit être OMIS quand aucune page d\'approfondissement exploitable n\'a été produite');
    console.log('PASS 2/3 — filet défensif confirmé : targetId orphelin retiré silencieusement, bloc et diapositive conservés intacts, aucun crash.');

    // ══════════════════════════════════════════════════════════════════════
    // 3. RÉGRESSION — un document SANS aucun approfondissement (cas normal) reste STRICTEMENT
    //    inchangé : ni doc.deepDives, ni deepDiveLinks sur aucun bloc.
    // ══════════════════════════════════════════════════════════════════════
    currentInput = {
      title: 'Présentation ordinaire', purpose: 'formation', audience: 'praticien',
      cards: [{
        title: 'Diapositive normale', coverImageQuery: '', coverImageAlt: '',
        blocks: [
          flatBlock({ type: 'heading', text: 'Introduction', level: 2 }),
          flatBlock({ type: 'paragraph', text: 'Un paragraphe tout à fait ordinaire.' }),
          flatBlock({ type: 'list', items: ['Premier point', 'Second point'], ordered: false }),
        ],
      }],
      deepDives: [],
    };
    const result3 = await runGeneration(page, currentInput, 'deepdive-none');
    assert.ok(result3.key, 'un artefact doit être créé normalement');
    const doc3 = result3.doc;
    assert.ok(!doc3.deepDives, 'doc.deepDives doit être absent (comportement strictement inchangé) quand aucun approfondissement n\'est utilisé');
    doc3.blocks[0].content.blocks.forEach((b) => {
      assert.ok(!b.deepDiveLinks, 'aucun bloc ne doit porter deepDiveLinks pour un document sans approfondissement — bloc : ' + b.type);
    });
    console.log('PASS 3/3 — non-régression confirmée : un document sans approfondissement reste strictement inchangé (aucun champ deepDives/deepDiveLinks ajouté).');

    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant tout le scénario');
    console.log('\nTOUS LES TESTS PHASE 1 LIENS D\'APPROFONDISSEMENT PASSENT (3/3)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
