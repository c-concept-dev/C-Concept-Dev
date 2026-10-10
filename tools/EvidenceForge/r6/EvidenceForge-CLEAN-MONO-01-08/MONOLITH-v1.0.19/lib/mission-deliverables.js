"use strict";
/**
 * EvidenceForge MONOLITH v1.0.17 — lib/mission-deliverables.js
 * MISSION CONTRACT ENFORCEMENT (R-A) : ce que la mission DEMANDE (champ `livrableAttendu` de la reformulation confirmee)
 * est compare a ce que CETTE VERSION SAIT PRODUIRE, avant la Porte 1 puis au rapport.
 *
 * Module PUR (aucun appel LLM, aucun fichier, aucun reseau) et DETERMINISTE :
 *   assess(livrableAttendu)            -> evaluation des livrables demandes (porte CONFIRM_PLAN) ;
 *   evaluate({assessment, report, ...}) -> missionDeliverables (rapport) : REQUESTED -> PRODUCED | NOT_PRODUCED_BY_DESIGN | NOT_PRODUCED_ERROR.
 *
 * Regles :
 *  - un livrable n'est PRODUCED que si (a) sa capacite est DECLAREE prise en charge par cette version, (b) il est inconditionnel,
 *    (c) ses formes demandees sont prises en charge, et (d) la preuve de production est presente dans le rapport. Sinon il ne l'est pas.
 *  - un passage non reconnu par le registre n'est JAMAIS suppose produit : UNRECOGNIZED_DELIVERABLE (fail-closed).
 *  - une condition (« si ... ») n'est jamais evaluee par ce module : le livrable conditionnel n'est pas garanti.
 *  - AUCUN livrable n'est deduit de PROCESS_QUALIFICATION ni de SCIENTIFICALLY_USABLE : les preuves de production lisent uniquement
 *    des structures du rapport (enonces, revues, reserves, limites, integrite), jamais l'en-tete de qualification.
 *  - le registre est lexical et generique (aucun nom de cas, de mission, de grille ou de document) : il est versionne et hache.
 *  - B1 (audit independant v1.0.17) : ACKNOWLEDGE_UNSUPPORTED_DELIVERABLE n'est PAS WAIVE_DELIVERABLE. Une reconnaissance a la Porte 1
 *    INFORME seulement que l'utilisateur a vu et comprend l'incapacite de cette version ; elle ne modifie pas le contrat de mission :
 *    le livrable reste REQUESTED et ACCEPTE, et s'il n'est pas produit le run termine INCOMPLETE_DELIVERABLES (COMPLETED interdit).
 *    Cette version n'a AUCUN mecanisme de renonciation (waiver) : aucun livrable demande ne peut etre abandonne.
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const arr = (x) => (Array.isArray(x) ? x : []);

const REGISTRY_ID = "MISSION-DELIVERABLES-v1";
const STATUS = Object.freeze({ REQUESTED: "REQUESTED", PRODUCED: "PRODUCED", NOT_PRODUCED_BY_DESIGN: "NOT_PRODUCED_BY_DESIGN", NOT_PRODUCED_ERROR: "NOT_PRODUCED_ERROR" });
const GATE_CLASS = Object.freeze({ SUPPORTED: "SUPPORTED", NOT_SUPPORTED: "NOT_SUPPORTED" });
const RUN_STATUS_INCOMPLETE = "INCOMPLETE_DELIVERABLES";
/** Statuts terminaux qui portent un rapport (le rapport est produit dans les deux cas ; seul COMPLETED dit « tout ce qui a ete accepte est produit »). */
const TERMINAL_REPORT_STATUSES = Object.freeze(["COMPLETED", RUN_STATUS_INCOMPLETE]);

/* Normalisation de comparaison : minuscules, sans diacritiques, apostrophes et espaces unifies. Le texte source est conserve tel quel. */
function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’ʼ`´]/g, "'").replace(/[  ]/g, " ").toLowerCase().replace(/\s+/g, " ").trim();
}

/* Preuves de production : lisent le RAPPORT, jamais son en-tete de qualification (headline). */
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const P_ = {
  statements: (r) => { const s = r && r.statements; const ok = !!s && ["etabli", "convergent", "divergent", "provisoire", "nonEtabli"].every((k) => Array.isArray(s[k]));
    return { ok: ok && reviewsComplete(r) > 0, evidence: ok ? "statements : " + ["etabli", "convergent", "divergent", "provisoire", "nonEtabli"].map((k) => k + " " + s[k].length).join(", ") + " ; revues completes " + reviewsComplete(r) : "statements absents" }; },
  reviews: (r) => { const n = reviewsComplete(r); return { ok: n > 0, evidence: "pipeline.reviews.reviewsComplete = " + n }; },
  aggregation: (r) => { const s = r && r.statements; const ok = !!s && Array.isArray(s.convergent) && Array.isArray(s.divergent) && reviewsComplete(r) > 0; return { ok, evidence: ok ? "convergent " + s.convergent.length + ", divergent " + s.divergent.length : "agregation absente" }; },
  reservations: (r) => { const ok = !!r && Array.isArray(r.reservations) && Array.isArray(r.limits); return { ok, evidence: ok ? "reservations " + r.reservations.length + ", limits " + r.limits.length : "reserves absentes" }; },
  unknowns: (r) => { const ok = !!r && !!r.statements && Array.isArray(r.statements.nonEtabli) && !!r.qualification && Array.isArray(r.qualification.unknowns); return { ok, evidence: ok ? "nonEtabli " + r.statements.nonEtabli.length + ", unknowns " + r.qualification.unknowns.length : "inconnues absentes" }; },
  provenance: (r) => { const ok = !!r && !!r.integrity && !!r.integrity.seal && !!r.statements; return { ok, evidence: ok ? "integrity.seal + lignee « pourquoi » des enonces" : "integrite ou lignee absente" }; },
  professionals: (r) => { const p = r && r.pipeline; const ok = !!p && Array.isArray(p.disciplines) && Number(p.twins) > 0; return { ok, evidence: ok ? "disciplines " + p.disciplines.length + ", jumeaux " + p.twins : "panel absent" }; },
  nonParticipation: (r) => { const ok = !!r && arr(r.limits).some((l) => /aucun professionnel n'a été consulté/.test(String(l))); return { ok, evidence: ok ? "limits : « aucun professionnel n'a été consulté »" : "mention de non-participation absente" }; },
  processQualification: (r) => { const ok = !!r && !!r.qualification && Array.isArray(r.qualification.criteria); return { ok, evidence: ok ? "qualification.criteria " + r.qualification.criteria.length : "qualification absente" }; },
};
function reviewsComplete(r) { const v = r && r.pipeline && r.pipeline.reviews; return v && Number.isFinite(Number(v.reviewsComplete)) ? Number(v.reviewsComplete) : 0; }

/**
 * REGISTRE v1 — capacites (patrons sur texte normalise). `supported` = ce que CETTE version produit ; `reason` = pourquoi une capacite
 * ne l'est pas (fait d'architecture, cite dans la porte et le rapport). Aucune capacite n'est « supportee » par defaut.
 */
const CAPABILITIES = Object.freeze([
  { id: "DOCUMENTARY_REPORT", label: "Rapport d'analyse documentaire", supported: true, produced: P_.statements,
    patterns: [/\brapports? (de revue|d'analyse|documentaires?)\b/, /\b(analyses?|revues?) (professionnelles? )?documentaires?\b/, /\banalyses? documentaires? (critique|structuree)s?\b/, /\bdocumentary (analysis|review|report)\b/] },
  { id: "PROVENANCE_TRACEABILITY", label: "Provenance et tracabilite", supported: true, produced: P_.provenance,
    patterns: [/\btracabilite\b/, /\bprovenance\b/, /\blignee\b/, /\blineage\b/, /\btraceability\b/] },
  { id: "PROFESSIONALS_IDENTIFICATION", label: "Professionnels et disciplines mobilises", supported: true, produced: P_.professionals,
    patterns: [/\bjumeaux documentaires\b/, /\bprofessionnels? (retenus?|mobilises?|identifies?|documentaires?)\b/, /\bdisciplines? (mobilisees?|professionnelles?)\b/, /\bpanel\b/] },
  { id: "INDEPENDENT_REVIEWS", label: "Revues individuelles independantes", supported: true, produced: P_.reviews,
    patterns: [/\brevues? (individuelles?|independantes?)\b/, /\banalyses? individuelles?\b/, /\bindividual reviews?\b/] },
  { id: "AGGREGATION", label: "Agregation (convergences, divergences)", supported: true, produced: P_.aggregation,
    patterns: [/\bagregation\b/, /\bconvergences?\b/, /\bdivergences?\b/, /\baggregation\b/] },
  { id: "RESERVATIONS_LIMITS", label: "Reserves et limites", supported: true, produced: P_.reservations,
    patterns: [/\breserves\b/, /\blimites du (run|processus)\b/, /\breservations\b/] },
  { id: "UNKNOWNS", label: "Inconnues et elements non etablis", supported: true, produced: P_.unknowns,
    patterns: [/\binconnues?\b/, /\bnon etablis?\b/, /\bnon determinables?\b/, /\bpreuves? (encore )?manquantes?\b/, /\bunknowns?\b/] },
  { id: "NON_PARTICIPATION_DISCLOSURE", label: "Mention de non-participation des professionnels reels", supported: true, produced: P_.nonParticipation, negationExempt: true,
    patterns: [/\bn'ont pas participe\b/, /\bne participent pas\b/, /\bnon[- ]participation\b/] },
  { id: "PROCESS_QUALIFICATION", label: "Qualification du processus", supported: true, produced: P_.processQualification,
    patterns: [/\bqualification du processus\b/, /\bprocess qualification\b/] },
  /* --- non produites PAR CONCEPTION dans cette version --- */
  { id: "BUSINESS_VERDICT", label: "Verdict metier", supported: false,
    reason: "Aucune etape ne produit de verdict metier : le schema de revue gele (EF-03A) n'a pas de champ verdict, le prompt gele EF-03B interdit vote/consensus/classement, l'agregation gelee EF-03C n'agrege pas en verdict. PROCESS_QUALIFICATION et SCIENTIFICALLY_USABLE qualifient le processus, jamais l'objet examine.",
    patterns: [/\bverdicts?\b/, /\bgo ?\/ ?no[ _-]?go\b/, /\bno[_ -]go\b/, /\bdecisions? finales?\b/, /\bconclusions? (unique|finale)s?\b/, /\bconclure par\b/, /\btrancher\b/] },
  { id: "DECISION_MATRIX", label: "Matrice de decision", supported: false,
    reason: "Aucune matrice de decision n'est calculee : les constats sont indexes par dimension (discipline), sans axe requirement/item ni statut de decision.",
    patterns: [/\bmatrices? (de decision|decisionnelles?)\b/, /\bdecision matrix\b/, /\bdecisions? par (item|requirement|exigence|critere|question|rubrique)s?\b/] },
  { id: "PER_ITEM_RESPONSE", label: "Reponse structuree item par item", supported: false,
    reason: "Les revues gelees (EF-03A/EF-03B) produisent exactement un constat par dimension, jamais une reponse par section, question ou item d'un document.",
    patterns: [/\b(section|question|item|exigence|critere|requirement|rubrique)s? par (section|question|item|exigence|critere|requirement|rubrique)s?\b/, /\bitem[- ]by[- ]item\b/] },
  { id: "STRUCTURED_CONTRACT", label: "Contrat structure", supported: false,
    reason: "Aucune etape ne construit de contrat (exigences adoptees, differees, regles non decidees) : il n'existe ni structure ni production correspondante.",
    patterns: [/\bcontrats?\b/, /\bcontracts?\b/] },
  { id: "SCORING_RANKING", label: "Score, vote ou classement", supported: false,
    reason: "Interdit par conception (charte EF-03B/EF-03C : aucun vote, aucun score de verite, aucun classement).",
    patterns: [/\bscores?\b/, /\bclassements?\b/, /\bnotation\b/, /\bvotes?\b/, /\branking\b/, /\bponderation\b/] },
]);
/* Formes (attributs du livrable de la meme clause, jamais un livrable a elles seules) : JSON = export du rapport ; TABLE = non produite. */
const FORMS = Object.freeze([
  { id: "JSON", patterns: [/\bjson\b/], supportedFor: ["DOCUMENTARY_REPORT", "PROVENANCE_TRACEABILITY", "PROFESSIONALS_IDENTIFICATION", "INDEPENDENT_REVIEWS", "AGGREGATION", "RESERVATIONS_LIMITS", "UNKNOWNS", "NON_PARTICIPATION_DISCLOSURE", "PROCESS_QUALIFICATION"] },
  { id: "TABLE", patterns: [/\btableaux?\b/, /\btabulaires?\b/, /\bcsv\b/, /\btableur\b/, /\btables?\b/], supportedFor: [] },
]);
const CONDITION_START = /^(si et seulement si|seulement si|uniquement si|si applicable|le cas echeant|si|lorsque|lorsqu'|quand)\b/;
const CONDITION_INLINE = /\b(si et seulement si|seulement si|uniquement si|si applicable|le cas echeant|si|lorsque|lorsqu')\b/;
const NEGATION = /\b(sans|aucune?|ni|hors|jamais|excluant|a l'exclusion de|pas de|pas d')\b|\bne\b[^,;]*?\bpas\b|\bn'[a-z]+ pas\b/;
const CONNECTORS = /^(et|ainsi que|incluant|comprenant|avec|puis|ou|notamment|dont|plus|enfin)\b[\s:]*/;

/** Empreinte du registre (patrons + support + raisons) : toute modification du registre change l'empreinte. */
function registrySha256() {
  return sha(JSON.stringify({ id: REGISTRY_ID, capabilities: CAPABILITIES.map((c) => ({ id: c.id, supported: c.supported, reason: c.reason || null, negationExempt: !!c.negationExempt, patterns: c.patterns.map(String) })), forms: FORMS.map((f) => ({ id: f.id, supportedFor: f.supportedFor, patterns: f.patterns.map(String) })),
    condition: [String(CONDITION_START), String(CONDITION_INLINE)], negation: String(NEGATION), connectors: String(CONNECTORS) }));
}

/** Clauses : separateurs = , ; et point suivi d'un blanc (jamais le point de « v0.2 »). Le texte source de chaque clause est conserve. */
function splitClauses(text) {
  return String(text || "").split(/[;,]|\.(?=\s|$)|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function matchAll(patterns, n) { let best = -1; patterns.forEach((re) => { const m = re.exec(n); if (m && (best === -1 || m.index < best)) best = m.index; }); return best; }

/** assess(livrableAttendu) -> evaluation deterministe (porte CONFIRM_PLAN). */
function assess(livrableAttendu) {
  const source = String(livrableAttendu == null ? "" : livrableAttendu);
  const raw = splitClauses(source); const clauses = [];
  /* une clause qui COMMENCE par une condition est attachee a la clause suivante (ou a la precedente si elle est la derniere) */
  for (let i = 0; i < raw.length; i++) {
    let t = raw[i]; let n = norm(t); while (CONNECTORS.test(n)) { n = n.replace(CONNECTORS, "").trim(); }
    if (!n) continue;
    if (CONDITION_START.test(n)) { if (i + 1 < raw.length) { raw[i + 1] = { conditionPrefix: t, text: raw[i + 1] }; continue; } if (clauses.length) { clauses[clauses.length - 1].conditions.push(t); continue; } }
    if (typeof raw[i] === "object") { clauses.push({ text: raw[i].text, conditions: [raw[i].conditionPrefix] }); continue; }
    clauses.push({ text: t, conditions: [] });
  }
  /* une clause attachee peut elle-meme etre un objet (deux conditions consecutives) : aplatissement */
  clauses.forEach((c) => { while (c.text && typeof c.text === "object") { c.conditions.push(c.text.conditionPrefix); c.text = c.text.text; } });

  const deliverables = [], excluded = [];
  clauses.forEach(function (c, ci) {
    let n = norm(c.text); while (CONNECTORS.test(n)) n = n.replace(CONNECTORS, "").trim();
    /* condition en ligne : « X si Y » -> livrable X, condition « si Y » */
    let body = n; const inl = CONDITION_INLINE.exec(n); if (inl && inl.index > 0) { body = n.slice(0, inl.index).trim(); c.conditions.push(n.slice(inl.index)); }
    const condNorm = c.conditions.map(norm).join(" ; ");
    const dependsOn = CAPABILITIES.filter((cap) => matchAll(cap.patterns, condNorm) !== -1).map((cap) => cap.id);
    const forms = FORMS.filter((f) => matchAll(f.patterns, body) !== -1).map((f) => f.id);
    const negPos = (() => { const m = NEGATION.exec(body); return m ? m.index : -1; })();
    const found = [];
    CAPABILITIES.forEach(function (cap) { const pos = matchAll(cap.patterns, body); if (pos === -1) return;
      if (!cap.negationExempt && negPos !== -1 && negPos < pos) { excluded.push({ clauseIndex: ci, clause: c.text, capabilityId: cap.id, reason: "NEGATED_IN_REQUEST" }); return; }
      found.push({ cap, pos }); });
    found.sort((a, b) => a.pos - b.pos || CAPABILITIES.indexOf(a.cap) - CAPABILITIES.indexOf(b.cap));
    const conditional = c.conditions.length > 0;
    const base = { clauseIndex: ci, clause: c.text, conditional, condition: conditional ? c.conditions.join(" ; ") : null, conditionDependsOn: dependsOn, forms };
    if (!found.length) {
      /* forme seule ou texte non reconnu : jamais suppose produit */
      deliverables.push(Object.assign({}, base, { capabilityId: null, capabilityLabel: null, recognized: false, supported: false, gateClass: GATE_CLASS.NOT_SUPPORTED, reasonCode: "UNRECOGNIZED_DELIVERABLE",
        reason: "Livrable non reconnu par le registre " + REGISTRY_ID + " : cette version ne peut pas garantir sa production." }));
      return;
    }
    found.forEach(function (f) {
      const cap = f.cap; let gateClass = GATE_CLASS.SUPPORTED, reasonCode = null, reason = null;
      const badForms = forms.filter((fid) => FORMS.find((x) => x.id === fid).supportedFor.indexOf(cap.id) === -1);
      if (!cap.supported) { gateClass = GATE_CLASS.NOT_SUPPORTED; reasonCode = "CAPABILITY_NOT_SUPPORTED"; reason = cap.reason; }
      else if (badForms.length) { gateClass = GATE_CLASS.NOT_SUPPORTED; reasonCode = "FORM_NOT_SUPPORTED"; reason = "Forme(s) non produite(s) par cette version : " + badForms.join(", ") + "."; }
      else if (conditional) { gateClass = GATE_CLASS.NOT_SUPPORTED; reasonCode = "CONDITION_NOT_EVALUABLE"; reason = "Livrable conditionnel : cette version n'evalue pas la condition « " + base.condition + " »" + (dependsOn.length ? " (elle depend de : " + dependsOn.join(", ") + ")" : "") + "."; }
      if (conditional && !cap.supported) reason = reason + " Il est en outre conditionnel (« " + base.condition + " »).";
      deliverables.push(Object.assign({}, base, { capabilityId: cap.id, capabilityLabel: cap.label, recognized: true, supported: cap.supported, gateClass, reasonCode, reason }));
    });
  });
  deliverables.forEach((d, i) => { d.deliverableId = "DLV-" + String(i + 1).padStart(2, "0"); d.status = STATUS.REQUESTED; });
  const assessment = { schema: "EvidenceForge.MissionDeliverablesAssessment", schemaVersion: "MONOLITH-v1.0.17", registryId: REGISTRY_ID, registrySha256: registrySha256(),
    sourceField: "livrableAttendu", sourceText: source, sourceSha256: sha(source), deliverables, excluded,
    notSupported: deliverables.filter((d) => d.gateClass === GATE_CLASS.NOT_SUPPORTED).map((d) => d.deliverableId),
    acknowledgementRequired: deliverables.some((d) => d.gateClass === GATE_CLASS.NOT_SUPPORTED),
    note: "Evaluation lexicale deterministe du livrable confirme ; ce n'est ni un jugement sur l'objet examine ni un verdict." };
  assessment.assessmentSha256 = assessmentHash(assessment);
  return assessment;
}
function assessmentHash(a) { const c = Object.assign({}, a); delete c.assessmentSha256; return sha(JSON.stringify(c)); }
function verifyAssessment(a) { return !!a && typeof a === "object" && a.assessmentSha256 === assessmentHash(a); }

/**
 * evaluate({ assessment, report, acceptance, origin }) -> missionDeliverables.
 * acceptance = { acknowledged: bool, acknowledgedIds: [], validatedBy } issu de la Porte 1, ou null (run sans acceptation enregistree :
 * le plan confirme valait acceptation de TOUT le livrable affiche).
 */
function evaluate(input) {
  const a = input.assessment; const report = input.report || {}; const acc = input.acceptance || null;
  const items = arr(a && a.deliverables).map(function (d) {
    const cap = CAPABILITIES.find((c) => c.id === d.capabilityId) || null;
    const ack = !!acc && acc.acknowledged === true && arr(acc.acknowledgedIds).indexOf(d.deliverableId) !== -1;
    /* B1 : la reconnaissance (ack) est une INFORMATION, jamais une renonciation : elle ne retire pas le livrable du contrat.
       Tout livrable demande est donc accepte, qu'il soit garanti ou non, reconnu ou non. Aucune valeur d'entree ne peut mettre `accepted` a false. */
    const accepted = true;
    let status, statusReason, evidence = null;
    if (d.gateClass === GATE_CLASS.NOT_SUPPORTED || !cap || !cap.supported) { status = STATUS.NOT_PRODUCED_BY_DESIGN; statusReason = d.reasonCode || "CAPABILITY_NOT_SUPPORTED"; }
    else { const p = cap.produced(report); evidence = p.evidence; if (p.ok) { status = STATUS.PRODUCED; statusReason = "PRODUCTION_EVIDENCE_PRESENT"; } else { status = STATUS.NOT_PRODUCED_ERROR; statusReason = "PRODUCTION_EVIDENCE_MISSING"; } }
    return { deliverableId: d.deliverableId, requested: true, requestedStatus: STATUS.REQUESTED, clause: d.clause, capabilityId: d.capabilityId, capabilityLabel: d.capabilityLabel, conditional: d.conditional, condition: d.condition, forms: d.forms,
      gateClass: d.gateClass, accepted, acknowledgedAsNotProduced: ack, status, statusReason, reason: d.reason || null, evidence };
  });
  const count = (s) => items.filter((i) => i.status === s).length;
  const acceptedMissing = items.filter((i) => i.accepted && i.status !== STATUS.PRODUCED).map((i) => i.deliverableId);
  const byDesign = items.filter((i) => i.status === STATUS.NOT_PRODUCED_BY_DESIGN).length;
  /* B1 : un livrable non produit — par conception ou par erreur — reste accepte ; l'etat « partiel reconnu » (qui autorisait COMPLETED) n'existe plus.
     Le detail reste porte par chaque item (NOT_PRODUCED_BY_DESIGN / NOT_PRODUCED_ERROR, acknowledgedAsNotProduced) et par `summary`. */
  const overall = !items.length ? "NO_DELIVERABLE_DECLARED" : (acceptedMissing.length ? "INCOMPLETE" : "COMPLETE");
  return { schema: "EvidenceForge.MissionDeliverables", schemaVersion: "MONOLITH-v1.0.17", registryId: REGISTRY_ID, registrySha256: registrySha256(),
    assessmentSha256: a ? a.assessmentSha256 : null, origin: input.origin || (acc ? "GATE" : "RETROSPECTIVE_NO_GATE"),
    acceptance: acc ? { validatedBy: acc.validatedBy || null, acknowledged: acc.acknowledged === true, acknowledgedIds: arr(acc.acknowledgedIds), recordedAt: acc.recordedAt || null } : null,
    sourceField: "livrableAttendu", sourceSha256: a ? a.sourceSha256 : null, items, excluded: arr(a && a.excluded),
    summary: { REQUESTED: items.length, PRODUCED: count(STATUS.PRODUCED), NOT_PRODUCED_BY_DESIGN: byDesign, NOT_PRODUCED_ERROR: count(STATUS.NOT_PRODUCED_ERROR) },
    acceptedMissing, overall, runMayComplete: acceptedMissing.length === 0, reservations: arr(input.reservations),
    note: "Comparaison livrable demande / livrable produit. Ne contient aucun verdict sur l'objet examine ; PROCESS_QUALIFICATION et SCIENTIFICALLY_USABLE n'y entrent pas." };
}

/* B1 : aucun libelle « partiel reconnu » — une reconnaissance n'attenue pas l'incompletude ; elle est seulement rappelee dans le message INCOMPLETE. */
const OVERALL_USER = Object.freeze({
  COMPLETE: "Tous les livrables demandés sont produits.",
  INCOMPLETE: "Livrable(s) accepté(s) manquant(s) : le run n'est pas présenté comme terminé. Une reconnaissance avant le lancement informe, elle ne retire aucun livrable demandé.",
  NO_DELIVERABLE_DECLARED: "Aucun livrable n'était déclaré dans la mission confirmée.",
});

/**
 * attachToReport(report, md, computeReportHash) -> NOUVEL objet rapport avec `missionDeliverables` et l'en-tete MISSION_DELIVERABLES,
 * hash canonique recalcule (fonction du rapport, inchangee). Les champs existants du rapport ne sont pas modifies.
 */
function attachToReport(report, md, computeReportHash) {
  const out = Object.assign({}, report); delete out.reportHash;
  out.headline = Object.assign({}, report.headline, { MISSION_DELIVERABLES: md.overall, MISSION_DELIVERABLES_USER: OVERALL_USER[md.overall] || md.overall });
  out.missionDeliverables = md; out.reportHash = computeReportHash(out); return out;
}

module.exports = { assess, evaluate, attachToReport, verifyAssessment, assessmentHash, registrySha256, splitClauses, norm, REGISTRY_ID, STATUS, GATE_CLASS, CAPABILITIES, FORMS, OVERALL_USER, RUN_STATUS_INCOMPLETE, TERMINAL_REPORT_STATUSES };
