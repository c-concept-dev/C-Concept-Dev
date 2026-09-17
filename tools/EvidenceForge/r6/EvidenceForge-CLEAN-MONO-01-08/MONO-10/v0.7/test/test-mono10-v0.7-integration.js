#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.7 — integration HORS LIGNE (§42, §43, §54, §55).
 *
 * Traverse le VRAI raccord, en mode TEST uniquement (§54) :
 *
 *   MONO-09 v0.2 discoverProfessionals   (lot GELE)
 *     -> upstream-evidence-binder        (traducteur, §17-§25)
 *     -> registre d'artefacts authentifie
 *     -> EvidenceProvenanceAuthority     (§32 : racines authentifiees)
 *     -> assessCandidates
 *     -> presentation au panel
 *     -> acte humain + capacite HUMAN_AUTHENTICATED
 *     -> recalcul de l'eligibilite au sink
 *     -> MONO-09 v0.2 buildProfessionalCorpus  (consumer EF-02C REEL)
 *     -> readiness -> capacite LLM -> qualification -> rapport
 *     -> acceptation -> autorisation aval
 *
 * Aucun reseau, aucun LLM reel, aucun run EF-02, aucun acte humain reel.
 * Les identifiants injectes portent un prefixe explicitement local.
 *
 * Usage : node test/test-mono10-v0.7-integration.js <bundleRoot>
 */

const path = require("path"), fs = require("fs"), crypto = require("crypto");
const KIT = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT || path.resolve(__dirname, "..", "..", "..");
const C = "../core/";
const { sha256Of } = require(C + "canonical.js");
const CC = require(C + "canonical-contracts.js");
const AC = require(C + "artifact-capabilities.js");
const OTB = require(C + "operator-trust-boundary.js");
const OTV = require(C + "operator-trust-verifier.js");
const OAB = require(C + "operator-acceptance-boundary.js");
const OLB = require(C + "operator-llm-capability-boundary.js");
const HAB = require(C + "operator-human-auth-boundary.js");
const OPA = require(C + "operator-provenance-authority.js");
const RM = require(C + "run-evidence-manifest.js");
const AAR = require(C + "authenticated-artifact-registry.js");
const RP = require(C + "replay-protection.js");
const LIN = require(C + "lineage.js");
const CA = require(C + "candidate-assessment.js");
const PG = require(C + "panel-gate.js");
const PGA = require(C + "panel-gated-adapter.js");
const EE = require(C + "effective-eligibility.js");
const LC = require(C + "llm-capability.js");
const HAP = require(C + "human-act-proof.js");
const OP = require("../tools/operator-provisioning.js");
const UEB = require("../adapters/upstream-evidence-binder.js");
const FX = require("./fixture-chain.js");

const M09_PATH = path.join(KIT, "MONO-09", "v0.2", "lib", "professional-adapter.js");
let pass = 0, fail = 0, skip = 0;
const check = (id, cond, d) => { if (cond) { pass++; console.log("  PASS  " + id); } else { fail++; console.log("  FAIL  " + id + (d !== undefined ? "  -> " + String(d).slice(0, 240) : "")); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const R = LIN.RELATION, now = () => new Date().toISOString();

/** Entree REELLE d'EF-02A. Domaine neutre : aucun cas d'application cable. */
function corpusSnapshot(missionId) {
  const src = (n, auteur, disc) => ({
    id: "S-" + n, statutScreening: "inclus", titre: "Etude documentaire " + n,
    auteurOuOrganisme: auteur, discipline: disc, reference: "reference locale " + n,
    provenance: { originalReference: "fixture-offline:oeuvre-" + n, connectorId: "connecteur-corpus-local",
      retrievalMethod: "INJECTED_LOCAL" },
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
      return { providerAuthorId: idOf(seed.displayName),
        orcid: "fixture-offline:identifiant-fort-" + sha256Of({ n: seed.displayName }).slice(0, 8), affiliation: null };
    },
    async expandRelatedAuthors() { return []; },
    async fetchAuthorWorks(v) {
      return [1, 2].map((k) => ({ id: "fixture-offline:travail-" + sha256Of({ r: v.candidateRef, k }).slice(0, 10),
        display_name: "Travail " + k + " de " + v.displayName, doi: null, publication_year: 2024, topics: [] }));
    },
  };
}

(async () => {
  console.log("MONO-10 v0.7 — integration hors ligne (vrai consumer MONO-09 v0.2, mode TEST)\n");
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
  const missionId = "mission-integration-v07";
  const snapshot = corpusSnapshot(missionId);
  const dimensionSet = { dimensions: [{ name: "dimension-alpha" }, { name: "dimension-beta" }] };

  /* §32 — l'EXPLOITANT declare les racines qu'il reconnait. Deux familles
   * distinctes parce qu'il les a enregistrees distinctes, pas parce qu'un
   * appelant a change une chaine. L'oeuvre 3 est VOLONTAIREMENT absente. */
  const roots = [
    { sourceRootId: "fixture-offline:oeuvre-1", authorityRootId: "AUT-CORPUS-1", familyRootId: "FAM-CORPUS" },
    { sourceRootId: "fixture-offline:oeuvre-2", authorityRootId: "AUT-CORPUS-2", familyRootId: "FAM-CORPUS" },
  ];
  const idOf = (name) => "fixture-offline:auteur-" + sha256Of({ n: name }).slice(0, 10);
  ["Personne Alpha", "Personne Beta", "Personne Gamma"].forEach(function (n, i) {
    roots.push({ sourceRootId: idOf(n), authorityRootId: "AUT-RESOLVEUR", familyRootId: "FAM-RESOLUTION" });
  });
  const op = FX.provisionOperator({ namespace: "TEST", boundaryId: "otb-integ-v07", provenanceRoots: roots });
  const boundary = FX.boundaryFor(op);
  const verifier = OTV.createOperatorTrustVerifier(boundary);
  check("I-01. frontiere TEST provisionnee, autorite de provenance presente",
    boundary.namespace === "TEST" && OPA.isProvisionedProvenanceAuthority(verifier.provenanceAuthority()));

  const realDiscovery = await realAdapter.discoverProfessionals({ corpusSnapshot: snapshot, missionDimensionSet: dimensionSet });
  const realVerification = await realAdapter.verifyProfessionals({ professionalDiscovery: realDiscovery });
  check("I-02. MONO-09 v0.2 produit une decouverte reelle depuis le CorpusSnapshot",
    realDiscovery.schema === "EvidenceForge.ProfessionalDiscovery" && realDiscovery.candidates.length === 3);
  check("I-03. MONO-09 v0.2 verifie sans que MONO-10 reecrive son statut",
    realVerification.schemaVersion === "EF-02B-v2"
    && realVerification.verified.filter((v) => v.verificationStatus === "VERIFIED").length === 3);
  check("I-04. la source exclue par l'humain ne produit aucune graine",
    realDiscovery.candidates.every((c) => c.displayName !== "Personne Delta"));

  /** Un scenario = un run complet, porte et capacites incluses. */
  async function scenario(o) {
    o = o || {};
    const runId = "run-integ-" + sha256Of(o).slice(0, 10);
    const missionHash = sha256Of({ missionId: missionId });
    const intent = { runId, missionHash, producerId: "MONO-10", producerVersion: "v0.7",
      executionMode: "TEST", openedAt: now() };
    const att = op.authority.attest(intent);
    const manifest = RM.openRunEvidenceManifest({ verifier, attestation: att, runIntent: intent,
      missionBinding: { missionId }, missionHash });
    const ctxBase = { manifest, verifier, attestation: att };
    const registry = AAR.openAuthenticatedArtifactRegistry(manifest, ctxBase);
    const runContext = Object.assign({}, ctxBase, { artifactRegistry: registry });
    const bind = (id, rel, art) => { const b = RM.bindArtifact(manifest, art, id, art.schema || rel);
      registry.register({ artifactId: id, relation: rel, artifact: b }); return registry.get(id).artifact; };
    bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId, missionHash });
    const discovery = bind("professional-discovery", R.DISCOVERY, realDiscovery);
    const verification = bind("professional-verification", R.VERIFICATION, realVerification);

    // §17-§25 — le pont TRADUIT. Les racines sont resolues par l'autorite.
    const binder = UEB.createUpstreamEvidenceBinder({ registry, manifest,
      provenanceAuthority: verifier.provenanceAuthority(), artifactIdPrefix: "amont" });
    const screened = snapshot.sources.filter((x) => x.statutScreening === "inclus").map((x) => ({
      localSourceId: x.id, providerWorkId: x.provenance.originalReference, observed: x, retrievedAt: null }));
    const extra = o.extraSources || [];
    const boundSources = UEB.bindScreenedSources({ binder, screenedSources: screened.concat(extra) });
    const boundIdentities = UEB.bindResolvedIdentities({ binder, discovery: realDiscovery });
    const boundDiscovery = bind("professional-discovery-bound", R.DISCOVERY, UEB.bindUpstreamDiscovery({
      discovery: realDiscovery, sourceRefByProviderWorkId: boundSources.refByProviderWorkId,
      identityRefByCandidateRef: boundIdentities.refByCandidateRef,
      ambiguousIdentifiers: boundSources.ambiguous,
      upstreamVerification: realVerification, strongIdentifierField: "orcid",
      upstreamDiscoveryRef: LIN.artifactRef(discovery, "professional-discovery", R.DISCOVERY) }));

    const assessment = bind("candidate-assessment", R.ASSESSMENT, CA.assessCandidates({
      discovery: boundDiscovery, verification, missionLabels: ["dimension-alpha", "dimension-beta"],
      runId, missionHash, attestationHash: manifest.runtimeAttestationHash, artifactRegistry: registry,
      verifier: verifier,
      discoveryArtifactId: "professional-discovery-bound", verificationArtifactId: "professional-verification" }));

    const tpl = PG.buildPanelValidationTemplate(assessment);
    const byId = new Map(); (assessment.assessments || []).forEach((a) => byId.set(a.candidateId, a));
    const omitted = o.omitDecisionFor || [];
    const validation = bind("panel-validation", R.PANEL_DECISION, Object.assign({}, tpl, {
      decisions: tpl.decisions.filter((d) => omitted.indexOf(d.candidateId) === -1).map(function (d) {
        const dec = PG.DECISION[o.decision || "APPROVE"];
        const dh = PG.panelDecisionHash(assessment, byId.get(d.candidateId), dec);
        return Object.assign({}, d, { decision: dec, decisionReason: "motif consigne", actorType: "human",
          actorIdentity: "auditeur-panel", decidedAt: now(), decisionHash: dh,
          authenticationMode: HAB.AUTHENTICATION.TEST_FIXTURE });
      }) }));
    // §30 — la capacite HUMAN_AUTHENTICATED est emise par le mecanisme d'acte.
    const mech = boundary.humanAuthMechanism;
    registry.grantCapability("panel-validation", AC.mintCapabilityGrant({ issuer: mech,
      capability: AC.CAPABILITY.HUMAN_AUTHENTICATED, artifactId: "panel-validation",
      artifactHash: registry.get("panel-validation").hash, artifactSchema: registry.get("panel-validation").artifactType,
      runId: manifest.runId, missionHash: manifest.missionHash, issuerId: mech.mechanismId,
      derivationRef: "human-acts:" + sha256Of((validation.decisions || []).map((d) => d.decisionHash)) }));

    const gated = PGA.createPanelGatedAdapter(realAdapter, { panelValidation: validation,
      candidateAssessment: assessment, runContext: runContext,
      panelValidationArtifactId: "panel-validation", eligibilityPolicy: o.eligibilityPolicy });

    const gatedVerification = await gated.verifyProfessionals({ professionalDiscovery: realDiscovery }, {});
    let payload = gatedVerification;
    if (o.tamper === "eligibility") {
      payload = clone(gatedVerification);
      payload.verified.forEach(function (x) {
        x.effectiveCorpusEligibility = EE.ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL;
        x.humanPanelDecision = PG.DECISION.APPROVE; x.humanActAuthenticated = true; x.recomputed = true;
      });
    }
    if (o.tamper === "fabricated") {
      payload = { schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", missionId: missionId,
        verified: realVerification.verified.map((x) => ({ candidateRef: x.candidateRef, displayName: x.displayName,
          verificationStatus: "VERIFIED", verifiedIdentifiers: x.verifiedIdentifiers,
          effectiveCorpusEligibility: EE.ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL,
          humanPanelDecision: PG.DECISION.APPROVE, humanActAuthenticated: true, recomputed: true })) };
    }
    const corpus = await gated.buildProfessionalCorpus({ professionalVerification: payload,
      corpusSnapshot: snapshot, missionDimensionSet: dimensionSet }, {});
    return { corpus, count: (corpus.professionalCorpora || []).length,
      refs: (corpus.professionalCorpora || []).map((x) => x.professionalRef),
      works: (corpus.professionalCorpora || []).reduce((n, pc) => n + ((pc.corpus && pc.corpus.works) || []).length, 0),
      assessment, boundSources, boundDiscovery, gate: gatedVerification.panelGate, registry, presented: tpl.decisions.map((d) => d.candidateId) };
  }

  /* ---------- §42/§43 : la grille ---------- */
  const grid = {};
  grid["APPROVE/normal"] = await scenario({ decision: "APPROVE" });
  grid["APPROVE/tampered"] = await scenario({ decision: "APPROVE", tamper: "eligibility" });
  grid["APPROVE/fabricated"] = await scenario({ decision: "APPROVE", tamper: "fabricated" });
  grid["DEFER/normal"] = await scenario({ decision: "DEFER" });
  grid["DEFER/tampered"] = await scenario({ decision: "DEFER", tamper: "eligibility" });
  grid["DEFER/fabricated"] = await scenario({ decision: "DEFER", tamper: "fabricated" });
  grid["REJECT/normal"] = await scenario({ decision: "REJECT" });
  grid["REJECT/tampered"] = await scenario({ decision: "REJECT", tamper: "eligibility" });
  grid["REJECT/fabricated"] = await scenario({ decision: "REJECT", tamper: "fabricated" });
  const c = (k) => grid[k].count;
  const presented = grid["APPROVE/normal"].presented;
  const N = presented.length;
  console.log("\n  presentes au panel : " + N + " sur " + realDiscovery.candidates.length
    + " (les autres n'ont pas de base documentaire authentifiee)");
  console.log("  grille corpus (professionnels admis par le VRAI EF-02C) :");
  ["APPROVE", "DEFER", "REJECT"].forEach((d) => console.log("    " + d.padEnd(8)
    + " normal=" + c(d + "/normal") + "  tampered=" + c(d + "/tampered") + "  fabricated=" + c(d + "/fabricated")));

  check("I-05. TEMOIN POSITIF : APPROVE/normal admet les candidats presentes", c("APPROVE/normal") === N && N > 0, c("APPROVE/normal") + "/" + N);
  check("I-06. les oeuvres reelles sont normalisees par MONO-09", grid["APPROVE/normal"].works === 2 * N, grid["APPROVE/normal"].works);
  check("I-07. DEFER/normal : aucun professionnel au corpus", c("DEFER/normal") === 0, c("DEFER/normal"));
  check("I-08. DEFER/tampered : l'eligibilite falsifiee n'admet personne", c("DEFER/tampered") === 0, c("DEFER/tampered"));
  check("I-09. DEFER/fabricated : une verification fabriquee n'admet personne", c("DEFER/fabricated") === 0, c("DEFER/fabricated"));
  check("I-10. REJECT/normal : aucun professionnel au corpus", c("REJECT/normal") === 0, c("REJECT/normal"));
  check("I-11. REJECT/tampered : l'eligibilite falsifiee n'admet personne", c("REJECT/tampered") === 0, c("REJECT/tampered"));
  check("I-12. REJECT/fabricated : une verification fabriquee n'admet personne", c("REJECT/fabricated") === 0, c("REJECT/fabricated"));

  /* ---------- §42 : decision de panel ABSENTE ---------- */
  // Une decision manquante n'exclut pas seulement ce candidat : elle invalide
  // la porte entiere. Fail closed, aucun corpus — plus strict que l'exclusion.
  let missingErr = null, missingCount = null;
  try { const m = await scenario({ decision: "APPROVE", omitDecisionFor: [presented[0]] }); missingCount = m.count; }
  catch (e) { missingErr = String(e.message).split(":")[0]; }
  check("I-13. decision de panel absente : fail closed, aucun corpus",
    missingErr === "PANEL_VALIDATION_INVALID" && missingCount === null,
    missingErr + " / corpus=" + missingCount);

  /* ---------- §42 : base documentaire insuffisante, jamais presentee ---------- */
  const neverShown = realDiscovery.candidates.map((x) => x.candidateRef).filter((r) => presented.indexOf(r) === -1);
  check("I-14. un candidat jamais presente au panel reste hors corpus",
    neverShown.every((r) => grid["APPROVE/normal"].refs.indexOf(r) === -1),
    "jamais presentes = " + JSON.stringify(neverShown));
  const withLegacy = await scenario({ decision: "APPROVE", eligibilityPolicy: { legacyVerificationGrantsEligibility: true } });
  check("I-15. B1 ferme dans le chemin REEL : la politique n'admet personne de plus",
    withLegacy.count === N
    && neverShown.every((r) => withLegacy.refs.indexOf(r) === -1)
    && withLegacy.gate.eligibilityPolicyRefused.indexOf("legacyVerificationGrantsEligibility") !== -1,
    withLegacy.count + " / refus=" + JSON.stringify(withLegacy.gate.eligibilityPolicyRefused));

  /* ---------- §22-§25 : ambiguite amont dans le chemin reel ---------- */
  const ambRun = await scenario({ decision: "APPROVE", extraSources: [
    { localSourceId: "S-dup-a", providerWorkId: "fixture-offline:oeuvre-1", observed: { contenu: "AUTRE CONTENU" }, retrievedAt: null }] });
  check("I-16. un identifiant amont ambigu est signale, jamais resolu",
    ambRun.boundSources.ambiguous.length === 1
    && ambRun.boundSources.ambiguous[0].identifier === "fixture-offline:oeuvre-1"
    && ambRun.boundSources.refByProviderWorkId.has("fixture-offline:oeuvre-1") === false,
    JSON.stringify(ambRun.boundSources.summary));
  check("I-17. l'ambiguite se propage au candidat concerne",
    ambRun.boundDiscovery.candidates.some((x) => x.identityAmbiguity === "UPSTREAM_IDENTIFIER_AMBIGUOUS"));

  /* ---------- §32 : racine non enregistree => preuve non presentable ---------- */
  const un = grid["APPROVE/normal"].registry;
  const notRegistered = un.entries().filter((e) => e.relation === R.DOCUMENTARY_EVIDENCE
    && e.capabilities.indexOf(AC.CAPABILITY.AUTHENTICATED_PROVENANCE) === -1);
  const registered = un.entries().filter((e) => e.relation === R.DOCUMENTARY_EVIDENCE
    && e.capabilities.indexOf(AC.CAPABILITY.AUTHENTICATED_PROVENANCE) !== -1);
  check("I-18. seules les racines enregistrees par l'exploitant obtiennent la capacite",
    registered.length > 0 && notRegistered.length > 0,
    "authentifiees=" + registered.length + " non authentifiees=" + notRegistered.length);
  // On verifie la RACINE portee par l'artefact, pas son identifiant local.
  const unauthRoots = notRegistered.map((e) => un.get(e.artifactId).artifact.sourceRootId);
  check("I-19. l'oeuvre volontairement absente du registre n'est pas authentifiee",
    unauthRoots.indexOf("fixture-offline:oeuvre-3") !== -1
    && unauthRoots.indexOf("fixture-offline:oeuvre-1") === -1,
    JSON.stringify(unauthRoots));

  /* ---------- §55 : simulation de securite ---------- */
  console.log("\n  -- §55 : l'appelant ne remplace aucune frontiere --");
  check("I-20. un verificateur imite n'est pas reconnu",
    OTV.isOperatorTrustVerifier({ namespace: "TEST", verifyRuntimeAttestation: () => ({ valid: true }) }) === false);
  check("I-21. une frontiere d'acceptation imitee n'est pas reconnue",
    OAB.isProvisionedAcceptanceBoundary({ namespace: "TEST", validateAcceptance: () => ({ valid: true }) }) === false
    && OAB.isProvisionedAcceptanceBoundary(verifier.acceptanceBoundary()) === true);
  check("I-22. une autorite de provenance imitee n'est pas reconnue",
    OPA.isProvisionedProvenanceAuthority({ authorityId: "faux", resolveRoots: () => ({ status: "AUTHENTICATED" }) }) === false);
  check("I-23. une autorite d'entree historique imitee n'est pas reconnue",
    require(C + "operator-historical-input-authority.js").isProvisionedHistoricalInputAuthority(
      { authorityId: "faux", authorize: () => ({ authorized: true }) }) === false);
  check("I-24. le transport de l'appelant est ignore",
    (await LC.runActiveProbe({ providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture", credentialPresent: true },
      { manifest: grid["APPROVE/normal"].registry ? null : null, verifier: verifier,
        transport: async () => ({ httpStatus: 200, text: "{}", requestId: "x" }) })).callerTransportIgnored === true);
  check("I-25. sans variable d'environnement, aucune frontiere de PRODUCTION",
    (function () { const prev = process.env[OTB.ENV_VAR]; delete process.env[OTB.ENV_VAR];
      try { OTB.provisionProductionTrustBoundary(); return false; }
      catch (e) { return true; }
      finally { if (prev !== undefined) process.env[OTB.ENV_VAR] = prev; } })());
  check("I-26. provisionTestTrustBoundary refuse structurellement PRODUCTION",
    (function () { try { OTB.provisionTestTrustBoundary(Object.assign({}, op.cfg, { namespace: "PRODUCTION" })); return false; }
      catch (e) { return /PRODUCTION/.test(e.message); } })());
  check("I-27. une reserve anti-rejeu en memoire est refusee en PRODUCTION",
    (function () { try { OTB.provisionTestTrustBoundary(Object.assign({}, op.cfg,
      { replayProtection: { kind: "MEMORY" } })); return true; } catch (e) { return false; } })());
  check("I-28. aucune cle privee lue par le noyau",
    Object.keys((boundary.anchorSet && boundary.anchorSet[0]) || {}).every((k) => !/private/i.test(k)));

  console.log("\n  contre-mesures : NETWORK_CALLS = 0 | REAL_LLM_CALLS = 0 | REAL_EF02_RUNS = 0 | REAL_HUMAN_ACTS = 0");
  console.log("\n" + pass + " PASS, " + fail + " FAIL, " + skip + " SKIP");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("INTEGRATION_FAILED:", e && e.stack); process.exit(1); });
