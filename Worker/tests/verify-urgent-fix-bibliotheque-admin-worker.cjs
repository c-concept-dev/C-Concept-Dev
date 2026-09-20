// Correctif urgent bibliotheque-admin.html / Worker — vérification réelle des fonctions Worker
// extraites TEXTUELLEMENT de index.js (jamais réimplémentées), exécutées dans un contexte vm
// avec des bindings DB/VECTOR_INDEX/AI factices. Même patron que 337bcda1-proxy-call-log-item21.cjs
// (fourni par Christophe) : pas de miniflare (indisponible dans ce bac à sable), un DB.prepare(sql)
// factice qui reconnaît le texte SQL réel et retourne des résultats canned + enregistre les binds.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
const start = source.indexOf('async function handleIngest(');
const end = source.indexOf('async function handleUpdateBookMeta(', start);
assert.ok(start > 0 && end > start, 'Bornes d\'extraction introuvables — index.js a changé de forme');
const code = source.slice(start, end);

function makeEnv({ dbHandler, vectorUpsertOk = true } = {}) {
  const dbCalls = [];
  const vectorUpserts = [];
  const vectorDeletes = [];
  const env = {
    AI: { async run(model, { text }) { return { data: text.map(() => [0.1, 0.2, 0.3]) }; } },
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                dbCalls.push({ sql, args });
                return { meta: { changes: 1 } };
              },
              async all() {
                dbCalls.push({ sql, args });
                return dbHandler ? dbHandler(sql, args) : { results: [] };
              },
              async first() {
                dbCalls.push({ sql, args });
                const r = dbHandler ? dbHandler(sql, args) : { results: [] };
                return (r.results || [])[0] || null;
              },
            };
          },
          async all() {
            dbCalls.push({ sql, args: [] });
            return dbHandler ? dbHandler(sql, []) : { results: [] };
          },
        };
      },
    },
    VECTOR_INDEX: {
      async upsert(entries) { if (!vectorUpsertOk) throw new Error('vector upsert failed'); vectorUpserts.push(...entries); },
      async deleteByIds(ids) { vectorDeletes.push(...ids); },
    },
  };
  return { env, dbCalls, vectorUpserts, vectorDeletes };
}

function loadHandlers(env) {
  const context = vm.createContext({
    Response, Request,
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
  // ── 1. chunk_index global : fourni par le client, utilisé tel quel (jamais recalculé) ──
  {
    const { env, dbCalls } = makeEnv();
    const context = loadHandlers(env);
    // Simule le 2e lot /ingest d'un livre de 25 chunks (le 1er lot, chunks 0-19, a déjà été
    // envoyé séparément) : chunk_index global 20..24, jamais 0..4 (bug confirmé : l'ancien
    // calcul local `i+j` sur CE seul appel aurait produit 0..4 ici).
    const batch = Array.from({ length: 5 }, (_, j) => ({
      id: `livre-x-${20 + j}`, chunk_index: 20 + j, content: 'texte ' + j, page: 10,
    }));
    const resp = await context.handleIngest(req({ chunks: batch, book_meta: { book_id: 'livre-x', title: 'Livre X' } }), env);
    const data = await resp.json();
    assert.equal(data.success, true);
    assert.equal(data.chunks_d1, 5);
    const insertCalls = dbCalls.filter(c => c.sql.includes('INSERT OR REPLACE INTO chunks'));
    assert.equal(insertCalls.length, 5);
    // Position de chunk_index lue dynamiquement depuis la requête réelle (jamais un index en
    // dur) — Lot 2/2 a inséré page_end avant chunk_index dans la liste de colonnes, ce qui
    // aurait cassé un index figé sans changer la correction elle-même.
    const cols = insertCalls[0].sql.match(/\(([^)]+)\)/)[1].split(',');
    const chunkIndexPos = cols.indexOf('chunk_index');
    const chunkIndexBound = insertCalls.map(c => c.args[chunkIndexPos]);
    assert.deepEqual(chunkIndexBound, [20, 21, 22, 23, 24], 'chunk_index doit être l\'indice global reçu, jamais recalculé 0..N sur ce seul lot');
    console.log('PASS 1/4 — chunk_index global utilisé tel quel, jamais recalculé localement');
  }

  // ── 2. Repli chunk_index local si un appelant plus ancien ne le fournit pas ──
  {
    const { env, dbCalls } = makeEnv();
    const context = loadHandlers(env);
    const batch = [{ id: 'livre-y-0', content: 'x' }, { id: 'livre-y-1', content: 'y' }]; // pas de chunk_index
    await context.handleIngest(req({ chunks: batch, book_meta: { book_id: 'livre-y', title: 'Livre Y' } }), env);
    const insertCalls = dbCalls.filter(c => c.sql.includes('INSERT OR REPLACE INTO chunks'));
    const cols2 = insertCalls[0].sql.match(/\(([^)]+)\)/)[1].split(',');
    const chunkIndexPos2 = cols2.indexOf('chunk_index');
    assert.deepEqual(insertCalls.map(c => c.args[chunkIndexPos2]), [0, 1], 'repli i+j attendu quand chunk_index est absent');
    console.log('PASS 2/4 — repli i+j conservé pour compatibilité si chunk_index absent');
  }

  // ── 3. /find-duplicates : deux gabarits fixes portés tels quels ──
  {
    const { env } = makeEnv({
      dbHandler(sql) {
        if (sql.includes('GROUP BY book_id, content')) {
          return { results: [
            { book_id: 'a', book_title: 'Livre A', content: 'x', cnt: 3 },
            { book_id: 'a', book_title: 'Livre A', content: 'y', cnt: 2 },
          ] };
        }
        return { results: [] };
      },
    });
    const context = loadHandlers(env);
    const resp = await context.handleFindDuplicates(env);
    const data = await resp.json();
    assert.deepEqual(data.books, [{ book_id: 'a', book_title: 'Livre A', duplicates: 3 }]); // (3-1)+(2-1)
    console.log('PASS 3/4 — /find-duplicates regroupe correctement par livre');
  }

  // ── 4. /purge-duplicates : DELETE D1 + nettoyage Vectorize sur les MÊMES ids ──
  {
    const idsToDelete = ['livre-a-3', 'livre-a-7'];
    const { env, dbCalls, vectorDeletes } = makeEnv({
      dbHandler(sql) {
        if (sql.startsWith('SELECT id FROM chunks WHERE book_id')) {
          return { results: idsToDelete.map(id => ({ id })) };
        }
        return { results: [] };
      },
    });
    const context = loadHandlers(env);
    const resp = await context.handlePurgeDuplicates(req({ book_id: 'livre-a' }), env);
    const data = await resp.json();
    assert.equal(data.success, true);
    assert.equal(data.deleted_chunks, 2);
    const deleteCall = dbCalls.find(c => c.sql.startsWith('DELETE FROM chunks WHERE id IN'));
    assert.ok(deleteCall, 'DELETE D1 attendu sur les ids sélectionnés');
    assert.deepEqual(deleteCall.args, idsToDelete);
    assert.deepEqual(vectorDeletes, idsToDelete, 'Vectorize doit être nettoyé pour les MÊMES ids que D1 — jamais oublié (bug confirmé de l\'ancien SQL brut)');
    console.log('PASS 4/4 — /purge-duplicates nettoie D1 ET Vectorize sur les mêmes ids');
  }

  console.log('\nTOUS LES TESTS WORKER PASSENT (4/4)');
})().catch(e => { console.error('ÉCHEC:', e); process.exitCode = 1; });
