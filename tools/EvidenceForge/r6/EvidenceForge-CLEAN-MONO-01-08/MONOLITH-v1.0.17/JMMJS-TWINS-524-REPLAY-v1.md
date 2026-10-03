# STREAM REPLAY — run `efm-20260918-a64167c0` (hors ligne, 0 appel fournisseur)

Généré le 2026-09-18T19:30:16.784Z par `tools/stream-replay.js` (MONOLITH-v1.0.8). Lecture seule des artefacts du run ; aucun contenu de document, aucun prompt, aucun secret.

## 1. État du run

| Champ | Valeur |
|---|---|
| statut | STOPPED / TWINS_REVIEWS |
| tentatives | 6 |
| erreur finale | PROVIDER_UNAVAILABLE à 2026-09-18T18:21:35.397Z (reprenable) |
| compteurs | {"llmReal":186,"llmReused":112,"openAlexCalls":510,"kitRealCalls":2,"reuseRefused":0} |
| budget | LIMITED 25 USD (alerte 22) |
| ledger | 196 appels réels, 112 réutilisations, 11.6049 USD |
| checkpoints | selection, professionals |

## 2. Fanout (cibles de revue)

| Mode | Documents | Cibles | Caractères de la cible | Jumeaux attendus | Revues attendues | Jumeaux construits par tentative |
|---|---|---|---|---|---|---|
| MISSION_DOSSIER | 9 | 1 | 132682 | 19 | 19 | t4:17, t5:17, t6:18 |

## 3. Tentatives (reprises)

| Tentative | Reprise à | Étape | Fin | État | Code | Durée (min) | Appels réels | Réutilisations | USD | Jumeaux | Pannes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-09-18T14:35:41.508Z | MISSION | — | — | — | — | 4 | 0 | 0.2893 | — | — |
| 2 | 2026-09-18T14:41:02.316Z | RETRIEVAL | — | — | — | — | 20 | 0 | 0.5896 | — | — |
| 3 | 2026-09-18T15:14:45.610Z | CORPUS | 2026-09-18T16:36:01.171Z | STOPPED | PROVIDER_UNAVAILABLE | 81.3 | 94 | 0 | 5.8943 | — | PROVIDER_UNAVAILABLE@16:36:01 |
| 4 | 2026-09-18T16:47:05.223Z | PROFESSIONALS | 2026-09-18T17:27:38.145Z | STOPPED | PROVIDER_UNAVAILABLE | 40.5 | 49 | 85 | 3.1454 | 17 | PROVIDER_UNAVAILABLE@17:27:38 |
| 5 | 2026-09-18T17:55:18.409Z | TWINS_REVIEWS | 2026-09-18T18:06:59.371Z | STOPPED | PROVIDER_UNAVAILABLE | 11.7 | 15 | 13 | 0.8827 | 17 | PROVIDER_UNAVAILABLE@18:06:59 |
| 6 | 2026-09-18T18:10:27.633Z | TWINS_REVIEWS | 2026-09-18T18:21:35.414Z | STOPPED | PROVIDER_UNAVAILABLE | 11.1 | 14 | 14 | 0.8036 | 18 | PROVIDER_UNAVAILABLE@18:21:35 |

Détail par finalité (appels réels / USD) :

- tentative 1 : preflight 1 (0.0001 USD) ; mission reformulation 1 (0.1626 USD) ; EF-01B resolver 1 (0.0538 USD) ; EF-01C1 planner 1 (0.0728 USD)
- tentative 2 : preflight 1 (0.0001 USD) ; screening 13 (0.3921 USD) ; screening informed-retry 1 (0.0167 USD) ; portfolio review 4 (0.1629 USD) ; portfolio review informed-retry 1 (0.0179 USD)
- tentative 3 : preflight 1 (0.0001 USD) ; probe 1 (0.0003 USD) ; EF-02D2 relevance 92 (5.8937 USD)
- tentative 4 : preflight 1 (0.0001 USD) ; probe 2 (0.0006 USD) ; EF-02D2 relevance 17 (1.1005 USD) ; EF-02D3 coverage 19 (1.4013 USD) ; EF-02D3 coverage informed-retry 10 (0.6432 USD)
- tentative 5 : preflight 1 (0.0001 USD) ; probe 1 (0.0003 USD) ; EF-02D3 coverage 6 (0.4327 USD) ; EF-02D3 coverage informed-retry 7 (0.4496 USD)
- tentative 6 : preflight 1 (0.0001 USD) ; probe 1 (0.0003 USD) ; EF-02D3 coverage 5 (0.3782 USD) ; EF-02D3 coverage informed-retry 7 (0.425 USD)

## 4. Échecs HTTP (3, dont 3 × 524)

| Tentative | Finalité | Passe | Début | Fin | Durée (s) | HTTP | Classé | providerRequestId | Prompt (car.) | ≈ jetons | twinId / targetId | Usage / coût |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | EF-03B review | 1 | 17:25:33.052 | 17:27:38.121 | 125.1 | 524 | PROVIDER_UNAVAILABLE | null | 164331 | 41083 | non journalisé / non journalisé | null / 0 USD |
| 5 | EF-03B review | 1 | 18:04:54.207 | 18:06:59.339 | 125.1 | 524 | PROVIDER_UNAVAILABLE | null | 163873 | 40968 | non journalisé / non journalisé | null / 0 USD |
| 6 | EF-03B review | 1 | 18:19:30.282 | 18:21:35.384 | 125.1 | 524 | PROVIDER_UNAVAILABLE | null | 163565 | 40891 | non journalisé / non journalisé | null / 0 USD |

## 5. Durée des appels réussis (par finalité)

| Finalité | Appels | Moy. (s) | Max (s) | Max jetons d'entrée |
|---|---|---|---|---|
| mission reformulation | 1 | 39 | 39 | 45050 |
| screening | 13 | 14 | 22.6 | 6613 |
| screening informed-retry | 1 | 2.8 | 2.8 | 4993 |
| portfolio review | 4 | 18.2 | 23.5 | 8392 |
| portfolio review informed-retry | 1 | 3.1 | 3.1 | 5266 |
| EF-02D2 relevance | 109 | 51.2 | 74.6 | 6997 |
| EF-02D3 coverage | 30 | 51.2 | 74.7 | 12250 |
| EF-02D3 coverage informed-retry | 24 | 40.4 | 58.1 | 9469 |

## 6. Revues logiques

| Attendues | Tentées | Validées | Réutilisées | Recalculées après panne |
|---|---|---|---|---|
| 19 | 3 | 0 | 0 | 2 |

aucune revue n'a jamais abouti : chaque tentative echoue sur la premiere revue

## 7. Où le progrès est perdu

- Reprises à TWINS_REVIEWS : 3 ; revues perdues (échec HTTP) : 3 ; coût des revues en échec : 0 USD (les appels en echec HTTP n'ont ni usage ni cout (aucun cout invente) ; le cout perdu est celui des passes de couverture rejouees a chaque reprise).
- tentative 5 : couverture rejouée — passe 1 : 6, reprises informées : 7, 0.8823 USD (passes de couverture rejouees apres une reprise (passes invalides jamais reutilisables : contrat MONO-11 VALID uniquement))
- tentative 6 : couverture rejouée — passe 1 : 5, reprises informées : 7, 0.8032 USD (passes de couverture rejouees apres une reprise (passes invalides jamais reutilisables : contrat MONO-11 VALID uniquement))


## 8. Lecture AVANT / APRÈS (analyse, hors outil)

| | AVANT — MONOLITH-v1.0.7 (mesuré) | APRÈS — MONOLITH-v1.0.8 (projeté hors ligne, aucun appel) |
|---|---|---|
| Transport de la revue | JSON non streaming : client `await res.text()` + Worker v0.6 `await upstreamResponse.text()` ; **aucun octet** avant la fin de la génération | Anthropic `stream: true` → Worker v0.7 relais SSE non bufferisé → client : en-têtes + `message_start` dans les premières secondes, puis `content_block_delta` continus |
| Fenêtre edge Cloudflare (≈ 125 s sans premier octet) | dépassée 3 fois sur 3 (125,07 / 125,13 / 125,10 s) → **HTTP 524** avant toute donnée | non applicable : la réponse est *commencée* à ≈ t+1–5 s ; la génération longue (dossier ≈ 41 k jetons d'entrée) s'écoule en flux, bornée par inactivité (90 s sans octet) et durée totale (15 min) |
| Revues logiques | 19 attendues, **0 aboutie** (3 tentatives, échec sur la 1ʳᵉ revue à chaque fois) | 19 attendues, 1 par jumeau × 1 cible (fanout inchangé, prouvé T-STREAM-01 / T-ECO-10) ; leur coût unitaire reste **non mesuré** (jamais abouti) : la projection ne l'invente pas |
| Fanout | 9 documents → 1 cible dossier (132 682 car.) ; jamais 171 / 288 / 480 | identique (Panel Sufficiency et `economic-panel.js` byte-identiques) |
| Coût des 3 appels en échec | 0 USD (aucun usage renvoyé) ; coût perdu = couverture rejouée à chaque reprise : 0,88 + 0,80 USD | un flux interrompu inscrit désormais l'usage connu (`interrupted`, `usageIncomplete`) ; aucun coût inventé |
| Observabilité pendant la revue | `state.json` figé (`updatedAt` 18:10:29 alors que le ledger progresse), aucun jumeau / cible / durée visibles, compteurs sautent à l'arrêt (173/98 → 186/112) | `live-status.json` + `state.live` : jumeau courant / total, cible, revues logiques attendues / complètes, état d'appel (STARTED → STREAMING → COMPLETED/FAILED), événements / octets / durée, heartbeat 10 s, compteurs à chaque activité significative |
| Identité de l'appel en échec | `twinId` / `targetId` non journalisés (v1.0.7) | journalisés (`llm-calls.jsonl`, ledger, événement `llm_stream_interrupted`, trace console optionnelle) |
| Retry | aucun (verrou de transport, run STOPPED reprenable) — inchangé | aucun retry automatique d'un flux interrompu (une génération déjà lancée serait re-facturée) ; 429 / 503 conservent l'attente bornée existante *avant* le premier octet |
| Reprise | rejoue la couverture (passes invalides non réutilisables : contrat MONO-11 VALID) ≈ 0,85 USD par reprise | inchangé (contrat gelé) — limitation consignée dans `REVIEW-RESUME-DESIGN-v1.md` ; les revues **validées** avant une interruption sont réutilisées à coût 0 (T-STREAM-22) |

Ce que ce replay ne démontre pas : qu'une revue de dossier de ≈ 41 k jetons aboutit en un temps donné chez le fournisseur (jamais mesuré ici), ni son coût. Ce que le lot v1.0.8 démontre localement (T-STREAM-03/04/09/21) : qu'un flux lent mais actif de plusieurs minutes n'est plus limité par l'attente du premier octet, que la reconstruction est canonique, et qu'une interruption ne produit jamais une réponse ni un cache réutilisable. La validation en conditions réelles reste un run réel autorisé par le propriétaire.

Note : la panne de la tentative 3 (`corpus fetch <ref>`, OpenAlex HTTP 504 pendant PROFESSIONALS) est étrangère au 524 des revues ; elle est listée par exhaustivité.
