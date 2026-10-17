# TEST-REPORT — MONOLITH v1.0.4 (intégration MONO-11 v0.3-r1)

Tout hors ligne : fournisseur LLM simulé au niveau `fetch` (`withFakeProvider`), OpenAlex jamais appelé, aucun serveur lancé. Nombres exacts mesurés le 2026-09-16.

| Suite / contrôle | Résultat |
|---|---|
| MONOLITH baseline v1.0.3-r1 (suite rejouée sur la copie byte-identique **avant** modification, baseline non touchée) | **72/72** |
| MONOLITH candidat v1.0.4 `test/test-monolith.js` (72 hérités, dont I3/I5/L5/patchSeal adaptés + R5 rejoué sous v0.3-r1, + V1–V8) | **80/80** |
| MONO-11 v0.3-r1 `test/test-mono11-v0.3-r1.js` (lot gelé, exécuté en place ; sceau 52/52 après exécution) | **69/69** |
| MONO-11 v0.2 `test/test-mono11-v0.2.js` (gelé historique ; sceau 30/30 après exécution) | **44/44** |
| Lots gelés (`verifyFrozenLots`, I1) | MONO-10 79/0, MONO-11 v0.3-r1 52/0, MONO-09 9/0, MONO-01 106/0 ; zips MONO-10 `f5a41654…`, MONO-11 `3c44b397…` conformes |
| Manifeste / paquet | `tools/build-manifest.js` (bloc `integration` mesuré) ; `--verify` post-packaging consigné dans le rapport hors lot |
| Anti-hardcoding (H1/H2 + CLI) | sans artefacts : 0 hit ; avec 8 artefacts de cas déclarés (P0.1 panel/discovery, H1 panel/discovery/mission, v1.0.1 panel/discovery/mission) : **3 031 jetons, 0 hit** (un identifiant de candidat présent dans un libellé de test v1.0.4 a été détecté par H1 lors du premier passage et retiré) |
| Secrets (K1/K2 + CLI) | 48 fichiers, 0 hit ; valeurs d'environnement (si présentes) vérifiées absentes, jamais imprimées |
| Lignée (R5, V5, C1–C6, L1–L5, X1–X10) | PASS |
| Checkpoint / ré-ancrage | R5 PASS (sous v0.3-r1), V5 PASS (`CHECKPOINT_SEAL_MISMATCH` pour un sceau v0.2) |
| Retry / reuse | L5, X7 (contexte de reuse), V1–V4 (cross-twin A→B, B→A ; same-context ; STOP/reprise ; `REPAIR_CONTEXT_REQUIRED`) PASS |
| Cas historiques | V6 (fixture R1 = revue refusée 3 passes en H1) : refus maintenu, 2 fragments non contigus, réparation contextualisée transmise, répétition exacte contrôlée, 3 appels, 0 reuse, 0 acceptation artificielle — PASS ; V7 (fixture R2 = corrigé au retry en H1) : réparation acceptée par validateur inchangé + EF-03B gelé, champs hors `targetEvidenceRefs` préservés, empreinte et prompt identiques au rejeu scellé du lot — PASS |
| Non-régression scientifique (V8, T9-équivalent) | validateur / `informedRepairPrompt` / `enforcementPreamble` / `extractJson` byte-identiques à la référence v0.2 ; `contractVersion MONO-11-v2` ; `VALIDATION_CONTRACT = "MONO-11-v2"` ; `reviewMaxPasses 3` ; cap 150 ; rejeu historique 12 occurrences, 0 fausse acceptation, 0 régression, 0 collision |
| Tests navigateur (`tools/browser-tests.js`) | **non rejoués** (nécessitent un serveur local + CDP) ; `index.html` et `server.js` byte-identiques à la baseline |

Ce qui n'est pas mesuré ici : aucun run réel (H1/H2) sous v1.0.4 ; aucune démonstration qu'une génération réelle future réussirait la réparation ciblée.

```
MONOLITH_TESTS = 80/80
FALSE_ACCEPTANCES = 0
REGRESSIONS = 0
```
