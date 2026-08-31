# MONO-08 v0.6 — Correctif d'audit ciblé (r1)

Date : 2026-08-31. Correctif appliqué sur commit audité `4952ce4`, package
audité `EvidenceForge-MONO-08-v0.6-implementation-package.zip`
(`a1895f58ed7e07a3ab3f246bb3a9ef81895c195aafab0b6ca1266bf1aad845ee`).

Statut de ce correctif : **`CORRECTIVE IMPLEMENTATION READY FOR
INDEPENDENT RE-AUDIT`**.

## Ordre de lecture

1. `MANIFEST-MISMATCH-INVESTIGATION.md` — Défaut Bloquant 1 : le mismatch
   allégué **ne se reproduit pas** (preuve indépendante à 3 méthodes
   convergentes + vérification complète des 49 entrées). Pipeline de
   packaging déterministe introduit malgré tout, en prévention.
2. `WORKER-ENTRYPOINT-FIX.md` — Défaut/Risque 2 : bug réel confirmé
   (`wrangler deploy --dry-run` échouait), corrigé (ES Module natif),
   revalidé avec preuve.
3. `RATE-LIMIT-MIGRATION.md` — Défaut/Risque 3 : migration réussie de la
   config `unsafe.bindings` vers le champ stable `ratelimits`, prouvée
   par le schéma Wrangler local et par `--dry-run`.
4. `wrangler-dry-run-before-fix.txt` / `wrangler-dry-run-after-fix.txt` —
   preuves brutes avant/après.
5. `worker-test-after-fix.out` — 28/28 PASS après migration ESM.
6. `frozen-before-corrective-r1.sha256` / `frozen-after-corrective-r1.sha256`
   — intégrité gelée, bit-identique.

## Ce qui a été corrigé

- `worker/evidenceforge-llm-proxy/src/worker.js` : `module.exports` →
  `export default { fetch }` + `export { ... }` nommés.
- `worker/evidenceforge-llm-proxy/package.json` : `"type": "module"`
  ajouté ; script `validate` (`wrangler deploy --dry-run`) ajouté.
- `worker/evidenceforge-llm-proxy/test/worker.test.js` : `require` →
  `import`. Aucune assertion modifiée.
- `worker/evidenceforge-llm-proxy/wrangler.jsonc` : `unsafe.bindings[].type:
  "ratelimit"` → `ratelimits[]` (syntaxe stable).
- `EvidenceForge/MONO-08/v0.6/scripts/package-and-verify.sh` (nouveau) :
  pipeline de packaging déterministe (manifest généré en dernier, vérifié
  immédiatement, puis re-vérifié depuis le ZIP final).

## Ce qui n'a PAS été fait (volontairement)

- Aucun déploiement Cloudflare réel.
- Aucun secret réel créé ou injecté.
- Aucun Worker créé côté Cloudflare, aucun changement de compte
  Cloudflare.
- Aucun cas G (REAL), aucun Real Smoke.
- Aucune modification de MONO-00→07, MONO-08 v0.5, MONO-04, EF-ORCH.
- MONO-09/JMMJS non entamé.
- Aucun changement du CDC ni de l'Acceptance Matrix.

## Verdict

```text
CORRECTIVE IMPLEMENTATION READY FOR INDEPENDENT RE-AUDIT
```
