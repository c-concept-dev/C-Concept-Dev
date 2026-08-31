# Probes réseau ciblés (Phase 5) — ni REAL G, ni Real Smoke

## OpenAlex — GET réel /works?per_page=1

Tenté depuis cet environnement Claude distant (sandbox cloud, pas la machine de
l'opérateur) :

```text
$ node -e '... buildProviders({})[0] ... checkProvider(openalex) ...'

statusCode = 403
rawClassification = "EGRESS_PROXY_BLOCK"
status = "NETWORK_BLOCKED"
denyReason = "host_not_allowed"
```

`api.openalex.org` n'est pas dans l'allowlist du proxy d'egress de **cet
environnement sandbox** — comportement du proxy de l'environnement d'exécution, sans
rapport avec le code corrigé (`isEgressProxyBlock()` fonctionne comme prévu). Ce
n'est ni un succès ni un échec du correctif : le test réel n'a simplement pas pu être
exécuté depuis ici. Voir `OPENALEX-RESPONSE-LIMIT-FIX.md` §6 pour la preuve du
correctif lui-même (tests OA1/OA2/OA3, LOCAL_CONTROLLED, exercent réellement
`httpRequest()` sans dépendre de cet accès réseau).

**Commande pour l'opérateur** (Mac, réseau réel) :

```bash
node -e '
const { buildProviders, checkProvider } = require("./lib/preflight");
(async () => {
  const openalex = buildProviders({})[0];
  const r = await checkProvider(openalex);
  console.log(JSON.stringify(r, null, 2));
})();
'
```

Attendu après ce correctif : `status: "READY"`, `stages.responseValid: true`, plus de
`INVALID_RESPONSE` par troncature.

## LLM (Worker déployé) — POST réel /v1/messages

**NOT_RUN dans cet environnement** : `EVIDENCEFORGE_WORKER_API_KEY` n'est pas présent
dans l'environnement d'exécution de cette session Claude distante (confirmé —
`env | grep EVIDENCEFORGE_WORKER_API_KEY` ne retourne rien), et ce correctif n'a à
aucun moment demandé ce secret dans le chat, ni tenté de le lire ou de le fabriquer.
Conformément au mandat, cette validation réelle est laissée à l'opérateur — voir la
section « COMMANDES OPÉRATEUR » du rapport final pour la commande exacte
(`node bin/run-preflight.js` avec `LLM_AUTH_MODE=delegated` et l'URL Worker réelle),
qui exerce à la fois OpenAlex et le Worker LLM déployé en une seule exécution réelle,
comme lors du constat initial.

## Confirmations

```text
REAL G     = NOT_RUN
REAL SMOKE = NOT_RUN
```
