"use strict";
/**
 * MONO-11 v0.1 — test/test-mono11-v0.1.js
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
test("T30 revues en erreur : UNE passe de reprise ciblee (EF-03B gele), consignee ; une erreur persistante reste une erreur", async () => {
  const { h, r } = await full("domainA");
  const { makeDownstreamFakeLlm } = require("./harness.js");
  const base = makeDownstreamFakeLlm(); let reviewCalls = 0;
  /* le premier appel de revue rend une preuve cible INVENTEE (refusee), les suivants sont corrects */
  const flaky = async (prompt) => { if (prompt.indexOf("EF-03B") !== -1 && reviewCalls++ === 0) return JSON.stringify({ findings: [{ dimensionId: "dimA1", disposition: "concern", epistemicStatus: "not_determinable", finding: "x", rationale: "x", targetEvidenceRefs: ["passage qui n'existe pas"], twinBasisWorkRefs: [], confidenceQualitative: "low", limitations: [] }] }); return base(prompt); };
  const dn = await h.runDownstream(r, { downstreamLlm: flaky, llmCall: flaky, reviewResumePasses: 1 });
  assert.equal(dn.reviewSet.resumePasses.length, 1);
  assert.equal(dn.reviewSet.summary.reviewsError, 0, "la reprise a rejoue la seule revue en erreur");
  assert.equal(dn.reviewSet.resumePasses[0].reEvaluated, 1); assert.equal(dn.reviewSet.resumePasses[0].alreadyValid, dn.reviewSet.reviews.length - 1);
  /* zero passe autorisee : l'erreur reste une erreur, et la qualification le dit */
  reviewCalls = 0;
  const { h: h2, r: r2 } = await full("domainA");
  const dn2 = await h2.runDownstream(r2, { downstreamLlm: flaky, llmCall: flaky, reviewResumePasses: 0 });
  assert.equal(dn2.reviewSet.summary.reviewsError, 1); assert.deepEqual(dn2.reviewSet.resumePasses, []);
  const cap = await h2.llmCapability();
  const q = Q.qualifyProcess({ frozen: h2.F, assessment: h2.assessment, panel: dn2.panel, corpusSet: dn2.corpusSet, twinSet: dn2.twinSet, reviewSet: dn2.reviewSet, aggregation: dn2.aggregation,
    llmCapability: cap.capability, llmConfig: cap.llmConfig, runContext: Object.assign({ artifactRegistry: h2.registry }, h2.ctx), ledger: h2.ledger, registry: h2.registry });
  assert.equal(q.status, "NOT_QUALIFIED"); assert.ok(q.failedCriteria.includes("reviews_complete"));
});
