# Défaut/Risque 2 — Entrypoint Worker Cloudflare non prouvé

## Diagnostic (Phase 1)

**Ancien modèle** : `worker/evidenceforge-llm-proxy/src/worker.js` (commit
4952ce4) se terminait par :

```js
module.exports = {
  handleRequest: handleRequest,
  ...
  fetch: handleRequest,
};
```

Format CommonJS pur. Aucun mot-clé `export` natif dans le fichier.

**Vérification réelle (non déployante)** : `npx wrangler deploy --dry-run`
depuis `worker/evidenceforge-llm-proxy/` (Wrangler 4.127.1, installé
localement via npx, aucun compte Cloudflare, aucun secret) :

```text
✘ [ERROR] Build failed with 1 error:
  ✘ [ERROR] Unexpected external import of "node:events", "node:perf_hooks", "node:stream", and "node:tty".
  Your worker has no default export, which means it is assumed to be a Service Worker format Worker.
  Did you mean to create a ES Module format Worker?
  If so, try adding `export default { ... }` in your entry-point.
```

Transcription complète : `wrangler-dry-run-before-fix.txt`.

**Diagnostic** : `BUG DEPLOYABILITY` confirmé — pas une hypothèse, un
échec de build réel et reproductible. `module.exports` seul n'est jamais
reconnu par Wrangler comme un point d'entrée « ES Module Worker » valide ;
sans `export default`, Wrangler retombe sur le format historique « Service
Worker » (obsolète, incompatible avec `compatibility_flags:
["nodejs_compat"]` tel que configuré).

## Correction minimale appliquée

1. `src/worker.js` : ajout d'un `export default { fetch(request, env,
   ctx) { return handleRequest(request, env, ctx); } }` — point d'entrée
   Worker réel. Les fonctions utilitaires (`handleRequest`,
   `isValidMessagesPayload`, `extractBearerToken`, `constantTimeEquals`,
   `ROUTE_PATH`) restent exportées individuellement (`export { ... }`, au
   lieu de `module.exports`) pour rester testables isolément.
2. `worker/evidenceforge-llm-proxy/package.json` : ajout de `"type":
   "module"` — nécessaire pour que Node (tests) ET Wrangler traitent ce
   fichier comme un vrai module ES, pas une ambiguïté CommonJS/ESM.
3. `test/worker.test.js` : `const {...} = require("../src/worker.js")`
   remplacé par `import {...} from "../src/worker.js"`. Aucune autre
   ligne de logique de test modifiée.

**Aucune logique métier touchée** : auth Worker, validation payload, rate
limit, appel upstream Anthropic, logs, corrélation, gestion d'erreurs —
tous identiques ligne pour ligne à la version auditée, seul le mécanisme
d'export a changé.

## Preuve après correction

```text
$ npx wrangler deploy --dry-run

 ⛅️ wrangler 4.127.1
────────────────────
Total Upload: 30.98 KiB / gzip: 7.74 KiB
Your Worker has access to the following bindings:
Binding                                 Resource
env.RATE_LIMITER (30 requests/60s)      Rate Limit

--dry-run: exiting now.
```

Transcription complète : `wrangler-dry-run-after-fix.txt`. **Build réussi,
0 erreur, aucun avertissement `unsafe` restant** (voir aussi
`RATE-LIMIT-MIGRATION.md`).

```text
$ node test/worker.test.js
TOUS LES TESTS PASSENT (28)
```

Transcription complète : `worker-test-after-fix.out`.

## Verdict

**B. WORKER ENTRYPOINT : était `BUG DEPLOYABILITY`, maintenant
`COMPATIBLE`** — démontré par l'outil officiel Wrangler lui-même, en mode
`--dry-run` (aucun déploiement, aucun secret, aucun appel Anthropic, aucun
Worker créé côté Cloudflare, aucun changement de compte Cloudflare).
