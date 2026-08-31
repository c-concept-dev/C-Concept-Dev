# REAL ADAPTER MODEL AUDIT (Phase 1)

## Recherche exhaustive de `claude-3-5-haiku-latest` dans le dépôt (avant correction)

```text
./EvidenceForge/MONO-08/v0.6-preflight-fix-r3-evidence-2026-08-31/LLM-PREFLIGHT-MODEL-SOURCE.md   (4 lignes)
./EvidenceForge/MONO-08/v0.6-preflight-fix-r3-evidence-2026-08-31/README-FIRST.md                 (1 ligne)
./EvidenceForge/MONO-08/v0.6/worker/evidenceforge-llm-proxy/test/worker.test.js                    (1 ligne)
./EvidenceForge/MONO-08/v0.6/test/test_t08_v06_delegated_auth.js                                   (3 lignes)
./EvidenceForge/MONO-08/v0.6/lib/real-external-adapter.js:49                                       (1 ligne)  <- REAL PATH
./EvidenceForge/MONO-08/v0.6/lib/preflight.js:53                                                   (1 ligne, commentaire)
```

## Classification

| Occurrence | Classification | Action |
|---|---|---|
| `v0.6-preflight-fix-r3-evidence-2026-08-31/LLM-PREFLIGHT-MODEL-SOURCE.md` (×4) | DOC (dossier de preuve historique r3, décrit le bug déjà corrigé côté préflight) | Non modifié |
| `v0.6-preflight-fix-r3-evidence-2026-08-31/README-FIRST.md` | DOC (idem) | Non modifié |
| `worker/evidenceforge-llm-proxy/test/worker.test.js:52` (`VALID_PAYLOAD`) | TEST/FIXTURE — payload de test pour la validation de forme du Worker (`isValidMessagesPayload`), indépendant de la validité réelle du modèle ; fichier Worker explicitement hors périmètre de ce lot | Non modifié |
| `test/test_t08_v06_delegated_auth.js:295-296` (LLM2) | TEST — assertion négative « jamais l'ancien hardcode », déjà correcte et nécessaire | Non modifié |
| `test/test_t08_v06_delegated_auth.js:308` (LLM3) | TEST/FIXTURE — reproduit le corps d'erreur 404 réel historique pour tester la classification | Non modifié |
| **`lib/real-external-adapter.js:49`** | **REAL PATH** — payload réel envoyé via `gateway.executeRequest()` au Worker delegated/direct pour la génération réelle de contenu | **Corrigé** |
| `lib/preflight.js:53` | DOC (commentaire décrivant le bug déjà corrigé r3, sans effet runtime) | Non modifié |

## Fichier concerné — `lib/real-external-adapter.js`

- **Ligne concernée (avant)** : 49 — `payload: { model: "claude-3-5-haiku-latest", max_tokens: 1024, messages: [{ role: "user", content: prompt }] }`
- **Fonction** : `buildRealLlmWorkerCallFn(mono04, missionContext)`, appelée par `bin/run-real-smoke.js` (2 sites d'appel, non modifiés) pour construire la fonction de callback LLM du pipeline REAL.
- **Mécanisme de configuration actuel (avant)** : aucun — modèle hardcodé en dur, aucune variable d'environnement, aucune abstraction.
- **Tests existants (avant)** : aucun — `lib/real-external-adapter.js` n'était couvert par aucun fichier de `test/` avant ce lot.
- **Impact exact du bug** : tout run REAL (`bin/run-real-smoke.js`, non exécuté par ce lot) échouerait avec un HTTP 404 `not_found_error` d'Anthropic pour ce modèle, exactement la même cause racine que le bug déjà corrigé côté PREFLIGHT (correctif r3).
- **Dépendances** : `mono04.gateway.executeRequest()` (Gateway MONO-04, inchangé, lu en lecture seule) ; le routage `direct`/`delegated` (choix du secret `ANTHROPIC_API_KEY` vs `EVIDENCEFORGE_WORKER_API_KEY`) est géré exclusivement par `lib/real-provider-configs.js`, jamais par ce fichier — confirmé par lecture complète de `real-provider-configs.js` (aucune référence à un modèle, uniquement `endpoint`/`requiredSecret`/`headers`).

## Contrat (Phase 2)

Recherche dans `MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md` et
`MONO-08-v0.6-ACCEPTANCE-MATRIX.md` de tout identifiant de modèle Anthropic figé :

```text
$ grep -n "claude-3-5-haiku|claude-haiku|identifiant de modele|modele.*fige" *.md
(aucun résultat)
```

Le CDC ne fige que : le mode `delegated`, le Worker `evidenceforge-llm-proxy`, le
provider Anthropic, et la structure requête/réponse (`content[0].text`). Aucun
identifiant de modèle précis n'est contractuel. **La correction de modèle est donc une
maintenance provider autorisée, pas un changement de contrat — pas de STOP requis.**
