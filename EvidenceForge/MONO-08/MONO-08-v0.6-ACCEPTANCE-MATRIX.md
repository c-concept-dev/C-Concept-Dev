# MONO-08 v0.6 — Acceptance Matrix — Delegated LLM Authentication

Compagnon de `MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md` §10-11. Document de spécification
de tests, **aucun test n'est exécuté par ce document**. Aucun code, aucun Worker, aucun
preflight, aucun Real Smoke.

Version révisée suite au premier audit indépendant : ajout des cas J (config invalide)
et K (rate limit), scission du cas H en H1/H2, clarification des règles F et G, et
alignement de la formulation `ANTHROPIC_API_KEY` sur la distinction contrat/test REAL du
CDC §4.3.1.

Légende des colonnes :
- **Environnement** : `LOCAL_CONTROLLED` (provider(s) simulés de façon contrôlée et
  déclarée comme telle, jamais présentés comme preuve REAL) ou `REAL` (réseau réel,
  Worker Cloudflare réellement déployé, upstream Anthropic réel).
- **Précondition** : état à mettre en place avant le test.
- **Action** : ce que le test exécute.
- **Résultat attendu** : `status` / `overallStatus` attendu dans le rapport de
  preflight, ou comportement attendu du vrai run.
- **Preuve à archiver** : ce qui doit être conservé comme preuve d'audit indépendant.

## Mode direct (rétrocompatibilité stricte v0.5)

| # | Environnement | Précondition | Action | Résultat attendu | Preuve à archiver |
|---|---|---|---|---|---|
| A | LOCAL_CONTROLLED | `LLM_AUTH_MODE=direct` (ou absent), `ANTHROPIC_API_KEY` absente | `bin/run-preflight.js` | provider `llm-worker` → `status=AUTHENTICATION_BLOCKED`, `rawClassification=NO_CREDENTIAL` ; `overallStatus≠READY` | rapport JSON complet, `credentialPresent=false` |
| B | LOCAL_CONTROLLED | `LLM_AUTH_MODE=direct` (ou absent), `ANTHROPIC_API_KEY` présente et valide | `bin/run-preflight.js` | comportement strictement identique à v0.5 : `READY` si les autres providers requis le sont aussi | rapport JSON complet, diff structurel nul avec un rapport v0.5 équivalent (hors `authMode` ajouté) |

## Configuration invalide

| # | Environnement | Précondition | Action | Résultat attendu | Preuve à archiver |
|---|---|---|---|---|---|
| J | LOCAL_CONTROLLED | `LLM_AUTH_MODE="anything-else"` (toute valeur explicite ≠ `direct`/`delegated`) | `bin/run-preflight.js` | `PRODUCT_CONFIG_ERROR`, exit code `3`, **aucun** appel provider émis (`openalex`, `crossref`, `pubmed`, `llm-worker`), **aucune** requête réseau | rapport de configuration/erreur, preuve d'absence d'appel provider (aucune entrée de probe réseau dans la trace, aucun DNS/TCP émis) |

Ce cas doit être vérifié **avant** tout test des modes C→K : une valeur invalide de
`LLM_AUTH_MODE` ne doit jamais être silencieusement réinterprétée comme `direct`
(CDC §4.1).

## Mode delegated (nouveau contrat)

| # | Environnement | Précondition | Action | Résultat attendu | Preuve à archiver |
|---|---|---|---|---|---|
| C | LOCAL_CONTROLLED | `LLM_AUTH_MODE=delegated`, `EVIDENCEFORGE_WORKER_API_KEY` absente | `bin/run-preflight.js` | `status=AUTHENTICATION_BLOCKED` sans tentative d'appel authentifié au Worker (symétrique à la règle « no-op sans credential ») | rapport JSON, confirmation qu'aucun appel Worker authentifié n'a été journalisé |
| D | LOCAL_CONTROLLED | `LLM_AUTH_MODE=delegated`, `EVIDENCEFORGE_WORKER_API_KEY` présente mais incorrecte du point de vue du Worker (simulé de façon déclarée) | `bin/run-preflight.js` | `status=AUTHENTICATION_BLOCKED`, cause = rejet du credential Worker (pas `NO_CREDENTIAL`, mais un rejet actif, ex. `HTTP 401` du Worker) | rapport JSON, code HTTP réellement reçu du Worker simulé |
| E | LOCAL_CONTROLLED | `LLM_AUTH_MODE=delegated`, credential Worker valide, Worker (simulé de façon déclarée) répond `HTTP 200` avec un corps non conforme au contrat Messages API | `bin/run-preflight.js` | `status=INVALID_RESPONSE`, jamais `READY` | rapport JSON, corps de réponse simulé archivé (sans secret), raison de non-conformité explicite |
| F | LOCAL_CONTROLLED **uniquement** | `LLM_AUTH_MODE=delegated`, credential Worker valide, Worker (simulé de façon déclarée) répond une structure Anthropic valide (`content` tableau, `HTTP 200`) — preuve de **NIVEAU 1 seulement** (CDC §5.3) | `bin/run-preflight.js` | `status=READY` pour `llm-worker` | rapport JSON étiqueté `LOCAL_CONTROLLED`, corps de réponse simulé archivé |
| G | REAL | `LLM_AUTH_MODE=delegated`, `EVIDENCEFORGE_WORKER_API_KEY` réelle acceptée, `LLM_WORKER_BASE_URL` = URL réelle du Worker `evidenceforge-llm-proxy` dédié réellement déployé (secrets Cloudflare `WORKER_API_KEY` et `ANTHROPIC_API_KEY` réellement configurés côté Cloudflare), **`ANTHROPIC_API_KEY` effectivement absente du processus client** (CDC §4.3.1.B) | `bin/run-preflight.js`, puis (si `READY`) le vrai run via `real-provider-configs.js` | `status=READY` sur la base d'un vrai appel upstream Anthropic réellement relayé par le Worker, avec preuve de **NIVEAU 2** corrélée (CDC §5.3) ; aucun accès client à `ANTHROPIC_API_KEY` à aucun moment | voir détail cumulatif ci-dessous |

### Détail des preuves exigées pour G (cumulatif, tout manquant invalide le cas)

- Worker Cloudflare **dédié** réellement déployé, identité et version/déploiement
  identifiés (pas de Worker partagé avec une autre application — CDC §3, §7.1).
- Endpoint réel (`LLM_WORKER_BASE_URL` pointant vers ce déploiement).
- `EVIDENCEFORGE_WORKER_API_KEY` réelle envoyée et acceptée par le Worker.
- `ANTHROPIC_API_KEY` **effectivement absente** du processus client au moment du test
  (constat d'environnement, pas une déclaration a posteriori) et **aucun accès client**
  à cette variable à aucun moment de l'exécution.
- Appel upstream réel `POST https://api.anthropic.com/v1/messages` effectué côté
  Worker pour cette requête précise.
- Réponse Anthropic réelle relayée jusqu'au client, structurellement valide
  (NIVEAU 1 — `HTTP 200`, `content` tableau, champs attendus).
- Identifiant de corrélation non secret (request-id) présent côté client ET dans la
  trace/log Worker pour cette même requête (headers de corrélation autorisés, voir
  CDC §5.3 : `X-EvidenceForge-Proxy`, `X-EvidenceForge-Upstream`,
  `X-EvidenceForge-Upstream-Status`, `X-EvidenceForge-Request-Id`).
- Trace/log Worker minimal corrélé à ce request-id (timestamp, statut, latence —
  jamais le prompt complet ni un secret, CDC §7.9).
- Provider reality log côté MONO-08 : provider, opération, `REAL`, timestamp,
  latency, attempts, HTTP status, classification.
- Classification finale `READY`, sans qu'aucune étape ci-dessus ne soit un faux
  positif (CDC §5.4).
- Secret handling conforme (CDC §7.10, §8.1) : aucun secret dans les traces
  produites pour cette preuve.

**Les headers de corrélation seuls, sans le reste de cette liste, ne constituent pas
une preuve REAL suffisante** (CDC §5.3).

## Rate limiting

| # | Environnement | Précondition | Action | Résultat attendu | Preuve à archiver |
|---|---|---|---|---|---|
| K | LOCAL_CONTROLLED ou Worker de test contrôlé | `LLM_AUTH_MODE=delegated`, credential Worker valide, seuil de rate limit du Worker atteint (dépassement provoqué délibérément) | Une requête supplémentaire au-delà du seuil | `HTTP 429` renvoyé par le Worker **avant tout appel upstream Anthropic**, classification preflight `RATE_LIMITED`, jamais `READY` | rapport de preflight (statut, classification), preuve que l'appel upstream Anthropic n'a pas été effectué au moment du blocage rate limit (absence de trace d'appel upstream pour cette requête précise) |

## Transverses

| # | Environnement | Précondition | Action | Résultat attendu | Preuve à archiver |
|---|---|---|---|---|---|
| H1 | — | Après tout test utilisant `EVIDENCEFORGE_WORKER_API_KEY` réelle (cas C→G, K applicables) | Scan de valeur brute sur RunState, NodeState, ArtifactRecord, traces, reports, logs, stdout/stderr, OperatorApi, DOM, localStorage, sessionStorage | `0` occurrence brute de `EVIDENCEFORGE_WORKER_API_KEY` | rapport de secret scan (valeur brute cherchée, résultat) |
| H2 | — | Test REAL delegated (cas G) | Vérification structurelle (pas un scan de valeur — impossible par construction, CDC §8.1 H2) : `ANTHROPIC_API_KEY` absente du processus client au moment du test ; revue du chemin de code `delegated` dans `lib/preflight.js` et `lib/real-provider-configs.js` confirmant l'absence de toute référence à `ANTHROPIC_API_KEY` | Aucune lecture, aucune transmission, aucune requête à un SecretProvider pour `ANTHROPIC_API_KEY` en mode `delegated` | preuve d'absence de la variable dans l'environnement du process au moment du test G, extrait de revue de code des branches `delegated` |
| I | — | Suite de tests v0.5 existante (`test/test_t08_*.js`), avant et après introduction de v0.6 | Exécution complète de la suite | Résultat strictement identique avant/après (aucune régression) | sortie complète des deux exécutions, diff nul sur les résultats |

`H1` et `H2` ne sont **pas interchangeables** : `H1` est un scan de valeur brute
(possible car `EVIDENCEFORGE_WORKER_API_KEY` est connue du runtime EvidenceForge en
mode delegated) ; `H2` est une preuve structurelle de non-consommation (nécessaire car
`ANTHROPIC_API_KEY` n'est, par contrat, jamais lue par MONO-08 en mode delegated — il
est donc à la fois impossible et contraire au contrat de demander cette valeur au
client pour la « scanner »).

## Note sur `LOCAL_CONTROLLED`

Tout résultat produit en `LOCAL_CONTROLLED` doit être explicitement étiqueté comme tel
dans les rapports d'audit et ne peut en aucun cas se substituer à la preuve `REAL`
exigée par le cas G pour la validation du critère de GELABLE (`CDC` §11.3). Un Worker
« simulé de façon contrôlée » dans les cas C→F et K désigne un comportement HTTP
déclaré et reproductible utilisé uniquement pour isoler la logique de classification
du preflight (sonde/statuts), jamais un mock présenté comme preuve d'un appel
Anthropic réel.

Le cas F en particulier ne prouve jamais un provider REAL, un appel Anthropic REAL, un
Worker REAL, ni un upstream REAL — voir « Détail des preuves exigées pour G »
ci-dessus pour ce que G exige en plus de F.

## Statut

Document de spécification uniquement. Aucun test ci-dessus n'a été exécuté. Aucune
implémentation n'existe à ce stade. STOP après ce document, conformément au CDC.
