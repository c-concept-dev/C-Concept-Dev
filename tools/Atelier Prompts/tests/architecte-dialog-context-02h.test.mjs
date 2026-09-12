/* 02H — UNE INFORMATION OBTENUE PENDANT LE DIALOGUE NE DOIT PAS REDEVENIR INCONNUE.
 * ============================================================================
 *
 * Le smoke bêta avait conclu que l'analyse Architecte repartait de la demande brute et que le
 * prompt final reposait des questions déjà répondues. Cette suite éprouve la propagation réelle et
 * établit le contraire : le produit possède déjà le transport, et il fonctionne.
 *
 *   compositeDemand()  construit « demande + Précisions apportées pendant le dialogue : … »
 *   syncLegacy()       écrit ce texte dans #arch-demande, la seule entrée que archContexte() lit
 *   answerQuestion()   appelle syncLegacy() dès qu'une réponse entre dans state.answers
 *
 * Pourquoi personne ne l'avait vu : `loadAnswerQuestion` remplace `syncLegacy` par un stub vide, et
 * aucun test ne chargeait `compositeDemand`. La fonction qui porte tout le contexte conversationnel
 * vers l'Architecte n'était couverte par aucune assertion. C'est ce trou que cette suite ferme.
 *
 * Aucune ligne de production n'a été modifiée par ce lot.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { html, loadAnswerQuestion } from './perf04-frontend-harness.helper.mjs';

/* Charge compositeDemand / materialText / syncLegacy TELLES QU'ÉCRITES en production, avec leurs
   seules dépendances remplacées : `state` et `$`. Ce qui est éprouvé reste le code du produit. */
function loadPropagation({ demande = '', answers = [], docs = [] } = {}) {
  const debut = 'function compositeDemand(){';
  const fin = 'function renderFiles(){';
  const i = html.indexOf(debut);
  assert.notEqual(i, -1, 'borne de tranche introuvable : ' + debut);
  const j = html.indexOf(fin, i);
  assert.notEqual(j, -1, 'borne de tranche introuvable : ' + fin);
  const source = html.slice(i, j);
  const dom = new Map([['#v11-demande', { value: demande }]]);
  const champ = (id) => {
    if (!dom.has(id)) dom.set(id, { value: '', textContent: '', dispatchEvent() {} });
    const el = dom.get(id);
    if (typeof el.dispatchEvent !== 'function') el.dispatchEvent = () => {};
    return el;
  };
  const context = {
    state: { answers: [...answers], docs: [...docs] },
    $: champ,
    Event: class { constructor(type) { this.type = type; } }
  };
  vm.runInNewContext(source + '\n;globalThis.__c=compositeDemand;globalThis.__s=syncLegacy;', context);
  return { composite: context.__c, sync: context.__s, champ, state: context.state };
}

const ECHANGE = (question, answer) => ({ question, answer });

/* ==========================================================================
 * T-02H-01 / 02 — LE CONTEXTE DU DIALOGUE ATTEINT L'ENTRÉE DE L'ANALYSE
 * ======================================================================= */

test('T-02H-01 : les réponses du dialogue atteignent l’entrée de l’analyse Architecte', () => {
  const p = loadPropagation({
    demande: 'Aide-moi à préparer une présentation.',
    answers: [ECHANGE('Sur quel sujet porte la présentation ?', 'Le bilan annuel de mon service, à la direction, en 15 minutes.')]
  });
  p.sync();
  const entree = p.champ('#arch-demande').value;
  assert.match(entree, /^Aide-moi à préparer une présentation\./, 'la demande initiale reste en tête');
  assert.match(entree, /Précisions apportées pendant le dialogue/, 'les précisions sont transportées');
  assert.match(entree, /bilan annuel de mon service/, 'et la réponse elle-même y figure');
});

test('T-02H-02 : une information résolue pendant le dialogue figure dans l’entrée de l’analyse', () => {
  /* Générique : ni « présentation », ni aucun domaine. Trois champs quelconques. */
  const p = loadPropagation({
    demande: 'Fais-moi quelque chose.',
    answers: [
      ECHANGE('Quel est le sujet ?', 'ALPHA-SUJET'),
      ECHANGE('Quel est le public ?', 'BETA-PUBLIC'),
      ECHANGE('Quelle est la durée ?', 'GAMMA-DUREE')
    ]
  });
  p.sync();
  const entree = p.champ('#arch-demande').value;
  for (const resolu of ['ALPHA-SUJET', 'BETA-PUBLIC', 'GAMMA-DUREE']) {
    assert.ok(entree.includes(resolu), `« ${resolu} » doit atteindre l’analyse`);
  }
});

/* ==========================================================================
 * T-02H-03 — CE QUI RESTE INCONNU RESTE SIGNALABLE
 * ======================================================================= */

test('T-02H-03 : la propagation n’ajoute que ce qui a été répondu', () => {
  /* La correction ne doit pas devenir « ne plus rien demander après un dialogue » : seules les
     réponses réellement données sont transportées, et rien n'est comblé d'office. */
  const p = loadPropagation({
    demande: 'Fais-moi quelque chose.',
    answers: [ECHANGE('Quel est le sujet ?', 'ALPHA-SUJET')]
  });
  p.sync();
  const entree = p.champ('#arch-demande').value;
  assert.ok(entree.includes('ALPHA-SUJET'));
  assert.equal(entree.includes('BETA-PUBLIC'), false, 'aucune réponse n’est inventée');
  const lignes = entree.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(lignes.length, 1, 'une réponse donnée, une ligne transportée');
});

/* ==========================================================================
 * T-02H-04 / 05 — L'HISTORIQUE APPARTIENT AU TOUR COURANT
 * ======================================================================= */

test('T-02H-04 : sans aucune réponse, l’entrée de l’analyse est la demande seule', () => {
  const p = loadPropagation({ demande: 'Une demande nue.', answers: [] });
  p.sync();
  assert.equal(p.champ('#arch-demande').value, 'Une demande nue.',
    'aucun en-tête de précisions, aucun texte ajouté');
});

test('T-02H-05 : aucune fuite d’un dialogue antérieur — `resetAll` vide l’unique source', () => {
  /* `state.answers` est la seule source de l'historique. Une nouvelle demande la vide, donc les
     réponses d'une conversation précédente ne peuvent pas contaminer la suivante. */
  const i = html.indexOf('function resetAll(){');
  assert.notEqual(i, -1);
  const corps = html.slice(i, i + 400);
  assert.match(corps, /state\.answers\s*=\s*\[\]/, 'resetAll remet l’historique à zéro');

  const p = loadPropagation({ demande: 'Demande B.', answers: [ECHANGE('Q de A ?', 'REPONSE-DE-A')] });
  p.state.answers.length = 0;             /* ce que resetAll effectue */
  p.champ('#v11-demande').value = 'Demande B.';
  p.sync();
  assert.equal(p.champ('#arch-demande').value.includes('REPONSE-DE-A'), false,
    'la réponse du dialogue précédent ne peut pas atteindre la demande suivante');
});

/* ==========================================================================
 * T-02H-06 — LA PROPAGATION N'ÉCRIT QUE DANS LES DEUX CHAMPS D'ENTRÉE
 * ======================================================================= */

test('T-02H-06 : `syncLegacy` n’écrit que la demande et le matériau — aucune autorité déplacée', () => {
  const p = loadPropagation({
    demande: 'Une demande.',
    answers: [ECHANGE('Q ?', 'R')],
    docs: [{ name: 'note.txt', text: 'Contenu de la note.' }]
  });
  p.sync();
  assert.match(p.champ('#arch-demande').value, /Précisions apportées/);
  assert.match(p.champ('#arch-materiau').value, /Contenu de la note\./);
  /* Aucun champ sous autorité OPRIE ou canonique n'est touché : la tranche chargée ne contient
     que ces deux écritures. */
  const source = html.slice(html.indexOf('function syncLegacy(){'), html.indexOf('function renderFiles(){'));
  const ecritures = source.match(/\$\('#[a-z-]+'\)/g) || [];
  assert.deepEqual([...new Set(ecritures)].sort(), ["$('#arch-demande')", "$('#arch-materiau')"],
    'syncLegacy ne connaît que ces deux champs');
});

/* ==========================================================================
 * T-02H-07 — LE DÉCLENCHEUR : RÉPONDRE PROPAGE
 * ======================================================================= */

test('T-02H-07 : répondre à une question déclenche la propagation', () => {
  /* C'est le maillon que le smoke avait manqué : `answerQuestion` appelle `syncLegacy()` dès que la
     réponse est entrée dans `state.answers`. Le harnais le remplace par un stub — on l'instrumente
     ici pour observer l'appel, sur le vrai code de production. */
  const h = loadAnswerQuestion({ pendingQuestion: true, question: 'Quel est le sujet ?' });
  let appels = 0, etatAuMoment = null;
  h.ctx.syncLegacy = () => { appels += 1; etatAuMoment = h.ctx.state.answers.map((a) => a.answer); };
  h.answerQuestion('ALPHA-SUJET');
  assert.equal(appels, 1, 'la propagation est déclenchée exactement une fois');
  assert.deepEqual(etatAuMoment, ['ALPHA-SUJET'],
    'et elle est déclenchée APRÈS que la réponse soit entrée dans l’historique');
});

/* ==========================================================================
 * T-02H-08 — LE CAS B7, SOUS SA FORME DE PROPAGATION
 * ======================================================================= */

test('T-02H-08 : B7 — sujet, public et durée acquis atteignent tous l’analyse', () => {
  const p = loadPropagation({
    demande: 'Aide-moi à préparer une présentation.',
    answers: [
      ECHANGE('Sur quel sujet ou thème porte la présentation ?',
              'Une présentation de 15 minutes pour présenter le bilan annuel de mon service à la direction.'),
      ECHANGE('Sous quelle forme souhaitez-vous recevoir le livrable ?',
              'Une trame de diapositives avec un titre et le contenu suggéré pour chaque diapositive.'),
      ECHANGE('S’agit-il d’un compte-rendu d’activité ou d’un bilan financier ?',
              'Un compte-rendu d’activité : réalisations, projets, indicateurs et faits marquants.')
    ]
  });
  p.sync();
  const entree = p.champ('#arch-demande').value;
  assert.match(entree, /15 minutes/, 'durée');
  assert.match(entree, /à la direction/, 'public');
  assert.match(entree, /bilan annuel/, 'sujet');
  assert.match(entree, /trame de diapositives/, 'forme du livrable');
});
