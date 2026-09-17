"use strict";
/**
 * MONO-09 v0.1 — lib/seed-discovery.js
 *
 * Decouverte professionnelle EVIDENCE-FIRST, en remplacement additif de
 * MONO-08/v0.6/lib/real-external-adapter.js::discoverProfessionals, qui
 * interroge GET /authors?search=<label de discipline>. Ce label est le
 * slug technique de la discipline ("ethique-appliquee"), pas une requete
 * de pertinence : la recherche renvoie des auteurs dont le NOM ressemble
 * au slug. Constat empirique du run reel du 2026-09-08 :
 *   "epistemologie"                     -> 3 enregistrements qui sont des
 *                                          titres d'article, pas des personnes
 *   "ethique-appliquee"                 -> 0
 *   "methodologie-recherche-qualitative"-> 0
 *   via la passerelle                   -> 0 candidat sur 7 disciplines
 *
 * STRATEGIE : partir des oeuvres REELLEMENT RETENUES par l'audit humain.
 * Leurs auteurs sont des GRAINES (seeds), pas des experts.
 *
 * ANTI-CIRCULARITE, invariant central :
 *     SEED_AUTHOR != AUTOMATIC_PANEL_MEMBER
 * Une graine n'est jamais promue candidate verifiee, ni panelist, ni twin
 * par ce module. Elle est proposee a EF-02B, qui decide seul.
 */

const STATUS = { SEED: "SEED_CANDIDATE", DISCOVERED: "DISCOVERED_CANDIDATE", VERIFIED: "VERIFIED_PROFESSIONAL" };

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }

/**
 * extractSeedAuthors({ snapshot, auditDecisions }) -> seeds[]
 * N'utilise QUE les sources dont la decision humaine est "inclus".
 * Aucun auteur n'est invente : seuls les noms reellement portes par le
 * snapshot sont retenus, avec leur lineage documentaire complet.
 */
function extractSeedAuthors(opts) {
  const snapshot = opts && opts.snapshot;
  const auditDecisions = opts && opts.auditDecisions;
  if (!snapshot || !Array.isArray(snapshot.sources)) throw new Error("extractSeedAuthors: snapshot requis.");
  if (!auditDecisions || !Array.isArray(auditDecisions.decisions)) throw new Error("extractSeedAuthors: auditDecisions requis.");
  if (auditDecisions.snapshotHash !== snapshot.snapshotHash) {
    const e = new Error("SEED_BINDING_MISMATCH: les decisions ne sont pas liees a ce snapshot — jamais accepte silencieusement.");
    e.code = "SEED_BINDING_MISMATCH"; throw e;
  }
  const included = new Set(auditDecisions.decisions.filter(function (d) { return d.decision === "inclus"; }).map(function (d) { return d.sourceId; }));
  const byName = new Map();
  snapshot.sources.forEach(function (s) {
    if (!included.has(s.sourceId)) return;
    const raw = isNonEmptyStr(s.auteurOuOrganisme) ? s.auteurOuOrganisme : "";
    raw.split(",").map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 1; }).forEach(function (name) {
      if (!byName.has(name)) {
        byName.set(name, { displayName: name, status: STATUS.SEED, providerAuthorId: null,
          orcid: null, institution: null, seedWorks: [], disciplines: [], provenance: [] });
      }
      const a = byName.get(name);
      a.seedWorks.push({ sourceId: s.sourceId, providerNativeId: s.providerNativeId || null, titre: s.titre || null, discipline: s.discipline || null });
      if (s.discipline && a.disciplines.indexOf(s.discipline) === -1) a.disciplines.push(s.discipline);
      a.provenance.push({ origin: "HUMAN_INCLUDED_SOURCE", sourceId: s.sourceId, snapshotHash: snapshot.snapshotHash });
    });
  });
  return Array.from(byName.values());
}

/**
 * resolveAuthorIdentities(seeds, resolver) — resout l'identifiant auteur
 * chez le fournisseur. `resolver(seed)` est injecte (jamais de reseau ici).
 * Un echec de resolution laisse providerAuthorId a null : JAMAIS devine.
 */
async function resolveAuthorIdentities(seeds, resolver) {
  if (typeof resolver !== "function") throw new Error("resolveAuthorIdentities: resolver requis (injecte, jamais implicite).");
  const out = [];
  for (const s of seeds) {
    let r = null;
    try { r = await resolver(s); } catch (e) { r = { error: String(e && e.message ? e.message : e) }; }
    const resolved = Object.assign({}, s);
    if (r && isNonEmptyStr(r.providerAuthorId)) {
      resolved.providerAuthorId = r.providerAuthorId;
      resolved.orcid = isNonEmptyStr(r.orcid) ? r.orcid : null;
      resolved.institution = isNonEmptyStr(r.institution) ? r.institution : null;
      resolved.resolutionStatus = "RESOLVED";
      resolved.provenance = resolved.provenance.concat([{ origin: "PROVIDER_AUTHOR_RESOLUTION", providerAuthorId: r.providerAuthorId }]);
    } else {
      resolved.resolutionStatus = r && r.error ? "RESOLUTION_ERROR" : "UNRESOLVED";
      resolved.resolutionError = (r && r.error) || null;
    }
    out.push(resolved);
  }
  return out;
}

/**
 * discoverSecondaryCandidates(seeds, expander) — decouverte SECONDAIRE, pour
 * que le panel ne se reduise pas aux auteurs deja inclus (Phase 4 du mandat).
 * `expander` est injecte. Les candidats produits portent DISCOVERED_CANDIDATE
 * et une provenance distincte des graines.
 */
async function discoverSecondaryCandidates(seeds, expander, opts) {
  if (typeof expander !== "function") throw new Error("discoverSecondaryCandidates: expander requis.");
  opts = opts || {};
  const seedNames = new Set(seeds.map(function (s) { return s.displayName; }));
  const byId = new Map();
  for (const s of seeds) {
    if (!s.providerAuthorId) continue; // jamais d'expansion depuis une identite non resolue
    let list = [];
    try { list = (await expander(s)) || []; } catch (e) { continue; }
    for (const c of list) {
      if (!isNonEmptyStr(c.providerAuthorId) || !isNonEmptyStr(c.displayName)) continue;
      if (seedNames.has(c.displayName)) continue;        // deja une graine
      if (byId.has(c.providerAuthorId)) continue;
      byId.set(c.providerAuthorId, {
        displayName: c.displayName, status: STATUS.DISCOVERED, providerAuthorId: c.providerAuthorId,
        orcid: isNonEmptyStr(c.orcid) ? c.orcid : null,
        institution: isNonEmptyStr(c.institution) ? c.institution : null,
        seedWorks: [], disciplines: Array.isArray(c.disciplines) ? c.disciplines : (s.disciplines || []),
        documentaryLink: c.documentaryLink || null,
        provenance: [{ origin: "SECONDARY_DISCOVERY", viaSeed: s.displayName, viaSeedAuthorId: s.providerAuthorId, relation: c.relation || "UNSPECIFIED" }],
      });
    }
  }
  return Array.from(byId.values());
}

/**
 * buildDiscoveryOutput(candidates, missionContext) — forme EF-02A.
 * Aucun candidat n'est marque verifie. La verification appartient a EF-02B.
 */
function buildDiscoveryOutput(candidates, missionContext) {
  const bad = candidates.filter(function (c) { return c.status === STATUS.VERIFIED; });
  if (bad.length) {
    const e = new Error("ANTI_CIRCULARITY_VIOLATION: " + bad.length + " candidat(s) marque(s) VERIFIED_PROFESSIONAL par la decouverte — seul EF-02B verifie.");
    e.code = "ANTI_CIRCULARITY_VIOLATION"; throw e;
  }
  return {
    schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2",
    missionId: missionContext.missionId,
    discoveryPolicy: "EVIDENCE_FIRST_SEED_AND_SECONDARY",
    candidates: candidates.map(function (c) {
      return { candidateRef: c.providerAuthorId, displayName: c.displayName,
        dimensionRef: (c.disciplines && c.disciplines[0]) || null, source: "openalex",
        orcid: c.orcid, institution: c.institution,
        candidateStatus: c.status, seedWorkCount: (c.seedWorks || []).length,
        provenance: c.provenance };
    }),
    antiCircularity: { rule: "SEED_AUTHOR != AUTOMATIC_PANEL_MEMBER",
      seedCandidates: candidates.filter(function (c) { return c.status === STATUS.SEED; }).length,
      discoveredCandidates: candidates.filter(function (c) { return c.status === STATUS.DISCOVERED; }).length,
      verifiedByDiscovery: 0 },
  };
}

module.exports = { extractSeedAuthors, resolveAuthorIdentities, discoverSecondaryCandidates, buildDiscoveryOutput, STATUS };
