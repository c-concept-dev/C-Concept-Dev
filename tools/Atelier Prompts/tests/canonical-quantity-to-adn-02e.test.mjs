/* 02E — UNE QUANTITÉ DÉJÀ COMPRISE PAR OPRIE N'EST PLUS REDÉCOUVERTE DEPUIS LE TEXTE BRUT.
 * ============================================================================
 *
 * 02D avait établi, sur trois sorties d'Arbitre réelles, que l'Arbitre comprend correctement une
 * quantité et la pose en contrainte confirmée — « Exactement cinq paragraphes » — mais que le signal
 * quantité de l'ADN Rapide ne venait pas de là : il venait de `original_request`, relu par des
 * motifs qui n'acceptaient que des chiffres. « 5 paragraphes » produisait donc une contrainte, et
 * « cinq paragraphes » aucune. Deux écritures du même nombre, deux comportements.
 *
 * Ce que cette suite fige : la contrainte canonique est la source, l'écriture du nombre est
 * indifférente, et la modalité survit. Aucun mot de domaine n'a été ajouté : ni « paragraphes », ni
 * « slogans », ni aucune unité — `UNITES_COMPTABLES` est inchangé. Le seul vocabulaire injecté est
 * un inventaire grammatical clos de nombres écrits.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveQuantityFromRequest, enrichRapidCanonicalContract } from '../core/adn/rapide-canonical-enrichment.js';
import { collectCanonicalRequirements } from '../core/adn/prompt-contract-gate.js';
import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');

/* Le vocabulaire est INJECTÉ, comme en production : ces tests n'en déclarent aucun de leur cru,
   ils reprennent celui que le produit fournit. */
const NOMBRES = (() => {
  const bloc = HTML.slice(HTML.indexOf('const NOMBRES_ECRITS = Object.freeze({'));
  const corps = bloc.slice(bloc.indexOf('{'), bloc.indexOf('});') + 1);
  return Function(`return ${corps}`)();
})();
const UNITES = (() => {
  const i = HTML.indexOf('UNITES_COMPTABLES =');
  const brut = HTML.slice(i, HTML.indexOf(';', HTML.indexOf('scenarios?', i)));
  return brut.split('=').slice(1).join('=').split('+').map((s) => s.trim().replace(/^'|'$/g, '')).join('');
})();
const OPTS = { counting_units: UNITES, number_words: NOMBRES };

/** Contrat canonique réel, porteur des contraintes confirmées demandées. */
function contratAvec(contraintes, demande = 'Une demande.') {
  const turn = oprieReadyTurn({ state: 'operational_request_ready' });
  turn.operational_request_candidate = {
    ...turn.operational_request_candidate,
    confirmed_constraints: contraintes
  };
  return canonicalFrom(turn, { request_id: '02e', original_request: demande });
}
const quantiteDe = (contraintes, demande) =>
  list(enrichRapidCanonicalContract(contratAvec(contraintes, demande), OPTS).contract.quantities)[0] || null;
const list = (v) => (Array.isArray(v) ? v : []);

test('T-02E-01 : une quantité explicite du contrat canonique atteint l’ADN', () => {
  const q = quantiteDe(['Exactement cinq paragraphes'], 'Explique la photosynthèse en cinq paragraphes courts');
  assert.ok(q, 'une quantité canonique est dérivée');
  assert.equal(q.exact, 5);
  assert.equal(q.target, 'paragraphes', 'la cible est LUE dans la contrainte, jamais supposée');
  assert.equal(q.source, 'derived_deterministic');
});

test('T-02E-02 : un nombre écrit en mots atteint l’ADN', () => {
  for (const [texte, valeur, cible] of [
    ['Exactement dix slogans', 10, 'slogans'],
    ['Exactement cinq paragraphes', 5, 'paragraphes'],
    ['Exactement trois sections', 3, 'sections']
  ]) {
    const q = quantiteDe([texte]);
    assert.ok(q, `«${texte}» produit une quantité`);
    assert.equal(q.exact, valeur);
    assert.equal(q.target, cible);
  }
});

test('T-02E-03 : chiffres et lettres sont équivalents', () => {
  for (const [mots, chiffres] of [
    ['Exactement cinq paragraphes', 'Exactement 5 paragraphes'],
    ['Exactement dix slogans', 'Exactement 10 slogans']
  ]) {
    const a = quantiteDe([mots]);
    const b = quantiteDe([chiffres]);
    assert.ok(a && b, 'les deux écritures produisent une quantité');
    assert.deepEqual(
      { exact: a.exact, min: a.min, max: a.max, target: a.target },
      { exact: b.exact, min: b.min, max: b.max, target: b.target },
      `«${mots}» et «${chiffres}» doivent donner la MÊME contrainte`);
  }
});

test('T-02E-04 : la modalité exacte est préservée', () => {
  const q = quantiteDe(['Le livrable doit contenir exactement 20 points'],
    'Fais-moi une checklist de 20 points pour préparer un voyage');
  assert.equal(q.exact, 20, 'exactement 20 reste exactement 20');
  assert.equal(q.min, null, 'et ne devient JAMAIS « au moins 20 »');
  assert.equal(q.max, null);
});

test('T-02E-05 : la modalité minimum est préservée', () => {
  const q = quantiteDe(['Au moins trois options']);
  assert.equal(q.min, 3);
  assert.equal(q.exact, null, 'un minimum ne devient jamais une exactitude');
});

test('T-02E-06 : la modalité maximum est préservée', () => {
  const q = quantiteDe(['Moins de huit mots par slogan']);
  assert.equal(q.max, 8);
  assert.equal(q.exact, null);
  assert.equal(q.min, null);
});

test('T-02E-07 : la contrainte canonique est la source, la demande brute seulement un repli', () => {
  /* La demande brute dit « 20 points » sans modalité ; la contrainte canonique dit « exactement 12 ».
     C'est la contrainte qui doit gagner — sans fusion, sans moyenne. */
  const q = quantiteDe(['Exactement douze points'], 'Fais-moi une checklist de 20 points');
  assert.equal(q.exact, 12, 'la contrainte canonique l’emporte sur la demande brute');
  assert.equal(q.min, null, 'aucune fusion mathématique avec le 20 de la demande');

  /* Et la demande brute reste un repli utile quand aucune contrainte ne porte de quantité. */
  const repli = quantiteDe(['Registre chaleureux'], 'Donne exactement sept éléments');
  assert.ok(repli, 'sans contrainte quantitative, la demande brute est encore lue');
  assert.equal(repli.exact, 7);

  /* Une quantité déjà posée en amont (USER / ARCH) n’est jamais écrasée. */
  const base = contratAvec(['Exactement cinq paragraphes']);
  base.quantities = [{ target: 'chapitres', unit: null, exact: 3, min: null, max: null, source: 'user' }];
  const garde = enrichRapidCanonicalContract(base, OPTS).contract.quantities[0];
  assert.equal(garde.exact, 3, 'USER prime');
  assert.equal(garde.source, 'user');
});

test('T-02E-08 : un nombre métier n’est pas pris pour une quantité de livrable', () => {
  for (const texte of ['Le tempo doit être de 120 BPM', 'La température cible est 180 degrés',
                       'Le budget est de 5000 euros']) {
    assert.equal(quantiteDe([texte]), null, `«${texte}» ne doit produire aucune quantité de livrable`);
  }
  /* Et quand une modalité de dénombrement EST présente, la cible reste celle que la contrainte
     nomme : c'est ce qui empêche « 120 BPM » de devenir « 120 éléments ». */
  const q = quantiteDe(['Exactement 120 BPM']);
  assert.equal(q.target, 'BPM', 'la cible est celle du texte, jamais « éléments » par défaut');
});

test('T-02E-09 : aucun mot de domaine n’a été ajouté au lexique d’unités', () => {
  assert.doesNotMatch(UNITES, /paragraphes?/, 'aucun « paragraphes » ajouté');
  assert.doesNotMatch(UNITES, /slogans?/, 'aucun « slogans » ajouté');
  assert.doesNotMatch(UNITES, /\bmots?\b/, 'aucun « mots » ajouté');
  /* Le vocabulaire injecté est un inventaire de NOMBRES, clos et grammatical. */
  assert.equal(Object.values(NOMBRES).every(Number.isInteger), true);
  for (const mot of Object.keys(NOMBRES)) {
    assert.match(mot, /^[a-z]+$/, `${mot} est un nombre écrit, pas un terme métier`);
  }
});

test('T-02E-10 : le gate reçoit désormais une obligation quantitative', () => {
  for (const [contrainte, attendu] of [
    ['Exactement cinq paragraphes', 5],
    ['Exactement dix slogans', 10],
    ['Le livrable doit contenir exactement 20 points', 20]
  ]) {
    const enr = enrichRapidCanonicalContract(contratAvec([contrainte]), OPTS).contract;
    const exigence = collectCanonicalRequirements(enr).find((r) => r.id === 'quantity');
    assert.ok(exigence, `«${contrainte}» arme une exigence de quantité`);
    assert.equal(exigence.status, 'REQUIRED', 'et elle n’est plus NOT_APPLICABLE');
    assert.equal(exigence.blocking, true);
    assert.equal(exigence.expectation.exact, attendu, 'avec la valeur exacte du contrat');
  }
});

test('T-02E-11 : une quantité inconnue du correctif fonctionne sans ajout', () => {
  /* §15 — généralité sémantique : ni « sept », ni « éléments » n’ont été traités spécialement. */
  const q = quantiteDe(['Produis exactement sept éléments']);
  assert.ok(q, 'une formulation jamais utilisée dans le correctif est dérivée');
  assert.equal(q.exact, 7);
  assert.equal(q.target, 'éléments', 'la cible garde ses accents : elle est rendue à la personne');
});

test('T-02E-12 : la dérivation ne lit plus la demande brute quand le contrat porte la contrainte', () => {
  const source = HTML.slice(HTML.indexOf('function enrichRapidCanonicalContract'),
                            HTML.indexOf('/* ---- OBLIGATIONS'));
  assert.match(source, /intent\)\.explicit_constraints/, 'les contraintes canoniques sont lues');
  const posContrainte = source.indexOf('explicit_constraints');
  const posBrute = source.indexOf("deriveQuantityFromRequest(request");
  assert.ok(posContrainte > -1 && posBrute > -1, 'les deux sources existent');
  assert.ok(posContrainte < posBrute, 'et la contrainte canonique est essayée AVANT la demande brute');
});
