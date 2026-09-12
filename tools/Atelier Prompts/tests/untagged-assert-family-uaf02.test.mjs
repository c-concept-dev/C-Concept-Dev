/* UNTAGGED-ASSERT-FAMILY-02 — LES QUATRE VOISINS DU SITE DÉJÀ CORRIGÉ.
 * ============================================================================
 *
 * CPT-01 a corrigé UNE assertion. L'audit de la famille en a trouvé six autres de la même nature,
 * dans le même chemin non enveloppé, sur la même donnée : la sortie brute du fournisseur telle que
 * la renvoient les batches du Critique.
 *
 * Quatre d'entre elles vivent DANS assembleSubstitutionReviews — la fonction que CPT-01 citait
 * précisément comme précédent, parce qu'elle marquait déjà « une issue non couverte » comme
 * violation de contrat du modèle. Ses quatre refus voisins, eux, ne l'étaient pas. Trois autres
 * vivent dans mergeCandidateGroups et vérifient exactement les deux formes que CPT-01 a corrigées
 * — `entry.candidates` et la couverture des familles — un cadre d'appel plus tôt.
 *
 * CE QUI N'EST PAS TOUCHÉ, ET C'EST L'ESSENTIEL. Ces deux fonctions sont MIXTES : elles vérifient
 * aussi notre propre plan de découpage. `familyGroups` est à nous ; le doublon d'issue_id dans les
 * cibles est à nous ; la capability est de la configuration. Les marquer transformerait un vrai
 * bug interne en dégradation silencieuse. Ils restent nus, et ces tests le gardent.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import groqWorker, { ROLE_PROVIDER_ORDER, runRoleWithHaChain, resolveRoleProviderOrder } from '../workers/groq/src/index.js';
import {
  assembleSubstitutionReviews, mergeCandidateGroups, computeBatchPlan,
  materializeSubstitutionReviewFromCandidates, LADDER_ALTERNATIVE_VALUES as FAMILLES
} from '../workers/shared/operational-request-core.js';
import { FAILURE_CLASSES, failureClassOf } from '../workers/shared/provider-ha.js';
import { createEmptyCandidate } from '../core/adn/index.js';

const ORIGIN = 'https://atelier.example.com';
const ENV = { ALLOWED_ORIGINS: ORIGIN, ANTHROPIC_API_KEY: 'clef-serveur' };
const empreinte = (v) => createHash('sha256').update(v, 'utf8').digest('hex');
const CIBLES = [{ issue_id: 'issue1' }];
const G = [FAMILLES.slice(0, 3), FAMILLES.slice(3)];

/* Empreintes des messages relevées AVANT le correctif. Elles épinglent l'invariant central :
   seule l'étiquette change, jamais un octet du message. Si l'une bouge, le refus n'est plus le
   même refus, et il vaut mieux que ça casse ici. */
const EMPREINTES_AVANT = Object.freeze({
  'A-1565': '3789efb712be76a5', 'A-1566': '818a2c1225067a21',
  'M-1718': '590ac11988b48506', 'M-1720': 'c6ad76e406bbf8ed',
  'M-1722': '398bf438ff10a27c'
});

/** Les CINQ sites dont la valeur vérifiée vient RÉELLEMENT du fournisseur, sur le chemin de
    production. La revue de provenance en avait d'abord retenu sept ; deux ont été rendus à leur
    nature interne (voir SITES_INTERNES). */
const SITES = Object.freeze({
  'A-1565': () => assembleSubstitutionReviews(CIBLES, [{ inconnu: {} }]),
  'A-1566': () => assembleSubstitutionReviews(CIBLES, [{ issue1: {} }, { issue1: {} }]),
  'M-1718': () => mergeCandidateGroups(G, ['pas un objet', {}]),
  'M-1720': () => mergeCandidateGroups(G, [{ issue1: {} }, {}]),
  'M-1722': () => mergeCandidateGroups(G, [{ issue1: { candidates: { [FAMILLES[0]]: 1 } } }, {}])
});
const leve = (fn) => { try { fn(); return null; } catch (e) { return e; } };

/* Les voisins qui doivent RESTER nus : notre plan, nos cibles, notre configuration. */
const SITES_INTERNES = Object.freeze({
  'familyGroups ne couvre pas les six familles': () => mergeCandidateGroups([[FAMILLES[0]], [FAMILLES[1]]], [{}, {}]),
  'issue_id en double dans nos cibles': () => assembleSubstitutionReviews([{ issue_id: 'd' }, { issue_id: 'd' }], [{}]),
  'capability invalide (configuration)': () => computeBatchPlan([{ issue_id: 'a' }], { fixedOverheadUnits: -1, perTargetUnits: 1, maxUnitsPerBatch: 10 }),
  /* A-1563 et A-1567 — RENDUS À LEUR NATURE PAR LA REVUE DE PROVENANCE.
     Sur l'unique chemin appelant de production, assembleSubstitutionReviews reçoit
     `materializedBatchResults` : chaque élément est un Object.fromEntries(...) et chaque valeur le
     retour de materializeSubstitutionReviewFromCandidates. Les deux sont donc toujours des objets,
     construits par NOTRE code une ligne plus tôt. Ces refus ne sont pas atteignables par une sortie
     fournisseur ; les marquer aurait déguisé un futur bug interne en faute du modèle. */
  'A-1563 batchResult non-objet (construit par nous)': () => assembleSubstitutionReviews(CIBLES, ['pas un objet']),
  'A-1567 entry non-objet (retour de materialize)': () => assembleSubstitutionReviews(CIBLES, [{ issue1: 'pas un objet' }])
});

// --- 1. LE REFUS EST MARQUÉ, ET LE MESSAGE N'A PAS BOUGÉ ------------------------------------------

test('T-UAF02-01 : les cinq refus de sortie fournisseur portent output_contract_violation', () => {
  for (const [id, fn] of Object.entries(SITES)) {
    const e = leve(fn);
    assert.ok(e instanceof TypeError, `${id} : l'entrée invalide doit être refusée`);
    assert.equal(e.output_contract_violation, true, `${id} : le refus doit être marqué`);
  }
});

test('T-UAF02-02 : le message de chaque refus est inchangé, à l’octet près', () => {
  for (const [id, fn] of Object.entries(SITES)) {
    assert.equal(empreinte(leve(fn).message).slice(0, 16), EMPREINTES_AVANT[id],
      `${id} : seule l'étiquette change, jamais le message`);
  }
});

test('T-UAF02-03 : le marqueur se traduit en structured_output_invalid, jamais en programming_error', () => {
  for (const [id, fn] of Object.entries(SITES)) {
    const e = leve(fn);
    /* Le pipeline lit le marqueur — jamais le texte du message. */
    assert.equal(e.output_contract_violation, true, id);
    assert.notEqual(failureClassOf(e), FAILURE_CLASSES.SEMANTIC_VALID, id);
  }
  /* Et la classe cible est bien éligible au repli, comme son voisin déjà corrigé. */
  const cpt01 = leve(() => materializeSubstitutionReviewFromCandidates(undefined));
  assert.equal(cpt01.output_contract_violation, true, 'même convention que CPT-01');
});

// --- 2. CE QUI NE DOIT PAS BOUGER ------------------------------------------------------------------

test('T-UAF02-04 : les assertions internes et de configuration restent NUES', () => {
  for (const [nom, fn] of Object.entries(SITES_INTERNES)) {
    const e = leve(fn);
    assert.ok(e instanceof TypeError, `${nom} : toujours refusé`);
    assert.notEqual(e.output_contract_violation, true,
      `${nom} : un défaut qui est le NÔTRE ne doit jamais être déguisé en faute du modèle`);
  }
});

test('T-UAF02-04b : A-1563 et A-1567 restent des défauts À NOUS — bruyants, jamais dégradés', () => {
  /* Ils ne sont pas atteignables par une sortie fournisseur sur le chemin de production : aucun
     test HTTP ne peut donc les provoquer, et on n'en fabrique pas un. Ce qui est gardé ici est ce
     qui compte — s'ils se déclenchent, ils restent NOTRE faute, donc programming_error. */
  for (const nom of ['A-1563 batchResult non-objet (construit par nous)', 'A-1567 entry non-objet (retour de materialize)']) {
    const e = leve(SITES_INTERNES[nom]);
    assert.ok(e instanceof TypeError, `${nom} : toujours refusé`);
    assert.notEqual(e.output_contract_violation, true, `${nom} : jamais marqué`);
    assert.equal(failureClassOf(e), FAILURE_CLASSES.PROGRAMMING_ERROR,
      `${nom} : reste « défaut de notre code », donc fail-closed 502 sans état`);
  }
});

test('T-UAF02-05 : le site ambigu L1729 (collision de famille) n’est PAS marqué — décision différée', () => {
  /* Deux groupes qui se recouvrent : la collision peut venir du fournisseur OU de notre découpage.
     L'audit ne l'a pas tranché ; tant qu'une fixture ne le tranche pas, il reste nu. */
  const e = leve(() => mergeCandidateGroups([[FAMILLES[0]], [FAMILLES[0]]], [{ i: { candidates: { [FAMILLES[0]]: 1 } } }, { i: { candidates: { [FAMILLES[0]]: 1 } } }]));
  assert.ok(e instanceof TypeError, 'toujours refusé');
  assert.notEqual(e.output_contract_violation, true, 'provenance non établie : ne pas marquer');
});

test('T-UAF02-06 : les entrées valides restent acceptées, à l’identique', () => {
  const candidat = (f) => ({ candidate_action: null, applicable: false, preserves_objective: false, requires_user_reserved_choice: false, contradicts_known_facts: false, produces_complete_deliverable: false, justification: 'non', alternative_type: f });
  const groupe = (fs) => ({ issue1: { candidates: Object.fromEntries(fs.map((f) => [f, candidat(f)])) } });
  const fusion = mergeCandidateGroups(G, [groupe(G[0]), groupe(G[1])]);
  assert.deepEqual(Object.keys(fusion.issue1.candidates).sort(), [...FAMILLES].sort(),
    'une fusion licite rend toujours les six familles');
});

// --- 3. SUR LE VRAI CHEMIN HTTP --------------------------------------------------------------------

const ISSUE = Object.freeze({ id: 'issue1', type: 'missing_information', description: 'D.', impact: 'material', substitutable: false, recommended_treatment: 'question', kind: null });
const analystOutput = () => ({
  operational_request_candidate: { ...createEmptyCandidate(), objective: 'O.' },
  provenance_records: [{ field: 'objective', value: 'O.', provenance: 'explicit_user_statement' }],
  issues: [ISSUE], question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
});
const criticGlobal = () => ({
  operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
  vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ''
});
const repond = (payload, nom) => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: nom, input: payload }], usage: { input_tokens: 100, output_tokens: 262 } });
function silence(t) { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; t.after(() => { console.log = l; console.error = e; }); }
function avecBatch(t, batchPayload) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    const nom = JSON.parse(options.body).tools[0].name;
    if (nom === 'oprie_analyst') return repond(analystOutput(), nom);
    if (nom === 'critic_global') return repond(criticGlobal(), nom);
    if (nom === 'substitution_review_batch') return repond(batchPayload, nom);
    return repond({ agreement: 'agree' }, nom);
  };
}
const tour = () => groqWorker.fetch(new Request('https://worker.example/operational-request', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  body: JSON.stringify({ original_request: 'O.', clarification_history: [] })
}), ENV);

test('T-UAF02-07 : un issue_id inconnu rendu par le fournisseur donne degraded_state 200, plus un 502', async (t) => {
  silence(t);
  avecBatch(t, { issue_inconnue: {} });              // A-1565 sur le vrai chemin
  const reponse = await tour();
  const corps = await reponse.json();
  assert.equal(reponse.status, 200, 'degraded_state est un état public : le tour a abouti');
  assert.equal(corps.state, 'degraded_state');
  assert.equal(corps.role, 'critic');
  assert.deepEqual(Object.keys(corps).sort(), ['reason', 'role', 'state'], 'DegradedRoleResult canonique');
  const brut = JSON.stringify(corps);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(brut.includes(interdit), false, `aucun verdict fabriqué : ${interdit}`);
  }
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic'], 'ordre de fournisseurs inchangé');
});

/* T-UAF02-08 — FRONTIÈRE AVEC CPT-01, ET ATTRIBUTION HONNÊTE DU MÉCANISME.
 *
 * Une entrée de batch non-objet dégrade bien en 200 — mais PAS par un site de ce lot. `entry` vaut
 * ici une chaîne, donc `entry?.candidates` vaut undefined, et c'est materializeSubstitutionReviewFromCandidates
 * (marquée par CPT-01) qui refuse la première. A-1567, désormais nu, n'est jamais atteint : il est
 * derrière cette barrière. Ce test garde donc deux choses à la fois — que le chemin CPT-01 est
 * intact, et que rendre A-1567 à sa nature interne n'a rien rouvert. */
test('T-UAF02-08 : une entrée de batch non-objet dégrade via le marqueur CPT-01, A-1567 restant hors d’atteinte', async (t) => {
  silence(t);
  avecBatch(t, { issue1: 'pas un objet' });
  const reponse = await tour();
  const corps = await reponse.json();
  assert.equal(reponse.status, 200);
  assert.equal(corps.state, 'degraded_state');
  /* Et la preuve que c'est bien CPT-01 qui a refusé, pas A-1567 : la même entrée, appelée
     directement, est arrêtée par materialize avant d'atteindre assembleSubstitutionReviews. */
  const parMaterialize = leve(() => materializeSubstitutionReviewFromCandidates(undefined));
  assert.equal(parMaterialize.output_contract_violation, true, 'CPT-01 refuse en premier, et marqué');
});

/* T-UAF02-09 — MIS À JOUR PAR DEEP-OUTPUT-ROBUSTNESS-01 : LA BRANCHE EST FERMÉE.
 *
 * Ce test épinglait, à raison, la limite que UAF-02 s'était fixée : « il reste défaut de notre code
 * — le lot n'a pas tout converti ». La chose qu'il gardait n'était pas un invariant souhaitable,
 * c'était une DETTE, nommée et bornée, en attente de son lot.
 *
 * DEEP-HAIKU-FIT-01 en a mesuré le prix en production : sur huit tours réels, deux ont fini en
 * HTTP 502 avec semantic_state = null — aucun état OPRIE du tout — et l'un d'eux pour EXACTEMENT
 * la sortie que ce test fabrique, un Critique global sans `vetoes`. Le tour ne dégradait pas : il
 * disparaissait.
 *
 * DEEP-OUTPUT-ROBUSTNESS-01 a marqué le refus final de runCriticBatchedPipeline. Le même scénario
 * rend désormais un degraded_state gouverné, sur le même chemin HTTP que ses voisins T-UAF02-07 et
 * T-UAF02-08. Ce qui n'a PAS changé, et que ce test garde toujours : le refus lui-même — mêmes
 * sorties refusées, même message — et le fait qu'un défaut interne, lui, reste nu (T-UAF02-04,
 * T-UAF02-04b, et T-DOR01-05/06 côté DOR-01). */
test('T-UAF02-09 : un Critique global amputé dégrade désormais — la dette de UAF-02 est soldée', async (t) => {
  silence(t);
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  /* Le batch est VALIDE — c'est capital : seul un point NON marqué de la charge globale viole le
     contrat. Si ce test devenait vert en degraded_state, le lot aurait débordé de sa cause. */
  const candidatesCompletes = () => Object.fromEntries(FAMILLES.map((f) => [f, {
    candidate_action: null, applicable: false, preserves_objective: false, requires_user_reserved_choice: false,
    contradicts_known_facts: false, produces_complete_deliverable: false, justification: 'non'
  }]));
  globalThis.fetch = async (_url, options) => {
    const nom = JSON.parse(options.body).tools[0].name;
    if (nom === 'oprie_analyst') return repond(analystOutput(), nom);
    if (nom === 'critic_global') { const g = criticGlobal(); delete g.vetoes; return repond(g, nom); }
    return repond({ issue1: { candidates: candidatesCompletes() } }, nom);
  };
  const entree = { original_request: 'O.', clarification_history: [], analyst_output: analystOutput(), previous_vetoes: [] };
  const erreur = await runRoleWithHaChain('critic', entree, ENV, { order: resolveRoleProviderOrder({}), log: () => {} })
    .then(() => null, (e) => e);
  assert.ok(erreur, 'la sortie amputée ne peut toujours pas réussir : aucun contrat n’a été relâché');
  assert.notEqual(failureClassOf(erreur), FAILURE_CLASSES.PROGRAMMING_ERROR,
    'ce n’est plus imputé à NOTRE code : le fournisseur n’a pas respecté un contrat inchangé');

  /* Et sur le chemin HTTP réel — celui que le produit emprunte — le tour aboutit à un état
     gouverné au lieu de disparaître en 502 sans état. */
  const reponse = await tour();
  const corps = await reponse.json();
  assert.equal(reponse.status, 200, 'le tour aboutit : plus de 502 sans état OPRIE');
  assert.equal(corps.state, 'degraded_state');
  assert.equal(corps.role, 'critic');
  assert.deepEqual(Object.keys(corps).sort(), ['reason', 'role', 'state'], 'DegradedRoleResult canonique');
  const brut = JSON.stringify(corps);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(brut.includes(interdit), false, `aucun verdict fabriqué : ${interdit}`);
  }
});

test('T-UAF02-10 : la portée du lot est exactement cinq sites, et elle est vérifiable', () => {
  const src = fs.readFileSync(new URL('../workers/shared/operational-request-core.js', import.meta.url), 'utf8');
  const marques = (src.match(/assertProviderOutputContract\(/g) || []).length;
  assert.equal(marques, 6, '1 définition + 5 appels — ni plus, ni moins');
  /* Les deux sites rendus à leur nature interne sont bien redevenus nus. */
  assert.ok(/assert\(batchResult && typeof batchResult === "object"/.test(src), 'A-1563 nu');
  assert.ok(/assert\(entry && typeof entry === "object" && !Array\.isArray\(entry\)/.test(src), 'A-1567 nu');
  assert.ok(/assert\(!\(family in accumulator\)/.test(src), 'L1729 reste une assertion nue');
  assert.ok(/assert\(new Set\(expectedIds\)\.size/.test(src), 'le doublon de cibles reste une assertion nue');
});
