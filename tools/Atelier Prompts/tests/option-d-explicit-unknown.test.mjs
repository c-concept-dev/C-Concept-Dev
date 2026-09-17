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
import { createOriginalRequestRecord as creerEnregistrement, appendClarificationTurn, validateOriginalRequestRecord }
  from '../core/adn/operational-request-state.js';

const politique = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const artefact = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');

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

test('T-OPTD-07 : une identité déclarée survit au tour où l’autorité l’oublie', () => {
  /* CE TEST A REMPLACÉ UNE VERSION PLUS FAIBLE, ET LA RAISON MÉRITE D'ÊTRE ÉCRITE.
   *
   * La première implémentation s'en remettait à la RE-DÉRIVATION : l'autorité relit la demande à
   * chaque tour, donc elle redéclare. C'est vrai, et c'était insuffisant — la mémoire dépendait
   * alors de celui dont elle doit corriger l'oubli. Le seul tour qui compte est justement celui où
   * l'autorité omet l'identité ; c'est là que la protection devait jouer, et elle ne jouait pas.
   *
   * L'historique la porte désormais. La re-dérivation reste une source ; elle n'est plus la mémoire. */
  const tour1 = { turn: 1, question: 'Une première question ?', answer: 'sa réponse', provenance: 'user',
    missing_determinant_id: 'manque_y', explicit_unknown_determinant_ids: ['manque_a'] };
  /* Au tour suivant, l'autorité n'a RIEN redéclaré — le registre du candidat est vide. */
  const candidate = q('Quelle est la donnée manquante ?', { id: 'manque_a', declarees: [] });
  assert.equal(isDeclaredUnknown(candidate), false, 'le candidat seul ne sait rien');
  assert.equal(isDeclaredUnknown(candidate, [tour1]), true, 'l’historique, lui, se souvient');
  assert.equal(assessSolicitation(candidate, [tour1], false, DEMANDE), 'ALREADY_ANSWERED');
  assert.deepEqual(guardFastInteraction(candidate, snap([tour1])), SILENT_INTERACTION);
});

test('T-OPTD-11 : la mémoire cumule les tours, sans suppression ni multiplication', () => {
  const tours = [
    { turn: 1, question: 'q1 ?', answer: 'r1', provenance: 'user', explicit_unknown_determinant_ids: ['manque_a'] },
    { turn: 2, question: 'q2 ?', answer: 'r2', provenance: 'user', missing_determinant_id: 'manque_y' },
    { turn: 3, question: 'q3 ?', answer: 'r3', provenance: 'user', explicit_unknown_determinant_ids: ['manque_b', 'manque_a'] }
  ];
  for (const identite of ['manque_a', 'manque_b']) {
    assert.equal(isDeclaredUnknown(q('Quelle donnée ?', { id: identite }), tours), true,
      `${identite} déclaré à un tour vaut pour tous les suivants`);
  }
  /* Une identité jamais déclarée ne l'est pas davantage par voisinage avec celles qui le sont. */
  assert.equal(isDeclaredUnknown(q('Quelle donnée ?', { id: 'manque_c' }), tours), false);
  /* Un doublon entre deux tours ne change rien : une identité est une identité. */
  assert.equal(assessSolicitation(q('Quelle donnée ?', { id: 'manque_a' }), tours, false, DEMANDE), 'ALREADY_ANSWERED');
});

test('T-OPTD-12 : la mémoire transporte, elle n’interprète jamais', () => {
  /* L'historique accepte des identités et REFUSE tout ce qui n'en est pas une. Il ne lit aucun
     texte de la personne, n'en dérive aucune identité, et n'a aucun moyen de le faire. */
  const base = creerEnregistrement('Une demande.');
  const avec = appendClarificationTurn(base, { question: 'q ?', answer: 'r',
    explicit_unknown_determinant_ids: ['manque_a', '  ', null, '  manque_b  '] });
  assert.deepEqual([...avec.clarification_history[0].explicit_unknown_determinant_ids], ['manque_a', 'manque_b']);

  /* Un tour sans déclaration n'écrit pas la clé : le contrat d'hier reste valide tel quel. */
  const sans = appendClarificationTurn(base, { question: 'q ?', answer: 'r' });
  assert.equal('explicit_unknown_determinant_ids' in sans.clarification_history[0], false);
  assert.deepEqual(Object.keys(sans.clarification_history[0]).sort(), ['answer', 'provenance', 'question', 'turn']);

  /* Et le validateur refuse ce qui n'est pas une identité — jamais il ne le répare. */
  assert.throws(() => validateOriginalRequestRecord({
    version: sans.version, original_request: 'Une demande.',
    clarification_history: [{ turn: 1, question: 'q ?', answer: 'r', provenance: 'user',
      explicit_unknown_determinant_ids: ['   '] }]
  }), /explicit_unknown_determinant_ids\[0\] doit être un identifiant non vide/);
  assert.throws(() => validateOriginalRequestRecord({
    version: sans.version, original_request: 'Une demande.',
    clarification_history: [{ turn: 1, question: 'q ?', answer: 'r', provenance: 'user',
      explicit_unknown_determinant_ids: 'manque_a' }]
  }), /doit être une liste/);
});

/* ==========================================================================
 * OPTION D2 — LE REGISTRE APPARTIENT AU TOUR, PAS À LA QUESTION
 *
 * CE QUE LE SMOKE RÉEL A MONTRÉ, ET QUE MES TREIZE PREMIERS TESTS N'AVAIENT PAS VU. Le registre
 * était écrit dans `oprieAsk` — donc uniquement quand le plan RAPIDE posait lui-même la question.
 * Sur le cas réel, il a rendu un ACKNOWLEDGE, la question est venue du plan PROFOND, et l'appel
 * profond à `oprieAsk` — quatre arguments — remettait le registre à vide. Deux pertes, sur la seule
 * branche que je n'avais pas couverte. Ces tests couvrent le cycle entier.
 * ======================================================================= */

/** Le cycle de tour du client, exécuté sur les octets réellement servis. */
function cycleDeTour() {
  const morceau = (debut, fin) => {
    const a = artefact.indexOf(debut);
    assert.ok(a !== -1, `introuvable : ${debut}`);
    return artefact.slice(a, artefact.indexOf(fin, a));
  };
  return {
    rendu: morceau('function oprieRenderFastInteraction(', '\nfunction oprieAsk('),
    ask: morceau('function oprieAsk(question,intro,chips,determinant)', '$(\'#v11-answer-continue\')'),
    reponse: artefact.slice(artefact.indexOf('function answerQuestion(answer){'),
      artefact.indexOf('function answerQuestion(answer){') + 2400),
    historique: morceau('function oprieClarificationHistory()', '\n/* Adaptateur')
  };
}

test('T-OPTD-13 : le registre est retenu pour TOUTE interaction du tour, question ou non', () => {
  const c = cycleDeTour();
  /* L'enregistrement a lieu dans le rendu, AVANT la bifurcation question / accusé de réception :
     c'est ce qui le rend indépendant du composant qui posera la question. */
  assert.match(c.rendu, /turnExplicitUnknownIds/);
  const iEnregistrement = c.rendu.indexOf('turnExplicitUnknownIds');
  const iBifurcation = c.rendu.indexOf('FAST_SOLICITING_TYPES.indexOf');
  assert.ok(iEnregistrement > 0 && iEnregistrement < iBifurcation,
    'le registre est retenu avant que l’on sache si une question sera posée');
  /* Union, jamais remplacement : une seconde interaction du même tour n'efface pas la première. */
  assert.match(c.rendu, /indexOf\(identite\)===-1/);
});

test('T-OPTD-14 : la question ne possède plus le registre, et ne peut donc plus l’effacer', () => {
  const c = cycleDeTour();
  /* C'est la moitié du défaut : l'appel profond à oprieAsk remettait le registre à vide. */
  assert.equal(/turnExplicitUnknownIds|pendingExplicitUnknownIds/.test(c.ask), false,
    'oprieAsk n’écrit ni n’efface le registre');
  /* Et plus aucun appel ne lui transmet un cinquième argument : le propriétaire est unique. */
  assert.equal(/oprieAsk\([^)]*explicit_unknown_determinant_ids/.test(artefact), false);
  /* L'ancien porteur a disparu du produit servi. */
  assert.equal(artefact.includes('pendingExplicitUnknownIds'), false);
});

test('T-OPTD-15 : la réponse consomme le registre du tour, et c’est le seul point de reset', () => {
  const c = cycleDeTour();
  /* La réponse lit le registre du TOUR — pas celui d'une question. */
  assert.match(c.reponse, /turnExplicitUnknownIds/);
  /* L'écriture précède le reset : le registre entre dans l'historique avant d'être vidé. */
  const iLecture = c.reponse.indexOf('const declareesTour');
  const iEcriture = c.reponse.indexOf('state.answers.push');
  const iReset = c.reponse.indexOf('oprieState.turnExplicitUnknownIds=[]');
  assert.ok(iLecture > 0 && iLecture < iEcriture && iEcriture < iReset,
    'lecture, puis écriture durable, puis reset — jamais l’inverse');

  /* LA FRONTIÈRE, ÉNONCÉE EN NÉGATIF : aucun des quatre événements que le brief interdit ne vide le
     registre. Aucun d'eux n'écrit de réponse, et le reset est attaché à l'écriture. */
  const resets = (artefact.match(/turnExplicitUnknownIds=\[\]/g) || []).length;
  assert.equal(resets, 2, 'exactement deux points de reset : la consommation, et l’abandon explicite');
  assert.equal(/turnExplicitUnknownIds=\[\]/.test(c.rendu), false, 'un ACKNOWLEDGE ne vide rien');
  assert.equal(/turnExplicitUnknownIds=\[\]/.test(c.ask), false, 'une question posée ne vide rien');
  /* Et l'ouverture d'un tour ne le vide pas non plus : une reprise technique passe par là. */
  const ouverture = artefact.slice(artefact.indexOf('function oprieOpenTurn(){'),
    artefact.indexOf('function oprieOpenTurn(){') + 260);
  assert.equal(/turnExplicitUnknownIds/.test(ouverture), false,
    'une reprise technique ouvre un tour et ne doit rien perdre');
});

test('T-OPTD-16 : l’historique reçoit le registre, et le tour suivant le voit', () => {
  const c = cycleDeTour();
  assert.match(c.historique, /explicit_unknown_determinant_ids/);
  /* La chaîne complète, exécutée : ce que l'historique porte suffit au garde, sans état courant. */
  const tourPrecedent = { turn: 1, question: 'Une question du plan profond ?', answer: 'sa réponse',
    provenance: 'user', explicit_unknown_determinant_ids: ['manque_a'] };
  const candidat = q('Quelle est la donnée manquante ?', { id: 'manque_a', declarees: [] });
  assert.deepEqual(guardFastInteraction(candidat, snap([tourPrecedent])), SILENT_INTERACTION);
  /* Et une autre identité reste posable. */
  assert.deepEqual(guardFastInteraction(q('Et l’autre donnée ?', { id: 'manque_b' }), snap([tourPrecedent])),
    q('Et l’autre donnée ?', { id: 'manque_b' }));
});

/* ==========================================================================
 * FAST-INDEPENDENCE — LE REGISTRE NE DÉPEND PAS DE LA DÉCISION DU TOUR
 *
 * MESURÉ SUR UN SMOKE DE ROBUSTESSE. Une demande déclarait une inconnue X et portait une variable Y
 * réellement bloquante — exigée par le livrable lui-même. L'autorité a questionné Y correctement,
 * n'a PAS redemandé X, et le contrat final n'a rien inventé : le comportement produit était juste.
 * Mais `explicit_unknown_determinant_ids` valait `[]`. La protection D2 n'était donc pas armée : si
 * un tour ultérieur avait visé X, rien ne l'aurait arrêté.
 *
 * L'AUDIT A TROUVÉ LA CAUSE DANS LE TEXTE, PAS DANS LA STRUCTURE. Le schéma acceptait déjà X et Y
 * ensemble — vérifié. Le prompt, lui, définissait le registre PAR RÉFÉRENCE à missing_determinant_id
 * et le justifiait UNIQUEMENT par son effet sur la décision du tour, dans une consigne dont
 * l'injonction dominante est « plusieurs manques, une seule question ». Rien n'énonçait leur
 * indépendance.
 * ======================================================================= */

test('T-OPTD-20 : le registre et la question sont deux faits indépendants, acceptés ensemble', () => {
  /* T2 du brief, et le cas exact qui a échoué en production. */
  const xy = { type: 'ASK_CLARIFICATION', text: 'Quelle est la seconde donnée ?',
    question_focus: 'problem_or_user_context', missing_determinant_id: 'manque_y',
    explicit_unknown_determinant_ids: ['manque_x'] };
  const v = validateFastInteraction(xy, snap());
  assert.equal(v.ok, true, 'X déclaré ET question sur Y : le contrat l’accepte');
  assert.deepEqual(v.interaction.explicit_unknown_determinant_ids, ['manque_x']);
  assert.equal(v.interaction.missing_determinant_id, 'manque_y');
  /* Et le garde laisse passer : la question ne vise pas ce qui a été déclaré. */
  assert.deepEqual(guardFastInteraction(xy, snap()), xy);

  /* T4 — plusieurs inconnues déclarées survivent toutes à une question sur une autre variable. */
  const multi = { ...xy, explicit_unknown_determinant_ids: ['manque_x1', 'manque_x2'] };
  const v2 = validateFastInteraction(multi, snap());
  assert.deepEqual(v2.interaction.explicit_unknown_determinant_ids, ['manque_x1', 'manque_x2'],
    'aucune déclaration n’est sacrifiée à la question courante');
  assert.equal(v2.interaction.missing_determinant_id, 'manque_y');
});

test('T-OPTD-21 : le registre vide reste légitime, question ou non', () => {
  /* T5 et T6 — l'indépendance ne rend rien obligatoire : rien de déclaré, rien d'inscrit. */
  const ask = { type: 'ASK_CLARIFICATION', text: 'Quelle est la donnée ?',
    question_focus: 'problem_or_user_context', missing_determinant_id: 'manque_y',
    explicit_unknown_determinant_ids: [] };
  assert.equal(validateFastInteraction(ask, snap()).ok, true);
  assert.deepEqual(guardFastInteraction(ask, snap()), ask, 'un registre vide ne bloque rien');
  const ack = { type: 'ACKNOWLEDGE', text: 'Reçu.', question_focus: null,
    missing_determinant_id: null, explicit_unknown_determinant_ids: [] };
  assert.equal(validateFastInteraction(ack, snap()).ok, true);
  assert.deepEqual(validateFastInteraction(ack, snap()).interaction.explicit_unknown_determinant_ids, []);
});

test('T-OPTD-22 : l’indépendance est énoncée dans les DEUX moitiés du contrat', () => {
  /* LE PROMPT — la règle est posée dans le bloc des faits, avant la doctrine qui gouverne la
     décision, et elle nomme explicitement le type d'interaction qui écrasait le registre. */
  const i = FAST_INTERACTION_SYSTEM_PROMPT.indexOf('CE REGISTRE EST INDÉPENDANT DE LA DÉCISION DU TOUR');
  assert.notEqual(i, -1);
  assert.ok(i < FAST_INTERACTION_SYSTEM_PROMPT.indexOf('AVANT DE QUESTIONNER'),
    'avant la doctrine de sélection d’une seule question');
  const regle = FAST_INTERACTION_SYSTEM_PROMPT.slice(i, i + 460);
  assert.match(regle, /même quand vous rendez ASK_CLARIFICATION sur une AUTRE variable/);
  assert.match(regle, /Ne videz jamais le registre/);

  /* LE SCHÉMA — la même règle, là où le champ est écrit. Aucune structure n'a changé. */
  const p = FAST_INTERACTION_JSON_SCHEMA.properties;
  assert.match(p.explicit_unknown_determinant_ids.description, /indépendant du type d'interaction/);
  assert.match(p.missing_determinant_id.description, /distinct de explicit_unknown_determinant_ids/);
  /* Les types, l'ordre, required et la clôture sont intacts — seules deux descriptions sont nées. */
  assert.deepEqual(p.explicit_unknown_determinant_ids.type, ['array', 'null']);
  assert.deepEqual(p.explicit_unknown_determinant_ids.items, { type: 'string' });
  assert.deepEqual(p.missing_determinant_id.type, ['string', 'null']);
  assert.deepEqual([...FAST_INTERACTION_JSON_SCHEMA.required],
    ['explicit_unknown_determinant_ids', 'type', 'text', 'question_focus', 'missing_determinant_id']);
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.additionalProperties, false);
  assert.equal(Object.keys(p).length, 5);
  /* Aucun vocabulaire métier dans l'une ou l'autre moitié. */
  for (const domaine of ['budget', 'date', 'projet', 'réunion', 'prix', 'ville']) {
    assert.equal(new RegExp(domaine, 'i').test(p.explicit_unknown_determinant_ids.description), false,
      `« ${domaine} » interdit dans la description`);
    assert.equal(new RegExp(domaine, 'i').test(regle), false, `« ${domaine} » interdit dans la règle`);
  }
});

test('T-OPTD-23 : les descriptions partent réellement avec le schéma, sans filtrage', () => {
  /* LA SEULE AFFIRMATION QUE JE M'AUTORISE : elles sont TRANSMISES. Ce que le fournisseur en fait
     est hors de ma portée, et je ne le prétends pas. Ce test mesure le transport, pas l'effet. */
  const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
  const envoi = worker.slice(worker.indexOf('response_format: {'), worker.indexOf('reasoning_format'));
  assert.match(envoi, /json_schema: \{/);
  assert.match(envoi, /\n\s+schema\n/, 'l’objet schéma est transmis tel quel, non reconstruit');
  /* Aucun filtrage des descriptions nulle part sur le chemin. */
  assert.equal(/delete\s+\w+\.description|omitDescription|stripSchema/.test(worker), false);
  /* Et la sérialisation les contient effectivement. */
  const serialise = JSON.stringify({ type: 'json_schema', json_schema: { name: 'fast_interaction', strict: true, schema: FAST_INTERACTION_JSON_SCHEMA } });
  assert.ok(serialise.includes('indépendant du type d') , 'la description est dans le payload sérialisé');
  assert.ok(serialise.includes('distinct de explicit_unknown_determinant_ids'));
});

test('T-OPTD-17 : la comparaison du garde est désormais observable, et sans contenu', () => {
  /* Le smoke précédent était indécidable faute de ces valeurs. Ce sont des IDENTIFIANTS produits
     par l'autorité — jamais un mot de la personne. */
  const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
  const releve = worker.slice(worker.indexOf('event: "fast_decision"'), worker.indexOf('event: "fast_decision"') + 1200);
  for (const champ of ['missing_determinant_id', 'explicit_unknown_determinant_ids',
                       'declared_unknown_ids_history', 'declared_unknown_match']) {
    assert.ok(releve.includes(champ), `${champ} est journalisé`);
  }
  /* Aucun texte n'entre dans le relevé. */
  for (const interdit of ['candidate.text', 'original_request', 'answer']) {
    assert.equal(releve.includes(interdit), false, `« ${interdit} » n’a rien à faire dans un relevé`);
  }
  /* Et la question profonde déclare aussi l'identité qu'elle vise. */
  const orchestrateur = fs.readFileSync(new URL('../workers/shared/operational-request-orchestrator.js', import.meta.url), 'utf8');
  const garde = orchestrateur.slice(orchestrateur.indexOf('event: "displayed_question_guard"'),
    orchestrateur.indexOf('event: "displayed_question_guard"') + 420);
  assert.match(garde, /missing_determinant_id/);
  /* Aucune VALEUR textuelle n'est journalisée. `changed: garde.text !== texte` compare deux textes
     et rend un booléen — la distinction compte : un relevé peut constater qu'un texte a changé sans
     jamais le transporter. C'est ce que ce contrôle vérifie, et non la présence du mot. */
  assert.match(garde, /changed: garde\.text !== texte/);
  assert.equal(/\btext:|question\.text\b(?! !==)/.test(garde), false,
    'aucun champ ne porte une valeur textuelle');
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

test('T-OPTD-10 : la consigne NOMME un fait, et elle le demande AVANT toute décision', () => {
  /* FAST-FIRST-PASS — LA CONSIGNE A CHANGÉ DE PLACE, ET C'EST LA CORRECTION.
   *
   * Elle vivait à 92 % du prompt, après la doctrine, la forme et les deux autres déclarations —
   * énoncée comme une formalité de remplissage. Deux smokes humains, dont un sur une demande
   * parfaitement formulée, ont montré qu'elle n'était pas appliquée au premier passage. Elle est
   * désormais une ÉTAPE, posée avant la doctrine qui gouverne la décision. */
  const i = FAST_INTERACTION_SYSTEM_PROMPT.indexOf("ÉTABLISSEZ D'ABORD LES FAITS");
  assert.notEqual(i, -1, 'l’étape existe');
  const doctrine = FAST_INTERACTION_SYSTEM_PROMPT.indexOf('AVANT DE QUESTIONNER');
  assert.ok(i < doctrine, 'les faits sont établis avant la doctrine qui gouverne la décision');
  assert.ok(i / FAST_INTERACTION_SYSTEM_PROMPT.length < 0.2,
    'dans le premier cinquième du prompt, plus dans le dernier dixième');

  const consigne = FAST_INTERACTION_SYSTEM_PROMPT.slice(i, doctrine);
  /* Elle demande de NOMMER, jamais de juger. */
  assert.match(consigne, /Vous NOMMEZ ce qu'elle a énoncé/);
  assert.match(consigne, /vous ne jugez ni si c'est bloquant/);
  assert.match(consigne, /jamais une inconnue que\s+VOUS constatez/);
  /* Et elle dit ce que le registre change ENSUITE — c'est ce qui le rend décisionnel plutôt
     qu'annotatif, sans lui faire prononcer le moindre état. */
  assert.match(consigne, /information TRAITÉE/);
  assert.match(consigne, /Ne la redemandez pas/);
  for (const interdit of ['READY', 'operational_request_ready', 'route', 'bloquant :']) {
    assert.equal(consigne.includes(interdit), false, `« ${interdit} » n’a rien à faire ici`);
  }
});

test('T-OPTD-18 : le contrat de sortie place le fait sémantique AVANT la décision', () => {
  /* LA CAUSE RACINE ÉTAIT ICI, ET ELLE N'ÉTAIT PAS DANS LA CONSIGNE. En sortie structurée stricte,
     le modèle émet les clés dans l'ordre où le schéma les déclare. Le registre venait EN DERNIER :
     le type, le texte et l'inconnue visée étaient déjà écrits — donc la décision de questionner
     était déjà prise — quand il se remplissait. Il ne POUVAIT pas y participer. */
  const ordre = Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties);
  assert.equal(ordre[0], 'explicit_unknown_determinant_ids', 'le fait s’écrit en premier');
  assert.ok(ordre.indexOf('explicit_unknown_determinant_ids') < ordre.indexOf('type'),
    'avant le type d’interaction');
  assert.ok(ordre.indexOf('explicit_unknown_determinant_ids') < ordre.indexOf('missing_determinant_id'),
    'avant l’inconnue visée');
  /* `required` suit le même ordre : les deux gouvernent la génération selon les fournisseurs. */
  assert.deepEqual([...FAST_INTERACTION_JSON_SCHEMA.required],
    ['explicit_unknown_determinant_ids', 'type', 'text', 'question_focus', 'missing_determinant_id']);
  /* Le contrat reste clos, et ne s’est enrichi d’aucun champ. */
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.additionalProperties, false);
  assert.equal(ordre.length, 5);
});

test('T-OPTD-19 : la ceinture de cohérence existe, et elle vit là où elle peut encore servir', () => {
  /* CE QU'ELLE EST : si l'autorité déclare X inconnu ET questionne X dans la même sortie, la
     combinaison est refusée. Le garde le fait déjà — `isDeclaredUnknown` → ALREADY_ANSWERED.
     CE QU'ELLE N'EST PAS : le correctif principal. Elle ne peut rien quand le registre reste vide,
     et c'était précisément le cas mesuré. */
  const contradiction = q('Quelle est la donnée manquante ?', { id: 'manque_a', declarees: ['manque_a'] });
  assert.equal(assessSolicitation(contradiction, [], false, DEMANDE), 'ALREADY_ANSWERED');
  assert.deepEqual(guardFastInteraction(contradiction, snap()), SILENT_INTERACTION);
  /* ASK(Y) + déclaré [X] reste permis : on ne ferme que la contradiction. */
  assert.equal(assessSolicitation(q('Et l’autre ?', { id: 'manque_b', declarees: ['manque_a'] }), [], false, DEMANDE), 'ALLOW');

  /* POURQUOI ELLE N'A PAS ÉTÉ DOUBLÉE DANS LE VALIDATEUR, et c'est un choix argumenté. Un refus au
     validateur rendrait FAST_SCHEMA_ERROR, donc une escalade profonde immédiate — ~20 s et un appel
     de plus. Au garde, le verdict ALREADY_ANSWERED ouvre la reprise corrective du MÊME tour, qui
     redonne sa chance à l'autorité sans quitter le plan rapide. Refuser plus tôt coûterait plus et
     apprendrait moins. */
  const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
  assert.match(worker, /ALREADY_ANSWERED: CORRECTION_DEJA_REPONDU/,
    'le verdict ouvre une reprise corrective, et c’est ce qui rend ce placement supérieur');
  const validateur = fs.readFileSync(new URL('../workers/shared/fast-interactive-plane.js', import.meta.url), 'utf8');
  assert.equal(/isDeclaredUnknown/.test(validateur), false,
    'le validateur ne double pas le garde : il perdrait la reprise');
});
