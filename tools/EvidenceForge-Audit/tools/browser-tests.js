// Tests navigateur reels (CDP) pour v1.0.2 : CTA Reprendre sur FAILED reprenable, porte visible en mode expert, echec GET porte + Reessayer,
// source sans proposition (aucune erreur console, decision explicite), dedoublonnage des evenements apres reconnexion SSE.
const { spawn } = require("child_process"); const fs = require("fs"); const http = require("http");
const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const BASE = "http://127.0.0.1:8766"; const RR = process.argv[2];
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond, info }); console.log((cond ? "  ok   " : "  FAIL ") + name + (info ? " — " + info : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const chrome = spawn(CH, ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9340", "--window-size=1280,1400", "--user-data-dir=" + fs.mkdtempSync("/tmp/cdp-"), "about:blank"], { stdio: "ignore" });
  await sleep(1500);
  async function page(url) {
    const t = await (await fetch("http://127.0.0.1:9340/json/new?" + encodeURIComponent(url), { method: "PUT" })).json(); const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pending = new Map(); const consoleErrors = [];
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } else if (d.method === "Runtime.exceptionThrown") consoleErrors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300)); else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") consoleErrors.push(JSON.stringify(d.params.args).slice(0, 300)); };
    await new Promise((r) => (ws.onopen = r)); await send("Runtime.enable"); await sleep(3000);
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
    return { ev, consoleErrors, close: () => { ws.close(); fetch("http://127.0.0.1:9340/json/close/" + t.id).catch(() => {}); } };
  }
  /* 7 — FAILED reprenable : CTA visible */
  let p = await page(BASE + "/#run=efm-20260915-ui2fail");
  ok("FAILED reprenable : bouton « Reprendre le run » visible", await ev7(p), "");
  async function ev7(p) { return p.ev("(()=>{const b=document.getElementById('resumeBox');return !b.hidden && !!document.getElementById('btnResume');})()"); }
  ok("FAILED reprenable : statut affiche", (await p.ev("document.getElementById('runStatus').textContent")).length > 0); p.close();
  /* 8 — porte active visible depuis le mode expert */
  p = await page(BASE + "/#run=efm-20260915-ui2gate&mode=expert");
  ok("mode expert : bandeau de porte visible avec bouton", await p.ev("(()=>{const x=document.getElementById('exGate');return !x.hidden && !!document.getElementById('exGateGo') && /ratification/i.test(x.textContent);})()"));
  await p.ev("document.getElementById('exGateGo').click(); true"); await sleep(500);
  ok("mode expert : le bouton bascule en mode simple et affiche la carte de ratification", await p.ev("(()=>{return document.getElementById('expert').hidden && !document.getElementById('gateSources').hidden && !!document.getElementById('gsConfirm');})()"));
  /* 10 — source sans proposition : carte explicite, aucune erreur console, decision explicite */
  ok("source sans proposition : carte .noprop rendue avec « décision explicite requise »", await p.ev("(()=>{const c=[...document.querySelectorAll('.src.noprop')];return c.length===1 && /décision explicite requise/.test(c[0].textContent) && /Titre trois/.test(c[0].textContent);})()"));
  await p.ev("(()=>{const c=document.querySelector('.src.noprop .dec[data-id]');const b=c.querySelector('button[data-d=\"inclus\"]');b.click();return true;})()"); await sleep(200);
  ok("source sans proposition : clic « inclure » => choix enregistre et persiste (localStorage)", await p.ev("(()=>{const o=JSON.parse(localStorage.getItem('efm-overrides-efm-20260915-ui2gate')||'{}');return o.s3==='inclus' && document.querySelector('.src.noprop button.on.inclus')!==null;})()"));
  ok("source sans proposition : aucune exception console", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
  ok("ratification : compteur « incluse(s) » coherent (s1 + s3)", /2 incluse\(s\) \/ 3/.test(await p.ev("document.getElementById('gsCount').textContent")), await p.ev("document.getElementById('gsCount').textContent"));
  /* 11 — reconnexion SSE : rejeu de l'historique sans doublon d'affichage */
  const before = await p.ev("document.getElementById('log').children.length");
  await p.ev("(()=>{ES.close();ES=new EventSource('/api/runs/efm-20260915-ui2gate/events');ES.onmessage=(m)=>{const d=JSON.parse(m.data);if(d.type==='state')onState(d.state);if(d.type==='event'&&d.event.level==='user')logLine(d.event);};return true;})()").catch(() => {}); await sleep(1500);
  const after = await p.ev("document.getElementById('log').children.length");
  ok("reconnexion SSE : aucun doublon dans le journal (" + before + " -> " + after + ")", before === after && before > 0);
  /* choix conserve apres rechargement */
  p.close(); p = await page(BASE + "/#run=efm-20260915-ui2gate");
  ok("rechargement de la page : le choix local de ratification est restaure", await p.ev("(()=>{return document.querySelector('.src.noprop button.on.inclus')!==null;})()")); p.close();
  /* 9 — echec GET porte : message + Reessayer, sans mutation d'etat ; puis retablissement */
  p = await page(BASE + "/#run=efm-20260915-ui2gerr");
  ok("echec GET porte : message d'erreur + bouton Reessayer affiches", await p.ev("(()=>{const g=document.getElementById('gateErr');return !g.hidden && !!document.getElementById('gateRetry');})()"));
  const st1 = JSON.parse(fs.readFileSync(RR + "/efm-20260915-ui2gerr/state.json", "utf8"));
  fs.writeFileSync(RR + "/efm-20260915-ui2gerr/screening-evidence.json", JSON.stringify({ sourcesCount: 1, judged: 1, duplicates: 0, failedSourceIds: [], proposals: [{ sourceId: "s1", proposed: "inclus", justification: "j", evidence: [], confiance: "haute" }], notADecision: "n" }));
  fs.writeFileSync(RR + "/efm-20260915-ui2gerr/sources-enriched.json", JSON.stringify({ enriched: [{ sourceId: "s1", titre: "T" }] }));
  await p.ev("document.getElementById('gateRetry').click(); true"); await sleep(800);
  const st2 = JSON.parse(fs.readFileSync(RR + "/efm-20260915-ui2gerr/state.json", "utf8"));
  ok("echec GET porte : Reessayer affiche la porte, sans mutation de l'etat (updatedAt inchange)", (await p.ev("(()=>{return document.getElementById('gateErr').hidden && !document.getElementById('gateSources').hidden;})()")) && st1.updatedAt === st2.updatedAt, st1.updatedAt + " / " + st2.updatedAt);
  p.close(); chrome.kill();
  const failed = results.filter((r) => !r.ok).length; console.log("\n" + (results.length - failed) + "/" + results.length + " tests navigateur OK"); fs.writeFileSync(RR + "/browser-tests.json", JSON.stringify(results, null, 2)); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
