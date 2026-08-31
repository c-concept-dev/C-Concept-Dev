# MONO-08 v0.6 — micro-lot REAL ADAPTER MODEL FIX (r4)

Date : 2026-08-31. Correctif appliqué sur commit `43ccc9c`, à la suite de REAL G
(mode LLM delegated, statut rapporté PASS).

Statut : **REAL ADAPTER MODEL FIX = GELABLE TECHNIQUEMENT — READY FOR INDEPENDENT
AUDIT.**

## Objectif

Corriger le modèle Anthropic obsolète `claude-3-5-haiku-latest` (HTTP 404 réel
confirmé) utilisé par le chemin **REAL SMOKE** (`lib/real-external-adapter.js`) —
même cause racine que le bug déjà corrigé côté PREFLIGHT (correctif r3), jamais
exécuté ici via un run REAL Smoke complet.

## Ordre de lecture

1. `REAL-ADAPTER-MODEL-AUDIT.md` — Phase 1/2 : audit exhaustif de
   `claude-3-5-haiku-latest`, classification de chaque occurrence, vérification que
   le CDC ne fige aucun identifiant de modèle.
2. `test-run-real-adapter-model.out` — 9/9 PASS (`test_t08_v06_real_adapter_model.js`).
3. `non-regression-summary.md` — tests v0.6/preflight/Worker + gate historique 4/4.

## Ce qui a été corrigé

- `EvidenceForge/MONO-08/v0.6/lib/real-external-adapter.js` : modèle hardcodé
  remplacé par `resolveRealLlmModel()` / `DEFAULT_REAL_LLM_MODEL` (= `claude-haiku-4-5`),
  configurable via `LLM_REAL_MODEL` (variable dédiée, distincte de
  `LLM_PREFLIGHT_MODEL` — deux chemins d'exécution différents).
- `EvidenceForge/MONO-08/v0.6/.env.example` : `LLM_REAL_MODEL` documenté.
- `EvidenceForge/MONO-08/v0.6/test/test_t08_v06_real_adapter_model.js` (nouveau) :
  REAL-MODEL-1→5 + tests fail-closed A→E du mandat.
- `EvidenceForge/MONO-08/v0.6/scripts/package-and-verify.sh` : nouveau test intégré
  au gate (étapes 2/9 et 4/9), aucun `|| true`.

## Ce qui n'a PAS été fait (volontairement)

- Aucune exécution de `bin/run-real-smoke.js`, aucun Real Smoke complet.
- Aucune modification du Worker Cloudflare, aucun redéploiement, aucun secret touché.
- Aucune modification de MONO-00→07, MONO-04, EF-ORCH, MONO-08 v0.5.
- Aucune modification de la mission réelle.
- MONO-09/JMMJS non entamé.
- `worker/evidenceforge-llm-proxy/test/worker.test.js` (occurrence `VALID_PAYLOAD`)
  non modifié — hors périmètre (fichier Worker), et non lié au bug (payload de
  validation de forme uniquement).

## Verdict

```text
REAL ADAPTER MODEL FIX = GELABLE TECHNIQUEMENT
READY FOR INDEPENDENT AUDIT
```

(Ne constitue pas et ne prétend pas constituer un verdict `MONO-08 GELABLE` ou
`MONO-08 GELÉ`.)
