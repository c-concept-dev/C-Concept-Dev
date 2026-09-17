"use strict";
/**
 * MONO-09 v0.2 — lib/corpus-snapshot-normalizer.js
 *
 * CORRECTION A-04b. v0.1 attendait `sources[].sourceId`, `sources[].providerNativeId`
 * et un objet `auditDecisions` separe lie par snapshotHash. Ce n'est PAS la forme
 * recue par EF-02A. Le CorpusSnapshot reel (observe dans le run du 2026-09-08)
 * porte, par source :
 *     id                              (et non sourceId)
 *     provenance.originalReference    (et non providerNativeId)
 *     statutScreening                 (inline, et non une liste de decisions)
 * v0.1 ne levait pas : elle rendait 0 graine EN SILENCE. Le normalizer refuse
 * desormais toute forme inattendue plutot que de rendre un ensemble vide.
 */

const REQUIRED_SCHEMA = "EvidenceForge.CorpusSnapshot";

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }

function fail(code, message, details) {
  const e = new Error(code + ": " + message); e.code = code; e.details = details || null; throw e;
}

/**
 * normalizeProfessionalDiscoveryInput(corpusSnapshot, missionDimensionSet)
 *   -> { missionId, dimensions[], includedSources[], stats }
 * Aucune donnee inventee ; le lineage de chaque source est conserve entier.
 */
function normalizeProfessionalDiscoveryInput(corpusSnapshot, missionDimensionSet) {
  if (!corpusSnapshot || typeof corpusSnapshot !== "object") fail("CORPUS_SNAPSHOT_MISSING", "CorpusSnapshot absent.");
  if (corpusSnapshot.schema !== REQUIRED_SCHEMA) {
    fail("CORPUS_SNAPSHOT_SCHEMA_MISMATCH", "schema attendu " + REQUIRED_SCHEMA + ", recu \"" + corpusSnapshot.schema + "\".");
  }
  if (!Array.isArray(corpusSnapshot.sources)) fail("CORPUS_SNAPSHOT_SOURCES_MISSING", "sources[] absent.");
  if (corpusSnapshot.sources.length === 0) fail("CORPUS_SNAPSHOT_SOURCES_EMPTY", "sources[] vide — aucune graine possible, jamais masque en resultat vide.");

  const withStatus = corpusSnapshot.sources.filter(function (s) { return s && isNonEmptyStr(s.statutScreening); });
  if (withStatus.length === 0) {
    fail("CORPUS_SNAPSHOT_SHAPE_UNEXPECTED",
      "aucune source ne porte statutScreening — la forme recue ne correspond pas au CorpusSnapshot d'EF-02A. Refus explicite plutot qu'un ensemble vide silencieux.",
      { firstSourceKeys: Object.keys(corpusSnapshot.sources[0] || {}) });
  }

  const dims = (missionDimensionSet && Array.isArray(missionDimensionSet.dimensions)) ? missionDimensionSet.dimensions : [];

  const includedSources = [];
  let noIdentity = 0;
  corpusSnapshot.sources.forEach(function (s) {
    if (s.statutScreening !== "inclus") return;
    const providerWorkId = (s.provenance && isNonEmptyStr(s.provenance.originalReference)) ? s.provenance.originalReference : null;
    if (!providerWorkId) noIdentity++;
    includedSources.push({
      localSourceId: isNonEmptyStr(s.id) ? s.id : null,        // compteur positionnel, JAMAIS une identite
      providerWorkId: providerWorkId,                           // identite forte, ou null
      titre: isNonEmptyStr(s.titre) ? s.titre : null,
      authorsRaw: isNonEmptyStr(s.auteurOuOrganisme) ? s.auteurOuOrganisme : null,
      reference: isNonEmptyStr(s.reference) ? s.reference : null,
      discipline: isNonEmptyStr(s.discipline) ? s.discipline : null,   // porte le lineage de requete
      queryLineage: { discipline: isNonEmptyStr(s.discipline) ? s.discipline : null,
        connectorId: (s.provenance && s.provenance.connectorId) || null,
        retrievalMethod: (s.provenance && s.provenance.retrievalMethod) || null },
      evidenceProvenance: { corpusSnapshotId: corpusSnapshot.id || null, protocolRef: corpusSnapshot.protocolRef || null,
        localSourceId: isNonEmptyStr(s.id) ? s.id : null, statutScreening: s.statutScreening },
    });
  });

  return { missionId: corpusSnapshot.missionId || null, dimensions: dims, includedSources: includedSources,
    stats: { totalSources: corpusSnapshot.sources.length, included: includedSources.length,
      includedWithoutProviderWorkId: noIdentity, dimensions: dims.length } };
}

module.exports = { normalizeProfessionalDiscoveryInput, REQUIRED_SCHEMA };
