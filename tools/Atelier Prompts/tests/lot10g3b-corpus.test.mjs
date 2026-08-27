import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const corpus=JSON.parse(fs.readFileSync(path.join(root,'evaluation/corpus-lot10g3b.json'),'utf8'));

test('le corpus 10G.3B contient exactement les dix cas universels de référence',()=>{
  assert.equal(corpus.version,'10G.3B');
  assert.equal(corpus.cases.length,10);
  assert.equal(new Set(corpus.cases.map(item=>item.id)).size,10);
  assert.ok(new Set(corpus.cases.map(item=>item.domain)).size>=8);
});

test('les trois états de sortie attendus sont couverts sans incohérence',()=>{
  const labels=new Set(corpus.cases.map(item=>item.oracle.etat_demande==='clarification_necessaire'?'clarification':item.oracle.route));
  assert.deepEqual(labels,new Set(['rapide','clarification','architecte']));
  for(const item of corpus.cases){
    if(item.oracle.etat_demande==='clarification_necessaire')assert.equal(item.oracle.route,null,item.id);
    else assert.ok(['rapide','architecte'].includes(item.oracle.route),item.id);
  }
});
