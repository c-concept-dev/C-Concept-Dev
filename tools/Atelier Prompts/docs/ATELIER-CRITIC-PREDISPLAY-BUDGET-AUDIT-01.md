# ATELIER-CRITIC-PREDISPLAY-BUDGET-AUDIT-01

**Sous-lot :** `ATELIER_CRITIC_PREDISPLAY_BUDGET_AUDIT_01D_L`
**Nature :** audit de contrat d'exécution, lecture seule. Aucune implémentation, aucun appel API.
**Question :** le travail avant le premier ASK sûr peut-il être borné à 1 Analyste + 1 Critique
global + 1 lot Critique, le reste continuant après affichage ?

**Réponse en deux temps, et le second est celui qui compte.**
Oui — et **ce n'est pas à faire : c'est déjà fait.** `runCriticBatchedPipeline` identifie déjà la
cible de rang 0 dans l'ordre de l'Analyste, exécute par vagues bornées, s'arrête à la preuve et ne
lance jamais les lots suivants. Mais sur la population qui concerne réellement le blocker — les tours
qui demandent une clarification — le chemin pré-affichage borné mesure **43 338 ms au p50 et 34 422 ms
dans son meilleur cas jamais observé**. **0 tour sur 8, et 0 sur 5 dans un second jeu de données
indépendant, ne descend sous 10 s.**

---

## A. État Git

```
git status --short  → ?? les quatre rapports 1D-H, 1D-I, 1D-J, 1D-K (non commités)
git branch          → main
git rev-parse HEAD  → 11906d2415b788f8b5ab44346e1d155484b0c795
```

tree `tools/Atelier Prompts` @ `1d5eed5` = @ `HEAD` = `0d8b49f55dc627f84a2fee31d2498ffe17fa7c8b`.
Sémantiquement identique au subtree audité par 1D-H → 1D-K. Écart hors subtree documenté, non
bloquant.

## B. Synthèse 1D-H à 1D-K

Exposition anticipée prouvée mais insuffisante ; sorties sur-provisionnées ; chemin minimal sûr =
Analyste + Critique global + lot de l'issue retenue ; Anthropic seul fournisseur routable ; cause
primaire = volume de sortie, variance portée par le nombre de lots Critique.

## C. Pipeline Critique actuel

```
analyst_output
 └─ buildQuestionReviewTargets(analyst_output)          fonction PURE
      filtre : impact="material" ET recommended_treatment="question"
      ORDRE : celui de analyst_output.issues, jamais réordonné
 └─ computeBatchPlan(targets, capability)               fonction PURE, calculée AVANT tout appel
      itère les targets DANS L'ORDRE, remplit séquentiellement
      maxTargetsPerBatch = 1 en production  ⇒  batch[k] = target de rang k
 └─ executeGlobal({…, material_context})                1 appel — préalable strict
 └─ orderedTargets = liste PLATE dans l'ordre de priorité de l'Analyste
 └─ boucle par VAGUES de waveSize = concurrency (= 2 en production)
      ├─ lance les lots de la vague
      ├─ réassemble PAR INDEX, jamais par ordre d'arrivée
      └─ findWinner()  →  break si preuve trouvée
 └─ troncature autoritaire à la cible gagnante
 └─ assembleSubstitutionReviews → applySubstitutionGate → deriveCriticConsequences
 └─ validateCriticOutput
```

### Matrice par étape

| | INPUT | OUTPUT | ISSUES COUVERTES | DÉPENDANCE | PEUT CHANGER L'ISSUE RETENUE | PEUT VETOER LA QUESTION COURANTE | PEUT PASSER À READY | PEUT TOURNER APRÈS LE 1er ASK |
|---|---|---|---|---|---|---|---|---|
| `buildQuestionReviewTargets` | `analyst_output` | cibles ordonnées | toutes | — | non (projection pure) | non | non | — |
| `computeBatchPlan` | cibles + capability | plan de lots | toutes | — | non | non | non | — |
| Critique global | demande, historique, `analyst_output`, `material_context` | `vetoes`, `semantic_drift_detected`, `missed_material_issues`, … | toutes | analyste | **oui** (veto, issue manquée) | **OUI** | non directement | **NON** |
| lot de rang 0 | `analyst_output` + cible projetée | 6 familles × 6 feuilles | **1** | global | non | **OUI pour SA cible** | non | **NON** |
| lots de rang > 0 | idem | idem | 1 chacun | global | **oui, indirectement** | **non pour la cible de rang 0** | non | **OUI** |
| `deriveCriticConsequences` | sortie brute Critique | `question_is_last_resort`, `illegitimate_question_found`, `agreement` | autoritaires | lots | non | non | non | déterministe |
| `applySubstitutionGate` | revues + vetos + dérive | revues gated | autoritaires | global + lots | non | non | non | déterministe |
| Arbitre | les deux sorties + `material_context` | `state`, `next_question`, … | toutes | critique | **oui** | **OUI** | **OUI** | **OUI** |

## D. Sélection de l'issue

`SELECTED_ISSUE_KNOWN_BEFORE_BATCHES = YES`, et la preuve est en trois maillons, tous en lecture
directe du code :

1. **L'Analyste trie.** `ANALYST_SYSTEM_PROMPT` point 8 (`core.js:216`) : « s'il en reste plusieurs,
   **classez-les par ordre décroissant de valeur informationnelle : la première est celle qu'un rôle
   ultérieur retiendra en priorité** ». Le même point nomme explicitement « le mécanisme qui
   sélectionne la prochaine question **lorsque l'Arbitre n'est pas appelé** ».
2. **Le filtre ne réordonne pas.** `buildQuestionReviewTargets` est un `filter().map()` sur
   `analyst_output.issues` : l'ordre survit intact.
3. **Le plan de lots ne réordonne pas.** `computeBatchPlan` itère `for (const target of targets)` et
   pousse séquentiellement. Avec `maxTargetsPerBatch = 1` en production, **lot[k] = cible de rang k**.

La cible retenue est donc connue **avant** le premier appel de lot, par une chaîne de trois fonctions
pures. Aucun modèle n'intervient dans la sélection.

## E. Sélection du batch

```
SELECTED_BATCH_IDENTIFIABLE_BEFORE_ALL_BATCHES = YES
SELECTED_BATCH_CAN_RUN_FIRST                   = YES — et il le fait déjà
```

`runCriticBatchedPipeline` porte déjà le mécanisme, implémenté par
`DEEP-INTERACTION-EARLY-STOP-01` :

```js
const orderedTargets = [];
batchPlan.forEach((targets, batchIndex) => targets.forEach((t) => orderedTargets.push({ batchIndex, target: t })));

const findWinner = () => {
  for (let pos = 0; pos < orderedTargets.length; pos += 1) {
    …
    if (!batchLaunched[batchIndex]) return -1;   // pas encore examinée : on ne conclut pas
    if (!batchSucceeded[batchIndex]) return -1;  // échec technique : preuve impossible ici
    …
    if (!anyAvailable) return pos;               // dernier recours prouvé : c'est elle
  }
  return -1;
};

for (let waveStart = 0; waveStart < batchPlan.length; waveStart += waveSize) {
  …
  winnerPosition = findWinner();
  if (winnerPosition >= 0) break;                // aucune vague nouvelle après la preuve
}
```

Trois propriétés découlent directement de ce corps :

- **La preuve se lit dans l'ordre de priorité, jamais dans l'ordre d'arrivée.** Le commentaire le
  formule en invariant : « Une cible de rang k ne peut conclure que si TOUTES les cibles 0..k-1 sont
  résolues validement : une priorité supérieure non résolue bloque la conclusion. »
- **Les lots suivants ne sont pas différés, ils ne sont pas exécutés.** `break` sort de la boucle de
  vagues ; `notExecutedIssueIds` les marque `NOT_EXECUTED_EARLY_STOP` et les **sort de l'exigence de
  couverture totale**.
- **Le travail spéculatif ne décide rien.** `authoritativeTargets = orderedTargets.slice(0, winnerPosition + 1)`
  tronque la sortie autoritaire ; un lot de la même vague qui termine après la gagnante « ne peut ni
  changer l'état, ni la question, ni la provenance, ni la substitution retenue ».

**Nuance mesurée, et elle a un coût.** `waveSize = concurrency = 2` en production : la première vague
lance **deux** lots, dont le second est spéculatif. Le chemin pré-affichage compte donc 3 appels
autoritaires mais **4 appels partis**. La campagne appariée de l'arrêt anticipé le montre en clair
sur Q08 : 4 appels / 1 lot → 5 appels / 2 lots, et 56 979 ms → 62 712 ms. Le cas s'est **dégradé de
10 %** par effet de vague.

## F. Critique global

`GLOBAL_CRITIC_REQUIRED_BEFORE_ASK = YES.` Il est le seul producteur de `vetoes` et de
`semantic_drift_detected`, sans lesquels `evaluateSubstitutionGate` ne peut rendre ni
`REJECTED_USER_RESERVED_CHOICE` ni `REJECTED_OBJECTIVE_CHANGED` — les deux portes qui rendent une
question illégitime. Il est aussi le seul à recevoir `material_context` : le commentaire du pipeline
le dit, « `material_context` ne va QU'à l'étape globale : c'est elle qui porte la règle d'ancrage ».

Et il est un préalable **strict**, non par dépendance de données mais par contrat d'échec : « lancer
les batches en même temps que lui changerait le nombre d'appels sur le chemin d'échec ».

Mesure sur la population de clarification : **252 jetons de sortie au p50**, latence 4 441 à
19 016 ms. C'est l'étape la moins chère du chemin.

## G. Batch sélectionné

`SELECTED_BATCH_REQUIRED_BEFORE_ASK = YES.` Sans lui, `question_is_last_resort` de la cible de rang 0
est indéterminé, donc `SAFE_ASK` (§I) n'est pas satisfaisable. C'est exactement la réfutation de H2 en
1D-J : les conséquences déterministes n'existent qu'à partir d'une revue produite par le modèle.

Mesure : **903 jetons de sortie au p50**, latence 15 470 à 19 201 ms sur 8 tours. C'est l'étape la
plus régulière du chemin, et la plus chère après l'Analyste.

## H. Batches non sélectionnés

| pour un lot de rang > 0 | verdict |
|---|---|
| `CAN_VETO_CURRENT_ASK` | **NON** — sa revue ne porte que sur *sa* cible ; `applySubstitutionGate` est appliquée issue par issue |
| `CAN_CHANGE_CURRENT_TARGET` | **oui, indirectement** — s'il invalidait la cible de rang 0… mais il ne peut pas : seul le lot de rang 0 juge celle de rang 0 |
| `CAN_DISCOVER_HIGHER_PRIORITY_ISSUE` | **NON** — il ne reçoit qu'une cible projetée ; découvrir une issue nouvelle est le privilège du Critique **global** (`missed_material_issues`) |
| `CAN_CHANGE_STATE_TO_READY` | **NON** directement ; si *tous* invalidaient *toutes* les questions, plus aucune issue non substituable ne subsisterait — mais cela exige que le rang 0 soit lui aussi invalidé, ce qu'aucun lot tardif ne peut faire |
| `CAN_INVALIDATE_SELECTED_QUESTION` | **NON** |
| `REQUIRED_BEFORE_DISPLAY` | **NON** |
| `CAN_RUN_AFTER_DISPLAY` | **OUI** — et aujourd'hui ils ne tournent même pas |

La raison structurelle tient en une ligne : la revue de substitution est **par issue**. Un lot reçoit
`batchTargets` et rend `{issue_id: {candidates}}` pour ses seules cibles ; `applySubstitutionGate`
évalue chaque revue indépendamment ; `question_is_last_resort` se calcule par issue. **Rien dans le
contrat d'un lot de rang k ne peut atteindre l'issue de rang 0.**

## I. Définition SAFE_ASK

Dérivée des invariants existants, sans autorité nouvelle. Une question est `SAFE_ASK` si et seulement
si :

1. **elle vise une issue réelle** — `targets_issue_id ∈ analyst_output.issues[].id`
   (`validateAnalystOutput` l'exige déjà par contrôle croisé) ;
2. **l'issue est matérielle et traitée par question** — `impact="material"` et
   `recommended_treatment="question"` (prédicat de `buildQuestionReviewTargets`) ;
3. **aucune substitution raisonnable n'est disponible** — `question_is_last_resort === true`, soit
   `!LADDER_ALTERNATIVE_VALUES.some(t => alternatives_reviewed[t].reasonably_available === true)`
   (`deriveCriticConsequences`) ;
4. **aucun veto ne porte sur cette issue** — sinon `evaluateSubstitutionGate` rend
   `REJECTED_USER_RESERVED_CHOICE` ;
5. **aucune dérive sémantique globale** — sinon `REJECTED_OBJECTIVE_CHANGED` ;
6. **une progression réelle est énoncée** — `question_candidates[].expected_progress` non vide
   (`validateQuestionCandidate`) ;
7. **toutes les cibles de priorité supérieure sont validement résolues** — invariant explicite de
   `findWinner` ;
8. **le tour n'est pas périmé** — `seq === oprieState.seq`, `concludedTurn !== seq`,
   `createTurnCoordinator.accept` non `TURN_STALE`.

Les huit conditions sont satisfaites à la fin du lot de rang 0. **Aucune ne requiert l'Arbitre.**

## J. Risques des résultats tardifs

| RÉSULTAT TARDIF | effet possible sur l'ASK visible | comportement des mécanismes EXISTANTS |
|---|---|---|
| nouvelle issue matérielle (`missed_material_issues`) | produite par le **global**, donc déjà connue avant l'ASK | — |
| issue de priorité supérieure | **impossible** — le rang vient de l'Analyste, figé avant les lots | — |
| dérive sémantique | produite par le **global**, déjà connue | — |
| veto | produit par le **global**, déjà connu | — |
| substitution disponible sur une issue de rang > 0 | n'atteint pas le rang 0 | ASK conservé |
| question dupliquée | seul l'Arbitre déduplique contre l'historique | **WAIT_FOR_USER → `oprieAsk` réécrit** |
| nouvelle contradiction | via `arbiter.issues` | `ENTER_READINESS` ou `WAIT_FOR_USER` |
| rien de matériel | — | `KEEP_CURRENT_INTERACTION` → `() => false` |
| **Arbitre conclut `operational_request_ready`** | **l'ASK devient sans objet** | `ENTER_READINESS`, appliqué **sans égard** à la question affichée |

Ce tableau porte le résultat le plus important de la section : **tout ce qui pourrait invalider l'ASK
de rang 0 est produit par le Critique global ou par l'Arbitre, jamais par un lot tardif.** Le global
est déjà avant l'affichage. Reste donc l'Arbitre seul.

```
LATE_BATCH_CAN_INVALIDATE_VISIBLE_ASK   = NO
LATE_ARBITER_CAN_INVALIDATE_VISIBLE_ASK = YES
```

`validateArbiterOutput` ne croise aucun champ de `critic_output` (établi en 1D-J) : rien de
déterministe ne l'oblige à honorer un `question_is_last_resort === true`.

**`SAFE_TO_ASK` et `GLOBALLY_OPTIMAL_NEXT_QUESTION` ne sont pas la même chose**, et le produit doit
choisir. L'ASK de rang 0 est *sûr* au sens des huit conditions du §I. Il n'est pas garanti
*globalement optimal* : l'Arbitre, s'il avait tourné, aurait pu préférer une autre survivante ou
constater un doublon sémantique avec l'historique. Je ne présume pas que le produit accepte cette
différence — c'est un arbitrage propriétaire, pas une conclusion technique.

## K. Protection saisie utilisateur

```js
function oprieAsk(question,intro,chips){
  v11ShowRapidGate(null);
  adpState.pendingQuestion=true; adpState.returnFocus=document.activeElement;
  $('#v11-question').textContent=question;
  $('#v11-answer').value='';            // ← la réponse en cours est EFFACÉE
  …
}
```

Séquence : question affichée → la personne tape → l'Arbitre tardif arrive avec une question
différente → `WAIT_FOR_USER` → `oprieShowClarification(turn)` → `oprieAsk(...)` → `value=''`.

```
ACTIVE_USER_INPUT_PROTECTED        = NO
LATE_ASK_REPLACEMENT_CURRENTLY_SAFE = NO
SMALL_UI_GUARD_SUFFICIENT           = NOT_PROVEN
```

Aucun état n'est corrompu, aucune fausse affirmation n'est produite, `IA-03` empêche tout rejeu
d'action à effet. Mais le travail de la personne peut disparaître sous ses doigts. Le cas n'est jamais
atteint aujourd'hui parce que Fast et Deep produisent presque toujours la même catégorie —
`KEEP_CURRENT_INTERACTION` absorbe le reste. Une exposition anticipée le rendrait **atteignable et
fréquent**.

Je marque `SMALL_UI_GUARD_SUFFICIENT = NOT_PROVEN` et non `YES` : ne pas écraser un champ non vide est
trivial à écrire, mais la question ouverte n'est pas technique — c'est ce que le produit doit faire
quand l'autorité contredit une question à laquelle la personne est en train de répondre. Cela n'a
jamais été décidé.

## L. Invariant couverture OPRIE

```js
export function assertOrchestratedRolesCoverOprie() {
  const orchestrated = [...OPERATIONAL_REQUEST_ROLE_SEQUENCE].sort();
  const declared = [...OPRIE_ROLES].sort();
  if (orchestrated.length !== declared.length || orchestrated.some((r,i) => r !== declared[i])) {
    throw new TypeError("La séquence orchestrée ne couvre pas exactement les rôles OPRIE.");
  }
}
```

C'est une **comparaison statique d'ensembles**, sans aucune notion de temps. Elle vérifie que la
séquence déclarée est exactement `["analyst","critic","arbiter"]`. Et elle n'est appelée **que depuis
un test** (`tests/operational-request-orchestrator-orch01.test.mjs:133`) — aucun appelant de
production.

```
signification réelle = ALL_ROLES_EVENTUALLY_EXECUTED_FOR_THE_TURN
signification qu'elle NE porte PAS = ALL_ROLES_COMPLETE_BEFORE_ANY_USER_INTERACTION
```

L'invariant qui bloque réellement l'affichage n'est pas celui-là : c'est `const turn = outputs.arbiter`
(`orchestrator.js:439`), la réponse HTTP étant la seule sortie du tour.
`ALL_OPRIE_ROLES_EVENTUALLY_PRESERVED = YES` reste donc compatible avec un affichage anticipé.

## M. Pipeline PRE/POST display

| critère | verdict |
|---|---|
| `SEMANTIC_SAFETY` | **préservée** — les huit conditions du §I sont satisfaites avant affichage ; aucun lot tardif ne peut les défaire |
| `AUTHORITY_PRESERVED` | **oui** — `state` reste la production exclusive de l'Arbitre ; le signal pré-affichage est déterministe et dérivé, non décisionnel |
| `FULL_OPRIE_EVENTUALLY_EXECUTED` | **oui** — l'invariant est statique (§L) ; et aujourd'hui l'arrêt anticipé ne les exécute même pas, ce qui est déjà accepté par `NOT_EXECUTED_EARLY_STOP` |
| `CANONICAL_STATE_PRESERVED` | **oui** — `mapOprieToCanonicalContract` continue de ne lire que la sortie de l'Arbitre |
| `STALE_TURN_HANDLING` | **suffisant** — `seq`, `concludedTurn`, `pendingQuestion`, `AbortController`, `IGNORE_STALE`, `TURN_STALE` (1D-J) |
| `USER_INPUT_SAFETY` | **NON** — §K |

Une seule des six est en défaut, et c'est l'ergonomie, pas la sémantique.

## N. Budget tokens

Population : les 8 tours réels de `evaluation/deep-interaction-early-stop-01/sonnet-*.json` —
Anthropic `claude-sonnet-4-6`, latence **et** jetons **par appel**, tous en
`clarification_required`. C'est la population du blocker.

| étape | sortie p50 | min | max |
|---|---|---|---|
| Analyste | **852** | 663 | 1 008 |
| Critique global | **252** | 243 | 351 |
| lot de rang 0 | **903** | 754 | 1 016 |
| **PRE-AFFICHAGE total** | **2 152** | **1 660** | **2 572** |

Débit mesuré sur ce chemin : **50,5 tok/s**.

## O. Budget latence

| cas | lots | analyste | global | lot 1 | **PRE-AFFICHAGE** | A+C actuel | tour complet |
|---|---|---|---|---|---|---|---|
| A01-base | 3 | 19 851 | 5 468 | 18 063 | **43 382** | 66 313 | 94 206 |
| A01-cand | 2 | 21 658 | 5 013 | 17 848 | **44 519** | 46 258 | 74 353 |
| Q02-base | 1 | 14 250 | 19 016 | 17 967 | **51 233** | 51 233 | 75 657 |
| Q02-cand | 1 | 14 046 | 7 101 | 19 201 | **40 348** | 40 348 | 60 326 |
| Q07-base | 3 | 21 429 | 5 036 | 17 044 | **43 509** | 61 179 | 83 460 |
| Q07-cand | 2 | 16 763 | 9 609 | 16 922 | **43 294** | 45 617 | 74 910 |
| Q08-base | 1 | 14 545 | 4 441 | 18 128 | **37 114** | 37 114 | 56 939 |
| Q08-cand | 2 | 14 295 | 4 657 | 15 470 | **34 422** | 39 122 | 62 681 |

| | n | p50 | p95 | min | max |
|---|---|---|---|---|---|
| **PRE-AFFICHAGE borné** | 8 | **43 338** | **48 883** | **34 422** | 51 233 |
| chemin A+C actuel (tous lots) | 8 | 45 938 | 64 516 | 37 114 | 66 313 |
| tour complet | 8 | 74 632 | 90 445 | 56 939 | 94 206 |

**Gain du bornage : −5,7 % au p50, −24 % au p95.** Réel, et très loin du nécessaire.

### Contre-vérification indépendante, et correction de mon rapport 1D-K

`ANTHROPIC-DEEP-CAPACITY-01` (n=62) redécoupé selon la présence d'un lot :

| population | n | chemin sûr p50 | p95 | min | sortie an+cr p50 |
|---|---|---|---|---|---|
| **1 seul appel Critique — aucun lot** | **53** | 12 532 | 31 470 | 11 738 | 678 |
| **2+ appels — avec lot** | **5** | **55 746** | 78 649 | **36 446** | 3 068 |

Les deux jeux de données concordent : **36 à 56 secondes** dès qu'un lot est nécessaire.

**1D-K annonçait un chemin sûr à 12 676 ms au p50. Ce chiffre est la médiane d'une population dont
85 % des tours n'avaient aucun lot — c'est-à-dire n'avaient besoin d'aucune clarification.** Pour la
population que le blocker concerne, le chemin sûr est **quatre fois plus long**. La nuance optimiste
que j'ai ajoutée en 1D-K — « au p50, 10 s n'est plus hors de portée » — **était fausse pour la
population qui compte**, et je la retire.

Corollaire, qui corrige aussi 1D-J : sur les tours de clarification, **l'Analyste seul** mesure
14 046 à 21 658 ms. L'hypothèse H4 « Analyste seul ≈ 8,9 s », dérivée des comptes de jetons Groq, ne
tient pas sur cette population non plus : même le chemin non sûr dépasse 10 s.

## P. Variance

```
PREDISPLAY_WORK_BOUNDED             = YES
PREDISPLAY_OUTPUT_VARIANCE_BOUNDED  = YES
```

**Le travail est borné structurellement**, pas statistiquement : exactement 1 Analyste + 1 Critique
global + 1 lot, quel que soit le nombre d'issues, parce que `batchPlan` est calculé avant tout appel
et que `findWinner` conclut au rang 0 dès que celui-ci est prouvé.

**Et la variance de sortie est effectivement bornée** — c'est le résultat le plus encourageant du
sous-lot :

| | plage de sortie | rapport |
|---|---|---|
| Critique complet (1D-K) | 223 → 5 940 jetons | **×26,6** |
| **chemin pré-affichage borné** | **1 660 → 2 572 jetons** | **×1,55** |

Le bornage transforme donc une variance de facteur 26 en une variance de facteur 1,55. C'est
exactement ce que le §12 demandait de vérifier, et la réponse est oui.

**Mais il borne autour de la mauvaise valeur.** 2 152 jetons à 50,5 tok/s font 43 secondes. Borner
une grandeur ne la réduit pas.

## Q. Seuil p95 10 s

Budget de 10 s à 50,5 tok/s : **505 jetons de sortie** pour tout le chemin pré-affichage.

| | jetons | verdict |
|---|---|---|
| pré-affichage p50 | 2 152 | **+326 %** |
| pré-affichage minimum observé | 1 660 | **+229 %** |
| Analyste seul, p50 | 852 | **+69 %** — à lui seul |

```
CAN_BOUNDED_PREDISPLAY_PATH_REACH_P95_10S = PROVEN_NO
```

0/8 tours dans le jeu par appel, 0/5 dans le jeu de capacité restreint aux tours avec lot, minimum
jamais observé **34 422 ms**. Même la fourchette optimiste de 1D-I (−45 %) laisserait le p95 à
≈ 27 s.

## R. Seuil p95 5 s

Budget de 5 s : **253 jetons**. Le Critique global seul en écrit 252 au p50 — il consomme à lui seul
la totalité du budget, et il est le moins coûteux des trois étapes.

```
CAN_BOUNDED_PREDISPLAY_PATH_REACH_P95_5S = PROVEN_NO
```

## S. Tests requis

**Unitaires déterministes**
1. `computeBatchPlan` préserve l'ordre de `analyst_output.issues` ; avec `maxTargetsPerBatch=1`,
   `batch[k] = target de rang k`.
2. `findWinner` ne conclut au rang k que si tous les rangs 0..k-1 sont validement résolus.
3. Un lot de rang > 0 ne peut jamais modifier la revue de l'issue de rang 0.
4. `NOT_EXECUTED_EARLY_STOP` sort les cibles non lancées de l'exigence de couverture.
5. Les huit conditions de `SAFE_ASK` (§I), une par une, chacune falsifiable isolément.
6. Un échec technique du lot de rang 0 ⇒ **aucun ASK** (fail-closed), jamais un ASK dégradé.
7. Aucun mot-clé, aucun domaine, aucun seuil : deux corpus lexicalement opposés, mêmes verdicts.

**Intégration déterministe**
8. Seul le lot sélectionné bloque le premier ASK ; les lots restants s'exécutent bien ensuite.
9. L'Arbitre s'exécute toujours ; couverture OPRIE complète préservée.
10. Résultat canonique final **identique** au pipeline actuel sur les fixtures existantes — `state`,
    `issues`, `intent_preservation`, readiness, égalité profonde du contrat canonique.
11. Échec fournisseur ⇒ `degraded_state`, jamais de readiness annoncée.
12. `material_context` effectivement délivré au Critique global.

**Navigateur**
13. ASK anticipé visible avant la fin du Deep ; aucun `ACKNOWLEDGE` affiché (1D-G).
14. Jamais deux questions actives.
15. **Un lot tardif n'efface jamais une saisie en cours.**
16. **Un Arbitre tardif n'efface jamais une saisie en cours.**
17. Tour périmé toujours rejeté (`seq`, `concludedTurn`, `IGNORE_STALE`).
18. Fast reste `candidate` ; Rapide et Architecte non régressés ; Atelier hors périmètre.

**Différentiel** — `CURRENT_FULL_PRE_DISPLAY_PIPELINE` vs `BOUNDED_PRE_DISPLAY_PIPELINE`, sur tout le
corpus, comparant : sûreté du premier ASK, état canonique final, readiness finale, issues finales,
`intent_preservation` finale. Le verdict compare les **décisions**, pas la validité JSON.

**Smoke réel minimal** — un tour, mesurant `TIME_TO_FIRST_SAFE_ASK` et
`TIME_TO_FINAL_SEMANTIC_CONSOLIDATION` sur le même tour.

## T. Verdict

La réponse à la question posée est oui sur le contrat, et elle est déjà acquise dans le code : la
cible de rang 0 est identifiable par trois fonctions pures avant tout appel de lot, le lot
correspondant s'exécute déjà en premier, l'arrêt anticipé ne lance même pas les suivants, et aucun lot
tardif ne peut atteindre l'issue de rang 0 — parce que la revue de substitution est par issue. Le
travail pré-affichage est **structurellement borné** à trois appels, et sa variance de sortie tombe de
×26,6 à ×1,55.

Ce bornage n'est donc pas à construire. Il est à **mesurer**, et mesuré il donne 43 338 ms au p50,
48 883 ms au p95, 34 422 ms dans son meilleur cas — sur huit tours réels de clarification, confirmés
par un second jeu de données indépendant à 36–56 s. Le budget des 10 secondes vaut 505 jetons ; le
chemin en écrit 2 152, et l'Analyste seul en écrit 852.

Je dois aussi corriger mon propre rapport 1D-K, dont le chiffre phare était trompeur : ses 12 676 ms
étaient la médiane d'une population dont 85 % des tours n'avaient besoin d'aucune clarification.
Restreinte aux tours qui en ont besoin, la même donnée donne 55 746 ms. La nuance optimiste de 1D-K
est retirée.

Les cinq leviers sont désormais tous instruits — exposition anticipée, volume de sortie, nombre de
rôles, débit fournisseur, bornage du pré-affichage — et aucun ne ferme le seuil, seul ou combiné. Ce
qui reste n'est plus une optimisation : **c'est le constat que le contrat interactif de 10 secondes et
le contrat sémantique complet d'OPRIE sont incompatibles dans cette architecture, pour les demandes
qui nécessitent réellement une clarification.** Conformément au §13 de la mission précédente, je ne
recommande aucune micro-optimisation supplémentaire.
