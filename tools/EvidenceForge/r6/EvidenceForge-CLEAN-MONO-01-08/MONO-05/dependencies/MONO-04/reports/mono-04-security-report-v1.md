# MONO-04 — Rapport de sécurité / rédaction

## Principe

Aucune clé API, token, ou secret codé en dur nulle part dans ce dépôt
(vérifié par recherche statique, T04-38). `SecretProvider` échoue
explicitement si un secret requis manque — jamais un fallback (T04-03/04).

## Redaction

`lib/request-redaction.js` masque systématiquement : les en-têtes
`Authorization`/`X-Api-Key`/`Cookie`/etc. (`redactHeaders`), toute chaîne
ressemblant à un jeton porteur (`Bearer ...`, `sk-...`) où qu'elle
apparaisse dans un objet (`redactValue`, récursif), et toute clé d'objet
dont le NOM correspond à un motif sensible (`authorization|api_key|secret|
token|password|bearer`). Les logs techniques (`buildTechnicalLogEntry`) ne
conservent que `requestId/provider/operation/status/durationMs/httpStatus/
errorCode` — jamais un payload métier complet, jamais un document ou corpus
entier.

Vérifié dynamiquement (T04-16/17) : un vrai secret injecté via
`SecretProvider` (fixture synthétique) est utilisé pour l'appel RÉEL
(reçu par le serveur), mais n'apparaît JAMAIS dans les entrées de log
capturées — le header `Authorization` y est explicitement `[REDACTED]`.

## Ce qui n'est PAS redacté (limite assumée)

Le `result` d'un `ExternalExecutionResult` SUCCESS contient le contenu
technique brut de la réponse — MONO-04 ne l'interprète ni ne le filtre
(ce n'est pas son rôle, section 1 : "aucune logique métier"). Si ce
contenu doit lui-même rester confidentiel avant persistance, cette
responsabilité appartient à l'appelant (MONO-03/l'orchestrateur), qui
décide quoi persister et sous quelle forme.

## Aucun secret dans le manifest/package

`manifest/SHA256SUMS` ne contient que des hashes de fichiers — jamais une
valeur secrète elle-même. Les seuls fichiers du dépôt contenant des chaînes
ressemblant à des secrets sont les fixtures de test
(`test/fixtures.js`, `test_t04_15_18_*`, `test_t04_32_38_*`),
explicitement synthétiques et nommées comme telles (ex.
`sk-VRAIMENT-SECRET-JAMAIS-DANS-LES-LOGS`, `synthetic-test-secret-never-real`)
— jamais un vrai secret, jamais dans `lib/`, `contracts/`, ou `reports/`
(T04-38).
