/* DEEP-TOKEN-COST-01 — UN TOUR PROFOND COÛTE DEUX FOIS LE BUDGET D'UNE MINUTE.
 * ============================================================================
 *
 * Ce lot n'a modifié aucun code et n'a rien déployé : l'instrumentation existante
 * suffisait. Il a mesuré, et ce qu'il a trouvé reformule le dossier de capacité.
 *
 *   Un tour profond médian coûte 16 015 jetons contre 8 000 de quota par minute.
 *   Le tour le MOINS cher jamais observé en coûte 7 820 — 98 % du budget.
 *   Le Critique, avec son pipeline batché, va de 1 à 13 appels fournisseur.
 *
 * ET LA CONSÉQUENCE ÉTAIT DÉJÀ LÀ, JAMAIS VUE : 77,7 % des jetons du plan profond
 * sont servis par Anthropic, en fonctionnement nominal, par bascule automatique.
 * La « migration du plan profond » que deux lots envisageaient comme une décision
 * à prendre a déjà eu lieu — sans être décidée, ni mesurée, ni choisie.
 *
 * CE QUE CE FICHIER GARDE. Que les chiffres du rapport soient ceux des compteurs
 * fournisseur ; que la classification soit dérivée du quota et non d'un seuil
 * inventé ; et qu'aucun contrat de production n'ait bougé.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { OPERATIONAL_REQUEST_ROLE_SEQUENCE } from '../workers/shared/operational-request-orchestrator.js';
import { OPRIE_ROLES } from '../workers/shared/operational-request-core.js';
import { ROLE_PROVIDER_ORDER, DECISION_PROVIDER_ORDER, FAST_PROVIDER_ORDER, MODEL } from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const R = JSON.parse(lire('evaluation/deep-cout-jetons-01/results.json'));
const DOC = lire('docs/DEEP-COUT-JETONS-01.md');
const QUOTA = 8000;

/* T-DEEPTOK01-01 — la couverture est réelle et complète. */
test('T-DEEPTOK01-01 : douze tours réels, tous complets', () => {
  assert.equal(R.couverture.tours_traces, 12);
  assert.equal(R.couverture.tours_complets, 12);
  assert.equal(R.couverture.tours_incomplets, 0);
  assert.equal(R.tours.length, 12);
  for (const t of R.tours) {
    assert.equal(t.http_status, 200, `${t.fixture_id} a répondu 200`);
    assert.equal(t.complet, true);
    assert.ok(t.total_jetons > 0, 'chaque tour porte un coût réel');
  }
  /* Les cinq catégories du corpus existant sont représentées. */
  assert.equal(new Set(R.tours.map((t) => t.category)).size, 5);
  assert.match(R.protocole.corpus, /corpus-lot10g2a\.json/, 'corpus de régression existant, non inventé');
});

/* T-DEEPTOK01-02 — les jetons viennent des compteurs FOURNISSEUR, jamais d'une
 * estimation. C'est la condition d'autorité de la section 10 du lot. */
test('T-DEEPTOK01-02 : la source des jetons est le fournisseur', () => {
  assert.equal(R.protocole.aucune_estimation, true);
  assert.equal(R.protocole.aucune_conversion_caracteres, true);
  assert.match(R.protocole.source_des_jetons, /compteurs usage du fournisseur/);
  /* Chaque tour porte une attribution par fournisseur, et elle boucle. */
  for (const t of R.tours) {
    const somme = Object.values(t.jetons_par_fournisseur).reduce((s, v) => s + v, 0);
    assert.equal(somme, t.total_jetons, `${t.fixture_id} : l’attribution par fournisseur boucle`);
    const parRole = Object.values(t.par_role).reduce((s, r) => s + r.total, 0);
    assert.equal(parRole, t.total_jetons, `${t.fixture_id} : la somme des rôles vaut le tour`);
  }
});

/* T-DEEPTOK01-03 — LA MESURE CENTRALE. Un tour dépasse le budget d'une minute. */
test('T-DEEPTOK01-03 : un tour profond dépasse le quota d’une minute', () => {
  const total = R.deep_core_turn.total;
  assert.equal(total.n, 12);
  assert.equal(total.min, 7820);
  assert.equal(total.p50, 16015);
  assert.equal(total.p95, 103894);
  /* Recalcul depuis les tours bruts : le rapport ne s’auto-certifie pas. */
  const totaux = R.tours.filter((t) => t.complet).map((t) => t.total_jetons).sort((a, b) => a - b);
  assert.equal(totaux[0], total.min);
  assert.equal(totaux[Math.ceil(0.5 * totaux.length) - 1], total.p50);
  assert.equal(totaux[Math.ceil(0.95 * totaux.length) - 1], total.p95);
  /* Et le fait qui compte : même le moins cher occupe presque tout le budget. */
  assert.ok(total.p50 > QUOTA * 2, 'le tour médian vaut plus de deux minutes de budget');
  assert.ok(total.min / QUOTA > 0.97, 'même le minimum observé occupe plus de 97 % du budget');
  assert.equal(R.capacite_theorique_groq.un_tour_depasse_le_quota_au_p50, true);
});

/* T-DEEPTOK01-04 — le Critique est le coût, et sa variance vient de la demande. */
test('T-DEEPTOK01-04 : le Critique domine, par son pipeline batché', () => {
  const c = R.par_role.critic, a = R.par_role.analyst, ar = R.par_role.arbiter;
  assert.equal(c.appels_par_tour.min, 1);
  assert.equal(c.appels_par_tour.max, 13, 'jusqu’à treize appels pour un seul rôle');
  assert.equal(a.appels_par_tour.max, 1, 'l’Analyste reste mono-appel');
  assert.ok(c.total.max / c.total.min > 30, 'le coût du Critique varie d’un facteur supérieur à 30');
  assert.ok(c.total.mean > a.total.mean && c.total.mean > ar.total.mean,
    'le Critique coûte en moyenne plus que les deux autres rôles');
  assert.match(R.inventaire.critic.chemin, /pipeline batche/);
  assert.match(R.inventaire.analyst.chemin, /mono-appel/);
  assert.match(R.inventaire.arbiter.chemin, /mono-appel/);
});

/* T-DEEPTOK01-05 — OPRIE n'est pas un quatrième appel : les deux métriques du lot
 * se trouvent être la même, et il fallait le vérifier pour le dire. */
test('T-DEEPTOK01-05 : OPRIE est la séquence, pas un appel séparé', () => {
  assert.deepEqual([...OPRIE_ROLES], ['analyst', 'critic', 'arbiter']);
  assert.deepEqual([...OPERATIONAL_REQUEST_ROLE_SEQUENCE], ['analyst', 'critic', 'arbiter']);
  assert.equal(R.inventaire.oprie_appel_fournisseur_separe, false);
  assert.equal(R.deep_full_authority_turn.identique_au_core, true);
  assert.match(R.inventaire.oprie_note, /DEEP_FULL_AUTHORITY_TURN = DEEP_CORE_TURN/);
});

/* T-DEEPTOK01-06 — LA DÉCOUVERTE : le plan profond tourne déjà majoritairement
 * ailleurs que sur Groq, par bascule et non par décision. */
test('T-DEEPTOK01-06 : 77,7 % des jetons profonds sont déjà servis par Anthropic', () => {
  const att = R.attribution_fournisseur;
  assert.equal(att.par_fournisseur.groq, 83870);
  assert.equal(att.par_fournisseur.anthropic, 292887);
  assert.equal(att.par_fournisseur.openai, 0);
  const somme = Object.values(att.par_fournisseur).reduce((s, v) => s + v, 0);
  assert.equal(somme, att.jetons_totaux, 'l’attribution globale boucle');
  assert.equal(Math.round(att.par_fournisseur.anthropic / somme * 10000) / 100, att.part_anthropic_percent);
  assert.ok(att.part_anthropic_percent > 75, 'la majorité des jetons profonds part chez Anthropic');
  assert.ok(R.couverture.bascules_totales > 0, 'et cela se fait par bascule');
  assert.match(att.lecture, /ne tient DEJA PAS sur Groq/);
  assert.ok(DOC.includes('77,7 %'));
});

/* T-DEEPTOK01-07 — la classification est DÉRIVÉE du quota, jamais posée. */
test('T-DEEPTOK01-07 : DOMINANT se déduit du quota, pas d’un seuil inventé', () => {
  assert.equal(R.classification.verdict, 'DEEP_COST_DOMINANT');
  assert.equal(R.classification.quota_reference_tpm, QUOTA);
  assert.match(R.classification.regle, /derivee du QUOTA lui-meme, jamais d un seuil invente/);
  assert.equal(R.classification.rapport_p50_sur_quota, Math.round(R.deep_core_turn.total.p50 / QUOTA * 100) / 100);
  assert.equal(R.classification.rapport_p95_sur_quota, Math.round(R.deep_core_turn.total.p95 / QUOTA * 100) / 100);
  assert.ok(R.classification.rapport_p50_sur_quota > 1, 'la règle est franchie, donc la classe est atteinte');
  /* Les ratios au plan rapide sont observationnels et se recalculent. */
  assert.equal(R.contexte_fast.fast_p50_jetons, 426);
  assert.equal(R.contexte_fast.deep_p50_sur_fast_p50, Math.round(R.deep_core_turn.total.p50 / 426 * 100) / 100);
});

/* T-DEEPTOK01-08 — aucune saturation artificielle, et les limites sont énoncées. */
test('T-DEEPTOK01-08 : la saturation est intrinsèque, pas provoquée', () => {
  assert.equal(R.protocole.espacement_entre_tours_ms, 120000);
  assert.match(R.protocole.justification_espacement, /reconstituer/);
  assert.match(R.attribution_des_echecs.aucune_saturation_artificielle, /intrinseque au cout d un tour/);
  /* La limite d’observabilité du chemin 429 est enregistrée, pas masquée. */
  assert.match(R.attribution_des_echecs.limite_d_observabilite, /n est donc PAS observable/);
  assert.match(DOC, /Limite d'observabilité, énoncée plutôt que masquée/);
  /* Le 413 du fournisseur corrobore le coût mesuré. */
  assert.equal(R.attribution_des_echecs.erreurs_api_groq_journalisees['413 rate_limit_exceeded'], 1);
  assert.match(R.attribution_des_echecs.lecture_413, /depasse a elle seule la limite de jetons par minute/);
});

/* T-DEEPTOK01-09 — RIEN N'A BOUGÉ. Ni code, ni déploiement, ni ordre, ni artefact. */
test('T-DEEPTOK01-09 : aucun contrat de production n’a été touché', () => {
  assert.equal(R.code_produit_modifie, false);
  assert.equal(R.deploiement_effectue, false);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq'], 'le plan rapide reste tel que le lot précédent l’a laissé');
  assert.deepEqual(R.inventaire.ordre_fournisseur_des_roles, ['groq', 'anthropic', 'openai']);
  assert.equal(R.inventaire.analyst.modele_groq, MODEL);
  assert.equal(R.inventaire.critic.modele_groq, MODEL);
  assert.equal(R.inventaire.arbiter.modele_groq, MODEL);
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    '87630e6b8e0dff4253c4759622a3e155b20301cc671944ce1c10140627ea45be', 'CANONICAL_HTML_CHANGED = NO');
});

/* T-DEEPTOK01-10 — le rapport cite les chiffres mesurés, et la dette reste ouverte. */
test('T-DEEPTOK01-10 : le rapport ne dérive pas de ses preuves', () => {
  for (const chiffre of ['16 015', '103 894', '7 820', '8 000', '292 887', '83 870', '37,6', '243,9']) {
    assert.ok(DOC.includes(chiffre), `chiffre absent du rapport : ${chiffre}`);
  }
  assert.match(DOC, /DEEP_COST_DOMINANT/);
  assert.match(DOC, /`PRODUCTION_CODE_CHANGED = NO`/);
  const registre = lire('docs/OPEN-DEBTS.md');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01'],
    'mesurer un coût ne ferme pas une dette de capacité');
  assert.ok(ouvertes.includes('DEEP-TOKEN-COST-01'));
});
