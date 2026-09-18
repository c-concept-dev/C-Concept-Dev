/* FAST-SPURIOUS-CLARIFICATION-FIX-01 — UNE QUESTION SE FONDE SUR CE QUE LA PERSONNE A ÉCRIT
 * ============================================================================
 *
 * ROOT CAUSE PROUVÉE EN PRODUCTION, SUR L'ÉCHANGE ZEVQ7C. POST /fast-interaction, HTTP 200 :
 *
 *   { type: "ASK_CLARIFICATION", text: "Quel lot souhaitez-vous traiter en premier ?",
 *     question_focus: "problem_or_user_context", missing_determinant_id: "lot_to_start",
 *     explicit_unknown_determinant_ids: [] }
 *
 * La demande comparait TROIS options ENSEMBLE. Aucune exigence n'en dépendait, aucune contrainte ne
 * nommait un ordre, rien de la complétude n'en dépendait — et l'analyse profonde du même cas rendait
 * `livrable_complet_possible = true`, `action_recommandee = continuer`, zéro question. Le plan rapide
 * avait fabriqué une sous-structure de travail absente du problème, et le tour s'arrêtait dessus.
 *
 * POURQUOI AUCUN GARDE NE L'ARRÊTAIT. Chaque garde du plan rapide juge la FORME : atomique, non
 * méta (`question_focus`), non répétée (`missing_determinant_id` vs historique), pas de matériau.
 * Le FONDEMENT de la question n'était constaté par personne : l'identifiant du manque est libre,
 * écrit APRÈS la décision de questionner, et rien ne le rattache à la demande. Un garde
 * déterministe ne peut pas lire une phrase pour savoir si la demande la justifie — ce serait le
 * classifieur que l'architecture interdit — mais il peut constater qu'une citation figure dans ce
 * que la personne a écrit.
 *
 * LE CORRECTIF, GÉNÉRIQUE. Un fait déclaré par l'auteur de la question, `missing_determinant_evidence`
 * — la citation du passage de la demande (ou d'une réponse) dont dépend l'information demandée —
 * placé AVANT `type` dans le schéma, pour la même raison que le registre des inconnues déclarées :
 * l'ordre du schéma est l'ordre du raisonnement. Le garde constate une ÉGALITÉ de contenu, sous la
 * normalisation d'identité déjà employée pour la répétition. Sans citation, ou avec une citation
 * que la personne n'a pas écrite : silence, et le plan profond décide — l'architecture existante.
 * Aucun lexique, aucun seuil, aucun domaine, aucune autorité nouvelle.
 *
 * CE QUE CE FICHIER NE PRÉTEND PAS. Une citation réelle mais mal choisie n'est pas contredite : la
 * garantie déterministe est la provenance, pas le sens. Le test B le dit plutôt que de le taire.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assessSolicitation, guardFastInteraction, guardFastSolicitation, isGroundedInRequest, fastSnapshotFacts,
  SILENT_INTERACTION, SOLICITATION_VERDICTS
} from '../workers/shared/solicitation-policy.js';
import {
  FAST_INTERACTION_JSON_SCHEMA, FAST_INTERACTION_TRANSPORT_FIELDS, createTurnSnapshot, validateFastInteraction
} from '../workers/shared/fast-interactive-plane.js';
import { FAST_INTERACTION_PATHNAME, handleFastInteractionRequest } from '../workers/shared/fast-interaction-endpoint.js';
import { FAST_INTERACTION_SYSTEM_PROMPT, FAST_CORRECTIONS, runFastInteractionWithHaChain } from '../workers/groq/src/index.js';

const lire = (f) => fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const politique = lire('../workers/shared/solicitation-policy.js');
const plan = lire('../workers/shared/fast-interactive-plane.js');
const porte = lire('../workers/shared/fast-interaction-endpoint.js');
const worker = lire('../workers/groq/src/index.js');

/* LA FORME DE ZEVQ7C, EN FIXTURE NEUTRE : trois options à comparer ENSEMBLE, deux inconnues déclarées
   par la personne, et l'instruction de ne pas la bloquer dessus. Aucun texte de la personne n'est
   versionné ici — seule la FORME compte. */
const DEMANDE_ZEVQ7C = [
  'Je veux comparer trois stratégies : conserver l’outil actuel avec des extensions ; migrer vers une',
  'solution plus complète ; développer une solution interne. Notre plafond mensuel est fixé.',
  'Je ne sais pas encore combien d’heures par mois l’équipe passe dans l’outil, ni ce que coûte une',
  'migration en temps humain : ne me bloque pas pour ces données, fais des hypothèses raisonnables.',
  'Je veux une comparaison structurée qui permette réellement de décider, avec une recommandation.'
].join(' ');

/* LA SORTIE EXACTE DE PRODUCTION, à l'octet près sur ses champs. */
const CANDIDATE_PRODUCTION = Object.freeze({
  type: 'ASK_CLARIFICATION',
  text: 'Quel lot souhaitez-vous traiter en premier ?',
  question_focus: 'problem_or_user_context',
  missing_determinant_id: 'lot_to_start',
  explicit_unknown_determinant_ids: []
});

const snap = (demande, { historique = [], reponse = null } = {}) => createTurnSnapshot({
  turn_id: historique.length + 1, original_request: demande, clarification_history: historique, current_answer: reponse
});
const ask = (texte, citation, { id = 'manque', declarees = [] } = {}) => ({
  type: 'ASK_CLARIFICATION', text: texte, question_focus: 'problem_or_user_context',
  missing_determinant_id: id, explicit_unknown_determinant_ids: declarees, missing_determinant_evidence: citation
});

/** Le transport rapide, intercepté : chaque appel rend la sortie brute qu'on lui dicte. */
function avecFournisseurRapide(t, sorties) {
  const vrai = globalThis.fetch;
  const appels = [];
  globalThis.fetch = async (url, init) => {
    const corps = JSON.parse(String(init.body));
    appels.push({ url: String(url), systeme: corps.messages[0].content, corps });
    const sortie = sorties[Math.min(appels.length - 1, sorties.length - 1)];
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(sortie) } }],
      usage: { prompt_tokens: 900, completion_tokens: 60 }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = vrai; });
  return appels;
}
const ENV = { GROQ_API_KEY: 'gsk_test', ALLOWED_ORIGINS: 'https://atelier.example' };
const journal = () => { const vus = []; const log = (e) => vus.push(e); return { vus, log }; };
const decision = (vus) => vus.find((e) => e.event === 'fast_decision') || {};
const instantane = (demande, historique = []) => ({
  turn_id: historique.length, original_request: demande, clarification_history: historique,
  current_answer: null, canonical_version: 0, material_present: false
});
const allerRetour = async (demande, sortie) => {
  const requete = new Request(`https://w.dev${FAST_INTERACTION_PATHNAME}`, {
    method: 'POST', headers: { Origin: ENV.ALLOWED_ORIGINS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ turn_id: 1, original_request: demande, clarification_history: [],
      current_answer: null, canonical_version: 0, material_present: false })
  });
  const r = await handleFastInteractionRequest(requete, ENV, { executeFast: async () => sortie });
  return { status: r.status, json: await r.json() };
};

/* ==========================================================================
 * 1 — LA CAUSE, REPRODUITE : LA SORTIE DE PRODUCTION NE PASSE PLUS
 * ======================================================================= */

test('T-FSC-01 · ROOT CAUSE : la sortie exacte de production est refusée — aucun garde de forme ne la voyait', () => {
  const s = snap(DEMANDE_ZEVQ7C);
  /* AVANT : tout ce que les gardes de forme mesurent est vrai de cette question. */
  const c = CANDIDATE_PRODUCTION;
  assert.equal(c.question_focus, 'problem_or_user_context', 'le garde méta ne pouvait rien : elle interroge « la situation »');
  assert.equal((c.text.match(/\?/g) || []).length, 1, 'atomique');
  assert.deepEqual(s.clarification_history, [], 'rien à comparer pour la répétition');
  assert.equal(s.material_present, false);
  /* Sans le fondement, elle passait : c'est ce que la production a rendu. */
  assert.equal(assessSolicitation(c, [], false, {}), 'ALLOW', 'sans les mots de la personne, rien ne l’accusait');
  /* APRÈS : le fondement est constaté, et il n'existe pas. */
  assert.equal(isGroundedInRequest(c, fastSnapshotFacts(s)), false, 'USER_REQUEST_SUPPORTS_THIS_DETERMINANT = NO');
  assert.equal(assessSolicitation(c, [], false, fastSnapshotFacts(s)), 'UNGROUNDED_DETERMINANT');
  assert.deepEqual(guardFastInteraction(c, s), SILENT_INTERACTION, 'le silence, et le plan profond décide');
  /* Et l'identifiant inventé ne survit nulle part : rien n'est rendu qui le porte. */
  assert.equal('missing_determinant_id' in guardFastInteraction(c, s), false);
});

test('T-FSC-02 · ZEVQ7C, bout en bout dans le Worker : pas de question inventée, la chaîne continue', async (t) => {
  /* Premier essai : la sortie de production. Reprise : le modèle, corrigé, ne cite toujours rien —
     le cas le plus défavorable. Attendu : aucune ASK_CLARIFICATION, aucun identifiant inventé, et le
     passage au plan profond nommé. */
  const appels = avecFournisseurRapide(t, [
    CANDIDATE_PRODUCTION,
    { ...CANDIDATE_PRODUCTION, missing_determinant_evidence: null }
  ]);
  const { vus, log } = journal();
  const rendu = await runFastInteractionWithHaChain(instantane(DEMANDE_ZEVQ7C), ENV, { log });
  assert.equal(rendu.type, SILENT_INTERACTION.type, 'pas de « Quel lot souhaitez-vous traiter en premier ? »');
  assert.equal('missing_determinant_id' in rendu, false, 'aucun déterminant inventé ne sort');
  assert.equal(appels.length, 2, 'un essai, une reprise, et rien de plus');
  assert.match(appels[1].systeme, /missing_determinant_evidence/, 'la reprise demande la citation');
  const d = decision(vus);
  assert.equal(d.fast_rejection_reason, 'UNGROUNDED_DETERMINANT');
  assert.equal(d.evidence_present, false);
  assert.equal(d.determinant_grounded, false);
  assert.equal(d.fast_replacement_result, 'REFUSED_AGAIN');
  assert.equal(d.deep_trigger_reason, 'FAST_FORM_UNRECOVERABLE', 'la chaîne continue vers le plan profond');
  assert.equal(d.missing_determinant_id, 'lot_to_start', 'le relevé nomme ce que le modèle avait proposé');
  /* Et la porte réseau rend un silence, pas une question — le client escalade, comme toujours. */
  const reponse = await allerRetour(DEMANDE_ZEVQ7C, rendu);
  assert.equal(reponse.status, 200);
  assert.equal(reponse.json.type, 'WAIT_FOR_DEEP_VALIDATION');
  assert.equal(reponse.json.missing_determinant_id, null);
});

test('T-FSC-03 · ZEVQ7C : quand le modèle conclut lui-même qu’il n’y a rien à demander, rien ne change', async (t) => {
  /* Le chemin nominal attendu de ce cas : le modèle relit, ne trouve aucun passage dont dépende une
     information non fournie, rend null — et ne questionne pas. Le pipeline continue. */
  const sortie = { explicit_unknown_determinant_ids: ['heures_par_mois', 'cout_migration'],
    missing_determinant_evidence: null, type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Rien à demander.',
    question_focus: null, missing_determinant_id: null };
  const appels = avecFournisseurRapide(t, [sortie]);
  const { vus, log } = journal();
  const rendu = await runFastInteractionWithHaChain(instantane(DEMANDE_ZEVQ7C), ENV, { log });
  assert.equal(rendu.type, 'WAIT_FOR_DEEP_VALIDATION');
  assert.equal(appels.length, 1, 'un silence du modèle n’est pas un refus de fondement : aucune reprise');
  assert.deepEqual(rendu.explicit_unknown_determinant_ids, ['heures_par_mois', 'cout_migration'],
    'les inconnues déclarées par la personne voyagent toujours');
  const reponse = await allerRetour(DEMANDE_ZEVQ7C, rendu);
  assert.equal(reponse.status, 200);
  assert.deepEqual(Object.keys(reponse.json).sort(), [...FAST_INTERACTION_TRANSPORT_FIELDS].sort());
  assert.equal(decision(vus).fast_rejection_reason, null, 'aucun refus : le modèle n’a rien proposé');
});

/* ==========================================================================
 * 2 — LES CAS GÉNÉRIQUES A → E
 * ======================================================================= */

test('T-FSC-04 · A : une demande explicitement séquentielle dont l’ordre manque → clarification autorisée', () => {
  const demande = 'Traitez ces trois dossiers l’un après l’autre, et remettez-moi chaque conclusion avant de passer au suivant.';
  const s = snap(demande);
  const q = ask('Par quel dossier souhaitez-vous commencer ?', 'l’un après l’autre', { id: 'ordre_de_traitement' });
  assert.equal(isGroundedInRequest(q, fastSnapshotFacts(s)), true, 'l’exigence citée est dans la demande');
  assert.equal(assessSolicitation(q, [], false, fastSnapshotFacts(s)), 'ALLOW');
  assert.deepEqual(guardFastInteraction(q, s), q, 'la question passe, intacte');
});

test('T-FSC-05 · B : une comparaison simultanée de plusieurs options → aucune question « laquelle d’abord »', () => {
  const s = snap(DEMANDE_ZEVQ7C);
  /* Sans citation : refusée. Avec une citation que la personne n'a pas écrite — la phrase que le
     modèle IMAGINE pour justifier l'ordre — : refusée aussi. C'est la garantie déterministe. */
  for (const citation of [null, '', 'Traitez-les dans l’ordre.', 'laquelle en premier']) {
    const q = ask('Quelle stratégie souhaitez-vous traiter en premier ?', citation, { id: 'lot_to_start' });
    assert.equal(assessSolicitation(q, [], false, fastSnapshotFacts(s)), 'UNGROUNDED_DETERMINANT', `citation : ${JSON.stringify(citation)}`);
    assert.deepEqual(guardFastInteraction(q, s), SILENT_INTERACTION);
  }
  /* CE QUE LE GARDE NE JUGE PAS, DIT ICI. Une citation réelle mais sans rapport avec la question
     n'est pas contredite par une égalité de contenu : la protection contre ce cas-là tient à
     l'ordre du schéma — la citation précède la décision — et à la consigne, pas au garde. */
  const citeeMaisReelle = ask('Quelle stratégie souhaitez-vous traiter en premier ?', 'comparer trois stratégies', { id: 'lot_to_start' });
  assert.equal(isGroundedInRequest(citeeMaisReelle, fastSnapshotFacts(s)), true,
    'une citation réelle est une citation réelle : le garde ne lit pas le sens');
});

test('T-FSC-06 · C : une demande mono-objectif complète → aucune clarification inventée', () => {
  const demande = 'Résume ce paragraphe en trois phrases, en gardant le ton neutre.';
  const s = snap(demande);
  /* Le modèle n'a rien à demander : ce type-là passe, sans citation, comme avant. */
  const rien = { type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Rien à demander.', question_focus: null,
    missing_determinant_id: null, explicit_unknown_determinant_ids: [], missing_determinant_evidence: null };
  assert.deepEqual(guardFastInteraction(rien, s), rien);
  assert.equal(validateFastInteraction(rien, s).ok, true);
  /* Une question fabriquée sans fondement, elle, ne passe plus. */
  const inventee = ask('Quelle section souhaitez-vous traiter en premier ?', null, { id: 'section_to_start' });
  assert.deepEqual(guardFastInteraction(inventee, s), SILENT_INTERACTION);
});

test('T-FSC-07 · D : une information réellement non substituable absente → ASK_CLARIFICATION reste possible', async () => {
  const demande = 'Rédige une invitation pour la réunion de rentrée de l’association, à envoyer à tous les membres.';
  const s = snap(demande);
  const q = ask('À quelle date se tient la réunion de rentrée ?', 'la réunion de rentrée de l’association', { id: 'date_reunion' });
  assert.equal(assessSolicitation(q, [], false, fastSnapshotFacts(s)), 'ALLOW');
  assert.deepEqual(guardFastInteraction(q, s), q);
  /* La citation qui a fondé la question ne repart pas : le client reçoit le contrat de transport. */
  const reponse = await allerRetour(demande, q);
  assert.equal(reponse.status, 200);
  assert.equal(reponse.json.type, 'ASK_CLARIFICATION');
  assert.equal(reponse.json.missing_determinant_id, 'date_reunion');
  assert.equal(reponse.json.question_focus, 'problem_or_user_context');
  assert.equal('missing_determinant_evidence' in reponse.json, false, 'la citation reste dans le Worker');
  assert.deepEqual(Object.keys(reponse.json).sort(), [...FAST_INTERACTION_TRANSPORT_FIELDS].sort());
  /* Et une citation venue d'une RÉPONSE de la personne fonde aussi bien : ses mots sont ses mots. */
  const historique = [{ turn: 1, question: 'Quel est le sujet ?', answer: 'La rentrée, avec un atelier pour les nouveaux membres.', provenance: 'user' }];
  const q2 = ask('Combien de nouveaux membres attendez-vous ?', 'un atelier pour les nouveaux membres', { id: 'nombre_nouveaux' });
  assert.equal(assessSolicitation(q2, historique, false, fastSnapshotFacts(snap(demande, { historique }))), 'ALLOW');
  const q3 = ask('Combien de nouveaux membres attendez-vous ?', 'un atelier pour les nouveaux membres', { id: 'nombre_nouveaux' });
  assert.equal(isGroundedInRequest(q3, { originalRequest: demande, currentAnswer: 'Nous prévoyons un atelier pour les nouveaux membres.' }), true,
    'la réponse en cours compte aussi');
});

test('T-FSC-08 · E : un déterminant non supporté par la demande → rejet, repli existant, rien d’inventé', async (t) => {
  /* Le rejet passe par l'architecture existante : verdict → silence → UNE reprise corrigée → silence
     → le plan profond. Aucune question n'est réécrite, aucun texte n'est fabriqué : ce qui sort est
     l'objet de silence, à l'identité près. */
  const demande = 'Prépare un plan de formation de deux jours pour une équipe qui découvre le sujet.';
  const appels = avecFournisseurRapide(t, [
    ask('Quel module souhaitez-vous aborder en premier ?', null, { id: 'module_to_start' }),
    ask('Quel module souhaitez-vous aborder en premier ?', 'aborder en premier', { id: 'module_to_start' })
  ]);
  const { vus, log } = journal();
  const rendu = await runFastInteractionWithHaChain(instantane(demande), ENV, { log });
  assert.equal(rendu, SILENT_INTERACTION, 'l’objet de silence, pas une question réécrite');
  assert.equal(appels.length, 2, 'une reprise, bornée');
  assert.match(appels[1].systeme, new RegExp(FAST_CORRECTIONS.UNGROUNDED_DETERMINANT.slice(0, 40)));
  const d = decision(vus);
  assert.equal(d.fast_guard_result, 'UNGROUNDED_DETERMINANT');
  assert.equal(d.fast_replacement_attempted, true);
  assert.equal(d.fast_replacement_result, 'REFUSED_AGAIN', 'une citation inventée ne fonde rien');
  assert.equal(d.deep_trigger_reason, 'FAST_FORM_UNRECOVERABLE');
  /* Le relevé ne porte jamais la citation : deux booléens, jamais ses mots. */
  const serialise = JSON.stringify(vus);
  assert.equal(serialise.includes('aborder en premier'), false, 'aucun texte cité dans le journal');
  assert.equal(serialise.includes(demande), false);
  assert.equal(typeof d.evidence_present, 'boolean');
  assert.equal(typeof d.determinant_grounded, 'boolean');
});

/* ==========================================================================
 * 3 — CE QUI NE DOIT PAS CASSER
 * ======================================================================= */

test('T-FSC-09 · anti-reask et inconnues déclarées : la répétition prime, et le registre voyage', () => {
  const demande = 'Organise un déplacement de trois jours pour six personnes ; je ne connais pas encore le budget.';
  const s = snap(demande);
  /* « Je ne sais pas » déjà déclaré : ALREADY_ANSWERED, avant même le fondement. */
  const redemande = ask('Quel est votre budget ?', 'je ne connais pas encore le budget', { id: 'budget', declarees: ['budget'] });
  assert.equal(assessSolicitation(redemande, [], false, fastSnapshotFacts(s)), 'ALREADY_ANSWERED');
  /* Une question déjà répondue dans l'historique : ALREADY_ANSWERED, fondée ou non. */
  const historique = [{ turn: 1, question: 'Combien de jours ?', answer: 'trois', provenance: 'user', missing_determinant_id: 'duree' }];
  const reposee = ask('Pour combien de jours ?', 'trois jours', { id: 'duree' });
  assert.equal(assessSolicitation(reposee, historique, false, fastSnapshotFacts(snap(demande, { historique }))), 'ALREADY_ANSWERED');
  /* Le registre reste transporté par la validation, citation ou non. */
  const v = validateFastInteraction(ask('Quelle est la ville de départ ?', 'six personnes', { id: 'ville_depart', declarees: ['budget'] }), s);
  assert.equal(v.ok, true);
  assert.deepEqual(v.interaction.explicit_unknown_determinant_ids, ['budget']);
  assert.equal(v.interaction.missing_determinant_id, 'ville_depart');
  assert.equal('missing_determinant_evidence' in v.interaction, false, 'la citation ne devient pas un champ de l’interaction');
});

test('T-FSC-10 · question_focus, ACK/WAIT et repli profond : inchangés', async () => {
  const demande = 'Corrige ce texte en gardant le sens.';
  const s = snap(demande);
  /* Les types non sollicitants passent comme avant, sans citation, par le même chemin. */
  for (const type of ['ACKNOWLEDGE', 'WAIT_FOR_DEEP_VALIDATION', 'ORIENT_ARCHITECTE']) {
    const c = { type, text: 'Reçu.', question_focus: null, missing_determinant_id: null, explicit_unknown_determinant_ids: [] };
    assert.deepEqual(guardFastInteraction(c, s), guardFastSolicitation(c, s));
    assert.deepEqual(guardFastInteraction(c, s), c);
  }
  /* Une question méta reste méta, avant le fondement : le garde D2F1 n'a pas bougé. */
  const meta = { ...ask('Quel type de résultat attendez-vous ?', 'gardant le sens', { id: 'forme' }), question_focus: 'output_specification' };
  assert.equal(assessSolicitation(meta, [], false, fastSnapshotFacts(s)), 'META_OUTPUT_QUESTION');
  /* Le transport de question_focus par la porte : identique. */
  const q = ask('Quel est le public visé ?', 'gardant le sens', { id: 'public' });
  const reponse = await allerRetour(demande, q);
  assert.equal(reponse.json.question_focus, 'problem_or_user_context');
  /* Le silence rendu par le garde reste le silence que le client sait escalader. */
  assert.deepEqual(SILENT_INTERACTION, { type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Validation approfondie nécessaire.' });
  const silence = await allerRetour(demande, SILENT_INTERACTION);
  assert.equal(silence.status, 200);
  assert.equal(silence.json.type, 'WAIT_FOR_DEEP_VALIDATION');
});

/* ==========================================================================
 * 4 — LA FORME DU CORRECTIF, SUR LES OCTETS
 * ======================================================================= */

test('T-FSC-11 · le fait précède la décision : ordre du schéma, description, consigne', () => {
  const ordre = Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties);
  assert.ok(ordre.indexOf('explicit_unknown_determinant_ids') < ordre.indexOf('missing_determinant_evidence'), 'après le registre');
  assert.ok(ordre.indexOf('missing_determinant_evidence') < ordre.indexOf('type'), 'avant la décision');
  assert.deepEqual(FAST_INTERACTION_JSON_SCHEMA.required, ordre, 'required suit le même ordre');
  assert.deepEqual(FAST_INTERACTION_JSON_SCHEMA.properties.missing_determinant_evidence.type, ['string', 'null']);
  assert.match(FAST_INTERACTION_JSON_SCHEMA.properties.missing_determinant_evidence.description, /Citation exacte/);
  assert.match(FAST_INTERACTION_JSON_SCHEMA.properties.missing_determinant_evidence.description, /aucune question n'est possible/);
  /* La consigne pose la règle dans le bloc des faits, avant la doctrine, et après le registre. */
  const p = FAST_INTERACTION_SYSTEM_PROMPT;
  const i = p.indexOf('CITEZ CE QUI L\'EXIGERAIT');
  assert.notEqual(i, -1);
  assert.ok(i > p.indexOf('CE REGISTRE EST INDÉPENDANT'), 'après le registre');
  assert.ok(i < p.indexOf('AVANT DE QUESTIONNER — LA SUBSTITUTION'), 'avant la doctrine');
  assert.match(p, /alors vous ne posez aucune question, quelle qu'elle soit/);
  /* Ce qui sort vers le client est déclaré, et n'inclut pas la citation. */
  assert.deepEqual([...FAST_INTERACTION_TRANSPORT_FIELDS],
    ['explicit_unknown_determinant_ids', 'type', 'text', 'question_focus', 'missing_determinant_id']);
  assert.equal(/missing_determinant_evidence/.test(porte), false, 'la porte réseau ne la recopie pas');
});

test('T-FSC-12 · aucun lexique, aucun domaine, aucun seuil, aucune autorité nouvelle', () => {
  const bloc = politique.slice(politique.indexOf('export function isGroundedInRequest'), politique.indexOf('/* Interrogatifs français.'));
  const code = bloc.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  for (const interdit of ['RegExp', 'match(', 'similar', 'distance', 'ratio', 'score', 'threshold', 'levenshtein', 'fetch(', 'length >', 'length <', 'Math.']) {
    assert.equal(code.includes(interdit), false, `« ${interdit} » n’a rien à faire dans une égalité de contenu`);
  }
  assert.equal(/\d/.test(code), false, 'aucun chiffre : aucun seuil');
  /* La normalisation est celle qui existait déjà pour la répétition — aucune seconde n'est née. */
  assert.equal((politique.match(/^const identite = /gm) || []).length, 1);
  assert.match(code, /identite\(/);
  assert.equal((politique.match(/^const [A-Z_]+ = \//gmu) || []).length, 5, 'aucun motif lexical ajouté au module');
  /* Aucun mot de domaine ni d'exemple, dans le garde, la consigne ajoutée, la correction. */
  const clause = FAST_INTERACTION_SYSTEM_PROMPT.slice(FAST_INTERACTION_SYSTEM_PROMPT.indexOf('CITEZ CE QUI L\'EXIGERAIT'),
    FAST_INTERACTION_SYSTEM_PROMPT.indexOf('AVANT DE QUESTIONNER — LA SUBSTITUTION'));
  for (const texte of [code, clause, FAST_CORRECTIONS.UNGROUNDED_DETERMINANT]) {
    for (const domaine of ['lot', 'Trello', 'stratégie', 'SaaS', 'migration', 'budget', 'voyage', 'facture', 'projet']) {
      assert.equal(new RegExp(`\\b${domaine}`, 'iu').test(texte), false, `« ${domaine} » interdit`);
    }
    assert.equal(/\d/.test(texte), false, 'aucun chiffre');
  }
  /* Aucune autorité : le verdict est un verdict de sollicitation, et le silence est celui d'avant. */
  assert.ok(SOLICITATION_VERDICTS.includes('UNGROUNDED_DETERMINANT'));
  assert.equal(/operational_request_ready|clarification_required|readiness/.test(code), false);
  for (const source of [plan, porte]) {
    assert.equal(/UNGROUNDED_DETERMINANT|isGroundedInRequest/.test(source), false, 'le plan et la porte ne jugent pas le fondement : seul le garde le fait');
  }
  /* Le relevé du Worker ne journalise jamais la citation. */
  const releve = worker.slice(worker.indexOf('function journaliserDecisionRapide'), worker.indexOf('async function rattraperQuestionRefusee'));
  assert.equal(/missing_determinant_evidence/.test(releve), false);
  assert.match(releve, /determinant_grounded: refus\.determinant_grounded === true/);
});
