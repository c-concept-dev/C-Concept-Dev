/* OPRIE-CRITIC-B01B-FAILURE-CLASSIFICATION-01 — LE REJET ÉTAIT COMMUN, LE CLASSEMENT NE L'ÉTAIT PAS.
 * ============================================================================
 *
 * normalizeRoleIssues existe pour fermer le contournement B-01B « aux trois niveaux à la fois » :
 * Analyst.issues, Critic.missed_material_issues, Arbiter.issues. Le rejet était bien commun aux
 * trois. Sa CLASSIFICATION ne l'était pas — et c'est ce qui a produit, un tour sur vingt-six en
 * production, un 502 sans aucun état sémantique là où les deux autres rôles rendaient
 * degraded_state sur exactement la même violation.
 *
 * CE QUE CES TESTS GARDENT. D'abord que la règle n'a pas bougé d'un pouce : les mêmes combinaisons
 * sont refusées, avec le même message. Ensuite que les trois rôles sont désormais traités
 * identiquement — c'est l'invariant qui manquait. Enfin que rien de ce qui protégeait le client n'a
 * été relâché au passage : pas de READY fabriqué, pas de verdict inventé, pas de bascule, et une
 * issue légitime toujours acceptée.
 *
 * CE QU'ILS NE PRÉTENDENT PAS. Que tout rejet de validateCriticOutput soit un défaut de modèle.
 * Cette question, plus large, reste ouverte : ce lot ne corrige que l'incohérence prouvée.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import groqWorker, {
  ROLE_PROVIDER_ORDER, runRoleWithHaChain, resolveRoleProviderOrder
} from '../workers/groq/src/index.js';
import {
  validateAnalystOutput, validateArbiterOutput, validateCriticOutput,
  deriveCriticConsequences, TREATMENT_VALUES
} from '../workers/shared/operational-request-core.js';
import { FAILURE_CLASSES, FAILOVER_ELIGIBLE_CLASSES } from '../workers/shared/provider-ha.js';
import { createEmptyCandidate } from '../core/adn/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = fs.readFileSync(path.join(racine, 'workers/shared/operational-request-core.js'), 'utf8');
const ENV = { ALLOWED_ORIGINS: 'https://atelier.example.com', ANTHROPIC_API_KEY: 'clef-serveur' };
const ORIGIN = 'https://atelier.example.com';

/* L'issue exactement telle que la production l'a produite : traitée par question, non matérielle. */
const ISSUE_ILLEGALE = Object.freeze({ id: 'M-01', type: 'missing_information', description: 'D.', impact: 'non_material', substitutable: false, recommended_treatment: 'question', kind: null });
/* La même, rendue légale par le seul champ que B-01B contraint. */
const ISSUE_LEGALE = Object.freeze({ ...ISSUE_ILLEGALE, impact: 'material' });
/* Et une issue non matérielle parfaitement légitime — B-01B ne la concerne pas. */
const ISSUE_NON_MATERIELLE_LEGITIME = Object.freeze({ ...ISSUE_ILLEGALE, recommended_treatment: 'estimate' });

/* validateCriticOutput attend la forme DÉRIVÉE à neuf champs, celle que le pipeline lui passe —
   jamais la sortie globale brute. On emprunte donc le même chemin qu'elle. */
const validerCritic = (global) => validateCriticOutput(deriveCriticConsequences({ ...global, question_substitution_review: [] }));

const analyst = (issues = []) => ({
  operational_request_candidate: { ...createEmptyCandidate(), objective: 'O.' },
  provenance_records: [{ field: 'objective', value: 'O.', provenance: 'explicit_user_statement' }],
  issues, question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
});
const criticGlobal = (missed = []) => ({
  operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: missed },
  vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ''
});
const arbiter = (issues = []) => ({
  state: issues.length ? 'clarification_required' : 'operational_request_ready',
  operational_request_candidate: { ...createEmptyCandidate(), objective: 'O.' }, issues,
  next_question: issues.length ? { text: 'Q ?', targets_issue_id: issues[0].id, expected_progress: 'P.' } : { text: null, targets_issue_id: null, expected_progress: null },
  confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] }, reason: 'Motif.'
});

const repond = (payload, nom) => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: nom, input: payload }], usage: { input_tokens: 10, output_tokens: 10 } });
function silence(t) {
  const l = console.log, e = console.error;
  console.log = () => {}; console.error = () => {};
  t.after(() => { console.log = l; console.error = e; });
}
/** Sert un tour complet ; `fautif` désigne le rôle dont la sortie porte l'issue illégale. */
function avecTour(t, fautif, issue = ISSUE_ILLEGALE) {
  const hotes = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    hotes.push(new URL(String(url)).host);
    const nom = JSON.parse(options.body).tools[0].name;
    const role = nom === 'oprie_analyst' ? 'analyst' : nom === 'oprie_arbiter' ? 'arbiter' : 'critic';
    const charge = role === 'analyst' ? analyst(role === fautif ? [issue] : [])
      : role === 'arbiter' ? arbiter(role === fautif ? [issue] : [])
      : criticGlobal(role === fautif ? [issue] : []);
    return repond(charge, nom);
  };
  return hotes;
}
const tour = (corps = { original_request: 'O.', clarification_history: [] }) =>
  groqWorker.fetch(new Request('https://worker.example/operational-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(corps)
  }), ENV);

/* T-CB01-01 — LA RÈGLE N'A PAS BOUGÉ. C'est la première chose à prouver : on a corrigé le
 * classement d'un refus, pas le refus. */
test('T-CB01-01 : B-01B refuse exactement les mêmes combinaisons, avec le même message', () => {
  const attendu = /recommended_treatment="question" exige impact="material" \(B-01B\)/;
  assert.throws(() => validateAnalystOutput(analyst([ISSUE_ILLEGALE])), attendu);
  assert.throws(() => validateArbiterOutput(arbiter([ISSUE_ILLEGALE])), attendu);
  assert.throws(() => validerCritic(criticGlobal([ISSUE_ILLEGALE])), attendu);
  /* Et il n'y a toujours qu'une seule écriture de la règle, partagée par les trois rôles. */
  assert.equal((CORE.match(/exige impact="material" \(B-01B\)/g) || []).length, 1);
  assert.match(CORE, /if \(issue\.recommended_treatment === "question"\) \{/);
});

/* T-CB01-02 — CE QUI RESTE LÉGITIME LE RESTE. Une garde qui refuserait trop serait pire que
 * celle qu'on vient de corriger. */
test('T-CB01-02 : une issue conforme est toujours acceptée, matérielle ou non', () => {
  for (const [nom, valider, faire] of [
    ['analyst', validateAnalystOutput, analyst], ['arbiter', validateArbiterOutput, arbiter]]) {
    assert.doesNotThrow(() => valider(faire([ISSUE_LEGALE])), `${nom} : question + matériel`);
    assert.doesNotThrow(() => valider(faire([ISSUE_NON_MATERIELLE_LEGITIME])), `${nom} : non matériel sans question`);
  }
  assert.doesNotThrow(() => validerCritic(criticGlobal([ISSUE_LEGALE])));
  assert.doesNotThrow(() => validerCritic(criticGlobal([ISSUE_NON_MATERIELLE_LEGITIME])));
  /* Le traitement choisi pour l'issue légitime appartient bien au vocabulaire §9. */
  assert.ok(TREATMENT_VALUES.includes(ISSUE_NON_MATERIELLE_LEGITIME.recommended_treatment));
});

/* T-CB01-03 — L'INVARIANT QUI MANQUAIT : LES TROIS RÔLES, LE MÊME CLASSEMENT.
 *
 * C'est ce test qui aurait attrapé le défaut. Il ne nomme pas un rôle en particulier : il exige
 * que les trois se comportent identiquement sur la seule règle qu'ils partagent. */
test('T-CB01-03 : la même violation donne la même classe d’échec pour les trois rôles', async (t) => {
  silence(t);
  const entree = {
    analyst: { original_request: 'O.', clarification_history: [] },
    critic: { original_request: 'O.', clarification_history: [], analyst_output: analyst(), previous_vetoes: [] },
    arbiter: { original_request: 'O.', clarification_history: [], analyst_output: analyst(), critic_output: null }
  };
  const classes = {};
  for (const role of ['analyst', 'critic', 'arbiter']) {
    avecTour(t, role);
    const erreur = await runRoleWithHaChain(role, entree[role], ENV, { order: resolveRoleProviderOrder({}), log: () => {} })
      .then(() => null, (e) => e);
    assert.ok(erreur, `${role} : une sortie violant B-01B ne peut pas réussir`);
    classes[role] = erreur.attempts?.[0]?.failure_class ?? 'NON_ÉTIQUETÉE';
  }
  assert.deepEqual(classes, {
    analyst: FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID,
    critic: FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID,
    arbiter: FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID
  });
  /* Et jamais programming_error : le validateur a raison de refuser, ce n'est pas notre bug. */
  assert.equal(Object.values(classes).includes(FAILURE_CLASSES.PROGRAMMING_ERROR), false);
});

/* T-CB01-04 — LA CLASSE RETENUE EST CELLE QUE LA TAXONOMIE DÉCRIT, mot pour mot. */
test('T-CB01-04 : structured_output_invalid est la classe contractuelle d’un refus de validation structurelle', () => {
  const taxo = fs.readFileSync(path.join(racine, 'workers/shared/provider-ha.js'), 'utf8');
  assert.match(taxo, /STRUCTURED_OUTPUT_INVALID[\s\S]{0,400}sortie refusée par la validation structurelle/);
  assert.match(taxo, /STRUCTURED_OUTPUT_INVALID[\s\S]{0,500}défaut de\s*\n?\s*\*\s*CE modèle sur CET appel/);
  assert.match(taxo, /PROGRAMMING_ERROR\s*:\s*défaut de notre propre code/);
  /* Le marqueur est posé par le validateur partagé, jamais deviné par inspection de message. */
  assert.match(CORE, /output_contract_violation: true/);
  assert.equal(CORE.includes('function assertRoleIssueContract'), true);
});

/* T-CB01-05 — CE QUE LE CLIENT REÇOIT : un état OPRIE, plus un 502 muet. */
test('T-CB01-05 : le client reçoit degraded_state canonique, jamais un 502 sans état', async (t) => {
  silence(t);
  for (const role of ['analyst', 'critic', 'arbiter']) {
    avecTour(t, role);
    const reponse = await tour();
    const corps = await reponse.json();
    assert.equal(reponse.status, 200, `${role} : degraded_state est un état public, le tour a abouti`);
    assert.equal(corps.state, 'degraded_state', role);
    assert.equal(corps.role, role);
    assert.deepEqual(Object.keys(corps).sort(), ['reason', 'role', 'state'],
      'DegradedRoleResult canonique — aucune forme inventée');
  }
});

/* T-CB01-06 — RIEN N'A ÉTÉ RELÂCHÉ EN CHEMIN : ni verdict, ni bascule. */
test('T-CB01-06 : aucun READY fabriqué, aucun verdict inventé, aucun fournisseur de repli', async (t) => {
  silence(t);
  const hotes = avecTour(t, 'critic');
  const reponse = await tour();
  const brut = JSON.stringify(await reponse.json());
  for (const interdit of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(brut.includes(interdit), false, `un tour dégradé ne porte jamais "${interdit}"`);
  }
  assert.deepEqual([...new Set(hotes)], ['api.anthropic.com']);
  assert.equal(hotes.some((h) => /groq|openai/.test(h)), false, 'ni Groq ni OpenAI');
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic'], 'le routage final est intact');
});

/* T-CB01-07 — LA CLASSE EST ÉLIGIBLE À LA BASCULE, ET C'EST VOULU.
 *
 * Le plan profond n'a qu'un fournisseur, donc rien ne bascule aujourd'hui. Mais l'éligibilité est
 * le sens même de la classe : une sortie structurellement refusée est un défaut de CET appel, pas
 * un désaccord de contenu — seul SEMANTIC_VALID interdit formellement le model shopping. */
test('T-CB01-07 : la classe est celle que la chaîne sait traiter, sans rouvrir le model shopping', () => {
  assert.ok(FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID));
  assert.equal(FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.SEMANTIC_VALID), false,
    'un résultat techniquement valide ne bascule jamais : c’est là qu’est la frontière');
  assert.equal(FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.PROGRAMMING_ERROR), false);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic'],
    'et de toute façon le plan profond n’a personne vers qui basculer');
});

/* T-CB01-08 — LE CHEMIN NOMINAL N'A PAS BOUGÉ. */
test('T-CB01-08 : un tour dont toutes les issues sont conformes aboutit normalement', async (t) => {
  silence(t);
  avecTour(t, 'aucun');
  const reponse = await tour();
  const corps = await reponse.json();
  assert.equal(reponse.status, 200);
  assert.equal(corps.state, 'operational_request_ready');
  assert.ok(corps.operational_request_candidate);
});
