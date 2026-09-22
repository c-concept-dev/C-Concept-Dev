// Actual complete Worker router and D1 SQL; only Workers AI is deterministic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
const source=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');
const vm=require('node:vm');
const ctx=vm.createContext({Response,Request,URL,console,CORS:{},__name(){}});
vm.runInContext(source.slice(source.indexOf('var ADOC_PUBLIC_ROUTES'),source.indexOf('var BRAND_ASSET_ROLES'))+source.slice(source.indexOf('async function handlePassageFull('),source.indexOf('async function handleRagSearch(')),ctx);
const worker=ctx.Worker_default;
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE chunks(id TEXT PRIMARY KEY, book_id TEXT, book_title TEXT, author TEXT, approach TEXT, language TEXT, page_number INTEGER, page_end INTEGER, content TEXT)');
const content='Texte exact « é & < > ».\n'.repeat(180);db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?,?)').run('fr','b','Titre','Auteur','ifs','fr',3,5,content);db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?,?)').run('en','b','Title','Author','ifs','en',6,8,content);
let calls=[],failed=false,dbReads=0;
const env={WORKER_API_KEY:'test-only',DB:{prepare(sql){return {bind(...args){return {async first(){dbReads++;return db.prepare(sql).get(...args)}}}}}},AI:{async run(model,input){calls.push({model,input});if(failed)throw Error('AI down');return {translated_text:'Traduit '+input.text}}}};
const run=(body,key='test-only')=>worker.fetch(new Request('https://worker.test/passage-full',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-API-Key':key}:{})},body:typeof body==='string'?body:JSON.stringify(body)}),env,{});
assert.equal((await run({id:'fr'},null)).status,401);assert.equal(dbReads,0);
for(const invalid of [{},{id:42},{id:' '},{id:'fr',target_lang:'invalid lang'},'bad json'])assert.equal((await run(invalid)).status,400);
assert.equal((await run({id:"' OR 1=1 --"})).status,404);
let d=await(await run({id:'fr'})).json();assert.equal(d.full_content,content);assert.equal(d.page_end,5);assert.equal(d.is_machine_translated,false);assert.equal(calls.length,0);
d=await(await run({id:'en'})).json();assert.equal(d.full_content,content);assert.equal(d.full_translated_content,'Traduit '+content);assert.equal(calls[0].input.text,content);assert.equal(calls[0].input.target_lang,'fr');assert.ok(d.is_machine_translated);
failed=true;d=await(await run({id:'en'})).json();assert.equal(d.translation_failed,true);assert.equal(d.is_machine_translated,false);assert.equal(d.full_content,content);assert.equal(d.full_translated_content,undefined);
console.log('PASS passage-full: actual router auth, invalid input, bound SQL, >800 complete Unicode text, page range, lazy translation contract, failure retaining original.');
})().catch(e=>{console.error(e);process.exitCode=1});
