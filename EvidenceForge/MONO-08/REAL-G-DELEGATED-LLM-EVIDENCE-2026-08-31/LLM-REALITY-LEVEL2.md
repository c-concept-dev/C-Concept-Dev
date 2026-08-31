# Preuve NIVEAU 2 de réalité provider (cas G) — analyse du gap

Statut : **INCOMPLET — corrélation Worker-side non disponible dans cette session.**

## Ce que le CDC exige (§5.3 NIVEAU 2)

La preuve NIVEAU 2 doit combiner cumulativement :

- code Worker audité (✅ disponible — commit `4d3b676`, inchangé, audité r1→r3) ;
- deployment Worker identifié (⚠️ rapporté, non re-interrogé indépendamment — voir
  `WORKER-DEPLOYMENT-IDENTITY.md`) ;
- requête EvidenceForge réelle (⚠️ rapportée — HTTP 200, `request-id
  preflight-2786c9915e24759a`, non observée directement par Claude) ;
- request-id non secret (✅ valeur non sensible, peut être citée) ;
- **trace Worker corrélée à ce request-id (❌ absente de cette session)** ;
- vrai appel upstream Anthropic (⚠️ affirmé par le statut rapporté, non corroboré par
  une trace Worker indépendante) ;
- réponse structurellement valide (⚠️ rapportée : `responseValid=true`, HTTP 200, non
  observée directement).

Le CDC est explicite : **« Les headers seuls ne suffisent pas. »** Ce qui est
disponible ici — un statut HTTP et un request-id rapportés en texte par l'opérateur,
sans trace Worker corrélée que Claude puisse inspecter — est structurellement
équivalent à « des headers/un statut seuls » du point de vue de ce que Claude peut
vérifier depuis cette session. Ce n'est pas suffisant pour NIVEAU 2, quelle que soit la
bonne foi du rapport.

## Recherche effectuée (résultat négatif, honnête)

```text
$ grep -rl "preflight-2786c9915e24759a" .
(aucun résultat dans tout le dépôt)
```

Aucune trace Worker (log Cloudflare, sortie `wrangler tail`, capture de réponse brute)
correspondant à ce request-id n'est présente dans cette session ou ce dépôt. Conforme
au mandat (« Sinon, ne fabrique rien »), Claude ne construit aucune corrélation
artificielle.

## Ce qui manque exactement, et comment l'obtenir (commandes opérateur)

Deux artefacts, capturés **simultanément**, permettraient de clore NIVEAU 2 avec une
preuve réelle et vérifiable :

**Terminal opérateur 1 — capture de la trace Worker en direct :**

```bash
cd "<CHEMIN DE TON CLONE LOCAL>/EvidenceForge/MONO-08/v0.6/worker/evidenceforge-llm-proxy"
npx wrangler tail evidenceforge-llm-proxy > wrangler-tail-real-g.log
```

(laisser tourner pendant la sonde ci-dessous, puis Ctrl+C et conserver
`wrangler-tail-real-g.log`)

**Terminal opérateur 2 — une seule sonde technique réelle minimale, request-id explicite :**

```bash
cd "<CHEMIN DE TON CLONE LOCAL>/EvidenceForge/MONO-08/v0.6"
export LLM_AUTH_MODE=delegated
export LLM_WORKER_BASE_URL=https://evidenceforge-llm-proxy.11drumboy11.workers.dev
# EVIDENCEFORGE_WORKER_API_KEY deja present dans ton environnement

node -e '
const crypto = require("crypto");
const { buildProviders, checkProvider } = require("./lib/preflight");
const requestId = "real-g-" + crypto.randomBytes(8).toString("hex");
console.log("REQUEST_ID=" + requestId);
const delegated = buildProviders({
  LLM_AUTH_MODE: "delegated",
  LLM_WORKER_BASE_URL: process.env.LLM_WORKER_BASE_URL,
  EVIDENCEFORGE_WORKER_API_KEY: process.env.EVIDENCEFORGE_WORKER_API_KEY,
  LLM_PREFLIGHT_MODEL: "claude-haiku-4-5",
})[3];
checkProvider(delegated).then(r => {
  console.log(JSON.stringify({
    requestId: r.probe.requestId,
    statusCode: r.probe.statusCode,
    status: r.status,
    latencyMs: r.probe.latencyMs,
    stages: r.stages,
  }, null, 2));
});
' > real-g-probe-result.json

cat real-g-probe-result.json
echo "EXIT_CODE=$?"
```

Payload envoyé par ce code (déjà conforme au mandat, sans modification) :
`max_tokens: 1`, message technique minimal `"hi"`, modèle `claude-haiku-4-5` — aucune
donnée utilisateur.

**Livrable attendu en retour** (deux fichiers, sans aucun secret) :
`wrangler-tail-real-g.log` et `real-g-probe-result.json`. Une fois ces deux fichiers
fournis, Claude pourra confirmer la corrélation request-id ↔ trace Worker ↔ upstream
Anthropic réel sans avoir à rien fabriquer, et clore NIVEAU 2.

## Verdict NIVEAU 2 (ce lot)

```text
LEVEL 2 CORRELATED EVIDENCE = NOT AVAILABLE IN THIS SESSION
```

Conformément à la RÈGLE ABSOLUE du mandat (« Si la preuve NIVEAU 2 ne peut pas être
obtenue : REAL G NOT COMPLETE et STOP »), ce point à lui seul détermine le verdict
global — voir `REAL-G-REPORT.md`.
