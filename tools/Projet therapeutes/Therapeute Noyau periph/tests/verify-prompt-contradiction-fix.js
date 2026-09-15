// Axe 1 (audit Codex) — inspecte le VRAI prompt système envoyé à l'appel 2 (sortie structurée
// forcée) après le correctif, en interceptant réellement la requête réseau (jamais une
// supposition). Confirme l'absence de toute instruction de format HTML autonome, et la présence
// des instructions de ton/qualité générales.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
];

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}
const MOCK_TOOL_INPUT = { title: 'Fiche test', purpose: 'test', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Contenu.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] }] };
function mockToolResponseSSE() {
  const inputJson = JSON.stringify(MOCK_TOOL_INPUT);
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 50 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let capturedAppel2System = null;
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) {}
      const p = parsed.payload || {};
      if (p.tool_choice && p.tool_choice.name === 'emit_fiche_document') {
        capturedAppel2System = p.system;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE() });
        return;
      }
      if (p.tool_choice && p.tool_choice.type === 'auto') {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') });
        return;
      }
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  await page.evaluate(async ({ chunks }) => {
    const ragResult = { chunks, chunkLen: 900 };
    // Construit le VRAI systemPrompt "legacy" (pollué, tel qu'utilisé pour le moteur ancien) —
    // sert de témoin pour prouver que le correctif s'applique bien à un prompt qui contenait
    // réellement la contradiction avant d'être reconstruit pour l'appel structuré.
    const legacyPollutedPrompt = window.adocBuildSystemPrompt('', '', { intent: 'fiche', output_format: 'html' }, null);
    window.__legacyPollutedPrompt = legacyPollutedPrompt;
    // Prompt réellement utilisé par adocGenerateStructuredFiche après le correctif — construit ICI
    // exactement comme le fait maintenant window.adocSend (opts.forStructuredTool: true).
    const structuredPrompt = window.adocBuildSystemPrompt('', '', { intent: 'fiche', output_format: 'html' }, null, { forStructuredTool: true });
    await window.adocGenerateStructuredFiche('Fais-moi une fiche sur les cavaliers de Gottman', { intent: 'fiche' }, ragResult, structuredPrompt, 'https://clone-proxy.11drumboy11.workers.dev');
  }, { chunks: MOCK_RAG_CHUNKS });

  const legacyPollutedPrompt = await page.evaluate(() => window.__legacyPollutedPrompt);

  console.log('=== TÉMOIN — le prompt "legacy" (non corrigé) contient bien la contradiction ===');
  console.log('Contient DOCTYPE:', legacyPollutedPrompt.includes('<!DOCTYPE html>'));
  console.log('Contient charte CSS (--mer):', legacyPollutedPrompt.includes('--mer:'));
  console.log('Contient le script plein écran:', legacyPollutedPrompt.includes('zoom-in'));
  console.log('=> Confirme que la contradiction est réelle et mesurable dans le prompt AVANT correctif, sur ce même plan (intent=fiche):',
    legacyPollutedPrompt.includes('<!DOCTYPE html>') && legacyPollutedPrompt.includes('--mer:') && legacyPollutedPrompt.includes('zoom-in'));

  console.log('\n=== PROMPT RÉEL envoyé à l\'appel 2 (capturé sur le VRAI réseau intercepté) ===');
  console.log('Longueur:', capturedAppel2System ? capturedAppel2System.length : null);
  const checks = {
    noDoctype: !capturedAppel2System.includes('<!DOCTYPE'),
    noHtmlTag: !capturedAppel2System.includes('<html'),
    noCssVars: !capturedAppel2System.includes('--mer:') && !capturedAppel2System.includes(':root'),
    noFullscreenScript: !capturedAppel2System.includes('zoom-in') && !capturedAppel2System.includes('<script>'),
    noPhotoCtxHtmlImg: !capturedAppel2System.includes('data-pexels='),
    noFormatContractHeader: !capturedAppel2System.includes('── CONTRAT DE SORTIE ──'),
    // Instructions génériques de ton/qualité — doivent RESTER présentes.
    hasPosture: capturedAppel2System.includes('TA POSTURE FONDAMENTALE'),
    hasQualityStandard: capturedAppel2System.includes('STANDARD DE QUALITÉ POUR LES LIVRABLES'),
    hasAntiEmojiRule: capturedAppel2System.includes('emoji'),
    hasToolInstruction: capturedAppel2System.includes('emit_fiche_document'),
  };
  console.log(checks);
  console.log('=> AUCUNE instruction de format HTML autonome dans le prompt réel de l\'appel 2:',
    checks.noDoctype && checks.noHtmlTag && checks.noCssVars && checks.noFullscreenScript && checks.noPhotoCtxHtmlImg && checks.noFormatContractHeader);
  console.log('=> Instructions de ton/qualité générales TOUJOURS présentes:',
    checks.hasPosture && checks.hasQualityStandard && checks.hasAntiEmojiRule);
  console.log('=> Instruction d\'outil forcé (partie déjà correcte) toujours présente:', checks.hasToolInstruction);

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
