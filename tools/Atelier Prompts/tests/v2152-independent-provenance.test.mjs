import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildAdnState } from '../core/adn/adn-state.js';
import { mapOprieToCanonicalContract } from '../core/adn/oprie-canonical-mapping.js';
import { buildExecutionEnvelope } from '../core/adn/engine-adapters.js';

const decision = { etat_demande: 'exploitable', route: 'rapide' };
const core = {
  state: 'operational_request_ready',
  operational_request_candidate: {
    objective: 'Préparer le livrable demandé', expected_deliverable: 'Un plan',
    confirmed_constraints: ['4 jours'], assumptions_allowed: ['4 nuits à confirmer']
  },
  issues: [], intent_preservation: {
    objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: []
  }
};
const unknown = [undefined, null, '', ' ', 'usr', 'legacy', 'arch_analysis', 'derived_deterministic', 'system'];
for (const source of unknown) {
  test(`independent: structured constraint ${JSON.stringify(source)} never defaults to user`, () => {
    const state = buildAdnState({ demande: 'Demande', decision,
      constraints: [{ text: 'Contenu sans preuve', source }] });
    assert.equal(state.intent.explicit_constraints[0].source, 'system');
    assert.equal(state.completeness.obligations[0].source, 'system');
  });
}
test('independent: real Core mapping → envelope → ADN preserves declared and derived provenance', () => {
  const base = mapOprieToCanonicalContract(core, { original_request: 'Préparer un séjour de 4 jours', request_id: 'audit' });
  base.obligations.push({ text: '4 nuits à confirmer', source: 'arch_analysis', mandatory: true });
  const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: { source: 'none', decision } });
  assert.deepEqual(envelope.state.completeness.obligations.filter(x => x.source === 'user').map(x => x.text), ['4 jours']);
  assert.equal(envelope.state.completeness.obligations.find(x => x.text === '4 nuits à confirmer').source, 'system');
  const hypotheses = Object.values(envelope.state.assumptions).filter(x => x?.text);
  assert.ok(hypotheses.length > 0);
  assert.ok(hypotheses.every(x => x.source === 'deduction' && x.status === 'assumption'));
});
test('independent: canonical projection must not erase a constraint provenance', () => {
  for (const source of [...unknown, 'material', 'oprie', 'user']) {
    const base = mapOprieToCanonicalContract(core, { original_request: 'Demande', request_id: 'audit' });
    base.intent.explicit_constraints = [{ text: 'Valeur', source }];
    const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: { source: 'none', decision } });
    const expected = ['oprie', 'user'].includes(source) ? 'user' : source === 'material' ? 'material' : 'system';
    assert.equal(envelope.state.completeness.obligations[0].source, expected, String(source));
  }
});
const adversarial = [
 ['4 jours','4 nuits'], ['fin mars','22 au 31 mars'],
 ['1200 euros pour deux, vols compris','1200 euros couvrant vols, hôtel, repas et activités'],
 ['Je veux un Airbnb','Airbnb centre historique'], ['2 heures','120 minutes de travail effectif'],
 ['Nous sommes deux, budget 1200','600 €/personne'], ['le matin','09:00'],
 ['au printemps','avril'], ['pas trop cher','moins de 100 €'], ['je préfère calme','quartier résidentiel']
];
for (const [stated,derived] of adversarial) {
 test(`independent: structural provenance ${stated} / ${derived}`, () => {
  const state=buildAdnState({demande:stated,decision,
   constraints:[{text:stated,source:'user'},{text:derived,source:'derived_deterministic'}],
   obligations:[{text:derived,source:'arch_analysis'}],assumptions:[derived]});
  assert.deepEqual(state.completeness.obligations.filter(x=>x.source==='user').map(x=>x.text),[stated]);
  assert.ok(state.completeness.obligations.some(x=>x.text===derived&&x.source==='system'));
  assert.ok(Object.values(state.assumptions).some(x=>x?.text===derived&&x.status==='assumption'));
 });
}
test('independent: faithful unit normalization remains possible on explicitly user branch',()=>{
 const state=buildAdnState({demande:'2 heures',decision,constraints:[{text:'120 minutes',source:'user'}]});
 assert.equal(state.completeness.obligations[0].source,'user');
 // Structural test only: this does not claim that the normalizer proves semantic entailment.
});
test('independent: source rights and usage have no invented HTML default',()=>{
 const html=fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html',import.meta.url),'utf8');
 for(const id of ['droit','usage']){
  const select=html.match(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`));
  assert.ok(select,`select ${id} exists`);
  assert.match(select[1],/^\s*<option value="" selected>Non précisé<\/option>/);
 }
});
test('independent: old implicit metadata is retained for confirmation, not restored as fact',()=>{
 const html=fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html',import.meta.url),'utf8');
 const a=html.indexOf('function restaurerMetadonneesSource(record){');
 const b=html.indexOf('function sauverBrouillon(){',a);
 assert.ok(a>=0&&b>a);
 const els=Object.fromEntries(['droit','usage'].map(id=>[id,{value:'',dataset:{},parentElement:{querySelector:()=>null}}]));
 const context={$:id=>els[id.slice(1)]};vm.createContext(context);vm.runInContext(html.slice(a,b),context);
 const old={droit:'abonnement institutionnel en cours',usage:'analyse et synthèse pour usage professionnel interne'};
 context.restaurerMetadonneesSource(old);
 for(const id of ['droit','usage']){assert.equal(els[id].value,'');assert.equal(els[id].dataset.pendingLegacyValue,old[id]);}
 context.restaurerMetadonneesSource({sourceMetadataVersion:1,...old});
 for(const id of ['droit','usage'])assert.equal(els[id].value,old[id]);
 context.restaurerMetadonneesSource({sourceMetadataVersion:1,droit:'',usage:'',sourceMetadataPending:old});
 for(const id of ['droit','usage']){assert.equal(els[id].value,'');assert.equal(els[id].dataset.pendingLegacyValue,old[id]);}
 context.restaurerMetadonneesSource({});
 for(const id of ['droit','usage'])assert.equal(els[id].value,'','empty restore must not retain a previous value');
});
