# PROXY v0.8 TIMEOUT DESIGN v1 — MONOLITH-v1.0.9 / evidenceforge-llm-proxy 0.8

**Définition :** `v1.0.9 = v1.0.8 (client inchangé : streaming validé en réel) + proxy v0.8 (délais séparés, lecture stricte)`. Base : `ROOT-CAUSE-504-8S-AUTOPSY-v1.md`. Aucun lot gelé modifié ; MONOLITH-v1.0.8 et proxy v0.7 conservés en place, intacts.

## 1. Trois délais, trois responsabilités

| Délai | Qui l'applique | Phase couverte | Valeur | Source |
|---|---|---|---|---|
| **`HEADER_TIMEOUT_MS`** | **Worker v0.8** (seul minuteur du Worker) | de l'envoi de la requête amont à la réception des **en-têtes** Anthropic (pré-flux : file d'attente + *prefill*) | **60 000 ms** (bornes 1 000–90 000) | `wrangler.jsonc › vars` (chaîne) ; alias hérité `TIMEOUT_MS` ; sinon défaut |
| `STREAM_INACTIVITY_TIMEOUT_MS` | **client** MONOLITH (`lib/llm-stream.js`, `llm.streaming.inactivityMs`) | aucun octet reçu pendant le flux | 90 000 ms | `config/monolith.config.json` ; annoncé par le Worker si posé, **jamais appliqué** par lui |
| `STREAM_MAX_DURATION_MS` | **client** MONOLITH (`llm.streaming.maxTotalMs`) | durée totale du flux | 900 000 ms | idem |
| (premier octet, client) | client (`EVIDENCEFORGE_LLM_TIMEOUT_MS`) | attente des en-têtes vue du client | 180 000 ms | env ; doit rester > `HEADER_TIMEOUT_MS` pour que le 504 explicite arrive avant le `PROVIDER_TIMEOUT` client |

Le Worker arme `HEADER_TIMEOUT_MS` **avant** `fetch(amont)` et l'efface **dès** que `fetch` résout (= en-têtes reçus, `worker.js › clearTimeout` avant « 6 bis »). Le relais SSE (`new Response(upstreamResponse.body)`) et la lecture bufferisée (`upstreamResponse.text()`) ne sont soumis à aucun minuteur du Worker — c'était déjà le cas en v0.7 (les flux de 150 s l'ont prouvé en réel) ; v0.8 le rend explicite, testé (Worker-T8-stream-3s / -150s, -inactive, -source : un seul `setTimeout` dans le fichier) et annoncé (`X-EvidenceForge-Timeouts`).

## 2. Pourquoi 60 000 ms (et pas 8 000, ni 30 000, ni 120 000)

Mesure (run réel, 56 appels SSE réussis, `JMMJS-TWINS-504-REPLAY-v1.md § 4 bis`) : attente des en-têtes min 1,05 s, p50 2,03 s, p90 3,60 s, **max 7,03 s** ; l'appel en échec a dépassé 8 s. Cette attente dépend de la file d'attente et du *prefill* du fournisseur, pas de la taille du prompt (le 504 frappe un appel de 6 k jetons, les revues de 50 k jetons obtenaient leurs en-têtes en ≈ 2 s).

Contraintes d'architecture :
- **plancher** : le délai doit absorber la variabilité fournisseur ordinaire (dizaines de secondes sous charge) sans transformer chaque pic en panne ; 8 000 ms était à < 1 s du maximum mesuré ; 30 000 ms ne laisserait que ≈ 4 × ;
- **plafond edge** : au-delà de ≈ 100 s sans premier octet, Cloudflare répond **524** à la place du Worker (fenêtre mesurée 125,1 s en v1.0.7) — un 504 explicite (phase, délai, attente) vaut mieux qu'un 524 muet : `HEADER_TIMEOUT_MS` doit rester nettement sous cette fenêtre ⇒ borne max 90 000 ;
- **plafond client** : le client abandonne l'attente des en-têtes à 180 s (`PROVIDER_TIMEOUT`) ; le Worker doit répondre avant ⇒ < 180 000 ;
- **coût d'un faux positif** : un 504 pré-flux coûte 0 USD (aucun usage) mais arrête le run (verrou de transport, reprise manuelle) ; attendre 60 s de plus coûte 0 USD.

**60 000 ms** = ≈ 8,5 × le maximum observé, ≈ 17 × la p90, avec ≈ 40 s de marge sous la fenêtre edge et 120 s sous le délai client. Le défaut est **explicite** dans `wrangler.jsonc` (`"HEADER_TIMEOUT_MS": "60000"`) et identique sans variable.

## 3. Lecture stricte des variables (`parseBoundedMs`, `readTimeoutConfig`)

Cloudflare fournit `vars` **en chaîne** ; les tests locaux fournissent des nombres. Règle unique : absente / vide ⇒ défaut, sans trace ; `Number(String(v).trim())` non fini ⇒ défaut + trace `config_invalid` ; entier arrondi hors `[min, max]` ⇒ défaut + trace `config_out_of_range` (pas de clamp silencieux : une borne franchie est une erreur d'exploitation à voir) ; sinon valeur appliquée (`source: env`). Jamais `NaN`, `0` ni négatif. La trace ne porte que le nom de la variable, la nature du défaut et la valeur appliquée — **jamais la valeur brute** (qui pourrait être un secret collé au mauvais endroit ; test Worker-T8-env-invalid-request). `TIMEOUT_MS` reste accepté (trace `config_legacy_alias`) ; `HEADER_TIMEOUT_MS` prime.

## 4. Ce que dit une réponse v0.8

- Toute réponse : `X-EvidenceForge-Proxy`, `X-EvidenceForge-Request-Id`, **`X-EvidenceForge-Timeouts: header=60000;stream-inactivity=client;stream-max=client`** (doctor / autopsie sans deviner la configuration).
- 504 pré-flux : `{ error: "upstream_timeout", phase: "upstream_headers", headerTimeoutMs, headerTimeoutSource, upstreamWaitMs }` + `X-EvidenceForge-Transport: buffered`. Le client (v1.0.8, inchangé) le classe `PROVIDER_UNAVAILABLE`, verrou, run STOPPED reprenable, 0 USD, aucun cache réutilisable.

## 5. Matrice de test (Worker-T8-*, `test/worker.test.js`, 71 tests dont 26 v0.8)

| Cas | Attendu | Test |
|---|---|---|
| en-têtes à 1 / 7,9 / 8,5 / 20 / 45 s | 200 `sse-stream` sous le défaut (en parallèle, mur < 60 s) | T8-1s … T8-45s, T8-wall |
| dépassement `HEADER_TIMEOUT_MS` (1 500 ms, en-têtes à 4 s) | 504 explicite en ≈ 1,5 s (phase, délai, source, attente), journal sans secret | T8-timeout, T8-timeout-log |
| flux après en-têtes plus long que `HEADER_TIMEOUT_MS` | jamais interrompu : 3 s > 1 s (défaut de la suite) ; **150 s > 60 s** (`PROXY_TEST_FULL_SCALE=1`, exécuté une fois : PASS) ; par construction un seul `setTimeout`, effacé avant le relais | T8-stream-3s / -150s, T8-source |
| flux inactif | toujours ouvert après 2,5 s > `HEADER_TIMEOUT_MS` : garde client inchangée (MONOLITH T-STREAM-09) | T8-inactive |
| variable numérique / chaîne `"60000"` / `" 45000 "` / `"7999.6"` | appliquées (source env) | T8-env-number, T8-env-string |
| invalide (`"abc"`, `""`, `NaN`, `{}`, `"1e999"`) | défaut + `config_invalid` sans valeur brute | T8-env-invalid |
| négative / zéro | défaut + `config_out_of_range` | T8-env-negative |
| hors borne (`500`, `500000`) ; bornes exactes | défaut + trace ; 1 000 et 90 000 acceptés | T8-env-bounds |
| alias `TIMEOUT_MS` | accepté, trace `config_legacy_alias`, `HEADER_TIMEOUT_MS` prime | T8-env-legacy |
| `STREAM_*` posées | normalisées, annoncées `(client-enforced)`, jamais appliquées | T8-env-stream-vars |
| 429 / 502 / 503 / 529 amont | relayés inchangés, `buffered`, en-tête timeouts présent | T8-http-* |
| rate limiter absent | 503 fail-closed, aucun appel amont, quelle que soit la configuration | T8-ratelimit |
| secrets | absents des journaux et des en-têtes (T8-timeout-log, T8-env-invalid-request, Worker-S7 hérité) | — |

## 6. Hors périmètre (inchangé)

Prompts, Panel Sufficiency, sémantique des revues, MISSION_DOSSIER, fanout, validation, reuse, ledger, indépendance des jumeaux, client `lib/llm.js` / `lib/llm-stream.js` / `lib/live-status.js` : **diff vide** entre v1.0.8 et v1.0.9 (seuls `config` version, `tools/package.sh`, `tools/build-manifest.js`, `tools/stream-replay.js` (+ statistiques d'attente des en-têtes), `test/test-stream.js` (T-STREAM-20 : invariants v0.8), `README.md`, les documents du lot et le dossier `worker/` changent).
