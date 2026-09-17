/* OPTION C — UN REGISTRE PRODUIT EN AMONT DOIT ATTEINDRE CELUI QUI LE LIT.
 * ============================================================================
 *
 * CE QUE CINQ DEMANDES RÉELLES ONT MONTRÉ. « Je te laisse décider du reste » n'apparaissait dans
 * aucun contrat produit — ni comme délégation, ni comme décision, ni comme citation. Une absence de
 * budget y devenait « Budget non contraint ». Une date inconnue y devenait « le prochain samedi
 * disponible ». Le contrat lu par le moteur aval ne connaissait que deux registres, obligation et
 * hypothèse ; tout ce qui n'était ni l'un ni l'autre tombait dans le second, ou disparaissait.
 *
 * CE QUE L'AUDIT A ÉTABLI, ET QUI DÉPLACE LA CORRECTION. `canonicalBaseToEnvelopeInput()` aplatit
 * en projetant vers l'état ADN — c'est délibéré, documenté par ADN-CANON-02, et COMPENSÉ :
 * l'enveloppe attache la base canonique VERBATIM, justement pour que ces registres restent lisibles
 * en aval. La base était donc intacte, à côté du contrat. Le seul vrai point de perte était le
 * réducteur final, qui ne la regardait pas.
 *
 * CE QUE CE FICHIER ÉPROUVE. Que les registres existent en amont, qu'ils survivent dans l'enveloppe,
 * et — la seule preuve qui compte — qu'ils atteignent le contrat RÉELLEMENT LU. Une donnée conservée
 * dans l'ADN mais absente de ce contrat n'est pas transportée.
 *
 * CE QU'IL N'ÉPROUVE PAS, ET NE DOIT PAS. Que l'autorité remplisse ces champs. Le transport est une
 * condition nécessaire ; il ne fabrique rien, et ce fichier ne fabrique rien non plus.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mapOprieToCanonicalContract, canonicalBaseToEnvelopeInput, CANONICAL_SEMANTIC_FIELDS }
  from '../core/adn/oprie-canonical-mapping.js';
import { buildExecutionEnvelope } from '../core/adn/engine-adapters.js';

const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');

/* Les six registres du contrat, nommés par leur champ amont — jamais par un vocabulaire nouveau. */
const REGISTRES = Object.freeze({
  secondary_objectives: ['Un objectif secondaire'],
  priorities: ['Une priorité déclarée'],
  preferences: ['Une préférence déclarée'],
  delegated_decisions: ['Le reste est laissé à mon appréciation'],
  remaining_unknowns: ['Une inconnue conservée'],
  external_facts_to_research: ['Un fait à vérifier']
});

const candidat = (extra = {}) => ({
  objective: 'Un objectif.', expected_deliverable: 'Une forme de livrable.',
  secondary_objectives: [], confirmed_constraints: ['Une contrainte énoncée'],
  confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
  external_facts_to_research: [], assumptions_allowed: ['Une hypothèse'], remaining_unknowns: [],
  ...extra
});

/* Les noms du CANDIDAT ne sont pas tous ceux de la BASE : le mapper renomme deux familles. */
const versCandidat = (plein) => plein ? {
  secondary_objectives: REGISTRES.secondary_objectives,
  confirmed_priorities: REGISTRES.priorities,
  confirmed_preferences: REGISTRES.preferences,
  delegated_decisions: REGISTRES.delegated_decisions,
  remaining_unknowns: REGISTRES.remaining_unknowns,
  external_facts_to_research: REGISTRES.external_facts_to_research
} : {};

const sortie = (plein) => ({
  state: 'operational_request_ready',
  operational_request_candidate: candidat(versCandidat(plein)),
  objective_nature: 'production', request_focus: 'user_problem_or_goal', output_format: null,
  issues: [], next_question: null, confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'r'
});

const base = (plein = true) => mapOprieToCanonicalContract(sortie(plein),
  { request_id: 'adn-test', original_request: 'Une demande.' });

const enveloppe = (plein = true, { attacher = true } = {}) => buildExecutionEnvelope({
  canonical_base: attacher ? base(plein) : null,
  request: attacher ? undefined : 'Une demande.',
  provider_result: { source: 'none', decision: {
    etat_demande: 'exploitable', route: 'architecte', confiance: 'haute',
    raison_interne: 'r', question: null } }
});

/* LE CONSOMMATEUR RÉEL. La fonction vit dans l'artefact livré ; on l'y exécute telle qu'elle est
   servie, avec pour seules dépendances l'enveloppe et un runtime ADN qui ne fait rien. */
function contratLuParArchitecte(env) {
  const debut = html.indexOf('function adnRegistreTextes(');
  const fin = html.indexOf('function adnEnrichCanonicalWithArch(');
  assert.ok(debut !== -1 && fin > debut, 'le réducteur final est introuvable dans l’artefact');
  const contexte = { adpState: { lastEnvelope: env }, adnRuntime: () => ({}), console: { warn() {} } };
  vm.runInNewContext(html.slice(debut, fin) + ';this.resultat=adnCompactContractForArchitecte();', contexte);
  /* Le contexte `vm` a ses propres prototypes : une comparaison stricte y échouerait sur l'identité
     du realm, jamais sur le contenu. On rapatrie la valeur, sans rien en changer. */
  return JSON.parse(JSON.stringify(contexte.resultat));
}

/* ==========================================================================
 * T1 / T3 / T5 — CE QUE LA PREMIÈRE FRONTIÈRE FAIT VRAIMENT
 * ======================================================================= */

test('T-OPTC-01 : la base canonique porte les six registres, et l’enveloppe les conserve verbatim', () => {
  const b = base(true);
  assert.deepEqual(b.intent.delegated_decisions.map((x) => x.text), REGISTRES.delegated_decisions);
  assert.deepEqual(b.executability.remaining_unknowns.map((x) => x.text), REGISTRES.remaining_unknowns);
  assert.deepEqual(b.evidence.external_facts.map((x) => x.description), REGISTRES.external_facts_to_research);

  /* LA PROJECTION VERS L'ÉTAT ADN N'EST PAS LE POINT DE PERTE, et ce test le dit plutôt que de le
     supposer : elle aplatit — c'est son rôle — ET l'enveloppe attache la base entière à côté. */
  const projete = canonicalBaseToEnvelopeInput(b);
  assert.equal('delegated_decisions' in projete.intent, false, 'la projection ADN aplatit, c’est documenté');
  const env = enveloppe(true);
  assert.notEqual(env.canonical_base, null, 'la base voyage avec l’enveloppe');
  assert.deepEqual(env.canonical_base.intent.delegated_decisions.map((x) => x.text), REGISTRES.delegated_decisions);
  assert.deepEqual(env.canonical_base.executability.remaining_unknowns.map((x) => x.text), REGISTRES.remaining_unknowns);
});

/* ==========================================================================
 * T2 / T4 / T5 — LA SEULE PREUVE QUI COMPTE
 * ======================================================================= */

test('T-OPTC-02 : les six registres atteignent le contrat réellement lu en aval', () => {
  const contrat = contratLuParArchitecte(enveloppe(true));
  for (const [cle, attendu] of Object.entries(REGISTRES)) {
    assert.deepEqual(contrat[cle], attendu, `${cle} atteint le consommateur final`);
  }
});

test('T-OPTC-03 : ce qui arrive est ce qui a été écrit — aucune reformulation', () => {
  /* Le transport ne réécrit rien : octet pour octet, la valeur du candidat ressort inchangée. */
  const contrat = contratLuParArchitecte(enveloppe(true));
  const candidatSource = sortie(true).operational_request_candidate;
  assert.deepEqual(contrat.delegated_decisions, candidatSource.delegated_decisions);
  assert.deepEqual(contrat.remaining_unknowns, candidatSource.remaining_unknowns);
  assert.deepEqual(contrat.external_facts_to_research, candidatSource.external_facts_to_research);
  assert.deepEqual(contrat.priorities, candidatSource.confirmed_priorities);
  assert.deepEqual(contrat.preferences, candidatSource.confirmed_preferences);
});

/* ==========================================================================
 * T6 — LES REGISTRES RESTENT DISTINCTS
 * ======================================================================= */

test('T-OPTC-04 : aucun registre ne devient une obligation ni une hypothèse', () => {
  /* C'est le défaut mesuré : une délégation remplacée par des hypothèses, une absence devenue
     affirmation. Ce test interdit la conversion, dans les deux sens. */
  const contrat = contratLuParArchitecte(enveloppe(true));
  const textesObligations = (contrat.obligations || []).map((x) => x.text);
  const textesHypotheses = contrat.assumptions || [];
  for (const [cle, valeurs] of Object.entries(REGISTRES)) {
    for (const valeur of valeurs) {
      assert.equal(textesObligations.includes(valeur), false, `${cle} n’est pas devenu une obligation`);
      assert.equal(textesHypotheses.includes(valeur), false, `${cle} n’est pas devenu une hypothèse`);
    }
  }
  /* Et réciproquement : l'hypothèse produite en amont reste une hypothèse, seule dans sa case. */
  assert.deepEqual(contrat.assumptions, ['Une hypothèse']);
  assert.equal(contrat.obligations.length, 1, 'la contrainte énoncée reste la seule obligation');
});

/* ==========================================================================
 * T7 — UN REGISTRE VIDE N'ÉCRIT RIEN
 * ======================================================================= */

test('T-OPTC-05 : un registre vide ne produit aucun bruit contractuel', () => {
  const contrat = contratLuParArchitecte(enveloppe(false));
  for (const cle of Object.keys(REGISTRES)) {
    assert.equal(cle in contrat, false, `${cle} absent quand il n’y a rien à transporter`);
  }
  /* Le contrat historique est intact : mêmes clés, même ordre, aucune perte. */
  assert.deepEqual(Object.keys(contrat),
    ['version', 'request_id', 'obligations', 'quantities', 'assumptions',
     'output', 'locks', 'readiness', 'execution_policy', 'ethics']);
});

test('T-OPTC-06 : sans base attachée, le contrat reste exactement ce qu’il était', () => {
  /* Les chemins sans tour sémantique n'ont pas de base canonique. Rien n'est inventé pour eux. */
  const env = enveloppe(true, { attacher: false });
  assert.equal(env.canonical_base, null);
  const contrat = contratLuParArchitecte(env);
  for (const cle of Object.keys(REGISTRES)) assert.equal(cle in contrat, false, `${cle} non fabriqué`);
});

/* ==========================================================================
 * T8 / T9 — LA COUVERTURE SE PILOTE SUR LA DÉCLARATION, PAS SUR UNE LISTE À TENIR
 * ======================================================================= */

test('T-OPTC-07 : tout champ déclaré non perdable est soit projeté, soit lisible dans la base attachée', () => {
  /* CE TEST SE PILOTE SUR `CANONICAL_SEMANTIC_FIELDS` : un champ ajouté demain à cette constante est
     couvert d'office, sans qu'aucune liste ne soit à maintenir ici. Il énonce l'invariant réel de
     l'architecture — la sémantique ne doit pas DISPARAÎTRE ; elle a le droit d'être aplatie par la
     projection ADN tant que la base attachée la conserve. */
  const b = base(true);
  const env = enveloppe(true);
  const lire = (racine, chemin) => chemin.split('.').reduce((acc, cle) => (acc == null ? acc : acc[cle]), racine);
  for (const champ of CANONICAL_SEMANTIC_FIELDS) {
    assert.deepEqual(lire(env.canonical_base, champ), lire(b, champ),
      `${champ} reste lisible, à l’identique, dans la base attachée à l’enveloppe`);
  }
});

test('T-OPTC-08 : le réducteur final ne peut plus supprimer un registre en silence', () => {
  /* Le défaut était une omission de LECTURE : la base était là, le réducteur ne la regardait pas.
     Ce test garde la lecture elle-même, sur les octets servis. */
  const bloc = html.slice(html.indexOf('function adnCompactContractForArchitecte(){'),
    html.indexOf('function adnEnrichCanonicalWithArch('));
  assert.match(bloc, /env\.canonical_base/, 'le réducteur lit la base attachée');
  for (const cle of Object.keys(REGISTRES)) {
    assert.ok(bloc.includes(cle), `${cle} est nommé par le réducteur`);
  }
  /* Et l'en-tête qui accompagne le contrat annonce ce que le contrat porte réellement. */
  /* L'en-tête vit dans `makeEnvelope()` ; un autre bloc du fichier porte un titre voisin, on ancre
     donc sur l'injection elle-même plutôt que sur le titre. */
  const depart = html.indexOf('const adnBlock=adnContract?');
  const entete = html.slice(depart, html.indexOf('const readinessInstruction=', depart));
  assert.ok(entete.length > 0, 'l’en-tête du bloc ADN est introuvable');
  assert.equal(/verrous et limites/.test(entete), false, 'plus aucun registre annoncé sans exister');
  assert.match(entete, /DISTINCTS/);
});

/* ==========================================================================
 * T10 / T12 — CE QUE CE LOT NE TOUCHE PAS
 * ======================================================================= */

test('T-OPTC-09 : le transport n’a pas bougé une seule décision en amont de lui', () => {
  /* CE TEST A ÉTÉ ÉCRIT FAUX, PUIS CORRIGÉ, ET C'EST LA CORRECTION QUI VAUT D'ÊTRE DITE.
   *
   * Il comparait d'abord une enveloppe « registres pleins » à une enveloppe « registres vides », et
   * concluait à une régression quand la sélection des verrous différait. Elle diffère bien — le
   * verrou `provenance` se déclenche parce que `evidence.external_knowledge_needed` vaut true dès
   * qu'un fait externe existe. Mais ce comportement est ANTÉRIEUR à ce lot : il passe par
   * `canonicalBaseToEnvelopeInput`, que ce lot ne touche pas. Le test mesurait une différence
   * d'ENTRÉE et l'imputait au correctif.
   *
   * Ce qu'il faut garder est autre chose, et c'est vérifiable : les registres n'entrent JAMAIS dans
   * l'état ADN, donc rien en amont du réducteur ne peut en dépendre. */
  const env = enveloppe(true);
  const empreinteEtat = JSON.stringify(env.state);
  const empreinteVerrous = JSON.stringify(env.locks);
  for (const valeurs of Object.values(REGISTRES)) {
    for (const valeur of valeurs) {
      assert.equal(empreinteEtat.includes(valeur), false, `« ${valeur} » n’atteint jamais l’état ADN`);
      assert.equal(empreinteVerrous.includes(valeur), false, `« ${valeur} » n’atteint jamais la sélection des verrous`);
    }
  }
  /* Et le réducteur ne modifie AUCUNE des clés historiques : elles valent ce que le contrat portait. */
  const contrat = contratLuParArchitecte(env);
  const attendu = JSON.parse(JSON.stringify(env.contract));
  assert.deepEqual(contrat.obligations,
    attendu.obligations.map((x) => ({ text: x.text, source: x.source, mandatory: x.mandatory })));
  assert.deepEqual(contrat.assumptions, attendu.assumptions);
  assert.deepEqual(contrat.quantities, attendu.quantities);
  assert.deepEqual(contrat.output, attendu.output);
  assert.deepEqual(contrat.ethics, attendu.ethics);
  /* `execution_policy` est RECOPIÉE du contrat : ce lot ne la décide pas. Le harnais neutralise
     volontairement la porte de contractualisation pour isoler le réducteur — ce qui est mesuré ici
     est donc bien la recopie, et rien d'autre. */
  assert.deepEqual(contrat.execution_policy, attendu.execution_policy);
  assert.equal(contrat.readiness.state, 'contractualization');
});

/* ==========================================================================
 * T13 — AUCUNE AUTORITÉ, AUCUN APPEL
 * ======================================================================= */

test('T-OPTC-10 : le transport ne juge rien et n’appelle personne', () => {
  const bloc = html.slice(html.indexOf('function adnRegistreTextes('),
    html.indexOf('function adnEnrichCanonicalWithArch('));
  for (const interdit of ['fetch(', 'await ', 'Math.random', 'includes(\'', 'toLowerCase()']) {
    assert.equal(bloc.includes(interdit), false, `« ${interdit} » n’a rien à faire dans un transport`);
  }
  /* Aucun vocabulaire de domaine ne décide de quoi que ce soit dans ce lot. */
  for (const domaine of ['budget', 'samedi', 'voyage', 'ordinateur', 'sauvegarde', 'théâtre', 'mail']) {
    assert.equal(new RegExp(domaine, 'i').test(bloc), false, `« ${domaine} » interdit dans le transport`);
  }
});
