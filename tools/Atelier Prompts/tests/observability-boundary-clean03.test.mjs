/* CLEAN-03 — LA FRONTIÈRE ENTRE CE QUI DÉCIDE ET CE QUI OBSERVE.
 * ============================================================================
 *
 * CLEAN-01 avait retiré une machinerie, CLEAN-02 des états sans lecteur. Ce lot
 * pose une question différente : parmi ce qui reste, qu'est-ce qui SERT au
 * produit, et qu'est-ce qui ne sert qu'à le regarder ?
 *
 * LE RÉSULTAT MESURÉ, ET IL EST À CONTRE-COURANT D'UN LOT DE NETTOYAGE : il n'y
 * a rien à retirer. Les cinq champs d'observation d'oprieState sont tous lus
 * par des preuves qui portent, et aucun mark de télémétrie ne peut les
 * remplacer — la trace dit QUAND, le champ dit QUOI. `lastReconciliation` porte
 * `authoritative_state`, que le mark ne contient pas ; `executionId` prouve
 * qu'AUCUN cycle ne s'est ouvert, ce qu'une absence de mark ne démontre pas.
 * Les supprimer coûterait des preuves, pas du bruit. La règle §9 du lot dit
 * exactement quoi faire dans ce cas : les conserver, et FORMALISER leur statut.
 *
 * Et le frontend ne contient AUCUN résidu de débogage : zéro console.log, zéro
 * console.debug, zéro console.info. Les vingt-et-un appels restants sont des
 * signaux d'échec attendu — « X indisponible ; repli conservé » — qui ne portent
 * ni clé, ni prompt, ni document, ni contenu utilisateur.
 *
 * UN FAIT MESURÉ QUE CE LOT NE FERME PAS. Le bundle navigateur embarque tout le
 * sous-graphe d'orchestration côté worker, parce que le module de round-trip
 * manuel en dépend. Neuf modules n'ont aucun consommateur frontend direct mais
 * sont des dépendances transitives réelles. Les retirer demanderait un élagage
 * de build, pas un nettoyage d'observabilité — ce n'est pas ce lot, et le
 * prétendre serait faux.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPilot, arbiterTurn, clarificationTurn, delay, html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tranche = (debut, fin) => { const a = html.indexOf(debut); return html.slice(a, html.indexOf(fin, a + debut.length)); };
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);
const compte = (motif, src = FRONT_CODE) => [...src.matchAll(new RegExp(motif, 'g'))].length;

/** Les cinq champs d'oprieState qu'aucun code du produit ne lit. Liste FERMÉE. */
const OBSERVATION_SEULE = Object.freeze([
  'lastTurn', 'lastReconciliation', 'lastOrchestration', 'executionId', 'telemetry'
]);
/** Les champs d'oprieState que le produit lit pour décider. */
const DE_PRODUIT = Object.freeze([
  'seq', 'controller', 'fastController', 'running', 'concludedTurn', 'appliedActions',
  'lifecycle', 'canonicalContract', 'requestedMode', 'fastInteraction'
]);

// =================================================================================================
// §45 — L'OBSERVATION N'EST PAS UNE AUTORITÉ
// =================================================================================================

test('T-CLEAN03-01 : aucun champ d’observation n’est lu pour décider quoi que ce soit', () => {
  /* La preuve est textuelle et exhaustive : chaque LECTURE d'un champ d'observation
     est examinée, et aucune n'apparaît dans une condition, un retour ou un argument
     de décision. On les cherche là où une décision se prend. */
  const decisionnels = [
    tranche('function oprieDriveOrchestration(', 'function oprieApplyTurn('),
    tranche('function oprieEnterExecution(', 'function oprieDecideOrchestration'),
    tranche('function oprieTurnContext(', 'const ORCHESTRATION_DRIVER='),
    tranche('function adpRunRapide(', 'async function v11StartRapide'),
    tranche('function adpEnterArchitecte(', 'function adpRunRapide('),
    tranche('async function beginApiAnalysis()', 'function compositeDemand')
  ].map(sansProse).join('\n');
  for (const champ of OBSERVATION_SEULE) {
    assert.equal(decisionnels.includes(`oprieState.${champ}`), false,
      `aucun chemin de décision ne lit oprieState.${champ}.`);
  }
});

test('T-CLEAN03-02 : les cinq champs d’observation n’ont aucun lecteur produit', () => {
  for (const champ of OBSERVATION_SEULE) {
    const nom = `oprieState.${champ}`;
    const total = compte(`oprieState\\.${champ}\\b`);
    const ecrits = compte(`(?<![=!<>])\\boprieState\\.${champ}\\s*=(?![=>])`);
    /* `telemetry` n'est jamais réaffectée : elle est alimentée par une seule fonction. */
    const lectures = total - ecrits;
    if (champ === 'telemetry') {
      assert.equal(lectures, 1, 'telemetry n’est lue que par oprieMark, qui l’alimente.');
      assert.match(sansProse(tranche('function oprieMark(', 'function oprieFastRuntime')),
        /const marks=oprieState\.telemetry/);
    } else {
      assert.equal(lectures, 0, `${nom} n’est lu par aucun code du produit.`);
    }
  }
  /* Et les champs DE PRODUIT, eux, sont bien lus : la frontière n'est pas décorative. */
  for (const champ of DE_PRODUIT) {
    const total = compte(`oprieState\\.${champ}\\b`);
    const ecrits = compte(`(?<![=!<>])\\boprieState\\.${champ}\\s*=(?![=>])`);
    assert.ok(total - ecrits > 0, `oprieState.${champ} est réellement lu par le produit.`);
  }
});

test('T-CLEAN03-03/04 : chaque trace a un propriétaire nommé, et un seul', () => {
  /* La déclaration d'oprieState porte la classification, en clair, au-dessus du champ. */
  const entete = html.slice(html.indexOf('/* CLEAN-03 — CET ÉTAT PORTE DEUX CHOSES'),
                            html.indexOf('const oprieState={'));
  assert.ok(entete.length > 400, 'la classification est écrite là où l’état vit.');
  for (const champ of OBSERVATION_SEULE) {
    assert.ok(entete.includes(champ), `${champ} est nommé comme observation seule.`);
  }
  for (const champ of DE_PRODUIT) {
    assert.ok(entete.includes(champ), `${champ} est nommé comme champ de produit.`);
  }
  /* Un seul porteur d'état de tour : aucune trace parallèle ailleurs. */
  assert.equal(compte('const oprieState=\\{'), 1);
  assert.equal(compte('const adpState=\\{'), 1);
});

test('T-CLEAN03-05 : aucune collection d’observation ne grandit sans fin', () => {
  const mark = sansProse(tranche('function oprieMark(', 'function oprieFastRuntime'));
  assert.match(mark, /while\(marks\.length>OPRIE_TELEMETRY_MAX\)marks\.shift\(\)/, 'la télémétrie est bornée.');
  assert.match(FRONT_CODE, /const OPRIE_TELEMETRY_MAX=\d+/);
  const applied = sansProse(tranche('function oprieRecordAppliedAction(', '/* ====='));
  assert.match(applied, /while\(oprieState\.appliedActions\.length>ORCHESTRATION_APPLIED_MAX\)oprieState\.appliedActions\.shift\(\)/);
  assert.match(FRONT_CODE, /const ORCHESTRATION_APPLIED_MAX=\d+/);
  /* Et aucune autre collection du frontend ne s'empile sans borne. */
  const empilements = [...FRONT_CODE.matchAll(/([A-Za-z_$][\w$.]*)\.push\(/g)].map((m) => m[1]);
  const bornes = ['marks', 'oprieState.appliedActions', 'state.answers', 'state.docs', 'docs', 'turns',
                  'merged', 'problems', 'signals', 'lignesPrealable', 'actions', 'out', 'parts'];
  const suspects = [...new Set(empilements)].filter((n) => !bornes.includes(n) && n.includes('State'));
  assert.deepEqual(suspects, [], 'aucun état global ne s’empile sans borne.');
});

// =================================================================================================
// §46 — PRODUIT / TEST / BENCH / DEBUG
// =================================================================================================

test('T-CLEAN03-06/09 : aucun drapeau de test dans le produit, et rien qui change la sémantique', () => {
  for (const drapeau of ['__TEST__', '__DEBUG__', '__BENCH__', 'testOnly', 'debugOnly', 'benchOnly',
                         'isTest', 'NODE_ENV', 'process.env', 'window.__test', 'window.__debug']) {
    assert.equal(html.includes(drapeau), false, `${drapeau} n’existe pas dans le produit.`);
  }
  assert.equal(BUNDLE.includes('process.env'), false, 'ni dans le bundle navigateur.');
});

test('T-CLEAN03-07/08 : aucun état de bench ni de debug dans le produit', () => {
  for (const symbole of ['benchApi', 'debugApi', 'testApi', 'window.__bench', '__benchmark',
                         'percentiles(', 'p95', 'sampleCount']) {
    assert.equal(html.includes(symbole), false, `${symbole} reste hors du produit.`);
  }
  /* Le banc d'évaluation vit dans son propre dossier, et n'est jamais embarqué.
     La mesure porte sur le CODE : deux commentaires le NOMMENT — l'un pour dire quel
     consommateur réel justifie de garder le transport, l'autre pour citer un champ de
     schéma. Nommer un banc n'est pas le charger. */
  assert.ok(fs.existsSync(path.join(root, 'evaluation')), 'le banc existe…');
  assert.equal(FRONT_CODE.includes('evaluation/'), false, '…et aucun code du produit ne le charge.');
  assert.equal(FRONT_CODE.includes('run-benchmark'), false);
  assert.doesNotMatch(html, /<script[^>]+src=["'][^"']*evaluation/i, 'ni aucune balise script.');
});

test('T-CLEAN03-10 : le seul journal de worker embarqué est injoignable depuis le navigateur', () => {
  /* MESURÉ : deux console.log vivent dans le bundle — les journaux structurés par
     DÉFAUT de l'orchestrateur OPRIE et de la chaîne de fournisseurs, côté worker.
     Le seul chemin navigateur qui entre dans l'orchestrateur injecte son PROPRE
     journal vide : le défaut n'est donc jamais atteint. C'est une propriété de
     construction, écrite dans le module, pas une chance. */
  assert.equal((BUNDLE.match(/console\.log\(JSON\.stringify\(event\)\)/g) || []).length, 2);
  const manual = fs.readFileSync(path.join(root, 'core/adn/oprie-manual-roundtrip.js'), 'utf8');
  assert.match(manual, /runOperationalRequestTurn\(\s*\{[^}]*\},\s*\{ executeRole, log\(\) \{\} \}\s*\)/s,
    'l’unique entrée navigateur passe un journal vide.');
  /* Et le frontend n'appelle jamais la chaîne de fournisseurs côté worker. */
  for (const worker of ['runProviderChain', 'runOperationalRequestTurn', 'decideWithHaChain']) {
    assert.equal(FRONT_CODE.includes(worker), false, `${worker} n’est pas appelé par le navigateur.`);
  }
});

test('T-CLEAN03-EXPORTS : chaque symbole exposé globalement a une raison produit', () => {
  const exposes = [...new Set([...FRONT_CODE.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]))];
  assert.ok(exposes.length > 10, 'la mesure porte bien sur les exports réels.');
  /* Aucun n'expose l'état interne du tour ni du dialogue. */
  for (const nom of exposes) {
    assert.doesNotMatch(nom, /^(oprieState|adpState|state|etat)$/, `${nom} n’expose pas l’état interne.`);
    assert.doesNotMatch(nom, /debug|bench|test|trace|telemetry/i, `${nom} n’est pas une surface de mise au point.`);
  }
  /* Les quatre handles majuscules sont nommés, et la façade n'expose aucune trace. */
  const handles = exposes.filter((n) => n.startsWith('__'));
  assert.deepEqual(handles.sort(), ['__ADAPTIVE_DECISION_PIPELINE_10G__', '__ARCHITECTE_V10__',
                                    '__QUALITE_V10__', '__V11_ROUTER__']);
  const facade = sansProse(tranche('window.__ADAPTIVE_DECISION_PIPELINE_10G__', 'window.__V11_ROUTER__'));
  assert.doesNotMatch(facade, /telemetry|getAudit|lastTurn|lastOrchestration|executionId/);
});

// =================================================================================================
// §47 — LES JOURNAUX
// =================================================================================================

test('T-CLEAN03-11 : aucun résidu de mise au point dans le frontend', () => {
  for (const bruit of ['console.log', 'console.debug', 'console.info', 'console.trace', 'debugger']) {
    assert.equal(compte(bruit.replace('.', '\\.')), 0, `${bruit} : aucun.`);
  }
});

test('T-CLEAN03-12/13 : les journaux restants sont des échecs attendus, sans secret', () => {
  const appels = [...FRONT_CODE.matchAll(/console\.(warn|error)\(([^;]{0,200})/g)].map((m) => m[2]);
  assert.ok(appels.length >= 15, 'les signaux d’échec attendu existent bien.');
  for (const appel of appels) {
    for (const secret of ['api-cle', 'v11-api-key', 'obtenirCleFournisseur', '.value', 'cle',
                          'state.docs', 'state.answers', 'original_request', 'materiau',
                          'Authorization', 'Bearer', 'x-api-key']) {
      assert.equal(appel.includes(secret), false, `un journal ne doit pas porter ${secret} : ${appel.slice(0, 60)}`);
    }
  }
  /* Et le prompt de l'utilisateur n'est journalisé nulle part. */
  assert.equal(compte('console\\.(?:warn|error)\\([^;]*etat\\.prompt'), 0);
  assert.equal(compte('console\\.(?:warn|error)\\([^;]*v11-demande'), 0);
});

// =================================================================================================
// §48 — LES PREUVES QUE CES TRACES PORTENT, TOUJOURS DEBOUT
// =================================================================================================

test('T-CLEAN03-14 : la preuve de péremption tient toujours', async () => {
  const h = loadPilot({ mode: 'rapide', deep: async () => { await delay(120); return arbiterTurn('operational_request_ready'); } });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  await enVol;
  assert.deepEqual(h.spy.executed, [], 'un tour périmé n’exécute rien…');
  assert.equal(h.pilot.oprieState.lastTurn, null, '…et lastTurn le PROUVE : il n’a même pas été enregistré.');
});

test('T-CLEAN03-15 : la preuve « une seule fois » tient toujours', async () => {
  const h = loadPilot({ mode: 'rapide', deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(h.spy.executed.length, 1);
  for (let i = 0; i < 5; i += 1) h.pilot.oprieApplyTurn(h.pilot.oprieState.lastTurn, 'rapide');
  assert.equal(h.spy.executed.length, 1, 'cinq rejeux, une exécution.');
  const marques = h.pilot.oprieState.telemetry.map((m) => m.event);
  assert.ok(marques.includes('orchestration_replay_suppressed'), 'et la télémétrie le dit.');
});

test('T-CLEAN03-16 : la preuve de bascule de mode tient toujours', async () => {
  const h = loadPilot({ mode: 'architecte', deep: async () => clarificationTurn('Quel public ?') });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER',
    'lastOrchestration PROUVE l’action appliquée — aucun mark ne porte ce champ.');
  assert.equal(h.pilot.oprieState.lastTurn.state, 'clarification_required');
});

test('T-CLEAN03-17 : la preuve de fermeture sur panne fournisseur tient toujours', async () => {
  const h = loadPilot({ mode: 'rapide', deep: async () => { throw new Error('panne'); } });
  await h.pilot.oprieRunTurn('rapide');
  assert.deepEqual(h.spy.executed, [], 'une panne n’exécute rien.');
  assert.equal(h.spy.gate.at(-1).decision.state, 'technical');
  assert.equal(h.pilot.oprieState.executionId, null,
    'executionId PROUVE qu’AUCUN cycle ne s’est ouvert — une absence de mark ne le démontrerait pas.');
});

// =================================================================================================
// §49 — LA DETTE QUE CE LOT NE FERME PAS
// =================================================================================================

test('T-CLEAN03-18/19 : EXEC-PHASE-INSTRUMENT-01 reste ouverte, et rien n’a été injecté dans la plage gelée', () => {
  /* Ce lot n'instrumente RIEN. Les phases internes du moteur Architecte restent
     non observables, et le prétendre autrement serait faux. */
  const debut = html.indexOf('function archContexte(){');
  const fin = html.indexOf('const ARCH_SAUVEGARDE_VERSION=', debut);
  const gelee = html.slice(debut, fin);
  for (const marque of ['oprieMark', 'console.log', 'telemetry', 'performance.now', '__TRACE',
                        'lastReconciliation', 'lastOrchestration']) {
    assert.equal(gelee.includes(marque), false, `aucune instrumentation ${marque} dans la plage gelée.`);
  }
  /* Et le hash gelé Architecte est celui des lots précédents. */
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'anti-regression-baseline.json'), 'utf8'));
  assert.equal(baseline.hashes['moteur Architecte'],
    'bebb29dc9a0b6f70fb23b22cf13e6573688d8e2dbfbfd54356a14bf1522b6d1e');
});

test('T-CLEAN03-BUNDLE : le sous-graphe worker embarqué est mesuré, et non prétendu fermé', () => {
  /* MESURÉ ET DIT : neuf modules du bundle n'ont aucun consommateur frontend DIRECT.
     Ils ne sont pas morts pour autant — le module de round-trip manuel en dépend
     transitivement, et lui est bien utilisé. Les retirer demanderait un élagage de
     build, pas un nettoyage d'observabilité. CLEAN-03 le nomme et ne le ferme pas. */
  const build = fs.readFileSync(path.join(root, 'tools/build-adn-browser-runtime.mjs'), 'utf8');
  assert.match(build, /deps: \['ORCORE','ORORCH','CANON','ARCHENRICH'\]/,
    'le round-trip manuel dépend bien du sous-graphe worker.');
  for (const utilise of ['startManualOprieTurn', 'runOprieTurnWithExecutor',
                         'createProviderRoleExecutor', 'buildArchitecteContractFromTurn']) {
    assert.ok(FRONT_CODE.includes(utilise), `${utilise} est réellement utilisé par le produit.`);
  }
});
