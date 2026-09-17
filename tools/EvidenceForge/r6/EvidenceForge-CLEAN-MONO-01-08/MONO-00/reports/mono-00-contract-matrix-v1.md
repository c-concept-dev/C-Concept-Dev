# EF — Matrice de contrats (MONO-00)

**Corrigée après audit indépendant (corrections 1, 2 et 3)** — voir `dependencyNote`/`externalDependencies` sur EF-ORCH, EF-02A, EF-03-TargetDocumentSet et EF-03B.

| module | consumes | produces | schema version | dependency | sync/async | LLM | Worker/API | persistence | resume |
|---|---|---|---|---|---|---|---|---|---|
| EF-ORCH | RunContract | CorpusSnapshot (via EF-01A..F) | EF-01A-v1..EF-01F-v1 | aucune (racine du pipeline) | async (stages externes non déterministes en C1/C2) | INDIRECT_UPSTREAM | OpenAlex/Crossref/PubMed (connecteurs DIRECTS EF-01C2, runners dédiés) | IndexedDB (resume_checkpoint contractuel) | True |
| EF-PR-GEN-01 | — | MissionDimensionSet/EF-PR-GEN-v1<br>MissionDocumentMapping<br>HeuristicPolicy/EF-PR-GEN-v1 | EF-PR-GEN-v1 | ef-orch-hash-v0.1.js | async (hash canonique) | False | — | aucune | N/A |
| EF-02A | CorpusSnapshot (issu d'EF-ORCH/EF-01F)<br>MissionDimensionSet/EF-PR-GEN-v1 | ProfessionalDiscovery/EF-02A-v2 | EF-02A-v2 | EF-ORCH (CorpusSnapshot), EF-PR-GEN-01 (MissionDimensionSet) | async | True | clone-proxy + openalex-proxy (Cloudflare Worker) | aucune | False |
| EF-02B | ProfessionalDiscovery/EF-02A-v2 | ProfessionalVerification/EF-02B-v2 | EF-02B-v2 | EF-02A | async | False | openalex-proxy | aucune | False |
| EF-02C | ProfessionalVerification/EF-02B-v2 | ProfessionalCorpusSet/EF-02C-v2 | EF-02C-v2 | EF-02B | async | False | openalex-proxy (apiKeyExposedToBrowser=false) | aucune | True |
| EF-02D | ProfessionalCorpusSet/EF-02C-v2<br>MissionDimensionSet/EF-PR-GEN-v1<br>HeuristicPolicy/EF-PR-GEN-v1 | DocumentaryEligibilityRelevanceSet/EF-02D-v2<br>CoverageMatrix/EF-02D3-v4<br>PanelSelection/EF-02D3-PANEL-v4 | EF-02D-v2 / EF-02D3-v4 / EF-02D3-PANEL-v4 | EF-02C, EF-PR-GEN-01 | async (D2/D3 LLM injecté) | True | — | aucune | True |
| EF-02E | ProfessionalCorpusSet/EF-02C-v2<br>DocumentaryEligibilityRelevanceSet/EF-02D-v2<br>CoverageMatrix/EF-02D3-v4<br>PanelSelection/EF-02D3-PANEL-v4<br>MissionDimensionSet/EF-PR-GEN-v1<br>ExclusionRegistrySet/EF-GOV-REG-v1 | DocumentaryTwinSet/EF-02E-v2<br>ExclusionRegistrySet/EF-GOV-REG-v1 | EF-02E-v2 / EF-GOV-REG-v1 | EF-02D, EF-PR-GEN-01 | async (hash uniquement, pas de LLM) | False | — | aucune | N/A (déterministe, pas de reprise partielle) |
| EF-03A | DocumentaryTwinSet/EF-02E-v2<br>MissionDimensionSet/EF-PR-GEN-v1 | ReviewSchema/EF-03A-v1 | EF-03A-v1 | EF-02E, EF-PR-GEN-01 | async (hash) | False | — | aucune | N/A |
| EF-03-TargetDocumentSet | MissionDocumentMapping (résolution reviewTarget->document réel, en amont de la construction) | TargetDocumentSet/EF-03-DOC-v1 | EF-03-DOC-v1 | ef-orch-hash-v0.1.js, MissionDocumentMapping (EF-PR-GEN-01) | async (hash) | False | — | aucune | N/A |
| EF-03B | ReviewSchema/EF-03A-v1<br>DocumentaryTwinSet/EF-02E-v2<br>MissionDocumentMapping (indirectement, via la construction du TargetDocumentSet — voir note)<br>TargetDocumentSet/EF-03-DOC-v1 | DocumentaryReviewSet/EF-03B-v1 | EF-03B-v1 | EF-03A, EF-03-TargetDocumentSet (elle-même dépendante de MissionDocumentMapping), EF-02E | async | True | — | aucune | True |
| EF-03C | DocumentaryReviewSet/EF-03B-v1 | AggregatedDocumentaryReview/EF-03C-v1 | EF-03C-v1 | EF-03B | async | optionnel (classification convergence/divergence uniquement) | — | aucune | N/A (recalcul complet, pur) |
| EF-03D | DocumentaryReviewSet/EF-03B-v1<br>AggregatedDocumentaryReview/EF-03C-v1 | StabilityContradictionAnalysis/EF-03D-v1 | EF-03D-v1 | EF-03B, EF-03C | sync (entièrement déterministe) | False | — | aucune | N/A |
| EF-04 (Lineage Guard) | ReviewSchema/EF-03A-v1<br>TargetDocumentSet/EF-03-DOC-v1<br>DocumentaryTwinSet/EF-02E-v2<br>DocumentaryReviewSet/EF-03B-v1<br>AggregatedDocumentaryReview/EF-03C-v1<br>StabilityContradictionAnalysis/EF-03D-v1 | lineage assertion result + lineageFingerprint (interne, pas un schéma de sortie public) | N/A (fonction de garde) | EF-03A/B/C/D, EF-02E | async (hash) | False | — | aucune | N/A (FAIL-CLOSED) |
| EF-04A (UnifiedReportSummary) | tous les objets ci-dessus, via Lineage Guard PASS | UnifiedReportSummary/EF-04A-v1 | EF-04A-v1 | EF-04 Lineage Guard, EF-03A/B/C/D, EF-02E | async | False | — | aucune | N/A |

## Dépendances externes détaillées (externalDependencies)

**EF-ORCH** :
- LLM (INDIRECT/AMONT — EF-01B et EF-01C1 consomment des artefacts produits par une planification LLM EXTÉRIEURE au stage orchestré ; AUCUN appel LLM direct trouvé dans le code exécuteur gelé, confirmé par grep ; décision architecturale explicite documentée dans le code)
- OpenAlex (DIRECT — EF-01C2, ef-orch-ef01c2-runner-openalex-v0.1.js)
- Crossref (DIRECT — EF-01C2, ef-orch-ef01c2-runner-crossref-v0.1.js)
- PubMed (DIRECT — EF-01C2, ef-orch-ef01c2-runner-pubmed-v0.1.js)

**EF-02A** :
- LLM (DIRECT — via clone-proxy Worker)
- OpenAlex (DIRECT — via openalex-proxy Worker)

**EF-02B** :
- OpenAlex (DIRECT — via openalex-proxy Worker)

**EF-02C** :
- OpenAlex (DIRECT — via openalex-proxy Worker, apiKeyExposedToBrowser=false)

**EF-02D** :
- LLM (DIRECT — workerCallFn injecté, D2/D3)

**EF-03B** :
- LLM (DIRECT — workerCallFn obligatoire, un appel par twin×target)

**EF-03C** :
- LLM (OPTIONNEL — classification convergence/divergence seulement, jamais requis pour le dénombrement/provenance)


## Notes de correction (audit indépendant)

**EF-ORCH** : CORRIGÉ (audit indépendant, correction 3) : llm=false était inexact. Vérifié par grep direct dans le code gelé — voir externalDependencies pour la distinction directe/indirecte, jamais un simple true qui surstatuerait ce que l'exécuteur fait réellement au runtime.

**EF-02A** : CORRIGÉ après audit indépendant (v1 omettait le raccord CorpusSnapshot->EF-02A pourtant explicite dans la chaîne minimale auditée, CDC MONO-00 section 9).

**EF-03-TargetDocumentSet** : CORRIGÉ après audit indépendant. C'est ICI, à la construction du TargetDocumentSet, que MissionDocumentMapping intervient réellement — jamais comme paramètre direct de EF-03B lui-même (voir note EF-03B ci-dessous).

**EF-03B** : CORRIGÉ après audit indépendant : v1 omettait MissionDocumentMapping. PRÉCISION IMPORTANTE, jamais glissée sous le tapis : dans le code GELÉ d'EF-03B (EF-03-v1), la fonction buildDocumentaryReviewSet() prend targetDocumentSet DÉJÀ RÉSOLU comme paramètre direct — elle n'appelle jamais elle-même resolveDocumentSlots(). La dépendance à MissionDocumentMapping est donc ARCHITECTURALE (elle intervient dans la construction du TargetDocumentSet, en amont, avant l'appel à EF-03B), jamais un paramètre direct de la fonction gelée elle-même. Aucun lot gelé n'a été modifié pour produire cette correction — seule la représentation de la chaîne dans le registre MONO-00 est corrigée.


## Chaîne minimale (bout en bout) — désormais réellement complète dans la matrice ci-dessus

```
CorpusSnapshot -> ProfessionalDiscovery -> ProfessionalVerification -> ProfessionalCorpusSet
-> DocumentaryEligibilityRelevanceSet -> CoverageMatrix + PanelSelection -> DocumentaryTwinSet
-> ReviewSchema -> (MissionDocumentMapping -> TargetDocumentSet) -> DocumentaryReviewSet
-> AggregatedDocumentaryReview -> StabilityContradictionAnalysis -> UnifiedReportSummary
```

Chaque frontière de schéma/version est vérifiée fail-fast par le module consommateur.