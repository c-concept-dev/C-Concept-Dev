// EvidenceForge — EF-ORCH-02 — Stage Adapter — v0.1
// Interface commune pour appeler un module existant sans le réécrire. Cette
// brique ne connaît aucun vrai module EF-01/EF-02 — les exécuteurs sont
// injectés par l'appelant (context.executor). EF-ORCH-03 branchera les
// vrais modules sur ce contrat, pas l'inverse.
"use strict";

const { sha256CanonicalJson } = require("./ef-orch-hash-v0.1.js");

const VALID_EXECUTION_CLASSES = Object.freeze(["pure", "read_only_external", "side_effecting"]);
const VALID_CHECKPOINT_POLICIES = Object.freeze(["freeze_successful_output", "none"]);

function str(v) {
  return String(v == null ? "" : v).trim();
}

// ---------------------------------------------------------------------------
// Registre des adapters — un descriptif par stageId, jamais la logique du
// stage lui-même.
// ---------------------------------------------------------------------------
function createStageAdapterRegistry() {
  const byStageId = new Map();

  function registerStageAdapter(descriptor) {
    const stageId = str(descriptor && descriptor.stageId);
    if (!stageId) throw new Error("registerStageAdapter: stageId manquant.");
    const executionClass = str(descriptor.executionClass);
    if (!VALID_EXECUTION_CLASSES.includes(executionClass)) {
      throw new Error("registerStageAdapter: executionClass invalide pour " + stageId + " (" + executionClass + ").");
    }
    if (typeof descriptor.deterministic !== "boolean") {
      throw new Error("registerStageAdapter: deterministic doit être un booléen explicite pour " + stageId + " — jamais implicite.");
    }
    const resumePolicy = str(descriptor.resumePolicy) || "restart_stage";
    if (!["restart_stage", "resume_checkpoint"].includes(resumePolicy)) {
      throw new Error("registerStageAdapter: resumePolicy invalide pour " + stageId + " (" + resumePolicy + ").");
    }
    // Explicite, comme deterministic : jamais un défaut silencieux. Un output
    // externe réussi (LLM ou API documentaire) doit être figé comme vérité du
    // run plutôt que recalculé à chaque replay — sinon un run peut changer de
    // littérature ou de réponse LLM en cours de route sans que personne le
    // décide consciemment.
    const checkpointPolicy = str(descriptor.checkpointPolicy);
    if (!VALID_CHECKPOINT_POLICIES.includes(checkpointPolicy)) {
      throw new Error("registerStageAdapter: checkpointPolicy manquant ou invalide pour " + stageId + " — attendu " + VALID_CHECKPOINT_POLICIES.join("|") + ", explicite obligatoire.");
    }

    // Invariant : une reprise depuis checkpoint n'a de sens que si une sortie
    // réussie est effectivement conservée. Rejeté explicitement, jamais corrigé
    // automatiquement — un couple incohérent révèle une erreur de déclaration,
    // pas une préférence à deviner.
    if (resumePolicy === "resume_checkpoint" && checkpointPolicy === "none") {
      throw new Error(
        "registerStageAdapter: " + stageId + " — resumePolicy \"resume_checkpoint\" est incompatible avec checkpointPolicy \"none\" " +
        "(rien ne serait conservé à reprendre). Utiliser checkpointPolicy \"freeze_successful_output\", ou resumePolicy \"restart_stage\" si aucune conservation n'est voulue."
      );
    }

    // Garde-fou central de cette brique : un stage non déterministe ne peut pas
    // être rejoué depuis son entrée par défaut, parce qu'un replay peut changer
    // les affectedItems d'un gate déjà résolu et invalider le gateFingerprint
    // enregistré — on retomberait dans la boucle pause/décision/replay/pause
    // que le fingerprint est censé empêcher.
    if (resumePolicy === "restart_stage" && descriptor.deterministic === false && descriptor.acknowledgeNonDeterministicReplay !== true) {
      throw new Error(
        "registerStageAdapter: " + stageId + " est non déterministe (deterministic:false) — " +
        "resumePolicy \"restart_stage\" est refusé sans acknowledgeNonDeterministicReplay:true explicite. " +
        "Utiliser resumePolicy:\"resume_checkpoint\", ou reconnaître le risque explicitement si le stage n'est jamais gaté."
      );
    }

    byStageId.set(stageId, {
      stageId,
      executionClass,
      deterministic: descriptor.deterministic,
      resumePolicy,
      checkpointPolicy,
      acknowledgeNonDeterministicReplay: descriptor.acknowledgeNonDeterministicReplay === true
    });
  }

  function getStageAdapter(stageId) {
    const a = byStageId.get(str(stageId));
    if (!a) throw new Error("getStageAdapter: aucun adapter enregistré pour \"" + stageId + "\".");
    return a;
  }

  function hasStageAdapter(stageId) {
    return byStageId.has(str(stageId));
  }

  return { registerStageAdapter, getStageAdapter, hasStageAdapter };
}

// ---------------------------------------------------------------------------
// computeGateFingerprint — clé déterministe d'un gate, pour reconnaître qu'une
// ambiguïté déjà tranchée n'a pas besoin d'être redemandée. affectedItems est
// trié avant hachage : l'ordre dans lequel un stage redécouvre les mêmes
// éléments après replay ne doit jamais faire manquer une correspondance.
// ---------------------------------------------------------------------------
async function computeGateFingerprint({ runContractHash, stageId, reason, affectedItems }) {
  if (!str(runContractHash)) throw new Error("computeGateFingerprint: runContractHash manquant.");
  if (!str(stageId)) throw new Error("computeGateFingerprint: stageId manquant.");
  if (!str(reason)) throw new Error("computeGateFingerprint: reason manquant.");
  const sortedItems = Array.isArray(affectedItems) ? [...affectedItems].map(str).sort() : [];
  return sha256CanonicalJson({
    runContractHash: str(runContractHash),
    stageId: str(stageId),
    reason: str(reason),
    affectedItems: sortedItems
  });
}

// ---------------------------------------------------------------------------
// findMatchingDecision — cherche, dans un journal d'AuditDecision déjà connu,
// une décision valide pour ce gateFingerprint exact.
// ---------------------------------------------------------------------------
function findMatchingDecision(gateFingerprint, auditDecisions) {
  const list = Array.isArray(auditDecisions) ? auditDecisions : [];
  return list.find((d) => d && d.gateFingerprint === gateFingerprint) || null;
}

// ---------------------------------------------------------------------------
// runStage({ stageId, input, runContractHash, protocolHash, context })
//
// context.executor(input, injected) -> doit retourner l'une des trois formes :
//   { status: "ok", output }
//   { status: "gate_required", reason, affectedItems }
// ou lever une exception (normalisée en status "failed").
//
// context.auditDecisions : décisions déjà connues (pour l'injection automatique).
// context.validateOutput : fonction optionnelle (output) -> bool | Promise<bool>,
// pour valider le schéma de sortie avant de faire confiance au résultat.
// Toujours awaitée par runStage, qu'elle soit sync ou async — un validateur
// asynchrone (ex. revérification d'un hash cryptographique) doit être traité
// exactement comme un validateur synchrone, jamais court-circuité.
// ---------------------------------------------------------------------------
async function runStage({ stageId, input, runContractHash, protocolHash, context }) {
  if (!str(stageId)) throw new Error("runStage: stageId manquant.");
  if (!str(runContractHash)) throw new Error("runStage: runContractHash manquant — aucun stage ne s'exécute hors d'un run rattaché à un contrat confirmé.");
  const ctx = context || {};
  const registry = ctx.registry;
  if (!registry || typeof registry.getStageAdapter !== "function") {
    throw new Error("runStage: context.registry manquant (createStageAdapterRegistry()).");
  }
  const adapter = registry.getStageAdapter(stageId); // lève si stage inconnu — jamais d'exécution silencieuse d'un stage non déclaré
  if (typeof ctx.executor !== "function") {
    throw new Error("runStage: context.executor manquant pour \"" + stageId + "\" — cette brique n'exécute jamais de logique de module elle-même.");
  }

  const envelopeBase = { stageId, runContractHash: str(runContractHash), protocolHash: protocolHash != null ? str(protocolHash) : null };

  let result;
  try {
    result = await ctx.executor(input, ctx.injectedDecision || null);
  } catch (e) {
    return { ...envelopeBase, status: "failed", error: { message: str(e && e.message) || "erreur non documentée" } };
  }

  if (!result || (result.status !== "ok" && result.status !== "gate_required")) {
    return { ...envelopeBase, status: "failed", error: { message: "runStage: sortie d'exécuteur non reconnue pour \"" + stageId + "\" (status attendu ok|gate_required)." } };
  }

  if (result.status === "gate_required") {
    const gateFingerprint = await computeGateFingerprint({
      runContractHash,
      stageId,
      reason: result.reason,
      affectedItems: result.affectedItems
    });
    const existing = findMatchingDecision(gateFingerprint, ctx.auditDecisions);

    if (!existing) {
      return { ...envelopeBase, status: "gate_required", reason: str(result.reason), affectedItems: result.affectedItems || [], gateFingerprint };
    }

    // Décision déjà connue pour ce gate exact : on réinjecte plutôt que de
    // redemander à l'utilisateur (c'est tout l'objet du fingerprint).
    let retried;
    try {
      retried = await ctx.executor(input, existing);
    } catch (e) {
      return { ...envelopeBase, status: "failed", error: { message: str(e && e.message) || "erreur non documentée après injection de décision" } };
    }
    if (retried && retried.status === "gate_required") {
      // Boucle détectée : la décision injectée n'a pas suffi à débloquer le
      // stage. On ne boucle jamais silencieusement — on échoue explicitement.
      return {
        ...envelopeBase,
        status: "failed",
        error: { message: "runStage: boucle de gate détectée pour \"" + stageId + "\" — la décision injectée (fingerprint " + gateFingerprint + ") n'a pas résolu l'ambiguïté signalée." }
      };
    }
    result = retried;
  }

  // result.status === "ok" à ce stade
  if (typeof ctx.validateOutput === "function") {
    let valid = false;
    try { valid = !!(await ctx.validateOutput(result.output)); } catch (e) { valid = false; }
    if (!valid) {
      return { ...envelopeBase, status: "failed", error: { message: "runStage: sortie de \"" + stageId + "\" rejetée par validateOutput — schéma non conforme." } };
    }
  }

  return { ...envelopeBase, status: "ok", output: result.output, executionClass: adapter.executionClass, resumePolicy: adapter.resumePolicy, checkpointPolicy: adapter.checkpointPolicy };
}

const EFOrchStageAdapter = {
  VALID_EXECUTION_CLASSES,
  createStageAdapterRegistry,
  computeGateFingerprint,
  findMatchingDecision,
  runStage
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchStageAdapter;
}
if (typeof window !== "undefined") {
  window.EFOrchStageAdapter = EFOrchStageAdapter;
}
