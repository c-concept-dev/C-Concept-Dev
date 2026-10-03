"use strict";
// scripts/lib/filter-resolver-runs-by-runcontract.js
//
// Ferme F-P2-01 (BLOCKER, audit independant Phase 2 r1) : le RunContract
// CONFIRME devient la source de verite UNIQUE pour les disciplines
// finales retenues. Sans ce filtre, une exclusion humaine (05-HUMAN-
// DISCIPLINE-SELECTION.md, decision="exclude") laisserait tout de meme
// le resolverRun correspondant dans eForchProvenance.resolverRuns, en
// nombre et/ou en ordre incoherents avec mission.dimensions — ce que
// validatePreRetrievalProvenance() (R6, gele) rejette (cardinalite et
// correspondance positionnelle strictes).
//
// N'invente rien : ne recalcule jamais un resolverRun, ne modifie jamais
// son contenu — filtre puis reordonne strictement une liste deja
// produite par EF-01B-v0.2-r1, jamais une seconde logique de resolution.

function isNonEmptyStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * filterAndOrderResolverRuns(resolverRuns, runContract) :
 *   resolverRuns  - tableau BRUT tel qu'ecrit par 04-run-resolver.js (resolver-runs.json),
 *                   une entree par PROPOSITION STOCKEE (avant selection humaine)
 *   runContract   - RunContract CONFIRME (runcontract-confirmed.json)
 *
 * Retourne un tableau resolverRuns FILTRE (uniquement les disciplines
 * retenues) et REORDONNE (exactement l'ordre de
 * runContract.disciplinesProposees, restreint aux statut==="retenue").
 *
 * Fail-closed :
 *   - runContract non confirme, ou aucune discipline retenue ;
 *   - un doublon de resolverRun pour une meme discipline (jamais un choix
 *     silencieux entre deux candidats) ;
 *   - une discipline retenue sans resolverRun correspondant EXACTEMENT
 *     (jamais une provenance incomplete acceptee silencieusement).
 * Jamais une discipline exclue (statut !== "retenue") ne peut apparaitre
 * dans le resultat, meme si son resolverRun existe dans l'entree.
 */
function filterAndOrderResolverRuns(resolverRuns, runContract) {
  if (!Array.isArray(resolverRuns) || resolverRuns.length === 0) {
    throw new Error("filterAndOrderResolverRuns: resolverRuns[] (non vide) requis.");
  }
  if (!runContract || !isNonEmptyStr(runContract.runContractHash)) {
    throw new Error("filterAndOrderResolverRuns: RunContract non confirme (runContractHash absent) — jamais une source de verite provisoire.");
  }
  const retenues = (runContract.disciplinesProposees || []).filter(function (d) { return d.statut === "retenue"; });
  if (retenues.length === 0) {
    throw new Error("filterAndOrderResolverRuns: aucune discipline retenue dans le RunContract confirme.");
  }

  const byDiscipline = new Map();
  resolverRuns.forEach(function (run, i) {
    if (!run || !isNonEmptyStr(run.discipline)) {
      throw new Error("filterAndOrderResolverRuns: resolverRuns[" + i + "].discipline manquant.");
    }
    if (byDiscipline.has(run.discipline)) {
      throw new Error("filterAndOrderResolverRuns: plusieurs resolverRuns pour la meme discipline \"" + run.discipline + "\" — jamais un choix silencieux entre deux candidats.");
    }
    byDiscipline.set(run.discipline, run);
  });

  return retenues.map(function (d) {
    const run = byDiscipline.get(d.discipline);
    if (!run) {
      throw new Error(
        "filterAndOrderResolverRuns: aucun resolverRun ne correspond exactement a la discipline retenue \"" + d.discipline +
        "\" — eForchProvenance ne peut jamais etre assemble avec une provenance incomplete (fail-closed)."
      );
    }
    return run;
  });
}

module.exports = { filterAndOrderResolverRuns: filterAndOrderResolverRuns };
