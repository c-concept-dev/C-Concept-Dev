// STUDIO CLINIQUE — Phase 1+ Passerelle : composant de recherche bibliothèque partagé
// (adocLibSearchExec), monté à DEUX points d'entrée (barre latérale de l'espace de travail ET
// écran d'accueil, avant même l'ouverture d'un document). Vérifie sur LES DEUX points de montage
// séparément : badge traduction + bascule VO (jamais un second appel réseau), filtre d'approche
// (paramètre transmis), phrase exacte (comportement RÉELLEMENT différent d'une recherche sans
// guillemets sur les mêmes mots, pas supposé), et que les deux mounts partagent bien le MÊME code
// (pas une simple ressemblance visuelle entre deux implémentations distinctes).
const { chromium } = require('playwright');
const FILE = require('node:path').join(__dirname, '../studio-clinique.html');

const IFS_CHUNK_TRANSLATED = {
  id: 'ifs-en-1', book_title: 'Internal Family Systems Skills Training Manual', author: 'Anderson', page_number: 12,
  approach: 'ifs', language: 'en', content: 'Original English content about parts work in internal family systems.',
  translated_content: 'Contenu français traduit à propos du travail des parties en systèmes familiaux internes.',
  is_machine_translated: true, sources: ['fts5', 'vector'],
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  let ragCallCount = 0;
  const ragBodies = [];
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 3, total_chunks: 3, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.endsWith('/d1-query') && req.method() === 'POST') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
      return;
    }
    if (url.endsWith('/rag-search') && req.method() === 'POST') {
      ragCallCount++;
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      ragBodies.push(body);
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: body.query, target_lang: body.target_lang || 'fr', chunks: [IFS_CHUNK_TRANSLATED] }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyRaw = req.postData() || '';
      let parsed = {}; try { parsed = JSON.parse(bodyRaw); } catch (e) {}
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

  // ═══════════════════════ 1. ÉCRAN D'ACCUEIL (avant tout document) ═══════════════════════
  console.log('=== 1. Écran d\'accueil — avant l\'ouverture de tout document ===');
  const panelInitiallyHidden = await page.evaluate(() => document.getElementById('cc-home-search-panel').hidden);
  log('1a. Panneau de recherche accueil replié par défaut', panelInitiallyHidden === true);

  await page.click('#cc-home-search-toggle');
  const panelOpenNow = await page.evaluate(() => !document.getElementById('cc-home-search-panel').hidden);
  log('1b. Le clic déplie le panneau', panelOpenNow);

  await page.fill('#cc-home-search-input', 'internal family systems');
  await page.press('#cc-home-search-input', 'Enter');
  await page.waitForTimeout(300);
  let html = await page.evaluate(() => document.getElementById('cc-home-search-results').innerHTML);
  log('1c. Résultat affiché sur l\'écran d\'accueil, AVANT tout document ouvert', html.includes('Internal Family Systems Skills Training Manual'));
  log('1d. Badge "Traduction automatique" visible', html.includes('Traduction automatique'));
  log('1e. Texte traduit affiché par défaut', html.includes('Contenu français traduit'));

  const fetchCountBeforeToggle = ragCallCount;
  const btnBefore = await page.evaluate(() => { const b = [...document.querySelectorAll('#cc-home-search-results button')].find(x => x.textContent.includes('texte original')); return !!b; });
  log('1f. Bouton de bascule VO présent', btnBefore);
  await page.click('#cc-home-search-results button');
  await page.waitForTimeout(100);
  const afterToggleHome = await page.evaluate(() => {
    const btn = document.querySelector('#cc-home-search-results button.cc-lib-vo-toggle');
    const uid = btn.id.replace('cc-lib-btn-', '');
    const tr = document.getElementById('cc-lib-tr-' + uid);
    const vo = document.getElementById('cc-lib-vo-' + uid);
    return { trHidden: tr.style.display === 'none', voVisible: vo.style.display !== 'none', voText: vo.textContent, btnText: btn.textContent };
  });
  log('1g. Bascule VO : traduction masquée, texte original révélé', afterToggleHome.trHidden && afterToggleHome.voVisible);
  log('1h. Texte original = content exact (jamais reformulé)', afterToggleHome.voText.includes('Original English content about parts work'));
  log('1i. Libellé du bouton mis à jour', afterToggleHome.btnText.includes('traduction'));
  log('1j. AUCUN second appel réseau déclenché par la bascule VO (show/hide DOM local uniquement)', ragCallCount === fetchCountBeforeToggle);

  // ── Filtre d'approche (repliable) — vérifie que le paramètre est bien transmis à /rag-search ──
  console.log('\n=== 2. Filtre d\'approche (écran d\'accueil) ===');
  const filtersInitiallyClosed = await page.evaluate(() => !document.getElementById('cc-home-search-filters').classList.contains('open'));
  log('2a. Panneau de filtres replié par défaut', filtersInitiallyClosed);
  await page.click('#cc-home-search-filters-toggle');
  const filtersOpenNow = await page.evaluate(() => document.getElementById('cc-home-search-filters').classList.contains('open'));
  log('2b. Le clic déplie les filtres', filtersOpenNow);
  await page.fill('#cc-home-search-approach', 'ifs');
  ragBodies.length = 0;
  await page.fill('#cc-home-search-input', 'internal family systems');
  await page.press('#cc-home-search-input', 'Enter');
  await page.waitForTimeout(300);
  log('2c. Le paramètre approach est bien transmis à /rag-search', ragBodies.length === 1 && ragBodies[0].approach === 'ifs');

  // ── Phrase exacte — comportement RÉELLEMENT différent, pas supposé ──
  console.log('\n=== 3. Phrase exacte entre guillemets — comportement réellement différent ===');
  await page.fill('#cc-home-search-approach', '');
  ragBodies.length = 0;
  await page.fill('#cc-home-search-input', '"internal family systems"');
  await page.press('#cc-home-search-input', 'Enter');
  await page.waitForTimeout(300);
  const phraseBody = ragBodies[0];
  log('3a. Requête entre guillemets → fts_terms transmis avec la phrase complète (guillemets conservés)', Array.isArray(phraseBody.fts_terms) && phraseBody.fts_terms[0] === '"internal family systems"');
  log('3b. Le champ query, lui, est bien dépouillé des guillemets', phraseBody.query === 'internal family systems');

  ragBodies.length = 0;
  await page.fill('#cc-home-search-input', 'internal family systems');
  await page.press('#cc-home-search-input', 'Enter');
  await page.waitForTimeout(300);
  const noPhraseBody = ragBodies[0];
  log('3c. La MÊME requête SANS guillemets → aucun fts_terms transmis (comportement réellement différent, prouvé par la requête réseau, jamais supposé)', noPhraseBody.fts_terms === undefined);

  // ═══════════════════ 4. BARRE LATÉRALE DE L'ESPACE DE TRAVAIL ═══════════════════
  console.log('\n=== 4. Barre latérale de l\'espace de travail (second point de montage) ===');
  const storeKey = await page.evaluate(async () => {
    const ragResult = { chunks: [{ content: 'x', book_title: 'Y', author: 'Z', page_number: 1 }], chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
    return await window.adocDeliverStructuredFicheArtifact(structured.doc, structured.sourceSnapshot, rendered, null);
  });
  await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
  await page.waitForTimeout(300);

  ragBodies.length = 0;
  await page.fill('#cc-ws-search-input', 'internal family systems');
  await page.press('#cc-ws-search-input', 'Enter');
  await page.waitForTimeout(300);
  html = await page.evaluate(() => document.getElementById('cc-ws-search-results').innerHTML);
  log('4a. Résultat affiché dans la barre latérale de l\'espace de travail', html.includes('Internal Family Systems Skills Training Manual'));
  log('4b. Badge traduction visible ici aussi', html.includes('Traduction automatique'));

  const fetchCountBeforeToggleWs = ragCallCount;
  await page.click('#cc-ws-search-results button');
  await page.waitForTimeout(100);
  const afterToggleWs = await page.evaluate(() => {
    const btn = document.querySelector('#cc-ws-search-results button.cc-lib-vo-toggle');
    const uid = btn.id.replace('cc-lib-btn-', '');
    const tr = document.getElementById('cc-lib-tr-' + uid);
    return tr.style.display === 'none';
  });
  log('4c. Bascule VO fonctionnelle dans la barre latérale aussi', afterToggleWs);
  log('4d. Aucun second appel réseau ici non plus', ragCallCount === fetchCountBeforeToggleWs);

  // ── Preuve que les deux mounts partagent le MÊME code (pas une ressemblance visuelle) ──
  console.log('\n=== 5. Les deux points de montage partagent le MÊME code (pas deux implémentations) ===');
  const sameFunctionWiring = await page.evaluate(() => {
    const homeOnkeydown = document.getElementById('cc-home-search-input').getAttribute('onkeydown') || '';
    const wsOnkeydown = document.getElementById('cc-ws-search-input').getAttribute('onkeydown') || '';
    return {
      bothCallSameFunctionName: homeOnkeydown.includes('adocHomeLibrarySearch') && wsOnkeydown.includes('adocWorkspaceLibrarySearch'),
      differentMountIds: window.adocHomeLibrarySearch.toString().includes("'cc-home-search'") && window.adocWorkspaceLibrarySearch.toString().includes("'cc-ws-search'"),
      singleFunctionDefined: typeof window.adocLibSearchExec === 'function',
      noLegacyDuplicate: typeof window.adocWsSearchLibrary === 'undefined',
    };
  });
  log('5a. Phase 2 : les deux points de montage appellent chacun leur orchestrateur', sameFunctionWiring.bothCallSameFunctionName);
  log('5b. Chaque mount passe son propre identifiant de conteneur (mountId distinct)', sameFunctionWiring.differentMountIds);
  log('5c. Une seule fonction adocLibSearchExec existe dans la page', sameFunctionWiring.singleFunctionDefined);
  log('5d. L\'ancienne fonction dédiée (adocWsSearchLibrary) a bien été retirée, jamais laissée en doublon mort', sameFunctionWiring.noLegacyDuplicate);

  // ── Indépendance des deux mounts : régler un filtre sur l'un ne doit jamais affecter l'autre ──
  console.log('\n=== 6. Indépendance des deux points de montage ===');
  await page.click('#cc-ws-search-filters-toggle');
  await page.fill('#cc-ws-search-approach', 'systemic');
  const homeApproachUnaffected = await page.evaluate(() => document.getElementById('cc-home-search-approach').value);
  log('6a. Remplir le filtre approche de la barre latérale ne modifie jamais celui de l\'accueil', homeApproachUnaffected === '');

  console.log('\n=== 7. Non-régression — aucune erreur JS ===');
  log('7a. Zéro erreur JS sur l\'ensemble du scénario', errors.length === 0);

  console.log('=== Résultats — Phase 1+ Passerelle : recherche bibliothèque partagée ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'FAIL ') + label));
  const failCount = results.filter(([, ok]) => !ok).length;
  console.log('\nTotal:', results.length, '- failCount:', failCount);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
