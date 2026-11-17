const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `bornes introuvables : ${startMarker}`);
  return source.slice(start, end);
}

const code = [
  extract('async function handleLibraryStats(', 'async function handleVerifyBookIndex('),
  extract('async function handleUpdateBookMeta(', '// ── Phase B0.3'),
  extract('async function handleRagSearch(', 'async function handleRagStats('),
].join('\n');

const context = vm.createContext({
  Response,
  Request,
  __name() {},
  jsonErr: (message, status) => new Response(JSON.stringify({ error: message }), { status }),
  json: (value) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }),
});
vm.runInContext(code, context);

const row = {
  id: 'ouvrage-1-0',
  book_id: 'ouvrage-1',
  book_title: '05-Ngô',
  author: 'Ngô',
  language: 'fr',
  approach: 'act',
  page_number: 1,
  page_end: 1,
  content: 'Un passage clinique utile.',
};

const env = {
  AI: { async run() { return { data: [[0.2, 0.4]] }; } },
  VECTOR_INDEX: {
    async query() {
      // Métadonnée volontairement périmée : /rag-search doit rendre le titre D1 frais.
      return { matches: [{ id: row.id, score: 0.91, metadata: {
        book_title: '05-Ngô', author: row.author, approach: row.approach, language: row.language,
      } }] };
    },
  },
  DB: {
    prepare(sql) {
      const statement = {
        bind(...args) {
          return {
            async run() {
              if (sql.startsWith('UPDATE chunks SET')) {
                const titlePosition = sql.split('SET ')[1].split(' WHERE')[0]
                  .split(', ').findIndex(part => part === 'book_title = ?');
                if (titlePosition >= 0) row.book_title = args[titlePosition];
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
            async all() {
              if (sql.includes('chunks_fts')) return { results: [] };
              if (sql.includes('SELECT id, content, author, page_number, approach, language, book_title, page_end')) {
                return { results: [{ ...row }] };
              }
              return { results: [] };
            },
          };
        },
        async first() {
          if (sql.includes('COUNT(DISTINCT book_id)')) return { n: 1 };
          if (sql.includes('COUNT(*)')) return { count: 1 };
          return null;
        },
        async all() {
          if (sql.includes('SELECT DISTINCT language FROM chunks')) return { results: [{ language: 'fr' }] };
          if (sql.includes('SELECT DISTINCT book_id')) return { results: [{ ...row }] };
          if (sql.includes('GROUP BY approach')) return { results: [{ approach: 'act', count: 1 }] };
          return { results: [] };
        },
      };
      return statement;
    },
  },
};

function request(pathname, body) {
  return new Request(`https://clone-proxy.test${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

(async () => {
  const correctedTitle = "La thérapie d'acceptation et d'engagement — Que sais-je ?";
  const updateResponse = await context.handleUpdateBookMeta(request('/update-book-meta', {
    book_id: row.book_id, book_title: correctedTitle,
  }), env);
  assert.equal(updateResponse.status, 200);

  const stats = await (await context.handleLibraryStats(env)).json();
  const rag = await (await context.handleRagSearch(request('/rag-search', {
    query: 'acceptation engagement', language: 'fr', topK: 5,
  }), env)).json();

  assert.equal(stats.books[0].book_title, correctedTitle,
    'Sourcelis doit afficher le titre D1 corrigé');
  assert.equal(rag.chunks[0].book_title, correctedTitle,
    '/rag-search doit réhydrater le même titre D1, même si Vectorize est périmé');
  assert.equal(stats.books[0].book_title, rag.chunks[0].book_title);

  console.log('PASS S4 — Sourcelis et /rag-search rendent exactement le même titre corrigé');
})().catch((error) => {
  console.error('ÉCHEC S4:', error);
  process.exitCode = 1;
});
