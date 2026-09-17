"use strict";
// EF-01B-v0.2-r1 — lib/executor.js — acquireResolverRun()
//
// F-01/F-02 (BLOCKERS, fermes) : UN SEUL appel LLM au niveau MISSION
// (jamais un appel par discipline deja connue), produisant des
// PROPOSITIONS DE DISCIPLINES (jamais des professionnels), a partir
// UNIQUEMENT de la sortie EF-01A (question/targetDocuments/
// suppliedEvidence) — AUCUNE dependance a un RunContract confirme, qui
// n'existe pas encore a ce stade (verifie : MONO-01/dependencies/
// ef-orch-ef01b-executor-v0.1.js dit explicitement que la resolution LLM
// est anterieure a la confirmation du RunContract).
//
// F-03/F-04/F-06 (fermes) : delegue a lib/real-llm-call.js (callTracedRealLlm)
// qui observe le modele/transport REELLEMENT utilises, jamais une valeur
// declarative independante, et distingue localInvocationId (genere ici)
// de providerRequestId (observe, ou null si jamais fourni par le provider).
//
// F-05 (ferme) : rawResponseHash porte EXPLICITEMENT le scope
// "assistant_text" (rawResponseHashScope) — jamais presente comme une
// preuve de l'enveloppe HTTP/provider complete, qui n'est jamais
// disponible ici (callTracedRealLlm ne retourne que le texte assistant,
// meme limitation de forme que le wrapper gele R6, documentee).
//
// F-07 (ferme, cote consommateur EF-01C1-v0.2-r1) : ce module calcule et
// expose resolverOutputHash = hash canonique du contenu REEL des
// disciplines proposees/retenues (proposals + targetContextReport),
// jamais un simple compteur — cette valeur doit etre transmise telle
// quelle au planner (EF-01C1-v0.2-r1::acquirePlannerRun) pour lier
// causalement le plan au contenu reel du resolver.

const { buildResolverPrompt, PROMPT_ID, PROMPT_VERSION, PROMPT_TEMPLATE, PROMPT_TEMPLATE_HASH } = require("../prompts/ef01b-resolver-prompt-v0.2-r1.js");
const { loadHashDeps, computeInputHash, computeRawResponseHash, computePromptTemplateHash, computeCanonicalContentHash } = require("./hash.js");
const { parseResolverResponse } = require("./parser.js");
const { writeResolverEvidence } = require("./evidence-writer.js");
const { ef01bError } = require("./errors.js");
const { callTracedRealLlm, resolveEffectiveTransport } = require("./real-llm-call.js");

/**
 * acquireResolverRun(opts) :
 *   bundleRoot          - racine extraction R6
 *   mono04              - { gateway, providerRegistry } reel ou LOCAL_CONTROLLED
 *   missionContext      - { runId, missionId, nodeId? }
 *   missionQuestion     - EF-01A.question (string reelle)
 *   targetDocuments     - EF-01A.targetDocuments[] (contexte)
 *   suppliedEvidence    - EF-01A.suppliedEvidence[] (contexte)
 *   technicalProposalLimit - number (limite de disciplines conservees)
 *   classification      - "PROVIDER_OBSERVED_CALL" (reel) ou "LOCAL_CONTROLLED_FIXTURE" (test explicite)
 *   evidenceRoot        - dossier de sortie de l'evidence non secrete
 *   env                  - optionnel, defaut process.env (LOCAL_CONTROLLED)
 *   declaredModel/declaredTransport - optionnels, ASSERTIONS (F-03/F-04) : si fournis et divergents de la
 *                          valeur reellement observee, l'appel echoue explicitement (jamais une contradiction silencieuse)
 *
 * Retourne { resolverRuns, resolverOutputHash, provenance, storedProposals, evidenceDir }.
 * `resolverRuns[]` : UN enregistrement v0.1-compatible PAR discipline
 * retenue, TOUS partageant la meme provenance d'appel (inputHash/
 * rawResponseHash/date/provider/model/promptVersion identiques) puisqu'ils
 * proviennent tous du MEME appel LLM reel unique — jamais une provenance
 * fabriquee separement par discipline. Chaque entree porte `discipline`
 * pour l'alignement positionnel avec RunContract.disciplinesProposees
 * (verifie par buildResolverTraceForMission()/assertResolverTraceConsistent(),
 * R6, geles).
 */
async function acquireResolverRun(opts) {
  opts = opts || {};
  const required = ["bundleRoot", "mono04", "missionContext", "missionQuestion", "technicalProposalLimit", "classification", "evidenceRoot"];
  for (const f of required) {
    if (opts[f] === undefined || opts[f] === null) {
      throw new Error("acquireResolverRun: parametre requis manquant \"" + f + "\" — jamais une valeur devinee.");
    }
  }
  if (["PROVIDER_OBSERVED_CALL", "LOCAL_CONTROLLED_FIXTURE"].indexOf(opts.classification) === -1) {
    throw new Error("acquireResolverRun: classification doit valoir \"PROVIDER_OBSERVED_CALL\" ou \"LOCAL_CONTROLLED_FIXTURE\".");
  }

  const hashDeps = loadHashDeps(opts.bundleRoot);
  const env = opts.env || process.env;

  const recomputedTemplateHash = await computePromptTemplateHash(hashDeps, PROMPT_TEMPLATE);
  if (recomputedTemplateHash !== PROMPT_TEMPLATE_HASH) {
    throw ef01bError("PROMPT_VERSION_MISMATCH", "PROMPT_TEMPLATE_HASH expose (" + PROMPT_TEMPLATE_HASH + ") ne correspond pas au hash recalcule (" + recomputedTemplateHash + ").", {});
  }

  const targetDocuments = opts.targetDocuments || [];
  const suppliedEvidence = opts.suppliedEvidence || [];
  const promptText = buildResolverPrompt({ missionQuestion: opts.missionQuestion, targetDocuments: targetDocuments, suppliedEvidence: suppliedEvidence });

  // Transport observe AVANT l'appel (deterministe depuis mono04, jamais
  // dependant de la reponse) — meme valeur que celle que callTracedRealLlm
  // recalculera en interne (F-04, source de verite unique).
  const observedTransport = resolveEffectiveTransport(opts.mono04);

  // NOTE F-02 : aucun runContractHash ici — canonicalInputObject ne
  // contient QUE des donnees reellement disponibles avant confirmation du
  // RunContract (EF01B_INPUT_HASH_SPEC, voir CONTRACT.md).
  const canonicalInputObject = {
    stage: "EF-01B",
    promptId: PROMPT_ID,
    promptVersion: PROMPT_VERSION,
    missionId: opts.missionContext.missionId,
    missionQuestion: opts.missionQuestion,
    targetDocuments: targetDocuments,
    suppliedEvidence: suppliedEvidence,
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
    errorFactory: ef01bError,
    localInvocationIdPrefix: "ef01b-resolver",
  });
  const completedAt = new Date().toISOString();
  const rawResponseText = callResult.text;
  const rawResponseHash = await computeRawResponseHash(hashDeps, rawResponseText);

  const parsedOutput = parseResolverResponse(rawResponseText);

  const limit = opts.technicalProposalLimit;
  const technicalLimitApplied = parsedOutput.proposals.length > limit;
  const proposalCountRaw = parsedOutput.proposals.length;
  const proposalCountStored = technicalLimitApplied ? limit : proposalCountRaw;
  const storedProposals = technicalLimitApplied ? parsedOutput.proposals.slice(0, limit) : parsedOutput.proposals;

  // F-07 : hash du contenu CAUSAL reel du resolver — a transmettre tel
  // quel au planner (jamais un simple compteur).
  const resolverOutputCanonical = { proposals: storedProposals, targetContextReport: parsedOutput.targetContextReport };
  const resolverOutputHash = await computeCanonicalContentHash(hashDeps, resolverOutputCanonical);

  const provenance = {
    classification: opts.classification,
    provider: "anthropic",
    model: callResult.effectiveModel,
    promptId: PROMPT_ID,
    promptVersion: PROMPT_VERSION,
    promptTemplateHash: PROMPT_TEMPLATE_HASH,
    inputHash: inputHash,
    rawResponseHash: rawResponseHash,
    rawResponseHashScope: "assistant_text", // F-05 : jamais l'enveloppe HTTP/provider complete
    startedAt: startedAt,
    completedAt: completedAt,
    localInvocationId: callResult.localInvocationId, // F-06 : identifiant LOCAL, jamais un id provider
    providerRequestId: callResult.providerRequestId, // F-06 : null si jamais fourni par le provider — jamais invente
    transport: callResult.effectiveTransport, // F-04 : observe, jamais declaratif
    resolverOutputHash: resolverOutputHash, // F-07
  };

  // Expansion v0.1-compatible : un resolverRun par discipline STOCKEE,
  // tous partageant la MEME provenance d'appel (un seul appel LLM reel a
  // l'origine de toutes ces propositions).
  const resolverRuns = storedProposals.map(function (p) {
    return {
      date: completedAt, provider: "anthropic", model: callResult.effectiveModel, promptVersion: PROMPT_VERSION,
      inputHash: inputHash, rawResponseHash: rawResponseHash,
      proposalCountRaw: proposalCountRaw, proposalCountStored: proposalCountStored,
      technicalProposalLimit: limit, technicalLimitApplied: technicalLimitApplied,
      targetContextReport: parsedOutput.targetContextReport,
      discipline: p.disciplineId,
    };
  });

  const evidenceDir = writeResolverEvidence(opts.evidenceRoot, {
    inputObject: canonicalInputObject,
    promptText: promptText,
    rawResponseText: rawResponseText,
    provenance: provenance,
    parsedOutput: { proposalsStored: storedProposals, proposalsRawCount: proposalCountRaw, targetContextReport: parsedOutput.targetContextReport },
    resolverOutput: Object.assign({ resolverOutputHash: resolverOutputHash }, resolverOutputCanonical),
  });

  return { resolverRuns: resolverRuns, resolverOutputHash: resolverOutputHash, provenance: provenance, storedProposals: storedProposals, evidenceDir: evidenceDir };
}

module.exports = { acquireResolverRun: acquireResolverRun };
