# MONOLITH-v1.0.10 — EF-03B REVIEW RESILIENCE — RAPPORT DE LOT

**Date :** 2026-09-19 · **Base :** MONOLITH-v1.0.9 (candidat GELABLE, zip `174fa8c3…`, intacte) · **Définition :** `v1.0.10 = v1.0.9 + EF-03B REVIEW RESILIENCE` et rien d'autre.
**Coût du lot :** 0 USD — aucun appel fournisseur ; autopsie, replay et import en lecture seule (`--dry-run`) ; tests avec le lot gelé MONO-11 exécuté réellement sur un LLM factice. Documents : `EF03B-REAL-RUN-AUTOPSY-v1.md`, `EF03B-FAILURE-TAXONOMY-v1.{json,md}`, `EF03B-REPAIR-DESIGN-v1.md`, `EF03B-COST-ANALYSIS-v1.{json,md}`, `EF03B-REPLAY-v1.{json,md}`.

## 1. Autopsie (run réel `efm-20260918-a64167c0`, tentative finale 9, run COMPLETED / NOT_QUALIFIED)

| | |
|---|---|
| revues attendues / VALID / ERROR | 18 / 10 / 8 |
| passes de la tentative finale | 49 (BASE 18 · INFORMED 16 · TARGETED 15) — 11,27 USD ; toutes tentatives EF-03B : 20,95 USD |
| **A. troncature `max_tokens`** | 21 passes (p1 : 11, p2 : 5, p3 : 5), 5,68 USD, 148 s de moyenne ; 8–9 findings complets sur 10 à chaque fois ; **5 revues ERROR** (3 troncatures successives) ; 0 récupération directe par régénération complète |
| **G. `TARGET_REF_NOT_LITERAL`** | 18 passes, 4,04 USD ; 173 citations rejetées : Markdown aplati 37, items de liste joints 87, espaces / sauts de ligne 6, partielles 41, paraphrases 2 ⇒ **75 % ont un span exact déterministe** ; réparation ciblée gelée : 15 passes, 9 VALID (0,149 USD / passe) ; **3 revues ERROR** |
| autres catégories (B–F, H–M) | 0 observé (cardinalité, dimensions, clés, enums : jamais en défaut) |
| coût moyen revue VALID / ERROR / passe | 0,517 / 0,763 / 0,230 USD |
| revues déjà VALID en tentative 7 recalculées en 9 | 11 (6,34 USD) ; 4 VALID perdues (2 encore réutilisables aujourd'hui, 2 dont les preuves du jumeau ont changé) |
| `max_tokens` | 8192 < sortie contractuelle mesurée (complètes : 6,2–8,2 k jetons ; médiane 7,6 k) |

Réponses aux 10 questions de la phase 2 : `EF03B-REAL-RUN-AUTOPSY-v1.md § 6`.

## 2. Ce qui change (MONOLITH uniquement ; lots gelés intacts)

| Fichier | Nature |
|---|---|
| `lib/ef03b-resilience.js` (AJOUTÉ, adaptateur additif) | registre des revues VALID ; budget de sortie ; troncature ⇒ sauvetage structurel + complétion ciblée + fusion déterministe ; littéralisation sur extraits avec empreinte de contexte ; trace par passe |
| `lib/pipeline.js` | branchement de l'adaptateur sur le `llm` remis à l'aval (`stage-professionals.js` **byte-identique** à v1.0.9) ; `ef03b-resilience.json` ; `replayReviews` ; `RESUMABLE += REVIEWS_REPLAY_REQUESTED` |
| `lib/llm.js` | `meta.maxTokens` (défaut 8192 conservé), `stopReason` exposé, `recordReuse` (registre ⇒ ledger `REUSE`, compteur réutilisé) ; journal : `maxTokens`, `strategy` |
| `config/monolith.config.json` | `llm.reviewMaxTokens = 12288`, `llm.reviewResilience { … }` |
| `server.js` · `index.html` | `POST /api/runs/:id/replay-reviews` ; bouton « Rejouer les revues des jumeaux » (aucun code technique en mode simple) |
| `lib/live-status.js` · `lib/cost-view.js` | compteurs `ef03b` (reuses, troncatures, complétions, littéralisations, validées, coût cumulé) |
| `tools/ef03b-autopsy.js` · `tools/ef03b-registry-import.js` (AJOUTÉS) | autopsie / taxonomie / coût / replay hors ligne ; import du registre après re-validation gelée |
| `test/test-ef03b.js` (AJOUTÉ, T-EF03B-01…26) · `test/test-monolith.js` (V4 : frontière explicite v1.0.10 ; chargement) · `test/test-stream.js` (version) | |
| `tools/build-manifest.js` · `tools/package.sh` · `README.md` | |

Inchangés : `stage-professionals.js`, `llm-stream.js`, `provider-diagnostic.js`, proxy v0.8, `panel-sufficiency.js` (`fd05e26b…`), `economic-panel.js`, `budget-guard.js`, `run-stop.js`, lots gelés MONO-01/09/10/11 (0 divergence), MONOLITH-v1.0.9 en place.

## 3. Invariants garantis

| Exigence | Garantie | Test |
|---|---|---|
| Contrat scientifique jamais relâché | validateur local + parseur EF-03B du lot gelé, seuls à accepter ; l'adaptateur n'accepte rien ; candidat de registre altéré ⇒ refusé ⇒ appel réel | T-EF03B-20, V4 |
| Troncature jamais soumise comme complète | `REVIEW_OUTPUT_TRUNCATED`, brut marqué INVALID, sauvetage structurel seul, complétion ciblée des dimensions manquantes | T-EF03B-02/03/05 |
| Retry ciblé, fusion déterministe, findings conservés byte-identiques, provenance intacte | `mergeFindings` pure ; `reusedFieldsCount` / `regeneratedFieldsCount` | T-EF03B-04/05/06/07/08 |
| Aucune modification silencieuse du sens ; aucune citation réparée localement | littéralisation = proposition + choix du modèle (`[]` accepté) ; empreinte de contexte | T-EF03B-09/14 |
| Fail-closed inchangé (3 passes) | lot gelé | T-EF03B-10 |
| 10 VALID ⇒ 0 appel ; 8 non VALID ⇒ 8 appels ; interruption ⇒ reuse | registre par run, écrit à chaque validation | T-EF03B-11/12/13 |
| Familles d'échec reproduites | Markdown / items joints / espaces / cases ; drift ; doublon ; clé absente ; enum | T-EF03B-14…18 |
| 8192 évité si structure complète | `max_tokens` 12288 transmis ; réponse complète ~9 k jetons acceptée sans complétion | T-EF03B-19 |
| Transport v1.0.9 / Panel Sufficiency / MISSION_DOSSIER inchangés | byte-identiques | T-EF03B-21/22/23 |
| Replay ciblé depuis le checkpoint professionnel | aval seul, archive, panel jamais reconstruit, refus sans panel | T-EF03B-26 |
| anti-hardcoding / secrets | 0 / 0 | T-EF03B-24/25 |

## 4. Replay hors ligne (`EF03B-REPLAY-v1.md`)

| Niveau | Résultat |
|---|---|
| OLD | 18 attendues, 10 VALID, 8 ERROR ; 11,27 USD (tentative 9), 20,95 USD (toutes tentatives) |
| ACTUALLY_PROVEN | 10 VALID réutilisables à 0 appel (registre ; `ef03b-registry-import.js --dry-run` : 10 candidats re-validés par le lot gelé) ; **2 ERROR récupérables à 0 appel** (candidats VALID de la tentative 7 re-validés aujourd'hui par le validateur gelé et le parseur EF-03B gelé) ; 2 ERROR avec candidat historique non réutilisable (preuves du jumeau changées) ; 21/21 sorties tronquées contenaient 8–9 findings complets ; 130/173 citations rejetées ont un span exact |
| SIMULATED | 6 revues candidates (3 troncature terminale, 3 littéralité terminale) : 6–18 appels, **1,59–2,59 USD** (unités mesurées) contre 4,49 USD dépensés pour ces mêmes revues ; 16 régénérations complètes évitées |
| EXPECTED_NOT_YET_PROVEN | réussite des 6 revues ; stabilité des jumeaux au replay (3/17 ont changé de preuves entre t7 et t9 par la couverture rejouée — contrat gelé) |

## 5. Objectif économique (mesuré → simulé)

- Revue tronquée : OLD 0,81 USD pour 3 troncatures (5 revues, 4,05 USD, 0 résultat) → NEW ≤ 0,43 USD à la passe 1 (passe complète 0,265 + complétion 0,149 + littéralisation 0,02).
- Revue VALID recalculée à la reprise : OLD 0,58 USD en moyenne (11 revues, 6,34 USD) → NEW 0.
- Régénération complète (0,267 USD, 0 VALID direct sur 16) : évitée par construction pour la troncature ; reste le dernier recours du lot gelé.
- Littéralisation : 0,149 USD (document entier) → ≈ 0,02 USD (extraits).

## 6. Limites et suites

1. **Audit indépendant** du lot avant tout run réel.
2. Import du registre du run réel (acte propriétaire, hors ligne, 0 appel) : `node tools/ef03b-registry-import.js <runDir>` (12 entrées attendues), puis `POST /api/runs/:id/replay-reviews`, puis reprise : 12 revues servies sans appel, 6 recalculées (≈ 2–3 USD + couverture rejouée ≈ 0,6 USD + agrégation) — budget LIMITED 50 USD (33,95 dépensés).
3. Stabilité des jumeaux au replay (couverture EF-02D3 rejouée, non déterministe) : hors périmètre, contrat gelé ; consigné dans `EF03B-REPAIR-DESIGN-v1.md § 3`.
4. Le taux de réussite réel des complétions / littéralisations n'est pas mesuré ; seul le run réel autorisé le prouvera.

## 7. Verdict technique

**MONOLITH-v1.0.10 — GELABLE** (candidat, après audit indépendant et run réel de récupération). Le gel appartient au propriétaire / à l'audit indépendant.
