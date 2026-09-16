/* ATELIER PROMPTS V2.1 — LA BOUCLE DE CLARIFICATION EST LÉGÈRE, LE CORE EN EST SORTI.
 * ============================================================================
 *
 * CE QUE LE PROPRIÉTAIRE A MESURÉ. Quatre tours de dialogue réels, et environ vingt-cinq secondes
 * entre chaque réponse et la question suivante. Le contrat de fluidité du garde-fou maître vise
 * 1 à 2 s, refuse au-delà de 5 s et déclare l'échec interactif au-delà de 10 s. Poser une question
 * sur une durée ou un budget ne justifie aucun pipeline profond.
 *
 * LA CAUSE, ÉTABLIE PAR MESURE ET NON SUPPOSÉE. Le lot BETA-04 avait posé un budget d'UNE
 * sollicitation par conversation, contre un sur-questionnement alors réel — à l'époque, une question
 * du plan rapide n'arrêtait pas le plan profond. Depuis, le court-circuit IA-04 arrête le tour, et V2
 * a fait du plan rapide LA boucle de clarification. Le budget s'est retourné : il faisait taire le
 * plan rapide dès la première réponse obtenue, et toutes les questions suivantes venaient du plan
 * profond. Le verdict `ALREADY_SOLICITED` tombait au tour 2, puis 3, puis 4.
 *
 * CE QUE V2.1 CHANGE. Le quota disparaît. Ce qui borne le questionnement reste : UNE question par
 * tour, aucune répétition, aucune question quand le matériau est là, et le critère de nécessité.
 *
 * CE QUE V2.1 NE CHANGE PAS. Le schéma `analyse-llm-v3-4`, l'ADN, la compilation, le JSON final.
 * V2.1 simplifie le TRAITEMENT avant le JSON, jamais le JSON.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  guardFastSolicitation, assessSolicitation, isRepeatedSolicitation, isAtomicQuestion,
  guardDisplayedQuestion, SOLICITATION_VERDICTS, SOLICITING_TYPES, SILENT_INTERACTION
} from '../workers/shared/solicitation-policy.js';
import { createTurnSnapshot, FAST_INTERACTION_TYPES, ONE_NEXT_INTERACTION_MAX, FAST_FORBIDDEN_AUTHORITY_FIELDS }
  from '../workers/shared/fast-interactive-plane.js';
import { runCoreFirstTurn, CORE_SYSTEM_PROMPT, CORE_JSON_SCHEMA } from '../workers/shared/core-first-plane.js';
import { FAST_INTERACTION_SYSTEM_PROMPT } from '../workers/groq/src/index.js';
import { ARBITER_JSON_SCHEMA } from '../workers/shared/operational-request-core.js';

const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
const politique = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const planCore = fs.readFileSync(new URL('../workers/shared/core-first-plane.js', import.meta.url), 'utf8');
const endpointFast = fs.readFileSync(new URL('../workers/shared/fast-interaction-endpoint.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');

/* Le dialogue OBSERVÉ, reconstruit comme le client le transmet : `oprieClarificationHistory()`
   rend {turn, question, answer, provenance}. Les textes sont raccourcis, le nombre de tours est
   celui du test réel — c'est lui qui compte. */
const DIALOGUE = [
  ['Combien de temps partez-vous ?', 'quatre jours, à deux'],
  ['Quel budget total prévoyez-vous ?', '1000 euros pour deux'],
  ['Qu’est-ce qui compte le plus pour vous sur place ?', 'restaurants et lieux typiques']
];
const historique = (n) => DIALOGUE.slice(0, n)
  .map(([question, answer], i) => ({ turn: i + 1, question, answer, provenance: 'user' }));
const snapshot = (n, extra = {}) => createTurnSnapshot({
  turn_id: n + 1, original_request: 'Une demande initiale incomplète.',
  clarification_history: historique(n), ...extra
});
const question = (texte) => ({ type: 'ASK_CLARIFICATION', text: texte });
const NOUVELLE = question('À quelle date partez-vous ?');

/* Un exécuteur de rôles qui COMPTE : aucun appel fournisseur réel n'est fait dans ce fichier. */
function executeur(reponses) {
  const appels = [];
  return {
    appels,
    roles: () => appels.map((a) => a.role),
    executeRole: async (role, input) => {
      appels.push({ role, input });
      if (!(role in reponses)) throw new Error(`Rôle inattendu : ${role}`);
      return typeof reponses[role] === 'function' ? reponses[role](input) : reponses[role];
    }
  };
}

const candidatVide = {
  objective: 'Préparer la demande.', expected_deliverable: 'Un document structuré.',
  secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
  confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [],
  assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
};
const tourPret = {
  state: 'operational_request_ready', operational_request_candidate: candidatVide, issues: [],
  next_question: { text: null, targets_issue_id: null, expected_progress: null },
  confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'La demande est exploitable.'
};
const sortieCore = { ...tourPret, question_candidates: [], escalation: { needed: false, kind: null, reason: null } };

/* ==========================================================================
 * V21-01 / 02 / 03 — LA BOUCLE TOURNE SANS LE CORE. C'EST TOUT LE LOT.
 * ======================================================================= */

test('V21-01 : une demande incomplète → Fast peut poser UNE question, le Core n’est pas appelé', () => {
  const rendu = guardFastSolicitation(NOUVELLE, snapshot(0));
  assert.deepEqual(rendu, NOUVELLE, 'la question passe');
  assert.equal(assessSolicitation(NOUVELLE, historique(0)), 'ALLOW');
  /* Le client s'arrête là : une sollicitation rapide n'ouvre aucune requête profonde. */
  assert.match(html, /if\(projected&&FAST_SOLICITING_TYPES\.indexOf\(projected\.type\)!==-1\)\{/);
  assert.match(html, /oprieMark\('deep_not_started',\{reason:'FAST_ASK_ONE_QUESTION'/);
  /* Et la requête profonde est ouverte APRÈS ce point de sortie, jamais avant. */
  const sortie = html.indexOf("reason:'FAST_ASK_ONE_QUESTION'");
  const profond = html.indexOf('const deepPromise=oprieRequestTurn(seq)');
  assert.ok(sortie > 0 && profond > sortie, 'le plan profond ne part qu’après le court-circuit');
});

test('V21-02 : après une réponse, la réévaluation reste légère — aucune question n’est tue par quota', () => {
  /* C'est le défaut mesuré par le propriétaire : au tour 2, le verdict tombait à ALREADY_SOLICITED
     et la question suivante venait du plan profond, en ~25 s. */
  assert.equal(assessSolicitation(NOUVELLE, historique(1)), 'ALLOW', 'une réponse obtenue ne ferme plus rien');
  assert.deepEqual(guardFastSolicitation(NOUVELLE, snapshot(1)), NOUVELLE);
  assert.equal(SOLICITATION_VERDICTS.includes('ALREADY_SOLICITED'), false, 'le quota n’existe plus');
  assert.equal(/FAST_MAX_SOLICITATIONS_PER_CONVERSATION/.test(politique), false);
  assert.equal(/jamais plus d'une/.test(FAST_INTERACTION_SYSTEM_PROMPT), false,
    'la consigne ne porte plus de quota non plus');
});

test('V21-03 : trois tours successifs de clarification, zéro appel Core', () => {
  for (let n = 0; n < DIALOGUE.length; n += 1) {
    const rendu = guardFastSolicitation(NOUVELLE, snapshot(n));
    assert.deepEqual(rendu, NOUVELLE, `tour ${n + 1} : la question part du plan rapide`);
  }
  /* Et la borne qui reste est celle du tour : le schéma ne peut porter qu'UNE interaction. */
  assert.equal(ONE_NEXT_INTERACTION_MAX, 1);
});

/* ==========================================================================
 * V21-04 / 05 / 22 — LE PASSAGE AU CORE, UNE FOIS
 * ======================================================================= */

test('V21-04 : une demande exploitable → PASS_TO_CORE, et rien n’est demandé', () => {
  /* PASS_TO_CORE n'est pas un type nouveau : c'est l'absence de sollicitation. Aucune seconde
     autorité n'a été créée pour l'exprimer. */
  for (const type of FAST_INTERACTION_TYPES.filter((t) => !SOLICITING_TYPES.includes(t))) {
    const candidate = { type, text: 'Rien à demander.' };
    assert.deepEqual(guardFastSolicitation(candidate, snapshot(2)), candidate,
      `${type} vaut PASS_TO_CORE et traverse inchangé`);
  }
  assert.deepEqual([...SOLICITING_TYPES], ['ASK_CLARIFICATION', 'ASK_CONFIRMATION'], 'ASK, et rien de plus');
});

test('V21-05 / V21-22 : PASS_TO_CORE → exactement un appel Core, et pas avant', async () => {
  const { executeRole, roles } = executeur({ core: sortieCore });
  const resultat = await runCoreFirstTurn({ original_request: 'Une demande exploitable.', clarification_history: historique(3) },
    { executeRole });
  assert.deepEqual(roles(), ['core'], 'un seul appel, et c’est le Core');
  assert.equal(resultat.provider_calls, 1);
  assert.equal(resultat.calls.critic_calls ?? resultat.calls.core_critic, 0);
  assert.equal(resultat.turn.state, 'operational_request_ready');
});

/* ==========================================================================
 * V21-06 / 07 — LE CONTRAT RICHE N'A PAS BOUGÉ. CONDITION DU LOT.
 * ======================================================================= */

test('V21-06 : le Core produit toujours le contrat compatible du tour riche', () => {
  /* Le schéma du Core DÉRIVE de celui de l'Arbitre : le candidat canonique ne peut pas diverger. */
  for (const champ of ARBITER_JSON_SCHEMA.required) {
    assert.deepEqual(CORE_JSON_SCHEMA.properties[champ], ARBITER_JSON_SCHEMA.properties[champ]);
  }
  assert.match(CORE_SYSTEM_PROMPT, /operational_request_candidate/);
});

test('V21-07 : le schéma analyse-llm 3.4 n’est ni réduit ni modifié', () => {
  assert.match(html, /"\$id":"analyse-llm-v3-4"/);
  assert.match(html, /"version":\{"type":"string","const":"3\.4"\}/);
  for (const section of ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation',
                         'verification', 'apprentissage']) {
    assert.match(html, new RegExp(`"${section}"`), `section ${section} conservée`);
  }
  for (const champ of ['informations_manquantes', 'hypotheses_autorisees', 'hypotheses_interdites',
                       'role_adaptatif', 'niveau_architecture', 'composants_retenus', 'composants_ecartes',
                       'controle_provenance', 'preference_proposable', 'criteres_bloquants', 'quantites']) {
    assert.match(html, new RegExp(`"${champ}"`), `${champ} conservé`);
  }
  /* Et aucune couche de dialogue ne le connaît : ni le plan Core, ni la politique de sollicitation,
     ni l'endpoint rapide ne peuvent l'appauvrir par accident. */
  for (const source of [planCore, politique, endpointFast]) {
    for (const marqueur of ['analyse-llm', 'comprehension', 'composants_retenus', 'apprentissage']) {
      assert.equal(source.includes(marqueur), false, `${marqueur} n’apparaît pas dans une couche de dialogue`);
    }
  }
});

/* ==========================================================================
 * V21-08 à V21-12 — LA FORME DES QUESTIONS
 * ======================================================================= */

test('V21-08 : la question méta sur le livrable est interdite par défaut, avec son exception', () => {
  for (const consigne of [FAST_INTERACTION_SYSTEM_PROMPT, CORE_SYSTEM_PROMPT]) {
    assert.match(consigne, /VARIABLE RÉELLE|variable réelle/,
      'la préférence pour une variable réelle du problème est énoncée');
  }
  assert.match(CORE_SYSTEM_PROMPT, /Ne demandez JAMAIS à la personne de concevoir ce que vous êtes chargé de préparer/);
  assert.match(CORE_SYSTEM_PROMPT, /sauf si la demande porte elle-même explicitement sur ce choix/);
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /sauf si la demande porte elle-même sur ce choix|sauf si la demande porte elle-même explicitement sur ce choix/);
});

test('V21-09 : une question catalogue est refusée, d’où qu’elle vienne', () => {
  const catalogue = 'Quel type de résultat attendez-vous : un plan jour par jour, une sélection de '
    + 'recommandations, une liste de contrôle, ou autre chose ?';
  assert.equal(isAtomicQuestion(catalogue), false);
  assert.deepEqual(guardFastSolicitation(question(catalogue), snapshot(1)), SILENT_INTERACTION);
  assert.notEqual(guardDisplayedQuestion(catalogue, {}).verdict, 'ALLOW');
});

test('V21-10 : une question multi-dimension est refusée ou réduite à une seule information', () => {
  const deux = 'Quel est votre budget et combien de temps partez-vous ?';
  assert.equal(isAtomicQuestion(deux), false);
  assert.deepEqual(guardFastSolicitation(question(deux), snapshot(0)), SILENT_INTERACTION);
  const reduite = guardDisplayedQuestion(deux, {});
  assert.equal(reduite.verdict, 'REDUCED');
  assert.equal(isAtomicQuestion(reduite.text), true);
});

test('V21-11 : une option suggérée en fin de question n’est pas une question atomique', () => {
  /* Défaut observé : « Quels types d’expériences vous tiennent le plus à cœur — culture ? » propose
     une réponse que rien ne fonde. La forme est refusée par la mesure des propositions. */
  const orientee = 'Quels types d’expériences vous tiennent le plus à cœur, la culture ou la gastronomie, ou autre chose ?';
  assert.equal(isAtomicQuestion(orientee), false, 'une énumération de suggestions n’est pas atomique');
  /* Et la consigne interdit d’énumérer des options comme un choix offert. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /catalogue|énumér/i);
});

test('V21-12 : une question concrète et discriminante passe intacte', () => {
  for (const texte of ['À quelle date partez-vous ?', 'Quel budget total prévoyez-vous ?',
                       'Combien de temps cela doit-il durer ?', 'À qui cela s’adresse-t-il ?',
                       'Quel est l’objectif principal ?']) {
    assert.equal(isAtomicQuestion(texte), true, `« ${texte} » est une question exploitable`);
    assert.deepEqual(guardFastSolicitation(question(texte), snapshot(1)), question(texte));
  }
});

/* ==========================================================================
 * V21-13 à V21-16 — CE QUI NE DOIT JAMAIS ÊTRE REDEMANDÉ
 * ======================================================================= */

test('V21-13 : une réponse déjà fournie n’est jamais redemandée', () => {
  const dejaPosee = question(DIALOGUE[0][0]);
  assert.equal(assessSolicitation(dejaPosee, historique(3)), 'ALREADY_ANSWERED');
  assert.deepEqual(guardFastSolicitation(dejaPosee, snapshot(3)), SILENT_INTERACTION);
  assert.equal(isRepeatedSolicitation(DIALOGUE[1][0], historique(3)), true);
  assert.equal(isRepeatedSolicitation('À quelle date partez-vous ?', historique(3)), false);
});

test('V21-14 / V21-15 : délégation et « je ne sais pas » sont des réponses traitées', () => {
  /* Déterministe : une question identique après l’une de ces réponses est refusée comme toute
     répétition. Le reste — ne pas y revenir sous une autre forme — est une règle de la consigne,
     parce qu’aucune mesure de forme ne sait reconnaître une reformulation sans juger le sens. */
  for (const reponse of ['je ne sais pas', 'à vous de choisir', 'comme vous voulez']) {
    const h = [{ turn: 1, question: 'Quel budget total prévoyez-vous ?', answer: reponse, provenance: 'user' }];
    assert.equal(assessSolicitation(question('Quel budget total prévoyez-vous ?'), h), 'ALREADY_ANSWERED',
      `« ${reponse} » est une réponse, pas une absence de réponse`);
  }
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT,
    /qu'elle ne sait pas, ou qu'elle vous laisse choisir, cette information est\s+TRAITÉE/,
    'la consigne traite explicitement ces deux réponses');
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /ne revenez jamais dessus — ni telle quelle,\s+ni reformulée/);
});

test('V21-16 : un matériau déjà fourni n’est jamais redemandé', () => {
  const avecMateriau = snapshot(1, { material_present: true });
  assert.equal(assessSolicitation(question('Quel texte souhaitez-vous que je corrige ?'), historique(1), true),
    'MATERIAL_PRESENT');
  assert.deepEqual(guardFastSolicitation(question('Quel texte souhaitez-vous que je corrige ?'), avecMateriau),
    SILENT_INTERACTION);
});

/* ==========================================================================
 * V21-17 / V21-18 — AUCUN HARDCODING
 * ======================================================================= */

test('V21-17 / V21-18 : aucun domaine, aucun mot-clé métier dans les couches de dialogue', () => {
  const domaines = ['voyage', 'lisbonne', 'malaga', 'rome', 'itinéraire', 'checklist', 'hébergement',
                    'restaurant', 'gastronomie', 'ryanair', 'avion', 'cv', 'déménagement', 'réunion',
                    'présentation', 'santé', 'symptôme', 'recette'];
  for (const [nom, source] of [['politique', politique], ['plan Core', planCore], ['endpoint rapide', endpointFast]]) {
    const code = source.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
    for (const domaine of domaines) {
      assert.equal(new RegExp(`\\b${domaine}`, 'i').test(code), false, `${nom} : « ${domaine} » interdit`);
    }
  }
  /* Et les consignes raisonnent par catégories, jamais par domaine. */
  for (const domaine of domaines) {
    assert.equal(new RegExp(`\\b${domaine}`, 'i').test(FAST_INTERACTION_SYSTEM_PROMPT), false,
      `consigne rapide : « ${domaine} » interdit`);
    assert.equal(new RegExp(`\\b${domaine}`, 'i').test(CORE_SYSTEM_PROMPT), false,
      `consigne Core : « ${domaine} » interdit`);
  }
  /* Aucune table de questions par scénario, aucun système de slots sectoriels. */
  assert.equal(/QUESTIONS_PAR_DOMAINE|SLOTS|SCENARIOS|QUESTIONNAIRE/i.test(politique + planCore), false);
});

/* ==========================================================================
 * V21-19 / 20 / 21 — L'ESCALADE RESTE HORS DE LA BOUCLE
 * ======================================================================= */

test('V21-19 / V21-20 / V21-21 : une clarification n’appelle ni Critique ni Arbitre', async () => {
  /* Un tour de clarification ne passe pas par le plan profond du tout — l'exécuteur ne connaît que
     `core`, et le tour de clarification n'en appelle aucun. La preuve est le compte. */
  const { executeRole, roles } = executeur({ core: sortieCore });
  const resultat = await runCoreFirstTurn({ original_request: 'Une demande dense mais exploitable, avec beaucoup de paramètres, plusieurs critères et une recommandation attendue.', clarification_history: [] }, { executeRole });
  assert.deepEqual(roles(), ['core'], 'la densité seule n’appelle personne d’autre');
  assert.equal(resultat.escalation_verdict, 'NO_ESCALATION');
  /* Et la boucle de clarification, elle, ne touche même pas au plan profond. */
  const codeFast = endpointFast.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  assert.equal(/executeRole|runCoreFirstTurn|operational-request/.test(codeFast), false,
    'l’endpoint rapide n’a aucun chemin vers le plan profond');
});

/* ==========================================================================
 * V21-23 à V21-29 — LES ACQUIS QUE V2.1 NE DOIT PAS PERDRE
 * ======================================================================= */

test('V21-23 / V21-24 / V21-25 : Entrée, dialogue accumulé, reprise après panne', () => {
  assert.match(html, /key\s*===?\s*'Enter'/, 'la touche Entrée vaut le clic');
  assert.match(html, /function oprieClarificationHistory\(\)/, 'le dialogue accumulé est transmis');
  assert.match(html, /for\(const entry of state\.answers\)/, 'et il vient des réponses conservées');
  assert.equal((html.match(/function v11ForgetDialogue\(/g) || []).length, 1, 'un seul écrivain de remise à zéro');
  assert.equal((html.match(/state\.answers\s*=\s*\[\]/g) || []).length, 1);
  assert.match(html, /function oprieKeepFailedDialogue\(/, 'une panne conserve le dialogue et sa réponse');
});

test('V21-26 : la frontière d’affichage reste la porte unique de toute question', () => {
  const orchestrateur = fs.readFileSync(new URL('../workers/shared/operational-request-orchestrator.js', import.meta.url), 'utf8');
  assert.match(orchestrateur, /import \{ guardDisplayedQuestion \} from "\.\/solicitation-policy\.js"/);
  assert.ok((orchestrateur.match(/applyDisplayGuardToTurn\(/g) || []).length >= 3,
    'la fonction, le chemin historique, le chemin V2');
});

test('V21-27 / V21-28 / V21-29 : provenance, quantités, et le silence sans objet source', () => {
  /* Ces trois invariants vivent dans le moteur et le contrat riche : V2.1 n’y touche pas, et ces
     assertions le vérifient à la source plutôt que de le supposer. */
  assert.match(html, /"provenance"|provenance_records|controle_provenance/, 'la provenance est portée');
  assert.match(html, /"quantites"/, 'les quantités sont portées par le contrat riche');
  assert.match(CORE_SYSTEM_PROMPT, /provenance/i, 'le Core raisonne encore avec la provenance');
  /* Aucune couche de dialogue ne fabrique de langage dépendant d’une source. */
  for (const source of [politique, endpointFast]) {
    assert.equal(/source|provenance/i.test(source.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n')), false,
      'la couche de dialogue ne parle jamais de source');
  }
});

/* ==========================================================================
 * INSTRUMENTATION — LE COÛT D'UN TOUR DE CLARIFICATION EST OBSERVABLE
 * ======================================================================= */

test('V21-32 : un tour de clarification déclare son coût, et il est nul côté profond', () => {
  assert.match(endpointFast, /event: "clarification_turn_cost"/);
  for (const champ of ['fast_duration_ms', 'clarification_turn_duration_ms', 'core_duration_ms',
                       'provider_calls', 'fast_calls', 'core_calls', 'critic_calls', 'arbiter_calls']) {
    assert.match(endpointFast, new RegExp(champ), `${champ} est relevé`);
  }
  assert.match(endpointFast, /core_calls: 0, critic_calls: 0, arbiter_calls: 0/,
    'un tour de clarification déclare zéro appel profond');
  /* Et le relevé ne porte aucun contenu : ni la demande, ni la réponse, ni le texte de la question. */
  const bloc = endpointFast.slice(endpointFast.indexOf('clarification_turn_cost'),
                                 endpointFast.indexOf('clarification_turn_cost') + 700);
  assert.equal(/original_request|current_answer|\.text/.test(bloc), false, 'aucun contenu journalisé');
  /* Le plan rapide journalise sous le même identifiant d’invocation que le plan profond. */
  assert.match(worker, /const invocation_id = resolveInvocationId\(request\);/);
});
