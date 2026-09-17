// EvidenceForge — EF-ORCH — EF01BResolverTrace — v0.1
// Contrat explicite pour transporter et figer la trace d'audit de l'appel
// LLM de résolution de disciplines (le vrai `resolverRuns` d'EF-01B), une
// fois que cet appel a eu lieu PENDANT LA PRÉ-ANALYSE, avant la confirmation
// du RunContract — jamais pendant l'exécution du stage EF-01B orchestré.
//
// Principe : le RunContract confirmé est la frontière entre exploration
// probabiliste (l'appel LLM, non déterministe) et exécution reproductible
// (le stage EF-01B lui-même, qui ne rappelle jamais le LLM). Cette trace
// prouve QUELLE sortie non déterministe a servi à construire la décision
// méthodologique ensuite figée dans le RunContract — elle ne la recalcule
// jamais, ne la réconcilie jamais.
"use strict";

const SCHEMA = "EvidenceForge.EF01BResolverTrace";
const SCHEMA_VERSION = "EF-ORCH-TRACE-v1";

function str(v) {
  return String(v == null ? "" : v).trim();
}
function isArr(v) {
  return Array.isArray(v);
}
function isSha256Hex(v) {
  return typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);
}

// ---------------------------------------------------------------------------
// assertResolverTraceConsistent(trace, runContract)
// Ne recalcule PAS inputHash : le reconstruire exigerait de dupliquer ici la
// logique de construction du prompt d'EF-01B (troncature de contexte
// documentaire, décodage) — exactement la duplication que le vrai module
// refuse déjà pour d'autres raisons ("un lot, un périmètre"). On vérifie la
// présence et la FORME de la trace (dont le format SHA-256 des hash), pas la
// véracité de son contenu LLM.
// ---------------------------------------------------------------------------
function assertResolverTraceConsistent(trace, runContract) {
  if (!trace || trace.schema !== SCHEMA || trace.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("assertResolverTraceConsistent: trace manquante ou de schéma inattendu (attendu " + SCHEMA + "/" + SCHEMA_VERSION + ").");
  }
  if (!runContract || !str(runContract.runContractHash)) {
    throw new Error("assertResolverTraceConsistent: RunContract manquant ou non confirmé (runContractHash absent).");
  }
  if (str(trace.runContractHash) !== str(runContract.runContractHash)) {
    throw new Error(
      "assertResolverTraceConsistent: la trace référence un autre RunContract (trace.runContractHash=" + str(trace.runContractHash) +
      ", RunContract confirmé=" + str(runContract.runContractHash) + ") — jamais réconcilié silencieusement."
    );
  }
  if (!isArr(trace.resolverRuns) || trace.resolverRuns.length === 0) {
    throw new Error("assertResolverTraceConsistent: trace.resolverRuns manquant ou vide — aucune trace d'appel LLM à figer.");
  }
  trace.resolverRuns.forEach((run, i) => {
    const requiredNonEmpty = ["runId", "date", "provider", "model", "promptVersion"];
    for (const field of requiredNonEmpty) {
      if (!str(run && run[field])) {
        throw new Error("assertResolverTraceConsistent: resolverRuns[" + i + "]." + field + " manquant ou vide.");
      }
    }
    if (!isSha256Hex(run && run.inputHash)) {
      throw new Error("assertResolverTraceConsistent: resolverRuns[" + i + "].inputHash n'est pas un SHA-256 hexadécimal valide (64 caractères hex attendus).");
    }
    if (!isSha256Hex(run && run.rawResponseHash)) {
      throw new Error("assertResolverTraceConsistent: resolverRuns[" + i + "].rawResponseHash n'est pas un SHA-256 hexadécimal valide (64 caractères hex attendus).");
    }
    if (!isArr(run && run.targetContextReport)) {
      throw new Error("assertResolverTraceConsistent: resolverRuns[" + i + "].targetContextReport manquant ou n'est pas un tableau.");
    }
    const proposalCountRaw = Number(run && run.proposalCountRaw);
    const proposalCountStored = Number(run && run.proposalCountStored);
    const technicalProposalLimit = Number(run && run.technicalProposalLimit);
    if (!Number.isFinite(proposalCountRaw) || proposalCountRaw < 0) {
      throw new Error("assertResolverTraceConsistent: resolverRuns[" + i + "].proposalCountRaw manquant ou invalide.");
    }
    if (!Number.isFinite(proposalCountStored) || proposalCountStored < 0) {
      throw new Error("assertResolverTraceConsistent: resolverRuns[" + i + "].proposalCountStored manquant ou invalide.");
    }
    if (!Number.isFinite(technicalProposalLimit) || technicalProposalLimit < 0) {
      throw new Error("assertResolverTraceConsistent: resolverRuns[" + i + "].technicalProposalLimit manquant ou invalide.");
    }
    if (proposalCountStored > technicalProposalLimit) {
      throw new Error(
        "assertResolverTraceConsistent: resolverRuns[" + i + "].proposalCountStored (" + proposalCountStored +
        ") dépasse technicalProposalLimit (" + technicalProposalLimit + ") — incohérence interne à la trace."
      );
    }
    if (proposalCountStored > proposalCountRaw) {
      throw new Error(
        "assertResolverTraceConsistent: resolverRuns[" + i + "].proposalCountStored (" + proposalCountStored +
        ") dépasse proposalCountRaw (" + proposalCountRaw + ") — on ne peut pas avoir conservé plus de propositions qu'il n'y en a eu brutes."
      );
    }
  });
  return true;
}

const EFOrchEF01BResolverTrace = { SCHEMA, SCHEMA_VERSION, assertResolverTraceConsistent };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01BResolverTrace;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01BResolverTrace = EFOrchEF01BResolverTrace;
}
