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
});

test('le HTML autonome embarque exactement le runtime ADN généré',()=>{
  const hash=bundle.match(/source-sha256:\s*([a-f0-9]{64})/)?.[1];
  assert.ok(hash);
  assert.match(html,new RegExp(`source-sha256: ${hash}`));
  assert.match(html,/window\.__ATELIER_ADN_RUNTIME__/);
  assert.doesNotMatch(html,/<script[^>]+src=["'][^"']*core\/adn/i);
});

test('le routage produit utilise l’enveloppe ADN quand elle est disponible',()=>{
  /* CLEAN-01 : ce test mesurait l'ANCIEN décideur, retiré. Les enveloppes ADN du produit
     vivent sur les deux entrées gouvernées réelles ; c'est là qu'on les mesure. */
  const rapide=html.slice(html.indexOf('function adpRunRapide('),html.indexOf('async function v11StartRapide'));
  assert.match(rapide,/adnRefineRapidEnvelope\(r,orientation,materiau\)/);
  const arch=html.slice(html.indexOf('function adpEnterArchitecte('),html.indexOf('function adpRunRapide('));
  assert.match(arch,/adnCanonicalEnvelope\(canonical,materiau,'architecte'\)/);
  assert.match(arch,/adnManualEnvelope\(demande,materiau,'architecte'\)/);
  assert.match(arch,/envelope\.routing\.route!=='architecte'/);
});

test('Rapide conserve ses verrous historiques et peut recevoir les verrous ADN manquants',()=>{
  const section=html.slice(html.indexOf('function adpRunRapide'),html.indexOf('async function v11StartRapide'));
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

test('Atelier reste un choix manuel, et ne calcule plus de projection que personne ne lit',()=>{
  /* CLEAN-02 : la projection de contexte d'Atelier était calculée puis rangée dans un champ
     partagé qu'aucun code ne lisait. Elle est retirée ; l'enveloppe locale d'audit demeure. */
  const section=html.slice(html.indexOf('function v11StartAtelier'),html.indexOf('window.askDecisionProvider'));
  assert.match(section,/adnManualEnvelope\(d,mat,'rapide'\)/);
  assert.doesNotMatch(section,/projectToAtelier|lastProjection/);
  assert.match(section,/ouvrirVue\('generation'\)/);
});
