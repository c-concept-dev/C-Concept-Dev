# evidenceforge-llm-proxy

Worker Cloudflare **dédié** pour le mode `delegated` de MONO-08 v0.6
(`LLM_AUTH_MODE=delegated`). Relais minimal entre EvidenceForge et l'API
réelle Anthropic — voir
`EvidenceForge/MONO-08/MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md` section 7 pour
le contrat normatif complet.

## Statut de déploiement

**Ce Worker n'est PAS déployé sur Cloudflare par ce lot.** Seuls le code,
les tests `LOCAL_CONTROLLED` et la configuration `wrangler.jsonc` sont
livrés ici, conformément à l'autorisation d'implémentation reçue : le vrai
cas REAL (déploiement + preuve NIVEAU 2 corrélée) reste soumis à un audit
indépendant et une autorisation distincte (CDC section 5.3, 11.3 ; voir
`MONO-08-v0.6-ACCEPTANCE-MATRIX.md` cas G).

## Rôle

```text
EvidenceForge (mode delegated)
  → Authorization: Bearer <EVIDENCEFORGE_WORKER_API_KEY>
  → evidenceforge-llm-proxy (ce Worker)
      → ANTHROPIC_API_KEY injectée ici, côté Cloudflare uniquement
  → https://api.anthropic.com/v1/messages
```

`ANTHROPIC_API_KEY` n'est **jamais** connue du runtime EvidenceForge en mode
`delegated`, et n'est **jamais** transmise au client par ce Worker.

## Pourquoi `Authorization: Bearer`, pas `X-API-Key`

Le CDC (section 4.3.2, 7.3) envisageait initialement un header
`X-API-Key` dédié pour le credential Worker, tout en autorisant
explicitement un nom de header différent « si cela s'avère réellement
nécessaire à l'implémentation, à condition que MONO-04 ne soit pas
modifié ».

En Phase 1 d'implémentation (inspection en lecture seule de
`MONO-04/lib/external-execution-gateway.js`), il a été établi que le
Gateway MONO-04 (**inchangé**) construit **toujours** le header sortant
`Authorization: Bearer <secretValue>` à partir de
`providerConfig.requiredSecret` — quel que soit le nom du secret — et
n'utilise jamais `providerConfig.headers` pour construire l'en-tête
d'authentification. C'est déjà le comportement réel du mode `direct`
existant pour le vrai run via MONO-04 (indépendant du header `x-api-key`
envoyé par le *preflight*, qui est un client HTTP séparé, propre à
`lib/preflight.js`, n'utilisant jamais le Gateway).

Pour que le résultat du preflight `delegated` prédise fidèlement le
comportement du vrai run passant par MONO-04, ce Worker et le probe de
preflight `delegated` (`lib/preflight.js::buildLlmWorkerProviderDelegated`)
utilisent donc tous deux `Authorization: Bearer
<EVIDENCEFORGE_WORKER_API_KEY>` — sans aucune modification de MONO-04. Voir
`CDC-TRACE.md` pour la trace complète de cette découverte de contrat
(section « Phase 1 — inspection »).

## Route

```text
POST /v1/messages
```

Toute autre méthode ou route → `404`.

## Contrat (résumé — voir CDC section 7 pour le détail normatif)

1. Refuse toute méthode/route hors contrat → `404`.
2. Vérifie `Authorization: Bearer <token>` contre le secret `WORKER_API_KEY`
   (comparaison en temps constant) **avant** tout appel upstream. Absent ou
   invalide → `401`.
3. Applique le rate limiting (`RATE_LIMITER` binding) **avant** tout appel
   upstream, **fail-closed** (correctif d'audit — voir § « Rate limiting
   fail-closed » ci-dessous) :
   - binding valide + quota disponible → poursuit ;
   - binding valide + quota réellement dépassé → `429`, jamais converti en
     succès (`reason: "RATE_LIMITED"`) ;
   - binding absent, mal formé, résultat de forme inattendue, ou `.limit()`
     qui lève une exception → `503`, **aucun appel upstream**, jamais un
     passage silencieux (`reason: "RATE_LIMITER_UNAVAILABLE"` ou
     `"RATE_LIMITER_RUNTIME_ERROR"`).
4. Valide strictement le payload JSON entrant (`model`, `max_tokens`,
   `messages`) **avant** tout appel upstream. Invalide → `400`.
5. N'accepte jamais `ANTHROPIC_API_KEY` depuis le client — l'injecte
   uniquement depuis le secret Cloudflare `ANTHROPIC_API_KEY`.
6. Appelle réellement `https://api.anthropic.com/v1/messages`.
7. Relaie fidèlement le statut + le corps upstream — jamais un `401`,
   `403`, `429`, `5xx` ou un timeout upstream converti en faux `200`.
8. Timeout upstream → `504`. Panne réseau upstream (hors timeout) → `502`.
9. Secret Cloudflare mal configuré (`ANTHROPIC_API_KEY` absente côté
   Worker) → `500`, jamais un faux succès.
10. Logs minimaux uniquement : timestamp, request-id, statut, latence,
    taille de payload — jamais un secret, jamais le corps complet d'un
    prompt.
11. Headers de corrélation non sensibles sur chaque réponse :
    `X-EvidenceForge-Proxy`, `X-EvidenceForge-Upstream`,
    `X-EvidenceForge-Upstream-Status`, `X-EvidenceForge-Request-Id`
    (propagé si fourni par le client, sinon généré). Ces headers seuls ne
    constituent jamais une preuve REAL suffisante (CDC section 5.3).
12. Pas de CORS `*` par défaut — aucun header CORS n'est positionné par ce
    Worker à ce stade ; à configurer explicitement si un jour nécessaire,
    hors périmètre v0.6.
13. Aucune dépendance à un autre Worker applicatif existant.

## Rate limiting fail-closed (correctif d'audit)

Une version antérieure de `checkRateLimit()` retournait `{limited: false}`
lorsque `env.RATE_LIMITER` était absent ou mal formé — la requête
continuait alors normalement vers l'upstream Anthropic. Un audit
indépendant a signalé ceci comme une violation contractuelle de sécurité
(CDC section 7.11 : rate limiting obligatoire, jamais de relais Anthropic
illimité) : un déploiement dont le binding `RATE_LIMITER` serait absent ou
mal configuré aurait laissé passer un volume de requêtes illimité vers
Anthropic.

**Corrigé : le rate limiting est maintenant fail-closed.** Trois issues
distinctes, jamais mélangées :

| Situation | HTTP | `reason` | Upstream appelé ? |
|---|---|---|---|
| Binding valide, quota disponible | (continue) | — | selon la suite du contrat |
| Binding valide, quota réellement dépassé | `429` | `RATE_LIMITED` | jamais |
| Binding absent (cas L) | `503` | `RATE_LIMITER_UNAVAILABLE` | jamais |
| Binding présent, `.limit` non fonctionnel (cas M) | `503` | `RATE_LIMITER_UNAVAILABLE` | jamais |
| `.limit()` renvoie une forme inattendue | `503` | `RATE_LIMITER_UNAVAILABLE` | jamais |
| `.limit()` lève une exception (cas N) | `503` | `RATE_LIMITER_RUNTIME_ERROR` | jamais |

`429` et `503` ne sont **jamais interchangeables** : `429` signifie que le
limiteur fonctionne réellement et que le seuil a été dépassé ; `503`
signifie que le limiteur lui-même est indisponible ou en panne — dans les
deux cas, `checkRateLimit()` s'exécute et retourne avant toute
construction du payload upstream ou tout appel `fetchImpl` (voir
`src/worker.js::handleRequest()`, étape 3, toujours avant l'étape 6).

## Tests

```bash
npm test
# ou directement :
node test/worker.test.js
```

38 assertions `LOCAL_CONTROLLED` (aucun réseau réel, aucun déploiement
Cloudflare) : routes/méthodes refusées, credential absent/invalide, rate
limit (dépassement réel **et** fail-closed sur binding absent/invalide/en
erreur — cas K, L, M, N), payload invalide, relais de succès et d'erreurs
upstream (y compris 529/timeout/panne réseau), non-exposition des deux
secrets dans le corps ou les headers de réponse, fonctions utilitaires.
Voir le fichier pour le détail de chaque cas et sa correspondance avec
`MONO-08-v0.6-ACCEPTANCE-MATRIX.md` (cas D, K, L, M, N notamment).

Aucun de ces tests ne constitue une preuve REAL (cas G) — voir la section
« Statut de déploiement » ci-dessus.

## Déploiement réel (non effectué par ce lot — pour référence future)

1. `wrangler secret put WORKER_API_KEY`
2. `wrangler secret put ANTHROPIC_API_KEY`
3. Ajuster le seuil de `RATE_LIMITER` dans `wrangler.jsonc` selon le volume
   réel attendu (valeur de démarrage prudente fournie, non validée en
   production).
4. `wrangler deploy`
5. Faire auditer indépendamment le code déployé et le contrat avant toute
   utilisation comme preuve REAL (CDC section 11.8).

Aucune de ces étapes n'a été exécutée par ce lot d'implémentation.
