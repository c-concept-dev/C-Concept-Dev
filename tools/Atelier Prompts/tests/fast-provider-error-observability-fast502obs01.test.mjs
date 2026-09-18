/* FAST-502-OBS-01 — LE MOTIF DU REJET DOIT SURVIVRE À LA CHAÎNE.
 * ============================================================================
 *
 * CE QUE HUIT OCCURRENCES DE PRODUCTION ONT MONTRÉ. Le navigateur voyait un HTTP 502 sur
 * `/fast-interaction`, le produit continuait par le plan profond, et le relevé de synthèse
 * `fast_unavailable` disait « aucun fournisseur disponible » — `error_kind: null`,
 * `provider_attempts: 1`, et rien d'autre.
 *
 * OR LA CAUSE AVAIT DÉJÀ ÉTÉ ÉCRITE, un événement plus haut. Les huit tours portaient un
 * `groq_api_error` avec `status: 400` et `code: "json_validate_failed"` — et, sur les cinq tours
 * postérieurs au lot de télémétrie, la structure de ce qui avait échoué : 64 caractères, non
 * parsable, zéro clé, non tronqué, cinq champs attendus absents. Identique cinq fois.
 *
 * LA PERTE ÉTAIT MÉCANIQUE, ET ELLE SE LIT DANS UNE LIGNE :
 *   provider_attempts: Array.isArray(error?.attempts) ? error.attempts.length : null
 * `ProviderChainError.attempts` porte `[{provider, failure_class}]` — la classe EST là, et seule la
 * longueur était retenue. Qui lisait la synthèse devait rouvrir la trace brute pour retrouver le
 * pourquoi, et l'y trouvait sous une forme que les lecteurs de trace usuels ignorent : un objet, non
 * une chaîne JSON.
 *
 * CE QUE CE LOT FAIT, ET RIEN DE PLUS. Il cesse de jeter. Aucune décision ne lit les champs ajoutés :
 * ni la classification, ni la reprise, ni la bascule, ni le code HTTP rendu, ni l'escalade profonde.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  describeProviderError, redactProviderText, PROVIDER_ERROR_MESSAGE_MAX_LENGTH,
  FAST_INTERACTION_ADAPTERS, classifyProviderHttpStatus, FAST_PROVIDER_ORDER
} from '../workers/groq/src/index.js';
import { createTurnSnapshot } from '../workers/shared/fast-interactive-plane.js';
import {
  runProviderChain, FAILURE_CLASSES, FAILOVER_ELIGIBLE_CLASSES, isFailoverEligible,
  COMMON_CAUSE_REJECTION_THRESHOLD, tagFailure, ProviderChainError
} from '../workers/shared/provider-ha.js';
import { handleFastInteractionRequest, FAST_INTERACTION_PATHNAME } from '../workers/shared/fast-interaction-endpoint.js';

const ha = fs.readFileSync(new URL('../workers/shared/provider-ha.js', import.meta.url), 'utf8');
const endpoint = fs.readFileSync(new URL('../workers/shared/fast-interaction-endpoint.js', import.meta.url), 'utf8');

/** Un appel Groq réel, avec `fetch` remplacé — aucun réseau, aucun secret. */
async function appelGroq(status, corps, { entetes = {} } = {}) {
  const vrai = globalThis.fetch;
  globalThis.fetch = async () => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps),
    { status, headers: { 'content-type': 'application/json', ...entetes } });
  const journal = [];
  const vraiErr = console.error; const vraiLog = console.log;
  console.error = (...a) => journal.push(a[0]); console.log = (...a) => journal.push(a[0]);
  try {
    /* L'adaptateur rapide est le chemin EXPORTÉ vers callGroqChatCompletion : on l'emprunte tel
       quel plutôt que d'ouvrir une porte de test dans le module. */
    const instantane = createTurnSnapshot({ turn_id: 1, original_request: 'Une demande de contrôle.',
      clarification_history: [], current_answer: null, canonical_version: 0, material_present: false });
    await FAST_INTERACTION_ADAPTERS.groq(instantane, { GROQ_API_KEY: 'gsk_TEST_NE_DOIT_PAS_FUIR' });
    return { erreur: null, journal };
  } catch (erreur) {
    return { erreur, journal };
  } finally {
    globalThis.fetch = vrai; console.error = vraiErr; console.log = vraiLog;
  }
}

/* ==========================================================================
 * LE POINT DE CAPTURE
 * ======================================================================= */

test('T-F502-01 : HTTP 400 avec erreur JSON structurée → motif borné attaché à l’erreur', async () => {
  /* LE CAS RÉEL, à l'identique des huit occurrences. */
  const { erreur } = await appelGroq(400, { error: {
    code: 'json_validate_failed', type: 'invalid_request_error',
    message: "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
    failed_generation: 'ceci est un contenu de modèle qui ne doit jamais sortir du worker.'
  } });
  assert.ok(erreur, 'un 400 lève');
  assert.equal(erreur.failure_class, FAILURE_CLASSES.REQUEST_REJECTED, 'la classification est inchangée');
  assert.equal(erreur.status, 400);

  const motif = erreur.provider_error;
  assert.equal(motif.provider, 'groq');
  assert.equal(motif.upstream_status, 400);
  assert.equal(motif.provider_error_code, 'json_validate_failed');
  assert.equal(motif.provider_error_type, 'invalid_request_error');
  assert.match(motif.provider_error_message, /Failed to generate JSON/);
  /* LE CONTENU DU MODÈLE NE SORT PAS. */
  assert.equal(JSON.stringify(motif).includes('contenu de modèle'), false);
  assert.equal(JSON.stringify(motif).includes('failed_generation'), true,
    'seul le MOT du champ, cité par le message de Groq, apparaît — jamais sa valeur');
});

test('T-F502-02 : HTTP 422 traité comme un 400 — même classe, même capture', async () => {
  assert.equal(classifyProviderHttpStatus(422), FAILURE_CLASSES.REQUEST_REJECTED, 'classification inchangée');
  const { erreur } = await appelGroq(422, { error: { code: 'unprocessable', message: 'Schéma refusé.', param: 'response_format' } });
  assert.equal(erreur.failure_class, FAILURE_CLASSES.REQUEST_REJECTED);
  assert.equal(erreur.provider_error.upstream_status, 422);
  assert.equal(erreur.provider_error.provider_error_code, 'unprocessable');
  assert.equal(erreur.provider_error.provider_error_param, 'response_format',
    'le champ incriminé est retenu quand le fournisseur le nomme');
});

test('T-F502-03 : corps non JSON → rien n’est inventé', async () => {
  const { erreur } = await appelGroq(400, 'Bad Request');
  assert.equal(erreur.failure_class, FAILURE_CLASSES.REQUEST_REJECTED);
  const motif = erreur.provider_error;
  assert.equal(motif.upstream_status, 400, 'le statut reste connu : il vient de la réponse');
  assert.equal(motif.provider_error_code, null, 'aucun code fabriqué');
  assert.equal(motif.provider_error_type, null);
  assert.equal(motif.provider_error_message, null);
  assert.equal(motif.provider_error_param, null);
});

test('T-F502-04 : un message très long est borné', () => {
  /* De la PROSE longue : une suite opaque de 5000 caractères est expurgée AVANT d'être bornée —
     elle ressemble à un secret, et c'est le bon comportement. Le bornage se vérifie donc sur ce
     qu'un fournisseur envoie réellement : des phrases. */
  const long = ('Le schéma fourni a été refusé par le validateur amont. '.repeat(200));
  const motif = describeProviderError('groq', 400, { code: 'c', message: long });
  assert.ok(long.length > 5000, 'le message d’entrée est bien très long');
  assert.equal(motif.provider_error_message.length, PROVIDER_ERROR_MESSAGE_MAX_LENGTH);
  /* Et une suite opaque, elle, est expurgée puis bornée — jamais conservée. */
  const opaque = describeProviderError('groq', 400, { message: 'x'.repeat(5000) });
  assert.equal(opaque.provider_error_message, '[EXPURGÉ]');
  assert.equal(PROVIDER_ERROR_MESSAGE_MAX_LENGTH, 200, 'la borne est courte, et déclarée');
  /* Les étiquettes ont leur propre borne, plus courte encore — éprouvée sur une valeur que
     l'expurgation ne confond pas avec un secret : des mots séparés. */
  const etiquetteLongue = 'code de refus '.repeat(40);
  assert.equal(describeProviderError('groq', 400, { code: etiquetteLongue }).provider_error_code.length, 64);
});

test('T-F502-05 : toute séquence ressemblant à un secret est expurgée', () => {
  const cas = [
    ['Authorization: Bearer abcdefghijklmnop', 'Bearer [EXPURGÉ]'],
    ['clé gsk_ABCDEFGH12345678abcdefgh refusée', '[EXPURGÉ]'],
    ['token sk-ABCDEFGH12345678abcdefgh invalide', '[EXPURGÉ]'],
    ['opaque AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '[EXPURGÉ]']
  ];
  for (const [entree, attendu] of cas) {
    const sorti = redactProviderText(entree);
    assert.match(sorti, new RegExp(attendu.replace(/[[\]]/g, '\\$&')), `expurgé : ${entree.slice(0, 20)}`);
    for (const fuite of ['abcdefghijklmnop', 'gsk_ABCDEFGH12345678abcdefgh', 'sk-ABCDEFGH12345678abcdefgh']) {
      assert.equal(sorti.includes(fuite), false, `« ${fuite} » ne doit pas subsister`);
    }
  }
  assert.equal(redactProviderText(null), null);
  assert.equal(redactProviderText(''), null);
  /* Et la clé réellement utilisée par l'appel ne peut pas fuir par ce chemin. */
  assert.equal(redactProviderText('env GROQ_API_KEY=gsk_TEST_NE_DOIT_PAS_FUIR_XXXXXXXX').includes('NE_DOIT_PAS_FUIR'), false);
});

test('T-F502-06 : failed_generation n’est JAMAIS exposé, ni en partie', async () => {
  const secret = 'PHRASE_DU_MODELE_QUI_NE_DOIT_JAMAIS_SORTIR';
  const { erreur, journal } = await appelGroq(400, { error: {
    code: 'json_validate_failed', message: 'Failed to generate JSON.', failed_generation: secret
  } });
  assert.equal(JSON.stringify(erreur.provider_error).includes(secret), false, 'pas dans le motif');
  /* Ni dans le relevé `groq_api_error`, qui n'en décrit que la STRUCTURE. */
  const releve = journal.find((x) => x && x.event === 'groq_api_error');
  assert.ok(releve, 'le relevé existe');
  assert.equal(JSON.stringify(releve).includes(secret), false, 'pas dans le relevé');
  assert.equal(releve.failed_generation_present, true, 'sa présence est dite');
  assert.equal(releve.failed_generation_length, secret.length, 'sa longueur est dite');
});

/* ==========================================================================
 * LA PROPAGATION, ET CE QU'ELLE NE CHANGE PAS
 * ======================================================================= */

test('T-F502-07 : le motif voyage sur l’ERREUR, et l’observabilité HA reste structurelle', async () => {
  /* LA LEÇON DE CE LOT, ET ELLE EST VENUE D'UN TEST. Ma première version mettait le résumé dans
     `attempts` et dans `provider_ha_failure`. HA01-16 l'a refusée, et il gardait mieux que mon
     correctif : l'observabilité de ce module est STRUCTURELLE PAR CONSTRUCTION — noms, index,
     classes d'une énumération fermée — et c'est cela, non une expurgation, qui rend une fuite
     impossible. Un texte du fournisseur, même borné, échangeait une garantie de construction contre
     une garantie de filtrage.
     Le résumé accompagne donc l'ERREUR : une erreur en vol est une donnée, pas une trace. */
  const journal = [];
  const motif = { provider: 'groq', upstream_status: 400, provider_error_code: 'json_validate_failed',
    provider_error_type: null, provider_error_param: null, provider_error_message: 'Failed to generate JSON.' };
  await assert.rejects(() => runProviderChain({
    role: 'fast_interaction', order: ['groq'],
    providers: [{ name: 'groq', execute: async () => {
      throw tagFailure(new Error('Groq a répondu 400.'), FAILURE_CLASSES.REQUEST_REJECTED,
        { provider: 'groq', status: 400, provider_error: motif });
    } }],
    log: (e) => journal.push(e)
  }), (erreur) => {
    assert.ok(erreur instanceof ProviderChainError);
    /* `attempts` est INCHANGÉ : deux champs, comme avant ce lot. */
    assert.deepEqual(erreur.attempts, [{ provider: 'groq', failure_class: 'request_rejected' }]);
    /* et le motif est ailleurs, sur l'erreur. */
    assert.equal(erreur.provider_errors.length, 1);
    assert.equal(erreur.provider_errors[0].provider_error_code, 'json_validate_failed');
    assert.equal(erreur.provider_errors[0].upstream_status, 400);
    return true;
  });

  /* L'OBSERVABILITÉ HA NE PORTE RIEN DE NOUVEAU — vérifié sur la sérialisation entière. */
  const observabilite = JSON.stringify(journal);
  for (const interdit of ['provider_error', 'json_validate_failed', 'Failed to generate', 'upstream_status']) {
    assert.equal(observabilite.includes(interdit), false,
      `l’observabilité HA ne doit pas porter « ${interdit} »`);
  }
  const echec = journal.find((e) => e.event === 'provider_ha_failure');
  assert.deepEqual(Object.keys(echec).sort(),
    ['attempt_index', 'event', 'failure_class', 'provider', 'role'], 'aucun champ ajouté');
  const epuise = journal.find((e) => e.event === 'provider_ha_exhausted');
  assert.deepEqual(epuise.attempts, [{ provider: 'groq', failure_class: 'request_rejected' }]);
});

test('T-F502-08 : fast_unavailable porte enfin le motif, sans changer la réponse HTTP', async () => {
  const ORIGINE = 'https://atelier.example';
  const journal = [];
  const erreur = Object.assign(
    new ProviderChainError('fast_interaction', [{ provider: 'groq', failure_class: FAILURE_CLASSES.REQUEST_REJECTED }]),
    { provider_errors: [{ provider: 'groq', failure_class: FAILURE_CLASSES.REQUEST_REJECTED,
        upstream_status: 400, provider_error_code: 'json_validate_failed', provider_error_type: null,
        provider_error_param: null, provider_error_message: 'Failed to generate JSON.' }] }
  );
  const reponse = await handleFastInteractionRequest(
    new Request(`https://w.dev${FAST_INTERACTION_PATHNAME}`, {
      method: 'POST', headers: { Origin: ORIGINE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ turn_id: 1, original_request: 'Une demande.', clarification_history: [],
        current_answer: null, canonical_version: 0, material_present: false })
    }),
    { ALLOWED_ORIGINS: ORIGINE },
    { log: (e) => journal.push(e), executeFast: async () => { throw erreur; } }
  );
  /* LA RÉPONSE AU NAVIGATEUR EST INCHANGÉE : même statut, même code. */
  assert.equal(reponse.status, 502);
  assert.equal((await reponse.json()).error, 'fast_interaction_failure');

  const synthese = journal.find((e) => e.event === 'fast_unavailable');
  assert.equal(synthese.provider_attempts, 1, 'le compte historique est conservé');
  assert.equal(synthese.attempts.length, 1);
  assert.equal(synthese.attempts[0].failure_class, 'request_rejected');
  assert.equal(synthese.attempts[0].upstream_status, 400);
  assert.equal(synthese.attempts[0].provider_error_code, 'json_validate_failed',
    'la cause est enfin lisible dans la synthèse');
  assert.equal(synthese.consequence, 'LE CLIENT ESCALADE VERS LE PLAN PROFOND', 'l’escalade est inchangée');
  /* Et sans motif attaché, la synthèse reste utilisable : rien n'est fabriqué. */
  const j2 = [];
  await handleFastInteractionRequest(
    new Request(`https://w.dev${FAST_INTERACTION_PATHNAME}`, {
      method: 'POST', headers: { Origin: ORIGINE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ turn_id: 1, original_request: 'x', clarification_history: [],
        current_answer: null, canonical_version: 0, material_present: false })
    }), { ALLOWED_ORIGINS: ORIGINE },
    { log: (e) => j2.push(e), executeFast: async () => { throw new Error('panne nue'); } });
  const s2 = j2.find((e) => e.event === 'fast_unavailable');
  assert.deepEqual(s2.attempts, [], 'aucune tentative connue : liste vide, pas d’invention');
});

test('T-F502-09 : un succès 200 ne produit aucun motif, et rien n’a changé', async () => {
  const { erreur, journal } = await appelGroq(200, {
    choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  });
  assert.equal(erreur, null, 'un 200 n’échoue pas');
  assert.equal(journal.some((x) => x && x.event === 'groq_api_error'), false, 'aucun relevé d’erreur');
});

/* ==========================================================================
 * LES POLITIQUES, INTACTES
 * ======================================================================= */

test('T-F502-10 : classification, reprise, bascule et ordre sont inchangés', () => {
  assert.equal(classifyProviderHttpStatus(400), FAILURE_CLASSES.REQUEST_REJECTED);
  assert.equal(classifyProviderHttpStatus(422), FAILURE_CLASSES.REQUEST_REJECTED);
  assert.equal(classifyProviderHttpStatus(401), FAILURE_CLASSES.CONFIG_UNAVAILABLE);
  assert.equal(classifyProviderHttpStatus(500), FAILURE_CLASSES.TECHNICAL_FAILOVER);
  assert.equal(isFailoverEligible(FAILURE_CLASSES.REQUEST_REJECTED), true,
    'request_rejected reste éligible au basculement');
  assert.equal(COMMON_CAUSE_REJECTION_THRESHOLD, 2, 'le seuil de cause commune est inchangé');
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq'], 'l’ordre du plan rapide est inchangé');
  assert.deepEqual([...FAILOVER_ELIGIBLE_CLASSES], [
    FAILURE_CLASSES.TECHNICAL_RETRYABLE, FAILURE_CLASSES.TECHNICAL_FAILOVER,
    FAILURE_CLASSES.CONFIG_UNAVAILABLE, FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID,
    FAILURE_CLASSES.REQUEST_REJECTED
  ]);
});

test('T-F502-11 : aucune branche ne lit les champs ajoutés', () => {
  /* L'INTERDIT CENTRAL DU LOT. Ces champs servent à observer, jamais à décider. On le vérifie sur
     les octets : le seul test de `provider_error` est celui de sa PRÉSENCE, pour le copier. */
  const boucle = ha.slice(ha.indexOf('const attempts = [];'), ha.indexOf('// Inatteignable'));
  /* L'OBSERVABILITÉ HA EST INCHANGÉE : ses deux relevés portent exactement ce qu'ils portaient. */
  assert.match(boucle, /log\(\{ event: "provider_ha_failure", role, provider: name, attempt_index: index, failure_class \}\);/);
  assert.match(boucle, /log\(\{ event: "provider_ha_exhausted", role, provider_order: order, attempts \}\);/);
  assert.match(boucle, /attempts\.push\(\{ provider: name, failure_class \}\);/);
  /* Le comptage de cause commune et l'éligibilité lisent `failure_class`, et lui seul. */
  assert.match(boucle, /attempts\.filter\(\(attempt\) => attempt\.failure_class === FAILURE_CLASSES\.REQUEST_REJECTED\)\.length/);
  assert.match(boucle, /if \(!isFailoverEligible\(failure_class\)\)/);
  /* Le seul test de présence sert à RECUEILLIR, jamais à décider : il ne gouverne aucune suite. */
  assert.match(boucle, /providerErrors\.push\(/);
  assert.equal(/if \([^)]*provider_errors[^)]*\)\s*\{[\s\S]{0,80}(throw|return|continue|break)/.test(boucle), false,
    'aucune branche de contrôle conditionnée par le motif');
  /* Et ce module ne lit toujours JAMAIS le message d’une erreur — sa propriété de construction.
     Ancré sur le CODE : le fichier ÉNONCE cette propriété en commentaire, et une vérification qui
     scanne le fichier entier s’accuse elle-même. */
  /* Un lecteur CORRECT : les spans /* … *\/ sont retirés en entier, et les // jusqu'en fin de
     ligne. Un filtre par préfixe laissait passer les lignes de continuation — et ce fichier ÉNONCE
     en commentaire la propriété qu'on vérifie, si bien que la garde s'accusait elle-même. */
  const codeSeul = ha.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert.equal(/error\?\.message|error\.message/.test(codeSeul), false,
    'provider-ha ne lit pas les messages d’erreur');

  /* Côté endpoint, le code HTTP et l'escalade ne dépendent pas du motif. */
  assert.match(endpoint, /return jsonResponse\(\{ error: "fast_interaction_failure", message: "L'interaction rapide n'a pas pu être produite\." \}, 502, cors\);/);
  assert.equal(/if \([^)]*provider_error/.test(endpoint), false, 'aucune décision sur le motif');
});

test('T-F502-12 : aucun contenu utilisateur ne peut entrer dans le motif', () => {
  /* `describeProviderError` ne lit QUE le corps d'erreur du fournisseur : ni la demande, ni le
     prompt, ni le corps de la requête ne lui sont même passés. La signature le garantit. */
  const source = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
  const corps = source.slice(source.indexOf('export function describeProviderError'),
    source.indexOf('export function describeFailedGeneration'));
  for (const interdit of ['systemPrompt', 'userMessage', 'requestInit', 'original_request', 'snapshot', 'env']) {
    assert.equal(corps.includes(interdit), false, `« ${interdit} » n’est pas accessible ici`);
  }
  /* Et le motif construit depuis un corps hostile ne porte que les six champs prévus. */
  const motif = describeProviderError('groq', 400, {
    code: 'c', message: 'm', type: 't', param: 'p',
    prompt: 'DEMANDE_DE_LA_PERSONNE', failed_generation: 'SORTIE_DU_MODELE', extra: 'X'
  });
  assert.deepEqual(Object.keys(motif).sort(), ['provider', 'provider_error_code',
    'provider_error_message', 'provider_error_param', 'provider_error_type', 'upstream_status']);
  const serialise = JSON.stringify(motif);
  for (const fuite of ['DEMANDE_DE_LA_PERSONNE', 'SORTIE_DU_MODELE', 'X']) {
    assert.equal(serialise.includes(fuite), false, `« ${fuite} » ne doit pas fuir`);
  }
});
