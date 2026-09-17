# MONO-10 — migration v0.5 → v0.6

MONO-10 v0.5 est **HISTORIQUE / NON_GELABLE**. Elle n'est pas modifiée. v0.6 est
un lot additif qui se substitue à elle comme point de consommation.

## 1. Modules nouveaux

| Module | Rôle |
|---|---|
| `core/operator-acceptance-boundary.js` | la validation d'acceptation devient une capacité de la frontière |
| `core/human-act-proof.js` | `HumanActProof` liée à l'acte précis |
| `core/operator-llm-capability-boundary.js` | la frontière charge elle-même son transport |
| `core/artifact-trust-levels.js` | niveaux de confiance ordonnés |
| `adapters/upstream-evidence-binder.js` | pont entre identifiants amont et preuves authentifiées |
| `tools/reference-llm-transport.js` | transport de référence hors ligne |

## 2. Modules réécrits

| Module | Changement |
|---|---|
| `core/authenticated-artifact-registry.js` | ouverture conditionnée à l'authenticité du manifeste ; journal append-only ; gel profond ; réempreinte à la lecture ; `rootBeforeSequence` / `sequenceOf` / `elevate` |
| `core/replay-protection.js` | périmètre d'autorité obligatoire ; `nonceKey(authorityId, keyId, nonce)` ; `coversAuthority` |
| `core/lineage.js` | table d'arêtes typées autoritaire ; `crossRunAllowedRelations` de l'appelant ignoré ; contrat historique authentifié |
| `core/effective-eligibility.js` | la décision est marquée par un `WeakSet` module-privé ; le champ `recomputed` n'a plus de sémantique |
| `core/panel-gated-adapter.js` | recalcul de l'éligibilité **au sink**, avant l'entrée au corpus |

## 3. Changements de rupture pour un appelant

| v0.5 | v0.6 |
|---|---|
| `createAuthenticatedArtifactRegistry(...)` | `openAuthenticatedArtifactRegistry(manifest, ctx)` — lève si le manifeste n'est pas authentique |
| `resolveDownstreamUseAuthorization({ acceptanceValidator })` | l'argument est **ignoré et consigné** ; la validation vient de `verifier.acceptanceBoundary()` |
| `isEligible(objet)` sur un objet reçu | `isEligibleDecision(decision)` sur une décision **produite par le module** |
| `policy: { humanAcceptanceRequired, consumeNonce, crossRunAllowedRelations, requireResolvableEvidence, … }` | ces clés sont **retirées et consignées** dans `refusedOverrides` |
| `validateAcceptance(...)` exporté par `final-report-acceptance.js` | remplacé par `acceptanceDecisionHash(...)` + la capacité de la frontière |
| acte humain = acteur présent au registre | acte humain = `HumanActProof` liée à l'acte |
| `runActiveProbe(..., { transport })` | le transport de l'appelant est ignoré ; il vient de la frontière |
| références de preuve amont sous forme de chaînes | à lier via `adapters/upstream-evidence-binder.js` |

## 4. Ce qu'un appelant doit faire en plus

1. provisionner `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` avec
   `replayProtection.authorityScope`, `humanAuth`, `llmCapability`, `acceptance` ;
2. faire émettre les `HumanActProof` par l'exploitant, pas par le code appelant ;
3. lier les preuves amont dans le registre authentifié avant de présenter quoi
   que ce soit à un humain ;
4. cesser de passer des validateurs, des transports et des politiques de
   contournement : ils sont ignorés, et l'ignorance est consignée dans
   l'artefact.

## 5. Ce qui n'a pas changé

Le principe de v0.5 : EvidenceForge peut choisir ce qu'il vérifie, pas qui il
croit. `OperatorTrustBoundary` n'a pas été redessinée — l'audit A de v0.5 n'a pas
démontré de défaut nouveau de la frontière elle-même, mais de ses
**consommateurs**.
