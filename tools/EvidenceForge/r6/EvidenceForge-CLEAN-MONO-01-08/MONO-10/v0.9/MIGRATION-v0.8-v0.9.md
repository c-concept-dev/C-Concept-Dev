# MONO-10 — migration v0.8 → v0.9

MONO-10 v0.8 est **HISTORIQUE / NON_GELABLE**. Elle n'est pas modifiée. v0.9 est
un successeur **additif ciblé** : l'architecture d'autorité de v0.8 n'est pas
redessinée, seuls cinq résidus confirmés sont fermés.

## 1. Aucun module nouveau

v0.9 ne crée aucun module. Elle corrige des contrats existants.

## 2. Changements de rupture

| v0.8 | v0.9 |
|---|---|
| `isProvisioned*(a, {operatorBoundaryId})` | l'identité attendue doit porter **`configBindingHash`** ; un identifiant seul est refusé |
| `assertSameBoundary(descriptor, "otb-…")` | `assertSameBoundary(descriptor, identiteComposite)` — une chaîne lève `AUTHORITY_BOUNDARY_EXPECTATION_INCOMPLETE` |
| `mintCapabilityGrant({operatorBoundaryId, …})` | **`configBindingHash` obligatoire** (`CAPABILITY_CONFIG_BINDING_UNNAMED`) |
| `assertCapability(entry, cap, sink, "otb-…")` | quatrième argument = identité composite |
| manifeste sans `configBindingHash` | le manifeste **engage** la liaison ; `manifestBindingHash` la couvre |
| `resolveEvidenceSourceProvenance({verifier})` libre | `opts.verifier` doit être marqué ; `opts.provenanceAuthority` n'est plus autoritaire |
| `assessCandidates({policy:{identity:{…}}})` fusionné | les clés d'identité d'appelant sont refusées et consignées dans `policyKeysRefused` |
| `minMissionEvidenceRefs` / `minIdentityConfidence` libres | narrow-only : une valeur plus permissive est refusée |
| `assertCapabilityUsable` tolérant hors registre | registre **authentifié** + artefact **enregistré** obligatoires |
| `assertReadinessPhase({registry})` de forme | `isAuthenticatedRegistry` + run + mission + frontière |
| `createAcceptanceBoundary(…)` exporté | retiré ; `createFromBoundary(issuance, …)` seulement |
| `__resetProcessNamespaceRegistry()` exporté | **retiré** de la surface |
| `provisionProductionTrustBoundary({envVar})` | `TRUST_ENV_VAR_REFUSED` |

## 3. Ce qu'un appelant doit faire en plus

1. passer l'identité **composite** partout où une frontière est attendue —
   `verifier.boundaryIdentity` la fournit telle quelle ;
2. nommer `configBindingHash` à chaque émission de capacité ;
3. ne plus passer de vérificateur, d'autorité ni de seuil permissif par la
   politique d'identité ;
4. fournir le registre **authentifié** du run à toute validation de préparation
   et à toute évaluation de capacité LLM en production.

## 4. Effet de bord attendu

Un appelant qui comparait des frontières par leur seul identifiant voit ses
vérifications échouer avec `AUTHORITY_BOUNDARY_EXPECTATION_INCOMPLETE`. C'est le
correctif : cet identifiant est déclaratif.

## 5. Ce qui n'a pas changé

La racine unique d'autorité de v0.8, les capacités typées, le pont traducteur,
la liste blanche de politique, la garde documentation/code, le plafond de statut
de préparation.
