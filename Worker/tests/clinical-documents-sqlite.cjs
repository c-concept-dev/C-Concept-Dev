// Adaptateur D1 local sur SQLite réel ; fonctions Worker extraites sans réécriture.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
module.exports=function createBackend(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0004_add_clinical_documents.sql','0005_add_generation_engine.sql','0012_add_clinical_document_thumbnail.sql'])db.exec(fs.readFileSync(path.join(__dirname,'../migrations',f),'utf8'));
 db.exec('BEGIN');db.exec(fs.readFileSync(path.join(__dirname,'../migrations/0015_allow_presentation_documents.sql'),'utf8'));db.exec('COMMIT');
 db.exec("CREATE TABLE render_assets(asset_id TEXT PRIMARY KEY,role TEXT)");
 const DB={prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {success:true,meta:db.prepare(sql).run(...args)};}};},async batch(stmts){db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const source=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');
 function slice(a,b){return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a))+b.length);}
 const code=slice('function json(data, status = 200) {','__name(jsonErr, "jsonErr");')+slice('var CLINICAL_DOCUMENT_KINDS = ','__name(handleBrandAssetUpload, "handleBrandAssetUpload");');
 const sandbox={Response,crypto,console,TextEncoder,URL,atob,btoa,CORS:{},__name:x=>x,module:{exports:{}}};
 vm.runInNewContext(code+'\nmodule.exports={handleClinicalDocumentCreate,handleClinicalDocumentVersionCreate,handleClinicalDocumentGet,handleClinicalDocumentsList,handleClinicalDocumentThumbnailSet};',sandbox);
 const h=sandbox.module.exports;
 return {db,async respond(url,method,body){const p=new URL(url).pathname;const req=new Request(url,{method, ...(body?{body,headers:{'Content-Type':'application/json'}}:{})});const env={DB};let m;
  if(p==='/clinical-documents')return method==='POST'?h.handleClinicalDocumentCreate(req,env):h.handleClinicalDocumentsList(env);
  if((m=p.match(/^\/clinical-documents\/([^/]+)\/versions$/))&&method==='POST')return h.handleClinicalDocumentVersionCreate(req,env,m[1]);
  if((m=p.match(/^\/clinical-documents\/([^/]+)\/thumbnail$/)))return h.handleClinicalDocumentThumbnailSet(req,env,m[1]);
  if((m=p.match(/^\/clinical-documents\/([^/]+)$/)))return h.handleClinicalDocumentGet(env,m[1]);
  return null;
 }};
};
