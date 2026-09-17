# MONO-10 v0.3 — Lignée

## 1. Principe

> **Chaque conclusion doit conserver un lineage résolu.**

Une référence de lignée n'est pas un champ décoratif. En v0.2, `assertLineageNonEmpty`
se contentait de vérifier la forme : une empreinte `000…0` pointant vers rien
passait. En v0.3, une référence ne vaut que si elle **résout** contre un registre
des artefacts réellement disponibles.

## 2. Forme d'une référence

```
ArtifactRef {
  artifactId    identifiant dans le registre
  artifactType  schéma attendu
  schemaVersion
  sha256        empreinte canonique de l'artefact, calculée HORS runBinding
  runId         run auquel l'artefact est lié, si connu
}
```

L'empreinte exclut `runBinding` : sans cela, lier un artefact à un run
changerait son empreinte et casserait toutes les références déjà émises.

## 3. Quatre contrôles à la résolution

`resolveLineage(refs, registry, opts)` vérifie, pour chaque référence :

1. **existence** — `artifactId` est présent dans le registre ;
2. **intégrité** — l'empreinte correspond à l'artefact enregistré ;
3. **type** — le schéma attendu est celui du registre ;
4. **complétude** — toutes les relations exigées (`requiredRelations`) sont couvertes.

Un seul échec ⇒ `resolved: false`, et `assertLineageResolved` lève
`LINEAGE_UNRESOLVED`. Une liste vide est toujours refusée.

## 4. Chaîne complète d'un run

```
ProfessionalDiscovery ──┐
                        ├─→ ProfessionalCandidateAssessment ──→ ProfessionalPanelValidation
ProfessionalVerification┘                    │                            │
                                             │                            ▼
                                             │                 EffectiveCorpusEligibility
                                             │                            │
                                             │                            ▼
                                             │                   [panel-gated-adapter]
                                             │                            │
                                             │                            ▼
                                             │                 ProfessionalCorpusSet
                                             │                            │
LlmCapability ───────────────────────────────┤                            ▼
                                             │                  DocumentaryTwinSet
                                             ▼                            │
                                   ScientificReadiness/PRE                ▼
                                             │                       ReviewSet
                                             │                            │
                                             │                            ▼
                                             │                      Aggregation
                                             │                            │
                                             └──────────┬─────────────────┘
                                                        ▼
                                          ScientificReadiness/FULL
                                                        │
                                                        ▼
                                             ScientificQualification
                                                        │
                                                        ▼
                                           ScientificUnifiedReport ──→ FinalReportAcceptance
                                                        │                        │
                                                        └────────┬───────────────┘
                                                                 ▼
                                                  DownstreamUseAuthorization
                                                                 │
                                                                 ▼
                                                   [adapters/case-phase-adapter]
```

Chaque flèche est une référence **résolue**, pas une convention de nommage.

## 5. Liaison au run

Parallèlement à la lignée, chaque artefact porte un `runBinding` délivré par le
`RunEvidenceManifest` :

```
runBinding {
  runId, manifestHash, artifactId,
  artifactHash  = sha256(artefact hors runBinding)
  crossHash     = sha256(manifestHash, runId, artifactId, artifactHash)
}
```

Le manifeste enregistre l'entrée symétrique. Un artefact ne peut donc pas se
donner ce champ à lui-même, et toute modification postérieure à la liaison casse
`artifactHash` — c'est ce qui rend le réétiquetage détectable.

## 6. Inconnus : une lignée d'événements

Un `Unknown` porte sa propre chaîne. `genesisHash` scelle son origine ; chaque
transition référence l'événement précédent par `previousEventHash` et son propre
`transitionId` est l'empreinte de l'événement complet. Deux chaînes divergentes
pour un même identifiant sont un **fork**, détecté à la fusion.

Aucun inconnu ouvert ne disparaît : `assertNoSilentLoss` est appelé à chaque
étape de propagation, et lève `UNKNOWN_SILENTLY_DROPPED` sinon.
