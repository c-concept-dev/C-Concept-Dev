"use strict";
/**
 * MONO-11 v0.2 — core/semantic-relevance-oracle.js   (audit §9 G-3)
 *
 * ORACLE SEMANTIQUE REEL. Ferme la lacune C-5 de l'audit : MONO-10 v0.19
 * (`relevance.js`) ne compare que des LIBELLES et conclut PLAUSIBLE sur un
 * recouvrement lexical du libelle de REQUETE — jamais une pertinence reelle.
 *
 * Ici la pertinence est evaluee candidat <-> mission sur le CORPUS ATTRIBUE
 * du candidat, dimension par dimension, par EF-02D2 (MONO-01, gele) :
 *   - le prompt est genere depuis le MissionDimensionSet de la mission (aucune
 *     dimension codee) ;
 *   - le modele ne peut citer que des titres/DOI EXACTS du corpus (anti-
 *     fabrication, verifiee par le parseur gele) ;
 *   - deux axes orthogonaux : relevanceStatus et epistemicStatus.
 *
 * Ce module AJOUTE ce qu'exige une PREUVE : la trace reelle de chaque appel
 * (hash du prompt, hash de la reponse, fournisseur, modele, requestId,
 * horodatages, transport), le hash des entrees, la classe de preuve derivee
 * par contrat, et le rattachement des references citees aux oeuvres ATTRIBUEES.
 *
 * Il n'appelle AUCUN reseau lui-meme : `llmCall` est fourni par l'exploitant.
 * Interdits : score par mots-cles, discipline de requete comme expertise,
 * ORCID ou citations comme pertinence.
 */
const path = require("path");
const crypto = require("crypto");
const CONTRACTS = require(path.join(__dirname, "..", "contracts", "mono11-contracts.json"));

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const CLASSES = CONTRACTS.relevanceEvidenceClasses.values;

/**
 * Derive la CLASSE de preuve depuis les jugements par dimension — regle
 * contractuelle (contracts/mono11-contracts.json > relevanceEvidenceClasses.derivation).
 * `attributedRefs` : ensemble des titres/DOI des oeuvres ATTRIBUEES au candidat.
 */
function deriveRelevanceClass(judgments, attributedRefs) {
  const js = arr(judgments);
  if (!js.length) return { relevanceClass: "UNKNOWN", supportingDimensions: [], reasonCodes: ["RELEVANCE_UNKNOWN"] };
  const supported = [], partial = [];
  let outOfScope = 0, notDeterminable = 0, unattributedSupport = 0;
  js.forEach(function (j) {
    const refs = arr(j.supportingWorkRefs).filter(isStr);
    const attributed = refs.filter((r) => attributedRefs.has(r));
    if (j.relevanceStatus === "mission_relevant" && j.epistemicStatus === "documented" && attributed.length) {
      supported.push({ dimensionId: j.dimensionId, supportingWorkRefs: attributed });
    } else if (j.relevanceStatus === "mission_relevant" || j.relevanceStatus === "partially_relevant") {
      if (j.relevanceStatus === "mission_relevant" && j.epistemicStatus === "documented" && refs.length && !attributed.length) unattributedSupport++;
      partial.push({ dimensionId: j.dimensionId, relevanceStatus: j.relevanceStatus, epistemicStatus: j.epistemicStatus });
    } else if (j.relevanceStatus === "mission_irrelevant") {
      outOfScope++;
    } else notDeterminable++;
  });
  const reasonCodes = [];
  let relevanceClass;
  if (supported.length) { relevanceClass = "SUPPORTED"; reasonCodes.push("RELEVANCE_SUPPORTED"); }
  else if (partial.length) { relevanceClass = "PARTIAL"; reasonCodes.push("RELEVANCE_PARTIAL_ONLY"); }
  else if (outOfScope === js.length) {
    /* OUT_OF_SCOPE exige un avis EXPLICITE (mission_irrelevant) sur CHAQUE dimension ;
       une seule dimension not_determinable suffit a rendre NOT_DETERMINABLE. */
    relevanceClass = "OUT_OF_SCOPE"; reasonCodes.push("RELEVANCE_OUT_OF_SCOPE");
  }
  else { relevanceClass = "NOT_DETERMINABLE"; reasonCodes.push("RELEVANCE_NOT_DETERMINABLE"); }
  if (unattributedSupport) reasonCodes.push("RELEVANCE_EVIDENCE_NOT_ATTRIBUTED");
  if (CLASSES.indexOf(relevanceClass) === -1) throw new Error("RELEVANCE_CLASS_INVALID: " + relevanceClass);
  return { relevanceClass: relevanceClass, supportingDimensions: supported, partialDimensions: partial,
    counts: { dimensions: js.length, supported: supported.length, partial: partial.length, outOfScope: outOfScope, notDeterminable: notDeterminable },
    reasonCodes: reasonCodes };
}

/** Enveloppe un appel LLM reel pour en conserver la PREUVE, jamais le secret. */
function recordedLlmCall(llmCall, calls, meta) {
  return async function (prompt) {
    const startedAt = new Date().toISOString();
    const r = await llmCall(prompt, meta);
    const text = typeof r === "string" ? r : (r && r.text);
    if (!isStr(text)) throw new Error("LLM_EMPTY_RESPONSE: le transport a rendu une reponse vide.");
    calls.push({
      startedAt: startedAt, completedAt: new Date().toISOString(),
      promptSha256: sha(prompt), promptChars: prompt.length, responseSha256: sha(text), responseChars: text.length,
      providerId: (r && r.providerId) || null, modelId: (r && r.modelId) || null,
      providerRequestId: (r && r.providerRequestId) || null, localRequestId: (r && r.localRequestId) || null, callId: (r && r.callId) || null, reused: !!(r && r.reused),
      transportKind: (r && r.transportKind) || null, httpStatus: (r && r.httpStatus) || null,
      usage: (r && r.usage) || null, purpose: meta && meta.purpose,
    });
    return text;
  };
}

/**
 * evaluateRelevanceEvidence({ frozen, corpus, attributedWorkRefs, missionQuestion, dimensionSet, llmCall, runId, missionHash })
 * -> RelevanceEvidence (MONO-11-v1)
 */
async function evaluateRelevanceEvidence(input) {
  input = input || {};
  const frozen = input.frozen;
  if (!frozen || !frozen.M01) throw Object.assign(new Error("FROZEN_REQUIRED"), { code: "FROZEN_REQUIRED" });
  if (typeof input.llmCall !== "function") throw Object.assign(new Error("LLM_CALL_REQUIRED: aucun transport LLM reel fourni par l'exploitant — fail closed."), { code: "LLM_CALL_REQUIRED" });
  const corpus = input.corpus;
  if (!corpus || !isStr(corpus.professionalRef)) throw Object.assign(new Error("CORPUS_REQUIRED"), { code: "CORPUS_REQUIRED" });
  const attributedWorkRefs = new Set(arr(input.attributedWorkRefs));
  /* Seules les oeuvres ATTRIBUEES sont soumises : l'oracle ne voit jamais une oeuvre non rattachee. */
  const works = arr(corpus.corpus && corpus.corpus.works).filter((w) => attributedWorkRefs.has(w.workRef));
  const corpusAttributed = Object.assign({}, corpus, { corpus: { works: works } });
  const attributedRefs = new Set(works.flatMap((w) => [w.title, w.doi]).filter(isStr));
  const inputsHash = sha(JSON.stringify({ professionalRef: corpus.professionalRef, works: works.map((w) => [w.workRef, w.title, w.doi, w.publicationYear]),
    missionQuestion: input.missionQuestion, dimensionSetHash: input.dimensionSet && input.dimensionSet.dimensionSetHash }));
  const calls = [];
  const meta = { purpose: "EF-02D2 relevance", candidateRef: corpus.professionalRef, runId: input.runId || null };
  let judgments = null, error = null, jsonRepairUsed = false;
  if (works.length === 0) {
    error = "aucune oeuvre attribuee : l'oracle n'est pas consulte (rien a evaluer, rien a inventer)";
  } else {
    try {
      const d2 = await frozen.M01.D2.evaluateMissionRelevance(corpusAttributed, input.missionQuestion, input.dimensionSet, recordedLlmCall(input.llmCall, calls, meta), input.opts);
      judgments = d2.judgments; jsonRepairUsed = d2.jsonRepairUsed === true;
    } catch (e) { error = String((e && e.message) || e); }
    /* v0.2 — statut de validation de chaque reponse, rendu au transport de l'exploitant (politique de reutilisation) :
       la derniere reponse est VALID si le parseur gele a accepte ; toute reponse anterieure d'une reparation etait INVALID. */
    if (typeof input.onValidation === "function") calls.forEach(function (c, i) {
      const last = i === calls.length - 1;
      try { input.onValidation({ callId: c.callId || null, responseSha256: c.responseSha256, valid: last && !error, errors: last && !error ? [] : ["EF-02D2 parse refused" + (error ? ": " + error.slice(0, 80) : "")], stage: "EF-02D2 (gele)" }); } catch (e) { /* observabilite */ }
    });
  }
  const derived = error ? { relevanceClass: "UNKNOWN", supportingDimensions: [], partialDimensions: [], counts: null, reasonCodes: ["RELEVANCE_UNKNOWN"] }
    : deriveRelevanceClass(judgments, attributedRefs);
  const supportingWorkRefs = Array.from(new Set(derived.supportingDimensions.flatMap((s) => s.supportingWorkRefs)));
  const supportingWorks = works.filter((w) => supportingWorkRefs.indexOf(w.title) !== -1 || supportingWorkRefs.indexOf(w.doi) !== -1)
    .map((w) => ({ workRef: w.workRef, title: w.title, doi: w.doi, publicationYear: w.publicationYear }));
  return {
    schema: "EvidenceForge.RelevanceEvidence", schemaVersion: "MONO-11-v1",
    candidateRef: corpus.professionalRef, runId: input.runId || null, missionHash: input.missionHash || null,
    dimensionSetRef: input.dimensionSet ? { missionId: input.dimensionSet.missionId, dimensionSetHash: input.dimensionSet.dimensionSetHash } : null,
    inputsSha256: inputsHash, worksAttributed: works.length,
    /* v0.2 (F3) : EF-02D2 gele ne soumet que les `maxWorks` premieres oeuvres (defaut 10) — dit honnetement */
    worksSubmittedToOracle: Math.min(works.length, (input.opts && Number.isInteger(input.opts.maxWorks) && input.opts.maxWorks > 0) ? input.opts.maxWorks : 10),
    relevanceClass: derived.relevanceClass, reasonCodes: derived.reasonCodes, counts: derived.counts,
    supportingDimensions: derived.supportingDimensions, partialDimensions: derived.partialDimensions || [],
    supportingWorks: supportingWorks,
    judgments: judgments,                 // sortie brute EF-02D2 (MONO-01), conservee telle quelle
    oracle: { component: "EF-02D2 (MONO-01, gele) compose par MONO-11", jsonRepairUsed: jsonRepairUsed, error: error,
      calls: calls, realCall: calls.length > 0, providerId: calls.length ? calls[0].providerId : null, modelId: calls.length ? calls[0].modelId : null },
    limitations: [
      "pertinence DOCUMENTAIRE (metadonnees des oeuvres attribuees) : ni expertise personnelle, ni opinion, ni verite",
      "la classe SUPPORTED exige une dimension mission_relevant + documented + une oeuvre attribuee citee exactement",
    ].concat(error ? ["oracle en erreur : " + error] : []),
    unknowns: error ? [{ reason: "pertinence non evaluee : " + error, blocking: false }] : [],
    notAJudgement: "preuve de pertinence documentaire ; la decision appartient au gate",
  };
}

module.exports = { evaluateRelevanceEvidence, deriveRelevanceClass, recordedLlmCall };
