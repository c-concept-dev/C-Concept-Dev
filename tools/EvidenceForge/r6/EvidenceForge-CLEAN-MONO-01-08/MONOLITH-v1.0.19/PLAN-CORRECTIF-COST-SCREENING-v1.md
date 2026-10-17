# PLAN CORRECTIF v1 — COÛT · BUDGET · PROJECTION · SCREENING GLOBAL · ÉCONOMIE DU PANEL · CADRAGE · AIDE

Candidat : **MONOLITH-v1.0.5** (dossier `MONOLITH-v1.0.5/`, à côté de v1.0.4 GELÉE, jamais écrasée).
Toutes les modifications sont dans la **couche additive du monolithe** (`lib/`, `server.js`, `index.html`, `config/`,
`test/`, `tools/`). Aucun fichier de MONO-01…MONO-11, EF-01B/EF-01C1, MONO-04 n'est touché (vérifié par sceaux au
démarrage et par les tests NONREG-01/02).

## 1. Fichiers

### Nouveaux (`lib/`)
| Fichier | Rôle |
|---|---|
| `config/llm-pricing.json` | **Autorité de tarification unique**, versionnée (`version`, `source`, `verifiedAt`), par modèle : `effectiveFrom`, `inputPerMillion`, `outputPerMillion`, `cacheWrite5mPerMillion`, `cacheWrite1hPerMillion`, `cacheReadPerMillion`, `currency` |
| `lib/pricing.js` | charge l'autorité, `resolve(model, at)`, `costOf(usage, entry)` (formule documentée), `snapshot()` → `{ version, hash, models }` |
| `lib/cost-ledger.js` | `runs/<runId>/cost-ledger.jsonl` **append-only** ; `pricing-snapshot.json` persisté au premier appel (`pricingVersion`, `pricingSnapshotHash`) ; `record()` pour REAL_CALL / KIT_CALL / PROBE / PREFLIGHT / REUSE ; `totals()` (total, par étape, par modèle, par finalité, entrée/sortie/cache, réels, reuse, non tarifés, dernier appel) ; registre par `runId`/`attemptRunId` pour les transports sans injection (sonde MONO-10) |
| `lib/budget-guard.js` | `runs/<runId>/budget.json` (hors `state.json` : jamais écrasé par le moteur) ; `assertAllowed()` **avant** chaque appel réel ⇒ `BUDGET_LIMIT_REACHED` (fatal, verrouillé, reprenable) ; alerte unique au seuil ; `PRICING_UNKNOWN_FOR_MODEL` fail-closed si un budget est posé et le modèle n'est pas tarifé |
| `lib/cost-forecast.js` | estimateur **séparé** de la comptabilité : unités (candidats sélectionnés, jumeaux, revues), moyenne mesurée dans le run, référence historique optionnelle (runs COMPLETED du même RUNS_ROOT), sortie `{ actual, estimate:{low,central,high}|UNKNOWN, perStage[], method, notGuarantee:true }` |
| `lib/cost-view.js` | assemble pour l'API : totaux réels + budget + projection + progression d'étape (`64/123`) |
| `lib/corpus-portfolio-review.js` | couche additive entre `MachineScreeningEvidence` et la Porte 2 : partie déterministe (groupes de redondance lexicale, carte de couverture par discipline de requête, sous/sur-représentation, diversité des types) + partie LLM à schéma fermé (`DOMAIN_RELEVANCE` / `METHODOLOGICAL_RELEVANCE` par source, complémentarité) ; `notADecision:true` |
| `lib/professionals-economics.js` | jointure sélection × évaluation × ledger × panel × jumeaux × revues → `professionals-economics.json` (rang, discipline, identityConfidence, eligibilityStatus, evaluationCost, cumulativeCost, panelContribution, newCoverage, duplicateCoverage, twinProduced, finalUse, courbe de gain marginal) ; `earlyStop.policy = "NONE"` |
| `lib/preflight-assistant.js` | « Vérifier ma demande avec l'IA » : 1 appel réel hors run, schéma fermé, jamais de modification silencieuse |

### Modifiés
| Fichier | Modification (additive) |
|---|---|
| `lib/llm.js` | `opts.ledger`, `opts.budget` : garde avant `httpCall` (`llmCallInner`, `preflight`), enregistrement après (usage, `candidateRef`/`twinId`/`targetId` du `meta`), reuse enregistré `reused:true` coût 0 ; `BUDGET_LIMIT_REACHED` ∈ `TRANSPORT_CODES` |
| `lib/mono04-fence-adapter.js` | `opts.cost = { ledger, budget, stage, purpose }` : garde avant `g.executeRequest`, capture de `result.result.usage/model` après (chemin kit EF-01B/EF-01C1) |
| `lib/llm-transport.js` | sonde : garde budget + enregistrement via le registre (clé `intent.runId`) ; `costUsd` renseigné dans le résultat (contrat MONO-10 le prévoit) |
| `lib/stage-ef01.js` | `realMono04(runDir, cost)` ; `runDisciplines`/`runPlanner` reçoivent `input.cost` |
| `lib/pipeline.js` | ledger + guard par run ; `setStage` → `ledger.setStage` ; `RESUMABLE` + `BUDGET_LIMIT_REACHED` ; budget initial dans `startRun` ; `CorpusPortfolioReview` après `buildScreeningEvidence` (échec LLM ⇒ revue partielle explicite, jamais bloquante) ; `professionals-economics.json` au REPORT ; `gateView` expose la revue ; `updateBudget()` |
| `lib/run-store.js` | `publicState` ajoute `budget` (depuis `budget.json`) et `cost` (totaux du ledger) — champs optionnels, runs v1.0.4 lisibles |
| `server.js` | `GET /api/runs/:id/cost`, `POST /api/runs/:id/budget`, `GET /api/runs/:id/economics`, `POST /api/preflight` ; `/api/config` expose `pricing.version` et les valeurs par défaut de budget |
| `index.html` | bloc « COÛT DU RUN » (dépensé, dernier appel, réels, reuse, étape + progression, coût de l'étape, projection bas/central/haut marquée ESTIMATE · NOT GUARANTEE, budget, reste) ; budget à la création + modification en cours de run ; Porte 2 : couverture par discipline, groupes redondants, méthodes génériques hors domaine ; bouton « Vérifier ma demande avec l'IA » ; « Aide » |
| `config/monolith.config.json` | `product.version = MONOLITH-v1.0.5` ; `pricing.file` ; `budget` (défauts nuls) ; `portfolio` (paramètres génériques documentés) |
| `tools/anti-hardcoding-scan.js` | jetons interdits étendus (noms de cas du run réel : `COSMIN`, titres de sources) ; `caseTokens()` lit aussi `titre`/`title` |
| `tools/build-manifest.js`, `tools/package.sh` | prédécesseur v1.0.4, statut CANDIDAT, zip v1.0.5 |
| `test/test-monolith.js` | +≈ 40 tests (COST, FORECAST, SCREEN-PORTFOLIO, PROF-ECON, PREFLIGHT, HELP, NONREG) |

## 2. Contrats additifs (schémas)
- `EvidenceForge.CostLedgerEntry` (une ligne) : `{ seq, at, runId, attemptId, stage, kind, purpose, model, providerRequestId, callId, reused, usage:{input,output,cacheWrite5m,cacheWrite1h,cacheRead}, cost:{inputUsd,outputUsd,cacheWriteUsd,cacheReadUsd,totalUsd}|null, priced, pricingVersion, candidateRef?, twinId?, targetId? }`
- `EvidenceForge.PricingSnapshot`, `EvidenceForge.RunBudget`, `EvidenceForge.CostView` (`actual` / `forecast` strictement séparés), `EvidenceForge.CorpusPortfolioReview`, `EvidenceForge.ProfessionalsEconomics`, `EvidenceForge.RequestPreflight`.

## 3. Invariants
1. Un appel réel ⇔ exactement une ligne `kind ∈ {REAL_CALL, KIT_CALL, PROBE, PREFLIGHT}` ; un reuse ⇒ une ligne `REUSE`, `cost.totalUsd = 0`, jamais comptée comme réelle.
2. Le tarif est lu **une seule fois** par run (snapshot persisté) ; le recalcul historique est exact (`pricingSnapshotHash`).
3. Le budget est vérifié **avant** chaque appel réel, sur les trois chemins (principal, kit, sonde) ; `total ≥ budget` ⇒ aucun appel, `STOPPED / BUDGET_LIMIT_REACHED`, checkpoint intact, reprise après augmentation explicite.
4. Le ledger n'entre dans **aucun checkpoint haché** (la reprise ne dépend jamais du tarif).
5. `CorpusPortfolioReview.notADecision = true` ; `buildAuditDecisions` et `ratifySources` inchangés ; aucun bouton d'optimisation automatique.
6. Cap 150 inchangé ; `professionals-economics.json` est une mesure ; `earlyStop.policy = "NONE"`.
7. L'assistant de cadrage ne crée pas de run, ne confirme rien, ne modifie la zone de texte que sur clic explicite ; la demande d'origine reste disponible.
8. Aucune règle contenant un nom de cas (scanner étendu, test de mutation).

## 4. Reprise et migrations
- Aucune migration : tous les nouveaux artefacts sont optionnels ; un run v1.0.4 s'ouvre (budget `null`, coût « non journalisé pour ce run »).
- Reprise après `BUDGET_LIMIT_REACHED` : `POST /api/runs/:id/budget` puis `POST /api/runs/:id/resume` ; sans augmentation, la garde arrête à nouveau **sans aucun appel**.
- `budget.json` est hors `state.json` : une mise à jour pendant l'exécution n'est jamais écrasée par le moteur.

## 5. UX
- Création : « Budget maximum (USD) » et « Alerte (USD) » facultatifs.
- Suivi : bloc coût mis à jour à chaque appel (événement `cost_update` sur le flux SSE) ; libellés utilisateur, aucun code technique.
- Porte 2 : vue d'ensemble (couverture, redondances, méthodes hors domaine) **au-dessus** de la liste inchangée ; la ratification reste le seul acte.
- Cadrage : panneau de résultats avec « Utiliser cette reformulation » / « Garder ma demande » / « Revenir à ma demande d'origine ».
- Aide : bouton en en-tête, panneau fermable, jamais affiché par défaut.

## 6. Risques
| Risque | Mitigation |
|---|---|
| Tarif obsolète | autorité versionnée, `source`/`verifiedAt` visibles dans `/api/config`, snapshot par run ; l'UI affiche la version |
| Modèle non tarifé | coût `null` + compteur `unpriced` ; **fail-closed** si un budget est posé |
| Dépassement d'un appel au-delà du plafond | contrôle avant chaque appel ⇒ dépassement borné par le coût d'un seul appel (documenté ; aucun seuil de confirmation ajouté) |
| Revue de portefeuille LLM en échec | partie déterministe toujours produite ; statut `UNAVAILABLE` explicite ; la porte s'ouvre |
| Projection trompeuse | `notGuarantee:true`, `UNKNOWN` quand aucune mesure, méthode et base affichées |
