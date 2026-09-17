# EvidenceForge — MONO-04 : External Execution Gateway

MONO-04 construit la **frontière d'exécution externe technique** du
monolithe (LLM, Worker, OpenAlex, Crossref, PubMed, ExternalStageAdapter
EF-02A/B/C). Aucune logique métier — il vérifie provider+secret+config,
exécute via le bon connecteur, normalise uniquement le résultat technique,
retourne au port appelant.

## Principe anti-dérive respecté

Avant tout code, le vrai code gelé a été inspecté : `ExternalExecutionPort`
(MONO-01.x, déjà en place — jamais retouché), la signature exacte
`workerCallFn(prompt) -> string` confirmée dans `ef-02d1d2-orchestrator-v1.js`
et `ef-03b-review-runner-v1.js`, le point d'injection
`createOpenAlexRunner({fetchImpl, genId, nowIso})` d'EF-ORCH, et les vrais
endpoints Worker (`clone-proxy` pour le LLM, `openalex-proxy` pour
OpenAlex/Crossref) trouvés dans `EF-02ABC-SMOKE-REAL-KIT` — confirmant
qu'aucune clé API n'est envoyée côté client à ces Workers.

## Contenu

```
MONO-04/
├── index.js                          (createMono04(options) — providerConfigs OBLIGATOIRE)
├── lib/
│   ├── external-execution-errors.js  (9 codes techniques)
│   ├── secret-provider.js            (fail-closed, jamais de fallback codé en dur)
│   ├── request-redaction.js          (redaction Authorization/Bearer/sk-.../clés)
│   ├── response-validation.js        (statut HTTP, content-type, JSON, taille)
│   ├── provider-registry.js          (config immuable, jamais un secret)
│   ├── external-execution-gateway.js (fail-closed, timeout réel, retry technique plafonné, idempotence in-process, circuit breaker minimal)
│   └── external-stage-adapter.js     (binding technique EF-02A/B/C + helpers workerCallFn/fetchImpl réels)
├── contracts/                        (4 contrats JSON)
├── dependencies/MONO-03/             (copie bytewise, nesting MONO-02+MONO-01.x)
├── test/                             (11 fichiers T04-01 à T04-41, 69 tests, vrais serveurs HTTP locaux)
├── reports/
└── manifest/SHA256SUMS
```

## Aucun contournement (section 3)

MONO-04 ne `require()` jamais un module métier gelé ni un port MONO-01.x
directement depuis `lib/` — vérifié statiquement (T04-28). Il ne parle
qu'aux points d'injection déjà établis (`workerCallFn`, `fetchImpl`,
`adapter`) que l'appelant final branche sur MONO-01.x.

## Classifications de dépendances préservées (section 4)

`ExternalExecutionPort` (MONO-01.x) n'a pas été modifié — `EF-01B`/`EF-01C1`
restent `INDIRECT_UPSTREAM`, `EF-01C2` reste `DIRECT_RUNTIME`, jamais
aplatis en booléen (T04-24, T04-25).

## Secrets (section 6)

`SecretProvider` échoue explicitement (`SECRET_UNAVAILABLE`) si un secret
requis est absent — jamais un fallback vers une valeur codée en dur.
`createEnvSecretProvider()` lit `process.env` uniquement ; aucune clé n'est
jamais écrite en dur dans ce dépôt (vérifié par recherche statique, T04-38).

## Fail-closed partout (section 10)

Provider non configuré, secret absent, timeout, erreur réseau, erreur HTTP,
réponse invalide (y compris une page HTML en 200) — chaque cas produit un
code d'erreur technique explicite, jamais un `SUCCESS` déguisé.

## Retry (section 12)

Un retry technique n'est appliqué que pour les erreurs réellement
transitoires (réseau, timeout, HTTP 429/5xx) — jamais pour une erreur
client (400/401/403/404) ni pour un provider/secret manquant. Plafonné
systématiquement à `HARD_MAX_ATTEMPTS_CAP = 5`, quelle que soit la
politique demandée (T04-14).

## Idempotence (section 13) — limite documentée, corrigée après audit

Le cache de déduplication par `requestId` est **in-process uniquement**.
Corrigé après audit indépendant : un `requestId` réutilisé avec un contenu
de requête **différent** (payload, provider, operation, runId, nodeId,
moduleId, timeoutPolicy ou retryPolicy) produit désormais explicitement
`EXTERNAL_REQUEST_CONFLICT` — jamais une réutilisation silencieuse du
résultat d'une autre requête. La comparaison utilise une empreinte
déterministe (`lib/request-fingerprint.js`, sérialisation canonique +
SHA-256, clés triées récursivement — insensible à l'ordre des clés,
T04-IDEMPOTENCE-CONFLICT-06) qui ne contient jamais de secret. MONO-04 ne
devient jamais un second `ArtifactStore` (section 17), cette responsabilité
reste celle de MONO-03.

## Vérification indépendante

```
cd MONO-04
npm test                              # 69/69 tests, T04-01 à T04-41 + circuit breaker + conflit d.idempotence dédiés
sha256sum -c manifest/SHA256SUMS
```
