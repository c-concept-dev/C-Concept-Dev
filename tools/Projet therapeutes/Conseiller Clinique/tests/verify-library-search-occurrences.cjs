// Volet 2 — recherche bibliothèque avec occurrences réelles (titre/auteur/page/extrait exact,
// jamais reformulé). Mise à jour Phase 1+ Passerelle : la recherche par CONTENU utilise
// désormais /rag-search (hybride vecteur+FTS5, RRF, traduction automatique — déjà vérifiés
// séparément ce soir) au lieu de l'ancien gabarit A (/d1-query, terms/any) — /rag-search n'a
// aucune limite dure à 8 côté serveur (topK réellement demandé, ici 8 par défaut, inchangé côté
// client). La recherche par AUTEUR reste sur /d1-query (gabarit B dédié), en parallèle, comme
// avant. Aucune nouvelle route Worker pour cette partie, aucune modification du moteur structuré.
const { chromium } = require('playwright');
const FILE = require('node:path').join(__dirname, '../studio-clinique.html');

const CHUNK_COUPLE = {
  book_title: 'Ce que veulent vraiment les femmes', author: 'Gottman, John', page_number: 58, approach: 'Gottman', language: 'fr',
  content: "Un couple en crise traverse souvent une phase où le mépris s'installe durablement dans les échanges quotidiens, rendant toute réparation plus difficile sans intervention ciblée sur ce schéma précis.",
};
const CHUNK_ATTACHEMENT = {
  book_title: "L'attachement, une théorie du lien", author: 'Bowlby, John', page_number: 42, approach: 'Attachement', language: 'fr',
  content: "L'attachement couple se construit dans les premières interactions et influence durablement la régulation émotionnelle à l'âge adulte, notamment lors des conflits relationnels.",
};
const CHUNK_DALLAIRE = {
  // Nom volontairement absent du contenu (contrairement au titre du CDC original) : la
  // recherche par ce nom doit passer STRICTEMENT par le gabarit B (/d1-query, authors) et
  // jamais par une coïncidence de contenu via /rag-search — sinon le test ne prouverait rien
  // sur le chemin auteur spécifiquement.
  book_title: 'Homme et fier de l\'être', author: 'Yvon Dallaire', page_number: 12, approach: 'Différences de genre', language: 'fr',
  content: "Cet ouvrage soutient que les hommes et les femmes expriment leur détresse de façon radicalement différente en contexte de couple.",
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  const ragBodies = [];
  const d1Bodies = [];
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 3, total_chunks: 3, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.endsWith('/rag-search') && req.method() === 'POST') {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      ragBodies.push(body);
      // Simule fidèlement handleRagSearch : le mot-clé est cherché dans le contenu réel des
      // chunks (comme le ferait FTS5), jamais un résultat inventé.
      const q = (body.query || '').toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      const all = [CHUNK_COUPLE, CHUNK_ATTACHEMENT, CHUNK_DALLAIRE];
      const chunks = all.filter(c => words.some(w => c.content.toLowerCase().includes(w)))
        .map((c, i) => ({ ...c, id: 'id-' + i, sources: ['fts5'], is_machine_translated: false }));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: body.query, target_lang: body.target_lang || 'fr', chunks, stats: { total: chunks.length } }) });
      return;
    }
    if (url.endsWith('/d1-query') && req.method() === 'POST') {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      d1Bodies.push(body);
      // Gabarit B (authors) uniquement — le gabarit A (terms) a été retiré de ce parcours par
      // ce lot, remplacé par /rag-search ci-dessus.
      let out = [];
      if (Array.isArray(body.authors) && body.authors.length) {
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
    ragBodies.length = 0; d1Bodies.length = 0;
    await page.fill('#cc-ws-search-input', q);
    await page.press('#cc-ws-search-input', 'Enter');
    await page.waitForTimeout(300);
    return page.evaluate(() => document.getElementById('cc-ws-search-results').innerHTML);
  }

  console.log('=== 1. Recherche par mot-clé "couple en crise" ===');
  let html = await search('couple en crise');
  log('1a. Résultat trouvé pour "couple en crise"', html.includes('Ce que veulent vraiment les femmes'));
  log('1b. Auteur affiché', html.includes('Gottman, John'));
  log('1c. Page réelle affichée', html.includes('p. 58'));
  log('1d. Extrait EXACT du texte source affiché (jamais reformulé)', html.includes("s&#39;installe durablement") || html.includes("s'installe durablement"));
  log('1e. /rag-search (contenu) ET /d1-query (auteur) envoyés en parallèle sur la même saisie', ragBodies.length === 1 && d1Bodies.length === 1 && Array.isArray(d1Bodies[0].authors));

  console.log('\n=== 2. Recherche par mot-clé "attachement couple" ===');
  html = await search('attachement couple');
  log('2a. Résultat trouvé', html.includes("L'attachement, une théorie du lien"));
  log('2b. Page réelle affichée', html.includes('p. 42'));
  log('2c. Extrait exact affiché', html.includes('se construit dans les premières interactions'));

  console.log('\n=== 3. Recherche par auteur "Yvon Dallaire" ===');
  html = await search('Yvon Dallaire');
  log('3a. Résultat trouvé par nom d\'auteur (gabarit B, /d1-query, sans correspondance de contenu)', html.includes("Homme et fier de l'être"));
  log('3b. Page réelle affichée', html.includes('p. 12'));
  log('3c. Extrait exact affiché', html.includes('les hommes et les femmes expriment leur détresse'));
  log('3d. La requête auteur envoie bien authors:["Yvon Dallaire"] (gabarit B dédié, inchangé)', d1Bodies.length === 1 && d1Bodies[0].authors && d1Bodies[0].authors[0] === 'Yvon Dallaire');
  log('3e. Provenance "par auteur" affichée (résultat venu du gabarit B, jamais confondu avec un résultat /rag-search)', html.includes('par auteur'));

  console.log('\n=== 4. Fenêtrage de l\'extrait — jamais une troncature aveugle en tête de chunk ===');
  const longContent = 'x'.repeat(200) + ' couple en crise ' + 'y'.repeat(400);
  await page.route('**/rag-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ target_lang: 'fr', chunks: [{ book_title: 'Long', author: 'A', page_number: 1, content: longContent, sources: ['fts5'], is_machine_translated: false }] }) }));
  html = await search('couple en crise');
  log('4a. Phase 2 : texte reçu complet, occurrence surlignée conservée', html.includes('<mark>couple</mark> en crise') && html.includes('x'.repeat(200)));
  log('4b. Phase 2 : aucune ellipse artificielle ajoutée au texte insérable', !html.includes('…'));

  console.log('\n=== 5. Aucun résultat — message honnête, jamais un résultat inventé ===');
  await page.route('**/rag-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ target_lang: 'fr', chunks: [] }) }));
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
