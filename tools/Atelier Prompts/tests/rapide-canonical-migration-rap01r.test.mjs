/* REPRISE-ADN-RAPIDE-01 — LE CONTRAT CANONIQUE EST LA SOURCE SÉMANTIQUE RAPIDE
 * ============================================================================
 *
 * Sur le chemin moderne — celui qui arrive d'un tour OPRIE — le prompt Rapide
 * est désormais entièrement gouverné par le contrat canonique enrichi :
 *
 *   canonical_base → enrichRapidCanonicalContract → buildExecutionEnvelope
 *   → selectAdaptiveLocks → projectToRapide → assembler
 *
 * MÉTHODE DE COMPTAGE DES SOURCES, pour que le chiffre ne soit pas décoratif :
 *   une lecture legacy est ACTIVE si sa valeur peut atteindre le prompt rendu.
 *   Les tests l'établissent en EMPOISONNANT les détecteurs historiques et en
 *   vérifiant que le prompt ne bouge pas d'un octet.
 *
 * Le chemin LEGACY — l'onglet Rapide sans tour OPRIE — garde son comportement
 * historique : RAPIDE-CHAR-00 reste la référence de ce chemin, inchangée.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADAPTIVE_LOCK_IDS } from '../core/adn/adaptive-lock-selector.js';
import { buildExecutionEnvelope } from '../core/adn/engine-adapters.js';
import { canonicalFrom, oprieReadyTurn, productionSlice } from './post-oprie-validation-harness.helper.mjs';
import { createRapideHarness, hasSection, runRapidePipeline, sectionBody, sectionTitles } from './rapide-assembler-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const clone = (v) => JSON.parse(JSON.stringify(v));

function baseFor(demande, candidat = {}, state = 'operational_request_ready') {
  return canonicalFrom(oprieReadyTurn({
    state,
    operational_request_candidate: {
      objective: 'Objectif validé.', expected_deliverable: 'Un livrable nommé.',
      secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
      confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [],
      assumptions_allowed: [], remaining_unknowns: [], ...candidat
    }
  }), { request_id: 'rap01r', original_request: demande });
}
const orientationFor = (base) => ({
  source: 'oprie', route: 'rapide', oprie: { state: base.executability.oprie_state },
  canonical: base, envelope: null, semantic: null, providerResult: null, action: null, decision: { state: 'ready' }
});
const jouer = (demande, { materiau = '', candidat = {} } = {}) =>
  runRapidePipeline({ demande, materiau, orientation: orientationFor(baseFor(demande, candidat)) });

/* ==========================================================================
 * T-RAP01R-01 … 05 — SOURCE ET AUTORITÉS
 * ======================================================================= */

test('T-RAP01R-01 la sémantique canonique est active sur le chemin moderne', () => {
  const moteur = strip(productionSlice('function rapideProjectionCanonique(', 'function rapideAppliquerCanoniqueAuContexte('));
  assert.match(moteur, /canonical_semantics:true/, 'CANONICAL_SEMANTICS_ACTIVE = YES');
  assert.match(moteur, /runtime\.enrichRapidCanonicalContract\(/, 'RAPIDE_CANONICAL_ENRICHER_ACTIVE = YES');
  assert.match(moteur, /runtime\.projectToRapide\(/);

  const p = jouer('Donne 7 idées pour améliorer un processus.');
  assert.ok(p.r.canonical, 'le moteur a bien basculé sur la voie canonique');
  assert.equal(p.r.canonical.envelope.state.executability.state, 'exploitable');
});

test('T-RAP01R-02 RAPIDE_ACTIVE_SEMANTIC_SOURCE_COUNT = 1 — mesuré, pas déclaré', () => {
  const demande = 'Donne exactement 7 idées sous forme de tableau.';
  const reference = jouer(demande).promptFinal;

  /* Les détecteurs historiques sont EMPOISONNÉS : s'ils avaient la moindre
     autorité, le prompt changerait. Il ne change pas d'un octet. */
  const harness = createRapideHarness({ demande, materiau: '' });
  harness.context.rapideAppliquerContratCanonique(baseFor(demande));
  harness.context.detecterFormat = () => ({ format: 'reponse_simple', score: 99, second: null });
  harness.context.detecterQuantite = () => ({ min: 999, max: 999 });
  const empoisonne = harness.assemblerRapideAdaptatif();

  assert.equal(empoisonne.prompt, reference, 'aucune dérivation legacy n’atteint le prompt');
  assert.doesNotMatch(empoisonne.prompt, /999/, 'la quantité empoisonnée n’apparaît nulle part');
  assert.equal(empoisonne.format, 'tableau_comparatif', 'le format vient du contrat, pas du détecteur');
});

test('T-RAP01R-03 ACTIVE_RAPIDE_LEGACY_SEMANTIC_READS = 0 sur le chemin moderne', () => {
  const moteur = strip(productionSlice('function assemblerRapideAdaptatif(){', 'async function copierRapideAdaptatif'));
  /* Les détecteurs sont encore appelés par des fonctions gelées, mais leur
     résultat est systématiquement écrasé ou ignoré quand un contrat existe. */
  assert.match(moteur, /format=\(p&&p\.format\)\|\|d\.format/, 'le format canonique prime');
  assert.match(moteur, /if\(p\)rapideAppliquerCanoniqueAuContexte\(ctx,p\)/, 'le contexte est écrasé par le canonique');
  assert.match(moteur, /const actifs=p\?p\.locks:/, 'les verrous viennent de l’ADN dès qu’un contrat existe');
});

test('T-RAP01R-04 OLD_SELECTOR_ACTIVE_COUNT = 0 sur le chemin moderne', () => {
  const demande = 'Écris une fonction qui trie une liste.';
  const reference = jouer(demande).promptFinal;

  /* Les sélecteurs historiques sont neutralisés : leur sortie n'a plus de prise. */
  const harness = createRapideHarness({ demande, materiau: '' });
  harness.context.rapideAppliquerContratCanonique(baseFor(demande));
  harness.context.actifsAdaptes = () => ['role', 'destinataire', 'donnees', 'amorce', 'longueur', 'gabarit'];
  assert.equal(harness.assemblerRapideAdaptatif().prompt, reference, 'actifsAdaptes n’a plus aucune prise');

  const harness2 = createRapideHarness({ demande, materiau: '' });
  harness2.context.rapideAppliquerContratCanonique(baseFor(demande));
  harness2.context.profilDuFormat = () => ({ verrous: ['role', 'amorce', 'longueur'], donneesObligatoire: true });
  const avecProfil = harness2.assemblerRapideAdaptatif();
  assert.deepEqual(clone(avecProfil.actifs), clone(jouer(demande).mergedLocks), 'profilDuFormat ne sélectionne plus rien');
});

test('T-RAP01R-05 ADN_SELECTOR_ACTIVE_COUNT = 1 — l’ADN est seul à sélectionner', () => {
  const p = jouer('Donne 7 idées pour améliorer un processus.');
  assert.deepEqual(clone(p.r.actifs), clone(p.r.canonical.projection.legacy_lock_ids),
    'les verrous rendus sont exactement ceux que l’ADN a retenus');
  for (const id of p.r.canonical.projection.lock_ids) assert.ok(ADAPTIVE_LOCK_IDS.includes(id));

  const moteur = strip(productionSlice('function rapideProjectionCanonique(', 'function rapideAppliquerCanoniqueAuContexte('));
  assert.equal(/selected\s*[:=]\s*true/.test(moteur), false, 'la couche Rapide ne sélectionne rien elle-même');
});

/* ==========================================================================
 * T-RAP01R-06 … 16 — LES VERROUS VIENNENT DU CONTRAT
 * ======================================================================= */

test('T-RAP01R-06 [SÉCURITÉ] le verrou de délimitation survit dès qu’un matériau existe', () => {
  const avec = jouer('Résume ce texte.', { materiau: 'Un texte à résumer.' });
  assert.ok(avec.mergedLocks.includes('donnees'), 'DATA_LOCK_PRESERVED_WITH_MATERIAL = YES');
  assert.match(avec.promptFinal, /<<</, 'le matériau est bien délimité par marqueurs');

  /* Sans matériau, il n'y a rien à délimiter : le verrou n'est pas forcé. */
  const sans = jouer('Résume ce texte.');
  assert.equal(sans.mergedLocks.includes('donnees'), false);
});

test('T-RAP01R-07 le format projeté vient de output.format', () => {
  const p = jouer('Donne le résultat sous forme de tableau.');
  assert.equal(p.r.canonical.contract.output.format, p.r.format);
  assert.ok(p.mergedLocks.includes('format'));
  assert.equal(p.r.canonical.contract.output.sources.format, 'derived_deterministic');
});

test('T-RAP01R-08 une quantité exacte traverse le contrat jusqu’au prompt', () => {
  const p = jouer('Donne exactement 7 idées.');
  assert.deepEqual(clone(p.r.canonical.contract.quantities[0]), {
    target: 'éléments', unit: null, exact: 7, min: null, max: null, source: 'derived_deterministic'
  });
  assert.ok(p.mergedLocks.includes('volume'));
  const volume = sectionBody(p.promptFinal, 'CONTRAINTES QUANTIFIÉES');
  assert.match(volume, /Exactement 7/);
  for (const interdit of ['Au moins 7', 'Minimum 7', 'Entre 7 et 7', 'Au maximum 7']) {
    assert.equal(volume.includes(interdit), false, `QUANTITY_EXACT_PROJECTION_VALID (${interdit})`);
  }
});

test('T-RAP01R-09 un destinataire absent n’est jamais inventé', () => {
  for (const demande of ['Rédige un email de relance.', 'Compare trois options dans un tableau.']) {
    const p = jouer(demande);
    assert.equal(p.r.canonical.contract.intent.recipient, null);
    assert.equal(p.mergedLocks.includes('destinataire'), false, 'RECIPIENT_INVENTED_IF_ABSENT = NO');
    assert.equal(hasSection(p.promptFinal, 'DESTINATAIRE'), false);
  }
});

test('T-RAP01R-10 / 11 amorce et longueur ne sont plus forcées sans source canonique', () => {
  for (const demande of ['Explique la différence entre deux approches.', 'Donne 7 idées.', 'Rédige un email de relance.']) {
    const p = jouer(demande);
    assert.equal(p.r.canonical.contract.output.opening, null);
    assert.equal(p.r.canonical.contract.output.closing, null);
    assert.equal(p.r.canonical.contract.output.length_policy, null);
    assert.equal(p.mergedLocks.includes('amorce'), false, 'OPENING_FORCED_WITHOUT_CANONICAL_SOURCE = NO');
    assert.equal(p.mergedLocks.includes('longueur'), false, 'LENGTH_FORCED_WITHOUT_CANONICAL_SOURCE = NO');
  }
});

test('T-RAP01R-12 / 13 / 14 hypothèses, provenance et périmètre viennent du contrat', () => {
  assert.ok(jouer('Explique la différence.', { candidat: { assumptions_allowed: ['Hypothèse autorisée.'] } })
    .mergedLocks.includes('hypotheses'), 'assumptions.allowed → verrou hypothèses');
  assert.ok(jouer('Explique la différence.', { candidat: { external_facts_to_research: ['Fait externe.'] } })
    .mergedLocks.includes('provenance'), 'evidence → verrou provenance');
  assert.ok(jouer('Explique la différence.', { candidat: { confirmed_constraints: ['Contrainte confirmée.'] } })
    .mergedLocks.includes('perimetre'), 'contraintes confirmées → verrou périmètre');
  /* Et rien n'apparaît sans source. */
  const nu = jouer('Explique la différence.');
  for (const id of ['hypotheses', 'provenance', 'perimetre']) assert.equal(nu.mergedLocks.includes(id), false, id);
});

test('T-RAP01R-15 le plan projeté vient de output.structure', () => {
  const demande = 'Explique la différence.';
  const base = baseFor(demande);
  const harness = createRapideHarness({ demande, materiau: '' });
  /* Une structure canonique — telle qu'un enrichissement amont la fournirait. */
  const avecPlan = clone(base);
  avecPlan.output.structure = ['Contexte', 'Analyse'];
  harness.context.rapideAppliquerContratCanonique(avecPlan);
  const r = harness.assemblerRapideAdaptatif();
  assert.ok(r.actifs.includes('gabarit'), 'output.structure → verrou plan');
  assert.match(r.prompt, /Contexte/);
  assert.equal(jouer(demande).mergedLocks.includes('gabarit'), false, 'sans structure, aucun plan');
});

test('T-RAP01R-16 le contrôle final est adossé aux contrôles canoniques', () => {
  const p = jouer('Donne exactement 7 idées.');
  assert.ok(p.r.canonical.contract.checks.length > 0, 'des contrôles déterministes existent');
  assert.equal(p.r.canonical.contract.checks.every((c) => c.type === 'deterministic'), true, 'CHECK_TYPES_PRESERVED');
  assert.ok(p.mergedLocks.includes('controle'));
  const sans = jouer('Explique la différence.');
  assert.deepEqual(clone(sans.r.canonical.contract.checks), [], 'aucun contrôle inventé');
});

/* ==========================================================================
 * T-RAP01R-17 … 24 — GOUVERNANCE INCHANGÉE
 * ======================================================================= */

test('T-RAP01R-17 fallbackDecision reste inatteignable sur le chemin canonique', () => {
  const adapters = fs.readFileSync(path.join(root, 'core/adn/engine-adapters.js'), 'utf8');
  const bloc = strip(adapters.slice(adapters.indexOf('const decisionForState'), adapters.indexOf('const state = buildAdnState')));
  assert.match(bloc, /attachedBase !== null\s*\?\s*assertCanonicalReadinessInvariant/);
  const moteur = strip(productionSlice('function rapideProjectionCanonique(', 'function rapideAppliquerCanoniqueAuContexte('));
  assert.equal(moteur.includes('fallbackDecision'), false);
});

test('T-RAP01R-18 / 19 / 20 / 21 aucune promotion, aucune démotion, route cohérente', () => {
  for (const state of ['clarification_required', 'confirmation_required', 'blocked']) {
    const base = baseFor('Donne 7 idées.', {}, state);
    assert.equal(base.executability.state, 'clarification_necessaire');
    assert.throws(() => buildExecutionEnvelope({
      canonical_base: base, canonical_semantics: true, material: '',
      provider_result: { source: 'none', decision: { etat_demande: 'exploitable', route: 'rapide', confiance: 'haute', raison_interne: 't', question: null } }
    }), /Garde readiness/, `${state} : aucune promotion`);
    /* Et le moteur Rapide n'en tire aucune projection : il retombe sur le legacy. */
    const harness = createRapideHarness({ demande: 'Donne 7 idées.', materiau: '' });
    harness.context.rapideAppliquerContratCanonique(base);
    assert.equal(harness.assemblerRapideAdaptatif().canonical, null, `${state} : aucune voie canonique ouverte`);
  }
  /* Démotion impossible dans l'autre sens. */
  assert.throws(() => buildExecutionEnvelope({
    canonical_base: baseFor('Donne 7 idées.'), canonical_semantics: true, material: '',
    provider_result: { source: 'none', decision: { etat_demande: 'clarification_necessaire', route: null, confiance: 'haute', raison_interne: 't', question: null } }
  }), /Garde readiness/);
  /* READY exige une route. */
  assert.equal(jouer('Donne 7 idées.').r.canonical.envelope.routing.route, 'rapide');
});

test('T-RAP01R-22 / 23 aucune readiness locale, aucune boucle de dialogue', () => {
  const couche = strip(productionSlice('let rapideContratCanonique=', 'function assemblerRapideAdaptatif(){'));
  for (const interdit of ["'operational_request_ready'", 'critical_missing', 'substitutable_missing',
    'showQuestion', 'next_question', 'questions_a_poser', 'pendingQuestion=true', 'confirm(']) {
    assert.equal(couche.includes(interdit), false, `${interdit}`);
  }
  /* `'clarification_necessaire'` n'apparaît que comme REPRISE de l'état lu dans
     la base, transmise à la garde qui refusera toute route. Jamais une décision. */
  for (const occurrence of couche.split("'clarification_necessaire'").slice(0, -1)) {
    assert.match(occurrence.slice(-120), /etat_demande:executable\?'exploitable':$/,
      'l’état non exécutable n’est que la reprise de la base');
  }
  assert.match(couche, /executability\.state==='exploitable'/);
  assert.match(couche, /route:executable\?'rapide':null/);
});

test('T-RAP01R-24 original_request reste immuable de bout en bout', () => {
  const demande = 'Demande originale — « guillemets », tirets — inchangée.';
  const base = baseFor(demande);
  const avant = JSON.stringify(base);
  const p = jouer(demande);
  assert.equal(JSON.stringify(base), avant, 'la base n’est pas mutée');
  assert.equal(p.r.canonical.contract.original_request, demande);
  assert.equal(p.r.canonical.envelope.canonical_base.original_request, demande);
});

/* ==========================================================================
 * T-RAP01R-25 … 29 — CONTEXTE, DÉTERMINISME, PURETÉ
 * ======================================================================= */

test('T-RAP01R-25 le contexte Rapide est alimenté depuis le contrat canonique', () => {
  const demande = 'Explique la différence.';
  const enrichi = clone(baseFor(demande));
  enrichi.intent.recipient = 'un lectorat défini';
  enrichi.output.structure = ['Contexte', 'Analyse'];

  const harness = createRapideHarness({ demande, materiau: '' });
  harness.context.rapideAppliquerContratCanonique(enrichi);
  const r = harness.assemblerRapideAdaptatif();

  assert.equal(r.ctx.destinataire, 'un lectorat défini', 'RAPIDE_CONTEXT_CANONICAL_FEED = YES');
  assert.equal(r.ctx.gabarit, 'Contexte\nAnalyse');
  /* Et ce que le contrat ne porte pas reste vide, jamais inventé. */
  const nu = jouer(demande);
  assert.equal(nu.r.ctx.destinataire, '');
  assert.equal(nu.r.ctx.gabarit, '');
});

test('T-RAP01R-26 mêmes entrées → même prompt, octet pour octet', () => {
  const a = jouer('Donne exactement 7 idées sous forme de tableau.', { materiau: 'M.' });
  const b = jouer('Donne exactement 7 idées sous forme de tableau.', { materiau: 'M.' });
  assert.equal(a.promptFinal, b.promptFinal);
  assert.deepEqual(a.mergedLocks, b.mergedLocks);
});

test('T-RAP01R-27 / 28 aucun réseau, aucun fournisseur pendant l’assemblage', () => {
  const tentatives = [];
  const sauvegarde = { fetch: globalThis.fetch };
  globalThis.fetch = (...a) => { tentatives.push(String(a[0])); throw new Error('interdit'); };
  try {
    const p = jouer('Donne exactement 7 idées.', { materiau: 'M.' });
    assert.ok(p.promptFinal.length > 0);
    assert.deepEqual(p.harness.network, []);
  } finally { Object.assign(globalThis, sauvegarde); }
  assert.deepEqual(tentatives, []);
  const couche = strip(productionSlice('let rapideContratCanonique=', 'function assemblerRapideAdaptatif(){'));
  for (const interdit of ['appelFournisseur', 'groq', 'anthropic', 'openai']) {
    assert.equal(couche.toLowerCase().includes(interdit.toLowerCase()), false, interdit);
  }
});

test('T-RAP01R-29 DOMAIN_HARDCODING_ADDED = NO', () => {
  const couche = strip(productionSlice('let rapideContratCanonique=', 'function assemblerRapideAdaptatif(){'));
  for (const interdit of ['case_id', 'embedding', 'fuzzy', 'levenshtein', 'similarity', 'corpus']) {
    assert.equal(couche.toLowerCase().includes(interdit), false, interdit);
  }
  /* Le vocabulaire de formats est LU dans la table gelée, jamais réécrit. */
  assert.match(couche, /Object\.keys\(FORMATS\)\.map/);
  for (const marqueur of ['diaporama', 'quiz', 'courriel']) {
    assert.equal(new RegExp(`['"\`]${marqueur}`, 'i').test(couche), false, `aucun marqueur écrit (${marqueur})`);
  }
});

/* ==========================================================================
 * T-RAP01R-30 … 35 — QUALITÉ DU PROMPT ET COUVERTURE
 * ======================================================================= */

const CAS_QUALITE = [
  ['simple', 'Explique la différence entre deux approches.', '', {}],
  ['liste', 'Donne 7 idées pour améliorer un processus.', '', {}],
  ['tableau', 'Compare trois options dans un tableau.', '', {}],
  ['email', 'Rédige un email de relance.', '', {}],
  ['code', 'Écris une fonction qui trie une liste.', '', {}],
  ['materiau', 'Résume ce texte.', 'Un texte à résumer.', {}],
  ['exact', 'Donne exactement 7 idées.', '', {}],
  ['range', 'Donne entre 3 et 5 idées.', '', {}],
  ['assumptions', 'Explique la différence.', '', { assumptions_allowed: ['Hypothèse autorisée.'] }],
  ['provenance', 'Explique la différence.', '', { external_facts_to_research: ['Fait externe.'] }],
  ['scope', 'Explique la différence.', '', { confirmed_constraints: ['Contrainte confirmée.'] }],
  ['format', 'Donne le résultat sous forme de tableau.', '', {}]
];

test('T-RAP01R-30 / 31 / 32 aucun doublon, aucune section vide, aucune contradiction, aucun verrou non justifié', () => {
  for (const [nom, demande, materiau, candidat] of CAS_QUALITE) {
    const p = jouer(demande, { materiau, candidat });
    const titres = sectionTitles(p.promptFinal);

    assert.equal(new Set(titres).size, titres.length, `${nom} : DUPLICATE_INSTRUCTION_COUNT = 0`);
    for (const titre of titres) assert.ok(sectionBody(p.promptFinal, titre), `${nom} : section vide ${titre}`);
    assert.doesNotMatch(p.promptFinal, /undefined|NaN|null\b/, `${nom} : CONTRADICTION_COUNT = 0`);
    assert.doesNotMatch(p.promptFinal, /Minimum null|Exactement null/, `${nom} : quantité incohérente`);
    assert.deepEqual(clone(p.mergedLocks), clone(p.r.canonical.projection.legacy_lock_ids),
      `${nom} : UNSUPPORTED_LOCK_COUNT = 0 — aucun verrou hors sélection ADN`);
  }
});

test('T-RAP01R-33 la formulation de quantité exacte est unique et correcte', () => {
  const p = jouer('Donne exactement 7 idées.');
  const occurrences = (p.promptFinal.match(/Exactement 7/g) || []).length;
  assert.equal(occurrences, 1, 'une seule formulation, sans redite');
  assert.doesNotMatch(p.promptFinal, /au moins 7|minimum 7/i);
});

test('T-RAP01R-34 le prompt ne s’alourdit pas : delta mesuré par cas', () => {
  const mesures = [];
  for (const [nom, demande, materiau, candidat] of CAS_QUALITE) {
    const legacy = runRapidePipeline({ demande, materiau });
    const canonique = jouer(demande, { materiau, candidat });
    mesures.push({ nom, old: legacy.promptFinal.length, neuf: canonique.promptFinal.length });
  }
  /* Aucun cas ne devient substantiellement plus lourd : les seules hausses
     correspondent à des verrous GAGNÉS, justifiés par le contrat. */
  for (const m of mesures) {
    const delta = (m.neuf - m.old) / m.old;
    assert.ok(delta < 0.25, `${m.nom} : +${Math.round(delta * 100)} % — hausse à justifier`);
  }
  assert.ok(mesures.filter((m) => m.neuf < m.old).length >= 8, 'la majorité des prompts s’allègent');
});

test('T-RAP01R-35 les 13 verrous restent projetables ; une demande nue n’en force aucun', () => {
  const demande = 'Donne exactement 7 idées sous forme de tableau.';
  const riche = clone(baseFor(demande, {
    confirmed_constraints: ['Contrainte.'], assumptions_allowed: ['Hypothèse.'], external_facts_to_research: ['Fait.']
  }));
  riche.intent.recipient = 'un lectorat défini';
  riche.output.structure = ['A', 'B'];
  riche.output.length_policy = 'courte';
  riche.output.opening = 'Commencer directement.';
  riche.assumptions.forbidden = [{ text: 'Interdite.' }];

  const harness = createRapideHarness({ demande, materiau: 'Un matériau.' });
  harness.context.rapideAppliquerContratCanonique(riche);
  const r = harness.assemblerRapideAdaptatif();
  assert.deepEqual(r.canonical.projection.lock_ids, [...ADAPTIVE_LOCK_IDS], 'LOCKS_PROJECTABLE = 13 / 13');
  assert.equal(r.actifs.length, 13, 'les treize sont rendus');

  /* Et sur une demande nue, l'ADN n'en retient qu'une poignée : aucun forçage. */
  const nu = jouer('Explique la différence entre deux approches.');
  assert.ok(nu.mergedLocks.length <= 4, `demande nue : ${nu.mergedLocks.length} verrous`);
});
