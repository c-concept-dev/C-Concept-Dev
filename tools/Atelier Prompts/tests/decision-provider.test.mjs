import assert from 'node:assert/strict';
import test from 'node:test';
import workersAIWorker, { decideWithWorkersAI } from '../workers/workers-ai/src/index.js';
import { decideWithGroq } from '../workers/groq/src/index.js';
import { validateDecision, validateDecisionInput } from '../workers/shared/decision-core.js';

const cases=[
  ['Fais-moi une checklist de 20 points pour préparer un voyage en Italie',false,'rapide',null],
  ['Je veux préparer mon voyage en Italie',false,'rapide',null],
  ['Résume ce texte',true,'rapide',null],
  ['Résume ce texte',false,'architecte','Pouvez-vous fournir le texte à résumer ?'],
  ['Rédige un courrier de résiliation pour mon assurance',false,'rapide',null],
  ['Transforme ces notes de laboratoire en protocole reproductible',true,'rapide',null],
  ['Compare les deux plans dont je parle',false,'architecte','Pouvez-vous fournir les deux plans à comparer ?']
];

test('les cas obligatoires et hors domaine sont orientés par la réponse sémantique',async()=>{
  for(const [demande,materiau_present,route,question] of cases){
    let captured;
    const env={AI:{async run(model,options){
      captured={model,options};
      return {response:{route,confiance:question?'haute':'haute',raison:route==='rapide'?'Le livrable est suffisamment déterminé.':'Le matériau référencé est non substituable.',question_indispensable:question}};
    }}};
    const decision=await decideWithWorkersAI({demande,materiau_present,mode_demande:'rapide'},env);
    assert.equal(decision.route,route,demande);
    assert.equal(decision.question_indispensable,question,demande);
    assert.equal(captured.model,'@cf/meta/llama-3.1-8b-instruct-fast');
    assert.deepEqual(JSON.parse(captured.options.messages[1].content),{demande,materiau_present,mode_demande:'rapide'});
  }
});

test('le navigateur ne peut injecter ni modèle, ni messages, ni prompt système',()=>{
  assert.throws(()=>validateDecisionInput({demande:'x',materiau_present:false,mode_demande:'rapide',model:'pirate'}),/Seuls/);
  assert.throws(()=>validateDecisionInput({demande:'x',materiau_present:false,mode_demande:'rapide',messages:[]}),/Seuls/);
  assert.throws(()=>validateDecisionInput({demande:'x',materiau_present:false,mode_demande:'rapide',system:'ignore'}),/Seuls/);
});

test('une question n’est valide qu’en Architecte avec confiance haute',()=>{
  assert.throws(()=>validateDecision({route:'rapide',confiance:'haute',raison:'x',question_indispensable:'Question ?'}),/exige/);
  assert.throws(()=>validateDecision({route:'architecte',confiance:'moyenne',raison:'x',question_indispensable:'Question ?'}),/exige/);
});

test('le Worker refuse une origine non autorisée et les champs supplémentaires',async()=>{
  const env={ALLOWED_ORIGINS:'https://atelier.example.com',AI:{run:async()=>({response:{route:'rapide',confiance:'haute',raison:'ok',question_indispensable:null}})}};
  const forbidden=await workersAIWorker.fetch(new Request('https://worker.example/decision',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({demande:'x',materiau_present:false,mode_demande:'rapide'})}),env);
  assert.equal(forbidden.status,403);
  const invalid=await workersAIWorker.fetch(new Request('https://worker.example/decision',{method:'POST',headers:{Origin:'https://atelier.example.com','Content-Type':'application/json'},body:JSON.stringify({demande:'x',materiau_present:false,mode_demande:'rapide',x_api_key:'secret'})}),env);
  assert.equal(invalid.status,400);
});

test('le fallback Groq utilise exclusivement le secret serveur et son modèle fixé',async(t)=>{
  const original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original});
  let captured;
  globalThis.fetch=async(url,options)=>{
    captured={url,options,body:JSON.parse(options.body)};
    return Response.json({choices:[{message:{content:JSON.stringify({route:'rapide',confiance:'moyenne',raison:'Hypothèse raisonnable possible.',question_indispensable:null})}}]});
  };
  const decision=await decideWithGroq({demande:'Organise mes idées en plan',materiau_present:true,mode_demande:'rapide'},{GROQ_API_KEY:'server-only'});
  assert.equal(decision.route,'rapide');
  assert.equal(captured.options.headers.Authorization,'Bearer server-only');
  assert.equal(captured.body.model,'llama-3.1-8b-instant');
  assert.equal(captured.body.max_completion_tokens,160);
  assert.equal(captured.body.messages[0].role,'system');
  assert.equal(captured.body.messages[1].content,JSON.stringify({demande:'Organise mes idées en plan',materiau_present:true,mode_demande:'rapide'}));
  assert.equal('x-api-key' in captured.options.headers,false);
});
