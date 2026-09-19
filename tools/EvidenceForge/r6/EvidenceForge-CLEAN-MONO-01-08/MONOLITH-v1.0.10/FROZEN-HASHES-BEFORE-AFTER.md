# FROZEN-HASHES-BEFORE-AFTER — lots gelés autour du chantier correctif coût / screening (v1.0.5)

Mesures `shasum -a 256` (sceau = hash du fichier de sceau ; conformité = `shasum -c` de tous les fichiers du sceau, 0 divergence).
« Avant » = valeurs consignées dans `MONOLITH-v1.0.4/FROZEN-HASHES-BEFORE-AFTER.md` (état gelé de référence) ; « après » = mesure
le 2026-09-17 après l'écriture de tout le code, des tests et des documents v1.0.5 et l'exécution de toutes les suites (116/116 tests,
20/20 tests navigateur), dans le dépôt `c-concept-dev/C-Concept-Dev` (`tools/EvidenceForge/r6/EvidenceForge-CLEAN-MONO-01-08/`).

| Lot | Fichiers | Sceau (sha256 du fichier de sceau) | Zip canonique | Avant | Après |
|---|---|---|---|---|---|
| MONO-01 (`manifest/SHA256SUMS`) | 106 | `4ba8903ceaeb7e24886708909d734a7b7f34e7cd9ae28b15603440577fe18ffd` | — | 106/0 | 106/0 |
| MONO-09 v0.2 | 9 | `f1f1e94bdcca4402bc690883ee443ad0b188987fc65c5bd16e050b50b4016e56` | — | 9/0 | 9/0 |
| MONO-10 v0.19 | 79 | `e050af0545ab5b902eb710b2308914523125b784dc27a9a2d387040dced48227` | `f5a4165414f4aacc32f48f50eb14d59c87a09e3f138e24f8bd14b956972c2e04` | 79/0 | 79/0 |
| MONO-11 v0.2 (gelé historique) | 30 | `57e243b785f8de8c0bc603933162f1df160085f92061a13a43d3d2d243eb9df3` | `5c208cbbd13231e732fe20475347f9f7cbe6f890f3ce4823581093c7eba60005` | 30/0 | 30/0 |
| MONO-11 v0.3 (candidat non retenu) | 47 | `f8c9bc883fa12b104964fea30ae1e29734ddc92257b8b0dca26fd432c447c5e1` | `bec558412832293221261ab2f481afc2e3a2c8d7e0bae43769837400af81758d` | 47/0 | 47/0 |
| **MONO-11 v0.3-r1 (GELÉ, chargé par v1.0.5)** | 52 | `9fbef4126d437e0bb2ee4b2564b5ebcc381e8a338eacba40a590eff8402c079c` (= `runtimeSealSha256`) | `3c44b397dda0997d0fff6ab4c8e8a8b311430e6a5ac7aeee38149f8349296b0b` | 52/0 | 52/0 |
| MONOLITH v1.0.3-r1 (immuable) | 42 | `5960c9a0d95fb386b05ad34117894db7ea6b4e3cff30b46d6a573f6c2f728cc2` | `9034a95fe101090b57b9addeffc9cb1a8eb0567b07ed6e62c001035f295e3ff4` | 42/0 | 42/0 |
| **MONOLITH v1.0.4 (prédécesseur, GELÉ)** | 47 | `88ad827e14f54c6fc6f0c855ad96adfdaa4ccb17c9d4b9e23cf4490802f650b7` | `97b999adcff395ab49f7cd33e8e70bab767c7df22ffdda0967771db5595dd961` | 47/0 | 47/0 (suite v1.0.4 rejouée depuis le dépôt : 80/80) |

Identifiants de code MONO-11 mesurés par `run-seal-guard.assertSealedRuntime` sous v1.0.5 : `mono11Version = v0.3-r1`,
`runtimeSealSha256 = 9fbef4126d437e0bb2ee4b2564b5ebcc381e8a338eacba40a590eff8402c079c`,
`runCodeHash = e156590d1605a8873b7b9814ad44a314084ad8946c8993dff4e5e7f86b452755`, `mono11ZipSha256 = 3c44b397…6b0b`,
`mono11ManifestSha256 = 9cbf02d41b8d9f78212bd398afcbb5af5cb1166d028311e105fa59bd2b7a0cb5` — **identiques à v1.0.4**.

Kits d'exploitation EF-01B-v0.2-r2 / EF-01C1-v0.2-r2, MONO-04, MONO-08 : aucun fichier touché (le chantier n'écrit que dans
`MONOLITH-v1.0.5/`). Fichiers de v1.0.4 repris **byte-identiques** dans v1.0.5 (vérifié par les tests NONREG-03/04/05,
PROF-ECON-03/04) : `lib/stage-professionals.js`, `lib/professional-selection.js`, `lib/stage-retrieval.js`,
`lib/screening-evidence.js`, `lib/stage-mission.js`, `lib/paths.js`, `vendor/operator-kit-r1.3/*`, fonctions `confirmPlan`,
`ratifySources`, `buildAuditDecisions`, `saveCheckpoint`, `loadCheckpoint`, `checkpointHash`, `writeAtomic`, `markInterruptedRuns`.

```
FROZEN_LOTS_CHANGED = NO
MONO11_FROZEN_LOT_UNCHANGED = YES
MONOLITH_PREDECESSOR_UNCHANGED = YES
OPERATOR_KITS_UNCHANGED = YES
REAL_RUN_ARTIFACTS_MODIFIED = NO   (runs efm-20260917-f8a95282, efm-20260917-cf6101c7, efm-20260916-7990da62 : lecture seule)
```
