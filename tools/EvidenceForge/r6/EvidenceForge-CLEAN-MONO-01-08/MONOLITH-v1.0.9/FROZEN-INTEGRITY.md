> **v1.0.4** : le lot MONO-11 chargé est **v0.3-r1** (GELÉ par gouvernance). Les lignes ci-dessous relatives à v0.2 sont conservées comme historique ; les runs P0.1 seal B et H1 ont été produits sous v0.2 (voir `FROZEN-HASHES-BEFORE-AFTER.md`).

# FROZEN-INTEGRITY — MONOLITH v1.0.1

Vérification mesurée le 2026-09-14 (`lib/paths.js → verifyFrozenLots()`, exécutée à chaque démarrage du serveur et par le test I1).

| Lot | Répertoire | Fichiers scellés | Divergences | SHA-256 du sceau | Zip canonique (SHA-256) | Zip conforme |
|---|---|---|---|---|---|---|
| MONO-10 v0.19 | `MONO-10/v0.19` | 79 | 0 | `e050af0545ab5b902eb710b2308914523125b784dc27a9a2d387040dced48227` | `f5a4165414f4aacc32f48f50eb14d59c87a09e3f138e24f8bd14b956972c2e04` | oui |
| MONO-11 v0.3-r1 (GELÉ, v1.0.4) | `MONO-11/v0.3-r1` | 52 | 0 | voir `FROZEN-HASHES-BEFORE-AFTER.md` (sceau mesuré) | `3c44b397dda0997d0fff6ab4c8e8a8b311430e6a5ac7aeee38149f8349296b0b` | oui |
| MONO-11 v0.2 (gelé historique, non chargé) | `MONO-11/v0.2` | 30 | 0 | `57e243b785f8de8c0bc603933162f1df160085f92061a13a43d3d2d243eb9df3` | `5c208cbbd13231e732fe20475347f9f7cbe6f890f3ce4823581093c7eba60005` | oui |
| MONO-09 v0.2 | `MONO-09/v0.2` | 9 | 0 | `f1f1e94bdcca4402bc690883ee443ad0b188987fc65c5bd16e050b50b4016e56` | — | — |
| MONO-01 (EF-02D/E, EF-03*, EF-PR-GEN, EF-ORCH) | `MONO-01` | 106 | 0 | `4ba8903ceaeb7e24886708909d734a7b7f34e7cd9ae28b15603440577fe18ffd` | — | — |

Le sceau MONO-11 v0.2 mesuré (`57e243b7…9df3`) est identique au `runtimeSealSha256` du run P0.1 seal B (`P0.1-RUN-STATE-PHASE2-V02.json`) et au sceau consigné par la décision de gel du propriétaire, copiée dans ce paquet : `governance/EvidenceForge-MONO11-v0.2-FREEZE-DECISION.md` (SHA-256 `57ee19354e5f015f633da21fb17ec79abd7b0ea5d59ace491a38ee0956976ddf` ; original dans le dossier de mandats du propriétaire).

**Statut historique du MANIFEST MONO-11 v0.2** : `MONO-11/v0.2/MANIFEST.json` porte `status: "IMPLEMENTE / TESTE — verdict technique propose, NON GELE (gel = decision ChatGPT/proprietaire apres audit independant)"`. Ce texte est **antérieur** à la décision de gel : il fait partie des fichiers scellés (le modifier romprait le sceau). Le gel est acté par la décision du propriétaire ci-dessus, par le zip canonique `5c208cbb…0005` et par le sceau `57e243b7…9df3`, non par le champ `status` du manifeste. Le garde gelé `run-seal-guard.assertSealedRuntime` est le premier appel avant tout `require` du lot MONO-11 (test I3/I4).

## Lots consommés sans sceau propre (composés tels quels, non modifiés)

MONO-02 (graphe), MONO-04 (gateway réel), MONO-05 (registre de runs), MONO-07 (`e2e-driver`), MONO-08 v0.6/v0.8 (retrieval réel, RetrievalSnapshot, POST_RETRIEVAL_GATE, reprise, `prepare-existing-artifacts`), EF-01B v0.2-r2 et EF-01C1 v0.2-r2 (résolveur, planificateur — racines hors bundle, `config/monolith.config.json → operatorKit`). Aucun fichier de ces lots n'est écrit par le monolithe ; les backends durables sont créés **dans le run** (`runs/<runId>/eforch-runtime/`).

## Ce que le monolithe ajoute (additif, hors des lots)

- `lib/*.js` — adaptateurs : mission, EF-01, retrieval/screening/ratification, professionnels/MONO-11, rapport, pipeline, LLM, transport, **adaptateur de clôture Markdown** (`mono04-fence-adapter.js`, règle `MONOLITH-FENCE-NORMALIZATION-v1`, journalisée dans `runs/<runId>/ef01-evidence/fence-normalization-records.jsonl`, original conservé).
- `vendor/operator-kit-r1.3/*` — copies octet-à-octet des cœurs du kit d'exploitation (`~/evidenceforge-work/scripts/lib`), README inclus.
- Rien n'est écrit dans `MONO-*/`.

## Comment re-vérifier

```
node -e 'console.log(require("./lib/paths.js").verifyFrozenLots())'
node test/test-monolith.js      # I1–I5
node tools/build-manifest.js --verify   # intégrité du paquet lui-même
```

Un lot altéré empêche le démarrage (`FROZEN_LOT_ALTERED`) et fait échouer le garde MONO-11 (`RUN_ON_UNSEALED_CODE`).

FROZEN_LOTS_MODIFIED = NO
