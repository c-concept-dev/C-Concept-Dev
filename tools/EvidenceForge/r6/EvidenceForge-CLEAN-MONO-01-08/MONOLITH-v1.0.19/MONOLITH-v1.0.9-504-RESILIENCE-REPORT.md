# MONOLITH-v1.0.9 — CORRECTIF POST-SMOKE v1.0.8 : CORRIGER LE HTTP 504 À 8 s DU PROXY SANS TOUCHER AU STREAMING VALIDÉ — RAPPORT DE LOT

**Date :** 2026-09-19 · **Base :** MONOLITH-v1.0.8 (candidat GELABLE, zip `d4b3dcac…`, intacte) + proxy v0.7 (intact) · **Définition :** `v1.0.9 = v1.0.8 (client inchangé) + worker/evidenceforge-llm-proxy-v0.8 (délais séparés, lecture stricte)`
**Coût du lot :** 0 USD — aucun appel fournisseur ; autopsie et replay en lecture seule ; tests locaux (Worker factice, doubles injectés). Documents : `ROOT-CAUSE-504-8S-AUTOPSY-v1.md` (avant tout code), `PROXY-v0.8-TIMEOUT-DESIGN-v1.md`, `JMMJS-TWINS-504-REPLAY-v1.{md,json}` (`tools/stream-replay.js`, + attente des en-têtes).

## 1. Ce que le smoke réel a validé (tentative 7, 06:24 → 07:49 UTC)

56 appels `SSE_STREAM` réussis, **0 × 524** : revues EF-03B jusqu'à **156,3 s** (flux 154,1 s, ≈ 50 k jetons d'entrée), 18 jumeaux, 18 revues logiques attendues, 11 validées, agrégation commencée (6 appels réussis, 1,5–23,6 s). Live-status et compteurs suivis pendant toute la tentative. **Le streaming v1.0.8 n'est pas modifié** (`lib/llm.js`, `lib/llm-stream.js`, `lib/live-status.js`, `lib/pipeline.js`, `index.html`, `server.js` : byte-identiques à v1.0.8).

## 2. Cause racine du 504 (preuves, lecture seule)

| Preuve demandée | Constat |
|---|---|
| ancien 524 éliminé par le SSE | 56/56 appels SSE OK, durées > 125 s sans incident |
| nouvel incident = 504 à 8,187 s | `downstream` (agrégation) `07:49:14.617 → 07:49:22.804`, `httpStatus 504` |
| `DEFAULT_TIMEOUT_MS = 8000` | Worker v0.7 `src/worker.js:39` ; corps reçu `{"error":"upstream_timeout"}` = branche `AbortError` du Worker ; 8 000 + ≈ 187 ms de transit |
| `env.TIMEOUT_MS` absent | `wrangler.jsonc › "vars": {}` ; de plus `typeof env.TIMEOUT_MS === "number"` (`:190`) aurait ignoré une variable Cloudflare (chaîne) |
| aucun `providerRequestId` | `null` |
| aucun flux commencé | `transport: JSON`, `stream: null` |
| défaut pré-flux / attente des en-têtes | minuteur armé avant `fetch` amont, effacé aux en-têtes ; attente mesurée sur les 56 succès : p50 2,0 s, p90 3,6 s, **max 7,03 s** ; le 57ᵉ appel a dépassé 8 s (aucune corrélation avec la taille du prompt : 6 k jetons) |

## 3. Ce qui change

| Fichier | Nature |
|---|---|
| `worker/evidenceforge-llm-proxy-v0.8/src/worker.js` (copie de v0.7, +≈70 l.) | `HEADER_TIMEOUT_MS` (défaut **60 000**, bornes 1 000–90 000) = seul minuteur du Worker (attente des en-têtes ; effacé dès les en-têtes ; jamais appliqué au flux ni au corps bufferisé) ; `STREAM_INACTIVITY_TIMEOUT_MS` / `STREAM_MAX_DURATION_MS` = gardes client, annoncées, jamais appliquées ; `parseBoundedMs` / `readTimeoutConfig` (chaîne ou nombre, `Number()`, fini, arrondi, bornes, défaut sûr + traces `config_invalid` / `config_out_of_range` / `config_legacy_alias` sans valeur brute ; jamais NaN / 0 / négatif) ; alias `TIMEOUT_MS` ; 504 explicite (`phase`, `headerTimeoutMs`, `headerTimeoutSource`, `upstreamWaitMs`) ; en-têtes `X-EvidenceForge-Timeouts` et `X-EvidenceForge-Proxy-Version` ; `PROXY_VERSION = evidenceforge-llm-proxy/0.8-stream-timeouts` |
| `wrangler.jsonc` | `vars.HEADER_TIMEOUT_MS = "60000"` explicite (chaîne, comme Cloudflare la fournit) + documentation des trois délais |
| `package.json` 0.8.0 · `README.md` (en-tête v0.8 : correctif, déploiement, retour arrière) · `test/worker.test.js` (+27 tests Worker-T8-*) | |
| `lib/provider-diagnostic.js` (+2 champs) · `tools/EvidenceForge/bin/launcher.js` | la sonde gratuite rapporte `proxyVersion` / `proxyTimeouts` ; `doctor` / `start` affichent quel proxy est déployé (« sans version annoncée : v0.6 / v0.7 — déployer v0.8 ») |
| `tools/fake-worker.js` (+en-têtes v0.8) · `tools/stream-replay.js` (+ attente des en-têtes, corps d'erreur) · `test/test-stream.js` (T-STREAM-20 invariants v0.8, T-STREAM-23 sonde) | |
| `config/monolith.config.json` (version), `tools/package.sh`, `tools/build-manifest.js`, `README.md` | |

Inchangés (diff vide) : prompts, `panel-sufficiency.js` (`fd05e26b…`), `economic-panel.js`, `stage-professionals.js`, `llm.js`, `llm-stream.js`, `live-status.js`, `pipeline.js`, `index.html`, `server.js`, `cost-*.js`, `budget-guard.js`, `run-stop.js`, lots gelés MONO-01/09/10/11 (0 divergence), Worker gelé MONO-08 v0.6 (`a4f70bda…`), MONOLITH-v1.0.8 et proxy v0.7 en place.

## 4. Tests

| Suite | Résultat |
|---|---|
| `worker/evidenceforge-llm-proxy-v0.8/test/worker.test.js` | **72 / 72** (45 hérités + 27 v0.8 : en-têtes à 1 / 7,9 / 8,5 / 20 / 45 s, dépassement ⇒ 504 explicite, flux 3 s > 1 s jamais interrompu, **flux 150 s > 60 s vérifié une fois** (`PROXY_TEST_FULL_SCALE=1`, PASS), flux inactif non coupé par le Worker, variables numérique / chaîne / invalide / négative / hors borne / alias / STREAM_*, 429 / 502 / 503 / 529 inchangés, secrets absents des journaux, rate limiter fail-closed, sonde doctor) |
| `test/test-monolith.js` (… T-STREAM-01…23) | **239 / 239** |
| `test/test-chunking.js` | 21 / 21 |
| navigateur v105 / v106 / v107 / v108 | 33 / 33 · 12 / 12 · 11 / 11 · 9 / 9 |
| `tools/EvidenceForge/test/test-launch.js` (ACTIVE_VERSION = v1.0.9) | voir bloc final |
| anti-hardcoding / secret-scan / lots gelés | 0 / 0 / 0 divergence |

## 5. Limites et suites (ordre imposé)

1. **Audit indépendant** du présent lot.
2. **Déploiement du proxy v0.8** (propriétaire) : `wrangler deploy` depuis `worker/evidenceforge-llm-proxy-v0.8/`, mêmes secrets et binding.
3. **`doctor` OK** : la sonde gratuite doit afficher `proxy evidenceforge-llm-proxy/0.8-stream-timeouts (header=60000;stream-inactivity=client;stream-max=client)`.
4. Seulement ensuite, reprise du run (18 revues VALID et 6 appels d'agrégation réutilisés à coût 0 ; budget 30 USD, 22,02 dépensés).

Non démontré ici : qu'une attente d'en-têtes réelle > 8 s et < 60 s se produise et aboutisse (jamais observée : le seul cas > 8 s a été coupé) — c'est le comportement attendu par construction (tests à 8,5 / 20 / 45 s avec amont factice). Un 504 restera possible au-delà de 60 s d'attente d'en-têtes ; il sera explicite (phase, délai, attente) et sans coût.

## 6. Verdict technique

**MONOLITH-v1.0.9 — GELABLE** (candidat, après audit indépendant, déploiement v0.8 et run réel de validation). Le gel appartient au propriétaire / à l'audit indépendant.
