/* ATELIER PROMPTS V2.1.5.1 — LE CONTRAT CONNU DU VALIDATEUR, CONNU DU MODÈLE.
 * ============================================================================
 *
 * LE DÉFAUT. Sur la fixture A-voyage, `/operational-request` rendait `degraded_state` quatre fois
 * sur quatre, les deux fournisseurs échouant en `structured_output_invalid` après quarante-cinq à
 * cinquante-cinq secondes. Ce n'était ni une troncature (`stop_reason=tool_use`, 1 045 à 1 170
 * unités de sortie sur 4 096 permises) ni une panne de transport : le modèle prononçait
 * `operational_request_ready` TOUT EN remplissant `intent_preservation.concerns`, ce que le
 * validateur interdit depuis toujours.
 *
 * CE QUE LA LECTURE DU CONTRAT A MONTRÉ, ET QUI CORRIGE LE RAPPORT PRÉCÉDENT. La règle n'a pas
 * « toujours manqué » à la consigne : `ARBITER_SYSTEM_PROMPT` l'énonce en toutes lettres à son
 * point 4 — « operational_request_ready exige que les trois soient vrais et concerns vide ». C'est
 * V2, en remplaçant le trio par un rôle unique, qui a perdu la phrase en chemin. On demandait donc
 * au Core de respecter un invariant qu'on ne lui disait plus.
 *
 * LA CORRECTION. Une phrase, au point 6 de CE QUE VOUS PRODUISEZ, qui ÉNONCE l'invariant existant.
 * Aucun concept nouveau, aucune heuristique nouvelle, aucun critère de readiness déplacé, aucune
 * réparation après coup : le validateur n'est pas touché, et la sortie doit être conforme À LA
 * SOURCE.
 *
 * LA MESURE, transport exact du Worker (outil forcé, température 0, plafond 4096, Anthropic,
 * fixture A-voyage) :
 *
 *   - avant : 1 sortie valide sur 4 — trois rejets « operational_request_ready exige une liste
 *     concerns vide », 18,3 à 25,8 s ;
 *   - après : 4 sur 4 valides, `operational_request_ready`, 3 à 4 contraintes captées, 18,6 à
 *     21,3 s.
 *
 * La consigne amputée de la section V2.1.5 échouait elle aussi : ce lot-là n'était pas en cause, et
 * la mesure le dit plutôt que de le supposer.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CORE_SYSTEM_PROMPT, CORE_ROLE_DEFINITIONS, validateCoreOutput, CORE_JSON_SCHEMA
} from '../workers/shared/core-first-plane.js';
import {
  validateArbiterOutput, ARBITER_SYSTEM_PROMPT, ARBITER_JSON_SCHEMA
} from '../workers/shared/operational-request-core.js';
import {
  CORE_PROVIDER_ORDER, ROLE_PROVIDER_ORDER, FAST_PROVIDER_ORDER, DECISION_PROVIDER_ORDER,
  FAST_INTERACTION_SYSTEM_PROMPT
} from '../workers/groq/src/index.js';

const lire = (f) => fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const contrat = lire('../workers/shared/operational-request-core.js');
const planCore = lire('../workers/shared/core-first-plane.js');
const orchestrateur = lire('../workers/shared/operational-request-orchestrator.js');
const worker = lire('../workers/groq/src/index.js');
const html = lire('../atelier-prompts-v11.5-lot10g-decision-provider.html');

const candidat = {
  objective: 'Préparer un voyage.', expected_deliverable: 'Un plan structuré.',
  secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
  confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [],
  assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
};

/** Un tour paramétrable par son état ET par ses réserves : c'est exactement l'axe mesuré. */
function tour({ state = 'operational_request_ready', concerns = [], booleens = true } = {}) {
  return {
    state,
    operational_request_candidate: { ...candidat },
    issues: [],
    next_question: state === 'clarification_required'
      ? { text: 'Quelle est votre date de départ ?', targets_issue_id: 'I1', expected_progress: 'Fixe la période.' }
      : { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: state === 'confirmation_required' ? 'À confirmer.' : null,
    blocked_reason: state === 'blocked' ? 'Options épuisées.' : null,
    intent_preservation: {
      objective_preserved: booleens, priorities_preserved: booleens,
      semantic_equivalence: booleens, concerns
    },
    reason: 'Raison du tour.'
  };
}
const sortieCore = (options) => ({
  ...tour(options), question_candidates: [], escalation: { needed: false, kind: null, reason: null }
});

/* ==========================================================================
 * V2151-01 / 02 — LE CONTRAT RÉEL, ET CE QUE LE MODÈLE EN SAIT
 * ======================================================================= */

test('V2151-01 : le contrat réel impose bien la règle ready ⇒ concerns vide', () => {
  /* On ne cite pas la règle : on l'exécute. */
  assert.throws(() => validateArbiterOutput(tour({ concerns: ['Une réserve subsiste.'] })),
    /operational_request_ready exige une liste concerns vide/);
  assert.equal(validateArbiterOutput(tour({ concerns: [] })).state, 'operational_request_ready');
  /* La règle est LIÉE à l'état ready, et à lui seul : les trois autres états acceptent une réserve,
     et ce champ reste donc légitime ailleurs — il n'y avait rien à retirer du schéma. */
  for (const state of ['clarification_required', 'confirmation_required', 'blocked']) {
    const rendu = validateArbiterOutput(tour({ state, concerns: ['Une réserve subsiste.'], booleens: false }));
    assert.deepEqual(rendu.intent_preservation.concerns, ['Une réserve subsiste.'],
      `${state} conserve ses réserves`);
  }
  /* La forme contractuelle exacte de « vide » est une LISTE VIDE, jamais un champ absent : le
     schéma rend `concerns` obligatoire. Confondre les deux aurait produit un autre rejet. */
  assert.ok(ARBITER_JSON_SCHEMA.properties.intent_preservation.required.includes('concerns'));
  assert.equal(ARBITER_JSON_SCHEMA.properties.intent_preservation.properties.concerns.type, 'array');
  assert.ok(CORE_JSON_SCHEMA.properties.intent_preservation.required.includes('concerns'));
});

test('V2151-02 : la consigne Core énonce explicitement cette règle', () => {
  assert.ok(CORE_SYSTEM_PROMPT.includes('concerns'), 'la consigne nomme le champ');
  assert.match(CORE_SYSTEM_PROMPT,
    /operational_request_ready exige que les trois booléens soient vrais ET que concerns soit vide/);
  /* Les deux sens de la règle sont dits, parce que la moitié seulement biaiserait la décision : une
     réserve réelle interdit ready, et une remarque sans portée n'a rien à faire dans concerns. */
  assert.match(CORE_SYSTEM_PROMPT, /Une réserve réelle vous interdit donc operational_request_ready/);
  assert.match(CORE_SYSTEM_PROMPT, /n'inscrivez pas dans concerns une remarque sans portée/);
  /* LA PHRASE EXISTAIT DÉJÀ AILLEURS. L'Arbitre historique la porte ; V2 l'avait perdue en
     remplaçant le trio. Ce test garde les deux consignes alignées sur le même invariant. */
  assert.match(ARBITER_SYSTEM_PROMPT, /operational_request_ready exige que les trois soient vrais et concerns vide/);
  /* Et la consigne n'a pas été restructurée pour l'occasion : la règle vit dans le point 6, là où
     intent_preservation était déjà décrit. */
  const point6 = CORE_SYSTEM_PROMPT.slice(CORE_SYSTEM_PROMPT.indexOf('6. intent_preservation'),
    CORE_SYSTEM_PROMPT.indexOf('7. escalation'));
  assert.ok(point6.includes('concerns'), 'la règle est énoncée là où le champ est déjà décrit');
});

/* ==========================================================================
 * V2151-03 — AUCUNE RÉPARATION APRÈS COUP
 * ======================================================================= */

test('V2151-03 : aucune mutation post-hoc de concerns, nulle part sur le chemin Core', () => {
  /* Le seul code qui touche `concerns` hors du contrat lui-même serait une réparation déguisée. */
  for (const [nom, source] of [['plan Core', planCore], ['orchestrateur', orchestrateur], ['worker', worker]]) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(/concerns\s*=|concerns\s*:\s*\[\]|concerns\.length\s*=|delete\s+\w+\.concerns/.test(code), false,
      `${nom} : aucune écriture dans concerns`);
  }
  /* Et la preuve par l'exécution : une sortie ready porteuse d'une réserve est REJETÉE, jamais
     nettoyée puis acceptée. */
  assert.throws(() => validateCoreOutput(sortieCore({ concerns: ['Une réserve subsiste.'] })),
    /operational_request_ready exige une liste concerns vide/);
  /* Le rejet vaut aussi pour l'autre moitié de l'invariant : des booléens négatifs sous ready. */
  assert.throws(() => validateCoreOutput(sortieCore({ booleens: false })),
    /operational_request_ready exige un intent_preservation entièrement positif/);
});

/* ==========================================================================
 * V2151-04 / 05 — LES DEUX FOURNISSEURS, LE MÊME CONTRAT
 * ======================================================================= */

test('V2151-04 / V2151-05 : Anthropic et OpenAI passent par la MÊME validation, sans réparation propre à l’un', () => {
  /* Les deux adaptateurs lisent le même registre et appellent le même `parseOutput` : il n'existe
     pas de chemin où un fournisseur serait rattrapé et l'autre non. Le worker le montre à la
     lettre — même définition, même schéma, même analyse. */
  for (const adaptateur of ['runRoleWithAnthropic', 'runRoleWithOpenAI']) {
    const bloc = worker.slice(worker.indexOf(`export async function ${adaptateur}(`),
      worker.indexOf('}', worker.indexOf('return parseRoleOutput', worker.indexOf(`export async function ${adaptateur}(`))));
    assert.match(bloc, /const definition = ALL_ROLE_DEFINITIONS\[role\];/, `${adaptateur} lit le registre`);
    assert.match(bloc, /schema: resolveRoleSchema\(definition, input\)/, `${adaptateur} emploie le schéma du rôle`);
    assert.match(bloc, /return parseRoleOutput\(role, content, "(anthropic|openai)"\)/,
      `${adaptateur} rend la sortie à la validation commune`);
  }
  /* Et cette validation commune est bien celle qui porte l'invariant. */
  const analyse = CORE_ROLE_DEFINITIONS.core.parseOutput;
  assert.throws(() => analyse(JSON.stringify(sortieCore({ concerns: ['Réserve.'] }))),
    /operational_request_ready exige une liste concerns vide/);
  assert.equal(analyse(JSON.stringify(sortieCore({ concerns: [] }))).turn.state, 'operational_request_ready');
  /* Un objet déjà analysé suit le même chemin qu'une chaîne : aucune porte dérobée. */
  assert.throws(() => analyse(sortieCore({ concerns: ['Réserve.'] })),
    /operational_request_ready exige une liste concerns vide/);
});

/* ==========================================================================
 * V2151-06 — UN VRAI BLOCAGE RESTE UN BLOCAGE
 * ======================================================================= */

test('V2151-06 : un blocage réel n’est pas converti en ready par la consigne', () => {
  /* La correction dit « une réserve réelle interdit ready », jamais « supprimez la réserve ». Les
     quatre états restent atteignables, et les trois autres portent leurs réserves sans obstacle. */
  assert.equal(validateCoreOutput(sortieCore({ state: 'blocked', concerns: ['Rien ne permet de trancher.'], booleens: false })).turn.state, 'blocked');
  assert.equal(validateCoreOutput(sortieCore({ state: 'clarification_required', concerns: ['Une inconnue demeure.'], booleens: false })).turn.state, 'clarification_required');
  assert.equal(validateCoreOutput(sortieCore({ state: 'confirmation_required', concerns: ['À confirmer.'], booleens: false })).turn.state, 'confirmation_required');
  /* Et les critères de readiness n'ont pas bougé d'un mot : la section qui les énonce est intacte. */
  assert.match(CORE_SYSTEM_PROMPT, /- operational_request_ready : le livrable attendu peut être préparé sans ambiguïté matérielle non résolue/);
  assert.match(CORE_SYSTEM_PROMPT, /- blocked :/);
  /* La consigne n'invite nulle part à préférer ready : le mot d'ordre reste l'honnêteté du constat. */
  assert.equal(/pr[ée]f[ée]rez .{0,24}ready|toujours ready|ready par d[ée]faut/i.test(CORE_SYSTEM_PROMPT), false);
});

/* ==========================================================================
 * V2151-07 à 13 — CE QUI N'A PAS ÉTÉ TOUCHÉ
 * ======================================================================= */

test('V2151-07 : le validateur est inchangé', () => {
  /* L'assertion, sa place et sa formulation : si elle bougeait, la correction aurait dérivé vers un
     assouplissement du contrat, ce que ce lot s'interdit. */
  assert.match(contrat, /assert\(intent_preservation\.concerns\.length === 0, "operational_request_ready exige une liste concerns vide\."\);/);
  assert.match(contrat, /assert\(\s*intent_preservation\.objective_preserved && intent_preservation\.priorities_preserved && intent_preservation\.semantic_equivalence,/);
  /* Et le plan Core continue de DÉLÉGUER au validateur historique, au lieu d'en tenir un second. */
  assert.match(planCore, /const turn = validateArbiterOutput\(tour\);/);
});

test('V2151-08 / V2151-09 / V2151-10 : JSON 3.4, ADN et compilateur inchangés', () => {
  /* Le schéma d'analyse 3.4, tel que l'artefact le porte — mêmes ancres que V215-19. */
  assert.match(html, /"\$id":"analyse-llm-v3-4"/);
  assert.match(html, /"version":\{"type":"string","const":"3\.4"\}/);
  for (const section of ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation',
                         'verification', 'apprentissage']) {
    assert.match(html, new RegExp(`"${section}"`));
  }
  /* Les régions gelées répondent encore à leurs marqueurs — le garde les vérifie en propre, ce test
     constate seulement que ce lot ne les a pas déplacées. */
  for (const marqueur of ['const FORMATS = {', 'const VERROUS = [', 'let ARCH_SYSTEM=', 'const ARCH_SCHEMA=']) {
    assert.ok(html.includes(marqueur), `${marqueur} toujours présent`);
  }
  /* Le compilateur ADN : son runtime compilé existe, et le plan Core ne compile rien lui-même. */
  assert.ok(fs.existsSync(fileURLToPath(new URL('../core/adn/browser-runtime.generated.js', import.meta.url))));
  assert.equal(/compil|compile/i.test(planCore), false, 'le plan Core ne compile rien');
});

test('V2151-11 : le plan rapide est inchangé', () => {
  /* Ce lot ne rouvre pas V2.1.5 : la consigne rapide garde sa longueur mesurée et ses clauses. */
  /* V2.1.5.3 a délibérément allongé cette consigne : le registre de coût PERFREAL01E-15 en porte
     la mesure et la justification. L'épinglage suit la taille réelle, il ne la tolère pas. */
  /* V2.2.1-D2F1 — la consigne rapide a été allongée pour porter question_focus (+478 car.,
     coût inscrit dans T-PERFREAL01E-15). Ce contrôle vérifie qu'elle n'a pas été RACCOURCIE. */
  /* TARGETED-FIX-POST-CODEX-01 — la consigne s'allonge : le plan rapide doit désormais nommer
     CE QUI MANQUE, comme le plan profond le fait pour ses propres questions. Cette mesure est une
     caractérisation de taille, pas un invariant : elle dit qu'aucune consigne n'a grossi sans
     décision. */
  assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.length, 8627);
  /* V2.2 a retiré cette revendication d'autorité du plan rapide : la doctrine qu'il applique est
     celle d'OPRIE, et il le dit. La retenue mesurée, elle, est intacte. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /La doctrine ci-dessous n'est pas la vôtre/);
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /WAIT_FOR_DEEP_VALIDATION est EXCEPTIONNEL/);
  /* Et la consigne rapide ne parle pas de concerns : ce champ n'est pas de son ressort. */
  assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.includes('concerns'), false);
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq']);
});

test('V2151-12 : la haute disponibilité est inchangée', () => {
  assert.deepEqual([...CORE_PROVIDER_ORDER], ['anthropic', 'openai']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic']);
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  /* Une tentative par fournisseur, aucune reprise sur le même : la chaîne itère l'ordre, elle ne
     boucle pas sur un fournisseur. */
  assert.equal(/for\s*\(\s*let\s+\w+\s*=\s*0;[^)]*attempts?\s*<\s*\d/.test(worker), false,
    'aucune boucle de reprise interne au fournisseur');
});

test('V2151-13 : la reprise manuelle de l’interface est inchangée', () => {
  assert.match(html, /return oprieRunTurn\(adpState\.requestedMode\|\|'rapide',\{coreOnly:true\}\);/);
});

/* ==========================================================================
 * V2151-14 / 15 — LES HUIT FIXTURES, ET LE DÉFAUT VISÉ
 * ======================================================================= */

/* Les huit familles de la qualification V2.1.4, épinglées ici pour qu'un lot ultérieur ne puisse
   pas les ajuster discrètement afin de faire passer un correctif. Ce sont des DEMANDES, pas des
   attentes : aucun état n'est pré-écrit. */
const HUIT_FIXTURES = Object.freeze([
  ['A-voyage', 'Je veux préparer un voyage à Lisbonne au printemps.'],
  ['B-presentation', 'Je veux preparer une presentation de 20 minutes sur l intelligence artificielle pour mes collegues.'],
  ['C-reunion', 'Je veux organiser une reunion d equipe pour ameliorer la communication entre mes collaborateurs.'],
  ['D-stress', 'Nous devons organiser un temps collectif pour onze personnes, avec des tensions anciennes, des profils tres reserves, une salle incertaine, une duree a arbitrer entre deux heures et une demi-journee, un budget serre, un animateur non forme, sans exercice artificiel, avec des engagements concrets et un suivi ulterieur.'],
  ['E-simple', 'Explique la photosynthese a un enfant de 10 ans en exactement cinq paragraphes.'],
  ['F-externe', 'Compare les trois principales approches de stockage d energie stationnaire en 2026, avec leurs couts actuels et leurs limites techniques.'],
  ['G-clarif', 'Je veux ameliorer mon document.'],
  ['H-ready', 'Redige un tableau comparatif en markdown de trois methodes de sauvegarde, avec colonnes cout, delai de restauration et complexite, et une recommandation finale de trois lignes.']
]);

test('V2151-14 : les huit fixtures sont rejouées telles quelles, aucune n’a été ajustée', () => {
  assert.equal(HUIT_FIXTURES.length, 8);
  const familles = HUIT_FIXTURES.map(([nom]) => nom);
  assert.deepEqual(familles, ['A-voyage', 'B-presentation', 'C-reunion', 'D-stress',
    'E-simple', 'F-externe', 'G-clarif', 'H-ready']);
  /* Aucune fixture ne porte d'attente d'état : elles ne peuvent donc pas être « accordées » au
     correctif. Ce sont des demandes, et rien d'autre. */
  for (const [nom, demande] of HUIT_FIXTURES) {
    assert.equal(typeof demande, 'string');
    assert.ok(demande.length > 30, `${nom} : une vraie demande`);
    assert.equal(/operational_request_ready|clarification_required|degraded/.test(demande), false,
      `${nom} : aucune attente d'état dans la fixture`);
  }
});

test('V2151-15 : A-voyage ne peut plus dégrader par ready + concerns', () => {
  /* Le mécanisme du défaut, reproduit : c'est bien cette combinaison qui rendait la sortie
     invalide, donc `structured_output_invalid`, donc la bascule, donc `degraded_state`. */
  assert.throws(() => validateCoreOutput(sortieCore({ concerns: ['Le budget reste serré pour cinq jours.'] })),
    /operational_request_ready exige une liste concerns vide/);
  /* Et la consigne interdit désormais de la produire, dans les deux sens. */
  assert.match(CORE_SYSTEM_PROMPT, /jamais un ready accompagné de réserves/);
  /* La même sortie, réserve retirée par le MODÈLE et non par le code, est gouvernée. */
  assert.equal(validateCoreOutput(sortieCore({ concerns: [] })).turn.state, 'operational_request_ready');
  /* Enfin, la bascule reste réservée aux pannes : ce lot supprime une cause d'échec, il ne touche
     pas à la doctrine de repli. */
  assert.deepEqual([...CORE_PROVIDER_ORDER], ['anthropic', 'openai']);
});
