# MONO-11 v0.4 — Autonomous Panel Successor (TARGETED REPAIR LINEAGE PRESERVATION — contrat MONO-11-v3)

> **Statut : chantier v0.4 — GELABLE proposé, NON GELÉ, NON INTÉGRÉ au monolithe.** Successeur de v0.3-r1 (inchangé, zip `3c44b397…`), lignée v0.3 / v0.2 gelés. Périmètre : `core/review-enforcer.js` (réparation ciblée, passe ≥ 2) + `contracts/mono11-contracts.json` (v3) + `benchmark/replay.js` + tests. Décisions propriétaire 2026-09-22 (Q1 OPTION A, Q2 v0.4, Q3 MONO-11-v3, Q6 `[]` jamais un succès silencieux).

## Ce que garantit v0.4 (LINEAGE_MONOTONICITY_DURING_REPAIR)
Pour toute dimension soumise à une réparation ciblée : `FINAL = stableDedup(VALID_ORIGINAL ++ VALID_REPAIR)` — **P1** `FINAL ⊇ VALID_ORIGINAL` · **P2** `FINAL ⊆ RAW ∪ REPAIR` · **P3** tout `FINAL` est littéral · **P4** ordre brut puis modèle · **P5** dédup stable · **P6** aucun autre champ touché. Une référence originale déjà littérale n'est jamais rejetée, jamais interdite au modèle, toujours présentée comme **conservée** ; le modèle n'a pas à la réémettre. `[]` : légitime si le brut était vide (CAS A) ou si des conservées existent ; sinon `REFS_PRESENT_BUT_UNRESOLVED` (refs invalides conservées dans le candidat, politique bornée puis fail-closed — jamais un `[]` silencieux, aucune citation inventée). Voir `CHANGELOG-v0.3-r1-to-v0.4.md`.

## Exécution (mode documenté)

```
EVIDENCEFORGE_BUNDLE_ROOT=<racine du kit> node --test test/test-mono11-v0.4.js     # 83 tests (69 v0.3-r1 + TR-1..TR-14)
node benchmark/replay.js                                                              # rejeu hors ligne (0 appel)
node tools/anti-hardcoding-scan.js ; node tools/seal.js ; node tools/build-manifest.js
```

---

# MONO-11 v0.3-r1 — Autonomous Panel Successor (retry ciblé + REPAIR REUSE = SAME SEMANTIC CONTEXT ONLY)

> **Statut : micro-correctif pré-gel v0.3-r1 — GELABLE proposé, NON GELÉ, NON INTÉGRÉ au monolithe.** Successeur de v0.3 (inchangé, zip `bec55841…758d`), lignée v0.2 (gelé, zip `5c208cbb…0005`). Périmètre : `core/review-enforcer.js` (empreinte de contexte de réparation), `benchmark/replay.js` (mesure des collisions), tests, `test/fixtures/v0.2-reference.json` (autonomie du package), manifeste, documentation. Voir `CROSS-TWIN-REUSE-AUDIT.md`, `CHANGELOG-v0.3-to-v0.3-r1.md`, `TEST-REPORT-v0.3-r1.md`, `P2-CLOSURE.md`.

## Ce que corrige v0.3-r1

1. **Collision de reuse inter-jumeaux (audit v0.3 P2-07) — reproduite, puis éliminée.** La politique de reuse (`core/llm-response-reuse.js`, clé = octets du prompt, inchangée) pouvait servir à un jumeau B la réparation VALID d'un jumeau A (même document, même dimension, même citation fautive) : littérale, mais issue d'un autre constat. Le prompt ciblé porte désormais une ligne `CONTEXTE DE REPARATION` avec une **empreinte déterministe** (`repairContext`) : jumeau, professionnel, cible, sha256 du document, sha256 du constat réparé par dimension (toutes les clés du constat sauf `targetEvidenceRefs`). Aucune donnée aléatoire, aucun horodatage, aucun nonce, aucun `runId` : même contexte ⇒ même empreinte ⇒ reuse conservé (y compris après STOP/reprise) ; contexte différent ⇒ prompt différent ⇒ appel réel. La tâche demandée au LLM est inchangée (identification seule).
2. **Package auto-suffisant (P2-02) — option A.** Les invariants « byte-identique à v0.2 » sont vérifiés contre `test/fixtures/v0.2-reference.json` (SHA-256 des sources de `validateReviewCandidate`, `informedRepairPrompt`, `enforcementPreamble`, `extractJson` du lot v0.2 gelé) ; le lot v0.2 n'est plus requis. Si `../../v0.2` est présent, la comparaison vivante est faite en plus.
3. **P2 documentaires (P2-01, P2-04)** : provenance des jetons de cas consignée dans le manifeste ; décomptes du benchmark corrigés ; patchs régénérés après scellement.

## Exécution (mode documenté)

```
# depuis le dossier du lot, avec les lots gelés MONO-10 v0.19 / MONO-09 v0.2 / MONO-01 accessibles :
EVIDENCEFORGE_BUNDLE_ROOT=<racine du kit> node --test test/test-mono11-v0.3-r1.js     # 69 tests
node benchmark/replay.js                                                                 # rejeu hors ligne (0 appel)
EVIDENCEFORGE_CASE_ARTIFACTS=<a.json>:<b.json> node tools/anti-hardcoding-scan.js       # jetons de cas (optionnel)
```
Dépendance d'exécution : les lots gelés composés (MONO-10, MONO-09, MONO-01) via `EVIDENCEFORGE_BUNDLE_ROOT` — comme en v0.2/v0.3. Le lot MONO-11 v0.2 n'est **pas** une dépendance.

## Matrice des invariants (v0.3-r1)

| Invariant | Garantie | Preuve |
|---|---|---|
| R1 reuse = même contexte sémantique seulement | empreinte de contexte dans le prompt ciblé ; `REPAIR_CONTEXT_REQUIRED` sinon | r1-T2, r1-T3, r1-T5 |
| R2 same-context reuse préservé | même contexte ⇒ même prompt ⇒ `REUSE_VALID` | r1-T1, r1-T4 |
| R3 STOP/reprise déterministe | empreinte sans horodatage/nonce/runId | r1-T4, r1-T5 |
| R4 validateur / contrat / fail-closed / maxPasses / stratégies inchangés | référence v0.2 ; `DEFAULT_MAX_PASSES = 3` | r1-T10, T9, T12 |
| R5 historique intact | 11 fixtures : mêmes verdicts, 0 fausse acceptation, 0 régression, 0 collision | r1-T6, r1-T7, r1-T8, R3 |

---

# MONO-11 v0.3 — Autonomous Panel Successor (retry ciblé TARGET_REF_NOT_LITERAL)

> **Statut : chantier v0.3 — GELABLE proposé, NON GELÉ, NON INTÉGRÉ au monolithe.** Successeur de v0.2 (gelé, zip `5c208cbb…0005`, sceau `57e243b7…9df3`). Périmètre : `core/review-enforcer.js` (politique de reprise des revues) + tests + fixtures de benchmark + documentation. Voir `CHANGELOG-v0.2-to-v0.3.md`, `TEST-REPORT.md`, `RETRY-BENCHMARK.md`, `DIFFERENTIAL-REPORT-v0.2-v0.3.md`.

## Matrice des invariants (chantier v0.3)

| Invariant | Garantie | Preuve |
|---|---|---|
| I1 littéralité stricte | `content.indexOf(ref)` inchangé ; aucune substitution/fuzzy/paraphrase | T9, R3 (0 fausse acceptation) |
| I2 validateur inchangé | `validateReviewCandidate` byte-identique v0.2 | T9 (`toString()` égal) |
| I3 fail-closed | revue `error` sans correction valide | T7, T8, R1 |
| I4 pas d'autorité sémantique locale | `literalFragments` = feedback seulement | T3 |
| I5 réponse valide préservée | recomposition champ par champ | T10 |
| I6 passes bornées | `DEFAULT_MAX_PASSES` inchangé, jamais augmenté | T7 (maxPasses 5 ⇒ 3 appels) |
| I7 pas de 3e appel identique | `EXACT_RETRY_REPEAT` ⇒ stratégie différente ou fail-closed | T5, T6, T7, R1 |
| I8 lignée complète | champs par passe | T11 |
| I9 compatibilité des sorties | schémas EF-03B-v1 inchangés, ajouts additifs | 44 tests v0.2 PASS, R3 |

---

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
