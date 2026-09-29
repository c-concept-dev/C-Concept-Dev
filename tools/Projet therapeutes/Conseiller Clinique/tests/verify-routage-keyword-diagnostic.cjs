// STUDIO CLINIQUE — Correctif routage structuré/Legacy : filet de sécurité par mot-clé
// (diagnostic uniquement, jamais un correctif actif) — vérification RÉELLE en navigateur
// (Playwright) du log '[ROUTAGE structuré/Legacy]' (adocRunGenerationPipeline,
// studio-clinique-core.js), enrichi ce lot de deux champs (_keywordDetectedIntent,
// _intentKeywordMismatch) réutilisant EXACTEMENT les règles de adocBuildFallbackPlan
// (adocDetectIntentKeyword, extraite pour être partagée).
//
// CONTEXTE (cf. rapport d'investigation) — sans type explicitement cliqué à l'écran d'accueil,
// tout le routage structuré/Legacy dépend de plan.intent, une classification libre du
// planificateur LLM, SANS AUCUN filet de sécurité déterministe une fois cette classification
// reçue (le seul filet existant, adocBuildFallbackPlan, ne sert QUE si le planificateur échoue
// intégralement). Option retenue à l'issue de l'investigation (0E, documentée dans le code et le
// rapport) : enrichir CE log existant pour rendre l'écart mesurable, JAMAIS forcer
// silencieusement le routage — au moins 2 des 5 mots-clés structurés ("tableau", "liens") sont du
// vocabulaire clinique courant sans rapport avec une demande de type de document ("tableau
// clinique", "liens d'attachement"), ce qu'une simple recherche de sous-chaîne ne peut pas
// distinguer d'une vraie demande de document Tableau/Liens transversaux.
//
// 4 scénarios : (1) le cas réel visé (mauvaise classification simulée, mot-clé fort présent) —
// le log doit signaler l'écart, le routage reste inchangé (jamais forcé) ; (2) non-régression —
// une classification CORRECTE continue de fonctionner à l'identique, log sans écart signalé ;
// (3) preuve du risque inverse (point 3 de l'investigation) — un mot-clé clinique coïncident
// ("tableau clinique") ne doit JAMAIS faire basculer le routage, même si le log le signale ;
// (4) un type explicitement cliqué reste seul maître, totalement insensible à ce diagnostic.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}

// Réponse texte minimale, sans aucun outil appelé — sert à la fois pour l'appel de décision
// (tool_choice:'auto', moteur structuré) et pour le round Legacy quand aucune recherche (HAL/web)
// n'est déclenchée par le modèle simulé : hors périmètre de ce lot (déjà couvert par
// verify-hal-integration-dom.cjs), volontairement absent ici pour rester focalisé sur le seul
// diagnostic de routage.
function plainTextEndTurnSSE(text) {
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ]);
}

// Bloc tool_use minimal valide générique — même forme de bloc (type/text/level/visualRole/items/
// ordered/headers/rows/imageQuery/imageAlt/citationEntryIds) partagée par les 5 outils structurés
// (emit_fiche_document/emit_carrousel_document/emit_script_document/emit_tableau_document/
// emit_liens_document, cf. ADOC_STRUCTURED_PROFILES) — le nom exact de l'outil est repris tel
// quel depuis tool_choice.name de la requête reçue, jamais deviné.
function structuredToolUseSSE(toolName) {
  const input = JSON.stringify({
    title: 'Document test', purpose: 'information', audience: 'clinicien',
    blocks: [{ type: 'paragraph', text: 'Contenu minimal.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] }],
  });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_generic', name: toolName } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

async function runScenario(page, { text, plan, succeedStructured, precomputedRag }) {
  await page.unroute('**/*');
  await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
  const anthropicCalls = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch {}
    if (url.endsWith('/search-academic-studies')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
    }
    if (body.payload) {
      anthropicCalls.push(body.payload);
      if (body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
        if (succeedStructured) {
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: structuredToolUseSSE(body.payload.tool_choice.name) });
        }
        // Échec délibéré de l'appel forcé — hors périmètre de ce test (déjà couvert ailleurs) :
        // déclenche le repli déjà existant vers le moteur Legacy, qui conclut ensuite normalement
        // via la branche ci-dessous (aucun outil appelé). Le log de routage, lui, a déjà été émis
        // AVANT cette tentative — jamais affecté par ce qui se passe après.
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: plainTextEndTurnSSE('Réponse.') });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.evaluate(async ({ text, plan, precomputedRag }) => {
    const typingId = 'typing-routage-diag';
    const area = document.getElementById('adoc-messages');
    const el = document.createElement('div');
    el.id = typingId;
    el.innerHTML = '<div class="adoc-bubble"></div>';
    area.appendChild(el);
    await window.adocRunGenerationPipeline(text, plan, typingId, 'https://clone-proxy.test.local', precomputedRag || null);
  }, { text, plan, precomputedRag });

  const routageLogs = await page.evaluate(() => window.__routageLogs || []);
  assert.equal(routageLogs.length, 1, `exactement 1 log '[ROUTAGE structuré/Legacy]' attendu par scénario, obtenu ${routageLogs.length}`);
  return { log: routageLogs[0], anthropicCalls };
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Capture du log de routage DEPUIS LE CODE PAGE (jamais via l'événement 'console' de
    // Playwright, sujet à une course avec jsonValue() asynchrone) — réappliqué automatiquement
    // par Playwright à chaque page.goto() suivant, remis à zéro à chaque rechargement.
    await page.addInitScript(() => {
      window.__routageLogs = [];
      const _origLog = console.log.bind(console);
      console.log = function(...args) {
        if (args[0] === '[ROUTAGE structuré/Legacy]') window.__routageLogs.push(args[1]);
        return _origLog(...args);
      };
    });

    // ── Scénario 1 — cas réel visé : mauvaise classification simulée (intent='chat', invérifiable
    //      depuis cette session sans appel réel au planificateur, cf. rapport) alors que le texte
    //      contient un mot-clé structuré fort ("script"). Le log doit signaler l'écart ; le
    //      routage lui-même reste STRICTEMENT inchangé (jamais forcé vers le structuré). ──
    {
      const { log } = await runScenario(page, {
        text: 'Fais-moi un script verbatim à lire ou adapter en séance sur la gestion du stress.',
        plan: { needs_rag: false, intent: 'chat', _formatClarityResolved: true },
        succeedStructured: false,
      });
      assert.equal(log['plan.intent'], 'chat');
      assert.equal(log._hasExplicitKind, false);
      assert.equal(log._structuredAttemptKind, 'chat', 'le routage réel ne doit JAMAIS être forcé par ce diagnostic — reste "chat" tel que classifié');
      assert.equal(log._shouldAttemptStructured, false, 'aucune tentative structurée ne doit être déclenchée — comportement strictement inchangé');
      assert.equal(log._keywordDetectedIntent, 'script', 'le mot-clé "script" doit être détecté par adocDetectIntentKeyword');
      assert.equal(log._intentKeywordMismatch, true, "l'écart doit être signalé : mot-clé structuré détecté mais routage resté sur 'chat'");
      console.log('PASS 1/4 — CAS RÉEL : mauvaise classification simulée avec mot-clé structuré fort — écart signalé dans le log, routage réel JAMAIS forcé (option diagnostic, pas correctif actif).');
    }

    // ── Scénario 2 — NON-RÉGRESSION : classification CORRECTE (intent='script' cette fois) —
    //      le diagnostic ne doit signaler AUCUN écart, et la tentative structurée doit se
    //      dérouler exactement comme avant ce lot (succès réel simulé, preuve que le nouveau
    //      code n'interfère pas avec le chemin déjà fonctionnel). ──
    {
      // needs_rag:true + precomputedRag (1 chunk réel) — la génération structurée exige au moins
      // un passage RAG pour sourcer un document (garde-fou existant, sans rapport avec ce lot) ;
      // needs_rag:false (utilisé aux autres scénarios, où le structuré n'est jamais réellement
      // tenté) ferait échouer ce scénario-ci AVANT tout appel réseau, empêchant de prouver que la
      // tentative structurée a bien eu lieu. topic_summary volontairement absent pour éviter tout
      // appel réseau d'enrichissement de recherche, hors périmètre de ce test.
      const { log, anthropicCalls } = await runScenario(page, {
        text: 'Fais-moi un script verbatim à lire ou adapter en séance sur la gestion du stress.',
        plan: { needs_rag: true, intent: 'script', _formatClarityResolved: true },
        precomputedRag: { chunks: [{ content: 'Passage de bibliothèque sur la gestion du stress.', book_title: 'Livre Test', author: 'Auteur Test', page_number: 12, _score: 0.9 }] },
        succeedStructured: true,
      });
      assert.equal(log._structuredAttemptKind, 'script');
      assert.equal(log._shouldAttemptStructured, true);
      assert.equal(log._keywordDetectedIntent, 'script');
      assert.equal(log._intentKeywordMismatch, false, 'classification déjà correcte — aucun écart à signaler');
      assert.ok(anthropicCalls.some((p) => p.tool_choice && p.tool_choice.type === 'tool' && p.tool_choice.name === 'emit_script_document'),
        'la tentative structurée réelle doit avoir eu lieu (appel forcé emit_script_document), comportement inchangé');
      console.log('PASS 2/4 — NON-RÉGRESSION : classification correcte — aucun écart signalé, tentative structurée réelle inchangée (succès simulé, appel forcé emit_script_document confirmé).');
    }

    // ── Scénario 3 — PREUVE DU RISQUE INVERSE (investigation, point 3) : un mot-clé clinique
    //      COURANT ("tableau" dans "tableau clinique") apparaît dans un texte qui n'a RIEN d'une
    //      demande de document Tableau — classification 'chat' correcte. Le diagnostic peut
    //      signaler l'écart (mesure honnête), mais NE DOIT JAMAIS faire basculer le routage :
    //      c'est exactement la raison pour laquelle l'option "correctif actif" a été écartée. ──
    {
      const { log } = await runScenario(page, {
        text: "Le tableau clinique du patient s'est nettement aggravé cette semaine, avec une majoration des idées noires.",
        plan: { needs_rag: false, intent: 'chat', _formatClarityResolved: true },
        succeedStructured: false,
      });
      assert.equal(log._keywordDetectedIntent, 'tableau', 'détection naïve par sous-chaîne : "tableau" est bien repéré, comme prévu par l\'investigation');
      assert.equal(log._intentKeywordMismatch, true, "l'écart est signalé (mesure honnête) — mais ne doit jamais devenir une action");
      assert.equal(log._structuredAttemptKind, 'chat', 'AUCUN forçage : "tableau clinique" ne doit jamais devenir une tentative de document Tableau');
      assert.equal(log._shouldAttemptStructured, false, 'routage réel resté conversationnel — preuve que le risque inverse identifié ne se matérialise pas avec l\'option retenue');
      console.log('PASS 3/4 — RISQUE INVERSE CONFIRMÉ SANS DOMMAGE : "tableau clinique" (vocabulaire clinique courant, aucun rapport avec un document Tableau) signalé dans le log mais JAMAIS forcé — validation du choix de l\'option diagnostic plutôt que correctif actif.');
    }

    // ── Scénario 4 — un type EXPLICITEMENT cliqué à l'écran d'accueil (documentKind) reste seul
    //      maître, totalement insensible à ce diagnostic — _keywordDetectedIntent doit rester
    //      null (jamais calculé pour ce cas), comportement strictement inchangé (investigation,
    //      point 4). ──
    {
      const { log } = await runScenario(page, {
        text: 'Peux-tu détailler ce point pour la séance de mardi ?',
        plan: { needs_rag: false, documentKind: 'tableau', intent: 'chat', _formatClarityResolved: true },
        succeedStructured: false,
      });
      assert.equal(log._hasExplicitKind, true);
      assert.equal(log._structuredAttemptKind, 'tableau', 'documentKind explicite reste seul maître, intent ("chat") totalement ignoré — comportement inchangé');
      assert.equal(log._keywordDetectedIntent, null, 'le diagnostic ne doit JAMAIS être calculé quand un type est explicitement cliqué');
      assert.equal(log._intentKeywordMismatch, false);
      console.log('PASS 4/4 — TYPE EXPLICITE INTACT : un documentKind cliqué reste seul maître du routage, ce diagnostic ne le concerne jamais (_keywordDetectedIntent toujours null dans ce cas).');
    }

    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant les quatre scénarios');
    console.log('\nTOUS LES TESTS DIAGNOSTIC ROUTAGE (filet de sécurité par mot-clé) PASSENT (4/4)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
