"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/stage-ef01.js
 * Etapes DISCIPLINES et PLAN : composition des coeurs du kit d'exploitation r1.3 (vendor/) et des lots geles.
 *   - EF-01B resolveur (LLM reel via MONO-04) -> disciplines PROPOSEES ;
 *   - RunContract AUTOMATIQUE, politique AUTO_RETAIN_VALID_PROPOSALS (mecanisme gele R6 : buildRunContractDraft +
 *     confirmRunContract ; commentaire de provenance constant ; une ambiguite BLOQUANTE arrete le run : jamais resolue en silence) ;
 *   - EF-01C1 planificateur (LLM reel) -> plan de recherche ;
 *   - CONFIRMATION UTILISATEUR (acte humain REEL, exige par le contrat gele MONO-08 v0.6 en mode REAL) -> SearchProtocol,
 *     eForchProvenance, ExecutionMission.
 * L'utilisateur ne choisit ni discipline ni professionnel : il confirme la mission reformulee et le plan, une fois.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const P = require("./paths.js");
const K = (f) => require(path.join(P.KIT, f));
const { wrapMono04 } = require("./mono04-fence-adapter.js");
/** MONO-04 reel + adaptateur additif de cloture Markdown (journalise dans le run) */
/** Modele reel du kit EF-01 (LLM_REAL_MODEL, exige explicite par EF-01C1) : choix du proprietaire porte par la configuration du produit, jamais un defaut herite. */
function ensureRealModel() { const m = process.env.EVIDENCEFORGE_LLM_MODEL || P.CONFIG.llm.model; if (!process.env.LLM_REAL_MODEL) process.env.LLM_REAL_MODEL = m; return process.env.LLM_REAL_MODEL; }
function assertObservedModel(provenance, expected, label) { const obs = provenance && provenance.model; if (!obs || String(obs).indexOf(expected) !== 0) { const e = new Error("MODEL_PROVENANCE_MISMATCH: " + label + " observe \"" + obs + "\", attendu \"" + expected + "\""); e.code = "MODEL_PROVENANCE_MISMATCH"; e.userMessage = "Le modèle d'analyse réellement utilisé ne correspond pas à celui configuré : le run s'arrête (aucun résultat produit sur un modèle non choisi)."; throw e; } }
const realMono04 = (runDir) => wrapMono04(K("build-real-mono04.js").buildRealMono04(P.BUNDLE, process.env), { recordsPath: path.join(runDir, "ef01-evidence", "fence-normalization-records.jsonl"), rawDir: path.join(runDir, "ef01-evidence", "raw-original") });
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const AUTO_CONFIRMATION_COMMENT = "Confirmation automatique — aucune revue humaine effectuée. Politique AUTO_RETAIN_VALID_PROPOSALS.";
const FORBIDDEN_HUMAN_KEYS = ["decidedBy", "decidedAt"];
function assertNoHumanAttribution(obj, label) { const t = JSON.stringify(obj || {}); FORBIDDEN_HUMAN_KEYS.forEach((k) => { if (t.indexOf("\"" + k + "\"") !== -1) throw Object.assign(new Error("HUMAN_ATTRIBUTION_ON_AUTO_PATH: " + label + " porte \"" + k + "\""), { code: "HUMAN_ATTRIBUTION_ON_AUTO_PATH" }); }); }


/* Codes de SORTIE FOURNISSEUR invalide sur le chemin kit (garde gele EF-01B/EF-01C1) : un nouvel appel reel peut reussir. */
const KIT_RETRYABLE = ["PLANNER_OUTPUT_INVALID", "RESOLVER_OUTPUT_INVALID", "LLM_RESPONSE_INVALID", "LLM_OUTPUT_SCHEMA_INVALID"];
const KIT_USER_MESSAGES = {
  PLANNER_OUTPUT_INVALID: "Le fournisseur d'analyse a produit un plan de recherche non conforme au contrat (le contrôle strict d'EvidenceForge l'a refusé).",
  RESOLVER_OUTPUT_INVALID: "Le fournisseur d'analyse a produit une liste d'angles d'expertise non conforme au contrat (refusée par le contrôle strict).",
  LLM_RESPONSE_INVALID: "Le fournisseur d'analyse a répondu dans un format non exploitable (refusé par le contrôle strict).",
  LLM_OUTPUT_SCHEMA_INVALID: "Le fournisseur d'analyse a répondu hors du schéma attendu (refusé par le contrôle strict).",
};
/**
 * kitAttempts({ runDir, label, maxAttempts, onAttempt(n) , call(evidenceRoot, attemptNo) })
 * Reprise BORNEE et CONSCIENTE DE L'ERREUR autour d'un appel du kit gele : chaque tentative a son propre dossier de preuves
 * (ef01-evidence/<label>/attempt-<n>/, jamais ecrase), l'erreur de la tentative precedente est consignee dans attempts.jsonl,
 * onAttempt est appele AVANT chaque appel reel (compteurs exacts meme en cas d'echec). Le prompt gele EF-01B/EF-01C1 ne peut
 * pas recevoir l'erreur (lot gele) : la reprise est informee au niveau de l'orchestrateur, pas du prompt — limite declaree.
 * Apres maxAttempts echecs : fail-closed, erreur avec message utilisateur et nombre de tentatives.
 */
async function kitAttempts(opts) {
  const max = Math.max(1, Number(opts.maxAttempts || P.CONFIG.llm.kitMaxAttempts || 3));
  const base = path.join(opts.runDir, "ef01-evidence", opts.label); fs.mkdirSync(base, { recursive: true });
  const journal = path.join(base, "attempts.jsonl");
  const prior = fs.existsSync(journal) ? fs.readFileSync(journal, "utf8").trim().split("\n").filter(Boolean).length : 0;   // tentatives d'executions anterieures (reprise) : jamais ecrasees
  let lastErr = null;
  for (let i = 1; i <= max; i++) {
    const n = prior + i; const evidenceRoot = path.join(base, "attempt-" + n);
    if (opts.onAttempt) await opts.onAttempt(n);
    const rec = { attempt: n, at: new Date().toISOString(), evidenceDir: path.relative(opts.runDir, evidenceRoot), informedByPreviousError: lastErr ? { code: lastErr.code, message: String(lastErr.message).slice(0, 500) } : null };
    try { const r = await opts.call(evidenceRoot, n); rec.outcome = "SUCCESS"; fs.appendFileSync(journal, JSON.stringify(rec) + "\n"); return Object.assign({ attemptNo: n, attemptsThisExecution: i }, r); }
    catch (e) { rec.outcome = "FAILED"; rec.code = e.code || null; rec.message = String(e.message).slice(0, 800); fs.appendFileSync(journal, JSON.stringify(rec) + "\n");
      if (KIT_RETRYABLE.indexOf(e.code) === -1) throw e; lastErr = e; }
  }
  const e = new Error(lastErr.code + ": " + max + " tentative(s) refusee(s) par le garde gele — " + lastErr.message); e.code = lastErr.code; e.attempts = max;
  e.userMessage = (KIT_USER_MESSAGES[lastErr.code] || "Le fournisseur d'analyse a produit une sortie non conforme.") + " EvidenceForge a réessayé " + max + " fois sans succès et s'arrête proprement (rien n'est inventé). Vous pouvez reprendre le run : de nouvelles tentatives seront faites.";
  throw e;
}

/**
 * requestAsDocument(question) : sans document fourni, la DEMANDE CONFIRMEE de l'utilisateur est le document examine (texte reel
 * de l'utilisateur, jamais fabrique). Elle est declaree DES le RunContract (perimetre.documentsAudites) avec le meme nom et le
 * meme hash que la cible d'execution : le contrat gele EF-01A exige une cardinalite exacte entre documentsAudites et
 * targetDocuments (v1.0 la declarait seulement a la confirmation => CORPUS_NOT_BUILT sur le parcours « question seule », corrige en v1.0.1).
 */
function requestAsDocument(question) {
  const bytes = Buffer.from(String(question), "utf8");
  return { documentId: "doc-demande", name: "Demande confirmée.txt", content: String(question), contentBase64: bytes.toString("base64"), sha256: sha(bytes), bytes: bytes.length, synthesizedFromUserRequest: true };
}
/** Documents effectivement examines : ceux de l'utilisateur, sinon sa demande. Utilise a l'identique par DISCIPLINES et par la confirmation. */
function effectiveDocuments(documents, question) { return (documents && documents.length) ? documents : [requestAsDocument(question)]; }

/** DISCIPLINES : resolveur + RunContract automatique. Rend { resolver, runContract, autoSource } ou leve DISCIPLINES_BLOCKING_AMBIGUITY. */
async function runDisciplines(input) {
  const { runResolverCore } = K("run-resolver-core.js");
  const { deriveAutoIncludedDisciplineIds, POLICY } = K("derive-auto-included-discipline-ids.js"), { buildRunContractDraftCore } = K("build-runcontract-draft-core.js");
  const model = ensureRealModel(); const mono04 = realMono04(input.runDir);
  const documents = effectiveDocuments(input.documents, input.missionQuestion);
  const resolver = await kitAttempts({ runDir: input.runDir, label: "resolver", onAttempt: input.onAttempt, call: (evidenceRoot) => runResolverCore({ bundleRoot: P.BUNDLE, ef01bRoot: P.EF01B, mono04: mono04, missionContext: { runId: input.runId, missionId: input.missionId },
    missionQuestion: input.missionQuestion, targetDocuments: documents.map((d) => ({ documentId: d.documentId, title: d.name })), suppliedEvidence: [],
    technicalProposalLimit: input.technicalProposalLimit || 10, classification: "PROVIDER_OBSERVED_CALL", evidenceRoot: evidenceRoot }) });
  assertObservedModel(resolver.provenance, model, "resolveur");
  fs.writeFileSync(path.join(resolver.evidenceDir, "resolver-runs.json"), JSON.stringify(resolver.resolverRuns, null, 2) + "\n");
  const resolverOutput = JSON.parse(fs.readFileSync(path.join(resolver.evidenceDir, "resolver-output.json"), "utf8"));
  const derived = deriveAutoIncludedDisciplineIds(resolverOutput);
  if (!derived.disciplineIds.length) { const e = new Error("NO_DISCIPLINE_PROPOSED"); e.code = "NO_DISCIPLINE_PROPOSED"; e.userMessage = "EvidenceForge n'a identifié aucun angle d'expertise exploitable pour cette demande. Le run s'arrête (aucune discipline n'est inventée)."; throw e; }
  const documentsDetectes = documents.map((d) => ({ nom: d.name, type: (d.name.match(/\.md$/i) ? "markdown" : "texte"), hashSha256: d.sha256 }));
  const draft = buildRunContractDraftCore({ bundleRoot: P.BUNDLE, missionQuestion: input.missionQuestion, documentsDetectes: documentsDetectes, sourcesFournies: [],
    storedProposals: resolverOutput.proposals, includedDisciplineIds: derived.disciplineIds, niveauRevue: "standard", webPublicActive: false, governanceRef: input.governanceRef || null });
  const blocking = ((draft.perimetre && draft.perimetre.ambiguitesSignalees) || []).filter((a) => a.requiresResolution);
  const autoSource = { schema: "EvidenceForge.RunContractAutoSource", schemaVersion: "r1.3", policy: derived.policy, resolverOutputHash: derived.resolverOutputHash, disciplineIds: derived.disciplineIds,
    documentsDetectes: documentsDetectes, runId: draft.runId, humanReviewPerformed: false };
  if (blocking.length) {
    const e = new Error("DISCIPLINES_BLOCKING_AMBIGUITY: " + blocking.map((a) => a.type + " : " + a.message).join(" ; ")); e.code = "DISCIPLINES_BLOCKING_AMBIGUITY";
    e.userMessage = "Les angles d'expertise proposés comportent une ambiguïté que EvidenceForge ne tranche jamais seul : " + blocking.map((a) => a.message).join(" ; ") + ". Reformulez votre demande pour la lever.";
    e.details = { blocking, draft }; throw e;
  }
  assertNoHumanAttribution(autoSource, "autoSource"); assertNoHumanAttribution(draft, "draft");
  const { confirmRunContract } = require(path.join(P.MONO01, "dependencies", "ef-orch-runcontract-v0.1.js"));
  const runContract = await confirmRunContract(draft, { commentaire: AUTO_CONFIRMATION_COMMENT, resolutions: {} });
  assertNoHumanAttribution(runContract, "runContract");
  if (POLICY !== derived.policy) throw new Error("POLICY_MISMATCH");
  return { resolver: { resolverOutputHash: resolver.resolverOutputHash, provenance: resolver.provenance, proposals: resolverOutput.proposals, resolverRuns: resolver.resolverRuns, evidenceDir: path.relative(input.runDir, resolver.evidenceDir) },
    attemptNo: resolver.attemptNo, runContract: runContract, autoSource: autoSource, disciplinesRetenues: runContract.disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => ({ id: d.id, label: d.discipline, justification: d.justification })) };
}

/** PLAN : planificateur EF-01C1 (LLM reel). Rend { plannerRun, plannerOutput, provenance }. */
async function runPlanner(input) {
  const { runPlannerCore } = K("run-planner-core.js"), { assertRunContractConfirmed } = K("assert-runcontract-confirmed.js");
  const retenues = assertRunContractConfirmed(input.runContract);
  const model = ensureRealModel(); const mono04 = realMono04(input.runDir);
  const r = await kitAttempts({ runDir: input.runDir, label: "planner", onAttempt: input.onAttempt, call: (evidenceRoot) => runPlannerCore({ bundleRoot: P.BUNDLE, ef01c1Root: P.EF01C1, mono04: mono04, missionContext: { runId: input.runId, missionId: input.missionId }, missionQuestion: input.missionQuestion,
    runContractHash: input.runContract.runContractHash, resolvedDisciplines: retenues.map((d) => ({ id: d.discipline, label: d.discipline, rationale: d.justification })),
    resolverOutputHash: input.resolverOutputHash, classification: "PROVIDER_OBSERVED_CALL", evidenceRoot: evidenceRoot }) });
  assertObservedModel(r.provenance, model, "planificateur");
  fs.writeFileSync(path.join(r.evidenceDir, "planner-run.json"), JSON.stringify(r.plannerRun, null, 2) + "\n");
  return { attemptNo: r.attemptNo, plannerRun: r.plannerRun, plannerOutput: r.plannerOutput, provenance: r.provenance, evidenceDir: path.relative(input.runDir, r.evidenceDir),
    userView: { requetes: (r.plannerOutput.queries || r.plannerOutput.requetesExactes || r.plannerOutput.requetes || []), raw: r.plannerOutput } };
}

/**
 * confirmPlan : ACTE HUMAIN REEL de l'utilisateur (clic « Confirmer et lancer ») -> HumanSearchProtocolValidation
 * (validatedBy = identite saisie par l'utilisateur, jamais un defaut), SearchProtocol (mecanisme gele MONO-08 v0.6,
 * mode REAL), eForchProvenance, ExecutionMission (documents utilisateur ou, a defaut, la demande confirmee comme cible).
 */
async function confirmPlan(input) {
  const { buildSearchProtocolCore } = K("build-searchprotocol-core.js"), { buildEForchProvenance } = K("build-eforch-provenance.js"), { filterAndOrderResolverRuns } = K("filter-resolver-runs-by-runcontract.js");
  const who = String(input.validatedBy || "").trim();
  if (who.length < 2) { const e = new Error("HUMAN_IDENTITY_REQUIRED"); e.code = "HUMAN_IDENTITY_REQUIRED"; e.userMessage = "Indiquez votre nom : la confirmation du plan est un acte humain réel, enregistré à votre nom."; throw e; }
  const validation = { schema: "EvidenceForge.HumanSearchProtocolValidation", plannerInputHash: input.planner.provenance.inputHash, plannerRawResponseHash: input.planner.provenance.rawResponseHash,
    decision: "approved", validatedBy: who, validatedAt: new Date().toISOString(), commentaire: String(input.commentaire || "").trim() || ("Plan de recherche confirmé par " + who + " dans EvidenceForge MONOLITH v1.0 après lecture de la mission reformulée, des angles d'expertise et du plan.") };
  const searchProtocol = await buildSearchProtocolCore({ bundleRoot: P.BUNDLE, missionId: input.missionId, runContract: input.runContract, plannerRun: input.planner.plannerRun, plannerOutput: input.planner.plannerOutput, plannerProvenance: input.planner.provenance, validation: validation });
  const resolverRuns = filterAndOrderResolverRuns(input.resolverRuns, input.runContract);
  const provenance = buildEForchProvenance({ resolverRuns: resolverRuns, plannerRun: input.planner.plannerRun, plannerOutput: input.planner.plannerOutput, humanValidation: { validatedAt: validation.validatedAt, commentaire: validation.commentaire } });
  const docs = effectiveDocuments(input.documents, input.missionQuestion);
  const executionMission = { schema: "EvidenceForge.ExecutionMission", schemaVersion: "MONO-08-v0.7", missionId: input.missionId, question: input.missionQuestion, readyForExecution: true, dimensions: [],
    targetDocuments: docs.map((d) => ({ documentId: d.documentId, title: d.name, url: "evidenceforge-local://" + d.documentId, status: "VERIFIED", content: d.content, contentBase64: d.contentBase64, hashSha256: d.sha256 })),
    note: docs[0].synthesizedFromUserRequest ? "Aucun document fourni : la demande confirmee par l'utilisateur est la cible examinee (texte reel de l'utilisateur, jamais fabrique)." : "Documents fournis par l'utilisateur, octets haches, jamais modifies.", generatedAt: new Date().toISOString() };
  return { validation, searchProtocol, provenance, executionMission };
}

module.exports = { runDisciplines, runPlanner, confirmPlan, requestAsDocument, effectiveDocuments, kitAttempts, KIT_RETRYABLE, KIT_USER_MESSAGES, AUTO_CONFIRMATION_COMMENT, ensureRealModel, assertObservedModel };
