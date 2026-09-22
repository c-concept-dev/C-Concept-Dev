# PRIVACY-SECRET-SCAN — MONOLITH v1.0.1

## Principe

Aucun secret n'est embarqué dans le paquet ni renvoyé à l'interface. Les identifiants du transport réel (`EVIDENCEFORGE_WORKER_API_KEY`, `LLM_WORKER_BASE_URL`, `LLM_AUTH_MODE`) sont lus **uniquement** depuis l'environnement du processus serveur, en trois points :

| Fichier | Usage |
|---|---|
| `lib/llm.js` | `configured()` (présence seulement) ; en-tête `Authorization: Bearer` de l'appel réel |
| `lib/llm-transport.js` | sonde de capacité MONO-10 (contrat `probe()`), `credentialProbeSkipped` atteste la présence, jamais la valeur |
| `vendor/operator-kit-r1.3/build-real-mono04.js` → MONO-04 `createEnvSecretProvider()` (gelé) | résolveur / planificateur EF-01 |

`/api/config` expose `providerConfigured: true|false` — jamais les valeurs (test V1 : les valeurs injectées en test n'apparaissent dans aucune réponse API, ni dans `state.json`, ni dans `events.jsonl`).

## Journaux

- `runs/<runId>/llm-calls.jsonl` : hash du prompt, hash de la réponse, identifiants de requête fournisseur, statut HTTP, tentatives, usage — **aucun en-tête, aucune clé, aucune URL de worker** (test L5 : la clé de test n'apparaît pas dans le journal).
- Journal OpenAlex (`openalex-cache/index.json`, appels) : les paramètres `api_key`, `mailto`, `token` d'une URL sont expurgés `[EXPURGE]` avant journalisation (test R4).
- Sonde MONO-10 : `endpointHost` (hôte seul) est consigné ; jamais le chemin ni la clé.

## Données utilisateur

- Les documents fournis sont stockés **localement** dans `runs/<runId>/documents/` (octets hachés SHA-256) et ne sont transmis qu'au fournisseur d'analyse configuré par l'utilisateur (reformulation, revues) et jamais ailleurs. `publicState` ne renvoie jamais leur contenu (test Q5).
- Le serveur n'écoute que sur `127.0.0.1` (`config/monolith.config.json → server.host`) ; aucune télémétrie, aucun appel sortant autre que le fournisseur configuré et `api.openalex.org`.
- `runs/` est exclu du paquet (`tools/build-manifest.js`, zip).

## Scan (mesuré le 2026-09-15 sur v1.0.1, `node tools/secret-scan.js` — le nombre de fichiers scannés est celui du dossier au moment de la mesure, hors `runs/` ; il est recalculé et consigné dans le bloc final du chantier)

```
{ "ok": true, "filesScanned": 39, "envValuesChecked": ["EVIDENCEFORGE_WORKER_API_KEY","LLM_WORKER_BASE_URL"], "hits": [] }
```

Motifs refusés : `sk-ant-…`, `sk-<32+>`, `Authorization: Bearer <littéral>`, `https://*.workers.dev`, `AKIA…`, blocs `PRIVATE KEY`, affectations littérales d'une valeur de clé ou d'URL de worker aux variables du transport (`<VAR> = "…"`). En plus, les **valeurs réelles** présentes dans l'environnement du scanner sont recherchées dans chaque fichier : 0 occurrence.

Test de mutation (K2) : un fichier contenant `sk-ant-…` ou `…workers.dev` est détecté (`ok: false`).

Le scan est rejoué sur l'**extraction fraîche** du zip livrable (voir `FUNCTIONAL-TEST-REPORT.md` § packaging).

SECRET_SCAN_PASS = YES
