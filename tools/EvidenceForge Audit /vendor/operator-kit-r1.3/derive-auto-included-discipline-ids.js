"use strict";
// scripts/lib/derive-auto-included-discipline-ids.js — kit r1.3 (NOUVEAU)
//
// Politique AUTO_RETAIN_VALID_PROPOSALS : sur le chemin NOMINAL, les
// disciplines transmises a buildRunContractDraft() (R6, gelee) sont
// EXACTEMENT celles reellement produites par EF-01B — aucune selection
// humaine n'est simulee, aucun `decidedBy`/`decidedAt` n'est invente.
//
// Ce module NE DECIDE RIEN : il ne fait que lire `resolver-output.json`
// et en extraire la liste complete des disciplineId, en refusant tout ce
// qui n'est pas exploitable. Le tri des statuts (retenue / rejetee /
// conflit) reste integralement l'affaire de resolveDisciplines() (R6,
// gelee) — ce module ne filtre jamais sur la qualite d'une proposition.
//
// FAIL-CLOSED : resolver-output.json invalide, proposals absent/vide,
// disciplineId manquant ou non-textuel, doublon de disciplineId,
// resolverOutputHash absent.

const POLICY = "AUTO_RETAIN_VALID_PROPOSALS";

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }

/**
 * deriveAutoIncludedDisciplineIds(resolverOutput) ->
 *   { policy, resolverOutputHash, disciplineIds, proposals }
 */
function deriveAutoIncludedDisciplineIds(resolverOutput) {
  if (!resolverOutput || typeof resolverOutput !== "object" || Array.isArray(resolverOutput)) {
    throw new Error("deriveAutoIncludedDisciplineIds: resolver-output.json invalide (objet attendu).");
  }
  if (!isNonEmptyStr(resolverOutput.resolverOutputHash)) {
    throw new Error("deriveAutoIncludedDisciplineIds: resolverOutputHash absent — le lien causal avec l'evidence resolver reelle ne peut jamais etre suppose.");
  }
  const proposals = resolverOutput.proposals;
  if (!Array.isArray(proposals) || proposals.length === 0) {
    throw new Error("deriveAutoIncludedDisciplineIds: proposals[] absent ou vide — aucun RunContract ne peut etre construit (fail-closed).");
  }

  const disciplineIds = [];
  proposals.forEach(function (p, i) {
    if (!p || typeof p !== "object" || !isNonEmptyStr(p.disciplineId)) {
      throw new Error("deriveAutoIncludedDisciplineIds: proposals[" + i + "].disciplineId manquant ou non textuel — jamais complete par une valeur devinee.");
    }
    if (disciplineIds.indexOf(p.disciplineId) !== -1) {
      throw new Error("deriveAutoIncludedDisciplineIds: disciplineId en doublon dans resolver-output.json (\"" + p.disciplineId + "\") — jamais dedoublonne silencieusement ici.");
    }
    disciplineIds.push(p.disciplineId);
  });

  return {
    policy: POLICY,
    resolverOutputHash: resolverOutput.resolverOutputHash,
    disciplineIds: disciplineIds,
    proposals: proposals,
  };
}

module.exports = { deriveAutoIncludedDisciplineIds: deriveAutoIncludedDisciplineIds, POLICY: POLICY };
