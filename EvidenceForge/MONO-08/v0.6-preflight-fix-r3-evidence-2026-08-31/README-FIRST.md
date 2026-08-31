# MONO-08 v0.6 — Micro-lot correctif PRE-REAL (r3)

Date : 2026-08-31. Correctif appliqué sur commit `6f590e4`, suite au PREFLIGHT réel
post-déploiement du Worker `evidenceforge-llm-proxy`
(`https://evidenceforge-llm-proxy.11drumboy11.workers.dev`,
version `ce2b8c80-4084-490e-8faa-585881d8e175`, non modifié par ce micro-lot).

Statut : **PRE-REAL PREFLIGHT FIX READY FOR INDEPENDENT AUDIT**.

## Ordre de lecture

1. `OPENALEX-RESPONSE-LIMIT-FIX.md` — Défaut Bloquant 1 : troncature destructive à
   4000 caractères avant `JSON.parse()`, remplacée par une limite en octets
   (1 MiB) avec abandon propre et classification dédiée `RESPONSE_TOO_LARGE`.
2. `LLM-PREFLIGHT-MODEL-SOURCE.md` — Défaut Bloquant 2 : modèle Anthropic hardcodé
   obsolète, remplacé par `LLM_PREFLIGHT_MODEL` configurable + défaut documenté
   (`claude-haiku-4-5`), source de vérité tracée en détail.
3. `NETWORK-PROBES.md` — probes réseau réels tentés depuis cet environnement,
   résultats et limites (proxy sandbox, absence de credential réel).
4. `v06-delegated-auth-test-after-fix.out` — 24/24 PASS (incluant OA1-3, LLM1-3).
5. `test_t08_preflight-after-fix.out` — 10/10 PASS (v0.5, non modifié, non
   régressé).
6. `openalex-real-probe-blocked-sandbox.json` — trace brute du probe réseau
   OpenAlex tenté depuis cet environnement (bloqué par le proxy sandbox, pas un
   défaut du correctif).

## Ce qui a été corrigé

- `EvidenceForge/MONO-08/v0.6/lib/preflight.js` :
  - `httpRequest()` : collecte HTTP bornée en octets (`MAX_PREFLIGHT_RESPONSE_BYTES`
    = 1 MiB), abandon propre au-delà, jamais de `JSON.parse()` sur corps tronqué.
  - `checkProvider()` : nouvelle classification `RESPONSE_TOO_LARGE`
    (`INVALID_RESPONSE`, jamais `READY`).
  - `resolveLlmPreflightModel(env)` + `DEFAULT_LLM_PREFLIGHT_MODEL` (exporté) :
    modèle de sonde LLM configurable via `LLM_PREFLIGHT_MODEL`, remplace le
    hardcode `"claude-3-5-haiku-latest"` dans les deux providers (`direct` et
    `delegated`).
- `EvidenceForge/MONO-08/v0.6/.env.example` : `LLM_PREFLIGHT_MODEL` documenté.
- `EvidenceForge/MONO-08/v0.6/test/test_t08_v06_delegated_auth.js` : + OA1/OA2/OA3,
  LLM1/LLM2/LLM3, helper `fakeHttpsOnce` (24 assertions au total, était 16).

## Ce qui n'a PAS été fait (volontairement)

- Aucune modification de `worker/evidenceforge-llm-proxy/**`.
- Aucun redéploiement Cloudflare, aucun secret modifié (`WORKER_API_KEY`,
  `ANTHROPIC_API_KEY`, `RATE_LIMITER` inchangés).
- Aucun cas G (REAL), aucun Real Smoke complet.
- Aucune modification de MONO-00→07, MONO-04, EF-ORCH, MONO-08 v0.5.
- Aucune modification de `lib/real-provider-configs.js` (non nécessaire).
- MONO-09/JMMJS non entamé.
- `lib/real-external-adapter.js` (même hardcode obsolète, chemin Real Smoke) laissé
  inchangé — hors périmètre de ce micro-lot, signalé pour mémoire dans
  `LLM-PREFLIGHT-MODEL-SOURCE.md` §9.

## Verdict

```text
PRE-REAL PREFLIGHT FIX READY FOR INDEPENDENT AUDIT
```
