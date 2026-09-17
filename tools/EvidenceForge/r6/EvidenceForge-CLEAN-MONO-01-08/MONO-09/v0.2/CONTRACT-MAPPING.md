# MONO-09 v0.2 — Correspondance avec le port gelé

Source : `MONO-01/ports/professional-pipeline-port.js`. `bindingType = EXTERNAL_STAGE_ADAPTER`.
Le port appelle `adapter[méthode](inputs, ctx)` avec `inputs` = objet nommé
(`MONO-01/lib/port-factory.js` l.196).

| Méthode | Entrées (contrat validé) | Sortie (contrat validé) | Mode | Contrat d'erreur |
|---|---|---|---|---|
| `discoverProfessionals` | `corpusSnapshot` (`EvidenceForge.CorpusSnapshot`) **et** `missionDimensionSet` (`EvidenceForge.MissionDimensionSet` / `EF-PR-GEN-v1`) — les deux requis | `EvidenceForge.ProfessionalDiscovery` / `EF-02A-v2` | `ASYNC_EXTERNAL` | adaptateur absent → `DEPENDENCY_UNAVAILABLE` ; schéma faux → `SCHEMA_VERSION_MISMATCH` ; exception → `INTEGRATION_CONTRACT_ERROR` |
| `verifyProfessionals` | `professionalDiscovery` (`EF-02A-v2`) | `EvidenceForge.ProfessionalVerification` / `EF-02B-v2` | `ASYNC_EXTERNAL` | idem |
| `buildProfessionalCorpus` | `professionalVerification` (`EF-02B-v2`) | `EvidenceForge.ProfessionalCorpusSet` / `EF-02C-v2` | `ASYNC_EXTERNAL` | idem |

Les `schemaVersion` sont validés **en entrée et en sortie**. v0.2 les pose
littéralement, conformément au contrat gelé — jamais devinés.

## Champs produits

**EF-02A** — `candidates[]` : `candidateRef` (identifiant fournisseur ou `null`),
`displayName`, `dimensionRef`, `orcid`, `affiliation`, `candidateStatus`,
`identityAmbiguity`, `resolutionStatus`, `seedReferences[]`, `evidenceRefs[]`,
`provenance[]`. Plus `inputStats` et `antiCircularity`.

**EF-02B** — `verified[]` avec `verificationStatus ∈ {VERIFIED, UNVERIFIED, AMBIGUOUS}`
et `verificationMethod ∈ {ORCID_PRESENT, PROVIDER_ID_ONLY, NO_STRONG_IDENTIFIER, AMBIGUOUS_IDENTITY}`.

**EF-02C** — `professionalCorpora[]` ; chaque œuvre porte `workRef`,
`providerNativeId`, `doi`, `doiStatus ∈ {PROVIDER_SUPPLIED, ABSENT_AT_PROVIDER,
REJECTED_FABRICATED}`, `identifierProvenance`. `assertNoFabricatedIdentifiers`
est appelé avant retour (fail-closed).

## Dépendances injectées

`resolveAuthorIdentity`, `expandRelatedAuthors`, `fetchAuthorWorks` — toutes
optionnelles. Absente, l'étape ne produit rien plutôt que d'inventer. Aucun
accès réseau, disque ou environnement dans `lib/` (T19c).
