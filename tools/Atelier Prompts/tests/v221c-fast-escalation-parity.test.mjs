/* ATELIER PROMPTS V2.2.1-C — LA PLACE D'UNE RÈGLE EST UNE PROPRIÉTÉ DE LA RÈGLE.
 * ============================================================================
 *
 * CE FICHIER S'APPELAIT v221b-canonical-decision-lock. IL A CHANGÉ DE NOM EN V2.2.1-E1.
 *
 * Il contenait deux lots. Le premier, V2.2.1-B, épinglait le VERROU DE DÉCISION CANONIQUE : le plan
 * rapide traduisait son accusé de réception en décision d'aboutissement, et le contractualisateur
 * n'avait plus le droit d'en décider autrement. Le réaudit indépendant a établi que ce verrou, bien
 * que techniquement correct et prouvé par ces tests-là, faisait du plan rapide une AUTORITÉ DE
 * MATURITÉ — ce que les deux textes normatifs interdisent :
 *
 *   GARDE-FOU §9  « Fast … Il ne doit pas : fabriquer READY » ; invariant « Fast candidate-only ».
 *   DIRECTIVE §5  « OPRIE = autorité sémantique de la demande et de la readiness » ;
 *                 à proscrire : « double readiness ».
 *
 * Les dix tests V221B sont donc classés HISTORICAL_IMPLEMENTATION_CONTRACT : ils protégeaient
 * fidèlement une architecture que la gouvernance condamne. Ils ont été retirés AVEC le mécanisme
 * qu'ils décrivaient, et non affaiblis pour survivre. Ce que V2.2.1-E1 met à leur place se trouve
 * dans v221e1-single-readiness-authority.test.mjs.
 *
 * CE QUI RESTE ICI EST D'UN AUTRE LOT, ET RESTE VRAI. V2.2.1-C ne portait pas sur l'autorité mais
 * sur la PLACE d'une règle : mesuré, le modèle rapide n'escaladait pas une contradiction explicite,
 * non par incapacité, mais parce que la règle arrivait après six mille caractères de doctrine. La
 * même règle, déplacée en PREMIER CONTRÔLE, a donné 2/2. Cette démonstration est indépendante du
 * verrou, et rien dans E1 ne la remet en cause.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FAST_INTERACTION_TYPES } from '../workers/shared/fast-interactive-plane.js';
import { FAST_INTERACTION_SYSTEM_PROMPT as FAST_PROMPT } from '../workers/groq/src/index.js';

const orchestrateur = fs.readFileSync(
  new URL('../workers/shared/operational-request-orchestrator.js', import.meta.url), 'utf8');

test('V221C-01 : le contrôle d’exclusion est un PREMIER contrôle, avant la doctrine', () => {
  const p = FAST_PROMPT;
  const iControle = p.indexOf('PREMIER CONTRÔLE, AVANT TOUT LE RESTE');
  const iDoctrine = p.indexOf('AVANT DE QUESTIONNER — LA SUBSTITUTION');
  assert.ok(iControle > 0, 'le contrôle existe');
  assert.ok(iDoctrine > 0, 'la doctrine existe');
  assert.ok(iControle < iDoctrine, 'et le contrôle précède la doctrine — c’est la correction mesurée');
  assert.match(p, /deux exigences explicites de la demande s'excluent-elles/);
  assert.match(p, /répondez\s+WAIT_FOR_DEEP_VALIDATION en disant lesquelles/);
  assert.match(p, /ce cas passe avant toute question, et aucune\s+question ne peut le résoudre/);
});

test('V221C-02 / 03 / 04 : l’escalade ne remplace aucune des autres issues', () => {
  const p = FAST_PROMPT;
  /* Le contrôle est CONDITIONNEL : sans exclusion, la doctrine reprend la main. */
  assert.match(p, /Si non, poursuivez avec la doctrine/);
  /* Et les issues restent distinctes et disponibles. */
  assert.match(p, /Types possibles : ACKNOWLEDGE/);
  assert.match(p, /Demander une précision est le dernier recours, jamais le premier/);
  assert.match(p, /Si non, ne la posez pas, même si l'information manque/);
  /* WAIT garde sa réserve : le contrôle ne l'a pas banalisé. */
  assert.match(p, /WAIT_FOR_DEEP_VALIDATION est EXCEPTIONNEL, et ce n'est pas « je ne suis pas sûr »/);
  assert.equal(FAST_INTERACTION_TYPES.includes('WAIT_FOR_DEEP_VALIDATION'), true);
});

test('V221C-05 : aucun domaine, aucun seuil, aucun exemple dans la clause ajoutée', () => {
  const p = FAST_PROMPT;
  const clause = p.slice(p.indexOf('PREMIER CONTRÔLE, AVANT TOUT LE RESTE'),
    p.indexOf('AVANT DE QUESTIONNER — LA SUBSTITUTION'));
  for (const mot of ['page', 'pages', 'mot', 'mots', 'voyage', 'budget', 'santé', 'code', 'document']) {
    assert.equal(new RegExp(`\\b${mot}\\b`, 'i').test(clause), false, `« ${mot} » n’a rien à faire dans la clause`);
  }
  assert.equal(/\d/.test(clause), false, 'aucun chiffre : aucun seuil');
  assert.equal(/score|seuil|threshold|complexity/i.test(p), false, 'aucune notation de complexité');
});

test('V221C-06 : l’escalade atteint le plan profond, qui décide — et c’est le cas nominal', () => {
  /* AVANT E1, ce test vérifiait qu'une escalade « ne verrouille rien », par opposition à un accusé
     de réception qui, lui, verrouillait. Cette opposition n'existe plus : AUCUNE sortie du plan
     rapide ne verrouille quoi que ce soit, et l'escalade est devenue le cas nominal plutôt que
     l'exception. Le relevé de l'orchestrateur le dit désormais sans condition. */
  assert.match(orchestrateur, /semantic_deep_calls: 1/);
  assert.match(orchestrateur, /event: "readiness_authority"/);
  assert.equal(/canonicalDecision/.test(orchestrateur), false, 'plus aucune décision canonique transportée');
});
