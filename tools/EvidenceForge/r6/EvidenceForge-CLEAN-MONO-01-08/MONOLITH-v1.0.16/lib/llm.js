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
const LS = require("./llm-stream.js");   /* v1.0.8 : STREAMING DE TRANSPORT (SSE Anthropic) — reconstruction canonique, fail-closed sur interruption ; jamais un changement de prompt ni de validation */

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

/* v1.0.16 (PB-B7) — IDENTITE DE REUTILISATION EF-03B. Le magasin generique (llm-reuse-store.jsonl) est indexe sur promptSha256 ; pour une
   finalite EF-03B, les octets du prompt ne suffisent pas a prouver l'autorite documentaire (audit PB-B7, cas T3b : autorite B prolongeant A,
   registre refusant l'entree A, magasin la servant quand meme). Une reponse EF-03B n'est donc reutilisable que si l'entree porte EXACTEMENT
   la cible, l'empreinte d'autorite normalisee, le contrat et le sceau d'execution de l'appel courant — memes contraintes que le registre
   (lib/ef03b-resilience.js createReviewRegistry.find). Une entree EF-03B sans cible ou sans empreinte (ere <= v1.0.15) n'est JAMAIS
   reutilisee : NON_REUSABLE_FOR_EF03B_V3, sans migration ni deduction depuis le prompt. Toute divergence = refus pour cette entree ;
   l'appel est alors recalcule normalement. Les finalites non EF-03B gardent le comportement historique (reuseContextCheck seul). */
const EF03B_PURPOSE = /^EF-03B/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const isEf03bPurpose = (p) => EF03B_PURPOSE.test(String(p || ""));
/** checkEf03bReuseIdentity(entry, current) -> { ok, code?, reason? } ; current = { targetId, documentAuthoritySha256, validationContract, sealHash } (fonction pure) */
function checkEf03bReuseIdentity(entry, current) {
  current = current || {};
  const no = (code, reason) => ({ ok: false, code: code, reason: code + " : " + reason });
  if (!entry) return no("EF03B_REUSE_ENTRY_ABSENT", "entree absente");
  if (!isEf03bPurpose(entry.purpose)) return no("EF03B_REUSE_PURPOSE_MISMATCH", "entree d'une autre finalite (" + (entry.purpose || "absente") + ")");
  if (typeof current.targetId !== "string" || !current.targetId || !SHA256_RE.test(String(current.documentAuthoritySha256 || ""))) return no("EF03B_REUSE_IDENTITY_MISSING", "appel EF-03B sans cible ou sans empreinte d'autorite : aucune reutilisation");
  if (typeof entry.targetId !== "string" || !entry.targetId) return no("NON_REUSABLE_FOR_EF03B_V3", "entree sans targetId");
  if (!SHA256_RE.test(String(entry.documentAuthoritySha256 || ""))) return no("NON_REUSABLE_FOR_EF03B_V3", "entree sans documentAuthoritySha256");
  if (entry.targetId !== current.targetId) return no("EF03B_REUSE_TARGET_MISMATCH", "cible " + entry.targetId + " != " + current.targetId);
  if (entry.documentAuthoritySha256 !== current.documentAuthoritySha256) return no("EF03B_REUSE_AUTHORITY_MISMATCH", "autorite " + entry.documentAuthoritySha256.slice(0, 12) + "… != " + current.documentAuthoritySha256.slice(0, 12) + "…");
  if (!current.validationContract || (entry.validationContract || null) !== current.validationContract) return no("EF03B_REUSE_CONTRACT_MISMATCH", "contrat " + (entry.validationContract || "absent") + " != " + (current.validationContract || "absent"));
  if (typeof current.sealHash !== "string" || !current.sealHash) return no("EF03B_REUSE_SEAL_REQUIRED", "appel EF-03B sans sceau d'execution : aucune reutilisation");
  if ((entry.sourceSealHash || null) !== current.sealHash) return no("EF03B_REUSE_SEAL_MISMATCH", "sceau " + (entry.sourceSealHash || "absent") + " != " + current.sealHash);
  return { ok: true };
}

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
  /* v1.0.5 — ROUTAGE PAR FINALITE (config llm.routing { "<purpose>": "<model>" } ou opts.routing ; env EVIDENCEFORGE_LLM_ROUTING = JSON) :
     un appel dont la finalite est routee part vers ce modele ; le modele est journalise par appel (ledger, llm-calls, registre MONO-11) et la
     reuse compare le modele de la finalite. Par defaut : aucune route (tout va au modele principal). Une route n'est posee qu'apres benchmark. */
  let ROUTING = Object.assign({}, cfg.routing || {}, opts.routing || {}); try { if (process.env.EVIDENCEFORGE_LLM_ROUTING) ROUTING = Object.assign(ROUTING, JSON.parse(process.env.EVIDENCEFORGE_LLM_ROUTING)); } catch (e) { /* JSON invalide : ignore, journalise ci-dessous */ }
  Object.keys(ROUTING).forEach((k) => { if (k.startsWith("$") || typeof ROUTING[k] !== "string" || !ROUTING[k]) delete ROUTING[k]; });
  const modelFor = (meta) => (meta && meta.purpose && ROUTING[meta.purpose]) || MODEL;
  const LOG = path.join(opts.runDir, "llm-calls.jsonl"), CACHE = path.join(opts.runDir, "llm-cache");
  const store = createFileStore(opts.storePath || path.join(P.RUNS, "llm-reuse-store.jsonl"));   // magasin PARTAGE entre runs (reuse inter-run, provenance complete)
  const policy = RU.createReusePolicy({ store: store, allowReuse: process.env.EVIDENCEFORGE_LLM_REUSE !== "0" });
  let REAL = 0, REUSED = 0, lastAt = 0;
  const minGap = Number(process.env.EVIDENCEFORGE_LLM_MIN_SPACING_MS || opts.minSpacingMs || cfg.minSpacingMs || 1500);
  const maxAttempts = opts.maxAttemptsOnCapacity || cfg.maxAttemptsOnCapacity || 8;
  const timeoutMs = Number(process.env.EVIDENCEFORGE_LLM_TIMEOUT_MS || opts.timeoutMs || cfg.timeoutMs || 180000);
  /* v1.0.8 — streaming de transport : `stream: true` vers le Worker (relais SSE non bufferise, proxy v0.7) ; le delai `timeoutMs` ne couvre plus que
     l'attente du PREMIER octet (en-tetes) ; ensuite delai d'INACTIVITE et delai TOTAL bornes. Desactivable (EVIDENCEFORGE_LLM_STREAM=0 / config llm.streaming.enabled=false). */
  const SCFG = Object.assign({ enabled: true, inactivityMs: 90000, maxTotalMs: 900000, progressEveryMs: 5000 }, cfg.streaming || {}, opts.streaming || {}); delete SCFG.$comment;
  const STREAMING = SCFG.enabled !== false && process.env.EVIDENCEFORGE_LLM_STREAM !== "0";
  const TRACE = process.env.EVIDENCEFORGE_TRACE_REVIEWS === "1";
  const trace = (line) => { if (TRACE) { try { console.log(line); } catch (e) { /* */ } } };
  const extraCacheDirs = (opts.extraCacheDirs || cfg.reuseCacheDirs || []).map((d) => path.resolve(P.ROOT, d));

  let REFUSED = 0;
  const PROVIDER_ID = "anthropic", VALIDATION_CONTRACT = (P.CONFIG.frozenLots["MONO-11"] || {}).contractVersion || "MONO-11-v3";   /* v1.0.12 (R6) : contrat SCIENTIFIQUE lu dans la configuration du lot gele (MONO-11 v0.4 : MONO-11-v3) ; une reponse mise en cache sous un autre contrat n'est jamais reutilisee (reuseContextCheck) */   /* contrat SCIENTIFIQUE de validation des reponses (contractVersion MONO-11-v3 (lot MONO-11 v0.4) ; distinct de la version du CODE = sceau) */
  function cacheBodyPath(entry) { const c = [entry.cachePath, path.join(CACHE, entry.responseSha256 + ".response.json")].concat(extraCacheDirs.map((dir) => path.join(dir, entry.responseSha256 + ".response.json"))).filter(Boolean); return c.find((f) => fs.existsSync(f)) || null; }
  function reuseContextCheck(entry, model) {
    model = model || MODEL; if (!entry) return { ok: false, reason: "entree absente" };
    if (entry.validationStatus !== "VALID") return { ok: false, reason: "statut " + entry.validationStatus };
    if (entry.providerId !== PROVIDER_ID) return { ok: false, reason: "fournisseur different (" + entry.providerId + ")" };
    if (entry.modelId !== model) return { ok: false, reason: "modele different (" + entry.modelId + " vs " + model + ")" };
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
  async function httpCall(body, localRequestId, meta) {
    const base = process.env.LLM_WORKER_BASE_URL.replace(/\/$/, ""), key = process.env.EVIDENCEFORGE_WORKER_API_KEY;
    const gap = Date.now() - lastAt; if (gap < minGap) await new Promise((r) => setTimeout(r, minGap - gap));
    let attempts = 0; const waits = []; const wantStream = STREAMING && !(meta && meta.noStream);
    for (;;) {
      attempts++; lastAt = Date.now();
      let res, raw, stream = null;
      /* delai borne : minuterie REFERENCEE (un AbortSignal.timeout natif est unref'd et ne garantit pas le declenchement) — en streaming : premier octet seulement */
      const ac = new AbortController(); let timedOut = false; const timer = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
      try { res = await fetch(base + "/v1/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key, "x-evidenceforge-request-id": localRequestId, accept: wantStream ? "text/event-stream, application/json" : "application/json" }, body: body, signal: ac.signal });
        const ct = String(res.headers.get("content-type") || "");
        if (wantStream && res.status === 200 && /text\/event-stream/i.test(ct)) {
          clearTimeout(timer);   /* en-tetes recus : le delai d'attente du premier octet ne s'applique plus ; le flux est borne par inactivite / duree totale */
          const t0 = Date.now(); let lastProgressEmit = 0;
          const onProgress = (p) => { if (p.kind === "STREAM_PROGRESS" && Date.now() - lastProgressEmit < SCFG.progressEveryMs) return; lastProgressEmit = Date.now();
            if (opts.onStream) { try { opts.onStream(Object.assign({ purpose: meta && meta.purpose, twinId: meta && meta.twinId, targetId: meta && meta.targetId, localRequestId }, p)); } catch (e) { /* observabilite */ } }
            if (p.kind !== "STREAM_PROGRESS" || TRACE) trace("[EF STREAM] " + (meta && meta.twinId ? "twin=" + meta.twinId + " " : "") + "state=" + p.kind + " elapsed=" + p.elapsedMs + "ms events=" + p.events + " bytes=" + p.bytes + " lastActivity=" + p.lastActivityAt); };
          try { stream = await LS.readSseResponse(res, { inactivityMs: SCFG.inactivityMs, maxTotalMs: SCFG.maxTotalMs, onProgress, stopCheck: typeof opts.stopCheck === "function" ? opts.stopCheck : null, localRequestId }); raw = stream.raw; }
          catch (e) { e.streamStats = e.stream || null; e.elapsedMs = Date.now() - t0; throw e; }
        } else { raw = await res.text(); if (wantStream && res.status === 200 && /^\s*event:|\ndata: \{/.test(raw)) { const a = LS.assembleFromSseText(raw); if (a.complete) { raw = a.raw; stream = { canonical: a.canonical, raw: a.raw, state: a.state, stats: { buffered: true, events: a.state.events, bytes: raw.length } }; } else { const e = LS.interruptedError({ events: a.state.events, bytes: raw.length, elapsedMs: 0, started: a.state.started, completed: a.state.completed, providerRequestId: a.state.id || null }, "BUFFERED_SSE_INCOMPLETE"); throw e; } } } }
      catch (e) { if (e && (e.code === LS.CODE_INTERRUPTED || e.code === "STOPPED_BY_USER" || e.code === "PROVIDER_CAPACITY" || e.code === "PROVIDER_UNAVAILABLE" || e.code === "PROVIDER_BAD_RESPONSE") && e.stream) { e.fatal = true; if (!e.userMessage) e.userMessage = PROVIDER_STATES.UNAVAILABLE.user; throw e; }
        const st = classify(null, null, e, timedOut); const err = new Error(st.code + ": " + String(e.message).slice(0, 200)); err.code = st.code; err.userMessage = st.user; err.fatal = true; err.detail = String(e && e.cause && e.cause.code || "").slice(0, 60); throw err; }
      finally { clearTimeout(timer); }
      const st = classify(res.status, raw, null);
      if (st === PROVIDER_STATES.CREDIT) { const err = new Error(st.code); err.code = st.code; err.userMessage = st.user; err.fatal = true; err.httpStatus = 400; throw err; }
      if (RETRYABLE_STATES.indexOf(st) !== -1 && attempts < maxAttempts) { const ra = Number(res.headers.get("retry-after")); const w = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 300000) : Math.min(30000 * Math.pow(2, attempts - 1), 300000); waits.push({ status: res.status, waitMs: w }); await new Promise((r) => setTimeout(r, w)); continue; }
      return { res: res, raw: raw, attempts: attempts, waits: waits, state: st, stream: stream };
    }
  }

  /* v1.0.2 — VERROU DE PANNE DE TRANSPORT : la premiere panne externe fatale (reseau, delai, credit, debit epuise, fournisseur) est
     memorisee ; tout appel suivant echoue immediatement sans reseau, pour qu'un lot gele qui absorbe les exceptions ne transforme
     jamais une panne en verdict documentaire. Le pipeline lit `transportFailure()` a la frontiere de l'etape et arrete (reprenable). */
  let LATCH = null;
  const TRANSPORT_CODES = ["NETWORK_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_CREDIT_EXHAUSTED", "PROVIDER_RATE_LIMITED", "PROVIDER_UNAVAILABLE", "PROVIDER_NOT_CONFIGURED", "PROVIDER_EMPTY_RESPONSE", "BUDGET_LIMIT_REACHED", "PRICING_UNKNOWN_FOR_MODEL",
    "PROVIDER_PLACEHOLDER", "PROVIDER_URL_INVALID", "PROVIDER_DNS_ERROR", "PROVIDER_CONNECTION_REFUSED", "PROVIDER_TLS_ERROR", "PROVIDER_AUTH_ERROR", "PROVIDER_ROUTE_NOT_FOUND", "PROVIDER_CAPACITY", "PROVIDER_BAD_RESPONSE",
    "STOPPED_BY_USER", LS.CODE_INTERRUPTED];   /* RUN SAFETY : l'arret utilisateur est un verrou de transport (aucun appel apres, boucles gelees absorbent, frontiere d'etape arrete) ; v1.0.8 : flux interrompu = verrou, jamais une reponse */
  /* v1.0.5 — ledger de cout et garde de budget (optionnels : les tests unitaires du transport n'en ont pas besoin) */
  const LEDGER = opts.ledger || null, BUDGET = opts.budget || null;
  const ledgerRecord = (e) => { if (LEDGER) { try { LEDGER.record(e); } catch (x) { fs.appendFileSync(LOG, JSON.stringify({ kind: "COST_LEDGER_ERROR", runId: opts.runId, message: String(x.message).slice(0, 300), at: new Date().toISOString() }) + "\n"); } } };
  const budgetCheck = (meta, where) => { if (BUDGET) BUDGET.assertAllowed({ model: modelFor(meta), purpose: (meta && meta.purpose) || null, where }); };
  function latch(e, where) { if (!LATCH && e && TRANSPORT_CODES.indexOf(e.code) !== -1) { LATCH = { code: e.code, userMessage: e.userMessage || null, message: String(e.message).slice(0, 300), at: new Date().toISOString(), where: where || null }; fs.appendFileSync(LOG, JSON.stringify(Object.assign({ kind: "TRANSPORT_FAILURE_LATCHED", runId: opts.runId }, LATCH)) + "\n");
    if (opts.onTrace) { try { opts.onTrace({ event: "transport_failure_latched", outcome: e.code, code: e.code, normalizedCause: "TRANSPORT_FAILURE", where: where || null }); } catch (x) { /* */ } } } }
  function latchedError() { const e = new Error(LATCH.code + " (verrou de panne : " + LATCH.message + ")"); e.code = LATCH.code; e.userMessage = LATCH.userMessage; e.fatal = true; e.latched = true; return e; }
  async function llmCall(prompt, meta) {
    if (LATCH) throw latchedError();
    try { return await llmCallInner(prompt, meta); } catch (e) { latch(e, (meta && meta.purpose) || null); throw e; }
  }
  /* RUN SAFETY — demande d'arret utilisateur lue AVANT chaque appel, reel OU reutilise (stop = arreter le travail, pas seulement la depense) */
  const stopCheck = () => { if (typeof opts.stopCheck !== "function") return; const req = opts.stopCheck(); if (req) { const e = new Error("STOPPED_BY_USER: arret demande par l'utilisateur" + (req.requestedAt ? " a " + req.requestedAt : "")); e.code = "STOPPED_BY_USER"; e.fatal = true; e.userStop = true; e.userMessage = "Run arrêté à votre demande : aucun nouvel appel au service d'analyse n'a été lancé après votre demande ; les résultats déjà produits sont conservés. Vous pourrez reprendre le run explicitement."; throw e; } };
  async function llmCallInner(prompt, meta) {
    stopCheck();
    if (!configured()) { const cs = credentials(); const st = STATE_BY_CODE[cs.code] || PROVIDER_STATES.NOT_CONFIGURED; const e = new Error(st.code); e.code = st.code; e.userMessage = st.user; e.fatal = true; throw e; }
    let d = policy.decide(prompt);
    if (d.decision === policy.DECISION.REUSE_VALID) {
      /* v1.0.2 — REUSE LIEE AU CONTEXTE (filtre additif au-dessus de la politique gelee) : meme fournisseur, meme modele, meme
         sceau d'execution, meme contrat de validation, statut VALID, et corps en cache dont le hash == responseSha256. Sinon : appel reel. */
      /* v1.0.16 (PB-B7) : pour EF-03B (appel OU entree), l'identite de reutilisation est verifiee AVANT le contexte generique — cible, autorite,
         contrat, sceau obligatoire ; entree sans identite = NON_REUSABLE_FOR_EF03B_V3. Hors EF-03B : comportement historique, inchange. */
      const ef03b = isEf03bPurpose(meta && meta.purpose) || isEf03bPurpose(d.entry.purpose);
      const idChk = ef03b ? checkEf03bReuseIdentity(d.entry, { targetId: meta && meta.targetId, documentAuthoritySha256: meta && meta.documentAuthoritySha256, validationContract: VALIDATION_CONTRACT, sealHash: opts.sealHash || null }) : { ok: true };
      const chk = idChk.ok ? reuseContextCheck(d.entry, modelFor(meta)) : idChk;
      if (!chk.ok) { fs.appendFileSync(LOG, JSON.stringify(Object.assign({ kind: "LLM_REUSE_REFUSED", reason: chk.reason, promptSha256: sha(prompt), responseSha256: d.entry.responseSha256, entryModel: d.entry.modelId, entryProvider: d.entry.providerId, entrySeal: d.entry.sourceSealHash || null, runId: opts.runId, at: new Date().toISOString() },
          ef03b ? { code: chk.code || null, purpose: (meta && meta.purpose) || null, targetId: (meta && meta.targetId) || null, documentAuthoritySha256: (meta && meta.documentAuthoritySha256) || null, entryTargetId: d.entry.targetId || null, entryAuthoritySha256: d.entry.documentAuthoritySha256 || null } : {})) + "\n"); REFUSED++; d = { decision: "REAL_CALL", reason: "reuse refusee : " + chk.reason }; }
    }
    if (d.decision === policy.DECISION.REUSE_VALID) {
      /* le corps reel vit dans le cache du run qui l'a produit (cachePath consigne) ou dans celui-ci */
      const src = cacheBodyPath(d.entry);   /* corps reel dont le hash a ete verifie par reuseContextCheck */
      if (src) {
        const parsed = JSON.parse(fs.readFileSync(src, "utf8")); const text = (parsed.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
        const rec = Object.assign(policy.reuseRecord(d.entry, { runId: opts.runId, reason: d.reason }), { purpose: meta && meta.purpose, runId: opts.runId, sourceSealHash: d.entry.sourceSealHash || null, targetSealHash: opts.sealHash || null }, isEf03bPurpose(meta && meta.purpose) ? { targetId: d.entry.targetId, documentAuthoritySha256: d.entry.documentAuthoritySha256 } : {});   /* v1.0.16 : identite de la reutilisation EF-03B journalisee */
        fs.appendFileSync(LOG, JSON.stringify(rec) + "\n"); REUSED++;
        ledgerRecord({ kind: "REUSE", purpose: meta && meta.purpose, pass: meta && meta.pass, model: d.entry.modelId, providerRequestId: d.entry.providerRequestId, callId: d.entry.responseSha256, candidateRef: meta && meta.candidateRef, twinId: meta && meta.twinId, targetId: meta && meta.targetId, sourceRunId: d.entry.sourceRunId });
        if (opts.onTrace) { try { opts.onTrace({ event: "llm_reuse", outcome: "REUSE_VALID", kindOfCall: "reuse", purpose: meta && meta.purpose, sourceRunId: d.entry.sourceRunId, promptSha256: sha(prompt), durationMs: 0 }); } catch (e) { /* observabilite */ } }
        return { text, providerId: d.entry.providerId, modelId: d.entry.modelId, providerRequestId: d.entry.providerRequestId, callId: d.entry.responseSha256, transportKind: "REUSE_OF_VALID_REAL_RESPONSE", httpStatus: 200, reused: true };
      }
    }
    budgetCheck(meta, "llm");   /* v1.0.5 : AVANT tout appel reel ; leve BUDGET_LIMIT_REACHED / PRICING_UNKNOWN_FOR_MODEL (verrouilles par llmCall) */
    const localRequestId = "efm-" + crypto.randomBytes(6).toString("hex");
    const CALL_MODEL = modelFor(meta);
    const wantStream = STREAMING && !(meta && meta.noStream);
    const MAX_TOKENS = Number(meta && meta.maxTokens) > 0 ? Math.min(Math.round(Number(meta.maxTokens)), 65536) : 8192;   /* v1.0.10 : max_tokens dimensionne par finalite (EF-03B : llm.reviewMaxTokens) ; defaut historique 8192 */
    const body = JSON.stringify(Object.assign({ model: CALL_MODEL, max_tokens: MAX_TOKENS, messages: [{ role: "user", content: prompt }] }, wantStream ? { stream: true } : {}));   /* v1.0.8 : `stream: true` = transport seulement (meme prompt) */
    const startedAt = new Date().toISOString();
    trace("[EF REVIEW] " + (meta && meta.twinId ? "twin=" + meta.twinId + " " : "") + "purpose=" + ((meta && meta.purpose) || "?") + (meta && meta.targetId ? " target=" + meta.targetId : "") + " state=STARTED promptChars=" + prompt.length + " estimatedPromptTokens=" + Math.round(prompt.length / 4) + " stream=" + wantStream + " localRequestId=" + localRequestId);
    let r;
    try { r = await httpCall(body, localRequestId, meta); }
    catch (e) {
      /* v1.0.8 — FLUX INTERROMPU (ou arret utilisateur pendant le flux) : journal precis (jamais le texte partiel), cout DISPONIBLE inscrit si l'usage fournisseur est connu, aucune reponse, aucun cache, aucun reuse, aucun retry automatique (un retry re-facturerait une generation deja lancee) */
      if (e && e.stream) { const st = e.stream; const completedAt = new Date().toISOString();
        const rec = { kind: "LLM_CALL", decision: d.decision, outcome: e.code === "STOPPED_BY_USER" ? "STREAM_STOPPED_BY_USER" : "STREAM_INTERRUPTED", purpose: (meta && meta.purpose) || null, pass: (meta && meta.pass) || null, runId: opts.runId, startedAt, completedAt, localRequestId, providerRequestId: st.providerRequestId || null, providerId: "anthropic", modelId: CALL_MODEL, httpStatus: 200, promptSha256: sha(prompt), responseSha256: null, usage: st.usage || null,
          stream: { started: !!st.started, completed: false, events: st.events, bytes: st.bytes, elapsedMs: st.elapsedMs, lastActivityAt: st.lastActivityAt, textChars: st.textChars || 0, cause: e.normalizedCause || e.code }, twinId: meta && meta.twinId || null, targetId: meta && meta.targetId || null, code: e.code };
        fs.appendFileSync(LOG, JSON.stringify(rec) + "\n"); REAL++;
        if (st.usage && Number(st.usage.input_tokens) > 0) ledgerRecord({ kind: "REAL_CALL", at: completedAt, purpose: rec.purpose, pass: rec.pass, model: st.model || CALL_MODEL, usage: { input_tokens: Number(st.usage.input_tokens || 0), output_tokens: Number(st.usage.output_tokens || 0), cache_creation_input_tokens: st.usage.cache_creation_input_tokens || 0, cache_read_input_tokens: st.usage.cache_read_input_tokens || 0 }, providerRequestId: rec.providerRequestId, callId: null, localRequestId, httpStatus: 200, candidateRef: meta && meta.candidateRef, twinId: meta && meta.twinId, targetId: meta && meta.targetId, interrupted: true, usageIncomplete: st.usageFinal !== true });   /* l'usage final (output_tokens) n'est connu qu'a message_delta : un flux interrompu avant est incomplet */
        if (opts.onTrace) { try { opts.onTrace({ event: "llm_stream_interrupted", outcome: rec.outcome, code: e.code, purpose: rec.purpose, pass: rec.pass, twinId: rec.twinId, targetId: rec.targetId, localRequestId, providerRequestId: rec.providerRequestId, streamStarted: !!st.started, streamEvents: st.events, streamBytes: st.bytes, durationMs: st.elapsedMs, normalizedCause: e.normalizedCause || e.code, usageKnown: !!(st.usage && st.usage.input_tokens) }); } catch (x) { /* observabilite */ } }
        trace("[EF REVIEW ERROR] " + (meta && meta.twinId ? "twin=" + meta.twinId + " " : "") + "code=" + e.code + " elapsed=" + st.elapsedMs + "ms streamStarted=" + !!st.started + " events=" + st.events + " bytes=" + st.bytes + " providerRequestId=" + (st.providerRequestId || "-") + " checkpoint=UNCHANGED resumable=true"); }
      else trace("[EF REVIEW ERROR] " + (meta && meta.twinId ? "twin=" + meta.twinId + " " : "") + "code=" + (e && e.code) + " http=" + (e && e.httpStatus || "-") + " streamStarted=false resumable=true");
      throw e; }
    let parsed = null; try { parsed = JSON.parse(r.raw); } catch (e) { parsed = null; }
    const text = parsed && Array.isArray(parsed.content) ? parsed.content.filter((c) => c.type === "text").map((c) => c.text).join("") : "";
    const rec = { kind: "LLM_CALL", decision: d.decision, purpose: (meta && meta.purpose) || null, pass: (meta && meta.pass) || null, runId: opts.runId, startedAt, completedAt: new Date().toISOString(), localRequestId,
      providerRequestId: (parsed && parsed.id) || null, providerId: "anthropic", modelId: CALL_MODEL, routed: CALL_MODEL !== MODEL, httpStatus: r.res.status, providerAttempts: r.attempts, capacityWaits: r.waits,
      promptSha256: sha(prompt), responseSha256: sha(r.raw), usage: (parsed && parsed.usage) || null, stopReason: (parsed && parsed.stop_reason) || null,
      transport: r.stream ? (r.stream.stats && r.stream.stats.buffered ? "SSE_BUFFERED_BY_PROXY" : "SSE_STREAM") : "JSON", stream: r.stream ? { events: r.stream.stats ? r.stream.stats.events : null, bytes: r.stream.stats ? r.stream.stats.bytes : null, elapsedMs: r.stream.stats ? r.stream.stats.elapsedMs : null, canonical: true } : null,
      twinId: (meta && meta.twinId) || null, targetId: (meta && meta.targetId) || null, maxTokens: MAX_TOKENS, strategy: (meta && meta.strategy) || null };   /* v1.0.8 : identite de la revue journalisee ; v1.0.10 : max_tokens et strategie */
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(path.join(CACHE, rec.promptSha256 + ".request.json"), JSON.stringify({ model: CALL_MODEL, prompt }));
    fs.writeFileSync(path.join(CACHE, rec.responseSha256 + ".response.json"), r.raw);
    fs.appendFileSync(LOG, JSON.stringify(rec) + "\n"); REAL++;
    if (r.res.status === 200) ledgerRecord({ kind: "REAL_CALL", at: rec.completedAt, purpose: rec.purpose, pass: rec.pass, model: (parsed && parsed.model) || CALL_MODEL, usage: rec.usage, providerRequestId: rec.providerRequestId, callId: rec.responseSha256, localRequestId, httpStatus: 200, candidateRef: meta && meta.candidateRef, twinId: meta && meta.twinId, targetId: meta && meta.targetId });
    if (opts.onTrace) { try { opts.onTrace({ event: "llm_call", outcome: r.res.status === 200 ? "OK" : "HTTP_" + r.res.status, kindOfCall: r.attempts > 1 ? "retry" : "call", purpose: rec.purpose, pass: rec.pass, providerRequestId: rec.providerRequestId, durationMs: Date.parse(rec.completedAt) - Date.parse(rec.startedAt), providerAttempts: r.attempts, promptSha256: rec.promptSha256, transport: rec.transport, twinId: rec.twinId, targetId: rec.targetId, httpStatus: r.res.status }); } catch (e) { /* observabilite */ } }
    if (r.res.status !== 200) { const st = r.state; const e = new Error(st.code + " (HTTP " + r.res.status + ")"); e.code = st.code; e.userMessage = st.user; e.fatal = true; e.httpStatus = r.res.status; trace("[EF REVIEW ERROR] " + (meta && meta.twinId ? "twin=" + meta.twinId + " " : "") + "http=" + r.res.status + " elapsed=" + (Date.parse(rec.completedAt) - Date.parse(rec.startedAt)) + "ms streamStarted=false events=0 bytes=" + String(r.raw || "").length + " checkpoint=UNCHANGED resumable=true"); throw e; }
    trace("[EF REVIEW] " + (meta && meta.twinId ? "twin=" + meta.twinId + " " : "") + "purpose=" + rec.purpose + " state=RECEIVED transport=" + rec.transport + " elapsed=" + (Date.parse(rec.completedAt) - Date.parse(rec.startedAt)) + "ms responseSha256=" + rec.responseSha256.slice(0, 16) + " usage=" + JSON.stringify(rec.usage && { in: rec.usage.input_tokens, out: rec.usage.output_tokens }));
    if (!text) { const e = new Error("PROVIDER_EMPTY_RESPONSE"); e.code = "PROVIDER_EMPTY_RESPONSE"; e.userMessage = parsed ? PROVIDER_STATES.UNAVAILABLE.user : PROVIDER_STATES.BAD_RESPONSE.user; throw e; }
    policy.recordReal(Object.assign({ promptSha256: rec.promptSha256, responseSha256: rec.responseSha256, sourceRunId: opts.runId, sourceCallId: rec.providerRequestId || localRequestId, providerRequestId: rec.providerRequestId, providerId: PROVIDER_ID, modelId: CALL_MODEL, completedAt: rec.completedAt, httpStatus: 200, purpose: rec.purpose, sourceSealHash: opts.sealHash || null, validationContract: VALIDATION_CONTRACT, cachePath: path.join(CACHE, rec.responseSha256 + ".response.json") },
      /* v1.0.16 (PB-B7) : une entree EF-03B porte l'identite de l'appel qui l'a produite (cible + autorite normalisee fournies par l'adaptateur) ;
         sans elles, elle est ecrite telle quelle et ne sera jamais reutilisee (NON_REUSABLE_FOR_EF03B_V3). Entrees non EF-03B : forme historique. */
      isEf03bPurpose(rec.purpose) ? { targetId: (meta && meta.targetId) || null, documentAuthoritySha256: (meta && SHA256_RE.test(String(meta.documentAuthoritySha256 || "")) ? meta.documentAuthoritySha256 : null), twinId: (meta && meta.twinId) || null, reuseIdentity: "EF03B-v1.0.16" } : {}));
    return { text, providerId: "anthropic", modelId: CALL_MODEL, providerRequestId: rec.providerRequestId, localRequestId, callId: rec.responseSha256, transportKind: "DELEGATED_WORKER_ANTHROPIC", httpStatus: 200, usage: rec.usage, reused: false, stopReason: rec.stopReason, maxTokens: MAX_TOKENS };   /* v1.0.10 : stop_reason expose (troncature detectable par l'appelant) */
  }
  /* v1.0.10 — REUSE D'UNE REVUE LOGIQUE VALID (registre EF-03B, lib/ef03b-resilience.js) : journalisee comme une reutilisation (jamais un appel reel), cout 0 au ledger. */
  function recordReuse(info) { info = info || {}; const rec = { kind: "LLM_REUSE", reuseKind: info.kind || "REVIEW_REGISTRY", countsAsRealCall: false, purpose: info.purpose || null, twinId: info.twinId || null, targetId: info.targetId || null, responseHash: info.callId || null, sourceRunId: info.sourceRunId || null, reuseReason: info.reason || null, runId: opts.runId, at: new Date().toISOString() };
    fs.appendFileSync(LOG, JSON.stringify(rec) + "\n"); REUSED++; ledgerRecord({ kind: "REUSE", purpose: info.purpose || null, model: MODEL, providerRequestId: null, callId: info.callId || null, twinId: info.twinId || null, targetId: info.targetId || null, sourceRunId: info.sourceRunId || null });
    if (opts.onTrace) { try { opts.onTrace({ event: "llm_reuse", outcome: "REUSE_VALID", kindOfCall: "reuse", purpose: info.purpose || null, twinId: info.twinId || null, targetId: info.targetId || null, sourceRunId: info.sourceRunId || null, reuseKind: rec.reuseKind, durationMs: 0 }); } catch (e) { /* observabilite */ } }
    return rec; }
  function onValidation(v) { if (v) { policy.markValidation(Object.assign({}, v, { responseSha256: v.callId || v.responseSha256 })); trace("[EF REVIEW] validation=" + (v.valid ? "VALID" : "INVALID") + " stage=" + (v.stage || "?") + " callId=" + String(v.callId || v.responseSha256 || "").slice(0, 16) + (v.errors && v.errors.length ? " errors=" + v.errors.length : "")); } }
  /** Sonde de disponibilite (1 appel reel minimal) — rend un etat utilisateur, jamais un booleen declaratif. */
  async function preflight() {
    if (!configured()) { const cs = credentials(); return Object.assign({ ok: false }, STATE_BY_CODE[cs.code] || PROVIDER_STATES.NOT_CONFIGURED); }
    try { budgetCheck({ purpose: "preflight" }, "preflight"); const r = await httpCall(JSON.stringify({ model: MODEL, max_tokens: 8, messages: [{ role: "user", content: "Reponds uniquement: ok" }] }), "efm-preflight-" + crypto.randomBytes(4).toString("hex"), { purpose: "preflight", noStream: true });
      if (r.res.status === 200) { let pu = null; try { pu = JSON.parse(r.raw); } catch (e) { pu = null; } ledgerRecord({ kind: "PREFLIGHT", stage: "PREFLIGHT", purpose: "preflight", model: (pu && pu.model) || MODEL, usage: pu && pu.usage, providerRequestId: pu && pu.id, httpStatus: 200 }); }
      return Object.assign({ ok: r.res.status === 200, httpStatus: r.res.status, model: MODEL }, r.state); }
    catch (e) { return { ok: false, code: e.code, user: e.userMessage || e.message }; }
  }
  /** workerCallFn(prompt) -> texte, forme attendue par EF-02D2/D3/03B/03C geles et par le resolveur/planificateur via MONO-04. */
  const workerCallFn = async (prompt) => (await llmCall(prompt, { purpose: "worker" })).text;
  return { llmCall, onValidation, recordReuse, preflight, workerCallFn, model: MODEL, counts: () => ({ real: REAL, reused: REUSED, reuseRefused: REFUSED }), PROVIDER_STATES, streaming: { enabled: STREAMING, inactivityMs: SCFG.inactivityMs, maxTotalMs: SCFG.maxTotalMs, firstByteTimeoutMs: timeoutMs },
    transportFailure: () => LATCH, latch: latch, resetLatch: () => { LATCH = null; }, TRANSPORT_CODES, ledger: LEDGER, budget: BUDGET, routing: Object.assign({}, ROUTING), modelFor };
}

module.exports = { createLlm, PROVIDER_STATES, checkEf03bReuseIdentity, isEf03bPurpose };
