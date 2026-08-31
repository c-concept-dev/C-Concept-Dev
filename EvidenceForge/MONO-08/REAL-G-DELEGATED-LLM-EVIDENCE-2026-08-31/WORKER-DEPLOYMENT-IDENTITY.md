# Identité du Worker déployé — rapportée, non re-interrogeable depuis cette session

```text
name       = evidenceforge-llm-proxy
URL        = https://evidenceforge-llm-proxy.11drumboy11.workers.dev
Version ID = ce2b8c80-4084-490e-8faa-585881d8e175
```

## Limite explicite

Cet environnement Claude distant n'est pas authentifié auprès de Cloudflare :

```text
$ npx wrangler whoami
You are not authenticated. Please run `wrangler login`.
```

(reconfirmé à l'instant, aucun changement depuis les lots précédents). Claude ne peut
donc **pas** interroger lui-même `wrangler deployments list` ou l'API Cloudflare pour
re-confirmer indépendamment que cette version ID est toujours la version réellement
active. Cette identité est **rapportée par l'opérateur**, pas re-vérifiée ici.

## Ce qui EST vérifié indépendamment par Claude

- Le code source du Worker déployé (`worker/evidenceforge-llm-proxy/src/worker.js`),
  tel qu'il existe dans ce dépôt au commit `4d3b676`, est inchangé depuis l'audit
  positif du package r2/r3 (fail-closed rate limiter, séparation stricte
  `WORKER_API_KEY`/`ANTHROPIC_API_KEY`, contrat §7 du CDC) — confirmé par
  `git status --short -- EvidenceForge/MONO-08/v0.6/worker/` = vide.
- `npx wrangler deploy --dry-run` (dernière exécution, correctif r3) confirmait un
  Worker ES Module valide avec binding `RATE_LIMITER` reconnu — preuve de
  déployabilité, pas une preuve de l'état réellement actif sur Cloudflare à cet
  instant précis.

## Ce qui reste à la charge de l'opérateur pour clore ce point

Si une confirmation indépendante de la version active est requise pour l'audit,
l'opérateur peut fournir, depuis sa machine authentifiée :

```bash
npx wrangler deployments list --name evidenceforge-llm-proxy
```

et comparer l'ID actif à `ce2b8c80-4084-490e-8faa-585881d8e175`. Si l'ID diffère,
conformément à la Phase 6 du mandat : **STOP et audit de version requis** — ne pas
supposer que le code est identique.
