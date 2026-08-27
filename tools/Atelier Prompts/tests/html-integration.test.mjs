import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'atelier-prompts-v11.5-lot10g-decision-provider.html'),'utf8');

test('l’application expose l’abstraction extérieure askDecisionProvider',()=>{
  assert.match(html,/async function askDecisionProvider\(input\)/);
  assert.match(html,/window\.askDecisionProvider=askDecisionProvider/);
});

test('Workers AI est primaire, Groq est fallback technique et le fallback local reste prudent',()=>{
  const primary=html.indexOf("['workers-ai'");
  const fallback=html.indexOf("['groq'");
  assert.ok(primary>0&&fallback>primary);
  const section=html.slice(html.indexOf('V11.5 LOT 10G — ADAPTIVE DECISION PIPELINE'),html.indexOf('window.__V11_ROUTER__'));
  assert.match(html,/https:\/\/atelier-decision-workers-ai\.11drumboy11\.workers\.dev\/decision/);
  assert.match(html,/https:\/\/atelier-decision-groq\.11drumboy11\.workers\.dev\/decision/);
  assert.match(html,/route:'architecte',confiance:'faible'/);
});

function loadProvider(fetchImpl){
  const start=html.indexOf('const ADP10G=');
  const end=html.indexOf('function v11ShowRapidGate');
  const context={
    AbortController,console:{warn(){}},fetch:fetchImpl,setTimeout,clearTimeout,
    document:{querySelector(selector){
      if(selector.includes('workers-ai'))return {content:'https://atelier-decision-workers-ai.11drumboy11.workers.dev/decision'};
      if(selector.includes('groq'))return {content:'https://atelier-decision-groq.11drumboy11.workers.dev/decision'};
      return null;
    }}
  };
  vm.runInNewContext(html.slice(start,end)+'\n;globalThis.__provider={askDecisionProvider};',context);
  return context.__provider;
}

const rapide={route:'rapide',confiance:'haute',raison:'Intention et livrable suffisamment identifiables ; les inconnues restantes sont substituables.',question_indispensable:null};
const architecte={route:'architecte',confiance:'haute',raison:'Intention ou livrable trop ouvert pour Rapide ; aucune question unique n’est indispensable.',question_indispensable:null};

test('une décision valide du primaire ne déclenche jamais Groq',async()=>{
  const calls=[];
  const provider=loadProvider(async(url)=>{calls.push(url);return Response.json(architecte)});
  const result=await provider.askDecisionProvider({demande:'Je veux préparer mon voyage',materiau_present:false,mode_demande:'rapide'});
  assert.equal(result.source,'workers-ai');
  assert.equal(result.decision.route,'architecte');
  assert.equal(calls.length,1);
});

test('Groq prend le relais sur erreur technique ou réponse primaire invalide',async()=>{
  for(const primaryFailure of ['network','invalid']){
    const calls=[];
    const provider=loadProvider(async(url)=>{
      calls.push(url);
      if(calls.length===1){
        if(primaryFailure==='network')throw new TypeError('network');
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
  assert.equal(result.decision.route,'architecte');
  assert.equal(result.decision.confiance,'faible');
});

test('le Decision Provider ne reçoit que l’entrée minimale',()=>{
  assert.match(html,/const minimal=\{demande:/);
  assert.match(html,/body:JSON\.stringify\(input\)/);
  const section=html.slice(html.indexOf('V11.5 LOT 10G — ADAPTIVE DECISION PIPELINE'),html.indexOf('window.__V11_ROUTER__'));
  assert.doesNotMatch(section,/appelFournisseur|api-cle|v11-api-key|maxTokens|systeme:|schema:/);
});

test('Rapide utilise son moteur historique et Architecte reçoit le relais',()=>{
  assert.match(html,/const r=assemblerRapideAdaptatif\(\)/);
  assert.match(html,/v11SwitchToArchitecteFromRapid\(orientation\.decision\)/);
  assert.match(html,/beginExchange\(\);return false/);
});

test('la clarification réévalue au plus trois fois sans perdre demande ni documents',()=>{
  const section=html.slice(html.indexOf('V11.5 LOT 10G — ADAPTIVE DECISION PIPELINE'),html.indexOf('window.__V11_ROUTER__'));
  assert.match(html,/syncLegacy\(\);\s*adpResumeAfterClarification\(\)/);
  assert.match(section,/const demande=compositeDemand\(\),materiau=materialText\(\)/);
  assert.match(section,/adpState\.clarifications<3/);
  assert.match(section,/adpState\.clarifications\+=1/);
  assert.match(section,/materiau_present:state\.docs\.length>0\|\|/);
  assert.match(section,/if\(orientation\.semantic\.question_indispensable\)\{adpState\.clarifications=1;adpShowQuestion/);
});

test('le middleware miroir refuse les contradictions génériques et canonise les raisons',()=>{
  const section=html.slice(html.indexOf('V11.5 LOT 10G — ADAPTIVE DECISION PIPELINE'),html.indexOf('window.__V11_ROUTER__'));
  assert.match(section,/ADP_REASONS/);
  assert.match(section,/La raison contredit la route rapide/);
  assert.match(section,/La raison contredit la question indispensable/);
  assert.match(section,/raison:canonique/);
});
