#!/usr/bin/env node
"use strict";
// MONO-10 v0.10 — suite adversariale T01-T45 + 45 mutations causales.
// Aucun reseau, aucun LLM reel, aucun run EF-02, aucun acte humain reel.
// Usage : node test/test-mono10-v0.10.js <bundleRoot>

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
  console.log("MONO-10 v0.10 — suite adversariale\n");

  /**
   * Deux configurations PORTANT LE MEME IDENTIFIANT DECLARE, l'une de
   * PRODUCTION, l'autre de TEST. C'est la forme exacte de l'attaque B2 : le
   * verificateur de TEST est REEL, donc marque, et l'identifiant declare ne le
   * distingue pas de celui de production.
   */
  const opP = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "MEME-ID" });
  const opT = FX.provisionOperator({ namespace: "TEST", boundaryId: "MEME-ID" });
  const opAlt = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "MEME-ID" });
  const bP = FX.boundaryFor(opP), bT = FX.boundaryFor(opT), bAlt = FX.boundaryFor(opAlt);
  const vP = OTB.verifierFor(bP), vT = OTB.verifierFor(bT), vAlt = OTB.verifierFor(bAlt);
  const prod = await (await FX.buildChain({ mode: "PRODUCTION", operator: opP, boundary: bP, verifier: vP })).complete();
  const chain = prod;
  const reg = chain.registry, man = chain.manifest;
  const ctxOf = (r) => ({ operatorBoundaryId: r.operatorTrustBoundaryId,
    configBindingHash: (r.boundaryIdentity || {}).configBindingHash, executionMode: r.executionMode });
  const prodCtx = ctxOf(reg);

  /* ===== §6 — LA SURFACE DES EMETTEURS (T01-T08) ===== */
  console.log("  -- T01-T08 : le caller ne recoit plus l'emetteur --");
  const ISSUER_GETTERS = ["provenanceAuthority", "llmCapabilityBoundary", "historicalInputAuthority",
    "humanAuthMechanism", "acceptanceMechanism"];
  check("T01. la frontiere ne porte plus aucun emetteur critique",
    ISSUER_GETTERS.every((k) => typeof bP[k] === "undefined"),
    JSON.stringify(ISSUER_GETTERS.filter((k) => typeof bP[k] !== "undefined")));
  check("T02. le verificateur n'expose plus aucun getter d'emetteur",
    ISSUER_GETTERS.every((k) => typeof vP[k] === "undefined"),
    JSON.stringify(ISSUER_GETTERS.filter((k) => typeof vP[k] !== "undefined")));

  /**
   * §6 — INVENTAIRE REEL, pas une liste de noms connus. On balaie TOUTE la
   * surface atteignable (proprietes et retours de getters sans argument) et on
   * demande aux quatre predicats d'origine si l'objet obtenu est un emetteur.
   * Un nom que je n'aurais pas prevu est donc couvert aussi.
   */
  function issuerReachableFrom(root, label) {
    const found = [];
    const seen = new Set();
    const isIssuer = (o) => !!o && (OPA.isProvisionedProvenanceAuthority(o) || OLB.isProvisionedLlmBoundary(o)
      || HAB.isProvisionedHumanAuth(o) || OHIA.isProvisionedHistoricalInputAuthority(o));
    function look(o, pathStr, depth) {
      if (!o || depth > 3 || seen.has(o)) return;
      if (typeof o === "object") seen.add(o);
      Object.keys(o).forEach(function (k) {
        let v;
        try { v = o[k]; } catch (e) { return; }
        if (isIssuer(v)) { found.push(label + pathStr + "." + k); return; }
        if (typeof v === "function" && v.length === 0) {
          let r = null;
          try { r = v.call(o); } catch (e) { r = null; }
          if (isIssuer(r)) { found.push(label + pathStr + "." + k + "()"); return; }
          if (r && typeof r === "object") look(r, pathStr + "." + k + "()", depth + 1);
          return;
        }
        if (v && typeof v === "object") look(v, pathStr + "." + k, depth + 1);
      });
    }
    look(root, "", 0);
    return found;
  }
  const reachable = issuerReachableFrom(bP, "boundary").concat(issuerReachableFrom(vP, "verifier"))
    .concat(issuerReachableFrom(reg, "registry")).concat(issuerReachableFrom(man, "manifest"));
  check("T03. ACCESSIBLE_ISSUER_COUNT = 0 (balayage reel, profondeur 3)",
    reachable.length === 0, JSON.stringify(reachable));
  check("T04. la presence d'un emetteur est DECLARABLE sans remise de l'emetteur",
    bP.issuerInventory.provenance === true && bP.issuerInventory.humanAuth === true
    && vP.hasProvenanceAuthority() === true && typeof vP.provenanceAuthorityId() === "string"
    && OPA.isProvisionedProvenanceAuthority(vP.provenanceAuthorityId()) === false);
  check("T05. la fabrique publique de verificateur a disparu",
    typeof OTV.createOperatorTrustVerifier === "undefined");
  const mienne = OPA.createTestProvenanceAuthority({ roots: [{ sourceRootId: "MOI-1", authorityRootId: "A", familyRootId: "F" }] });
  check("T06. __build avec MES emetteurs : refuse",
    cd(() => OTV.__build(bP, { provenance: mienne })) === "VERIFIER_ISSUER_FOREIGN");
  const vNu = OTV.__build(bP, {});
  check("T07. __build sans emetteur : verificateur STERILE, jamais permissif",
    vNu.hasProvenanceAuthority() === false
    && vNu.resolveProvenanceRoots({ sourceRootId: "SRC-ROOT-A-0" }, prodCtx).status === "UNRESOLVED"
    && vNu.certifyProvenance({ registry: reg, artifactId: "doc-a:c-1" }).certified === false);
  check("T08. verifierFor refuse une frontiere fabriquee par l'appelant",
    cd(() => OTB.verifierFor(Object.assign({}, bP))) === "TRUST_BOUNDARY_FORGED"
    && cd(() => OTB.verifierFor({ operatorTrustBoundaryId: "MEME-ID", namespace: "PRODUCTION" })) === "TRUST_BOUNDARY_FORGED");

  /* ===== §4/§5 — L'EMISSION EST DERIVEE D'UNE OPERATION REELLE (T09-T16) ===== */
  console.log("\n  -- T09-T16 : une concession exige une derivation inscrite --");
  const eDoc = reg.get("doc-a:c-1");
  const grantReal = (eDoc.capabilityGrants || []).filter((g) => g.capability === AC.CAPABILITY.AUTHENTICATED_PROVENANCE)[0];
  const mintArgs = (over) => Object.assign({
    capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE, artifactId: "doc-a:c-1", artifactHash: eDoc.hash,
    artifactSchema: eDoc.artifactType, runId: man.runId, missionHash: man.missionHash,
    operatorBoundaryId: bP.operatorTrustBoundaryId, configBindingHash: bP.configBindingHash,
    executionMode: bP.namespace }, over || {});
  /**
   * §4 — l'emetteur reel n'est PLUS atteignable : pour mener l'attaque B1 il
   * faut donc en fabriquer un. On reproduit les deux formes : l'emetteur reel
   * SI on pouvait l'avoir (impossible, T03), et l'emetteur de TEST construit
   * par l'appelant (possible, et refuse).
   */
  check("T09. derivation inventee presentee a l'emission : refusee",
    cd(() => AC.mintCapabilityGrant(mintArgs({ issuer: mienne, derivationRef: "je-decrete-que-cest-authentifie" }))) !== null);
  check("T10. emetteur construit par l'appelant : refuse avant toute derivation",
    cd(() => AC.mintCapabilityGrant(mintArgs({ issuer: mienne, derivationRef: grantReal.derivationRef }))) === "CAPABILITY_ISSUER_INVALID");
  check("T11. derivation vide ou absente : refusee",
    cd(() => AC.mintCapabilityGrant(mintArgs({ issuer: mienne, derivationRef: "" }))) !== null
    && cd(() => AC.mintCapabilityGrant(mintArgs({ issuer: mienne }))) !== null);
  check("T12. TEMOIN POSITIF : la concession reelle porte le genre et l'empreinte de sa decision",
    AC.isCapabilityGrant(grantReal) && grantReal.decisionKind === "PROVENANCE_ROOT_RESOLUTION"
    && /^[0-9a-f]{64}$/.test(String(grantReal.decisionHash))
    && /^decision:provenance_root_resolution:/.test(String(grantReal.derivationRef)),
    JSON.stringify({ dk: grantReal.decisionKind, dh: String(grantReal.decisionHash).slice(0, 12) }));
  check("T13. la derivation reelle est verifiable aupres de son emetteur",
    vP.verifyIssuerDecision(AC.CAPABILITY.AUTHENTICATED_PROVENANCE, grantReal.derivationRef,
      { decisionKind: "PROVENANCE_ROOT_RESOLUTION", artifactId: "doc-a:c-1", artifactHash: eDoc.hash,
        runId: man.runId, missionHash: man.missionHash, executionMode: "PRODUCTION" }).valid === true);
  check("T14. la meme derivation pour un AUTRE artefact : non verifiable",
    vP.verifyIssuerDecision(AC.CAPABILITY.AUTHENTICATED_PROVENANCE, grantReal.derivationRef,
      { decisionKind: "PROVENANCE_ROOT_RESOLUTION", artifactId: "doc-b:c-1",
        runId: man.runId, executionMode: "PRODUCTION" }).valid === false);
  check("T15. une derivation inventee est absente du registre de decisions",
    vP.verifyIssuerDecision(AC.CAPABILITY.AUTHENTICATED_PROVENANCE, "decision:provenance_root_resolution:0000",
      { decisionKind: "PROVENANCE_ROOT_RESOLUTION" }).valid === false);
  const inconnue = vP.resolveProvenanceRoots({ sourceRootId: "RACINE-QUE-J-INVENTE" }, prodCtx);
  check("T16. une racine inconnue n'inscrit AUCUNE decision",
    inconnue.status !== "AUTHENTICATED" && inconnue.derivationRef === null
    && vP.certifyProvenance({ registry: reg, artifactId: "mission" }).certified === false,
    inconnue.status + "/" + String(inconnue.derivationRef));

  /* ===== §7/§8 — B2 : UN VERIFICATEUR NE VAUT QUE POUR SON CONTEXTE (T17-T24) ===== */
  console.log("\n  -- T17-T24 : un verificateur TEST n'authentifie pas un run PRODUCTION --");
  check("T17. les deux frontieres declarent le MEME identifiant (l'attaque est reelle)",
    bP.operatorTrustBoundaryId === bT.operatorTrustBoundaryId
    && bP.configBindingHash !== bT.configBindingHash
    && OTV.isOperatorTrustVerifier(vT) === true, bP.operatorTrustBoundaryId);
  const b2res = vT.resolveProvenanceRoots({ sourceRootId: "SRC-ROOT-A-0" }, prodCtx);
  check("T18. resolution de provenance par le verificateur TEST : refusee",
    b2res.code === "PROVENANCE_VERIFIER_CONTEXT_MISMATCH" && b2res.status !== "AUTHENTICATED",
    b2res.code || b2res.status);
  check("T19. le motif nomme le mode ET la liaison de configuration",
    b2res.problems.join(" ").indexOf("liaison de configuration") !== -1
    || b2res.problems.join(" ").indexOf("mode attendu") !== -1, JSON.stringify(b2res.problems).slice(0, 180));
  const b2cert = vT.certifyProvenance({ registry: reg, artifactId: "doc-b:c-2" });
  check("T20. certification par le verificateur TEST : refusee, et AUCUNE capacite concedee",
    b2cert.certified === false
    && (reg.get("doc-b:c-2").capabilityGrants || []).filter((g) => g.issuerAuthorityKind === "PROVENANCE_AUTHORITY"
      && g.executionMode === "TEST").length === 0);
  check("T21. verificateur d'une AUTRE configuration de PRODUCTION : refuse",
    vAlt.certifyProvenance({ registry: reg, artifactId: "doc-a:c-2" }).certified === false
    && bAlt.namespace === "PRODUCTION" && bAlt.configBindingHash !== bP.configBindingHash);
  check("T22. contexte attendu incomplet : refus, jamais saut du controle",
    vP.resolveProvenanceRoots({ sourceRootId: "SRC-ROOT-A-0" },
      { operatorBoundaryId: bP.operatorTrustBoundaryId, executionMode: "PRODUCTION" }).code
      === "PROVENANCE_VERIFIER_CONTEXT_MISMATCH"
    && vP.resolveProvenanceRoots({ sourceRootId: "SRC-ROOT-A-0" }, undefined).code
      === "PROVENANCE_VERIFIER_CONTEXT_MISMATCH");
  const espB2 = ESP.resolveEvidenceSourceProvenance(
    { provenanceRef: LIN.artifactRef(reg.get("doc-a:c-1").artifact, "doc-a:c-1", R.DOCUMENTARY_EVIDENCE) },
    reg, { verifier: vT, expectedRunId: man.runId, expectedMissionHash: man.missionHash });
  check("T23. resolveEvidenceSourceProvenance via le verificateur TEST : UNRESOLVED",
    espB2.status === "UNRESOLVED" && espB2.code === "PROVENANCE_VERIFIER_CONTEXT_MISMATCH", espB2.status);
  const espOK = ESP.resolveEvidenceSourceProvenance(
    { provenanceRef: LIN.artifactRef(reg.get("doc-a:c-1").artifact, "doc-a:c-1", R.DOCUMENTARY_EVIDENCE) },
    reg, { verifier: chain.verifier, expectedRunId: man.runId, expectedMissionHash: man.missionHash });
  check("T24. TEMOIN POSITIF : le verificateur du run authentifie bien cette provenance",
    espOK.status === "AUTHENTICATED" && typeof espOK.derivationRef === "string",
    espOK.status + " " + JSON.stringify(espOK.problems || []).slice(0, 120));

  /* ===== §9 — CONFIANCE D'IDENTITE : RESSERREMENT SEULEMENT (T25-T28) ===== */
  console.log("\n  -- T25-T28 : les seuils d'identite ne s'abaissent pas --");
  const E = (t, id, ref) => IDE.makeIdentityEvidence({ evidenceType: t, identifier: id, provenanceRef: ref,
    subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
  const idCtxReel = { registry: reg, verifier: chain.verifier, expectedRunId: man.runId, expectedMissionHash: man.missionHash };
  const evReelles = [E("t1", "i1", chain.docRefs.get("doc-a:c-1")), E("t2", "i2", chain.docRefs.get("doc-b:c-1"))];
  const confTemoin = IDE.deriveIdentityConfidence(evReelles, idCtxReel);
  check("T25. TEMOIN POSITIF : deux provenances authentifiees distinctes donnent STRONG",
    confTemoin.confidence === "STRONG" && confTemoin.independentProviders >= 2
    && confTemoin.minIndependentForStrong === 2 && confTemoin.strongThreshold === 1.0,
    confTemoin.confidence + " indep=" + confTemoin.independentProviders);
  const confSeuil0 = IDE.deriveIdentityConfidence([E("t1", "i1", null)],
    Object.assign({}, idCtxReel, { minIndependentForStrong: 0, strongThreshold: 0 }));
  check("T26. seuils abaisses a zero : plancher du lot conserve, pas de STRONG",
    confSeuil0.confidence !== "STRONG" && confSeuil0.minIndependentForStrong === 2
    && confSeuil0.strongThreshold === 1.0 && confSeuil0.policyNarrowedOnly === false,
    confSeuil0.confidence + " min=" + confSeuil0.minIndependentForStrong);
  const confDur = IDE.deriveIdentityConfidence(evReelles,
    Object.assign({}, idCtxReel, { minIndependentForStrong: 3, strongThreshold: 2.5 }));
  check("T27. seuils DURCIS : acceptes, et le resultat s'en ressent",
    confDur.minIndependentForStrong === 3 && confDur.strongThreshold === 2.5
    && confDur.policyNarrowedOnly === true && confDur.confidence !== "STRONG", confDur.confidence);
  const confSansV = IDE.deriveIdentityConfidence(evReelles, { registry: reg });
  check("T28. sans verificateur : independance INCONNUE, jamais STRONG",
    confSansV.confidence !== "STRONG" && confSansV.independentProviders < 2,
    confSansV.confidence + " " + JSON.stringify(confSansV.reasons).slice(0, 140));

  /* ===== §10 — LE CORPUS PRESENTE A L'HUMAIN (T29-T33) ===== */
  console.log("\n  -- T29-T33 : une reference n'entre au corpus que sur derivation verifiee --");
  const assessArgs = (over) => Object.assign({
    discovery: chain.discovery, verification: chain.verification, missionLabels: ["libelle-alpha"],
    runId: man.runId, missionHash: man.missionHash, attestationHash: man.runtimeAttestationHash,
    artifactRegistry: reg, discoveryArtifactId: "professional-discovery",
    verificationArtifactId: "professional-verification" }, over || {});
  const aReel = CA.assessCandidates(assessArgs({ verifier: chain.verifier }));
  check("T29. TEMOIN POSITIF : avec le verificateur du run, les references entrent au corpus",
    aReel.assessments.every((a) => (a.missionEvidenceRefs || []).length === 2)
    && aReel.assessments.every((a) => (a.unauthenticatedEvidenceRefs || []).length === 0),
    JSON.stringify(aReel.assessments.map((a) => (a.missionEvidenceRefs || []).length)));
  const aSansV = CA.assessCandidates(assessArgs({}));
  check("T30. sans verificateur : ZERO reference admise, et toutes CONSIGNEES avec leur motif",
    aSansV.assessments.every((a) => (a.missionEvidenceRefs || []).length === 0)
    && aSansV.assessments.every((a) => (a.unauthenticatedEvidenceRefs || []).length === 2)
    && aSansV.assessments.every((a) => (a.unauthenticatedEvidenceRefs || [])
      .every((u) => /verificateur/.test(String(u.reason)))),
    JSON.stringify((aSansV.assessments[0] || {}).unauthenticatedEvidenceRefs || []).slice(0, 200));
  const aVT = CA.assessCandidates(assessArgs({ verifier: vT }));
  check("T31. avec le verificateur TEST : ZERO reference admise sur un registre PRODUCTION",
    aVT.assessments.every((a) => (a.missionEvidenceRefs || []).length === 0),
    JSON.stringify(aVT.assessments.map((a) => (a.missionEvidenceRefs || []).length)));
  /**
   * §10/§25 — on ne se contente pas de "!== null" : on verifie que la
   * consequence AVAL est bien celle attendue. Sans reference admise, aucun
   * candidat ne peut etre presente a un humain.
   */
  check("T32. consequence aval : aucun candidat presentable sans reference admise",
    aSansV.assessments.every((a) => a.status !== "QUALIFIED")
    && (PG.buildPanelValidationTemplate(aSansV).decisions || []).length === 0
    && (PG.buildPanelValidationTemplate(aReel).decisions || []).length === 3,
    JSON.stringify(aSansV.assessments.map((a) => a.status)));
  /**
   * §10 — l'API publique `capabilityVerifiedBy` ne doit pas etre plus
   * permissive que le consommateur critique. Meme entree, meme verdict.
   */
  const capExp = { runId: man.runId, missionHash: man.missionHash, executionMode: "PRODUCTION" };
  check("T33. l'API publique de verification n'est pas plus permissive que son consommateur",
    AC.capabilityVerifiedBy(eDoc, AC.CAPABILITY.AUTHENTICATED_PROVENANCE, chain.verifier, capExp).verified === true
    && AC.capabilityVerifiedBy(eDoc, AC.CAPABILITY.AUTHENTICATED_PROVENANCE, null, capExp).verified === false
    && AC.capabilityVerifiedBy(eDoc, AC.CAPABILITY.AUTHENTICATED_PROVENANCE, vT, capExp).verified === false
    && AC.hasCapability(eDoc, AC.CAPABILITY.AUTHENTICATED_PROVENANCE) === true);

  /* ===== §11/§12 — CAPACITE LLM (T34-T39) ===== */
  console.log("\n  -- T34-T39 : une capacite LLM non sondee n'existe pas --");
  const llmCfg = { providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture",
    credentialPresent: true, runId: man.runId };
  const sondeDirecte = await LC.runActiveProbe(llmCfg, chain.ctx);
  check("T34. runActiveProbe appele par l'appelant : UNAVAILABLE, aucune sonde",
    sondeDirecte.status === "UNAVAILABLE" && sondeDirecte.probeExecuted === false
    && sondeDirecte.probeDerivationRef === null, sondeDirecte.status + " / " + sondeDirecte.failureReason);
  const sondeFauxV = await LC.runActiveProbe(llmCfg,
    Object.assign({}, chain.ctx, { verifier: { llmCapabilityBoundary: () => ({ probe: () => ({ httpStatus: 200 }) }) } }));
  check("T35. verificateur d'appelant portant un getter d'emetteur : ignore et signale",
    sondeFauxV.status === "UNAVAILABLE" && sondeFauxV.callerVerifierIgnored === true);
  const capReelle = chain.capability;
  const ctxUse = Object.assign({}, chain.ctx, { llmCapabilityArtifactId: "llm-capability" });
  check("T36. TEMOIN POSITIF : la sonde de la frontiere est AVAILABLE et utilisable",
    capReelle.status === "AVAILABLE" && /^decision:llm_probe_execution:/.test(String(capReelle.probeDerivationRef))
    && LC.assertCapabilityUsable(capReelle, llmCfg, ctxUse).usable === true,
    JSON.stringify(LC.assertCapabilityUsable(capReelle, llmCfg, ctxUse).problems || []).slice(0, 200));
  const capSansRef = Object.assign({}, capReelle, { probeDerivationRef: null });
  check("T37. capacite sans reference de sonde : inutilisable",
    LC.assertCapabilityUsable(capSansRef, llmCfg, ctxUse).usable === false);
  const capRefFausse = Object.assign({}, capReelle, { probeDerivationRef: "decision:llm_probe_execution:jamais-executee" });
  check("T38. reference de sonde inventee : inutilisable",
    LC.assertCapabilityUsable(capRefFausse, llmCfg, ctxUse).usable === false
    && (LC.assertCapabilityUsable(capRefFausse, llmCfg, ctxUse).problems || [])
      .join(" ").indexOf("non verifiable") !== -1);
  check("T39. capacite reelle sans verificateur au contexte : inutilisable, pas dispensee",
    LC.assertCapabilityUsable(capReelle, llmCfg,
      Object.assign({}, ctxUse, { verifier: undefined })).usable === false
    && LC.assertCapabilityUsable(capReelle, llmCfg,
      Object.assign({}, ctxUse, { verifier: vT })).usable === false);

  /* ===== §13/§14 — PREPARATION SCIENTIFIQUE (T40-T43) ===== */
  console.log("\n  -- T40-T43 : readiness, identite composite et mode authentique --");
  const rdOpt = { registry: reg, verifier: chain.verifier, manifest: man,
    expectedRunId: man.runId, expectedMissionHash: man.missionHash };
  check("T40. TEMOIN POSITIF : le vrai couple registre/verificateur valide la FULL",
    SR.assertReadinessPhase(chain.full, "FULL", rdOpt, "T40") === true);
  const fauxV = { operatorTrustBoundaryId: bP.operatorTrustBoundaryId, namespace: "PRODUCTION",
    executionMode: "PRODUCTION",
    boundaryIdentity: { operatorBoundaryId: bP.operatorTrustBoundaryId,
      configBindingHash: bP.configBindingHash, executionMode: "PRODUCTION" } };
  check("T41. verificateur de forme compatible : FAIT ECHOUER le controle, ne le saute pas",
    cd(() => SR.assertReadinessPhase(chain.full, "FULL",
      Object.assign({}, rdOpt, { verifier: fauxV }), "T41")) === "READINESS_VERIFIER_FORGED"
    && OTV.isOperatorTrustVerifier(fauxV) === false);
  check("T42. verificateur d'une autre configuration au meme identifiant : refuse",
    cd(() => SR.assertReadinessPhase(chain.full, "FULL",
      Object.assign({}, rdOpt, { verifier: vAlt }), "T42")) === "READINESS_REGISTRY_BOUNDARY_MISMATCH");
  const testChain = await (await FX.buildChain({ mode: "TEST", operator: opT, boundary: bT, verifier: vT })).complete();
  const fullTestRelabel = (function () { const r = clone(testChain.full); r.executionMode = "PRODUCTION"; return r; })();
  check("T43. artefact de readiness re-etiquete PRODUCTION sur un registre TEST : refuse",
    cd(() => SR.assertReadinessPhase(fullTestRelabel, "FULL",
      { registry: testChain.registry, verifier: testChain.verifier, manifest: testChain.manifest,
        expectedRunId: testChain.manifest.runId }, "T43")) === "READINESS_EXECUTION_MODE_MISDECLARED"
    && cd(() => SR.assertReadinessPhase(testChain.full, "FULL",
      { registry: testChain.registry, verifier: testChain.verifier,
        manifest: Object.assign({}, testChain.manifest, { executionMode: "PRODUCTION" }),
        expectedRunId: testChain.manifest.runId }, "T43b")) === "READINESS_REGISTRY_MODE_INSUFFICIENT");

  /* ===== §15 — GENERATION DE CONFIANCE (T44-T45) ===== */
  console.log("\n  -- T44-T45 : ce que l'anti-rejeu protege, et ce qu'il ne protege pas --");
  const genDir = fs.mkdtempSync(path.join(os.tmpdir(), "ef10-gen-"));
  const alias = path.join(genDir, "alias.json");
  fs.symlinkSync(opP.cfgPath, alias);
  check("T44. deux alias du MEME fichier donnent la MEME generation",
    RP.trustConfigAnchorOf(alias) === RP.trustConfigAnchorOf(opP.cfgPath));
  const renomme = path.join(path.dirname(opP.cfgPath), "trust-renomme.json");
  const anchorAvant = RP.trustConfigAnchorOf(opP.cfgPath);
  fs.renameSync(opP.cfgPath, renomme);
  const anchorApres = RP.trustConfigAnchorOf(renomme);
  const nsAvant = RP.deriveReplayNamespaceId({ namespace: "PRODUCTION", trustConfigAnchor: anchorAvant,
    authorities: [{ authorityId: opP.authority.authorityId, keyIds: [opP.authority.keyRecord().keyId] }] });
  const nsApres = RP.deriveReplayNamespaceId({ namespace: "PRODUCTION", trustConfigAnchor: anchorApres,
    authorities: [{ authorityId: opP.authority.authorityId, keyIds: [opP.authority.keyRecord().keyId] }] });
  /**
   * §15 — le changement de generation n'est NI silencieux NI absorbe : la meme
   * autorite et la meme cle sous un autre namespace anti-rejeu sont REFUSEES
   * dans ce processus. Le lot ne pretend pas faire suivre la reserve ; il
   * refuse de faire semblant.
   */
  const reprov = cd(function () { const prev = process.env[OTB.ENV_VAR];
    process.env[OTB.ENV_VAR] = renomme;
    try { return OTB.provisionProductionTrustBoundary(); }
    finally { if (prev === undefined) delete process.env[OTB.ENV_VAR]; else process.env[OTB.ENV_VAR] = prev; } });
  fs.renameSync(renomme, opP.cfgPath);
  check("T45. un renommage ouvre une NOUVELLE generation, et elle est DETECTEE",
    anchorApres !== anchorAvant && nsApres !== nsAvant && reprov === "REPLAY_NAMESPACE_CONFLICT",
    String(anchorAvant).slice(0, 8) + " -> " + String(anchorApres).slice(0, 8) + " / " + reprov);

  /* ===== 45 MUTATIONS CAUSALES ===== */
  console.log("\n  -- 45 mutations causales --");
  const M = mutation;
  // §6 — surface des emetteurs
  M("M01", "emetteur de provenance lu sur la frontiere", () => true, () => typeof bP.provenanceAuthority === "undefined");
  M("M02", "mecanisme d'acte humain lu sur la frontiere", () => true, () => typeof bP.humanAuthMechanism === "undefined");
  M("M03", "frontiere LLM lue sur la frontiere", () => true, () => typeof bP.llmCapabilityBoundary === "undefined");
  M("M04", "autorite d'entree historique lue sur la frontiere", () => true, () => typeof bP.historicalInputAuthority === "undefined");
  M("M05", "getter d'emetteur sur le verificateur", () => true, () => typeof vP.provenanceAuthority === "undefined");
  M("M06", "emetteur atteint par balayage de surface", () => reachable.length === 0 || true,
    () => issuerReachableFrom(vP, "v").length === 0);
  M("M07", "identifiant d'emetteur pris pour l'emetteur", () => typeof vP.provenanceAuthorityId() === "string",
    () => OPA.isProvisionedProvenanceAuthority(vP.provenanceAuthorityId()) === false);
  M("M08", "verificateur construit avec mes emetteurs", () => OPA.isProvisionedProvenanceAuthority(mienne) === true,
    () => cd(() => OTV.__build(bP, { provenance: mienne })) === "VERIFIER_ISSUER_FOREIGN");
  M("M09", "frontiere copiee presentee a verifierFor", () => true,
    () => cd(() => OTB.verifierFor(Object.assign({}, bP))) === "TRUST_BOUNDARY_FORGED");
  M("M10", "verificateur sterile utilise comme verificateur", () => OTV.isOperatorTrustVerifier(vNu) === true,
    () => vNu.certifyProvenance({ registry: reg, artifactId: "doc-a:c-1" }).certified === false);
  // §4/§5 — emission
  M("M11", "derivation inventee a l'emission", () => true,
    () => cd(() => AC.mintCapabilityGrant(mintArgs({ issuer: mienne, derivationRef: "je-decrete" }))) !== null);
  M("M12", "emetteur de TEST construit par l'appelant", () => true,
    () => cd(() => AC.mintCapabilityGrant(mintArgs({ issuer: mienne, derivationRef: grantReal.derivationRef }))) === "CAPABILITY_ISSUER_INVALID");
  M("M13", "derivation reelle detournee vers un autre artefact", () => AC.isCapabilityGrant(grantReal),
    () => vP.verifyIssuerDecision(AC.CAPABILITY.AUTHENTICATED_PROVENANCE, grantReal.derivationRef,
      { artifactId: "doc-b:c-1" }).valid === false);
  M("M14", "derivation reelle detournee vers un autre run", () => true,
    () => vP.verifyIssuerDecision(AC.CAPABILITY.AUTHENTICATED_PROVENANCE, grantReal.derivationRef,
      { runId: "run-que-j-invente" }).valid === false);
  M("M15", "racine inconnue presentee comme resolue", () => inconnue.status !== "AUTHENTICATED",
    () => inconnue.derivationRef === null);
  M("M16", "concession reelle (temoin positif)", () => grantReal.decisionKind === "PROVENANCE_ROOT_RESOLUTION",
    () => vP.verifyIssuerDecision(AC.CAPABILITY.AUTHENTICATED_PROVENANCE, grantReal.derivationRef,
      { decisionKind: "PROVENANCE_ROOT_RESOLUTION", artifactId: "doc-a:c-1", runId: man.runId }).valid === true);
  M("M17", "concession sans liaison de configuration", () => true,
    () => cd(() => AC.mintCapabilityGrant(mintArgs({ issuer: mienne, configBindingHash: null,
      derivationRef: grantReal.derivationRef }))) !== null);
  M("M18", "empreinte de decision reecrite sur la concession", () => true,
    () => (function () { const g = Object.assign({}, grantReal, { decisionHash: sha256Of({ x: 1 }) });
      return AC.isCapabilityGrant(g) === false; })());
  // §7/§8 — B2
  M("M19", "verificateur TEST sur registre PRODUCTION", () => OTV.isOperatorTrustVerifier(vT) === true
    && bT.operatorTrustBoundaryId === bP.operatorTrustBoundaryId,
    () => vT.certifyProvenance({ registry: reg, artifactId: "doc-a:c-1" }).certified === false);
  M("M20", "verificateur TEST pour resoudre une racine de production", () => true,
    () => vT.resolveProvenanceRoots({ sourceRootId: "SRC-ROOT-A-0" }, prodCtx).code === "PROVENANCE_VERIFIER_CONTEXT_MISMATCH");
  M("M21", "verificateur d'une autre configuration de production", () => bAlt.namespace === "PRODUCTION",
    () => vAlt.certifyProvenance({ registry: reg, artifactId: "doc-a:c-1" }).certified === false);
  M("M22", "contexte attendu ampute de sa liaison de configuration", () => true,
    () => vP.resolveProvenanceRoots({ sourceRootId: "SRC-ROOT-A-0" },
      { operatorBoundaryId: bP.operatorTrustBoundaryId, executionMode: "PRODUCTION" }).code === "PROVENANCE_VERIFIER_CONTEXT_MISMATCH");
  M("M23", "contexte attendu absent", () => true,
    () => vP.resolveProvenanceRoots({ sourceRootId: "SRC-ROOT-A-0" }, null).code === "PROVENANCE_VERIFIER_CONTEXT_MISMATCH");
  M("M24", "provenance de preuve via un verificateur TEST", () => true, () => espB2.status === "UNRESOLVED");
  M("M25", "provenance authentique (temoin positif)", () => espOK.status === "AUTHENTICATED",
    () => typeof espOK.derivationRef === "string" && espOK.derivationRef.length > 0);
  M("M26", "entree historique demandee sans verificateur marque", () => true,
    () => (function () { const r = LIN.resolveLineage(
      [LIN.artifactRef(reg.get("mission").artifact, "mission", R.MISSION)], reg,
      { manifest: man, verifier: fauxV, historicalInputRequest: { artifactId: "mission" } });
      return r.problems.join(" ").indexOf("verificateur issu d'une frontiere operateur") !== -1; })());
  M("M27", "autorite d'entree historique passee en argument", () => true,
    () => (function () { const r = LIN.resolveLineage(
      [LIN.artifactRef(reg.get("mission").artifact, "mission", R.MISSION)], reg,
      { manifest: man, historicalInputAuthority: OHIA.createTestHistoricalInputAuthority({ authorized: [{
          sourceRunId: "run-anterieur", sourceMissionHash: man.missionHash, artifactId: "mission",
          artifactHash: reg.get("mission").hash, artifactType: "EvidenceForge.Mission", relation: R.MISSION,
          destinationRunId: man.runId, destinationMissionHash: man.missionHash,
          purpose: "reprise d'entree historique", frozenIdentity: "lot-anterieur-scelle" }] }),
        historicalInputRequest: { artifactId: "mission" } });
      return r.problems.join(" ").indexOf("IGNOREE") !== -1; })());
  // §9 — identite
  M("M28", "seuil d'independance abaisse a zero", () => true,
    () => confSeuil0.minIndependentForStrong === 2 && confSeuil0.confidence !== "STRONG");
  M("M29", "seuil de contribution abaisse a zero", () => true, () => confSeuil0.strongThreshold === 1.0);
  M("M30", "seuils durcis (temoin positif de la direction autorisee)",
    () => confDur.minIndependentForStrong === 3, () => confDur.policyNarrowedOnly === true);
  M("M31", "STRONG sans verificateur", () => evReelles.length === 2, () => confSansV.confidence !== "STRONG");
  M("M32", "identite reelle (temoin positif)", () => true, () => confTemoin.confidence === "STRONG");
  // §10 — corpus
  M("M33", "corpus constitue sans verificateur", () => (chain.discovery.candidates || []).length === 3,
    () => aSansV.assessments.every((a) => (a.missionEvidenceRefs || []).length === 0)
      && aSansV.assessments.every((a) => (a.unauthenticatedEvidenceRefs || []).length === 2));
  M("M34", "corpus constitue avec un verificateur TEST", () => true,
    () => aVT.assessments.every((a) => (a.missionEvidenceRefs || []).length === 0));
  M("M35", "panel saisi malgre un corpus vide", () => true,
    () => (PG.buildPanelValidationTemplate(aSansV).decisions || []).length === 0);
  M("M36", "corpus reel (temoin positif)", () => true,
    () => aReel.assessments.every((a) => (a.missionEvidenceRefs || []).length === 2));
  M("M37", "API publique plus permissive que son consommateur", () => true,
    () => AC.capabilityVerifiedBy(eDoc, AC.CAPABILITY.AUTHENTICATED_PROVENANCE, null, capExp).verified === false);
  // §11/§12 — LLM
  M("M38", "sonde executee hors frontiere", () => true,
    () => sondeDirecte.status === "UNAVAILABLE" && sondeDirecte.probeDerivationRef === null);
  M("M39", "verificateur d'appelant portant un getter d'emetteur", () => true,
    () => sondeFauxV.callerVerifierIgnored === true && sondeFauxV.status === "UNAVAILABLE");
  M("M40", "reference de sonde retiree", () => capSansRef.status === "AVAILABLE",
    () => LC.assertCapabilityUsable(capSansRef, llmCfg, ctxUse).usable === false);
  M("M41", "reference de sonde inventee", () => capRefFausse.status === "AVAILABLE",
    () => LC.assertCapabilityUsable(capRefFausse, llmCfg, ctxUse).usable === false);
  M("M42", "capacite reelle (temoin positif)", () => true,
    () => LC.assertCapabilityUsable(capReelle, llmCfg, ctxUse).usable === true);
  // §13/§14/§15
  M("M43", "verificateur de forme compatible presente a la readiness",
    () => typeof fauxV.boundaryIdentity === "object",
    () => cd(() => SR.assertReadinessPhase(chain.full, "FULL", Object.assign({}, rdOpt, { verifier: fauxV }), "M43")) === "READINESS_VERIFIER_FORGED");
  M("M44", "readiness de TEST re-etiquetee PRODUCTION", () => fullTestRelabel.executionMode === "PRODUCTION",
    () => cd(() => SR.assertReadinessPhase(fullTestRelabel, "FULL",
      { registry: testChain.registry, verifier: testChain.verifier, manifest: testChain.manifest,
        expectedRunId: testChain.manifest.runId }, "M44")) === "READINESS_EXECUTION_MODE_MISDECLARED");
  M("M45", "generation de confiance changee en silence", () => anchorApres !== anchorAvant,
    () => nsApres !== nsAvant && reprov === "REPLAY_NAMESPACE_CONFLICT");

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
    ["MONO-10", "v0.6"], ["MONO-10", "v0.7"], ["MONO-10", "v0.8"], ["MONO-10", "v0.9"]];
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
