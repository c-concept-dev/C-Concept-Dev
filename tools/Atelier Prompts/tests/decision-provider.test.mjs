import assert from 'node:assert/strict';
import test from 'node:test';
import workersAIWorker, { decideWithWorkersAI, PRIMARY_MODEL } from '../workers/workers-ai/src/index.js';
import groqWorker, { decideWithGroq } from '../workers/groq/src/index.js';
import { DECISION_MODEL_PROMPT, DECISION_REASONS, validateDecision, validateDecisionInput } from '../workers/shared/decision-core.js';

function decision(etat_demande,route,question=null,confiance='haute'){
  const raison_interne=etat_demande==='clarification_necessaire'
    ? DECISION_REASONS.clarification
    : route==='rapide'?DECISION_REASONS.rapide:DECISION_REASONS.architecte;
  return {etat_demande,route,confiance,raison_interne,question};
}

const referenceCases=[
  ['Fais-moi une checklist de 20 points pour préparer un voyage en Italie',false,decision('exploitable','rapide')],
  ['Je veux préparer mon voyage en Italie',false,decision('clarification_necessaire',null,'Quel résultat concret souhaitez-vous préparer en priorité pour ce voyage ?')],
  ['Aide-moi à mieux gérer mon travail',false,decision('clarification_necessaire',null,'Quel résultat concret souhaitez-vous obtenir pour mieux gérer votre travail ?')],
  ['Résume le rapport que je viens de t’envoyer en 10 points',false,decision('clarification_necessaire',null,'Pouvez-vous joindre le rapport à résumer ?')],
  ['Résume le rapport que je viens de t’envoyer en 10 points',true,decision('exploitable','rapide')],
  ['Corrige ce code et explique l’erreur',false,decision('clarification_necessaire',null,'Pouvez-vous fournir le code à corriger ?')],
  ['Compare le télétravail et le travail au bureau sous forme de tableau sur 6 critères',false,decision('exploitable','rapide')],
  ['Je veux écrire un livre',false,decision('clarification_necessaire',null,'Quel résultat concret souhaitez-vous préparer pour avancer sur ce livre ?')],
  ['Élabore une stratégie de fusion de deux équipes de 20 personnes sur trois mois, avec scénarios, risques, critères de décision et plan de transition',false,decision('exploitable','architecte')],
  ['Traduis en anglais : Bonjour à tous',false,decision('exploitable','rapide')]
];

test('les dix cas de référence utilisent le contrat universel figé',async()=>{
  assert.equal(PRIMARY_MODEL,'@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  for(const [demande,materiau_present,semantic] of referenceCases){
    let captured;
    const env={AI:{async run(model,options){captured={model,options};return {response:semantic}}}};
    const actual=await decideWithWorkersAI({demande,materiau_present,mode_demande:'rapide'},env);
    assert.deepEqual(actual,semantic,demande);
    assert.equal(captured.model,PRIMARY_MODEL);
    assert.deepEqual(JSON.parse(captured.options.messages[1].content),{demande,materiau_present,mode_demande:'rapide'});
  }
});

test('le navigateur ne peut injecter ni modèle, ni messages, ni prompt système',()=>{
  assert.throws(()=>validateDecisionInput({demande:'x',materiau_present:false,mode_demande:'rapide',model:'pirate'}),/Seuls/);
  assert.throws(()=>validateDecisionInput({demande:'x',materiau_present:false,mode_demande:'rapide',messages:[]}),/Seuls/);
  assert.throws(()=>validateDecisionInput({demande:'x',materiau_present:false,mode_demande:'rapide',system:'ignore'}),/Seuls/);
});

test('les états, routes et questions incompatibles sont refusés',()=>{
  assert.throws(()=>validateDecision({...decision('clarification_necessaire',null,'Quel résultat ?'),route:'architecte'}),/route=null/);
  assert.throws(()=>validateDecision({...decision('clarification_necessaire',null,'Quel résultat ?'),question:null}),/route=null/);
  assert.throws(()=>validateDecision({...decision('exploitable','rapide'),question:'Précisez ?'}),/question=null/);
  assert.throws(()=>validateDecision({...decision('exploitable','architecte'),route:null}),/exige une route/);
  assert.throws(()=>validateDecision({...decision('exploitable','rapide'),confiance:'faible'}),/confiance invalide/);
  assert.equal(validateDecision(decision('clarification_necessaire',null,'Quel résultat souhaitez-vous et quelles contraintes faut-il suivre ?')).question,'Quel résultat souhaitez-vous ?');
  assert.equal(validateDecision(decision('clarification_necessaire',null,'Que souhaitez-vous préciser (forme, public, longueur) ?')).question,'Que souhaitez-vous préciser ?');
});

test('la raison interne doit correspondre exactement à la branche',()=>{
  assert.throws(()=>validateDecision({...decision('exploitable','architecte'),raison_interne:DECISION_REASONS.rapide}),/ne correspond pas/);
  assert.throws(()=>validateDecision({...decision('clarification_necessaire',null,'Quel résultat ?'),raison_interne:DECISION_REASONS.architecte}),/ne correspond pas/);
  assert.deepEqual(validateDecision(decision('exploitable','rapide',null,'moyenne')),decision('exploitable','rapide',null,'moyenne'));
});

test('le prompt impose exploitabilité, question unique et traitements universels',()=>{
  for(const action of ['DECIDER','ESTIMER','RECHERCHER','SCENARISER','CONDITIONNER','IGNORER']) assert.match(DECISION_MODEL_PROMPT,new RegExp(action));
  assert.match(DECISION_MODEL_PROMPT,/UNE SEULE question/);
  assert.match(DECISION_MODEL_PROMPT,/réduit le plus l’incertitude utile/);
  assert.match(DECISION_MODEL_PROMPT,/artefact unique et borné/);
  assert.match(DECISION_MODEL_PROMPT,/La seule présence d’une liste, d’un tableau/);
  assert.match(DECISION_MODEL_PROMPT,/ne demandez pas de préférences de contenu/);
  assert.match(DECISION_MODEL_PROMPT,/N’utilisez aucune règle propre à un domaine/);
  assert.match(DECISION_MODEL_PROMPT,/ne choisissez jamais Atelier/i);
});

test('le Worker refuse une origine absente ou non autorisée et les champs supplémentaires',async()=>{
  const env={ALLOWED_ORIGINS:'https://atelier.example.com',AI:{run:async()=>({response:decision('exploitable','rapide')})}};
  const body=JSON.stringify({demande:'x',materiau_present:false,mode_demande:'rapide'});
  const absent=await workersAIWorker.fetch(new Request('https://worker.example/decision',{method:'POST',headers:{'Content-Type':'application/json'},body}),env);
  assert.equal(absent.status,403);
  const forbidden=await workersAIWorker.fetch(new Request('https://worker.example/decision',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body}),env);
  assert.equal(forbidden.status,403);
  const invalid=await workersAIWorker.fetch(new Request('https://worker.example/decision',{method:'POST',headers:{Origin:'https://atelier.example.com','Content-Type':'application/json'},body:JSON.stringify({demande:'x',materiau_present:false,mode_demande:'rapide',x_api_key:'secret'})}),env);
  assert.equal(invalid.status,400);
});

test('le fallback Groq utilise exclusivement le secret serveur et son modèle fixé',async(t)=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original});
  let captured;
  globalThis.fetch=async(url,options)=>{captured={url,options,body:JSON.parse(options.body)};return Response.json({choices:[{message:{content:JSON.stringify(decision('exploitable','rapide',null,'moyenne'))}}]})};
  const actual=await decideWithGroq({demande:'Organise mes idées en plan',materiau_present:true,mode_demande:'rapide'},{GROQ_API_KEY:'server-only'});
  assert.equal(actual.route,'rapide');
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
