// EvidenceForge — EF-02E — ExclusionRegistrySet — v1
//
// Gouvernance reprise et renforcée depuis EF-02G0-AUDIT-CLOSURE-v0.2 : une
// identité bibliographique vérifiée (nameMatch + hasAnchor + absence de
// contradiction ORCID) ne suffit JAMAIS à elle seule à rendre un
// professionnel éligible à un jumeau documentaire. Le registre d'exclusion
// est une vraie sortie structurée, jamais une simple note, et reste
// consultable/traçable indépendamment de la construction elle-même.
"use strict";

function str(v) { return String(v == null ? "" : v).trim(); }
function arr(v) { return Array.isArray(v) ? v : []; }

const EXCLUSION_REASONS = [
  "excluded_before_twin",       // personne exclue avant twin (décision amont, ex. opposition connue)
  "identity_ambiguous",         // identité ambiguë (conflit ORCID, homonymie)
  "insufficient_corpus",        // corpus insuffisant (EF-02D1)
  "methodological_exclusion",   // exclusion méthodologique (ex. hors panel, hors mission)
  "withdrawn_after_construction" // retrait après construction (twin existait, retiré)
];
const EXCLUSION_STATUSES = ["active", "inactive"];
const CONTEST_STATUSES = ["none", "contested", "honored"];

function normId(v) {
  return str(v).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// buildExclusionRegistry(entries) -> ExclusionRegistrySet / EF-GOV-REG-v1
// Chaque entrée est validée strictement : raison connue, statut connu,
// provenance et date obligatoires. Le registre peut être vide (aucune
// exclusion connue), jamais absent.
// ---------------------------------------------------------------------------
function buildExclusionRegistry(entries, snapshotDate) {
  const cleaned = arr(entries).map((e, i) => {
    const professionalRef = str(e.professionalRef);
    const identifiers = {
      openAlexAuthorId: e.identifiers && e.identifiers.openAlexAuthorId ? str(e.identifiers.openAlexAuthorId) : null,
      orcid: e.identifiers && e.identifiers.orcid ? str(e.identifiers.orcid) : null,
      displayName: e.identifiers && e.identifiers.displayName ? str(e.identifiers.displayName) : null
    };
    if (!professionalRef && !identifiers.openAlexAuthorId && !identifiers.orcid) {
      throw new Error("buildExclusionRegistry: entrée #" + i + " sans professionalRef ni identifiant — une exclusion doit être rattachable.");
    }
    if (!EXCLUSION_REASONS.includes(e.reason)) {
      throw new Error("buildExclusionRegistry: entrée #" + i + " — raison invalide (\"" + e.reason + "\").");
    }
    const status = e.status || "active";
    if (!EXCLUSION_STATUSES.includes(status)) throw new Error("buildExclusionRegistry: entrée #" + i + " — statut invalide (\"" + status + "\").");
    const contestStatus = e.contestStatus || "none";
    if (!CONTEST_STATUSES.includes(contestStatus)) throw new Error("buildExclusionRegistry: entrée #" + i + " — contestStatus invalide (\"" + contestStatus + "\").");
    if (!str(e.date)) throw new Error("buildExclusionRegistry: entrée #" + i + " sans date — jamais générée ici (Date.now() interdit).");
    if (!str(e.decisionProvenance)) throw new Error("buildExclusionRegistry: entrée #" + i + " sans decisionProvenance — la provenance de la décision est obligatoire.");
    return {
      entryId: str(e.entryId) || ("excl-" + i),
      professionalRef: professionalRef || null,
      identifiers,
      reason: e.reason,
      rationale: str(e.rationale),
      status,
      contestStatus,
      date: str(e.date),
      decisionProvenance: str(e.decisionProvenance)
    };
  });
  return {
    schema: "EvidenceForge.ExclusionRegistrySet",
    schemaVersion: "EF-GOV-REG-v1",
    snapshotDate: str(snapshotDate) || null,
    entries: cleaned
  };
}

function assertRegistry(registry) {
  if (!registry || registry.schema !== "EvidenceForge.ExclusionRegistrySet" || registry.schemaVersion !== "EF-GOV-REG-v1" || !Array.isArray(registry.entries)) {
    throw new Error("ExclusionRegistrySet (EF-GOV-REG-v1) invalide ou manquant — obligatoire même vide.");
  }
}

// ---------------------------------------------------------------------------
// findActiveExclusion(registry, professionalRef, identityRef) — recherche
// par professionalRef OU par identifiant normalisé (openAlexAuthorId/orcid),
// jamais par nom seul (trop faible, sujet à collision).
// ---------------------------------------------------------------------------
function findActiveExclusion(registry, professionalRef, identityRef) {
  assertRegistry(registry);
  const oaId = identityRef && identityRef.openAlexAuthorId ? normId(identityRef.openAlexAuthorId) : null;
  const orcid = identityRef && identityRef.orcid ? normId(identityRef.orcid) : null;
  return registry.entries.find((e) => {
    if (e.status !== "active") return false;
    if (professionalRef && e.professionalRef === professionalRef) return true;
    if (oaId && e.identifiers.openAlexAuthorId && normId(e.identifiers.openAlexAuthorId) === oaId) return true;
    if (orcid && e.identifiers.orcid && normId(e.identifiers.orcid) === orcid) return true;
    return false;
  }) || null;
}

// ---------------------------------------------------------------------------
// deactivateExclusion(registry, entryId, reason, date, decisionProvenance)
// Une exclusion "honorée" (honored) le reste dans l'historique — elle
// devient inactive, jamais supprimée : la trace de la décision persiste.
// ---------------------------------------------------------------------------
function deactivateExclusion(registry, entryId, reason, date, decisionProvenance) {
  assertRegistry(registry);
  if (!str(date)) throw new Error("deactivateExclusion: date obligatoire.");
  if (!str(decisionProvenance)) throw new Error("deactivateExclusion: decisionProvenance obligatoire.");
  const idx = registry.entries.findIndex((e) => e.entryId === entryId);
  if (idx < 0) throw new Error("deactivateExclusion: entrée \"" + entryId + "\" introuvable.");
  const updated = registry.entries.map((e, i) => i === idx ? { ...e, status: "inactive", rationale: e.rationale + " | Désactivée : " + str(reason), date, decisionProvenance } : e);
  return { ...registry, entries: updated };
}

const EF02EExclusionRegistry = {
  buildExclusionRegistry, assertRegistry, findActiveExclusion, deactivateExclusion,
  EXCLUSION_REASONS, EXCLUSION_STATUSES, CONTEST_STATUSES
};

if (typeof module !== "undefined" && module.exports) module.exports = EF02EExclusionRegistry;
if (typeof window !== "undefined") window.EF02EExclusionRegistry = EF02EExclusionRegistry;
