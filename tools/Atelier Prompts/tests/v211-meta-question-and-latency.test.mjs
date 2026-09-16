/* ATELIER PROMPTS V2.1.1 — LA CLASSE DES QUESTIONS MÉTA, ET LA LATENCE QUI N'EN ÉTAIT PAS UNE.
 * ============================================================================
 *
 * DEUX DÉFAUTS MESURÉS EN BÊTA RÉELLE, ET LEUR MÊME ORIGINE.
 *
 * 1. LA QUESTION MÉTA. Après une première question juste, la personne a reçu « Quel résultat
 *    principal souhaitez-vous obtenir ? ». Cette phrase était, mot pour mot, la valeur de
 *    `SAFE_FALLBACK_QUESTION` — le repli que j'avais écrit pour la frontière d'affichage. Le garde
 *    censé refuser les mauvaises questions en fabriquait donc une. Le défaut n'est pas une phrase :
 *    c'est une CLASSE de questions, celles qui demandent à la personne de concevoir notre sortie.
 *
 * 2. LES TOURS À QUINZE SECONDES. Mesuré sur le runtime déployé, en fixtures techniques : le budget
 *    du fournisseur rapide est de 8 000 jetons par minute, un appel en coûte 1 802, et la descente
 *    est visible — 5995, 4299, 2338, 527, épuisé. Le cinquième appel échoue en 157 ms, sans reprise
 *    (le seuil vaut 0 ms) et sans repli (l'ordre rapide ne contient que Groq). Le client escalade
 *    alors vers le plan profond. Ces tours n'étaient donc pas des tours rapides lents : c'étaient
 *    des tours SANS plan rapide.
 *
 * CE QUE CE FICHIER VÉRIFIE. La classe méta, par fonction et non par liste de mots ; le repli, qui
 * ne peut plus en produire ; et la présence de l'instrumentation qui rend un tour lent attribuable.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isMetaOutputQuestion, questionTargetsOwnOutput, questionAsksConcreteVariable, requestIsAboutItsOwnForm,
  assessSolicitation, guardFastSolicitation, guardDisplayedQuestion, isAtomicQuestion,
  DISPLAY_VERDICTS, SOLICITATION_VERDICTS, SILENT_INTERACTION
} from '../workers/shared/solicitation-policy.js';
import { createTurnSnapshot } from '../workers/shared/fast-interactive-plane.js';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { makeCoreUserMessage } from '../workers/shared/core-first-plane.js';
import { validateAnalystInput } from '../workers/shared/operational-request-core.js';
import { FAST_META_CORRECTION } from '../workers/groq/src/index.js';

const politique = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const endpointFast = fs.readFileSync(new URL('../workers/shared/fast-interaction-endpoint.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');

/* V2.2.1-D2F1 — une candidate porte désormais ce qu'elle INTERROGE. Le garde ne le devine plus
   dans les mots : il lit ce que l'auteur de la question a déclaré. */
const q = (texte, focus = null) => ({ type: 'ASK_CLARIFICATION', text: texte, question_focus: focus });
const SITUATION = 'problem_or_user_context';
const NOTRE_SORTIE = 'output_specification';
const tour = (demande = 'Une demande qui énonce une intention.') =>
  createTurnSnapshot({ turn_id: 2, original_request: demande, clarification_history: [] });

/* La question exacte reçue par le propriétaire, conservée mot pour mot. */
const OWNER_META = 'Quel résultat principal souhaitez-vous obtenir ?';

/* ==========================================================================
 * V211-01 / 02 / 03 — LA CLASSE, PAS LA PHRASE
 * ======================================================================= */

test('V211-01 : une question concrète est autorisée', () => {
  for (const texte of ['Pour quel nombre de jours prévoyez-vous votre séjour ?',
                       'Quel budget approximatif avez-vous prévu ?',
                       'À quelle date cela doit-il être prêt ?',
                       'À qui cela s’adresse-t-il ?',
                       'Quel est l’objectif principal ?',
                       'Combien de personnes seront concernées ?',
                       'Quelle contrainte devez-vous absolument respecter ?']) {
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: SITUATION }), false, `« ${texte} » porte sur le problème`);
    assert.equal(assessSolicitation(q(texte, SITUATION), []), 'ALLOW');
    assert.deepEqual(guardFastSolicitation(q(texte, SITUATION), tour()), q(texte, SITUATION));
  }
});

test('V211-02 : la question reçue par le propriétaire est refusée', () => {
  assert.equal(isMetaOutputQuestion(OWNER_META, { questionFocus: NOTRE_SORTIE }), true);
  assert.equal(assessSolicitation(q(OWNER_META, NOTRE_SORTIE), []), 'META_OUTPUT_QUESTION');
  assert.deepEqual(guardFastSolicitation(q(OWNER_META, NOTRE_SORTIE), tour()), SILENT_INTERACTION);
  assert.ok(SOLICITATION_VERDICTS.includes('META_OUTPUT_QUESTION'));
  /* Et elle était atomique : c'est bien la FONCTION qui la condamne, pas sa forme. */
  assert.equal(isAtomicQuestion(OWNER_META), true, 'atomique, et pourtant inacceptable');
});

test('V211-03 : huit paraphrases différentes sont refusées, sans dépendre d’une chaîne', () => {
  /* Aucune de ces phrases n'est celle du propriétaire. Ce qui les réunit est leur fonction :
     elles demandent à la personne de définir ce que nous devons produire. */
  for (const texte of ['Quel type de résultat attendez-vous ?',
                       'Quel type de contenu souhaitez-vous ?',
                       'Quelle forme doit prendre le rendu ?',
                       'Sous quel format souhaitez-vous la sortie ?',
                       'Qu’attendez-vous comme résultat concret ?',
                       'Quel livrable souhaitez-vous recevoir ?',
                       'Quel type de document voulez-vous obtenir ?',
                       'Quel genre de support souhaitez-vous qu’il vous soit remis ?']) {
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: NOTRE_SORTIE }), true, `« ${texte} » est de la même classe`);
    assert.deepEqual(guardFastSolicitation(q(texte, NOTRE_SORTIE), tour()), SILENT_INTERACTION);
  }
  /* V2.2.1-D2F1 — LA DÉCISION NE CROISE PLUS DEUX SIGNAUX LEXICAUX : ELLE LIT UN FAIT DÉCLARÉ.
     Ce que ce test prouve reste identique — huit formulations sans mot commun imposé, refusées pour
     leur FONCTION — mais la fonction est désormais dite par l'auteur de la question, et non devinée
     par un croisement de vocabulaires. */
  assert.equal(questionTargetsOwnOutput(NOTRE_SORTIE), true);
  assert.equal(questionAsksConcreteVariable(NOTRE_SORTIE), false);
  /* LE CAS MIXTE A CESSÉ D'EXISTER, ET C'EST LE PROGRÈS DU LOT.
     Une question qui nomme une production tout en demandant une date obligeait le garde à arbitrer
     entre deux vocabulaires qui se déclenchaient ensemble. Ce n'était pas un arbitrage : c'était un
     aveu qu'il ne savait pas ce que la question demandait. Aujourd'hui, l'auteur le dit — une
     question interroge UNE chose, et le champ ne peut porter qu'une valeur. */
  const mixte = 'Quel format souhaitez-vous pour le 15 mars ?';
  assert.equal(isMetaOutputQuestion(mixte, { questionFocus: SITUATION }), false, 'déclarée sur la situation : pas méta');
  assert.equal(isMetaOutputQuestion(mixte, { questionFocus: NOTRE_SORTIE }), true, 'déclarée sur notre sortie : méta');
  /* Et sans fait déclaré, on échoue FERMÉ : le garde n'accuse jamais sur une supposition. */
  assert.equal(isMetaOutputQuestion(mixte), false, 'aucun fait, aucune accusation');
});

/* ==========================================================================
 * V211-04 — L'EXCEPTION : QUAND LA FORME EST LE SUJET
 * ======================================================================= */

test('V211-04 : si la demande porte sur la forme, la question sur la forme reste autorisée', () => {
  /* V2.2.1-D2D — L'EXCEPTION SUBSISTE, SA SOURCE A CHANGÉ.
   *
   * Ce test tenait l'exemption pour acquise dès que la demande contenait « format » ou « document ».
   * Mesuré en D2C : la demande du propriétaire — « j'ai besoin d'un document pour ma réunion » —
   * était exemptée par EXACTEMENT la même règle, alors qu'elle attend une production. Une seule
   * règle, deux objectifs opposés : elle ne pouvait pas être juste pour les deux.
   *
   * C'est désormais l'autorité sémantique qui énonce la nature de l'objectif, et le garde qui la
   * lit. L'exception demeure donc — et elle vaut maintenant pour la bonne raison. */
  const demandeSurLaForme = 'Je veux convertir ce texte dans un autre format de document.';
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'transformation' }), true);
  assert.equal(isMetaOutputQuestion('Sous quel format souhaitez-vous la sortie ?', { objectiveNature: 'transformation', questionFocus: NOTRE_SORTIE }), false);
  /* Et la même question redevient méta quand l'objectif n'est pas une mise en forme. */
  assert.equal(isMetaOutputQuestion('Sous quel format souhaitez-vous la sortie ?', { objectiveNature: null, questionFocus: NOTRE_SORTIE }), true);
  /* La frontière d’affichage applique la même exception, avec le même fait. */
  assert.equal(guardDisplayedQuestion('Sous quel format souhaitez-vous la sortie ?',
    { objectiveNature: 'transformation', questionFocus: NOTRE_SORTIE }).verdict, 'ALLOW');
  /* Le plan rapide, lui, ne transporte pas ce fait : il échoue FERMÉ, donc il se tait et laisse le
     plan profond trancher. C'est le prix assumé de ne pas toucher au contrat rapide. */
  assert.equal(assessSolicitation(q('Sous quel format souhaitez-vous la sortie ?', NOTRE_SORTIE), [], false, demandeSurLaForme),
    'META_OUTPUT_QUESTION');
});

/* ==========================================================================
 * V211-05 — LE REFUS NE COÛTE PAS UN TOUR PROFOND
 * ======================================================================= */

test('V211-05 : une question méta déclenche un second essai rapide, jamais le Core', () => {
  /* Rendre le silence renverrait le tour au plan profond : environ quinze secondes. Le rattrapage
     est donc un SECOND APPEL RAPIDE, borné à un essai, et il ne touche à aucun rôle profond. */
  /* Le rattrapage vit APRÈS la chaîne de fournisseurs, jamais dedans : le chemin fournisseur doit
     rester technique — invariant du lot PERF-REAL-01F, que ma première version violait. */
  /* V2.1.2 — le rattrapage ne concerne plus la seule question méta : tout refus corrigible en ouvre
     un, parce que rendre le silence coûtait un tour profond entier. La question méta en reste le
     premier cas, et sa correction est inchangée. */
  assert.match(worker, /META_OUTPUT_QUESTION: FAST_META_CORRECTION/);
  assert.match(worker, /if \(!correction\) return rendu;/);
  assert.match(worker, /event: "fast_question_retry"/);
  assert.match(worker, /FAST_INTERACTION_ADAPTERS\[name\]\(snapshot, env, \{ corrective: correction \}\)/,
    'la correction envoyée est celle du motif de refus, la méta comprise');
  assert.match(worker, /const rendu = await runProviderChain\(\{ role: "fast_interaction"/);
  assert.match(worker, /const final = await rattraperQuestionRefusee\(rendu, snapshot, env, order, log, refus\);/);
  /* Un seul rattrapage : le second verdict est rendu tel quel, sans troisième essai. */
  const bloc = worker.slice(worker.indexOf('async function rattraperQuestionRefusee'),
    worker.indexOf('async function rattraperQuestionRefusee') + 1800);
  assert.equal((bloc.match(/FAST_INTERACTION_ADAPTERS\[name\]\(snapshot, env/g) || []).length, 1,
    'un seul second essai');
  /* Et aucun rôle profond n’est nommé sur ce chemin. */
  for (const profond of ['runCoreFirstTurn', 'core_critic', 'core_arbiter', 'operational-request']) {
    assert.equal(bloc.includes(profond), false, `${profond} n’apparaît pas dans le rattrapage`);
  }
  /* La correction rappelle la règle sans proposer de question, et ne nomme aucun domaine. */
  assert.match(FAST_META_CORRECTION, /une variable du problème/);
  for (const domaine of ['voyage', 'lisbonne', 'cv', 'réunion', 'déménagement', 'présentation']) {
    assert.equal(new RegExp(`\\b${domaine}`, 'i').test(FAST_META_CORRECTION), false);
  }
});

/* ==========================================================================
 * V211-06 — UN TOUR ORDINAIRE NE PAIE AUCUN RÔLE PROFOND
 * ======================================================================= */

test('V211-06 : un tour de clarification déclare zéro appel profond', () => {
  assert.match(endpointFast, /core_calls: 0, critic_calls: 0, arbiter_calls: 0/);
  const codeFast = endpointFast.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  assert.equal(/executeRole|runCoreFirstTurn/.test(codeFast), false);
});

/* ==========================================================================
 * V211-07 — POURQUOI UN TOUR A ÉTÉ LENT DOIT ÊTRE LISIBLE
 * ======================================================================= */

test('V211-07 : l’indisponibilité du plan rapide est instrumentée, cause et conséquence', () => {
  assert.match(endpointFast, /event: "fast_unavailable"/);
  for (const champ of ['provider_attempts', 'all_providers_failed', 'rate_limited', 'retry_count',
                       'retry_after_ms', 'wait_too_long', 'error_kind', 'fallback_provider']) {
    assert.match(endpointFast, new RegExp(champ), `${champ} est relevé`);
  }
  assert.match(endpointFast, /LE CLIENT ESCALADE VERS LE PLAN PROFOND/,
    'la conséquence est nommée : c’est elle qui explique les quinze secondes');
  /* Le tour nominal, lui, relève déjà sa durée et son coût. */
  assert.match(endpointFast, /event: "clarification_turn_cost"/);
  for (const champ of ['fast_duration_ms', 'clarification_turn_duration_ms', 'provider_calls', 'fast_calls']) {
    assert.match(endpointFast, new RegExp(champ));
  }
  /* Et le fournisseur relève déjà reprises, attente de débit et latence réelle. */
  assert.match(worker, /rate_limited_wait_ms/);
  assert.match(worker, /pacer_wait_ms/);
  assert.match(worker, /provider_latency_ms/);
  assert.match(worker, /declared_remaining_tokens/);
});

/* ==========================================================================
 * V211-08 — CE QUE LA PERSONNE A DIT ARRIVE AU CORE
 * ======================================================================= */

test('V211-08 : une information donnée en dialogue reste accessible au Core final', () => {
  /* La réponse exacte du owner-test, dont il demandait à vérifier la survie. */
  const REPONSE = 'visiter des lieux typiques et gastronomie locale';
  const entree = validateAnalystInput({
    original_request: 'Je veux préparer un déplacement au printemps.',
    clarification_history: [
      { turn: 1, question: 'Pour quel nombre de jours prévoyez-vous votre séjour ?', answer: '4 jours', provenance: 'user' },
      { turn: 2, question: 'Qu’est-ce qui compte le plus pour vous ?', answer: REPONSE, provenance: 'user' },
      { turn: 3, question: 'Quel budget approximatif avez-vous prévu ?', answer: '1000 euros pour deux', provenance: 'user' }
    ]
  });
  /* 1. La validation d’entrée ne tronque rien. */
  assert.equal(entree.clarification_history.length, 3);
  assert.equal(entree.clarification_history[1].answer, REPONSE);
  /* 2. Le message réellement envoyé au Core la contient, verbatim. */
  const message = makeCoreUserMessage(entree);
  assert.ok(message.includes(REPONSE), 'la réponse voyage jusqu’au Core');
  const objet = JSON.parse(message);
  assert.equal(objet.clarification_history.length, 3, 'tous les tours, pas seulement le dernier');
  /* 3. Le candidat canonique possède les champs qui l’accueillent SANS en faire une obligation :
     une préférence n’est pas une contrainte, et la transformer en obligation serait une invention. */
  const accueil = ['secondary_objectives', 'confirmed_preferences', 'confirmed_priorities'];
  const schema = JSON.parse(fs.readFileSync(new URL('../anti-regression-baseline.json', import.meta.url), 'utf8'));
  assert.ok(schema, 'la base de référence existe');
  const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
  const mapping = fs.readFileSync(new URL('../core/adn/oprie-canonical-mapping.js', import.meta.url), 'utf8');
  for (const champ of accueil) {
    assert.match(mapping, new RegExp(champ), `${champ} est projeté dans le contrat canonique`);
  }
  assert.match(mapping, /preferences: strings\(candidate\.confirmed_preferences\)/,
    'les préférences confirmées deviennent les préférences canoniques');
  assert.match(html, /secondary_objectives/, 'et le produit les consomme');
});

/* ==========================================================================
 * LE REPLI — CE QUI A CAUSÉ LE DÉFAUT NE PEUT PLUS LE CAUSER
 * ======================================================================= */

test('V211-09 : la frontière n’a plus de repli du tout — elle ne peut donc plus rien fabriquer', () => {
  /* CE LOT-CI avait REMPLACÉ la question de repli parce qu'elle était elle-même méta. V2.2.1-D2
     FINAL la SUPPRIME : un garde de forme qui écrit une question est l'auteur de ce qui est demandé.
     Le défaut d'origine est donc fermé par une raison plus forte que la précédente — il n'y a plus
     aucun texte à juger. */
  assert.equal(DISPLAY_VERDICTS.includes('FALLBACK_SAFE'), false, 'l’issue qui fabriquait a disparu');
  assert.equal(DISPLAY_VERDICTS.includes('NOT_DISPLAYABLE'), true, 'la frontière constate au lieu d’écrire');
  const codePolitique = politique.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  assert.equal(codePolitique.includes('SAFE_FALLBACK_QUESTION'), false, 'la constante a quitté le module');
  assert.equal(codePolitique.includes('Quel résultat principal souhaitez-vous obtenir'), false,
    'l’ancienne valeur a disparu du code — le commentaire, lui, garde la trace du défaut');
  /* Une réduction qui aboutirait à une question méta est refusée : le défaut ne peut pas se déplacer
     d’un cran. Le catalogue observé se réduisait en « Quel type de résultat… ? » — méta. */
  const catalogueObserve = 'Quel type de résultat vous serait le plus utile : un plan jour par jour, '
    + 'une sélection de recommandations, une liste de contrôle, ou autre chose ?';
  const garde = guardDisplayedQuestion(catalogueObserve, { questionFocus: NOTRE_SORTIE });
  assert.equal(garde.verdict, 'NOT_DISPLAYABLE');
  assert.equal(garde.text, null, 'aucun texte fabriqué par la frontière');
  /* Et une candidate concrète du même tour est toujours préférée au repli. */
  const avecCandidate = guardDisplayedQuestion(catalogueObserve,
    { candidates: [{ text: 'Combien de jours prévoyez-vous de rester ?' }] });
  assert.equal(avecCandidate.verdict, 'REPLACED');
  assert.equal(avecCandidate.text, 'Combien de jours prévoyez-vous de rester ?');
});

test('V211-10 : la frontière reçoit la demande, donc l’exception vaut aussi pour le plan profond', () => {
  const orchestrateur = fs.readFileSync(new URL('../workers/shared/operational-request-orchestrator.js', import.meta.url), 'utf8');
  /* V2.2.1-D2D — la frontière reçoit aussi la nature de l'objectif, portée par le tour. */
  assert.match(orchestrateur, /questionFocus: question && question\.question_focus/);
  const tourProfond = Object.freeze({
    state: 'clarification_required',
    next_question: Object.freeze({ text: 'Sous quel format souhaitez-vous la sortie ?', targets_issue_id: 'I1', expected_progress: 'x', question_focus: 'output_specification' }),
    operational_request_candidate: Object.freeze({ a: 1 }), issues: Object.freeze([]), reason: 'r'
  });
  /* Objectif de mise en forme, dit par l'autorité : la question passe. V2.2.1-D2D — ce n'est plus
     la demande qui porte l'exemption, c'est le tour. */
  const passe = applyDisplayGuardToTurn({ ...tourProfond, objective_nature: 'transformation' },
    { question_candidates: [] }, () => {});
  assert.equal(passe.next_question.text, 'Sous quel format souhaitez-vous la sortie ?');
  /* TRACER-REMEDIATION-02 · F2 — le REFUS est inchangé ; ce qu'il produit ne l'est plus. La
     frontière rendait un tour réclamant une clarification sans la poser ; elle déclare désormais la
     sortie contractuellement inexploitable. L'état n'est toujours pas touché : elle ne décide
     aucune readiness, elle constate qu'il n'y a rien à montrer. */
  /* Demande qui n’en parle pas, et aucune candidate de rechange : la sortie est inexploitable. */
  assert.throws(() => applyDisplayGuardToTurn(tourProfond, { question_candidates: [] }, () => {}),
    (e) => e.code === 'turn_contractually_unusable');
  /* Avec une candidate affichable, en revanche, c'est elle qui est montrée. */
  const remplace = applyDisplayGuardToTurn(tourProfond,
    { question_candidates: [{ text: 'Combien de jours prévoyez-vous ?', question_focus: 'problem_or_user_context' }] }, () => {});
  assert.equal(remplace.next_question.text, 'Combien de jours prévoyez-vous ?');
  assert.equal(isMetaOutputQuestion(remplace.next_question.text), false);
  assert.equal(remplace.state, 'clarification_required', 'la readiness reste celle d’OPRIE');
});

/* ==========================================================================
 * AUCUN DOMAINE, NULLE PART
 * ======================================================================= */

test('V211-11 : le garde méta ne connaît aucun domaine', () => {
  const code = politique.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  for (const domaine of ['voyage', 'lisbonne', 'itinéraire', 'checklist', 'gastronomie', 'restaurant',
                         'cv', 'poste', 'déménagement', 'réunion', 'santé', 'code', 'langage']) {
    assert.equal(new RegExp(`\\b${domaine}`, 'i').test(code), false, `« ${domaine} » interdit dans le garde`);
  }
  /* Les familles employées sont des mots de discours, et le test le prouve en les faisant traiter
     trois sujets que rien ne relie. */
  for (const texte of ['Quel type de résultat attendez-vous ?',
                       'Quel format de rendu souhaitez-vous obtenir ?',
                       'Quelle forme doit prendre le livrable ?']) {
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: NOTRE_SORTIE }), true);
  }
  /* Le second signal ne lit plus des marqueurs interrogatifs : il lit ce que l'auteur a déclaré. */
  assert.equal(questionAsksConcreteVariable(SITUATION), true);
  assert.equal(questionAsksConcreteVariable(NOTRE_SORTIE), false);
  assert.equal(questionAsksConcreteVariable('other'), false);
  /* Et le garde n'emploie plus AUCUN nom de situation — ni budget, ni public, ni ton. Une première
     version en portait ; le vocabulaire décisionnel a désormais entièrement quitté ce module. */
  const codeGarde = politique.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  for (const nom of ['budget', 'public', 'objectif', 'délai', 'durée', 'priorité']) {
    assert.equal(new RegExp(`\\b${nom}`, 'i').test(codeGarde), false, `« ${nom} » n’est pas dans le garde`);
  }
});
