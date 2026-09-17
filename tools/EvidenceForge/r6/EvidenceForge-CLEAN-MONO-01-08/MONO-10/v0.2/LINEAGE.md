# MONO-10 v0.2 — Lignée

Toute référence porte un `sha256` **canonique** — indépendant de l'ordre des
clés. `assertBound` refuse une référence sans empreinte ; `assertRefMatches`
recalcule et compare ; `assertLineageNonEmpty` refuse une lignée vide.

```
ProfessionalDiscovery / ProfessionalVerification   (amont, non modifiés)
  └─ ProfessionalCandidateAssessment
       │   unknowns : identité ambiguë (BLOCKING), base insuffisante (NON_BLOCKING),
       │              relation inconnue (NON_BLOCKING)
       └─ ProfessionalPanelValidation              [ACTE HUMAIN]
            │   missionBindingHash + candidateBindingHash par décision
            └─ adaptateur à porte → corpus professionnel
                 ├─ LlmCapability                  [SONDE ACTIVE]
                 └─ ScientificReadiness phase=PRE
                      └─ jumeaux → revues → agrégation
                           └─ ScientificReadiness phase=FULL
                                └─ ScientificQualification
                                     └─ ScientificUnifiedReport
                                          │    référence le rapport antérieur,
                                          │    reproduit ses drapeaux à l'identique
                                          ├─ FinalReportAcceptance   [ACTE HUMAIN]
                                          └─ DownstreamUseAuthorization
                                               └─ (optionnel, hors noyau)
                                                  CasePhaseAuthorization
```

## Propagation des inconnus

`propagate` fusionne sans perte ; `assertNoSilentLoss` lève
`UNKNOWN_SILENTLY_DROPPED` si un unknown `OPEN` amont disparaît sans transition.
Appelé à chaque étape : readiness `PRE`, readiness `FULL`, qualification, rapport.

## Rupture de lignée

Lignée vide → `NOT_READY` puis `NOT_QUALIFIED`. Référence non concordante →
`BINDING_MISMATCH`. Jamais un avertissement silencieux.
