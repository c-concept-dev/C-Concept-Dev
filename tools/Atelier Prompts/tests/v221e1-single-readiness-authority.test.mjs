/* ATELIER PROMPTS V2.2.1-E1 — UNE SEULE AUTORITÉ DE MATURITÉ, ET CE N'EST PAS LE PLAN RAPIDE.
 * ============================================================================
 *
 * CE QUE LE RÉAUDIT INDÉPENDANT A RENVERSÉ.
 *
 * V2.2.1-B avait fermé la « double readiness » en donnant au plan rapide le DERNIER mot : son
 * accusé de réception devenait une décision canonique que le contractualisateur ne pouvait plus
 * rediscuter. D1 a réparé le câblage navigateur de ce verrou, et j'ai rapporté P0 comme fermé.
 *
 * Le verrou fonctionnait. Il verrouillait simplement une autorité que la gouvernance interdit.
 * Les deux textes normatifs sont explicites, et ils concordent :
 *
 *   GARDE-FOU §9  — Fast « peut : proposer une question candidate […] » ;
 *                   « Il ne doit pas : fabriquer READY […] devenir une nouvelle autorité. »
 *                   Invariants à préserver : « OPRIE authority », « Fast candidate-only ».
 *   GARDE-FOU §5  — est une dette : « une seconde autorité », « une seconde readiness »,
 *                   « une seconde représentation canonique ».
 *   DIRECTIVE §5  — « OPRIE = autorité sémantique de la demande et de la readiness » ;
 *                   à proscrire : « double readiness », « double autorité sémantique »,
 *                   « seconde représentation canonique inutile ».
 *                   « Une responsabilité = une autorité identifiable. »
 *   DIRECTIVE §6  — le plan rapide « ne devient jamais une seconde autorité ».
 *
 * LA DOUBLE DÉCISION NE SE FERME PAS EN DONNANT LE DERNIER MOT AU PLAN RAPIDE : ELLE SE FERME EN
 * LUI RETIRANT LE PREMIER. C'est ce que ce lot fait, et ce que ce fichier vérifie.
 *
 * CE QUE ACKNOWLEDGE SIGNIFIE MAINTENANT : « aucune interaction rapide n'est nécessaire » — et rien
 * de plus. La suite appartient à l'autorité sémantique.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as autorite from '../workers/shared/operational-request-core.js';
import { CORE_JSON_SCHEMA, makeCoreUserMessage, validateCoreInput } from '../workers/shared/core-first-plane.js';
import { FAST_INTERACTION_JSON_SCHEMA, validateFastInteraction, createTurnSnapshot } from '../workers/shared/fast-interactive-plane.js';
import { loadPilot, arbiterTurn, clarificationTurn, questionShown, html } from './perf04-frontend-harness.helper.mjs';

/* TARGETED-FIX-POST-CODEX-01 — le contrat du plan rapide compte un QUATRIÈME champ nommé :
   l'identité du manque. Le contre-audit a démontré qu'une question rapide répondue laissait
   l'historique sans identité, si bien qu'une reformulation ultérieure du même manque par le plan
   profond n'était plus reconnue. L'invariant gardé ici est inchangé — le schéma reste clos et
   incapable de porter un état ; il s'allonge d'un fait produit par la même décision. */

const lire = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const orchestrateur = lire('../workers/shared/operational-request-orchestrator.js');
const noyau = lire('../workers/shared/operational-request-core.js');
const planCore = lire('../workers/shared/core-first-plane.js');

/* ==========================================================================
 * E1-01 — LA RÉGRESSION INTERDITE : ACKNOWLEDGE → DÉCISION D'ABOUTISSEMENT
 * ======================================================================= */

test('V221E1-01 : aucun chemin ne traduit plus un accusé de réception en décision canonique', async () => {
  /* CE TEST MORD SUR L'IMPLÉMENTATION D'AVANT. Il ne cherche pas un symbole isolé : il fait tourner
     le VRAI pilote navigateur sur une demande simple et complète, et regarde ce qui part sur le
     réseau. Avant E1, le corps portait canonical_decision = {decision:'READY', source:'OPRIE_FAST'}. */
  const h = loadPilot({
    mode: 'rapide',
    demande: 'Explique la photosynthèse à un enfant de 10 ans en exactement cinq paragraphes.',
    fast: async () => ({ type: 'ACKNOWLEDGE', text: 'Reçu.', question_focus: null }),
    deep: async () => arbiterTurn('operational_request_ready')
  });
  await h.pilot.oprieRunTurn('rapide');
  const corps = h.spy.deepCalls[0] && h.spy.deepCalls[0].body;
  assert.ok(corps, 'l’autorité a bien été appelée');
  assert.equal('canonical_decision' in corps, false,
    'le plan rapide ne transmet aucune décision : c’est l’objet même du lot');
  /* Et rien n'a été affiché : un accusé de réception ne parle pas à la personne. */
  assert.equal(questionShown(h.ctx), '');
});

test('V221E1-02 : le vocabulaire du verrou a disparu de l’autorité, du transport et du client', () => {
  for (const symbole of ['canonicalDecisionFromFastType', 'canonicalDecisionLockFromFastType',
                         'validateCanonicalDecision', 'assertDecisionLockRespected',
                         'FAST_CANONICAL_DECISIONS', 'CANONICAL_DECISION_SOURCES']) {
    assert.equal(symbole in autorite, false, `${symbole} n’est plus exporté`);
    assert.equal(noyau.includes(`export function ${symbole}`), false, `${symbole} n’est plus défini`);
  }
  /* Le client ne fabrique plus de décision, et n'en retient plus la trace. */
  assert.equal(html.includes('oprieCanonicalDecision'), false);
  assert.equal(html.includes('fastSemanticType'), false);
  /* Le contrat d'entrée de l'autorité ne l'accepte plus. */
  /* TRACER-REMEDIATION-02 · F1 — une clé optionnelle NOMMÉE de plus : le vocabulaire de formats,
     transmis par l'application pour que l'autorité nomme la forme du livrable au lieu qu'un score
     de mots-clés la devine en aval. Ce que cette preuve garde est inchangé : le contrat n'accepte
     que des clés nommées, et aucune ne porte de décision. */
  assert.match(noyau, /\["material_context", "material_content", "output_format_vocabulary"\], "AnalystInput"\)/);
  assert.equal(noyau.includes('canonical_decision'), false, 'et toujours aucune décision transmise');
  assert.throws(() => validateCoreInput({
    original_request: 'x', clarification_history: [], canonical_decision: { decision: 'READY', source: 'OPRIE_FAST' }
  }), 'une décision transmise est refusée, pas ignorée');
});

/* ==========================================================================
 * E1-03 — UNE SEULE AUTORITÉ, DANS LE CONTRAT ET DANS LE COMPORTEMENT
 * ======================================================================= */

test('V221E1-03 : le plan rapide est incapable de prononcer une maturité — contrat', () => {
  /* Par son schéma : aucun de ses trois champs ne porte d'état, et son vocabulaire de types n'en
     contient aucun. */
  /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — la citation qui fonde une question est entrée au contrat ; ce n'est pas un champ d'autorité : elle ne prononce rien, elle atteste. */
  assert.deepEqual(Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties).sort(),
    ['explicit_unknown_determinant_ids', 'missing_determinant_evidence', 'missing_determinant_id', 'question_focus', 'text', 'type']);
  for (const etat of [...autorite.ARBITER_STATES]) {
    assert.equal(FAST_INTERACTION_JSON_SCHEMA.properties.type.enum.includes(etat), false, etat);
  }
  /* Et par son verdict : la candidate rendue le déclare elle-même. */
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Reçu.' },
    createTurnSnapshot({ turn_id: 1, original_request: 'x' }));
  assert.equal(v.interaction.authority, 'candidate', 'FAST_AUTHORITY = candidate');
  assert.equal(v.interaction.can_mark_ready, false, 'FAST_CAN_MARK_READY = false');
});

test('V221E1-04 : un seul producteur de maturité subsiste, et c’est l’autorité sémantique', () => {
  /* L'état naît dans UN validateur, et nulle part ailleurs : c'est lui qui nomme les quatre états,
     et lui seul qui les refuse. Le message envoyé à l'autorité ne porte aucune décision préalable. */
  assert.match(planCore, /export function makeCoreUserMessage\(input = \{\}\) \{\s*\n\s*return makeAnalystUserMessage\(input\);/);
  assert.equal(planCore.includes('canonical_decision'), false, 'plus aucune décision dans l’entrée');
  assert.equal(CORE_JSON_SCHEMA.properties.state.enum.length, autorite.ARBITER_STATES.length);
  /* Le message construit pour un tour ne contient aucune décision, même si on tente d'en glisser une. */
  const message = makeCoreUserMessage({
    original_request: 'Explique la photosynthèse.', clarification_history: [],
    canonical_decision: { decision: 'READY', source: 'OPRIE_FAST' }
  });
  assert.equal(/decision/i.test(message), false, 'aucune décision ne traverse, même passée de force');
});

test('V221E1-05 : l’orchestrateur ne transporte plus de décision, et le relevé le dit', () => {
  assert.equal(/assertDecisionLockRespected|canonicalDecisionLockFromFastType/.test(orchestrateur), false);
  assert.equal(orchestrateur.includes('contractualization_conflict'), false,
    'le conflit disparaît avec le verrou qui seul pouvait le produire');
  /* Le relevé d'observabilité subsiste, et il MESURE l'invariant restauré. */
  assert.match(orchestrateur, /event: "readiness_authority"/);
  assert.match(orchestrateur, /semantic_authority: "OPRIE"/);
  assert.match(orchestrateur, /ready_decision_source: "OPRIE_DEEP"/);
  /* Et le nom du relevé ne désigne plus un mécanisme disparu. */
  assert.equal(orchestrateur.includes('canonical_decision'), false);
});

/* ==========================================================================
 * E1-06 à 08 — LES TROIS PARCOURS, BOUT EN BOUT
 * ======================================================================= */

test('V221E1-06 : demande simple et complète — une seule décision de maturité', async () => {
  const h = loadPilot({
    mode: 'rapide', demande: 'Rédige le règlement d’un tournoi de pétanque entre trois services.',
    fast: async () => ({ type: 'ACKNOWLEDGE', text: 'Reçu.', question_focus: null }),
    deep: async () => arbiterTurn('operational_request_ready')
  });
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(h.spy.deepCalls.length, 1, 'READINESS_DECISION_COUNT = 1 : un seul appel décide');
  assert.equal('canonical_decision' in h.spy.deepCalls[0].body, false, 'et le plan rapide n’en décide aucune');
  assert.equal(questionShown(h.ctx), '', 'aucune question de confort');
});

test('V221E1-07 : manque déterminant — le plan rapide pose sa question, et ne décide toujours rien', async () => {
  const h = loadPilot({
    mode: 'rapide', demande: 'Je veux préparer un déplacement.',
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Depuis quelle ville partez-vous ?', question_focus: 'problem_or_user_context' }),
    deep: async () => clarificationTurn('x')
  });
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(questionShown(h.ctx), 'Depuis quelle ville partez-vous ?', 'la question d’OPRIE, telle quelle');
  assert.equal(h.spy.deepCalls.length, 0, 'la personne répond avant tout travail profond');
});

test('V221E1-08 : contradiction — l’escalade laisse décider l’autorité, sans rien lui imposer', async () => {
  const h = loadPilot({
    mode: 'rapide', demande: 'Rédige un document exhaustif de trois cents pages qui tienne sur une seule page recto.',
    fast: async () => ({ type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Deux exigences explicites s’excluent.', question_focus: null }),
    deep: async () => clarificationTurn('Laquelle des deux exigences doit primer ?')
  });
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(h.spy.deepCalls.length, 1);
  assert.equal('canonical_decision' in h.spy.deepCalls[0].body, false);
});

/* ==========================================================================
 * E1-09 — CE QUE CE LOT NE DEVAIT PAS TOUCHER
 * ======================================================================= */

test('V221E1-09 : les trois faits canoniques de D2D/D2F1/D2F2 sont intacts', async () => {
  const etat = await import('../core/adn/operational-request-state.js');
  assert.deepEqual([...autorite.OBJECTIVE_NATURES], ['production', 'transformation', 'other']);
  assert.deepEqual([...etat.QUESTION_FOCUS_VALUES],
    ['problem_or_user_context', 'output_specification', 'other']);
  assert.deepEqual([...etat.REQUEST_FOCUS_VALUES],
    ['output_form_or_specification', 'user_problem_or_goal', 'other']);
  /* Ils décrivent une question ou une demande — jamais une maturité — et restent donc légitimes. */
  assert.equal(CORE_JSON_SCHEMA.required.includes('objective_nature'), true);
  assert.equal(CORE_JSON_SCHEMA.required.includes('request_focus'), true);
  assert.equal(CORE_JSON_SCHEMA.properties.next_question.required.includes('question_focus'), true);
});
