# MONO-08 v0.6 — Matrice d'audit technique interne (Phase 5)

Référence : `EvidenceForge/MONO-08/MONO-08-v0.6-ACCEPTANCE-MATRIX.md`.
Tous les cas ci-dessous sont `LOCAL_CONTROLLED`, sauf mention contraire. Le
cas **G (REAL)** n'a pas été exécuté (autorisation distincte requise, CDC
section 5.3/11.3).

| Cas | Attendu (matrice) | Obtenu | Verdict | Preuve |
|---|---|---|---|---|
| A | direct, `ANTHROPIC_API_KEY` absente -> `AUTHENTICATION_BLOCKED` | `AUTHENTICATION_BLOCKED`, `authMode=direct` | PASS | `test_t08_v06_delegated_auth.out` (assertion "A.") |
| B | direct + credential valide -> comportement v0.5 inchangé | `READY`, `authMode=direct` | PASS | `test_t08_v06_delegated_auth.out` (assertion "B."), + non-régression `test_t08_preflight.js` identique v0.5/v0.6 |
| C | delegated sans `EVIDENCEFORGE_WORKER_API_KEY` -> `AUTHENTICATION_BLOCKED`, aucun appel authentifié | `AUTHENTICATION_BLOCKED`, `credentialEnvVar=EVIDENCEFORGE_WORKER_API_KEY` | PASS | `test_t08_v06_delegated_auth.out` (assertions "C-config.", "C.") |
| D | delegated, credential Worker invalide -> `AUTHENTICATION_BLOCKED` (rejet actif 401) | `AUTHENTICATION_BLOCKED`, `rawClassification=PROVIDER_HTTP_ERROR` (preflight) ; `401`, aucun appel upstream (Worker) | PASS | `test_t08_v06_delegated_auth.out` ("D."), `worker.test.out` (Worker-D1, Worker-D2) |
| E | delegated, faux 200/corps invalide -> `INVALID_RESPONSE`, jamais `READY` | `INVALID_RESPONSE` | PASS | `test_t08_v06_delegated_auth.out` ("E.") |
| F | delegated, Worker simulé réponse Anthropic valide -> `READY`, LOCAL_CONTROLLED, jamais REAL | `READY`, `authMode=delegated`, explicitement étiqueté LOCAL_CONTROLLED dans le code du test et ce rapport | PASS | `test_t08_v06_delegated_auth.out` ("F.") |
| G | REAL delegated -> `READY` avec preuve NIVEAU 2 corrélée | **NON EXÉCUTÉ** | NOT_RUN (volontaire) | — voir `MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md` §11.3, autorisation distincte requise |
| H1 | `EVIDENCEFORGE_WORKER_API_KEY` réelle -> secret scan brut = 0 occurrence | Aucun run n'a utilisé de credential réel (seulement des valeurs de test factices `wk-good`/`good-worker-key`, jamais présentées comme réelles) ; ces valeurs factices vérifiées absentes des corps/headers de réponse (Worker-16→18) | NOT_APPLICABLE à ce stade (pas de credential réel utilisé) — mécanisme de non-fuite vérifié sur valeurs factices | `worker.test.out` (Worker-16, Worker-17, Worker-18) |
| H2 | Revue structurelle : aucune référence CODE à `ANTHROPIC_API_KEY` dans les branches delegated | 0 référence hors commentaire dans `buildLlmWorkerProviderDelegated()` et `buildLlmWorkerConfigDelegated()` | PASS | `test_t08_v06_delegated_auth.out` ("H2-preflight.", "H2-real-provider-configs.") |
| I | Suite `test/test_t08_*.js` historique inchangée | 4/4 fichiers : sortie **octet pour octet identique** entre v0.5 source et v0.6 modifié (`diff` vide) | PASS | `regression-non-regression/*.diff.txt` (4 fichiers, tous vides) |
| J | `LLM_AUTH_MODE` invalide -> `PRODUCT_CONFIG_ERROR`, exit 3, aucun appel provider, aucune requête réseau | Exit code réel `3` (invocation CLI réelle), `https.request` jamais invoqué (vérifié par monkey-patch), aucun rapport écrit (mtime `reports/mono-08-preflight-v1.json` inchangé) | PASS | `cli-J-invalid-llm-auth-mode.out` (CLI réelle), `test_t08_v06_delegated_auth.out` ("J-buildProviders.", "J-runPreflight.", "J-defaut.") |
| K | delegated, Worker rate-limité -> `HTTP 429`, `RATE_LIMITED`, jamais `READY`, upstream non appelé | Preflight : `RATE_LIMITED` sur un `429` simulé. Worker : `429` réel renvoyé par `handleRequest()`, appel upstream (`fetchImpl`) jamais invoqué | PASS | `test_t08_v06_delegated_auth.out` ("K.", "K-note."), `worker.test.out` (Worker-K, Worker-K-body) |

## Tests complémentaires (hors lettrage A→K, couverture additionnelle du Worker)

| Test | Attendu | Obtenu | Verdict | Preuve |
|---|---|---|---|---|
| Worker-1/2 | Méthode/route hors contrat -> 404 | 404 | PASS | `worker.test.out` |
| Worker-5/6 | Credential+payload valides -> appel upstream réellement invoqué, relai fidèle (NIVEAU 1) | Upstream invoqué avec la vraie valeur `ANTHROPIC_API_KEY` injectée côté Worker ; corps relayé fidèlement | PASS | `worker.test.out` |
| Worker-7→11 | Headers de corrélation présents, request-id client propagé | Tous présents ; request-id client propagé tel quel | PASS | `worker.test.out` |
| Worker-12 | Erreur upstream (529) jamais convertie en faux succès | Statut 529 relayé tel quel | PASS | `worker.test.out` |
| Worker-13/14 | Timeout -> 504 ; panne réseau -> 502 ; jamais 200 | 504 / 502 confirmés | PASS | `worker.test.out` |
| Worker-15 | `ANTHROPIC_API_KEY` absente côté Worker -> 500, jamais un faux succès | 500, aucun appel upstream | PASS | `worker.test.out` |
| Worker-19→23 | Fonctions utilitaires (`isValidMessagesPayload`, `extractBearerToken`, `constantTimeEquals`) | Comportement attendu confirmé isolément | PASS | `worker.test.out` |
| Worker-24 | Sans binding `RATE_LIMITER` (test), la requête n'est pas bloquée — jamais présenté comme config de production valide | Confirmé, avec avertissement explicite dans le test et `README.md` | PASS | `worker.test.out` |

## Vérifications transverses (Phase 5)

| Vérification | Résultat |
|---|---|
| Aucune régression | Confirmé : 4/4 fichiers de test v0.5 identiques octet pour octet avant/après (voir cas I) |
| Aucun faux `READY` | Confirmé : cas E (corps invalide -> `INVALID_RESPONSE`), cas F explicitement étiqueté LOCAL_CONTROLLED (jamais REAL), Worker-12/13/14 (erreurs upstream jamais converties en succès) |
| Aucun secret | Confirmé sur les valeurs de test factices utilisées (Worker-16→18) ; secret scan réel (H1) reste `NOT_APPLICABLE` faute de credential réel utilisé à ce stade — voir rapport principal §10 |
| Aucune modification frozen | Confirmé : snapshot SHA-256 des 9 ZIP canoniques (kit local) avant/après implémentation — jeu de hashes identique (voir rapport principal §11) |
| Aucun appel REAL présenté comme LOCAL | Confirmé : tous les rapports/tests LOCAL_CONTROLLED sont explicitement étiquetés comme tels dans leur nom, leur code, et ce document |
| Aucun LOCAL présenté comme REAL | Confirmé : cas G explicitement `NOT_RUN`, jamais simulé ni présenté comme complété |

## Synthèse

```text
Cas A→F, H2, J, K : PASS (10/10 exécutés)
Cas G             : NOT_RUN (volontaire, hors périmètre de ce lot)
Cas H1            : NOT_APPLICABLE (aucun credential réel utilisé à ce stade)
Cas I             : PASS (non-régression stricte, 4/4 fichiers identiques)
Tests Worker complémentaires : 28/28 PASS
```
