# EvidenceForge — MONO-11 v0.2 — Autonomous Panel Successor (correctif minimal post-audit)

**Statut :** IMPLÉMENTÉ / TESTÉ — verdict technique proposé dans `MANIFEST.json` ; **non gelé**. Successeur additif de v0.1 (intact, `ba9dd877…`) ; voir `MIGRATION-v0.1-v0.2.md`.
**Charte :** v2 (`governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE-v2.md`) ; la v1 est conservée intacte (copie historique, même SHA-256 que dans MONO-10 v0.19).
**Fondement :** `EVIDENCEFORGE-AUTONOMOUS-PANEL-GAP-ANALYSIS.md` (SHA-256 `ce9407a3…09b0`).

## Ce que fait le lot

Il remplace, dans le chemin nominal, la **porte humaine obligatoire** du panel (MONO-10 v0.19) par un **Machine Evidence Gate** fondé sur preuves, et compose les lots gelés sans les modifier :

| Brique MONO-11 | Compose | Rôle |
|---|---|---|
| `core/frozen-bridge.js` | MONO-10 v0.19, MONO-09 v0.2, MONO-01 | charge les lots gelés **après vérification de leur sceau** ; un lot altéré n'est pas composé |
| `core/corpus-sufficiency-probe.js` | EF-02D1 (MONO-01), politique contractuelle | attribution réelle des œuvres, contradictions d'identité, volume selon `contracts/mono11-contracts.json`, diversité observée |
| `core/semantic-relevance-oracle.js` | EF-02D2 (MONO-01) + LLM réel injecté | pertinence candidat ↔ mission sur le **corpus attribué**, par dimension, preuves citées exactement, trace de chaque appel |
| `core/machine-evidence-gate.js` | contrats G-1…G-11 | décision machine : `AUTO_APPROVED_FOR_DOCUMENTARY_PANEL / AUTO_REJECTED / AUTO_DEFERRED / AMBIGUOUS / INSUFFICIENT_DOCUMENTARY_BASIS`, acteur `machine` |
| `core/autonomous-panel-adapter.js` | `panel-gate.js` (MONO-10) pour l'override humain | admission au corpus ; override humain **optionnel**, authentifié par MONO-10, jamais fabriqué |
| `core/composed-qualification.js` | `llm-capability.js`, `unknowns.js`, registre (MONO-10) | readiness PRE/FULL et qualification du processus avec réserve machine obligatoire |
| `core/mono11-ledger.js` | `run-evidence-manifest.js`, `canonical.js` (MONO-10) | lignée append-only des artefacts MONO-11, ancrée au run attesté MONO-10 |
| `core/autonomous-run.js` | EF-02E, EF-03A/C (MONO-01), MONO-09 identifier policy | orchestration par injection : corpus → suffisance → pertinence → gate → normalisation cible → couverture → jumeaux → revues → agrégation |
| `core/target-normalizer.js` (v0.2) | EF-03 gelé (aval) | normalisation canonique du document cible à l'ingestion, original/normalisé hachés |
| `core/review-enforcer.js` (v0.2) | EF-03B gelé (prompt + validateur final) | schéma fermé local + reprise informée avant EF-03B |
| `core/coverage-enforcer.js` (v0.2) | EF-02D3 gelé (prompt + validateur final) | résolution des références d'œuvres (un thème n'est pas une œuvre) + reprise informée |
| `core/run-seal-guard.js` (v0.2) | — | refuse tout run sur code non scellé ; hashes du sceau/code/manifeste/zip |
| `core/llm-response-reuse.js` (v0.2) | — | politique de réutilisation par réponse validée ; reuse ≠ appel réel |

## Ce qu'il ne fait pas

- il ne modifie, ne copie, ne repackage aucun lot gelé (`test/test-mono11-v0.2.js` T19–T20 : sceaux 0 divergence, zip MONO-10 `f5a41654…`) ;
- il ne simule aucun acte humain : un acte machine porte `actorType: "machine"` ; `human-act.js` (gelé) le refuse (T17) ;
- il n'admet jamais sur ORCID seul, overlap lexical seul, citations, quota ou nombre fixe (T09, T10, T13, T14) ;
- il ne contient aucun métier, discipline, expert, panel, cas d'usage (`tools/anti-hardcoding-scan.js`, T10, T10b) ;
- il ne décide pas P0.2 ; il ne déclare pas le lot gelé.

## Entrées / sorties

Entrées : `ProfessionalCandidateAssessment` (MONO-10), `ProfessionalDiscovery` / `ProfessionalVerification` (MONO-09), `MissionDimensionSet` (EF-PR-GEN-v1), dépendances réelles injectées (`fetchAuthorWorks`, `attributionFor`, `llmCall`), documents cibles.
Sorties : `CorpusSufficiencyEvidence`, `RelevanceEvidence`, `MachineEvidenceGateDecision[]` / `MachineEvidenceGatePanel`, `PanelSelection` (forme EF-02D3-PANEL-v4 sans quota), `DocumentaryTwinSet` (EF-02E-v2), `DocumentaryReviewSet` (EF-03B-v1), `AggregatedDocumentaryReview` (EF-03C-v1), `Mono11Readiness`, `ScientificQualification` (états MONO-10), `Mono11LineageLedger`.

## Exécuter

```bash
export EVIDENCEFORGE_BUNDLE_ROOT=/chemin/vers/EvidenceForge-CLEAN-MONO-01-08
node --test test/test-mono11-v0.2.js           # 44 tests : T01–T30 hérités, T31–T42 v0.2 (normalisation, enforcement, sceau, reuse, garde 100 %)
node tools/anti-hardcoding-scan.js             # EVIDENCEFORGE_CASE_ARTIFACTS=<panel.json>:<discovery.json> pour les jetons de cas
node tools/seal.js                             # SHA256SUMS.txt
```

Le run réel P0.1 phase 2 (rerun v0.2) vit hors du lot (`~/evidenceforge-work/scripts/23-run-real-p01-phase2-v02.js`, premier `require` = garde de sceau) : le lot ne connaît ni la mission, ni les 48 candidats, ni OpenAlex, ni le Worker LLM — ce sont des dépendances de l'exploitant.
