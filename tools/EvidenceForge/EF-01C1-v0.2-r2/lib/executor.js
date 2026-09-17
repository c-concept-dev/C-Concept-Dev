"use strict";
// EF-01C1-v0.2-r1 — lib/executor.js — acquirePlannerRun()
//
// F-07 (MAJOR, ferme) : exige desormais resolverOutputHash +
// resolvedDisciplines[] (contenu REEL du resolver, jamais un simple
// compteur) — inclus a la fois dans canonicalInputObject (garantie
// cryptographique) et dans le texte du prompt (garantie lisible), voir
// prompts/ef01c1-planner-prompt-v0.2-r1.js.
//
// F-03/F-04/F-06 (fermes) : delegue a lib/real-llm-call.js, identique a
// EF-01B-v0.2-r1 (meme wrapper, duplique intentionnellement par lot).
//
// F-05 (ferme) : rawResponseHashScope = "assistant_text", explicite.
//
// NOTE : contrairement a EF-01B (F-02), ce module GARDE runContractHash —
// le planificateur s'execute APRES confirmation du RunContract (aucune
// causalite temporelle inversee ici, contrat gele EF-01C1 v0.1 inchange
// sur ce point).

const path = require("path");
const { buildPlannerPrompt, PROMPT_ID, PROMPT_VERSION, PROMPT_TEMPLATE, PROMPT_TEMPLATE_HASH } = require("../prompts/ef01c1-planner-prompt-v0.2-r1.js");
const { loadHashDeps, computeInputHash, computeRawResponseHash, computePromptTemplateHash } = require("./hash.js");
const { parsePlannerResponse } = require("./parser.js");
const { writePlannerEvidence, writeRawProviderEvidence } = require("./evidence-writer.js");
const { ef01c1Error } = require("./errors.js");
const { callTracedRealLlm, resolveEffectiveTransport } = require("./real-llm-call.js");

function loadEForchArtifacts(bundleRoot) {
  return require(path.join(bundleRoot, "MONO-08", "v0.6", "lib", "eforch-artifacts.js"));
}

/**
 * acquirePlannerRun(opts) :
 *   bundleRoot, mono04, missionContext {runId, missionId, nodeId?}
 *   missionQuestion       - string reelle de la mission
 *   runContractHash       - hash du RunContract confirme (planner s'execute apres, pas de F-02 ici)
 *   resolvedDisciplines   - [{id, label, rationale}] disciplines RETENUES, avec leur JUSTIFICATION REELLE (F-07)
 *   resolverOutputHash    - hash du contenu causal reel du resolver (F-07), fourni par EF-01B-v0.2-r1::acquireResolverRun
 *   classification        - "PROVIDER_OBSERVED_CALL" ou "LOCAL_CONTROLLED_FIXTURE"
 *   evidenceRoot           - dossier de sortie de l'evidence
 *   env                    - optionnel, defaut process.env
 *   declaredModel/declaredTransport - optionnels, ASSERTIONS (F-03/F-04)
 *
 * Retourne { plannerRun, plannerOutput, provenance, evidenceDir }.
 */
async function acquirePlannerRun(opts) {
  opts = opts || {};
  const required = ["bundleRoot", "mono04", "missionContext", "missionQuestion", "runContractHash", "resolvedDisciplines", "resolverOutputHash", "classification", "evidenceRoot"];
  for (const f of required) {
    if (opts[f] === undefined || opts[f] === null) {
      throw new Error("acquirePlannerRun: parametre requis manquant \"" + f + "\" — jamais une valeur devinee.");
    }
  }
  if (!Array.isArray(opts.resolvedDisciplines) || opts.resolvedDisciplines.length === 0) {
    throw new Error("acquirePlannerRun: resolvedDisciplines[] (non vide) requis.");
  }
  if (["PROVIDER_OBSERVED_CALL", "LOCAL_CONTROLLED_FIXTURE"].indexOf(opts.classification) === -1) {
    throw new Error("acquirePlannerRun: classification doit valoir \"PROVIDER_OBSERVED_CALL\" ou \"LOCAL_CONTROLLED_FIXTURE\".");
  }

  // F-C1-R2-04 — controle le PLUS TOT possible : avant toute construction
  // couteuse (hashDeps, prompt, hash d'entree) et bien avant le reseau.
  const envEarly = opts.env || process.env;
  const isRealCall = opts.classification === "PROVIDER_OBSERVED_CALL";
  if (isRealCall && !(typeof envEarly.LLM_REAL_MODEL === "string" && envEarly.LLM_REAL_MODEL.trim().length > 0)) {
    throw ef01c1Error(
      "REAL_MODEL_NOT_EXPLICIT",
      "appel REEL refuse : LLM_REAL_MODEL n'est pas defini. Le modele reel doit etre choisi explicitement par le proprietaire — jamais herite d'un defaut, jamais code en dur. Aucune requete reseau n'a ete emise, aucun artefact n'a ete cree.",
      { requiredEnvVar: "LLM_REAL_MODEL", classification: opts.classification, networkCallPerformed: false }
    );
  }

  const hashDeps = loadHashDeps(opts.bundleRoot);
  const eforchArtifacts = loadEForchArtifacts(opts.bundleRoot);
  const env = opts.env || process.env;

  const recomputedTemplateHash = await computePromptTemplateHash(hashDeps, PROMPT_TEMPLATE);
  if (recomputedTemplateHash !== PROMPT_TEMPLATE_HASH) {
    throw ef01c1Error("PROMPT_VERSION_MISMATCH", "PROMPT_TEMPLATE_HASH expose (" + PROMPT_TEMPLATE_HASH + ") ne correspond pas au hash recalcule (" + recomputedTemplateHash + ").", {});
  }

  const disciplineIds = opts.resolvedDisciplines.map(function (d) { return d.id; });
  const promptText = buildPlannerPrompt({
    missionQuestion: opts.missionQuestion,
    resolvedDisciplines: opts.resolvedDisciplines,
    resolverOutputHash: opts.resolverOutputHash,
  });

  const observedTransport = resolveEffectiveTransport(opts.mono04);

  // F-07 : resolverOutputHash fait partie du contenu haché — deux
  // resolverOutput differents produisent deux inputHash differents, meme
  // a discipline count identique.
  const canonicalInputObject = {
    stage: "EF-01C1",
    promptId: PROMPT_ID,
    promptVersion: PROMPT_VERSION,
    missionId: opts.missionContext.missionId,
    runContractHash: opts.runContractHash,
    resolverOutputHash: opts.resolverOutputHash,
    disciplines: disciplineIds,
    transport: observedTransport,
    prompt: promptText,
  };
  const inputHash = await computeInputHash(hashDeps, canonicalInputObject);

  const startedAt = new Date().toISOString();
  const callResult = await callTracedRealLlm({
    bundleRoot: opts.bundleRoot,
    mono04: opts.mono04,
    missionContext: opts.missionContext,
    prompt: promptText,
    env: env,
    declaredModel: opts.declaredModel,
    declaredTransport: opts.declaredTransport,
    errorFactory: ef01c1Error,
    localInvocationIdPrefix: "ef01c1-planner",
    requireExplicitRealModel: isRealCall, // F-C1-R2-04, seconde barriere au plus pres du reseau
  });
  const completedAt = new Date().toISOString();
  const rawResponseText = callResult.text;
  const rawResponseHash = await computeRawResponseHash(hashDeps, rawResponseText);

  // ---------------------------------------------------------------------
  // F-C1-R2-03 — L'EVIDENCE BRUTE EST PERSISTEE AVANT LE PARSING.
  // "reponse provider recue" et "plannerOutput valide" sont deux faits
  // distincts. Le premier est desormais prouve independamment du second.
  // rawResponseHash porte sur le texte assistant ORIGINAL (fence comprise) :
  // il est calcule ci-dessus, avant toute normalisation d'enveloppe.
  // ---------------------------------------------------------------------
  const rawProviderEvidence = {
    evidenceType: "RAW_PROVIDER_EVIDENCE", // JAMAIS un plannerRun
    evidenceVersion: "EF-01C1-v0.2-r2",
    note: "Preuve d'un appel provider REELLEMENT effectue. Ce fichier n'est PAS un plannerRun et ne doit jamais etre lu comme tel : un plannerRun n'existe que si parsingStatus vaut SUCCESS et que la validation R6 a reussi.",
    classification: opts.classification,
    provider: "anthropic",
    localInvocationId: callResult.localInvocationId,
    providerRequestId: callResult.providerRequestId,
    modelRequested: (opts.env || process.env).LLM_REAL_MODEL || null,
    modelObserved: callResult.effectiveModel,
    transport: callResult.effectiveTransport,
    promptId: PROMPT_ID,
    promptVersion: PROMPT_VERSION,
    inputHash: inputHash,
    assistantText: rawResponseText,
    rawResponseHash: rawResponseHash,
    rawResponseHashScope: "assistant_text",
    startedAt: startedAt,
    completedAt: completedAt,
    parsingStatus: "PENDING",
  };
  writeRawProviderEvidence(opts.evidenceRoot, rawProviderEvidence);

  let plannerOutput;
  try {
    plannerOutput = parsePlannerResponse(rawResponseText, disciplineIds, eforchArtifacts.validateRealPlannerOutputFields);
  } catch (parseError) {
    rawProviderEvidence.parsingStatus = "FAILED";
    rawProviderEvidence.parsingFailure = {
      code: parseError && parseError.code ? parseError.code : "UNKNOWN",
      message: String(parseError && parseError.message ? parseError.message : parseError),
      stage: "parsePlannerResponse",
      failedAt: new Date().toISOString(),
    };
    // PLANNER_RUN_VALID = NO, PLANNER_OUTPUT_VALID = NO : rien d'autre n'est
    // ecrit, et l'erreur typee remonte inchangee a l'appelant.
    writeRawProviderEvidence(opts.evidenceRoot, rawProviderEvidence);
    throw parseError;
  }
  rawProviderEvidence.parsingStatus = "SUCCESS";
  writeRawProviderEvidence(opts.evidenceRoot, rawProviderEvidence);

  const provenance = {
    classification: opts.classification,
    provider: "anthropic",
    model: callResult.effectiveModel,
    promptId: PROMPT_ID,
    promptVersion: PROMPT_VERSION,
    promptTemplateHash: PROMPT_TEMPLATE_HASH,
    inputHash: inputHash,
    rawResponseHash: rawResponseHash,
    rawResponseHashScope: "assistant_text", // F-05
    startedAt: startedAt,
    completedAt: completedAt,
    localInvocationId: callResult.localInvocationId, // F-06
    providerRequestId: callResult.providerRequestId, // F-06
    transport: callResult.effectiveTransport, // F-04
    resolverOutputHash: opts.resolverOutputHash, // F-07, trace explicite du lien causal utilise
  };

  const plannerRun = {
    provider: "anthropic",
    model: callResult.effectiveModel,
    promptVersion: PROMPT_VERSION,
    date: completedAt,
    inputHash: inputHash,
    rawResponseHash: rawResponseHash,
  };

  const missing = eforchArtifacts.validateRealPlannerRunFields(plannerRun);
  if (missing.length) {
    throw ef01c1Error("PLANNER_OUTPUT_INVALID", "plannerRun produit ne respecte pas validateRealPlannerRunFields() (R6) — incoherence interne : " + missing.join(", "), { missing: missing });
  }

  const evidenceDir = writePlannerEvidence(opts.evidenceRoot, {
    inputObject: canonicalInputObject,
    promptText: promptText,
    rawResponseText: rawResponseText,
    provenance: provenance,
    plannerOutput: plannerOutput,
  });

  return { plannerRun: plannerRun, plannerOutput: plannerOutput, provenance: provenance, evidenceDir: evidenceDir };
}

module.exports = { acquirePlannerRun: acquirePlannerRun };
