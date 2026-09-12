import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  resolveTimeoutMs,
  DEFAULT_TIMEOUT_MS,
  resolveCases,
  resolveRoles,
  SUPPORTED_ROLE_FILTERS,
  runRole,
  classifyOutcome,
  buildResultKey,
  buildCompletedIndex,
  writeCheckpointSync,
  readCheckpointIfExists,
  buildRunSignature,
  assertCheckpointCompatible,
  describeSigintStatus,
  buildFinalReport,
  aggregate,
  benchmarkAnalystAndCritic
} from "../evaluation/lot10g3b3f3/run-role-benchmark.mjs";
import { CRITIC_SYSTEM_PROMPT, CRITIC_JSON_SCHEMA, parseCriticOutput } from "../workers/shared/operational-request-core.js";

// 3F.3.3-H1 : ce fichier ne fait AUCUN appel réseau réel. globalThis.fetch est systématiquement
// mocké ou remplacé par un rejet simulé. Il couvre exclusivement la fiabilité TECHNIQUE du harnais
// (timeout, progression, checkpoint, reprise, filtres --cases/--roles, SIGINT, format final,
// non-régression du scoring) — aucune assertion ici ne porte sur la sémantique Analyste/Critique/
// Arbitre ni sur B-01/B-02.

function withFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function groqChatResponse(content, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage });
}

function tempCheckpointPath(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "h1-checkpoint-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "run.json.partial.json");
}

const analystOutputStub = {
  operational_request_candidate: {
    objective: "x", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
    confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: []
  },
  provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
  issues: [], question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
};

const criticOutputStub = {
  agreement: "agree",
  operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
  vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
  question_substitution_review: [],
  illegitimate_question_found: []
};

function makeAnalystAndCriticTestCase(id) {
  return {
    id,
    role_under_test: "analyst_and_critic",
    input: { original_request: "Fais-moi un compte rendu.", clarification_history: [] },
    oracle: { analyst: {}, critic: {} }
  };
}

// --- 1. --timeout-ms parsing --------------------------------------------------------------------

test("resolveTimeoutMs : valeur absente retombe sur le défaut technique documenté", () => {
  assert.equal(resolveTimeoutMs(undefined), DEFAULT_TIMEOUT_MS);
});

test("resolveTimeoutMs : valeur numérique explicite est respectée", () => {
  assert.equal(resolveTimeoutMs("15000"), 15000);
  assert.equal(resolveTimeoutMs("1000"), 1000);
});

test("resolveTimeoutMs : une valeur invalide (non numérique ou trop basse) est rejetée explicitement", () => {
  assert.throws(() => resolveTimeoutMs("abc"), /--timeout-ms invalide/);
  assert.throws(() => resolveTimeoutMs("500"), /--timeout-ms invalide/);
  assert.throws(() => resolveTimeoutMs("-1"), /--timeout-ms invalide/);
});

// --- 2/3. --cases parsing ----------------------------------------------------------------------

const corpusCasesFixture = [{ id: "case-a" }, { id: "case-b" }, { id: "case-c" }];

test("resolveCases : liste absente conserve tout le corpus, ordre inchangé", () => {
  assert.deepEqual(resolveCases(corpusCasesFixture, undefined), corpusCasesFixture);
});

test("resolveCases : une liste explicite ne retient que les identifiants demandés", () => {
  assert.deepEqual(resolveCases(corpusCasesFixture, "case-c,case-a"), [{ id: "case-c" }, { id: "case-a" }]);
});

test("resolveCases : un identifiant de cas inconnu est rejeté explicitement", () => {
  assert.throws(() => resolveCases(corpusCasesFixture, "case-a,case-zzz"), /identifiant de cas inconnu "case-zzz"/);
});

// --- 4/5. --roles parsing ----------------------------------------------------------------------

test("resolveRoles : valeur absente sélectionne les trois rôles supportés", () => {
  assert.deepEqual(resolveRoles(undefined), new Set(SUPPORTED_ROLE_FILTERS));
});

test("resolveRoles : une liste explicite ne retient que les rôles demandés", () => {
  assert.deepEqual(resolveRoles("analyst,critic"), new Set(["analyst", "critic"]));
});

test("resolveRoles : un rôle inconnu est rejeté explicitement", () => {
  assert.throws(() => resolveRoles("analyst,bogus"), /--roles invalide : "bogus"/);
});

// --- 6/7. Checkpoint écrit après chaque résultat, contient le résultat complété ------------------

test("checkpoint : un point de reprise est écrit après chaque résultat complété et contient les lignes produites", async (t) => {
  withFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    const isAnalyst = body.response_format.json_schema.name === "oprie_analyst";
    return groqChatResponse(isAnalyst ? analystOutputStub : criticOutputStub);
  });

  const checkpointPath = tempCheckpointPath(t);
  const results = [];
  let checkpointWrites = 0;
  const onResult = async (row) => {
    checkpointWrites += 1;
    writeCheckpointSync(checkpointPath, { completed: results.slice(), last_row: row });
  };

  const testCase = makeAnalystAndCriticTestCase("case-checkpoint");
  await benchmarkAnalystAndCritic(testCase, "groq", results, { onResult });

  assert.ok(checkpointWrites > 0, "au moins un résultat doit déclencher une écriture de checkpoint.");
  assert.equal(checkpointWrites, results.length, "un checkpoint doit être écrit exactement une fois par résultat complété, jamais groupé.");
  assert.ok(fs.existsSync(checkpointPath), "le fichier de checkpoint doit exister sur disque après la première écriture.");

  const onDisk = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  assert.equal(onDisk.completed.length, results.length);
  assert.ok(onDisk.completed.some((row) => row.case_id === "case-checkpoint" && row.role === "analyst"));
  assert.ok(onDisk.completed.some((row) => row.case_id === "case-checkpoint" && row.role === "critic"));
});

test("writeCheckpointSync : écriture atomique (fichier temporaire puis renommage), jamais de .tmp résiduel en cas de succès", (t) => {
  const checkpointPath = tempCheckpointPath(t);
  writeCheckpointSync(checkpointPath, { hello: "world" });
  assert.ok(fs.existsSync(checkpointPath));
  assert.equal(fs.existsSync(`${checkpointPath}.tmp`), false, "le fichier temporaire ne doit jamais subsister après un renommage réussi.");
  assert.deepEqual(readCheckpointIfExists(checkpointPath), { hello: "world" });
});

test("readCheckpointIfExists : renvoie null quand aucun point de reprise n'existe (jamais une erreur)", (t) => {
  const checkpointPath = tempCheckpointPath(t);
  assert.equal(readCheckpointIfExists(checkpointPath), null);
});

// --- 8. Reprise : un résultat déjà complété n'est jamais rejoué ---------------------------------

test("resume : aucun appel réseau n'est effectué pour un cas dont toutes les répétitions sont déjà dans le point de reprise", async (t) => {
  let fetchCalls = 0;
  withFetch(t, async () => { fetchCalls += 1; throw new Error("ne doit jamais être appelé : tout est déjà complété."); });

  const results = [];
  const completedRows = [];
  for (let run = 1; run <= 3; run += 1) {
    completedRows.push({ case_id: "case-resume-full", role: "analyst", provider: "groq", run, valid_json: true, __output: analystOutputStub });
    completedRows.push({ case_id: "case-resume-full", role: "critic", provider: "groq", run, valid_json: true, __output: criticOutputStub });
  }
  const completedIndex = buildCompletedIndex(completedRows);

  const testCase = makeAnalystAndCriticTestCase("case-resume-full");
  const outputs = await benchmarkAnalystAndCritic(testCase, "groq", results, { completedIndex });

  assert.equal(fetchCalls, 0, "un appel déjà présent dans le point de reprise ne doit jamais être rejoué.");
  assert.equal(results.length, 0, "aucune nouvelle ligne de résultat ne doit être poussée pour un travail déjà entièrement complété.");
  assert.equal(outputs.length, 3, "les sorties Analyste déjà complétées restent disponibles pour la dépendance Critique/agrégation.");
});

// --- 9. Reprise : un appel manquant est exécuté -------------------------------------------------

test("resume : seuls les appels manquants sont exécutés, les répétitions déjà complétées ne déclenchent aucun appel", async (t) => {
  const calledRoles = [];
  withFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    const role = body.response_format.json_schema.name.replace("oprie_", "");
    calledRoles.push(role);
    return groqChatResponse(role === "analyst" ? analystOutputStub : criticOutputStub);
  });

  const results = [];
  const completedRows = [];
  for (let run = 1; run <= 2; run += 1) {
    completedRows.push({ case_id: "case-resume-partial", role: "analyst", provider: "groq", run, valid_json: true, __output: analystOutputStub });
    completedRows.push({ case_id: "case-resume-partial", role: "critic", provider: "groq", run, valid_json: true, __output: criticOutputStub });
  }
  const completedIndex = buildCompletedIndex(completedRows);

  const testCase = makeAnalystAndCriticTestCase("case-resume-partial");
  await benchmarkAnalystAndCritic(testCase, "groq", results, { completedIndex });

  assert.deepEqual(calledRoles, ["analyst", "critic"], "seule la 3e répétition (manquante) doit produire un appel réseau, dans l'ordre analyste puis critique.");
  assert.equal(results.length, 2, "exactement les deux nouvelles lignes (analyste + critique de la répétition manquante) sont ajoutées.");
  assert.equal(results[0].run, 3);
  assert.equal(results[1].run, 3);
});

// --- 10. Une reprise incompatible est refusée ----------------------------------------------------

test("assertCheckpointCompatible : accepte une signature de reprise identique", () => {
  const signature = buildRunSignature({ provider: "groq", repetitions: 1, casesFilter: null, rolesFilter: null, timeoutMs: 60000, corpusCases: 15 });
  assert.doesNotThrow(() => assertCheckpointCompatible({ run_signature: signature }, signature));
});

test("assertCheckpointCompatible : refuse une reprise dont les paramètres structurants diffèrent", () => {
  const stored = buildRunSignature({ provider: "groq", repetitions: 1, casesFilter: null, rolesFilter: null, timeoutMs: 60000, corpusCases: 15 });
  const current = buildRunSignature({ provider: "groq", repetitions: 3, casesFilter: null, rolesFilter: null, timeoutMs: 60000, corpusCases: 15 });
  assert.throws(() => assertCheckpointCompatible({ run_signature: stored }, current), /--resume refusé/);
});

// --- 11. Un timeout simulé produit une erreur contrôlée, jamais un blocage ----------------------

test("runRole : un abandon par timeout (AbortSignal.timeout) produit un résultat contrôlé error_kind=\"timeout\", jamais un blocage", async (t) => {
  withFetch(t, async () => { throw Object.assign(new Error("This operation was aborted due to timeout"), { name: "TimeoutError" }); });

  const result = await runRole("critic", "groq", CRITIC_SYSTEM_PROMPT, "{}", CRITIC_JSON_SCHEMA, parseCriticOutput);

  assert.equal(result.valid_json, false);
  assert.equal(result.error_kind, "timeout");
  assert.equal(classifyOutcome(result), "TIMEOUT");
  assert.ok(result.provider_error, "un message d'erreur exploitable doit accompagner le timeout.");
});

test("classifyOutcome : distingue OK / ERROR / TIMEOUT / RATE_LIMIT sur des bases purement structurelles", () => {
  assert.equal(classifyOutcome({ valid_json: true }), "OK");
  assert.equal(classifyOutcome({ valid_json: false, error_kind: "timeout" }), "TIMEOUT");
  assert.equal(classifyOutcome({ valid_json: false, error_kind: "http_429" }), "RATE_LIMIT");
  assert.equal(classifyOutcome({ valid_json: false, error_kind: "http_other" }), "ERROR");
  assert.equal(classifyOutcome({ valid_json: false, error_kind: "json_error" }), "ERROR");
});

// --- 12. SIGINT : l'état déjà sauvegardé reste décrivable sans envoyer un vrai signal -----------

test("describeSigintStatus : rapporte le nombre de résultats déjà sauvegardés et le chemin du point de reprise", () => {
  const message = describeSigintStatus([{}, {}, {}], "/tmp/x/run.json.partial.json");
  assert.match(message, /3 résultat/);
  assert.match(message, /\/tmp\/x\/run\.json\.partial\.json/);
  assert.match(message, /--resume/);
});

// --- 13. Le format de sortie final est préservé ---------------------------------------------------

test("buildFinalReport : préserve exactement la structure existante du rapport final", () => {
  const notExecuted = [{ provider: "workers-ai", reason: "absent" }];
  const summary = [{ role: "analyst", provider: "groq" }];
  const results = [{ case_id: "case-a", role: "analyst" }];
  const report = buildFinalReport({ repetitions: 3, corpusCasesCount: 15, notExecuted, summary, results });

  assert.deepEqual(
    Object.keys(report).sort(),
    ["corpus_cases", "generated_at", "lot", "providers_not_executed", "raw_results", "repetitions", "summary", "version"].sort()
  );
  assert.equal(report.version, "1.0");
  assert.equal(report.lot, "10G.3B.3F.3.3");
  assert.equal(report.repetitions, 3);
  assert.equal(report.corpus_cases, 15);
  assert.equal(report.providers_not_executed, notExecuted);
  assert.equal(report.summary, summary);
  assert.equal(report.raw_results, results);
  assert.ok(!Number.isNaN(Date.parse(report.generated_at)));
});

// --- 14. Aucun changement de score pour des raw_results identiques (non-régression scientifique) ---

test("aggregate : résultat exactement inchangé pour un jeu de raw_results fixe (non-régression B-01/B-02)", () => {
  const rows = [
    {
      case_id: "case-1", role: "analyst", provider: "groq", run: 1, valid_json: true, elapsed_ms: 100,
      score: { pass: true, criteria: [{ criterion: "c1", pass: true }] }, cost_usd: 0.001,
      __output: { issues: [], question_candidates: [] }
    },
    {
      case_id: "case-1", role: "analyst", provider: "groq", run: 2, valid_json: true, elapsed_ms: 200,
      score: { pass: false, criteria: [{ criterion: "c1", pass: false }] }, cost_usd: 0.002,
      __output: { issues: [], question_candidates: [] }
    }
  ];

  const expectedSignature = JSON.stringify({ materialTypes: [], questionCount: 0 });
  assert.deepEqual(aggregate("analyst", "groq", rows), {
    role: "analyst",
    provider: "groq",
    cases: 2,
    valid_json_pct: 100,
    pass_pct: 50,
    failed_criteria_counts: { c1: 1 },
    latency_median_ms: 100,
    latency_p90_ms: 200,
    cost_usd_total_estimate: 0.003,
    stability_by_case: [{ case_id: "case-1", evaluable: true, stable: true, agreement_ratio: 1, signatures: [expectedSignature, expectedSignature] }]
  });

  // Rejouer avec exactement les mêmes raw_results doit produire un résultat rigoureusement identique.
  assert.deepEqual(aggregate("analyst", "groq", rows), aggregate("analyst", "groq", rows));
});
