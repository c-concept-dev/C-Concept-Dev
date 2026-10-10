"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/workref-normalization.js
 * NORMALISATION TYPOGRAPHIQUE DES REFERENCES D'OEUVRES (regle MONOLITH-WORKREF-NORMALIZATION-v1), meme classe que l'adaptateur de
 * cloture Markdown (FORMAT_NORMALIZATION_ONLY) : le validateur GELE EF-02D2 (MONO-01) exige qu'un `supportingWorkRef` soit la chaine
 * EXACTE d'un titre/DOI du corpus. Le fournisseur recopie les titres avec des apostrophes / guillemets typographiques (’ “ ”), des
 * espaces ou une casse differents : refus, prompt de « reparation syntaxique » (2e appel payant, inefficace), UNKNOWN. Mesure sur le
 * run reel efm-20260917-65c805ef : 31/31 references refusees sont identiques a un titre reel apres normalisation.
 * Regle : une reference est remplacee par le titre/DOI reel SI ET SEULEMENT SI sa forme normalisee (minuscules, accents retires,
 * tout caractere non alphanumerique -> espace) est identique a celle d'EXACTEMENT UNE reference du corpus. Sinon la reference est
 * laissee telle quelle (le validateur gele tranche). Aucune reference n'est ajoutee ni retiree ; aucun statut, aucune rationale ne
 * change ; chaque remplacement est journalise (original, canonique, hashes). Place AU-DESSUS du lot gele, jamais dedans.
 */
const crypto = require("crypto");
const RULE_ID = "MONOLITH-WORKREF-NORMALIZATION-v1";
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const canon = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Index canonique -> [references reelles] a partir d'un corpus { corpus: { works: [{ title, doi }] } } ou d'une liste de chaines. */
function buildIndex(corpus) {
  const refs = Array.isArray(corpus) ? corpus : ((corpus && corpus.corpus && corpus.corpus.works) || []).flatMap((w) => [w && w.title, w && w.doi]);
  const idx = new Map(); refs.filter((r) => typeof r === "string" && r.trim()).forEach((r) => { const k = canon(r); if (!idx.has(k)) idx.set(k, new Set()); idx.get(k).add(r); });
  return { idx, known: new Set(refs.filter((r) => typeof r === "string" && r.trim())) };
}

/**
 * normalizeWorkRefs(text, corpus) -> { text, normalized, replacements[], reason? }
 * Ne touche au texte que si c'est un JSON EF-02D2 lisible ; re-serialise le meme objet (memes cles, meme ordre) avec les references canoniques.
 */
function normalizeWorkRefs(text, corpus) {
  if (typeof text !== "string") return { text, normalized: false, replacements: [] };
  const s = text.trim(); const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(s); const inner = fence ? fence[1] : s;
  const a = inner.indexOf("{"), b = inner.lastIndexOf("}"); if (a < 0 || b <= a) return { text, normalized: false, replacements: [], reason: "JSON introuvable" };
  let d; try { d = JSON.parse(inner.slice(a, b + 1)); } catch (e) { return { text, normalized: false, replacements: [], reason: "JSON invalide" }; }
  if (!d || !Array.isArray(d.judgments)) return { text, normalized: false, replacements: [], reason: "pas un EF-02D2" };
  const { idx, known } = buildIndex(corpus); const replacements = [];
  d.judgments.forEach(function (j, ji) {
    if (!j || !Array.isArray(j.supportingWorkRefs)) return;
    j.supportingWorkRefs = j.supportingWorkRefs.map(function (r) {
      if (typeof r !== "string" || known.has(r)) return r; const cands = idx.get(canon(r));
      if (cands && cands.size === 1) { const real = Array.from(cands)[0]; replacements.push({ judgment: ji, dimensionId: j.dimensionId || null, original: r, canonical: real, originalSha256: sha(r), canonicalSha256: sha(real) }); return real; }
      return r;   /* ambigu ou absent : inchange, le validateur gele refusera */
    });
  });
  if (!replacements.length) return { text, normalized: false, replacements: [] };
  const out = JSON.stringify(d); return { text: out, normalized: true, replacements, rule: RULE_ID, originalSha256: sha(text), normalizedSha256: sha(out) };
}

/** Corpus tel que le validateur gele le connait : extrait du PROMPT EF-02D2 lui-meme (format gele) ; null si le prompt n'est pas un EF-02D2. */
function corpusFromPrompt(prompt) {
  const m = /\(métadonnées réelles uniquement\)\n(\{[\s\S]*?\})\n\nRÈGLES/.exec(String(prompt || "")); if (!m) return null;
  try { const c = JSON.parse(m[1]); return Array.isArray(c.works) ? { corpus: { works: c.works.map((w) => ({ title: w && w.title, doi: w && w.doi })) } } : null; } catch (e) { return null; }
}
/**
 * createWorkRefAdapter({ journalPath?, onRecord? }) -> adapt(response, prompt, meta) : applique la normalisation a `response.text` (objet rendu
 * par llmCall, jamais mute : copie) quand le prompt est un EF-02D2 ; journalise chaque normalisation (jamais le secret, jamais la rationale).
 */
function createWorkRefAdapter(opts) {
  opts = opts || {}; const fs = require("fs"), path = require("path"); let count = 0;
  function adapt(response, prompt, meta) {
    if (!response || typeof response.text !== "string") return response; const corpus = corpusFromPrompt(prompt); if (!corpus) return response;
    const n = normalizeWorkRefs(response.text, corpus); if (!n.normalized) return response; count++;
    const rec = { at: new Date().toISOString(), rule: RULE_ID, candidateRef: (meta && meta.candidateRef) || null, purpose: (meta && meta.purpose) || null, callId: response.callId || null, reused: response.reused === true, originalSha256: n.originalSha256, normalizedSha256: n.normalizedSha256, replacements: n.replacements.map((r) => ({ dimensionId: r.dimensionId, original: r.original, canonical: r.canonical })) };
    if (opts.journalPath) { fs.mkdirSync(path.dirname(opts.journalPath), { recursive: true }); fs.appendFileSync(opts.journalPath, JSON.stringify(rec) + "\n"); }
    if (typeof opts.onRecord === "function") { try { opts.onRecord(rec); } catch (e) { /* observabilite */ } }
    return Object.assign({}, response, { text: n.text, workRefNormalization: { rule: RULE_ID, replacements: n.replacements.length, originalSha256: n.originalSha256 } });
  }
  return { adapt, count: () => count, rule: RULE_ID };
}
module.exports = { normalizeWorkRefs, buildIndex, canon, corpusFromPrompt, createWorkRefAdapter, RULE_ID };
