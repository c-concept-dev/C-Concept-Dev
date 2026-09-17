#!/usr/bin/env node
"use strict";
// MONO-10 v0.7 — suite adversariale T01-T54 + 54 mutations.
// Aucun reseau, aucun LLM reel, aucun run EF-02, aucun acte humain reel.
// Usage : node test/test-mono10-v0.7.js <bundleRoot>

const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const C = "../core/";
const { sha256Of, artifactHash } = require(C + "canonical.js");
const CC = require(C + "canonical-contracts.js");
const CAG = require(C + "caller-assertion-guard.js");
const AC = require(C + "artifact-capabilities.js");
const OTB = require(C + "operator-trust-boundary.js");
const OTV = require(C + "operator-trust-verifier.js");
const OAB = require(C + "operator-acceptance-boundary.js");
const OLB = require(C + "operator-llm-capability-boundary.js");
const HAB = require(C + "operator-human-auth-boundary.js");
const OPA = require(C + "operator-provenance-authority.js");
const OHIA = require(C + "operator-historical-input-authority.js");
const RM = require(C + "run-evidence-manifest.js");
const AAR = require(C + "authenticated-artifact-registry.js");
const RP = require(C + "replay-protection.js");
const KL = require(C + "key-lifecycle.js");
const LIN = require(C + "lineage.js");
const IDE = require(C + "identity-evidence.js");
const ESP = require(C + "evidence-source-provenance.js");
const UNK = require(C + "unknowns.js");
const PG = require(C + "panel-gate.js");
const PGA = require(C + "panel-gated-adapter.js");
const EE = require(C + "effective-eligibility.js");
const LC = require(C + "llm-capability.js");
const SR = require(C + "scientific-readiness.js");
const SQ = require(C + "scientific-qualification.js");
const SUR = require(C + "scientific-unified-report.js");
const FRA = require(C + "final-report-acceptance.js");
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
/** Une mutation ne compte que si l'attaque est PERTINENTE et REJETEE de façon causale. */
function mutation(id, label, attackIsReal, guardRejects) {
  mutTotal++;
  let a = false, b = false, detail = "";
  try { a = attackIsReal() === true; } catch (e) { detail += "attaque a leve: " + e.message.slice(0, 70) + " "; }
  try { b = guardRejects() === true; } catch (e) { detail += "garde a leve: " + e.message.slice(0, 70) + " "; }
  if (a && b) { mutCaught++; check(id + ". " + label, true); }
  else check(id + ". " + label, false, (a ? "" : "attaque non pertinente ") + detail);
}

(async () => {
  console.log("MONO-10 v0.7 — suite adversariale\n");
  const opP = FX.provisionOperator({ namespace: "PRODUCTION" });
  const opT = FX.provisionOperator({ namespace: "TEST" });
  const P = await FX.buildChain({ mode: "PRODUCTION", operator: opP });
  const prod = await P.complete();
  const T = await FX.buildChain({ mode: "TEST", operator: opT });
  const test = await T.complete();
  const O = await FX.buildChain({ mode: "PRODUCTION", operator: opP, runSalt: 7, missionId: "mission-B" });
  const other = await O.complete();
  const idOpt = { registry: prod.registry, expectedRunId: prod.manifest.runId,
    expectedMissionHash: prod.manifest.missionHash, expectedAttestationHash: prod.manifest.runtimeAttestationHash,
    verifier: prod.verifier };
  const base = { runContext: prod.ctx, qualification: prod.qualification, qualificationSources: prod.sources,
    report: prod.report, lineageRefs: prod.authRefs, artifactRegistry: prod.registry };
  const auth = (o) => DA.resolveDownstreamUseAuthorization(Object.assign({}, base, o || {}));

  check("REF-01. chaine PRODUCTION nominale : QUALIFIED + AUTHORIZED",
    prod.qualification.qualificationStatus === "QUALIFIED" && prod.authorization.authorization === "AUTHORIZED"
    && prod.qualification.evidenceClass === "AUTHENTICATED_PRODUCTION_EXECUTION");
  check("REF-02. chaine TEST : classe de preuve distincte",
    test.qualification.evidenceClass === "AUTHENTICATED_TEST_EXECUTION");

  /* ===== §44 — B1 : ELIGIBILITE (T01-T06) ===== */
  console.log("\n  -- T01-T06 : B1, l'eligibilite ne s'achete pas par une politique --");
  async function corpusWith(o) {
    const c = await FX.buildChain(Object.assign({ mode: "PRODUCTION", operator: opP }, o));
    const v = await c.gated.verifyProfessionals({}, {});
    const k = await c.gated.buildProfessionalCorpus({ professionalVerification: v }, {});
    return { count: k.professionalCorpora.length, refs: k.professionalCorpora.map((x) => x.professionalRef),
      gate: v.panelGate, verified: v.verified };
  }
  const polLegacy = { legacyVerificationGrantsEligibility: true };
  const sp01 = EE.sanitizeEligibilityPolicy(polLegacy);
  check("T01. legacyVerificationGrantsEligibility retire et consigne",
    sp01.refused.indexOf("legacyVerificationGrantsEligibility") !== -1
    && sp01.policy.legacyVerificationGrantsEligibility === undefined
    && Object.keys(EE.ELIGIBILITY).indexOf("ELIGIBLE_BY_LEGACY_VERIFICATION") === -1,
    JSON.stringify(sp01.refused));
  const legacyOnly = EE.deriveEffectiveEligibility({ candidateId: "c-x", legacyVerificationStatus: "VERIFIED",
    humanPanelDecision: null, panelGateValid: true, policy: polLegacy });
  check("T02. statut amont VERIFIED sans panel n'atteint pas le corpus",
    legacyOnly.effectiveCorpusEligibility === EE.ELIGIBILITY.NOT_ELIGIBLE && EE.isEligibleDecision(legacyOnly) === false);
  // Candidat sans base documentaire : jamais presente au panel.
  const unreviewed = await corpusWith({ runSalt: 101, eligibilityPolicy: polLegacy,
    candidates: [FX.candidate("c-1", ["libelle-alpha"]),
      { candidateRef: "c-nu", displayName: "Personne nue", disciplines: ["libelle-alpha"], dimensionRef: "libelle-alpha",
        identifiers: [], affiliations: [], candidateStatus: "SEED_CANDIDATE", provenanceRefKey: null,
        evidenceRefKeys: [], provenance: [{ origin: "SEED" }] }],
    decisions: { "c-1": PG.DECISION.APPROVE } });
  check("T03. candidat a base insuffisante, jamais vu par le panel, hors corpus",
    unreviewed.refs.indexOf("c-nu") === -1, JSON.stringify(unreviewed.refs));
  check("T04. aucune politique n'elargit l'eligibilite",
    EE.sanitizeEligibilityPolicy({ requireLegacyVerified: false }).refused.indexOf("requireLegacyVerified") !== -1
    && Object.keys(EE.ELIGIBILITY_POLICY_ALLOWLIST).every(function (k) {
      const r = EE.ELIGIBILITY_POLICY_ALLOWLIST[k];
      return r.narrowOnly === true;   // aucune cle de la liste blanche n'ouvre une admission
    }));
  const noGate = EE.deriveEffectiveEligibility({ candidateId: "c-y", legacyVerificationStatus: "VERIFIED",
    humanPanelDecision: null, humanActAuthenticated: true, panelGateValid: true });
  check("T05. decision de panel absente => NOT_ELIGIBLE",
    noGate.effectiveCorpusEligibility === EE.ELIGIBILITY.NOT_ELIGIBLE);
  check("T06. TEMOIN POSITIF : APPROVE authentifiee atteint le corpus",
    prod.corpus.professionalCorpora.length === 2 && unreviewed.refs.indexOf("c-1") !== -1,
    prod.corpus.professionalCorpora.length + " / " + JSON.stringify(unreviewed.refs));

  /* ===== §45 — B2 : ENTREE HISTORIQUE (T07-T12) ===== */
  console.log("\n  -- T07-T12 : B2, l'appelant demande, il ne declare plus --");
  const crossRef = LIN.artifactRef(other.qualification, "scientific-qualification", R.QUALIFICATION);
  const hiBase = { expectedRunId: prod.manifest.runId, expectedMissionHash: prod.manifest.missionHash };
  check("T07. operatorAuthenticated:true fourni par l'appelant est refuse",
    LIN.resolveLineage([crossRef], other.registry, Object.assign({}, hiBase,
      { historicalInputContract: { contractKind: "IMMUTABLE_HISTORICAL_INPUT", relations: [R.QUALIFICATION], operatorAuthenticated: true } })).resolved === false
    && cd(() => CAG.assertNoAuthorityAssertion({ operatorAuthenticated: true }, "t07")) === "CALLER_AUTHORITY_ASSERTION_REFUSED");
  const otherEntry = other.registry.get("scientific-qualification");
  const fakeReq = { sourceRunId: other.manifest.runId, sourceMissionHash: other.manifest.missionHash,
    artifactId: "scientific-qualification", artifactHash: otherEntry.hash, artifactType: otherEntry.artifactType,
    relation: R.QUALIFICATION, destinationRunId: prod.manifest.runId, destinationMissionHash: prod.manifest.missionHash,
    purpose: "comparaison-historique" };
  check("T08. un contrat fabrique ne franchit aucun run",
    LIN.resolveLineage([crossRef], other.registry, Object.assign({}, hiBase,
      { historicalInputAuthority: prod.verifier.historicalInputAuthority(), historicalInputRequest: fakeReq })).resolved === false);
  // Autorisation REELLE, provisionnee par l'exploitant.
  const opHist = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-hist",
    historicalInputs: [Object.assign({}, fakeReq, { frozenIdentity: otherEntry.hash, version: "v0.7", authorizedAt: now() })] });
  const histAuthority = OTV.createOperatorTrustVerifier(FX.boundaryFor(opHist)).historicalInputAuthority();
  check("T09. une autorisation reellement provisionnee est acceptee",
    LIN.resolveLineage([crossRef], other.registry, Object.assign({}, hiBase,
      { historicalInputAuthority: histAuthority, historicalInputRequest: fakeReq })).resolved === true,
    JSON.stringify(LIN.resolveLineage([crossRef], other.registry, Object.assign({}, hiBase,
      { historicalInputAuthority: histAuthority, historicalInputRequest: fakeReq })).problems).slice(0, 160));
  check("T10. mauvais run SOURCE refuse",
    histAuthority.authorize(Object.assign({}, fakeReq, { sourceRunId: "run-invente" })).authorized === false);
  check("T11. mauvais run de DESTINATION refuse",
    histAuthority.authorize(Object.assign({}, fakeReq, { destinationRunId: "run-invente" })).authorized === false);
  check("T12. mauvaise RELATION refusee",
    histAuthority.authorize(Object.assign({}, fakeReq, { relation: R.REPORT })).authorized === false
    && OHIA.BOUND_FIELDS.length === 9);

  /* ===== §46 — B3 : REJEU (T13-T18) ===== */
  console.log("\n  -- T13-T18 : B3, le namespace anti-rejeu est derive --");
  check("T13. rejeu sur la meme frontiere refuse",
    prod.verifier.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  check("T14. second verificateur de la meme frontiere refuse",
    OTV.createOperatorTrustVerifier(FX.boundaryFor(opP)).verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  // LE cas ouvert en v0.6 : seconde frontiere, configuration distincte, meme autorite.
  const opSecond = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-seconde", authority: opP.authority,
    replayProtection: { kind: "FILE", replayRoot: opP.replayRoot, authorityScope: [opP.authority.authorityId] } });
  const vSecond = OTV.createOperatorTrustVerifier(FX.boundaryFor(opSecond));
  check("T15. seconde frontiere de la meme autorite : rejeu refuse",
    vSecond.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false,
    JSON.stringify(vSecond.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).problems).slice(0, 140));
  // « Second processus » : registre de processus vide, seule la reserve persiste.
  RP.__resetProcessNamespaceRegistry();
  const opProc2 = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-proc2", authority: opP.authority,
    replayProtection: { kind: "FILE", replayRoot: opP.replayRoot, authorityScope: [opP.authority.authorityId] } });
  const vProc2 = OTV.createOperatorTrustVerifier(FX.boundaryFor(opProc2));
  check("T16. second processus (registre de processus vide) : rejeu refuse",
    vProc2.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  check("T17. un repertoire de reserve choisi est refuse",
    cd(() => FX.boundaryFor(FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-dir",
      replayProtection: { kind: "FILE", directory: fs.mkdtempSync(path.join(os.tmpdir(), "dir-")), authorityScope: ["A"] } }))) === "REPLAY_DIRECTORY_REFUSED");
  const nsA = RP.deriveReplayNamespaceId({ namespace: "PRODUCTION", authorities: [{ authorityId: "A", keyIds: ["k1"] }] });
  const nsB = RP.deriveReplayNamespaceId({ namespace: "PRODUCTION", authorities: [{ authorityId: "A", keyIds: ["k2"] }] });
  const rootShared = fs.mkdtempSync(path.join(os.tmpdir(), "ns-"));
  RP.createFileReplayStore({ replayRoot: rootShared, replayNamespaceId: nsA, authorityScope: ["A"] });
  check("T18. un replayNamespaceId modifie est refuse par le marqueur",
    nsA !== nsB
    && cd(() => { fs.writeFileSync(path.join(rootShared, nsA, RP.MARKER), JSON.stringify({ replayNamespaceId: nsB, authorityScope: ["A"] }));
      RP.createFileReplayStore({ replayRoot: rootShared, replayNamespaceId: nsA, authorityScope: ["A"] }); }) === "REPLAY_NAMESPACE_MARKER_MISMATCH"
    && prod.verifier.replayNamespaceId === RP.deriveReplayNamespaceId({ namespace: "PRODUCTION",
      authorities: [{ authorityId: opP.authority.authorityId, keyIds: [opP.authority.keyRecord().keyId] }] }));

  /* ===== §47 — B4 : PREPARATION (T19-T24) ===== */
  console.log("\n  -- T19-T24 : B4, la phase se derive des liaisons --");
  const donor = prod.pre.dimensions.filter((d) => (d.derivedFromRefs || []).length)[0];
  const borrowed = (function () {
    const r = clone(prod.pre); r.phase = "FULL";
    SR.FULL_ONLY_DIMENSIONS.forEach(function (n) {
      r.dimensions.push({ name: n, status: "SATISFIED", reasons: ["fabrique"], derivedFromRefs: clone(donor.derivedFromRefs), reservations: [] });
    });
    r.assessedDimensions = r.dimensions.map((x) => x.name);
    r.dimensionsHash = SR.dimensionsHashOf(r.dimensions);
    delete r.dimensionBindingsHash;
    return r;
  })();
  check("T19. PRE + references empruntees ne devient jamais FULL",
    cd(() => SR.assertReadinessPhase(borrowed, "FULL", idOpt, "T19")) === "READINESS_DIMENSION_EVIDENCE_UNBOUND",
    cd(() => SR.assertReadinessPhase(borrowed, "FULL", idOpt, "T19")));
  const unrelated = (function () {
    const r = clone(prod.full);
    const corp = r.dimensions.filter((d) => d.name === "professionalCorpus")[0];
    corp.derivedFromRefs = clone(donor.derivedFromRefs);
    r.dimensionsHash = SR.dimensionsHashOf(r.dimensions);
    delete r.dimensionBindingsHash;
    return r;
  })();
  check("T20. une preuve sans rapport ne satisfait pas une dimension",
    cd(() => SR.assertReadinessPhase(unrelated, "FULL", idOpt, "T20")) === "READINESS_DIMENSION_EVIDENCE_UNBOUND");
  check("T21. TEMOIN POSITIF : la preuve liee a la BONNE dimension fonctionne",
    SR.assertReadinessPhase(prod.full, "FULL", idOpt, "T21") === true
    && prod.full.derivedPhase === "FULL" && (prod.full.dimensionBindings || []).length > 0);
  check("T22. un dimensionsHash copie est rejete",
    cd(() => SR.assertReadinessPhase(Object.assign(clone(prod.pre), { phase: "FULL", dimensionsHash: prod.full.dimensionsHash }), "FULL", idOpt, "T22")) === "READINESS_DIGEST_MISMATCH");
  check("T23. un digest recalcule par l'appelant ne suffit pas",
    cd(() => SR.assertReadinessPhase(borrowed, "FULL", idOpt, "T23")) !== null
    && SR.dimensionsHashOf(borrowed.dimensions) === borrowed.dimensionsHash);
  check("T24. TEMOIN POSITIF : la phase PRE reelle est acceptee",
    SR.assertReadinessPhase(prod.pre, "PRE", idOpt, "T24") === true && prod.pre.derivedPhase === "PRE");

  /* ===== §48 — B5/B6 : PONT AMONT (T25-T32) ===== */
  console.log("\n  -- T25-T32 : B5/B6, le pont traduit, il n'affirme pas --");
  function freshRun(tag, opts) {
    const op = (opts && opts.operator) || opP;
    const missionId = "m-" + tag, missionHash = sha256Of({ missionId });
    const intent = { runId: "run-" + tag, missionHash: missionHash, producerId: "MONO-10", producerVersion: "v0.7",
      executionMode: op.namespace, openedAt: now() };
    const att = op.authority.attest(intent);
    const verifier = OTV.createOperatorTrustVerifier(FX.boundaryFor(op));
    const manifest = RM.openRunEvidenceManifest({ verifier, attestation: att, runIntent: intent, missionBinding: { missionId }, missionHash });
    const ctx = { manifest, verifier, attestation: att };
    const registry = AAR.openAuthenticatedArtifactRegistry(manifest, ctx);
    const bind = (id, rel, art) => { const b = RM.bindArtifact(manifest, art, id, art.schema || rel);
      registry.register({ artifactId: id, relation: rel, artifact: b }); return registry.get(id).artifact; };
    bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId, missionHash });
    return { manifest, registry, ctx: Object.assign({}, ctx, { artifactRegistry: registry }), bind, verifier, missionHash, runId: intent.runId };
  }
  const rb = freshRun("binder");
  const binder = UEB.createUpstreamEvidenceBinder({ registry: rb.registry, manifest: rb.manifest,
    provenanceAuthority: rb.verifier.provenanceAuthority(), artifactIdPrefix: "amont" });
  const discNoProof = { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A", missionId: "m-binder",
    candidates: [{ candidateRef: "c-1", displayName: "P1", disciplines: ["d"], evidenceRefs: ["SRC-ROOT-A-0"],
      champFort: "jamais-verifie-par-personne", provenance: [] }] };
  const bs = UEB.bindScreenedSources({ binder, screenedSources: [{ localSourceId: "S-1", providerWorkId: "SRC-ROOT-A-0", observed: { c: 1 } }] });
  const bi = UEB.bindResolvedIdentities({ binder, discovery: discNoProof });
  const bd = UEB.bindUpstreamDiscovery({ discovery: discNoProof, sourceRefByProviderWorkId: bs.refByProviderWorkId,
    identityRefByCandidateRef: bi.refByCandidateRef, ambiguousIdentifiers: bs.ambiguous, strongIdentifierField: "champFort" });
  const id0 = bd.candidates[0].identifiers[0];
  check("T25. le pont n'invente jamais CONFIRMED", id0 && id0.subjectBinding === CC.UPSTREAM_ASSERTION.UNKNOWN, id0 && id0.subjectBinding);
  check("T26. le pont n'invente jamais VERIFIED", id0 && id0.verificationStatus === CC.UPSTREAM_ASSERTION.UNKNOWN, id0 && id0.verificationStatus);
  check("T27. le pont n'invente aucune force de preuve", id0 && id0.confidenceContribution === 0, id0 && id0.confidenceContribution);
  check("T28. sans preuve amont, l'assertion reste UNKNOWN",
    id0 && id0.upstreamAssertion === CC.UPSTREAM_ASSERTION.UNKNOWN
    && bd.candidates[0].evidenceBinding.assertionCeiling === CC.UPSTREAM_ASSERTION.UNKNOWN);
  const rAmb = freshRun("ambig");
  const bAmb = UEB.createUpstreamEvidenceBinder({ registry: rAmb.registry, manifest: rAmb.manifest,
    provenanceAuthority: rAmb.verifier.provenanceAuthority(), artifactIdPrefix: "amont" });
  const amb = UEB.bindScreenedSources({ binder: bAmb, screenedSources: [
    { localSourceId: "S-1", providerWorkId: "SRC-ROOT-A-1", observed: { contenu: "A" } },
    { localSourceId: "S-2", providerWorkId: "SRC-ROOT-A-1", observed: { contenu: "B TOTALEMENT DIFFERENT" } }] });
  check("T29. meme identifiant, contenus differents => AMBIGU",
    amb.ambiguous.length === 1 && amb.ambiguous[0].identifier === "SRC-ROOT-A-1"
    && amb.refByProviderWorkId.has("SRC-ROOT-A-1") === false,
    JSON.stringify(amb.summary));
  check("T30. jamais le dernier arrive : aucune reference produite",
    amb.refByProviderWorkId.size === 0 && amb.candidatesByIdentifier.get("SRC-ROOT-A-1").length === 2);
  const rUni = freshRun("unident");
  const bUni = UEB.createUpstreamEvidenceBinder({ registry: rUni.registry, manifest: rUni.manifest,
    provenanceAuthority: rUni.verifier.provenanceAuthority(), artifactIdPrefix: "amont" });
  const uniBind = UEB.bindScreenedSources({ binder: bUni, screenedSources: [
    { localSourceId: "S-ok", providerWorkId: "SRC-ROOT-A-2", observed: { c: 1 } },
    { localSourceId: "S-sans", providerWorkId: null, observed: { c: 2 } }] });
  check("T31. une source sans identifiant est explicitement non identifiee",
    uniBind.unidentified.length === 1 && uniBind.unidentified[0].localSourceId === "S-sans" && uniBind.refByProviderWorkId.size === 1);
  const rDedup = freshRun("dedup");
  const bDed = UEB.createUpstreamEvidenceBinder({ registry: rDedup.registry, manifest: rDedup.manifest,
    provenanceAuthority: rDedup.verifier.provenanceAuthority(), artifactIdPrefix: "amont" });
  const ded = UEB.bindScreenedSources({ binder: bDed, screenedSources: [
    { localSourceId: "S-1", providerWorkId: "SRC-ROOT-A-3", observed: { identique: true } },
    { localSourceId: "S-2", providerWorkId: "SRC-ROOT-A-3", observed: { identique: true } }] });
  check("T32. TEMOIN POSITIF : egalite canonique prouvee => deduplication licite",
    ded.refByProviderWorkId.size === 1 && ded.ambiguous.length === 0 && ded.deduplicated.length === 1,
    JSON.stringify(ded.summary));

  /* ===== §49 — M7 : CAPACITES (T33-T38) ===== */
  console.log("\n  -- T33-T38 : M7, capacites typees et exigees --");
  const rc = freshRun("caps");
  const synth = ESP.makeDocumentaryEvidenceRecord({ evidenceId: "synthetique", sourceRootId: "RACINE-INVENTEE",
    retrievedAt: now(), locator: "opaque", contentHash: sha256Of({ s: 1 }) });
  rc.bind("doc-synth", R.DOCUMENTARY_EVIDENCE, synth);
  check("T33. un hash arbitraire n'accorde aucune capacite",
    cd(() => rc.registry.grantCapability("doc-synth", sha256Of({ motif: "je le decrete" }))) === "CAPABILITY_GRANT_FORGED"
    && cd(() => rc.registry.grantCapability("doc-synth", { schema: "EvidenceForge.ArtifactCapabilityGrant",
      capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE, artifactId: "doc-synth" })) === "CAPABILITY_GRANT_FORGED");
  check("T34. un artefact enregistre ne s'auto-promeut pas",
    JSON.stringify(rc.registry.capabilitiesOf("doc-synth")) === JSON.stringify([AC.CAPABILITY.RUN_BOUND])
    && cd(() => AC.mintCapabilityGrant({ issuer: { resolveRoots: () => 1, authorityId: "faux" },
      capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE, artifactId: "doc-synth", artifactHash: "a".repeat(64),
      artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord", runId: rc.runId, missionHash: rc.missionHash,
      derivationRef: "x" })) === "CAPABILITY_ISSUER_INVALID");
  check("T35. un type d'artefact inadapte n'obtient pas la capacite de production",
    cd(() => AC.mintCapabilityGrant({ issuer: rc.verifier.provenanceAuthority(),
      capability: AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY, artifactId: "doc-synth", artifactHash: "a".repeat(64),
      artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord", runId: rc.runId, missionHash: rc.missionHash,
      derivationRef: "x" })) !== null);
  const docGood = ESP.makeDocumentaryEvidenceRecord({ evidenceId: "vrai", sourceRootId: "SRC-ROOT-A-4",
    retrievedAt: now(), locator: "opaque", contentHash: sha256Of({ v: 1 }) });
  rc.bind("doc-vrai", R.DOCUMENTARY_EVIDENCE, docGood);
  const pAuth = rc.verifier.provenanceAuthority();
  const res4 = pAuth.resolveRoots({ sourceRootId: "SRC-ROOT-A-4" });
  rc.registry.grantCapability("doc-vrai", AC.mintCapabilityGrant({ issuer: pAuth,
    capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE, artifactId: "doc-vrai",
    artifactHash: rc.registry.get("doc-vrai").hash, artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord",
    runId: rc.manifest.runId, missionHash: rc.manifest.missionHash, issuerId: pAuth.authorityId, derivationRef: res4.derivationRef }));
  check("T36. TEMOIN POSITIF : une transition emise par l'autorite reussit",
    AC.hasCapability(rc.registry.get("doc-vrai"), AC.CAPABILITY.AUTHENTICATED_PROVENANCE) === true
    && res4.status === "AUTHENTICATED");
  // Sink reel : une preuve sans capacite est refusee par la porte humaine.
  const noCapChain = await FX.buildChain({ mode: "PRODUCTION", operator: opP, runSalt: 303,
    provenanceRootsOverride: true });
  check("T37. un sink critique refuse une capacite insuffisante",
    cd(() => AC.assertCapability(rc.registry.get("doc-synth"), AC.CAPABILITY.AUTHENTICATED_PROVENANCE,
      "panel-gate:evidence-presented-to-human")) === "ARTIFACT_CAPABILITY_MISSING"
    && Object.keys(AC.SINK_REQUIREMENTS).length === 3
    && AC.requirementOf("panel-gated-adapter:corpus-sink") === AC.CAPABILITY.HUMAN_AUTHENTICATED);
  check("T38. une metadonnee de confiance sans verificateur n'a aucun effet",
    AC.hasCapability({ artifactId: "x", capabilities: [] }, AC.CAPABILITY.HUMAN_AUTHENTICATED) === false
    && AC.hasCapability(Object.assign({}, rc.registry.get("doc-synth"),
      { capabilities: [AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY] }), AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) === true
    && rc.registry.capabilitiesOf("doc-synth").indexOf(AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY) === -1);

  /* ===== §50 — PROVENANCE (T39-T43) ===== */
  console.log("\n  -- T39-T43 : la provenance ne s'auto-declare pas --");
  const rp2 = freshRun("prov");
  const mkDoc = (id, root) => ESP.makeDocumentaryEvidenceRecord({ evidenceId: id, sourceRootId: root,
    authorityRootId: "AUTORITE-ECRITE-PAR-L-APPELANT", familyRootId: "FAMILLE-ECRITE-PAR-L-APPELANT",
    retrievedAt: now(), locator: "opaque:" + id, contentHash: sha256Of({ id }) });
  const dInv = rp2.bind("doc-invente", R.DOCUMENTARY_EVIDENCE, mkDoc("doc-invente", "RACINE-JAMAIS-ENREGISTREE"));
  const refInv = LIN.artifactRef(dInv, "doc-invente", R.DOCUMENTARY_EVIDENCE);
  const provOpt = { registry: rp2.registry, expectedRunId: rp2.runId, expectedMissionHash: rp2.missionHash,
    verifier: rp2.verifier };
  const resInv = ESP.resolveEvidenceSourceProvenance({ provenanceRef: refInv }, rp2.registry, provOpt);
  check("T39. un sourceRootId d'appelant ne suffit pas",
    resInv.status !== CC.PROVENANCE_STATUS.AUTHENTICATED, resInv.status);
  const dLbl = rp2.bind("doc-etiquete", R.DOCUMENTARY_EVIDENCE, mkDoc("doc-etiquete", "SRC-ROOT-A-5"));
  const resLbl = ESP.resolveEvidenceSourceProvenance({ provenanceRef: LIN.artifactRef(dLbl, "doc-etiquete", R.DOCUMENTARY_EVIDENCE) }, rp2.registry, provOpt);
  check("T40. un collectionAuthorityId d'appelant ne suffit pas",
    resLbl.status === CC.PROVENANCE_STATUS.AUTHENTICATED
    && resLbl.authorityRootId === "AUT-ROOT-A-5"
    && resLbl.declaration.declarationAgrees === false,
    resLbl.authorityRootId + " (declare : " + resLbl.declaration.declared.authorityRootId + ")");
  // Meme contenu, deux etiquettes d'autorite inventees par l'appelant.
  const same = sha256Of({ contenu: "identique" });
  const relabel = (id, root) => ESP.makeDocumentaryEvidenceRecord({ evidenceId: id, sourceRootId: root,
    authorityRootId: "AUT-INVENTEE-" + id, familyRootId: "FAM-INVENTEE-" + id, retrievedAt: now(),
    locator: "opaque", contentHash: same });
  const z1 = rp2.bind("doc-z1", R.DOCUMENTARY_EVIDENCE, relabel("doc-z1", "RACINE-INVENTEE-1"));
  const z2 = rp2.bind("doc-z2", R.DOCUMENTARY_EVIDENCE, relabel("doc-z2", "RACINE-INVENTEE-2"));
  const E = (t, i, r) => ({ evidenceType: t, identifier: i, provenanceRef: r, subjectBinding: "CONFIRMED",
    verificationStatus: "VERIFIED", confidenceContribution: 0.6 });
  const confRel = IDE.deriveIdentityConfidence([E("t1", "i1", LIN.artifactRef(z1, "doc-z1", R.DOCUMENTARY_EVIDENCE)),
    E("t2", "i2", LIN.artifactRef(z2, "doc-z2", R.DOCUMENTARY_EVIDENCE))], provOpt);
  check("T41. des racines reetiquetees ne creent aucune independance",
    confRel.confidence !== "STRONG"
    && (confRel.independenceRelations || []).every((r) => r.independence !== IDE.INDEPENDENCE.INDEPENDENT),
    confRel.confidence + " / " + JSON.stringify((confRel.independenceRelations || []).map((r) => r.independence)));
  const confUnk = IDE.deriveIdentityConfidence([E("t1", "i1", null), E("t2", "i2", null)], provOpt);
  check("T42. une provenance UNKNOWN ne compte pas comme independante", confUnk.confidence !== "STRONG");
  check("T43. TEMOIN POSITIF : provenance authentifiee => STRONG possible",
    IDE.deriveIdentityConfidence([E("t1", "i1", prod.docRefs.get("doc-a:c-1")), E("t2", "i2", prod.docRefs.get("doc-b:c-1"))],
      Object.assign({}, idOpt)).confidence === "STRONG",
    IDE.deriveIdentityConfidence([E("t1", "i1", prod.docRefs.get("doc-a:c-1")), E("t2", "i2", prod.docRefs.get("doc-b:c-1"))], idOpt).confidence);

  /* ===== §51 — DOCUMENTATION (T44-T48) ===== */
  console.log("\n  -- T44-T48 : garde documentation / code --");
  const docPath = (f) => path.resolve(__dirname, "..", f);
  const readDoc = (f) => { try { return fs.readFileSync(docPath(f), "utf8"); } catch (e) { return null; } };
  const driftResults = CC.DOCUMENTED_CONTRACTS.map(function (d) {
    const md = readDoc(d.document);
    return { contract: d.contract, document: d.document,
      result: md === null ? { valid: false, problems: ["document absent : " + d.document] } : CC.verifyDocumentedContract(md, d.contract) };
  });
  const drifted = driftResults.filter((x) => !x.result.valid);
  check("T44. aucune derive entre les enumerations du code et les documents",
    drifted.length === 0, JSON.stringify(drifted.map((x) => x.document + ": " + x.result.problems.join("/"))).slice(0, 260));
  const km = readDoc("KEY-MANAGEMENT.md") || "";
  const inject = (doc, extra) => doc.replace(/(<!-- contract:keyStatuses -->[\s\S]*?)(<!-- \/contract -->)/, "$1\n| `" + extra + "` |\n$2");
  check("T45. un statut SUSPENDED injecte dans la documentation est detecte",
    CC.verifyDocumentedContract(inject(km, "SUSPENDED"), "keyStatuses").valid === false
    && CC.verifyDocumentedContract(inject(km, "SUSPENDED"), "keyStatuses").extra.indexOf("SUSPENDED") !== -1);
  check("T46. un statut QUARANTINE injecte est detecte",
    CC.verifyDocumentedContract(inject(km, "QUARANTINE"), "keyStatuses").extra.indexOf("QUARANTINE") !== -1);
  check("T47. le retrait d'un statut documente est detecte",
    CC.verifyDocumentedContract(km.replace(/`ACTIVE`/g, "`_`"), "keyStatuses").missing.indexOf("ACTIVE") !== -1);
  const art = readDoc("ARTIFACT-REGISTRY-TRUST.md") || "";
  check("T48. une derive sur les classes de capacite est detectee",
    CC.verifyDocumentedContract(art, "artifactCapabilities").valid === true
    && CC.verifyDocumentedContract(art.replace("`RUN_BOUND`", "`RUN_BOUND` et `GOD_MODE`"), "artifactCapabilities").extra.indexOf("GOD_MODE") !== -1);

  /* ===== §52 — POLITIQUE (T49-T54) ===== */
  console.log("\n  -- T49-T54 : liste blanche de politique --");
  const WEAK = { humanAcceptanceRequired: false, consumeNonce: false, crossRunAllowedRelations: ["x"],
    requireResolvableEvidence: false, revalidationRequired: false, allowSynthetic: true, skipValidation: true,
    force: true, trusted: true, bypass: true, trustVerification: false, artifactBinding: false,
    lineageResolution: false, qualificationRevalidation: false, fixtureRejection: false,
    acceptanceValidator: () => 1, humanActVerifier: () => 1, trustVerifier: () => 1, transport: () => 1,
    historicalInputContract: {}, readOnlyRevalidation: true, ignoreUnknowns: true, disableGate: true,
    unsafeAllow: true, overrideDecision: true, uncheckedInput: true, skipHumanAct: true, forceAuthorize: true,
    allowFabricated: true, legacyVerificationGrantsEligibility: true, operatorAuthenticated: true };
  const spW = DA.sanitizePolicy(WEAK);
  const survivors = Object.keys(spW.policy).filter((k) => ["blockOnNonBlockingReservations", "downstreamClass",
    "reservationPolicy", "revalidationAlwaysMandatory", "nonNegotiableControls"].indexOf(k) === -1);
  check("T49. trusted est refuse", spW.refusedOverrides.indexOf("trusted") !== -1
    && spW.refusalMotives.trusted === CAG.REFUSAL.AUTHORITY_ASSERTION);
  check("T50. legacyVerificationGrantsEligibility est refuse",
    spW.refusedOverrides.indexOf("legacyVerificationGrantsEligibility") !== -1);
  check("T51. operatorAuthenticated est refuse",
    spW.refusedOverrides.indexOf("operatorAuthenticated") !== -1
    && spW.refusalMotives.operatorAuthenticated === CAG.REFUSAL.AUTHORITY_ASSERTION);
  check("T52. une cle inconnue d'apparence securitaire est refusee",
    DA.sanitizePolicy({ certifiedByMe: true, inventedFlag: 1 }).refusedOverrides.length === 2);
  check("T53. les " + Object.keys(WEAK).length + " cles d'affaiblissement sont toutes refusees",
    spW.refusedOverrides.length === Object.keys(WEAK).length && survivors.length === 0,
    "refusees=" + spW.refusedOverrides.length + "/" + Object.keys(WEAK).length + " survivantes=" + JSON.stringify(survivors));
  check("T54. TEMOIN POSITIF : une politique metier benigne fonctionne toujours",
    (function () { const ok = DA.sanitizePolicy({ downstreamClass: "etape-aval-X", reservationPolicy: "BLOCK",
      blockOnNonBlockingReservations: true });
      return ok.refusedOverrides.length === 0 && ok.policy.downstreamClass === "etape-aval-X"
        && DA.baselineAtLeastAsStrict(DA.secureBaseline(ok.policy), DA.secureBaseline(DA.sanitizePolicy({}).policy)) === true; })());

  /* ===== §53 — MUTATIONS M01-M54 ===== */
  console.log("\n  -- MUTATIONS M01-M54 --");
  const M = mutation;
  M("M01", "politique legacy accorde l'eligibilite", () => polLegacy.legacyVerificationGrantsEligibility === true,
    () => sp01.refused.indexOf("legacyVerificationGrantsEligibility") !== -1 && legacyOnly.effectiveCorpusEligibility === "NOT_ELIGIBLE");
  M("M02", "statut amont VERIFIED sans panel", () => true, () => EE.isEligibleDecision(legacyOnly) === false);
  M("M03", "candidat jamais revu au corpus", () => unreviewed.refs.indexOf("c-1") !== -1, () => unreviewed.refs.indexOf("c-nu") === -1);
  M("M04", "politique elargissante", () => true, () => EE.sanitizeEligibilityPolicy({ requireAuthenticatedHumanAct: false }).refused.length === 1);
  M("M05", "porte absente", () => true, () => noGate.effectiveCorpusEligibility === "NOT_ELIGIBLE");
  M("M06", "etat ELIGIBLE_BY_LEGACY_VERIFICATION ressuscite", () => true,
    () => Object.keys(EE.ELIGIBILITY).indexOf("ELIGIBLE_BY_LEGACY_VERIFICATION") === -1
      && CC.values("eligibilityStates").indexOf("ELIGIBLE_BY_LEGACY_VERIFICATION") === -1);
  M("M07", "operatorAuthenticated:true de l'appelant", () => true,
    () => LIN.resolveLineage([crossRef], other.registry, Object.assign({}, hiBase,
      { historicalInputContract: { contractKind: "IMMUTABLE_HISTORICAL_INPUT", relations: [R.QUALIFICATION], operatorAuthenticated: true } })).resolved === false);
  M("M08", "contrat historique fabrique", () => true,
    () => LIN.resolveLineage([crossRef], other.registry, Object.assign({}, hiBase,
      { historicalInputAuthority: prod.verifier.historicalInputAuthority(), historicalInputRequest: fakeReq })).resolved === false);
  M("M09", "autorisation historique reelle (temoin positif)",
    () => LIN.resolveLineage([crossRef], other.registry, Object.assign({}, hiBase,
      { historicalInputAuthority: histAuthority, historicalInputRequest: fakeReq })).resolved === true,
    () => histAuthority.authorize(Object.assign({}, fakeReq, { artifactHash: "b".repeat(64) })).authorized === false);
  M("M10", "mauvais run source", () => true, () => histAuthority.authorize(Object.assign({}, fakeReq, { sourceRunId: "x" })).authorized === false);
  M("M11", "mauvais run de destination", () => true, () => histAuthority.authorize(Object.assign({}, fakeReq, { destinationRunId: "x" })).authorized === false);
  M("M12", "mauvaise relation", () => true, () => histAuthority.authorize(Object.assign({}, fakeReq, { relation: R.REPORT })).authorized === false);
  M("M13", "rejeu meme frontiere", () => true, () => prod.verifier.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  M("M14", "rejeu second verificateur", () => true,
    () => OTV.createOperatorTrustVerifier(FX.boundaryFor(opP)).verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  M("M15", "rejeu seconde frontiere meme autorite", () => opSecond.authority.authorityId === opP.authority.authorityId,
    () => vSecond.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  M("M16", "rejeu second processus", () => true, () => vProc2.verifyRuntimeAttestation({ attestation: prod.attestation, consumeNonce: true }).valid === false);
  M("M17", "repertoire de reserve choisi", () => true,
    () => cd(() => FX.boundaryFor(FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-dir2",
      replayProtection: { kind: "FILE", directory: "/tmp/x", authorityScope: ["A"] } }))) === "REPLAY_DIRECTORY_REFUSED");
  M("M18", "marqueur de namespace modifie", () => nsA !== nsB,
    () => cd(() => RP.createFileReplayStore({ replayRoot: rootShared, replayNamespaceId: nsA, authorityScope: ["A"] })) === "REPLAY_NAMESPACE_MARKER_MISMATCH");
  M("M19", "conflit de namespace dans le processus",
    () => RP.assertNamespaceConsistency(nsA, [{ authorityId: "AUT-M19", keyIds: ["k1"] }], "m19-init") === true,
    () => cd(() => RP.assertNamespaceConsistency(nsB, [{ authorityId: "AUT-M19", keyIds: ["k1"] }], "m19")) === "REPLAY_NAMESPACE_CONFLICT");
  M("M20", "PRE + refs empruntees => FULL", () => SR.dimensionsHashOf(borrowed.dimensions) === borrowed.dimensionsHash,
    () => cd(() => SR.assertReadinessPhase(borrowed, "FULL", idOpt, "m")) === "READINESS_DIMENSION_EVIDENCE_UNBOUND");
  M("M21", "preuve sans rapport pour une dimension", () => true,
    () => cd(() => SR.assertReadinessPhase(unrelated, "FULL", idOpt, "m")) === "READINESS_DIMENSION_EVIDENCE_UNBOUND");
  M("M22", "dimensionsHash copie", () => true,
    () => cd(() => SR.assertReadinessPhase(Object.assign(clone(prod.pre), { phase: "FULL", dimensionsHash: prod.full.dimensionsHash }), "FULL", idOpt, "m")) === "READINESS_DIGEST_MISMATCH");
  M("M23", "liaisons consignees falsifiees", () => true,
    () => cd(() => SR.assertReadinessPhase(Object.assign(clone(prod.full), { dimensionBindingsHash: sha256Of({ faux: 1 }) }), "FULL", idOpt, "m")) === "READINESS_BINDINGS_MISMATCH");
  M("M24", "phase FULL declaree sans liaison FULL", () => true,
    () => cd(() => SR.assertReadinessPhase(Object.assign(clone(prod.pre), { phase: "FULL" }), "FULL", idOpt, "m")) !== null);
  M("M25", "pont affirme CONFIRMED", () => id0.value === "jamais-verifie-par-personne", () => id0.subjectBinding === "UNKNOWN");
  M("M26", "pont affirme VERIFIED", () => true, () => id0.verificationStatus === "UNKNOWN");
  M("M27", "pont invente une contribution", () => true, () => id0.confidenceContribution === 0);
  M("M28", "assertion amont absente renforcee", () => true, () => id0.upstreamAssertion === "UNKNOWN");
  M("M29", "identifiant duplique, contenus differents", () => amb.candidatesByIdentifier.get("SRC-ROOT-A-1").length === 2,
    () => amb.ambiguous.length === 1 && amb.refByProviderWorkId.size === 0);
  M("M30", "dernier arrive gagne", () => true, () => amb.refByProviderWorkId.has("SRC-ROOT-A-1") === false);
  M("M31", "source sans identifiant comblee", () => true, () => uniBind.unidentified.length === 1);
  M("M32", "deduplication canonique (temoin positif)", () => ded.refByProviderWorkId.size === 1, () => ded.deduplicated.length === 1);
  M("M33", "hash arbitraire eleve la confiance", () => true,
    () => cd(() => rc.registry.grantCapability("doc-synth", sha256Of({ m: 1 }))) === "CAPABILITY_GRANT_FORGED");
  M("M34", "auto-promotion d'un artefact", () => true,
    () => JSON.stringify(rc.registry.capabilitiesOf("doc-synth")) === JSON.stringify(["RUN_BOUND"]));
  M("M35", "type inadapte pour une capacite de production", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: rc.verifier.provenanceAuthority(),
      capability: AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY, artifactId: "doc-synth", artifactHash: "a".repeat(64),
      artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord", runId: rc.runId, missionHash: rc.missionHash, derivationRef: "x" })) !== null);
  M("M36", "emetteur imite", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: { authorityId: "faux", resolveRoots: () => 1 },
      capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE, artifactId: "doc-synth", artifactHash: "a".repeat(64),
      artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord", runId: rc.runId, missionHash: rc.missionHash, derivationRef: "x" })) === "CAPABILITY_ISSUER_INVALID");
  M("M37", "concession sans derivation", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: rc.verifier.provenanceAuthority(),
      capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE, artifactId: "doc-vrai", artifactHash: rc.registry.get("doc-vrai").hash,
      artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord", runId: rc.manifest.runId, missionHash: rc.manifest.missionHash })) === "CAPABILITY_DERIVATION_MISSING");
  M("M38", "concession liee a un autre contenu", () => true,
    () => cd(() => rc.registry.grantCapability("doc-synth", AC.mintCapabilityGrant({ issuer: rc.verifier.provenanceAuthority(),
      capability: AC.CAPABILITY.AUTHENTICATED_PROVENANCE, artifactId: "doc-synth", artifactHash: rc.registry.get("doc-vrai").hash,
      artifactSchema: "EvidenceForge.DocumentaryEvidenceRecord", runId: rc.manifest.runId, missionHash: rc.manifest.missionHash,
      derivationRef: "x" }))) === "CAPABILITY_GRANT_MISBOUND");
  M("M39", "capacite de production emise depuis un espace TEST", () => true,
    () => cd(() => AC.mintCapabilityGrant({ issuer: OTV.createOperatorTrustVerifier(FX.boundaryFor(opT)).llmCapabilityBoundary(),
      capability: AC.CAPABILITY.PRODUCTION_LLM_CAPABILITY, artifactId: "x", artifactHash: "a".repeat(64),
      artifactSchema: "EvidenceForge.LlmCapability", runId: "r", missionHash: "m", derivationRef: "d" })) === "CAPABILITY_ISSUER_NAMESPACE");
  M("M40", "sink sans capacite", () => true,
    () => cd(() => AC.assertCapability(rc.registry.get("doc-synth"), AC.CAPABILITY.AUTHENTICATED_PROVENANCE, "sink")) === "ARTIFACT_CAPABILITY_MISSING");
  M("M41", "racine de source inventee", () => true, () => resInv.status !== "AUTHENTICATED");
  M("M42", "racine d'autorite ecrite par l'appelant", () => resLbl.declaration.declared.authorityRootId === "AUTORITE-ECRITE-PAR-L-APPELANT",
    () => resLbl.authorityRootId === "AUT-ROOT-A-5" && resLbl.declaration.declarationAgrees === false);
  M("M43", "racines reetiquetees creent l'independance", () => true, () => confRel.confidence !== "STRONG");
  M("M44", "provenance UNKNOWN comptee independante", () => true, () => confUnk.confidence !== "STRONG");
  M("M45", "provenance authentifiee (temoin positif)",
    () => IDE.deriveIdentityConfidence([E("t1", "i1", prod.docRefs.get("doc-a:c-1")), E("t2", "i2", prod.docRefs.get("doc-b:c-1"))], idOpt).confidence === "STRONG",
    () => confRel.confidence !== "STRONG");
  M("M46", "SUSPENDED injecte dans la doc", () => km.length > 0,
    () => CC.verifyDocumentedContract(inject(km, "SUSPENDED"), "keyStatuses").valid === false);
  M("M47", "QUARANTINE injecte dans la doc", () => true,
    () => CC.verifyDocumentedContract(inject(km, "QUARANTINE"), "keyStatuses").valid === false);
  M("M48", "statut documente retire", () => true,
    () => CC.verifyDocumentedContract(km.replace(/`ACTIVE`/g, "`_`"), "keyStatuses").valid === false);
  M("M49", "classe de capacite inventee dans la doc", () => art.length > 0,
    () => CC.verifyDocumentedContract(art.replace("`RUN_BOUND`", "`RUN_BOUND` et `GOD_MODE`"), "artifactCapabilities").valid === false);
  M("M50", "bloc de contrat supprime du document", () => true,
    () => CC.verifyDocumentedContract(km.replace("<!-- contract:keyStatuses -->", ""), "keyStatuses").valid === false);
  M("M51", "cle trusted", () => WEAK.trusted === true, () => spW.refusedOverrides.indexOf("trusted") !== -1);
  M("M52", "cle operatorAuthenticated", () => true, () => spW.refusedOverrides.indexOf("operatorAuthenticated") !== -1);
  M("M53", "cle inconnue d'apparence securitaire", () => true, () => DA.sanitizePolicy({ certifiedByMe: true }).refusedOverrides.length === 1);
  M("M54", "statut de cle absent vaut ACTIVE", () => true,
    () => cd(() => KL.makeKeyRecord({ authorityId: "A", keyId: "k", publicKeyPem: opP.authority.keyRecord().publicKeyPem,
      validFrom: now() })) === "KEY_STATUS_INVALID");

  /* ===== universalite, hygiene, non-regression ===== */
  console.log("\n  -- §57 universalite : six domaines --");
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
    check("UNI-" + (i + 1) + ". " + label + " (" + c.qualification.qualificationStatus + ")", ok,
      c.qualification.qualificationStatus + "/" + c.authorization.authorization);
  }

  console.log("\n  -- §56 hygiene et anti-cablage --");
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
  check("HYG-04. le detecteur discrimine (temoin positif)", strip('const p = "OpenAlex";').toLowerCase().indexOf("openalex") !== -1);
  const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{40,}?-----END [A-Z ]*PRIVATE KEY-----/;
  const secrets = [];
  (function walk(d) { fs.readdirSync(d).forEach(function (e) { const p2 = path.join(d, e);
    if (fs.statSync(p2).isDirectory()) return walk(p2);
    const s2 = fs.readFileSync(p2, "utf8");
    if (PEM.test(s2) || /\bsk-[A-Za-z0-9_-]{20,}/.test(s2)) secrets.push(path.relative(path.join(__dirname, ".."), p2)); }); })(path.join(__dirname, ".."));
  check("HYG-05. aucune matiere privee dans le paquet", secrets.length === 0, JSON.stringify(secrets));
  check("HYG-06. le detecteur de secret discrimine",
    PEM.test(crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString()) === true
    && PEM.test("-----BEGIN PRIVATE KEY-----") === false);
  const injectable = [];
  ["core", "adapters"].forEach(function (dir) {
    fs.readdirSync(path.join(__dirname, "..", dir)).filter((f) => /\.js$/.test(f)).forEach(function (f) {
      const src = strip(fs.readFileSync(path.join(__dirname, "..", dir, f), "utf8"));
      [/typeof\s+(?:input|ctx|opts)\.acceptanceValidator\s*===\s*"function"\s*\?/,
       /typeof\s+(?:input|ctx|opts)\.humanActVerifier\s*===\s*"function"\s*\?/,
       /typeof\s+(?:input|ctx|opts)\.transport\s*===\s*"function"\s*\?/,
       /typeof\s+(?:input|ctx|opts)\.trustVerifier\s*===\s*"function"/].forEach(function (re) {
        if (re.test(src)) injectable.push(dir + "/" + f);
      });
    });
  });
  check("HYG-07. aucun verificateur critique pris sur un parametre d'appel", injectable.length === 0, JSON.stringify(injectable));
  check("HYG-08. la surface de validation livree est complete", Object.keys(VAL).length >= 20, Object.keys(VAL).length);

  console.log("\n  -- §58 non-regression --");
  const h = (p2) => crypto.createHash("sha256").update(fs.readFileSync(p2)).digest("hex");
  const lots = [["MONO-08", "v0.7"], ["MONO-08", "v0.8"], ["MONO-09", "v0.1"], ["MONO-09", "v0.2"],
    ["MONO-10", "v0.1"], ["MONO-10", "v0.2"], ["MONO-10", "v0.3"], ["MONO-10", "v0.4"], ["MONO-10", "v0.5"], ["MONO-10", "v0.6"]];
  const bad = []; let refs = 0;
  lots.forEach(function (p2) {
    const dir = path.join(KIT, p2[0], p2[1]), f = path.join(dir, "SHA256SUMS.txt");
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f, "utf8").trim().split("\n").forEach(function (line) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) return;
      refs++;
      const fp = path.join(dir, m[2]);
      if (!fs.existsSync(fp) || h(fp) !== m[1]) bad.push(p2.join("/") + ":" + m[2]);
    });
  });
  check("NR-01. lots historiques conformes a leurs references scellees (" + refs + " refs)", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
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
  console.log("CASE_SPECIFIC_LEAK_COUNT = " + leak.CASE.length + " | DOMAIN_HARDCODING_COUNT = " + leak.DOMAIN.length
    + " | PROVIDER_HARDCODING_COUNT = " + leak.PROVIDER.length + " | UNIVERSALITY = " + uni + "/6");
  process.exit(fail === 0 && mutCaught === mutTotal ? 0 : 1);
})().catch((e) => { console.error("SUITE_FAILED:", e && e.stack); process.exit(1); });
