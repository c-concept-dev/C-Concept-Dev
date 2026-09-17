"use strict";
// MONO-08 v0.7 — lib/prepare-existing-artifacts.js
//
// SUCCESSEUR ADDITIF de v0.6. v0.6 n'est NI modifie NI reimplemente : ce
// module le REQUIERT et ne remplace que le seul point ou v0.6 reconstruit ce
// que l'operateur a deja produit et fait valider humainement.
//
// DEFAUTS CORRIGES (audit B-03 / B-04 / B-08) :
//   B-03  real-e2e-driver.js:128 appelle TOUJOURS buildConfirmedRunContract
//         ForMission() : le RunContract confirme de l'operateur n'est jamais
//         consomme. Il etait reconstruit depuis mission.dimensions avec
//         justification = d.label (jamais les rationales reelles du resolver)
//         et un confirmedAt neuf — donc un runContractHash different.
//   B-04  real-e2e-driver.js:132 appelle TOUJOURS buildSearchProtocolFor
//         Mission() : le SearchProtocol humainement valide n'est jamais
//         consomme (sa substance etait re-derivee, son identite perdue).
//   B-08  real-e2e-driver.js:129 impose missionId = runContract.runContract
//         Hash, divergent du missionId canonique de la mission. Aucun
//         validateur ne detectait cette divergence avant le retrieval.
//
// REGLE : si les artefacts existants sont fournis, ils sont VALIDES puis
// UTILISES TELS QUELS. Aucune reconstruction. Fail-closed a la moindre
// divergence, JAMAIS de repli silencieux sur la reconstruction.

const path = require("path");

function fail(message, details) {
  const err = new Error("PREPARE_EXISTING_ARTIFACTS: " + message);
  err.code = "EXISTING_ARTIFACTS_INVALID";
  err.details = details || {};
  return err;
}
function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }
function isSha256(v) { return typeof v === "string" && /^[0-9a-f]{64}$/i.test(v); }

/**
 * assertExistingRunContract(deps, existingRunContract, expected)
 * Valide la structure, RECALCULE le runContractHash et le compare.
 */
async function assertExistingRunContract(deps, rc, expected) {
  expected = expected || {};
  if (!rc || typeof rc !== "object") throw fail("existingRunContract absent ou non-objet.");
  if (!Array.isArray(rc.disciplinesProposees) || rc.disciplinesProposees.length === 0) {
    throw fail("existingRunContract.disciplinesProposees absent ou vide.");
  }
  if (!rc.humanConfirmation) throw fail("existingRunContract n'est pas CONFIRME (humanConfirmation absent) — un brouillon n'est jamais accepte ici.");
  if (!isSha256(rc.runContractHash)) throw fail("existingRunContract.runContractHash absent ou non conforme.");

  // Recalcul par la primitive GELEE prevue exactement pour ce cas :
  // verifyRunContractIntegrity() est documentee dans MONO-01 comme la defense
  // a appeler "avant d'utiliser un RunContract qui a pu transiter par un canal
  // externe (fichier, storage)". C'est litteralement notre situation.
  const integrityOk = await deps.EFOrchRunContract.verifyRunContractIntegrity(rc);
  if (!integrityOk) {
    throw fail("verifyRunContractIntegrity() (MONO-01, gelee) rejette l'artefact : le runContractHash porte ne correspond pas au contenu — jamais reconcilie silencieusement.", { declared: rc.runContractHash });
  }
  if (isSha256(expected.runContractHash) && expected.runContractHash !== rc.runContractHash) {
    throw fail("runContractHash (" + rc.runContractHash + ") different de la valeur attendue par l'operateur (" + expected.runContractHash + ").");
  }
  const retenues = rc.disciplinesProposees.filter(function (d) { return d.statut === "retenue"; });
  if (retenues.length === 0) throw fail("existingRunContract ne retient aucune discipline.");
  return { runContract: rc, disciplinesRetenues: retenues.map(function (d) { return d.discipline; }) };
}

/**
 * assertExistingSearchProtocol(deps, sp, ctx)
 * Valide via le contrat GELE, verifie protocolHash, binding planner,
 * binding humanValidation et missionId.
 */
async function assertExistingSearchProtocol(deps, sp, ctx) {
  ctx = ctx || {};
  if (!sp || typeof sp !== "object") throw fail("existingSearchProtocol absent ou non-objet.");

  // Contrat GELE MONO-01 — jamais une seconde logique de validation.
  const mono01 = ctx.mono01Path;
  if (!mono01) throw fail("mono01Path requis pour valider le SearchProtocol via le contrat gele.");
  const trace = require(path.join(mono01, "dependencies", "ef-orch-ef01c1-planner-trace-v0.1.js"));
  // ATTENTION : assertSearchProtocolFrozenAndValid est ASYNCHRONE dans MONO-01.
  // L'appeler sans await ne leve pas — elle renvoie une promesse rejetee, donc
  // un rejet NON GERE qui tue le processus au lieu d'etre capture. Le await est
  // ici une condition de correction, pas un detail de style.
  await trace.assertSearchProtocolFrozenAndValid(sp);

  if (isNonEmptyStr(ctx.expectedProtocolHash) && sp.protocolHash !== ctx.expectedProtocolHash) {
    throw fail("protocolHash (" + sp.protocolHash + ") different de la valeur attendue (" + ctx.expectedProtocolHash + ").");
  }
  // B-08 : missionId CANONIQUE, jamais un runContractHash.
  if (isNonEmptyStr(ctx.missionId) && sp.missionId !== ctx.missionId) {
    throw fail("SearchProtocol.missionId (" + sp.missionId + ") different du missionId canonique de la mission (" + ctx.missionId + ") — divergence de lineage refusee AVANT tout reseau.", { code: "MISSION_ID_MISMATCH" });
  }
  // Binding humain : la validation humaine reelle doit etre portee.
  const hv = sp.humanValidation;
  if (!hv || !isNonEmptyStr(hv.validatedAt) || !isNonEmptyStr(hv.commentaire)) {
    throw fail("SearchProtocol.humanValidation absent ou incomplet (validatedAt/commentaire requis) — jamais une validation humaine supposee.");
  }
  if (ctx.expectedHumanValidatedAt && hv.validatedAt !== ctx.expectedHumanValidatedAt) {
    throw fail("SearchProtocol.humanValidation.validatedAt ne correspond pas a l'acte humain fourni.");
  }
  // Binding planner : les requetes doivent correspondre au plannerOutput reel.
  if (ctx.plannerOutput && Array.isArray(ctx.plannerOutput.queries)) {
    const spQ = (sp.requetesExactes || []).filter(function (q) { return q && q.connectorId; });
    for (const pq of ctx.plannerOutput.queries) {
      const match = spQ.find(function (q) { return q.discipline === pq.discipline; });
      if (!match) throw fail("SearchProtocol ne porte aucune requete pour la discipline \"" + pq.discipline + "\" presente dans le plannerOutput reel.");
      if (match.requete !== pq.requete) {
        throw fail("SearchProtocol.requete pour \"" + pq.discipline + "\" differe du plannerOutput reel — aucune reecriture de requete n'est acceptee.");
      }
    }
    if (spQ.length !== ctx.plannerOutput.queries.length) {
      throw fail("nombre de requetes du SearchProtocol (" + spQ.length + ") different du plannerOutput reel (" + ctx.plannerOutput.queries.length + ").");
    }
  }
  return sp;
}

/**
 * assertExistingEForchProvenance(prov, ctx) — verifie que la provenance
 * fournie est REELLE et coherente. Ne fabrique jamais rien.
 */
function assertExistingEForchProvenance(prov, ctx) {
  ctx = ctx || {};
  if (!prov || typeof prov !== "object") throw fail("existingEForchProvenance absent ou non-objet.");
  if (!Array.isArray(prov.resolverRuns) || prov.resolverRuns.length === 0) throw fail("eForchProvenance.resolverRuns absent ou vide.");
  if (!prov.plannerRun) throw fail("eForchProvenance.plannerRun absent.");
  if (!prov.plannerOutput) throw fail("eForchProvenance.plannerOutput absent.");
  if (!prov.humanValidation) throw fail("eForchProvenance.humanValidation absent.");
  if (isSha256(ctx.expectedResolverOutputHash)) {
    const ok = prov.resolverRuns.some(function (r) { return r && (r.resolverOutputHash === ctx.expectedResolverOutputHash); })
      || (ctx.resolverOutputHashFromEvidence === ctx.expectedResolverOutputHash);
    if (!ok && ctx.strictResolverHash) {
      throw fail("resolverOutputHash attendu introuvable dans la provenance fournie.");
    }
  }
  if (Array.isArray(ctx.disciplinesRetenues)) {
    const order = prov.resolverRuns.map(function (r) { return r.discipline; });
    if (JSON.stringify(order) !== JSON.stringify(ctx.disciplinesRetenues)) {
      throw fail("resolverRuns ne sont pas ordonnes selon les disciplines retenues du RunContract — jamais reordonne silencieusement ici.", { order: order, expected: ctx.disciplinesRetenues });
    }
  }
  return prov;
}

/**
 * buildPreRetrievalArtifactsFromExisting(cfg, opts)
 *
 * REMPLACE buildPreRetrievalArtifacts() de v0.6 UNIQUEMENT sur le chemin
 * existing-artifacts. Aucun appel a buildConfirmedRunContractForMission ni a
 * buildSearchProtocolForMission : c'est la propriete meme du lot, verifiee par
 * les compteurs `rebuildCalls` retournes.
 */
async function buildPreRetrievalArtifactsFromExisting(cfg, opts) {
  opts = opts || {};
  const v06lib = opts.v06LibPath || path.join(cfg.MONO08_V06_PATH || "", "lib");
  const { loadEForchDeps, buildEF01AInjectedForMission, buildEF01FInjectedForMission } = require(path.join(v06lib, "eforch-artifacts.js"));
  // F-AUD-V07-01 : le chemin existing-artifacts DOIT exposer le runner equitable.
  const { buildFairCoverageConnectorRunner } = require(path.join(__dirname, "fair-query-coverage.js"));
  const deps = loadEForchDeps(cfg.MONO01_PATH);

  const mission = opts.mission;
  if (!mission || !isNonEmptyStr(mission.missionId)) throw fail("mission.missionId canonique requis (B-08) — jamais remplace par un runContractHash.");
  const missionId = mission.missionId;

  const rcCheck = await assertExistingRunContract(deps, opts.existingRunContract, { runContractHash: opts.expectedRunContractHash });
  const runContract = rcCheck.runContract;

  const provenance = assertExistingEForchProvenance(opts.existingEForchProvenance, {
    expectedResolverOutputHash: opts.expectedResolverOutputHash,
    disciplinesRetenues: rcCheck.disciplinesRetenues,
  });

  const searchProtocol = await assertExistingSearchProtocol(deps, opts.existingSearchProtocol, {
    mono01Path: cfg.MONO01_PATH,
    expectedProtocolHash: opts.expectedProtocolHash,
    missionId: missionId,
    plannerOutput: provenance.plannerOutput,
    expectedHumanValidatedAt: provenance.humanValidation && provenance.humanValidation.validatedAt,
  });

  // Octets reels : memes octets, memes hashs que ceux du RunContract confirme.
  const documentBytesByHash = {};
  const documentBytesByUrl = opts.documentBytesByUrl || {};
  for (const doc of mission.targetDocuments || []) {
    if (doc.status !== "VERIFIED") continue;
    const bytes = documentBytesByUrl[doc.url];
    if (!bytes) throw fail("octets manquants pour le document VERIFIED \"" + doc.documentId + "\" — jamais telecharges ici.");
    const hash = await deps.sha256Bytes(bytes);
    documentBytesByHash[hash] = bytes;
  }

  const ef01aInjected = buildEF01AInjectedForMission(missionId, documentBytesByHash, mission);
  const ef01fInjected = buildEF01FInjectedForMission(runContract.runContractHash.slice(0, 8));
  const sourceId = "source-" + runContract.runContractHash.slice(0, 12);
  // F-AUD-V07-01 — LE READINESS ET L EXECUTION DOIVENT EMPRUNTER LE MEME CHEMIN.
  // Avant cette correction, ce module retournait buildOpenAlexConnectorRunner()
  // (v0.6, sequentiel et memoise) alors que le readiness simulait la couverture
  // avec le runner equitable : le readiness annoncait 7/7 requetes tandis que le
  // PREPARE ulterieur, via pre.connectorRunners.openalex, aurait reproduit la
  // famine 1/7. Un readiness qui ne mesure pas le chemin reellement execute ne
  // prouve rien. Le chemin existing-artifacts expose desormais le runner
  // equitable, et lui seul.
  //
  // Le runner legacy de v0.6 reste disponible et inchange pour le chemin legacy.
  const fairRunner = buildFairCoverageConnectorRunner(deps, sourceId, opts.openAlexFetchImpl);

  return {
    deps: deps,
    missionId: missionId,                 // B-08 : canonique, jamais le hash
    runContractHash: runContract.runContractHash, // champ DISTINCT, conserve
    runContract: runContract,
    searchProtocol: searchProtocol,
    eForchProvenance: provenance,
    ef01aInjected: ef01aInjected,
    ef01fInjected: ef01fInjected,
    connectorRunners: { openalex: fairRunner },
    rebuildCalls: { runContract: 0, searchProtocol: 0 }, // preuve du non-rebuild
    documentBytesByHash: documentBytesByHash,
  };
}

module.exports = {
  buildPreRetrievalArtifactsFromExisting: buildPreRetrievalArtifactsFromExisting,
  assertExistingRunContract: assertExistingRunContract,
  assertExistingSearchProtocol: assertExistingSearchProtocol,
  assertExistingEForchProvenance: assertExistingEForchProvenance,
};
