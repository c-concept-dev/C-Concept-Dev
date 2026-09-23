// STUDIO CLINIQUE — Intégration HAL comme 4e pilier (bibliothèque + web + IA + HAL) —
// vérification RÉELLE en navigateur (Playwright) de la boucle de rounds tool_use/tool_result
// ajoutée à adocGenerateStructuredDocument (studio-clinique-core.js). Le vrai réseau vers
// api.anthropic.com et api.archives-ouvertes.fr est inatteignable depuis cette session (le
// premier coûterait une vraie génération payante, le second est bloqué par l'egress de
// l'environnement, confirmé) — les DEUX sont donc interceptés via page.route(), mais le CODE
// exécuté (parsing SSE, construction des messages, appel réel à /search-academic-studies,
// application du plafond) est le vrai code du fichier, jamais réimplémenté ni contourné.
//
// Cas réel visé par le CDC : requête clinique sur les "modes" thérapeutiques dans un contexte de
// coping dyadique — HAL a déjà montré une vraie pépite en test réel (Bodenmann). Ce test simule
// fidèlement le protocole (le modèle demande une recherche HAL, reçoit un résultat réel-shaped,
// peut continuer) SANS pouvoir vérifier le jugement du vrai modèle sur la pertinence (hors de
// portée sans appel réel à Claude) — ce que ce test PROUVE mécaniquement : le round-trip
// fonctionne, le plafond de citations est réellement appliqué côté client (jamais seulement une
// instruction), et le complément HAL atteint bien le second appel (génération du document).
//
// PARITÉ DES MOTEURS (lot "Script verbatim") — scénarios 3 et 4 : mêmes preuves mécaniques que
// 1 et 2, mais sur adocRunGenerationPipeline (moteur Legacy "[Mixte]"), qui gérait jusqu'ici
// "Script verbatim à lire ou adapter en séance" (et tout autre document sans type explicite mal
// classifié par le planificateur, cf. rapport d'investigation) SANS jamais avoir accès à HAL —
// zéro citation HAL possible sur ce chemin quel que soit le jugement du modèle. La classification
// EXACTE retournée cette nuit-là par le vrai planificateur LLM reste invérifiable depuis cette
// session (aucun appel réel à Claude possible ici) — ces scénarios ne reproduisent donc pas LE
// MÉCANISME de la mauvaise classification, mais reproduisent fidèlement LE SYMPTÔME observé
// (le moteur Legacy traitant ce texte, plan.intent non câblé au structuré) et PROUVENT le
// correctif réel : ce même chemin dispose désormais du round-trip HAL complet, avec le même outil
// (ADOC_HAL_SEARCH_TOOL), la même fonction d'appel (_adocCallHalSearch, jamais dupliquée) et le
// même plafond (ADOC_HAL_SEARCH_CAP) que le moteur structuré.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}
// Bloc tool_use minimal valide pour emit_fiche_document (appel 2, forcé) — un seul bloc
// paragraphe, aucune citation (le test ne porte pas sur le sourcing bibliothèque).
function ficheToolUseSSE() {
  const input = JSON.stringify({ title: 'Fiche test HAL', blocks: [{ type: 'paragraph', text: 'Contenu minimal.' }] });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_fiche', name: 'emit_fiche_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    // ── Scénario 1 — cas réel reproduit : une recherche HAL, résultat pertinent + résultat de
    //      bruit hors-champ (le piège "couple" — droit/sociologie), plafond non atteint. ──
    {
      const halCalls = [];
      const anthropicCalls = [];
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith('file:')) return route.continue();
        let body = {};
        try { body = route.request().postDataJSON() || {}; } catch {}
        if (url.endsWith('/search-academic-studies')) {
          halCalls.push(body);
          return route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ results: [
              { halId: 'halshs-01', title: 'Coping dyadique et satisfaction conjugale', authors: ['Guy Bodenmann'], docType: 'ART', date: '2005', url: 'https://hal.science/halshs-01', fullTextAvailable: true },
              { halId: 'halshs-02', title: 'Le couple devant le juge aux affaires familiales', authors: ['Un Juriste'], docType: 'ART', date: '2012', url: 'https://hal.science/halshs-02', fullTextAvailable: false },
            ] }),
          });
        }
        if (body.payload) {
          anthropicCalls.push(body.payload);
          // Appel 2 (tool_choice forcé emit_fiche_document) reconnu SANS AMBIGUÏTÉ par
          // tool_choice.type==='tool' — vérifié EN PREMIER : son premier message a aussi
          // messages.length===1, comme le round 1 de l'appel 1 (décision) ci-dessous, donc jamais
          // distinguable par le seul nombre de messages.
          if (body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ficheToolUseSSE() });
          }
          const nMsg = (body.payload.messages || []).length;
          // Round 1 (1 message : la requête initiale) → le modèle demande une recherche HAL.
          if (nMsg === 1) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_hal1', name: 'search_academic_studies' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query": "Bodenmann coping dyadique"}' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
              { type: 'message_stop' },
            ]) });
          }
          // Round 2 (3 messages : + assistant tool_use + user tool_result) → accusé final, fin.
          if (nMsg === 3) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Appui HAL trouvé.' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
              { type: 'message_stop' },
            ]) });
          }
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      const result = await page.evaluate(async () => {
        const ragResult = { chunks: [{ content: 'Passage de bibliothèque sur les modes thérapeutiques.', book_title: 'Livre Test', author: 'Auteur Test', page_number: 12, _score: 0.9 }] };
        const doc = await window.adocGenerateStructuredDocument('fiche', 'Quels sont les modes thérapeutiques en coping dyadique ?', {}, ragResult, 'Système de base.', 'https://clone-proxy.test.local', 'typing-1');
        return { halSearchCount: window._adocLastStructAttemptMetrics.halSearchCount, doc: !!doc };
      });

      assert.equal(halCalls.length, 1, `exactement 1 appel réel à /search-academic-studies attendu, obtenu ${halCalls.length}`);
      assert.match(halCalls[0].query, /Bodenmann|coping dyadique/i, 'la query envoyée à HAL doit refléter la demande du modèle, jamais une valeur inventée par le client');
      assert.equal(result.halSearchCount, 1, 'le traceur persistant halSearchCount doit refléter le vrai nombre de recherches HAL effectuées');
      assert.ok(result.doc, 'la génération doit aboutir à un document malgré le round-trip HAL intercalé');

      // Round 2 doit bien porter le tool_result avec les résultats réels reçus (y compris le
      // bruit hors-champ — le filtrage de PERTINENCE réel appartient au modèle, jamais retiré
      // mécaniquement par le client : c'est le rôle du garde-fou 2, une instruction, pas un filtre
      // côté code).
      const round2 = anthropicCalls.find((p) => (p.messages || []).length === 3);
      assert.ok(round2, 'un appel round 2 (3 messages) doit avoir été envoyé après le tool_result HAL');
      const toolResultMsg = round2.messages[2];
      assert.equal(toolResultMsg.role, 'user');
      const toolResultContent = JSON.parse(toolResultMsg.content[0].content);
      assert.ok(toolResultContent.some((r) => r.title.includes('Bodenmann') || r.title.includes('Coping')), 'le tool_result doit contenir le résultat pertinent réel reçu de HAL');
      assert.ok(toolResultContent.some((r) => r.title.includes('juge aux affaires familiales')), 'le tool_result doit AUSSI contenir le bruit hors-champ tel quel (le client ne filtre jamais mécaniquement — seule l\'instruction du modèle, garde-fou 2, doit l\'écarter)');

      // Vérifie que le second appel (génération du document) reçoit bien le complément HAL —
      // sinon le modèle n'aurait tout simplement aucun moyen de citer l'étude.
      const call2 = anthropicCalls.find((p) => p.tool_choice && p.tool_choice.type === 'tool');
      assert.ok(call2, 'un appel avec tool_choice forcé (génération du document) doit avoir eu lieu');
      const systemText = Array.isArray(call2.system) ? call2.system.map((s) => s.text || '').join('\n') : String(call2.system || '');
      assert.match(systemText, /COMPLÉMENT ACADÉMIQUE HAL/, 'le second appel doit recevoir le complément HAL dans son system prompt');
      assert.match(systemText, /Bodenmann|Coping dyadique/, 'le complément HAL doit contenir le résultat réel reçu, jamais un texte générique');

      console.log('PASS 1/2 — cas réel reproduit : round-trip tool_use/tool_result HAL fonctionne mécaniquement (1 appel réel à /search-academic-studies, query réelle transmise, résultat réel — pertinent ET bruit — atteint le tool_result puis le complément HAL du second appel).');
    }

    // ── Scénario 2 — plafond de citations (garde-fou 3) : le modèle redemande une recherche HAL
    //      4 fois de suite ; seules 3 doivent réellement interroger HAL, la 4e reçoit un refus
    //      explicite SANS appel réseau, et le modèle a bien l'occasion de conclure ensuite. ──
    {
      const halCalls = [];
      let toolResultSeenAtCap = null;
      await page.unroute('**/*');
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith('file:')) return route.continue();
        let body = {};
        try { body = route.request().postDataJSON() || {}; } catch {}
        if (url.endsWith('/search-academic-studies')) {
          halCalls.push(body);
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ halId: 'x', title: 'Étude ' + halCalls.length, authors: [], docType: 'ART', date: '2020', url: 'https://hal.science/x', fullTextAvailable: false }] }) });
        }
        if (body.payload) {
          const nMsg = (body.payload.messages || []).length;
          if (body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ficheToolUseSSE() });
          }
          // Requêtes 1/2/3/4 (messages impairs 1,3,5,7) : le modèle redemande TOUJOURS une
          // recherche HAL, 4 fois de suite — teste le plafond à 3. La requête 4 (nMsg=7) est
          // celle où le modèle demande sa 4e recherche ; l'application, en la traitant, doit
          // refuser SANS appel réel (halSearchCount déjà à 3) et joindre ce refus au tool_result
          // envoyé dans la requête SUIVANTE (nMsg=9) — capturé ci-dessous à ce moment précis,
          // jamais avant (le refus n'existe pas encore au moment où la requête 4 elle-même est
          // reçue : il n'est produit qu'APRÈS la réponse mockée ci-dessous, côté client).
          const halRoundIndex = (nMsg - 1) / 2; // 0,1,2,3 pour nMsg=1,3,5,7
          if (nMsg === 9) {
            const lastMsg = body.payload.messages[body.payload.messages.length - 1];
            toolResultSeenAtCap = lastMsg.content[0].content;
          }
          if (nMsg % 2 === 1 && halRoundIndex < 4) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_hal_' + halRoundIndex, name: 'search_academic_studies' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query": "recherche ' + halRoundIndex + '"}' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
              { type: 'message_stop' },
            ]) });
          }
          // Round final — le modèle conclut (preuve qu'il a bien reçu une occasion de le faire
          // après le refus, cf. budget de rounds ADOC_CALL1_MAX_ROUNDS).
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Conclusion après plafond.' } },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
            { type: 'message_stop' },
          ]) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      const result = await page.evaluate(async () => {
        const ragResult = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
        const doc = await window.adocGenerateStructuredDocument('fiche', 'Question quelconque.', {}, ragResult, 'Système.', 'https://clone-proxy.test.local', 'typing-2');
        return { halSearchCount: window._adocLastStructAttemptMetrics.halSearchCount, doc: !!doc };
      });

      assert.equal(halCalls.length, 3, `le plafond doit limiter à 3 appels RÉELS à /search-academic-studies (garde-fou 3, appliqué côté client, jamais une 4e requête réseau), obtenu ${halCalls.length}`);
      assert.equal(result.halSearchCount, 3, 'halSearchCount doit plafonner exactement à 3, jamais plus');
      assert.ok(toolResultSeenAtCap && /[Pp]lafond/.test(toolResultSeenAtCap) && /3/.test(toolResultSeenAtCap), 'la 4e demande du modèle doit recevoir un tool_result de refus EXPLICITE (jamais un silence), mentionnant le plafond de 3');
      assert.ok(result.doc, 'le modèle doit avoir l\'occasion de conclure après le refus (budget de rounds suffisant) — sans cela, la génération resterait bloquée sans jamais produire de document');

      console.log('PASS 2/2 — plafond de citations (garde-fou 3) réellement appliqué côté client : 3 appels HAL réels maximum, 4e demande refusée explicitement sans appel réseau, le modèle conclut normalement ensuite.');
    }

    // ── Scénario 3 — PARITÉ DES MOTEURS : reproduction directe de la demande de Christophe
    //      ("Script verbatim à lire ou adapter en séance") traitée par le moteur LEGACY (aucun
    //      documentKind explicite, intent non câblé au structuré — reproduit le SYMPTÔME observé,
    //      pas le mécanisme exact de classification du planificateur, invérifiable ici). Une seule
    //      recherche HAL, plafond non atteint. ──
    {
      const halCalls = [];
      const anthropicCalls = [];
      await page.unroute('**/*');
      // Rechargement de page — adocConversations (historique de chat) est un état de module
      // persistant, jamais réinitialisé entre deux appels de adocRunGenerationPipeline (à
      // l'inverse de adocGenerateStructuredDocument, autonome, scénarios 1/2 ci-dessus) : sans ce
      // rechargement, ce scénario Legacy croirait reprendre une conversation déjà commencée,
      // faussant le nombre de messages attendu à chaque round.
      await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith('file:')) return route.continue();
        let body = {};
        try { body = route.request().postDataJSON() || {}; } catch {}
        if (url.endsWith('/search-academic-studies')) {
          halCalls.push(body);
          return route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ results: [
              { halId: 'halshs-colere-01', title: 'Régulation de la colère à l\'adolescence : approches cliniques', authors: ['Un Auteur'], docType: 'ART', date: '2018', url: 'https://hal.science/halshs-colere-01', fullTextAvailable: true },
            ] }),
          });
        }
        if (body.payload) {
          anthropicCalls.push(body.payload);
          const nMsg = (body.payload.messages || []).length;
          // Round 1 (1 message : la requête initiale) → le modèle demande une recherche HAL.
          if (nMsg === 1) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Je vérifie un appui académique avant de rédiger le script. ' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_hal_legacy1', name: 'search_academic_studies' } },
              { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query": "régulation colère adolescent"}' } },
              { type: 'content_block_stop', index: 1 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
              { type: 'message_stop' },
            ]) });
          }
          // Round 2 (3 messages : + assistant tool_use + user tool_result) → script final.
          if (nMsg === 3) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Script verbatim rédigé, appuyé sur une étude réelle (halshs-colere-01).' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
              { type: 'message_stop' },
            ]) });
          }
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      await page.evaluate(async () => {
        const typingId = 'typing-legacy-3';
        const area = document.getElementById('adoc-messages');
        const el = document.createElement('div');
        el.id = typingId;
        el.innerHTML = '<div class="adoc-bubble"></div>';
        area.appendChild(el);
        // needs_rag:false — évite tout appel réseau supplémentaire (recherche bibliothèque),
        // hors du périmètre de ce test. Ni documentKind ni intent câblé au structuré ('chat')
        // + _formatClarityResolved:true (évite la porte de clarté de format, déjà résolue en
        // amont dans le vrai pipeline) : garantit le passage par le moteur Legacy, exactement le
        // chemin emprunté par la vraie demande de Christophe ce soir-là.
        const plan = { needs_rag: false, intent: 'chat', _formatClarityResolved: true };
        await window.adocRunGenerationPipeline(
          'Script verbatim à lire ou adapter en séance sur la gestion de la colère chez l\'adolescent.',
          plan, typingId, 'https://clone-proxy.test.local', null
        );
      });

      assert.equal(halCalls.length, 1, `exactement 1 appel réel à /search-academic-studies attendu depuis le moteur Legacy, obtenu ${halCalls.length}`);
      assert.match(halCalls[0].query, /col[eè]re/i, 'la query envoyée à HAL doit refléter la demande du modèle, jamais une valeur inventée par le client');
      assert.ok(anthropicCalls.length >= 2, 'au moins 2 appels Anthropic attendus (round 1 décision/HAL + round 2 conclusion)');
      assert.ok(anthropicCalls.every((p) => !(p.tool_choice && p.tool_choice.type === 'tool')), 'le moteur Legacy ne force JAMAIS tool_choice (architecture single-call historique conservée, contrairement aux 2 appels du moteur structuré)');
      assert.ok(anthropicCalls[0].tools.some((t) => t.name === 'search_academic_studies'), 'PARITÉ DES MOTEURS : le premier appel Legacy doit exposer search_academic_studies exactement comme web_search — HAL ne doit plus être réservé au moteur structuré');
      assert.ok(anthropicCalls[0].tools.some((t) => t.name === 'web_search'), 'web_search doit rester disponible en parallèle de HAL, comportement inchangé');
      const round2 = anthropicCalls.find((p) => (p.messages || []).length === 3);
      assert.ok(round2, 'un appel round 2 (3 messages) doit avoir été envoyé après le tool_result HAL');
      const toolResultMsg = round2.messages[2];
      assert.equal(toolResultMsg.role, 'user');
      const toolResultContent = JSON.parse(toolResultMsg.content[0].content);
      assert.ok(toolResultContent.some((r) => r.title.includes('colère')), 'le tool_result reçu par le round 2 doit contenir le résultat HAL réel reçu par le round 1');

      console.log('PASS 3/4 — PARITÉ DES MOTEURS : le moteur Legacy (adocRunGenerationPipeline), qui traitait "Script verbatim" sans aucun accès HAL, exécute désormais le même round-trip tool_use/tool_result que le moteur structuré (1 appel réel HAL, query réelle, tool_result transmis).');
    }

    // ── Scénario 4 — PARITÉ DES MOTEURS : plafond de citations (garde-fou 3) sur le moteur
    //      Legacy — même comportement que le scénario 2 (structuré), même valeur de plafond
    //      (ADOC_HAL_SEARCH_CAP, partagée entre les deux moteurs, jamais une constante séparée). ──
    {
      const halCalls = [];
      let toolResultSeenAtCap = null;
      await page.unroute('**/*');
      // Même raison qu'au scénario 3 — adocConversations doit repartir de zéro pour que le
      // comptage de messages par round (nMsg) corresponde exactement à ce que ce scénario attend.
      await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith('file:')) return route.continue();
        let body = {};
        try { body = route.request().postDataJSON() || {}; } catch {}
        if (url.endsWith('/search-academic-studies')) {
          halCalls.push(body);
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ halId: 'y', title: 'Étude ' + halCalls.length, authors: [], docType: 'ART', date: '2021', url: 'https://hal.science/y', fullTextAvailable: false }] }) });
        }
        if (body.payload) {
          const nMsg = (body.payload.messages || []).length;
          const halRoundIndex = (nMsg - 1) / 2; // 0,1,2,3 pour nMsg=1,3,5,7
          if (nMsg === 9) {
            const lastMsg = body.payload.messages[body.payload.messages.length - 1];
            toolResultSeenAtCap = lastMsg.content[0].content;
          }
          if (nMsg % 2 === 1 && halRoundIndex < 4) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_hal_legacy_' + halRoundIndex, name: 'search_academic_studies' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query": "recherche legacy ' + halRoundIndex + '"}' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
              { type: 'message_stop' },
            ]) });
          }
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Conclusion Legacy après plafond.' } },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
            { type: 'message_stop' },
          ]) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      await page.evaluate(async () => {
        const typingId = 'typing-legacy-4';
        const area = document.getElementById('adoc-messages');
        const el = document.createElement('div');
        el.id = typingId;
        el.innerHTML = '<div class="adoc-bubble"></div>';
        area.appendChild(el);
        const plan = { needs_rag: false, intent: 'chat', _formatClarityResolved: true };
        await window.adocRunGenerationPipeline('Question quelconque.', plan, typingId, 'https://clone-proxy.test.local', null);
      });

      assert.equal(halCalls.length, 3, `le plafond doit limiter à 3 appels RÉELS à /search-academic-studies sur le moteur Legacy aussi, obtenu ${halCalls.length}`);
      assert.ok(toolResultSeenAtCap && /[Pp]lafond/.test(toolResultSeenAtCap) && /3/.test(toolResultSeenAtCap), 'la 4e demande du modèle doit recevoir un tool_result de refus EXPLICITE sur le moteur Legacy aussi, mentionnant le plafond de 3');

      console.log('PASS 4/4 — PARITÉ DES MOTEURS : plafond de citations HAL (garde-fou 3) réellement appliqué sur le moteur Legacy, même valeur (3) que le moteur structuré, jamais une seconde constante divergente.');
    }

    // ── Scénario 5 — PARITÉ CITATIONS HAL : une étude HAL réellement citée par le modèle
    //      (citationEntryIds) devient une vraie entrée numérotée dans la section Sources, avec
    //      lien réel et badge "HAL" — jamais un texte informel séparé, invisible du système de
    //      citations formel (cas réel confirmé en production : document "Le coping dyadique dans
    //      le couple", 5 références HAL réelles jamais formalisées avant ce lot). La citation
    //      bibliothèque, elle, doit garder EXACTEMENT son comportement (score, pas de lien, pas
    //      de badge) — non-régression stricte. ──
    {
      await page.unroute('**/*');
      await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith('file:')) return route.continue();
        let body = {};
        try { body = route.request().postDataJSON() || {}; } catch {}
        if (url.endsWith('/search-academic-studies')) {
          return route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ results: [
              { halId: 'hal-05693755', title: 'Coping dyadique et satisfaction conjugale', authors: ['Guy Bodenmann'], docType: 'ART', date: '2010', url: 'https://hal.science/hal-05693755', fullTextAvailable: true },
            ] }),
          });
        }
        if (body.payload) {
          if (body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
            const inputJson = JSON.stringify({
              title: 'Le coping dyadique dans le couple', purpose: 'information', audience: 'clinicien',
              blocks: [
                { type: 'paragraph', text: 'Un passage de bibliothèque sur le sujet.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: ['entry-1'] },
                { type: 'paragraph', text: 'Bodenmann (2010) confirme empiriquement ce mécanisme.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: ['entry-2'] },
              ],
            });
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
              { type: 'message_stop' },
            ]) });
          }
          const nMsg = (body.payload.messages || []).length;
          if (nMsg === 1) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_hal5', name: 'search_academic_studies' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query": "Bodenmann coping dyadique"}' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
              { type: 'message_stop' },
            ]) });
          }
          if (nMsg === 3) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Appui HAL trouvé.' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
              { type: 'message_stop' },
            ]) });
          }
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      const result = await page.evaluate(async () => {
        const ragResult = { chunks: [{ content: 'Passage de bibliothèque sur le coping dyadique.', book_title: 'Livre Test', author: 'Auteur Test', page_number: 12, _score: 0.9 }] };
        const structured = await window.adocGenerateStructuredDocument('fiche', 'Le coping dyadique dans le couple', {}, ragResult, 'Système de base.', 'https://clone-proxy.test.local', 'typing-5');
        const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
        return {
          html: rendered.html,
          qcBlocking: rendered.qc.blocking,
          entryTypes: structured.sourceSnapshot.entries.map((e) => e.sourceType),
          halEntry: structured.sourceSnapshot.entries.find((e) => e.sourceType === 'hal'),
        };
      });

      assert.deepEqual(result.qcBlocking, [], 'aucun contrôle qualité bloquant — la citation HAL doit être techniquement valide (checksum réel calculé, entrée existante dans le SourceSnapshot), exactement comme une citation bibliothèque');
      assert.deepEqual(result.entryTypes, ['library', 'hal'], 'le SourceSnapshot doit contenir 1 entrée bibliothèque (entry-1) puis 1 entrée HAL (entry-2), numérotation continue');
      assert.ok(result.halEntry, 'une entrée sourceType:"hal" doit avoir été créée dans le SourceSnapshot');
      assert.equal(result.halEntry.relevanceScore, null, 'une entrée HAL ne porte jamais de score de similarité (HAL n\'en fournit aucun)');
      assert.equal(result.halEntry.sourceUrl, 'https://hal.science/hal-05693755', 'sourceUrl doit porter le lien HAL réel (uri_s)');

      assert.match(result.html, /<section class="adoc-sc-citations"/, 'la section Sources doit être présente');
      const liMatches = result.html.match(/<li id="cite-citation-\d+">[\s\S]*?<\/li>/g) || [];
      assert.equal(liMatches.length, 2, `2 entrées Sources attendues (1 bibliothèque + 1 HAL), obtenu ${liMatches.length}`);
      const halLi = liMatches.find((li) => li.includes('adoc-sc-cite-source-badge'));
      const libLi = liMatches.find((li) => !li.includes('adoc-sc-cite-source-badge'));
      assert.ok(halLi, 'une entrée Sources doit porter le badge de provenance "HAL"');
      assert.match(halLi, /<a href="https:\/\/hal\.science\/hal-05693755"[^>]*>Guy Bodenmann/, 'l\'entrée HAL doit être un vrai lien cliquable vers sa page HAL réelle (uri_s), jamais un simple texte');
      assert.ok(libLi && !/<a href=/.test(libLi), 'l\'entrée bibliothèque ne doit JAMAIS recevoir de lien — comportement strictement inchangé');
      assert.match(libLi, /adoc-cite-score/, 'l\'entrée bibliothèque garde son score de pertinence — comportement strictement inchangé');
      assert.ok(!halLi.includes('adoc-cite-score'), 'l\'entrée HAL ne doit jamais afficher de score inventé (HAL n\'en fournit aucun) — automatique, aucun code spécifique requis');
      assert.match(result.html, /adoc-sc-cite-flagged/, 'le marqueur [N] inline doit porter le badge needs-review — mécanisme déjà existant, automatique, identique pour HAL et bibliothèque');

      console.log('PASS 5/5 — PARITÉ CITATIONS HAL : une étude HAL réellement citée (citationEntryIds) devient une vraie entrée Sources numérotée avec lien réel + badge "HAL" + needs-review, jamais un texte informel invisible du système de citations ; la citation bibliothèque garde exactement son comportement (score, pas de lien, pas de badge) — non-régression confirmée.');
    }

    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant les cinq scénarios');
    console.log('\nTOUS LES TESTS INTÉGRATION HAL (round-trip + plafond + parité citations, 2 moteurs) PASSENT (5/5)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exitCode = 1; });
