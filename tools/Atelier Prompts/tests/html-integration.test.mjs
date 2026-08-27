import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'atelier-prompts-v11.5-lot10g-decision-provider.html'),'utf8');
const reasons={
  clarification:'La demande n’est pas encore suffisamment exploitable ; une clarification à forte valeur d’information est nécessaire.',
  rapide:'La demande est exploitable et peut être exécutée directement sans arbitrage structurel préalable.',
  architecte:'La demande est exploitable mais nécessite une structuration ou des arbitrages préalables.'
};
const rapide={etat_demande:'exploitable',route:'rapide',confiance:'haute',raison_interne:reasons.rapide,question:null};
const architecte={etat_demande:'exploitable',route:'architecte',confiance:'haute',raison_interne:reasons.architecte,question:null};
const clarification={etat_demande:'clarification_necessaire',route:null,confiance:'haute',raison_interne:reasons.clarification,question:'Quel résultat concret souhaitez-vous obtenir ?'};

test('l’application expose la couche 10G.3B extérieure aux moteurs',()=>{
  assert.match(html,/version:'10G\.3B'/);
  assert.match(html,/async function askDecisionProvider\(input\)/);
  assert.match(html,/window\.askDecisionProvider=askDecisionProvider/);
  assert.match(html,/const r=assemblerRapideAdaptatif\(\)/);
  assert.match(html,/return beginExchange\(\)/);
});

test('Workers AI est primaire, Groq fallback technique et le local reste prudent',()=>{
  const primary=html.indexOf("['workers-ai'"),fallback=html.indexOf("['groq'");
  assert.ok(primary>0&&fallback>primary);
  assert.match(html,/https:\/\/atelier-decision-workers-ai\.11drumboy11\.workers\.dev\/decision/);
  assert.match(html,/https:\/\/atelier-decision-groq\.11drumboy11\.workers\.dev\/decision/);
  assert.match(html,/etat_demande:'exploitable',route:'architecte',confiance:'moyenne'/);
});

function loadProvider(fetchImpl){
  const start=html.indexOf('const ADP10G='),end=html.indexOf('function v11ShowRapidGate');
  const context={AbortController,console:{warn(){}},fetch:fetchImpl,setTimeout,clearTimeout,document:{querySelector(selector){
    if(selector.includes('workers-ai'))return {content:'https://atelier-decision-workers-ai.11drumboy11.workers.dev/decision'};
    if(selector.includes('groq'))return {content:'https://atelier-decision-groq.11drumboy11.workers.dev/decision'};
    return null;
  }}};
  vm.runInNewContext(html.slice(start,end)+'\n;globalThis.__provider={askDecisionProvider};',context);
  return context.__provider;
}

test('toute décision primaire valide, y compris clarification ou Architecte, arrête la chaîne',async()=>{
  for(const semantic of [rapide,architecte,clarification]){
    const calls=[];
    const provider=loadProvider(async(url)=>{calls.push(url);return Response.json(semantic)});
    const result=await provider.askDecisionProvider({demande:'Demande',materiau_present:false,mode_demande:'rapide'});
    assert.equal(result.source,'workers-ai');
    assert.equal(result.decision.etat_demande,semantic.etat_demande);
    assert.equal(result.decision.route,semantic.route);
    assert.equal(calls.length,1);
  }
});

test('Groq prend le relais uniquement sur erreur technique ou réponse invalide',async()=>{
  for(const primaryFailure of ['network','http','invalid','incoherent']){
    const calls=[];
    const provider=loadProvider(async(url)=>{
      calls.push(url);
      if(calls.length===1){
        if(primaryFailure==='network')throw new TypeError('network');
        if(primaryFailure==='http')return new Response('{}',{status:502});
        if(primaryFailure==='incoherent')return Response.json({...rapide,question:'Question interdite ?'});
        return Response.json({route:'inconnue'});
      }
      return Response.json(rapide);
    });
    const result=await provider.askDecisionProvider({demande:'Fais une checklist',materiau_present:false,mode_demande:'rapide'});
    assert.equal(result.source,'groq');
    assert.equal(result.decision.route,'rapide');
    assert.equal(calls.length,2);
  }
});

test('la panne des deux providers conserve le fallback prudent local',async()=>{
  const provider=loadProvider(async()=>{throw new TypeError('network')});
  const result=await provider.askDecisionProvider({demande:'Demande',materiau_present:false,mode_demande:'rapide'});
  assert.equal(result.source,'local-prudent');
  assert.equal(result.decision.etat_demande,'exploitable');
  assert.equal(result.decision.route,'architecte');
  assert.equal(result.decision.question,null);
});

test('la fenêtre de clarification est modale, responsive et non technique',()=>{
  assert.match(html,/role="dialog" aria-modal="true"/);
  assert.match(html,/Une précision est nécessaire/);
  assert.match(html,/Pour bien préparer votre demande, j’ai besoin d’un détail/);
  assert.match(html,/id="v11-add-clarification-document">Ajouter un document/);
  assert.match(html,/id="v11-cancel-clarification">Annuler/);
  assert.match(html,/\.v11-clarification-modal\{position:fixed/);
  const modal=html.slice(html.indexOf('<div class="v11-stage v11-clarification-modal"'),html.indexOf('<div class="v11-stage v11-ready"'));
  assert.doesNotMatch(modal,/Workers AI|Groq|70B|GPT-OSS|confiance|raison_interne|route/);
});

test('la clarification conserve demande, réponses et documents et s’arrête à trois tours',()=>{
  const section=html.slice(html.indexOf('V11.5 LOT 10G — ADAPTIVE DECISION PIPELINE'),html.indexOf('window.__V11_ROUTER__'));
  assert.match(html,/state\.answers\.push\(\{question:\$\('#v11-question'\)\.textContent,answer\}\)/);
  assert.match(html,/syncLegacy\(\);\s*adpResumeAfterClarification\(\)/);
  assert.match(section,/const demande=compositeDemand\(\),materiau=materialText\(\)/);
  assert.match(section,/adpState\.clarifications<3/);
  assert.match(section,/adpState\.clarifications\+=1/);
  assert.match(section,/materiau_present:state\.docs\.length>0\|\|/);
  assert.match(html,/Le document demandé est joint/);
  assert.match(section,/orientation\.semantic\.etat_demande==='clarification_necessaire'/);
  assert.match(section,/function adpRunRapide\([^)]*\)\{\s*adpState\.pendingQuestion=false;show\(null\)/);
});

test('après exploitabilité, seules les routes Rapide et Architecte sont automatiques',()=>{
  const section=html.slice(html.indexOf('V11.5 LOT 10G — ADAPTIVE DECISION PIPELINE'),html.indexOf('window.__V11_ROUTER__'));
  assert.match(section,/if\(sem\.route==='rapide'\)/);
  assert.match(section,/route:'architecte'/);
  assert.doesNotMatch(section,/route:'atelier'|sem\.route==='atelier'/);
});

test('le Decision Provider ne reçoit que l’entrée minimale',()=>{
  const section=html.slice(html.indexOf('V11.5 LOT 10G — ADAPTIVE DECISION PIPELINE'),html.indexOf('window.__V11_ROUTER__'));
  assert.match(section,/const minimal=\{demande:/);
  assert.match(section,/body:JSON\.stringify\(input\)/);
  assert.doesNotMatch(section,/appelFournisseur|api-cle|v11-api-key|maxTokens|systeme:|schema:/);
});
