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
  countInterrogations, countNamedAlternatives, countAnsweredSolicitations,
  SILENT_INTERACTION, SOLICITING_TYPES
} from '../workers/shared/solicitation-policy.js';
import { createTurnSnapshot, validateFastInteraction, FAST_INTERACTION_JSON_SCHEMA } from '../workers/shared/fast-interactive-plane.js';

const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
const ctx = {};
vm.runInNewContext(html.slice(html.indexOf('function schemaPourAnthropic('), html.indexOf('async function transportAnthropic(')) + ';this.adapt=schemaPourAnthropic', ctx);
const clone = (x) => JSON.parse(JSON.stringify(x));
const snapshot = createTurnSnapshot({ turn_id: 1, original_request: 'Demande abstraite.' });
const question = { type: 'ASK_CLARIFICATION', text: 'Quel résultat principal souhaitez-vous obtenir ?' };

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
                       'Quel résultat principal souhaitez-vous obtenir ?',
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
  const out = guardFastSolicitation({ type: 'ASK_CLARIFICATION', text: CATALOGUE_REEL }, snapshot);
  assert.deepEqual(out, SILENT_INTERACTION, 'le silence, jamais une question reformulée');
  assert.equal(assessSolicitation({ text: CATALOGUE_REEL }, []), 'CATALOGUE');
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
  assert.deepEqual(Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties).sort(), ['text', 'type']);
  /* Et le verdict du garde ne voyage pas : il ne sort jamais de la fonction. */
  const out = guardFastSolicitation({ type: 'ASK_CLARIFICATION', text: CATALOGUE_REEL }, snapshot);
  assert.deepEqual(Object.keys(out).sort(), ['text', 'type']);
});

/* ==========================================================================
 * T04-19 / 20 — PAS DE RÉPÉTITION, PAS DE FUITE
 * ======================================================================= */

test('T04-19 : une question déjà répondue n’est pas reposée', () => {
  const history = [{ question: question.text, answer: 'Une synthèse.' }];
  assert.ok(isRepeatedSolicitation('QUEL résultat principal souhaitez-vous obtenir?', history),
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
   * Une sollicitation déjà répondue y consomme le budget, quel qu’en soit le sujet. */
  const deja = [{ question: 'Question d’un autre sujet ?', answer: 'Réponse obtenue' }];
  assert.deepEqual(guardFastSolicitation(question, { ...snapshot, clarification_history: deja }),
    SILENT_INTERACTION, 'une réponse déjà obtenue ferme le budget de sollicitation');
});

/* ==========================================================================
 * T04-21 — LE BUDGET D’UNE SEULE SOLLICITATION, ET LA GRAMMAIRE DE COMPTAGE
 *
 * P0-D : le sur-questionnement observé en bêta venait de deux causes distinctes. La seconde
 * question après réponse (aucun budget) et le comptage des interrogatifs, qui prenait le « que »
 * conjonction de « Quel texte souhaitez-vous que je corrige ? » pour une deuxième interrogation et
 * faisait taire une question légitime et atomique.
 * ======================================================================= */

test('T04-21 : après une réponse obtenue, aucune seconde sollicitation', () => {
  const repondu = [{ question: 'Combien de jours dure votre séjour ?', answer: 'Quatre jours' }];
  assert.equal(assessSolicitation({ type: 'ASK_CLARIFICATION', text: 'Quel est votre budget total ?' },
    repondu), 'ALREADY_SOLICITED', 'le budget est de UNE sollicitation par conversation');
  const posee_sans_reponse = [{ question: 'Combien de jours dure votre séjour ?', answer: '' }];
  assert.equal(assessSolicitation({ type: 'ASK_CLARIFICATION', text: 'Quel est votre budget total ?' },
    posee_sans_reponse), 'ALLOW', 'une question restée sans réponse ne consomme pas le budget');
  assert.equal(countAnsweredSolicitations(repondu), 1);
  assert.equal(countAnsweredSolicitations(posee_sans_reponse), 0);
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
