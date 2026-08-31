# MONO-08 v0.6 — Acceptance Matrix — Delegated LLM Authentication

Compagnon de `MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md` §10-11. Document de spécification
de tests, **aucun test n'est exécuté par ce document**. Aucun code, aucun Worker, aucun
preflight, aucun Real Smoke.

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

## Mode delegated (nouveau contrat)

| # | Environnement | Précondition | Action | Résultat attendu | Preuve à archiver |
|---|---|---|---|---|---|
| C | LOCAL_CONTROLLED | `LLM_AUTH_MODE=delegated`, `EVIDENCEFORGE_WORKER_API_KEY` absente | `bin/run-preflight.js` | `status=AUTHENTICATION_BLOCKED` sans tentative d'appel authentifié au Worker (symétrique à la règle « no-op sans credential ») | rapport JSON, confirmation qu'aucun appel Worker authentifié n'a été journalisé |
| D | LOCAL_CONTROLLED | `LLM_AUTH_MODE=delegated`, `EVIDENCEFORGE_WORKER_API_KEY` présente mais incorrecte du point de vue du Worker (simulé de façon déclarée) | `bin/run-preflight.js` | `status=AUTHENTICATION_BLOCKED`, cause = rejet du credential Worker (pas `NO_CREDENTIAL`, mais un rejet actif, ex. `HTTP 401` du Worker) | rapport JSON, code HTTP réellement reçu du Worker simulé |
| E | LOCAL_CONTROLLED | `LLM_AUTH_MODE=delegated`, credential Worker valide, Worker (simulé de façon déclarée) répond `HTTP 200` avec un corps non conforme au contrat Messages API | `bin/run-preflight.js` | `status=INVALID_RESPONSE`, jamais `READY` | rapport JSON, corps de réponse simulé archivé (sans secret), raison de non-conformité explicite |
| F | LOCAL_CONTROLLED | `LLM_AUTH_MODE=delegated`, credential Worker valide, Worker (simulé de façon déclarée) répond une structure Anthropic valide (`content` tableau, `HTTP 200`) | `bin/run-preflight.js` | `status=READY` pour `llm-worker` | rapport JSON, corps de réponse simulé archivé |
| G | REAL | `LLM_AUTH_MODE=delegated`, `EVIDENCEFORGE_WORKER_API_KEY` réelle, `LLM_WORKER_BASE_URL` = URL réelle du Worker `evidenceforge-llm-proxy` réellement déployé (secrets Cloudflare `WORKER_API_KEY` et `ANTHROPIC_API_KEY` réellement configurés côté Cloudflare) | `bin/run-preflight.js`, puis (si `READY`) le vrai run via `real-provider-configs.js` | `status=READY` sur la base d'une réponse Anthropic réelle relayée par le Worker ; `ANTHROPIC_API_KEY` absente de tout le processus côté client à aucun moment | rapport JSON, provider reality log (provider, opération, REAL, timestamp, latency, attempts, HTTP status, classification), confirmation explicite qu'aucune variable `ANTHROPIC_API_KEY` n'était définie côté client pendant le test |

## Transverses

| # | Environnement | Précondition | Action | Résultat attendu | Preuve à archiver |
|---|---|---|---|---|---|
| H | — | Après tout test utilisant un credential réel (A→G applicables) | Scan de secret sur RunState, NodeState, ArtifactRecord, traces, reports, logs, stdout/stderr, OperatorApi, DOM, localStorage, sessionStorage | `0` occurrence brute de `ANTHROPIC_API_KEY` et de `EVIDENCEFORGE_WORKER_API_KEY` | rapport de secret scan |
| I | — | Suite de tests v0.5 existante (`test/test_t08_*.js`), avant et après introduction de v0.6 | Exécution complète de la suite | Résultat strictement identique avant/après (aucune régression) | sortie complète des deux exécutions, diff nul sur les résultats |

## Note sur `LOCAL_CONTROLLED`

Tout résultat produit en `LOCAL_CONTROLLED` doit être explicitement étiqueté comme tel
dans les rapports d'audit et ne peut en aucun cas se substituer à la preuve `REAL`
exigée par le cas G pour la validation du critère de GELABLE (`CDC` §11.3). Un Worker
« simulé de façon contrôlée » dans les cas C→F désigne un comportement HTTP déclaré et
reproductible utilisé uniquement pour isoler la logique de classification du preflight
(sonde/statuts), jamais un mock présenté comme preuve d'un appel Anthropic réel.

## Statut

Document de spécification uniquement. Aucun test ci-dessus n'a été exécuté. Aucune
implémentation n'existe à ce stade. STOP après ce document, conformément au CDC.
