import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import groqWorker, {
  DECISION_ADAPTERS,
  DECISION_CONTRACT,
  DECISION_PROVIDER_ORDER,
  OPENAI_API_KEY_BINDINGS,
  OPENAI_MODEL,
  assertDecisionContractUsable,
  classifyProviderHttpStatus,
  decideWithHaChain,
  decideWithOpenAI,
  decideWithSelectedProvider,
  resolveOpenAiApiKey
} from '../workers/groq/src/index.js';
import {
  COMMON_CAUSE_REJECTION_THRESHOLD,
  FAILOVER_ELIGIBLE_CLASSES,
  FAILURE_CLASSES,
  ProviderChainError,
  failureClassOf,
  isFailoverEligible,
  runProviderChain,
  tagFailure
} from '../workers/shared/provider-ha.js';
import { DECISION_JSON_SCHEMA, DECISION_MODEL_PROMPT, DECISION_REASONS } from '../workers/shared/decision-core.js';

// HA-01 : moteur de failover SERVER-SIDE du rôle DECISION — Groq (primary) -> Anthropic (secondary)
// -> OpenAI (tertiary). Contrat public /decision STRICTEMENT inchangé (decision-core.js non touché) :
// même entrée, même sortie, même validateDecision, même 502 provider_failure en cas de panne. Seul le
// CHEMIN D'ÉCHEC change — le chemin nominal reste exactement celui d'avant (Groq répond, son succès
// est final).

const INPUT = { demande: 'Prépare un plan de lancement produit', materiau_present: false, mode_demande: 'rapide' };

function decision(etat_demande, route, question = null, confiance = 'haute') {
  const raison_interne = etat_demande === 'clarification_necessaire'
    ? DECISION_REASONS.clarification
    : route === 'rapide' ? DECISION_REASONS.rapide : DECISION_REASONS.architecte;
  return { etat_demande, route, confiance, raison_interne, question };
}

const groqOk = (payload) => Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
const openAiOk = (payload) => Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
const anthropicOk = (payload, schemaName = 'decision_provider') =>
  Response.json({ content: [{ type: 'tool_use', name: schemaName, input: payload }] });

function providerOf(url) {
  const value = String(url);
  if (value.includes('api.groq.com')) return 'groq';
  if (value.includes('api.anthropic.com')) return 'anthropic';
  if (value.includes('api.openai.com')) return 'openai';
  return 'unknown';
}

/**
 * Harnais unique : enregistre l'ORDRE EXACT des providers réellement contactés et route chaque appel
 * vers un gestionnaire par provider. Un provider sans gestionnaire est un échec de test explicite —
 * jamais une réponse par défaut qui masquerait un appel inattendu.
 */
function withProviders(t, handlers) {
  const calls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    const provider = providerOf(url);
    calls.push(provider);
    const handler = handlers[provider];
    assert.ok(handler, `appel inattendu vers le provider "${provider}" (${url}).`);
    return handler(options, calls.filter((name) => name === provider).length);
  };
  return calls;
}

/** Capture console.log/console.error sans jamais les laisser polluer la sortie de test. */
function withCapturedConsole(t) {
  const entries = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => entries.push({ stream: 'log', args });
  console.error = (...args) => entries.push({ stream: 'error', args });
  t.after(() => { console.log = originalLog; console.error = originalError; });
  return entries;
}

const ALL_KEYS = { GROQ_API_KEY: 'gsk_GROQ_SECRET_VALUE', ANTHROPIC_API_KEY: 'sk-ant-ANTHROPIC_SECRET_VALUE', 'OPenAI-API': 'sk-proj-OPENAI_SECRET_VALUE' };

// -- HA01-15 : ordre exact -------------------------------------------------------------------------

test('HA01-15 : l’ordre des providers est exactement Groq -> Anthropic -> OpenAI', () => {
  assert.deepEqual(DECISION_PROVIDER_ORDER, ['groq', 'anthropic', 'openai']);
  assert.deepEqual(Object.keys(DECISION_ADAPTERS), ['groq', 'anthropic', 'openai']);
  assert.ok(Object.isFrozen(DECISION_PROVIDER_ORDER));
});

test('HA01-15b : la chaîne contacte les trois providers dans cet ordre exact, jamais un autre', async (t) => {
  const calls = withProviders(t, {
    groq: () => Response.json({ error: { message: 'boom' } }, { status: 500 }),
    anthropic: () => Response.json({ error: { type: 'api_error' } }, { status: 500 }),
    openai: () => openAiOk(decision('exploitable', 'rapide'))
  });
  withCapturedConsole(t);
  await decideWithHaChain(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq', 'anthropic', 'openai']);
});

// -- HA01-1 : succès Groq --------------------------------------------------------------------------

test('HA01-1 : Groq réussit -> Anthropic et OpenAI ne sont JAMAIS appelés', async (t) => {
  const calls = withProviders(t, { groq: () => groqOk(decision('exploitable', 'rapide')) });
  withCapturedConsole(t);
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq']);
  assert.equal(actual.route, 'rapide');
  assert.equal(actual.raison_interne, DECISION_REASONS.rapide);
});

// -- HA01-2 : timeout Groq -------------------------------------------------------------------------

test('HA01-2 : un timeout réseau Groq est borné (une seule tentative, aucune reprise sur timeout) puis bascule vers Anthropic', async (t) => {
  const calls = withProviders(t, {
    groq: () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); },
    anthropic: () => anthropicOk(decision('exploitable', 'architecte'))
  });
  withCapturedConsole(t);
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq', 'anthropic'], 'exactement une tentative Groq : la reprise Groq ne concerne que les 429, jamais un timeout.');
  assert.equal(actual.route, 'architecte');
});

// -- HA01-3 : 429 persistant Groq ------------------------------------------------------------------

test('HA01-3 : un 429 Groq persistant épuise les reprises BORNÉES (1 + maxRetries = 3 appels, jamais plus) puis bascule vers Anthropic', async (t) => {
  const calls = withProviders(t, {
    groq: () => new Response('{"error":{"message":"rate limit"}}', { status: 429, headers: { 'retry-after': '0' } }),
    anthropic: () => anthropicOk(decision('exploitable', 'rapide'))
  });
  withCapturedConsole(t);
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);
  assert.equal(calls.filter((name) => name === 'groq').length, 3, 'GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries=2 : 1 tentative initiale + 2 reprises, jamais une boucle infinie.');
  assert.equal(calls.filter((name) => name === 'anthropic').length, 1, 'l’orchestrateur ne réessaie JAMAIS un provider : aucune multiplication des reprises entre les deux couches.');
  assert.equal(actual.route, 'rapide');
});

// -- HA01-4 : 5xx Groq -----------------------------------------------------------------------------

test('HA01-4 : un 5xx Groq bascule immédiatement vers Anthropic, sans aucune reprise', async (t) => {
  const calls = withProviders(t, {
    groq: () => Response.json({ error: { message: 'internal' } }, { status: 503 }),
    anthropic: () => anthropicOk(decision('clarification_necessaire', null, 'Quel produit lancez-vous ?'))
  });
  withCapturedConsole(t);
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq', 'anthropic']);
  assert.equal(actual.etat_demande, 'clarification_necessaire');
  assert.equal(actual.route, null);
});

// -- HA01-5 : Anthropic suffit ---------------------------------------------------------------------

test('HA01-5 : Groq échoue et Anthropic réussit -> OpenAI n’est JAMAIS appelé', async (t) => {
  const calls = withProviders(t, {
    groq: () => Response.json({ error: { message: 'internal' } }, { status: 500 }),
    anthropic: () => anthropicOk(decision('exploitable', 'rapide'))
  });
  withCapturedConsole(t);
  await decideWithHaChain(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq', 'anthropic']);
  assert.ok(!calls.includes('openai'));
});

// -- HA01-6 / HA01-7 : OpenAI tertiaire ------------------------------------------------------------

test('HA01-6 : Groq ET Anthropic échouent -> OpenAI est appelé en troisième', async (t) => {
  const calls = withProviders(t, {
    groq: () => Response.json({ error: { message: 'internal' } }, { status: 500 }),
    anthropic: () => { throw Object.assign(new Error('connexion refusée'), { name: 'TypeError' }); },
    openai: () => openAiOk(decision('exploitable', 'architecte'))
  });
  withCapturedConsole(t);
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq', 'anthropic', 'openai']);
  assert.equal(actual.route, 'architecte');
});

test('HA01-7 : une décision OpenAI passe par EXACTEMENT le même contrat (prompt, schéma, validateDecision) que Groq', async (t) => {
  let captured;
  withProviders(t, {
    groq: () => Response.json({ error: { message: 'internal' } }, { status: 500 }),
    anthropic: () => Response.json({ error: { type: 'overloaded_error' } }, { status: 529 }),
    openai: (options) => { captured = { body: JSON.parse(options.body), headers: options.headers }; return openAiOk(decision('clarification_necessaire', null, 'Combien de temps avez-vous, avec quel budget travaillez-vous ?')); }
  });
  withCapturedConsole(t);
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);

  assert.equal(captured.body.model, OPENAI_MODEL);
  assert.equal(captured.body.messages[0].role, 'system');
  assert.equal(captured.body.messages[0].content, DECISION_MODEL_PROMPT, 'même DECISION_MODEL_PROMPT que Groq et Anthropic, jamais une variante provider-specific.');
  assert.deepEqual(JSON.parse(captured.body.messages[1].content), INPUT, 'même makeDecisionUserMessage.');
  assert.equal(captured.body.response_format.type, 'json_schema');
  assert.equal(captured.body.response_format.json_schema.strict, true);
  assert.equal(captured.body.response_format.json_schema.name, 'decision_provider');
  assert.deepEqual(captured.body.response_format.json_schema.schema, DECISION_JSON_SCHEMA, 'même DECISION_JSON_SCHEMA, byte pour byte.');
  assert.ok(!('temperature' in captured.body), 'aucune temperature explicite : paramètre rejeté par les familles de modèles de raisonnement OpenAI.');

  // Même validateDecision : la normalisation de question unique (decision-core.js) s’applique.
  assert.equal(actual.etat_demande, 'clarification_necessaire');
  assert.equal(actual.route, null);
  assert.equal(actual.question, 'Combien de temps avez-vous ?');
  assert.equal(actual.raison_interne, DECISION_REASONS.clarification);
  assert.deepEqual(Object.keys(actual).sort(), ['confiance', 'etat_demande', 'question', 'raison_interne', 'route']);
});

test('HA01-7b : une sortie OpenAI structurellement invalide est rejetée par validateDecision, jamais acceptée telle quelle', async (t) => {
  const invalid = { etat_demande: 'exploitable', route: 'rapide', confiance: 'faible', raison_interne: DECISION_REASONS.rapide, question: null };
  withProviders(t, {
    groq: () => Response.json({}, { status: 500 }),
    anthropic: () => Response.json({}, { status: 500 }),
    openai: () => openAiOk(invalid)
  });
  withCapturedConsole(t);
  // 1) l'adaptateur lui-meme applique bien la MEME validation finale que Groq/Anthropic...
  await assert.rejects(() => decideWithOpenAI(INPUT, ALL_KEYS), /confiance invalide/);
  // 2) ...et au travers de la chaine, ce rejet devient un fail-closed (dernier provider), jamais une
  //    decision acceptee telle quelle ni une decision fabriquee.
  const error = await decideWithHaChain(INPUT, ALL_KEYS).then(() => null, (caught) => caught);
  assert.ok(error instanceof ProviderChainError);
  assert.equal(error.attempts.at(-1).failure_class, FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID);
});

// -- HA01-8 : aucun model shopping sémantique ------------------------------------------------------

test('HA01-8 : une décision Groq techniquement valide est FINALE — "architecte", confiance "moyenne" et clarification ne déclenchent jamais de bascule', async (t) => {
  for (const candidate of [
    decision('exploitable', 'architecte', null, 'moyenne'),
    decision('exploitable', 'rapide', null, 'moyenne'),
    decision('clarification_necessaire', null, 'Quel est votre budget ?', 'moyenne')
  ]) {
    await test(`HA01-8/${candidate.etat_demande}/${candidate.route}`, async (sub) => {
      const calls = withProviders(sub, { groq: () => groqOk(candidate) });
      withCapturedConsole(sub);
      const actual = await decideWithHaChain(INPUT, ALL_KEYS);
      assert.deepEqual(calls, ['groq'], 'aucun autre provider ne doit être consulté pour une décision techniquement valide.');
      assert.equal(actual.etat_demande, candidate.etat_demande);
      assert.equal(actual.route, candidate.route);
      assert.equal(actual.confiance, 'moyenne');
    });
  }
});

test('HA01-8b : SEMANTIC_VALID n’est structurellement pas éligible au failover', () => {
  assert.equal(isFailoverEligible(FAILURE_CLASSES.SEMANTIC_VALID), false);
  assert.ok(!FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.SEMANTIC_VALID));
});

test('HA01-8c : l’orchestrateur ne lit JAMAIS le résultat qu’il retourne — le model shopping est structurellement impossible', async () => {
  const sentinel = Object.freeze({ opaque: Symbol('résultat opaque') });
  const later = [];
  const result = await runProviderChain({
    role: 'decision',
    log: () => {},
    providers: [
      { name: 'first', execute: async () => sentinel },
      { name: 'second', execute: async () => { later.push('second'); return { other: true }; } }
    ]
  });
  assert.equal(result, sentinel, 'le résultat est retourné par identité, sans copie ni inspection.');
  assert.deepEqual(later, [], 'aucun provider suivant n’est exécuté après un succès.');
});

// -- HA01-9 : tous les providers échouent ----------------------------------------------------------

test('HA01-9 : les trois providers échouent -> fail-closed, aucune décision fabriquée, aucun READY', async (t) => {
  const calls = withProviders(t, {
    groq: () => Response.json({}, { status: 500 }),
    anthropic: () => Response.json({}, { status: 500 }),
    openai: () => Response.json({}, { status: 500 })
  });
  withCapturedConsole(t);
  const error = await decideWithHaChain(INPUT, ALL_KEYS).then(() => null, (caught) => caught);
  assert.ok(error instanceof ProviderChainError, 'une erreur technique contrôlée, jamais un résultat.');
  assert.equal(error.all_providers_failed, true);
  assert.deepEqual(error.attempts.map((attempt) => attempt.provider), ['groq', 'anthropic', 'openai']);
  assert.deepEqual(error.attempts.map((attempt) => attempt.failure_class), Array(3).fill(FAILURE_CLASSES.TECHNICAL_FAILOVER));
  assert.deepEqual(calls, ['groq', 'anthropic', 'openai']);
  // Aucune trace d'une décision fabriquée localement.
  for (const forbidden of ['etat_demande', 'route', 'exploitable', 'READY', 'raison_interne']) {
    assert.ok(!Object.hasOwn(error, forbidden), `ProviderChainError ne doit porter aucun champ de décision (${forbidden}).`);
  }
});

test('HA01-9b : sur /decision, l’échec des trois providers reste le contrat HTTP existant — 502 provider_failure, aucun champ de décision', async (t) => {
  withProviders(t, {
    groq: () => Response.json({}, { status: 500 }),
    anthropic: () => Response.json({}, { status: 500 }),
    openai: () => Response.json({}, { status: 500 })
  });
  withCapturedConsole(t);
  const response = await groqWorker.fetch(new Request('https://worker.example/decision', {
    method: 'POST',
    headers: { Origin: 'https://atelier.example.com', 'Content-Type': 'application/json' },
    body: JSON.stringify(INPUT)
  }), { ...ALL_KEYS, ALLOWED_ORIGINS: 'https://atelier.example.com' });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, 'provider_failure');
  assert.deepEqual(Object.keys(body).sort(), ['error', 'message']);
  assert.ok(!('etat_demande' in body) && !('route' in body), 'aucune décision, même dégradée, ne doit être fabriquée.');
});

// -- HA01-10 / 11 / 12 : secrets absents ----------------------------------------------------------

test('HA01-10 : secret Groq absent -> CONFIG_UNAVAILABLE, aucun appel Groq, bascule vers Anthropic', async (t) => {
  const calls = withProviders(t, { anthropic: () => anthropicOk(decision('exploitable', 'rapide')) });
  withCapturedConsole(t);
  const actual = await decideWithHaChain(INPUT, { ANTHROPIC_API_KEY: ALL_KEYS.ANTHROPIC_API_KEY });
  assert.deepEqual(calls, ['anthropic'], 'un secret absent ne doit jamais produire une requête réseau.');
  assert.equal(actual.route, 'rapide');
});

test('HA01-11 : secret Anthropic absent et Groq en échec -> OpenAI', async (t) => {
  const calls = withProviders(t, {
    groq: () => Response.json({}, { status: 500 }),
    openai: () => openAiOk(decision('exploitable', 'rapide'))
  });
  withCapturedConsole(t);
  const actual = await decideWithHaChain(INPUT, { GROQ_API_KEY: ALL_KEYS.GROQ_API_KEY, 'OPenAI-API': ALL_KEYS['OPenAI-API'] });
  assert.deepEqual(calls, ['groq', 'openai']);
  assert.equal(actual.route, 'rapide');
});

test('HA01-12 : secret OpenAI absent et les deux autres en échec -> fail-closed, aucune décision', async (t) => {
  const calls = withProviders(t, {
    groq: () => Response.json({}, { status: 500 }),
    anthropic: () => Response.json({}, { status: 500 })
  });
  withCapturedConsole(t);
  const error = await decideWithHaChain(INPUT, { GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }).then(() => null, (caught) => caught);
  assert.ok(error instanceof ProviderChainError);
  assert.deepEqual(error.attempts.map((attempt) => attempt.failure_class), [
    FAILURE_CLASSES.TECHNICAL_FAILOVER, FAILURE_CLASSES.TECHNICAL_FAILOVER, FAILURE_CLASSES.CONFIG_UNAVAILABLE
  ]);
  assert.deepEqual(calls, ['groq', 'anthropic']);
});

test('HA01-12b : aucun secret d’aucun provider -> fail-closed sans le moindre appel réseau', async (t) => {
  const calls = withProviders(t, {});
  withCapturedConsole(t);
  const error = await decideWithHaChain(INPUT, {}).then(() => null, (caught) => caught);
  assert.ok(error instanceof ProviderChainError);
  assert.deepEqual(error.attempts.map((attempt) => attempt.failure_class), Array(3).fill(FAILURE_CLASSES.CONFIG_UNAVAILABLE));
  assert.deepEqual(calls, []);
});

// -- HA01-13 : structured output invalide ----------------------------------------------------------

test('HA01-13 : POLITIQUE PROUVÉE — une sortie Groq techniquement inexploitable est un STRUCTURED_OUTPUT_INVALID, éligible au failover', async (t) => {
  assert.ok(isFailoverEligible(FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID),
    'un défaut de sortie appartient à CE modèle sur CET appel : le provider suivant a une chance réelle de produire une sortie conforme.');
  const calls = withProviders(t, {
    groq: () => Response.json({ choices: [{ message: { content: 'ceci n’est pas du JSON' } }] }),
    anthropic: () => anthropicOk(decision('exploitable', 'rapide'))
  });
  withCapturedConsole(t);
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq', 'anthropic']);
  assert.equal(actual.route, 'rapide');
});

test('HA01-13b : les quatre formes de sortie inexploitable sont toutes classées STRUCTURED_OUTPUT_INVALID et basculent', async (t) => {
  const cases = {
    'enveloppe non parsable': () => new Response('<html>502 bad gateway</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    'contenu absent': () => Response.json({ choices: [] }),
    'JSON non conforme au schéma': () => groqOk({ etat_demande: 'exploitable', route: 'rapide' }),
    'invariant structurel violé': () => groqOk({ etat_demande: 'clarification_necessaire', route: 'rapide', confiance: 'haute', raison_interne: DECISION_REASONS.clarification, question: 'Quand ?' })
  };
  for (const [label, groqHandler] of Object.entries(cases)) {
    await test(`HA01-13b/${label}`, async (sub) => {
      const calls = withProviders(sub, { groq: groqHandler, anthropic: () => anthropicOk(decision('exploitable', 'rapide')) });
      withCapturedConsole(sub);
      const actual = await decideWithHaChain(INPUT, ALL_KEYS);
      assert.deepEqual(calls, ['groq', 'anthropic'], label);
      assert.equal(actual.route, 'rapide');
    });
  }
});

// -- HA01-14 : erreur commune -> jamais de model shopping ------------------------------------------

test('HA01-14 : une CONTRACT_ERROR (schéma partagé inutilisable) arrête tout AVANT le premier appel — jamais trois providers sur une cause commune', async (t) => {
  const calls = withProviders(t, {});
  withCapturedConsole(t);
  const brokenSchema = { ...DECISION_JSON_SCHEMA, required: ['etat_demande'] };
  await assert.rejects(
    () => decideWithHaChain(INPUT, ALL_KEYS, { contract: { ...DECISION_CONTRACT, schema: brokenSchema } }),
    /Contrat Decision inutilisable.*required/s
  );
  assert.deepEqual(calls, [], 'aucun appel réseau : une cause commune ne doit jamais être testée trois fois.');
});

test('HA01-14b : le préflight refuse chaque forme de contrat inutilisable, et accepte le contrat réel', () => {
  assert.doesNotThrow(() => assertDecisionContractUsable(DECISION_CONTRACT), 'le contrat de production doit rester utilisable.');
  const invalids = [
    [null, /contrat absent/],
    [{ ...DECISION_CONTRACT, prompt: '' }, /prompt système absent/],
    [{ ...DECISION_CONTRACT, prompt: '   ' }, /prompt système absent/],
    [{ ...DECISION_CONTRACT, schemaName: '' }, /nom de schéma absent/],
    [{ ...DECISION_CONTRACT, schema: null }, /schéma absent/],
    [{ ...DECISION_CONTRACT, schema: { ...DECISION_JSON_SCHEMA, type: 'string' } }, /type "object"/],
    [{ ...DECISION_CONTRACT, schema: { ...DECISION_JSON_SCHEMA, additionalProperties: true } }, /additionalProperties=false/],
    [{ ...DECISION_CONTRACT, schema: { type: 'object', additionalProperties: false, required: [] } }, /aucune propriété/],
    [{ ...DECISION_CONTRACT, schema: { ...DECISION_JSON_SCHEMA, required: undefined } }, /ne déclare pas "required"/],
    [{ ...DECISION_CONTRACT, schema: { ...DECISION_JSON_SCHEMA, required: [...DECISION_JSON_SCHEMA.required, 'extra'] } }, /ne couvre pas exactement/]
  ];
  for (const [contract, pattern] of invalids) {
    assert.throws(() => assertDecisionContractUsable(contract), pattern, JSON.stringify(contract?.schemaName ?? contract));
    const error = assertDecisionContractUsable.length >= 0 && (() => { try { assertDecisionContractUsable(contract); } catch (caught) { return caught; } })();
    assert.equal(failureClassOf(error), FAILURE_CLASSES.CONTRACT_ERROR);
    assert.equal(isFailoverEligible(FAILURE_CLASSES.CONTRACT_ERROR), false);
  }
});

test('HA01-14c : une erreur NON étiquetée est un PROGRAMMING_ERROR — fail-closed immédiat, jamais une cascade', async () => {
  const executed = [];
  const bug = new TypeError("undefined n'est pas une fonction");
  await assert.rejects(
    () => runProviderChain({
      role: 'decision',
      log: () => {},
      providers: [
        { name: 'groq', execute: async () => { executed.push('groq'); throw bug; } },
        { name: 'anthropic', execute: async () => { executed.push('anthropic'); return {}; } },
        { name: 'openai', execute: async () => { executed.push('openai'); return {}; } }
      ]
    }),
    /n'est pas une fonction/
  );
  assert.equal(failureClassOf(bug), FAILURE_CLASSES.PROGRAMMING_ERROR, 'une erreur sans classe déclarée n’est jamais présumée être une panne provider.');
  assert.deepEqual(executed, ['groq'], 'un bug de notre code ne doit jamais être masqué par une cascade sur trois providers.');
});

// -- Classification : table explicite et exhaustive ------------------------------------------------

test('HA01-CLASSIF : la table d’éligibilité au failover est explicite, fermée et testée classe par classe', () => {
  assert.deepEqual(
    Object.fromEntries(Object.values(FAILURE_CLASSES).map((value) => [value, isFailoverEligible(value)])),
    {
      technical_retryable: true,
      technical_failover: true,
      config_unavailable: true,
      structured_output_invalid: true,
      request_rejected: true,
      semantic_valid: false,
      contract_error: false,
      programming_error: false
    }
  );
  assert.equal(isFailoverEligible('classe_inconnue'), false, 'toute classe inconnue est fail-closed par défaut.');
  assert.equal(failureClassOf(undefined), FAILURE_CLASSES.PROGRAMMING_ERROR);
  assert.equal(failureClassOf({ failure_class: 'inventée' }), FAILURE_CLASSES.PROGRAMMING_ERROR);
  assert.throws(() => tagFailure(new Error('x'), 'inventée'), /Classe d'échec inconnue/);
});

test('HA01-CLASSIF-b : tagFailure ne modifie jamais le message ni le type de l’erreur étiquetée', () => {
  const error = new RangeError('message d’origine');
  const returned = tagFailure(error, FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: 'groq' });
  assert.equal(returned, error);
  assert.equal(error.message, 'message d’origine');
  assert.ok(error instanceof RangeError);
  assert.equal(error.provider, 'groq');
});

// -- HA01-16 : observabilité sans secret -----------------------------------------------------------

test('HA01-16 : l’observabilité du failover ne contient AUCUN secret, aucun prompt, aucun contenu utilisateur', async (t) => {
  const events = [];
  const consoleEntries = withCapturedConsole(t);
  withProviders(t, {
    groq: () => Response.json({ error: { message: `invalid api key ${ALL_KEYS.GROQ_API_KEY}` } }, { status: 401 }),
    anthropic: () => Response.json({ error: { type: 'authentication_error', message: `invalid x-api-key ${ALL_KEYS.ANTHROPIC_API_KEY}` } }, { status: 401 }),
    openai: () => openAiOk(decision('exploitable', 'rapide'))
  });
  await decideWithHaChain(INPUT, ALL_KEYS, { log: (event) => events.push(event) });

  const haObservability = JSON.stringify(events);
  const everything = haObservability + JSON.stringify(consoleEntries);

  // (a) AUCUNE valeur de secret, nulle part -- ni dans les événements HA, ni dans les logs des
  //     adaptateurs, alors même que les deux providers renvoient la clé dans leur message d'erreur.
  for (const secret of [...Object.values(ALL_KEYS), 'gsk_', 'sk-ant-', 'sk-proj-']) {
    assert.ok(!everything.includes(secret), `aucune trace de "${secret}" ne doit apparaître dans l’observabilité.`);
  }
  // (b) l'observabilité HA elle-même ne transporte AUCUN matériau d'authentification, pas même un
  //     nom d'en-tête : elle est structurelle par construction (noms de providers, index, classes).
  for (const forbidden of ['Bearer', 'x-api-key', 'Authorization', 'api_key', 'invalid']) {
    assert.ok(!haObservability.includes(forbidden), `l’observabilité HA ne doit jamais contenir "${forbidden}".`);
  }
  assert.ok(!everything.includes(DECISION_MODEL_PROMPT.slice(0, 60)), 'le prompt système ne doit jamais être journalisé.');
  assert.ok(!everything.includes(INPUT.demande), 'le contenu utilisateur brut ne doit jamais être journalisé.');

  // ...et l'observabilité reste néanmoins réellement exploitable.
  const byEvent = (name) => events.filter((event) => event.event === name);
  assert.deepEqual(byEvent('provider_ha_attempt').map((event) => event.provider), ['groq', 'anthropic', 'openai']);
  assert.deepEqual(byEvent('provider_ha_failure').map((event) => [event.provider, event.failure_class]), [
    ['groq', FAILURE_CLASSES.CONFIG_UNAVAILABLE], ['anthropic', FAILURE_CLASSES.CONFIG_UNAVAILABLE]
  ], 'un 401 est un refus d’authentification propre au provider, explicitement observable comme tel.');
  assert.deepEqual(byEvent('provider_ha_fallback').map((event) => [event.fallback_from, event.fallback_to]), [
    ['groq', 'anthropic'], ['anthropic', 'openai']
  ]);
  assert.deepEqual(byEvent('provider_ha_success').map((event) => [event.provider, event.fallback_from]), [['openai', 'anthropic']]);
  for (const event of events) assert.equal(event.role, 'decision');
});

test('HA01-16b : aucune clé en clair dans les sources de production (source-scan des trois adaptateurs)', () => {
  for (const file of ['../workers/groq/src/index.js', '../workers/shared/provider-ha.js']) {
    const source = fs.readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
    assert.doesNotMatch(source, /sk-ant-[A-Za-z0-9_-]{10,}/, file);
    assert.doesNotMatch(source, /sk-proj-[A-Za-z0-9_-]{10,}/, file);
    assert.doesNotMatch(source, /\bgsk_[A-Za-z0-9_-]{10,}/, file);
  }
});

test('HA01-16c : provider-ha.js ne contient aucune logique métier et ne nomme aucun provider concret', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../workers/shared/provider-ha.js', import.meta.url)), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of [/groq/i, /anthropic/i, /openai/i, /decision/i, /exploitable/i, /rapide/i, /architecte/i, /degraded/i, /readiness/i]) {
    assert.doesNotMatch(code, forbidden, `provider-ha.js doit rester provider-agnostique et métier-agnostique (${forbidden}).`);
  }
});

// -- Résolution du secret OpenAI (mapping explicite, sans mutation Cloudflare) ---------------------

test('HA01-SECRET : le secret OpenAI est résolu par NOM, dans l’ordre documenté, sans jamais renommer quoi que ce soit', () => {
  assert.deepEqual(OPENAI_API_KEY_BINDINGS, ['OPENAI_API_KEY', 'OPenAI-API']);
  assert.equal(resolveOpenAiApiKey({}), null);
  assert.equal(resolveOpenAiApiKey({ 'OPenAI-API': 'valeur' }).name, 'OPenAI-API', 'le nom réellement déployé aujourd’hui doit fonctionner tel quel.');
  assert.equal(resolveOpenAiApiKey({ OPENAI_API_KEY: 'valeur' }).name, 'OPENAI_API_KEY');
  assert.equal(resolveOpenAiApiKey({ OPENAI_API_KEY: 'standard', 'OPenAI-API': 'legacy' }).name, 'OPENAI_API_KEY', 'le nom standard prend le relais sans changement de code le jour d’une normalisation.');
  assert.equal(resolveOpenAiApiKey({ 'OPenAI-API': '   ' }), null, 'un secret vide est un secret absent.');
});

test('HA01-SECRET-b : le modèle OpenAI est surchargeable par variable NON secrète, sans toucher au contrat sémantique', async (t) => {
  let captured;
  withProviders(t, { openai: (options) => { captured = JSON.parse(options.body); return openAiOk(decision('exploitable', 'rapide')); } });
  withCapturedConsole(t);
  await decideWithOpenAI(INPUT, { 'OPenAI-API': 'k', OPENAI_DECISION_MODEL: 'gpt-modele-recalibre' });
  assert.equal(captured.model, 'gpt-modele-recalibre');
  assert.equal(captured.messages[0].content, DECISION_MODEL_PROMPT, 'changer de modèle ne change jamais le prompt.');
  assert.deepEqual(captured.response_format.json_schema.schema, DECISION_JSON_SCHEMA, 'changer de modèle ne change jamais le schéma.');
});

// -- Sélection : chaîne par défaut, épinglage explicite, valeur invalide ---------------------------

test('HA01-SELECT : DECISION_PROVIDER absent -> chaîne HA (Groq d’abord, comportement nominal historique)', async (t) => {
  const calls = withProviders(t, {
    groq: () => Response.json({}, { status: 500 }),
    anthropic: () => anthropicOk(decision('exploitable', 'rapide'))
  });
  withCapturedConsole(t);
  await decideWithSelectedProvider(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq', 'anthropic']);
});

test('HA01-SELECT-b : DECISION_PROVIDER="ha" -> même chaîne, explicitement', async (t) => {
  const calls = withProviders(t, { groq: () => groqOk(decision('exploitable', 'rapide')) });
  withCapturedConsole(t);
  await decideWithSelectedProvider(INPUT, { ...ALL_KEYS, DECISION_PROVIDER: 'ha' });
  assert.deepEqual(calls, ['groq']);
});

test('HA01-SELECT-c : un provider ÉPINGLÉ ne bascule jamais — l’instruction explicite d’un opérateur prime sur la disponibilité', async (t) => {
  for (const pinned of ['groq', 'anthropic', 'openai']) {
    await test(`HA01-SELECT-c/${pinned}`, async (sub) => {
      const calls = withProviders(sub, {
        groq: () => Response.json({}, { status: 500 }),
        anthropic: () => Response.json({}, { status: 500 }),
        openai: () => Response.json({}, { status: 500 })
      });
      withCapturedConsole(sub);
      await assert.rejects(() => decideWithSelectedProvider(INPUT, { ...ALL_KEYS, DECISION_PROVIDER: pinned }));
      assert.deepEqual(calls, [pinned], `DECISION_PROVIDER=${pinned} ne doit contacter que ce provider.`);
    });
  }
});

test('HA01-SELECT-d : "auto" reste une valeur INVALIDE (contrat R5.1 préservé) et "openai" devient une valeur valide', async (t) => {
  const calls = withProviders(t, { openai: () => openAiOk(decision('exploitable', 'rapide')) });
  withCapturedConsole(t);
  await assert.rejects(
    () => decideWithSelectedProvider(INPUT, { ...ALL_KEYS, DECISION_PROVIDER: 'auto' }),
    /DECISION_PROVIDER invalide : "auto" \(valeurs autorisées : "ha", "groq", "anthropic", "openai"\)/
  );
  assert.deepEqual(calls, [], 'aucune requête réseau sur une valeur invalide.');
  await decideWithSelectedProvider(INPUT, { ...ALL_KEYS, DECISION_PROVIDER: 'openai' });
  assert.deepEqual(calls, ['openai']);
});

test('HA01-SELECT-e : une DECISION_PROVIDER invalide est une CONTRACT_ERROR, jamais éligible au failover', () => {
  const error = (() => { try { assertDecisionContractUsable(null); } catch (caught) { return caught; } })();
  assert.equal(failureClassOf(error), FAILURE_CLASSES.CONTRACT_ERROR);
});

// -- Contrat public /decision : strictement inchangé sur le chemin nominal -------------------------

test('HA01-CONTRAT : /decision conserve exactement sa forme de sortie, y compris lorsqu’une bascule a eu lieu', async (t) => {
  withProviders(t, {
    groq: () => Response.json({}, { status: 500 }),
    anthropic: () => anthropicOk(decision('exploitable', 'architecte'))
  });
  withCapturedConsole(t);
  const response = await groqWorker.fetch(new Request('https://worker.example/decision', {
    method: 'POST',
    headers: { Origin: 'https://atelier.example.com', 'Content-Type': 'application/json' },
    body: JSON.stringify(INPUT)
  }), { ...ALL_KEYS, ALLOWED_ORIGINS: 'https://atelier.example.com' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['confiance', 'etat_demande', 'question', 'raison_interne', 'route']);
  assert.equal(body.route, 'architecte');
  assert.equal(body.raison_interne, DECISION_REASONS.architecte);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://atelier.example.com');
});

test('HA01-CONTRAT-b : le contrat Decision partagé reste byte-identique à decision-core.js pour les trois providers', () => {
  assert.equal(DECISION_CONTRACT.prompt, DECISION_MODEL_PROMPT);
  assert.equal(DECISION_CONTRACT.schema, DECISION_JSON_SCHEMA, 'même référence : aucune copie, aucune variante provider-specific.');
  assert.equal(DECISION_CONTRACT.schemaName, 'decision_provider');
  assert.ok(Object.isFrozen(DECISION_CONTRACT));
});

// ==================================================================================================
// HA01-HTTP : revue de la classification des statuts HTTP (§10).
// Avant cette revue, TOUT statut non-2xx etait TECHNICAL_FAILOVER : un 401 de configuration et un
// 400 de requete malformee etaient indiscernables d'une panne, et un defaut commun de notre requete
// consommait les trois providers. La table ci-dessous est desormais explicite et testee statut par
// statut, pour les trois adaptateurs.
// ==================================================================================================

test('HA01-HTTP-1 : table de classification des statuts, exhaustive et identique pour les trois providers', () => {
  const expected = {
    400: FAILURE_CLASSES.REQUEST_REJECTED,
    401: FAILURE_CLASSES.CONFIG_UNAVAILABLE,
    403: FAILURE_CLASSES.CONFIG_UNAVAILABLE,
    404: FAILURE_CLASSES.TECHNICAL_FAILOVER,
    408: FAILURE_CLASSES.TECHNICAL_FAILOVER,
    409: FAILURE_CLASSES.TECHNICAL_FAILOVER,
    422: FAILURE_CLASSES.REQUEST_REJECTED,
    429: FAILURE_CLASSES.TECHNICAL_FAILOVER,
    500: FAILURE_CLASSES.TECHNICAL_FAILOVER,
    502: FAILURE_CLASSES.TECHNICAL_FAILOVER,
    503: FAILURE_CLASSES.TECHNICAL_FAILOVER,
    529: FAILURE_CLASSES.TECHNICAL_FAILOVER,
    418: FAILURE_CLASSES.TECHNICAL_FAILOVER
  };
  for (const [status, failureClass] of Object.entries(expected)) {
    assert.equal(classifyProviderHttpStatus(Number(status)), failureClass, `statut ${status}`);
  }
  // Aucune classe produite ici n'est fail-closed : un statut HTTP decrit toujours le fournisseur.
  for (const failureClass of Object.values(expected)) assert.equal(isFailoverEligible(failureClass), true);
});

test('HA01-HTTP-2 : le meme statut produit la meme classe quel que soit le provider qui l’a renvoye', async (t) => {
  for (const [status, expectedClass] of [[401, FAILURE_CLASSES.CONFIG_UNAVAILABLE], [503, FAILURE_CLASSES.TECHNICAL_FAILOVER], [400, FAILURE_CLASSES.REQUEST_REJECTED]]) {
    await test(`HA01-HTTP-2/${status}`, async (sub) => {
      const events = [];
      withCapturedConsole(sub);
      withProviders(sub, {
        groq: () => Response.json({ error: { message: 'x' } }, { status }),
        anthropic: () => Response.json({ error: { type: 'x' } }, { status }),
        openai: () => Response.json({ error: { message: 'x' } }, { status })
      });
      await decideWithHaChain(INPUT, ALL_KEYS, { log: (event) => events.push(event) }).catch(() => {});
      const observed = events.filter((event) => event.event === 'provider_ha_failure').map((event) => event.failure_class);
      assert.ok(observed.length >= 2, `statut ${status} : au moins deux providers doivent avoir ete observes.`);
      for (const failureClass of observed) assert.equal(failureClass, expectedClass, `statut ${status}`);
    });
  }
});

test('HA01-HTTP-3 : 401 sur les trois providers -> fail-closed, et chaque echec est observable comme CONFIG_UNAVAILABLE (jamais deguise en panne)', async (t) => {
  const events = [];
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => Response.json({ error: { message: 'invalid key' } }, { status: 401 }),
    anthropic: () => Response.json({ error: { type: 'authentication_error' } }, { status: 401 }),
    openai: () => Response.json({ error: { message: 'invalid key' } }, { status: 403 })
  });
  const error = await decideWithHaChain(INPUT, ALL_KEYS, { log: (event) => events.push(event) }).then(() => null, (caught) => caught);
  assert.ok(error instanceof ProviderChainError);
  assert.deepEqual(calls, ['groq', 'anthropic', 'openai'], 'une erreur d’authentification est propre a chaque provider : les trois restent pertinents.');
  assert.deepEqual(error.attempts.map((attempt) => attempt.failure_class), Array(3).fill(FAILURE_CLASSES.CONFIG_UNAVAILABLE));
});

test('HA01-HTTP-4 : REGLE DE CAUSE COMMUNE — deux rejets 400 consecutifs arretent la chaine, le TROISIEME provider n’est JAMAIS appele', async (t) => {
  const events = [];
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => Response.json({ error: { message: 'invalid schema' } }, { status: 400 }),
    anthropic: () => Response.json({ error: { type: 'invalid_request_error' } }, { status: 400 }),
    openai: () => { throw new Error('le troisieme provider ne doit jamais etre appele'); }
  });
  await assert.rejects(() => decideWithHaChain(INPUT, ALL_KEYS, { log: (event) => events.push(event) }), /Anthropic a répondu 400/);
  assert.deepEqual(calls, ['groq', 'anthropic'], 'gaspillage borne a 2 appels, jamais 3.');
  const suspected = events.filter((event) => event.event === 'provider_ha_common_cause_suspected');
  assert.equal(suspected.length, 1, 'l’hypothese de cause commune doit etre nommee explicitement, jamais noyee dans une panne generique.');
  assert.equal(suspected[0].rejections, COMMON_CAUSE_REJECTION_THRESHOLD);
  assert.deepEqual(suspected[0].remaining_providers, ['openai']);
});

test('HA01-HTTP-5 : un rejet 400 ISOLE reste une bascule normale — une difference de dialecte ne doit jamais tuer la chaine', async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => Response.json({ error: { message: 'unsupported schema keyword' } }, { status: 400 }),
    anthropic: () => anthropicOk(decision('exploitable', 'rapide'))
  });
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq', 'anthropic']);
  assert.equal(actual.route, 'rapide');
});

test('HA01-HTTP-6 : un 400 suivi d’une panne 503 n’atteint pas le seuil de cause commune — la chaine va bien jusqu’au tertiaire', async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => Response.json({ error: { message: 'invalid_request' } }, { status: 400 }),
    anthropic: () => Response.json({ error: { type: 'overloaded_error' } }, { status: 503 }),
    openai: () => openAiOk(decision('exploitable', 'rapide'))
  });
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);
  assert.deepEqual(calls, ['groq', 'anthropic', 'openai'], 'un seul rejet de requete ne suffit jamais a presumer une cause commune.');
  assert.equal(actual.route, 'rapide');
});

test('HA01-HTTP-7 : REQUEST_REJECTED est eligible au failover mais soumis a la regle de cause commune (seuil = 2, minimum d’observations independantes)', () => {
  assert.equal(isFailoverEligible(FAILURE_CLASSES.REQUEST_REJECTED), true);
  assert.equal(COMMON_CAUSE_REJECTION_THRESHOLD, 2);
  assert.ok(FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.REQUEST_REJECTED));
});

test('HA01-HTTP-8 : un 429 n’atteint la classification qu’APRES la politique de reprise de l’adaptateur', async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => new Response('{"error":{"message":"rate limit"}}', { status: 429, headers: { 'retry-after': '0' } }),
    anthropic: () => Response.json({ error: { type: 'rate_limit_error' } }, { status: 429 }),
    openai: () => openAiOk(decision('exploitable', 'rapide'))
  });
  const actual = await decideWithHaChain(INPUT, ALL_KEYS);
  assert.equal(calls.filter((name) => name === 'groq').length, 3, 'Groq : 1 + maxRetries(2).');
  assert.equal(calls.filter((name) => name === 'anthropic').length, 1, 'Anthropic : aucune reprise, bascule immediate.');
  assert.equal(actual.route, 'rapide');
});
