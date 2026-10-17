# EvidenceForge MONOLITH v1.0.16 — Freeze record

> Décision : `OWNER DECISION — GEL MONOLITH v1.0.16` (D1–D11). Gelée le 2026-09-23T21:13:47Z.

| | |
|---|---|
| Version | **MONOLITH-v1.0.16** — PB-B7 SECONDARY REUSE IDENTITY FIX |
| **Statut** | **`FROZEN_WITH_RESERVATIONS`** |
| Activation | **non** : `ACTIVE_VERSION` = **MONOLITH-v1.0.10**, `activeVersionChanged = false` |
| Smoke | `smokeExecuted = false` pour v1.0.16 |
| **PB-B7** | **`CLOSED`** |
| Parent | MONOLITH-v1.0.15 (`FROZEN_WITH_RESERVATIONS`, `ACTIVATION_BLOCKED_BY_PB_B7`) : 169 fichiers, `contentHash` `1e219650…` |

## Base de décision

- Audit indépendant : **`V1_0_16_FREEZE_AUDIT_PASS_WITH_RESERVATIONS`**, **0 blocker**, **`PB_B7_CLOSED`**.
- Cas T3b : **`PB7_T3B_CLOSED`**. Le registre refuse l'ancienne autorité A, le magasin secondaire refuse aussi, la revue est recalculée, et seule la réponse recalculée peut être inscrite sous B.
- Entrées EF-03B legacy sans `targetId` ou sans `documentAuthoritySha256` : **`NON_REUSABLE_FOR_EF03B_V3`**, sans migration automatique.

## Identité

| | |
|---|---|
| Manifeste runtime | **180 fichiers**, `contentHash` **`54266d0db6a0ce73bb88309a3bb8d53fcaa378c2af3b3e34dadf479f12ada490`** |
| `MANIFEST.json` / `SHA256SUMS.txt` | `babd86b6…` / `b619e1fb…` |
| MONO-11 | v0.4, contrat `MONO-11-v3`, sceau `110db4de…`, `runCodeHash` `27610c84…`, zip `79c16d08…` |
| Audit d'implémentation (.md / .json) | `6b86a662…` / `7e692e81…` |
| Audit indépendant (.md / .json) | `92a8667a…` / `93f52c42…` |

Les empreintes complètes sont dans `EVIDENCEFORGE-v1.0.16-FREEZE-RECORD.json` et `EVIDENCEFORGE-v1.0.16-GOVERNANCE.SHA256SUMS.txt`.

## Statuts

| | |
|---|---|
| T-STREAM-05, T-STREAM-22, RUN-SAFETY-13, V3 | `ADAPTATION_VALID_NO_WEAKENING` |
| RUN-SAFETY-12 | **`TEST_WEAKENED`** (réserve transportée, non bloquante) |
| RUN-SAFETY-21 | `INVERSION_CONTRACTUALLY_CORRECT` |
| Legacy / reprise | `EXPECTED_FAIL_CLOSED_RECOMPUTATION` : appels et coût supplémentaires possibles, aucune perte de preuve, fail-closed volontaire |
| Mutants survivants | M11 (R1), M12 (R5) |

## Réserves transportées

| Id | Gravité | Réserve | Disposition |
|---|---|---|---|
| R1 | MEDIUM | M11 survit : aucun test direct des passes informed-retry, completion et literalization. L'audit a vérifié au harnais que le code les protège. | `ACCEPT_RESERVATION` — `TEST_COVERAGE_GAP_NON_BASE_PASSES`. Pas de v1.0.17 avant le micro-smoke ; la couverture pourra être améliorée après activation ou pilote. |
| R2 | MEDIUM | v1.0.16 déjà commitée dans `766db22a`, contrairement au statut « non commitée » déclaré. | `DOCUMENTED` : historique non réécrit (voir « Commit préexistant »). |
| R3 | MEDIUM | Non fumée. | `OPEN_UNTIL_MICRO_SMOKE` : micro-smoke PB-B7 sous OWNER GATE séparé. |
| R4 | LOW | RUN-SAFETY-12 affaibli (mutant W1 plus tué par ce test). | `ACCEPT_RESERVATION` : 19 autres tests tuent encore W1. |
| R5 | LOW | M12 survit : le transport fait confiance à l'identité déclarée par l'appelant. | `ACCEPT_RESERVATION_CURRENTLY_NON_RUNTIME` — **`IF_NEW_RUNTIME_CALLER_CAN_SUPPLY_EF03B_IDENTITY → R5 MUST BE REOPENED BEFORE THAT CALLER IS AUTHORIZED`**. |
| R6 | LOW | M3, M4 et M4c ne sont tués que par les codes de refus ; M4b est tué par le code. | `ACCEPT_RESERVATION` : défense en profondeur (`reuseContextCheck` historique). |
| R7 | LOW | Seule l'entrée VALID la plus récente est proposée. | `ACCEPT_RESERVATION` : fail-closed, surcoût possible. |
| R8 | INFO | `markValidation` se propage par `responseSha256`. | `ACCEPT_RESERVATION` : préexistant, théorique. |
| R9 | INFO | Dans RUN-SAFETY-21, la sous-assertion sur le contrat est masquée par la garde d'identité. | `ACCEPT_RESERVATION` : couvert par V12-12 et PB7-05. |
| R10 | INFO | Collisions entre finalités refusées ; entrées EF-03B legacy non réutilisables. | `ACCEPT_RESERVATION` : `EXPECTED_FAIL_CLOSED_RECOMPUTATION`. |

## Commit préexistant

- Le code de v1.0.16 est déjà sur `origin/main` via **`766db22a` « studio »** (2026-09-23 22:03 +0200).
- Ce commit contient 184 fichiers : le manifeste de 180, `MANIFEST.json`, `SHA256SUMS.txt` et le rapport de correctif .md/.json. Ils sont byte-identiques à l'état audité.
- **Aucun reset, rebase ni amend ; l'historique n'est pas réécrit.**
- Le commit de gouvernance n'ajoute que les deux fichiers de l'audit indépendant, ce freeze record (.md / .json) et `EVIDENCEFORGE-v1.0.16-GOVERNANCE.SHA256SUMS.txt`.

## Suite

1. **v1.0.16 GELÉE**
2. **Micro-smoke PB-B7** : planification autorisée ; exécution sous **OWNER GATE séparé**, sur racine neuve et isolée
3. **OWNER GATE** d'activation
4. activation éventuelle

**DO NOT ACTIVATE.** Pas de v1.0.17, sauf si le micro-smoke ou une nouvelle preuve factuelle révèle un défaut.
