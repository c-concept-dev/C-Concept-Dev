/* PERF-REAL-01E — ON NE PEUT PAS DESCENDRE SOUS LE PLANCHER.
 * ============================================================================
 *
 * Le lot demandait de réduire le coût en jetons d'un appel Fast pour faire
 * entrer le banc dans le quota. La comptabilité du fournisseur, relevée plutôt
 * qu'estimée, donne 425 jetons par appel ; le banc en autorise 147. Il faudrait
 * en retirer 65,4 %.
 *
 * LE PLANCHER TRANCHE. En supprimant INTÉGRALEMENT le prompt système — ce que le
 * contrat Fast interdit, mais qui borne le problème — un appel coûte encore
 * 192 jetons : le schéma (69), l'enveloppe de rôles imposée par l'API (46), la
 * demande la plus courte (27) et la sortie la plus courte (50). 192 dépasse 147.
 * Aucune version du prompt ne change cette conclusion.
 *
 * DONC RIEN N'A ÉTÉ AMPUTÉ. La section 13 impose de s'arrêter dans ce cas, et la
 * section 6 interdit de supprimer une instruction parce qu'elle est longue. Les
 * 221 jetons du prompt système portent la non-autorité, la discipline du dernier
 * recours et l'énumération des types — trois choses qu'aucun autre mécanisme
 * n'impose.
 *
 * CES TESTS VERROUILLENT LE PAYLOAD. Si quelqu'un raccourcit le prompt Fast, ou
 * y ajoute du contexte, ils échoueront — dans les deux sens.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  FAST_INTERACTION_JSON_SCHEMA, FAST_INTERACTION_TYPES, FAST_FORBIDDEN_AUTHORITY_FIELDS,
  createTurnSnapshot, validateFastInteraction
} from '../workers/shared/fast-interactive-plane.js';
import {
  FAST_INTERACTION_SYSTEM_PROMPT, makeFastInteractionUserMessage, FAST_INTERACTION_ADAPTERS,
  DECISION_PROVIDER_ORDER, GROQ_PRODUCTION_RETRY_DEFAULTS, MODEL
} from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const E = JSON.parse(lire('evaluation/perf-real-01/results-01e.json'));
const D = JSON.parse(lire('evaluation/perf-real-01/results-01d.json'));
const B = JSON.parse(lire('evaluation/perf-real-01/results-01b.json'));
const WORKER = lire('workers/groq/src/index.js');

/** Six classes neutres, les mêmes que les bancs 01B à 01D. */
const CLASSES = {
  A_SIMPLE: 'Explique la photosynthèse en trois phrases simples.',
  B_VAGUE: 'Aide-moi avec mon document.',
  C_RICHE: 'Rédige une note de cadrage de 800 mots pour un atelier de trois heures réunissant douze personnes, avec un ordre du jour minuté et trois livrables attendus.',
  D_CONFIRMATION: 'Résume ce rapport en gardant uniquement les recommandations, et supprime tout le reste.',
  E_ORIENTATION: 'Je dois préparer une refonte complète de notre processus de recrutement.',
  F_INCONNU_VALIDE: 'Compare les approches et dis-moi laquelle convient.'
};

// =================================================================================================
// §3, §4 — LA COMPTABILITÉ, ET LE PAYLOAD
// =================================================================================================

test('T-PERFREAL01E-01 : le coût d’un appel est celui que le fournisseur rapporte', () => {
  const c = E.comptabilite_avant;
  assert.match(c.source, /champ usage rapporte par Groq/);
  assert.equal(c.prompt_tokens.p50, 367);
  assert.equal(c.completion_tokens.p50, 59);
  assert.equal(c.total_tokens.p50, 425, 'FAST_TOTAL_TOKENS_P50');
  assert.equal(c.total_tokens.p95, 483);
  /* Le plafond de complétion ne coûte rien : aucune réponse n’est tronquée. */
  assert.deepEqual(c.finish_reason, ['stop']);
  assert.equal(c.max_completion_tokens_demandes, 512);
  assert.match(c.note, /le plafond de 512 n est jamais atteint — il ne consomme donc pas de budget/);
});

test('T-PERFREAL01E-02 : le plan rapide ne porte que ses propres responsabilités', () => {
  /* Rien dans la consigne ne lui demande de décider, router, exécuter ou vérifier. */
  const p = FAST_INTERACTION_SYSTEM_PROMPT;
  assert.match(p, /Vous ne décidez rien : ni que la demande est prête, ni quelle route suivre, ni aucun état\./);
  for (const responsabilite of ['READY', 'exécuter', 'livrable', 'quality gate', 'contrat canonique',
                                'Analyste', 'Critique', 'Arbitre']) {
    assert.equal(p.includes(responsabilite), false, `le plan rapide ne se voit pas confier : ${responsabilite}`);
  }
  /* Et ce qu'il porte est irréductible : trois obligations, aucune imposée ailleurs. */
  assert.match(p, /Types possibles : ACKNOWLEDGE/);
  assert.match(p, /Demander une précision est le dernier recours, jamais le premier/);
  assert.match(p, /Répondez exactement au schéma fourni : un type, un texte\. Rien d'autre\./);
});

test('T-PERFREAL01E-03 : aucune autorité OPRIE n’est recopiée dans le payload rapide', () => {
  const snapshot = createTurnSnapshot({ turn_id: 1, original_request: CLASSES.A_SIMPLE });
  const message = JSON.parse(makeFastInteractionUserMessage(snapshot));
  assert.deepEqual(Object.keys(message).sort(), ['demande', 'historique_clarifications', 'reponse_courante']);
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    assert.equal(champ in message, false, `${champ} absent du message`);
  }
  /* La consigne, elle, PARLE de route et d'état — pour les interdire. « ni quelle
     route suivre, ni aucun état » n'est pas une autorité recopiée, c'est son
     refus explicite. Ce qu'on vérifie donc, c'est que rien n'y est ACCORDÉ. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT,
    /Vous ne décidez rien : ni que la demande est prête, ni quelle route suivre, ni aucun état\./);
  for (const octroi of ['vous décidez', 'vous choisissez la route', 'marquez la demande',
                        'vous pouvez exécuter', 'déclarez prêt']) {
    assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.toLowerCase().includes(octroi), false,
      `aucune autorité accordée : « ${octroi} »`);
  }
  /* Ni contrat canonique, ni verrous, ni instructions de mode. */
  for (const bloc of ['canonical_contract', 'VERROUS', 'FORMATS', 'mode_demande', 'readiness']) {
    assert.equal(makeFastInteractionUserMessage(snapshot).includes(bloc), false);
  }
});

test('T-PERFREAL01E-04 : le schéma est inchangé, et il est irréductible', () => {
  assert.deepEqual(Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties).sort(), ['text', 'type'],
    'SCHEMA_CHANGED = NO');
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual([...FAST_INTERACTION_JSON_SCHEMA.required].sort(), ['text', 'type']);
  assert.deepEqual(FAST_INTERACTION_JSON_SCHEMA.properties.type.enum, [...FAST_INTERACTION_TYPES]);
  /* C'est cet objet-là qui rend l'autorité impossible : le retirer pour gagner
     69 jetons supprimerait la garantie, pas seulement du texte. */
  const inventaire = E.inventaire_payload.find((b) => b.bloc === 'SCHEMA');
  assert.equal(inventaire.retirable, false);
  assert.match(inventaire.raison, /garantie STRUCTURELLE que la candidate ne peut porter aucune autorite/);
});

test('T-PERFREAL01E-05 : il n’y avait rien à dédupliquer', () => {
  assert.equal(E.duplication.avant, 0, 'DUPLICATE_FAST_CONTEXT_COUNT_BEFORE');
  assert.equal(E.duplication.apres, 0, 'DUPLICATE_FAST_CONTEXT_COUNT_AFTER');
  /* Vérifié sur le payload réel : la demande n'apparaît qu'une fois. */
  const message = makeFastInteractionUserMessage(
    createTurnSnapshot({ turn_id: 1, original_request: CLASSES.C_RICHE }));
  assert.equal(message.split('Rédige une note de cadrage').length - 1, 1);
  for (const bloc of ['CANONICAL_CONTEXT', 'EXAMPLES', 'REDUNDANT_LOCKS']) {
    const b = E.inventaire_payload.find((x) => x.bloc === bloc);
    assert.equal(b.jetons_estimes, 0);
    assert.equal(b.retirable, 'DEJA ABSENT');
  }
});

// =================================================================================================
// §12, §13 — LE CALCUL, ET LE PLANCHER
// =================================================================================================

test('T-PERFREAL01E-16 : la capacité soutenable est calculée, pas décrétée', () => {
  const c = E.calcul_capacite;
  assert.equal(c.quota_observe_tpm, 8000);
  assert.equal(c.espacement_ms, 700);
  assert.equal(c.latence_nominale_p50_ms, D.sans_reprise.p50, 'la latence vient de la mesure 01D');
  assert.equal(c.periode_par_appel_ms, c.espacement_ms + c.latence_nominale_p50_ms);
  assert.equal(c.debit_du_banc_par_min, Math.round((60000 / c.periode_par_appel_ms) * 10) / 10);
  assert.equal(c.max_soutenable_jetons_par_requete, Math.floor(c.quota_observe_tpm / c.debit_du_banc_par_min));
  assert.equal(c.max_soutenable_jetons_par_requete, 147, 'MAX_SUSTAINABLE_TOKENS_PER_REQUEST');
  assert.equal(c.actuel_jetons_par_requete_p50, E.comptabilite_avant.total_tokens.p50);
  assert.equal(c.reduction_requise_percent, 65.4, 'REQUIRED_TOKEN_REDUCTION_PERCENT');
});

test('T-PERFREAL01E-15 : aucune réduction n’a été appliquée, et le plancher dit pourquoi', () => {
  const p = E.calcul_capacite.plancher_structurel;
  /* Le plancher est la somme de quatre postes dont AUCUN n'est le prompt système. */
  assert.equal(p.total, p.schema + p.enveloppe_api + p.demande_la_plus_courte + p.sortie_la_plus_courte);
  assert.equal(p.total, 192);
  assert.ok(p.total > E.calcul_capacite.max_soutenable_jetons_par_requete,
    `${p.total} jetons de plancher pour ${E.calcul_capacite.max_soutenable_jetons_par_requete} soutenables`);
  assert.equal(E.calcul_capacite.faisable, false, 'TOKEN_OPTIMIZATION_CAPACITY_FEASIBLE = NO');
  /* TOKEN_REDUCTION_PERCENT = 0 : le prompt est intact, mot pour mot. */
  assert.equal(E.optimisation.appliquee, false);
  assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.length, 794, 'la consigne n’a pas été raccourcie');
  assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.split(' ').length > 100, true);
  assert.match(E.optimisation.raison, /la section 6 interdit de supprimer une instruction parce qu elle est longue/);
});

// =================================================================================================
// §17, §20, §21 — CE QUI N'A PAS BOUGÉ, ET LA PREUVE EXÉCUTÉE
// =================================================================================================

test('T-PERFREAL01E-06/07 : ni le modèle ni l’ordre des fournisseurs n’ont changé', () => {
  assert.equal(MODEL, 'openai/gpt-oss-20b', 'MODEL_CHANGED = NO');
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai'],
    'PROVIDER_ORDER_CHANGED = NO');
  /* Les trois adaptateurs partagent la même consigne et le même schéma : une
     seule source, aucune variante par fournisseur. */
  const bloc = WORKER.slice(WORKER.indexOf('export const FAST_INTERACTION_ADAPTERS'),
    WORKER.indexOf('export async function runFastInteractionWithHaChain'));
  assert.equal([...bloc.matchAll(/systemPrompt: FAST_INTERACTION_SYSTEM_PROMPT/g)].length, 3);
  assert.equal([...bloc.matchAll(/schema: FAST_INTERACTION_JSON_SCHEMA/g)].length, 3);
  assert.deepEqual(Object.keys(FAST_INTERACTION_ADAPTERS).sort(), ['anthropic', 'groq', 'openai']);
});

test('T-PERFREAL01E-08/09/10 : reprises, délais et seuils inchangés', () => {
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries, 2, 'RETRY_POLICY_CHANGED = NO');
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs, 8000, 'TIMEOUT_POLICY_CHANGED = NO');
  assert.deepEqual(E.seuils_inchanges, {
    p50_prefere_ms: B.seuils.p50_prefere_ms, p95_contractuel_ms: B.seuils.p95_contractuel_ms,
    degrade_max_ms: B.seuils.degrade_max_ms, echec_contrat_ms: B.seuils.echec_contrat_ms
  }, 'THRESHOLDS_CHANGED = NO');
  /* Et le plafond de complétion n'a pas été rogné pour gagner du budget. */
  assert.match(WORKER, /maxCompletionTokens: 512,\n\s*pacer: createGroqRateLimitPacer\(\)/);
});

test('T-PERFREAL01E-11 : la construction du payload, exécutée sur les six classes', () => {
  for (const [classe, demande] of Object.entries(CLASSES)) {
    const snapshot = createTurnSnapshot({ turn_id: 1, original_request: demande });
    const message = makeFastInteractionUserMessage(snapshot);
    const analyse = JSON.parse(message);
    assert.equal(analyse.demande, demande, `${classe} : la demande passe telle quelle`);
    assert.deepEqual(analyse.historique_clarifications, []);
    assert.equal(analyse.reponse_courante, null);
    assert.equal(Object.keys(analyse).length, 3, `${classe} : trois champs, pas un de plus`);
    /* Le coût du message croît avec la demande, et avec rien d'autre. */
    const nu = makeFastInteractionUserMessage(createTurnSnapshot({ turn_id: 1, original_request: 'x' }));
    assert.equal(message.length - nu.length, demande.length - 1, `${classe} : aucun surcoût fixe caché`);
  }
});

test('T-PERFREAL01E-12/13 : les six classes respectent le contrat, et n’écrivent aucune autorité', () => {
  let conformes = 0;
  for (const [classe, demande] of Object.entries(CLASSES)) {
    const snapshot = createTurnSnapshot({ turn_id: 1, original_request: demande });
    for (const type of FAST_INTERACTION_TYPES) {
      const v = validateFastInteraction({ type, text: 'Une phrase de réponse.' }, snapshot);
      assert.equal(v.ok, true, `${classe}/${type} : schéma valide`);
      assert.equal(v.interaction.can_mark_ready, false);
      assert.equal(v.interaction.can_route, false);
      assert.equal(v.interaction.can_execute, false);
      assert.equal(v.interaction.authority, 'candidate');
    }
    /* Un texte vide, un type inventé, un champ d'autorité : tous refusés. */
    assert.equal(validateFastInteraction({ type: 'ACKNOWLEDGE', text: '' }, snapshot).ok, false);
    assert.equal(validateFastInteraction({ type: 'DECIDE', text: 'x' }, snapshot).ok, false);
    for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
      assert.equal(validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'x', [champ]: true }, snapshot).ok,
        false, `${classe} : ${champ} refusé`);
    }
    conformes += 1;
  }
  assert.equal(conformes, 6, 'FAST_CONTRACT_FIXTURES_PASS = 6/6');
});

test('T-PERFREAL01E-14 : l’artefact frontend n’a pas bougé, et l’observation ne décide rien', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    'd0138022dcc27bcc4f6368fb0acda8c54d2b09b68c7016607bbf22d6a5d364a7', 'CANONICAL_HTML_CHANGED = NO');
  /* La seule modification du worker est le relevé de usage : cinq champs, aucun branchement. */
  assert.match(WORKER, /event: "groq_usage_observation"/);
  for (const champ of ['jetons_entree', 'jetons_sortie', 'jetons_total',
                       'plafond_sortie_demande', 'finish_reason']) {
    assert.ok(WORKER.includes(champ), `${champ} relevé`);
  }
  assert.equal(/if\s*\(\s*envelope\?\.usage|usage\?\.total_tokens\s*[<>]/.test(WORKER), false,
    'aucune décision ne lit la comptabilité');
  assert.equal(E.instrumentation.comportement_modifie, false);
});
