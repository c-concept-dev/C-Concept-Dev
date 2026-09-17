# FROZEN-HASHES-BEFORE-AFTER — lots gelés autour de l'intégration MONO-11 v0.3-r1 (v1.0.4)

Mesures `shasum -a 256` (sceau = hash du fichier de sceau ; conformité = `shasum -c` de tous les fichiers du sceau). « Avant » = avant toute modification (pré-contrôle) ; « après (pré-packaging) » = après l'écriture du code, des tests et des documents v1.0.4 et l'exécution de toutes les suites ; la vérification **post-packaging** est consignée dans le rapport final hors lot (le présent fichier est scellé dans le paquet avant le zip).

| Lot | Fichiers | Sceau (sha256 du fichier de sceau) | Zip canonique | Avant | Après (pré-packaging) |
|---|---|---|---|---|---|
| MONO-01 (`manifest/SHA256SUMS`) | 106 | `4ba8903ceaeb7e24886708909d734a7b7f34e7cd9ae28b15603440577fe18ffd` | — | 106/0 | 106/0 |
| MONO-09 v0.2 | 9 | `f1f1e94bdcca4402bc690883ee443ad0b188987fc65c5bd16e050b50b4016e56` | — | 9/0 | 9/0 |
| MONO-10 v0.19 | 79 | `e050af0545ab5b902eb710b2308914523125b784dc27a9a2d387040dced48227` | `f5a4165414f4aacc32f48f50eb14d59c87a09e3f138e24f8bd14b956972c2e04` | 79/0 | 79/0 |
| MONO-11 v0.2 (gelé historique) | 30 | `57e243b785f8de8c0bc603933162f1df160085f92061a13a43d3d2d243eb9df3` | `5c208cbbd13231e732fe20475347f9f7cbe6f890f3ce4823581093c7eba60005` | 30/0 | 30/0 |
| MONO-11 v0.3 (candidat non retenu) | 47 | `f8c9bc883fa12b104964fea30ae1e29734ddc92257b8b0dca26fd432c447c5e1` | `bec558412832293221261ab2f481afc2e3a2c8d7e0bae43769837400af81758d` | 47/0 | 47/0 |
| **MONO-11 v0.3-r1 (GELÉ, chargé par v1.0.4)** | 52 | `9fbef4126d437e0bb2ee4b2564b5ebcc381e8a338eacba40a590eff8402c079c` (= `runtimeSealSha256` mesuré par la garde) | `3c44b397dda0997d0fff6ab4c8e8a8b311430e6a5ac7aeee38149f8349296b0b` | 52/0 ; dossier == zip (`diff -r` vide) | 52/0 |
| MONOLITH v1.0.3-r1 (prédécesseur, immuable) | 42 | `5960c9a0d95fb386b05ad34117894db7ea6b4e3cff30b46d6a573f6c2f728cc2` | `9034a95fe101090b57b9addeffc9cb1a8eb0567b07ed6e62c001035f295e3ff4` | 42/0 | 42/0 |

Identifiants de code MONO-11 mesurés par `run-seal-guard.assertSealedRuntime` (v1.0.4) : `mono11Version = v0.3-r1`, `runtimeSealSha256 = 9fbef412…c079c`, `runCodeHash = e156590d1605a8873b7b9814ad44a314084ad8946c8993dff4e5e7f86b452755`, `mono11ZipSha256 = 3c44b397…6b0b`, `mono11ManifestSha256 = 9cbf02d41b8d9f78212bd398afcbb5af5cb1166d028311e105fa59bd2b7a0cb5`. Sous v1.0.3-r1 ils valaient `v0.2` / `57e243b7…` / (v0.2) / `5c208cbb…`.

```
FROZEN_LOTS_CHANGED = NO
MONO11_FROZEN_LOT_UNCHANGED = YES
MONOLITH_PREDECESSOR_UNCHANGED = YES
```
