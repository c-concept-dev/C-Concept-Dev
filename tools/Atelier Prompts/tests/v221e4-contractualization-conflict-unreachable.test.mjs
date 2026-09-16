/* ATELIER PROMPTS V2.2.1-E4 — LE CONFLIT DE CONTRACTUALISATION N'A PLUS DE CHEMIN.
 * ============================================================================
 *
 * CE QU'ÉTAIT P2. Le réaudit indépendant l'avait classé BLOCKER, sur un symptôme observé :
 * un conflit journalisé `returned_to: "OPRIE"`, une exception relancée, et un HTTP 502 côté client.
 *
 * SA CAUSE, RECONSTITUÉE. Il ne pouvait naître QUE d'un verrou : V2.2.1-B faisait traduire par le
 * plan rapide son accusé de réception en décision canonique READY, transmise au contractualisateur,
 * qui n'avait plus le droit d'en décider autrement. `assertDecisionLockRespected` comparait l'état
 * produit à la décision verrouillée ; toute divergence levait le conflit.
 *
 * POURQUOI IL N'EST PLUS ATTEIGNABLE. V2.2.1-E1 n'a pas corrigé le conflit : il a retiré le verrou,
 * parce que la gouvernance interdit au plan rapide de prononcer une readiness. Le conflit est parti
 * avec lui — non comme une correction, mais comme la disparition de ce qui le produisait.
 *
 * CE FICHIER NE SE CONTENTE PAS DE CONSTATER L'ABSENCE D'UN SYMBOLE. Il part d'une entrée
 * légitime du produit et fait tourner le VRAI orchestrateur sur les quatre états que l'autorité
 * peut prononcer, en vérifiant qu'aucun ne produit de conflit — et que la porte d'entrée refuse
 * désormais la décision qui, seule, pouvait en créer un.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleOperationalRequest } from '../workers/shared/operational-request-orchestrator.js';
import { validateCoreInput } from '../workers/shared/core-first-plane.js';
import { ARBITER_STATES } from '../workers/shared/operational-request-core.js';
import { createEmptyCandidate } from '../core/adn/operational-request-state.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');
const execute = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SOURCES = [
  ['orchestrateur', lire('workers/shared/operational-request-orchestrator.js')],
  ['autorité', lire('workers/shared/operational-request-core.js')],
  ['plan Core', lire('workers/shared/core-first-plane.js')],
  ['plan rapide', lire('workers/shared/fast-interactive-plane.js')],
  ['artefact livré', lire('atelier-prompts-v11.5-lot10g-decision-provider.html')],
  ['runtime compilé', lire('core/adn/browser-runtime.generated.js')]
];

/** Une sortie Core valide, pour l'état demandé. Rien n'y est injecté qui n'existe plus. */
function sortieCore(state) {
  const question = state === 'clarification_required'
    ? { text: 'Depuis quelle ville partez-vous ?', targets_issue_id: 'I1', expected_progress: 'x', question_focus: 'problem_or_user_context' }
    : { text: null, targets_issue_id: null, expected_progress: null, question_focus: null };
  return {
    state,
    operational_request_candidate: createEmptyCandidate(),
    objective_nature: 'production',
    request_focus: 'user_problem_or_goal',
    issues: state === 'clarification_required'
      ? [{ id: 'I1', type: 'missing_information', description: 'Le point de départ est inconnu.', impact: 'material', substitutable: false, recommended_treatment: 'question', kind: null }]
      : [],
    next_question: question,
    confirmation_reason: state === 'confirmation_required' ? 'Plusieurs arbitrages ont été faits.' : null,
    blocked_reason: state === 'blocked' ? 'Aucune question utile ne permet de progresser.' : null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'r',
    question_candidates: [],
    escalation: { needed: false, kind: null, reason: null }
  };
}

/* ==========================================================================
 * E4-01 — LE DÉCLENCHEUR N'EXISTE NULLE PART
 * ======================================================================= */

test('V221E4-01 : ni le conflit, ni le verrou qui seul pouvait le produire, n’existent en production', () => {
  for (const [nom, source] of SOURCES) {
    const code = execute(source);
    for (const symbole of ['CONTRACTUALIZATION_CONFLICT', 'contractualization_conflict',
                           'assertDecisionLockRespected', 'canonicalDecisionLockFromFastType']) {
      assert.equal(code.includes(symbole), false, `${symbole} est revenu dans ${nom}`);
    }
    /* La télémétrie ne décrit plus une transition qui n'existe pas. */
    assert.equal(/returned_to/.test(code), false, `une télémétrie « returned_to » dans ${nom}`);
  }
});

test('V221E4-02 : la porte d’entrée refuse la décision qui, seule, pouvait créer un conflit', () => {
  /* Le conflit naissait de la COMPARAISON entre un état produit et une décision transmise. Sans
     décision transmissible, la comparaison n'a plus d'opérande — le déclencheur est structurellement
     impossible, pas seulement absent. */
  assert.throws(() => validateCoreInput({
    original_request: 'Explique la photosynthèse.', clarification_history: [],
    canonical_decision: { decision: 'READY', source: 'OPRIE_FAST' }
  }), /champs inattendus/i);
  /* Et une entrée légitime, elle, passe. */
  assert.doesNotThrow(() => validateCoreInput({
    original_request: 'Explique la photosynthèse.', clarification_history: []
  }));
});

/* ==========================================================================
 * E4-03 — LE VRAI ORCHESTRATEUR, SUR LES QUATRE ÉTATS
 * ======================================================================= */

test('V221E4-03 : aucun des quatre états prononçables ne produit de conflit', async () => {
  /* On passe par la VRAIE porte HTTP, sur le plan Core — celui où le verrou vivait. Rien n'est
     injecté : le corps de la requête est celui que le client envoie aujourd'hui. */
  for (const state of ARBITER_STATES) {
    const journal = [];
    const requete = new Request('https://x/operational-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://atelier.test' },
      body: JSON.stringify({ original_request: 'Je veux préparer un déplacement.', clarification_history: [] })
    });
    const reponse = await handleOperationalRequest(requete, { ATELIER_NOMINAL_PLANE: 'core', ALLOWED_ORIGINS: 'https://atelier.test' },
      { log: (e) => journal.push(e), executeRole: async () => sortieCore(state) });
    assert.equal(reponse.status, 200, `aucun 502 sur ${state}`);
    const rendu = await reponse.json();
    assert.equal(rendu.state, state, `l’état prononcé par l’autorité est rendu tel quel (${state})`);
    const evenements = journal.map((e) => e && e.event);
    assert.equal(evenements.includes('contractualization_conflict'), false, `conflit sur ${state}`);
    /* Et le relevé dit ce qui est désormais vrai : une seule autorité de readiness. */
    const releve = journal.find((e) => e && e.event === 'readiness_authority');
    assert.ok(releve, `le relevé d’autorité est émis (${state})`);
    assert.equal(releve.semantic_authority, 'OPRIE');
    assert.equal(releve.ready_decision_source, 'OPRIE_DEEP');
  }
});

test('V221E4-04 : le plan Core est bien celui qui a été exercé', async () => {
  const journal = [];
  const requete = new Request('https://x/operational-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://atelier.test' },
    body: JSON.stringify({ original_request: 'x', clarification_history: [] })
  });
  await handleOperationalRequest(requete, { ATELIER_NOMINAL_PLANE: 'core', ALLOWED_ORIGINS: 'https://atelier.test' },
    { log: (e) => journal.push(e), executeRole: async () => sortieCore('operational_request_ready') });
  const plan = journal.find((e) => e && e.event === 'nominal_plane');
  assert.equal(plan && plan.plane, 'core', 'c’est bien le chemin où le verrou vivait');
});

/* ==========================================================================
 * E4-05 — CE QUE CE LOT NE DEVAIT PAS DÉPLACER
 * ======================================================================= */

test('V221E4-05 : les acquis de E1, E2 et E3 sont intacts', async () => {
  const F = await import('../workers/shared/fast-interactive-plane.js');
  const v = F.validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Reçu.' },
    F.createTurnSnapshot({ turn_id: 1, original_request: 'x' }));
  assert.equal(v.interaction.can_mark_ready, false, 'E1 — le plan rapide ne prononce aucune maturité');
  const html = lire('atelier-prompts-v11.5-lot10g-decision-provider.html');
  assert.equal(html.includes('askDecisionProvider'), false, 'E2 — le décideur historique reste absent');
  assert.equal(/common\s*\/\s*Math\.min\(/.test(execute(html)), false, 'E3 — aucun appariement flou');
  const etat = await import('../core/adn/operational-request-state.js');
  assert.equal([...etat.QUESTION_FOCUS_VALUES].length, 3);
  assert.equal([...etat.REQUEST_FOCUS_VALUES].length, 3);
});

/* ==========================================================================
 * E4-06 — UN MÉCANISME HOMONYME, ET IL EST BIEN VIVANT
 * ======================================================================= */

test('V221E4-06 : `return_to_oprie` est un autre mécanisme, vivant, et ce lot n’y touche pas', () => {
  /* La recherche de résidus a croisé `return_to_oprie` dans l'enrichissement ADN. Ce n'est PAS la
     télémétrie de P2 : c'est un drapeau de politique porté par les signaux Architecte
     (CONTRACT_INCONSISTENT, EXECUTION_UNSAFE), lu et normalisé par cette politique. Le nommer ici
     évite qu'un audit futur le prenne pour un vestige et le retire par erreur. */
  const enrichissement = execute(lire('core/adn/arch-canonical-enrichment.js'));
  assert.match(enrichissement, /return_to_oprie/);
  assert.match(enrichissement, /CONTRACT_INCONSISTENT/);
  /* Il ne porte aucun des symboles de P2. */
  assert.equal(/contractualization|assertDecisionLock/i.test(enrichissement), false);
});
