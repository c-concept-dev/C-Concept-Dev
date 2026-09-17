# MONO-10 v0.4 — Cartographie des contrats

| Contrat | Module livré | Entrées exigées | Invariant non négociable |
|---|---|---|---|
| `TrustedRuntimeAttestation` | `core/trusted-runtime-authority.js` | ancrages configurés par l'exploitant | un ancrage vaut pour **un seul** mode ; aucune matière privée acceptée |
| `RunEvidenceManifest` | `core/run-evidence-manifest.js` | attestation **vérifiée** | le manifeste **reprend** son mode, il ne le déclare pas |
| `HumanAct` | `core/human-act.js` | mode d'exécution + mécanisme injecté | déclaration ≠ authenticité ; aucune signature inventée |
| `IdentityEvidence` → confiance | `core/identity-evidence.js` | registre d'autorités **extérieur** | l'indépendance se démontre ; inconnue, elle ne compte pas |
| Pertinence documentaire | `core/relevance.js` | oracle **injecté** | `OUT_OF_SCOPE` seulement sur avis explicite |
| `Unknown` | `core/unknowns.js` | registre d'artefacts | une preuve qui ne résout pas ne ferme rien |
| Lignée | `core/lineage.js` | registre + relation aval | arêtes **typées** ; inter-run interdit par défaut |
| `ProfessionalCandidateAssessment` | `core/candidate-assessment.js` | découverte, vérification, libellés | aucun statut ne vaut admission |
| `ProfessionalPanelValidation` | `core/panel-gate.js` | évaluation + décisions humaines | `evidenceRefs` hachées **des deux côtés** ; acte authentifié |
| `EffectiveCorpusEligibility` | `core/effective-eligibility.js` | statut amont, décision, authenticité | `DEFER`/`REJECT` n'ouvrent **jamais** le corpus |
| Porte d'exécution | `core/panel-gated-adapter.js` | adaptateur de base + porte validée | sans porte valide, aucun corpus |
| `LlmCapability` | `core/llm-capability.js` | transport **injecté** + run attesté | une sonde de test ne prouve pas une capacité de production |
| `ScientificReadiness` | `core/scientific-readiness.js` | artefacts sources + registre | une dimension sans source ne promeut aucune phase |
| `ScientificQualification` | `core/scientific-qualification.js` | artefacts **sources** | cohérence interne ≠ exécution authentifiée |
| `ScientificUnifiedReport` | `core/scientific-unified-report.js` | rapport antérieur + qualification | un seul run, une seule mission, une seule attestation |
| `FinalReportAcceptance` | `core/final-report-acceptance.js` | rapport **concret** | l'objet de l'acte est obligatoire |
| `DownstreamUseAuthorization` | `core/downstream-authorization.js` | qualification + sources + rapport + acceptation | revalidation **toujours** obligatoire ; motifs **dérivés** |
| `CasePhaseAuthorization` | `adapters/case-phase-adapter.js` | autorisation + nom de phase | le nom vient du cas, jamais du lot |

## Chaque phrase de la documentation correspond à un contrôle exécutable

L'audit A de v0.3 a relevé que `ARCHITECTURE.md` affirmait « revalide toutes ses
entrées » alors qu'une politique pouvait la désactiver. Correspondances v0.4 :

| Affirmation | Contrôle exécutable | Test |
|---|---|---|
| « la revalidation est toujours obligatoire » | `sanitizePolicy` supprime la surcharge et consigne le refus | T08, M08 |
| « aucun artefact n'affirme une vérification non faite » | motifs dérivés + garde-fou `FALSE_REVALIDATION_CLAIM` | T09, M09 |
| « les arêtes de lignée sont typées » | `EXPECTED_PARENTS` + contrôle de relation | T15, M15 |
| « une chaîne cohérente n'est pas une preuve de production » | `evidenceClass` + `NOT_QUALIFIED` en production non attestée | T06, M06 |
| « aucune matière privée dans le paquet » | scan du paquet + témoin positif | HYG-03, HYG-03b |
| « l'adaptateur livré est celui qu'exerce la chaîne » | `require.resolve` comparé au chemin du lot | HYG-04, I-03 |
