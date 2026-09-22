const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
function fixture(){
 const source=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');
 const ctx=vm.createContext({Request,Response,URL,console,CORS:{},__name(){}});
 vm.runInContext(source.slice(source.indexOf('var ADOC_PUBLIC_ROUTES'),source.indexOf('var BRAND_ASSET_ROLES'))+source.slice(source.indexOf('async function handleLibraryFacets('),source.indexOf('// Recherche documentaire : lookup au clic uniquement')),ctx);
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE chunks(id TEXT PRIMARY KEY,book_id TEXT,book_title TEXT,author TEXT,approach TEXT,language TEXT,content TEXT);
 CREATE VIRTUAL TABLE chunks_fts USING fts5(content,book_title,author,approach,content='chunks',content_rowid='rowid');
 CREATE TRIGGER chunks_fts_insert AFTER INSERT ON chunks BEGIN INSERT INTO chunks_fts(rowid,content,book_title,author,approach) VALUES(new.rowid,new.content,new.book_title,new.author,new.approach); END;`);
 db.exec(fs.readFileSync(path.join(__dirname,'../migrations/0008_add_library_facets_index.sql'),'utf8'));
 let serial=0,queries=0;
 const add=(approach,language,title='Livre',content='trauma et attachement',author='Auteur')=>db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?)').run('chunk-'+(++serial),'book-'+serial,title,author,approach,language,content);
 add('ifs','en');add('ifs','en');add('ifs','fr');add('systemic','fr');add('systemic','fr');add('systemic','fr');
 const env = { WORKER_API_KEY:'fixture-key', DB: {
   prepare(sql) { return { bind(...params) { return {
     async all() { queries++; return {results:db.prepare(sql).all(...params)}; }
   }; } }; }
 } };
 const request=(body,key='fixture-key')=>ctx.Worker_default.fetch(new Request('https://test/library-facets',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-API-Key':key}:{})},body:typeof body==='string'?body:JSON.stringify(body)}),env,{});
 return {db,add,request,get queries(){return queries}};
}
module.exports={fixture};
if(require.main===module)(async()=>{
 const f=fixture();const call=async b=>{const r=await f.request(b);assert.equal(r.status,200);return r.json()};
 assert.equal((await f.request({},null)).status,401);assert.equal(f.queries,0);
 for(const bad of [null,[],{query:8},{language:['fr']},{approach:'x'.repeat(301)},'bad json'])assert.equal((await f.request(bad)).status,400);
 let d=await call({query:'trauma'});assert.equal(d.total,6);assert.equal(f.queries,1);
 const counts=(d,k)=>Object.fromEntries(d.facets[k].map(x=>[x.value,x.count]));
 assert.deepEqual(counts(d,'language'),{fr:4,en:2});
 d=await call({query:'trauma',approach:'IFS'});assert.deepEqual(counts(d,'language'),{en:2,fr:1});assert.equal(d.total,3);
 d=await call({query:'trauma',language:'en'});assert.deepEqual(counts(d,'approach'),{ifs:2});
 d=await call({query:'trauma',approach:'systemic',language:'en'});assert.equal(d.total,0);assert.deepEqual(counts(d,'approach'),{ifs:2});assert.deepEqual(counts(d,'language'),{fr:3});
 const fresh='approche_inedite_'+Date.now();f.add(fresh,'eo','Livre nouveau');d=await call({query:'trauma'});assert.equal(counts(d,'approach')[fresh],1);assert.equal(counts(d,'language').eo,1);
 d=await call({query:'"trauma et attachement"',book_title:'Livre nouveau'});assert.equal(d.total,1);
 f.add('literal','it','Livre_100%','autre contenu','Dallaire');assert.equal((await call({query:'Dallaire',book_title:'Livre_100%'})).total,1);
 assert.equal((await call({query:'inexistant'})).total,0);assert.equal((await call({query:'" OR 1=1 --'})).total,0);
 const plan=f.db.prepare('EXPLAIN QUERY PLAN SELECT approach,language,COUNT(*) FROM chunks GROUP BY approach COLLATE NOCASE, language COLLATE NOCASE').all();assert.ok(plan.some(x=>x.detail.includes('COVERING INDEX idx_chunks_facets_cover')));
 console.log('PASS facets real SQLite/FTS5: authenticated router, one query, contextual counts, cross filters, dynamic insertion, unseen language, author, exact phrase, literal title, zero, SQL safety, covering index.');
})().catch(e=>{console.error(e);process.exitCode=1});
