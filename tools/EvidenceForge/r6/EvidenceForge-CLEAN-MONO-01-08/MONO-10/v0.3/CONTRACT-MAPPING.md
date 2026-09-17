# MONO-10 v0.3 — Cartographie des contrats

Chaque contrat approuvé, le module **livré** qui l'implémente, et l'invariant qui
le distingue d'une simple structure de données.

| Contrat | Module livré | Entrées exigées | Sortie | Invariant non négociable |
|---|---|---|---|---|
| `RunEvidenceManifest` | `core/run-evidence-manifest.js` | `runId`, `executionMode`, `producers[]` | manifeste + `runBinding` par artefact | un artefact ne peut pas se donner sa propre provenance |
| `IdentityEvidence` → confiance | `core/identity-evidence.js` | preuves avec `sourceAuthorityId` / `sourceFamilyId` | `STRONG ‖ MODERATE ‖ WEAK ‖ AMBIGUOUS` | l'indépendance se démontre ; inconnue, elle ne compte pas |
| Pertinence documentaire | `core/relevance.js` | libellés candidat + mission, oracle **injecté** | `SUPPORTED ‖ PLAUSIBLE ‖ AMBIGUOUS ‖ OUT_OF_SCOPE ‖ UNKNOWN` | `OUT_OF_SCOPE` seulement sur avis explicite de l'oracle |
| `Unknown` | `core/unknowns.js` | `originArtifact`, `reason`, `blockingStatus` | chaîne d'événements | le statut est dérivé, jamais déclaré |
| Lignée | `core/lineage.js` | refs + registre d'artefacts disponibles | refs résolues | une référence non résolue n'est pas une référence |
| `ProfessionalCandidateAssessment` | `core/candidate-assessment.js` | découverte, vérification, libellés de mission | statuts documentaires | aucun statut ne vaut admission ni jugement de compétence |
| `ProfessionalPanelValidation` | `core/panel-gate.js` | évaluation + décisions humaines | décisions validées | exhaustivité ; `APPROVE` impossible sur identité `AMBIGUOUS` |
| `EffectiveCorpusEligibility` | `core/effective-eligibility.js` | statut amont, décision humaine, preuves | éligibilité dérivée | le statut amont est copié, jamais réécrit |
| Porte d'exécution | **`core/panel-gated-adapter.js`** | adaptateur de base + porte validée | adaptateur filtré | sans porte valide, aucun corpus (fail-closed) |
| `LlmCapability` | `core/llm-capability.js` | configuration + transport **injecté** | capacité constatée | l'absence d'attestation est un rejet ; aucun secret stocké |
| `ScientificReadiness` | `core/scientific-readiness.js` | artefacts sources + registre | PRE ou FULL | la phase est le jeu de dimensions évaluées |
| `ScientificQualification` | `core/scientific-qualification.js` | artefacts **sources** | qualification du processus | les préparations sont recalculées, pas lues |
| `ScientificUnifiedReport` | `core/scientific-unified-report.js` | rapport antérieur + qualification | rapport additif | un seul run, une seule mission ; jamais de réécriture |
| `FinalReportAcceptance` | `core/final-report-acceptance.js` | rapport **concret** + acte humain | acceptation validée | l'objet de l'acte est obligatoire |
| `DownstreamUseAuthorization` | `core/downstream-authorization.js` | qualification + sources + rapport + acceptation | autorisation générique | toutes les entrées sont revalidées ; aucun verdict réécrit |
| `CasePhaseAuthorization` | `adapters/case-phase-adapter.js` | autorisation générique + nom de phase | traduction de cas | le nom de phase est une donnée de l'appelant |

## Ce que la documentation promet et que le code tient

Un défaut central de la v0.2 était une documentation qui décrivait un composant
d'exécution **absent du lot**. Pour l'empêcher de se reproduire :

- `core/panel-gated-adapter.js` est importé par le test d'intégration livré
  (`test/test-mono10-v0.3-integration.js`, contrôle **I-05**), qui vérifie que le
  chemin résolu par `require` est bien celui du module du lot ;
- `T22` vérifie l'existence du fichier **et** l'export de `createPanelGatedAdapter` ;
- `MUT-D12` compare avec la v0.2, où ce fichier n'existe pas.

Si le module disparaissait ou changeait de contrat, trois contrôles tomberaient.

## Frontière générique

`HYG-01` scanne `core/` (commentaires retirés) et échoue si un terme de cas
d'application y apparaît. `HYG-02` est un témoin positif : il prouve que le
détecteur discrimine réellement au lieu de passer par construction.
