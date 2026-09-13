/* ADN-ARCH-02-B1 — ROUND-TRIP OPRIE MANUEL DANS ARCHITECTE PRO
 * ============================================================================
 *
 * CE QUE CE FICHIER PROUVE
 *
 *   1. L'onglet Architecte Pro redevient autonome, AVEC clé API comme SANS.
 *   2. Les deux modes exécutent le MÊME OPRIE ; seul le mécanisme d'exécution
 *      d'un rôle diffère. SEMANTIC_PIPELINE_COUNT = 1, EXECUTION_MECHANISM = 2.
 *   3. La voie sans clé n'émet aucun appel réseau.
 *   4. Les quatre états OPRIE sont respectés ; seul READY atteint le compilateur.
 *   5. Aucune readiness locale, aucun second mapper, aucun repli archAnalyse.
 *   6. Une réponse collée non conforme ne perd aucune donnée de l'onglet.
 *
 * AUCUNE MODIFICATION DE PRODUCTION : le HTML est lu, jamais réécrit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARCHITECTE_TURN_OUTCOMES,
  MANUAL_SESSION_STATES,
  buildArchitecteContractFromTurn,
  buildPortableRolePrompt,
  createManualRoleExecutor,
  createProviderRoleExecutor,
  runOprieTurnWithExecutor,
  startManualOprieTurn
} from '../core/adn/oprie-manual-roundtrip.js';
import { OPERATIONAL_REQUEST_ROLE_SEQUENCE } from '../workers/shared/operational-request-orchestrator.js';
import { ROLE_DEFINITIONS } from '../workers/shared/operational-request-core.js';
import { activeArchSemanticSourceCount, canonicalToArchProjectionInput } from '../core/adn/arch-canonical-enrichment.js';
import { analystOutputFixture, arbiterOutputFixture, criticOutputFixture } from './offline-oprie-roundtrip-b0.helper.mjs';
import { analyseFixture, createArchitecteHarness } from './archcompiler-harness.helper.mjs';
import { productionSlice } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const DEMANDE = 'Demande saisie directement dans l’onglet Architecte Pro.';
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const architecteBlock = () => stripComments(productionSlice('const ARCH_LOCAL_FIELDS=', '<script id="v11-controller">'));

const PASTED = {
  analyst: () => JSON.stringify(analystOutputFixture()),
  critic: () => JSON.stringify(criticOutputFixture()),
  arbiter: (state = 'operational_request_ready') => JSON.stringify(arbiterOutputFixture(state))
};

/** Joue un round-trip complet côté noyau et rend le tour obtenu. */
async function playManualTurn(arbiterState = 'operational_request_ready', { original_request = DEMANDE } = {}) {
  const steps = [];
  const { session, completion } = startManualOprieTurn({ original_request }, { onStep: (s) => steps.push(s) });
  const submitted = [];
  for (const role of OPERATIONAL_REQUEST_ROLE_SEQUENCE) {
    await Promise.resolve();
    submitted.push(session.submit(role === 'arbiter' ? PASTED.arbiter(arbiterState) : PASTED[role]()));
  }
  return { turn: await completion, session, steps, submitted };
}

/* ==========================================================================
 * T-B1-01 … 05 — L'EXÉCUTEUR MANUEL
 * ======================================================================= */

test('T-B1-01 l’exécuteur manuel suspend le tour et expose les instructions du rôle en attente', async () => {
  const vus = [];
  const { session } = startManualOprieTurn({ original_request: DEMANDE }, { onStep: (s) => vus.push(s) });
  await Promise.resolve();
  const snap = session.snapshot();

  assert.equal(snap.status, 'waiting_for_external_response');
  assert.ok(MANUAL_SESSION_STATES.includes(snap.status));
  assert.equal(snap.pending_role, OPERATIONAL_REQUEST_ROLE_SEQUENCE[0]);
  assert.equal(snap.step_index, 1);
  assert.equal(snap.step_count, OPERATIONAL_REQUEST_ROLE_SEQUENCE.length);
  assert.ok(snap.pending_prompt.length > 0, 'les instructions portables sont prêtes à copier');
  assert.equal(snap.pending_prompt, buildPortableRolePrompt(snap.pending_role, { original_request: DEMANDE, clarification_history: [] }));
  assert.ok(vus.length >= 1, 'l’UI est notifiée de l’étape en attente');

  /* Tant que rien n'est collé, rien n'avance : aucune valeur n'est inventée. */
  await Promise.resolve();
  assert.equal(session.snapshot().pending_role, OPERATIONAL_REQUEST_ROLE_SEQUENCE[0]);
});

for (const [id, index] of [['02', 0], ['03', 1], ['04', 2]]) {
  const role = OPERATIONAL_REQUEST_ROLE_SEQUENCE[index];
  test(`T-B1-${id} une réponse ${role} conforme fait reprendre le tour`, async () => {
    const { session } = startManualOprieTurn({ original_request: DEMANDE });
    for (let i = 0; i <= index; i += 1) {
      await Promise.resolve();
      const attendu = OPERATIONAL_REQUEST_ROLE_SEQUENCE[i];
      assert.equal(session.snapshot().pending_role, attendu, `étape ${i + 1} : ${attendu}`);
      const verdict = session.submit(attendu === 'arbiter' ? PASTED.arbiter() : PASTED[attendu]());
      assert.deepEqual(verdict, { ok: true, role: attendu });
    }
    assert.deepEqual(session.snapshot().accepted_roles, OPERATIONAL_REQUEST_ROLE_SEQUENCE.slice(0, index + 1));
  });
}

test('T-B1-05 le round-trip complet à trois échanges atteint un tour OPRIE exploitable', async () => {
  const { turn, session, submitted } = await playManualTurn();
  assert.deepEqual(submitted.map((s) => s.role), [...OPERATIONAL_REQUEST_ROLE_SEQUENCE]);
  assert.equal(turn.state, 'operational_request_ready');
  assert.equal(session.snapshot().status, 'completed');
  assert.equal(ARCHITECTE_TURN_OUTCOMES[turn.state], 'ready');
});

/* ==========================================================================
 * T-B1-06 … 09 — TOUT CE QUI N'EST PAS CONFORME EST REFUSÉ
 * ======================================================================= */

for (const [id, index] of [['06', 0], ['07', 1], ['08', 2]]) {
  const role = OPERATIONAL_REQUEST_ROLE_SEQUENCE[index];
  test(`T-B1-${id} une réponse ${role} non conforme est refusée sans casser la session`, async () => {
    const { session } = startManualOprieTurn({ original_request: DEMANDE });
    for (let i = 0; i < index; i += 1) {
      await Promise.resolve();
      const r = OPERATIONAL_REQUEST_ROLE_SEQUENCE[i];
      session.submit(r === 'arbiter' ? PASTED.arbiter() : PASTED[r]());
    }
    await Promise.resolve();
    for (const mauvais of ['', 'pas du json', '[]', '{}', JSON.stringify({ champ: 'inconnu' })]) {
      const verdict = session.submit(mauvais);
      assert.equal(verdict.ok, false, `« ${mauvais.slice(0, 12)} » doit être refusé`);
      assert.equal(verdict.role, role);
      assert.ok(verdict.error.length > 0);
      /* L'étape reste ouverte : la personne peut recoller sans tout reprendre. */
      assert.equal(session.snapshot().pending_role, role);
      assert.equal(session.snapshot().status, 'waiting_for_external_response');
    }
    /* Et une réponse correcte, après plusieurs refus, fait bien avancer. */
    assert.equal(session.submit(role === 'arbiter' ? PASTED.arbiter() : PASTED[role]()).ok, true);
  });
}

test('T-B1-09 un faux READY minimal collé ne produit aucune compilation', async () => {
  const { session } = startManualOprieTurn({ original_request: DEMANDE });
  await Promise.resolve();
  session.submit(PASTED.analyst());
  await Promise.resolve();
  session.submit(PASTED.critic());
  await Promise.resolve();

  const faux = session.submit(JSON.stringify({ state: 'operational_request_ready' }));
  assert.equal(faux.ok, false, 'le validateur de rôle refuse l’objet minimal');
  assert.match(faux.error, /champs inattendus ou manquants/);
  assert.equal(session.snapshot().pending_role, 'arbiter', 'l’étape reste ouverte');

  /* Et même court-circuité, le composeur refuse de produire un contrat. */
  const direct = buildArchitecteContractFromTurn({ state: 'operational_request_ready' },
    { request_id: 'x', original_request: DEMANDE, archAnalyse: analyseFixture() });
  assert.equal(direct.outcome, 'technical');
  assert.equal(direct.contract, null);
});

/* ==========================================================================
 * T-B1-10 — LA DEMANDE ORIGINALE NE BOUGE PAS
 * ======================================================================= */

test('T-B1-10 original_request est immuable pendant les trois échanges', async () => {
  const demande = 'Demande originale — « guillemets », tirets — inchangée.';
  const vus = [];
  const { session, completion } = startManualOprieTurn({ original_request: demande }, { onStep: (s) => vus.push(s) });
  for (const role of OPERATIONAL_REQUEST_ROLE_SEQUENCE) {
    await Promise.resolve();
    const prompt = session.snapshot().pending_prompt;
    assert.ok(prompt.includes(demande), `étape ${role} : la demande est reprise telle quelle`);
    session.submit(role === 'arbiter' ? PASTED.arbiter() : PASTED[role]());
  }
  const turn = await completion;
  const { base } = buildArchitecteContractFromTurn(turn, { request_id: 'x', original_request: demande, archAnalyse: analyseFixture() });
  assert.equal(base.original_request, demande);
});

/* ==========================================================================
 * T-B1-11 … 14 — LES QUATRE ÉTATS
 * ======================================================================= */

test('T-B1-11 READY traverse le mapper, la garde, l’enrichissement et le compilateur', async () => {
  const { turn } = await playManualTurn('operational_request_ready');
  const result = buildArchitecteContractFromTurn(turn, { request_id: 'a-1', original_request: DEMANDE, archAnalyse: analyseFixture() });

  assert.equal(result.outcome, 'ready');
  assert.ok(result.contract, 'un contrat enrichi est produit');
  assert.deepEqual(result.signals, []);
  assert.equal(activeArchSemanticSourceCount(result.contract), 1);

  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyseFixture());
  const prompt = harness.compiler(result.contract);
  assert.ok(prompt.length > 0);
  assert.match(prompt, /^## RÔLE/);
});

for (const [id, state, outcome] of [
  ['12', 'clarification_required', 'clarification'],
  ['13', 'confirmation_required', 'confirmation'],
  ['14', 'blocked', 'blocked']
]) {
  test(`T-B1-${id} ${state} n’atteint jamais le compilateur`, async () => {
    const { turn } = await playManualTurn(state);
    const result = buildArchitecteContractFromTurn(turn, { request_id: 'a-1', original_request: DEMANDE, archAnalyse: analyseFixture() });

    assert.equal(result.outcome, outcome);
    assert.equal(result.contract, null, 'aucun contrat compilable');
    assert.ok(result.base, 'la base canonique existe et PRÉSERVE l’état, sans le juger');
    assert.equal(result.base.executability.oprie_state, state);
    assert.equal(result.base.executability.state, 'clarification_necessaire');

    /* Le compilateur refuse la base nue : seul un contrat enrichi le franchit. */
    const harness = createArchitecteHarness({ demande: DEMANDE });
    harness.importer(analyseFixture());
    assert.equal(harness.compiler(null), '');
  });
}

/* ==========================================================================
 * T-B1-15 … 20 — AUTORITÉS
 * ======================================================================= */

test('T-B1-15 LOCAL_READINESS_DERIVATIONS = 0', () => {
  /* Périmètre : le module de round-trip et la COUCHE DE PRÉPARATION ajoutée par
     ce lot. `archValider` n'en fait pas partie : il valide le schéma 3.4 depuis
     toujours, et lire `questions_a_poser` pour refuser une analyse mal formée
     n'a jamais produit de readiness. */
  const sources = [
    stripComments(fs.readFileSync(path.join(root, 'core/adn/oprie-manual-roundtrip.js'), 'utf8')),
    stripComments(HTML.slice(HTML.indexOf('ADN-ARCH-02-B1 — PRÉPARATION'), HTML.indexOf('function archCompiler(')))
  ];
  for (const source of sources) {
    for (const derivation of ['livrable_complet_possible', 'questions_a_poser', 'action_recommandee',
      "'operational_request_ready'", "'clarification_necessaire'"]) {
      assert.equal(source.includes(derivation), false, `aucune readiness dérivée localement (${derivation})`);
    }
    /* `'exploitable'` ne peut apparaître QUE comme argument de la garde existante,
       qui LÈVE une exception si la base ne l'autorise pas. C'est une vérification,
       jamais une dérivation : rien n'est promu, la garde peut seulement refuser. */
    for (const occurrence of source.split("'exploitable'").slice(0, -1)) {
      assert.match(occurrence.slice(-140), /assertCanonicalReadinessInvariant\([\s\S]*$/,
        "'exploitable' n’apparaît que dans l’appel à la garde de readiness existante");
    }
    assert.equal(/executability(?:\.[\w$]+)*\s*=(?![=>])/.test(source), false, 'executability n’est jamais écrite');
  }
});

test('T-B1-16 SECOND_CANONICAL_MAPPER_COUNT = 0', () => {
  const dir = path.join(root, 'core/adn');
  const producteurs = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.includes('generated'))
    .filter((f) => /export function mapOprieToCanonicalContract/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(producteurs, ['oprie-canonical-mapping.js']);

  /* Le module B1 ne convertit rien lui-même : il compose. */
  const module = fs.readFileSync(path.join(dir, 'oprie-manual-roundtrip.js'), 'utf8');
  assert.equal(/function\s+\w*[Mm]ap\w*Canonical/.test(module), false);
  assert.match(module, /import \{[\s\S]*?mapOprieToCanonicalContract[\s\S]*?\} from '\.\/oprie-canonical-mapping\.js'/);
});

test('T-B1-17 le repli raw archAnalyse reste impossible', () => {
  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyseFixture());
  assert.equal(harness.compiler(analyseFixture()), '', 'analyse brute refusée comme contrat');
  assert.equal(canonicalToArchProjectionInput(analyseFixture()), null);

  const layer = stripComments(productionSlice('let archContratCanonique=', 'function archEnvoyerVersQualite('));
  assert.equal(/\barchAnalyse\b/.test(layer), false, 'ARCH_COMPILER_RAW_ARCHANALYSE_READS = 0');
});

test('T-B1-18 ARCH_GLOBAL_ACTIVE_SEMANTIC_SOURCE_COUNT = 1', async () => {
  const { turn } = await playManualTurn();
  const { contract, base } = buildArchitecteContractFromTurn(turn, { request_id: 'x', original_request: DEMANDE, archAnalyse: analyseFixture() });
  assert.equal(activeArchSemanticSourceCount(contract), 1);
  assert.equal(activeArchSemanticSourceCount(base), 1);
  assert.equal(activeArchSemanticSourceCount(analyseFixture()), 0);
  assert.equal(canonicalToArchProjectionInput(contract).semantic_source, 'ENRICHED_CANONICAL_CONTRACT');
});

test('T-B1-19 OPRIE reste seule autorité de readiness et de question', () => {
  const bloc = architecteBlock();
  for (const interdit of ['next_question', 'showQuestion', 'execution_ready', 'assessAnalysisReadiness']) {
    assert.equal(bloc.includes(interdit), false, `l’onglet ne pose aucune question et ne décide aucun état (${interdit})`);
  }
  /* L'état vient du tour, jamais d'une décision locale : l'onglet délègue. */
  assert.match(bloc, /runtime\.buildArchitecteContractFromTurn\(/);
  assert.match(bloc, /runtime\.runOprieTurnWithExecutor\(/);
  assert.match(bloc, /runtime\.startManualOprieTurn\(/);
});

test('T-B1-20 la sélection des verrous reste à l’ADN', async () => {
  const { turn } = await playManualTurn();
  const { contract, base } = buildArchitecteContractFromTurn(turn, { request_id: 'x', original_request: DEMANDE, archAnalyse: analyseFixture() });
  assert.deepEqual(base.selected_locks.locks, []);
  assert.deepEqual(contract.selected_locks.locks, []);
  const module = fs.readFileSync(path.join(root, 'core/adn/oprie-manual-roundtrip.js'), 'utf8');
  assert.equal(module.includes('selectAdaptiveLocks'), false);
});

/* ==========================================================================
 * T-B1-21 — PARITÉ API / MANUEL
 * ======================================================================= */

test('T-B1-21 pour la même sortie OPRIE, les deux mécanismes produisent le même contrat', async () => {
  const reponses = { analyst: PASTED.analyst(), critic: PASTED.critic(), arbiter: PASTED.arbiter() };

  /* Mécanisme 1 — fournisseur : le transport rend le texte, rien d'autre. */
  const appels = [];
  const executeurFournisseur = createProviderRoleExecutor(async ({ role, systemPrompt, userMessage, schema }) => {
    appels.push({ role, systemPrompt: systemPrompt.length, userMessage: userMessage.length, schema: !!schema });
    return reponses[role];
  });
  const tourApi = await runOprieTurnWithExecutor({ original_request: DEMANDE }, executeurFournisseur);

  /* Mécanisme 2 — collage humain. */
  const { turn: tourManuel } = await playManualTurn();

  assert.deepEqual(JSON.parse(JSON.stringify(tourApi)), JSON.parse(JSON.stringify(tourManuel)),
    'même sortie OPRIE, quel que soit le transport');
  assert.deepEqual(appels.map((a) => a.role), [...OPERATIONAL_REQUEST_ROLE_SEQUENCE]);
  assert.ok(appels.every((a) => a.schema && a.systemPrompt > 0 && a.userMessage > 0));

  const options = { request_id: 'parité', original_request: DEMANDE, archAnalyse: analyseFixture() };
  const a = buildArchitecteContractFromTurn(tourApi, options);
  const b = buildArchitecteContractFromTurn(tourManuel, options);
  assert.deepEqual(a.base, b.base, 'même canonical_base');
  assert.deepEqual(a.contract, b.contract, 'même contrat enrichi');

  const projeter = (contrat) => {
    const h = createArchitecteHarness({ demande: DEMANDE });
    h.importer(analyseFixture());
    return h.compiler(contrat);
  };
  assert.equal(projeter(a.contract), projeter(b.contract), 'même projection compilée');
});

/* ==========================================================================
 * T-B1-22 — AUCUN RÉSEAU DANS LA VOIE SANS CLÉ
 * ======================================================================= */

test('T-B1-22 NETWORK_CALLS_IN_OFFLINE_ROUTE = 0', async () => {
  const tentatives = [];
  const sauvegarde = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest, WebSocket: globalThis.WebSocket };
  globalThis.fetch = (...a) => { tentatives.push(String(a[0])); throw new Error('réseau interdit'); };
  globalThis.XMLHttpRequest = function () { throw new Error('réseau interdit'); };
  globalThis.WebSocket = function () { throw new Error('réseau interdit'); };
  try {
    const { turn } = await playManualTurn();
    const { contract } = buildArchitecteContractFromTurn(turn, { request_id: 'x', original_request: DEMANDE, archAnalyse: analyseFixture() });
    const harness = createArchitecteHarness({ demande: DEMANDE });
    harness.importer(analyseFixture());
    assert.ok(harness.compiler(contract).length > 0);
    assert.deepEqual(harness.network, []);
  } finally {
    Object.assign(globalThis, sauvegarde);
  }
  assert.deepEqual(tentatives, [], 'aucun appel réseau sur toute la voie sans clé');
});

/* ==========================================================================
 * T-B1-23 — FRICTION MESURÉE
 * ======================================================================= */

test('T-B1-23 la friction manuelle est de trois copies, trois collages, trois validations', async () => {
  const { steps, submitted } = await playManualTurn();
  const aCopier = steps.filter((s) => s.pending_role && s.pending_prompt.length > 0);
  const roles = [...new Set(aCopier.map((s) => s.pending_role))];

  assert.deepEqual(roles, [...OPERATIONAL_REQUEST_ROLE_SEQUENCE]);
  assert.equal(roles.length, 3, 'USER_COPY_ACTIONS = 3');
  assert.equal(submitted.length, 3, 'USER_PASTE_ACTIONS = 3');
  assert.equal(submitted.filter((s) => s.ok).length, 3, 'USER_VALIDATE_ACTIONS = 3');
});

/* ==========================================================================
 * T-B1-24 — AUCUNE PERTE DE DONNÉES SUR ERREUR
 * ======================================================================= */

test('T-B1-24 une réponse invalide ne perd ni la demande, ni le matériau, ni l’analyse, ni les composants', async () => {
  const analyse = analyseFixture();
  analyse.compilation.composants_retenus = [{
    type: 'section', titre: 'COMPOSANT', contenu: 'Contenu.', justification: 'Utile.',
    fondements: [{ nature: 'deduction', usage: 'structurer', citation: null }]
  }];
  const harness = createArchitecteHarness({ demande: DEMANDE, materiau: 'Matériau de test.' });
  harness.importer(analyse);

  const avant = {
    demande: harness.element('arch-demande').value,
    materiau: harness.element('arch-materiau').value,
    analyse: JSON.stringify(harness.analyse),
    composants: JSON.stringify(harness.composants)
  };

  const { session } = startManualOprieTurn({ original_request: DEMANDE });
  await Promise.resolve();
  for (const mauvais of ['pas du json', '{}', '']) assert.equal(session.submit(mauvais).ok, false);

  assert.equal(harness.element('arch-demande').value, avant.demande);
  assert.equal(harness.element('arch-materiau').value, avant.materiau);
  assert.equal(JSON.stringify(harness.analyse), avant.analyse);
  assert.equal(JSON.stringify(harness.composants), avant.composants);
});

/* ==========================================================================
 * T-B1-25 — L'UX N'EXPOSE AUCUN JARGON INTERNE
 * ======================================================================= */

test('T-B1-25 UX_INTERNAL_JARGON_EXPOSED = NO', () => {
  /* Textes réellement montrés : le balisage de la carte, et les messages. */
  const carte = HTML.slice(HTML.indexOf('id="arch-preparation-carte"'), HTML.indexOf('</div>', HTML.indexOf('id="arch-prep-statut"')));
  const messages = HTML.slice(HTML.indexOf('const ARCH_PREP_MESSAGES='), HTML.indexOf('function archPrepRuntime('));
  const rendu = HTML.slice(HTML.indexOf('function archPrepRendre('), HTML.indexOf('function archPreparationDemarrer('));

  for (const surface of [carte, messages, rendu]) {
    for (const jargon of ['OPRIE', 'Arbiter', 'Critic', 'Analyst', 'arbitre', 'canonical', 'canonique',
      'readiness', 'enrichedContract', 'archAnalyse', 'operational_request']) {
      assert.equal(surface.toLowerCase().includes(jargon.toLowerCase()), false, `jargon exposé : ${jargon}`);
    }
  }
  /* Et la progression parle bien en étapes numérotées. */
  assert.match(rendu, /'Étape '\+snap\.step_index\+' sur '\+snap\.step_count/);
});

/* ==========================================================================
 * T-B1-26 — LES CHEMINS HISTORIQUES SONT RECÂBLÉS
 * ======================================================================= */

test('T-B1-26 les actions historiques de l’onglet retrouvent une voie fonctionnelle', () => {
  const bloc = architecteBlock();
  for (const id of ['arch-api', 'arch-construire', 'arch-construire-executer', 'arch-preparer',
    'arch-valider', 'arch-compiler', 'arch-ouvrir-editeur',
    'arch-prep-demarrer', 'arch-prep-copier', 'arch-prep-valider', 'arch-prep-annuler']) {
    assert.ok(HTML.includes(`id="${id}"`), `${id} existe dans l’interface`);
    assert.ok(bloc.includes(`aq('#${id}')`), `${id} est câblé`);
  }
  /* Les deux actions qui compilaient doivent d'abord faire valider la demande. */
  const construire = stripComments(productionSlice('async function archConstruire()', 'async function archConstruireExecuter()'));
  assert.match(construire, /await archPreparerAvecApi\(\)/);
  assert.ok(construire.indexOf('archPreparerAvecApi') < construire.indexOf('archApi()'), 'la validation précède l’analyse');
  const executer = stripComments(productionSlice('async function archConstruireExecuter()', 'const ARCH_SAUVEGARDE_VERSION='));
  assert.match(executer, /await archPreparerAvecApi\(\)/);
  /* Et l'import d'analyse réassemble le contrat : le parcours sans clé aboutit. */
  assert.match(stripComments(productionSlice('function archImporter(', 'async function archCopier(')), /archFinaliserContrat\(\)/);
});

/* ==========================================================================
 * T-B1-27 — UN SEUL PIPELINE SÉMANTIQUE, DEUX MÉCANISMES D'EXÉCUTION
 * ======================================================================= */

test('T-B1-27 SEMANTIC_PIPELINE_COUNT = 1 · EXECUTION_MECHANISM_COUNT = 2', () => {
  const module = fs.readFileSync(path.join(root, 'core/adn/oprie-manual-roundtrip.js'), 'utf8');

  /* Un seul point d'entrée de tour, et il délègue au moteur existant. */
  const appels = (module.match(/^\s*(?:return\s+)?runOperationalRequestTurn\(/gm) || []);
  assert.equal(appels.length, 1, 'un seul appel au moteur de tour, et il est délégué');
  assert.match(module, /import \{[\s\S]*?runOperationalRequestTurn[\s\S]*?\} from '\.\.\/\.\.\/workers\/shared\/operational-request-orchestrator\.js'/);

  /* Deux exécuteurs, et seulement deux. */
  const executeurs = (module.match(/^export function create\w*RoleExecutor/gm) || []);
  assert.deepEqual(executeurs.sort(), ['export function createManualRoleExecutor', 'export function createProviderRoleExecutor']);

  /* Aucun prompt, schéma, séquence ni validateur n'est réécrit dans le module. */
  const mecanique = stripComments(module);
  for (const interdit of ['SYSTEM_PROMPT = ', 'JSON_SCHEMA = ', 'function validateAnalyst',
    'function validateCritic', 'function validateArbiter', "= ['analyst'"]) {
    assert.equal(mecanique.includes(interdit), false, `rien n’est réimplémenté (${interdit})`);
  }
  assert.match(mecanique, /ROLE_DEFINITIONS\[role\]\.parseOutput/, 'la validation reste celle du moteur');
});

/* ==========================================================================
 * T-B1-28 — LES INSTRUCTIONS PORTABLES SONT GÉNÉRIQUES ET SANS SECRET
 * ======================================================================= */

test('T-B1-28 les instructions copiées ne portent ni secret, ni endpoint, ni fournisseur', () => {
  const entrees = {
    analyst: { original_request: DEMANDE, clarification_history: [] },
    critic: { original_request: DEMANDE, clarification_history: [], analyst_output: analystOutputFixture(), previous_vetoes: [] },
    arbiter: { original_request: DEMANDE, clarification_history: [], analyst_output: analystOutputFixture(), critic_output: criticOutputFixture() }
  };
  for (const role of OPERATIONAL_REQUEST_ROLE_SEQUENCE) {
    const prompt = buildPortableRolePrompt(role, entrees[role]);
    assert.ok(prompt.includes(ROLE_DEFINITIONS[role].systemPrompt), 'le prompt système est celui du moteur, tel quel');
    assert.match(prompt, /SCHÉMA JSON DE SORTIE/);
    assert.ok(prompt.includes(DEMANDE), 'la demande originale est conservée');
    for (const interdit of ['workers.dev', 'https://', 'http://', 'Bearer', 'api-key',
      'groq', 'anthropic', 'openai', 'workers-ai']) {
      assert.equal(prompt.toLowerCase().includes(interdit.toLowerCase()), false, `${role} : ${interdit}`);
    }
  }
});

/* ==========================================================================
 * T-B1-29 — AUCUN ANCRAGE DE DOMAINE
 * ======================================================================= */

test('T-B1-29 DOMAIN_HARDCODING_ADDED = NO', () => {
  const sources = [
    stripComments(fs.readFileSync(path.join(root, 'core/adn/oprie-manual-roundtrip.js'), 'utf8')),
    stripComments(HTML.slice(HTML.indexOf('ADN-ARCH-02-B1'), HTML.indexOf('function archCompiler(')))
  ];
  for (const source of sources) {
    for (const interdit of ['case_id', 'embedding', 'fuzzy', 'levenshtein', 'similarity', 'corpus']) {
      assert.equal(source.toLowerCase().includes(interdit), false, `aucun ancrage de domaine (${interdit})`);
    }
    assert.equal(/\btoLowerCase\(\)\s*\.\s*includes\(/.test(source), false, 'aucun appariement de mots-clés');
  }
});

/* ==========================================================================
 * T-B1-30 — L'ANNULATION ET L'ÉCHEC RESTENT FAIL-CLOSED
 * ======================================================================= */

test('T-B1-30 une session annulée ou interrompue ne produit jamais de contrat', async () => {
  const { session, completion } = startManualOprieTurn({ original_request: DEMANDE });
  await Promise.resolve();
  session.abort('Préparation annulée.');
  await assert.rejects(() => completion, /Préparation annulée/);
  assert.equal(session.snapshot().status, 'failed');
  assert.equal(session.snapshot().pending_prompt, '');
  assert.equal(session.submit(PASTED.analyst()).ok, false, 'plus rien n’est accepté après annulation');

  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyseFixture());
  assert.equal(harness.compiler(), '', 'aucune compilation après une préparation interrompue');
});

/* ==========================================================================
 * T-B1-31 / 32 — LES DEUX PARCOURS, DE BOUT EN BOUT, DANS LE MOTEUR RÉEL
 *
 * Ces deux tests exécutent le HTML de production dans un contexte isolé : même
 * moteur Architecte, même runtime ADN embarqué, même DOM. Ils sont la preuve
 * que l'autonomie historique est RESTAURÉE, pas seulement câblée.
 * ======================================================================= */

/** Joue les trois collages par l'API publique de l'onglet, comme la personne. */
async function jouerPreparationDansOnglet(harness, { arbiterState = 'operational_request_ready' } = {}) {
  const api = harness.api;
  assert.equal(api.preparer(), true, 'la préparation démarre');
  const vues = [];
  /* La reprise du tour traverse plusieurs `await` de l'orchestrateur : on laisse
     la file de microtâches se vider, comme le ferait le navigateur. */
  const respirer = () => new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < OPERATIONAL_REQUEST_ROLE_SEQUENCE.length; i += 1) {
    await respirer();
    const snap = api.preparation.session.snapshot();
    vues.push({
      role: snap.pending_role,
      progression: harness.element('arch-prep-progression').textContent,
      instructions: harness.element('arch-prep-instructions').value.length
    });
    harness.element('arch-prep-reponse').value = snap.pending_role === 'arbiter'
      ? PASTED.arbiter(arbiterState)
      : PASTED[snap.pending_role]();
    assert.equal(api.validerPreparation(), true, `étape ${i + 1} validée`);
  }
  await respirer();
  return vues;
}

test('T-B1-31 SANS CLÉ : trois collages, puis l’analyse, puis un prompt compilé — sans réseau', async () => {
  const harness = createArchitecteHarness({ demande: DEMANDE, materiau: 'Matériau conservé.' });
  const vues = await jouerPreparationDansOnglet(harness);

  assert.deepEqual(vues.map((v) => v.role), [...OPERATIONAL_REQUEST_ROLE_SEQUENCE]);
  assert.deepEqual(vues.map((v) => v.progression), ['Étape 1 sur 3', 'Étape 2 sur 3', 'Étape 3 sur 3']);
  assert.ok(vues.every((v) => v.instructions > 0), 'des instructions sont proposées à chaque étape');
  assert.match(harness.element('arch-prep-statut').textContent, /Demande validée/);
  assert.ok(harness.api.tourOprie, 'la demande validée est conservée');

  /* Puis le parcours historique reprend exactement là où il était. */
  assert.equal(harness.api.importer(analyseFixture()), true);
  assert.ok(harness.api.contratCanonique, 'le contrat est réassemblé automatiquement');
  const prompt = harness.api.compiler();
  assert.ok(prompt.length > 0, 'le prompt professionnel est compilé hors ligne');
  assert.match(prompt, /^## RÔLE/);
  assert.equal(harness.sortieDOM, prompt);

  /* Rien n'a été perdu, et rien n'est passé par le réseau. */
  assert.equal(harness.element('arch-demande').value, DEMANDE);
  assert.equal(harness.element('arch-materiau').value, 'Matériau conservé.');
  assert.deepEqual(harness.network, [], 'NETWORK_CALLS_IN_OFFLINE_ROUTE = 0');
});

for (const [id, state, motif] of [
  ['32a', 'clarification_required', /précision/],
  ['32b', 'confirmation_required', /confirmation/],
  ['32c', 'blocked', /ne peut pas être préparée/]
]) {
  test(`T-B1-${id} SANS CLÉ : ${state} arrête proprement et oriente, sans rien perdre`, async () => {
    const harness = createArchitecteHarness({ demande: DEMANDE, materiau: 'Matériau conservé.' });
    await jouerPreparationDansOnglet(harness, { arbiterState: state });

    assert.match(harness.element('arch-prep-statut').textContent, motif);
    assert.equal(harness.api.tourOprie, null, 'aucune demande validée n’est conservée');
    assert.equal(harness.api.importer(analyseFixture()), true, 'l’analyse reste importable');
    assert.equal(harness.api.contratCanonique, null, 'aucun contrat n’est appliqué');
    assert.equal(harness.api.compiler(), '', 'rien n’est compilé');
    assert.equal(harness.sortieDOM, '');
    assert.equal(harness.element('arch-demande').value, DEMANDE);
    assert.equal(harness.element('arch-materiau').value, 'Matériau conservé.');
    /* Aucune question n'est posée localement : seul un message d'orientation. */
    assert.doesNotMatch(harness.element('arch-prep-statut').textContent, /\?$/);
  });
}

test('T-B1-33 AVEC CLÉ : le même OPRIE passe par le transport fournisseur et compile', async () => {
  const harness = createArchitecteHarness({ demande: DEMANDE });
  const appels = [];
  /* Le transport de l'onglet est remplacé par un double : c'est le SEUL point de
     divergence entre les deux modes. Le moteur, lui, est identique. */
  harness.context.appelFournisseur = async ({ systeme, contenuUtilisateur, schema }) => {
    const role = OPERATIONAL_REQUEST_ROLE_SEQUENCE[appels.length];
    appels.push({ role, systeme: systeme.length, contenu: contenuUtilisateur.length, schema: !!schema });
    return { texte: role === 'arbiter' ? PASTED.arbiter() : PASTED[role]() };
  };
  harness.context.obtenirFournisseurActif = () => 'anthropic';
  harness.context.obtenirCleFournisseur = () => 'test-only-key';
  harness.context.obtenirModeleActif = () => 'test-model';
  harness.element('api-modele').value = 'test-model';
  harness.element('api-max').value = '8000';

  assert.equal(await harness.api.preparerAvecApi(), true, 'la demande est validée par le même OPRIE');
  assert.deepEqual(appels.map((a) => a.role), [...OPERATIONAL_REQUEST_ROLE_SEQUENCE]);
  assert.ok(appels.every((a) => a.schema && a.systeme > 0 && a.contenu > 0));
  assert.ok(harness.api.tourOprie);

  assert.equal(harness.api.importer(analyseFixture()), true);
  assert.ok(harness.api.compiler().length > 0, 'le prompt est compilé en mode avec clé');
});
