"use strict";
/**
 * MONO-09 v0.2 — lib/professional-adapter.js
 *
 * CORRECTION A-04. Adaptateur CONCRET implementant exactement les trois
 * methodes attendues par MONO-01/ports/professional-pipeline-port.js :
 *   discoverProfessionals   (EF-02A) : {corpusSnapshot, missionDimensionSet}
 *                                     -> EvidenceForge.ProfessionalDiscovery / EF-02A-v2
 *   verifyProfessionals     (EF-02B) : {professionalDiscovery}
 *                                     -> EvidenceForge.ProfessionalVerification / EF-02B-v2
 *   buildProfessionalCorpus (EF-02C) : {professionalVerification}
 *                                     -> EvidenceForge.ProfessionalCorpusSet / EF-02C-v2
 *
 * Le port appelle `adapter[methode](inputs, ctx)` avec inputs = objet nomme
 * (MONO-01/lib/port-factory.js l.196). Les schemaVersion sont valides par le
 * port EN ENTREE ET EN SORTIE : ils sont donc poses litteralement ici,
 * conformement au contrat gele, jamais devines.
 *
 * Toutes les dependances externes (resolution d'identite, expansion,
 * recuperation de travaux) sont INJECTEES. Ce module n'ouvre jamais le reseau.
 */

const { normalizeProfessionalDiscoveryInput } = require("./corpus-snapshot-normalizer.js");
const { normalizeWork, assertNoFabricatedIdentifiers } = require("./identifier-policy.js");

const STATUS = { SEED: "SEED_CANDIDATE", DISCOVERED: "DISCOVERED_CANDIDATE", VERIFIED: "VERIFIED_PROFESSIONAL" };
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/** Graines depuis l'entree REELLE d'EF-02A. Aucune fusion par nom seul. */
function buildSeedCandidates(normalized) {
  const byKey = new Map();
  normalized.includedSources.forEach(function (s) {
    if (!s.authorsRaw) return;
    s.authorsRaw.split(",").map((x) => x.trim()).filter((x) => x.length > 1).forEach(function (name) {
      // Cle = nom + oeuvre-source : deux homonymes issus d'oeuvres differentes
      // restent DISTINCTS tant qu'aucun identifiant fournisseur ne les relie.
      const key = name + " @ " + (s.providerWorkId || s.localSourceId || "");
      if (!byKey.has(key)) {
        byKey.set(key, {
          displayName: name, status: STATUS.SEED,
          providerAuthorId: null, orcid: null, affiliation: null,
          seedReferences: [], disciplines: [], evidenceRefs: [], provenance: [], identityAmbiguity: null,
        });
      }
      const c = byKey.get(key);
      c.seedReferences.push({ providerWorkId: s.providerWorkId, localSourceId: s.localSourceId, titre: s.titre });
      if (s.providerWorkId) c.evidenceRefs.push(s.providerWorkId);
      if (s.discipline && c.disciplines.indexOf(s.discipline) === -1) c.disciplines.push(s.discipline);
      c.provenance.push({
        origin: "HUMAN_INCLUDED_SOURCE", localSourceId: s.localSourceId,
        providerWorkId: s.providerWorkId, queryLineage: s.queryLineage, evidenceProvenance: s.evidenceProvenance,
      });
    });
  });
  // Homonymie signalee, jamais fusionnee.
  const byName = new Map();
  Array.from(byKey.values()).forEach((c) => { byName.set(c.displayName, (byName.get(c.displayName) || 0) + 1); });
  return Array.from(byKey.values()).map(function (c) {
    if (byName.get(c.displayName) > 1) c.identityAmbiguity = "HOMONYM_UNRESOLVED_WITHOUT_PROVIDER_ID";
    return c;
  });
}

/**
 * createProfessionalPipelineAdapter(deps)
 * deps.resolveAuthorIdentity(seed)   -> {providerAuthorId?, orcid?, affiliation?}
 * deps.expandRelatedAuthors(seed)    -> [{providerAuthorId, displayName, relation?, disciplines?}]
 * deps.fetchAuthorWorks(verified)    -> [oeuvres brutes fournisseur]
 * Chacune est optionnelle : absente, l'etape correspondante ne produit rien
 * plutot que d'inventer.
 */
function createProfessionalPipelineAdapter(deps) {
  deps = deps || {};
  const resolveAuthorIdentity = typeof deps.resolveAuthorIdentity === "function" ? deps.resolveAuthorIdentity : null;
  const expandRelatedAuthors = typeof deps.expandRelatedAuthors === "function" ? deps.expandRelatedAuthors : null;
  const fetchAuthorWorks = typeof deps.fetchAuthorWorks === "function" ? deps.fetchAuthorWorks : null;

  async function discoverProfessionals(inputs) {
    const normalized = normalizeProfessionalDiscoveryInput(inputs.corpusSnapshot, inputs.missionDimensionSet);
    const seeds = buildSeedCandidates(normalized);

    if (resolveAuthorIdentity) {
      for (const s of seeds) {
        let r = null;
        try { r = await resolveAuthorIdentity(s); } catch (e) { s.resolutionError = String((e && e.message) || e); }
        if (r && isStr(r.providerAuthorId)) {
          s.providerAuthorId = r.providerAuthorId;
          s.orcid = isStr(r.orcid) ? r.orcid : null;
          s.affiliation = isStr(r.affiliation) ? r.affiliation : null;
          s.resolutionStatus = "RESOLVED";
          s.provenance.push({ origin: "PROVIDER_AUTHOR_RESOLUTION", providerAuthorId: r.providerAuthorId });
        } else {
          s.resolutionStatus = s.resolutionError ? "RESOLUTION_ERROR" : "UNRESOLVED";
        }
      }
    } else {
      seeds.forEach((s) => { s.resolutionStatus = "NOT_ATTEMPTED"; });
    }

    const seedNames = new Set(seeds.map((s) => s.displayName));
    const secondary = new Map();
    if (expandRelatedAuthors) {
      for (const s of seeds) {
        if (!s.providerAuthorId) continue; // jamais d'expansion depuis une identite non resolue
        let list = [];
        try { list = (await expandRelatedAuthors(s)) || []; } catch (e) { continue; }
        for (const c of list) {
          if (!isStr(c.providerAuthorId) || !isStr(c.displayName)) continue;
          if (seedNames.has(c.displayName) || secondary.has(c.providerAuthorId)) continue;
          secondary.set(c.providerAuthorId, {
            displayName: c.displayName, status: STATUS.DISCOVERED,
            providerAuthorId: c.providerAuthorId, orcid: isStr(c.orcid) ? c.orcid : null,
            affiliation: isStr(c.affiliation) ? c.affiliation : null,
            seedReferences: [], evidenceRefs: Array.isArray(c.evidenceRefs) ? c.evidenceRefs : [],
            disciplines: Array.isArray(c.disciplines) ? c.disciplines : s.disciplines.slice(),
            identityAmbiguity: null,
            provenance: [{
              origin: "SECONDARY_DISCOVERY", viaSeed: s.displayName,
              viaSeedAuthorId: s.providerAuthorId, relation: c.relation || "UNSPECIFIED",
            }],
          });
        }
      }
    }

    const all = seeds.concat(Array.from(secondary.values()));
    const promoted = all.filter((c) => c.status === STATUS.VERIFIED);
    if (promoted.length) {
      const e = new Error("ANTI_CIRCULARITY_VIOLATION: la decouverte ne verifie jamais un candidat — seul EF-02B le fait.");
      e.code = "ANTI_CIRCULARITY_VIOLATION";
      throw e;
    }

    return {
      schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2",
      missionId: normalized.missionId, discoveryPolicy: "EVIDENCE_FIRST_SEED_AND_SECONDARY",
      candidates: all.map(function (c) {
        return {
          candidateRef: c.providerAuthorId, displayName: c.displayName,
          dimensionRef: c.disciplines[0] || null, source: "openalex",
          orcid: c.orcid, affiliation: c.affiliation,
          candidateStatus: c.status, identityAmbiguity: c.identityAmbiguity,
          resolutionStatus: c.resolutionStatus || null,
          seedReferences: c.seedReferences, evidenceRefs: c.evidenceRefs, provenance: c.provenance,
        };
      }),
      inputStats: normalized.stats,
      antiCircularity: {
        rule: "SEED_AUTHOR n'est jamais AUTOMATIC_PANEL_MEMBER",
        seedCandidates: seeds.length, discoveredCandidates: secondary.size, verifiedByDiscovery: 0,
      },
    };
  }

  async function verifyProfessionals(inputs) {
    const disc = inputs.professionalDiscovery || {};
    const verified = (disc.candidates || []).map(function (c) {
      // La verification reste DOCUMENTAIRE : elle constate ce que le fournisseur
      // atteste, elle ne juge personne. Aucune identite n'est completee.
      const hasOrcid = isStr(c.orcid);
      const hasProviderId = isStr(c.candidateRef);
      let method, status;
      if (c.identityAmbiguity) { method = "AMBIGUOUS_IDENTITY"; status = "AMBIGUOUS"; }
      else if (hasOrcid) { method = "ORCID_PRESENT"; status = "VERIFIED"; }
      else if (hasProviderId) { method = "PROVIDER_ID_ONLY"; status = "UNVERIFIED"; }
      else { method = "NO_STRONG_IDENTIFIER"; status = "UNVERIFIED"; }
      return {
        candidateRef: c.candidateRef, displayName: c.displayName,
        verificationMethod: method, verificationStatus: status,
        verifiedIdentifiers: hasOrcid ? { orcid: c.orcid } : {},
        affiliation: c.affiliation || null, evidenceRefs: c.evidenceRefs || [],
        candidateStatus: c.candidateStatus, provenance: c.provenance || [],
      };
    });
    return {
      schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2",
      missionId: disc.missionId || null, verified: verified,
      summary: {
        total: verified.length,
        verified: verified.filter((v) => v.verificationStatus === "VERIFIED").length,
        unverified: verified.filter((v) => v.verificationStatus === "UNVERIFIED").length,
        ambiguous: verified.filter((v) => v.verificationStatus === "AMBIGUOUS").length,
      },
    };
  }

  async function buildProfessionalCorpus(inputs) {
    const ver = inputs.professionalVerification || {};
    const professionalCorpora = [];
    for (const v of (ver.verified || [])) {
      if (v.verificationStatus !== "VERIFIED") continue; // ambigu et non verifie restent hors corpus
      let raw = [];
      if (fetchAuthorWorks) {
        try {
          raw = (await fetchAuthorWorks(v)) || [];
        } catch (e) {
          professionalCorpora.push({
            professionalRef: v.candidateRef, status: "error", error: String((e && e.message) || e),
            identityRef: { displayName: v.displayName }, corpus: { works: [] }, summary: { workCount: 0 },
          });
          continue;
        }
      }
      const norm = raw.map(normalizeWork);
      const usable = norm.filter((w) => w.usable);
      professionalCorpora.push({
        professionalRef: v.candidateRef, status: "complete",
        identityRef: { displayName: v.displayName, orcid: (v.verifiedIdentifiers && v.verifiedIdentifiers.orcid) || null },
        corpus: {
          works: usable.map(function (w) {
            return {
              workRef: w.workRef, providerNativeId: w.providerNativeId, title: w.title,
              doi: w.doi, doiStatus: w.doiStatus, publicationYear: w.publicationYear, topics: w.topics,
              identifierProvenance: w.identifierProvenance,
            };
          }),
        },
        summary: {
          workCount: usable.length, discardedWithoutIdentity: norm.length - usable.length,
          worksWithoutDoi: usable.filter((w) => w.doi === null).length,
        },
      });
    }
    assertNoFabricatedIdentifiers(professionalCorpora); // fail-closed
    return {
      schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2",
      missionId: ver.missionId || null, professionalCorpora: professionalCorpora,
    };
  }

  return { discoverProfessionals, verifyProfessionals, buildProfessionalCorpus };
}

module.exports = { createProfessionalPipelineAdapter, buildSeedCandidates, STATUS };
