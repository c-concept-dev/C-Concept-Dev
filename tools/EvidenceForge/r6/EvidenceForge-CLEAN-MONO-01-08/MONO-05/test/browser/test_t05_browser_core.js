"use strict";
const { chromium } = require("playwright");
const path = require("path");
const { startTestUpstreamServer, startOperatorServer, httpJson, buildRealCreateRunPayload, GRAPH_PATH } = require("../helpers.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const XSS_PAYLOAD = '<img src=x onerror="window.__XSS=1">';
const SECRET_PAYLOAD = "sk-TEST-NEVER-REAL-123";

(async () => {
  const upstream = await startTestUpstreamServer({
    "/llm": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ text: "ok" })); },
    "/openalex": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ results: [{ display_name: "S" }] })); },
  });
  const op = await startOperatorServer({
    providerConfigs: {
      "clone-proxy": { endpoint: upstream.baseUrl + "/llm", timeoutMs: 3000, method: "POST" },
      "openalex-proxy": { endpoint: upstream.baseUrl + "/openalex", timeoutMs: 3000, method: "GET" },
    },
  });

  const browser = await chromium.launch();

  {
    const page = await browser.newPage();
    const consoleMessages = [];
    page.on("console", (msg) => consoleMessages.push(msg.text()));
    await page.goto(op.baseUrl + "/");
    check("T05-01b. le titre de la page se charge réellement dans un vrai navigateur", (await page.title()).includes("EvidenceForge"));

    const missionId = XSS_PAYLOAD;
    const payload = await buildRealCreateRunPayload("mission-t05-browser-xss", "t05browserxss");
    payload.missionId = missionId;

    await page.click("#btnNewRun");
    await page.fill("#newRunId", "run-t05-browser-xss");
    await page.fill("#newMissionId", missionId);
    await page.fill("#newExternalInputs", JSON.stringify(payload.externalInputs));
    await page.click("section >> text=Créer");
    await page.waitForSelector("table");

    const xssFired = await page.evaluate(() => window.__XSS === 1);
    check("T05-28a. window.__XSS n'est JAMAIS déclenché après affichage d'un missionId contenant un payload XSS", xssFired !== true, JSON.stringify({ xssFired }));
    const bodyText = await page.textContent("body");
    check("T05-28b. le payload XSS apparaît comme TEXTE littéral dans la page", bodyText.includes(XSS_PAYLOAD), bodyText.slice(0, 50));
    const imgCount = await page.locator("img").count();
    check("T05-28c. aucune balise <img> réelle n'a été injectée dans le DOM", imgCount === 0, String(imgCount));

    const realGraph = require(GRAPH_PATH);
    const realNodeIds = realGraph.nodes.map((n) => n.nodeId);
    const nodeBoxTexts = await page.locator(".node-box > div:first-child").allTextContents();
    check("T05-05b. le graphe rendu dans un VRAI navigateur affiche EXACTEMENT les 14 IDs du vrai graphe MONO-02, dans le même ordre", JSON.stringify(nodeBoxTexts) === JSON.stringify(realNodeIds), JSON.stringify(nodeBoxTexts));

    const nodeBoxes = await page.locator(".node-box").all();
    let readyEnabledOk = true, blockedDisabledOk = true;
    for (let i = 0; i < nodeBoxes.length; i++) {
      const stateText = await nodeBoxes[i].locator(".badge").first().textContent();
      const runBtn = nodeBoxes[i].locator("button", { hasText: "Run" });
      const isDisabled = await runBtn.isDisabled();
      if (stateText.includes("READY") && isDisabled) readyEnabledOk = false;
      if (!stateText.includes("READY") && !isDisabled) blockedDisabledOk = false;
    }
    check("T05-07b. dans un vrai navigateur, le bouton Run est ACTIVÉ exactement pour les nœuds READY", readyEnabledOk);
    check("T05-08b. dans un vrai navigateur, le bouton Run est DÉSACTIVÉ pour tout nœud non-READY", blockedDisabledOk);

    const efOrchBox = page.locator(".node-box", { hasText: "EF-ORCH-SUBSYSTEM" });
    const runButton = efOrchBox.locator("button", { hasText: "Run" });
    await runButton.waitFor({ state: "visible" });
    // Deux clics natifs déclenchés dans le MÊME appel synchrone côté page —
    // ceci simule un vrai double-clic rapide sans passer par les contrôles
    // d'actionabilité de Playwright (qui attendraient que le bouton
    // redevienne "enabled" après le premier clic, ce qui masquerait
    // artificiellement la course réelle qu'on veut precisément observer).
    await runButton.evaluate((el) => {
      el.click();
      el.click();
    });
    await page.waitForTimeout(1500);
    const nodeDetailAfter = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-browser-xss/nodes/EF-ORCH-SUBSYSTEM");
    check("T05-39d. double-clic RÉEL dans un vrai navigateur -> le serveur n'a traité qu'une seule exécution logique (attemptCount=1)", nodeDetailAfter.body.attemptCount === 1, JSON.stringify(nodeDetailAfter.body.attemptCount));

    const outerHtml = await page.evaluate(() => document.documentElement.outerHTML);
    const localStorageDump = await page.evaluate(() => JSON.stringify(window.localStorage));
    const sessionStorageDump = await page.evaluate(() => JSON.stringify(window.sessionStorage));
    check("T05-18. le secret synthétique n'apparaît jamais dans document.documentElement.outerHTML", !outerHtml.includes(SECRET_PAYLOAD));
    check("T05-19. le secret synthétique n'apparaît jamais dans localStorage", !localStorageDump.includes(SECRET_PAYLOAD));
    check("T05-20. le secret synthétique n'apparaît jamais dans sessionStorage", !sessionStorageDump.includes(SECRET_PAYLOAD));
    check("T05-17c. AUCUN message console ne contient le secret synthétique", !consoleMessages.join("\n").includes(SECRET_PAYLOAD));

    await page.close();
  }

  {
    const page = await browser.newPage();
    await page.goto(op.baseUrl + "/");
    await page.click(`.run-item >> text=run-t05-browser-xss`);
    await page.waitForSelector("table");
    const beforeReload = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-browser-xss");
    await page.reload();
    await page.click(`.run-item >> text=run-t05-browser-xss`);
    await page.waitForSelector("table");
    const dashboardRows = await page.locator("table").first().locator("tr").allTextContents();
    const statusRowAfterReload = dashboardRows.find((r) => r.startsWith("status"));
    check("T05-38. après un VRAI rechargement de page, le statut affiché correspond exactement à celui du backend", statusRowAfterReload && statusRowAfterReload.includes(beforeReload.body.status), JSON.stringify({ statusRowAfterReload, backendStatus: beforeReload.body.status }));
    await page.close();
  }

  {
    const page = await browser.newPage();
    await page.goto(op.baseUrl + "/");
    await page.keyboard.press("Tab");
    const firstFocused = await page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
    check("T05-29a. Tab déplace réellement le focus vers un élément interactif", firstFocused === "btnNewRun" || firstFocused === "BUTTON", firstFocused);

    let reachedNewRunButton = false;
    for (let i = 0; i < 10 && !reachedNewRunButton; i++) {
      const activeId = await page.evaluate(() => document.activeElement.id);
      if (activeId === "btnNewRun") reachedNewRunButton = true;
      else await page.keyboard.press("Tab");
    }
    check("T05-29b. le bouton 'Nouveau run' est atteignable au clavier par tabulation successive", reachedNewRunButton);

    const outlineStyle = await page.evaluate(() => {
      const btn = document.getElementById("btnNewRun");
      btn.focus();
      return getComputedStyle(btn).outlineStyle;
    });
    check("T05-30. un élément focusé possède un style de focus visible (outline non 'none')", outlineStyle !== "none", outlineStyle);
    await page.close();
  }

  {
    const sizes = [
      { name: "desktop", width: 1440, height: 900, num: "31" },
      { name: "tablet", width: 1024, height: 768, num: "32" },
      { name: "mobile", width: 390, height: 844, num: "33" },
    ];
    for (const size of sizes) {
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
      await page.goto(op.baseUrl + "/");
      await page.click(`.run-item >> text=run-t05-browser-xss`);
      await page.waitForSelector("table");
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      check(`T05-${size.num}. à ${size.width}x${size.height} (${size.name}), aucun débordement horizontal critique`, scrollWidth <= clientWidth + 20, JSON.stringify({ scrollWidth, clientWidth }));
      const runButtonVisible = await page.locator(".node-box button", { hasText: "Run" }).first().isVisible();
      check(`T05-${size.num}b. à ${size.width}x${size.height}, au moins un bouton d'action reste visible/accessible`, runButtonVisible);
      await page.screenshot({ path: path.join(__dirname, "..", "..", "reports", "screenshot-" + size.name + ".png"), fullPage: true }).catch(() => {});
      await page.close();
    }
  }

  await browser.close();
  await op.close();
  await upstream.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
