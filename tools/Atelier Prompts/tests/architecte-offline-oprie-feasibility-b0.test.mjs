/* ADN-ARCH-02-B0 — FAISABILITÉ D'UNE VOIE AUTONOME ET HORS LIGNE POUR ARCHITECTE PRO
 * ============================================================================
 *
 * ÉTUDE, PAS IMPLÉMENTATION. Aucun code de production n'est modifié ni branché :
 * ces tests démontrent qu'une voie conforme EXISTE, en n'utilisant que des
 * primitives déjà présentes dans le dépôt.
 *
 * CE QUI EST DÉMONTRÉ
 *
 *   1. L'orchestrateur OPRIE est DÉJÀ agnostique du transport : il reçoit son
 *      `executeRole` en paramètre. Un exécuteur « collé par la personne » s'y
 *      branche sans modifier une ligne — donc sans second OPRIE.
 *   2. Les trois rôles gardent leur séquence, leurs prompts, leurs schémas et
 *      leurs validateurs serveur. Un Critique collé ne peut pas court-circuiter
 *      l'Analyste : c'est l'orchestrateur qui construit l'entrée de chaque rôle.
 *   3. Le contrat canonique est produit par le mapper EXISTANT, et validé par le
 *      validateur EXISTANT. Aucun second mapper.
 *   4. Un artefact fabriqué — jusqu'au fameux {"state":"operational_request_ready"}
 *      — est refusé à trois niveaux successifs.
 *   5. Le repli raw archAnalyse reste impossible.
 *   6. Toute la chaîne s'exécute sans le moindre accès réseau.
 *
 * CE QUI N'EST PAS DÉMONTRÉ, ET RESTE UNE DÉCISION PRODUIT
 *
 *   L'AUTHENTICITÉ. La validation est STRUCTURELLE, jamais cryptographique :
 *   l'architecture ne possède aucune signature, et B0 n'en invente pas. Le
 *   modèle de confiance est exactement celui de la route Architecte historique,
 *   où la personne colle déjà un JSON produit par un LLM de son choix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARBITER_STATES,
  ROLE_DEFINITIONS,
  parseArbiterOutput,
  validateArbiterOutput
} from '../workers/shared/operational-request-core.js';
import { OPERATIONAL_REQUEST_ROLE_SEQUENCE } from '../workers/shared/operational-request-orchestrator.js';
import {
  OPRIE_EXECUTABLE_STATE,
  assertCanonicalReadinessInvariant,
  isCanonicalBaseContract,
  mapOprieToCanonicalContract,
  validateCanonicalContract
} from '../core/adn/oprie-canonical-mapping.js';
import {
  activeArchSemanticSourceCount,
  canonicalToArchProjectionInput,
  enrichCanonicalContractFromArchAnalysis,
  validateArchCanonicalEnrichment
} from '../core/adn/arch-canonical-enrichment.js';
import {
  analystOutputFixture,
  arbiterOutputFixture,
  criticOutputFixture,
  portableRolePrompt,
  runPastedOprieTurn
} from './offline-oprie-roundtrip-b0.helper.mjs';
import { createArchitecteHarness, analyseFixture } from './archcompiler-harness.helper.mjs';
import { loadPostOprieValidator } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMANDE = 'Demande saisie hors ligne dans l’onglet Architecte Pro.';

/** Le round-trip complet : trois collages, puis le mapper canonique existant. */
async function offlineCanonicalBase(arbiterState = 'operational_request_ready', { original_request = DEMANDE } = {}) {
  const { turn, seen } = await runPastedOprieTurn({ original_request }, {
    analyst: JSON.stringify(analystOutputFixture()),
    critic: JSON.stringify(criticOutputFixture()),
    arbiter: JSON.stringify(arbiterOutputFixture(arbiterState))
  });
  const base = mapOprieToCanonicalContract(turn, { request_id: 'offline-b0', original_request });
  const verdict = validateCanonicalContract(base, { arbiterOutput: turn, original_request });
  return { turn, base, verdict, seen };
}

/* ==========================================================================
 * T-B0-01 — ARTEFACT OPRIE READY IMPORTÉ → CHAÎNE CANONIQUE COMPLÈTE
 * ======================================================================= */

test('T-B0-01 un artefact OPRIE READY collé traverse le mapper existant, l’enrichissement et le compilateur', async () => {
  const { turn, base, verdict, seen } = await offlineCanonicalBase();

  assert.deepEqual(seen, [...OPERATIONAL_REQUEST_ROLE_SEQUENCE], 'la séquence des trois rôles est celle du serveur');
  assert.equal(turn.state, OPRIE_EXECUTABLE_STATE);
  assert.equal(verdict.ok, true, JSON.stringify(verdict.problems));
  assert.equal(isCanonicalBaseContract(base), true);
  assert.equal(base.executability.state, 'exploitable');

  /* Enrichissement Architecte : le module existant, inchangé. */
  const { contract, signals } = enrichCanonicalContractFromArchAnalysis(base, analyseFixture());
  assert.deepEqual(signals.filter((s) => s.signal === 'CONTRACT_INCONSISTENT'), []);
  assert.equal(validateArchCanonicalEnrichment(base, contract).ok, true);

  /* Et le compilateur de production accepte ce contrat, sans rien savoir de son origine. */
  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyseFixture());
  const prompt = harness.compiler(contract);
  assert.ok(prompt.length > 0, 'le prompt professionnel est produit hors ligne');
  assert.match(prompt, /^## RÔLE/);
});

/* ==========================================================================
 * T-B0-02 / 03 / 04 — LES TROIS ÉTATS NON EXÉCUTABLES N'OUVRENT RIEN
 * ======================================================================= */

for (const [id, state] of [['02', 'clarification_required'], ['03', 'confirmation_required'], ['04', 'blocked']]) {
  test(`T-B0-${id} un artefact ${state} collé ne peut pas compiler`, async () => {
    const { base, verdict } = await offlineCanonicalBase(state);

    /* Le mapper accepte l'artefact — il PRÉSERVE l'état, il ne le juge pas. */
    assert.equal(verdict.ok, true, JSON.stringify(verdict.problems));
    assert.equal(base.executability.oprie_state, state);
    assert.equal(base.executability.state, 'clarification_necessaire');

    /* L'AUTORITÉ de blocage reste celle du chemin existant, inchangée. */
    const { validate } = loadPostOprieValidator();
    const result = validate(analyseFixture(), base);
    assert.equal(result.ok, false, 'la validation post-OPRIE refuse');
    assert.equal(result.signals[0].signal, 'CONTRACT_INCONSISTENT');
    assert.equal(result.signals[0].canonical_field, 'executability.oprie_state');
    assert.equal(result.signals[0].return_to_oprie, true, 'le signal renvoie vers OPRIE, jamais vers une question locale');

    /* Et la garde de readiness interdit toute route active sur cette base. */
    assert.throws(
      () => assertCanonicalReadinessInvariant(base, { decision: { etat_demande: 'exploitable', route: 'architecte' } }),
      /Garde readiness/
    );
  });
}

/* ==========================================================================
 * T-B0-05 — FAUX READY MINIMAL
 * ======================================================================= */

test('T-B0-05 {"state":"operational_request_ready"} est refusé à trois niveaux successifs', () => {
  const faux = { state: 'operational_request_ready' };

  /* 1. Le validateur de rôle serveur : champs exacts obligatoires. */
  assert.throws(() => validateArbiterOutput(faux), /champs inattendus ou manquants/);
  assert.throws(() => parseArbiterOutput(JSON.stringify(faux)), /champs inattendus ou manquants/);

  /* 2. Le mapper, si on le court-circuitait : objectif et livrable absents. */
  const base = mapOprieToCanonicalContract(faux, { request_id: 'faux', original_request: DEMANDE });
  const verdict = validateCanonicalContract(base, { arbiterOutput: faux, original_request: DEMANDE });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.problems.some((p) => /intent\.objective vide sur une demande prête/.test(p)));
  assert.ok(verdict.problems.some((p) => /intent\.deliverable vide sur une demande prête/.test(p)));

  /* 3. Un candidat vide ne franchit même pas la normalisation du candidat. */
  assert.throws(() => validateArbiterOutput({ ...arbiterOutputFixture(), operational_request_candidate: {} }),
    /champs inattendus ou manquants/);
});

/* ==========================================================================
 * T-B0-06 — ARTEFACTS MALFORMÉS ET POLLUÉS
 * ======================================================================= */

test('T-B0-06 tout artefact malformé, pollué ou incohérent est fail-closed', () => {
  const cas = {
    'non-objet': () => parseArbiterOutput('"chaîne"'),
    'json invalide': () => parseArbiterOutput('{ pas du json'),
    'tableau': () => parseArbiterOutput('[]'),
    'champ inconnu ajouté': () => validateArbiterOutput({ ...arbiterOutputFixture(), champ_pirate: 1 }),
    'champ obligatoire retiré': () => { const a = arbiterOutputFixture(); delete a.reason; return validateArbiterOutput(a); },
    'état hors énumération': () => validateArbiterOutput({ ...arbiterOutputFixture(), state: 'ready' }),
    'degraded_state auto-déclaré': () => validateArbiterOutput({ ...arbiterOutputFixture(), state: 'degraded_state' }),
    'READY avec question': () => validateArbiterOutput({ ...arbiterOutputFixture(), next_question: { text: 'q ?', targets_issue_id: 'i', expected_progress: 'p' } }),
    'READY avec préservation négative': () => validateArbiterOutput({ ...arbiterOutputFixture(), intent_preservation: { objective_preserved: false, priorities_preserved: true, semantic_equivalence: true, concerns: [] } }),
    'READY avec réserves': () => validateArbiterOutput({ ...arbiterOutputFixture(), intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: ['réserve'] } }),
    'clarification sans question': () => validateArbiterOutput({ ...arbiterOutputFixture('clarification_required'), next_question: { text: null, targets_issue_id: null, expected_progress: null } }),
    'blocked sans motif': () => validateArbiterOutput({ ...arbiterOutputFixture('blocked'), blocked_reason: null })
  };
  for (const [nom, run] of Object.entries(cas)) assert.throws(run, `${nom} doit être refusé`);

  /* `degraded_state` est un état OPRIE légitime côté serveur, mais l'Arbitre ne
     peut jamais se le décerner : il n'est pas dans ARBITER_STATES. */
  assert.equal(ARBITER_STATES.includes('degraded_state'), false);
});

/* ==========================================================================
 * T-B0-07 — LA GARDE DE READINESS RESTE L'AUTORITÉ
 * ======================================================================= */

test('T-B0-07 la garde canonique de readiness reste seule autorité, quelle que soit l’origine de l’artefact', async () => {
  const { base } = await offlineCanonicalBase();

  /* Une base READY exige une route fournie par la couche de routage. */
  assert.throws(() => assertCanonicalReadinessInvariant(base, { decision: { etat_demande: 'exploitable', route: null } }), /exige une route/);
  assert.doesNotThrow(() => assertCanonicalReadinessInvariant(base, { decision: { etat_demande: 'exploitable', route: 'architecte' } }));

  /* Une démotion comme une promotion sont refusées : aucune fusion possible. */
  assert.throws(() => assertCanonicalReadinessInvariant(base, { decision: { etat_demande: 'clarification_necessaire', route: null } }), /Garde readiness/);

  /* Modifier l'état après coup casse la validation : l'état n'est pas éditable. */
  const falsifie = JSON.parse(JSON.stringify(base));
  falsifie.executability.oprie_state = 'clarification_required';
  assert.equal(validateCanonicalContract(falsifie).ok, false);
});

/* ==========================================================================
 * T-B0-08 — LE REPLI RAW archAnalyse RESTE IMPOSSIBLE
 * ======================================================================= */

test('T-B0-08 aucune voie hors ligne ne rouvre le repli raw archAnalyse', () => {
  const analyse = analyseFixture();
  assert.equal(canonicalToArchProjectionInput(analyse), null);
  assert.equal(activeArchSemanticSourceCount(analyse), 0);

  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyse);
  assert.equal(harness.compiler(analyse), '', 'analyse brute refusée');
  assert.equal(harness.compiler(), '', 'aucun contrat appliqué : rien n’est compilé');

  /* Le harnais d'étude lui-même ne peut pas servir de porte dérobée : il ne
     produit que des sorties de rôle validées, jamais un contrat. */
  const helper = fs.readFileSync(path.join(root, 'tests/offline-oprie-roundtrip-b0.helper.mjs'), 'utf8');
  assert.equal(helper.includes('archAnalyse'), false, 'le harnais n’a aucun lien avec archAnalyse');
});

/* ==========================================================================
 * T-B0-09 — AUCUN SECOND MAPPER, AUCUN SECOND OPRIE
 * ======================================================================= */

test('T-B0-09 la voie hors ligne n’introduit ni second mapper sémantique ni second OPRIE', () => {
  const helper = fs.readFileSync(path.join(root, 'tests/offline-oprie-roundtrip-b0.helper.mjs'), 'utf8');
  /* Seule la MÉCANIQUE est auditée ici. Les fixtures qui suivent la bannière
     n'en font pas partie : ce sont des données de test, pas de la logique. */
  const mecanique = helper
    .slice(0, helper.indexOf('* FIXTURES'))
    .replace(/\/\*[\s\S]*?\*\//g, '');   // les commentaires nomment ce qui est INTERDIT : les retirer

  /* Le harnais n'écrit AUCUN prompt, AUCUN schéma, AUCUN validateur, AUCUNE
     séquence de rôles, AUCUN état : il importe tout de la source unique. */
  for (const interdit of ['SYSTEM_PROMPT = ', 'JSON_SCHEMA = ', 'function validate', 'function mapOprie',
    'operational_request_ready', 'exploitable', 'readiness', 'analyst\', \'critic']) {
    assert.equal(mecanique.includes(interdit), false, `le harnais ne réimplémente pas ${interdit}`);
  }
  assert.match(helper, /ROLE_DEFINITIONS/, 'il consomme les définitions de rôle du serveur');
  assert.match(helper, /runOperationalRequestTurn/, 'il consomme l’orchestrateur du serveur');

  /* Un seul producteur de contrat canonique dans tout le noyau. */
  const dir = path.join(root, 'core/adn');
  const producteurs = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.includes('generated'))
    .filter((f) => /export function mapOprieToCanonicalContract/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(producteurs, ['oprie-canonical-mapping.js']);
});

/* ==========================================================================
 * T-B0-10 — AUCUN RÉSEAU
 * ======================================================================= */

test('T-B0-10 la consommation d’un artefact collé n’exige aucun accès réseau', async () => {
  const tentatives = [];
  const piege = (kind) => (...args) => { tentatives.push({ kind, arg: String(args[0] ?? '') }); throw new Error('réseau interdit'); };
  const sauvegarde = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest, WebSocket: globalThis.WebSocket };
  globalThis.fetch = piege('fetch');
  globalThis.XMLHttpRequest = function () { throw new Error('réseau interdit'); };
  globalThis.WebSocket = function () { throw new Error('réseau interdit'); };
  try {
    const { base, verdict } = await offlineCanonicalBase();
    assert.equal(verdict.ok, true);
    const { contract } = enrichCanonicalContractFromArchAnalysis(base, analyseFixture());
    const harness = createArchitecteHarness({ demande: DEMANDE });
    harness.importer(analyseFixture());
    assert.ok(harness.compiler(contract).length > 0);
    assert.deepEqual(harness.network, []);
  } finally {
    Object.assign(globalThis, sauvegarde);
  }
  assert.deepEqual(tentatives, [], 'aucune tentative réseau sur toute la chaîne hors ligne');
});

/* ==========================================================================
 * T-B0-11 — LE CONTRAT ENRICHI RESTE LA SOURCE DU COMPILATEUR
 * ======================================================================= */

test('T-B0-11 le compilateur ne consomme toujours que le contrat canonique enrichi', async () => {
  const { base } = await offlineCanonicalBase();
  const { contract } = enrichCanonicalContractFromArchAnalysis(base, analyseFixture());
  assert.equal(activeArchSemanticSourceCount(contract), 1);
  assert.equal(activeArchSemanticSourceCount(base), 1);

  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyseFixture());
  const prompt = harness.compiler(contract);
  const projection = canonicalToArchProjectionInput(contract);
  assert.equal(projection.semantic_source, 'ENRICHED_CANONICAL_CONTRACT');
  assert.ok(prompt.includes(projection.objective), 'l’objectif projeté vient du contrat');
});

/* ==========================================================================
 * T-B0-12 — LA DEMANDE ORIGINALE EST PRÉSERVÉE
 * ======================================================================= */

test('T-B0-12 original_request traverse la chaîne hors ligne sans altération', async () => {
  const demande = 'Demande originale — accents, « guillemets » et tirets — conservée telle quelle.';
  const { base, verdict } = await offlineCanonicalBase('operational_request_ready', { original_request: demande });
  assert.equal(verdict.ok, true);
  assert.equal(base.original_request, demande);

  const { contract } = enrichCanonicalContractFromArchAnalysis(base, analyseFixture());
  assert.equal(contract.original_request, demande, 'l’enrichissement Architecte ne la touche pas');

  /* Toute altération est détectée par le validateur existant. */
  const falsifie = JSON.parse(JSON.stringify(base));
  falsifie.original_request = demande + ' (modifiée)';
  assert.equal(validateCanonicalContract(falsifie, { original_request: demande }).ok, false);
});

/* ==========================================================================
 * T-B0-13 — L'ORCHESTRATION RESTE NON CONTOURNABLE
 * ======================================================================= */

test('T-B0-13 un rôle collé ne peut pas court-circuiter le rôle précédent', async () => {
  const entrees = {};
  await runPastedOprieTurn({ original_request: DEMANDE }, {
    analyst: JSON.stringify(analystOutputFixture()),
    critic: JSON.stringify(criticOutputFixture()),
    arbiter: JSON.stringify(arbiterOutputFixture())
  }, { onPrompt: (role, prompt, roleInput) => { entrees[role] = roleInput; } });

  /* L'entrée de chaque rôle est CONSTRUITE par l'orchestrateur à partir des
     sorties déjà validées — jamais fournie par la personne. */
  assert.equal('analyst_output' in entrees.analyst, false, 'l’Analyste ne reçoit que la demande');
  assert.ok(entrees.critic.analyst_output, 'le Critique reçoit la sortie validée de l’Analyste');
  assert.ok(entrees.arbiter.analyst_output && entrees.arbiter.critic_output, 'l’Arbitre reçoit les deux');
  assert.equal(entrees.critic.analyst_output.operational_request_candidate.objective,
    analystOutputFixture().operational_request_candidate.objective);

  /* Un collage Arbitre seul, sans Analyste valide, ne produit aucun tour. */
  await assert.rejects(() => runPastedOprieTurn({ original_request: DEMANDE }, {
    analyst: '{}', critic: JSON.stringify(criticOutputFixture()), arbiter: JSON.stringify(arbiterOutputFixture())
  }), /AnalystOutput/);
});

/* ==========================================================================
 * T-B0-14 — LE PROMPT PORTABLE EST GÉNÉRIQUE ET SANS SECRET
 * ======================================================================= */

test('T-B0-14 les prompts portables ne contiennent ni secret, ni endpoint, ni vocabulaire de domaine', () => {
  const entrees = {
    analyst: { original_request: DEMANDE, clarification_history: [] },
    critic: { original_request: DEMANDE, clarification_history: [], analyst_output: analystOutputFixture(), previous_vetoes: [] },
    arbiter: { original_request: DEMANDE, clarification_history: [], analyst_output: analystOutputFixture(), critic_output: criticOutputFixture() }
  };
  for (const role of OPERATIONAL_REQUEST_ROLE_SEQUENCE) {
    const prompt = portableRolePrompt(role, entrees[role]);
    assert.ok(prompt.length > 0);
    assert.ok(prompt.includes(ROLE_DEFINITIONS[role].systemPrompt), 'le prompt système est celui du serveur, tel quel');
    assert.match(prompt, /SCHÉMA JSON DE SORTIE/);
    for (const interdit of ['workers.dev', 'http://', 'https://', 'api-key', 'Authorization', 'Bearer',
      'groq', 'anthropic', 'openai', 'workers-ai']) {
      assert.equal(prompt.toLowerCase().includes(interdit.toLowerCase()), false, `${role} : le prompt portable ne contient pas ${interdit}`);
    }
  }
});

/* ==========================================================================
 * T-B0-15 — MODÈLE DE CONFIANCE : STRUCTUREL, PAS CRYPTOGRAPHIQUE
 * ======================================================================= */

test('T-B0-15 la validation est structurelle ; aucune authenticité cryptographique n’est prétendue', async () => {
  /* Constat mesuré : aucune signature n'existe dans l'architecture. */
  const surface = [
    'core/adn/oprie-canonical-mapping.js',
    'core/adn/arch-canonical-enrichment.js',
    'workers/shared/operational-request-core.js'
  ].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  for (const marqueur of ['signature', 'hmac', 'subtle.', 'createHmac', 'jwt']) {
    assert.equal(surface.toLowerCase().includes(marqueur.toLowerCase()), false,
      `aucune primitive d’authenticité n’existe (${marqueur}) — B0 n’en invente pas`);
  }

  /* Un artefact STRUCTURELLEMENT conforme est accepté, quelle que soit son
     origine : c'est exactement le modèle de confiance de la route Architecte
     historique, où la personne colle déjà un JSON produit par son propre LLM. */
  const { verdict } = await offlineCanonicalBase();
  assert.equal(verdict.ok, true);
  assert.equal(fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8')
    .includes('function archTraiterJsonSaisi('), true,
    'la route historique de collage de JSON externe existe déjà en production');
});
