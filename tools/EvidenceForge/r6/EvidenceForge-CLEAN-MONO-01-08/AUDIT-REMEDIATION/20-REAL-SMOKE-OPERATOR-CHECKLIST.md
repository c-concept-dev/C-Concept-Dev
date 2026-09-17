# 20 — Real Smoke Operator Checklist (R4, mise à jour R5)

**Mise à jour R5** : le workflow réel se déroule désormais en DEUX
étapes gouvernées (`PREPARE_REAL_SCREENING` puis
`RESUME_REAL_SCREENING`), séparées par une pause opérateur explicite —
voir la marche à suivre complète en fin de document et
`24-REAL-SCREENING-TWO-PHASE-WORKFLOW.md`. Les sections 1 à 4
ci-dessous (résolveur/planificateur/validation humaine) restent
inchangées et doivent être fournies AVANT `PREPARE_REAL_SCREENING`. La
section 5 (`auditDecisions`) est mise à jour : elle ne bloque plus le
lancement de `PREPARE_REAL_SCREENING`, mais reste requise avant
`RESUME_REAL_SCREENING`.

**Cette checklist n'est PAS une invitation à remplir les champs avec des
valeurs fictives.** Si une information n'existe pas encore : **NE PAS
L'INVENTER.** Le Real Smoke reste `NOT_READY` (au niveau
`MISSION_READINESS`, voir `22-MISSION-READINESS.md`) tant que chaque
ligne ci-dessous n'est pas réellement satisfaite. Un template d'exemple
est fourni à `MONO-08/v0.6/fixtures/real-provenance-operator-input.
example.json` (`mode: "SYNTHETIC_EXAMPLE"`, jamais chargé
automatiquement par le chemin REAL — vérifié statiquement par
`test_t08_r4_closure.js::R4-F01-04b`) pour montrer le FORMAT exact
attendu, jamais des valeurs à copier telles quelles.

## 1. `eForchProvenance.resolverRuns[]`

| | |
|---|---|
| **Source** | Un appel LLM réellement effectué, un par dimension retenue de la mission (`mission.dimensions[]`), dans le même ordre. |
| **Format** | `{provider, model, promptVersion, date, inputHash, rawResponseHash, proposalCountRaw, proposalCountStored, technicalProposalLimit, technicalLimitApplied, targetContextReport}` — voir le template pour la forme exacte. |
| **Validation** | `validateRealResolverRunFields()` (fail-closed si incomplet) + cohérence `discipline` optionnelle vs position RunContract (R4-F02, fail-closed si fournie et incohérente). |
| **Provenance** | `OPERATOR_ATTESTED_LLM_CALL`. |
| **Secret ?** | Non — mais `inputHash`/`rawResponseHash` doivent être de VRAIS hashes SHA-256 du contenu réellement échangé, jamais inventés. |
| **Récupération automatique possible ?** | Non — dépend d'un appel LLM réellement effectué par l'opérateur ou son infrastructure, hors du périmètre de MONO-08. |
| **Action humaine nécessaire ?** | Oui — déclencher l'appel LLM réel et en conserver la trace. |

## 2. `eForchProvenance.plannerRun`

| | |
|---|---|
| **Source** | Un appel LLM réellement effectué pour la planification de recherche (EF-01C1). |
| **Format** | `{provider, model, promptVersion, date, inputHash, rawResponseHash}` — provenance de l'appel UNIQUEMENT, jamais son contenu (voir `plannerOutput` ci-dessous). |
| **Validation** | `validateRealPlannerRunFields()`. |
| **Provenance** | `OPERATOR_ATTESTED_LLM_CALL`. |
| **Secret ?** | Non. |
| **Récupération automatique ?** | Non. |
| **Action humaine ?** | Oui. |

## 3. `eForchProvenance.plannerOutput`

| | |
|---|---|
| **Source** | Le contenu CAUSAL réellement décidé par le planificateur (distinct de `plannerRun`, qui n'est que sa provenance — voir `16-M02-CAUSAL-LINEAGE.md`, R3). |
| **Format** | `{sources[], queries[], retrieval[], criteresInclusion[], criteresExclusion[], regleDedoublonnage, methodeQualification, fenetreTemporelle?, langues?, typesDocumentsAdmis?}` — voir le template pour la forme exacte, notamment une `query` par dimension retenue. |
| **Validation** | `validateRealPlannerOutputFields()` — fail-closed explicite (`"planner causal output missing"`) si absent ou incomplet. |
| **Provenance** | `OPERATOR_ATTESTED_LLM_DERIVED` (le `SearchProtocol` produit est réellement dérivé de cette entrée — preuve directe R3/`test_t08_r3_closure.js`). |
| **Secret ?** | Non. |
| **Récupération automatique ?** | Non — c'est précisément le contenu que MONO-08 refuse désormais de fabriquer lui-même. |
| **Action humaine ?** | Oui — transcrire fidèlement ce que le planificateur a réellement produit, jamais un résumé approximatif. |

## 4. `eForchProvenance.humanValidation`

| | |
|---|---|
| **Source** | Une validation humaine réelle du `SearchProtocol` figé, après relecture. |
| **Format** | `{validatedAt, commentaire}` — `commentaire` ne doit jamais être vide/blanc (fail-closed, R4-F02-05). |
| **Validation** | `validateRealHumanValidationFields()`. |
| **Provenance** | `OPERATOR_ATTESTED_HUMAN_ACTION`. |
| **Secret ?** | Non. |
| **Récupération automatique ?** | Non — une revue humaine réelle, jamais générée. |
| **Action humaine ?** | Oui, obligatoirement. |

## 5. `auditDecisionsInput.decisions[]` (mise à jour R5)

| | |
|---|---|
| **Source** | Des décisions de screening humaines réelles, une par source RÉELLEMENT retrouvée par `PREPARE_REAL_SCREENING`, listée dans le `RetrievalSnapshot` produit. |
| **Format (R5)** | `{snapshotId, snapshotHash, missionId, decisions: [{sourceId, acteur:"human", date, decision, justification}, ...]}` — un TABLEAU (jamais une map), pour permettre la détection d'un doublon contradictoire sur un même `sourceId`. |
| **✅ Contrainte structurelle résolue (R5-A01, était R4-F03/A01)** | Les `sourceId` exacts ne sont plus une inconnue au moment de préparer les décisions : `PREPARE_REAL_SCREENING` les produit et les publie dans le snapshot (`sourceIds` du résultat, et `buildAuditDecisionsTemplate()` en génère un template prêt à remplir) AVANT que l'opérateur n'ait besoin de décider quoi que ce soit — voir `24-REAL-SCREENING-TWO-PHASE-WORKFLOW.md`. Plus de politique générale de contournement nécessaire. |
| **Validation** | `validatePostRetrievalAuditDecisions(snapshot, auditDecisionsInput)` (`POST_RETRIEVAL_GATE`) — snapshotId/snapshotHash/missionId cohérents, chaque `sourceId` connu du snapshot, aucun doublon contradictoire, exhaustivité (une décision par source), et `validateRealAuditDecisionFields()` par décision (acteur="human"/date/decision/justification). |
| **Provenance** | `OPERATOR_ATTESTED_HUMAN_ACTION`. |
| **Secret ?** | Non. |
| **Récupération automatique ?** | Non — jamais une auto-approbation (fail-closed explicite si absente ou incomplète : `OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS`). |
| **Action humaine ?** | Oui, obligatoirement, pour CHAQUE source du snapshot, entre l'étape B et l'étape E ci-dessous. |
| **Ne bloque plus** | `PRE_RETRIEVAL_GATE` / `PREPARE_REAL_SCREENING` (correction R5-A01). Bloque toujours `POST_RETRIEVAL_GATE` / `RESUME_REAL_SCREENING` si absente ou invalide. |

## 6. Secrets d'authentification (mode delegated/direct)

| | |
|---|---|
| **Source** | `ANTHROPIC_API_KEY` (mode direct) ou `EVIDENCEFORGE_WORKER_API_KEY` (mode delegated), résolu par `LLM_AUTH_MODE` (voir R2, B-02). |
| **Secret ?** | **Oui** — jamais dans un fichier versionné, jamais dans un log, jamais dans le paquet de release (secret-scan mode-aware, R2). |
| **Action humaine ?** | Oui — configuration de l'environnement d'exécution, hors de ce paquet. |

## Marche à suivre réelle (R5, workflow en deux phases)

**Étape A — Fournir résolveur/planificateur/validation humaine.**
Compléter réellement `eForchProvenance.resolverRuns` /
`plannerRun` / `plannerOutput` / `humanValidation` (sections 1-4
ci-dessus). `auditDecisions` n'est PAS requis à ce stade.

**Étape B — Lancer `PREPARE_REAL_SCREENING`.** Appeler
`prepareRealScreening(env, {mission, missionQuestion,
documentBytesByUrl, openAlexFetchImpl, realProvenance, snapshotBackend})`
(`lib/real-screening-workflow.js`). Le `PRE_RETRIEVAL_GATE` valide les
entrées de l'étape A, puis EF-01C2 est exécuté réellement (une seule
fois).

**Étape C — Récupérer `snapshotId`/`snapshotHash`/`sourceIds`.** La
fonction retourne `{state: "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS",
snapshotId, snapshotHash, missionId, sourceCount, sourceIds}` — noter
ces valeurs. `buildAuditDecisionsTemplate(snapshot)` génère un template
JSON prêt à compléter (aucune décision pré-remplie).

**Étape D — Remplir `auditDecisions` réellement.** Pour CHAQUE
`sourceId` listé à l'étape C, un humain réel décide (`acteur:"human"`,
`date`, `decision` parmi `inclus`/`exclu`/`doublon`, `justification`
non vide) — jamais une décision automatisée, jamais une valeur
synthétique, jamais un doublon contradictoire sur un même `sourceId`.

**Étape E — Lancer `RESUME_REAL_SCREENING`.** Appeler
`resumeRealScreening(env, adapter, workerCallFn, {runId,
snapshotBackend, snapshotId, auditDecisionsInput, mission,
documentContentByUrl})`. Le `POST_RETRIEVAL_GATE` valide les décisions
de l'étape D contre le snapshot exact de l'étape B/C (intégrité
vérifiée, `SNAPSHOT_INTEGRITY_ERROR` fail-closed si altéré) — **aucun
second retrieval n'est jamais exécuté** (voir `24-REAL-SCREENING-
TWO-PHASE-WORKFLOW.md`, garantie no-refetch).

**Étape F — Poursuivre le Real Smoke.** Le run démarré par l'étape E
poursuit le graphe normalement (`driveRun()`), depuis
`ScreeningArtifact`/`QualificationTestArtifact` construits sur les
données réelles rejouées du snapshot. Le prochain Real Smoke réel
reste l'affaire de la gouvernance/audit indépendant — jamais déclenché
par ce paquet lui-même (voir `11-FINAL-TECHNICAL-VERDICT.md`).
