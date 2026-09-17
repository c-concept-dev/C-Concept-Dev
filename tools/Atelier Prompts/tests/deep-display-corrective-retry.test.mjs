/* DEEP-DISPLAY-RETRY — UNE SECONDE CHANCE, INFORMÉE, ET UNE SEULE.
 * ============================================================================
 *
 * CE QUE LA PRODUCTION A MONTRÉ. Le 17/09 à 21:17:22 puis 21:17:53, le plan profond a produit une
 * question visant `sujet_presentation`, refusée par la frontière d'affichage, avec une candidate
 * elle-même non affichable. Deux appels profonds — 22,6 s puis 24,4 s — pour deux échecs. Au
 * troisième essai, la même autorité a rendu une formulation acceptée : `ALLOW`, `changed = false`.
 *
 * Le manque était LÉGITIME du premier au dernier essai. Seule la FORME était fautive.
 *
 * L'ASYMÉTRIE QUI EN ÉTAIT LA CAUSE. Le plan rapide reçoit depuis BETA-04 un verdict NOMMÉ
 * (`MULTIPLE_QUESTIONS`, `CATALOGUE`, …) et une correction associée, puis rejoue une fois. Le plan
 * profond ne recevait rien : la frontière évaluait ses trois prédicats dans une seule expression
 * booléenne et n'en sortait qu'un `NOT_DISPLAYABLE` binaire. Chaque nouvel appel repartait aveugle,
 * et la réussite ne venait que de la variation du modèle.
 *
 * CE QUE CE FICHIER ÉPROUVE. Que la cause est exposée sans qu'aucune règle d'affichabilité change ;
 * qu'une reprise informée a lieu EXACTEMENT une fois ; que rien ne se relance tout seul ; et que
 * les chemins qui fonctionnaient — question affichable, candidate substituée — ne paient rien.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { guardDisplayedQuestion, SOLICITATION_VERDICTS } from '../workers/shared/solicitation-policy.js';
import { DEEP_DISPLAY_CORRECTIONS, coreSystemPromptWithCorrection, CORE_SYSTEM_PROMPT } from '../workers/shared/core-first-plane.js';
import { handleOperationalRequest } from '../workers/shared/operational-request-orchestrator.js';

/* Découper sur une ancre devinée est une erreur que ce fichier a déjà commise : `const t = String(...)`
   apparaît trois fois dans la politique, et la première occurrence est à 450 lignes du garde. Le corps
   d'une fonction se MESURE — de sa déclaration jusqu'à l'export suivant — il ne s'estime pas. */
const corpsDeFonction = (source, declaration) => {
  const debut = source.indexOf(declaration);
  assert.notEqual(debut, -1, `déclaration introuvable : ${declaration}`);
  const suite = [...source.slice(debut + declaration.length).matchAll(/\n(?:export )?(?:async )?function |\nexport const /g)]
    .map((m) => debut + declaration.length + m.index);
  return source.slice(debut, suite.length ? suite[0] : source.length);
};

const politique = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const orchestrateur = fs.readFileSync(new URL('../workers/shared/operational-request-orchestrator.js', import.meta.url), 'utf8');
const artefact = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');

/* ==========================================================================
 * LA CAUSE EST EXPOSÉE, LES RÈGLES NE CHANGENT PAS
 * ======================================================================= */

test('T-DDR-01 : la cause du refus est nommée, et son vocabulaire est celui qui existait déjà', () => {
  const cas = [
    ['', 'EMPTY'],
    ['Quel est le premier paramètre et le second ?', 'MULTIPLE_QUESTIONS'],
    ['Quel type : un plan, une liste, une note, ou autre chose ?', 'CATALOGUE']
  ];
  for (const [texte, attendue] of cas) {
    const garde = guardDisplayedQuestion(texte, {});
    assert.equal(garde.verdict, 'NOT_DISPLAYABLE', `« ${texte.slice(0, 30)} » reste refusée`);
    assert.equal(garde.reason, attendue, `cause nommée : ${attendue}`);
  }
  const meta = guardDisplayedQuestion('Quel format souhaitez-vous pour le résultat ?', { questionFocus: 'output_specification' });
  assert.equal(meta.reason, 'META_OUTPUT_QUESTION');
  const histo = [{ turn: 1, question: 'Quelle donnée ?', answer: 'r', provenance: 'user', missing_determinant_id: 'manque_a' }];
  const repete = guardDisplayedQuestion('Autrement formulée ?', { history: histo, missingDeterminantId: 'manque_a' });
  assert.equal(repete.reason, 'ALREADY_ANSWERED');

  /* AUCUN VOCABULAIRE NOUVEAU : les cinq causes appartiennent à l'énumération de sollicitation. */
  for (const cause of ['EMPTY', 'MULTIPLE_QUESTIONS', 'CATALOGUE', 'META_OUTPUT_QUESTION', 'ALREADY_ANSWERED']) {
    assert.ok(SOLICITATION_VERDICTS.includes(cause), `${cause} existait déjà`);
  }
});

test('T-DDR-02 : aucune règle d’affichabilité n’a changé — affichable s’exprime PAR la cause', () => {
  /* LA GARANTIE EST STRUCTURELLE, PAS DÉCLARATIVE. `affichable()` ne réimplémente aucun prédicat :
     il délègue à `cause()`. Une divergence entre « pourquoi c'est refusé » et « c'est refusé » est
     donc impossible à écrire, et ce test le vérifie sur les octets plutôt que sur une promesse. */
  const garde = corpsDeFonction(politique, 'export function guardDisplayedQuestion');
  assert.match(garde, /const affichable = \(q, focus, id\) => cause\(q, focus, id\) === null;/);

  /* Chaque prédicat n'est appelé QU'UNE fois dans tout le garde : il n'existe pas de seconde
     implémentation de l'affichabilité qui pourrait dériver de la première. */
  for (const predicat of ['isAtomicQuestion(q)', 'isMetaOutputQuestion(q,', 'isRepeatedSolicitation(q,']) {
    assert.equal(garde.split(predicat).length - 1, 1, `${predicat} n’apparaît qu’une fois`);
  }
  /* Et leur ORDRE est celui d'avant ce lot : atomicité, puis méta-sortie, puis répétition. Le
     court-circuit fait partie du sens — une question qui pose deux besoins n'est pas jugée sur sa
     méta-nature, et c'est la première cause qui est nommée. */
  const iAtom = garde.indexOf('isAtomicQuestion(q)');
  const iMeta = garde.indexOf('isMetaOutputQuestion(q,');
  const iRep = garde.indexOf('isRepeatedSolicitation(q,');
  assert.ok(iAtom < iMeta && iMeta < iRep, 'l’ordre des prédicats est inchangé');

  /* La preuve par le comportement, pas seulement par la forme : une question qui viole DEUX règles
     est nommée par la PREMIÈRE, et reste refusée comme avant. */
  const double = guardDisplayedQuestion('Quel format voulez-vous et quelle longueur ?', { questionFocus: 'output_specification' });
  assert.equal(double.verdict, 'NOT_DISPLAYABLE');
  assert.equal(double.reason, 'MULTIPLE_QUESTIONS', 'la première règle enfreinte est celle qui nomme');
});

test('T-DDR-03 : un ALLOW et un REPLACED ne portent aucune cause — il n’y a rien à corriger', () => {
  const ok = guardDisplayedQuestion('Quelle est la donnée manquante ?', {});
  assert.equal(ok.verdict, 'ALLOW');
  assert.equal('reason' in ok, false, 'une question affichable n’a pas de cause de refus');
  const remplacee = guardDisplayedQuestion('Quel est le premier paramètre et le second ?', {
    candidates: [{ text: 'Quelle est la donnée manquante ?', question_focus: 'problem_or_user_context', missing_determinant_id: 'manque_b' }]
  });
  assert.equal(remplacee.verdict, 'REPLACED');
  assert.equal('reason' in remplacee, false, 'une candidate a sauvé le tour : aucune reprise à déclencher');
});

/* ==========================================================================
 * LES CORRECTIONS : UN CONSTAT DE FORME, JAMAIS UNE RÈGLE MÉTIER
 * ======================================================================= */

test('T-DDR-04 : chaque cause a sa correction, et aucune ne dicte un contenu', () => {
  assert.deepEqual(Object.keys(DEEP_DISPLAY_CORRECTIONS).sort(),
    ['ALREADY_ANSWERED', 'CATALOGUE', 'EMPTY', 'META_OUTPUT_QUESTION', 'MULTIPLE_QUESTIONS']);
  for (const [cause, texte] of Object.entries(DEEP_DISPLAY_CORRECTIONS)) {
    assert.match(texte, /N'A PAS ÉTÉ MONTRÉE À LA PERSONNE/, `${cause} énonce le constat`);
    /* Aucun vocabulaire de domaine, aucun exemple : ce sont des constats de forme. */
    for (const domaine of ['budget', 'date', 'présentation', 'projet', 'réunion', 'prix', 'ville', 'sauvegarde']) {
      assert.equal(new RegExp(`\\b${domaine}`, 'i').test(texte), false, `${cause} : « ${domaine} » interdit`);
    }
  }
  /* QUATRE corrections conservent le manque, UNE seule autorise d'en changer — et c'est la seule
     où le manque lui-même est acquis. */
  for (const cause of ['MULTIPLE_QUESTIONS', 'CATALOGUE', 'EMPTY']) {
    assert.match(DEEP_DISPLAY_CORRECTIONS[cause], /Reprenez le MÊME manque/, `${cause} ne change pas de manque`);
  }
  assert.match(DEEP_DISPLAY_CORRECTIONS.ALREADY_ANSWERED, /Tenez-le pour acquis/);
});

test('T-DDR-05 : la consigne corrigée AJOUTE, ne retire rien, et reste inchangée sans constat', () => {
  const base = CORE_SYSTEM_PROMPT;
  assert.equal(coreSystemPromptWithCorrection(null), base, 'sans cause : identique à l’octet près');
  assert.equal(coreSystemPromptWithCorrection('CAUSE_INCONNUE'), base, 'cause inconnue : identique');
  const corrigee = coreSystemPromptWithCorrection('MULTIPLE_QUESTIONS', 'manque_x');
  assert.ok(corrigee.startsWith(base), 'la doctrine entière est conservée en tête');
  assert.ok(corrigee.length > base.length);
  assert.match(corrigee, /manque_x/, 'l’identité du manque est rappelée quand elle existe');
  /* Sans identité, rien n'est fabriqué. */
  assert.equal(coreSystemPromptWithCorrection('MULTIPLE_QUESTIONS').includes('Le manque visé était nommé'), false);
  assert.equal(coreSystemPromptWithCorrection('MULTIPLE_QUESTIONS', '   ').includes('Le manque visé était nommé'), false);
});

/* ==========================================================================
 * LA REPRISE : EXACTEMENT UNE, ET RIEN NE SE RELANCE SEUL
 * ======================================================================= */

test('T-DDR-06 : la reprise est unique par construction, sans compteur', () => {
  const bloc = corpsDeFonction(orchestrateur, 'async function runCoreFirstTurnForRequest');
  /* UN seul appel correctif dans toute la fonction. */
  assert.equal(bloc.split('corrective: constat').length - 1, 1, 'un seul appel correctif');
  /* AUCUNE BOUCLE. C'est là qu'est la borne : elle n'est pas comptée, elle est absente du graphe
     de contrôle. Un maximum de 1 qu'on ne peut pas dépasser vaut mieux qu'un maximum de 1 vérifié. */
  for (const boucle of ['while', 'for (', 'do {']) {
    assert.equal(bloc.includes(boucle), false, `aucune boucle (« ${boucle} »)`);
  }
  /* AUCUN COMPTEUR : ni variable d'essais, ni incrément, ni plafond nommé. */
  for (const compteur of ['attempts', 'tentatives', 'MAX_RETRY', 'retryCount', '++']) {
    assert.equal(bloc.includes(compteur), false, `aucun compteur (« ${compteur} »)`);
  }
  /* La reprise n'a lieu QUE sur un refus portant une cause nommée : un échec sans cause — une panne
     fournisseur, une erreur de transport — ressort tel quel, sans second appel. */
  assert.match(bloc, /if \(!constat \|\| !constat\.reason\) throw refus;/);
  /* Et le second refus est relevé puis relancé : rien n'est fabriqué pour avoir quelque chose à rendre. */
  assert.match(bloc, /throw secondRefus;/);
  /* La reprise repart de la MÊME entrée : elle ne reformule pas la demande, elle informe la consigne. */
  assert.match(bloc, /runCoreFirstTurn\(input, \{ executeRole, log, corrective: constat \}\)/);
});

test('T-DDR-07 : le refus transporte sa cause jusqu’au point de reprise, sans changer la réponse HTTP', () => {
  const garde = orchestrateur.slice(orchestrateur.indexOf('event: "turn_contractually_unusable"'),
    orchestrateur.indexOf('if (garde.text === texte) return turn;'));
  /* Le statut, le code et le message HTTP sont inchangés. */
  assert.match(garde, /new DecisionHttpError\(502, "turn_contractually_unusable"/);
  assert.match(garde, /aucune des questions produites n'est affichable/);
  /* La cause voyage sur l'erreur, pas dans la réponse. */
  assert.match(garde, /display_refusal: \{/);
  assert.match(garde, /event: "DEEP_DISPLAY_REJECTED"/);
});

test('T-DDR-08 : l’observabilité nomme les quatre moments, sans aucun texte', () => {
  for (const evenement of ['DEEP_DISPLAY_REJECTED', 'DEEP_CORRECTIVE_RETRY',
                           'DEEP_CORRECTIVE_RETRY_RESULT', 'DEEP_CORRECTIVE_RETRY_EXHAUSTED']) {
    assert.ok(orchestrateur.includes(`event: "${evenement}"`), `${evenement} est journalisé`);
  }
  const releves = orchestrateur.slice(orchestrateur.indexOf('event: "DEEP_CORRECTIVE_RETRY"'),
    orchestrateur.indexOf('event: "DEEP_CORRECTIVE_RETRY"') + 1600);
  for (const interdit of ['question.text', 'garde.text', 'original_request', '.answer']) {
    assert.equal(releves.includes(interdit), false, `« ${interdit} » n’a rien à faire dans un relevé`);
  }
  /* Les deux issues possibles sont nommées, et elles seules. */
  assert.match(releves, /result: "DISPLAYABLE"/);
  assert.match(releves, /result: "EXHAUSTED"/);
});

/* ==========================================================================
 * LA BORNE DU TOUR : HUMAINE, ET ELLE EXISTAIT DÉJÀ
 * ======================================================================= */

test('T-DDR-09 : aucune relance automatique n’a été créée, et le message d’échec distingue les deux cas', () => {
  /* L'AUDIT AVAIT RÉFUTÉ LA PRÉMISSE D'UNE BOUCLE MACHINE : la reprise du tour exige un clic.
     Ce test garde cette propriété, parce que c'est elle qui rend un compteur inutile. */
  assert.match(artefact, /oprieState\.retryTurn=true;/);
  assert.match(artefact, /Réessayer l’analyse/);
  const reprise = artefact.slice(artefact.indexOf('function answerQuestion(answer){'),
    artefact.indexOf('function answerQuestion(answer){') + 900);
  assert.match(reprise, /if\(oprieState\.retryTurn&&!oprieState\.running\)/,
    'la reprise reste conditionnée à un état armé par l’affichage de l’échec');

  /* Le code du contrat est retenu, et il colore le message — sans jamais être montré. */
  assert.match(artefact, /oprie_failure_code/);
  assert.match(artefact, /oprieState\.lastFailureCode==='turn_contractually_unusable'/);
  const message = artefact.slice(artefact.indexOf("oprieState.lastFailureCode==='turn_contractually_unusable'"),
    artefact.indexOf("oprieState.lastFailureCode==='turn_contractually_unusable'") + 500);
  assert.match(message, /n’a pas pu être formulée correctement/);
  assert.match(message, /précisez votre demande initiale/, 'le message est actionnable');
  /* AUCUN code technique n'atteint l'écran. */
  for (const code of ['MULTIPLE_QUESTIONS', 'META_OUTPUT_QUESTION', 'CATALOGUE', 'ALREADY_ANSWERED', 'turn_contractually_unusable']) {
    assert.equal(message.split("? '")[1]?.includes(code), false, `« ${code} » n’est pas montré à la personne`);
  }
  /* Et un code d'échec ne survit pas au tour suivant. */
  const ouverture = artefact.slice(artefact.indexOf('function oprieOpenTurn(){'),
    artefact.indexOf('function oprieOpenTurn(){') + 400);
  assert.match(ouverture, /oprieState\.lastFailureCode=null;/);
});

/* ==========================================================================
 * LE COMPORTEMENT, PAR LA VRAIE PORTE RÉSEAU
 * --------------------------------------------------------------------------
 * Ce qui précède lit des octets ; ce qui suit EXÉCUTE. `runCoreFirstTurnForRequest` n'est pas
 * exportée — et n'a pas à l'être : on l'atteint comme la production l'atteint, par
 * `handleOperationalRequest`, avec un exécuteur de rôle en fixture. Aucun appel fournisseur.
 * Ce que chaque test mesure est le NOMBRE d'appels profonds et ce qu'ils ont reçu.
 * ======================================================================= */

const ORIGINE = 'https://atelier.example';
const ENV = { ALLOWED_ORIGINS: ORIGINE };

const CANDIDAT_VIDE = {
  objective: 'Préparer la demande.', expected_deliverable: 'Un document structuré.',
  secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
  confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [],
  assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
};
const MANQUE = { id: 'I2', type: 'missing_information', kind: null,
  description: 'Une donnée déterminante manque.', impact: 'material', substitutable: false,
  recommended_treatment: 'question' };

/** Une sortie du contractualisateur, valide au regard de son propre validateur. */
const sortieCore = ({ state = 'clarification_required', question = null, id = null, candidates = [] } = {}) => ({
  state,
  operational_request_candidate: { ...CANDIDAT_VIDE },
  issues: [MANQUE],
  next_question: question
    ? { text: question, targets_issue_id: 'I2', expected_progress: 'Débloque la suite.', ...(id ? { missing_determinant_id: id } : {}) }
    : { text: null, targets_issue_id: null, expected_progress: null },
  confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'Raison du tour.',
  question_candidates: candidates,
  escalation: { needed: false, kind: null, reason: null }
});

const ATOMIQUE = 'Combien de jours partez-vous ?';
const MULTIPLE = 'Quel est le premier paramètre et le second ?';
const DEMANDE = { original_request: 'Je veux préparer un document.', clarification_history: [] };

/** Un tour complet par la porte réseau. `reponses` est consommée dans l'ordre des appels au Core. */
async function tourReel(reponses, charge = DEMANDE) {
  const appels = [];
  const journal = [];
  const executeRole = async (role, _input, options) => {
    appels.push({ role, corrective: (options && options.corrective) || null });
    const rang = appels.filter((a) => a.role === role).length - 1;
    const reponse = rang < reponses.length ? reponses[rang] : reponses[reponses.length - 1];
    if (reponse instanceof Error) throw reponse;
    return reponse;
  };
  const requete = new Request('https://worker.example/operational-request', {
    method: 'POST', headers: { Origin: ORIGINE, 'Content-Type': 'application/json' }, body: JSON.stringify(charge)
  });
  const reponse = await handleOperationalRequest(requete, ENV, { executeRole, log: (e) => journal.push(e) });
  return { status: reponse.status, corps: await reponse.json(), appels, journal,
    releves: (nom) => journal.filter((e) => e.event === nom) };
}

test('T-DDR-10 : une question affichable ne coûte RIEN — un seul appel, aucune reprise', async () => {
  const { status, corps, appels, journal } = await tourReel([sortieCore({ question: ATOMIQUE })]);
  assert.equal(status, 200);
  assert.equal(corps.next_question.text, ATOMIQUE, 'la question de l’autorité part telle quelle');
  assert.equal(appels.length, 1, 'un appel profond, et un seul');
  assert.equal(appels[0].corrective, null, 'rien à corriger : aucune consigne corrective');
  assert.equal(journal.some((e) => /^DEEP_/.test(e.event)), false, 'le chemin nominal ne relève rien de neuf');
});

test('T-DDR-11 : une candidate affichable sauve le tour SANS reprise — REPLACED est inchangé', async () => {
  /* LE POINT COÛTEUX. Une reprise ici doublerait le coût d'un chemin qui fonctionnait déjà : le
     système avait produit la forme atomique, il affichait l'autre. La reprise ne s'ouvre qu'après
     l'épuisement de ce que l'autorité a déjà écrit. */
  const { status, corps, appels, releves } = await tourReel([sortieCore({ question: MULTIPLE, id: 'duree',
    candidates: [{ text: ATOMIQUE, question_focus: 'problem_or_user_context', missing_determinant_id: 'duree',
      targets_issue_id: 'I2', expected_progress: 'Débloque la suite.' }] })]);
  assert.equal(status, 200);
  assert.equal(corps.next_question.text, ATOMIQUE, 'la candidate est affichée');
  assert.equal(corps.next_question.missing_determinant_id, 'duree', 'et c’est SON identité qui l’accompagne');
  assert.equal(appels.length, 1, 'aucun appel supplémentaire');
  assert.equal(releves('displayed_question_guard')[0].verdict, 'REPLACED');
  assert.equal(releves('DEEP_CORRECTIVE_RETRY').length, 0, 'aucune reprise sur un REPLACED');
});

test('T-DDR-12 : tout refusé → EXACTEMENT une reprise, informée de la cause et du manque', async () => {
  const { status, corps, appels, releves } = await tourReel([
    sortieCore({ question: MULTIPLE, id: 'duree' }),
    sortieCore({ question: ATOMIQUE, id: 'duree' })
  ]);
  assert.equal(appels.length, 2, 'exactement deux appels profonds : le refus, puis la reprise');
  assert.equal(appels[0].corrective, null, 'le premier appel est aveugle, comme avant');
  /* CE QUI COMBLE L'ASYMÉTRIE : le second appel SAIT pourquoi le premier a été refusé. */
  assert.deepEqual(appels[1].corrective, { reason: 'MULTIPLE_QUESTIONS', missing_determinant_id: 'duree' });
  assert.equal(status, 200, 'la reprise affichable aboutit');
  assert.equal(corps.next_question.text, ATOMIQUE);
  /* Et la chronologie est dite en entier, sans un mot de la personne. */
  assert.deepEqual(releves('DEEP_DISPLAY_REJECTED').map((e) => e.reason), ['MULTIPLE_QUESTIONS']);
  assert.deepEqual(releves('DEEP_CORRECTIVE_RETRY').map((e) => e.missing_determinant_id), ['duree']);
  assert.deepEqual(releves('DEEP_CORRECTIVE_RETRY_RESULT').map((e) => e.result), ['DISPLAYABLE']);
  assert.equal(releves('DEEP_CORRECTIVE_RETRY_EXHAUSTED').length, 0);
});

test('T-DDR-13 : la cause transmise est celle qui a été constatée — pas une cause par défaut', async () => {
  /* Quatre refus de natures différentes, quatre consignes différentes. Si la reprise portait une
     cause fixe, ce test tomberait — et le plan profond recevrait une correction hors sujet. */
  const cas = [
    [MULTIPLE, {}, 'MULTIPLE_QUESTIONS'],
    ['Quel type : un plan, une liste, une note, ou autre chose ?', {}, 'CATALOGUE'],
    ['Quel format souhaitez-vous pour le résultat ?', { question_focus: 'output_specification' }, 'META_OUTPUT_QUESTION']
  ];
  for (const [texte, extra, attendue] of cas) {
    const refusee = sortieCore({ question: texte, id: 'manque_z' });
    Object.assign(refusee.next_question, extra);
    const { appels, releves } = await tourReel([refusee, sortieCore({ question: ATOMIQUE, id: 'manque_z' })]);
    assert.equal(appels.length, 2, `${attendue} : une seule reprise`);
    assert.equal(appels[1].corrective.reason, attendue, `${attendue} : la cause constatée est celle transmise`);
    assert.equal(releves('DEEP_DISPLAY_REJECTED')[0].reason, attendue);
  }
});

test('T-DDR-14 : la reprise encore refusée rend le 502 contrôlé, et RIEN ne se relance', async () => {
  const { status, corps, appels, releves } = await tourReel([
    sortieCore({ question: MULTIPLE, id: 'duree' }),
    sortieCore({ question: MULTIPLE, id: 'duree' })
  ]);
  /* LA BORNE, MESURÉE : deux appels. Pas trois, pas une boucle qui s'arrête au bon moment. */
  assert.equal(appels.length, 2, 'la reprise a lieu une fois, puis plus jamais');
  assert.equal(status, 502);
  assert.equal(corps.error, 'turn_contractually_unusable', 'le code du contrat est inchangé');
  assert.equal('next_question' in corps, false, 'aucune question n’est fabriquée pour avoir quoi rendre');
  /* L'épuisement est dit explicitement — c'est ce qui rend le cas décidable dans un relevé. */
  assert.deepEqual(releves('DEEP_CORRECTIVE_RETRY_RESULT').map((e) => e.result), ['EXHAUSTED']);
  assert.equal(releves('DEEP_CORRECTIVE_RETRY_EXHAUSTED').length, 1);
  assert.equal(releves('DEEP_CORRECTIVE_RETRY_EXHAUSTED')[0].missing_determinant_id, 'duree');
  /* Et le refus a bien été constaté deux fois : le MÊME garde a jugé la reprise. */
  assert.equal(releves('DEEP_DISPLAY_REJECTED').length, 2, 'la reprise repasse le même garde');
});

test('T-DDR-15 : une panne pendant la reprise rend le refus d’origine, pas une erreur nouvelle', async () => {
  /* Ce que la personne a rencontré est un tour inexploitable. Une panne fournisseur survenue
     pendant la tentative de réparation ne doit pas changer ce constat en autre chose. */
  const { status, corps, appels, releves } = await tourReel([
    sortieCore({ question: MULTIPLE, id: 'duree' }),
    new Error('panne fournisseur')
  ]);
  assert.equal(appels.length, 2);
  assert.equal(status, 502);
  assert.equal(corps.error, 'turn_contractually_unusable');
  assert.deepEqual(releves('DEEP_CORRECTIVE_RETRY_RESULT'), [
    { event: 'DEEP_CORRECTIVE_RETRY_RESULT', result: 'EXHAUSTED', cause: 'PROVIDER_ERROR',
      invocation_id: releves('DEEP_CORRECTIVE_RETRY_RESULT')[0].invocation_id }
  ], 'la cause de l’épuisement est nommée, et ce n’est pas un refus de forme');
});

test('T-DDR-16 : la reprise est un budget PAR TENTATIVE — un nouveau clic humain redonne sa chance', async () => {
  /* La borne du tour est humaine : le client affiche l'échec et attend un clic. Rien ne serait gagné
     à mémoriser l'échec côté serveur — et ce serait un état de tour, que la décision a écarté.
     Deux tentatives successives obtiennent donc chacune une reprise, et chacune une seule. */
  const premiere = await tourReel([sortieCore({ question: MULTIPLE, id: 'duree' }), sortieCore({ question: MULTIPLE, id: 'duree' })]);
  assert.equal(premiere.status, 502);
  assert.equal(premiere.appels.length, 2);
  const seconde = await tourReel([sortieCore({ question: MULTIPLE, id: 'duree' }), sortieCore({ question: ATOMIQUE, id: 'duree' })]);
  assert.equal(seconde.status, 200, 'la seconde tentative n’est pas pénalisée par l’échec de la première');
  assert.equal(seconde.appels.length, 2, 'et elle dispose de la même reprise, unique');
});

test('T-DDR-17 : un tour SANS question ne passe par aucune de ces branches', async () => {
  /* READY INCHANGÉ. Le garde rend le tour intact quand il n'y a rien à afficher : la readiness
     appartient à l'autorité, et ce lot ne l'a pas approchée. */
  for (const etat of ['operational_request_ready', 'blocked']) {
    const sortie = sortieCore({ state: etat, question: null });
    if (etat === 'blocked') sortie.blocked_reason = 'Options épuisées.';
    const { status, corps, appels, journal } = await tourReel([sortie]);
    assert.equal(status, 200, `${etat} aboutit`);
    assert.equal(corps.state, etat, `${etat} : l’état est celui que l’autorité a prononcé`);
    assert.equal(corps.next_question, null, `${etat} : aucune question`);
    assert.equal(appels.length, 1, `${etat} : un seul appel`);
    assert.equal(journal.some((e) => /^DEEP_/.test(e.event)), false, `${etat} : aucun relevé de reprise`);
  }
});

/* ==========================================================================
 * LA DERNIÈRE MARCHE, ET CE QUI NE DOIT PAS BOUGER
 * --------------------------------------------------------------------------
 * RUNTIME-01 a coûté cher pour une leçon simple : un fait produit, validé, transporté, mais
 * jamais recopié à la dernière marche ne sert à rien. La cause du refus traverse ici quatre
 * modules ; ces deux tests vérifient qu'elle atteint la consigne réellement envoyée, et que le
 * plan rapide — qui avait déjà son propre mécanisme — n'a pas été touché en passant.
 * ======================================================================= */

test('T-DDR-18 : la correction atteint la consigne envoyée, sur les TROIS fournisseurs', async () => {
  const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
  /* Le résolveur est unique — la symétrie avec `resolveRoleSchema`, qui existait déjà. */
  assert.match(worker, /function resolveRoleSystemPrompt\(role, definition, corrective\) \{/);
  /* Et les trois chemins fournisseur le consultent : aucun n'envoie `definition.systemPrompt` en dur. */
  assert.equal(worker.split('systemPrompt: resolveRoleSystemPrompt(role, definition, corrective)').length - 1, 3,
    'Groq, Anthropic et OpenAI résolvent tous la consigne');
  for (const appelant of ['runRoleWithGroq', 'runRoleWithAnthropic', 'runRoleWithOpenAI']) {
    const corps = corpsDeFonction(worker, `export async function ${appelant}`);
    assert.match(corps, /corrective = null/, `${appelant} accepte un constat`);
    assert.match(corps, /resolveRoleSystemPrompt\(role, definition, corrective\)/, `${appelant} le fait suivre`);
  }
  /* LA GARDE DU RÉSOLVEUR : un rôle autre que le contractualisateur, ou un constat absent, rend la
     consigne d'origine. Aucun autre rôle n'hérite de ce mécanisme par accident. */
  assert.match(worker, /if \(role !== "core" \|\| !corrective \|\| typeof corrective !== "object"\) return definition\.systemPrompt;/);

  /* Et le bout de la chaîne, mesuré : la consigne effectivement produite pour le constat du garde
     contient la correction, et le reste de la doctrine intact. */
  const { reason } = guardDisplayedQuestion('Quel est le premier paramètre et le second ?', {});
  const consigne = coreSystemPromptWithCorrection(reason, 'duree');
  assert.ok(consigne.startsWith(CORE_SYSTEM_PROMPT));
  assert.ok(consigne.includes(DEEP_DISPLAY_CORRECTIONS.MULTIPLE_QUESTIONS),
    'la correction correspondant à la cause CONSTATÉE est celle qui part');
});

test('T-DDR-19 : le plan rapide garde son propre mécanisme, séparé et intact', async () => {
  const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
  /* Les deux plans corrigent tous les deux — c'était le but, l'asymétrie est comblée — mais par
     deux mécanismes distincts. Fusionner les tables ferait d'un lot sur l'un un lot sur l'autre. */
  assert.match(worker, /const consigneRapide = \(corrective\) => corrective/);
  assert.match(worker, /\$\{FAST_INTERACTION_SYSTEM_PROMPT\}\\n\$\{corrective\}/,
    'le plan rapide compose sa consigne comme avant ce lot');
  /* Le plan rapide reçoit un TEXTE déjà choisi ; le plan profond reçoit un CONSTAT et choisit. La
     différence est structurelle, et elle est voulue : le garde rapide nomme sa cause depuis
     BETA-04, le garde profond depuis ce lot. */
  assert.match(worker, /FAST_CORRECTIONS = Object\.freeze\(\{/);
  assert.equal(worker.includes('consigneRapide(coreSystemPromptWithCorrection'), false,
    'aucun mélange des deux tables de correction');
  assert.equal(worker.includes('DEEP_DISPLAY_CORRECTIONS'), false,
    'la table profonde vit dans le plan profond, pas dans le worker');
  /* Les adaptateurs rapides ne consultent JAMAIS le résolveur de rôle : le plan rapide n'est pas
     un rôle OPRIE, et ce lot ne l'a pas transformé en rôle. */
  const adaptateurs = corpsDeFonction(worker, 'export const FAST_INTERACTION_ADAPTERS');
  assert.equal(adaptateurs.includes('resolveRoleSystemPrompt'), false,
    'le plan rapide reste hors du chemin de rôle');
});
