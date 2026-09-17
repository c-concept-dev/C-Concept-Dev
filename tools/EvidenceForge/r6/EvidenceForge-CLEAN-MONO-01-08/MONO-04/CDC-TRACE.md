# MONO-04 — Traçabilité CDC

| Section CDC | Exigence | Implémentation | Statut |
|---|---|---|---|
| 1 | Gateway unique strict/testable | `lib/external-execution-gateway.js` | OK |
| 2 | Anti-dérive : inspection avant code | ExternalExecutionPort/ProfessionalPipelinePort/workerCallFn/createOpenAlexRunner/EF-02ABC-SMOKE-REAL-KIT inspectés en preuve | OK |
| 3 | Aucun contournement métier | `lib/` ne require() aucun module gelé ni port MONO-01.x | OK, T04-28 |
| 4 | Classification des dépendances conservée | `ExternalExecutionPort` (MONO-01.x) jamais modifié, EXTERNAL_STAGE_ADAPTER documenté séparément | OK, T04-24/25 |
| 5 | Contrats ExternalExecutionRequest/Result | `contracts/*.json` | OK |
| 6 | Secrets | `lib/secret-provider.js`, fail-closed | OK, T04-03/04/37/38 |
| 7 | Worker traité comme frontière explicite | `provider-registry.js` (endpoint/timeout/headers/format configurables, jamais codés en dur) | OK |
| 8 | OpenAlex/Crossref/PubMed : runner gelé réutilisé | `createGatewayFetchImpl` injecté dans le VRAI `createOpenAlexRunner` gelé | OK, T04-26 (smoke réel) |
| 9 | ExternalStageAdapter EF-02A/B/C | `lib/external-stage-adapter.js`, binding technique, jamais une UI pilotée | OK, T04-19/20 |
| 10 | Fail-closed partout | provider/secret/timeout/réseau/HTTP/réponse invalide | OK, T04-02/03/05/06/07/08/09 |
| 11 | Timeouts explicites | AbortController réel, jamais une attente infinie | OK, T04-05 |
| 12 | Retries respectant les politiques | technique, plafonné HARD_MAX_ATTEMPTS_CAP=5, jamais illimité | OK, T04-12/13/14 |
| 13 | Idempotence | cache in-process par requestId + empreinte déterministe (fingerprint) — conflit explicite si contenu différent | OK, T04-15/34 + T04-IDEMPOTENCE-CONFLICT-01 à 07 (correction post-audit) |
| 14 | Logging technique nettoyé | `lib/request-redaction.js` | OK, T04-16/17 |
| 15 | Validation des réponses | `lib/response-validation.js` | OK, T04-08/09/10/11 |
| 16 | Circuit breaker minimal | compteur par provider dans le Gateway, cool-down configurable | OK, test dédié T04-CB (seuil, ouverture, fermeture après cool-down) |
| 17 | MONO-03 non dupliqué | aucun ArtifactStore/RunStore réimplémenté | OK, T04-32 |
| 18 | Erreurs techniques (9 codes) | `lib/external-execution-errors.js` | OK |
| 19 | Tests T04-01 à T04-41 | `test/test_t04_*.js` — 56/56 PASS | OK |
| 20 | Tests avec serveur local réel | tous les tests réseau utilisent `http.createServer` réel, jamais un mock de fonction | OK |
| 21 | Pas de vrais appels externes réels | aucun appel vers openalex.org/anthropic réel dans la suite normale | OK |
| 22 | Recherche statique | aucune occurrence fonctionnelle interdite | OK |
| 26-28 | Cold extraction, manifest, non-régression | voir rapport final | OK |
| 29 | Interdictions (UI, pipeline E2E, nouvelle persistance/state machine/moteur métier) | aucune construite | OK |

## Bugs réels trouvés pendant la construction

1. **`isRetryableErrorCode`** classait `EXTERNAL_HTTP_ERROR` comme
   systématiquement retryable, y compris pour un HTTP 400 (jamais
   transitoire) — découvert par T04-14b (test réel contre un serveur HTTP
   local renvoyant 400 à répétition, 5 appels observés au lieu d'1).
   Corrigé : le retry HTTP n'est désormais autorisé que pour 429 et 5xx.

2. **`buildResult()`** ne remontait jamais `technicalDiagnostics.httpStatus`
   sur un échec (toujours `null`), y compris pour une `EXTERNAL_HTTP_ERROR`
   qui portait pourtant le vrai code HTTP dans `error.details.httpStatus`
   — découvert par T04-07 (6 codes HTTP réels testés contre un serveur
   local, tous avec `httpStatus: null` avant correction). Corrigé en
   remontant `error.details.httpStatus` (y compris imbriqué sous
   `EXTERNAL_RETRY_EXHAUSTED.details.lastError.details.httpStatus`).

3. **`createExternalStageAdapter`** exposait TOUJOURS les 3 méthodes de
   l'adapter (même sans `resultProvider` fourni), chacune levant une
   exception SEULEMENT à l'appel — ce qui empêchait le contrôle fail-closed
   déjà existant côté `ProfessionalPipelinePort::invokeStage`
   (`typeof adapter[def.methodName] === "function"`) de détecter
   correctement l'absence réelle d'une étape, produisant un
   `INTEGRATION_CONTRACT_ERROR` générique au lieu du `DEPENDENCY_UNAVAILABLE`
   attendu — découvert par T04-20 (intégration réelle contre le VRAI
   `ProfessionalPipelinePort`, jamais un mock). Corrigé : une méthode sans
   `resultProvider` est désormais **absente** de l'objet adapter retourné,
   pas une méthode fantôme qui échoue à l'appel.

4. **Correction post-audit (idempotence)** : le cache `requestId -> promise`
   ne comparait jamais le CONTENU de la requête — un `requestId` réutilisé
   avec un payload/provider/operation/runId/nodeId/moduleId différent
   renvoyait silencieusement le résultat de la toute première requête,
   sans jamais toucher le réseau ni signaler de conflit. Découvert par
   audit indépendant, reproduit exactement (T04-IDEMPOTENCE-CONFLICT-02).
   Corrigé : chaque entrée du cache porte désormais une empreinte
   déterministe (`lib/request-fingerprint.js`, sérialisation canonique +
   SHA-256) de la requête ; un `requestId` connu avec une empreinte
   différente produit `EXTERNAL_REQUEST_CONFLICT` avant tout appel réseau.
   Seul `lib/external-execution-gateway.js` a été modifié (ajout de
   `lib/request-fingerprint.js`) — circuit breaker, retries, redaction,
   ExternalStageAdapter, et MONO-01.x/02/03 non retouchés. 10 nouveaux
   tests (T04-IDEMPOTENCE-CONFLICT-01 à 07, certains avec sous-cas),
   tous PASS, 69/69 au total.

Les quatre bugs ont été trouvés par des tests contre du VRAI code (serveur
HTTP local réel, VRAI ProfessionalPipelinePort gelé, scénario de conflit
reproduit exactement comme rapporté) — jamais par une supposition —
conformément à la discipline imposée en section 23/25.
