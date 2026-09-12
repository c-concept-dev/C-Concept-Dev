# ATELIER-EARLY-CLARIFICATION-AUDIT-01

**Sous-lot :** `ATELIER_FAST_EARLY_CLARIFICATION_01D_H`
**Nature :** audit architectural ciblé. Aucune implémentation, aucun code de production modifié.
**Question posée :** peut-on rendre visible plus tôt une vraie clarification OPRIE sans faire de Fast
une autorité, sans créer une seconde readiness, et sans attendre Analyste + Critique + Arbitre
lorsque leur résultat n'est pas nécessaire à la simple émission de la question ?

La réponse tient en deux temps, et les deux sont nécessaires : **oui, un signal fiable existe plus
tôt et il est déterministe** ; **non, l'exposer plus tôt ne suffit pas à fermer le blocker**, parce
que même le premier étage sûr reste six fois au-delà du seuil d'échec interactif.

---

## A. État de référence

| | |
|---|---|
| `REFERENCE_HEAD` annoncé | `1d5eed5` — présent dans l'historique local, ancêtre de HEAD |
| `HEAD` réel au moment de l'audit | `11906d2` |
| `ATELIER_SEMANTIC_BASE` | `874a6bc` — ancêtre de HEAD, confirmé |
| Subtree Atelier vs `874a6bc` | **diff vide** — aucune mutation externe du périmètre |
| Worktree Atelier | propre, 0 entrée non commitée |
| `GLOBAL_SUITE` | 2985 / 2985, 0 échec, 0 ignoré |
| `FROZEN_HASHES` | 7/7 conformes |

Les commits intercalaires (`1d5eed5`, `6dfe38d`, `a1974cb`, `3adfead`, `dda04a3`, `11906d2`) touchent
`index.html` et `tools/Conseiller Clinique/`, hors périmètre. Le tree SHA du subtree a changé depuis
`bbd809a` uniquement parce que le commit 1D-G `874a6bc` l'a changé lui-même.

## B. Blocker confirmé

**Confirmé, par lecture de code, sans rejouer aucun appel.**

`workers/shared/operational-request-orchestrator.js:377` — la boucle est inconditionnelle :

```js
for (const role of OPERATIONAL_REQUEST_ROLE_SEQUENCE) { … }   // ["analyst","critic","arbiter"]
```

`operational-request-orchestrator.js:439` — la réponse EST la sortie de l'Arbitre :

```js
const turn = outputs.arbiter;
```

Aucune valeur intermédiaire ne quitte le Worker. `handleOperationalRequest` rend `turn`, et rien
d'autre : les sorties de l'Analyste et du Critique n'existent que dans `outputs`, en mémoire, et ne
sont observables que par la trace serveur (`analyst_provenance_observation`,
`critic_global_material_context_observation`) qui ne porte **que des étiquettes**, jamais un texte de
question.

Conséquence exacte : lorsque Fast rend `ACKNOWLEDGE` — donc, depuis 1D-G, un silence — **rien n'est
affiché avant la fin de l'Arbitre**. Le smoke déjà acquis mesure ce chemin : `56 489 ms`.
Contre l'invariant CDC (`> 5 s` = dialogue non conforme, `> 10 s` = échec interactif), c'est un
échec interactif d'un facteur 5,6.

## C. Call graph réel

```
saisie utilisateur
  └─ oprieRunTurn(requestedMode)                                    HTML:21725
       ├─ oprieSetBusy(true) ; oprieShowAnalysing()                  HTML:21726   ← t≈0, bandeau
       ├─ const deepPromise = oprieRequestTurn()                     HTML:21733   ← lancé, NON attendu
       │    └─ POST /operational-request  (AbortController, seq)      HTML:21296-97
       │         └─ handleOperationalRequest                          orchestrator.js:460
       │              └─ runOperationalRequestTurn                    orchestrator.js:352
       │                   ├─ phase "analyst"  → executeRole          ~32,1 % du tour
       │                   │    └─ validateAnalystOutput              core.js:242
       │                   │         { candidate, provenance_records,
       │                   │           issues, question_candidates,
       │                   │           confirmation_signals }
       │                   ├─ phase "critic"   → runCriticBatchedPipeline  ~25,5 % du tour
       │                   │    └─ deriveCriticConsequences           core.js  ← DÉTERMINISTE
       │                   │         { question_substitution_review[].question_is_last_resort,
       │                   │           illegitimate_question_found, agreement }
       │                   │    └─ applySubstitutionGate / evaluateSubstitutionGate ← DÉTERMINISTE
       │                   ├─ phase "arbiter"  → executeRole          ~42,4 % du tour
       │                   │    └─ validateArbiterOutput              core.js:678
       │                   │         { state, next_question, … }
       │                   └─ phase "state_check" : isLegalTransition("understanding", turn.state)
       │                                                              orchestrator.js:440
       └─ oprieStartFastPlane(seq, requestedMode)                     HTML:21735
            └─ POST /fast-interaction → projectInteractionForMode      fast-interactive-plane.js:177
                 └─ oprieRenderFastInteraction(interaction, seq)       HTML:21394
                      ACKNOWLEDGE → WAIT_FOR_DEEP_VALIDATION → silence (1D-G)
  ← puis, ~56 s plus tard : oprieApplyTurn(turn) → question visible
```

Parts par étage : `docs/DEEP-INTERACTION-LATENCY-01.md` ligne 20-21, rapports de médianes,
population B, n=10, Sonnet. Le document les qualifie lui-même d'« ordre de grandeur, pas une mesure
exacte ». Je les reprends avec cette réserve.

## D. Matrice composants / autorité

| | **Fast plane** | **Analyste** | **Critique (global + batches)** | **`deriveCriticConsequences` + `applySubstitutionGate`** | **Arbitre** | **`state_check`** |
|---|---|---|---|---|---|---|
| FUNCTION | `runInteractiveTurn` → `projectInteractionForMode` | `executeRole("analyst")` | `runCriticBatchedPipeline` | `deriveCriticConsequences`, `evaluateSubstitutionGate` | `executeRole("arbiter")` | `isLegalTransition` |
| INPUT | `turn_snapshot` (demande, historique, réponse) | `original_request`, `clarification_history`, `material_context`, `material_content` | idem + `analyst_output` + `question_review_targets` | sortie brute du Critique | idem + `analyst_output` + `critic_output` | `turn.state` |
| OUTPUT | `{type, text}` | `{candidate, provenance_records, issues, question_candidates, confirmation_signals}` | `{agreement, …, question_substitution_review, illegitimate_question_found}` | mêmes champs, **dérivés** | `{state, next_question, confirmation_reason, blocked_reason, …}` | booléen |
| STATE_READ | aucun état OPRIE | aucun | `analyst_output` | sortie Critique | `analyst_output`, `critic_output` | machine gelée |
| STATE_WRITTEN | **aucun** | aucun | aucun | aucun | **`state`** | aucun |
| AUTHORITY | `candidate` | contributeur | contributeur | **déterministe, dérivée** | **seule autorité de readiness** | garde de légalité |
| LLM / DÉTERMINISTE | LLM | LLM | LLM | **DÉTERMINISTE** | LLM | DÉTERMINISTE |
| CAN_DECLARE_CLARIFICATION_REQUIRED | non | non | non | **non — mais en établit la condition** | **oui** | non |
| CAN_BUILD_QUESTION | oui (candidate, non autoritaire) | **oui** — `question_candidates[]` | non | non | **oui** — `next_question` | non |
| CAN_INVALIDATE_PREVIOUS_STATE | non | non | **oui** — `vetoes`, `missed_material_issues`, revue de substitution | **oui** — `illegitimate_question_found`, `agreement` | **oui** | non (refuse, ne corrige pas) |
| MUST_WAIT_FOR_NEXT_STAGE | non (hors chemin de décision) | **oui** — sa question n'est pas encore légitime | **non** pour le besoin, **oui** pour le choix | **non** | — | — |

## E. Premier signal de clarification

Trois candidats existent réellement dans le code. Aucun concept nouveau n'est nécessaire.

| | **E1 — `analyst_output.issues[]`** | **E2 — `deriveCriticConsequences(...).question_substitution_review[].question_is_last_resort`** | **E3 — `arbiter.state`** |
|---|---|---|---|
| SOURCE | `core.js:242`, `ISSUE_JSON_SCHEMA` | `deriveCriticConsequences`, `core.js` | `validateArbiterOutput`, `core.js:678` |
| PRODUCER | Analyste (LLM) | **code déterministe**, à partir de la revue du Critique | Arbitre (LLM) |
| AUTHORITY | contributeur | dérivée, sous OPRIE | **autorité** |
| TIMING | fin Analyste, ≈ 32 % du tour | **fin Critique, ≈ 58 % du tour** | fin Arbitre, 100 % |
| STABILITY | **faible** — c'est précisément ce que le Critique existe pour challenger | **forte** — fonction pure de la sortie du Critique | définitive |
| CAN_BE_REVOKED_LATER | **oui** — `illegitimate_question_found` peut l'annuler | oui, mais par l'Arbitre seul | non |
| CAN_BE_REFINED_LATER | oui | oui (choix, reformulation) | — |
| CAN_PRODUCE_USER_VISIBLE_QUESTION | via `question_candidates[]` | non par lui-même | oui |
| RISK_IF_SHOWN_EARLY | **élevé** : réintroduit le sur-questionnement que la ladder existe pour empêcher | **modéré** : l'Arbitre peut encore conclure autrement (cf. K) | nul |

**Le signal E1 n'est pas sûr, et ce n'est pas un défaut : c'est le dessin.** Le prompt du Critique,
point 5, impose une « seconde lecture obligatoire » qui teste, pour chaque issue matérielle traitée
par question, si l'une des six alternatives non-question de la ladder était raisonnablement
disponible. Une question de l'Analyste n'est légitime qu'après ce test. L'exposer avant reviendrait à
poser les questions que le Critique est chargé d'éliminer.

**Le signal E2 est le premier signal fiable.** `deriveCriticConsequences` est du code pur :
`question_is_last_resort = !anyAvailable` sur les six familles de `LADDER_ALTERNATIVE_VALUES`. Si au
moins une issue matérielle survit avec `question_is_last_resort === true`, alors « une inconnue
matérielle non substituable subsiste réellement » — exactement la définition que le prompt de
l'Arbitre donne de `clarification_required` (core.js ligne 598). `applySubstitutionGate` et
`evaluateSubstitutionGate` sont également entièrement déterministes.

## F. Premier producteur possible de question

`analyst_output.question_candidates[]`, dont le schéma est :

```js
QUESTION_CANDIDATE_JSON_SCHEMA = { required: ["text","targets_issue_id","expected_progress"] }
```

C'est **exactement la forme de `next_question`** de l'Arbitre (core.js ligne 598 : « next_question est
toujours un objet à trois champs (text, targets_issue_id, expected_progress) »). Aucun nouveau
producteur de texte n'est donc nécessaire : le texte d'une question sûre existe déjà à la fin de
l'Analyste, et sa légitimité est établie à la fin du Critique.

Deux fonctions que l'Arbitre seul assure aujourd'hui restent non couvertes :

1. **le choix**, quand plusieurs issues survivent — l'Arbitre les départage « pour leur impact, leur
   non-substituabilité, le nombre de dépendances débloquées et la progression réelle apportée » ;
2. **la déduplication sémantique** contre `clarification_history` — « jamais une question déjà posée
   en substance, même reformulée différemment : comparez le sens, jamais les mots ». Vacante au
   premier tour (historique vide), réelle ensuite.

## G. Rôle Analyste

| | |
|---|---|
| peut-il initier `CLARIFICATION_REQUIRED` ? | **non** — ne produit aucun état |
| peut-il formuler la question ? | **oui** — `question_candidates[]`, forme identique à `next_question` |
| peut-il invalider une question amont ? | non |
| `clarification_required` → `ready` ? | non |
| `ready` → `clarification_required` ? | non |

## H. Rôle Critique

| | |
|---|---|
| peut-il initier `CLARIFICATION_REQUIRED` ? | **non** — mais il en établit la condition nécessaire |
| peut-il formuler la question ? | **non** — aucun champ de texte de question dans `CRITIC_OUTPUT_FIELDS` |
| peut-il invalider une question amont ? | **oui** — `illegitimate_question_found`, `vetoes`, `missed_material_issues` ; le prompt le dit explicitement : « votre verdict agree est une condition nécessaire, jamais une déclaration de readiness à vous seul » |
| `clarification_required` → `ready` ? | non |
| `ready` → `clarification_required` ? | non directement ; `agreement: "disagree"` y pousse sans l'imposer |

## I. Rôle Arbitre

| | |
|---|---|
| peut-il initier `CLARIFICATION_REQUIRED` ? | **oui — lui seul** |
| peut-il formuler la question ? | **oui** — `next_question` |
| peut-il invalider une question amont ? | **oui** |
| `clarification_required` → `ready` ? | **oui** |
| `ready` → `clarification_required` ? | **oui** |

**Constat de code décisif.** `validateArbiterOutput` ne croise **aucun** champ de la sortie du
Critique : ni `question_is_last_resort`, ni `illegitimate_question_found`, ni `agreement`. Vérifié par
lecture intégrale de la fonction. Rien de déterministe n'oblige donc l'Arbitre à honorer un
`question_is_last_resort === true` : la seule garde est son prompt (point 5 — « en l'absence de preuve
suffisante, n'inventez jamais pour atteindre operational_request_ready »).

Ce n'est pas un défaut de l'implémentation — c'est la raison d'être de l'Arbitre comme autorité
unique. Mais cela a une conséquence directe sur la question de ce sous-lot : **le signal E2 est
fiable comme signal, sans être contraignant sur l'issue du tour.**

```
EARLIEST_SAFE_STAGE = critic   (fin de phase "critic", signal E2)
```

## J. Gestion des tours périmés

Mécanismes existants, tous déjà en place, aucun à créer :

| Mécanisme | Emplacement | Effet |
|---|---|---|
| `turn_id` monotone | `createTurnCoordinator.openTurn` | refuse tout identifiant qui ne progresse pas |
| rejet d'un résultat périmé | `createTurnCoordinator.accept` | `{accepted:false, stale:true, reason:"TURN_STALE"}`, comptabilisé |
| `seq` du tour courant | HTML:21395 | `if(seq!==oprieState.seq){ oprieMark('fast_discarded_stale'); return false }` |
| tour déjà tranché | HTML:21397 | `if(oprieState.concludedTurn===seq){ oprieMark('fast_discarded_concluded'); return false }` |
| unicité de question | HTML:21400 | `if(adpState.pendingQuestion){ oprieMark('fast_discarded_pending'); return false }` — **deux questions concurrentes sont structurellement impossibles** |
| annulation du tour | HTML:21296-97 | `if(oprieState.controller)oprieState.controller.abort()` puis nouveau `AbortController` |
| réconciliation | `reconcileFastWithDeep` | `TURN_STALE` / `DEEP_CONFIRMS_FAST` / `DEEP_SUPERSEDES_FAST`, avec `display: null` dès que l'autorité a parlé |
| correspondance structurelle | `OPRIE_STATE_TO_INTERACTION` | `clarification_required → ASK_CLARIFICATION` |

Un ASK anticipé pourrait donc être **annulé** (abort + seq), **remplacé** (`DEEP_SUPERSEDES_FAST`) et
**ignoré** (`concludedTurn`, `TURN_STALE`) sans aucun mécanisme nouveau.

```
STALE_TURN_PROTECTION_SUFFICIENT = YES
```

**Un manque réel, hors du champ de ces mécanismes.** Ils protègent l'intégrité de l'état, pas
l'interaction dépensée par la personne. Une question affichée, lue et **répondue** ne peut pas être
retirée : la réponse entre dans `clarification_history` et devient une entrée du tour suivant. Aucun
mécanisme existant n'annule cela, et aucun ne pourrait le faire sans réécrire l'historique — ce qui
serait pire. C'est le coût irréductible de toute anticipation.

## K. Fail-closed

**Cas 1 — signal précoce « clarification », puis échec d'une étape ultérieure.**
`runOperationalRequestTurn` capture l'épuisement de chaîne et rend
`validateDegradedRoleResult(createDegradedRoleResult(role, …))` → `degraded_state`, état OPRIE public
et légitime, rendu en HTTP 200. Comportement sûr exigé : la question anticipée reste affichée et
répondable — elle a été établie par un signal déterministe sous autorité OPRIE, l'échec est postérieur
et ne l'infirme pas — mais le tour doit se conclure en `degraded_state` sans jamais laisser croire à une
readiness. Aucun `fail-open` : `degraded_state` n'est pas `ready`, et `isLegalTransition` continue de
refuser tout état illégal depuis `understanding`.

**Cas 2 — signal précoce propose Q1, mais le Deep final conclut Q2 ou `READY`.**

- *Q2 ≠ Q1* : `reconcileFastWithDeep` rend `DEEP_SUPERSEDES_FAST` avec `display: null` ; le garde
  `adpState.pendingQuestion` empêche Q2 de s'ajouter à Q1. Sûr sur l'état — mais la personne a déjà
  répondu à Q1, et cette réponse est acquise.
- *`READY`* : c'est le cas le plus coûteux. L'Arbitre n'étant pas déterministiquement lié au Critique
  (cf. I), il peut conclure `operational_request_ready` alors qu'une question avait été posée. Aucune
  fausse affirmation n'est produite, aucun état n'est corrompu — mais une question inutile a été
  posée. C'est exactement le sur-questionnement que la ladder de substitution existe pour empêcher.

Aucun des deux cas ne viole les quatre interdits (information non vérifiée présentée comme certaine ;
deux questions concurrentes ; question périmée répondant sur le mauvais tour ; croire le système
ready). Les deux ont un coût d'usage, pas un coût de correction.

## L. Évaluation H0 / H1 / H2 / H3

| | **H0** attendre le Deep complet | **H1** exposer plus tôt une clarification déjà produite sous autorité OPRIE | **H2** séparer détection puis arbitrage | **H3** Fast propose, OPRIE valide avant affichage |
|---|---|---|---|---|
| SEMANTIC_SAFETY | HIGH | HIGH (depuis E2) | HIGH | LOW |
| AUTHORITY_PRESERVATION | HIGH | HIGH | MEDIUM | LOW |
| LATENCY_IMPROVEMENT_POTENTIAL | **aucun** (référence) | **MEDIUM** (≈ −42 %) | MEDIUM | **LOW / nul** |
| NEW_STATE_REQUIRED | NO | **NO** | probable | NO |
| NEW_COMPONENT_REQUIRED | NO | **NO** | MEDIUM | NO |
| NEW_AUTHORITY_REQUIRED | NO | **NO** | **risque HIGH** | **HIGH** |
| STALE_RESPONSE_RISK | LOW | LOW (mécanismes suffisants, cf. J) | LOW | MEDIUM |
| FAIL_OPEN_RISK | LOW | LOW | MEDIUM | **HIGH** |
| IMPLEMENTATION_COMPLEXITY | — | **LOW** | HIGH | LOW |
| TESTABILITY | — | **HIGH** (signal déterministe) | MEDIUM | LOW |
| REVERSIBILITY | — | **HIGH** | MEDIUM | HIGH |

**H1 est la seule option à la fois sûre et non nulle.** Elle réutilise un signal déterministe existant
(E2) et un texte de question existant (F), sans nouvel état, sans nouveau composant, sans seconde
autorité.

**H2 se confond avec H1 pour le gain, et coûte plus cher.** Séparer formellement « détection » et
« arbitrage » dans OPRIE créerait un second point de décision sémantique : c'est précisément
`ONE_SEMANTIC_READINESS_AUTHORITY` qui l'interdit. Le gain de latence est le même que H1, puisque le
signal exploitable arrive au même instant. H2 paie une architecture pour un résultat que H1 obtient
sans.

**H3 s'effondre par construction.** « OPRIE valide » signifie « le Deep valide » : la légitimité d'une
question exige la revue de substitution, qui exige l'appel LLM du Critique. La validation arrive donc
au même instant que le signal E2 — sauf si l'ASK de Fast est affiché *avant* validation, ce qui fait
de Fast l'autorité de fait. H3 est soit sans gain, soit interdite. Aucune primitive OPRIE
déterministe ne peut valider un ASK de Fast sans appel LLM : vérifié, il n'en existe aucune.

## M. Delta minimal recommandé

Règle de préférence du §8 appliquée dans l'ordre : **un signal fiable existe déjà plus tôt**, donc
aucune architecture nouvelle n'est à proposer.

```
MINIMAL_CHANGE_CLASS = EARLIER_EXPOSURE
```

Forme la plus petite, décrite et non implémentée : rendre observable par le client, à la fin de la
phase `critic`, le fait déjà calculé par `deriveCriticConsequences` — qu'au moins une issue matérielle
porte `question_is_last_resort === true` — accompagné du `question_candidates[]` correspondant de
l'Analyste, et ne l'afficher que lorsque **exactement une** issue survit et que `clarification_history`
est vide, seuls cas où le choix et la déduplication de l'Arbitre sont vacants.

**Et voici pourquoi ce delta ne ferme pas le blocker.**

L'Arbitre représente ≈ 42,4 % du tour. Sur le smoke acquis de 56 489 ms, le retirer du chemin
d'affichage donnerait :

```
TIME_TO_FIRST_SAFE_ASK    ≈ 56 489 × 0,576  ≈  32 500 ms
TIME_TO_FINAL_DEEP_RESULT ≈ 56 489 ms       (inchangé)
```

`32 500 ms` contre un invariant CDC de `> 10 s = échec interactif` : **le gain est réel (−42 %) et
l'échec reste entier (3,2 × le seuil).** Le dépôt le dit déjà par une autre voie
(`DEEP-INTERACTION-LATENCY-01`, ligne 142-147) : supprimer intégralement l'Arbitre *et* tous les
batches laisserait encore 21 secondes, « parce que l'Analyste seul écrit 1 340 jetons », et
« l'objectif "quelques secondes" est hors d'atteinte de toute modification d'orchestration ».

Le seul levier démontré est donc **ce que les rôles écrivent**, pas l'ordre dans lequel on les lit.
Cela touche les prompts — hors de ce sous-lot, et hors de toute modification autorisée ici.

## N. Risques

1. **Sur-questionnement réintroduit** si l'exposition anticipée est faite au niveau E1 (Analyste) au
   lieu de E2 (fin Critique). C'est le risque principal, et il annulerait l'acquis de la ladder.
2. **Question inutile posée** lorsque l'Arbitre conclut `ready` après coup — possible, car
   `validateArbiterOutput` ne croise pas le Critique. Coût d'usage, pas de correction.
3. **Interaction dépensée non récupérable** : une réponse entrée dans `clarification_history` ne peut
   être retirée (cf. J).
4. **Illusion de résolution** : croire le blocker fermé par un gain de 42 % alors que le contrat exige
   un facteur 6. C'est le risque de gouvernance le plus sérieux de ce sous-lot.
5. **Dérive d'autorité** si l'exposition anticipée devient, par glissement, une décision plutôt qu'une
   observation.

## O. Tests nécessaires

**Tests déterministes** (noyau, aucun réseau)

1. `question_is_last_resort` vaut `true` exactement quand aucune des six familles de
   `LADDER_ALTERNATIVE_VALUES` n'est `reasonably_available`.
2. Une issue non matérielle ne produit jamais un signal de clarification anticipée.
3. Une issue dont le Critique juge une alternative disponible ne produit aucun signal
   (`illegitimate_question_found` non vide ⇒ pas d'exposition).
4. `evaluateSubstitutionGate` neutralisant une alternative ne crée jamais de signal par effet de bord.
5. Le texte exposé est **exactement** un `question_candidates[]` de l'Analyste, jamais reformulé.
6. Aucune exposition quand plusieurs issues survivent (choix réservé à l'Arbitre).
7. Aucune exposition quand `clarification_history` est non vide (déduplication réservée à l'Arbitre).
8. `FAST_FORBIDDEN_AUTHORITY_FIELDS` et `authority: "candidate"` inchangés.
9. Aucun nouvel état : `OPERATIONAL_REQUEST_STATES` et `isLegalTransition` inchangés.
10. Aucun mot-clé, aucun domaine, aucun seuil sémantique — deux corpus lexicalement opposés, même
    verdict.

**Tests navigateur** (`loadPilot`, pilote réel, réseau simulé)

11. ASK anticipé visible avant la fin du Deep simulé, sous le seuil mesuré.
12. Aucun `ACKNOWLEDGE` affiché (non-régression 1D-G).
13. Jamais deux questions actives : `adpState.pendingQuestion` respecté.
14. Réponse à une question périmée rejetée (`seq`, `concludedTurn`).
15. `DEEP_SUPERSEDES_FAST` remplace proprement ; `DEEP_CONFIRMS_FAST` n'affiche pas deux fois.
16. Deep concluant `ready` après un ASK anticipé : aucun état incohérent, aucune readiness annoncée
    pendant qu'une question est ouverte.
17. Échec fournisseur après exposition : `degraded_state`, fail-closed, aucune readiness.
18. Rapide non régressé ; Architecte non régressé ; Atelier non concerné.

**Smoke réel minimal**

19. Un seul tour réel sur le cas matériau absent déjà connu, mesurant `TIME_TO_FIRST_SAFE_ASK` et
    `TIME_TO_FINAL_DEEP_RESULT` sur le même tour. Un tour, pas une campagne.

## P. Fichiers potentiellement concernés

| Fichier | Nature du contact |
|---|---|
| `workers/shared/operational-request-orchestrator.js` | seul endroit où la fin de phase `critic` est observable ; l'exposition s'y déciderait |
| `workers/shared/operational-request-core.js` | **lecture seule** — `deriveCriticConsequences` fournit déjà le signal, aucune modification requise |
| `workers/shared/fast-interactive-plane.js` | `OPRIE_STATE_TO_INTERACTION`, réconciliation — à vérifier inchangés |
| `atelier-prompts-v11.5-lot10g-decision-provider.html` | chemin d'affichage et gardes de tour ; + miroir du noyau |
| `core/adn/browser-runtime.generated.js` | régénéré par l'outil canonique, jamais à la main |
| `core/adn/operational-request-state.js` | **à ne pas toucher** — machine d'état gelée |
| `tests/*` + littéral d'empreinte HTML dans 15 fichiers + `docs/RELEASE-MANIFEST.md` | rituel d'empreinte |

Aucun de ces fichiers n'a été modifié par ce sous-lot.

## Q. Verdict

Le blocker est confirmé et sa cause est structurelle : la réponse HTTP **est** la sortie de l'Arbitre.

Un signal de clarification fiable existe bel et bien plus tôt, et il est déterministe : à la fin de la
phase `critic`, `deriveCriticConsequences` calcule déjà `question_is_last_resort`, et le texte de la
question existe déjà dans `analyst_output.question_candidates[]`, à la forme exacte de
`next_question`. Aucun composant, aucun état, aucune autorité nouvelle ne serait nécessaire pour
l'exposer, et les protections de tour périmé sont déjà suffisantes.

Mais l'exposer plus tôt fait passer l'attente de ≈ 56,5 s à ≈ 32,5 s. Le contrat exige 3 s, et
qualifie 10 s d'échec interactif. **Le chemin minimal et sûr existe, il est identifié, et il ne
suffit pas.** Le dépôt avait déjà établi par une autre voie que « l'objectif "quelques secondes" est
hors d'atteinte de toute modification d'orchestration » : ce sous-lot le confirme sur le cas précis de
la clarification, et nomme le seul levier restant — ce que les rôles écrivent.

Je ne recommande donc pas d'implémenter H1 pour fermer le blocker : elle ne le fermerait pas. Elle
resterait une amélioration honnête de 42 %, à décider comme telle, en sachant qu'elle laisse le
dialogue non conforme.
