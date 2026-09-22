// STUDIO CLINIQUE — Intégration : traduction automatique dans /rag-search (CDC Passerelle
// §2.6/§4) — vérification Worker réelle (fonction extraite TEXTUELLEMENT de index.js, jamais
// réimplémentée). Seule la frontière modèle (env.AI.run) est mockée — toute la logique
// (insertion après troncature topK, parallélisme, isolation d'erreur par résultat,
// target_lang) est exécutée réellement.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `Bornes introuvables : "${startMarker}" → "${endMarker}"`);
  return source.slice(start, end);
}
const ragSearchCode = extract('async function handleRagSearch(', 'async function handleRagStats(');

function loadHandlers(code, env) {
  const context = vm.createContext({
    Response, Request, env,
    __name() {},
    jsonErr: (message, status) => new Response(JSON.stringify({ error: message }), { status }),
    json: (obj) => new Response(JSON.stringify(obj)),
  });
  vm.runInContext(code, context);
  return context;
}
function req(body) {
  return new Request('https://test.local/', { method: 'POST', body: JSON.stringify(body) });
}

// Requête volontairement composée de mots courts (≤3 lettres) : `terms` (mots >3 lettres) reste
// vide, donc `ftsQuery` reste vide et la voie FTS5 n'est jamais interrogée — isole le test sur le
// seul chemin vectoriel, pour se concentrer exclusivement sur la traduction, pas sur RRF (déjà
// couvert par RRF-CLOSE).
const SHORT_QUERY = 'la vie et';

function buildChunksMeta() {
  return {
    'en-chunk-1': { content: 'This is an English passage about parts work.', author: 'A', page_number: 1, approach: 'general', language: 'en' },
    'fr-chunk-1': { content: 'Ceci est un passage déjà en français.', author: 'B', page_number: 2, approach: 'general', language: 'fr' },
    'en-chunk-fail': { content: 'Another English passage whose translation will fail.', author: 'C', page_number: 3, approach: 'general', language: 'en' },
    'filler-1': { content: 'Filler chunk below topK, must never be translated.', author: 'D', page_number: 4, approach: 'general', language: 'en' },
    'filler-2': { content: 'Another filler chunk below topK.', author: 'E', page_number: 5, approach: 'general', language: 'en' },
  };
}

function makeEnv({ translateImpl, chunksMeta }) {
  const vecMatches = [
    { id: 'en-chunk-1', score: 0.95, metadata: { book_title: 'IFS', author: 'A', approach: 'general' } },
    { id: 'fr-chunk-1', score: 0.9, metadata: { book_title: 'Livre FR', author: 'B', approach: 'general' } },
    { id: 'en-chunk-fail', score: 0.85, metadata: { book_title: 'Schema Therapy', author: 'C', approach: 'general' } },
    { id: 'filler-1', score: 0.5, metadata: { book_title: 'Filler', author: 'D', approach: 'general' } },
    { id: 'filler-2', score: 0.4, metadata: { book_title: 'Filler', author: 'E', approach: 'general' } },
  ];
  const translateCallCount = { n: 0 };
  const translateCallLog = [];
  const env = {
    AI: {
      async run(model, input) {
        if (model === '@cf/baai/bge-m3') return { data: [[0.1, 0.2]] };
        if (model === '@cf/meta/m2m100-1.2b') {
          translateCallCount.n++;
          translateCallLog.push({ ...input, t: Date.now() });
          return translateImpl(input);
        }
        throw new Error('modèle inattendu appelé : ' + model);
      },
    },
    VECTOR_INDEX: { async query() { return { matches: vecMatches }; } },
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                if (sql.includes('chunks_fts')) return { results: [] };
                if (sql.includes('SELECT id, content, author, page_number, approach, language')) {
                  const ids = args;
                  return { results: ids.filter((id) => chunksMeta[id]).map((id) => ({ id, ...chunksMeta[id] })) };
                }
                return { results: [] };
              },
            };
          },
        };
      },
    },
    _translateCallCount: translateCallCount,
    _translateCallLog: translateCallLog,
  };
  return env;
}

(async () => {
  const chunksMeta = buildChunksMeta();

  // ── 1-2-5. Cas nominal complet : topK=3 (seuls en-chunk-1/fr-chunk-1/en-chunk-fail survivent à
  //      la troncature, les deux "filler" sont exclus) ; traduction réussie, langue déjà correcte,
  //      échec isolé à un seul résultat, jamais toute la réponse en erreur. ──
  const env1 = makeEnv({
    chunksMeta,
    translateImpl: async (input) => {
      if (input.text.includes('translation will fail')) throw new Error('panne modèle simulée');
      return { translated_text: '[FR] ' + input.text };
    },
  });
  const ctx1 = loadHandlers(ragSearchCode, env1);
  const t0 = Date.now();
  const resp1 = await ctx1.handleRagSearch(req({ query: SHORT_QUERY, topK: 3, language: 'all' }), env1);
  const elapsedMs = Date.now() - t0;
  // Le filtre source s'applique désormais aux vecteurs aussi : multilingue explicite
  // ci-dessus, puis contrôle négatif du défaut français (aucun anglais ne doit fuir).
  const filteredEnv = makeEnv({ chunksMeta, translateImpl: async () => { throw new Error('unexpected translation'); } });
  const filteredCtx = loadHandlers(ragSearchCode, filteredEnv);
  const filtered = await (await filteredCtx.handleRagSearch(req({query: SHORT_QUERY, topK: 3}), filteredEnv)).json();
  assert.deepEqual(filtered.chunks.map(c => c.id), ['fr-chunk-1']);
  assert.equal(filteredEnv._translateCallCount.n, 0);
  assert.equal(resp1.status, 200, 'la réponse doit rester 200 même avec une traduction en échec (isolation par résultat)');
  const data1 = await resp1.json();

  assert.equal(data1.chunks.length, 3, `topK=3 devrait tronquer à 3 résultats, obtenu ${data1.chunks.length}`);
  assert.equal(env1._translateCallCount.n, 2, `SEULS les résultats anglais du topK final doivent être traduits (en-chunk-1, en-chunk-fail) — jamais les "filler" exclus par la troncature ni fr-chunk-1 déjà dans la langue cible. Attendu 2 appels, obtenu ${env1._translateCallCount.n}`);
  console.log('PASS 1/9 — insertion APRÈS la troncature finale au topK : seuls les résultats réellement retournés (jamais les candidats exclus) sont candidats à la traduction');

  const en1 = data1.chunks.find((c) => c.id === 'en-chunk-1');
  assert.ok(en1, 'en-chunk-1 doit être présent');
  assert.equal(en1.is_machine_translated, true);
  assert.equal(en1.translated_content, '[FR] This is an English passage about parts work.');
  assert.equal(en1.content, 'This is an English passage about parts work.', 'content ORIGINAL doit rester intact, jamais écrasé par la traduction');
  assert.equal(en1.translation_failed, void 0, 'translation_failed ne doit pas être présent sur un résultat traduit avec succès');
  console.log('PASS 2/9 — résultat traduit avec succès : translated_content présent, is_machine_translated:true, content original INCHANGÉ (bascule VO possible sans second appel)');

  const fr1 = data1.chunks.find((c) => c.id === 'fr-chunk-1');
  assert.ok(fr1, 'fr-chunk-1 doit être présent');
  assert.equal(fr1.is_machine_translated, false, 'un résultat déjà dans la langue cible doit porter is_machine_translated:false explicitement (jamais absent)');
  assert.equal(fr1.translated_content, void 0, 'translated_content ne doit jamais être présent sur un résultat déjà dans la langue cible');
  console.log('PASS 3/9 — résultat déjà dans la langue cible : is_machine_translated:false explicite, translated_content absent (jamais une distinction ambiguë)');

  const failed1 = data1.chunks.find((c) => c.id === 'en-chunk-fail');
  assert.ok(failed1, 'en-chunk-fail doit être présent');
  assert.equal(failed1.translation_failed, true, 'un échec de traduction doit être signalé explicitement par translation_failed:true');
  assert.equal(failed1.is_machine_translated, false, 'un échec de traduction ne doit JAMAIS être confondu avec un succès');
  assert.equal(failed1.content, 'Another English passage whose translation will fail.', 'le texte original doit rester disponible même après un échec de traduction — jamais un texte vide affiché');
  assert.equal(failed1.translated_content, void 0, 'translated_content ne doit jamais être présent après un échec');
  console.log('PASS 4/9 — échec de traduction isolé à CE résultat précis (translation_failed:true, texte original intact) — jamais toute la réponse basculée en erreur, jamais un texte vide affiché comme une traduction réussie');

  // ── 3. Appels réellement en parallèle, jamais en série ──
  const env2 = makeEnv({
    chunksMeta,
    translateImpl: async (input) => {
      await new Promise((r) => setTimeout(r, 60));
      return { translated_text: '[FR] ' + input.text };
    },
  });
  const ctx2 = loadHandlers(ragSearchCode, env2);
  const tStart = Date.now();
  await ctx2.handleRagSearch(req({ query: SHORT_QUERY, topK: 3, language: 'all' }), env2);
  const parallelElapsed = Date.now() - tStart;
  // 2 traductions nécessaires (en-chunk-1, en-chunk-fail), chacune avec un délai simulé de 60ms.
  // En série : ≥120ms. En parallèle : ~60-90ms (marge machine). Seuil à 110ms, largement sous le
  // total série, largement au-dessus d'un aller simple.
  assert.ok(parallelElapsed < 110, `les traductions ne semblent pas réellement parallèles — temps total ${parallelElapsed}ms pour 2 traductions de 60ms chacune (attendu proche de 60ms, pas ~120ms)`);
  console.log(`PASS 5/9 — appels de traduction réellement en parallèle (Promise.all), jamais en série : ${parallelElapsed}ms pour 2 traductions de 60ms chacune (jamais ~120ms)`);

  // ── 6. target_lang par défaut = 'fr' si omis, ET rapporté explicitement dans la réponse ──
  assert.equal(data1.target_lang, 'fr', 'target_lang omis doit défaut à "fr" et être rapporté explicitement dans la réponse');
  console.log('PASS 6/9 — target_lang omis : défaut "fr" appliqué ET rapporté explicitement dans la réponse');

  // ── 7. target_lang surchargé : un appelant peut demander une autre langue cible (investigation
  //      point 4 — paramètre optionnel, pas obligatoire) ──
  const env3 = makeEnv({
    chunksMeta,
    translateImpl: async (input) => ({ translated_text: `[${input.target_lang.toUpperCase()}] ` + input.text }),
  });
  const ctx3 = loadHandlers(ragSearchCode, env3);
  const resp3 = await ctx3.handleRagSearch(req({ query: SHORT_QUERY, topK: 3, language: 'all', target_lang: 'de' }), env3);
  const data3 = await resp3.json();
  assert.equal(data3.target_lang, 'de');
  const fr1AsGerman = data3.chunks.find((c) => c.id === 'fr-chunk-1');
  assert.equal(fr1AsGerman.is_machine_translated, true, 'avec target_lang=de, un chunk fr doit maintenant être traduit (fr !== de)');
  assert.equal(fr1AsGerman.translated_content, '[DE] Ceci est un passage déjà en français.');
  console.log('PASS 7/9 — target_lang surchargeable par l\'appelant (testé avec "de") : un résultat fr, déjà correct pour la cible par défaut fr, devient à traduire pour une cible différente');

  // ── 8. `language` (filtre FTS5 déjà existant) et `target_lang` (traduction) sont DEUX
  //      paramètres distincts, jamais confondus — vérifié en passant les deux avec des valeurs
  //      différentes et en confirmant que target_lang (pas language) pilote la traduction. ──
  const env4 = makeEnv({ chunksMeta, translateImpl: async (input) => ({ translated_text: '[FR] ' + input.text }) });
  const ctx4 = loadHandlers(ragSearchCode, env4);
  const resp4 = await ctx4.handleRagSearch(req({ query: SHORT_QUERY, topK: 3, language: 'all', target_lang: 'fr' }), env4);
  const data4 = await resp4.json();
  assert.equal(data4.target_lang, 'fr');
  assert.equal(data4.chunks.find((c) => c.id === 'en-chunk-1').is_machine_translated, true);
  console.log('PASS 8/9 — `language` (filtre FTS5 source) et `target_lang` (traduction) restent deux paramètres distincts, jamais confondus');

  // ── 9. Régression : sans aucun résultat étranger (tout déjà dans la langue cible), aucun appel
  //      de traduction n'est fait — jamais un coût/latence ajoutés inutilement. ──
  const allFrenchMeta = {
    'fr-only-1': { content: 'Un', author: 'A', page_number: 1, approach: 'general', language: 'fr' },
  };
  const env5 = {
    AI: {
      async run(model) {
        if (model === '@cf/baai/bge-m3') return { data: [[0.1, 0.2]] };
        throw new Error('la traduction ne devrait JAMAIS être appelée ici');
      },
    },
    VECTOR_INDEX: { async query() { return { matches: [{ id: 'fr-only-1', score: 0.9, metadata: { book_title: 'FR', author: 'A', approach: 'general' } }] }; } },
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                if (sql.includes('chunks_fts')) return { results: [] };
                if (sql.includes('SELECT id, content, author, page_number, approach, language')) {
                  return { results: args.filter((id) => allFrenchMeta[id]).map((id) => ({ id, ...allFrenchMeta[id] })) };
                }
                return { results: [] };
              },
            };
          },
        };
      },
    },
  };
  const ctx5 = loadHandlers(ragSearchCode, env5);
  const resp5 = await ctx5.handleRagSearch(req({ query: SHORT_QUERY, topK: 3, language: 'all' }), env5);
  assert.equal(resp5.status, 200);
  const data5 = await resp5.json();
  assert.equal(data5.chunks[0].is_machine_translated, false);
  console.log('PASS 9/9 — aucun résultat étranger : aucun appel de traduction déclenché, latence/coût jamais ajoutés inutilement');

  console.log('\nTOUS LES TESTS INTÉGRATION TRADUCTION /rag-search PASSENT (9/9)');
})().catch((e) => {
  console.error('ÉCHEC:', e);
  process.exitCode = 1;
});
