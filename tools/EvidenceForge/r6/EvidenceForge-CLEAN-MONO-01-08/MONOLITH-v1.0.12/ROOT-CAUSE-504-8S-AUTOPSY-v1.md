# ROOT CAUSE 504 @ 8 s AUTOPSY v1 — run réel `efm-20260918-a64167c0`, tentative 7 (MONOLITH-v1.0.8 + proxy v0.7)

**Date :** 2026-09-19 · **Lecture seule** des artefacts du run (`llm-calls.jsonl`, `events.jsonl`, `cost-ledger.jsonl`, `live-status.json`, `llm-cache/`), du code v1.0.8 et du Worker v0.7. **Aucun appel fournisseur.**

## 1. Le correctif streaming v1.0.8 est validé en réel

Tentative 7 (reprise à TWINS_REVIEWS, 06:24:41 → 07:49:22 UTC) : **56 appels SSE réussis** (`transport: SSE_STREAM`, `stream.canonical: true`), 0 × 524.

| Finalité | Appels SSE | Durée totale max | Flux (`stream.elapsedMs`) max | Jetons d'entrée max |
|---|---|---|---|---|
| EF-02D3 coverage (+ reprises) | 9 | 52,5 s | 51,5 s | 11 591 |
| **EF-03B review** (18 passes 1) | 18 | **155,8 s** | 153,8 s | 51 410 |
| EF-03B review informed-retry | 23 | **156,3 s** | 154,1 s | 49 606 |
| downstream (agrégation, après les 18 revues) | 6 | 23,6 s | 22,5 s | 8 156 |

Exemples : 147,7 s / 149,0 s / 147,7 s / 154,8 s / 156,3 s / 145,2 s — tous `HTTP 200 SSE_STREAM`. L'ancien plafond (524 à ≈ 125 s) est **dépassé sans incident** ; les revues de dossier ≈ 48–51 k jetons aboutissent. `live-status.json` : 18 jumeaux, 18 revues logiques attendues, 11 validées, 12 passes invalides reprises ; état d'appel suivi (STARTED → STREAMING → COMPLETED) sur toute la tentative. **Ce mécanisme n'est pas modifié par le présent lot.**

## 2. Le nouvel incident : HTTP 504 après 8,187 s, sans flux

`llm-calls.jsonl` (dernier appel, 381ᵉ ligne avant le verrou) :

```
purpose            downstream (agrégation MONO-11, autonomous-run.js:128 › recordedLlmCall)
startedAt          2026-09-19T07:49:14.617Z
completedAt        2026-09-19T07:49:22.804Z        → 8 187 ms
httpStatus         504
providerRequestId  null                            → Anthropic n'a jamais répondu (aucun message_start)
usage              null                            → aucun coût (aucun coût inventé)
transport          JSON · stream: null             → aucun flux commencé : le corps reçu est un JSON d'erreur
responseSha256     03ddb52e120cf39b…  ⇒ llm-cache : {"error":"upstream_timeout","message":"Timeout upstream Anthropic."}
prompt             25 321 caractères (≈ 6,3 k jetons) — le plus petit type d'appel de la tentative
```

Puis `events.jsonl` : `llm_call HTTP_504` (07:49:22.808) → `transport_failure_latched PROVIDER_UNAVAILABLE where=downstream` (07:49:22.839) → `STOPPED` reprenable (07:49:22.876). Checkpoint aval non écrit (les 18 revues restent réutilisables à la reprise, VALID uniquement).

Le corps `{"error":"upstream_timeout"}` est **celui du Worker** (`worker.js:281`, branche `AbortError` → 504) : ce n'est ni un 504 Anthropic, ni un code edge Cloudflare.

## 3. Chemin exact du 504

```
worker.js:39    const DEFAULT_TIMEOUT_MS = 8000;
worker.js:190   const timeoutMs = typeof env.TIMEOUT_MS === "number" ? env.TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
wrangler.jsonc  "vars": {}                                   → env.TIMEOUT_MS absent ⇒ timeoutMs = 8000
worker.js:259   timer = setTimeout(() => controller.abort(), timeoutMs)     ← armé AVANT fetch amont
worker.js:263   upstreamResponse = await fetchImpl(anthropic, { signal })   ← résout à la réception des EN-TÊTES
worker.js:274   catch AbortError ⇒ clearTimeout ⇒ 504 { error: "upstream_timeout" }
worker.js:283   clearTimeout(timer)                                          ← seulement si les en-têtes sont arrivés avant 8 s
```

Le minuteur ne couvre donc que l'**attente des en-têtes** amont (pré-flux) — ce qui explique que les flux de 150 s n'ont jamais été coupés (le timer est effacé dès les en-têtes). Mais il est **trop court** : 8 000 ms + ≈ 187 ms de transit client ↔ edge = 8 187 ms mesurés.

Même si `TIMEOUT_MS` avait été posé dans `vars`, Cloudflare fournit les variables en **chaîne** : `typeof env.TIMEOUT_MS === "number"` aurait été faux et le défaut 8 000 appliqué quand même (second défaut, corrigé par ce lot).

## 4. Pourquoi 8 s est trop court : mesure de l'attente des en-têtes (56 appels réussis)

Attente des en-têtes vue du client = durée totale − `stream.elapsedMs` (inclut aller-retour client ↔ edge ↔ Worker ↔ Anthropic et le *prefill* du fournisseur) :

| | min | p50 | p90 | max |
|---|---|---|---|---|
| tous appels SSE (56) | 1,05 s | 2,03 s | 3,60 s | **7,03 s** |
| EF-03B review (18) | 1,83 s | 2,10 s | — | 5,82 s |
| EF-03B informed-retry (23) | 1,79 s | 2,14 s | — | 7,03 s |
| downstream (6) | 1,07 s | 1,10 s | — | 3,60 s |

Le maximum observé sur les appels réussis (7,03 s) est à **moins d'une seconde** du plafond de 8 s ; le 57ᵉ appel l'a dépassé. Le temps avant en-têtes dépend de la file d'attente et du *prefill* du fournisseur, pas de la taille du prompt (le 504 frappe un appel de 6 k jetons juste après des revues de 50 k jetons servies en 2 s). Il n'y a **aucune corrélation** avec le contenu ; c'est une variabilité fournisseur ordinaire.

## 5. Ce qui n'est pas en cause

- Streaming client v1.0.8 (`lib/llm.js`, `lib/llm-stream.js`) : aucun flux commencé ; gardes premier octet (180 s) / inactivité (90 s) / durée totale (15 min) non atteintes.
- Edge Cloudflare : pas de 524 ; la réponse 504 vient du Worker en 8,2 s.
- Fournisseur : 56 appels réussis, dont 6 « downstream » identiques (1,5–23,6 s) juste avant.
- Fanout / Panel Sufficiency / revues : 18 jumeaux, 18 revues logiques, agrégation en cours (6 appels réussis, 7ᵉ en échec).
- Budget : 10,42 USD sur la tentative 7 ; 22,02 USD cumulés sur un plafond LIMITED relevé à 30 USD (alerte 25 USD, non encore franchie) — sans rapport avec le 504 ; marge ≈ 8 USD pour la reprise (agrégation restante + rapport).

## 6. Conclusion

**ROOT_CAUSE :** délai d'attente des en-têtes amont du Worker figé à 8 000 ms (`DEFAULT_TIMEOUT_MS`), non configuré (`vars: {}`) et de toute façon non configurable par variable Cloudflare (test `typeof === "number"` sur une chaîne) ; le fournisseur a mis > 8 s à répondre ses en-têtes sur un appel d'agrégation ⇒ `AbortError` ⇒ 504 `upstream_timeout` ⇒ `PROVIDER_UNAVAILABLE` (verrou, run STOPPED reprenable). Le défaut est **pré-flux** (aucun `providerRequestId`, aucun événement, `stream: null`). Correctif : proxy v0.8 — séparer explicitement `HEADER_TIMEOUT_MS` (seul minuteur du Worker, pré-en-têtes), `STREAM_INACTIVITY_TIMEOUT_MS` et `STREAM_MAX_DURATION_MS` (documentés comme gardes **client**, jamais appliqués par le Worker au flux), défaut `HEADER_TIMEOUT_MS` justifié par la mesure, lecture stricte des variables (chaîne / nombre / bornes / défaut sûr).
