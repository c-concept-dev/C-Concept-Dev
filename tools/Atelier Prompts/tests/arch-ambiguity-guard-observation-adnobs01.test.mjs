/* ADN-OBS-01 — LA DERNIÈRE GARDE BLOQUANTE, RENDUE MESURABLE SANS ÊTRE TOUCHÉE.
 * ============================================================================
 *
 * LE PROBLÈME, ÉTABLI PAR MESURE. Quatre comparaisons de cardinalité ont perdu leur autorité de
 * blocage, chacune sur preuve d'un échange réel. Il en reste UNE :
 *
 *   list(comprehension.ambiguites).length
 *     > list(critical_missing).length + list(substitutable_missing).length
 *
 * Et elle n'est pas auditable depuis les fichiers d'échange. Ses deux opérandes canoniques naissent
 * de `routeIssues(arbiterOutput.issues)` côté OPRIE, et le contrat COMPACT remis à l'Architecte ne
 * les transporte pas — aucune de ses quinze clés. Un audit conduit sur l'export ne peut donc que
 * SUPPOSER `known_issues_total` nul. Sur les quatre cas précédents cette supposition n'a jamais
 * changé un verdict, `ambiguites` valant zéro partout ; sur un cas qui déclare une ambiguïté, elle
 * déciderait du résultat. Une supposition ne peut pas fonder un verdict.
 *
 * CE QUE CE LOT FAIT, ET RIEN DE PLUS. Il COMPTE. Aucune décision, aucun signal, aucune écriture,
 * aucune garde déplacée. `diagnoseAgainstOprie`, `adnValidatePostOprie`, les comparaisons,
 * `registerDivergence` et `ARCH_ENRICHABLE_PATHS` sortent de ce lot à l'octet près.
 *
 * LE CHOIX QUI COMPTE : CONSTATER, PAS PRÉDIRE. `predicate_triggered` est recalculé pour être
 * rapporté ; `blocking_signal_emitted` est LU dans la liste de signaux que la garde a réellement
 * produite. Si les deux divergeaient, l'observation le montrerait. Cette session a déjà payé le prix
 * d'un relevé qui annonçait un rejet là où rien n'avait été rejeté.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPostOprieValidator, oprieReadyTurn, coherentAnalysis, canonicalFrom } from './post-oprie-validation-harness.helper.mjs';
import {
  observeAmbiguityGuard, ARCH_AMBIGUITY_GUARD_EVENT, createArchEnrichmentAuditView,
  enrichCanonicalContractFromArchAnalysis, validateArchCanonicalEnrichment, ARCH_ENRICHABLE_PATHS
} from '../core/adn/arch-canonical-enrichment.js';

const module_ = fs.readFileSync(new URL('../core/adn/arch-canonical-enrichment.js', import.meta.url), 'utf8');
const artefact = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');

/** Un tour OPRIE portant des issues, donc des opérandes canoniques NON nulles. */
const tourAvecIssues = (critiques = 0, substituables = 0) => oprieReadyTurn({
  issues: [
    ...Array.from({ length: critiques }, (_, i) => ({
      id: `C${i}`, type: 'missing_information', kind: null, description: `Critique ${i}.`,
      impact: 'material', substitutable: false, recommended_treatment: 'question'
    })),
    ...Array.from({ length: substituables }, (_, i) => ({
      id: `S${i}`, type: 'missing_information', kind: null, description: `Substituable ${i}.`,
      impact: 'material', substitutable: true, recommended_treatment: 'assumption'
    }))
  ]
});
const analyseAvecAmbiguites = (n) => {
  const a = coherentAnalysis();
  a.comprehension.ambiguites = Array.from({ length: n }, (_, i) => `AMB_${i}`);
  return a;
};

/* ==========================================================================
 * LES CINQ NOMBRES, ET ILS SONT JUSTES
 * ======================================================================= */

test('T-AOBS-01 : les deux opérandes canoniques sont comptées, celles que l’export ne porte pas', () => {
  const base = canonicalFrom(tourAvecIssues(2, 3));
  /* Ce que `routeIssues` a produit, et que le contrat compact n’exporte jamais. */
  assert.equal(base.executability.critical_missing.length, 2);
  assert.equal(base.executability.substitutable_missing.length, 3);

  const o = observeAmbiguityGuard(base, analyseAvecAmbiguites(4), []);
  assert.equal(o.event, ARCH_AMBIGUITY_GUARD_EVENT);
  assert.equal(o.canonical_critical_missing_count, 2);
  assert.equal(o.canonical_substitutable_missing_count, 3);
  assert.equal(o.known_issues_total, 5, 'la somme, et non l’un des deux');
  assert.equal(o.arch_ambiguities_count, 4);
  assert.equal(o.predicate_triggered, false, '4 > 5 est faux');
  assert.equal(o.request_id, base.request_id);
});

test('T-AOBS-02 : le prédicat rapporté est celui de la garde, sur toute la frontière', () => {
  /* Les deux côtés du seuil, et le seuil lui-même : une garde se vérifie à sa bordure. */
  for (const [critiques, substituables, ambiguites, attendu] of [
    [0, 0, 0, false], [0, 0, 1, true],
    [1, 0, 1, false], [1, 0, 2, true],
    [2, 3, 5, false], [2, 3, 6, true]
  ]) {
    const base = canonicalFrom(tourAvecIssues(critiques, substituables));
    const o = observeAmbiguityGuard(base, analyseAvecAmbiguites(ambiguites), []);
    assert.equal(o.known_issues_total, critiques + substituables);
    assert.equal(o.predicate_triggered, attendu,
      `${ambiguites} > ${critiques + substituables} doit valoir ${attendu}`);
  }
});

test('T-AOBS-03 : blocking_signal_emitted est CONSTATÉ, jamais prédit', () => {
  /* LA PROPRIÉTÉ LA PLUS IMPORTANTE DE CE LOT. Le champ est lu dans les signaux réels. On le prouve
     en lui passant des signaux qui CONTREDISENT le prédicat : l’observation rapporte ce qui est,
     pas ce qu’elle croit. Un relevé qui prédit masque exactement le défaut qu’on le paie à voir. */
  const base = canonicalFrom(tourAvecIssues(0, 0));
  const analyse = analyseAvecAmbiguites(2);

  const sansSignal = observeAmbiguityGuard(base, analyse, []);
  assert.equal(sansSignal.predicate_triggered, true, 'le prédicat, lui, est vrai');
  assert.equal(sansSignal.blocking_signal_emitted, false, 'mais aucun signal n’a été émis');

  const signalJuste = [{ signal: 'CONTRACT_INCONSISTENT', canonical_field: 'executability.substitutable_missing', arch_source_field: 'comprehension.ambiguites' }];
  assert.equal(observeAmbiguityGuard(base, analyse, signalJuste).blocking_signal_emitted, true);

  /* Un signal d’un AUTRE registre ne compte pas : le champ nomme cette garde, pas n’importe quelle. */
  const signalAutre = [{ signal: 'CONTRACT_INCONSISTENT', canonical_field: 'intent.objective', arch_source_field: 'comprehension.intention_principale' }];
  assert.equal(observeAmbiguityGuard(base, analyse, signalAutre).blocking_signal_emitted, false);
  const signalAutreType = [{ signal: 'EXECUTION_UNSAFE', canonical_field: 'executability.substitutable_missing', arch_source_field: 'comprehension.ambiguites' }];
  assert.equal(observeAmbiguityGuard(base, analyse, signalAutreType).blocking_signal_emitted, false);
});

test('T-AOBS-04 : le prédicat rapporté et le signal réel concordent sur le chemin de production', () => {
  /* Les deux mesures viennent de sources différentes — arithmétique d’un côté, liste de signaux de
     l’autre — et elles doivent concorder. C’est le test qui verrait une dérive future. */
  for (const [critiques, substituables, ambiguites] of [[0, 0, 0], [0, 0, 1], [1, 1, 2], [1, 1, 3], [0, 2, 2]]) {
    const base = canonicalFrom(tourAvecIssues(critiques, substituables));
    const analyse = analyseAvecAmbiguites(ambiguites);
    const { signals } = enrichCanonicalContractFromArchAnalysis(base, analyse);
    const o = observeAmbiguityGuard(base, analyse, signals);
    assert.equal(o.blocking_signal_emitted, o.predicate_triggered,
      `${ambiguites} vs ${critiques + substituables} : prédicat et signal réel doivent concorder`);
  }
});

/* ==========================================================================
 * AUCUN CONTENU, AUCUN EFFET
 * ======================================================================= */

test('T-AOBS-05 : l’observation ne porte que des nombres, un identifiant et deux booléens', () => {
  const base = canonicalFrom(tourAvecIssues(1, 1));
  const analyse = coherentAnalysis();
  analyse.comprehension.ambiguites = ['LE TEXTE SECRET D’UNE AMBIGUÏTÉ'];
  analyse.comprehension.intention_principale = 'UNE INTENTION QUI NE DOIT PAS FUIR';
  const o = observeAmbiguityGuard(base, analyse, []);

  assert.deepEqual(Object.keys(o).sort(), ['arch_ambiguities_count', 'blocking_signal_emitted',
    'canonical_critical_missing_count', 'canonical_substitutable_missing_count', 'event',
    'known_issues_total', 'predicate_triggered', 'request_id']);
  const serialise = JSON.stringify(o);
  for (const fuite of ['SECRET', 'AMBIGU', 'INTENTION', 'Critique 0', 'Substituable 0']) {
    assert.equal(serialise.includes(fuite), false, `« ${fuite} » ne doit pas fuir`);
  }
  for (const [k, v] of Object.entries(o)) {
    if (k === 'event' || k === 'request_id') continue;
    assert.ok(typeof v === 'number' || typeof v === 'boolean', `${k} est un nombre ou un booléen`);
  }
});

test('T-AOBS-06 : observer ne mute rien — ni la base, ni l’analyse, ni le contrat', () => {
  const base = canonicalFrom(tourAvecIssues(2, 2));
  const analyse = analyseAvecAmbiguites(3);
  const empreinteBase = JSON.stringify(base);
  const empreinteAnalyse = JSON.stringify(analyse);

  const { contract, signals } = enrichCanonicalContractFromArchAnalysis(base, analyse);
  observeAmbiguityGuard(base, analyse, signals);
  createArchEnrichmentAuditView(base, contract, signals, [], analyse);

  assert.equal(JSON.stringify(base), empreinteBase, 'la base canonique est intacte');
  assert.equal(JSON.stringify(analyse), empreinteAnalyse, 'l’analyse est intacte');
  assert.deepEqual(validateArchCanonicalEnrichment(base, contract, analyse).mutated_oprie_fields, []);
});

test('T-AOBS-07 : le verdict de la garde n’a pas changé — elle bloque et passe comme avant', () => {
  const { validateFromTurn } = loadPostOprieValidator();
  /* ELLE BLOQUE quand elle doit : une ambiguïté de plus que ce qu’OPRIE connaissait. */
  const tourVide = tourAvecIssues(0, 0);
  const bloque = validateFromTurn(analyseAvecAmbiguites(1), tourVide);
  assert.equal(bloque.ok, false, 'la dernière garde bloque toujours');
  assert.equal(bloque.signals[0].canonical_field, 'executability.substitutable_missing');
  assert.equal(bloque.signals[0].arch_source_field, 'comprehension.ambiguites');

  /* ELLE PASSE quand elle doit : autant d’ambiguïtés que d’issues connues. */
  const passe = validateFromTurn(analyseAvecAmbiguites(2), tourAvecIssues(1, 1));
  assert.equal(passe.ok, true, 'et elle laisse passer quand le compte ne dépasse pas');
  assert.deepEqual(passe.signals, []);
});

/* ==========================================================================
 * LE PÉRIMÈTRE, VÉRIFIÉ SUR LES OCTETS
 * ======================================================================= */

test('T-AOBS-08 : rien de ce que le lot s’interdisait n’a bougé', () => {
  /* La garde elle-même, mot pour mot, dans les DEUX implémentations. */
  assert.match(module_, /if \(list\(comprehension\.ambiguites\)\.length > knownIssues\) \{\n\s*signals\.push\(signal\('CONTRACT_INCONSISTENT', 'executability\.substitutable_missing',/);
  assert.match(artefact, /if\(list\(comprehension\.ambiguites\)\.length>knownIssues\)\n\s*push\('CONTRACT_INCONSISTENT','executability\.substitutable_missing','comprehension\.ambiguites'/);
  /* Le calcul des opérandes, inchangé de part et d'autre. */
  assert.match(module_, /const knownIssues = list\(base\.executability\.critical_missing\)\.length \+ list\(base\.executability\.substitutable_missing\)\.length;/);
  assert.match(artefact, /const knownIssues=list\(executability\.critical_missing\)\.length\+list\(executability\.substitutable_missing\)\.length;/);
  /* L'observateur n'écrit rien : aucune affectation, aucun push, dans son corps. */
  const corps = module_.slice(module_.indexOf('export function observeAmbiguityGuard'),
    module_.indexOf("/** Vue d'audit sans contenu utilisateur. */"));
  for (const interdit of ['.push(', 'signals.push', 'delete ', 'Object.assign']) {
    assert.equal(corps.includes(interdit), false, `l’observateur n’écrit pas (« ${interdit} »)`);
  }
  /* La liste blanche d'enrichissement n'a pas bougé. */
  assert.equal(ARCH_ENRICHABLE_PATHS.length, 19);
  /* Et l'émission côté artefact ne peut pas arrêter une préparation. */
  assert.match(artefact, /catch\(error\)\{\/\* Une observation qui échoue n'a pas le droit d'arrêter une préparation\. \*\/\}/);
  assert.match(artefact, /oprieState\.lastAmbiguityGuardObservation=runtime\.observeAmbiguityGuard\(base,analysis,result&&result\.signals\);/);
  /* ET RIEN N'EST IMPRIMÉ. T-CLEAN03-11 interdit `console.info` dans le frontend, et `console.warn`
     est réservé aux échecs attendus : une observation nominale n'y a pas sa place. Le relevé
     s'inspecte sur `oprieState`, il ne se journalise pas. */
  /* Ancré sur le CODE, pas sur le commentaire : le commentaire ci-dessus NOMME les appels interdits
     pour expliquer pourquoi ils le sont, et une tranche qui l'inclut s'accuse elle-même. */
  const emission = artefact.slice(artefact.indexOf("if(typeof runtime.observeAmbiguityGuard==='function')"),
    artefact.indexOf("Une observation qui échoue n'a pas le droit"));
  for (const bruit of ['console.info', 'console.log', 'console.debug', 'console.warn', 'debugger']) {
    assert.equal(emission.includes(bruit), false, `l’émission ne journalise pas (« ${bruit} »)`);
  }
});

test('T-AOBS-09 : la vue d’audit porte l’observation, et reste utilisable sans analyse', () => {
  /* RÉUTILISATION, PAS CANAL PARALLÈLE : `createArchEnrichmentAuditView` existait, et c'est elle qui
     porte déjà les comptes d'audit sans contenu. Ses appelants historiques ne passent pas l'analyse ;
     ils continuent de fonctionner, et reçoivent `null` plutôt qu'une valeur fabriquée. */
  const base = canonicalFrom(tourAvecIssues(1, 0));
  const analyse = analyseAvecAmbiguites(2);
  const { contract, signals } = enrichCanonicalContractFromArchAnalysis(base, analyse);

  const sansAnalyse = createArchEnrichmentAuditView(base, contract, signals);
  assert.equal(sansAnalyse.ambiguity_guard, null, 'sans analyse, rien n’est supposé');

  const avecAnalyse = createArchEnrichmentAuditView(base, contract, signals, [], analyse);
  assert.equal(avecAnalyse.ambiguity_guard.known_issues_total, 1);
  assert.equal(avecAnalyse.ambiguity_guard.arch_ambiguities_count, 2);
  assert.equal(avecAnalyse.ambiguity_guard.predicate_triggered, true);
  assert.equal(avecAnalyse.ambiguity_guard.blocking_signal_emitted, true);
  assert.deepEqual(avecAnalyse.mutated_oprie_fields, []);
  assert.equal(JSON.stringify(avecAnalyse).includes('AMB_'), false, 'aucun texte d’ambiguïté');
});
