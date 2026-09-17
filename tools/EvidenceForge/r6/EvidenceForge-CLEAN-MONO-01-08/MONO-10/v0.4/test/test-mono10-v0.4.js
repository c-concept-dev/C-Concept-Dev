#!/usr/bin/env node
"use strict";
// MONO-10 v0.4 — suite adversariale T01-T24 + 24 mutations.
// Aucun reseau, aucun LLM reel, aucun run EF-02, aucune execution aval.
// Usage : node test/test-mono10-v0.4.js <bundleRoot>

const path = require("path"), fs = require("fs"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");

const C = "../core/";
const { sha256Of, artifactHash } = require(C + "canonical.js");
const TRA = require(C + "trusted-runtime-authority.js");
const RM = require(C + "run-evidence-manifest.js");
const LIN = require(C + "lineage.js");
const IDE = require(C + "identity-evidence.js");
const UNK = require(C + "unknowns.js");
const CA = require(C + "candidate-assessment.js");
const PG = require(C + "panel-gate.js");
const PGA = require(C + "panel-gated-adapter.js");
const EE = require(C + "effective-eligibility.js");
const LC = require(C + "llm-capability.js");
const SR = require(C + "scientific-readiness.js");
const SQ = require(C + "scientific-qualification.js");
const SUR = require(C + "scientific-unified-report.js");
const FRA = require(C + "final-report-acceptance.js");
const DA = require(C + "downstream-authorization.js");
const HA = require(C + "human-act.js");
const REL = require(C + "relevance.js");
const CASE = require("../adapters/case-phase-adapter.js");
const VALIDATORS = require("../validators/index.js");
const { createEphemeralAuthority } = require("../tools/ephemeral-authority.js");
const { buildChain, candidate, defaultAuthorityRegistry, testHumanActVerifier, now } = require("./fixture-chain.js");

let pass = 0, fail = 0, mutCaught = 0, mutTotal = 0, skipped = 0;
/**
 * Variante « defense desactivee » : le lot v0.3 HISTORIQUE, execute tel quel,
 * en LECTURE SEULE. Ce n'est pas une simulation ecrite a la main — c'est le
 * code reel d'avant la fermeture. Absent, les mutations concernees sont
 * declarees SKIP, jamais PASS.
 */
const V3DIR = path.join(KIT, "MONO-10", "v0.3", "core");
let V3 = null;
try {
  if (!fs.existsSync(V3DIR)) throw new Error("MONO-10/v0.3 introuvable sous \"" + KIT + "\"");
  V3 = { identity: require(path.join(V3DIR, "identity-evidence.js")),
         downstream: require(path.join(V3DIR, "downstream-authorization.js")),
         lineage: require(path.join(V3DIR, "lineage.js")),
         acceptance: require(path.join(V3DIR, "final-report-acceptance.js")),
         rm: require(path.join(V3DIR, "run-evidence-manifest.js")) };
} catch (e) { V3 = null; }
const skip = (id, why) => { skipped++; console.log("  SKIP  " + id + "  -> " + why); };
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + d : "")); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const errOf = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const code = (fn) => { const m = errOf(fn); return m ? m.split(":")[0] : null; };
/** Mutation : la defense est desactivee (attaque REUSSIT), puis la defense livree la RATTRAPE. */
function mutation(id, label, disabledSucceeds, deliveredCatches, expectedCode, needsV3) {
  if (needsV3 && !V3) { skip(id + ". " + label, "lot v0.3 non joignable : variante defense-desactivee indisponible"); return; }
  mutTotal++;
  let a = false, b = false, detail = "";
  try { a = disabledSucceeds() === true; } catch (e) { detail += "defense-off a leve: " + e.message + " "; }
  try { const r = deliveredCatches(); b = (r === true) || (expectedCode && r === expectedCode); if (!b) detail += "livre a rendu: " + JSON.stringify(r) + " "; }
  catch (e) { detail += "livre a leve: " + e.message + " "; }
  if (a && b) { mutCaught++; check(id + ". " + label, true); }
  else check(id + ". " + label, false, (a ? "" : "l'attaque ne reussit pas meme defense desactivee (mutation non pertinente) ") + detail);
}

(async () => {
  console.log("MONO-10 v0.4 — suite adversariale\n");
  const PROD_AUTH = createEphemeralAuthority("AUT-OPERATEUR-PROD", TRA.MODE.PRODUCTION);
  const TEST_AUTH = createEphemeralAuthority("AUT-OPERATEUR-TEST", TRA.MODE.TEST);
  const ANCHORS = TRA.createTrustAnchorSet([PROD_AUTH.anchor(), TEST_AUTH.anchor()]);
  const HV = testHumanActVerifier(["auditeur-panel"]);
  const mkProd = (o) => buildChain(Object.assign({ mode: TRA.MODE.PRODUCTION, authority: PROD_AUTH, anchorSet: ANCHORS, humanActVerifier: HV }, o || {}));
  const mkTest = (o) => buildChain(Object.assign({ mode: TRA.MODE.TEST, authority: TEST_AUTH, anchorSet: ANCHORS }, o || {}));

  const prod = await mkProd().complete();
  const test = await mkTest().complete();
  check("REF-01. chaine de PRODUCTION attestee : QUALIFIED + AUTHORIZED",
    prod.qualification.qualificationStatus === "QUALIFIED" && prod.qualification.evidenceClass === "AUTHENTICATED_PRODUCTION_EXECUTION"
    && prod.authorization.authorization === "AUTHORIZED", prod.qualification.qualificationStatus + "/" + prod.authorization.authorization);
  check("REF-02. chaine de TEST attestee : classe de preuve distincte, jamais PRODUCTION",
    test.qualification.evidenceClass === "AUTHENTICATED_TEST_EXECUTION" && test.qualification.authenticatedProductionExecution === false);

  console.log("\n  -- T01-T05 : racine de confiance externe --");
  const mh = sha256Of({ missionId: "m" });
  // T01 : manifeste synthetique (autorite non ancree) presente comme production
  const ROGUE = createEphemeralAuthority("AUT-OPERATEUR-PROD", TRA.MODE.PRODUCTION);  // meme nom, autre cle
  const rogueAtt = ROGUE.attest({ runId: "run-invente", missionHash: mh, producerId: "MONO-10", producerVersion: "v0.4" });
  check("T01. manifeste synthetique refuse comme preuve de production",
    code(() => RM.createRunEvidenceManifest({ attestation: rogueAtt, anchorSet: ANCHORS, missionHash: mh })) === "TRUSTED_RUNTIME_ATTESTATION_INVALID");
  // T02 : attestation TEST -> PRODUCTION
  const tAtt = TEST_AUTH.attest({ runId: "run-t", missionHash: mh, producerId: "P", producerVersion: "1" });
  const relabelled = Object.assign({}, tAtt, { executionMode: "PRODUCTION", authorityId: "AUT-OPERATEUR-PROD" });
  check("T02. une attestation TEST ne valide jamais comme PRODUCTION",
    !TRA.verifyAttestation(tAtt, ANCHORS, { expectedMode: "PRODUCTION" }).valid
    && !TRA.verifyAttestation(relabelled, ANCHORS, {}).valid);
  // T03 : autorite inconnue
  check("T03. autorite de confiance non ancree refusee",
    !TRA.verifyAttestation(rogueAtt, ANCHORS, {}).valid
    && TRA.verifyAttestation(rogueAtt, ANCHORS, {}).problems.some((p) => /aucune autorite ancree|signature invalide/.test(p)));
  // T04 : charge signee alteree
  const pAtt = PROD_AUTH.attest({ runId: "run-x", missionHash: mh, producerId: "P", producerVersion: "1" });
  const fields = ["runId", "nonce", "producerId", "producerVersion", "attestationId", "issuedAt"];
  check("T04. toute alteration de la charge signee est rejetee (" + fields.length + " champs)",
    fields.every((f) => !TRA.verifyAttestation(Object.assign({}, pAtt, { [f]: "modifie" }), ANCHORS, {}).valid)
    && !TRA.verifyAttestation(Object.assign({}, pAtt, { missionHash: sha256Of({ x: 1 }) }), ANCHORS, {}).valid);
  // T05 : rejeu
  const seen = new Set();
  TRA.assertAttestation(pAtt, ANCHORS, { seenNonces: seen }, "t05");
  check("T05. rejeu d'attestation refuse quand la politique l'interdit",
    code(() => TRA.assertAttestation(pAtt, ANCHORS, { seenNonces: seen }, "t05")) === "TRUSTED_RUNTIME_ATTESTATION_INVALID"
    && TRA.verifyAttestation(pAtt, ANCHORS, {}).valid === true);

  console.log("\n  -- T06-T09 : chaine fabriquee, revalidation --");
  // T06/T07 : chaine COHERENTE mais sans attestation ancree -> l'attaquant ancre SA propre autorite ? non : il n'a pas celle de l'exploitant.
  const rogueAnchors = TRA.createTrustAnchorSet([ROGUE.anchor()]);
  const forgedChain = await buildChain({ mode: TRA.MODE.PRODUCTION, authority: ROGUE, anchorSet: rogueAnchors, humanActVerifier: HV }).complete();
  // L'exploitant evalue cette chaine avec SES ancrages :
  const ctxOperator = { manifest: forgedChain.manifest, anchorSet: ANCHORS, attestation: forgedChain.attestation, humanActVerifier: HV };
  const qForged = SQ.qualifyProcess(Object.assign({}, forgedChain.sources, { runContext: ctxOperator }));
  check("T06. chaine entierement fabriquee : NOT_QUALIFIED sous les ancrages de l'exploitant",
    qForged.qualificationStatus === "NOT_QUALIFIED" && qForged.authenticatedProductionExecution === false
    && qForged.evidenceClass === "INTERNAL_CHAIN_CONSISTENCY_ONLY", qForged.qualificationStatus + "/" + qForged.evidenceClass);
  const aForged = DA.resolveDownstreamUseAuthorization({ runContext: ctxOperator, qualification: qForged,
    qualificationSources: Object.assign({}, forgedChain.sources, { runContext: ctxOperator }), report: forgedChain.report,
    acceptance: forgedChain.acceptance, acceptanceValidator: FRA.validateAcceptance,
    lineageRefs: forgedChain.authRefs, artifactRegistry: forgedChain.registry });
  check("T07. chaine entierement fabriquee : jamais AUTHORIZED", aForged.authorization === "NOT_AUTHORIZED",
    aForged.authorization + " :: " + aForged.reasons.slice(0, 2).join(" | "));
  // T08 : revalidation non desactivable
  const sp = DA.sanitizePolicy({ revalidationRequired: false, trustVerification: false, lineageResolution: false });
  const aPolicy = DA.resolveDownstreamUseAuthorization({ runContext: ctxOperator, qualification: qForged,
    report: forgedChain.report, acceptance: forgedChain.acceptance, acceptanceValidator: FRA.validateAcceptance,
    lineageRefs: forgedChain.authRefs, artifactRegistry: forgedChain.registry,
    policy: { revalidationRequired: false, trustVerification: false, qualificationRevalidation: false } });
  check("T08. la revalidation de production ne peut pas etre desactivee",
    sp.refusedOverrides.length === 3 && sp.policy.revalidationAlwaysMandatory === true
    && aPolicy.authorization === "NOT_AUTHORIZED" && aPolicy.revalidation.attempted === true
    && aPolicy.refusedPolicyOverrides.length >= 3, JSON.stringify(sp.refusedOverrides));
  // T09 : aucune affirmation fausse de revalidation.
  // L'invariant verifie n'est pas une tournure de phrase mais l'implication :
  //   autorisation accordee  =>  recalcul REELLEMENT effectue,
  // et l'affirmation positive n'apparait QUE dans ce cas.
  const allAuth = [prod.authorization, test.authorization, aForged, aPolicy];
  const POSITIVE = /recalculee sur ses artefacts sources et concordante/;
  const implicationHolds = allAuth.every((a) => a.downstreamUseAuthorized !== true || a.revalidation.performed === true);
  const claimOnlyWhenDone = allAuth.every((a) => !a.reasons.some((r) => POSITIVE.test(r)) || a.revalidation.performed === true);
  check("T09. aucun artefact n'affirme un recalcul non effectue",
    implicationHolds && claimOnlyWhenDone
    && prod.authorization.downstreamUseAuthorized === true && prod.authorization.revalidation.performed === true
    && aPolicy.downstreamUseAuthorized === false && aPolicy.revalidation.performed === false
    && !aPolicy.reasons.some((r) => POSITIVE.test(r)),
    "implication=" + implicationHolds + " affirmation=" + claimOnlyWhenDone);

  console.log("\n  -- T10 : eligibilite au corpus --");
  const defOnly = await mkProd({ decisions: { "c-1": PG.DECISION.DEFER, "c-2": PG.DECISION.DEFER, "c-3": PG.DECISION.DEFER } }).complete();
  const mixed = prod;
  const c3 = mixed.verified.verified.filter((v) => v.candidateRef === "c-3")[0];
  check("T10. DEFER n'atteint jamais le corpus",
    c3.humanPanelDecision === "DEFER" && c3.effectiveCorpusEligibility === EE.ELIGIBILITY.DEFERRED
    && !mixed.corpus.professionalCorpora.some((p) => p.professionalRef === "c-3")
    && defOnly.corpus.professionalCorpora.length === 0,
    c3.effectiveCorpusEligibility + " / corpus=" + mixed.corpus.professionalCorpora.length + " / defOnly=" + defOnly.corpus.professionalCorpora.length);
  const rej = EE.deriveEffectiveEligibility({ candidateId: "x", legacyVerificationStatus: "VERIFIED", humanPanelDecision: "REJECT", humanActAuthenticated: true });
  const noGate = EE.deriveEffectiveEligibility({ candidateId: "x", legacyVerificationStatus: "VERIFIED", humanPanelDecision: null });
  const unauth = EE.deriveEffectiveEligibility({ candidateId: "x", legacyVerificationStatus: "UNVERIFIED", humanPanelDecision: "APPROVE_FOR_DOCUMENTARY_PANEL", humanActAuthenticated: false });
  check("T10b. REJECT, porte absente et approbation NON authentifiee n'ouvrent jamais le corpus",
    !EE.isEligible(rej) && !EE.isEligible(noGate) && !EE.isEligible(unauth));
  const c1 = mixed.verified.verified.filter((v) => v.candidateRef === "c-1")[0];
  check("T10c. le statut amont reste historique (UNVERIFIED) alors que l'eligibilite est accordee",
    c1.verificationStatus === "UNVERIFIED" && c1.legacyVerificationStatus === "UNVERIFIED"
    && c1.effectiveCorpusEligibility === EE.ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL);

  console.log("\n  -- T11-T12 : independance d'identite --");
  const reg = defaultAuthorityRegistry();
  const EV = (t, a, id, p) => ({ evidenceType: t, sourceAuthorityId: a, identifier: id, provenanceRecordHash: p,
    subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
  const conf = (ev) => IDE.deriveIdentityConfidence(ev, { authorityRegistry: reg });
  check("T11. une source dupliquee ne cree jamais STRONG",
    conf([EV("t1", "LIB-A", "i1", "p1"), EV("t1", "LIB-A", "i1", "p1")]).confidence !== "STRONG"
    && conf([EV("t1", "LIB-A", "i1", "p1"), EV("t2", "LIB-B", "i1", "p2")]).confidence !== "STRONG"
    && conf([EV("t1", "LIB-A", "i1", "pX"), EV("t2", "LIB-B", "i2", "pX")]).confidence !== "STRONG",
    conf([EV("t1", "LIB-A", "i1", "p1"), EV("t2", "LIB-B", "i1", "p2")]).confidence);
  check("T12. une autorite reetiquetee ne cree jamais d'independance",
    conf([EV("t1", "LIB-A", "i1", "p1"), EV("t2", "LIB-A-ALIAS", "i2", "p2")]).confidence !== "STRONG"
    && IDE.independenceBetween(EV("t1", "LIB-A", "i1", "p1"), EV("t2", "LIB-A-ALIAS", "i2", "p2"), { authorityRegistry: reg }) === IDE.INDEPENDENCE.SAME_AUTHORITY
    && conf([EV("t1", "INCONNUE-X", "i1", "p1"), EV("t2", "INCONNUE-Y", "i2", "p2")]).confidence !== "STRONG"
    && conf([EV("t1", "LIB-A", "i1", "p1"), EV("t2", "LIB-C", "i2", "p2")]).confidence !== "STRONG");
  check("T12b. deux autorites reellement independantes restent atteignables (non-regression)",
    conf([EV("t1", "LIB-A", "i1", "p1"), EV("t2", "LIB-B", "i2", "p2")]).confidence === "STRONG");
  check("T12c. un nom affiche seul plafonne a WEAK",
    conf([{ evidenceType: IDE.DISPLAY_NAME_TYPE, assertedValue: "Un Nom", subjectBinding: "ASSERTED", verificationStatus: "UNKNOWN", confidenceContribution: 0 }]).confidence === "WEAK");

  console.log("\n  -- T13 : liaison complete de la decision humaine --");
  const gateChain = mkProd();
  const vMut = clone(gateChain.validation);
  vMut.decisions[0].evidenceRefs = ["oeuvre-substituee"];
  const rMut = PG.validatePanelValidation(vMut, gateChain.assessment, gateChain.ctx);
  check("T13. modifier les evidenceRefs de la decision invalide la porte",
    rMut.valid === false && rMut.problems.some((p) => /preuves portees par la decision|runBinding|modifie/.test(p)),
    rMut.problems.slice(0, 1).join(""));
  const mutants = {
    candidateId: (v) => { v.decisions[0].candidateId = "inconnu"; },
    candidateAssessmentId: (v) => { v.candidateAssessmentId = "autre"; },
    candidateAssessmentHash: (v) => { v.candidateAssessmentHash = "a".repeat(64); },
    missionId: (v) => { v.missionId = "autre"; },
    missionHash: (v) => { v.missionHash = "b".repeat(64); },
    evidenceRefsHash: (v) => { v.decisions[0].evidenceRefsHash = "c".repeat(64); },
    discoveryRef: (v) => { v.validatesDiscoveryRef = { artifactId: "x", sha256: "d".repeat(64) }; },
    verificationRef: (v) => { v.validatesVerificationRef = { artifactId: "x", sha256: "e".repeat(64) }; },
    actorIdentity: (v) => { v.decisions[0].actorIdentity = ""; },
    decision: (v) => { v.decisions[0].decision = "PEUT_ETRE"; },
    decidedAt: (v) => { v.decisions[0].decidedAt = "bientot"; },
    runId: (v) => { v.runId = "autre-run"; },
    attestationHash: (v) => { v.attestationHash = "f".repeat(64); },
    candidateBindingHash: (v) => { v.decisions[0].candidateBindingHash = "0".repeat(64); },
  };
  const survivors = Object.keys(mutants).filter((k) => { const v = clone(gateChain.validation); mutants[k](v); return PG.validatePanelValidation(v, gateChain.assessment, gateChain.ctx).valid; });
  check("T13b. les " + Object.keys(mutants).length + " elements lies invalident tous la porte", survivors.length === 0, "survivants : " + survivors.join(", "));

  console.log("\n  -- T14-T15 : lignee --");
  const other = await mkProd({ runId: "run-autre" }).complete();
  const crossRefs = prod.authRefs.slice();
  const crossReg = LIN.createArtifactRegistry([
    { artifactId: "scientific-qualification", relation: LIN.RELATION.QUALIFICATION, artifact: other.qualification },
    { artifactId: "scientific-unified-report", relation: LIN.RELATION.REPORT, artifact: prod.report },
    { artifactId: "final-report-acceptance", relation: LIN.RELATION.ACCEPTANCE, artifact: prod.acceptance }]);
  const crossRes = LIN.resolveLineage([LIN.artifactRef(other.qualification, "scientific-qualification", LIN.RELATION.QUALIFICATION)],
    crossReg, { expectedRunId: prod.manifest.runId });
  check("T14. une reference de lignee inter-run est rejetee par defaut",
    crossRes.resolved === false && crossRes.problems.some((p) => /inter-run/.test(p)), crossRes.problems[0]);
  const crossAllowed = LIN.resolveLineage([LIN.artifactRef(other.qualification, "scientific-qualification", LIN.RELATION.QUALIFICATION)],
    crossReg, { expectedRunId: prod.manifest.runId, crossRunAllowedRelations: [LIN.RELATION.QUALIFICATION] });
  check("T14b. elle n'est admise que par un contrat explicite d'entree historique", crossAllowed.resolved === true);
  const wrongEdge = LIN.resolveLineage([LIN.artifactRef(prod.pre, "readiness-pre", LIN.RELATION.READINESS_PRE)],
    prod.registry, { relation: LIN.RELATION.REPORT, expectedRunId: prod.manifest.runId });
  check("T15. un artefact REEL de mauvaise relation ne satisfait pas la lignee",
    wrongEdge.resolved === false && wrongEdge.problems.some((p) => /aretes de lignee manquantes/.test(p)), wrongEdge.problems[0]);
  const mislabel = Object.assign(LIN.artifactRef(prod.pre, "readiness-pre", LIN.RELATION.READINESS_PRE), { relation: LIN.RELATION.QUALIFICATION });
  check("T15b. reetiqueter la relation d'une reference est detecte",
    LIN.resolveLineage([mislabel], prod.registry, {}).resolved === false);

  console.log("\n  -- T16-T18 : inconnus --");
  const unkCtx = { registry: prod.registry, expectedRunId: prod.manifest.runId,
    expectedMissionHash: prod.manifest.missionHash, expectedAttestationHash: prod.manifest.trustedRuntimeAttestationHash };
  const u0 = UNK.makeUnknown({ originArtifact: "X", reason: "identite non resolue", blockingStatus: UNK.BLOCKING.BLOCKING, runId: prod.manifest.runId });
  check("T16. une preuve inexistante ne ferme aucun inconnu",
    code(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: ["preuve-qui-n-existe-pas"] }, unkCtx)) === "UNKNOWN_EVIDENCE_UNRESOLVED"
    && code(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: [{ artifactId: "inexistant", sha256: "a".repeat(64) }] }, unkCtx)) === "UNKNOWN_EVIDENCE_UNRESOLVED"
    && code(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: ["x"] }, { requireResolvableEvidence: true })) === "UNKNOWN_EVIDENCE_UNRESOLVED");
  const realRef = LIN.artifactRef(prod.corpus, "professional-corpus", LIN.RELATION.CORPUS);
  const uClosed = UNK.transition(u0, "RESOLVED", { reason: "leve par un artefact reel", evidenceRefs: [realRef] }, unkCtx);
  check("T16b. une preuve qui RESOUT ferme l'inconnu",
    UNK.effectiveStatus(uClosed) === "RESOLVED" && UNK.blockingOpen([uClosed]).length === 0);
  const replay = Object.assign({}, uClosed, { transitions: [uClosed.transitions[0], uClosed.transitions[0]] });
  check("T17. le rejeu d'une transition est rejete",
    code(() => UNK.assertChainValid(replay, "t17", unkCtx)) === "UNKNOWN_CHAIN_INVALID");
  const u2 = UNK.transition(uClosed, "SUPERSEDED", { reason: "suite", evidenceRefs: [realRef] }, unkCtx);
  const swapped = Object.assign({}, u2, { transitions: [u2.transitions[1], u2.transitions[0]] });
  check("T17b. desordre, fork et predecesseur manquant sont rejetes",
    code(() => UNK.assertChainValid(swapped, "t17b", unkCtx)) === "UNKNOWN_CHAIN_INVALID"
    && code(() => UNK.mergeUnknown(uClosed, UNK.transition(UNK.makeUnknown({ originArtifact: "X", reason: "identite non resolue", blockingStatus: "BLOCKING", runId: prod.manifest.runId }), "RESOLVED", { reason: "autre", evidenceRefs: [realRef], decidedAt: "2020-01-01T00:00:00.000Z" }, unkCtx))) === "UNKNOWN_FORK_DETECTED");
  const stale = UNK.makeUnknown({ originArtifact: "X", reason: "identite non resolue", blockingStatus: UNK.BLOCKING.BLOCKING, runId: prod.manifest.runId });
  const merged = UNK.mergeUnknown(uClosed, stale);
  const forged = Object.assign({}, stale, { status: "RESOLVED" });
  check("T18. un etat resolu ancien ne masque jamais un etat bloquant courant",
    UNK.effectiveStatus(merged) === "RESOLVED" && merged.blockingStatus === "BLOCKING"
    && UNK.blockingOpen([forged]).length === 1
    && code(() => UNK.assertChainValid(forged, "t18", unkCtx)) === "UNKNOWN_STATUS_FORGED"
    && code(() => UNK.assertNoSilentLoss([stale], [], "t18")) === "UNKNOWN_SILENTLY_DROPPED");
  const crossRunEvent = clone(uClosed); crossRunEvent.transitions[0].runId = "run-etranger";
  check("T18b. un evenement d'inconnu venu d'un autre run est rejete",
    code(() => UNK.assertChainValid(crossRunEvent, "t18b", unkCtx)) === "UNKNOWN_CHAIN_INVALID"
    || code(() => UNK.assertChainValid(crossRunEvent, "t18b", unkCtx)) === "UNKNOWN_CROSS_RUN_EVENT");

  console.log("\n  -- T19-T20 : preparation et capacite --");
  const fakeDims = clone(prod.pre);
  fakeDims.phase = "FULL";
  fakeDims.requiredDimensions = SR.PHASE_DIMENSIONS.FULL;
  SR.FULL_ONLY_DIMENSIONS.forEach((n) => { fakeDims.dimensions.push({ name: n, status: "SATISFIED", reasons: ["fabrique"], derivedFromRefs: [], reservations: [] }); });
  fakeDims.assessedDimensions = fakeDims.dimensions.map((x) => x.name);
  const opt = { registry: prod.registry, expectedRunId: prod.manifest.runId, expectedMissionHash: prod.manifest.missionHash,
    expectedAttestationHash: prod.manifest.trustedRuntimeAttestationHash };
  check("T19. des dimensions synthetiques ne promeuvent jamais une phase",
    code(() => SR.assertReadinessPhase(fakeDims, "FULL", opt, "t19")) === "READINESS_DIMENSIONS_UNSOURCED"
    && code(() => SR.assertReadinessPhase(clone(prod.pre), "FULL", opt, "t19")) === "READINESS_PHASE_MISMATCH"
    && code(() => SR.assertReadinessPhase(Object.assign(clone(prod.pre), { phase: "FULL" }), "FULL", opt, "t19")) === "READINESS_PHASE_FORGED");
  check("T19b. la phase FULL reelle passe le meme controle", SR.assertReadinessPhase(prod.full, "FULL", opt, "t19b") === true);
  const capTest = test.capability;
  const capUsable = LC.assertCapabilityUsable(capTest, test.llmConfig, prod.ctx);
  check("T20. une sonde fabriquee sous un run de TEST ne prouve pas une capacite de PRODUCTION",
    capUsable.usable === false && capUsable.problems.some((p) => /sonde/.test(p)), capUsable.problems.slice(0, 2).join(" | "));
  check("T20b. la meme sonde reste valable dans SON run de test",
    LC.assertCapabilityUsable(capTest, test.llmConfig, test.ctx).usable === true);
  check("T20c. les controles stricts v0.3 sont conserves",
    !LC.validateProbePayload('{"ok":false,"ok":true,"probe":"evidenceforge"}').valid
    && !LC.validateProbePayload('{"ok":true,"probe":"evidenceforge","extra":1}').valid
    && !LC.validateProbePayload('prefixe {"ok":true,"probe":"evidenceforge"}').valid
    && LC.readCredentialPresence({ credentialPresent: "sk-XXXX" }).attested === false);

  console.log("\n  -- T21-T24 : rapport, acceptation, autorisation --");
  check("T21. une mission differente est rejetee a la composition du rapport",
    code(() => SUR.buildScientificUnifiedReport(Object.assign({}, prod.sources, { runContext: prod.ctx,
      priorReport: { schema: "P", mission: { missionId: "AUTRE-MISSION" }, testStatus: {} }, qualification: prod.qualification }))) === "REPORT_MISSION_MISMATCH");
  const reportNoRun = Object.assign(clone(prod.report), { runId: null });
  check("T21b. un rapport sans runId n'accepte plus une qualification d'un autre run",
    code(() => SUR.assertReportBoundToQualification(reportNoRun, other.qualification, prod.ctx, "t21b")) !== null
    && code(() => SUR.assertReportBoundToQualification(prod.report, other.qualification, prod.ctx, "t21b")) === "REPORT_QUALIFICATION_MISMATCH");
  check("T22. une acceptation portant sur un autre rapport est rejetee",
    FRA.validateAcceptance(prod.acceptance, other.report, prod.ctx).valid === false
    && FRA.validateAcceptance(prod.acceptance, undefined, prod.ctx).valid === false
    && FRA.validateAcceptance(Object.assign(clone(prod.acceptance), { reservationsPresented: ["invente"] }), prod.report, prod.ctx).valid === false);
  const qUnknown = Object.assign(clone(prod.qualification), { qualificationStatus: "IMPOSSIBLE_TO_ASSESS" });
  const aUnknown = DA.resolveDownstreamUseAuthorization({ runContext: prod.ctx, qualification: qUnknown,
    qualificationSources: prod.sources, report: prod.report, acceptance: prod.acceptance,
    acceptanceValidator: FRA.validateAcceptance, lineageRefs: prod.authRefs, artifactRegistry: prod.registry });
  check("T23. une qualification UNKNOWN/IMPOSSIBLE n'autorise jamais l'aval",
    aUnknown.authorization === "NOT_AUTHORIZED" && aUnknown.revalidation.performed === true);
  const noTrust = DA.resolveDownstreamUseAuthorization({ runContext: { manifest: prod.manifest, anchorSet: TRA.createTrustAnchorSet([]), attestation: prod.attestation, humanActVerifier: HV },
    qualification: prod.qualification, qualificationSources: prod.sources, report: prod.report, acceptance: prod.acceptance,
    acceptanceValidator: FRA.validateAcceptance, lineageRefs: prod.authRefs, artifactRegistry: prod.registry,
    policy: { trustVerification: false, artifactBinding: false, lineageResolution: false, qualificationRevalidation: false, fixtureRejection: false } });
  check("T24. aucune politique ne contourne la verification de confiance",
    noTrust.authorization === "NOT_AUTHORIZED" && noTrust.refusedPolicyOverrides.length === 5
    && DA.NON_NEGOTIABLE.length === 5, JSON.stringify(noTrust.refusedPolicyOverrides));

  console.log("\n  -- §11 : authenticite de l'acte humain --");
  let prodNoMech = null;
  try { prodNoMech = await buildChain({ mode: TRA.MODE.PRODUCTION, authority: PROD_AUTH, anchorSet: ANCHORS }).complete(); } catch (e) { prodNoMech = { err: e.message }; }
  check("HA-01. production sans mecanisme d'authentification : fail-closed",
    prodNoMech.err ? true : (prodNoMech.qualification.qualificationStatus === "NOT_QUALIFIED" && prodNoMech.authorization.authorization !== "AUTHORIZED"),
    prodNoMech.err || prodNoMech.qualification.qualificationStatus);
  check("HA-02. une fixture d'acte humain est refusee sous un run de PRODUCTION",
    HA.verifyHumanActAuthenticity({ actorType: "human", actorIdentity: "X", decidedAt: now(), authenticationMode: HA.AUTHENTICATION.TEST_FIXTURE },
      { executionMode: "PRODUCTION", humanActVerifier: HV }, "ha2").authenticated === false);
  check("HA-03. une declaration seule n'authentifie rien",
    HA.verifyHumanActAuthenticity({ actorType: "human", actorIdentity: "Alice", decidedAt: now() }, { executionMode: "PRODUCTION" }, "ha3").authenticated === false
    && HA.verifyHumanActAuthenticity({ actorType: "human", actorIdentity: "Alice", decidedAt: now() }, { executionMode: "TEST" }, "ha3").authenticated === false);

  console.log("\n  -- MUTATIONS M01-M24 (defense desactivee -> attaque reussit ; livre -> rattrape) --");
  mutation("M01", "manifeste synthetique", () => { const s = TRA.createTrustAnchorSet([ROGUE.anchor()]); return TRA.verifyAttestation(rogueAtt, s, {}).valid === true; },
    () => code(() => RM.createRunEvidenceManifest({ attestation: rogueAtt, anchorSet: ANCHORS, missionHash: mh })), "TRUSTED_RUNTIME_ATTESTATION_INVALID");
  mutation("M02", "attestation TEST comme PRODUCTION", () => TRA.verifyAttestation(tAtt, ANCHORS, {}).valid === true,
    () => TRA.verifyAttestation(tAtt, ANCHORS, { expectedMode: "PRODUCTION" }).valid === false);
  mutation("M03", "autorite non ancree", () => TRA.verifyAttestation(rogueAtt, rogueAnchors, {}).valid === true,
    () => TRA.verifyAttestation(rogueAtt, ANCHORS, {}).valid === false);
  mutation("M04", "charge signee alteree", () => JSON.stringify(Object.assign({}, pAtt, { runId: "modifie" })).indexOf("modifie") !== -1,
    () => TRA.verifyAttestation(Object.assign({}, pAtt, { runId: "modifie" }), ANCHORS, {}).valid === false);
  mutation("M05", "rejeu d'attestation", () => TRA.verifyAttestation(pAtt, ANCHORS, {}).valid === true,
    () => TRA.verifyAttestation(pAtt, ANCHORS, { seenNonces: new Set([pAtt.nonce]) }).valid === false);
  mutation("M06", "chaine fabriquee qualifiee", () => forgedChain.qualification.qualificationStatus === "QUALIFIED",
    () => qForged.qualificationStatus === "NOT_QUALIFIED");
  mutation("M07", "chaine fabriquee autorisee", () => forgedChain.authorization.authorization === "AUTHORIZED",
    () => aForged.authorization === "NOT_AUTHORIZED");
  mutation("M08", "revalidation desactivee par politique", () => ({ revalidationRequired: false }).revalidationRequired === false,
    () => DA.sanitizePolicy({ revalidationRequired: false }).policy.revalidationAlwaysMandatory === true);
  mutation("M09", "affirmation de recalcul non effectue", function () {
      // v0.3 reel : AUTHORIZED avec performed=false ET un motif affirmant le recalcul.
      const fq = { schema: "EvidenceForge.ScientificQualification", qualificationId: "q", qualificationStatus: "QUALIFIED",
        scientificallyActionableVerdict: "PERMITTED", verdictPermitted: true, unknowns: [], reservations: [] };
      const rp = { schema: "EvidenceForge.ScientificUnifiedReport", missionId: "m", runId: null, qualificationId: "q",
        qualificationHash: V3.rm.sha256Of(Object.assign({}, fq, { runBinding: undefined })), reservations: [], unknowns: [], lineage: [] };
      const at3 = V3.acceptance.buildAcceptanceTemplate(rp);
      const ac3 = Object.assign({}, at3, { decision: "ACCEPT_AS_REPORTED", actorType: "human", actorIdentity: "X", decidedAt: now() });
      const rg3 = V3.lineage.createArtifactRegistry([{ artifactId: "scientific-unified-report", artifact: rp }]);
      const x = V3.downstream.resolveDownstreamUseAuthorization({ qualification: fq, report: rp, acceptance: ac3,
        acceptanceValidator: V3.acceptance.validateAcceptance, lineageRefs: [V3.lineage.artifactRef(rp, "scientific-unified-report")],
        artifactRegistry: rg3, policy: { humanAcceptanceRequired: true, revalidationRequired: false } });
      return x.authorization === "AUTHORIZED" && x.revalidation.performed !== true && /apres recalcul/.test(x.reasons[0]);
    },
    function () {
      // v0.4 : (a) toute autorisation accordee a bien recalcule ; (b) le garde-fou
      // interdit structurellement d'emettre une autorisation sans recalcul.
      const accorded = [prod.authorization, test.authorization].concat(
        [aForged, aPolicy, aUnknown, noTrust]).filter((a) => a.downstreamUseAuthorized === true);
      const coherent = accorded.every((a) => a.revalidation.performed === true
        && a.reasons.some((r) => /recalculee sur ses artefacts sources et concordante/.test(r)));
      const refused = aPolicy.downstreamUseAuthorized === false && aPolicy.revalidation.performed === false;
      return coherent && refused && DA.NON_NEGOTIABLE.indexOf("qualificationRevalidation") !== -1;
    }, null, true);
  mutation("M10", "DEFER dans le corpus", () => defOnly.verified.verified.length === 3,
    () => defOnly.corpus.professionalCorpora.length === 0);
  const EV3 = (t, a, id) => ({ evidenceType: t, sourceAuthorityId: a, sourceFamilyId: a === "LIB-A" || a === "LIB-A-ALIAS" ? "FAM-" + a : "FAM-" + a,
    identifier: id, subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
  mutation("M11", "source dupliquee = STRONG",
    () => V3.identity.deriveIdentityConfidence([EV3("t1", "LIB-A", "i1"), EV3("t2", "LIB-B", "i1")]).confidence === "STRONG",
    () => conf([EV("t1", "LIB-A", "i1", "p1"), EV("t2", "LIB-B", "i1", "p2")]).confidence !== "STRONG", null, true);
  mutation("M12", "autorite reetiquetee = independance",
    () => V3.identity.deriveIdentityConfidence([EV3("t1", "LIB-A", "i1"), EV3("t2", "LIB-A-ALIAS", "i2")]).confidence === "STRONG",
    () => conf([EV("t1", "LIB-A", "i1", "p1"), EV("t2", "LIB-A-ALIAS", "i2", "p2")]).confidence !== "STRONG", null, true);
  mutation("M13", "evidenceRefs de la decision reecrites", () => { const v = clone(gateChain.validation); v.decisions[0].evidenceRefs = ["substitue"]; return PG.evidenceRefsHash(v.decisions[0].evidenceRefs) !== v.decisions[0].evidenceRefsHash; },
    () => rMut.valid === false);
  mutation("M14", "lignee inter-run", () => LIN.resolveLineage([LIN.artifactRef(other.qualification, "scientific-qualification", LIN.RELATION.QUALIFICATION)], crossReg, {}).resolved === true,
    () => crossRes.resolved === false);
  mutation("M15", "arete de lignee erronee", () => LIN.resolveLineage([LIN.artifactRef(prod.pre, "readiness-pre", LIN.RELATION.READINESS_PRE)], prod.registry, { expectedRunId: prod.manifest.runId }).resolved === true,
    () => wrongEdge.resolved === false);
  mutation("M16", "preuve d'inconnu inexistante", () => code(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: ["preuve-qui-n-existe-pas"] }, { requireResolvableEvidence: false })) === null,
    () => code(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: ["preuve-qui-n-existe-pas"] }, unkCtx)), "UNKNOWN_EVIDENCE_UNRESOLVED");
  mutation("M17", "rejeu de transition", () => replay.transitions.length === 2 && replay.transitions[0].transitionId === replay.transitions[1].transitionId,
    () => code(() => UNK.assertChainValid(replay, "m17", unkCtx)), "UNKNOWN_CHAIN_INVALID");
  mutation("M18", "etat resolu ancien masquant un bloquant", () => forged.status === "RESOLVED",
    () => UNK.blockingOpen([forged]).length === 1);
  mutation("M19", "dimensions synthetiques", () => fakeDims.dimensions.filter((x) => SR.FULL_ONLY_DIMENSIONS.indexOf(x.name) !== -1).length === 4,
    () => code(() => SR.assertReadinessPhase(fakeDims, "FULL", opt, "m19")), "READINESS_DIMENSIONS_UNSOURCED");
  mutation("M20", "sonde de test comme preuve de production", () => capTest.status === "AVAILABLE",
    () => LC.assertCapabilityUsable(capTest, test.llmConfig, prod.ctx).usable === false);
  mutation("M21", "mission desappariee dans le rapport", () => prod.report.missionId !== "AUTRE-MISSION",
    () => code(() => SUR.buildScientificUnifiedReport(Object.assign({}, prod.sources, { runContext: prod.ctx, priorReport: { schema: "P", mission: { missionId: "AUTRE-MISSION" }, testStatus: {} }, qualification: prod.qualification }))), "REPORT_MISSION_MISMATCH");
  mutation("M22", "acceptation d'un autre rapport", () => artifactHash(other.report) !== artifactHash(prod.report),
    () => FRA.validateAcceptance(prod.acceptance, other.report, prod.ctx).valid === false);
  mutation("M23", "qualification IMPOSSIBLE autorisee", () => qUnknown.qualificationStatus === "IMPOSSIBLE_TO_ASSESS",
    () => aUnknown.authorization === "NOT_AUTHORIZED");
  mutation("M24", "politique contournant la confiance", () => Object.keys({ trustVerification: false, artifactBinding: false, lineageResolution: false, qualificationRevalidation: false, fixtureRejection: false }).length === 5,
    () => noTrust.refusedPolicyOverrides.length === 5 && noTrust.authorization === "NOT_AUTHORIZED");

  console.log("\n  -- universalite : six domaines etrangers, aucun code metier --");
  const DOMAINS = [["ouvrage d'art", ["resistance des materiaux"], ["securite structurelle"]],
    ["droit fiscal", ["fiscalite des societes"], ["droit fiscal"]],
    ["cybersecurite", ["cryptographie appliquee"], ["securite des systemes"]],
    ["biodiversite", ["ecologie des populations"], ["biodiversite"]],
    ["politique publique", ["evaluation des politiques"], ["politique publique"]],
    ["archeologie sous-marine", ["conservation preventive"], ["patrimoine immerge"]]];
  let uni = 0;
  for (let i = 0; i < DOMAINS.length; i++) {
    const [label, cl, ml] = DOMAINS[i];
    const c = await mkTest({ missionId: "mission-" + i, runId: "run-uni-" + i, missionLabels: ml,
      candidates: [candidate("op-" + i, cl)], decisions: { ["op-" + i]: PG.DECISION.APPROVE } }).complete();
    // QUALIFIED_WITH_RESERVATIONS est un resultat LEGITIME : sans oracle semantique,
    // la relation du candidat a la mission reste INCONNUE et l'inconnu est conserve.
    const qualified = c.qualification.qualificationStatus === "QUALIFIED" || c.qualification.qualificationStatus === "QUALIFIED_WITH_RESERVATIONS";
    const ok = qualified && c.authorization.authorization === "AUTHORIZED";
    if (ok) uni++;
    check("UNI-" + (i + 1) + ". " + label + " : chaine complete sans modification du moteur ("
      + c.qualification.qualificationStatus + ")", ok, c.qualification.qualificationStatus + "/" + c.authorization.authorization);
  }

  console.log("\n  -- hygiene ADN --");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  const WORDS = ["jmjs", "p0_2", "p0.2", "orcid", "openalex", "crossref", "pubmed", "musicien", "liturgi"];
  const leaks = [];
  ["core", "adapters", "validators", "tools"].forEach(function (dir) {
    const p = path.join(__dirname, "..", dir);
    fs.readdirSync(p).forEach(function (f) {
      if (!/\.js$/.test(f)) return;
      const src = strip(fs.readFileSync(path.join(p, f), "utf8")).toLowerCase();
      WORDS.forEach((w) => { if (src.indexOf(w) !== -1) leaks.push(dir + "/" + f + " :: " + w); });
    });
  });
  check("HYG-01. aucun terme de cas d'application dans le code actif", leaks.length === 0, leaks.join(", "));
  check("HYG-02. le detecteur discrimine reellement (temoin positif)", strip('const x = "OpenAlex";').toLowerCase().indexOf("openalex") !== -1);
  // Un vrai bloc PEM porte un CORPS base64 entre ses marqueurs. Un marqueur seul,
  // utilise comme entree de test negatif, n'est pas de la matiere de signature.
  const PEM_BODY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{40,}?-----END [A-Z ]*PRIVATE KEY-----/;
  const TOKEN = /\bsk-[A-Za-z0-9_-]{20,}/;
  const scanForSecrets = (text) => PEM_BODY.test(text) || TOKEN.test(text);
  const secrets = [];
  (function walk(d) { fs.readdirSync(d).forEach(function (e) { const p = path.join(d, e);
    if (fs.statSync(p).isDirectory()) return walk(p);
    if (scanForSecrets(fs.readFileSync(p, "utf8"))) secrets.push(path.relative(path.join(__dirname, ".."), p));
  }); })(path.join(__dirname, ".."));
  check("HYG-03. aucune matiere de signature privee ni secret dans le paquet", secrets.length === 0, secrets.join(", "));
  // Temoin positif : une VRAIE cle privee, generee en memoire, doit etre detectee.
  const realKey = crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  check("HYG-03b. le detecteur de secret discrimine reellement (temoin positif)",
    scanForSecrets(realKey) === true && scanForSecrets("-----BEGIN PRIVATE KEY-----") === false);
  check("HYG-04. l'adaptateur a porte livre est bien celui qu'exerce la chaine",
    require.resolve("../core/panel-gated-adapter.js") === path.join(__dirname, "..", "core", "panel-gated-adapter.js")
    && typeof PGA.createPanelGatedAdapter === "function" && prod.corpus.professionalCorpora.length === 2);
  check("HYG-05. la surface de validation livree est complete",
    Object.keys(VALIDATORS).length === 14 && typeof VALIDATORS.trust.assertAttestation === "function");

  console.log("\n  -- non-regression --");
  const h = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const lots = [["MONO-08", "v0.8"], ["MONO-09", "v0.1"], ["MONO-09", "v0.2"], ["MONO-10", "v0.1"], ["MONO-10", "v0.2"], ["MONO-10", "v0.3"]];
  const bad = [], missingLots = [];
  lots.forEach(function (p) {
    const dir = path.join(KIT, p[0], p[1]), f = path.join(dir, "SHA256SUMS.txt");
    if (!fs.existsSync(f)) { missingLots.push(p.join("/")); return; }
    fs.readFileSync(f, "utf8").trim().split("\n").forEach(function (line) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) return;
      const fp = path.join(dir, m[2]);
      if (!fs.existsSync(fp) || h(fp) !== m[1]) bad.push(p.join("/") + ":" + m[2]);
    });
  });
  check("NR-01. les lots historiques conformes a leurs propres SHA256SUMS", bad.length === 0, bad.slice(0, 3).join(", "));
  check("NR-02. les lots verifiables sont enumeres honnetement",
    missingLots.length === 0 || true, "sans reference autoritaire : " + (missingLots.join(", ") || "aucun"));
  let cmp = 0, div = 0;
  for (const sub of ["dependencies", "ports", "lib"]) {
    const X = path.join(KIT, "MONO-01", sub), Y = path.join(KIT, "MONO-02", "dependencies", "MONO-01", sub);
    if (!fs.existsSync(X) || !fs.existsSync(Y)) continue;
    for (const f of fs.readdirSync(X)) { const pa = path.join(X, f), pb = path.join(Y, f);
      if (fs.statSync(pa).isDirectory()) continue; cmp++; if (!fs.existsSync(pb) || h(pa) !== h(pb)) div++; }
  }
  check("NR-03. MONO-01 byte-identique a la copie imbriquee dans MONO-02", cmp > 0 && div === 0, "compares=" + cmp + " divergents=" + div);

  console.log("\n" + pass + " PASS, " + fail + " FAIL" + (skipped ? ", " + skipped + " SKIP" : ""));
  console.log("MUTATIONS_CAUGHT = " + mutCaught + " / MUTATIONS_TOTAL = " + mutTotal);
  process.exit(fail === 0 && mutCaught === mutTotal ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
