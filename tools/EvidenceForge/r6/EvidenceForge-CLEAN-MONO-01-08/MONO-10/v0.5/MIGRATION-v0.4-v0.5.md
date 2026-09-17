# MONO-10 — Migration v0.4 → v0.5

v0.4 reste **historique et intacte**. Ce document décrit ce qu'un appelant doit
changer.

## 1. Le changement structurant : on ne fournit plus la confiance

```js
// v0.4 — l'appelant fournissait les ancrages
const anchorSet = TRA.createTrustAnchorSet([{ authorityId, executionMode, publicKeyPem }]);
const ctx = { manifest, anchorSet, attestation, humanActVerifier };

// v0.5 — l'exploitant provisionne, l'appelant consomme
//   export EVIDENCEFORGE_OPERATOR_TRUST_CONFIG=/etc/evidenceforge/trust.json
const boundary = OTB.provisionProductionTrustBoundary();   // aucun paramètre de confiance
const verifier = OTV.createOperatorTrustVerifier(boundary);
const ctx = { manifest, verifier, attestation, artifactRegistry };
```

| v0.4 | v0.5 |
|---|---|
| `createTrustAnchorSet(anchors)` | **supprimé du chemin de production** |
| `ctx.anchorSet` | `ctx.verifier` (issu de la frontière) |
| `ctx.humanActVerifier` | provisionné par la frontière ; un callback appelant est **refusé** |
| `ctx.seenNonces` (Set optionnel) | store provisionné, **obligatoire** en production |
| `createRunEvidenceManifest({attestation, anchorSet})` | `openRunEvidenceManifest({verifier, attestation, runIntent})` |
| `LIN.createArtifactRegistry(entries)` | `AAR.createAuthenticatedArtifactRegistry(manifest, entries)` |

## 2. Ruptures de contrat

### 2.1 L'intention de run doit être figée avant signature

```js
const intent = { runId, missionHash, producerId, producerVersion, executionMode, openedAt };
const attestation = /* signée par l'autorité, engage RA.computeRunManifestRootHash(intent) */;
const manifest = RM.openRunEvidenceManifest({ verifier, attestation, runIntent: intent, missionBinding });
```

### 2.2 Le registre d'artefacts est construit depuis le run

```js
const registry = AAR.createAuthenticatedArtifactRegistry(manifest,
  [{ artifactId, relation, artifact }, ...]);   // chaque entrée est VÉRIFIÉE liée au run
```

Un registre non authentifié est refusé partout (`ARTIFACT_REGISTRY_FORGED`).

### 2.3 Les preuves d'identité portent une `provenanceRef`

`sourceAuthorityId` / `sourceFamilyId` inline **ne sont plus lus**. Chaque preuve
référence un enregistrement `documentary-evidence` enregistré dans le registre
authentifié ; les racines de source, d'autorité et de famille sont lues **sur cet
artefact**.

**Conséquence attendue** : des identités `STRONG` en v0.4 tombent à `MODERATE`
si leur provenance n'est pas enregistrée. C'est la correction.

### 2.4 Les preuves vues par l'humain sont des références de lignée

`missionEvidenceRefs` et `decision.evidenceRefs` doivent être des
`artifactRef(..., RELATION.DOCUMENTARY_EVIDENCE)` qui **résolvent**. Une chaîne
opaque ne franchit plus la porte.

### 2.5 L'éligibilité ne s'accepte pas en entrée

`isEligible(e)` exige `e.recomputed === true`. Un objet portant
`effectiveCorpusEligibility: "ELIGIBLE..."` sans recalcul vaut `false`. Une
éligibilité fournie est consignée dans `suppliedEligibilityIgnored`.

### 2.6 L'acte humain passe par la frontière

Ajouter `authenticationMode: "TEST_FIXTURE_DECLARED"` aux actes de TEST. En
production, l'acteur doit figurer dans le registre provisionné par l'exploitant.

## 3. Renommages

| v0.4 | v0.5 |
|---|---|
| `core/trusted-runtime-authority.js` | `core/operator-trust-boundary.js` + `core/operator-trust-verifier.js` + `core/runtime-attestation.js` |
| — | `core/key-lifecycle.js`, `core/replay-protection.js` |
| — | `core/operator-human-auth-boundary.js`, `core/authenticated-artifact-registry.js`, `core/evidence-source-provenance.js` |
| `trustedRuntimeAttestationHash` | `runtimeAttestationHash` |
| `createRunEvidenceManifest` | `openRunEvidenceManifest` |
| `schemaVersion: "MONO-10-v4"` | `schemaVersion: "MONO-10-v5"` |

## 4. Ce qui n'a pas changé

`core/relevance.js` est repris **à l'identique** depuis v0.2. Les invariants de
fond sont inchangés : aucun métier codé en dur, aucune décision humaine simulée,
`unknown` reste `unknown`, un lot gelé n'est jamais réécrit.
