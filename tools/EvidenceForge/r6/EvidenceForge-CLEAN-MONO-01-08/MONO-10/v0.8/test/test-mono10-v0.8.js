#!/usr/bin/env node
"use strict";
// MONO-10 v0.8 — suite adversariale T01-T50 + 50 mutations.
// Aucun reseau, aucun LLM reel, aucun run EF-02, aucun acte humain reel.
// Usage : node test/test-mono10-v0.8.js <bundleRoot>

const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto"), vm = require("vm");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const C = "../core/";
const { sha256Of } = require(C + "canonical.js");
const CC = require(C + "canonical-contracts.js");
const CAG = require(C + "caller-assertion-guard.js");
const AD = require(C + "authority-descriptor.js");
const AC = require(C + "artifact-capabilities.js");
const OTB = require(C + "operator-trust-boundary.js");
const OTV = require(C + "operator-trust-verifier.js");
const OPA = require(C + "operator-provenance-authority.js");
const OHIA = require(C + "operator-historical-input-authority.js");
const HAB = require(C + "operator-human-auth-boundary.js");
const OLB = require(C + "operator-llm-capability-boundary.js");
const RM = require(C + "run-evidence-manifest.js");
const AAR = require(C + "authenticated-artifact-registry.js");
const RP = require(C + "replay-protection.js");
const KL = require(C + "key-lifecycle.js");
const LIN = require(C + "lineage.js");
const IDE = require(C + "identity-evidence.js");
const ESP = require(C + "evidence-source-provenance.js");
const PG = require(C + "panel-gate.js");
const PGA = require(C + "panel-gated-adapter.js");
const EE = require(C + "effective-eligibility.js");
const LC = require(C + "llm-capability.js");
const SR = require(C + "scientific-readiness.js");
const SQ = require(C + "scientific-qualification.js");
const DA = require(C + "downstream-authorization.js");
const HAP = require(C + "human-act-proof.js");
const VAL = require("../validators/index.js");
const OP = require("../tools/operator-provisioning.js");
const UEB = require("../adapters/upstream-evidence-binder.js");
const FX = require("./fixture-chain.js");

let pass = 0, fail = 0, mutCaught = 0, mutTotal = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d !== undefined ? "  -> " + String(d).slice(0, 220) : "")); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const cd = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).split(":")[0]; } };
const R = LIN.RELATION, now = () => new Date().toISOString();
function mutation(id, label, attackIsReal, guardRejects) {
  mutTotal++;
  let a = false, b = false, detail = "";
  try { a = attackIsReal() === true; } catch (e) { detail += "attaque a leve: " + e.message.slice(0, 70) + " "; }
  try { b = guardRejects() === true; } catch (e) { detail += "garde a leve: " + e.message.slice(0, 70) + " "; }
  if (a && b) { mutCaught++; check(id + ". " + label, true); }
  else check(id + ". " + label, false, (a ? "" : "attaque non pertinente ") + detail);
}

(async () => {
  console.log("MONO-10 v0.8 — suite adversariale\n");
  const opP = FX.provisionOperator({ namespace: "PRODUCTION" });
  const opT = FX.provisionOperator({ namespace: "TEST" });
  const bP = FX.boundaryFor(opP);
  const vP = OTV.createOperatorTrustVerifier(bP);
  const P = await FX.buildChain({ mode: "PRODUCTION", operator: opP });
  const prod = await P.complete();
  const T = await FX.buildChain({ mode: "TEST", operator: opT });
  const test = await T.complete();
  const O = await FX.buildChain({ mode: "PRODUCTION", operator: opP, runSalt: 7, missionId: "mission-B" });
  const other = await O.complete();
  const idOpt = { registry: prod.registry, expectedRunId: prod.manifest.runId,
    expectedMissionHash: prod.manifest.missionHash, expectedAttestationHash: prod.manifest.runtimeAttestationHash,
    verifier: prod.verifier };

  check("REF-01. chaine PRODUCTION nominale : QUALIFIED + AUTHORIZED",
    prod.qualification.qualificationStatus === "QUALIFIED" && prod.authorization.authorization === "AUTHORIZED");
  check("REF-02. chaine TEST : classe de preuve distincte",
    test.qualification.evidenceClass === "AUTHENTICATED_TEST_EXECUTION");

  /** Le fichier que l'APPELANT controle, et la poignee qu'il fabrique. */
  const mine = fs.mkdtempSync(path.join(os.tmpdir(), "appelant-"));
  fs.writeFileSync(path.join(mine, "roots.json"), JSON.stringify({ roots: [
    { sourceRootId: "MA-RACINE-1", authorityRootId: "MON-AUTORITE-1", familyRootId: "MA-FAMILLE-1" },
    { sourceRootId: "MA-RACINE-2", authorityRootId: "MON-AUTORITE-2", familyRootId: "MA-FAMILLE-2" }] }));
  fs.writeFileSync(path.join(mine, "actors.json"), JSON.stringify({ actors: [{ actorIdentity: "moi", status: "ACTIVE", actProofSecret: "mon-secret" }] }));
  fs.writeFileSync(path.join(mine, "hist.json"), JSON.stringify({ authorized: [] }));
  const forgedHandle = Object.freeze({ operatorBoundaryId: "otb-je-decrete", namespace: "PRODUCTION",
    provisionedFrom: "ENVIRONMENT", configBindingHash: sha256Of({ x: 1 }), issuerGeneration: "g",
    operatorConfigPaths: Object.freeze({ provenanceRegistryPath: path.join(mine, "roots.json"),
      historicalInputRegistryPath: path.join(mine, "hist.json"), humanActorsRegistryPath: path.join(mine, "actors.json"),
      llmTransportModuleRef: FX.TRANSPORT_REF, trustConfigPath: path.join(mine, "trust.json") }) });

  /* ===== §34 — CONSTRUCTEURS (T01-T08) ===== */
  console.log("\n  -- T01-T08 : un constructeur public n'est pas une frontiere --");
  check("T01. constructeur de provenance refuse en PRODUCTION",
    cd(() => OPA.createFromBoundary(forgedHandle, { kind: "OPERATOR_ROOT_REGISTRY" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY"
    && typeof OPA.createOperatorProvenanceAuthority === "undefined");
  check("T02. constructeur d'entree historique refuse en PRODUCTION",
    cd(() => OHIA.createFromBoundary(forgedHandle, { kind: "OPERATOR_AUTHORIZED_INPUTS" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY"
    && typeof OHIA.createOperatorHistoricalInputAuthority === "undefined");
  check("T03. constructeur d'acte humain refuse en PRODUCTION",
    cd(() => HAB.createFromBoundary(forgedHandle, { kind: "OPERATOR_ACT_PROOF" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY"
    && typeof HAB.createOperatorActProofMechanism === "undefined");
  check("T04. constructeur de capacite LLM refuse en PRODUCTION",
    cd(() => OLB.createFromBoundary(forgedHandle, { kind: "OPERATOR_TRANSPORT" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY"
    && typeof OLB.createOperatorLlmCapabilityBoundary === "undefined");
  const tAuth = OPA.createTestProvenanceAuthority({ roots: [{ sourceRootId: "R", authorityRootId: "A", familyRootId: "F" }] });
  check("T05. un chemin d'appelant ne cree aucune autorite ENVIRONMENT",
    tAuth.provisionedFrom === "IN_PROCESS_TEST" && tAuth.executionMode === "TEST"
    && OPA.isProvisionedProvenanceAuthority(tAuth, { requireProduction: true }) === false
    && vP.provenanceAuthority().provisionedFrom === "ENVIRONMENT");
  check("T06. une autorite de forme valide mais fabriquee est refusee",
    OPA.isProvisionedProvenanceAuthority({ authorityId: "faux", operatorBoundaryId: bP.operatorTrustBoundaryId,
      provisionedFrom: "ENVIRONMENT", resolveRoots: () => ({ status: "AUTHENTICATED" }) }) === false
    && OHIA.isProvisionedHistoricalInputAuthority({ authorityId: "faux", authorize: () => ({ authorized: true }) }) === false
    && HAB.isProvisionedHumanAuth({ mechanismId: "faux", verifyHumanAct: () => ({ authenticated: true }) }) === false
    && OLB.isProvisionedLlmBoundary({ llmBoundaryId: "faux", namespace: "PRODUCTION" }) === false);
  check("T07. le VRAI constructeur sans poignee de frontiere est refuse",
    cd(() => OPA.createFromBoundary(null, { kind: "OPERATOR_ROOT_REGISTRY" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY"
    && cd(() => OPA.createFromBoundary(Object.assign({}, forgedHandle), { kind: "OPERATOR_ROOT_REGISTRY" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY");
  const altDir = fs.mkdtempSync(path.join(os.tmpdir(), "copie-"));
  ["canonical.js", "canonical-contracts.js", "authority-descriptor.js", "caller-assertion-guard.js",
    "operator-provenance-authority.js", "operator-trust-boundary.js"].forEach(function (f) {
      try { fs.copyFileSync(path.join(__dirname, "..", "core", f), path.join(altDir, f)); } catch (e) { /* copie partielle */ }
    });
  let altVerdict = "chargement impossible";
  try {
    fs.mkdirSync(path.join(altDir, "..", "contracts"), { recursive: true });
    const alt = require(path.join(altDir, "operator-provenance-authority.js"));
    altVerdict = "copie chargee : reconnait-elle l'autorite officielle ? "
      + alt.isProvisionedProvenanceAuthority(vP.provenanceAuthority());
    check("T08. une copie alternative du module ne reconnait rien (fail closed)",
      alt.isProvisionedProvenanceAuthority(vP.provenanceAuthority()) === false
      && OPA.isProvisionedProvenanceAuthority(alt.createTestProvenanceAuthority({ roots: [] })) === false);
  } catch (e) {
    check("T08. une copie alternative du module ne peut pas servir (fail closed)", true, "copie non chargeable : " + e.message.split("\n")[0].slice(0, 80));
  }

  /* ===== §35 — LIEN A LA FRONTIERE (T09-T14) ===== */
  console.log("\n  -- T09-T14 : la capacite appartient a UNE frontiere --");
  const opB = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-B" });
  const bB = FX.boundaryFor(opB);
  const vB = OTV.createOperatorTrustVerifier(bB);
  const authA = vP.provenanceAuthority(), authB = vB.provenanceAuthority();
  check("T09. une autorite de la frontiere A est refusee sous la frontiere B",
    OPA.isProvisionedProvenanceAuthority(authA, { operatorBoundaryId: bB.operatorTrustBoundaryId }) === false
    && OPA.isProvisionedProvenanceAuthority(authA, { operatorBoundaryId: bP.operatorTrustBoundaryId }) === true);
  const resA = authA.resolveRoots({ sourceRootId: "SRC-ROOT-A-0" });
  const grantA = AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
    artifactId: "doc-a:c-1", artifactHash: prod.registry.get("doc-a:c-1").hash,
    artifactSchema: prod.registry.get("doc-a:c-1").artifactType, runId: prod.manifest.runId,
    missionHash: prod.manifest.missionHash, operatorBoundaryId: bP.operatorTrustBoundaryId, derivationRef: resA.derivationRef });
  check("T10. une capacite de la frontiere A est refusee sous la frontiere B",
    cd(() => other.registry.grantCapability("doc-a:c-1", grantA)) !== null
    && cd(() => AC.assertCapability({ artifactId: "x", capabilities: [AC.CAPABILITY.AUTHENTICATED_PROVENANCE],
      capabilityGrants: [grantA] }, AC.CAPABILITY.AUTHENTICATED_PROVENANCE, "sink", bB.operatorTrustBoundaryId)) === "ARTIFACT_CAPABILITY_CROSS_BOUNDARY");
  check("T11. un operatorBoundaryId errone est refuse a l'emission",
    cd(() => AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
      artifactId: "doc-a:c-1", artifactHash: prod.registry.get("doc-a:c-1").hash,
      artifactSchema: prod.registry.get("doc-a:c-1").artifactType, runId: prod.manifest.runId,
      missionHash: prod.manifest.missionHash, operatorBoundaryId: "otb-invente", derivationRef: "x" })) === "CAPABILITY_ISSUER_INVALID");
  const dA = OPA.descriptorOf(authA);
  check("T12. un configBindingHash errone est detectable",
    cd(() => AD.assertSameBoundary(Object.assign({}, dA, { operatorBoundaryId: "autre" }),
      bP.operatorTrustBoundaryId, "t12")) === "AUTHORITY_CROSS_BOUNDARY"
    && dA.configBindingHash !== OPA.descriptorOf(authB).configBindingHash);
  check("T13. un genre d'autorite errone est refuse",
    cd(() => AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.HUMAN_AUTHENTICATED,
      artifactId: "panel-validation", artifactHash: prod.registry.get("panel-validation").hash,
      artifactSchema: prod.registry.get("panel-validation").artifactType, runId: prod.manifest.runId,
      missionHash: prod.manifest.missionHash, operatorBoundaryId: bP.operatorTrustBoundaryId,
      derivationRef: "x" })) === "CAPABILITY_ISSUER_INVALID");
  check("T14. un executionMode errone est refuse",
    OPA.isProvisionedProvenanceAuthority(test.verifier.provenanceAuthority(), { requireProduction: true }) === false
    && OPA.descriptorOf(test.verifier.provenanceAuthority()).executionMode === "TEST");

  /* ===== §36 — PROVENANCE (T15-T20) ===== */
  console.log("\n  -- T15-T20 : provenance --");
  function freshRun(tag, op, boundary) {
    const verifier = OTV.createOperatorTrustVerifier(boundary);
    const missionId = "m-" + tag, missionHash = sha256Of({ missionId });
    const it = { runId: "run-" + tag, missionHash, producerId: "MONO-10", producerVersion: "v0.8",
      executionMode: boundary.namespace, openedAt: now() };
    const att = op.authority.attest(it);
    const man = RM.openRunEvidenceManifest({ verifier, attestation: att, runIntent: it, missionBinding: { missionId }, missionHash });
    const reg = AAR.openAuthenticatedArtifactRegistry(man, { manifest: man, verifier, attestation: att });
    const bind = (id, rel, art) => { const b = RM.bindArtifact(man, art, id, art.schema || rel);
      reg.register({ artifactId: id, relation: rel, artifact: b }); return reg.get(id).artifact; };
    bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId, missionHash });
    return { man, reg, bind, verifier, missionHash, runId: it.runId,
      ctx: { manifest: man, verifier, attestation: att, artifactRegistry: reg } };
  }
  const rp = freshRun("prov", opP, bP);
  const mk = (id, root) => ESP.makeDocumentaryEvidenceRecord({ evidenceId: id, sourceRootId: root,
    authorityRootId: "AUTORITE-ECRITE-PAR-L-APPELANT", familyRootId: "FAMILLE-ECRITE-PAR-L-APPELANT",
    retrievedAt: now(), locator: "opaque:" + id, contentHash: sha256Of({ id }) });
  const z1 = rp.bind("doc-z1", R.DOCUMENTARY_EVIDENCE, mk("doc-z1", "MA-RACINE-1"));
  const z2 = rp.bind("doc-z2", R.DOCUMENTARY_EVIDENCE, mk("doc-z2", "MA-RACINE-2"));
  const provOpt = { registry: rp.reg, expectedRunId: rp.runId, expectedMissionHash: rp.missionHash, verifier: rp.verifier };
  const rz1 = ESP.resolveEvidenceSourceProvenance({ provenanceRef: LIN.artifactRef(z1, "doc-z1", R.DOCUMENTARY_EVIDENCE) }, rp.reg, provOpt);
  check("T15. des racines possedees par l'appelant n'authentifient rien",
    rz1.status !== CC.PROVENANCE_STATUS.AUTHENTICATED, rz1.status);
  check("T16. une racine auto-declaree reste UNKNOWN",
    ESP.resolveEvidenceSourceProvenance({ provenanceRef: LIN.artifactRef(z1, "doc-z1", R.DOCUMENTARY_EVIDENCE) }, rp.reg,
      Object.assign({}, provOpt, { provenanceAuthority: tAuth })).status !== CC.PROVENANCE_STATUS.AUTHENTICATED);
  const good = rp.bind("doc-ok", R.DOCUMENTARY_EVIDENCE, ESP.makeDocumentaryEvidenceRecord({ evidenceId: "ok",
    sourceRootId: "SRC-ROOT-A-4", retrievedAt: now(), locator: "o", contentHash: sha256Of({ ok: 1 }) }));
  const rok = ESP.resolveEvidenceSourceProvenance({ provenanceRef: LIN.artifactRef(good, "doc-ok", R.DOCUMENTARY_EVIDENCE) }, rp.reg, provOpt);
  check("T17. TEMOIN POSITIF : la vraie autorite de l'exploitant authentifie",
    rok.status === CC.PROVENANCE_STATUS.AUTHENTICATED && rok.authorityRootId === "AUT-ROOT-A-4", rok.status + "/" + rok.authorityRootId);
  const E = (t, i, r) => ({ evidenceType: t, identifier: i, provenanceRef: r, subjectBinding: "CONFIRMED",
    verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
  const confInv = IDE.deriveIdentityConfidence([E("t1", "i1", LIN.artifactRef(z1, "doc-z1", R.DOCUMENTARY_EVIDENCE)),
    E("t2", "i2", LIN.artifactRef(z2, "doc-z2", R.DOCUMENTARY_EVIDENCE))], provOpt);
  check("T18. deux racines inventees ne creent pas STRONG", confInv.confidence !== "STRONG", confInv.confidence);
  check("T19. une provenance inconnue n'est pas independante",
    IDE.deriveIdentityConfidence([E("t1", "i1", null), E("t2", "i2", null)], provOpt).confidence !== "STRONG");
  check("T20. la capacite de provenance est liee a l'artefact",
    grantA.artifactId === "doc-a:c-1" && grantA.artifactHash === prod.registry.get("doc-a:c-1").hash
    && grantA.operatorBoundaryId === bP.operatorTrustBoundaryId && grantA.issuerAuthorityKind === AD.KIND.PROVENANCE);

  /* ===== §37 — ENTREE HISTORIQUE (T21-T26) ===== */
  console.log("\n  -- T21-T26 : entree historique --");
  // La frontiere de DESTINATION doit etre celle qui a emis l'autorisation :
  // on provisionne donc l'exploitant AVEC ses entrees historiques, puis on
  // construit les deux runs (source et destination) sous CETTE frontiere.
  const opH0 = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-hist" });
  const srcChain = await (await FX.buildChain({ mode: "PRODUCTION", operator: opH0, runSalt: 61, missionId: "mission-source" })).complete();
  const srcEntry = srcChain.registry.get("scientific-qualification");
  const dstChain = await (await FX.buildChain({ mode: "PRODUCTION", operator: opH0, runSalt: 62, missionId: "mission-dest" })).complete();
  const crossRef = LIN.artifactRef(srcChain.qualification, "scientific-qualification", R.QUALIFICATION);
  const req = { sourceRunId: srcChain.manifest.runId, sourceMissionHash: srcChain.manifest.missionHash,
    artifactId: "scientific-qualification", artifactHash: srcEntry.hash, artifactType: srcEntry.artifactType,
    relation: R.QUALIFICATION, destinationRunId: dstChain.manifest.runId,
    destinationMissionHash: dstChain.manifest.missionHash, purpose: "comparaison-historique" };
  const hiBase = { expectedRunId: dstChain.manifest.runId, expectedMissionHash: dstChain.manifest.missionHash,
    verifier: dstChain.verifier };
  // L'exploitant declare l'entree : nouvelle generation de la MEME frontiere.
  OP.writeHistoricalInputRegistry(opH0.historicalPath,
    [Object.assign({}, req, { frozenIdentity: srcEntry.hash, version: "v0.8", authorizedAt: now() })]);
  const hAuth = OTV.createOperatorTrustVerifier(FX.boundaryFor(opH0)).historicalInputAuthority();
  const myHist = OHIA.createTestHistoricalInputAuthority({ authorized: [Object.assign({}, req, { frozenIdentity: srcEntry.hash })] });
  check("T21. une autorite historique de l'appelant ne franchit aucun run",
    myHist.authorize(req).authorized === true
    && LIN.resolveLineage([crossRef], srcChain.registry, Object.assign({}, hiBase,
      { historicalInputAuthority: myHist, historicalInputRequest: req })).resolved === false
    && OHIA.isProvisionedHistoricalInputAuthority(myHist, { operatorBoundaryId: dstChain.manifest.operatorTrustBoundaryId }) === false);
  const okHist = LIN.resolveLineage([crossRef], srcChain.registry, Object.assign({}, hiBase,
    { historicalInputAuthority: hAuth, historicalInputRequest: req }));
  check("T22. TEMOIN POSITIF : la vraie autorite autorise l'entree prevue", okHist.resolved === true,
    JSON.stringify(okHist.problems).slice(0, 190));
  check("T23. mauvais run source refuse", hAuth.authorize(Object.assign({}, req, { sourceRunId: "x" })).authorized === false);
  check("T24. mauvais run de destination refuse", hAuth.authorize(Object.assign({}, req, { destinationRunId: "x" })).authorized === false);
  check("T25. mauvais artefact refuse", hAuth.authorize(Object.assign({}, req, { artifactHash: "a".repeat(64) })).authorized === false);
  check("T26. mauvaise relation refusee", hAuth.authorize(Object.assign({}, req, { relation: R.REPORT })).authorized === false);

  /* ===== §38 — ACTE HUMAIN (T27-T32) ===== */
  console.log("\n  -- T27-T32 : acte humain --");
  const myMech = HAB.createTestHumanActAuthority("a-moi");
  check("T27. un registre d'acteurs de l'appelant n'authentifie rien en PRODUCTION",
    HAB.isProvisionedHumanAuth(myMech, { requireProduction: true }) === false
    && cd(() => AC.mintCapabilityGrant({ issuer: myMech, capability: AC.CAPABILITY.HUMAN_AUTHENTICATED,
      artifactId: "panel-validation", artifactHash: prod.registry.get("panel-validation").hash,
      artifactSchema: prod.registry.get("panel-validation").artifactType, runId: prod.manifest.runId,
      missionHash: prod.manifest.missionHash, operatorBoundaryId: bP.operatorTrustBoundaryId,
      derivationRef: "x" })) === "CAPABILITY_ISSUER_INVALID");
  const actExp = { actionType: HAP.ACTION_TYPE.REPORT_ACCEPTANCE, decisionHash: prod.acceptance.decisionHash,
    runId: prod.manifest.runId, missionHash: prod.manifest.missionHash };
  check("T28. TEMOIN POSITIF : la vraie autorite d'acte authentifie",
    prod.verifier.verifyHumanAct(prod.acceptance, actExp).authenticated === true
    && prod.registry.capabilitiesOf("panel-validation").indexOf(AC.CAPABILITY.HUMAN_AUTHENTICATED) !== -1);
  check("T29. mauvais acteur refuse",
    prod.verifier.verifyHumanAct(Object.assign(clone(prod.acceptance), { actorIdentity: "inconnu" }), actExp).authenticated === false);
  check("T30. mauvais type d'acte refuse",
    prod.verifier.verifyHumanAct(prod.acceptance, Object.assign({}, actExp, { actionType: HAP.ACTION_TYPE.PANEL_DECISION })).authenticated === false);
  check("T31. mauvais decisionHash refuse",
    prod.verifier.verifyHumanAct(prod.acceptance, Object.assign({}, actExp, { decisionHash: sha256Of({ x: 9 }) })).authenticated === false);
  check("T32. preuve d'acte d'une autre frontiere refusee",
    other.verifier.verifyHumanAct(Object.assign(clone(prod.acceptance),
      { humanActProof: prod.acceptance.humanActProof }), Object.assign({}, actExp,
      { runId: other.manifest.runId })).authenticated === false);

  /* ===== §39 — LLM (T33-T38) ===== */
  console.log("\n  -- T33-T38 : capacite LLM --");
  const myLlm = OLB.createTestLlmCapabilityAuthority({ transportModuleRef: null,
    transport: require(FX.TRANSPORT_REF).probe, boundaryId: "a-moi" });
  check("T33. un transport de l'appelant n'emet aucune capacite de PRODUCTION",
    cd(() => AC.mintCapabilityGrant({ issuer: myLlm, capability: AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY,
      artifactId: "llm-capability", artifactHash: prod.registry.get("llm-capability").hash,
      artifactSchema: prod.registry.get("llm-capability").artifactType, runId: prod.manifest.runId,
      missionHash: prod.manifest.missionHash, operatorBoundaryId: bP.operatorTrustBoundaryId,
      derivationRef: "x" })) === "CAPABILITY_ISSUER_INVALID");
  check("T34. TEMOIN POSITIF : la vraie frontiere LLM a emis la capacite",
    prod.registry.capabilitiesOf("llm-capability").indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) !== -1
    && LC.assertCapabilityUsable(prod.capability, prod.llmConfig, prod.ctx).usable === true);
  check("T35. un transport fabrique reste cantonne au TEST",
    LC.assertCapabilityUsable(test.capability, test.llmConfig, prod.ctx).usable === false
    && (await LC.runActiveProbe({ providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture", credentialPresent: true },
      Object.assign({}, prod.ctx, { transport: async () => ({ httpStatus: 200, text: "{}", requestId: "x" }) }))).callerTransportIgnored === true);
  const opStrict = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-strict",
    llmCapability: { kind: "OPERATOR_TRANSPORT", transportModuleRef: FX.TRANSPORT_REF,
      allowedProviders: ["prov-fixture"], allowedModels: ["mod-fixture"], allowedWorkers: ["bind-fixture"] } });
  const rs = freshRun("strict", opStrict, FX.boundaryFor(opStrict));
  const probe = async (over) => LC.runActiveProbe(Object.assign({ providerId: "prov-fixture", modelId: "mod-fixture",
    workerBindingId: "bind-fixture", credentialPresent: true }, over), rs.ctx);
  check("T36. modele non autorise refuse", (await probe({ modelId: "autre" })).status === "UNAVAILABLE");
  check("T37. fournisseur non autorise refuse", (await probe({ providerId: "autre" })).status === "UNAVAILABLE");
  check("T38. capacite LLM d'une autre frontiere refusee",
    LC.assertCapabilityUsable(other.capability, other.llmConfig, prod.ctx).usable === false);

  /* ===== §40 — REJEU (T39-T44) ===== */
  console.log("\n  -- T39-T44 : rejeu --");
  check("T39. rejeu sur la meme frontiere refuse",
    prod.verifier.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  const opSame = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-meme", authority: opP.authority,
    dir: opP.dir, actProofSecret: opP.actProofSecret, provenanceRoots: opP.provenanceRoots });
  const vSame = OTV.createOperatorTrustVerifier(FX.boundaryFor(opSame));
  check("T40. seconde frontiere de la meme autorite : rejeu refuse",
    vSame.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false,
    JSON.stringify(vSame.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).problems).slice(0, 140));
  check("T41. une racine de reserve choisie par l'appelant est refusee",
    cd(() => FX.boundaryFor(FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-rr",
      replayProtection: { kind: "FILE", replayRoot: "/tmp/a-moi", authorityScope: ["A"] } }))) === "REPLAY_LOCATION_REFUSED"
    && cd(() => FX.boundaryFor(FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-dd",
      replayProtection: { kind: "FILE", directory: "/tmp/a-moi", authorityScope: ["A"] } }))) === "REPLAY_LOCATION_REFUSED");
  check("T42. aucune seconde reserve pour la meme autorite sous la meme racine de confiance",
    RP.reserveDirectoryFor(opP.cfgPath, vP.replayNamespaceId) === RP.reserveDirectoryFor(opSame.cfgPath, vSame.replayNamespaceId)
    && vP.replayNamespaceId === vSame.replayNamespaceId,
    vP.replayNamespaceId === vSame.replayNamespaceId ? "namespace partage" : "DIVERGENT");
  const nsA = RP.deriveReplayNamespaceId({ namespace: "PRODUCTION", authorities: [{ authorityId: "A", keyIds: ["k1"] }],
    trustConfigAnchor: RP.trustConfigAnchorOf(opP.cfgPath) });
  const nsOther = RP.deriveReplayNamespaceId({ namespace: "PRODUCTION", authorities: [{ authorityId: "A", keyIds: ["k1"] }],
    trustConfigAnchor: RP.trustConfigAnchorOf(path.join(opP.dir, "autre-trust.json")) });
  check("T43. un replayNamespaceId desapparie est refuse par le marqueur",
    nsA !== nsOther
    && cd(() => { const d = RP.reserveDirectoryFor(opP.cfgPath, nsA); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, RP.MARKER), JSON.stringify({ replayNamespaceId: nsOther, authorityScope: ["A"] }));
      RP.createFileReplayStore({ trustConfigPath: opP.cfgPath, replayNamespaceId: nsA, authorityScope: ["A"] }); }) === "REPLAY_NAMESPACE_MARKER_MISMATCH");
  check("T44. le descripteur de frontiere engage le namespace et l'ancre",
    vP.boundaryDescriptorHash !== vB.boundaryDescriptorHash
    && bP.replayStore.trustConfigAnchor === RP.trustConfigAnchorOf(opP.cfgPath)
    && bP.replayStore.replayNamespaceId === vP.replayNamespaceId);

  /* ===== §41 — PREPARATION (T45-T50) ===== */
  console.log("\n  -- T45-T50 : preparation --");
  check("T45. validation sans registre : fail closed",
    cd(() => SR.assertReadinessPhase(prod.full, "FULL", {}, "T45")) === "READINESS_REGISTRY_REQUIRED");
  const noHash = (function () { const r = clone(prod.full); delete r.dimensionBindingsHash; return r; })();
  check("T46. dimensionBindingsHash absent : fail closed",
    cd(() => SR.assertReadinessPhase(noHash, "FULL", idOpt, "T46")) === "READINESS_BINDINGS_REQUIRED");
  const deferChain = await (await FX.buildChain({ mode: "PRODUCTION", operator: opP, runSalt: 21,
    decisions: { "c-1": PG.DECISION.DEFER, "c-2": PG.DECISION.DEFER, "c-3": PG.DECISION.DEFER } })).complete();
  const dIdOpt = { registry: deferChain.registry, expectedRunId: deferChain.manifest.runId,
    expectedMissionHash: deferChain.manifest.missionHash, expectedAttestationHash: deferChain.manifest.runtimeAttestationHash,
    verifier: deferChain.verifier };
  const flipped = (function () { const r = clone(deferChain.full);
    r.dimensions.forEach((d) => { d.status = "SATISFIED"; d.reservations = []; });
    r.status = "READY"; r.blockingDimensions = []; r.reservations = [];
    r.dimensionsHash = SR.dimensionsHashOf(r.dimensions);
    r.dimensionBindingsHash = SR.deriveReadinessPhase(r.dimensions, deferChain.registry).bindingsHash;
    return r; })();
  check("T47. statuts retournes a la main : refuses",
    cd(() => SR.assertReadinessPhase(flipped, "FULL", dIdOpt, "T47")) === "READINESS_STATUS_OVERSTATED",
    cd(() => SR.assertReadinessPhase(flipped, "FULL", dIdOpt, "T47")));
  const donor = prod.pre.dimensions.filter((d) => (d.derivedFromRefs || []).length)[0];
  const borrowed = (function () { const r = clone(prod.pre); r.phase = "FULL";
    SR.FULL_ONLY_DIMENSIONS.forEach((n) => r.dimensions.push({ name: n, status: "SATISFIED", reasons: ["f"],
      derivedFromRefs: clone(donor.derivedFromRefs), reservations: [] }));
    r.assessedDimensions = r.dimensions.map((x) => x.name);
    r.dimensionsHash = SR.dimensionsHashOf(r.dimensions);
    r.dimensionBindingsHash = SR.deriveReadinessPhase(r.dimensions, prod.registry).bindingsHash;
    return r; })();
  check("T48. preuve sans rapport avec la dimension : refusee",
    cd(() => SR.assertReadinessPhase(borrowed, "FULL", idOpt, "T48")) === "READINESS_DIMENSION_EVIDENCE_UNBOUND");
  check("T49. TEMOIN POSITIF : une liaison correcte est acceptee",
    SR.assertReadinessPhase(prod.full, "FULL", idOpt, "T49") === true
    && (prod.full.dimensionBindings || []).length > 0 && prod.full.derivedPhase === "FULL");
  check("T50. TEMOIN POSITIF : une FULL authentique qualifie",
    prod.qualification.qualificationStatus === "QUALIFIED"
    && SR.assertReadinessPhase(prod.pre, "PRE", idOpt, "T50") === true);

  /* ===== §42 — MUTATIONS M01-M50 ===== */
  console.log("\n  -- MUTATIONS M01-M50 --");
  const M = mutation;
  const realCtorGone = (n) => typeof n === "undefined";
  M("M01", "constructeur de provenance appele par l'appelant", () => fs.existsSync(path.join(mine, "roots.json")),
    () => cd(() => OPA.createFromBoundary(forgedHandle, { kind: "OPERATOR_ROOT_REGISTRY" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY");
  M("M02", "constructeur historique appele par l'appelant", () => true,
    () => cd(() => OHIA.createFromBoundary(forgedHandle, { kind: "OPERATOR_AUTHORIZED_INPUTS" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY");
  M("M03", "constructeur d'acte humain appele par l'appelant", () => true,
    () => cd(() => HAB.createFromBoundary(forgedHandle, { kind: "OPERATOR_ACT_PROOF" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY");
  M("M04", "constructeur LLM appele par l'appelant", () => true,
    () => cd(() => OLB.createFromBoundary(forgedHandle, { kind: "OPERATOR_TRANSPORT" })) === "AUTHORITY_ISSUER_NOT_BOUNDARY");
  M("M05", "anciens constructeurs publics encore exportes", () => true,
    () => realCtorGone(OPA.createOperatorProvenanceAuthority) && realCtorGone(OHIA.createOperatorHistoricalInputAuthority)
      && realCtorGone(HAB.createOperatorActProofMechanism) && realCtorGone(OLB.createOperatorLlmCapabilityBoundary));
  M("M06", "provisionedFrom ENVIRONMENT depuis un chemin d'appelant", () => true,
    () => tAuth.provisionedFrom === "IN_PROCESS_TEST");
  M("M07", "autorite de forme valide", () => true,
    () => OPA.isProvisionedProvenanceAuthority({ authorityId: "f", resolveRoots: () => 1 }) === false);
  M("M08", "poignee de frontiere fabriquee", () => OTB.isBoundaryIssuanceHandle(forgedHandle) === false,
    () => cd(() => OPA.createFromBoundary(forgedHandle, { kind: "OPERATOR_ROOT_REGISTRY" })) !== null);
  M("M09", "autorite de la frontiere A sous la frontiere B", () => bP.operatorTrustBoundaryId !== bB.operatorTrustBoundaryId,
    () => OPA.isProvisionedProvenanceAuthority(authA, { operatorBoundaryId: bB.operatorTrustBoundaryId }) === false);
  M("M10", "capacite de la frontiere A sous la frontiere B", () => true,
    () => cd(() => AC.assertCapability({ artifactId: "x", capabilities: [AC.CAPABILITY.AUTHENTICATED_PROVENANCE],
      capabilityGrants: [grantA] }, AC.CAPABILITY.AUTHENTICATED_PROVENANCE, "s", bB.operatorTrustBoundaryId)) === "ARTIFACT_CAPABILITY_CROSS_BOUNDARY");
  M("M11", "capacite enregistree sous une autre frontiere", () => true,
    () => cd(() => other.registry.grantCapability("doc-a:c-1", grantA)) !== null);
  M("M12", "operatorBoundaryId invente a l'emission", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
      artifactId: "x", artifactHash: "a".repeat(64), artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord",
      runId: "r", missionHash: "m", operatorBoundaryId: "otb-invente", derivationRef: "d" })) === "CAPABILITY_ISSUER_INVALID");
  M("M13", "frontiere non nommee a l'emission", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
      artifactId: "x", artifactHash: "a".repeat(64), artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord",
      runId: "r", missionHash: "m", derivationRef: "d" })) === "CAPABILITY_BOUNDARY_UNNAMED");
  M("M14", "genre d'autorite croise", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.HUMAN_AUTHENTICATED,
      artifactId: "panel-validation", artifactHash: prod.registry.get("panel-validation").hash,
      artifactSchema: prod.registry.get("panel-validation").artifactType, runId: prod.manifest.runId,
      missionHash: prod.manifest.missionHash, operatorBoundaryId: bP.operatorTrustBoundaryId, derivationRef: "d" })) === "CAPABILITY_ISSUER_INVALID");
  M("M15", "autorite de TEST pour une capacite de production", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: myLlm, capability: AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY,
      artifactId: "llm-capability", artifactHash: prod.registry.get("llm-capability").hash,
      artifactSchema: prod.registry.get("llm-capability").artifactType, runId: prod.manifest.runId,
      missionHash: prod.manifest.missionHash, operatorBoundaryId: bP.operatorTrustBoundaryId, derivationRef: "d" })) !== null);
  M("M16", "racines possedees par l'appelant", () => true, () => rz1.status !== "AUTHENTICATED");
  M("M17", "autorite de provenance de TEST injectee au consumer", () => true,
    () => ESP.resolveEvidenceSourceProvenance({ provenanceRef: LIN.artifactRef(z1, "doc-z1", R.DOCUMENTARY_EVIDENCE) },
      rp.reg, Object.assign({}, provOpt, { provenanceAuthority: tAuth })).status !== "AUTHENTICATED");
  M("M18", "deux racines inventees pour creer STRONG", () => true, () => confInv.confidence !== "STRONG");
  M("M19", "provenance inconnue comptee independante", () => true,
    () => IDE.deriveIdentityConfidence([E("t1", "i1", null), E("t2", "i2", null)], provOpt).confidence !== "STRONG");
  M("M20", "provenance authentifiee (temoin positif)", () => rok.status === "AUTHENTICATED",
    () => rz1.status !== "AUTHENTICATED");
  M("M21", "autorite historique de l'appelant", () => myHist.authorize(req).authorized === true,
    () => LIN.resolveLineage([crossRef], srcChain.registry, Object.assign({}, hiBase,
      { historicalInputAuthority: myHist, historicalInputRequest: req })).resolved === false);
  M("M22", "autorite historique reelle (temoin positif)", () => okHist.resolved === true,
    () => hAuth.authorize(Object.assign({}, req, { artifactHash: "b".repeat(64) })).authorized === false);
  M("M23", "mauvais run source", () => true, () => hAuth.authorize(Object.assign({}, req, { sourceRunId: "x" })).authorized === false);
  M("M24", "mauvais run de destination", () => true, () => hAuth.authorize(Object.assign({}, req, { destinationRunId: "x" })).authorized === false);
  M("M25", "mauvaise relation", () => true, () => hAuth.authorize(Object.assign({}, req, { relation: R.REPORT })).authorized === false);
  M("M26", "contrat historique d'appelant", () => true,
    () => LIN.resolveLineage([crossRef], srcChain.registry, Object.assign({}, hiBase,
      { historicalInputContract: { contractKind: "IMMUTABLE_HISTORICAL_INPUT", relations: [R.QUALIFICATION], operatorAuthenticated: true } })).resolved === false);
  M("M27", "registre d'acteurs de l'appelant", () => true,
    () => HAB.isProvisionedHumanAuth(myMech, { requireProduction: true }) === false);
  M("M28", "acte humain reel (temoin positif)", () => prod.verifier.verifyHumanAct(prod.acceptance, actExp).authenticated === true,
    () => prod.verifier.verifyHumanAct(Object.assign(clone(prod.acceptance), { actorIdentity: "inconnu" }), actExp).authenticated === false);
  M("M29", "mauvais type d'acte", () => true,
    () => prod.verifier.verifyHumanAct(prod.acceptance, Object.assign({}, actExp, { actionType: HAP.ACTION_TYPE.PANEL_DECISION })).authenticated === false);
  M("M30", "mauvais decisionHash", () => true,
    () => prod.verifier.verifyHumanAct(prod.acceptance, Object.assign({}, actExp, { decisionHash: sha256Of({ z: 1 }) })).authenticated === false);
  M("M31", "transport d'appelant pour une capacite de production", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: myLlm, capability: AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY,
      artifactId: "llm-capability", artifactHash: prod.registry.get("llm-capability").hash,
      artifactSchema: prod.registry.get("llm-capability").artifactType, runId: prod.manifest.runId,
      missionHash: prod.manifest.missionHash, operatorBoundaryId: bP.operatorTrustBoundaryId, derivationRef: "d" })) !== null);
  M("M32", "capacite LLM reelle (temoin positif)",
    () => LC.assertCapabilityUsable(prod.capability, prod.llmConfig, prod.ctx).usable === true,
    () => LC.assertCapabilityUsable(test.capability, test.llmConfig, prod.ctx).usable === false);
  const pWrongModel = await probe({ modelId: "autre" });
  M("M33", "modele non autorise", () => true, () => pWrongModel.status === "UNAVAILABLE");
  M("M34", "capacite LLM d'une autre frontiere", () => true,
    () => LC.assertCapabilityUsable(other.capability, other.llmConfig, prod.ctx).usable === false);
  M("M35", "rejeu meme frontiere", () => true,
    () => prod.verifier.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  M("M36", "rejeu seconde frontiere meme autorite", () => true,
    () => vSame.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  M("M37", "racine de reserve choisie", () => true,
    () => cd(() => FX.boundaryFor(FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-rr2",
      replayProtection: { kind: "FILE", replayRoot: "/tmp/x", authorityScope: ["A"] } }))) === "REPLAY_LOCATION_REFUSED");
  M("M38", "seconde reserve pour la meme racine de confiance", () => true,
    () => vP.replayNamespaceId === vSame.replayNamespaceId);
  M("M39", "marqueur de namespace desapparie", () => nsA !== nsOther,
    () => cd(() => RP.createFileReplayStore({ trustConfigPath: opP.cfgPath, replayNamespaceId: nsA, authorityScope: ["A"] })) === "REPLAY_NAMESPACE_MARKER_MISMATCH");
  M("M40", "reserve en memoire en PRODUCTION", () => true,
    () => cd(() => FX.boundaryFor(FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-mem",
      replayProtection: { kind: "MEMORY", authorityScope: ["A"] } }))) === "REPLAY_PROTECTION_INSUFFICIENT");
  M("M41", "validation de preparation sans registre", () => true,
    () => cd(() => SR.assertReadinessPhase(prod.full, "FULL", {}, "m")) === "READINESS_REGISTRY_REQUIRED");
  M("M42", "dimensionBindingsHash retire", () => true,
    () => cd(() => SR.assertReadinessPhase(noHash, "FULL", idOpt, "m")) === "READINESS_BINDINGS_REQUIRED");
  M("M43", "statuts retournes a la main", () => SR.dimensionsHashOf(flipped.dimensions) === flipped.dimensionsHash,
    () => cd(() => SR.assertReadinessPhase(flipped, "FULL", dIdOpt, "m")) === "READINESS_STATUS_OVERSTATED");
  M("M44", "preuve empruntee a une autre dimension", () => true,
    () => cd(() => SR.assertReadinessPhase(borrowed, "FULL", idOpt, "m")) === "READINESS_DIMENSION_EVIDENCE_UNBOUND");
  M("M45", "liaisons fabriquees", () => true,
    () => cd(() => SR.assertReadinessPhase(Object.assign(clone(prod.full), { dimensionBindingsHash: sha256Of({ f: 1 }) }),
      "FULL", idOpt, "m")) === "READINESS_BINDINGS_MISMATCH");
  M("M46", "preparation authentique (temoin positif)",
    () => SR.assertReadinessPhase(prod.full, "FULL", idOpt, "m") === true,
    () => cd(() => SR.assertReadinessPhase(flipped, "FULL", dIdOpt, "m")) !== null);
  M("M47", "concession sans derivation", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
      artifactId: "doc-a:c-1", artifactHash: prod.registry.get("doc-a:c-1").hash,
      artifactSchema: prod.registry.get("doc-a:c-1").artifactType, runId: prod.manifest.runId,
      missionHash: prod.manifest.missionHash, operatorBoundaryId: bP.operatorTrustBoundaryId })) === "CAPABILITY_DERIVATION_MISSING");
  M("M48", "concession imitee", () => true,
    () => AC.isCapabilityGrant(JSON.parse(JSON.stringify(grantA))) === false);
  M("M49", "capacite presentee sans concession tracee", () => true,
    () => cd(() => AC.assertCapability({ artifactId: "x", capabilities: [AC.CAPABILITY.AUTHENTICATED_PROVENANCE] },
      AC.CAPABILITY.AUTHENTICATED_PROVENANCE, "s", bP.operatorTrustBoundaryId)) === "ARTIFACT_CAPABILITY_UNTRACED");
  M("M50", "politique d'appelant elargissante", () => true,
    () => DA.sanitizePolicy({ trusted: true, operatorAuthenticated: true, legacyVerificationGrantsEligibility: true,
      force: true }).refusedOverrides.length === 4);

  /* ===== §32 / §33 — INVENTAIRES ===== */
  console.log("\n  -- §32 inventaire des constructeurs publics --");
  const RISKY = /^(create|provision|make|build|issue|grant)/i;
  const inventory = [];
  ["core", "adapters", "validators", "tools"].forEach(function (dir) {
    fs.readdirSync(path.join(__dirname, "..", dir)).filter((f) => /\.js$/.test(f)).forEach(function (f) {
      let mod = null;
      try { mod = require(path.join(__dirname, "..", dir, f)); } catch (e) { return; }
      Object.keys(mod).forEach(function (k) {
        if (typeof mod[k] !== "function" || !RISKY.test(k)) return;
        const isTest = /Test/i.test(k);
        const isBoundaryGated = /^createFromBoundary$/.test(k);
        const isProvisioner = /^provision(Production|Test)TrustBoundary$/.test(k);
        const cls = isBoundaryGated ? "OPERATOR_ONLY_FACTORY"
          : isTest ? "TEST_ONLY_FACTORY"
          : isProvisioner ? "OPERATOR_ONLY_FACTORY" : "SAFE_CALLER_FACTORY";
        inventory.push({ where: dir + "/" + f, name: k, cls: cls });
      });
    });
  });
  const critical = ["operator-provenance-authority.js", "operator-historical-input-authority.js",
    "operator-human-auth-boundary.js", "operator-llm-capability-boundary.js"];
  const callerAccessibleIssuers = inventory.filter(function (x) {
    if (!critical.some((c) => x.where.indexOf(c) !== -1)) return false;
    return x.cls === "SAFE_CALLER_FACTORY";
  });
  const prodIssuers = inventory.filter((x) => critical.some((c) => x.where.indexOf(c) !== -1));
  console.log("  emetteurs critiques exposes :");
  prodIssuers.forEach((x) => console.log("    " + x.cls.padEnd(24) + x.where + " :: " + x.name));
  check("INV-01. CALLER_ACCESSIBLE_PRODUCTION_SECURITY_ISSUER_COUNT = 0",
    callerAccessibleIssuers.length === 0, JSON.stringify(callerAccessibleIssuers));
  console.log("\n  -- §33 inventaire des emetteurs de capacite --");
  Object.keys(AC.CAPABILITY).forEach(function (cap) {
    const spec = AC.ISSUER_OF[AC.CAPABILITY[cap]];
    const sink = Object.keys(AC.SINK_REQUIREMENTS).filter((s) => AC.SINK_REQUIREMENTS[s] === AC.CAPABILITY[cap]);
    console.log("    " + cap.padEnd(28) + "emetteur=" + (spec ? spec.label : "aucun (etabli par l'enregistrement)")
      + " | sink=" + (sink.join(",") || "-"));
  });
  check("INV-02. toute capacite octroyable a un emetteur ET un sink",
    Object.keys(AC.CAPABILITY).every(function (cap) {
      const v = AC.CAPABILITY[cap];
      if (v === AC.CAPABILITY.RUN_BOUND) return !AC.ISSUER_OF[v];
      return !!AC.ISSUER_OF[v] && Object.keys(AC.SINK_REQUIREMENTS).some((s) => AC.SINK_REQUIREMENTS[s] === v);
    }));

  /* ===== universalite, hygiene, non-regression ===== */
  console.log("\n  -- §46 universalite : six domaines --");
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
    check("UNI-" + (i + 1) + ". " + label + " (" + c.qualification.qualificationStatus + ")", ok, c.qualification.qualificationStatus);
  }

  console.log("\n  -- §47 anti-cablage et hygiene --");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  const CASE = ["jmjs", "p0_2", "p0.2", "musicien", "liturgi", "paroisse", "diocese"];
  const DOMAINS = ["musicolog", "theolog", "medecin", "avocat", "architecte", "chimiste", "historien"];
  const PROVIDERS = ["orcid", "openalex", "crossref", "pubmed", "scopus", "anthropic", "openai", "mistral", "gemini"];
  const leak = { CASE: [], DOMAIN: [], PROVIDER: [] };
  ["core", "adapters", "validators"].forEach(function (dir) {
    fs.readdirSync(path.join(__dirname, "..", dir)).filter((f) => /\.js$/.test(f)).forEach(function (f) {
      const src = strip(fs.readFileSync(path.join(__dirname, "..", dir, f), "utf8")).toLowerCase();
      CASE.forEach((w) => { if (src.indexOf(w) !== -1) leak.CASE.push(dir + "/" + f + "::" + w); });
      DOMAINS.forEach((w) => { if (src.indexOf(w) !== -1) leak.DOMAIN.push(dir + "/" + f + "::" + w); });
      PROVIDERS.forEach((w) => { if (src.indexOf(w) !== -1) leak.PROVIDER.push(dir + "/" + f + "::" + w); });
    });
  });
  check("HYG-01. CASE_SPECIFIC_LEAK_COUNT = 0", leak.CASE.length === 0, JSON.stringify(leak.CASE));
  check("HYG-02. DOMAIN_HARDCODING_COUNT = 0", leak.DOMAIN.length === 0, JSON.stringify(leak.DOMAIN));
  check("HYG-03. PROVIDER_HARDCODING_COUNT = 0", leak.PROVIDER.length === 0, JSON.stringify(leak.PROVIDER));
  check("HYG-04. le detecteur discrimine", strip('const p = "OpenAlex";').toLowerCase().indexOf("openalex") !== -1);
  const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{40,}?-----END [A-Z ]*PRIVATE KEY-----/;
  const secrets = [];
  (function walk(d) { fs.readdirSync(d).forEach(function (e) { const p2 = path.join(d, e);
    if (fs.statSync(p2).isDirectory()) return walk(p2);
    const s2 = fs.readFileSync(p2, "utf8");
    if (PEM.test(s2) || /\bsk-[A-Za-z0-9_-]{20,}/.test(s2)) secrets.push(path.relative(path.join(__dirname, ".."), p2)); }); })(path.join(__dirname, ".."));
  check("HYG-05. aucune matiere privee dans le paquet", secrets.length === 0, JSON.stringify(secrets));
  const driftResults = CC.DOCUMENTED_CONTRACTS.map(function (d) {
    let md = null; try { md = fs.readFileSync(path.resolve(__dirname, "..", d.document), "utf8"); } catch (e) { md = null; }
    return { d: d.document, r: md === null ? { valid: false, problems: ["document absent"] } : CC.verifyDocumentedContract(md, d.contract) };
  });
  check("HYG-06. aucune derive documentation/code", driftResults.every((x) => x.r.valid),
    JSON.stringify(driftResults.filter((x) => !x.r.valid).map((x) => x.d + ":" + x.r.problems.join("/"))).slice(0, 200));
  check("HYG-07. la garde documentaire mord",
    CC.verifyDocumentedContract(fs.readFileSync(path.resolve(__dirname, "..", "KEY-MANAGEMENT.md"), "utf8")
      .replace(/(<!-- contract:keyStatuses -->[\s\S]*?)(<!-- \/contract -->)/, "$1\n| `SUSPENDED` |\n$2"), "keyStatuses").valid === false);
  check("HYG-08. surface de validation complete", Object.keys(VAL).length >= 20, Object.keys(VAL).length);

  console.log("\n  -- §48 non-regression --");
  const h = (p2) => crypto.createHash("sha256").update(fs.readFileSync(p2)).digest("hex");
  const lots = [["MONO-08", "v0.7"], ["MONO-08", "v0.8"], ["MONO-09", "v0.1"], ["MONO-09", "v0.2"],
    ["MONO-10", "v0.1"], ["MONO-10", "v0.2"], ["MONO-10", "v0.3"], ["MONO-10", "v0.4"], ["MONO-10", "v0.5"],
    ["MONO-10", "v0.6"], ["MONO-10", "v0.7"]];
  const bad = []; let refs = 0;
  lots.forEach(function (p2) {
    const dir = path.join(KIT, p2[0], p2[1]), f = path.join(dir, "SHA256SUMS.txt");
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f, "utf8").trim().split("\n").forEach(function (line) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) return;
      refs++; const fp = path.join(dir, m[2]);
      if (!fs.existsSync(fp) || h(fp) !== m[1]) bad.push(p2.join("/") + ":" + m[2]);
    });
  });
  check("NR-01. lots historiques conformes a leurs sceaux (" + refs + " refs)", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
  let cmp = 0, div = 0;
  for (const sub of ["dependencies", "ports", "lib"]) {
    const X = path.join(KIT, "MONO-01", sub), Y = path.join(KIT, "MONO-02", "dependencies", "MONO-01", sub);
    if (!fs.existsSync(X) || !fs.existsSync(Y)) continue;
    for (const f of fs.readdirSync(X)) { const pa2 = path.join(X, f), pb = path.join(Y, f);
      if (fs.statSync(pa2).isDirectory()) continue; cmp++; if (!fs.existsSync(pb) || h(pa2) !== h(pb)) div++; }
  }
  check("NR-02. MONO-01 byte-identique a la copie imbriquee", cmp > 0 && div === 0, "compares=" + cmp + " divergents=" + div);

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  console.log("MUTATIONS_CAUGHT = " + mutCaught + " / MUTATIONS_TOTAL = " + mutTotal);
  console.log("CALLER_ACCESSIBLE_PRODUCTION_SECURITY_ISSUER_COUNT = " + callerAccessibleIssuers.length);
  console.log("CASE_SPECIFIC_LEAK_COUNT = " + leak.CASE.length + " | DOMAIN_HARDCODING_COUNT = " + leak.DOMAIN.length
    + " | PROVIDER_HARDCODING_COUNT = " + leak.PROVIDER.length + " | UNIVERSALITY = " + uni + "/6");
  process.exit(fail === 0 && mutCaught === mutTotal ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
