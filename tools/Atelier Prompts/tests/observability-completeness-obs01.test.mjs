import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  OPERATIONAL_REQUEST_PHASES, TERMINAL_RECORD_REQUIRED_FIELDS,
  buildTerminalRecord, computeJournalComplete, createExecutionTrace, handleOperationalRequest,
  isNonEmptyString, isValidAttemptIndex, isValidErrorFingerprint, isValidHttpStatus,
  providerAttemptOccurred, resolveInvocationId, safeErrorFingerprint
} from "../workers/shared/operational-request-orchestrator.js";
import { ProviderChainError, runProviderChain, tagFailure, FAILURE_CLASSES } from "../workers/shared/provider-ha.js";
import groqWorker, { resolveRoleProviderModel, ANTHROPIC_MODEL, MODEL } from "../workers/groq/src/index.js";

// =================================================================================================
// OBSERVABILITY-COMPLETENESS-01 — LA CLÉ DE JOINTURE QUI MANQUAIT.
//
// Un 502 de production est resté définitivement inattribuable. La cause n'était pas seulement une
// capture de journal échantillonnée : AUCUN identifiant ne reliait la réponse vue par le client à un
// enregistrement serveur, et cette absence aurait survécu à une capture parfaite. Ce fichier prouve
// que ce n'est plus le cas, sur les trois chemins terminaux et à chaque phase du pipeline.
//
// LOCAL_CONTROLLED : aucun appel réseau réel, aucun secret, aucun fournisseur contacté.
// =================================================================================================

const ORIGIN = "https://atelier.example.com";
const ENV = { ALLOWED_ORIGINS: ORIGIN, GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a", "OPenAI-API": "o" };
const INPUT = { original_request: "Rédige une lettre de motivation pour un poste de développeur.", clarification_history: [] };
const SECRET_PATTERNS = [/sk-[A-Za-z0-9]{16,}/, /gsk_[A-Za-z0-9]{20,}/, /AIza[0-9A-Za-z_-]{20,}/];

const post = (body, { origin = ORIGIN, headers = {} } = {}) => new Request("https://worker.example/operational-request", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body)
});

function analystOutput() {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "Rédiger une lettre." },
    provenance_records: [], issues: [], question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
}
function criticGlobal() {
  return { operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" };
}
function arbiterOutput(state = "operational_request_ready") {
  return {
    state, operational_request_candidate: { ...createEmptyCandidate(), objective: "Rédiger une lettre." },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Motif."
  };
}
const roleOutput = (role, state) => role === "analyst" ? analystOutput() : role === "critic" ? criticGlobal() : arbiterOutput(state);

/** Capture les événements structurés, sans jamais toucher au vrai transport. */
function capture() {
  const events = [];
  return { log: (event) => events.push(event), events };
}
const terminalOf = (events) => events.filter((e) => e.terminal_event === true);

/** Enregistrement terminal de RÉFÉRENCE, valide sur tous les champs. Les tests d'intégrité ne
    dégradent qu'une seule chose à la fois à partir de lui — jamais un objet bricolé au cas par cas. */
function valideRecord() {
  return {
    invocation_id: "8abc123def456789-CDG", terminal_event: true, phase: "critic", role: "critic",
    provider: null, model: null, provider_attempt_index: null,
    http_status: 200, semantic_state: "clarification_required", error_class: null,
    untagged_exception: false, fallback_path: [],
    phases: [{ phase: "critic", role: "critic", phase_started_at: 1, duration_ms: 2 }],
    safe_error_fingerprint: null
  };
}
const cas = (mutation) => buildTerminalRecord({ ...valideRecord(), ...mutation }).journal_complete;

/** Exécute un tour complet via le gestionnaire HTTP réel, avec des rôles injectés. */
async function run({ executeRole, body = INPUT, resolveModel } = {}) {
  const { log, events } = capture();
  const response = await handleOperationalRequest(post(body), ENV, { executeRole, log, ...(resolveModel ? { resolveModel } : {}) });
  return { response, events, terminal: terminalOf(events) };
}
const okRoles = (state) => async (role) => roleOutput(role, state);

// --- 1. CHEMIN SUCCÈS -----------------------------------------------------------------------------

test("OBS01-1 : succès — exactement un enregistrement terminal, journal_complete=true", async () => {
  const { response, terminal } = await run({ executeRole: okRoles("operational_request_ready") });
  assert.equal(response.status, 200);
  assert.equal(terminal.length, 1, "exactement un enregistrement terminal");
  assert.equal(terminal[0].journal_complete, true);
  assert.equal(terminal[0].event, "operational_request_terminal");
  assert.equal(terminal[0].semantic_state, "operational_request_ready");
  assert.equal(terminal[0].untagged_exception, false);
  assert.equal(terminal[0].error_class, null);
});

test("OBS01-2 : l'identifiant rendu au client EST celui de l'enregistrement terminal", async () => {
  const { response, terminal } = await run({ executeRole: okRoles() });
  const header = response.headers.get("X-Invocation-Id");
  assert.ok(header && header.length > 0, "en-tête X-Invocation-Id présent sur le succès");
  assert.equal(terminal[0].invocation_id, header, "la jointure client <-> serveur tient");
  assert.equal(response.headers.get("Access-Control-Expose-Headers"), "X-Invocation-Id");
});

test("OBS01-3 : un seul identifiant pour toute l'invocation — jamais divergent entre sous-appels", async () => {
  const { events, response } = await run({ executeRole: okRoles() });
  const ids = new Set(events.filter((e) => e.invocation_id).map((e) => e.invocation_id));
  assert.equal(ids.size, 1, "un identifiant unique sur tous les événements");
  assert.equal([...ids][0], response.headers.get("X-Invocation-Id"));
});

test("OBS01-4 : la forme de réponse du succès n'est PAS modifiée (jointure en en-tête seulement)", async () => {
  const { response } = await run({ executeRole: okRoles() });
  const body = await response.json();
  assert.equal("invocation_id" in body, false, "aucun champ ajouté au contrat de réponse en succès");
  assert.equal(body.state, "operational_request_ready");
});

// --- 2. CHEMIN degraded_state ---------------------------------------------------------------------

test("OBS01-5 : degraded_state — un enregistrement terminal, état correct, exception ÉTIQUETÉE", async () => {
  const executeRole = async (role) => {
    if (role === "critic") throw new ProviderChainError("critic", [{ provider: "anthropic", failure_class: FAILURE_CLASSES.TECHNICAL_FAILOVER }]);
    return roleOutput(role);
  };
  const { response, terminal } = await run({ executeRole });
  assert.equal(response.status, 200, "degraded_state reste un 200 : contrat inchangé");
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].semantic_state, "degraded_state");
  assert.equal(terminal[0].untagged_exception, false, "une chaîne épuisée est étiquetée, jamais 'untagged'");
  assert.equal(terminal[0].journal_complete, true);
  assert.equal(terminal[0].http_status, 200);
});

// --- 3. CHEMIN 502 --------------------------------------------------------------------------------

test("OBS01-6 : 502 — exception NON étiquetée nommée comme telle, aucun état sémantique fabriqué", async () => {
  const executeRole = async (role) => {
    if (role === "critic") throw new Error("panne interne non étiquetée");
    return roleOutput(role);
  };
  const { response, terminal } = await run({ executeRole });
  assert.equal(response.status, 502);
  assert.equal(terminal.length, 1, "exactement un enregistrement terminal, même en échec");
  assert.equal(terminal[0].event, "operational_request_error", "le nom d'événement historique est conservé");
  assert.equal(terminal[0].untagged_exception, true, "c'est précisément le cas qui était devenu inattribuable");
  assert.equal(terminal[0].error_class, "untagged");
  assert.equal(terminal[0].semantic_state, null, "aucun état sémantique inventé");
  assert.equal(terminal[0].journal_complete, true);
  assert.equal(terminal[0].phase, "critic");
});

test("OBS01-7 : sur 502 l'identifiant est AUSSI dans le corps — le client peut le citer", async () => {
  const executeRole = async (role) => { if (role === "analyst") throw new Error("x"); return roleOutput(role); };
  const { response, terminal } = await run({ executeRole });
  const body = await response.json();
  assert.equal(body.error, "operational_request_failure");
  assert.equal(body.invocation_id, response.headers.get("X-Invocation-Id"));
  assert.equal(body.invocation_id, terminal[0].invocation_id);
});

test("OBS01-8 : une exception ÉTIQUETÉE en 502 n'est pas déclarée non étiquetée", async () => {
  const executeRole = async (role) => {
    if (role === "analyst") throw tagFailure(new Error("contrat rompu"), FAILURE_CLASSES.CONTRACT_ERROR);
    return roleOutput(role);
  };
  const { terminal } = await run({ executeRole });
  assert.equal(terminal[0].untagged_exception, false);
  assert.equal(terminal[0].error_class, FAILURE_CLASSES.CONTRACT_ERROR);
});

// --- 4. PHASE PAR PHASE ---------------------------------------------------------------------------

test("OBS01-9 : une levée non étiquetée est attribuée à la BONNE phase, à chaque phase du pipeline", async () => {
  for (const phase of ["analyst", "critic", "arbiter"]) {
    const executeRole = async (role) => { if (role === phase) throw new Error("panne " + phase); return roleOutput(role); };
    const { response, terminal } = await run({ executeRole });
    assert.equal(response.status, 502, phase);
    assert.equal(terminal[0].phase, phase, `la phase ${phase} est correctement identifiée`);
    assert.equal(terminal[0].role, phase, phase);
    assert.equal(terminal[0].untagged_exception, true, phase);
  }
});

test("OBS01-10 : phase 'validate' — une entrée invalide est attribuée à la validation", async () => {
  const { response, terminal } = await run({ executeRole: okRoles(), body: { original_request: 42 } });
  assert.ok(response.status >= 400, "une entrée invalide n'est jamais un succès");
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].phase, "validate");
});

test("OBS01-11 : phase 'state_check' — un état illégal de l'Arbitre est attribué à la vérification d'état", async () => {
  const executeRole = async (role) => role === "arbiter" ? { ...arbiterOutput(), state: "etat_illegal" } : roleOutput(role);
  const { response, terminal } = await run({ executeRole });
  assert.equal(response.status, 502);
  assert.equal(terminal[0].phase, "state_check", "l'échec est situé après l'Arbitre, pas dans l'Arbitre");
  assert.equal(terminal[0].untagged_exception, true);
});

test("OBS01-12 : le vocabulaire de phases est fermé et couvre la séquence réelle", () => {
  assert.deepEqual(OPERATIONAL_REQUEST_PHASES, ["validate", "analyst", "critic", "arbiter", "state_check"]);
});

test("OBS01-13 : chaque phase traversée porte un début et une durée mesurés", async () => {
  const { terminal } = await run({ executeRole: okRoles() });
  const phases = terminal[0].phases;
  assert.deepEqual(phases.map((p) => p.phase), ["validate", "analyst", "critic", "arbiter", "state_check"]);
  for (const p of phases) {
    assert.equal(typeof p.phase_started_at, "number");
    assert.equal(typeof p.duration_ms, "number", `${p.phase} : durée mesurée`);
  }
  assert.equal(typeof terminal[0].total_duration_ms, "number");
});

// --- 5. CORRÉLATION DES TENTATIVES FOURNISSEUR ----------------------------------------------------

test("OBS01-14 : les événements provider_ha_* portent le MÊME invocation_id que l'enregistrement terminal", async () => {
  const executeRole = async (role, _input, options) => runProviderChain({
    role,
    providers: [{ name: "anthropic", execute: async () => roleOutput(role) }],
    ...(options && options.log ? { log: options.log } : {})
  });
  const { response, events, terminal } = await run({ executeRole, resolveModel: (p) => resolveRoleProviderModel(p, ENV) });
  const ha = events.filter((e) => typeof e.event === "string" && e.event.startsWith("provider_ha_"));
  assert.ok(ha.length > 0, "des événements provider_ha_* ont bien été émis");
  const id = response.headers.get("X-Invocation-Id");
  for (const e of ha) assert.equal(e.invocation_id, id, `${e.event} corrélé`);
  assert.equal(terminal[0].invocation_id, id);
});

test("OBS01-15 : fournisseur, modèle et index de tentative sont joignables depuis l'enregistrement terminal", async () => {
  const executeRole = async (role, _input, options) => runProviderChain({
    role,
    providers: [{ name: "anthropic", execute: async () => roleOutput(role) }],
    ...(options && options.log ? { log: options.log } : {})
  });
  const { terminal } = await run({ executeRole, resolveModel: (p) => resolveRoleProviderModel(p, ENV) });
  assert.equal(terminal[0].provider, "anthropic");
  assert.equal(terminal[0].model, ANTHROPIC_MODEL);
  assert.equal(terminal[0].provider_attempt_index, 0);
});

test("OBS01-16 : un repli de fournisseur est enregistré comme chemin de repli explicite", async () => {
  const executeRole = async (role, _input, options) => runProviderChain({
    role,
    providers: [
      { name: "groq", execute: async () => { throw tagFailure(new Error("indisponible"), FAILURE_CLASSES.TECHNICAL_FAILOVER); } },
      { name: "anthropic", execute: async () => roleOutput(role) }
    ],
    ...(options && options.log ? { log: options.log } : {})
  });
  const { terminal } = await run({ executeRole, resolveModel: (p) => resolveRoleProviderModel(p, ENV) });
  assert.ok(terminal[0].fallback_path.length > 0, "le repli est visible");
  assert.deepEqual(terminal[0].fallback_path[0], { from: "groq", to: "anthropic", failure_class: FAILURE_CLASSES.TECHNICAL_FAILOVER });
  assert.equal(terminal[0].provider, "anthropic", "le fournisseur retenu est le dernier tenté");
});

test("OBS01-17 : le modèle est relu des constantes réelles, jamais deviné", () => {
  assert.equal(resolveRoleProviderModel("anthropic", ENV), ANTHROPIC_MODEL);
  assert.equal(resolveRoleProviderModel("groq", ENV), MODEL);
  assert.equal(resolveRoleProviderModel("openai", { OPENAI_DECISION_MODEL: "m-x" }), "m-x");
  assert.equal(resolveRoleProviderModel("fournisseur-inconnu", ENV), null, "jamais un modèle inventé");
});

test("OBS01-18 : bout en bout par le vrai Worker — provider_ha_* et terminal partagent l'identifiant", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const schemaName = body.tools?.[0]?.name ?? body.response_format?.json_schema?.name ?? null;
    const role = schemaName === "oprie_analyst" ? "analyst" : schemaName === "oprie_arbiter" ? "arbiter" : "critic";
    return Response.json({ content: [{ type: "tool_use", name: schemaName, input: roleOutput(role) }] });
  };
  const logged = [];
  const l = console.log, e = console.error;
  console.log = (line) => { try { logged.push(JSON.parse(line)); } catch { /* ignoré */ } };
  console.error = console.log;
  t.after(() => { console.log = l; console.error = e; });

  const response = await groqWorker.fetch(post(INPUT), ENV);
  const id = response.headers.get("X-Invocation-Id");
  assert.ok(id, "le Worker réel rend bien la clé de jointure");
  const ha = logged.filter((x) => typeof x.event === "string" && x.event.startsWith("provider_ha_"));
  assert.ok(ha.length > 0, "le vrai chemin émet des événements de tentative");
  for (const x of ha) assert.equal(x.invocation_id, id, `${x.event} corrélé de bout en bout`);
  const terminal = logged.filter((x) => x.terminal_event === true);
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].invocation_id, id);
  assert.equal(terminal[0].provider, "anthropic");
  assert.equal(terminal[0].model, ANTHROPIC_MODEL, "le modèle réel est joignable");
});

// --- 6. HYGIÈNE -----------------------------------------------------------------------------------

test("OBS01-19 : aucun texte de demande, aucun prompt, aucun secret dans les événements", async () => {
  const executeRole = async (role) => { if (role === "critic") throw new Error(INPUT.original_request); return roleOutput(role); };
  const { events } = await run({ executeRole });
  const brut = JSON.stringify(events);
  assert.equal(brut.includes(INPUT.original_request), false, "le texte de la demande n'apparaît nulle part");
  assert.equal(brut.includes("original_request"), false, "aucun champ de demande brute");
  for (const motif of SECRET_PATTERNS) assert.equal(motif.test(brut), false, `aucun secret (${motif})`);
});

test("OBS01-20 : error.message BRUT n'est jamais émis — seulement une empreinte sûre", async () => {
  const SECRET_ISH = "message-d-erreur-citant-une-valeur-utilisateur-42";
  const executeRole = async (role) => { if (role === "analyst") throw new Error(SECRET_ISH); return roleOutput(role); };
  const { events, terminal } = await run({ executeRole });
  assert.equal(JSON.stringify(events).includes(SECRET_ISH), false, "le message brut a disparu du journal");
  const fp = terminal[0].safe_error_fingerprint;
  assert.equal(fp.error_name, "Error");
  assert.match(fp.message_sha256, /^[0-9a-f]{64}$/, "empreinte SHA-256 déterministe");
  assert.equal(typeof fp.frame_count, "number", "un NOMBRE de cadres, jamais le texte de la pile");
});

test("OBS01-21 : l'empreinte est déterministe et distingue deux messages différents", async () => {
  const a = await safeErrorFingerprint(new Error("alpha"));
  const b = await safeErrorFingerprint(new Error("alpha"));
  const c = await safeErrorFingerprint(new TypeError("beta"));
  assert.equal(a.message_sha256, b.message_sha256);
  assert.notEqual(a.message_sha256, c.message_sha256);
  assert.equal(c.error_name, "TypeError");
});

// --- 7. CONTRAT DE L'ENREGISTREMENT ---------------------------------------------------------------

test("OBS01-22 : journal_complete est CALCULÉ, pas décoratif — un champ manquant le met à false", () => {
  assert.equal(buildTerminalRecord(valideRecord()).journal_complete, true, "l'enregistrement de référence est complet");
  const { phase, ...sansPhase } = valideRecord();
  assert.equal(buildTerminalRecord(sansPhase).journal_complete, false, "un enregistrement incomplet se dénonce lui-même");
});

// --- 7bis. INTÉGRITÉ : validité, jamais simple présence -------------------------------------------
//
// La première version testait `!== undefined` : `phase: null` et `invocation_id: ""` la passaient
// sans bruit. Ces assertions ferment l'écart champ par champ, à partir d'un enregistrement de
// référence VALIDE dont on ne dégrade qu'une seule chose à la fois.

test("OBS01-26 : invocation_id — absent, null, vide ou blanc rend journal_complete=false", () => {
  const { invocation_id, ...sans } = valideRecord();
  assert.equal(buildTerminalRecord(sans).journal_complete, false, "A. absent");
  assert.equal(cas({ invocation_id: null }), false, "B. null");
  assert.equal(cas({ invocation_id: "" }), false, "C. vide");
  assert.equal(cas({ invocation_id: "   " }), false, "D. blancs seulement");
  assert.equal(cas({ invocation_id: 42 }), false, "non-chaîne");
});

test("OBS01-27 : phase — absente, null, vide ou hors vocabulaire rend journal_complete=false", () => {
  const { phase, ...sans } = valideRecord();
  assert.equal(buildTerminalRecord(sans).journal_complete, false, "E. absente");
  assert.equal(cas({ phase: null }), false, "F. null");
  assert.equal(cas({ phase: "" }), false, "G. vide");
  assert.equal(cas({ phase: "phase_inventee" }), false, "hors du vocabulaire fermé");
  for (const p of OPERATIONAL_REQUEST_PHASES) assert.equal(cas({ phase: p }), true, `${p} accepté`);
});

test("OBS01-28 : http_status — absent, null ou non entier valide rend journal_complete=false", () => {
  const { http_status, ...sans } = valideRecord();
  assert.equal(buildTerminalRecord(sans).journal_complete, false, "H. absent");
  assert.equal(cas({ http_status: null }), false, "I. null");
  assert.equal(cas({ http_status: "200" }), false, "J. chaîne");
  assert.equal(cas({ http_status: 200.5 }), false, "J. non entier");
  assert.equal(cas({ http_status: 99 }), false, "hors plage basse");
  assert.equal(cas({ http_status: 600 }), false, "hors plage haute");
});

test("OBS01-29 : terminal_event — la validation exige l'égalité à true, jamais la présence", () => {
  /* buildTerminalRecord force terminal_event=true : la vacuité se teste donc sur le prédicat
     lui-même, qui est ce que le contrat protège réellement. */
  assert.equal(computeJournalComplete({ ...valideRecord(), terminal_event: false }), false, "K. false");
  assert.equal(computeJournalComplete({ ...valideRecord(), terminal_event: "true" }), false, "K. chaîne");
  assert.equal(computeJournalComplete({ ...valideRecord(), terminal_event: 1 }), false, "K. entier");
  const { terminal_event, ...sans } = valideRecord();
  assert.equal(computeJournalComplete(sans), false, "K. absent");
});

test("OBS01-30 : validate sans aucune tentative fournisseur reste COMPLET (L)", async () => {
  const fp = await safeErrorFingerprint(new Error("entrée invalide"));
  const r = buildTerminalRecord({ ...valideRecord(), phase: "validate", role: null, http_status: 400,
    provider: null, model: null, provider_attempt_index: null,
    semantic_state: null, error_class: "http_error", untagged_exception: false, safe_error_fingerprint: fp });
  assert.equal(r.journal_complete, true, "aucun fournisseur n'a été appelé : rien ne manque");
  assert.equal(providerAttemptOccurred(r), false);
});

test("OBS01-31 : dès qu'une tentative a eu lieu, provider/model/index deviennent EXIGÉS (M, N, O, P)", () => {
  const avecTentative = { provider: "anthropic", model: "claude-sonnet-4-6", provider_attempt_index: 0 };
  assert.equal(cas(avecTentative), true, "P. tentative valide");
  assert.equal(cas({ ...avecTentative, provider: null }), false, "M. provider manquant");
  assert.equal(cas({ ...avecTentative, provider: "" }), false, "M. provider vide");
  assert.equal(cas({ ...avecTentative, model: null }), false, "N. modèle manquant");
  assert.equal(cas({ ...avecTentative, model: "  " }), false, "N. modèle blanc");
  assert.equal(cas({ ...avecTentative, provider_attempt_index: -1 }), false, "O. index négatif");
  assert.equal(cas({ ...avecTentative, provider_attempt_index: 1.5 }), false, "O. index non entier");
  assert.equal(cas({ ...avecTentative, provider_attempt_index: "0" }), false, "O. index non numérique");
});

test("OBS01-32 : un 5xx non étiqueté doit porter ses preuves d'attribution (Q, R)", async () => {
  const fp = await safeErrorFingerprint(new Error("x"));
  const base = { phase: "critic", role: "critic", http_status: 502, semantic_state: null,
    error_class: "untagged", untagged_exception: true, safe_error_fingerprint: fp };
  assert.equal(cas(base), true, "R. 502 non étiqueté valide");
  assert.equal(cas({ ...base, safe_error_fingerprint: null }), false, "Q. empreinte absente");
  assert.equal(cas({ ...base, safe_error_fingerprint: { error_name: "Error" } }), false, "Q. empreinte tronquée");
  assert.equal(cas({ ...base, safe_error_fingerprint: { ...fp, message_sha256: "pas-un-hash" } }), false, "Q. empreinte malformée");
  assert.equal(cas({ ...base, error_class: null }), false, "une erreur HTTP sans classe n'est pas attribuable");
  assert.equal(cas({ ...base, error_class: "autre_chose" }), false, "untagged_exception=true exige error_class=\"untagged\"");
});

test("OBS01-33 : un 200 n'a aucune preuve d'erreur à fournir — succès et degraded_state (S, T)", () => {
  const succes = { phase: "state_check", role: "arbiter", http_status: 200,
    semantic_state: "operational_request_ready", error_class: null, untagged_exception: false,
    safe_error_fingerprint: null };
  assert.equal(cas(succes), true, "T. succès complet sans champs d'erreur");
  const degrade = { ...succes, phase: "critic", role: "critic", semantic_state: "degraded_state",
    provider: "anthropic", model: "claude-sonnet-4-6", provider_attempt_index: 1,
    fallback_path: [{ from: "groq", to: "anthropic", failure_class: "technical_failover" }] };
  assert.equal(cas(degrade), true, "S. degraded_state avec panne fournisseur étiquetée");
  assert.equal(cas({ ...degrade, model: null }), false, "S. mais la tentative reste exigeante");
});

test("OBS01-34 : les prédicats de validité sont exacts, isolément", () => {
  assert.equal(isNonEmptyString("a"), true); assert.equal(isNonEmptyString(" "), false);
  assert.equal(isNonEmptyString(null), false); assert.equal(isNonEmptyString(1), false);
  assert.equal(isValidHttpStatus(200), true); assert.equal(isValidHttpStatus(502), true);
  assert.equal(isValidHttpStatus(null), false); assert.equal(isValidHttpStatus(99), false);
  assert.equal(isValidHttpStatus(Number.NaN), false);
  assert.equal(isValidAttemptIndex(0), true); assert.equal(isValidAttemptIndex(-1), false);
  assert.equal(isValidAttemptIndex(null), false);
  assert.equal(isValidErrorFingerprint({ error_name: "Error", message_sha256: "a".repeat(64), frame_count: 3 }), true);
  assert.equal(isValidErrorFingerprint({ error_name: "", message_sha256: "a".repeat(64), frame_count: 3 }), false);
  assert.equal(isValidErrorFingerprint(null), false);
  assert.equal(computeJournalComplete(null), false, "un non-objet n'est jamais complet");
});

test("OBS01-23 : tous les champs de trace obligatoires sont présents sur les trois chemins terminaux", async () => {
  const chemins = [
    { nom: "succès", executeRole: okRoles() },
    { nom: "degraded", executeRole: async (role) => { if (role === "critic") throw new ProviderChainError("critic", [{ provider: "anthropic", failure_class: FAILURE_CLASSES.TECHNICAL_FAILOVER }]); return roleOutput(role); } },
    { nom: "502", executeRole: async (role) => { if (role === "critic") throw new Error("x"); return roleOutput(role); } }
  ];
  for (const chemin of chemins) {
    const { terminal } = await run({ executeRole: chemin.executeRole });
    assert.equal(terminal.length, 1, chemin.nom);
    for (const champ of TERMINAL_RECORD_REQUIRED_FIELDS) {
      assert.notEqual(terminal[0][champ], undefined, `${chemin.nom} : champ ${champ} présent`);
    }
    assert.equal(terminal[0].journal_complete, true, chemin.nom);
  }
});

test("OBS01-24 : l'identifiant préfère cf-ray quand il existe, et reste stable", () => {
  const avecRay = new Request("https://x/y", { headers: { "cf-ray": "8abc123def456789-CDG" } });
  assert.equal(resolveInvocationId(avecRay), "8abc123def456789-CDG");
  const sansRay = new Request("https://x/y");
  const genere = resolveInvocationId(sansRay);
  assert.match(genere, /^[0-9a-f-]{36}$/, "sinon un UUID est généré");
  assert.notEqual(genere, resolveInvocationId(sansRay), "deux invocations distinctes ont deux identifiants");
});

test("OBS01-25 : la trace absorbe les événements fournisseur sans instrumenter provider-ha.js", () => {
  const trace = createExecutionTrace({ resolveModel: () => "modele-x" });
  trace.enterPhase("analyst", "analyst");
  trace.observe({ event: "provider_ha_attempt", provider: "anthropic", attempt_index: 0 });
  assert.equal(trace.provider, "anthropic");
  assert.equal(trace.model, "modele-x");
  assert.equal(trace.provider_attempt_index, 0);
  trace.observe({ event: "provider_ha_fallback", fallback_from: "groq", fallback_to: "anthropic", failure_class: "technical_failover" });
  assert.equal(trace.fallback_path.length, 1);
  trace.observe(null);
  trace.observe({ event: "sans_rapport" });
  assert.equal(trace.provider, "anthropic", "un événement étranger ne perturbe rien");
});
