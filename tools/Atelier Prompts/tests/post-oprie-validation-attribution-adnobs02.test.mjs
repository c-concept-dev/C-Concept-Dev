/* ADN-OBS-02 — ATTRIBUER L'ARRÊT, SANS TOUCHER À CE QUI L'A PRODUIT.
 * ============================================================================
 *
 * CE QUE LE SMOKE S8B2FD A MONTRÉ — ET L'ERREUR QU'IL A FAIT COMMETTRE. L'écran annonçait « la
 * préparation approfondie ne correspond plus à la demande validée » ; le relevé d'ADN-OBS-01
 * rendait `null`. La conclusion tirée fut : la garde d'ambiguïté n'a pas été atteinte, cherchons
 * ailleurs. Elle était fausse.
 *
 * POURQUOI. Ce relevé est pris DANS `adnEnrichCanonicalWithArch`, après l'appel au runtime. Or la
 * même comparaison existe AUSSI dans `adnValidatePostOprie`, qui s'exécute AVANT et qui n'utilise
 * ni `adnRuntime`, ni le runtime, ni rien d'externe : du code local à l'artefact. Un relevé nul
 * prouvait donc seulement que l'ENRICHISSEMENT n'était pas parvenu à son point d'observation —
 * l'étage local restait entièrement muet. Instrumenter d'après cette conclusion aurait fait
 * corriger la garde qui n'avait rien fait.
 *
 * CE QUE CE LOT AJOUTE, ET OÙ. Un relevé du premier étage, pris AU SITE D'APPEL — là où la décision
 * de `adnValidatePostOprie` est déjà calculée et rendue. La fonction elle-même n'est pas touchée :
 * T-AOBS2-07 le vérifie à l'octet près contre la version précédente. Observer une garde sans
 * pouvoir la changer est le seul moyen honnête de l'observer.
 *
 * CE QUE LE RELEVÉ DISCRIMINE. `canonical_contract_present` tranche le candidat B ; le couple
 * (`canonical_field`, `arch_source_field`) tranche le candidat A et nomme tout autre producteur.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadPostOprieValidator, oprieReadyTurn, coherentAnalysis, canonicalFrom } from './post-oprie-validation-harness.helper.mjs';

const artefact = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');

/** Le retenteur et le port, chargés ensemble avec un `oprieState` minimal. */
function chargerAttribution(canonicalContract) {
  const lignes = artefact.split('\n');
  const dRet = lignes.findIndex((l) => l.startsWith('function adnRetenirValidationPostOprie(validation,base){'));
  const fRet = lignes.findIndex((l, i) => i > dRet && l === '}');
  const dRou = lignes.findIndex((l) => l.startsWith('window.__V11_ROUTER__=Object.freeze({'));
  const fRou = lignes.findIndex((l, i) => i > dRou && l.trimEnd() === '});');
  assert.ok(dRet > 0 && fRet > dRet && dRou > 0 && fRou > dRou, 'les deux blocs sont localisables');

  const contexte = {
    window: {}, JSON, Array,
    /* L'état interne, réduit — plus un champ SENSIBLE, pour éprouver qu'il ne sort pas. */
    oprieState: { lastPostOprieValidation: null, lastAmbiguityGuardObservation: null,
                  canonicalContract, original_request: 'TEXTE_DE_LA_PERSONNE' },
    v11ModeUsesGovernedPipeline: () => true, v11AbandonGovernedTurn() {},
    v11StartRapide() {}, v11StartAtelier() {}, v11StartArchitecte() {}
  };
  contexte.globalThis = contexte;
  vm.createContext(contexte);
  vm.runInContext(lignes.slice(dRet, fRet + 1).join('\n'), contexte, { filename: 'atelier:retenteur' });
  vm.runInContext(lignes.slice(dRou, fRou + 1).join('\n'), contexte, { filename: 'atelier:v11-router' });
  return {
    retenir: (validation) => vm.runInContext('adnRetenirValidationPostOprie', contexte)(validation, canonicalContract),
    port: contexte.window.__V11_ROUTER__,
    interne: contexte.oprieState
  };
}

/* ==========================================================================
 * LES QUATRE CAS QUI DOIVENT SE DISTINGUER
 * ======================================================================= */

test('T-AOBS2-01 · CAS A : la garde locale d’ambiguïté, prouvée, nommée — puis désarmée sur cette preuve', () => {
  /* ADN-ARCH-03d — HISTORICAL_IMPLEMENTATION_CONTRACT. Ce relevé a rendu, en production sur ZEVQ7C,
     EXACTEMENT ce que ce test attendait : `canonical_contract_present = true`, `ok = false`,
     `signal_count = 1`, CONTRACT_INCONSISTENT sur `executability.substitutable_missing` ←
     `comprehension.ambiguites`. C'est cette preuve qui a fait désarmer la garde. Le relevé, lui,
     est inchangé : il rapporte désormais un verdict OK, zéro signal, une divergence — et c'est
     ainsi qu'il montrerait une régression. */
  const { validateFromTurn } = loadPostOprieValidator();
  const tour = oprieReadyTurn();
  const analyse = coherentAnalysis();
  analyse.comprehension.ambiguites = ['UNE AMBIGUÏTÉ SIGNALÉE'];
  const verdict = validateFromTurn(analyse, tour);
  assert.equal(verdict.ok, true, 'la garde locale ne tire plus sur cette forme');

  const { retenir, port } = chargerAttribution(canonicalFrom(tour));
  retenir(verdict);
  const releve = port.getLastPostOprieValidationObservation();

  assert.equal(releve.canonical_contract_present, true, 'le contrat était là : CAS B écarté');
  assert.equal(releve.ok, true);
  assert.equal(releve.signal_count, 0);
  assert.equal(releve.divergence_count, 1, 'l’écart est compté, en observation');
  assert.deepEqual(releve.signals, []);
});

test('T-AOBS2-02 · CAS B : contrat canonique absent à l’import, prouvé', () => {
  /* `adnValidatePostOprie(obj, null)` rend son propre CONTRACT_INCONSISTENT — et le relevé dit
     pourquoi, là où l'écran seul ne le disait pas : le contrat n'était pas là. */
  const { validate } = loadPostOprieValidator();
  const verdict = validate(coherentAnalysis(), null);
  assert.equal(verdict.ok, false);

  const { retenir, port } = chargerAttribution(null);
  retenir(verdict);
  const releve = port.getLastPostOprieValidationObservation();

  assert.equal(releve.canonical_contract_present, false, 'CAS B : le discriminant est net');
  assert.equal(releve.request_id, null, 'aucun identifiant à rendre sans contrat');
  assert.equal(releve.signals[0].canonical_field, 'executability.oprie_state');
  /* Et ce n'est PAS la garde d'ambiguïté : les deux cas ne se confondent plus. */
  assert.notEqual(releve.signals[0].canonical_field, 'executability.substitutable_missing');
});

test('T-AOBS2-03 · CAS C : tout autre producteur est nommé, pas deviné', () => {
  const { validateFromTurn } = loadPostOprieValidator();
  const tour = oprieReadyTurn();
  /* Un producteur distinct : l'objectif validé qui n'est pas repris par l'analyse. */
  const analyse = coherentAnalysis();
  analyse.comprehension.intention_principale = '';
  const verdict = validateFromTurn(analyse, tour);

  const { retenir, port } = chargerAttribution(canonicalFrom(tour));
  retenir(verdict);
  const releve = port.getLastPostOprieValidationObservation();
  assert.equal(releve.canonical_contract_present, true);
  assert.equal(releve.signals[0].canonical_field, 'intent.objective');
  assert.equal(releve.signals[0].arch_source_field, 'comprehension.intention_principale');
});

test('T-AOBS2-04 · contrat présent et aucun signal : rien n’est attribué à tort', () => {
  const { validateFromTurn } = loadPostOprieValidator();
  const tour = oprieReadyTurn();
  const verdict = validateFromTurn(coherentAnalysis(), tour);
  assert.equal(verdict.ok, true);

  const { retenir, port } = chargerAttribution(canonicalFrom(tour));
  retenir(verdict);
  const releve = port.getLastPostOprieValidationObservation();
  assert.equal(releve.ok, true);
  assert.equal(releve.signal_count, 0);
  assert.deepEqual(releve.signals, []);
  assert.equal(releve.canonical_contract_present, true);
  /* Les divergences non bloquantes sont comptées, sans être confondues avec des signaux. */
  assert.equal(releve.divergence_count, 0);
});

test('T-AOBS2-05 : les divergences non bloquantes sont comptées à part', () => {
  const { validateFromTurn } = loadPostOprieValidator();
  const tour = oprieReadyTurn();
  const analyse = coherentAnalysis();
  analyse.comprehension.intentions_secondaires = ['S1', 'S2'];
  const verdict = validateFromTurn(analyse, tour);
  assert.equal(verdict.ok, true, 'un registre désarmé ne bloque pas');

  const { retenir, port } = chargerAttribution(canonicalFrom(tour));
  retenir(verdict);
  const releve = port.getLastPostOprieValidationObservation();
  assert.equal(releve.signal_count, 0, 'aucun signal bloquant');
  assert.equal(releve.divergence_count, 1, 'mais une divergence observée');
  assert.equal(releve.ok, true);
});

/* ==========================================================================
 * LE PORT, ET CE QU'IL NE LAISSE PAS PASSER
 * ======================================================================= */

test('T-AOBS2-06 : null avant observation, copie défensive, aucun contenu utilisateur', () => {
  const { retenir, port, interne } = chargerAttribution(canonicalFrom(oprieReadyTurn()));
  assert.equal(port.getLastPostOprieValidationObservation(), null, 'rien n’est fabriqué avant');

  const { validateFromTurn } = loadPostOprieValidator();
  /* ADN-ARCH-03d — `ambiguites` ne produit plus de signal ; le relevé est nourri par un producteur
     encore armé, l'objectif non repris, et le texte à ne pas laisser fuir reste dans l'analyse. */
  const analyse = coherentAnalysis();
  analyse.comprehension.intention_principale = '';
  analyse.comprehension.ambiguites = ['TEXTE_QUI_NE_DOIT_PAS_FUIR'];
  retenir(validateFromTurn(analyse, oprieReadyTurn()));

  const copie = port.getLastPostOprieValidationObservation();
  assert.notEqual(copie, interne.lastPostOprieValidation, 'ce n’est pas la même référence');
  copie.signals[0].canonical_field = 'PIRATE';
  copie.canonical_contract_present = false;
  copie.injecte = 'PIRATE';
  assert.equal(interne.lastPostOprieValidation.signals[0].canonical_field, 'intent.objective');
  assert.equal(interne.lastPostOprieValidation.canonical_contract_present, true);
  assert.equal('injecte' in interne.lastPostOprieValidation, false);

  /* AUCUN CONTENU. Ni le texte de l'ambiguïté, ni `detail` — qui est de la prose, et une prose peut
     porter une valeur. Ni rien de l'état interne. */
  const serialise = JSON.stringify(port.getLastPostOprieValidationObservation());
  for (const fuite of ['TEXTE_QUI_NE_DOIT_PAS_FUIR', 'TEXTE_DE_LA_PERSONNE', 'ambiguïté absente', 'detail']) {
    assert.equal(serialise.includes(fuite), false, `« ${fuite} » ne doit pas fuir`);
  }
  for (const s of port.getLastPostOprieValidationObservation().signals) {
    assert.deepEqual(Object.keys(s).sort(), ['arch_source_field', 'canonical_field', 'signal']);
  }
});

test('T-AOBS2-07 : adnValidatePostOprie n’est PAS instrumenté, et l’observation ne décide rien', () => {
  /* LA GARANTIE CENTRALE DU LOT. Instrumenter au site d'appel, et non dans la fonction, permet de
     l'affirmer sur les octets : la fonction observée ne contient pas son observateur.
     ADN-ARCH-03d a depuis changé la garde d'ambiguïté elle-même — sur la preuve que ce relevé a
     fournie — mais pas cette séparation : la garde, dans sa forme actuelle, mot pour mot. */
  const corps = artefact.slice(artefact.indexOf('function adnValidatePostOprie('),
    artefact.indexOf('/* CORRECTION-ADN-ARCH-01-01 — FUSION DES SIGNAUX POST-OPRIE.'));
  assert.equal(corps.includes('adnRetenirValidationPostOprie'), false, 'aucune instrumentation dedans');
  assert.equal(corps.includes('lastPostOprieValidation'), false);
  /* La garde locale, mot pour mot, dans sa forme ADN-ARCH-03d : même prédicat, observation. */
  assert.match(corps, /if\(list\(comprehension\.ambiguites\)\.length>knownIssues\)\n\s*divergences\.push\(\{kind:'ARCH_REGISTER_DIVERGENCE',canonical_field:'executability\.substitutable_missing',/);
  assert.equal(corps.includes("push('CONTRACT_INCONSISTENT','executability.substitutable_missing'"), false, 'plus aucun signal sur ce registre');
  assert.match(corps, /const knownIssues=list\(executability\.critical_missing\)\.length\+list\(executability\.substitutable_missing\)\.length;/);

  /* L'ordre d'exécution et le branchement sont inchangés : le retenteur s'insère APRÈS la
     validation et n'entre dans aucune condition. */
  assert.match(artefact, /const validation=adnValidatePostOprie\(legacyObj,oprieState\.canonicalContract\);\n\s*adnRetenirValidationPostOprie\(validation,oprieState\.canonicalContract\);/);
  assert.match(artefact, /const stopSignals=adnMergePostOprieSignals\(validation\.signals,enrichment&&enrichment\.signals\);/);
  assert.equal(/if\([^)]*adnRetenirValidationPostOprie/.test(artefact), false,
    'le retenteur ne conditionne rien');
  /* Et il ne peut pas faire échouer un tour. */
  assert.match(artefact, /catch\(error\)\{\/\* Observer ne peut pas faire échouer une préparation\. \*\/\}/);
});

test('T-AOBS2-08 : aucun namespace nouveau, et les deux étages restent distincts', () => {
  const handles = [...new Set([...artefact.matchAll(/window\.(__[A-Z_0-9]+__)\s*=/g)].map((m) => m[1]))];
  assert.deepEqual(handles.sort(), ['__ARCHITECTE_V10__', '__QUALITE_V10__', '__V11_ROUTER__'],
    'le handle public existant est réutilisé, aucun quatrième');
  assert.equal(artefact.includes('window.oprieState'), false, 'oprieState n’est jamais publié');

  const { port } = chargerAttribution(null);
  assert.deepEqual(Object.keys(port).sort(),
    ['getLastAmbiguityGuardObservation', 'getLastPostOprieValidationObservation', 'start']);
  /* DEUX PORTS POUR DEUX ÉTAGES, et c'est le sens du lot : leur confusion est ce qui a fait
     conclure trop vite. Le port de l'enrichissement reste indépendant. */
  assert.equal(port.getLastAmbiguityGuardObservation(), null);
  assert.equal(port.getLastPostOprieValidationObservation(), null);
});

test('T-AOBS2-09 : le port ne journalise rien', () => {
  const lignes = artefact.split('\n');
  const i = lignes.findIndex((l) => l.includes('getLastPostOprieValidationObservation(){'));
  const corps = lignes.slice(i, i + 4).join('\n');
  for (const interdit of ['console.', 'fetch(', 'localStorage', 'push(']) {
    assert.equal(corps.includes(interdit), false, `le port ne fait pas « ${interdit} »`);
  }
  assert.match(corps, /return releve\?JSON\.parse\(JSON\.stringify\(releve\)\):null;/);
});
