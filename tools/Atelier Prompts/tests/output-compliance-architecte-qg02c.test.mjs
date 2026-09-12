/* ADN-QG-02C — CONFORMITÉ DE SORTIE SUR LE CHEMIN ARCHITECTE
 * ============================================================================
 *
 * Le même moteur qu'en QG-02B, sur l'autre chemin. Ce qui change n'est pas la
 * règle mais la NATURE du contrat : Architecte porte des obligations bien plus
 * qualitatives — rigueur, pertinence, adéquation. C'est précisément là que la
 * tentation de certifier sans preuve est la plus forte, et c'est donc là que la
 * discipline compte le plus.
 *
 * Le lien prompt ↔ contrat est ici plus fort que sur Rapide : le prompt est
 * compilé et exécuté dans le MÊME appel, et le contrat est capturé à l'instant
 * de la compilation. Il n'existe aucune fenêtre où l'un pourrait changer sans
 * l'autre — inutile de comparer après coup ce qui ne peut pas diverger.
 *
 * CONSÉQUENCE MESURÉE : les contrôles que l'enrichissement Architecte produit
 * sont sémantiques, heuristiques ou déclarés non vérifiables — jamais
 * déterministes. Aucune mesure n'a été fabriquée pour changer cela. Une sortie
 * Architecte obtiendra donc presque toujours INCOMPLETE_VERIFICATION : c'est
 * l'état réel de ce que le contrat sait exiger objectivement.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyseFixture, compileWith } from './archcompiler-harness.helper.mjs';
import { createRapideHarness } from './rapide-assembler-harness.helper.mjs';
import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const GATE = fs.readFileSync(path.join(root, 'core/adn/output-compliance-gate.js'), 'utf8');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
/* Le bloc d'intégration Architecte, isolé du reste du fichier. */
const INTEGRATION = sansCommentaires(
  HTML.slice(HTML.indexOf('const ARCH_QG_SORTIE_MESSAGES='), HTML.indexOf('async function archConstruireExecuter(){'))
);
const EXECUTION = HTML.slice(HTML.indexOf('async function archConstruireExecuter(){'), HTML.indexOf('const ARCH_SAUVEGARDE_VERSION='));
/* Pour les questions d'ORDRE, seules les instructions comptent : un commentaire
   entre deux appels ne s'exécute pas. */
const EXECUTION_CODE = sansCommentaires(EXECUTION);

/** Compile réellement un prompt Architecte et rend son harnais + son contrat. */
function architecte({ analyse = analyseFixture(), demande = 'Demande de contrôle de sortie.', muter } = {}) {
  const r = compileWith({ demande, analyse });
  if (muter) muter(r.contract);
  return r;
}

/** Le contrôle de sortie, appelé exactement comme la production l'appelle. */
const controler = (r, texte, contrat) =>
  r.harness.evaluate('window.__ARCHITECTE_V10__.controleSortie')(contrat === undefined ? r.contract : contrat, texte);
const certifiee = (r, v) => r.harness.evaluate('window.__ARCHITECTE_V10__.sortieCertifiee')(v);
const verif = (v, id) => (v.verifications || []).find((x) => x.id === id) || null;
const codes = (v) => (v.violations || []).map((x) => x.code);

/* ======================================================================== *
 * §39 — LE SEUIL EST EN PLACE
 * ======================================================================== */

test('T-QG02C-01 le contrôle de sortie est actif sur le chemin Architecte', () => {
  const r = architecte({});
  assert.ok(r.prompt.length > 0, 'la compilation aboutit');
  const api = r.harness.evaluate('window.__ARCHITECTE_V10__');
  assert.equal(typeof api.controleSortie, 'function', 'ARCHITECTE_OUTPUT_QG_ACTIVE = YES');
  const v = controler(r, 'Un livrable quelconque.');
  assert.ok(v && typeof v.status === 'string');
});

test('T-QG02C-02 le contrôle s’exécute après le fournisseur, sur sa réponse', () => {
  const posAppel = EXECUTION_CODE.indexOf('const r=await appelFournisseur(');
  const posGate = EXECUTION_CODE.indexOf('archControleSortie(contratExecute,r.texte)');
  assert.ok(posAppel > -1 && posGate > posAppel, 'ARCH_OUTPUT_QG_AFTER_PROVIDER = YES');
  /* Aucune instruction ne s'intercale entre la réponse et son contrôle. */
  const entre = EXECUTION_CODE.slice(EXECUTION_CODE.indexOf(';', posAppel) + 1, posGate).trim();
  assert.equal(entre.replace(/\s+/g, ''), 'constverdictSortie=',
    `la réponse va directement au contrôle ; instruction intercalée : ${entre}`);
});

test('T-QG02C-03 le contrôle s’exécute avant toute exposition du livrable', () => {
  const posGate = EXECUTION.indexOf('archControleSortie(contratExecute,r.texte)');
  const posExpo = EXECUTION.indexOf('zone.textContent=r.texte');
  assert.ok(posGate > -1 && posExpo > posGate, 'ARCH_OUTPUT_QG_BEFORE_EXPOSURE = YES');
});

test('T-QG02C-04 Architecte utilise le moteur QG-02A, sans en dupliquer une règle', () => {
  assert.ok(INTEGRATION.includes('runtime.validateOutputAgainstCanonicalContract'), 'délégation au noyau');
  for (const regle of ['JSON.parse', 'NOT_VERIFIABLE', 'DETERMINISTIC', 'verifiability', 'countStructuralItems', 'VERIFIABLE_HERE']) {
    assert.equal(INTEGRATION.includes(regle), false, `règle dupliquée dans la page : ${regle}`);
  }
});

test('T-QG02C-05 aucun moteur de conformité propre à Architecte n’existe', () => {
  const page = sansCommentaires(HTML);
  for (const interdit of ['validateArchitectOutput', 'archValiderConformiteSortie', 'archOutputEngine']) {
    assert.equal(page.includes(interdit), false, `moteur spécifique : ${interdit}`);
  }
  assert.equal((sansCommentaires(GATE).match(/export function validateOutputAgainstCanonicalContract/g) || []).length, 1);
  /* Les deux chemins appellent la même fonction du noyau. */
  assert.equal((page.match(/runtime\.validateOutputAgainstCanonicalContract\(/g) || []).length, 2,
    'exactement deux points d’appel, un par moteur');
});

test('T-QG02C-06 le lien prompt ↔ contrat est établi à la compilation, pas deviné', () => {
  const posCompile = EXECUTION.indexOf('const prompt=archCompiler()');
  const posCapture = EXECUTION.indexOf('const contratExecute=archContratCanonique');
  const posConfirm = EXECUTION.indexOf("confirm('Exécuter maintenant");
  assert.ok(posCompile > -1 && posCapture > posCompile, 'le contrat est capturé juste après la compilation');
  assert.ok(posCapture < posConfirm, 'la capture précède la confirmation, qui peut durer');
  /* Et sans contrat, aucun contrôle n’est prononcé : ni conforme, ni fautif. */
  const r = architecte({});
  assert.equal(controler(r, 'Un livrable.', null), null);
});

/* ======================================================================== *
 * IMMUTABILITÉ ET AUTORITÉ
 * ======================================================================== */

test('T-QG02C-07 le livrable n’est jamais modifié par le contrôle', () => {
  const r = architecte({});
  const texte = 'Un livrable exact au dernier octet — accents : é à ü.';
  const v = controler(r, texte);
  assert.equal(texte, 'Un livrable exact au dernier octet — accents : é à ü.');
  assert.equal(JSON.stringify(v).includes('dernier octet'), false, 'le contenu utilisateur ne ressort pas du gate');
  assert.equal(/r\.texte\s*=/.test(EXECUTION), false, 'la page ne réaffecte jamais la réponse');
});

test('T-QG02C-08 le contrat canonique n’est jamais muté par le contrôle', () => {
  const r = architecte({});
  const avant = JSON.stringify(r.contract);
  controler(r, 'Un livrable.');
  assert.equal(JSON.stringify(r.contract), avant, 'OUTPUT_QG_CANONICAL_MUTATIONS = 0');
});

test('T-QG02C-28 le contrôle n’écrit aucun état OPRIE', () => {
  const r = architecte({});
  assert.equal(r.contract.executability.oprie_state, 'operational_request_ready');
  controler(r, '');
  assert.equal(r.contract.executability.oprie_state, 'operational_request_ready', 'OUTPUT_QG_OPRIE_WRITES = 0');
  assert.equal(/oprie_state\s*[:=][^=]/.test(sansCommentaires(GATE)), false);
  assert.equal(/oprie/i.test(INTEGRATION), false, 'la page d’intégration n’y touche pas davantage');
});

test('T-QG02C-29 le contrôle n’écrit aucune readiness', () => {
  assert.equal(/\b(readiness|execution_ready)\s*[:=][^=]/.test(sansCommentaires(GATE)), false, 'OUTPUT_QG_READINESS_WRITES = 0');
  assert.equal(/readiness/i.test(INTEGRATION), false);
  /* Le contrôle vit après l’exécution : il ne peut pas rouvrir la readiness. */
  const posReadiness = EXECUTION.indexOf('archApiCoeur()');
  const posGate = EXECUTION.indexOf('archControleSortie(');
  assert.ok(posReadiness > -1 && posGate > posReadiness);
});

test('T-QG02C-30 le contrôle n’écrit aucune route', () => {
  assert.equal(/\b(route|routing|engine_choice)\s*[:=][^=]/.test(sansCommentaires(GATE)), false, 'OUTPUT_QG_ROUTE_WRITES = 0');
  assert.equal(/\broute\b/i.test(INTEGRATION), false);
});

test('T-QG02C-31 aucune réécriture ni réparation du livrable', () => {
  for (const interdit of ['repair', 'regenerate', 'appendMissing', 'fixOutput', 'corrigerSortie']) {
    assert.equal(sansCommentaires(GATE).toLowerCase().includes(interdit.toLowerCase()), false, interdit);
    assert.equal(INTEGRATION.toLowerCase().includes(interdit.toLowerCase()), false, interdit);
  }
});

test('T-QG02C-32 le contrôle n’appelle aucun fournisseur', () => {
  const r = architecte({});
  const avant = r.harness.network.length;
  controler(r, 'Un livrable.');
  assert.equal(r.harness.network.length, avant, 'OUTPUT_QG_PROVIDER_CALLS = 0');
  for (const interdit of ['fetch(', 'appelFournisseur', 'appelApi', 'XMLHttpRequest']) {
    assert.equal(sansCommentaires(GATE).includes(interdit), false, interdit);
  }
});

test('T-QG02C-33 un verdict défavorable ne pose aucune question', () => {
  const r = architecte({ muter: (c) => { c.quantities = [{ target: 'éléments', unit: null, exact: 7, min: null, max: null, source: 'test' }]; } });
  const v = controler(r, '- a');
  assert.equal(v.status, 'FAIL');
  for (const interdit of ['question', 'clarification', 'confirmation_required', 'prompt(']) {
    assert.equal(INTEGRATION.toLowerCase().includes(interdit.toLowerCase()), false, `dialogue interdit : ${interdit}`);
  }
  assert.equal(/question/i.test(sansCommentaires(GATE)), false);
});

test('T-QG02C-34 un verdict défavorable ne rouvre aucune boucle de dialogue', () => {
  /* Le contrôle est terminal : rien après lui ne relance quoi que ce soit. */
  const apres = EXECUTION.slice(EXECUTION.indexOf('archControleSortie('));
  for (const interdit of ['archApi(', 'archApiCoeur(', 'archPreparerAvecApi(', 'appelFournisseur(', 'archCompiler(']) {
    assert.equal(apres.includes(interdit), false, `relance interdite après le contrôle : ${interdit}`);
  }
});

/* ======================================================================== *
 * §11 — LES QUATRE STATUTS
 * ======================================================================== */

test('T-QG02C-09 une sortie conforme est exposée et déclarée telle', () => {
  /* Un contrat sans obligation objectivement opposable : rien n'est exigé qui
     ne puisse être vérifié, donc rien n'empêche de conclure. */
  const r = architecte({ muter: (c) => { c.checks = []; c.obligations = []; c.output.format = null; c.semantic_lock_signals = { signals: [], signals_produced: true }; } });
  const v = controler(r, 'Un livrable complet.');
  assert.equal(v.status, 'PASS', JSON.stringify(v.unverifiable));
  assert.equal(certifiee(r, v), true);
  assert.ok(/conforme aux exigences vérifiables/.test(r.harness.evaluate('window.__ARCHITECTE_V10__.messageSortie')(v)));
});

test('T-QG02C-10 des avertissements n’empêchent pas l’exposition', () => {
  const r = architecte({ muter: (c) => {
    c.checks = [{ id: 'heur-1', type: 'heuristic', blocking: false, rule: 'Style sobre.' }];
    c.obligations = []; c.output.format = null; c.semantic_lock_signals = { signals: [], signals_produced: true };
  } });
  const v = controler(r, 'Un livrable complet.');
  assert.equal(v.status, 'PASS_WITH_WARNINGS');
  assert.equal(certifiee(r, v), true, 'un avertissement ne retire pas la conformité');
});

test('T-QG02C-11 une vérification incomplète n’est jamais présentée comme conforme', () => {
  const r = architecte({});
  const v = controler(r, 'Un livrable rigoureux et parfaitement pertinent.');
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(certifiee(r, v), false, 'REQUIRED_NON_VERIFIABLE_CAN_PASS = NO');
  const message = r.harness.evaluate('window.__ARCHITECTE_V10__.messageSortie')(v);
  assert.ok(/pas certifié conforme/.test(message));
  assert.equal(/^Livrable obtenu\.$/.test(message), false, 'l’ancien message de succès inconditionnel a disparu');
});

test('T-QG02C-12 une sortie non conforme n’est jamais présentée comme conforme', () => {
  const r = architecte({ muter: (c) => { c.quantities = [{ target: 'éléments', unit: null, exact: 7, min: null, max: null, source: 'test' }]; } });
  const v = controler(r, '- a\n- b\n- c');
  assert.equal(v.status, 'FAIL');
  assert.ok(codes(v).includes('OUTPUT_QUANTITY_MISMATCH'));
  assert.equal(certifiee(r, v), false);
  assert.ok(/non conforme/.test(r.harness.evaluate('window.__ARCHITECTE_V10__.messageSortie')(v)));
});

test('T-QG02C-13 une défaillance technique ferme le contrôle', () => {
  const r = architecte({});
  const runtime = r.harness.runtime;
  for (const mauvais of [null, 42, {}]) {
    const v = runtime.validateOutputAgainstCanonicalContract({ canonical_contract: r.contract, output: mauvais });
    assert.equal(v.status, 'FAIL');
    assert.equal(v.technical_failure, true);
    assert.equal(certifiee(r, v), false);
  }
  assert.ok(/Sa vérification n’a pas pu aboutir/.test(
    r.harness.evaluate('window.__ARCHITECTE_V10__.messageSortie')({ status: 'FAIL', technical_failure: true })));
});

test('T-QG02C-14 une erreur de transport reste une erreur d’exécution', () => {
  const posCatch = EXECUTION.indexOf('}catch(err){');
  const posGate = EXECUTION.indexOf('archControleSortie(');
  assert.ok(posGate > -1 && posCatch > posGate, 'le contrôle vit dans le chemin de succès');
  assert.equal(EXECUTION.slice(posCatch).includes('archControleSortie'), false, 'PROVIDER_ERROR_PRESERVED = YES');
  assert.ok(/Échec de l\\u2019ex(é|\\u00e9)cution/.test(EXECUTION.slice(posCatch)), 'le message d’erreur d’exécution demeure');
});

test('T-QG02C-15 un verdict défavorable ne relance jamais le fournisseur', () => {
  const r = architecte({ muter: (c) => { c.quantities = [{ target: 'éléments', unit: null, exact: 7, min: null, max: null, source: 'test' }]; } });
  const avant = r.harness.network.length;
  const v = controler(r, '- a');
  assert.equal(v.status, 'FAIL');
  assert.equal(r.harness.network.length, avant, 'SECOND_PROVIDER_CALL_ON_QG_FAIL = NO');
});

/* ======================================================================== *
 * §31–§37 — CE QUI EST VÉRIFIABLE
 * ======================================================================== */

const AVEC_QUANTITE = (n) => (c) => { c.quantities = [{ target: 'éléments', unit: null, exact: n, min: null, max: null, source: 'test' }]; };

test('T-QG02C-16 une quantité exacte respectée est vérifiée et tenue', () => {
  const r = architecte({ muter: AVEC_QUANTITE(7) });
  const v = controler(r, Array.from({ length: 7 }, (_, i) => `- élément ${i + 1}`).join('\n'));
  assert.equal(verif(v, 'output-quantity').status, 'PASS', 'QUANTITY_EXACT_PASS = YES');
  assert.equal(verif(v, 'output-quantity').verifiability, 'DETERMINISTIC');
  assert.equal(v.violations.length, 0);
});

test('T-QG02C-17 une quantité insuffisante échoue', () => {
  const r = architecte({ muter: AVEC_QUANTITE(7) });
  const v = controler(r, Array.from({ length: 6 }, (_, i) => `- élément ${i + 1}`).join('\n'));
  assert.equal(v.status, 'FAIL', 'QUANTITY_UNDER_FAIL = YES');
  assert.equal(verif(v, 'output-quantity').observed, '6');
});

test('T-QG02C-18 une quantité excédentaire échoue', () => {
  const r = architecte({ muter: AVEC_QUANTITE(7) });
  const v = controler(r, Array.from({ length: 8 }, (_, i) => `- élément ${i + 1}`).join('\n'));
  assert.equal(v.status, 'FAIL', 'QUANTITY_OVER_FAIL = YES');
  assert.equal(verif(v, 'output-quantity').observed, '8');
});

test('T-QG02C-19 un JSON valide satisfait une exigence de format JSON', () => {
  const r = architecte({ muter: (c) => { c.output.format = 'json'; c.checks = []; c.obligations = []; c.semantic_lock_signals = { signals: [], signals_produced: true }; } });
  const vocab = r.harness.evaluate('window.__ARCHITECTE_V10__.vocabulaireStructurel')();
  assert.equal(vocab.find((f) => f.id === 'json').structural_kind, 'json', 'la forme vient de la table gelée');
  const v = controler(r, '{"a":1,"b":2}');
  assert.equal(verif(v, 'output-format').status, 'PASS', 'JSON_PASS = YES');
  assert.equal(v.status, 'PASS');
});

test('T-QG02C-20 un JSON invalide échoue', () => {
  const r = architecte({ muter: (c) => { c.output.format = 'json'; } });
  const v = controler(r, 'Voici votre livrable, mais ce n’est pas du JSON.');
  assert.equal(v.status, 'FAIL', 'JSON_FAIL = YES');
  assert.ok(codes(v).includes('OUTPUT_FORMAT_MISMATCH'));
  /* Un format dont la structure n’est pas déclarée reste non vérifiable :
     aucune correspondance n’est inventée depuis un identifiant. */
  const libre = architecte({ muter: (c) => { c.output.format = 'tableau'; } });
  assert.equal(verif(controler(libre, '| a |\n|---|\n| 1 |'), 'output-format').status, 'NOT_VERIFIABLE');
});

const AVEC_PROVENANCE = (c) => {
  c.evidence.provenance = [
    { statement_id: 'arch-prov-0', claim: 'A', source_type: 'arch_analysis', source_ref: null, verification_status: 'external_unverified' }
  ];
};

test('T-QG02C-21 une provenance structurellement présente est vérifiée comme telle', () => {
  const r = architecte({ muter: AVEC_PROVENANCE });
  const runtime = r.harness.runtime;
  const v = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: r.contract,
    output: { text: 'Un livrable tracé.', provenance: [{ statement_id: 'arch-prov-0', verification_status: 'external_unverified' }] },
    checks: r.contract.checks,
    execution_context: { format_vocabulary: r.harness.evaluate('window.__ARCHITECTE_V10__.vocabulaireStructurel')() }
  });
  assert.equal(verif(v, 'output-provenance-present').status, 'PASS', 'PROVENANCE_STRUCTURAL_PASS = YES');
  assert.equal(verif(v, 'output-provenance-present').verifiability, 'STRUCTURAL');
  /* Un statut non vérifié promu en « verified » est détecté. */
  const promu = runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: r.contract,
    output: { text: 'Tracé.', provenance: [{ statement_id: 'arch-prov-0', verification_status: 'verified' }] },
    checks: r.contract.checks,
    execution_context: { format_vocabulary: [] }
  });
  assert.equal(verif(promu, 'output-provenance-status').status, 'FAIL');
});

test('T-QG02C-22 une provenance exigée mais absente échoue', () => {
  const r = architecte({ muter: AVEC_PROVENANCE });
  const v = r.harness.runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: r.contract, output: { text: 'Rien de tracé.', provenance: [] },
    checks: r.contract.checks, execution_context: { format_vocabulary: [] }
  });
  assert.equal(v.status, 'FAIL');
  assert.ok(codes(v).includes('PROVENANCE_REQUIREMENT_FAILED'));
  /* Sur une sortie non structurée, la présence n’est pas décidable. */
  const brut = controler(r, 'Un livrable en texte libre.');
  assert.equal(verif(brut, 'output-provenance-present').status, 'NOT_VERIFIABLE');
});

test('T-QG02C-23 la véracité d’une source n’est jamais présentée comme vérifiée', () => {
  const r = architecte({ muter: AVEC_PROVENANCE });
  const v = r.harness.runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: r.contract,
    output: { text: 'Tracé.', provenance: [{ statement_id: 'arch-prov-0', verification_status: 'external_unverified' }] },
    checks: r.contract.checks, execution_context: { format_vocabulary: [] }
  });
  const verite = verif(v, 'output-provenance-truth');
  assert.ok(verite, 'la limite est déclarée plutôt que passée sous silence');
  assert.notEqual(verite.status, 'PASS', 'PROVENANCE_TRUTH_FAKE_PASS = NO');
  assert.equal(verite.verifiability, 'NOT_VERIFIABLE');
});

/* ======================================================================== *
 * §12 / §19 / §34–§36 — CE QUI NE SE VÉRIFIE PAS, ET LE DIT
 * ======================================================================== */

test('T-QG02C-24 une exigence qualitative ne devient jamais un succès', () => {
  const r = architecte({});
  /* Audit des contrôles réellement produits par l’enrichissement Architecte :
     aucun n’est déterministe, et aucune mesure n’a été fabriquée. */
  const types = r.contract.checks.map((c) => c.type);
  assert.equal(types.includes('deterministic'), false, 'aucun contrôle Architecte n’est déterministe aujourd’hui');
  assert.equal(r.contract.checks.some((c) => c.measure), false, 'aucune mesure n’a été inventée');

  for (const check of [{ id: 's', type: 'semantic', blocking: true, rule: 'Analyse rigoureuse et pertinente.' },
                       { id: 'n', type: 'not_verifiable', blocking: true, rule: 'Adéquation métier.' },
                       { id: 'x', type: 'inconnu', blocking: true, rule: 'Règle exotique.' }]) {
    const v = r.harness.runtime.validateOutputAgainstCanonicalContract({
      canonical_contract: r.contract, output: 'Un livrable plausible.', checks: [check],
      execution_context: { format_vocabulary: [] }
    });
    assert.notEqual(v.status, 'PASS', `${check.type} ne peut pas produire un succès`);
    assert.equal(certifiee(r, v), false);
  }
});

test('T-QG02C-25 vérifiable + non vérifiable → INCOMPLETE, jamais PASS', () => {
  const r = architecte({ muter: (c) => { AVEC_QUANTITE(7)(c); c.output.format = 'json'; AVEC_PROVENANCE(c); } });
  const v = r.harness.runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: r.contract,
    output: {
      text: JSON.stringify(new Array(7).fill('x')), items: new Array(7).fill('x'),
      provenance: [{ statement_id: 'arch-prov-0', verification_status: 'external_unverified' }]
    },
    checks: [{ id: 'sem-1', type: 'semantic', blocking: true, rule: 'Analyse pertinente.' }],
    execution_context: { format_vocabulary: r.harness.evaluate('window.__ARCHITECTE_V10__.vocabulaireStructurel')() }
  });
  assert.equal(verif(v, 'output-quantity').status, 'PASS');
  assert.equal(verif(v, 'output-format').status, 'PASS');
  assert.equal(verif(v, 'output-provenance-present').status, 'PASS');
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION', 'MIXED_CASE_BECOMES_INCOMPLETE = YES');
  assert.equal(v.violations.length, 0, 'rien n’a échoué : quelque chose n’a pas pu être su');
});

test('T-QG02C-26 un échec déterministe domine une vérification incomplète', () => {
  const r = architecte({ muter: AVEC_QUANTITE(7) });
  const v = r.harness.runtime.validateOutputAgainstCanonicalContract({
    canonical_contract: r.contract, output: '- a\n- b\n- c\n- d\n- e\n- f',
    checks: [{ id: 'sem-1', type: 'semantic', blocking: true, rule: 'Analyse pertinente.' }],
    execution_context: { format_vocabulary: [] }
  });
  assert.equal(v.status, 'FAIL', 'DETERMINISTIC_FAIL_DOMINATES = YES');
  assert.ok(v.coverage.required_unverifiable > 0, 'le non-vérifiable subsiste, il ne disparaît pas');
});

test('T-QG02C-27 un livrable requis mais vide échoue', () => {
  const r = architecte({});
  for (const vide of ['', '   \n\t ']) {
    const v = controler(r, vide);
    assert.equal(v.status, 'FAIL');
    assert.ok(codes(v).includes('MISSING_REQUIRED_OUTPUT'), 'OUTPUT_EMPTY_REQUIRED_FAIL = YES');
    assert.equal(certifiee(r, v), false);
  }
});

/* ======================================================================== *
 * §28 — LE CHEMIN RAPIDE EST INCHANGÉ
 * ======================================================================== */

test('T-QG02C-35 le chemin Rapide reste actif et inchangé', async () => {
  const demande = 'Donne exactement 7 exemples sous forme de liste.';
  const h = createRapideHarness({ demande, materiau: '' });
  h.context.rapideAppliquerContratCanonique(canonicalFrom(oprieReadyTurn({}), { request_id: 'qg02c', original_request: demande }));
  await h.evaluate('copierRapideAdaptatif')();
  const pub = h.evaluate('rapideDernierePublication');
  assert.ok(pub, 'RAPIDE_OUTPUT_QG_ACTIVE = YES');
  const v = h.evaluate('rapideControleSortie')(pub.prompt, Array.from({ length: 7 }, (_, i) => `- e${i}`).join('\n'));
  assert.equal(verif(v, 'output-quantity').status, 'PASS');
  const rate = h.evaluate('rapideControleSortie')(pub.prompt, '- a');
  assert.equal(rate.status, 'FAIL');
  /* Les deux chemins gardent chacun leur point d’appel, distincts et parallèles. */
  const page = sansCommentaires(HTML);
  assert.ok(page.includes('function rapideControleSortie('));
  assert.ok(page.includes('function archControleSortie('));
});
