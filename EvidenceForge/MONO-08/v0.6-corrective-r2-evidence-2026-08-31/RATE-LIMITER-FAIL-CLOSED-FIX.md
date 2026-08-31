# Défaut Bloquant 1 — Rate limiter fail-open → correction fail-closed

Statut : **BUG WORKER / VIOLATION CONTRACTUELLE DE SÉCURITÉ CONFIRMÉ, CORRIGÉ.**

## 1. Cause

Package audité : `EvidenceForge-MONO-08-v0.6-implementation-package-r1.zip`
(`b6a8355951d301e27f7ed39e9a06f4db3db4545ac0cb136cdcca3ca2cae45119`), commit `212c8c3`.

`worker/evidenceforge-llm-proxy/src/worker.js::checkRateLimit()` retournait un état
« non limité » lorsque le binding `env.RATE_LIMITER` était absent ou que
`env.RATE_LIMITER.limit` n'était pas une fonction — la requête continuait alors
normalement vers `handleRequest()` et pouvait atteindre l'upstream Anthropic sans
aucune limite de débit appliquée.

## 2. Preuve (code avant correction, extrait de git HEAD au moment de l'audit)

```js
async function checkRateLimit(env, workerKey) {
  if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== "function") {
    // Aucun binding de rate limiting configuré : ne bloque jamais une
    // requête faute de binding (ce serait un déni de service involontaire
    // en environnement de test), mais ce n'est PAS un état de production
    // valide — voir README.md "Déploiement" : le binding est obligatoire
    // avant tout déploiement réel (CDC section 7.11, non optionnel).
    return { limited: false, skippedNoBinding: true };
  }
  const key = "worker-key:" + (await sha256Hex(workerKey || "anonymous"));
  const result = await env.RATE_LIMITER.limit({ key: key });
  return { limited: !result || result.success !== true, skippedNoBinding: false };
}
```

Point d'appel (`handleRequest()`, avant correction) :

```js
const rl = await checkRateLimit(env, token);
if (rl.limited) {
  // ... 429
}
// binding absent => rl.limited === false => on continue vers l'upstream
```

Extraction reproductible : `git show 212c8c3:EvidenceForge/MONO-08/v0.6/worker/evidenceforge-llm-proxy/src/worker.js`.

## 3. Conséquence

Un déploiement Cloudflare réel dont le binding `RATE_LIMITER` serait absent, mal
nommé, ou mal configuré dans `wrangler.jsonc` laisserait passer un volume de
requêtes **illimité** vers `https://api.anthropic.com/v1/messages`, en violation du
contrat CDC section 7.11 (« rate limiting obligatoire, jamais de relais Anthropic
illimité »). C'est un défaut de sécurité, pas seulement fonctionnel : un attaquant ou
un bug de configuration côté déploiement aurait pu transformer ce Worker en proxy
Anthropic sans aucune limite.

## 4. Correction appliquée

`checkRateLimit()` est réécrite pour être **fail-closed** : toute situation où le
comportement réel du limiteur ne peut pas être établi avec certitude renvoie un état
`UNAVAILABLE` qui bloque la requête **avant tout appel upstream**, avec un code HTTP
`503` distinct du `429` (jamais interchangeables).

```js
async function checkRateLimit(env, workerKey) {
  if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== "function") {
    return { status: "UNAVAILABLE", reason: "RATE_LIMITER_UNAVAILABLE" };
  }
  const key = "worker-key:" + (await sha256Hex(workerKey || "anonymous"));
  let result;
  try {
    result = await env.RATE_LIMITER.limit({ key: key });
  } catch (e) {
    return { status: "UNAVAILABLE", reason: "RATE_LIMITER_RUNTIME_ERROR" };
  }
  if (!result || typeof result.success !== "boolean") {
    return { status: "UNAVAILABLE", reason: "RATE_LIMITER_UNAVAILABLE" };
  }
  return result.success ? { status: "OK" } : { status: "LIMITED", reason: "RATE_LIMITED" };
}
```

Point d'appel (`handleRequest()`, après correction) :

```js
const rl = await checkRateLimit(env, token);
if (rl.status === "UNAVAILABLE") {
  // 503, reason: RATE_LIMITER_UNAVAILABLE | RATE_LIMITER_RUNTIME_ERROR, jamais d'appel upstream
}
if (rl.status === "LIMITED") {
  // 429, reason: RATE_LIMITED — comportement du cas K inchangé
}
// rl.status === "OK" => on continue
```

## 5. Distinction stricte des trois issues

| Situation | HTTP | `reason` | Upstream appelé ? |
|---|---|---|---|
| Binding valide, quota disponible | (continue) | — | selon la suite du contrat |
| Binding valide, quota réellement dépassé (cas K) | `429` | `RATE_LIMITED` | jamais |
| Binding absent (cas L) | `503` | `RATE_LIMITER_UNAVAILABLE` | jamais |
| Binding présent, `.limit` non fonctionnel (cas M) | `503` | `RATE_LIMITER_UNAVAILABLE` | jamais |
| `.limit()` renvoie une forme inattendue (cas M2) | `503` | `RATE_LIMITER_UNAVAILABLE` | jamais |
| `.limit()` lève une exception (cas N) | `503` | `RATE_LIMITER_RUNTIME_ERROR` | jamais |

`429` et `503` ne sont jamais convertis l'un dans l'autre. La sémantique du cas K
existant n'a pas été modifiée : un binding **valide** qui refuse réellement la requête
(`result.success === false`) reste `429`/`RATE_LIMITED`, jamais `503`. Voir le test
`Worker-K-vs-L` (`test/worker.test.js`) qui prouve explicitement cette distinction sur
le même binding valide selon qu'il autorise ou refuse.

## 6. Tests ajoutés (voir `worker-test-r2.out` pour l'exécution complète, 38/38 PASS)

- **Worker-L** / Worker-L-upstream / Worker-L-reason : binding absent → 503, aucun
  appel upstream, `reason === "RATE_LIMITER_UNAVAILABLE"`.
- **Worker-M** / Worker-M-upstream / Worker-M-reason : `RATE_LIMITER.limit` n'est pas
  une fonction → 503, aucun appel upstream, `reason === "RATE_LIMITER_UNAVAILABLE"`.
- **Worker-M2** : `.limit()` résout vers un objet sans `success` booléen → 503.
- **Worker-N** / Worker-N-upstream / Worker-N-reason : `.limit()` lève une exception →
  503, aucun appel upstream, `reason === "RATE_LIMITER_RUNTIME_ERROR"`.
- **Worker-K-vs-L** : binding valide qui bloque réellement (`alwaysBlockRateLimiter()`)
  → 429, jamais 503 — confirme que K et L/M/N restent des chemins distincts.
- L'ancien test « Worker-24 », qui affirmait le comportement fail-open comme correct,
  a été supprimé (il testait la sémantique inverse de celle désormais requise).

## 7. Fichiers modifiés (périmètre autorisé uniquement)

- `worker/evidenceforge-llm-proxy/src/worker.js`
- `worker/evidenceforge-llm-proxy/test/worker.test.js`
- `worker/evidenceforge-llm-proxy/README.md`

Aucune modification de `lib/preflight.js` ni `lib/real-provider-configs.js` n'a été
nécessaire pour cette correction : le défaut est entièrement interne au Worker.

## 8. Ce qui n'a pas changé

- Aucun déploiement Cloudflare réel.
- Aucun secret réel créé ou injecté.
- Aucune modification de `wrangler.jsonc` (le seuil `RATE_LIMITER` reste celui
  introduit en r1, non lié à ce correctif).
- Le cas G (REAL) n'a pas été exécuté.
