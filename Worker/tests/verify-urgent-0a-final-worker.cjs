// STUDIO CLINIQUE — RAPPEL URGENT 0A-FINAL — vérifications Worker réelles (fonctions extraites
// TEXTUELLEMENT de index.js, jamais réimplémentées).
//   1. handleDeleteBook : un échec Vectorize APRÈS succès D1 renvoie un état PARTIAL explicite
//      (deleted_d1, deleted_vectorize, failed_vector_ids), jamais un succès ambigu.
//   2. handlePurgeDuplicates : même garantie.
//   3. handleRagSearch : la fusion vector-first (concaténation-puis-slice) est remplacée par une
//      fusion par rang réciproque (RRF) — un résultat FTS5 authentiquement bien classé survit au
//      topK même quand le vectoriel occupe déjà topK résultats distincts.
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
const deleteBookCode = extract('async function handleDeleteBook(', 'async function handleFindDuplicates(');
const purgeCode = extract('async function handlePurgeDuplicates(', 'async function handleUpdateBookMeta(');
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

(async () => {
  // ── 1. handleDeleteBook — échec Vectorize après succès D1 → PARTIAL explicite ──
  {
    const env = {
      DB: {
        prepare(sql) {
          return {
            bind() {
              return {
                async all() { return { results: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }; },
                async run() { return {}; },
              };
            },
          };
        },
      },
      VECTOR_INDEX: { async deleteByIds() { throw new Error('vectorize down'); } },
    };
    const context = loadHandlers(deleteBookCode, env);
    const resp = await context.handleDeleteBook(req({ book_id: 'livre-p' }), env);
    const data = await resp.json();
    assert.equal(data.success, false, 'success doit être false sur un échec Vectorize (jamais un succès ambigu)');
    assert.equal(data.partial, true);
    assert.equal(data.deleted_d1, 3);
    assert.equal(data.deleted_vectorize, 0);
    assert.deepEqual(data.failed_vector_ids.sort(), ['a', 'b', 'c']);
    console.log('PASS 1/3 — handleDeleteBook renvoie PARTIAL explicite sur échec Vectorize après succès D1');
  }

  // ── 2. handlePurgeDuplicates — même garantie ──
  {
    const env = {
      DB: {
        prepare(sql) {
          return {
            bind() {
              return {
                async all() { return { results: [{ id: 'x' }, { id: 'y' }] }; },
                async run() { return {}; },
              };
            },
          };
        },
      },
      VECTOR_INDEX: { async deleteByIds() { throw new Error('vectorize down'); } },
    };
    const context = loadHandlers(purgeCode, env);
    const resp = await context.handlePurgeDuplicates(req({ book_id: 'livre-q' }), env);
    const data = await resp.json();
    assert.equal(data.success, false);
    assert.equal(data.partial, true);
    assert.equal(data.deleted_d1, 2);
    assert.equal(data.deleted_vectorize, 0);
    assert.deepEqual(data.failed_vector_ids.sort(), ['x', 'y']);
    console.log('PASS 2/3 — handlePurgeDuplicates renvoie PARTIAL explicite sur échec Vectorize après succès D1');
  }

  // ── 3. handleRagSearch — RRF corrige le biais vector-first ──
  {
    // 15 résultats vectoriels distincts (largement >topK=5) — avant le correctif, ils
    // occupaient à eux seuls la totalité du topK final, quel que soit le classement FTS5.
    const vecMatches = Array.from({ length: 15 }, (_, i) => ({
      id: 'vec-' + i, score: 0.5 - i * 0.01, metadata: { book_title: 'V' + i, author: 'A', approach: 'general' },
    }));
    // Un seul résultat FTS5, mais TRÈS bien classé (rang 0 côté lexical) — doit survivre au
    // topK=5 final si la fusion est honnête, alors qu'il aurait été mécaniquement exclu avant
    // ce correctif (toujours après les 15 résultats vectoriels dans la concaténation).
    const ftsRow = { id: 'fts-star', book_title: 'Lexical', author: 'A', page_number: 1, approach: 'general', language: 'fr', content: 'contenu lexical pertinent' };
    const env = {
      AI: { async run() { return { data: [[0.1, 0.2]] }; } },
      VECTOR_INDEX: { async query() { return { matches: vecMatches }; } },
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async all() {
                  if (sql.includes('chunks_fts')) return { results: [ftsRow] };
                  if (sql.includes('SELECT id, content, author, page_number, approach, language')) {
                    const ids = args;
                    return { results: vecMatches.filter(m => ids.includes(m.id)).map(m => ({ id: m.id, content: 'c', author: 'A', page_number: 1, approach: 'general', language: 'fr' })) };
                  }
                  return { results: [] };
                },
              };
            },
          };
        },
      },
    };
    const context = loadHandlers(ragSearchCode, env);
    const resp = await context.handleRagSearch(req({ query: 'mots test requete', topK: 5 }), env);
    const data = await resp.json();
    const ids = data.chunks.map(c => c.id);
    assert.ok(ids.includes('fts-star'), `ÉCHEC : le résultat lexical bien classé (fts-star) n'a pas survécu au topK=5 — résultat obtenu : ${JSON.stringify(ids)} (biais vector-first non corrigé)`);
    console.log(`PASS 3/3 — un résultat FTS5 bien classé survit au topK malgré 15 résultats vectoriels concurrents (RRF) : ${JSON.stringify(ids)}`);
  }

  console.log('\nTOUS LES TESTS 0A-FINAL WORKER PASSENT (3/3)');
})().catch(e => { console.error('ÉCHEC:', e); process.exitCode = 1; });
