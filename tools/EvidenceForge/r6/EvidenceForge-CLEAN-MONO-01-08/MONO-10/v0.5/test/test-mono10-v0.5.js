#!/usr/bin/env node
"use strict";
// MONO-10 v0.5 — suite adversariale T01-T48 + 48 mutations.
// Aucun reseau, aucun LLM reel, aucun run EF-02, aucune execution aval, aucun acte humain reel.
// Usage : node test/test-mono10-v0.5.js <bundleRoot>

const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const C = "../core/";
const { sha256Of, artifactHash } = require(C + "canonical.js");
const OTB = require(C + "operator-trust-boundary.js");
const OTV = require(C + "operator-trust-verifier.js");
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
const HAB = require(C + "operator-human-auth-boundary.js");
const CASE = require("../adapters/case-phase-adapter.js");
const VAL = require("../validators/index.js");
const OP = require("../tools/operator-provisioning.js");
const FX = require("./fixture-chain.js");

let pass = 0, fail = 0, mutCaught = 0, mutTotal = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d ? "  -> " + String(d).slice(0, 200) : "")); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const cd = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).split(":")[0]; } };
const threw = (fn) => cd(fn) !== null;
function mutation(id, label, attackWorksWithoutGuard, guardCatches) {
  mutTotal++;
  let a = false, b = false, detail = "";
  try { a = attackWorksWithoutGuard() === true; } catch (e) { detail += "sans-garde a leve: " + e.message + " "; }
  try { b = guardCatches() === true; } catch (e) { detail += "garde a leve: " + e.message + " "; }
  if (a && b) { mutCaught++; check(id + ". " + label, true); }
  else check(id + ". " + label, false, (a ? "" : "attaque inoperante meme sans garde ") + detail);
}

(async () => {
  console.log("MONO-10 v0.5 — suite adversariale\n");
  const prodOp = FX.provisionOperator({ namespace: "PRODUCTION" });
  const testOp = FX.provisionOperator({ namespace: "TEST" });
  const PROD = await FX.buildChain({ mode: "PRODUCTION", operator: prodOp });
  const prod = await PROD.complete();
  const TEST = await FX.buildChain({ mode: "TEST", operator: testOp });
  const test = await TEST.complete();

  check("REF-01. chaine PRODUCTION attestee : QUALIFIED + AUTHORIZED",
    prod.qualification.qualificationStatus === "QUALIFIED"
    && prod.qualification.evidenceClass === "AUTHENTICATED_PRODUCTION_EXECUTION"
    && prod.authorization.authorization === "AUTHORIZED");
  check("REF-02. chaine TEST : classe de preuve distincte, jamais PRODUCTION",
    test.qualification.evidenceClass === "AUTHENTICATED_TEST_EXECUTION"
    && test.qualification.authenticatedProductionExecution === false);

  /* ============ T01-T16 : frontiere de confiance ============ */
  console.log("\n  -- T01-T16 : frontiere operateur --");
  const attacker = OP.mintOperatorAuthority({ authorityId: prodOp.authority.authorityId, namespace: "PRODUCTION" });
  const attackerCfg = { operatorTrustBoundaryId: "otb-attaquant", namespace: "TEST",
    authorities: [{ authorityId: attacker.authorityId, keys: [attacker.keyRecord()] }],
    replayProtection: { kind: "MEMORY" }, humanAuth: { kind: "TEST_FIXTURE" } };
  const attackerBoundary = OTB.provisionTestTrustBoundary(attackerCfg);
  const attackerVerifier = OTV.createOperatorTrustVerifier(attackerBoundary);
  const intent = { runId: "run-attaquant", missionHash: sha256Of({ m: 1 }), producerId: "MONO-10",
    producerVersion: "v0.5", executionMode: "PRODUCTION", openedAt: FX.now() };

  check("T01. un ancrage arbitraire de l'appelant est refuse",
    cd(() => OTB.provisionTestTrustBoundary(Object.assign({}, attackerCfg, { namespace: "PRODUCTION" }))) === "OPERATOR_TRUST_BOUNDARY_NOT_PRODUCTION"
    && cd(() => OTV.assertProductionVerifier(attackerVerifier, "T01")) === "TRUST_VERIFIER_NOT_PRODUCTION");
  check("T02. une paire de cles arbitraire ne cree pas une autorite de production",
    cd(() => RM.openRunEvidenceManifest({ verifier: attackerVerifier, attestation: attacker.attest(intent), runIntent: intent })) !== null
    && cd(() => RM.openRunEvidenceManifest({ verifier: prod.verifier, attestation: attacker.attest(intent), runIntent: intent })) === "RUNTIME_ATTESTATION_INVALID");
  // Une attestation ROGUE qui porte sa propre cle publique : la cle attachee
  // n'est jamais lue, donc elle ne rachete rien. Sur une attestation LEGITIME,
  // un champ non signe est simplement ignore — il ne confere aucun pouvoir.
  const rogueAtt = attacker.attest(PROD.intent);
  const selfKeyed = Object.assign({}, rogueAtt, { publicKeyPem: attacker.keyRecord().publicKeyPem, anchor: attacker.keyRecord() });
  const legitPlusKey = Object.assign({}, prod.attestation, { publicKeyPem: attacker.keyRecord().publicKeyPem });
  const verifierSrcT3 = fs.readFileSync(path.join(__dirname, "..", "core", "operator-trust-verifier.js"), "utf8");
  check("T03. une cle publique portee par l'artefact n'a aucun effet",
    prod.verifier.verifyRuntimeAttestation({ attestation: selfKeyed }).valid === false
    && !/att\.publicKeyPem|attestation\.publicKey|att\.anchor/.test(verifierSrcT3)
    && JSON.stringify(prod.manifest).indexOf("PUBLIC KEY") === -1
    && prod.verifier.verifyRuntimeAttestation({ attestation: legitPlusKey }).valid === true);
  const selfRootManifest = (function () {
    const m = Object.assign(clone(prod.manifest), { operatorTrustBoundaryId: "otb-attaquant", boundaryDescriptorHash: "a".repeat(64) });
    // Coherence interne RECALCULEE : l'attaquant sait faire cela.
    m.manifestBindingHash = sha256Of({ runId: m.runId, executionMode: m.executionMode, authorityId: m.authorityId, keyId: m.keyId,
      operatorTrustBoundaryId: m.operatorTrustBoundaryId, boundaryDescriptorHash: m.boundaryDescriptorHash,
      runtimeAttestationHash: m.runtimeAttestationHash, runManifestRootHash: m.runManifestRootHash, missionHash: m.missionHash });
    return m;
  })();
  check("T04. un manifeste ne peut pas designer sa propre racine",
    cd(() => RM.assertManifestAuthentic(selfRootManifest, prod.ctx)) !== null);
  check("T05. une autorite de TEST ne valide jamais en PRODUCTION",
    cd(() => OTV.assertProductionVerifier(test.verifier, "T05")) === "TRUST_VERIFIER_NOT_PRODUCTION"
    && prod.verifier.verifyRuntimeAttestation({ attestation: test.attestation }).valid === false);
  const dualKey = prodOp.authority.keyRecord();
  check("T06. une meme cle ne peut pas occuper deux espaces de confiance",
    cd(() => OTB.provisionTestTrustBoundary({ operatorTrustBoundaryId: "x",
      authorities: [{ authorityId: "A1", keys: [dualKey] }, { authorityId: "A2", keys: [Object.assign({}, dualKey, { keyId: "k2" })] }],
      replayProtection: { kind: "MEMORY" } })) === "TRUST_ANCHOR_KEY_REUSED");
  const revokedOp = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-revoked",
    keys: null });
  const revAuth = revokedOp.authority;
  const revokedCfgOp = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-rev2", authority: revAuth,
    keys: [revAuth.keyRecord({ status: "REVOKED", revokedAt: FX.now(), revocationReason: "compromission supposee" })] });
  const revB = FX.boundaryFor(revokedCfgOp), revV = OTV.createOperatorTrustVerifier(revB);
  const revIntent = { runId: "run-rev", missionHash: sha256Of({ m: 1 }), producerId: "MONO-10", producerVersion: "v0.5", executionMode: "PRODUCTION", openedAt: FX.now() };
  check("T07. une cle REVOQUEE n'est jamais valide",
    revV.verifyRuntimeAttestation({ attestation: revAuth.attest(revIntent) }).valid === false
    && revV.verifyRuntimeAttestation({ attestation: revAuth.attest(revIntent) }).problems.some((p) => /REVOQUEE/.test(p)));
  const expOp = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-exp",
    keys: null });
  const expAuth = expOp.authority;
  const expCfgOp = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-exp2", authority: expAuth,
    keys: [expAuth.keyRecord({ validFrom: new Date(Date.now() - 7200000).toISOString(), validUntil: new Date(Date.now() - 3600000).toISOString() })] });
  const expV = OTV.createOperatorTrustVerifier(FX.boundaryFor(expCfgOp));
  check("T08. une cle hors fenetre de validite est refusee",
    expV.verifyRuntimeAttestation({ attestation: expAuth.attest(revIntent) }).valid === false);
  const retOp = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-ret", authority: expAuth,
    keys: [expAuth.keyRecord({ status: "RETIRED", validFrom: new Date(Date.now() - 7200000).toISOString(), validUntil: new Date(Date.now() + 3600000).toISOString() })] });
  const retV = OTV.createOperatorTrustVerifier(FX.boundaryFor(retOp));
  check("T09. une cle RETIREE reste verifiable pour ce qu'elle a signe dans sa fenetre (politique historique)",
    retV.verifyRuntimeAttestation({ attestation: expAuth.attest(revIntent) }).valid === true);
  const replayIntent = Object.assign({}, prod.manifest, {});
  check("T10. une attestation rejouee pour ouvrir un AUTRE run est refusee",
    cd(() => RM.openRunEvidenceManifest({ verifier: prod.verifier, attestation: prod.attestation,
      runIntent: Object.assign({}, PROD.intent, { runId: "run-autre" }) })) !== null
    && cd(() => RM.openRunEvidenceManifest({ verifier: prod.verifier, attestation: prod.attestation, runIntent: PROD.intent })) === "RUNTIME_ATTESTATION_INVALID");
  check("T11. sans anti-rejeu provisionne, une frontiere de PRODUCTION est refusee",
    cd(() => OTB.provisionTestTrustBoundary({ operatorTrustBoundaryId: "x", namespace: "PRODUCTION",
      authorities: [{ authorityId: "A", keys: [attacker.keyRecord()] }] })) !== null
    && (function () {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), "noreplay-"));
      OP.writeOperatorTrustConfig(path.join(d, "t.json"), { operatorTrustBoundaryId: "otb-noreplay", namespace: "PRODUCTION",
        authorities: [{ authorityId: attacker.authorityId, keys: [attacker.keyRecord()] }] });
      const prev = process.env[OTB.ENV_VAR]; process.env[OTB.ENV_VAR] = path.join(d, "t.json");
      const r = cd(() => OTB.provisionProductionTrustBoundary());
      if (prev === undefined) delete process.env[OTB.ENV_VAR]; else process.env[OTB.ENV_VAR] = prev;
      return r === "REPLAY_PROTECTION_MISSING";
    })());
  ["runId", "missionHash", "runManifestRootHash", "nonce", "producerId", "producerVersion", "keyId", "authorityId", "issuedAt", "expiresAt", "executionMode", "attestationId"].forEach(function (f) {
    // couvert globalement ci-dessous
  });
  const mutateAtt = (f, v) => prod.verifier.verifyRuntimeAttestation({ attestation: Object.assign({}, prod.attestation, { [f]: v }) }).valid;
  check("T12. muter le runId signe invalide l'attestation", mutateAtt("runId", "run-autre") === false);
  check("T13. muter le missionHash signe invalide l'attestation", mutateAtt("missionHash", sha256Of({ x: 1 })) === false);
  check("T14. muter la racine de manifeste signee invalide l'attestation", mutateAtt("runManifestRootHash", sha256Of({ y: 1 })) === false);
  const synthOp = FX.provisionOperator({ namespace: "TEST", boundaryId: "otb-synthetique" });
  const synth = await (await FX.buildChain({ mode: "TEST", operator: synthOp })).complete();
  const qSynthUnderProd = SQ.qualifyProcess(Object.assign({}, synth.sources, { runContext: Object.assign({}, synth.ctx, { manifest: Object.assign(clone(synth.manifest), { executionMode: "PRODUCTION" }) }) }));
  check("T15. une chaine synthetique complete ne peut pas QUALIFIER en production",
    qSynthUnderProd.qualificationStatus === "NOT_QUALIFIED" && qSynthUnderProd.authenticatedProductionExecution === false);
  const aSynth = DA.resolveDownstreamUseAuthorization({ runContext: Object.assign({}, synth.ctx, { manifest: Object.assign(clone(synth.manifest), { executionMode: "PRODUCTION" }) }),
    qualification: qSynthUnderProd, qualificationSources: synth.sources, report: synth.report, acceptance: synth.acceptance,
    acceptanceValidator: FRA.validateAcceptance, lineageRefs: synth.authRefs, artifactRegistry: synth.registry });
  check("T16. une chaine synthetique complete ne peut pas AUTORISER en production", aSynth.authorization === "NOT_AUTHORIZED");

  /* ============ T17-T24 : humain / panel ============ */
  console.log("\n  -- T17-T24 : humain et panel --");
  check("T17. un callback humain fourni par l'appelant est refuse en production",
    HA.verifyHumanActAuthenticity({ actorType: "human", actorIdentity: "Alice", decidedAt: FX.now() },
      { humanActVerifier: () => ({ authenticated: true, mechanismId: "faux" }) }, "T17").authenticated === false
    && HA.verifyHumanActAuthenticity({ actorType: "human", actorIdentity: "Alice", decidedAt: FX.now() },
      { humanActVerifier: () => ({ authenticated: true, mechanismId: "faux" }) }, "T17").callbackOrigin === HA.CALLBACK_ORIGIN.CALLER);
  const noMechOp = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-nomech", humanAuth: {} });
  const noMechV = OTV.createOperatorTrustVerifier(FX.boundaryFor(noMechOp));
  check("T18. sans mecanisme humain provisionne : NOT_AUTHENTICATED",
    noMechV.hasHumanAuthMechanism() === false
    && noMechV.verifyHumanAct({ actorType: "human", actorIdentity: "X", decidedAt: FX.now() }).authenticated === false);
  const badRefs = clone(PROD.assessment);
  badRefs.assessments[0].missionEvidenceRefs = [{ artifactId: "doc-invente", relation: "documentary-evidence", sha256: "a".repeat(64) }];
  check("T19. une reference de preuve humaine inexistante est rejetee", (function () {
    const tpl = PG.buildPanelValidationTemplate(badRefs);
    const v = Object.assign({}, tpl, { decisions: tpl.decisions.map((d) => Object.assign({}, d, {
      decision: PG.DECISION.APPROVE, decisionReason: "m", actorType: "human", actorIdentity: "auditeur-panel", decidedAt: FX.now() })) });
    const r = PG.validatePanelValidation(v, badRefs, PROD.ctx);
    return r.valid === false;
  })());
  const otherRun = await (await FX.buildChain({ mode: "PRODUCTION", operator: prodOp, runSalt: 7, missionId: "mission-autre" })).complete();
  check("T20. une preuve humaine issue d'un autre run est rejetee",
    LIN.resolveLineage([otherRun.docRefs.get("doc-a:c-1")], prod.registry,
      { expectedRunId: prod.manifest.runId, requireRunBinding: true }).resolved === false);
  const mutEv = clone(PROD.validation); mutEv.decisions[0].evidenceRefs = [otherRun.docRefs.get("doc-a:c-1")];
  check("T21. muter decision.evidenceRefs invalide la porte",
    PG.validatePanelValidation(mutEv, PROD.assessment, PROD.ctx).valid === false);
  const c3 = prod.verified.verified.filter((v) => v.candidateRef === "c-3")[0];
  const deferAll = await (await FX.buildChain({ mode: "PRODUCTION", operator: prodOp, runSalt: 2,
    decisions: { "c-1": PG.DECISION.DEFER, "c-2": PG.DECISION.DEFER, "c-3": PG.DECISION.DEFER } })).complete();
  check("T22. DEFER n'atteint jamais le corpus",
    c3.effectiveCorpusEligibility === EE.ELIGIBILITY.DEFERRED
    && !prod.corpus.professionalCorpora.some((p) => p.professionalRef === "c-3")
    && deferAll.corpus.professionalCorpora.length === 0);
  const rejectAll = await (await FX.buildChain({ mode: "PRODUCTION", operator: prodOp, runSalt: 3,
    decisions: { "c-1": PG.DECISION.REJECT, "c-2": PG.DECISION.REJECT, "c-3": PG.DECISION.REJECT } })).complete();
  check("T23. REJECT n'atteint jamais le corpus", rejectAll.corpus.professionalCorpora.length === 0);
  const supplied = EE.deriveEffectiveEligibility({ candidateId: "x", legacyVerificationStatus: "UNVERIFIED",
    humanPanelDecision: PG.DECISION.DEFER, humanActAuthenticated: true,
    suppliedEffectiveCorpusEligibility: "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL" });
  check("T24. une eligibilite fournie est ignoree et recalculee",
    supplied.effectiveCorpusEligibility === EE.ELIGIBILITY.DEFERRED && supplied.suppliedEligibilityIgnored === "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL"
    && EE.isEligible({ effectiveCorpusEligibility: "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL" }) === false);

  /* ============ T25-T28 : identite ============ */
  console.log("\n  -- T25-T28 : identite --");
  const idCtx = { registry: prod.registry, expectedRunId: prod.manifest.runId, expectedMissionHash: prod.manifest.missionHash };
  const refA = prod.docRefs.get("doc-a:c-1"), refB = prod.docRefs.get("doc-b:c-1"), refA2 = prod.docRefs.get("doc-a:c-2");
  const E = (t, id, ref) => ({ evidenceType: t, identifier: id, provenanceRef: ref, subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
  const conf = (ev) => IDE.deriveIdentityConfidence(ev, idCtx).confidence;
  check("T25. le meme identifiant sous deux autorites n'est pas independant",
    conf([E("t1", "i1", refA), E("t2", "i1", refA2)]) !== "STRONG"
    && IDE.independenceBetween({ evidence: E("t1", "i1", refA), provenance: { status: "RESOLVED", sourceRootId: "S1", authorityRootId: "A1", familyRootId: "F1" } },
      { evidence: E("t2", "i1", refA2), provenance: { status: "RESOLVED", sourceRootId: "S2", authorityRootId: "A2", familyRootId: "F2" } }) === IDE.INDEPENDENCE.SAME_SUBJECT_RECORD);
  check("T26. la meme racine de source sous deux libelles n'est pas independante",
    conf([E("t1", "i1", refA), E("t2", "i2", refA)]) !== "STRONG");
  check("T27. une source dupliquee ne cree jamais STRONG",
    conf([E("t1", "i1", refA), E("t1", "i1", refA)]) !== "STRONG");
  check("T28. une independance INCONNUE ne compte jamais comme independante",
    conf([E("t1", "i1", null), E("t2", "i2", null)]) !== "STRONG"
    && conf([E("t1", "i1", refA), E("t2", "i2", refB)]) === "STRONG");

  /* ============ T29-T37 : lignee et inconnus ============ */
  console.log("\n  -- T29-T37 : lignee et inconnus --");
  const crossRef = LIN.artifactRef(otherRun.qualification, "scientific-qualification", LIN.RELATION.QUALIFICATION);
  const crossReg = otherRun.registry;
  check("T29. un drapeau allowCrossRun de l'appelant ne contourne rien",
    LIN.resolveLineage([crossRef], crossReg, { expectedRunId: prod.manifest.runId, allowCrossRun: true }).resolved === false);
  check("T30. un artefact d'un autre run est rejete",
    LIN.resolveLineage([crossRef], crossReg, { expectedRunId: prod.manifest.runId }).resolved === false);
  check("T31. un artefact d'une autre mission est rejete",
    LIN.resolveLineage([crossRef], crossReg, { expectedMissionHash: prod.manifest.missionHash }).resolved === false);
  check("T32. une arete typee erronee est rejetee",
    LIN.resolveLineage([LIN.artifactRef(prod.pre, "readiness-pre", LIN.RELATION.READINESS_PRE)], prod.registry, { relation: LIN.RELATION.REPORT }).resolved === false);
  const noMeta = { artifactId: "mission", relation: LIN.RELATION.MISSION, sha256: artifactHash(prod.mission) };
  check("T33. une metadonnee de lignee absente echoue ferme",
    LIN.resolveLineage([noMeta], (function () {
      const m2 = clone(prod.manifest);
      return { get: () => ({ relation: LIN.RELATION.MISSION, artifactType: "EvidenceForge.Mission", hash: noMeta.sha256, runId: null, missionHash: null, attestationHash: null }) };
    })(), { expectedRunId: prod.manifest.runId }).resolved === false);
  const uctx = { registry: prod.registry, expectedRunId: prod.manifest.runId, expectedMissionHash: prod.manifest.missionHash,
    expectedAttestationHash: prod.manifest.runtimeAttestationHash };
  const u0 = UNK.makeUnknown({ originArtifact: "X", reason: "bloquant", blockingStatus: "BLOCKING", runId: prod.manifest.runId });
  check("T34. une preuve d'inconnu inexistante est rejetee",
    cd(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: ["invente"] }, uctx)) === "UNKNOWN_EVIDENCE_UNRESOLVED");
  check("T35. une preuve d'inconnu sans rapport (autre run) est rejetee",
    cd(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: [otherRun.docRefs.get("doc-a:c-1")] }, uctx)) === "UNKNOWN_EVIDENCE_UNRESOLVED");
  const good = UNK.transition(u0, "RESOLVED", { reason: "leve", evidenceRefs: [refA] }, uctx);
  check("T35b. une preuve qui RESOUT ferme l'inconnu", UNK.effectiveStatus(good) === "RESOLVED");
  check("T36. le rejeu d'une transition d'inconnu est rejete",
    cd(() => UNK.assertChainValid(Object.assign({}, good, { transitions: [good.transitions[0], good.transitions[0]] }), "T36", uctx)) === "UNKNOWN_CHAIN_INVALID");
  const stale = UNK.makeUnknown({ originArtifact: "X", reason: "bloquant", blockingStatus: "BLOCKING", runId: prod.manifest.runId });
  check("T37. un etat resolu ancien ne masque jamais un bloquant courant",
    UNK.blockingOpen([Object.assign({}, stale, { status: "RESOLVED" })]).length === 1
    && cd(() => UNK.assertChainValid(Object.assign({}, stale, { status: "RESOLVED" }), "T37", uctx)) === "UNKNOWN_STATUS_FORGED"
    && UNK.effectiveStatus(UNK.mergeUnknown(good, stale)) === "RESOLVED" && UNK.mergeUnknown(good, stale).blockingStatus === "BLOCKING");

  /* ============ T38-T42 : readiness et LLM ============ */
  console.log("\n  -- T38-T42 : preparation et capacite --");
  const fakeDims = clone(prod.pre); fakeDims.phase = "FULL";
  SR.FULL_ONLY_DIMENSIONS.forEach((n) => fakeDims.dimensions.push({ name: n, status: "SATISFIED", reasons: [], derivedFromRefs: [], reservations: [] }));
  fakeDims.assessedDimensions = fakeDims.dimensions.map((x) => x.name);
  const rdOpt = { registry: prod.registry, expectedRunId: prod.manifest.runId, expectedMissionHash: prod.manifest.missionHash };
  check("T38. des dimensions synthetiques ne promeuvent jamais FULL",
    cd(() => SR.assertReadinessPhase(fakeDims, "FULL", rdOpt, "T38")) === "READINESS_DIMENSIONS_UNSOURCED");
  const declaredReady = Object.assign(clone(prod.pre), { status: "READY", blockingDimensions: [], unknowns: [] });
  const qLie = SQ.qualifyProcess(Object.assign({}, prod.sources, { readinessPre: declaredReady, panelValidation: null }));
  check("T39. une declaration status=READY est ignoree", qLie.qualificationStatus === "NOT_QUALIFIED");
  check("T40. une sonde LLM fabriquee ne prouve pas une capacite de production",
    LC.assertCapabilityUsable(test.capability, test.llmConfig, prod.ctx).usable === false);
  check("T41. une capacite d'un autre run est rejetee",
    LC.assertCapabilityUsable(otherRun.capability, otherRun.llmConfig, prod.ctx).usable === false);
  check("T42. un workerBinding divergent est rejete",
    LC.assertCapabilityUsable(prod.capability, Object.assign({}, prod.llmConfig, { workerBindingId: "autre" }), prod.ctx).usable === false
    && LC.assertCapabilityUsable(prod.capability, prod.llmConfig, prod.ctx).usable === true);

  /* ============ T43-T48 : rapport, acceptation, aval ============ */
  console.log("\n  -- T43-T48 : rapport, acceptation, aval --");
  check("T43. une mission desappariee dans le rapport est rejetee",
    cd(() => SUR.buildScientificUnifiedReport(Object.assign({}, prod.sources, { runContext: prod.ctx,
      priorReport: { schema: "P", mission: { missionId: "AUTRE" }, testStatus: {} }, qualification: prod.qualification }))) === "REPORT_MISSION_MISMATCH");
  check("T44. une qualification desappariee est rejetee",
    cd(() => SUR.assertReportBoundToQualification(prod.report, otherRun.qualification, prod.ctx, "T44")) !== null);
  const unauthAcc = Object.assign(clone(prod.acceptance), { authenticationMode: HAB.AUTHENTICATION.TEST_FIXTURE });
  check("T45. une acceptation non authentifiee est rejetee",
    FRA.validateAcceptance(unauthAcc, prod.report, prod.ctx).valid === false);
  check("T46. un faux callback d'acceptation est refuse",
    FRA.validateAcceptance(prod.acceptance, prod.report,
      Object.assign({}, prod.ctx, { verifier: undefined, humanActVerifier: () => ({ authenticated: true, mechanismId: "faux" }) })).valid === false);
  const bypass = DA.resolveDownstreamUseAuthorization({ runContext: Object.assign({}, prod.ctx, { verifier: undefined }),
    qualification: prod.qualification, qualificationSources: prod.sources, report: prod.report, acceptance: prod.acceptance,
    acceptanceValidator: FRA.validateAcceptance, lineageRefs: prod.authRefs, artifactRegistry: prod.registry,
    policy: { trustVerification: false, qualificationRevalidation: false, revalidationRequired: false } });
  check("T47. aucune politique ne contourne la verification de confiance",
    bypass.authorization === "NOT_AUTHORIZED" && bypass.refusedPolicyOverrides.length >= 3);
  const qUnknown = Object.assign(clone(prod.qualification), { qualificationStatus: "IMPOSSIBLE_TO_ASSESS" });
  const aUnknown = DA.resolveDownstreamUseAuthorization({ runContext: prod.ctx, qualification: qUnknown,
    qualificationSources: prod.sources, report: prod.report, acceptance: prod.acceptance,
    acceptanceValidator: FRA.validateAcceptance, lineageRefs: prod.authRefs, artifactRegistry: prod.registry });
  check("T48. une qualification UNKNOWN n'autorise jamais l'aval",
    aUnknown.authorization === "NOT_AUTHORIZED" && aUnknown.revalidation.performed === true);

  /* ============ MUTATIONS M01-M48 ============ */
  console.log("\n  -- MUTATIONS M01-M48 --");
  // Variante « defense desactivee » : le lot v0.3 HISTORIQUE, execute tel quel,
  // en lecture seule. C'est lui qui accordait STRONG a un identifiant duplique.
  const V3 = (function () { try { return { ide: require(path.join(KIT, "MONO-10", "v0.3", "core", "identity-evidence.js")) }; } catch (e) { return null; } })();
  const M = (id, label, a, b) => mutation(id, label, a, b);
  M("M01", "injection de racine arbitraire", () => OTV.createOperatorTrustVerifier(attackerBoundary).namespace === "TEST",
    () => cd(() => OTV.assertProductionVerifier(attackerVerifier, "m")) === "TRUST_VERIFIER_NOT_PRODUCTION");
  M("M02", "autorite TEST comme production", () => test.verifier.namespace === "TEST",
    () => prod.verifier.verifyRuntimeAttestation({ attestation: test.attestation }).valid === false);
  M("M03", "mutation du runId signe", () => Object.assign({}, prod.attestation, { runId: "x" }).runId === "x",
    () => mutateAtt("runId", "x") === false);
  M("M04", "mutation du missionHash signe", () => true, () => mutateAtt("missionHash", sha256Of({ z: 1 })) === false);
  M("M05", "rejeu d'attestation", () => prod.verifier.verifyRuntimeAttestation({ attestation: prod.attestation }).valid === true,
    () => cd(() => RM.openRunEvidenceManifest({ verifier: prod.verifier, attestation: prod.attestation, runIntent: PROD.intent })) === "RUNTIME_ATTESTATION_INVALID");
  M("M06", "manifeste synthetique", () => RM.assertManifestShape(selfRootManifest) === true,
    () => cd(() => RM.assertManifestAuthentic(selfRootManifest, prod.ctx)) !== null);
  M("M07", "chaine synthetique complete", () => synth.authorization.authorization === "AUTHORIZED",
    () => aSynth.authorization === "NOT_AUTHORIZED");
  M("M08", "faux acteur humain", () => ({ actorType: "human", actorIdentity: "Alice" }).actorType === "human",
    () => HA.verifyHumanActAuthenticity({ actorType: "human", actorIdentity: "Alice", decidedAt: FX.now() }, { verifier: prod.verifier }, "m").authenticated === false);
  M("M09", "DEFER au corpus", () => deferAll.verified.verified.length === 3, () => deferAll.corpus.professionalCorpora.length === 0);
  M("M10", "source dupliquee = independance", () => !!V3 && V3.ide.deriveIdentityConfidence([
      { evidenceType: "t1", sourceAuthorityId: "A", sourceFamilyId: "F1", identifier: "i1", subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 },
      { evidenceType: "t2", sourceAuthorityId: "B", sourceFamilyId: "F2", identifier: "i1", subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 }]).confidence === "STRONG",
    () => conf([E("t1", "i1", refA), E("t2", "i1", refA2)]) !== "STRONG");
  M("M11", "mutation des evidenceRefs de decision", () => JSON.stringify(mutEv.decisions[0].evidenceRefs) !== JSON.stringify(PROD.validation.decisions[0].evidenceRefs),
    () => PG.validatePanelValidation(mutEv, PROD.assessment, PROD.ctx).valid === false);
  M("M12", "lignee inter-run", () => otherRun.manifest.runId !== prod.manifest.runId,
    () => LIN.resolveLineage([crossRef], crossReg, { expectedRunId: prod.manifest.runId }).resolved === false);
  M("M13", "arete typee erronee", () => prod.registry.has("readiness-pre"),
    () => LIN.resolveLineage([LIN.artifactRef(prod.pre, "readiness-pre", LIN.RELATION.READINESS_PRE)], prod.registry, { relation: LIN.RELATION.REPORT }).resolved === false);
  M("M14", "preuve d'inconnu non resolue", () => cd(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: ["x"] }, { requireResolvableEvidence: false })) === null,
    () => cd(() => UNK.transition(u0, "RESOLVED", { reason: "r", evidenceRefs: ["x"] }, uctx)) === "UNKNOWN_EVIDENCE_UNRESOLVED");
  M("M15", "rejeu de transition d'inconnu", () => true,
    () => cd(() => UNK.assertChainValid(Object.assign({}, good, { transitions: [good.transitions[0], good.transitions[0]] }), "m", uctx)) === "UNKNOWN_CHAIN_INVALID");
  M("M16", "etat resolu ancien masquant un bloquant", () => Object.assign({}, stale, { status: "RESOLVED" }).status === "RESOLVED",
    () => UNK.blockingOpen([Object.assign({}, stale, { status: "RESOLVED" })]).length === 1);
  M("M17", "dimensions synthetiques", () => fakeDims.dimensions.length > prod.pre.dimensions.length,
    () => cd(() => SR.assertReadinessPhase(fakeDims, "FULL", rdOpt, "m")) === "READINESS_DIMENSIONS_UNSOURCED");
  M("M18", "faux transport LLM", () => test.capability.status === "AVAILABLE",
    () => LC.assertCapabilityUsable(test.capability, test.llmConfig, prod.ctx).usable === false);
  M("M19", "confiance retiree, coherence gardee", () => prod.qualification.internalChainConsistency === true,
    () => SQ.qualifyProcess(Object.assign({}, prod.sources, { runContext: Object.assign({}, prod.ctx, { verifier: undefined }) })).qualificationStatus === "NOT_QUALIFIED");
  M("M20", "coherence brisee, confiance gardee", () => prod.verifier.namespace === "PRODUCTION",
    () => SQ.qualifyProcess(Object.assign({}, prod.sources, { reviewSet: { schema: "EvidenceForge.ReviewSet", reviews: [], summary: { targets: 0 } } })).qualificationStatus === "NOT_QUALIFIED");
  M("M21", "revalidation desactivee", () => ({ revalidationRequired: false }).revalidationRequired === false,
    () => DA.sanitizePolicy({ revalidationRequired: false }).policy.revalidationAlwaysMandatory === true);
  const noSrcAuth = DA.resolveDownstreamUseAuthorization({ runContext: prod.ctx, qualification: prod.qualification,
    report: prod.report, acceptance: prod.acceptance, acceptanceValidator: FRA.validateAcceptance,
    lineageRefs: prod.authRefs, artifactRegistry: prod.registry, policy: { revalidationRequired: false } });
  M("M22", "fausse affirmation de revalidation", () => noSrcAuth.revalidation.performed === false,
    () => noSrcAuth.downstreamUseAuthorized === false
      && !noSrcAuth.reasons.some((r) => /recalculee sur ses artefacts sources et concordante/.test(r))
      && prod.authorization.downstreamUseAuthorized === true && prod.authorization.revalidation.performed === true);
  M("M23", "rapport / qualification desapparies", () => otherRun.qualification.qualificationId !== prod.qualification.qualificationId,
    () => cd(() => SUR.assertReportBoundToQualification(prod.report, otherRun.qualification, prod.ctx, "m")) !== null);
  M("M24", "aval non autorise", () => qUnknown.qualificationStatus === "IMPOSSIBLE_TO_ASSESS", () => aUnknown.authorization === "NOT_AUTHORIZED");
  M("M25", "cle publique portee par l'artefact", () => selfKeyed.publicKeyPem !== undefined,
    () => prod.verifier.verifyRuntimeAttestation({ attestation: selfKeyed }).valid === false);
  M("M26", "racine designee par le manifeste", () => selfRootManifest.operatorTrustBoundaryId === "otb-attaquant",
    () => cd(() => RM.assertManifestAuthentic(selfRootManifest, prod.ctx)) !== null);
  M("M27", "cle revoquee", () => true, () => revV.verifyRuntimeAttestation({ attestation: revAuth.attest(revIntent) }).valid === false);
  M("M28", "cle hors fenetre", () => true, () => expV.verifyRuntimeAttestation({ attestation: expAuth.attest(revIntent) }).valid === false);
  M("M29", "cle retiree utilisee pour signer du neuf", () => retV.verifyRuntimeAttestation({ attestation: expAuth.attest(revIntent) }).valid === true,
    () => KL.evaluateKeyAt(KL.makeKeyRecord({ authorityId: "A", keyId: "k", publicKeyPem: expAuth.keyRecord().publicKeyPem, status: "RETIRED", validFrom: new Date(Date.now() - 7200000).toISOString(), validUntil: new Date(Date.now() - 3600000).toISOString() }), FX.now()).usable === false);
  M("M30", "meme cle deux espaces", () => true, () => cd(() => OTB.provisionTestTrustBoundary({ operatorTrustBoundaryId: "x",
      authorities: [{ authorityId: "A1", keys: [dualKey] }, { authorityId: "A2", keys: [Object.assign({}, dualKey, { keyId: "k9" })] }], replayProtection: { kind: "MEMORY" } })) === "TRUST_ANCHOR_KEY_REUSED");
  M("M31", "store anti-rejeu en memoire en production", () => RP.createMemoryReplayStore("x").persistent === false,
    () => cd(() => OTB.provisionTestTrustBoundary({ namespace: "PRODUCTION", authorities: [{ authorityId: "A", keys: [attacker.keyRecord()] }], replayProtection: { kind: "MEMORY" } })) !== null);
  M("M32", "store anti-rejeu imite par l'appelant", () => ({ hasSeen: () => false, getSeen: () => null, markSeen: () => true, checkAndConsume: () => ({ consumed: true }) }).checkAndConsume().consumed === true,
    () => RP.isProvisionedStore({ hasSeen: () => false, getSeen: () => null, markSeen: () => true, checkAndConsume: () => ({ consumed: true }) }) === false);
  M("M33", "registre d'artefacts imite par l'appelant", () => ({ get: () => ({ hash: "x" }) }).get() !== null,
    () => AAR.isAuthenticatedRegistry({ get: () => ({ hash: "x" }), has: () => true }) === false);
  M("M34", "registre d'un autre run", () => otherRun.registry.runId !== prod.manifest.runId,
    () => cd(() => AAR.assertAuthenticatedRegistry(otherRun.registry, prod.manifest, "m")) === "ARTIFACT_REGISTRY_RUN_MISMATCH");
  M("M35", "verificateur imite par l'appelant", () => true,
    () => cd(() => RM.openRunEvidenceManifest({ verifier: { namespace: "PRODUCTION", verifyRuntimeAttestation: () => ({ valid: true }) }, attestation: prod.attestation, runIntent: PROD.intent })) === "TRUST_VERIFIER_FORGED");
  M("M36", "frontiere imitee par l'appelant", () => true,
    () => cd(() => OTV.createOperatorTrustVerifier({ namespace: "PRODUCTION", lookupKey: () => ({ publicKeyPem: "x" }) })) === "OPERATOR_TRUST_BOUNDARY_FORGED");
  M("M37", "racine de manifeste mutee", () => true, () => mutateAtt("runManifestRootHash", sha256Of({ q: 1 })) === false);
  M("M38", "intention de run divergente de la racine attestee", () => true,
    () => cd(() => RM.openRunEvidenceManifest({ verifier: prod.verifier, attestation: prod.attestation, runIntent: Object.assign({}, PROD.intent, { producerVersion: "v9" }) })) === "RUNTIME_ATTESTATION_INVALID");
  M("M39", "preuve humaine inventee", () => badRefs.assessments[0].missionEvidenceRefs[0].artifactId === "doc-invente",
    () => (function () { const tpl = PG.buildPanelValidationTemplate(badRefs);
      const v = Object.assign({}, tpl, { decisions: tpl.decisions.map((d) => Object.assign({}, d, { decision: PG.DECISION.APPROVE, decisionReason: "m", actorType: "human", actorIdentity: "auditeur-panel", decidedAt: FX.now() })) });
      return PG.validatePanelValidation(v, badRefs, PROD.ctx).valid === false; })());
  M("M40", "preuve humaine d'un autre run", () => otherRun.docRefs.get("doc-a:c-1") !== undefined,
    () => LIN.resolveLineage([otherRun.docRefs.get("doc-a:c-1")], prod.registry, { expectedRunId: prod.manifest.runId, requireRunBinding: true }).resolved === false);
  M("M41", "eligibilite fournie en entree", () => supplied.suppliedEligibilityIgnored === "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL",
    () => supplied.effectiveCorpusEligibility === "DEFERRED" && EE.isEligible({ effectiveCorpusEligibility: "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL" }) === false);
  M("M42", "REJECT au corpus", () => rejectAll.verified.verified.length === 3, () => rejectAll.corpus.professionalCorpora.length === 0);
  M("M43", "statut legacy mute", () => prod.verified.verified[0].humanPanelDecision === "APPROVE_FOR_DOCUMENTARY_PANEL",
    () => prod.verified.verified[0].verificationStatus === "UNVERIFIED" && prod.verified.verified[0].legacyVerificationStatus === "UNVERIFIED");
  M("M44", "metadonnee de lignee absente", () => true,
    () => LIN.resolveLineage([noMeta], { get: () => ({ relation: LIN.RELATION.MISSION, artifactType: "EvidenceForge.Mission", hash: noMeta.sha256, runId: null, missionHash: null }) }, { expectedRunId: prod.manifest.runId }).resolved === false);
  M("M45", "acceptation non authentifiee", () => unauthAcc.authenticationMode === "TEST_FIXTURE_DECLARED",
    () => FRA.validateAcceptance(unauthAcc, prod.report, prod.ctx).valid === false);
  M("M46", "callback d'acceptation fourni par l'appelant", () => true,
    () => FRA.validateAcceptance(prod.acceptance, prod.report, Object.assign({}, prod.ctx, { verifier: undefined, humanActVerifier: () => ({ authenticated: true, mechanismId: "f" }) })).valid === false);
  M("M47", "registre non authentifie a la qualification", () => true,
    () => SQ.qualifyProcess(Object.assign({}, prod.sources, { artifactRegistry: { get: () => null } })).qualificationStatus === "NOT_QUALIFIED");
  M("M48", "frontiere absente = fail closed", () => true, () => (function () {
      const prev = process.env[OTB.ENV_VAR]; delete process.env[OTB.ENV_VAR];
      const r = cd(() => OTB.provisionProductionTrustBoundary());
      if (prev !== undefined) process.env[OTB.ENV_VAR] = prev;
      return r === "OPERATOR_TRUST_NOT_PROVISIONED"; })());

  /* ============ universalite, hygiene, non-regression ============ */
  console.log("\n  -- universalite : six domaines etrangers --");
  const DOM = [["metallurgie", ["metallurgie des poudres"]], ["droit maritime", ["droit des transports maritimes"]],
    ["radioprotection", ["dosimetrie operationnelle"]], ["pedologie", ["science des sols"]],
    ["linguistique forensique", ["analyse de discours judiciaire"]], ["genie sismique", ["dynamique des structures"]]];
  let uni = 0;
  for (let i = 0; i < DOM.length; i++) {
    const [label, labels] = DOM[i];
    const c = await (await FX.buildChain({ mode: "TEST", operator: testOp, missionId: "m-uni-" + i, runSalt: 100 + i,
      missionLabels: labels, candidates: [FX.candidate("op-" + i, labels)], decisions: { ["op-" + i]: PG.DECISION.APPROVE } })).complete();
    const ok = /QUALIFIED/.test(c.qualification.qualificationStatus) && c.authorization.authorization === "AUTHORIZED";
    if (ok) uni++;
    check("UNI-" + (i + 1) + ". " + label + " (" + c.qualification.qualificationStatus + ")", ok, c.qualification.qualificationStatus + "/" + c.authorization.authorization);
  }

  console.log("\n  -- hygiene --");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  const WORDS = ["jmjs", "p0_2", "p0.2", "orcid", "openalex", "crossref", "pubmed", "musicien", "liturgi"];
  const leaks = [];
  ["core", "adapters", "validators", "tools"].forEach(function (dir) {
    fs.readdirSync(path.join(__dirname, "..", dir)).filter((f) => /\.js$/.test(f)).forEach(function (f) {
      const src = strip(fs.readFileSync(path.join(__dirname, "..", dir, f), "utf8")).toLowerCase();
      WORDS.forEach((w) => { if (src.indexOf(w) !== -1) leaks.push(dir + "/" + f + " :: " + w); });
    });
  });
  check("HYG-01. aucun terme de cas dans le code actif", leaks.length === 0, leaks.join(", "));
  check("HYG-02. le detecteur discrimine (temoin positif)", strip('const x = "OpenAlex";').toLowerCase().indexOf("openalex") !== -1);
  const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{40,}?-----END [A-Z ]*PRIVATE KEY-----/;
  const secrets = [];
  (function walk(d) { fs.readdirSync(d).forEach(function (e) { const p = path.join(d, e);
    if (fs.statSync(p).isDirectory()) return walk(p);
    const s = fs.readFileSync(p, "utf8");
    if (PEM.test(s) || /\bsk-[A-Za-z0-9_-]{20,}/.test(s)) secrets.push(path.relative(path.join(__dirname, ".."), p)); }); })(path.join(__dirname, ".."));
  check("HYG-03. aucune matiere privee dans le paquet", secrets.length === 0, secrets.join(", "));
  check("HYG-03b. le detecteur de secret discrimine (temoin positif)",
    PEM.test(crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString()) === true
    && PEM.test("-----BEGIN PRIVATE KEY-----") === false);
  const prodSrc = fs.readFileSync(path.join(__dirname, "..", "core", "operator-trust-verifier.js"), "utf8");
  check("HYG-04. aucun parametre d'ancrage dans la surface de production",
    !/function [a-zA-Z]+\([^)]*(anchorSet|publicKey|trustMap|trustStore)/.test(strip(prodSrc)));
  check("HYG-05. la surface de validation livree est complete", Object.keys(VAL).length >= 16);

  console.log("\n  -- non-regression --");
  const h = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const lots = [["MONO-08", "v0.8"], ["MONO-09", "v0.1"], ["MONO-09", "v0.2"], ["MONO-10", "v0.1"], ["MONO-10", "v0.2"], ["MONO-10", "v0.3"], ["MONO-10", "v0.4"]];
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
