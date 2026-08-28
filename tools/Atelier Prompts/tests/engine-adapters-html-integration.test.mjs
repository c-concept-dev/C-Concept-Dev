import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'atelier-prompts-v11.5-lot10g-decision-provider.html'),'utf8');
const bundle=fs.readFileSync(path.join(root,'core/adn/browser-runtime.generated.js'),'utf8');

test('le bundle ADN navigateur est autonome et exécutable',()=>{
  const context={window:{},console};
  vm.createContext(context);
  vm.runInContext(bundle,context,{timeout:1000});
  const runtime=context.window.__ATELIER_ADN_RUNTIME__;
  assert.ok(runtime);
  assert.equal(typeof runtime.buildExecutionEnvelope,'function');
  assert.equal(typeof runtime.selectAdaptiveLocks,'function');
  assert.equal(typeof runtime.routeExecution,'function');
  assert.equal(typeof runtime.projectToRapide,'function');
  assert.equal(typeof runtime.nextConversationAction,'function');
});

test('le HTML autonome embarque exactement le runtime ADN généré',()=>{
  const hash=bundle.match(/source-sha256:\s*([a-f0-9]{64})/)?.[1];
  assert.ok(hash);
  assert.match(html,new RegExp(`source-sha256: ${hash}`));
  assert.match(html,/window\.__ATELIER_ADN_RUNTIME__/);
  assert.doesNotMatch(html,/<script[^>]+src=["'][^"']*core\/adn/i);
});

test('le routage produit utilise l’enveloppe ADN quand elle est disponible',()=>{
  const section=html.slice(html.indexOf('async function adpDecideRapide'),html.indexOf('function adpRunRapide'));
  assert.match(section,/adnBuildEnvelope\(demande,materiau,result\)/);
  assert.match(section,/adnNextConversationAction\(\{providerResult:result,requestedMode\}\)/);
  assert.match(section,/action\.route==='architecte'/);
});

test('Rapide conserve ses verrous historiques et peut recevoir les verrous ADN manquants',()=>{
  const section=html.slice(html.indexOf('function adpRunRapide'),html.indexOf('async function adpResumeAfterClarification'));
  assert.match(section,/adnMergeLegacyLocks\(r\.actifs,projection\)/);
  assert.match(section,/r\.prompt=assembler\(r\.ctx,actifs\)/);
  assert.match(section,/etat\.contrat=contratDuPrompt\(r\.ctx,r\.actifs\)/);
});

test('Architecte reçoit le contrat ADN comme cadrage sans modifier ARCH_SYSTEM ni ARCH_SCHEMA',()=>{
  const section=html.slice(html.indexOf('function makeEnvelope'),html.indexOf('function blobDownload'));
  assert.match(section,/adnCompactContractForArchitecte\(\)/);
  assert.match(section,/CONTRAT D’EXÉCUTION ADN — CADRAGE À PRÉSERVER/);
  assert.match(section,/produisez uniquement l’analyse JSON demandée par le système/);
});

test('Atelier reste un choix manuel et reçoit seulement une projection de contexte',()=>{
  const section=html.slice(html.indexOf('function v11StartAtelier'),html.indexOf('window.askDecisionProvider'));
  assert.match(section,/projectToAtelier/);
  assert.match(section,/ouvrirVue\('generation'\)/);
});
