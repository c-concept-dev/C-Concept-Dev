"use strict";
// MONO-08 v0.7 — lib/fair-query-coverage.js
//
// B-07 : ORCHESTRATION ADDITIVE, JAMAIS UNE REINTERPRETATION DE CONTRAT.
//
// Constat mesure (audit B-07, simule hors ligne sur le SearchProtocol reel) :
// le runner EF-01C2 gele declare `collected` HORS de la boucle des requetes et
// borne la boucle de pages par `collected < maxResults`. Consequence reelle :
// avec 7 requetes / pageSize 25 / maxPages 4 / maxResults 100, la PREMIERE
// requete consomme la totalite du budget et les SIX autres n'executent aucune
// page. La premisse pluridisciplinaire de la mission est annulee en silence.
//
// CE QUE CE MODULE NE FAIT PAS :
//   - il ne modifie PAS MONO-01 (le runner gele est appele tel quel) ;
//   - il ne change PAS le sens de maxResults, qui reste un plafond GLOBAL ;
//   - il ne reecrit AUCUNE requete, n'en ajoute ni n'en retire aucune ;
//   - il ne touche ni au SearchProtocol ni au plannerOutput.
//
// CE QU'IL FAIT : il repartit le budget GLOBAL entre les requetes eligibles
// AVANT de les executer, puis invoque le runner gele une fois par requete avec
// une VUE DERIVEE du protocole ne contenant que cette requete et sa part de
// budget. La somme des parts est exactement le budget global : la semantique
// globale est preservee, l'ordre sequentiel ne peut plus affamer personne.
//
// REPARTITION : part_i = floor(B/n) + (i < B mod n ? 1 : 0). Somme = B exacte,
// ecart maximal d'une unite entre deux requetes. Si B < n, les B premieres
// requetes recoivent 1 et les suivantes 0 — cas signale explicitement dans le
// rapport (`starvedQueries`), jamais silencieux : le budget ne permet alors
// pas une tentative pour chaque requete, et le dire est la seule reponse
// honnete.
//
// PAGINATION : le runner gele demarre toujours a la page 1 et n'expose aucun
// curseur. Un veritable entrelacement page-a-page (Q1p1, Q2p1, ..., Q1p2)
// exigerait donc de re-telecharger les pages deja lues a chaque tour. Ce
// module fait UN SEUL passage par requete, sans refetch : la propriete exigee
// (aucune requete affamee par l'ordre) est obtenue sans gaspiller d'appels
// reseau. C'est une limite assumee du runner gele, pas un contournement.

const CONNECTOR = "openalex";

function fairShares(budget, n) {
  if (n <= 0) return [];
  const base = Math.floor(budget / n);
  const rest = budget % n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(base + (i < rest ? 1 : 0));
  return out;
}

/**
 * fairQueryCoverageRetrieval({ runner, protocol, connectorId }) — orchestre le
 * runner GELE par requete, sans jamais le modifier.
 *
 * Retourne { sourcesTrouvees, log, coverage } ou `coverage` documente
 * exactement ce qui a ete execute, requete par requete.
 */
async function fairQueryCoverageRetrieval(opts) {
  const runner = opts && opts.runner;
  const protocol = opts && opts.protocol;
  const connectorId = (opts && opts.connectorId) || CONNECTOR;
  // HORLOGE RUNTIME, jamais une constante de fixture. Injectable uniquement
  // pour que les tests puissent observer l'ordre chronologique reel ; le
  // defaut est l'horloge systeme, exactement comme nowIso() du runner gele
  // MONO-01/dependencies/ef-orch-ef01c2-runner-openalex-v0.1.js.
  const nowIso = (opts && typeof opts.nowIso === "function") ? opts.nowIso : function () { return new Date().toISOString(); };
  if (typeof runner !== "function") throw new Error("fairQueryCoverageRetrieval: runner (fonction) requis — jamais reimplemente ici.");
  if (!protocol || typeof protocol !== "object") throw new Error("fairQueryCoverageRetrieval: protocol requis.");

  const allQueries = (protocol.requetesExactes || []).filter(function (q) {
    return q && q.connectorId === connectorId && typeof q.requete === "string" && q.requete.trim().length > 0;
  });
  const policy = (protocol.retrievalPolicies || []).find(function (p) { return p && p.connectorId === connectorId; }) || {};
  const globalBudget = typeof policy.maxResults === "number" ? policy.maxResults : Infinity;

  const shares = Number.isFinite(globalBudget) ? fairShares(globalBudget, allQueries.length) : allQueries.map(function () { return Infinity; });

  const seen = new Set();
  const sourcesTrouvees = [];
  const perQuery = [];
  let requestsCount = 0;
  let errorsAll = [];
  let collected = 0;
  // CONTRAT EF-01C2 (MONO-01/dependencies/ef-orch-ef01c2-checkpoint-contract-v0.1.js).
  // Le runner gele initialise costUsd a 0 puis l'ACCUMULE depuis
  // data.meta.cost_usd quand le fournisseur le renvoie. L'agregat FAIR
  // reprend exactement cette semantique en sommant les sous-logs : jamais
  // un 0 code en dur, qui masquerait un cout reellement facture.
  let costUsd = 0;
  const startedAt = nowIso();
  let finishedAt = null;

  try {
  for (let i = 0; i < allQueries.length; i++) {
    const q = allQueries[i];
    const share = shares[i];
    const entry = { discipline: q.discipline || null, requete: q.requete, granted: share, executed: false, httpRequests: 0, resultsKept: 0, duplicatesDropped: 0, stopReason: null, error: null };
    if (!(share > 0)) {
      // Budget insuffisant pour cette requete — JAMAIS masque.
      entry.stopReason = "budget global insuffisant pour accorder une part a cette requete";
      perQuery.push(entry);
      continue;
    }
    // VUE DERIVEE : une seule requete, sa part de budget. maxPages et pageSize
    // du protocole sont conserves tels quels — aucune valeur inventee.
    const view = Object.assign({}, protocol, {
      requetesExactes: [q],
      retrievalPolicies: [Object.assign({}, policy, { maxResults: share })],
    });
    let r;
    try {
      r = await runner({ connectorId: connectorId }, view);
      entry.executed = true;
    } catch (e) {
      entry.error = String((e && e.message) || e);
      errorsAll.push({ discipline: entry.discipline, error: entry.error });
      perQuery.push(entry);
      continue;
    }
    const rlog = (r && r.log) || {};
    entry.httpRequests = rlog.requestsCount || 0;
    entry.stopReason = rlog.stopReason || null;
    requestsCount += entry.httpRequests;
    if (typeof rlog.costUsd === "number" && Number.isFinite(rlog.costUsd)) costUsd += rlog.costUsd;
    if (Array.isArray(rlog.errors) && rlog.errors.length) {
      errorsAll = errorsAll.concat(rlog.errors.map(function (e) { return { discipline: entry.discipline, error: e }; }));
    }
    for (const s of (r && r.sourcesTrouvees) || []) {
      // DEDUPLICATION PAR IDENTITE EXTERNE, JAMAIS PAR L'IDENTIFIANT LOCAL.
      //
      // makeSource() (MONO-01, gele) attribue son champ d'identifiant local
      // via genId(). Ce compteur REDEMARRE a chaque invocation du runner :
      // deux requetes distinctes produisent donc les memes identifiants
      // locaux. Dedupliquer sur cet identifiant ecraserait silencieusement
      // les resultats de toutes les requetes apres la premiere — exactement
      // la famine que ce module corrige.
      //
      // Ordre de preference, du plus stable au moins stable :
      //   1. provenance.originalReference — identifiant de l'oeuvre chez le
      //      fournisseur, stable entre invocations ;
      //   2. reference — DOI ou identifiant du fournisseur, quand il est
      //      renseigne ;
      //   3. repli deterministe titre + date + discipline, jamais aleatoire.
      const key = s && (
        (s.provenance && s.provenance.originalReference)
        || (s.reference && String(s.reference).trim() ? s.reference : null)
        || ("titre:" + s.titre + "|date:" + s.date + "|disc:" + s.discipline)
      );
      if (seen.has(key)) { entry.duplicatesDropped++; continue; }
      if (collected >= globalBudget) break; // plafond GLOBAL, jamais depasse
      seen.add(key);
      sourcesTrouvees.push(s);
      collected++;
      entry.resultsKept++;
    }
    perQuery.push(entry);
  }
  } finally {
    // finally, jamais catch — meme discipline que le runner gele : une
    // exception logicielle inattendue continue de se propager, mais
    // finishedAt est garanti pose sur le chemin normal.
    finishedAt = nowIso();
  }

  const executed = perQuery.filter(function (e) { return e.executed; }).length;
  const starved = perQuery.filter(function (e) { return !e.executed && !e.error; }).map(function (e) { return e.discipline; });

  return {
    sourcesTrouvees: sourcesTrouvees,
    log: {
      connectorId: connectorId,
      orchestration: "FAIR_QUERY_COVERAGE",
      requestsCount: requestsCount,
      resultsCount: collected,
      // Trois champs exiges par assertConnectorCheckpointOutputValid() pour
      // un connecteur "automatic" et absents de v0.7 — cause exacte de
      // l'INTEGRATION_CONTRACT_ERROR observee au premier RESUME reel.
      costUsd: costUsd,
      errors: errorsAll,
      startedAt: startedAt,
      finishedAt: finishedAt,
      stopReason: collected >= globalBudget ? "budget global (" + globalBudget + ") atteint" : "toutes les requetes eligibles traitees",
    },
    coverage: {
      policy: "FAIR_QUERY_COVERAGE",
      globalBudget: globalBudget,
      globalSemanticsPreserved: true,
      queriesTotal: allQueries.length,
      queriesExecuted: executed,
      starvedQueries: starved,
      shares: shares,
      perQuery: perQuery,
    },
  };
}

module.exports = { fairQueryCoverageRetrieval: fairQueryCoverageRetrieval, fairShares: fairShares };

/**
 * buildFairCoverageConnectorRunner(deps, sourceId, fetchImpl) — MONO-08 v0.7.
 *
 * POURQUOI CE CONSTRUCTEUR EXISTE. buildOpenAlexConnectorRunner() (v0.6,
 * lignes 661-665) MEMOISE l'appel : `if (!cachedCall) cachedCall =
 * rawRunner(connector, protocol)`. Toute invocation ulterieure renvoie le
 * resultat de la PREMIERE, quel que soit le protocole passe. Orchestrer la
 * couverture equitable au-dessus de ce runner memoise est donc impossible :
 * les six requetes suivantes recevraient les resultats de la premiere
 * (constate en simulation : 7 requetes, 1 seul appel HTTP, 15 resultats).
 *
 * De plus, son `genId` (compteur local) REDEMARRE a chaque construction, ce
 * qui rend l'identifiant `id` des sources non unique entre invocations.
 *
 * CE MODULE NE MODIFIE NI MONO-01 NI v0.6. Il utilise la FABRIQUE PUBLIQUE
 * `createOpenAlexRunner` de MONO-01 exactement comme elle est documentee
 * (options fetchImpl / genId / nowIso), avec un compteur MONOTONE partage
 * entre toutes les invocations.
 *
 * L'INTENTION de la memoisation v0.6 est PRESERVEE : le resultat AGREGE final
 * est memoise ici, de sorte que le noeud EF-01C2 du graphe reutilise
 * exactement le meme resultat sans jamais declencher un second appel reseau.
 * Seuls les appels PAR REQUETE, internes a l'orchestration, sont distincts —
 * ils constituent la recuperation unique, pas une seconde recuperation.
 */
function buildFairCoverageConnectorRunner(deps, sourceId, fetchImpl) {
  const createOpenAlexRunner = deps.createOpenAlexRunner;
  let counter = 0;
  const rawRunner = createOpenAlexRunner({
    fetchImpl: fetchImpl,
    genId: function () { counter += 1; return sourceId + "-" + counter; }, // MONOTONE
    nowIso: function () { return new Date().toISOString(); },
  });
  let cachedAggregate = null;
  return function memoizedFairRunner(connector, protocol) {
    if (!cachedAggregate) {
      cachedAggregate = fairQueryCoverageRetrieval({
        runner: rawRunner,
        protocol: protocol,
        connectorId: (connector && connector.connectorId) || CONNECTOR,
      });
    }
    return cachedAggregate;
  };
}

module.exports.buildFairCoverageConnectorRunner = buildFairCoverageConnectorRunner;

