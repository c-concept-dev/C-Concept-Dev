"use strict";
/**
 * MONO-11 v0.1 — test/test-mono11-v0.2.js
 * Tests DISCRIMINANTS (Charte §23) : gate, anti-hardcoding, anti-circularite, lignee,
 * integrite des lots geles, fail-closed, mutation. Trois domaines synthetiques.
 * Aucune preuve REAL : les fixtures se declarent fixtures.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const M11 = require("../index.js");
const { mountRun, bundleRoot } = require("./harness.js");
const { MISSIONS, makeFakeLlm } = require("./fixtures/domains.js");
const MEG = M11.machineEvidenceGate, APA = M11.autonomousPanelAdapter, Q = M11.composedQualification, SRO = M11.semanticRelevanceOracle, CSP = M11.corpusSufficiencyProbe;
const STATE = MEG.STATE;

const decisionOf = (r, suffix) => r.panel.decisions.find((d) => d.candidateId.endsWith("/" + suffix));
async function full(missionKey, opts) {
  const h = await mountRun(missionKey, opts);
  const r = await h.runPanel();
  return { h, r };
}

/* ===================== GATE (1-5) ===================== */
test("T01 identite forte + corpus suffisant + pertinence reelle -> AUTO_APPROVED", async () => {
  const { r } = await full("domainA");
  const d = decisionOf(r, "A-ok");
  assert.equal(d.state, STATE.APPROVED);
  assert.equal(d.relevanceClass, "SUPPORTED"); assert.equal(d.corpusStatus, "SUFFICIENT");
  assert.equal(d.machineActor.actorType, "machine"); assert.equal(d.notAHumanDecision.length > 0, true);
  assert.ok(d.criteria.find((c) => c.criterion === "G1_IDENTITY_RESOLVED").state === "SATISFIED");
  assert.ok(d.criteria.find((c) => c.criterion === "G3_REAL_RELEVANCE").state === "SATISFIED");
});
test("T02 identite ambigue -> AMBIGUOUS, jamais promu", async () => {
  const { r } = await full("domainA");
  const d = decisionOf(r, "A-amb");
  assert.equal(d.state, STATE.AMBIGUOUS);
  assert.ok(d.reasonCodes.includes("IDENTITY_AMBIGUOUS"));
  assert.equal(r.panel.approvedCandidateIds.includes(d.candidateId), false);
});
test("T03 corpus insuffisant -> INSUFFICIENT_DOCUMENTARY_BASIS, oracle non consulte", async () => {
  const { r } = await full("domainA");
  const d = decisionOf(r, "A-thin");
  assert.equal(d.state, STATE.INSUFFICIENT);
  assert.ok(d.reasonCodes.includes("CORPUS_INSUFFICIENT"));
  const g = r.gateInputs.find((x) => x.assessment.candidateId === d.candidateId);
  assert.equal(g.relevanceEvidence.oracle.realCall, false, "un corpus insuffisant ne coute aucun appel LLM");
});
test("T04 corpus hors mission -> AUTO_REJECTED (mission_irrelevant explicite sur chaque dimension)", async () => {
  const { r } = await full("domainA");
  const d = decisionOf(r, "A-off");
  assert.equal(d.state, STATE.REJECTED); assert.equal(d.relevanceClass, "OUT_OF_SCOPE");
});
test("T05 pertinence indeterminable -> AUTO_DEFERRED (terminal dans le run nominal)", async () => {
  const { r } = await full("domainA");
  const d = decisionOf(r, "A-und");
  assert.equal(d.state, STATE.DEFERRED); assert.equal(d.relevanceClass, "NOT_DETERMINABLE");
  assert.equal(APA.admittedCandidateIds(r.panel).includes(d.candidateId), false);
});

/* ===================== ANTI-HARDCODING (6-10) ===================== */
test("T06 trois missions de domaines distincts traversent la meme logique sans dictionnaire", async () => {
  for (const k of ["domainA", "domainB", "domainC"]) {
    const { r } = await full(k);
    assert.ok(r.panel.decisions.length > 0, k);
    r.panel.decisions.forEach((d) => assert.ok(M11.contracts.gateStates.values.includes(d.state), k + " " + d.state));
    assert.equal(r.panel.fixedQuota, false); assert.equal(r.panel.fixedPanelSize, false);
  }
  const { r: rb } = await full("domainB"); assert.equal(decisionOf(rb, "B-ok").state, STATE.APPROVED); assert.equal(decisionOf(rb, "B-partial").state, STATE.DEFERRED);
  const { r: rc } = await full("domainC"); assert.equal(decisionOf(rc, "C-ok").state, STATE.APPROVED); assert.equal(decisionOf(rc, "C-contra").state, STATE.AMBIGUOUS, "contradiction d'ORCID sur le corpus");
});
test("T07 permutation des candidats -> memes etats par candidat", async () => {
  const { r } = await full("domainA");
  const inputs = r.gateInputs.slice().reverse();
  const p2 = MEG.gatePanel({ candidates: inputs, dimensionSet: r.panel.dimensionSetRef && { dimensions: [] }, ctx: {} });
  const s1 = new Map(r.panel.decisions.map((d) => [d.candidateId, d.state])), s2 = new Map(p2.decisions.map((d) => [d.candidateId, d.state]));
  s1.forEach((v, k) => assert.equal(s2.get(k), v, k));
});
test("T08 changer les noms des candidats ne change aucun etat", async () => {
  const { r } = await full("domainA");
  const renamed = r.gateInputs.map((g, i) => Object.assign({}, g, { candidate: Object.assign({}, g.candidate, { displayName: "Autre nom " + i }), assessment: Object.assign({}, g.assessment, { professionalIdentity: { displayName: "Autre nom " + i } }) }));
  const p2 = MEG.gatePanel({ candidates: renamed, ctx: {} });
  r.panel.decisions.forEach((d, i) => assert.equal(p2.decisions[i].state, d.state));
});
test("T09 changer les libelles de discipline / lignee de requete n'a aucun effet decisif", async () => {
  const { r } = await full("domainA");
  const relabeled = r.gateInputs.map((g) => Object.assign({}, g, { candidate: Object.assign({}, g.candidate, { dimensionRef: "libelle-quelconque", disciplines: ["libelle-quelconque"] }) }));
  const p2 = MEG.gatePanel({ candidates: relabeled, ctx: {} });
  r.panel.decisions.forEach((d, i) => assert.equal(p2.decisions[i].state, d.state));
  const src = fs.readFileSync(path.join(__dirname, "..", "core", "machine-evidence-gate.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/dimensionRef|disciplines|queryLineage/.test(src), false, "le gate ne lit ni dimensionRef ni disciplines ni lignee de requete");
});
test("T10 aucun quota : 0, 1 ou plusieurs admis sont tous des resultats legitimes ; scan anti-hardcoding vide", async () => {
  const { r } = await full("domainA");
  assert.ok(r.panel.approvedCandidateIds.length >= 1);
  const only = MEG.gatePanel({ candidates: r.gateInputs.filter((g) => g.assessment.candidateId.endsWith("/A-und")), ctx: {} });
  assert.equal(only.approvedCandidateIds.length, 0);
  assert.equal(only.counts.AUTO_DEFERRED, 1);
  const scan = require("../tools/anti-hardcoding-scan.js").scan();
  assert.deepEqual(scan.hits, [], JSON.stringify(scan.hits));
  ["FIXED_PROFESSION_LIST", "FIXED_DISCIPLINE_LIST", "FIXED_EXPERT_LIST", "FIXED_PANEL_SIZE", "CASE_SPECIFIC_LEAK_FOUND", "DOMAIN_HARDCODING_FOUND"].forEach((k) => assert.equal(scan[k], "NO", k));
});
test("T10b le scanner DETECTE une fuite plantee (mutation du balayage)", () => {
  const S = require("../tools/anti-hardcoding-scan.js");
  const tmp = path.join(__dirname, "..", "core", "__mutant-leak.js");
  /* le texte du mutant est ASSEMBLE pour ne pas figurer lui-meme dans ce fichier balaye */
  fs.writeFileSync(tmp, ["if (mission === '", "jm", "js') { panel", "Size = 5 }"].join("") + "\n");
  try {
    const scan = S.scan();
    assert.ok(scan.hits.some((h) => h.pattern === "IF_CASE"), "IF_CASE detecte");
    assert.equal(scan.CASE_SPECIFIC_LEAK_FOUND, "YES");
  } finally { fs.unlinkSync(tmp); }
});

/* ===================== ANTI-CIRCULARITE (11-14) ===================== */
test("T11 auteur d'une source incluse mais corpus hors mission -> rejete (etre auteur d'une source retenue ne prouve rien)", async () => {
  const { r } = await full("domainA");
  const d = decisionOf(r, "A-off");
  assert.equal(d.discoveryOrigin, "SEED_CANDIDATE"); assert.equal(d.state, STATE.REJECTED);
});
test("T12 auteur non-graine (decouverte secondaire) avec corpus pertinent -> peut etre retenu", async () => {
  const { r } = await full("domainA");
  const d = decisionOf(r, "A-second");
  assert.equal(d.discoveryOrigin, "DISCOVERED_CANDIDATE"); assert.equal(d.state, STATE.APPROVED);
  assert.ok(d.reasonCodes.includes("SECONDARY_DISCOVERY"));
});
test("T12b soutien par la seule oeuvre-graine -> SEED_ONLY_SUPPORT, AUTO_DEFERRED", async () => {
  const { r } = await full("domainA");
  const d = decisionOf(r, "A-seedonly");
  assert.equal(d.state, STATE.DEFERRED); assert.ok(d.reasonCodes.includes("SEED_ONLY_SUPPORT"));
});
test("T13 ORCID seul (sans corpus attribue) -> insuffisant", async () => {
  const { r } = await full("domainA");
  const d = decisionOf(r, "A-orcidonly");
  assert.equal(d.state, STATE.INSUFFICIENT); assert.ok(d.reasonCodes.includes("CORPUS_NOT_ATTRIBUTABLE") || d.reasonCodes.includes("NO_ATTRIBUTED_EVIDENCE"));
});
test("T14 forte citation sans pertinence -> insuffisant pour admettre ; le gate ne lit aucun compte de citations", async () => {
  const { r } = await full("domainA");
  assert.equal(decisionOf(r, "A-off").state, STATE.REJECTED);
  const src = fs.readFileSync(path.join(__dirname, "..", "core", "machine-evidence-gate.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/citation|cited_by|h[_-]?index|popular/i.test(src), false);
});

/* ===================== LIGNEE (15-18) ===================== */
test("T15 casser une evidenceRef -> lignee invalide", async () => {
  const { h, r } = await full("domainA");
  assert.equal(h.ledger.verifyChain().valid, true);
  const art = h.ledger.get("mono11:relevance:" + decisionOf(r, "A-ok").candidateId);
  art.relevanceClass = "OUT_OF_SCOPE"; // mutation de l'artefact enregistre
  assert.equal(h.ledger.verifyChain().valid, false);
});
test("T16 casser la provenance -> gate INSUFFICIENT (G-11 UNKNOWN), jamais SATISFIED", async () => {
  const { r } = await full("domainA");
  const g = r.gateInputs.find((x) => x.assessment.candidateId.endsWith("/A-ok"));
  const broken = Object.assign({}, g, { evidenceArtifactRefs: { assessment: null, corpus: g.evidenceArtifactRefs.corpus, relevance: g.evidenceArtifactRefs.relevance } });
  const d = MEG.gateCandidate(broken);
  assert.equal(d.state, STATE.INSUFFICIENT); assert.ok(d.reasonCodes.includes("PROVENANCE_UNRESOLVED"));
});
test("T17 actorType human sans preuve humaine -> override refuse par le validateur GELE de MONO-10", async () => {
  const { h, r } = await full("domainA");
  const PG = h.M10.PG;
  const tpl = PG.buildPanelValidationTemplate(h.assessment);
  const fake = Object.assign({}, tpl, { decisions: tpl.decisions.map((d) => Object.assign({}, d, { decision: "APPROVE_FOR_DOCUMENTARY_PANEL", decisionReason: "x", actorType: "human", actorIdentity: "quelqu'un", decidedAt: new Date().toISOString(), decisionHash: "deadbeef", humanActProof: null })) });
  assert.throws(() => APA.applyHumanOverride({ frozen: h.F, panel: r.panel, panelValidation: fake, assessment: h.assessment, ctx: Object.assign({ artifactRegistry: h.registry }, h.ctx) }), /HUMAN_OVERRIDE_INVALID/);
  /* et un acte machine re-etiquete human est refuse par human-act.js (aucun mecanisme ne l'authentifie) */
  const asHuman = Object.assign({}, r.panel.decisions[0], { actorType: "human", actorIdentity: "machine deguisee", decidedAt: new Date().toISOString() });
  const auth = h.M10.CANON; void auth;
  const v = require(path.join(h.M10.dir, "core", "human-act.js")).verifyHumanActAuthenticity(asHuman, { verifier: h.verifier }, "test", { actionType: "PANEL_DECISION", decisionHash: r.panel.decisions[0].decisionHash, runId: h.runId, missionHash: h.missionHash });
  assert.equal(v.authenticated, false);
});
test("T18 acteur machine reel -> pass : identite du gate, hash du module, liaison au run", async () => {
  const { h, r } = await full("domainA");
  const a = r.panel.machineActor;
  assert.equal(a.actorType, "machine"); assert.equal(a.notAHumanAct, true);
  assert.ok(a.actorIdentity.startsWith("mono11-machine-evidence-gate@" + h.manifest.operatorTrustBoundaryId));
  assert.equal(a.gateModuleSha256, crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "..", "core", "machine-evidence-gate.js"))).digest("hex"));
  assert.equal(r.panel.runBinding.runId, h.runId);
  assert.equal(h.ledger.verifyChain().valid, true);
  assert.equal(h.registry.verifyEventChain().valid, true);
});

/* ===================== INTEGRITE DES LOTS GELES (19-20) ===================== */
test("T19 MONO-10 v0.19 : sceau 0 divergence, zip canonique intact", () => {
  const F = M11.frozenBridge.loadFrozen({ bundleRoot: bundleRoot() });
  assert.equal(F.seals.MONO10.verified, true); assert.equal(F.seals.MONO10.divergences.length, 0); assert.equal(F.seals.MONO10.files, 79);
  const zip = path.join(bundleRoot(), "MONO-10", "EvidenceForge-MONO10-SCIENTIFIC-QUALIFICATION-v0.19.zip");
  if (fs.existsSync(zip)) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(zip)).digest("hex"), "f5a4165414f4aacc32f48f50eb14d59c87a09e3f138e24f8bd14b956972c2e04");
});
test("T20 tous les lots composes sont scelles ; un lot altere n'est PAS charge (mutation)", () => {
  const F = M11.frozenBridge.loadFrozen({ bundleRoot: bundleRoot() });
  assert.equal(F.seals.MONO09.verified, true); assert.equal(F.seals.MONO01.verified, true);
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "m11-mut-"));
  const src = path.join(bundleRoot(), "MONO-09", "v0.2");
  fs.cpSync(src, path.join(tmp, "MONO-09", "v0.2"), { recursive: true });
  fs.cpSync(path.join(bundleRoot(), "MONO-10", "v0.19"), path.join(tmp, "MONO-10", "v0.19"), { recursive: true });
  fs.cpSync(path.join(bundleRoot(), "MONO-01"), path.join(tmp, "MONO-01"), { recursive: true });
  fs.appendFileSync(path.join(tmp, "MONO-09", "v0.2", "lib", "professional-adapter.js"), "\n// mutation\n");
  assert.throws(() => M11.frozenBridge.loadFrozen({ bundleRoot: tmp }), /FROZEN_LOT_ALTERED: MONO09/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ===================== FAIL-CLOSED (21-23) ===================== */
test("T21 0 eligible -> aucun faux panel : l'aval refuse", async () => {
  const { h, r } = await full("domainA");
  const empty = MEG.gatePanel({ candidates: r.gateInputs.filter((g) => g.assessment.candidateId.endsWith("/A-und")), ctx: h.gateCtx });
  await assert.rejects(h.runDownstream(Object.assign({}, r, { panel: empty })), /FAIL_CLOSED_NO_ADMITTED_PROFESSIONAL/);
  const q = Q.qualifyProcess({ frozen: h.F, assessment: h.assessment, panel: empty, corpusSet: { professionalCorpora: [] }, twinSet: { twins: [] }, reviewSet: { reviews: [] }, aggregation: { aggregates: [] }, llmCapability: {}, ledger: h.ledger, registry: h.registry });
  assert.equal(q.status, "NOT_QUALIFIED"); assert.ok(q.failedCriteria.includes("evidence_gate_passed"));
});
test("T22 0 jumeau -> pas de revue", async () => {
  const { h, r } = await full("domainA");
  const F = h.F; const orig = F.M01.E.buildDocumentaryTwinSet;
  const stub = Object.assign({}, F.M01.E, { buildDocumentaryTwinSet: async (i) => Object.assign(await orig(i), { twins: [], summary: { twinsBuilt: 0 } }) });
  const F2 = Object.assign({}, F, { M01: Object.assign({}, F.M01, { E: stub }) });
  await assert.rejects(h.runDownstream(r, { frozen: F2 }), /FAIL_CLOSED_NO_TWIN/);
});
test("T23 LLM indisponible -> pas de faux succes : oracle UNKNOWN, aucun admis ; capacite non prouvee -> NOT_QUALIFIED", async () => {
  const h = await mountRun("domainA", { llm: async () => { throw new Error("provider unavailable"); } });
  const r = await h.runPanel();
  assert.equal(r.panel.approvedCandidateIds.length, 0);
  r.gateInputs.filter((g) => g.corpusEvidence.status === "SUFFICIENT").forEach((g) => assert.equal(g.relevanceEvidence.relevanceClass, "UNKNOWN"));
  await assert.rejects(SRO.evaluateRelevanceEvidence({ frozen: h.F, corpus: { professionalRef: "x", corpus: { works: [] } }, attributedWorkRefs: [], dimensionSet: h.dimensionSet, missionQuestion: "q" }), /LLM_CALL_REQUIRED/);
  const { h: h2, r: r2 } = await full("domainA");
  const dn = await h2.runDownstream(r2);
  const q = Q.qualifyProcess({ frozen: h2.F, assessment: h2.assessment, panel: dn.panel, corpusSet: dn.corpusSet, twinSet: dn.twinSet, reviewSet: dn.reviewSet, aggregation: dn.aggregation,
    llmCapability: { schema: "EvidenceForge.LlmCapability", status: "AVAILABLE" }, llmConfig: {}, runContext: {}, ledger: h2.ledger, registry: h2.registry });
  assert.equal(q.status, "NOT_QUALIFIED"); assert.ok(q.failedCriteria.includes("llm_capability_validated"), "un booleen AVAILABLE sans sonde certifiee ne prouve rien");
});

/* ===================== ADVERSARIAL ORACLE / MUTATIONS ===================== */
test("T24 oracle menteur : titre invente -> refuse par le parseur gele, classe UNKNOWN, jamais admis", async () => {
  const h = await mountRun("domainA", { tamper: "invent_ref" });
  const r = await h.runPanel();
  const d = decisionOf(r, "A-ok");
  assert.notEqual(d.state, STATE.APPROVED); assert.equal(d.relevanceClass, "UNKNOWN");
});
test("T25 oracle incomplet (dimension manquante) et JSON casse -> UNKNOWN, jamais admis", async () => {
  for (const tamper of ["drop_dimension", "broken_json"]) {
    const h = await mountRun("domainA", { tamper });
    const r = await h.runPanel();
    assert.equal(r.panel.approvedCandidateIds.length, 0, tamper);
  }
});
test("T26 le gate refuse un artefact aval (G-7) et un etat hors contrat", async () => {
  const { r } = await full("domainA");
  assert.throws(() => MEG.gateCandidate(Object.assign({}, r.gateInputs[0], { reviewSet: { reviews: [] } })), /GATE_SEES_DOWNSTREAM/);
  assert.throws(() => MEG.gatePanel({ candidates: r.gateInputs, aggregation: {} }), /GATE_SEES_DOWNSTREAM/);
});
test("T27 politique de suffisance : seuils contractuels, jamais locaux ; un override est consigne", async () => {
  const F = M11.frozenBridge.loadFrozen({ bundleRoot: bundleRoot() });
  const p = CSP.resolveSufficiencyPolicy(F);
  assert.equal(p.policy.policyId, M11.contracts.corpusSufficiencyPolicy.policyId); assert.equal(p.policy.status, "test_unvalidated"); assert.equal(p.overridden, false);
  const o = CSP.resolveSufficiencyPolicy(F, { values: { minWorks: 5 } }); assert.equal(o.overridden, true); assert.equal(o.policy.values.minWorks, 5);
  assert.throws(() => CSP.resolveSufficiencyPolicy(F, { values: { minWorks: 0 } }), /min autoris/);
  const ev = CSP.probeCorpusSufficiency({ frozen: F, corpus: { professionalRef: "p", status: "complete", corpus: { works: [{ workRef: "w1", title: "t", doi: "10.5555/x", publicationYear: 2020, topics: [{ name: "a" }] }] } }, candidateRef: "p", attribution: null });
  assert.equal(ev.status, "UNKNOWN"); assert.ok(ev.reasonCodes.includes("CORPUS_NOT_ATTRIBUTABLE"));
});
test("T28 override humain authentifie : REJECT retire un admis, APPROVE sur AMBIGUOUS refuse, DEFER sans effet", async () => {
  const { h, r } = await full("domainA");
  const PG = h.M10.PG, HAP = require(path.join(h.M10.dir, "core", "human-act-proof.js")), OP = h.M10.OP;
  const tpl = PG.buildPanelValidationTemplate(h.assessment);
  const byId = new Map(h.assessment.assessments.map((a) => [a.candidateId, a]));
  const want = (id) => id.endsWith("/A-ok") ? "REJECT" : (id.endsWith("/A-amb") ? "APPROVE_FOR_DOCUMENTARY_PANEL" : "DEFER");
  const decisions = tpl.decisions.map(function (d) {
    const dec = want(d.candidateId); const dh = PG.panelDecisionHash(h.assessment, byId.get(d.candidateId), dec);
    return Object.assign({}, d, { decision: dec, decisionReason: "test override", actorType: "human", actorIdentity: "auditeur-panel", decidedAt: new Date().toISOString(), decisionHash: dh,
      humanActProof: OP.issueHumanActProof({ actorId: "auditeur-panel", actionType: HAP.ACTION_TYPE.PANEL_DECISION, decisionHash: dh, runId: h.runId, missionHash: h.missionHash, mechanismRef: h.verifier.humanAuthMechanismId(), actProofSecret: h.op.actProofSecret }) });
  });
  const validation = h.bind("panel-validation", h.R.PANEL_DECISION, Object.assign({}, tpl, { decisions }));
  h.verifier.certifyHumanAuthenticated({ registry: h.registry, artifactId: "panel-validation", acts: validation.decisions.map((d) => ({ act: d, expected: { actionType: HAP.ACTION_TYPE.PANEL_DECISION, decisionHash: d.decisionHash, runId: h.runId, missionHash: h.missionHash } })) });
  const p2 = APA.applyHumanOverride({ frozen: h.F, panel: r.panel, panelValidation: validation, assessment: h.assessment, ctx: Object.assign({ artifactRegistry: h.registry }, h.ctx) });
  /* A-amb n'est pas presentable a la porte MONO-10 (identite AMBIGUOUS => non PRESENT) : il n'y figure pas, donc aucun override ne peut l'admettre */
  assert.equal(APA.admittedCandidateIds(p2).some((id) => id.endsWith("/A-amb")), false);
  assert.equal(APA.admittedCandidateIds(p2).some((id) => id.endsWith("/A-ok")), false, "REJECT humain retire l'admis machine");
  assert.equal(p2.decisions.find((d) => d.candidateId.endsWith("/A-ok")).humanOverride.effect, "REMOVED_BY_HUMAN_OVERRIDE");
  assert.equal(p2.decisions.find((d) => d.candidateId.endsWith("/A-und")).humanOverride.effect, "NO_CHANGE_DEFER");
  assert.equal(p2.humanOverrideApplied, true);
  assert.equal(r.panel.humanOverrideApplied, false, "le panel machine n'est jamais mute");
});
test("T29 qualification : QUALIFIED_WITH_RESERVATIONS au mieux, reserve machine obligatoire, jamais QUALIFIED", async () => {
  const { h, r } = await full("domainA");
  const dn = await h.runDownstream(r);
  const cap = await h.llmCapability();
  const q = Q.qualifyProcess({ frozen: h.F, assessment: h.assessment, panel: dn.panel, corpusSet: dn.corpusSet, twinSet: dn.twinSet, reviewSet: dn.reviewSet, aggregation: dn.aggregation,
    llmCapability: cap.capability, llmConfig: cap.llmConfig, runContext: Object.assign({ artifactRegistry: h.registry }, h.ctx), ledger: h.ledger, registry: h.registry });
  assert.equal(q.status, "QUALIFIED_WITH_RESERVATIONS"); assert.deepEqual(q.failedCriteria, []);
  assert.equal(q.reservations[0].code, "PANEL_ADMITTED_BY_MACHINE_EVIDENCE_GATE_WITHOUT_HUMAN_ACT");
  assert.equal(q.humanPanelGateRequired, false);
  assert.ok(M11.contracts.qualificationStates.values.includes(q.status));
  const twins = dn.twinSet.twins.map((t) => t.professionalRef); const adm = APA.admittedCandidateIds(dn.panel);
  twins.forEach((t) => assert.ok(adm.includes(t), "jumeau hors panel"));
  assert.equal(q.criteria.find((c) => c.criterion === "no_human_act_simulated").pass, true);
});
test("T30 (v0.2) revue refusee localement -> reprise INFORMEE (passe 2 recoit erreurs + document) -> EF-03B gele accepte ; maxPasses=1 : l'erreur reste", async () => {
  const { h, r } = await full("domainA");
  const { makeDownstreamFakeLlm } = require("./harness.js");
  const flaky = makeDownstreamFakeLlm({ reviewTamper: "duplicate_dimension" });
  const dn = await h.runDownstream(r, { downstreamLlm: flaky, llmCall: flaky });
  assert.equal(dn.reviewSet.summary.reviewsError, 0);
  const t = dn.enforcementTraces.reviews.find((x) => x.acceptedPass === 2);
  assert.ok(t, "une revue a ete acceptee en passe 2");
  assert.ok(t.passes[0].errorCodes.includes("DIMENSION_DUPLICATE") && t.passes[0].errorCodes.includes("CARDINALITY"));
  const repair = flaky.calls.find((c) => c.indexOf("REPRISE (passe 2)") === 0 && c.indexOf("WORKS_USED") !== -1);
  assert.ok(repair.indexOf("[DIMENSION_DUPLICATE]") !== -1 && repair.indexOf("DOCUMENT CIBLE (targetId=") !== -1 && repair.indexOf("SCHEMA ATTENDU") !== -1 && repair.indexOf("CONTRAINTES DE CITATION") !== -1 && repair.indexOf("VOTRE REPONSE PRECEDENTE") !== -1, "la reprise voit erreurs, document, schema, contraintes, artefact fautif");
  const { h: h2, r: r2 } = await full("domainA");
  const flaky2 = makeDownstreamFakeLlm({ reviewTamper: "duplicate_dimension" });
  const dn2 = await h2.runDownstream(r2, { downstreamLlm: flaky2, llmCall: flaky2, reviewMaxPasses: 1 });
  assert.equal(dn2.reviewSet.summary.reviewsError, 1);
  const cap = await h2.llmCapability();
  const q = Q.qualifyProcess({ frozen: h2.F, assessment: h2.assessment, panel: dn2.panel, corpusSet: dn2.corpusSet, twinSet: dn2.twinSet, reviewSet: dn2.reviewSet, aggregation: dn2.aggregation,
    llmCapability: cap.capability, llmConfig: cap.llmConfig, runContext: Object.assign({ artifactRegistry: h2.registry }, h2.ctx), ledger: h2.ledger, registry: h2.registry });
  assert.equal(q.status, "NOT_QUALIFIED"); assert.ok(q.failedCriteria.includes("reviews_complete"));
});

/* ===================== v0.2 — NORMALISATION (mandat §9 : 1-4) ===================== */
const TN = M11.targetNormalizer, RE = M11.reviewEnforcer, CE = M11.coverageEnforcer, SG = M11.runSealGuard, RU = M11.llmResponseReuse;
const TYPO = "Passage un du document cible synth\u00e9tique : l\u2019absence de r\u00e9ponse ne vaut pas r\u00e9ponse n\u00e9gative. Passage deux, \u00ab cit\u00e9 \u00bb.";
test("T31 U+2019 dans le document, U+0027 dans la citation -> meme validation (normalisation a l'ingestion, EF-03B gele inchange)", async () => {
  const { h, r } = await full("domainA");
  const { makeDownstreamFakeLlm } = require("./harness.js");
  const llm = makeDownstreamFakeLlm({ reviewTamper: "ascii_apostrophe" });
  const dn = await h.runDownstream(r, { downstreamLlm: llm, llmCall: llm, targetContent: TYPO });
  assert.equal(dn.reviewSet.summary.reviewsError, 0, "la citation ASCII est acceptee parce que le document a ete normalise");
  assert.ok(dn.enforcementTraces.reviews.every((t) => t.acceptedPass === 1), "aucune reprise necessaire");
  /* contre-preuve : sans normalisation, le validateur gele refuse la citation ASCII contre le document U+2019 */
  const twin = dn.twinSet.twins[0]; const docRaw = { targetId: "target-01", role: "review_target_not_evidence", content: TYPO };
  const bad = JSON.stringify({ findings: dn.reviewSchema.dimensions.map((d) => ({ dimensionId: d.id, disposition: "concern", epistemicStatus: "not_determinable", finding: "x", rationale: "x", targetEvidenceRefs: ["l'absence de r\u00e9ponse"], twinBasisWorkRefs: [], confidenceQualitative: "low", limitations: [] })) });
  assert.throws(() => h.F.M01.RR.parseReviewResponse(bad, twin, docRaw, dn.reviewSchema), /targetEvidenceRef absent/);
  assert.equal(RE.validateReviewCandidate(bad, twin, docRaw, dn.reviewSchema).ok, false);
});
test("T32 original conserve, normalise hache, provenance verifiable, deterministe et idempotent", () => {
  const a = TN.normalizeTargetDocument({ targetId: "t", content: TYPO }), b = TN.normalizeTargetDocument({ targetId: "t", content: TYPO });
  assert.equal(a.record.original, TYPO); assert.equal(a.record.normalized.indexOf("\u2019"), -1); assert.ok(a.record.normalized.indexOf("l'absence") !== -1);
  assert.equal(a.record.normalizedSha256, b.record.normalizedSha256); assert.equal(a.record.originalSha256, crypto.createHash("sha256").update(TYPO, "utf8").digest("hex"));
  assert.equal(TN.normalizeText(a.record.normalized).normalized, a.record.normalized, "idempotent");
  assert.ok(a.record.transformations.find((t) => t.rule === "APOSTROPHE").occurrences === 1);
  assert.equal(a.record.normalized.indexOf("\u00ab"), a.record.original.indexOf("\u00ab"), "les guillemets francais ne sont pas touches");
  assert.equal(TN.verifyNormalizationRecord(a.record).valid, true);
  assert.equal(a.document.sourceDocumentRef, a.record.originalSha256); assert.ok(a.document.provenance.indexOf(a.record.normalizedSha256) !== -1);
});
test("T33 mutation du normaliseur detectee : texte normalise altere, ou regle qui changerait un mot", () => {
  const a = TN.normalizeTargetDocument({ targetId: "t", content: TYPO });
  const tampered = Object.assign({}, a.record, { normalized: a.record.normalized.replace("n\u00e9gative", "positive") });
  const v = TN.verifyNormalizationRecord(tampered); assert.equal(v.valid, false); assert.ok(v.problems.some((p) => /normalizedSha256/.test(p)));
  const tampered2 = Object.assign({}, a.record, { normalized: a.record.normalized + " " });
  assert.equal(TN.verifyNormalizationRecord(tampered2).valid, false);
  /* un mutant qui remplacerait un MOT serait une modification semantique : la longueur des regles est fermee et aucune ne contient de lettre */
  TN.RULES.forEach((r) => { if (r.re) assert.equal(/[a-zA-Z\u00C0-\u024F]/.test(r.re.source.replace(/\\u[0-9A-F]{4}|\\[rnt]/g, "")), false, "regle sans lettre : " + r.id); });
});

/* ===================== v0.2 — ENFORCEMENT EF-03B (5-9) ===================== */
test("T34 dimension dupliquee / cle additionnelle / cardinalite / enumeration -> FAIL local avant EF-03B", async () => {
  const { h, r } = await full("domainA"); const dn = await h.runDownstream(r);
  const twin = dn.twinSet.twins[0], doc = dn.targetDocumentSet.documents[0], sch = dn.reviewSchema;
  const ok = (over) => { const f = sch.dimensions.map((d) => ({ dimensionId: d.id, disposition: "concern", epistemicStatus: "not_determinable", finding: "x", rationale: "x", targetEvidenceRefs: [], twinBasisWorkRefs: [], confidenceQualitative: "low", limitations: [] })); return over ? over(f) : f; };
  assert.equal(RE.validateReviewCandidate(JSON.stringify({ findings: ok() }), twin, doc, sch).ok, true);
  const codes = (findings, root) => RE.validateReviewCandidate(JSON.stringify(Object.assign({ findings }, root || {})), twin, doc, sch).errors.map((e) => e.code);
  assert.ok(codes(ok((f) => f.concat([f[0]]))).includes("DIMENSION_DUPLICATE"));
  assert.ok(codes(ok((f) => { f[0].extra = 1; return f; })).includes("EXTRA_KEY"));
  assert.ok(codes(ok(), { autre: 1 }).includes("EXTRA_KEY"));
  assert.ok(codes(ok((f) => f.slice(1))).includes("CARDINALITY") && codes(ok((f) => f.slice(1))).includes("DIMENSION_MISSING"));
  assert.ok(codes(ok((f) => { f[0].disposition = "cautious_inference"; return f; })).includes("ENUM_DISPOSITION"));
  assert.ok(codes(ok((f) => { f[0].epistemicStatus = "documented"; return f; })).includes("DOCUMENTED_WITHOUT_TWIN_REF"));
  assert.ok(codes(ok((f) => { f[0].targetEvidenceRefs = ["passage invente"]; return f; })).includes("TARGET_REF_NOT_LITERAL"));
  assert.ok(codes(ok((f) => { f[0].twinBasisWorkRefs = ["oeuvre inconnue"]; return f; })).includes("TWIN_REF_UNKNOWN"));
});
test("T35 revue reparee valide -> EF-03B PASS ; refus persistant -> erreur, jamais forcee (fabrication maintenue)", async () => {
  const { makeDownstreamFakeLlm } = require("./harness.js");
  for (const tamper of ["extra_key", "bad_disposition"]) {
    const { h, r } = await full("domainA");
    const llm = makeDownstreamFakeLlm({ reviewTamper: tamper });
    const dn = await h.runDownstream(r, { downstreamLlm: llm, llmCall: llm });
    assert.equal(dn.reviewSet.summary.reviewsError, 0, tamper);
    assert.ok(dn.reviewSet.reviews.every((x) => x.enforcement.validatedBy.indexOf("EF-03B") !== -1));
  }
  const { h: h2, r: r2 } = await full("domainA");
  const llm2 = makeDownstreamFakeLlm({ reviewTamper: "invented_ref_forever" });
  const dn2 = await h2.runDownstream(r2, { downstreamLlm: llm2, llmCall: llm2 });
  assert.equal(dn2.reviewSet.summary.reviewsComplete, 0);
  dn2.enforcementTraces.reviews.forEach((t) => { assert.equal(t.acceptedPass, null); assert.equal(t.passes.length, 3); assert.ok(t.passes.every((p) => p.errorCodes.includes("TARGET_REF_NOT_LITERAL"))); });
});

/* ===================== v0.2 — ENFORCEMENT EF-02D3 (10-12) ===================== */
test("T36 theme cite comme oeuvre -> FAIL local ; workRef absent -> FAIL ; titre/DOI exact -> PASS ; reprise informee corrige", async () => {
  const { h, r } = await full("domainA");
  const corpus = r.corpusSetAll.professionalCorpora.find((c) => c.professionalRef.endsWith("/A-ok"));
  const dims = h.dimensionSet, L = h.F.M01.D3.LEVELS;
  const mk = (ev) => JSON.stringify({ professionalRef: corpus.professionalRef, dimensions: dims.dimensions.map((d, i) => ({ id: d.id, level: i === 0 ? "strong" : "absent", evidenceWorks: i === 0 ? ev : [], rationale: "x", contradictionWithMissing: false })), overallNote: "" });
  const codes = (t) => CE.validateCoverageCandidate(t, corpus, dims, L).errors.map((e) => e.code);
  assert.ok(codes(mk(["theme-A1"])).includes("THEME_LABEL_AS_WORK"));
  assert.ok(codes(mk(["Oeuvre qui n'existe pas"])).includes("WORKREF_UNRESOLVED"));
  assert.equal(CE.validateCoverageCandidate(mk([corpus.corpus.works[0].title]), corpus, dims, L).ok, true);
  assert.equal(CE.validateCoverageCandidate(mk([corpus.corpus.works[0].doi]), corpus, dims, L).ok, true);
  const { makeDownstreamFakeLlm } = require("./harness.js");
  const llm = makeDownstreamFakeLlm({ coverageTamper: "topic_as_work" });
  const dn = await h.runDownstream(r, { downstreamLlm: llm, llmCall: llm });
  const t = dn.enforcementTraces.coverage.find((x) => x.passes.length === 2);
  assert.ok(t && t.passes[0].errorCodes.includes("THEME_LABEL_AS_WORK") && t.acceptedPass === 2, "la couverture est reprise avec les references admissibles");
  assert.equal(dn.twinSet.blocked.length, 0, "aucun admis bloque par une couverture invalide");
  assert.equal(h.F.M01.D3.buildCoverageMatrix.toString().indexOf("MONO-11"), -1, "EF-02D3 gele n'est pas touche");
});

/* ===================== v0.2 — SCELLEMENT AVANT RUN (13-15) ===================== */
test("T37 code non scelle -> FAIL ; fichier scelle modifie -> FAIL ; sceau valide -> PASS avec hashes", () => {
  const os = require("os"); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m11-seal-"));
  const LOT = path.resolve(__dirname, "..");
  fs.cpSync(LOT, tmp, { recursive: true, filter: (src) => !/SHA256SUMS\.txt$|MANIFEST\.json$/.test(src) });
  assert.throws(() => SG.assertSealedRuntime({ lotDir: tmp }), /RUN_ON_UNSEALED_CODE.*aucun SHA256SUMS/);
  /* sceau construit sur la copie */
  const sealTool = require("child_process").spawnSync("node", [path.join(tmp, "tools", "seal.js")], { encoding: "utf8" }); assert.equal(sealTool.status, 0);
  fs.writeFileSync(path.join(tmp, "MANIFEST.json"), JSON.stringify({ version: "v0.2" }));
  const ok = SG.assertSealedRuntime({ lotDir: tmp, expectedVersion: "v0.2" });
  assert.equal(ok.sealed, true); assert.match(ok.runtimeSealSha256, /^[0-9a-f]{64}$/); assert.match(ok.runCodeHash, /^[0-9a-f]{64}$/); assert.match(ok.mono11ManifestSha256, /^[0-9a-f]{64}$/);
  fs.appendFileSync(path.join(tmp, "core", "machine-evidence-gate.js"), "\n// mutation\n");
  assert.throws(() => SG.assertSealedRuntime({ lotDir: tmp }), /RUN_ON_UNSEALED_CODE.*modifie/);
  fs.writeFileSync(path.join(tmp, "core", "unsealed-extra.js"), "module.exports = 1;\n");
  assert.throws(() => SG.assertSealedRuntime({ lotDir: tmp }), /NON scelle/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ===================== v0.2 — POLITIQUE DE REUSE (16-19) ===================== */
test("T38 reponse reelle VALID existante -> reuse ; reuse != REAL_LLM_CALL ; INVALID -> retry reel ; prompt different -> pas de reuse", () => {
  const store = RU.createMemoryStore(); const P = RU.createReusePolicy({ store });
  const prompt = "prompt A"; const resp = "reponse A";
  assert.equal(P.decide(prompt).decision, "REAL_CALL");
  const rec = P.recordReal({ promptSha256: P.sha(prompt), responseSha256: P.sha(resp), sourceRunId: "run-1", sourceCallId: "msg_1", providerRequestId: "msg_1", providerId: "p", modelId: "m", completedAt: "2026-01-01T00:00:00Z", httpStatus: 200 });
  assert.equal(P.decide(prompt).decision, "RETRY_REAL", "UNKNOWN (jamais validee) n'est pas reutilisee en silence");
  P.markValidation({ responseSha256: P.sha(resp), valid: true, stage: "EF-03B-local" });
  const d = P.decide(prompt); assert.equal(d.decision, "REUSE_VALID"); assert.equal(d.entry.sourceCallId, "msg_1");
  const rr = P.reuseRecord(d.entry, { runId: "run-2", reason: d.reason });
  assert.equal(rr.kind, "LLM_REUSE"); assert.equal(rr.countsAsRealCall, false);
  ["sourceRunId", "sourceCallId", "promptHash", "responseHash", "validationStatus", "reuseReason"].forEach((k) => assert.ok(rr[k], k));
  assert.equal(P.decide("prompt A ").decision, "REAL_CALL", "un octet de difference : aucune reutilisation silencieuse");
  P.markValidation({ responseSha256: P.sha(resp), valid: false, errors: ["SCHEMA"], stage: "EF-03B-local" });
  assert.equal(P.decide(prompt).decision, "RETRY_REAL");
  P.markValidation({ responseSha256: P.sha(resp), valid: true }); assert.equal(P.decide(prompt).decision, "RETRY_REAL", "une reponse refusee une fois reste refusee");
  const resp2 = "reponse B"; P.recordReal({ promptSha256: P.sha(prompt), responseSha256: P.sha(resp2), sourceRunId: "run-2", sourceCallId: "msg_2", completedAt: "2026-01-02T00:00:00Z", httpStatus: 200 });
  P.markValidation({ responseSha256: P.sha(resp2), valid: true }); assert.equal(P.decide(prompt).entry.sourceCallId, "msg_2", "la reponse valide la plus recente est reutilisee");
  const off = RU.createReusePolicy({ store, allowReuse: false }); assert.equal(off.decide(prompt).decision, "REAL_CALL");
});

/* ===================== v0.2 — GARDE reviews_complete = 100 % (20-23), lacune M9 fermee ===================== */
function synthReviewSet(n, complete) {
  const reviews = []; for (let i = 0; i < n; i++) reviews.push({ reviewStatus: i < complete ? "complete" : "error", twinId: "t" + (i % 10), targetId: "target-0" + (Math.floor(i / 10) + 1), findings: i < complete ? [{}] : [] });
  return { schema: "EvidenceForge.DocumentaryReviewSet", reviews, unresolvedTargets: [], summary: { twins: 10, targets: n / 10, reviewsExpected: n, reviewsComplete: complete, reviewsError: n - complete } };
}
test("T39 reviews_complete : 100/100 PASS ; 99/100, 90/100, 80/100 FAIL — cardinalite attendue, jamais un nombre en dur", () => {
  const rc = Q.reviewCardinality;
  assert.deepEqual(rc(synthReviewSet(100, 100), null), { accepted: 100, expected: 100, produced: 100 });
  const src = fs.readFileSync(path.join(__dirname, "..", "core", "composed-qualification.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/\b81\b/.test(src), false, "aucune cardinalite en dur");
  assert.equal(/0\.9|0\.8|0\.99|\* ?0\.|Math\.floor\(.*expected/.test(src), false, "aucun ratio de tolerance");
  assert.ok(/rc\.accepted === rc\.expected/.test(src), "la regle est une egalite stricte");
  const F = M11.frozenBridge.loadFrozen({ bundleRoot: bundleRoot() });
  const base = { frozen: F, assessment: { schema: "EvidenceForge.ProfessionalCandidateAssessment", assessments: [{ candidateId: "x" }], unknowns: [] },
    panel: { schema: "EvidenceForge.MachineEvidenceGatePanel", decisions: [{ candidateId: "x", state: "AUTO_APPROVED_FOR_DOCUMENTARY_PANEL", relevanceClass: "SUPPORTED", corpusStatus: "SUFFICIENT", reasonCodes: [], machineActor: { actorType: "machine", actorIdentity: "g" } }], machineActor: { actorType: "machine", actorIdentity: "g" }, reservations: [] },
    corpusSet: { professionalCorpora: [{ professionalRef: "x", status: "complete" }] }, twinSet: { twins: Array.from({ length: 10 }, (_, i) => ({ professionalRef: "x", twinId: "t" + i })) }, aggregation: { aggregates: [{}] }, llmCapability: {} };
  const status = (n, c) => Q.qualifyProcess(Object.assign({}, base, { reviewSet: synthReviewSet(n, c) })).criteria.find((x) => x.criterion === "reviews_complete").pass;
  assert.equal(status(100, 100), true); assert.equal(status(100, 99), false); assert.equal(status(100, 90), false); assert.equal(status(100, 80), false);
  assert.equal(status(30, 30), true); assert.equal(status(30, 29), false, "cardinalite legitimement differente : 100 % de 30");
});
test("T40 mutation : une tolerance 99 % / 90 % / 80 % injectee dans la regle est DETECTEE par T39 (garde M9)", () => {
  const vm = require("vm"); const srcPath = path.join(__dirname, "..", "core", "composed-qualification.js");
  const src = fs.readFileSync(srcPath, "utf8");
  const original = "rc.expected > 0 && rc.accepted === rc.expected";
  assert.ok(src.indexOf(original) !== -1);
  for (const tol of [0.99, 0.9, 0.8]) {
    const mutated = src.split(original).join("rc.expected > 0 && rc.accepted >= " + tol + " * rc.expected");
    const mod = { exports: {} };
    vm.runInThisContext("(function (require, module, exports, __dirname, __filename) {" + mutated + "\n})")(require, mod, mod.exports, path.dirname(srcPath), srcPath);
    const Qm = mod.exports;
    const F = M11.frozenBridge.loadFrozen({ bundleRoot: bundleRoot() });
    const base = { frozen: F, assessment: { schema: "EvidenceForge.ProfessionalCandidateAssessment", assessments: [{ candidateId: "x" }], unknowns: [] },
      panel: { schema: "EvidenceForge.MachineEvidenceGatePanel", decisions: [{ candidateId: "x", state: "AUTO_APPROVED_FOR_DOCUMENTARY_PANEL", relevanceClass: "SUPPORTED", corpusStatus: "SUFFICIENT", reasonCodes: [], machineActor: { actorType: "machine", actorIdentity: "g" } }], machineActor: { actorType: "machine", actorIdentity: "g" }, reservations: [] },
      corpusSet: { professionalCorpora: [{ professionalRef: "x", status: "complete" }] }, twinSet: { twins: Array.from({ length: 10 }, (_, i) => ({ professionalRef: "x", twinId: "t" + i })) }, aggregation: { aggregates: [{}] }, llmCapability: {} };
    const pass99 = Qm.qualifyProcess(Object.assign({}, base, { reviewSet: synthReviewSet(100, 99) })).criteria.find((x) => x.criterion === "reviews_complete").pass;
    assert.equal(pass99, true, "le mutant " + tol + " accepte 99/100 — c'est exactement ce que T39 refuse : la mutation serait detectee");
  }
});

/* ===================== v0.2 — PERSISTANCE DES PREUVES ===================== */
test("T41 le ledger exporte tous les artefacts de preuve (suffisance, pertinence, gate, normalisation, traces) sans secret ; sceau epingle dans l'ancre", async () => {
  const { h, r } = await full("domainA"); const dn = await h.runDownstream(r);
  const all = h.ledger.exportArtifacts();
  const kinds = new Set(Object.values(all).map((e) => e.kind));
  ["corpus-sufficiency", "relevance-evidence", "machine-gate-panel", "coverage-matrix", "twin-set", "review-set", "aggregation", "target-normalization", "enforcement-trace"].forEach((k) => assert.ok(kinds.has(k), k));
  const txt = JSON.stringify(all); assert.equal(/EVIDENCEFORGE_WORKER_API_KEY|sk-ant-|Bearer /.test(txt), false);
  Object.values(all).forEach((e) => assert.equal(h.M10.CANON.artifactHash(e.artifact), e.sha256));
  const led2 = M11.ledger.openMono11Ledger({ manifest: h.manifest, registry: h.registry, RM: h.M10.RM, CANON: h.M10.CANON, sealInfo: { mono11Version: "v0.2", runtimeSealSha256: "a".repeat(64), runCodeHash: "b".repeat(64), mono11ManifestSha256: "c".repeat(64), mono11ZipSha256: "d".repeat(64) } });
  assert.equal(led2.anchor.runtimeSeal.runCodeHash, "b".repeat(64));
});
test("T42 indisponibilite FATALE du fournisseur (credit epuise) -> le run s'arrete fail-closed, aucune passe consommee ; une erreur transitoire consomme une passe", async () => {
  const { h, r } = await full("domainA");
  const { makeDownstreamFakeLlm } = require("./harness.js");
  const base = makeDownstreamFakeLlm();
  const fatal = async (prompt) => { if (prompt.indexOf("EF-03B") !== -1) { const e = new Error("LLM_PROVIDER_CREDIT_EXHAUSTED"); e.fatal = true; throw e; } return base(prompt); };
  await assert.rejects(h.runDownstream(r, { downstreamLlm: fatal, llmCall: fatal }), /LLM_PROVIDER_CREDIT_EXHAUSTED/);
  const { h: h2, r: r2 } = await full("domainA");
  let n = 0; const transient = async (prompt) => { if (prompt.indexOf("EF-03B") !== -1 && n++ === 0) throw new Error("HTTP 503"); return base(prompt); };
  const dn = await h2.runDownstream(r2, { downstreamLlm: transient, llmCall: transient });
  assert.equal(dn.reviewSet.summary.reviewsError, 0);
  const t = dn.enforcementTraces.reviews.find((x) => x.passes[0] && x.passes[0].error); assert.ok(t && t.acceptedPass === 2, "erreur transitoire : passe 1 perdue, passe 2 acceptee");
});

/* ===================== v0.3 — RETRY CIBLE TARGET_REF_NOT_LITERAL (chantier MONO-11 v0.3) ===================== */
const REPLAY = require("../benchmark/replay.js");
/* v0.3-r1 — AUTONOMIE DU PACKAGE (option A) : les invariants "byte-identique a v0.2" sont verifies contre test/fixtures/v0.2-reference.json
   (empreintes SHA-256 des sources de fonctions du lot v0.2 GELE, calculees une fois sur le lot canonique). Le lot v0.2 n'est PAS requis.
   Renforcement OPTIONNEL : si un lot v0.2 est present a cote (../../v0.2), la comparaison vivante est faite en plus. */
const sha256 = (x) => crypto.createHash("sha256").update(String(x), "utf8").digest("hex");
const V02REF = require("./fixtures/v0.2-reference.json");
const V02_LIVE_DIR = path.join(__dirname, "..", "..", "v0.2");
function v02Live() { try { return fs.existsSync(path.join(V02_LIVE_DIR, "core", "review-enforcer.js")) ? require(path.join(V02_LIVE_DIR, "core", "review-enforcer.js")) : null; } catch (e) { return null; } }
function assertByteIdenticalToV02(fnName) {
  assert.equal(sha256(RE[fnName].toString()), V02REF.functionSourceSha256[fnName], fnName + " : source byte-identique a la reference v0.2 gelee");
  const live = v02Live(); if (live) assert.equal(live[fnName].toString(), RE[fnName].toString(), fnName + " : comparaison vivante avec ../../v0.2 (renforcement optionnel)");
  return live;
}
const DOC3 = "Premiere phrase du document cible synthetique, avec un passage exact a citer. Seconde phrase, distincte, qui contient un autre passage citable pour la revue.";
async function reviewContext() {
  const { h, r } = await full("domainA");
  const { makeDownstreamFakeLlm } = require("./harness.js");
  const llm = makeDownstreamFakeLlm({});
  const dn = await h.runDownstream(r, { downstreamLlm: llm, llmCall: llm, targetContent: DOC3 });
  const twin = dn.twinSet.twins[0]; const doc = { targetId: "target-01", role: "review_target_not_evidence", content: DOC3 }; const schema = dn.reviewSchema;
  const dims = schema.dimensions.map((d) => d.id); const work = twin.documentaryBasis.worksUsed[0] ? twin.documentaryBasis.worksUsed[0].workRef : null;
  const validFindings = () => dims.map((id) => ({ dimensionId: id, disposition: "concern", epistemicStatus: work ? "documented" : "not_determinable", finding: "constat " + id, rationale: "r", targetEvidenceRefs: ["passage exact a citer"], twinBasisWorkRefs: work ? [work] : [], confidenceQualitative: "low", limitations: [] }));
  return { F: h.F, twin, doc, schema, dims, work, validFindings };
}
const SPLICE = "Premiere phrase du document cible synthetique passage citable pour la revue";   /* jonction de 2 fragments non contigus */
function scripted(responses) { const calls = []; return { calls, llmCall: async (prompt, meta) => { calls.push({ prompt, meta }); const r = responses[Math.min(calls.length - 1, responses.length - 1)]; return { text: typeof r === "function" ? r(prompt, calls.length) : r, callId: "c" + calls.length }; } }; }

test("T1 (v0.3) citation valide en passe 1 : aucune reprise, sortie identique a v0.2 (strategie BASE, acceptedPass 1)", async () => {
  const c = await reviewContext(); const s = scripted([JSON.stringify({ findings: c.validFindings() })]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  assert.equal(r.review.reviewStatus, "complete"); assert.equal(r.trace.acceptedPass, 1); assert.equal(s.calls.length, 1); assert.equal(r.trace.passes[0].strategy, RE.STRATEGY.BASE);
  assert.ok(s.calls[0].prompt.indexOf("EF-03B") !== -1 && s.calls[0].prompt.indexOf("CONTRAT DE FORME") !== -1, "passe 1 = prompt gele + preambule, inchange");
  assert.equal(r.review.findings.length, c.dims.length);
});
test("T2 (v0.3) citation non litterale simple : passe 1 refusee, passe 2 CIBLEE (schema {repairs}), correction acceptee ; validateur gele EF-03B accepte", async () => {
  const c = await reviewContext(); const bad = c.validFindings(); bad[1].targetEvidenceRefs = ["passage reformule qui n'existe pas"];
  const s = scripted([JSON.stringify({ findings: bad }), JSON.stringify({ repairs: [{ dimensionId: c.dims[1], targetEvidenceRefs: ["autre passage citable"] }] })]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  assert.equal(r.review.reviewStatus, "complete"); assert.equal(r.trace.acceptedPass, 2); assert.equal(r.trace.passes[1].strategy, RE.STRATEGY.TARGETED);
  const p2 = s.calls[1].prompt; assert.ok(p2.indexOf("REPRISE CIBLEE (passe 2)") === 0 && p2.indexOf("dimension " + c.dims[1] + " — champ targetEvidenceRefs") !== -1 && p2.indexOf("citation(s) rejetee(s) : [\"passage reformule qui n'existe pas\"]") !== -1);
  assert.ok(/SOUS-CHAINE CONTIGUE/.test(p2) && /caractere pour caractere/.test(p2) && /aucune paraphrase/.test(p2) && /aucune fusion de deux fragments/.test(p2) && /aucune reconstruction de phrase/.test(p2) && /rendez \[\]/.test(p2) && p2.indexOf(DOC3) !== -1 && /UNIQUEMENT cet objet JSON/.test(p2) && /\{"repairs":\[/.test(p2));
  assert.equal(p2.indexOf(JSON.stringify({ findings: bad })), -1, "la reponse fautive n'est pas reinjectee integralement");
  assert.deepEqual(r.review.findings.find((f) => f.dimensionId === c.dims[1]).targetEvidenceRefs, ["autre passage citable"]);
  assert.equal(r.trace.passes[1].targetedDimensions.join(), c.dims[1]);
});
test("T3 (v0.3) collage de deux fragments non contigus : fragments detectes, transmis au feedback, JAMAIS substitues automatiquement", async () => {
  const c = await reviewContext(); const bad = c.validFindings(); bad[0].targetEvidenceRefs = [SPLICE];
  const f = RE.literalFragments(SPLICE, DOC3); assert.equal(f.literal, false); assert.equal(f.fragments.length, 2); assert.equal(f.fragments[0].text, "Premiere phrase du document cible synthetique"); assert.equal(f.fragments[1].text, " passage citable pour la revue"); assert.equal(f.contiguous, false);
  const s = scripted([JSON.stringify({ findings: bad }), JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: ["Premiere phrase du document cible synthetique"] }] })]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  const p2 = s.calls[1].prompt; assert.ok(/JOINT 2 fragments qui existent SEPAREMENT et NE SONT PAS CONTIGUS/.test(p2) && p2.indexOf('"Premiere phrase du document cible synthetique" + " passage citable pour la revue"') !== -1);
  assert.deepEqual(r.trace.passes[1].proposedFragments[0].refs[0].fragments, ["Premiere phrase du document cible synthetique", " passage citable pour la revue"]);
  /* aucune substitution automatique : sans reponse du modele, la citation collee reste refusee */
  const s2 = scripted([JSON.stringify({ findings: bad }), "{\"repairs\":[]}", "{\"repairs\":[]}"]);
  const r2 = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s2.llmCall, maxPasses: 3 });
  assert.equal(r2.review.reviewStatus, "error"); assert.equal(r.review.reviewStatus, "complete");
});
test("T4 (v0.3) aucune citation valide : le modele rend [] pour la dimension fautive -> conforme au contrat (accepte par le validateur inchange)", async () => {
  const c = await reviewContext(); const bad = c.validFindings(); bad[2].targetEvidenceRefs = ["citation inventee"];
  const s = scripted([JSON.stringify({ findings: bad }), JSON.stringify({ repairs: [{ dimensionId: c.dims[2], targetEvidenceRefs: [] }] })]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  assert.equal(r.review.reviewStatus, "complete"); assert.deepEqual(r.review.findings.find((f) => f.dimensionId === c.dims[2]).targetEvidenceRefs, []);
});
test("T5 (v0.3) reprise byte-identique : EXACT_RETRY_REPEAT detecte et journalise (hash precedent, hash courant, exactRepeat)", async () => {
  const c = await reviewContext(); const bad = c.validFindings(); bad[0].targetEvidenceRefs = [SPLICE]; const badRepair = JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [SPLICE] }] });
  const s = scripted([JSON.stringify({ findings: bad }), badRepair, badRepair]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  assert.equal(r.review.reviewStatus, "error"); const p3 = r.trace.passes[2]; assert.equal(p3.exactRepeat, true); assert.equal(p3.event, "EXACT_RETRY_REPEAT"); assert.equal(p3.previousResponseSha256, r.trace.passes[1].rawResponseSha256); assert.equal(p3.rawResponseSha256, r.trace.passes[1].rawResponseSha256);
  assert.equal(r.trace.passes[1].exactRepeat, false);
});
test("T6 (v0.3) PASSE 3 differente : apres un echec cible, la passe 3 est un CHANGEMENT DE STRATEGIE explicite (prompt different, rejet et repetition signales, citations fautives interdites, nouvelle extraction, repli [])", async () => {
  const c = await reviewContext(); const bad = c.validFindings(); bad[0].targetEvidenceRefs = [SPLICE]; const badRepair = JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [SPLICE] }] });
  const s = scripted([JSON.stringify({ findings: bad }), badRepair, JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: ["Seconde phrase, distincte"] }] })]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  assert.equal(r.review.reviewStatus, "complete"); assert.equal(r.trace.acceptedPass, 3); assert.equal(r.trace.passes[2].strategy, RE.STRATEGY.TARGETED_CHANGE);
  const p2 = s.calls[1].prompt, p3 = s.calls[2].prompt; assert.notEqual(p2, p3); assert.ok(p3.indexOf("REPRISE CIBLEE — CHANGEMENT DE STRATEGIE (passe 3)") === 0 && /REPRODUISAIT A L'IDENTIQUE/.test(p3) && /INTERDIT de reutiliser textuellement/.test(p3) && /NOUVELLE EXTRACTION/.test(p3) && /rendez \[\]/.test(p3));
  assert.equal(r.trace.passes[2].repeatedFaultyRef, true, "la passe 2 avait resoumis la citation fautive : signale a la passe 3"); assert.equal(r.trace.passes[1].exactRepeat, false, "une reponse de reparation n'est pas byte-identique a la revue complete de la passe 1");
});
test("T7 (v0.3) troisieme repetition interdite : apres une repetition exacte en changement de strategie, aucune passe supplementaire identique (fail-closed, meme si maxPasses le permettrait)", async () => {
  const c = await reviewContext(); const bad = c.validFindings(); bad[0].targetEvidenceRefs = [SPLICE]; const badRepair = JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [SPLICE] }] });
  const s = scripted([JSON.stringify({ findings: bad }), badRepair, badRepair, badRepair, badRepair]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 5 });
  assert.equal(r.review.reviewStatus, "error"); assert.equal(s.calls.length, 3, "3 appels : base, cible, changement de strategie ; la 4e passe identique est interdite"); assert.ok(/fail-closed/.test(r.trace.failClosedReason || ""));
  /* autres codes : reprise v0.2 ; une repetition exacte => pas de 3e passe identique */
  const dup = c.validFindings(); dup.push(Object.assign({}, dup[0])); const s2 = scripted([JSON.stringify({ findings: dup }), JSON.stringify({ findings: dup }), JSON.stringify({ findings: dup })]);
  const r2 = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s2.llmCall, maxPasses: 3 });
  assert.equal(r2.review.reviewStatus, "error"); assert.equal(s2.calls.length, 2); assert.equal(r2.trace.passes[1].exactRepeat, true); assert.ok(/EXACT_RETRY_REPEAT/.test(r2.trace.failClosedReason));
});
test("T8 (v0.3) fail-closed final : aucune citation valide apres la politique bornee -> revue rejetee, jamais un SUCCESS artificiel", async () => {
  const c = await reviewContext(); const bad = c.validFindings(); bad[0].targetEvidenceRefs = [SPLICE];
  const s = scripted([JSON.stringify({ findings: bad }), JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: ["encore un collage inexistant"] }] }), JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: ["troisieme citation absente"] }] })]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  assert.equal(r.review.reviewStatus, "error"); assert.equal(r.review.findings.length, 0); assert.equal(r.trace.acceptedPass, null); assert.equal(s.calls.length, 3); assert.ok(r.trace.passes.every((p) => p.valid === false));
});
test("T9 (v0.3) validateur inchange : le meme corpus de citations invalides est refuse par validateReviewCandidate v0.2 et v0.3 (byte-identite de la fonction) ; TARGET_REF_NOT_LITERAL reste TARGET_REF_NOT_LITERAL", async () => {
  const c = await reviewContext(); ["validateReviewCandidate", "extractJson", "enforcementPreamble"].forEach(assertByteIdenticalToV02); const v02 = v02Live();
  assert.deepEqual(RE.FINDING_KEYS, V02REF.constants.FINDING_KEYS); assert.equal(RE.DEFAULT_MAX_PASSES, V02REF.constants.DEFAULT_MAX_PASSES);
  const corpus = [SPLICE, "citation inventee", "Premiere phrase du document cible synthetique passage", "premiere phrase du document cible synthetique", "Premiere  phrase du document", ""];
  corpus.forEach((ref) => { const f = c.validFindings(); f[0].targetEvidenceRefs = [ref]; const t = JSON.stringify({ findings: f }); const b = RE.validateReviewCandidate(t, c.twin, c.doc, c.schema); assert.equal(b.ok, false); assert.ok(b.errors.some((e) => e.code === "TARGET_REF_NOT_LITERAL")); if (v02) { const a = v02.validateReviewCandidate(t, c.twin, c.doc, c.schema); assert.equal(a.ok, false); assert.deepEqual(a.errors, b.errors); } });
  const ok = JSON.stringify({ findings: c.validFindings() }); assert.equal(RE.validateReviewCandidate(ok, c.twin, c.doc, c.schema).ok, true); if (v02) assert.equal(v02.validateReviewCandidate(ok, c.twin, c.doc, c.schema).ok, true);
});
test("T10 (v0.3) reponse partiellement valide : seul le champ fautif est repare ; les autres champs et dimensions sont preserves a l'identique", async () => {
  const c = await reviewContext(); const bad = c.validFindings(); const last = bad.length - 1; assert.ok(last >= 1); bad[1 % bad.length].targetEvidenceRefs = [SPLICE]; bad[last].finding = "constat specifique a preserver"; bad[last].limitations = ["limite specifique"]; const faulty = c.dims[1 % bad.length];
  const s = scripted([JSON.stringify({ findings: bad }), JSON.stringify({ repairs: [{ dimensionId: faulty, targetEvidenceRefs: ["autre passage citable"] }], extra: 1 }), JSON.stringify({ repairs: [{ dimensionId: faulty, targetEvidenceRefs: ["autre passage citable"] }] })]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  assert.equal(r.review.reviewStatus, "complete"); assert.equal(r.trace.acceptedPass, 3, "la reparation avec cle non prevue est refusee (schema ferme), la suivante acceptee");
  assert.ok(r.trace.passes[1].repair && r.trace.passes[1].repair.parsed === false && r.trace.passes[1].errorCodes.includes("REPAIR_SCHEMA_INVALID"));
  const f3 = r.review.findings.find((f) => f.dimensionId === c.dims[last]); assert.equal(f3.finding, "constat specifique a preserver"); assert.deepEqual(f3.limitations, ["limite specifique"]);
  c.dims.forEach((d) => { if (d !== faulty) assert.deepEqual(r.review.findings.find((f) => f.dimensionId === d).targetEvidenceRefs, ["passage exact a citer"]); }); assert.deepEqual(r.review.findings.find((f) => f.dimensionId === faulty).targetEvidenceRefs, ["autre passage citable"]);
});
test("T11 (v0.3) lineage : chaque passe journalise strategie, codes precedents, hash precedent, hash courant, exactRepeat, dimensions ciblees, fragments proposes, resultat", async () => {
  const c = await reviewContext(); const bad = c.validFindings(); bad[0].targetEvidenceRefs = [SPLICE];
  const s = scripted([JSON.stringify({ findings: bad }), JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: ["Seconde phrase, distincte"] }] })]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  const [p1, p2] = r.trace.passes; ["pass", "strategy", "previousErrorCodes", "previousResponseSha256", "responseSha256", "rawResponseSha256", "exactRepeat", "targetedDimensions", "proposedFragments", "valid", "errors", "errorCodes", "promptSha256"].forEach((k) => { assert.ok(k in p1 && k in p2, "cle " + k); });
  assert.equal(p2.previousResponseSha256, p1.rawResponseSha256); assert.deepEqual(p2.previousErrorCodes, ["TARGET_REF_NOT_LITERAL"]); assert.equal(p2.proposedFragments[0].refs[0].fragments.length, 2); assert.deepEqual(r.review.enforcement.strategies, [RE.STRATEGY.BASE, RE.STRATEGY.TARGETED]);
});
test("T12 (v0.3) erreurs autres que TARGET_REF_NOT_LITERAL : comportement v0.2 conserve (reprise informee, meme prompt informedRepairPrompt) ; mixte (TARGET_REF + autre) : v0.2 aussi", async () => {
  const c = await reviewContext(); assertByteIdenticalToV02("informedRepairPrompt");
  const dup = c.validFindings(); dup.push(Object.assign({}, dup[0])); const s = scripted([JSON.stringify({ findings: dup }), JSON.stringify({ findings: c.validFindings() })]);
  const r = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s.llmCall, maxPasses: 3 });
  assert.equal(r.review.reviewStatus, "complete"); assert.equal(r.trace.passes[1].strategy, RE.STRATEGY.INFORMED); assert.ok(s.calls[1].prompt.indexOf("REPRISE (passe 2)") === 0 && /VOTRE REPONSE PRECEDENTE/.test(s.calls[1].prompt));
  const mixed = c.validFindings(); mixed[0].targetEvidenceRefs = [SPLICE]; mixed[1].disposition = "invalide"; const s2 = scripted([JSON.stringify({ findings: mixed }), JSON.stringify({ findings: c.validFindings() })]);
  const r2 = await RE.runEnforcedReview({ frozen: c.F, twin: c.twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: s2.llmCall, maxPasses: 3 }); assert.equal(r2.trace.passes[1].strategy, RE.STRATEGY.INFORMED); assert.equal(r2.review.reviewStatus, "complete");
});

/* ===================== v0.3 — REGRESSION SUR CAS REELS (benchmark/fixtures, rejeu deterministe, aucun appel) ===================== */
test("R1 (v0.3) cas reel A (3 passes identiques) : collage detecte (2 fragments non contigus), feedback cible construit, repetitions exactes des passes 2/3 detectees ; v0.3 n'emet jamais deux prompts identiques", () => {
  const rr = REPLAY.run(); const r1 = rr.rows.find((x) => x.id === "R1"); assert.ok(r1);
  assert.deepEqual(r1.passes.map((p) => p.codes), [["TARGET_REF_NOT_LITERAL"], ["TARGET_REF_NOT_LITERAL"], ["TARGET_REF_NOT_LITERAL"]]);
  assert.deepEqual(r1.passes.map((p) => p.exactRepeat), [false, true, true], "passes 2 et 3 = repetitions exactes");
  const fr = r1.passes[0].fragments; const dim = Object.keys(fr)[0]; assert.equal(fr[dim][0].literal, false); assert.equal(fr[dim][0].fragments.length, 2); assert.equal(fr[dim][0].coverage, 1);
  assert.ok(r1.targetedPromptPass2 && r1.targetedPromptPass2.mentionsFragments && r1.targetedPromptPass2.mentionsEmptyFallback && r1.targetedPromptPass2.containsDocument && r1.targetedPromptPass2.reinjectsFullPreviousResponse === false);
  /* rejeu du moteur v0.3 avec, en reponse aux prompts cibles, la reponse historique identique (recopie) : les prompts 2 et 3 different, la repetition est detectee, aucun 4e appel */
  const fx = REPLAY.load().find((f) => f.id === "R1"); const schema = { schema: "EvidenceForge.ReviewSchema", dimensions: fx.dimensions.map((id) => ({ id })) };
  return (async () => { const F = require("../core/frozen-bridge.js").loadFrozen({ bundleRoot: bundleRoot() }); const s = scripted([fx.passes[0].responseText, fx.passes[1].responseText, fx.passes[2].responseText, fx.passes[2].responseText]);
    const r = await RE.runEnforcedReview({ frozen: F, twin: fx.twin, targetDoc: fx.document, reviewSchema: schema, llmCall: s.llmCall, maxPasses: 4 });
    assert.equal(r.review.reviewStatus, "error"); assert.notEqual(s.calls[1].prompt, s.calls[2].prompt); assert.equal(s.calls.length, 3, "passe 4 refusee : repetition exacte apres changement de strategie"); assert.equal(r.trace.passes[2].exactRepeat, true); assert.ok(/fail-closed/.test(r.trace.failClosedReason)); })();
});
test("R2 (v0.3) cas reel B (corrige au retry) : la correction historique, rejouee comme reparation ciblee recomposee sur la passe 1, est ACCEPTEE par le validateur inchange puis par EF-03B gele", async () => {
  const rr = REPLAY.run(); const r2 = rr.rows.find((x) => x.id === "R2"); assert.ok(r2.historicalCorrectionAsTargetedRepair && r2.historicalCorrectionAsTargetedRepair.accepted === true, JSON.stringify(r2.historicalCorrectionAsTargetedRepair));
  const fx = REPLAY.load().find((f) => f.id === "R2"); const schema = { schema: "EvidenceForge.ReviewSchema", dimensions: fx.dimensions.map((id) => ({ id })) }; const F = require("../core/frozen-bridge.js").loadFrozen({ bundleRoot: bundleRoot() });
  const v1 = RE.validateReviewCandidate(fx.passes[0].responseText, fx.twin, fx.document, schema); const dims = RE.faultyDimensions(v1.errors); const pv = RE.validateReviewCandidate(fx.passes[1].responseText, fx.twin, fx.document, schema).parsed;
  const repairText = JSON.stringify({ repairs: dims.map((d) => ({ dimensionId: d, targetEvidenceRefs: pv.findings.find((f) => f.dimensionId === d).targetEvidenceRefs })) });
  const s = scripted([fx.passes[0].responseText, repairText]); const r = await RE.runEnforcedReview({ frozen: F, twin: fx.twin, targetDoc: fx.document, reviewSchema: schema, llmCall: s.llmCall, maxPasses: 3 });
  assert.equal(r.review.reviewStatus, "complete"); assert.equal(r.trace.acceptedPass, 2); assert.equal(r.trace.passes[1].strategy, RE.STRATEGY.TARGETED); assert.equal(r.review.findings.length, fx.dimensions.length);
});
test("R3 (v0.3) 12 occurrences historiques TARGET_REF_NOT_LITERAL rejouees : 12 collages detectes, 5 repetitions exactes, 5 sequences eligibles a la reparation ciblee, 0 fausse acceptation, 0 regression, 2 corrections historiques acceptees par recomposition ; matrice differentielle v0.2/v0.3 : memes verdicts", () => {
  const rr = REPLAY.run(); const s = rr.summary;
  assert.equal(s.occurrencesTargetRef, 12); assert.equal(s.splices, 12); assert.equal(s.inventions, 0); assert.equal(s.exactRepeatsDetected, 5); assert.equal(s.targetedEligibleSequences, 5); assert.equal(s.falseAcceptances, 0); assert.equal(s.regressions, 0); assert.equal(s.historicalCorrectionAcceptedByRecomposition, 2);
  rr.rows.forEach((row) => row.passes.forEach((p) => assert.equal(p.sameVerdict, true, row.id + " passe " + p.pass)));
  /* matrice differentielle : le verdict historique (rendu par le runtime v0.2 reel, consigne dans chaque fixture : p.valid) == verdict rejoue par v0.3-r1 (sameVerdict ci-dessus) ; validateur byte-identique a la reference v0.2 */
  const v02 = assertByteIdenticalToV02("validateReviewCandidate"); if (v02) REPLAY.load().forEach((fx) => { const schema = { schema: "EvidenceForge.ReviewSchema", dimensions: fx.dimensions.map((id) => ({ id })) }; fx.passes.forEach((p) => { assert.equal(v02.validateReviewCandidate(p.responseText, fx.twin, fx.document, schema).ok, RE.validateReviewCandidate(p.responseText, fx.twin, fx.document, schema).ok); }); });
  assert.equal(s.targetedPromptCollisions, 0); assert.equal(s.distinctRepairContexts, s.targetedPromptsBuilt);   /* v0.3-r1 */
});

/* ===================== v0.3-r1 — REPAIR REUSE = SAME SEMANTIC CONTEXT ONLY (micro-correctif pre-gel) ===================== */
const Q_A = "Premiere phrase du document cible synthetique, avec un passage exact a citer";   /* litteral ; pertinent pour un constat sur la PREMIERE phrase */
const Q_B = "Seconde phrase, distincte, qui contient un autre passage citable pour la revue";   /* litteral ; pertinent pour un constat sur la SECONDE phrase */
/** deux jumeaux distincts du meme run synthetique, meme document, meme schema */
async function twoTwinContext() {
  const { h, r } = await full("domainA"); const { makeDownstreamFakeLlm } = require("./harness.js"); const llm = makeDownstreamFakeLlm({});
  const dn = await h.runDownstream(r, { downstreamLlm: llm, llmCall: llm, targetContent: DOC3 });
  const twins = dn.twinSet.twins.filter((t) => !t.retracted); assert.ok(twins.length >= 2, "au moins deux jumeaux distincts"); assert.notEqual(twins[0].twinId, twins[1].twinId);
  const doc = { targetId: "target-01", role: "review_target_not_evidence", content: DOC3 }; const schema = dn.reviewSchema; const dims = schema.dimensions.map((d) => d.id);
  const findingsFor = (twin, label) => dims.map((id) => ({ dimensionId: id, disposition: "concern", epistemicStatus: twin.documentaryBasis.worksUsed[0] ? "documented" : "not_determinable", finding: label + " " + id, rationale: label,
    targetEvidenceRefs: id === dims[0] ? [SPLICE] : ["passage exact a citer"], twinBasisWorkRefs: twin.documentaryBasis.worksUsed.slice(0, 1).map((w) => w.workRef), confidenceQualitative: "low", limitations: [] }));
  return { F: h.F, A: twins[0], B: twins[1], doc, schema, dims, findingsFor };
}
/** transport a POLITIQUE DE REUSE REELLE (core/llm-response-reuse.js) : meme cle que l'exploitant (octets du prompt), reponses VALID reutilisees */
function reusingTransport(script, persisted) {
  /* `persisted` = { entries, bodies } : etat du magasin partage relu apres un STOP (nouveau processus, meme magasin JSONL chez l'exploitant) */
  const store = RU.createMemoryStore(persisted ? persisted.entries : []); const P = RU.createReusePolicy({ store }); const bodies = Object.assign({}, persisted ? persisted.bodies : {}); const real = [], reuses = []; let n = persisted ? persisted.calls : 0;
  return { real, reuses, P, persist: () => ({ entries: store.list(), bodies: Object.assign({}, bodies), calls: n }),
    llmCall: async (prompt, meta) => {
      const d = P.decide(prompt);
      if (d.decision === "REUSE_VALID") { reuses.push({ twinId: meta.twinId, pass: meta.pass, strategy: meta.strategy, sourceCallId: d.entry.sourceCallId }); return { text: bodies[d.entry.responseSha256], reused: true, callId: d.entry.responseSha256 }; }
      const text = script(prompt, meta); const rs = sha256(text); n++; real.push({ twinId: meta.twinId, pass: meta.pass, strategy: meta.strategy, callId: "c" + n, repairContextFingerprint: meta.repairContextFingerprint || null });
      P.recordReal({ promptSha256: d.promptSha256, responseSha256: rs, sourceRunId: "run-test", sourceCallId: "c" + n, providerId: "p", modelId: "m", completedAt: "2026-01-01T00:00:00." + String(n).padStart(3, "0") + "Z", httpStatus: 200 }); bodies[rs] = text;
      return { text, callId: "c" + n, reused: false };
    },
    onValidation: (v) => P.markValidation({ responseSha256: v.responseSha256, valid: v.valid, errors: v.errors, stage: v.stage }) };
}
const review = (c, twin, t, extra) => RE.runEnforcedReview(Object.assign({ frozen: c.F, twin, targetDoc: c.doc, reviewSchema: c.schema, llmCall: t.llmCall, onValidation: t.onValidation, maxPasses: 3 }, extra || {}));

test("r1-T1 meme jumeau + meme contexte : la reparation VALID est reutilisee (REUSE_VALID, 0 appel reel supplementaire) — same-context reuse preserve", async () => {
  const c = await twoTwinContext(); const t = reusingTransport((prompt, meta) => meta.pass === 1 ? JSON.stringify({ findings: c.findingsFor(c.A, "CONSTAT-A premiere phrase") }) : JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [Q_A] }] }));
  const r1 = await review(c, c.A, t); assert.equal(r1.review.reviewStatus, "complete"); assert.equal(r1.trace.acceptedPass, 2); assert.equal(t.real.length, 2);
  /* seconde execution, meme jumeau, meme document, meme constat, meme citation fautive : passe 1 rejouee (INVALID -> RETRY_REAL, politique v0.2), passe 2 reutilisee */
  const r2 = await review(c, c.A, t); assert.equal(r2.review.reviewStatus, "complete"); assert.equal(r2.trace.acceptedPass, 2);
  assert.equal(t.real.length, 3, "un seul appel reel de plus (la passe 1 INVALID n'est jamais reutilisee : politique v0.2 inchangee)"); assert.equal(t.reuses.length, 1); assert.equal(t.reuses[0].twinId, c.A.twinId); assert.equal(t.reuses[0].pass, 2);
  assert.equal(r1.trace.passes[1].promptSha256, r2.trace.passes[1].promptSha256); assert.equal(r1.trace.passes[1].repairContext.fingerprint, r2.trace.passes[1].repairContext.fingerprint);
  assert.deepEqual(r2.review.findings[0].targetEvidenceRefs, [Q_A]);
});
test("r1-T2 jumeaux differents, meme document, meme dimension, meme citation fautive, constats differents : AUCUNE reutilisation croisee (prompts cibles distincts, appel reel pour B, citation de B choisie pour B)", async () => {
  const c = await twoTwinContext();
  const t = reusingTransport((prompt, meta) => { if (meta.pass === 1) return JSON.stringify({ findings: c.findingsFor(meta.twinId === c.A.twinId ? c.A : c.B, meta.twinId === c.A.twinId ? "CONSTAT-A premiere phrase" : "CONSTAT-B seconde phrase") }); return JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [meta.twinId === c.A.twinId ? Q_A : Q_B] }] }); });
  const ra = await review(c, c.A, t); const rb = await review(c, c.B, t);
  assert.equal(ra.review.reviewStatus, "complete"); assert.equal(rb.review.reviewStatus, "complete");
  assert.notEqual(ra.trace.passes[1].promptSha256, rb.trace.passes[1].promptSha256, "prompts cibles distincts => cles de reuse distinctes");
  assert.notEqual(ra.trace.passes[1].repairContext.fingerprint, rb.trace.passes[1].repairContext.fingerprint);
  assert.equal(t.reuses.length, 0, "aucune reutilisation croisee"); assert.equal(t.real.length, 4);
  assert.deepEqual(ra.review.findings[0].targetEvidenceRefs, [Q_A]); assert.deepEqual(rb.review.findings[0].targetEvidenceRefs, [Q_B], "B recoit SA reparation, pas celle de A");
  /* temoin : sans l'empreinte (forme v0.3), les deux prompts cibles seraient byte-identiques */
  const strip = (p) => p.split("\n").filter((l) => l.indexOf("CONTEXTE DE REPARATION") !== 0).join("\n");
  const pa = t.real.find((x) => x.twinId === c.A.twinId && x.pass === 2), pb = t.real.find((x) => x.twinId === c.B.twinId && x.pass === 2); assert.ok(pa && pb);
  const promptA = ra.trace.passes[1], promptB = rb.trace.passes[1]; assert.ok(promptA.repairContext && promptB.repairContext);
  const ctxA = RE.repairContext({ twin: c.A, targetDoc: c.doc, parsed: { findings: c.findingsFor(c.A, "CONSTAT-A premiere phrase") }, faultyDimensions: [c.dims[0]] }), ctxB = RE.repairContext({ twin: c.B, targetDoc: c.doc, parsed: { findings: c.findingsFor(c.B, "CONSTAT-B seconde phrase") }, faultyDimensions: [c.dims[0]] });
  const frag = { [c.dims[0]]: [Object.assign({ ref: SPLICE }, RE.literalFragments(SPLICE, DOC3))] }; const args = { targetDoc: c.doc, faultyDimensions: [c.dims[0]], rejectedRefs: { [c.dims[0]]: [SPLICE] }, fragments: frag, pass: 2, strategyChange: false };
  const fullA = RE.targetedRepairPrompt(Object.assign({ context: ctxA }, args)), fullB = RE.targetedRepairPrompt(Object.assign({ context: ctxB }, args));
  assert.equal(sha256(fullA), promptA.promptSha256); assert.equal(sha256(fullB), promptB.promptSha256); assert.equal(strip(fullA), strip(fullB), "temoin : hors ligne de contexte, les prompts sont identiques (collision v0.3)"); assert.notEqual(fullA, fullB);
});
test("r1-T3 meme jumeau, constat different (meme document, meme citation fautive) : empreintes et prompts distincts, aucune reutilisation ; meme constat -> meme empreinte", async () => {
  const c = await twoTwinContext(); const f1 = c.findingsFor(c.A, "CONSTAT-1"), f2 = c.findingsFor(c.A, "CONSTAT-2 (autre lecture)"), f1bis = c.findingsFor(c.A, "CONSTAT-1");
  const x1 = RE.repairContext({ twin: c.A, targetDoc: c.doc, parsed: { findings: f1 }, faultyDimensions: [c.dims[0]] }), x2 = RE.repairContext({ twin: c.A, targetDoc: c.doc, parsed: { findings: f2 }, faultyDimensions: [c.dims[0]] }), x1b = RE.repairContext({ twin: c.A, targetDoc: c.doc, parsed: { findings: f1bis }, faultyDimensions: [c.dims[0]] });
  assert.notEqual(x1.fingerprint, x2.fingerprint); assert.equal(x1.fingerprint, x1b.fingerprint); assert.equal(x1.twinId, c.A.twinId); assert.equal(x1.dimensions[0].dimensionId, c.dims[0]);
  /* le champ repare (targetEvidenceRefs) n'entre PAS dans l'empreinte du constat : une meme reparation resoumise garde son contexte */
  const f1c = c.findingsFor(c.A, "CONSTAT-1"); f1c[0].targetEvidenceRefs = ["autre citation fautive"]; assert.equal(RE.repairContext({ twin: c.A, targetDoc: c.doc, parsed: { findings: f1c }, faultyDimensions: [c.dims[0]] }).fingerprint, x1.fingerprint);
  /* autre document -> autre empreinte ; autre dimension fautive -> autre empreinte */
  assert.notEqual(RE.repairContext({ twin: c.A, targetDoc: { targetId: "target-01", content: DOC3 + " " }, parsed: { findings: f1 }, faultyDimensions: [c.dims[0]] }).fingerprint, x1.fingerprint);
  assert.notEqual(RE.repairContext({ twin: c.A, targetDoc: c.doc, parsed: { findings: f1 }, faultyDimensions: [c.dims[1]] }).fingerprint, x1.fingerprint);
  let seq = 0; const t = reusingTransport((prompt, meta) => { if (meta.pass === 1) { seq++; return JSON.stringify({ findings: seq === 1 ? f1 : f2 }); } return JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [seq === 1 ? Q_A : Q_B] }] }); });
  const ra = await review(c, c.A, t); const rb = await review(c, c.A, t); assert.equal(t.reuses.length, 0, "constats differents : pas de reuse"); assert.notEqual(ra.trace.passes[1].promptSha256, rb.trace.passes[1].promptSha256); assert.deepEqual(rb.review.findings[0].targetEvidenceRefs, [Q_B]);
});
test("r1-T4 STOP/reprise : contexte strictement identique (jumeau, document, constat, citation fautive) -> meme empreinte, meme prompt, reuse conserve depuis le magasin persiste relu par un NOUVEAU transport", async () => {
  const c = await twoTwinContext(); const script = (prompt, meta) => meta.pass === 1 ? JSON.stringify({ findings: c.findingsFor(c.A, "CONSTAT-A") }) : JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [Q_A] }] });
  const t1 = reusingTransport(script); const r1 = await review(c, c.A, t1, { runId: "run-avant-stop" }); assert.equal(r1.trace.acceptedPass, 2); assert.equal(t1.real.length, 2);
  /* STOP : le magasin (entrees + corps) est persiste ; reprise dans un nouveau transport, nouveau runId */
  const t2 = reusingTransport(script, t1.persist()); const r2 = await review(c, c.A, t2, { runId: "run-apres-reprise" });
  assert.equal(r1.trace.passes[1].repairContext.fingerprint, r2.trace.passes[1].repairContext.fingerprint); assert.equal(r1.trace.passes[1].promptSha256, r2.trace.passes[1].promptSha256);
  assert.equal(t2.real.length, 1, "seule la passe 1 (INVALID, jamais reutilisee) est rejouee"); assert.equal(t2.reuses.length, 1); assert.equal(t2.reuses[0].pass, 2); assert.equal(t2.reuses[0].sourceCallId, "c2"); assert.equal(r2.trace.acceptedPass, 2); assert.deepEqual(r2.review.findings[0].targetEvidenceRefs, [Q_A]);
  assert.equal(JSON.stringify(r1.trace.passes[1].repairContext), JSON.stringify(r2.trace.passes[1].repairContext), "contexte serialise identique (aucun horodatage, aucun nonce, aucun runId)");
  /* reprise avec un constat DIFFERENT (la passe 1 rejouee a produit une autre lecture) : pas de reuse de la reparation precedente */
  const t3 = reusingTransport((prompt, meta) => meta.pass === 1 ? JSON.stringify({ findings: c.findingsFor(c.A, "CONSTAT-A-bis") }) : JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [Q_B] }] }), t2.persist());
  const r3 = await review(c, c.A, t3, { runId: "run-reprise-2" }); assert.equal(t3.reuses.length, 0); assert.notEqual(r3.trace.passes[1].promptSha256, r1.trace.passes[1].promptSha256); assert.deepEqual(r3.review.findings[0].targetEvidenceRefs, [Q_B]);
});
test("r1-T5 determinisme : deux executions independantes produisent exactement la meme empreinte et le meme prompt cible ; aucune donnee aleatoire/horodatee ; JSON canonique stable a l'ordre des cles", async () => {
  const c = await twoTwinContext(); const f = c.findingsFor(c.A, "CONSTAT-A");
  const a = RE.repairContext({ twin: c.A, targetDoc: c.doc, parsed: { findings: f }, faultyDimensions: [c.dims[0]] }); await new Promise((res) => setTimeout(res, 5)); const b = RE.repairContext({ twin: c.A, targetDoc: c.doc, parsed: { findings: JSON.parse(JSON.stringify(f)) }, faultyDimensions: [c.dims[0]] });
  assert.deepEqual(a, b); assert.match(a.fingerprint, /^[0-9a-f]{64}$/); assert.equal(a.schema, RE.REPAIR_CONTEXT_SCHEMA); assert.equal(a.version, RE.REPAIR_CONTEXT_VERSION);
  const keys = Object.keys(a).sort(); assert.deepEqual(keys, ["dimensions", "documentSha256", "fingerprint", "professionalRef", "schema", "targetId", "twinId", "version"], "aucun champ non canonique (pas de runId, pas d'horodatage, pas de nonce)");
  const g = JSON.parse(JSON.stringify(f[0])); const shuffled = {}; Object.keys(g).reverse().forEach((k) => { shuffled[k] = g[k]; }); assert.equal(RE.canonicalJson(shuffled), RE.canonicalJson(g));
  const frag = { [c.dims[0]]: [Object.assign({ ref: SPLICE }, RE.literalFragments(SPLICE, DOC3))] }; const args = { targetDoc: c.doc, faultyDimensions: [c.dims[0]], rejectedRefs: { [c.dims[0]]: [SPLICE] }, fragments: frag, pass: 2, strategyChange: false, context: a };
  assert.equal(RE.targetedRepairPrompt(args), RE.targetedRepairPrompt(JSON.parse(JSON.stringify(args)))); assert.ok(RE.targetedRepairPrompt(args).indexOf("empreinte=" + a.fingerprint) !== -1);
  assert.throws(() => RE.targetedRepairPrompt(Object.assign({}, args, { context: null })), /REPAIR_CONTEXT_REQUIRED/, "jamais de prompt cible sans contexte");
  /* la ligne de contexte est de l'identification seule : le reste du prompt (tache, regles, document, JSON attendu) est identique a v0.3 */
  const lines = RE.targetedRepairPrompt(args).split("\n"); assert.equal(lines.filter((l) => l.indexOf("CONTEXTE DE REPARATION") === 0).length, 1); assert.ok(/REGLES \(contrat inchange\)/.test(lines.join("\n")) && /rendez \[\]/.test(lines.join("\n")));
});
test("r1-T6 fixtures historiques v0.3 (R1..R6, S1..S5) : rejeu identique (12 occurrences, 5 repetitions, 2 corrections recomposees, 0 fausse acceptation, 0 regression) ; 5 prompts cibles, 0 collision, 5 contextes distincts, empreinte portee par chaque prompt", () => {
  const rr = REPLAY.run(); const s = rr.summary;
  assert.equal(s.fixtures, 11); assert.equal(s.occurrencesTargetRef, 12); assert.equal(s.exactRepeatsDetected, 5); assert.equal(s.historicalCorrectionAcceptedByRecomposition, 2); assert.equal(s.falseAcceptances, 0); assert.equal(s.regressions, 0);
  assert.equal(s.targetedPromptsBuilt, 5); assert.equal(s.targetedPromptCollisions, 0); assert.equal(s.distinctRepairContexts, 5); rr.rows.filter((r) => r.targetedPromptPass2).forEach((r) => assert.equal(r.targetedPromptPass2.carriesFingerprint, true, r.id));
});
test("r1-T7 fixture R2 (cas reel corrige au retry) : la correction historique rejouee comme reparation ciblee recomposee reste ACCEPTEE (validateur inchange)", () => {
  const row = REPLAY.run().rows.find((r) => r.id === "R2"); assert.ok(row && row.historicalCorrectionAsTargetedRepair); assert.equal(row.historicalCorrectionAsTargetedRepair.accepted, true); assert.deepEqual(row.historicalCorrectionAsTargetedRepair.errors, []);
});
test("r1-T8 fixture R1 (cas reel A, 3 passes identiques) : la reparation ciblee est fonctionnellement inchangee (memes fragments, memes dimensions, meme feedback) ; seule la ligne de contexte s'ajoute au prompt", () => {
  const row = REPLAY.run().rows.find((r) => r.id === "R1"); assert.ok(row); const p1 = row.passes[0]; assert.equal(p1.targetedEligible, true); const faultyDims = Object.keys(p1.fragments); assert.equal(faultyDims.length, 1, "une seule dimension fautive (lue dans la fixture, jamais codee en dur)");
  const f = p1.fragments[faultyDims[0]][0]; assert.equal(f.literal, false); assert.equal(f.fragments.length, 2); assert.equal(row.passes[1].exactRepeat, true); assert.equal(row.passes[2].exactRepeat, true);
  const t = row.targetedPromptPass2; assert.equal(t.mentionsFragments, true); assert.equal(t.mentionsEmptyFallback, true); assert.equal(t.containsDocument, true); assert.equal(t.reinjectsFullPreviousResponse, false); assert.equal(t.carriesFingerprint, true);
  const fx = REPLAY.load().find((x) => x.id === "R1"); const schema = { schema: "EvidenceForge.ReviewSchema", dimensions: fx.dimensions.map((id) => ({ id })) }; const v1 = RE.validateReviewCandidate(fx.passes[0].responseText, fx.twin, fx.document, schema);
  const dims = RE.faultyDimensions(v1.errors); const rejected = RE.rejectedRefsOf(v1.errors, v1.parsed); const fragments = {}; dims.forEach((d) => { fragments[d] = rejected[d].map((ref) => Object.assign({ ref }, RE.literalFragments(ref, fx.document.content))); });
  const ctx = RE.repairContext({ twin: fx.twin, targetDoc: fx.document, parsed: v1.parsed, faultyDimensions: dims }); const prompt = RE.targetedRepairPrompt({ targetDoc: fx.document, faultyDimensions: dims, rejectedRefs: rejected, fragments, pass: 2, strategyChange: false, context: ctx });
  const body = prompt.split("\n").filter((l) => l.indexOf("CONTEXTE DE REPARATION") !== 0).join("\n"); assert.ok(/JOINT 2 fragments/.test(body)); assert.equal(sha256(prompt), t.sha256); assert.equal(ctx.fingerprint, t.repairContextFingerprint);
});
test("r1-T9 aucune fausse acceptation : une reparation reutilisee ou recue n'est acceptee que par le validateur inchange ; reparation non litterale reutilisable ? impossible (INVALID n'est jamais reutilise)", async () => {
  const c = await twoTwinContext(); const t = reusingTransport((prompt, meta) => meta.pass === 1 ? JSON.stringify({ findings: c.findingsFor(c.A, "CONSTAT-A") }) : JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [SPLICE] }] }));
  const r = await review(c, c.A, t); assert.equal(r.review.reviewStatus, "error"); assert.equal(t.reuses.length, 0);
  const d = t.P.decide("n'importe quel prompt"); assert.equal(d.decision, "REAL_CALL");
  const v = RE.validateReviewCandidate(JSON.stringify(RE.recompose({ findings: c.findingsFor(c.A, "x") }, { [c.dims[0]]: [Q_A] })), c.A, c.doc, c.schema); assert.equal(v.ok, true);
  const w = RE.validateReviewCandidate(JSON.stringify(RE.recompose({ findings: c.findingsFor(c.A, "x") }, { [c.dims[0]]: [Q_A + " x"] })), c.A, c.doc, c.schema); assert.equal(w.ok, false); assert.ok(w.errors.some((e) => e.code === "TARGET_REF_NOT_LITERAL"));
  assert.equal(REPLAY.run().summary.falseAcceptances, 0);
});
test("r1-T10 aucune regression : validateur, preambule, reprise informee, extractJson byte-identiques a la reference v0.2 ; maxPasses 3 ; strategies v0.3 inchangees ; contrat MONO-11-v2 ; fail-closed apres 3 passes", async () => {
  ["validateReviewCandidate", "informedRepairPrompt", "enforcementPreamble", "extractJson"].forEach(assertByteIdenticalToV02); assert.equal(RE.DEFAULT_MAX_PASSES, 3);
  assert.deepEqual(Object.values(RE.STRATEGY).sort(), ["BASE_EF03B", "INFORMED_REPAIR_V02", "TARGETED_REPAIR", "TARGETED_REPAIR_STRATEGY_CHANGE"]);
  const contracts = require("../contracts/mono11-contracts.json"); assert.equal(contracts.contractVersion, "MONO-11-v2"); assert.equal(contracts.retryPolicy.version, "MONO-11-v0.3-r1");
  const c = await twoTwinContext(); const t = reusingTransport((prompt, meta) => meta.pass === 1 ? JSON.stringify({ findings: c.findingsFor(c.A, "CONSTAT-A") }) : JSON.stringify({ repairs: [{ dimensionId: c.dims[0], targetEvidenceRefs: [SPLICE] }] }));
  const r = await review(c, c.A, t); assert.equal(r.review.reviewStatus, "error"); assert.equal(r.trace.passes.length, 3); assert.deepEqual(r.trace.passes.map((p) => p.strategy), [RE.STRATEGY.BASE, RE.STRATEGY.TARGETED, RE.STRATEGY.TARGETED_CHANGE]);
  assert.equal(REPLAY.run().summary.regressions, 0);
});
