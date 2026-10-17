"use strict";
/**
 * MONOLITH v1.0.17 — test/test-v1017-mission-deliverables.js
 * MISSION CONTRACT ENFORCEMENT (R-A) : MD-01..MD-22. Aucun appel fournisseur, aucun reseau sortant.
 * Les textes de mission sont GENERIQUES (aucun jeton de cas) ; le run reel n'est relu qu'en lecture seule, par variable d'environnement
 * EVIDENCEFORGE_MD_REPLAY_RUN (SKIP sinon).
 */
const fs = require("fs"), path = require("path"), http = require("http"), crypto = require("crypto"), vm = require("vm");
module.exports = async function (h) {
  const { T, assert, assertThrows, sha, setEnv, K_KEY, K_URL, P, RS, PL, ROOT, seedRunAtProfessionals, patchSP, patchSeal, fakeProCheckpoint, fakeDownCheckpoint, withFakeProviderOK } = h;
  const MD = require("../lib/mission-deliverables.js"); const SRP = require("../lib/stage-report.js"); const S1 = require("../lib/stage-ef01.js");
  const V1016 = path.join(ROOT, "..", "MONOLITH-v1.0.16");
  const caps = (a) => a.deliverables.map((d) => d.capabilityId);
  const notSup = (a) => a.deliverables.filter((d) => d.gateClass === "NOT_SUPPORTED").map((d) => d.capabilityId);
  /* livrable generique a la forme d'une mission de revue structuree (aucun nom de cas, de grille ni de document) */
  const RICH = "Rapport de revue documentaire structuré section par section et question par question sur le référentiel fourni, incluant l'identité et la traçabilité des jumeaux documentaires, les revues individuelles indépendantes, l'agrégation avec divergences et réserves, une matrice de décision par requirement, un verdict unique parmi quatre options, et, si le verdict l'autorise, un contrat d'entrée en tableau et en JSON.";
  const SIMPLE = "Analyse documentaire avec réserves et inconnues.";
  const fakeReport = (over) => Object.assign({ statements: { etabli: [1], convergent: [], divergent: [2], provisoire: [], nonEtabli: [3] }, pipeline: { disciplines: ["a"], twins: 2, reviews: { reviewsComplete: 2, reviewsExpected: 2 } },
    reservations: [{ code: "R" }], limits: ["Les « jumeaux documentaires » ... : aucun professionnel n'a été consulté."], qualification: { status: "QUALIFIED_WITH_RESERVATIONS", criteria: [{}], unknowns: [] }, integrity: { seal: { runtimeSealSha256: "s" } },
    headline: { PROCESS_QUALIFICATION: "QUALIFIED_WITH_RESERVATIONS", SCIENTIFICALLY_USABLE: "NO" } }, over || {});

  await T("MD-01", "module pur et deterministe : seul `crypto` est requis (ni fs, ni reseau, ni LLM) ; deux evaluations du meme texte sont identiques ; empreintes registre / evaluation stables ; une evaluation alteree est detectee", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib", "mission-deliverables.js"), "utf8"); const reqs = (src.match(/require\(([^)]+)\)/g) || []); assert(reqs.length === 1 && /"crypto"/.test(reqs[0]), JSON.stringify(reqs));
    assert(!/llmCall|fetch\(|http|readFileSync|writeFileSync/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "aucun effet de bord");
    const a = MD.assess(RICH), b = MD.assess(RICH); assert(JSON.stringify(a) === JSON.stringify(b) && a.assessmentSha256 === b.assessmentSha256 && /^[0-9a-f]{64}$/.test(a.registrySha256) && MD.verifyAssessment(a));
    const t = JSON.parse(JSON.stringify(a)); t.deliverables[0].gateClass = "SUPPORTED"; t.deliverables[1].gateClass = "SUPPORTED"; assert(MD.verifyAssessment(t) === false, "alteration detectee"); });

  await T("MD-02", "livrable riche generique : 4 livrables NON garantis (reponse item par item, matrice de decision, verdict, contrat conditionnel au verdict, formes TABLE+JSON) et 6 garantis ; reconnaissance requise", () => {
    const a = MD.assess(RICH);
    assert(caps(a).join() === "DOCUMENTARY_REPORT,PER_ITEM_RESPONSE,PROVENANCE_TRACEABILITY,PROFESSIONALS_IDENTIFICATION,INDEPENDENT_REVIEWS,AGGREGATION,RESERVATIONS_LIMITS,DECISION_MATRIX,BUSINESS_VERDICT,STRUCTURED_CONTRACT", caps(a).join());
    assert(notSup(a).join() === "PER_ITEM_RESPONSE,DECISION_MATRIX,BUSINESS_VERDICT,STRUCTURED_CONTRACT" && a.acknowledgementRequired === true, notSup(a).join());
    const c = a.deliverables.find((d) => d.capabilityId === "STRUCTURED_CONTRACT"); assert(c.conditional && c.conditionDependsOn.join() === "BUSINESS_VERDICT" && c.forms.slice().sort().join() === "JSON,TABLE" && /si le verdict/.test(c.condition), JSON.stringify(c));
    assert(a.deliverables.filter((d) => d.capabilityId === "BUSINESS_VERDICT").length === 1, "la condition « si le verdict... » ne cree pas un second livrable verdict"); assert(a.deliverables.every((d) => d.status === "REQUESTED")); });

  await T("MD-03", "livrable usuel (gabarit du cadrage) : « Analyse documentaire. » / « analyse documentaire par des professionnels reels » => 1 livrable garanti, aucune reconnaissance requise ; livrable vide => 0 livrable", () => {
    ["Analyse documentaire.", "analyse documentaire par des professionnels reels", "Revue documentaire."].forEach((t) => { const a = MD.assess(t); assert(caps(a).join() === "DOCUMENTARY_REPORT" && a.acknowledgementRequired === false, t + " : " + caps(a)); });
    [null, "", "   "].forEach((t) => { const a = MD.assess(t); assert(a.deliverables.length === 0 && a.acknowledgementRequired === false); }); });

  await T("MD-04", "negation : « sans verdict ni score » => exclus (jamais des livrables), traces dans `excluded` ; la mention « n'ont pas participe » reste un livrable (exempte de negation)", () => {
    const a = MD.assess("Analyse documentaire sans verdict ni score, avec réserves."); assert(caps(a).join() === "DOCUMENTARY_REPORT,RESERVATIONS_LIMITS" && a.excluded.map((x) => x.capabilityId).join() === "BUSINESS_VERDICT,SCORING_RANKING" && !a.acknowledgementRequired, JSON.stringify(a.excluded));
    const b = MD.assess("Préciser que les professionnels réels n'ont pas participé à la revue."); assert(caps(b).join() === "NON_PARTICIPATION_DISCLOSURE" && b.deliverables[0].gateClass === "SUPPORTED", caps(b).join()); });

  await T("MD-05", "fail-closed : un texte non reconnu (« l », « un poeme ») est UNRECOGNIZED_DELIVERABLE, NOT_SUPPORTED, jamais suppose produit", () => {
    ["l", "Un poème sur la marche."].forEach((t) => { const a = MD.assess(t); assert(a.deliverables.length === 1 && a.deliverables[0].capabilityId === null && a.deliverables[0].reasonCode === "UNRECOGNIZED_DELIVERABLE" && a.acknowledgementRequired, t);
      const md = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: null }); assert(md.items[0].status === "NOT_PRODUCED_BY_DESIGN" && md.overall === "INCOMPLETE"); }); });

  await T("MD-06", "segmentation : « v0.2 » n'est jamais coupe ; condition en tete de clause, en ligne, ou en derniere clause ; un livrable garanti mais conditionnel n'est PAS garanti (CONDITION_NOT_EVALUABLE) ; forme TABLE non produite (FORM_NOT_SUPPORTED), forme JSON produite", () => {
    assert(MD.splitClauses("Revue documentaire de la version v0.2 du document.").length === 1);
    const a = MD.assess("Analyse documentaire, les inconnues si le panel le permet"); const u = a.deliverables.find((d) => d.capabilityId === "UNKNOWNS"); assert(u.conditional && u.reasonCode === "CONDITION_NOT_EVALUABLE" && u.gateClass === "NOT_SUPPORTED", JSON.stringify(u));
    const b = MD.assess("Analyse documentaire, le cas échéant"); assert(b.deliverables.length === 1 && b.deliverables[0].conditional === true && b.deliverables[0].reasonCode === "CONDITION_NOT_EVALUABLE", JSON.stringify(b.deliverables));
    const c = MD.assess("Analyse documentaire en tableau"); assert(c.deliverables[0].reasonCode === "FORM_NOT_SUPPORTED", JSON.stringify(c.deliverables[0]));
    const d = MD.assess("Analyse documentaire en JSON"); assert(d.deliverables[0].gateClass === "SUPPORTED" && d.deliverables[0].forms.join() === "JSON"); });

  await T("MD-07", "evaluate : garanti + preuve => PRODUCED (preuve citee) ; garanti sans preuve (0 revue complete) => NOT_PRODUCED_ERROR ; non garanti => NOT_PRODUCED_BY_DESIGN ; synthese REQUESTED/PRODUCED/NOT_PRODUCED_BY_DESIGN/NOT_PRODUCED_ERROR", () => {
    const a = MD.assess(SIMPLE); const ok = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: { acknowledged: false, acknowledgedIds: [], validatedBy: "U" } });
    assert(ok.items.every((i) => i.status === "PRODUCED" && i.evidence && i.requested === true && i.requestedStatus === "REQUESTED") && ok.overall === "COMPLETE" && ok.runMayComplete && ok.summary.REQUESTED === 3 && ok.summary.PRODUCED === 3, JSON.stringify(ok.items));
    const ko = MD.evaluate({ assessment: a, report: fakeReport({ pipeline: { disciplines: [], twins: 0, reviews: { reviewsComplete: 0 } } }), acceptance: { acknowledged: false, acknowledgedIds: [] } });
    const doc = ko.items.find((i) => i.capabilityId === "DOCUMENTARY_REPORT"); assert(doc.status === "NOT_PRODUCED_ERROR" && ko.overall === "INCOMPLETE" && ko.acceptedMissing.indexOf(doc.deliverableId) !== -1 && ko.summary.NOT_PRODUCED_ERROR === 1, JSON.stringify(ko.summary));
    const r = MD.evaluate({ assessment: MD.assess(RICH), report: fakeReport(), acceptance: null }); assert(r.summary.REQUESTED === 10 && r.summary.NOT_PRODUCED_BY_DESIGN === 4 && r.summary.PRODUCED === 6 && r.summary.NOT_PRODUCED_ERROR === 0 && r.overall === "INCOMPLETE" && r.origin === "RETROSPECTIVE_NO_GATE", JSON.stringify(r.summary));
    const none = MD.evaluate({ assessment: MD.assess(""), report: fakeReport(), acceptance: null }); assert(none.overall === "NO_DELIVERABLE_DECLARED" && none.runMayComplete === true); });

  /* MD-08 : attente CORRIGEE par le correctif B1 (audit independant v1.0.17). Attente historique (fautive) : « livrables non garantis RECONNUS
     => non acceptes, run peut terminer (PARTIAL_BY_DESIGN_ACKNOWLEDGED) ». Elle encodait l'assimilation ACK = renonciation implicite. */
  await T("MD-08", "acceptation : une reconnaissance (ACK) n'est PAS une renonciation (B1) => un livrable non garanti RECONNU reste accepte et manquant => INCOMPLETE ; sans acceptation (run anterieur) => INCOMPLETE ; reconnaissance partielle => INCOMPLETE (memes identifiants manquants)", () => {
    const a = MD.assess(RICH);
    const ackAll = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: { acknowledged: true, acknowledgedIds: a.notSupported, validatedBy: "U" } });
    assert(ackAll.overall === "INCOMPLETE" && ackAll.runMayComplete === false && ackAll.acceptedMissing.join() === a.notSupported.join() && ackAll.items.every((i) => i.accepted === true) && ackAll.items.filter((i) => i.acknowledgedAsNotProduced).length === 4, JSON.stringify([ackAll.overall, ackAll.acceptedMissing]));
    const none = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: null }); assert(none.overall === "INCOMPLETE" && none.acceptedMissing.join() === a.notSupported.join(), none.acceptedMissing.join());
    const part = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: { acknowledged: true, acknowledgedIds: a.notSupported.slice(1) } });
    assert(part.overall === "INCOMPLETE" && part.acceptedMissing.join() === a.notSupported.join() && part.items.filter((i) => i.acknowledgedAsNotProduced).length === 3, part.acceptedMissing.join()); });

  await T("MD-09", "AUCUN mapping depuis PROCESS_QUALIFICATION / SCIENTIFICALLY_USABLE : pour toutes les combinaisons (4 statuts x YES/NO, en-tete et qualification), et sans en-tete, les statuts des livrables sont identiques ; le verdict reste NOT_PRODUCED_BY_DESIGN ; le module ne lit jamais `headline`", () => {
    const a = MD.assess(RICH); const base = JSON.stringify(MD.evaluate({ assessment: a, report: fakeReport(), acceptance: null }).items.map((i) => [i.deliverableId, i.status]));
    ["QUALIFIED", "QUALIFIED_WITH_RESERVATIONS", "NOT_QUALIFIED", "IMPOSSIBLE_TO_ASSESS"].forEach((q) => ["YES", "NO"].forEach((u) => {
      const rep = fakeReport({ headline: { PROCESS_QUALIFICATION: q, SCIENTIFICALLY_USABLE: u, scientificallyUsableRule: { value: u } }, qualification: { status: q, criteria: [{}], unknowns: [] } });
      const got = MD.evaluate({ assessment: a, report: rep, acceptance: null }); assert(JSON.stringify(got.items.map((i) => [i.deliverableId, i.status])) === base, q + "/" + u);
      assert(got.items.find((i) => i.capabilityId === "BUSINESS_VERDICT").status === "NOT_PRODUCED_BY_DESIGN"); }));
    const noHead = fakeReport(); delete noHead.headline; assert(JSON.stringify(MD.evaluate({ assessment: a, report: noHead, acceptance: null }).items.map((i) => [i.deliverableId, i.status])) === base);
    const code = fs.readFileSync(path.join(ROOT, "lib", "mission-deliverables.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const i = code.indexOf("function attachToReport("), j = code.indexOf("\n}\n", i); const outside = code.slice(0, i) + code.slice(j);
    const reads = outside.match(/\.(headline|PROCESS_QUALIFICATION|SCIENTIFICALLY_USABLE|scientificallyUsableRule)\b|\[\s*"(headline|PROCESS_QUALIFICATION|SCIENTIFICALLY_USABLE)"\s*\]|qualification\.status/g) || []; assert(i > 0 && reads.length === 0, "hors attachToReport, aucune lecture de l'en-tete de qualification : " + reads.join());
    assert(/out\.headline = Object\.assign\(\{\}, report\.headline, \{ MISSION_DELIVERABLES/.test(code), "attachToReport ajoute seulement MISSION_DELIVERABLES a l'en-tete"); });

  await T("MD-10", "attachToReport : nouveau rapport verifie (verifyReportHash), champs existants intacts, rapport d'origine non mute ; un rapport sans missionDeliverables (v1.0.16) se verifie toujours", () => {
    const rep = SRP.buildUserReport({ state: { runId: "efm-x", mission: { question: "Q", documents: [] } }, reformulation: { missionReformulee: "M" }, runContract: { disciplinesProposees: [] }, reviewSet: { reviews: [], summary: { reviewsComplete: 1 } }, aggregation: { aggregates: [] }, twinSet: { twins: [] }, qualification: { status: "QUALIFIED_WITH_RESERVATIONS", reservations: [{ code: "R" }], criteria: [], unknowns: [] } });
    const before = JSON.stringify(rep); const md = MD.evaluate({ assessment: MD.assess(SIMPLE), report: rep, acceptance: null }); const out = MD.attachToReport(rep, md, SRP.computeReportHash);
    assert(JSON.stringify(rep) === before && SRP.verifyReportHash(rep).valid && SRP.verifyReportHash(out).valid && out.reportHash !== rep.reportHash, "hash");
    Object.keys(rep).filter((k) => ["reportHash", "headline"].indexOf(k) === -1).forEach((k) => assert(JSON.stringify(out[k]) === JSON.stringify(rep[k]), "champ " + k));
    Object.keys(rep.headline).forEach((k) => assert(JSON.stringify(out.headline[k]) === JSON.stringify(rep.headline[k]), "en-tete " + k)); assert(out.headline.MISSION_DELIVERABLES === md.overall && out.missionDeliverables === md); });

  /* ---- Porte 1 appliquee ---- */
  function seedAtPlanGate(livrable) {
    const r = RS.createRunStore(RS.newRunId()); const stages = {}; RS.STAGES.forEach((k) => { stages[k] = { status: ["MISSION", "DISCIPLINES", "PLAN"].indexOf(k) !== -1 ? "DONE" : "PENDING" }; });
    r.write({ schema: "EvidenceForge.MonolithRunState", runId: r.runId, status: "WAITING_USER", stage: "RETRIEVAL", stages, gate: { id: RS.GATES.CONFIRM_PLAN, since: new Date().toISOString() }, createdAt: new Date().toISOString(),
      mission: { question: "Examinez cette demande de test de livrables", questionSha256: sha("q"), missionId: "efm-mission-test", documents: [], reformulated: { missionReformulee: "M", perimetre: "p", horsPerimetre: "", livrableAttendu: livrable, ambiguites: [], documentsRole: [] } }, attempts: 0, counters: { llmReal: 0, llmReused: 0, openAlexCalls: 0, kitRealCalls: 0 } });
    r.saveJson("disciplines.json", { runContract: { disciplinesProposees: [] }, disciplinesRetenues: [], resolver: { resolverRuns: [] } }); r.saveJson("plan.json", { userView: { requetes: [] } }); return r;
  }
  await T("MD-11", "Porte 1 : livrable non garanti sans reconnaissance => DELIVERABLES_ACK_REQUIRED (details listes), ni plan-confirmation ni acceptation ecrite ; empreinte differente => DELIVERABLES_ASSESSMENT_MISMATCH ; identite absente => HUMAN_IDENTITY_REQUIRED et acceptation RETIREE ; gateView expose l'evaluation persistee", async () => {
    const r = seedAtPlanGate(RICH); const gv = PL.gateView(r.runId); assert(gv.deliverables && gv.deliverables.acknowledgementRequired && MD.verifyAssessment(gv.deliverables) && r.loadJson("mission-deliverables-assessment.json").assessmentSha256 === gv.deliverables.assessmentSha256);
    const e1 = await assertThrows(() => PL.confirmPlan(r.runId, { validatedBy: "Une Personne" }), "DELIVERABLES_ACK_REQUIRED"); assert(e1.details.notSupported.length === 4 && /reconnaissez/i.test(e1.userMessage), JSON.stringify(e1.details));
    assert(!r.loadJson("plan-confirmation.json") && !r.loadJson("mission-deliverables-acceptance.json") && r.read().status === "WAITING_USER");
    await assertThrows(() => PL.confirmPlan(r.runId, { validatedBy: "Une Personne", deliverablesAcknowledged: true, deliverablesAssessmentSha256: "0".repeat(64) }), "DELIVERABLES_ASSESSMENT_MISMATCH");
    await assertThrows(() => PL.confirmPlan(r.runId, { validatedBy: "", deliverablesAcknowledged: true, deliverablesAssessmentSha256: gv.deliverables.assessmentSha256 }), "HUMAN_IDENTITY_REQUIRED");
    assert(!fs.existsSync(path.join(r.dir, "mission-deliverables-acceptance.json")) && !r.loadJson("plan-confirmation.json"), "acceptation retiree si la porte historique refuse");
    await assertThrows(() => PL.confirmPlan("efm-inexistant-md", { validatedBy: "X Y" })); });

  await T("MD-12", "Porte 1 (succes, porte historique appelee par composition) : reconnaissance + empreinte => acceptation liee (identite, empreinte, ids reconnus) ; livrable entierement garanti => aucune reconnaissance requise", async () => {
    const saved = S1.confirmPlan; const savedKey = process.env[K_KEY], savedUrl = process.env[K_URL]; setEnv(K_KEY, null); setEnv(K_URL, null);   /* le moteur relance s'arrete au preflight (fournisseur absent) : 0 appel */
    S1.confirmPlan = async (i) => { const who = String(i.validatedBy || "").trim(); if (who.length < 2) throw Object.assign(new Error("HUMAN_IDENTITY_REQUIRED"), { code: "HUMAN_IDENTITY_REQUIRED" }); return { validation: { validatedBy: who }, searchProtocol: { protocolHash: "sp" }, provenance: {}, executionMission: { targetDocuments: [] } }; };
    try { const r = seedAtPlanGate(RICH); const a = PL.gateView(r.runId).deliverables;
      const out = await PL.confirmPlan(r.runId, { validatedBy: "Une Personne", deliverablesAcknowledged: true, deliverablesAssessmentSha256: a.assessmentSha256 }); const acc = r.loadJson("mission-deliverables-acceptance.json");
      assert(out.ok && out.deliverables.acknowledged === true && acc.validatedBy === "Une Personne" && acc.assessmentSha256 === a.assessmentSha256 && acc.acknowledgedIds.join() === a.notSupported.join() && r.loadJson("plan-confirmation.json").validation.validatedBy === "Une Personne", JSON.stringify(acc));
      const r2 = seedAtPlanGate(SIMPLE); const out2 = await PL.confirmPlan(r2.runId, { validatedBy: "Une Personne" }); assert(out2.ok && r2.loadJson("mission-deliverables-acceptance.json").acknowledged === false);
      await new Promise((res) => setTimeout(res, 200)); }
    finally { S1.confirmPlan = saved; setEnv(K_KEY, savedKey); setEnv(K_URL, savedUrl); } });

  /* ---- bout en bout (moteur reel, aval factice) ---- */
  async function runToEnd(livrable, prep) {
    let out = null, r = null; await withFakeProviderOK(async () => { r = seedRunAtProfessionals("Examinez cette demande de test de livrables de bout en bout"); const st = r.read(); st.mission.reformulated = { missionReformulee: "M", perimetre: "p", horsPerimetre: "", livrableAttendu: livrable, ambiguites: [], documentsRole: [] }; r.write(st);
      if (prep) prep(r); const un = patchSeal();
      const restore = patchSP({ runPanel: async (input) => ({ checkpoint: fakeProCheckpoint(input.runId, input.attemptRunId), stats: { evaluated: 1 }, panelCounts: {} }), runDownstreamFromCheckpoint: async (input) => ({ checkpoint: fakeDownCheckpoint(input.runId, input.attemptRunId), summary: { twins: 1, blocked: 0, reviews: {}, qualification: "QUALIFIED_WITH_RESERVATIONS" } }) });
      try { out = await PL.advance(r.runId); } finally { restore(); un(); } }); return { out, r };
  }
  const gateArtifacts = (livrable, ack) => (r) => { const a = MD.assess(livrable); r.saveJson("mission-deliverables-assessment.json", a); const pc = r.loadJson("plan-confirmation.json"); pc.validation = { validatedBy: "Une Personne" }; r.saveJson("plan-confirmation.json", pc);
    r.saveJson("mission-deliverables-acceptance.json", { assessmentSha256: a.assessmentSha256, acknowledged: !!ack, acknowledgedIds: ack ? a.notSupported : [], validatedBy: "Une Personne", recordedAt: "t" }); };

  await T("MD-13", "bout en bout, livrable garanti : COMPLETED ; report.missionDeliverables (origine GATE) tous PRODUCED ; en-tete MISSION_DELIVERABLES = COMPLETE ; reportHash valide ; mission-deliverables.json persiste ; state.summary porte l'etat", async () => {
    const { out, r } = await runToEnd(SIMPLE, gateArtifacts(SIMPLE, false)); const rep = r.loadJson("report.json");
    assert(out.status === "COMPLETED" && rep.missionDeliverables.origin === "GATE" && rep.missionDeliverables.items.every((i) => i.status === "PRODUCED") && rep.headline.MISSION_DELIVERABLES === "COMPLETE" && SRP.verifyReportHash(rep).valid && out.summary.MISSION_DELIVERABLES === "COMPLETE" && out.summary.reportHash === rep.reportHash && r.loadJson("mission-deliverables.json").overall === "COMPLETE", JSON.stringify([out.status, rep.missionDeliverables && rep.missionDeliverables.items.map((i) => i.status)])); });

  /* MD-14 : attente CORRIGEE par le correctif B1. Attente historique (fautive) : « COMPLETED, MISSION_DELIVERABLES = PARTIAL_BY_DESIGN_ACKNOWLEDGED,
     acceptedMissing = 0 ». Elle verrouillait le defaut : une reconnaissance faisait disparaitre le livrable du contrat et laissait le run se dire termine. */
  await T("MD-14", "bout en bout, livrables non garantis RECONNUS a la porte : INCOMPLETE_DELIVERABLES (B1 : ACK n'est pas une renonciation), MISSION_DELIVERABLES = INCOMPLETE, les 4 restent REQUESTED, acceptes, reconnus et visibles NOT_PRODUCED_BY_DESIGN (jamais masques)", async () => {
    const { out, r } = await runToEnd(RICH, gateArtifacts(RICH, true)); const rep = r.loadJson("report.json"); const md = rep.missionDeliverables;
    assert(out.status === "INCOMPLETE_DELIVERABLES" && md.overall === "INCOMPLETE" && md.acceptedMissing.length === 4 && md.items.filter((i) => i.status === "NOT_PRODUCED_BY_DESIGN" && i.acknowledgedAsNotProduced && i.accepted && i.requestedStatus === "REQUESTED").length === 4, JSON.stringify([out.status, md.overall, md.summary, md.acceptedMissing]));
    assert(md.acceptance && md.acceptance.acknowledged === true && md.acceptance.acknowledgedIds.length === 4 && md.origin === "GATE", JSON.stringify(md.acceptance));
    assert(rep.headline.MISSION_DELIVERABLES === "INCOMPLETE" && SRP.verifyReportHash(rep).valid && /n'est pas présenté comme terminé/.test(out.userMessage), rep.headline.MISSION_DELIVERABLES); });

  await T("MD-15", "bout en bout, run SANS evaluation de porte (anterieur a v1.0.17) et livrable non garanti : JAMAIS COMPLETED => INCOMPLETE_DELIVERABLES (terminal, rapport conserve et verifie, reserve DELIVERABLES_ASSESSED_AFTER_GATE) ; une nouvelle reprise ne rejoue rien ; replay des revues autorise et archive mission-deliverables.json", async () => {
    const { out, r } = await runToEnd(RICH, null); const rep = r.loadJson("report.json");
    assert(out.status === "INCOMPLETE_DELIVERABLES" && rep && SRP.verifyReportHash(rep).valid && rep.headline.MISSION_DELIVERABLES === "INCOMPLETE" && rep.missionDeliverables.origin === "RETROSPECTIVE_NO_GATE" && rep.missionDeliverables.reservations.some((x) => x.code === "DELIVERABLES_ASSESSED_AFTER_GATE") && rep.missionDeliverables.acceptedMissing.length === 4 && /n'est pas présenté comme terminé/.test(out.userMessage), JSON.stringify([out.status, out.userMessage]));
    const restore = patchSP({ runPanel: async () => { throw new Error("NE DOIT PAS etre rappele"); }, runDownstreamFromCheckpoint: async () => { throw new Error("NE DOIT PAS etre rappele"); } });
    try { const again = await PL.advance(r.runId); assert(again.status === "INCOMPLETE_DELIVERABLES" && again.attempts === out.attempts, "terminal : aucune tentative"); } finally { restore(); }
    const rp = PL.replayReviews(r.runId, { requestedBy: "Testeur" }); assert(rp.ok && rp.archived.indexOf("mission-deliverables.json") !== -1 && rp.state.status === "STOPPED", JSON.stringify(rp.archived)); });

  await T("MD-16", "acceptation NON liee (identite differente de la confirmation reelle, ou empreinte d'une autre evaluation) : ignoree => tout est accepte => INCOMPLETE_DELIVERABLES + reserve DELIVERABLES_ACCEPTANCE_NOT_BOUND ; evaluation alteree => DELIVERABLES_ASSESSMENT_DRIFT", async () => {
    const t1 = await runToEnd(RICH, (r) => { gateArtifacts(RICH, true)(r); const acc = r.loadJson("mission-deliverables-acceptance.json"); acc.validatedBy = "Quelqu'un d'autre"; r.saveJson("mission-deliverables-acceptance.json", acc); });
    const md1 = t1.r.loadJson("report.json").missionDeliverables; assert(t1.out.status === "INCOMPLETE_DELIVERABLES" && md1.acceptance === null && md1.reservations.some((x) => x.code === "DELIVERABLES_ACCEPTANCE_NOT_BOUND"), JSON.stringify(md1.reservations));
    const t2 = await runToEnd(RICH, (r) => { gateArtifacts(RICH, true)(r); const a = r.loadJson("mission-deliverables-assessment.json"); a.deliverables.forEach((d) => { d.gateClass = "SUPPORTED"; }); r.saveJson("mission-deliverables-assessment.json", a); });
    const md2 = t2.r.loadJson("report.json").missionDeliverables; assert(t2.out.status === "INCOMPLETE_DELIVERABLES" && md2.origin === "RETROSPECTIVE_DRIFT" && md2.reservations.some((x) => x.code === "DELIVERABLES_ASSESSMENT_DRIFT") && md2.items.filter((i) => i.status === "NOT_PRODUCED_BY_DESIGN").length === 4, JSON.stringify(md2.reservations)); });

  await T("MD-17", "runs seedes sans reformulation (tests historiques) : 0 livrable declare => COMPLETED inchange, MISSION_DELIVERABLES = NO_DELIVERABLE_DECLARED", async () => {
    let out = null, rr = null; await withFakeProviderOK(async () => { const r = seedRunAtProfessionals("Examinez cette demande de test sans reformulation"); rr = r; const un = patchSeal();
      const restore = patchSP({ runPanel: async (input) => ({ checkpoint: fakeProCheckpoint(input.runId, input.attemptRunId), stats: { evaluated: 1 }, panelCounts: {} }), runDownstreamFromCheckpoint: async (input) => ({ checkpoint: fakeDownCheckpoint(input.runId, input.attemptRunId), summary: { twins: 1, blocked: 0, reviews: {}, qualification: "QUALIFIED_WITH_RESERVATIONS" } }) });
      try { out = await PL.advance(r.runId); } finally { restore(); un(); } });
    assert(out.status === "COMPLETED" && rr.loadJson("report.json").headline.MISSION_DELIVERABLES === "NO_DELIVERABLE_DECLARED"); });

  await T("MD-18", "serveur : POST /api/runs/:id/confirm-plan sans reconnaissance => 400 DELIVERABLES_ACK_REQUIRED (details) ; GET gate => evaluation des livrables", async () => {
    const r = seedAtPlanGate(RICH); process.env.EVIDENCEFORGE_PORT = "0"; const { server } = require("../server.js");
    if (!server.listening) server.listen(0, "127.0.0.1"); await new Promise((res) => (server.listening ? res() : server.once("listening", res))); const port = server.address().port;
    const call = (p, opt) => new Promise((res, rej) => { const rq = http.request({ host: "127.0.0.1", port, path: p, method: (opt && opt.method) || "GET", headers: { "content-type": "application/json" } }, (rs) => { let b = ""; rs.on("data", (d) => (b += d)); rs.on("end", () => res({ status: rs.statusCode, body: b })); }); rq.on("error", rej); rq.end(opt && opt.body); });
    try { const c = await call("/api/runs/" + r.runId + "/confirm-plan", { method: "POST", body: JSON.stringify({ validatedBy: "Une Personne" }) }); const j = JSON.parse(c.body); assert(c.status === 400 && j.error === "DELIVERABLES_ACK_REQUIRED" && j.details.notSupported.length === 4, c.status + " " + c.body.slice(0, 200));
      const g = await call("/api/runs/" + r.runId + "/gate"); const gj = JSON.parse(g.body); assert(g.status === 200 && gj.deliverables && gj.deliverables.notSupported.length === 4, g.body.slice(0, 200)); }
    finally { server.close(); } });

  await T("MD-19", "interface : porte 1 affiche les livrables (produit / NON PRODUIT + raison), case de reconnaissance envoyee avec l'empreinte ; rapport : section « Livrables demandes » ; statut INCOMPLETE_DELIVERABLES libelle, rapport charge, reprise masquee ; script syntaxiquement valide", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    ["id=\"gpDeliverables\"", "id=\"gpAck\"", "body.deliverablesAcknowledged=$(\"#gpAck\").checked===true", "body.deliverablesAssessmentSha256=GATE_DLV.assessmentSha256", "function deliverablesSection(md)", "INCOMPLETE_DELIVERABLES:\"terminé — livrable(s) accepté(s) manquant(s)\"", "(s.status===\"COMPLETED\"||s.status===\"INCOMPLETE_DELIVERABLES\")&&!REPORT", "NON PRODUIT"].forEach((t) => assert(html.indexOf(t) !== -1, t));
    const scripts = html.match(/<script>([\s\S]*?)<\/script>/g).map((s) => s.replace(/^<script>|<\/script>$/g, "")); scripts.forEach((s) => new vm.Script(s)); });

  await T("MD-20", "non-regression par composition : stage-report.js, stage-mission.js, stage-ef01.js et la porte historique `confirmPlan` byte-identiques a v1.0.16 ; lots geles verifies (MONO-01/09/10/11, 0 divergence)", () => {
    ["stage-report.js", "stage-mission.js", "stage-ef01.js", "stage-professionals.js", "ef03b-resilience.js", "llm.js"].forEach((f) => assert(fs.readFileSync(path.join(ROOT, "lib", f), "utf8") === fs.readFileSync(path.join(V1016, "lib", f), "utf8"), f));
    const fn = (s, n) => { const i = s.indexOf("async function " + n + "("); return s.slice(i, s.indexOf("\n}\n", i) + 3); };
    const a = fs.readFileSync(path.join(ROOT, "lib", "pipeline.js"), "utf8"), b = fs.readFileSync(path.join(V1016, "lib", "pipeline.js"), "utf8"); assert(fn(a, "confirmPlan").length > 200 && fn(a, "confirmPlan") === fn(b, "confirmPlan"), "porte historique");
    const fr = P.verifyFrozenLots(); assert(Object.keys(fr).every((k) => fr[k].verified && fr[k].divergences.length === 0), JSON.stringify(fr)); });

  await T("MD-21", "vue de cout : un run INCOMPLETE_DELIVERABLES a un cout definitif (prevision COMPLETE) et compte dans l'historique de reference", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib", "cost-view.js"), "utf8"); assert(/state\.status === "INCOMPLETE_DELIVERABLES" \? "COMPLETED"/.test(src) && /st\.status !== "INCOMPLETE_DELIVERABLES"/.test(src));
    const CF = require("../lib/cost-forecast.js"); const stages = {}; CF.STAGES.forEach((s) => { stages[s] = { status: "DONE" }; }); const f = CF.forecast({ stages, status: "COMPLETED", totals: { totalUsd: 3, byStage: {} }, progress: {} }); assert(f.forecast.status === "COMPLETE"); });

  const RUN = process.env.EVIDENCEFORGE_MD_REPLAY_RUN;
  await T("MD-22", "rejeu LECTURE SEULE d'un run reel anterieur (EVIDENCEFORGE_MD_REPLAY_RUN ; SKIP sinon) : evaluation retrospective depuis mission.json + report.json, aucun octet du run modifie", () => {
    if (!RUN || !fs.existsSync(path.join(RUN, "mission.json"))) { console.log("       (SKIP : EVIDENCEFORGE_MD_REPLAY_RUN absent)"); return; }
    const snap = () => fs.readdirSync(RUN).filter((f) => fs.statSync(path.join(RUN, f)).isFile()).map((f) => f + ":" + crypto.createHash("sha256").update(fs.readFileSync(path.join(RUN, f))).digest("hex")).join("|");
    const before = snap(); const m = JSON.parse(fs.readFileSync(path.join(RUN, "mission.json"), "utf8")); const rep = JSON.parse(fs.readFileSync(path.join(RUN, "report.json"), "utf8"));
    const a = MD.assess(m.reformulation.livrableAttendu); const md = MD.evaluate({ assessment: a, report: rep, acceptance: null });
    console.log("       rejeu : " + a.deliverables.length + " livrables, non garantis = " + notSup(a).join(",") + " ; overall = " + md.overall + " ; " + JSON.stringify(md.summary));
    assert(md.overall === "INCOMPLETE" && md.summary.NOT_PRODUCED_ERROR === 0 && notSup(a).indexOf("BUSINESS_VERDICT") !== -1 && notSup(a).indexOf("DECISION_MATRIX") !== -1 && notSup(a).indexOf("STRUCTURED_CONTRACT") !== -1, JSON.stringify(md.summary));
    assert(snap() === before, "run reel inchange"); });

  /* ================= B1 — ACKNOWLEDGE_UNSUPPORTED_DELIVERABLE n'est PAS WAIVE_DELIVERABLE (audit independant v1.0.17) =================
     Defaut corrige : une reconnaissance etait assimilee a une renonciation implicite (accepted = false, acceptedMissing vide, run COMPLETED).
     Invariant garanti ici : un ACK informe, il ne modifie ni REQUESTED, ni l'acceptation, ni le contrat, et n'autorise jamais COMPLETED. */

  await T("B1-01", "livrable REQUESTED + non garanti + RECONNU + non produit => statut final INCOMPLETE_DELIVERABLES (bout en bout, moteur reel, aval factice)", async () => {
    const { out, r } = await runToEnd(RICH, gateArtifacts(RICH, true)); const md = r.loadJson("report.json").missionDeliverables;
    assert(out.status === "INCOMPLETE_DELIVERABLES" && out.status !== "COMPLETED" && md.runMayComplete === false, JSON.stringify([out.status, md.overall]));
    assert(md.acceptance && md.acceptance.acknowledged === true && md.acceptedMissing.length === 4, JSON.stringify([md.acceptance, md.acceptedMissing])); });

  await T("B1-02", "un ACK ne modifie pas le caractere REQUESTED du livrable : requested / requestedStatus identiques avec et sans reconnaissance, et l'evaluation de la porte reste REQUESTED", () => {
    const a = MD.assess(RICH); assert(a.deliverables.every((d) => d.status === "REQUESTED"), "evaluation de porte");
    const sans = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: { acknowledged: false, acknowledgedIds: [], validatedBy: "U" } });
    const avec = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: { acknowledged: true, acknowledgedIds: a.notSupported, validatedBy: "U" } });
    const shape = (md) => JSON.stringify(md.items.map((i) => [i.deliverableId, i.requested, i.requestedStatus, i.status, i.accepted]));
    assert(shape(sans) === shape(avec), shape(sans) + " != " + shape(avec));
    assert(avec.items.every((i) => i.requested === true && i.requestedStatus === "REQUESTED" && i.accepted === true), shape(avec)); });

  await T("B1-03", "un ACK ne supprime aucun livrable de acceptedMissing : la liste est identique avec et sans reconnaissance (totale ou partielle)", () => {
    const a = MD.assess(RICH); const rep = fakeReport();
    const sans = MD.evaluate({ assessment: a, report: rep, acceptance: { acknowledged: false, acknowledgedIds: [], validatedBy: "U" } }).acceptedMissing.join();
    const tout = MD.evaluate({ assessment: a, report: rep, acceptance: { acknowledged: true, acknowledgedIds: a.notSupported, validatedBy: "U" } }).acceptedMissing.join();
    const part = MD.evaluate({ assessment: a, report: rep, acceptance: { acknowledged: true, acknowledgedIds: a.notSupported.slice(0, 2), validatedBy: "U" } }).acceptedMissing.join();
    assert(sans === a.notSupported.join() && tout === sans && part === sans, JSON.stringify([sans, tout, part])); });

  await T("B1-04", "un ACK seul ne permet JAMAIS COMPLETED si un livrable manque : runMayComplete reste false pour toutes les formes de reconnaissance ; `accepted` est invariant dans le code ; aucun mecanisme de renonciation n'existe", () => {
    const a = MD.assess(RICH); const all = a.deliverables.map((d) => d.deliverableId);
    [[], a.notSupported, a.notSupported.slice(0, 1), all].forEach((ids) => { [true, false].forEach((flag) => {
      const md = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: { acknowledged: flag, acknowledgedIds: ids, validatedBy: "U" } });
      assert(md.runMayComplete === false && md.overall === "INCOMPLETE" && md.acceptedMissing.length === 4, JSON.stringify([flag, ids.length, md.overall, md.runMayComplete])); }); });
    const src = fs.readFileSync(path.join(ROOT, "lib", "mission-deliverables.js"), "utf8"); const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(/const accepted = true;/.test(code), "`accepted` doit etre un invariant");
    assert(!/accepted\s*=\s*(?!true;)/.test(code.replace("const accepted = true;", "")), "aucune autre affectation de `accepted`");
    assert(!/waiv|renonc|abandon/i.test(code), "aucun mecanisme de renonciation (waiver) n'est introduit par ce correctif"); });

  await T("B1-05", "plusieurs livrables, certains produits et un non garanti RECONNU : la partie produite reste PRODUCED, l'ensemble est INCOMPLETE (jamais masque par la reconnaissance)", () => {
    const a = MD.assess("Analyse documentaire avec réserves, et un verdict unique.");
    const unsup = a.deliverables.filter((d) => d.gateClass === "NOT_SUPPORTED"); assert(unsup.length === 1 && unsup[0].capabilityId === "BUSINESS_VERDICT", JSON.stringify(a.deliverables.map((d) => [d.capabilityId, d.gateClass])));
    const md = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: { acknowledged: true, acknowledgedIds: a.notSupported, validatedBy: "U" } });
    assert(md.summary.PRODUCED === a.deliverables.length - 1 && md.summary.NOT_PRODUCED_BY_DESIGN === 1 && md.overall === "INCOMPLETE" && md.runMayComplete === false && md.acceptedMissing.join() === unsup[0].deliverableId, JSON.stringify([md.summary, md.acceptedMissing])); });

  await T("B1-06", "tous les livrables reellement produits : COMPLETED reste possible (bout en bout) et overall = COMPLETE", async () => {
    const a = MD.assess(SIMPLE); const md = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: { acknowledged: false, acknowledgedIds: [], validatedBy: "U" } });
    assert(md.overall === "COMPLETE" && md.runMayComplete === true && md.acceptedMissing.length === 0, md.overall);
    const { out, r } = await runToEnd(SIMPLE, gateArtifacts(SIMPLE, false)); const rep = r.loadJson("report.json");
    assert(out.status === "COMPLETED" && rep.headline.MISSION_DELIVERABLES === "COMPLETE" && rep.missionDeliverables.items.every((i) => i.status === "PRODUCED"), JSON.stringify([out.status, rep.headline.MISSION_DELIVERABLES])); });

  await T("B1-07", "l'empreinte de la liste affichee a la porte de plan reste verifiee : gateView expose une evaluation verifiable et persistee, une empreinte etrangere est refusee (DELIVERABLES_ASSESSMENT_MISMATCH), une reconnaissance sans empreinte est refusee", async () => {
    const r = seedAtPlanGate(RICH); const gv = PL.gateView(r.runId);
    assert(gv.deliverables && MD.verifyAssessment(gv.deliverables) && gv.deliverables.assessmentSha256 === r.loadJson("mission-deliverables-assessment.json").assessmentSha256 && gv.deliverables.acknowledgementRequired === true, "evaluation persistee et verifiable");
    await assertThrows(() => PL.confirmPlan(r.runId, { validatedBy: "Une Personne", deliverablesAcknowledged: true, deliverablesAssessmentSha256: "f".repeat(64) }), "DELIVERABLES_ASSESSMENT_MISMATCH");
    await assertThrows(() => PL.confirmPlan(r.runId, { validatedBy: "Une Personne", deliverablesAcknowledged: true }), "DELIVERABLES_ASSESSMENT_MISMATCH");
    await assertThrows(() => PL.confirmPlan(r.runId, { validatedBy: "Une Personne" }), "DELIVERABLES_ACK_REQUIRED");
    assert(!r.loadJson("plan-confirmation.json") && !r.loadJson("mission-deliverables-acceptance.json") && r.read().status === "WAITING_USER", "aucune acceptation ecrite"); });

  await T("B1-08", "PROCESS_QUALIFICATION ne modifie pas le resultat d'un livrable reconnu : pour les 4 statuts, memes statuts d'items, meme acceptedMissing, meme INCOMPLETE", () => {
    const a = MD.assess(RICH); const acc = { acknowledged: true, acknowledgedIds: a.notSupported, validatedBy: "U" };
    const base = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: acc }); const key = (md) => JSON.stringify([md.items.map((i) => [i.deliverableId, i.status, i.accepted]), md.acceptedMissing, md.overall, md.runMayComplete]);
    ["QUALIFIED", "QUALIFIED_WITH_RESERVATIONS", "NOT_QUALIFIED", "IMPOSSIBLE_TO_ASSESS"].forEach((q) => {
      const rep = fakeReport({ headline: { PROCESS_QUALIFICATION: q, SCIENTIFICALLY_USABLE: "NO" }, qualification: { status: q, criteria: [{}], unknowns: [] } });
      const got = MD.evaluate({ assessment: a, report: rep, acceptance: acc }); assert(key(got) === key(base) && got.overall === "INCOMPLETE" && got.runMayComplete === false, q); }); });

  await T("B1-09", "SCIENTIFICALLY_USABLE ne modifie pas le resultat d'un livrable reconnu : YES / NO / absent => memes statuts, meme acceptedMissing, meme INCOMPLETE", () => {
    const a = MD.assess(RICH); const acc = { acknowledged: true, acknowledgedIds: a.notSupported, validatedBy: "U" };
    const key = (md) => JSON.stringify([md.items.map((i) => [i.deliverableId, i.status, i.accepted]), md.acceptedMissing, md.overall, md.runMayComplete]);
    const base = key(MD.evaluate({ assessment: a, report: fakeReport(), acceptance: acc }));
    ["YES", "NO"].forEach((u) => { const rep = fakeReport({ headline: { PROCESS_QUALIFICATION: "QUALIFIED", SCIENTIFICALLY_USABLE: u, scientificallyUsableRule: { value: u } } });
      assert(key(MD.evaluate({ assessment: a, report: rep, acceptance: acc })) === base, u); });
    const noHead = fakeReport(); delete noHead.headline; assert(key(MD.evaluate({ assessment: a, report: noHead, acceptance: acc })) === base, "sans en-tete"); });

  await T("B1-10", "garde de non-retour : l'etat « partiel reconnu » qui autorisait COMPLETED n'existe plus (ni dans le calcul, ni dans les libelles) ; le mutant qui remet ACK => accepted=false est tue par MD-08 / MD-14 / B1-01..B1-05 (preuve de mutation hors suite)", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib", "mission-deliverables.js"), "utf8");
    assert(src.indexOf("PARTIAL_BY_DESIGN_ACKNOWLEDGED") === -1, "etat « partiel reconnu » supprime");
    assert(Object.keys(MD.OVERALL_USER).sort().join() === "COMPLETE,INCOMPLETE,NO_DELIVERABLE_DECLARED", Object.keys(MD.OVERALL_USER).join());
    const a = MD.assess(RICH); const md = MD.evaluate({ assessment: a, report: fakeReport(), acceptance: { acknowledged: true, acknowledgedIds: a.notSupported, validatedBy: "U" } });
    assert(["COMPLETE", "INCOMPLETE", "NO_DELIVERABLE_DECLARED"].indexOf(md.overall) !== -1 && md.overall === "INCOMPLETE", md.overall); });
};
