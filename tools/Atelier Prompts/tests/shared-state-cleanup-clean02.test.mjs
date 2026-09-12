/* CLEAN-02 — LES ÉTATS SANS LECTEUR, ET LES RÉFÉRENCES SANS CIBLE.
 * ============================================================================
 *
 * CLEAN-01 avait retiré une machinerie entière. Ce lot s'attaque à ce qui
 * reste : des champs qu'on écrit sans jamais les lire, et des références DOM
 * qui ne désignent rien.
 *
 * Les deux défauts se ressemblent : ils ne cassent rien AUJOURD'HUI. Un champ
 * jamais lu ne ment pas encore ; une référence sans cible ne fait rien de
 * visible. Mais le premier sera lu un jour — et il mentira depuis longtemps —
 * et la seconde donne à lire un code qui promet un effet qu'il n'a pas.
 *
 * CE QUI RESTE ÉCRIT SANS ÊTRE LU, ET POURQUOI C'EST ASSUMÉ. Quatre champs
 * d'oprieState — lastTurn, lastReconciliation, lastOrchestration, executionId —
 * ne sont lus par aucun code du produit. Ce sont la TRACE D'OBSERVATION du
 * tour : ce que les suites lisent pour prouver qu'un tour périmé n'a rien
 * appliqué, qu'une réconciliation a eu lieu, qu'un cycle s'est ouvert une seule
 * fois. Les retirer supprimerait la preuve, pas le bruit. Ils sont nommés ici,
 * et cette liste est fermée : un cinquième champ muet fera échouer ce test.
 *
 * CE QUI RESTE PARTAGÉ, ET POURQUOI ON N'Y TOUCHE PAS. `etat.prompt` est la
 * case « prompt courant » de l'ESPACE AVANCÉ, écrite par ses trois vues et lue
 * par seize endroits — copie, export, éditeur, versions, banc, comptage. Ce
 * n'est pas la frontière des trois modes : le tour gouverné ne la lit jamais.
 * La localiser reviendrait à casser des actions que des gens utilisent.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPilot, arbiterTurn, delay, html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tranche = (debut, fin) => { const a = html.indexOf(debut); return html.slice(a, html.indexOf(fin, a + debut.length)); };
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);

const ecritures = (nom, src = FRONT_CODE) =>
  [...src.matchAll(new RegExp(`(?<![=!<>])\\b${nom.replace(/\./g, '\\.')}\\s*=(?![=>])`, 'g'))].length;
const occurrences = (nom, src = FRONT_CODE) =>
  [...src.matchAll(new RegExp(`\\b${nom.replace(/\./g, '\\.')}\\b`, 'g'))].length;
const lectures = (nom, src = FRONT_CODE) => occurrences(nom, src) - ecritures(nom, src);

/** Les champs des quatre porteurs d'état du frontend, tels qu'ils existent. */
const ETATS = Object.freeze({
  adpState: ['pendingQuestion', 'clarifications', 'lastEnvelope', 'requestedMode', 'returnFocus'],
  oprieState: ['seq', 'controller', 'running', 'lastTurn', 'canonicalContract', 'requestedMode',
               'fastController', 'fastInteraction', 'lastReconciliation', 'lastOrchestration',
               'concludedTurn', 'appliedActions', 'lifecycle', 'executionId', 'telemetry'],
  state: ['docs', 'answers', 'exchangeId', 'requestName', 'responseName'],
  etat: ['prompt', 'demande', 'contrat', 'mesures', 'sourceManquante']
});

/** La trace d'observation du tour : écrite pour être lue par les preuves, pas par le produit. */
const TRACE_OBSERVATION = Object.freeze([
  'oprieState.lastTurn', 'oprieState.lastReconciliation',
  'oprieState.lastOrchestration', 'oprieState.executionId'
]);

// =================================================================================================
// §40 — LES ÉTATS PARTAGÉS
// =================================================================================================

test('T-CLEAN02-01 : aucun état partagé écrit sans lecteur, hors trace d’observation nommée', () => {
  const muets = [];
  for (const [porteur, champs] of Object.entries(ETATS)) {
    for (const champ of champs) {
      const nom = `${porteur}.${champ}`;
      if (ecritures(nom) > 0 && lectures(nom) === 0) muets.push(nom);
    }
  }
  assert.deepEqual(muets.sort(), [...TRACE_OBSERVATION].sort(),
    'la seule écriture sans lecture est la trace d’observation, et elle est nommée.');
  /* Et cette trace est bien lue — par les preuves, ce qui est sa raison d’être. */
  const suites = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.mjs'))
    .map((f) => fs.readFileSync(path.join(root, 'tests', f), 'utf8')).join('\n');
  for (const nom of TRACE_OBSERVATION) {
    const champ = nom.split('.')[1];
    assert.ok(suites.includes(champ), `${nom} est lu par au moins une preuve.`);
  }
});

test('T-CLEAN02-02 : lastProjection est retirée — six écritures, zéro lecture', () => {
  assert.equal(FRONT_CODE.includes('lastProjection'), false, 'le champ n’existe plus dans le code.');
  assert.equal(BUNDLE.includes('lastProjection'), false, 'ni dans le bundle navigateur.');
  /* Il n'en reste que la NOTE qui explique son retrait — une explication n'est pas un champ. */
  assert.equal((html.match(/lastProjection/g) || []).length, 1);
  /* La projection Atelier partait avec elle : elle n’alimentait que ce champ. */
  assert.equal(FRONT_CODE.includes('projectToAtelier'), false);
  /* Les projections encore calculées le sont pour un usage IMMÉDIAT et local. */
  const rapide = sansProse(tranche('function adpRunRapide(', 'async function v11StartRapide'));
  assert.match(rapide, /const projection=adnRuntime\(\)\.projectToRapide\(/);
  assert.match(rapide, /adnMergeLegacyLocks\(r\.actifs,projection\)/, 'elle sert sur place, puis disparaît.');
});

test('T-CLEAN02-03 : chaque état partagé restant a un propriétaire lisible', () => {
  /* Un porteur = un propriétaire. Aucun champ n’est écrit depuis deux porteurs. */
  assert.match(FRONT_CODE, /const adpState=\{/, 'adpState : le dialogue et l’enveloppe partagée.');
  assert.match(FRONT_CODE, /const oprieState=\{/, 'oprieState : le tour gouverné.');
  assert.equal((FRONT_CODE.match(/const adpState=\{/g) || []).length, 1);
  assert.equal((FRONT_CODE.match(/const oprieState=\{/g) || []).length, 1);
  /* adpState ne porte plus que des champs lus. */
  const decl = tranche('const adpState={', '};');
  for (const champ of ETATS.adpState) assert.ok(decl.includes(champ + ':'), `${champ} est déclaré.`);
  for (const parti of ['lastProjection', 'lastAction', 'audit', 'last:', 'running']) {
    assert.equal(decl.includes(parti), false, `${parti} est retiré de adpState.`);
  }
});

test('T-CLEAN02-04 : aucun état fantôme lu comme repli sans jamais être écrit', () => {
  const fantomes = [];
  for (const [porteur, champs] of Object.entries(ETATS)) {
    for (const champ of champs) {
      const nom = `${porteur}.${champ}`;
      /* Un champ jamais écrit ET lu est soit initialisé dans le littéral, soit un fantôme. */
      if (ecritures(nom) === 0 && lectures(nom) > 0) {
        const decl = tranche(`const ${porteur}={`, '};');
        if (!decl.includes(champ + ':')) fantomes.push(nom);
      }
    }
  }
  assert.deepEqual(fantomes, [], 'tout champ lu est initialisé quelque part.');
});

test('T-CLEAN02-05 : le contrat canonique et l’historique sont inchangés', () => {
  assert.equal([...FRONT_CODE.matchAll(/oprieState\.canonicalContract\s*=/g)].length, 1);
  assert.match(sansProse(tranche('function oprieEnterExecution(', 'function oprieDecideOrchestration')),
    /const canonical=oprieBuildCanonicalContract\(turn\);\s*oprieState\.canonicalContract=canonical/);
  assert.equal((FRONT_CODE.match(/function oprieOriginalRequest\(\)/g) || []).length, 1);
  assert.equal((FRONT_CODE.match(/function oprieClarificationHistory\(\)/g) || []).length, 1);
  assert.equal(ecritures('state.docs'), 1, 'les documents : une seule remise à zéro.');
  assert.equal(ecritures('state.answers'), 1, 'l’historique de clarification : idem.');
});

// =================================================================================================
// §41 — LES RÉFÉRENCES D'INTERFACE
// =================================================================================================

test('T-CLEAN02-06/07 : aucune référence DOM sans cible, aucun appel d’interface sans effet', () => {
  const nommes = new Set([...FRONT_CODE.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)].map((m) => m[1]));
  assert.ok(nommes.size > 60, 'la mesure porte bien sur tout le frontend.');
  const orphelins = [...nommes].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(orphelins, [], 'chaque identifiant nommé désigne un élément réel.');
});

test('T-CLEAN02-08 : le carrousel de présentation est retiré, faute d’élément', () => {
  /* MESURÉ : ni panneau, ni grille, ni étape, ni texte — le carrousel n'avait AUCUN
     élément dans le document. Son gestionnaire parcourait une liste toujours vide et
     écrivait dans un identifiant qui n'a jamais existé. Le réparer aurait voulu dire
     créer une interface ; CLEAN-02 ne change aucun comportement, donc il l'a retiré. */
  for (const classe of ['ui-process-panel', 'ui-process-grid', 'ui-process-step',
                        'ui-process-thumb', 'ui-process-text']) {
    assert.equal(html.includes(classe), false, `${classe} : ni markup, ni style, ni script.`);
  }
  assert.equal(html.includes('processText'), false, 'et son texte part avec lui.');
  /* Les icônes qui PARTAGEAIENT sa règle de style, elles, existent et sont conservées. */
  for (const classe of ['ui-mini-icon', 'ui-stage-icon', 'ui-return-icon']) {
    assert.ok(html.includes(`class="${classe}`) || html.includes(` ${classe}`), `${classe} existe encore.`);
    assert.match(html, new RegExp(`#v11-shell [^{]*\\.${classe}`), `${classe} garde son style.`);
  }
});

test('T-CLEAN02-09/10 : chaque écouteur porte sur un élément réel', () => {
  /* Les écouteurs attachés par identifiant : la cible doit exister. */
  const cibles = [...FRONT_CODE.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)(?:\?)?\.addEventListener/g)].map((m) => m[1]);
  assert.ok(cibles.length > 20, 'la mesure porte bien sur les écouteurs réels.');
  const morts = [...new Set(cibles)].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(morts, [], 'aucun écouteur sur un élément inexistant.');
  /* Et les écouteurs attachés par classe visent des classes qui existent. */
  const classes = [...new Set([...FRONT_CODE.matchAll(/\$\$\('\.([a-zA-Z0-9_-]+)'\)/g)].map((m) => m[1]))];
  const classesMortes = classes.filter((c) => !html.includes(`class="${c}`) && !html.includes(` ${c}"`) && !html.includes(` ${c} `));
  assert.deepEqual(classesMortes, [], 'aucun parcours de classe toujours vide.');
});

// =================================================================================================
// §42 — LES ORPHELINS
// =================================================================================================

test('T-CLEAN02-11 : aucune fonction déclarée sans appelant, hors bornes de plage gelée', () => {
  const noms = new Set([...FRONT_CODE.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  const orphelines = [...noms].filter((n) => occurrences(n) <= 1);
  /* copierRapide est la BORNE DE FIN de la plage gelée « moteur Rapide » : la retirer
     changerait le périmètre haché, donc le hash gelé. C'est la seule exception, et elle
     est structurelle, pas discrétionnaire. */
  assert.deepEqual(orphelines.filter((n) => !['$', '$$'].includes(n)), ['copierRapide']);
  const garde = fs.readFileSync(path.join(root, 'tools/frozen-guard.mjs'), 'utf8');
  assert.match(garde, /'async function copierRapide\(\)'/, 'la borne gelée la nomme bien.');
});

test('T-CLEAN02-12 : les constantes de premier niveau ont toutes un lecteur', () => {
  const noms = new Set([...FRONT_CODE.matchAll(/(?:^|\n)const ([A-Z][A-Z0-9_]{2,})\s*=/g)].map((m) => m[1]));
  const orphelines = [...noms].filter((n) => occurrences(n) <= 1);
  assert.deepEqual(orphelines, [], 'aucune constante déclarée sans usage.');
});

test('T-CLEAN02-13/14 : rien de retiré par CLEAN-01 n’est revenu', () => {
  for (const disparu of ['nextConversationAction', 'conversationQuestionsSimilar', 'adpDecideRapide',
                         'adpResumeAfterClarification', 'ui-hidden-bridge', 'v11-go-rapide',
                         'v11-go-avance', 'v11-prepare', 'v11-go-architecte',
                         'source: "local-prudent"']) {
    assert.equal(html.includes(disparu), false, `${disparu} n’est pas revenu.`);
    assert.equal(BUNDLE.includes(disparu), false, `${disparu} n’est pas revenu dans le bundle.`);
  }
});

// =================================================================================================
// §43 — LE PROMPT COURANT DE L'ESPACE AVANCÉ
// =================================================================================================

test('T-CLEAN02-15 : Atelier garde son prompt et toutes ses sorties', () => {
  const generer = sansProse(tranche('function generer(){', 'function afficherDiagnostic('));
  assert.match(generer, /etat\.prompt = prompt/, 'Atelier pose le prompt courant…');
  assert.match(generer, /\$\('#sortie'\)\.textContent = prompt/, '…et le rend.');
  const sorties = sansProse(tranche("$('#btn-export-txt').addEventListener", '/* Éditeur */'));
  for (const action of ["telecharger('prompt-' + Date.now() + '.txt', etat.prompt)",
                        "copier(etat.prompt, 'Prompt')",
                        "enregistrerVersion(etat.prompt, 'Génération')"]) {
    assert.ok(sorties.includes(action), `sortie conservée : ${action}`);
  }
  assert.match(sorties, /\$\('#editeur'\)\.value = etat\.prompt/, 'et le passage à l’éditeur aussi.');
});

test('T-CLEAN02-16/17 : les prompts Rapide et Architecte sont inchangés', () => {
  const rapide = sansProse(tranche('function adpRunRapide(', 'async function v11StartRapide'));
  assert.match(rapide, /rapideDernierePublication=r\.canonical\?\{prompt:r\.prompt,contract:r\.canonical\.contract\}:null/,
    'Rapide garde le couple {prompt rendu, contrat}.');
  assert.match(rapide, /out\.textContent=r\.prompt/);
  const api = sansProse(tranche('async function beginApiAnalysis()', 'function compositeDemand'));
  assert.match(api, /\$\('#v11-final'\)\.value=adnAppendFinalExecutionDirective\(prompt\);show\('#v11-ready'/,
    'Architecte garde son prompt final.');
});

test('T-CLEAN02-18/19 : le prompt courant appartient à l’espace avancé, et n’entre dans aucun tour', () => {
  /* Six écritures, seize lectures : ce n'est pas un état mort, c'est un état PARTAGÉ,
     et son propriétaire est l'espace avancé — pas un mode. La preuve qu'il ne franchit
     pas la frontière : le tour gouverné ne lit que la demande et l'historique. */
  assert.equal(ecritures('etat.prompt'), 6);
  assert.ok(lectures('etat.prompt') > 10, 'il est réellement lu, partout dans l’espace avancé.');
  const tour = sansProse(tranche('function oprieBuildBody()', 'function oprieSetBusy'));
  assert.doesNotMatch(tour, /etat\.prompt|lastEnvelope/, 'le tour n’en sait rien.');
  const enveloppe = sansProse(tranche('function makeEnvelope(){', 'function blobDownload('));
  assert.doesNotMatch(enveloppe, /etat\.prompt/, 'la requête envoyée à l’IA non plus.');
  /* Et aucun second champ global ne duplique la même information. */
  for (const doublon of ['currentPrompt', 'promptCourant', 'lastPrompt', 'globalPrompt']) {
    assert.equal(FRONT_CODE.includes(doublon), false, `${doublon} n’existe pas.`);
  }
});

// =================================================================================================
// §30 — CE QUE LE NETTOYAGE NE DEVAIT PAS TOUCHER
// =================================================================================================

test('T-CLEAN02-GARDES : les gardes de péremption MODE-05 sont intacts', async () => {
  const sonde = {};
  const h = loadPilot({ mode: 'rapide', deep: async (body, { signal }) => { sonde.signal = signal; await delay(120); return arbiterTurn('operational_request_ready'); } });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  await enVol;
  assert.deepEqual(h.spy.executed, [], 'un tour périmé n’exécute toujours rien.');
  /* Et les trois gardes écrits restent en place, mot pour mot. */
  assert.match(FRONT_CODE, /if\(!v11ModeUsesGovernedPipeline\(mode\)\)v11AbandonGovernedTurn\(\)/);
  assert.match(FRONT_CODE, /const contexteDemandeurPerdu=\(\)=>tourDemandeur!==oprieState\.seq/);
  const arch = sansProse(tranche('function adpEnterArchitecte(', 'function adpRunRapide('));
  assert.ok(arch.indexOf('adpState.lastEnvelope=null') < arch.indexOf('try{'));
});

test('T-CLEAN02-BUILD : un bloc runtime, build reproductible, aucune dépendance ajoutée', () => {
  assert.equal((html.match(/\/\* GENERATED — LOT 10G\.3B\.3F\.[12]/g) || []).length, 1);
  const embarque = tranche('/* GENERATED — LOT 10G.3B.3F', '})(window);') + '})(window);\n';
  assert.equal(embarque.trim(), BUNDLE.trim(), 'HTML et runtime généré ne divergent pas.');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), []);
  assert.deepEqual(Object.keys(pkg.devDependencies || {}), ['wrangler']);
});
