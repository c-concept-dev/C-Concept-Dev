# Défaut Bloquant 2 — Modèle LLM de sonde obsolète : source de vérité du défaut retenu

Statut : **BUG PREFLIGHT / CONFIGURATION OBSOLÈTE CONFIRMÉ, CORRIGÉ.**

## 1. Cause

Constaté lors du PREFLIGHT réel post-déploiement (2026-08-31), Worker
`evidenceforge-llm-proxy` réellement atteint et fonctionnel :

```text
POST /v1/messages  (via le Worker déployé)
model: "claude-3-5-haiku-latest"

HTTP 404
x-evidenceforge-upstream: anthropic
x-evidenceforge-upstream-status: 404
body: { type:"error", error:{ type:"not_found_error",
        message:"model: claude-3-5-haiku-latest" } }
```

Worker OK, auth OK, rate limiter OK, Anthropic réellement atteint. La cause est
strictement un identifiant de modèle technique hardcodé devenu indisponible côté
Anthropic — `lib/preflight.js`, `buildLlmWorkerProviderDirect()` (ligne ~179 avant
correction) **et** `buildLlmWorkerProviderDelegated()` (ligne ~226 avant correction)
partageaient le même littéral `"claude-3-5-haiku-latest"`.

## 2. Correction appliquée

Le modèle de sonde est désormais résolu par `resolveLlmPreflightModel(env)` :

```js
function resolveLlmPreflightModel(env) {
  const raw = env.LLM_PREFLIGHT_MODEL;
  if (raw === undefined || raw === null || raw === "") return DEFAULT_LLM_PREFLIGHT_MODEL;
  return raw;
}
```

- `LLM_PREFLIGHT_MODEL` défini → utilisé tel quel, sans validation de forme (l'appelant
  est responsable ; un identifiant invalide reste classifié `INVALID_RESPONSE` par le
  contrat existant sur un 404, jamais transformé en faux `READY` — voir cas LLM3).
- Absent → `DEFAULT_LLM_PREFLIGHT_MODEL`, exporté par `lib/preflight.js` (source
  unique, jamais dupliqué en dur ailleurs).

Appliqué identiquement dans les deux fonctions (`direct` et `delegated`) : le même
défaut existait dans les deux, même si seul le chemin `delegated` a été exercé
réellement lors du constat (le chemin `direct` n'a pas de credential
`ANTHROPIC_API_KEY` disponible dans cet environnement pour le vérifier en réel, mais
le code source est identique — laisser un hardcode obsolète dupliqué à côté de celui
corrigé aurait été incohérent).

## 3. Choix du modèle par défaut — source de vérité

**Je n'ai pas deviné cet identifiant.** Source utilisée, disponible dans cet
environnement Claude au moment de ce correctif (2026-08-31) : le skill de référence
interne `claude-api` (chargé explicitement pour cette tâche), section
« Current Models », qui documente la table des modèles Anthropic actuellement
supportés — **cache daté du 2026-06-24** (~2 mois avant ce correctif).

Table pertinente extraite de cette source :

```text
Claude Fable 5     claude-fable-5      1M     $10.00 / $50.00
Claude Opus 5      claude-opus-5       1M     $5.00  / $25.00
Claude Opus 4.8    claude-opus-4-8     1M     $5.00  / $25.00
Claude Opus 4.7    claude-opus-4-7     1M     $5.00  / $25.00
Claude Opus 4.6    claude-opus-4-6     1M     $5.00  / $25.00
Claude Sonnet 5    claude-sonnet-5     1M     $2.00  / $10.00
Claude Sonnet 4.6  claude-sonnet-4-6   1M     $3.00  / $15.00
Claude Haiku 4.5   claude-haiku-4-5    200K   $1.00  / $5.00
```

Modèle retenu : **`claude-haiku-4-5`** — le plus léger (prix le plus bas, contexte le
plus petit) du catalogue courant documenté par cette source, non signalé déprécié,
adapté à une sonde technique minimale (`max_tokens: 1`, contenu non sensible, réponse
très courte).

## 4. Limite de cette source, assumée explicitement

Le cache documentaire utilisé date du 2026-06-24, soit environ deux mois avant ce
correctif (2026-08-31). Je n'ai trouvé, dans cet environnement Claude distant, aucune
source plus récente que je puisse consulter sans deviner (pas d'accès direct à la
documentation Anthropic en temps réel depuis ce sandbox — voir `NETWORK-PROBES.md`,
l'egress réseau vers des hôtes non listés dans l'allowlist du proxy est bloqué).
C'est la source la plus fiable **disponible dans cet environnement**, ce qui satisfait
l'exigence du mandat (« vérifier ... la documentation ... disponible dans
l'environnement, si possible ») — mais ce n'est pas une garantie absolue de fraîcheur
à la seconde.

**Recommandation explicite à l'opérateur** : avant tout usage REAL prolongé, confirmer
que `claude-haiku-4-5` est toujours un identifiant de modèle valide et non déprécié
(ex. `GET https://api.anthropic.com/v1/models/claude-haiku-4-5` avec un vrai
`ANTHROPIC_API_KEY`, ou tout canal Anthropic à jour). Si ce modèle par défaut devient à
son tour indisponible, il suffit de définir `LLM_PREFLIGHT_MODEL` dans
l'environnement — aucune modification de code n'est nécessaire.

## 5. Pourquoi pas « obligatoire sans défaut » (PRODUCT_CONFIG_ERROR)

Le mandat demandait de rendre `LLM_PREFLIGHT_MODEL` obligatoire **uniquement** si
« aucune source fiable n'est disponible dans l'environnement Claude ». Une source a été
trouvée et documentée ci-dessus (§3) — l'architecture retenue est donc
« configurable + défaut fiable si réellement vérifié », conformément à la préférence
d'architecture explicitement indiquée dans le mandat.

## 6. Tests ajoutés (`test/test_t08_v06_delegated_auth.js`, 24/24 PASS)

- **LLM1** : `LLM_PREFLIGHT_MODEL` défini à une valeur arbitraire de test
  (`claude-test-preflight-model-xyz`) → le corps de requête upstream capturé (via
  `fakeHttpsOnce`) porte exactement cette valeur — preuve que le modèle n'est plus
  hardcodé, indépendamment du modèle par défaut choisi.
- **LLM2** : `LLM_PREFLIGHT_MODEL` absent → le corps de requête capturé porte
  exactement `DEFAULT_LLM_PREFLIGHT_MODEL` (comparé à la constante exportée, jamais à
  un littéral dupliqué dans le test) et jamais l'ancien `claude-3-5-haiku-latest`.
- **LLM3** : réponse 404 `not_found_error` (modèle indisponible, reproduisant le
  constat réel) → `INVALID_RESPONSE`, jamais `READY` — confirme que la classification
  déjà correcte (voir §7) reste inchangée après ce correctif.

## 7. Précision importante : la classification 404 n'était pas le bug

`checkProvider()` classifiait déjà correctement un HTTP 404 en `INVALID_RESPONSE`
(jamais `READY`) avant ce correctif — c'est d'ailleurs ce qui a permis de détecter le
défaut lors du preflight réel plutôt que de le masquer. Le bug était uniquement
l'identifiant de modèle hardcodé qui *provoquait* ce 404, pas la classification de
l'erreur elle-même. Ce correctif ne touche donc à aucune logique de classification
HTTP pour ce cas.

## 8. Fichiers modifiés

- `EvidenceForge/MONO-08/v0.6/lib/preflight.js` (`resolveLlmPreflightModel()`,
  `DEFAULT_LLM_PREFLIGHT_MODEL`, les deux sites d'appel)
- `EvidenceForge/MONO-08/v0.6/.env.example` (`LLM_PREFLIGHT_MODEL` documenté)
- `EvidenceForge/MONO-08/v0.6/test/test_t08_v06_delegated_auth.js` (LLM1/LLM2/LLM3)

## 9. Observation hors périmètre (non corrigée ici, volontairement)

`EvidenceForge/MONO-08/v0.6/lib/real-external-adapter.js` (ligne 49) porte le même
littéral `"claude-3-5-haiku-latest"` pour le chemin **Real Smoke** (distinct du
PREFLIGHT). Ce fichier n'est pas dans le périmètre autorisé de ce micro-lot (qui
porte exclusivement sur le PREFLIGHT) et n'a **pas** été modifié. Signalé ici pour
mémoire, à traiter dans un lot séparé si/quand le Real Smoke est autorisé.
