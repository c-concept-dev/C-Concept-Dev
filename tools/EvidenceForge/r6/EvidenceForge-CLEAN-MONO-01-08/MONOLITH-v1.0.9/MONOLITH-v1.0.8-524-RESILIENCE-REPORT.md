# MONOLITH-v1.0.8 — CORRECTIF POST-SMOKE v1.0.7 : ÉLIMINER LES HTTP 524 DE TWINS_REVIEWS SANS RÉINTRODUIRE LE FANOUT — RAPPORT DE LOT

**Date :** 2026-09-18 · **Base :** MONOLITH-v1.0.7 (candidat GELABLE, zip `95a20099…`, non modifiée) · **Définition :** `v1.0.8 = v1.0.7 + STREAMING TRANSPORT + LIVE OBSERVABILITY`
**Coût du lot :** 0 USD — aucun appel fournisseur réel ; autopsie, replay et tests entièrement locaux (Worker factice SSE sur 127.0.0.1). Documents : `ROOT-CAUSE-524-AUTOPSY-v1.md` (avant tout code), `STREAMING-TRANSPORT-DESIGN-v1.md`, `REVIEW-RESUME-DESIGN-v1.md`, `JMMJS-TWINS-524-REPLAY-v1.{md,json}`.

## 1. Cause racine (autopsie du run réel `efm-20260918-a64167c0`)

- **ROOT_CAUSE :** transport non streaming de bout en bout — client `lib/llm.js` (`await res.text()`) et Worker gelé MONO-08 v0.6 (`await upstreamResponse.text()`) n'émettent **aucun octet** avant la fin de la génération. La revue du dossier de mission (1 cible, 132 682 caractères, prompt 164 331 caractères ≈ 41 k jetons) dure > 125 s ; l'edge Cloudflare ferme la requête sans premier octet : **HTTP 524** (3 × 125,1 s ± 0,03 s, tentatives 4/5/6, `providerRequestId null`, `usage null`).
- **Ce qui n'est pas en cause :** fanout (v1.0.7 : 9 documents → 1 cible, 19 jumeaux → 19 revues attendues, jamais 171 / 288 / 480), Panel Sufficiency (checkpoint professionnel DONE), délai local 180 s (non atteint), Worker (n'émet jamais 524), fournisseur (183 appels réussis juste avant, aucun > 75 s).
- **Second défaut :** observabilité différée (`state.json` figé pendant TWINS_REVIEWS, compteurs écrits seulement à l'échec / aux transitions, aucune identité jumeau / cible).

## 2. Ce qui change (MONOLITH uniquement ; lots gelés intacts)

| Fichier | Nature |
|---|---|
| `lib/llm-stream.js` (AJOUTÉ, 107 l., pur) | parseur SSE incrémental, assembleur déterministe, corps canonique (`id, type, role, model, content, stop_reason, stop_sequence, usage`), `readSseResponse` (inactivité / durée totale / arrêt utilisateur / fail-closed), `assembleFromSseText` (compat proxy bufferisant) |
| `lib/llm.js` (+51 / −16) | `stream: true` (même modèle, même `max_tokens`, même prompt) ; délai 180 s = premier octet ; lecture SSE ; interruption → `PROVIDER_STREAM_INTERRUPTED` journalisée (twinId, targetId, localRequestId, providerRequestId, événements, octets, durée, cause), coût connu inscrit `interrupted` / `usageIncomplete`, aucun cache, aucun reuse, aucun retry ; `transport` et identité de la revue au journal ; trace console optionnelle ; `EVIDENCEFORGE_LLM_STREAM=0` = chemin v1.0.7 |
| `lib/live-status.js` (AJOUTÉ, 73 l.) | `live-status.json` + `state.live` : tous les compteurs du mandat, états d'appel, heartbeat borné, écriture sur activité significative, trace `[EF REVIEW]` / `[EF STREAM]` / `[EF REVIEW ERROR]` |
| `lib/pipeline.js` (+12 / −6) | branchement `onTrace` / `onStream` / `onValidation` / `log` → live ; `RESUMABLE += PROVIDER_STREAM_INTERRUPTED` ; cible et mode notés avant l'aval ; événement `checkpoint_saved` ; `live.stop()` |
| `lib/cost-view.js` (+10) · `lib/run-store.js` (+1) · `index.html` (+5) · `lib/cost-ledger.js` (+2) | bloc `live` de la vue de coût ; `state.live` public ; ligne « Appel fournisseur en cours » / « Revues logiques » / « Dernière activité » ; champs `interrupted`, `usageIncomplete` |
| `config/monolith.config.json` (+14) | `llm.streaming { enabled, inactivityMs 90000, maxTotalMs 900000, progressEveryMs 5000 }`, `observability { heartbeatMs 10000, minWriteMs 5000 }` |
| `worker/evidenceforge-llm-proxy-v0.7/` (AJOUTÉ, copie additive de MONO-08 v0.6) | relais SSE non bufferisé quand `payload.stream === true` (`new Response(upstreamResponse.body)`), en-tête `X-EvidenceForge-Transport`, compat non streaming conservée, 45/45 tests (+7 streaming), README de migration / déploiement / retour arrière ; **non déployé par ce lot** |
| `test/test-stream.js` (AJOUTÉ, T-STREAM-01…22) · `tools/browser-tests-v108.js` (AJOUTÉ) · `tools/fake-worker.js` (+42 : modes SSE) · `tools/stream-replay.js` (AJOUTÉ) | tests, Worker factice, replay hors ligne |
| adaptés | `test/test-monolith.js` (chargement de la suite), `tools/build-manifest.js`, `tools/package.sh`, `README.md` |

Inchangés (diff vide) : `panel-sufficiency.js` (sha256 `fd05e26b708c4d4cdc59595838145669d05a267393629dbd922827c289bf7a3e` avant et après), `economic-panel.js`, `stage-professionals.js`, `budget-guard.js`, `run-stop.js`, `professional-selection.js`, `screening-*.js`, `cost-forecast.js`, `provider-diagnostic.js`, `pricing.js`, `document-chunker.js`, `stage-*.js`, `server.js`, `vendor/`, lots gelés MONO-01 / 09 / 10 / 11 (0 divergence), Worker MONO-08 v0.6 (sha256 `a4f70bda…` intact).

## 3. Invariants garantis

| Exigence | Garantie | Test |
|---|---|---|
| Aucun fanout historique | 9 docs → 1 cible ; 19 jumeaux → 19 revues logiques ; 171 = items de grille, jamais des revues | T-STREAM-01, T-ECO-10/11 |
| Streaming = transport seul | même modèle / `max_tokens` / prompt ; corps canonique ≡ corps JSON ; même coût au ledger | T-STREAM-02/03/04 |
| Reuse MONO-11 inchangé | avant VALID : appel réel ; après VALID : reuse à coût 0 ; entrée de magasin complète (promptSha256, responseSha256, providerRequestId, VALID, providerId, modelId, sourceSealHash, MONO-11-v2) | T-STREAM-05, L5 |
| Jamais une réponse partielle | interruption ⇒ exception, aucun cache, aucune entrée, aucun texte partiel persisté, checkpoint inchangé | T-STREAM-06/12/13/14/21 |
| Coût jamais inventé, jamais caché | usage connu ⇒ `REAL_CALL interrupted` ; rien reçu ⇒ aucune entrée ; budget consulté avant la requête | T-STREAM-07/15 |
| Aucun retry silencieux / infini | 1 requête par flux interrompu ; 429 / 503 : attente bornée existante avant le premier octet | T-STREAM-08/11 |
| Bornes | inactivité 90 s, durée totale 15 min, premier octet 180 s ; flux lent mais actif ⇒ succès | T-STREAM-09/10 |
| Codes HTTP | 524 / 500 / 502 ⇒ `PROVIDER_UNAVAILABLE` (httpStatus journalisé) ; 503 ⇒ `PROVIDER_CAPACITY` ; tous reprenables | T-STREAM-11 |
| Arrêt utilisateur | pendant le flux ⇒ `STOPPED_BY_USER`, flux annulé, rien de partiel ; avant ⇒ aucune requête | T-STREAM-14 |
| Observabilité live | tous les champs du mandat ; `updatedAt` et compteurs pendant le flux ; jamais par jeton ; revue « complète » = VALID | T-STREAM-17/21, navigateur v108 |
| Secrets | jamais la clé, Authorization, prompt ni réponse dans journaux, statut live, trace | T-STREAM-18/19, K1, Worker-S7 |
| Frozen / Panel Sufficiency / proxy gelé | 0 divergence ; byte-identiques | T-STREAM-20, I1 |
| Reprise | revue validée réutilisée à coût 0 ; revue interrompue recalculée en réel | T-STREAM-22 |
| Pipeline bout en bout | flux coupé ⇒ STOPPED reprenable, étape INTERRUPTED, live FAILED, aucun checkpoint aval ; reprise ⇒ COMPLETED, revue `SSE_STREAM` | T-STREAM-21 |

## 4. Replay hors ligne du run réel (`JMMJS-TWINS-524-REPLAY-v1.md`, 0 appel)

| | AVANT (mesuré, v1.0.7) | APRÈS (v1.0.8, projeté) |
|---|---|---|
| revues logiques | 19 attendues, 0 aboutie, 3 tentatives × 524 à 125,1 s | 19 attendues ; réponse commencée dès `message_start`, génération bornée par inactivité / durée ; coût unitaire **non mesuré** (jamais abouti) — non inventé |
| identité de l'échec | twinId / targetId non journalisés | journalisés (journal, ledger, événement, trace) |
| coût perdu | 0 USD sur les 524 (usage null) ; 0,88 + 0,80 USD de couverture rejouée par reprise | inchangé pour la couverture (contrat gelé, `REVIEW-RESUME-DESIGN-v1.md § 3`) ; usage d'un flux interrompu inscrit |
| observabilité | `state.json` figé 11 min ; compteurs sautent à l'arrêt | live-status + heartbeat 10 s |

## 5. Tests

| Suite | Résultat |
|---|---|
| `test/test-monolith.js` (I/L/Q/X/K…, v105, panel, sufficiency, screening-cost, run-safety, economic-panel, **stream T-STREAM-01…22**) | **238 / 238** (216 + 22) |
| `test/test-chunking.js` | 21 / 21 |
| `tools/browser-tests-v108.js` (observabilité live, API + UI) | 9 / 9 |
| `tools/browser-tests-v107.js` / `-v106.js` / `-v105.js` | 11 / 11 · 12 / 12 · 33 / 33 |
| `worker/evidenceforge-llm-proxy-v0.7/test/worker.test.js` | 45 / 45 (38 hérités + 7 streaming) |
| `tools/EvidenceForge/test/test-launch.js` (ACTIVE_VERSION = v1.0.8) | voir bloc final |
| anti-hardcoding / secret-scan / lots gelés | 0 hit / 0 hit / 0 divergence |

## 6. Limites et suites

- **Le correctif est effectif après le déploiement du proxy v0.7** (acte du propriétaire : `wrangler deploy` depuis `worker/evidenceforge-llm-proxy-v0.7/`, mêmes secrets et binding). Tant que v0.6 est déployé, le client v1.0.8 reste compatible (SSE bufferisé reconstruit) mais l'edge bufferise toujours : le 524 subsiste sur les dossiers longs.
- La durée réelle et le coût d'une revue de dossier ≈ 41 k jetons restent **non mesurés** : un run réel autorisé sous v1.0.8 (proxy v0.7 déployé) est requis avant gel ; ce run doit être surveillé via `live-status` et, si besoin, `EVIDENCEFORGE_TRACE_REVIEWS=1`.
- Reprise : la couverture invalide est rejouée à chaque reprise (≈ 0,85 USD ici) — contrat gelé MONO-11, consigné, non modifié.
- Pas de checkpoint interne à la revue (justifié dans `REVIEW-RESUME-DESIGN-v1.md`) ; à reconsidérer seulement si des interruptions *après* le premier octet apparaissent en réel.
- Numérotation : « proxy v0.7 » suit la version du paquet Worker (0.6 → 0.7) ; elle est distincte des lots MONO-08 v0.7 / v0.8 (bibliothèques de préparation d'artefacts), qui ne contiennent pas de Worker.

## 7. Verdict technique

**MONOLITH-v1.0.8 — GELABLE** (candidat, après déploiement du proxy v0.7 et run réel de validation). Le gel appartient au propriétaire / à l'audit indépendant.
