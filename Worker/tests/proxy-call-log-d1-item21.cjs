// Intégration locale workerd + D1 : aucune connexion à Anthropic ni à la production.
const { Miniflare } = require('miniflare');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const code = source.slice(source.indexOf('async function handleAnthropicProxy('), source.indexOf('async function handleLibrarySearch('));
const mf = new Miniflare({ modules: true, compatibilityDate: '2026-03-08', d1Databases: ['DB'],
  bindings: { ANTHROPIC_API_KEY: 'test-only' }, script: `
const CORS = {};
function __name() {}
function jsonErr(message, status) { return new Response(message, {status}); }
const fetch = async (url, init) => {
  const mode = JSON.parse(init.body).model;
  if (mode === 'network') throw new Error('test network');
  if (mode === 'http') return new Response('unavailable', {status:503});
  const body = mode === 'cancel' ? new ReadableStream({start(c) {this.timer=setInterval(()=>c.enqueue(new Uint8Array([65])),50);}, cancel() {clearInterval(this.timer);}})
    : mode === 'upstream' ? new ReadableStream({pull(c) {c.error(new Error('test upstream'));}})
    : 'data: {"type":"message_stop"}\\n\\n';
  return new Response(body, {headers:{'request-id':'req-'+mode}});
};
${code}
export default {fetch(req, env, ctx) {return handleAnthropicProxy(req, env, ctx);}};
` });
(async () => {
  const db = await mf.getD1Database('DB');
  for (const name of ['0006_add_proxy_call_log.sql', '0007_add_proxy_call_outcome.sql']) {
    if (name.startsWith('0007')) await db.prepare("INSERT INTO proxy_call_log(received_at) VALUES ('old-row')").run();
    const sql = fs.readFileSync(path.join(root, 'migrations', name), 'utf8').replace(/--[^\n]*/g, '');
    for (const statement of sql.split(';').filter(s => s.trim())) await db.prepare(statement).run();
  }
  const old = await db.prepare("SELECT outcome, termination_reason FROM proxy_call_log WHERE received_at='old-row'").first();
  assert.deepEqual(old, {outcome:'legacy_unknown',termination_reason:'legacy_unknown'});
  for (const mode of ['success', 'http', 'network', 'upstream', 'cancel']) {
    try {
      const resp = await mf.dispatchFetch('https://test.local', {method:'POST', body:JSON.stringify({payload:{model:mode,stream:true,messages:[]}})});
      if (mode === 'cancel') await resp.body.cancel();
      else await resp.text();
    } catch (_) { assert.ok(['network','upstream'].includes(mode)); }
  }
  let rows;
  for (let i=0;i<100;i++) {
    rows = (await db.prepare("SELECT outcome, termination_reason FROM proxy_call_log WHERE received_at!='old-row' ORDER BY id").all()).results;
    if(rows.length===5) break;
    await new Promise(r=>setTimeout(r,20));
  }
  assert.equal(rows.length,5);
  assert.deepEqual(rows.map(r=>r.outcome).sort(), ['error','error','error','interruption','success']);
  assert.deepEqual(rows.map(r=>r.termination_reason).sort(), ['downstream_cancel','fetch_error','http_error','upstream_eof','upstream_read_error']);
  await assert.rejects(db.prepare("INSERT INTO proxy_call_log(received_at,outcome) VALUES ('invalid','typo')").run());
  console.log('PASS workerd/D1: migration, historical unknown, distinct stored outcomes, all five routes, constraints');
  console.log(JSON.stringify(rows));
})().finally(()=>mf.dispose()).catch(e=>{console.error(e);process.exitCode=1;});
