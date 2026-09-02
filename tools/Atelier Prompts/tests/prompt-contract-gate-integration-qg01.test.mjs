/* ADN-QG-01 — LE PROMPT CONTRACT GATE EN PRODUCTION
 * ============================================================================
 *
 * QG-00 avait défini le gate et l'avait prouvé pur — mais la trace de
 * projection qu'il validait était encore construite par l'appelant. Ce lot
 * ferme cette dette : les DEUX compilateurs émettent désormais leur propre
 * trace, dans le passage qui rend le prompt, et le gate s'interpose avant
 * toute exposition et avant toute exécution.
 *
 * Ce qui est éprouvé ici n'est pas une fonction isolée mais le CHEMIN RÉEL :
 * les harnais exécutent les blocs <script> de production dans un contexte
 * isolé, avec le runtime navigateur réellement généré.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';
import { createRapideHarness } from './rapide-assembler-harness.helper.mjs';
import { analyseFixture, compileWith, createArchitecteHarness } from './archcompiler-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const GATE = fs.readFileSync(path.join(root, 'core/adn/prompt-contract-gate.js'), 'utf8');
const RUNTIME = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const DEMANDE = 'Donne exactement 7 exemples sous forme de liste.';

/** Contrat canonique de base, produit par le mapper de production. */
function contratBase(demande = DEMANDE, candidat = {}, requestId = 'qg-01') {
  return canonicalFrom(oprieReadyTurn({
    operational_request_candidate: {
      objective: 'Objectif validé.', expected_deliverable: 'Un livrable nommé.',
      secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
      confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [],
      assumptions_allowed: [], remaining_unknowns: [], ...candidat
    }
  }), { request_id: requestId, original_request: demande });
}

/** Exécute le CHEMIN RAPIDE de production, contrat appliqué. */
function rapide({ demande = DEMANDE, materiau = '', contrat, patch } = {}) {
  const h = createRapideHarness({ demande, materiau });
  h.context.rapideAppliquerContratCanonique(contrat === undefined ? contratBase(demande) : contrat);
  if (patch) h.evaluate(patch);
  return { harness: h, resultat: h.assemblerRapideAdaptatif() };
}

/** Exécute le CHEMIN ARCHITECTE de production. */
function architecte({ analyse = analyseFixture(), demande = 'Demande de caractérisation.', materiau = '', muter } = {}) {
  const h = createArchitecteHarness({ demande, materiau });
  const imported = h.importer(analyse);
  const base = h.runtime.mapOprieToCanonicalContract(
    { state: 'operational_request_ready', operational_request_candidate: {
        objective: 'Objectif validé.', expected_deliverable: 'Un livrable nommé.',
        secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
        confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [],
        assumptions_allowed: [], remaining_unknowns: [] },
      issues: [], reason: 'ok',
      intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] } },
    { request_id: 'qg-01-arch', original_request: demande });
  const contrat = h.runtime.enrichCanonicalContractFromArchAnalysis(base, analyse).contract;
  /* L'injection de défaut passe par le CONTRAT, jamais par un trucage du
     compilateur : c'est ainsi qu'une perte réelle de projection est simulée. */
  if (muter) muter(contrat);
  const prompt = imported ? h.compiler(contrat) : '';
  return { harness: h, prompt, contrat, trace: h.evaluate('window.__ARCHITECTE_V10__.derniereTraceQg') };
}

const cles = (trace) => (trace ? trace.entries.map((e) => e.key) : []);

/* ======================================================================== *
 * §49 — NOYAU
 * ======================================================================== */

test('T-QG01-01 le gate est disponible dans le runtime navigateur et déclaré actif', () => {
  const { harness } = rapide({});
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  for (const nom of ['validatePromptAgainstCanonicalContract', 'guardPromptContract', 'buildProjectionTrace', 'collectCanonicalRequirements', 'selectTraceEntriesForContract']) {
    assert.equal(typeof runtime[nom], 'function', `${nom} doit être embarqué`);
  }
  assert.equal(runtime.PROMPT_CONTRACT_GATE_PRODUCTION_ACTIVE, true, 'PROMPT_CONTRACT_GATE_PRODUCTION_ACTIVE = YES');
  assert.equal(RUNTIME.includes('validatePromptAgainstCanonicalContract'), true);
});

test('T-QG01-02 Rapide émet une trace native', () => {
  const { resultat } = rapide({});
  assert.notEqual(resultat, null, 'le chemin nominal aboutit');
  assert.equal(resultat.trace.native_from_compiler, true, 'RAPIDE_NATIVE_TRACE = YES');
  assert.ok(resultat.trace.entries.length > 0);
  for (const e of resultat.trace.entries) {
    assert.equal(e.source, 'rapide_compiler', 'chaque entrée nomme le compilateur qui l’a produite');
    assert.equal(typeof e.canonical_path, 'string', 'chaque entrée référence son chemin canonique');
  }
});

test('T-QG01-03 Architecte émet une trace native', () => {
  const { prompt, trace } = architecte({});
  assert.ok(prompt.length > 0, 'la compilation aboutit');
  assert.equal(trace.native_from_compiler, true, 'ARCHITECTE_NATIVE_TRACE = YES');
  assert.ok(trace.entries.length > 0);
  for (const e of trace.entries) assert.equal(e.source, 'arch_compiler');
});

test('T-QG01-04 prompt et trace sortent du même passage de compilation', () => {
  /* Rapide : un seul rendu produit les deux. Amputer le rendu ampute la trace
     ET le prompt — ce qui serait impossible si la trace était reconstruite. */
  const { resultat } = rapide({
    patch: 'assemblerAnnote=(function(o){return function(ctx,a){return o(ctx,a).filter(function(b){return b.id!=="format"})}})(assemblerAnnote)'
  });
  assert.equal(resultat, null, 'un bloc perdu au rendu fait échouer le contrat, il n’est pas recomposé');
  /* Et aucun des deux compilateurs ne reconstruit sa trace depuis le texte. */
  const rapideRange = HTML.slice(HTML.indexOf('function rapideTraceNative('), HTML.indexOf('function rapideAppliquerCanoniqueAuContexte('));
  const archRange = HTML.slice(HTML.indexOf('function archTraceNative('), HTML.indexOf('const ARCH_SAUVEGARDE_VERSION='));
  for (const [nom, portee] of [['Rapide', rapideRange], ['Architecte', archRange]]) {
    assert.equal(/reconstruireTrace|traceDepuisPrompt|parseTrace|\.match\(|split\('## '\)/.test(sansCommentaires(portee)), false,
      `TRACE_RECONSTRUCTION_OUTSIDE_COMPILER = NO (${nom})`);
  }
});

test('T-QG01-05 la trace est déterministe et stable', () => {
  const a = rapide({}).resultat, b = rapide({}).resultat;
  assert.deepEqual(JSON.parse(JSON.stringify(a.trace)), JSON.parse(JSON.stringify(b.trace)));
  assert.equal(a.prompt, b.prompt);
  const t1 = architecte({}).trace, t2 = architecte({}).trace;
  assert.deepEqual(JSON.parse(JSON.stringify(t1)), JSON.parse(JSON.stringify(t2)));
  /* L'ordre est celui du rendu : il ne dépend d'aucun tri instable. */
  assert.equal(JSON.stringify(cles(a.trace)), JSON.stringify(cles(b.trace)));
});

test('T-QG01-06 les deux moteurs passent par la MÊME implémentation', () => {
  const source = sansCommentaires(HTML);
  assert.equal((source.match(/guardPromptContract\(/g) || []).length >= 2, true, 'les deux moteurs appellent la garde');
  /* Aucune variante par moteur n'existe. */
  for (const interdit of ['validateRapidPromptContract', 'validateArchitectPromptContract', 'validateArchPromptContract']) {
    assert.equal(source.includes(interdit), false, `aucun gate propre à un moteur : ${interdit}`);
  }
  const implementations = (sansCommentaires(GATE).match(/function validatePromptAgainstCanonicalContract/g) || []).length;
  assert.equal(implementations, 1, 'SHARED_PROMPT_CONTRACT_GATE_IMPLEMENTATION_COUNT = 1');
});

test('T-QG01-07 un seul moteur de compilation sémantique par mode', () => {
  const source = sansCommentaires(HTML);
  assert.equal((source.match(/function archCompiler\(/g) || []).length, 1, 'COMPILATION_ENGINE_COUNT = 1 (Architecte)');
  assert.equal((source.match(/function assemblerRapideAdaptatif\(/g) || []).length, 1, 'COMPILATION_ENGINE_COUNT = 1 (Rapide)');
  for (const interdit of ['archCompilerV2', 'ArchitecteCompilerNew', 'assemblerRapideAdaptatif2']) {
    assert.equal(source.includes(interdit), false, `aucun second compilateur : ${interdit}`);
  }
});

test('T-QG01-08 un verdict favorable laisse le prompt aboutir', () => {
  const { resultat } = rapide({});
  assert.equal(resultat.qg, 'PASS');
  assert.ok(resultat.prompt.includes('## TÂCHE'));
  assert.ok(architecte({}).prompt.length > 0);
});

test('T-QG01-09 un verdict défavorable arrête le chemin', () => {
  const rap = rapide({ patch: 'rapideTraceNative=(function(o){return function(b,p){var t=o(b,p);return {version:t.version,request_id:t.request_id,native_from_compiler:true,lock_selection_observed:true,entries:t.entries.filter(function(e){return e.key!=="format"})}}})(rapideTraceNative)' });
  assert.equal(rap.resultat, null, 'QG_FAIL_STOPS_PROMPT_EXPOSURE = YES');
  assert.equal(rap.harness.element('rapide-sortie').textContent, '', 'aucun prompt n’a été exposé');

  /* Côté Architecte, la perte est injectée par le contrat : une ouverture
     exigée que ce compilateur ne rend pas. */
  const arch = architecte({ muter: (c) => { c.output.opening = 'Une ouverture exigée.'; } });
  assert.equal(arch.prompt, '', 'le compilateur Architecte n’expose rien');
  assert.equal(arch.harness.sortieDOM, '', 'le DOM reste vide');
});

test('T-QG01-10 une défaillance technique ferme le chemin, sans repli', () => {
  const rap = rapide({ patch: 'rapideTraceNative=function(){return {entries:"illisible"}}' });
  assert.equal(rap.resultat, null, 'TECHNICAL_VALIDATION_FAILURE_FAILS_CLOSED = YES');
  /* Et la garde du noyau ne peut jamais lever ni rendre autre chose qu'un verdict. */
  const { harness } = rapide({});
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  for (const entree of [undefined, {}, { canonical_contract: null }, { prompt: 42 }]) {
    const v = runtime.guardPromptContract(entree);
    assert.equal(v.status, 'FAIL');
    assert.equal(typeof v.public_message, 'string');
  }
});

/* ======================================================================== *
 * §50 — AUTORITÉ
 * ======================================================================== */

test('T-QG01-11 le gate n’écrit aucune readiness', () => {
  const src = sansCommentaires(GATE);
  assert.equal(/\b(readiness|execution_ready|oprie_state)\s*[:=][^=]/.test(src), false, 'QG_READINESS_WRITES = 0');
  const { resultat } = rapide({});
  assert.equal(JSON.stringify(resultat.trace).includes('"readiness"'), false);
});

test('T-QG01-12 le gate n’écrit aucune route', () => {
  const src = sansCommentaires(GATE);
  assert.equal(/\b(route|routing|engine_choice)\s*[:=][^=]/.test(src), false, 'QG_ROUTE_WRITES = 0');
});

test('T-QG01-13 le gate ne sélectionne aucun verrou', () => {
  const src = sansCommentaires(GATE);
  assert.equal(/selected\s*[:=]\s*true|selectAdaptiveLocks|\.locks\s*=/.test(src), false, 'QG_LOCK_SELECTION_WRITES = 0');
  /* Il constate en revanche un verrou manquant lorsqu'une sélection existe. */
  const { harness } = rapide({});
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  assert.equal(typeof runtime.collectCanonicalRequirements, 'function');
});

test('T-QG01-14 le contrat canonique n’est pas muté par le chemin de production', () => {
  const contrat = contratBase();
  const avant = JSON.stringify(contrat);
  rapide({ contrat });
  assert.equal(JSON.stringify(contrat), avant, 'QG_CANONICAL_MUTATIONS = 0');
  const src = sansCommentaires(GATE);
  assert.equal(/canonical_contract\s*\.[A-Za-z_]+\s*=|canonical_contract\[[^\]]+\]\s*=/.test(src), false);
});

test('T-QG01-15 le prompt n’est jamais réécrit par le contrôle', () => {
  const { resultat, harness } = rapide({});
  const attendu = harness.assembler(
    harness.contexte(DEMANDE, resultat.format, resultat.niveau, { materiau: '' }), resultat.actifs
  );
  /* Le rendu passe par assemblerAnnote : il doit rester octet pour octet celui
     d'assembler(), sans quoi brancher le gate aurait modifié le prompt. */
  assert.equal(typeof resultat.prompt, 'string');
  assert.ok(resultat.prompt.length > 0);
  assert.equal(attendu.split('\n\n').length, resultat.prompt.split('\n\n').length, 'PROMPT_CONTENT_REGRESSION = NO');
  assert.equal(/\bprompt\s*=[^=]|prompt\.replace|prompt\s*\+=/.test(sansCommentaires(GATE)), false, 'QG_PROMPT_REWRITES = 0');
});

test('T-QG01-16 le gate n’appelle aucun fournisseur et aucun réseau', () => {
  const src = sansCommentaires(GATE);
  for (const interdit of ['fetch(', 'XMLHttpRequest', 'http://', 'https://', 'anthropic', 'openai', 'apiKey', 'api_key']) {
    assert.equal(src.toLowerCase().includes(interdit.toLowerCase()), false, `QG_PROVIDER_CALLS = 0 : ${interdit}`);
  }
  const { harness } = rapide({});
  assert.deepEqual(harness.network, [], 'aucun appel réseau sur le chemin nominal');
  const arch = architecte({ muter: (c) => { c.output.opening = 'Une ouverture exigée.'; } });
  assert.deepEqual(arch.harness.network, [], 'aucun appel réseau même sur un échec');
});

test('T-QG01-17 un échec du gate ne change pas l’état OPRIE', () => {
  const contrat = contratBase();
  assert.equal(contrat.executability.oprie_state, 'operational_request_ready');
  const rap = rapide({ contrat, patch: 'rapideTraceNative=function(){return {entries:"illisible"}}' });
  assert.equal(rap.resultat, null);
  assert.equal(contrat.executability.oprie_state, 'operational_request_ready', 'QG_FAILURE_CHANGES_OPRIE_STATE = NO');
  assert.equal(contrat.executability.state, 'exploitable');
});

test('T-QG01-18 un échec du gate ne pose aucune question', () => {
  const src = sansCommentaires(GATE);
  for (const interdit of ['question', 'clarification_required', 'next_question', 'ask']) {
    assert.equal(src.toLowerCase().includes(interdit.toLowerCase()), false, `QG_FAILURE_CREATES_DIALOG_LOOP = NO : ${interdit}`);
  }
  const rap = rapide({ patch: 'rapideTraceNative=function(){return {entries:"illisible"}}' });
  assert.equal(rap.resultat, null);
  assert.equal(rap.harness.evaluate('adpState.pendingQuestion'), false, 'aucune question n’est ouverte');
});

/* ======================================================================== *
 * §51 — SENTINELLES RAPIDE
 * ======================================================================== */

const SENTINELLES = [
  { nom: 'simple', demande: 'Rédige une note de synthèse.' },
  { nom: 'liste', demande: 'Donne une liste de 5 idees.' },
  { nom: 'tableau', demande: 'Construis un tableau comparatif.' },
  { nom: 'materiau', demande: 'Analyse le texte fourni.', materiau: 'Matériau utilisateur à traiter.' },
  { nom: 'exact', demande: 'Donne exactement 7 exemples.' },
  { nom: 'code', demande: 'json 3 champs' }
];
for (const [i, cas] of SENTINELLES.entries()) {
  test(`T-QG01-${19 + i} sentinelle Rapide « ${cas.nom} » : le contrat est respecté de bout en bout`, () => {
    const { resultat } = rapide({ demande: cas.demande, materiau: cas.materiau || '' });
    assert.notEqual(resultat, null, `${cas.nom} : le prompt doit aboutir`);
    assert.equal(resultat.qg, 'PASS');
    assert.equal(resultat.trace.native_from_compiler, true);
    if (cas.nom === 'code') {
      assert.ok(resultat.prompt.length > 0, 'SHORT_COMPLETE_CODE_PROMPT_PASSES = YES');
    }
  });
}

test('T-QG01-25 une projection perdue fait échouer le chemin Rapide', () => {
  const { resultat } = rapide({
    demande: 'Construis un tableau comparatif.',
    patch: 'rapideTraceNative=(function(o){return function(b,p){var t=o(b,p);return {version:t.version,request_id:t.request_id,native_from_compiler:true,lock_selection_observed:true,entries:t.entries.filter(function(e){return e.key!=="format"})}}})(rapideTraceNative)'
  });
  assert.equal(resultat, null);
});

test('T-QG01-26 une borne contredisant une exigence d’exactitude est détectée', () => {
  const { harness } = rapide({});
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const nominal = rapide({}).resultat;
  const verdict = runtime.guardPromptContract({
    canonical_contract: nominal.canonical.contract,
    prompt: 'Donne au moins 7 exemples.',
    selected_locks: nominal.canonical.envelope.locks.locks,
    projection_trace: nominal.trace
  });
  assert.equal(verdict.status, 'FAIL');
  assert.ok(verdict.violations.some((v) => v.code === 'CONTRADICTORY_INSTRUCTION'));
});

/* ======================================================================== *
 * §52 — SENTINELLES ARCHITECTE
 * ======================================================================== */

test('T-QG01-27 sentinelle Architecte canonique : compilation et contrat respectés', () => {
  const { prompt, trace } = architecte({});
  assert.ok(prompt.includes('## FORMAT DE SORTIE'));
  assert.equal(trace.lock_selection_observed, false, 'ce chemin déclare n’avoir aucune sélection ADN');
});

test('T-QG01-28 sentinelle Architecte : le format est projeté et tracé', () => {
  const { prompt, trace, contrat } = architecte({});
  const entree = trace.entries.find((e) => e.key === 'format');
  assert.ok(entree, 'le format figure dans la trace');
  assert.equal(entree.value.format, contrat.output.format);
  assert.ok(prompt.includes('Format technique'));
});

test('T-QG01-29 sentinelle Architecte : le périmètre est projeté et tracé', () => {
  const a = analyseFixture();
  a.compilation.composants_ecartes = [{ type: 'interdiction', contenu: 'Élément écarté.', justification: 'Hors périmètre.' }];
  const { prompt, trace } = architecte({ analyse: a });
  assert.ok(prompt.includes('## CADRAGE SÉMANTIQUE À RESPECTER'));
  const entree = trace.entries.find((e) => e.key === 'scope');
  assert.ok(entree, 'le périmètre figure dans la trace');
  assert.ok(entree.value.constraint_count >= 1);
});

test('T-QG01-30 sentinelle Architecte : la provenance est projetée sans requalification', () => {
  const a = analyseFixture();
  a.verification.controle_provenance = [
    { affirmation: 'Affirmation soutenue.', statut: 'soutenue', justification: 'x' },
    { affirmation: 'Affirmation non vérifiée.', statut: 'connaissance_externe_non_verifiee', justification: 'y' }
  ];
  const { prompt, trace } = architecte({ analyse: a });
  assert.ok(prompt.includes('## PROVENANCE DES AFFIRMATIONS'));
  const entree = trace.entries.find((e) => e.key === 'provenance');
  assert.deepEqual({ total: entree.value.total, unverified: entree.value.unverified }, { total: 2, unverified: 2 });
  assert.match(prompt, /Affirmation non vérifiée\. — non vérifiée/);
});

test('T-QG01-31 Architecte : une projection perdue arrête la compilation', () => {
  const arch = architecte({ muter: (c) => { c.output.opening = 'Une ouverture exigée.'; } });
  assert.equal(arch.prompt, '', 'aucun prompt n’est rendu');
  assert.equal(arch.harness.sortieDOM, '');
});

test('T-QG01-32 Architecte : une trace malformée ferme le chemin', () => {
  /* La garde partagée — celle qu'appelle le compilateur — ferme sur toute
     trace illisible, et le compilateur s'arrête sur son verdict (T-QG01-43). */
  const { harness } = architecte({});
  const runtime = harness.runtime;
  for (const trace of [null, undefined, { entries: 42 }, { entries: 'illisible' }]) {
    const v = runtime.guardPromptContract({
      canonical_contract: architecte({}).contrat, prompt: 'p', selected_locks: [], projection_trace: trace
    });
    assert.equal(v.status, 'FAIL', 'TECHNICAL_VALIDATION_FAILURE_FAILS_CLOSED = YES');
    assert.ok(v.violations.every((x) => x.code === 'TECHNICAL_VALIDATION_FAILURE'));
    assert.equal(v.trace.fail_closed, true);
  }
});

/* ======================================================================== *
 * §53 — FAUX POSITIFS
 * ======================================================================== */

test('T-QG01-33 un destinataire absent ne crée aucune exigence', () => {
  const contrat = contratBase();
  assert.equal(contrat.intent.recipient, null, 'ADN-RECIPIENT-00 : non corrigé ici');
  const { harness, resultat } = rapide({ contrat });
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const req = runtime.collectCanonicalRequirements(resultat.canonical.contract).find((r) => r.key === 'recipient');
  assert.equal(req.status, 'NOT_APPLICABLE');
  assert.notEqual(resultat, null);
});

test('T-QG01-34 une amorce absente ne crée aucune exigence', () => {
  const { harness, resultat } = rapide({});
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const req = runtime.collectCanonicalRequirements(resultat.canonical.contract).find((r) => r.key === 'opening_closing');
  assert.equal(req.status, 'NOT_APPLICABLE');
  assert.equal(resultat.qg, 'PASS');
});

test('T-QG01-35 une politique de longueur absente ne crée aucune exigence', () => {
  const { harness, resultat } = rapide({});
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const req = runtime.collectCanonicalRequirements(resultat.canonical.contract).find((r) => r.key === 'length');
  assert.equal(req.status, 'NOT_APPLICABLE');
});

test('T-QG01-36 un contrat nu passe : aucune obligation artificielle', () => {
  const { harness, resultat } = rapide({ demande: 'Rédige une note.' });
  assert.notEqual(resultat, null);
  assert.equal(resultat.qg, 'PASS');
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const reqs = runtime.collectCanonicalRequirements(resultat.canonical.contract);
  for (const cle of ['role', 'recipient', 'provenance', 'assumptions', 'scope', 'forbidden', 'opening_closing', 'length']) {
    assert.equal(reqs.find((r) => r.key === cle).status, 'NOT_APPLICABLE', cle);
  }
});

/* ======================================================================== *
 * §54 — FAUX NÉGATIFS
 * ======================================================================== */

/** Ampute la trace native d'une clé et mesure le verdict de production. */
function amputer(cle) {
  return rapide({
    demande: 'Analyse le texte fourni. Donne exactement 7 exemples sous forme de liste.',
    materiau: 'Matériau utilisateur à traiter.',
    patch: `rapideTraceNative=(function(o){return function(b,p){var t=o(b,p);return {version:t.version,request_id:t.request_id,native_from_compiler:true,lock_selection_observed:true,entries:t.entries.filter(function(e){return e.key!==${JSON.stringify(cle)}})}}})(rapideTraceNative)`
  }).resultat;
}

test('T-QG01-37 une quantité retirée de la projection est détectée', () => {
  assert.notEqual(rapide({ demande: 'Analyse le texte fourni. Donne exactement 7 exemples sous forme de liste.', materiau: 'Matériau utilisateur à traiter.' }).resultat, null);
  assert.equal(amputer('quantity'), null);
});

test('T-QG01-38 un format altéré est détecté', () => {
  const resultat = rapide({
    demande: 'Construis un tableau comparatif.',
    patch: 'rapideTraceNative=(function(o){return function(b,p){var t=o(b,p);t.entries.forEach(function(e){if(e.key==="format")e.value={format:"liste"}});return t}})(rapideTraceNative)'
  }).resultat;
  assert.equal(resultat, null);
});

test('T-QG01-39 un périmètre retiré est détecté', () => {
  const arch = architecte({
    analyse: (() => { const a = analyseFixture(); a.compilation.composants_ecartes = [{ type: 'interdiction', contenu: 'Écarté.', justification: 'Hors périmètre.' }]; return a; })(),
    /* Le signal de périmètre demeure, mais plus aucun cadrage n'est rendu :
       la contrainte existe au contrat et disparaît du prompt. */
    muter: (c) => { c.semantic_lock_signals.signals = c.semantic_lock_signals.signals.map((x) => ({ ...x, reason: '' })); c.selected_locks = { locks: [], decisions: [] }; }
  });
  assert.equal(arch.prompt, '', 'une contrainte de périmètre non projetée est détectée');
});

test('T-QG01-40 une provenance retirée est détectée', () => {
  const a = analyseFixture();
  a.verification.controle_provenance = [{ affirmation: 'Affirmation.', statut: 'connaissance_externe_non_verifiee', justification: 'y' }];
  assert.ok(architecte({ analyse: a }).prompt.length > 0);
  const arch = architecte({
    analyse: a,
    muter: (c) => { c.evidence.provenance = [...c.evidence.provenance, { statement_id: 'p9', claim: '', source_type: 'arch_analysis', source_ref: null, verification_status: 'unverified' }]; }
  });
  assert.equal(arch.prompt, '', 'une affirmation non projetée est détectée');
});

test('T-QG01-41 une hypothèse interdite retirée est détectée', () => {
  const a = analyseFixture();
  a.strategie.hypotheses_interdites = ['Ne pas supposer une échéance.'];
  assert.ok(architecte({ analyse: a }).prompt.length > 0);
  const arch = architecte({
    analyse: a,
    muter: (c) => { c.assumptions.forbidden = [...c.assumptions.forbidden, { text: '', source: 'arch_analysis', origin_field: 'strategie.hypotheses_interdites[9]' }]; }
  });
  assert.equal(arch.prompt, '', 'une hypothèse interdite non projetée est détectée');
});

test('T-QG01-42 un matériau non délimité est détecté', () => {
  assert.equal(amputer('data'), null);
  const resultat = rapide({
    demande: 'Analyse le texte fourni.', materiau: 'Matériau utilisateur à traiter.',
    patch: 'rapideTraceNative=(function(o){return function(b,p){var t=o(b,p);t.entries.forEach(function(e){if(e.key==="data")e.value={delimited:false}});return t}})(rapideTraceNative)'
  }).resultat;
  assert.equal(resultat, null);
});

/* ======================================================================== *
 * §55 — ORDRE D'EXÉCUTION
 * ======================================================================== */

test('T-QG01-43 le contrôle précède toute exposition du prompt', () => {
  const source = HTML;
  const compilateur = source.slice(source.indexOf('function archCompiler('), source.indexOf('const ARCH_SAUVEGARDE_VERSION='));
  const posGate = compilateur.indexOf('archControleQg(');
  const posExpo = compilateur.indexOf("aq('#arch-sortie').textContent=out");
  assert.ok(posGate > -1 && posExpo > -1);
  assert.ok(posGate < posExpo, 'le gate s’exécute avant l’écriture du prompt dans le DOM');
});

test('T-QG01-44 un échec bloque avant l’Execution Readiness', () => {
  const arch = architecte({ muter: (c) => { c.output.opening = 'Une ouverture exigée.'; } });
  assert.equal(arch.prompt, '');
  /* Le compilateur rend '' : tout appelant s'arrête sur ce test, avant readiness. */
  const bloc = HTML.slice(HTML.indexOf('async function archConstruireExecuter('));
  const posCompiler = bloc.indexOf('archCompiler()');
  const posStop = bloc.indexOf('if(!prompt)return false');
  assert.ok(posCompiler > -1 && posStop > posCompiler && posStop - posCompiler < 60,
    'archConstruireExecuter s’arrête immédiatement sur un prompt vide');
});

test('T-QG01-45 un verdict favorable atteint la suite du parcours', () => {
  const { prompt, harness } = architecte({});
  assert.ok(prompt.length > 0);
  assert.equal(harness.sortieDOM, prompt, 'QG_PASS_REACHES_EXECUTION_READINESS = YES');
});

test('T-QG01-46 aucun fournisseur final n’est appelé sur un échec', () => {
  const arch = architecte({ patch: 'archTraceNative=function(){return null}' });
  assert.deepEqual(arch.harness.network, []);
  const rap = rapide({ patch: 'rapideTraceNative=function(){return {entries:"illisible"}}' });
  assert.deepEqual(rap.harness.network, []);
});

test('T-QG01-47 le fournisseur final ne peut pas s’exécuter avant un verdict favorable', () => {
  const source = sansCommentaires(HTML);
  const bloc = source.slice(source.indexOf('async function archConstruireExecuter('), source.indexOf('async function archConstruireExecuter(') + 4000);
  const posCompiler = bloc.indexOf('archCompiler()');
  const posGarde = bloc.indexOf('if(!prompt)return false');
  assert.ok(posCompiler > -1 && posGarde > posCompiler,
    'FINAL_EXECUTION_PROVIDER_CAN_RUN_BEFORE_QG_PASS = NO');
});

/* ======================================================================== *
 * §56 — TRACE
 * ======================================================================== */

test('T-QG01-48 une trace incomplète ne passe pas silencieusement', () => {
  /* Le prompt est intact ; seule la trace est amputée. Le chemin doit échouer. */
  const resultat = amputer('format');
  assert.equal(resultat, null, 'TRACE_COMPLETE : un prompt correct ne rachète pas une trace incomplète');
});

test('T-QG01-49 une trace qui prétend une projection inexistante est détectée', () => {
  const { harness } = rapide({});
  const nominal = rapide({}).resultat;
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const fabriquee = runtime.buildProjectionTrace(
    nominal.trace.entries.concat([{ key: 'recipient', present: true, value: { recipient: 'inventé' }, rendered: '[x]', source: 'test' }]),
    { native_from_compiler: true }
  );
  const verdict = runtime.guardPromptContract({
    canonical_contract: nominal.canonical.contract, prompt: nominal.prompt,
    selected_locks: nominal.canonical.envelope.locks.locks, projection_trace: fabriquee
  });
  assert.equal(verdict.status, 'FAIL');
  assert.ok(verdict.violations.some((v) => v.code === 'UNSUPPORTED_INSTRUCTION'));
});

test('T-QG01-50 la trace est stable entre deux exécutions indépendantes', () => {
  const a = rapide({}).resultat.trace, b = rapide({}).resultat.trace;
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'TRACE_STABLE = YES');
  assert.equal(JSON.stringify(cles(a)), JSON.stringify(cles(b)));
});

test('T-QG01-51 aucune trace ne porte de champ de readiness', () => {
  const { harness } = rapide({});
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const audit = runtime.auditProjectionTrace(rapide({}).resultat.trace);
  assert.equal(audit.readiness_fields, 0, 'TRACE_READINESS_FIELDS = 0');
  assert.throws(() => runtime.buildProjectionTrace([{ key: 'format', present: true, readiness: 'ready' }]), /readiness/);
});

test('T-QG01-52 aucune trace ne porte de champ de route', () => {
  const { harness } = rapide({});
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const audit = runtime.auditProjectionTrace(architecte({}).trace);
  assert.equal(audit.route_fields, 0, 'TRACE_ROUTE_FIELDS = 0');
  assert.throws(() => runtime.buildProjectionTrace([{ key: 'format', present: true, route: 'rapide' }]), /route/);
});

test('T-QG01-53 aucune trace n’invente de sémantique', () => {
  const { harness } = rapide({});
  const runtime = harness.evaluate('window.__ATELIER_ADN_RUNTIME__');
  const audit = runtime.auditProjectionTrace(rapide({}).resultat.trace);
  assert.equal(audit.inferred_semantic_fields, 0, 'TRACE_INFERRED_SEMANTIC_FIELDS = 0');
  for (const champ of ['inferred_intent', 'new_obligation', 'new_quantity', 'new_recipient']) {
    assert.throws(() => runtime.buildProjectionTrace([{ key: 'format', present: true, [champ]: 'x' }]), new RegExp(champ));
  }
  /* Et la trace ne contient que des clés d'exigences canoniques connues. */
  const nominal = rapide({}).resultat;
  const connues = new Set(runtime.collectCanonicalRequirements(nominal.canonical.contract).map((r) => r.key));
  for (const e of nominal.trace.entries) assert.ok(connues.has(e.key), `clé inconnue : ${e.key}`);
});
