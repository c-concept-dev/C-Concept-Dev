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

/* T-CAPSLA01-06 — rien n'est inventé : les dix variables produit restent UNKNOWN
 * et les six décisions manquantes sont nommées. */
test('T-CAPSLA01-06 : aucune entrée produit n’est fabriquée', () => {
  const bloc = DOC.slice(DOC.indexOf('INITIAL_RELEASE_TYPE'), DOC.indexOf('### `MINIMUM_PRODUCT_INPUTS_REQUIRED`'));
  const lignes = bloc.split('\n').filter((l) => /^[A-Z_]+\s+=/.test(l.trim()));
  assert.equal(lignes.length, 11, 'onze variables de charge sont énumérées');
  for (const l of lignes) {
    assert.match(l, /=\s+UNKNOWN/, `variable laissée inconnue : ${l.trim()}`);
  }
  assert.match(DOC, /MINIMUM_PRODUCT_INPUTS_REQUIRED/);
  const decisions = DOC.slice(DOC.indexOf('Six décisions'), DOC.indexOf('Avec (2) et (3)'));
  assert.equal([...decisions.matchAll(/^\d\. \*\*/gm)].length, 6, 'exactement six décisions produit');
  assert.equal(/CAPACITY_SLA_DEFINED = NO/.test(DOC), true);
});

/* T-CAPSLA01-07 — les scénarios sont marqués illustratifs et ne deviennent pas un
 * SLA par inadvertance. Leurs chiffres se recalculent tout de même. */
test('T-CAPSLA01-07 : les scénarios sont illustratifs et arithmétiquement justes', () => {
  assert.match(DOC, /`ILLUSTRATIVE_ONLY = YES`/);
  assert.match(DOC, /ne sont pas un SLA et ne doivent jamais être citées comme tel/);
  const p95 = N.groq.jetons.total.p95;
  for (const [utilisateurs, tours, tpm] of [[10, 1, 4850], [25, 1, 12125], [100, 1.5, 72750]]) {
    assert.equal(utilisateurs * tours * p95, tpm, `${utilisateurs} × ${tours} × ${p95} = ${tpm}`);
    assert.ok(DOC.includes(String(tpm).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')), `${tpm} figure au tableau`);
  }
  /* Les tiers restent explicitement non chiffrés. */
  for (const t of ['TIER_1', 'TIER_2', 'TIER_3']) {
    const ligne = DOC.split('\n').find((l) => l.trim().startsWith(t));
    assert.match(ligne, /RPM = UNKNOWN\s+TPM = UNKNOWN/, `${t} n’est pas chiffré`);
  }
  assert.match(DOC, /`CURRENT_GROQ_CAPACITY_STATUS` = \*\*UNKNOWN\*\*/);
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
  assert.match(DOC, /`DEGRADED_MODE_POLICY` = \*\*décision produit, non prise ici\.\*\*/);
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
  assert.match(DOC, /`CAPACITY_SLA_PROVEN = NO`/);
  const registre = lire('docs/OPEN-DEBTS.md');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01']);
  assert.ok(ouvertes.includes('CAPACITY-SLA-DEFINITION-01'), 'et le lot y est enregistré');
  /* La latence prouvée y figure avec ses vraies valeurs. */
  assert.equal(N.groq.officiel.ttfi.p50, 467.3);
  assert.equal(N.groq.officiel.ttfi.p95, 1617);
  assert.ok(DOC.includes('467,3 ms') && DOC.includes('1 617,0 ms'));
});
