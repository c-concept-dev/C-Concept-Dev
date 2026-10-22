const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
const start = source.indexOf('async function handleVerifyBookIndex(');
const end = source.indexOf('async function handleIngest(', start);
assert.ok(start > 0 && end > start, 'Production handler not found');
assert.match(source.slice(source.indexOf('if (!adocIsPublicRoute('), start),
  /if \(p === "\/verify-book-index" && request2\.method === "POST"\)/,
  'Verification route must remain after the shared X-API-Key guard');
const context = vm.createContext({
  Request, Response, console,
  __name() {},
  json: value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }),
  jsonErr: (message, status) => new Response(JSON.stringify({ error: message }), { status }),
});
vm.runInContext(source.slice(start, end), context);

function environment({ count = 5, found = ['book-0', 'book-2', 'book-4'], failVector = false } = {}) {
  const calls = { sql: [], ids: [] };
  return {
    calls,
    env: {
      DB: { prepare(sql) { calls.sql.push(sql); return { bind(bookId) {
        assert.equal(bookId, 'book');
        return { async first() { return { n: count }; } };
      } }; } },
      VECTOR_INDEX: { async getByIds(ids) {
        calls.ids.push(...ids);
        if (failVector) throw new Error('temporary Vectorize failure');
        return found.map(id => ({ id, values: [] }));
      } },
    },
  };
}
const request = body => new Request('https://example.test/verify-book-index', {
  method: 'POST', body: JSON.stringify(body),
});
const valid = { book_id: 'book', expected_chunks: 5, sample_ids: ['book-0', 'book-2', 'book-4'] };

(async () => {
  let e = environment();
  let response = await context.handleVerifyBookIndex(request(valid), e.env);
  let data = await response.json();
  assert.equal(data.status, 'ready');
  assert.equal(data.d1_chunks, 5);
  assert.equal(data.vector_sample_found, 3);
  assert.deepEqual(e.calls.ids, valid.sample_ids);

  e = environment({ found: ['book-0'] });
  data = await (await context.handleVerifyBookIndex(request(valid), e.env)).json();
  assert.equal(data.status, 'pending');
  assert.equal(data.vector_sample_found, 1);

  e = environment({ count: 4 });
  data = await (await context.handleVerifyBookIndex(request(valid), e.env)).json();
  assert.equal(data.status, 'partial');
  assert.equal(data.d1_chunks, 4);
  assert.equal(e.calls.ids.length, 0, 'No vector read needed after a D1 mismatch');

  e = environment({ failVector: true });
  response = await context.handleVerifyBookIndex(request(valid), e.env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'Index verification unavailable');

  response = await context.handleVerifyBookIndex(request({ ...valid, sample_ids: [] }), environment().env);
  assert.equal(response.status, 400);
  console.log('PASS: exact D1/vector readiness, eventual pending, partial, failure, validation, protected route');
})().catch(error => { console.error(error); process.exitCode = 1; });
