# INTEGRATION-REPORT — MONO-11 v0.3-r1 → MONOLITH v1.0.4 (candidat)

Date : 2026-09-16. Mode : intégration + validation locale uniquement (aucun run H1/H2, aucun appel Anthropic/OpenAlex/réseau). Baseline `MONOLITH-v1.0.3-r1` (dossier `MONOLITH-v1.0.3/`, zip `9034a95f…3ff4`) intacte ; successeur `MONOLITH-v1.0.4/` (convention existante : dossier `MONOLITH-v1.0.x`, `product.version` dans la config, zip `EvidenceForge-MONOLITH-<version>.zip` — r1 de v1.0.3 avait été fait en place dans le dossier v1.0.3 ; ici un **nouveau dossier** est créé, jamais le numéro `v1.0.3-r1` réutilisé).

## 1. Décision de gouvernance appliquée
`MONO-11 v0.3-r1 = GELÉ`, zip canonique `EvidenceForge-MONO11-AUTONOMOUS-PANEL-v0.3-r1.zip`, SHA-256 `3c44b397dda0997d0fff6ab4c8e8a8b311430e6a5ac7aeee38149f8349296b0b`. v0.2 = gelé historique (non chargé) ; v0.3 = candidat intermédiaire non retenu (non chargé).

## 2. Pré-contrôle (avant toute modification)
| Contrôle | Résultat |
|---|---|
| A. SHA-256 du ZIP MONO-11 v0.3-r1 | `3c44b397…6b0b` = canonique |
| B. MANIFEST / SHA256SUMS du lot | MANIFEST `v0.3-r1`, tests 69/69, `GELABLE_TECHNIQUEMENT` ; `shasum -c` 52/52 |
| C. dossier `MONO-11/v0.3-r1` vs ZIP | `diff -r` vide : byte-identique (54 fichiers) |
| D. baseline MONOLITH v1.0.3-r1 | `shasum -c SHA256SUMS.txt` 42/42 ; zip `9034a95f…` ; suite baseline rejouée sur la copie intacte : 72/72 |
| E. inventaire des références MONO-11 | ci-dessous |

### Inventaire des références MONO-11 dans la baseline
| Emplacement | Référence | Nature |
|---|---|---|
| `config/monolith.config.json` `frozenLots.MONO-11` | `dir MONO-11/v0.2`, zip v0.2, sha `5c208cbb…` | chemin + zip canonique + hash |
| `lib/paths.js` l.38–39 | `MONO11 = MONO-11/v0.2`, `MONO11_ZIP = …v0.2.zip` (codés en dur, dupliquant la config) | chemins |
| `lib/stage-professionals.js` l.25 `loadSealedMono11` | `assertSealedRuntime({ expectedVersion: "v0.2", expectedZipSha256: config })` puis `require(index.js)`, `frozenBridge.loadFrozen` | garde de sceau + chargement |
| `lib/stage-professionals.js` l.132 | `producerVersion: "MONO-11-v0.2(seal …)"` | libellé d'intention de run MONO-10 |
| `lib/stage-professionals.js` l.236, 255, 260 | `seal { mono11Version, runtimeSealSha256, runCodeHash, mono11ZipSha256 }` dans le checkpoint ; `CHECKPOINT_SEAL_MISMATCH` si sceau ≠ ; `mono11:professionals-checkpoint-ref` dans le ledger | checkpoint / ré-ancrage (dynamiques) |
| `lib/pipeline.js` l.74–75 | `sealHash = loadSealedMono11().SEAL.runtimeSealSha256` → `createLlm({ sealHash })` | contexte de reuse (dynamique) |
| `lib/llm.js` l.10, 49, 56–57 | `require(MONO11/core/llm-response-reuse.js)` ; `VALIDATION_CONTRACT = "MONO-11-v2"` ; `reuseContextCheck` (fournisseur, modèle, contrat, `sourceSealHash === opts.sealHash`, corps en cache) | politique de reuse + contrat scientifique |
| `lib/stage-report.js` l.91, 104 | texte de réserve « (MONO-11 v0.2) » ; bloc `integrity.seal` | rapport |
| `lib/run-store.js` l.17, `lib/pipeline.js` l.7, `tools/import-sealed-run.js` l.5 | commentaires « v0.2 » | doc de code |
| `tools/import-sealed-run.js` l.23 | `mono11ZipSha256 === config.canonicalZipSha256` | import de run scellé (dynamique) |
| `tools/build-manifest.js`, `tools/package.sh` | `frozenLots` copiés de la config ; nom du zip `v1.0.3-r1` | manifeste / packaging |
| `test/test-monolith.js` I1, I3, I4, I5, L5, X7, R5, `patchSeal` | version « v0.2 » attendue / listée ; sceau simulé | tests |
| `README.md`, `FROZEN-INTEGRITY.md` | « MONO-11 v0.2 » | docs |
| `index.html`, `server.js` | aucune référence de version MONO-11 (affichent le sceau du run) | — |

## 3. Matrice d'impact
| Composant | Référence actuelle MONO-11 | Changement requis | Justification | Risque |
|---|---|---|---|---|
| Chargement MONO-11 (`paths.js`, `stage-professionals.js loadSealedMono11`) | dir/zip v0.2 codés en dur ; `expectedVersion "v0.2"` | **CHANGEMENT OBLIGATOIRE** : dir/zip/version dérivés de la config (`frozenLots.MONO-11.dir/canonicalZip/version`) ; `expectedVersion = P.MONO11_VERSION` | une seule source de vérité ; la garde refuse tout autre lot (`RUN_ON_UNSEALED_CODE`) | faible (vérifié I3/I4) |
| Validation contract (`llm.js VALIDATION_CONTRACT`) | `"MONO-11-v2"` | **INCHANGÉ PAR DESIGN** | contrat scientifique inchangé en v0.3-r1 (audit) ; un bump ferait refuser toute reuse antérieure valide | nul |
| sourceSealHash / runtime seal (`pipeline.js` → `createLlm({sealHash})`) | `SEAL.runtimeSealSha256` dynamique | **INCHANGÉ PAR DESIGN** (la valeur change : `57e243b7…` → `9fbef412…`) | la reuse est déjà liée au sceau : les réponses produites sous v0.2 ne sont **pas** réutilisées sous v0.3-r1 (refus journalisé `sceau different`) | coût : les runs futurs repartent sans reuse des réponses H1 (attendu, fail-safe) |
| MONO-11 version (`SEAL.mono11Version`) | lu par la garde | **VERSIONING** : config `version: "v0.3-r1"` ; `producerVersion` composé depuis `SEAL.mono11Version` | identifiant du CODE, distinct du contrat | nul |
| runCodeHash / mono11ZipSha256 | mesurés par la garde | **INCHANGÉ PAR DESIGN** (valeurs nouvelles mesurées) | — | nul |
| Reuse validation (`reuseContextCheck`, `onValidation`) | politique gelée `llm-response-reuse.js` (byte-identique v0.2→v0.3-r1) | **INCHANGÉ PAR DESIGN** | le prompt ciblé v0.3-r1 porte l'empreinte : la clé `sha256(prompt)` isole les contextes sans changer le transport | nul (V1–V3) |
| Checkpoint / ré-ancrage (`runDownstreamFromCheckpoint`, `run-store`) | structure, contentHash, panelHash, `ProfessionalsCheckpointRef`, `CHECKPOINT_SEAL_MISMATCH` | **INCHANGÉ PAR DESIGN** | un checkpoint v0.2 (H1) est refusé sous v0.3-r1 : fail-closed correct | V5, R5 |
| TWINS_REVIEWS / review enforcement | `M11.autonomousRun.runDownstream` → `buildEnforcedReviewSet` (lot) | **INCHANGÉ PAR DESIGN** : le monolithe ne fabrique aucun prompt ; `meta.repairContextFingerprint` ignoré par le transport (clé = prompt) | composition pure | nul (V4) |
| Lignée (ledger MONO-11, registre MONO-10) | `mono11:*`, chaînes vérifiées | **INCHANGÉ PAR DESIGN** ; traces par passe gagnent `repairContext` (additif) | — | nul |
| Report (`stage-report.js`) | texte « (MONO-11 v0.2) » | **VERSIONING** : libellé dérivé de `seal.mono11Version` (sémantique de la réserve inchangée) | exactitude | nul |
| Packaging (`package.sh`, `build-manifest.js`) | nom v1.0.3-r1 ; manifeste sans provenance d'intégration | **PACKAGING** : nom v1.0.4 ; bloc `integration` mesuré (sceau, contrat, lots, tests, cap, prédécesseur) | §18 du mandat | nul |
| Tests | v0.2 attendue | **TEST** : I3/I5/L5/patchSeal mis à jour ; V1–V8 ajoutés | §8–§14 | — |
| Docs | v0.2 | **DOC** | — | — |
| `index.html`, `server.js`, `professional-selection.js`, `stage-ef01/retrieval/mission`, `screening-evidence.js`, `llm-transport.js`, `mono04-fence-adapter.js`, `vendor/`, `governance/` | — | **INCHANGÉ PAR DESIGN** (byte-identiques) | hors périmètre | nul |

## 4. Principe respecté : composition + adaptation
Aucun fichier du lot `MONO-11/v0.3-r1` n'est copié ni modifié (sceau 52/52 avant/après) ; `core/review-enforcer.js`, le validateur et `repairContext` sont consommés tels quels via `require(P.MONO11 + "/index.js")` après la garde de sceau. Le test V4 prouve que `lib/` ne contient aucun constructeur de prompt de revue (aucun fallback v0.3 non contextualisé possible). Aucun nouveau LLM, aucun appel structurel supplémentaire (mêmes passes, `reviewMaxPasses = 3`).

## 5. Reuse — point critique (§6) : vérifié dans le chemin réel (`createLlm` + fournisseur simulé au niveau `fetch`)
- Le corps HTTP de la passe 2 contient la ligne `CONTEXTE DE REPARATION … empreinte=<fingerprint>` et `sha256(messages[0].content) === trace.promptSha256` (byte-exact, ni supprimé ni normalisé) — V1/V2/V6.
- `createReusePolicy.decide(prompt)` indexe exactement ce prompt : deux entrées VALID à clés distinctes pour A et B — V1/V2 ; `sourceSealHash = 9fbef412…` (v0.3-r1) et `validationContract = MONO-11-v2` sur chaque entrée réelle.
- Same-context : `REUSE_VALID` (1 reuse, 0 refus) sur 2e exécution et après STOP/reprise (nouvelle instance, nouveau dossier, magasin persisté) — V3.
- Cross-twin : 0 reuse, A→B et B→A — V1/V2.

## 6. Diff v1.0.3-r1 → v1.0.4 (`reports/DIFF-MONOLITH-v1.0.3-r1-to-v1.0.4.patch`) — classement
| Fichier | Lignes | Catégorie |
|---|---|---|
| `config/monolith.config.json` | +6/−4 | REQUIRED_FOR_MONO11_V03_R1 (dir/zip/sha/version) + VERSIONING (`product.version`) |
| `lib/paths.js` | +2/−2 | REQUIRED_FOR_MONO11_V03_R1 (chemins dérivés de la config, `MONO11_VERSION`) |
| `lib/stage-professionals.js` | +5/−5 | REQUIRED_FOR_MONO11_V03_R1 (`expectedVersion` depuis la config) + VERSIONING (`producerVersion`, 3 commentaires) |
| `lib/stage-report.js` | +1/−1 | VERSIONING (libellé de la réserve dérivé du sceau ; code de réserve inchangé) |
| `lib/llm.js`, `lib/pipeline.js`, `lib/run-store.js`, `tools/import-sealed-run.js` | +2/−2, +1/−1, +1/−1, +1/−1 | DOC (commentaires seulement ; aucun code) |
| `tools/package.sh` | +3/−3 | PACKAGING (nom du zip) |
| `tools/build-manifest.js` | +13/−1 | PACKAGING (bloc `integration` mesuré) |
| `test/test-monolith.js` | +98/−4 | TEST (I3/I5/L5/patchSeal ; V1–V8) |
| `README.md`, `FROZEN-INTEGRITY.md`, 5 nouveaux `.md` | — | DOC |
| `MANIFEST.json`, `SHA256SUMS.txt` | régénérés | PACKAGING |
Aucune autre catégorie. `index.html`, `server.js` et les 9 autres modules `lib/` sont byte-identiques.

## 7. Audit différentiel interne (§20)
1. Consomme réellement v0.3-r1 ? **OUI** — garde de sceau : `mono11Version v0.3-r1`, zip `3c44b397…`, `runtimeSealSha256 9fbef412…`, `runCodeHash e156590d…` (I3, manifeste mesuré).
2. Correction cross-twin active dans le chemin réel ? **OUI** — V1/V2 (transport réel, 0 reuse croisé, prompts distincts, empreinte transmise byte-exact).
3. Same-context reuse ? **OUI** — V3.
4. STOP/reprise ? **OUI** — V3 (magasin persisté, nouvelle instance), X4/X5 (reprise par étape, inchangés).
5. Checkpoint PROFESSIONALS ? **OUI** — R5 (ré-ancrage réel sous v0.3-r1), V5 (sceau étranger refusé), C1–C6 (cap 150).
6. Aucun lot gelé modifié ? **OUI** — `FROZEN-HASHES-BEFORE-AFTER.md`.
7. Aucun contrat scientifique modifié ? **OUI** — V8 (validateur byte-identique v0.2, `MONO-11-v2`, `reviewMaxPasses 3`, cap 150).
8. Aucun nouveau LLM ? **OUI** — modèle/config inchangés, aucun appel ajouté.
9. Aucun coût structurel supplémentaire ? **OUI** — mêmes passes ; la ligne de contexte ajoute ~300 caractères par prompt ciblé (passes ≥ 2 uniquement). Effet de bord attendu : les réponses H1 (sceau v0.2) ne sont plus réutilisables (refus `sceau different`, journalisé) — comportement fail-safe préexistant.
10. Aucun fallback vers v0.3/v0.2 ? **OUI** — un seul chemin de chargement (config) ; I5 vérifie que le paquet ne vit dans aucun dossier scellé ; V4 : aucun prompt fabriqué par le monolithe.

## 8. Ce que cette intégration ne prouve pas
Aucun run réel n'a été exécuté sous v1.0.4 : le bénéfice réel de la réparation ciblée sur une génération future n'est pas démontré (le lot et le benchmark le disent explicitement). Le checkpoint H1 (`efm-20260915-2584bf6c`, sceau v0.2) n'est pas reprenable sous v1.0.4 — c'est un refus voulu. Les tests navigateur (`tools/browser-tests.js`, CDP + serveur local) n'ont pas été rejoués : `index.html`/`server.js` sont byte-identiques à la baseline.

Statut : **IMPLEMENTATION GELABLE (candidat)** — non gelé ; prochain acte : audit indépendant différentiel.
