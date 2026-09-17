# MONO-10 — Migration v0.3 → v0.4

v0.3 reste **historique et intacte**. Ce document décrit ce qu'un appelant doit
changer.

## 1. Nouveauté structurante : un contexte de run attesté

Tous les validateurs prennent désormais un **contexte de run** au lieu d'un
drapeau `{ production: true }`. Le mode n'est plus déclaré : il est **dérivé**
de l'attestation.

```js
// 0. l'exploitant configure les ancrages (hors du paquet)
const anchorSet = TRA.createTrustAnchorSet([
  { authorityId: "AUT-PROD", executionMode: "PRODUCTION", publicKeyPem: fs.readFileSync(...) },
]);
// 1. l'autorité runtime émet une attestation signée
const attestation = /* fournie par le runtime, hors EvidenceForge */;
// 2. le manifeste en dérive son identité
const manifest = RM.createRunEvidenceManifest({ attestation, anchorSet, missionBinding, missionHash });
// 3. le contexte circule partout
const ctx = { manifest, anchorSet, attestation, humanActVerifier };
```

| v0.3 | v0.4 |
|---|---|
| `{ production: true }` | `runContext` = `{ manifest, anchorSet, attestation, humanActVerifier }` |
| `createRunEvidenceManifest({ runId, executionMode })` | `createRunEvidenceManifest({ attestation, anchorSet, missionHash })` |
| `assertProductionEvidence(a, manifest, label)` | `assertProductionEvidence(a, ctx, label)` |
| `mode.production` | `RM.isProductionContext(ctx)` |

## 2. Ruptures de contrat

### 2.1 L'acte humain doit être authentifié

Ajouter `authenticationMode: "TEST_FIXTURE_DECLARED"` aux actes de test.
En production, injecter `ctx.humanActVerifier` ; sans lui, `NOT_AUTHENTICATED`.

### 2.2 L'indépendance d'identité exige un registre extérieur

```js
const authorityRegistry = IDE.createAuthorityRegistry([
  { authorityId: "LIB-A", canonicalAuthorityId: "AUT-1", familyId: "FAM-1" },
]);
CA.assessCandidates({ ..., authorityRegistry });
```

Les preuves doivent porter `provenanceRecordHash`. **Conséquence attendue** :
des identités qui obtenaient `STRONG` en v0.3 tombent à `MODERATE`. C'est la
correction, pas une régression — l'indépendance n'avait jamais été démontrée.

### 2.3 Les preuves fermant un inconnu doivent résoudre

```js
UNK.transition(u, "RESOLVED", { reason: "...", evidenceRefs: [LIN.artifactRef(artefact, "id", RELATION.CORPUS)] },
  { registry, expectedRunId, expectedMissionHash, expectedAttestationHash });
```

Une chaîne opaque (`"preuve-x"`) ne ferme plus rien. Les transitions portent en
outre une `sequence` monotone et un `runId`.

### 2.4 La lignée est un graphe typé

`artifactRef(artifact, id, relation)` et `createArtifactRegistry([{artifactId, relation, artifact}])`
exigent désormais une **relation** du graphe canonique. `resolveLineage(refs, registry, { relation })`
vérifie la couverture des parents attendus. L'inter-run est refusé par défaut.

### 2.5 La préparation a besoin de deux jeux d'arêtes

La lignée de readiness est celle du graphe **amont** : elle ne peut pas contenir
les nœuds readiness. Passer `readinessLineageRefs` / `readinessArtifactRegistry`
à `qualifyProcess` quand la lignée de qualification les inclut.

### 2.6 `revalidationRequired` n'existe plus

Toute tentative de passer `revalidationRequired: false` — ou de désactiver l'un
des cinq contrôles non négociables — est **supprimée et consignée** dans
`refusedPolicyOverrides`. La politique conserve : `humanAcceptanceRequired`,
`blockOnNonBlockingReservations`, `downstreamClass`, `reservationPolicy`.

## 3. Tableau des renommages

| v0.3 | v0.4 |
|---|---|
| — | `core/canonical.js` (primitives extraites) |
| — | `core/trusted-runtime-authority.js` |
| — | `core/human-act.js` |
| — | `validators/index.js` |
| `assertHumanAct(act, label)` | `assertHumanActDeclaration` + `verifyHumanActAuthenticity` |
| `artifactRef(a, id, type)` | `artifactRef(a, id, relation)` |
| `assertReadinessInputsMatch` | `assertReadinessSourcesMatch` |
| `schemaVersion: "MONO-10-v3"` | `schemaVersion: "MONO-10-v4"` |

## 4. Ce qui n'a pas changé

`core/relevance.js` est repris **à l'identique**. Les invariants de fond sont
inchangés : aucun métier codé en dur, aucune décision humaine simulée,
`unknown` reste `unknown`, un lot gelé n'est jamais réécrit.
