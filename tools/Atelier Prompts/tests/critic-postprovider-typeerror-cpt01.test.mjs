/* CRITIC-POSTPROVIDER-TYPEERROR-01 — LE PROVIDER AVAIT RÉPONDU. C'EST APRÈS QUE ÇA CASSAIT.
 * ============================================================================
 *
 * Un tour sur vingt se terminait en HTTP 502 sans aucun état sémantique. Les trois appels du
 * Critique avaient pourtant RÉUSSI — finish_reason=tool_use, 262/950/1151 jetons, aucune troncature.
 * La levée était dans le TRAITEMENT de la sortie : une TypeError nue, non étiquetée, donc
 * programming_error — « défaut de NOTRE code » — donc fail-closed, donc 502.
 *
 * Localisée par exécution, pas par déduction : le message levé par
 * materializeSubstitutionReviewFromCandidates lorsque `candidates` n'est pas un objet des six
 * familles a une empreinte SHA-256 IDENTIQUE à celle de l'enregistrement terminal de production.
 * Cette empreinte est épinglée ci-dessous — c'est elle qui rattache ce fichier à l'incident réel.
 *
 * LA FAUTE N'ÉTAIT PAS LE REFUS, C'ÉTAIT SON ÉTIQUETTE. Dans le MÊME pipeline,
 * assembleSubstitutionReviews marquait déjà « une issue non couverte » comme violation de contrat
 * du modèle. « Six familles non rendues » ne l'était pas. Ces tests gardent la symétrie retrouvée,
 * et surtout ils gardent ce qu'il ne fallait pas perdre en la retrouvant : un VRAI défaut interne
 * doit rester programming_error et rester fail-closed.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import groqWorker, { runRoleWithHaChain, resolveRoleProviderOrder, ROLE_PROVIDER_ORDER } from '../workers/groq/src/index.js';
import {
  materializeSubstitutionReviewFromCandidates, assembleSubstitutionReviews, LADDER_ALTERNATIVE_VALUES
} from '../workers/shared/operational-request-core.js';
import { FAILURE_CLASSES, failureClassOf } from '../workers/shared/provider-ha.js';
import { createEmptyCandidate } from '../core/adn/index.js';

/* L'empreinte du message relevée dans l'enregistrement terminal du 502 de production. */
const EMPREINTE_502_PRODUCTION = 'c87a77f227cd55c53850573ae3568ecbce70af4f45dd758728f67a89a623b1a3';
const ORIGIN = 'https://atelier.example.com';
const ENV = { ALLOWED_ORIGINS: ORIGIN, ANTHROPIC_API_KEY: 'clef-serveur' };
const empreinte = (v) => createHash('sha256').update(v).digest('hex');

/* Une issue matérielle traitée par question : c'est elle qui ouvre un question_review_target,
   donc un batch, donc le chemin qui cassait. */
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
const candidatesCompletes = () => Object.fromEntries(LADDER_ALTERNATIVE_VALUES.map((t) => [t, {
  candidate_action: null, applicable: false, preserves_objective: false, requires_user_reserved_choice: false,
  contradicts_known_facts: false, produces_complete_deliverable: false, justification: 'non'
}]));

const repond = (payload, nom) => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: nom, input: payload }], usage: { input_tokens: 100, output_tokens: 262 } });
function silence(t) {
  const l = console.log, e = console.error;
  console.log = () => {}; console.error = () => {};
  t.after(() => { console.log = l; console.error = e; });
}
/** Sert un tour complet ; `batch` décide de ce que le fournisseur rend pour l'entrée de batch. */
function avecFournisseur(t, batch) {
  const hotes = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    hotes.push(new URL(String(url)).host);
    const corps = JSON.parse(options.body);
    const nom = corps.tools[0].name;
    if (nom === 'oprie_analyst') return repond(analystOutput(), nom);
    if (nom === 'critic_global') return repond(criticGlobal(), nom);
    if (nom === 'substitution_review_batch') return repond({ issue1: batch }, nom);
    return repond({ agreement: 'agree' }, nom);
  };
  return hotes;
}
const entreeCritic = () => ({ original_request: 'O.', clarification_history: [], analyst_output: analystOutput(), previous_vetoes: [] });

/* T-CPT01-01 — L'ORIGINE EXACTE, ÉPINGLÉE PAR SON EMPREINTE.
 *
 * C'est ce test qui rattache le fichier à l'incident : si le message change, le lien avec le 502
 * observé se perd, et il vaut mieux que ça casse ici que de croire garder autre chose. */
test('T-CPT01-01 : le message levé est celui, à l’octet près, de l’enregistrement terminal du 502', () => {
  for (const invalide of [undefined, null, [], 'x', {}, { research: {} }]) {
    const erreur = (() => { try { materializeSubstitutionReviewFromCandidates(invalide); return null; } catch (e) { return e; } })();
    assert.ok(erreur instanceof TypeError, `une entrée invalide doit être refusée : ${JSON.stringify(invalide)}`);
  }
  /* Le cas exact de production : `candidates` absent — donc zéro famille reçue. */
  const err = (() => { try { materializeSubstitutionReviewFromCandidates(undefined); return null; } catch (e) { return e; } })();
  assert.equal(empreinte(err.message), EMPREINTE_502_PRODUCTION,
    'l’empreinte du message doit rester celle observée en production');
  assert.match(err.message, /sortie provider contractuellement incomplète/);
});

/* T-CPT01-02 — LE REFUS EST MARQUÉ, ET SYMÉTRIQUE DE SON VOISIN DE PIPELINE. */
test('T-CPT01-02 : les deux violations de contrat du même pipeline portent le même marqueur', () => {
  const a = (() => { try { materializeSubstitutionReviewFromCandidates(undefined); return null; } catch (e) { return e; } })();
  const b = (() => { try { assembleSubstitutionReviews([{ issue_id: 'issue1' }], []); return null; } catch (e) { return e; } })();
  assert.equal(a.output_contract_violation, true, 'six familles non rendues');
  assert.equal(b.output_contract_violation, true, 'issue non couverte — marqué depuis CSR-01');
});

/* T-CPT01-03 — LA VALIDATION N'A PAS ÉTÉ RELÂCHÉE.
 *
 * Le correctif ne doit rien laisser passer de plus qu'avant : mêmes entrées refusées, et une
 * entrée complète toujours acceptée. */
test('T-CPT01-03 : exactement les mêmes entrées sont refusées, et une entrée conforme passe', () => {
  for (const invalide of [undefined, null, [], 'x', 42, {}, { research: {} },
                          Object.fromEntries(LADDER_ALTERNATIVE_VALUES.slice(0, 5).map((t) => [t, {}]))]) {
    assert.throws(() => materializeSubstitutionReviewFromCandidates(invalide), TypeError);
  }
  const revue = materializeSubstitutionReviewFromCandidates(candidatesCompletes());
  assert.deepEqual(Object.keys(revue.alternatives_reviewed).sort(), [...LADDER_ALTERNATIVE_VALUES].sort());
  assert.equal(revue.available_alternative, null, 'aucune alternative n’est fabriquée');
});

/* T-CPT01-04 — AVANT / APRÈS, SUR LE VRAI CHEMIN HTTP.
 *
 * Le fournisseur RÉUSSIT — c'est tout l'intérêt du cas — puis rend une entrée de batch sans
 * `candidates`. Avant : 502 muet. Après : un état OPRIE canonique. */
test('T-CPT01-04 : une entrée de batch sans candidates rend degraded_state 200, plus un 502', async (t) => {
  silence(t);
  const hotes = avecFournisseur(t, { justification: 'incomplet' });   // pas de `candidates`
  const reponse = await groqWorker.fetch(new Request('https://worker.example/operational-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ original_request: 'O.', clarification_history: [] })
  }), ENV);
  const corps = await reponse.json();
  assert.equal(reponse.status, 200, 'degraded_state est un état public : le tour a abouti');
  assert.equal(corps.state, 'degraded_state');
  assert.equal(corps.role, 'critic');
  assert.deepEqual(Object.keys(corps).sort(), ['reason', 'role', 'state'], 'DegradedRoleResult canonique');
  /* Aucun verdict fabriqué, aucun repli. */
  const brut = JSON.stringify(corps);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(brut.includes(interdit), false, interdit);
  }
  assert.deepEqual([...new Set(hotes)], ['api.anthropic.com']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic']);
});

/* T-CPT01-05 — LA CLASSE, AU NIVEAU DE LA CHAÎNE. */
test('T-CPT01-05 : la sortie provider incomplète est classée structured_output_invalid', async (t) => {
  silence(t);
  avecFournisseur(t, { justification: 'incomplet' });
  const erreur = await runRoleWithHaChain('critic', entreeCritic(), ENV, { order: resolveRoleProviderOrder({}), log: () => {} })
    .then(() => null, (e) => e);
  assert.ok(erreur, 'une sortie incomplète ne peut pas réussir');
  assert.deepEqual(erreur.attempts, [{ provider: 'anthropic', failure_class: FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID }]);
  assert.equal(erreur.all_providers_failed, true);
});

/* T-CPT01-06 — CONTRÔLE CAPITAL : UN VRAI DÉFAUT INTERNE RESTE FAIL-CLOSED.
 *
 * Le correctif ne doit pas avoir transformé « toute exception » en dégradation. Un rejet
 * structurel NON marqué — ceux que CSR-01 a délibérément laissés en programming_error — doit
 * continuer à échouer fermé et à rendre un 502 technique, jamais un état sémantique.
 *
 * Le fournisseur répond ici parfaitement ; c'est sa charge globale qui viole le contrat de sortie
 * sur un point non marqué. C'est le contre-exemple exact du § 23 : si ce test devenait vert avec un
 * degraded_state, le correctif aurait débordé de sa cause. */
test('T-CPT01-06 : un rejet structurel NON marqué reste fail-closed en 502, jamais dégradé', async (t) => {
  silence(t);
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    const nom = JSON.parse(options.body).tools[0].name;
    if (nom === 'oprie_analyst') return repond(analystOutput(), nom);
    if (nom === 'critic_global') { const g = criticGlobal(); delete g.vetoes; return repond(g, nom); }
    return repond({ issue1: { candidates: candidatesCompletes() } }, nom);
  };
  const erreur = await runRoleWithHaChain('critic', entreeCritic(), ENV, { order: resolveRoleProviderOrder({}), log: () => {} })
    .then(() => null, (e) => e);
  assert.ok(erreur, 'un rejet non marqué ne peut pas réussir');
  assert.equal(failureClassOf(erreur), FAILURE_CLASSES.PROGRAMMING_ERROR,
    'un rejet non marqué reste « défaut de notre code » — le correctif n’a pas tout converti');
  assert.equal(erreur.output_contract_violation, undefined, 'et il ne porte pas le marqueur');
  assert.equal(erreur.all_providers_failed, undefined, 'fail-closed : la chaîne relève l’erreur telle quelle');

  /* Et de bout en bout, le client reçoit bien un échec TECHNIQUE, pas un état OPRIE. */
  const reponse = await groqWorker.fetch(new Request('https://worker.example/operational-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ original_request: 'O.', clarification_history: [] })
  }), ENV);
  const corps = await reponse.json();
  assert.equal(reponse.status, 502);
  assert.equal(corps.error, 'operational_request_failure');
  assert.equal('state' in corps, false, 'aucun état sémantique sur un défaut interne');
});

/* T-CPT01-07 — AUCUNE EXCEPTION NON CLASSIFIÉE NE SORT DE CE CHEMIN.
 *
 * Le contrat du § 24 : une sortie provider structurellement invalide ne doit plus produire de
 * TypeError sans classe. On balaie les formes d'invalidité, pas un scénario. */
test('T-CPT01-07 : toute forme de batch invalide est classée, jamais laissée nue', async (t) => {
  silence(t);
  const formes = [
    ['candidates absent', { justification: 'x' }],
    ['candidates null', { candidates: null }],
    ['candidates tableau', { candidates: [] }],
    ['candidates primitif', { candidates: 'x' }],
    ['candidates vide', { candidates: {} }],
    ['familles partielles', { candidates: Object.fromEntries(LADDER_ALTERNATIVE_VALUES.slice(0, 3).map((t2) => [t2, {}])) }]
  ];
  for (const [nom, batch] of formes) {
    avecFournisseur(t, batch);
    const erreur = await runRoleWithHaChain('critic', entreeCritic(), ENV, { order: resolveRoleProviderOrder({}), log: () => {} })
      .then(() => null, (e) => e);
    assert.ok(erreur, nom);
    const classe = erreur.attempts?.[0]?.failure_class;
    assert.equal(classe, FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, `${nom} : classée`);
    assert.notEqual(classe, FAILURE_CLASSES.PROGRAMMING_ERROR, `${nom} : plus jamais « notre bug »`);
  }
});

/* T-CPT01-08 — CE QUI N'A PAS ÉTÉ TOUCHÉ, ET QUI RESTE VOLONTAIREMENT EN L'ÉTAT.
 *
 * assembleSubstitutionReviews porte trois autres assertions non marquées — identifiant inconnu,
 * collision, entrée invalide. Ce sont vraisemblablement la même classe de faute, mais aucune n'a
 * été observée en production, et CSR-01 avait tranché de les laisser fail-closed. Ce lot ne les
 * renverse pas sans preuve : il les inventorie pour que la décision reste visible. */
test('T-CPT01-08 : les assertions voisines non marquées sont inventoriées, pas modifiées', () => {
  const inconnu = (() => { try { assembleSubstitutionReviews([{ issue_id: 'issue1' }], [{ autre: {} }]); return null; } catch (e) { return e; } })();
  assert.ok(inconnu instanceof TypeError);
  assert.notEqual(inconnu.output_contract_violation, true,
    'identifiant inconnu : toujours NON marqué — décision CSR-01 inchangée, faute de reproduction');
  const collision = (() => { try { assembleSubstitutionReviews([{ issue_id: 'issue1' }], [{ issue1: { alternatives_reviewed: {} } }, { issue1: { alternatives_reviewed: {} } }]); return null; } catch (e) { return e; } })();
  assert.ok(collision instanceof TypeError);
  assert.notEqual(collision.output_contract_violation, true, 'collision : toujours NON marquée');
});
