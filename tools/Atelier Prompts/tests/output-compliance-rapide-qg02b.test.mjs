/* ADN-QG-02B — CONFORMITÉ DE SORTIE SUR LE CHEMIN RAPIDE
 * ============================================================================
 *
 * Le moteur de QG-02A est ici branché sur le chemin réel : la réponse du
 * fournisseur passe par lui avant d'être exposée. Ce qui est éprouvé n'est donc
 * plus une fonction isolée mais un SEUIL — après l'exécution, avant que quoi que
 * ce soit ne soit présenté comme conforme.
 *
 * Deux propriétés portent tout le sous-lot :
 *
 *   1. le contrôle ne s'applique QUE si la sortie répond au prompt qu'un contrat
 *      canonique a réellement produit. L'identité est vérifiée octet pour octet.
 *      Sur un prompt libre, il n'y a pas de contrat : le gate se tait plutôt que
 *      d'inventer une obligation ;
 *
 *   2. quand il parle, il est la seule autorité. Le contrôle historique déclare
 *      « conforme » dès qu'aucun contrôle n'a échoué — y compris lorsque
 *      plusieurs sont restés hors de portée. Les deux ne peuvent plus parler
 *      en même temps.
 *
 * CONSÉQUENCE MESURÉE, ASSUMÉE : la table des formats gelée ne déclare de forme
 * structurelle que pour JSON (`marqueur`). Tout autre format est donc
 * NON VÉRIFIABLE, et la plupart des sorties Rapide obtiennent
 * INCOMPLETE_VERIFICATION plutôt que PASS. Ce n'est pas une défaillance du
 * gate : c'est l'état réel de ce qui est déclaré. Élargir les formes
 * structurellement déclarées suppose de toucher une plage gelée, ce que ce
 * sous-lot ne fait pas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRapideHarness } from './rapide-assembler-harness.helper.mjs';
import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const GATE = fs.readFileSync(path.join(root, 'core/adn/output-compliance-gate.js'), 'utf8');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
/* Le bloc d'intégration Rapide, isolé de tout le reste du fichier. */
const INTEGRATION = sansCommentaires(
  HTML.slice(HTML.indexOf('const QG_SORTIE_MESSAGES='), HTML.indexOf('async function envoyerApi(){'))
);

/** Publie réellement un prompt Rapide, contrat canonique appliqué. */
async function publier({ demande, materiau = '', muter } = {}) {
  const h = createRapideHarness({ demande, materiau });
  const base = canonicalFrom(oprieReadyTurn({}), { request_id: 'qg02b', original_request: demande });
  if (muter) muter(base);
  h.context.rapideAppliquerContratCanonique(base);
  await h.evaluate('copierRapideAdaptatif')();
  return h;
}

const publication = (h) => h.evaluate('rapideDernierePublication');
const controler = (h, texte, prompt) =>
  h.evaluate('rapideControleSortie')(prompt === undefined ? publication(h).prompt : prompt, texte);
const verif = (v, id) => (v.verifications || []).find((x) => x.id === id) || null;
const codes = (v) => (v.violations || []).map((x) => x.code);

/* ======================================================================== *
 * §34 — LE SEUIL EST EN PLACE
 * ======================================================================== */

test('T-QG02B-01 le contrôle de sortie est actif sur le chemin Rapide', async () => {
  const h = await publier({ demande: 'Rédige une note de synthèse.' });
  const runtime = h.evaluate('window.__ATELIER_ADN_RUNTIME__');
  assert.equal(typeof runtime.validateOutputAgainstCanonicalContract, 'function', 'le moteur est embarqué');
  assert.equal(typeof h.evaluate('rapideControleSortie'), 'function', 'RAPIDE_OUTPUT_QG_ACTIVE = YES');
  assert.ok(publication(h), 'la publication relie le prompt à son contrat');
  const v = controler(h, 'Une réponse quelconque.');
  assert.ok(v && typeof v.status === 'string');
});

test('T-QG02B-02 le contrôle s’exécute après le fournisseur, sur sa réponse', () => {
  const bloc = HTML.slice(HTML.indexOf('async function envoyerApi(){'));
  const posAppel = bloc.indexOf('const res = await');
  const posGate = bloc.indexOf('rapideControleSortie(prompt, corps)');
  assert.ok(posAppel > -1 && posGate > posAppel, 'RAPIDE_OUTPUT_QG_AFTER_PROVIDER = YES');
  /* Et il reçoit bien la réponse brute du fournisseur, pas autre chose. */
  assert.ok(bloc.slice(posAppel, posGate).includes('const corps = res.texte'));
});

test('T-QG02B-03 le contrôle s’exécute avant toute exposition du résultat', () => {
  const bloc = HTML.slice(HTML.indexOf('async function envoyerApi(){'));
  const posGate = bloc.indexOf('rapideControleSortie(prompt, corps)');
  const posExpo = bloc.indexOf("$('#api-reponse').textContent =");
  assert.ok(posGate > -1 && posExpo > posGate, 'RAPIDE_OUTPUT_QG_BEFORE_EXPOSURE = YES');
});

test('T-QG02B-04 le chemin Rapide utilise le moteur QG-02A, sans en dupliquer une règle', () => {
  assert.ok(INTEGRATION.includes('runtime.validateOutputAgainstCanonicalContract'), 'délégation au noyau');
  /* Aucune logique de conformité de sortie n’est réécrite dans la page. */
  for (const regle of ['JSON.parse', 'NOT_VERIFIABLE', 'DETERMINISTIC', 'verifiability', 'countStructuralItems']) {
    assert.equal(INTEGRATION.includes(regle), false, `règle dupliquée dans la page : ${regle}`);
  }
});

test('T-QG02B-05 aucun second moteur de conformité de sortie n’existe', () => {
  const page = sansCommentaires(HTML);
  for (const interdit of ['validateRapidOutput', 'validateArchitectOutput', 'verifierConformiteCanonique']) {
    assert.equal(page.includes(interdit), false, `second moteur : ${interdit}`);
  }
  assert.equal((sansCommentaires(GATE).match(/export function validateOutputAgainstCanonicalContract/g) || []).length, 1);
});

/* ======================================================================== *
 * IMMUTABILITÉ ET AUTORITÉ
 * ======================================================================== */

test('T-QG02B-06 la sortie n’est jamais modifiée par le contrôle', async () => {
  const h = await publier({ demande: 'Donne exactement 7 exemples sous forme de liste.' });
  const texte = 'Une sortie exacte au dernier octet — accents compris : é à ü.';
  const v = controler(h, texte);
  assert.equal(texte, 'Une sortie exacte au dernier octet — accents compris : é à ü.');
  assert.equal(JSON.stringify(v).includes('dernier octet'), false, 'le contenu utilisateur ne ressort pas du gate');
  assert.equal(INTEGRATION.includes('corps ='), false, 'la page ne réaffecte jamais la réponse');
});

test('T-QG02B-07 le contrat canonique n’est jamais muté par le contrôle', async () => {
  const h = await publier({ demande: 'Donne exactement 7 exemples sous forme de liste.' });
  const avant = JSON.stringify(publication(h).contract);
  controler(h, '- a\n- b\n- c\n- d\n- e\n- f\n- g');
  assert.equal(JSON.stringify(publication(h).contract), avant, 'OUTPUT_QG_CANONICAL_MUTATIONS = 0');
});

test('T-QG02B-30 le contrôle n’écrit aucun état OPRIE', async () => {
  const h = await publier({ demande: 'Rédige une note.' });
  const contrat = publication(h).contract;
  assert.equal(contrat.executability.oprie_state, 'operational_request_ready');
  controler(h, '');
  assert.equal(contrat.executability.oprie_state, 'operational_request_ready', 'OUTPUT_QG_OPRIE_WRITES = 0');
  assert.equal(/oprie_state\s*[:=][^=]/.test(sansCommentaires(GATE)), false);
});

test('T-QG02B-31 le contrôle n’écrit aucune readiness', () => {
  const src = sansCommentaires(GATE);
  assert.equal(/\b(readiness|execution_ready)\s*[:=][^=]/.test(src), false, 'OUTPUT_QG_READINESS_WRITES = 0');
  assert.equal(/readiness/.test(INTEGRATION), false, 'la page d’intégration n’y touche pas davantage');
});

test('T-QG02B-32 le contrôle n’écrit aucune route', () => {
  const src = sansCommentaires(GATE);
  assert.equal(/\b(route|routing|engine_choice)\s*[:=][^=]/.test(src), false, 'OUTPUT_QG_ROUTE_WRITES = 0');
});

test('T-QG02B-33 le Prompt Contract Gate n’est pas touché', () => {
  const promptGate = fs.readFileSync(path.join(root, 'core/adn/prompt-contract-gate.js'), 'utf8');
  assert.ok(promptGate.includes('export function validatePromptAgainstCanonicalContract'));
  /* Aucune dépendance croisée : un chemin cité dans un commentaire n'en est pas
     une, seul un import en serait une. */
  assert.equal(/import[^;]*output-compliance-gate/.test(promptGate), false, 'aucune dépendance croisée introduite');
  assert.equal(sansCommentaires(GATE).includes('validatePromptAgainstCanonicalContract'), false,
    'les deux frontières restent distinctes');
});

test('T-QG02B-34 aucune réécriture ni réparation de la sortie', () => {
  for (const interdit of ['repair', 'regenerate', 'appendMissing', 'fixOutput', 'corrigerSortie']) {
    assert.equal(sansCommentaires(GATE).toLowerCase().includes(interdit.toLowerCase()), false, interdit);
    assert.equal(INTEGRATION.toLowerCase().includes(interdit.toLowerCase()), false, interdit);
  }
});

test('T-QG02B-35 le contrôle n’appelle aucun fournisseur', async () => {
  const h = await publier({ demande: 'Rédige une note.' });
  const avant = h.network.length;
  controler(h, 'Une réponse.');
  assert.equal(h.network.length, avant, 'OUTPUT_QG_PROVIDER_CALLS = 0');
  for (const interdit of ['fetch(', 'appelFournisseur', 'appelApi', 'XMLHttpRequest']) {
    assert.equal(sansCommentaires(GATE).includes(interdit), false, interdit);
  }
});

/* ======================================================================== *
 * §14 — LES QUATRE STATUTS SUR LE CHEMIN RÉEL
 * ======================================================================== */

test('T-QG02B-08 une sortie conforme est exposée normalement', async () => {
  const h = await publier({ demande: 'Produis un json avec 3 champs.' });
  assert.equal(publication(h).contract.output.format, 'json');
  const v = controler(h, '{"a":1,"b":2,"c":3}');
  assert.equal(v.status, 'PASS', JSON.stringify(codes(v)));
  assert.equal(h.evaluate('qgSortieCertifie')(v), true);
});

test('T-QG02B-09 des avertissements n’empêchent pas l’exposition', async () => {
  const h = await publier({ demande: 'Produis un json avec 3 champs.' });
  const contrat = publication(h).contract;
  const runtime = h.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const v = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: contrat, output: '{"a":1}',
    checks: [{ id: 'heur-1', type: 'heuristic', blocking: false, rule: 'Style sobre.' }],
    execution_context: { format_vocabulary: h.evaluate('rapideVocabulaireStructurel')() }
  });
  assert.equal(v.status, 'PASS_WITH_WARNINGS');
  assert.equal(h.evaluate('qgSortieCertifie')(v), true, 'un avertissement ne retire pas la conformité');
});

test('T-QG02B-10 une vérification incomplète n’est jamais présentée comme conforme', async () => {
  const h = await publier({ demande: 'Rédige une note de synthèse.' });
  const v = controler(h, 'Une note de synthèse parfaitement rédigée.');
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(h.evaluate('qgSortieCertifie')(v), false, 'REQUIRED_NON_VERIFIABLE_CAN_PASS = NO');
  const rendu = h.evaluate('rendreConformiteSortie')(v);
  assert.equal(/Conforme au contrat déclaré/.test(rendu), false, 'aucune certification affichée');
  assert.ok(/pas certifié conforme/.test(rendu), 'la limite est dite en clair');
});

test('T-QG02B-11 une sortie non conforme n’est jamais présentée comme conforme', async () => {
  const h = await publier({ demande: 'Donne exactement 7 exemples sous forme de liste.' });
  const v = controler(h, '- a\n- b\n- c');
  assert.equal(v.status, 'FAIL');
  assert.ok(codes(v).includes('OUTPUT_QUANTITY_MISMATCH'));
  assert.equal(h.evaluate('qgSortieCertifie')(v), false);
  assert.ok(/non conforme/.test(h.evaluate('rendreConformiteSortie')(v)));
});

test('T-QG02B-12 une défaillance technique ferme le contrôle', async () => {
  const h = await publier({ demande: 'Rédige une note.' });
  const contrat = publication(h).contract;
  const runtime = h.evaluate('window.__ATELIER_ADN_RUNTIME__');
  for (const mauvais of [null, 42, {}]) {
    const v = runtime.validateOutputAgainstCanonicalContract({ canonical_contract: contrat, output: mauvais });
    assert.equal(v.status, 'FAIL');
    assert.equal(v.technical_failure, true);
    assert.equal(h.evaluate('qgSortieCertifie')(v), false);
  }
  /* Et un prompt qui n’est pas celui du contrat ne déclenche aucun contrôle :
     le gate se tait plutôt que d’opposer une sortie à un contrat étranger. */
  assert.equal(controler(h, 'Une réponse.', 'Un prompt libre, écrit à la main.'), null);
});

test('T-QG02B-13 une erreur de transport reste une erreur d’exécution', () => {
  const bloc = HTML.slice(HTML.indexOf('async function envoyerApi(){'));
  const posCatch = bloc.indexOf('}catch(err){');
  const posGate = bloc.indexOf('rapideControleSortie(prompt, corps)');
  assert.ok(posGate > -1 && posCatch > posGate, 'le contrôle vit d’abord dans le chemin de succès');

  /* ADN-QG-02D — la règle exacte n’est pas « aucun contrôle dans le catch »,
     mais « aucun texte exposé sans contrôle, et aucune erreur de transport
     convertie en défaut de contrat ». Le seul endroit du catch qui expose un
     corps est la troncature : il contrôle, et il continue de signaler une
     erreur d’exécution. */
  const branche = bloc.slice(posCatch, posCatch + 4000);
  /* La règle porte sur les CLAIMS de conformité, pas sur les expositions : la
     branche de refus montre un texte partiel sans rien en déclarer, et n'a donc
     rien à faire gouverner. La troncature, elle, affiche un verdict : elle est
     gouvernée. */
  assert.ok(/rapideControleSortie\(/.test(branche), 'la branche qui affiche un verdict le fait contrôler');
  assert.ok(/Réponse tronquée/.test(branche) && /'erreur'/.test(branche),
    'PROVIDER_ERROR_PRESERVED = YES : la troncature reste une erreur d’exécution');

  /* Et le gate n’est jamais nourri d’une erreur de transport : il ne reçoit
     qu’un corps de réponse, jamais un objet d’erreur. */
  assert.equal(/rapideControleSortie\([^)]*err/.test(bloc), false, 'aucune erreur n’entre dans le contrôle de contrat');
});

test('T-QG02B-14 un verdict défavorable ne relance jamais le fournisseur', async () => {
  const h = await publier({ demande: 'Donne exactement 7 exemples sous forme de liste.' });
  const avant = h.network.length;
  const v = controler(h, '- a');
  assert.equal(v.status, 'FAIL');
  assert.equal(h.network.length, avant, 'SECOND_PROVIDER_CALL_ON_QG_FAIL = NO');
  for (const interdit of ['envoyerApi(', 'appelFournisseur(']) {
    assert.equal(INTEGRATION.includes(interdit), false, `relance interdite : ${interdit}`);
  }
});

/* ======================================================================== *
 * §6–§12 — DES CONTRÔLES EXÉCUTABLES, ET SEULEMENT SI UNE MESURE EXISTE
 * ======================================================================== */

test('T-QG02B-15 la mesure de quantité est recopiée du contrat, jamais inventée', async () => {
  const h = await publier({ demande: 'Donne exactement 7 exemples sous forme de liste.' });
  const contrat = publication(h).contract;
  const check = contrat.checks.find((c) => c.id === 'rapide-check-quantity');
  assert.ok(check, 'le contrat porte bien un contrôle de quantité');
  assert.deepEqual(
    { unit: check.measure.unit, exact: check.measure.exact },
    { unit: 'items', exact: contrat.quantities[0].exact },
    'QUANTITY_MEASURE_EMITTED = YES, et strictement égale au contrat'
  );
  assert.equal(check.verifies, 'quantities[0]', 'le contrôle redit la vérification native sans la recompter');
  /* Sans quantité au contrat, aucun contrôle de quantité n’est fabriqué. */
  const sans = await publier({ demande: 'Rédige une note de synthèse.' });
  assert.equal(publication(sans).contract.checks.some((c) => c.id === 'rapide-check-quantity'), false);
});

test('T-QG02B-16 une quantité exacte respectée est vérifiée et tenue', async () => {
  const h = await publier({ demande: 'Donne exactement 7 exemples sous forme de liste.' });
  const v = controler(h, Array.from({ length: 7 }, (_, i) => `- élément ${i + 1}`).join('\n'));
  assert.equal(verif(v, 'output-quantity').status, 'PASS', 'QUANTITY_EXACT_PASS = YES');
  assert.equal(verif(v, 'output-quantity').verifiability, 'DETERMINISTIC');
  assert.equal(v.violations.length, 0, 'aucune violation : la quantité est tenue');
  /* Le verdict global reste incomplet parce que le format « list » ne déclare
     aucune forme structurelle opposable — un fait, pas un échec. */
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(verif(v, 'output-format').status, 'NOT_VERIFIABLE');
});

test('T-QG02B-17 une quantité insuffisante échoue', async () => {
  const h = await publier({ demande: 'Donne exactement 7 exemples sous forme de liste.' });
  const v = controler(h, Array.from({ length: 6 }, (_, i) => `- élément ${i + 1}`).join('\n'));
  assert.equal(v.status, 'FAIL', 'QUANTITY_UNDER_FAIL = YES');
  assert.equal(verif(v, 'output-quantity').observed, '6');
});

test('T-QG02B-18 une quantité excédentaire échoue', async () => {
  const h = await publier({ demande: 'Donne exactement 7 exemples sous forme de liste.' });
  const v = controler(h, Array.from({ length: 8 }, (_, i) => `- élément ${i + 1}`).join('\n'));
  assert.equal(v.status, 'FAIL', 'QUANTITY_OVER_FAIL = YES');
  assert.equal(verif(v, 'output-quantity').observed, '8');
});

test('T-QG02B-19 la forme structurelle vient de la table gelée, jamais d’un identifiant', async () => {
  const h = await publier({ demande: 'Produis un json avec 3 champs.' });
  const vocab = h.evaluate('rapideVocabulaireStructurel')();
  const json = vocab.find((f) => f.id === 'json');
  assert.equal(json.structural_kind, 'json', 'JSON_MEASURE_EMITTED = YES');
  /* Aucun format textuel n’invente une structure. */
  assert.equal(vocab.find((f) => f.id === 'report').structural_kind, null);
  assert.equal(vocab.find((f) => f.id === 'tableau_comparatif').structural_kind, null);
  assert.equal(vocab.filter((f) => f.structural_kind).length, 1, 'une seule forme est réellement déclarée');
  /* La page ne connaît aucun identifiant de format en dur. */
  assert.equal(/'(report|tableau_comparatif|list|code)'/.test(INTEGRATION), false);
});

test('T-QG02B-20 un JSON valide satisfait une exigence de format JSON', async () => {
  const h = await publier({ demande: 'Produis un json avec 3 champs.' });
  const v = controler(h, '{"a":1,"b":2,"c":3}');
  assert.equal(verif(v, 'output-format').status, 'PASS', 'JSON_PASS = YES');
  assert.equal(v.status, 'PASS');
});

test('T-QG02B-21 un JSON invalide échoue', async () => {
  const h = await publier({ demande: 'Produis un json avec 3 champs.' });
  const v = controler(h, 'Voici votre réponse, mais ce n’est pas du JSON.');
  assert.equal(v.status, 'FAIL', 'JSON_FAIL = YES');
  assert.ok(codes(v).includes('OUTPUT_FORMAT_MISMATCH'));
});

/* ======================================================================== *
 * §12 / §26 — PROVENANCE : PRÉSENCE ≠ VÉRITÉ
 * ======================================================================== */

const AVEC_PROVENANCE = (base) => {
  base.evidence.provenance = [
    { statement_id: 'p1', claim: 'A', source_type: 'oprie', source_ref: null, verification_status: 'external_unverified' }
  ];
};

test('T-QG02B-22 une provenance structurellement présente est vérifiée comme telle', async () => {
  const h = await publier({ demande: 'Rédige une note.', muter: AVEC_PROVENANCE });
  const runtime = h.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const contrat = publication(h).contract;
  assert.equal(contrat.evidence.provenance.length, 1, 'la provenance survit à l’enrichissement');
  const v = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: contrat,
    output: { text: 'Une note tracée.', provenance: [{ statement_id: 'p1', verification_status: 'external_unverified' }] },
    checks: contrat.checks,
    execution_context: { format_vocabulary: h.evaluate('rapideVocabulaireStructurel')() }
  });
  assert.equal(verif(v, 'output-provenance-present').status, 'PASS', 'PROVENANCE_STRUCTURAL_PASS = YES');
  assert.equal(verif(v, 'output-provenance-present').verifiability, 'STRUCTURAL');
  /* Absente, elle échoue. */
  const absente = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: contrat, output: { text: 'Rien de tracé.', provenance: [] }, checks: contrat.checks,
    execution_context: { format_vocabulary: h.evaluate('rapideVocabulaireStructurel')() }
  });
  assert.equal(absente.status, 'FAIL');
  assert.ok(codes(absente).includes('PROVENANCE_REQUIREMENT_FAILED'));
});

test('T-QG02B-23 la véracité d’une source n’est jamais présentée comme vérifiée', async () => {
  const h = await publier({ demande: 'Rédige une note.', muter: AVEC_PROVENANCE });
  const runtime = h.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const contrat = publication(h).contract;
  const v = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: contrat,
    output: { text: 'Tracé.', provenance: [{ statement_id: 'p1', verification_status: 'external_unverified' }] },
    checks: contrat.checks,
    execution_context: { format_vocabulary: h.evaluate('rapideVocabulaireStructurel')() }
  });
  const verite = verif(v, 'output-provenance-truth');
  assert.ok(verite, 'la limite est déclarée plutôt que passée sous silence');
  assert.notEqual(verite.status, 'PASS', 'PROVENANCE_TRUTH_FAKE_PASS = NO');
  /* Et un statut non vérifié promu en « verified » est détecté. */
  const promu = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: contrat,
    output: { text: 'Tracé.', provenance: [{ statement_id: 'p1', verification_status: 'verified' }] },
    checks: contrat.checks,
    execution_context: { format_vocabulary: h.evaluate('rapideVocabulaireStructurel')() }
  });
  assert.equal(promu.status, 'FAIL');
  assert.equal(verif(promu, 'output-provenance-status').status, 'FAIL');
});

/* ======================================================================== *
 * §28–§29 — LES DEUX DÉRIVES, ÉPROUVÉES SUR LE CHEMIN RÉEL
 * ======================================================================== */

test('T-QG02B-24 un mot dans un libellé ne vaut pas contrôle exécuté', async () => {
  const h = await publier({ demande: 'Rédige une note.' });
  const runtime = h.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const contrat = publication(h).contract;
  const parLeMot = { id: 'det-mot', type: 'deterministic', blocking: true, rule: 'La quantité de points doit être correcte.' };
  const v = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: contrat, output: '- a\n- b\n- c', checks: [parLeMot],
    execution_context: { format_vocabulary: h.evaluate('rapideVocabulaireStructurel')() }
  });
  assert.equal(verif(v, 'det-mot').status, 'NOT_VERIFIABLE', 'TEXT_KEYWORD_WITHOUT_MEASURE_CAN_PASS = NO');
  assert.notEqual(v.status, 'PASS');
});

test('T-QG02B-25 une obligation requise non vérifiable interdit la conformité', async () => {
  const h = await publier({ demande: 'Rédige une note.' });
  const runtime = h.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const contrat = publication(h).contract;
  for (const check of [{ id: 's', type: 'semantic', blocking: true, rule: 'Analyse pertinente.' },
                       { id: 'n', type: 'not_verifiable', blocking: true, rule: 'Impression générale.' },
                       { id: 'x', type: 'inconnu', blocking: true, rule: 'Règle exotique.' }]) {
    const v = runtime.validateOutputAgainstCanonicalContract({
      canonical_contract: contrat, output: 'Une réponse plausible.', checks: [check],
      execution_context: { format_vocabulary: h.evaluate('rapideVocabulaireStructurel')() }
    });
    assert.notEqual(v.status, 'PASS', `${check.type} ne peut pas produire un succès`);
    assert.equal(h.evaluate('qgSortieCertifie')(v), false);
  }
});

test('T-QG02B-26 le contrôle historique ne peut plus déclarer un succès contradictoire', async () => {
  const h = await publier({ demande: 'Rédige une note de synthèse.' });
  const v = controler(h, 'Une note.');
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');

  /* Le défaut du contrôle historique, mesuré sur son propre résultat : sa
     conclusion de conformité ne regarde QUE les échecs, et ignore ce qui est
     resté hors de portée. C'est cela qui produisait un succès sans preuve. */
  const legacy = h.evaluate('verifierConformite')('Une note.', h.evaluate('contratDuPrompt')(
    h.evaluate('contexte')('Rédige une note de synthèse.', 'report', 'minimal', {}), ['role', 'controle']
  ), {});
  assert.ok(legacy, 'le contrôle historique produit bien un résultat');
  assert.equal(legacy.conforme, legacy.echecs === 0,
    'la conformité historique ne dépend que des échecs, jamais des non-vérifiables');
  assert.ok(legacy.non_verifiables >= 0);

  /* Quand un contrat canonique gouverne la sortie, c’est le nouveau verdict
     qui est rendu : les deux autorités ne parlent plus en même temps. */
  const bloc = HTML.slice(HTML.indexOf('async function envoyerApi(){'));
  const rendu = bloc.slice(bloc.indexOf("$('#api-conformite').innerHTML"), bloc.indexOf("$('#api-bloc-conformite')"));
  assert.ok(/verdictSortie\s*\?\s*rendreConformiteSortie\(verdictSortie\)\s*:\s*rendreConformite\(conf\)/.test(rendu),
    'LEGACY_FAKE_PASS_STILL_POSSIBLE = NO');
  assert.equal(/Conforme au contrat déclaré/.test(h.evaluate('rendreConformiteSortie')(v)), false);
});

/* ======================================================================== *
 * §21–§27 — SENTINELLES RAPIDE
 * ======================================================================== */

test('T-QG02B-27 sentinelle code : aucune obligation n’est inventée', async () => {
  const h = await publier({ demande: 'Écris une fonction de code.' });
  const contrat = publication(h).contract;
  assert.deepEqual(contrat.quantities, [], 'aucune quantité inventée');
  const v = controler(h, 'const f = () => 1;');
  assert.equal(v.violations.length, 0, 'CODE_SENTINEL_FALSE_POSITIVE = NO');
  assert.equal(verif(v, 'output-non-empty').status, 'PASS');
  assert.equal(verif(v, 'output-quantity'), null, 'aucune vérification de quantité n’existe');
  /* Une sortie courte et complète n’est jamais pénalisée pour sa taille. */
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(codes(v).length, 0);
});

test('T-QG02B-28 sentinelle table : la forme non déclarée est dite, pas supposée', async () => {
  const h = await publier({ demande: 'Construis un tableau comparatif.' });
  assert.equal(publication(h).contract.output.format, 'tableau_comparatif');
  const v = controler(h, '| a | b |\n|---|---|\n| 1 | 2 |');
  /* La table est présente dans la sortie, mais la table des formats gelée ne
     déclare aucune forme structurelle pour ce format : le gate refuse de
     conclure plutôt que d’inventer une correspondance depuis un identifiant. */
  assert.equal(verif(v, 'output-format').status, 'NOT_VERIFIABLE');
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(v.violations.length, 0, 'aucune sortie n’est déclarée fautive faute d’oracle');
});

test('T-QG02B-29 sentinelle simple : aucune obligation artificielle', async () => {
  const h = await publier({ demande: 'Rédige une note de synthèse.' });
  const contrat = publication(h).contract;
  assert.deepEqual(contrat.quantities, []);
  assert.deepEqual(contrat.obligations, []);
  const v = controler(h, 'Une note de synthèse.');
  assert.equal(v.violations.length, 0);
  assert.equal(verif(v, 'output-non-empty').status, 'PASS');
  /* Une sortie vide, elle, reste un échec mesurable. */
  const vide = controler(h, '   ');
  assert.equal(vide.status, 'FAIL');
  assert.ok(codes(vide).includes('MISSING_REQUIRED_OUTPUT'));
});
