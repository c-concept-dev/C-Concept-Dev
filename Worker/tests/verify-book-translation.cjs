const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const router = source.slice(source.indexOf('var ADOC_PUBLIC_ROUTES'), source.indexOf('var BRAND_ASSET_ROLES'));
  const handlers = source.slice(source.indexOf('function splitLibraryTranslationSegments('), source.indexOf('async function handleRagSearch('));
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE chunks(id TEXT PRIMARY KEY, book_id TEXT, book_title TEXT, author TEXT, approach TEXT, language TEXT, page_number INTEGER, page_end INTEGER, chunk_index INTEGER, content TEXT)');
  const original = Array.from({ length: 42 }, (_, i) => `A source paragraph number ${i} with specific detail ${i}. `).join('');
  db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?,?,?)').run('book-0','book','A <Book>','Writer','general','en',12,12,0,original);
  db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?,?,?)').run('book-1','book','A <Book>','Writer','general','en',13,13,1,'Another source paragraph.');
  const statements = {
    prepare(sql) { return { bind(...args) { return {
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args); }
    }; } }; }
  };
  let aiCalls = 0, browserCalls = 0, browserRequest = null, failAI = false, degenerateMode = 'off';
  const ctx = vm.createContext({ Response, Request, URL, TextEncoder, crypto, console, CORS: {}, __name() {},
    fetch: async (url, options) => {
      assert.match(String(url), /browser-rendering\/pdf\?cacheTTL=0$/);
      browserCalls++;
      browserRequest = JSON.parse(options.body);
      return new Response('%PDF-TEST', { headers: { 'Content-Type': 'application/pdf' } });
    }
  });
  vm.runInContext(router + handlers, ctx);
  const env = { WORKER_API_KEY: 'test-only', DB: statements, CF_ACCOUNT_ID: 'account-test', CF_API_TOKEN: 'token-test',
    AI: { async run(model, args) { aiCalls++; if (failAI) throw Error('model down');
      assert.equal(model, '@cf/meta/m2m100-1.2b'); assert.ok(args.text.length <= 500);
      if (degenerateMode === 'always' || (degenerateMode === 'long' && args.text.length > 250))
        return { translated_text: 'one two three four five six seven eight '.repeat(3) };
      if (degenerateMode === 'inflated' && args.text.length > 250)
        return { translated_text: Array.from({ length: 300 }, (_, i) => `mot${i}`).join(' ') };
      if (degenerateMode === 'empty') return { translated_text: '' };
      return { translated_text: 'Traduction ' + args.text };
    } }
  };
  const send = (route, body, key = 'test-only') => ctx.Worker_default.fetch(new Request('https://worker.test' + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
    body: JSON.stringify(body)
  }), env, {});
  assert.equal((await send('/book-translation-manifest', { book_id: 'book' }, null)).status, 401);
  assert.equal((await send('/book-translate-segment', { book_id: 'book' }, null)).status, 401);
  assert.equal((await send('/book-translation-pdf', { book_id: 'book' }, null)).status, 401);
  const manifestResponse = await send('/book-translation-manifest', { book_id: 'book' });
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.total_chunks, 2);
  assert.equal(manifest.chunks[0].segment_count + manifest.chunks[1].segment_count, manifest.total_segments);
  assert.ok(manifest.chunks[0].segment_count > 1);
  const translations = [];
  for (const chunk of manifest.chunks) {
    const translated = [];
    for (let i = 0; i < chunk.segment_count; i++) {
      const res = await send('/book-translate-segment', { book_id: 'book', id: chunk.id,
        segment_index: i, source_hash: chunk.source_hash, target_lang: 'fr' });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.segment_index, i);
      translated.push(data.translated_text);
    }
    translations.push({ id: chunk.id, source_hash: chunk.source_hash, segments: translated });
  }
  assert.equal(aiCalls, manifest.total_segments);
  const firstSegment = { book_id: 'book', id: manifest.chunks[0].id,
    segment_index: 0, source_hash: manifest.chunks[0].source_hash, target_lang: 'fr' };
  const sourceSegment = ctx.splitLibraryTranslationSegments(original)[0];
  const split = ctx.splitDegenerateLibraryTranslation(sourceSegment);
  assert.equal(split.join(''), sourceSegment, 'Fallback must not crop source text');
  assert.ok(split.every(part => part.length < sourceSegment.length && part.trim()));
  degenerateMode = 'long';
  const callsBeforeFallback = aiCalls;
  const recovered = await send('/book-translate-segment', firstSegment);
  assert.equal(recovered.status, 200, 'Only a degenerate long result should trigger bounded recovery');
  const recoveredBody = await recovered.json();
  assert.equal(recoveredBody.segment_count, manifest.chunks[0].segment_count,
    'Internal fallback must not change the checkpoint manifest');
  assert.equal(recoveredBody.segment_index, 0);
  assert.equal(aiCalls - callsBeforeFallback, 3, 'One rejected attempt plus two shorter translations');
  assert.ok(recoveredBody.translated_text.includes(split[0].trim()));
  assert.ok(recoveredBody.translated_text.includes(split[1].trim()));
  degenerateMode = 'inflated';
  const callsBeforeInflation = aiCalls;
  assert.equal((await send('/book-translate-segment', firstSegment)).status, 200,
    'A vastly inflated response without exact repeated phrases must also recover');
  assert.equal(aiCalls - callsBeforeInflation, 3);
  degenerateMode = 'always';
  const callsBeforeExhaustion = aiCalls;
  assert.equal((await send('/book-translate-segment', firstSegment)).status, 502);
  assert.ok(aiCalls - callsBeforeExhaustion <= 7, 'Fallback must remain bounded');
  degenerateMode = 'empty';
  const callsBeforeEmpty = aiCalls;
  assert.equal((await send('/book-translate-segment', firstSegment)).status, 502);
  assert.equal(aiCalls - callsBeforeEmpty, 1, 'An empty result must not be silently accepted or retried as degeneration');
  degenerateMode = 'off';
  failAI = true;
  assert.equal((await send('/book-translate-segment', { book_id: 'book', id: manifest.chunks[0].id,
    segment_index: 0, source_hash: manifest.chunks[0].source_hash, target_lang: 'fr' })).status, 502);
  assert.equal((await send('/book-translate-segment', { book_id: 'book', id: manifest.chunks[0].id,
    segment_index: 0, source_hash: '0'.repeat(64), target_lang: 'fr' })).status, 409);
  const incomplete = structuredClone(translations);
  incomplete[0].segments.pop();
  assert.equal((await send('/book-translation-pdf', { book_id: 'book', target_lang: 'fr', chunks: incomplete })).status, 409);
  assert.equal(browserCalls, 0, 'An incomplete book must never reach Browser Rendering');
  const pdf = await send('/book-translation-pdf', { book_id: 'book', target_lang: 'fr', chunks: translations });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('Content-Type'), /application\/pdf/);
  assert.match(pdf.headers.get('Cache-Control'), /no-store/);
  assert.equal(await pdf.text(), '%PDF-TEST');
  assert.equal(browserCalls, 1);
  assert.match(browserRequest.html, /Passage 1/);
  assert.match(browserRequest.html, /Traduction automatique, non professionnelle/);
  assert.ok(!browserRequest.html.includes('<Book>'), 'Book title must be HTML-escaped');
  assert.equal(browserRequest.pdfOptions.format, 'a4');
  assert.equal(env.CLONE_KV, undefined, 'PDF must not require KV');
  if (process.env.BOOK_PDF_VISUAL_OUTPUT) {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(browserRequest.html);
      const rendered = await page.pdf({ format: 'A4', printBackground: true });
      fs.writeFileSync(process.env.BOOK_PDF_VISUAL_OUTPUT, rendered);
    } finally { await browser.close(); }
  }
  console.log('PASS book translation: auth, exact segments, failure, source hash, no incomplete PDF, no KV, direct A4 stream');
})().catch(err => { console.error(err); process.exitCode = 1; });
