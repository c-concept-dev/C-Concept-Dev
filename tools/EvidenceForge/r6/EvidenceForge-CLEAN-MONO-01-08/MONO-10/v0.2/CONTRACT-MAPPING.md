# MONO-10 v0.2 — Contrats

## Artefacts du noyau

| Artefact | Version | Module |
|---|---|---|
| `EvidenceForge.ProfessionalCandidateAssessment` | `MONO-10-v2` | `core/candidate-assessment.js` |
| `EvidenceForge.ProfessionalPanelValidation` | `MONO-10-v2` | acte humain, gabarit par `core/panel-gate.js` |
| `EvidenceForge.LlmCapability` | `MONO-10-v2` | `core/llm-capability.js` |
| `EvidenceForge.ScientificReadiness` (`PRE`/`FULL`) | `MONO-10-v2` | `core/scientific-readiness.js` |
| `EvidenceForge.ScientificQualification` | `MONO-10-v2` | `core/scientific-qualification.js` |
| `EvidenceForge.ScientificUnifiedReport` | `MONO-10-v2` | `core/scientific-unified-report.js` |
| `EvidenceForge.FinalReportAcceptance` | `MONO-10-v2` | acte humain, gabarit par `core/final-report-acceptance.js` |
| `EvidenceForge.DownstreamUseAuthorization` | `MONO-10-v2` | `core/downstream-authorization.js` |

## Artefact d'adaptateur — hors noyau

| Artefact | Version | Module |
|---|---|---|
| `EvidenceForge.CasePhaseAuthorization` | `MONO-10-v2-adapter` | `adapters/case-phase-adapter.js` |

Le nom de la phase aval est une **donnée d'appel**, jamais une constante du lot.

## Points d'injection — aucun contrat gelé modifié

| Mécanisme gelé | Usage |
|---|---|
| `professionalPipelinePort` (MONO-01) | non modifié ; adaptateur composé via `ctx.adapter` |
| `nodeRunners` EF-02A/B/C (MONO-02) | non modifiés |
| MONO-09 v0.2 | non modifié ; composé, jamais remplacé |
| `dependenciesAvailable.llm` | non modifié ; classé `DECLARED`, sans force probante |
| Rapport antérieur EF-04A | non muté ; référencé par empreinte, drapeaux reproduits |

## Valeurs d'incertitude

| Valeur | Autorisée | Jamais |
|---|---|---|
| `DEFER` | décision de panel | convertie automatiquement |
| `AMBIGUOUS` | confiance d'identité, pertinence | approuvée |
| `UNKNOWN` | pertinence | présumée hors champ |
| `NOT_ASSESSED` | dimension de readiness, statut bloquant | dans une qualification finale |
| `IMPOSSIBLE_TO_ASSESS` | qualification | traitée comme un échec — c'est le défaut |
| `DEFERRED` | autorisation aval | confondue avec un refus |
