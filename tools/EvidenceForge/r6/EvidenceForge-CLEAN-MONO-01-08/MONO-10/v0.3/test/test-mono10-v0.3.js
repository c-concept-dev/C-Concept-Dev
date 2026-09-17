#!/usr/bin/env node
"use strict";
// MONO-10 v0.3 — suite adversariale. Aucun reseau, aucun LLM reel, aucun run EF-02, aucune execution aval.
// Usage : node test/test-mono10-v0.3.js <bundleRoot>

const path = require("path"), fs = require("fs"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
if (!fs.existsSync(path.join(KIT, "MONO-01", "index.js"))) {
  console.error("MONO-01 introuvable sous \"" + KIT + "\". Usage: node test/test-mono10-v0.3.js <bundleRoot>");
  process.exit(2);
}
const RM = require("../core/run-evidence-manifest.js");
const LIN = require("../core/lineage.js");
const IDE = require("../core/identity-evidence.js");
const REL = require("../core/relevance.js");
const UNK = require("../core/unknowns.js");
const CA = require("../core/candidate-assessment.js");
const PG = require("../core/panel-gate.js");
const EE = require("../core/effective-eligibility.js");
const PGA = require("../core/panel-gated-adapter.js");
const LC = require("../core/llm-capability.js");
const SR = require("../core/scientific-readiness.js");
const SQ = require("../core/scientific-qualification.js");
const DA = require("../core/downstream-authorization.js");
const SUR = require("../core/scientific-unified-report.js");
const FRA = require("../core/final-report-acceptance.js");
const CASE = require("../adapters/case-phase-adapter.js");
const AUTH = require("../adapters/declared-authority-identity-adapter.js");

let pass = 0, fail = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + d : "")); } };
const now = () => new Date().toISOString();
const threw = (fn, code) => { try { fn(); return false; } catch (e) { return code ? String(e.message).indexOf(code) === 0 : true; } };
const errOf = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// ---------- fabriques generiques : aucun domaine, identifiants opaques ----------
const cand = (ref, name, labels, evid, ids, amb, auth, fam) => ({
  candidateRef: ref, displayName: name, disciplines: labels, dimensionRef: labels[0] || null,
  identifiers: ids || [], affiliations: [], candidateStatus: "SEED_CANDIDATE",
  sourceAuthorityId: auth || null, sourceFamilyId: fam || null,
  identityAmbiguity: amb || null, evidenceRefs: evid, provenance: [{ origin: "SEED" }],
});
const ID = (type, value, auth, fam, binding, verif, contrib) => ({ type, value, sourceAuthorityId: auth, sourceFamilyId: fam, subjectBinding: binding, verificationStatus: verif, confidenceContribution: contrib });
const EVID = (type, auth, fam, identifier, binding, verif, contrib) => ({ evidenceType: type, sourceAuthorityId: auth, sourceFamilyId: fam, identifier, subjectBinding: binding, verificationStatus: verif, confidenceContribution: contrib });
const mkDisc = (missionId, cands) => ({ schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", missionId, candidates: cands });
const mkVer = (disc, statusFn) => ({ schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", missionId: disc.missionId,
  verified: disc.candidates.map((c) => ({ candidateRef: c.candidateRef, displayName: c.displayName, verificationStatus: statusFn ? statusFn(c) : "VERIFIED" })) });

function assessOf(cands, missionLabels, opts) {
  const disc = mkDisc("m1", cands);
  return CA.assessCandidates(Object.assign({ discovery: disc, verification: mkVer(disc), missionLabels: missionLabels }, opts || {}));
}
function decide(assessment, fn) {
  const tpl = PG.buildPanelValidationTemplate(assessment);
  tpl.decisions = tpl.decisions.map((d) => Object.assign({}, d, fn(d)));
  return tpl;
}
const human = (decision, who) => ({ decision, decisionReason: "motif explicite de la decision", actorType: "human", actorIdentity: who || "FIXTURE:auditeur", decidedAt: now() });
// deux autorites distinctes, familles distinctes, une preuve VERIFIED => identite STRONG
const strongCand = (ref, labels) => cand(ref, "Sujet " + ref, labels, ["w1", "w2"],
  [ID("second-source", "second:" + ref, "AUT-B", "FAM-2", "CONFIRMED", "VERIFIED", 0.6)], null, "AUT-A", "FAM-1");

(async () => {
  console.log("MONO-10 v0.3 — tests adversariaux\n");

  /* ===================== §7/§8 — la provenance ne se declare pas ===================== */
  const testMan = RM.createRunEvidenceManifest({ runId: "run-test", executionMode: RM.MODE.TEST });
  const prodMan = RM.createRunEvidenceManifest({ runId: "run-prod", executionMode: RM.MODE.PRODUCTION });
  const fixture = RM.bindArtifact(testMan, { schema: "X.Artifact", payload: 1 }, "art-1", "X.Artifact");

  const relabelled = Object.assign({}, fixture, { executionEvidenceClass: "REAL_RUNTIME" });
  check("T01. un artefact de fixture reetiquete REAL_RUNTIME ne devient pas une preuve de production",
    threw(() => RM.assertProductionEvidence(relabelled, testMan, "T01"), "RUN_NOT_PRODUCTION")
    && threw(() => RM.assertArtifactBoundToRun(relabelled, testMan, "T01"), "RUN_BINDING_MISMATCH"),
    errOf(() => RM.assertProductionEvidence(relabelled, testMan, "T01")));

  check("T02. modifier un artefact apres sa liaison casse l'empreinte croisee",
    threw(() => RM.assertArtifactBoundToRun(Object.assign({}, fixture, { payload: 2 }), testMan, "T02"), "RUN_BINDING_MISMATCH"));

  check("T03. un artefact sans runBinding ne prouve rien en production",
    threw(() => RM.assertProductionEvidence({ schema: "X.Artifact" }, prodMan, "T03"), "RUN_BINDING_MISSING"));

  const tampered = JSON.parse(JSON.stringify(prodMan)); tampered.executionMode = RM.MODE.PRODUCTION; tampered.runId = "autre-run";
  check("T04. un manifeste altere est detecte avant tout usage",
    threw(() => RM.assertManifest(tampered), "RUN_MANIFEST_TAMPERED"));

  check("T05. un artefact lie au run de TEST est refuse par le manifeste de PRODUCTION",
    threw(() => RM.assertProductionEvidence(fixture, prodMan, "T05"), "RUN_BINDING_MISMATCH"));

  /* ===================== §4/§5 — l'independance se demontre ===================== */
  const twoUnknownAuthorities = [EVID("a", null, null, "x1", "CONFIRMED", "VERIFIED", 0.6), EVID("b", null, null, "x2", "CONFIRMED", "VERIFIED", 0.6)];
  const c1 = IDE.deriveIdentityConfidence(twoUnknownAuthorities);
  check("T06. deux preuves sans autorite declaree ne comptent pas comme deux sources independantes",
    c1.confidence !== IDE.CONFIDENCE.STRONG && c1.independentProviders < 2, c1.confidence + "/" + c1.independentProviders);

  const sameAuth = IDE.deriveIdentityConfidence([EVID("a", "AUT-A", "F1", "x1", "CONFIRMED", "VERIFIED", 0.6), EVID("b", "AUT-A", "F2", "x2", "CONFIRMED", "VERIFIED", 0.6)]);
  check("T07. deux preuves de la MEME autorite ne produisent jamais STRONG", sameAuth.confidence === IDE.CONFIDENCE.MODERATE, sameAuth.confidence);

  const sameFam = IDE.deriveIdentityConfidence([EVID("a", "AUT-A", "FAM-1", "x1", "CONFIRMED", "VERIFIED", 0.6), EVID("b", "AUT-B", "FAM-1", "x2", "CONFIRMED", "VERIFIED", 0.6)]);
  check("T08. deux autorites de la MEME famille ne produisent jamais STRONG", sameFam.confidence === IDE.CONFIDENCE.MODERATE, sameFam.confidence);

  const nameOnly = IDE.deriveIdentityConfidence([{ evidenceType: IDE.DISPLAY_NAME_TYPE, sourceAuthorityId: null, sourceFamilyId: null, identifier: null, assertedValue: "Un Nom", subjectBinding: "ASSERTED", verificationStatus: "UNKNOWN", confidenceContribution: 0 }]);
  check("T09. un nom affiche seul plafonne a WEAK — un nom n'est pas une identite resolue", nameOnly.confidence === IDE.CONFIDENCE.WEAK, nameOnly.confidence);

  const indep = IDE.deriveIdentityConfidence([EVID("a", "AUT-A", "FAM-1", "x1", "CONFIRMED", "VERIFIED", 0.6), EVID("b", "AUT-B", "FAM-2", "x2", "CONFIRMED", "VERIFIED", 0.6)]);
  check("T10. autorites ET familles distinctes, avec une preuve verifiee : STRONG est atteignable", indep.confidence === IDE.CONFIDENCE.STRONG, indep.confidence);

  /* ===================== §11/§12 — un inconnu est une chaine ===================== */
  const u1 = UNK.makeUnknown({ originArtifact: "A", reason: "motif bloquant", blockingStatus: UNK.BLOCKING.BLOCKING });
  const forgedU = Object.assign({}, u1, { status: UNK.STATUS.RESOLVED });
  check("T11. un statut d'inconnu force a RESOLVED est detecte et reste bloquant",
    threw(() => UNK.assertChainValid(forgedU, "T11"), "UNKNOWN_STATUS_FORGED") && UNK.blockingOpen([forgedU]).length === 1);

  check("T12. une transition sans preuve est refusee",
    threw(() => UNK.transition(u1, UNK.STATUS.RESOLVED, { reason: "parce que" }), "UNKNOWN_TRANSITION_REQUIRES_EVIDENCE"));

  const resolved = UNK.transition(u1, UNK.STATUS.RESOLVED, { reason: "leve par une preuve", evidenceRefs: ["e1"] });
  check("T13. une transition motivee et prouvee est acceptee et derive le statut de la chaine",
    UNK.effectiveStatus(resolved) === UNK.STATUS.RESOLVED && UNK.assertChainValid(resolved, "T13") && UNK.openOnes([resolved]).length === 0);

  const softened = Object.assign({}, u1, { blockingStatus: UNK.BLOCKING.NON_BLOCKING });
  check("T14. la fusion conserve le blocage le plus severe : une version attenuee n'efface pas un BLOCKING",
    UNK.mergeUnknown(u1, softened).blockingStatus === UNK.BLOCKING.BLOCKING);

  const fork = UNK.transition(UNK.makeUnknown({ originArtifact: "A", reason: "motif bloquant", blockingStatus: UNK.BLOCKING.BLOCKING }), UNK.STATUS.RESOLVED, { reason: "autre chemin", evidenceRefs: ["e9"], decidedAt: "2020-01-01T00:00:00.000Z" });
  const fork2 = UNK.transition(u1, UNK.STATUS.RESOLVED, { reason: "chemin concurrent", evidenceRefs: ["e8"], decidedAt: "2021-01-01T00:00:00.000Z" });
  check("T15. deux chaines divergentes pour un meme inconnu sont detectees comme un fork",
    threw(() => UNK.mergeUnknown(fork, fork2), "UNKNOWN_FORK_DETECTED"));

  check("T16. un inconnu OPEN perdu en aval est detecte",
    threw(() => UNK.assertNoSilentLoss([u1], [], "T16"), "UNKNOWN_SILENTLY_DROPPED"));

  /* ===================== §10 — la lignee doit RESOUDRE ===================== */
  const artA = { schema: "X.A", v: 1 }, artB = { schema: "X.B", v: 2 };
  const registry = LIN.createArtifactRegistry([{ artifactId: "a", artifact: artA }, { artifactId: "b", artifact: artB }]);
  const refA = LIN.artifactRef(artA, "a", "X.A");
  check("T17. une reference exacte resout contre le registre", LIN.resolveLineage([refA], registry, {}).resolved);
  check("T18. une empreinte nulle (000...0) ne resout jamais",
    !LIN.resolveLineage([{ artifactId: "a", artifactType: "X.A", sha256: "0".repeat(64) }], registry, {}).resolved);
  check("T19. une reference vers un artefact absent du registre echoue",
    !LIN.resolveLineage([{ artifactId: "inexistant", artifactType: "X.A", sha256: "a".repeat(64) }], registry, {}).resolved);
  check("T20. un type de lignee errone echoue meme avec la bonne empreinte",
    !LIN.resolveLineage([Object.assign({}, refA, { artifactType: "X.B" })], registry, {}).resolved);

  /* ===================== §1/§2/§3 — la porte livree, le statut amont intact ===================== */
  const assessment = assessOf([strongCand("cand-1", ["alpha"]), strongCand("cand-2", ["alpha"])], ["alpha"]);
  const validation = decide(assessment, (d) => human(d.candidateId === "cand-1" ? PG.DECISION.APPROVE : PG.DECISION.DEFER));
  const pv = PG.validatePanelValidation(validation, assessment, {});
  check("T21. la porte humaine valide un ensemble complet et lie", pv.valid && pv.approved.length === 1, pv.problems.join(" ; "));

  const baseAdapter = {
    async discoverProfessionals() { return { schema: "EvidenceForge.ProfessionalDiscovery", candidates: [] }; },
    async verifyProfessionals() {
      return { schema: "EvidenceForge.ProfessionalVerification", verified: [
        { candidateRef: "cand-1", displayName: "Sujet cand-1", verificationStatus: "UNVERIFIED" },
        { candidateRef: "cand-2", displayName: "Sujet cand-2", verificationStatus: "VERIFIED" },
      ], summary: { total: 2 } };
    },
    async buildProfessionalCorpus(inputs) { return { schema: "EvidenceForge.ProfessionalCorpusSet", received: inputs.professionalVerification.verified.slice() }; },
  };
  const gated = PGA.createPanelGatedAdapter(baseAdapter, { panelValidation: validation, candidateAssessment: assessment });
  const verOut = await gated.verifyProfessionals({}, {});
  const v1 = verOut.verified.filter((v) => v.candidateRef === "cand-1")[0];
  const v2 = verOut.verified.filter((v) => v.candidateRef === "cand-2")[0];

  check("T22. l'adaptateur a porte est un module LIVRE du lot, importable hors tests",
    fs.existsSync(path.join(__dirname, "..", "core", "panel-gated-adapter.js")) && typeof PGA.createPanelGatedAdapter === "function");

  check("T23. le statut de verification amont n'est JAMAIS reecrit par une decision humaine",
    v1.verificationStatus === "UNVERIFIED" && v1.legacyVerificationStatus === "UNVERIFIED"
    && v1.effectiveCorpusEligibility === EE.ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL,
    v1.verificationStatus + "/" + v1.effectiveCorpusEligibility);

  check("T24. un candidat VERIFIED en amont mais DEFERE par l'humain n'est pas eligible",
    v2.verificationStatus === "VERIFIED" && v2.effectiveCorpusEligibility === EE.ELIGIBILITY.DEFERRED && !EE.isEligible(v2),
    v2.effectiveCorpusEligibility);

  const corpus = await gated.buildProfessionalCorpus({ professionalVerification: verOut }, {});
  check("T25. seul l'approuve atteint la construction du corpus ; le defere est retenu",
    corpus.received.length === 1 && corpus.received[0].candidateRef === "cand-1");

  const ungated = PGA.createPanelGatedAdapter(baseAdapter, {});
  let gateMissing = false;
  try { await ungated.buildProfessionalCorpus({ professionalVerification: { verified: [] } }, {}); } catch (e) { gateMissing = String(e.message).indexOf("PANEL_GATE_MISSING") === 0; }
  check("T26. sans porte humaine valide, aucun corpus n'est construit (fail-closed)", gateMissing);

  let bypass = false;
  try { await gated.buildProfessionalCorpus({ professionalVerification: { verified: [{ candidateRef: "cand-1", verificationStatus: "VERIFIED" }] } }, {}); }
  catch (e) { bypass = String(e.message).indexOf("ELIGIBILITY_NOT_DERIVED") === 0; }
  check("T27. une verification qui n'est pas passee par la porte est refusee a l'entree du corpus", bypass);

  /* ===================== §14/§15/§16 — la capacite se constate ===================== */
  check("T28. une charge JSON a cle dupliquee est rejetee avant analyse",
    !LC.validateProbePayload('{"ok":false,"probe":"evidenceforge","ok":true}').valid
    && !LC.validateProbePayload('{"ok":true,"probe":"evidenceforge","ok":false}').valid
    && LC.validateProbePayload('{"ok":true,"probe":"evidenceforge"}').valid);

  const llmCfg = { providerId: "prov", modelId: "mod", workerBindingId: "bind", credentialPresent: true };
  const okText = '{"ok":true,"probe":"evidenceforge"}';
  const muteTransport = async () => ({ httpStatus: 200, text: okText, requestId: "req-1" });
  const fullTransport = async () => ({ httpStatus: 200, text: okText, requestId: "req-1", credentialProbeSkipped: false });
  const capMute = await LC.runActiveProbe(llmCfg, muteTransport, {});
  const capFull = await LC.runActiveProbe(llmCfg, fullTransport, {});
  check("T29. un transport qui n'atteste pas avoir porte des identifiants ne produit pas AVAILABLE",
    capMute.status === LC.STATUS.DEGRADED && !LC.assertCapabilityUsable(capMute, llmCfg, {}).usable, capMute.status);
  check("T30. workerBindingId divergent : la capacite constatee ne porte pas sur ce qui sera execute",
    LC.assertCapabilityUsable(capFull, llmCfg, {}).usable
    && !LC.assertCapabilityUsable(capFull, Object.assign({}, llmCfg, { workerBindingId: "autre" }), {}).usable);

  /* ===================== tests complementaires ===================== */
  check("T31. un secret en clair n'est jamais accepte comme attestation de presence",
    LC.readCredentialPresence({ credentialPresent: "sk-XXXX" }).attested === false
    && /booleen/.test(LC.readCredentialPresence({ credentialPresent: "sk-XXXX" }).problem));

  const pre = SR.evaluateReadiness({ phase: "PRE", llmNodesWillRun: false });
  check("T32. une evaluation PRE presentee la ou FULL est exigee est refusee",
    threw(() => SR.assertReadinessPhase(pre, "FULL", "T32"), "READINESS_PHASE_MISMATCH"));
  const relabelledPre = Object.assign({}, pre, { phase: "FULL", requiredDimensions: SR.PHASE_DIMENSIONS.FULL });
  check("T33. reetiqueter une PRE en FULL est detecte par le jeu de dimensions reellement evalue",
    threw(() => SR.assertReadinessPhase(relabelledPre, "FULL", "T33"), "READINESS_PHASE_FORGED"));

  const lyingReadiness = Object.assign({}, SR.evaluateReadiness({ phase: "PRE", candidateAssessment: assessment, panelValidation: validation, llmNodesWillRun: false }), { status: SR.READINESS.READY, blockingDimensions: [], unknowns: [] });
  const qual = SQ.qualifyProcess({ candidateAssessment: assessment, panelValidation: validation, readinessPre: lyingReadiness, llmNodesWillRun: false });
  const divergenceSeen = qual.criteria.filter((c) => c.id === "readiness_recomputed_matches_presented")[0];
  check("T34. la qualification recalcule la preparation et refuse une evaluation complaisante",
    qual.readinessRecomputed === true && divergenceSeen.satisfied === false && qual.qualificationStatus === SQ.QUALIFICATION.NOT_QUALIFIED,
    divergenceSeen && divergenceSeen.reason);

  const accNoReport = { schema: "EvidenceForge.FinalReportAcceptance", reportRef: { artifactId: "x", sha256: "0".repeat(64) }, decision: FRA.DECISION.ACCEPT, actorType: "human", actorIdentity: "Q", decidedAt: now() };
  check("T35. une acceptation sans rapport concret n'est pas un acte",
    FRA.validateAcceptance(accNoReport, undefined, {}).valid === false && FRA.validateAcceptance(accNoReport, null, {}).continuationAllowed === false);

  const forgedQual = { schema: "EvidenceForge.ScientificQualification", qualificationId: "qualification-forge", qualificationStatus: "QUALIFIED", scientificallyActionableVerdict: "PERMITTED", verdictPermitted: true, unknowns: [], reservations: [] };
  const authz = DA.resolveDownstreamUseAuthorization({ qualification: forgedQual, lineageRefs: [{ artifactId: "a", sha256: "a".repeat(64) }], policy: { humanAcceptanceRequired: false } });
  check("T36. une qualification fabriquee n'autorise rien : l'ultime porte revalide ses entrees",
    authz.authorization === DA.AUTHORIZATION.NOT_AUTHORIZED && authz.revalidation.attempted === true && authz.reasons.length >= 2, authz.reasons.join(" | "));

  check("T37. un acte humain sans identite ou sans horodatage reel est refuse",
    threw(() => LIN.assertHumanAct({ actorType: "human", actorIdentity: "", decidedAt: now() }, "T37"), "HUMAN_ACT_INVALID")
    && threw(() => LIN.assertHumanAct({ actorType: "human", actorIdentity: "X", decidedAt: "bientot" }, "T37"), "HUMAN_ACT_INVALID")
    && threw(() => LIN.assertHumanAct({ actorType: "system", actorIdentity: "X", decidedAt: now() }, "T37"), "HUMAN_ACT_INVALID"));

  const ambAssessment = assessOf([cand("amb-1", "Sujet ambigu", ["alpha"], ["w1"], [], "homonymie constatee", "AUT-A", "FAM-1")], ["alpha"]);
  check("T38. une identite ambigue n'est jamais presentee a la porte humaine",
    ambAssessment.assessments[0].assessmentStatus === CA.STATUS.AMBIGUOUS
    && PG.buildPanelValidationTemplate(ambAssessment).decisions.length === 0);

  const noOracle = REL.assessRelevance({ candidateLabels: ["gamma"], missionLabels: ["delta"] });
  check("T39. sans oracle semantique, une relation non etablie reste UNKNOWN, jamais OUT_OF_SCOPE",
    noOracle.relevance === REL.RELEVANCE.UNKNOWN, noOracle.relevance);

  check("T40. l'adaptateur de cas exige que le nom de phase vienne du cas, jamais du lot",
    threw(() => CASE.mapAuthorizationToCasePhase({ schema: "EvidenceForge.DownstreamUseAuthorization", authorization: "AUTHORIZED", reasons: [], downstreamUseAuthorized: true }, ""), "CASE_PHASE_NAME_REQUIRED"));

  /* ===================== MUTATIONS =====================
   * Deux familles, toutes deux reelles :
   *   MUT-D  mutations DIFFERENTIELLES : la variante "defense desactivee" n'est
   *          pas simulee a la main — c'est le lot v0.2 HISTORIQUE, execute tel
   *          quel. Chaque paire montre le defaut present la-bas et ferme ici.
   *          v0.2 est lu en lecture seule ; aucun lot gele n'est modifie.
   *   MUT-L  desactivations a DOUBLE COUCHE : on construit une entree qui
   *          FRANCHIT la premiere defense, et l'on verifie que la seconde
   *          arrete quand meme. Une seule barriere ne suffit jamais.
   * ================================================================= */
  console.log("\n  -- MUT-D : mutations differentielles contre le lot v0.2 historique --");
  // Le lot v0.2 est resolu depuis la racine du bundle, en LECTURE SEULE. Il n'est
  // pas embarque dans ce paquet : un lot gele ne se duplique pas. S'il n'est pas
  // joignable, les controles differentiels sont declares SKIP — jamais PASS.
  const V2DIR = path.join(KIT, "MONO-10", "v0.2", "core");
  let V2 = null, V2_REASON = null;
  try {
    if (!fs.existsSync(V2DIR)) throw new Error("MONO-10/v0.2 introuvable sous \"" + KIT + "\"");
    V2 = {
      unknowns: require(path.join(V2DIR, "unknowns.js")),
      lineage: require(path.join(V2DIR, "lineage.js")),
      identity: require(path.join(V2DIR, "identity-evidence.js")),
      evidence: require(path.join(V2DIR, "execution-evidence.js")),
      llm: require(path.join(V2DIR, "llm-capability.js")),
      readiness: require(path.join(V2DIR, "scientific-readiness.js")),
      acceptance: require(path.join(V2DIR, "final-report-acceptance.js")),
      downstream: require(path.join(V2DIR, "downstream-authorization.js")),
      assessment: require(path.join(V2DIR, "candidate-assessment.js")),
    };
  } catch (e) { V2_REASON = (e && e.message) || String(e); }
  let skipped = 0;
  const skip = (id, why) => { skipped++; console.log("  SKIP  " + id + "  -> " + why); };
  if (!V2) console.log("  (lot v0.2 non joignable : " + V2_REASON + " — les controles MUT-D sont declares SKIP)");

  const safe = (fn) => { try { return { ok: true, v: fn() }; } catch (e) { return { ok: false, v: e.message }; } };
  const pair = (id, label, v2fn, v3fn) => {
    const b = safe(v3fn);
    if (!V2) skip(id + "a. defaut REPRODUIT dans v0.2 : " + label, "lot v0.2 absent de cette extraction");
    else { const a = safe(v2fn); check(id + "a. defaut REPRODUIT dans v0.2 : " + label, a.ok && a.v === true, "v0.2 -> " + JSON.stringify(a.v).slice(0, 120)); }
    check(id + "b. defaut FERME dans v0.3 : " + label, b.ok && b.v === true, "v0.3 -> " + JSON.stringify(b.v).slice(0, 120));
  };

  pair("MUT-D01", "une charge JSON a cle dupliquee passe le schema ferme",
    () => V2.llm.validateProbePayload('{"ok":false,"probe":"evidenceforge","ok":true}').valid === true,
    () => LC.validateProbePayload('{"ok":false,"probe":"evidenceforge","ok":true}').valid === false);

  pair("MUT-D02", "un statut d'inconnu force a RESOLVED fait disparaitre un bloquant",
    () => { const u = V2.unknowns.makeUnknown({ originArtifact: "A", reason: "r", blockingStatus: V2.unknowns.BLOCKING.BLOCKING });
            return V2.unknowns.blockingOpen([Object.assign({}, u, { status: "RESOLVED" })]).length === 0; },
    () => UNK.blockingOpen([forgedU]).length === 1);

  pair("MUT-D03", "une reference de lignee d'empreinte nulle est acceptee",
    () => { try { V2.lineage.assertLineageNonEmpty([{ artifactId: "a", sha256: "0".repeat(64) }], "x"); return true; } catch (e) { return false; } },
    () => LIN.resolveLineage([{ artifactId: "a", artifactType: "X.A", sha256: "0".repeat(64) }], registry, {}).resolved === false);

  pair("MUT-D04", "l'independance est deduite d'un prefixe de protocole",
    () => V2.identity.deriveIdentityConfidence([
      { evidenceType: "a", provider: "reg", identifier: "reg://x", subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 },
      { evidenceType: "b", provider: "orc", identifier: "orc://y", subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 },
    ]).confidence === "STRONG",
    () => IDE.deriveIdentityConfidence([EVID("a", null, null, "reg://x", "CONFIRMED", "VERIFIED", 0.6), EVID("b", null, null, "orc://y", "CONFIRMED", "VERIFIED", 0.6)]).confidence !== IDE.CONFIDENCE.STRONG);

  pair("MUT-D05", "un nom affiche seul obtient MODERATE",
    () => V2.identity.deriveIdentityConfidence([{ evidenceType: "display-name", provider: null, identifier: null, assertedValue: "N", subjectBinding: "ASSERTED", verificationStatus: "UNKNOWN", confidenceContribution: 0 }]).confidence === "MODERATE",
    () => nameOnly.confidence === IDE.CONFIDENCE.WEAK);

  pair("MUT-D06", "une fixture reetiquetee REAL_RUNTIME devient une preuve de production",
    () => { const fx = Object.assign({ schema: "X" }, V2.evidence.stamp(V2.evidence.CLASS.TEST_FIXTURE));
            try { V2.evidence.assertProductionEvidence(Object.assign({}, fx, { executionEvidenceClass: "REAL_RUNTIME" }), "x", { production: true }); return true; } catch (e) { return false; } },
    () => threw(() => RM.assertProductionEvidence(relabelled, testMan, "MUT-D06")));

  // D07 est asynchrone : il est ecrit directement, sans passer par pair().
  const capMuteV2 = V2 ? await V2.llm.runActiveProbe(llmCfg, muteTransport, {}) : null;
  if (!V2) skip("MUT-D07a. defaut REPRODUIT dans v0.2 : un transport muet produit AVAILABLE et usable", "lot v0.2 absent de cette extraction");
  else check("MUT-D07a. defaut REPRODUIT dans v0.2 : un transport muet produit AVAILABLE et usable",
    capMuteV2.status === "AVAILABLE" && V2.llm.assertCapabilityUsable(capMuteV2, llmCfg, {}).usable === true, capMuteV2.status);
  check("MUT-D07b. defaut FERME dans v0.3 : l'absence d'attestation est un rejet",
    capMute.status === LC.STATUS.DEGRADED && LC.assertCapabilityUsable(capMute, llmCfg, {}).usable === false, capMute.status);

  pair("MUT-D08", "un workerBindingId divergent n'est pas compare",
    () => V2.llm.assertCapabilityUsable(capMuteV2, Object.assign({}, llmCfg, { workerBindingId: "autre" }), {}).usable === true,
    () => LC.assertCapabilityUsable(capFull, Object.assign({}, llmCfg, { workerBindingId: "autre" }), {}).usable === false);

  pair("MUT-D09", "aucune verification de phase n'existe : une PRE vaut une FULL",
    () => typeof V2.readiness.assertReadinessPhase === "undefined",
    () => threw(() => SR.assertReadinessPhase(pre, "FULL", "x"), "READINESS_PHASE_MISMATCH"));

  pair("MUT-D10", "une acceptation sans rapport concret est declaree valide",
    () => V2.acceptance.validateAcceptance(accNoReport, undefined, {}).valid === true,
    () => FRA.validateAcceptance(accNoReport, undefined, {}).valid === false);

  pair("MUT-D11", "une qualification fabriquee obtient AUTHORIZED",
    () => V2.downstream.resolveDownstreamUseAuthorization({ qualification: forgedQual, lineageRefs: [{ artifactId: "a", sha256: "a".repeat(64) }], policy: { humanAcceptanceRequired: false } }).authorization === "AUTHORIZED",
    () => authz.authorization === DA.AUTHORIZATION.NOT_AUTHORIZED);

  pair("MUT-D12", "aucun adaptateur a porte n'est livre hors des tests",
    () => fs.existsSync(path.join(V2DIR, "panel-gated-adapter.js")) === false,
    () => fs.existsSync(path.join(__dirname, "..", "core", "panel-gated-adapter.js")) === true && typeof PGA.createPanelGatedAdapter === "function");

  pair("MUT-D13", "le statut de verification amont peut etre reecrit sans trace",
    () => typeof V2.assessment.deriveEffectiveEligibility === "undefined",
    () => v1.legacyVerificationStatus === "UNVERIFIED" && v1.verificationStatus === "UNVERIFIED" && EE.isEligible(v1) === true);

  console.log("\n  -- MUT-L : desactivations a double couche (franchir la 1re defense) --");
  const layer = (id, label, defeatsFirst, secondHolds) => {
    const a = safe(defeatsFirst), b = safe(secondHolds);
    check(id + "a. la premiere defense est FRANCHIE : " + label, a.ok && a.v === true, JSON.stringify(a.v).slice(0, 120));
    check(id + "b. la seconde defense arrete quand meme", b.ok && b.v === true, JSON.stringify(b.v).slice(0, 140));
  };

  // L01 — mode PRODUCTION obtenu, mais l'empreinte croisee tient.
  const prodFixture = RM.bindArtifact(prodMan, { schema: "X.Artifact", payload: 1 }, "art-p", "X.Artifact");
  const prodRelabelled = Object.assign({}, prodFixture, { executionEvidenceClass: "REAL_RUNTIME" });
  layer("MUT-L01", "le manifeste est bien en mode PRODUCTION (controle de mode inoperant)",
    () => prodMan.executionMode === RM.MODE.PRODUCTION && safe(() => RM.assertManifest(prodMan)).ok === true,
    () => threw(() => RM.assertProductionEvidence(prodRelabelled, prodMan, "L01"), "RUN_BINDING_MISMATCH"));

  // L02 — la liste de dimensions declaree est forgee pour correspondre a FULL.
  const forgedList = Object.assign({}, pre, { phase: "FULL", requiredDimensions: SR.PHASE_DIMENSIONS.FULL, assessedDimensions: SR.PHASE_DIMENSIONS.FULL.slice() });
  layer("MUT-L02", "l'etiquette ET la liste declaree annoncent toutes deux FULL",
    () => forgedList.phase === "FULL" && forgedList.assessedDimensions.length === SR.PHASE_DIMENSIONS.FULL.length,
    () => threw(() => SR.assertReadinessPhase(forgedList, "FULL", "L02"), "READINESS_DIMENSIONS_FORGED"));

  // L03 — des artefacts sources SONT fournis : le motif "revalidation impossible" disparait.
  const authzWithSources = DA.resolveDownstreamUseAuthorization({
    qualification: forgedQual,
    qualificationSources: { candidateAssessment: assessment, panelValidation: validation, llmNodesWillRun: false },
    lineageRefs: [LIN.artifactRef(artA, "a", "X.A")], artifactRegistry: registry,
    policy: { humanAcceptanceRequired: false },
  });
  layer("MUT-L03", "les sources sont fournies et la lignee resout : deux motifs de blocage sont leves",
    () => authzWithSources.revalidation.performed === true
      && authzWithSources.reasons.every((r) => r.indexOf("aucun artefact source") === -1 && r.indexOf("lignee non resolue") === -1),
    () => authzWithSources.authorization === DA.AUTHORIZATION.NOT_AUTHORIZED
      && authzWithSources.reasons.some((r) => r.indexOf("revalidation :") === 0));

  // L04 — un VRAI rapport est fourni, mais son contenu presente ne correspond pas.
  const realPrior = { schema: "EvidenceForge.PriorUnifiedReport", mission: { missionId: "m1" }, testStatus: { scientificValidity: false, testMode: true } };
  const qualForReport = SQ.qualifyProcess({ candidateAssessment: assessment, panelValidation: validation, llmNodesWillRun: false });
  // Le rapport porte un inconnu ouvert non bloquant : c'est ce que l'humain doit voir.
  const shownUnknown = UNK.makeUnknown({ originArtifact: "ScientificQualification", reason: "reserve documentaire conservee", blockingStatus: UNK.BLOCKING.NON_BLOCKING });
  const realReport = SUR.buildScientificUnifiedReport({ priorReport: realPrior, qualification: qualForReport, candidateAssessment: assessment, panelValidation: validation, missionId: "m1", addedUnknowns: [shownUnknown] });
  const tpl = FRA.buildAcceptanceTemplate(realReport);
  // L'acte humain est intact et sa reference correspond ; seul le contenu
  // REELLEMENT presente a l'humain a ete vide.
  const accTampered = Object.assign({}, tpl, human(FRA.DECISION.ACCEPT), { unknownsPresented: [] });
  layer("MUT-L04", "un rapport concret existe et la reference correspond (premiere defense franchie)",
    () => safe(() => LIN.assertRefMatches(accTampered.reportRef, realReport, "L04")).ok === true,
    () => { const honest = FRA.validateAcceptance(Object.assign({}, tpl, human(FRA.DECISION.ACCEPT)), realReport, {});
            const r = FRA.validateAcceptance(accTampered, realReport, {});
            return realReport.unknowns.length === 1 && honest.valid === true
              && r.valid === false && r.problems.some((p) => p.indexOf("presentes a l'humain") !== -1); });

  // L05 — la porte est valide et complete : le fail-closed ne se declenche pas.
  layer("MUT-L05", "la porte humaine est valide et exhaustive (fail-closed inoperant)",
    () => PG.validatePanelValidation(validation, assessment, {}).valid === true,
    () => corpus.received.length === 1 && corpus.received.every((x) => x.candidateRef !== "cand-2"));

  // L06 — une decision porte bien sur un candidat presentable, mais les preuves ont change.
  const mutatedAssessment = JSON.parse(JSON.stringify(assessment));
  mutatedAssessment.assessments[0].missionEvidenceRefs = ["w1", "w2", "w3"];
  layer("MUT-L06", "la decision reste syntaxiquement complete et humaine (premiere defense franchie)",
    () => validation.decisions.every((d) => d.actorType === "human" && d.decision && d.decisionReason),
    () => { const r = PG.validatePanelValidation(validation, mutatedAssessment, {});
            return r.valid === false && r.problems.some((p) => /evidenceRefsHash obsolete|candidateBindingHash obsolete|candidateAssessmentHash obsolete/.test(p)); });

  /* ===================== UNIVERSALITE — aucun metier, aucune discipline ===================== */
  console.log("\n  -- universalite : le meme noyau, sans code metier --");
  const DOMAINS = [
    { n: 1, label: "domaine A (libelles techniques)", mission: ["structure"], ref: "opaque-1" },
    { n: 2, label: "domaine B (libelles procedures)", mission: ["procedure"], ref: "opaque-2" },
    { n: 3, label: "domaine C (libelles ressources)", mission: ["ressource"], ref: "opaque-3" },
    { n: 4, label: "domaine D (libelles methodes)", mission: ["methode"], ref: "opaque-4" },
  ];
  DOMAINS.forEach(function (dm) {
    const a = assessOf([strongCand(dm.ref, dm.mission)], dm.mission);
    check("UNI-" + dm.n + ". " + dm.label + " traite sans aucun code specifique (identite " + a.assessments[0].identityConfidence + ")",
      a.summary.presentedForHumanReview === 1 && a.assessments[0].identityConfidence === IDE.CONFIDENCE.STRONG,
      a.assessments[0].identityConfidence + "/" + a.assessments[0].assessmentStatus);
  });
  const noRegistry = assessOf([cand("sans-registre", "Sujet", ["securite des structures"], ["w1"],
    [ID("autre", "second:sr", "AUT-B", "FAM-2", "CONFIRMED", "VERIFIED", 0.6)], null, "AUT-A", "FAM-1")], ["ingenierie de la securite"]);
  check("UNI-5. aucun identifiant academique, libelles proches mais non identiques : presente sans etre declare hors champ",
    noRegistry.summary.presentedForHumanReview === 1 && noRegistry.assessments[0].relevance !== REL.RELEVANCE.OUT_OF_SCOPE,
    noRegistry.assessments[0].assessmentStatus + "/" + noRegistry.assessments[0].relevance);

  /* ===================== HYGIENE — aucune fuite de cas d'application ===================== */
  console.log("\n  -- hygiene du noyau generique --");
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  const CASE_WORDS = ["jmjs", "p0_2", "p0.2", "orcid", "openalex", "crossref", "musicien", "liturgi"];
  const coreDir = path.join(__dirname, "..", "core");
  const leaks = [];
  fs.readdirSync(coreDir).forEach(function (f) {
    const src = stripComments(fs.readFileSync(path.join(coreDir, f), "utf8")).toLowerCase();
    CASE_WORDS.forEach((w) => { if (src.indexOf(w) !== -1) leaks.push(f + " :: " + w); });
  });
  check("HYG-01. aucun terme de cas d'application dans le noyau generique (hors commentaires)", leaks.length === 0, leaks.join(", "));
  const control = stripComments('const x = "OpenAlex";').toLowerCase();
  check("HYG-02. le detecteur d'hygiene discrimine reellement (temoin positif)", control.indexOf("openalex") !== -1);
  const adapterSrc = stripComments(fs.readFileSync(path.join(__dirname, "..", "adapters", "case-phase-adapter.js"), "utf8"));
  check("HYG-03. l'adaptateur de cas ne code aucun nom de phase en dur", !/P0[_.]2|JMJS/i.test(adapterSrc));

  /* ===================== NON-REGRESSION ===================== */
  console.log("\n  -- non-regression des lots amont --");
  const h = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  let cmp = 0, div = 0;
  for (const sub of ["dependencies", "ports", "lib"]) {
    const X = path.join(KIT, "MONO-01", sub), Y = path.join(KIT, "MONO-02", "dependencies", "MONO-01", sub);
    if (!fs.existsSync(X) || !fs.existsSync(Y)) continue;
    for (const f of fs.readdirSync(X)) {
      const pa = path.join(X, f), pb = path.join(Y, f);
      if (fs.statSync(pa).isDirectory()) continue; cmp++; if (!fs.existsSync(pb) || h(pa) !== h(pb)) div++;
    }
  }
  check("NR-01. MONO-01 byte-identique a la copie imbriquee dans MONO-02", cmp > 0 && div === 0, "compares=" + cmp + " divergents=" + div);
  const sumsOk = [["MONO-09", "v0.1"], ["MONO-09", "v0.2"], ["MONO-10", "v0.1"], ["MONO-10", "v0.2"]].map(function (p) {
    const dir = path.join(KIT, p[0], p[1]); const f = path.join(dir, "SHA256SUMS.txt");
    if (!fs.existsSync(f)) return p[0] + "/" + p[1] + ":ABSENT";
    const bad = fs.readFileSync(f, "utf8").trim().split("\n").filter(function (line) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) return true;
      const fp = path.join(dir, m[2]); return !fs.existsSync(fp) || h(fp) !== m[1];
    });
    return bad.length ? p[0] + "/" + p[1] + ":" + bad.length + " divergent(s)" : null;
  }).filter(Boolean);
  check("NR-02. MONO-09 v0.1/v0.2 et MONO-10 v0.1/v0.2 conformes a leurs propres SHA256SUMS — aucun lot gele reecrit", sumsOk.length === 0, sumsOk.join(" ; "));

  console.log("\n" + pass + " PASS, " + fail + " FAIL" + (skipped ? ", " + skipped + " SKIP (lot v0.2 non joignable)" : ""));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
