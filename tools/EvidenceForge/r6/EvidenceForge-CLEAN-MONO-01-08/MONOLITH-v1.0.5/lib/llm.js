"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/llm.js (v1.0.5 : ledger de cout + garde de budget, additifs)
 * Transport LLM REEL (Worker delegue evidenceforge-llm-proxy) + politique de reutilisation MONO-11 (gelee ; lot v0.3-r1, module llm-response-reuse.js byte-identique a v0.2)
 * + detection des indisponibilites fournisseur (credit, rate-limit, reseau) en messages UTILISATEUR.
 * AUCUN secret n'est journalise ni embarque : EVIDENCEFORGE_WORKER_API_KEY et LLM_WORKER_BASE_URL viennent de l'environnement.
 * v1.0.5 — opts.ledger (lib/cost-ledger.js) : chaque appel reel (usage fournisseur, modele, finalite, candidateRef/twinId du meta)
 * et chaque reuse (cout 0) sont enregistres ; opts.budget (lib/budget-guard.js) : verifie AVANT chaque appel reel, y compris
 * la sonde preflight ; BUDGET_LIMIT_REACHED / PRICING_UNKNOWN_FOR_MODEL sont des codes de transport (verrou, reprenable).
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const P = require("./paths.js");
const RU = require(path.join(P.MONO11, "core", "llm-response-reuse.js"));
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const PD = require("./provider-diagnostic.js");   /* v1.0.5 : classification fine des pannes (DNS / connexion / TLS / URL / auth / route / capacite) et placeholders */

/** Classification d'une indisponibilite, en langage utilisateur (jamais un faux succes). */
const PROVIDER_STATES = Object.freeze({
  OK: { code: "OK", user: "Fournisseur d'analyse disponible." },
  NOT_CONFIGURED: { code: "PROVIDER_NOT_CONFIGURED", user: "Le service d'analyse n'est pas configuré sur cette machine (identifiants absents de l'environnement). Aucun résultat ne peut être produit." },
  CREDIT: { code: "PROVIDER_CREDIT_EXHAUSTED", user: "Le crédit du fournisseur d'analyse est épuisé. Le run est arrêté proprement ; il pourra reprendre sans perdre les résultats déjà validés une fois le crédit rétabli." },
  RATE_LIMIT: { code: "PROVIDER_RATE_LIMITED", user: "Le fournisseur d'analyse limite le débit. EvidenceForge attend et réessaie automatiquement (attente bornée)." },
  NETWORK: { code: "NETWORK_UNAVAILABLE", user: "Réseau indisponible : impossible de joindre le fournisseur d'analyse. Aucun résultat n'est inventé." },
  TIMEOUT: { code: "PROVIDER_TIMEOUT", user: "Le fournisseur d'analyse n'a pas répondu dans le délai imparti. Le run est arrêté proprement ; il pourra reprendre (les réponses déjà validées sont conservées)." },
  UNAVAILABLE: { code: "PROVIDER_UNAVAILABLE", user: "Le fournisseur d'analyse a répondu par une erreur. Le run est arrêté proprement." },
  /* v1.0.5 — etats distingues (jamais un secret dans le message) */
  PLACEHOLDER: { code: "PROVIDER_PLACEHOLDER", user: PD.USER.PROVIDER_PLACEHOLDER }, URL_INVALID: { code: "PROVIDER_URL_INVALID", user: PD.USER.PROVIDER_URL_INVALID },
  DNS: { code: "PROVIDER_DNS_ERROR", user: PD.USER.PROVIDER_DNS_ERROR }, REFUSED: { code: "PROVIDER_CONNECTION_REFUSED", user: PD.USER.PROVIDER_CONNECTION_REFUSED }, TLS: { code: "PROVIDER_TLS_ERROR", user: PD.USER.PROVIDER_TLS_ERROR },
  AUTH: { code: "PROVIDER_AUTH_ERROR", user: PD.USER.PROVIDER_AUTH_ERROR }, ROUTE: { code: "PROVIDER_ROUTE_NOT_FOUND", user: PD.USER.PROVIDER_ROUTE_NOT_FOUND }, CAPACITY: { code: "PROVIDER_CAPACITY", user: PD.USER.PROVIDER_CAPACITY }, BAD_RESPONSE: { code: "PROVIDER_BAD_RESPONSE", user: PD.USER.PROVIDER_BAD_RESPONSE },
});
const STATE_BY_CODE = {}; Object.keys(PROVIDER_STATES).forEach((k) => { STATE_BY_CODE[PROVIDER_STATES[k].code] = PROVIDER_STATES[k]; });

function createFileStore(storePath) {
  const load = () => (fs.existsSync(storePath) ? fs.readFileSync(storePath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const save = (es) => fs.writeFileSync(storePath, es.map((e) => JSON.stringify(e)).join("\n") + (es.length ? "\n" : ""));
  return { list: load, put: (e) => { fs.mkdirSync(path.dirname(storePath), { recursive: true }); fs.appendFileSync(storePath, JSON.stringify(e) + "\n"); },
    update: (rs, patch) => { const all = load(); let n = 0; all.forEach((e, i) => { if (e.responseSha256 === rs) { all[i] = Object.assign({}, e, patch); n++; } }); if (n) save(all); } };
}

/**
 * createLlm({ runDir, runId, sealHash, model, minSpacingMs, maxAttemptsOnCapacity, storePath, ledger?, budget? })
 * -> { llmCall(prompt, meta), onValidation(v), probe(), counts(), workerCallFn(prompt) }
 */
function createLlm(opts) {
  opts = opts || {};
  const cfg = P.CONFIG.llm;
  const MODEL = process.env.EVIDENCEFORGE_LLM_MODEL || opts.model || cfg.model;
  const LOG = path.join(opts.runDir, "llm-calls.jsonl"), CACHE = path.join(opts.runDir, "llm-cache");
  const store = createFileStore(opts.storePath || path.join(P.RUNS, "llm-reuse-store.jsonl"));   // magasin PARTAGE entre runs (reuse inter-run, provenance complete)
  const policy = RU.createReusePolicy({ store: store, allowReuse: process.env.EVIDENCEFORGE_LLM_REUSE !== "0" });
  let REAL = 0, REUSED = 0, lastAt = 0;
  const minGap = Number(process.env.EVIDENCEFORGE_LLM_MIN_SPACING_MS || opts.minSpacingMs || cfg.minSpacingMs || 1500);
  const maxAttempts = opts.maxAttemptsOnCapacity || cfg.maxAttemptsOnCapacity || 8;
  const timeoutMs = Number(process.env.EVIDENCEFORGE_LLM_TIMEOUT_MS || opts.timeoutMs || cfg.timeoutMs || 180000);
  const extraCacheDirs = (opts.extraCacheDirs || cfg.reuseCacheDirs || []).map((d) => path.resolve(P.ROOT, d));

  let REFUSED = 0;
  const PROVIDER_ID = "anthropic", VALIDATION_CONTRACT = "MONO-11-v2";   /* contrat SCIENTIFIQUE de validation des reponses (contractVersion MONO-11-v2, inchange en v0.3-r1 ; distinct de la version du CODE = sceau) */
  function cacheBodyPath(entry) { const c = [entry.cachePath, path.join(CACHE, entry.responseSha256 + ".response.json")].concat(extraCacheDirs.map((dir) => path.join(dir, entry.responseSha256 + ".response.json"))).filter(Boolean); return c.find((f) => fs.existsSync(f)) || null; }
  function reuseContextCheck(entry) {
    if (!entry) return { ok: false, reason: "entree absente" };
    if (entry.validationStatus !== "VALID") return { ok: false, reason: "statut " + entry.validationStatus };
    if (entry.providerId !== PROVIDER_ID) return { ok: false, reason: "fournisseur different (" + entry.providerId + ")" };
    if (entry.modelId !== MODEL) return { ok: false, reason: "modele different (" + entry.modelId + " vs " + MODEL + ")" };
    if ((entry.validationContract || null) !== VALIDATION_CONTRACT) return { ok: false, reason: "contrat de validation different (" + (entry.validationContract || "absent") + ")" };
    if (opts.sealHash && entry.sourceSealHash !== opts.sealHash) return { ok: false, reason: "sceau different (" + (entry.sourceSealHash || "absent") + ")" };
    const src = cacheBodyPath(entry); if (!src) return { ok: false, reason: "corps en cache absent" };
    if (sha(fs.readFileSync(src, "utf8")) !== entry.responseSha256) return { ok: false, reason: "corps en cache altere (hash different de responseSha256)" };
    return { ok: true };
  }
  /* v1.0.5 : "configure" = identifiants presents, sans placeholder, URL valide (un TON_URL_WORKER / TA_CLE n'est PAS une configuration) */
  function credentials() { return PD.credentialsStatus(process.env); }
  function configured() { return credentials().usable; }
  function classify(status, raw, err, timedOut) {
    if (err) return STATE_BY_CODE[PD.classifyFetchError(err, timedOut)] || PROVIDER_STATES.NETWORK;
    const code = PD.classifyStatus(status, raw); return STATE_BY_CODE[code] || PROVIDER_STATES.UNAVAILABLE;
  }
  const RETRYABLE_STATES = [PROVIDER_STATES.RATE_LIMIT, PROVIDER_STATES.CAPACITY];
  async function httpCall(body, localRequestId) {
    const base = process.env.LLM_WORKER_BASE_URL.replace(/\/$/, ""), key = process.env.EVIDENCEFORGE_WORKER_API_KEY;
    const gap = Date.now() - lastAt; if (gap < minGap) await new Promise((r) => setTimeout(r, minGap - gap));
    let attempts = 0; const waits = [];
    for (;;) {
      attempts++; lastAt = Date.now();
      let res, raw;
      /* delai borne : minuterie REFERENCEE (un AbortSignal.timeout natif est unref'd et ne garantit pas le declenchement) */
      const ac = new AbortController(); let timedOut = false; const timer = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
      try { res = await fetch(base + "/v1/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key, "x-evidenceforge-request-id": localRequestId }, body: body, signal: ac.signal }); raw = await res.text(); }
      catch (e) { const st = classify(null, null, e, timedOut); const err = new Error(st.code + ": " + String(e.message).slice(0, 200)); err.code = st.code; err.userMessage = st.user; err.fatal = true; err.detail = String(e && e.cause && e.cause.code || "").slice(0, 60); throw err; }
      finally { clearTimeout(timer); }
      const st = classify(res.status, raw, null);
      if (st === PROVIDER_STATES.CREDIT) { const err = new Error(st.code); err.code = st.code; err.userMessage = st.user; err.fatal = true; err.httpStatus = 400; throw err; }
      if (RETRYABLE_STATES.indexOf(st) !== -1 && attempts < maxAttempts) { const ra = Number(res.headers.get("retry-after")); const w = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 300000) : Math.min(30000 * Math.pow(2, attempts - 1), 300000); waits.push({ status: res.status, waitMs: w }); await new Promise((r) => setTimeout(r, w)); continue; }
      return { res: res, raw: raw, attempts: attempts, waits: waits, state: st };
    }
  }

  /* v1.0.2 — VERROU DE PANNE DE TRANSPORT : la premiere panne externe fatale (reseau, delai, credit, debit epuise, fournisseur) est
     memorisee ; tout appel suivant echoue immediatement sans reseau, pour qu'un lot gele qui absorbe les exceptions ne transforme
     jamais une panne en verdict documentaire. Le pipeline lit `transportFailure()` a la frontiere de l'etape et arrete (reprenable). */
  let LATCH = null;
  const TRANSPORT_CODES = ["NETWORK_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_CREDIT_EXHAUSTED", "PROVIDER_RATE_LIMITED", "PROVIDER_UNAVAILABLE", "PROVIDER_NOT_CONFIGURED", "PROVIDER_EMPTY_RESPONSE", "BUDGET_LIMIT_REACHED", "PRICING_UNKNOWN_FOR_MODEL",
    "PROVIDER_PLACEHOLDER", "PROVIDER_URL_INVALID", "PROVIDER_DNS_ERROR", "PROVIDER_CONNECTION_REFUSED", "PROVIDER_TLS_ERROR", "PROVIDER_AUTH_ERROR", "PROVIDER_ROUTE_NOT_FOUND", "PROVIDER_CAPACITY", "PROVIDER_BAD_RESPONSE"];
  /* v1.0.5 — ledger de cout et garde de budget (optionnels : les tests unitaires du transport n'en ont pas besoin) */
  const LEDGER = opts.ledger || null, BUDGET = opts.budget || null;
  const ledgerRecord = (e) => { if (LEDGER) { try { LEDGER.record(e); } catch (x) { fs.appendFileSync(LOG, JSON.stringify({ kind: "COST_LEDGER_ERROR", runId: opts.runId, message: String(x.message).slice(0, 300), at: new Date().toISOString() }) + "\n"); } } };
  const budgetCheck = (meta, where) => { if (BUDGET) BUDGET.assertAllowed({ model: MODEL, purpose: (meta && meta.purpose) || null, where }); };
  function latch(e, where) { if (!LATCH && e && TRANSPORT_CODES.indexOf(e.code) !== -1) { LATCH = { code: e.code, userMessage: e.userMessage || null, message: String(e.message).slice(0, 300), at: new Date().toISOString(), where: where || null }; fs.appendFileSync(LOG, JSON.stringify(Object.assign({ kind: "TRANSPORT_FAILURE_LATCHED", runId: opts.runId }, LATCH)) + "\n");
    if (opts.onTrace) { try { opts.onTrace({ event: "transport_failure_latched", outcome: e.code, code: e.code, normalizedCause: "TRANSPORT_FAILURE", where: where || null }); } catch (x) { /* */ } } } }
  function latchedError() { const e = new Error(LATCH.code + " (verrou de panne : " + LATCH.message + ")"); e.code = LATCH.code; e.userMessage = LATCH.userMessage; e.fatal = true; e.latched = true; return e; }
  async function llmCall(prompt, meta) {
    if (LATCH) throw latchedError();
    try { return await llmCallInner(prompt, meta); } catch (e) { latch(e, (meta && meta.purpose) || null); throw e; }
  }
  async function llmCallInner(prompt, meta) {
    if (!configured()) { const cs = credentials(); const st = STATE_BY_CODE[cs.code] || PROVIDER_STATES.NOT_CONFIGURED; const e = new Error(st.code); e.code = st.code; e.userMessage = st.user; e.fatal = true; throw e; }
    let d = policy.decide(prompt);
    if (d.decision === policy.DECISION.REUSE_VALID) {
      /* v1.0.2 — REUSE LIEE AU CONTEXTE (filtre additif au-dessus de la politique gelee) : meme fournisseur, meme modele, meme
         sceau d'execution, meme contrat de validation, statut VALID, et corps en cache dont le hash == responseSha256. Sinon : appel reel. */
      const chk = reuseContextCheck(d.entry);
      if (!chk.ok) { fs.appendFileSync(LOG, JSON.stringify({ kind: "LLM_REUSE_REFUSED", reason: chk.reason, promptSha256: sha(prompt), responseSha256: d.entry.responseSha256, entryModel: d.entry.modelId, entryProvider: d.entry.providerId, entrySeal: d.entry.sourceSealHash || null, runId: opts.runId, at: new Date().toISOString() }) + "\n"); REFUSED++; d = { decision: "REAL_CALL", reason: "reuse refusee : " + chk.reason }; }
    }
    if (d.decision === policy.DECISION.REUSE_VALID) {
      /* le corps reel vit dans le cache du run qui l'a produit (cachePath consigne) ou dans celui-ci */
      const src = cacheBodyPath(d.entry);   /* corps reel dont le hash a ete verifie par reuseContextCheck */
      if (src) {
        const parsed = JSON.parse(fs.readFileSync(src, "utf8")); const text = (parsed.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
        const rec = Object.assign(policy.reuseRecord(d.entry, { runId: opts.runId, reason: d.reason }), { purpose: meta && meta.purpose, runId: opts.runId, sourceSealHash: d.entry.sourceSealHash || null, targetSealHash: opts.sealHash || null });
        fs.appendFileSync(LOG, JSON.stringify(rec) + "\n"); REUSED++;
        ledgerRecord({ kind: "REUSE", purpose: meta && meta.purpose, pass: meta && meta.pass, model: d.entry.modelId, providerRequestId: d.entry.providerRequestId, callId: d.entry.responseSha256, candidateRef: meta && meta.candidateRef, twinId: meta && meta.twinId, targetId: meta && meta.targetId, sourceRunId: d.entry.sourceRunId });
        if (opts.onTrace) { try { opts.onTrace({ event: "llm_reuse", outcome: "REUSE_VALID", kindOfCall: "reuse", purpose: meta && meta.purpose, sourceRunId: d.entry.sourceRunId, promptSha256: sha(prompt), durationMs: 0 }); } catch (e) { /* observabilite */ } }
        return { text, providerId: d.entry.providerId, modelId: d.entry.modelId, providerRequestId: d.entry.providerRequestId, callId: d.entry.responseSha256, transportKind: "REUSE_OF_VALID_REAL_RESPONSE", httpStatus: 200, reused: true };
      }
    }
    budgetCheck(meta, "llm");   /* v1.0.5 : AVANT tout appel reel ; leve BUDGET_LIMIT_REACHED / PRICING_UNKNOWN_FOR_MODEL (verrouilles par llmCall) */
    const localRequestId = "efm-" + crypto.randomBytes(6).toString("hex");
    const body = JSON.stringify({ model: MODEL, max_tokens: 8192, messages: [{ role: "user", content: prompt }] });
    const startedAt = new Date().toISOString();
    const r = await httpCall(body, localRequestId);
    let parsed = null; try { parsed = JSON.parse(r.raw); } catch (e) { parsed = null; }
    const text = parsed && Array.isArray(parsed.content) ? parsed.content.filter((c) => c.type === "text").map((c) => c.text).join("") : "";
    const rec = { kind: "LLM_CALL", decision: d.decision, purpose: (meta && meta.purpose) || null, pass: (meta && meta.pass) || null, runId: opts.runId, startedAt, completedAt: new Date().toISOString(), localRequestId,
      providerRequestId: (parsed && parsed.id) || null, providerId: "anthropic", modelId: MODEL, httpStatus: r.res.status, providerAttempts: r.attempts, capacityWaits: r.waits,
      promptSha256: sha(prompt), responseSha256: sha(r.raw), usage: (parsed && parsed.usage) || null, stopReason: (parsed && parsed.stop_reason) || null };
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(path.join(CACHE, rec.promptSha256 + ".request.json"), JSON.stringify({ model: MODEL, prompt }));
    fs.writeFileSync(path.join(CACHE, rec.responseSha256 + ".response.json"), r.raw);
    fs.appendFileSync(LOG, JSON.stringify(rec) + "\n"); REAL++;
    if (r.res.status === 200) ledgerRecord({ kind: "REAL_CALL", at: rec.completedAt, purpose: rec.purpose, pass: rec.pass, model: (parsed && parsed.model) || MODEL, usage: rec.usage, providerRequestId: rec.providerRequestId, callId: rec.responseSha256, localRequestId, httpStatus: 200, candidateRef: meta && meta.candidateRef, twinId: meta && meta.twinId, targetId: meta && meta.targetId });
    if (opts.onTrace) { try { opts.onTrace({ event: "llm_call", outcome: r.res.status === 200 ? "OK" : "HTTP_" + r.res.status, kindOfCall: r.attempts > 1 ? "retry" : "call", purpose: rec.purpose, pass: rec.pass, providerRequestId: rec.providerRequestId, durationMs: Date.parse(rec.completedAt) - Date.parse(rec.startedAt), providerAttempts: r.attempts, promptSha256: rec.promptSha256 }); } catch (e) { /* observabilite */ } }
    if (r.res.status !== 200) { const st = r.state; const e = new Error(st.code + " (HTTP " + r.res.status + ")"); e.code = st.code; e.userMessage = st.user; e.fatal = true; e.httpStatus = r.res.status; throw e; }
    if (!text) { const e = new Error("PROVIDER_EMPTY_RESPONSE"); e.code = "PROVIDER_EMPTY_RESPONSE"; e.userMessage = parsed ? PROVIDER_STATES.UNAVAILABLE.user : PROVIDER_STATES.BAD_RESPONSE.user; throw e; }
    policy.recordReal({ promptSha256: rec.promptSha256, responseSha256: rec.responseSha256, sourceRunId: opts.runId, sourceCallId: rec.providerRequestId || localRequestId, providerRequestId: rec.providerRequestId, providerId: PROVIDER_ID, modelId: MODEL, completedAt: rec.completedAt, httpStatus: 200, purpose: rec.purpose, sourceSealHash: opts.sealHash || null, validationContract: VALIDATION_CONTRACT, cachePath: path.join(CACHE, rec.responseSha256 + ".response.json") });
    return { text, providerId: "anthropic", modelId: MODEL, providerRequestId: rec.providerRequestId, localRequestId, callId: rec.responseSha256, transportKind: "DELEGATED_WORKER_ANTHROPIC", httpStatus: 200, usage: rec.usage, reused: false };
  }
  function onValidation(v) { if (v) policy.markValidation(Object.assign({}, v, { responseSha256: v.callId || v.responseSha256 })); }
  /** Sonde de disponibilite (1 appel reel minimal) — rend un etat utilisateur, jamais un booleen declaratif. */
  async function preflight() {
    if (!configured()) { const cs = credentials(); return Object.assign({ ok: false }, STATE_BY_CODE[cs.code] || PROVIDER_STATES.NOT_CONFIGURED); }
    try { budgetCheck({ purpose: "preflight" }, "preflight"); const r = await httpCall(JSON.stringify({ model: MODEL, max_tokens: 8, messages: [{ role: "user", content: "Reponds uniquement: ok" }] }), "efm-preflight-" + crypto.randomBytes(4).toString("hex"));
      if (r.res.status === 200) { let pu = null; try { pu = JSON.parse(r.raw); } catch (e) { pu = null; } ledgerRecord({ kind: "PREFLIGHT", stage: "PREFLIGHT", purpose: "preflight", model: (pu && pu.model) || MODEL, usage: pu && pu.usage, providerRequestId: pu && pu.id, httpStatus: 200 }); }
      return Object.assign({ ok: r.res.status === 200, httpStatus: r.res.status, model: MODEL }, r.state); }
    catch (e) { return { ok: false, code: e.code, user: e.userMessage || e.message }; }
  }
  /** workerCallFn(prompt) -> texte, forme attendue par EF-02D2/D3/03B/03C geles et par le resolveur/planificateur via MONO-04. */
  const workerCallFn = async (prompt) => (await llmCall(prompt, { purpose: "worker" })).text;
  return { llmCall, onValidation, preflight, workerCallFn, model: MODEL, counts: () => ({ real: REAL, reused: REUSED, reuseRefused: REFUSED }), PROVIDER_STATES,
    transportFailure: () => LATCH, latch: latch, resetLatch: () => { LATCH = null; }, TRANSPORT_CODES, ledger: LEDGER, budget: BUDGET };
}

module.exports = { createLlm, PROVIDER_STATES };
