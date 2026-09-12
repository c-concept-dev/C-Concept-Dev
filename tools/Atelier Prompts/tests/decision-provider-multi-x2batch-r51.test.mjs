import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import groqWorker, { decideWithGroq, decideWithAnthropic, decideWithSelectedProvider, ANTHROPIC_MODEL } from '../workers/groq/src/index.js';
import { DECISION_JSON_SCHEMA, DECISION_REASONS, DECISION_MODEL_PROMPT } from '../workers/shared/decision-core.js';

// 3F.3.3-X2-BATCH-R5.1 : EXTENSION MULTI-PROVIDER du Worker /decision existant (atelier-decision-groq).
// Contrat public /decision STRICTEMENT inchangé (entrée, sortie, validateDecision, decision-core.js
// non touché). Seule la fonction `decide` injectée dans handleDecisionRequest change de nom
// (decideWithSelectedProvider au lieu de decideWithGroq en dur) — sa signature (input, env) et son
// contrat de sortie restent identiques. Sélection EXPLICITE via DECISION_PROVIDER (variable NON
// secrète), défaut "groq" : jamais "auto", jamais un fallback automatique Groq<->Anthropic sur
// erreur/429 (interdiction explicite du lot).

function decision(etat_demande, route, question = null, confiance = 'haute') {
  const raison_interne = etat_demande === 'clarification_necessaire'
    ? DECISION_REASONS.clarification
    : route === 'rapide' ? DECISION_REASONS.rapide : DECISION_REASONS.architecte;
  return { etat_demande, route, confiance, raison_interne, question };
}

function withFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function anthropicToolUseResponse(toolInput, { status = 200, schemaName = 'decision_provider' } = {}) {
  return Response.json({ content: [{ type: 'tool_use', name: schemaName, input: toolInput }] }, { status });
}

// --- Sélection provider (défaut / explicite / erreur config) --------------------------------------

test("R5.1-1 : défaut DECISION_PROVIDER absent -> Groq (comportement historique préservé)", async (t) => {
  let calledGroqEndpoint = false;
  withFetch(t, async (url) => { calledGroqEndpoint = String(url).includes('groq.com'); return Response.json({ choices: [{ message: { content: JSON.stringify(decision('exploitable', 'rapide', null, 'moyenne')) } }] }); });
  const actual = await decideWithSelectedProvider({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { GROQ_API_KEY: 'server-only' });
  assert.equal(calledGroqEndpoint, true);
  assert.equal(actual.route, 'rapide');
});

test("R5.1-2 : DECISION_PROVIDER=\"groq\" explicite -> Groq", async (t) => {
  let calledGroqEndpoint = false;
  withFetch(t, async (url) => { calledGroqEndpoint = String(url).includes('groq.com'); return Response.json({ choices: [{ message: { content: JSON.stringify(decision('exploitable', 'rapide', null, 'moyenne')) } }] }); });
  const actual = await decideWithSelectedProvider({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { GROQ_API_KEY: 'server-only', DECISION_PROVIDER: 'groq' });
  assert.equal(calledGroqEndpoint, true);
  assert.equal(actual.route, 'rapide');
});

test("R5.1-3 : DECISION_PROVIDER=\"anthropic\" explicite -> Anthropic", async (t) => {
  let calledAnthropicEndpoint = false;
  withFetch(t, async (url) => { calledAnthropicEndpoint = String(url).includes('anthropic.com'); return anthropicToolUseResponse(decision('exploitable', 'architecte', null, 'haute')); });
  const actual = await decideWithSelectedProvider({ demande: 'x', materiau_present: false, mode_demande: 'architecte' }, { ANTHROPIC_API_KEY: 'server-only', DECISION_PROVIDER: 'anthropic' });
  assert.equal(calledAnthropicEndpoint, true);
  assert.equal(actual.route, 'architecte');
});

test("R5.1-4 : DECISION_PROVIDER invalide -> erreur de configuration explicite, aucun appel réseau, aucun fallback silencieux", async (t) => {
  let fetchCalled = false;
  withFetch(t, async () => { fetchCalled = true; return Response.json({}); });
  await assert.rejects(
    () => decideWithSelectedProvider({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { GROQ_API_KEY: 'a', ANTHROPIC_API_KEY: 'b', DECISION_PROVIDER: 'auto' }),
    /DECISION_PROVIDER invalide/
  );
  assert.equal(fetchCalled, false, "aucune requête réseau ne doit partir sur une valeur DECISION_PROVIDER invalide.");
});

test("R5.1-4b : \"auto\" est explicitement une valeur invalide, jamais un mode supporté par ce lot", async () => {
  await assert.rejects(
    () => decideWithSelectedProvider({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { DECISION_PROVIDER: 'auto' }),
    /DECISION_PROVIDER invalide.*"auto"/s
  );
});

// --- Absence de clé Anthropic ------------------------------------------------------------------------

test("R5.1-5 : ANTHROPIC_API_KEY absent -> erreur explicite, aucune requête réseau tentée", async (t) => {
  let fetchCalled = false;
  withFetch(t, async () => { fetchCalled = true; return Response.json({}); });
  await assert.rejects(
    () => decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, {}),
    /ANTHROPIC_API_KEY absent/
  );
  assert.equal(fetchCalled, false);
});

// --- Mapping system / messages (system top-level, jamais un rôle "system" dans messages[]) --------

test("R5.1-6 : le system prompt est transmis comme champ `system` racine, JAMAIS un message de rôle \"system\"", async (t) => {
  let captured;
  withFetch(t, async (url, options) => { captured = { url, body: JSON.parse(options.body) }; return anthropicToolUseResponse(decision('exploitable', 'rapide', null, 'moyenne')); });
  await decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' });
  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(captured.body.system, DECISION_MODEL_PROMPT);
  assert.ok(!captured.body.messages.some((m) => m.role === 'system'), "messages[] ne doit jamais contenir un rôle \"system\" -- role invalide pour l'API Anthropic Messages.");
});

test("R5.1-7 : le message utilisateur reste construit par makeDecisionUserMessage (identique aux deux providers)", async (t) => {
  let captured;
  withFetch(t, async (url, options) => { captured = JSON.parse(options.body); return anthropicToolUseResponse(decision('exploitable', 'rapide', null, 'moyenne')); });
  const input = { demande: 'Organise mes idées en plan', materiau_present: true, mode_demande: 'rapide' };
  await decideWithAnthropic(input, { ANTHROPIC_API_KEY: 'server-only' });
  assert.equal(captured.messages.length, 1);
  assert.equal(captured.messages[0].role, 'user');
  assert.deepEqual(JSON.parse(captured.messages[0].content), input);
});

// --- Structured output / JSON Schema (mécanisme tool_use natif Anthropic) -------------------------

test("R5.1-8 : structured output utilise le mécanisme tool_use natif Anthropic, input_schema = DECISION_JSON_SCHEMA exact, tool_choice forcé", async (t) => {
  let captured;
  withFetch(t, async (url, options) => { captured = JSON.parse(options.body); return anthropicToolUseResponse(decision('exploitable', 'rapide', null, 'moyenne')); });
  await decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' });
  assert.equal(captured.tools.length, 1);
  assert.equal(captured.tools[0].name, 'decision_provider');
  assert.deepEqual(captured.tools[0].input_schema, DECISION_JSON_SCHEMA);
  assert.deepEqual(captured.tool_choice, { type: 'tool', name: 'decision_provider' });
  assert.equal(captured.model, ANTHROPIC_MODEL);
});

test("R5.1-8b : une réponse Anthropic sans bloc tool_use exploitable est rejetée explicitement, jamais une décision fabriquée", async (t) => {
  withFetch(t, async () => Response.json({ content: [{ type: 'text', text: 'je ne sais pas' }] }));
  await assert.rejects(
    () => decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' }),
    /tool_use exploitable/
  );
});

// --- Même validation finale, quel que soit le provider ---------------------------------------------

// 3F.3.3-X2-BATCH-R5.1c : ce test vérifiait auparavant qu'un raison_interne INCOMPATIBLE avec
// etat_demande/route était rejeté par validateDecision -- ce cas précis n'est PLUS un rejet côté
// Anthropic depuis R5.1c (raison_interne y est désormais dérivée canoniquement, jamais confiée au
// LLM comme seconde autorité, cf. rapport R5.1c). La validation finale reste bien la MÊME
// (validateDecision, unique autorité, jamais contournée) : ce test utilise donc un cas TOUJOURS
// invalide, indépendant de raison_interne, pour prouver que le rejet structurel fonctionne
// toujours -- voir R5.1c-4/R5.1c-5 pour les cas spécifiquement dédiés à la dérivation canonique.
test("R5.1-9 (corrigé R5.1c) : la sortie Anthropic passe par la MÊME validation finale (validateDecision) que Groq -- une décision structurellement invalide (confiance) reste rejetée, indépendamment de raison_interne", async (t) => {
  withFetch(t, async () => anthropicToolUseResponse({ etat_demande: 'exploitable', route: 'rapide', confiance: 'faible', raison_interne: DECISION_REASONS.rapide, question: null }));
  await assert.rejects(
    () => decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' }),
    /confiance invalide/
  );
});

test("R5.1-9b : une décision Anthropic structurellement valide est acceptée et normalisée exactement comme côté Groq", async (t) => {
  withFetch(t, async () => anthropicToolUseResponse(decision('clarification_necessaire', null, 'Combien de temps avez-vous, avec quel budget travaillez-vous ?')));
  const actual = await decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' });
  assert.equal(actual.question, 'Combien de temps avez-vous ?', "la même normalisation de question unique (decision-core.js, inchangée) s'applique aux deux providers.");
});

// --- R5.1c : raison_interne dérivée canoniquement (Anthropic uniquement), jamais une seconde autorité --

test("R5.1c-1 : Anthropic exploitable+rapide -> raison_interne canonique \"rapide\", même si le LLM a envoyé une autre phrase", async (t) => {
  withFetch(t, async () => anthropicToolUseResponse({ etat_demande: 'exploitable', route: 'rapide', confiance: 'haute', raison_interne: DECISION_REASONS.architecte, question: null }));
  const actual = await decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' });
  assert.equal(actual.raison_interne, DECISION_REASONS.rapide);
});

test("R5.1c-2 : Anthropic exploitable+architecte -> raison_interne canonique \"architecte\", même si le LLM a envoyé une autre phrase", async (t) => {
  withFetch(t, async () => anthropicToolUseResponse({ etat_demande: 'exploitable', route: 'architecte', confiance: 'haute', raison_interne: DECISION_REASONS.rapide, question: null }));
  const actual = await decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' });
  assert.equal(actual.raison_interne, DECISION_REASONS.architecte);
});

test("R5.1c-3 : Anthropic clarification_necessaire+route=null -> raison_interne canonique \"clarification\", même si le LLM a envoyé une autre phrase", async (t) => {
  withFetch(t, async () => anthropicToolUseResponse({ etat_demande: 'clarification_necessaire', route: null, confiance: 'haute', raison_interne: DECISION_REASONS.rapide, question: 'Quand souhaitez-vous commencer ?' }));
  const actual = await decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' });
  assert.equal(actual.raison_interne, DECISION_REASONS.clarification);
});

test("R5.1c-4 : une mauvaise combinaison etat_demande/route reste rejetée -- la dérivation canonique ne corrige jamais une décision structurellement invalide", async (t) => {
  withFetch(t, async () => anthropicToolUseResponse({ etat_demande: 'clarification_necessaire', route: 'rapide', confiance: 'haute', raison_interne: DECISION_REASONS.rapide, question: 'Quand souhaitez-vous commencer ?' }));
  await assert.rejects(
    () => decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' }),
    /route=null/
  );
});

test("R5.1c-5 : une question invalide (trop longue) reste rejetée -- la dérivation canonique ne contourne jamais validateDecision", async (t) => {
  const tooLong = `Quand souhaitez-vous commencer ce projet ${"x".repeat(160)} ?`;
  assert.ok(tooLong.length > 180, "la question de test doit dépasser 180 caractères pour ce cas.");
  withFetch(t, async () => anthropicToolUseResponse({ etat_demande: 'clarification_necessaire', route: null, confiance: 'haute', raison_interne: DECISION_REASONS.rapide, question: tooLong }));
  await assert.rejects(
    () => decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' }),
    /Question invalide/
  );
});

test("R5.1c-6 : aucun autre champ LLM (etat_demande/route/confiance/question) n'est modifié par la dérivation -- seul raison_interne est reconstruit", async (t) => {
  const raw = { etat_demande: 'exploitable', route: 'architecte', confiance: 'moyenne', raison_interne: 'phrase quelconque et incorrecte', question: null };
  withFetch(t, async () => anthropicToolUseResponse(raw));
  const actual = await decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' });
  assert.equal(actual.etat_demande, raw.etat_demande);
  assert.equal(actual.route, raw.route);
  assert.equal(actual.confiance, raw.confiance);
  assert.equal(actual.question, raw.question);
  assert.notEqual(actual.raison_interne, raw.raison_interne, "raison_interne, seul champ concerné, doit être reconstruit -- jamais celui envoyé par le LLM ici, puisqu'il était incorrect.");
});

test("R5.1c-7 : Groq reste strictement inchangé par la dérivation canonique -- un raison_interne Groq incompatible est TOUJOURS rejeté (jamais de dérivation côté Groq)", async (t) => {
  withFetch(t, async () => Response.json({ choices: [{ message: { content: JSON.stringify({ etat_demande: 'exploitable', route: 'rapide', confiance: 'haute', raison_interne: DECISION_REASONS.architecte, question: null }) } }] }));
  await assert.rejects(
    () => decideWithGroq({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { GROQ_API_KEY: 'server-only' }),
    /ne correspond pas/
  );
});

// --- Aucune modification du contrat public /decision ------------------------------------------------

test("R5.1-10 : le contrat public /decision (route, méthode, CORS, forme de sortie) est strictement inchangé, provider Groq par défaut", async () => {
  const env = { ALLOWED_ORIGINS: 'https://atelier.example.com', GROQ_API_KEY: 'server-only' };
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify(decision('exploitable', 'rapide', null, 'moyenne')) } }] });
    const response = await groqWorker.fetch(new Request('https://worker.example/decision', { method: 'POST', headers: { Origin: 'https://atelier.example.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }) }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['confiance', 'etat_demande', 'question', 'raison_interne', 'route']);
  } finally { globalThis.fetch = original; }
});

test("R5.1-10b : le même Worker, même route /decision, sert Anthropic quand DECISION_PROVIDER=anthropic -- forme de sortie identique", async () => {
  const env = { ALLOWED_ORIGINS: 'https://atelier.example.com', ANTHROPIC_API_KEY: 'server-only', DECISION_PROVIDER: 'anthropic' };
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => anthropicToolUseResponse(decision('exploitable', 'rapide', null, 'moyenne'));
    const response = await groqWorker.fetch(new Request('https://worker.example/decision', { method: 'POST', headers: { Origin: 'https://atelier.example.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }) }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['confiance', 'etat_demande', 'question', 'raison_interne', 'route']);
  } finally { globalThis.fetch = original; }
});

// --- R5.1b : timeouts séparés par provider (recalibration Anthropic sur preuve du smoke R5.1a) ----

function withAbortSignalTimeoutSpy(t) {
  const original = AbortSignal.timeout;
  const calls = [];
  AbortSignal.timeout = (ms) => { calls.push(ms); return original.call(AbortSignal, ms); };
  t.after(() => { AbortSignal.timeout = original; });
  return calls;
}

test("R5.1b-1 : Groq conserve son timeout à 8000ms, INCHANGÉ par la recalibration Anthropic", async (t) => {
  const calls = withAbortSignalTimeoutSpy(t);
  withFetch(t, async () => Response.json({ choices: [{ message: { content: JSON.stringify(decision('exploitable', 'rapide', null, 'moyenne')) } }] }));
  await decideWithGroq({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { GROQ_API_KEY: 'server-only' });
  assert.ok(calls.includes(8000), `attendu un appel AbortSignal.timeout(8000) pour Groq, obtenu ${JSON.stringify(calls)}`);
});

test("R5.1b-2 : Anthropic utilise désormais un timeout de 20000ms, découplé de celui de Groq", async (t) => {
  const calls = withAbortSignalTimeoutSpy(t);
  withFetch(t, async () => anthropicToolUseResponse(decision('exploitable', 'rapide', null, 'moyenne')));
  await decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' });
  assert.ok(calls.includes(20000), `attendu un appel AbortSignal.timeout(20000) pour Anthropic, obtenu ${JSON.stringify(calls)}`);
  assert.ok(!calls.includes(8000), "Anthropic ne doit plus utiliser 8000ms après cette recalibration.");
});

test("R5.1b-3 : les deux timeouts restent strictement indépendants -- un appel Groq suivi d'un appel Anthropic dans le même process utilise bien 8000 puis 20000, jamais l'un pour l'autre", async (t) => {
  const calls = withAbortSignalTimeoutSpy(t);
  withFetch(t, async (url) => String(url).includes('anthropic.com')
    ? anthropicToolUseResponse(decision('exploitable', 'rapide', null, 'moyenne'))
    : Response.json({ choices: [{ message: { content: JSON.stringify(decision('exploitable', 'rapide', null, 'moyenne')) } }] }));
  await decideWithGroq({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { GROQ_API_KEY: 'server-only' });
  await decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only' });
  assert.deepEqual(calls, [8000, 20000], `attendu exactement [8000, 20000] dans cet ordre, obtenu ${JSON.stringify(calls)}`);
});

// --- Aucune clé en clair -----------------------------------------------------------------------------

test("R5.1-11 : la clé Anthropic n'apparaît jamais en clair dans le corps envoyé (seulement dans l'en-tête x-api-key), et n'est jamais journalisée sur erreur", async (t) => {
  let capturedHeaders, capturedBody;
  const originalConsoleError = console.error;
  const loggedPayloads = [];
  console.error = (...args) => { loggedPayloads.push(args); };
  try {
    withFetch(t, async (url, options) => {
      capturedHeaders = options.headers;
      capturedBody = options.body;
      return Response.json({ error: { type: 'authentication_error', message: 'invalid x-api-key sk-ant-SECRET-VALUE-1234' } }, { status: 401 });
    });
    await assert.rejects(() => decideWithAnthropic({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'sk-ant-SECRET-VALUE-1234' }));
  } finally { console.error = originalConsoleError; }
  assert.equal(capturedHeaders['x-api-key'], 'sk-ant-SECRET-VALUE-1234', "la clé doit être transmise UNIQUEMENT dans l'en-tête x-api-key attendu par Anthropic.");
  assert.doesNotMatch(capturedBody, /sk-ant-SECRET-VALUE-1234/, "le corps de la requête ne doit jamais contenir la clé.");
  const loggedText = JSON.stringify(loggedPayloads);
  assert.doesNotMatch(loggedText, /sk-ant-SECRET-VALUE-1234/, "la clé ne doit jamais apparaître dans un log, même sur une erreur d'authentification renvoyant la clé dans le message.");
});

test("R5.1-11b : aucune clé en clair dans les fichiers de production (source-scan)", () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../workers/groq/src/index.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /sk-ant-[A-Za-z0-9_-]{10,}/, "aucune clé Anthropic en dur ne doit jamais apparaître dans le code source.");
});

// --- Aucun fallback automatique cross-provider ------------------------------------------------------

test("R5.1-12 : un échec Anthropic (429/5xx) ne bascule JAMAIS automatiquement vers Groq -- l'erreur remonte telle quelle", async (t) => {
  let groqEndpointCalled = false;
  withFetch(t, async (url) => {
    if (String(url).includes('groq.com')) { groqEndpointCalled = true; return Response.json({ choices: [{ message: { content: JSON.stringify(decision('exploitable', 'rapide', null, 'moyenne')) } }] }); }
    return Response.json({ error: { type: 'rate_limit_error', message: 'rate limited' } }, { status: 429 });
  });
  await assert.rejects(
    () => decideWithSelectedProvider({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only', GROQ_API_KEY: 'server-only', DECISION_PROVIDER: 'anthropic' }),
    /Anthropic a répondu 429/
  );
  assert.equal(groqEndpointCalled, false, "aucun appel Groq ne doit jamais être tenté suite à un échec Anthropic dans ce lot.");
});

test("R5.1-12b : un échec Groq ne bascule JAMAIS automatiquement vers Anthropic -- l'erreur remonte telle quelle", async (t) => {
  let anthropicEndpointCalled = false;
  withFetch(t, async (url) => {
    if (String(url).includes('anthropic.com')) { anthropicEndpointCalled = true; return anthropicToolUseResponse(decision('exploitable', 'rapide', null, 'moyenne')); }
    return Response.json({ error: { message: 'server error' } }, { status: 500 });
  });
  await assert.rejects(
    () => decideWithSelectedProvider({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { ANTHROPIC_API_KEY: 'server-only', GROQ_API_KEY: 'server-only', DECISION_PROVIDER: 'groq' }),
    /Groq a répondu 500/
  );
  assert.equal(anthropicEndpointCalled, false, "aucun appel Anthropic ne doit jamais être tenté suite à un échec Groq dans ce lot.");
});

// --- Groq inchangé -------------------------------------------------------------------------------------

test("R5.1-13 : decideWithGroq reste strictement inchangé (modèle, structured output, en-têtes)", async (t) => {
  let captured;
  withFetch(t, async (url, options) => { captured = { url, body: JSON.parse(options.body), headers: options.headers }; return Response.json({ choices: [{ message: { content: JSON.stringify(decision('exploitable', 'rapide', null, 'moyenne')) } }] }); });
  await decideWithGroq({ demande: 'x', materiau_present: false, mode_demande: 'rapide' }, { GROQ_API_KEY: 'server-only' });
  assert.equal(captured.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(captured.body.model, 'openai/gpt-oss-20b');
  assert.equal(captured.body.response_format.json_schema.strict, true);
  assert.deepEqual(captured.body.response_format.json_schema.schema, DECISION_JSON_SCHEMA);
  assert.equal(captured.headers.Authorization, 'Bearer server-only');
});
