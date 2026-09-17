// EvidenceForge — EF-ORCH — Runner OpenAlex EF-01C2 — v0.1
// Portage fidèle de runOpenAlex() (vrai EF-01C2 v0.4), adapté au contrat
// connectorRunner attendu par l'exécuteur C2 orchestré :
//   async (connector, protocol) -> { sourcesTrouvees, log }
//
// Fidélité : même URL (OPENALEX_PROXY + /works), mêmes paramètres
// (search/per_page/page/sort), même logique de pagination/arrêt
// (maxPages local à une requête, maxResults global, budget global), même
// gestion d'erreur (retry avec backoff exponentiel PAR requête, jamais tout
// le connecteur), mêmes libellés de stopReason — copiés du code source, pas
// reformulés.
//
// Adaptation nécessaire, documentée : `id` et `dateConsultation` par source
// sont des métadonnées volatiles (comme partout ailleurs dans EF-ORCH), mais
// leur NOMBRE n'est connu qu'après la réponse de l'API — impossible de les
// injecter à l'avance comme pour EF-01A. On injecte donc les FONCTIONS de
// génération (genId/nowIso), jamais des valeurs fixes ; les tests
// fournissent des générateurs déterministes, la production utilise
// Date.now()/Math.random() par défaut — exactement le même mécanisme que le
// vrai module, rendu simplement observable/substituable pour les tests.
//
// `fetch` est injectable (fetchImpl) : le bac à sable d'exécution de cette
// tâche n'a pas d'accès réseau vers openalex.org — ce portage est donc
// vérifié contre le CODE réel, avec un fetch simulé reproduisant des
// réponses OpenAlex réalistes, jamais contre l'API en direct.
"use strict";

const OPENALEX_PROXY = "https://openalex-proxy.11drumboy11.workers.dev";

function str(v) {
  return String(v == null ? "" : v).trim();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Helpers copiés fidèlement du vrai module (texte libre des policies) ----
function parseRatePerSecond(text) {
  const m = String(text || "").match(/([\d.]+)\s*req(?:u[êe]te)?s?\s*\/\s*s/i);
  return m ? parseFloat(m[1]) : null;
}
function parseBudgetUsd(text) {
  const s = String(text || "");
  let m = s.match(/\$\s*([\d.]+)/);
  if (m) return parseFloat(m[1]);
  m = s.match(/([\d.]+)\s*(\$|usd|dollars?)/i);
  return m ? parseFloat(m[1]) : null;
}
function parseRetryCount(text) {
  const m = String(text || "").match(/(\d+)\s*tentative/i);
  return m ? Math.max(1, parseInt(m[1], 10)) : 2;
}
function delayForPolicy(policy) {
  const rate = parseRatePerSecond(policy && policy.rateLimitPolicy);
  return rate ? Math.ceil(1000 / rate) : 1000;
}
function sortParamFor(connectorId, sortMode) {
  const wantsDate = /date|r[ée]cent|recency/i.test(String(sortMode || ""));
  if (!wantsDate) return "";
  if (connectorId === "openalex") return "&sort=publication_date:desc";
  if (connectorId === "crossref") return "&sort=published&order=desc";
  if (connectorId === "pubmed") return "&sort=pub+date";
  return "";
}

async function fetchWithRetry(fetchImpl, url, policy) {
  const maxAttempts = parseRetryCount(policy && policy.retryPolicy);
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetchImpl(url);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return resp;
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) await sleep(500 * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr;
}

function makeSource(fields) {
  return {
    id: fields.id,
    titre: str(fields.titre),
    auteurOuOrganisme: str(fields.auteurOuOrganisme),
    date: str(fields.date),
    reference: str(fields.reference),
    discipline: str(fields.discipline),
    theme: str(fields.theme),
    provenance: { connectorId: fields.connectorId, connectorType: fields.connectorType, retrievalMethod: fields.retrievalMethod, originalReference: fields.originalReference || null },
    qualification: null,
    dependancesConnues: [],
    extraitUtilise: str(fields.extraitUtilise),
    dateConsultation: fields.dateConsultation,
    statutScreening: "trouve"
  };
}

// ---------------------------------------------------------------------------
// runOpenAlexConnector — logique portée, testable indépendamment de la
// fabrique ci-dessous (utile pour l'injecter directement dans un test).
// ---------------------------------------------------------------------------
async function runOpenAlexConnector({ connector, protocol, fetchImpl, genId, nowIso }) {
  const policy = (protocol.retrievalPolicies || []).find((p) => p.connectorId === "openalex") || {};
  const queries = (protocol.requetesExactes || []).filter((q) => q.connectorId === "openalex" && str(q.requete));
  const log = { connectorId: "openalex", requestsCount: 0, resultsCount: 0, costUsd: 0, errors: [], startedAt: nowIso() };
  const sourcesTrouvees = [];

  try {
    const perPage = Math.min(Math.max(policy.pageSize || 25, 1), 200);
    const maxPages = policy.maxPages || 1;
    const maxResults = policy.maxResults || Infinity;
    const sortParam = sortParamFor("openalex", policy.sortMode);
    const delayMs = delayForPolicy(policy);
    const budgetUsd = parseBudgetUsd(policy.budgetMax);
    let collected = 0;
    let globalStopReason = null;
    let lastLocalReason = null;

    outer:
    for (const q of queries) {
      for (let page = 1; page <= maxPages && collected < maxResults; page++) {
        if (budgetUsd != null && log.costUsd >= budgetUsd) {
          globalStopReason = "budget (budgetMax=\"" + policy.budgetMax + "\") atteint avant cette requête";
          break outer;
        }
        if (log.requestsCount > 0) await sleep(delayMs);
        log.requestsCount++;
        const url = OPENALEX_PROXY + "/works?search=" + encodeURIComponent(q.requete) + "&per_page=" + perPage + "&page=" + page + sortParam;
        let resp, data;
        try {
          resp = await fetchWithRetry(fetchImpl, url, policy);
          data = await resp.json();
        } catch (e) {
          log.errors.push("OpenAlex (\"" + q.requete + "\", page " + page + ") : " + e.message);
          lastLocalReason = "erreur réseau non résolue après retryPolicy pour cette requête";
          break;
        }
        if (data.meta && typeof data.meta.cost_usd === "number") log.costUsd += data.meta.cost_usd;
        const resultsArr = Array.isArray(data.results) ? data.results : [];
        if (!resultsArr.length) { lastLocalReason = "fin des résultats"; break; }
        for (const w of resultsArr) {
          if (collected >= maxResults) { globalStopReason = "maxResults (" + maxResults + ") atteint"; break; }
          sourcesTrouvees.push(makeSource({
            id: genId(),
            titre: w.display_name || w.title || "(sans titre)",
            auteurOuOrganisme: (w.authorships || []).map((a) => a.author && a.author.display_name).filter(Boolean).join(", "),
            date: w.publication_date || (w.publication_year ? String(w.publication_year) : ""),
            reference: w.doi || (w.ids && w.ids.openalex) || "",
            discipline: q.discipline,
            theme: connector.label,
            connectorId: "openalex", connectorType: "academic_api", retrievalMethod: "openalex-proxy /works",
            originalReference: w.id || null,
            extraitUtilise: "",
            dateConsultation: nowIso()
          }));
          collected++;
        }
        log.resultsCount = collected;
        if (globalStopReason) break outer;
        if (resultsArr.length < perPage) { lastLocalReason = "fin des résultats (dernière page)"; break; }
        if (page === maxPages) lastLocalReason = "maxPages (" + maxPages + ") atteint";
      }
    }
    if (budgetUsd != null && log.costUsd >= budgetUsd && !globalStopReason) globalStopReason = "budget atteint";
    log.stopReason = globalStopReason || lastLocalReason || (queries.length ? "toutes les requêtes traitées" : "aucune requête effectuée (aucune query rattachée à ce connecteur)");
    if (budgetUsd == null && policy.budgetMax) log.budgetNote = "budgetMax (\"" + policy.budgetMax + "\") non interprétable comme coût — non mécanisé, affiché pour suivi humain.";
  } finally {
    // finally, jamais catch : une exception logicielle réellement inattendue
    // (à distinguer d'un échec réseau, déjà absorbé plus haut avec log.errors)
    // doit continuer à se propager, jamais devenir un résultat terminal
    // "valide" que l'exécuteur pourrait figer en checkpoint. On garantit
    // seulement finishedAt sur le chemin normal ; côté appelant, si cette
    // fonction lève, aucun {sourcesTrouvees, log} n'est jamais retourné et
    // aucun putSuccessfulOutput n'est jamais tenté (cf. EF-01C2 executor).
    log.finishedAt = nowIso();
  }
  return { sourcesTrouvees, log };
}

// ---------------------------------------------------------------------------
// createOpenAlexRunner({ fetchImpl?, genId?, nowIso? }) -> connectorRunner
// Défauts de production réels (Date.now/Math.random/fetch global) ; les
// tests injectent des générateurs déterministes et un fetch simulé.
// ---------------------------------------------------------------------------
function createOpenAlexRunner(options) {
  const opts = options || {};
  const fetchFn = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : undefined);
  const genIdFn = opts.genId || (() => "source-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8));
  const nowIsoFn = opts.nowIso || (() => new Date().toISOString());
  return async function openAlexRunner(connector, protocol) {
    if (typeof fetchFn !== "function") {
      throw new Error("createOpenAlexRunner: aucune implémentation fetch disponible — injecter options.fetchImpl explicitement.");
    }
    return runOpenAlexConnector({ connector, protocol, fetchImpl: fetchFn, genId: genIdFn, nowIso: nowIsoFn });
  };
}

const EFOrchOpenAlexRunner = { OPENALEX_PROXY, runOpenAlexConnector, createOpenAlexRunner };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchOpenAlexRunner;
}
if (typeof window !== "undefined") {
  window.EFOrchOpenAlexRunner = EFOrchOpenAlexRunner;
}
