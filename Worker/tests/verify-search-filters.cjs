// Execute the real handlers against SQLite/FTS5, with adversarial vector metadata.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const ctx=vm.createContext({Response,Request,console,__name(){},json:o=>Response.json(o),jsonErr:(e,status)=>Response.json({error:e},{status})});
vm.runInContext(extract('const D1_SEARCH_ALLOWED_KEYS','async function handleStoreFile(')+extract('async function handleRagSearch(','async function handleRagStats('),ctx);
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE chunks(id TEXT,book_id TEXT,book_title TEXT,author TEXT,chapter TEXT,page_number INTEGER,chunk_index INTEGER,content TEXT,approach TEXT,language TEXT); CREATE VIRTUAL TABLE chunks_fts USING fts5(content);');
const insert=db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?,?,?)');
const add=(id,title,approach,language,content='internal family systems',author='IFS Author')=>{insert.run(id,title,title,author,'',1,Number(id.replace(/\D/g,''))||0,content,approach,language);db.prepare('INSERT INTO chunks_fts(rowid,content) VALUES(?,?)').run(Number(db.prepare('SELECT last_insert_rowid() n').get().n),content)};
for(let i=0;i<8;i++)add('ifs'+i,'IFS Livre','ifs','fr');
add('icv','PPT N2 LM 3 diapos','icv','fr','internal family systems','Vos objectifs');
add('en','Other','ifs','en'); add('null','Unknown',null,null);
add('literal','Livre_100%','ifs','fr'); add('wildcard','LivreX100Z','ifs','fr');
add('accent','Développer','ifs','fr');
let failFTS=false,translateFail=false;
const env = {
  DB: { prepare(sql) {
    return { bind(...args) {
      return { async all() {
        if (failFTS && sql.includes('MATCH')) throw Error('forced fallback');
        return { results: db.prepare(sql).all(...args) };
      }};
    }};
  }},
  AI: { async run(model) {
    if (model.includes('bge')) return {data:[[1]]};
    if (translateFail) throw Error('translation unavailable');
    return {translated_text:'Traduction française'};
  }},
  VECTOR_INDEX: { async query() {
    return {matches: [...db.prepare('SELECT id FROM chunks').all(), {id:'orphan'}].map(r => ({
      id:r.id, score:.9, metadata:{book_title:'WRONG TITLE',approach:'WRONG',language:'WRONG'}
    }))};
  }}
};
const request=b=>new Request('https://test/',{method:'POST',body:JSON.stringify(b)});
const rag=async b=>{const d=await (await ctx.handleRagSearch(request({query:'internal family systems',language:'all',topK:50,...b}),env)).json();assert.ok(d.chunks,JSON.stringify(d));return d.chunks};
const d1=async b=>{const d=await (await ctx.handleD1Query(request(b),env)).json();assert.ok(!d.error,JSON.stringify(d));return d.results};
(async()=>{
let ids;
for(const approach of ['ifs','IFS','Ifs','iFs']){const rows=await rag({approach,book_title:'IFS Livre',topK:8});assert.equal(rows.length,8);const current=rows.map(r=>r.id);if(ids)assert.deepEqual(current,ids);ids=current;assert.ok(rows.every(r=>r.approach==='ifs'));}
console.log('PASS case variants: identical 8 IDs, original metadata casing preserved');
for(const language of ['fr','FR'])assert.ok((await rag({language})).every(r=>r.language==='fr'));
assert.equal((await rag({approach:'not-present'})).length,0);
assert.equal((await rag({language:'de'})).length,0);
for(const title of ['IFS Livre','ifs livre','Livre_100%','Développer']){const rows=await rag({book_title:title});assert.ok(rows.length);assert.ok(rows.every(r=>r.book_title.toLowerCase().startsWith(title.toLowerCase())));assert.ok(rows.some(r=>r.sources.includes('vector')));assert.ok(rows.some(r=>r.sources.includes('fts5')));}
assert.equal((await rag({book_title:'Absent'})).length,0);
console.log('PASS book/language filters: FTS + vector, stale metadata, missing metadata, literal wildcards, accents, negatives');
for(const terms of [undefined,['internal']])for(const fallback of [false,true]){failFTS=fallback;const rows=await d1({authors:['IFS'],approaches:['IFS'],language:'FR',book_title:'IFS Livre',limit:8,...(terms?{terms}:{})});assert.equal(rows.length,8);assert.ok(rows.every(r=>r.book_title==='IFS Livre'));assert.equal((await d1({authors:['IFS'],approaches:['IFS'],language:'de'})).length,0);}
failFTS=false;assert.equal((await d1({authors:['IFS'],book_title:'Développer'})).length,1);
console.log('PASS author combined filters in all 3 SQL paths; polluted objectifs excluded; accented title');
const translated=await rag({book_title:'Other'});assert.equal(translated[0].is_machine_translated,true);assert.equal(translated[0].content,'internal family systems');translateFail=true;assert.equal((await rag({book_title:'Other'}))[0].translation_failed,true);
console.log('PASS translation success and failure keep original content');
})().catch(e=>{console.error(e);process.exitCode=1});
