# MONO-04 — Rapport du Gateway

## Flux

`executeRequest(request)` : (1) provider connu (`PROVIDER_NOT_CONFIGURED`
sinon), (2) circuit breaker fermé (sinon `EXTERNAL_DEPENDENCY_UNAVAILABLE`
sans appel réseau), (3) secret disponible si requis (`SECRET_UNAVAILABLE`
sinon), (4) appel HTTP avec timeout réel (`AbortController`), (5) validation
de la réponse (statut/content-type/JSON/taille/clés), (6) retry technique
UNIQUEMENT pour les erreurs transitoires (réseau, timeout, HTTP 429/5xx),
plafonné à `HARD_MAX_ATTEMPTS_CAP = 5`.

## Circuit breaker

Compteur d'échecs consécutifs par provider, dans l'instance de Gateway
(jamais partagé entre instances, jamais persisté). Après
`failureThreshold` échecs (5 par défaut), les appels suivants vers ce
provider échouent immédiatement (`EXTERNAL_DEPENDENCY_UNAVAILABLE`) pendant
`coolDownMs` (30s par défaut) — aucun appel réseau supplémentaire tenté.

## Idempotence

Cache `Map<requestId, { fingerprint, promise }>` — un `requestId` répété
(concurrent ou séquentiel) renvoie toujours la même promesse/résultat SI ET
SEULEMENT SI l'empreinte déterministe de la requête (runId/nodeId/moduleId/
dependencyType/provider/operation/payload/timeoutPolicy/retryPolicy,
sérialisation canonique + SHA-256, jamais un secret) est identique à celle
déjà enregistrée — sinon `EXTERNAL_REQUEST_CONFLICT` avant tout appel
réseau. Correction post-audit : la version initiale ne comparait aucun
contenu, réutilisant silencieusement le résultat d'une requête différente
partageant le même `requestId` (voir CDC-TRACE.md, bug n°4). Limite
documentée inchangée : in-process uniquement, jamais une garantie
cross-process (voir README).

## Payload jamais modifié

Le payload métier fourni est envoyé tel quel (`JSON.stringify(request.payload)`
sans transformation intermédiaire) — vérifié par T04-18 (comparaison
bytewise avant/après, et comparaison avec ce que le serveur a réellement
reçu).
