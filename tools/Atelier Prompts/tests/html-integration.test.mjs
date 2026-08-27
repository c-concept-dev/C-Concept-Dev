import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'atelier-prompts-v11.5-lot10g-decision-provider.html'),'utf8');

test('l’application expose l’abstraction extérieure askDecisionProvider',()=>{
  assert.match(html,/async function askDecisionProvider\(input\)/);
  assert.match(html,/window\.askDecisionProvider=askDecisionProvider/);
});

test('Workers AI précède Groq et le fallback local reste prudent',()=>{
  const primary=html.indexOf("['workers-ai'");
  const fallback=html.indexOf("['groq'",primary);
  assert.ok(primary>0&&fallback>primary);
  assert.match(html,/route:'architecte',confiance:'faible'/);
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
