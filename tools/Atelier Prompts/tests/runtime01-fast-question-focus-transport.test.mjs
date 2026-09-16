/* ATELIER PROMPTS RUNTIME-01 — UN FAIT CANONIQUE DOIT ARRIVER, PAS SEULEMENT EXISTER.
 * ============================================================================
 *
 * CE QUE LE RUNTIME DÉPLOYÉ A MONTRÉ, ET QUE 3363 TESTS VERTS N'AVAIENT PAS VU.
 *
 * Le smoke DEPLOYMENT-01, exécuté contre le Worker réellement servi, a relevé cinq
 * ASK_CLARIFICATION réelles produites par le fournisseur rapide. Sur les cinq, la réponse HTTP
 * portait exactement deux clés — `type` et `text` — et jamais `question_focus`.
 *
 * LA CHAÎNE ÉTAIT COMPLÈTE PARTOUT SAUF À SA DERNIÈRE MARCHE :
 *
 *   FAST_INTERACTION_JSON_SCHEMA         exige question_focus (required, trois champs)
 *   le fournisseur                       le produit
 *   guardFastSolicitation                le laisse passer intact sur ALLOW
 *   validateFastInteraction              le normalise et le pose sur l'interaction
 *   fast-interaction-endpoint            NE LE RECOPIAIT PAS DANS LA RÉPONSE HTTP
 *   le client                            sait le lire, et ne le recevait jamais
 *
 * CE QUE CETTE PERTE COÛTAIT, EXACTEMENT. Le client lit en tolérant : sans le champ, `focus`
 * devient null. `isMetaOutputQuestion` commence alors par « Sans fait déclaré, on échoue FERMÉ :
 * rien n'est accusé. » Le garde méta-question de V2.2.1-D2F1 ne se trompait donc pas sur le plan
 * rapide en production : il ne s'exécutait jamais. Un garde inerte ne se voit pas — c'est
 * précisément pourquoi il fallait le mesurer sur le déploiement réel plutôt que le supposer vert.
 *
 * POURQUOI AUCUN TEST NE L'AVAIT ATTRAPÉ. Les suites vérifiaient que le champ existe DANS LE
 * SCHÉMA et qu'il est produit PAR LE VALIDATEUR. Aucune ne suivait sa valeur jusqu'au corps JSON
 * rendu par la porte réseau. T-P04-EP01 faisait plus que l'ignorer : il épinglait la réponse à
 * deux clés exactement, et protégeait donc l'implémentation d'avant D2F1 contre sa propre
 * correction.
 *
 * CE FICHIER SUIT LA VALEUR, PAS LA FORME. Il ne demande pas « le champ est-il déclaré quelque
 * part » : il vérifie que la valeur écrite en amont est celle que le client reçoit, à l'octet près,
 * sans recalcul ni valeur de repli.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAST_INTERACTION_PATHNAME, handleFastInteractionRequest } from '../workers/shared/fast-interaction-endpoint.js';
import { FAST_INTERACTION_JSON_SCHEMA, FAST_INTERACTION_TYPES, validateFastInteraction, createTurnSnapshot } from '../workers/shared/fast-interactive-plane.js';
import { QUESTION_FOCUS_VALUES } from '../core/adn/operational-request-state.js';

/* TARGETED-FIX-POST-CODEX-01 — le contrat du plan rapide compte un QUATRIÈME champ nommé :
   l'identité du manque. Le contre-audit a démontré qu'une question rapide répondue laissait
   l'historique sans identité, si bien qu'une reformulation ultérieure du même manque par le plan
   profond n'était plus reconnue. L'invariant gardé ici est inchangé — le schéma reste clos et
   incapable de porter un état ; il s'allonge d'un fait produit par la même décision. */

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

const ORIGINE = 'https://atelier.example';
const env = { ALLOWED_ORIGINS: ORIGINE };
const corps = (extra = {}) => ({
  turn_id: 1, original_request: 'Je veux préparer un déplacement.', clarification_history: [],
  current_answer: null, canonical_version: 0, material_present: false, ...extra
});
const requete = (charge) => new Request(`https://w.dev${FAST_INTERACTION_PATHNAME}`, {
  method: 'POST', headers: { Origin: ORIGINE, 'Content-Type': 'application/json' },
  body: JSON.stringify(charge)
});
/** Un aller-retour complet par la VRAIE porte réseau, sans rien contourner. */
const allerRetour = async (sortieFournisseur, charge = corps()) => {
  const reponse = await handleFastInteractionRequest(requete(charge), env, { executeFast: async () => sortieFournisseur });
  return { status: reponse.status, json: await reponse.json() };
};

/* ==========================================================================
 * RUNTIME01-01 — LA VALEUR TRAVERSE, ET C'EST LA MÊME
 * ======================================================================= */

test('T-RUNTIME01-01 : question_focus traverse la porte réseau, identique à ce que le plan rapide a écrit', async () => {
  /* Les trois valeurs canoniques, une par une : aucune n'est privilégiée, aucune n'est déduite. */
  for (const focus of QUESTION_FOCUS_VALUES) {
    const { status, json } = await allerRetour({
      type: 'ASK_CLARIFICATION', text: 'Depuis quelle ville partez-vous ?', question_focus: focus
    });
    assert.equal(status, 200, `${focus} : la porte accepte une sortie conforme`);
    assert.deepEqual(Object.keys(json).sort(), ['missing_determinant_id', 'question_focus', 'text', 'type'],
      `${focus} : les trois champs du contrat repartent, ni plus ni moins`);
    assert.equal(json.question_focus, focus, `${focus} : la valeur rendue est celle qui a été écrite`);
    assert.equal(json.type, 'ASK_CLARIFICATION');
    assert.equal(json.text, 'Depuis quelle ville partez-vous ?');
  }
});

test('T-RUNTIME01-02 : la valeur rendue est celle du plan rapide, pas une valeur reconstruite', async () => {
  /* La preuve tient en une comparaison : ce que le validateur pose sur l'interaction, et ce que le
     client reçoit, sont la MÊME valeur. Si la porte recalculait quoi que ce soit, ces deux-là
     pourraient diverger — ici elles ne le peuvent pas. */
  const brut = { type: 'ASK_CLARIFICATION', text: 'Quel est le format attendu ?', question_focus: 'output_specification' };
  const interne = validateFastInteraction(brut, createTurnSnapshot({ turn_id: 1, original_request: 'x' }));
  assert.equal(interne.ok, true);
  const { json } = await allerRetour(brut);
  assert.equal(json.question_focus, interne.interaction.question_focus);
  /* Et le texte, lui, n'a pas servi à deviner le fait : la même question avec un autre fait déclaré
     ressort avec cet autre fait. Aucune lecture du texte n'intervient. */
  const { json: autre } = await allerRetour({ ...brut, question_focus: 'problem_or_user_context' });
  assert.equal(autre.question_focus, 'problem_or_user_context');
  assert.equal(autre.text, json.text, 'même texte, fait différent : le texte ne décide de rien');
});

/* ==========================================================================
 * RUNTIME01-03 / 04 — QUAND IL N'Y A PAS DE QUESTION
 * ======================================================================= */

test('T-RUNTIME01-03 : sans question, le champ vaut null — jamais une valeur inventée', async () => {
  /* Le contrat l'autorise explicitement : le schéma déclare question_focus comme ["string","null"]
     et son énumération contient null. Un type qui ne sollicite rien n'interroge rien. */
  assert.deepEqual(FAST_INTERACTION_JSON_SCHEMA.properties.question_focus.type, ['string', 'null']);
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.properties.question_focus.enum.includes(null), true);
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.required.includes('question_focus'), true);

  for (const type of FAST_INTERACTION_TYPES.filter((t) => t !== 'ASK_CLARIFICATION')) {
    const { status, json } = await allerRetour({ type, text: 'Reçu.', question_focus: null });
    assert.equal(status, 200, `${type} accepté`);
    assert.equal(json.question_focus, null, `${type} : rien n'est interrogé, donc rien n'est déclaré`);
    assert.deepEqual(Object.keys(json).sort(), ['missing_determinant_id', 'question_focus', 'text', 'type'],
      `${type} : le champ reste présent et vaut null — l'absence est DITE, pas laissée à deviner`);
  }
});

test('T-RUNTIME01-04 : un fournisseur qui omet le champ ne se voit pas attribuer une valeur', async () => {
  /* Lecture tolérante, écriture stricte : l'entrée sans le champ est acceptée — c'est le précédent
     de `normalizeCandidate` — mais l'absence ressort comme null. La porte ne devine pas ce que le
     fournisseur n'a pas dit, et ne se rabat sur aucun mot du texte. */
  const { status, json } = await allerRetour({ type: 'ASK_CLARIFICATION', text: 'Quel est votre budget ?' });
  assert.equal(status, 200);
  assert.equal(json.question_focus, null, 'non déclaré reste non déclaré');
  assert.equal(QUESTION_FOCUS_VALUES.includes(json.question_focus), false, 'aucune des trois valeurs n’est supposée');
});

/* ==========================================================================
 * RUNTIME01-05 — CE QUE LA PORTE NE DOIT TOUJOURS PAS LAISSER SORTIR
 * ======================================================================= */

test('T-RUNTIME01-05 : le troisième champ n’ouvre aucune autre fuite', async () => {
  /* T-P04-EP02 disait déjà l'invariant, et il reste entier : un champ de plus dans le contrat
     n'est pas une permission de tout exposer. Ce qui sort est le contrat, et rien du travail
     interne de validation. */
  const { json } = await allerRetour({ type: 'ASK_CLARIFICATION', text: 'Depuis quelle ville ?', question_focus: 'problem_or_user_context' });
  for (const interne of ['authority', 'can_execute', 'can_route', 'can_mark_ready',
                         'interaction_id', 'turn_id', 'source', 'canonical_version', 'state']) {
    assert.equal(interne in json, false, `${interne} reste interne`);
  }
  /* Et une sortie qui prétendrait porter un état est toujours refusée en amont. */
  const { status } = await allerRetour({ type: 'ACKNOWLEDGE', text: 'x', state: 'operational_request_ready' });
  assert.equal(status, 502, 'un champ d’autorité glissé dans la sortie échoue avant tout transport');
});

/* ==========================================================================
 * RUNTIME01-06 — LE CLIENT LIVRÉ SAIT RECEVOIR CES TROIS CHAMPS
 * ======================================================================= */

test('T-RUNTIME01-06 : l’artefact livré consomme le fait qu’il reçoit désormais', () => {
  /* Ce lot ne touche pas au client, et n'a pas à le toucher : il lisait déjà en tolérant. Ce test
     le prouve sur les octets réellement servis, pour qu'on ne suppose pas cette moitié de la
     chaîne. Sans lui, « le fait traverse » ne dirait rien de ce qui en est fait. */
  const html = lire('atelier-prompts-v11.5-lot10g-decision-provider.html');
  /* Le lecteur tolérant. TARGETED-FIX-POST-CODEX-01 l'a étendu à un second fait — l'identité du
     manque — et sa forme a changé : deux tolérances nommées, l'une après l'autre, au lieu d'un
     ternaire. Ce que ce test garde est inchangé : le client ACCEPTE un champ absent, et ne fabrique
     jamais celui qu'il n'a pas reçu. */
  assert.match(html, /if \(cles\.includes\("question_focus"\)\) attendues\.push\("question_focus"\);/);
  assert.match(html, /if \(cles\.includes\("missing_determinant_id"\)\) attendues\.push\("missing_determinant_id"\);/);
  /* Et le consommateur : le garde d'affichage reçoit le fait, il ne le reconstruit pas. */
  assert.match(html, /guardDisplayedQuestion\([\s\S]{0,60}questionFocus: candidate\.question_focus/);
});
