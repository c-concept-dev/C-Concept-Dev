#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0 — tools/import-sealed-run.js
 * PREUVE D'INTEGRATION : importe, EN LECTURE SEULE, un run MONO-11 v0.2 deja produit et scelle (ex. P0.1 seal B) comme run du
 * monolithe, apres verification de CHAQUE hash contre le manifeste de preuves du run source. Rien n'est recalcule, rien n'est
 * relance (aucun appel LLM, aucun appel reseau) ; le rapport utilisateur est construit par le meme lib/stage-report.js que les
 * runs natifs. Le run importe est marque IMPORTED_SEALED_RUN et ne se confond jamais avec un run natif.
 * Usage : node tools/import-sealed-run.js --source <dir P0.1-RUN> --manifest P0.1-EVIDENCE-MANIFEST.json --state P0.1-RUN-STATE-PHASE2-V02.json
 *         [--mission <mission.json>] [--runcontract <runcontract-confirmed.json>] [--targetset <rel TargetDocumentSet.json>]
 * Aucun identifiant de cas n'est code ici : tout vient des fichiers designes en argument.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const P = require("../lib/paths.js"); const RS = require("../lib/run-store.js"); const SRP = require("../lib/stage-report.js");
const shaFile = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const args = {}; process.argv.slice(2).forEach((a, i, arr) => { if (a.startsWith("--")) args[a.slice(2)] = arr[i + 1]; });
function main() {
  const src = path.resolve(args.source); const manifest = JSON.parse(fs.readFileSync(path.join(src, args.manifest), "utf8")); const srcState = JSON.parse(fs.readFileSync(path.join(src, args.state), "utf8"));
  const need = { panel: "P0.1-AUTONOMOUS-PANEL.json", assessment: "P0.1-CANDIDATE-ASSESSMENT.json", discovery: "P0.1-EF02A-DISCOVERY.json", verification: "P0.1-EF02B-VERIFICATION.json", twins: "P0.1-TWINS/DocumentaryTwinSet.json", reviews: "P0.1-REVIEWS/DocumentaryReviewSet.json", aggregation: "P0.1-AGGREGATION.json", qualification: "P0.1-PROCESS-QUALIFICATION.json", reservations: "P0.1-UNKNOWN-RESERVATIONS.json", canonical: "P0.1-CANONICAL-INPUTS.json", lineage: "P0.1-LINEAGE.json" };
  const byPath = new Map(manifest.files.map((f) => [f.path, f.sha256])); const verified = {}; const loaded = {};
  Object.keys(need).forEach(function (k) { const rel = args[k] || need[k]; const p = path.join(src, rel); if (!fs.existsSync(p)) throw new Error("ARTEFACT_ABSENT: " + rel); const h = shaFile(p); const expected = byPath.get(rel);
    if (!expected) throw new Error("ARTEFACT_HORS_MANIFESTE: " + rel); if (h !== expected) throw new Error("HASH_MISMATCH: " + rel + " attendu " + expected + " mesure " + h); verified[rel] = h; loaded[k] = JSON.parse(fs.readFileSync(p, "utf8")); });
  if (srcState.mono11ZipSha256 !== P.CONFIG.frozenLots["MONO-11"].canonicalZipSha256) throw new Error("SEAL_MISMATCH: le run source n'a pas ete produit sous le zip MONO-11 declare par le monolithe");
  const canon = loaded.canonical; const missionPath = args.mission || canon.mission.path; const mission = JSON.parse(fs.readFileSync(missionPath, "utf8")); if (shaFile(missionPath) !== canon.mission.sha256) throw new Error("HASH_MISMATCH: mission");
  const rcPath = args.runcontract || canon.runContract.path; const runContract = JSON.parse(fs.readFileSync(rcPath, "utf8")); if (runContract.runContractHash !== canon.runContractHash) throw new Error("HASH_MISMATCH: runContract");
  const corpusSnapshot = JSON.parse(fs.readFileSync(canon.corpusSnapshot.path, "utf8")); if (shaFile(canon.corpusSnapshot.path) !== canon.corpusSnapshot.sha256) throw new Error("HASH_MISMATCH: corpusSnapshot");
  /* documents cibles : depuis le TargetDocumentSet du run source (targetId, hash source, premiere ligne du contenu comme libelle) */
  const tdsRel = args.targetset || "P0.1-REVIEWS/TargetDocumentSet.json"; const tdsPath = path.join(src, tdsRel);
  if (fs.existsSync(tdsPath) && byPath.get(tdsRel) && shaFile(tdsPath) !== byPath.get(tdsRel)) throw new Error("HASH_MISMATCH: " + tdsRel);
  const tds = fs.existsSync(tdsPath) ? JSON.parse(fs.readFileSync(tdsPath, "utf8")) : { documents: [] };
  const targetsMeta = (tds.documents || []).slice().sort((a, b) => String(a.targetId).localeCompare(String(b.targetId))).map((d) => ({ title: (String(d.content || "").split("\n")[0] || d.targetId).slice(0, 120), sha256: d.sourceDocumentRef || null, targetId: d.targetId }));
  const runId = "efm-import-" + srcState.runId.replace(/[^A-Za-z0-9-]/g, "-"); const store = RS.createRunStore(runId);
  const stages = {}; RS.STAGES.forEach((s) => { stages[s] = { status: "DONE", imported: true }; });
  const state = { schema: "EvidenceForge.MonolithRunState", schemaVersion: "MONOLITH-v1.0", runId, status: "COMPLETED", stage: "REPORT", stages, gate: null, createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    kind: "IMPORTED_SEALED_RUN", importedFrom: { sourceDir: src, sourceRunId: srcState.runId, parentAttemptRunId: srcState.parentAttemptRunId || null, manifest: args.manifest, manifestFiles: manifest.files.length, verifiedArtifacts: verified, resumeMode: srcState.resumeMode || null },
    mission: { question: mission.missionQuestion, questionSha256: canon.mission.sha256, missionId: canon.missionId, documents: targetsMeta.map((t) => ({ name: t.title })), reformulated: { missionReformulee: runContract.missionReformulee, perimetre: (runContract.perimetre && runContract.perimetre.description) || "" } },
    attempts: 0, counters: { llmReal: srcState.llmCalls && srcState.llmCalls.newRealCalls, llmReused: srcState.llmCalls && srcState.llmCalls.reusedValidRealResponses, openAlexCalls: (srcState.openAlexNewCalls || 0) + (srcState.openAlexReused || 0) },
    seal: { mono11Version: srcState.mono11Version, runtimeSealSha256: srcState.runtimeSealSha256, runCodeHash: srcState.runCodeHash, mono11ZipSha256: srcState.mono11ZipSha256, mono11ManifestSha256: srcState.mono11ManifestSha256 }, userMessage: null, error: null };
  ["panel", "assessment", "twins", "reviews", "aggregation", "qualification"].forEach((k) => store.saveJson(k + ".json", loaded[k]));
  store.saveJson("professionals-discovery.json", { discovery: loaded.discovery, verification: loaded.verification, imported: true }); store.saveJson("corpus-snapshot.json", corpusSnapshot); store.saveJson("disciplines.json", { runContract, imported: true });
  store.saveJson("mono10-run.json", { imported: true, sourceState: srcState });
  const report = SRP.buildUserReport({ state, reformulation: state.mission.reformulated, runContract, corpusSnapshot, discovery: loaded.discovery, panel: loaded.panel, twinSet: loaded.twins, reviewSet: loaded.reviews, aggregation: loaded.aggregation, qualification: loaded.qualification, readinessPre: loaded.qualification.readinessPre, readinessFull: loaded.qualification.readinessFull,
    seal: state.seal, llmCounts: { real: state.counters.llmReal, reused: state.counters.llmReused }, retrieval: { sourceCount: corpusSnapshot.sources.length, snapshotHash: null }, targetDocuments: targetsMeta, upstreamReservations: [], lineageRefs: { corpusArtifactRef: { sha256: canon.corpusSnapshot.sha256 }, searchProtocolHash: canon.protocolHash } });
  report.importedFrom = state.importedFrom; store.saveJson("report.json", report);
  state.summary = { PROCESS_QUALIFICATION: report.headline.PROCESS_QUALIFICATION, SCIENTIFICALLY_USABLE: report.headline.SCIENTIFICALLY_USABLE, counts: report.counts, reportHash: report.reportHash }; state.userMessage = "Run importé (preuve d'intégration, lecture seule). " + SRP.QUALIFICATION_USER[report.headline.PROCESS_QUALIFICATION];
  store.write(state); store.event({ level: "user", message: state.userMessage });
  store.saveJson("lineage.json", { schema: "EvidenceForge.MonolithLineage", runId, kind: "IMPORTED_SEALED_RUN", importedFrom: state.importedFrom, seal: state.seal, artifacts: fs.readdirSync(store.dir).filter((f) => f.endsWith(".json")).map((f) => ({ path: f, sha256: shaFile(path.join(store.dir, f)) })) });
  console.log(JSON.stringify({ runId, sourceRunId: srcState.runId, verifiedArtifacts: Object.keys(verified).length, PROCESS_QUALIFICATION: report.headline.PROCESS_QUALIFICATION, SCIENTIFICALLY_USABLE: report.headline.SCIENTIFICALLY_USABLE, counts: report.counts, reportHash: report.reportHash }, null, 2));
}
main();
