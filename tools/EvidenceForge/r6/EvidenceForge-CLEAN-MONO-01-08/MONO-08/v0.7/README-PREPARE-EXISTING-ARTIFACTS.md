# MONO-08 v0.7 — PREPARE depuis artefacts existants

Successeur **ADDITIF** de v0.6. `v0.6` et `MONO-01 → MONO-07` ne sont ni modifies
ni reimplementes : ce lot les REQUIERT et n'ajoute que ce qui manquait.

## Les trois defauts corriges

| Audit | Defaut v0.6 | Correction v0.7 |
| --- | --- | --- |
| **B-03** | `real-e2e-driver.js:128` reconstruit TOUJOURS le RunContract depuis `mission.dimensions` (justification = `d.label`, jamais les rationales du resolver ; `confirmedAt` neuf donc hash different) | `existingRunContract` valide par `verifyRunContractIntegrity()` (primitive GELEE, documentee pour les contrats venant d'un fichier) puis **UTILISE TEL QUEL** |
| **B-04** | `real-e2e-driver.js:132` reconstruit TOUJOURS le SearchProtocol | `existingSearchProtocol` valide par `assertSearchProtocolFrozenAndValid()` (contrat GELE MONO-01) + binding planner + binding humain, puis **UTILISE TEL QUEL** |
| **B-08** | `real-e2e-driver.js:129` impose `missionId = runContractHash` | `missionId` **CANONIQUE** de la mission ; `runContractHash` reste un champ **distinct**. Divergence rejetee AVANT tout reseau |

Preuve du non-rebuild : `rebuildCalls = { runContract: 0, searchProtocol: 0 }`,
verifie par les tests T04/T08 et par le controle readiness `NO_*_REBUILD`.

## FAIR_QUERY_COVERAGE (B-07)

`maxResults` **conserve son sens GLOBAL**. Rien n'est reinterprete par requete.

Le budget global est reparti AVANT execution : `part_i = floor(B/n) + (i < B mod n)`.
La somme des parts est exactement `B`. Chaque requete est ensuite executee via une
**vue derivee** du protocole ne contenant qu'elle et sa part — le runner gele est
appele tel quel, sans aucune modification.

Mesure (simulation hors ligne, protocole reel) :

| | v0.6 sequentiel | v0.7 equitable |
| --- | --- | --- |
| Requetes executees | **1 / 7** | **7 / 7** |
| Disciplines couvertes | 1 | **7** |
| Resultats | 100 (tous de Q1) | 100 (14-15 par discipline) |

### Deux obstacles reels rencontres, et pourquoi ils imposaient ce constructeur

1. **`buildOpenAlexConnectorRunner` (v0.6, l.661-665) MEMOISE l'appel** :
   `if (!cachedCall) cachedCall = rawRunner(connector, protocol)`. Toute
   invocation ulterieure renvoie le resultat de la premiere, quel que soit le
   protocole. Orchestrer par-dessus donnait 7 requetes, **1 seul appel HTTP** et
   15 resultats identiques. v0.7 construit donc son runner via la fabrique
   **publique** `createOpenAlexRunner` de MONO-01, utilisee exactement comme
   documentee. **MONO-01 n'est pas modifie.**
2. **`genId` redemarre a chaque construction**, donc `source.id` n'est pas unique
   entre invocations. Dedupliquer sur `id` ecrasait tout apres la premiere
   requete. La cle de deduplication est desormais l'identite **externe** :
   `provenance.originalReference` (id OpenAlex), puis `reference` (DOI).

L'**intention** de la memoisation v0.6 est preservee : le resultat **agrege** est
memoise, donc le noeud EF-01C2 du graphe reutilise le meme resultat sans second
appel reseau.

### Limite assumee

Le runner gele demarre toujours a la page 1 et n'expose aucun curseur. Un
entrelacement page-a-page (`Q1p1, Q2p1, …, Q1p2`) exigerait de re-telecharger les
pages deja lues. v0.7 fait **un seul passage par requete**, sans refetch. La
propriete exigee — aucune requete affamee par l'ordre — est obtenue ; le
round-robin page-a-page ne l'est pas, et ne peut pas l'etre sans toucher MONO-01.

Si le budget est inferieur au nombre de requetes, les requetes non servies sont
listees dans `coverage.starvedQueries` — **jamais silencieusement**.

## G-04 — divergence de politique

`EXECUTION_POLICY_AUTHORITY = SEARCHPROTOCOL_CONFIRMED`. Le runner EF-01C2 ne lit
que `protocol.retrievalPolicies` ; le RunContract n'est jamais consulte a
l'execution, ses politiques sont donc inertes. La divergence
(RunContract `maxPages 2 / 30` vs SearchProtocol `maxPages 4 / 100`) est
**detectee, nommee et conservee en reserve** par readiness v2. Elle n'est PAS
classee comme une erreur d'empreinte, et rien n'est corrige.

## Readiness v2

14 controles, **100 % hors ligne**. Comble ce que v0.6 ne verifiait pas : octets
reels des documents, empreintes, binding RunContract/SearchProtocol/missionId,
entrypoint (refus si `loadMission()` est appele — defaut B-01), absence de
rebuild, coherence de politique, et simulation de couverture.
