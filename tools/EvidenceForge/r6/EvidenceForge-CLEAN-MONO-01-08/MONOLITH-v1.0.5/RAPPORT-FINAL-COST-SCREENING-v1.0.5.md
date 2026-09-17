# RAPPORT FINAL — CHANTIER CORRECTIF POST-RUN RÉEL (MONOLITH-v1.0.5, CANDIDAT)

Date : 2026-09-17. Base : MONOLITH-v1.0.4 (GELÉE, zip `97b999adcff395ab49f7cd33e8e70bab767c7df22ffdda0967771db5595dd961`).
Livrable : `MONOLITH-v1.0.5/` à côté de v1.0.4, dans `tools/EvidenceForge/r6/EvidenceForge-CLEAN-MONO-01-08/` du dépôt
`c-concept-dev/C-Concept-Dev` (main). Phases A (autopsie) → B (plan) → C (implémentation) → D (validation) → E (ce rapport).

## 1. Cause racine de chaque problème (preuves dans `AUTOPSIE-POST-RUN-COST-SCREENING.md`)

| # | Problème | Cause racine |
|---|---|---|
| P0 | coût invisible | l'`usage` fournisseur était journalisé (`lib/llm.js:129`) mais **jamais valorisé** ; les kits EF-01B/EF-01C1 gelés jettent l'enveloppe (`real-llm-call.js:139`) ⇒ aucun usage pour 2–5 appels par run ; l'interface n'exposait que des compteurs d'appels |
| P1 | pas de budget | aucun mécanisme (0 occurrence de `budget`) |
| P2 | pas d'estimation | aucun estimateur ; les unités (candidats sélectionnés, jumeaux, revues) existaient dans les artefacts sans jointure |
| P3 | 150 = garde | correct par construction (`capApplied:false` à 123) ; mais `candidateRef` fourni par MONO-11 à chaque appel n'était pas persisté (`lib/llm.js:127`) ⇒ coût par professionnel impossible |
| P4/P5 | screening déséquilibré, méthode ≠ domaine | le prompt de screening (`screening-evidence.js:31-35`) raisonne **une source ↔ la mission** ; aucun artefact de niveau corpus ; aucune question de transposabilité méthodologique |
| P6 | pas d'aide au cadrage | reformulation uniquement **après** création du run |
| P7 | pas d'aide | aucun élément d'aide dans `index.html` |

## 2. Fichiers modifiés (couche additive, MONOLITH-v1.0.5 uniquement)
`lib/llm.js` (hooks ledger/budget, codes `BUDGET_LIMIT_REACHED`/`PRICING_UNKNOWN_FOR_MODEL` verrouillés) · `lib/mono04-fence-adapter.js`
(garde + capture usage sur le chemin kit) · `lib/llm-transport.js` (sonde MONO-10 : registre, garde, `costUsd`) · `lib/stage-ef01.js`
(passage de `cost` aux kits) · `lib/pipeline.js` (ledger/garde par run, `RESUMABLE`, revue de portefeuille, économie au rapport,
`updateBudget`/`costView`/`economicsView`) · `lib/run-store.js` (`publicState.cost`) · `lib/stage-report.js` (section `cost` du
rapport) · `server.js` (4 routes) · `index.html` (bloc coût, budget, Porte 2, cadrage, aide, onglets expert) ·
`config/monolith.config.json` (version, `pricing`, `budget`, `portfolio`) · `tools/anti-hardcoding-scan.js` · `tools/build-manifest.js` ·
`tools/package.sh` · `test/test-monolith.js` (chargement de `test/test-v105.js`) · `README.md`, `NON-REGRESSION.md`, `FROZEN-HASHES-BEFORE-AFTER.md`.

## 3. Fichiers nouveaux
`config/llm-pricing.json` · `lib/pricing.js` · `lib/cost-ledger.js` · `lib/budget-guard.js` · `lib/cost-forecast.js` · `lib/cost-view.js` ·
`lib/corpus-portfolio-review.js` · `lib/professionals-economics.js` · `lib/preflight-assistant.js` · `test/test-v105.js` (36 tests) ·
`tools/browser-tests-v105.js` (20 tests navigateur) · `tools/reconstruct-cost.js` (lecture seule) · `AUTOPSIE-POST-RUN-COST-SCREENING.md` ·
`PLAN-CORRECTIF-COST-SCREENING-v1.md` · ce rapport.

Byte-identiques à v1.0.4 : `lib/stage-professionals.js`, `lib/professional-selection.js`, `lib/stage-retrieval.js`,
`lib/screening-evidence.js`, `lib/stage-mission.js`, `lib/paths.js`, `vendor/operator-kit-r1.3/*`, `governance/*`, et les fonctions
`confirmPlan`, `ratifySources`, `buildAuditDecisions`, `saveCheckpoint`, `loadCheckpoint`, `checkpointHash`, `writeAtomic`.

## 4. Architecture finale
```
appel réel (3 chemins)                      budget-guard.assertAllowed()  ── AVANT ──▶ refus BUDGET_LIMIT_REACHED (verrou, STOPPED reprenable)
  lib/llm.js (principal + preflight) ─┐
  wrapMono04 (kits EF-01B/EF-01C1) ───┼──▶ cost-ledger.record() ──▶ runs/<id>/cost-ledger.jsonl (append-only) + pricing-snapshot.json
  llm-transport.probe (MONO-10) ──────┘        │                       ▲ tarif : config/llm-pricing.json (autorité unique, versionnée)
                                              ▼
  publicState.cost · GET /api/runs/:id/cost = cost-view { actual (ledger) | budget (budget.json) | progress | forecast (cost-forecast, séparé) }
  RETRIEVAL : buildScreeningEvidence ──▶ corpus-portfolio-review (notADecision) ──▶ corpus-portfolio-review.json ──▶ gateView.portfolio ──▶ Porte 2 humaine (inchangée)
  REPORT    : professionals-economics ──▶ professionals-economics.json (mesure ; earlyStop.policy = NONE) ; report.cost = ACTUAL_COST
  hors run  : POST /api/preflight ──▶ preflight-assistant (propose ; ne crée rien, ne confirme rien) ; ledger runs/_preflight/
```

## 5. Tests (Phase D)
- `node test/test-monolith.js` : **116/116** (80 tests v1.0.4 conservés + 36 nouveaux : COST-01…12, FORECAST-01…04,
  SCREEN-PORTFOLIO-01…07, PROF-ECON-01…04, PREFLIGHT-01…03, HELP-01, NONREG-01…06) — `test/results.json`.
- `node tools/browser-tests-v105.js` (Chrome headless, serveur v1.0.5 sans identifiants) : **20/20** — `test/browser-results-v105.json`.
- Suite v1.0.4 rejouée depuis le miroir dépôt : 80/80 (v1.0.4 intacte, `results.json` restauré).
- `tools/secret-scan.js` : 0 hit (61 fichiers, valeurs réelles d'environnement vérifiées absentes).
- `tools/anti-hardcoding-scan.js` avec `EVIDENCEFORGE_CASE_ARTIFACTS` = artefacts du run réel `efm-20260917-f8a95282`
  (screening-evidence, sources-enriched, professionals-discovery, lecture seule) : **654 jetons de cas, 0 hit**.
- `node tools/build-manifest.js --verify` (v1.0.4) : 47/0.
- Test de coût synthétique déterministe : COST-03 (4,725 USD exact sur tarif de test), COST-09 (sommes par étape), COST-07/08
  (total = somme du ledger, append-only).
- Test budget/reprise : COST-06 (STOPPED / BUDGET_LIMIT_REACHED, 0 appel après le plafond), COST-07/08 (reprise sans augmentation
  ⇒ STOPPED sans appel ; augmentation ⇒ COMPLETED).
- Test portfolio : SCREEN-PORTFOLIO-01…07 (redondance, non-décision, sous/sur-couverture, méthode hors domaine, aucun hardcoding,
  Porte 2 humaine).

## 6. Hashes gelés avant / après
Voir `FROZEN-HASHES-BEFORE-AFTER.md` : tous identiques (MONO-01 `4ba8903c…`, MONO-09 `f1f1e94b…`, MONO-10 `e050af05…` / zip
`f5a41654…`, MONO-11 v0.3-r1 `9fbef412…` / zip `3c44b397…` / `runCodeHash e156590d…`, MONOLITH v1.0.4 `88ad827e…` / zip `97b999ad…`).
`FROZEN_LOTS_CHANGED = NO`. Le hash du zip v1.0.5 est consigné hors paquet (message de commit).

## 7. Coût réel désormais observable
- Par appel : ligne du ledger (`kind`, `stage`, `purpose`, `model`, `usage` normalisé, `cost` détaillé, `priced`, `pricingVersion`,
  `candidateRef`/`twinId`/`targetId`).
- Par run : `GET /api/runs/:id/cost` et `publicState.cost` (dépensé, dernier appel, réels, reuse, coût de l'étape, non tarifés).
- Par étape / modèle / finalité : `totals.byStage|byModel|byPurpose` ; rapport final `report.cost` (ACTUAL_COST).
- Rejeu exact : `pricing-snapshot.json` (version + hash) par run ; dérive de tarif signalée, jamais appliquée rétroactivement.
- Runs antérieurs : `tools/reconstruct-cost.js <runDir>` (lecture seule) — mesures du 2026-09-17 sur les runs réels :
  `efm-20260917-cf6101c7` (complet, Sonnet 4.6) **12,49 USD** (PROFESSIONALS 9,27 · TWINS_REVIEWS 2,72 · RETRIEVAL 0,48 · MISSION 0,02 ; 244 appels) ;
  `efm-20260917-f8a95282` (JMJS, en cours) **6,92 USD** à 104 appels ; `efm-20260916-7990da62` (Opus, interrompu) **7,94 USD**.
  Limite déclarée : les appels des kits (2–5 par run) n'ont pas d'usage journalisé avant v1.0.5 — c'est précisément l'angle mort
  que le chemin `KIT_CALL` ferme pour les runs v1.0.5.

## 8. Fonctionnement du budget
`budget.json` par run (hors `state.json`) : `costBudgetUsd`, `warningThresholdUsd`, historique des modifications. Fixé à la création
(`POST /api/runs` `budget`) ou à tout moment (`POST /api/runs/:id/budget`, depuis la page). Vérifié **avant** chaque appel réel sur
les trois chemins. `dépensé ≥ plafond` ⇒ aucun appel, verrou de transport, `STOPPED / BUDGET_LIMIT_REACHED` (dans `RESUMABLE`),
checkpoint conservé, message utilisateur ; reprise = augmenter puis « Reprendre le run » ; reprise sans augmentation = nouvel arrêt
**sans aucun appel**. Alerte : événement utilisateur unique par seuil. Modèle non tarifé + budget ⇒ `PRICING_UNKNOWN_FOR_MODEL`
(fail-closed). Dépassement maximal possible = le coût d'un seul appel (contrôle avant, jamais après) — documenté, pas de
troisième porte (`requireConfirmationAtUsd` non implémenté, volontairement).

## 9. Fonctionnement de la projection
`lib/cost-forecast.js`, séparé de la comptabilité, sans aucun tarif : étapes terminées = mesurées ; PROFESSIONALS en cours = (p25 /
moyenne / p75 du coût par candidat **mesuré dans ce run**, ≥ 3 mesures) × candidats restants (`selectedCount − évalués`) ;
TWINS_REVIEWS en cours = idem par revue ; étapes non commencées = référence historique (runs COMPLETED du même dossier **avec
ledger**) ou `UNKNOWN`. Sortie `{ actualUsd, forecast:{status: PROJECTED|PARTIAL|COMPLETE, low, central, high, lowerBound,
unknownStages}, perStage, method, notGuarantee:true, label:"ESTIMATE — NOT GUARANTEE" }`. `PARTIAL` donne une borne basse
(« au moins … ») et liste ce qui n'est pas projetable : rien n'est inventé.

## 10. Fonctionnement du Portfolio Review
`lib/corpus-portfolio-review.js`, appelé après `buildScreeningEvidence`, avant la Porte 2 ; artefact `corpus-portfolio-review.json`
(`notADecision:true`). Partie déterministe (toujours produite) : groupes de redondance (TF-IDF cosinus titre+résumé, composantes
connexes ≥ `portfolio.redundancySimilarityThreshold`), valeur marginale lexicale, carte de couverture par angle (lignée de requête),
sous-couverture (0/1 incluse, ou aucune source trouvée), surreprésentation (part > facteur × part uniforme), diversité des types.
Partie LLM (schéma fermé, preuves littérales vérifiées, 3 passes, budget contrôlé) sur les sources proposées **exclues** avec résumé :
`domainRelevance` et `methodologicalRelevance` distincts, `methodologicalInterest`, angles concernés ⇒
`methodologicalCrossDomainCandidates` (méthode ≠ basse et domaine ≠ haute). Indisponibilité déclarée (`llmStatus`), jamais bloquante
pour la porte ; une panne de transport verrouillée arrête le run comme ailleurs. Porte 2 : vue d'ensemble au-dessus de la liste
inchangée, étiquettes par source ; aucun bouton automatique ; ratification = seul acte (nom obligatoire, hash de la preuve de screening).
Aucun domaine, mot-clé ou nom de cas (scan + mutation).

## 11. Assistant de cadrage IA — statut : IMPLÉMENTÉ (hors run, propositionnel)
`POST /api/preflight` + bouton « Vérifier ma demande avec l'IA » : 1 appel réel (+1 reprise), journalisé dans `runs/_preflight/`
(coût affiché), schéma fermé (clarté, neutralité, problèmes typés avec extraits littéraux, questions à trancher, reformulation
proposée). Contrat tenu : l'original est rendu tel quel (hash), la zone de saisie n'est modifiée que par un clic explicite
(« Utiliser cette reformulation »), « Revenir à ma demande d'origine » restaure, « Garder ma demande » ne change rien ; aucun run
créé, `confirmPlan` byte-identique. Aucun contrat gelé impliqué.

## 12. Aide utilisateur — statut : IMPLÉMENTÉ
Bouton « Aide » (en-tête), panneau masqué par défaut, fermable : ce qu'est/n'est pas EvidenceForge, étapes, Porte 1/2, jumeaux,
lecture du rapport (établi / convergent / divergent / provisoire / non établi, « Pourquoi EvidenceForge dit cela ? »), coût et
budget, cadrage, limites et reprises. Sans code technique en mode simple (U1, HELP-01).

## 13. Limites restantes
- Le dépassement de budget est borné par le coût **d'un** appel (contrôle a priori sans estimation de l'appel à venir).
- Sans historique de runs v1.0.5 terminés, les étapes non commencées sont `UNKNOWN` (projection `PARTIAL`) jusqu'à ce que des mesures existent.
- Les appels des kits sont valorisés sur le modèle **observé** dans l'enveloppe (`result.result.model`) ; un fournisseur qui ne
  renverrait pas `model` retomberait sur le modèle demandé.
- La revue de portefeuille juge sur métadonnées et résumés (comme le screening) : jamais sur le texte intégral.
- `professionals-economics.json` : `newCoverage`/`duplicateCoverage` ne sont connus qu'après le checkpoint (preuves MONO-11) ;
  le rang suit l'ordre de sélection déterministe, pas un ordre de pertinence.
- Aucun run réel n'a encore été exécuté **sous v1.0.5** (les runs réels cités sont des preuves v1.0.4, lues seulement).

## 14. Dette restante
- Politique d'early-stop : à concevoir **après** plusieurs runs réels v1.0.5 (`professionals-economics.json`), avec invariants
  déclarés ; rien d'implémenté (volontaire).
- Tarification : autorité versionnée à maintenir par l'exploitant (`config/llm-pricing.json`, `verifiedAt`) ; pas de vérification
  automatique auprès du fournisseur.
- L'onglet expert « Coût (ledger) » affiche le JSONL brut ; une vue tabulaire par professionnel est fournie par l'onglet « Économie du panel ».
- `FUNCTIONAL-TEST-REPORT.md` et `UX-ACCEPTANCE.md` restent ceux de v1.0.4 (à compléter par un run réel v1.0.5).

## 15. Verdict technique
**GELABLE (candidat)** — sous réserve : (1) d'un run réel complet sous v1.0.5 avec budget, dont le ledger et la projection sont
confrontés au solde fournisseur ; (2) d'un audit indépendant différentiel v1.0.4 → v1.0.5. Je ne déclare pas GELÉ.
