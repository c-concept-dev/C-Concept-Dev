import assert from 'node:assert/strict';
import test from 'node:test';
import workersAIWorker, { decideWithWorkersAI, PRIMARY_MODEL } from '../workers/workers-ai/src/index.js';
import groqWorker, { decideWithGroq } from '../workers/groq/src/index.js';
import { DECISION_MODEL_PROMPT, DECISION_REASONS, validateDecision, validateDecisionInput } from '../workers/shared/decision-core.js';

const cases=[
  ['Fais-moi une checklist de 20 points pour préparer un voyage en Italie',false,'rapide',null],
  ['Je veux préparer mon voyage en Italie',false,'architecte',null],
  ['Résume ce texte',true,'rapide',null],
  ['Résume ce texte',false,'architecte','Pouvez-vous fournir le texte à résumer ?'],
  ['Rédige un courrier de résiliation pour mon assurance',false,'rapide',null],
  ['Transforme ces notes de laboratoire en protocole reproductible',true,'rapide',null],
  ['Compare les deux plans dont je parle',false,'architecte','Pouvez-vous fournir les deux plans à comparer ?']
];

test('les cas obligatoires et hors domaine sont orientés par la réponse sémantique',async()=>{
  assert.equal(PRIMARY_MODEL,'@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  for(const [demande,materiau_present,route,question] of cases){
    let captured;
    const env={AI:{async run(model,options){
      captured={model,options};
      return {response:{route,confiance:question?'haute':'haute',raison:route==='rapide'?'Le livrable est suffisamment déterminé.':'Le matériau référencé est non substituable.',question_indispensable:question}};
    }}};
    const decision=await decideWithWorkersAI({demande,materiau_present,mode_demande:'rapide'},env);
    assert.equal(decision.route,route,demande);
    assert.equal(decision.question_indispensable,question,demande);
    assert.equal(captured.model,PRIMARY_MODEL);
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

test('les invariants refusent les contradictions génériques entre route, raison et question',()=>{
  assert.throws(()=>validateDecision({route:'rapide',confiance:'haute',raison:'L’intention n’est pas suffisamment identifiable.',question_indispensable:null}),/contredit la route rapide/);
  assert.throws(()=>validateDecision({route:'architecte',confiance:'haute',raison:'Aucune clarification n’est nécessaire.',question_indispensable:'Quel résultat attendez-vous ?'}),/contredit la question/);
  assert.throws(()=>validateDecision({route:'architecte',confiance:'haute',raison:DECISION_REASONS.rapide,question_indispensable:null}),/contredit la route architecte|canonique/);
});

test('une raison compatible est normalisée vers la phrase canonique de sa branche',()=>{
  const rapide=validateDecision({route:'rapide',confiance:'moyenne',raison:'La demande permet de produire le résultat.',question_indispensable:null});
  assert.equal(rapide.raison,DECISION_REASONS.rapide);
  const architecte=validateDecision({route:'architecte',confiance:'haute',raison:'Plusieurs formes de résultat restent possibles.',question_indispensable:null});
  assert.equal(architecte.raison,DECISION_REASONS.architecte);
});

test('le prompt impose une procédure ordonnée et conserve tous les traitements universels',()=>{
  for(const action of ['DECIDEE','ESTIMEE','RECHERCHEE','SCENARISEE','CONDITIONNEE','QUESTIONNER','IGNOREE']) assert.match(DECISION_MODEL_PROMPT,new RegExp(action));
  assert.match(DECISION_MODEL_PROMPT,/PROCÉDURE OBLIGATOIRE, DANS CET ORDRE/);
  assert.match(DECISION_MODEL_PROMPT,/confiance mesure votre certitude sur la ROUTE/);
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
  assert.equal(captured.body.model,'openai/gpt-oss-20b');
  assert.equal(captured.body.reasoning_format,'hidden');
  assert.equal(captured.body.reasoning_effort,'low');
  assert.equal(captured.body.max_completion_tokens,512);
  assert.equal(captured.body.messages[0].role,'system');
  assert.equal(captured.body.messages[1].content,JSON.stringify({demande:'Organise mes idées en plan',materiau_present:true,mode_demande:'rapide'}));
  assert.equal('x-api-key' in captured.options.headers,false);
});

test('le Worker Groq refuse une requête sans Origin',async()=>{
  const response=await groqWorker.fetch(new Request('https://worker.example/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({demande:'x',materiau_present:false,mode_demande:'rapide'})}),{});
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{error:'origin_not_allowed'});
});
