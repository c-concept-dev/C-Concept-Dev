/* M-01 — DURCISSEMENT DES SORTIES STRUCTURÉES DES PROVIDERS
 * ============================================================================
 *
 * Un fournisseur produit une réponse. Il ne décide rien — ni readiness, ni
 * route, ni état OPRIE. Une sortie structurée est une contrainte de FORME, pas
 * une autorité sémantique. Ce lot durcit la forme, et rien d'autre.
 *
 * L'architecture était déjà solide : les trois adaptateurs utilisent un mode
 * structuré NATIF (json_schema strict pour Groq et OpenAI, tool_use forcé pour
 * Anthropic), la validation finale est unique, et les secrets sont expurgés des
 * journaux. Cinq écarts subsistaient, tous mesurés sur le code réel :
 *
 *   1. un contenu ABSENT ou vide sur un HTTP 200 devenait `undefined` et
 *      échouait plus loin sous une cause qui n'était pas la sienne ;
 *   2. une réponse TRONQUÉE par la limite de tokens était rapportée comme
 *      « JSON non parsable » — le diagnostic accusait le schéma au lieu de la
 *      longueur ;
 *   3. un REFUS de fournisseur, exposé dans un canal dédié, subissait le même
 *      sort ;
 *   4. plusieurs appels d'outil là où un seul est attendu : le premier était
 *      pris silencieusement, ce qui revient à décider à la place du contrat ;
 *   5. rien ne distinguait ces situations les unes des autres.
 *
 * Ce que ces tests protègent, au fond : un succès de TRANSPORT n'est pas un
 * succès applicatif, et aucune structure n'est jamais fabriquée pour combler
 * ce qui manque.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECISION_ADAPTERS,
  DECISION_PROVIDER_ORDER,
  STRUCTURED_STATUS,
  decideWithAnthropic,
  decideWithGroq,
  decideWithHaChain,
  decideWithOpenAI
} from '../workers/groq/src/index.js';
import {
  FAILOVER_ELIGIBLE_CLASSES,
  FAILURE_CLASSES,
  ProviderChainError,
  failureClassOf
} from '../workers/shared/provider-ha.js';
import {
  DECISION_REASONS,
  parseDecisionCandidate,
  validateDecision
} from '../workers/shared/decision-core.js';
import {
  parseAnalystOutput,
  parseArbiterOutput,
  parseCriticOutput
} from '../workers/shared/operational-request-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTERS_SRC = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
const DECISION_SRC = fs.readFileSync(path.join(root, 'workers/shared/decision-core.js'), 'utf8');
const OPRIE_SRC = fs.readFileSync(path.join(root, 'workers/shared/operational-request-core.js'), 'utf8');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const INPUT = { demande: 'Prépare un plan de lancement produit', materiau_present: false, mode_demande: 'rapide' };
const CLES = { GROQ_API_KEY: 'gsk_SECRET', ANTHROPIC_API_KEY: 'sk-ant-SECRET', 'OPenAI-API': 'sk-proj-SECRET' };

function decision(etat_demande = 'exploitable', route = 'rapide', question = null) {
  const raison_interne = etat_demande === 'clarification_necessaire'
    ? DECISION_REASONS.clarification
    : route === 'rapide' ? DECISION_REASONS.rapide : DECISION_REASONS.architecte;
  return { etat_demande, route, confiance: 'haute', raison_interne, question };
}

const groqOk = (payload) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }] });
const openAiOk = (payload) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }] });
const anthropicOk = (payload, schemaName = 'decision_provider') =>
  Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: schemaName, input: payload }] });

const providerOf = (url) => {
  const v = String(url);
  return v.includes('api.groq.com') ? 'groq' : v.includes('api.anthropic.com') ? 'anthropic' : v.includes('api.openai.com') ? 'openai' : 'unknown';
};

function withProviders(t, handlers) {
  const calls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    const provider = providerOf(url);
    calls.push(provider);
    const handler = handlers[provider];
    assert.ok(handler, `appel inattendu vers « ${provider} »`);
    return handler(options, calls.filter((n) => n === provider).length);
  };
  return calls;
}

function withCapturedConsole(t) {
  const entries = [];
  const log = console.log, err = console.error;
  console.log = (...a) => entries.push({ stream: 'log', args: a });
  console.error = (...a) => entries.push({ stream: 'error', args: a });
  t.after(() => { console.log = log; console.error = err; });
  return entries;
}

/** Rend l'échec structuré levé par un adaptateur, ou fait échouer le test. */
async function echecDe(promesse) {
  try { await promesse; } catch (error) { return error; }
  assert.fail('un échec structuré était attendu');
}

/* ======================================================================== *
 * §48 — LE NOYAU : PARSER NE SUFFIT PAS
 * ======================================================================== */

test('T-M01-01 une réponse JSON valide et conforme au schéma est acceptée', async (t) => {
  withProviders(t, { groq: () => groqOk(decision()) });
  const resultat = await decideWithGroq(INPUT, CLES);
  assert.equal(resultat.etat_demande, 'exploitable');
  assert.equal(resultat.route, 'rapide');
  assert.equal(resultat.question, null);
});

test('T-M01-02 un JSON invalide est rejeté, jamais réparé', () => {
  for (const brut of ['{"etat_demande":', '{etat_demande:"exploitable"}', 'pas du json']) {
    assert.throws(() => parseDecisionCandidate(brut), 'un JSON malformé doit être rejeté');
  }
});

test('T-M01-03 un JSON valide mais non conforme au schéma est rejeté', () => {
  /* JSON.parse réussit ; la validation, elle, ne réussit pas. C'est exactement
     la confusion que ce lot interdit. */
  const parsable = JSON.stringify({ etat_demande: 'exploitable', route: 'rapide', confiance: 'haute', raison_interne: 'phrase libre', question: null });
  assert.doesNotThrow(() => JSON.parse(parsable), 'le texte est bien du JSON');
  assert.throws(() => parseDecisionCandidate(parsable), 'mais il n’est pas conforme au contrat');
});

test('T-M01-04 un champ requis manquant est rejeté', () => {
  const { route, ...sansRoute } = decision();
  assert.throws(() => validateDecision(sansRoute, INPUT.demande));
  assert.throws(() => parseAnalystOutput(JSON.stringify({ role: 'analyst' })));
});

test('T-M01-05 un type incorrect est rejeté', () => {
  for (const faux of [{ ...decision(), confiance: 3 }, { ...decision(), question: 42 }, { ...decision(), etat_demande: ['exploitable'] }]) {
    assert.throws(() => validateDecision(faux, INPUT.demande), JSON.stringify(faux.confiance ?? faux.question));
  }
});

test('T-M01-06 une valeur d’énumération inconnue est rejetée', () => {
  assert.throws(() => validateDecision({ ...decision(), etat_demande: 'presque_exploitable' }, INPUT.demande));
  assert.throws(() => validateDecision({ ...decision(), confiance: 'moyenne_haute' }, INPUT.demande));
  /* Et surtout : aucune correction vers l’énumération la plus proche. */
  assert.equal(/nearest|closest|approx|fuzzy|levenshtein/i.test(sansCommentaires(DECISION_SRC)), false);
});

test('T-M01-07 une propriété inattendue est rejetée là où le contrat est strict', () => {
  assert.throws(() => validateDecision({ ...decision(), champ_en_trop: true }, INPUT.demande));
  assert.throws(() => parseAnalystOutput(JSON.stringify({ role: 'analyst', champ_en_trop: 1 })));
  assert.ok(/exactKeys/.test(OPRIE_SRC), 'la validation OPRIE impose des clés exactes');
});

test('T-M01-08 une structure imbriquée invalide est rejetée', () => {
  const arbitre = { role: 'arbiter', state: 'operational_request_ready', operational_request_candidate: 'pas un objet' };
  assert.throws(() => parseArbiterOutput(JSON.stringify(arbitre)), 'la validation descend dans l’imbrication');
});

test('T-M01-09 un élément de tableau invalide est rejeté', () => {
  const critique = { role: 'critic', issues: [{ type: 'inconnu' }] };
  assert.throws(() => parseCriticOutput(JSON.stringify(critique)));
});

test('T-M01-10 null et absent restent deux choses distinctes', () => {
  /* `question: null` est valide sur une demande exploitable ; `question` absent
     ne l’est pas. Normaliser les deux reviendrait à inventer une réponse. */
  assert.doesNotThrow(() => validateDecision(decision('exploitable', 'rapide', null), INPUT.demande));
  const { question, ...sansQuestion } = decision();
  assert.throws(() => validateDecision(sansQuestion, INPUT.demande));
});

/* ======================================================================== *
 * §49 — RIEN N'EST RÉPARÉ
 * ======================================================================== */

test('T-M01-11 des accolades manquantes ne sont jamais complétées', () => {
  assert.throws(() => parseDecisionCandidate('{"etat_demande":"exploitable"'));
  const code = sansCommentaires(ADAPTERS_SRC) + sansCommentaires(DECISION_SRC) + sansCommentaires(OPRIE_SRC);
  for (const interdit of ['balanceBraces', 'completeJson', 'repairJson', 'fixJson', 'jsonrepair']) {
    assert.equal(code.toLowerCase().includes(interdit.toLowerCase()), false, `réparation interdite : ${interdit}`);
  }
});

test('T-M01-12 une virgule finale n’est jamais corrigée', () => {
  assert.throws(() => parseDecisionCandidate('{"etat_demande":"exploitable",}'));
});

test('T-M01-13 du texte autour du JSON n’est jamais retiré opportunément', () => {
  assert.throws(() => parseDecisionCandidate('Voici ma réponse : {"etat_demande":"exploitable"} — j’espère que cela convient.'));
  /* Aucune extraction du premier objet trouvé dans une prose. */
  const code = sansCommentaires(ADAPTERS_SRC) + sansCommentaires(DECISION_SRC) + sansCommentaires(OPRIE_SRC);
  assert.equal(/indexOf\(['"]\{['"]\)|match\(\/\\\{\[\\s\\S\]\*\\\}\//.test(code), false, 'aucune extraction d’objet dans du texte libre');
});

test('T-M01-14 la seule tolérance de transport est bornée, ancrée et mesurée', () => {
  /* Une clôture de bloc de code est retirée si — et seulement si — elle entoure
     STRICTEMENT toute la réponse. C'est une tolérance héritée, déterministe et
     ancrée aux deux extrémités ; ce lot ne l'étend pas et n'en ajoute aucune. */
  assert.doesNotThrow(() => parseDecisionCandidate('```json\n' + JSON.stringify(decision()) + '\n```'));
  /* Une clôture au milieu du texte ne sauve rien. */
  assert.throws(() => parseDecisionCandidate('bla ```json\n' + JSON.stringify(decision()) + '\n``` bla'));
  const fences = (sansCommentaires(DECISION_SRC) + sansCommentaires(OPRIE_SRC)).match(/replace\(\/\^```/g) || [];
  assert.equal(fences.length, 2, 'exactement deux tolérances, toutes deux ancrées en début de chaîne');
});

test('T-M01-15 aucune énumération n’est rapprochée de la plus proche connue', () => {
  const code = sansCommentaires(ADAPTERS_SRC) + sansCommentaires(DECISION_SRC) + sansCommentaires(OPRIE_SRC);
  for (const interdit of ['levenshtein', 'similarity', 'cosine', 'fuzzy', 'closestMatch', 'nearestEnum']) {
    assert.equal(code.toLowerCase().includes(interdit.toLowerCase()), false, interdit);
  }
});

test('T-M01-16 aucun champ manquant n’est comblé par une valeur inventée', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  for (const interdit of ['?? "exploitable"', "?? 'exploitable'", '|| "rapide"', "|| 'rapide'", 'ready = false', 'confidence: 0.5']) {
    assert.equal(code.includes(interdit), false, `valeur par défaut fabriquée : ${interdit}`);
  }
  /* Et aucune structure de repli n'est renvoyée à la place d'un échec. */
  assert.equal(/catch\s*\([^)]*\)\s*\{\s*return\s*\{\s*\}/.test(code), false, 'aucun catch qui rend un objet vide');
  assert.equal(/catch\s*\{\s*return\s*\{/.test(code), false);
});

/* ======================================================================== *
 * §50 — LES TROIS PROVIDERS, UNE SEULE FORME INTERNE
 * ======================================================================== */

test('T-M01-17 Groq : mode structuré natif et forme interne normalisée', async (t) => {
  const requetes = [];
  withProviders(t, { groq: (options) => { requetes.push(JSON.parse(options.body)); return groqOk(decision()); } });
  const resultat = await decideWithGroq(INPUT, CLES);
  assert.equal(requetes[0].response_format.type, 'json_schema', 'GROQ_STRUCTURED_MODE = json_schema');
  assert.equal(requetes[0].response_format.json_schema.strict, true);
  assert.deepEqual(Object.keys(resultat).sort(), ['confiance', 'etat_demande', 'question', 'raison_interne', 'route']);
});

test('T-M01-18 Anthropic : outil forcé et forme interne identique', async (t) => {
  const requetes = [];
  withProviders(t, { anthropic: (options) => { requetes.push(JSON.parse(options.body)); return anthropicOk(decision()); } });
  const resultat = await decideWithAnthropic(INPUT, CLES);
  assert.equal(requetes[0].tool_choice.type, 'tool', 'ANTHROPIC_STRUCTURED_MODE = tool_use forcé');
  assert.ok(requetes[0].tools[0].input_schema, 'le schéma est transmis nativement');
  assert.deepEqual(Object.keys(resultat).sort(), ['confiance', 'etat_demande', 'question', 'raison_interne', 'route']);
});

test('T-M01-19 OpenAI : schéma strict et forme interne identique', async (t) => {
  const requetes = [];
  withProviders(t, { openai: (options) => { requetes.push(JSON.parse(options.body)); return openAiOk(decision()); } });
  const resultat = await decideWithOpenAI(INPUT, CLES);
  assert.equal(requetes[0].response_format.type, 'json_schema', 'OPENAI_STRUCTURED_MODE = json_schema');
  assert.equal(requetes[0].response_format.json_schema.strict, true);
  assert.deepEqual(Object.keys(resultat).sort(), ['confiance', 'etat_demande', 'question', 'raison_interne', 'route']);
});

test('T-M01-20 le consommateur voit la même forme, quel que soit le fournisseur', async (t) => {
  const formes = [];
  for (const [nom, ok, appel] of [['groq', groqOk, decideWithGroq], ['anthropic', anthropicOk, decideWithAnthropic], ['openai', openAiOk, decideWithOpenAI]]) {
    const restaurer = globalThis.fetch;
    globalThis.fetch = async () => ok(decision('clarification_necessaire', null, 'Quel est le public visé ?'));
    formes.push({ nom, resultat: await appel(INPUT, CLES) });
    globalThis.fetch = restaurer;
  }
  const reference = JSON.stringify(formes[0].resultat);
  for (const { nom, resultat } of formes) {
    assert.equal(JSON.stringify(resultat), reference, `${nom} : PROVIDER_SPECIFIC_SHAPES_AFTER_ADAPTER = 0`);
  }
});

/* ======================================================================== *
 * §51–§53 — LES CINQ ÉCARTS FERMÉS, SUR CHAQUE FOURNISSEUR
 * ======================================================================== */

test('T-M01-21 Groq : une réponse vide n’est pas une réponse', async (t) => {
  withCapturedConsole(t);
  for (const vide of [
    Response.json({ choices: [{ finish_reason: 'stop', message: { content: '' } }] }),
    Response.json({ choices: [{ finish_reason: 'stop', message: {} }] }),
    Response.json({ choices: [] }),
    Response.json({})
  ]) {
    const restaurer = globalThis.fetch;
    globalThis.fetch = async () => vide.clone();
    const erreur = await echecDe(decideWithGroq(INPUT, CLES));
    globalThis.fetch = restaurer;
    assert.equal(failureClassOf(erreur), FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, 'EMPTY_FAILS_CLOSED = YES');
  }
});

test('T-M01-22 Groq : une réponse tronquée est nommée comme telle', async (t) => {
  withCapturedConsole(t);
  withProviders(t, { groq: () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"etat_demande":"exploi' } }] }) });
  const erreur = await echecDe(decideWithGroq(INPUT, CLES));
  assert.equal(failureClassOf(erreur), FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, 'TRUNCATION_FAILS_CLOSED = YES');
  assert.match(String(erreur.message), /interrompu la réponse \(length\)/, 'la cause réelle est nommée, pas « JSON illisible »');
});

test('T-M01-23 Anthropic : un refus est un refus, pas un défaut de schéma', async (t) => {
  withCapturedConsole(t);
  withProviders(t, { anthropic: () => Response.json({ stop_reason: 'refusal', content: [] }) });
  const erreur = await echecDe(decideWithAnthropic(INPUT, CLES));
  assert.match(String(erreur.message), /refusé de répondre/);
  assert.equal(failureClassOf(erreur), FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID);
});

test('T-M01-24 Anthropic : plusieurs appels d’outil ne se résolvent pas au premier', async (t) => {
  withCapturedConsole(t);
  withProviders(t, { anthropic: () => Response.json({ stop_reason: 'tool_use', content: [
    { type: 'tool_use', name: 'decision_provider', input: decision('exploitable', 'rapide') },
    { type: 'tool_use', name: 'decision_provider', input: decision('exploitable', 'architecte') }
  ] }) });
  const erreur = await echecDe(decideWithAnthropic(INPUT, CLES));
  assert.match(String(erreur.message), /2 appels d['’]outil/, 'choisir arbitrairement reviendrait à décider à la place du contrat');
  assert.equal(failureClassOf(erreur), FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID);
});

test('T-M01-25 Anthropic : une réponse coupée par la limite est nommée comme telle', async (t) => {
  withCapturedConsole(t);
  withProviders(t, { anthropic: () => Response.json({ stop_reason: 'max_tokens', content: [{ type: 'tool_use', name: 'decision_provider', input: {} }] }) });
  const erreur = await echecDe(decideWithAnthropic(INPUT, CLES));
  assert.match(String(erreur.message), /interrompu la réponse \(max_tokens\)/);
});

test('T-M01-26 OpenAI : refus, troncature et filtrage sont distingués', async (t) => {
  withCapturedConsole(t);
  const cas = [
    { reponse: { choices: [{ finish_reason: 'stop', message: { refusal: 'Je ne peux pas.' } }] }, motif: /refusé de répondre/ },
    { reponse: { choices: [{ finish_reason: 'length', message: { content: '{"etat' } }] }, motif: /interrompu la réponse \(length\)/ },
    { reponse: { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }, motif: /interrompu la réponse \(content_filter\)/ }
  ];
  for (const { reponse, motif } of cas) {
    const restaurer = globalThis.fetch;
    globalThis.fetch = async () => Response.json(reponse);
    const erreur = await echecDe(decideWithOpenAI(INPUT, CLES));
    globalThis.fetch = restaurer;
    assert.match(String(erreur.message), motif);
    assert.equal(failureClassOf(erreur), FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID);
  }
});

test('T-M01-27 la taxonomie technique nomme les situations sans créer d’état métier', () => {
  assert.deepEqual(Object.keys(STRUCTURED_STATUS).sort(),
    ['EMPTY', 'MULTIPLE_TOOL_CALLS', 'PARSE_ERROR', 'REFUSAL', 'SCHEMA_ERROR', 'TRUNCATED', 'VALID']);
  assert.ok(Object.isFrozen(STRUCTURED_STATUS));
  /* Elle ne remplace aucun état OPRIE et n’en introduit aucun. */
  for (const etatMetier of ['operational_request_ready', 'clarification_required', 'degraded_state', 'blocked']) {
    assert.equal(Object.values(STRUCTURED_STATUS).includes(etatMetier), false, etatMetier);
  }
});

/* ======================================================================== *
 * §54 — LE FAILOVER : POLITIQUE INCHANGÉE, VALIDATION TOUJOURS REJOUÉE
 * ======================================================================== */

test('T-M01-F01 une structure invalide bascule, et le suivant est validé aussi', async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"etat' } }] }),
    anthropic: () => anthropicOk(decision())
  });
  const resultat = await decideWithHaChain(INPUT, CLES);
  assert.deepEqual(calls, ['groq', 'anthropic'], 'FAILOVER_ORDER_CHANGED = NO');
  assert.equal(resultat.etat_demande, 'exploitable');
});

test('T-M01-F02 aucun fournisseur ne contourne la validation en cascade', async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '' } }] }),
    anthropic: () => Response.json({ stop_reason: 'refusal', content: [] }),
    openai: () => openAiOk(decision())
  });
  const resultat = await decideWithHaChain(INPUT, CLES);
  assert.deepEqual(calls, ['groq', 'anthropic', 'openai'],
    'INVALID_STRUCTURE_CAN_BYPASS_VALIDATION_ON_FALLBACK = NO');
  assert.equal(resultat.route, 'rapide');
});

test('T-M01-F03 tous invalides : la chaîne échoue, elle n’invente rien', async (t) => {
  withCapturedConsole(t);
  withProviders(t, {
    groq: () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }),
    anthropic: () => Response.json({ stop_reason: 'max_tokens', content: [] }),
    openai: () => Response.json({ choices: [{ finish_reason: 'stop', message: { refusal: 'non' } }] })
  });
  const erreur = await echecDe(decideWithHaChain(INPUT, CLES));
  assert.ok(erreur instanceof ProviderChainError, 'ALL_PROVIDERS_INVALID_FAIL_CLOSED = YES');
  assert.equal(typeof erreur.message, 'string');
  /* Aucune décision n'est fabriquée en sortie de chaîne. */
  assert.equal(erreur.etat_demande, undefined);
  assert.equal(erreur.route, undefined);
});

test('T-M01-F04 la classe d’échec structuré reste éligible au failover, et la politique est intacte', () => {
  assert.ok(FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID));
  assert.deepEqual(DECISION_PROVIDER_ORDER, ['groq', 'anthropic', 'openai'], 'FAILOVER_ORDER_CHANGED = NO');
  assert.deepEqual(Object.keys(DECISION_ADAPTERS), ['groq', 'anthropic', 'openai']);
});

/* ======================================================================== *
 * §55 — AUTORITÉ : LE TRANSPORT NE DÉCIDE RIEN
 * ======================================================================== */

test('T-M01-A01 la couche structurée n’écrit aucun état OPRIE', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(new RegExp(`${etat}\\s*[:=]`).test(code), false, `STRUCTURED_LAYER_OPRIE_WRITES = 0 : ${etat}`);
  }
});

test('T-M01-A02 la couche structurée n’écrit aucune route', () => {
  /* `route` circule comme DONNÉE validée par decision-core ; la couche
     transport ne lui affecte jamais de valeur littérale. */
  const code = sansCommentaires(ADAPTERS_SRC);
  assert.equal(/route\s*[:=]\s*["'](rapide|architecte)["']/.test(code), false, 'STRUCTURED_LAYER_ROUTE_WRITES = 0');
});

test('T-M01-A03 la couche structurée n’écrit aucune readiness', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  assert.equal(/\b(readiness|execution_ready)\s*[:=][^=]/.test(code), false, 'STRUCTURED_LAYER_READINESS_WRITES = 0');
});

test('T-M01-A04 la couche structurée ne touche à aucun des deux gates', () => {
  const code = ADAPTERS_SRC;
  for (const gate of ['validatePromptAgainstCanonicalContract', 'validateOutputAgainstCanonicalContract', 'prompt-contract-gate', 'output-compliance-gate']) {
    assert.equal(code.includes(gate), false, `STRUCTURED_LAYER_QG_MUTATIONS = 0 : ${gate}`);
  }
});

test('T-M01-A05 aucune valeur sémantique par défaut n’est fabriquée', async (t) => {
  withCapturedConsole(t);
  /* Une réponse à laquelle il manque un champ requis n'est jamais complétée :
     elle est rejetée, et la chaîne bascule. */
  const partiel = { etat_demande: 'exploitable', confiance: 'haute', raison_interne: DECISION_REASONS.rapide, question: null };
  withProviders(t, { groq: () => groqOk(partiel), anthropic: () => anthropicOk(decision()) });
  const resultat = await decideWithHaChain(INPUT, CLES);
  assert.equal(resultat.route, 'rapide', 'la valeur vient du second fournisseur, pas d’un défaut inventé');
  assert.throws(() => validateDecision(partiel, INPUT.demande), 'le premier était bien invalide');
});

test('T-M01-A06 aucune branche sémantique propre à un fournisseur', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  /* Les différences entre fournisseurs sont mécaniques — syntaxe de requête,
     extraction. Jamais sémantiques. */
  for (const interdit of [
    /if\s*\([^)]*provider\s*===\s*["']groq["'][^)]*\)\s*\{[^}]*etat_demande/,
    /if\s*\([^)]*provider\s*===\s*["']anthropic["'][^)]*\)\s*\{[^}]*route/,
    /provider\s*===\s*["']openai["'][^;]*confiance/
  ]) {
    assert.equal(interdit.test(code), false, 'PROVIDER_SPECIFIC_SEMANTIC_BRANCHES = 0');
  }
  /* Une seule autorité de validation, partagée par les trois adaptateurs : ils
     finissent tous dans decision-core, et aucun n'en définit une seconde. */
  const validations = (code.match(/parseDecisionCandidate\(|validateDecision\(/g) || []).length;
  assert.ok(validations >= 3, `chaque adaptateur valide : ${validations} appels`);
  assert.equal(/function (validateDecision|parseDecisionCandidate)\b/.test(code), false,
    'aucun adaptateur ne réimplémente la validation');
});

/* ======================================================================== *
 * §57 / §85 — ADVERSARIAL ET SÉCURITÉ
 * ======================================================================== */

test('T-M01-ADV du JSON syntaxiquement valide mais structurellement faux est rejeté', () => {
  const cas = [
    JSON.stringify([decision()]),
    JSON.stringify({ ...decision(), etat_demande: null }),
    JSON.stringify({ ...decision(), question: {} }),
    JSON.stringify({ ...decision(), route: 'RAPIDE' }),
    JSON.stringify({ ...decision(), confiance: true }),
    JSON.stringify(null),
    JSON.stringify('exploitable')
  ];
  for (const brut of cas) {
    assert.doesNotThrow(() => JSON.parse(brut), 'le texte est bien du JSON');
    assert.throws(() => parseDecisionCandidate(brut), `doit être rejeté : ${brut.slice(0, 60)}`);
  }
});

test('T-M01-SEC aucun secret ne fuit dans les journaux', async (t) => {
  const journal = withCapturedConsole(t);
  withProviders(t, { groq: () => Response.json({ error: { code: 'invalid_api_key', message: 'clé gsk_SECRET refusée, Bearer gsk_SECRET' } }, { status: 401 }) });
  await echecDe(decideWithGroq(INPUT, CLES));
  const texte = JSON.stringify(journal);
  for (const secret of Object.values(CLES)) {
    assert.equal(texte.includes(secret), false, 'SECRET_LOG_PATHS = 0');
  }
  assert.ok(texte.includes('EXPURGÉ'), 'la valeur est explicitement expurgée, pas simplement absente');
});

test('T-M01-SEC2 aucune clé n’est écrite dans le dépôt', () => {
  for (const fichier of ['workers/groq/src/index.js', 'workers/shared/decision-core.js', 'workers/shared/operational-request-core.js']) {
    const contenu = fs.readFileSync(path.join(root, fichier), 'utf8');
    assert.equal(/\b(gsk_|sk-ant-|sk-proj-)[A-Za-z0-9_-]{12,}/.test(contenu), false, `API_KEYS_ADDED_TO_REPO : ${fichier}`);
  }
});

/* ======================================================================== *
 * §70 — LES ERREURS REMONTENT
 * ======================================================================== */

test('T-M01-ERR aucune erreur structurelle n’est avalée', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  /* Les seuls `catch` silencieux tolérés entourent la lecture d'un message
     d'erreur du fournisseur — jamais l'extraction d'une structure attendue. */
  const catchsVides = code.match(/catch\s*(\([^)]*\))?\s*\{\s*\}/g) || [];
  assert.ok(catchsVides.length <= 3, `catch silencieux : ${catchsVides.length}`);
  for (const bloc of ['envelope = JSON.parse(raw);']) {
    const i = code.indexOf(bloc);
    assert.ok(i > -1);
    assert.match(code.slice(i, i + 260), /throw (tagFailure|rejectStructured)/, 'un échec de parsing lève toujours');
  }
});
