"use strict";
/**
 * MONO-11 v0.2 — core/llm-response-reuse.js   (mandat v0.2 §6 ; audit v0.1 F2)
 *
 * POLITIQUE DE REUTILISATION DES REPONSES LLM — quatre situations DISTINCTES, jamais confondues :
 *   REAL_CALL          appel reel au fournisseur (compte comme REAL_LLM_CALL) ;
 *   REUSE_VALID        reutilisation d'une reponse REELLE anterieure, a prompt octet-identique,
 *                      dont la validation aval a ete VALID (ne compte JAMAIS comme REAL_LLM_CALL) ;
 *   RETRY_REAL         reponse anterieure INVALID (refusee par un validateur) : reutilisation
 *                      interdite, nouvel appel reel obligatoire ;
 *   NO_SILENT_REUSE    prompt different (meme d'un octet) : aucune reutilisation.
 *
 * Le defaut v0.1 (F2) : une liste "no-replay" indexee par prompt et jamais purgee bloquait les
 * reponses VALIDES ulterieures du meme prompt. Ici l'etat est PAR REPONSE (promptSha + responseSha),
 * porte un `validationStatus` mis a jour par les validateurs (enforcers), et chaque reuse consigne
 * sourceRunId, sourceCallId, promptHash, responseHash, validationStatus, reuseReason.
 *
 * Ce module ne fait AUCUN appel reseau : il est compose par le transport de l'exploitant.
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const STATUS = Object.freeze({ VALID: "VALID", INVALID: "INVALID", UNKNOWN: "UNKNOWN" });
const DECISION = Object.freeze({ REAL_CALL: "REAL_CALL", REUSE_VALID: "REUSE_VALID", RETRY_REAL: "RETRY_REAL", NO_SILENT_REUSE: "NO_SILENT_REUSE" });

/**
 * createReusePolicy({ store }) — `store` : { list(): entries[], put(entry), update(responseSha, patch) } fourni par l'exploitant
 * (fichier, memoire…). Une entree : { promptSha256, responseSha256, sourceRunId, sourceCallId, providerRequestId, providerId, modelId,
 * completedAt, validationStatus, validationErrors, httpStatus }.
 */
function createReusePolicy(input) {
  input = input || {};
  const store = input.store;
  if (!store || typeof store.list !== "function" || typeof store.put !== "function" || typeof store.update !== "function") throw Object.assign(new Error("REUSE_STORE_REQUIRED"), { code: "REUSE_STORE_REQUIRED" });
  const allowReuse = input.allowReuse !== false;

  /** decide(prompt) -> { decision, entry?, reason } */
  function decide(prompt) {
    const promptSha256 = sha(prompt);
    const entries = store.list().filter((e) => e && e.promptSha256 === promptSha256 && e.httpStatus === 200);
    if (!allowReuse) return { decision: DECISION.REAL_CALL, promptSha256: promptSha256, reason: "reutilisation desactivee par l'exploitant" };
    if (!entries.length) return { decision: DECISION.REAL_CALL, promptSha256: promptSha256, reason: "aucune reponse reelle anterieure pour ce prompt (octets identiques)" };
    const valid = entries.filter((e) => e.validationStatus === STATUS.VALID).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
    if (valid.length) return { decision: DECISION.REUSE_VALID, promptSha256: promptSha256, entry: valid[0], reason: "reponse reelle anterieure validee (VALID) a prompt identique" };
    const invalid = entries.filter((e) => e.validationStatus === STATUS.INVALID);
    if (invalid.length === entries.length) return { decision: DECISION.RETRY_REAL, promptSha256: promptSha256, reason: entries.length + " reponse(s) anterieure(s) toutes INVALID : nouvel appel reel" };
    /* UNKNOWN (jamais validee) : un appel qui n'a jamais ete confronte a un validateur n'est pas reutilise en silence */
    return { decision: DECISION.RETRY_REAL, promptSha256: promptSha256, reason: "reponse(s) anterieure(s) sans statut de validation (UNKNOWN) : nouvel appel reel" };
  }

  /** recordReal(rec) — consigne un appel reel (validationStatus UNKNOWN tant qu'un validateur n'a pas parle). */
  function recordReal(rec) {
    const entry = Object.assign({ validationStatus: STATUS.UNKNOWN, validationErrors: [] }, rec, { kind: DECISION.REAL_CALL });
    store.put(entry); return entry;
  }
  /** markValidation({ responseSha256, valid, errors, stage }) — mis a jour par les validateurs. Idempotent ; INVALID n'est jamais redevenu VALID. */
  function markValidation(v) {
    if (!v || !v.responseSha256) return null;
    const status = v.valid === true ? STATUS.VALID : STATUS.INVALID;
    const existing = store.list().filter((e) => e.responseSha256 === v.responseSha256);
    existing.forEach(function (e) {
      if (e.validationStatus === STATUS.INVALID && status === STATUS.VALID) return; // une reponse refusee une fois reste refusee
      store.update(e.responseSha256, { validationStatus: status, validationErrors: Array.isArray(v.errors) ? v.errors : [], validatedBy: v.stage || null, validatedAt: new Date().toISOString() });
    });
    return status;
  }
  /** reuseRecord(entry, ctx) — la provenance COMPLETE d'une reutilisation (jamais un REAL_LLM_CALL). */
  function reuseRecord(entry, ctx) {
    return { kind: "LLM_REUSE", countsAsRealCall: false, sourceRunId: entry.sourceRunId || null, sourceCallId: entry.sourceCallId || entry.providerRequestId || null,
      promptHash: entry.promptSha256, responseHash: entry.responseSha256, validationStatus: entry.validationStatus, reuseReason: (ctx && ctx.reason) || "REUSE_VALID",
      providerId: entry.providerId || null, modelId: entry.modelId || null, originalProviderRequestId: entry.providerRequestId || null, originalCompletedAt: entry.completedAt || null,
      reusedInRunId: (ctx && ctx.runId) || null, reusedAt: new Date().toISOString() };
  }
  return Object.freeze({ decide: decide, recordReal: recordReal, markValidation: markValidation, reuseRecord: reuseRecord, STATUS: STATUS, DECISION: DECISION, sha: sha });
}

/** Magasin en memoire (tests) ; l'exploitant fournit le sien (fichier JSONL). */
function createMemoryStore(initial) {
  const entries = (initial || []).map((e) => Object.assign({}, e));
  return { list: () => entries.map((e) => Object.assign({}, e)), put: (e) => { entries.push(Object.assign({}, e)); },
    update: (responseSha, patch) => { entries.forEach((e, i) => { if (e.responseSha256 === responseSha) entries[i] = Object.assign({}, e, patch); }); } };
}

module.exports = { createReusePolicy, createMemoryStore, STATUS, DECISION };
