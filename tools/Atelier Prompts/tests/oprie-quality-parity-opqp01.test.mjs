/* OPRIE-QUALITY-PARITY-01 — LA RÉFÉRENCE N'EXISTE PAS.
 * ============================================================================
 *
 * Le lot demandait de comparer la qualité profonde d'Anthropic à celle de Groq,
 * Groq faisant référence. Épinglé sans repli, Groq n'a produit que 2 décisions
 * gouvernées sur 12 : les dix autres tours se sont dégradés avant d'aboutir. La
 * référence attendue n'existe pas au quota actuel.
 *
 * CE QUI A TOUT DE MÊME ÉTÉ ÉTABLI. Anthropic tient 11 tours sur 12, avec UN seul
 * échec sur 60 appels contre DIX pour Groq. Mais il sur-questionne : 5 clarifications
 * demandées là où l'oracle du corpus n'en attend aucune, sur 11 décisions. Aucun faux
 * READY, aucune clarification manquée, aucun défaut critique. D'où PARTIAL.
 *
 * CE QUE CE FICHIER GARDE.
 *   1. L'ÉPINGLAGE EST RÉEL — 0 bascule, ordres ["groq"] et ["anthropic"] dans les
 *      journaux. Sans cela les deux runs seraient contaminés et ne compareraient rien.
 *   2. AUCUNE AUTORITÉ TEXTUELLE. Ni similarité, ni embedding, ni juge LLM, ni seuil.
 *   3. LA VÉRITÉ TERRAIN RESTE DANS SON PÉRIMÈTRE — question_required seulement.
 *   4. UN TOUR DÉGRADÉ EST UN RÉSULTAT CONTRACTUEL, pas un défaut de schéma.
 *   5. RIEN N'A MIGRÉ. Ordre de production, primaire, plan rapide : intacts.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ARBITER_STATES, OPRIE_ROLES } from '../workers/shared/operational-request-core.js';
import {
  ROLE_PROVIDER_ORDER, DECISION_PROVIDER_ORDER, FAST_PROVIDER_ORDER,
  resolveRoleProviderOrder, DEEP_BENCH_PROVIDER_BINDING, MODEL, ANTHROPIC_MODEL
} from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const R = JSON.parse(lire('evaluation/oprie-quality-parity-01/results.json'));
const DOC = lire('docs/OPRIE-QUALITY-PARITY-01.md');
const WORKER = lire('workers/groq/src/index.js');

/* T-OPQP01-01 — L'ÉPINGLAGE EST RÉEL DES DEUX CÔTÉS, sans contamination. */
test('T-OPQP01-01 : les deux runs sont réellement épinglés', () => {
  assert.deepEqual(R.epinglage.groq.ordres_observes, ['["groq"]']);
  assert.deepEqual(R.epinglage.anthropic.ordres_observes, ['["anthropic"]']);
  assert.equal(R.epinglage.groq.bascules, 0);
  assert.equal(R.epinglage.anthropic.bascules, 0);
  assert.equal(R.epinglage.contamination_count, 0, 'FAILOVER_CONTAMINATION_COUNT = 0');
  assert.equal(R.epinglage.groq.invocations, 12);
  assert.equal(R.epinglage.anthropic.invocations, 12);
  assert.equal(R.epinglage.groq.valide, true);
  assert.equal(R.epinglage.anthropic.valide, true);
  /* Le mécanisme lui-même : même contrat que celui du plan rapide. */
  assert.equal(DEEP_BENCH_PROVIDER_BINDING, 'DEEP_BENCH_PROVIDER');
  for (const f of ['groq', 'anthropic', 'openai']) {
    assert.deepEqual(resolveRoleProviderOrder({ DEEP_BENCH_PROVIDER: f }), [f]);
  }
  assert.throws(() => resolveRoleProviderOrder({ DEEP_BENCH_PROVIDER: 'auto' }), /invalide/);
});

/* T-OPQP01-02 — AUCUNE AUTORITÉ TEXTUELLE, à aucun endroit du dispositif. */
test('T-OPQP01-02 : ni similarité, ni embedding, ni juge LLM, ni seuil', () => {
  assert.equal(R.methode.similarite_textuelle_utilisee, false);
  assert.equal(R.methode.embeddings_utilises, false);
  assert.equal(R.methode.juge_llm_utilise, false);
  assert.equal(R.methode.seuil_semantique_arbitraire_count, 0);
  assert.match(R.methode.principe, /comparaison STRUCTURELLE et deterministe/);
  assert.match(DOC, /Aucune similarité textuelle, aucun embedding, aucun juge LLM, aucun seuil\s*\n?sémantique/);
  /* Et le verdict n'est pas un pourcentage : il est motivé. */
  assert.ok(R.verdict.raison.length > 100, 'le verdict porte sa raison, pas une moyenne opaque');
});

/* T-OPQP01-03 — LA VÉRITÉ TERRAIN RESTE DANS SON PÉRIMÈTRE, et sa limite est dite. */
test('T-OPQP01-03 : l’oracle n’est utilisé que là où il correspond', () => {
  assert.match(R.methode.verite_terrain, /Seul question_required est utilise/);
  assert.match(R.methode.limite_de_l_oracle, /ecrit pour le contrat \/decision/);
  assert.match(R.parite.verite_terrain.portee, /question_required uniquement/);
  /* Les quatre états existent bien, mais deux ne sont éprouvés par aucune attente. */
  assert.deepEqual([...ARBITER_STATES],
    ['clarification_required', 'confirmation_required', 'operational_request_ready', 'blocked']);
  assert.equal(R.parite.etats_groq.confirmation_required, 0);
  assert.equal(R.parite.etats_anthropic.confirmation_required, 0);
  assert.equal(R.parite.etats_groq.blocked, 0);
  assert.equal(R.parite.etats_anthropic.blocked, 0);
  assert.match(DOC, /Manque documenté :/);
});

/* T-OPQP01-04 — LE FAIT CENTRAL : Groq épinglé ne produit presque aucune décision. */
test('T-OPQP01-04 : la référence Groq n’a pas pu être établie', () => {
  assert.equal(R.parite.tours_gouvernes_groq, 2);
  assert.equal(R.parite.tours_degrades_groq, 10);
  assert.equal(R.parite.tours_gouvernes_anthropic, 11);
  assert.equal(R.parite.tours_degrades_anthropic, 1);
  assert.equal(R.parite.cas_comparables, 2, 'seuls deux cas ont DEUX décisions à comparer');
  assert.equal(R.verdict.reference_etablie, false);
  assert.match(R.verdict.raison_reference, /10 tours degrades sur 12/);
  /* Recalcul depuis les cas : le rapport ne s’auto-certifie pas. */
  assert.equal(R.parite.cas.filter((c) => c.groq.tour_gouverne).length, 2);
  assert.equal(R.parite.cas.filter((c) => c.anthropic.tour_gouverne).length, 11);
  assert.equal(R.parite.cas.filter((c) => c.comparable).length, R.parite.cas_comparables);
});

/* T-OPQP01-05 — UN TOUR DÉGRADÉ EST CONTRACTUEL, pas un schéma invalide. */
test('T-OPQP01-05 : le dégradé n’est pas compté comme défaut de schéma', () => {
  assert.equal(R.parite.schema.groq_invalide, 0);
  assert.equal(R.parite.schema.anthropic_invalide, 0);
  for (const c of R.parite.cas) {
    assert.equal(c.groq.schema_valide, true, `${c.fixture_id} : réponse Groq exploitable`);
    assert.equal(c.anthropic.schema_valide, true, `${c.fixture_id} : réponse Anthropic exploitable`);
    if (c.groq.degrade) assert.equal(c.groq.tour_gouverne, false);
  }
  const orchestrateur = lire('workers/shared/operational-request-orchestrator.js');
  assert.match(orchestrateur, /validateDegradedRoleResult/, 'le noyau valide explicitement ce résultat');
  assert.match(DOC, /Un tour dégradé est un résultat \*\*contractuel\*\*/);
});

/* T-OPQP01-06 — FIABILITÉ : un échec contre dix. */
test('T-OPQP01-06 : la fiabilité sépare les deux fournisseurs sans ambiguïté', () => {
  const somme = (o, champ) => Object.values(o).reduce((s, r) => s + r[champ], 0);
  assert.equal(somme(R.fiabilite.groq, 'echecs_fournisseur'), 10);
  assert.equal(somme(R.fiabilite.anthropic, 'echecs_fournisseur'), 0);
  assert.equal(somme(R.fiabilite.groq, 'echecs_schema'), 0);
  assert.equal(somme(R.fiabilite.anthropic, 'echecs_schema'), 1);
  assert.equal(somme(R.fiabilite.anthropic, 'reprises'), 0);
  assert.ok(somme(R.fiabilite.groq, 'reprises') > 0);
  /* Le nombre de cas ATTEINTS décroît chez Groq : un rôle qui échoue bloque les suivants. */
  assert.equal(R.fiabilite.groq.analyst.cas, 12);
  assert.ok(R.fiabilite.groq.critic.cas < R.fiabilite.groq.analyst.cas);
  assert.ok(R.fiabilite.groq.arbiter.cas < R.fiabilite.groq.critic.cas);
  for (const r of OPRIE_ROLES) assert.equal(R.fiabilite.anthropic[r].cas, 12, `${r} : tous les cas atteints`);
});

/* T-OPQP01-07 — LE DÉFAUT D'ANTHROPIC : sur-questionnement, mais aucun faux READY
 * ni aucune clarification manquée. C'est ce qui fait PARTIAL et non FAIL. */
test('T-OPQP01-07 : sur-questionnement mesuré, aucun défaut critique', () => {
  const vt = R.parite.verite_terrain;
  assert.equal(vt.anthropic.fausse_clarification, 5);
  assert.equal(vt.anthropic.clarification_manquee, 0, 'aucune clarification requise n’a été manquée');
  assert.equal(vt.anthropic.conforme, 6);
  assert.equal(R.defauts_anthropic.critical, 0, 'FALSE_READY et violations d’invariant : aucun');
  assert.equal(R.defauts_anthropic.major, 5);
  assert.equal(R.defauts_groq.critical, 0);
  /* Les quatre cas exigeant une question l’ont tous reçue chez Anthropic. */
  const exigent = R.parite.cas.filter((c) => c.oracle.question_required);
  assert.equal(exigent.length, 4);
  for (const c of exigent) {
    assert.equal(c.anthropic.state, 'clarification_required', `${c.fixture_id} : question posée`);
    assert.notEqual(c.anthropic.state, 'operational_request_ready', `${c.fixture_id} : aucun faux READY`);
  }
});

/* T-OPQP01-08 — le verdict est PARTIAL, motivé, et il ne déclenche pas la migration. */
test('T-OPQP01-08 : PARTIAL, et la migration reste fermée', () => {
  assert.equal(R.verdict.anthropic_deep_quality_parity, 'PARTIAL');
  assert.match(DOC, /ANTHROPIC_DEEP_QUALITY_PARITY = PARTIAL/);
  assert.match(DOC, /`DEEP-PROVIDER-ROUTING-01` \*\*n'est pas déclenché\*\*/);
  assert.equal(R.parite.desaccords.total, 1);
  assert.equal(R.parite.desaccords.groq_better, 1);
  assert.equal(R.parite.desaccords.anthropic_better, 0);
  assert.equal(R.parite.desaccords.non_comparables, 10);
});

/* T-OPQP01-09 — RIEN N'A MIGRÉ, rien n'a changé en production. */
test('T-OPQP01-09 : aucun ordre de production, aucun primaire, aucune migration', () => {
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq'], 'le plan rapide est intact');
  assert.deepEqual(resolveRoleProviderOrder({}), ['groq', 'anthropic', 'openai'],
    'sans variable, l’ordre des rôles est celui de production');
  assert.deepEqual(resolveRoleProviderOrder({ DEEP_BENCH_PROVIDER: 'ha' }), ['groq', 'anthropic', 'openai']);
  assert.match(lire('workers/groq/wrangler.jsonc'), /"DEEP_BENCH_PROVIDER": "ha"/);
  assert.equal(R.configuration.groq_model, MODEL);
  assert.equal(R.configuration.anthropic_model, ANTHROPIC_MODEL);
  /* L'épinglage n'est atteignable par aucune requête. */
  const produit = lire('atelier-prompts-v11.5-lot10g-decision-provider.html')
    + lire('workers/shared/operational-request-orchestrator.js');
  assert.equal(produit.includes('DEEP_BENCH_PROVIDER'), false);
  const debut = WORKER.indexOf('export function resolveRoleProviderOrder');
  const corps = WORKER.slice(debut, WORKER.indexOf('\n}', debut));
  for (const interdit of ['request', 'demande', 'original_request', 'domaine', 'body', 'headers', 'input']) {
    assert.equal(corps.includes(interdit), false, `le résolveur ne lit pas ${interdit}`);
  }
});

/* T-OPQP01-10 — l'artefact canonique est intact et la dette reste ouverte. */
test('T-OPQP01-10 : HTML canonique inchangé, dette ouverte', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    '7175454f5c3a0977fd5cd70fa3637a433b24fdba0eba74d9333d82cdb4e8ace9', 'CANONICAL_HTML_CHANGED = NO');
  const registre = lire('docs/OPEN-DEBTS.md');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01']);
  assert.ok(ouvertes.includes('OPRIE-QUALITY-PARITY-01'));
  assert.equal(R.corpus.id, 'evaluation/corpus-lot10g2a.json', 'corpus de régression existant');
  assert.equal(R.corpus.fixtures, 12);
});
