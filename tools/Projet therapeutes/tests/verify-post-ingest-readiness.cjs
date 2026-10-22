const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = readFileSync(path.join(__dirname, '../bibliotheque-admin.html'), 'utf8');
const start = source.indexOf('async function verifyBookIndexWithRetries(');
const end = source.indexOf('// ── Remplacer un livre', start);
assert.ok(start > 0 && end > start, 'Production verification functions not found');
const q = { id: 'q1', status: 'verify_pending', meta: { book_id: 'book' }, chunks: Array.from({ length: 9 }, () => ({})) };
let replies = [];
let calls = [];
const context = vm.createContext({
  queue: [q], console,
  getWorkerUrl: () => 'https://worker.test',
  getAdminApiKey: async () => 'test-only',
  fetch: async (url, init) => {
    calls.push({ url, ...init });
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return { ok: true, json: async () => reply };
  },
  setTimeout: callback => { callback(); return 1; },
  renderQueue() {}, log() {},
});
vm.runInContext(source.slice(start, end), context);

(async () => {
  replies = [{ status: 'pending', d1_chunks: 9, vector_sample_found: 3, vector_sample_total: 5 },
    { status: 'ready', d1_chunks: 9, vector_sample_found: 5, vector_sample_total: 5 }];
  let result = await context.verifyBookIndexWithRetries(q, 3);
  assert.equal(result.status, 'ready');
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].body).sample_ids, ['book-0', 'book-2', 'book-4', 'book-6', 'book-8']);
  assert.equal(calls[0].headers['X-API-Key'], 'test-only');

  replies = [{ status: 'pending', d1_chunks: 9, vector_sample_found: 4, vector_sample_total: 5 }];
  q.status = 'verify_pending';
  await context.verifyQueuedBookIndex('q1');
  assert.equal(q.status, 'verify_pending', 'A non-visible sample must never be called ready');

  replies = [{ status: 'partial', d1_chunks: 8, vector_sample_found: 0, vector_sample_total: 5 }];
  await context.verifyQueuedBookIndex('q1');
  assert.equal(q.status, 'partial');
  assert.equal(q._partialInfo.d1, 8);

  q.status = 'verify_pending';
  replies = [{ status: 'ready', d1_chunks: 9, vector_sample_found: 5, vector_sample_total: 5 }];
  await context.verifyQueuedBookIndex('q1');
  assert.equal(q.status, 'done');
  console.log('PASS: post-ingest polling, exact sample IDs, pending/manual retry, partial, ready');
})().catch(error => { console.error(error); process.exitCode = 1; });
