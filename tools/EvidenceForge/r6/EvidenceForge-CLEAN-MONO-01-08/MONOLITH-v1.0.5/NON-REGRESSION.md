# NON-REGRESSION — MONOLITH v1.0

Le monolithe **compose** ; il ne réécrit rien. Ce document liste, brique par brique, ce qui est consommé tel quel, ce qui est ajouté (additif), et la preuve que le comportement des lots gelés est conservé.

## 1. Lots gelés consommés sans modification (intégrité : `FROZEN-INTEGRITY.md`)

| Brique | Consommée par | Contrat conservé | Preuve |
|---|---|---|---|
| EF-01B v0.2-r2 résolveur, EF-01C1 v0.2-r2 planificateur | `lib/stage-ef01.js` via `vendor/operator-kit-r1.3/run-resolver-core.js`, `run-planner-core.js` (copies octet-à-octet) | JSON strict, `LLM_REAL_MODEL` explicite (EF-01C1 refuse sinon), provenance hashée | run réel `efm-20260914-8beea006` : résolveur modèle observé `claude-opus-4-8`, 7 disciplines, planificateur 7 requêtes ; run `efm-20260914-5e9e749a` FAILED `REAL_MODEL_NOT_EXPLICIT` = le garde gelé fonctionne |
| RunContract automatique r1.3 (`derive-auto-included-discipline-ids`, `build-runcontract-draft-core`, `confirmRunContract` MONO-01) | `stage-ef01.runDisciplines` | politique `AUTO_RETAIN_VALID_PROPOSALS`, commentaire constant, ambiguïté bloquante ⇒ arrêt, aucune attribution humaine (`decidedBy` interdit) | test E2 ; `assertNoHumanAttribution` |
| SearchProtocol r1.3 (`build-searchprotocol-core`), provenance (`build-eforch-provenance`) | `stage-ef01.confirmPlan` | `HumanSearchProtocolValidation` réelle (nom saisi, `decision: approved`) | test E1 (identité absente ⇒ refus) |
| MONO-08 v0.8 `prepare-existing-artifacts` (+ v0.6 `eforch-artifacts`, `real-screening-workflow`) | `stage-retrieval.prepareRetrieval` | artefacts existants jamais reconstruits, runner équitable `memoizedFairRunner` exigé, `buildRetrievalSnapshot` + `verifySnapshotIntegrity(deps, snapshot)` (signature gelée) | code identique au script d'exploitation 15 ; garde `RUNNER_NOT_FAIR` |
| MONO-08 v0.6 POST_RETRIEVAL_GATE (`validatePostRetrievalAuditDecisions`), `resumeRealScreening`, MONO-07 `driveRun`, MONO-05 `listArtifacts/getArtifact` | `stage-retrieval.buildCorpusFromDecisions` | `acteur:"human"` + identité + justification + date sur chaque décision, exhaustivité, liaison `snapshotId/snapshotHash/missionId`, connecteurs de rejeu purs (aucun retrieval rejoué), graphe arrêté avant EF-PR-GEN-01, `workerCallFn` compteur = 0 | tests R1–R3 ; **exercice CORPUS** avec le snapshot v0.8 réel + les 88 décisions humaines réelles du propriétaire : CorpusSnapshot 88 sources, 22 inclus / 63 exclu / 3 doublon, statuts, `protocolRef` et `targetDocumentsRef` **identiques** au CorpusSnapshot canonique de P0.1, 0 invocation LLM |
| MONO-09 v0.2 `createProfessionalPipelineAdapter` + `identifier-policy` | `stage-professionals.discoverProfessionals` | dépendances réelles injectées (identité lue sur l'œuvre-source, expansion par œuvres liées), jamais complétées | code identique au script 19 |
| MONO-10 v0.19 (frontière PRODUCTION, `openRunEvidenceManifest`, registre authentifié, `upstream-evidence-binder`, `assessCandidates`, `runLlmProbe`/`certifyLlmCapability`, `panel-gate` pour un éventuel override humain) | `stage-professionals.runPanelAndDownstream` | registre d'acteurs **vide** (aucune validation humaine possible ni simulée), racines de provenance = œuvres incluses + identifiants auteurs OpenAlex, attestation 8 h (choix d'exploitation consigné), sonde réelle via `lib/llm-transport.js` (contrat `probe()`) | tests I3/I4 ; exercice DOWNSTREAM (ci-dessous) : évaluation MONO-10 recalculée, chaînes MONO-10/MONO-11 valides |
| MONO-11 v0.2 GELÉ (`run-seal-guard` premier appel, `frozenBridge.loadFrozen`, `autonomousRun.runAutonomousPanel/runDownstream`, `composedQualification`, `ledger`, `llm-response-reuse`, `target-normalizer`, enforcers) | `stage-professionals`, `lib/llm.js` | sceau vérifié avant `require`, zip canonique = config ; `reviewCompletenessRule` inchangée (`reviews_complete = 100 %` reste la règle du lot) ; politique de réutilisation gelée (REUSE_VALID / RETRY_REAL / REAL_CALL) | **exercice DOWNSTREAM** avec les entrées réelles de P0.1 : panel machine **36 / 9 / 50 / 0 / 12 = identique à P0.1 seal B** ; voir `FUNCTIONAL-TEST-REPORT.md` pour revues / qualification |
| EF-02D1/D2/D3, EF-02E, EF-03 TDS/A/B/C, EF-PR-GEN (MONO-01) | via MONO-11 (inchangé) | — | idem |

## 2. Adaptateurs additifs (nouveaux, hors des lots, testés)

| Adaptateur | Rôle | Contrat explicite | Test |
|---|---|---|---|
| `lib/mono04-fence-adapter.js` | retire une clôture Markdown ```json``` **si et seulement si** l'intérieur est un JSON valide, au-dessus du gateway MONO-04 ; journal `fence-normalization-records.jsonl` + original conservé | règle `MONOLITH-FENCE-NORMALIZATION-v1` (classe FORMAT_NORMALIZATION_ONLY, comme le target-normalizer MONO-11) | F1, F2 ; run réel `efm-20260914-5e9e749a` : 1 normalisation (original 2287 → 2275 car.) — sans elle, run `efm-20260914-18748e7b` a échoué `LLM_RESPONSE_INVALID` (parseur gelé strict) |
| `lib/screening-evidence.js` | preuve machine de screening (schéma fermé, preuves littérales, doublons déterministes), **ratifiée** par l'utilisateur | `EvidenceForge.MachineScreeningEvidence` ; `notADecision` explicite | S1–S3 |
| `lib/stage-retrieval.buildAuditDecisions` | transforme la ratification utilisateur en décisions `acteur:"human"` conformes au POST_RETRIEVAL_GATE gelé | `EvidenceForge.PostRetrievalAuditDecisions` + bloc `ratification` | R1–R3 |
| `lib/stage-mission.js` | reformulation à schéma fermé (1 reprise informée) | `REFORMULATION_INVALID` sinon | M1–M3 |
| `lib/llm.js` | transport réel + reuse gelé + classification fournisseur + délai borné | états `PROVIDER_*`, `NETWORK_UNAVAILABLE` | L1–L6 |
| `lib/stage-report.js` | rapport utilisateur calculé depuis les artefacts ; `SCIENTIFICALLY_USABLE` calculé | `EvidenceForge.UserReport` | P1–P3 |
| `lib/pipeline.js`, `lib/run-store.js` | orchestration reprenable, portes, fail-closed | `EvidenceForge.MonolithRunState` | Q1–Q5 |
| `tools/import-sealed-run.js` | preuve d'intégration : import lecture seule d'un run scellé après vérification de chaque hash | `kind: IMPORTED_SEALED_RUN` | import P0.1 seal B (11 artefacts vérifiés) |

## 3. Ce qui n'a pas changé (règles du gel)

- `reviews_complete = 100 %` : règle du lot MONO-11 v0.2, non modifiée, non contournée.
- Aucun re-scellement : le sceau MONO-11 v0.2 (`57e243b7…9df3`) est celui de la décision de gel ; le monolithe le vérifie, ne le produit pas.
- MONO-11 v0.3 non ouvert ; P0.2 non démarré ; `P0_2_AUTHORIZED = NO` inchangé.
- Aucun acte humain simulé : registre d'acteurs MONO-10 vide ; portes utilisateur à identité saisie ; l'exercice CORPUS réutilise des décisions humaines **réelles et antérieures** du propriétaire, inchangées.

## 4. Régressions connues / dettes (non bloquantes)

- Le kit EF-01 (résolveur/planificateur) passe par MONO-04 et non par `lib/llm.js` : ses appels ne bénéficient pas de la politique de réutilisation (un rerun = nouveaux appels réels, journalisés dans `ef01-evidence/`).
- Le rapport classe « établi » toute convergence de ≥ 2 jumeaux majoritairement documentée (support / vigilance) : règle de présentation du monolithe, documentée dans `stage-report.js`, pas une règle scientifique.

## v1.0.5 — chantier correctif coût / budget / screening global / économie du panel (2026-09-17)

| Élément gelé ou protégé | Statut sous v1.0.5 | Preuve |
|---|---|---|
| MONO-01, MONO-09 v0.2, MONO-10 v0.19, MONO-11 v0.3-r1 | byte-identiques (sceaux, zips) | `FROZEN-HASHES-BEFORE-AFTER.md`, tests I1, NONREG-01 |
| MONOLITH v1.0.4 (prédécesseur) | byte-identique (SHA256SUMS 47/0, zip `97b999ad…`), suite 80/80 rejouée depuis le dépôt | NONREG-02 |
| Kits EF-01B/EF-01C1 v0.2-r2, MONO-04, MONO-08 | non touchés ; le chemin kit passe par l'adaptateur additif `wrapMono04` (déjà présent en v1.0.4) | COST-11, `lib/mono04-fence-adapter.js` |
| Checkpoints, reprise, écriture atomique | fonctions byte-identiques ; le ledger de coût n'entre dans aucun checkpoint haché | NONREG-03, X4, X5, COST-07 |
| Porte 1 (`confirmPlan`, acte humain) | byte-identique ; l'assistant de cadrage est hors run et ne confirme rien | NONREG-04, PREFLIGHT-01/02/03 |
| Porte 2 (`ratifySources`, `buildAuditDecisions`, acteur `human`) | byte-identiques ; la revue de portefeuille est un artefact à côté (`notADecision`), la ratification enregistre le hash de la preuve de screening | NONREG-05, SCREEN-PORTFOLIO-02/07 |
| Plafond 150 (PROFESSIONAL-SELECTION-v1, garde dure) | inchangé (`professional-selection.js`, `stage-professionals.js` byte-identiques) ; mesuré, jamais seuillé | PROF-ECON-03/04, C1–C6 |
| Contrat de validation MONO-11-v2, reuse liée au contexte | inchangés ; le reuse est enregistré à coût 0 et jamais compté comme réel | COST-02, L5, X7 |
| Runs réels (`efm-20260917-f8a95282`, `efm-20260917-cf6101c7`, `efm-20260916-7990da62`) | lecture seule (`tools/reconstruct-cost.js`, scan anti-hardcoding alimenté par leurs artefacts) | `RAPPORT-FINAL-COST-SCREENING-v1.0.5.md` |
| Runs antérieurs (sans ledger ni budget) | lisibles : `cost.ledgerPresent=false`, projection partielle, économie `NOT_AVAILABLE`, aucune écriture | NONREG-06 |
| Diagnostic fournisseur (addendum one-command) | `providerConfigured` devenu strict (= prêt) ; `POST /api/runs` refuse sans fournisseur prêt ; `url.parse` remplacé par `URL` dans `server.js` seulement | V1 (mis à jour), LAUNCH-01…12, DOCTOR-01/02 ; aucun lot gelé touché |

## v1.0.5 — Professional Panel Cost Optimizer (2026-09-17)

| Élément | Statut | Preuve |
|---|---|---|
| Boucle d'évaluation MONO-11 (`runAutonomousPanel`), gate (`gatePanel`), oracle EF-02D2 (MONO-01) | gelés, byte-identiques ; l'arrêt anticipé passe par la dépendance injectée `fetchAuthorWorks` (contrat existant : erreur ⇒ `corpus_fetch_error`, candidat non évalué, jamais un verdict) ; MONO-11 reçoit toujours l'assessment plafonné entier | PRO-EARLY-01/09/12, PROF-ECON-04 |
| Sélection plafonnée (`selectCandidates`, garde dure `createEvaluationGuard`, cap 150) | byte-identiques ; `capAssessment` ordonne désormais par `selectionOrder` (tourniquet) — `evaluationCap.evaluationOrder` le déclare | PROF-ECON-03, PRO-EARLY-07 |
| Checkpoints, reprise, aval (`runDownstreamFromCheckpoint`) | byte-identiques ; le checkpoint porte en plus `sufficiency` et `workRefNormalizations` (hachés) | PRO-EARLY-08, X4, X5 |
| Budget | vérifié avant chaque appel, en amont de la suffisance (verrou de panne avant `tracker.shouldEvaluate`) | PRO-EARLY-10, COST-06 |
| Validateur gelé EF-02D2 (« aucune preuve inventée ») | inchangé ; la normalisation ne réécrit une référence que vers l'unique titre/DOI réel de forme canonique identique ; une référence absente reste refusée | WORKREF-01/02/04 |
| Runs réels 65c805ef / cf6101c7 | lecture seule (rejeu WORKREF-04 vérifie que le dossier est intact) | WORKREF-04 |
