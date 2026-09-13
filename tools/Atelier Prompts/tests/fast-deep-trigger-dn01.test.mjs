/* IA-04 — LE PLAN PROFOND EST UNE ESCALADE, PAS UN CHEMIN RÉFLEXE.
 * ============================================================================
 *
 * Ce que cette suite éprouve tient en trois nombres : sur une question rapide, ZÉRO appel profond ;
 * sur un silence rapide, UN ; sur un échec rapide, UN.
 *
 * Pourquoi cela méritait un lot. Le plan profond partait une ligne avant que le plan rapide
 * n'existe. L'intention était juste — ne jamais l'attendre pour afficher — mais elle avait fusionné
 * deux propriétés séparables : ne pas l'ATTENDRE, et le LANCER toujours. La seconde n'était demandée
 * par aucun contrat. Le garde-fou §9 l'interdit même nommément : Deep ne doit pas servir « à
 * afficher la prochaine interaction utilisateur ».
 *
 * CE QUI N'A PAS CHANGÉ, et que cette suite garde avec la même insistance : ne pas escalader n'est
 * pas une décision sémantique. Le plan rapide ne peut porter aucun état OPRIE — son schéma à deux
 * champs le lui interdit — et la readiness reste celle de l'Arbitre seul.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPilot, arbiterTurn, clarificationTurn, delay, questionShown } from './perf04-frontend-harness.helper.mjs';

const ask = (text = 'Pour quel public ?') => ({ type: 'ASK_CLARIFICATION', text });
const confirm = (text = 'Confirmez-vous ?') => ({ type: 'ASK_CONFIRMATION', text });
const silence = (text = 'Rien à demander pour l’instant.') => ({ type: 'WAIT_FOR_DEEP_VALIDATION', text });

/* ---------- §14 : les trois comptages ---------- */

test('T-DN01-A : question rapide — fastCalls=1, deepCalls=0', async () => {
  for (const candidate of [ask, confirm]) {
    const { pilot, spy, ctx } = loadPilot({ fast: async () => candidate(), deep: async () => clarificationTurn() });
    await pilot.oprieRunTurn('architecte');
    assert.equal(spy.fastCalls.length, 1);
    assert.equal(spy.deepCalls.length, 0, `${candidate().type} : aucune escalade.`);
    assert.equal(questionShown(ctx), candidate().text, 'et la question est bien posée.');
  }
});

test('T-DN01-B : silence rapide — fastCalls=1, deepCalls=1', async () => {
  const { pilot, spy } = loadPilot({ fast: async () => silence(), deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.fastCalls.length, 1);
  assert.equal(spy.deepCalls.length, 1, 'une escalade, une seule : ni zéro, ni deux.');
});

test('T-DN01-C : échec rapide — fastCalls=1, deepCalls=1, fail-closed', async () => {
  for (const panne of [async () => { throw new Error('réseau'); },
                       async () => new Response('{}', { status: 502 }),
                       async () => ({ type: 'ETAT_INTERDIT', text: 'x' }),
                       async () => ({ type: 'ASK_CLARIFICATION', text: '' })]) {
    const { pilot, spy } = loadPilot({ fast: panne, deep: async () => clarificationTurn('Q profonde ?') });
    await pilot.oprieRunTurn('architecte');
    assert.equal(spy.deepCalls.length, 1, 'le plan profond reprend la main sur tout échec rapide.');
    assert.equal(pilot.oprieState.lastTurn.state, 'clarification_required', 'et son résultat est appliqué.');
  }
});

test('T-DN01-D : aucun endpoint rapide — le plan profond escalade quand même', async () => {
  const { pilot, spy } = loadPilot({ noFastEndpoint: true, deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.fastCalls.length, 0);
  assert.equal(spy.deepCalls.length, 1, 'sans plan rapide, il n’y a pas de dialogue léger — il y a l’autorité.');
});

/* ---------- §10 : non-autorité ---------- */

test('T-DN01-E : une question rapide ne fabrique AUCUN état OPRIE', async () => {
  const { pilot, spy } = loadPilot({ fast: async () => ask(), deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.deepCalls.length, 0);
  assert.equal(pilot.oprieState.lastTurn, null, 'aucun tour autoritaire n’a été appliqué.');
  assert.equal(pilot.oprieState.canonicalContract, null, 'aucun contrat canonique n’a été produit.');
  assert.deepEqual(spy.executed, [], 'et rien n’a été exécuté.');
  for (const champ of ['state', 'next_question', 'confirmation_reason', 'blocked_reason',
                       'operational_request_candidate', 'intent_preservation']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pilot.oprieState.fastInteraction, champ), false,
      `${champ} reste hors de portée du plan rapide.`);
  }
  assert.equal(pilot.oprieState.fastInteraction.authority, 'candidate');
});

test('T-DN01-F : une question rapide ne prononce ni READY, ni clarification_required, ni blocked', async () => {
  const { pilot } = loadPilot({ fast: async () => ask(), deep: async () => arbiterTurn('operational_request_ready') });
  await pilot.oprieRunTurn('architecte');
  const interdits = ['operational_request_ready', 'clarification_required', 'confirmation_required',
                     'blocked', 'degraded_state'];
  const rendu = JSON.stringify(pilot.oprieState.fastInteraction);
  for (const etat of interdits) {
    assert.equal(rendu.includes(etat), false, `le plan rapide ne porte jamais ${etat}.`);
  }
  assert.equal(pilot.oprieState.lifecycle, null, 'aucun cycle d’exécution n’a été ouvert.');
});

test('T-DN01-G : ne pas escalader n’est pas une décision — l’escalade reprend au tour suivant', async () => {
  /* Le tour d’après, la personne a répondu : le plan rapide n’a plus rien à demander, et l’autorité
     reprend la main. C’est ce qui garantit qu’un dialogue rapide ne remplace jamais OPRIE, il le
     précède. */
  let tour = 0;
  const { pilot, spy } = loadPilot({
    answers: [{ question: 'Pour quel public ?', answer: 'Des étudiants.' }],
    fast: async () => (++tour === 1 ? ask() : silence()),
    deep: async () => arbiterTurn('operational_request_ready')
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.deepCalls.length, 0, 'premier tour : la question rapide suffit.');
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.deepCalls.length, 1, 'second tour : plus rien à demander, l’autorité tranche.');
  assert.equal(pilot.oprieState.lastTurn.state, 'operational_request_ready');
});

/* ---------- aucune limite arbitraire ---------- */

test('T-DN01-H : aucun plafond numérique sur le nombre de tours rapides', async () => {
  const { pilot, spy, ctx } = loadPilot({ fast: async () => ask(), deep: async () => clarificationTurn() });
  for (let i = 0; i < 6; i += 1) {
    await pilot.oprieRunTurn('architecte');
    /* La personne répond : la question cesse d'être ouverte, exactement comme en usage réel. Sans
       cela, le garde d'unicité écarterait la candidate suivante et le tour escaladerait — ce qui est
       le bon comportement, mais pas ce que ce test mesure. */
    ctx.adpState.pendingQuestion = false;
  }
  assert.equal(spy.fastCalls.length, 6, 'six tours rapides, six appels : aucun compteur ne coupe.');
  assert.equal(spy.deepCalls.length, 0, 'et aucune escalade forcée par un seuil.');
  const src = pilot.oprieRunTurn.toString();
  for (const interdit of [/MAX_FAST/i, /fastTurns/i, /tourRapideCount/i]) {
    assert.doesNotMatch(src, interdit, `aucun compteur de tours rapides (${interdit}).`);
  }
});
