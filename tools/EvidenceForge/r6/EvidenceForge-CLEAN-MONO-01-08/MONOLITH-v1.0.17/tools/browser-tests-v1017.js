#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0.17 — tools/browser-tests-v1017.js : tests NAVIGATEUR reels (Chrome headless via CDP) du MISSION CONTRACT ENFORCEMENT :
 * Porte 1 (livrables produits / NON PRODUITS, case de reconnaissance, refus sans reconnaissance), rapport (section « Livrables demandés »,
 * statut INCOMPLETE_DELIVERABLES), rapport anterieur sans missionDeliverables. Seeds SYNTHETIQUES, serveur SANS identifiants (aucun appel reel).
 * Usage : node tools/browser-tests-v1017.js [port]
 */
const { spawn } = require("child_process"); const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, ".."); const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PORT = Number(process.argv[2] || 8777); const BASE = "http://127.0.0.1:" + PORT; const CDP = PORT + 100;
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log((cond ? "  ok   " : "  FAIL ") + name + (info && !cond ? " — " + info : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const RICH = "Rapport de revue documentaire structuré section par section et question par question sur le référentiel fourni, incluant la traçabilité des jumeaux documentaires, les revues individuelles indépendantes, une matrice de décision par requirement, un verdict unique parmi quatre options, et, si le verdict l'autorise, un contrat d'entrée en tableau et en JSON.";
(async () => {
  if (!fs.existsSync(CH)) { console.log("Chrome absent : tests navigateur ignores"); process.exit(0); }
  const RR = fs.mkdtempSync(path.join(os.tmpdir(), "efm-ui1017-")); process.env.EVIDENCEFORGE_RUNS_ROOT = RR;
  const RS = require("../lib/run-store.js"); const MD = require("../lib/mission-deliverables.js"); const SRP = require("../lib/stage-report.js");
  const mk = (runId, status, done, extra) => { const r = RS.createRunStore(runId); const stages = {}; RS.STAGES.forEach((k) => { stages[k] = { status: done.indexOf(k) !== -1 ? "DONE" : "PENDING" }; });
    r.write(Object.assign({ schema: "EvidenceForge.MonolithRunState", runId, status, stage: "REPORT", stages, gate: null, createdAt: new Date().toISOString(), mission: { question: "Examiner cette demande de test navigateur v1.0.17", questionSha256: sha("q"), missionId: "m", documents: [], reformulated: { missionReformulee: "M", perimetre: "p", horsPerimetre: "", livrableAttendu: RICH, ambiguites: [], documentsRole: [] } }, attempts: 1, counters: { llmReal: 0, llmReused: 0, openAlexCalls: 0 }, seal: null, summary: null, userMessage: null, error: null }, extra || {})); return r; };
  const env = Object.assign({}, process.env, { EVIDENCEFORGE_PORT: String(PORT), EVIDENCEFORGE_RUNS_ROOT: RR }); delete env.EVIDENCEFORGE_WORKER_API_KEY; delete env.LLM_WORKER_BASE_URL;
  const srv = spawn(process.execPath, [path.join(ROOT, "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] }); let srvOut = ""; srv.stdout.on("data", (d) => { srvOut += d; }); srv.stderr.on("data", (d) => { srvOut += d; });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + "/api/config"); if (r.ok) break; } catch (e) { /* attente */ } await sleep(250); }
  /* seed 1 : run en attente de la Porte 1, livrable riche (4 livrables non produits par cette version) */
  const r1 = mk("efm-20261002-ui1017gate", "WAITING_USER", ["MISSION", "DISCIPLINES", "PLAN"], { stage: "RETRIEVAL", gate: { id: "CONFIRM_PLAN", since: new Date().toISOString(), userMessage: "Vérifiez puis confirmez." } });
  r1.saveJson("disciplines.json", { runContract: { disciplinesProposees: [] }, disciplinesRetenues: [{ label: "angle-a", justification: "j" }], resolver: { resolverRuns: [] } }); r1.saveJson("plan.json", { userView: { requetes: [] } });
  /* seed 2 : run termine INCOMPLETE_DELIVERABLES (rapport conserve, missionDeliverables) */
  const r2 = mk("efm-20261002-ui1017inc", "INCOMPLETE_DELIVERABLES", RS.STAGES.slice(), { summary: { PROCESS_QUALIFICATION: "QUALIFIED_WITH_RESERVATIONS", MISSION_DELIVERABLES: "INCOMPLETE" }, userMessage: "Analyse produite, mais 4 livrable(s) accepté(s) n'est (ne sont) pas produit(s) : le run n'est pas présenté comme terminé." });
  const base = SRP.buildUserReport({ state: { runId: r2.runId, mission: { question: "Q", documents: [] } }, reformulation: { missionReformulee: "M" }, runContract: { disciplinesProposees: [] }, reviewSet: { reviews: [], summary: { reviewsComplete: 1 } }, aggregation: { aggregates: [] }, twinSet: { twins: [] }, qualification: { status: "QUALIFIED_WITH_RESERVATIONS", reservations: [{ code: "R", detail: "d" }], criteria: [], unknowns: [] } });
  const rep2 = MD.attachToReport(base, MD.evaluate({ assessment: MD.assess(RICH), report: base, acceptance: null }), SRP.computeReportHash); r2.saveJson("report.json", rep2);
  /* seed 3 : run COMPLETED avec un rapport ANTERIEUR (sans missionDeliverables) */
  const r3 = mk("efm-20261002-ui1017old", "COMPLETED", RS.STAGES.slice(), { summary: { PROCESS_QUALIFICATION: "QUALIFIED_WITH_RESERVATIONS" } }); r3.saveJson("report.json", Object.assign({}, base, { runId: r3.runId }));
  const cfg = await (await fetch(BASE + "/api/config")).json(); ok("serveur v1.0.17 : /api/config version", cfg.version === require("../config/monolith.config.json").product.version && cfg.version === "MONOLITH-v1.0.17", JSON.stringify(cfg).slice(0, 200));
  const g = await (await fetch(BASE + "/api/runs/" + r1.runId + "/gate")).json(); ok("API gate : evaluation des livrables (4 non produits, reconnaissance requise)", g.deliverables && g.deliverables.notSupported.length === 4 && g.deliverables.acknowledgementRequired === true, JSON.stringify(g).slice(0, 300));
  const chrome = spawn(CH, ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=" + CDP, "--window-size=1280,1600", "--user-data-dir=" + fs.mkdtempSync(path.join(os.tmpdir(), "cdp1017-")), "about:blank"], { stdio: "ignore" }); for (let i = 0; i < 80; i++) { try { const r = await fetch("http://127.0.0.1:" + CDP + "/json/version"); if (r.ok) break; } catch (e) { /* attente */ } await sleep(250); }
  async function page(url) {
    const t = await (await fetch("http://127.0.0.1:" + CDP + "/json/new?" + encodeURIComponent(url), { method: "PUT" })).json(); const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pending = new Map(); const consoleErrors = [];
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } else if (d.method === "Runtime.exceptionThrown") consoleErrors.push(JSON.stringify(d.params.exceptionDetails && (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text)).slice(0, 300)); };
    await new Promise((r) => (ws.onopen = r)); await send("Runtime.enable"); await sleep(3500);
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
    return { ev, consoleErrors, close: () => { ws.close(); fetch("http://127.0.0.1:" + CDP + "/json/close/" + t.id).catch(() => {}); } };
  }
  try {
    const p = await page(BASE + "/#run=" + r1.runId);
    ok("UI Porte 1 : « Livrables demandés » liste 4 « NON PRODUIT » (avec raison) et des livrables « produit » ; case de reconnaissance visible et decochee", await p.ev("(()=>{const b=document.getElementById('gpDeliverables');const t=b.textContent;return !document.getElementById('gatePlan').hidden && (t.match(/NON PRODUIT/g)||[]).length===4 && /produit/.test(t) && /verdict/i.test(t) && !document.getElementById('gpAckBox').hidden && document.getElementById('gpAck').checked===false;})()"), await p.ev("document.getElementById('gpDeliverables').textContent.slice(0,400)"));
    await p.ev("(()=>{document.getElementById('gpName').value='Une Personne';document.getElementById('gpConfirm').click();return true;})()"); await sleep(1500);
    ok("UI Porte 1 : confirmer SANS cocher => refus affiche (reconnaissance exigee), aucun plan confirme", (await p.ev("(()=>{const e=document.getElementById('gpErr');return !e.hidden && /Reconnaissez-le explicitement/.test(e.textContent);})()")) && !fs.existsSync(path.join(r1.dir, "plan-confirmation.json")) && !fs.existsSync(path.join(r1.dir, "mission-deliverables-acceptance.json")), await p.ev("document.getElementById('gpErr').textContent"));
    await p.ev("(()=>{document.getElementById('gpAck').checked=true;document.getElementById('gpConfirm').click();return true;})()"); await sleep(2000);
    const err2 = await p.ev("document.getElementById('gpErr').textContent");
    ok("UI Porte 1 : apres reconnaissance, la requete porte l'empreinte affichee (le refus de reconnaissance disparait ; la suite releve de la porte historique)", !/Reconnaissez-le explicitement|ne correspond pas à celle de ce plan/.test(err2), err2);
    ok("aucune exception console (porte 1)", p.consoleErrors.length === 0, p.consoleErrors.join(" | ")); p.close();
    const p2 = await page(BASE + "/#run=" + r2.runId);
    ok("UI run INCOMPLETE_DELIVERABLES : statut « livrable(s) accepté(s) manquant(s) », rapport charge, section « Livrables demandés » (MISSION_DELIVERABLES = INCOMPLETE, 4 non produits par conception), reprise masquee", await p2.ev("(()=>{const u=document.body.textContent;const r=document.getElementById('rpBody');return /livrable\\(s\\) accepté\\(s\\) manquant\\(s\\)/.test(document.getElementById('runStatus').textContent) && r && /Livrables demandés/.test(r.textContent) && /MISSION_DELIVERABLES = INCOMPLETE/.test(r.textContent) && (r.textContent.match(/non produit par conception/g)||[]).length===4 && document.getElementById('btnResume').hidden===true;})()"), await p2.ev("(document.getElementById('runStatus').textContent+' | '+(document.getElementById('rpBody')||{}).textContent).slice(0,500)"));
    ok("aucune exception console (run incomplet)", p2.consoleErrors.length === 0, p2.consoleErrors.join(" | ")); p2.close();
    const p3 = await page(BASE + "/#run=" + r3.runId);
    ok("UI rapport ANTERIEUR (sans missionDeliverables) : rendu inchange, aucune section « Livrables demandés »", await p3.ev("(()=>{const r=document.getElementById('rpBody');return r && /Établi/.test(r.textContent) && !/Livrables demandés/.test(r.textContent);})()"), await p3.ev("((document.getElementById('rpBody')||{}).textContent||'').slice(0,200)"));
    ok("aucune exception console (rapport anterieur)", p3.consoleErrors.length === 0, p3.consoleErrors.join(" | ")); p3.close();
  } finally { chrome.kill(); srv.kill(); }
  const failed = results.filter((r) => !r.ok).length; console.log("\n" + (results.length - failed) + "/" + results.length + " tests navigateur v1.0.17 OK");
  fs.writeFileSync(path.join(ROOT, "test", "browser-results-v1017.json"), JSON.stringify({ schema: "EvidenceForge.MonolithBrowserTestResults", version: "MONOLITH-v1.0.17", ranAt: new Date().toISOString(), total: results.length, passed: results.length - failed, failed, results }, null, 2) + "\n");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
