# STREAM REPLAY — run `efm-20260918-a64167c0` (hors ligne, 0 appel fournisseur)

Généré le 2026-09-19T08:24:10.362Z par `tools/stream-replay.js` (MONOLITH-v1.0.8). Lecture seule des artefacts du run ; aucun contenu de document, aucun prompt, aucun secret.

## 1. État du run

| Champ | Valeur |
|---|---|
| statut | STOPPED / TWINS_REVIEWS |
| tentatives | 7 |
| erreur finale | PROVIDER_UNAVAILABLE à 2026-09-19T07:49:22.866Z (reprenable) |
| compteurs | {"llmReal":243,"llmReused":127,"openAlexCalls":510,"kitRealCalls":2,"reuseRefused":0} |
| budget | LIMITED 30 USD (alerte 25) |
| ledger | 254 appels réels, 127 réutilisations, 22.0211 USD |
| checkpoints | selection, professionals |

## 2. Fanout (cibles de revue)

| Mode | Documents | Cibles | Caractères de la cible | Jumeaux attendus | Revues attendues | Jumeaux construits par tentative |
|---|---|---|---|---|---|---|
| MISSION_DOSSIER | 9 | 1 | 132682 | 19 | 19 | t4:17, t5:17, t6:18, t7:18 |

## 3. Tentatives (reprises)

| Tentative | Reprise à | Étape | Fin | État | Code | Durée (min) | Appels réels | Réutilisations | USD | Jumeaux | Pannes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-09-18T14:35:41.508Z | MISSION | — | — | — | — | 4 | 0 | 0.2893 | — | — |
| 2 | 2026-09-18T14:41:02.316Z | RETRIEVAL | — | — | — | — | 20 | 0 | 0.5896 | — | — |
| 3 | 2026-09-18T15:14:45.610Z | CORPUS | 2026-09-18T16:36:01.171Z | STOPPED | PROVIDER_UNAVAILABLE | 81.3 | 94 | 0 | 5.8943 | — | PROVIDER_UNAVAILABLE@16:36:01 |
| 4 | 2026-09-18T16:47:05.223Z | PROFESSIONALS | 2026-09-18T17:27:38.145Z | STOPPED | PROVIDER_UNAVAILABLE | 40.5 | 49 | 85 | 3.1454 | 17 | PROVIDER_UNAVAILABLE@17:27:38 |
| 5 | 2026-09-18T17:55:18.409Z | TWINS_REVIEWS | 2026-09-18T18:06:59.371Z | STOPPED | PROVIDER_UNAVAILABLE | 11.7 | 15 | 13 | 0.8827 | 17 | PROVIDER_UNAVAILABLE@18:06:59 |
| 6 | 2026-09-18T18:10:27.633Z | TWINS_REVIEWS | 2026-09-18T18:21:35.414Z | STOPPED | PROVIDER_UNAVAILABLE | 11.1 | 14 | 14 | 0.8036 | 18 | PROVIDER_UNAVAILABLE@18:21:35 |
| 7 | 2026-09-19T06:24:41.207Z | TWINS_REVIEWS | 2026-09-19T07:49:22.876Z | STOPPED | PROVIDER_UNAVAILABLE | 84.7 | 58 | 15 | 10.4162 | 18 | PROVIDER_UNAVAILABLE@07:49:22 |

Détail par finalité (appels réels / USD) :

- tentative 1 : preflight 1 (0.0001 USD) ; mission reformulation 1 (0.1626 USD) ; EF-01B resolver 1 (0.0538 USD) ; EF-01C1 planner 1 (0.0728 USD)
- tentative 2 : preflight 1 (0.0001 USD) ; screening 13 (0.3921 USD) ; screening informed-retry 1 (0.0167 USD) ; portfolio review 4 (0.1629 USD) ; portfolio review informed-retry 1 (0.0179 USD)
- tentative 3 : preflight 1 (0.0001 USD) ; probe 1 (0.0003 USD) ; EF-02D2 relevance 92 (5.8937 USD)
- tentative 4 : preflight 1 (0.0001 USD) ; probe 2 (0.0006 USD) ; EF-02D2 relevance 17 (1.1005 USD) ; EF-02D3 coverage 19 (1.4013 USD) ; EF-02D3 coverage informed-retry 10 (0.6432 USD)
- tentative 5 : preflight 1 (0.0001 USD) ; probe 1 (0.0003 USD) ; EF-02D3 coverage 6 (0.4327 USD) ; EF-02D3 coverage informed-retry 7 (0.4496 USD)
- tentative 6 : preflight 1 (0.0001 USD) ; probe 1 (0.0003 USD) ; EF-02D3 coverage 5 (0.3782 USD) ; EF-02D3 coverage informed-retry 7 (0.425 USD)
- tentative 7 : preflight 1 (0.0001 USD) ; probe 1 (0.0003 USD) ; EF-02D3 coverage 4 (0.2825 USD) ; EF-02D3 coverage informed-retry 5 (0.3041 USD) ; EF-03B review 18 (4.7195 USD) ; EF-03B review informed-retry 23 (4.9513 USD) ; downstream 6 (0.1585 USD)

## 4. Échecs HTTP (4, dont 3 × 524, 1 × 504)

| Tentative | Finalité | Passe | Début | Fin | Durée (s) | HTTP | Classé | providerRequestId | Flux commencé | Corps d'erreur | Prompt (car.) | ≈ jetons | twinId / targetId | Usage / coût |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | EF-03B review | 1 | 17:25:33.052 | 17:27:38.121 | 125.1 | 524 | PROVIDER_UNAVAILABLE | null | non | — | 164331 | 41083 | non journalisé / non journalisé | null / 0 USD |
| 5 | EF-03B review | 1 | 18:04:54.207 | 18:06:59.339 | 125.1 | 524 | PROVIDER_UNAVAILABLE | null | non | — | 163873 | 40968 | non journalisé / non journalisé | null / 0 USD |
| 6 | EF-03B review | 1 | 18:19:30.282 | 18:21:35.384 | 125.1 | 524 | PROVIDER_UNAVAILABLE | null | non | — | 163565 | 40891 | non journalisé / non journalisé | null / 0 USD |
| 7 | downstream | — | 07:49:14.617 | 07:49:22.804 | 8.2 | 504 | PROVIDER_UNAVAILABLE | null | non | upstream_timeout | 25321 | 6330 | non journalisé / non journalisé | null / 0 USD |

## 4 bis. Attente des en-têtes (appels SSE réussis : 56) — durée totale − flux, vue client

| Finalité | Appels | min (ms) | p50 (ms) | p90 (ms) | max (ms) |
|---|---|---|---|---|---|
| **tous** | 56 | 1046 | 2032 | 3602 | 7027 |
| EF-02D3 coverage | 4 | 1046 | 1390 | 1854 | 1854 |
| EF-02D3 coverage informed-retry | 5 | 1245 | 1311 | 3443 | 3443 |
| EF-03B review | 18 | 1831 | 2156 | 5647 | 5824 |
| EF-03B review informed-retry | 23 | 1791 | 2141 | 3833 | 7027 |
| downstream | 6 | 1068 | 1103 | 3602 | 3602 |

## 5. Durée des appels réussis (par finalité)

| Finalité | Appels | Moy. (s) | Max (s) | Max jetons d'entrée |
|---|---|---|---|---|
| mission reformulation | 1 | 39 | 39 | 45050 |
| screening | 13 | 14 | 22.6 | 6613 |
| screening informed-retry | 1 | 2.8 | 2.8 | 4993 |
| portfolio review | 4 | 18.2 | 23.5 | 8392 |
| portfolio review informed-retry | 1 | 3.1 | 3.1 | 5266 |
| EF-02D2 relevance | 109 | 51.2 | 74.6 | 6997 |
| EF-02D3 coverage | 34 | 50.8 | 74.7 | 12250 |
| EF-02D3 coverage informed-retry | 29 | 40.3 | 58.1 | 9469 |
| EF-03B review | 18 | 136.4 | 155.8 | 51410 |
| EF-03B review informed-retry | 23 | 93.4 | 156.3 | 49606 |
| downstream | 6 | 11.6 | 23.6 | 8156 |

## 6. Revues logiques

| Attendues | Tentées | Validées | Réutilisées | Recalculées après panne |
|---|---|---|---|---|
| 19 | 21 | 18 | 0 | 20 |

## 7. Où le progrès est perdu

- Reprises à TWINS_REVIEWS : 4 ; revues perdues (échec HTTP) : 3 ; coût des revues en échec : 0 USD (les appels en echec HTTP n'ont ni usage ni cout (aucun cout invente) ; le cout perdu est celui des passes de couverture rejouees a chaque reprise).
- tentative 5 : couverture rejouée — passe 1 : 6, reprises informées : 7, 0.8823 USD (passes de couverture rejouees apres une reprise (passes invalides jamais reutilisables : contrat MONO-11 VALID uniquement))
- tentative 6 : couverture rejouée — passe 1 : 5, reprises informées : 7, 0.8032 USD (passes de couverture rejouees apres une reprise (passes invalides jamais reutilisables : contrat MONO-11 VALID uniquement))
- tentative 7 : couverture rejouée — passe 1 : 4, reprises informées : 5, 0.5866 USD (passes de couverture rejouees apres une reprise (passes invalides jamais reutilisables : contrat MONO-11 VALID uniquement))


## 8. Lecture (analyse, hors outil) — preuves demandées par le mandat v1.0.9

| Preuve | Constat (lecture seule) |
|---|---|
| Ancien 524 éliminé par le SSE | tentative 7 : 56 appels `SSE_STREAM` réussis, 0 × 524 ; revues EF-03B jusqu'à **156,3 s** (flux 154,1 s), soit 25 % au-delà de l'ancienne fenêtre edge (≈ 125 s) |
| Nouvel incident = 504 à 8,187 s | `07:49:14.617 → 07:49:22.804`, `httpStatus 504`, finalité `downstream` (agrégation), prompt 25 321 car. |
| `DEFAULT_TIMEOUT_MS = 8000` | Worker v0.7 `src/worker.js:39` ; corps reçu (`llm-cache/03ddb52e…`) = `{"error":"upstream_timeout"}` (branche `AbortError` du Worker, `worker.js:274-281`) ; 8 000 ms + ≈ 187 ms de transit = 8 187 ms |
| `env.TIMEOUT_MS` absent | `wrangler.jsonc › "vars": {}` ; et `typeof env.TIMEOUT_MS === "number"` (`worker.js:190`) ignorerait une variable Cloudflare (chaîne) |
| Aucun `providerRequestId` | `null` (Anthropic n'a jamais émis `message_start`) |
| Aucun flux commencé | `transport: JSON`, `stream: null`, « Flux commencé : non » |
| Défaut pré-flux / attente des en-têtes | les 56 attentes d'en-têtes réussies vont de 1,05 s à **7,03 s** (p50 2,0 s, p90 3,6 s) ; la 57ᵉ a dépassé 8 s ; aucune corrélation avec la taille du prompt (le 504 frappe le plus petit appel de la tentative) |

**APRÈS (proxy v0.8, projeté hors ligne)** : `HEADER_TIMEOUT_MS = 60 000` (≈ 8,5 × le maximum mesuré, < fenêtre edge ≈ 100 s, < délai client premier octet 180 s) ; les 5 attentes d'en-têtes de test (1 / 7,9 / 8,5 / 20 / 45 s) réussissent ; un dépassement produit un 504 explicite (`phase: upstream_headers`, `headerTimeoutMs`, `upstreamWaitMs`) ; les gardes de flux restent celles du client (90 s d'inactivité, 15 min). Coût du 504 : 0 USD (aucun usage) ; à la reprise, les 18 revues VALID et les 6 appels d'agrégation réussis sont réutilisés à coût 0 (contrat MONO-11), seul le 7ᵉ appel d'agrégation est rejoué. **Rien de ceci n'a été exécuté en réel** : reprise interdite avant audit indépendant, déploiement v0.8 et `doctor` OK.
