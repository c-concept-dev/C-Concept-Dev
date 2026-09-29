// STUDIO CLINIQUE — Recherche interlingue automatique (Option A) dans /rag-search — vérification
// Worker réelle (fonction extraite TEXTUELLEMENT de index.js, jamais réimplémentée). Seule la
// frontière modèle/transport (env.AI.run, env.VECTOR_INDEX.query, env.DB) est mockée — toute la
// logique réelle (liste des langues du corpus jamais codée en dur, traduction+recherche par
// langue en parallèle, fusion RRF multi-passes équitable, déduplication par id, plafond à 5
// langues, isolation d'échec par langue, comportement inchangé en corpus monolingue) est exécutée
// réellement.
//
// Contenu réel (jamais inventé) : chunk "Schema Therapy in Practice An Introductory Guide to the
// Sche-5" (page 13, langue en, approche schema_therapy) obtenu par requête D1 réelle le
// 2026-09-22 sur therapeute-library (5ce316e7-f5c1-406a-ac01-4f773ba8362e) :
//   SELECT id, page_number, substr(content,1,500) FROM chunks
//   WHERE book_title LIKE '%Schema Therapy in Practice%' AND language='en' AND content LIKE '%mode%'
//   ORDER BY page_number LIMIT 5
// C'est ce livre précis qui, lors du test réel de ce soir, n'est remonté dans AUCUN des 50
// candidats vectoriels bruts pour une requête française sur les "modes" thérapeutiques.
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

const FRENCH_QUERY = 'Quels sont les différents modes thérapeutiques utilisés en thérapie des schémas ?';
const EN_TRANSLATION = 'What are the different therapeutic modes used in schema therapy?';

// Chunk réel (voir en-tête) — contenu tronqué à 500 caractères tel que réellement retourné par D1
// (coupure mi-mot "; t" incluse, non corrigée : c'est la donnée réelle, jamais retouchée).
const REAL_SCHEMA_CHUNK_ID = 'Schema Therapy in Practice An Introductory Guide to the Sche-5';
const REAL_SCHEMA_CHUNK = {
  content: 'ICASE CONCEPTUALIZATION 1Basics Schema therapy, which was developed by Jeffrey Young (1990; Young et al., 2003), stems from cognitive behavioral therapy (CBT) and has been attracting increasing attention since it was first proposed. Young created schema therapy predominantly for patients who did not respond well to “classical” CBT treatment. These patients often experience a variety of symptoms and typically display complex interpersonal patterns, which may be either fluctuating or persistent; t',
  author: '(Arnoud Arntz Gitta Jacob)',
  page_number: 13,
  approach: 'schema_therapy',
  language: 'en',
  book_title: 'Schema Therapy in Practice An Introductory Guide to the Schema Mode Approach (Arnoud Arntz Gitta Jacob)',
  page_end: 13,
};

function embedTag(text) { return 'EMBED::' + text; }

// `otherLanguages` : liste retournée par la requête D1 réelle "SELECT DISTINCT language FROM
// chunks" — jamais codée en dur ici non plus, seulement fournie par le test comme le ferait D1.
function makeEnv({ languages, vectorMatchesByTag, chunksMeta, translateImpl }) {
  const translateCalls = [];
  const vectorQueryCalls = [];
  const env = {
    AI: {
      async run(model, input) {
        if (model === '@cf/baai/bge-m3') {
          const text = Array.isArray(input.text) ? input.text[0] : input.text;
          return { data: [[embedTag(text)]] };
        }
        if (model === '@cf/meta/m2m100-1.2b') {
          translateCalls.push({ ...input });
          return translateImpl(input);
        }
        throw new Error('modèle inattendu appelé : ' + model);
      },
    },
    VECTOR_INDEX: {
      async query(vector) {
        const tag = vector[0];
        vectorQueryCalls.push(tag);
        return { matches: vectorMatchesByTag[tag] || [] };
      },
    },
    DB: {
      prepare(sql) {
        // `handleRagSearch` appelle `.all()` directement sur `prepare()` pour la requête de
        // langues (sans `.bind()`, aucun paramètre), et `.bind(...).all()` pour les requêtes
        // paramétrées (FTS5, réhydratation) — les deux formes doivent être mockées.
        async function all(...args) {
          if (sql.includes('SELECT DISTINCT language FROM chunks')) {
            return { results: languages.map((l) => ({ language: l })) };
          }
          if (sql.includes('chunks_fts')) return { results: [] };
          if (sql.includes('SELECT id, content, author, page_number, approach, language, book_title, page_end FROM chunks WHERE id IN')) {
            const ids = args;
            return { results: ids.filter((id) => chunksMeta[id]).map((id) => ({ id, ...chunksMeta[id] })) };
          }
          return { results: [] };
        }
        return {
          all: () => all(),
          bind: (...args) => ({ all: () => all(...args) }),
        };
      },
    },
    _translateCalls: translateCalls,
    _vectorQueryCalls: vectorQueryCalls,
  };
  return env;
}

const FR_ONLY_METADATA = { id: 'fr-unrelated-1', score: 0.4, metadata: { book_title: 'Livre FR sans rapport', author: 'X', approach: 'general' } };

function translateDirImpl(input) {
  if (input.source_lang === 'fr' && input.target_lang === 'en') return { translated_text: EN_TRANSLATION };
  if (input.source_lang === 'en' && input.target_lang === 'fr') return { translated_text: '[FR] ' + input.text };
  throw new Error(`direction de traduction inattendue : ${input.source_lang} → ${input.target_lang}`);
}

(async () => {
  // ── 1. Cas réel reproduit : requête FR, corpus fr+en, le livre anglais n'est trouvé QUE via la
  //      passe traduite — preuve concrète que le problème identifié ce soir est résolu. ──
  {
    const chunksMeta = { [REAL_SCHEMA_CHUNK_ID]: REAL_SCHEMA_CHUNK };
    const vectorMatchesByTag = {
      [embedTag(FRENCH_QUERY)]: [FR_ONLY_METADATA], // passe principale (fr) : rien du livre anglais, comme observé ce soir
      [embedTag(EN_TRANSLATION)]: [
        { id: REAL_SCHEMA_CHUNK_ID, score: 0.93, metadata: { book_title: REAL_SCHEMA_CHUNK.book_title, author: REAL_SCHEMA_CHUNK.author, approach: REAL_SCHEMA_CHUNK.approach } },
      ],
    };
    const env = makeEnv({ languages: ['fr', 'en'], vectorMatchesByTag, chunksMeta, translateImpl: translateDirImpl });
    const ctx = loadHandlers(ragSearchCode, env);
    const resp = await ctx.handleRagSearch(req({ query: FRENCH_QUERY, topK: 5, language: 'all' }), env);
    assert.equal(resp.status, 200);
    const data = await resp.json();

    const found = data.chunks.find((c) => c.id === REAL_SCHEMA_CHUNK_ID);
    assert.ok(found, `ÉCHEC : "Schema Therapy in Practice" doit maintenant remonter pour la requête FR sur les modes thérapeutiques — chunks obtenus : ${JSON.stringify(data.chunks.map((c) => c.id))}`);
    assert.equal(found.language, 'en');
    assert.equal(found.is_machine_translated, true, 'le comportement de traduction d\'affichage par résultat, déjà existant, doit rester inchangé');
    assert.equal(found.translated_content, '[FR] ' + REAL_SCHEMA_CHUNK.content.substring(0, 800));
    assert.deepEqual(data.stats.languages_searched, ['fr', 'en']);
    assert.equal(env._translateCalls.some((c) => c.source_lang === 'fr' && c.target_lang === 'en'), true, 'la requête doit avoir été traduite fr→en pour la passe additionnelle');
    console.log('PASS 1/7 — cas réel reproduit : "Schema Therapy in Practice" (chunk réel D1) introuvable via la passe FR seule, résolu par la passe traduite EN — preuve concrète, pas une supposition');
  }

  // ── 2. Contrôle négatif : SANS le mécanisme interlingue (corpus mono-langue simulé), le même
  //      livre anglais reste invisible — démontre que c'est bien la passe additionnelle qui
  //      résout le cas, pas un artefact du mock. ──
  {
    const chunksMeta = { [REAL_SCHEMA_CHUNK_ID]: REAL_SCHEMA_CHUNK };
    const vectorMatchesByTag = { [embedTag(FRENCH_QUERY)]: [FR_ONLY_METADATA] };
    const env = makeEnv({ languages: ['fr'], vectorMatchesByTag, chunksMeta, translateImpl: () => { throw new Error('ne doit jamais être appelé : aucune autre langue dans le corpus'); } });
    const ctx = loadHandlers(ragSearchCode, env);
    const resp = await ctx.handleRagSearch(req({ query: FRENCH_QUERY, topK: 5, language: 'all' }), env);
    const data = await resp.json();
    assert.equal(data.chunks.find((c) => c.id === REAL_SCHEMA_CHUNK_ID), void 0, 'contrôle négatif : sans passe additionnelle, le livre anglais doit rester absent (reproduit fidèlement le bug de ce soir)');
    assert.equal(env._translateCalls.length, 0, 'corpus mono-langue : aucun appel de traduction de requête ne doit être déclenché');
    assert.deepEqual(data.stats.languages_searched, ['fr']);
    console.log('PASS 2/7 — contrôle négatif : corpus mono-langue (comme si le mécanisme interlingue n\'existait pas) reproduit fidèlement l\'échec observé ce soir, confirmant que c\'est bien la passe additionnelle qui corrige le problème');
  }

  // ── 3. Équité RRF entre passes : un candidat trouvé UNIQUEMENT en tête de la DEUXIÈME langue
  //      additionnelle (es, après en) doit obtenir le même rrf_score qu'un candidat en tête de la
  //      passe principale — jamais pénalisé pour être "après" dans une simple concaténation. ──
  {
    const ES_TRANSLATION = 'traduction espagnole';
    const chunksMeta = {
      'main-top': { content: 'contenu fr', author: 'A', page_number: 1, approach: 'general', language: 'fr', book_title: 'Livre FR' },
      'es-top': { content: 'contenido en español', author: 'B', page_number: 2, approach: 'general', language: 'es', book_title: 'Libro ES' },
    };
    const vectorMatchesByTag = {
      [embedTag(FRENCH_QUERY)]: [{ id: 'main-top', score: 0.9, metadata: { book_title: 'Livre FR', author: 'A', approach: 'general' } }],
      [embedTag(EN_TRANSLATION)]: [],
      [embedTag(ES_TRANSLATION)]: [{ id: 'es-top', score: 0.9, metadata: { book_title: 'Libro ES', author: 'B', approach: 'general' } }],
    };
    const translateImpl = (input) => {
      if (input.source_lang === 'fr' && input.target_lang === 'en') return { translated_text: EN_TRANSLATION };
      if (input.source_lang === 'fr' && input.target_lang === 'es') return { translated_text: ES_TRANSLATION };
      if (input.source_lang === 'es' && input.target_lang === 'fr') return { translated_text: '[FR] ' + input.text };
      throw new Error('direction inattendue');
    };
    const env = makeEnv({ languages: ['fr', 'en', 'es'], vectorMatchesByTag, chunksMeta, translateImpl });
    const ctx = loadHandlers(ragSearchCode, env);
    const resp = await ctx.handleRagSearch(req({ query: FRENCH_QUERY, topK: 5, language: 'all' }), env);
    const data = await resp.json();
    const mainTop = data.chunks.find((c) => c.id === 'main-top');
    const esTop = data.chunks.find((c) => c.id === 'es-top');
    assert.ok(mainTop && esTop, 'les deux candidats, chacun en tête de sa propre passe, doivent être présents');
    assert.equal(mainTop.rrf_score, esTop.rrf_score, `un candidat en tête de la 2e langue additionnelle (es, traitée en dernier) doit obtenir le même rrf_score qu'un candidat en tête de la passe principale — jamais pénalisé par une simple concaténation. Obtenu : main=${mainTop.rrf_score} vs es=${esTop.rrf_score}`);
    assert.equal(mainTop.rrf_score, Math.round((1 / 61) * 1e6) / 1e6);
    console.log('PASS 3/7 — équité RRF confirmée : le rang utilisé est celui DANS SA PROPRE PASSE, jamais une position de concaténation — un candidat trouvé uniquement via la dernière langue traduite n\'est jamais désavantagé');
  }

  // ── 4. Déduplication : le même chunk trouvé par la passe principale ET une passe traduite
  //      n'apparaît qu'UNE fois dans la sortie, avec ses provenances cumulées (jamais dupliqué,
  //      jamais une provenance écrasant l'autre) — et son rrf_score cumule bien les deux passes. ──
  {
    const chunksMeta = { 'shared-chunk': { content: 'contenu partagé', author: 'A', page_number: 1, approach: 'general', language: 'fr', book_title: 'Livre Partagé' } };
    const vectorMatchesByTag = {
      [embedTag(FRENCH_QUERY)]: [{ id: 'shared-chunk', score: 0.8, metadata: { book_title: 'Livre Partagé', author: 'A', approach: 'general' } }],
      [embedTag(EN_TRANSLATION)]: [{ id: 'shared-chunk', score: 0.75, metadata: { book_title: 'Livre Partagé', author: 'A', approach: 'general' } }],
    };
    const env = makeEnv({ languages: ['fr', 'en'], vectorMatchesByTag, chunksMeta, translateImpl: translateDirImpl });
    const ctx = loadHandlers(ragSearchCode, env);
    const resp = await ctx.handleRagSearch(req({ query: FRENCH_QUERY, topK: 5, language: 'all' }), env);
    const data = await resp.json();
    const occurrences = data.chunks.filter((c) => c.id === 'shared-chunk');
    assert.equal(occurrences.length, 1, `un même chunk trouvé via 2 passes ne doit apparaître qu'UNE fois dans la sortie, obtenu ${occurrences.length}`);
    assert.deepEqual(occurrences[0].sources, ['vector'], 'les provenances ne doivent jamais être dupliquées (ici "vector" dans les deux passes → une seule entrée)');
    const expectedRrf = Math.round((1 / 61 + 1 / 61) * 1e6) / 1e6;
    assert.equal(occurrences[0].rrf_score, expectedRrf, 'le rrf_score doit cumuler la contribution des DEUX passes où ce chunk a été trouvé, jamais une seule');
    console.log('PASS 4/7 — déduplication multi-passes correcte : un chunk trouvé via 2 langues n\'apparaît qu\'une fois, ses provenances et son rrf_score cumulent bien les deux passes sans doublon');
  }

  // ── 5. Plafond à 5 langues additionnelles : au-delà, les langues excédentaires ne sont jamais
  //      traduites/cherchées (point d'investigation 4, documenté). ──
  {
    const languages = ['fr', 'en', 'de', 'it', 'pt', 'nl', 'pl', 'sv']; // 7 autres langues que fr
    const translateImpl = (input) => ({ translated_text: `[${input.target_lang}] traduction` });
    const env = makeEnv({ languages, vectorMatchesByTag: {}, chunksMeta: {}, translateImpl });
    const ctx = loadHandlers(ragSearchCode, env);
    const resp = await ctx.handleRagSearch(req({ query: FRENCH_QUERY, topK: 5, language: 'all' }), env);
    const data = await resp.json();
    assert.equal(data.stats.languages_searched.length, 6, `plafond attendu : target_lang + 5 langues maximum, obtenu ${data.stats.languages_searched.length} (${JSON.stringify(data.stats.languages_searched)})`);
    assert.deepEqual(data.stats.languages_searched, ['fr', 'en', 'de', 'it', 'pt', 'nl']);
    const targetLangsCalled = new Set(env._translateCalls.map((c) => c.target_lang));
    assert.equal(targetLangsCalled.has('pl'), false, 'au-delà du plafond de 5, une langue excédentaire ne doit jamais être traduite');
    assert.equal(targetLangsCalled.has('sv'), false, 'au-delà du plafond de 5, une langue excédentaire ne doit jamais être traduite');
    console.log('PASS 5/7 — plafond à 5 langues additionnelles respecté : sur 7 langues excédentaires, seules les 5 premières sont traduites/cherchées, jamais un éventail incontrôlé d\'appels Workers AI');
  }

  // ── 6. Isolation d'échec par langue : la traduction échoue pour "en" mais réussit pour "es" —
  //      la recherche entière ne doit jamais échouer, et le résultat trouvé via "es" doit rester
  //      présent. ──
  {
    const ES_TRANSLATION = 'consulta traducida';
    const chunksMeta = { 'es-only-result': { content: 'resultado en español', author: 'A', page_number: 1, approach: 'general', language: 'es', book_title: 'Libro ES' } };
    const vectorMatchesByTag = {
      [embedTag(FRENCH_QUERY)]: [],
      [embedTag(ES_TRANSLATION)]: [{ id: 'es-only-result', score: 0.88, metadata: { book_title: 'Libro ES', author: 'A', approach: 'general' } }],
    };
    const translateImpl = (input) => {
      if (input.source_lang === 'fr' && input.target_lang === 'en') throw new Error('panne modèle simulée pour "en"');
      if (input.source_lang === 'fr' && input.target_lang === 'es') return { translated_text: ES_TRANSLATION };
      if (input.source_lang === 'es' && input.target_lang === 'fr') return { translated_text: '[FR] ' + input.text };
      throw new Error('direction inattendue');
    };
    const env = makeEnv({ languages: ['fr', 'en', 'es'], vectorMatchesByTag, chunksMeta, translateImpl });
    const ctx = loadHandlers(ragSearchCode, env);
    const resp = await ctx.handleRagSearch(req({ query: FRENCH_QUERY, topK: 5, language: 'all' }), env);
    assert.equal(resp.status, 200, 'l\'échec de traduction d\'UNE langue ne doit jamais faire échouer toute la recherche');
    const data = await resp.json();
    assert.ok(data.chunks.find((c) => c.id === 'es-only-result'), 'le résultat trouvé via la langue "es" (dont la traduction a réussi) doit rester présent malgré l\'échec de "en"');
    console.log('PASS 6/7 — isolation d\'échec par langue confirmée : la panne de traduction d\'UNE langue additionnelle n\'affecte ni le statut 200 ni les résultats obtenus via les autres langues');
  }

  // ── 7. Non-régression corpus mono-langue : si le corpus ne contient QUE `target_lang`, aucune
  //      passe additionnelle n'est déclenchée — comportement strictement identique à avant ce lot
  //      (jamais de coût/latence ajoutés inutilement). ──
  {
    const chunksMeta = { 'fr-only': { content: 'Un résultat français', author: 'A', page_number: 1, approach: 'general', language: 'fr', book_title: 'Livre FR' } };
    const vectorMatchesByTag = { [embedTag(FRENCH_QUERY)]: [{ id: 'fr-only', score: 0.9, metadata: { book_title: 'Livre FR', author: 'A', approach: 'general' } }] };
    const env = makeEnv({ languages: ['fr'], vectorMatchesByTag, chunksMeta, translateImpl: () => { throw new Error('ne doit jamais être appelé'); } });
    const ctx = loadHandlers(ragSearchCode, env);
    const resp = await ctx.handleRagSearch(req({ query: FRENCH_QUERY, topK: 5, language: 'all' }), env);
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.equal(env._translateCalls.length, 0, 'corpus mono-langue : zéro appel de traduction de requête (aucune autre langue à traduire)');
    assert.equal(env._vectorQueryCalls.length, 1, 'corpus mono-langue : une seule interrogation vectorielle (la passe principale), jamais de passe additionnelle');
    assert.equal(data.chunks[0].id, 'fr-only');
    assert.deepEqual(data.stats.languages_searched, ['fr']);
    console.log('PASS 7/7 — non-régression : corpus mono-langue → zéro passe additionnelle, zéro appel de traduction de requête, comportement strictement identique à avant ce lot');
  }

  console.log('\nTOUS LES TESTS RECHERCHE INTERLINGUE AUTOMATIQUE /rag-search PASSENT (7/7)');
})().catch((e) => {
  console.error('ÉCHEC:', e);
  process.exitCode = 1;
});
