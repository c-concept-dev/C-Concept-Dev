const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
const start = source.indexOf('async function handleUpdateBookMeta(');
const end = source.indexOf('// ── Phase B0.3', start);
assert.ok(start > 0 && end > start, 'handleUpdateBookMeta introuvable');

const context = vm.createContext({
  Response,
  Request,
  __name() {},
  jsonErr: (message, status) => new Response(JSON.stringify({ error: message }), { status }),
  json: (value) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }),
});
vm.runInContext(source.slice(start, end), context);

function request(body) {
  return new Request('https://clone-proxy.test/update-book-meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function environment(changes = 3) {
  const calls = [];
  return {
    calls,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async run() {
                  calls.push({ sql, args });
                  return { meta: { changes } };
                },
              };
            },
          };
        },
      },
    },
  };
}

(async () => {
  const { env, calls } = environment(4);
  const response = await context.handleUpdateBookMeta(request({
    book_id: 'ouvrage-1',
    book_title: '  Un titre corrigé  ',
    author: 'Autrice',
  }), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.updated_chunks, 4, 'le nombre de lignes modifiées doit être explicite');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^UPDATE chunks SET /);
  assert.match(calls[0].sql, /book_title = \?/);
  assert.match(calls[0].sql, /WHERE book_id = \?$/,
    'tous les chunks de l’ouvrage doivent être ciblés par book_id');
  assert.deepEqual(calls[0].args, ['Un titre corrigé', 'Autrice', 'ouvrage-1']);

  for (const invalidTitle of ['', '   ', 'x'.repeat(301)]) {
    const invalid = environment();
    const invalidResponse = await context.handleUpdateBookMeta(request({
      book_id: 'ouvrage-1', book_title: invalidTitle,
    }), invalid.env);
    assert.equal(invalidResponse.status, 400);
    assert.equal(invalid.calls.length, 0, 'un titre invalide ne doit jamais atteindre D1');
  }

  console.log('PASS S2 — titre validé, tous les chunks mis à jour, compteur renvoyé');
})().catch((error) => {
  console.error('ÉCHEC S2:', error);
  process.exitCode = 1;
});
