# MONO-10 v0.1 — Lignée

Chaque artefact MONO-10 référence par **identifiant + empreinte SHA-256** ce
qu'il qualifie. `assertBound` refuse toute référence sans empreinte valide :
aucune qualification scientifique non liée n'est possible.

```
CorpusSnapshot (EF-01F-v1, legacy)
  └─ ProfessionalDiscovery (EF-02A-v2)
       └─ ProfessionalVerification (EF-02B-v2)
            └─ ProfessionalCandidateAssessment (MONO-10-v1)
                 └─ ProfessionalPanelValidation (MONO-10-v1)   [ACTE HUMAIN]
                      └─ adaptateur à porte → ProfessionalCorpusSet (EF-02C-v2)
                           ├─ LlmCapability (MONO-10-v1)        [SONDE ACTIVE]
                           └─ ScientificReadiness phase=PRE
                                └─ DocumentaryTwinSet → ReviewSet → Aggregation → Stability
                                     └─ ScientificReadiness phase=FULL
                                          └─ ScientificQualification (MONO-10-v1)
                                               └─ ScientificUnifiedReport (MONO-10-v1)
                                                    │    ├─ référence UnifiedReportSummary (EF-04A-v1)
                                                    │    └─ legacyScientificValidity: false, reproduit
                                                    └─ FinalReportAcceptance   [ACTE HUMAIN, avant P0.2]
```

## Références obligatoires du `ScientificUnifiedReport`

`legacyReportReference`, `candidateAssessmentReference`,
`professionalPanelValidationReference`, `llmCapabilityReference`,
`readinessPreReference`, `readinessFullReference`,
`scientificQualificationReference` — toutes vérifiées par `T10-26b`.

## Preuve de non-mutation

`assertLegacyUntouched(report, legacyNow)` recalcule l'empreinte du rapport
legacy et la compare à celle enregistrée au moment du référencement. Toute
divergence lève `LEGACY_REPORT_MUTATED`.

## Rupture de lignée

Une référence sans `sha256` valide fait basculer la qualification en
`NOT_QUALIFIED` (`T10-19`) — jamais un avertissement silencieux.
