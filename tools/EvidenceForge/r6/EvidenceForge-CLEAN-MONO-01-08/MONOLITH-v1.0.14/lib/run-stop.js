"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/run-stop.js
 * ARRET UTILISATEUR PERSISTANT (lot RUN SAFETY CONTROLS). Une demande d'arret est un fichier a cote de state.json
 * (`stop-request.json`, ecriture atomique, jamais dans un checkpoint). Elle est lue par le moteur AVANT chaque appel LLM (reel ou
 * reutilise) et AVANT chaque changement d'etape ; quand elle est vue, le moteur leve STOPPED_BY_USER, code de TRANSPORT (verrou) :
 * les boucles gelees absorbent l'erreur (candidat / jumeau suivant jamais lance, aucun reseau), la frontiere d'etape arrete le run,
 * `fail()` ecrit STOPPED (reprenable) et l'etat partiel `run-stop-state.json` (notAVerdict). Un appel HTTP deja envoye ne peut pas
 * etre annule par ce mecanisme : il se termine, est facture et persiste ; aucun appel suivant n'est lance.
 * La demande n'est consommee QUE par une reprise explicite (POST resume -> advance) : jamais automatiquement.
 * Aucune logique scientifique ici ; aucun lot gele touche.
 */
const fs = require("fs"), path = require("path");
const STOP_CODE = "STOPPED_BY_USER";
const REQUEST_FILE = "stop-request.json", STATE_FILE = "run-stop-state.json";
const now = () => new Date().toISOString();
function writeAtomic(filePath, text) { const tmp = filePath + ".tmp-" + process.pid + "-" + Math.random().toString(36).slice(2, 8); fs.writeFileSync(tmp, text); fs.renameSync(tmp, filePath); }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; } }

/** Demande d'arret en attente (non consommee), ou null. */
function pending(runDir) { const r = readJson(path.join(runDir, REQUEST_FILE)); return r && !r.consumedAt ? r : null; }
/** Persiste la demande (idempotent : une demande en attente n'est pas dupliquee). */
function request(runDir, input) {
  input = input || {}; const cur = pending(runDir); if (cur) return { request: cur, created: false };
  const r = { schema: "EvidenceForge.RunStopRequest", schemaVersion: "MONOLITH-v1.0.5", runId: input.runId || null, requestedAt: now(), actor: input.actor || "user", reason: STOP_CODE, honoredAt: null, consumedAt: null, note: "aucun nouvel appel fournisseur apres cette demande ; un appel deja envoye peut se terminer et etre facture" };
  writeAtomic(path.join(runDir, REQUEST_FILE), JSON.stringify(r, null, 2) + "\n"); return { request: r, created: true };
}
function honor(runDir, extra) { const r = readJson(path.join(runDir, REQUEST_FILE)); if (!r) return null; const n = Object.assign({}, r, { honoredAt: r.honoredAt || now() }, extra || {}); writeAtomic(path.join(runDir, REQUEST_FILE), JSON.stringify(n, null, 2) + "\n"); return n; }
/** Consommation par une reprise EXPLICITE : la demande cesse d'arreter le moteur ; l'historique reste dans le fichier. */
function consume(runDir, who) { const r = readJson(path.join(runDir, REQUEST_FILE)); if (!r || r.consumedAt) return r; const n = Object.assign({}, r, { consumedAt: now(), consumedBy: who || "user-resume" }); writeAtomic(path.join(runDir, REQUEST_FILE), JSON.stringify(n, null, 2) + "\n"); return n; }
function stopError(req) {
  const e = new Error(STOP_CODE + ": arret demande par l'utilisateur" + (req && req.requestedAt ? " a " + req.requestedAt : "")); e.code = STOP_CODE; e.fatal = true; e.userStop = true;
  e.userMessage = "Run arrêté à votre demande : aucun nouvel appel au service d'analyse n'a été lancé après votre demande ; les résultats déjà produits sont conservés. Vous pourrez reprendre le run explicitement."; return e;
}
/**
 * Etat partiel persiste a l'arret utilisateur (jamais un checkpoint, jamais un verdict).
 * buildStopState({ runId, state, ledgerTotals, budget, partialArtifacts, request, checkpointRef })
 */
function buildStopState(input) {
  const st = input.state || {}; const t = input.ledgerTotals || {}; const last = input.lastEntry || t.lastCall || null;
  const nextUnit = { PROFESSIONALS: "prochain candidat sélectionné non évalué (ordre de sélection déterministe ; la reprise rejoue la boucle depuis la sélection, les réponses validées sont réutilisées)", TWINS_REVIEWS: "prochaine évaluation de couverture ou revue non encore validée (la reprise rejoue l'aval depuis le checkpoint professionnel ; les réponses validées sont réutilisées)", RETRIEVAL: "prochain lot de screening / de revue de portefeuille (la reprise rejoue l'étape ; les réponses validées sont réutilisées)", MISSION: "reformulation", DISCIPLINES: "résolveur EF-01B", PLAN: "planificateur EF-01C1", CORPUS: "construction du corpus (aucun appel)", QUALIFICATION: "qualification depuis le checkpoint aval", REPORT: "rapport" };
  return { schema: "EvidenceForge.RunStopState", schemaVersion: "MONOLITH-v1.0.5", notAVerdict: true, notACheckpoint: true, runId: input.runId || st.runId || null, stage: st.stage || null, stageStatus: st.stages && st.stages[st.stage] ? st.stages[st.stage].status : null, reason: STOP_CODE, stoppedAt: now(),
    requestedAt: input.request ? input.request.requestedAt : null, actor: input.request ? input.request.actor : null, attempts: st.attempts || null,
    cost: { totalUsd: t.totalUsd != null ? t.totalUsd : null, currency: t.currency || "USD", byStage: t.byStage ? Object.fromEntries(Object.keys(t.byStage).map((k) => [k, t.byStage[k].totalUsd])) : null, pricingVersion: t.pricingVersion || null },
    realCalls: t.calls ? (t.calls.realCall != null ? t.calls.realCall : t.calls.real) : null, callsIncludingProbesAndKits: t.calls ? t.calls.real : null, reuse: t.calls ? t.calls.reuse : null,
    lastCompletedUnit: last ? { purpose: last.purpose || null, ref: last.candidateRef || last.twinId || last.targetId || null, at: last.at || null, usd: last.cost ? last.cost.totalUsd : null } : null,
    nextUnit: { stage: st.stage || null, description: nextUnit[st.stage] || null, note: "la granularité de reprise est celle des checkpoints (étape) et de la réutilisation (réponse validée) ; aucun candidat/jumeau intermédiaire n'est un checkpoint" },
    checkpointRef: input.checkpointRef || (st.checkpoints || null), stagesDone: st.stages ? Object.keys(st.stages).filter((k) => st.stages[k].status === "DONE") : [],
    resumeAllowed: true, resumeHow: "POST /api/runs/:id/resume (acte utilisateur explicite) : reprise depuis le dernier checkpoint, réponses validées réutilisées à coût 0, aucune reprise automatique",
    budget: input.budget || null, partialArtifacts: input.partialArtifacts || [], inFlightCallNote: "un appel déjà envoyé au moment de la demande peut s'être terminé après celle-ci : il est facturé et sa réponse est persistée (réutilisable)" };
}
module.exports = { STOP_CODE, REQUEST_FILE, STATE_FILE, pending, request, honor, consume, stopError, buildStopState };
