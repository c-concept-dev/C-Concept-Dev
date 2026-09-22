"use strict";
/**
 * MONO-11 v0.1 — core/corpus-sufficiency-probe.js   (audit §9 G-2, G-4)
 *
 * SONDE REELLE DE SUFFISANCE DOCUMENTAIRE. Elle ne juge ni l'expertise ni la
 * pertinence : elle constate si un corpus ATTRIBUE au candidat existe en
 * quantite et profondeur suffisantes pour qu'un jumeau documentaire (EF-02E)
 * puisse distinguer DOCUMENTE / INFERE / NON DETERMINABLE.
 *
 * Elle COMPOSE EF-02D1 (MONO-01, gele) pour le volume : les seuils viennent
 * d'une HeuristicPolicy contractuelle (contracts/mono11-contracts.json), jamais
 * d'une constante locale. Elle ajoute ce qu'EF-02D1 ne regarde pas :
 *   - l'ATTRIBUTION : chaque oeuvre est-elle reellement rattachee a CET
 *     identifiant auteur ? (preuve fournie par l'adaptateur fournisseur, hors
 *     noyau : le noyau ne devine jamais une attribution) ;
 *   - les CONTRADICTIONS d'identite (plusieurs ORCID distincts sur le corpus) ;
 *   - la DISPONIBILITE du contenu necessaire (titre, annee, theme) ;
 *   - la DIVERSITE utile observee (annees, themes) — consignee, jamais exigee.
 *
 * Un element non evaluable rend UNKNOWN, jamais SATISFIED.
 */
const path = require("path");
const CONTRACTS = require(path.join(__dirname, "..", "contracts", "mono11-contracts.json"));

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);

/** Politique de suffisance : contractuelle, surchargeable par l'exploitant (resserrer ou elargir est CONSIGNE). */
function resolveSufficiencyPolicy(frozen, override) {
  const base = CONTRACTS.corpusSufficiencyPolicy;
  const values = Object.assign({}, base.values, (override && override.values) || {});
  const policy = frozen.M01.POL.buildHeuristicPolicy({
    policyId: (override && override.policyId) || base.policyId, status: base.status, values: values,
    justification: base.justification,
    knownKeySchemas: { minWorks: { type: "number", min: 1 }, minDoi: { type: "number", min: 0 }, minYears: { type: "number", min: 1 }, minTopics: { type: "number", min: 0 } },
  });
  return { policy: policy, overridden: !!(override && override.values), contractual: base.policyId };
}

/**
 * probeCorpusSufficiency({ frozen, corpus, candidateRef, attribution, policyOverride })
 *
 * corpus       : un ProfessionalCorpus (EF-02C-v2, sortie de MONO-09 buildProfessionalCorpus)
 * attribution  : { method, byWorkRef: { [workRef]: { attributed: bool, authorIds: [] } } } — preuve
 *                d'attribution produite par l'ADAPTATEUR fournisseur a partir des authorships reels.
 *                Absente => attribution UNKNOWN => insuffisant (fail-closed).
 */
function probeCorpusSufficiency(input) {
  input = input || {};
  const frozen = input.frozen;
  if (!frozen || !frozen.M01) throw Object.assign(new Error("FROZEN_REQUIRED: lots geles non charges."), { code: "FROZEN_REQUIRED" });
  const corpus = input.corpus;
  const candidateRef = input.candidateRef || (corpus && corpus.professionalRef) || null;
  const { policy, overridden, contractual } = resolveSufficiencyPolicy(frozen, input.policyOverride);
  const reasonCodes = [], limitations = [];
  let attr = null, attributedWorks = [], unattributed = [], attributionStatus = "UNKNOWN";
  let eligibility = null, identityContradictions = [], availability = null, diversity = null;

  if (!corpus || corpus.professionalRef !== candidateRef) {
    return finish({ status: "INSUFFICIENT", reasonCodes: ["CORPUS_PROBE_ERROR"], limitations: ["corpus absent ou rattache a un autre candidat"] });
  }
  if (corpus.status !== "complete") {
    reasonCodes.push("CORPUS_PROBE_ERROR");
    limitations.push("corpus non complet : " + (corpus.error || corpus.status));
  }
  const works = arr(corpus.corpus && corpus.corpus.works).filter((w) => isStr(w.workRef));

  /* ATTRIBUTION — jamais presumee. */
  attr = input.attribution || null;
  if (!attr || !attr.byWorkRef || typeof attr.byWorkRef !== "object") {
    attributionStatus = "UNKNOWN";
    limitations.push("aucune preuve d'attribution fournie par l'adaptateur : l'attribution du corpus ne peut pas etre constatee");
  } else {
    works.forEach(function (w) {
      const a = attr.byWorkRef[w.workRef];
      if (a && a.attributed === true) attributedWorks.push(w); else unattributed.push(w.workRef);
    });
    attributionStatus = attributedWorks.length === works.length ? "ATTRIBUTED" : (attributedWorks.length ? "PARTIAL" : "NONE");
    if (unattributed.length) limitations.push(unattributed.length + " oeuvre(s) sans attribution demontree a " + candidateRef + " : ecartee(s) du decompte");
  }
  if (attributionStatus === "UNKNOWN" || attributionStatus === "NONE") reasonCodes.push("CORPUS_NOT_ATTRIBUTABLE");

  /* CONTRADICTIONS d'identite : plusieurs ORCID distincts declares par l'adaptateur pour ce corpus. */
  const orcids = new Set();
  Object.keys((attr && attr.byWorkRef) || {}).forEach(function (k) { arr(attr.byWorkRef[k].orcids).forEach((o) => { if (isStr(o)) orcids.add(o); }); });
  const declaredOrcid = corpus.identityRef && corpus.identityRef.orcid;
  if (orcids.size > 1) identityContradictions.push("plusieurs ORCID distincts observes sur les oeuvres attribuees : " + Array.from(orcids).join(", "));
  if (isStr(declaredOrcid) && orcids.size === 1 && !orcids.has(declaredOrcid)) identityContradictions.push("ORCID declare (" + declaredOrcid + ") different de celui observe sur les oeuvres");

  /* VOLUME — EF-02D1 gele, sur les seules oeuvres attribuees. */
  const corpusAttributed = Object.assign({}, corpus, { corpus: { works: attributedWorks } });
  eligibility = frozen.M01.D1.evaluateEligibility(corpusAttributed, policy);
  if (eligibility.status !== "eligible_documentary") reasonCodes.push("CORPUS_INSUFFICIENT");

  /* DISPONIBILITE du contenu et DIVERSITE observee (consignees, jamais exigees). */
  const withTitle = attributedWorks.filter((w) => isStr(w.title)).length;
  const years = new Set(attributedWorks.map((w) => w.publicationYear).filter((y) => typeof y === "number"));
  const topics = new Set(attributedWorks.flatMap((w) => arr(w.topics).map((t) => t && t.name).filter(isStr)));
  availability = { works: attributedWorks.length, withTitle: withTitle, withDoi: attributedWorks.filter((w) => isStr(w.doi)).length,
    withYear: years.size ? attributedWorks.filter((w) => typeof w.publicationYear === "number").length : 0, withTopic: attributedWorks.filter((w) => arr(w.topics).length).length };
  if (attributedWorks.length && withTitle < attributedWorks.length) limitations.push((attributedWorks.length - withTitle) + " oeuvre(s) sans titre : inutilisable(s) pour citer");
  diversity = { distinctYears: years.size, distinctTopics: topics.size,
    yearSpan: years.size ? (Math.max.apply(null, Array.from(years)) - Math.min.apply(null, Array.from(years))) : null };

  const status = (reasonCodes.length === 0 && identityContradictions.length === 0) ? "SUFFICIENT"
    : (attributionStatus === "UNKNOWN" ? "UNKNOWN" : "INSUFFICIENT");
  if (identityContradictions.length) reasonCodes.push("IDENTITY_AMBIGUOUS");
  return finish({ status: status, reasonCodes: reasonCodes, limitations: limitations });

  function finish(o) {
    return {
      schema: "EvidenceForge.CorpusSufficiencyEvidence", schemaVersion: "MONO-11-v1",
      candidateRef: candidateRef,
      status: o.status,                              // SUFFICIENT | INSUFFICIENT | UNKNOWN
      reasonCodes: Array.from(new Set(o.reasonCodes)),
      policy: { policyId: policy.policyId, status: policy.status, values: policy.values, contractualPolicyId: contractual, overridden: overridden,
        classification: CONTRACTS.corpusSufficiencyPolicy.classification },
      attribution: { method: (attr && attr.method) || null, status: attributionStatus,
        attributedWorkRefs: attributedWorks.map((w) => w.workRef), unattributedWorkRefs: unattributed },
      eligibility: eligibility,   // sortie brute EF-02D1 (MONO-01)
      identityContradictions: identityContradictions,
      availability: availability,
      diversityObserved: diversity,
      limitations: o.limitations,
      notAJudgement: "constat documentaire de suffisance ; ni expertise, ni pertinence, ni verite",
    };
  }
}

module.exports = { probeCorpusSufficiency, resolveSufficiencyPolicy };
