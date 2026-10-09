"use strict";
// scripts/lib/build-runcontract-draft-core.js
//
// Construit le brouillon de RunContract via le MECANISME REEL ET EXISTANT
// de R6 (MONO-01/dependencies/ef-orch-runcontract-v0.1.js::
// buildRunContractDraft, gele) — JAMAIS un constructeur parallele invente
// pour ce kit.
//
// Mapping disciplines (decision documentee, aucune modification du lot
// r1 requise) : EF-01B-v0.2-r1 n'expose qu'un `disciplineId` opaque (pas
// de label separe dans resolverRun.discipline — voir EF-01B-v0.2-r1/
// CONTRACT.md). Pour rester coherent avec resolverRun.discipline (utilise
// par assertResolverTraceConsistent() pour la verification positionnelle),
// ce module utilise EXPLICITEMENT `disciplineId` comme valeur du champ
// `discipline` (nom) du RunContract, jamais le `label` humain-lisible
// separement. `id` du RunContract est le MEME disciplineId (lineage
// direct, jamais un second identifiant invente).

const path = require("path");

function requireRunContractModule(bundleRoot) {
  return require(path.join(bundleRoot, "MONO-01", "dependencies", "ef-orch-runcontract-v0.1.js"));
}

/**
 * buildRunContractDraftCore(opts) :
 *   bundleRoot
 *   missionQuestion        - EF-01A.question reelle
 *   documentsDetectes      - [{nom, type, hashSha256}] — hash REEL des documents cibles (voir 06-RUNCONTRACT-CONFIRMATION.md)
 *   sourcesFournies        - idem, pour les sources deja fournies par l'operateur
 *   storedProposals        - resolver-output.json::proposals (TOUTES, avant filtrage humain)
 *   includedDisciplineIds  - resultat de validateHumanDisciplineSelection() (F-01/F-02 : acte humain, jamais devine ici)
 *   niveauRevue            - "rapide" | "standard" | "approfondie" (choix operateur, documente)
 *   webPublicActive        - bool (defaut false — aucun connecteur web_public reellement cable)
 *   governanceRef          - objet libre, fourni par l'operateur
 *
 * Retourne le brouillon RunContract BRUT (tel que retourne par
 * buildRunContractDraft(), jamais transforme).
 */
function buildRunContractDraftCore(opts) {
  const EFOrchRunContract = requireRunContractModule(opts.bundleRoot);

  const includedIds = Array.isArray(opts.includedDisciplineIds) ? opts.includedDisciplineIds : [];
  if (includedIds.length === 0) {
    throw new Error("buildRunContractDraftCore: includedDisciplineIds vide — une selection humaine reelle et valide est requise avant de construire un brouillon (F-01/F-02).");
  }
  const includedProposals = (opts.storedProposals || []).filter(function (p) { return includedIds.indexOf(p.disciplineId) !== -1; });
  if (includedProposals.length !== includedIds.length) {
    throw new Error("buildRunContractDraftCore: au moins un disciplineId inclus par l'humain ne correspond a aucune proposition reelle du resolver — jamais accepte silencieusement.");
  }

  const disciplinesProposees = includedProposals.map(function (p) {
    return {
      id: p.disciplineId,
      discipline: p.disciplineId, // voir entete : lineage direct avec resolverRun.discipline, jamais un second identifiant
      justification: p.rationale,
      sourcesIndicatives: Array.isArray(p.evidenceContextRefs) ? p.evidenceContextRefs : [],
    };
  });

  return EFOrchRunContract.buildRunContractDraft({
    demandeBrute: opts.missionQuestion,
    missionReformulee: opts.missionQuestion,
    documentsDetectes: opts.documentsDetectes || [],
    sourcesFournies: opts.sourcesFournies || [],
    disciplinesProposees: disciplinesProposees,
    connecteursDisponibles: ["openalex"], // seul connecteur reellement cable (F-07, verifie lib/real-e2e-driver.js)
    niveauRevue: opts.niveauRevue || "standard",
    webPublicActive: !!opts.webPublicActive,
    governanceRef: opts.governanceRef || null,
  });
}

module.exports = { buildRunContractDraftCore: buildRunContractDraftCore };
