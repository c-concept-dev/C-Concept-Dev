# DEEP-OUTPUT-MINIMALITY-01 — AUDIT ONLY

## Verdict

The minimum safe payload is materially smaller than the current LLM payload. The strongest proof is the Critic batch: each target forces 42 LLM leaves (six families × seven), while `candidate_action` is never read or retained; four normalized Critic fields are already derived deterministically. On slow clarifications the Critic produces 52–86% of all output and A01/A02 create 8/12 material-question issues, yielding 9/13 Critic calls.

No production code was changed and no API was called.

## Git and provenance

- Expected snapshot: `67e5e7583431b2268d7d3cae8c00bb2959bf9a6c`.
- Observed HEAD: `d15e0aed002253680201e2f54d5a434183e9d8d7`.
- `git diff 67e5e75..HEAD -- tools/Atelier Prompts` is empty: no real Atelier divergence.
- Worktree was clean at start.
- The referenced thread exposed the complete mission and checklist but not the attached kit bodies; this limitation is explicit rather than silently treating summaries as the files.

## Exact data flow

1. Analyst produces 29 leaf fields. `validateAnalystOutput` enforces exact roots, candidate shape, provenance, issue taxonomy, question joins, and confirmation booleans. Its complete output is serialized into Critic global, every Critic batch, and Arbiter inputs.
2. Critic global produces 17 leaf fields. It judges provenance/candidate fidelity, missed issues, vetoes, drift and stakes. Code then derives `agreement`.
3. For every material+question issue, Critic batch produces 42 leaves. The Gate reads five booleans and justification non-emptiness, never `candidate_action`. Materialization collapses the seven leaves to `reasonably_available + reason`; code derives `available_alternative`, `why_available`, `question_is_last_resort`, `illegitimate_question_found`, then `agreement`.
4. Arbiter receives full Analyst and Critic outputs, rewrites candidate and issues, and emits 29 leaves. `validateArbiterOutput` makes `state` authoritative and fail-closed. The canonical mapper consumes state, ten candidate fields, all issue fields, intent-preservation and reason; transient question/confirmation/blocked fields stay dialogue-only. `available_inputs` is not mapped.

## Role classifications

| role | total | MUST_KEEP | CAN_COMPACT | DEAD_OR_REDUNDANT | NEEDS_EVIDENCE |
|---|---:|---:|---:|---:|---:|
| Analyst | 29 | 25 | 3 | 0 | 1 |
| Critic global | 17 | 8 | 8 | 0 | 1 |
| Critic batch | 42 | 30 | 6 | 6 | 0 |
| Arbiter | 29 | 24 | 4 | 0 | 1 |

The exhaustive 29-attribute record for every leaf is in `field-registry.json`.

## Machine semantics vs human observability

Machine-critical: Arbiter state; final candidate/issues; next-question text and issue join; READY preservation booleans; provenance source; Critic veto/drift/stakes/missed-issue signals; five batch gate booleans and enough evidence to validate an accepted alternative.

Observability/explainability: most long reasons, drift notes, stakes reason, progress explanations, concerns and repeated descriptions. They should remain available, but current contracts force expansive LLM prose even on negative/empty branches. Codes plus conditional detail can preserve observability without paying unbounded generation each turn.

## Top analyses

### Token drivers

1. `critic_batch.issues[].candidates.*.justification` — six unbounded strings per issue, repeated across up to 12 batches
2. `critic_batch.issues[].candidates.*.candidate_action` — six unbounded strings/nulls per issue; zero consumers
3. `arbiter.operational_request_candidate.*` — full duplicate of Analyst candidate
4. `arbiter.issues[].description` — unbounded repeated issue prose
5. `analyst.provenance_records[].value` — exact candidate value repeated once per material item
6. `analyst.issues[].description` — unbounded and retransmitted to every Critic batch and Arbiter
7. `arbiter.reason` — unbounded observability rationale
8. `critic_global.vetoes[].why_* / new_information_trigger` — three unbounded strings per veto
9. `analyst.question_candidates[].text + expected_progress` — rephrases issue then is repeated by Arbiter
10. `critic_global.semantic_drift_notes / significant_stakes_reason` — conditional explanations but always-shaped roots

### Inter-role duplication

1. candidate: Analyst operational_request_candidate → Arbiter operational_request_candidate → canonical intent/executability
2. issues: Analyst issues → Critic review targets/missed issues/veto ids → Arbiter issues then canonical issue lists
3. candidate value: candidate[field][i] → provenance_records[].value → Critic provenance review
4. question: issues[].description/recommended_treatment → question_candidates[].text/expected_progress → Arbiter next_question
5. substitution verdict: five batch booleans + justification → reasonably_available + available_alternative → question_is_last_resort + illegitimate_question_found
6. readiness rationale: candidate/issues/critic findings → intent_preservation → Arbiter reason
7. material availability: material_context → candidate.available_inputs + provenance → Arbiter rewritten available_inputs
8. semantic drift: semantic_drift_detected → semantic_drift_notes → Arbiter concerns/reason
9. stakes/confirmation: five Analyst booleans + Critic significant_stakes → significant_stakes_reason → Arbiter confirmation_reason
10. veto semantics: missed issue or Analyst issue → veto issue_id + three explanations → Arbiter issues/reason

### Safe compaction

1. Remove six `candidate_action` leaves per reviewed issue; no reader exists.
2. Encode batch rejection/acceptance with bounded reason codes and conditional detail.
3. Replace provenance value copies with explicit candidate field+index references.
4. Let Arbiter adopt Analyst candidate/issues and emit only deltas, then materialize the unchanged public output deterministically.
5. Omit or null explanation branches when their controlling boolean/state is false.
6. Derive non-conflict `kind=null`.
7. Bound `reason`, veto explanations and expected-progress prose.
8. Reuse issue IDs instead of repeating descriptions in reviews.
9. Keep only one authoritative representation of substitution findings; render human text deterministically.
10. Preserve full details only on disagreements/exceptional branches.

### Deterministically derivable

1. `critic.agreement` from vetoes, semantic_drift_detected, missed_material_issues, illegitimate_question_found (already_derived).
2. `critic.question_substitution_review[].question_is_last_resort` from no alternatives_reviewed.*.reasonably_available (already_derived).
3. `critic.illegitimate_question_found` from reviews where question_is_last_resort=false (already_derived).
4. `critic.question_substitution_review[].why_available` from selected alternative justification (already_derived).
5. `issue.kind for non-conflict` from issue.type != conflict => null (safe_candidate).
6. `critic question_substitution_review=[] when N=0` from question review target count (already_derived).
7. `provenance_records[].value` from candidate[field][index] (safe_with_new_explicit_index_contract).
8. `batch available_alternative` from first accepted family in canonical ladder order (already_derived).
9. `batch reasonably_available` from candidate gate verdict (already_derived).
10. `Arbiter unchanged candidate/issues` from Analyst payload plus explicit delta (candidate_needs_parity_evidence).

## Early stop

Full coverage is structurally necessary today, historically entrenched, and observability-complete. It is not semantically necessary for lower-priority issues once the first priority-ordered issue survives the Gate as non-substitutable on a single-question clarification. It remains necessary to prove READY when every candidate blocker must be eliminated. The blocker is exact missing-coverage rejection in `assembleSubstitutionReviews`, reinforced by dynamic schema and tests.

## Scenarios

- clarification évidente: covered_partial — Q01/Q02 historical traces
- clarification ambiguë: covered — Q07/Q08
- READY simple: covered — R01/R03/R09
- READY substantiel: covered — R02/A03
- material present: covered — R08/R09 + material tests
- no material: covered — Q01/Q02
- multiple issues: covered — A01/A02 (8/12 target issues)
- single blocking issue: covered_partial — R08 plus substitution unit tests
- substitution possible: covered_deterministic_not_live — unit tests for availableReview / gate
- substitution impossible: covered_deterministic_not_live — lastResortReview tests
- negative control: covered_outside_12_trace — C8 artifacts and adversarial tests
- confirmation_required: CORPUS_COVERAGE_GAP — validator/unit coverage only; no corpus fixture

## Candidates (maximum five)

### 1. Remove dead candidate_action from every substitution family

Role/fields: CRITIC_BATCH — *.candidate_action. Prompt: SUBSTITUTION_REVIEW_SYSTEM_PROMPT. Schema: buildSubstitutionCandidateJsonSchema. Validator: no semantic validator consumer; fixtures/materializer inputs update. Contract: batch provider shape only; normalized Critic output unchanged. Estimated token gain: 10-20% of batch output; latency: same proportional reduction on batch generation. Semantic risk: LOW-MEDIUM (no data-flow consumer; elicitation effect still requires replay). Reversible: YES. Complexity: LOW. Hardcoding: NO. OPRIE: unchanged.

### 2. Encode substitution verdict compactly and make prose conditional

Role/fields: CRITIC_BATCH — five gate booleans, justification. Prompt: SUBSTITUTION_REVIEW_SYSTEM_PROMPT. Schema: candidate schema. Validator: gate/materializer. Contract: preserve same accepted/rejected reason codes and normalized review. Estimated token gain: 35-55% of batch output; latency: large on A01/A02/Q02. Semantic risk: MEDIUM; parity experiment mandatory. Reversible: YES. Complexity: MEDIUM. Hardcoding: NO. OPRIE: unchanged.

### 3. Replace provenance value duplication with field+index references

Role/fields: ANALYST — provenance_records[].value. Prompt: ANALYST_SYSTEM_PROMPT. Schema: PROVENANCE_RECORD_JSON_SCHEMA. Validator: normalizeProvenanceRecords plus deterministic dereference. Contract: provenance meaning unchanged; transport shape changes. Estimated token gain: 10-25% Analyst depending on candidate density; latency: small-to-medium every turn. Semantic risk: LOW-MEDIUM. Reversible: YES. Complexity: MEDIUM. Hardcoding: NO. OPRIE: unchanged.

### 4. Arbiter adopt-plus-delta instead of full candidate/issues rewrite

Role/fields: ARBITER — operational_request_candidate, issues. Prompt: ARBITER_SYSTEM_PROMPT. Schema: ARBITER_JSON_SCHEMA. Validator: deterministic materialization then existing validateArbiterOutput. Contract: public ArbiterOutput can remain identical after materialization. Estimated token gain: 25-50% Arbiter; latency: material on READY substantive and clarification. Semantic risk: MEDIUM. Reversible: YES. Complexity: MEDIUM-HIGH. Hardcoding: NO. OPRIE: unchanged; Arbiter still chooses deltas and state.

### 5. Conditional coded explanations for global Critic and Arbiter

Role/fields: CRITIC_GLOBAL + ARBITER — semantic_drift_notes, significant_stakes_reason, veto explanations, reason, intent_preservation.concerns. Prompt: global Critic and Arbiter prompts. Schema: both schemas. Validator: conditional validators + deterministic renderer for observability. Contract: retain human observability via codes/detail only when needed. Estimated token gain: 15-35% affected role outputs; latency: medium. Semantic risk: MEDIUM. Reversible: YES. Complexity: MEDIUM. Hardcoding: NO. OPRIE: unchanged.

## Recommended experiment (not run)

Six to eight cases, one role changed at a time. Start with Critic batch dead-field removal, then compact verdict shape only if needed. Cover obvious and ambiguous clarification, simple/substantial READY, material/no-material, substitution possible/impossible, negative control, and confirmation if a valid fixture can be added offline. Require identical final state, next question, provenance/material/readiness invariants; measure output tokens, latency and cost; budget < USD 0.25.

## Final report

DEEP_OUTPUT_MINIMALITY_01_AUDIT_STATUS = COMPLETE_WITH_KIT_ATTACHMENT_PROVENANCE_LIMITATION

HEAD_AUDITED = 67e5e7583431b2268d7d3cae8c00bb2959bf9a6c

WORKTREE_CLEAN_START = YES
WORKTREE_CLEAN_END = NO — REQUESTED AUDIT DELIVERABLES ONLY

PRODUCTION_CODE_CHANGED = NO

API_CALLS = 0

ANALYST_OUTPUT_FIELDS_TOTAL = 29
ANALYST_MUST_KEEP = 25
ANALYST_CAN_COMPACT = 3
ANALYST_DEAD_OR_REDUNDANT = 0

CRITIC_GLOBAL_OUTPUT_FIELDS_TOTAL = 17
CRITIC_GLOBAL_MUST_KEEP = 8
CRITIC_GLOBAL_CAN_COMPACT = 8
CRITIC_GLOBAL_DEAD_OR_REDUNDANT = 0

CRITIC_BATCH_OUTPUT_FIELDS_TOTAL = 42
CRITIC_BATCH_MUST_KEEP = 30
CRITIC_BATCH_CAN_COMPACT = 6
CRITIC_BATCH_DEAD_OR_REDUNDANT = 6

ARBITER_OUTPUT_FIELDS_TOTAL = 29
ARBITER_MUST_KEEP = 24
ARBITER_CAN_COMPACT = 4
ARBITER_DEAD_OR_REDUNDANT = 0

TOP_TOKEN_COST_FIELDS = critic_batch.*.justification; critic_batch.*.candidate_action; arbiter.operational_request_candidate; arbiter.issues[].description; analyst.provenance_records[].value; analyst.issues[].description; arbiter.reason; critic_global.vetoes explanations; analyst.question_candidates text/progress; critic drift/stakes explanations

TOP_DUPLICATED_FACTS = candidate; issues; candidate value/provenance value; issue/question; substitution verdict; readiness rationale; material availability; semantic drift; stakes/confirmation; veto semantics

OBSERVABILITY_ONLY_FIELDS = arbiter.reason; arbiter.next_question.expected_progress; arbiter.operational_request_candidate.available_inputs in current internal mapping; conditional explanation payloads when controlling signal is false

DECISION_CRITICAL_FIELDS = arbiter.state; final candidate/issues; next_question.text+targets_issue_id; intent-preservation booleans; provenance field/source; Critic veto/drift/stakes/missed issues; batch gate booleans and accepted-alternative evidence

DERIVABLE_FIELDS = agreement; question_is_last_resort; illegitimate_question_found; why_available; N=0 review=[]; non-conflict kind=null; batch available_alternative; batch reasonably_available; provenance value via explicit index; unchanged Arbiter candidate/issues via delta materialization

PROMPT_VERBOSITY_DRIVERS = reconstruct entire payload; per-item provenance; six-family exhaustive batch proof; mandatory explanations on negative branches; Arbiter full rewrite plus reason

SCHEMA_VERBOSITY_DRIVERS = 42 batch leaves per issue; required===properties; unbounded strings/arrays; duplicated candidate/issues; all-null/all-empty structural branches

VALIDATOR_CONSTRAINTS = exactKeys; closed enums; question-to-issue joins; question=>material; complete six-family coverage; state-specific Arbiter exclusivity; READY preservation all true; exact batch cardinality

EARLY_STOP_CONTRACT_BLOCKER = assembleSubstitutionReviews missing-target rejection + dynamic required keys + coverage tests

ESTIMATED_ANALYST_OUTPUT_REDUCTION_PERCENT = 20-30

ESTIMATED_CRITIC_OUTPUT_REDUCTION_PERCENT = 45-60

ESTIMATED_ARBITER_OUTPUT_REDUCTION_PERCENT = 30-50

ESTIMATED_TOTAL_DEEP_OUTPUT_REDUCTION_PERCENT = 40-55 ON SLOW CLARIFICATIONS; LOWER ON SIMPLE READY

ESTIMATED_LATENCY_EFFECT = approximately proportional to removed output tokens; 30-50% plausible on slow cases before early-stop, unmeasured

SEMANTIC_RISK = LOW for dead-field removal; MEDIUM for schema compaction until parity experiment

FROZEN_CONTRACT_IMPACT = YES for shape changes; normalized public output can remain unchanged through deterministic materialization

OPRIE_IMPACT = NONE REQUIRED; OPRIE remains sole authority

NEW_AUTHORITY_REQUIRED =
NO

HARDCODING_REQUIRED =
NO

PROMPT_CHANGE_REQUIRED =
YES

SCHEMA_CHANGE_REQUIRED =
YES

VALIDATOR_CHANGE_REQUIRED =
YES (except candidate_action has no semantic reader; fixtures/materializer input contract still change)

BEST_SINGLE_CHANGE = remove critic_batch.issues[].candidates.*.candidate_action from prompt/schema

SECONDARY_CHANGE_IF_NEEDED = compact batch gate proof to bounded verdict/reason codes with conditional detail

EARLY_STOP_AFTER_COMPACTION_STILL_NEEDED =
YES

RECOMMENDED_IMPLEMENTATION_EXPERIMENT = 6-8 cases, Critic batch only first, identical state/question/invariants, measure output tokens/latency/cost

EXPERIMENT_API_BUDGET = < 0.25 USD; NOT AUTHORIZED OR RUN

RECOMMENDED_NEXT_LOT = DEEP-OUTPUT-MINIMALITY-01-IMPLEMENTATION-EXPERIMENT (owner-authorized, Critic batch first)

OWNER_DECISION_REQUIRED = authorize batch contract/schema change and bounded 6-8 case API experiment
