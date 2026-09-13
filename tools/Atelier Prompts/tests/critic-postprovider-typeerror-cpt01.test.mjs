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
/* T-CPT01-06 — RÉVISÉ PAR DEEP-OUTPUT-ROBUSTNESS-01 : LE SPÉCIMEN N'EST PLUS NON MARQUÉ.
 *
 * CPT-01 avait choisi la charge globale incomplète comme exemple de rejet « non marqué », et écrit
 * que « le correctif n'a pas tout converti ». C'était exact, et volontaire. DEEP-HAIKU-FIT-01 a
 * ensuite mesuré ce reste : 7 appels de Critique global sur 14 rendaient une charge amputée, le
 * modèle s'arrêtant de lui-même bien en dessous de son plafond — jamais une troncature, jamais
 * notre code. Deux tours sur huit sont sortis en 502 sans aucun état OPRIE.
 *
 * CE QUI NE CHANGE PAS : la charge incomplète est toujours refusée, avec le même message, et aucun
 * état sémantique n'est fabriqué. CE QUI CHANGE : le refus est imputé au fournisseur, et le tour
 * aboutit à un état dégradé gouverné au lieu de se perdre. */
test('T-CPT01-06 : une charge globale incomplète est imputée au fournisseur et dégrade proprement', async (t) => {
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
  assert.ok(erreur, 'la charge incomplète est toujours refusée : aucun contrat n’a été relâché');
  assert.notEqual(failureClassOf(erreur), FAILURE_CLASSES.PROGRAMMING_ERROR,
    'ce n’est plus « défaut de notre code » : le fournisseur n’a pas honoré un schéma inchangé');

  /* Et de bout en bout, le tour aboutit à un état gouverné au lieu de disparaître. */
  const reponse = await groqWorker.fetch(new Request('https://worker.example/operational-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ original_request: 'O.', clarification_history: [] })
  }), ENV);
  const corps = await reponse.json();
  assert.equal(reponse.status, 200, 'plus de 502 sans état OPRIE');
  assert.equal(corps.state, 'degraded_state');
  assert.equal(corps.role, 'critic');
  const brut = JSON.stringify(corps);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(brut.includes(interdit), false, `aucun verdict fabriqué : ${interdit}`);
  }
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

/* T-CPT01-08 — CE QUI N'AVAIT PAS ÉTÉ TOUCHÉ, ET CE QUI L'A ÉTÉ DEPUIS.
 *
 * Ce test inventoriait trois assertions voisines non marquées — identifiant inconnu, collision,
 * entrée invalide — pour que la décision de les laisser fail-closed reste VISIBLE plutôt que tacite.
 * C'était sa raison d'être : « ce lot ne les renverse pas sans preuve ».
 *
 * UNTAGGED-ASSERT-FAMILY-02 a apporté la preuve. L'audit de provenance a établi que ces refus
 * portent sur `batchResults` — la sortie brute du fournisseur — et non sur un état interne ; ils
 * sont désormais marqués, avec messages inchangés. L'inventaire n'est donc pas supprimé : il est
 * DÉPLACÉ vers ce qui reste réellement en suspens, et il nomme le lot qui a tranché.
 *
 * Ce qui reste en suspens, et pourquoi : le doublon d'issue_id dans NOS cibles (dérivé de la sortie
 * Analyste par notre propre code) et la collision de familles de mergeCandidateGroups (provenance
 * non établie — fournisseur ou découpage). Aucune fixture ne les a tranchés. Ils restent nus. */
test('T-CPT01-08 : les voisins tranchés par UAF-02 sont marqués, ceux qui restent en suspens ne le sont pas', () => {
  /* Tranchés par UAF-02 : provenance fournisseur établie. */
  const inconnu = (() => { try { assembleSubstitutionReviews([{ issue_id: 'issue1' }], [{ autre: {} }]); return null; } catch (e) { return e; } })();
  assert.ok(inconnu instanceof TypeError);
  assert.equal(inconnu.output_contract_violation, true,
    'identifiant inconnu : marqué par UAF-02 — le fournisseur a rendu un id absent de nos cibles');
  const collision = (() => { try { assembleSubstitutionReviews([{ issue_id: 'issue1' }], [{ issue1: { alternatives_reviewed: {} } }, { issue1: { alternatives_reviewed: {} } }]); return null; } catch (e) { return e; } })();
  assert.ok(collision instanceof TypeError);
  assert.equal(collision.output_contract_violation, true, 'collision entre batches : marquée par UAF-02');

  /* TOUJOURS en suspens : provenance interne ou non établie. L'inventaire vit maintenant ici. */
  const cibleDouble = (() => { try { assembleSubstitutionReviews([{ issue_id: 'd' }, { issue_id: 'd' }], [{}]); return null; } catch (e) { return e; } })();
  assert.ok(cibleDouble instanceof TypeError);
  assert.notEqual(cibleDouble.output_contract_violation, true,
    'doublon dans NOS cibles : ce serait notre bug, jamais celui du modèle');
});
