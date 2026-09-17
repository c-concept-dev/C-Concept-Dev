# MONO-10 v0.1 — Correspondance des contrats

## Artefacts produits

| Artefact | `schemaVersion` | Produit par | Consomme |
|---|---|---|---|
| `EvidenceForge.ProfessionalCandidateAssessment` | `MONO-10-v1` | `candidate-assessment.js` | `ProfessionalDiscovery/EF-02A-v2`, `ProfessionalVerification/EF-02B-v2` |
| `EvidenceForge.ProfessionalPanelValidation` | `MONO-10-v1` | acte humain, gabarit par `panel-gate.js` | `ProfessionalCandidateAssessment` |
| `EvidenceForge.LlmCapability` | `MONO-10-v1` | `llm-capability.js` | configuration + transport injecté |
| `EvidenceForge.ScientificReadiness` (`PRE`/`FULL`) | `MONO-10-v1` | `scientific-readiness.js` | tous les précédents |
| `EvidenceForge.ScientificQualification` | `MONO-10-v1` | `scientific-qualification.js` | readiness PRE + FULL |
| `EvidenceForge.ScientificUnifiedReport` | `MONO-10-v1` | `scientific-unified-report.js` | `UnifiedReportSummary/EF-04A-v1` + qualification |
| `EvidenceForge.FinalReportAcceptance` | `MONO-10-v1` | acte humain, gabarit par `final-report-acceptance.js` | `ScientificUnifiedReport` |

## Points d'injection utilisés — aucun contrat gelé modifié

| Mécanisme gelé | Usage par MONO-10 |
|---|---|
| `professionalPipelinePort` (MONO-01) | **non modifié** ; l'adaptateur composé s'injecte via `ctx.adapter` |
| `nodeRunners` EF-02A/B/C (MONO-02) | **non modifiés** ; ils appellent le port qui appelle l'adaptateur composé |
| MONO-09 v0.2 | **non modifié** ; `createPanelGatedAdapter(v02Adapter, …)` l'enveloppe |
| `dependenciesAvailable.llm` | **non modifié** ; classé `DECLARED`, sans force probante |
| `UnifiedReportSummary` EF-04A | **non muté** ; référencé par empreinte, drapeaux reproduits |

## Garanties anti-blanchiment

1. MONO-10 ne prétend jamais qu'un artefact legacy est devenu valide.
2. `legacyScientificValidity: false` est **reproduit** dans le nouveau rapport.
3. `qualificationStatus` porte sur le processus, pas sur un artefact ancien.
4. Aucune valeur legacy n'est lue puis réécrite — `assertLegacyUntouched` le prouve
   par comparaison d'empreinte.

Vérifiées par `T10-24`, `T10-25`, `T10-26`, `T10-H1`.

## Valeurs d'incertitude préservées

| Valeur | Où | Jamais |
|---|---|---|
| `DEFER` | décision de panel | converti automatiquement en `APPROVE` |
| `IDENTITY_AMBIGUOUS` | évaluation | approuvé |
| `NOT_ASSESSED` | dimension de readiness | dans un `qualificationStatus` final |
| `IMPOSSIBLE_TO_ASSESS` | qualification | traité comme un échec — c'est le défaut |
| `unknowns[]` | qualification, rapport | vidé silencieusement |
