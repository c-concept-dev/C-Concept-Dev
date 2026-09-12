import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const corpus=JSON.parse(fs.readFileSync(path.join(root,'evaluation/corpus-lot10g2a.json'),'utf8'));

test('le corpus 10G.2A contient 25 à 40 cas uniques et les trois oracles',()=>{
  assert.ok(corpus.cases.length>=25&&corpus.cases.length<=40);
  assert.equal(new Set(corpus.cases.map(item=>item.id)).size,corpus.cases.length);
  const labels=new Set(corpus.cases.map(item=>item.oracle.question_required?'architecte_question':item.oracle.route));
  assert.deepEqual([...labels].sort(),['architecte','architecte_question','rapide']);
});

test('chaque cas contient une demande, un domaine, une catégorie, un oracle et une justification',()=>{
  for(const item of corpus.cases){
    assert.ok(item.demande&&item.domain&&item.category&&item.rationale,item.id);
    assert.equal(typeof item.materiau_present,'boolean',item.id);
    assert.ok(['rapide','architecte'].includes(item.oracle.route),item.id);
    assert.equal(typeof item.oracle.question_required,'boolean',item.id);
    if(item.oracle.question_required)assert.equal(item.oracle.route,'architecte',item.id);
  }
});

test('les deux décisions explicitement imposées sont présentes dans l’oracle',()=>{
  const checklist=corpus.cases.find(item=>item.demande==='Fais-moi une checklist de 20 points pour préparer un voyage en Italie');
  const ouvert=corpus.cases.find(item=>item.demande==='Je veux préparer mon voyage en Italie');
  assert.deepEqual(checklist.oracle,{route:'rapide',question_required:false});
  assert.deepEqual(ouvert.oracle,{route:'architecte',question_required:false});
});

test('le corpus couvre matériaux présents et absents ainsi que des domaines variés',()=>{
  assert.ok(corpus.cases.some(item=>item.materiau_present));
  assert.ok(corpus.cases.some(item=>!item.materiau_present));
  assert.ok(new Set(corpus.cases.map(item=>item.domain)).size>=10);
});
