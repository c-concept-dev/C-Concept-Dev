/* ATELIER PROMPTS V2.1.2 — LA CLARIFICATION RESTE DANS FAST ; LE CORE CONTRACTUALISE.
 * ============================================================================
 *
 * CE QUE LES ESSAIS DU PROPRIÉTAIRE ONT MONTRÉ. Sur quatre scénarios réels, le plan rapide rendait
 * le silence en 378 à 536 ms, puis le plan profond posait la question — en 17 à 45 secondes. Le Core
 * servait donc de générateur de questions, ce que l'architecture cible lui interdit.
 *
 * LA CAUSE, LUE DANS LA CONSIGNE ET NON SUPPOSÉE. Trois clauses, toutes écrites par moi dans des lots
 * antérieurs pour arrêter un sur-questionnement alors réel, se conjuguaient pour interdire au plan
 * rapide de demander précisément les variables les plus déterminantes :
 *
 *   1. « N'est jamais déterminant ce qui ne fait que colorer ce qui est déjà nommé : une préférence,
 *      un profil, un budget, un ton, un contexte d'usage… » — une interdiction par CATÉGORIE, qui
 *      couvrait le niveau du public et la modalité de participation ;
 *   2. « Si la demande nomme déjà ce qu'il faut produire et sa forme, elle est exploitable : ne
 *      demandez rien » — or une production nommée peut encore dépendre d'une variable décisive ;
 *   3. « Deux contenus différents à l'intérieur de la MÊME production… c'est la même chose autrement
 *      colorée » — ce qui range un public novice et un public expert dans le même sac.
 *
 * CE QUE V2.1.2 CHANGE. Les trois clauses sont RETIRÉES et remplacées par un seul test, générique :
 * si les réponses plausibles différaient, ce qui sera produit changerait-il significativement ? La
 * matérialité se juge donc par l'impact, jamais par l'étiquette. Une règle en moins, pas une de plus.
 *
 * CE QUE CE FICHIER NE FAIT PAS. Aucun appel fournisseur, aucun scénario interactif. Les fixtures
 * sont génériques et les assertions portent sur des PROPRIÉTÉS du comportement, jamais sur des
 * chaînes attendues.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  guardFastSolicitation, assessSolicitation, isMetaOutputQuestion, isAtomicQuestion,
  SOLICITING_TYPES, SILENT_INTERACTION
} from '../workers/shared/solicitation-policy.js';
import { createTurnSnapshot, FAST_INTERACTION_TYPES } from '../workers/shared/fast-interactive-plane.js';
import { FAST_INTERACTION_SYSTEM_PROMPT, FAST_CORRECTIONS, FAST_META_CORRECTION } from '../workers/groq/src/index.js';
import { validateArbiterOutput } from '../workers/shared/operational-request-core.js';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { runCoreFirstTurn } from '../workers/shared/core-first-plane.js';

const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
const politique = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const endpointFast = fs.readFileSync(new URL('../workers/shared/fast-interaction-endpoint.js', import.meta.url), 'utf8');

const P = FAST_INTERACTION_SYSTEM_PROMPT;
const q = (texte) => ({ type: 'ASK_CLARIFICATION', text: texte });
const tour = (demande, historique = []) => createTurnSnapshot({
  turn_id: historique.length + 1, original_request: demande, clarification_history: historique
});

/* Fixtures GÉNÉRIQUES : une intention nommée, une production nommée, une demande dense, une demande
   contradictoire. Aucune ne cite un domaine — ce sont des formes de demande, pas des sujets. */
const DEMANDE_INTENTION = 'Je veux préparer une intervention de vingt minutes pour un groupe de collègues.';
const DEMANDE_DENSE = 'Nous devons organiser un temps collectif pour onze personnes, avec des tensions '
  + 'anciennes, des profils très réservés, une salle incertaine, une durée à arbitrer entre deux heures '
  + 'et une demi-journée, un budget serré, un animateur non formé, sans exercice artificiel, avec des '
  + 'engagements concrets et un suivi ultérieur.';
const DEMANDE_CONTRADICTOIRE = 'Je veux un document exhaustif qui couvre absolument tout le sujet, et '
  + 'qui ne dépasse jamais une demi-page, sans rien omettre d’essentiel.';

/* ==========================================================================
 * V212-01 / 02 / 13 — LA BOUCLE VIT DANS FAST
 * ======================================================================= */

test('V212-01 : une inconnue matériellement déterminante passe, sans appeler le Core', () => {
  const candidate = q('À quel niveau de connaissance du sujet se situe votre auditoire ?');
  assert.equal(isAtomicQuestion(candidate.text), true);
  assert.equal(isMetaOutputQuestion(candidate.text), false, 'elle porte sur le problème, pas sur notre sortie');
  assert.equal(assessSolicitation(candidate, [], false, DEMANDE_INTENTION), 'ALLOW');
  assert.deepEqual(guardFastSolicitation(candidate, tour(DEMANDE_INTENTION)), candidate);
  /* La porte rapide n’a aucun chemin vers un rôle profond : c’est ce qui garantit core_calls = 0. */
  const codeFast = endpointFast.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  assert.equal(/executeRole|runCoreFirstTurn|operational-request/.test(codeFast), false);
});

test('V212-02 : deux clarifications successives restent dans Fast', () => {
  const historique = [{ turn: 1, question: 'Combien de temps cela doit-il durer ?', answer: 'deux heures', provenance: 'user' }];
  const suivante = q('À quel niveau de connaissance du sujet se situe votre auditoire ?');
  assert.equal(assessSolicitation(suivante, historique, false, DEMANDE_INTENTION), 'ALLOW',
    'une réponse obtenue ne ferme pas la boucle');
  assert.deepEqual(guardFastSolicitation(suivante, tour(DEMANDE_INTENTION, historique)), suivante);
});

test('V212-13 : un tour de clarification déclare zéro appel profond', () => {
  assert.match(endpointFast, /core_calls: 0, critic_calls: 0, arbiter_calls: 0/);
  assert.match(worker, /core_calls: 0, critic_calls: 0, arbiter_calls: 0/,
    'le relevé de décision rapide le déclare aussi');
});

/* ==========================================================================
 * V212-03 — LA MATÉRIALITÉ, ET NON LE JUGEMENT PAR CATÉGORIE
 * ======================================================================= */

test('V212-03 : la consigne décide par impact, jamais par étiquette', () => {
  /* Le test générique demandé par le propriétaire est énoncé, et il est énoncé comme un TEST. */
  assert.match(P, /TEST DE MATÉRIALITÉ/);
  assert.match(P, /Si elles étaient différentes, ce qui sera produit changerait-il\s+SIGNIFICATIVEMENT/);
  assert.match(P, /Si non, ne la\s+posez pas, même si l'information manque/,
    'une information ne se demande pas parce qu’elle manque');
  /* Et l’interdiction par catégorie a DISPARU : c’est elle qui empêchait les bonnes questions. */
  assert.equal(/N'est jamais déterminant ce qui ne fait que colorer/.test(P), false);
  assert.equal(/Deux contenus différents à l'intérieur de la MÊME/.test(P), false);
  assert.equal(/Si la demande nomme déjà ce qu'il faut produire et sa\s+forme, elle est exploitable/.test(P), false);
  assert.match(P, /Ne jugez JAMAIS par catégorie/);
  assert.match(P, /c'est l'IMPACT qui tranche,\s+jamais l'étiquette/);
  /* Nommer la production ne rend pas le reste exploitable : c’est le défaut mesuré du scénario B. */
  assert.match(P, /Que la demande nomme déjà ce qu'il faut produire ne rend pas exploitable tout le reste/);
});

/* ==========================================================================
 * V212-04 / 05 — LA QUESTION MÉTA, ET LE RATTRAPAGE
 * ======================================================================= */

test('V212-04 : une candidate méta est refusée', () => {
  /* V2.2.1-D2F1 — c'est l'auteur de la question qui déclare qu'elle porte sur notre sortie. */
  const meta = { ...q('Quel type de résultat souhaitez-vous obtenir ?'), question_focus: 'output_specification' };
  assert.equal(assessSolicitation(meta, [], false, DEMANDE_INTENTION), 'META_OUTPUT_QUESTION');
  assert.deepEqual(guardFastSolicitation(meta, tour(DEMANDE_INTENTION)), SILENT_INTERACTION);
});

test('V212-05 : un refus de garde ouvre UN rattrapage rapide, qui vise une autre question', () => {
  /* Le rattrapage ne concerne plus la seule question méta : tout refus corrigible en ouvre un, parce
     que rendre le silence coûtait un tour profond entier. */
  assert.deepEqual(Object.keys(FAST_CORRECTIONS).sort(),
    ['ALREADY_ANSWERED', 'CATALOGUE', 'META_OUTPUT_QUESTION', 'MULTIPLE_QUESTIONS']);
  for (const [verdict, correction] of Object.entries(FAST_CORRECTIONS)) {
    assert.equal(typeof correction, 'string');
    assert.ok(correction.length > 80, `${verdict} : la correction dit quoi faire`);
    assert.match(correction, /Reprenez|reprenez/, `${verdict} : elle demande une autre question`);
    /* Elle ne renvoie jamais vers le plan profond, et ne propose aucune question. */
    assert.equal(/plan profond|Core|analyse approfondie/.test(correction), false);
  }
  /* Bornage : un seul second appel, aucune boucle. */
  const bloc = worker.slice(worker.indexOf('async function rattraperQuestionRefusee'),
    worker.indexOf('async function rattraperQuestionRefusee') + 1800);
  assert.equal((bloc.match(/FAST_INTERACTION_ADAPTERS\[name\]\(snapshot, env/g) || []).length, 1,
    'un seul rattrapage');
  assert.equal(/while|for\s*\(|\.map\(/.test(bloc), false, 'aucune boucle');
  /* Un silence venu du MODÈLE n’est pas un refus : il n’ouvre aucun rattrapage. */
  assert.match(bloc, /const verdict = refus && refus\.verdict;/);
  assert.match(bloc, /if \(!correction\) return rendu;/);
});

/* ==========================================================================
 * V212-06 / 07 / 08 — LONGUEUR N'EST PAS AMBIGUÏTÉ
 * ======================================================================= */

test('V212-06 / V212-07 : la longueur et la densité ne justifient aucune escalade', () => {
  assert.match(P, /Une demande longue,\s+dense, chargée de contraintes ou de détails n'est PAS une demande ambiguë/);
  assert.match(P, /la longueur n'est pas\s+de l'ambiguïté/);
  assert.match(P, /le nombre de contraintes n'appelle aucune analyse préalable/);
  /* Et une question concrète sur une demande dense traverse le garde comme n’importe quelle autre :
     rien dans le garde ne mesure la longueur de la demande. */
  const candidate = q('Combien de temps souhaitez-vous y consacrer ?');
  assert.deepEqual(guardFastSolicitation(candidate, tour(DEMANDE_DENSE)), candidate);
  const code = politique.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  assert.equal(/original_request\.length|demande\.length|\.length\s*>\s*\d{3}/.test(code), false,
    'aucun seuil de longueur nulle part dans le garde');
});

test('V212-08 : le silence reste permis quand il est justifié', () => {
  /* Trois motifs seulement, et ils sont nommés : contradiction réelle, exigences qui s’excluent,
     impossibilité de choisir une question sûre. « Je ne suis pas sûr » n’en fait pas partie. */
  assert.match(P, /WAIT_FOR_DEEP_VALIDATION est EXCEPTIONNEL, et ce n'est pas « je ne suis pas sûr »/);
  assert.match(P, /si la demande se contredit réellement, si deux exigences explicites s'excluent, ou si\s+aucune question sûre ne peut être choisie/);
  /* Le type reste disponible dans le contrat : on ne l’a pas supprimé, on l’a rendu exceptionnel. */
  assert.ok(FAST_INTERACTION_TYPES.includes('WAIT_FOR_DEEP_VALIDATION'));
  assert.equal(SOLICITING_TYPES.includes('WAIT_FOR_DEEP_VALIDATION'), false);
  /* Et une demande contradictoire est bien un cas où il n’y a rien de sûr à demander : le garde ne
     l’empêche pas — il ne fabrique jamais de question. */
  assert.deepEqual(guardFastSolicitation({ type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Rien à demander.' },
    tour(DEMANDE_CONTRADICTOIRE)), { type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Rien à demander.' });
});

/* ==========================================================================
 * V212-09 — LA QUESTION DÉSIGNE UNE INCONNUE QUI EXISTE
 * ======================================================================= */

test('V212-09 : la cohérence question → inconnue est observée, sans détruire le tour', () => {
  const issue = {
    id: 'I1', type: 'missing_information', kind: null, description: 'Une inconnue déclarée.',
    impact: 'material', substitutable: false, recommended_treatment: 'question'
  };
  const candidat = {
    objective: 'o', expected_deliverable: 'd', secondary_objectives: [], confirmed_constraints: [],
    confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
    external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
  };
  const base = {
    state: 'clarification_required', operational_request_candidate: candidat, issues: [issue],
    next_question: { text: 'Combien de temps cela doit-il durer ?', targets_issue_id: 'I1', expected_progress: 'p' },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'r'
  };
  /* PREMIÈRE VERSION DE CE LOT, ET POURQUOI ELLE A ÉTÉ RETIRÉE. Une assertion fermante refusait le
   * tour quand l'identifiant ne désignait aucune inconnue déclarée. Deux tests l'ont refusée — dont
   * un qui s'est mis à attendre soixante secondes — et ils avaient raison : la personne ne voit
   * JAMAIS cette métadonnée, et perdre un tour entier de travail pour elle rend le produit moins
   * disponible sans rien réparer de visible. Les deux formes sont donc acceptées par le noyau… */
  assert.equal(validateArbiterOutput(base).next_question.targets_issue_id, 'I1');
  assert.equal(validateArbiterOutput({ ...base, next_question: { ...base.next_question, targets_issue_id: 'I9' } })
    .next_question.targets_issue_id, 'I9', 'un identifiant fantôme ne détruit pas le tour');
  /* …et l'incohérence est RELEVÉE à la frontière d'affichage, là où elle ne coûte rien. */
  const orchestrateur = fs.readFileSync(new URL('../workers/shared/operational-request-orchestrator.js', import.meta.url), 'utf8');
  assert.match(orchestrateur, /event: "question_issue_coherence"/);
  assert.match(orchestrateur, /targets_declared_issue: idsConnus\.includes\(question\.targets_issue_id\)/);
  const releves = [];
  applyDisplayGuardToTurn({ ...base, next_question: { ...base.next_question, targets_issue_id: 'I9' } },
    { question_candidates: [] }, (e) => releves.push(e), 'Une demande.');
  const coherence = releves.find((e) => e.event === 'question_issue_coherence');
  assert.equal(coherence.targets_declared_issue, false, 'l’incohérence est vue');
  assert.equal(coherence.issue_count, 1);
  const bons = [];
  applyDisplayGuardToTurn(base, { question_candidates: [] }, (e) => bons.push(e), 'Une demande.');
  assert.equal(bons.find((e) => e.event === 'question_issue_coherence').targets_declared_issue, true);
  /* Limite nommée : un identifiant qui EXISTE mais parle d'autre chose reste hors de portée d'un
   * contrôle structurel. Le commentaire du code le dit, plutôt que de le masquer. */
  assert.match(orchestrateur, /Une incohérence de\s+\* SENS sur un identifiant qui existe reste hors de portée/);
});

/* ==========================================================================
 * V212-10 / 11 / 12 — CE QUI NE SE REDEMANDE JAMAIS
 * ======================================================================= */

test('V212-10 / V212-11 / V212-12 : réponse obtenue, délégation, « je ne sais pas »', () => {
  const posee = 'Combien de temps cela doit-il durer ?';
  for (const reponse of ['deux heures', 'à vous de choisir', 'je ne sais pas']) {
    const historique = [{ turn: 1, question: posee, answer: reponse, provenance: 'user' }];
    assert.equal(assessSolicitation(q(posee), historique), 'ALREADY_ANSWERED',
      `« ${reponse} » est une réponse, pas une absence de réponse`);
    assert.deepEqual(guardFastSolicitation(q(posee), tour(DEMANDE_INTENTION, historique)), SILENT_INTERACTION);
  }
  /* Et la consigne traite explicitement les deux réponses que rien ne peut détecter par la forme. */
  assert.match(P, /qu'elle ne sait pas, ou qu'elle vous laisse choisir, cette information est\s+TRAITÉE/);
  assert.match(P, /ne revenez jamais dessus — ni telle quelle,\s+ni reformulée/);
});

/* ==========================================================================
 * V212-14 — LE CORE, UNE FOIS, À LA CONTRACTUALISATION
 * ======================================================================= */

test('V212-14 : au passage au Core, un seul appel', async () => {
  const candidatVide = {
    objective: 'o', expected_deliverable: 'd', secondary_objectives: [], confirmed_constraints: [],
    confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
    external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
  };
  const sortie = {
    state: 'operational_request_ready', operational_request_candidate: candidatVide, issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'r', question_candidates: [], escalation: { needed: false, kind: null, reason: null }
  };
  const appels = [];
  const executeRole = async (role) => { appels.push(role); if (role !== 'core') throw new Error(`rôle inattendu : ${role}`); return sortie; };
  const resultat = await runCoreFirstTurn({ original_request: DEMANDE_DENSE, clarification_history: [] }, { executeRole });
  assert.deepEqual(appels, ['core'], 'même sur une demande dense : un seul appel');
  assert.equal(resultat.provider_calls, 1);
});

/* ==========================================================================
 * V212-15 — AUCUN DOMAINE, NULLE PART
 * ======================================================================= */

test('V212-15 : aucun hardcoding de domaine dans les gardes, les politiques ou les corrections', () => {
  const domaines = ['voyage', 'lisbonne', 'présentation', 'réunion', 'cv', 'déménagement', 'santé',
                    'logiciel', 'infirmi', 'team building', 'itinéraire', 'checklist', 'gastronomie'];
  const sources = [['politique', politique], ['endpoint rapide', endpointFast]];
  for (const [nom, source] of sources) {
    const code = source.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
    for (const domaine of domaines) {
      assert.equal(new RegExp(domaine, 'i').test(code), false, `${nom} : « ${domaine} » interdit`);
    }
  }
  for (const domaine of domaines) {
    assert.equal(new RegExp(domaine, 'i').test(P), false, `consigne rapide : « ${domaine} » interdit`);
    for (const correction of Object.values(FAST_CORRECTIONS)) {
      assert.equal(new RegExp(domaine, 'i').test(correction), false, `correction : « ${domaine} » interdit`);
    }
  }
  /* Ni table de questions par scénario, ni slots sectoriels, ni seuils chiffrés dans la consigne. */
  assert.equal(/QUESTIONS_PAR|SLOTS|SCENARIOS|QUESTIONNAIRE/i.test(politique + worker.slice(0, 2000)), false);
  assert.equal(/\b\d+\s*(minutes|heures|jours|personnes|euros)\b/i.test(P), false,
    'aucun seuil chiffré : le protocole est décrit, pas paramétré');
});

/* ==========================================================================
 * INSTRUMENTATION — SÉPARER « LE MODÈLE N'A RIEN PROPOSÉ » DE « UN GARDE A REFUSÉ »
 * ======================================================================= */

test('V212-16 : chaque décision rapide est attribuable, sans journaliser aucun texte', () => {
  assert.match(worker, /event: "fast_decision"/);
  for (const champ of ['fast_raw_type', 'fast_guard_result', 'fast_rejection_reason',
                       'fast_replacement_attempted', 'fast_final_decision', 'core_escalation_reason']) {
    assert.match(worker, new RegExp(champ), `${champ} est relevé`);
  }
  /* La distinction que cette instrumentation existe pour établir. */
  assert.match(worker, /MODEL_RETURNED_WAIT/);
  assert.match(worker, /`GUARD_\$\{refus\.verdict\}`/);
  /* Aucun texte : ni la demande, ni la réponse, ni la question proposée — une longueur seulement. */
  const bloc = worker.slice(worker.indexOf('function journaliserDecisionRapide'),
    worker.indexOf('function journaliserDecisionRapide') + 1600);
  assert.match(bloc, /fast_candidate_chars/);
  assert.equal(/\.text\b|original_request|current_answer/.test(bloc), false, 'aucun contenu journalisé');
});
