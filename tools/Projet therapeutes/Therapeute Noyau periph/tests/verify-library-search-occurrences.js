// Volet 2 — recherche bibliothèque avec occurrences réelles (titre/auteur/page/extrait exact,
// jamais reformulé), recherche par mot-clé OU par nom d'auteur, réutilise /d1-query existant
// (déjà avec X-API-Key). Aucune nouvelle route Worker, aucune modification du moteur structuré.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const CHUNK_COUPLE = {
  book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 58, approach: 'Gottman',
  content: "Un couple en crise traverse souvent une phase où le mépris s'installe durablement dans les échanges quotidiens, rendant toute réparation plus difficile sans intervention ciblée sur ce schéma précis.",
};
const CHUNK_ATTACHEMENT = {
  book_title: "L'attachement, une théorie du lien", author: 'Bowlby, John', page_number: 42, approach: 'Attachement',
  content: "L'attachement couple se construit dans les premières interactions et influence durablement la régulation émotionnelle à l'âge adulte, notamment lors des conflits relationnels.",
};
const CHUNK_DALLAIRE = {
  book_title: 'Homme et fier de l\'être', author: 'Yvon Dallaire', page_number: 12, approach: 'Différences de genre',
  content: "Yvon Dallaire soutient que les hommes et les femmes expriment leur détresse de façon radicalement différente en contexte de couple.",
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  const requestBodies = [];
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 3, total_chunks: 3, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.endsWith('/d1-query') && req.method() === 'POST') {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      requestBodies.push(body);
      // Simule fidèlement le comportement réel du Worker : gabarit A (terms, FTS "any" sur
      // n'importe quel mot) ou gabarit B (authors seul, LIKE sur le nom).
      let out = [];
      if (Array.isArray(body.terms) && body.terms.length) {
        const words = body.terms.map(t => t.toLowerCase());
        const all = [CHUNK_COUPLE, CHUNK_ATTACHEMENT, CHUNK_DALLAIRE];
        out = all.filter(c => words.some(w => c.content.toLowerCase().includes(w)));
      } else if (Array.isArray(body.authors) && body.authors.length) {
        const a = body.authors[0].toLowerCase();
        out = [CHUNK_COUPLE, CHUNK_ATTACHEMENT, CHUNK_DALLAIRE].filter(c => c.author.toLowerCase().includes(a));
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: out }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      let parsed = {}; try { parsed = JSON.parse(body); } catch (e) {}
      const p = parsed.payload || {};
      if (p.tool_choice && p.tool_choice.name === 'emit_fiche_document') {
        const inputJson = JSON.stringify({
          title: 'Document de test', purpose: 'supervision', audience: 'clinicien',
          blocks: [{ type: 'paragraph', text: 'Paragraphe de test.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] }],
        });
        const events = [
          { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
        ];
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n' });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  const storeKey = await page.evaluate(async () => {
    const ragResult = { chunks: [{ content: 'x', book_title: 'Y', author: 'Z', page_number: 1 }], chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
    return await window.adocDeliverStructuredFicheArtifact(structured.doc, structured.sourceSnapshot, rendered, null);
  });
  await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
  await page.waitForTimeout(300);

  async function search(q) {
    requestBodies.length = 0;
    await page.fill('#cc-ws-search-input', q);
    await page.press('#cc-ws-search-input', 'Enter');
    await page.waitForTimeout(300);
    return page.evaluate(() => document.getElementById('cc-ws-search-results').innerHTML);
  }

  console.log('=== 1. Recherche par mot-clé "couple en crise" ===');
  let html = await search('couple en crise');
  log('1a. Résultat trouvé pour "couple en crise"', html.includes('Ce que veulent vraiment les femmes'));
  log('1b. Auteur affiché', html.includes('Gottman, John'));
  log('1c. Page réelle affichée', html.includes('p.58'));
  log('1d. Extrait EXACT du texte source affiché (jamais reformulé)', html.includes("le mépris s'installe durablement"));
  log('1e. Les deux gabarits de requête sont bien envoyés en parallèle (contenu + auteur)', requestBodies.length === 2 && requestBodies.some(b => Array.isArray(b.terms)) && requestBodies.some(b => Array.isArray(b.authors)));

  console.log('\n=== 2. Recherche par mot-clé "attachement couple" ===');
  html = await search('attachement couple');
  log('2a. Résultat trouvé', html.includes("L'attachement, une théorie du lien"));
  log('2b. Page réelle affichée', html.includes('p.42'));
  log('2c. Extrait exact affiché', html.includes('se construit dans les premières interactions'));

  console.log('\n=== 3. Recherche par auteur "Yvon Dallaire" ===');
  html = await search('Yvon Dallaire');
  log('3a. Résultat trouvé par nom d\'auteur (gabarit B, sans terme de contenu)', html.includes("Homme et fier de l'être"));
  log('3b. Page réelle affichée', html.includes('p.12'));
  log('3c. Extrait exact affiché', html.includes('les hommes et les femmes expriment leur détresse'));
  const authorReq = requestBodies.find(b => Array.isArray(b.authors) && b.authors.length);
  log('3d. La requête auteur envoie bien authors:["Yvon Dallaire"] (gabarit B dédié)', !!authorReq && authorReq.authors[0] === 'Yvon Dallaire');

  console.log('\n=== 4. Fenêtrage de l\'extrait — jamais une troncature aveugle en tête de chunk ===');
  const longContent = 'x'.repeat(200) + ' couple en crise ' + 'y'.repeat(400);
  await page.route('**/d1-query', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ book_title: 'Long', author: 'A', page_number: 1, content: longContent }] }) }));
  html = await search('couple en crise');
  log('4a. L\'extrait est centré autour du terme trouvé (jamais juste le début du chunk)', html.includes('couple en crise') && !html.includes('x'.repeat(200)));
  log('4b. Une ellipse signale la troncature', html.includes('…'));

  console.log('\n=== 5. Aucun résultat — message honnête, jamais un résultat inventé ===');
  await page.route('**/d1-query', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }));
  html = await search('zzzxxxyyy improbable');
  log('5a. Message "Aucun résultat" affiché', html.includes('Aucun résultat'));

  console.log('\n=== 6. Non-régression — aucune erreur JS ===');
  log('6a. Zero erreur JS', errors.length === 0);

  console.log('=== Résultats — Recherche bibliothèque avec occurrences réelles ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'FAIL ') + label));
  const failCount = results.filter(([, ok]) => !ok).length;
  console.log('\nTotal:', results.length, '- failCount:', failCount);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
