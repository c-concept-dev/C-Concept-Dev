/* DEEP-PRODUCTION-BLOCKERS-01 — LE PLAFOND N'ÉTAIT PAS MESURÉ, ET IL COUPAIT L'ARBITRE.
 * ============================================================================
 *
 * Quatre tours sur onze du runtime final se sont terminés en degraded_state. Les quatre sur
 * l'Arbitre, les quatre en structured_output_invalid, les quatre à une sortie de EXACTEMENT 2048
 * jetons — la valeur de ROLE_MAX_OUTPUT_UNITS — avec stop_reason = "max_tokens".
 *
 * CE QUI EST GARDÉ ICI. Non pas « le plafond vaut 4096 » — un nombre ne se garde pas tout seul —
 * mais la chaîne complète : qu'une réponse coupée soit DÉTECTÉE plutôt que parsée de travers,
 * qu'elle soit classée comme un défaut de sortie structurée et non comme un désaccord sémantique,
 * qu'elle ne bascule sur aucun autre fournisseur, qu'elle ne fabrique aucun état — et que le
 * plafond couvre désormais, avec marge, ce que les rôles produisent réellement.
 *
 * LA VALEUR EST UNE MESURE. Les maxima cités viennent d'une campagne réelle documentée dans
 * evaluation/deep-production-blockers-01/ ; ils ne sont pas des vœux.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import groqWorker, {
  ROLE_PROVIDER_ORDER, STRUCTURED_STATUS,
  runRoleWithHaChain, runRoleWithAnthropic, resolveRoleProviderOrder
} from '../workers/groq/src/index.js';
import { FAILURE_CLASSES } from '../workers/shared/provider-ha.js';
import { createEmptyCandidate } from '../core/adn/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = fs.readFileSync(path.join(racine, 'workers/groq/src/index.js'), 'utf8');
const PREUVES = JSON.parse(fs.readFileSync(path.join(racine, 'evaluation/deep-production-blockers-01/output-ceiling.json'), 'utf8'));

const ENV = { ALLOWED_ORIGINS: 'https://atelier.example.com', ANTHROPIC_API_KEY: 'clef-serveur' };
const ORIGIN = 'https://atelier.example.com';

const analystOutput = () => ({
  operational_request_candidate: { ...createEmptyCandidate(), objective: 'O.' },
  provenance_records: [{ field: 'objective', value: 'O.', provenance: 'explicit_user_statement' }],
  issues: [], question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
});
const arbiterOutput = () => ({
  state: 'operational_request_ready', operational_request_candidate: { ...createEmptyCandidate(), objective: 'O.' },
  issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null },
  confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] }, reason: 'Motif.'
});
const criticGlobal = () => ({
  operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
  vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ''
});
const ENTREE = Object.freeze({
  analyst: { original_request: 'O.', clarification_history: [] },
  critic: { original_request: 'O.', clarification_history: [], analyst_output: analystOutput(), previous_vetoes: [] },
  arbiter: { original_request: 'O.', clarification_history: [], analyst_output: analystOutput(), critic_output: null }
});
const SORTIE = { analyst: analystOutput, critic: criticGlobal, arbiter: arbiterOutput };

/* Réponse Anthropic COUPÉE : le corps est bien formé, c'est stop_reason qui dit la vérité. */
const coupee = () => Response.json({ stop_reason: 'max_tokens', content: [], usage: { input_tokens: 3853, output_tokens: 4096 } });
const complete = (payload, nom) => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: nom, input: payload }], usage: { input_tokens: 3853, output_tokens: 2332 } });

function avecFetch(t, gestionnaire) {
  const appels = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    const corps = JSON.parse(options.body);
    appels.push({ hote: new URL(String(url)).host, plafond: corps.max_tokens, outil: corps.tools?.[0]?.name ?? null });
    return gestionnaire(corps);
  };
  return appels;
}
function silence(t) {
  const l = console.log, e = console.error;
  console.log = () => {}; console.error = () => {};
  t.after(() => { console.log = l; console.error = e; });
}

/* T-DPB01-01 — LE PLAFOND DEMANDÉ AU FOURNISSEUR EST BIEN CELUI QU'ON CROIT. */
test('T-DPB01-01 : les rôles génériques demandent 4096 jetons de sortie, pas 2048', async (t) => {
  silence(t);
  for (const role of ['analyst', 'arbiter']) {
    const appels = avecFetch(t, (corps) => complete(SORTIE[role](), corps.tools[0].name));
    await runRoleWithHaChain(role, ENTREE[role], ENV, { order: resolveRoleProviderOrder({}), log: () => {} });
    assert.equal(appels.length, 1, role);
    assert.equal(appels[0].plafond, 4096, `${role} : plafond transmis au fournisseur`);
    assert.equal(appels[0].hote, 'api.anthropic.com');
  }
  assert.match(WORKER, /const ROLE_MAX_OUTPUT_UNITS = 4096;/);
});

/* T-DPB01-02 — 4096 EST UNE MESURE, PAS UN ARRONDI.
 *
 * La garde tient sur les maxima RÉELLEMENT observés : si un lot futur allonge les sorties sans
 * relever le plafond, cette ligne casse avant la production. Et elle garde aussi l'argument du
 * choix — qu'un pas plus petit aurait été trop juste — parce que c'est cet argument, et non le
 * nombre, qui devra être rejugé le jour où la distribution changera. */
test('T-DPB01-02 : le plafond couvre le maximum mesuré, et le pas plus petit ne l’aurait pas fait', () => {
  const arb = PREUVES.sorties_mesurees.arbiter;
  const ana = PREUVES.sorties_mesurees.analyst;
  assert.equal(PREUVES.plafond_avant, 2048);
  assert.equal(PREUVES.plafond_apres, 4096);
  assert.equal(PREUVES.plafond_apres, PREUVES.plafond_avant * 2, 'un seul doublement');

  /* Le défaut était réel : l'Arbitre dépasse le vieux plafond, mesuré sans contrainte. */
  assert.equal(arb.max, 2805);
  assert.ok(arb.max > PREUVES.plafond_avant, 'l’Arbitre dépassait bel et bien 2048');
  assert.ok(arb.max < PREUVES.plafond_apres, 'et il tient sous 4096');

  /* La marge retenue est substantielle ; celle qu'aurait laissée 3072 ne l'était pas.
     C'est la justification du pas, vérifiée sur la mesure et non sur l'intention. */
  assert.ok((PREUVES.plafond_apres - arb.max) / arb.max > 0.4, 'plus de 40 % de marge à 4096');
  assert.ok((3072 - arb.max) / arb.max < 0.1, 'moins de 10 % de marge à 3072 : trop juste');

  /* L'Analyste ne dépassait pas 2048 — mais il n'en était qu'à 10 %. C'est la raison pour
     laquelle le plafond est resté UNIQUE : un plafond par rôle aurait laissé cette marge-là
     en place, c'est-à-dire la même faute en attente sur l'autre rôle. */
  assert.equal(ana.max, 1852);
  assert.ok(ana.max < PREUVES.plafond_avant);
  assert.ok((PREUVES.plafond_avant - ana.max) / ana.max < 0.11, 'marge de l’Analyste sous l’ancien plafond : 10 %');
});

/* T-DPB01-02b — LA CAMPAGNE DE CONTRÔLE, TELLE QU'ELLE S'EST PASSÉE.
 *
 * Vingt-six tours réels, cent six appels fournisseur, aucun épinglage. Le critère du lot est
 * binaire et c'est ici qu'il se lit. */
test('T-DPB01-02b : zéro troncature et zéro dégradation de plafond sur la campagne de contrôle', () => {
  const c = PREUVES.campagne_de_controle;
  assert.equal(c.plafond, 4096);
  assert.ok(c.tours >= 20, 'le contrôle porte sur au moins vingt tours réels');
  assert.equal(c.troncatures, 0, 'STRUCTURED_OUTPUT_INVALID_AT_LIMIT = 0');
  assert.equal(c.degrades, 0, 'DEGRADED_DUE_OUTPUT_LIMIT = 0');
  assert.deepEqual(c.finish_reason, { tool_use: c.appels_fournisseur },
    'chaque appel est allé au bout de sa structure : aucun stop_reason max_tokens');
  /* Les trois plafonds réellement demandés au fournisseur, et eux seuls. */
  assert.deepEqual(Object.keys(c.plafonds_demandes).map(Number).sort((a, b) => a - b), [1600, 2048, 4096]);
});

/* T-DPB01-03 — UNE RÉPONSE COUPÉE EST DÉTECTÉE, PAS DEVINÉE.
 *
 * C'est le cœur du défaut : sans cette détection, une structure incomplète partirait au parseur et
 * l'échec porterait un autre nom. Le fournisseur dit « max_tokens » ; on le prend au mot. */
test('T-DPB01-03 : stop_reason = max_tokens ⇒ structured_output_invalid / truncated, jamais un désaccord', async (t) => {
  silence(t);
  /* Au plus près du fournisseur : la coupure est nommée « truncated », et non rangée parmi les
     structures illisibles. C'est cette distinction qui a permis d'identifier le plafond plutôt que
     d'accuser le modèle. */
  avecFetch(t, () => coupee());
  const direct = await runRoleWithAnthropic('arbiter', ENTREE.arbiter, ENV).then(() => null, (e) => e);
  assert.ok(direct, 'une réponse coupée ne peut pas réussir');
  assert.equal(direct.failure_class, FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID);
  assert.equal(direct.structured_status, STRUCTURED_STATUS.TRUNCATED,
    'la troncature est nommée pour ce qu’elle est, pas confondue avec un schéma illisible');
  assert.match(direct.message, /interrompu la réponse \(max_tokens\)/);

  /* Un cran plus haut, la chaîne ne retient que l'énumération fermée — aucun détail libre ne
     remonte, invariant HA-02 préservé — et elle échoue fermée. */
  avecFetch(t, () => coupee());
  const chaine = await runRoleWithHaChain('arbiter', ENTREE.arbiter, ENV, { order: resolveRoleProviderOrder({}), log: () => {} })
    .then(() => null, (e) => e);
  assert.deepEqual(chaine.attempts, [{ provider: 'anthropic', failure_class: FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID }]);
  assert.equal(chaine.all_providers_failed, true);
});

/* T-DPB01-04 — AVANT / APRÈS, SUR LE MÊME CAS.
 *
 * Le seul écart entre les deux moitiés est le plafond que le fournisseur a respecté. Avant :
 * degraded_state. Après : JSON complet, validé, servi. */
test('T-DPB01-04 : le même tour dégrade sous l’ancien plafond et aboutit sous le nouveau', async (t) => {
  silence(t);
  /* AVANT — le fournisseur coupe à 2048, comme il l'a fait quatre fois en production. */
  avecFetch(t, (corps) => corps.tools[0].name === 'oprie_arbiter' ? coupee() : complete(SORTIE[corps.tools[0].name === 'oprie_analyst' ? 'analyst' : 'critic'](), corps.tools[0].name));
  const avant = await groqWorker.fetch(new Request('https://worker.example/operational-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ original_request: 'Rédige un accusé de réception.', clarification_history: [] })
  }), ENV).then((r) => r.json());
  assert.equal(avant.state, 'degraded_state');
  assert.equal(avant.role, 'arbiter');
  assert.equal('operational_request_ready' in avant, false, 'aucun READY fabriqué sous troncature');

  /* APRÈS — le fournisseur va au bout de sa structure : le tour rend un verdict. */
  avecFetch(t, (corps) => complete(SORTIE[corps.tools[0].name === 'oprie_analyst' ? 'analyst' : corps.tools[0].name === 'oprie_arbiter' ? 'arbiter' : 'critic'](), corps.tools[0].name));
  const apres = await groqWorker.fetch(new Request('https://worker.example/operational-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ original_request: 'Rédige un accusé de réception.', clarification_history: [] })
  }), ENV).then((r) => r.json());
  assert.equal(apres.state, 'operational_request_ready');
  assert.ok(apres.operational_request_candidate, 'la structure est complète, donc exploitable');
});

/* T-DPB01-05 — UNE TRONCATURE NE FAIT TOUJOURS BASCULER PERSONNE.
 *
 * Relever le plafond ne doit pas avoir rouvert une porte de repli : le plan profond reste
 * Anthropic seul, et un échec reste fermé. */
test('T-DPB01-05 : sous troncature, ni Groq ni OpenAI ne sont contactés, et aucun état n’est inventé', async (t) => {
  silence(t);
  const appels = avecFetch(t, () => coupee());
  const reponse = await groqWorker.fetch(new Request('https://worker.example/operational-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ original_request: 'O.', clarification_history: [] })
  }), { ...ENV, GROQ_API_KEY: 'g', 'OPenAI-API': 'o' });
  const corps = await reponse.json();
  assert.deepEqual([...new Set(appels.map((a) => a.hote))], ['api.anthropic.com']);
  assert.equal(appels.some((a) => /groq|openai/.test(a.hote)), false);
  assert.equal(corps.state, 'degraded_state');
  assert.deepEqual(Object.keys(corps).sort(), ['reason', 'role', 'state']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic'], 'le routage final est intact');
});

/* T-DPB01-06 — LE PLAFOND DU CRITIQUE N'A PAS ÉTÉ TOUCHÉ, ET C'EST DÉLIBÉRÉ. */
test('T-DPB01-06 : la capacité du Critique reste à 2048, mesurée non contraignante', () => {
  assert.match(WORKER, /global_max_completion_units: 2048,/);
  assert.equal(PREUVES.critic_ceiling_changed, false);
  /* Le Critique passe par son propre pipeline, avec ses propres plafonds (2048 pour la lecture
     globale, un budget dérivé pour les batches). La campagne de contrôle l'a mesuré : il reste
     loin de l'un comme de l'autre. Rien à corriger, donc rien de corrigé — et surtout aucune
     valeur touchée « pendant qu'on y était ». */
  assert.ok(PREUVES.sorties_mesurees.critic.max < 1600,
    'le Critique n’approche aucun de ses deux plafonds (1600 pour les batches, 2048 pour le global)');
});

/* T-DPB01-07 — AUCUN PROMPT N'A ÉTÉ RACCOURCI POUR TENIR DANS LE PLAFOND. */
test('T-DPB01-07 : les trois prompts sont intacts', () => {
  assert.equal(PREUVES.analyst_prompt_changed, false);
  assert.equal(PREUVES.critic_prompt_changed, false);
  assert.equal(PREUVES.arbiter_prompt_changed, false);
  /* Le noyau sémantique est vérifié à l'octet près par l'empreinte de l'artefact canonique,
     qui l'embarque verbatim : si un prompt bougeait, cette empreinte bougerait. */
  const html = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  assert.equal(PREUVES.html_canonique_sha256.length, 64);
  assert.equal(createHash('sha256').update(html).digest('hex'), PREUVES.html_canonique_sha256,
    'l’artefact canonique — donc le noyau sémantique qu’il embarque — est inchangé');
});
