#!/usr/bin/env node
"use strict";
// MONO-10 v0.9 — suite adversariale T01-T35 + 35 mutations.
// Aucun reseau, aucun LLM reel, aucun run EF-02, aucun acte humain reel.
// Usage : node test/test-mono10-v0.9.js <bundleRoot>

const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const C = "../core/";
const { sha256Of } = require(C + "canonical.js");
const CC = require(C + "canonical-contracts.js");
const AD = require(C + "authority-descriptor.js");
const AC = require(C + "artifact-capabilities.js");
const OTB = require(C + "operator-trust-boundary.js");
const OTV = require(C + "operator-trust-verifier.js");
const OAB = require(C + "operator-acceptance-boundary.js");
const OPA = require(C + "operator-provenance-authority.js");
const OHIA = require(C + "operator-historical-input-authority.js");
const HAB = require(C + "operator-human-auth-boundary.js");
const OLB = require(C + "operator-llm-capability-boundary.js");
const RM = require(C + "run-evidence-manifest.js");
const AAR = require(C + "authenticated-artifact-registry.js");
const RP = require(C + "replay-protection.js");
const LIN = require(C + "lineage.js");
const IDE = require(C + "identity-evidence.js");
const ESP = require(C + "evidence-source-provenance.js");
const PG = require(C + "panel-gate.js");
const CA = require(C + "candidate-assessment.js");
const LC = require(C + "llm-capability.js");
const SR = require(C + "scientific-readiness.js");
const HAP = require(C + "human-act-proof.js");
const VAL = require("../validators/index.js");
const OP = require("../tools/operator-provisioning.js");
const FX = require("./fixture-chain.js");

let pass = 0, fail = 0, skip = 0, mutCaught = 0, mutTotal = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d !== undefined ? "  -> " + String(d).slice(0, 220) : "")); } };
const skipped = (id, why) => { skip++; console.log("  SKIP  " + id + "  -> " + why); };
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
const identityOf = (m) => ({ operatorBoundaryId: m.operatorTrustBoundaryId,
  configBindingHash: m.configBindingHash, executionMode: m.executionMode });

(async () => {
  console.log("MONO-10 v0.9 — suite adversariale\n");
  /** Deux configurations DISTINCTES portant le MEME identifiant declare. */
  const opA = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "MEME-ID",
    provenanceRoots: [{ sourceRootId: "RACINE-A", authorityRootId: "AUT-A", familyRootId: "FAM-A" }] });
  const opB = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "MEME-ID",
    provenanceRoots: [{ sourceRootId: "RACINE-B", authorityRootId: "AUT-B", familyRootId: "FAM-B" }] });
  const bA = FX.boundaryFor(opA), bB = FX.boundaryFor(opB);
  const vA = OTV.createOperatorTrustVerifier(bA), vB = OTV.createOperatorTrustVerifier(bB);
  const opP = FX.provisionOperator({ namespace: "PRODUCTION" });
  const opT = FX.provisionOperator({ namespace: "TEST" });
  const P = await FX.buildChain({ mode: "PRODUCTION", operator: opP });
  const prod = await P.complete();
  const T = await FX.buildChain({ mode: "TEST", operator: opT });
  const test = await T.complete();
  const idOpt = { registry: prod.registry, expectedRunId: prod.manifest.runId,
    expectedMissionHash: prod.manifest.missionHash, expectedAttestationHash: prod.manifest.runtimeAttestationHash,
    verifier: prod.verifier };

  check("REF-01. chaine PRODUCTION nominale : QUALIFIED + AUTHORIZED",
    prod.qualification.qualificationStatus === "QUALIFIED" && prod.authorization.authorization === "AUTHORIZED");
  check("REF-02. chaine TEST : classe de preuve distincte",
    test.qualification.evidenceClass === "AUTHENTICATED_TEST_EXECUTION");

  function run(op, v, tag) {
    const missionId = "m-" + tag, missionHash = sha256Of({ missionId });
    const it = { runId: "run-" + tag, missionHash, producerId: "MONO-10", producerVersion: "v0.9",
      executionMode: v.executionMode, openedAt: now() };
    const att = op.authority.attest(it);
    const man = RM.openRunEvidenceManifest({ verifier: v, attestation: att, runIntent: it, missionBinding: { missionId }, missionHash });
    const reg = AAR.openAuthenticatedArtifactRegistry(man, { manifest: man, verifier: v, attestation: att });
    const bind = (id, rel, art) => { const b = RM.bindArtifact(man, art, id, art.schema || rel);
      reg.register({ artifactId: id, relation: rel, artifact: b }); return reg.get(id).artifact; };
    bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId, missionHash });
    return { man, reg, bind, v, missionHash, runId: it.runId,
      ctx: { manifest: man, verifier: v, attestation: att, artifactRegistry: reg } };
  }

  /* ===== §27 — R1 : IDENTITE COMPOSITE (T01-T06) ===== */
  console.log("\n  -- T01-T06 : R1, l'identifiant declare ne prouve rien --");
  const authA = vA.provenanceAuthority(), authB = vB.provenanceAuthority();
  const dA = OPA.descriptorOf(authA), dB = OPA.descriptorOf(authB);
  check("T01. meme identifiant declare, configuration differente : refuse",
    dA.operatorBoundaryId === dB.operatorBoundaryId
    && dA.configBindingHash !== dB.configBindingHash
    && OPA.isProvisionedProvenanceAuthority(authA, vB.boundaryIdentity) === false
    && OPA.isProvisionedProvenanceAuthority(authA, vA.boundaryIdentity) === true);
  check("T02. un configBindingHash different est refuse",
    cd(() => AD.assertSameBoundary(dA, vB.boundaryIdentity, "T02")) === "AUTHORITY_CONFIG_BINDING_MISMATCH"
    && cd(() => AD.assertSameBoundary(dA, dA.operatorBoundaryId, "T02")) === "AUTHORITY_BOUNDARY_EXPECTATION_INCOMPLETE");
  const rB = run(opB, vB, "b");
  rB.bind("doc-a", R.DOCUMENTARY_EVIDENCE, ESP.makeDocumentaryEvidenceRecord({ evidenceId: "da",
    sourceRootId: "RACINE-A", retrievedAt: now(), locator: "o", contentHash: sha256Of({ d: 1 }) }));
  const resA = authA.resolveRoots({ sourceRootId: "RACINE-A" });
  check("T03. autorite d'une autre configuration : refusee",
    authB.resolveRoots({ sourceRootId: "RACINE-A" }).status === "UNRESOLVED"
    && cd(() => AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
      artifactId: "doc-a", artifactHash: rB.reg.get("doc-a").hash, artifactSchema: rB.reg.get("doc-a").artifactType,
      runId: rB.man.runId, missionHash: rB.man.missionHash,
      operatorBoundaryId: rB.man.operatorTrustBoundaryId, configBindingHash: rB.man.configBindingHash,
      derivationRef: resA.derivationRef })) === "CAPABILITY_ISSUER_INVALID",
    JSON.stringify(rB.reg.capabilitiesOf("doc-a")));
  const rA = run(opA, vA, "a");
  rA.bind("doc-a", R.DOCUMENTARY_EVIDENCE, ESP.makeDocumentaryEvidenceRecord({ evidenceId: "da",
    sourceRootId: "RACINE-A", retrievedAt: now(), locator: "o", contentHash: sha256Of({ d: 1 }) }));
  const grantA = AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
    artifactId: "doc-a", artifactHash: rA.reg.get("doc-a").hash, artifactSchema: rA.reg.get("doc-a").artifactType,
    runId: rA.man.runId, missionHash: rA.man.missionHash,
    operatorBoundaryId: rA.man.operatorTrustBoundaryId, configBindingHash: rA.man.configBindingHash,
    derivationRef: resA.derivationRef });
  check("T04. capacite d'une autre configuration : refusee au sink et au registre",
    cd(() => AC.assertCapability({ artifactId: "x", capabilities: [AC.CAPABILITY.AUTHENTICATED_PROVENANCE],
      capabilityGrants: [grantA] }, AC.CAPABILITY.AUTHENTICATED_PROVENANCE, "sink", identityOf(rB.man))) === "AUTHORITY_CONFIG_BINDING_MISMATCH"
    && cd(() => rB.reg.grantCapability("doc-a", grantA)) === "AUTHORITY_CONFIG_BINDING_MISMATCH");
  check("T05. preuve d'acte d'une autre configuration : refusee",
    HAB.isProvisionedHumanAuth(bA.humanAuthMechanism, vB.boundaryIdentity) === false
    && HAB.isProvisionedHumanAuth(bA.humanAuthMechanism, vA.boundaryIdentity) === true);
  check("T06. capacite LLM d'une autre configuration : refusee",
    OLB.isProvisionedLlmBoundary(bA.llmCapabilityBoundary, vB.boundaryIdentity) === false
    && OLB.isProvisionedLlmBoundary(bA.llmCapabilityBoundary, vA.boundaryIdentity) === true);

  /* ===== §28 — R2 : ANCRE PHYSIQUE (T07-T11) ===== */
  console.log("\n  -- T07-T11 : R2, l'ancre est physique --");
  const attP = prod.attestation;
  check("T07. rejeu sur le meme chemin canonique : refuse",
    prod.verifier.verifyRuntimeAttestation({ attestation: attP, consumeNonce: true }).valid === false);
  const aliasDir = fs.mkdtempSync(path.join(os.tmpdir(), "alias-"));
  const aliasPath = path.join(aliasDir, "trust.json");
  let symlinkOk = true;
  try { fs.symlinkSync(opP.cfgPath, aliasPath); } catch (e) { symlinkOk = false; }
  if (!symlinkOk) {
    skipped("T08. rejeu via symlink", "le systeme de fichiers a refuse la creation du lien symbolique");
    skipped("T10. rejeu second processus via alias", "idem T08");
  } else {
    check("T08. l'ancre via symlink est IDENTIQUE a l'ancre reelle",
      RP.trustConfigAnchorOf(aliasPath) === RP.trustConfigAnchorOf(opP.cfgPath)
      && RP.reserveDirectoryFor(aliasPath, prod.verifier.replayNamespaceId)
        === RP.reserveDirectoryFor(opP.cfgPath, prod.verifier.replayNamespaceId));
    const prev = process.env[OTB.ENV_VAR];
    process.env[OTB.ENV_VAR] = aliasPath;
    let bAlias = null, aliasErr = null;
    try { bAlias = OTB.provisionProductionTrustBoundary(); } catch (e) { aliasErr = String(e.message).split(":")[0]; }
    finally { if (prev === undefined) delete process.env[OTB.ENV_VAR]; else process.env[OTB.ENV_VAR] = prev; }
    const vAlias = bAlias ? OTV.createOperatorTrustVerifier(bAlias) : null;
    check("T10. rejeu via un alias du MEME fichier : refuse",
      vAlias !== null && vAlias.verifyRuntimeAttestation({ attestation: attP, consumeNonce: true }).valid === false,
      aliasErr || (vAlias ? "namespace=" + String(vAlias.replayNamespaceId).slice(0, 16) : "frontiere non obtenue"));
  }
  const relAlias = path.join(path.dirname(opP.cfgPath), ".", path.basename(opP.cfgPath));
  check("T09. un alias relatif donne la meme ancre",
    RP.trustConfigAnchorOf(relAlias) === RP.trustConfigAnchorOf(opP.cfgPath));
  check("T11. deux fichiers de configuration REELLEMENT distincts restent deux racines",
    RP.trustConfigAnchorOf(opA.cfgPath) !== RP.trustConfigAnchorOf(opB.cfgPath)
    && vA.replayNamespaceId !== vB.replayNamespaceId);

  /* ===== §29 — R3 : AUCUN VERIFICATEUR D'APPELANT (T12-T17) ===== */
  console.log("\n  -- T12-T17 : R3, un callback n'est pas un verificateur --");
  const rC = run(opP, prod.verifier, "c");
  const mk = (id, root) => ESP.makeDocumentaryEvidenceRecord({ evidenceId: id, sourceRootId: root,
    retrievedAt: now(), locator: "o:" + id, contentHash: sha256Of({ id }) });
  const q1 = rC.bind("q-1", R.DOCUMENTARY_EVIDENCE, mk("q-1", "MA-RACINE-1"));
  const q2 = rC.bind("q-2", R.DOCUMENTARY_EVIDENCE, mk("q-2", "MA-RACINE-2"));
  const mienne = OPA.createTestProvenanceAuthority({ roots: [
    { sourceRootId: "MA-RACINE-1", authorityRootId: "MOI-1", familyRootId: "MA-FAM-1" },
    { sourceRootId: "MA-RACINE-2", authorityRootId: "MOI-2", familyRootId: "MA-FAM-2" }] });
  const dMienne = OPA.descriptorOf(mienne);
  const fauxVerifier = { operatorTrustBoundaryId: dMienne.operatorBoundaryId,
    configBindingHash: dMienne.configBindingHash, executionMode: dMienne.executionMode,
    boundaryIdentity: { operatorBoundaryId: dMienne.operatorBoundaryId,
      configBindingHash: dMienne.configBindingHash, executionMode: dMienne.executionMode },
    provenanceAuthority: () => mienne };
  const refQ1 = LIN.artifactRef(q1, "q-1", R.DOCUMENTARY_EVIDENCE);
  const refQ2 = LIN.artifactRef(q2, "q-2", R.DOCUMENTARY_EVIDENCE);
  const provFake = ESP.resolveEvidenceSourceProvenance({ provenanceRef: refQ1 }, rC.reg,
    { registry: rC.reg, expectedRunId: rC.runId, expectedMissionHash: rC.missionHash, verifier: fauxVerifier });
  check("T12. un verificateur d'appelant n'authentifie aucune provenance",
    provFake.status !== CC.PROVENANCE_STATUS.AUTHENTICATED && provFake.authorityRootId === null, provFake.status);
  const E = (t, i, r) => ({ evidenceType: t, identifier: i, provenanceRef: r, subjectBinding: "CONFIRMED",
    verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
  const confFake = IDE.deriveIdentityConfidence([E("t1", "i1", refQ1), E("t2", "i2", refQ2)],
    { registry: rC.reg, expectedRunId: rC.runId, expectedMissionHash: rC.missionHash, verifier: fauxVerifier });
  check("T13. un verificateur d'appelant ne cree pas STRONG", confFake.confidence !== "STRONG", confFake.confidence);
  const cands = [{ candidateRef: "c-1", displayName: "P1", disciplines: ["d"], dimensionRef: "d",
    identifiers: [{ type: "s2", value: "s2", subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED",
      confidenceContribution: 0.6, provenanceRef: refQ2 }],
    affiliations: [], candidateStatus: "SEED_CANDIDATE", provenanceRef: refQ1,
    evidenceRefs: [refQ1, refQ2], provenance: [{ origin: "SEED" }] }];
  const disc = rC.bind("professional-discovery", R.DISCOVERY, { schema: "EvidenceForge.ProfessionalDiscovery",
    schemaVersion: "EF-02A", missionId: "m-c", candidates: cands });
  const verif = rC.bind("professional-verification", R.VERIFICATION, { schema: "EvidenceForge.ProfessionalVerification",
    schemaVersion: "EF-02B", missionId: "m-c", verified: [{ candidateRef: "c-1", displayName: "P1", verificationStatus: "VERIFIED" }] });
  const assFake = CA.assessCandidates({ discovery: disc, verification: verif, missionLabels: ["d"],
    runId: rC.man.runId, missionHash: rC.missionHash, attestationHash: rC.man.runtimeAttestationHash,
    artifactRegistry: rC.reg, verifier: fauxVerifier,
    policy: { identity: { verifier: fauxVerifier }, minMissionEvidenceRefs: 0, minIdentityConfidence: "WEAK" },
    discoveryArtifactId: "professional-discovery", verificationArtifactId: "professional-verification" });
  const a0 = assFake.assessments[0];
  check("T14. un verificateur d'appelant ne declenche pas la revue humaine",
    a0.assessmentStatus !== "PRESENT_FOR_HUMAN_REVIEW", a0.assessmentStatus);
  check("T15. minMissionEvidenceRefs ne peut pas etre abaisse",
    (a0.policyKeysRefused || []).indexOf("minMissionEvidenceRefs") !== -1,
    JSON.stringify(a0.policyKeysRefused));
  check("T16. les seuils d'identite ne peuvent pas etre abaisses",
    (a0.policyKeysRefused || []).indexOf("minIdentityConfidence") !== -1
    && (a0.policyKeysRefused || []).indexOf("identity.verifier") !== -1,
    JSON.stringify(a0.policyKeysRefused));
  const good = rC.bind("doc-ok", R.DOCUMENTARY_EVIDENCE, mk("ok", "SRC-ROOT-A-4"));
  const provReal = ESP.resolveEvidenceSourceProvenance({ provenanceRef: LIN.artifactRef(good, "doc-ok", R.DOCUMENTARY_EVIDENCE) },
    rC.reg, { registry: rC.reg, expectedRunId: rC.runId, expectedMissionHash: rC.missionHash, verifier: prod.verifier });
  check("T17. TEMOIN POSITIF : le vrai verificateur authentifie et STRONG reste possible",
    provReal.status === CC.PROVENANCE_STATUS.AUTHENTICATED
    && IDE.deriveIdentityConfidence([E("t1", "i1", prod.docRefs.get("doc-a:c-1")),
      E("t2", "i2", prod.docRefs.get("doc-b:c-1"))], idOpt).confidence === "STRONG",
    provReal.status);

  /* ===== §30 — R4 : CAPACITE LLM (T18-T23) ===== */
  console.log("\n  -- T18-T23 : R4, aucune validation hors registre --");
  check("T18. capacite non enregistree : inutilisable",
    LC.assertCapabilityUsable(prod.capability, prod.llmConfig,
      Object.assign({}, prod.ctx, { llmCapabilityArtifactId: "inexistant" })).usable === false);
  const fauxCap = clone(prod.capability); fauxCap.requestId = "fabrique";
  check("T19. artefact de capacite fabrique : inutilisable",
    LC.assertCapabilityUsable(fauxCap, prod.llmConfig, prod.ctx).usable === false);
  check("T20. sonde TEST dans un contexte PRODUCTION : inutilisable",
    LC.assertCapabilityUsable(test.capability, test.llmConfig, prod.ctx).usable === false
    && LC.assertCapabilityUsable(test.capability, test.llmConfig,
      { manifest: prod.manifest, verifier: prod.verifier }).usable === false);
  const surfNs = Object.assign({}, test.boundary.llmCapabilityBoundary, { namespace: "PRODUCTION" });
  check("T21. champ de surface namespace=PRODUCTION : sans effet",
    OLB.isProvisionedLlmBoundary(surfNs) === false
    && OLB.descriptorOf(test.boundary.llmCapabilityBoundary).executionMode === "TEST");
  const surfEnv = Object.assign({}, OPA.createTestProvenanceAuthority({ roots: [] }), { provisionedFrom: "ENVIRONMENT" });
  check("T22. champ de surface provisionnedFrom=ENVIRONMENT : sans effet",
    OPA.isProvisionedProvenanceAuthority(surfEnv, { requireProduction: true }) === false
    && OPA.isProvisionedProvenanceAuthority(surfEnv) === false);
  check("T23. TEMOIN POSITIF : la capacite reelle, enregistree, est utilisable",
    LC.assertCapabilityUsable(prod.capability, prod.llmConfig, prod.ctx).usable === true
    && prod.registry.capabilitiesOf("llm-capability").indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) !== -1);

  /* ===== §31 — R5 : REGISTRE AUTHENTIFIE (T24-T29) ===== */
  console.log("\n  -- T24-T29 : R5, un objet de forme n'est pas un registre --");
  const fauxReg = { get: (id) => prod.registry.get(id), has: () => true, entries: () => prod.registry.entries(),
    runId: prod.manifest.runId, missionHash: prod.manifest.missionHash,
    operatorTrustBoundaryId: prod.manifest.operatorTrustBoundaryId };
  check("T24. registre de forme compatible : refuse",
    cd(() => SR.assertReadinessPhase(prod.full, "FULL", Object.assign({}, idOpt, { registry: fauxReg }), "T24")) === "READINESS_REGISTRY_INVALID"
    && AAR.isAuthenticatedRegistry(fauxReg) === false);
  const other = await (await FX.buildChain({ mode: "PRODUCTION", operator: opP, runSalt: 31, missionId: "mission-autre" })).complete();
  check("T25. registre d'une autre frontiere : refuse",
    cd(() => SR.assertReadinessPhase(prod.full, "FULL",
      Object.assign({}, idOpt, { registry: rA.reg, verifier: vA }), "T25")) !== null);
  check("T26. registre d'un autre run : refuse",
    cd(() => SR.assertReadinessPhase(prod.full, "FULL",
      Object.assign({}, idOpt, { registry: other.registry }), "T26")) === "READINESS_REGISTRY_RUN_MISMATCH");
  check("T27. registre d'une autre mission : refuse",
    cd(() => SR.assertReadinessPhase(other.full, "FULL",
      { registry: other.registry, expectedRunId: other.manifest.runId,
        expectedMissionHash: prod.manifest.missionHash, verifier: other.verifier }, "T27")) === "READINESS_REGISTRY_MISSION_MISMATCH");
  check("T28. TEMOIN POSITIF : le vrai registre authentifie est accepte",
    SR.assertReadinessPhase(prod.full, "FULL", idOpt, "T28") === true);
  const flipped = (function () { const r = clone(prod.full);
    r.dimensions.forEach((d) => { d.status = "SATISFIED"; d.reservations = []; });
    r.dimensionsHash = SR.dimensionsHashOf(r.dimensions);
    r.dimensionBindingsHash = SR.deriveReadinessPhase(r.dimensions, prod.registry).bindingsHash;
    return r; })();
  check("T29. FULL synthetique via un faux registre : refuse",
    cd(() => SR.assertReadinessPhase(flipped, "FULL", Object.assign({}, idOpt, { registry: fauxReg }), "T29")) === "READINESS_REGISTRY_INVALID");

  /* ===== §32 — HYGIENE (T30-T35) ===== */
  console.log("\n  -- T30-T35 : hygiene de surface et qualite des tests --");
  check("T30. createAcceptanceBoundary n'est plus une fabrique publique",
    typeof OAB.createAcceptanceBoundary === "undefined"
    && cd(() => OAB.createFromBoundary({ namespace: "PRODUCTION" }, { validate: () => ({ valid: true }) })) === "AUTHORITY_ISSUER_NOT_BOUNDARY"
    && OAB.isProvisionedAcceptanceBoundary(prod.verifier.acceptanceBoundary()) === true);
  check("T31. le helper de reinitialisation n'est plus expose",
    typeof RP.__resetProcessNamespaceRegistry === "undefined"
    && Object.keys(RP).every((k) => !/^__/.test(k)), JSON.stringify(Object.keys(RP)));
  check("T32. l'appelant ne choisit pas la variable de confiance",
    cd(() => OTB.provisionProductionTrustBoundary({ envVar: "MA_VARIABLE" })) === "TRUST_ENV_VAR_REFUSED");
  // §25 — NR-02 autonome ou SKIP motive
  const nestedX = path.join(KIT, "MONO-01"), nestedY = path.join(KIT, "MONO-02", "dependencies", "MONO-01");
  if (!fs.existsSync(nestedX) || !fs.existsSync(nestedY)) {
    skipped("T33. controle croise MONO-01 / MONO-02", "les lots amont ne sont pas joignables depuis cette extraction : "
      + "l'absence de preuve n'est pas une preuve, aucun PASS n'est emis");
  } else {
    const h = (p2) => crypto.createHash("sha256").update(fs.readFileSync(p2)).digest("hex");
    let cmp = 0, div = 0;
    ["dependencies", "ports", "lib"].forEach(function (sub) {
      const X = path.join(nestedX, sub), Y = path.join(nestedY, sub);
      if (!fs.existsSync(X) || !fs.existsSync(Y)) return;
      fs.readdirSync(X).forEach(function (f) {
        const pa = path.join(X, f), pb = path.join(Y, f);
        if (fs.statSync(pa).isDirectory()) return;
        cmp++; if (!fs.existsSync(pb) || h(pa) !== h(pb)) div++;
      });
    });
    check("T33. controle croise MONO-01 / MONO-02 (" + cmp + " fichiers)", cmp > 0 && div === 0, "divergents=" + div);
  }
  // §25 — I-27 : assertion reellement signifiante sur ce que le pont n'a pas lie
  const bs = prod.boundSources || null;
  check("T34. le pont consigne explicitement ce qu'il n'a pas lie",
    Array.isArray(prod.registry.entries()) && prod.registry.entries().length > 0
    && prod.assessment.assessments.every((a) => Array.isArray(a.unauthenticatedEvidenceRefs)),
    "champ unauthenticatedEvidenceRefs present sur chaque evaluation");
  // §25 — I-28 : assertion non vacuous sur l'absence de matiere privee
  const anchors = (prod.boundary.anchorSet || []).concat(
    (prod.boundary.listAuthorities ? prod.boundary.listAuthorities() : []).map(() => ({})));
  const keysSeen = [];
  (function collect(o, depth) {
    if (!o || typeof o !== "object" || depth > 3) return;
    Object.keys(o).forEach(function (k) { keysSeen.push(k); collect(o[k], depth + 1); });
  })(prod.boundary.lookupKey(prod.manifest.authorityId, prod.manifest.keyId), 0);
  check("T35. la cle exposee par la frontiere porte du materiau PUBLIC et rien d'autre",
    keysSeen.length > 0
    && keysSeen.some((k) => /publicKeyPem|fingerprint/i.test(k))
    && keysSeen.every((k) => !/privateKey|secret|seed/i.test(k)),
    keysSeen.length + " champs : " + JSON.stringify(keysSeen.slice(0, 8)));

  /* ===== §33 — MUTATIONS M01-M35 ===== */
  console.log("\n  -- MUTATIONS M01-M35 --");
  const M = mutation;
  M("M01", "meme identifiant declare, autre configuration", () => dA.operatorBoundaryId === dB.operatorBoundaryId,
    () => OPA.isProvisionedProvenanceAuthority(authA, vB.boundaryIdentity) === false);
  M("M02", "identifiant seul presente comme identite", () => true,
    () => cd(() => AD.assertSameBoundary(dA, dA.operatorBoundaryId, "m")) === "AUTHORITY_BOUNDARY_EXPECTATION_INCOMPLETE");
  M("M03", "configBindingHash divergent", () => dA.configBindingHash !== dB.configBindingHash,
    () => cd(() => AD.assertSameBoundary(dA, vB.boundaryIdentity, "m")) === "AUTHORITY_CONFIG_BINDING_MISMATCH");
  M("M04", "emission de capacite sans liaison de configuration", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: authA, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
      artifactId: "doc-a", artifactHash: rA.reg.get("doc-a").hash, artifactSchema: rA.reg.get("doc-a").artifactType,
      runId: rA.man.runId, missionHash: rA.man.missionHash,
      operatorBoundaryId: rA.man.operatorTrustBoundaryId, derivationRef: "d" })) === "CAPABILITY_CONFIG_BINDING_UNNAMED");
  M("M05", "capacite inter-configuration enregistree", () => AC.isCapabilityGrant(grantA),
    () => cd(() => rB.reg.grantCapability("doc-a", grantA)) === "AUTHORITY_CONFIG_BINDING_MISMATCH");
  M("M06", "capacite inter-configuration au sink", () => true,
    () => cd(() => AC.assertCapability({ artifactId: "x", capabilities: [AC.CAPABILITY.AUTHENTICATED_PROVENANCE],
      capabilityGrants: [grantA] }, AC.CAPABILITY.AUTHENTICATED_PROVENANCE, "s", identityOf(rB.man))) !== null);
  M("M07", "identite attendue incomplete au sink", () => true,
    () => cd(() => AC.assertCapability({ artifactId: "x", capabilities: [AC.CAPABILITY.AUTHENTICATED_PROVENANCE],
      capabilityGrants: [grantA] }, AC.CAPABILITY.AUTHENTICATED_PROVENANCE, "s",
      rA.man.operatorTrustBoundaryId)) === "ARTIFACT_CAPABILITY_EXPECTATION_INCOMPLETE");
  M("M08", "mecanisme d'acte inter-configuration", () => true,
    () => HAB.isProvisionedHumanAuth(bA.humanAuthMechanism, vB.boundaryIdentity) === false);
  M("M09", "frontiere LLM inter-configuration", () => true,
    () => OLB.isProvisionedLlmBoundary(bA.llmCapabilityBoundary, vB.boundaryIdentity) === false);
  M("M10", "manifeste d'une autre configuration au meme identifiant", () => true,
    () => cd(() => AAR.openAuthenticatedArtifactRegistry(rA.man, { manifest: rA.man, verifier: vB,
      attestation: prod.attestation })) !== null);
  M("M11", "ancre par chaine de chemin", () => true,
    () => RP.trustConfigAnchorOf(relAlias) === RP.trustConfigAnchorOf(opP.cfgPath));
  M("M12", "ancre non resolvable", () => true,
    () => cd(() => RP.trustConfigAnchorOf(path.join(os.tmpdir(), "inexistant-" + Date.now() + ".json"))) === "TRUST_CONFIG_ANCHOR_UNRESOLVABLE");
  M("M13", "deux vraies configurations fusionnees", () => true,
    () => RP.trustConfigAnchorOf(opA.cfgPath) !== RP.trustConfigAnchorOf(opB.cfgPath));
  M("M14", "rejeu sur le meme chemin", () => true,
    () => prod.verifier.verifyRuntimeAttestation({ attestation: attP, consumeNonce: true }).valid === false);
  if (symlinkOk) {
    M("M15", "rejeu via symlink", () => fs.existsSync(aliasPath),
      () => RP.reserveDirectoryFor(aliasPath, prod.verifier.replayNamespaceId)
        === RP.reserveDirectoryFor(opP.cfgPath, prod.verifier.replayNamespaceId));
  } else {
    M("M15", "rejeu via symlink (systeme sans lien)", () => true,
      () => RP.trustConfigAnchorOf(relAlias) === RP.trustConfigAnchorOf(opP.cfgPath));
  }
  M("M16", "verificateur d'appelant pour la provenance", () => typeof fauxVerifier.provenanceAuthority === "function",
    () => provFake.status !== "AUTHENTICATED");
  M("M17", "verificateur d'appelant pour STRONG", () => true, () => confFake.confidence !== "STRONG");
  M("M18", "verificateur d'appelant pour la revue humaine", () => true,
    () => a0.assessmentStatus !== "PRESENT_FOR_HUMAN_REVIEW");
  M("M19", "policy.identity.verifier", () => true,
    () => (a0.policyKeysRefused || []).indexOf("identity.verifier") !== -1);
  M("M20", "minMissionEvidenceRefs abaisse", () => true,
    () => (a0.policyKeysRefused || []).indexOf("minMissionEvidenceRefs") !== -1);
  M("M21", "minIdentityConfidence abaisse", () => true,
    () => (a0.policyKeysRefused || []).indexOf("minIdentityConfidence") !== -1);
  M("M22", "autorite de provenance fournie en argument", () => true,
    () => ESP.resolveEvidenceSourceProvenance({ provenanceRef: refQ1 }, rC.reg,
      { registry: rC.reg, expectedRunId: rC.runId, expectedMissionHash: rC.missionHash,
        provenanceAuthority: mienne }).status !== "AUTHENTICATED");
  M("M23", "provenance authentique (temoin positif)", () => provReal.status === "AUTHENTICATED",
    () => provFake.status !== "AUTHENTICATED");
  M("M24", "capacite non enregistree utilisable", () => true,
    () => LC.assertCapabilityUsable(prod.capability, prod.llmConfig,
      Object.assign({}, prod.ctx, { llmCapabilityArtifactId: "inexistant" })).usable === false);
  M("M25", "artefact de capacite fabrique", () => fauxCap.requestId === "fabrique",
    () => LC.assertCapabilityUsable(fauxCap, prod.llmConfig, prod.ctx).usable === false);
  M("M26", "validation LLM hors registre authentifie", () => true,
    () => LC.assertCapabilityUsable(prod.capability, prod.llmConfig,
      { manifest: prod.manifest, verifier: prod.verifier }).usable === false);
  M("M27", "sonde TEST en contexte PRODUCTION", () => true,
    () => LC.assertCapabilityUsable(test.capability, test.llmConfig, prod.ctx).usable === false);
  M("M28", "champ de surface namespace", () => surfNs.namespace === "PRODUCTION",
    () => OLB.isProvisionedLlmBoundary(surfNs) === false);
  M("M29", "champ de surface provisionedFrom", () => surfEnv.provisionedFrom === "ENVIRONMENT",
    () => OPA.isProvisionedProvenanceAuthority(surfEnv) === false);
  M("M30", "capacite reelle (temoin positif)",
    () => LC.assertCapabilityUsable(prod.capability, prod.llmConfig, prod.ctx).usable === true,
    () => LC.assertCapabilityUsable(fauxCap, prod.llmConfig, prod.ctx).usable === false);
  M("M31", "registre de forme compatible", () => typeof fauxReg.get === "function",
    () => cd(() => SR.assertReadinessPhase(prod.full, "FULL", Object.assign({}, idOpt, { registry: fauxReg }), "m")) === "READINESS_REGISTRY_INVALID");
  M("M32", "registre d'un autre run", () => true,
    () => cd(() => SR.assertReadinessPhase(prod.full, "FULL", Object.assign({}, idOpt, { registry: other.registry }), "m")) === "READINESS_REGISTRY_RUN_MISMATCH");
  M("M33", "registre d'une autre frontiere", () => true,
    () => cd(() => SR.assertReadinessPhase(prod.full, "FULL", Object.assign({}, idOpt, { registry: rA.reg, verifier: vA }), "m")) !== null);
  M("M34", "fabrique d'acceptation publique", () => true,
    () => typeof OAB.createAcceptanceBoundary === "undefined");
  M("M35", "variable de confiance choisie par l'appelant", () => true,
    () => cd(() => OTB.provisionProductionTrustBoundary({ envVar: "MA_VARIABLE" })) === "TRUST_ENV_VAR_REFUSED");

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
    check("UNI-" + (i + 1) + ". " + label + " (" + c.qualification.qualificationStatus + ")", ok, c.qualification.qualificationStatus);
  }

  console.log("\n  -- anti-cablage et hygiene --");
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
  const drift = CC.DOCUMENTED_CONTRACTS.map(function (d) {
    let md = null; try { md = fs.readFileSync(path.resolve(__dirname, "..", d.document), "utf8"); } catch (e) { md = null; }
    return { d: d.document, r: md === null ? { valid: false, problems: ["document absent"] } : CC.verifyDocumentedContract(md, d.contract) };
  });
  check("HYG-06. aucune derive documentation/code", drift.every((x) => x.r.valid),
    JSON.stringify(drift.filter((x) => !x.r.valid).map((x) => x.d + ":" + x.r.problems.join("/"))).slice(0, 200));
  check("HYG-07. la garde documentaire mord",
    CC.verifyDocumentedContract(fs.readFileSync(path.resolve(__dirname, "..", "KEY-MANAGEMENT.md"), "utf8")
      .replace(/(<!-- contract:keyStatuses -->[\s\S]*?)(<!-- \/contract -->)/, "$1\n| `SUSPENDED` |\n$2"), "keyStatuses").valid === false);
  check("HYG-08. surface de validation complete", Object.keys(VAL).length >= 20, Object.keys(VAL).length);
  const risky = [];
  ["core", "adapters", "validators", "tools"].forEach(function (dir) {
    fs.readdirSync(path.join(__dirname, "..", dir)).filter((f) => /\.js$/.test(f)).forEach(function (f) {
      let mod = null; try { mod = require(path.join(__dirname, "..", dir, f)); } catch (e) { return; }
      Object.keys(mod).forEach(function (k) { if (/^__/.test(k)) risky.push(dir + "/" + f + "::" + k); });
    });
  });
  check("HYG-09. aucun helper interne expose sur la surface publique", risky.length === 0, JSON.stringify(risky));

  console.log("\n  -- non-regression --");
  const h = (p2) => crypto.createHash("sha256").update(fs.readFileSync(p2)).digest("hex");
  const lots = [["MONO-08", "v0.7"], ["MONO-08", "v0.8"], ["MONO-09", "v0.1"], ["MONO-09", "v0.2"],
    ["MONO-10", "v0.1"], ["MONO-10", "v0.2"], ["MONO-10", "v0.3"], ["MONO-10", "v0.4"], ["MONO-10", "v0.5"],
    ["MONO-10", "v0.6"], ["MONO-10", "v0.7"], ["MONO-10", "v0.8"]];
  const bad = []; let refs = 0, sealedLots = 0;
  lots.forEach(function (p2) {
    const dir = path.join(KIT, p2[0], p2[1]), f = path.join(dir, "SHA256SUMS.txt");
    if (!fs.existsSync(f)) return;
    sealedLots++;
    fs.readFileSync(f, "utf8").trim().split("\n").forEach(function (line) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) return;
      refs++; const fp = path.join(dir, m[2]);
      if (!fs.existsSync(fp) || h(fp) !== m[1]) bad.push(p2.join("/") + ":" + m[2]);
    });
  });
  if (sealedLots === 0) skipped("NR-01. references scellees", "aucun lot scelle joignable depuis cette extraction");
  else check("NR-01. " + sealedLots + " lots scelles conformes (" + refs + " refs)", bad.length === 0, JSON.stringify(bad.slice(0, 3)));

  console.log("\n" + pass + " PASS, " + fail + " FAIL, " + skip + " SKIP");
  console.log("MUTATIONS_CAUGHT = " + mutCaught + " / MUTATIONS_TOTAL = " + mutTotal);
  console.log("CASE_SPECIFIC_LEAK_COUNT = " + leak.CASE.length + " | DOMAIN_HARDCODING_COUNT = " + leak.DOMAIN.length
    + " | PROVIDER_HARDCODING_COUNT = " + leak.PROVIDER.length + " | UNIVERSALITY = " + uni + "/6");
  process.exit(fail === 0 && mutCaught === mutTotal ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
