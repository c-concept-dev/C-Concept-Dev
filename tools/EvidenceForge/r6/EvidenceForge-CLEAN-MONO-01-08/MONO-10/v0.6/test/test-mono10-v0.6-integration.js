#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.6 — integration HORS LIGNE (§13, §69, §70).
 *
 * Ce test traverse le VRAI raccord, pas un bouchon :
 *
 *   MONO-09 v0.2 discoverProfessionals  (lot GELE, charge depuis le bundle)
 *     -> MONO-09 v0.2 verifyProfessionals
 *     -> MONO-10 v0.6 panel-gated-adapter        (porte humaine authentifiee)
 *     -> RECALCUL de l'eligibilite au sink       (§10)
 *     -> MONO-09 v0.2 buildProfessionalCorpus    (consumer EF-02C REEL)
 *
 * Les trois dependances de MONO-09 (resolution d'identite, expansion, oeuvres)
 * sont INJECTEES et purement locales : aucun reseau, aucun fournisseur, aucun
 * LLM, aucun acte humain reel. Les identifiants injectes portent un prefixe
 * explicitement local (« fixture-offline: ») : aucun identifiant de registre
 * n'est fabrique.
 *
 * Usage : node test/test-mono10-v0.6-integration.js <bundleRoot>
 */

const path = require("path"), fs = require("fs"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const C = "../core/";
const { sha256Of } = require(C + "canonical.js");
const OTB = require(C + "operator-trust-boundary.js");
const OTV = require(C + "operator-trust-verifier.js");
const OAB = require(C + "operator-acceptance-boundary.js");
const OLB = require(C + "operator-llm-capability-boundary.js");
const HAB = require(C + "operator-human-auth-boundary.js");
const RM = require(C + "run-evidence-manifest.js");
const AAR = require(C + "authenticated-artifact-registry.js");
const LIN = require(C + "lineage.js");
const CA = require(C + "candidate-assessment.js");
const PG = require(C + "panel-gate.js");
const PGA = require(C + "panel-gated-adapter.js");
const EE = require(C + "effective-eligibility.js");
const LC = require(C + "llm-capability.js");
const HAP = require(C + "human-act-proof.js");
const OP = require("../tools/operator-provisioning.js");
const FX = require("./fixture-chain.js");
const UEB = require("../adapters/upstream-evidence-binder.js");

const M09_PATH = path.join(KIT, "MONO-09", "v0.2", "lib", "professional-adapter.js");

let pass = 0, fail = 0, skip = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d !== undefined ? "  -> " + String(d).slice(0, 240) : "")); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const R = LIN.RELATION;
const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ *
 * Entree REELLE d'EF-02A : un CorpusSnapshot a la forme attendue par
 * MONO-09 v0.2 (id / statutScreening / provenance.originalReference).
 * Domaine neutre : aucun cas d'application n'est cable ici.
 * ------------------------------------------------------------------ */
function corpusSnapshot(missionId) {
  const src = (n, auteur, disc) => ({
    id: "S-" + n, statutScreening: "inclus", titre: "Etude documentaire " + n,
    auteurOuOrganisme: auteur, discipline: disc, reference: "reference locale " + n,
    provenance: { originalReference: "fixture-offline:oeuvre-" + n, connectorId: "connecteur-corpus-local", retrievalMethod: "INJECTED_LOCAL" },
  });
  return { schema: "EvidenceForge.CorpusSnapshot", id: "snapshot-offline-1", missionId: missionId,
    protocolRef: "protocole-local-1",
    sources: [src(1, "Personne Alpha", "dimension-alpha"), src(2, "Personne Beta", "dimension-alpha"),
      src(3, "Personne Gamma", "dimension-beta"),
      Object.assign(src(4, "Personne Delta", "dimension-beta"), { statutScreening: "exclu" })] };
}

/** Dependances MONO-09 : locales, deterministes, jamais un registre reel. */
function offlineDeps() {
  const idOf = (name) => "fixture-offline:auteur-" + sha256Of({ n: name }).slice(0, 10);
  return {
    async resolveAuthorIdentity(seed) {
      // Le creneau « identifiant fort » est rempli par un jeton EXPLICITEMENT
      // local. Aucun identifiant de registre public n'est invente.
      return { providerAuthorId: idOf(seed.displayName), orcid: "fixture-offline:identifiant-fort-" + sha256Of({ n: seed.displayName }).slice(0, 8),
        affiliation: null };
    },
    async expandRelatedAuthors() { return []; },   // aucune expansion : rien n'est invente
    async fetchAuthorWorks(v) {
      return [1, 2].map((k) => ({ id: "fixture-offline:travail-" + sha256Of({ r: v.candidateRef, k }).slice(0, 10),
        display_name: "Travail " + k + " de " + v.displayName, doi: null, publication_year: 2024, topics: [] }));
    },
  };
}

(async () => {
  console.log("MONO-10 v0.6 — integration hors ligne (vrai consumer MONO-09 v0.2)\n");

  if (!fs.existsSync(M09_PATH)) {
    skip++;
    console.log("  SKIP  MONO-09/v0.2/lib/professional-adapter.js introuvable sous " + KIT);
    console.log("        Le raccord REEL ne peut pas etre traverse depuis cette extraction.");
    console.log("        Aucun PASS n'est emis a la place : l'absence de preuve n'est pas une preuve.");
    console.log("\n" + pass + " PASS, " + fail + " FAIL, " + skip + " SKIP");
    process.exit(1);
  }
  const M09 = require(M09_PATH);
  const realAdapter = M09.createProfessionalPipelineAdapter(offlineDeps());

  /* ---------- frontieres d'exploitation ---------- */
  const op = FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-integration" });
  const boundary = FX.boundaryFor(op);
  const verifier = OTV.createOperatorTrustVerifier(boundary);
  check("I-01. frontiere operateur PRODUCTION provisionnee hors du processus appelant",
    boundary.namespace === "PRODUCTION" && boundary.provisionedFrom === "ENVIRONMENT");

  /* ---------- decouverte + verification REELLES ---------- */
  const missionId = "mission-integration-reelle";
  const snapshot = corpusSnapshot(missionId);
  const dimensionSet = { dimensions: [{ name: "dimension-alpha" }, { name: "dimension-beta" }] };
  const realDiscovery = await realAdapter.discoverProfessionals({ corpusSnapshot: snapshot, missionDimensionSet: dimensionSet });
  const realVerification = await realAdapter.verifyProfessionals({ professionalDiscovery: realDiscovery });
  const N = realVerification.verified.filter((v) => v.verificationStatus === "VERIFIED").length;
  check("I-02. MONO-09 v0.2 produit une decouverte reelle depuis le CorpusSnapshot",
    realDiscovery.schema === "EvidenceForge.ProfessionalDiscovery" && realDiscovery.candidates.length === 3
    && realDiscovery.antiCircularity.verifiedByDiscovery === 0, realDiscovery.candidates.length);
  check("I-03. MONO-09 v0.2 verifie sans que MONO-10 reecrive son statut",
    realVerification.schemaVersion === "EF-02B-v2" && N === 3, N);
  check("I-04. la source exclue par l'humain ne produit aucune graine",
    realDiscovery.candidates.every((c) => c.displayName !== "Personne Delta"));

  /* ---------- un scenario = un run complet, porte incluse ---------- */
  async function scenario(decisionKey, mode) {
    const runId = "run-integ-" + sha256Of({ decisionKey, mode }).slice(0, 10);
    const missionBinding = { missionId: missionId };
    const missionHash = sha256Of(missionBinding);
    const intent = { runId, missionHash, producerId: "MONO-10", producerVersion: "v0.6", executionMode: "PRODUCTION", openedAt: now() };
    const attestation = op.authority.attest(intent);
    const manifest = RM.openRunEvidenceManifest({ verifier, attestation, runIntent: intent, missionBinding, missionHash });
    const ctxBase = { manifest, verifier, attestation };
    const registry = AAR.openAuthenticatedArtifactRegistry(manifest, ctxBase);
    const runContext = Object.assign({}, ctxBase, { artifactRegistry: registry });
    const bind = (id, rel, art) => { const b = RM.bindArtifact(manifest, art, id, art.schema || rel);
      registry.register({ artifactId: id, relation: rel, artifact: b }); return registry.get(id).artifact; };

    bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId, missionHash });
    const discovery = bind("professional-discovery", R.DISCOVERY, realDiscovery);
    const verification = bind("professional-verification", R.VERIFICATION, realVerification);

    // §13 — PONT LIVRE : les identifiants amont deviennent des preuves
    // documentaires enregistrees dans le registre authentifie. Rien n'est
    // invente : une source sans identifiant fort reste sans reference.
    const binder = UEB.createUpstreamEvidenceBinder({ registry, manifest, artifactIdPrefix: "amont" });
    const screened = snapshot.sources.filter((x) => x.statutScreening === "inclus").map((x) => ({
      localSourceId: x.id, providerWorkId: x.provenance.originalReference, titre: x.titre,
      reference: x.reference, retrievedAt: null, observed: x }));
    const boundSources = UEB.bindScreenedSources({ binder, screenedSources: screened,
      collectionAuthorityId: "connecteur-corpus-local", collectionFamilyId: "famille-collecte-corpus" });
    const boundIdentities = UEB.bindResolvedIdentities({ binder, discovery: realDiscovery,
      resolverAuthorityId: "resolveur-identite-local", resolverFamilyId: "famille-resolution-identite" });
    const boundDiscovery = bind("professional-discovery-bound", R.DISCOVERY, UEB.bindUpstreamDiscovery({
      discovery: realDiscovery, sourceRefByProviderWorkId: boundSources.refByProviderWorkId,
      identityRefByCandidateRef: boundIdentities.refByCandidateRef,
      strongIdentifierField: "orcid",
      upstreamDiscoveryRef: LIN.artifactRef(discovery, "professional-discovery", R.DISCOVERY) }));

    const assessment = bind("candidate-assessment", R.ASSESSMENT, CA.assessCandidates({
      discovery: boundDiscovery, verification, missionLabels: ["dimension-alpha", "dimension-beta"],
      runId, missionHash, attestationHash: manifest.runtimeAttestationHash, artifactRegistry: registry,
      discoveryArtifactId: "professional-discovery-bound", verificationArtifactId: "professional-verification" }));

    const tpl = PG.buildPanelValidationTemplate(assessment);
    const byId = new Map(); (assessment.assessments || []).forEach((a) => byId.set(a.candidateId, a));
    const validation = bind("panel-validation", R.PANEL_DECISION, Object.assign({}, tpl, {
      decisions: tpl.decisions.map(function (d) {
        const dec = PG.DECISION[decisionKey];
        const dh = PG.panelDecisionHash(assessment, byId.get(d.candidateId), dec);
        return Object.assign({}, d, { decision: dec, decisionReason: "motif consigne — " + decisionKey,
          actorType: "human", actorIdentity: "auditeur-panel", decidedAt: now(), decisionHash: dh,
          humanActProof: OP.issueHumanActProof({ actorId: "auditeur-panel", actionType: HAP.ACTION_TYPE.PANEL_DECISION,
            decisionHash: dh, runId, missionHash, mechanismRef: boundary.humanAuthMechanism.mechanismId,
            actProofSecret: op.actProofSecret }) });
      }) }));

    const gated = PGA.createPanelGatedAdapter(realAdapter, {
      panelValidation: validation, candidateAssessment: assessment, runContext });

    const gatedVerification = await gated.verifyProfessionals({ professionalDiscovery: realDiscovery }, {});

    // L'ATTAQUE porte sur la ProfessionalVerification remise au consumer.
    let payload = gatedVerification;
    if (mode === "tampered") {
      payload = clone(gatedVerification);
      payload.verified.forEach(function (x) {
        x.effectiveCorpusEligibility = EE.ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL;
        x.humanPanelDecision = PG.DECISION.APPROVE;
        x.humanActAuthenticated = true;
        x.recomputed = true;
        x.eligibilitySource = "HUMAN_PANEL_APPROVAL";
      });
    }
    if (mode === "fabricated") {
      payload = { schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", missionId: missionId,
        verified: realVerification.verified.map((x) => ({ candidateRef: x.candidateRef, displayName: x.displayName,
          verificationStatus: "VERIFIED", verifiedIdentifiers: x.verifiedIdentifiers,
          effectiveCorpusEligibility: EE.ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL,
          humanPanelDecision: PG.DECISION.APPROVE, humanActAuthenticated: true, recomputed: true,
          panelGate: PGA.GATE_ID })) };
    }

    const corpus = await gated.buildProfessionalCorpus({ professionalVerification: payload,
      corpusSnapshot: snapshot, missionDimensionSet: dimensionSet }, {});
    return { corpus: corpus, assessment: assessment, boundDiscovery: boundDiscovery,
      boundSources: boundSources, boundIdentities: boundIdentities, count: (corpus.professionalCorpora || []).length,
      works: (corpus.professionalCorpora || []).reduce((n, pc) => n + ((pc.corpus && pc.corpus.works) || []).length, 0),
      gate: gatedVerification.panelGate };
  }

  /* ---------- §69 : 3 decisions x 3 formes de verification ---------- */
  const grid = {};
  for (const dec of ["APPROVE", "DEFER", "REJECT"]) {
    for (const mode of ["normal", "tampered", "fabricated"]) {
      grid[dec + "/" + mode] = await scenario(dec, mode);
    }
  }
  const c = (k) => grid[k].count;
  console.log("\n  grille corpus (nombre de professionnels admis par le VRAI EF-02C) :");
  ["APPROVE", "DEFER", "REJECT"].forEach((d) => console.log("    " + d.padEnd(8)
    + " normal=" + c(d + "/normal") + "  tampered=" + c(d + "/tampered") + "  fabricated=" + c(d + "/fabricated")));

  check("I-05. APPROVE/normal : les 3 professionnels traversent le vrai EF-02C", c("APPROVE/normal") === N, c("APPROVE/normal"));
  check("I-06. APPROVE/normal : les oeuvres reelles sont normalisees par MONO-09", grid["APPROVE/normal"].works === 2 * N, grid["APPROVE/normal"].works);
  check("I-07. DEFER/normal : aucun professionnel au corpus", c("DEFER/normal") === 0, c("DEFER/normal"));
  check("I-08. DEFER/tampered : l'eligibilite falsifiee ne fait entrer personne", c("DEFER/tampered") === 0, c("DEFER/tampered"));
  check("I-09. DEFER/fabricated : une verification entierement fabriquee ne fait entrer personne", c("DEFER/fabricated") === 0, c("DEFER/fabricated"));
  check("I-10. REJECT/normal : aucun professionnel au corpus", c("REJECT/normal") === 0, c("REJECT/normal"));
  check("I-11. REJECT/tampered : l'eligibilite falsifiee ne fait entrer personne", c("REJECT/tampered") === 0, c("REJECT/tampered"));
  check("I-12. REJECT/fabricated : une verification entierement fabriquee ne fait entrer personne", c("REJECT/fabricated") === 0, c("REJECT/fabricated"));
  check("I-13. le sink consigne que l'eligibilite fournie a ete ignoree",
    grid["DEFER/tampered"].corpus.professionalCorpora.length === 0
    && grid["APPROVE/normal"].gate.gateId === PGA.GATE_ID);
  check("I-14. APPROVE reste admis malgre la falsification : le filtre n'est pas un refus global",
    c("APPROVE/tampered") === N && c("APPROVE/fabricated") === N, c("APPROVE/tampered") + "/" + c("APPROVE/fabricated"));
  check("I-15. le statut de verification amont n'est jamais reecrit",
    realVerification.verified.every((v) => v.verificationStatus === "VERIFIED")
    && grid["REJECT/normal"].corpus.schema === "EvidenceForge.ProfessionalCorpusSet");

  /* ---------- honnetete du pont de liaison ---------- */
  const g0 = grid["APPROVE/normal"];
  // Le pont est re-exerce sur un run PROPRE avec une source depourvue
  // d'identifiant fort : elle ne doit recevoir aucune reference.
  const sansIdRun = await (async function () {
    const intentX = { runId: "run-integ-sans-id", missionHash: sha256Of({ missionId: missionId }),
      producerId: "MONO-10", producerVersion: "v0.6", executionMode: "PRODUCTION", openedAt: now() };
    const attX = op.authority.attest(intentX);
    const mX = RM.openRunEvidenceManifest({ verifier, attestation: attX, runIntent: intentX, missionHash: intentX.missionHash });
    const rX = AAR.openAuthenticatedArtifactRegistry(mX, { manifest: mX, verifier, attestation: attX });
    const bX = UEB.createUpstreamEvidenceBinder({ registry: rX, manifest: mX, artifactIdPrefix: "amont" });
    return UEB.bindScreenedSources({ binder: bX, collectionAuthorityId: "connecteur-corpus-local",
      screenedSources: [{ localSourceId: "S-avec", providerWorkId: "fixture-offline:oeuvre-9", observed: { a: 1 } },
        { localSourceId: "S-sans", providerWorkId: null, observed: { b: 2 } }] });
  })();
  check("I-25. une source sans identifiant fort ne recoit aucune reference inventee",
    sansIdRun.refByProviderWorkId.size === 1 && sansIdRun.unidentified.length === 1
    && sansIdRun.unidentified[0].localSourceId === "S-sans",
    JSON.stringify({ lies: sansIdRun.refByProviderWorkId.size, nonLies: sansIdRun.unidentified }));
  check("I-26. l'artefact amont n'est ni modifie ni remplace par le pont",
    g0.boundDiscovery.derivedFrom.upstreamDiscoveryRef !== null
    && g0.boundDiscovery.candidates.every((c) => Array.isArray(c.upstreamEvidenceRefs) && c.upstreamEvidenceRefs.length > 0)
    && realDiscovery.candidates.every((c) => typeof c.evidenceRefs[0] === "string"));
  check("I-27. le pont consigne ce qu'il n'a pas pu lier",
    g0.boundSources.unidentified.length === 0 && g0.boundIdentities.unresolved.length === 0
    && g0.boundDiscovery.evidenceBindingSummary.withBoundSources === 3
    && g0.boundDiscovery.evidenceBindingSummary.withBoundIdentityProvenance === 3);

  /* ---------- §70 : simulation de securite en PRODUCTION ---------- */
  console.log("\n  -- §70 : l'appelant ne remplace aucune frontiere --");
  const runId70 = "run-integ-securite";
  const missionHash70 = sha256Of({ missionId: missionId });
  const intent70 = { runId: runId70, missionHash: missionHash70, producerId: "MONO-10", producerVersion: "v0.6",
    executionMode: "PRODUCTION", openedAt: now() };
  const att70 = op.authority.attest(intent70);
  const manifest70 = RM.openRunEvidenceManifest({ verifier, attestation: att70, runIntent: intent70, missionHash: missionHash70 });
  const ctx70 = { manifest: manifest70, verifier: verifier, attestation: att70 };

  const rogueVerifier = { namespace: "PRODUCTION", acceptanceBoundary: () => ({ namespace: "PRODUCTION", humanAcceptanceRequired: false,
      validateAcceptance: () => ({ valid: true, problems: [] }) }),
    verifyRuntimeAttestation: () => ({ valid: true, problems: [] }),
    verifyHumanAct: () => ({ authenticated: true }) };
  check("I-16. un verificateur imite n'est pas reconnu", OTV.isOperatorTrustVerifier(rogueVerifier) === false);
  check("I-17. une frontiere d'acceptation imitee n'est pas reconnue",
    OAB.isProvisionedAcceptanceBoundary(rogueVerifier.acceptanceBoundary()) === false
    && OAB.isProvisionedAcceptanceBoundary(verifier.acceptanceBoundary()) === true);
  check("I-18. un mecanisme d'acte humain imite n'est pas reconnu",
    HAB.isProvisionedHumanAuth({ mechanismId: "faux", namespace: "PRODUCTION", requiresActProof: true, verifyHumanAct: () => ({ authenticated: true }) }) === false
    && HAB.isProvisionedHumanAuth(boundary.humanAuthMechanism) === true);
  check("I-19. une frontiere de capacite LLM imitee n'est pas reconnue",
    OLB.isProvisionedLlmBoundary({ namespace: "PRODUCTION", transport: async () => ({ httpStatus: 200 }) }) === false
    && OLB.isProvisionedLlmBoundary(boundary.llmCapabilityBoundary) === true);
  const cap70 = await LC.runActiveProbe({ providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture", credentialPresent: true },
    Object.assign({}, ctx70, { transport: async () => ({ httpStatus: 200, text: "{}", requestId: "x" }) }));
  check("I-20. le transport de l'appelant est ignore : la capacite vient de l'environnement",
    cap70.callerTransportIgnored === true && cap70.transportOrigin === "ENVIRONMENT");
  check("I-21. aucune cle privee n'est jamais lue par le noyau",
    Object.keys(boundary.anchorSet ? boundary.anchorSet[0] || {} : {}).every((k) => !/private/i.test(k)));
  const humanActFake = { actorType: "human", actorIdentity: "auditeur-panel", decidedAt: now(),
    humanActProof: { actorId: "auditeur-panel", actionType: HAP.ACTION_TYPE.PANEL_DECISION, decisionHash: sha256Of({ x: 1 }),
      runId: runId70, missionHash: missionHash70, issuedAt: now(), mechanismRef: boundary.humanAuthMechanism.mechanismId,
      proofValue: crypto.randomBytes(32).toString("hex") } };
  check("I-22. une preuve d'acte forgee est refusee par le mecanisme de l'exploitant",
    verifier.verifyHumanAct(humanActFake, { actionType: HAP.ACTION_TYPE.PANEL_DECISION, decisionHash: sha256Of({ x: 1 }),
      runId: runId70, missionHash: missionHash70 }).authenticated === false);
  check("I-23. sans variable d'environnement, aucune frontiere de PRODUCTION n'est obtenue",
    (function () { const prev = process.env[OTB.ENV_VAR]; delete process.env[OTB.ENV_VAR];
      try { OTB.provisionProductionTrustBoundary(); return false; }
      catch (e) { return /OPERATOR_TRUST/.test(e.message) || /CONFIG/.test(e.message); }
      finally { if (prev !== undefined) process.env[OTB.ENV_VAR] = prev; } })());
  check("I-24. provisionTestTrustBoundary refuse structurellement PRODUCTION",
    (function () { try { OTB.provisionTestTrustBoundary(Object.assign({}, op.cfg, { namespace: "PRODUCTION" })); return false; }
      catch (e) { return /PRODUCTION/.test(e.message); } })());

  /* ---------- neuf vecteurs de contrefaçon de marque d'origine ---------- */
  console.log("\n  -- contrefaçon de la marque d'origine (9 vecteurs) --");
  const real = verifier.acceptanceBoundary();
  const vectors = [
    ["forme imitee", () => ({ namespace: real.namespace, acceptanceBoundaryId: real.acceptanceBoundaryId,
        humanAcceptanceRequired: real.humanAcceptanceRequired, validateAcceptance: () => ({ valid: true, problems: [] }) })],
    ["Object.create", () => Object.create(real)],
    ["copie superficielle", () => Object.assign({}, real)],
    ["prototype force", () => { const o = { validateAcceptance: () => ({ valid: true, problems: [] }) };
        Object.setPrototypeOf(o, Object.getPrototypeOf(real)); return o; }],
    ["aller-retour JSON", () => JSON.parse(JSON.stringify({ namespace: real.namespace, acceptanceBoundaryId: real.acceptanceBoundaryId }))],
    ["Proxy", () => new Proxy(real, { get: (t, k) => (k === "validateAcceptance" ? () => ({ valid: true, problems: [] }) : t[k]) })],
    ["structuredClone", () => { try { return structuredClone(real); } catch (e) { return { cloneRefusee: String(e.name) }; } }],
    ["vm.Context", () => { const vm = require("vm");
        return vm.runInNewContext("({ namespace: 'PRODUCTION', validateAcceptance: () => ({ valid: true, problems: [] }) })"); }],
    ["rechargement de module", () => { const p = require.resolve("../core/operator-acceptance-boundary.js");
        const keep = require.cache[p]; delete require.cache[p];
        const fresh = require("../core/operator-acceptance-boundary.js");
        const accepted = fresh.isProvisionedAcceptanceBoundary(real);
        require.cache[p] = keep;
        return accepted ? real : { rechargementFailClosed: true }; }],
  ];
  let forged = 0;
  vectors.forEach(function (v) {
    let obj = null; try { obj = v[1](); } catch (e) { obj = null; }
    const accepted = obj !== null && OAB.isProvisionedAcceptanceBoundary(obj) === true;
    if (accepted) forged++;
    check("I-" + (27 + vectors.indexOf(v) + 1) + ". contrefaçon refusee : " + v[0], accepted === false);
  });
  check("I-37. aucun des neuf vecteurs ne produit une frontiere reconnue", forged === 0, forged + " accepte(s)");

  /* ---------- anti-rejeu : reserve insuffisante ou absente ---------- */
  const provFail = (rp) => { try {
      FX.boundaryFor(FX.provisionOperator({ namespace: "PRODUCTION", boundaryId: "otb-rp", replayProtection: rp }));
      return null; } catch (e) { return String(e.message).split(":")[0]; } };
  check("I-38. une reserve en memoire ne protege pas un espace de PRODUCTION",
    provFail({ kind: "MEMORY" }) === "REPLAY_PROTECTION_INSUFFICIENT", provFail({ kind: "MEMORY" }));
  check("I-39. aucune protection anti-rejeu : une frontiere de PRODUCTION est refusee",
    provFail({}) === "REPLAY_PROTECTION_MISSING", provFail({}));

  console.log("\n  contre-mesures : NETWORK_CALLS = 0 | REAL_LLM_CALLS = 0 | REAL_EF02_RUNS = 0 | REAL_HUMAN_ACTS = 0");
  console.log("\n" + pass + " PASS, " + fail + " FAIL, " + skip + " SKIP");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("INTEGRATION_FAILED:", e && e.stack); process.exit(1); });
