# MONO-10 — migration v0.7 → v0.8

MONO-10 v0.7 est **HISTORIQUE / NON_GELABLE**. Elle n'est pas modifiée. v0.8 est
un lot additif qui se substitue à elle comme point de consommation.

## 1. Module nouveau

| Module | Rôle |
|---|---|
| `core/authority-descriptor.js` | descripteur d'émission commun ; `assertSameBoundary` |

## 2. Changements de rupture

| v0.7 | v0.8 |
|---|---|
| `createOperatorProvenanceAuthority({namespace, registryPath})` | **supprimé**. `OPA.createFromBoundary(issuance, {kind})` — la poignée n'est pas exportée |
| `createOperatorHistoricalInputAuthority({...})` | **supprimé** → `OHIA.createFromBoundary` |
| `createOperatorActProofMechanism({registryPath})` | **supprimé** → `HAB.createFromBoundary` |
| `createOperatorLlmCapabilityBoundary({transportModuleRef})` | **supprimé** → `OLB.createFromBoundary` |
| `createTestHumanAuthMechanism`, `createTestLlmCapabilityBoundary` | renommés `createTestHumanActAuthority`, `createTestLlmCapabilityAuthority` |
| `isProvisioned*(a)` | `isProvisioned*(a, {operatorBoundaryId, requireProduction})` |
| `mintCapabilityGrant({...})` | `operatorBoundaryId` **obligatoire** (`CAPABILITY_BOUNDARY_UNNAMED`) |
| `assertCapability(entry, cap, sink)` | `assertCapability(entry, cap, sink, expectedBoundaryId)` |
| `replayProtection: {replayRoot}` | **refusé** : la réserve est ancrée au fichier de configuration de confiance |
| `assertReadinessPhase(r, phase, opts)` avec `opts.registry` optionnel | registre **obligatoire** ; `dimensionBindingsHash` **obligatoire** |
| statuts de dimension acceptés tels quels | plafonnés par la preuve liée (`READINESS_STATUS_OVERSTATED`) |
| `resolveLineage({historicalInputAuthority})` sans contrôle d'origine | l'autorité doit appartenir à la frontière du run de destination |

## 3. Ce qu'un appelant doit faire en plus

1. ne plus construire d'autorité : les prendre sur le vérificateur
   (`verifier.provenanceAuthority()`, `verifier.historicalInputAuthority()`) ;
2. nommer la frontière courante à chaque émission de capacité ;
3. ne plus déclarer de `replayRoot` ;
4. fournir le registre **et** les liaisons à toute validation de préparation.

## 4. Effet de bord attendu

Un appelant qui tenait une autorité construite localement voit ses capacités
refusées avec `CAPABILITY_ISSUER_INVALID`. C'est le correctif, pas une
régression : cette autorité n'avait jamais été émise par l'exploitant.

## 5. Ce qui n'a pas changé

Les fermetures de v0.5, v0.6 et v0.7 : frontière opérateur externe, recalcul au
point d'effet, liste blanche de politique, capacités typées, pont traducteur,
ambiguïté fermée, garde documentation/code.
