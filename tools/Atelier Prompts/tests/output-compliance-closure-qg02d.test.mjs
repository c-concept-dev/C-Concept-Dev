/* ADN-QG-02D — FERMETURE DE LA CONFORMITÉ DE SORTIE
 * ============================================================================
 *
 * Ce lot ne construit rien de neuf : il enlève. Deux dettes portaient le même
 * risque — qu'un verdict de conformité soit prononcé par quelqu'un d'autre que
 * le moteur qui sait ce qu'il a vérifié.
 *
 *   Dette 1 — DEUX implémentations exportaient `validateOutputAgainstCanonicalContract`.
 *   Dans l'agrégat du runtime, la seconde écrasait la première : en QG-02B, le
 *   chemin Rapide appelait le prototype de QG-00 en croyant appeler le moteur.
 *   L'esquisse est supprimée, pas enveloppée : un wrapper aurait conservé deux
 *   chemins de lecture pour une seule vérité.
 *
 *   Dette 2 — le contrôle historique conclut « conforme » dès qu'aucun contrôle
 *   n'a ÉCHOUÉ, en ignorant ceux restés hors de portée. Il ne prononce plus rien
 *   là où un contrat canonique gouverne — y compris sur la branche de réponse
 *   tronquée, dernier endroit qui l'avait conservé.
 *
 * Ce que ces tests vérifient, au fond, tient en une phrase : personne ne peut
 * plus dire « conforme » sans l'avoir établi.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OUTPUT_COMPLIANCE_GATE_VERSION,
  OUTPUT_GATE_STATUSES,
  OUTPUT_VIOLATION_CODES,
  validateOutputAgainstCanonicalContract
} from '../core/adn/output-compliance-gate.js';
import * as PROMPT_GATE from '../core/adn/prompt-contract-gate.js';
import { analyseFixture, compileWith } from './archcompiler-harness.helper.mjs';
import { createRapideHarness } from './rapide-assembler-harness.helper.mjs';
import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const RUNTIME = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const OUTPUT_GATE_SRC = fs.readFileSync(path.join(root, 'core/adn/output-compliance-gate.js'), 'utf8');
const PROMPT_GATE_SRC = fs.readFileSync(path.join(root, 'core/adn/prompt-contract-gate.js'), 'utf8');
const BUILD_SRC = fs.readFileSync(path.join(root, 'tools/build-adn-browser-runtime.mjs'), 'utf8');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
const ENVOI = HTML.slice(HTML.indexOf('async function envoyerApi(){'), HTML.indexOf('async function envoyerApi(){') + 14000);

/* ---- fixtures des deux chemins ------------------------------------------ */
async function rapide({ demande = 'Donne exactement 7 exemples sous forme de liste.', materiau = '', muter } = {}) {
  const h = createRapideHarness({ demande, materiau });
  const base = canonicalFrom(oprieReadyTurn({}), { request_id: 'qg02d', original_request: demande });
  if (muter) muter(base);
  h.context.rapideAppliquerContratCanonique(base);
  await h.evaluate('copierRapideAdaptatif')();
  return h;
}
const rControler = (h, texte) => h.evaluate('rapideControleSortie')(h.evaluate('rapideDernierePublication').prompt, texte);

function architecte({ analyse = analyseFixture(), demande = 'Demande de fermeture.', muter } = {}) {
  const r = compileWith({ demande, analyse });
  if (muter) muter(r.contract);
  return r;
}
const aControler = (r, texte) => r.harness.evaluate('window.__ARCHITECTE_V10__.controleSortie')(r.contract, texte);

const codes = (v) => (v.violations || []).map((x) => x.code);
const verif = (v, id) => (v.verifications || []).find((x) => x.id === id) || null;
const SEPT = Array.from({ length: 7 }, (_, i) => `- élément ${i + 1}`).join('\n');
const QUANTITE = (n) => (c) => { c.quantities = [{ target: 'éléments', unit: null, exact: n, min: null, max: null, source: 'test' }]; };

/* ======================================================================== *
 * §36 — UNE SEULE IMPLÉMENTATION
 * ======================================================================== */

test('T-QG02D-01 la conformité de sortie a une source unique', () => {
  const implementations = ['output-compliance-gate.js', 'prompt-contract-gate.js', 'engine-adapters.js', 'rapide-canonical-enrichment.js', 'arch-canonical-enrichment.js']
    .filter((f) => /export function validateOutputAgainstCanonicalContract/.test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));
  assert.deepEqual(implementations, ['output-compliance-gate.js'], 'OUTPUT_QG_SOURCE_IMPLEMENTATION_COUNT = 1');
  assert.equal(typeof validateOutputAgainstCanonicalContract, 'function');
  assert.equal(OUTPUT_COMPLIANCE_GATE_VERSION, '1.0');
});

test('T-QG02D-02 une seule implémentation est compilée et exposée au navigateur', () => {
  assert.equal((RUNTIME.match(/function validateOutputAgainstCanonicalContract/g) || []).length, 1,
    'une seule implémentation compilée dans le bundle');
  assert.equal((RUNTIME.match(/\.\.\.OUTPUTQG/g) || []).length, 1, 'OUTPUT_QG_RUNTIME_EXPOSED_COUNT = 1');
  assert.ok(RUNTIME.includes('validateOutputAgainstCanonicalContract'));
});

test('T-QG02D-03 le prototype de QG-00 a disparu, il n’a pas été enveloppé', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(PROMPT_GATE, 'validateOutputAgainstCanonicalContract'), false,
    'le gate de prompt n’exporte plus de conformité de sortie');
  assert.equal(/validateOutputAgainstCanonicalContract/.test(sansCommentaires(PROMPT_GATE_SRC)), false,
    'aucune trace de code : ni implémentation, ni délégation, ni ré-export');
  /* Et ce module ne traite plus que la frontière pré-exécution. */
  assert.equal(typeof PROMPT_GATE.validatePromptAgainstCanonicalContract, 'function');
});

test('T-QG02D-04 les tests de QG-00 éprouvent le moteur unique', () => {
  const qg00 = fs.readFileSync(path.join(root, 'tests/prompt-contract-gate-qg00.test.mjs'), 'utf8');
  assert.ok(/validateOutputAgainstCanonicalContract[\s\S]{0,200}from '\.\.\/core\/adn\/output-compliance-gate\.js'/.test(qg00),
    'la conformité de sortie est importée du moteur unique');
  assert.equal(/validateOutputAgainstCanonicalContract[\s\S]{0,300}from '\.\.\/core\/adn\/prompt-contract-gate\.js'/.test(qg00), false);
});

test('T-QG02D-05 aucun nom ne peut plus en masquer un autre dans l’agrégat', () => {
  /* L'agrégat est dérivé de la liste des modules et les étale dans l'ordre :
     deux modules exportant le même nom se masqueraient silencieusement. */
  const listes = [...BUILD_SRC.matchAll(/exports: \[([^\]]*)\]/g)]
    .map((m) => m[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean));
  const vus = new Map();
  const collisions = [];
  listes.forEach((noms, i) => noms.forEach((n) => {
    if (vus.has(n) && vus.get(n) !== i) collisions.push(n);
    vus.set(n, i);
  }));
  assert.deepEqual(collisions, [], `noms exportés par deux modules : ${collisions.join(', ')}`);
});

test('T-QG02D-06 les deux taxonomies restent distinctes et sans doublon', () => {
  assert.equal((RUNTIME.match(/const OUTPUT_VIOLATION_CODES\s*=/g) || []).length, 1);
  assert.equal((RUNTIME.match(/const OUTPUT_GATE_STATUSES\s*=/g) || []).length, 1);
  for (const projection of ['MISSING_REQUIRED_PROJECTION', 'LOCK_MISMATCH', 'UNSUPPORTED_INSTRUCTION', 'OUTPUT_REQUIREMENT_MISMATCH']) {
    assert.equal(OUTPUT_VIOLATION_CODES.includes(projection), false, projection);
  }
  for (const sortie of ['MISSING_REQUIRED_OUTPUT', 'OUTPUT_QUANTITY_MISMATCH', 'PROVENANCE_REQUIREMENT_FAILED']) {
    assert.equal(PROMPT_GATE.VIOLATION_CODES.includes(sortie), false, sortie);
  }
});

/* ======================================================================== *
 * §37 — LE CONTRÔLE HISTORIQUE N’EST PLUS UNE AUTORITÉ CONCURRENTE
 * ======================================================================== */

test('T-QG02D-07 sur le chemin canonique, le verdict historique n’est jamais affiché', () => {
  const claims = (ENVOI.match(/\$\('#api-conformite'\)\.innerHTML =/g) || []).length;
  const gouvernes = (ENVOI.match(/\? rendreConformiteSortie\(/g) || []).length;
  assert.equal(claims, 2, 'deux endroits affichent un verdict de conformité');
  assert.equal(gouvernes, claims, 'OUTPUT_COMPLIANCE_AUTHORITIES = 1 : chacun est gouverné par le verdict canonique');
});

test('T-QG02D-08 le contrôle historique ne peut plus produire un faux succès', async () => {
  const h = await rapide({ demande: 'Rédige une note de synthèse.' });
  const v = rControler(h, 'Une note parfaitement rédigée.');
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(h.evaluate('qgSortieCertifie')(v), false);

  /* Le défaut du contrôle historique, mesuré sur son propre résultat : sa
     conclusion ne regarde que les échecs et ignore les non-vérifiables. */
  const legacy = h.evaluate('verifierConformite')('Une note.', h.evaluate('contratDuPrompt')(
    h.evaluate('contexte')('Rédige une note de synthèse.', 'report', 'minimal', {}), ['role', 'controle']
  ), {});
  assert.equal(legacy.conforme, legacy.echecs === 0, 'le défaut historique existe toujours…');
  assert.equal(/Conforme au contrat déclaré/.test(h.evaluate('rendreConformiteSortie')(v)), false,
    '…mais il ne s’exprime plus là où un contrat canonique gouverne');
});

test('T-QG02D-09 une vérification incomplète ne peut pas être affichée comme conforme', async () => {
  const h = await rapide({ demande: 'Rédige une note de synthèse.' });
  const v = rControler(h, 'Une note.');
  const rendu = h.evaluate('rendreConformiteSortie')(v);
  assert.ok(/pas certifié conforme/.test(rendu));
  for (const mot of ['Conforme au contrat déclaré', 'VALIDÉ', 'CERTIFIÉ']) {
    assert.equal(rendu.includes(mot), false, `mot interdit dans un verdict incomplet : ${mot}`);
  }
});

test('T-QG02D-10 la branche tronquée obéit désormais à la même règle', () => {
  const posCatch = ENVOI.indexOf('}catch(err){');
  const branche = ENVOI.slice(posCatch);
  assert.ok(/rapideControleSortie\(prompt, corps\)/.test(branche),
    'le texte partiel exposé est contrôlé comme le texte complet');
  assert.ok(/verdictTronque\s*\?\s*rendreConformiteSortie\(verdictTronque\)/.test(branche.replace(/\s+/g, ' ')),
    'et c’est le verdict canonique qui gouverne son affichage');
  /* Le chemin libre garde le contrôle historique : il n’entre en contradiction
     avec rien, faute de contrat canonique. */
  assert.ok(/: rendreConformite\(conf\)/.test(branche));
});

test('T-QG02D-11 le contrôle historique reste un fournisseur de DÉTAIL, jamais de verdict', () => {
  /* Son résultat sert encore au prompt de correction, qui a besoin de la liste
     des contrôles — pas de leur conclusion. */
  assert.ok(HTML.includes('construirePromptCorrection(etat.derniereReponse, etat.contrat, etat.derniereConformite)'));
  /* Mais l'état qui porte la conformité de la sortie est distinct. */
  assert.ok(ENVOI.includes('etat.derniereConformiteSortie = verdictSortie'));
  assert.ok(ENVOI.includes('etat.derniereConformiteSortie = verdictTronque'));
});

/* ======================================================================== *
 * §38 — LES QUATRE STATUTS, DE BOUT EN BOUT, SUR RAPIDE
 * ======================================================================== */

test('T-QG02D-12 Rapide — une sortie conforme est déclarée conforme', async () => {
  const h = await rapide({ demande: 'Produis un json avec 3 champs.' });
  const v = rControler(h, '{"a":1,"b":2,"c":3}');
  assert.equal(v.status, 'PASS', JSON.stringify(codes(v)));
  assert.equal(h.evaluate('qgSortieCertifie')(v), true);
});

test('T-QG02D-13 Rapide — des avertissements n’empêchent pas la conformité', async () => {
  const h = await rapide({ demande: 'Produis un json avec 3 champs.' });
  const runtime = h.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const v = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: h.evaluate('rapideDernierePublication').contract, output: '{"a":1}',
    checks: [{ id: 'heur-1', type: 'heuristic', blocking: false, rule: 'Style sobre.' }],
    execution_context: { format_vocabulary: h.evaluate('rapideVocabulaireStructurel')() }
  });
  assert.equal(v.status, 'PASS_WITH_WARNINGS');
  assert.equal(h.evaluate('qgSortieCertifie')(v), true);
});

test('T-QG02D-14 Rapide — ce qui n’a pas pu être vérifié n’est pas certifié', async () => {
  const h = await rapide({ demande: 'Rédige une note de synthèse.' });
  const v = rControler(h, 'Une note de synthèse.');
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(v.violations.length, 0, 'rien n’a échoué : quelque chose n’a pas pu être su');
  assert.ok(v.coverage.required_unverifiable > 0);
});

test('T-QG02D-15 Rapide — une sortie non conforme est déclarée non conforme', async () => {
  const h = await rapide({});
  const v = rControler(h, '- a\n- b\n- c');
  assert.equal(v.status, 'FAIL');
  assert.ok(codes(v).includes('OUTPUT_QUANTITY_MISMATCH'));
  assert.equal(h.evaluate('qgSortieCertifie')(v), false);
});

test('T-QG02D-16 Rapide — une erreur de transport reste une erreur d’exécution', () => {
  const branche = ENVOI.slice(ENVOI.indexOf('}catch(err){'));
  assert.ok(/Réponse tronquée/.test(branche) && /'erreur'/.test(branche));
  assert.equal(/rapideControleSortie\([^)]*err\b/.test(ENVOI), false,
    'aucune erreur de transport n’entre dans le contrôle de contrat');
});

test('T-QG02D-17 Rapide — un verdict défavorable ne relance jamais le fournisseur', async () => {
  const h = await rapide({});
  const avant = h.network.length;
  assert.equal(rControler(h, '- a').status, 'FAIL');
  assert.equal(h.network.length, avant, 'SECOND_PROVIDER_CALL_ON_QG_FAIL = NO');
});

/* ======================================================================== *
 * §39 — LES QUATRE STATUTS, DE BOUT EN BOUT, SUR ARCHITECTE
 * ======================================================================== */

test('T-QG02D-18 Architecte — une sortie conforme est déclarée conforme', () => {
  const r = architecte({ muter: (c) => { c.checks = []; c.obligations = []; c.output.format = null; c.semantic_lock_signals = { signals: [], signals_produced: true }; } });
  const v = aControler(r, 'Un livrable complet.');
  assert.equal(v.status, 'PASS', JSON.stringify(v.unverifiable));
  assert.equal(r.harness.evaluate('window.__ARCHITECTE_V10__.sortieCertifiee')(v), true);
});

test('T-QG02D-19 Architecte — des avertissements n’empêchent pas la conformité', () => {
  const r = architecte({ muter: (c) => {
    c.checks = [{ id: 'heur-1', type: 'heuristic', blocking: false, rule: 'Style sobre.' }];
    c.obligations = []; c.output.format = null; c.semantic_lock_signals = { signals: [], signals_produced: true };
  } });
  const v = aControler(r, 'Un livrable complet.');
  assert.equal(v.status, 'PASS_WITH_WARNINGS');
  assert.equal(r.harness.evaluate('window.__ARCHITECTE_V10__.sortieCertifiee')(v), true);
});

test('T-QG02D-20 Architecte — ce qui n’a pas pu être vérifié n’est pas certifié', () => {
  const r = architecte({});
  const v = aControler(r, 'Un livrable rigoureux et pertinent.');
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(r.harness.evaluate('window.__ARCHITECTE_V10__.sortieCertifiee')(v), false);
});

test('T-QG02D-21 Architecte — une sortie non conforme est déclarée non conforme', () => {
  const r = architecte({ muter: QUANTITE(7) });
  const v = aControler(r, '- a\n- b\n- c');
  assert.equal(v.status, 'FAIL');
  assert.ok(codes(v).includes('OUTPUT_QUANTITY_MISMATCH'));
});

test('T-QG02D-22 Architecte — une erreur de transport reste une erreur d’exécution', () => {
  const exec = HTML.slice(HTML.indexOf('async function archConstruireExecuter(){'), HTML.indexOf('const ARCH_SAUVEGARDE_VERSION='));
  const posCatch = exec.indexOf('}catch(err){');
  assert.equal(exec.slice(posCatch).includes('archControleSortie'), false);
  assert.ok(/Échec de l\\u2019ex(é|\\u00e9)cution/.test(exec.slice(posCatch)));
});

test('T-QG02D-23 Architecte — un verdict défavorable ne relance jamais le fournisseur', () => {
  const r = architecte({ muter: QUANTITE(7) });
  const avant = r.harness.network.length;
  assert.equal(aControler(r, '- a').status, 'FAIL');
  assert.equal(r.harness.network.length, avant, 'SECOND_PROVIDER_CALL_ON_QG_FAIL = NO');
});

/* ======================================================================== *
 * §40 — LA DISCIPLINE, SUR LES DEUX CHEMINS À LA FOIS
 * ======================================================================== */

/** Balaye les deux chemins avec les mêmes familles de contrôles. */
async function balayage() {
  const h = await rapide({});
  const r = architecte({});
  const runtimes = [
    { nom: 'rapide', runtime: h.evaluate('window.__ATELIER_ADN_RUNTIME__'), contrat: h.evaluate('rapideDernierePublication').contract },
    { nom: 'architecte', runtime: r.harness.runtime, contrat: r.contract }
  ];
  const familles = [
    { id: 's', type: 'semantic', blocking: true, rule: 'Analyse pertinente.' },
    { id: 'h', type: 'heuristic', blocking: false, rule: 'Style sobre.' },
    { id: 'n', type: 'not_verifiable', blocking: true, rule: 'Impression générale.' },
    { id: 'x', type: 'inconnu', blocking: true, rule: 'Règle exotique.' },
    { id: 'd', type: 'deterministic', blocking: true, rule: 'La quantité doit être correcte.' }
  ];
  const resultats = [];
  for (const { nom, runtime, contrat } of runtimes) {
    for (const check of familles) {
      resultats.push({ nom, check, v: runtime.validateOutputAgainstCanonicalContract({
        canonical_contract: contrat, output: SEPT, checks: [check], execution_context: { format_vocabulary: [] }
      }) });
    }
  }
  return resultats;
}

test('T-QG02D-24 aucun contrôle sémantique ne passe, sur aucun des deux chemins', async () => {
  const compte = (await balayage()).flatMap(({ v }) => v.verifications)
    .filter((x) => x.verifiability === 'SEMANTIC' && x.status === 'PASS').length;
  assert.equal(compte, 0, 'SEMANTIC_CHECKS_AUTO_PASSED = 0');
});

test('T-QG02D-25 aucun contrôle heuristique ne devient bloquant ni tenu', async () => {
  const heuristiques = (await balayage()).flatMap(({ v }) => v.verifications).filter((x) => x.verifiability === 'HEURISTIC');
  assert.ok(heuristiques.length > 0, 'la famille est bien exercée');
  assert.equal(heuristiques.filter((x) => x.status === 'PASS').length, 0, 'HEURISTIC_CHECKS_AUTO_PASSED = 0');
  assert.equal(heuristiques.filter((x) => x.blocking).length, 0, 'un contrôle indicatif ne bloque jamais');
});

test('T-QG02D-26 aucun contrôle non vérifiable ne passe', async () => {
  const compte = (await balayage()).flatMap(({ v }) => v.verifications)
    .filter((x) => x.verifiability === 'NOT_VERIFIABLE' && x.status === 'PASS').length;
  assert.equal(compte, 0, 'NOT_VERIFIABLE_CHECKS_AUTO_PASSED = 0');
  /* Et aucun succès n’existe hors des deux niveaux vérifiables ici. */
  const faux = (await balayage()).flatMap(({ v }) => v.verifications)
    .filter((x) => x.status === 'PASS' && !['DETERMINISTIC', 'STRUCTURAL'].includes(x.verifiability)).length;
  assert.equal(faux, 0, 'FAKE_PASS_PATHS = 0');
});

test('T-QG02D-27 un échec vérifiable domine une vérification incomplète', async () => {
  const h = await rapide({});
  const runtime = h.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const v = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: h.evaluate('rapideDernierePublication').contract, output: '- a\n- b',
    checks: [{ id: 's', type: 'semantic', blocking: true, rule: 'Pertinence.' }],
    execution_context: { format_vocabulary: h.evaluate('rapideVocabulaireStructurel')() }
  });
  assert.equal(v.status, 'FAIL');
  assert.ok(v.coverage.required_unverifiable > 0, 'le non-vérifiable subsiste, il ne disparaît pas');
});

test('T-QG02D-28 la présence d’une provenance n’est jamais sa véracité', () => {
  const contrat = {
    evidence: { provenance: [{ statement_id: 'p1', claim: 'A', verification_status: 'external_unverified' }] },
    output: {}, quantities: [], checks: [], obligations: [], semantic_lock_signals: { signals: [] }
  };
  const v = validateOutputAgainstCanonicalContract({
    canonical_contract: contrat,
    output: { text: 'Tracé.', provenance: [{ statement_id: 'p1', verification_status: 'external_unverified' }] }
  });
  assert.equal(verif(v, 'output-provenance-present').status, 'PASS');
  assert.notEqual(verif(v, 'output-provenance-truth').status, 'PASS', 'PROVENANCE_TRUTH_FAKE_PASS = NO');
  /* Et un statut promu est détecté. */
  const promu = validateOutputAgainstCanonicalContract({
    canonical_contract: contrat,
    output: { text: 'Tracé.', provenance: [{ statement_id: 'p1', verification_status: 'verified' }] }
  });
  assert.equal(promu.status, 'FAIL');
});

test('T-QG02D-29 aucune forme de sortie n’est déduite d’un nom de format', () => {
  const code = sansCommentaires(OUTPUT_GATE_SRC);
  for (const nom of ['tableau', 'liste', 'rapport', 'courriel', 'report', 'article']) {
    assert.equal(new RegExp(`['"]${nom}['"]`).test(code), false, `nom de format en dur : ${nom}`);
  }
  /* Le vocabulaire est injecté ; sans lui, un format reste non vérifiable. */
  const v = validateOutputAgainstCanonicalContract({
    canonical_contract: { output: { format: 'tableau_comparatif' }, quantities: [], checks: [], obligations: [], evidence: {}, semantic_lock_signals: { signals: [] } },
    output: '| a |\n|---|\n| 1 |'
  });
  assert.equal(verif(v, 'output-format').status, 'NOT_VERIFIABLE');
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
});

test('T-QG02D-30 un mot dans un libellé ne remplace jamais une mesure', () => {
  const contrat = { output: {}, quantities: [], checks: [], obligations: [], evidence: {}, semantic_lock_signals: { signals: [] } };
  const parLeMot = { id: 'd', type: 'deterministic', blocking: true, rule: 'La quantité de points doit être correcte.' };
  const sans = validateOutputAgainstCanonicalContract({ canonical_contract: contrat, output: SEPT, checks: [parLeMot] });
  assert.equal(verif(sans, 'd').status, 'NOT_VERIFIABLE', 'TEXT_KEYWORD_WITHOUT_MEASURE_CAN_PASS = NO');
  const avec = validateOutputAgainstCanonicalContract({
    canonical_contract: contrat, output: SEPT, checks: [{ ...parLeMot, measure: { unit: 'items', exact: 7 } }]
  });
  assert.equal(verif(avec, 'd').status, 'PASS');
  assert.equal(/rule\s*\.\s*includes|rule\s*\.\s*match/.test(sansCommentaires(OUTPUT_GATE_SRC)), false);
});

/* ======================================================================== *
 * §41 — AUTORITÉ, SUR LES DEUX CHEMINS
 * ======================================================================== */

test('T-QG02D-31 le contrôle n’écrit aucun état OPRIE', async () => {
  const h = await rapide({});
  const contrat = h.evaluate('rapideDernierePublication').contract;
  assert.equal(contrat.executability.oprie_state, 'operational_request_ready');
  rControler(h, '');
  assert.equal(contrat.executability.oprie_state, 'operational_request_ready', 'OUTPUT_QG_OPRIE_WRITES = 0');
  assert.equal(/oprie_state\s*[:=][^=]/.test(sansCommentaires(OUTPUT_GATE_SRC)), false);
});

test('T-QG02D-32 le contrôle n’écrit aucune readiness', () => {
  assert.equal(/\b(readiness|execution_ready)\s*[:=][^=]/.test(sansCommentaires(OUTPUT_GATE_SRC)), false,
    'OUTPUT_QG_READINESS_WRITES = 0');
});

test('T-QG02D-33 le contrôle n’écrit aucune route', () => {
  assert.equal(/\b(route|routing|engine_choice)\s*[:=][^=]/.test(sansCommentaires(OUTPUT_GATE_SRC)), false,
    'OUTPUT_QG_ROUTE_WRITES = 0');
});

test('T-QG02D-34 le contrat canonique n’est jamais muté, sur aucun des deux chemins', async () => {
  const h = await rapide({});
  const cR = h.evaluate('rapideDernierePublication').contract;
  const avantR = JSON.stringify(cR);
  rControler(h, SEPT);
  assert.equal(JSON.stringify(cR), avantR);

  const r = architecte({});
  const avantA = JSON.stringify(r.contract);
  aControler(r, SEPT);
  assert.equal(JSON.stringify(r.contract), avantA, 'OUTPUT_QG_CANONICAL_MUTATIONS = 0');
});

test('T-QG02D-35 la sortie n’est jamais réécrite', async () => {
  const h = await rapide({});
  const texte = 'Un livrable exact — é à ü.';
  rControler(h, texte);
  assert.equal(texte, 'Un livrable exact — é à ü.', 'OUTPUT_QG_OUTPUT_REWRITES = 0');
  for (const interdit of ['repair', 'regenerate', 'appendMissing', 'fixOutput']) {
    assert.equal(sansCommentaires(OUTPUT_GATE_SRC).toLowerCase().includes(interdit.toLowerCase()), false, interdit);
  }
});

test('T-QG02D-36 le contrôle n’appelle aucun fournisseur, et rien de flou', () => {
  const code = sansCommentaires(OUTPUT_GATE_SRC);
  for (const interdit of ['fetch(', 'XMLHttpRequest', 'anthropic', 'openai', 'groq', 'apiKey', 'api_key',
                          'embedding', 'cosine', 'similarity', 'levenshtein', 'fuzzy', 'case_id']) {
    assert.equal(code.toLowerCase().includes(interdit.toLowerCase()), false, `autorité interdite : ${interdit}`);
  }
  assert.equal(/\bscore\s*[:=][^'"]/.test(code), false, 'aucun score ne décide d’un statut');
});

test('T-QG02D-37 un verdict défavorable ne pose aucune question', () => {
  assert.equal(/question|clarification/i.test(sansCommentaires(OUTPUT_GATE_SRC)), false);
  const integrations = [
    HTML.slice(HTML.indexOf('const QG_SORTIE_MESSAGES='), HTML.indexOf('async function envoyerApi(){')),
    HTML.slice(HTML.indexOf('const ARCH_QG_SORTIE_MESSAGES='), HTML.indexOf('async function archConstruireExecuter(){'))
  ].map(sansCommentaires);
  for (const bloc of integrations) {
    for (const interdit of ['confirm(', 'prompt(', 'clarification']) {
      assert.equal(bloc.includes(interdit), false, `dialogue interdit : ${interdit}`);
    }
  }
});

test('T-QG02D-38 le contrôle est terminal : il ne rouvre aucune boucle', () => {
  const arch = HTML.slice(HTML.indexOf('async function archConstruireExecuter(){'), HTML.indexOf('const ARCH_SAUVEGARDE_VERSION='));
  const apres = arch.slice(arch.indexOf('archControleSortie('));
  for (const interdit of ['archApi(', 'archApiCoeur(', 'appelFournisseur(', 'archCompiler(']) {
    assert.equal(apres.includes(interdit), false, `relance interdite après le contrôle : ${interdit}`);
  }
  assert.ok(OUTPUT_GATE_STATUSES.length === 4, 'aucune cinquième sémantique parallèle');
});
