import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const corpus=JSON.parse(fs.readFileSync(path.join(root,'evaluation/corpus-lot10g3b1.json'),'utf8'));

test('le corpus 10G.3B.1 contient exactement les dix cas conversationnels de référence',()=>{
  assert.equal(corpus.version,'10G.3B.1');
  assert.equal(corpus.cases.length,10);
  assert.equal(new Set(corpus.cases.map(item=>item.id)).size,10);
  assert.ok(new Set(corpus.cases.map(item=>item.domain)).size>=7);
});

test('les trois sorties sont couvertes sans incohérence dans les oracles finaux',()=>{
  const fixed=corpus.cases.filter(item=>typeof item.oracle.etat_demande==='string');
  const labels=new Set(fixed.map(item=>item.oracle.etat_demande==='clarification_necessaire'?'clarification':Array.isArray(item.oracle.route)?item.oracle.route[0]:item.oracle.route));
  assert.deepEqual(labels,new Set(['rapide','clarification','architecte']));
  for(const item of fixed){
    if(item.oracle.etat_demande==='clarification_necessaire')assert.equal(item.oracle.route,null,item.id);
    else assert.ok(Array.isArray(item.oracle.route)||['rapide','architecte'].includes(item.oracle.route),item.id);
  }
});

test('le corpus contient le parcours multi-tour et la liste de jargon interdit',()=>{
  assert.ok(corpus.forbidden_question_terms.includes('résultat concret'));
  assert.ok(corpus.forbidden_question_terms.includes('besoin métier'));
  const multi=corpus.cases.filter(item=>item.id==='C02'||item.id==='C03');
  assert.equal(multi.length,2);
  assert.ok(multi.every(item=>item.demande.includes('Précisions apportées pendant le dialogue')));
});
