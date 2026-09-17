"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/run-store.js
 * Un run = un dossier runs/<runId>/ : state.json (etat reprenable), events.jsonl (journal utilisateur + technique),
 * artefacts JSON par etape. Aucun secret n'y entre. L'etat est la SEULE source de verite pour la reprise.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const P = require("./paths.js");
const CL = require("./cost-ledger.js"), BG = require("./budget-guard.js");   /* v1.0.5 : etat public enrichi du cout reel et du budget (artefacts a cote de state.json) */

const STAGES = Object.freeze([
  "MISSION",            // reformulation + documents
  "DISCIPLINES",        // EF-01B resolveur + RunContract automatique (politique AUTO_RETAIN_VALID_PROPOSALS)
  "PLAN",               // EF-01C1 planificateur -> attente confirmation utilisateur (validation humaine du SearchProtocol, contrat gele)
  "RETRIEVAL",          // OpenAlex reel -> RetrievalSnapshot -> preuve de screening machine -> attente ratification utilisateur (contrat gele)
  "CORPUS",             // reprise gelee (screening artefact, qualification) -> CorpusSnapshot
  "PROFESSIONALS",      // MONO-09 decouverte/identite + MONO-10 evaluation + MONO-11 gate autonome
  "TWINS_REVIEWS",      // MONO-11 v0.3-r1 : corpus admis, couverture, jumeaux, revues, agregation
  "QUALIFICATION",      // readiness + qualification composees
  "REPORT",             // rapport utilisateur + exports
]);
/** Libelles UTILISATEUR (mode simple) — aucun code EF-* */
const STAGE_LABELS = Object.freeze({
  MISSION: "Comprendre votre demande", DISCIPLINES: "Identifier les angles d'expertise", PLAN: "Préparer le plan de recherche",
  RETRIEVAL: "Rechercher les publications", CORPUS: "Constituer le corpus de sources", PROFESSIONALS: "Découvrir et évaluer les professionnels",
  TWINS_REVIEWS: "Faire examiner votre demande par les jumeaux documentaires", QUALIFICATION: "Qualifier la solidité du processus", REPORT: "Rédiger le rapport",
});
const GATES = Object.freeze({ CONFIRM_PLAN: "CONFIRM_PLAN", RATIFY_SOURCES: "RATIFY_SOURCES" });

function newRunId() { return "efm-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + crypto.randomBytes(4).toString("hex"); }

/* Abonnes PARTAGES par runId (registre de module) : le flux d'evenements (SSE) et le moteur du pipeline utilisent des instances
   de magasin distinctes ; v1.0 abonnait par instance, donc la page ne recevait jamais les mises a jour en direct (defaut corrige en v1.0.1). */
const LISTENERS = new Map();
function listenersFor(runId) { if (!LISTENERS.has(runId)) LISTENERS.set(runId, new Set()); return LISTENERS.get(runId); }

/** Ecriture ATOMIQUE (v1.0.2) : fichier temporaire sur le meme volume, fsync, rename ; un fichier valide n'est jamais remplace par une ecriture partielle. */
function writeAtomic(filePath, text) {
  const tmp = filePath + ".tmp-" + process.pid + "-" + crypto.randomBytes(4).toString("hex");
  const fd = fs.openSync(tmp, "w"); try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, filePath);
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
/** Hash canonique d'un checkpoint : sur son contenu, hors `contentHash` et `committedAt`. */
function checkpointHash(obj) { const c = {}; Object.keys(obj).sort().forEach((k) => { if (k !== "contentHash" && k !== "committedAt") c[k] = obj[k]; }); return sha(JSON.stringify(c)); }

function createRunStore(runId) {
  const dir = path.join(P.RUNS, runId);
  fs.mkdirSync(dir, { recursive: true });
  const statePath = path.join(dir, "state.json"), eventsPath = path.join(dir, "events.jsonl");
  const listeners = listenersFor(runId);
  function read() { return fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null; }
  function write(state) { state.updatedAt = new Date().toISOString(); writeAtomic(statePath, JSON.stringify(state, null, 2) + "\n"); listeners.forEach((l) => { try { l({ type: "state", state: publicState(state) }); } catch (e) { /* observabilite */ } }); return state; }
  /** TRACEUR (v1.0.2) : eventId unique, attemptId, stage, actor, heure ISO (UTC) + heure locale, champs libres (provider/reseau, call/retry/reuse, code, cause, duree, candidateRef/twinId/targetId). */
  function event(ev) {
    const st = ev && ev._state ? ev._state : null; if (ev) delete ev._state;
    const now = new Date();
    const e = Object.assign({ eventId: crypto.randomBytes(8).toString("hex"), at: now.toISOString(), atLocal: now.toLocaleString("fr-FR", { hour12: false, timeZoneName: "short" }), runId: runId,
      attemptId: st ? st.attempts || 0 : (ev && ev.attemptId) || null, stage: st ? st.stage : (ev && ev.stage) || null, actor: (ev && ev.actor) || "system" }, ev);
    fs.appendFileSync(eventsPath, JSON.stringify(e) + "\n"); listeners.forEach((l) => { try { l({ type: "event", event: e }); } catch (x) { /* */ } }); return e;
  }
  function saveJson(rel, obj) { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); const text = JSON.stringify(obj, null, 2) + "\n"; writeAtomic(p, text); return { path: rel, sha256: sha(text) }; }
  function loadJson(rel) { const p = path.join(dir, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; }
  /** CHECKPOINT (v1.0.2) : calcul -> validation (complete === true) -> ecriture atomique avec contentHash -> reference. Refuse un checkpoint incomplet. */
  function saveCheckpoint(rel, obj) {
    if (!obj || obj.complete !== true) throw Object.assign(new Error("CHECKPOINT_INCOMPLETE: " + rel), { code: "CHECKPOINT_INCOMPLETE" });
    const cp = Object.assign({}, obj, { committedAt: new Date().toISOString() }); cp.contentHash = checkpointHash(cp);
    const r = saveJson(rel, cp); return { path: rel, contentHash: cp.contentHash, fileSha256: r.sha256, committedAt: cp.committedAt };
  }
  /** Charge et VERIFIE un checkpoint (hash de contenu, completude) ; null si absent ; leve CHECKPOINT_CORRUPT si altere. */
  function loadCheckpoint(rel) {
    const cp = loadJson(rel); if (!cp) return null;
    if (cp.complete !== true || !cp.contentHash || checkpointHash(cp) !== cp.contentHash) throw Object.assign(new Error("CHECKPOINT_CORRUPT: " + rel), { code: "CHECKPOINT_CORRUPT", userMessage: "Un point de reprise (" + rel + ") est incomplet ou altéré : il est refusé. Le run ne peut pas reprendre sur cette base." });
    return cp;
  }
  /** v1.0.5 — resume de cout (lecture seule du ledger) + budget ; null quand le run n'a pas de ledger (run anterieur) */
  function costSummary(state) {
    let t = null; try { t = CL.readTotals(dir); } catch (e) { t = null; }
    let b = null; try { b = BG.readBudget(dir); } catch (e) { b = null; }
    const spent = t ? t.totalUsd : 0; const cur = state.stage;
    return { ledgerPresent: !!t, currency: (t && t.currency) || "USD", totalUsd: t ? Math.round(spent * 100) / 100 : null, currentStageUsd: t && t.byStage[cur] ? Math.round(t.byStage[cur].totalUsd * 100) / 100 : (t ? 0 : null), realCalls: t ? t.calls.real : null, reusedCalls: t ? t.calls.reuse : null, unpricedCalls: t ? t.calls.unpriced : null, lastCall: t ? t.lastCall : null, pricingVersion: t ? t.pricingVersion : null,
      budget: b ? { costBudgetUsd: b.costBudgetUsd, warningThresholdUsd: b.warningThresholdUsd, remainingUsd: b.costBudgetUsd === null ? null : Math.round(Math.max(0, b.costBudgetUsd - spent) * 100) / 100, warningReached: b.warningThresholdUsd !== null && spent >= b.warningThresholdUsd, limitReached: b.costBudgetUsd !== null && spent >= b.costBudgetUsd, updatedAt: b.updatedAt || null } : { costBudgetUsd: null, warningThresholdUsd: null, remainingUsd: null, warningReached: false, limitReached: false, updatedAt: null } };
  }
  function publicState(state) {
    const resumable = state.status === "STOPPED" || (state.status === "FAILED" && !!(state.error && state.error.resumable));
    return { runId: state.runId, status: state.status, stage: state.stage, stageLabel: STAGE_LABELS[state.stage] || state.stage, stages: state.stages, gate: state.gate || null, resumable: resumable,
      userMessage: state.userMessage || null, error: state.error || null, mission: state.mission ? { question: state.mission.question, reformulated: state.mission.reformulated, documents: (state.mission.documents || []).map((d) => ({ name: d.name, bytes: d.bytes, sha256: d.sha256 })) } : null,
      summary: state.summary || null, createdAt: state.createdAt, updatedAt: state.updatedAt, seal: state.seal || null, counters: state.counters || null, attempts: state.attempts || 0, kind: state.kind || "NATIVE", provider: state.provider || null, checkpoints: state.checkpoints || null, cost: costSummary(state) };
  }
  return { runId, dir, read, write, event, saveJson, loadJson, saveCheckpoint, loadCheckpoint, publicState, subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    events: () => (fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []) };
}

/** Au demarrage du serveur : aucun moteur ne tourne encore ; tout run laisse RUNNING par un arret du processus est marque STOPPED (reprenable). */
function markInterruptedRuns() {
  const out = [];
  listRuns().forEach(function (r) { if (r.status !== "RUNNING") return; const st = createRunStore(r.runId); const state = st.read(); if (!state || state.status !== "RUNNING") return;
    state.status = "STOPPED"; state.error = { code: "INTERRUPTED_BY_RESTART", message: "processus serveur arrete pendant l'etape " + state.stage, userMessage: "L'analyse a été interrompue par un arrêt du serveur pendant l'étape « " + (STAGE_LABELS[state.stage] || state.stage) + " ». Les résultats déjà validés sont conservés : reprenez le run.", at: new Date().toISOString(), stage: state.stage, resumable: true };
    state.userMessage = state.error.userMessage; if (state.stages[state.stage]) state.stages[state.stage].status = "INTERRUPTED"; st.write(state); st.event({ level: "user", message: state.userMessage, code: "INTERRUPTED_BY_RESTART", resumable: true }); out.push(r.runId); });
  return out;
}

function listRuns() {
  if (!fs.existsSync(P.RUNS)) return [];
  return fs.readdirSync(P.RUNS).filter((n) => n.startsWith("efm-") && fs.existsSync(path.join(P.RUNS, n, "state.json"))).map((n) => { try { const s = JSON.parse(fs.readFileSync(path.join(P.RUNS, n, "state.json"), "utf8")); return { runId: n, status: s.status, stage: s.stage, question: s.mission && s.mission.question, createdAt: s.createdAt, updatedAt: s.updatedAt }; } catch (e) { return { runId: n, status: "UNREADABLE" }; } }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = { createRunStore, listRuns, markInterruptedRuns, newRunId, writeAtomic, checkpointHash, STAGES, STAGE_LABELS, GATES };
