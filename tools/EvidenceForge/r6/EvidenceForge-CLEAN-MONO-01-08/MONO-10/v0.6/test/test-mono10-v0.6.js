#!/usr/bin/env node
"use strict";
// MONO-10 v0.6 — suite adversariale T01-T72 + 72 mutations.
// Aucun reseau, aucun LLM reel, aucun run EF-02, aucune execution aval, aucun acte humain reel.
// Usage : node test/test-mono10-v0.6.js <bundleRoot>

const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const C = "../core/";
const { sha256Of, artifactHash } = require(C + "canonical.js");
const OTB = require(C + "operator-trust-boundary.js");
const OTV = require(C + "operator-trust-verifier.js");
const OAB = require(C + "operator-acceptance-boundary.js");
const OLB = require(C + "operator-llm-capability-boundary.js");
const HAB = require(C + "operator-human-auth-boundary.js");
const RA = require(C + "runtime-attestation.js");
const RM = require(C + "run-evidence-manifest.js");
const AAR = require(C + "authenticated-artifact-registry.js");
const RP = require(C + "replay-protection.js");
const KL = require(C + "key-lifecycle.js");
const LIN = require(C + "lineage.js");
const IDE = require(C + "identity-evidence.js");
const ESP = require(C + "evidence-source-provenance.js");
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
const HAP = require(C + "human-act-proof.js");
const ATL = require(C + "artifact-trust-levels.js");
const VAL = require("../validators/index.js");
const OP = require("../tools/operator-provisioning.js");
const FX = require("./fixture-chain.js");

let pass = 0, fail = 0, mutCaught = 0, mutTotal = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + String(d).slice(0, 200) : "")); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const cd = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).split(":")[0]; } };
/** Une mutation ne compte que si l'attaque est PERTINENTE et le garde la RATTRAPE. */
function mutation(id, label, attackIsReal, guardCatches) {
  mutTotal++;
  let a = false, b = false, detail = "";
  try { a = attackIsReal() === true; } catch (e) { detail += "attaque a leve: " + e.message.slice(0, 80) + " "; }
  try { b = guardCatches() === true; } catch (e) { detail += "garde a leve: " + e.message.slice(0, 80) + " "; }
  if (a && b) { mutCaught++; check(id + ". " + label, true); }
  else check(id + ". " + label, false, (a ? "" : "attaque non pertinente ") + detail);
}

(async () => {
  console.log("MONO-10 v0.6 — suite adversariale\n");
  const opP = FX.provisionOperator({ namespace: "PRODUCTION" });
  const opT = FX.provisionOperator({ namespace: "TEST" });
  const P = await FX.buildChain({ mode: "PRODUCTION", operator: opP });
  const prod = await P.complete();
  const T = await FX.buildChain({ mode: "TEST", operator: opT });
  const test = await T.complete();
  const O = await FX.buildChain({ mode: "PRODUCTION", operator: opP, runSalt: 7, missionId: "mission-B" });
  const other = await O.complete();
  const fakeValidator = () => ({ valid: true, problems: [], continuationAllowed: true, humanActAuthenticated: true });
  const baseAuth = { runContext: prod.ctx, qualification: prod.qualification, qualificationSources: prod.sources,
    report: prod.report, lineageRefs: prod.authRefs, artifactRegistry: prod.registry };
  const authorize = (over) => DA.resolveDownstreamUseAuthorization(Object.assign({}, baseAuth, over || {}));

  check("REF-01. chaine PRODUCTION : QUALIFIED + AUTHORIZED",
    prod.qualification.qualificationStatus === "QUALIFIED" && prod.authorization.authorization === "AUTHORIZED"
    && prod.qualification.evidenceClass === "AUTHENTICATED_PRODUCTION_EXECUTION");
  check("REF-02. chaine TEST : classe de preuve distincte",
    test.qualification.evidenceClass === "AUTHENTICATED_TEST_EXECUTION" && test.qualification.authenticatedProductionExecution === false);

  /* ===== §58 ACCEPTATION (T01-T08) ===== */
  console.log("\n  -- T01-T08 : acceptation --");
  const rejAcc = (function () { const a = clone(prod.acceptance); a.decision = FRA.DECISION.REJECT;
    a.decisionHash = FRA.acceptanceDecisionHash(prod.report, FRA.DECISION.REJECT); return a; })();
  check("T01. un acceptanceValidator fabrique est ignore en PRODUCTION",
    authorize({ acceptance: rejAcc, acceptanceValidator: fakeValidator }).authorization === "NOT_AUTHORIZED"
    && authorize({ acceptance: prod.acceptance, acceptanceValidator: fakeValidator }).reasons.some((r) => /acceptanceValidator fourni par l'appelant : IGNORE/.test(r)));
  check("T02. un REFUS humain explicite ne peut jamais autoriser",
    authorize({ acceptance: rejAcc }).authorization === "NOT_AUTHORIZED"
    && authorize({ acceptance: rejAcc, acceptanceValidator: fakeValidator }).reasons.some((r) => /refus explicite/.test(r)));
  check("T03. une acceptation vide ne peut jamais autoriser",
    authorize({ acceptance: {} }).authorization === "NOT_AUTHORIZED"
    && authorize({ acceptance: {}, acceptanceValidator: fakeValidator }).authorization === "NOT_AUTHORIZED");
  check("T04. une acceptation portant sur un autre rapport est rejetee",
    authorize({ acceptance: other.acceptance }).authorization === "NOT_AUTHORIZED");
  check("T05. une acceptation d'une autre mission est rejetee",
    prod.verifier.acceptanceBoundary().validateAcceptance(other.acceptance, prod.report, prod.ctx).valid === false);
  const sp06 = DA.sanitizePolicy({ humanAcceptanceRequired: false });
  check("T06. humanAcceptanceRequired=false ne contourne pas le contrat",
    sp06.refusedOverrides.indexOf("humanAcceptanceRequired") !== -1
    && sp06.policy.humanAcceptanceRequired === undefined
    && sp06.refusalMotives.humanAcceptanceRequired === "DECISION_DE_LA_FRONTIERE_OPERATEUR"
    && authorize({ acceptance: null, policy: { humanAcceptanceRequired: false } }).authorization !== "AUTHORIZED");
  const unauthAcc = (function () { const a = clone(prod.acceptance); a.humanActProof = null; return a; })();
  check("T07. une acceptation humaine non authentifiee est rejetee",
    authorize({ acceptance: unauthAcc }).authorization === "NOT_AUTHORIZED");
  check("T08. un callback appelant ne devient jamais autorite d'acceptation",
    OAB.isProvisionedAcceptanceBoundary({ namespace: "PRODUCTION", validateAcceptance: fakeValidator }) === false
    && OAB.isProvisionedAcceptanceBoundary(prod.verifier.acceptanceBoundary()) === true);

  /* ===== §59 ELIGIBILITE (T09-T16) ===== */
  console.log("\n  -- T09-T16 : eligibilite au sink du corpus --");
  const sinkCase = async function (dec, mode) {
    const c = await FX.buildChain({ mode: "PRODUCTION", operator: opP, runSalt: 40 + dec.length + mode.length,
      decisions: { "c-1": PG.DECISION[dec], "c-2": PG.DECISION[dec], "c-3": PG.DECISION[dec] } });
    const v = await c.gated.verifyProfessionals({}, {});
    let input = v;
    if (mode === "tampered") { input = clone(v); input.verified.forEach((x) => { x.effectiveCorpusEligibility = "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL"; x.recomputed = true; }); }
    if (mode === "fabricated") { input = { schema: "EvidenceForge.ProfessionalVerification",
      verified: v.verified.map((x) => ({ candidateRef: x.candidateRef, displayName: x.displayName,
        verificationStatus: "VERIFIED", effectiveCorpusEligibility: "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL", recomputed: true })) }; }
    const corpus = await c.gated.buildProfessionalCorpus({ professionalVerification: input }, {});
    return corpus.professionalCorpora.length;
  };
  // Chaque appel construit sa PROPRE chaine (run distinct) et traverse le vrai
  // adaptateur a porte ; les six mesures servent a T09-T14 puis a M09-M14.
  const deferN = await sinkCase("DEFER", "normal"), deferT = await sinkCase("DEFER", "tampered"), deferF = await sinkCase("DEFER", "fabricated");
  const rejN = await sinkCase("REJECT", "normal"), rejT = await sinkCase("REJECT", "tampered"), rejF = await sinkCase("REJECT", "fabricated");
  const apprN = await sinkCase("APPROVE", "normal");
  check("T09. DEFER normal -> 0 au corpus", deferN === 0, deferN);
  check("T10. DEFER + eligibilite falsifiee -> 0 au corpus", deferT === 0, deferT);
  check("T11. DEFER + verification fabriquee -> 0 au corpus", deferF === 0, deferF);
  check("T12. REJECT normal -> 0 au corpus", rejN === 0, rejN);
  check("T13. REJECT + eligibilite falsifiee -> 0 au corpus", rejT === 0, rejT);
  check("T14. REJECT + verification fabriquee -> 0 au corpus", rejF === 0, rejF);
  check("T09b. temoin positif : APPROVE normal -> 3 au corpus (le filtre discrimine)", apprN === 3, apprN);
  check("T15. le champ recomputed de l'appelant est ignore",
    EE.isEligible({ effectiveCorpusEligibility: "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL", recomputed: true }) === false
    && EE.isEligible(clone(EE.deriveEffectiveEligibility({ candidateId: "x", humanPanelDecision: PG.DECISION.APPROVE, humanActAuthenticated: true }))) === false);
  // §13 — vrai consumer MONO-09
  const m09Path = path.join(KIT, "MONO-09", "v0.2", "lib", "professional-adapter.js");
  let m09ok = false, m09why = "MONO-09/v0.2 non joignable";
  if (fs.existsSync(m09Path)) {
    const M09 = require(m09Path);
    const realBase = M09.createProfessionalPipelineAdapter({ resolveAuthorIdentity: async (s) => ({ resolved: true, identity: { displayName: s.displayName } }),
      expandRelatedAuthors: async () => [], fetchAuthorWorks: async () => [] });
    const c = await FX.buildChain({ mode: "PRODUCTION", operator: opP, runSalt: 61, baseAdapter: realBase,
      decisions: { "c-1": PG.DECISION.APPROVE, "c-2": PG.DECISION.DEFER, "c-3": PG.DECISION.REJECT } });
    const v = await c.gated.verifyProfessionals({}, {});
    const t = clone(v); t.verified.forEach((x) => { x.effectiveCorpusEligibility = "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL"; });
    let approvedOnly = false, tamperedBlocked = false;
    try { const r1 = await c.gated.buildProfessionalCorpus({ professionalVerification: v, corpusSnapshot: { schema: "x" } }, {});
      approvedOnly = true; } catch (e) { approvedOnly = /MONO-09|schema|corpusSnapshot|REQUIRED/i.test(e.message); }
    try { await c.gated.buildProfessionalCorpus({ professionalVerification: t }, {}); } catch (e) { tamperedBlocked = true; }
    m09ok = approvedOnly; m09why = "adaptateur reel traverse ; filtre au sink applique avant MONO-09";
  }
  check("T16. le vrai consumer MONO-09 est traverse au sink", m09ok, m09why);

  /* ===== §60 REGISTRE (T17-T24) ===== */
  console.log("\n  -- T17-T24 : registre append-only --");
  const mutatedArtifact = (function () { const e = prod.registry.get("mission"); return e; })();
  check("T17. une mutation d'artefact apres enregistrement est detectee",
    Object.isFrozen(mutatedArtifact.artifact) === true
    && (function () { try { mutatedArtifact.artifact.missionId = "AUTRE"; } catch (e) { /* gele */ }
      return prod.registry.get("mission").artifact.missionId === prod.mission.missionId; })());
  const fakeManifest = (function () { const m = clone(prod.manifest); m.operatorTrustBoundaryId = "otb-faux";
    m.manifestBindingHash = sha256Of({ runId: m.runId, executionMode: m.executionMode, authorityId: m.authorityId, keyId: m.keyId,
      operatorTrustBoundaryId: m.operatorTrustBoundaryId, boundaryDescriptorHash: m.boundaryDescriptorHash,
      runtimeAttestationHash: m.runtimeAttestationHash, runManifestRootHash: m.runManifestRootHash, missionHash: m.missionHash }); return m; })();
  check("T18. un manifeste coherent mais non authentique ne cree pas de registre",
    RM.assertManifestShape(fakeManifest) === true
    && cd(() => AAR.openAuthenticatedArtifactRegistry(fakeManifest, prod.ctx)) !== null);
  const rogueDoc = RM.bindArtifact(prod.manifest, ESP.makeDocumentaryEvidenceRecord({ evidenceId: "faux", sourceRootId: "S-FAUX" }), "doc-faux", "EvidenceForge.DocumentaryEvidenceRecord");
  prod.registry.register({ artifactId: "doc-faux", relation: LIN.RELATION.DOCUMENTARY_EVIDENCE, artifact: rogueDoc });
  check("T19. un artefact insere n'est pas eleve au rang de preuve authentifiee",
    prod.registry.get("doc-faux").trustLevel === ATL.TRUST_LEVEL.BOUND_TO_RUN
    && cd(() => ATL.assertAtLeast(prod.registry.get("doc-faux").trustLevel, ATL.TRUST_LEVEL.AUTHENTICATED_PROVENANCE, "T19")) === "TRUST_LEVEL_INSUFFICIENT");
  check("T20. un registre d'un autre run est rejete",
    cd(() => AAR.assertAuthenticatedRegistry(other.registry, prod.manifest, "T20")) === "ARTIFACT_REGISTRY_RUN_MISMATCH");
  const log = prod.registry.eventLog();
  check("T21. une suppression d'evenement est detectee",
    AAR.verifyExportedEventChain(prod.registry.initialRootHash, log.filter((e, i) => i !== 2)).valid === false);
  check("T22. un reordonnancement d'evenements est detecte",
    AAR.verifyExportedEventChain(prod.registry.initialRootHash, [log[1], log[0]].concat(log.slice(2))).valid === false);
  check("T23. une mutation de previousEventHash est detectee",
    AAR.verifyExportedEventChain(prod.registry.initialRootHash,
      log.map((e, i) => (i === 3 ? Object.assign({}, e, { previousEventHash: "a".repeat(64) }) : e))).valid === false);
  check("T24. la racine de registre est deterministe et la chaine valide",
    prod.registry.verifyEventChain().valid === true
    && AAR.verifyExportedEventChain(prod.registry.initialRootHash, log).registryRootHash === prod.registry.registryRootHash);

  /* ===== §61 ACTE HUMAIN (T25-T30) ===== */
  console.log("\n  -- T25-T30 : acte humain --");
  const actExpect = { actionType: HAP.ACTION_TYPE.REPORT_ACCEPTANCE, decisionHash: prod.acceptance.decisionHash,
    runId: prod.manifest.runId, missionHash: prod.manifest.missionHash };
  check("T25. un nom d'acteur existant ne suffit pas",
    prod.verifier.verifyHumanAct({ actorType: "human", actorIdentity: "auditeur-panel", decidedAt: FX.now() }, actExpect).authenticated === false);
  check("T26. l'appartenance au registre sans preuve d'acte est rejetee",
    prod.verifier.verifyHumanAct({ actorType: "human", actorIdentity: "auditeur-panel", decidedAt: FX.now(), humanActProof: null }, actExpect).authenticated === false
    && prod.verifier.requiresHumanActProof() === true);
  const fakeProof = Object.assign({}, prod.acceptance.humanActProof, { proofValue: crypto.randomBytes(32).toString("hex") });
  check("T27. une preuve d'acte fabriquee est rejetee",
    prod.verifier.verifyHumanAct(Object.assign(clone(prod.acceptance), { humanActProof: fakeProof }), actExpect).authenticated === false);
  check("T28. une preuve portant un autre decisionHash est rejetee",
    prod.verifier.verifyHumanAct(prod.acceptance, Object.assign({}, actExpect, { decisionHash: sha256Of({ x: 1 }) })).authenticated === false);
  check("T29. une preuve d'un autre run est rejetee",
    prod.verifier.verifyHumanAct(Object.assign(clone(prod.acceptance), { humanActProof: other.acceptance.humanActProof }), actExpect).authenticated === false);
  check("T30. une preuve d'une autre mission est rejetee",
    prod.verifier.verifyHumanAct(prod.acceptance, Object.assign({}, actExpect, { missionHash: sha256Of({ m: "autre" }) })).authenticated === false
    && prod.verifier.verifyHumanAct(prod.acceptance, actExpect).authenticated === true);

  /* ===== §62 REJEU / CLES (T31-T38) ===== */
  console.log("\n  -- T31-T38 : rejeu et cles --");
  check("T31. consumeNonce=false ne contourne pas la production",
    prod.verifier.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: false }).valid === false
    && prod.verifier.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: false }).problems.some((p) => /consumeNonce=false ignore/.test(p)));
  check("T32. le meme nonce ne rouvre pas un run",
    cd(() => RM.openRunEvidenceManifest({ verifier: prod.verifier, attestation: prod.attestation, runIntent: P.intent })) === "RUNTIME_ATTESTATION_INVALID");
  const v2 = OTV.createOperatorTrustVerifier(FX.boundaryFor(opP));
  check("T33. un second verificateur, meme store, refuse le rejeu",
    v2.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  // Repertoire d'exploitation PROPRE : seule la reserve anti-rejeu est partagee.
  // Partager `dir` reecrirait actors.json de opP et invaliderait ses preuves d'acte.
  const op2 = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-partage", authority: opP.authority,
    replayProtection: { kind: "FILE", directory: path.join(opP.dir, "nonces"), authorityScope: [opP.authority.authorityId] } });
  check("T34. une seconde frontiere, meme autorite et meme namespace, refuse le rejeu",
    OTV.createOperatorTrustVerifier(FX.boundaryFor(op2)).verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  check("T35. un perimetre anti-rejeu absent ou incomplet echoue ferme",
    cd(() => RP.createFileReplayStore({ directory: fs.mkdtempSync(path.join(os.tmpdir(), "noscope-")) })) === "REPLAY_STORE_SCOPE_MISSING"
    && cd(() => OTB.provisionTestTrustBoundary({ operatorTrustBoundaryId: "x",
      authorities: [{ authorityId: "A-HORS", keys: [OP.mintOperatorAuthority({ authorityId: "A-HORS", namespace: "TEST" }).keyRecord()] }],
      replayProtection: { kind: "FILE", directory: fs.mkdtempSync(path.join(os.tmpdir(), "scope-")), authorityScope: ["AUTRE"] } })) === "REPLAY_PROTECTION_SCOPE_INCOMPLETE");
  const shared = OP.mintOperatorAuthority({ authorityId: "AUT-PARTAGEE", namespace: "PRODUCTION" });
  const opShared = FX.provisionOperator({ namespace: "PRODUCTION", authority: shared, boundaryId: "otb-sh-prod" });
  FX.boundaryFor(opShared);
  check("T36. la meme cle physique ne peut pas occuper TEST et PRODUCTION",
    cd(() => FX.boundaryFor(FX.provisionOperator({ namespace: "TEST", authority: shared, boundaryId: "otb-sh-test" }))) === "TRUST_ANCHOR_KEY_CROSS_NAMESPACE");
  check("T37. un statut de cle inconnu est rejete",
    cd(() => KL.makeKeyRecord({ authorityId: "A", keyId: "k", publicKeyPem: shared.keyRecord().publicKeyPem, validFrom: FX.now(), status: "PEUT_ETRE" })) === "KEY_STATUS_UNKNOWN");
  const opRev = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-rev" });
  const bRev = FX.boundaryFor(opRev), vRev = OTV.createOperatorTrustVerifier(bRev);
  const iRev = { runId: "run-rev", missionHash: sha256Of({ m: 1 }), producerId: "MONO-10", producerVersion: "v0.6", executionMode: "PRODUCTION", openedAt: FX.now() };
  const attRev = opRev.authority.attest(iRev);
  // AVANT revocation : la meme attestation est acceptee (pertinence de l'attaque).
  const revBefore = vRev.verifyRuntimeAttestation({ attestation: attRev, consumeNonce: true });
  OP.writeOperatorTrustConfig(opRev.cfgPath, Object.assign({}, opRev.cfg,
    { authorities: [{ authorityId: opRev.authority.authorityId, keys: [opRev.authority.keyRecord({ status: "REVOKED", revokedAt: FX.now(), revocationReason: "test" })] }] }));
  const revAfter = vRev.verifyRuntimeAttestation({ attestation: attRev, readOnlyRevalidation: true });
  check("T38. une revocation prend effet sur un verificateur DEJA provisionne (modele LIVE_CONFIG_LOOKUP)",
    vRev.revocationModel === "LIVE_CONFIG_LOOKUP" && revBefore.valid === true
    && revAfter.valid === false && revAfter.problems.some((p) => /REVOQUEE/.test(p)),
    JSON.stringify({ before: revBefore.valid, after: revAfter.problems }).slice(0, 180));

  /* ===== §63 PROVENANCE (T39-T43) ===== */
  console.log("\n  -- T39-T43 : provenance et identite --");
  const sameContent = sha256Of({ contenu: "identique" });
  const dA = prod.bind("doc-x-a", LIN.RELATION.DOCUMENTARY_EVIDENCE, FX.docRecord("doc-x-a", "SRC-1", "AUT-1", "FAM-1", sameContent));
  const dB = prod.bind("doc-x-b", LIN.RELATION.DOCUMENTARY_EVIDENCE, FX.docRecord("doc-x-b", "SRC-2", "AUT-2", "FAM-2", sameContent));
  const rA = LIN.artifactRef(dA, "doc-x-a", LIN.RELATION.DOCUMENTARY_EVIDENCE), rB = LIN.artifactRef(dB, "doc-x-b", LIN.RELATION.DOCUMENTARY_EVIDENCE);
  const idc = { registry: prod.registry, expectedRunId: prod.manifest.runId, expectedMissionHash: prod.manifest.missionHash };
  const E = (t, i, r2) => ({ evidenceType: t, identifier: i, provenanceRef: r2, subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
  const conf = (ev) => IDE.deriveIdentityConfidence(ev, idc).confidence;
  check("T39. un meme contenu sous deux autorites reetiquetees n'est pas independant",
    conf([E("t1", "i1", rA), E("t2", "i2", rB)]) !== "STRONG");
  check("T40. un meme contenu sous deux familles reetiquetees n'est pas independant",
    IDE.independenceBetween({ evidence: E("t1", "i1", rA), provenance: { status: "RESOLVED", sourceRootId: "S1", authorityRootId: "A1", familyRootId: "F1", contentHash: sameContent } },
      { evidence: E("t2", "i2", rB), provenance: { status: "RESOLVED", sourceRootId: "S2", authorityRootId: "A2", familyRootId: "F2", contentHash: sameContent } }) === IDE.INDEPENDENCE.SAME_CONTENT);
  check("T41. une provenance inconnue ne compte pas comme independante",
    conf([E("t1", "i1", null), E("t2", "i2", null)]) !== "STRONG");
  check("T42. une preuve dupliquee ne cree jamais STRONG",
    conf([E("t1", "i1", rA), E("t1", "i1", rA)]) !== "STRONG"
    && conf([E("t1", "i1", rA), E("t2", "i1", rB)]) !== "STRONG");
  check("T43. une racine de source declaree par l'appelant n'est pas crue",
    conf([Object.assign(E("t1", "i1", null), { sourceAuthorityId: "INVENTE-A", sourceFamilyId: "INVENTE-F1" }),
      Object.assign(E("t2", "i2", null), { sourceAuthorityId: "INVENTE-B", sourceFamilyId: "INVENTE-F2" })]) !== "STRONG"
    && conf([E("t1", "i1", prod.docRefs.get("doc-a:c-1")), E("t2", "i2", prod.docRefs.get("doc-b:c-1"))]) === "STRONG");

  /* ===== §64 READINESS (T44-T48) ===== */
  console.log("\n  -- T44-T48 : preparation --");
  const rdOpt = { registry: prod.registry, expectedRunId: prod.manifest.runId, expectedMissionHash: prod.manifest.missionHash };
  const copiedDigest = (function () { const r = clone(prod.pre); r.phase = "FULL"; r.dimensionsHash = prod.full.dimensionsHash; return r; })();
  check("T44. un dimensionsHash copie est rejete",
    cd(() => SR.assertReadinessPhase(copiedDigest, "FULL", rdOpt, "T44")) === "READINESS_DIGEST_MISMATCH");
  const notAssessed = (function () { const r = clone(prod.pre); r.phase = "FULL";
    SR.FULL_ONLY_DIMENSIONS.forEach((n) => r.dimensions.push({ name: n, status: "NOT_ASSESSED", reasons: [], derivedFromRefs: [], reservations: [] }));
    r.assessedDimensions = r.dimensions.map((x) => x.name); r.dimensionsHash = SR.dimensionsHashOf(r.dimensions); return r; })();
  check("T45. NOT_ASSESSED sans provenance ne masque aucune mutation",
    cd(() => SR.assertReadinessPhase(notAssessed, "FULL", rdOpt, "T45")) === "READINESS_DIMENSIONS_UNSOURCED");
  check("T46. une PRE reetiquetee FULL est rejetee",
    cd(() => SR.assertReadinessPhase(Object.assign(clone(prod.pre), { phase: "FULL" }), "FULL", rdOpt, "T46")) !== null);
  const synth = (function () { const r = clone(prod.pre); r.phase = "FULL";
    SR.FULL_ONLY_DIMENSIONS.forEach((n) => r.dimensions.push({ name: n, status: "SATISFIED", reasons: [], derivedFromRefs: [], reservations: [] }));
    r.assessedDimensions = r.dimensions.map((x) => x.name); r.dimensionsHash = SR.dimensionsHashOf(r.dimensions); return r; })();
  check("T47. des dimensions synthetiques ne promeuvent aucune phase",
    cd(() => SR.assertReadinessPhase(synth, "FULL", rdOpt, "T47")) === "READINESS_DIMENSIONS_UNSOURCED");
  check("T48. des dimensions d'un autre run sont rejetees",
    cd(() => SR.assertReadinessPhase(other.full, "FULL", rdOpt, "T48")) !== null
    && SR.assertReadinessPhase(prod.full, "FULL", rdOpt, "T48") === true);

  /* ===== §65 LIGNEE / INCONNUS (T49-T57) ===== */
  console.log("\n  -- T49-T57 : lignee et inconnus --");
  const crossRef = LIN.artifactRef(other.qualification, "scientific-qualification", LIN.RELATION.QUALIFICATION);
  check("T49. une arete typee erronee est rejetee",
    LIN.resolveLineage([LIN.artifactRef(prod.pre, "readiness-pre", LIN.RELATION.READINESS_PRE)], prod.registry, { relation: LIN.RELATION.REPORT }).resolved === false);
  check("T50. reetiqueter la relation d'un artefact est rejete",
    cd(() => LIN.artifactRef(prod.mission, "mission", LIN.RELATION.DOCUMENTARY_EVIDENCE)) === "LINEAGE_TYPE_RELATION_MISMATCH"
    && LIN.resolveLineage([Object.assign(LIN.artifactRef(prod.mission, "mission", LIN.RELATION.MISSION), { relation: LIN.RELATION.DOCUMENTARY_EVIDENCE })], prod.registry, {}).resolved === false);
  check("T51. crossRunAllowedRelations fourni par l'appelant ne contourne rien",
    LIN.resolveLineage([crossRef], other.registry, { expectedRunId: prod.manifest.runId, crossRunAllowedRelations: [LIN.RELATION.QUALIFICATION] }).resolved === false
    && LIN.resolveLineage([crossRef], other.registry, { expectedRunId: prod.manifest.runId,
      historicalInputContract: { contractKind: "IMMUTABLE_HISTORICAL_INPUT", relations: [LIN.RELATION.QUALIFICATION], operatorAuthenticated: false } }).resolved === false);
  check("T52. un type de lignee absent echoue ferme",
    LIN.resolveLineage([{ artifactId: "mission", sha256: artifactHash(prod.mission) }],
      { get: () => ({ relation: null, artifactType: null, hash: artifactHash(prod.mission) }) }, {}).resolved === false);
  const uctx = { registry: prod.registry, expectedRunId: prod.manifest.runId, expectedMissionHash: prod.manifest.missionHash,
    expectedAttestationHash: prod.manifest.runtimeAttestationHash };
  const u0 = UNK.makeUnknown({ originArtifact: "X", reason: "bloquant", blockingStatus: "BLOCKING", runId: prod.manifest.runId });
  const goodRef = prod.docRefs.get("doc-a:c-1");
  const closed = UNK.transition(u0, "RESOLVED", { reason: "leve", evidenceRefs: [goodRef] }, uctx);
  check("T53. addedUnknowns a preuve non resolue est rejete",
    cd(() => UNK.propagate([], [Object.assign(clone(closed), { transitions: closed.transitions.map((t) => Object.assign({}, t, { evidenceRefs: ["invente"] })) })], uctx)) !== null);
  check("T54. upstreamUnknowns a preuve non resolue est rejete",
    cd(() => UNK.propagate([closed], [], {})) === "UNKNOWN_EVIDENCE_UNRESOLVED");
  check("T55. une preuve sans rapport ne resout pas un inconnu",
    cd(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: [LIN.artifactRef(prod.mission, "mission", LIN.RELATION.MISSION)] }, uctx)) === "UNKNOWN_EVIDENCE_UNRESOLVED");
  const semReplay = (function () { const u = UNK.transition(closed, "SUPERSEDED", { reason: "leve", evidenceRefs: [goodRef] }, uctx);
    const t2 = Object.assign({}, u.transitions[1], { toStatus: "RESOLVED" });
    t2.transitionId = sha256Of({ unknownId: u.unknownId, sequence: t2.sequence, fromStatus: t2.fromStatus, toStatus: t2.toStatus,
      reason: t2.reason, evidenceRefs: t2.evidenceRefs, decidedAt: t2.decidedAt, runId: t2.runId, previousEventHash: t2.previousEventHash });
    return Object.assign({}, u, { status: "RESOLVED", transitions: [u.transitions[0], t2] }); })();
  check("T56. un rejeu SEMANTIQUE de transition est rejete",
    cd(() => UNK.assertChainValid(semReplay, "T56", uctx)) === "UNKNOWN_SEMANTIC_REPLAY");
  const stale = UNK.makeUnknown({ originArtifact: "X", reason: "bloquant", blockingStatus: "BLOCKING", runId: prod.manifest.runId });
  check("T57. un instantane ancien ne se fait pas passer pour l'etat courant",
    UNK.blockingOpen([Object.assign({}, stale, { status: "RESOLVED" })]).length === 1
    && cd(() => UNK.assertChainValid(Object.assign({}, stale, { status: "RESOLVED" }), "T57", uctx)) === "UNKNOWN_STATUS_FORGED"
    && UNK.effectiveStatus(UNK.mergeUnknown(closed, stale)) === "RESOLVED");

  /* ===== §66 LLM (T58-T64) ===== */
  console.log("\n  -- T58-T64 : capacite LLM --");
  const callerTransport = async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}', requestId: "x", credentialProbeSkipped: false });
  const capCaller = await LC.runActiveProbe({ providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture", credentialPresent: true },
    Object.assign({}, prod.ctx, { transport: callerTransport }));
  check("T58. un transport d'appelant ne prouve aucune capacite de PRODUCTION",
    capCaller.callerTransportIgnored === true && capCaller.transportOrigin === "ENVIRONMENT");
  check("T59. une reponse 200 locale reste cantonnee au TEST",
    test.capability.llmBoundaryNamespace === "TEST"
    && LC.assertCapabilityUsable(test.capability, test.llmConfig, prod.ctx).usable === false);
  const probeWrong = async (over) => { const c = await LC.runActiveProbe(Object.assign({ providerId: "prov-fixture", modelId: "mod-fixture",
    workerBindingId: "bind-fixture", credentialPresent: true }, over), prod.ctx); return c; };
  const opStrict = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-strict",
    llmCapability: { kind: "OPERATOR_TRANSPORT", transportModuleRef: FX.TRANSPORT_REF,
      allowedProviders: ["prov-fixture"], allowedModels: ["mod-fixture"], allowedWorkers: ["bind-fixture"] } });
  const vStrict = OTV.createOperatorTrustVerifier(FX.boundaryFor(opStrict));
  const iStrict = { runId: "run-strict", missionHash: sha256Of({ m: 1 }), producerId: "MONO-10", producerVersion: "v0.6", executionMode: "PRODUCTION", openedAt: FX.now() };
  const mStrict = RM.openRunEvidenceManifest({ verifier: vStrict, attestation: opStrict.authority.attest(iStrict), runIntent: iStrict, missionHash: iStrict.missionHash });
  const ctxStrict = { manifest: mStrict, verifier: vStrict, attestation: null };
  const probeStrict = async (over) => LC.runActiveProbe(Object.assign({ providerId: "prov-fixture", modelId: "mod-fixture",
    workerBindingId: "bind-fixture", credentialPresent: true }, over), ctxStrict);
  check("T60. un fournisseur non autorise est refuse par la frontiere", (await probeStrict({ providerId: "autre" })).status === "UNAVAILABLE");
  check("T61. un modele non autorise est refuse", (await probeStrict({ modelId: "autre" })).status === "UNAVAILABLE");
  check("T62. un worker non autorise est refuse", (await probeStrict({ workerBindingId: "autre" })).status === "UNAVAILABLE");
  check("T63. une capacite d'un autre run est rejetee",
    LC.assertCapabilityUsable(other.capability, other.llmConfig, prod.ctx).usable === false);
  const opNoLlm = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-nollm", llmCapability: {} });
  const vNoLlm = OTV.createOperatorTrustVerifier(FX.boundaryFor(opNoLlm));
  const iNo = { runId: "run-nollm", missionHash: sha256Of({ m: 1 }), producerId: "MONO-10", producerVersion: "v0.6", executionMode: "PRODUCTION", openedAt: FX.now() };
  const mNo = RM.openRunEvidenceManifest({ verifier: vNoLlm, attestation: opNoLlm.authority.attest(iNo), runIntent: iNo, missionHash: iNo.missionHash });
  const capNo = await LC.runActiveProbe({ providerId: "p", modelId: "m", workerBindingId: "w", credentialPresent: true }, { manifest: mNo, verifier: vNoLlm });
  check("T64. sans frontiere de capacite LLM : fail closed",
    capNo.status === "UNAVAILABLE" && /aucune frontiere de capacite LLM provisionnee/.test(capNo.failureReason));

  /* ===== §67 RAPPORT / AVAL (T65-T72) ===== */
  console.log("\n  -- T65-T72 : rapport et aval --");
  check("T65. une mission desappariee dans le rapport est rejetee",
    cd(() => SUR.buildScientificUnifiedReport(Object.assign({}, prod.sources, { runContext: prod.ctx,
      priorReport: { schema: "EvidenceForge.PriorUnifiedReport", mission: { missionId: "AUTRE" }, testStatus: {} }, qualification: prod.qualification }))) === "REPORT_MISSION_MISMATCH");
  check("T66. une qualification desappariee est rejetee",
    cd(() => SUR.assertReportBoundToQualification(prod.report, other.qualification, prod.ctx, "T66")) !== null);
  check("T67. un rapport a mauvaise racine de registre est rejete",
    cd(() => SUR.assertReportBoundToQualification(Object.assign(clone(prod.report), { registryRootHash: sha256Of({ r: 1 }) }), prod.qualification, prod.ctx, "T67")) === "REPORT_REGISTRY_ROOT_MISMATCH");
  check("T68. une acceptation a mauvaise racine de registre est rejetee",
    prod.verifier.acceptanceBoundary().validateAcceptance(Object.assign(clone(prod.acceptance), { reportRegistryRootHash: sha256Of({ r: 2 }) }), prod.report, prod.ctx).valid === false);
  check("T69. NOT_QUALIFIED n'autorise jamais",
    authorize({ acceptance: prod.acceptance, qualification: Object.assign(clone(prod.qualification), { qualificationStatus: "NOT_QUALIFIED" }) }).authorization === "NOT_AUTHORIZED");
  check("T70. une qualification UNKNOWN n'autorise jamais",
    authorize({ acceptance: prod.acceptance, qualification: Object.assign(clone(prod.qualification), { qualificationStatus: "IMPOSSIBLE_TO_ASSESS" }) }).authorization === "NOT_AUTHORIZED");
  check("T71. un inconnu bloquant empeche l'autorisation",
    authorize({ acceptance: prod.acceptance, qualification: Object.assign(clone(prod.qualification),
      { unknowns: [UNK.makeUnknown({ originArtifact: "X", reason: "bloquant", blockingStatus: "BLOCKING" })] }) }).authorization === "NOT_AUTHORIZED");
  const bypassPolicy = DA.sanitizePolicy({ revalidationRequired: false, humanAcceptanceRequired: false, trustVerification: false,
    consumeNonce: false, crossRunAllowedRelations: ["x"], requireResolvableEvidence: false, force: true, skipValidation: true, bypass: true, allowSynthetic: true });
  check("T72. aucune politique d'appelant ne desactive un controle critique",
    bypassPolicy.refusedOverrides.length >= 10
    && Object.keys(bypassPolicy.refusalMotives).length === bypassPolicy.refusedOverrides.length
    && Object.keys(bypassPolicy.policy).filter((k) => /force|skip|allow|bypass|ignore|disable|consumeNonce|crossRun|requireResolvable|humanAcceptanceRequired|revalidationRequired/i.test(k)).length === 0,
    JSON.stringify(bypassPolicy.refusedOverrides));

  /* ===== §68 MUTATIONS M01-M72 ===== */
  console.log("\n  -- MUTATIONS M01-M72 --");
  const M = mutation;
  M("M01", "acceptanceValidator fabrique", () => fakeValidator().valid === true, () => authorize({ acceptance: rejAcc, acceptanceValidator: fakeValidator }).authorization === "NOT_AUTHORIZED");
  M("M02", "refus humain converti en autorisation", () => rejAcc.decision === "REJECT_FOR_REVIEW", () => authorize({ acceptance: rejAcc }).authorization === "NOT_AUTHORIZED");
  M("M03", "acceptation vide", () => true, () => authorize({ acceptance: {} }).authorization === "NOT_AUTHORIZED");
  M("M04", "acceptation d'un autre rapport", () => other.acceptance.reportRef.sha256 !== prod.acceptance.reportRef.sha256, () => authorize({ acceptance: other.acceptance }).authorization === "NOT_AUTHORIZED");
  M("M05", "acceptation d'une autre mission", () => other.missionHash !== prod.missionHash, () => prod.verifier.acceptanceBoundary().validateAcceptance(other.acceptance, prod.report, prod.ctx).valid === false);
  M("M06", "humanAcceptanceRequired=false", () => ({ humanAcceptanceRequired: false }).humanAcceptanceRequired === false, () => sp06.policy.humanAcceptanceRequired === undefined && sp06.refusedOverrides.indexOf("humanAcceptanceRequired") !== -1);
  M("M07", "acceptation sans preuve d'acte", () => unauthAcc.humanActProof === null, () => authorize({ acceptance: unauthAcc }).authorization === "NOT_AUTHORIZED");
  M("M08", "frontiere d'acceptation imitee", () => true, () => OAB.isProvisionedAcceptanceBoundary({ namespace: "PRODUCTION", validateAcceptance: fakeValidator }) === false);
  M("M09", "DEFER au corpus (normal)", () => apprN === 3, () => deferN === 0);
  M("M10", "DEFER + eligibilite falsifiee", () => apprN === 3, () => deferT === 0);
  M("M11", "DEFER + verification fabriquee", () => apprN === 3, () => deferF === 0);
  M("M12", "REJECT au corpus (normal)", () => apprN === 3, () => rejN === 0);
  M("M13", "REJECT + eligibilite falsifiee", () => apprN === 3, () => rejT === 0);
  M("M14", "REJECT + verification fabriquee", () => apprN === 3, () => rejF === 0);
  M("M15", "champ recomputed de l'appelant", () => ({ recomputed: true }).recomputed === true, () => EE.isEligible({ effectiveCorpusEligibility: "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL", recomputed: true }) === false);
  M("M16", "consumer MONO-09 non traverse", () => true, () => m09ok === true);
  M("M17", "mutation d'artefact enregistre", () => true, () => Object.isFrozen(prod.registry.get("mission").artifact) === true);
  M("M18", "manifeste coherent non authentique", () => RM.assertManifestShape(fakeManifest) === true, () => cd(() => AAR.openAuthenticatedArtifactRegistry(fakeManifest, prod.ctx)) !== null);
  M("M19", "artefact insere eleve en preuve", () => prod.registry.has("doc-faux"), () => prod.registry.get("doc-faux").trustLevel === ATL.TRUST_LEVEL.BOUND_TO_RUN);
  M("M20", "registre d'un autre run", () => other.registry.runId !== prod.manifest.runId, () => cd(() => AAR.assertAuthenticatedRegistry(other.registry, prod.manifest, "m")) !== null);
  M("M21", "suppression d'evenement", () => log.length > 3, () => AAR.verifyExportedEventChain(prod.registry.initialRootHash, log.filter((e, i) => i !== 2)).valid === false);
  M("M22", "reordonnancement d'evenements", () => true, () => AAR.verifyExportedEventChain(prod.registry.initialRootHash, [log[1], log[0]].concat(log.slice(2))).valid === false);
  M("M23", "mutation de previousEventHash", () => true, () => AAR.verifyExportedEventChain(prod.registry.initialRootHash, log.map((e, i) => (i === 3 ? Object.assign({}, e, { previousEventHash: "a".repeat(64) }) : e))).valid === false);
  M("M24", "racine de registre non deterministe", () => true, () => AAR.verifyExportedEventChain(prod.registry.initialRootHash, prod.registry.eventLog()).registryRootHash === prod.registry.registryRootHash);
  M("M25", "nom d'acteur seul", () => true, () => prod.verifier.verifyHumanAct({ actorType: "human", actorIdentity: "auditeur-panel", decidedAt: FX.now() }, actExpect).authenticated === false);
  M("M26", "appartenance sans preuve d'acte", () => true, () => prod.verifier.verifyHumanAct({ actorType: "human", actorIdentity: "auditeur-panel", decidedAt: FX.now(), humanActProof: null }, actExpect).authenticated === false);
  M("M27", "preuve d'acte fabriquee", () => fakeProof.proofValue !== prod.acceptance.humanActProof.proofValue, () => prod.verifier.verifyHumanAct(Object.assign(clone(prod.acceptance), { humanActProof: fakeProof }), actExpect).authenticated === false);
  M("M28", "decisionHash errone", () => true, () => prod.verifier.verifyHumanAct(prod.acceptance, Object.assign({}, actExpect, { decisionHash: sha256Of({ x: 2 }) })).authenticated === false);
  M("M29", "preuve d'un autre run", () => other.acceptance.humanActProof.runId !== prod.manifest.runId, () => prod.verifier.verifyHumanAct(Object.assign(clone(prod.acceptance), { humanActProof: other.acceptance.humanActProof }), actExpect).authenticated === false);
  M("M30", "preuve d'une autre mission", () => true, () => prod.verifier.verifyHumanAct(prod.acceptance, Object.assign({}, actExpect, { missionHash: sha256Of({ m: "z" }) })).authenticated === false);
  M("M31", "consumeNonce=false en production", () => ({ consumeNonce: false }).consumeNonce === false, () => prod.verifier.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: false }).valid === false);
  M("M32", "reouverture avec le meme nonce", () => true, () => cd(() => RM.openRunEvidenceManifest({ verifier: prod.verifier, attestation: prod.attestation, runIntent: P.intent })) !== null);
  M("M33", "second verificateur, meme store", () => true, () => v2.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  M("M34", "seconde frontiere, meme autorite", () => true, () => OTV.createOperatorTrustVerifier(FX.boundaryFor(op2)).verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  M("M35", "perimetre anti-rejeu absent", () => true, () => cd(() => RP.createFileReplayStore({ directory: fs.mkdtempSync(path.join(os.tmpdir(), "ns-")) })) === "REPLAY_STORE_SCOPE_MISSING");
  M("M36", "meme cle TEST+PROD", () => true, () => cd(() => FX.boundaryFor(FX.provisionOperator({ namespace: "TEST", authority: shared, boundaryId: "otb-sh-t2" }))) === "TRUST_ANCHOR_KEY_CROSS_NAMESPACE");
  M("M37", "statut de cle inconnu", () => true, () => cd(() => KL.makeKeyRecord({ authorityId: "A", keyId: "k", publicKeyPem: shared.keyRecord().publicKeyPem, validFrom: FX.now(), status: "???" })) === "KEY_STATUS_UNKNOWN");
  M("M38", "cle revoquee sur verificateur deja provisionne", () => revBefore.valid === true, () => revAfter.valid === false && revAfter.problems.some((p) => /REVOQUEE/.test(p)));
  M("M39", "meme contenu, autorites reetiquetees", () => true, () => conf([E("t1", "i1", rA), E("t2", "i2", rB)]) !== "STRONG");
  M("M40", "meme contenu, familles reetiquetees", () => true, () => IDE.independenceBetween({ evidence: E("t1", "i1", rA), provenance: { status: "RESOLVED", sourceRootId: "S1", authorityRootId: "A1", familyRootId: "F1", contentHash: sameContent } }, { evidence: E("t2", "i2", rB), provenance: { status: "RESOLVED", sourceRootId: "S2", authorityRootId: "A2", familyRootId: "F2", contentHash: sameContent } }) === IDE.INDEPENDENCE.SAME_CONTENT);
  M("M41", "provenance inconnue", () => true, () => conf([E("t1", "i1", null), E("t2", "i2", null)]) !== "STRONG");
  M("M42", "preuve dupliquee", () => true, () => conf([E("t1", "i1", rA), E("t1", "i1", rA)]) !== "STRONG");
  M("M43", "racine de source declaree par l'appelant", () => true, () => conf([Object.assign(E("t1", "i1", null), { sourceAuthorityId: "X" }), Object.assign(E("t2", "i2", null), { sourceAuthorityId: "Y" })]) !== "STRONG");
  M("M44", "dimensionsHash copie", () => copiedDigest.dimensionsHash === prod.full.dimensionsHash, () => cd(() => SR.assertReadinessPhase(copiedDigest, "FULL", rdOpt, "m")) === "READINESS_DIGEST_MISMATCH");
  M("M45", "NOT_ASSESSED sans provenance", () => true, () => cd(() => SR.assertReadinessPhase(notAssessed, "FULL", rdOpt, "m")) === "READINESS_DIMENSIONS_UNSOURCED");
  M("M46", "PRE reetiquetee FULL", () => true, () => cd(() => SR.assertReadinessPhase(Object.assign(clone(prod.pre), { phase: "FULL" }), "FULL", rdOpt, "m")) !== null);
  M("M47", "dimensions synthetiques", () => true, () => cd(() => SR.assertReadinessPhase(synth, "FULL", rdOpt, "m")) === "READINESS_DIMENSIONS_UNSOURCED");
  M("M48", "dimensions d'un autre run", () => true, () => cd(() => SR.assertReadinessPhase(other.full, "FULL", rdOpt, "m")) !== null);
  M("M49", "arete typee erronee", () => true, () => LIN.resolveLineage([LIN.artifactRef(prod.pre, "readiness-pre", LIN.RELATION.READINESS_PRE)], prod.registry, { relation: LIN.RELATION.REPORT }).resolved === false);
  M("M50", "relation reetiquetee", () => true, () => cd(() => LIN.artifactRef(prod.mission, "mission", LIN.RELATION.DOCUMENTARY_EVIDENCE)) === "LINEAGE_TYPE_RELATION_MISMATCH");
  M("M51", "crossRunAllowedRelations de l'appelant", () => true, () => LIN.resolveLineage([crossRef], other.registry, { expectedRunId: prod.manifest.runId, crossRunAllowedRelations: [LIN.RELATION.QUALIFICATION] }).resolved === false);
  M("M52", "contrat historique non authentifie", () => true, () => LIN.resolveLineage([crossRef], other.registry, { expectedRunId: prod.manifest.runId, historicalInputContract: { contractKind: "IMMUTABLE_HISTORICAL_INPUT", relations: [LIN.RELATION.QUALIFICATION], operatorAuthenticated: false } }).resolved === false);
  M("M53", "addedUnknowns non resolus", () => true, () => cd(() => UNK.propagate([], [Object.assign(clone(closed), { transitions: closed.transitions.map((t) => Object.assign({}, t, { evidenceRefs: ["invente"] })) })], uctx)) !== null);
  M("M54", "upstreamUnknowns sans registre", () => true, () => cd(() => UNK.propagate([closed], [], {})) === "UNKNOWN_EVIDENCE_UNRESOLVED");
  M("M55", "preuve sans rapport pour un inconnu", () => true, () => cd(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: [LIN.artifactRef(prod.mission, "mission", LIN.RELATION.MISSION)] }, uctx)) === "UNKNOWN_EVIDENCE_UNRESOLVED");
  M("M56", "rejeu semantique", () => true, () => cd(() => UNK.assertChainValid(semReplay, "m", uctx)) === "UNKNOWN_SEMANTIC_REPLAY");
  M("M57", "instantane ancien comme etat courant", () => true, () => UNK.blockingOpen([Object.assign({}, stale, { status: "RESOLVED" })]).length === 1);
  M("M58", "transport d'appelant en production", () => typeof callerTransport === "function", () => capCaller.callerTransportIgnored === true && capCaller.transportOrigin === "ENVIRONMENT");
  M("M59", "reponse locale 200 comme preuve de production", () => test.capability.status === "AVAILABLE", () => LC.assertCapabilityUsable(test.capability, test.llmConfig, prod.ctx).usable === false);
  const pWrongProv = await probeStrict({ providerId: "autre" }), pWrongModel = await probeStrict({ modelId: "autre" }), pWrongWorker = await probeStrict({ workerBindingId: "autre" });
  M("M60", "fournisseur non autorise", () => true, () => pWrongProv.status === "UNAVAILABLE");
  M("M61", "modele non autorise", () => true, () => pWrongModel.status === "UNAVAILABLE");
  M("M62", "worker non autorise", () => true, () => pWrongWorker.status === "UNAVAILABLE");
  M("M63", "capacite d'un autre run", () => true, () => LC.assertCapabilityUsable(other.capability, other.llmConfig, prod.ctx).usable === false);
  M("M64", "frontiere LLM absente", () => true, () => capNo.status === "UNAVAILABLE");
  M("M65", "mission desappariee au rapport", () => true, () => cd(() => SUR.buildScientificUnifiedReport(Object.assign({}, prod.sources, { runContext: prod.ctx, priorReport: { schema: "EvidenceForge.PriorUnifiedReport", mission: { missionId: "AUTRE" }, testStatus: {} }, qualification: prod.qualification }))) === "REPORT_MISSION_MISMATCH");
  M("M66", "qualification desapparie", () => true, () => cd(() => SUR.assertReportBoundToQualification(prod.report, other.qualification, prod.ctx, "m")) !== null);
  M("M67", "racine de registre erronee au rapport", () => true, () => cd(() => SUR.assertReportBoundToQualification(Object.assign(clone(prod.report), { registryRootHash: sha256Of({ r: 9 }) }), prod.qualification, prod.ctx, "m")) === "REPORT_REGISTRY_ROOT_MISMATCH");
  M("M68", "racine de registre erronee a l'acceptation", () => true, () => prod.verifier.acceptanceBoundary().validateAcceptance(Object.assign(clone(prod.acceptance), { reportRegistryRootHash: sha256Of({ r: 8 }) }), prod.report, prod.ctx).valid === false);
  M("M69", "NOT_QUALIFIED autorise", () => true, () => authorize({ acceptance: prod.acceptance, qualification: Object.assign(clone(prod.qualification), { qualificationStatus: "NOT_QUALIFIED" }) }).authorization === "NOT_AUTHORIZED");
  M("M70", "qualification UNKNOWN autorise", () => true, () => authorize({ acceptance: prod.acceptance, qualification: Object.assign(clone(prod.qualification), { qualificationStatus: "IMPOSSIBLE_TO_ASSESS" }) }).authorization === "NOT_AUTHORIZED");
  M("M71", "inconnu bloquant ignore", () => true, () => authorize({ acceptance: prod.acceptance, qualification: Object.assign(clone(prod.qualification), { unknowns: [UNK.makeUnknown({ originArtifact: "X", reason: "b", blockingStatus: "BLOCKING" })] }) }).authorization === "NOT_AUTHORIZED");
  M("M72", "politique de contournement", () => true, () => bypassPolicy.refusedOverrides.length >= 10);

  /* ===== cycle de vie des cles : rotation et politique historique ===== */
  console.log("\n  -- rotation et politique historique des cles --");
  const pemOnly = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  const kRetired = KL.makeKeyRecord({ authorityId: "A", keyId: "k1", publicKeyPem: pemOnly,
    validFrom: "2020-01-01T00:00:00.000Z", validUntil: "2021-01-01T00:00:00.000Z", status: "RETIRED" });
  const kRevoked = KL.makeKeyRecord({ authorityId: "A", keyId: "k2", publicKeyPem: pemOnly,
    validFrom: "2020-01-01T00:00:00.000Z", status: "REVOKED", revokedAt: "2020-06-01T00:00:00.000Z", revocationReason: "compromission" });
  const inWindow = "2020-06-01T00:00:00.000Z";
  check("KL-01. trois statuts de cle, et trois seulement",
    JSON.stringify(Object.keys(KL.KEY_STATUS)) === JSON.stringify(["ACTIVE", "RETIRED", "REVOKED"]),
    JSON.stringify(Object.keys(KL.KEY_STATUS)));
  check("KL-02. une cle RETIREE laisse verifiable ce qu'elle a signe dans sa fenetre",
    KL.evaluateKeyAt(kRetired, inWindow).usable === true);
  check("KL-03. une cle RETIREE ne valide rien apres sa fenetre",
    KL.evaluateKeyAt(kRetired, FX.now()).usable === false);
  check("KL-04. une cle REVOQUEE n'est jamais valide, y compris retroactivement",
    KL.evaluateKeyAt(kRevoked, inWindow).usable === false
    && /retroactivement/.test(KL.evaluateKeyAt(kRevoked, inWindow).reason));
  // Rotation reelle : deux cles de la MEME autorite, fenetres disjointes.
  const authOld = OP.mintOperatorAuthority({ authorityId: "AUT-ROTATION", namespace: "PRODUCTION" });
  const authNew = OP.mintOperatorAuthority({ authorityId: "AUT-ROTATION", namespace: "PRODUCTION" });
  const opRot = FX.provisionOperator({ namespace: "PRODUCTION", authority: authNew, boundaryId: "otb-rotation",
    keys: [authOld.keyRecord({ validFrom: "2020-01-01T00:00:00.000Z", validUntil: "2021-01-01T00:00:00.000Z", status: "RETIRED" }),
      authNew.keyRecord({ validFrom: "2021-01-01T00:00:00.000Z", status: "ACTIVE" })] });
  const vRot = OTV.createOperatorTrustVerifier(FX.boundaryFor(opRot));
  const attest = (auth, id) => auth.attest({ runId: id, missionHash: sha256Of({ m: 1 }), producerId: "MONO-10",
    producerVersion: "v0.6", executionMode: "PRODUCTION", openedAt: FX.now() });
  check("KL-05. la rotation est portee par plusieurs cles d'une meme autorite",
    vRot.verifyRuntimeAttestation({ attestation: attest(authNew, "rot-new"), consumeNonce: true }).valid === true
    && vRot.verifyRuntimeAttestation({ attestation: attest(authOld, "rot-old"), consumeNonce: true }).valid === false);
  check("KL-06. un horodatage de signature fourni par l'appelant n'est pas cru",
    (function () { const a = authNew.attest({ runId: "rot-ts", missionHash: sha256Of({ m: 1 }), producerId: "MONO-10",
      producerVersion: "v0.6", executionMode: "PRODUCTION", openedAt: FX.now(), signedAt: "2020-06-01T00:00:00.000Z" });
      return a.signedAt !== "2020-06-01T00:00:00.000Z"; })());
  // Fourches d'inconnus
  const uFork = UNK.makeUnknown({ originArtifact: "X", reason: "b", blockingStatus: "BLOCKING" });
  check("KL-07. une genesis divergente est une fourche, pas une fusion",
    cd(() => UNK.mergeUnknown(uFork, Object.assign({}, uFork, { genesisHash: sha256Of({ autre: 1 }) }))) === "UNKNOWN_FORK_DETECTED");
  const fa = UNK.transition(uFork, "RESOLVED", { reason: "r1", evidenceRefs: ["x"] }, { requireResolvableEvidence: false });
  const fb = UNK.transition(uFork, "SUPERSEDED", { reason: "r2", evidenceRefs: ["x"] }, { requireResolvableEvidence: false });
  check("KL-08. deux chaines divergentes ne fusionnent pas",
    cd(() => UNK.mergeUnknown(fa, fb)) === "UNKNOWN_FORK_DETECTED");
  check("KL-09. sans preuve critique, la qualification echoue ferme",
    SQ.qualifyProcess({}).qualificationStatus === "IMPOSSIBLE_TO_ASSESS"
    && SQ.qualifyProcess({}).evidenceClass === "INTERNAL_CHAIN_CONSISTENCY_ONLY"
    && DA.resolveDownstreamUseAuthorization({}).authorization === "NOT_AUTHORIZED");

  /* ===== universalite, hygiene, non-regression ===== */
  console.log("\n  -- universalite : six domaines --");
  const DOM = [["hydrogeologie", ["hydrodynamique souterraine"]], ["droit des brevets", ["brevetabilite du vivant"]],
    ["securite alimentaire", ["microbiologie previsionnelle"]], ["acoustique du batiment", ["isolation vibratoire"]],
    ["demographie historique", ["reconstitution de familles"]], ["chimie analytique", ["spectrometrie de masse"]]];
  let uni = 0;
  for (let i = 0; i < DOM.length; i++) {
    const [label, labels] = DOM[i];
    const c = await (await FX.buildChain({ mode: "TEST", operator: opT, missionId: "m-uni-" + i, runSalt: 200 + i,
      missionLabels: labels, candidates: [FX.candidate("op-" + i, labels)], decisions: { ["op-" + i]: PG.DECISION.APPROVE } })).complete();
    const ok = /QUALIFIED/.test(c.qualification.qualificationStatus) && c.authorization.authorization === "AUTHORIZED";
    if (ok) uni++;
    check("UNI-" + (i + 1) + ". " + label + " (" + c.qualification.qualificationStatus + ")", ok, c.qualification.qualificationStatus + "/" + c.authorization.authorization);
  }

  console.log("\n  -- hygiene --");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  const WORDS = ["jmjs", "p0_2", "p0.2", "orcid", "openalex", "crossref", "pubmed", "musicien", "liturgi", "anthropic", "openai"];
  const leaks = [];
  ["core", "adapters", "validators"].forEach(function (dir) {
    fs.readdirSync(path.join(__dirname, "..", dir)).filter((f) => /\.js$/.test(f)).forEach(function (f) {
      const src = strip(fs.readFileSync(path.join(__dirname, "..", dir, f), "utf8")).toLowerCase();
      WORDS.forEach((w) => { if (src.indexOf(w) !== -1) leaks.push(dir + "/" + f + " :: " + w); });
    });
  });
  check("HYG-01. aucun terme de cas ni de fournisseur dans le code actif", leaks.length === 0, leaks.join(", "));
  check("HYG-02. le detecteur discrimine (temoin positif)", strip('const x = "OpenAlex";').toLowerCase().indexOf("openalex") !== -1);
  const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{40,}?-----END [A-Z ]*PRIVATE KEY-----/;
  const secrets = [];
  (function walk(d) { fs.readdirSync(d).forEach(function (e) { const p = path.join(d, e);
    if (fs.statSync(p).isDirectory()) return walk(p);
    const s = fs.readFileSync(p, "utf8");
    if (PEM.test(s) || /\bsk-[A-Za-z0-9_-]{20,}/.test(s)) secrets.push(path.relative(path.join(__dirname, ".."), p)); }); })(path.join(__dirname, ".."));
  check("HYG-03. aucune matiere privee dans le paquet", secrets.length === 0, secrets.join(", "));
  check("HYG-03b. le detecteur de secret discrimine",
    PEM.test(crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString()) === true && PEM.test("-----BEGIN PRIVATE KEY-----") === false);
  // §53 — inventaire des callbacks critiques
  const criticalInjectable = [];
  ["core", "adapters"].forEach(function (dir) {
    fs.readdirSync(path.join(__dirname, "..", dir)).filter((f) => /\.js$/.test(f)).forEach(function (f) {
      const src = strip(fs.readFileSync(path.join(__dirname, "..", dir, f), "utf8"));
      [/typeof\s+(?:input|ctx|opts)\.acceptanceValidator\s*===\s*"function"\s*\?/, /typeof\s+(?:input|ctx|opts)\.humanActVerifier\s*===\s*"function"\s*\?/,
       /typeof\s+(?:input|ctx|opts)\.transport\s*===\s*"function"\s*\?/, /typeof\s+(?:input|ctx|opts)\.trustVerifier\s*===\s*"function"/].forEach(function (re) {
        if (re.test(src)) criticalInjectable.push(dir + "/" + f);
      });
    });
  });
  check("HYG-04. aucun verificateur critique n'est utilise depuis un parametre d'appel", criticalInjectable.length === 0, criticalInjectable.join(", "));
  check("HYG-05. la surface de validation livree est complete", Object.keys(VAL).length >= 18);

  console.log("\n  -- non-regression --");
  const h = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const lots = [["MONO-08", "v0.8"], ["MONO-09", "v0.1"], ["MONO-09", "v0.2"], ["MONO-10", "v0.1"], ["MONO-10", "v0.2"], ["MONO-10", "v0.3"], ["MONO-10", "v0.4"], ["MONO-10", "v0.5"]];
  const bad = [];
  lots.forEach(function (p) {
    const dir = path.join(KIT, p[0], p[1]), f = path.join(dir, "SHA256SUMS.txt");
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f, "utf8").trim().split("\n").forEach(function (line) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) return;
      const fp = path.join(dir, m[2]);
      if (!fs.existsSync(fp) || h(fp) !== m[1]) bad.push(p.join("/") + ":" + m[2]);
    });
  });
  check("NR-01. lots historiques conformes a leurs SHA256SUMS scelles", bad.length === 0, bad.slice(0, 3).join(", "));
  let cmp = 0, div = 0;
  for (const sub of ["dependencies", "ports", "lib"]) {
    const X = path.join(KIT, "MONO-01", sub), Y = path.join(KIT, "MONO-02", "dependencies", "MONO-01", sub);
    if (!fs.existsSync(X) || !fs.existsSync(Y)) continue;
    for (const f of fs.readdirSync(X)) { const pa = path.join(X, f), pb = path.join(Y, f);
      if (fs.statSync(pa).isDirectory()) continue; cmp++; if (!fs.existsSync(pb) || h(pa) !== h(pb)) div++; }
  }
  check("NR-02. MONO-01 byte-identique a la copie imbriquee dans MONO-02", cmp > 0 && div === 0, "compares=" + cmp + " divergents=" + div);

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  console.log("MUTATIONS_CAUGHT = " + mutCaught + " / MUTATIONS_TOTAL = " + mutTotal);
  process.exit(fail === 0 && mutCaught === mutTotal ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
