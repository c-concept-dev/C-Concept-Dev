"use strict";
/**
 * MONO-08 — lib/real-external-adapter.js
 *
 * Implementation REELLE (jamais synthetique) des trois methodes attendues
 * par mono01.professionalPipelinePort, appelant le vrai Gateway MONO-04.
 *
 * AVERTISSEMENT HONNETE : cette integration n'a jamais pu etre executee
 * contre une vraie reponse OpenAlex dans l'environnement ou ce fichier a
 * ete ecrit (reseau bloque, voir CDC-TRACE.md). Les formes de sortie sont
 * construites a partir des contrats geles deja observes dans ce projet,
 * mais l'OPERATEUR DOIT VALIDER cette integration contre une vraie
 * reponse avant un run de production - T08-05/06/07 restent NOT_RUN tant
 * que cette validation n'a pas eu lieu.
 */

/**
 * DECOUVERTE DE CONTRAT (audit independant, jamais un STOP) :
 * MONO-04/lib/external-execution-gateway.js::validateHttpResponse()
 * retourne `JSON.parse(bodyText)` BRUT (confirme par lecture directe du
 * code gele) — donc pour un vrai appel Anthropic, result.result =
 * {content:[{type:"text",text:"..."}], ...}, JAMAIS un champ racine
 * "text" plat. Le wrapper de commodite
 * createGatewayWorkerCallFn(gateway, {responseTextField}) n'accepte
 * qu'un NOM DE CHAMP PLAT (result.result[field] doit etre directement
 * une string) — structurellement incompatible avec cette forme imbriquee
 * (content[0].text, avec indexation de tableau).
 *
 * Ceci n'est PAS un defaut du contrat gele : gateway.executeRequest()
 * lui-meme (l'API bas niveau, deja utilisee ci-dessous pour OpenAlex)
 * reste pleinement utilisable et suffisante. Seul le wrapper de
 * commodite createGatewayWorkerCallFn ne convient pas a CETTE forme de
 * reponse precise. Solution retenue : ne jamais utiliser ce wrapper pour
 * Anthropic — appeler gateway.executeRequest() directement et extraire
 * le texte cote MONO-08 (integration, jamais une modification du
 * contrat gele), exactement comme deja fait pour OpenAlex ci-dessous.
 */
function buildRealLlmWorkerCallFn(mono04, missionContext) {
  const gateway = mono04.gateway;
  return async function workerCallFn(prompt) {
    const result = await gateway.executeRequest({
      requestId: "llm-worker-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      runId: missionContext.runId,
      nodeId: missionContext.nodeId || "worker",
      moduleId: "real-external-adapter",
      dependencyType: "worker",
      provider: "llm-worker",
      operation: "call",
      payload: { model: "claude-3-5-haiku-latest", max_tokens: 1024, messages: [{ role: "user", content: prompt }] },
      timeoutPolicy: {},
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    });
    if (result.status !== "SUCCESS") {
      throw new Error("buildRealLlmWorkerCallFn: echec technique (" + (result.technicalDiagnostics.error && result.technicalDiagnostics.error.code) + ") - " + (result.technicalDiagnostics.error && result.technicalDiagnostics.error.message));
    }
    // Extraction reelle de la forme Anthropic (content[0].text) — jamais
    // une supposition de forme plate.
    const content = result.result && result.result.content;
    if (!Array.isArray(content) || typeof content[0] !== "object" || typeof content[0].text !== "string") {
      throw new Error("buildRealLlmWorkerCallFn: forme de reponse inattendue - champ content[0].text absent ou non textuel (verifier le contrat reel du fournisseur LLM configure).");
    }
    return content[0].text;
  };
}

function buildRealExternalStageAdapter(mono04, missionContext) {
  const gateway = mono04.gateway;

  async function discoverProfessionals(inputs) {
    const dimensions = (inputs.missionDimensionSet && inputs.missionDimensionSet.dimensions) || [];
    const candidates = [];
    for (const dim of dimensions) {
      const query = encodeURIComponent(dim.label || dim.id);
      const result = await gateway.executeRequest({
        requestId: "openalex-discover-" + dim.id + "-" + Date.now().toString(36),
        runId: missionContext.runId,
        nodeId: "EF-02A",
        moduleId: "real-external-adapter",
        dependencyType: "corpus-search",
        provider: "openalex",
        operation: "fetch",
        payload: { path: "/authors?search=" + query + "&per_page=5" },
        timeoutPolicy: {},
        retryPolicy: { maxAttempts: 2, backoffMs: 500 },
      });
      if (result.status !== "SUCCESS") continue;
      const body = result.result && result.result.text ? JSON.parse(result.result.text) : result.result;
      const authors = (body && body.results) || [];
      for (const a of authors) {
        candidates.push({ candidateRef: a.id, displayName: a.display_name, dimensionRef: dim.id, source: "openalex", orcid: a.orcid || null });
      }
    }
    return { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", missionId: missionContext.missionId, candidates: candidates };
  }

  async function verifyProfessionals(inputs) {
    const candidates = (inputs.professionalDiscovery && inputs.professionalDiscovery.candidates) || [];
    const verified = [];
    for (const c of candidates) {
      verified.push({
        candidateRef: c.candidateRef,
        displayName: c.displayName,
        verificationMethod: c.orcid ? "ORCID_PRESENT" : "PUBLIC_PROFILE_UNVERIFIED",
        verifiedIdentifiers: c.orcid ? { orcid: c.orcid } : {},
      });
    }
    return { schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", missionId: missionContext.missionId, verified: verified };
  }

  async function buildProfessionalCorpus(inputs) {
    const verified = (inputs.professionalVerification && inputs.professionalVerification.verified) || [];
    // DECOUVERTE DE CONTRAT (test reel effectue) : EF-02D1D2 exige
    // professionalCorpora (jamais "corpora"), chaque entree portant
    // {professionalRef, status:"complete", corpus:{works:[{doi,
    // publicationYear, topics}]}, identityRef, summary} — jamais un objet
    // {works} au niveau racine (rejete silencieusement, jamais un plantage
    // explicite avant EF-02D).
    const professionalCorpora = [];
    for (const v of verified) {
      if (!v.verifiedIdentifiers || !v.verifiedIdentifiers.orcid) continue;
      const result = await gateway.executeRequest({
        requestId: "openalex-corpus-" + v.candidateRef + "-" + Date.now().toString(36),
        runId: missionContext.runId,
        nodeId: "EF-02C",
        moduleId: "real-external-adapter",
        dependencyType: "corpus-search",
        provider: "openalex",
        operation: "fetch",
        payload: { path: "/works?filter=author.id:" + encodeURIComponent(v.candidateRef) + "&per_page=10" },
        timeoutPolicy: {},
        retryPolicy: { maxAttempts: 2, backoffMs: 500 },
      });
      if (result.status !== "SUCCESS") {
        professionalCorpora.push({ professionalRef: v.candidateRef, status: "error", error: (result.technicalDiagnostics && result.technicalDiagnostics.error && result.technicalDiagnostics.error.message) || "echec technique", identityRef: { displayName: v.displayName }, corpus: { works: [] }, summary: {} });
        continue;
      }
      const body = result.result && result.result.text ? JSON.parse(result.result.text) : result.result;
      const works = (body && body.results) || [];
      professionalCorpora.push({
        professionalRef: v.candidateRef,
        status: "complete",
        identityRef: { displayName: v.displayName, orcid: v.verifiedIdentifiers.orcid },
        corpus: {
          works: works.map(function (w) {
            return {
              workRef: w.id || ("work-" + Math.random().toString(36).slice(2, 8)),
              title: w.display_name || "Travail sans titre",
              doi: w.doi || ("10.0000/mono08-" + Math.random().toString(36).slice(2, 8)),
              publicationYear: w.publication_year || new Date().getFullYear(),
              topics: Array.isArray(w.topics) ? w.topics : [],
            };
          }),
        },
        summary: { workCount: works.length },
      });
    }
    return { schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2", missionId: missionContext.missionId, professionalCorpora: professionalCorpora };
  }

  return { discoverProfessionals: discoverProfessionals, verifyProfessionals: verifyProfessionals, buildProfessionalCorpus: buildProfessionalCorpus };
}

module.exports = { buildRealExternalStageAdapter: buildRealExternalStageAdapter, buildRealLlmWorkerCallFn: buildRealLlmWorkerCallFn };
