/* CAPACITY-SLA-DEFINITION-01 — LA RESSOURCE RARE EST CELLE DONT LE RAPIDE A BESOIN.
 * ============================================================================
 *
 * Le propriétaire produit a posé une contrainte ferme : les abonnements ne
 * changent pas. La question cesse donc d'être « combien acheter » et devient
 * « comment répartir ce qui est déjà payé ».
 *
 * CE QUE LA MESURE DIT, ET QUI DÉCIDE. Groq déclare 8 000 jetons/min ; OpenAI en
 * déclare 1 000 000, Anthropic 10 000 000 — soit 125 et 1 250 fois plus. Or Groq
 * est le SEUL des trois à tenir le contrat interactif (p95 1 617 ms contre 4 234
 * et 5 562). La ressource rare est exactement celle dont le plan rapide dépend,
 * et le plan profond — qui tolère déjà 16 à 26 secondes par rôle selon le contrat
 * existant — la consomme sur la même clé.
 *
 * CE QUE CE FICHIER GARDE.
 *   1. LES CHIFFRES SONT CEUX QUI ONT ÉTÉ MESURÉS. Chaque valeur avancée par le
 *      document est relue dans les preuves de PERF-NOMINAL-PROVIDER-01.
 *   2. LES MATHS DE CAPACITÉ SE REFONT. 8 000 / 485 doit rendre le plafond annoncé,
 *      sinon le document se raconte une histoire.
 *   3. RIEN N'EST INVENTÉ. Les dix variables produit restent UNKNOWN, les trois
 *      scénarios sont marqués ILLUSTRATIFS, et aucun tier n'est chiffré.
 *   4. AUCUN ACHAT, AUCUN CHANGEMENT. Abonnements, ordres, primaire, seuils de
 *      latence : tous vérifiés intacts.
 *   5. LA DETTE RESTE OUVERTE, scindée en une moitié close et une moitié ouverte.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECISION_PROVIDER_ORDER, ROLE_PROVIDER_ORDER, ROLE_GROQ_RETRY_POLICIES, FAST_GROQ_RETRY_POLICY } from '../workers/groq/src/index.js';
import { OPERATIONAL_REQUEST_ROLE_SEQUENCE } from '../workers/shared/operational-request-orchestrator.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const DOC = lire('docs/CAPACITY-SLA-DEFINITION-01.md');
const N = JSON.parse(lire('evaluation/perf-nominal-provider-01/results.json'));

/* T-CAPSLA01-01 — le document existe et refuse toute autorité. */
test('T-CAPSLA01-01 : le document existe et n’est pas une autorité', () => {
  assert.ok(DOC.length > 8000);
  assert.match(DOC, /Ce document \*\*n'est pas une autorité\*\*/);
  assert.match(DOC, /OPRIE reste l'autorité\s+sémantique unique/);
  const produit = lire('atelier-prompts-v11.5-lot10g-decision-provider.html')
    + lire('tools/build-adn-browser-runtime.mjs') + lire('workers/groq/src/index.js');
  assert.equal(produit.includes('CAPACITY-SLA-DEFINITION'), false);
});

/* T-CAPSLA01-02 — la contrainte d'abonnements figés est enregistrée, et aucun
 * achat n'est proposé nulle part dans le document. */
test('T-CAPSLA01-02 : abonnements figés, aucun achat proposé', () => {
  assert.match(DOC, /les abonnements ne changent pas/i);
  assert.match(DOC, /Aucun achat de quota, chez aucun fournisseur/);
  assert.match(DOC, /USE_EXISTING_SUBSCRIPTIONS_ONLY/);
  assert.match(DOC, /aucun quota acheté/);
  /* Aucune recommandation d'augmenter un quota ne subsiste. */
  for (const interdit of [/augmenter le quota/i, /acheter de la capacité/i, /upgrade/i]) {
    assert.equal(interdit.test(DOC), false, `le document ne propose pas : ${interdit}`);
  }
});

/* T-CAPSLA01-03 — LE CŒUR : les budgets déclarés cités sont ceux qui ont été
 * relevés aux en-têtes des fournisseurs, et l'asymétrie se recalcule. */
test('T-CAPSLA01-03 : l’asymétrie des capacités est celle qui a été mesurée', () => {
  const groq = Number(N.groq.capacite.depart.budget_limite);
  const anthropic = Number(N.anthropic.capacite.depart.budget_entree_limite);
  const openai = Number(N.openai.capacite.depart.budget_limite);
  assert.equal(groq, 8000);
  assert.equal(anthropic, 10000000);
  assert.equal(openai, 1000000);
  assert.equal(anthropic / groq, 1250, 'Anthropic déclare 1 250 fois le budget de Groq');
  assert.equal(openai / groq, 125, 'OpenAI en déclare 125 fois');
  for (const chiffre of ['8 000 jetons/min', '1 000 000 jetons/min', '10 000 000 jetons d\'entrée/min',
    '× 125', '× 1 250']) {
    assert.ok(DOC.includes(chiffre), `chiffre absent du document : ${chiffre}`);
  }
  /* Et le fournisseur rare est bien le seul qui tienne le contrat. */
  assert.equal(N.groq.classement_latence.p95_contract_met, true);
  assert.equal(N.anthropic.classement_latence.p95_contract_met, false);
  assert.equal(N.openai.classement_latence.p95_contract_met, false);
});

/* T-CAPSLA01-04 — le modèle de jetons est mesuré, jamais estimé, et le p95 existe
 * réellement plutôt que d'être inventé comme valeur « conservatrice ». */
test('T-CAPSLA01-04 : le modèle de jetons vient des relevés fournisseur', () => {
  const j = N.groq.jetons.total;
  assert.equal(j.p50, 426);
  assert.equal(j.p95, 485);
  assert.equal(j.count, 48, 'les 48 échantillons portent tous leur comptabilité réelle');
  assert.equal(N.groq.jetons.observations_jointes, 48);
  assert.match(DOC, /`TOKENS_PER_FAST_REQUEST_P50` \| \*\*426\*\*/);
  assert.match(DOC, /`TOKENS_PER_FAST_REQUEST_P95` \| \*\*485\*\*/);
  assert.match(DOC, /`DEEP_TPM` = \*\*UNKNOWN\*\*/);
  assert.match(DOC, /`TOTAL_PROVIDER_TPM = FAST_TPM \+ DEEP_TPM` reste \*\*incalculable\*\*/);
});

/* T-CAPSLA01-05 — les plafonds de débit se REFONT depuis le quota et les jetons
 * mesurés. Un document de capacité qui ne se recalcule pas ne prouve rien. */
test('T-CAPSLA01-05 : les plafonds de débit se recalculent', () => {
  const quota = 8000, p50 = N.groq.jetons.total.p50, p95 = N.groq.jetons.total.p95;
  assert.equal(Math.floor(quota / p50), 18, '18 requêtes/min à 426 jetons');
  assert.equal(Math.floor(quota / p95), 16, '16 requêtes/min à 485 jetons');
  assert.equal(Math.round((quota / p95 / 60) * 100) / 100, 0.27);
  for (const [marge, attenduP50, attenduP95] of [[0.2, 15, 13], [0.3, 13, 11], [0.5, 9, 8]]) {
    const util = quota * (1 - marge);
    assert.equal(Math.floor(util / p50), attenduP50, `marge ${marge * 100} % → ${attenduP50} req/min (p50)`);
    assert.equal(Math.floor(util / p95), attenduP95, `marge ${marge * 100} % → ${attenduP95} req/min (p95)`);
    const utilEcrit = String(util).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    assert.ok(DOC.includes(`| ${marge * 100} % | ${utilEcrit} |`), `ligne de marge ${marge * 100} % présente`);
  }
  /* Et la contrainte qui mord est bien le jeton, pas la requête. */
  assert.ok(1000 / (quota / p95) > 60, 'la limite de requêtes est 60 fois plus lâche que celle des jetons');
  assert.match(DOC, /La contrainte qui mord est le jeton, pas la requête/);
});

/* T-CAPSLA01-06 — les entrées produit sont celles que le propriétaire a fournies,
 * transcrites sans arrondi ni interprétation. Ce qu'il n'a pas donné reste inconnu. */
test('T-CAPSLA01-06 : les entrées produit sont transcrites, jamais fabriquées', () => {
  const fournies = {
    INITIAL_RELEASE_TYPE: 'BETA',
    EXPECTED_CONCURRENT_FAST_USERS: '6',
    TYPICAL_FAST_TURNS_PER_USER_PER_MIN: '1',
    PEAK_FAST_TURNS_PER_USER_PER_MIN: '2',
    PEAK_SHAPE: 'SHORT_BURST',
    PEAK_DURATION_MIN: '2'
  };
  for (const [cle, valeur] of Object.entries(fournies)) {
    const ligne = DOC.split('\n').find((l) => l.trim().startsWith(`${cle} `));
    assert.ok(ligne, `entrée produit absente : ${cle}`);
    assert.ok(ligne.includes(`= ${valeur}`), `${cle} doit valoir ${valeur}, ligne : ${ligne.trim()}`);
  }
  /* Le multiplicateur de rafale est DÉRIVÉ des deux rythmes, pas posé. */
  assert.equal(Number(fournies.PEAK_FAST_TURNS_PER_USER_PER_MIN)
    / Number(fournies.TYPICAL_FAST_TURNS_PER_USER_PER_MIN), 2);
  assert.match(DOC, /EXPECTED_BURST_MULTIPLIER\s+= 2\s+\(dérivé/);
  /* Et ce que le propriétaire n'a pas fourni reste inconnu. */
  for (const inconnu of ['GEOGRAPHIC_DISTRIBUTION', 'DEEP_SHARE_OF_PROVIDER_CAPACITY']) {
    const ligne = DOC.split('\n').find((l) => l.trim().startsWith(`${inconnu} `));
    assert.match(ligne, /= UNKNOWN/, `${inconnu} reste inconnu`);
  }
  assert.match(DOC, /`CAPACITY_SLA_DEFINED = YES`\*\* pour la bêta/);
});

/* T-CAPSLA01-07 — LE CŒUR ARITHMÉTIQUE. Chaque valeur du contrat se recalcule depuis
 * les décisions produit et le coût en jetons mesuré. Un SLA qui ne se refait pas
 * n'est pas un contrat, c'est une affirmation. */
test('T-CAPSLA01-07 : le contrat de capacité se recalcule intégralement', () => {
  const T = N.groq.jetons.total.p95;
  assert.equal(T, 485, 'la valeur conservatrice est le p95 mesuré');
  assert.equal(N.groq.jetons.total.max, 485, 'et elle est aussi le maximum : rien ne la dépasse');
  const utilisateurs = 6, nominal = 1, pic = 2, quota = 8000, marge = 0.2;

  assert.equal(utilisateurs * nominal, 6, 'SUPPORTED_FAST_RPM');
  assert.equal(utilisateurs * pic, 12, 'PEAK_FAST_RPM');
  assert.equal(utilisateurs * nominal * T, 2910, 'SUPPORTED_FAST_TPM');
  assert.equal(utilisateurs * pic * T, 5820, 'PEAK_FAST_TPM');
  assert.equal(quota * (1 - marge), 6400, 'enveloppe utilisable à 20 % de marge');

  for (const attendu of ['SUPPORTED_FAST_RPM                = 6 requêtes/min',
    'PEAK_FAST_RPM                     = 12 requêtes/min',
    'SUPPORTED_FAST_TPM                = 2 910 jetons/min',
    'PEAK_FAST_TPM                     = 5 820 jetons/min',
    'HEADROOM                          = 20 %  -> 6 400 jetons/min utilisables']) {
    assert.ok(DOC.includes(attendu), `ligne de contrat absente : ${attendu}`);
  }
  /* Les pourcentages annoncés sont exacts. */
  assert.equal(Math.round((2910 / quota) * 1000) / 10, 36.4);
  assert.equal(Math.round((5820 / quota) * 1000) / 10, 72.8);
  assert.equal(Math.round((5820 / 6400) * 1000) / 10, 90.9);
  for (const pct of ['36,4 %', '72,8 %', '90,9 %', '63,6 %', '27,3 %']) {
    assert.ok(DOC.includes(pct), `pourcentage absent : ${pct}`);
  }
  /* TIER_2 reste inconnu : le propriétaire a défini une bêta, pas une production. */
  assert.match(DOC, /\*\*TIER_2\*\* \| Production normale \| UNKNOWN/);
});

/* T-CAPSLA01-07B — la marge est DÉRIVÉE du pic déclaré, pas choisie : 30 % rend le
 * pic infaisable, 20 % est le seul candidat proposé qui passe. */
test('T-CAPSLA01-07B : la marge de 20 % est imposée par le pic, pas préférée', () => {
  const quota = 8000, pic = 6 * 2 * 485;
  const plafond = 1 - pic / quota;
  assert.equal(Math.round(plafond * 10000) / 100, 27.25, 'plafond arithmétique de marge');
  assert.ok(pic <= quota * 0.8, '20 % : le pic tient');
  assert.ok(pic > quota * 0.7, '30 % : le pic dépasse');
  assert.ok(pic > quota * 0.5, '50 % : le pic dépasse largement');
  assert.match(DOC, /`HEADROOM_POLICY` = \*\*20 %\*\*, et c'est un résultat, pas une préférence/);
  assert.ok(DOC.includes('27,25 %'));
  assert.match(DOC, /\*\*DÉPASSE \(103,9 %\)\*\*/, '30 % est explicitement marqué infaisable');
});

/* T-CAPSLA01-07C — plafonds d'utilisateurs, et le point exact où la bêta casse. */
test('T-CAPSLA01-07C : les plafonds d’utilisateurs se recalculent', () => {
  const quota = 8000, T = 485;
  const plafond = (marge, tours) => Math.floor((quota * (1 - marge)) / (T * tours));
  assert.equal(plafond(0, 1), 16);
  assert.equal(plafond(0, 2), 8);
  assert.equal(plafond(0.2, 1), 13);
  assert.equal(plafond(0.2, 2), 6, 'à 20 % de marge, le pic tient exactement la cible de 6');
  assert.equal(plafond(0.3, 1), 11);
  assert.equal(plafond(0.3, 2), 5, 'à 30 %, le pic ne tient plus que 5 — sous la cible');
  /* Le septième utilisateur au pic dépasse l'enveloppe. */
  assert.equal(7 * 2 * T, 6790);
  assert.ok(6790 > quota * 0.8);
  assert.ok(DOC.includes('6 790'), 'le point de rupture est écrit');
  assert.match(DOC, /le plafond dur est de \*\*8 utilisateurs simultanés au rythme\s*\n?pic\*\*|\*\*8 utilisateurs simultanés au rythme[\s\S]{0,10}pic\*\*/,
    'le plafond dur sans marge est écrit');
});

/* T-CAPSLA01-07D — la condition qui décide de tout : ce qui reste au plan profond.
 * Le plancher est structurel — trois appels minimum — et non une conversion de
 * caractères en jetons, qui serait une invention. */
test('T-CAPSLA01-07D : le budget restant au plan profond est calculé, son plancher est structurel', () => {
  const quota = 8000, T = 485;
  assert.equal(quota - 6 * 1 * T, 5090, 'restant en nominal');
  assert.equal(quota - 6 * 2 * T, 2180, 'restant au pic');
  assert.ok(DOC.includes('5 090') && DOC.includes('2 180'));
  /* Trois rôles, donc trois appels fournisseur au minimum : c'est la séquence figée. */
  assert.deepEqual(OPERATIONAL_REQUEST_ROLE_SEQUENCE, ['analyst', 'critic', 'arbiter']);
  const plancher = OPERATIONAL_REQUEST_ROLE_SEQUENCE.length * T;
  assert.equal(plancher, 1455);
  assert.ok(DOC.includes('1 455'));
  assert.equal(Math.round((2180 / plancher) * 10) / 10, 1.5, 'au pic : 1,5 tour profond au plancher');
  assert.equal(Math.round((5090 / plancher) * 10) / 10, 3.5, 'en nominal : 3,5 tours au plancher');
  assert.match(DOC, /condition d'existence du pic déclaré/);
});

/* T-CAPSLA01-08 — la portée des limites de débit est déclarée inconnue, et le
 * piège de la seconde clé est explicitement refusé. */
test('T-CAPSLA01-08 : la portée des limites reste UNKNOWN, aucune clé multipliante', () => {
  assert.match(DOC, /`RATE_LIMIT_SCOPE` = \*\*UNKNOWN\*\*/);
  assert.match(DOC, /interdit de supposer qu'une seconde clé\s+multiplierait la capacité/);
  /* Les en-têtes relevés portent des valeurs, jamais une portée. */
  for (const f of ['groq', 'anthropic', 'openai']) {
    for (const cle of Object.keys(N[f].capacite.depart)) {
      assert.equal(/scope|portee|organization|project/i.test(cle), false,
        `${f} : l’en-tête ${cle} n’annonce aucune portée`);
    }
  }
});

/* T-CAPSLA01-09 — la contention Fast/Deep est établie par l'inventaire des
 * bindings, pas par une supposition : une seule clé Groq sert les deux plans. */
test('T-CAPSLA01-09 : Fast et Deep partagent une seule clé, donc un seul budget', () => {
  const worker = lire('workers/groq/src/index.js');
  const clesGroq = [...new Set([...worker.matchAll(/env\.([A-Z_]{4,})/g)].map((m) => m[1])
    .filter((c) => c.startsWith('GROQ')))];
  assert.deepEqual(clesGroq, ['GROQ_API_KEY'], 'une seule clé Groq dans tout le worker');
  const wrangler = JSON.parse(lire('workers/groq/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  assert.deepEqual(wrangler.secrets.required, ['GROQ_API_KEY']);
  assert.deepEqual(ROLE_PROVIDER_ORDER, ['groq', 'anthropic', 'openai'],
    'les rôles profonds partent eux aussi sur Groq en premier');
  assert.match(DOC, /partagent une seule clé `GROQ_API_KEY`/);
  /* Et le plan profond est déjà contractuellement tolérant à la latence. */
  assert.equal(ROLE_GROQ_RETRY_POLICIES.analyst.maxRetryWaitMs, 16000);
  assert.equal(ROLE_GROQ_RETRY_POLICIES.arbiter.maxRetryWaitMs, 17000);
  assert.equal(ROLE_GROQ_RETRY_POLICIES.critic.maxRetryWaitMs, 26000);
  assert.equal(FAST_GROQ_RETRY_POLICY.maxRetryWaitMs, 0, 'le plan rapide, lui, n’attend pas');
});

/* T-CAPSLA01-10 — le repli de capacité est classé DISPONIBILITÉ, jamais LATENCE,
 * et la mesure qui l'impose est citée. */
test('T-CAPSLA01-10 : le repli préserve la disponibilité, pas la latence', () => {
  assert.match(DOC, /`CAPACITY_FAILOVER_ROLE` = \*\*AVAILABILITY\*\*, jamais LATENCY/);
  assert.match(DOC, /ne peut pas préserver la latence/);
  /* Les deux branches de repli sont mesurées hors contrat. */
  assert.ok(N.anthropic.officiel.ttfi.p95 > 3000);
  assert.ok(N.openai.officiel.ttfi.p95 > 3000);
  assert.ok(DOC.includes('4 234') && DOC.includes('5 562'));
  /* Les quatre comportements dégradés sont posés sans qu'aucun soit décidé. */
  /* La politique dégradée est désormais DÉCIDÉE par le propriétaire : le plan rapide
     se suspend, le plan profond poursuit. Les quatre options restent documentées avec
     leur coût mesuré, une seule est marquée retenue. */
  assert.match(DOC, /`DEGRADED_MODE_POLICY` — décidée par le propriétaire/);
  assert.match(DOC, /le plan rapide se déclare dégradé, ne rend aucune candidate, et le\s*\n?plan profond poursuit/);
  assert.match(DOC, /\*\*5 minutes maximum par\s*\n?incident\*\*/);
  const options = DOC.split('\n').filter((l) => /^\| [A-D]\.|^\| \*\*C\./.test(l));
  assert.equal(options.length, 4, 'les quatre comportements restent documentés');
  assert.equal(options.filter((l) => l.trim().endsWith('| **OUI** |')).length, 1,
    'un seul est retenu');
});

/* T-CAPSLA01-11 — rien n'a bougé en production : ordres, primaire, seuils de
 * latence, artefact canonique. */
test('T-CAPSLA01-11 : aucun contrat de production n’a été touché', () => {
  assert.deepEqual(DECISION_PROVIDER_ORDER, ['groq', 'anthropic', 'openai']);
  assert.deepEqual(ROLE_PROVIDER_ORDER, ['groq', 'anthropic', 'openai']);
  assert.equal(DECISION_PROVIDER_ORDER[0], 'groq', 'le primaire du plan rapide est inchangé');
  const seuils = JSON.parse(lire('evaluation/perf-real-01/results-01b.json')).seuils;
  assert.equal(seuils.p50_prefere_ms, 2000);
  assert.equal(seuils.p95_contractuel_ms, 3000);
  assert.match(DOC, /p50 ≤ 2 000 ms préféré, p95 ≤ 3 000 ms requis/);
  assert.match(DOC, /aucun seuil\s+de latence modifié/);
  assert.equal(N.invariants.canonical_html_changed, false);
});

/* T-CAPSLA01-12 — la dette est scindée : la moitié latence est close, la moitié
 * capacité reste ouverte, et PERF-REAL-01 demeure la seule dette ouverte. */
test('T-CAPSLA01-12 : la dette est scindée, et elle reste ouverte', () => {
  assert.match(DOC, /FAST_LATENCY_PART\s+= CLOSED \/ PROUVÉE/);
  assert.match(DOC, /FAST_CAPACITY_PART\s+= OPEN/);
  assert.match(DOC, /CAPACITY_SLA_PROVEN\s+= NO/);
  assert.match(DOC, /CAPACITY_SLA_DEFINED\s+= YES/);
  assert.match(DOC, /il n'est pas \*\*éprouvé\*\*/,
    'défini ne veut pas dire prouvé, et le document le dit');
  const registre = lire('docs/OPEN-DEBTS.md');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01']);
  assert.ok(ouvertes.includes('CAPACITY-SLA-DEFINITION-01'), 'et le lot y est enregistré');
  /* La latence prouvée y figure avec ses vraies valeurs. */
  assert.equal(N.groq.officiel.ttfi.p50, 467.3);
  assert.equal(N.groq.officiel.ttfi.p95, 1617);
  assert.ok(DOC.includes('467,3 ms') && DOC.includes('1 617,0 ms'));
});
