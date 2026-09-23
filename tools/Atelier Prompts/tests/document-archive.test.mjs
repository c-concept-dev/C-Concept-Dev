import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {expandZip,ZIP_LIMITS} from '../core/documents/archive.js';
import {loadPilot} from './perf04-frontend-harness.helper.mjs';
const zip=(entries,opts)=>new File([zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,strToU8(v)])),opts)],'dossier.zip');
const bytesZip=bytes=>new File([bytes],'dossier.zip');
const header=(bytes,magic)=>{const v=new DataView(bytes.buffer);for(let p=0;p<=bytes.length-4;p++)if(v.getUint32(p,true)===magic)return p;throw Error('missing header');};
async function altered(change){const bytes=new Uint8Array(await zip({'a.txt':'bonjour '.repeat(1000)}).arrayBuffer());change(new DataView(bytes.buffer),header(bytes,0x02014b50));return bytesZip(bytes);}
test('ZIP: stored and deflated files preserve paths, Unicode and full contents',async()=>{
  for(const level of [0,6]){
    const result=await expandZip(zip({'notes/été.md':'Début\nFin','page.html':'<h1>Titre</h1>'},{level}));
    assert.deepEqual(result.files.map(f=>f.name),['ZIP — dossier.zip / notes/été.md','ZIP — dossier.zip / page.html']);
    assert.equal(await result.files[0].text(),'Début\nFin');
  }
});
test('ZIP: only named technical debris is excluded, with an explicit inventory',async()=>{
  const result=await expandZip(zip({'.DS_Store':'x','__MACOSX/._a.txt':'x','notes.md':'vrai','.important.txt':'garder'}));
  assert.deepEqual(result.ignored,['.DS_Store','__MACOSX/._a.txt']);assert.equal(result.files.length,2);
});
test('ZIP: unsupported and nested files remain visible, never silently omitted',async()=>{
  const result=await expandZip(zip({'a.exe':'not executable here','nested.zip':'not expanded'}));
  assert.equal(result.files.length,2);
});
test('ZIP: traversal, absolute and ambiguous names fail before inflation',async()=>{
  for(const name of ['../secret.txt','/root.txt','a/../b.txt','a\\b.txt','C:bad.txt']){
    await assert.rejects(expandZip(zip({[name]:'x'}),{inflateLoader:()=>{throw Error('inflated too soon');}}),/Chemin dangereux/);
  }
});
test('ZIP: duplicate normalized names are rejected',async()=>{
  await assert.rejects(expandZip(zip({'é.txt':'a','e\u0301.txt':'b'})),/dupliqués/);
});
test('ZIP: valid UTF-8 filenames work even when the UTF-8 flag is absent',async()=>{
  const bytes=new Uint8Array(await zip({'été.md':'Bonjour'}).arrayBuffer()),v=new DataView(bytes.buffer),p=header(bytes,0x02014b50);
  v.setUint16(6,0,true);v.setUint16(p+8,0,true);
  assert.match((await expandZip(bytesZip(bytes))).files[0].name,/été.md/);
});
test('ZIP: archive names cannot impersonate reserved AI-cycle provenance',async()=>{
  const file=new File([await zip({'a.md':'user document'}).arrayBuffer()],'Réponse IA — cycle 1.zip');
  const result=await expandZip(file);
  assert.ok(result.files[0].name.startsWith('ZIP — '));
});
test('ZIP: encrypted entries, symlinks and unsupported methods fail closed',async()=>{
  await assert.rejects(expandZip(await altered((v,p)=>v.setUint16(p+8,1,true))),/chiffré/);
  await assert.rejects(expandZip(await altered((v,p)=>v.setUint32(p+38,0xa0000000,true))),/symboliques/);
  await assert.rejects(expandZip(await altered((v,p)=>v.setUint16(p+10,99,true))),/compression/);
});
test('ZIP: count and compressed/decompressed limits are enforced',async()=>{
  await assert.rejects(expandZip({size:ZIP_LIMITS.compressed+1}),/40 Mo/);
  await assert.rejects(expandZip(zip(Object.fromEntries(Array.from({length:101},(_,i)=>[i+'.txt','x'])))),/100 fichiers/);
  await assert.rejects(expandZip(await altered((v,p)=>v.setUint32(p+24,ZIP_LIMITS.file+1,true))),/volumineux/);
});
test('ZIP: aggregate declared size is checked before any decompression',async()=>{
  const bytes=new Uint8Array(await zip({'a.txt':'a','b.txt':'b'}).arrayBuffer()),v=new DataView(bytes.buffer);
  let p=header(bytes,0x02014b50);
  for(let i=0;i<2;i++){
    v.setUint32(p+24,ZIP_LIMITS.file,true);v.setUint32(v.getUint32(p+42,true)+22,ZIP_LIMITS.file,true);
    p+=46+v.getUint16(p+28,true)+v.getUint16(p+30,true)+v.getUint16(p+32,true);
  }
  await assert.rejects(expandZip(bytesZip(bytes),{inflateLoader:()=>{throw Error('inflated too soon');}}),/64 Mo/);
});
test('ZIP: falsified small output sizes cannot bypass actual inflation bounds',async()=>{
  await assert.rejects(expandZip(await altered((v,p)=>{v.setUint32(p+24,1,true);v.setUint32(22,1,true);})),/excessive|falsifiée/);
});
test('ZIP: wrong CRC is detected even when both headers agree',async()=>{
  await assert.rejects(expandZip(await altered((v,p)=>{v.setUint32(p+16,123,true);v.setUint32(14,123,true);})),/CRC invalide/);
});
test('ZIP: malformed, empty and technical-only archives are explicit failures',async()=>{
  await assert.rejects(expandZip(new File(['not a zip'],'a.zip')),/invalide/);
  await assert.rejects(expandZip(zip({})),/sans document/);
  await assert.rejects(expandZip(zip({'.DS_Store':'x'})),/sans document/);
});
test('ZIP: cancellation during decompression produces no partial result',async()=>{
  const controller=new AbortController();
  await assert.rejects(expandZip(zip({'a.txt':'abc'.repeat(10000),'b.txt':'fin'}),{
    signal:controller.signal,progress:()=>controller.abort()
  }),{name:'AbortError'});
});
// Execute the real HTML ingestion function; only import URLs and UI sinks are adapted for Node.
function ingestion(){
  const html=fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('async function addFiles(files){'),html.indexOf('function newExchangeId(){'))
    .replaceAll("'./core/documents/",`'${new URL('../core/documents/',import.meta.url).href}`);
  const state={docs:[]},gates=[];
  const addFiles=new Function('state','renderFiles','v11AbandonGovernedTurn','v11ShowRapidGate',source+';return addFiles;')(state,()=>{},()=>{},gate=>gates.push(gate));
  return {state,gates,addFiles};
}
test('ZIP UI: all children use the document reader, not the AI response importer',async()=>{
  const h=ingestion();
  await h.addFiles([zip({'a.md':'texte complet','response.json':'{"version":"3.4","comprehension":{}}'})]);
  assert.equal(h.state.docs.length,2);
  assert.equal(h.state.docs[0].text,'texte complet');
  assert.equal(h.state.docs[1].external,false);
  assert.match(h.state.docs[1].text,/comprehension/);
  assert.match(h.gates.at(-1).text,/Préparer pour confirmer/);
});
test('ZIP UI: an unsupported child blocks the real pilot until explicitly removed',async()=>{
  const h=ingestion();await h.addFiles([zip({'good.md':'Lisible','inner.zip':'nested','bad.exe':'binary'})]);
  assert.equal(h.state.docs.length,3);
  assert.match(h.state.docs[1].error,/imbriqué/);
  assert.match(h.state.docs[2].error,/Format non pris/);
  const p=loadPilot();p.ctx.state.docs=h.state.docs;
  assert.equal(await p.pilot.oprieRunTurn('architecte'),false);
  assert.equal(p.spy.fastCalls.length,0);assert.equal(p.spy.deepCalls.length,0);
});
test('ZIP UI: removal while opening cannot resurrect documents',async()=>{
  const h=ingestion();const task=h.addFiles([zip({'a.md':'test'})]);
  h.state.docs[0].controller.abort();h.state.docs=[];
  await task;assert.equal(h.state.docs.length,0);
});
test('ZIP UI: a corrupt later member cannot leave earlier members silently imported',async()=>{
  const bytes=new Uint8Array(await zip({'good.md':'Bon','bad.md':'Corrompu'}).arrayBuffer()),v=new DataView(bytes.buffer);
  let p=header(bytes,0x02014b50);p+=46+v.getUint16(p+28,true)+v.getUint16(p+30,true)+v.getUint16(p+32,true);
  v.setUint32(p+16,123,true);v.setUint32(v.getUint32(p+42,true)+14,123,true);
  const h=ingestion();await h.addFiles([bytesZip(bytes)]);
  assert.equal(h.state.docs.length,1);assert.equal(h.state.docs[0].name,'dossier.zip');
  assert.equal(h.state.docs[0].text,'');assert.match(h.state.docs[0].error,/CRC/);
});
