# AUTOPSIE FACTUELLE — COÛT DE L'ÉTAPE « DÉCOUVRIR ET ÉVALUER LES PROFESSIONNELS »

Date : 2026-09-17. Runs réels lus **en lecture seule** : `efm-20260917-65c805ef` (v1.0.5, budget 5 USD, 5,02 USD, `h1-v105-runs`)
et `efm-20260917-cf6101c7` (v1.0.4, complet, 150 évalués, 15 admis, `h1-v104-sonnet-runs`). Aucun artefact modifié.

## 1. Cartographie (fichier · fonction · rôle · entrée → sortie · coût · dépendances)

| Fichier · fonction | Rôle | Entrée → sortie | Coût LLM | Dépend de |
|---|---|---|---|---|
| `lib/stage-professionals.js` `discoverProfessionals` (l.94-107) | EF-02A/02B : découverte OpenAlex des auteurs des sources incluses, vérification d'identité, dédoublonnage (`dedupeDiscovery`) | corpus ratifié → `professionals-discovery.json` (274 candidats → 270 identifiés) | 0 (OpenAlex) | MONO-09 v0.2 gelé |
| `openMono10Run` (l.117-140), `M10.CA.assessCandidates` (l.185) | évaluation MONO-10 locale : `identityConfidence`, `assessmentStatus`, `relevance` | discovery → `assessment` (270) | 0 | MONO-10 v0.19 gelé |
| `lib/professional-selection.js` `selectCandidates` (l.39-60) | **270 → 150** : clé de rang canonique + tourniquet par discipline ; `selectionOrder` persisté (`professionals-selection.json`) avant tout appel | assessment → 150 ids, `perDimension` | 0 | config `maxCandidatesToEvaluate = 150` |
| `capAssessment` (l.63-73) | sous-ensemble de l'assessment **dans l'ordre de l'assessment MONO-10** (groupé par discipline), pas dans `selectionOrder` | | 0 | |
| `runPanel` (l.171-242) → `M11.autonomousRun.runAutonomousPanel` | boucle d'évaluation : pour chaque candidat de `assessment.assessments` : `fetchAuthorWorks` (OpenAlex, cache) → `probeCorpusSufficiency` (déterministe) → si SUFFICIENT : `evaluateRelevanceEvidence` → 1 appel EF-02D2 (+1 réparation) → `candidate_evidence` ; puis `MEG.gatePanel` (déterministe) | assessment plafonné → `panel` (admis = SUPPORTED) | **1 appel / candidat suffisant, ×2 si réparation** | MONO-11 v0.3-r1 gelé, injections `fetchAuthorWorks`, `llmCall` |
| `MONO-01/dependencies/ef-02d2-mission-relevance-v1.js` `buildRelevancePrompt` / `parseRelevanceResponse` / `evaluateMissionRelevance` | prompt : mission + 7 dimensions + 10 œuvres (titre, DOI, année, topics) ; sortie : 7 jugements (`relevanceStatus`, `epistemicStatus`, `rationale`, `supportingWorkRefs`, `limitations`) ; **validateur exige que chaque `supportingWorkRef` soit ÉGAL (chaîne exacte) à un titre/DOI du corpus** ; sinon 2ᵉ appel « Répare UNIQUEMENT la syntaxe » puis échec → UNKNOWN | corpus → judgments | ≈ 2 700 tokens entrée + 2 070 sortie ≈ **0,039 USD** (Sonnet 4.6) ; réparation ≈ +0,04 | MONO-01 gelé |
| `lib/llm.js` `llmCall` | transport, reuse (prompt identique), ledger, budget | | | |
| condition de sortie actuelle | **aucune** avant la fin de la liste : la boucle gelée parcourt tout l'assessment plafonné ; seuls le budget (verrou) ou une panne l'interrompent | | | |
| checkpoint / reprise | `checkpoint-professionals.json` écrit **à la fin** de la boucle ; un arrêt en cours = aucun checkpoint, reprise = rejouer la boucle (réponses VALID réutilisées) | | | |

## 2. Ce que le run à 5,02 USD a réellement fait

| Fait | Valeur | Preuve |
|---|---|---|
| Sélection | 270 → 150 (cap appliqué) ; `perDimension` : disc-02 32/72, disc-03 8/8, disc-04 32/32, disc-05 31/40, disc-06 16/16, disc-07 31/102 ; **disc-01 : aucun candidat** | `professionals-selection.json` |
| Évaluations **réelles** avant le plafond | **86** (pas 150) : 85 corpus SUFFICIENT + 1 INSUFFICIENT | 86 `candidate_evidence` avant `budget_limit` (14:58:36) |
| « Évaluations » après le plafond | 64 candidats parcourus par la boucle gelée avec `corpus_fetch_error` (verrou) → UNKNOWN, **0 appel** | 63 `corpus_fetch_error` après `budget_limit` |
| Ordre d'évaluation | **groupé par discipline** (22 × disc-02, puis disc-03, 04, 05, 06, 07), pas le tourniquet de `selectionOrder` | `candidate_evidence` vs `selectionOrder` : divergent dès le rang 1 |
| Appels EF-02D2 | 107 (65 candidats à 1 appel, 21 à 2 appels) ; 2 678 tokens entrée / 2 072 sortie en moyenne ; **sortie = 3,33 USD sur 4,19** | `llm-calls.jsonl`, `cost-ledger.jsonl` |
| Résultats | SUPPORTED **2**, PARTIAL 48, OUT_OF_SCOPE 15, UNKNOWN 21 (dont 20 après 2 appels) | événements |
| Cause des 20 UNKNOWN à 2 appels | le modèle cite les titres avec apostrophes/guillemets typographiques (’ “ ”) : le validateur gelé exige l'égalité exacte → refus → prompt de « réparation syntaxique » (ne corrige pas) → refus → UNKNOWN. **31/31 références refusées sont identiques au titre réel après normalisation (casse, ponctuation, espaces)** | comparaison `llm-cache` requêtes/réponses |
| Coût de ce gaspillage | **0,68 USD** de 2ᵉ appels (16 % de l'étape) **et** 17 évaluations perdues (dont 1 SUPPORTED) | recalcul avec normalisation : SUPPORTED 3, PARTIAL 62, OUT 16, UNKNOWN 4 |
| Reuse | 1 (sur 138) : chaque prompt EF-02D2 est unique (corpus du candidat) ; les seuls prompts répétés sont les réparations. Aucun regroupement possible sans casser le contrat gelé « un professionnel par appel » | `llm-reuse-store.jsonl` |

## 3. Courbe coût / information (rang → coût cumulé → admissions → couverture)

Résultats réévalués avec la normalisation des références (les 17 UNKNOWN redeviennent lisibles). Deux ordres : réel (groupé) et
`selectionOrder` (tourniquet) — les issues sont intrinsèques à chaque candidat, donc réordonnables.

| N | coût cumulé (réel) | admis | dims SUPPORTED | dims SUP ∪ PARTIAL | disciplines vues | dernier apport (adm / dim) |
|---|---|---|---|---|---|---|
| 20 | 0,94 | 0 | 0 | 5 | 1 | – / 7 |
| 40 | 1,81 | 0 | 0 | 7 | 4 | – / 35 |
| 50 | 2,32 | 2 | 1 | 7 | 4 | 47 / 41 |
| 60 | 2,74 | 3 | 1 | 7 | 6 | 54 / 41 |
| 86 | 4,15 | 3 | 1 | 7 | 6 | 54 / 41 |

Ordre tourniquet : couverture SUP ∪ PARTIAL = 7/7 dès le **rang 7** ; admissions aux rangs 33, 44, 56 ; ensuite 30 évaluations
(1,5 USD) sans aucun apport. Point de convergence rétrospectif **pour ce run** : rang 56 (dernière admission), rang 33 (dernier
nouvel angle SUPPORTED). Extrapolé à 150 : ≈ 7 USD pour, au mieux, 1-2 admissions de plus.

**Mais** sur le run complet `cf6101c7` (10 dimensions, 150 évalués, 15 admis, 13 jumeaux) la même mesure donne : admissions aux
rangs 21, 30, 44, 50, 53, 57, 58, 74, 86, 102, 105, 115, 120, 123, 130 — **réparties sur toute la liste, sans plateau**. Simulation
rétrospective (ordre tourniquet) d'arrêts fondés sur « k évaluations consécutives sans nouveauté » :

| règle (par dimension : cible T admis, min évalués, fenêtre sans nouveauté) | évalués | admis conservés | dims SUPPORTED | coût |
|---|---|---|---|---|
| T=2, min 3, fenêtre 3 | 36 | **2 / 15** | 2 / 6 | 1,87 |
| T=2, min 5, fenêtre 5 | 62 | 5 / 15 | 4 / 6 | 3,22 |
| T=3, min 6, fenêtre 6 | 80 | 7 / 15 | 4 / 6 | 4,16 |
| T=3, min 8, fenêtre 8 | 101 | 8 / 15 | 5 / 6 | 5,25 |
| fenêtre globale 2×dims (=20) sans nouveauté | jamais atteinte avant 150 | 15 / 15 | 6 / 6 | 7,8 |

**Constat central** : à cette étape, l'« information » est l'admission (SUPPORTED) et la couverture par les admis. L'admission
est un événement **rare et à taux à peu près constant le long de la liste** (10 % dans cf6101c7, 3,5 % dans 65c805ef) : aucun
signal de convergence n'apparaît dans les sorties existantes ; une règle « les dernières réponses se ressemblent » s'arrête sur du
bruit et perd la majorité des admis (et donc des jumeaux). Un arrêt **démontrable** ne peut être fondé que sur la **suffisance** :
chaque dimension a assez d'admis (ou son vivier est épuisé). Dans les deux runs réels, cette suffisance n'est jamais atteinte —
le coût vient de viviers pauvres, pas d'une sur-évaluation d'un panel déjà suffisant.

## 4. Signaux gratuits pour un pré-tri (lever 1) — testés, négatifs

- MONO-10 : tous les évalués de cf6101c7 sont `MODERATE` / `PLAUSIBLE` / `SEED_CANDIDATE` (admis comme non-admis) : aucun pouvoir discriminant.
- Proximité lexicale (TF-IDF titres + topics des 10 œuvres vs mission + définitions des angles) : **AUC = 0,52** pour prédire
  l'admission (hasard = 0,50) ; rangs des 15 admis dans l'ordre lexical : 16 … 135. Un pré-tri lexical serait une fausse
  optimisation. ⇒ Le seul pré-tri défendable est l'**ordre tourniquet** (`selectionOrder`, déjà calculé, jamais utilisé par la
  boucle) : chaque discipline est échantillonnée tôt, quel que soit le point d'arrêt (budget ou suffisance).

## 5. Où va l'argent, et ce qui est actionnable sans toucher aux lots gelés

| Poste (run 65c805ef) | USD | Actionnable ? |
|---|---|---|
| Sortie des jugements EF-02D2 (rationale × 7 dimensions, prompt gelé) | 3,33 | par le **modèle** (routage : la tâche est une classification structurée) — à mesurer avant tout changement |
| 2ᵉ appels de « réparation » sur références typographiques | 0,68 | **oui** : normalisation déterministe des références (même classe que l'adaptateur de clôture Markdown), + 17 évaluations sauvées |
| Entrée EF-02D2 | 0,86 | non (prompt gelé, 10 œuvres) |
| Évaluations sans apport après la dernière admission | 1,5 (30 évaluations) | seulement par une règle de **suffisance** (jamais atteinte ici) ; le budget reste la borne |
| RETRIEVAL (screening 0,35 + revue de portefeuille 0,42) | 0,77 | hors périmètre (revue de portefeuille : 9 appels, dont 4 reprises) |

## 6. Conclusion de l'autopsie

1. Le run n'a pas évalué 150 professionnels mais **86** ; les 64 autres sont des parcours à vide après le verrou budget.
2. **16 % de l'étape** (0,68 USD) et 17 évaluations sont perdus par un désaccord typographique avec le validateur gelé — corrigeable
   par normalisation additive, mesurée.
3. L'ordre d'évaluation ignore le tourniquet : sous contrainte de budget, des disciplines entières ne sont jamais vues.
4. Un early-stop fondé sur la « ressemblance » des dernières évaluations n'est pas démontrable sur les données réelles ; un
   early-stop fondé sur la **suffisance par dimension** (T admis par angle, vivier épuisé) l'est, mais ne se déclenche que si le vivier
   est riche — il n'aurait rien économisé sur ces deux runs, il protège les runs futurs à vivier riche.
5. La réduction substantielle demandée (≤ 2,50 USD) ne peut venir que du **coût unitaire de l'évaluation** (routage de modèle),
   ce qui exige un benchmark de qualité avant toute bascule par défaut.
