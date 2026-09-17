# MONO-04 — Rapport des providers

## Providers connus (documentation, jamais un endpoint codé en dur)

- **`clone-proxy`** — Worker Cloudflare réutilisé tel quel pour les appels
  LLM (Anthropic). Confirmé dans le code gelé
  `EF-02ABC-SMOKE-REAL-KIT/tools/EF-02A-Professional-Discovery-v1-WORKER-MISSIONDIMENSIONSET.html`
  (`fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload})})`) —
  MONO-04 route `workerCallFn(prompt)` vers ce même format `{payload}`,
  jamais un format inventé.
- **`openalex-proxy`** — Worker proxy OpenAlex/Crossref. Confirmé par
  `EF-02ABC-SMOKE-REAL-KIT/INSTRUCTIONS.md` : "aucune requête ne part
  directement vers api.openalex.org depuis le navigateur". MONO-04 route
  `createGatewayFetchImpl` vers ce même principe pour alimenter le VRAI
  `createOpenAlexRunner` gelé (EF-ORCH), sans jamais réimplémenter sa
  logique de construction de requête ou d'interprétation de réponse.

Les endpoints RÉELS (URLs de compte spécifiques) ne sont JAMAIS codés en
dur dans MONO-04 — `ProviderRegistry` exige qu'ils soient fournis
explicitement par l'appelant à la construction (`createMono04({ providerConfigs })`).

## ExternalStageAdapter (EF-02A/B/C)

`lib/external-stage-adapter.js::createExternalStageAdapter(resultProviders)`
ne construit JAMAIS lui-même le contenu métier de `ProfessionalDiscovery`/
`ProfessionalVerification`/`ProfessionalCorpusSet` — il délègue
entièrement à des `resultProvider` injectés par l'appelant (celui qui sait
comment obtenir le résultat réel produit par l'outil HTML gelé). Une étape
sans `resultProvider` est **absente** de l'objet adapter — jamais une
méthode fantôme — pour que le contrôle fail-closed déjà existant côté
`ProfessionalPipelinePort` fonctionne exactement comme conçu (T04-20).

## Runners gelés jamais réimplémentés

`createOpenAlexRunner` (EF-ORCH, gelé) continue de construire l'URL et
d'interpréter la réponse OpenAlex lui-même — MONO-04 ne fournit qu'un
`fetchImpl` technique (timeout/retry/redaction), composé sans modification
du runner gelé (T04-26, smoke réel confirmé).
