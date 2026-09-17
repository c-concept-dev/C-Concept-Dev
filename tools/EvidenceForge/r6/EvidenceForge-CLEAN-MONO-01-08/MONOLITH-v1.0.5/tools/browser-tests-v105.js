#!/usr/bin/env node
"use strict";
/**
 * MONOLITH v1.0.5 — tools/browser-tests-v105.js : tests NAVIGATEUR reels (Chrome headless via CDP) de l'interface v1.0.5 :
 * bloc « Coût du run » (reel / projection / budget), mise a jour du budget depuis la page, statut « budget atteint », Porte 2 avec
 * revue d'ensemble (signaux), aide (masquee par defaut, fermable), bouton de cadrage present, aucune exception console.
 * Seeds SYNTHETIQUES dans un dossier temporaire (aucun run reel touche) ; serveur v1.0.5 demarre par ce script SANS identifiants
 * fournisseur (aucun appel reel possible). Usage : node tools/browser-tests-v105.js [port]
 */
const { spawn } = require("child_process"); const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, ".."); const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PORT = Number(process.argv[2] || 8769); const BASE = "http://127.0.0.1:" + PORT; const CDP = 9341;
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond, info: info || "" }); console.log((cond ? "  ok   " : "  FAIL ") + name + (info && !cond ? " — " + info : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
(async () => {
  if (!fs.existsSync(CH)) { console.log("Chrome absent : tests navigateur ignores"); process.exit(0); }
  const RR = fs.mkdtempSync(path.join(os.tmpdir(), "efm-ui105-")); process.env.EVIDENCEFORGE_RUNS_ROOT = RR;
  const RS = require("../lib/run-store.js"); const CL = require("../lib/cost-ledger.js"); const BG = require("../lib/budget-guard.js"); const CPR = require("../lib/corpus-portfolio-review.js");
  /* seed 1 : run STOPPED / BUDGET_LIMIT_REACHED avec ledger + budget (plafond 1 USD, 3 USD depenses) */
  const mk = (runId, stage, status, extra) => { const r = RS.createRunStore(runId); const stages = {}; RS.STAGES.forEach((k) => { stages[k] = { status: "PENDING" }; }); ["MISSION", "DISCIPLINES", "PLAN", "RETRIEVAL", "CORPUS"].forEach((k) => { stages[k].status = "DONE"; });
    r.write(Object.assign({ schema: "EvidenceForge.MonolithRunState", runId, status, stage, stages, gate: null, createdAt: new Date().toISOString(), mission: { question: "Examiner cette demande de test navigateur v1.0.5", questionSha256: sha("q"), missionId: "m", documents: [] }, attempts: 1, counters: { llmReal: 2, llmReused: 0, openAlexCalls: 0 } }, extra || {})); return r; };
  const r1 = mk("efm-20260917-ui105bud", "PROFESSIONALS", "STOPPED", { error: { code: "BUDGET_LIMIT_REACHED", message: "BUDGET_LIMIT_REACHED", userMessage: "Le budget maximum que vous avez fixé (1.00 USD) est atteint : 3.00 USD dépensés. Le run est arrêté proprement AVANT tout nouvel appel payant.", at: new Date().toISOString(), stage: "PROFESSIONALS", resumable: true } });
  r1.stages = null; const l1 = CL.createCostLedger({ runDir: r1.dir, runId: r1.runId }); l1.setStage("RETRIEVAL"); l1.record({ kind: "REAL_CALL", model: "claude-opus-4-8", purpose: "screening", usage: { input_tokens: 10000, output_tokens: 2000 } }); l1.setStage("PROFESSIONALS"); l1.record({ kind: "REAL_CALL", model: "claude-opus-4-8", purpose: "EF-02D2 relevance", candidateRef: "https://openalex.org/A1", usage: { input_tokens: 100000, output_tokens: 100000 } });
  const b1 = BG.createBudgetGuard({ runDir: r1.dir, runId: r1.runId, ledger: l1 }); b1.set({ costBudgetUsd: 1, warningThresholdUsd: 0.5 }); try { b1.assertAllowed({ model: "claude-opus-4-8" }); } catch (e) { /* marque limitReachedAt */ }
  r1.saveJson("professionals-selection.json", { selectedCount: 10, poolCount: 10, cap: 150, capApplied: false, selectionOrder: [] }); r1.event({ level: "tech", event: "candidate_evidence", candidateId: "https://openalex.org/A1", corpus: "SUFFICIENT", relevance: "SUPPORTED", oracleCalls: 1 });
  /* seed 2 : run en Porte 2 avec revue de portefeuille */
  const srcs = [{ sourceId: "s1", titre: "Titre un sur la mesure des proprietes d'un questionnaire", resume: "mesure proprietes questionnaire fiabilite validite", discipline: "d1", type: "article" }, { sourceId: "s2", titre: "Titre deux : proprietes d'un questionnaire, fiabilite et validite", resume: "proprietes questionnaire fiabilite validite mesure", discipline: "d1", type: "article" }, { sourceId: "s3", titre: "Titre trois architecture logicielle", resume: "architecture logicielle locale", discipline: "d2", type: "article" }, { sourceId: "s4", titre: "Titre quatre gouvernance", resume: "gouvernance des donnees", discipline: "d3", type: "review" }];
  const ev = { schema: "EvidenceForge.MachineScreeningEvidence", sourcesCount: 4, judged: 4, duplicates: 0, failedSourceIds: [], proposals: srcs.map((s) => ({ sourceId: s.sourceId, proposed: s.sourceId === "s4" ? "exclu" : "inclus", justification: "j", evidence: [], confiance: "haute" })), notADecision: "x" };
  const r2 = mk("efm-20260917-ui105gate", "RETRIEVAL", "WAITING_USER", { gate: { id: RS.GATES.RATIFY_SOURCES, since: new Date().toISOString(), userMessage: "Ratifiez." } }); r2.saveJson("screening-evidence.json", ev); r2.saveJson("sources-enriched.json", { enriched: srcs });
  const dims = [{ id: "d1", label: "d1" }, { id: "d2", label: "d2" }, { id: "d3", label: "d3" }]; const pf = await CPR.buildCorpusPortfolioReview({ llm: null, mission: "m", dimensions: dims, sources: srcs, evidence: ev, config: { redundancySimilarityThreshold: 0.3 } });
  pf.methodologicalCrossDomainCandidates = [{ sourceId: "s4", domainRelevance: "basse", methodologicalRelevance: "haute", methodologicalInterest: "cadre de gouvernance transposable", anglesConcernes: ["d3"], evidence: [] }]; pf.suggestedReview.push({ sourceId: "s4", reasons: [{ code: "METHODOLOGICAL_RELEVANCE_DESPITE_DOMAIN" }] }); r2.saveJson("corpus-portfolio-review.json", pf);
  /* serveur v1.0.5 sans identifiants fournisseur */
  const env = Object.assign({}, process.env, { EVIDENCEFORGE_PORT: String(PORT), EVIDENCEFORGE_RUNS_ROOT: RR }); delete env.EVIDENCEFORGE_WORKER_API_KEY; delete env.LLM_WORKER_BASE_URL;
  const srv = spawn(process.execPath, [path.join(ROOT, "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] }); let srvOut = ""; srv.stdout.on("data", (d) => { srvOut += d; }); srv.stderr.on("data", (d) => { srvOut += d; });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + "/api/config"); if (r.ok) break; } catch (e) { /* pas encore */ } await sleep(250); }
  const cfg = await (await fetch(BASE + "/api/config")).json(); ok("serveur v1.0.5 : /api/config version + tarification exposee", cfg.version === "MONOLITH-v1.0.5" && cfg.pricing && cfg.pricing.version && cfg.pricing.modelPriced === true, JSON.stringify(cfg.pricing));
  const chrome = spawn(CH, ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=" + CDP, "--window-size=1280,1600", "--user-data-dir=" + fs.mkdtempSync(path.join(os.tmpdir(), "cdp105-")), "about:blank"], { stdio: "ignore" }); await sleep(1500);
  async function page(url) {
    const t = await (await fetch("http://127.0.0.1:" + CDP + "/json/new?" + encodeURIComponent(url), { method: "PUT" })).json(); const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pending = new Map(); const consoleErrors = [];
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } else if (d.method === "Runtime.exceptionThrown") consoleErrors.push(JSON.stringify(d.params.exceptionDetails && (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text)).slice(0, 300)); };
    await new Promise((r) => (ws.onopen = r)); await send("Runtime.enable"); await sleep(3500);
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
    return { ev, consoleErrors, close: () => { ws.close(); fetch("http://127.0.0.1:" + CDP + "/json/close/" + t.id).catch(() => {}); } };
  }
  try {
    /* 1 — run budget atteint : bloc cout, statut, budget, projection marquee */
    let p = await page(BASE + "/#run=efm-20260917-ui105bud");
    ok("statut : « budget atteint (reprenable après augmentation) »", /budget atteint/.test(await p.ev("document.getElementById('runStatus').textContent")), await p.ev("document.getElementById('runStatus').textContent"));
    ok("bloc « Coût du run » visible avec le dépensé réel (3.0x USD)", await p.ev("(()=>{const b=document.getElementById('costBox');return !b.hidden && /Dépensé \\(réel\\)/.test(b.textContent) && /3\\.0\\d USD/.test(b.textContent);})()"), await p.ev("document.getElementById('costCells').textContent"));
    ok("coût par étape courante + progression 1 / 10 professionnels", await p.ev("(()=>{const t=document.getElementById('costCells').textContent;return /1 \\/ 10 professionnels/.test(t) && /Coût de l'étape/.test(t);})()"), await p.ev("document.getElementById('costCells').textContent"));
    ok("projection marquée ESTIMATE — NOT GUARANTEE, jamais presentee comme certaine", await p.ev("/ESTIMATE — NOT GUARANTEE/.test(document.getElementById('costForecast').textContent)"));
    ok("budget : plafond 1.00 USD, reste 0.00, badge « plafond atteint »", await p.ev("(()=>{const t=document.getElementById('costBudget').textContent;return /plafond 1\\.00 USD/.test(t) && /reste avant plafond 0\\.00 USD/.test(t) && /plafond atteint/.test(t);})()"), await p.ev("document.getElementById('costBudget').textContent"));
    ok("CTA « Reprendre le run » visible (reprenable)", await p.ev("(()=>{const b=document.getElementById('resumeBox');return !b.hidden;})()"));
    /* 2 — mise a jour du budget depuis la page => budget.json + affichage */
    await p.ev("document.getElementById('rbMax').value='25';document.getElementById('rbWarn').value='20';document.getElementById('rbSave').click();true"); await sleep(1500);
    const bj = JSON.parse(fs.readFileSync(path.join(RR, "efm-20260917-ui105bud", "budget.json"), "utf8")); ok("mise à jour du budget depuis la page : budget.json = 25 / 20, historique conservé, marque d'arrêt effacée", bj.costBudgetUsd === 25 && bj.warningThresholdUsd === 20 && bj.history.length === 2 && bj.limitReachedAt === null, JSON.stringify(bj));
    ok("affichage : reste avant plafond 21.9x USD, plus de badge « plafond atteint »", await p.ev("(()=>{const t=document.getElementById('costBudget').textContent;return /plafond 25\\.00 USD/.test(t) && /reste avant plafond 21\\.9\\d USD/.test(t) && !/plafond atteint/.test(t);})()"), await p.ev("document.getElementById('costBudget').textContent"));
    ok("aucune exception console (run budget)", p.consoleErrors.length === 0, p.consoleErrors.join(" | ")); p.close();
    /* 3 — Porte 2 : revue d'ensemble + liste inchangee + nom obligatoire */
    p = await page(BASE + "/#run=efm-20260917-ui105gate");
    ok("Porte 2 visible avec la revue d'ensemble (signaux, pas une décision)", await p.ev("(()=>{const g=document.getElementById('gateSources');const pf=document.getElementById('gsPortfolio');return !g.hidden && /signaux, pas une décision/.test(pf.textContent) && /Couverture par angle/.test(pf.textContent);})()"), await p.ev("document.getElementById('gsPortfolio').textContent.slice(0,300)"));
    ok("groupe redondant affiché (titres un et deux) et méthode hors domaine (titre quatre)", await p.ev("(()=>{const t=document.getElementById('gsPortfolio').textContent;return /Groupe 1/.test(t) && /Titre un/.test(t) && /Titre deux/.test(t) && /Méthodes génériques hors domaine/.test(t) && /Titre quatre/.test(t);})()"), await p.ev("document.getElementById('gsPortfolio').textContent.slice(0,600)"));
    ok("étiquettes sur les sources signalées ; la liste garde ses boutons inclus/exclu ; nom obligatoire ; aucun bouton d'optimisation", await p.ev("(()=>{const tags=[...document.querySelectorAll('#gsList .tag')].map((x)=>x.textContent);return tags.some((t)=>/redondance possible/.test(t)) && document.querySelectorAll('#gsList .dec button').length>=6 && !!document.getElementById('gsName') && !/optimiser le corpus/i.test(document.body.textContent);})()"));
    await p.ev("document.getElementById('gsName').value='';document.getElementById('gsConfirm').click();true"); await sleep(800);
    ok("ratification sans nom refusée (HUMAN_IDENTITY_REQUIRED) : la porte reste ouverte", await p.ev("(()=>{const e=document.getElementById('gsErr');return !e.hidden && /nom/i.test(e.textContent) && !document.getElementById('gateSources').hidden;})()"), await p.ev("document.getElementById('gsErr').textContent"));
    ok("aucune exception console (porte 2)", p.consoleErrors.length === 0, p.consoleErrors.join(" | ")); p.close();
    /* 4 — accueil : aide masquee par defaut, s'ouvre et se ferme ; bouton de cadrage et budget presents ; run non lance */
    p = await page(BASE + "/");
    ok("aide masquée par défaut, bouton Aide présent", await p.ev("(()=>{return document.getElementById('helpCard').hidden && !!document.getElementById('btnHelp');})()"));
    await p.ev("document.getElementById('btnHelp').click();true"); await sleep(200);
    ok("clic Aide : panneau visible avec Porte 1 / Porte 2 / jumeaux / coût ; le formulaire reste utilisable", await p.ev("(()=>{const h=document.getElementById('helpCard');return !h.hidden && /Porte 1/.test(h.textContent) && /Porte 2/.test(h.textContent) && /jumeaux/.test(h.textContent) && /Coût du run/.test(h.textContent) && !document.getElementById('q').disabled;})()"));
    await p.ev("document.getElementById('btnHelpClose').click();true"); await sleep(200); ok("Fermer : aide masquée", await p.ev("document.getElementById('helpCard').hidden"));
    ok("bouton « Vérifier ma demande avec l'IA » et champs de budget présents ; fournisseur non configuré => « Analyser » désactivé", await p.ev("(()=>{return !!document.getElementById('btnPreflight') && !!document.getElementById('bMax') && !!document.getElementById('bWarn') && document.getElementById('start').disabled;})()"));
    ok("aucune exception console (accueil)", p.consoleErrors.length === 0, p.consoleErrors.join(" | ")); p.close();
  } finally { chrome.kill(); srv.kill(); }
  const failed = results.filter((r) => !r.ok).length; console.log("\n" + (results.length - failed) + "/" + results.length + " tests navigateur v1.0.5 OK");
  fs.writeFileSync(path.join(ROOT, "test", "browser-results-v105.json"), JSON.stringify({ schema: "EvidenceForge.MonolithBrowserTestResults", version: "MONOLITH-v1.0.5", ranAt: new Date().toISOString(), total: results.length, passed: results.length - failed, failed, results }, null, 2) + "\n");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
