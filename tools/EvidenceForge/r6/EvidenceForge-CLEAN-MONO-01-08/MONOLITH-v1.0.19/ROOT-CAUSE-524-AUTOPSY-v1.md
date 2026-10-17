# ROOT CAUSE 524 AUTOPSY v1 — run réel `efm-20260918-a64167c0` (TWINS_REVIEWS, MONOLITH-v1.0.7)

**Date :** 2026-09-18 · **Lecture seule** : artefacts du run, code v1.0.7, code du Worker gelé MONO-08 v0.6. Aucun appel fournisseur.
**Run :** mission JMMJS D103P0.1, 9 documents, budget LIMITED 25 USD, 6 tentatives, statut final `STOPPED / PROVIDER_UNAVAILABLE (HTTP 524)` à `TWINS_REVIEWS` (18:21:35 UTC), `resumable: true`, 11,61 USD dépensés, 186 appels réels + 112 réutilisations.

## 1. Le fanout est corrigé (v1.0.7 a fait son travail)

| Preuve | Valeur |
|---|---|
| `review-targets.json` | `mode: MISSION_DOSSIER`, `sourceDocumentCount: 9`, **1 cible** de 132 682 caractères |
| `economic-projection.json` | `EXPECTED_TWINS: 19`, `EXPECTED_REVIEWS: 19` (status PARTIAL : aucun coût de revue mesuré avant la première revue, donc pas de porte) |
| `events.jsonl › twins_built` | 17 / 17 / 18 jumeaux construits (tentatives 4, 5, 6) |
| revues attendues | jumeaux × 1 cible = 17–18 logiques (jamais 17 × 9 = 153 ni 480) |

## 2. Le chemin exact du 524

### 2.1 Chronologie (3 occurrences, strictement identiques)

| Tentative | `twins_built` | 1ʳᵉ revue EF-03B `startedAt` | `completedAt` (524) | Durée |
|---|---|---|---|---|
| 4 | 17:25:33.041 | 17:25:33.052 | 17:27:38.121 | **125,07 s** |
| 5 | 18:04:54.199 | 18:04:54.207 | 18:06:59.339 | **125,13 s** |
| 6 | 18:19:30.274 | 18:19:30.282 | 18:21:35.384 | **125,10 s** |

`llm-calls.jsonl` (3 entrées `EF-03B review`) : `httpStatus: 524`, `providerRequestId: null`, `usage: null`, `providerAttempts: 1`, `capacityWaits: []`, `responseSha256` identique (corps d'erreur Cloudflare identique). Le 524 tombe **toujours à ≈ 125 s**, bien avant le délai local de 180 s.

### 2.2 Flux HTTP (v1.0.7)

```
lib/llm.js:149   body = { model, max_tokens: 8192, messages:[{role:"user", content: prompt}] }      ← NON streaming
lib/llm.js:94    fetch(LLM_WORKER_BASE_URL + "/v1/messages", { … signal: AbortController(180 000 ms) })
lib/llm.js:94    raw = await res.text()                                                              ← attend le corps COMPLET
   ↓ Cloudflare edge (zone du Worker evidenceforge-llm-proxy)
worker.js:246    upstreamResponse = await fetchImpl("https://api.anthropic.com/v1/messages", { body: rawBody })   ← relais non streaming
worker.js:271    upstreamBodyText = await upstreamResponse.text()                                    ← BUFFERISE toute la génération
worker.js:280    return new Response(upstreamBodyText, …)                                            ← 1ʳᵉ réponse au client APRÈS la génération complète
```

Le Worker gelé (MONO-08 v0.6, `src/worker.js`) ne renvoie **aucun octet** au client tant qu'Anthropic n'a pas terminé la génération : la connexion client ↔ edge reste sans en-tête de réponse pendant toute la durée de l'appel amont.

### 2.3 Qui émet le 524

- Le Worker ne produit jamais 524 : ses codes sont 401 / 404 / 400 / 429 / 503 / 500 / **504 (timeout amont, `AbortError`)** / 502 (`worker.js:250-262`).
- Le délai local (180 s, `lib/llm.js:60`) n'est pas atteint (125 s) : l'erreur n'est pas `PROVIDER_TIMEOUT`.
- Le corps reçu est classé `PROVIDER_UNAVAILABLE` par `provider-diagnostic.js:61` (`status >= 500`).
- Un 524 est un code **Cloudflare edge** (« origin timed out ») : l'edge a fermé la requête parce que le Worker (origine du point de vue de l'edge) n'a pas commencé à répondre dans la fenêtre autorisée. Trois mesures à 125,1 s ± 0,03 s : fenêtre effective ≈ 120–125 s.

### 2.4 Pourquoi la revue dépasse la fenêtre et pas les autres appels

| Appel | Entrée | Sortie | Durée mesurée (200) |
|---|---|---|---|
| EF-02D2 pertinence (109) | ~10 k jetons | ≤ 4,6 k jetons | moy 51 s, max 75 s |
| EF-02D3 couverture (30 + 24 reprises) | ~11 k jetons | ~2,6 k jetons | moy 51 s, max 75 s |
| **EF-03B revue (dossier)** | **164 331 caractères ≈ 41–45 k jetons** (prompt `f293ca8a…`) | attendu ≥ 3–5 k jetons (findings × 8 angles) | **> 125 s → 524** |

183 appels réussis, **aucun > 75 s** ; la revue du dossier est le seul appel dont la durée totale de génération dépasse la fenêtre de l'edge. La cause n'est ni la disponibilité du fournisseur (les appels de couverture réussissaient juste avant), ni le navigateur, ni l'API locale, ni le fanout (1 cible), ni Panel Sufficiency (checkpoint professionnel DONE, panel figé).

### 2.5 Ce que le mode dossier a changé

En v1.0.5/v1.0.6 la cible était un document de ~5 000 caractères (≈ 1,3 k jetons) : revues de 30–60 s, sous la fenêtre. Le dossier de mission (132 682 caractères) multiplie l'entrée par ~30 ; le temps de génération devient supérieur à la fenêtre edge parce que le transport attend la réponse **complète** avant d'émettre le premier octet.

## 3. Second défaut : observabilité différée

- `state.json › counters.llmReal / llmReused` ne sont écrits que par `fail()` (`pipeline.js:95`) et aux transitions d'étape (`:132`) ; `updatedAt` idem. Pendant TWINS_REVIEWS (23 min de couverture puis 125 s de revue), l'état public reste figé (`updatedAt = 18:10:29.613Z` alors que le ledger progresse : 11,26 → 11,60 USD).
- La vue de coût (`/api/runs/:id/cost`) lit le ledger et bouge ; l'état (`/api/runs/:id`) non. Les compteurs « sautent » à l'arrêt (173/98 → 186/112).
- Aucune information « quel jumeau, quelle cible, appel en cours depuis combien de temps » n'est exposée.

## 4. Troisième constat : coût de reprise

| Tentative | appels réels | réutilisations | USD | contenu |
|---|---|---|---|---|
| 4 | 46 | 85 | 3,15 | couverture 19 + 10 reprises, pertinence 17 |
| 5 | 13 | 13 | 0,88 | couverture 6 + 7 reprises informées |
| 6 | 12 | 14 | 0,80 | couverture 5 + 7 reprises informées |

Chaque reprise re-paie ≈ 0,85 USD de couverture : les réponses de passe 1 **invalides** ne sont jamais réutilisables (contrat de reuse MONO-11 : VALID uniquement), donc la passe 1 est rejouée en réel et, non déterministe, peut produire une autre réponse invalide qui change le prompt de reprise. Ce n'est pas la cause du 524 ; c'est un coût de reprise structurel, hors périmètre du transport (contrat gelé), consigné ici.

## 5. Conclusion

**ROOT_CAUSE :** transport non streaming de bout en bout (client `await res.text()` + Worker `await upstreamResponse.text()`), combiné à une revue dont la génération dure > 125 s (dossier de mission ≈ 45 k jetons d'entrée), déclenchant le timeout **edge Cloudflare 524** avant le premier octet de réponse. Local timeout (180 s) et Worker timeout (504) ne sont pas en cause. Le correctif est un correctif de **transport** : faire émettre les en-têtes et les premiers événements dans les secondes suivant l'envoi (streaming Anthropic `stream: true`, relais SSE non bufferisé par le Worker, reconstruction canonique côté client), sans changer la revue logique (1 par jumeau et par mission).
