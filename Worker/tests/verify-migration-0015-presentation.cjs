const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.join(__dirname,'../migrations');
function before(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const file of ['0004_add_clinical_documents.sql','0005_add_generation_engine.sql','0012_add_clinical_document_thumbnail.sql'])db.exec(fs.readFileSync(path.join(dir,file),'utf8'));return db;}
function rows(db,t){return db.prepare('SELECT * FROM '+t+' ORDER BY 1').all().map(r=>({...r}));}
const sql=fs.readFileSync(path.join(dir,'0015_allow_presentation_documents.sql'),'utf8');
for(const count of [0,10]){
 const db=before();
 for(let i=0;i<count;i++){
  db.prepare('INSERT INTO clinical_documents(document_id,title,document_kind,thumbnail_asset_id,generation_engine) VALUES(?,?,?,?,?)').run('d'+i,'Titre '+i,['fiche','carrousel','tableau','script','liens'][i%5],i%2?'asset-thumb-'+i:null,i%2?'structured':'legacy-html');
  for(let v=0;v<3;v++)db.prepare('INSERT INTO clinical_document_versions(version_id,document_id,previous_version_id,schema_version,content_json,generation_engine,change_summary) VALUES(?,?,?,?,?,?,?)').run('v'+i+'-'+v,'d'+i,v?'v'+i+'-'+(v-1):null,1,JSON.stringify({text:'é 😀',version:v}),i%2?'structured':'legacy-html',v?'Modification '+v:null);
  db.prepare('UPDATE clinical_documents SET current_version_id=? WHERE document_id=?').run('v'+i+'-2','d'+i);
 }
 const tables=['clinical_documents','clinical_document_versions'];
 const saved=tables.map(t=>rows(db,t));const fks=tables.map(t=>db.prepare('PRAGMA foreign_key_list('+t+')').all());
 const inventory=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ('clinical_documents','clinical_document_versions') ORDER BY type,name").all();
 assert.equal(inventory.filter(x=>x.type==='trigger').length,0);
 db.exec('BEGIN');db.exec(sql);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.exec('COMMIT');
 tables.forEach((t,i)=>{assert.deepEqual(rows(db,t),saved[i]);assert.deepEqual(db.prepare('PRAGMA foreign_key_list('+t+')').all(),fks[i]);});
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 db.exec("INSERT INTO clinical_documents(document_id,title,document_kind) VALUES('p','Présentation','presentation')");
 assert.throws(()=>db.exec("INSERT INTO clinical_documents(document_id,title,document_kind) VALUES('bad','Invalide','bad')"),/CHECK/);
 assert.throws(()=>db.exec("INSERT INTO clinical_document_versions(version_id,document_id,schema_version,content_json) VALUES('orphan','absent',1,'{}')"),/FOREIGN KEY/);
 assert.throws(()=>db.exec("UPDATE clinical_documents SET current_version_id='absent' WHERE document_id='p'"),/FOREIGN KEY/);
 assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='idx_clinical_document_versions_document_id'").get().n,1);
 console.log(JSON.stringify({documentsPreserved:count,versionsPreserved:count*3,foreignKeyCheck:[],presentationAccepted:true,invalidRejected:true,inventory}));db.close();
}
module.exports={before,sql};
