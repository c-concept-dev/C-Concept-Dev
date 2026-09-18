/* ATELIER PROMPTS V2.2 — UN CHEF, DES MUSICIENS, UNE SEULE PARTITION.
 * ============================================================================
 *
 * CE QUE LA MESURE A ÉTABLI, ET C'EST LA CAUSE RACINE. La doctrine de clarification — échelle de
 * substitution, test de matérialité, priorité entre les manques — était écrite dans TROIS modules :
 * la consigne du plan rapide, celle du plan profond, et celles du trio historique. Comptage réel
 * avant ce lot, sur le mot « substituab » : 1 occurrence dans le worker, 4 dans le plan Core, 9 dans
 * le contrat OPRIE. Trois rédactions d'une même règle, trois occasions de divergence, et aucun
 * propriétaire identifiable.
 *
 * Ce n'était pas deux composants qui se contredisaient : c'était une règle recopiée que personne ne
 * possédait. La cacophonie décisionnelle a cette forme-là, et elle ne se corrige pas en ajoutant un
 * arbitre — elle se corrige en supprimant les copies.
 *
 * CE QUE V2.2 FAIT. La doctrine vit désormais UNE fois, dans le module qui EST OPRIE, et les deux
 * plans vivants l'incluent : le rapide l'applique vite, le profond l'applique à fond. Une seule
 * direction sémantique, deux vitesses d'exécution. La part qui gouverne le candidat reste hors du
 * plan rapide, qui n'en produit aucun.
 *
 * CE QUE V2.2 SUPPRIME. La conversion de silence introduite en V2.1.5.3 — une couche de fluidité qui
 * concluait que la clarification était terminée — et le jugement de matérialité que la couche de
 * réparation portait dans sa correction. Deux décisions retirées, zéro ajoutée.
 *
 * CE QUE V2.2 NE FAIT PAS, ET POURQUOI. Aucun composant nouveau, aucun moteur de matérialité, aucun
 * routeur, aucune représentation canonique parallèle. Le client n'est pas touché : la branche qui
 * s'arrête quand une question est posée reste légitime dès lors que la question appliquait la
 * doctrine du chef — et elle évite le plan profond « au cas où », que ce lot interdit.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  OPRIE_CLARIFICATION_DOCTRINE, OPRIE_ASSUMPTION_DOCTRINE,
  validateArbiterOutput, ANALYST_SYSTEM_PROMPT, CRITIC_GLOBAL_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT
} from '../workers/shared/operational-request-core.js';
import { CORE_SYSTEM_PROMPT, validateCoreOutput } from '../workers/shared/core-first-plane.js';
import {
  FAST_INTERACTION_SYSTEM_PROMPT, FAST_CORRECTIONS, FAST_PROVIDER_ORDER,
  CORE_PROVIDER_ORDER, ROLE_PROVIDER_ORDER
} from '../workers/groq/src/index.js';
import { FAST_INTERACTION_JSON_SCHEMA, FAST_INTERACTION_TYPES } from '../workers/shared/fast-interactive-plane.js';
import { guardFastInteraction, SILENT_INTERACTION, SOLICITATION_VERDICTS } from '../workers/shared/solicitation-policy.js';
import { buildAdnState } from '../core/adn/adn-state.js';

/* TARGETED-FIX-POST-CODEX-01 — le contrat du plan rapide compte un QUATRIÈME champ nommé :
   l'identité du manque. Le contre-audit a démontré qu'une question rapide répondue laissait
   l'historique sans identité, si bien qu'une reformulation ultérieure du même manque par le plan
   profond n'était plus reconnue. L'invariant gardé ici est inchangé — le schéma reste clos et
   incapable de porter un état ; il s'allonge d'un fait produit par la même décision. */

const lire = (f) => fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const contratOprie = lire('../workers/shared/operational-request-core.js');
const planCore = lire('../workers/shared/core-first-plane.js');
const worker = lire('../workers/groq/src/index.js');
const politique = lire('../workers/shared/solicitation-policy.js');
const etatAdn = lire('../core/adn/adn-state.js');
const html = lire('../atelier-prompts-v11.5-lot10g-decision-provider.html');

/* Les phrases distinctives de la doctrine : si l'une d'elles est écrite ailleurs qu'à l'autorité,
   c'est une copie, et la cacophonie est de retour. */
const PHRASES_DOCTRINE = Object.freeze([
  'TEST DE MATÉRIALITÉ — il OUVRE la question',
  'PLUSIEURS MANQUES, UNE SEULE QUESTION',
  'Ne jugez JAMAIS par catégorie',
  'Demander une précision est le dernier recours, jamais le premier',
  'Pour savoir si ce recours est atteint'
]);

/* ==========================================================================
 * V22-01 — UNE SEULE AUTORITÉ PRODUIT READY
 * ======================================================================= */

test('V22-01 : une seule frontière peut prononcer un état, et ce n’est ni Fast, ni le garde, ni la reprise, ni l’ADN', () => {
  /* L'état est prononcé par le validateur du contrat OPRIE, et par lui seul. On le prouve en
     l'exécutant : une sortie prête y passe, une sortie prête mais incohérente y est refusée. */
  const tour = {
    state: 'operational_request_ready',
    operational_request_candidate: {
      objective: 'o', expected_deliverable: 'd', secondary_objectives: [], confirmed_constraints: [],
      confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
      external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
    },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'r'
  };
  assert.equal(validateArbiterOutput(tour).state, 'operational_request_ready');
  assert.throws(() => validateArbiterOutput({ ...tour,
    intent_preservation: { ...tour.intent_preservation, concerns: ['Réserve.'] } }),
    /operational_request_ready exige une liste concerns vide/);

  /* LE PLAN RAPIDE EST INCAPABLE DE PORTER UN ÉTAT — par son schéma, pas par convention. */
  /* V2.2.1-D2F1 — trois champs, et l'incapacité est intacte : question_focus dit ce qu'une question
     interroge, jamais un état, et son vocabulaire ne contient aucun nom d'état. */
  /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — la citation qui fonde une question est entrée au contrat ; ce n'est pas un champ d'autorité : elle ne prononce rien, elle atteste. */
  assert.deepEqual(Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties).sort(), ['explicit_unknown_determinant_ids', 'missing_determinant_evidence', 'missing_determinant_id', 'question_focus', 'text', 'type']);
  assert.equal(FAST_INTERACTION_TYPES.includes('operational_request_ready'), false);
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.properties.question_focus.enum.includes('operational_request_ready'), false);
  for (const source of [politique, worker]) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(/state\s*[:=]\s*["']operational_request_ready["']/.test(code), false,
      'ni la couche rapide ni le garde ne fabriquent un état prêt');
  }
  /* L'ADN ne prononce pas d'état non plus : il dérive celui qu'il reçoit (ORCH01-21b). */
  const codeAdn = etatAdn.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/operational_request_ready/.test(codeAdn), false);
});

/* ==========================================================================
 * V22-02 — UNE SEULE SOURCE DE LA DÉCISION DE QUESTION
 * ======================================================================= */

test('V22-02 : la doctrine de clarification n’est écrite qu’à un seul endroit', () => {
  /* Elle existe chez son propriétaire. */
  for (const phrase of PHRASES_DOCTRINE) {
    assert.ok(OPRIE_CLARIFICATION_DOCTRINE.includes(phrase), `la doctrine énonce : ${phrase}`);
  }
  /* Et NULLE PART ailleurs en dur : les deux plans l'incluent par référence. C'est la preuve de
     l'unicité, et elle est structurelle — pas une promesse de commentaire. */
  const sansDoctrine = contratOprie.split(OPRIE_CLARIFICATION_DOCTRINE).join('');
  for (const phrase of PHRASES_DOCTRINE) {
    assert.equal(sansDoctrine.includes(phrase), false,
      `« ${phrase} » ne doit exister qu'une fois dans le module propriétaire`);
    assert.equal(worker.includes(phrase), false, `le worker ne recopie pas : ${phrase}`);
    assert.equal(planCore.includes(phrase), false, `le plan Core ne recopie pas : ${phrase}`);
  }
  /* Les deux plans la reçoivent pourtant en entier. */
  assert.ok(FAST_INTERACTION_SYSTEM_PROMPT.includes(OPRIE_CLARIFICATION_DOCTRINE));
  assert.ok(CORE_SYSTEM_PROMPT.includes(OPRIE_CLARIFICATION_DOCTRINE));
  /* Et le plan rapide le dit à son modèle : cette doctrine n'est pas la sienne. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /La doctrine ci-dessous n'est pas la vôtre/);
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /Votre apport est la FORME et la RAPIDITÉ/);
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /Vous ne décidez rien/);
});

test('V22-02b : la part qui gouverne le candidat reste hors du plan rapide', () => {
  /* Le plan rapide ne produit aucun candidat : lui donner la règle des hypothèses l'alourdirait sans
     rien lui permettre. Un propriétaire, deux audiences, aucune copie. */
  assert.ok(CORE_SYSTEM_PROMPT.includes(OPRIE_ASSUMPTION_DOCTRINE));
  assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.includes('UNE HYPOTHÈSE MATÉRIELLE NE SE FIGE PAS'), false);
  /* Et les responsabilités qui ne sont pas les siennes ne lui sont pas nommées. */
  for (const ailleurs of ['READY', 'livrable', 'quality gate', 'contrat canonique', 'Analyste', 'Critique', 'Arbitre']) {
    assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.includes(ailleurs), false,
      `le plan rapide ne se voit pas confier : ${ailleurs}`);
  }
});

/* ==========================================================================
 * V22-03 — LE GARDE NE JUGE QUE LA FORME
 * ======================================================================= */

test('V22-03 : le garde rejette une forme, il ne choisit pas une autre variable', () => {
  const snap = { original_request: 'Une demande quelconque à préparer.', clarification_history: [] };
  /* Deux besoins coordonnés : la forme est refusée, et ce qui sort vient MOT POUR MOT de l'entrée. */
  const deux = { type: 'ASK_CLARIFICATION', text: 'Quelle est la durée prévue et quel est le nombre de personnes ?' };
  const rendu = guardFastInteraction(deux, snap);
  if (rendu.type !== SILENT_INTERACTION.type) {
    const mots = rendu.text.replace(/\s*\?$/, '').split(/\s+/);
    for (const mot of mots) {
      assert.ok(deux.text.includes(mot), `« ${mot} » vient de la question d'origine`);
    }
    assert.equal((rendu.text.match(/\?/g) || []).length, 1);
  }
  /* Le garde n'a AUCUN vocabulaire de matérialité : ses verdicts sont des constats de forme et
     d'hygiène, jamais un classement d'importance. */
  assert.equal(SOLICITATION_VERDICTS.includes('MORE_IMPORTANT'), false);
  const codePolitique = politique.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const mot of ['matériel', 'materiel', 'substituab', 'readiness', 'prioritaire']) {
    assert.equal(new RegExp(mot, 'i').test(codePolitique), false,
      `le garde ne raisonne pas en « ${mot} »`);
  }
});

/* ==========================================================================
 * V22-04 — LA REPRISE CONSERVE L'IDENTITÉ SÉMANTIQUE
 * ======================================================================= */

test('V22-04 : la reprise répare la phrase, elle ne rechoisit pas le besoin', () => {
  const correction = FAST_CORRECTIONS.MULTIPLE_QUESTIONS;
  assert.match(correction, /Reprenez le PREMIER besoin que vous avez énoncé, sans en changer/);
  assert.match(correction, /N'en substituez aucun autre/);
  /* Et elle ne porte plus de jugement d'impact : c'était une décision du chef, prise par un
     réparateur. */
  assert.equal(/change le plus ce qui sera produit|le plus matériel|priorit/i.test(correction), false,
    'aucun jugement de matérialité dans la couche de réparation');
});

/* ==========================================================================
 * V22-05 à V22-08 — CE QUE LA DOCTRINE DIT, ET CE QU'ELLE NE DIT NULLE PART
 * ======================================================================= */

test('V22-05 / V22-07 : une demande exploitable et une inconnue de confort n’ouvrent aucune question', () => {
  assert.match(OPRIE_CLARIFICATION_DOCTRINE, /Si non, ne la posez pas, même si l'information manque/);
  assert.match(OPRIE_CLARIFICATION_DOCTRINE, /LA MÊME CHOSE AUTREMENT COLORÉE : ne demandez rien/);
  assert.match(OPRIE_CLARIFICATION_DOCTRINE, /deux préférences de goût, elles, donnent la même chose autrement colorée/);
  assert.match(OPRIE_CLARIFICATION_DOCTRINE, /Demander une précision est le dernier recours, jamais le premier/);
});

test('V22-06 : une inconnue matérielle est nommée par son impact, jamais par son étiquette', () => {
  assert.match(OPRIE_CLARIFICATION_DOCTRINE, /c'est l'IMPACT qui tranche, jamais l'étiquette/);
  for (const dimension of ['coût', 'faisabilité', 'structure', 'validité', 'recommandation']) {
    assert.ok(OPRIE_CLARIFICATION_DOCTRINE.includes(dimension), `la doctrine nomme ${dimension}`);
  }
  /* La clause de dépendance : une exigence dont le respect dépend d'une variable non donnée rend
     cette variable matérielle. Générique — elle ne nomme aucun domaine. */
  assert.match(OPRIE_CLARIFICATION_DOCTRINE,
    /exigence dont le respect DÉPEND d'une variable qu'elle n'a pas donnée, cette variable est matérielle/);
});

test('V22-08 : le plan profond reste conditionnel, et son déclenchement est explicable', () => {
  /* Aucun appel profond « au cas où » : le tour s'arrête quand une question a été posée. */
  assert.match(html, /if\(projected&&FAST_SOLICITING_TYPES\.indexOf\(projected\.type\)!==-1\)\{/);
  assert.match(html, /oprieMark\('deep_not_started',\{reason:'FAST_ASK_ONE_QUESTION'/);
  /* Et quand il part, le motif est nommé — observabilité seule, aucune décision. */
  assert.match(worker, /deep_trigger_reason: silence \? \(refuse \? "FAST_FORM_UNRECOVERABLE" : "MODEL_RETURNED_WAIT"\) : null/);
  assert.match(worker, /semantic_authority: "OPRIE"/);
  assert.match(worker, /question_decision_source: silence \? null : "OPRIE_DOCTRINE_APPLIED_BY_FAST"/);
  assert.match(worker, /materiality_decision_source: "OPRIE_DOCTRINE"/);
  /* Ces champs ne participent à aucune branche : on le prouve en les cherchant dans des conditions. */
  const code = worker.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const champ of ['semantic_authority', 'question_decision_source', 'materiality_decision_source',
                       'ready_decision_source', 'assumption_decision_source', 'deep_trigger_reason']) {
    assert.equal(new RegExp(`if\\s*\\([^)]*${champ}`).test(code), false,
      `${champ} est observé, jamais lu pour décider`);
  }
});

/* ==========================================================================
 * V22-09 — L'HYPOTHÈSE TRAVERSE SANS CHANGER DE NATURE
 * ======================================================================= */

test('V22-09 : une hypothèse reste une hypothèse de bout en bout', () => {
  const etat = buildAdnState({
    demande: 'Préparer quelque chose de précis.',
    decision: { etat_demande: 'exploitable', route: 'rapide', raison_interne: 'Contrat complet.', question: null },
    intent: { objective: 'o', deliverable: 'd',
      explicit_constraints: [{ text: 'Une contrainte énoncée par la personne', source: 'oprie', confirmed: true, evidence_id: null }] },
    obligations: [{ id: 'a0', text: 'Une dérivation du système', source: 'arch_analysis', mandatory: true, check_ids: [] }],
    evidence: {}, executability: {}, assumptions: ['Une hypothèse de travail explicitée'],
    output: {}, checks: [], quantities: [], discipline: {}
  });
  const src = (t) => (etat.completeness.obligations.find((o) => o.text === t) || {}).source;
  assert.equal(src('Une contrainte énoncée par la personne'), 'user');
  assert.equal(src('Une dérivation du système'), 'system');
  for (const h of Object.values(etat.assumptions)) {
    if (h && h.text) { assert.equal(h.source, 'deduction'); assert.equal(h.status, 'assumption'); }
  }
  /* Et le seul endroit qui autorise une hypothèse au niveau sémantique est la doctrine. */
  assert.match(OPRIE_ASSUMPTION_DOCTRINE, /Étiqueter honnêtement une hypothèse ne suffit pas/);
  /* Et l'ADN ne fabrique aucune hypothèse : il MAPPE ce qu'il reçoit, avec une source figée, sans
     aucune condition qui en créerait une. */
  assert.match(etatAdn, /function normalizeAssumptions\(items\) \{\n\s*return uniqueStrings\(items\)/);
  const codeAdnSansProse = etatAdn.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/assumptions_allowed/.test(codeAdnSansProse), false,
    'l’ADN ne lit pas le champ sémantique des hypothèses : il reçoit une liste déjà décidée');
});

/* ==========================================================================
 * V22-10 — AUCUN DOMAINE, NULLE PART
 * ======================================================================= */

test('V22-10 : une demande inédite ne rencontre aucune règle métier', () => {
  const sources = { 'doctrine': OPRIE_CLARIFICATION_DOCTRINE + OPRIE_ASSUMPTION_DOCTRINE,
    'consigne rapide': FAST_INTERACTION_SYSTEM_PROMPT, 'consigne Core': CORE_SYSTEM_PROMPT };
  for (const [nom, texte] of Object.entries(sources)) {
    for (const mot of ['voyage', 'vol', 'vols', 'hôtel', 'airbnb', 'nuit', 'nuits', 'Lisbonne',
                       'santé', 'médical', 'juridique', 'recette']) {
      assert.equal(new RegExp(`\\b${mot}\\b`, 'i').test(texte), false, `${nom} : « ${mot} » interdit`);
    }
    assert.equal(/\b\d+\s*(jour|jours|mot|mots|élément|éléments|paragraphe|paragraphes)\b/i.test(texte), false,
      `${nom} : aucun seuil chiffré`);
  }
  /* Et le raisonnement s'exprime en propriétés abstraites. */
  for (const propriete of ['intention', 'contrainte', 'priorité', 'contradiction', 'hypothèse', 'impact']) {
    assert.ok((OPRIE_CLARIFICATION_DOCTRINE + OPRIE_ASSUMPTION_DOCTRINE + CORE_SYSTEM_PROMPT).toLowerCase()
      .includes(propriete.toLowerCase()), `la doctrine raisonne en ${propriete}`);
  }
});

/* ==========================================================================
 * V22-12 — CE QUE LA PERSONNE NE DOIT JAMAIS VOIR
 * ======================================================================= */

test('V22-12 : aucune mécanique interne n’atteint l’écran', () => {
  /* Les mots de la machine ne sont pas dans ce que le plan rapide est autorisé à produire. */
  const interdits = ['OPRIE', 'READY', 'materiality', 'substituable', 'guard', 'recovery',
    'state machine', 'semantic_authority'];
  for (const mot of interdits) {
    assert.equal(SILENT_INTERACTION.text.includes(mot), false, `le repli ne dit pas « ${mot} »`);
  }
  /* Et le contrat de sortie du plan rapide ne peut porter que deux champs : un type, un texte. */
  /* V2.2.1-D2F1 — trois champs. question_focus dit ce que la question interroge ; il ne prononce
     aucun état, et l'invariant vérifié ici reste entier. */
  /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — la citation qui fonde une question est entrée au contrat ; ce n'est pas un champ d'autorité : elle ne prononce rien, elle atteste. */
  assert.deepEqual([...FAST_INTERACTION_JSON_SCHEMA.required].sort(), ['explicit_unknown_determinant_ids', 'missing_determinant_evidence', 'missing_determinant_id', 'question_focus', 'text', 'type']);
});

/* ==========================================================================
 * NON-RÉGRESSION DES LOTS ACQUIS
 * ======================================================================= */

test('V22-régression : les trois consignes historiques, la haute disponibilité et la provenance sont intactes', () => {
  /* Les prompts du trio n'ont pas bougé : leur doctrine reste la leur, et ce lot ne les a pas
     touchés — la dette est nommée, pas traitée à l'aveugle. */
  for (const prompt of [ANALYST_SYSTEM_PROMPT, CRITIC_GLOBAL_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT]) {
    assert.ok(prompt.length > 1000);
  }
  assert.deepEqual([...CORE_PROVIDER_ORDER], ['anthropic', 'openai']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic']);
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq']);
  assert.match(html, /return oprieRunTurn\(adpState\.requestedMode\|\|'rapide',\{coreOnly:true\}\);/);
  assert.match(html, /"\$id":"analyse-llm-v3-4"/);
  /* V2.1.5.1 : ready ⇒ concerns vide, appliqué par le validateur partagé. */
  assert.throws(() => validateCoreOutput({
    state: 'operational_request_ready',
    operational_request_candidate: {
      objective: 'o', expected_deliverable: 'd', secondary_objectives: [], confirmed_constraints: [],
      confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
      external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
    },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: ['R.'] },
    reason: 'r', question_candidates: [], escalation: { needed: false, kind: null, reason: null }
  }), /operational_request_ready exige une liste concerns vide/);
});
