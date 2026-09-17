# 26 — Readiness Semantics (R5, implémenté en code R6)

Ferme R4-A03 (« FINAL READINESS REPORTING », MAJOR — audit indépendant
round 4) et R6-F02 (« READINESS_SEMANTICS », audit indépendant round 5).
**Ce document remplace opérationnellement
`22-MISSION-READINESS.md` comme source de vérité sur la sémantique de
readiness** ; `22-MISSION-READINESS.md` n'est ni supprimé ni réécrit
(règle constante depuis R2), seulement annoté comme historique R4 en
tête de fichier.

**Mise à jour R6** : la sémantique ci-dessous (introduite comme
documentation par R5) est désormais implémentée par du CODE réel et
testé, pas seulement documentée — `bin/run-real-smoke.js::
computeRealSmokeCodeReadiness()` / `computeReadinessPreparation()` /
`computePrepareNext()` / `computeResumeReadiness()` /
`computeResumeNext()` / `computeReadinessReport()`, couvertes par
`test_t08_r6_closure.js` (R6-08/R6-09/R6-10 — mission canonique
incomplète, fixture LOCAL_CONTROLLED complète, absence de combinaison
contradictoire). Le rapport `--phase prepare`/`--phase resume` applique
cette sémantique littéralement à chaque exécution (champ `readiness`
du rapport JSON) — voir `27-R6-CLOSURE.md` et
`28-NOMINAL-PREPARE-RESUME-CLI.md`.

## Le problème (R4-A03, rappel)

Le rapport R4 annonçait simultanément `REAL_SMOKE_MISSION_READINESS =
NOT_READY` et `REAL_SMOKE_NEXT = READY_FOR_INDEPENDENT_REAL_RUN` — une
combinaison que la règle de gouvernance R4 elle-même (`22-MISSION-
READINESS.md`, ligne 11) interdisait littéralement : `REAL_SMOKE_NEXT =
READY` ⟺ `CODE_READINESS = READY` **ET** `MISSION_READINESS = READY`.
Avec `MISSION_READINESS = NOT_READY`, le verdict correct était
`REAL_SMOKE_NEXT = NOT_READY`, jamais `READY_FOR_INDEPENDENT_REAL_RUN`.
La cause racine : un seul couple `(READINESS, NEXT)` binaire ne peut
pas représenter honnêtement un système désormais composé de DEUX
étapes temporellement distinctes (PREPARE puis RESUME) dont chacune a
sa propre notion de « prête ».

## La correction : quatre niveaux de readiness, jamais un seul

```
REAL_SMOKE_CODE_READINESS         — le RUNTIME est-il capable d'exécuter
                                     CORRECTEMENT les deux phases (PREPARE
                                     ET RESUME), indépendamment de toute
                                     mission précise ?

REAL_SMOKE_PREPARATION_READINESS  — TOUTES les entrées pré-retrieval
                                     requises pour CETTE mission sont-elles
                                     disponibles ET PRE_RETRIEVAL_GATE
                                     passe-t-il réellement pour elle ?

REAL_SMOKE_RESUME_READINESS       — un RetrievalSnapshot valide ET des
                                     auditDecisions valides existent-ils
                                     ET POST_RETRIEVAL_GATE passe-t-il
                                     réellement pour eux ?

REAL_SMOKE_MISSION_READINESS      — READY seulement si la mission a
                                     atteint l'état nécessaire pour l'étape
                                     qui est sur le point de s'exécuter
                                     (PREPARATION_READINESS pour lancer
                                     PREPARE, RESUME_READINESS pour lancer
                                     RESUME) — jamais un état unique
                                     indépendant de la phase visée.
```

### `REAL_SMOKE_CODE_READINESS`

`READY` seulement si (mandat section 21, appliqué littéralement) :
`PRE_RETRIEVAL_GATE` fonctionne, `POST_RETRIEVAL_GATE` fonctionne, le
snapshot durable fonctionne, l'intégrité du snapshot fonctionne, la
reprise sans second retrieval fonctionne, la non-régression est au
vert, le secret-scan est au vert, l'observabilité est au vert, le
CROSS_PROCESS est au vert, et aucun blocage technique ouvert ne
subsiste. Question INDÉPENDANTE de toute mission précise — répond à
« ce runtime, en général, peut-il exécuter le workflow honnêtement ? ».

### `REAL_SMOKE_PREPARATION_READINESS`

Évalue une mission précise contre `PRE_RETRIEVAL_GATE`
(`validatePreRetrievalProvenance`) : `resolverRuns`/`plannerRun`/
`plannerOutput`/`humanValidation` réellement fournis et structurellement
cohérents. **N'exige jamais `auditDecisions`** — c'est précisément la
correction de R4-A01. `READY` signifie « cette mission peut lancer
`PREPARE_REAL_SCREENING` dès maintenant ».

### `REAL_SMOKE_RESUME_READINESS`

Évalue l'existence d'un `RetrievalSnapshot` réel (persisté, intègre)
ET d'`auditDecisions` valides le concernant, contre
`POST_RETRIEVAL_GATE` (`validatePostRetrievalAuditDecisions`). Trois
valeurs possibles, jamais binaire :
- `READY` — snapshot + décisions valides présents, `RESUME_REAL_
  SCREENING` peut s'exécuter.
- `WAITING_FOR_OPERATOR_INPUT` — un snapshot valide existe, mais aucune
  décision (ou des décisions incomplètes/invalides) n'a encore été
  fournie — état normal et attendu juste après `PREPARE_REAL_SCREENING`.
- `NOT_READY` — aucun snapshot valide n'existe encore (avant toute
  `PREPARE_REAL_SCREENING`, ou snapshot introuvable/altéré).

### `REAL_SMOKE_MISSION_READINESS`

N'est **jamais** évaluée dans l'absolu : elle répond à « cette mission
est-elle prête pour l'étape qu'on s'apprête à exécuter ? ». Avant tout
retrieval, la question pertinente est `PREPARATION_READINESS`. Après un
snapshot produit, la question pertinente est `RESUME_READINESS`. Un
rapport qui affiche `MISSION_READINESS` sans préciser la phase visée
est desormais considéré incomplet — d'où l'introduction des deux
signaux `REAL_SMOKE_PREPARE_NEXT`/`REAL_SMOKE_RESUME_NEXT` ci-dessous,
qui rendent la phase explicite dans le nom même du champ.

## `REAL_SMOKE_NEXT` : jamais une valeur ambiguë unique

```
REAL_SMOKE_PREPARE_NEXT = READY_FOR_INDEPENDENT_REAL_RUN | NOT_READY
REAL_SMOKE_RESUME_NEXT  = READY | WAITING_FOR_OPERATOR_INPUT | NOT_READY
```

- `REAL_SMOKE_PREPARE_NEXT = READY_FOR_INDEPENDENT_REAL_RUN` ⟺
  `CODE_READINESS = READY` ET (pour une mission donnée)
  `PREPARATION_READINESS = READY`.
- `REAL_SMOKE_RESUME_NEXT = READY` ⟺ `CODE_READINESS = READY` ET
  `RESUME_READINESS = READY`. `REAL_SMOKE_RESUME_NEXT =
  WAITING_FOR_OPERATOR_INPUT` ⟺ `RESUME_READINESS =
  WAITING_FOR_OPERATOR_INPUT`.

**Non-contradiction explicite (mandat sections 20/45)** : il est normal
qu'avant qu'aucun snapshot réel n'existe encore,
`REAL_SMOKE_PREPARE_NEXT = READY_FOR_INDEPENDENT_REAL_RUN` **et**
`REAL_SMOKE_RESUME_NEXT = NOT_READY` soient vrais SIMULTANÉMENT — ce
n'est jamais une contradiction, parce que ce sont deux questions
distinctes sur deux étapes distinctes, chacune correctement qualifiée
par son propre nom de champ. C'est exactement la situation du paquet
R5 livré aujourd'hui (voir `23-R5-CLOSURE.md`, verdict final) : le code
est prêt à préparer un screening réel dès qu'un opérateur fournit une
provenance pré-retrieval réelle (`PREPARE_NEXT = READY_FOR_
INDEPENDENT_REAL_RUN`), mais aucun `RetrievalSnapshot` réel n'a encore
été produit par ce paquet lui-même pour la mission canonique
(`RESUME_NEXT = NOT_READY`, faute de snapshot à reprendre).

## Règle de non-régression sur ce document

Aucun rapport produit par ce projet ne doit plus jamais publier une
combinaison `MISSION_READINESS = NOT_READY` associée à un
`REAL_SMOKE_NEXT` non qualifié par phase (l'ancien champ ambigu unique)
signalant `READY`. Toute évaluation future de readiness DOIT nommer
explicitement la phase visée (`PREPARE` ou `RESUME`) dans le nom du
champ lui-même — jamais un champ générique `REAL_SMOKE_NEXT` réutilisé
pour les deux questions.
