// STUDIO CLINIQUE — MICRO-LOT "RRF-CLOSE" — vérification Worker réelle (fonction extraite
// TEXTUELLEMENT de index.js, jamais réimplémentée).
//   La déduplication de handleRagSearch gardait seulement la PREMIÈRE occurrence rencontrée
//   dans [...vecChunks, ...ftsChunks] — toujours vectorielle en premier — donc un chunk trouvé
//   par les DEUX moteurs perdait systématiquement sa provenance FTS5 (source:"vector" seul).
//   Ce test prouve qu'un chunk présent en rang 1 des deux côtés porte bien
//   sources:["vector","fts5"] (jamais un seul), avec vector_rank/fts_rank/rrf_score exposés.
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

(async () => {
  // Un chunk 'dual-hit' présent en rang 0 (le meilleur) des DEUX côtés, entouré d'assez de
  // résultats vectoriels distincts pour reproduire les conditions réelles de topK.
  const vecMatches = [
    { id: 'dual-hit', score: 0.9, metadata: { book_title: 'D', author: 'A', approach: 'general' } },
    ...Array.from({ length: 10 }, (_, i) => ({
      id: 'vec-only-' + i, score: 0.5 - i * 0.01, metadata: { book_title: 'V' + i, author: 'A', approach: 'general' },
    })),
  ];
  const ftsRows = [
    { id: 'dual-hit', book_title: 'D', author: 'A', page_number: 1, approach: 'general', language: 'fr', content: 'contenu partagé' },
    { id: 'fts-only', book_title: 'F', author: 'A', page_number: 2, approach: 'general', language: 'fr', content: 'contenu lexical seul' },
  ];
  const env = {
    AI: { async run() { return { data: [[0.1, 0.2]] }; } },
    VECTOR_INDEX: { async query() { return { matches: vecMatches }; } },
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                if (sql.includes('chunks_fts')) return { results: ftsRows };
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

  const dual = data.chunks.find(c => c.id === 'dual-hit');
  assert.ok(dual, `ÉCHEC : dual-hit absent du résultat final — ${JSON.stringify(data.chunks.map(c => c.id))}`);
  assert.deepEqual(
    [...dual.sources].sort(),
    ['fts5', 'vector'],
    `ÉCHEC : sources devrait contenir les deux provenances, obtenu ${JSON.stringify(dual.sources)} (provenance double toujours perdue)`
  );
  assert.equal(dual.vector_rank, 1, 'ÉCHEC : vector_rank devrait être 1 (meilleur rang vectoriel, 1-based)');
  assert.equal(dual.fts_rank, 1, 'ÉCHEC : fts_rank devrait être 1 (meilleur rang FTS5, 1-based)');
  assert.ok(dual.rrf_score > 0, 'ÉCHEC : rrf_score devrait être exposé et positif');
  console.log(`PASS 1/2 — chunk trouvé par les deux moteurs : sources=${JSON.stringify(dual.sources)}, vector_rank=${dual.vector_rank}, fts_rank=${dual.fts_rank}, rrf_score=${dual.rrf_score}`);

  const ftsOnly = data.chunks.find(c => c.id === 'fts-only');
  assert.ok(ftsOnly, 'ÉCHEC : fts-only absent (régression du correctif RRF précédent)');
  assert.deepEqual(ftsOnly.sources, ['fts5']);
  assert.equal(ftsOnly.vector_rank, null);
  console.log('PASS 2/2 — chunk FTS5-seul : sources=["fts5"], vector_rank=null (jamais une fausse provenance vectorielle)');

  console.log('\nTOUS LES TESTS RRF-CLOSE WORKER PASSENT (2/2)');
})().catch(e => { console.error('ÉCHEC:', e); process.exitCode = 1; });
