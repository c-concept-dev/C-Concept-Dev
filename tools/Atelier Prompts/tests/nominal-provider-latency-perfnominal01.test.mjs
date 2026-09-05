/* PERF-NOMINAL-PROVIDER-01 — LA MESURE QUI MANQUAIT DEPUIS SEPT LOTS.
 * ============================================================================
 *
 * PERF-CAPACITY-DECISION-01 a conclu que le banc historique confondait deux
 * contrats : il poussait le système à ~2,9 fois sa capacité souscrite, puis
 * notait le p95 obtenu contre un contrat écrit pour l'interaction d'un
 * utilisateur. Ce lot prend enfin l'autre mesure — celle de la latence NOMINALE,
 * fournisseur par fournisseur, à cadence non saturante.
 *
 * CE QUE LES CHIFFRES DISENT. Groq tient le contrat sans ambiguïté : p95 =
 * 1 617 ms pour un budget de 3 000. OpenAI est dégradé (4 234 ms). Anthropic est
 * NON CONFORME (5 562 ms) — et cette fois sans aucune circonstance atténuante :
 * zéro 429, zéro reprise, zéro bascule, première tentative, fournisseur reposé.
 * Le doute que 01F et 01G laissaient ouvert — « Anthropic paraît lent parce qu'on
 * ne l'a jamais mesuré au repos » — est levé par la mesure, pas par l'argument.
 *
 * CE QUE CE FICHIER GARDE.
 *   1. L'ÉPINGLAGE EST UN OUTIL D'OPÉRATEUR, PAS UNE FONCTIONNALITÉ. Il ne se
 *      transmet par aucune requête, ne lit ni contenu ni domaine, et la valeur
 *      déclarée du Worker reste la chaîne de production.
 *   2. LES TROIS RUNS SONT COMPARABLES. Mêmes fixtures, même ordre, mêmes
 *      sequence_index, 3 chauffes exclues, 48 officiels, même cadence.
 *   3. UN 429 INVALIDE UN RUN NOMINAL. Il n'est pas exclu de l'échantillon : il
 *      retire au run le droit de s'appeler nominal.
 *   4. LES PERCENTILES SONT RECALCULÉS À PARTIR DES ÉCHANTILLONS BRUTS.
 *   5. AUCUNE CONCLUSION DE CAPACITÉ. Ce lot n'en mesure aucune et n'en tire
 *      aucune : le SLA de capacité reste indéfini, PERF-REAL-01 reste ouverte.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FAST_INTERACTION_TYPES, FAST_FORBIDDEN_AUTHORITY_FIELDS } from '../workers/shared/fast-interactive-plane.js';
import {
  resolveFastProviderOrder, FAST_BENCH_PROVIDER_BINDING, FAST_BENCH_CHAIN,
  DECISION_PROVIDER_ORDER, MODEL, ANTHROPIC_MODEL, OPENAI_MODEL
} from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const R = JSON.parse(lire('evaluation/perf-nominal-provider-01/results.json'));
const WORKER = lire('workers/groq/src/index.js');
const FOURNISSEURS = ['groq', 'anthropic', 'openai'];

const rang = (p, l) => l[Math.max(0, Math.ceil((p / 100) * l.length) - 1)];

/* T-PERFNOMINAL01-01 — l'épinglage existe, il est explicite, et son défaut est
 * la chaîne de production. Rien d'implicite : une valeur inconnue est refusée
 * AVANT tout appel réseau, jamais rattrapée par un repli muet. */
test('T-PERFNOMINAL01-01 : l’épinglage du fournisseur rapide est explicite', () => {
  assert.equal(FAST_BENCH_PROVIDER_BINDING, 'FAST_BENCH_PROVIDER');
  assert.equal(FAST_BENCH_CHAIN, 'ha');
  /* FAST-CAPACITY-ADMISSION-01 : le défaut du plan rapide s'est réduit à Groq — les
     deux autres échouent son contrat même au repos, ce que CE lot avait mesuré.
     L'épinglage diagnostic, lui, continue de les atteindre : c'est un outil de
     mesure d'opérateur, pas un repli de production. */
  assert.deepEqual(resolveFastProviderOrder({}), ['groq']);
  assert.deepEqual(resolveFastProviderOrder({ FAST_BENCH_PROVIDER: 'ha' }), ['groq']);
  for (const f of FOURNISSEURS) {
    assert.deepEqual(resolveFastProviderOrder({ FAST_BENCH_PROVIDER: f }), [f],
      `${f} épinglé rend une chaîne d’un seul fournisseur`);
  }
  assert.throws(() => resolveFastProviderOrder({ FAST_BENCH_PROVIDER: 'auto' }), /FAST_BENCH_PROVIDER invalide/);
  assert.throws(() => resolveFastProviderOrder({ FAST_BENCH_PROVIDER: 'mistral' }), /valeurs autorisées/);
  /* La valeur déclarée du Worker est la chaîne : la production n’est pas épinglée. */
  assert.match(lire('workers/groq/wrangler.jsonc'), /"FAST_BENCH_PROVIDER": "ha"/);
  assert.equal(R.epinglage.valeur_declaree_du_worker, 'ha');
});

/* T-PERFNOMINAL01-02 — l'épinglage ne lit NI le contenu, NI le domaine, NI le
 * mode. C'est une variable d'environnement résolue avant que la demande soit
 * regardée, et elle n'est atteignable par aucune requête. */
test('T-PERFNOMINAL01-02 : l’épinglage n’est ni sémantique, ni exposé à l’utilisateur', () => {
  const memeSortie = JSON.stringify(resolveFastProviderOrder({ FAST_BENCH_PROVIDER: 'groq' }));
  for (const bruit of [
    { FAST_BENCH_PROVIDER: 'groq', original_request: 'refonte complète du recrutement' },
    { FAST_BENCH_PROVIDER: 'groq', domaine: 'juridique', mode: 'architecte' },
    { FAST_BENCH_PROVIDER: 'groq', oprie_state: 'READY', canonical_version: 42 }
  ]) {
    assert.equal(JSON.stringify(resolveFastProviderOrder(bruit)), memeSortie,
      'le contenu de l’environnement ne change rien : seul le nom du binding compte.');
  }
  /* Le corps du résolveur ne mentionne aucune entrée de la demande. */
  const debut = WORKER.indexOf('export function resolveFastProviderOrder');
  const corps = WORKER.slice(debut, WORKER.indexOf('\n}', debut));
  for (const interdit of ['snapshot', 'request', 'demande', 'original_request', 'domaine', 'mode', 'body', 'headers']) {
    assert.equal(corps.includes(interdit), false, `le résolveur ne lit pas ${interdit}`);
  }
  /* Rien dans le produit ne permet à un client de le choisir. */
  const produit = lire('atelier-prompts-v11.5-lot10g-decision-provider.html')
    + lire('workers/shared/fast-interaction-endpoint.js');
  assert.equal(produit.includes('FAST_BENCH_PROVIDER'), false,
    'ni l’artefact ni la porte réseau n’en connaissent l’existence.');
  assert.equal(R.epinglage.expose_a_l_utilisateur, false);
  assert.equal(R.epinglage.transmissible_par_requete, false);
  assert.equal(R.invariants.semantic_provider_selection_count, 0);
  assert.equal(R.invariants.content_based_provider_selection_count, 0);
  assert.equal(R.invariants.domain_based_provider_selection_count, 0);
});

/* T-PERFNOMINAL01-03 — épinglé veut dire SEUL. Un fournisseur épinglé n'a rien
 * vers quoi basculer : la chaîne ne contient qu'une entrée. Une bascule aurait
 * rendu la mesure invalide, et les journaux prouvent qu'il n'y en a eu aucune. */
test('T-PERFNOMINAL01-03 : aucun repli pendant un run épinglé', () => {
  for (const f of FOURNISSEURS) {
    assert.equal(resolveFastProviderOrder({ FAST_BENCH_PROVIDER: f }).length, 1);
    assert.deepEqual(R[f].epinglage.ordres_observes, [JSON.stringify([f])],
      `${f} : l’ordre observé dans les journaux du Worker ne contient que lui`);
    assert.equal(R[f].epinglage.bascules, 0, `${f} : zéro bascule`);
    assert.equal(R[f].validite.zero_bascule, true);
  }
  assert.equal(R.invariants.pinned_failover_count, 0, 'PINNED_FAILOVER_COUNT = 0');
});

/* T-PERFNOMINAL01-04 — mêmes fixtures, même ordre, mêmes index. Sans cela la
 * comparaison n'en serait pas une. */
test('T-PERFNOMINAL01-04 : les trois runs partagent fixtures, ordre et index', () => {
  const reference = R.groq.echantillons.map((s) => `${s.sequence_index}|${s.scenario_class}|${s.fixture_id}`);
  for (const f of ['anthropic', 'openai']) {
    const autre = R[f].echantillons.map((s) => `${s.sequence_index}|${s.scenario_class}|${s.fixture_id}`);
    assert.deepEqual(autre, reference, `${f} rejoue exactement le même plan que groq`);
  }
  assert.equal(R.protocole.fixtures_identiques_entre_fournisseurs, true);
  assert.equal(R.protocole.sequence_index_identique, true);
  assert.equal(R.protocole.ordre, 'ROUND_ROBIN');
  /* Six classes, huit répétitions, tour de rôle : la classe change à chaque appel. */
  const classes = [...new Set(reference.map((r) => r.split('|')[1]))];
  assert.equal(classes.length, 6);
  for (let i = 1; i < reference.length; i += 1) {
    assert.notEqual(reference[i].split('|')[1], reference[i - 1].split('|')[1],
      'deux appels consécutifs ne portent jamais la même classe');
  }
});

/* T-PERFNOMINAL01-05 — 48 échantillons officiels par fournisseur, 144 au total. */
test('T-PERFNOMINAL01-05 : 48 échantillons officiels par fournisseur', () => {
  let total = 0;
  for (const f of FOURNISSEURS) {
    assert.equal(R[f].officiel.sample_count, 48, `${f} : 48 officiels`);
    assert.equal(R[f].echantillons.length, 48, `${f} : 48 enregistrements persistés`);
    assert.equal(R[f].validite.echantillons_48, true);
    total += R[f].echantillons.length;
  }
  assert.equal(total, 144, 'TOTAL GLOBAL = 144 échantillons officiels');
  assert.equal(R.protocole.total_officiel, 144);
});

/* T-PERFNOMINAL01-06 — les chauffes existent, elles sont trois, et elles ne
 * comptent pas. Le premier appel d'un fournisseur froid n'est pas une mesure. */
test('T-PERFNOMINAL01-06 : trois chauffes par fournisseur, exclues des officiels', () => {
  for (const f of FOURNISSEURS) {
    assert.equal(R[f].chauffes.count, 3, `${f} : trois chauffes`);
    assert.equal(R[f].chauffes.exclues_des_officiels, true);
    /* Le Worker a bien vu 51 invocations là où 48 seulement sont officielles. */
    assert.equal(R[f].epinglage.invocations_tracees, 51,
      `${f} : 3 chauffes + 48 officiels tracés côté Worker`);
    const ttfiOfficiels = new Set(R[f].echantillons.map((s) => s.ttfi_ms));
    for (const c of R[f].chauffes.ttfi_ms) {
      assert.equal(ttfiOfficiels.has(c) && R[f].echantillons.filter((s) => s.ttfi_ms === c).length > 1, false,
        `${f} : une chauffe n’a pas été recomptée comme officielle`);
    }
  }
  assert.equal(R.protocole.chauffes, 3);
  assert.equal(R.protocole.chauffes_exclues, true);
});

/* T-PERFNOMINAL01-07 — LA RÈGLE DURE. Un 429 ne fait pas perdre un échantillon :
 * il fait perdre au run le droit de s'appeler nominal. La validité est donc une
 * conjonction, et « zéro 429 » en est un terme — pas un commentaire. */
test('T-PERFNOMINAL01-07 : un 429 invalide un run nominal', () => {
  for (const f of FOURNISSEURS) {
    const v = R[f].validite;
    assert.ok(Object.prototype.hasOwnProperty.call(v, 'zero_429'),
      `${f} : la validité comporte explicitement le terme « zéro 429 »`);
    assert.ok(Object.prototype.hasOwnProperty.call(v, 'zero_signal_capacite'));
    assert.equal(R[f].nominal_run_valid, Object.values(v).every(Boolean),
      `${f} : la validité est la CONJONCTION de ses termes, aucun n’est décoratif`);
    /* Contre-épreuve : si un seul terme tombe, la validité tombe. */
    assert.equal(Object.values({ ...v, zero_429: false }).every(Boolean), false,
      `${f} : un 429 suffirait à invalider le run`);
    /* Et de fait, aucun n’est survenu. */
    assert.equal(R[f].officiel.rate_limit_count, 0, `${f} : zéro 429`);
    assert.equal(R[f].officiel.capacity_signal_count, 0, `${f} : zéro signal de capacité`);
    assert.equal(R[f].officiel.reprises_totales, 0, `${f} : zéro reprise`);
    assert.equal(R[f].nominal_run_valid, true, `${f} : NOMINAL_RUN_VALID = YES`);
    assert.equal(R[f].evidence_level, 'HIGH');
    /* L’état de capacité est relevé aux deux bouts, et il prouve la non-saturation. */
    assert.ok(R[f].capacite.depart && Object.keys(R[f].capacite.depart).length > 0, `${f} : état de départ relevé`);
    assert.ok(R[f].capacite.fin && Object.keys(R[f].capacite.fin).length > 0, `${f} : état de fin relevé`);
  }
  /* Groq est le seul dont le budget déclaré soit assez petit pour être menacé :
     il est resté au-dessus de 90 % du sien d’un bout à l’autre. */
  const limite = Number(R.groq.capacite.depart.budget_limite);
  for (const borne of [R.groq.capacite.depart, R.groq.capacite.fin]) {
    assert.ok(Number(borne.budget_restant) / limite > 0.9,
      'le budget de jetons de Groq n’a jamais approché l’épuisement');
  }
});

/* T-PERFNOMINAL01-08 — un seul schéma pour les trois. Le fournisseur change, le
 * contrat non : deux champs, un type parmi cinq, un texte non vide. */
test('T-PERFNOMINAL01-08 : le schéma rapide est identique pour les trois fournisseurs', () => {
  for (const f of FOURNISSEURS) {
    assert.equal(R[f].schema.schema_invalid_success_count, 0, `${f} : SCHEMA_INVALID_SUCCESS_COUNT = 0`);
    assert.equal(R[f].schema.schema_valid_success_count, 48, `${f} : 48 succès au schéma`);
    assert.deepEqual(R[f].schema.types_hors_contrat, [], `${f} : aucun type hors contrat`);
    assert.equal(R[f].schema.texte_vide_count, 0, `${f} : aucun texte vide`);
    for (const s of R[f].echantillons) {
      assert.equal(s.schema_valid, true);
      assert.ok(FAST_INTERACTION_TYPES.includes(s.candidate_type),
        `${f} : ${s.candidate_type} appartient aux cinq types autorisés`);
      assert.ok(s.candidate_text_length > 0);
    }
  }
  assert.equal(R.invariants.schema_invalid_success_count, 0);
  assert.equal(FAST_INTERACTION_TYPES.length, 5);
});

/* T-PERFNOMINAL01-09 — le plan rapide n'a rien écrit, chez aucun fournisseur.
 * Changer de fournisseur ne change pas la frontière d'autorité. */
test('T-PERFNOMINAL01-09 : autorité du plan rapide nulle chez les trois', () => {
  assert.equal(R.invariants.fast_authority_writes, 0, 'FAST_AUTHORITY_WRITES = 0');
  assert.equal(R.invariants.programming_error_count, 0);
  /* La porte ne rend jamais que deux champs : les champs d’autorité ne peuvent
     pas sortir, et rien dans les échantillons n’en porte la trace. */
  const porte = lire('workers/shared/fast-interaction-endpoint.js');
  assert.match(porte, /return jsonResponse\(\{ type: verdict\.interaction\.type, text: verdict\.interaction\.text \}, 200, cors\)/);
  assert.ok(FAST_FORBIDDEN_AUTHORITY_FIELDS.length > 0);
  for (const f of FOURNISSEURS) {
    for (const s of R[f].echantillons) {
      for (const interdit of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
        assert.equal(Object.prototype.hasOwnProperty.call(s, interdit), false,
          `${f} : aucun échantillon ne transporte ${interdit}`);
      }
    }
  }
});

/* T-PERFNOMINAL01-10 — l'ordre de production n'a pas bougé, et le primaire non
 * plus. Le banc a épinglé ; il n'a rien décidé. */
test('T-PERFNOMINAL01-10 : l’ordre de production et le primaire sont inchangés', () => {
  assert.deepEqual(DECISION_PROVIDER_ORDER, ['groq', 'anthropic', 'openai']);
  assert.match(WORKER, /export const DECISION_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/);
  assert.match(WORKER, /export const ROLE_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/);
  assert.equal(R.invariants.provider_order_changed, false);
  assert.equal(R.invariants.primary_provider_changed, false);
  /* Le meilleur nominal ne devient pas primaire de production par ce lot. */
  assert.equal(R.comparison.nominal_fast_provider_candidate, 'GROQ');
  assert.equal(DECISION_PROVIDER_ORDER[0], 'groq',
    'Groq était déjà primaire : ce lot ne change rien, il explique pourquoi.');
});

/* T-PERFNOMINAL01-11 — l'artefact canonique n'a pas été touché. */
test('T-PERFNOMINAL01-11 : le HTML canonique est inchangé', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    'd0138022dcc27bcc4f6368fb0acda8c54d2b09b68c7016607bbf22d6a5d364a7', 'CANONICAL_HTML_CHANGED = NO');
  assert.equal(R.invariants.canonical_html_changed, false);
});

/* T-PERFNOMINAL01-12 — les métriques persistées sont complètes et bien formées :
 * chaque champ exigé par le lot est présent sur chaque échantillon. */
test('T-PERFNOMINAL01-12 : le schéma des métriques est valide', () => {
  const champs = ['sample_id', 'provider', 'scenario_class', 'fixture_id', 'sequence_index',
    'timestamp', 'status', 'http_status', 'ttfi_ms', 'total_ms', 'schema_valid', 'candidate_type',
    'input_tokens', 'output_tokens', 'total_tokens', 'capacity_signal',
    'rate_limit_remaining', 'rate_limit_reset', 'error_class'];
  for (const f of FOURNISSEURS) {
    for (const s of R[f].echantillons) {
      for (const c of champs) {
        assert.ok(Object.prototype.hasOwnProperty.call(s, c), `${f}/${s.sample_id} : champ ${c}`);
      }
      assert.equal(s.provider, f);
      assert.equal(typeof s.ttfi_ms, 'number');
      assert.equal(typeof s.input_tokens, 'number', 'la comptabilité de jetons est réelle, pas estimée');
      assert.equal(typeof s.output_tokens, 'number');
      assert.equal(s.capacity_signal, false);
    }
    for (const bloc of ['entree', 'sortie', 'total']) {
      const j = R[f].jetons[bloc];
      assert.equal(j.count, 48, `${f} : jetons ${bloc} relevés sur les 48`);
      assert.ok(j.p50 <= j.p95 && j.p95 <= j.max);
    }
    assert.equal(R[f].jetons.observations_jointes, 48);
    assert.equal(R[f].modele, R[f].modele_source, `${f} : le modèle journalisé est celui de la source`);
  }
  assert.equal(R.groq.modele_source, MODEL);
  assert.equal(R.anthropic.modele_source, ANTHROPIC_MODEL);
  assert.equal(R.openai.modele_source, OPENAI_MODEL);
});

/* T-PERFNOMINAL01-13 — les percentiles sont RECALCULÉS depuis les échantillons
 * bruts, au rang le plus proche, et la classification est relue contre des
 * seuils inchangés. Un rapport qui s'auto-certifie ne prouve rien. */
test('T-PERFNOMINAL01-13 : percentiles et classement recalculés depuis les échantillons', () => {
  assert.equal(R.seuils.p50_prefere_ms, 2000);
  assert.equal(R.seuils.p95_contractuel_ms, 3000);
  assert.equal(R.seuils.degrade_max_ms, 5000);
  assert.equal(R.seuils.echec_contrat_ms, 10000);
  const attendu = { groq: 'TENU', openai: 'DEGRADE', anthropic: 'NON_CONFORME' };
  for (const f of FOURNISSEURS) {
    const l = R[f].echantillons.filter((s) => s.status === 'success').map((s) => s.ttfi_ms).sort((a, b) => a - b);
    assert.equal(l.length, R[f].officiel.ttfi.count);
    assert.equal(rang(50, l), R[f].officiel.ttfi.p50, `${f} : p50 recalculé`);
    assert.equal(rang(95, l), R[f].officiel.ttfi.p95, `${f} : p95 recalculé`);
    assert.equal(l[0], R[f].officiel.ttfi.min);
    assert.equal(l[l.length - 1], R[f].officiel.ttfi.max);
    const c = R[f].classement_latence;
    assert.equal(c.p50_target_met, R[f].officiel.ttfi.p50 <= 2000);
    assert.equal(c.p95_contract_met, R[f].officiel.ttfi.p95 <= 3000);
    assert.equal(c.degraded, R[f].officiel.ttfi.p95 > 3000 && R[f].officiel.ttfi.p95 <= 5000);
    assert.equal(c.non_conforming, R[f].officiel.ttfi.p95 > 5000);
    const ligne = R.comparison.tableau.find((x) => x.provider === f);
    assert.equal(ligne.contrat, attendu[f], `${f} : ${attendu[f]}`);
  }
  /* Un seul fournisseur passe : c'est lui le candidat, sans départage à inventer. */
  assert.deepEqual(R.comparison.fournisseurs_passants, ['groq']);
  assert.equal(R.comparison.latency_sla_provider_available, true);
});

/* T-PERFNOMINAL01-14 — AUCUNE CONCLUSION DE CAPACITÉ. Ce lot mesure la latence
 * nominale ; il n'a rien saturé, donc il ne sait rien de la capacité. La dette
 * PERF-REAL-01 reste ouverte et le SLA de capacité reste indéfini. */
test('T-PERFNOMINAL01-14 : rien n’est conclu sur la capacité', () => {
  assert.equal(R.comparison.capacity_proven, false, 'CAPACITY_PROVEN = NO');
  assert.equal(R.comparison.nominal_latency_proven, true, 'NOMINAL_LATENCY_PROVEN = YES');
  assert.match(R.comparison.note_capacite, /ne mesure AUCUNE capacite/);
  const registre = lire('docs/OPEN-DEBTS.md');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01'],
    'PERF-REAL-01 reste ouverte : une mesure de latence ne ferme pas une dette de capacité.');
  const rapport = lire('docs/PERF-NOMINAL-PROVIDER-01.md');
  assert.match(rapport, /NOMINAL_LATENCY_PROVEN\s*=\s*YES/);
  assert.match(rapport, /CAPACITY_PROVEN\s*=\s*NO/);
});
