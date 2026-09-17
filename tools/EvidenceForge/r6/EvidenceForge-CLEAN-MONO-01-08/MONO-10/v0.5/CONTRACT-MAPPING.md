# MONO-10 v0.5 — Cartographie des contrats

| Contrat | Module livré | Provisionné par | Invariant non négociable |
|---|---|---|---|
| `OperatorTrustBoundary` | `core/operator-trust-boundary.js` | **environnement** (PRODUCTION) | l'espace PRODUCTION n'est jamais construit en processus |
| `OperatorTrustVerifier` | `core/operator-trust-verifier.js` | la frontière | aucun paramètre n'accepte de matière de confiance |
| `KeyRecord` | `core/key-lifecycle.js` | exploitant | REVOKED n'est jamais valide ; RETIRED reste vérifiable pour son passé |
| `ReplayProtectionStore` | `core/replay-protection.js` | la frontière | obligatoire et persistant en production |
| `OperatorHumanAuthBoundary` | `core/operator-human-auth-boundary.js` | la frontière | aucune signature humaine n'est inventée |
| `RuntimeAttestation` | `core/runtime-attestation.js` | autorité de l'exploitant | 12 champs signés, dont la racine du manifeste |
| `RunEvidenceManifest` | `core/run-evidence-manifest.js` | dérivé de l'attestation | il **reprend** son mode, il ne le déclare pas |
| `AuthenticatedArtifactRegistry` | `core/authenticated-artifact-registry.js` | construit depuis le run | chaque entrée est vérifiée liée au run |
| `DocumentaryEvidenceRecord` | `core/evidence-source-provenance.js` | collecte documentaire | la racine de source vient de l'artefact, pas du libellé |
| `IdentityEvidence` → confiance | `core/identity-evidence.js` | — | l'indépendance se dérive d'une provenance résolue |
| Lignée | `core/lineage.js` | — | 7 contrôles + arêtes typées ; *default deny* inter-run |
| `Unknown` | `core/unknowns.js` | — | une preuve qui ne résout pas ne ferme rien |
| `ProfessionalPanelValidation` | `core/panel-gate.js` | humain + frontière | les preuves vues par l'humain **résolvent** |
| `EffectiveCorpusEligibility` | `core/effective-eligibility.js` | — | recalculée ; `DEFER`/`REJECT` n'ouvrent jamais le corpus |
| Porte d'exécution | `core/panel-gated-adapter.js` | — | sans porte valide, aucun corpus |
| `LlmCapability` | `core/llm-capability.js` | transport injecté | une sonde de test ne prouve pas une capacité de production |
| `ScientificReadiness` | `core/scientific-readiness.js` | — | une dimension sans source ne promeut aucune phase |
| `ScientificQualification` | `core/scientific-qualification.js` | — | authenticité **et** cohérence |
| `ScientificUnifiedReport` | `core/scientific-unified-report.js` | — | un seul run, une seule mission, une seule attestation |
| `FinalReportAcceptance` | `core/final-report-acceptance.js` | humain + frontière | le rapport concret est obligatoire |
| `DownstreamUseAuthorization` | `core/downstream-authorization.js` | — | revalidation toujours obligatoire ; motifs dérivés |

## Chaque affirmation de la documentation correspond à un contrôle exécutable

| Affirmation | Contrôle | Test |
|---|---|---|
| « l'appelant ne peut pas choisir à qui faire confiance » | `provisionTestTrustBoundary` refuse PRODUCTION ; marques d'origine | T01, T02, M01, M36 |
| « aucune API de production n'accepte d'ancrage » | scan de la surface de production | HYG-04 |
| « aucune matière privée dans le paquet » | scan + témoin positif | HYG-03, HYG-03b |
| « l'anti-rejeu est obligatoire en production » | `REPLAY_PROTECTION_MISSING` au provisionnement | T11, M31 |
| « une clé révoquée n'est jamais valide » | `evaluateKeyAt` | T07, M27 |
| « une clé retirée reste vérifiable pour son passé » | `evaluateKeyAt` à la date de signature | T09, M29 |
| « les preuves vues par l'humain résolvent » | `resolveLineage` dans `panel-gate` | T19, M39 |
| « l'éligibilité est recalculée » | `isEligible` exige `recomputed === true` | T24, M41 |
| « la revalidation est toujours obligatoire » | `sanitizePolicy` supprime et consigne | T47, M21 |
| « aucun artefact n'affirme une vérification non faite » | motifs dérivés + garde-fou | M22 |
| « l'adaptateur livré est celui qu'exerce la chaîne » | `require.resolve` comparé | I-05 |
