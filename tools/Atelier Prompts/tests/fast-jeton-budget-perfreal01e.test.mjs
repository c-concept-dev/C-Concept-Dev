/* PERF-REAL-01E — ON NE PEUT PAS DESCENDRE SOUS LE PLANCHER.
 * ============================================================================
 *
 * Le lot demandait de réduire le coût en jetons d'un appel Fast pour faire
 * entrer le banc dans le quota. La comptabilité du fournisseur, relevée plutôt
 * qu'estimée, donne 425 jetons par appel ; le banc en autorise 147. Il faudrait
 * en retirer 65,4 %.
 *
 * LE PLANCHER TRANCHE. En supprimant INTÉGRALEMENT le prompt système — ce que le
 * contrat Fast interdit, mais qui borne le problème — un appel coûte encore
 * 192 jetons : le schéma (69), l'enveloppe de rôles imposée par l'API (46), la
 * demande la plus courte (27) et la sortie la plus courte (50). 192 dépasse 147.
 * Aucune version du prompt ne change cette conclusion.
 *
 * DONC RIEN N'A ÉTÉ AMPUTÉ. La section 13 impose de s'arrêter dans ce cas, et la
 * section 6 interdit de supprimer une instruction parce qu'elle est longue. Les
 * 221 jetons du prompt système portent la non-autorité, la discipline du dernier
 * recours et l'énumération des types — trois choses qu'aucun autre mécanisme
 * n'impose.
 *
 * CES TESTS VERROUILLENT LE PAYLOAD. Si quelqu'un raccourcit le prompt Fast, ou
 * y ajoute du contexte, ils échoueront — dans les deux sens.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  FAST_INTERACTION_JSON_SCHEMA, FAST_INTERACTION_TYPES, FAST_FORBIDDEN_AUTHORITY_FIELDS,
  createTurnSnapshot, validateFastInteraction
} from '../workers/shared/fast-interactive-plane.js';
import {

/* TARGETED-FIX-POST-CODEX-01 — le contrat du plan rapide compte un QUATRIÈME champ nommé :
   l'identité du manque. Le contre-audit a démontré qu'une question rapide répondue laissait
   l'historique sans identité, si bien qu'une reformulation ultérieure du même manque par le plan
   profond n'était plus reconnue. L'invariant gardé ici est inchangé — le schéma reste clos et
   incapable de porter un état ; il s'allonge d'un fait produit par la même décision. */
  FAST_INTERACTION_SYSTEM_PROMPT, makeFastInteractionUserMessage, FAST_INTERACTION_ADAPTERS,
  DECISION_PROVIDER_ORDER, GROQ_PRODUCTION_RETRY_DEFAULTS, MODEL
} from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const E = JSON.parse(lire('evaluation/perf-real-01/results-01e.json'));
const D = JSON.parse(lire('evaluation/perf-real-01/results-01d.json'));
const B = JSON.parse(lire('evaluation/perf-real-01/results-01b.json'));
const WORKER = lire('workers/groq/src/index.js');

/** Six classes neutres, les mêmes que les bancs 01B à 01D. */
const CLASSES = {
  A_SIMPLE: 'Explique la photosynthèse en trois phrases simples.',
  B_VAGUE: 'Aide-moi avec mon document.',
  C_RICHE: 'Rédige une note de cadrage de 800 mots pour un atelier de trois heures réunissant douze personnes, avec un ordre du jour minuté et trois livrables attendus.',
  D_CONFIRMATION: 'Résume ce rapport en gardant uniquement les recommandations, et supprime tout le reste.',
  E_ORIENTATION: 'Je dois préparer une refonte complète de notre processus de recrutement.',
  F_INCONNU_VALIDE: 'Compare les approches et dis-moi laquelle convient.'
};

// =================================================================================================
// §3, §4 — LA COMPTABILITÉ, ET LE PAYLOAD
// =================================================================================================

test('T-PERFREAL01E-01 : le coût d’un appel est celui que le fournisseur rapporte', () => {
  const c = E.comptabilite_avant;
  assert.match(c.source, /champ usage rapporte par Groq/);
  assert.equal(c.prompt_tokens.p50, 367);
  assert.equal(c.completion_tokens.p50, 59);
  assert.equal(c.total_tokens.p50, 425, 'FAST_TOTAL_TOKENS_P50');
  assert.equal(c.total_tokens.p95, 483);
  /* Le plafond de complétion ne coûte rien : aucune réponse n’est tronquée. */
  assert.deepEqual(c.finish_reason, ['stop']);
  assert.equal(c.max_completion_tokens_demandes, 512);
  assert.match(c.note, /le plafond de 512 n est jamais atteint — il ne consomme donc pas de budget/);
});

test('T-PERFREAL01E-02 : le plan rapide ne porte que ses propres responsabilités', () => {
  /* Rien dans la consigne ne lui demande de décider, router, exécuter ou vérifier. */
  const p = FAST_INTERACTION_SYSTEM_PROMPT;
  assert.match(p, /Vous ne décidez rien : ni que la demande est prête, ni quelle route suivre, ni aucun état\./);
  for (const responsabilite of ['READY', 'exécuter', 'livrable', 'quality gate', 'contrat canonique',
                                'Analyste', 'Critique', 'Arbitre']) {
    assert.equal(p.includes(responsabilite), false, `le plan rapide ne se voit pas confier : ${responsabilite}`);
  }
  /* Et ce qu'il porte est irréductible : trois obligations, aucune imposée ailleurs. */
  assert.match(p, /Types possibles : ACKNOWLEDGE/);
  assert.match(p, /Demander une précision est le dernier recours, jamais le premier/);
  /* OPTION D — la clause finale énumère un cinquième fait : ce que la personne a déclaré ignorer.
     Ce qu'elle garde est inchangé — la consigne CLÔT l'énumération et interdit tout le reste. */
  /* FAST-FIRST-PASS — la clause finale énumère le contrat DANS L'ORDRE OÙ IL EST PRODUIT : le fait
     sémantique d'abord, la décision ensuite. Ce qu'elle garde est inchangé — elle CLÔT l'énumération
     et interdit tout le reste. */
  /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — un sixième fait, à sa place dans l'ordre de production : la
     citation qui fonde la question, entre le registre et le type. L'énumération reste close. */
  assert.match(p, /Répondez exactement au schéma fourni : ce que la personne a déclaré ignorer, la citation qui fonde la question, un type, un texte, ce que la question interroge, et ce qui manque\. Rien d'autre\./);
});

test('T-PERFREAL01E-03 : aucune autorité OPRIE n’est recopiée dans le payload rapide', () => {
  const snapshot = createTurnSnapshot({ turn_id: 1, original_request: CLASSES.A_SIMPLE });
  const message = JSON.parse(makeFastInteractionUserMessage(snapshot));
  assert.deepEqual(Object.keys(message).sort(),
    ['demande', 'historique_clarifications', 'materiau_fourni', 'reponse_courante']);
  assert.equal(typeof message.materiau_fourni, 'boolean', 'la présence du matériau coûte un booléen');
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    assert.equal(champ in message, false, `${champ} absent du message`);
  }
  /* La consigne, elle, PARLE de route et d'état — pour les interdire. « ni quelle
     route suivre, ni aucun état » n'est pas une autorité recopiée, c'est son
     refus explicite. Ce qu'on vérifie donc, c'est que rien n'y est ACCORDÉ. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT,
    /Vous ne décidez rien : ni que la demande est prête, ni quelle route suivre, ni aucun état\./);
  for (const octroi of ['vous décidez', 'vous choisissez la route', 'marquez la demande',
                        'vous pouvez exécuter', 'déclarez prêt']) {
    assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.toLowerCase().includes(octroi), false,
      `aucune autorité accordée : « ${octroi} »`);
  }
  /* Ni contrat canonique, ni verrous, ni instructions de mode. */
  for (const bloc of ['canonical_contract', 'VERROUS', 'FORMATS', 'mode_demande', 'readiness']) {
    assert.equal(makeFastInteractionUserMessage(snapshot).includes(bloc), false);
  }
});

test('T-PERFREAL01E-04 : le schéma est inchangé, et il est irréductible', () => {
  /* V2.2.1-D2F1 — TROIS CHAMPS, ET L'INVARIANT EST LE MÊME.
     Le plan rapide écrit ses propres questions ; il doit donc dire ce qu'elles interrogent, comme
     le plan profond le fait pour les siennes. `question_focus` n'est PAS un champ d'autorité : il
     ne prononce aucun état, n'ouvre aucune route, n'autorise aucune exécution — ce que les
     assertions suivantes continuent de vérifier. */
  assert.deepEqual(Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties).sort(), ['explicit_unknown_determinant_ids', 'missing_determinant_evidence', 'missing_determinant_id', 'question_focus', 'text', 'type']);
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.additionalProperties, false);
  /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — la citation qui fonde une question est entrée au contrat, entre le registre et le type ; elle sert au garde et ne repart jamais vers le client (FAST_INTERACTION_TRANSPORT_FIELDS). */
  assert.deepEqual([...FAST_INTERACTION_JSON_SCHEMA.required].sort(), ['explicit_unknown_determinant_ids', 'missing_determinant_evidence', 'missing_determinant_id', 'question_focus', 'text', 'type']);
  assert.deepEqual(FAST_INTERACTION_JSON_SCHEMA.properties.type.enum, [...FAST_INTERACTION_TYPES]);
  /* C'est cet objet-là qui rend l'autorité impossible : le retirer pour gagner
     69 jetons supprimerait la garantie, pas seulement du texte. */
  const inventaire = E.inventaire_payload.find((b) => b.bloc === 'SCHEMA');
  assert.equal(inventaire.retirable, false);
  assert.match(inventaire.raison, /garantie STRUCTURELLE que la candidate ne peut porter aucune autorite/);
});

test('T-PERFREAL01E-05 : il n’y avait rien à dédupliquer', () => {
  assert.equal(E.duplication.avant, 0, 'DUPLICATE_FAST_CONTEXT_COUNT_BEFORE');
  assert.equal(E.duplication.apres, 0, 'DUPLICATE_FAST_CONTEXT_COUNT_AFTER');
  /* Vérifié sur le payload réel : la demande n'apparaît qu'une fois. */
  const message = makeFastInteractionUserMessage(
    createTurnSnapshot({ turn_id: 1, original_request: CLASSES.C_RICHE }));
  assert.equal(message.split('Rédige une note de cadrage').length - 1, 1);
  for (const bloc of ['CANONICAL_CONTEXT', 'EXAMPLES', 'REDUNDANT_LOCKS']) {
    const b = E.inventaire_payload.find((x) => x.bloc === bloc);
    assert.equal(b.jetons_estimes, 0);
    assert.equal(b.retirable, 'DEJA ABSENT');
  }
});

// =================================================================================================
// §12, §13 — LE CALCUL, ET LE PLANCHER
// =================================================================================================

test('T-PERFREAL01E-16 : la capacité soutenable est calculée, pas décrétée', () => {
  const c = E.calcul_capacite;
  assert.equal(c.quota_observe_tpm, 8000);
  assert.equal(c.espacement_ms, 700);
  assert.equal(c.latence_nominale_p50_ms, D.sans_reprise.p50, 'la latence vient de la mesure 01D');
  assert.equal(c.periode_par_appel_ms, c.espacement_ms + c.latence_nominale_p50_ms);
  assert.equal(c.debit_du_banc_par_min, Math.round((60000 / c.periode_par_appel_ms) * 10) / 10);
  assert.equal(c.max_soutenable_jetons_par_requete, Math.floor(c.quota_observe_tpm / c.debit_du_banc_par_min));
  assert.equal(c.max_soutenable_jetons_par_requete, 147, 'MAX_SUSTAINABLE_TOKENS_PER_REQUEST');
  assert.equal(c.actuel_jetons_par_requete_p50, E.comptabilite_avant.total_tokens.p50);
  assert.equal(c.reduction_requise_percent, 65.4, 'REQUIRED_TOKEN_REDUCTION_PERCENT');
});

test('T-PERFREAL01E-15 : aucune réduction n’a été appliquée, et le plancher dit pourquoi', () => {
  const p = E.calcul_capacite.plancher_structurel;
  /* Le plancher est la somme de quatre postes dont AUCUN n'est le prompt système. */
  assert.equal(p.total, p.schema + p.enveloppe_api + p.demande_la_plus_courte + p.sortie_la_plus_courte);
  assert.equal(p.total, 192);
  assert.ok(p.total > E.calcul_capacite.max_soutenable_jetons_par_requete,
    `${p.total} jetons de plancher pour ${E.calcul_capacite.max_soutenable_jetons_par_requete} soutenables`);
  assert.equal(E.calcul_capacite.faisable, false, 'TOKEN_OPTIMIZATION_CAPACITY_FEASIBLE = NO');
  /* TOKEN_REDUCTION_PERCENT = 0 : aucune réduction n'a jamais été appliquée, et c'est toujours vrai.
   *
   * 03B — LA CONSIGNE A ALLONGÉ, ET CE RELEVÉ DIT CE QUE CELA COÛTE.
   * Le lot 03B lui a ajouté le critère qui lui manquait pour savoir quand demander : 794 → 2243
   * caractères. Mesuré sur l'API : 506 → 954 jetons d'entrée par appel rapide, soit +88,5 %. Or
   * ce lot-ci avait établi que la capacité soutenable était de 147 jetons par requête pour 425
   * consommés — déjà infaisable. L'allongement aggrave donc un budget déjà dépassé, et le relevé
   * l'enregistre au lieu de le masquer. Ce n'est pas une réduction inversée : c'est une dépense
   * assumée pour supprimer une escalade de 116 s, arbitrée par le propriétaire (option A du 03A). */
  assert.equal(E.optimisation.appliquee, false);
  /* BETA-04 — deuxième allongement, et son coût, mesuré comme le premier.
   * 03B avait porté la consigne de 794 à 2 243 caractères (506 → 955 jetons d'entrée sur le
   * tokeniseur de production) en lui ajoutant le critère qui lui manquait pour savoir quand
   * demander. BETA-04 y ajoute, en trois temps : les phrases d'atomicité (2 243 → 2 545), la
   * présence du matériau, l'interdiction de coordonner deux besoins, et la distinction entre un
   * contenu qui varie et une production qui change (→ 3 178 caractères). Puis, après deux échecs
   * owner-beta réels, le PREMIER EXAMEN porté en tête du protocole — la demande nomme-t-elle une
   * production, ou seulement une intention ? Mesuré sur le modèle réellement déployé, ce seul
   * déplacement fait passer les demandes d'intention de 1 sollicitation sur 6 à 5 sur 6, en 314 à
   * 565 ms, là où la personne attendait 78 secondes pour une question catalogue.
   *
   * Coût mesuré à base constante — consigne + message utilisateur, sans schéma d'outil, compté sur
   * l’API disponible ici : 730 jetons pour la consigne 03B, 999 pour celle-ci, soit +269 jetons
   * (+36,8 %) pour l'ensemble des ajouts de ce lot. Les chiffres de production ci-dessus viennent
   * d'un autre tokeniseur et ne s'additionnent pas à ceux-là : c'est le rapport qui se transpose.
   *
   * Et la mesure de production elle-même, relevée sur le runtime déployé (groq_usage_observation) :
   * 933 et 942 jetons d'entrée pour deux demandes courtes, 68 à 113 jetons de sortie, 222 à 277 ms de
   * latence fournisseur. Le plan rapide tient donc son contrat interactif avec cette consigne-là.
   *
   * V2.1.2 — CE QUE CET ALLONGEMENT COÛTE, DIT SANS DÉTOUR. 4 378 → 5 452 caractères, parce que le
   * jugement par CATÉGORIE a été remplacé par un test d'impact : mesuré sur les essais réels, la
   * catégorie interdisait au plan rapide de demander le niveau d'un public ou une modalité de
   * participation, et le plan profond posait alors la question — de dix-sept à quarante-cinq secondes.
   *
   * Mais le budget du fournisseur rapide est de 8 000 jetons par minute, et un tour de dialogue avancé
   * en coûtait déjà 1 802 : quatre tours l'épuisaient, le cinquième échouait, et le client escaladait
   * vers le plan profond. Une consigne plus longue rapproche donc ce mur. Le compromis est assumé
   * ici : une question posée en une demi-seconde vaut mieux qu'une question juste obtenue en vingt
   * secondes, et le mur, lui, est désormais lisible dans les journaux (`fast_unavailable`). Réduire
   * ce coût demande soit de raccourcir la consigne — au prix de règles que des tests protègent — soit
   * un second fournisseur rapide : deux décisions qui appartiennent au propriétaire.
   *
   * Ce surcoût est le prix d'un garde qui ne coûte AUCUN appel fournisseur. La première version de
   * ce lot faisait relire chaque sollicitation par un modèle : un appel de plus, donc environ 500 à
   * 1 000 jetons ET quelques centaines de millisecondes sur le chemin de la première interaction.
   * Cette consigne-là remplace cet appel, et le matériau signalé supprime une question entière.
   *
   * V2.1.5 — 5 452 → 5 765 caractères, soit 313 de plus, et ce registre les compte. La clause ajoutée
   * dit au plan rapide qu'il TERMINE la clarification au lieu de la déléguer. Mesure d'origine : sur
   * les trois essais du propriétaire, le plan rapide renvoyait au plan profond une question qu'il
   * avait lui-même les moyens de poser, et la personne attendait vingt-deux puis soixante secondes
   * pour l'obtenir. 313 caractères valent environ 78 jetons par appel : un tour de dialogue avancé
   * passe de 1 802 à environ 1 880 jetons, et le mur des 8 000 jetons par minute reste atteint au
   * même endroit — au quatrième tour (7 520 jetons contre 7 208). L'échange est donc : un coût qui ne
   * déplace pas le mur, contre des dizaines de secondes d'attente supprimées.
   *
   * La clause a été RÉDUITE avant d'être retenue — 447 caractères dans sa première rédaction, 313
   * ici — en gardant la règle et la cause, et en supprimant la reformulation. Une consigne ne
   * s'allonge pas parce que la règle est vraie : elle s'allonge du minimum qui la rend applicable.
   *
   * V2.1.5.3 — 5 765 → 6 211 caractères, soit 446 de plus, et voici ce qu'ils achètent. Mesure
   * d'origine, tirée du parcours navigateur de l'audit indépendant : trois questions posées — budget,
   * dates, durée — et JAMAIS la ville de départ, alors que le budget annoncé incluait les vols. La
   * consigne savait juger si un manque est matériel ; elle ne savait pas classer deux manques entre
   * eux, et rien n'y disait qu'une exigence dont le respect dépend d'une variable non donnée rend
   * cette variable matérielle. Le résultat était une readiness prononcée sans la variable qui décide
   * si l'exigence tient.
   *
   * 446 caractères valent environ 112 jetons par appel : un tour de dialogue avancé passe d'environ
   * 1 880 à 1 992 jetons. Le mur des 8 000 jetons par minute se rapproche — quatre tours coûtent
   * 7 968 jetons contre 7 520 — et il reste atteint au quatrième, mais de justesse. C'est le coût le
   * plus proche du mur que ce registre ait enregistré, et il est assumé pour une raison mesurable :
   * V2.1.5.3 SUPPRIME des appels, il n'en ajoute pas. Un refus de forme ne déclenche plus un Core de
   * dix-huit à vingt-cinq secondes avant la readiness, et une question mieux choisie évite un tour
   * entier. Le prochain allongement de cette consigne, lui, devra d'abord raccourcir ailleurs.
   *
   * V2.2 — 6 211 → 6 266 caractères, soit 55 de plus, et pour une fois la cause est une SUPPRESSION.
   * La doctrine de clarification — échelle de substitution, matérialité, priorité — était écrite dans
   * TROIS modules : cette consigne, celle du plan profond, et celles du trio historique. Elle est
   * désormais écrite UNE fois, chez son propriétaire (`OPRIE_CLARIFICATION_DOCTRINE`), et les deux
   * plans vivants l'incluent. Le texte reçu par le modèle rapide est donc presque identique en
   * longueur, mais il n'en existe plus qu'une source : une règle corrigée l'est partout à la fois.
   * La part qui gouverne le candidat est restée hors de cette consigne — le plan rapide n'en produit
   * aucun, et son budget de jetons est mesuré.
   *
   * V2.2.1-C — 6 266 → 6 604 caractères, soit 338 de plus, pour une clause de six lignes. Mesure
   * d'origine : sur une contradiction explicite — deux exigences qui s'excluent —, le plan rapide
   * posait cinq questions d'affilée et n'escaladait JAMAIS, trois fois sur trois. La même consigne
   * servie à un autre modèle escaladait correctement : la règle était donc écrite, mais elle arrivait
   * après six mille caractères de doctrine et le petit modèle ne la rejoignait plus. Déplacée en
   * PREMIER CONTRÔLE, elle agit : escalade 2/2 sur le modèle de production, sans sur-escalade
   * observée sur les cinq autres catégories mesurées.
   *
   * 338 caractères valent environ 85 jetons par appel : un tour avancé passe d'environ 1 992 à
   * 2 077 jetons, et le mur des 8 000 par minute se rapproche encore — trois tours coûtent 6 231
   * jetons contre 5 976. C'est le coût le plus proche du mur enregistré ici, et il est assumé pour
   * une raison mesurable : une contradiction escaladée coûte UN tour profond, là où cinq questions
   * coûtaient cinq tours rapides et n'aboutissaient pas. */
  /* V2.2.1-D2F1 — QUATRIÈME ALLONGEMENT, ET SON PRIX EST INSCRIT ICI COMME LES TROIS AUTRES.
   *
   * +478 caractères, soit environ +120 jetons par appel rapide. Ce que cela achète : le plan rapide
   * DÉCLARE désormais ce que sa question interroge, au lieu qu'un garde aval le devine en cherchant
   * des mots dans le texte. C'est ce qui a permis de retirer trois motifs de vocabulaire décisionnel
   * du chemin de production. Le sens de ce test est intact : il interdit de RACCOURCIR la consigne
   * pour gagner des jetons, jamais de l'allonger pour une raison mesurée. */
  /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — CINQUIÈME ALLONGEMENT, ET SON PRIX EST INSCRIT ICI COMME LES
   * AUTRES. 10 295 → 11 144 caractères, soit +849, environ +212 jetons par appel rapide. Ce que cela
   * achète, mesuré en production sur ZEVQ7C : le plan rapide demandait « laquelle en premier ? » sur
   * une demande qui comparait plusieurs options ENSEMBLE — une sous-structure de travail que rien
   * dans la demande ne portait, et sur laquelle le tour s'arrêtait. La consigne exige désormais de
   * CITER, mot pour mot, le passage de la demande dont dépend l'information demandée, AVANT de
   * choisir de questionner ; le garde constate la citation dans les mots de la personne, et refuse le
   * reste. Aucun mot de domaine, aucun exemple : la règle est la même pour toute demande. */
  assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.length, 11144,
    'la consigne n’a pas été raccourcie — elle a été allongée par 03B, BETA-04, V2.1.5, V2.1.5.3, V2.2.1-D2F1, TARGETED-FIX-POST-CODEX-01 puis FAST-SPURIOUS-CLARIFICATION-FIX-01, à coût mesuré');
  assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.split(' ').length > 100, true);
  assert.match(E.optimisation.raison, /la section 6 interdit de supprimer une instruction parce qu elle est longue/);
});

// =================================================================================================
// §17, §20, §21 — CE QUI N'A PAS BOUGÉ, ET LA PREUVE EXÉCUTÉE
// =================================================================================================

test('T-PERFREAL01E-06/07 : ni le modèle ni l’ordre des fournisseurs n’ont changé', () => {
  assert.equal(MODEL, 'openai/gpt-oss-20b', 'MODEL_CHANGED = NO');
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai'],
    'PROVIDER_ORDER_CHANGED = NO');
  /* Les trois adaptateurs partagent la même consigne et le même schéma : une
     seule source, aucune variante par fournisseur. */
  const bloc = WORKER.slice(WORKER.indexOf('export const FAST_INTERACTION_ADAPTERS'),
    WORKER.indexOf('export async function runFastInteractionWithHaChain'));
  /* V2.1.1 — le littéral est passé par un constructeur, et l'invariant en sort renforcé : les trois
   * adaptateurs appellent le MÊME `consigneRapide`, qui rend la consigne de base et n'y ajoute que
   * la correction bornée du rattrapage méta — identique pour les trois. Aucun adaptateur ne choisit
   * sa propre consigne, et c'est cela qui était asservi. */
  assert.equal([...bloc.matchAll(/systemPrompt: consigneRapide\(corrective\)/g)].length, 3);
  assert.match(WORKER, /const consigneRapide = \(corrective\) => corrective\s*\?\s*`\$\{FAST_INTERACTION_SYSTEM_PROMPT\}/,
    'et la base est bien la consigne rapide canonique, jamais une autre');
  assert.equal([...bloc.matchAll(/schema: FAST_INTERACTION_JSON_SCHEMA/g)].length, 3);
  assert.deepEqual(Object.keys(FAST_INTERACTION_ADAPTERS).sort(), ['anthropic', 'groq', 'openai']);
});

test('T-PERFREAL01E-08/09/10 : reprises, délais et seuils inchangés', () => {
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries, 2, 'RETRY_POLICY_CHANGED = NO');
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs, 8000, 'TIMEOUT_POLICY_CHANGED = NO');
  assert.deepEqual(E.seuils_inchanges, {
    p50_prefere_ms: B.seuils.p50_prefere_ms, p95_contractuel_ms: B.seuils.p95_contractuel_ms,
    degrade_max_ms: B.seuils.degrade_max_ms, echec_contrat_ms: B.seuils.echec_contrat_ms
  }, 'THRESHOLDS_CHANGED = NO');
  /* Et le plafond de complétion n'a pas été rogné pour gagner du budget. */
  assert.match(WORKER, /maxCompletionTokens: 512,\n\s*pacer: createGroqRateLimitPacer\(\)/);
});

test('T-PERFREAL01E-11 : la construction du payload, exécutée sur les six classes', () => {
  for (const [classe, demande] of Object.entries(CLASSES)) {
    const snapshot = createTurnSnapshot({ turn_id: 1, original_request: demande });
    const message = makeFastInteractionUserMessage(snapshot);
    const analyse = JSON.parse(message);
    assert.equal(analyse.demande, demande, `${classe} : la demande passe telle quelle`);
    assert.deepEqual(analyse.historique_clarifications, []);
    assert.equal(analyse.reponse_courante, null);
    /* BETA-04 ajoute `materiau_fourni` : une présence booléenne, jamais un contenu. */
    assert.equal(analyse.materiau_fourni, false, `${classe} : aucun matériau signalé par défaut`);
    assert.equal(Object.keys(analyse).length, 4, `${classe} : ces champs, pas un de plus`);
    /* Le coût du message croît avec la demande, et avec rien d'autre. */
    const nu = makeFastInteractionUserMessage(createTurnSnapshot({ turn_id: 1, original_request: 'x' }));
    assert.equal(message.length - nu.length, demande.length - 1, `${classe} : aucun surcoût fixe caché`);
  }
});

test('T-PERFREAL01E-12/13 : les six classes respectent le contrat, et n’écrivent aucune autorité', () => {
  let conformes = 0;
  for (const [classe, demande] of Object.entries(CLASSES)) {
    const snapshot = createTurnSnapshot({ turn_id: 1, original_request: demande });
    for (const type of FAST_INTERACTION_TYPES) {
      const v = validateFastInteraction({ type, text: 'Une phrase de réponse.' }, snapshot);
      assert.equal(v.ok, true, `${classe}/${type} : schéma valide`);
      assert.equal(v.interaction.can_mark_ready, false);
      assert.equal(v.interaction.can_route, false);
      assert.equal(v.interaction.can_execute, false);
      assert.equal(v.interaction.authority, 'candidate');
    }
    /* Un texte vide, un type inventé, un champ d'autorité : tous refusés. */
    assert.equal(validateFastInteraction({ type: 'ACKNOWLEDGE', text: '' }, snapshot).ok, false);
    assert.equal(validateFastInteraction({ type: 'DECIDE', text: 'x' }, snapshot).ok, false);
    for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
      assert.equal(validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'x', [champ]: true }, snapshot).ok,
        false, `${classe} : ${champ} refusé`);
    }
    conformes += 1;
  }
  assert.equal(conformes, 6, 'FAST_CONTRACT_FIXTURES_PASS = 6/6');
});

test('T-PERFREAL01E-14 : l’artefact frontend n’a pas bougé, et l’observation ne décide rien', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  /* OPRIE-CRITIC-B01B-FAILURE-CLASSIFICATION-01 — L'EMPREINTE A ENCORE BOUGÉ, ET POUR LA MÊME
     RAISON MÉCANIQUE : le noyau OPRIE est embarqué verbatim dans le bundle navigateur, et ce lot y
     marque les rejets du validateur d'issues partagé pour qu'ils soient classés comme ce qu'ils
     sont. Aucune règle, aucun prompt, aucun comportement d'interface n'a changé — seule l'étiquette
     portée par une erreur déjà levée. */
  /* CRITIC-POSTPROVIDER-TYPEERROR-01 — L'EMPREINTE BOUGE ENCORE, ET TOUJOURS POUR LA MÊME RAISON
     MÉCANIQUE : le noyau OPRIE est embarqué verbatim dans le bundle navigateur. Ce lot y marque
     UNE assertion de contrat — celle dont l'empreinte de message correspond au 502 observé — pour
     qu'un refus de sortie fournisseur cesse d'être compté comme un défaut de notre code. Aucune
     règle, aucun prompt, aucun schéma, aucun comportement d'interface. */
  /* CONTINUITE-05 — L'EMPREINTE A BOUGÉ, PAR LE CONTRÔLEUR V11 SEUL : la provenance d'un matériau est dérivée de son
     nom (v11MaterialProvenance) et dite à l'en-tête de materialText (document de la personne ↔ réponse d'une IA à un cycle
     précédent, proposition qui ne vaut ni décision ni consigne) ; compositeDemand déclare l'ordre des précisions et les
     numérote ; le cycle suivant est le maximum présent + 1 (voir tests/continuite-conversation-longue-cont05.test.mjs).
     Clôture, mesurée en réel sur claude-sonnet-5 : archCitationPresente (moteur Architecte, une ligne) plie casse et
     diacritiques pour comparer une citation (T05-25) ; l'appel #1 part avec la capacité de sortie du modèle et un délai
     qui la suit (T05-26) ; la matière du tour pour l'autorité est documents de la personne + dernière réponse IA, tout ou
     rien dessus (T05-27). Aucune règle, aucun prompt serveur, aucun schéma, aucun transport n'a changé. */
  /* CONTINUITE-04B — L'EMPREINTE A BOUGÉ D'UNE LIGNE DU MOTEUR ARCHITECTE : archNormaliser() plie la ponctuation
     typographique avant de comparer une citation à sa source (voir tests/continuite-api-citation-cont04b.test.mjs).
     Aucune règle, aucun prompt, aucun schéma, aucun transport n'a changé. */
  /* SCHEMA-ANTHROPIC-03 / CONTINUITE-04 — L'EMPREINTE A BOUGÉ, PAR LE TRANSPORT ANTHROPIC SEUL : le schéma
     canonique de l'analyse part désormais comme schéma d'outil (appel forcé, JSON garanti, aucune grammaire
     compilée — la sortie structurée refusait l'analyse complète, « compiled grammar is too large »), la
     réponse est vérifiée contre le canonique complet, avec UNE requête de correction bornée. Ni règle, ni
     prompt, ni schéma canonique, ni plage gelée n'a changé : FROZEN identique. Le runner de bisection de
     grammaire (outil hors produit) a été retiré. */
  /* SCHEMA-ANTHROPIC-02 / MODELE-PAR-DEFAUT-01 — L'EMPREINTE A ENCORE BOUGÉ, ET TOUJOURS POUR LA
     MÊME RAISON MÉCANIQUE : le repli du sélecteur de modèle API, jusqu'ici un index positionnel
     muet vers 'claude-opus-5', devient MODELE_PAR_DEFAUT ('claude-sonnet-5'), annoncé plutôt que
     silencieux quand une actualisation depuis /v1/models fait disparaître le modèle retenu. Aucune
     règle, aucun prompt, aucun schéma, aucun comportement d'interface visible n'a changé. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    'eb9b9f0c81ed0dac95d651832ceeb8e1029c16d0d3979fd4e640bfe524bc2c0f', 'CANONICAL_HTML_CHANGED = NO');
  /* La seule modification du worker est le relevé de usage : cinq champs, aucun branchement. */
  assert.match(WORKER, /event: "groq_usage_observation"/);
  for (const champ of ['jetons_entree', 'jetons_sortie', 'jetons_total',
                       'plafond_sortie_demande', 'finish_reason']) {
    assert.ok(WORKER.includes(champ), `${champ} relevé`);
  }
  assert.equal(/if\s*\(\s*envelope\?\.usage|usage\?\.total_tokens\s*[<>]/.test(WORKER), false,
    'aucune décision ne lit la comptabilité');
  assert.equal(E.instrumentation.comportement_modifie, false);
});
