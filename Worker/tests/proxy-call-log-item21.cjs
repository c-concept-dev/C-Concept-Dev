const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = readFileSync(require('node:path').join(__dirname, '../index.js'), 'utf8');
const start = source.indexOf('async function handleAnthropicProxy(');
const end = source.indexOf('async function handleLibrarySearch(', start);
async function run(response, { rejectFetch = false, rejectD1 = false, cancel = false } = {}) {
  const rows = [], pending = [], warnings = [];
  const env = { ANTHROPIC_API_KEY: 'test-only', DB: { prepare(sql) {
    assert.match(sql, /INSERT INTO proxy_call_log/);
    return { bind(...args) { return { async run() {
      if (rejectD1) throw new Error('D1 unavailable');
      rows.push(args);
    } }; } };
  } } };
  const context = vm.createContext({ Request, Response, TransformStream, Date,
    console: { log() {}, warn(message) { warnings.push(message); } },
    CORS: {}, __name() {}, jsonErr: (message, status) => new Response(message, { status }),
    fetch: async () => { if (rejectFetch) throw new Error('network'); return response; }
  });
  vm.runInContext(source.slice(start, end), context);
  const request = new Request('https://example.test', { method: 'POST', body: JSON.stringify({ payload: {
    model: 'test-model', messages: [], stream: true, max_tokens: 100
  } }) });
  let result, error;
  try { result = await context.handleAnthropicProxy(request, env, { waitUntil(p) { pending.push(p); } }); }
  catch (e) { error = e; }
  let text;
  if (result) { if (cancel) await result.body.cancel(); else text = await result.text(); }
  await Promise.all(pending);
  return { rows, warnings, result, text, error };
}
(async () => {
  const sse = 'data: {"type":"message_stop"}\n\n';
  const success = await run(new Response(sse, { headers: { 'request-id': 'req-test' } }));
  assert.equal(success.text, sse);
  assert.equal(success.result.headers.get('X-Anthropic-Request-Id'), 'req-test');
  assert.equal(success.rows.length, 1);
  assert.equal(success.rows[0][0], 'req-test');
  assert.equal(success.rows[0][5], 200);
  assert.ok(Date.parse(success.rows[0][4]) >= Date.parse(success.rows[0][1]));
  const http = await run(new Response('{"error":"overloaded"}', { status: 503 }));
  assert.equal(http.result.status, 503);
  assert.equal(http.rows.length, 1);
  assert.equal(http.rows[0][5], 503);
  const network = await run(null, { rejectFetch: true });
  assert.equal(network.error.message, 'network');
  assert.equal(network.rows.length, 1);
  assert.equal(network.rows[0][5], null);
  const unavailable = await run(new Response(sse), { rejectD1: true });
  assert.equal(unavailable.text, sse);
  assert.deepEqual(unavailable.warnings, ['[ProxyCallLog] D1 write failed']);
  let cancelled = false;
  const upstream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); }, cancel() { cancelled = true; } });
  const cancelledResult = await run(new Response(upstream), { cancel: true });
  assert.equal(cancelled, true);
  assert.equal(cancelledResult.rows.length, 1);
  assert.match(source, /return handleAnthropicProxy\(request2, env2, ctx\);/);
  console.log('PASS: SSE intact, request-id, HTTP error, network error, D1 failure isolated, downstream cancellation, ctx routing');
})().catch(e => { console.error(e); process.exitCode = 1; });
