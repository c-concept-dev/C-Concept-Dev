"use strict";
/**
 * EvidenceForge MONOLITH v1.0.6 — lib/document-chunker.js
 * AUTO-CHUNK UPLOAD : decoupage DETERMINISTE, SANS LLM, SANS PERTE, SANS DUPLICATION du texte d'un document uploade en segments
 * de MAX_CHUNK_CHARS caracteres au plus (marge sous la limite de 5000 du cadrage). Fonctions PURES, testables isolement ; aucun
 * acces fichier, reseau ou fournisseur. Les segments sont les PARTIES d'UN SEUL document source, jamais des documents independants.
 *
 * Unite de mesure (choix documente) : la LONGUEUR DE CHAINE JS (`String.prototype.length`, unites de code UTF-16), apres extraction
 * texte en UTF-8 — jamais la taille en octets du fichier. Un caractere hors plan de base (emoji) compte 2 ; une coupe brute ne
 * separe jamais une paire de substitution (la reconstitution reste byte-identique et chaque segment reste une chaine bien formee).
 *
 * Priorite de coupe, dans la fenetre [pos, pos + max] : double saut de ligne > saut de ligne simple > fin de phrase > espace > coupe
 * brute. Pour chaque niveau on prend la DERNIERE occurrence de la fenetre, acceptee seulement si elle laisse au segment au moins
 * `minChunkChars` caracteres (defaut : max / 2) — sinon on descend au niveau suivant. Le separateur reste dans le segment qui le
 * precede : concat(segments) === texte d'entree, toujours. Aucune normalisation (retours a la ligne, espaces, accents conserves).
 */
const crypto = require("crypto");
const MAX_CHUNK_CHARS = 4500;
const STATUS = Object.freeze({ COMPLETE: "COMPLETE", EMPTY: "DOCUMENT_EMPTY", INCOMPLETE: "DOCUMENT_INCOMPLETE", TRUNCATED: "INPUT_DOCUMENT_TRUNCATED", CHUNK_MISSING: "INPUT_DOCUMENT_CHUNK_MISSING" });
const STRATEGY = "PARAGRAPH>LINE>SENTENCE>SPACE>HARD";
const sha = (s) => crypto.createHash("sha256").update(Buffer.from(String(s), "utf8")).digest("hex");
const isHigh = (c) => c >= 0xd800 && c <= 0xdbff;

/** Dernier point de coupe (index de FIN de segment, exclusif) trouve dans text[pos, limit) selon la priorite ; null si aucun n'est acceptable. */
function findSplit(text, pos, limit, minEnd) {
  const window = text.slice(pos, limit);
  const candidates = [
    (w) => { const i = w.lastIndexOf("\n\n"); return i < 0 ? -1 : i + 2; },
    (w) => { const i = w.lastIndexOf("\n"); return i < 0 ? -1 : i + 1; },
    (w) => { let best = -1; const re = /[.!?…][)\]"'»”]*\s/g; let m; while ((m = re.exec(w)) !== null) best = m.index + m[0].length; return best; },
    (w) => { const i = w.lastIndexOf(" "); return i < 0 ? -1 : i + 1; },
  ];
  for (let k = 0; k < candidates.length; k++) { const rel = candidates[k](window); if (rel > 0 && pos + rel >= minEnd && pos + rel < limit + 1) return { end: pos + rel, level: ["paragraph", "line", "sentence", "space"][k] }; }
  return null;
}

/**
 * chunkDocumentText(text, options) -> { sourceCharacterLength, sourceTextSha256, totalChunks, maxChunkChars, strategy, chunks[] }
 * chunks[i] = { sequence (1..n), totalChunks, startChar, endChar (exclusif), text, chunkSha256, splitLevel }
 * options : { maxChunkChars = 4500, minChunkChars = floor(max/2) }. Texte vide (ou non-chaine) => totalChunks 0, status DOCUMENT_EMPTY.
 */
function chunkDocumentText(text, options) {
  options = options || {};
  const max = Number.isInteger(options.maxChunkChars) && options.maxChunkChars > 0 ? options.maxChunkChars : MAX_CHUNK_CHARS;
  const minEndRel = Number.isInteger(options.minChunkChars) ? Math.max(1, Math.min(options.minChunkChars, max)) : Math.max(1, Math.floor(max / 2));
  const t = typeof text === "string" ? text : "";
  const total = t.length; const out = [];
  if (total === 0) return { sourceCharacterLength: 0, sourceTextSha256: sha(""), totalChunks: 0, maxChunkChars: max, strategy: STRATEGY, status: STATUS.EMPTY, chunks: [] };
  let pos = 0;
  while (pos < total) {
    let end, level;
    if (total - pos <= max) { end = total; level = "end"; }
    else {
      const s = findSplit(t, pos, pos + max, pos + minEndRel);
      if (s) { end = s.end; level = s.level; }
      else { end = pos + max; level = "hard"; if (isHigh(t.charCodeAt(end - 1))) end -= 1; }   /* jamais une paire de substitution coupee */
    }
    if (end <= pos) end = Math.min(total, pos + max);   /* garde : progression garantie */
    const piece = t.slice(pos, end);
    out.push({ sequence: out.length + 1, totalChunks: 0, startChar: pos, endChar: end, text: piece, chunkSha256: sha(piece), splitLevel: level });
    pos = end;
  }
  out.forEach((c) => { c.totalChunks = out.length; });
  return { sourceCharacterLength: total, sourceTextSha256: sha(t), totalChunks: out.length, maxChunkChars: max, strategy: STRATEGY, status: STATUS.COMPLETE, chunks: out };
}

/** Reconstitution ordonnee (par `sequence`) ; ne verifie rien : voir verifyChunkedDocument. */
function reconstructText(chunks) { return (chunks || []).slice().sort((a, b) => a.sequence - b.sequence).map((c) => String(c.text == null ? "" : c.text)).join(""); }

/**
 * buildChunkedDocument({ documentId, name, sha256, bytes, content }, options) -> representation LOGIQUE d'UN document source :
 * { sourceDocumentId, originalFilename, sourceSha256, sourceByteLength, sourceCharacterLength, sourceTextSha256, totalChunks,
 *   maxChunkChars, strategy, ingestionStatus (COMPLETE | DOCUMENT_EMPTY), complete (bool), chunks[] avec chunkId = <sourceDocumentId>-part-<seq>-of-<n> }
 * Le texte des chunks est celui de `content` (representation normalisee deja officielle : octets UTF-8 decodes, rien d'autre).
 */
function buildChunkedDocument(doc, options) {
  const content = typeof doc.content === "string" ? doc.content : (Buffer.isBuffer(doc.bytesBuffer) ? doc.bytesBuffer.toString("utf8") : "");
  const empty = content.trim().length === 0;
  const r = empty ? chunkDocumentText("", options) : chunkDocumentText(content, options);
  const id = String(doc.documentId || ("doc-" + sha(content).slice(0, 12)));
  return { sourceDocumentId: id, originalFilename: String(doc.name || id), sourceSha256: doc.sha256 || null, sourceByteLength: Number.isInteger(doc.bytes) ? doc.bytes : Buffer.byteLength(content, "utf8"),
    sourceCharacterLength: content.length, sourceTextSha256: sha(content), totalChunks: r.totalChunks, maxChunkChars: r.maxChunkChars, strategy: r.strategy,
    ingestionStatus: empty ? STATUS.EMPTY : STATUS.COMPLETE, complete: !empty,
    chunks: r.chunks.map((c) => Object.assign({ chunkId: id + "-part-" + c.sequence + "-of-" + r.totalChunks, sourceDocumentId: id }, c)) };
}

/**
 * verifyChunkedDocument(doc, expectedText?) -> { ok, status, errors[] } — invariants A..N du lot :
 * sequence 1..n sans trou ni doublon, contiguite startChar/endChar, chaque chunk <= max, hash de chaque chunk, hash du texte source,
 * reconstitution === texte attendu (si fourni ; sinon === texte couvert par les bornes). Statuts : COMPLETE | DOCUMENT_EMPTY |
 * INPUT_DOCUMENT_CHUNK_MISSING (nombre annonce != nombre present) | DOCUMENT_INCOMPLETE (trou/doublon/bornes) | INPUT_DOCUMENT_TRUNCATED (texte d'un chunk altere / reconstitution differente).
 */
function verifyChunkedDocument(doc, expectedText) {
  const errors = []; const chunks = Array.isArray(doc && doc.chunks) ? doc.chunks : [];
  if (!doc || doc.ingestionStatus === STATUS.EMPTY || (chunks.length === 0 && (doc.totalChunks || 0) === 0)) return { ok: false, status: STATUS.EMPTY, errors: ["document vide : aucun contenu exploitable"] };
  const max = doc.maxChunkChars || MAX_CHUNK_CHARS; const n = doc.totalChunks;
  if (!Number.isInteger(n) || n < 1) return { ok: false, status: STATUS.CHUNK_MISSING, errors: ["totalChunks invalide : " + n] };
  if (chunks.length !== n) return { ok: false, status: STATUS.CHUNK_MISSING, errors: ["nombre de chunks annonce " + n + ", presents " + chunks.length] };
  const sorted = chunks.slice().sort((a, b) => a.sequence - b.sequence); const seen = new Set(); let status = null;
  sorted.forEach((c, i) => {
    if (seen.has(c.sequence)) { errors.push("doublon de sequence " + c.sequence); status = status || STATUS.INCOMPLETE; } seen.add(c.sequence);
    if (c.sequence !== i + 1) { errors.push("trou de sequence : attendu " + (i + 1) + ", recu " + c.sequence); status = status || STATUS.INCOMPLETE; }
    if (c.totalChunks !== n) { errors.push("chunk " + c.sequence + " : totalChunks " + c.totalChunks + " != " + n); status = status || STATUS.CHUNK_MISSING; }
    if (typeof c.text !== "string") { errors.push("chunk " + c.sequence + " : texte absent"); status = status || STATUS.TRUNCATED; return; }
    if (c.text.length > max) { errors.push("chunk " + c.sequence + " : " + c.text.length + " > " + max); status = status || STATUS.INCOMPLETE; }
    if (c.endChar - c.startChar !== c.text.length) { errors.push("chunk " + c.sequence + " : bornes " + c.startChar + "-" + c.endChar + " != longueur " + c.text.length); status = status || STATUS.TRUNCATED; }
    if (sha(c.text) !== c.chunkSha256) { errors.push("chunk " + c.sequence + " : hash different (texte altere ou tronque)"); status = status || STATUS.TRUNCATED; }
    const prevEnd = i === 0 ? 0 : sorted[i - 1].endChar; if (c.startChar !== prevEnd) { errors.push("chunk " + c.sequence + " : startChar " + c.startChar + " != fin du precedent " + prevEnd); status = status || STATUS.INCOMPLETE; }
  });
  const rebuilt = reconstructText(sorted);
  if (typeof expectedText === "string") { if (rebuilt !== expectedText) { errors.push("reconstitution differente du texte source (" + rebuilt.length + " vs " + expectedText.length + " caracteres)"); status = status || (rebuilt.length < expectedText.length ? STATUS.TRUNCATED : STATUS.INCOMPLETE); } }
  else if (Number.isInteger(doc.sourceCharacterLength) && rebuilt.length !== doc.sourceCharacterLength) { errors.push("reconstitution " + rebuilt.length + " caracteres, source declaree " + doc.sourceCharacterLength); status = status || STATUS.TRUNCATED; }
  if (doc.sourceTextSha256 && sha(rebuilt) !== doc.sourceTextSha256) { errors.push("hash du texte reconstitue different du hash source"); status = status || STATUS.TRUNCATED; }
  return { ok: errors.length === 0, status: errors.length ? status : STATUS.COMPLETE, errors };
}

/** Metadonnees persistables (SANS le texte : il se rederive du fichier source par chunkDocumentText, deterministe). */
function chunkMetadata(doc) {
  return { sourceDocumentId: doc.sourceDocumentId, originalFilename: doc.originalFilename, sourceSha256: doc.sourceSha256, sourceByteLength: doc.sourceByteLength, sourceCharacterLength: doc.sourceCharacterLength, sourceTextSha256: doc.sourceTextSha256,
    totalChunks: doc.totalChunks, maxChunkChars: doc.maxChunkChars, strategy: doc.strategy, ingestionStatus: doc.ingestionStatus, complete: doc.complete === true,
    chunks: (doc.chunks || []).map((c) => ({ chunkId: c.chunkId, sequence: c.sequence, totalChunks: c.totalChunks, startChar: c.startChar, endChar: c.endChar, chunkSha256: c.chunkSha256, splitLevel: c.splitLevel })) };
}

/** Etiquette "PART-03-OF-08" (numeros sur 2 chiffres au moins). */
function partLabel(seq, total) { const w = Math.max(2, String(total).length); const z = (x) => String(x).padStart(w, "0"); return "PART-" + z(seq) + "-OF-" + z(total); }

/**
 * renderForPrompt(docs) : presentation textuelle d'une liste de documents CHUNKES pour un prompt de cadrage. Chaque document est
 * annonce UNE fois (nom, caracteres, nombre de segments, COMPLET/INCOMPLET) puis ses segments PART-k-OF-n ; jamais tronque.
 * Retourne { text, documentCount, chunkCount } — documentCount = nombre de documents SOURCE (pas de segments).
 */
function renderForPrompt(docs) {
  const list = Array.isArray(docs) ? docs : []; let chunkCount = 0;
  const parts = list.map(function (d) {
    const v = verifyChunkedDocument(d, typeof d.content === "string" ? d.content : undefined);
    const state = d.ingestionStatus === STATUS.EMPTY ? "VIDE" : (v.ok ? "COMPLET (DOCUMENT_CHUNKED_COMPLETE)" : "INCOMPLET (" + v.status + ")");
    const head = "### DOCUMENT SOURCE : " + d.originalFilename + " — " + d.sourceCharacterLength + " caracteres — " + d.totalChunks + " segment(s) — " + state;
    if (d.ingestionStatus === STATUS.EMPTY) return head + "\n(aucun contenu exploitable)";
    const body = (d.chunks || []).slice().sort((a, b) => a.sequence - b.sequence).map((c) => { chunkCount++; return "[" + d.originalFilename + " — " + partLabel(c.sequence, d.totalChunks) + " — caracteres " + c.startChar + "-" + c.endChar + "]\n" + c.text; }).join("\n");
    return head + "\n" + body;
  });
  return { text: parts.length ? parts.join("\n\n") : "(aucun)", documentCount: list.length, chunkCount };
}

module.exports = { MAX_CHUNK_CHARS, STATUS, STRATEGY, chunkDocumentText, buildChunkedDocument, verifyChunkedDocument, reconstructText, chunkMetadata, partLabel, renderForPrompt };
