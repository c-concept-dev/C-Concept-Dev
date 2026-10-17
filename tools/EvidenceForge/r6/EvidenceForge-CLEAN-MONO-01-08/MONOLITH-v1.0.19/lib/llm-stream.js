"use strict";
/**
 * EvidenceForge MONOLITH v1.0.8 — lib/llm-stream.js
 * STREAMING DE TRANSPORT (Anthropic Messages `stream: true`, evenements SSE) : parseur SSE incremental, assembleur deterministe,
 * representation CANONIQUE finale equivalente au corps non streaming (id, type, role, model, content[{type:"text",text}], stop_reason,
 * stop_sequence, usage). Fonctions PURES, sans reseau : le lecteur de flux (readSseResponse) recoit un corps ReadableStream et applique
 * un delai d'INACTIVITE (aucun octet recu) et un delai TOTAL bornes. Un flux interrompu ne produit JAMAIS une reponse : il leve
 * PROVIDER_STREAM_INTERRUPTED avec les statistiques (octets, evenements, duree, providerRequestId si connu) — fail-closed.
 * Le streaming est un mecanisme de TRANSPORT : il ne touche ni au prompt, ni a la validation, ni au reuse (qui recoivent le corps canonique).
 */
const crypto = require("crypto");
const CODE_INTERRUPTED = "PROVIDER_STREAM_INTERRUPTED";
const CANONICAL_KEYS = ["id", "type", "role", "model", "content", "stop_reason", "stop_sequence", "usage"];

/** Parseur SSE incremental : feed(text) -> [{ event, data }] ; les lignes `data:` multiples sont concatenees par "\n" ; `:` = commentaire (ping). */
function createSseParser() {
  let buf = ""; let curEvent = null; let curData = [];
  function flush(out) { if (curEvent !== null || curData.length) { out.push({ event: curEvent, data: curData.join("\n") }); } curEvent = null; curData = []; }
  function feed(text) {
    buf += String(text || ""); const out = []; let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx); buf = buf.slice(idx + 1); if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line === "") { flush(out); continue; }
      if (line.startsWith(":")) continue;
      const c = line.indexOf(":"); const field = c === -1 ? line : line.slice(0, c); let value = c === -1 ? "" : line.slice(c + 1); if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") curEvent = value; else if (field === "data") curData.push(value);   /* id / retry : ignores */
    }
    return out;
  }
  function end() { const out = []; if (buf.length) { const rest = buf; buf = ""; out.push.apply(out, feed(rest + "\n\n")); } else flush(out); return out; }
  return { feed, end };
}

/** Assembleur deterministe des evenements Anthropic (message_start, content_block_start/delta/stop, message_delta, message_stop, ping, error). */
function createMessageAssembler() {
  const st = { started: false, completed: false, id: null, model: null, role: "assistant", type: "message", stopReason: null, stopSequence: null, usage: null, usageFinal: false, blocks: [], events: 0, textChars: 0, error: null, unknownEvents: 0 };
  function apply(ev) {
    st.events++; let d = null; try { d = ev.data ? JSON.parse(ev.data) : null; } catch (e) { throw Object.assign(new Error("PROVIDER_BAD_RESPONSE: evenement SSE non JSON (" + (ev.event || "?") + ")"), { code: "PROVIDER_BAD_RESPONSE" }); }
    const type = (d && d.type) || ev.event;
    switch (type) {
      case "message_start": { const m = (d && d.message) || {}; st.started = true; st.id = m.id || st.id; st.model = m.model || st.model; st.role = m.role || st.role; st.type = m.type || st.type; st.usage = Object.assign({}, st.usage || {}, m.usage || {}); return; }
      case "content_block_start": { const i = Number(d.index); const cb = d.content_block || {}; st.blocks[i] = { type: cb.type || "text", text: typeof cb.text === "string" ? cb.text : "" }; if (cb.type && cb.type !== "text") st.blocks[i].raw = cb; return; }
      case "content_block_delta": { const i = Number(d.index); if (!st.blocks[i]) st.blocks[i] = { type: "text", text: "" }; const delta = d.delta || {}; if (delta.type === "text_delta" && typeof delta.text === "string") { st.blocks[i].text += delta.text; st.textChars += delta.text.length; } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") { st.blocks[i].partialJson = (st.blocks[i].partialJson || "") + delta.partial_json; } return; }
      case "content_block_stop": return;
      case "message_delta": { const dl = d.delta || {}; if (dl.stop_reason !== undefined) st.stopReason = dl.stop_reason; if (dl.stop_sequence !== undefined) st.stopSequence = dl.stop_sequence; if (d.usage) { st.usage = Object.assign({}, st.usage || {}, d.usage); st.usageFinal = true; } return; }
      case "message_stop": st.completed = true; return;
      case "ping": return;
      case "error": { const e = (d && d.error) || {}; st.error = { type: e.type || "error", message: String(e.message || "").slice(0, 300) }; return; }
      default: st.unknownEvents++; return;
    }
  }
  /** Corps CANONIQUE (equivalent non streaming) : cles dans un ordre fixe, content = blocs texte dans l'ordre des index. */
  function canonical() {
    const content = st.blocks.filter(Boolean).map((b) => (b.type === "text" ? { type: "text", text: b.text } : Object.assign({}, b.raw || { type: b.type }, b.partialJson ? { partial_json: b.partialJson } : {})));
    const usage = st.usage ? Object.assign({ input_tokens: Number(st.usage.input_tokens || 0), output_tokens: Number(st.usage.output_tokens || 0) }, st.usage.cache_creation_input_tokens != null ? { cache_creation_input_tokens: st.usage.cache_creation_input_tokens } : {}, st.usage.cache_read_input_tokens != null ? { cache_read_input_tokens: st.usage.cache_read_input_tokens } : {}) : null;
    const obj = { id: st.id, type: st.type, role: st.role, model: st.model, content, stop_reason: st.stopReason, stop_sequence: st.stopSequence, usage };
    const ordered = {}; CANONICAL_KEYS.forEach((k) => { ordered[k] = obj[k]; }); return ordered;
  }
  return { apply, canonical, state: () => Object.assign({}, st, { blocks: undefined, text: st.blocks.filter(Boolean).map((b) => b.text || "").join("") }) };
}

/** Reconstruction depuis un texte SSE complet (ex. un Worker non streaming qui a bufferise le flux) ; rend { canonical, raw, state }. */
function assembleFromSseText(text) {
  const p = createSseParser(), a = createMessageAssembler(); p.feed(text).forEach(a.apply); p.end().forEach(a.apply);
  const st = a.state(); return { canonical: a.canonical(), raw: JSON.stringify(a.canonical()), state: st, complete: st.completed && st.started && !st.error };
}

function interruptedError(stats, cause) {
  const e = new Error(CODE_INTERRUPTED + ": flux interrompu apres " + stats.elapsedMs + " ms (" + stats.events + " evenement(s), " + stats.bytes + " octet(s)) — " + cause);
  e.code = CODE_INTERRUPTED; e.fatal = true; e.stream = stats; e.normalizedCause = cause;
  e.userMessage = "La réponse du fournisseur d'analyse a été interrompue en cours de transmission. Rien de partiel n'est conservé comme résultat ; le run est arrêté proprement et pourra reprendre (les réponses déjà validées sont réutilisées).";
  return e;
}

/**
 * readSseResponse(res, { inactivityMs, maxTotalMs, onProgress?, stopCheck?, localRequestId }) -> { canonical, raw, state, stats }
 * Lit res.body (ReadableStream WHATWG) evenement par evenement. Delai d'inactivite (aucun octet) et delai total bornes ; arret utilisateur
 * verifie a chaque octet recu (stopCheck() truthy => interruption STOPPED_BY_USER). Un flux qui se termine sans message_stop est INTERROMPU.
 */
async function readSseResponse(res, opts) {
  opts = opts || {}; const inactivityMs = Number(opts.inactivityMs || 90000), maxTotalMs = Number(opts.maxTotalMs || 900000);
  const startedAt = Date.now(); let lastActivity = startedAt; let bytes = 0; const parser = createSseParser(), asm = createMessageAssembler();
  const stats = () => { const s = asm.state(); return { events: s.events, bytes, elapsedMs: Date.now() - startedAt, lastActivityAt: new Date(lastActivity).toISOString(), started: s.started, completed: s.completed, providerRequestId: s.id || null, model: s.model || null, textChars: s.textChars, usage: s.usage || null, usageFinal: s.usageFinal === true, localRequestId: opts.localRequestId || null }; };
  const progress = (kind) => { if (typeof opts.onProgress === "function") { try { opts.onProgress(Object.assign({ kind }, stats())); } catch (e) { /* observabilite */ } } };
  if (!res || !res.body || typeof res.body.getReader !== "function") throw interruptedError(stats(), "corps de reponse non lisible en flux");
  const reader = res.body.getReader(); const decoder = new TextDecoder("utf-8"); let watchdog = null; let timedOutCause = null;
  const arm = () => { if (watchdog) clearTimeout(watchdog); const remainingTotal = maxTotalMs - (Date.now() - startedAt); const wait = Math.max(1, Math.min(inactivityMs, remainingTotal)); watchdog = setTimeout(() => { timedOutCause = remainingTotal <= inactivityMs ? "STREAM_MAX_DURATION" : "STREAM_INACTIVITY"; try { reader.cancel(timedOutCause).catch(() => {}); } catch (e) { /* */ } }, wait); };
  progress("STREAM_STARTED"); arm();
  try {
    for (;;) {
      let chunk; try { chunk = await reader.read(); } catch (e) { throw interruptedError(stats(), timedOutCause || ("STREAM_READ_ERROR: " + String(e && e.message || e).slice(0, 120))); }
      if (timedOutCause) throw interruptedError(stats(), timedOutCause);
      if (chunk.done) break;
      bytes += chunk.value ? chunk.value.length : 0; lastActivity = Date.now(); arm();
      if (typeof opts.stopCheck === "function" && opts.stopCheck()) { try { reader.cancel("STOPPED_BY_USER").catch(() => {}); } catch (e) { /* */ } const e = interruptedError(stats(), "STOPPED_BY_USER"); e.code = "STOPPED_BY_USER"; e.userStop = true; e.userMessage = "Run arrêté à votre demande pendant une réponse en cours : rien de partiel n'est conservé comme résultat ; les réponses déjà validées sont réutilisées à la reprise."; throw e; }
      const evs = parser.feed(decoder.decode(chunk.value, { stream: true })); for (const ev of evs) { try { asm.apply(ev); } catch (pe) { const e = interruptedError(stats(), "PROVIDER_BAD_RESPONSE: " + String(pe.message).slice(0, 120)); e.code = "PROVIDER_BAD_RESPONSE"; try { reader.cancel("PROVIDER_BAD_RESPONSE").catch(() => {}); } catch (x) { /* */ } throw e; } if (asm.state().error) { const s = asm.state(); const e = interruptedError(stats(), "PROVIDER_STREAM_ERROR: " + s.error.type); e.code = /overloaded|rate/i.test(s.error.type) ? "PROVIDER_CAPACITY" : "PROVIDER_UNAVAILABLE"; e.providerError = s.error; throw e; } }
      progress("STREAM_PROGRESS");
    }
    parser.end().forEach(asm.apply);
  } finally { if (watchdog) clearTimeout(watchdog); }
  const st = asm.state();
  if (!st.started || !st.completed) throw interruptedError(stats(), st.started ? "STREAM_ENDED_BEFORE_MESSAGE_STOP" : "STREAM_ENDED_WITHOUT_MESSAGE_START");
  const canonical = asm.canonical(); const raw = JSON.stringify(canonical); progress("STREAM_COMPLETED");
  return { canonical, raw, state: st, stats: Object.assign(stats(), { rawSha256: crypto.createHash("sha256").update(raw, "utf8").digest("hex") }) };
}

module.exports = { CODE_INTERRUPTED, CANONICAL_KEYS, createSseParser, createMessageAssembler, assembleFromSseText, readSseResponse, interruptedError };
