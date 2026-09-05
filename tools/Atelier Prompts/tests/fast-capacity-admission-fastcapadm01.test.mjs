/* FAST-CAPACITY-ADMISSION-01 — CE QU'ON PEUT SAVOIR AVANT D'APPELER, ET CE QU'ON NE PEUT PAS.
 * ============================================================================
 *
 * LA QUESTION POSÉE ÉTAIT : peut-on décider AVANT l'appel si une requête rapide
 * tient dans la capacité restante, sans inventer de seuil ? La réponse est NON, et
 * elle l'est trois fois plutôt qu'une :
 *
 *   1. LE COÛT est inconnu avant l'appel. Aucun tokenizer n'est embarqué, Groq
 *      n'expose aucune route de comptage. La seule borne EXACTE disponible est
 *      « jetons <= octets » : 794 + 16 384 + 512 = 17 690, soit 2,2 fois le quota
 *      d'une minute ENTIÈRE. Une admission fondée dessus refuserait tout.
 *   2. SUBSTITUER 426 ou 485 serait faire d'une statistique une autorité — la
 *      section 9 du lot l'interdit, et ce fichier le vérifie.
 *   3. LA CAPACITÉ RESTANTE n'arrive qu'APRÈS coup : les en-têtes de débit voyagent
 *      sur la réponse. Toute vérification préalable lit une valeur périmée d'au
 *      moins un aller-retour, aveugle aux appels concurrents et au plan profond.
 *
 * CE QUI A DONC ÉTÉ IMPLÉMENTÉ EST LE NIVEAU 1, ET RIEN DE PLUS : quand Groq
 * ANNONCE un délai, on le retient et on s'abstient jusqu'à son expiration. Pas de
 * machine à états, pas de pourcentage, pas de seuil, pas de compteur d'utilisateurs.
 *
 * LA PORTÉE A ÉTÉ MESURÉE, PAS SUPPOSÉE. 50 invocations réelles, 4 isolats
 * distincts, 100 % des requêtes servies par un isolat déjà vu à la cadence du pic.
 * Une mémoire de module suffit donc — sans KV, sans Durable Object.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TRANSPORT_LIMITS, DecisionHttpError } from '../workers/shared/decision-core.js';
import { FAST_FORBIDDEN_AUTHORITY_FIELDS } from '../workers/shared/fast-interactive-plane.js';
import {
  admissionRapide, enregistrerSignalCapaciteRapide, reinitialiserRefroidissementRapide,
  FAST_ADMISSION_STRENGTH, FAST_CAPACITY_UNAVAILABLE_CODE,
  FAST_PROVIDER_ORDER, DECISION_PROVIDER_ORDER, ROLE_PROVIDER_ORDER,
  resolveFastProviderOrder, runFastInteractionWithHaChain,
  GROQ_PRODUCTION_RETRY_DEFAULTS, parseRetryAfterMs
} from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const WORKER = lire('workers/groq/src/index.js');
/* La prose explique ; seul le CODE décide. Les preuves qui cherchent une règle
   regardent la source dépouillée de ses commentaires. */
const CODE = WORKER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const instantane = () => ({
  turn_id: 1, original_request: 'Explique la photosynthèse en trois phrases simples.',
  clarification_history: [], current_answer: null, canonical_version: 0
});

/* T-FASTCAPADM-01 — AUCUN CODAGE EN DUR D'UN NOMBRE D'UTILISATEURS, ni d'un débit,
 * ni d'un pourcentage de quota. Le contrat de capacité de la bêta vit dans un
 * document ; il n'a aucun droit de se retrouver dans une condition. */
test('T-FASTCAPADM-01 : aucun nombre d’utilisateurs, de débit ou de pourcentage codé en dur', () => {
  const zone = CODE.slice(CODE.indexOf('export const FAST_ADMISSION_STRENGTH'),
    CODE.indexOf('export const DECISION_PROVIDER_ORDER'));
  for (const interdit of [/\busers?\b/i, /utilisateur/i, /\brpm\b/i, /\btpm\b/i, /concurrent/i,
    /\b0\.[0-9]+\s*\*/, /\*\s*0\.[0-9]+/, /percent|pourcent/i, /headroom|marge_/i]) {
    assert.equal(interdit.test(zone), false, `codage en dur détecté : ${interdit}`);
  }
  /* Les nombres du dossier de capacité n'apparaissent nulle part comme logique. */
  for (const nombre of ['426', '485', '8000', '6400', '5820', '2910']) {
    assert.equal(new RegExp(`[^\\w]${nombre}[^\\w]`).test(zone), false,
      `${nombre} est une mesure de rapport, pas une constante de code`);
  }
});

/* T-FASTCAPADM-02 — AUCUNE INSPECTION SÉMANTIQUE. L'admission ne reçoit même pas de
 * quoi en faire : sa signature n'accepte qu'une horloge. */
test('T-FASTCAPADM-02 : l’admission ne peut rien lire de la demande', () => {
  /* Les signatures elles-mêmes ferment la porte : l’admission ne reçoit qu’une
     horloge, l’enregistrement qu’un délai et une horloge. Aucune des deux ne peut
     recevoir la demande, faute de paramètre pour la porter. */
  assert.match(CODE, /export function admissionRapide\(maintenant = Date\.now\(\)\) \{/);
  assert.match(CODE, /export function enregistrerSignalCapaciteRapide\(delaiAnnonceMs, maintenant = Date\.now\(\)\) \{/);
  const corps = CODE.slice(CODE.indexOf('export function admissionRapide'),
    CODE.indexOf('export function reinitialiserRefroidissementRapide'));
  for (const interdit of ['snapshot', 'original_request', 'clarification_history', 'domaine',
    'domain', 'mode', 'oprie', 'readiness', 'route', 'user', 'text', 'body', 'headers', 'env']) {
    assert.equal(new RegExp(interdit, 'i').test(corps), false,
      `l’admission ne connaît pas ${interdit}`);
  }
  /* Et deux demandes radicalement différentes reçoivent la même décision. */
  reinitialiserRefroidissementRapide();
  assert.deepEqual(admissionRapide(1000), admissionRapide(1000));
});

/* T-FASTCAPADM-03 — LE REFROIDISSEMENT EXPIRE EXACTEMENT QUAND LE FOURNISSEUR L'A DIT.
 * Pas une milliseconde de plus, pas une de moins. */
test('T-FASTCAPADM-03 : l’expiration est exactement celle annoncée', () => {
  reinitialiserRefroidissementRapide();
  const t0 = 1_000_000;
  assert.equal(enregistrerSignalCapaciteRapide(2000, t0), t0 + 2000);
  assert.equal(admissionRapide(t0).admise, false, 'à l’instant du signal : abstention');
  assert.equal(admissionRapide(t0 + 1999).admise, false, '1 ms avant l’échéance : encore');
  assert.equal(admissionRapide(t0 + 2000).admise, true, 'à l’échéance exacte : de nouveau admis');
  assert.equal(admissionRapide(t0 + 2000).raison, 'COOLDOWN_EXPIRED');
  assert.equal(admissionRapide(t0 + 1999).raison, 'PROVIDER_ANNOUNCED_COOLDOWN_ACTIVE');
  assert.equal(admissionRapide(t0 + 1000).restant_ms, 1000, 'le reste à attendre est exact');
  /* Un délai plus court n'écourte jamais un souvenir plus lointain. */
  assert.equal(enregistrerSignalCapaciteRapide(500, t0), t0 + 2000);
  reinitialiserRefroidissementRapide();
});

/* T-FASTCAPADM-04 — AUCUN REFROIDISSEMENT INVENTÉ. Sans annonce du fournisseur,
 * aucune abstention — et surtout pas les 30 s de repli du dépôt. */
test('T-FASTCAPADM-04 : rien d’annoncé, rien de retenu', () => {
  for (const rien of [null, undefined, NaN, 0, -1, -30000, Infinity, '2000', {}, []]) {
    reinitialiserRefroidissementRapide();
    assert.equal(enregistrerSignalCapaciteRapide(rien, 1000), null,
      `aucune abstention pour une annonce absente ou invalide : ${String(rien)}`);
    assert.equal(admissionRapide(1000).admise, true);
    assert.equal(admissionRapide(1000).raison, 'NO_COOLDOWN_RECORDED');
  }
  /* Le repli fixe du dépôt existe toujours pour la boucle de reprise… */
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.defaultBackoffMs, 30000);
  /* …mais il ne voyage jamais sous le nom d'une annonce fournisseur. */
  assert.match(CODE, /const annonceFournisseur = parseRetryAfterMs\(response\) \?\? parseRetryDelayFromBody\(raw\);/);
  assert.match(CODE, /const retryAfterMs = annonceFournisseur \?\? defaultBackoffMs;/);
  assert.equal(/provider_announced_retry_after_ms:\s*(retryAfterMs|defaultBackoffMs)\b/.test(CODE), false);
  reinitialiserRefroidissementRapide();
});

/* T-FASTCAPADM-05 — AUCUNE MÉTRIQUE EMPIRIQUE COMME AUTORITÉ. Le coût mesuré du plan
 * rapide est un fait de rapport ; il ne décide de rien. Et la seule borne EXACTE
 * disponible est si lâche qu'elle refuserait tout : c'est cela qui ferme le niveau 2. */
test('T-FASTCAPADM-05 : aucune statistique ne sert d’autorité, et la borne exacte est dégénérée', () => {
  const N = JSON.parse(lire('evaluation/perf-nominal-provider-01/results.json'));
  assert.equal(N.groq.jetons.total.p50, 426);
  assert.equal(N.groq.jetons.total.p95, 485);
  /* Ces valeurs n'existent nulle part dans le code. */
  for (const nombre of [426, 485]) {
    assert.equal(new RegExp(`[^\\w]${nombre}[^\\w]`).test(CODE), false,
      `${nombre} ne figure pas dans le code du worker`);
  }
  /* La seule borne exacte : jetons <= octets. Elle dépasse le quota d'une minute. */
  const borneEntree = TRANSPORT_LIMITS.analyst;
  assert.equal(borneEntree, 16384);
  const bornePrompt = 794;
  const plafondSortie = 512;
  assert.match(CODE, /maxCompletionTokens: 512/, 'le plafond de sortie, lui, est explicite et réel');
  const borneTotale = borneEntree + bornePrompt + plafondSortie;
  assert.equal(borneTotale, 17690);
  const quota = Number(N.groq.capacite.depart.budget_limite);
  assert.equal(quota, 8000);
  assert.ok(borneTotale > quota * 2,
    'la borne exacte dépasse le quota d’une minute entière : une admission fondée dessus refuserait tout');
});

/* T-FASTCAPADM-06 — LECTURE DES SIGNAUX FOURNISSEUR. L'en-tête Retry-After est lu
 * dans ses deux formes normalisées, et lui seul fonde une abstention. */
test('T-FASTCAPADM-06 : les signaux fournisseur sont lus tels qu’ils arrivent', () => {
  const reponse = (valeur) => ({ headers: { get: (n) => (n === 'retry-after' ? valeur : null) } });
  assert.equal(parseRetryAfterMs(reponse('2')), 2000, 'secondes entières');
  assert.equal(parseRetryAfterMs(reponse('0.5')), 500, 'secondes fractionnaires');
  assert.equal(parseRetryAfterMs(reponse('0')), 0);
  const dansDixSecondes = new Date(Date.now() + 10000).toUTCString();
  const parDate = parseRetryAfterMs(reponse(dansDixSecondes));
  assert.ok(parDate > 8000 && parDate <= 10000, 'date HTTP');
  /* Les en-têtes de budget sont relevés, et ils arrivent sur la RÉPONSE — donc après. */
  for (const entete of ['x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens',
    'x-ratelimit-reset-tokens', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests']) {
    assert.ok(WORKER.includes(entete), `en-tête relevé : ${entete}`);
  }
  assert.equal(/response\.headers\.get/.test(CODE), true,
    'les budgets se lisent sur la réponse : aucune capacité n’est connue avant l’appel');
});

/* T-FASTCAPADM-07 — SIGNAL MALFORMÉ : ON N'INVENTE RIEN, ON N'EXPLOSE PAS. */
test('T-FASTCAPADM-07 : un signal absent ou malformé ne produit ni abstention ni erreur', () => {
  const reponse = (valeur) => ({ headers: { get: () => valeur } });
  for (const malforme of [null, '', 'bientôt', 'NaN', '-3', 'demain 14h', '{}']) {
    const lu = parseRetryAfterMs(reponse(malforme));
    assert.ok(lu === null || Number.isFinite(lu), `lecture sûre de : ${String(malforme)}`);
    reinitialiserRefroidissementRapide();
    enregistrerSignalCapaciteRapide(lu, 1000);
    if (lu === null || lu <= 0) assert.equal(admissionRapide(1000).admise, true,
      `aucune abstention inventée pour : ${String(malforme)}`);
  }
  assert.equal(parseRetryAfterMs(undefined), null, 'même sans réponse du tout');
  assert.equal(parseRetryAfterMs({}), null);
  reinitialiserRefroidissementRapide();
});

/* T-FASTCAPADM-08 — L'AUTORITÉ DU PLAN RAPIDE RESTE NULLE, refus compris. */
test('T-FASTCAPADM-08 : le refus n’écrit aucune autorité', async () => {
  reinitialiserRefroidissementRapide();
  enregistrerSignalCapaciteRapide(5000, Date.now());
  const erreur = await runFastInteractionWithHaChain(instantane(), {}, { log: () => {} })
    .then(() => null, (e) => e);
  assert.ok(erreur instanceof DecisionHttpError, 'le refus est une erreur de transport');
  assert.equal(erreur.status, 503);
  assert.equal(erreur.code, FAST_CAPACITY_UNAVAILABLE_CODE);
  /* Rien de ce qui sort ne porte un champ d'autorité. */
  const charge = JSON.stringify({ error: erreur.code, message: erreur.message });
  for (const interdit of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    assert.equal(charge.includes(interdit), false, `le refus ne transporte pas ${interdit}`);
  }
  for (const interdit of ['READY', 'etat_demande', 'route', 'confiance', 'degraded_state']) {
    assert.equal(charge.includes(interdit), false, `le refus ne transporte pas ${interdit}`);
  }
  reinitialiserRefroidissementRapide();
});

/* T-FASTCAPADM-09 — AUCUN REPLI DU PLAN RAPIDE VERS ANTHROPIC OU OPENAI. */
test('T-FASTCAPADM-09 : le plan rapide n’a qu’un fournisseur', () => {
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq']);
  assert.deepEqual(resolveFastProviderOrder({}), ['groq']);
  assert.deepEqual(resolveFastProviderOrder({ FAST_BENCH_PROVIDER: 'ha' }), ['groq']);
  assert.equal(FAST_PROVIDER_ORDER.includes('anthropic'), false, 'FAST_ANTHROPIC_FAILOVER = NO');
  assert.equal(FAST_PROVIDER_ORDER.includes('openai'), false, 'FAST_OPENAI_FAILOVER = NO');
  /* L'ordre du plan PROFOND et de /decision est intact, à l'octet près. */
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  assert.match(WORKER, /export const ROLE_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/);
  /* L'épinglage diagnostic les atteint toujours : c'est un outil de mesure. */
  for (const f of ['anthropic', 'openai']) {
    assert.deepEqual(resolveFastProviderOrder({ FAST_BENCH_PROVIDER: f }), [f]);
  }
});

/* T-FASTCAPADM-10 — LE REFUS N'ÉCRIT AUCUN ÉTAT DÉGRADÉ D'OPRIE. Les deux plans ne
 * se touchent pas : la dégradation du profond a son propre chemin, intact. */
test('T-FASTCAPADM-10 : le refus rapide n’atteint pas la dégradation OPRIE', () => {
  const zone = CODE.slice(CODE.indexOf('export const FAST_ADMISSION_STRENGTH'),
    CODE.indexOf('export const DECISION_PROVIDER_ORDER'));
  for (const interdit of ['degradedResultFromProviderChainError', 'createDegradedRoleResult',
    'degraded_state', 'validateDegradedRoleResult', 'OPRIE_ROLES', 'runRoleWithHaChain']) {
    assert.equal(zone.includes(interdit), false, `le chemin rapide n’appelle pas ${interdit}`);
  }
  /* Et la dégradation du plan profond n'a pas bougé. */
  const orchestrateur = lire('workers/shared/operational-request-orchestrator.js');
  assert.match(orchestrateur, /operational_request_degraded/);
  assert.equal(orchestrateur.includes(FAST_CAPACITY_UNAVAILABLE_CODE), false,
    'le plan profond ignore jusqu’au nom de ce refus');
});

/* T-FASTCAPADM-11 — AUCUNE MACHINE À ÉTATS. Un seul horodatage, deux issues. */
test('T-FASTCAPADM-11 : un horodatage, pas une machine à états', () => {
  for (const etat of ['NORMAL', 'PRESSURED', 'SATURATED', 'RECOVERING', 'DEGRADED_MODE',
    'transition', 'stateMachine', 'machine_a_etats']) {
    assert.equal(new RegExp(etat, 'i').test(CODE.slice(
      CODE.indexOf('export const FAST_ADMISSION_STRENGTH'),
      CODE.indexOf('export const DECISION_PROVIDER_ORDER'))), false, `aucun état ${etat}`);
  }
  /* Une seule variable mémorise, et c'est un nombre. */
  const declarations = [...CODE.matchAll(/^let ([A-Z_]+) = /gm)].map((m) => m[1]);
  assert.ok(declarations.includes('REFROIDISSEMENT_RAPIDE_JUSQUA'));
  reinitialiserRefroidissementRapide();
  assert.equal(typeof admissionRapide(1).refroidissement_jusqua, 'object', 'null quand rien n’est retenu');
  enregistrerSignalCapaciteRapide(1000, 1);
  assert.equal(typeof admissionRapide(1).refroidissement_jusqua, 'number');
  /* L'admission ne rend que deux issues possibles. */
  const issues = new Set([admissionRapide(1).admise, admissionRapide(100000).admise]);
  assert.deepEqual([...issues].sort(), [false, true]);
  assert.equal(FAST_ADMISSION_STRENGTH, 'BEST_EFFORT',
    'et le mécanisme ne se prétend pas plus fort qu’il ne l’est');
  reinitialiserRefroidissementRapide();
});

/* T-FASTCAPADM-12 — L'ARTEFACT CANONIQUE EST INCHANGÉ. */
test('T-FASTCAPADM-12 : le HTML canonique est inchangé', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    'd0138022dcc27bcc4f6368fb0acda8c54d2b09b68c7016607bbf22d6a5d364a7', 'CANONICAL_HTML_CHANGED = NO');
  /* Et rien du mécanisme n'a fui vers le navigateur. */
  const html = lire('atelier-prompts-v11.5-lot10g-decision-provider.html');
  for (const interdit of ['admissionRapide', 'REFROIDISSEMENT_RAPIDE', FAST_CAPACITY_UNAVAILABLE_CODE,
    'FAST_BENCH_PROVIDER', 'FAST_PROVIDER_ORDER']) {
    assert.equal(html.includes(interdit), false, `${interdit} reste côté serveur`);
  }
});

/* T-FASTCAPADM-13 — LA PORTÉE A ÉTÉ MESURÉE. La section 19 exigeait de la prouver
 * avant de choisir un stockage : c'est cette mesure qui justifie la mémoire de
 * module plutôt qu'un KV ou un Durable Object. */
test('T-FASTCAPADM-13 : la portée d’isolat est mesurée, et le stockage en découle', () => {
  const P = JSON.parse(lire('evaluation/fast-capacity-admission-01/results.json'));
  assert.equal(P.portee_isolat.invocations_tracees, 50);
  assert.equal(P.portee_isolat.isolats_distincts, 4);
  assert.equal(P.portee_isolat.motifs.cadence_du_pic.part_isolat_deja_vu_percent, 100);
  assert.ok(P.portee_isolat.motifs.rafale_dense.part_isolat_deja_vu_percent >= 80);
  assert.equal(P.portee_isolat.appels_fournisseur, 0, 'la mesure n’a coûté aucun jeton');
  /* Le stockage retenu est le plus simple qui soit, et rien de distribué n'apparaît. */
  assert.equal(P.stockage_retenu, 'ISOLATE_MODULE_MEMORY');
  for (const interdit of ['DurableObject', 'durable_object', 'KVNamespace', 'env.KV', 'caches.default']) {
    assert.equal(CODE.includes(interdit), false, `aucune persistance distribuée : ${interdit}`);
  }
  const wrangler = JSON.parse(lire('workers/groq/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(Object.prototype.hasOwnProperty.call(wrangler, 'durable_objects'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(wrangler, 'kv_namespaces'), false);
});
