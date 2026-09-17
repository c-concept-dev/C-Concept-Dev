# 09 — Remaining Risks

> **Mise à jour round 2** : le point 1 ci-dessous (`mission.eForchProvenance`
> absent) a évolué — le mission-gate le détecte désormais AVANT toute
> construction (B-03, voir `12-R2-CLOSURE.md`). Un nouveau risque, plus
> significatif, a été découvert et documenté en détail dans
> `13-R2-REMAINING-MAJORS.md` (M-02) : le contenu substantiel de
> `SearchProtocol` n'est jamais causalement dérivé du plannerRun réel,
> même quand celui-ci est authentiquement fourni — ce risque, resté
> ouvert, pilote `REAL_SMOKE_NEXT = NOT_READY` dans le verdict R2.

Aucun de ces points n'est un `BLOCKER` au sens du mandat (voir
`11-FINAL-TECHNICAL-VERDICT.md`) ; chacun est une limitation
délibérément non résolue dans cette mission, avec sa justification.

## 1. `mission.eForchProvenance` absent du fixture actuel

Un run réel exécuté aujourd'hui contre `fixtures/mission-real-smoke-
v1.json` échouera en `OPERATOR_INPUT_REQUIRED` dès la construction
(aucune provenance LLM/humaine réelle disponible). C'est le comportement
VOULU (fail-closed) — pas un bug — mais cela signifie qu'un run réel
GENUINE nécessite qu'un opérateur humain fournisse cette provenance
(appel LLM réellement effectué pour EF-01B/EF-01C1, décision de
screening réellement prise pour EF-01D) avant tout run réseau réel.
Aucune valeur n'a été inventée pour combler ce champ dans cette mission
(F-06 : préserver le contenu réel, jamais en fabriquer).

## 2. MONO-05 reste la seule voie « opérateur générique » et porte des limitations non corrigées

`createOperatorBackends()` (backends mémoire non injectables),
`buildContextFromState()` (reconstruction de dépendances vivantes
incomplète pour un usage générique), `getGraph()`/`getNode()` (erreurs
de réhydratation avalées) restent tels quels dans MONO-05 — lot GELÉ,
hors périmètre de cette mission (voir `04-CONTRACT-IMPACTS.md`). MONO-08
les contourne entièrement par composition pour ses propres besoins
(preuve CROSS_PROCESS, réhydratation), mais un OPÉRATEUR utilisant
directement l'UI/API générique de MONO-05 (hors du chemin MONO-08) reste
exposé à ces limitations documentées par l'audit indépendant (F-07→F-10
condensé).

## 3. `completedStages`/`lastResult` non propagés par MONO-02 pour le cas BLOCKED-en-pause

Documenté en détail dans `07-OBSERVABILITY-REMEDIATION.md`. `describeNodeFailure()`
restitue fidèlement ce qui est disponible (`code`/`message`/`nativeStatus`/
`awaitingStage`/`gate`) mais ne peut pas exposer ce que MONO-02 (gelé)
ne propage pas.

## 4. `FILE_DURABLE` n'est pas une implémentation de production réseau

Le backend fichier (`lib/file-durable-backend.js`) prouve que la
frontière d'injection fonctionne réellement cross-process sur disque
local. Il n'a jamais été conçu, ni testé, pour un déploiement
multi-nœuds/réseau réel (pas de verrouillage inter-processus au-delà de
l'atomicité `rename`, pas de réplication). Un déploiement de production
réel nécessiterait une implémentation dédiée (IndexedDB, base de
données) — toujours hors périmètre de MONO-03 par conception, comme
documenté par MONO-03 lui-même.

## 5. Terminologie `REAL`/`SYNTHETIC` non généralisée à toute la prose MONO-07

`evidenceProvenance` (`REAL_LLM_CALL`/`REAL_HUMAN_ACTION`/
`SYNTHETIC_FIXTURE`) a été introduit dans le CODE produit par MONO-08.
La prose narrative de MONO-07 (README, commentaires) continue d'employer
« réel » de façon parfois ambiguë (finding F-13 condensé) — non
retouchée, MONO-07 étant un lot gelé sans changement fonctionnel requis
(RÈGLE CARDINALE).

## 6. `test_t08_matrix.js` reste lent dans cet environnement

19/24 assertions restent `NOT_RUN_ENVIRONMENT_BLOCKED` (préflight
réseau bloqué, sondes HTTP réelles qui expirent après ~90s dans ce
bac à sable) — comportement HONNÊTE et attendu (jamais transformé en
faux PASS), mais rend cette suite spécifique lente à rejouer localement.

## 7. Findings MONO-05 F-07→F-10 (condensé) : non corrigés, seulement contournés

Voir point 2. Une correction directe de MONO-05 nécessiterait un
`CONTRACT_IMPACT` formel et une nouvelle révision du lot, hors mandat de
cette mission (composition, jamais réécriture d'un lot gelé sain par
ailleurs — MONO-05 reste GELABLE dans son propre périmètre, 119/119,
`AUCUNE REGRESSION`).
