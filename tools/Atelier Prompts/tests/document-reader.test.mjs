import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { extractDocument, readOffice, DOCUMENT_LIMITS } from '../core/documents/reader.js';
import { readJsonBody, TRANSPORT_LIMITS } from '../workers/shared/decision-core.js';
import { loadPilot } from './perf04-frontend-harness.helper.mjs';
globalThis.DOMParser = DOMParser;
test('reader: bundled OCR exposes the default createWorker factory',async()=>{
  const prior=globalThis.self;
  globalThis.self=globalThis;
  try {
    const module=await import('../core/documents/vendor/tesseract/tesseract.esm.min.js');
    assert.equal(typeof module.default.createWorker,'function');
  } finally { if(prior===undefined)delete globalThis.self;else globalThis.self=prior; }
});
test('reader: UTF-8 text is preserved verbatim, including accents', async()=>{
  const text='Une note dictée : ça va ?\nDeuxième ligne.';
  assert.equal((await extractDocument(new File([text],'notes.txt'))).text,text);
});
test('reader: unsupported formats and oversized files fail explicitly',async()=>{
  await assert.rejects(extractDocument(new File(['binary'],'old.doc')),/Format non pris/);
  await assert.rejects(extractDocument({name:'large.pdf',size:DOCUMENT_LIMITS.fileBytes+1}),/40 Mo/);
  await assert.rejects(extractDocument(new File(['x'.repeat(180001)],'long.txt')),/Aucun extrait tronqué/);
});
test('reader: DOCX paragraphs and footnotes remain present and ordered',async()=>{
  const bytes=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="word"><w:p><w:r><w:t>Premier</w:t></w:r></w:p><w:p><w:r><w:t>Dernier</w:t></w:r></w:p></w:document>'),'word/footnotes.xml':strToU8('<w:footnotes xmlns:w="word"><w:p>Source finale</w:p></w:footnotes>')});
  const text=await readOffice(bytes,'docx',unzipSync);
  assert.match(text,/Premier\nDernier/);assert.match(text,/Source finale/);
});
test('reader: Office does not execute entities or accept decompression bombs',async()=>{
  const bytes=zipSync({'content.xml':strToU8('<!DOCTYPE x [<!ENTITY e SYSTEM "https://example.invalid">]><x>&e;</x>')});
  await assert.rejects(readOffice(bytes,'odt',unzipSync),/externes interdites/);
  await assert.rejects(readOffice(new Uint8Array(),'docx',(_,opts)=>{opts.filter({name:'x.xml',originalSize:40000000});}),/décompressée/);
});
test('reader: every PDF page is extracted, in order, with no OCR when text exists',async()=>{
  let cleaned=0,destroyed=0;
  const out=await extractDocument(new File(['pdf'],'long.pdf'),{pdfLoader:async()=>({getDocument:()=>({destroy:async()=>destroyed++,promise:Promise.resolve({numPages:80,getPage:async n=>({getTextContent:async()=>({items:[{str:`PAGE_${n} `+'texte '.repeat(30),hasEOL:true}]}),cleanup:()=>cleaned++})})})}),ocrFactory:()=>{throw Error('unexpected OCR')}});
  assert.equal(out.pages,80);assert.equal(cleaned,80);assert.equal(destroyed,1);
  assert.ok(out.text.indexOf('PAGE_1 ')<out.text.indexOf('PAGE_80 '));assert.equal(out.ocrPages,0);
});
test('reader: cancellation happens before extraction and does not return partial text',async()=>{
  const ctrl=new AbortController();ctrl.abort();
  await assert.rejects(extractDocument(new File(['a'],'a.txt'),{signal:ctrl.signal}),{name:'AbortError'});
});
test('transport: a 100KB document passes unchanged, one above the route cap is rejected',async()=>{
  const input={original_request:'Fais une synthèse des pièces.',clarification_history:[],material_context:{present:true,deep_content_available:true},material_content:['é'.repeat(50000)]};
  const received=await readJsonBody(new Request('https://local.test',{method:'POST',body:JSON.stringify(input)}),TRANSPORT_LIMITS.analyst);
  assert.deepEqual(received,input);
  await assert.rejects(readJsonBody(new Request('https://local.test',{method:'POST',body:'x'.repeat(TRANSPORT_LIMITS.analyst+1)}),TRANSPORT_LIMITS.analyst),e=>e.status===413);
});
test('pipeline: unread attachments never reach Fast or OPRIE',async()=>{
  const h=loadPilot();h.ctx.state.docs=[{name:'broken.pdf',text:'',external:true}];
  assert.equal(await h.pilot.oprieRunTurn('architecte'),false);
  assert.equal(h.spy.fastCalls.length,0);assert.equal(h.spy.deepCalls.length,0);
  assert.match(h.spy.gate.at(-1).decision.text,/Aucun document ne sera ignoré/);
});
