/* 02F — UNE QUANTITÉ NOMMÉE PAR LA PERSONNE ATTEINT LE PROMPT, QUEL QUE SOIT LE FORMAT.
 * ============================================================================
 *
 * 02E avait fait arriver la quantité jusqu'au contrat, jusqu'à l'ADN, jusqu'au verrou et jusqu'au
 * gate — 3/3 sur les trois sorties d'Arbitre réelles du corpus 02D. Elle n'atteignait le prompt
 * livré que 1/3. La cause n'était pas la compréhension mais le rendu : le projecteur `volume`
 * retournait avant d'écrire la quantité dès que le format n'était pas énumérable, et la ligne
 * qu'il écrivait par ailleurs lisait l'unité du FORMAT au lieu de la cible du CONTRAT.
 *
 * Ce que cette suite fige :
 *   — une quantité qui NOMME sa cible se projette sur tout format ;
 *   — une quantité SANS cible reste réservée aux formats énumérables, exactement comme avant :
 *     la garde d'origine avait raison sur ce cas, et il n'est pas question de le perdre ;
 *   — la cible du contrat l'emporte sur l'unité du format ;
 *   — une contrainte énoncée est toujours contrôlable : la vérification suit le même critère.
 *
 * Aucune liste de formats n'a été écrite. Ce qui décide est ce que la contrainte PORTE.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runRapidePipeline, sectionBody } from './rapide-assembler-harness.helper.mjs';
import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';

/* Contrat canonique réel, porteur de la contrainte confirmée demandée : c'est la forme que
   l'Arbitre produit, pas une fixture inventée pour ce test. */
function contrat(contraintes, demande, livrable = 'Un livrable.') {
  const turn = oprieReadyTurn({ state: 'operational_request_ready' });
  turn.operational_request_candidate = {
    ...turn.operational_request_candidate,
    confirmed_constraints: contraintes,
    expected_deliverable: livrable
  };
  return canonicalFrom(turn, { request_id: '02f', original_request: demande });
}
function jouer(contraintes, demande) {
  const base = contrat(contraintes, demande);
  return runRapidePipeline({
    demande,
    orientation: {
      source: 'oprie', route: 'rapide', oprie: { state: base.executability.oprie_state },
      canonical: base, envelope: null, semantic: null, providerResult: null,
      action: null, decision: { state: 'ready' }
    }
  });
}
const quantifiees = (p) => String(sectionBody(p, 'CONTRAINTES QUANTIFIÉES') || '');
const verification = (p) => String(sectionBody(p, 'VÉRIFICATION AVANT ENVOI') || '');

/* ==========================================================================
 * T-02F-01 … 03 — LES TROIS CAS RÉELS DU CORPUS 02D
 * ======================================================================= */

test('T-02F-01 : « exactement 20 points » atteint le prompt avec sa cible', () => {
  const p = jouer(['Le livrable doit contenir exactement 20 points'],
    'Fais-moi une checklist de 20 points pour préparer un voyage en Italie');
  assert.match(quantifiees(p.promptFinal), /Exactement 20 points/);
  assert.doesNotMatch(quantifiees(p.promptFinal), /20 éléments/,
    'la cible du contrat l’emporte sur l’unité du format');
});

test('T-02F-02 : « exactement cinq paragraphes » atteint le prompt sur un format non énumérable', () => {
  const p = jouer(['Exactement cinq paragraphes'],
    'Explique la photosynthèse à un enfant de 10 ans en cinq paragraphes courts');
  assert.match(quantifiees(p.promptFinal), /Exactement 5 paragraphes/,
    'le format n’est pas énumérable, la contrainte est explicite : elle se projette');
});

test('T-02F-03 : « exactement dix slogans » atteint le prompt sur un format non énumérable', () => {
  const p = jouer(['Exactement dix slogans'],
    'Propose dix slogans chaleureux de moins de huit mots pour une boulangerie');
  assert.match(quantifiees(p.promptFinal), /Exactement 10 slogans/);
});

/* ==========================================================================
 * T-02F-04 … 06 — CE QUE LA GARDE D'ORIGINE PROTÉGEAIT, ET QUI RESTE PROTÉGÉ
 * ======================================================================= */

/* LE CAS QUE LA GARDE D'ORIGINE PROTÉGEAIT — ET QUI EST RÉEL.
 *
 * « Rédige un article de fond… » retient le format `article` : non énumérable, et servi par un
 * profil qui porte le verrou Volume PAR DÉFAUT. `ctx.quantite` vaut alors le seuil du profil
 * ({min:3}) sans que personne n'ait rien dénombré, et la section existe bel et bien. Sans garde, le
 * prompt dirait « Minimum 3 éléments » dans un article de fond. C'est ce contresens que la garde
 * d'origine évitait, et 02F le laisse évité : ce qui décide est `ctx.quantiteExplicite`, le même
 * drapeau que `actifsAdaptes()` consulte déjà. */
const DEMANDE_ARTICLE = 'Rédige un article de fond sur la transition énergétique en France';

test('T-02F-04 : un seuil de profil n’est pas projeté comme une quantité sur un format non énumérable', () => {
  const p = runRapidePipeline({ demande: DEMANDE_ARTICLE });
  assert.equal(p.ctx.fmt.enumerable, false, 'prémisse : le format n’est pas énumérable');
  assert.equal(!!p.ctx.quantiteExplicite, false, 'prémisse : personne n’a dénombré');
  assert.ok(p.mergedLocks.includes('volume'), 'prémisse : le verrou Volume est pourtant sélectionné');
  const bloc = quantifiees(p.promptFinal);
  assert.notEqual(bloc, '', 'la section existe : le test ne passe pas par vacuité');
  assert.doesNotMatch(bloc, /Minimum 3/, 'aucun seuil de profil projeté');
  assert.doesNotMatch(bloc, /éléments, sans doublon/, 'aucune unité générique imposée');
});

test('T-02F-05 : ce format garde exactement sa ligne de volume historique', () => {
  const p = runRapidePipeline({ demande: DEMANDE_ARTICLE });
  assert.match(quantifiees(p.promptFinal), /^- Volume attendu : /m,
    'la section conserve sa forme historique quand rien n’est demandé');
});

test('T-02F-06 : la vérification ne contrôle une quantité que si le prompt en énonce une', () => {
  const p = runRapidePipeline({ demande: DEMANDE_ARTICLE });
  assert.doesNotMatch(verification(p.promptFinal), /Le nombre de/,
    'rien à contrôler quand rien n’est énoncé');
});

/* ==========================================================================
 * T-02F-07 / 08 — UNE CONTRAINTE ÉNONCÉE EST CONTRÔLABLE
 * ======================================================================= */

test('T-02F-07 : la vérification contrôle la quantité projetée, avec la même cible', () => {
  const p = jouer(['Exactement cinq paragraphes'],
    'Explique la photosynthèse à un enfant de 10 ans en cinq paragraphes courts');
  assert.match(verification(p.promptFinal), /Le nombre de paragraphes est-il exactement 5 \?/);
});

test('T-02F-08 : sur un format non énumérable, la quantité contrôlée n’évince pas le contrôle de volume', () => {
  const p = jouer(['Exactement dix slogans'],
    'Propose dix slogans chaleureux de moins de huit mots pour une boulangerie');
  const v = verification(p.promptFinal);
  assert.match(v, /Le nombre de slogans est-il exactement 10 \?/);
  assert.match(v, /Le volume tient-il dans la fourchette indiquée/,
    'les deux contrôles coexistent : la quantité ne remplace pas le volume');
});

/* ==========================================================================
 * T-02F-09 … 11 — MODALITÉS SUR FORMAT NON ÉNUMÉRABLE
 * ======================================================================= */

test('T-02F-09 : la modalité minimum survit à la projection', () => {
  const p = jouer(['Au moins trois paragraphes'], 'Explique la photosynthèse simplement');
  assert.match(quantifiees(p.promptFinal), /Minimum 3 paragraphes/);
  assert.match(verification(p.promptFinal), /Le nombre de paragraphes est-il au moins 3 \?/);
});

test('T-02F-10 : la modalité maximum survit à la projection', () => {
  const p = jouer(['Au maximum quatre paragraphes'], 'Explique la photosynthèse simplement');
  assert.match(quantifiees(p.promptFinal), /Au maximum 4 paragraphes/);
  assert.match(verification(p.promptFinal), /Le nombre de paragraphes est-il au maximum 4 \?/);
});

test('T-02F-11 : une fourchette survit à la projection sans devenir un seuil unique', () => {
  const p = jouer(['Entre trois et cinq paragraphes'], 'Explique la photosynthèse simplement');
  assert.match(quantifiees(p.promptFinal), /Entre 3 et 5 paragraphes/);
  assert.match(verification(p.promptFinal), /entre 3 et 5/);
});

/* ==========================================================================
 * T-02F-12 — GÉNÉRALITÉ : AUCUNE LISTE DE FORMATS, AUCUNE CIBLE EN DUR
 * ======================================================================= */

test('T-02F-12 : une cible jamais vue par le correctif se projette sans ajout de code', () => {
  const p = jouer(['Exactement sept strophes'], 'Écris un poème sur la mer');
  assert.match(quantifiees(p.promptFinal), /Exactement 7 strophes/,
    'ni « strophes » ni ce format n’apparaissent dans le correctif');
});

/* ==========================================================================
 * T-02F-13 … 15 — 02F-bis : CE QUE LE SMOKE PRODUIT A TROUVÉ
 *
 * Les deux défauts ci-dessous n'ont pas été trouvés en lisant le code : ils ont été trouvés en
 * lisant des prompts réellement livrés, sur des sorties d'Arbitre réelles. Les formulations citées
 * sont celles que l'Arbitre a produites, mot pour mot.
 * ======================================================================= */

test('T-02F-13 : la cible nommée AVANT le nombre est lue — tournure habituelle de l’Arbitre', () => {
  /* Interrogé sur « exactement 7 idées de cadeaux », l'Arbitre confirme « Le nombre d'idées doit
     être exactement 7 ». Le nom précède le nombre : la cible retombait sur « éléments ». */
  const p = jouer(["Le nombre d'idées doit être exactement 7"],
    'Donne exactement 7 idées de cadeaux pour un enfant de 8 ans');
  assert.match(quantifiees(p.promptFinal), /Exactement 7 idées/);
  assert.doesNotMatch(quantifiees(p.promptFinal), /7 éléments/);
});

test('T-02F-14 : une fourchette nommée avant le nombre est lue aussi', () => {
  const p = jouer(['Le nombre de titres proposés doit être compris entre trois et cinq (inclus)'],
    "Propose entre trois et cinq titres d'articles sur le vélo en ville");
  assert.match(quantifiees(p.promptFinal), /Entre 3 et 5 titres/);
});

test('T-02F-15 : la cible garde ses accents dans le prompt livré', () => {
  /* Les motifs travaillent sur un texte sans accents ; la cible, elle, est écrite à la personne.
     « Exactement 7 idees » était une faute visible, mesurée sur un prompt réel. */
  const p = jouer(["Le nombre d'idées doit être exactement 7"], 'Donne exactement 7 idées de cadeaux');
  assert.match(quantifiees(p.promptFinal), /idées/, 'accentué');
  assert.doesNotMatch(quantifiees(p.promptFinal), /\bidees\b/, 'jamais la forme normalisée');
  /* Et l'élision est faite : « Le nombre de idées » était fautif, comme « Le nombre de éléments »
     l'était déjà avant ces lots. */
  assert.match(verification(p.promptFinal), /Le nombre d’idées est-il exactement 7 \?/);
});
