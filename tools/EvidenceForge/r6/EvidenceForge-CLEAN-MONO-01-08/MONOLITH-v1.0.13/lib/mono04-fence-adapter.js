"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/mono04-fence-adapter.js
 * ADAPTATEUR ADDITIF de transport (contrat explicite, regle MONOLITH-FENCE-NORMALIZATION-v1) :
 * le fournisseur reel enveloppe parfois une reponse JSON strictement conforme dans une cloture Markdown ```json … ```,
 * que les parseurs GELES d'EF-01B/EF-01C1 refusent a juste titre (JSON strict). Cet adaptateur, place AU-DESSUS du gateway
 * MONO-04 (jamais dedans), retire la cloture SI ET SEULEMENT SI l'interieur est un JSON valide ; sinon le texte passe inchange.
 * Chaque normalisation est CONSIGNEE (hash original, hash normalise, regle) dans un journal du run ; le texte original est
 * conserve en cache. Aucune autre transformation. Meme classe que le target-normalizer de MONO-11 v0.2 (FORMAT_NORMALIZATION_ONLY).
 * v1.0.5 — opts.cost = { ledger, budget, stage, purpose } : le kit gele (EF-01B/EF-01C1) jette l'enveloppe fournisseur et ne lit que
 * content[0].text ; l'adaptateur, place AU-DESSUS du gateway, verifie le budget AVANT l'appel et capture usage/model APRES
 * (ligne KIT_CALL du ledger). Le kit et MONO-04 ne sont pas modifies ; sans opts.cost, comportement v1.0.4 a l'identique.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const RULE_ID = "MONOLITH-FENCE-NORMALIZATION-v1";
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const FENCE = /^\s*```(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```\s*$/;

function normalizeFence(text) {
  if (typeof text !== "string") return { text, normalized: false };
  const m = FENCE.exec(text); if (!m) return { text, normalized: false };
  try { JSON.parse(m[1]); } catch (e) { return { text, normalized: false, reason: "interieur non JSON : texte inchange" }; }
  return { text: m[1], normalized: true, originalSha256: sha(text), normalizedSha256: sha(m[1]), rule: RULE_ID };
}

/** wrapMono04(mono04, { recordsPath, rawDir, cost? }) -> mono04 de meme interface, gateway.executeRequest normalise et journalise. */
function wrapMono04(mono04, opts) {
  opts = opts || {}; const g = mono04.gateway;
  const gateway = Object.assign(Object.create(Object.getPrototypeOf(g) || null), g, {
    async executeRequest(req) {
      const cost = opts.cost || null; const model = req && req.payload && req.payload.model;
      if (cost && cost.budget) cost.budget.assertAllowed({ model: model || null, purpose: cost.purpose || (req && req.moduleId) || null, where: "kit" });   /* v1.0.5 : AVANT l'appel reel du kit */
      const result = await g.executeRequest.call(g, req);
      if (cost && cost.ledger && result && result.status === "SUCCESS" && result.result && typeof result.result === "object") {
        try { cost.ledger.record({ kind: "KIT_CALL", stage: cost.stage || null, purpose: cost.purpose || (req && req.moduleId) || null, model: result.result.model || model || null, usage: result.result.usage || null, providerRequestId: result.result.id || null, localRequestId: req && req.requestId, httpStatus: 200 }); }
        catch (x) { if (opts.recordsPath) { fs.mkdirSync(path.dirname(opts.recordsPath), { recursive: true }); fs.appendFileSync(opts.recordsPath, JSON.stringify({ at: new Date().toISOString(), kind: "COST_LEDGER_ERROR", message: String(x.message).slice(0, 300) }) + "\n"); } }
      }
      const c = result && result.result && result.result.content;
      if (result && result.status === "SUCCESS" && Array.isArray(c) && c[0] && typeof c[0].text === "string") {
        const n = normalizeFence(c[0].text);
        if (n.normalized) {
          if (opts.rawDir) { fs.mkdirSync(opts.rawDir, { recursive: true }); fs.writeFileSync(path.join(opts.rawDir, n.originalSha256 + ".original.txt"), c[0].text); }
          const rec = { at: new Date().toISOString(), rule: RULE_ID, requestId: req.requestId, runId: req.runId, moduleId: req.moduleId, originalSha256: n.originalSha256, normalizedSha256: n.normalizedSha256, originalLength: c[0].text.length, normalizedLength: n.text.length };
          if (opts.recordsPath) { fs.mkdirSync(path.dirname(opts.recordsPath), { recursive: true }); fs.appendFileSync(opts.recordsPath, JSON.stringify(rec) + "\n"); }
          const content = c.slice(); content[0] = Object.assign({}, c[0], { text: n.text });
          return Object.assign({}, result, { result: Object.assign({}, result.result, { content }) });
        }
      }
      return result;
    },
  });
  return Object.assign(Object.create(Object.getPrototypeOf(mono04) || null), mono04, { gateway, fenceAdapter: { rule: RULE_ID } });
}
module.exports = { wrapMono04, normalizeFence, RULE_ID };
