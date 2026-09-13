/* ATELIER PROMPTS V2 — CORE FIRST. TESTS CONTRACTUELS.
 * ============================================================================
 *
 * CE QUE CES TESTS PROTÈGENT. Pas une implémentation : une décision produit. Le chemin nominal
 * appelait trois modèles, toujours, et cela coûtait 78 à 109 secondes mesurées sur le runtime
 * déployé — sans qu'aucune étape ne domine, donc sans rien à optimiser à l'intérieur des étapes.
 * V2 en appelle UN, et n'escalade que sur un constat.
 *
 * CE QU'ILS NE TOUCHENT PAS, ET C'EST VOLONTAIRE. Le JSON d'analyse `analyse-llm-v3-4` n'est pas
 * produit par ces rôles : il l'est par le moteur Architecte, dans une plage GELÉE de l'artefact, en
 * un seul appel qui existait déjà. V2 simplifie le chemin CONVERSATIONNEL qui précède sa production,
 * jamais sa forme. T-V2-21 le vérifie explicitement, parce qu'une simplification qui appauvrirait la
 * sortie serait un échec, pas un progrès.
 *
 * AUCUN APPEL FOURNISSEUR N'EST FAIT ICI. Les exécuteurs sont des fixtures : ce qui est vérifié est
 * le CONTRAT — combien d'appels, lesquels, dans quel ordre, et ce que le garde refuse.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  runCoreFirstTurn, assessEscalation, resolveNominalPlane, validateCoreOutput,
  validateCoreCriticOutput, CORE_SYSTEM_PROMPT, CORE_JSON_SCHEMA, CORE_ROLE_DEFINITIONS,
  ESCALATION_KINDS, ESCALATION_VERDICTS, CORE_CRITIC_VERDICTS, NOMINAL_PLANES, DEFAULT_NOMINAL_PLANE
} from '../workers/shared/core-first-plane.js';
import { ARBITER_JSON_SCHEMA, OPRIE_ROLES } from '../workers/shared/operational-request-core.js';
import { OPERATIONAL_REQUEST_ROLE_SEQUENCE } from '../workers/shared/operational-request-orchestrator.js';
import { isAtomicQuestion } from '../workers/shared/solicitation-policy.js';

const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
const coreSource = fs.readFileSync(new URL('../workers/shared/core-first-plane.js', import.meta.url), 'utf8');
const orchestrateur = fs.readFileSync(new URL('../workers/shared/operational-request-orchestrator.js', import.meta.url), 'utf8');

/* ---------------------------------------------------------------------------
 * FIXTURES — un tour minimal mais VALIDE au regard du schéma de l'Arbitre.
 * ------------------------------------------------------------------------- */

const candidatVide = {
  objective: 'Préparer la demande.', expected_deliverable: 'Un document structuré.',
  secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
  confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [],
  assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
};

const intentIntacte = {
  objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: []
};

const conflit = {
  id: 'I1', type: 'conflict', kind: 'logical_contradiction',
  description: 'Deux exigences explicites ne peuvent pas tenir ensemble.',
  impact: 'material', substitutable: false, recommended_treatment: 'question'
};

function tour({ state = 'operational_request_ready', question = null, issues = [] } = {}) {
  return {
    state,
    operational_request_candidate: { ...candidatVide },
    issues,
    next_question: question
      ? { text: question, targets_issue_id: issues[0] ? issues[0].id : 'I1', expected_progress: 'Débloque la suite.' }
      : { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null,
    blocked_reason: state === 'blocked' ? 'Options épuisées.' : null,
    intent_preservation: { ...intentIntacte },
    reason: 'Raison du tour.'
  };
}

function sortieCore({ state, question, issues = [], escalation = null, candidates = [] } = {}) {
  return {
    ...tour({ state, question, issues }),
    question_candidates: candidates,
    escalation: escalation || { needed: false, kind: null, reason: null }
  };
}

/** Un exécuteur de fixtures qui COMPTE les appels : c'est la mesure du contrat. */
function executeur(reponses) {
  const appels = [];
  const executeRole = async (role, input) => {
    appels.push({ role, input });
    const reponse = reponses[role];
    if (reponse === undefined) throw new Error(`Rôle inattendu appelé : ${role}`);
    return typeof reponse === 'function' ? reponse(input) : reponse;
  };
  return { executeRole, appels, roles: () => appels.map((a) => a.role) };
}

const demande = { original_request: 'Une demande quelconque.', clarification_history: [] };

/* ==========================================================================
 * V2-01 — UNE DEMANDE EXPLOITABLE : UN SEUL APPEL, ET RIEN D'AUTRE
 * ======================================================================= */

test('V2-01 : demande exploitable → zéro question, zéro Critique, zéro Arbitre', async () => {
  const { executeRole, roles, appels } = executeur({ core: sortieCore({}) });
  const resultat = await runCoreFirstTurn(demande, { executeRole });
  assert.deepEqual(roles(), ['core'], 'un appel, et un seul');
  assert.equal(resultat.provider_calls, 1);
  assert.equal(resultat.calls.core_critic, 0);
  assert.equal(resultat.calls.core_arbiter, 0);
  assert.equal(resultat.turn.state, 'operational_request_ready');
  /* Une question dont les trois champs sont nuls EST null après validation : c'est le validateur de
     l'Arbitre qui le normalise, et V2 hérite de cette normalisation sans la redéfinir. */
  assert.equal(resultat.turn.next_question, null, 'aucune question posée');
  assert.equal(appels[0].input.original_request, demande.original_request, 'la demande passe telle quelle');
});

/* ==========================================================================
 * V2-02 / V2-03 — LA CLARIFICATION RESTE LOCALE ET LÉGÈRE
 * ======================================================================= */

test('V2-02 : une donnée déterminante manque → une question concrète, un seul appel', async () => {
  const manque = { ...conflit, id: 'I2', type: 'missing_information', kind: null, substitutable: false,
                   description: 'Une donnée déterminante manque.', recommended_treatment: 'question' };
  const { executeRole, roles } = executeur({
    core: sortieCore({ state: 'clarification_required', question: 'Combien de jours partez-vous ?', issues: [manque] })
  });
  const resultat = await runCoreFirstTurn(demande, { executeRole });
  assert.deepEqual(roles(), ['core'], 'poser une question ne coûte pas une chaîne');
  assert.equal(resultat.turn.state, 'clarification_required');
  assert.equal(resultat.turn.next_question.text, 'Combien de jours partez-vous ?');
  assert.equal(isAtomicQuestion(resultat.turn.next_question.text), true);
});

test('V2-03 : après une réponse, la réévaluation coûte un appel, pas un pipeline', async () => {
  const avecReponse = {
    original_request: 'Une demande quelconque.',
    clarification_history: [{ turn: 1, question: 'Combien de jours partez-vous ?', answer: 'Quatre', provenance: 'user' }]
  };
  const { executeRole, roles, appels } = executeur({ core: sortieCore({}) });
  const resultat = await runCoreFirstTurn(avecReponse, { executeRole });
  assert.deepEqual(roles(), ['core'], 'une réponse ne relance aucune chaîne lourde');
  assert.equal(resultat.provider_calls, 1);
  assert.equal(appels[0].input.clarification_history.length, 1, 'l’historique complet est transmis');
});

/* ==========================================================================
 * V2-04 — COMPLEXITÉ N'EST PAS AMBIGUÏTÉ
 * ======================================================================= */

test('V2-04 : demande complexe mais exploitable → Core seul, aucune escalade', async () => {
  /* Le cas du brief, mot pour mot : dense, chiffré, multi-critères — et exploitable. */
  const dense = {
    original_request: 'Compare trois stratégies de migration d’un logiciel de gestion de projet pour '
      + 'une PME de 12 personnes, avec coûts, risques, impacts organisationnels, critères de décision '
      + 'et recommandation.',
    clarification_history: []
  };
  const { executeRole, roles } = executeur({ core: sortieCore({}) });
  const resultat = await runCoreFirstTurn(dense, { executeRole });
  assert.deepEqual(roles(), ['core']);
  assert.equal(resultat.turn.state, 'operational_request_ready');
  assert.equal(resultat.turn.next_question, null, 'ZÉRO QUESTION : la densité n’est pas une inconnue');
  /* Et la consigne du Core dit cela explicitement, sans quoi rien ne le garantirait. */
  assert.match(CORE_SYSTEM_PROMPT, /Complexité n'est pas ambiguïté/);
  assert.match(CORE_SYSTEM_PROMPT, /UNE CHAISE À LA FOIS/);
});

/* ==========================================================================
 * V2-05 / V2-06 / V2-07 — CE QUI NE PEUT PAS S'AFFICHER
 * ======================================================================= */

test('V2-05 : une question catalogue ne peut pas sortir du tour V2', async () => {
  const catalogue = 'Quel type de résultat attendez-vous : un plan détaillé, une sélection de '
    + 'recommandations, une liste de contrôle, ou autre chose ?';
  assert.equal(isAtomicQuestion(catalogue), false, 'le garde la reconnaît');
  /* Et le chemin V2 passe par la MÊME frontière que le chemin historique. */
  assert.match(orchestrateur, /return applyDisplayGuardToTurn\(resultat\.turn, \{ question_candidates: resultat\.question_candidates \}, log\);/,
    'la sortie V2 traverse la frontière d’atomicité, et elle y traverse avec ses candidates');
});

test('V2-06 : une question multi-dimension ne peut pas sortir du tour V2', () => {
  assert.equal(isAtomicQuestion('Quel est votre budget et combien de jours partez-vous ?'), false);
  assert.equal(isAtomicQuestion('Quel est le délai prévu et avez-vous déjà un devis ?'), false);
  assert.equal(isAtomicQuestion('Combien de jours partez-vous ?'), true);
});

test('V2-07 : la consigne interdit la question méta sur le livrable', () => {
  assert.match(CORE_SYSTEM_PROMPT, /Ne demandez JAMAIS à la personne de concevoir ce que vous êtes chargé de préparer/);
  assert.match(CORE_SYSTEM_PROMPT, /sauf si la demande porte elle-même explicitement sur ce choix/,
    'l’exception existe : le format peut être le sujet');
  assert.match(CORE_SYSTEM_PROMPT, /VARIABLE RÉELLE du problème/);
  assert.match(CORE_SYSTEM_PROMPT, /un catalogue d'options n'est pas une question/);
});

/* ==========================================================================
 * V2-08 — LE MATÉRIAU FOURNI N'EST JAMAIS REDEMANDÉ
 * ======================================================================= */

test('V2-08 : un matériau transmis est une source, pas une inconnue', async () => {
  const avecMateriau = {
    original_request: 'Corrige ce texte en conservant le sens.',
    clarification_history: [],
    material_context: { present: true, deep_content_available: true },
    material_content: ['Le texte à corriger, fourni par la personne.']
  };
  const { executeRole, appels } = executeur({ core: sortieCore({}) });
  await runCoreFirstTurn(avecMateriau, { executeRole });
  const recu = JSON.parse(CORE_ROLE_DEFINITIONS.core.buildUserMessage(appels[0].input));
  assert.equal(recu.material_context.deep_content_available, true, 'la disponibilité arrive au Core');
  assert.ok(Array.isArray(recu.material_content) && recu.material_content.length === 1, 'le contenu arrive au Core');
  assert.match(CORE_SYSTEM_PROMPT, /une information qui y figure réellement N'EST PAS manquante|material_content EST le canal/);
});

/* ==========================================================================
 * V2-09 / V2-10 / V2-11 / V2-12 — L'ESCALADE, ET SES BORNES
 * ======================================================================= */

test('V2-09 : une contradiction constatée peut déclencher le Critique', async () => {
  const escalade = { needed: true, kind: 'UNRESOLVED_CONTRADICTION', reason: 'Deux exigences explicites s’excluent.' };
  const { executeRole, roles } = executeur({
    core: sortieCore({ issues: [conflit], escalation: escalade }),
    core_critic: { verdict: 'PASS', defect_blocks_delivery: false, divergence: null, corrected_turn: null }
  });
  const resultat = await runCoreFirstTurn(demande, { executeRole });
  assert.deepEqual(roles(), ['core', 'core_critic'], 'le Critique est appelé, l’Arbitre non');
  assert.equal(resultat.escalation_verdict, 'ESCALATE');
  assert.equal(resultat.provider_calls, 2);
});

test('V2-10 : Core et Critique d’accord → aucun Arbitre', async () => {
  const escalade = { needed: true, kind: 'SELF_CHECK_FAILED', reason: 'Un défaut est resté non corrigé.' };
  const { executeRole, roles } = executeur({
    core: sortieCore({ escalation: escalade }),
    core_critic: { verdict: 'PASS', defect_blocks_delivery: false, divergence: null, corrected_turn: null }
  });
  const resultat = await runCoreFirstTurn(demande, { executeRole });
  assert.equal(roles().includes('core_arbiter'), false, 'rien à arbitrer : pas d’Arbitre');
  assert.equal(resultat.calls.core_arbiter, 0);
  /* Un Critique qui corrige lui-même ne convoque personne non plus. */
  const corrige = tour({ state: 'confirmation_required' });
  corrige.confirmation_reason = 'Plusieurs ambiguïtés importantes ont été résolues.';
  const second = executeur({
    core: sortieCore({ escalation: escalade }),
    core_critic: { verdict: 'CORRECT', defect_blocks_delivery: true, divergence: null, corrected_turn: corrige }
  });
  const apresCorrection = await runCoreFirstTurn(demande, { executeRole: second.executeRole });
  assert.deepEqual(second.roles(), ['core', 'core_critic']);
  assert.equal(apresCorrection.turn.state, 'confirmation_required', 'la correction est celle qui sort');
});

test('V2-11 : divergence substantielle → Arbitre autorisé', async () => {
  const escalade = { needed: true, kind: 'INCOMPATIBLE_EXPLICIT_REQUIREMENTS', reason: 'Deux exigences explicites s’excluent.' };
  const tranche = tour({ state: 'blocked' });
  const { executeRole, roles } = executeur({
    core: sortieCore({ issues: [conflit], escalation: escalade }),
    core_critic: { verdict: 'ESCALATE_TO_ARBITER', defect_blocks_delivery: true,
                   divergence: 'Le tour déclare prêt ce que le Critique juge contradictoire.', corrected_turn: null },
    core_arbiter: tranche
  });
  const resultat = await runCoreFirstTurn(demande, { executeRole });
  assert.deepEqual(roles(), ['core', 'core_critic', 'core_arbiter']);
  assert.equal(resultat.provider_calls, 3, 'trois appels au maximum, et seulement sur preuve');
  assert.equal(resultat.turn.state, 'blocked');
});

test('V2-12 : l’Arbitre reçoit la divergence, pas une reprise du dossier', async () => {
  const escalade = { needed: true, kind: 'CONFLICTING_SOURCES_IN_MATERIAL', reason: 'Le matériau se contredit.' };
  const { executeRole, appels } = executeur({
    core: sortieCore({ escalation: escalade }),
    core_critic: { verdict: 'ESCALATE_TO_ARBITER', defect_blocks_delivery: true,
                   divergence: 'La divergence exacte, énoncée en une phrase.', corrected_turn: null },
    core_arbiter: tour({})
  });
  await runCoreFirstTurn(demande, { executeRole });
  const entree = appels.find((a) => a.role === 'core_arbiter').input;
  assert.deepEqual(Object.keys(entree).sort(), ['clarification_history', 'divergence', 'original_request', 'turn']);
  assert.equal(entree.divergence, 'La divergence exacte, énoncée en une phrase.');
  const message = JSON.parse(CORE_ROLE_DEFINITIONS.core_arbiter.buildUserMessage(entree));
  assert.equal(message.divergence, 'La divergence exacte, énoncée en une phrase.');
  /* Ni sortie de Critique complète, ni sortie d’Analyste : il n’y a rien à relire. */
  assert.equal('critic_output' in message, false);
  assert.equal('analyst_output' in message, false);
  assert.match(CORE_ROLE_DEFINITIONS.core_arbiter.systemPrompt, /Aucune reprise complète du dossier/);
});

test('V2-12b : une escalade sans preuve est refusée, sans appeler personne', async () => {
  /* C'est ici que « complexité = escalade » meurt : aucun de ces motifs n'existe dans la liste. */
  for (const kind of ['DEMANDE_COMPLEXE', 'DEMANDE_LONGUE', 'SUJET_IMPORTANT', 'BEAUCOUP_DE_PARAMETRES', null]) {
    assert.equal(assessEscalation({ needed: true, kind, reason: 'La demande est complexe.' }, tour({})),
      'REFUSED_UNKNOWN_KIND', `« ${kind} » n’est pas un constat`);
  }
  assert.equal(assessEscalation({ needed: true, kind: 'SELF_CHECK_FAILED', reason: null }, tour({})), 'REFUSED_NO_REASON');
  /* Poser une question coûte un demi-tour ; escalader coûte deux appels. Quand les deux sont
     possibles, questionner gagne — et ce n'est pas une préférence, c'est une arithmétique. */
  assert.equal(assessEscalation({ needed: true, kind: 'SELF_CHECK_FAILED', reason: 'x' },
    tour({ state: 'clarification_required', question: 'Combien de jours partez-vous ?' })), 'REFUSED_ASKING_IS_CHEAPER');
  /* Une contradiction qu'on ne sait pas nommer dans les issues n'en est pas une. */
  assert.equal(assessEscalation({ needed: true, kind: 'UNRESOLVED_CONTRADICTION', reason: 'x' }, tour({})),
    'REFUSED_NO_CONFLICT_DECLARED');
  assert.equal(assessEscalation({ needed: false, kind: null, reason: null }, tour({})), 'NO_ESCALATION');
  /* Et un refus ne coûte aucun appel : le Core reste seul. */
  const { executeRole, roles } = executeur({
    core: sortieCore({ escalation: { needed: true, kind: 'DEMANDE_COMPLEXE', reason: 'Trop de paramètres.' } })
  });
  const resultat = await runCoreFirstTurn(demande, { executeRole });
  assert.deepEqual(roles(), ['core']);
  assert.equal(resultat.escalation_verdict, 'REFUSED_UNKNOWN_KIND');
});

/* ==========================================================================
 * V2-13 / V2-14 — GÉNÉRICITÉ, ET PAS DE RÉPÉTITION
 * ======================================================================= */

test('V2-13 : aucun mot de domaine dans le plan Core', () => {
  const code = coreSource.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  for (const domaine of ['voyage', 'lisbonne', 'malaga', 'itinéraire', 'checklist', 'présentation',
                         'déménagement', 'réunion', 'cadeau', 'recette', 'hébergement']) {
    assert.equal(new RegExp(domaine, 'i').test(code), false, `« ${domaine} » n’a rien à faire dans le plan Core`);
  }
  /* La consigne elle-même n'illustre par aucun domaine : elle énonce des catégories. */
  for (const domaine of ['voyage', 'lisbonne', 'itinéraire', 'checklist']) {
    assert.equal(new RegExp(domaine, 'i').test(CORE_SYSTEM_PROMPT), false);
  }
  assert.match(CORE_SYSTEM_PROMPT, /Aucun vocabulaire, champ, règle ou question propre à un domaine particulier/);
});

test('V2-14 : la consigne interdit de reposer une question déjà traitée', () => {
  assert.match(CORE_SYSTEM_PROMPT, /il est interdit de reposer la même question ou une question portant sur le même choix/);
  assert.match(CORE_SYSTEM_PROMPT, /n'est pas déjà connue ni déjà résolue/);
});

/* ==========================================================================
 * V2-15 / V2-16 — L'ÉTAT ET LA SAISIE, CE QUE BETA-04 AVAIT ACQUIS
 * ======================================================================= */

test('V2-15 : l’état conversationnel survit à une réponse, et un seul écrivain le remet à zéro', () => {
  assert.equal((html.match(/function v11ForgetDialogue\(/g) || []).length, 1, 'un seul écrivain nommé');
  assert.equal((html.match(/state\.answers\s*=\s*\[\]/g) || []).length, 1, 'state.answers n’a qu’un écrivain');
  assert.match(html, /function oprieKeepFailedDialogue\(/, 'une panne profonde conserve le dialogue');
});

test('V2-16 : la touche Entrée vaut le clic', () => {
  assert.match(html, /key\s*===?\s*'Enter'/, 'la touche est gérée');
});

/* ==========================================================================
 * V2-17 — LE CHEMIN HISTORIQUE N'EST PLUS NOMINAL
 * ======================================================================= */

test('V2-17 : Analyste, Critique et Arbitre historiques ne sont plus appelés nominalement', async () => {
  /* La preuve est un compte : l'exécuteur ne connaît QUE le rôle `core`. S'il en partait un autre,
     l'exécuteur lèverait — donc ce test échouerait plutôt que de laisser passer un appel. */
  const { executeRole, roles } = executeur({ core: sortieCore({}) });
  const resultat = await runCoreFirstTurn(demande, { executeRole });
  for (const ancien of OPRIE_ROLES) {
    assert.equal(roles().includes(ancien), false, `${ancien} n’est pas appelé nominalement`);
    assert.equal(resultat.calls[ancien], 0, `ANALYST_CALL_NOMINAL = 0 vaut aussi pour ${ancien}`);
  }
  /* Les modules historiques RESTENT : un retour arrière ne se négocie pas. */
  assert.deepEqual([...OPERATIONAL_REQUEST_ROLE_SEQUENCE], ['analyst', 'critic', 'arbiter'],
    'la séquence historique existe toujours, intacte');
  assert.match(orchestrateur, /runOperationalRequestTurn\(input, \{ executeRole, log: stampedLog, trace \}\)/,
    'et elle reste atteignable');
  assert.deepEqual([...NOMINAL_PLANES], ['core', 'legacy']);
  assert.equal(DEFAULT_NOMINAL_PLANE, 'core', 'le défaut est V2');
  assert.equal(resolveNominalPlane({}), 'core');
  assert.equal(resolveNominalPlane({ ATELIER_NOMINAL_PLANE: 'legacy' }), 'legacy', 'le retour arrière est une variable');
  assert.throws(() => resolveNominalPlane({ ATELIER_NOMINAL_PLANE: 'autre' }), /ATELIER_NOMINAL_PLANE invalide/);
});

/* ==========================================================================
 * V2-18 / V2-19 — CE QUE V2 N'A PAS LE DROIT DE PERDRE
 * ======================================================================= */

test('V2-18 : une panne de fournisseur dégrade, elle ne rend pas un 502 muet', async () => {
  /* Invariant acquis du chemin historique, et il vaut ici mot pour mot. Seule une chaîne épuisée
     donne un état ; tout autre défaut remonte, parce qu'un bug de notre code ne doit jamais se
     déguiser en état produit. */
  const epuisee = Object.assign(new Error('chaîne épuisée'), { all_providers_failed: true, attempts: [] });
  const { executeRole } = executeur({ core: () => { throw epuisee; } });
  const resultat = await runCoreFirstTurn(demande, { executeRole });
  assert.equal(resultat.turn.state, 'degraded_state', 'un état public, pas une disparition');
  assert.equal(resultat.turn.role, 'core');
  assert.ok(resultat.turn.reason && resultat.turn.reason.length > 0, 'un motif est rendu');
  /* Neutre par construction : ni fournisseur nommé, ni statut HTTP, ni cause supposée. */
  for (const fuite of ['groq', 'anthropic', 'openai', '502', '429', 'timeout']) {
    assert.equal(new RegExp(fuite, 'i').test(resultat.turn.reason), false, `« ${fuite} » ne fuit pas`);
  }
  /* Un défaut de notre propre code, lui, remonte. */
  const bug = new TypeError('défaut de code');
  const second = executeur({ core: () => { throw bug; } });
  await assert.rejects(() => runCoreFirstTurn(demande, { executeRole: second.executeRole }), /défaut de code/);
});

test('V2-19 : les invariants d’atomicité de BETA-04 sont ceux de V2, pas une copie', () => {
  /* Une seule définition de l'atomicité dans tout le produit : le plan Core ne redéfinit ni le
     comptage des interrogations, ni les catalogues, ni la frontière d'affichage. */
  assert.equal(/function countInterrogations|function isAtomicQuestion|function guardDisplayedQuestion/.test(coreSource), false,
    'le plan Core ne réimplémente aucune mesure d’atomicité');
  assert.match(orchestrateur, /import \{ guardDisplayedQuestion \} from "\.\/solicitation-policy\.js"/);
  /* Et la frontière est traversée par les DEUX plans, pas seulement par l’historique. */
  const passages = orchestrateur.match(/applyDisplayGuardToTurn\(/g) || [];
  assert.ok(passages.length >= 3, 'la fonction, le chemin historique, le chemin V2');
});

/* ==========================================================================
 * V2-20 — LE COÛT D'UN TOUR EST OBSERVABLE
 * ======================================================================= */

test('V2-20 : le nombre d’appels fournisseur par tour est journalisé', async () => {
  const evenements = [];
  const { executeRole } = executeur({ core: sortieCore({}) });
  await runCoreFirstTurn(demande, { executeRole, log: (e) => evenements.push(e) });
  const cout = evenements.find((e) => e.event === 'v2_turn_cost');
  assert.ok(cout, 'un relevé de coût est émis à chaque tour');
  assert.equal(cout.provider_calls, 1);
  assert.equal(cout.core_calls, 1);
  assert.equal(cout.analyst_calls, 0);
  assert.equal(cout.plane, 'core');
  assert.equal(typeof cout.duration_ms, 'number');
  /* Le verdict du garde d'escalade est journalisé aussi : c'est lui qui explique un tour à 1 appel. */
  const garde = evenements.find((e) => e.event === 'v2_escalation_gate');
  assert.equal(garde.verdict, 'NO_ESCALATION');
  /* Aucun texte de la personne dans ces relevés : des compteurs, un état, des millisecondes. */
  for (const e of evenements) {
    assert.equal(JSON.stringify(e).includes(demande.original_request), false, 'aucun contenu utilisateur journalisé');
  }
});

/* ==========================================================================
 * V2-21 — LA SORTIE RICHE N'EST PAS TOUCHÉE. C'EST LA CONDITION DE V2.
 *
 * V2 = simplification du TRAITEMENT, pas du JSON. Le schéma `analyse-llm-v3-4` est produit par le
 * moteur Architecte, dans une plage gelée de l'artefact, par un appel qui existait déjà. Le plan
 * Core ne le connaît pas, ne le produit pas, et ne peut donc pas l'appauvrir.
 * ======================================================================= */

test('V2-21 : le contrat de sortie riche est intact, et hors de portée du plan Core', () => {
  /* Le schéma 3.4 est là, avec ses sept sections, et sa version est épinglée. */
  assert.match(html, /"\$id":"analyse-llm-v3-4"/, 'le schéma d’analyse existe toujours');
  assert.match(html, /"version":\{"type":"string","const":"3\.4"\}/, 'la version reste 3.4');
  for (const section of ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation',
                         'verification', 'apprentissage']) {
    assert.match(html, new RegExp(`"${section}"`), `la section ${section} est conservée`);
  }
  /* Et la richesse à l'intérieur : provenance, hypothèses, informations manquantes, rôle adaptatif,
     niveau d'architecture, composants retenus et écartés, contrôles finaux. */
  for (const champ of ['informations_manquantes', 'hypotheses_autorisees', 'hypotheses_interdites',
                       'role_adaptatif', 'niveau_architecture', 'composants_retenus', 'composants_ecartes',
                       'criteres_bloquants', 'controle_provenance', 'preference_proposable']) {
    assert.match(html, new RegExp(`"${champ}"`), `${champ} est conservé`);
  }
  /* Le plan Core n'en parle nulle part : il ne peut pas le simplifier par accident. */
  for (const marqueur of ['analyse-llm', '3.4', 'comprehension', 'apprentissage', 'composants_retenus']) {
    assert.equal(coreSource.includes(marqueur), false, `le plan Core ignore ${marqueur}`);
  }
});

/* ==========================================================================
 * CONTRATS DE FORME — ce qui rend un rôle V2 exécutable par le transport existant
 * ======================================================================= */

test('V2-22 : les trois rôles V2 respectent le contrat d’exécution des rôles', () => {
  for (const [nom, definition] of Object.entries(CORE_ROLE_DEFINITIONS)) {
    assert.equal(typeof definition.systemPrompt, 'string');
    assert.ok(definition.systemPrompt.trim().length > 0, `${nom} : consigne non vide`);
    assert.equal(typeof definition.buildUserMessage, 'function');
    assert.equal(typeof definition.parseOutput, 'function');
    const schema = typeof definition.schema === 'function' ? definition.schema({}) : definition.schema;
    assert.equal(schema.type, 'object', `${nom} : racine objet`);
    assert.equal(schema.additionalProperties, false, `${nom} : mode strict`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(),
      `${nom} : required == properties, exigé par les modes stricts des fournisseurs`);
  }
  /* Le schéma du Core DÉRIVE de celui de l'Arbitre : le candidat ne peut pas divergerr. */
  for (const champ of ARBITER_JSON_SCHEMA.required) {
    assert.deepEqual(CORE_JSON_SCHEMA.properties[champ], ARBITER_JSON_SCHEMA.properties[champ],
      `${champ} : forme identique à celle de l’Arbitre`);
  }
  assert.deepEqual(ESCALATION_VERDICTS.includes('ESCALATE'), true);
  assert.equal(ESCALATION_KINDS.length, 4, 'quatre constats, pas une famille ouverte');
  assert.deepEqual([...CORE_CRITIC_VERDICTS], ['PASS', 'CORRECT', 'ESCALATE_TO_ARBITER']);
});

test('V2-23 : une sortie Core non conforme est refusée, jamais rapprochée', () => {
  assert.throws(() => validateCoreOutput(null), /objet attendu/);
  assert.throws(() => validateCoreOutput({ ...sortieCore({}), inconnu: 1 }), /clés inattendues/);
  /* Un état illégal est refusé par le validateur de l'Arbitre, celui qui existait. */
  assert.throws(() => validateCoreOutput(sortieCore({ state: 'inventé' })));
  /* clarification_required sans question est refusé : l'incohérence ne passe pas. */
  const sansQuestion = sortieCore({ state: 'clarification_required' });
  assert.throws(() => validateCoreOutput(sansQuestion));
  /* Le Critique ne peut pas dire CORRECT sans rendre le tour corrigé. */
  assert.throws(() => validateCoreCriticOutput({ verdict: 'CORRECT', defect_blocks_delivery: true, divergence: null, corrected_turn: null }),
    /CORRECT exige un tour corrigé/);
  assert.throws(() => validateCoreCriticOutput({ verdict: 'ESCALATE_TO_ARBITER', defect_blocks_delivery: true, divergence: '  ', corrected_turn: null }),
    /exige une divergence énoncée/);
  assert.throws(() => validateCoreCriticOutput({ verdict: 'INVENTÉ', defect_blocks_delivery: false, divergence: null, corrected_turn: null }),
    /verdict inconnu/);
});
