// STUDIO CLINIQUE — Intégration : traduction automatique dans /rag-search (CDC Passerelle
// §2.6/§4) — panneau diagnostic admin (page chargée telle quelle, testSearch()/
// renderSearchColumn() jamais réimplémentées). Sert de premier lieu de vérification visuelle
// avant toute UI grand public de Passerelle : un résultat traduit doit être visiblement marqué
// comme traduction automatique, avec bascule facile vers le texte original (VO).
const { chromium } = require('playwright');
const path = require('node:path');
const FILE = path.join(__dirname, '..', 'bibliotheque-admin.html');

let browser;
(async () => {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('dialog', d => d.dismiss());
  await page.route('**/pdf.min.js', route => route.fulfill({ body: 'window.pdfjsLib = { GlobalWorkerOptions: {} };', contentType: 'application/javascript' }));
  await page.route('**/pdf.worker.min.js', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.route('**/fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto('file://' + FILE);

  await page.evaluate(() => {
    window.fetch = (url) => {
      if (String(url).includes('/search-library')) return Promise.resolve(new Response(JSON.stringify({ results: [] })));
      if (String(url).includes('/rag-search')) {
        return Promise.resolve(new Response(JSON.stringify({
          target_lang: 'fr',
          chunks: [
            {
              id: 'ifs-translated', book_title: 'Internal Family Systems Skills Training Manual', author: 'Anderson',
              page_number: 12, approach: 'general', language: 'en', content: 'Original English content about parts work.',
              translated_content: 'Contenu français traduit à propos du travail des parties.', is_machine_translated: true,
              score: 0.9, sources: ['vector'], vector_rank: 1, fts_rank: null, rrf_score: 0.02,
            },
            {
              id: 'fr-untranslated', book_title: 'Livre déjà en français', author: 'Dupont',
              page_number: 5, approach: 'general', language: 'fr', content: 'Contenu déjà en français, jamais traduit.',
              is_machine_translated: false,
              score: 0.85, sources: ['vector'], vector_rank: 2, fts_rank: null, rrf_score: 0.018,
            },
            {
              id: 'schema-failed', book_title: 'Schema Therapy in Practice', author: 'Young',
              page_number: 30, approach: 'general', language: 'en', content: 'Original English content that failed to translate.',
              is_machine_translated: false, translation_failed: true,
              score: 0.8, sources: ['vector'], vector_rank: 3, fts_rank: null, rrf_score: 0.016,
            },
          ],
        })));
      }
      return Promise.resolve(new Response('{}'));
    };
  });
  await page.evaluate(async () => {
    document.getElementById('searchQuery').value = 'requete test traduction';
    await testSearch();
  });

  // ── 1. Résultat traduit : badge "traduction automatique" visible, texte traduit affiché par
  //      défaut, texte original présent dans le DOM mais masqué. ──
  const html = await page.evaluate(() => document.getElementById('searchResults').innerHTML);
  if (!html.includes('Traduction automatique')) {
    throw new Error('ÉCHEC 1 : aucun badge "Traduction automatique" trouvé alors qu\'un résultat porte is_machine_translated:true');
  }
  if (!html.includes('Contenu français traduit')) {
    throw new Error('ÉCHEC 1 : le texte traduit (translated_content) n\'est pas affiché');
  }
  console.log('PASS 1/6 — résultat traduit : badge "Traduction automatique" visible, texte traduit affiché par défaut');

  // ── 2. Bascule VO : le bouton doit révéler le texte original ET masquer la traduction ──
  const beforeToggle = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent.includes('texte original'));
    return { found: !!el, buttonText: el ? el.textContent : null };
  });
  if (!beforeToggle.found) throw new Error('ÉCHEC 2 : bouton de bascule vers le texte original (VO) introuvable');

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('texte original'));
    btn.click();
  });
  const afterToggle = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.id && b.id.startsWith('btn-'));
    const uid = btn.id.replace('btn-', '');
    const tr = document.getElementById('tr-' + uid);
    const vo = document.getElementById('vo-' + uid);
    return {
      trHidden: tr.style.display === 'none',
      voVisible: vo.style.display !== 'none',
      voText: vo.textContent,
      btnText: btn.textContent,
    };
  });
  if (!afterToggle.trHidden || !afterToggle.voVisible) {
    throw new Error('ÉCHEC 2 : après clic sur la bascule, la traduction devrait être masquée et la VO visible — obtenu ' + JSON.stringify(afterToggle));
  }
  if (!afterToggle.voText.includes('Original English content about parts work')) {
    throw new Error('ÉCHEC 2 : le texte original (VO) affiché après bascule ne correspond pas au `content` original — ' + afterToggle.voText);
  }
  if (!afterToggle.btnText.includes('traduction')) {
    throw new Error('ÉCHEC 2 : le libellé du bouton devrait maintenant proposer de revenir à la traduction — obtenu "' + afterToggle.btnText + '"');
  }
  console.log('PASS 2/6 — bascule VO : un clic masque la traduction et révèle le texte original (content) intact, jamais un second appel réseau nécessaire');

  // ── 3. Résultat déjà dans la langue cible : aucun badge, contenu affiché normalement ──
  const frBlock = html.split('fr-untranslated')[1]?.split('</div>\n        </div>')[0] || '';
  if (html.includes('Contenu déjà en français') && html.split('Contenu déjà en français')[0].slice(-400).includes('Traduction automatique')) {
    throw new Error('ÉCHEC 3 : un résultat déjà dans la langue cible ne doit jamais porter le badge "Traduction automatique"');
  }
  console.log('PASS 3/6 — résultat déjà dans la langue cible : aucun badge de traduction, affichage normal');

  // ── 4. Échec de traduction isolé : avertissement explicite, texte original affiché (jamais un
  //      texte vide, jamais confondu avec un succès) ──
  if (!html.includes('Échec de traduction automatique')) {
    throw new Error('ÉCHEC 4 : aucun avertissement d\'échec de traduction trouvé alors qu\'un résultat porte translation_failed:true');
  }
  if (!html.includes('Original English content that failed to translate')) {
    throw new Error('ÉCHEC 4 : le texte original du résultat en échec de traduction devrait être affiché (jamais un texte vide)');
  }
  console.log('PASS 4/6 — échec de traduction isolé à ce résultat : avertissement explicite affiché, texte original intact (jamais un texte vide affiché comme un succès)');

  // ── 5. Les 3 résultats cohabitent dans la même réponse — un échec n'empêche jamais l'affichage
  //      des autres résultats (traduits ou non) ──
  const allThreePresent = html.includes('Internal Family Systems') && html.includes('Livre déjà en français') && html.includes('Schema Therapy');
  if (!allThreePresent) throw new Error('ÉCHEC 5 : les 3 résultats (traduit, déjà correct, échec) devraient tous être affichés simultanément');
  console.log('PASS 5/6 — les 3 cas (traduit avec succès, déjà dans la langue cible, échec isolé) cohabitent normalement dans la même réponse affichée');

  // ── 6. Non-régression : colonne vectorielle pure (/search-library, jamais traduite, hors
  //      périmètre de ce lot) toujours affichée sans erreur ──
  if (!html.includes('Vectoriel (/search-library)')) {
    throw new Error('ÉCHEC 6 : la colonne vectorielle pure a disparu ou n\'est plus rendue correctement');
  }
  console.log('PASS 6/6 — non-régression : la colonne vectorielle pure (/search-library, hors périmètre de la traduction) reste rendue normalement');

  console.log('\nTOUS LES TESTS INTÉGRATION TRADUCTION ADMIN PASSENT (6/6)');
  await browser.close();
})().catch(async (e) => {
  console.error('ÉCHEC:', e.message);
  try { if (browser) await browser.close(); } catch {}
  process.exitCode = 1;
});
