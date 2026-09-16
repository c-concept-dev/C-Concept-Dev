/* BETA-04 — STABILISATION : ATOMICITÉ, REPRISE APRÈS PANNE, ADAPTATEUR DE TRANSPORT.
 * ============================================================================
 *
 * Trois familles, et une décision produit qui les traverse.
 *
 * ATOMICITÉ (P0-B). La question réellement affichée en bêta était : « Qu'attendez-vous comme
 * résultat concret : un itinéraire jour par jour, une sélection de recommandations, une comparaison
 * d'options de transport et d'hébergement, une checklist de préparation, ou autre chose ? » Une
 * enveloppe `{type,text}` ne garantit pas UN besoin : elle garantit UN message. Le garde est
 * DÉTERMINISTE, par décision du propriétaire — zéro appel fournisseur supplémentaire. La première
 * version de ce lot faisait relire chaque candidate par un modèle ; c'était du temps ajouté sur le
 * chemin de la première interaction, là précisément où il faut en retirer.
 *
 * REPRISE (P0-C). Une panne du plan profond effaçait le dialogue et ramenait l'écran au départ. La
 * réponse est conservée, la question reste affichée, et réessayer rejoue le tour sans réécrire
 * l'historique.
 *
 * TRANSPORT (P1-A). Le schéma canonique est du JSON Schema générique et valide ; l'API Anthropic
 * refuse une énumération à type union. L'adaptation vit dans le transport, et le contrat canonique
 * n'est jamais muté.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  guardFastSolicitation, assessSolicitation, isRepeatedSolicitation,
  countInterrogations, countNamedAlternatives,
  guardDisplayedQuestion, isAtomicQuestion,
  DISPLAY_VERDICTS, SILENT_INTERACTION, SOLICITING_TYPES,
  SOLICITATION_VERDICTS
} from '../workers/shared/solicitation-policy.js';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { createTurnSnapshot, validateFastInteraction, FAST_INTERACTION_JSON_SCHEMA } from '../workers/shared/fast-interactive-plane.js';

/* TARGETED-FIX-POST-CODEX-01 — le contrat du plan rapide compte un QUATRIÈME champ nommé :
   l'identité du manque. Le contre-audit a démontré qu'une question rapide répondue laissait
   l'historique sans identité, si bien qu'une reformulation ultérieure du même manque par le plan
   profond n'était plus reconnue. L'invariant gardé ici est inchangé — le schéma reste clos et
   incapable de porter un état ; il s'allonge d'un fait produit par la même décision. */

const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
const ctx = {};
vm.runInNewContext(html.slice(html.indexOf('function schemaPourAnthropic('), html.indexOf('async function transportAnthropic(')) + ';this.adapt=schemaPourAnthropic', ctx);
const clone = (x) => JSON.parse(JSON.stringify(x));
const snapshot = createTurnSnapshot({ turn_id: 1, original_request: 'Demande abstraite.' });
/* V2.1.1 — CETTE FIXTURE A CHANGÉ, ET C'EST UNE DÉCISION PRODUIT. Elle valait « Quel résultat
 * principal souhaitez-vous obtenir ? ». Mesuré en bêta réelle, cette question a été affichée à la
 * personne et refusée par le propriétaire : elle lui demandait de concevoir ce que nous sommes
 * chargés de concevoir. Elle est donc devenue un cas NÉGATIF (voir V211-02), et la fixture qui doit
 * traverser le garde est désormais une question sur une variable du problème. */
const question = { type: 'ASK_CLARIFICATION', text: 'Combien de jours cela doit-il couvrir ?' };

/* La question exacte observée en bêta, conservée mot pour mot : c'est elle qu'il fallait refuser. */
const CATALOGUE_REEL = "Qu'attendez-vous comme résultat concret : un itinéraire jour par jour, une "
  + "sélection de recommandations, une comparaison d'options de transport et d'hébergement, une "
  + "checklist de préparation, ou autre chose ?";

/* ==========================================================================
 * T04-01 / 02 — CE QUI PASSE, ET CE QUI NE PASSE PAS
 * ======================================================================= */

test('T04-01 : une candidate non sollicitante traverse le garde inchangée', () => {
  for (const type of ['WAIT_FOR_DEEP_VALIDATION', 'ACKNOWLEDGE', 'ORIENT_ARCHITECTE']) {
    const candidate = { type, text: 'Rien à demander.' };
    assert.deepEqual(guardFastSolicitation(candidate, snapshot), candidate,
      'le garde ne juge que les sollicitations : il n’invente jamais de question');
  }
});

test('T04-02 : un besoin déterminant atomique passe intact', () => {
  for (const texte of ['Combien de jours dure votre séjour ?', 'Quel est votre budget total ?',
                       'À quelle date cela doit-il être prêt ?',
                       'Souhaitez-vous partir en semaine ou le week-end ?',
                       'Où souhaitez-vous séjourner ?']) {
    const candidate = { type: 'ASK_CLARIFICATION', text: texte };
    assert.deepEqual(guardFastSolicitation(candidate, snapshot), candidate, `« ${texte} »`);
  }
});

/* ==========================================================================
 * T04-03 — UNE SOLLICITATION NON ATOMIQUE EST REFUSÉE, SANS RÉÉCRITURE
 * ======================================================================= */

test('T04-03 : un catalogue de livrables est refusé, et rien n’est réécrit', () => {
  /* V2.2.1-D2F1 — la candidate déclare ce qu'elle interroge ; le garde ne le devine plus. */
  const out = guardFastSolicitation({ type: 'ASK_CLARIFICATION', text: CATALOGUE_REEL, question_focus: 'output_specification' }, snapshot);
  assert.deepEqual(out, SILENT_INTERACTION, 'le silence, jamais une question reformulée');
  /* V2.2.1-D2B — LE COMPORTEMENT N'A PAS BOUGÉ ; LE MOTIF DU REFUS EST DEVENU LE BON.
   *
   * Ce catalogue commence par « Qu'attendez-vous comme résultat concret : … » — c'est mot pour mot
   * l'une des huit paraphrases que V211-03 déclare méta. `assessSolicitation` teste META AVANT
   * CATALOGUE ; il rendait pourtant CATALOGUE, parce que le « ou » final de l'énumération
   * déclenchait le signal de rattrapage destiné à l'interrogatif « où » et annulait le verdict méta.
   * Le dépôt affirmait donc deux choses contraires sur la même phrase. La correction rend la
   * précédence déclarée effective. Le refus, lui, est identique : le silence, et aucune réécriture. */
  assert.equal(assessSolicitation({ text: CATALOGUE_REEL, question_focus: 'output_specification' }, []), 'META_OUTPUT_QUESTION');
  /* Le garde ne propose aucune variante : réécrire une question serait inventer un besoin. */
  assert.equal(out.text.includes('itinéraire'), false);
});

test('T04-03b : plusieurs interrogations dans une enveloppe sont refusées', () => {
  for (const texte of ['Quel est votre budget et combien de jours partez-vous ?',
                       'Quel rythme, quel budget et quels centres d’intérêt souhaitez-vous ?']) {
    assert.equal(assessSolicitation({ text: texte }, []), 'MULTIPLE_QUESTIONS', `« ${texte} »`);
    assert.deepEqual(guardFastSolicitation({ type: 'ASK_CLARIFICATION', text: texte }, snapshot), SILENT_INTERACTION);
  }
});

test('T04-03c : le garde ne coûte aucun appel fournisseur', () => {
  /* La preuve est structurelle : la fonction est synchrone et ne reçoit aucun exécuteur. Un appel
     réseau supplémentaire sur le chemin de la première interaction serait du temps ajouté là où le
     lot doit en retirer. */
  const source0 = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
  assert.match(source0, /export function guardFastSolicitation\(candidate, snapshot = \{\}\) \{/,
    'deux paramètres seulement : aucun exécuteur de relecture à passer');
  const out = guardFastSolicitation(question, snapshot);
  assert.equal(typeof out.then, 'undefined', 'aucune promesse : rien à attendre');
  const source = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
  for (const transport of ['fetch(', 'callGroq', 'callAnthropic', 'callOpenAi', 'await ']) {
    assert.equal(source.includes(transport), false, `le garde ne contient aucun transport : ${transport}`);
  }
});

/* ==========================================================================
 * T04-09 / 10 — LE GARDE NE DEVIENT PAS UNE AUTORITÉ
 * ======================================================================= */

test('T04-09 : une sollicitation refusée rend le silence, qui n’ouvre aucune question', () => {
  /* Le décompte « zéro plan profond avant la première question » est figé par T-DN01-A ; ici on
     éprouve que le refus produit bien le type qui LAISSE le plan profond partir. */
  assert.equal(SILENT_INTERACTION.type, 'WAIT_FOR_DEEP_VALIDATION');
  assert.equal(SOLICITING_TYPES.includes(SILENT_INTERACTION.type), false);
  assert.deepEqual(Object.keys(SILENT_INTERACTION).sort(), ['text', 'type']);
});

test('T04-10 : le plan rapide ne peut pas émettre READY, et le garde n’en fabrique pas', () => {
  assert.equal(validateFastInteraction({ type: 'operational_request_ready', text: 'Prêt' }, snapshot).ok, false);
  /* V2.2.1-D2F1 — trois champs, aucun n'étant un état : l'incapacité vérifiée ici est intacte. */
  assert.deepEqual(Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties).sort(), ['missing_determinant_id', 'question_focus', 'text', 'type']);
  /* Et le verdict du garde ne voyage pas : il ne sort jamais de la fonction. */
  const out = guardFastSolicitation({ type: 'ASK_CLARIFICATION', text: CATALOGUE_REEL, question_focus: 'output_specification' }, snapshot);
  assert.deepEqual(Object.keys(out).sort(), ['text', 'type']);
});

/* ==========================================================================
 * T04-19 / 20 — PAS DE RÉPÉTITION, PAS DE FUITE
 * ======================================================================= */

test('T04-19 : une question déjà répondue n’est pas reposée', () => {
  const history = [{ question: question.text, answer: 'Une synthèse.' }];
  assert.ok(isRepeatedSolicitation('COMBIEN de jours cela doit-il couvrir?', history),
    'casse et ponctuation ne font pas une question différente');
  assert.deepEqual(guardFastSolicitation(question, { ...snapshot, clarification_history: history }), SILENT_INTERACTION);
  /* Une question posée mais restée SANS réponse peut être reposée : l'historique ne la clôt pas. */
  assert.equal(isRepeatedSolicitation(question.text, [{ question: question.text, answer: '' }]), false);
});

test('T04-20 : le garde ne lit que l’historique du tour qui lui est passé', () => {
  /* Le garde n’a aucune mémoire propre : deux tours identiques, historique vide, même verdict.
   * Un compteur caché se trahirait ici. */
  assert.deepEqual(guardFastSolicitation(question, snapshot), question, 'premier appel : la question passe');
  assert.deepEqual(guardFastSolicitation(question, snapshot), question, 'second appel : rien n’a été retenu');
  assert.equal(isRepeatedSolicitation(question.text, undefined), false, 'aucun historique : rien à répéter');
  /* L’historique passé EST la conversation : le garde ne connaît pas de « conversation étrangère ».
   * Ce qu’il y lit, c’est ce qui a DÉJÀ été demandé — et cela seul ferme une question. */
  const deja = [{ question: question.text, answer: 'Réponse obtenue' }];
  assert.deepEqual(guardFastSolicitation(question, { ...snapshot, clarification_history: deja }),
    SILENT_INTERACTION, 'une question déjà répondue ne repart pas');
  const autreSujet = [{ question: 'Question d’un autre sujet ?', answer: 'Réponse obtenue' }];
  assert.deepEqual(guardFastSolicitation(question, { ...snapshot, clarification_history: autreSujet }),
    question, 'une réponse sur un autre point ne ferme pas une question encore utile');
});

/* ==========================================================================
 * T04-21 — LE BUDGET D’UNE SEULE SOLLICITATION, ET LA GRAMMAIRE DE COMPTAGE
 *
 * P0-D : le sur-questionnement observé en bêta venait de deux causes distinctes. La seconde
 * question après réponse (aucun budget) et le comptage des interrogatifs, qui prenait le « que »
 * conjonction de « Quel texte souhaitez-vous que je corrige ? » pour une deuxième interrogation et
 * faisait taire une question légitime et atomique.
 * ======================================================================= */

test('T04-21 : après une réponse obtenue, une nouvelle question déterminante reste possible', () => {
  /* V2.1 — CE TEST A CHANGÉ DE CONTENU, ET LA RAISON EST MESURÉE. Il asservissait un quota d'UNE
     sollicitation par conversation, posé au lot BETA-04 contre un sur-questionnement alors réel :
     à l'époque, une question du plan rapide n'arrêtait pas le plan profond. Le court-circuit IA-04
     l'arrête désormais, et le plan rapide EST la boucle de clarification. Sur le dialogue réel du
     propriétaire — quatre tours — le quota faisait taire le plan rapide dès la première réponse, et
     chaque question suivante venait du plan profond : environ vingt-cinq secondes pour demander une
     durée ou un budget, contre un contrat de fluidité de une à deux secondes.
     Ce qui borne le questionnement reste asservi ici : une question nouvelle doit être nouvelle, et
     une question déjà répondue ne repart jamais. */
  const repondu = [{ question: 'Combien de jours dure votre séjour ?', answer: 'Quatre jours' }];
  assert.equal(assessSolicitation({ type: 'ASK_CLARIFICATION', text: 'Quel est votre budget total ?' },
    repondu), 'ALLOW', 'une information encore manquante peut être demandée au tour suivant');
  assert.equal(assessSolicitation({ type: 'ASK_CLARIFICATION', text: 'Combien de jours dure votre séjour ?' },
    repondu), 'ALREADY_ANSWERED', 'mais jamais celle qui a déjà reçu sa réponse');
  assert.equal(SOLICITATION_VERDICTS.includes('ALREADY_SOLICITED'), false, 'le quota n’existe plus');
});

test('T04-21b : un subordonnant n’est pas une seconde interrogation', () => {
  for (const atomique of ['Quel texte souhaitez-vous que je corrige ?',
                          'Quel public visez-vous pour que le ton soit juste ?',
                          'Quelle est la quantité attendue ?']) {
    assert.equal(countInterrogations(atomique), 1, `« ${atomique} » ne porte qu’UN besoin`);
    assert.deepEqual(guardFastSolicitation({ type: 'ASK_CLARIFICATION', text: atomique }, snapshot),
      { type: 'ASK_CLARIFICATION', text: atomique }, 'une question atomique n’est jamais tue');
  }
  /* Deux interrogations coordonnées restent deux : c’est la coordination qui compte, pas le mot. */
  assert.equal(countInterrogations('Quel est votre budget et combien de jours partez-vous ?'), 2);
  assert.equal(countInterrogations('Quel format, et pour quel public ?'), 2,
    'la coordination compte même détachée du second interrogatif');
});

test('T04-21e : un type non sollicitant sans texte devient le silence, pas une panne', () => {
  /* Mesuré sur le runtime déployé : cinq demandes sur huit recevaient un HTTP 502 parce que le
     modèle rendait le bon type avec un texte vide. La conclusion « rien à demander » était juste,
     et elle était perdue. */
  for (const type of ['WAIT_FOR_DEEP_VALIDATION', 'ACKNOWLEDGE', 'ORIENT_ARCHITECTE']) {
    for (const texte of ['', '   ', null, undefined]) {
      assert.deepEqual(guardFastSolicitation({ type, text: texte }, snapshot), SILENT_INTERACTION,
        `${type} sans texte : le silence nommé, jamais un refus de schéma`);
    }
  }
  /* Une sollicitation vide, elle, n'est jamais complétée : on ne fabrique pas une question. */
  for (const type of SOLICITING_TYPES) {
    assert.equal(assessSolicitation({ type, text: '' }, []), 'EMPTY');
    assert.deepEqual(guardFastSolicitation({ type, text: '  ' }, snapshot), SILENT_INTERACTION);
  }
  /* Et un texte réel n'est jamais remplacé. */
  const acquitte = { type: 'ACKNOWLEDGE', text: 'Bien reçu.' };
  assert.deepEqual(guardFastSolicitation(acquitte, snapshot), acquitte);
});

test('T04-21d : un matériau présent ferme la sollicitation rapide, quoi que dise le modèle', () => {
  /* Mesuré sur le runtime déployé : avec un matériau fourni, le modèle rapide a redemandé le texte
     que la personne venait de coller. La consigne le lui interdisait déjà ; le garde le rend vrai. */
  const avecMateriau = createTurnSnapshot({
    turn_id: 1, original_request: 'Corrige ce texte en conservant le sens', material_present: true });
  const redemande = { type: 'ASK_CLARIFICATION', text: 'Quel texte souhaitez-vous que je corrige ?' };
  assert.equal(assessSolicitation(redemande, [], true), 'MATERIAL_PRESENT');
  assert.deepEqual(guardFastSolicitation(redemande, avecMateriau), SILENT_INTERACTION,
    'le plan rapide ne voit pas le matériau : il ne peut donc pas juger ce qui lui manque');
  /* Sans matériau, la même question est légitime et atomique : elle passe. */
  const sansMateriau = createTurnSnapshot({ turn_id: 1, original_request: 'Corrige ce texte' });
  assert.deepEqual(guardFastSolicitation(redemande, sansMateriau), redemande,
    'la même question reste licite quand rien n’a été fourni');
  /* Le silence n’est pas un refus d’aider : le plan profond, lui, reçoit le matériau. */
  assert.equal(SILENT_INTERACTION.type, 'WAIT_FOR_DEEP_VALIDATION');
  /* Une candidate non sollicitante traverse, matériau ou non : le garde ne fabrique jamais rien. */
  const accuse = { type: 'ACKNOWLEDGE', text: 'Bien reçu.' };
  assert.deepEqual(guardFastSolicitation(accuse, avecMateriau), accuse);
});

test('T04-21c : la présence du matériau voyage jusqu’au plan rapide, jamais son contenu', () => {
  const avec = createTurnSnapshot({ turn_id: 1, original_request: 'Corrige ce texte.', material_present: true });
  const sans = createTurnSnapshot({ turn_id: 1, original_request: 'Corrige ce texte.' });
  assert.equal(avec.material_present, true, 'un matériau fourni est signalé');
  assert.equal(sans.material_present, false, 'par défaut : aucun matériau');
  assert.equal(JSON.stringify(avec).includes('material_present'), true);
  /* Présence seulement : ni titre, ni extrait, ni longueur du document ne traversent. */
  const cle = createTurnSnapshot({ turn_id: 1, original_request: 'x',
    material_present: { titre: 'contrat.txt', extrait: 'clause confidentielle' } });
  assert.equal(cle.material_present, false, 'seul le booléen vrai vaut présence : rien d’autre ne passe');
  /* Le prompt rapide sait quoi en faire, et l’instruction est adressée au champ transmis. */
  const src = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
  assert.match(src, /materiau_fourni/, 'le champ est exposé au modèle');
  assert.match(src, /Si materiau_fourni vaut true, le contenu à traiter est déjà là/,
    'le modèle est instruit de ne jamais redemander un matériau fourni');
});

/* ==========================================================================
 * T04-18 — AUCUN MOT DE DOMAINE DANS LE GARDE
 * ======================================================================= */

test('T04-18b : la famille des verdicts est fermée, et chacun est atteignable', () => {
  /* Un verdict qu'on ne peut pas obtenir est une branche morte ; un verdict hors liste serait une
     décision non déclarée. Les deux sont vérifiés ici, sur la liste elle-même. */
  assert.deepEqual([...SOLICITATION_VERDICTS],
    ['ALLOW', 'MULTIPLE_QUESTIONS', 'CATALOGUE', 'ALREADY_ANSWERED', 'MATERIAL_PRESENT',
     'META_OUTPUT_QUESTION', 'EMPTY']);
  const obtenus = new Set([
    assessSolicitation(question, []),
    /* V2.2.1-D2B — le catalogue RÉEL est aussi une question méta, et il est désormais classé comme
       tel (cf. T04-03). Le témoin de CATALOGUE est donc une énumération qui ne nomme PAS notre
       production : c'est la seule façon d'atteindre ce verdict sans passer par le précédent. */
    assessSolicitation({ type: 'ASK_CLARIFICATION', text: 'Souhaitez-vous convier : les partenaires, les fournisseurs, les élus, ou les riverains ?' }, []),
    assessSolicitation({ type: 'ASK_CLARIFICATION', text: 'Quel budget et combien de jours ?' }, []),
    assessSolicitation({ type: 'ASK_CLARIFICATION', text: '' }, []),
    assessSolicitation(question, [{ question: question.text, answer: 'déjà répondu' }]),
    assessSolicitation(question, [], true),
    assessSolicitation({ type: 'ASK_CLARIFICATION', text: 'Quel type de résultat attendez-vous ?', question_focus: 'output_specification' }, [])
  ]);
  for (const verdict of SOLICITATION_VERDICTS) {
    assert.ok(obtenus.has(verdict), `${verdict} est réellement atteignable`);
  }
});

test('T04-18 : le garde est grammatical, jamais métier', () => {
  const source = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
  const code = source.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  for (const domaine of ['voyage', 'malaga', 'itinéraire', 'budget', 'présentation', 'checklist',
                         'hébergement', 'transport', 'cadeau', 'recette']) {
    assert.equal(new RegExp(domaine, 'i').test(code), false, `« ${domaine} » n’a rien à faire dans le garde`);
  }
  /* Les deux seuils employés séparent le singulier du pluriel ; ils sont nommés, pas cachés. */
  assert.equal(countInterrogations('Quel est votre budget et combien de jours partez-vous ?'), 2);
  assert.equal(countNamedAlternatives(CATALOGUE_REEL), 4);
  assert.equal(countNamedAlternatives('Souhaitez-vous partir en semaine ou le week-end ?'), 1);
});

/* ==========================================================================
 * T04-05 / 06 — REPRISE APRÈS PANNE : CLIC ET ENTRÉE, SANS DOUBLON
 * ======================================================================= */

test('T04-05 : une panne du plan profond conserve le dialogue et sa réponse', () => {
  const bloc = html.slice(html.indexOf('function oprieKeepFailedDialogue('), html.indexOf('function oprieShowBlocked('));
  assert.match(bloc, /state\.answers\[state\.answers\.length-1\]/, 'la dernière réponse est relue, non redemandée');
  assert.match(bloc, /\$\('#v11-answer'\)\.value=last\.answer/, 'et réaffichée telle quelle');
  assert.match(bloc, /oprieState\.retryTurn=true/, 'le tour suivant sera une reprise, pas une saisie');
  /* Les deux chemins d'échec l'appellent, et n'effacent l'écran que s'il n'y a rien à conserver. */
  for (const fn of ['function oprieShowDegraded(', 'function oprieShowNetworkFailure(']) {
    const corps = html.slice(html.indexOf(fn), html.indexOf('}', html.indexOf('v11ShowRapidGate', html.indexOf(fn))));
    assert.match(corps, /if\(!oprieKeepFailedDialogue\(\)\)show\(null\)/, fn);
  }
});

test('T04-06 : la touche Entrée vaut le clic, et la reprise ne duplique pas la réponse', () => {
  const init = html.slice(html.indexOf("$('#v11-answer-continue').addEventListener('click'"), html.indexOf("$('#v11-add-clarification-document')"));
  assert.match(init, /\$\('#v11-answer'\)\.addEventListener\('keydown'/, 'la saisie écoute le clavier');
  assert.match(init, /e\.key==='Enter'&&!e\.shiftKey&&!e\.isComposing/, 'Entrée seule valide ; Maj+Entrée reste un retour à la ligne');
  assert.match(init, /\$\('#v11-answer-continue'\)\.click\(\)/, 'et passe par le même chemin que le clic');
  /* La reprise rejoue le tour AVANT toute écriture d'historique : la réponse n'entre pas deux fois. */
  const aq = html.slice(html.indexOf('function answerQuestion(answer){'), html.indexOf('function resetAll('));
  const repriseIdx = aq.indexOf('oprieState.retryTurn');
  const pushIdx = aq.indexOf('state.answers.push');
  assert.ok(repriseIdx !== -1 && pushIdx !== -1 && repriseIdx < pushIdx,
    'la branche de reprise précède l’écriture de l’historique');
});

/* ==========================================================================
 * T04-11 — ADAPTATEUR DE TRANSPORT ANTHROPIC (repris du travail Codex, inchangé)
 * ======================================================================= */

test('T04-11 : nullable enum, tableaux imbriqués, valeurs et null conservés sans mutation', () => {
  const canonical = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { conflict: { type: ['string', 'null'], enum: ['logical_contradiction', 'constraint_tension', 'priority_conflict', null] } } } } } };
  const before = clone(canonical), adapted = clone(ctx.adapt(canonical));
  assert.deepEqual(canonical, before, 'le schéma canonique n’est jamais muté');
  const branches = adapted.properties.items.items.properties.conflict.anyOf;
  assert.deepEqual(branches, [{ type: 'string', enum: ['logical_contradiction', 'constraint_tension', 'priority_conflict'] }, { type: 'null', enum: [null] }]);
  assert.deepEqual(clone(ctx.adapt(adapted)), adapted, 'l’adaptation est idempotente');
});

test('T04-11b : les annotations et valeurs par défaut ne sont pas transformées', () => {
  const value = { type: ['string', 'null'], enum: ['x', null] };
  assert.deepEqual(clone(ctx.adapt({ type: 'object', default: value })).default, value);
});

test('T04-11c : contrainte anyOf existante conservée par conjonction', () => {
  const s = { type: ['string', 'null'], enum: ['x', null], anyOf: [{ type: 'string' }] };
  const out = clone(ctx.adapt(s));
  assert.deepEqual(out.anyOf, s.anyOf);
  assert.equal(out.allOf[0].anyOf.length, 2);
});

/* ==========================================================================
 * T04-22 — LES DEUX ÉCHECS OWNER-BETA RÉELS. RÉGRESSION OBLIGATOIRE.
 *
 * Le propriétaire a testé « Je veux préparer un voyage à Lisbonne au printemps. » et obtenu, après
 * une très longue attente, un catalogue de productions. Deux fois, indépendamment. Les deux textes
 * sont conservés ICI, mot pour mot, parce qu'ils sont la seule preuve non négociable de ce défaut.
 *
 * Origine établie par mesure sur le runtime déployé, non supposée : l'ANALYSTE les écrit dans
 * `question_candidates`, l'ARBITRE les recopie dans `next_question`. Le garde d'atomicité les
 * reconnaissait déjà — il ne tournait jamais sur cette sortie.
 * ======================================================================= */

const OWNER_BETA_1 = "Quel type de résultat vous serait le plus utile : un itinéraire structuré jour "
  + "par jour, une sélection de recommandations par thème (visites, restaurants, quartiers…), une "
  + "checklist pratique de préparation, ou autre chose ?";

const OWNER_BETA_2 = "Quel type de résultat attendez-vous : un itinéraire jour par jour, une "
  + "sélection de lieux incontournables (activités, restaurants, hébergements), une checklist "
  + "logistique, des conseils pratiques, ou autre chose ?";

/* Observée sur mon propre relevé du plan profond : deux besoins coordonnés, puis une énumération. */
const DEEP_COORDONNEE = "Pour combien de personnes organisez-vous ce week-end, et quel est leur "
  + "profil — par exemple : voyage en couple, famille avec enfants, groupe d'amis, ou solo ?";

test('T04-22 : les deux questions owner-beta réelles ne peuvent pas être affichées', () => {
  for (const question of [OWNER_BETA_1, OWNER_BETA_2, DEEP_COORDONNEE]) {
    assert.equal(isAtomicQuestion(question), false, 'un catalogue n’est pas une question atomique');
    const garde = guardDisplayedQuestion(question, {});
    assert.notEqual(garde.verdict, 'ALLOW', 'elle ne passe jamais telle quelle');
    assert.ok(DISPLAY_VERDICTS.includes(garde.verdict));
    /* V2.2.1-D2 FINAL — L'INVARIANT EST INCHANGÉ, IL EST SEULEMENT PLUS FORT.
     *
     * Ce test exigeait que « ce qui sort » soit atomique. Il pouvait l'exiger parce qu'il sortait
     * TOUJOURS quelque chose : à défaut de mieux, une question constante fabriquée par la frontière.
     * Cette question n'existe plus. Il y a donc deux façons pour ces trois-là de ne pas être
     * affichées : sortir sous une forme atomique, ou ne pas sortir du tout — et la seconde est la
     * plus forte des deux. Ce qui reste interdit, dans les deux cas, est qu'un catalogue atteigne
     * l'écran. */
    if (garde.text === null) {
      assert.equal(garde.verdict, 'NOT_DISPLAYABLE', 'rien à afficher, et la frontière le dit');
      continue;
    }
    assert.equal(isAtomicQuestion(garde.text), true, 'ce qui sort est atomique');
    /* Et ce qui sort ne propose plus aucune production : c'est la définition du défaut. */
    assert.equal(/ou autre chose/i.test(garde.text), false);
    assert.equal((garde.text.match(/,/gu) || []).length <= 1, true, 'plus d’énumération');
    assert.equal((garde.text.match(/\?/gu) || []).length, 1, 'une seule interrogation');
  }
});

test('T04-22b : une candidate atomique du même tour est préférée à toute réécriture', () => {
  /* Le tour réel contenait les DEUX : le catalogue, et une question atomique. Le système fabriquait
     déjà la bonne forme ; il affichait l'autre. Aucune invention n'est donc nécessaire. */
  const candidates = [
    { text: OWNER_BETA_1 },
    { text: 'Combien de jours prévoyez-vous de passer sur place ?' }
  ];
  const garde = guardDisplayedQuestion(OWNER_BETA_1, { candidates });
  assert.equal(garde.verdict, 'REPLACED');
  assert.equal(garde.text, 'Combien de jours prévoyez-vous de passer sur place ?');
});

test('T04-22c : ce qu’une coupure produisait, la frontière le REFUSE désormais', () => {
  /* RECLASSIFICATION — HISTORICAL_IMPLEMENTATION_CONTRACT (FINAL-TARGETED-FIX).
   *
   * CE QUE CE TEST GARDAIT. Il vérifiait que `reduceQuestionDeterministically` coupait sans rédiger :
   * chaque mot du résultat venait du texte d'origine. L'argument était honnête et il était insuffisant.
   * Un texte dont chaque mot est emprunté reste un texte que PERSONNE n'a écrit, et il repartait avec
   * les métadonnées de la question ENTIÈRE — identité du manque, inconnue visée, progression annoncée
   * décrivaient alors autre chose que ce que la personne lisait à l'écran.
   *
   * POURQUOI LA COUPURE NE POUVAIT PAS ÊTRE RENDUE CORRECTE. Recalculer les métadonnées sur le
   * fragment demanderait de décider, après coup et hors autorité, quel manque le fragment interroge.
   * Ce serait exactement la seconde autorité sémantique que l'architecture interdit. Il ne restait
   * donc que deux issues honnêtes : afficher la question telle qu'elle a été écrite, ou ne pas
   * l'afficher.
   *
   * CE QUI EST GARDÉ MAINTENANT, et qui est plus fort : le catalogue n'atteint pas l'écran, ET rien
   * ne le remplace par un texte sans auteur. */
  const garde = guardDisplayedQuestion(OWNER_BETA_1, {});
  assert.equal(garde.verdict, 'NOT_DISPLAYABLE');
  assert.equal(garde.text, null, 'aucun fragment fabriqué par la frontière');
  /* Et la seule substitution encore permise reste une question COMPLÈTE du même tour. */
  const remplacee = guardDisplayedQuestion(OWNER_BETA_1, {
    candidates: [{ text: 'Combien de jours prévoyez-vous de passer sur place ?' }]
  });
  assert.equal(remplacee.verdict, 'REPLACED');
  assert.equal(remplacee.text, 'Combien de jours prévoyez-vous de passer sur place ?');
  /* Un catalogue SANS déterminants était déjà refusé sans texte de repli : V2.2.1-D2 FINAL avait
     retiré la question constante que la frontière fabriquait. Ce lot supprime la dernière écriture
     qui restait — la coupure — et les deux cas se rejoignent sur le même verdict. */
  assert.equal(isAtomicQuestion('Itinéraire, recommandations, checklist, ou autre chose ?'), false);
  const repli = guardDisplayedQuestion('Itinéraire, recommandations, checklist, ou autre chose ?', {});
  assert.equal(repli.verdict, 'NOT_DISPLAYABLE');
  assert.equal(repli.text, null, 'aucun texte fabriqué par la frontière');
});

test('T04-22f : une parenthèse qui énumère est plusieurs dimensions dans une question', () => {
  /* Mesuré sur le runtime déployé après la première correction : la tête interrogative était
     parfaite, et la parenthèse proposait trois dimensions. C'est le même défaut, déplacé. */
  const avecParenthese = 'Quel type de CV souhaitez-vous produire (format, contenu, objectif professionnel…) ?';
  assert.equal(isAtomicQuestion(avecParenthese), false);
  const garde = guardDisplayedQuestion(avecParenthese, {});
  /* FINAL-TARGETED-FIX — ce test attendait la tête interrogative, coupée de sa parenthèse. Ce qui
     est mesuré ici reste le DÉFAUT — une parenthèse qui énumère n'est pas une question atomique ;
     seule la sanction change : la frontière refuse au lieu de couper. */
  assert.equal(garde.verdict, 'NOT_DISPLAYABLE');
  assert.equal(garde.text, null);
  /* Une parenthèse qui précise, sans énumérer, ne gêne personne : elle reste. */
  const precision = 'Combien de jours (environ) partez-vous ?';
  assert.equal(isAtomicQuestion(precision), true);
  assert.deepEqual(guardDisplayedQuestion(precision, {}), { verdict: 'ALLOW', text: precision });
});

test('T04-22d : la frontière protège la sortie du plan profond, sans toucher à l’autorité', () => {
  const tour = Object.freeze({
    state: 'clarification_required',
    next_question: Object.freeze({ text: OWNER_BETA_1, targets_issue_id: 'I2', expected_progress: 'x' }),
    operational_request_candidate: Object.freeze({ a: 1 }),
    issues: Object.freeze([]),
    reason: 'r'
  });
  /* TARGETED-FIX-POST-CODEX-01 — CE TEST GARDAIT L'INCOHÉRENCE QU'IL CROYAIT INNOCENTE.
   *
   * Il affirmait qu'après un remplacement le texte venait de la candidate ET que les métadonnées
   * restaient celles de la question REFUSÉE — « seule la FORME change ». Le contre-audit a montré
   * ce que cela produit : on affiche une question qui interroge un manque, sous l'identité d'un
   * autre. Tout ce qui dépend ensuite de cette identité — la non-répétition, l'inconnue visée, la
   * progression annoncée — désigne alors autre chose que ce que la personne lit.
   *
   * CLASSIFICATION : HISTORICAL_IMPLEMENTATION_CONTRACT. L'invariant réel, celui que ce test voulait
   * tenir, est conservé et renforcé : la frontière ne touche NI l'état, NI le candidat, NI la
   * readiness. Ce qui change est qu'une question substituée est décrite ENTIÈREMENT par la
   * candidate — ici sans métadonnées, donc sans métadonnées héritées. */
  const analyste = { question_candidates: [{ text: 'Combien de jours partez-vous ?' }] };
  const garde = applyDisplayGuardToTurn(tour, analyste);
  assert.equal(garde.next_question.text, 'Combien de jours partez-vous ?');
  assert.equal(garde.state, tour.state);
  assert.equal(garde.next_question.targets_issue_id, null,
    'la candidate n’en déclare aucune : rien n’est hérité de la question refusée');
  assert.equal(garde.next_question.expected_progress, null);
  assert.deepEqual(garde.operational_request_candidate, tour.operational_request_candidate);
  assert.equal(garde.reason, tour.reason);
  /* Une question déjà atomique traverse sans être recopiée ni reformulée. */
  const propre = { ...tour, next_question: { ...tour.next_question, text: 'Combien de jours partez-vous ?' } };
  assert.equal(applyDisplayGuardToTurn(propre, analyste), propre, 'aucun objet neuf sans raison');
  /* Un tour sans question n'est pas touché : le garde ne fabrique jamais de question. */
  const sansQuestion = { ...tour, state: 'operational_request_ready', next_question: null };
  assert.equal(applyDisplayGuardToTurn(sansQuestion, analyste), sansQuestion);
});

test('T04-22e : toute question affichée passe par la porte, quelle qu’en soit la source', () => {
  /* L'invariant est vérifié sur le CHEMIN, pas seulement sur la fonction : l'orchestrateur applique
     le garde au tour rendu, donc à la question affichée, d'où qu'elle vienne — Analyste, Critique,
     Arbitre, repli, mode dégradé ou reprise. */
  const source = fs.readFileSync(new URL('../workers/shared/operational-request-orchestrator.js', import.meta.url), 'utf8');
  /* V2.2.1-D2F2 — le texte de la demande n'atteint plus ce garde : les trois faits qui portent
     l'exception sont désormais canoniques et voyagent DANS le tour. */
  /* TRACER-REMEDIATION-02 · F5 — un argument de plus, et il est nommé : l'historique de
     clarification. La frontière y lit l'IDENTITÉ des manques déjà sollicités, pour ne pas afficher
     une question qui redemande la même chose sous une autre formulation. Elle ne lit toujours pas le
     texte de la demande, et ne décide toujours aucun état. */
  assert.match(source, /const turn = applyDisplayGuardToTurn\(outputs\.arbiter, outputs\.analyst, log, input && input\.clarification_history\);/,
    'le tour rendu est gardé, et il l’est avant tout contrôle d’état');
  assert.match(source, /import \{ guardDisplayedQuestion \} from "\.\/solicitation-policy\.js"/,
    'le garde employé est celui du plan rapide : une seule définition de l’atomicité');
  /* Et le verdict est journalisé sans le texte : la question porte des mots de la personne. */
  assert.match(source, /event: "displayed_question_guard", verdict: garde\.verdict/);
  assert.equal(/displayed_question_guard[^}]*text:/.test(source), false, 'aucun texte journalisé');
});
