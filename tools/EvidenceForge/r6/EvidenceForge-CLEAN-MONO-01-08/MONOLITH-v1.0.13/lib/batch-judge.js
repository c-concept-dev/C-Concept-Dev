"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/batch-judge.js
 * BOUCLE DE JUGEMENT PAR LOTS avec REPRISE PARTIELLE des items refuses (strategie RETRY_ONLY_INVALID_ITEMS) — partagee par le screening et la revue de
 * portefeuille. Passe 1 : lot entier. Passes suivantes : SEULS les items refuses par le validateur local repartent (avec leurs donnees,
 * les erreurs exactes et leurs entrees precedentes) ; les items valides de la passe precedente sont IMMUABLES (hash conserve) ; le lot est
 * recompose dans l'ordre d'origine. Les erreurs de niveau lot (JSON invalide, tableau absent, cle racine ou identifiant inconnu) font
 * repartir le lot entier (strategie RETRY_FULL_BATCH, comportement anterieur). Lignee par item : passe d'acceptation, hash de decision,
 * historique { pass, previousDecisionHash, validationErrors }. Aucun jugement n'est reforme sur un item valide.
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const STRATEGIES = Object.freeze({ TARGETED: "RETRY_ONLY_INVALID_ITEMS", FULL: "RETRY_FULL_BATCH" });

/**
 * judgeBatches({ llm, items, batchSize, maxPasses, strategy, key, buildPrompt(batch), buildRetryPrompt(batch, invalid, errorsById, previousById, pass),
 *                buildFullRetryPrompt(batch, errors, previousText, pass), validate(text, batch) -> { batchErrors, perItem: {id: [errors]}, entries: {id: entry}, normalizations },
 *                purposes: { first, retryTargeted, retryFull }, onValidation?(v) })
 * -> { accepted: {id: entry}, failed: [id], calls, batches, stats }
 */
async function judgeBatches(input) {
  const key = input.key || "sourceId"; const items = input.items || []; const batchSize = input.batchSize || 8, maxPasses = input.maxPasses || 3; const strategy = input.strategy === STRATEGIES.FULL ? STRATEGIES.FULL : STRATEGIES.TARGETED;
  const accepted = {}, failed = [], calls = [], batches = []; const stats = { batches: 0, passes: 0, firstPassCalls: 0, targetedRetries: 0, fullRetries: 0, itemsRetried: 0, itemsAcceptedFirstPass: 0, itemsAcceptedOnRetry: 0, itemsFailed: 0, normalizations: 0 };
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize); const batchId = "batch-" + String(batches.length + 1).padStart(2, "0"); stats.batches++;
    const lineage = {}; batch.forEach((s) => { lineage[s[key]] = { [key]: s[key], originalBatchId: batchId, acceptedAtPass: null, decisionHash: null, history: [] }; });
    const rec = { batchId, sourceIds: batch.map((s) => s[key]), passes: [], items: null };
    let pending = batch.slice(), previousById = {}, previousText = null, lastBatchErrors = null;
    for (let p = 1; p <= maxPasses && pending.length; p++) {
      stats.passes++; let prompt, purpose, targeted = false;
      if (p === 1) { prompt = input.buildPrompt(batch); purpose = input.purposes.first; stats.firstPassCalls++; }
      else if (lastBatchErrors && lastBatchErrors.length) { prompt = input.buildFullRetryPrompt(pending, lastBatchErrors, previousText, p); purpose = input.purposes.retryFull; targeted = pending.length < batch.length; stats.fullRetries++; }   /* reponse inexploitable : le meme ensemble repart entier */
      else if (strategy === STRATEGIES.TARGETED) { const errorsById = {}; pending.forEach((s) => { errorsById[s[key]] = (lineage[s[key]].history[lineage[s[key]].history.length - 1] || {}).validationErrors || []; }); prompt = input.buildRetryPrompt(pending, errorsById, previousById, p); purpose = input.purposes.retryTargeted; targeted = true; stats.targetedRetries++; stats.itemsRetried += pending.length; }
      else { const errs = []; pending.forEach((s) => ((lineage[s[key]].history[lineage[s[key]].history.length - 1] || {}).validationErrors || []).forEach((e) => errs.push(s[key] + " : " + e))); prompt = input.buildFullRetryPrompt(batch, errs, previousText, p); purpose = input.purposes.retryFull; pending = batch.slice(); stats.fullRetries++; }   /* strategie RETRY_FULL_BATCH (anterieure) */
      const r = await input.llm.llmCall(prompt, { purpose, pass: p }); const submitted = targeted ? pending : batch; const v = input.validate(r.text, submitted, { ignoreIds: batch.filter((s) => submitted.indexOf(s) === -1).map((s) => s[key]) });   /* entrees renvoyees pour des items deja acceptes : ignorees (immuables), jamais une erreur de lot */
      previousText = r.text; lastBatchErrors = v.batchErrors && v.batchErrors.length ? v.batchErrors : null; stats.normalizations += (v.normalizations || []).length;
      const allErrors = (v.batchErrors || []).concat(Object.keys(v.perItem || {}).flatMap((id) => (v.perItem[id] || []).map((e) => id + " : " + e)));
      calls.push({ pass: p, purpose, targeted, callId: r.callId, providerRequestId: r.providerRequestId, reused: r.reused === true, valid: allErrors.length === 0, itemsSubmitted: submitted.map((s) => s[key]), errorCodes: allErrors.slice(0, 5) });
      if (typeof input.onValidation === "function") input.onValidation({ callId: r.callId, valid: allErrors.length === 0, errors: allErrors.slice(0, 5), stage: input.validationStage || "batch-judge-local" });
      rec.passes.push({ pass: p, purpose, targeted, callId: r.callId || null, itemsSubmitted: submitted.length, itemsAccepted: 0, batchErrors: v.batchErrors || [], itemErrors: Object.keys(v.perItem || {}).length, normalizations: (v.normalizations || []).length, ignoredEntries: (v.ignored || []).length });
      if (lastBatchErrors) { submitted.forEach((s) => lineage[s[key]].history.push({ pass: p, previousDecisionHash: lineage[s[key]].decisionHash, validationErrors: lastBatchErrors.slice(0, 5) })); continue; }
      const stillPending = [];
      submitted.forEach((s) => { const id = s[key]; if (lineage[id].acceptedAtPass !== null) return;   /* jamais reforme : un item accepte est immuable */ const errs = (v.perItem && v.perItem[id]) || []; const entry = v.entries && v.entries[id];
        if (errs.length || !entry) { lineage[id].history.push({ pass: p, previousDecisionHash: lineage[id].decisionHash, validationErrors: errs.length ? errs.slice(0, 5) : ["entree absente"] }); if (entry) previousById[id] = entry; stillPending.push(s); return; }
        const h = sha(JSON.stringify(entry));
        accepted[id] = entry; lineage[id].acceptedAtPass = p; lineage[id].decisionHash = h; lineage[id].history.push({ pass: p, previousDecisionHash: null, validationErrors: [], decisionHash: h }); rec.passes[rec.passes.length - 1].itemsAccepted++; if (p === 1) stats.itemsAcceptedFirstPass++; else stats.itemsAcceptedOnRetry++; });
      pending = stillPending;
    }
    pending.forEach((s) => { failed.push(s[key]); stats.itemsFailed++; });
    rec.items = batch.map((s) => lineage[s[key]]); batches.push(rec);
  }
  return { accepted, failed, calls, batches, stats: Object.assign({ strategy }, stats) };
}

module.exports = { judgeBatches, STRATEGIES, sha };
