// Lot 2/2 (P1) bibliotheque-admin/Worker — vérifications réelles des fonctions Worker extraites
// TEXTUELLEMENT de index.js (jamais réimplémentées), exécutées en vm avec des bindings
// DB/VECTOR_INDEX/AI factices. Même patron que le Lot 1 (verify-urgent-fix-bibliotheque-admin-worker.cjs).
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

const ingestCode = extract('async function handleIngest(', 'async function handleDeleteBook(');
const librarySearchCode = extract('async function handleLibrarySearch(', 'async function handleLibraryStats(');
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
  // ── 1. handleIngest stocke réellement page_end (migration 0006) ──
  {
    const dbCalls = [];
    const env = {
      AI: { async run() { return { data: [[0.1, 0.2]] }; } },
      DB: { prepare(sql) { return { bind(...args) { return { async run() { dbCalls.push({ sql, args }); return { meta: { changes: 1 } }; } }; } }; } },
      VECTOR_INDEX: { async upsert() {} },
    };
    const context = loadHandlers(ingestCode, env);
    const batch = [{ id: 'livre-z-0', chunk_index: 0, content: 'texte', page: 41, page_end: 43 }];
    await context.handleIngest(req({ chunks: batch, book_meta: { book_id: 'livre-z', title: 'Livre Z' } }), env);
    const insertCall = dbCalls.find(c => c.sql.includes('INSERT OR REPLACE INTO chunks'));
    assert.ok(insertCall, 'INSERT attendu');
    assert.match(insertCall.sql, /page_end/, 'la colonne page_end doit être dans la requête INSERT');
    const pageEndIdx = insertCall.sql.match(/\(([^)]+)\)/)[1].split(',').indexOf('page_end');
    assert.equal(insertCall.args[pageEndIdx], 43, 'page_end reçu (43) doit être stocké tel quel, jamais page_number (41)');
    console.log('PASS 1/4 — handleIngest stocke réellement page_end (distinct de page_number)');
  }

  // ── 2. handleIngest replie sur page_number si page_end absent (compat) ──
  {
    const dbCalls = [];
    const env = {
      AI: { async run() { return { data: [[0.1, 0.2]] }; } },
      DB: { prepare(sql) { return { bind(...args) { return { async run() { dbCalls.push({ sql, args }); return {}; } }; } }; } },
      VECTOR_INDEX: { async upsert() {} },
    };
    const context = loadHandlers(ingestCode, env);
    await context.handleIngest(req({ chunks: [{ id: 'x-0', chunk_index: 0, content: 't', page: 5 }], book_meta: { book_id: 'x', title: 'X' } }), env);
    const insertCall = dbCalls.find(c => c.sql.includes('INSERT OR REPLACE INTO chunks'));
    const cols = insertCall.sql.match(/\(([^)]+)\)/)[1].split(',');
    assert.equal(insertCall.args[cols.indexOf('page_end')], 5, 'repli sur page_number (5) attendu quand page_end est absent');
    console.log('PASS 2/4 — repli sur page_number conservé si page_end absent (appelant plus ancien)');
  }

  // ── 3. handleLibrarySearch — le paramètre `approach` (mort avant ce lot) filtre réellement ──
  {
    const chunksTable = [
      { id: 'v1', book_title: 'A', author: 'AA', chapter: null, page_number: 1, content: 'c1', approach: 'act', language: 'fr' },
      { id: 'v2', book_title: 'B', author: 'BB', chapter: null, page_number: 2, content: 'c2', approach: 'systemic', language: 'fr' },
    ];
    const env = {
      AI: { async run() { return { data: [[0.1, 0.2]] }; } },
      VECTOR_INDEX: { async query() { return { matches: [{ id: 'v1', score: 0.9 }, { id: 'v2', score: 0.8 }] }; } },
      DB: { prepare(sql) { return { bind(...ids) { return { async all() { return { results: chunksTable.filter(c => ids.includes(c.id)) }; } }; } }; } },
    };
    const context = loadHandlers(librarySearchCode, env);
    const resp = await context.handleLibrarySearch(req({ query: 'test', approach: 'act', topK: 5 }), env);
    const data = await resp.json();
    assert.equal(data.results.length, 1, 'approach="act" doit exclure le résultat "systemic" (avant ce correctif : paramètre ignoré, les deux étaient renvoyés)');
    assert.equal(data.results[0].approach, 'act');
    console.log('PASS 3/4 — handleLibrarySearch applique réellement le filtre approach (paramètre mort avant ce lot)');
  }

  // ── 4. handleRagSearch — filtre approach appliqué APRÈS réhydratation D1, jamais sur la
  // métadonnée Vectorize potentiellement périmée (update-book-meta ne synchronise que D1) ──
  {
    // Le chunk vectoriel porte encore l'ANCIENNE approche dans Vectorize ('general' — jamais
    // synchronisée), mais D1 (source réhydratée) a la VRAIE valeur à jour ('act').
    const chunksTable = [
      { id: 'vec-1', content: 'contenu', author: 'Auteur', page_number: 7, approach: 'act', language: 'fr' },
      { id: 'vec-2', content: 'autre', author: 'Auteur2', page_number: 9, approach: 'systemic', language: 'fr' },
    ];
    const env = {
      AI: { async run() { return { data: [[0.1, 0.2]] }; } },
      VECTOR_INDEX: {
        async query() {
          return { matches: [
            { id: 'vec-1', score: 0.9, metadata: { book_title: 'Livre', author: 'Auteur', approach: 'general' } },
            { id: 'vec-2', score: 0.8, metadata: { book_title: 'Livre2', author: 'Auteur2', approach: 'general' } },
          ] };
        },
      },
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async all() {
                  if (sql.includes('chunks_fts')) return { results: [] };
                  if (sql.includes('SELECT id, content, author, page_number, approach, language')) {
                    return { results: chunksTable.filter(c => args.includes(c.id)) };
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
    const resp = await context.handleRagSearch(req({ query: 'test', approach: 'act', topK: 5 }), env);
    const data = await resp.json();
    assert.equal(data.chunks.length, 1, 'un seul chunk doit matcher approach="act" (vec-1, via D1 réhydraté) — vec-2 (systemic) doit être exclu');
    assert.equal(data.chunks[0].id, 'vec-1');
    assert.equal(data.chunks[0].approach, 'act', 'la valeur retournée doit être celle de D1 (act), jamais la métadonnée Vectorize périmée (general)');
    console.log('PASS 4/4 — handleRagSearch filtre après réhydratation D1 (jamais sur la métadonnée Vectorize périmée)');
  }

  console.log('\nTOUS LES TESTS WORKER LOT 2 PASSENT (4/4)');
})().catch(e => { console.error('ÉCHEC:', e); process.exitCode = 1; });
