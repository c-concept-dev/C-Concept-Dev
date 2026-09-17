"use strict";
// app.js — CDC MONO-05. Le navigateur ne parle qu'à /api/* (OperatorApi).
// Aucun accès direct à un module gelé, un backend, ou un secret. Toute
// action (run/resume/retry) est revalidée côté serveur.
//
// RÈGLE XSS : jamais `el.innerHTML = texte utilisateur`. Tout contenu
// documentaire/variable passe par `textContent`.

let currentRunId = null;
let pollTimer = null;
let lastClickInFlight = new Set();

const HELP = { lineage: "Chaîne de traçabilité entre les artefacts amont et le rapport final." };

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children || []) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

async function api(path, options) {
  const res = await fetch("/api" + path, {
    method: (options && options.method) || "GET",
    headers: { "Content-Type": "application/json" },
    body: options && options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "Erreur");
    err.code = data.errorCode;
    err.details = data.details;
    throw err;
  }
  return data;
}

function stateBadge(state) {
  return el("span", { class: "badge state-" + state }, [el("span", { class: "dot" }, []), state]);
}

async function refreshRunsList() {
  const runs = await api("/runs");
  const nav = document.getElementById("runsList");
  nav.textContent = "";
  for (const run of runs) {
    const btn = el(
      "button",
      { class: "run-item", "aria-current": String(run.runId === currentRunId), onclick: () => openRun(run.runId) },
      [el("div", { text: run.runId }, []), stateBadge(run.status === "running" ? "RUNNING" : run.status === "completed" ? "SUCCESS" : run.status === "failed" ? "FAILED" : "BLOCKED")]
    );
    nav.appendChild(btn);
  }
}

async function openRun(runId) {
  currentRunId = runId;
  stopPolling();
  await renderRun(runId);
  await refreshRunsList();
  maybeStartPolling();
}

async function renderRun(runId) {
  const content = document.getElementById("content");
  content.textContent = "";
  let run, graph, deps, lineage;
  try {
    [run, graph, deps, lineage] = await Promise.all([api(`/runs/${runId}`), api(`/runs/${runId}/graph`), api(`/runs/${runId}/dependencies`), api(`/runs/${runId}/lineage`)]);
  } catch (e) {
    content.appendChild(renderErrorBox(e));
    return;
  }

  content.appendChild(renderDashboardSection(run));
  content.appendChild(await renderGraphSection(runId, graph));
  content.appendChild(renderDependenciesSection(deps));
  content.appendChild(await renderArtifactsSection(runId));
  content.appendChild(renderLineageSection(runId, lineage));
}

function renderErrorBox(e) {
  return el("div", { class: "error-box", role: "alert" }, [el("strong", { text: (e.code || "ERROR") + " " }, []), el("span", { text: e.message }, [])]);
}

function renderDashboardSection(run) {
  const rows = [
    ["runId", run.runId],
    ["missionId", run.missionId],
    ["status", run.status],
    ["createdAt", run.createdAt],
    ["updatedAt", run.updatedAt],
    ["currentReadyNodes", (run.currentReadyNodes || []).join(", ") || "—"],
    ["lastError", run.lastError ? run.lastError.code + " — " + run.lastError.message : "—"],
    ["lineageStatus", run.lineageStatus ? run.lineageStatus.status : "NOT_RUN"],
  ];
  const table = el("table", {}, rows.map(([k, v]) => el("tr", {}, [el("th", { text: k }, []), el("td", { text: String(v) }, [])])));
  return el("section", { "aria-label": "Tableau de bord du run" }, [el("h2", { text: "Run" }, []), table]);
}

async function renderGraphSection(runId, graph) {
  const box = el("div", { class: "graph" }, []);
  for (const n of graph.nodes) {
    const nodeBox = el("div", { class: "node-box" }, [el("div", { text: n.nodeId }, []), stateBadge(n.state)]);
    const actions = await renderNodeActions(runId, n.nodeId, n.state);
    nodeBox.appendChild(actions);
    box.appendChild(nodeBox);
  }
  return el("section", { "aria-label": "Graphe d'orchestration" }, [el("h2", { text: "Pipeline (14 nœuds)" }, []), box]);
}

async function renderNodeActions(runId, nodeId, state) {
  const wrap = el("div", {}, []);
  const runBtn = el("button", { type: "button", text: "Run" }, []);
  runBtn.disabled = state !== "READY";
  runBtn.addEventListener("click", () => performAction(runId, nodeId, "run", runBtn));
  wrap.appendChild(runBtn);

  if (state === "PAUSED" || state === "FAILED") {
    const resumeBtn = el("button", { type: "button", text: "Resume" }, []);
    resumeBtn.addEventListener("click", () => performAction(runId, nodeId, "resume", resumeBtn));
    wrap.appendChild(resumeBtn);

    const retryBtn = el("button", { type: "button", text: "Retry" }, []);
    retryBtn.addEventListener("click", () => performAction(runId, nodeId, "retry", retryBtn));
    wrap.appendChild(retryBtn);
  }
  return wrap;
}

async function performAction(runId, nodeId, action, button) {
  const key = runId + ":" + nodeId + ":" + action;
  if (lastClickInFlight.has(key)) return;
  lastClickInFlight.add(key);
  button.disabled = true;
  try {
    await api(`/runs/${runId}/nodes/${nodeId}/${action}`, { method: "POST" });
  } catch (e) {
    document.getElementById("content").appendChild(renderErrorBox(e));
  } finally {
    lastClickInFlight.delete(key);
    await renderRun(runId);
    maybeStartPolling();
  }
}

function renderDependenciesSection(deps) {
  const table = el(
    "table",
    {},
    [el("tr", {}, [el("th", { text: "provider" }, []), el("th", { text: "type" }, []), el("th", { text: "configured" }, []), el("th", { text: "available" }, [])])].concat(
      deps.map((d) => el("tr", {}, [el("td", { text: d.provider }, []), el("td", { text: d.dependencyType }, []), el("td", { text: String(d.configured) }, []), el("td", { text: String(d.available) }, [])]))
    )
  );
  return el("section", { "aria-label": "Dépendances externes" }, [el("h2", { text: "Dépendances externes" }, []), table]);
}

async function renderArtifactsSection(runId) {
  const artifacts = await api(`/runs/${runId}/artifacts`).catch(() => []);
  const table = el(
    "table",
    {},
    [el("tr", {}, [el("th", { text: "nodeId" }, []), el("th", { text: "contract" }, []), el("th", { text: "contentHash" }, []), el("th", { text: "createdAt" }, [])])].concat(
      artifacts.map((a) => el("tr", {}, [el("td", { text: a.nodeId }, []), el("td", { text: a.contract }, []), el("td", { text: a.contentHash.slice(0, 12) + "…" }, []), el("td", { text: a.createdAt }, [])]))
    )
  );
  return el("section", { "aria-label": "Artefacts" }, [el("h2", { text: "Artefacts (lecture seule — jamais modifiables ici)" }, []), table]);
}

function renderLineageSection(runId, lineage) {
  const section = el("section", { "aria-label": "Lineage" }, [el("h2", { text: "Lineage Gate" }, []), stateBadge(lineage.status === "PASS" ? "SUCCESS" : lineage.status === "FAIL" ? "FAILED" : "NOT_STARTED"), el("p", { class: "help", text: HELP.lineage }, [])]);
  if (lineage.status === "PASS") {
    const btn = el("button", { type: "button", text: "Ouvrir le rapport" }, []);
    btn.addEventListener("click", async () => {
      try {
        const report = await api(`/runs/${runId}/report`);
        renderReport(report);
      } catch (e) {
        section.appendChild(renderErrorBox(e));
      }
    });
    section.appendChild(btn);
  } else {
    section.appendChild(el("p", { class: "help", text: "Rapport indisponible tant que EF-04-LINEAGE n'est pas PASS (aucun contournement possible)." }, []));
  }
  return section;
}

function renderReport(report) {
  const content = document.getElementById("content");
  const box = el("section", { "aria-label": "Rapport final" }, [el("h2", { text: "Rapport final" }, [])]);
  // CORRECTIF R3 (regressionId: MONO05-R3-REG-01, REAL_REPORT_ASSURANCE_UI_SHAPE)
  // — le vrai contrat EF-04A (MONO-01/dependencies/ef-04a-unified-report-v1.js,
  // gelé) place l'assurance sous report.lineage.lineageAssurance, jamais à la
  // racine du rapport. Une version antérieure lisait report.assuranceLevel
  // directement (toujours undefined sur un vrai rapport) — jamais un champ
  // dupliqué à la racine, jamais le producer modifié : la forme réelle du
  // contrat fait foi, uniquement l'affichage est corrigé ici.
  const assurance = report && report.lineage && report.lineage.lineageAssurance;
  if (assurance && typeof assurance.assuranceLevel === "string") {
    box.appendChild(el("p", { text: "assuranceLevel: " + assurance.assuranceLevel }, []));
    box.appendChild(el("p", { class: "help", text: "targetDocumentsHashBoundFromEF03=" + assurance.targetDocumentsHashBoundFromEF03 + " · documentaryTwinsHashBoundFromEF03=" + assurance.documentaryTwinsHashBoundFromEF03 }, []));
  } else {
    // FAIL-CLOSED (section 4 de la décision de gouvernance) : jamais un
    // "undefined" silencieux, jamais un niveau d'assurance inventé par
    // défaut (jamais "full"/"verified"/"scientific"/"high") — un état
    // explicite de donnée indisponible/incohérente.
    box.appendChild(el("p", { class: "help", text: "Assurance de lignée indisponible ou incohérente pour ce rapport — affichage refusé plutôt qu'une valeur devinée." }, []));
  }
  content.appendChild(box);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  document.getElementById("pollStatus").textContent = "";
}

function maybeStartPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!currentRunId) return;
    const graph = await api(`/runs/${currentRunId}/graph`).catch(() => null);
    if (!graph) return;
    const anyRunning = graph.nodes.some((n) => n.state === "RUNNING");
    document.getElementById("pollStatus").textContent = anyRunning ? "actualisation…" : "";
    if (anyRunning) {
      await renderRun(currentRunId);
    } else {
      stopPolling();
    }
  }, 3000);
}

document.getElementById("btnNewRun").addEventListener("click", () => {
  const content = document.getElementById("content");
  content.textContent = "";
  const runIdInput = el("input", { type: "text", id: "newRunId", "aria-label": "runId" }, []);
  const missionIdInput = el("input", { type: "text", id: "newMissionId", "aria-label": "missionId" }, []);
  const jsonInput = el("textarea", { id: "newExternalInputs", rows: "10", cols: "80", "aria-label": "externalInputs (JSON)" }, []);
  const submitBtn = el("button", { type: "button", text: "Créer" }, []);
  const form = el("section", {}, [
    el("h2", { text: "Nouveau run" }, []),
    el("label", { for: "newRunId", text: "runId " }, []),
    runIdInput,
    el("br", {}, []),
    el("label", { for: "newMissionId", text: "missionId " }, []),
    missionIdInput,
    el("br", {}, []),
    el("label", { for: "newExternalInputs", text: "externalInputs (JSON, doit inclure runContract déjà valide)" }, []),
    el("br", {}, []),
    jsonInput,
    el("br", {}, []),
    submitBtn,
  ]);
  content.appendChild(form);
  submitBtn.addEventListener("click", async () => {
    let externalInputs;
    try {
      externalInputs = JSON.parse(jsonInput.value || "{}");
    } catch (e) {
      content.appendChild(renderErrorBox({ code: "INVALID_JSON", message: "JSON invalide." }));
      return;
    }
    try {
      const created = await api("/runs", { method: "POST", body: { runId: runIdInput.value, missionId: missionIdInput.value, externalInputs } });
      await openRun(created.runId);
    } catch (e) {
      content.appendChild(renderErrorBox(e));
    }
  });
});

refreshRunsList();
