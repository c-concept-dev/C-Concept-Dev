/* PERF-CAPACITY-DECISION-01 — UNE DÉCISION, PAS UNE MESURE.
 * ============================================================================
 *
 * Ce lot n'a rien codé et rien mesuré. Il a relu les preuves de PERF-REAL-01B à
 * 01G et tranché : le banc actuel confond un contrat de latence interactive avec
 * un contrat de capacité, et la cible de capacité n'existe pas.
 *
 * CE QUE CE FICHIER GARDE. Une décision qui ne vit que dans une conversation
 * disparaît avec elle — c'est la raison d'être du registre des dettes, et c'est
 * la même ici. Ces preuves verrouillent trois choses :
 *
 *   1. LES CHIFFRES CITÉS SONT LES CHIFFRES MESURÉS. Chaque nombre que le
 *      document avance est relu dans `evaluation/perf-real-01/` et comparé. Un
 *      document de décision qui dérive de ses preuves ne décide plus rien.
 *   2. RIEN N'A CHANGÉ DANS LE PRODUIT. Ordre des fournisseurs, seuil déclaré,
 *      plafond d'attente du plan rapide, marges et reprises : tous vérifiés
 *      identiques. La section 54 du lot l'exige, ce fichier le prouve.
 *   3. LA DETTE RESTE OUVERTE. `PERF-REAL-01` n'est pas fermée par une lecture ;
 *      elle ne se fermera que par une mesure nouvelle.
 *
 * ET COMME LE REGISTRE DES DETTES : ce document n'est pas une autorité. Aucun
 * code du produit ne le lit, et une preuve le vérifie.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECISION_PROVIDER_ORDER, FAST_GROQ_RETRY_POLICY, GROQ_PRODUCTION_RETRY_DEFAULTS, FAST_CAPACITY_THRESHOLD_CANDIDATES } from '../workers/groq/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (relatif) => fs.readFileSync(path.join(root, relatif), 'utf8');
const preuve = (nom) => JSON.parse(lire(`evaluation/perf-real-01/${nom}`));

const DECISION = lire('docs/PERF-CAPACITY-DECISION-01.md');

/* T-PERFCAPDEC01-01 — le document existe, et il se déclare non autoritatif. */
test('T-PERFCAPDEC01-01 le document de décision existe et refuse toute autorité', () => {
  assert.ok(DECISION.length > 8000, 'une décision comparative ne tient pas en une page.');
  assert.match(DECISION, /Ce document \*\*n'est pas une autorité\*\*/);
  assert.match(DECISION, /La seule autorité sémantique du produit reste\s+OPRIE/);
});

/* T-PERFCAPDEC01-02 — aucun code du produit ne le lit. Même garde que le registre
 * des dettes : un document lu par le produit cesserait d'être documentaire. */
test('T-PERFCAPDEC01-02 aucun code du produit ne lit le document de décision', () => {
  const produit = lire('atelier-prompts-v11.5-lot10g-decision-provider.html')
    + lire('tools/build-adn-browser-runtime.mjs')
    + lire('workers/groq/src/index.js');
  assert.equal(produit.includes('PERF-CAPACITY-DECISION'), false);
});

/* T-PERFCAPDEC01-03 — les six options exigées sont comparées, aucune omise. */
test('T-PERFCAPDEC01-03 les six options sont comparées', () => {
  for (const titre of [
    'A — Groq primaire, quota supérieur',
    'B — Anthropic primaire',
    'C — Groq primaire + bascule sur signal de capacité',
    'D — Distribution multi-fournisseurs proactive',
    'E — Infrastructure rapide dédiée',
    'F — Séparer le SLA de latence du SLA de capacité'
  ]) {
    assert.ok(DECISION.includes(titre), `option manquante : ${titre}`);
  }
});

/* T-PERFCAPDEC01-04 — les dix critères sont notés, et chaque ligne du tableau
 * porte bien une note par option. Un tableau incomplet n'est pas une comparaison. */
test('T-PERFCAPDEC01-04 les dix critères sont notés pour les six options', () => {
  const criteres = ['LATENCY', 'CAPACITY', 'COST', 'SIMPLICITY', 'ROBUSTNESS',
    'SCALABILITY', 'OBSERVABILITY', 'IMPLEMENTATION_RISK', 'SEMANTIC_RISK', 'REVERSIBILITY'];
  for (const critere of criteres) {
    const ligne = DECISION.split('\n').find((l) => l.startsWith(`| ${critere} |`));
    assert.ok(ligne, `critère absent du tableau : ${critere}`);
    const notes = ligne.split('|').slice(2, -1).map((c) => Number(c.trim()));
    assert.equal(notes.length, 6, `${critere} : six options attendues.`);
    for (const note of notes) {
      assert.ok(Number.isInteger(note) && note >= 1 && note <= 5,
        `${critere} : note hors de l'échelle 1..5.`);
    }
  }
});

/* T-PERFCAPDEC01-05 — les quatre réponses explicitement exigées sont données, et
 * chacune dans le vocabulaire imposé. Une réponse en prose n'est pas une réponse. */
test('T-PERFCAPDEC01-05 les quatre questions reçoivent une réponse dans le vocabulaire imposé', () => {
  const attendus = [
    [/ANTHROPIC PRIMAIRE MAINTENANT \? — `(YES|NO|NOT_YET)`/, 'NOT_YET'],
    [/GROQ PRIMAIRE MAINTENANT \? — `(YES|NO|CONDITIONAL)`/, 'CONDITIONAL'],
    [/ACHETER DE LA CAPACITÉ GROQ AVANT DE CHANGER LE CODE \? — `(YES|NO|CONDITIONAL)`/, 'CONDITIONAL'],
    [/STRATÉGIES FOURNISSEUR SÉPARÉES \? — `(YES|NO|INVESTIGATE)`/, 'YES']
  ];
  for (const [motif, valeur] of attendus) {
    const trouve = DECISION.match(motif);
    assert.ok(trouve, `question sans réponse formelle : ${motif}`);
    assert.equal(trouve[1], valeur);
  }
});

/* T-PERFCAPDEC01-06 — la cible de capacité est déclarée absente, pas inventée.
 * La section 10 du lot l'interdit explicitement. */
test('T-PERFCAPDEC01-06 la cible de capacité est déclarée indéfinie, aucun nombre inventé', () => {
  assert.match(DECISION, /CAPACITY_TARGET_UNDEFINED\s+= YES/);
  for (const terme of ['EXPECTED_CONCURRENT_FAST_USERS', 'EXPECTED_FAST_REQUESTS_PER_SEC',
    'EXPECTED_PEAK_REQUESTS_PER_SEC', 'EXPECTED_PEAK_TPM']) {
    const ligne = DECISION.split('\n').find((l) => l.trim().startsWith(terme));
    assert.ok(ligne, `terme de capacité absent : ${terme}`);
    assert.match(ligne, /= UNKNOWN$/, `${terme} doit rester UNKNOWN.`);
  }
});

/* T-PERFCAPDEC01-07 — l'enregistrement ADR porte ses dix champs. */
test('T-PERFCAPDEC01-07 l enregistrement de décision porte ses dix champs', () => {
  for (const champ of ['DECISION', 'STATUS', 'CONTEXT', 'OPTIONS CONSIDERED',
    'DECISION DRIVERS', 'CHOSEN DIRECTION', 'REJECTED FOR NOW', 'RISKS',
    'REVERSIBILITY', 'NEXT PROOF']) {
    assert.ok(new RegExp(`^${champ}$`, 'm').test(DECISION), `champ ADR absent : ${champ}`);
  }
});

/* T-PERFCAPDEC01-08 — LE CŒUR. Chaque chiffre avancé par le document est relu
 * dans les preuves. C'est la seule garde qui empêche une décision de dériver de
 * ce qui l'a fondée. */
test('T-PERFCAPDEC01-08 les chiffres cités sont ceux qui ont été mesurés', () => {
  const E = preuve('results-01e.json');
  const C = preuve('results-01c.json');
  const F = preuve('results-01f.json');
  const G = preuve('results-01g.json');
  const D = preuve('results-01d.json');

  assert.equal(E.calcul_capacite.quota_observe_tpm, 8000);
  assert.equal(E.comptabilite_avant.total_tokens.p50, 425);
  assert.equal(E.calcul_capacite.plancher_structurel.total, 192);
  assert.equal(E.calcul_capacite.max_soutenable_jetons_par_requete, 147);
  assert.equal(E.calcul_capacite.debit_du_banc_par_min, 54.4);
  assert.equal(D.budget_declare_par_le_fournisseur.limit_tokens_par_minute, 8000);

  const demande = Math.round(E.comptabilite_avant.total_tokens.p50 * E.calcul_capacite.debit_du_banc_par_min);
  assert.equal(demande, 23120, 'la demande du banc se recalcule à partir des mesures.');

  for (const nombre of ['8 000', '425', '192', '147', '54,4', '23 120',
    '1 535,3', '780,5', '3 435,9', '10 239,9', '3 398']) {
    assert.ok(DECISION.includes(nombre), `chiffre absent du document : ${nombre}`);
  }
  assert.equal(C.sans_reprise.p95, 1535.3);
  assert.equal(F.fournisseurs.groq.ttfi.p95, 780.5);
  assert.equal(F.fournisseurs.anthropic.ttfi.p50, 3435.9);
  assert.equal(G.anthropic.pire_echantillon_ms, 10239.9);
});

/* T-PERFCAPDEC01-09 — les quatre p95 de 01G sont repris sans arrondi flatteur, et
 * aucun ne tient le contrat. C'est ce constat qui rend le lot nécessaire. */
test('T-PERFCAPDEC01-09 les quatre p95 calibrés sont repris exactement, et aucun ne tient', () => {
  const G = preuve('results-01g.json');
  const attendus = { A: 3336.3, B: 3260.9, C: 5020.2, D: 3398 };
  for (const ligne of G.tableau_comparatif) {
    assert.equal(ligne.p95, attendus[ligne.politique]);
    assert.equal(ligne.contrat_tenu, false);
    assert.ok(ligne.p95 > 3000, 'aucun p95 ne tient le budget de 3 000 ms.');
  }
  assert.match(DECISION, /3 260,9 \/ 3 336,3 \/ 3 398,0 \/ 5 020,2 ms/);
  assert.equal(G.verdict.no_calibration_winner, true);
});

/* T-PERFCAPDEC01-10 — l'espacement de l'expérience 1 est DÉRIVÉ du budget déclaré,
 * pas choisi. La section 53 interdit les paliers arbitraires : on vérifie donc que
 * le débit proposé tient réellement sous le budget, avec sa marge. */
test('T-PERFCAPDEC01-10 l espacement du banc nominal proposé tient sous le budget déclaré', () => {
  const E = preuve('results-01e.json');
  const jetonsParAppel = E.comptabilite_avant.total_tokens.p50;
  const quota = E.calcul_capacite.quota_observe_tpm;
  const latenceNominale = E.calcul_capacite.latence_nominale_p50_ms;

  const soutenableParMin = quota / jetonsParAppel;
  assert.ok(soutenableParMin > 18 && soutenableParMin < 19,
    'le document annonce 18,8 appels/min soutenables.');
  assert.ok(DECISION.includes('18,8'));

  const espacement = 3200;
  const periode = espacement + latenceNominale;
  const debit = 60000 / periode;
  const demande = debit * jetonsParAppel;
  assert.ok(demande < quota, 'le banc nominal proposé doit rester sous le budget.');
  assert.ok(quota - demande > quota * 0.05, 'et garder une marge réelle.');
  assert.ok(DECISION.includes('3 200 ms'), 'l espacement dérivé est écrit.');
});

/* T-PERFCAPDEC01-11 — SECTION 54 : rien n'a changé dans le produit. Ordre des
 * fournisseurs, plafond d'attente du plan rapide, jeu fermé de seuils, marges et
 * reprises de production, seuil déclaré du worker. */
test('T-PERFCAPDEC01-11 aucun contrat de production n a bougé', () => {
  assert.deepEqual(DECISION_PROVIDER_ORDER, ['groq', 'anthropic', 'openai']);
  assert.deepEqual(FAST_GROQ_RETRY_POLICY, { maxRetryWaitMs: 0 });
  assert.deepEqual(FAST_CAPACITY_THRESHOLD_CANDIDATES, [0, 1000, 1500, 2000]);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries, 2);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs, 8000);

  const wrangler = lire('workers/groq/wrangler.jsonc');
  assert.match(wrangler, /"FAST_CAPACITY_RETRY_THRESHOLD_MS": "0"/,
    'le worker reste sur son seuil par défaut déclaré.');
});

/* T-PERFCAPDEC01-12 — les seuils du contrat interactif sont inchangés à l'octet
 * près. Un lot de décision qui déplacerait les poteaux ne déciderait rien. */
test('T-PERFCAPDEC01-12 les seuils du contrat interactif sont inchangés', () => {
  const B = preuve('results-01b.json');
  assert.equal(B.seuils.p50_prefere_ms, 2000);
  assert.equal(B.seuils.p95_contractuel_ms, 3000);
  assert.equal(B.seuils.degrade_max_ms, 5000);
  assert.equal(B.seuils.echec_contrat_ms, 10000);
  assert.match(DECISION, /préféré\s+p50 <= 2000 ms/);
  assert.match(DECISION, /requis\s+p95 <= 3000 ms/);
  assert.match(DECISION, /inchangé, et il le reste/);
});

/* T-PERFCAPDEC01-13 — SECTION 57 : la dette reste ouverte, et elle reste seule. */
test('T-PERFCAPDEC01-13 PERF-REAL-01 reste la seule dette ouverte', () => {
  const registre = lire('docs/OPEN-DEBTS.md');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  const ids = [...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['PERF-REAL-01'], 'la lecture des preuves ne ferme pas une dette.');
  assert.ok(ouvertes.includes('PERF-CAPACITY-DECISION-01'),
    'mais la décision y est enregistrée.');
  assert.match(DECISION, /`PERF-REAL-01` \*\*reste\s+ouverte\*\*/);
});

/* T-PERFCAPDEC01-14 — le fait qui n'avait jamais été relevé : une seule clé sert
 * les deux plans. Le document le dit, et la source le confirme. */
test('T-PERFCAPDEC01-14 le partage de budget entre plan rapide et plan profond est établi', () => {
  const worker = lire('workers/groq/src/index.js');
  const cles = [...worker.matchAll(/env\.([A-Z_]{4,})/g)].map((m) => m[1]);
  const clesGroq = [...new Set(cles.filter((c) => c.startsWith('GROQ')))];
  assert.deepEqual(clesGroq, ['GROQ_API_KEY'],
    'une seule clé Groq dans le worker — donc un seul budget pour les deux plans.');
  const wrangler = JSON.parse(lire('workers/groq/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  assert.deepEqual(wrangler.secrets.required, ['GROQ_API_KEY']);
  assert.match(DECISION, /partagent une clé, un compte et donc\s+un budget/);
});
