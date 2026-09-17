# MONO-10 — migration v0.6 → v0.7

MONO-10 v0.6 est **HISTORIQUE / NON_GELABLE**. Elle n'est pas modifiée. v0.7 est
un lot additif qui se substitue à elle comme point de consommation.

## 1. Modules nouveaux

| Module | Rôle |
|---|---|
| `contracts/canonical-contracts.json` | source unique des énumérations critiques |
| `core/canonical-contracts.js` | chargement, validation des documents |
| `core/caller-assertion-guard.js` | liste blanche, refus des assertions d'autorité |
| `core/artifact-capabilities.js` | capacités typées et exigences de sink |
| `core/operator-provenance-authority.js` | racines authentifiées |
| `core/operator-historical-input-authority.js` | entrée inter-run autorisée |

## 2. Module supprimé

`core/artifact-trust-levels.js`. L'échelle ordinale était décorative et
franchissable par un hash arbitraire. Remplacée par `artifact-capabilities.js`.

## 3. Changements de rupture pour un appelant

| v0.6 | v0.7 |
|---|---|
| `registry.elevate(id, niveau, justificationHash)` | `registry.grantCapability(id, grant)` — `grant` doit être émis par `mintCapabilityGrant` |
| `TRUST_LEVEL` / `assertAtLeast` | `CAPABILITY` / `assertCapability` / `hasCapability` |
| `eligibilityPolicy.legacyVerificationGrantsEligibility` | **supprimé** ; liste blanche `requireAuthenticatedHumanAct`, `requireLegacyVerified`, `minMissionEvidenceRefs` — toutes restrictives |
| `ELIGIBILITY.ELIGIBLE_BY_LEGACY_VERIFICATION` | **supprimé** |
| `historicalInputContract: { operatorAuthenticated: true }` | `historicalInputAuthority` + `historicalInputRequests` (neuf champs) |
| `replayProtection: { directory }` | `replayProtection: { replayRoot }` — répertoire dérivé |
| `makeKeyRecord({ /* status omis */ })` | `status` obligatoire et valide, sinon `KEY_STATUS_INVALID` |
| `PROVENANCE_STATUS.RESOLVED` | `PROVENANCE_STATUS.AUTHENTICATED` |
| `sanitizePolicy` liste noire | liste blanche : trois clés métier, tout le reste refusé |
| `createPanelGatedAdapter(base, opts)` | `opts.panelValidationArtifactId` requis pour la vérification de capacité |
| binder : `collectionAuthorityId`, `resolverAuthorityId`, familles | **supprimés** — les racines viennent de l'autorité |
| binder : `refByProviderWorkId` toujours peuplée | peuplée **seulement** si l'unicité est prouvée ; `ambiguous[]` sinon |

## 4. Ce qu'un appelant doit faire en plus

1. provisionner `provenanceAuthority` et, si besoin, `historicalInput` dans la
   configuration de l'exploitant ;
2. déclarer `replayProtection.replayRoot` au lieu d'un répertoire ;
3. faire **émettre** les capacités par les autorités compétentes après les avoir
   sollicitées — et accepter qu'une racine inconnue rende la preuve non
   présentable à un humain ;
4. donner un `status` explicite à chaque `keyRecord` ;
5. cesser de passer des drapeaux, des booléens d'authentification et des hashes
   de justification : ils sont refusés, et le refus est consigné dans
   l'artefact.

## 5. Effet de bord attendu, et voulu

Une preuve dont les racines ne sont pas enregistrées par l'exploitant n'atteint
plus `PRESENT_FOR_HUMAN_REVIEW`. Dans l'intégration livrée, 2 candidats sur 3
sont présentés au panel : le troisième n'a pour seule source qu'une œuvre
volontairement absente du registre de racines. Ce n'est pas une régression,
c'est la règle : on ne demande pas à un humain de statuer sur une provenance que
personne n'a authentifiée.

## 6. Ce qui n'a pas changé

Le principe de v0.5 et de v0.6. `OperatorTrustBoundary` n'a pas été redessinée :
l'audit n'a pas démontré de défaut de la frontière elle-même, mais de ce que ses
consommateurs acceptaient comme entrée.
