import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import { TRANSPORT_LIMITS, readJsonBody, handleDecisionRequest, DecisionHttpError } from "../workers/shared/decision-core.js";
import { handleRoleRequest } from "../workers/shared/operational-request-core.js";

// LOT HTTP-8192 (valeurs corrigées par LOT HTTP-8192a) : remplace l'ancien plafond global implicite
// unique (8192 pour /analyst /critic /arbiter /decision) par une politique route-specific + plafond
// absolu de sécurité (TRANSPORT_LIMITS, decision-core.js). Ce fichier ne touche jamais OPRIE, les
// prompts, les schémas, le provider routing, le batching Critic ni les retries/pacing R2/R2.1 —
// uniquement le CONTRAT TRANSPORT HTTP entrant. Aucune des limites testées ici n'est jamais une
// autorité sémantique : le transport accepte tout payload contractuellement représentable jusqu'au
// dimensionnement technique retenu — un N élevé (nombre d'issues) n'est jamais, en lui-même, un
// motif de rejet (LOT HTTP-8192a). Seul un dépassement du plafond absolu (taille/mémoire HTTP) est
// testé comme motif de rejet légitime.

// --- Payloads réels par route (mêmes fixtures que HTTP-TRANSPORT-LIMITS-MEASUREMENTS.json, réutilisées
// à l'identique -- jamais une redérivation approximative) -------------------------------------------

function candidateFor() {
  return {
    objective: "Préparer un déménagement professionnel complet de 40 personnes vers un nouveau bureau, dans un délai de 6 semaines.",
    expected_deliverable: "Un plan d'action détaillé couvrant logistique, communication interne, budget et calendrier, prêt à être exécuté par l'équipe projet.",
    secondary_objectives: ["Minimiser l'interruption d'activité", "Préserver le matériel sensible"],
    confirmed_constraints: ["Budget plafonné à 45 000 €", "Déménagement uniquement le week-end"],
    confirmed_priorities: ["La continuité de service prime sur le coût"],
    confirmed_preferences: ["Prestataire déjà utilisé par l'entreprise si possible", "Communication par email plutôt que réunion"],
    delegated_decisions: ["Le choix du prestataire de déménagement est délégué à l'équipe facilities"],
    external_facts_to_research: ["Disponibilité des ascenseurs de service dans le nouvel immeuble"],
    assumptions_allowed: ["Le nouveau bureau dispose déjà d'une connexion réseau fonctionnelle"],
    remaining_unknowns: ["Date exacte de remise des clés du nouveau site"]
  };
}

function provenanceRecordsFor() {
  const fields = ["objective", "expected_deliverable", "secondary_objectives", "confirmed_constraints", "confirmed_priorities", "confirmed_preferences", "delegated_decisions", "external_facts_to_research", "assumptions_allowed"];
  return fields.map((field) => ({ field, value: "Valeur réelle et distincte associée à ce champ, telle que fournie par l'utilisateur ou déduite en confiance.", provenance: "explicit_user_statement" }));
}

const ISSUE_DESCRIPTIONS = [
  "Le budget alloué au transport du mobilier spécialisé (serveurs, archives physiques) n'est pas précisé.",
  "Il n'est pas déterminé si la migration des postes de travail informatiques fait partie de ce chantier ou d'un chantier IT séparé.",
  "La demande ne précise pas si les équipes doivent être relogées par étage identique ou réorganisées par service.",
  "Aucune information sur l'existence d'un contrat-cadre déjà négocié avec un prestataire de déménagement."
];

function issuesFor(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `issue${i + 1}`, type: "missing_information",
    description: ISSUE_DESCRIPTIONS[i % ISSUE_DESCRIPTIONS.length],
    impact: "material", substitutable: false, recommended_treatment: "question", kind: null
  }));
}

function questionCandidatesFor(n) {
  return Array.from({ length: n }, (_, i) => ({
    text: `Quel est le budget disponible pour le point ${i + 1} évoqué ci-dessus ?`,
    targets_issue_id: `issue${i + 1}`,
    expected_progress: "Permet de chiffrer précisément le poste de dépense correspondant."
  }));
}

function confirmationSignals() {
  return { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false };
}

function analystOutputFor(n) {
  return {
    operational_request_candidate: candidateFor(),
    provenance_records: provenanceRecordsFor(),
    issues: issuesFor(n),
    question_candidates: questionCandidatesFor(n),
    confirmation_signals: confirmationSignals()
  };
}

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];
function alternativesReviewedFor() {
  return Object.fromEntries(LADDER.map((t) => [t, {
    reasonably_available: t === "estimate",
    reason: t === "estimate"
      ? "Une fourchette budgétaire indicative peut être proposée à titre estimatif, à ajuster ensuite."
      : "Cette alternative ne permet pas de progresser utilement sans l'information manquante."
  }]));
}

function criticOutputFor(n) {
  return {
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    question_substitution_review: Array.from({ length: n }, (_, i) => ({ issue_id: `issue${i + 1}`, alternatives_reviewed: alternativesReviewedFor(), question_is_last_resort: false, available_alternative: "estimate" })),
    illegitimate_question_found: Array.from({ length: n }, (_, i) => ({ issue_id: `issue${i + 1}`, available_alternative: "estimate", why_available: "Une estimation raisonnable permet d'avancer sans bloquer sur cette inconnue précise." }))
  };
}

const ORIGINAL_REQUEST = "Nous devons organiser le déménagement de notre siège social vers de nouveaux locaux dans les six prochaines semaines, avec un budget maîtrisé et sans interrompre l'activité commerciale.";
function clarificationHistoryFor() {
  return [
    { turn: 1, question: "Combien de personnes sont concernées par ce déménagement ?", answer: "Environ 40 personnes, réparties sur deux étages.", provenance: "user" },
    { turn: 2, question: "Le nouveau site est-il déjà connu ?", answer: "Oui, un bail a été signé pour un immeuble à 10 minutes du site actuel.", provenance: "user" }
  ];
}

function criticBody(n) {
  return { original_request: ORIGINAL_REQUEST, clarification_history: clarificationHistoryFor(), analyst_output: analystOutputFor(n), previous_vetoes: [] };
}
function arbiterBody(n) {
  return { original_request: ORIGINAL_REQUEST, clarification_history: clarificationHistoryFor(), analyst_output: analystOutputFor(n), critic_output: criticOutputFor(n) };
}

// --- Helpers de construction de requêtes réelles (Request/ReadableStream natifs Node, jamais un
// mock du contrat transport) --------------------------------------------------------------------

function bytesOf(obj) {
  return new TextEncoder().encode(typeof obj === "string" ? obj : JSON.stringify(obj));
}

/** Requête réelle avec Content-Length EXPLICITE (potentiellement mensonger vis-à-vis du corps réel
 * envoyé) -- reproduit fidèlement le contrat que readJsonBody doit honorer (pré-vérification, jamais
 * une confiance aveugle dans le streaming ensuite). */
function realRequest(bytes, { declaredContentLength } = {}) {
  const headers = declaredContentLength !== undefined ? { "Content-Length": String(declaredContentLength) } : {};
  return new Request("http://worker.local/route", { method: "POST", body: bytes, headers });
}

/** Enveloppe un Request réel pour espionner les appels à reader.cancel() sans jamais remplacer la
 * sémantique réelle de lecture (read() délègue intégralement au vrai reader). */
function withCancelSpy(request) {
  const realReader = request.body.getReader();
  let cancelCalls = 0;
  const spyReader = { read: () => realReader.read(), cancel: (...args) => { cancelCalls += 1; return realReader.cancel(...args); } };
  const spied = { headers: request.headers, body: { getReader: () => spyReader } };
  return { request: spied, cancelCalls: () => cancelCalls };
}

/** Requête réelle avec un corps STREAMÉ en plusieurs morceaux contrôlés (jamais un seul chunk
 * monolithique) -- exerce le VRAI chemin "compter réellement les octets" de readJsonBody, pas
 * seulement la pré-vérification Content-Length. */
function chunkedRequest(bytes, chunkSize, { declaredContentLength } = {}) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) chunks.push(bytes.slice(i, i + chunkSize));
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  });
  const headers = declaredContentLength !== undefined ? { "Content-Length": String(declaredContentLength) } : {};
  return new Request("http://worker.local/route", { method: "POST", body: stream, duplex: "half", headers });
}

// =====================================================================================================
// 1-3. juste sous / exactement à / juste au-dessus la limite (streaming, sans Content-Length déclaré)
// =====================================================================================================

test("HTTP8192-1 : un corps de taille limite-1 octets (streamé, sans Content-Length) est accepté", async () => {
  const limit = 200;
  const payload = { x: "a".repeat(limit - 1 - `{"x":""}`.length) };
  const bytes = bytesOf(payload);
  assert.equal(bytes.byteLength, limit - 1);
  const req = chunkedRequest(bytes, 37);
  const parsed = await readJsonBody(req, limit);
  assert.deepEqual(parsed, payload);
});

test("HTTP8192-2 : un corps de taille EXACTEMENT égale à la limite est accepté (limite inclusive)", async () => {
  const limit = 200;
  const overhead = `{"x":""}`.length;
  const payload = { x: "a".repeat(limit - overhead) };
  const bytes = bytesOf(payload);
  assert.equal(bytes.byteLength, limit);
  const req = chunkedRequest(bytes, 41);
  const parsed = await readJsonBody(req, limit);
  assert.deepEqual(parsed, payload);
});

test("HTTP8192-3 : un corps de taille limite+1 octets (streamé) est rejeté 413, jamais lu intégralement", async () => {
  const limit = 200;
  const overhead = `{"x":""}`.length;
  const payload = { x: "a".repeat(limit + 1 - overhead) };
  const bytes = bytesOf(payload);
  assert.equal(bytes.byteLength, limit + 1);
  const req = chunkedRequest(bytes, 41);
  const { request, cancelCalls } = withCancelSpy(req);
  await assert.rejects(() => readJsonBody(request, limit), (error) => {
    assert.ok(error instanceof DecisionHttpError);
    assert.equal(error.status, 413);
    assert.equal(error.code, "payload_too_large");
    return true;
  });
  assert.equal(cancelCalls(), 1, "reader.cancel() doit être appelé exactement une fois dès le dépassement détecté.");
});

// =====================================================================================================
// 4. Content-Length pré-déclaré trop grand -> rejet précoce, AUCUNE lecture du corps
// =====================================================================================================

test("HTTP8192-4 : Content-Length déclaré > limite -> rejet 413 précoce, avant toute lecture de chunk", async () => {
  const limit = 200;
  const bytes = bytesOf({ x: "petit corps, jamais lu" }); // corps réel minuscule, hors de propos ici
  const req = realRequest(bytes, { declaredContentLength: limit + 100 });
  let readCalls = 0;
  const realReader = req.body.getReader();
  const spied = { headers: req.headers, body: { getReader: () => ({ read: () => { readCalls += 1; return realReader.read(); }, cancel: () => realReader.cancel() }) } };
  await assert.rejects(() => readJsonBody(spied, limit), (error) => {
    assert.ok(error instanceof DecisionHttpError);
    assert.equal(error.status, 413);
    return true;
  });
  assert.equal(readCalls, 0, "un Content-Length déclaré hors limite doit rejeter AVANT tout appel à reader.read() (jamais lire un payload déjà hors limite).");
});

// =====================================================================================================
// 5-6. Streaming sans Content-Length trop grand + reader.cancel() effectivement appelé
// =====================================================================================================

test("HTTP8192-5 : sans Content-Length (absent), un corps streamé trop grand est quand même détecté et rejeté 413", async () => {
  const limit = 200;
  const bytes = bytesOf({ x: "a".repeat(500) });
  assert.ok(bytes.byteLength > limit);
  const req = chunkedRequest(bytes, 64); // aucun Content-Length déclaré
  assert.equal(req.headers.get("content-length"), null);
  const { request, cancelCalls } = withCancelSpy(req);
  await assert.rejects(() => readJsonBody(request, limit), (error) => {
    assert.equal(error.status, 413);
    return true;
  });
  assert.equal(cancelCalls(), 1, "HTTP8192-6 : reader.cancel() doit être appelé dès que le flux dépasse la limite, même sans Content-Length déclaré.");
});

test("HTTP8192-6b : un corps sans Content-Length, sous la limite, réussit normalement (le streaming reste la seule protection nécessaire dans ce cas)", async () => {
  const limit = 200;
  const payload = { x: "corps légitime, sans Content-Length déclaré" };
  const bytes = bytesOf(payload);
  assert.ok(bytes.byteLength < limit);
  const req = chunkedRequest(bytes, 17);
  assert.equal(req.headers.get("content-length"), null);
  const parsed = await readJsonBody(req, limit);
  assert.deepEqual(parsed, payload);
});

// =====================================================================================================
// 7. UTF-8 multioctet correctement compté (jamais une longueur de caractères)
// =====================================================================================================

test("HTTP8192-7 : la limite est appliquée en OCTETS UTF-8 réels, jamais en nombre de caractères (multioctet correctement compté)", async () => {
  // "★" = 3 octets UTF-8. 60 caractères "★" à l'intérieur d'un objet JSON minimal dépassent 180 octets
  // alors que 60 < 180 en nombre de CARACTÈRES -- une limite mal comptée en caractères accepterait ce
  // corps à tort ; readJsonBody doit le rejeter à une limite de 180 octets.
  const limit = 180;
  const payload = { x: "★".repeat(60) };
  const charLength = JSON.stringify(payload).length; // ~68 caractères, très inférieur à 180
  const byteLength = bytesOf(payload).byteLength; // 3 octets/caractère "★" -> nettement > 180
  assert.ok(charLength < limit, `précondition du test : charLength (${charLength}) doit être < limit (${limit}).`);
  assert.ok(byteLength > limit, `précondition du test : byteLength (${byteLength}) doit être > limit (${limit}).`);
  const req = chunkedRequest(bytesOf(payload), 23);
  await assert.rejects(() => readJsonBody(req, limit), (error) => {
    assert.equal(error.status, 413);
    return true;
  });
});

test("HTTP8192-7b : un corps UTF-8 multioctet dont la taille en OCTETS reste sous la limite est accepté, et son contenu multioctet est restitué intact", async () => {
  const limit = 300;
  const payload = { x: "★".repeat(30), emoji: "🎉📦✅" }; // mélange 3 octets (BMP) et 4 octets (surrogate pairs)
  const byteLength = bytesOf(payload).byteLength;
  assert.ok(byteLength < limit, `précondition du test : byteLength (${byteLength}) doit être < limit (${limit}).`);
  const req = chunkedRequest(bytesOf(payload), 19); // chunks volontairement non alignés sur les frontières de caractères multioctets
  const parsed = await readJsonBody(req, limit);
  assert.deepEqual(parsed, payload, "le découpage en chunks ne doit jamais corrompre un caractère multioctet coupé entre deux chunks.");
});

// =====================================================================================================
// 8. Limite différente selon la route (route-specific, jamais un plafond unique)
// =====================================================================================================

test("HTTP8192-8 : le même corps (20000 octets) est rejeté pour /decision mais accepté pour /critic -- limites route-specific réelles", async () => {
  assert.ok(TRANSPORT_LIMITS.decision < 20000 && 20000 < TRANSPORT_LIMITS.critic, "précondition : 20000 doit se situer strictement entre la limite decision et la limite critic.");
  const payload = { x: "a".repeat(20000 - `{"x":""}`.length) };
  const bytes = bytesOf(payload);
  assert.equal(bytes.byteLength, 20000);

  await assert.rejects(() => readJsonBody(chunkedRequest(bytes, 4096), TRANSPORT_LIMITS.decision), (error) => {
    assert.equal(error.status, 413);
    return true;
  });
  const parsed = await readJsonBody(chunkedRequest(bytes, 4096), TRANSPORT_LIMITS.critic);
  assert.deepEqual(parsed, payload);
});

// =====================================================================================================
// 9. Plafond absolu de sécurité (jamais dépassable, quelle que soit la valeur route fournie)
// =====================================================================================================

test("HTTP8192-9 : toutes les limites route déclarées restent <= TRANSPORT_LIMITS.absolute", () => {
  for (const route of ["decision", "analyst", "critic", "arbiter"]) {
    assert.ok(TRANSPORT_LIMITS[route] <= TRANSPORT_LIMITS.absolute, `TRANSPORT_LIMITS.${route} (${TRANSPORT_LIMITS[route]}) doit être <= TRANSPORT_LIMITS.absolute (${TRANSPORT_LIMITS.absolute}).`);
  }
});

test("HTTP8192-9b : une limite route fournie au-delà de l'absolu (mauvaise configuration hypothétique) est TOUJOURS écrêtée par TRANSPORT_LIMITS.absolute, jamais respectée telle quelle", async () => {
  const beyondAbsolute = TRANSPORT_LIMITS.absolute + 50000;
  const payload = { x: "a".repeat(TRANSPORT_LIMITS.absolute + 1000 - `{"x":""}`.length) }; // au-delà de l'absolu, mais sous "beyondAbsolute"
  const bytes = bytesOf(payload);
  assert.ok(bytes.byteLength > TRANSPORT_LIMITS.absolute && bytes.byteLength < beyondAbsolute);
  await assert.rejects(() => readJsonBody(chunkedRequest(bytes, 8192), beyondAbsolute), (error) => {
    assert.equal(error.status, 413, "même en passant une limite route supérieure à l'absolu, le plafond absolu doit primer (Math.min).");
    return true;
  });
});

// =====================================================================================================
// 10. N=4/20/50/100 -- le transport accepte tout payload contractuellement représentable jusqu'au
// dimensionnement technique retenu (LOT HTTP-8192a : aucun plafond quantitatif sémantique sur le
// nombre d'issues -- un N élevé n'est jamais, en lui-même, un motif de rejet).
// =====================================================================================================

test("HTTP8192-10 : /critic N=4/20/50/100 (payloads réels mesurés) sont TOUS acceptés par TRANSPORT_LIMITS.critic -- aucun plafond quantitatif sur le nombre d'issues", async () => {
  for (const n of [4, 20, 50, 100]) {
    const body = criticBody(n);
    const bytes = bytesOf(body);
    assert.ok(bytes.byteLength <= TRANSPORT_LIMITS.critic, `N=${n} (${bytes.byteLength} octets) doit tenir sous TRANSPORT_LIMITS.critic (${TRANSPORT_LIMITS.critic}).`);
    const parsed = await readJsonBody(chunkedRequest(bytes, 4096), TRANSPORT_LIMITS.critic);
    assert.deepEqual(parsed, body, `N=${n} doit être restitué intact.`);
  }
});

test("HTTP8192-10b : /arbiter N=4/20/50/100 (payloads réels mesurés) sont TOUS acceptés par TRANSPORT_LIMITS.arbiter -- aucun plafond quantitatif sur le nombre d'issues", async () => {
  for (const n of [4, 20, 50, 100]) {
    const body = arbiterBody(n);
    const bytes = bytesOf(body);
    assert.ok(bytes.byteLength <= TRANSPORT_LIMITS.arbiter, `N=${n} (${bytes.byteLength} octets) doit tenir sous TRANSPORT_LIMITS.arbiter (${TRANSPORT_LIMITS.arbiter}).`);
    const parsed = await readJsonBody(chunkedRequest(bytes, 4096), TRANSPORT_LIMITS.arbiter);
    assert.deepEqual(parsed, body, `N=${n} doit être restitué intact.`);
  }
});

// =====================================================================================================
// 11. Un corps clairement au-delà du plafond absolu (taille/mémoire HTTP, jamais une hypothèse
// sémantique) est toujours rejeté -- le plafond absolu reste une protection DoS effective.
// =====================================================================================================

test("HTTP8192-11 : un corps de plus de 256 KiB (TRANSPORT_LIMITS.absolute) est rejeté 413, y compris avec la limite arbiter (la plus généreuse des limites route)", async () => {
  const beyondAbsolute = TRANSPORT_LIMITS.absolute * 2; // très au-delà, sans ambiguïté possible
  const payload = { x: "a".repeat(beyondAbsolute - `{"x":""}`.length) };
  const bytes = bytesOf(payload);
  assert.ok(bytes.byteLength > TRANSPORT_LIMITS.absolute, `précondition : ${bytes.byteLength} octets doit dépasser TRANSPORT_LIMITS.absolute (${TRANSPORT_LIMITS.absolute}).`);
  await assert.rejects(() => readJsonBody(chunkedRequest(bytes, 16384), TRANSPORT_LIMITS.arbiter), (error) => {
    assert.equal(error.status, 413, "un corps > 256 KiB doit être rejeté même sous la limite route la plus généreuse -- protection taille/mémoire HTTP, jamais une hypothèse sémantique sur le contenu.");
    return true;
  });
});

// =====================================================================================================
// Sécurité (section 9 du mandat) : corps vide, JSON invalide, absence de Content-Length
// =====================================================================================================

test("HTTP8192-SEC-1 : un corps vide produit 400 invalid_json (jamais un crash, jamais un 413)", async () => {
  const req = chunkedRequest(new Uint8Array(0), 10);
  await assert.rejects(() => readJsonBody(req, TRANSPORT_LIMITS.critic), (error) => {
    assert.ok(error instanceof DecisionHttpError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "invalid_json");
    return true;
  });
});

test("HTTP8192-SEC-2 : un JSON syntaxiquement invalide (mais sous la limite de taille) produit 400 invalid_json", async () => {
  const bytes = new TextEncoder().encode("{ceci n'est pas du JSON");
  const req = chunkedRequest(bytes, 6);
  await assert.rejects(() => readJsonBody(req, TRANSPORT_LIMITS.critic), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.code, "invalid_json");
    return true;
  });
});

test("HTTP8192-SEC-3 : une longue chaîne unique (pas de structure imbriquée) reste bornée par la même limite en octets, sans traitement spécial", async () => {
  const limit = 500;
  const payload = { x: "a".repeat(limit) }; // dépasse forcément 500 avec l'enveloppe JSON
  const bytes = bytesOf(payload);
  assert.ok(bytes.byteLength > limit);
  await assert.rejects(() => readJsonBody(chunkedRequest(bytes, 128), limit), (error) => {
    assert.equal(error.status, 413);
    return true;
  });
});

// =====================================================================================================
// Intégration réelle : handleDecisionRequest / handleRoleRequest utilisent bien TRANSPORT_LIMITS[route]
// =====================================================================================================

function envWithOrigin() {
  return { ALLOWED_ORIGINS: "https://exemple.test" };
}
function withOrigin(headers = {}) {
  return { ...headers, Origin: "https://exemple.test", "Content-Type": "application/json" };
}

test("HTTP8192-INT-1 : handleDecisionRequest rejette un corps > TRANSPORT_LIMITS.decision avec 413, avant même d'appeler le provider", async () => {
  const bytes = bytesOf({ demande: "★".repeat(TRANSPORT_LIMITS.decision), materiau_present: false, mode_demande: "rapide" });
  assert.ok(bytes.byteLength > TRANSPORT_LIMITS.decision);
  const request = new Request("http://worker.local/decision", { method: "POST", body: bytes, headers: withOrigin() });
  let providerCalled = false;
  const response = await handleDecisionRequest(request, envWithOrigin(), async () => { providerCalled = true; });
  assert.equal(response.status, 413);
  assert.equal(providerCalled, false, "le provider ne doit jamais être appelé pour un corps déjà rejeté au niveau transport.");
});

test("HTTP8192-INT-2 : handleRoleRequest(critic) accepte un N=20 réaliste (rejeté par l'ancien 8192) via TRANSPORT_LIMITS.critic", async () => {
  const body = criticBody(20);
  const bytes = bytesOf(body);
  assert.ok(bytes.byteLength > 8192 && bytes.byteLength <= TRANSPORT_LIMITS.critic);
  const request = new Request("http://worker.local/critic", { method: "POST", body: bytes, headers: withOrigin() });
  let receivedInput = null;
  const response = await handleRoleRequest(request, envWithOrigin(), {
    role: "critic",
    execute: async (input) => { receivedInput = input; return { agreement: "agree", operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "", question_substitution_review: [], illegitimate_question_found: [] }; }
  });
  assert.equal(response.status, 200);
  assert.equal(receivedInput.analyst_output.issues.length, 20);
});

test("HTTP8192-INT-2b : handleRoleRequest(critic) accepte aussi N=100 réel (65536 couvre le N=100 mesuré, aucun plafond quantitatif sémantique)", async () => {
  const body = criticBody(100);
  const bytes = bytesOf(body);
  assert.ok(bytes.byteLength <= TRANSPORT_LIMITS.critic, `N=100 (${bytes.byteLength} octets) doit tenir sous TRANSPORT_LIMITS.critic (${TRANSPORT_LIMITS.critic}).`);
  const request = new Request("http://worker.local/critic", { method: "POST", body: bytes, headers: withOrigin() });
  let receivedInput = null;
  const response = await handleRoleRequest(request, envWithOrigin(), {
    role: "critic",
    execute: async (input) => { receivedInput = input; return { agreement: "agree", operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "", question_substitution_review: [], illegitimate_question_found: [] }; }
  });
  assert.equal(response.status, 200);
  assert.equal(receivedInput.analyst_output.issues.length, 100);
});

test("HTTP8192-INT-3 : handleRoleRequest(critic) rejette un corps au-delà de TRANSPORT_LIMITS.absolute avec 413, avant tout appel à execute -- protection taille/mémoire, jamais un plafond sur N", async () => {
  const payload = { x: "a".repeat(TRANSPORT_LIMITS.absolute + 10000 - `{"x":""}`.length) };
  const bytes = bytesOf(payload);
  assert.ok(bytes.byteLength > TRANSPORT_LIMITS.absolute);
  const request = new Request("http://worker.local/critic", { method: "POST", body: bytes, headers: withOrigin() });
  let executeCalled = false;
  const response = await handleRoleRequest(request, envWithOrigin(), { role: "critic", execute: async () => { executeCalled = true; } });
  assert.equal(response.status, 413);
  assert.equal(executeCalled, false);
});

test("HTTP8192-INT-4 : handleRoleRequest(arbiter) applique bien TRANSPORT_LIMITS.arbiter, distinct de TRANSPORT_LIMITS.critic, pour la MÊME taille de payload analyst_output", async () => {
  // N choisi pour que arbiterBody(n) dépasse TRANSPORT_LIMITS.critic mais reste sous TRANSPORT_LIMITS.arbiter --
  // prouve que le rôle "arbiter" reçoit bien sa propre limite, pas celle de "critic" par erreur de câblage.
  let n = 4;
  while (bytesOf(arbiterBody(n)).byteLength <= TRANSPORT_LIMITS.critic && n < 100) n += 2;
  const bytes = bytesOf(arbiterBody(n));
  assert.ok(bytes.byteLength > TRANSPORT_LIMITS.critic && bytes.byteLength <= TRANSPORT_LIMITS.arbiter, `précondition : arbiterBody(${n}) = ${bytes.byteLength} octets doit se situer entre TRANSPORT_LIMITS.critic et TRANSPORT_LIMITS.arbiter.`);
  const request = new Request("http://worker.local/arbiter", { method: "POST", body: bytes, headers: withOrigin() });
  const response = await handleRoleRequest(request, envWithOrigin(), {
    role: "arbiter",
    execute: async () => ({ state: "clarification_required", operational_request_candidate: createEmptyCandidate(), issues: [], next_question: { text: "x", targets_issue_id: "issue1", expected_progress: "y" }, confirmation_reason: null, blocked_reason: null, intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] }, reason: "x" })
  });
  assert.equal(response.status, 200, `attendu 200 (payload sous TRANSPORT_LIMITS.arbiter), obtenu ${response.status} -- preuve que la route arbiter utilise bien sa propre limite, plus généreuse que critic.`);
});

// =====================================================================================================
// Non-régression : la sémantique OPRIE n'est jamais influencée par ces limites transport
// =====================================================================================================

test("HTTP8192-NONREG : un rejet 413 ne produit jamais un état sémantique OPRIE (jamais degraded_state, jamais un verdict de readiness) -- une simple erreur HTTP transport", async () => {
  const oversizedBody = { x: "a".repeat(TRANSPORT_LIMITS.absolute + 10000 - `{"x":""}`.length) };
  const bytes = bytesOf(oversizedBody);
  const request = new Request("http://worker.local/critic", { method: "POST", body: bytes, headers: withOrigin() });
  const response = await handleRoleRequest(request, envWithOrigin(), { role: "critic", execute: async () => { throw new Error("ne doit jamais être appelé"); } });
  assert.equal(response.status, 413);
  const responseBody = await response.json();
  assert.equal(responseBody.error, "payload_too_large");
  assert.ok(!("state" in responseBody), "la réponse d'erreur transport ne doit jamais contenir de champ state (jamais confondue avec un ArbiterOutput).");
  assert.ok(!JSON.stringify(responseBody).includes("degraded_state"));
});

// =====================================================================================================
// LOT HTTP-8192a : aucune justification sémantique ne subsiste dans le code -- un mécanisme de
// transport ne peut jamais être une autorité, même implicite, sur le nombre d'issues légitimes.
// =====================================================================================================

test("HTTP8192a-DOC : decision-core.js ne qualifie plus jamais un N élevé de dégénéré, pathologique, non légitime ou contraire à OPRIE", () => {
  const decisionCorePath = fileURLToPath(new URL("../workers/shared/decision-core.js", import.meta.url));
  const source = fs.readFileSync(decisionCorePath, "utf8");
  const forbidden = [/dégénéré/i, /pathologique/i, /non légitime/i, /contraire à OPRIE/i, /corpus réel observé/i];
  for (const pattern of forbidden) {
    assert.doesNotMatch(source, pattern, `decision-core.js ne doit plus jamais justifier une limite transport par ${pattern} (LOT HTTP-8192a).`);
  }
});
