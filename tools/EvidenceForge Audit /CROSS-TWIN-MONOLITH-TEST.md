# CROSS-TWIN-MONOLITH-TEST — reuse inter-jumeaux dans le chemin réel du monolithe (v1.0.4)

Tests `V1`, `V2`, `V3`, `V4` de `test/test-monolith.js` (hors ligne ; le fournisseur est simulé au niveau `fetch` — le transport `lib/llm.js`, le magasin de reuse `llm-reuse-store` et la politique gelée `llm-response-reuse.js` sont **réels**, comme le lot MONO-11 v0.3-r1 chargé par la garde de sceau).

## Montage
- Run synthétique du harnais du lot gelé (`MONO-11/v0.3-r1/test/harness.js`, lecture seule) → deux jumeaux distincts A et B, un schéma de revue à 3 dimensions.
- Même document cible (2 phrases), même citation fautive (jonction non contiguë de 2 fragments) sur la dimension 1, **constats différents** (`CONSTAT-A …` / `CONSTAT-B …`).
- Deux citations littérales distinctes : **X** = première phrase, **Y** = seconde phrase. Le script de réponses : passe 1 = revue complète avec la citation fautive ; passe 2 = `{"repairs":[…]}` avec X pour A, Y pour B.
- `createLlm({ sealHash: SEAL.runtimeSealSha256 })` (sceau v0.3-r1), `runEnforcedReview` du lot (maxPasses = `config.llm.reviewMaxPasses` = 3), `onValidation` du transport.

## Résultats
| Ordre | Appels réels | Reuse | Empreintes | Prompts p2 | Citation A | Citation B |
|---|---|---|---|---|---|---|
| A → B (V1) | 4 (`counts().real = 4`) | 0 | distinctes | distincts (`promptSha256` ≠) | X | Y |
| B → A (V2) | 4 | 0 | distinctes | distincts | X | Y |

Vérifications supplémentaires (V1/V2) : le corps HTTP de la passe 2 (`messages[0].content`) contient `CONTEXTE DE REPARATION … empreinte=<fingerprint>` et son `sha256` est exactement `trace.passes[1].promptSha256` (transmission byte-exacte, aucune normalisation) ; le magasin contient deux entrées `VALID` à `promptSha256` distincts ; chaque entrée réelle porte `sourceSealHash = 9fbef412…` (v0.3-r1) et `validationContract = MONO-11-v2`.

## Same-context (V3)
Même jumeau A, même constat, même document : 1re exécution = 2 appels réels ; 2e exécution = passe 1 rejouée réellement (une réponse INVALID n'est jamais réutilisée — politique v0.2 inchangée) puis **`REUSE_VALID` de la réparation** (`counts().reused = 1`), même empreinte, même `promptSha256`. STOP/reprise simulé (nouvelle instance `createLlm`, nouveau dossier de run, même magasin persisté, `extraCacheDirs` vers le cache d'origine) : 1 appel réel (passe 1) + 1 reuse ; empreinte identique ; `findings` sérialisés identiques à la 1re exécution ; journal sans `LLM_REUSE_REFUSED`.

## REPAIR_CONTEXT_REQUIRED (V4)
`targetedRepairPrompt` du lot sans `context` (ou avec empreinte vide) → `REPAIR_CONTEXT_REQUIRED`. `lib/` du monolithe ne contient ni `targetedRepairPrompt`, ni `informedRepairPrompt`, ni `buildReviewPrompt`, ni « REPRISE CIBLEE » : aucun fallback vers un prompt v0.3 non contextualisé n'est possible. Lot v0.3-r1 : 0 divergence de sceau après les tests.

## Témoin de la collision v0.3 (rappel)
`reports/CROSS-TWIN-REPRO-v0.3-witness.json` : sous v0.3, le même montage donnait des prompts byte-identiques et `REUSE_VALID` de la réparation de A pour B. Sous v1.0.4 (v0.3-r1), V1/V2 : 0 reuse croisé.

```
CROSS_TWIN_REUSE_MONOLITH = BLOCKED
SAME_CONTEXT_REUSE_MONOLITH = PASS
STOP_RESUME_REUSE = PASS
```
