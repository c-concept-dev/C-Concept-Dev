# STREAMING TRANSPORT DESIGN v1 — MONOLITH-v1.0.8

**Définition :** `v1.0.8 = v1.0.7 (inchangée) + STREAMING TRANSPORT + LIVE OBSERVABILITY` — correctif de **transport** des HTTP 524 constatés sur les revues de dossier (`ROOT-CAUSE-524-AUTOPSY-v1.md`). Aucun lot gelé modifié ; contrats scientifiques, Panel Sufficiency (`lib/panel-sufficiency.js` sha256 `fd05e26b…`), sémantique et indépendance des jumeaux, fanout (1 revue par jumeau × cible dossier), politique de reuse MONO-11 : **inchangés**.

## 1. Pourquoi le streaming (et pas un délai plus long, ni un découpage de la revue)

Le 524 est émis par l'edge Cloudflare quand l'origine (le Worker) n'a pas **commencé** à répondre dans ≈ 125 s. Allonger le délai local (180 s) n'y change rien ; découper la revue changerait la granularité scientifique (interdit par le mandat). Le seul correctif qui laisse la revue logique intacte est de faire **commencer** la réponse dès que le fournisseur commence à générer : Anthropic Messages `stream: true` renvoie `message_start` en quelques secondes, puis des `content_block_delta` continus jusqu'à `message_stop`.

## 2. Chaîne de transport

```
lib/llm.js (client)                          Worker v0.7 (edge Cloudflare)                     Anthropic
POST /v1/messages {…, stream:true}  ───────► POST api.anthropic.com/v1/messages {…, stream:true} ─►
accept: text/event-stream, application/json  (x-api-key injectée côté Cloudflare, jamais côté client)
◄── 200 text/event-stream (en-têtes immédiats) ◄── new Response(upstreamResponse.body)  ◄─── SSE : message_start … message_stop
lib/llm-stream.js : parseur SSE incrémental → assembleur déterministe → corps CANONIQUE
   → JSON.parse(raw) → text → validation (onValidation) → cache (<responseSha256>.response.json) → politique de reuse → ledger
```

- **Client** (`lib/llm.js › httpCall`) : `stream: true` ajouté au corps (même `model`, même `max_tokens`, même `prompt`) ; le délai `timeoutMs` (180 s) ne couvre plus que l'attente du **premier octet** (en-têtes) ; ensuite `lib/llm-stream.js › readSseResponse` lit `res.body` (ReadableStream) avec un délai d'**inactivité** (`llm.streaming.inactivityMs`, 90 s sans octet) et une **durée totale** (`maxTotalMs`, 15 min). Réponse `200` non SSE : chemin JSON historique. Réponse `200 application/json` dont le corps est un texte SSE (ancien Worker v0.6 qui aurait bufferisé le flux) : reconstruction depuis le texte (`SSE_BUFFERED_BY_PROXY`) — compatibilité ascendante, y compris pendant la migration du proxy.
- **Worker v0.7** (`worker/evidenceforge-llm-proxy-v0.7/`, copie additive de MONO-08 v0.6) : si `payload.stream === true` et que l'amont répond `200 text/event-stream`, relais **non bufferisé** du corps (`new Response(upstreamResponse.body, …)`, `cache-control: no-store`, `x-accel-buffering: no`, en-tête `X-EvidenceForge-Transport: sse-stream`) ; sinon chemin bufferisé historique inchangé (`X-EvidenceForge-Transport: buffered`). Authentification Bearer (`WORKER_API_KEY`), validation du payload, rate-limit, corrélation : inchangés. `ANTHROPIC_API_KEY` : lue, vérifiée, envoyée en amont — jamais renvoyée (test Worker-S7 + T-STREAM-20).

## 3. Reconstruction canonique (déterministe)

`createMessageAssembler` applique les événements Anthropic : `message_start` (id, model, role, usage d'entrée), `content_block_start/delta/stop` (texte concaténé par index de bloc), `message_delta` (stop_reason, stop_sequence, usage de sortie fusionné), `message_stop`, `ping` (ignoré), `error` (→ échec). Le corps canonique a des clés dans un ordre fixe : `id, type, role, model, content, stop_reason, stop_sequence, usage` — équivalent au corps non streaming. Le même flux découpé à n'importe quelle frontière d'octets (y compris au milieu d'un caractère UTF-8 multi-octets) produit le même corps et le même `responseSha256` (T-STREAM-03). C'est ce corps qui est mis en cache, hashé et donné à la politique de reuse : **le reuse ne voit aucune différence entre un corps streamé et un corps JSON**.

## 4. Fail-closed : jamais une réponse partielle

Un flux qui se termine sans `message_stop`, qui se tait (inactivité), qui dépasse la durée totale, dont la lecture échoue (socket, abort), qui porte un événement `error` ou un JSON invalide, ou qu'un arrêt utilisateur interrompt, **ne produit jamais une réponse** : exception `PROVIDER_STREAM_INTERRUPTED` (ou `STOPPED_BY_USER`, `PROVIDER_CAPACITY`, `PROVIDER_UNAVAILABLE`, `PROVIDER_BAD_RESPONSE`) portant les statistiques du flux ; aucun fichier de cache, aucune entrée de magasin, aucun texte partiel persisté nulle part (T-STREAM-06/12/13/14). Le code est un **verrou de transport** (`TRANSPORT_CODES`, `RESUMABLE`) : le lot gelé qui absorbe les exceptions ne transforme jamais une coupure en verdict ; le run s'arrête proprement, reprenable.

Journal (`llm-calls.jsonl`) d'un flux interrompu : `outcome STREAM_INTERRUPTED | STREAM_STOPPED_BY_USER`, `code`, `twinId`, `targetId`, `localRequestId`, `providerRequestId` (si `message_start` reçu), `promptSha256`, `responseSha256: null`, `usage` connu ou `null`, `stream { started, completed:false, events, bytes, elapsedMs, lastActivityAt, textChars, cause }`. Événement `llm_stream_interrupted` dans `events.jsonl`, puis `transport_failure_latched`.

## 5. Coût d'un flux interrompu

Si `message_start` a été reçu, l'usage d'entrée est connu : entrée `REAL_CALL` au ledger avec `interrupted: true`, `usageIncomplete: true` tant que `message_delta` n'a pas apporté l'usage final (T-STREAM-07). Si rien n'a été reçu : aucune entrée (jamais un coût inventé). Le garde-budget reste consulté **avant** chaque appel réel, streamé ou non (T-STREAM-15).

## 6. Retry

Aucun retry automatique d'un flux interrompu : la génération a déjà été lancée et facturée par le fournisseur ; la rejouer silencieusement doublerait le coût et masquerait la panne. L'attente bornée existante sur 429 / 503 (`retry-after`, `maxAttemptsOnCapacity`) ne s'applique qu'**avant** le premier octet (T-STREAM-11). La reprise est un acte explicite du propriétaire (nouvelle tentative), à coût 0 pour toute réponse déjà VALID (T-STREAM-22).

## 7. Observabilité (LIVE) — `lib/live-status.js`

`live-status.json` (schéma `EvidenceForge.LiveStatus`) et `state.live` (exposé par `/api/runs/:id`, `/api/runs/:id/cost › live`, interface) : `currentTwinIndex / currentTwinId / twinsTotal`, `currentTargetIndex / targetId / reviewTargetMode / targetsTotal`, `logicalReviewsExpected / logicalReviewsComplete / reviewsInvalidPasses`, `providerCallState` (IDLE → STARTED → STREAMING → COMPLETED | FAILED), `providerCallStartedAt`, `lastProviderActivityAt`, `streamEventsReceived`, `streamBytesReceived`, `elapsedMs`, `llmReal / llmReused`, `lastCheckpointAt`, `lastValidatedReviewAt`, `totalUsd / currentStageUsd`, `lastTransportCode / lastTransportAt`, `updatedAt`. Écriture sur activité **significative** (début / fin / interruption d'appel, validation, checkpoint, jumeaux construits) et par **heartbeat** (`observability.heartbeatMs`, 10 s) tant qu'un appel est en cours ; la progression du flux est bornée (`progressEveryMs` 5 s, `minWriteMs` 5 s) — jamais une écriture par jeton (T-STREAM-17). Une revue logique n'est « complète » que lorsqu'une passe est VALID.

Trace console optionnelle : `EVIDENCEFORGE_TRACE_REVIEWS=1` → `[EF REVIEW] twin=… review=i/N target=… state=STARTED|RECEIVED|VALIDATED…`, `[EF STREAM] … elapsed=… events=… bytes=… lastActivity=…`, `[EF REVIEW ERROR] … code=… streamStarted=… checkpoint=UNCHANGED resumable=true`. Jamais la clé, l'en-tête Authorization, le prompt ni la réponse (T-STREAM-18).

## 8. Configuration

`config/monolith.config.json › llm.streaming { enabled:true, inactivityMs:90000, maxTotalMs:900000, progressEveryMs:5000 }` ; `observability { heartbeatMs:10000, minWriteMs:5000 }`. Désactivation d'urgence : `EVIDENCEFORGE_LLM_STREAM=0` (chemin JSON v1.0.7, sujet au 524 sur les dossiers longs).

## 9. Déploiement du proxy (acte du propriétaire, hors de ce lot)

Voir `worker/evidenceforge-llm-proxy-v0.7/README.md` : `wrangler deploy` depuis ce dossier avec les **mêmes** secrets (`WORKER_API_KEY`, `ANTHROPIC_API_KEY`) et le même binding de rate-limit ; retour arrière = redéployer MONO-08 v0.6 (gelé, intact). Tant que v0.6 est déployé, le client v1.0.8 reste compatible (chemin bufferisé) mais le 524 n'est pas corrigé : le correctif est effectif **après** le déploiement de v0.7. `EVIDENCEFORGE_WORKER_API_KEY` / `LLM_WORKER_BASE_URL` côté client : inchangés.

## 10. Matrice des cas (T-STREAM-01…22, `test/test-stream.js`)

| Cas | Résultat attendu | État / coût / cache / reuse / reprenable |
|---|---|---|
| 200 JSON (non streaming, `EVIDENCEFORGE_LLM_STREAM=0`, preflight) | réponse, transport `JSON` | inchangé v1.0.7 |
| 200 SSE complet | réponse canonique, `SSE_STREAM` | cache + magasin ; reuse après VALID ; coût sur usage réel |
| 200 SSE lent mais actif | réponse (bornes inactivité / durée respectées) | idem |
| flux coupé / fin sans `message_stop` / vide | `PROVIDER_STREAM_INTERRUPTED` | STOPPED reprenable ; coût connu inscrit (`interrupted`) ; aucun cache ; aucun reuse ; checkpoint inchangé |
| inactivité / durée totale dépassée | `PROVIDER_STREAM_INTERRUPTED` (cause `STREAM_INACTIVITY` / `STREAM_MAX_DURATION`) | idem |
| `error` overloaded / autre dans le flux | `PROVIDER_CAPACITY` / `PROVIDER_UNAVAILABLE` | idem, aucun retry en cours de flux |
| SSE malformé | `PROVIDER_BAD_RESPONSE` | idem |
| 429 / 503 avant le premier octet | attente bornée puis nouvel essai | comme v1.0.7 |
| 500 / 502 / 524 | `PROVIDER_UNAVAILABLE` (httpStatus journalisé) | STOPPED reprenable, 0 USD (usage null) |
| aucun en-tête (délai local) | `PROVIDER_TIMEOUT` | STOPPED reprenable |
| réseau coupé / connexion refusée | `NETWORK_UNAVAILABLE` / `PROVIDER_CONNECTION_REFUSED` | STOPPED reprenable |
| budget atteint | `BUDGET_LIMIT_REACHED` avant toute requête | STOPPED reprenable après relèvement |
| arrêt utilisateur pendant le flux | `STOPPED_BY_USER` (flux annulé) | run-stop-state ; aucun partiel ; reprise explicite |
| ancien proxy (SSE bufferisé) | réponse `SSE_BUFFERED_BY_PROXY` ; incomplet ⇒ interrompu | idem 200 SSE / interrompu |
