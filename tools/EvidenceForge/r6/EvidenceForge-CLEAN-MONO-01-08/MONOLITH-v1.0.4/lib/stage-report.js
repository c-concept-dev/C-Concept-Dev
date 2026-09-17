"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/stage-report.js
 * RAPPORT UTILISATEUR construit EXCLUSIVEMENT depuis les artefacts du run (jamais depuis un texte libre du modele) :
 *   etabli / convergent / divergent / provisoire / non etabli / reserves / qualification / limites,
 *   et pour chaque enonce « Pourquoi EvidenceForge dit cela ? » = la lignee (constats -> jumeaux -> professionnels ->
 *   oeuvres reelles -> sources ratifiees -> requetes du plan -> sceaux et hashes).
 * SCIENTIFICALLY_USABLE est CALCULE (jamais affirme) : QUALIFIED sans reserve ET validation professionnelle humaine — jamais
 * QUALIFIED_WITH_RESERVATIONS. Le rapport ne presente jamais une qualification avec reserves comme une validation scientifique.
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const arr = (x) => (Array.isArray(x) ? x : []);

/** Vocabulaire utilisateur (mode simple) — les codes internes restent dans la lignee (mode expert). */
const LABELS = Object.freeze({
  support: "point d'appui", concern: "point de vigilance", gap: "manque documentaire", recommendation: "recommandation", not_determinable: "non déterminable",
  documented: "documenté", cautious_inference: "inférence prudente", not_determinable_e: "non déterminable",
});
const QUALIFICATION_USER = Object.freeze({
  QUALIFIED: "Processus qualifié",
  QUALIFIED_WITH_RESERVATIONS: "Processus qualifié AVEC RÉSERVES — ce n'est PAS une validation scientifique",
  NOT_QUALIFIED: "Processus NON qualifié — les résultats ne doivent pas être utilisés comme des conclusions",
  IMPOSSIBLE_TO_ASSESS: "Qualification impossible à établir",
});

function scientificallyUsable(qualification, reviewSet) {
  const status = qualification && qualification.status;
  const reservations = arr(qualification && qualification.reservations);
  const humanProfessionalValidation = !!(reviewSet && reviewSet.summary && reviewSet.summary.humanProfessionalValidation === true);
  const usable = status === "QUALIFIED" && reservations.length === 0 && humanProfessionalValidation;
  return { value: usable ? "YES" : "NO", rule: "YES seulement si status === QUALIFIED ET aucune réserve ET validation professionnelle humaine réelle ; toute réserve => NO",
    inputs: { status: status || null, reservations: reservations.length, humanProfessionalValidation } };
}

/** buildUserReport(a) — a = { state, reformulation, runContract, corpusSnapshot, screening, discovery, panel, twinSet, reviewSet, aggregation, qualification, readinessPre, readinessFull, seal, llmCounts, retrieval, lineageRefs } */
function buildUserReport(a) {
  const findingsById = new Map(), twinById = new Map();
  arr(a.reviewSet && a.reviewSet.reviews).forEach((r) => arr(r.findings).forEach((f) => findingsById.set(f.findingId, Object.assign({ twinId: r.twinId, professionalRef: r.professionalRef }, f))));
  arr(a.twinSet && a.twinSet.twins).forEach((t) => twinById.set(t.twinId, t));
  const candById = new Map(); arr(a.discovery && a.discovery.candidates).forEach((c) => { if (c.candidateRef) candById.set(c.candidateRef, c); });
  const targets = new Map(); arr(a.reviewSet && a.reviewSet.reviews).forEach((r) => targets.set(r.targetId, true));
  const targetLabels = {}; arr(a.targetDocuments).forEach((d, i) => { targetLabels["target-" + String(i + 1).padStart(2, "0")] = d.title || d.name; });
  const dimLabel = {}; arr(a.runContract && a.runContract.disciplinesProposees).forEach((d) => { dimLabel[d.id] = humanizeLabel(d.discipline || d.id); dimLabel[d.discipline] = humanizeLabel(d.discipline); });

  function lineageOf(findingIds) {
    return findingIds.map(function (id) {
      const f = findingsById.get(id); if (!f) return { findingId: id, missing: true };
      const t = twinById.get(f.twinId); const c = candById.get(f.professionalRef) || {};
      return { findingId: id, disposition: f.disposition, epistemicStatus: f.epistemicStatus, confidence: f.confidenceQualitative, finding: f.finding, rationale: f.rationale, limitations: arr(f.limitations),
        targetEvidence: arr(f.targetEvidenceRefs), twinBasisWorks: arr(f.twinBasisWorkRefs),
        twin: t ? { twinId: t.twinId, professional: { displayName: t.referenceIdentity && t.referenceIdentity.displayName, openAlexAuthorId: t.referenceIdentity && t.referenceIdentity.openAlexAuthorId, orcid: t.referenceIdentity && t.referenceIdentity.orcid, affiliation: c.affiliation || null },
          documentaryBasis: arr(t.documentaryBasis && t.documentaryBasis.worksUsed).map((w) => ({ work: w.workRef, dimensions: w.citedForDimensions })), seedSources: arr(c.seedReferences).map((s) => ({ providerWorkId: s.providerWorkId, titre: s.titre })) } : null };
    });
  }
  const statements = { etabli: [], convergent: [], divergent: [], provisoire: [], nonEtabli: [] };
  const inConvergence = new Set();
  arr(a.aggregation && a.aggregation.aggregates).forEach(function (g) {
    const ctx = { targetId: g.targetId, targetLabel: targetLabels[g.targetId] || g.targetId, dimensionId: g.dimensionId, dimensionLabel: dimLabel[g.dimensionId] || g.dimensionId };
    arr(g.convergences).forEach(function (c) {
      c.findingIds.forEach((id) => inConvergence.add(id));
      const fs_ = c.findingIds.map((id) => findingsById.get(id)).filter(Boolean);
      const dispositions = {}; fs_.forEach((f) => { dispositions[f.disposition] = (dispositions[f.disposition] || 0) + 1; });
      const dominant = Object.keys(dispositions).sort((x, y) => dispositions[y] - dispositions[x])[0] || "support";
      const documented = (c.epistemicProfile && c.epistemicProfile.documented) || 0;
      const st = Object.assign({}, ctx, { id: c.convergenceId, kind: "CONVERGENCE", dispositionDominante: dominant, dispositionLabel: LABELS[dominant], independentTwinCount: c.independentTwinCount, epistemicProfile: c.epistemicProfile,
        statement: c.rationale, targetEvidence: arr(c.targetEvidenceRefs), basisWorks: arr(c.twinBasisWorkRefs), why: lineageOf(c.findingIds) });
      /* ETABLI : convergence de points d'appui ou de vigilance, >= 2 jumeaux independants, majorite documentee ; sinon CONVERGENT */
      if (c.independentTwinCount >= 2 && documented > fs_.length / 2 && (dominant === "support" || dominant === "concern")) statements.etabli.push(st); else statements.convergent.push(st);
    });
    arr(g.divergences).forEach(function (d) {
      const branches = arr(d.branches).map((b) => { b.findingIds.forEach((id) => inConvergence.add(id)); return { position: b.position, twinCount: arr(b.contributingTwinRefs).length, epistemicStatuses: b.epistemicStatuses, why: lineageOf(b.findingIds) }; });
      statements.divergent.push(Object.assign({}, ctx, { id: d.divergenceId, kind: "DIVERGENCE", branches }));
    });
    const nd = new Set(arr(g.notDeterminable)), gaps = new Set(arr(g.evidenceGaps));
    arr(g.allFindingIds).forEach(function (id) {
      const f = findingsById.get(id); if (!f) return;
      if (nd.has(id) || gaps.has(id)) { statements.nonEtabli.push(Object.assign({}, ctx, { id, kind: nd.has(id) ? "NOT_DETERMINABLE" : "EVIDENCE_GAP", statement: f.finding, why: lineageOf([id]) })); return; }
      if (!inConvergence.has(id)) statements.provisoire.push(Object.assign({}, ctx, { id, kind: f.epistemicStatus === "cautious_inference" ? "ISOLATED_CAUTIOUS_INFERENCE" : "ISOLATED_FINDING", dispositionLabel: LABELS[f.disposition], statement: f.finding, why: lineageOf([id]) }));
    });
    arr(g.rejectedMonoTwinConvergences).forEach((r) => statements.nonEtabli.push(Object.assign({}, ctx, { id: "rejected-" + r.findingIds.join("+"), kind: "SINGLE_TWIN_CONVERGENCE_REJECTED", statement: "Une « convergence » proposée ne reposait que sur un seul jumeau : rejetée par la règle anti-mono-jumeau.", why: lineageOf(r.findingIds) })));
  });

  const q = a.qualification || {}; const su = scientificallyUsable(q, a.reviewSet);
  const reservations = [].concat(arr(q.reservations).map((r) => ({ scope: "qualification", code: r.code, detail: r.detail })), arr(a.panel && a.panel.reservations).map((r) => ({ scope: "panel", code: r.code, detail: r.detail || r.reason || "" })), arr(a.upstreamReservations).map((r) => ({ scope: "amont", code: r.code, detail: r.detail })));
  const limits = [
    "Les « jumeaux documentaires » sont des analyses construites à partir des publications réelles de professionnels identifiés ; ce ne sont ni les personnes, ni leur avis : aucun professionnel n'a été consulté.",
    "Le screening des sources a été proposé par la machine sur métadonnées et résumés réels, puis ratifié par l'utilisateur ; aucun texte intégral n'a été lu.",
    "Les angles d'expertise ont été retenus automatiquement (politique AUTO_RETAIN_VALID_PROPOSALS) sans revue humaine.",
    "Les documents fournis ont été lus tels quels (texte brut uniquement) ; aucun autre format n'est interprété.",
    "Le panel a été admis par une porte machine à base de preuves (MONO-11" + (a.seal && a.seal.mono11Version ? " " + a.seal.mono11Version : "") + "), sans acte humain : c'est une réserve permanente consignée.",
  ];
  if (a.reviewSet && a.reviewSet.summary && a.reviewSet.summary.scientificValidity === false) limits.push("Les revues sont marquées « sans validité scientifique » par le processus lui-même : les constats sont des analyses documentaires, non des résultats scientifiques.");
  const counts = { etabli: statements.etabli.length, convergent: statements.convergent.length, divergent: statements.divergent.length, provisoire: statements.provisoire.length, nonEtabli: statements.nonEtabli.length, reservations: reservations.length };
  const report = {
    schema: "EvidenceForge.UserReport", schemaVersion: "MONOLITH-v1.0", generatedAt: new Date().toISOString(), runId: a.state.runId,
    question: a.state.mission.question, missionReformulee: a.reformulation && a.reformulation.missionReformulee, perimetre: a.reformulation && a.reformulation.perimetre,
    documents: arr(a.state.mission.documents).map((d) => ({ name: d.name, sha256: d.sha256 })),
    headline: { PROCESS_QUALIFICATION: q.status || "IMPOSSIBLE_TO_ASSESS", PROCESS_QUALIFICATION_USER: QUALIFICATION_USER[q.status] || QUALIFICATION_USER.IMPOSSIBLE_TO_ASSESS, SCIENTIFICALLY_USABLE: su.value, scientificallyUsableRule: su,
      warning: q.status === "QUALIFIED_WITH_RESERVATIONS" ? "Ce rapport décrit un processus documentaire qualifié avec réserves. Il ne constitue pas une validation scientifique et ne doit pas être présenté comme telle." : (q.status === "NOT_QUALIFIED" ? "Le processus n'est pas qualifié : les énoncés ci-dessous ne sont pas utilisables comme conclusions." : null) },
    counts, pipeline: { disciplines: arr(a.runContract && a.runContract.disciplinesProposees).filter((d) => d.statut === "retenue").map((d) => humanizeLabel(d.discipline)), disciplineIds: arr(a.runContract && a.runContract.disciplinesProposees).filter((d) => d.statut === "retenue").map((d) => d.discipline), sourcesRetrieved: a.retrieval && a.retrieval.sourceCount, sourcesIncluded: arr(a.corpusSnapshot && a.corpusSnapshot.sources).filter((s) => s.statutScreening === "inclus").length,
      professionalsCandidates: arr(a.discovery && a.discovery.candidates).length, panelCounts: a.panel && a.panel.counts, twins: arr(a.twinSet && a.twinSet.twins).length, twinsBlocked: arr(a.twinSet && a.twinSet.blocked).length, reviews: a.reviewSet && a.reviewSet.summary, llm: a.llmCounts || null },
    statements, reservations, qualification: { status: q.status, criteria: arr(q.criteria), failedCriteria: arr(q.failedCriteria), unknowns: arr(q.unknowns), readinessPre: a.readinessPre && a.readinessPre.status, readinessFull: a.readinessFull && a.readinessFull.status, disclaimer: q.disclaimer || null }, limits,
    integrity: { seal: a.seal ? { mono11Version: a.seal.mono11Version, runtimeSealSha256: a.seal.runtimeSealSha256, runCodeHash: a.seal.runCodeHash, mono11ZipSha256: a.seal.mono11ZipSha256 } : null, panelHash: a.panel && a.panel.panelHash, reviewSchemaHash: a.reviewSet && a.reviewSet.reviewSchemaHash, corpusArtifact: a.lineageRefs && a.lineageRefs.corpusArtifactRef, snapshotHash: a.retrieval && a.retrieval.snapshotHash, runContractHash: a.runContract && a.runContract.runContractHash, searchProtocolHash: a.lineageRefs && a.lineageRefs.searchProtocolHash },
  };
  report.reportHash = computeReportHash(report);
  return report;
}

/** Hash canonique du rapport : exclut generatedAt, reportHash et les metadonnees d'import/export (importedFrom, exportedAt). */
const HASH_EXCLUDED = ["generatedAt", "reportHash", "importedFrom", "exportedAt"];
function computeReportHash(report) { const c = {}; Object.keys(report).sort().forEach((k) => { if (HASH_EXCLUDED.indexOf(k) === -1) c[k] = report[k]; }); return sha(JSON.stringify(c)); }
function verifyReportHash(report) { if (!report || typeof report !== "object" || !/^[0-9a-f]{64}$/.test(String(report.reportHash))) return { valid: false, reason: "reportHash absent" }; const h = computeReportHash(report); return { valid: h === report.reportHash, computed: h, declared: report.reportHash }; }
/** Libelle utilisateur d'un identifiant d'angle (mode simple) : "sciences-de-gestion" -> "Sciences de gestion". Jamais une traduction, juste une mise en forme. */
function humanizeLabel(id) { const t = String(id || "").replace(/[-_]+/g, " ").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

module.exports = { buildUserReport, scientificallyUsable, computeReportHash, verifyReportHash, humanizeLabel, LABELS, QUALIFICATION_USER, HASH_EXCLUDED };
