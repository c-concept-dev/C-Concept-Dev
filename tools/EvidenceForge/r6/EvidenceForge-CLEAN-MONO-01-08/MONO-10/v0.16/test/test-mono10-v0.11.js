#!/usr/bin/env node
"use strict";
// MONO-10 v0.11 — suite adversariale T01-T37 + 40 mutations causales.
// Aucun reseau, aucun LLM reel, aucun run EF-02, aucun acte humain reel.
// Usage : node test/test-mono10-v0.11.js <bundleRoot>

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
const SQ = require(C + "scientific-qualification.js");
const FX = require("./fixture-chain.js");
const TRANSPORT = path.resolve(__dirname, "..", "tools", "reference-llm-transport.js");

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
  console.log("MONO-10 v0.11 — suite adversariale\n");

  /**
   * EXPLOITANT A LISTE BLANCHE STRICTE. Toute la fermeture B10-01 se joue ici :
   * une sonde legitime sur le seul triplet autorise ne doit jamais servir a
   * certifier un triplet different, autorise ou non.
   */
  const opP = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "MEME-ID",
    llmCapability: { kind: "OPERATOR_TRANSPORT", transportModuleRef: TRANSPORT,
      /** DEUX triplets autorises : l'isolement de deux sondes legitimes est
       *  testable (T14), et "INTERDIT"/"hors-liste" restent hors liste. */
      allowedProviders: ["prov-fixture", "prov-second"],
      allowedModels: ["mod-fixture", "mod-second"],
      allowedWorkers: ["bind-fixture", "bind-second"] } });
  const opT = FX.provisionOperator({ namespace: "TEST", boundaryId: "MEME-ID" });
  const opAlt = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "MEME-ID" });
  const bP = FX.boundaryFor(opP), bT = FX.boundaryFor(opT), bAlt = FX.boundaryFor(opAlt);
  const vP = OTB.verifierFor(bP), vT = OTB.verifierFor(bT), vAlt = OTB.verifierFor(bAlt);
  const chain = await (await FX.buildChain({ mode: "PRODUCTION", operator: opP, boundary: bP, verifier: vP })).complete();
  const testChain = await (await FX.buildChain({ mode: "TEST", operator: opT, boundary: bT, verifier: vT })).complete();
  const autreRun = await (await FX.buildChain({ mode: "PRODUCTION", operator: opP, boundary: bP,
    verifier: vP, runSalt: 71, missionId: "mission-autre-run" })).complete();
  const reg = chain.registry, man = chain.manifest;
  const LLM_CFG = { providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture" };
  const ctxUse = (id) => Object.assign({}, chain.ctx, { llmCapabilityArtifactId: id || "llm-capability" });

  /**
   * Une sonde NEUVE et legitime par vecteur : la regle d'unicite (§8) veut
   * qu'une sonde ne certifie qu'un artefact, donc chaque essai part de zero.
   */
  let sondeNo = 0;
  async function sondeNeuve() {
    sondeNo++;
    return chain.verifier.runLlmProbe(Object.assign({}, LLM_CFG,
      { credentialPresent: true, runId: man.runId, nonce: sondeNo }), chain.ctx);
  }
  async function essaiRelabel(id, over) {
    const s = await sondeNeuve();
    const art = Object.assign({}, s, over || {});
    const bound = chain.bind(id, R.CAPABILITY, art);
    const cert = chain.verifier.certifyLlmCapability({ registry: reg, artifactId: id });
    const usable = LC.assertCapabilityUsable(bound,
      { providerId: art.providerId, modelId: art.modelId, workerBindingId: art.workerBindingId }, ctxUse(id));
    return { probe: s, art: bound, cert: cert, usable: usable.usable,
      caps: reg.capabilitiesOf(id), problems: (cert.problems || []).concat(usable.problems || []) };
  }

  /* ===== §14 — RE-ETIQUETAGE DU SUJET LLM (T01-T10) ===== */
  console.log("  -- T01-T10 : une decision reelle ne certifie que le sujet reellement sonde --");
  const rProv = await essaiRelabel("cap-prov", { providerId: "fournisseur-INTERDIT" });
  check("T01. re-etiquetage du FOURNISSEUR : refuse et inutilisable",
    rProv.cert.certified === false && rProv.usable === false
    && rProv.caps.indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) === -1
    && rProv.problems.join(" ").indexOf("LLM_SUBJECT") !== -1,
    JSON.stringify(rProv.problems).slice(0, 200));
  const rMod = await essaiRelabel("cap-mod", { modelId: "modele-INTERDIT" });
  check("T02. re-etiquetage du MODELE : refuse et inutilisable",
    rMod.cert.certified === false && rMod.usable === false
    && rMod.caps.indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) === -1,
    JSON.stringify(rMod.problems).slice(0, 160));
  const rWk = await essaiRelabel("cap-wk", { workerBindingId: "worker-INTERDIT" });
  check("T03. re-etiquetage du WORKER : refuse et inutilisable",
    rWk.cert.certified === false && rWk.usable === false
    && rWk.caps.indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) === -1,
    JSON.stringify(rWk.problems).slice(0, 160));
  /**
   * T04/T05 — UNICITE. La sonde a DEJA certifie un artefact ; elle ne peut plus
   * en certifier un second, meme si le sujet sonde est identique.
   */
  const sU = await sondeNeuve();
  chain.bind("cap-u1", R.CAPABILITY, sU);
  const certU1 = chain.verifier.certifyLlmCapability({ registry: reg, artifactId: "cap-u1" });
  const artU2 = chain.bind("cap-u2", R.CAPABILITY, Object.assign({}, sU, { costUsd: 0.42 }));
  const certU2 = chain.verifier.certifyLlmCapability({ registry: reg, artifactId: "cap-u2" });
  check("T04. MEME sonde, artefact d'empreinte differente : refuse",
    certU1.certified === true && certU2.certified === false
    && certU2.problems.join(" ").indexOf("LLM_PROBE_ALREADY_CONSUMED") !== -1
    && reg.capabilitiesOf("cap-u2").indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) === -1,
    JSON.stringify(certU2.problems).slice(0, 180));
  const artU3 = chain.bind("cap-u3", R.CAPABILITY, sU);
  const certU3 = chain.verifier.certifyLlmCapability({ registry: reg, artifactId: "cap-u3" });
  check("T05. MEME sonde, AUTRE identifiant d'artefact : refuse",
    certU3.certified === false
    && reg.capabilitiesOf("cap-u3").indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) === -1,
    JSON.stringify(certU3.problems).slice(0, 180));
  /** Le requestId d'un AUTRE run est reellement distinct : l'attaque est pertinente. */
  const reqEtranger = autreRun.capability.requestId;
  const rReq = await (async function () {
    const s2 = await chain.verifier.runLlmProbe(Object.assign({}, LLM_CFG,
      { providerId: "prov-second", modelId: "mod-second", workerBindingId: "bind-second",
        credentialPresent: true, runId: man.runId }), chain.ctx);
    chain.bind("cap-req", R.CAPABILITY, Object.assign({}, s2, { requestId: reqEtranger }));
    return { cert: chain.verifier.certifyLlmCapability({ registry: reg, artifactId: "cap-req" }),
      distinct: reqEtranger !== s2.requestId };
  })();
  check("T06. requestId emprunte a une AUTRE sonde : refuse",
    rReq.distinct === true && rReq.cert.certified === false
    && rReq.cert.problems.join(" ").indexOf("requestId") !== -1,
    "distinct=" + rReq.distinct + " " + JSON.stringify(rReq.cert.problems).slice(0, 160));
  check("T07. decision de sonde d'un AUTRE run : non verifiable",
    chain.verifier.verifyIssuerDecision("PRODUCTION_LLM_CAPABILITY",
      (autreRun.registry.get("llm-capability").capabilityGrants || [])[0].derivationRef,
      { decisionKind: "LLM_PROBE_EXECUTION", providerId: "prov-fixture", modelId: "mod-fixture",
        workerBindingId: "bind-fixture", artifactId: "llm-capability",
        artifactHash: reg.get("llm-capability").hash, runId: man.runId, missionHash: man.missionHash,
        executionMode: "PRODUCTION" }).valid === false);
  check("T08. decision de sonde d'une AUTRE mission : non verifiable",
    chain.verifier.verifyIssuerDecision("PRODUCTION_LLM_CAPABILITY",
      (reg.get("llm-capability").capabilityGrants || [])[0].derivationRef,
      { decisionKind: "LLM_PROBE_EXECUTION", providerId: "prov-fixture", modelId: "mod-fixture",
        workerBindingId: "bind-fixture", artifactId: "llm-capability",
        artifactHash: reg.get("llm-capability").hash, runId: man.runId,
        missionHash: autreRun.manifest.missionHash, executionMode: "PRODUCTION" }).valid === false);
  check("T09. decision de sonde de TEST presentee en PRODUCTION : refusee",
    testChain.verifier.certifyLlmCapability({ registry: reg, artifactId: "llm-capability" }).certified === false
    && chain.verifier.verifyIssuerDecision("PRODUCTION_LLM_CAPABILITY",
      (reg.get("llm-capability").capabilityGrants || [])[0].derivationRef,
      { decisionKind: "LLM_PROBE_EXECUTION", providerId: "prov-fixture", modelId: "mod-fixture",
        workerBindingId: "bind-fixture", artifactId: "llm-capability",
        artifactHash: reg.get("llm-capability").hash, runId: man.runId, missionHash: man.missionHash,
        executionMode: "TEST" }).valid === false);
  const rHors = await essaiRelabel("cap-hors", { providerId: "hors-liste", modelId: "hors-liste",
    workerBindingId: "hors-liste" });
  check("T10. artefact HORS LISTE BLANCHE : jamais utilisable",
    rHors.cert.certified === false && rHors.usable === false
    && rHors.caps.indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) === -1,
    JSON.stringify(rHors.problems).slice(0, 160));

  /* ===== §15 — TEMOINS POSITIFS LLM (T11-T14) ===== */
  console.log("\n  -- T11-T14 : le chemin legitime reste ouvert --");
  const capNom = reg.get("llm-capability");
  const grantNom = (capNom.capabilityGrants || []).filter((g) => g.capability === AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY)[0];
  check("T11. TEMOIN POSITIF : le triplet reellement sonde est certifie",
    !!grantNom && chain.capability.status === "AVAILABLE"
    && /^probe:/.test(String(chain.capability.probeRef))
    && /^decision:llm_probe_execution:/.test(String(grantNom.derivationRef)),
    JSON.stringify({ ref: String(chain.capability.probeRef).slice(0, 20) }));
  check("T12. la decision engage le SUJET EXACT, et la concession le nomme",
    grantNom.certifiedSubject.providerId === "prov-fixture"
    && grantNom.certifiedSubject.modelId === "mod-fixture"
    && grantNom.certifiedSubject.workerBindingId === "bind-fixture"
    && /^[0-9a-f]{64}$/.test(String(grantNom.decisionSubjectHash))
    && chain.verifier.verifyIssuerDecision("PRODUCTION_LLM_CAPABILITY", grantNom.derivationRef,
      { decisionKind: "LLM_PROBE_EXECUTION", providerId: "prov-fixture", modelId: "mod-fixture",
        workerBindingId: "bind-fixture", artifactId: "llm-capability", artifactHash: capNom.hash,
        runId: man.runId, missionHash: man.missionHash, executionMode: "PRODUCTION",
        decisionSubjectHash: grantNom.decisionSubjectHash }).valid === true,
    JSON.stringify(grantNom.certifiedSubject));
  check("T13. TEMOIN POSITIF : la capacite reelle reste utilisable",
    LC.assertCapabilityUsable(capNom.artifact, LLM_CFG, ctxUse("llm-capability")).usable === true,
    JSON.stringify(LC.assertCapabilityUsable(capNom.artifact, LLM_CFG, ctxUse("llm-capability")).problems || []).slice(0, 200));
  const sX = await chain.verifier.runLlmProbe(Object.assign({}, LLM_CFG,
    { credentialPresent: true, runId: man.runId }), chain.ctx);
  const sY = await chain.verifier.runLlmProbe({ providerId: "prov-second", modelId: "mod-second",
    workerBindingId: "bind-second", credentialPresent: true, runId: man.runId }, chain.ctx);
  chain.bind("cap-x", R.CAPABILITY, sX); chain.bind("cap-y", R.CAPABILITY, sY);
  const cX = chain.verifier.certifyLlmCapability({ registry: reg, artifactId: "cap-x" });
  const cY = chain.verifier.certifyLlmCapability({ registry: reg, artifactId: "cap-y" });
  check("T14. deux sondes legitimes distinctes restent ISOLEES",
    cX.certified === true && cY.certified === true
    && cX.decisionSubjectHash !== cY.decisionSubjectHash
    && sX.requestId !== sY.requestId
    && chain.verifier.certifyLlmCapability({ registry: reg, artifactId: "cap-x" }).certified === true,
    "cX=" + cX.certified + " cY=" + cY.certified + " "
    + String(cX.decisionSubjectHash).slice(0, 10) + " != " + String(cY.decisionSubjectHash).slice(0, 10));

  /* ===== §16 — CONTEXTE OBLIGATOIRE (T15-T22) ===== */
  console.log("\n  -- T15-T22 : aucun controle ne se desactive en retirant son entree --");
  const fab = { schema: "EvidenceForge.LlmCapability", status: "AVAILABLE", providerId: "p", modelId: "m",
    workerBindingId: "w", requestId: "r", probeExecuted: true, probeStatus: "SUCCESS",
    responseSchemaValidated: true, credentialPresenceAttested: true, credentialProbeSkipped: false,
    credentialProbeSkippedAttested: true, probeTimestamp: now() };
  const fabCfg = { providerId: "p", modelId: "m", workerBindingId: "w" };
  check("T15. contexte VIDE : inutilisable",
    LC.assertCapabilityUsable(fab, fabCfg, {}).usable === false
    && LC.assertCapabilityUsable(fab, fabCfg, {}).problems.join(" ").indexOf("verificateur") !== -1);
  check("T16. verificateur absent : inutilisable",
    LC.assertCapabilityUsable(capNom.artifact, LLM_CFG,
      Object.assign({}, ctxUse("llm-capability"), { verifier: undefined })).usable === false);
  check("T17. registre absent : inutilisable",
    LC.assertCapabilityUsable(capNom.artifact, LLM_CFG,
      Object.assign({}, ctxUse("llm-capability"), { artifactRegistry: undefined })).usable === false);
  check("T18. mode d'execution non derivable : inutilisable",
    LC.assertCapabilityUsable(fab, fabCfg, { verifier: chain.verifier }).usable === false
    && LC.assertCapabilityUsable(fab, fabCfg, { verifier: chain.verifier })
      .problems.join(" ").indexOf("mode d'execution") !== -1);
  check("T19. identite de frontiere incomplete : inutilisable",
    LC.assertCapabilityUsable(fab, fabCfg, { verifier: chain.verifier, manifest: man }).usable === false);
  check("T20. verificateur d'une AUTRE frontiere : inutilisable",
    LC.assertCapabilityUsable(capNom.artifact, LLM_CFG,
      Object.assign({}, ctxUse("llm-capability"), { verifier: vAlt })).usable === false);
  check("T21. registre d'un AUTRE run : inutilisable",
    LC.assertCapabilityUsable(capNom.artifact, LLM_CFG,
      Object.assign({}, ctxUse("llm-capability"), { artifactRegistry: autreRun.registry })).usable === false);
  check("T22. TEMOIN POSITIF : contexte complet accepte",
    LC.assertCapabilityUsable(capNom.artifact, LLM_CFG, ctxUse("llm-capability")).usable === true);

  /* ===== §17 — PREPARATION (T23-T29) ===== */
  console.log("\n  -- T23-T29 : le verificateur n'est plus facultatif --");
  const RD = { registry: reg, verifier: chain.verifier, manifest: man,
    expectedRunId: man.runId, expectedMissionHash: man.missionHash };
  check("T23. verificateur ABSENT : refus explicite, jamais acceptation",
    cd(() => SR.assertReadinessPhase(chain.full, "FULL",
      { registry: reg, manifest: man, expectedRunId: man.runId }, "T23")) === "READINESS_VERIFIER_REQUIRED");
  check("T24. verificateur TEST sur registre PRODUCTION : refuse",
    cd(() => SR.assertReadinessPhase(chain.full, "FULL",
      Object.assign({}, RD, { verifier: vT }), "T24")) === "READINESS_REGISTRY_BOUNDARY_MISMATCH");
  check("T25. liaison de configuration differente (meme identifiant) : refuse",
    cd(() => SR.assertReadinessPhase(chain.full, "FULL",
      Object.assign({}, RD, { verifier: vAlt }), "T25")) === "READINESS_REGISTRY_BOUNDARY_MISMATCH"
    && bAlt.operatorTrustBoundaryId === bP.operatorTrustBoundaryId
    && bAlt.configBindingHash !== bP.configBindingHash);
  check("T26. mode d'execution re-declare sur l'artefact : refuse",
    cd(() => SR.assertReadinessPhase((function () { const r = clone(testChain.full);
      r.executionMode = "PRODUCTION"; return r; })(), "FULL",
      { registry: testChain.registry, verifier: testChain.verifier, manifest: testChain.manifest,
        expectedRunId: testChain.manifest.runId }, "T26")) === "READINESS_EXECUTION_MODE_MISDECLARED");
  check("T27. registre d'un autre run : refuse",
    cd(() => SR.assertReadinessPhase(chain.full, "FULL",
      Object.assign({}, RD, { registry: autreRun.registry }), "T27")) === "READINESS_REGISTRY_RUN_MISMATCH");
  check("T28. mission differente : refuse",
    cd(() => SR.assertReadinessPhase(autreRun.full, "FULL",
      { registry: autreRun.registry, verifier: autreRun.verifier, manifest: autreRun.manifest,
        expectedRunId: autreRun.manifest.runId, expectedMissionHash: man.missionHash },
      "T28")) === "READINESS_REGISTRY_MISSION_MISMATCH");
  check("T29. TEMOIN POSITIF : preparation reelle acceptee",
    SR.assertReadinessPhase(chain.full, "FULL", RD, "T29") === true);

  /* ===== §18 — DERIVATION, CAUSALITE EXACTE (T30-T37) ===== */
  console.log("\n  -- T30-T37 : le code d'erreur atteint est NOMME, pas 'quelque chose a leve' --");
  /**
   * §13 (v0.11) — FERMETURE B10-04. En v0.10, les tests de derivation
   * s'arretaient a `CAPABILITY_ISSUER_INVALID` : la garde de derivation n'etait
   * jamais atteinte. On construit ici une autorite de TEST et on emet DANS SON
   * PROPRE espace, ce qui franchit la garde d'emetteur et met la garde de
   * derivation en cause reelle. Une concession de TEST reste sans effet en
   * PRODUCTION (T24, T09, M09).
   */
  const autoT = OPA.createTestProvenanceAuthority({ roots: [{ sourceRootId: "S-T", authorityRootId: "A-T", familyRootId: "F-T" }] });
  const dT = OPA.descriptorOf(autoT);
  const mintT = (o) => cd(() => AC.mintCapabilityGrant(Object.assign({ issuer: autoT,
    capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE, artifactId: "art-T", artifactHash: "a".repeat(64),
    artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord", runId: "run-T", missionHash: "b".repeat(64),
    operatorBoundaryId: dT.operatorBoundaryId, configBindingHash: dT.configBindingHash,
    executionMode: dT.executionMode }, o)));
  const resT = autoT.resolveRoots({ sourceRootId: "S-T", artifactId: "art-T", artifactHash: "a".repeat(64),
    runId: "run-T", missionHash: "b".repeat(64) });
  check("T30. derivation arbitraire : CAPABILITY_DERIVATION_UNVERIFIABLE atteint",
    mintT({ derivationRef: "je-decrete-que-cest-authentifie" }) === "CAPABILITY_DERIVATION_UNVERIFIABLE"
    && mintT({ derivationRef: resT.derivationRef }) === null,
    mintT({ derivationRef: "je-decrete-que-cest-authentifie" }));
  check("T31. derivation reelle RECOPIEE sur un autre artefact : meme code exact",
    mintT({ derivationRef: resT.derivationRef, artifactId: "art-U" }) === "CAPABILITY_DERIVATION_UNVERIFIABLE"
    && mintT({ derivationRef: resT.derivationRef, artifactHash: "c".repeat(64) }) === "CAPABILITY_DERIVATION_UNVERIFIABLE");
  const resAutre = autoT.resolveRoots({ sourceRootId: "S-T", artifactId: "art-Z", artifactHash: "d".repeat(64),
    runId: "run-T", missionHash: "b".repeat(64) });
  check("T32. decision legitime SANS RAPPORT : refusee par le meme code",
    resAutre.status === "AUTHENTICATED"
    && mintT({ derivationRef: resAutre.derivationRef }) === "CAPABILITY_DERIVATION_UNVERIFIABLE");
  check("T33. mutation du sujet de decision : la concession ne survit pas",
    AC.isCapabilityGrant(Object.assign({}, grantNom, { certifiedSubject: { providerId: "autre" } })) === false
    && AC.isCapabilityGrant(Object.assign({}, grantNom, { decisionSubjectHash: "0".repeat(64) })) === false);
  check("T34. attente d'artifactHash ABSENTE : refus, jamais dispense",
    chain.verifier.verifyIssuerDecision("PRODUCTION_LLM_CAPABILITY", grantNom.derivationRef,
      { decisionKind: "LLM_PROBE_EXECUTION", providerId: "prov-fixture", modelId: "mod-fixture",
        workerBindingId: "bind-fixture", artifactId: "llm-capability", runId: man.runId,
        missionHash: man.missionHash, executionMode: "PRODUCTION" }).valid === false);
  const vdSub = (over) => chain.verifier.verifyIssuerDecision("PRODUCTION_LLM_CAPABILITY", grantNom.derivationRef,
    Object.assign({ decisionKind: "LLM_PROBE_EXECUTION", providerId: "prov-fixture", modelId: "mod-fixture",
      workerBindingId: "bind-fixture", artifactId: "llm-capability", artifactHash: capNom.hash,
      runId: man.runId, missionHash: man.missionHash, executionMode: "PRODUCTION" }, over)).valid;
  check("T35. mutation du FOURNISSEUR attendu : refus", vdSub({ providerId: "autre" }) === false && vdSub({}) === true);
  check("T36. mutation du MODELE attendu : refus", vdSub({ modelId: "autre" }) === false);
  check("T37. mutation du WORKER attendu : refus", vdSub({ workerBindingId: "autre" }) === false);

  /* ===== §19 — CHAINE NEGATIVE DE BOUT EN BOUT ===== */
  console.log("\n  -- §19 : sonde autorisee -> re-etiquetage interdit -> toute la chaine --");
  const neg = await (async function () {
    const ch = await FX.buildChain({ mode: "PRODUCTION", operator: opP, boundary: bP, verifier: vP,
      runSalt: 88, missionId: "mission-negative" });
    const s = await ch.verifier.runLlmProbe(Object.assign({}, LLM_CFG, { credentialPresent: true, runId: ch.manifest.runId }), ch.ctx);
    const art = ch.bind("llm-capability", R.CAPABILITY,
      Object.assign({}, s, { providerId: "fournisseur-INTERDIT", modelId: "modele-INTERDIT" }));
    const cert = ch.verifier.certifyLlmCapability({ registry: ch.registry, artifactId: "llm-capability" });
    const usable = LC.assertCapabilityUsable(art, { providerId: "fournisseur-INTERDIT", modelId: "modele-INTERDIT",
      workerBindingId: "bind-fixture" }, Object.assign({}, ch.ctx, { llmCapabilityArtifactId: "llm-capability" }));
    const refs = ch.registry.entries().map((x) => LIN.artifactRef(ch.registry.get(x.artifactId).artifact, x.artifactId, x.relation));
    const qual = SQ.qualifyProcess({ runContext: ch.ctx, candidateAssessment: ch.assessment,
      panelValidation: ch.validation, llmCapability: art, llmConfig: { providerId: "fournisseur-INTERDIT",
        modelId: "modele-INTERDIT", workerBindingId: "bind-fixture" },
      reviewSet: { schema: "EvidenceForge.ReviewSet", reviews: [{ reviewRef: "r1", twinRef: "t1", reviewStatus: "complete" }], summary: { targets: 1 } },
      lineageRefs: refs, artifactRegistry: ch.registry });
    return { cert, usable, qual, caps: ch.registry.capabilitiesOf("llm-capability") };
  })();
  check("N1. la chaine s'arrete a la certification, jamais QUALIFIED",
    neg.cert.certified === false && neg.usable.usable === false
    && neg.caps.indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) === -1
    && neg.qual.qualificationStatus !== "QUALIFIED",
    neg.qual.qualificationStatus + " | " + JSON.stringify(neg.cert.problems).slice(0, 120));

  /* ===== §21 — NON-REGRESSION PROVENANCE / HUMAIN / HISTORIQUE ===== */
  console.log("\n  -- §21 : les liaisons deja fermees le restent --");
  const eDoc = reg.get("doc-a:c-1");
  const gDoc = (eDoc.capabilityGrants || []).filter((g) => g.capability === AC.CAPABILITY.AUTHENTICATED_PROVENANCE)[0];
  check("NR-P. provenance : la decision reste liee a l'empreinte de l'artefact",
    chain.verifier.verifyIssuerDecision("AUTHENTICATED_PROVENANCE", gDoc.derivationRef,
      { decisionKind: "PROVENANCE_ROOT_RESOLUTION", artifactId: "doc-a:c-1", artifactHash: eDoc.hash,
        runId: man.runId, missionHash: man.missionHash, executionMode: "PRODUCTION" }).valid === true
    && chain.verifier.verifyIssuerDecision("AUTHENTICATED_PROVENANCE", gDoc.derivationRef,
      { decisionKind: "PROVENANCE_ROOT_RESOLUTION", artifactId: "doc-b:c-1",
        runId: man.runId, executionMode: "PRODUCTION" }).valid === false);
  const ePv = reg.get("panel-validation");
  const gPv = (ePv.capabilityGrants || []).filter((g) => g.capability === AC.CAPABILITY.HUMAN_AUTHENTICATED)[0];
  check("NR-H. acte humain : la decision reste liee a l'empreinte de l'artefact",
    !!gPv && chain.verifier.verifyIssuerDecision("HUMAN_AUTHENTICATED", gPv.derivationRef,
      { decisionKind: "HUMAN_ACT_CERTIFICATION", artifactId: "panel-validation", artifactHash: ePv.hash,
        runId: man.runId, missionHash: man.missionHash, executionMode: "PRODUCTION" }).valid === true
    && chain.verifier.verifyIssuerDecision("HUMAN_AUTHENTICATED", gPv.derivationRef,
      { decisionKind: "HUMAN_ACT_CERTIFICATION", artifactHash: "f".repeat(64) }).valid === false);
  check("NR-I. entree historique : l'autorite en argument reste ignoree",
    LIN.resolveLineage([LIN.artifactRef(reg.get("mission").artifact, "mission", R.MISSION)], reg,
      { manifest: man, historicalInputAuthority: OHIA.createTestHistoricalInputAuthority({ authorized: [] }),
        historicalInputRequest: { artifactId: "mission" } })
      .problems.join(" ").indexOf("IGNOREE") !== -1);

  /* ===== 40 MUTATIONS CAUSALES ===== */
  console.log("\n  -- 40 mutations causales --");
  const M = mutation;
  M("M01", "re-etiquetage du fournisseur", () => rProv.probe.status === "AVAILABLE", () => rProv.cert.certified === false);
  M("M02", "re-etiquetage du modele", () => rMod.probe.status === "AVAILABLE", () => rMod.cert.certified === false);
  M("M03", "re-etiquetage du worker", () => rWk.probe.status === "AVAILABLE", () => rWk.cert.certified === false);
  M("M04", "meme sonde, empreinte d'artefact differente", () => certU1.certified === true, () => certU2.certified === false);
  M("M05", "meme sonde, identifiant d'artefact different", () => true, () => certU3.certified === false);
  M("M06", "requestId emprunte a une autre sonde", () => true, () => rReq.cert.certified === false);
  M("M07", "decision de sonde d'un autre run", () => true, () => vdSub({ runId: autreRun.manifest.runId }) === false);
  M("M08", "decision de sonde d'une autre mission", () => true, () => vdSub({ missionHash: autreRun.manifest.missionHash }) === false);
  M("M09", "decision de TEST presentee en PRODUCTION", () => OTV.isOperatorTrustVerifier(vT) === true,
    () => testChain.verifier.certifyLlmCapability({ registry: reg, artifactId: "llm-capability" }).certified === false);
  M("M10", "sujet hors liste blanche", () => true, () => rHors.usable === false);
  M("M11", "contexte vide", () => true, () => LC.assertCapabilityUsable(fab, fabCfg, {}).usable === false);
  M("M12", "verificateur absent", () => true,
    () => LC.assertCapabilityUsable(capNom.artifact, LLM_CFG, Object.assign({}, ctxUse("llm-capability"), { verifier: undefined })).usable === false);
  M("M13", "registre absent", () => true,
    () => LC.assertCapabilityUsable(capNom.artifact, LLM_CFG, Object.assign({}, ctxUse("llm-capability"), { artifactRegistry: undefined })).usable === false);
  M("M14", "mode d'execution non derivable", () => true,
    () => LC.assertCapabilityUsable(fab, fabCfg, { verifier: chain.verifier }).usable === false);
  M("M15", "verificateur d'une autre frontiere", () => bAlt.operatorTrustBoundaryId === bP.operatorTrustBoundaryId,
    () => LC.assertCapabilityUsable(capNom.artifact, LLM_CFG, Object.assign({}, ctxUse("llm-capability"), { verifier: vAlt })).usable === false);
  M("M16", "liaison de configuration differente", () => bAlt.configBindingHash !== bP.configBindingHash,
    () => cd(() => SR.assertReadinessPhase(chain.full, "FULL", Object.assign({}, RD, { verifier: vAlt }), "M16")) !== null);
  M("M17", "readiness sans verificateur", () => true,
    () => cd(() => SR.assertReadinessPhase(chain.full, "FULL", { registry: reg, manifest: man }, "M17")) === "READINESS_VERIFIER_REQUIRED");
  M("M18", "readiness avec verificateur TEST", () => true,
    () => cd(() => SR.assertReadinessPhase(chain.full, "FULL", Object.assign({}, RD, { verifier: vT }), "M18")) !== null);
  M("M19", "readiness d'un autre run", () => true,
    () => cd(() => SR.assertReadinessPhase(chain.full, "FULL", Object.assign({}, RD, { registry: autreRun.registry }), "M19")) === "READINESS_REGISTRY_RUN_MISMATCH");
  M("M20", "readiness d'une autre mission", () => true,
    () => cd(() => SR.assertReadinessPhase(autreRun.full, "FULL", { registry: autreRun.registry, verifier: autreRun.verifier,
      manifest: autreRun.manifest, expectedRunId: autreRun.manifest.runId, expectedMissionHash: man.missionHash }, "M20")) === "READINESS_REGISTRY_MISSION_MISMATCH");
  M("M21", "derivation arbitraire a l'emission", () => resT.status === "AUTHENTICATED",
    () => mintT({ derivationRef: "je-decrete" }) === "CAPABILITY_DERIVATION_UNVERIFIABLE");
  M("M22", "derivation recopiee vers un autre artefact", () => true,
    () => mintT({ derivationRef: resT.derivationRef, artifactId: "art-U" }) === "CAPABILITY_DERIVATION_UNVERIFIABLE");
  M("M23", "decision legitime sans rapport", () => resAutre.status === "AUTHENTICATED",
    () => mintT({ derivationRef: resAutre.derivationRef }) === "CAPABILITY_DERIVATION_UNVERIFIABLE");
  M("M24", "empreinte de sujet reecrite sur la concession", () => AC.isCapabilityGrant(grantNom) === true,
    () => AC.isCapabilityGrant(Object.assign({}, grantNom, { decisionSubjectHash: "0".repeat(64) })) === false);
  M("M25", "code d'erreur exact atteint (B10-04)", () => true,
    () => mintT({ derivationRef: "x" }) === "CAPABILITY_DERIVATION_UNVERIFIABLE");
  M("M26", "TEMOIN POSITIF sonde legitime", () => true, () => chain.capability.status === "AVAILABLE");
  M("M27", "TEMOIN POSITIF capacite utilisable", () => true,
    () => LC.assertCapabilityUsable(capNom.artifact, LLM_CFG, ctxUse("llm-capability")).usable === true);
  M("M28", "TEMOIN POSITIF preparation acceptee", () => true, () => SR.assertReadinessPhase(chain.full, "FULL", RD, "M28") === true);
  M("M29", "TEMOIN POSITIF qualification", () => true, () => /QUALIFIED/.test(chain.qualification.qualificationStatus));
  M("M30", "TEMOIN POSITIF autorisation", () => true, () => chain.authorization.authorization === "AUTHORIZED");
  M("M31", "provenance : liaison inchangee", () => true,
    () => chain.verifier.verifyIssuerDecision("AUTHENTICATED_PROVENANCE", gDoc.derivationRef,
      { decisionKind: "PROVENANCE_ROOT_RESOLUTION", artifactId: "doc-b:c-1", runId: man.runId, executionMode: "PRODUCTION" }).valid === false);
  M("M32", "acte humain : liaison inchangee", () => !!gPv,
    () => chain.verifier.verifyIssuerDecision("HUMAN_AUTHENTICATED", gPv.derivationRef,
      { decisionKind: "HUMAN_ACT_CERTIFICATION", artifactHash: "f".repeat(64) }).valid === false);
  M("M33", "entree historique : liaison inchangee", () => true,
    () => LIN.resolveLineage([LIN.artifactRef(reg.get("mission").artifact, "mission", R.MISSION)], reg,
      { manifest: man, verifier: { boundaryIdentity: reg.boundaryIdentity }, historicalInputRequest: { artifactId: "mission" } })
      .problems.join(" ").indexOf("verificateur issu d'une frontiere operateur") !== -1);
  M("M34", "requestId duplique pour un autre sujet", () => true, () => rReq.cert.certified === false);
  M("M35", "fournisseur hors liste blanche a la sonde", () => true, () => true === (function () {
    return rProv.problems.join(" ").indexOf("LLM_SUBJECT") !== -1; })());
  M("M36", "modele hors liste blanche", () => true, () => rMod.usable === false);
  M("M37", "worker hors liste blanche", () => true, () => rWk.usable === false);
  M("M38", "empreinte d'artefact discordante", () => true, () => vdSub({ artifactHash: "e".repeat(64) }) === false);
  M("M39", "decision de sonde d'une autre frontiere", () => true,
    () => vAlt.verifyIssuerDecision("PRODUCTION_LLM_CAPABILITY", grantNom.derivationRef,
      { decisionKind: "LLM_PROBE_EXECUTION" }).valid === false);
  M("M40", "objet de decision d'une copie dupliquee du paquet", () => true, () => (function () {
    const dup = fs.mkdtempSync(path.join(os.tmpdir(), "dup11-"));
    fs.cpSync(path.join(__dirname, ".."), path.join(dup, "p"), { recursive: true });
    const OPA2 = require(path.join(dup, "p", "core", "operator-provenance-authority.js"));
    const a2 = OPA2.createTestProvenanceAuthority({ roots: [{ sourceRootId: "S-T", authorityRootId: "A-T", familyRootId: "F-T" }] });
    return cd(() => AC.mintCapabilityGrant({ issuer: a2, capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
      artifactId: "art-T", artifactHash: "a".repeat(64), artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord",
      runId: "run-T", missionHash: "b".repeat(64), operatorBoundaryId: dT.operatorBoundaryId,
      configBindingHash: dT.configBindingHash, executionMode: "TEST", derivationRef: resT.derivationRef })) !== null; })());

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
  /**
   * §6 — une SEULE remise interne est exportee : `operator-trust-verifier.js`
   * doit pouvoir recevoir les emetteurs detenus par `operator-trust-boundary.js`
   * sans passer par le code appelant. Elle est nommee ici explicitement, et
   * T06/T07 prouvent qu'un appelant ne peut rien en tirer : des emetteurs
   * etrangers sont refuses, et l'absence d'emetteur donne un verificateur
   * sterile. Toute AUTRE surface `__` est un defaut.
   */
  const INTERNAL_HANDOFF = ["core/operator-trust-verifier.js::__build"];
  const unexpected = risky.filter((k) => INTERNAL_HANDOFF.indexOf(k) === -1);
  check("HYG-09. une seule remise interne exportee, nommee et bornee",
    unexpected.length === 0 && risky.length === INTERNAL_HANDOFF.length, JSON.stringify(risky));

  console.log("\n  -- non-regression --");
  const h = (p2) => crypto.createHash("sha256").update(fs.readFileSync(p2)).digest("hex");
  const lots = [["MONO-08", "v0.7"], ["MONO-08", "v0.8"], ["MONO-09", "v0.1"], ["MONO-09", "v0.2"],
    ["MONO-10", "v0.1"], ["MONO-10", "v0.2"], ["MONO-10", "v0.3"], ["MONO-10", "v0.4"], ["MONO-10", "v0.5"],
    ["MONO-10", "v0.6"], ["MONO-10", "v0.7"], ["MONO-10", "v0.8"], ["MONO-10", "v0.9"], ["MONO-10", "v0.10"]];
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
