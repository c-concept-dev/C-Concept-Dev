/* PERF-REAL-01B — LA LATENCE RÉELLE, ENFIN CONNUE, ET PAS BONNE.
 * ============================================================================
 *
 * 48 appels réels, six classes de demande, tour de rôle, sur le worker déployé.
 * Le plan et les seuils ont été arrêtés avant le premier appel, la méthode de
 * percentile aussi, et rien n'a bougé après lecture des résultats.
 *
 *   p50 = 472,9 ms   — la cible préférée est tenue
 *   p95 = 3 245,3 ms — le contrat interactif ne l'est pas
 *
 * `3 000 < p95 <= 5 000` : bande DÉGRADÉE. L'écart est de 245 ms, ce qui est peu ;
 * le seuil n'a pas été déplacé pour autant. Ce fichier verrouille les seuils
 * précisément pour qu'ils ne puissent pas glisser plus tard.
 *
 * CE QUE CES TESTS FONT. Ils recalculent les statistiques depuis les échantillons
 * bruts, avec la méthode déclarée, et vérifient que le verdict découle des
 * nombres plutôt que d'une décision. Un p95 réécrit à la main échouerait ici.
 *
 * CE QU'ILS NE FONT PAS. Ils n'optimisent rien, n'excusent rien, et ne
 * transforment pas une médiane flatteuse en contrat tenu. La queue décide.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runProviderChain, FAILURE_CLASSES, tagFailure, isFailoverEligible } from '../workers/shared/provider-ha.js';
import { createTurnSnapshot, validateFastInteraction, FAST_INTERACTION_TYPES, FAST_FORBIDDEN_AUTHORITY_FIELDS }
  from '../workers/shared/fast-interactive-plane.js';
import { DECISION_PROVIDER_ORDER } from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const M = JSON.parse(lire('evaluation/perf-real-01/results-01b.json'));
const RAPPORT = lire('docs/PERF-REAL-01-REPORT.md');
const REGISTRE = lire('docs/OPEN-DEBTS.md');

/* La méthode déclarée, réimplémentée ici : si le fichier annonçait autre chose
   que ce que ses propres échantillons produisent, ces tests le diraient. */
const rangProche = (tries, p) => tries[Math.min(tries.length - 1, Math.max(0, Math.ceil((p / 100) * tries.length) - 1))];
const succes = M.echantillons.filter((s) => s.status === 'success');
const ttfi = succes.map((s) => s.ttfi_ms).sort((a, b) => a - b);

/* Les seuils du contrat, écrits ici en dur pour qu'un déplacement se voie. */
const P50_PREFERE = 2000;
const P95_CONTRACTUEL = 3000;
const DEGRADE_MAX = 5000;
const ECHEC_CONTRAT = 10000;

// =================================================================================================
// §9 à §13 — LE PLAN DE TIRAGE
// =================================================================================================

test('T-PERFREAL01B-01 : l’échantillon officiel atteint le minimum exigé', () => {
  assert.equal(M.echantillons.length, 48);
  assert.ok(M.echantillons.length >= 30, 'MEASURED_SAMPLE_COUNT >= 30');
  assert.equal(M.officiel.sample_count, M.echantillons.length);
  /* Les chauffes sont hors du compte officiel, et déclarées comme telles. */
  assert.equal(M.plan.chauffes, 3);
  assert.equal(M.chauffes.length, 3);
  assert.equal(M.echantillons.some((s) => s.cold_or_warm === 'cold'), false,
    'la sonde à froid est rapportée à part, elle ne gonfle pas l’échantillon');
});

test('T-PERFREAL01B-02 : les six classes sont représentées, à parts égales', () => {
  const parClasse = {};
  for (const s of M.echantillons) parClasse[s.scenario_class] = (parClasse[s.scenario_class] || 0) + 1;
  assert.deepEqual(Object.keys(parClasse).sort(),
    ['A_SIMPLE', 'B_VAGUE', 'C_RICHE', 'D_CONFIRMATION', 'E_ORIENTATION', 'F_INCONNU_VALIDE']);
  assert.deepEqual([...new Set(Object.values(parClasse))], [8], 'huit par classe, sans exception');
  /* Et l'ordre est un tour de rôle : jamais deux fois la même classe de suite. */
  assert.equal(M.plan.ordre, 'ROUND_ROBIN');
  const suite = M.echantillons.sort((a, b) => a.sequence_index - b.sequence_index).map((s) => s.scenario_class);
  for (let i = 1; i < suite.length; i += 1) assert.notEqual(suite[i], suite[i - 1], `index ${i} : pas de bloc`);
  /* Trois variantes de texte par classe, cyclées : pas 48 fois la même phrase. */
  const fixtures = new Set(M.echantillons.map((s) => s.fixture_id));
  assert.equal(fixtures.size, 18, 'six classes x trois variantes');
});

test('T-PERFREAL01B-03 : aucun mock — la mesure porte sur un fournisseur réel', () => {
  assert.equal(M.route, '/fast-interaction');
  assert.equal(M.version_deployee, '6ecc4c97-0d54-4c11-a32a-43e0ac802df9');
  assert.equal(M.worker, 'atelier-decision-groq');
  assert.equal(M.attribution_fournisseur.distribution.groq > 0, true);
  /* MOCK_PROVIDER_CALL_COUNT = 0 : aucune VALEUR d'échantillon ne désigne un
     simulacre. « fixture_id » est un nom de champ — il désigne la variante de
     texte envoyée, pas un faux fournisseur. */
  const valeurs = M.echantillons.flatMap((s) => Object.values(s)).filter((v) => typeof v === 'string');
  assert.deepEqual(valeurs.filter((v) => /\bmock\b|\bstub\b|\bfake\b|localhost/i.test(v)), []);
  assert.equal(M.echantillons.every((s) => /^[A-F]_[A-Z_]+#[0-2]$/.test(s.fixture_id)), true,
    'fixture_id ne nomme qu’une variante de texte');
  assert.equal(M.plan.horloge, 'process.hrtime.bigint() — monotone');
});

test('T-PERFREAL01B-04 : chaque échantillon brut porte les champs exigés, et rien de sensible', () => {
  const attendus = ['attempt_index', 'candidate_text_length', 'candidate_type', 'cold_or_warm', 'error_class',
    'failover_occurred', 'fixture_id', 'http_status', 'provider_used', 'sample_id', 'scenario_class',
    'schema_valid', 'sequence_index', 'status', 'timestamp', 'total_ms', 'ttfi_ms'];
  for (const s of M.echantillons) {
    assert.deepEqual(Object.keys(s).sort(), attendus, `${s.sample_id} : schéma d’échantillon`);
    assert.equal('prompt' in s, false, 'aucun texte de demande complet');
    assert.equal(typeof s.ttfi_ms, 'number');
  }
  const brut = JSON.stringify(M);
  for (const motif of [/sk-[A-Za-z0-9]{16,}/, /gsk_[A-Za-z0-9]{20,}/, /AIza[0-9A-Za-z_-]{20,}/]) {
    assert.equal(motif.test(brut), false, 'aucun secret dans les mesures');
  }
});

// =================================================================================================
// §22 à §25 — LES STATISTIQUES, RECALCULÉES
// =================================================================================================

test('T-PERFREAL01B-05 : le p50 annoncé est celui que les échantillons produisent', () => {
  assert.equal(M.plan.methode_percentile, 'NEAREST_RANK — index = ceil(p/100 * N), liste croissante');
  assert.equal(M.officiel.ttfi_p50_ms, rangProche(ttfi, 50));
  assert.equal(M.officiel.ttfi_p50_ms, 472.9);
  assert.ok(M.officiel.ttfi_p50_ms <= P50_PREFERE, 'PREFERRED_TARGET_MET = YES');
  assert.equal(M.verdict.preferred_target_met, true);
});

test('T-PERFREAL01B-06 : le p95 annoncé est celui que les échantillons produisent — et il dépasse', () => {
  assert.equal(M.officiel.ttfi_p95_ms, rangProche(ttfi, 95));
  assert.equal(M.officiel.ttfi_p95_ms, 3245.3);
  assert.ok(M.officiel.ttfi_p95_ms > P95_CONTRACTUEL, 'INTERACTIVE_P95_CONTRACT_MET = NO');
  assert.equal(M.verdict.interactive_p95_contract_met, false);
  /* Une médiane flatteuse ne rachète pas la queue : les deux sont vraies ensemble. */
  assert.equal(M.verdict.preferred_target_met && !M.verdict.interactive_p95_contract_met, true);
});

test('T-PERFREAL01B-07 : min, max et moyenne sont ceux des échantillons', () => {
  assert.equal(M.officiel.ttfi_min_ms, ttfi[0]);
  assert.equal(M.officiel.ttfi_max_ms, ttfi.at(-1));
  assert.equal(M.officiel.ttfi_max_ms, 3328);
  const moyenne = Math.round((ttfi.reduce((a, x) => a + x, 0) / ttfi.length) * 10) / 10;
  assert.equal(M.officiel.ttfi_mean_ms, moyenne);
  assert.ok(M.officiel.ttfi_mean_ms > M.officiel.ttfi_p50_ms,
    'la moyenne est tirée par la queue — raison de plus pour ne pas s’en servir comme verdict');
});

test('T-PERFREAL01B-08 : les tranches couvrent exactement les succès, sans trou ni doublon', () => {
  const o = M.officiel;
  const somme = o.count_le_1000ms + o.count_1000_to_2000ms + o.count_2000_to_3000ms
    + o.count_3000_to_5000ms + o.count_gt_5000ms;
  assert.equal(somme, succes.length, 'chaque succès tombe dans une tranche et une seule');
  assert.equal(o.count_le_1000ms, ttfi.filter((v) => v <= 1000).length);
  assert.equal(o.count_3000_to_5000ms, ttfi.filter((v) => v > 3000 && v <= 5000).length);
  assert.equal(o.count_gt_5000ms, 0, 'NON_CONFORMING = NO');
  assert.equal(o.count_gt_10000ms, 0, 'CONTRACT_FAILURE_SAMPLE_COUNT = 0');
  assert.equal(M.verdict.contract_failure_sample_count, 0);
  assert.equal(o.count_le_1000ms, 31);
  assert.equal(o.count_3000_to_5000ms, 9);
});

test('T-PERFREAL01B-09 : l’attribution fournisseur est partielle, et déclarée telle', () => {
  /* Quarante échantillons ne sont PAS comptés comme groq par défaut : ils sont
     comptés comme non attribués. Une limite d’instrumentation n’est pas une donnée. */
  assert.equal(M.attribution_fournisseur.couverture, 'PARTIELLE');
  assert.match(M.attribution_fournisseur.raison, /la session wrangler tail a expire pendant le banc/);
  const d = M.attribution_fournisseur.distribution;
  assert.equal(d.groq + d.anthropic + d.openai, M.attribution_fournisseur.invocations_observees);
  assert.ok(M.attribution_fournisseur.invocations_observees < M.echantillons.length,
    'la couverture est bien inférieure au nombre d’échantillons');
  assert.equal(d.anthropic, 0);
  assert.equal(d.openai, 0);
  assert.deepEqual(M.attribution_fournisseur.attempt_index, { 0: d.groq, 1: 0, 2: 0 });
  assert.deepEqual(M.attribution_fournisseur.echecs_intermediaires_observes, []);
});

test('T-PERFREAL01B-10 : l’unique échec est classé, pas dilué dans « lent »', () => {
  assert.equal(M.officiel.failed_count, 1);
  assert.equal(M.officiel.success_count, 47);
  assert.equal(M.officiel.success_rate_percent, 97.9);
  const echec = M.echantillons.find((s) => s.status !== 'success');
  assert.equal(echec.error_class, 'NETWORK');
  assert.equal(echec.http_status, null, 'aucune réponse n’est jamais arrivée');
  assert.ok(echec.ttfi_ms > 200000, 'le client a attendu plus de quatre minutes avant d’abandonner');
  /* Il ne fausse pas la latence : les percentiles portent sur les succès. */
  assert.equal(ttfi.includes(echec.ttfi_ms), false);
  assert.match(RAPPORT, /Ce n'est pas un TTFI lent, c'est un tour\nqui n'a jamais abouti/);
});

test('T-PERFREAL01B-11 : aucune erreur de programmation dans la population mesurée', () => {
  assert.equal(M.officiel.erreurs.PROGRAMMING_ERROR, 0, 'PROGRAMMING_ERROR_COUNT = 0');
  assert.equal(M.echantillons.some((s) => s.error_class === 'fast_interaction_failure'), false,
    'la jointure réparée en PERF-REAL-01A ne rejoue pas');
  assert.equal(isFailoverEligible(FAILURE_CLASSES.PROGRAMMING_ERROR), false,
    'et la classe reste hors du repli');
});

test('T-PERFREAL01B-12 : chaque succès respecte le schéma strict à deux champs', () => {
  assert.equal(M.officiel.schema_valid_success_count, 47);
  assert.equal(M.officiel.schema_invalid_success_count, 0);
  for (const s of succes) {
    assert.equal(s.schema_valid, true, `${s.sample_id}`);
    assert.ok(FAST_INTERACTION_TYPES.includes(s.candidate_type), `${s.sample_id} : type autorisé`);
    assert.ok(s.candidate_text_length > 0, `${s.sample_id} : texte non vide`);
  }
  const types = Object.keys(M.officiel.candidate_type_counts);
  assert.equal(types.every((t) => FAST_INTERACTION_TYPES.includes(t)), true);
  assert.equal(Object.values(M.officiel.candidate_type_counts).reduce((a, x) => a + x, 0), 47);
});

// =================================================================================================
// §29 à §33 — LES INVARIANTS, REVÉRIFIÉS SOUS MESURE
// =================================================================================================

test('T-PERFREAL01B-13 : le plan rapide n’écrit toujours aucune autorité', () => {
  const snap = createTurnSnapshot({ turn_id: 1, original_request: 'Explique la photosynthèse.' });
  let refuses = 0;
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    if (!validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.', [champ]: true }, snap).ok) refuses += 1;
  }
  assert.equal(refuses, FAST_FORBIDDEN_AUTHORITY_FIELDS.length, 'FAST_AUTHORITY_WRITES = 0');
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.' }, snap);
  assert.equal(v.interaction.can_mark_ready, false);
  assert.equal(v.interaction.can_route, false);
  assert.equal(v.interaction.can_execute, false);
  assert.deepEqual(M.autorite, { champs_refuses: 11, total_champs: 11, can_mark_ready: false,
    can_route: false, can_execute: false, authority: 'candidate' });
});

test('T-PERFREAL01B-14 : une chaîne épuisée ferme, et ne fabrique aucun READY', async () => {
  const essayes = [];
  await assert.rejects(() => runProviderChain({
    role: 'fast_interaction', log: () => {},
    providers: DECISION_PROVIDER_ORDER.map((name) => ({
      name, execute: async () => { essayes.push(name); throw tagFailure(new Error('503'), FAILURE_CLASSES.TECHNICAL_FAILOVER); }
    }))
  }), (e) => { assert.equal(e.all_providers_failed, true); return true; });
  assert.deepEqual(essayes, ['groq', 'anthropic', 'openai']);
  assert.equal(M.epuisement.faux_ready, 0, 'ALL_PROVIDER_EXHAUSTION_FALSE_READY_COUNT = 0');
  assert.equal(M.epuisement.ferme, true);
});

test('T-PERFREAL01B-15 : le repli suit l’ordre, et sert le suivant disponible', async () => {
  for (const [tombent, attendus, servi] of [
    [['groq'], ['groq', 'anthropic'], 'anthropic'],
    [['groq', 'anthropic'], ['groq', 'anthropic', 'openai'], 'openai']
  ]) {
    const essayes = [];
    const res = await runProviderChain({
      role: 'fast_interaction', log: () => {},
      providers: DECISION_PROVIDER_ORDER.map((name) => ({
        name,
        execute: async () => {
          essayes.push(name);
          if (tombent.includes(name)) throw tagFailure(new Error('503'), FAILURE_CLASSES.TECHNICAL_FAILOVER);
          return { type: 'ACKNOWLEDGE', text: 'Je prends note.' };
        }
      }))
    });
    assert.deepEqual(essayes, attendus);
    assert.equal(essayes.at(-1), servi);
    assert.ok(res);
  }
  assert.equal(M.repli.ordre_valide, true, 'FAILOVER_ORDER_VALID = YES');
  assert.equal(M.repli.probe_count, 2);
  assert.equal(M.repli.success_count, 2);
});

test('T-PERFREAL01B-16 : une candidate d’un tour révolu reste périmée', () => {
  const ancien = createTurnSnapshot({ turn_id: 5, original_request: 'Explique la photosynthèse.' });
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.' }, ancien);
  assert.equal(v.interaction.turn_id, 5);
  assert.notEqual(v.interaction.turn_id, 9, 'le tour courant ne la reconnaîtrait pas');
  assert.equal(M.peremption.ecritures_visibles, 0, 'STALE_FAST_VISIBLE_WRITE_COUNT = 0');
  /* Et la garde côté navigateur est intacte. */
  assert.match(lire('atelier-prompts-v11.5-lot10g-decision-provider.html'),
    /if\(seq!==oprieState\.seq\)\{oprieMark\('fast_discarded_stale'\);return null\}/);
});

// =================================================================================================
// §60, §63, §70 — CE QUE LE LOT N'A PAS DÉPLACÉ
// =================================================================================================

test('T-PERFREAL01B-17 : l’artefact frontend n’a pas bougé', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    '3efa45ff351f1d293023c062a70540241871e6f7d605c70670db6e1227b2a6dc', 'CANONICAL_HTML_CHANGED = NO');
  /* Et aucune mesure navigateur n’a été inventée à la place de celle qu’on ne peut pas prendre. */
  assert.equal(M.navigateur.statut, 'NOT_AVAILABLE');
  assert.match(M.navigateur.raison, /n admet que https:\/\/c-concept-dev\.github\.io/);
  assert.match(M.navigateur.observation, /blocked by CORS policy/);
});

test('T-PERFREAL01B-18 : les seuils sont ceux d’avant la mesure, au millimètre', () => {
  assert.deepEqual(M.seuils, { p50_prefere_ms: 2000, p95_contractuel_ms: 3000,
    degrade_max_ms: 5000, echec_contrat_ms: 10000,
    note: 'figes avant la mesure, inchanges apres' });
  assert.equal(M.seuils.p50_prefere_ms, P50_PREFERE);
  assert.equal(M.seuils.p95_contractuel_ms, P95_CONTRACTUEL);
  assert.equal(M.seuils.degrade_max_ms, DEGRADE_MAX);
  assert.equal(M.seuils.echec_contrat_ms, ECHEC_CONTRAT);
  assert.match(RAPPORT, /L'écart est de 245 ms, ce qui est peu ; le seuil n'a pas été déplacé pour\nautant, et il ne le sera pas\./);
});

test('T-PERFREAL01B-19 : la classification découle des nombres, pas d’une décision', () => {
  const p95 = M.officiel.ttfi_p95_ms;
  const attendue = p95 <= P95_CONTRACTUEL ? 'PASS' : (p95 <= DEGRADE_MAX ? 'DEGRADED' : 'FAIL');
  assert.equal(M.verdict.classification, attendue);
  assert.equal(M.verdict.classification, 'DEGRADED');
  assert.equal(M.verdict.degraded_band, p95 > P95_CONTRACTUEL && p95 <= DEGRADE_MAX);
  assert.equal(M.verdict.non_conforming, p95 > DEGRADE_MAX);
  assert.equal(M.verdict.real_provider_ttfi_proven, true, 'REAL_PROVIDER_TTFI_PROVEN = YES');
  /* La queue est décrite pour ce qu'elle est : positionnelle, et non expliquée. */
  assert.match(M.observation_de_queue.lecture, /correlee a la POSITION dans le banc, pas a la classe/);
  assert.match(M.observation_de_queue.hypothese_non_etablie, /compatible avec la politique 429\/Retry-After/);
  assert.equal(M.observation_de_queue.indices_lents.filter((i) => i >= 38).length, 10);
});

test('T-PERFREAL01B-20 : le registre dit la même chose que la mesure', () => {
  const ouvertes = REGISTRE.slice(REGISTRE.indexOf('## Ouvertes'), REGISTRE.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01'],
    'OFFICIAL_OPEN_DEBT_COUNT = 1');
  assert.match(ouvertes, /\| p95 \| \*\*3 245,3 ms\*\* \| ≤ 3 000 ms — \*\*non tenu\*\* \|/);
  assert.match(ouvertes, /la bande \*\*DÉGRADÉE\*\*/);
  assert.match(ouvertes, /`REAL_PROVIDER_TTFI_PROVEN = YES`/);
  assert.match(ouvertes, /Rien n'a été optimisé : ce lot mesurait\./);
  /* Le rapport porte le même verdict, sans adoucissement. */
  assert.match(RAPPORT, /INTERACTIVE_P95_CONTRACT_MET      = NO/);
  assert.match(RAPPORT, /PERF_REAL_01_STATUS               = OPEN \/ DEGRADED/);
});
