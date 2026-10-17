# AUTOPSIE POST-RUN — COÛT, BUDGET, SCREENING GLOBAL, PANEL PROFESSIONNEL

Phase A du chantier correctif. Base inspectée : **EvidenceForge MONOLITH-v1.0.4** (zip canonique
`97b999adcff395ab49f7cd33e8e70bab767c7df22ffdda0967771db5595dd961`, GELÉ), lots gelés MONO-01…MONO-11
(MONO-11 v0.3-r1, zip `3c44b397…`), kits d'exploitation EF-01B/EF-01C1 v0.2-r2, Worker `evidenceforge-llm-proxy`
(code déployé relu via l'API Cloudflare). Date : 2026-09-17. **Rien n'a été modifié pour établir cette cartographie.**

Toutes les références de lignes sont celles de MONOLITH-v1.0.4 (byte-identiques dans la copie de départ de v1.0.5).

---

## 0. Le run réel qui motive le chantier (preuve, lecture seule)

| Run | Où | État observé | Preuve |
|---|---|---|---|
| `efm-20260917-f8a95282` (JMJS / D103P0.1) | `reports/h1-v104-sonnet-runs/` | RUNNING · PROFESSIONALS · tentative 3 · modèle `claude-sonnet-4-6` | `state.json` ; RETRIEVAL : 99 sources, 91 jugées, 8 sans proposition ; CORPUS : 12 incluses / 87 exclues ; sélection 123/123 (pool 123, cap 150, `capApplied:false`), 126 évalués MONO-10 dont 3 non évaluables |
| `efm-20260917-cf6101c7` (run complet, même version) | idem | COMPLETED · 242 appels réels · 150 professionnels évalués → 15 admis → 13 jumeaux → 13 revues | `state.json`, `events.jsonl`, `panel.json`, `twins.json` |
| `efm-20260916-7990da62` (Opus, interrompu) | `reports/h1-v104-runs/` | STOPPED · 117 appels réels · `OPUS_INTERRUPTED_COST_BASELINE` | conservé, jamais repris |

**Reconstruction du coût à partir des journaux existants** (`llm-calls.jsonl`, champ `usage` réel du fournisseur ;
tarif de référence Sonnet 4.6 : 3 USD/M entrée, 15 USD/M sortie) :

| Run | Appels réels | Tokens entrée | Tokens sortie | Coût reconstruit |
|---|---|---|---|---|
| f8a95282 (en cours, PROFESSIONALS 35/123 au moment de l'analyse) | 65 + 1 sonde | 381 843 | 197 786 | **4,11 USD** — dont EF-02D2 relevance 45 appels = 3,35 USD (0,075 USD/appel), screening 19 appels = 0,60 USD, reformulation 0,16 USD |
| cf6101c7 (complet) | 242 + 2 sondes | 1 013 847 | 630 137 | **12,49 USD** — dont PROFESSIONALS 9,27 USD (179 appels EF-02D2 sur 150 candidats, 0,052 USD/appel, **0,062 USD/professionnel**), TWINS_REVIEWS 2,72 USD (EF-02D3 couverture 0,83 + 0,24, EF-03B revues 1,49 + 0,02, aval 0,15), RETRIEVAL 0,48 USD |
| 4 runs arrêtés à la Porte 1 le même jour | 1 chacun | — | — | 0,32 USD |
| **Total reconstruit (journaux du jour)** | | | | **16,92 USD** |

Le propriétaire a observé ≈ 19,25 USD consommés (47 → 27,75). L'écart (≈ 2,3 USD) s'explique par **un angle mort de
journalisation** (§ 2.2) : les appels des kits EF-01B (résolveur) et EF-01C1 (planificateur) — 2 à 5 par run,
prompts longs — ne figurent **dans aucun journal portant `usage`**. Le coût n'est donc aujourd'hui **ni visible, ni
même reconstructible exactement** a posteriori.

Fait économique majeur (cf6101c7) : **74 % du coût du run (9,27/12,49) est dépensé à l'évaluation de 150
professionnels, dont 119 (79 %) finissent `AUTO_DEFERRED`, 15 `AUTO_REJECTED`, 15 admis** ; 13 jumeaux en résultent.
C'est la mesure qui fonde P3/P10 (gain marginal), sans autoriser aucun seuil.

---

## 1. Transport LLM : cartographie complète

### 1.1 Chemin principal (monolithe, non gelé) — `lib/llm.js`

| Élément | Fichier · fonction · lignes | Responsabilité | Constat |
|---|---|---|---|
| Sélection du modèle | `lib/llm.js:38` `createLlm` | `EVIDENCEFORGE_LLM_MODEL` ∥ `opts.model` ∥ `config.llm.model` | OK |
| Appel HTTP | `lib/llm.js:70-87` `httpCall` | POST `{LLM_WORKER_BASE_URL}/v1/messages`, Bearer, retry 429/503/529, délai borné | **Point unique** où la réponse brute arrive |
| **Usage fournisseur reçu** | `lib/llm.js:125-129` `llmCallInner` | `parsed.usage` (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cache_creation{5m,1h}, service_tier) est **déjà** journalisé dans `runs/<runId>/llm-calls.jsonl` (`kind:"LLM_CALL"`) | Données de coût **présentes mais jamais valorisées** ; pas de `stage`, pas de `candidateRef` (le `meta.candidateRef` fourni par MONO-11 est ignoré à la ligne 127) |
| Reuse | `lib/llm.js:103-120` + `reuseContextCheck:51-61` | REUSE_VALID ⇒ `reused:true`, `kind:"LLM_REUSE"`, **aucun HTTP** | Correct : un reuse ne coûte rien ; il doit rester hors comptage réel |
| Verrou de panne | `lib/llm.js:89-100` `latch`/`llmCall` | Première panne fatale mémorisée ; tout appel suivant échoue **sans réseau** ; `TRANSPORT_CODES:93` | **Mécanisme réutilisable tel quel pour l'arrêt budget** (voir 1.4) |
| Sonde preflight | `lib/llm.js:142-146` `preflight` | 1 appel réel `max_tokens:8` | usage reçu mais **non journalisé** (≈ 0) |
| Compteurs | `lib/llm.js:149` `counts()` → `{real, reused, reuseRefused}` ; `lib/pipeline.js:80` `done()` cumule dans `state.counters.llmReal/llmReused` ; `lib/pipeline.js:56` `fail()` idem | Seuls des **nombres d'appels** sont exposés ; aucun token, aucun coût |

### 1.2 Chemin kit (EF-01B/EF-01C1 GELÉS via MONO-04 GELÉ) — angle mort

| Élément | Fichier · fonction · lignes | Constat |
|---|---|---|
| Résolveur / planificateur | `lib/stage-ef01.js:80-85` `runDisciplines`, `:114-118` `runPlanner` → `vendor/operator-kit-r1.3/run-resolver-core.js` → `EF-01B-v0.2-r2/lib/executor.js` → `lib/real-llm-call.js:116-128` `gateway.executeRequest({ payload:{model,max_tokens:4096,messages} })` | Le kit gelé lit `content[0].text` (`:139`) et **jette le reste de l'enveloppe** : `usage` n'est écrit nulle part (`provenance.json`, `planner-provider-evidence.json` : hash du texte seulement — vérifié sur f8a95282) |
| Adaptateur additif existant | `lib/mono04-fence-adapter.js:24-43` `wrapMono04` → `gateway.executeRequest` enveloppé ; `result.result` = **enveloppe Anthropic complète** (`content`, `model`, `usage`, `id`) | **Point d'interception additif idéal** : l'usage et le modèle observé y sont lisibles avant que le kit ne les jette ; aucune modification du kit ni de MONO-04 |
| Modèle des kits | `lib/stage-ef01.js:19` `ensureRealModel` → `LLM_REAL_MODEL` ; `MONO-08/v0.6/lib/real-external-adapter.js:41` | OK |
| Reprise kit | `lib/stage-ef01.js:56-72` `kitAttempts` (KIT_RETRYABLE `:26`) | Une erreur hors `KIT_RETRYABLE` remonte telle quelle ⇒ un `BUDGET_LIMIT_REACHED` levé par l'adaptateur remontera jusqu'à `pipeline.fail` |

### 1.3 Sonde MONO-10 (transport d'exploitant) — `lib/llm-transport.js`

`probe:13-35` : 1 appel réel `max_tokens:64` ; `usage` **journalisé** (`kind:"LLM_PROBE"`, `:30-32`) via `EVIDENCEFORGE_MONOLITH_LLM_LOG`. Le contrat gelé MONO-10 prévoit déjà un champ `costUsd` dans le résultat de la sonde (`:34`) — aujourd'hui **`null`**.

### 1.4 Où le budget peut être contrôlé AVANT l'appel, sans toucher aux lots gelés

1. `lib/llm.js:121-124` — juste avant `httpCall` (chemin principal, preflight inclus).
2. `lib/mono04-fence-adapter.js:27-28` — juste avant `g.executeRequest` (chemin kit).
3. `lib/llm-transport.js:19-23` — avant la sonde MONO-10.

Comportement à l'atteinte du plafond = **exactement celui d'une panne de transport** (`PROVIDER_CREDIT_EXHAUSTED` est
le précédent) : erreur fatale, **verrou** (`TRANSPORT_CODES`, `lib/llm.js:93`), les lots gelés qui absorbent les
exceptions (`MONO-11 semantic-relevance-oracle.js:118-121` absorbe l'erreur ⇒ `RELEVANCE_UNKNOWN`) ne transforment
rien en verdict : `assertNoTransportFailure` (`lib/stage-professionals.js:163`, appelé `:230` et `:269`) arrête
l'étape, `pipeline.fail` (`lib/pipeline.js:55-61`) pose `STOPPED` si le code est dans `RESUMABLE` (`:21-22`).
À la reprise, les réponses déjà validées sont **réutilisées sans coût** (REUSE_VALID, `lib/llm.js:104-119`, test X7/L5).
⇒ `BUDGET_LIMIT_REACHED` ajouté à `TRANSPORT_CODES` et à `RESUMABLE` donne le comportement demandé (STOPPED, checkpoint
conservé, reprise après décision humaine, jamais FAILED, jamais un faux succès).

### 1.5 Proxy Cloudflare

`evidenceforge-llm-proxy` (code déployé relu) : relais transparent `POST /v1/messages`, aucune transformation de
`usage`, aucune liste de modèles. Aucune modification nécessaire.

---

## 2. Écart entre ce que l'utilisateur voit et ce qui est dépensé

| Ce qui existe | Où | Ce qui manque |
|---|---|---|
| `state.counters.llmReal / llmReused / openAlexCalls / kitRealCalls` | `lib/run-store.js:79` `publicState` → `/api/runs/:id` | tokens, coût, coût par étape, dernier appel, projection, budget |
| Mode expert → onglet « Appels LLM » = `llm-calls.jsonl` brut (300 dernières lignes) | `index.html:225-233` | illisible pour un novice, aucun total |
| Rapport final `pipeline.llm.real/reused` | `lib/stage-report.js:104` | aucun coût |

Aucun endroit de l'interface n'affiche un montant. Aucun budget n'existe (grep `budget` sur lib/, server.js,
index.html, config : 0 occurrence).

---

## 3. Screening : où et comment il raisonne

| Élément | Fichier · fonction · lignes | Constat |
|---|---|---|
| Construction de la preuve machine | `lib/stage-retrieval.js:114` → `lib/screening-evidence.js:65-86` `buildScreeningEvidence` | Lots de 8 sources (`config.screening.batchSize`), 3 passes max, doublons déterministes (`detectDuplicates:20-28`) |
| Prompt | `lib/screening-evidence.js:30-36` `batchPrompt` | Raisonne **source par source** : « pour CHAQUE source, décide si ses MÉTADONNÉES montrent une pertinence documentaire pour la mission » ; les autres sources du lot ne sont pas mises en relation ; les lots ne se voient pas entre eux ; **aucune notion de redondance, de couverture, de complémentarité, ni de distinction domaine / méthode** |
| Validation locale | `lib/screening-evidence.js:38-59` `validateBatch` | Schéma fermé `{sourceId, decision, justification, evidence[], confiance}` ; `evidence` doit être copiée littéralement du titre/résumé |
| Artefact | `EvidenceForge.MachineScreeningEvidence` (`:84-85`), `notADecision` présent | Consommé par `buildAuditDecisions` (`lib/stage-retrieval.js:89-105`, acteur humain obligatoire) et par la porte |
| Porte 2 (serveur) | `lib/pipeline.js:119-122` (ouverture), `gateView:225-230` (vue), `ratifySources:210-218` (acte humain, `HUMAN_IDENTITY_REQUIRED`) | Vue = liste plate de propositions + résumé ; aucune vue d'ensemble |
| Porte 2 (interface) | `index.html:187-198` `renderSources` | Affiche incluses + 10 exclues par défaut, boutons inclus/exclu par source, nom obligatoire ; **aucune carte de couverture, aucun groupe de redondance, aucun signal « méthode générique hors domaine »** |

Cause racine de P4/P5 : la **granularité** du raisonnement (une source ↔ la mission) et l'**absence de tout
artefact de niveau corpus** entre `MachineScreeningEvidence` et la ratification. Le cas « LOT » (méthode d'ingénierie
ontologique, domaine industriel, proposée exclue) est la conséquence attendue d'un prompt qui ne pose jamais la
question « cette méthode est-elle transposable ? » ; il sert de **cas de test**, pas de règle.

Point d'insertion additif : `lib/pipeline.js:114-117`, entre `buildScreeningEvidence` et `done("RETRIEVAL")` ;
artefact `corpus-portfolio-review.json` ; exposé par `gateView` ; **`sources-ratification.json` inchangé**
(`evidenceSha256` reste celui de `screening-evidence.json`, `:215`) ; `buildAuditDecisions` inchangé ⇒ le contrat
gelé MONO-08 (acteur `human`) n'est pas touché.

---

## 4. Panel professionnel : sélection, évaluation, coût, gain

| Élément | Fichier · fonction · lignes | Constat |
|---|---|---|
| Plafond | `config/monolith.config.json` `professionals.maxCandidatesToEvaluate = 150` ; `lib/stage-professionals.js:192` | **Garde**, pas cible : f8a95282 = 123 ≤ 150, `capApplied:false` ⇒ tous évalués |
| Sélection déterministe | `lib/professional-selection.js:39-60` `selectCandidates` (PROFESSIONAL-SELECTION-v1, tourniquet par discipline, `selectionOrder`) ; persistée **avant** tout appel (`lib/pipeline.js:152-153`, `lib/stage-professionals.js:199`) | `selectionOrder` fournit un **rang** exploitable pour le gain marginal |
| Garde dure | `lib/professional-selection.js:77-85` `createEvaluationGuard` | inchangé |
| Boucle d'évaluation | MONO-11 gelé `core/autonomous-run.js:63-101` (`candidate_evidence` par candidat, `oracleCalls`) ; oracle `core/semantic-relevance-oracle.js:112` **passe `meta.candidateRef`** à `llmCall` | Le monolithe reçoit `candidateRef` sur chaque appel EF-02D2 mais ne le persiste pas (`lib/llm.js:127`) ⇒ **l'attribution du coût par professionnel est possible sans toucher MONO-11** |
| Aval | `core/coverage-enforcer.js:110` (`candidateRef`), `core/review-enforcer.js:277` (`twinId`, `targetId`) | idem : attribution par jumeau possible |
| Résultat par candidat | `panel.json` (`gateDecisions`/counts), `twins.json`, `reviews.json`, `assessment.json` (`identityConfidence`, `assessmentStatus`), `professionals-selection.json` (`selectionOrder`, `perDimension`) | Tout ce qu'exige P10 existe déjà dans les artefacts ; il manque la **jointure** et la persistance (`professionals-economics.json`) |
| Progression visible | événements `candidate_evidence` (niveau tech) | l'interface n'affiche pas « 64/123 » |

Early-stop : **aucune base suffisante aujourd'hui**. Un seul run complet (cf6101c7) sous cette version, pool 553
plafonné à 150 ; f8a95282 non terminé. Le gain marginal par rang n'a jamais été mesuré. ⇒ **instrumenter, ne pas
seuiller** (P3), architecture prête pour une politique ultérieure fondée sur `professionals-economics.json`.

---

## 5. Porte 1 et cadrage (P6) — ce qui existe

| Élément | Fichier · lignes | Constat |
|---|---|---|
| Création de run | `server.js:35` `POST /api/runs` → `lib/pipeline.js:34-48` `startRun` puis `advance` immédiat | La reformulation (`lib/stage-mission.js:50-65`, 1 appel réel) n'a lieu qu'**après** création du run |
| Porte 1 | `lib/pipeline.js:199-207` `confirmPlan` (identité obligatoire via `S1.confirmPlan`), `index.html:174-185` | Acte humain réel, inchangé |
| Interface de saisie | `index.html:54-63` | zone de texte + fichiers ; aucune aide, aucun contrôle préalable |

Un « Vérifier ma demande avec l'IA » avant la Porte 1 est **additif et sans conflit** : nouvel endpoint hors run
(`POST /api/preflight`), 1 appel réel (facturé, journalisé dans un ledger de session), retour = problèmes détectés +
proposition ; l'utilisateur accepte/refuse/modifie **dans la zone de texte** ; `POST /api/runs` reste le seul
chemin de création ; `confirmPlan` inchangé. Aucun contrat gelé impliqué (le run n'existe pas encore).

---

## 6. Aide (P7)

`index.html` : aucun élément d'aide (grep `Aide|Comment utiliser` : 0). Point d'insertion : en-tête (`index.html:43-46`),
panneau `<dialog>`/carte masquée, sans changer le parcours ; test U1 exige « mode simple sans code EF-*/MONO-* ».

---

## 7. Invariants gelés vérifiés (avant toute modification)

| Lot | Fichiers | Sceau vérifié | Zip canonique |
|---|---|---|---|
| MONO-10 v0.19 | 79 | oui | `f5a4165414f4aacc32f48f50eb14d59c87a09e3f138e24f8bd14b956972c2e04` |
| MONO-11 v0.3-r1 | 52 | oui | `3c44b397dda0997d0fff6ab4c8e8a8b311430e6a5ac7aeee38149f8349296b0b` |
| MONO-09 v0.2 | 9 | oui | — |
| MONO-01 | 106 | oui | — |
| MONOLITH-v1.0.4 (paquet) | 47 | `SHA256SUMS.txt` OK | `97b999adcff395ab49f7cd33e8e70bab767c7df22ffdda0967771db5595dd961` |

État du dépôt GitHub (`c-concept-dev/C-Concept-Dev`, main `c52e0a3`) au début du chantier : `tools/EvidenceForge-Audit`
portait v1.0.4 **sans `lib/`** (`.gitignore:66 lib/`) et sans aucun lot gelé ni kit (bundleRoot `..` → `tools/`).
Décision propriétaire (2026-09-17) : import du bundle complet sous `tools/EvidenceForge/` (miroir byte-identique,
exception `.gitignore`), v1.0.4 conservée telle quelle, v1.0.5 ajoutée à côté.

---

## 8. Synthèse : responsabilité → risque → modification proposée (toutes additives, couche monolithe)

| # | Problème | Cause racine (preuve) | Risque si inchangé | Modification proposée |
|---|---|---|---|---|
| P0 | Coût invisible | `usage` journalisé (`llm.js:129`) mais jamais valorisé ; kits sans usage ; UI = compteurs d'appels | dépense sans décision rationnelle | `lib/cost-ledger.js` (append-only `cost-ledger.jsonl`, tarification versionnée), branché en `llm.js:121-137`, `mono04-fence-adapter.js:27`, `llm-transport.js:26-32`, `preflight` ; totaux dans `publicState` ; bloc « COÛT DU RUN » dans `index.html` |
| P1 | Pas de budget | aucun mécanisme | dépassement silencieux | `state.budget` (à la création ou `POST /api/runs/:id/budget`), garde `checkBeforeRealCall` sur les 3 points de 1.4, `BUDGET_LIMIT_REACHED` ∈ `TRANSPORT_CODES` + `RESUMABLE` ⇒ STOPPED reprenable |
| P2 | Pas d'estimation | aucun estimateur | l'utilisateur ne peut pas anticiper | `lib/cost-forecast.js`, séparé de la comptabilité, unités = candidats sélectionnés / jumeaux / revues ; `UNKNOWN` quand non projetable ; `notGuarantee:true` |
| P3/P10 | 150 = garde, gain marginal inconnu | `candidateRef` non persisté (`llm.js:127`) ; aucune jointure des artefacts | seuil arbitraire tentant | `candidateRef`/`twinId` dans le ledger ; `lib/professionals-economics.js` → `professionals-economics.json` ; **aucun early-stop** |
| P4/P5 | Screening source par source | prompt `screening-evidence.js:31-35` ; aucun artefact corpus | corpus redondant/déséquilibré ratifié faute d'information | `lib/corpus-portfolio-review.js` : partie déterministe (redondance lexicale, carte de couverture par discipline de requête) + partie LLM à schéma fermé (`DOMAIN_RELEVANCE` / `METHODOLOGICAL_RELEVANCE`, complémentarité) ; `notADecision:true` ; rendu à la Porte 2 |
| P6 | Pas d'aide au cadrage | flux `POST /api/runs` → reformulation post-création | demandes mal cadrées coûteuses | `POST /api/preflight` hors run + bouton « Vérifier ma demande avec l'IA » ; jamais de modification silencieuse ni de confirmation |
| P7 | Pas d'aide | — | produit inutilisable par un novice | panneau « Comment utiliser EvidenceForge ? » non intrusif |

Cohérence vérifiée : aucune des modifications ne touche MONO-08/09/10/11, EF-01B/EF-01C1, MONO-04 ; les contrats
`MachineScreeningEvidence` → `buildAuditDecisions` → POST_RETRIEVAL_GATE, `ProfessionalsCheckpoint`,
`DownstreamCheckpoint`, `confirmPlan`, `ratifySources` restent byte-identiques dans leur chemin critique ; le ledger de
coût est un artefact **à côté** (jamais dans un checkpoint haché, pour ne pas lier la reprise au tarif).
