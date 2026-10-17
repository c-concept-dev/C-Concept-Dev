'use strict';
// EF01_TRANSPORT_POLICY_V1: technical composition only; frozen Gateway validates responses.
const fs = require('fs'), path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const POLICY_ID = 'EF01_TRANSPORT_POLICY_V1';
const UNKNOWN = 'EXTERNAL_OUTCOME_UNKNOWN';
function configError() { return Object.assign(new Error('EF01_TRANSPORT_POLICY_INVALID'), { code: 'EF01_TRANSPORT_POLICY_INVALID' }); }
function timeout(value) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1000 || value > 900000) throw configError(); return value; }
function validatePolicy(p) {
  const keys = ['id', 'responseStartTimeoutMs', 'bodyReadTimeoutMs', 'maxAttempts', 'backoffMs', 'issueUnknown'];
  if (!p || Object.keys(p).some(k => !keys.includes(k)) || p.id !== POLICY_ID || p.maxAttempts !== 2 || p.backoffMs !== 2000 || p.issueUnknown !== 'STOP_NO_RETRY') throw configError();
  return Object.freeze({ ...p, responseStartTimeoutMs: timeout(p.responseStartTimeoutMs), bodyReadTimeoutMs: timeout(p.bodyReadTimeoutMs) });
}
function scoped(req, stage) { return ['DISCIPLINES', 'PLAN', 'EF01'].includes(stage) && req.provider === 'llm-worker' && req.moduleId === 'real-llm-call' && req.operation === 'call'; }
function technicalError(code) { return Object.assign(new Error(code), { code }); }
// Race, not only abort: also bounds a non-cooperative injected transport. Never expose exception text.
function bounded(operation, ms, signal, cancel, code) {
  return new Promise((resolve, reject) => {
    let timer, done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', abort); fn(v); };
    const abort = () => { cancel(); finish(reject, technicalError(code)); };
    if (signal && signal.aborted) return abort();
    if (signal) signal.addEventListener('abort', abort, { once: true });
    if (ms != null) timer = setTimeout(abort, ms);
    Promise.resolve().then(operation).then(v => finish(resolve, v), () => finish(reject, technicalError(code)));
  });
}
function safeRateLimit(res, parsed) {
  return res.status === 429 && /application\/json/i.test(res.headers.get('content-type') || '') && parsed && typeof parsed === 'object' && parsed.type === 'error' && parsed.error && parsed.error.type === 'rate_limit_error' && !('usage' in parsed) && !('content' in parsed) && !('id' in parsed);
}
function composeEf01TransportPolicy(mono04, opts, dependencies = {}) {
  const policy = validatePolicy(opts.policy);
  const storage = new AsyncLocalStorage();
  const rawFetch = dependencies.fetchImpl || globalThis.fetch;
  async function transport(url, init) {
    const ctx = storage.getStore();
    if (!ctx) return rawFetch(url, init);
    for (let n = 1; n <= policy.maxAttempts; n++) {
      if (init.signal.aborted) throw technicalError(UNKNOWN);
      if (opts.cost && opts.cost.budget) opts.cost.budget.assertAllowed({ model: ctx.req.payload.model, purpose: opts.stage, where: 'ef01-transport' });
      const ac = new AbortController();
      const abort = () => ac.abort();
      init.signal.addEventListener('abort', abort, { once: true });
      const release = () => init.signal.removeEventListener('abort', abort);
      const attempt = { attempt: n, departedAt: new Date().toISOString(), httpStatus: null, outcome: 'PENDING', usage: null };
      ctx.safeRejected = false;
      ctx.attempts.push(attempt);
      let res;
      try {
        res = await bounded(() => rawFetch(url, { ...init, signal: ac.signal }), null, init.signal, abort, 'RESPONSE_START_INTERRUPTED');
        attempt.httpStatus = res.status;
      } catch (_) { release(); attempt.outcome = UNKNOWN; attempt.phase = 'RESPONSE_START'; ctx.unknown = true; throw technicalError(UNKNOWN); }
      let bodyPromise;
      const text = () => bodyPromise || (bodyPromise = bounded(() => res.text(), policy.bodyReadTimeoutMs, init.signal, abort, 'BODY_READ_INTERRUPTED').then(raw => {
        try { const parsed = JSON.parse(raw); ctx.observed = parsed; attempt.usage = parsed.usage || null; } catch (_) { ctx.observed = null; }
        attempt.outcome = 'HTTP_RESPONSE';
        const p = ctx.observed;
        if ([400, 401, 403, 404].includes(res.status) && p && p.type === 'error' && ['invalid_request_error', 'authentication_error', 'permission_error', 'not_found_error'].includes(p.error?.type) && !p.usage && !p.content && !p.id) { ctx.safeRejected = true; attempt.outcome = 'EXPLICIT_REJECTION'; }
        release(); return raw;
      }, () => { attempt.outcome = UNKNOWN; attempt.phase = 'BODY_READ'; ctx.unknown = true; release(); throw technicalError(UNKNOWN); }));
      // Only a complete typed rate-limit refusal authorizes another paid departure.
      if (res.status === 429) {
        const raw = await text(); let parsed; try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
        if (safeRateLimit(res, parsed)) {
          attempt.outcome = 'SAFE_REJECTION'; ctx.safeRejected = true;
          if (n < policy.maxAttempts) {
            await bounded(() => new Promise(r => setTimeout(r, policy.backoffMs)), null, init.signal, () => {}, 'RETRY_WAIT_INTERRUPTED');
            continue;
          }
        }
      }
      return { status: res.status, headers: res.headers, text };
    }
  }
  const { createExternalExecutionGateway } = require(path.join(opts.bundleRoot, 'MONO-04/lib/external-execution-gateway.js'));
  const gateway = createExternalExecutionGateway({ providerRegistry: mono04.providerRegistry, secretProvider: mono04.secretProvider, fetchImpl: transport });
  const fingerprint = require(path.join(opts.bundleRoot, 'MONO-04/lib/request-fingerprint.js')).computeRequestFingerprint;
  const cache = new Map();
  function persist(rec) {
    if (!opts.recordsPath) return;
    fs.mkdirSync(path.dirname(opts.recordsPath), { recursive: true });
    fs.appendFileSync(opts.recordsPath, JSON.stringify(rec) + '\n');
  }
  async function execute(req) {
    const responseStartTimeoutMs = req.timeoutPolicy && Object.hasOwn(req.timeoutPolicy, 'timeoutMs') ? timeout(req.timeoutPolicy.timeoutMs) : policy.responseStartTimeoutMs;
    const ctx = { req, attempts: [], unknown: false, safeRejected: false, observed: null };
    const effective = { ...req, timeoutPolicy: { ...req.timeoutPolicy, timeoutMs: responseStartTimeoutMs }, retryPolicy: { maxAttempts: 1, backoffMs: 0 } };
    let result = await storage.run(ctx, () => gateway.executeRequest(effective));
    const failedAfterDeparture = result.status !== 'SUCCESS' && ctx.attempts.length > 0 && !ctx.safeRejected;
    if (failedAfterDeparture) {
      ctx.unknown = true;
      const details = { phase: ctx.attempts.at(-1).phase || 'HTTP_RESPONSE', httpStatus: result.technicalDiagnostics.httpStatus, networkDepartures: ctx.attempts.length, remoteCostUsd: null, remoteCostKnown: false, retryAuthorized: false };
      result = { ...result, technicalDiagnostics: { ...result.technicalDiagnostics, error: { code: UNKNOWN, message: UNKNOWN + ': aucune nouvelle tentative automatique autorisée.', details } } };
      // Existing ledger supports null usage/cost and blocks further LIMITED calls when unpriced.
      if (opts.cost && opts.cost.ledger) opts.cost.ledger.record({ kind: 'KIT_CALL', stage: opts.stage, purpose: 'EF-01 transport interrupted', model: ctx.observed?.model || req.payload.model, usage: ctx.observed?.usage || null, providerRequestId: ctx.observed?.id || null, localRequestId: req.requestId, httpStatus: details.httpStatus, interrupted: true, usageIncomplete: true, transportOutcome: UNKNOWN });
    }
    const rec = { schema: 'EvidenceForge.EF01TransportTrace', policy: policy.id, at: new Date().toISOString(), runId: req.runId, requestId: req.requestId, provider: req.provider, model: req.payload.model, stage: opts.stage, responseStartTimeoutMs, bodyReadTimeoutMs: policy.bodyReadTimeoutMs, networkDepartures: ctx.attempts.length, attempts: ctx.attempts, outcome: ctx.unknown ? UNKNOWN : result.status, remoteCostKnown: ctx.unknown ? false : null, remoteCostUsd: null };
    persist(rec);
    return { ...result, attemptCount: ctx.attempts.length || result.attemptCount, ef01Transport: rec };
  }
  return { ...mono04, ef01PolicyApplied: POLICY_ID, gateway: { ...gateway, getCircuitState(provider) {
    return provider === 'llm-worker' ? gateway.getCircuitState(provider) : mono04.gateway.getCircuitState(provider);
  }, executeRequest(req) {
    if (!req || !scoped(req, opts.stage)) return mono04.gateway.executeRequest(req);
    if (!req.requestId) return gateway.executeRequest(req);
    const hash = fingerprint(req), prior = cache.get(req.requestId);
    if (prior) { if (prior.hash !== hash) throw technicalError('EXTERNAL_REQUEST_CONFLICT'); return prior.promise; }
    const promise = execute(req); cache.set(req.requestId, { hash, promise }); return promise;
  } } };
}
module.exports = { composeEf01TransportPolicy, validatePolicy, POLICY_ID, UNKNOWN };
