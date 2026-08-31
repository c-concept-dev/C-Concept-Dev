# Lecture de code — compatibilité de la config providers Cloudflare Workers avec le preflight v0.5

Avant de supposer que `OPENALEX_BASE_URL` / `CROSSREF_BASE_URL` / `PUBMED_BASE_URL` /
`LLM_WORKER_BASE_URL` seraient pris en compte, le code source livré dans le ZIP canonique
MONO-08 v0.5 (non modifié) a été lu :

- `lib/preflight.js`, fonction `buildProviders(env)` :
  ```js
  const openalexBase = env.OPENALEX_BASE_URL || "https://api.openalex.org";
  const crossrefBase = env.CROSSREF_BASE_URL || "https://api.crossref.org";
  const pubmedBase   = env.PUBMED_BASE_URL   || "https://eutils.ncbi.nlm.nih.gov";
  const llmBase      = env.LLM_WORKER_BASE_URL || "https://api.anthropic.com";
  ```
  → **Confirmé** : le preflight officiel honore nativement ces 4 variables d'environnement.
  Les utiliser n'est donc pas un contournement ni un patch : c'est un mécanisme de
  configuration prévu et déjà présent dans le code gelé du kit v0.5.

- `lib/real-provider-configs.js`, fonction `buildRealProviderConfigs(env)` : même mécanisme
  pour le Gateway MONO-04 (`OPENALEX_BASE_URL`, `CROSSREF_BASE_URL`, `LLM_WORKER_BASE_URL`),
  avec un garde-fou explicite `assertNotLocalOrSynthetic()` qui lève une exception si l'URL
  contient `localhost`, `127.0.0.1`, `synthetic`, `mock` ou `fixture`. Les deux domaines
  `*.11drumboy11.workers.dev` passent ce garde-fou (ce ne sont pas des endpoints locaux/mock).

- Point de vigilance identifié par lecture (avant toute mesure réseau), conforme à
  l'avertissement du prompt de reprise ("le preflight exige-t-il encore une
  ANTHROPIC_API_KEY locale malgré LLM_WORKER_BASE_URL ?") :
  dans `buildProviders`, le provider `llm-worker` reste défini avec
  `credentialRequired: true, credentialEnvVar: "ANTHROPIC_API_KEY"`, et sa fonction `probe()`
  lit toujours `env.ANTHROPIC_API_KEY` en local, quel que soit `llmBase` :
  ```js
  probe: function () {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) {
      return httpRequest(llmBase + "/v1/messages", { ... }).then(function (probe) {
        probe.credentialProbeSkipped = true;
        return probe;
      });
    }
    ...
    headers: { ..., "x-api-key": key, ... },
  }
  ```
  Et dans `checkProvider()`, l'ordre de classification place `credentialProbeSkipped` avant
  toute lecture du statut HTTP réel renvoyé par `llmBase` :
  ```js
  } else if (probe.credentialProbeSkipped) {
    status = "AUTHENTICATION_BLOCKED";
    ...
  }
  ```
  **Conclusion mesurée (lecture de code, confirmée ensuite par exécution réelle, voir
  `mono-08-preflight-worker-config-v1.json`)** : pointer `LLM_WORKER_BASE_URL` vers le Worker
  Cloudflare `ocr-universel-proxy` (qui détient sa propre `ANTHROPIC_API_KEY` côté serveur)
  ne dispense PAS le preflight v0.5 d'exiger `ANTHROPIC_API_KEY` **localement**, dans le
  shell qui exécute `bin/run-preflight.js`. Le contrat du kit v0.5 suppose un appel
  authentifié directement par le client (header `x-api-key` envoyé par le process qui lance
  le preflight), et non une délégation d'authentification à un proxy tiers. Aucun
  contournement n'a été tenté (pas de fausse clé, pas de patch du contrat) : ce point est
  simplement rapporté comme limite d'architecture observée, conformément à la consigne
  « Mesure. » du prompt de reprise.

  Dans le run réellement exécuté (voir JSON), ce point précis n'a de toute façon pas pu être
  isolé indépendamment du blocage réseau : les 4 providers (y compris `llm-worker` pointé vers
  le Worker) ont été bloqués **avant** ce stade par la politique d'egress de l'environnement
  (`EGRESS_PROXY_BLOCK` / `host_not_allowed`, voir §3 du rapport principal), donc le statut
  observé pour `llm-worker` est `NETWORK_BLOCKED`, pas encore `AUTHENTICATION_BLOCKED` — les
  deux causes existent, la cause réseau masque simplement la cause credential dans ce tour-ci.
