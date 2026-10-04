const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
function doc(kind='presentation'){
 const d=JSON.parse(fs.readFileSync(path.join(ROOT,'Fixtures/fixture-carrousel-type.json')));
 d.documentKind=kind;d.citations=[];d.title='Présentation locale';
 const blocks=[{id:'h1',type:'heading',content:{text:'Introduction',level:2},citationIds:[],validation:{}},{id:'p1',type:'paragraph',content:{text:'Contenu clinique de la diapositive.'},citationIds:[],validation:{}}];
 d.blocks=['presentation','carrousel'].includes(kind)?[{id:'card-01',type:'card',content:{title:'Diapositive initiale',imageRef:null,imageAlt:null,blocks},citationIds:[],validation:{}}]:blocks;
 return d;
}
async function open(page,d,key='test-doc'){
 return page.evaluate(async ({d,key})=>{window._adocArtifacts=window._adocArtifacts||{};window._adocArtifacts[key]={name:d.title,_adocGenerationEngine:'structured',_adocCapabilities:{workspace:true,persist:true,blockEditing:true,export:true,qualityControlledExport:true},_adocStructuredDoc:d,_adocStructuredSnapshot:{sourceSnapshotId:d.sourceSnapshotId,entries:[]}};return window.adocOpenWorkspace(key);},{d,key});
}
module.exports={ROOT,doc,open};
