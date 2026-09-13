# ATELIER-DEEP-CRITICAL-PATH-ROLE-AUDIT-01

**Sous-lot :** `ATELIER_DEEP_CRITICAL_PATH_ROLE_AUDIT_01D_J`
**Nature :** audit architectural / call graph / autorité. Lecture seule, aucune implémentation.
**Question :** quels rôles Deep sont indispensables **sur le chemin critique du premier ASK sûr** ?

**Réponse en une phrase.** Le plus petit ensemble de rôles compatible avec 10 s est *l'Analyste
seul*, et l'Analyste seul n'est pas sûr ; le plus petit ensemble **sûr** est Analyste + Critique, qui
coûte ≈ 21 s. **Aucune combinaison sûre des deux leviers audités — raccourcir le chemin (1D-J) et
raccourcir les sorties (1D-I) — n'atteint 10 s, et le seuil de 5 s est dépassé par l'Analyste seul
avant que quiconque d'autre n'ait écrit un jeton.**

---

## A. État Git

```
git status --short  → ?? docs/ATELIER-EARLY-CLARIFICATION-AUDIT-01.md
                       ?? docs/ATELIER-DEEP-OUTPUT-MINIMIZATION-AUDIT-01.md   (rapports 1D-H et 1D-I)
git branch          → main
git rev-parse HEAD  → 11906d2415b788f8b5ab44346e1d155484b0c795
git log -5          → 11906d2 Merge / dda04a3 studio-clinique / 3adfead index.html
                       a1974cb Merge / 6dfe38d studio-clinique
```

| | |
|---|---|
| tree `tools/Atelier Prompts` @ `1d5eed5` | `0d8b49f55dc627f84a2fee31d2498ffe17fa7c8b` |
| tree `tools/Atelier Prompts` @ `HEAD` | `0d8b49f55dc627f84a2fee31d2498ffe17fa7c8b` |
| `git diff 1d5eed5..HEAD -- 'tools/Atelier Prompts'` | **0 ligne** |

Aucun changement sémantique Atelier. Écart documenté, audit poursuivi en place. Aucune copie isolée
nécessaire. **Aucun appel API émis par ce sous-lot.**

## B. Rappel 1D-H / 1D-I

1D-H : le chemin de clarification anticipée est **prouvé** — `deriveCriticConsequences` calcule
déterministement `question_is_last_resort`, et `analyst_output.question_candidates[]` porte déjà la
forme exacte de `next_question`. Mais l'exposition après Critique plafonne à ≈ 32 500 ms.

1D-I : le sur-provisionnement des sorties est **prouvé** (63/111 feuilles dupliquées, 4 déjà
recalculées par du code), et la minimisation seule n'atteint ni 10 s ni 5 s, parce que le budget des
10 s vaut 770 jetons de sortie et que l'Analyste seul en écrit 685.

Ce sous-lot instruit le levier restant : le **nombre de rôles avant affichage**.

## C. Call graph actuel

```
saisie utilisateur
 └─ oprieRunTurn(requestedMode)                                       HTML:21742
      ├─ oprieSetBusy(true) ; oprieShowAnalysing()                     HTML:21745   t≈0
      ├─ const deepPromise = oprieRequestTurn()                        HTML:21752   lancé, non attendu
      ├─ oprieStartFastPlane(seq, requestedMode)                       HTML:21755
      │    └─ /fast-interaction → projectInteractionForMode
      │         ACKNOWLEDGE → WAIT_FOR_DEEP_VALIDATION → silence (1D-G)
      │         ASK_*        → oprieAsk + oprieReleaseForFastQuestion(seq)
      ├─ turn = await deepPromise                                      HTML:21758   ← LE BLOCAGE
      │    └─ POST /operational-request → handleOperationalRequest     orchestrator.js:460
      │         └─ runOperationalRequestTurn                           orchestrator.js:352
      │              for (role of ["analyst","critic","arbiter"])       :377  INCONDITIONNEL
      │                ├─ analyst : 1 appel, buildRoleInput + material_context + material_content
      │                ├─ critic  : runCriticBatchedPipeline, 1 global + N lots
      │                │            N = |issues où impact=material ET recommended_treatment=question|
      │                │            deriveCriticConsequences   ← DÉTERMINISTE
      │                │            applySubstitutionGate      ← DÉTERMINISTE
      │                └─ arbiter : 1 appel
      │              const turn = outputs.arbiter                       :439  SEULE SORTIE
      │              isLegalTransition("understanding", turn.state)     :440
      └─ oprieApplyTurn(turn, requestedMode)                            HTML:21726
           concludedTurn = seq ; oprieReconcileFast(turn)
           oprieDecideOrchestration → ORCHESTRATION_DRIVER[action]
```

### Matrice par étape

| | **Fast** | **Analyste** | **Critique global** | **Lots de substitution** | **Conséquences déterministes** | **Arbitre** | **`state_check`** |
|---|---|---|---|---|---|---|---|
| FUNCTION | `runInteractiveTurn` | `executeRole("analyst")` | `runCriticBatchedPipeline` (global) | idem (lots) | `deriveCriticConsequences`, `applySubstitutionGate` | `executeRole("arbiter")` | `isLegalTransition` |
| START_DEPENDENCY | instantané de tour | demande + historique + matériau | `analyst_output` complet | `analyst_output` + cibles | sortie brute du Critique | `analyst_output` + `critic_output` | `turn.state` |
| END_DEPENDENCY | aucune | — | — | — | — | — | — |
| INPUT_REQUIRED | demande | demande, historique, `material_context`, `material_content` | `analyst_output`, `material_context` | `analyst_output`, cibles projetées | revue de substitution | les deux sorties + `material_context` | état |
| OUTPUT_PRODUCED | `{type,text}` | 5 champs / 29 feuilles | 9 champs / 17 feuilles | 6 familles × 6 feuilles par issue | `question_is_last_resort`, `illegitimate_question_found`, `agreement` | 8 champs / 29 feuilles | booléen |
| AUTHORITY | **candidate** | contributeur | contributeur | contributeur | dérivée, sous OPRIE | **seule autorité de readiness** | garde de légalité |
| CAN_BLOCK_DISPLAY | non | **oui** | **oui** | **oui** | non | **oui** | oui (refus) |
| CAN_PRODUCE_CLARIFICATION_SIGNAL | non | candidate seulement | non | non | **oui — condition nécessaire** | **oui — l'état** | non |
| CAN_PRODUCE_QUESTION | oui (non autoritaire) | **oui** (`question_candidates[]`) | non | non | non | **oui** (`next_question`) | non |
| CAN_INVALIDATE_PREVIOUS_RESULT | non | non | **oui** (vetos, dérive, issues manquées) | **oui** (alternative disponible) | **oui** (`illegitimate_question_found`) | **oui** | non |
| REQUIRED_FOR_FIRST_SAFE_ASK | non | **OUI** | **OUI** | **oui, celui de l'issue retenue** | **OUI** | **NON** — démontré ci-dessous | non |
| REQUIRED_FOR_FINAL_TURN | non | oui | oui | oui | oui | **OUI** | oui |

## D. Analyste

**A1 — où le prompt prévoit l'absence d'Arbitre.** `operational-request-core.js:216`,
`ANALYST_SYSTEM_PROMPT` point 8, littéralement :

> « Mais un rôle ultérieur (**l'Arbitre s'il est appelé, ou le mécanisme qui sélectionne la prochaine
> question lorsqu'il n'est pas appelé**) ne retient toujours qu'UNE seule prochaine question
> effectivement posée à l'utilisateur. En conséquence : […] s'il en reste plusieurs, **classez-les par
> ordre décroissant de valeur informationnelle : la première est celle qu'un rôle ultérieur retiendra
> en priorité**. »

Deux choses s'y trouvent, et la seconde est la plus importante : le contrat anticipe l'absence
d'Arbitre, **et il exige déjà de l'Analyste un ordre de priorité explicite**. La sélection de la
question n'est donc pas un jugement réservé à l'Arbitre : elle est **pré-calculée par le tri de
l'Analyste**, et « prendre la première » est une règle déterministe déjà couverte par le contrat.

**A2 — statut de cette capacité : préparatoire, non active.** Aucun chemin de production ne saute
l'Arbitre. La phrase est une clause de contrat tournée vers l'avant, pas la description d'un
comportement existant.

**A3 — le runtime possède-t-il un chemin correspondant ? Partiellement, et c'est piégé.**
`roleFromPathname` (`workers/groq/src/index.js:2181`) est **réellement routé en production**
(`:2261`) : `/analyst`, `/critic` et `/arbiter` répondent. `handleRoleRequest` rend la sortie brute
du rôle, **sans état OPRIE**, sans `state_check`, sans `isLegalTransition`. Aucune de ces routes ne
constitue un tour.

Et surtout — **`requireExactKeys` interdit `material_context` sur ces routes** :

```js
validateCriticInput  : ["original_request","clarification_history","analyst_output","previous_vetoes"]
validateArbiterInput : ["original_request","clarification_history","analyst_output","critic_output"]
buildRoleInput       : critic  → { ...base, analyst_output, previous_vetoes:[], material_context }
                       arbiter → { ...base, analyst_output, critic_output, material_context }
```

Le chemin interne fournit `material_context`, les routes HTTP le **refusent**. Composer les trois
routes côté client exécuterait donc Critique et Arbitre **aveugles au matériau** — c'est-à-dire
régresserait silencieusement `OPRIE-ARBITER-MATERIAL-CONTEXT-DELIVERY-01`, dont le rapport mesure le
défaut à **seize échecs sur trente**. Le chemin existe, il est vivant, et il est strictement plus
pauvre que l'orchestration interne.

**A4 — l'Analyste produit-il assez pour une clarification candidate sûre ? Non, et c'est structurel.**
Il produit la matière (`issues[]`, `question_candidates[]` triés), mais pas la **légitimité** : le
prompt du Critique, point 5, impose une « seconde lecture obligatoire » testant, pour chaque issue
matérielle traitée par question, si l'une des six alternatives non-question était raisonnablement
disponible. Une question de l'Analyste avant ce test est exactement ce que le Critique existe pour
éliminer.

**A5 — l'Analyste peut-il déclarer la clarification ?** Non. `ANALYST_OUTPUT_FIELDS` ne contient
aucun champ d'état ; aucun code ne dérive d'état de sa sortie.

**A6 — l'invariant qui empêche l'affichage après Analyste.** Deux, superposés :

1. `const turn = outputs.arbiter` (`orchestrator.js:439`) — la réponse HTTP *est* la sortie de
   l'Arbitre ; rien d'intermédiaire ne quitte le Worker.
2. `assertOrchestratedRolesCoverOprie()` (`orchestrator.js:542`) — exige que
   `OPERATIONAL_REQUEST_ROLE_SEQUENCE` soit **exactement** `OPRIE_ROLES`. L'ensemble des trois rôles
   est verrouillé structurellement : aucun chemin raccourci ne peut être obtenu en retirant un rôle
   de la séquence.

## E. Critique

**C1 — oui.** Le Critique est le premier rôle qui transforme une question candidate en question
suffisamment justifiée. C'est sa revue de substitution, et rien en amont ne la remplace.

**C2 — oui, le résultat déterministe suffit à établir le BESOIN.** `deriveCriticConsequences` calcule
`question_is_last_resort = !anyAvailable` sur les six familles de `LADDER_ALTERNATIVE_VALUES`. Au
moins une issue matérielle avec `true` signifie « une inconnue matérielle non substituable subsiste
réellement » — mot pour mot la définition que le prompt de l'Arbitre donne de
`clarification_required` (`core.js:598`).

**C3 — oui pour choisir LA question, sous une condition explicite.** Le tri exigé de l'Analyste
(point 8) désigne déjà la candidate prioritaire. « La première candidate dont l'issue survit à la
porte de substitution » est une règle déterministe entièrement couverte par les contrats existants.
La condition non couverte est la **déduplication sémantique contre `clarification_history`**, que
seul l'Arbitre pratique (« jamais une question déjà posée en substance, même reformulée
différemment : comparez le sens, jamais les mots »). Vacante au premier tour, réelle ensuite.

**C4 — le Critique global est nécessaire.** Il produit `vetoes` et `semantic_drift_detected`, les
deux entrées sans lesquelles `evaluateSubstitutionGate` ne peut rendre ni
`REJECTED_USER_RESERVED_CHOICE` ni `REJECTED_OBJECTIVE_CHANGED`, ainsi que `missed_material_issues`.
Aucun lot ne les produit.

**C5 — non, tous les lots ne sont pas nécessaires avant affichage.** Voir section F.

**C6 — non, aucune famille ne peut être évaluée déterministement.** Juger si « rechercher » est
raisonnablement disponible pour une issue donnée est un jugement sémantique sur le fond de la
demande. Le rendre déterministe exigerait des règles de domaine ou un classifieur — interdits par le
§10 du présent sous-lot et par `GATE-103` (« ni appariement flou, ni seuil sémantique, ni codage en
dur du domaine »). **Cela réfute H2 : des « conséquences déterministes du Critique » sans appel
Critique n'existent pas, puisque `deriveCriticConsequences` prend en entrée la revue produite par le
LLM.**

**C7 — le rôle est nécessaire avant le premier ASK sûr ; ses conséquences suffisent ensuite.** Ce
qu'il faut avant affichage, c'est son appel global et le lot de l'issue retenue. Ce qui peut
attendre, c'est la consolidation.

## F. Critic batches

`N = |issues où impact="material" ET recommended_treatment="question"|`
(`buildQuestionReviewTargets`, fonction pure). Mesuré : 1 – 2 – **13** appels Critique par tour
(`DEEP-COUT-JETONS-01`, n=12), donc jusqu'à 12 lots. Une seule question est posée par tour.

| par lot / famille | verdict |
|---|---|
| CAN_VETO_QUESTION | **OUI** — une alternative jugée disponible rend `question_is_last_resort=false` et alimente `illegitimate_question_found` |
| CAN_CHANGE_TARGET | **OUI, indirectement** — invalider l'issue de rang 1 fait remonter le rang 2 |
| CAN_CHANGE_CLARIFICATION_TO_READY | **non directement** ; si *tous* les lots invalident toutes les questions, plus aucune issue non substituable ne subsiste et `ready` devient atteignable par l'Arbitre |
| CAN_RUN_AFTER_DISPLAY | **OUI pour les lots des issues de rang inférieur** ; **NON pour celui de l'issue affichée** |
| REQUIRED_BEFORE_DISPLAY | **seul celui de l'issue retenue** |

C'est la précision que 1D-I laissait en `NOT_PROVEN`. **`BATCH_COUNT_CHANGE_REQUIRED = YES`, mais
seulement sur la queue** : au p50 le tour ne fait déjà qu'un lot, donc plafonner à 1 ne change rien à
la médiane et écrase la queue (13 appels → 2). C'est une réduction de **variance**, pas de médiane —
et `DEEP-INTERACTION-EARLY-STOP-01` a déjà implémenté un arrêt anticipé par vagues bornées avec
`NOT_EXECUTED_EARLY_STOP`.

## G. Arbitre

**R1 — ce qu'il fait et qui n'est pas déjà disponible :** déclarer l'état (`state`), reconstruire le
candidat final et les issues finales qui deviennent le contrat canonique
(`oprie-canonical-mapping.js:202, 209, 220, 434`), produire `intent_preservation`, et dédupliquer
sémantiquement la question contre l'historique.

**R2 — sélectionne-t-il réellement la question ? Partiellement.** Il écrit `next_question`, mais le
tri de priorité lui est fourni par l'Analyste (point 8). Sa contribution propre au *choix* est
l'arbitrage entre survivantes et la déduplication contre l'historique.

**R3 — peut-il invalider une clarification que le Critique juge `last_resort` ? OUI, et rien ne l'en
empêche.** `validateArbiterOutput` ne croise **aucun** champ de `critic_output` — ni
`question_is_last_resort`, ni `illegitimate_question_found`, ni `agreement`. Vérifié par lecture
intégrale. La seule garde est son prompt.

**R4 — peut-il convertir `clarification_required` en `READY` ? OUI**, pour la même raison.

**R5 — peut-il modifier l'issue ciblée ? OUI** — `next_question.targets_issue_id` est son champ.

**R6 — consolide-t-il seulement ? Non.** Il consolide *et* décide. `state` est sa production
exclusive.

**R7 — nécessaire avant affichage, ou avant clôture canonique ?** Avant **clôture canonique**. Rien
dans ce qu'il produit n'est requis pour *émettre* une question dont le besoin et le texte sont déjà
établis en amont. Mais il reste requis pour que le tour existe.

## H. Décisions et autorités — matrice centrale

| DÉCISION | AUTORITÉ ACTUELLE | ÉTAGE LE PLUS PRÉCOCE DISPONIBLE | DÉTERMINISTE / LLM | PEUT CHANGER PLUS TARD | DOIT ÊTRE FINALE AVANT AFFICHAGE |
|---|---|---|---|---|---|
| `NEED_CLARIFICATION` | Arbitre (`state`) | **fin Critique** (`question_is_last_resort`) | **déterministe** (sur entrée LLM) | oui (R3/R4) | **OUI** |
| `SELECT_ISSUE` | Arbitre | **fin Critique** (1er rang survivant au tri de l'Analyste) | **déterministe** | oui (R5) | **OUI** |
| `SELECT_QUESTION` | Arbitre (`next_question`) | **fin Analyste** (`question_candidates[0]`) | **déterministe** | oui | **OUI** |
| `VALIDATE_QUESTION` | Critique + porte | **fin Critique** | **déterministe** | par l'Arbitre seul | **OUI** |
| `DEDUPE_AGAINST_HISTORY` | **Arbitre seul** | fin Arbitre | LLM | — | **OUI si historique non vide** · vacant au 1er tour |
| `CANONICALIZE_TURN` | Arbitre + mapping | fin Arbitre | LLM puis déterministe | non | **NON** |
| `DECLARE_READY` | **Arbitre seul** | fin Arbitre | LLM | non | **NON** |
| `FINALIZE_ADN_SUMMARY` | mapping (`reason`) | fin Arbitre | déterministe | non | **NON** |

Quatre décisions sur huit doivent être finales avant affichage, et **les quatre sont disponibles à la
fin du Critique**. La cinquième (déduplication) n'est requise qu'à partir du deuxième tour. Les trois
dernières appartiennent à la clôture, pas à l'affichage.

## I. Chemins existants sans Arbitre

| LOCATION | ACTIVE_IN_PRODUCTION | SEMANTIC_MEANING | AUTHORITY_SOURCE | FAIL_CLOSED | CAN_PRODUCE_ASK |
|---|---|---|---|---|---|
| `ANALYST_SYSTEM_PROMPT:216` — « l'Arbitre s'il est appelé » | **non** (clause de contrat) | anticipe un sélecteur déterministe | aucune | — | non |
| routes `/analyst`, `/critic`, `/arbiter` (`index.js:2261`) | **OUI, routées** | surfaces de rôle, jamais un tour | **aucune** — pas de `state`, pas de `state_check` | oui (502 sans état) | **NON** — et `material_context` refusé par `requireExactKeys` |
| `degradedResultFromProviderChainError` | **OUI** | `degraded_state` sur épuisement de chaîne | système, jamais un rôle | **oui** | non |
| `assertOrchestratedRolesCoverOprie` | **OUI** | **interdit** tout ensemble de rôles ≠ les trois | invariant | oui | — |
| `/decision` (legacy, banc) | oui | contrat historique, hors OPRIE | aucune pour OPRIE | oui | non |

**Aucun chemin de production ne produit aujourd'hui d'ASK sans Arbitre.** Le seul chemin technique
existant — composer les trois routes côté client — est réfuté deux fois : il perd `material_context`
(régression mesurée à 16/30) et il fait du client un second orchestrateur, alors que
`handleOperationalRequest` est aujourd'hui le seul lieu où un tour existe.

## J. H0 – H4

| | **H0** actuel | **H1** Analyste+Critique → ASK, Arbitre ensuite | **H2** Analyste + conséquences déterministes | **H3** Analyste + sous-ensemble Critique | **H4** Analyste seul |
|---|---|---|---|---|---|
| SEMANTIC_SAFETY | HIGH | **HIGH** | — | **HIGH** | **LOW** |
| AUTHORITY_PRESERVATION | HIGH | HIGH (l'état reste de l'Arbitre) | — | HIGH | LOW |
| TIME_TO_FIRST_SAFE_ASK_POTENTIAL | ≈ 33 s / 56,5 s smoke | **≈ 21 à 32,5 s** | — | ≈ 21 s (p50), écrase la queue | ≈ **8,9 s** |
| ROLES_BEFORE_DISPLAY | 3 | **2** | 1 | 2 | 1 |
| LLM_CALLS_BEFORE_DISPLAY (p50) | 4 | **3** | 1 | **3** | **1** |
| BATCHES_BEFORE_DISPLAY | tous (1–12) | tous | 0 | **1** | 0 |
| CAN_LATER_RESULT_CONTRADICT_ASK | non | **oui** (R3/R4) | — | oui | oui |
| STALE_TURN_RISK | LOW | LOW (mécanismes suffisants, §L) | — | LOW | LOW |
| FAIL_CLOSED | oui | oui | — | oui | oui |
| NEW_STATE_REQUIRED | — | **NON** | — | NON | NON |
| NEW_COMPONENT_REQUIRED | — | **NON** | — | NON | NON |
| NEW_AUTHORITY_REQUIRED | — | **NON** | — | NON | **OUI de fait** |

**H2 est impossible, pas seulement risquée.** `deriveCriticConsequences` prend en entrée
`question_substitution_review`, produite par le LLM Critique. Sans appel Critique, il n'y a rien à
dériver. La rendre déterministe exigerait un classifieur, interdit. `H2 = UNSAFE`.

**H4 est rejeté, et l'analyse 1D-H reste valide.** L'Analyste seul propose des questions que le
Critique existe pour éliminer ; l'afficher réintroduit exactement le sur-questionnement que la ladder
de substitution a été construite pour empêcher. C'est aussi la seule hypothèse qui passe sous 10 s —
la coïncidence est le cœur du problème.

**H3 se confond avec H1 à la médiane.** Au p50 le tour ne fait qu'un lot : H3 ≡ H1. H3 n'apporte
quelque chose que sur la queue (13 appels → 3). Réduction de variance, pas de médiane.

## K. Deep après affichage

`CAN_DEEP_CONTINUE_AFTER_ASK = YES`, et **c'est déjà le comportement de production**.

`oprieReleaseForFastQuestion(seq)` (HTML:21390) remet `running=false` et déverrouille la saisie
**sans annuler** `deepPromise`. Le plan profond continue donc pendant qu'une question rapide est
affichée, et son résultat est appliqué à l'arrivée par `oprieApplyTurn`.

`CAN_LATE_ARBITER_REPLACE_ACTIVE_ASK = YES`. La table de politique le gère explicitement
(`core/adn/orchestration-policy.js`) :

| arrivée tardive du Deep | question déjà affichée | action |
|---|---|---|
| état sollicitant, **même catégorie** que la candidate | oui | **`KEEP_CURRENT_INTERACTION`** (`DEEP_CONFIRMS_FAST_*`) → `() => false`, rien n'est réécrit |
| état sollicitant, catégorie différente ou pas de candidate | oui | `WAIT_FOR_USER` → `oprieShowClarification(turn)` → `oprieAsk(...)` **réécrit la question** |
| `operational_request_ready` | oui | **`ENTER_READINESS`** → `oprieEnterExecution` — appliqué **sans égard** à la question affichée |
| `blocked` / `degraded_state` | oui | `SHOW_BLOCKED` / `SHOW_DEGRADED` |

`WOULD_REPLACEMENT_BE_SAFE = NOT_PROVEN`, et voici précisément pourquoi. `oprieAsk` exécute
`$('#v11-answer').value=''` : **une réponse partiellement saisie est effacée** par une question
tardive. Aucun état n'est corrompu, aucune fausse affirmation n'est produite, `IA-03` empêche tout
rejeu d'action à effet — mais le travail de la personne peut disparaître sous ses doigts. Le risque
est ergonomique et réel, et il n'est aujourd'hui jamais atteint parce que Fast et Deep produisent
presque toujours la même catégorie. Une exposition anticipée le rendrait atteignable.

## L. Tours périmés

| mécanisme | emplacement | effet |
|---|---|---|
| `turn_id` monotone | `createTurnCoordinator.openTurn` | refuse un identifiant non progressant |
| rejet d'un résultat périmé | `createTurnCoordinator.accept` | `TURN_STALE`, comptabilisé |
| garde de `seq` | HTML:21395, 21758, 21767 | un tour dépassé ne rend rien |
| `concludedTurn` | HTML:21726, 21397 | une candidate arrivée après la décision se tait |
| `pendingQuestion` | HTML:21400 | une candidate ne se superpose jamais à une question ouverte |
| `AbortController` | HTML:21296-97 | le nouveau tour annule le précédent en vol |
| `IGNORE_STALE` | policy, points 2 | `turn_id <` courant ou mode changé ⇒ aucune action |
| `ORCHESTRATION_EFFECTLESS_ACTIONS` + `appliedActions` | HTML | une action à effet ne s'applique qu'une fois par tour |
| réconciliation | `reconcileFastWithDeep` | `TURN_STALE` / `CONFIRMS` / `SUPERSEDES` |

**Suffisants pour un ASK anticipé** : annuler, remplacer et ignorer sont tous couverts sans mécanisme
nouveau. Le manque demeure celui déjà nommé en 1D-H : une réponse **déjà donnée** entre dans
`clarification_history` et n'est pas récupérable. Ces mécanismes protègent l'intégrité de l'état,
pas l'interaction dépensée.

## M. Fail-closed

- Échec fournisseur sur un rôle → `degradedResultFromProviderChainError` → `degraded_state`, état
  OPRIE public, HTTP 200. `isLegalTransition` continue de refuser tout état illégal.
- Politique : défaut explicite `STOP_FAIL_CLOSED` sur `OPRIE_STATE_UNHANDLED`, `CONTEXT_INVALID`,
  `chainBrokenAt`, et `FAST_SOLICITATION_IN_NON_DIALOG_MODE`. Aucun « sinon » permissif.
- `readiness` non concluante → `STOP_FAIL_CLOSED`, jamais une question déduite.
- Un ASK anticipé suivi d'un échec de l'Arbitre laisserait la question affichée — établie par un
  signal déterministe sous autorité OPRIE — et le tour se conclurait en `degraded_state`. Aucune
  readiness annoncée. **Sûr.**

## N. Nombre minimal de rôles

| exigence | ensemble minimal |
|---|---|
| premier ASK **sûr** | **Analyste + Critique** (global + le lot de l'issue retenue) |
| tour final canonique | **Analyste + Critique + Arbitre** — verrouillé par `assertOrchestratedRolesCoverOprie` |
| < 10 s | **Analyste seul** — et il n'est pas sûr |
| < 5 s | **aucun ensemble**, y compris l'Analyste seul |

## O. Nombre minimal d'appels

| hypothèse | appels LLM avant ASK (p50) | jetons de sortie avant ASK | latence dérivée (~13 ms/jeton, série) | statut |
|---|---|---|---|---|
| H0 | **4** | 2 539 | ≈ 33 s | **MEASURED** (worker p50 32,6 s) |
| H1 / H3 | **3** | 1 624 | **≈ 21 s** | **DERIVED** |
| H2 | impossible | — | — | — |
| H4 | **1** | **685** | **≈ 8,9 s** | **DERIVED** |

Jetons : `evaluation/deep-cout-jetons-01/results.json`, compteurs fournisseur, n=12, Groq
(Analyste 685 / Critique 939 / Arbitre 915 en sortie p50). Loi de latence :
`DEEP-INTERACTION-LATENCY-01`. Contrôle de cohérence : 2 539 × 13 ms = 33 s contre 32,6 s mesurés.

Fourchette honnête pour H1 : **21 s** par la voie jetons (médiane Groq) et **32,5 s** par la voie
part d'étage appliquée au smoke de 56,5 s (1D-H, Arbitre 42,4 %, Sonnet, n=10). Les deux sont dans le
dépôt, les populations diffèrent, et aucune n'annule l'autre. **Les deux dépassent 10 s.**

## P. Budget < 10 s

À ~13 ms par jeton de sortie, en série : **770 jetons pour tout le chemin d'affichage.**

| | jetons | verdict |
|---|---|---|
| Analyste seul | 685 | 89 % du budget — **tient, mais non sûr** |
| Analyste + Critique (minimum sûr) | 1 624 | **211 % du budget** |
| Analyste + Critique, sorties minimisées au bord optimiste de 1D-I (−25 % / −45 %) | ≈ 1 030 | **134 % du budget — ≈ 13,4 s** |

**Même en combinant les deux leviers audités à leurs bords optimistes, le minimum sûr reste au-dessus
de 10 s.** C'est le résultat central de ce sous-lot.

```
CAN_REACH_10S_BY_ROLE_PATH_CHANGE = NOT_PLAUSIBLE   (en restant sûr)
```

## Q. Budget < 5 s

**385 jetons pour tout le chemin.** L'Analyste seul en écrit 685 — **78 % au-dessus**, avant que le
Critique ou l'Arbitre n'aient écrit un jeton. Minimisé de 25 %, il en écrit encore 514, soit 33 %
au-dessus. Et l'Analyste est **indispensable** : il est le seul producteur de `issues[]` et de
`question_candidates[]`, et rien dans le système ne peut les produire à sa place.

```
CAN_REACH_5S_BY_ROLE_PATH_CHANGE = NOT_PLAUSIBLE   (sûr ou non)
```

## R. Risques

1. **La seule hypothèse qui tient les 10 s est la seule qui n'est pas sûre.** H4 passe à 8,9 s en
   réintroduisant le sur-questionnement. C'est le piège principal de ce dossier : la tentation sera
   maximale, et elle défait l'acquis de la ladder.
2. **L'Arbitre n'est pas lié au Critique.** `validateArbiterOutput` ne croise aucun champ de
   `critic_output` : un ASK anticipé peut être contredit par un `READY` tardif. Coût d'usage, pas de
   correction.
3. **Réponse en cours effacée.** `oprieAsk` vide `#v11-answer` : une question tardive peut effacer ce
   que la personne tapait. Atteignable seulement si l'exposition anticipée est mise en œuvre.
4. **Composition côté client = régression matériau.** Les routes par rôle refusent
   `material_context` ; les utiliser régresserait un défaut mesuré à 16/30.
5. **Second orchestrateur.** Toute composition de rôles hors de `handleOperationalRequest` déplace le
   lieu où un tour existe. Pas une nouvelle autorité sémantique, mais une seconde autorité
   d'orchestration — et le dépôt n'en a jamais eu qu'une.
6. **Illusion d'avancement.** Livrer H1 (33 s → 21 s, −36 %) et croire le blocker traité. Il ne le
   serait pas.

## S. Tests requis

**Unitaires (déterministes, noyau)**
1. `question_is_last_resort` vrai exactement quand aucune des six familles n'est disponible.
2. Sélection = première `question_candidates[]` dont l'issue survit à la porte — et l'ordre de
   l'Analyste est respecté.
3. Aucune sélection quand `clarification_history` est non vide (déduplication réservée à l'Arbitre).
4. `evaluateSubstitutionGate` : mêmes `reason_code`, un par un.
5. Aucun mot-clé, aucun domaine, aucun seuil : deux corpus lexicalement opposés, mêmes verdicts.
6. `assertOrchestratedRolesCoverOprie` inchangé : la séquence reste les trois rôles.

**Intégration déterministe**
7. Même besoin de clarification, même issue cible, même question (par le sens) entre chemin complet
   et chemin raccourci, sur les fixtures existantes.
8. Même contrat canonique après `mapOprieToCanonicalContract` — égalité profonde.
9. `READY` jamais émis prématurément ; `state` toujours produit par le seul Arbitre.
10. Échec fournisseur → `degraded_state`, fail-closed.
11. `material_context` effectivement délivré au Critique et à l'Arbitre sur le chemin retenu — le
    test qui interdit la régression 16/30.

**Navigateur**
12. ASK anticipé visible sous le seuil mesuré ; aucun `ACKNOWLEDGE` affiché (non-régression 1D-G).
13. Jamais deux questions actives ; `pendingQuestion` respecté.
14. Arbitre tardif : `KEEP_CURRENT_INTERACTION` quand la catégorie coïncide ; aucun tour corrompu.
15. **Une réponse en cours de saisie n'est jamais effacée par une question tardive.**
16. Réponse à une question périmée rejetée (`seq`, `concludedTurn`, `IGNORE_STALE`).
17. Fast reste non autoritaire ; Rapide inchangé ; Architecte inchangé ; Atelier hors périmètre.

**Différentiels** — `FULL_PATH` vs `SHORT_PATH` sur tout le corpus, en comparant les **décisions** et
non la validité JSON.

**Smoke réel minimal** — un tour, mesurant `TIME_TO_FIRST_SAFE_ASK` et
`TIME_TO_FINAL_SEMANTIC_CONSOLIDATION` sur le même tour. Un tour, pas une campagne.

## T. Verdict

L'Arbitre **n'est pas requis avant l'affichage d'une clarification sûre**, et la démonstration est
complète : les quatre décisions qui doivent être finales avant affichage — besoin, issue, question,
validation — sont toutes disponibles à la fin du Critique, par du code déterministe
(`deriveCriticConsequences`, `applySubstitutionGate`) et par un tri que le contrat de l'Analyste exige
déjà. La cinquième, la déduplication contre l'historique, est vacante au premier tour. Les trois
dernières appartiennent à la clôture canonique, pas à l'affichage. Et le contrat de l'Analyste
anticipe explicitement, depuis son écriture, « le mécanisme qui sélectionne la prochaine question
lorsque l'Arbitre n'est pas appelé ».

Le Critique, lui, **est requis** — et H2 tombe pour cette raison exacte : ses conséquences
déterministes n'existent qu'à partir de sa sortie LLM, et les rendre déterministes exigerait le
classifieur que ce système interdit.

Le plus petit ensemble sûr est donc **Analyste + Critique**, soit 3 appels au p50 et 1 624 jetons de
sortie, c'est-à-dire ≈ 21 s — et 32,5 s par l'autre voie de mesure. Le budget des 10 secondes vaut
770 jetons. **Le minimum sûr en demande 211 %, et 134 % après application du bord optimiste de la
minimisation de 1D-I.** Le budget des 5 secondes est dépassé par l'Analyste seul, qu'aucun autre rôle
ne peut remplacer.

Les deux leviers ouverts par 1D-H et 1D-I sont donc désormais tous deux instruits, et tous deux
insuffisants — séparément et **ensemble**. Ce qui reste n'est plus dans l'orchestration ni dans la
longueur des sorties : c'est la **vitesse de génération par jeton**, c'est-à-dire le modèle qui sert
les rôles Deep. Le dépôt possède déjà une mesure de ce paramètre pour le plan Fast
(`PERF-NOMINAL-PROVIDER-01`) ; il n'en possède aucune pour le plan Deep.
