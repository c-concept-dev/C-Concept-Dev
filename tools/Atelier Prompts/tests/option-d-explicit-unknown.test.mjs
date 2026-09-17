/* OPTION D — CE QUE LA PERSONNE A DÉCLARÉ IGNORER EST DÉJÀ UNE RÉPONSE.
 * ============================================================================
 *
 * LE DÉFAUT, MESURÉ EN USAGE RÉEL. Une demande disait, d'elle-même, ne pas connaître une donnée.
 * La PREMIÈRE question posée portait exactement dessus. Au tour suivant, la protection anti-
 * répétition s'est déclenchée correctement — mais le tour était déjà perdu.
 *
 * AUCUN MÉCANISME N'AVAIT TORT, ET C'EST TOUT LE PROBLÈME. `isRepeatedSolicitation` compare une
 * identité de manque aux entrées de `clarification_history` : au premier tour, cette liste est vide,
 * et le verdict ALLOW était juste. La doctrine, elle, ne parle que d'une réponse OBTENUE — la
 * personne n'avait rien répondu, elle avait déclaré. Une inconnue énoncée AVANT toute question
 * n'avait aucun porteur : pour tout composant déterministe, elle était indiscernable d'une absence.
 *
 * CE QUE CE LOT AJOUTE, ET CE QU'IL REFUSE D'AJOUTER. Un registre, produit par la MÊME décision qui
 * choisit déjà la question et nomme déjà ce qui lui manque. Aucune autorité nouvelle, aucun appel
 * nouveau, aucun lexique, aucun seuil, aucune ressemblance. Le garde ne fait qu'une chose : constater
 * que deux identités établies par l'autorité désignent la même chose.
 *
 * LA GARANTIE EST À SENS UNIQUE, ET CE FICHIER LE DIT PLUTÔT QUE DE LE TAIRE. Une autorité qui se
 * contredit — déclarer X inconnu et questionner X — est arrêtée déterministement. Une autorité qui
 * ne déclare rien n'est pas contredite, et rien ne la remplace : la deviner exigerait précisément le
 * classifieur que l'architecture interdit.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assessSolicitation, isDeclaredUnknown, guardFastInteraction, SILENT_INTERACTION, SOLICITATION_VERDICTS
} from '../workers/shared/solicitation-policy.js';
import {
  FAST_INTERACTION_JSON_SCHEMA, validateFastInteraction, createTurnSnapshot
} from '../workers/shared/fast-interactive-plane.js';
import { FAST_INTERACTION_PATHNAME, handleFastInteractionRequest } from '../workers/shared/fast-interaction-endpoint.js';
import { FAST_INTERACTION_SYSTEM_PROMPT } from '../workers/groq/src/index.js';

const politique = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');

const DEMANDE = 'Comparez plusieurs approches selon leur coût, leur risque et leur simplicité.';
const snap = (historique = []) => createTurnSnapshot({
  turn_id: historique.length + 1, original_request: DEMANDE, clarification_history: historique
});
const q = (texte, { id = null, declarees = [] } = {}) => ({
  type: 'ASK_CLARIFICATION', text: texte, question_focus: 'problem_or_user_context',
  missing_determinant_id: id, explicit_unknown_determinant_ids: declarees
});

const ORIGINE = 'https://atelier.example';
const allerRetour = async (sortie) => {
  const requete = new Request(`https://w.dev${FAST_INTERACTION_PATHNAME}`, {
    method: 'POST', headers: { Origin: ORIGINE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ turn_id: 1, original_request: DEMANDE, clarification_history: [],
      current_answer: null, canonical_version: 0, material_present: false })
  });
  const r = await handleFastInteractionRequest(requete, { ALLOWED_ORIGINS: ORIGINE }, { executeFast: async () => sortie });
  return { status: r.status, json: await r.json() };
};

/* ==========================================================================
 * T1 / T2 / T3 — LE REGISTRE EXISTE, ET IL N'ACCEPTE QUE DES IDENTITÉS
 * ======================================================================= */

test('T-OPTD-01 : le registre est contractuel, vide par défaut, et ne porte que des identités', () => {
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.required.includes('explicit_unknown_determinant_ids'), true);
  const propriete = FAST_INTERACTION_JSON_SCHEMA.properties.explicit_unknown_determinant_ids;
  assert.deepEqual(propriete.type, ['array', 'null']);
  assert.deepEqual(propriete.items, { type: 'string' });

  /* Vide : le cas ordinaire, et il reste valide. */
  const vide = validateFastInteraction(
    { ...q('Quelle est la donnée manquante ?', { id: 'manque_a' }) }, snap());
  assert.equal(vide.ok, true);
  assert.deepEqual(vide.interaction.explicit_unknown_determinant_ids, []);

  /* Déclaré : recopié, jamais dérivé. */
  const plein = validateFastInteraction(
    q('Quelle est la donnée manquante ?', { id: 'manque_a', declarees: ['manque_b', 'manque_c'] }), snap());
  assert.deepEqual(plein.interaction.explicit_unknown_determinant_ids, ['manque_b', 'manque_c']);

  /* Ce qui n'est pas une identité non vide est écarté — jamais réparé, jamais complété. */
  const sale = validateFastInteraction(
    { ...q('Quelle est la donnée manquante ?', { id: 'manque_a' }),
      explicit_unknown_determinant_ids: ['manque_b', '  ', null, 42, '  manque_c  '] }, snap());
  assert.deepEqual(sale.interaction.explicit_unknown_determinant_ids, ['manque_b', 'manque_c']);

  /* Lecture tolérante, écriture stricte : l'absence du champ n'est jamais un échec de schéma… */
  assert.equal(validateFastInteraction(
    { type: 'ACKNOWLEDGE', text: 'Reçu.' }, snap()).ok, true);
  /* …mais une clé étrangère l'est toujours. */
  assert.equal(validateFastInteraction(
    { ...q('Quoi ?', { id: 'a' }), state: 'operational_request_ready' }, snap()).reason, 'FAST_SCHEMA_ERROR');
});

/* ==========================================================================
 * T4 / T5 — LE GARDE : UNE ÉGALITÉ, ET RIEN D'AUTRE
 * ======================================================================= */

test('T-OPTD-02 : une question visant un manque déclaré inconnu est refusée', () => {
  const candidate = q('Quelle est la donnée manquante ?', { id: 'manque_a', declarees: ['manque_a'] });
  assert.equal(isDeclaredUnknown(candidate), true);
  assert.equal(assessSolicitation(candidate, [], false, DEMANDE), 'ALREADY_ANSWERED');
  assert.deepEqual(guardFastInteraction(candidate, snap()), SILENT_INTERACTION);
  /* Aucun verdict nouveau n'a été inventé : « la personne s'est déjà exprimée » existait déjà. */
  assert.deepEqual([...SOLICITATION_VERDICTS],
    ['ALLOW', 'MULTIPLE_QUESTIONS', 'CATALOGUE', 'ALREADY_ANSWERED', 'MATERIAL_PRESENT',
     'META_OUTPUT_QUESTION', 'EMPTY']);
});

test('T-OPTD-03 : une question visant un AUTRE manque passe, même si un manque est déclaré inconnu', () => {
  /* C'est le risque que ce lot ne doit pas créer : rendre le système muet. Déclarer une inconnue
     ne ferme pas le dialogue, elle ferme UN manque. */
  const candidate = q('Quelle est la seconde donnée ?', { id: 'manque_b', declarees: ['manque_a'] });
  assert.equal(isDeclaredUnknown(candidate), false);
  assert.equal(assessSolicitation(candidate, [], false, DEMANDE), 'ALLOW');
  assert.deepEqual(guardFastInteraction(candidate, snap()), candidate);
});

test('T-OPTD-04 : sans identité visée, le registre ne bloque rien', () => {
  /* Une question sans identité ne peut être comparée à rien : elle n'est pas refusée par CE garde
     — les autres continuent de s'appliquer. Échouer fermé ici reviendrait à punir l'absence d'un
     fait que l'autorité a le droit de ne pas donner. */
  const sansIdentite = q('Quelle est la donnée manquante ?', { id: null, declarees: ['manque_a'] });
  assert.equal(isDeclaredUnknown(sansIdentite), false);
  assert.equal(assessSolicitation(sansIdentite, [], false, DEMANDE), 'ALLOW');
});

/* ==========================================================================
 * T6 / T7 / T8 — CE QUI N'A PAS ÉTÉ INTRODUIT
 * ======================================================================= */

test('T-OPTD-05 : aucune comparaison textuelle, aucun appariement flou, aucun seuil', () => {
  /* Deux identités VOISINES ne sont pas la même identité. Un système qui les rapprocherait aurait
     réintroduit exactement ce que V2.2.1-E3 a retiré. */
  for (const voisine of ['manque_a_precis', 'manque_', 'MANQUE_A', 'manque a', 'manque_aa']) {
    const candidate = q('Quelle est la donnée manquante ?', { id: voisine, declarees: ['manque_a'] });
    assert.equal(isDeclaredUnknown(candidate), false, `« ${voisine} » n’est pas « manque_a »`);
  }
  /* Et la comparaison inverse ne se produit pas davantage. */
  assert.equal(isDeclaredUnknown(q('x', { id: 'manque_a', declarees: ['manque_a_precis'] })), false);

  /* Le code du garde ne contient ni ressemblance, ni seuil, ni lexique. */
  const bloc = politique.slice(politique.indexOf('export function isDeclaredUnknown'),
    politique.indexOf('export function guardFastSolicitation'));
  for (const interdit of ['includes(\'', 'indexOf(\'', 'toLowerCase', 'startsWith', 'match(', 'RegExp',
                          'score', 'seuil', 'similar', 'ratio', 'distance', 'levenshtein']) {
    assert.equal(bloc.includes(interdit), false, `« ${interdit} » n’a rien à faire dans une égalité`);
  }
  /* Aucun vocabulaire métier, dans le garde comme dans la consigne. Des NOMS DE DOMAINE, jamais des
     noms de variables : « durée », « date » et « destinataire » figurent déjà dans la consigne pour
     illustrer ce qu'est une variable réelle d'un problème — ce sont des catégories, pas un domaine,
     et V21-17/18 tient la liste canonique du projet. */
  const code = politique.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  for (const domaine of ['budget', 'prix', 'ville', 'entreprise', 'sauvegarde', 'ordinateur',
                         'voyage', 'facture', 'théâtre']) {
    assert.equal(new RegExp(`\\b${domaine}`, 'i').test(code), false, `« ${domaine} » interdit dans le garde`);
    assert.equal(new RegExp(`\\b${domaine}`, 'i').test(FAST_INTERACTION_SYSTEM_PROMPT), false,
      `« ${domaine} » interdit dans la consigne rapide`);
  }
});

/* ==========================================================================
 * T9 — LE REGISTRE TRAVERSE LA PORTE RÉSEAU
 * ======================================================================= */

test('T-OPTD-06 : le registre arrive chez le client, identique à ce qui a été écrit', async () => {
  const { status, json } = await allerRetour(
    q('Quelle est la seconde donnée ?', { id: 'manque_b', declarees: ['manque_a'] }));
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(json).sort(),
    ['explicit_unknown_determinant_ids', 'missing_determinant_id', 'question_focus', 'text', 'type']);
  assert.deepEqual(json.explicit_unknown_determinant_ids, ['manque_a']);

  /* Rien n'est fabriqué quand rien n'est déclaré. */
  const { json: nu } = await allerRetour({ type: 'ACKNOWLEDGE', text: 'Reçu.' });
  assert.deepEqual(nu.explicit_unknown_determinant_ids, []);
});

/* ==========================================================================
 * T10 / T11 / T12 — LA PORTÉE DIALOGUE
 * ======================================================================= */

test('T-OPTD-07 : la protection vaut à tous les tours, pas seulement au premier', () => {
  /* LA PERSISTANCE EST PAR RE-DÉRIVATION, ET C'EST UN CHOIX À DIRE. La déclaration vit dans la
     demande, que l'autorité relit à CHAQUE tour — `createTurnSnapshot` l'exige à chaque fois. Elle
     la redéclare donc naturellement tant que la demande la porte, sans qu'aucune mémoire ait à la
     recopier. Aucune clé n'a été ajoutée au contrat de `clarification_history` : ce qui n'existe
     pas ne peut pas diverger. */
  const historique = [
    { turn: 1, question: 'Une première question ?', answer: 'sa réponse', provenance: 'user', missing_determinant_id: 'manque_x' },
    { turn: 2, question: 'Une deuxième question ?', answer: 'sa réponse', provenance: 'user', missing_determinant_id: 'manque_y' }
  ];
  const candidate = q('Quelle est la donnée manquante ?', { id: 'manque_a', declarees: ['manque_a'] });
  assert.deepEqual(guardFastInteraction(candidate, snap(historique)), SILENT_INTERACTION,
    'au troisième tour comme au premier');
  /* Et la protection historique par identité continue de fonctionner, indépendamment. */
  const dejaPose = q('Autrement formulée ?', { id: 'manque_x' });
  assert.equal(assessSolicitation(dejaPose, historique, false, DEMANDE), 'ALREADY_ANSWERED');
});

test('T-OPTD-08 : une granularité réellement différente n’est pas bloquée par parenté', () => {
  /* La conception ne décide AUCUNE matérialité : si l'autorité juge qu'une autre information est
     utile et lui donne une autre identité, le garde la laisse passer. C'est elle qui décide, pas
     ce contrôle — qui n'a aucun moyen de savoir que deux identités sont « proches ». */
  const autreGranularite = q('Un ordre de grandeur est-il disponible ?',
    { id: 'manque_a_ordre_de_grandeur', declarees: ['manque_a'] });
  assert.equal(assessSolicitation(autreGranularite, [], false, DEMANDE), 'ALLOW');
});

/* ==========================================================================
 * T13 à T19 — CE QUE CE LOT NE TOUCHE PAS
 * ======================================================================= */

test('T-OPTD-09 : le plan rapide ne gagne aucune autorité, et rien d’autre n’a bougé', () => {
  /* Le schéma rapide reste incapable de porter un état, une route ou une readiness. */
  for (const interdit of ['state', 'route', 'readiness', 'can_execute', 'can_mark_ready',
                          'remaining_unknowns', 'delegated_decisions']) {
    assert.equal(interdit in FAST_INTERACTION_JSON_SCHEMA.properties, false,
      `${interdit} n’entre pas dans le contrat rapide`);
  }
  const rendu = validateFastInteraction(q('Quoi ?', { id: 'a' }), snap()).interaction;
  assert.equal(rendu.can_execute, false);
  assert.equal(rendu.can_route, false);
  assert.equal(rendu.can_mark_ready, false);
  assert.equal(rendu.authority, 'candidate');

  /* Aucune conversion automatique : le registre ne devient ni inconnue résiduelle, ni délégation.
     Ces deux mots n'apparaissent nulle part dans la politique de sollicitation. */
  const code = politique.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  assert.equal(/remaining_unknowns|delegated_decisions/.test(code), false);

  /* Et le lot de troncature reste fermé : aucun verdict réduit, aucune réécriture de texte. */
  assert.equal(/REDUCED|reduceQuestionDeterministically/.test(code), false);
});

test('T-OPTD-10 : la consigne NOMME un fait, elle ne prescrit aucun comportement', () => {
  /* La frontière tient à cela : si la consigne disait « ne pose pas de question », le plan rapide
     déciderait. Elle lui demande de dire ce que la personne a énoncé ; le refus, lui, appartient au
     garde déterministe. */
  const i = FAST_INTERACTION_SYSTEM_PROMPT.indexOf('explicit_unknown_determinant_ids');
  assert.notEqual(i, -1);
  const consigne = FAST_INTERACTION_SYSTEM_PROMPT.slice(i - 80, i + 700);
  assert.match(consigne, /NOMMEZ un fait/);
  assert.match(consigne, /vous ne jugez ni s'il est bloquant/);
  /* Elle interdit explicitement d'y verser une inconnue que le modèle constate lui-même. */
  assert.match(consigne, /jamais une inconnue que VOUS constatez/);
});
