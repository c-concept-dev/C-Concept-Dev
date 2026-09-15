// Vérifie le CORRECTIF "streamer le 1er appel + réduire son contexte" :
// (1) le 1er appel envoie désormais un contexte réduit (résumé titres/auteurs, pas le texte
//     intégral des passages) ;
// (2) le timeout du 1er appel est bien basé sur l'INACTIVITÉ, pas une durée fixe — preuve
//     RÉELLE via un vrai serveur HTTP local (pas un mock Playwright, qui ne peut pas livrer un
//     corps en plusieurs morceaux espacés dans le temps) qui envoie des chunks SSE espacés de
//     5s pendant 24s au total (> 20s) : si le timeout était une durée fixe, ça couperait à 20s ;
//     s'il est basé sur l'inactivité (reset à chaque chunk), ça doit aboutir.
// Le vrai Worker restant inatteignable depuis ce sandbox, ce test utilise un serveur
// 127.0.0.1 local (loopback, jamais bloqué) au lieu d'un mock Playwright pour ce point précis.
const { chromium } = require('playwright');
const http = require('http');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const MOCK_RAG_CHUNKS = [
  { content: "Les quatre cavaliers de l'apocalypse prédisent la rupture avec une fiabilité remarquable.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 42 },
  { content: "Le mépris porte une dévalorisation globale du partenaire.", book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 58 },
];

function sseLine(evt) { return 'data: ' + JSON.stringify(evt) + '\n\n'; }

(async () => {
  console.log('=== PARTIE A — contexte réduit envoyé au 1er appel ===');
  {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    let call1Payload = null, call2Payload = null;
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      if (url.includes('clone-proxy') || url.includes('workers.dev')) {
        const bodyRaw = route.request().postData() || '';
        let body = {}; try { body = JSON.parse(bodyRaw); } catch (e) {}
        const isSearch = body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
        const isStructured = body.payload && body.payload.tool_choice && body.payload.tool_choice.name === 'emit_fiche_document';
        if (isSearch) {
          call1Payload = body.payload;
          route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }) + sseLine({ type: 'content_block_stop', index: 0 }) + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + 'data: [DONE]\n\n' });
          return;
        }
        if (isStructured) {
          call2Payload = body.payload;
          const input = { title: 'T', purpose: 'p', audience: 'a', blocks: [{ type: 'paragraph', text: 'Contenu valide.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] }] };
          const json = JSON.stringify(input);
          route.fulfill({ status: 200, contentType: 'text/event-stream', body:
            sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } }) +
            sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json } }) +
            sseLine({ type: 'content_block_stop', index: 0 }) +
            sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }) + 'data: [DONE]\n\n' });
          return;
        }
      }
      route.continue();
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    await page.evaluate(async ({ chunks }) => {
      const ragResult = { chunks, chunkLen: 900 };
      await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'Instructions cliniques de base (système).', 'https://clone-proxy.11drumboy11.workers.dev');
    }, { chunks: MOCK_RAG_CHUNKS });

    const call1Size = call1Payload.system.length;
    const call2Size = call2Payload.system.length;
    console.log('taille system prompt appel 1 (réduit):', call1Size, 'caractères');
    console.log('taille system prompt appel 2 (complet, passages intégraux):', call2Size, 'caractères');
    console.log('=> appel 1 sensiblement plus léger que appel 2:', call1Size < call2Size);
    console.log('=> appel 1 NE contient PAS le texte intégral des passages (exactText):', !call1Payload.system.includes(MOCK_RAG_CHUNKS[0].content));
    console.log('=> appel 1 contient bien un résumé (titre du livre) suffisant pour décider:', call1Payload.system.includes('Ce que veulent vraiment les femmes'));
    console.log('=> appel 2 contient bien le texte intégral (nécessaire à la génération réelle):', call2Payload.system.includes(MOCK_RAG_CHUNKS[0].content));
    console.log('=> appel 1 ne contient PAS les instructions illustration/emoji (réservées à la génération, pas à la décision):', !call1Payload.system.includes('ILLUSTRATION'));
    await browser.close();
  }

  console.log('\n=== PARTIE B — timeout basé sur l\'inactivité, preuve RÉELLE via serveur local (chunks espacés de 5s, 24s au total > 20s) ===');
  {
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', c => raw += c);
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw); } catch (e) {}
        const isSearch = body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'auto';
        if (!isSearch) {
          // Appel 2 (jamais atteint dans ce test si l'appel 1 aboutit après 24s, mais géré
          // par prudence) : réponse SSE minimale immédiate.
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' });
          const input = { title: 'T', purpose: 'p', audience: 'a', blocks: [{ type: 'paragraph', text: 'Contenu valide.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] }] };
          res.write(sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } }));
          res.write(sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }));
          res.write(sseLine({ type: 'content_block_stop', index: 0 }));
          res.write(sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }));
          res.end('data: [DONE]\n\n');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' });
        res.write(sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } }));
        res.write(sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
        let sent = 0;
        const totalPings = 5; // 5 x 5s = 24s de flux total, chaque intervalle < 20s
        const iv = setInterval(() => {
          sent++;
          res.write(sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '.' } }));
          if (sent >= totalPings) {
            clearInterval(iv);
            res.write(sseLine({ type: 'content_block_stop', index: 0 }));
            res.write(sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }));
            res.end('data: [DONE]\n\n');
          }
        }, 4800); // légèrement < 5s pour garder de la marge sous 20s d'inactivité par intervalle
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    console.log('serveur local de test démarré sur 127.0.0.1:' + port);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
      route.continue(); // laisse passer les requêtes vers 127.0.0.1 (serveur réel local)
    });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);

    const t0 = Date.now();
    const result = await page.evaluate(async ({ chunks, port }) => {
      const ragResult = { chunks, chunkLen: 900 };
      try {
        const struct = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'http://127.0.0.1:' + port);
        return { threw: false, title: struct.doc.title };
      } catch (e) {
        return { threw: true, message: e.message };
      }
    }, { chunks: MOCK_RAG_CHUNKS, port });
    const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('résultat:', result, '— temps écoulé:', elapsedS + 's');
    console.log('=> le flux de 24s (chunks espacés de <5s, jamais 20s de silence) ABOUTIT sans être coupé — preuve réelle du timeout par inactivité (pas une durée fixe):', !result.threw);
    console.log('=> durée observée cohérente avec les ~24s de flux réel du 1er appel:', Date.now() - t0 >= 23000);

    await browser.close();
    server.close();
  }
})();
