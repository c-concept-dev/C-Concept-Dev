# ATELIER-INTERACTION-LATENCY-CONTRACT-01

**Sous-lot :** `ATELIER_INTERACTION_LATENCY_CONTRACT_01D_M`
**Nature :** audit de contrat + proposition. Aucun changement de moteur, aucun appel API.

**Le résultat qui reformule le dossier.** Le contrat « 3 s / 5 s / 10 s » existe, il est gelé, il est
testé — et **il ne porte pas sur le plan profond.** Il a été figé pour le `ttfi` du **plan rapide**,
défini comme « envoi HTTP client → réception d'une candidate rapide valide ». Pour la clarification
profonde, le dépôt l'écrit noir sur blanc depuis `ANTHROPIC-DEEP-CAPACITY-01` : « **le contrat produit
ne fixe aucun seuil** auquel comparer ce chiffre ». Il n'y a donc pas de contrat à assouplir. Il y en
a un à écrire, pour une phase qui n'en a jamais eu.

---

## A. État Git

```
git branch          → main
git rev-parse HEAD  → 2dfd1377c455afb78b19d02957fd4c2ec88d5798
git status --short  → (aucun fichier non suivi dans le subtree Atelier)
```

Le subtree Atelier a changé depuis `1d5eed5`, et l'écart est qualifié : le commit `770bf94 audit` a
commité **exactement les cinq rapports 1D-H à 1D-L** — 5 fichiers, 2 214 insertions, rien d'autre.

```
git diff --name-only 1d5eed5..HEAD -- 'tools/Atelier Prompts' | grep -v '^…/docs/'  →  0 fichier
```

**Zéro fichier de production Atelier modifié.** `11906d2` est ancêtre de `HEAD`, historique linéaire,
aucune mutation externe.

## B. Sources du contrat actuel

| LOCATION | TEXT | NORMATIF / INFORMATIF | TESTÉ | UTILISÉ PAR UN GATE | UTILISÉ PAR L'UI | CONFLIT AVEC LA MESURE |
|---|---|---|---|---|---|---|
| `evaluation/perf-real-01/results-01b.json` → `seuils` | `{p50_prefere_ms: 2000, p95_contractuel_ms: 3000, degrade_max_ms: 5000, echec_contrat_ms: 10000}` + `"figes avant la mesure, inchanges apres"` | **NORMATIF — la source unique** | oui | **OUI** | non | **non** (plan rapide) |
| `results-01b.json` → `plan.definition_ttfi` | « envoi HTTP client → reception d une candidate rapide valide (reseau + worker + fournisseur + parsing + schema) » | **NORMATIF — la définition** | oui | oui | non | non |
| `tests/fast-rate-control-perfreal01d.test.mjs:253-261` | `seuils_inchanges` + `classification = p95 ≤ 3000 ? PASS : (p95 ≤ 5000 ? DEGRADED : FAIL)` | **NORMATIF, bloquant** | **oui** | **OUI** | non | non |
| `tests/retry-threshold-calibration-perfreal01g.test.mjs:190-191` | `assert.deepEqual(G.seuils_contrat, {…})` | NORMATIF, bloquant | oui | oui | non | non |
| `tests/real-measurement-perfreal01b.test.mjs:47` | `const P95_CONTRACTUEL = 3000` | NORMATIF, bloquant | oui | oui | non | non |
| `docs/ANTHROPIC-DEEP-CAPACITY-01.md:199-200` | « le contrat produit **ne fixe aucun seuil** auquel comparer ce chiffre. Aucun seuil n'est inventé ici. » | **NORMATIF par abstention** | — | non | non | — |
| `docs/ATELIER-EARLY-CLARIFICATION-AUDIT-01.md`, `…-DEEP-OUTPUT-MINIMIZATION-…` | « > 5 s = dialogue non conforme, > 10 s = échec interactif » | **INFORMATIF** — mes propres rapports, citant les briefs | non | non | non | **oui** |
| `atelier-prompts…html:21462` | `oprieShowAnalysing()` → « Analyse de votre demande… / Votre demande est en cours d'analyse. » | copie UI | oui | non | **OUI** | — |

**Aucun fichier CDC, roadmap ou contrat n'existe dans le dépôt.** La recherche de « échec
interactif » / « dialogue non conforme » ne rend que **mes deux rapports d'audit**. Le périmètre de
modification documentaire ouvert par le §« Règles absolues » est donc **vide** : je ne modifie aucun
document existant, et ce rapport est le seul fichier créé.

**État du gate rapide aujourd'hui** (`results-01d.json`) : `ttfi_p50 = 527,5 ms`,
`ttfi_p95 = 3 394,9 ms`, `classification = DEGRADED`, `interactive_p95_contract_met = false`. Le gate
est **vivant et en train de détecter un dépassement de 13 %** sur son p95. Il n'est pas touché par ce
sous-lot.

## C. Pourquoi le seuil actuel échoue

Il n'échoue pas. **Il a été appliqué à la mauvaise phase**, et c'est une erreur de catégorie que j'ai
propagée dans 1D-K et 1D-L.

Le `ttfi` mesure l'arrivée d'une **candidate rapide** — deux champs, aucune autorité, un seul appel
fournisseur. Le chemin de clarification profonde mesure l'arrivée d'une **décision sémantique
gouvernée** — trois appels minimum, sous autorité OPRIE, avec la ladder de substitution. Comparer les
deux au même seuil revient à juger la durée d'un procès au temps qu'il faut pour décrocher le
téléphone du greffe.

Ce que la confusion a produit : 1D-K a conclu `PROVEN_NO` sur « 10 s » et 1D-L a conclu
`PROVEN_NO (p95)`, en confrontant des mesures Deep à un seuil Fast. **Les mesures restent exactes ;
les verdicts « échec de contrat » étaient sans objet, faute de contrat.** Je les retire comme
verdicts contractuels et les conserve comme mesures.

Ce que la confusion n'a pas produit : aucune conclusion technique de 1D-H à 1D-L ne dépendait du
seuil. Le chemin minimal sûr, le bornage du pré-affichage, l'unicité du fournisseur et le
sur-provisionnement des sorties restent intégralement valides.

## D. T0 — réaction de l'interface

| | |
|---|---|
| START EVENT | clic utilisateur (`oprieRunTurn` entré) |
| END EVENT | bouton désactivé **et** état de traitement visible |
| USER_VISIBLE | oui |
| SEMANTIC_AUTHORITY_REQUIRED | **aucune** |
| CURRENT_MEASURE | `oprieSetBusy(true)` est la 4ᵉ instruction de `oprieRunTurn`, **synchrone, avant tout réseau** |
| TARGET | **< 100 ms** |
| FAILURE_THRESHOLD | **≥ 1 s** |

**Faisabilité : acquise, et déjà implémentée.** `oprieSetBusy(true); oprieShowAnalysing();`
s'exécutent avant `oprieRequestTurn()` — pas d'`await`, pas de réseau, pas de fournisseur. T0 est
donc borné par un seul tour de boucle d'événements.

La préférence propriétaire était `< 1 s`. **Je recommande `< 100 ms` comme cible et `1 s` comme seuil
d'échec** : un seuil de 1 s sur une opération synchrone ne détecterait plus rien — il faudrait un
blocage du fil principal de mille millisecondes pour le déclencher. Une cible à 100 ms laisse la
mesure utile tout en restant très large pour du DOM synchrone.

## E. T1 — feedback de traitement

| | |
|---|---|
| START EVENT | clic utilisateur |
| END EVENT | bandeau de traitement honnête affiché |
| USER_VISIBLE | oui |
| SEMANTIC_AUTHORITY_REQUIRED | **aucune** |
| CURRENT_MEASURE | même instruction que T0 (`oprieShowAnalysing()`), synchrone |
| TARGET | **< 100 ms** |
| FAILURE_THRESHOLD | **≥ 2 s** |

Le texte actuel est **déjà conforme à l'exigence d'honnêteté** : « Analyse de votre demande… » /
« Votre demande est en cours d'analyse. » Il décrit le processus et ne prétend rien sur le résultat.
Les formulations interdites (« J'ai compris… », « Votre demande est claire… », « Je vais… ») n'y
figurent pas — et depuis 1D-G, un `ACKNOWLEDGE` du plan rapide ne peut plus les y introduire, puisqu'il
est rétrogradé en silence.

**Ce feedback est produit sans aucune autorité sémantique** : c'est une chaîne littérale du pilote,
émise avant que le moindre appel fournisseur existe. T0 et T1 partagent la même instruction ; les
séparer reste utile parce qu'ils peuvent régresser indépendamment (un bandeau déplacé derrière un
`await` casserait T1 sans casser T0).

## F. T2 — première action sémantique sûre

Je propose de **généraliser T2** conformément au §9, pour la raison exposée en §J.

| | |
|---|---|
| START EVENT | clic utilisateur |
| END EVENT | première action sémantique **sûre** rendue par OPRIE : `ASK` \| `READY` \| `BLOCKED` |
| USER_VISIBLE | oui |
| SEMANTIC_AUTHORITY_REQUIRED | **OPRIE** |
| CURRENT_MEASURE (aujourd'hui, rien n'est exposé avant l'Arbitre) | **p50 74 632 ms · p95 90 445 ms · min 56 939 ms** (n=8, tours de clarification, Anthropic Sonnet) |
| CURRENT_MEASURE (chemin pré-affichage borné, si exposé — 1D-L) | **p50 43 338 ms · p95 48 883 ms · min 34 422 ms** (n=8) |
| TARGET | **p50 ≤ 50 s · p95 ≤ 65 s** |
| FAILURE_THRESHOLD | **p95 > 90 s** |

**Sur les cibles proposées par le propriétaire (`p50 ≤ 45 s`, `p95 ≤ 60 s`), je ne les adopte pas
telles quelles, et voici pourquoi.**

La mesure donne p50 = 43 338 ms. Un plafond à 45 000 ms laisse **4 % de marge** — sur n = 8, un seul
tour lent déplace la médiane de plus que cela. Une cible qu'un échantillon de huit peut faire basculer
n'est pas un contrat, c'est un tirage au sort. **Je recommande `p50 ≤ 50 s` (+15 % de marge).**

Pour le p95, la mesure donne 48 883 ms ; le plafond proposé de 60 000 ms offre +23 %. C'est
défendable, mais une contre-vérification indépendante impose de la prudence : le jeu
`ANTHROPIC-DEEP-CAPACITY-01`, restreint aux tours portant un lot (n=5), donne un p95 de **78 649 ms**
sur le chemin **non borné**. Ce chiffre ne mesure pas le même chemin, donc il n'invalide pas la cible —
mais il rappelle que n = 8 est petit et que la queue est mal connue. **Je recommande `p95 ≤ 65 s`
(+33 %), et un seuil d'échec à 90 s** qui laisse le gate détecter une vraie dérive sans se déclencher
sur un échantillon défavorable.

**Applicabilité.** Mesuré sur le chemin actuel, T2 vaut 74,6 s au p50 : **la cible n'est pas tenue
aujourd'hui**, et je ne le maquille pas. Elle devient atteignable si et seulement si le chemin
pré-affichage borné est exposé — c'est précisément l'objet de 1D-N (§S). Le gate correspondant est
donc déclaré `BLOCKING` mais avec un état initial documenté `NOT_MET`, jamais un seuil taillé pour
passer.

## G. T3 — clôture canonique

| | |
|---|---|
| START EVENT | clic utilisateur |
| END EVENT | contrat canonique + readiness + `adn_summary` disponibles |
| USER_VISIBLE | non (sauf effet différé) |
| SEMANTIC_AUTHORITY_REQUIRED | OPRIE / Arbitre |
| CURRENT_MEASURE | **p50 74 632 ms · p95 90 445 ms · max 94 206 ms** (n=8) ; jusqu'à **218,5 s** observé en queue (`DEEP-COUT-JETONS-01`) |
| TARGET | **SLO p95 ≤ 120 s**, non bloquant |
| HARD TIMEOUT | **180 s** → `degraded_state` |

**T3 ne doit pas avoir de seuil strict, et la raison est structurelle** : il ne conditionne plus la
capacité de la personne à continuer le dialogue. `oprieReleaseForFastQuestion(seq)` déverrouille déjà
la saisie sans attendre le plan profond ; T3 ne bloque donc que la *clôture*, pas la conversation. Un
seuil dur y créerait un échec produit là où l'utilisateur n'attend plus rien.

Un **SLO observationnel** suffit pour détecter une dérive, et un **timeout dur** est nécessaire pour
que le tour se termine toujours. Aujourd'hui le pilote assume explicitement l'absence de plafond :
« Aucun timeout arbitraire : le pipeline serveur peut durer » (HTML:21741). Le max observé de 218,5 s
montre que cette absence a un coût réel.

## H. Fast ASK

`FAST_ASK_CAN_BYPASS_DEEP_WAIT = YES`, prouvé par le code et par la mesure.

**Par le code** : lorsque le plan rapide rend une sollicitation, `oprieRenderFastInteraction` appelle
`oprieAsk(...)` puis `oprieReleaseForFastQuestion(seq)`, qui remet `running=false` et
`oprieSetBusy(false)` **sans attendre** `deepPromise`. La personne peut répondre immédiatement.

**Par la mesure** : 416 à 469 ms sur l'endpoint Groq réel (1D-B / 1D-C) ; `ttfi p95 = 1 617 ms` hors
saturation (`PERF-NOMINAL-PROVIDER-01`) ; `ttfi p95 = 3 394,9 ms` sous banc saturant
(`results-01d.json`).

**Le contrat doit donc rester séparé, et le gate rapide existant reste inchangé** : un ASK rapide
valide n'est jamais jugé au seuil T2. Il est jugé au `ttfi` — p50 ≤ 2 s, p95 ≤ 3 s, dégradé ≤ 5 s,
échec > 10 s. Ce sont exactement les seuils gelés en 01B, et ils ne bougent pas.

## I. Deep clarification

Quand le plan rapide ne produit pas de sollicitation — depuis 1D-G, un `ACKNOWLEDGE` devient un
silence — la clarification doit venir du plan profond, et c'est T2 qui s'applique. Le bandeau de T1
reste affiché pendant toute la durée : il n'y a **aucun silence**, seulement l'absence d'une
substitution de phrase.

## J. READY / BLOCKED

**Je recommande la généralisation, et la raison n'est pas esthétique.**

Aujourd'hui, un tour qui conclut `operational_request_ready` traverse exactement le même chemin et la
même attente qu'un tour qui conclut `clarification_required` : trois rôles, une seule sortie HTTP.
Contractualiser uniquement l'ASK laisserait donc **le cas READY sans aucun seuil**, alors qu'il coûte
le même temps à la personne. La même remarque vaut pour `blocked` et `degraded_state`.

```
FIRST_SAFE_SEMANTIC_ACTION_MODEL = ASK_READY_BLOCKED
```

Formellement, la borne de fin de T2 est **le premier état OPRIE terminal du tour**, c'est-à-dire l'un
des cinq de `OPERATIONAL_REQUEST_STATES` : `clarification_required`, `confirmation_required`,
`operational_request_ready`, `blocked`, `degraded_state`. L'énumération existe déjà, la machine d'état
gelée la garde, et `isLegalTransition` la vérifie : la métrique se raccroche à un invariant existant
plutôt que d'inventer une catégorie.

**`degraded_state` compte dans T2 et ne l'exempte pas.** Un tour qui dégrade après 90 secondes a fait
attendre la personne 90 secondes ; l'exclure de la mesure rendrait le gate aveugle à la pire
expérience possible.

## K. UX d'attente

Exigences minimales pendant T1 → T2, toutes vérifiables :

1. **montrer qu'il travaille** — bandeau `state:'thinking'` présent en continu ;
2. **rester visuellement stable** — aucun changement de mise en page pendant l'attente ;
3. **ne pas afficher de fausse conclusion** — acquis par 1D-G ;
4. **ne pas bloquer le navigateur** — aucun travail synchrone après T1 ;
5. **ne pas perdre la demande** — `original_request` est toujours la demande brute saisie ;
6. **ne jamais effacer une saisie utilisateur** — §N.

**Animation simple ou étapes génériques ?** Je recommande **l'animation simple**, et contre
l'indicateur d'étapes. Trois raisons. D'abord, les phases réelles (`validate`, `analyst`, `critic`,
`arbiter`, `state_check`) ne sont pas observables par le client : la réponse HTTP est unique et
n'arrive qu'à la fin — un indicateur d'étapes serait donc une animation déguisée en information, ce
qui est précisément le défaut que 1D-G a corrigé ailleurs. Ensuite, si le chemin pré-affichage borné
est exposé (1D-N), deux phases deviennent réellement observables — et alors seulement un indicateur
à deux temps serait honnête. Enfin, nommer les rôles internes frôlerait l'exposition de mécanique
interne.

**Interdits maintenus** : aucune chaîne de raisonnement, aucun rationale interne, aucun contenu
Analyste / Critique / Arbitre. Ces trois interdictions ne sont pas de l'ergonomie : `adn_summary` ne
porte déjà que `readiness_rationale` et `source`, et la trace serveur n'émet que des étiquettes.

## L. P95

Le p95 est **obligatoire** là où la grandeur mesurée dépend d'un fournisseur, donc où la queue existe
et n'est pas gouvernée par notre code :

| phase | p95 obligatoire ? | pourquoi |
|---|---|---|
| T0 | **non** | opération synchrone, sans réseau ; un `max` déterministe est plus strict et plus lisible |
| T1 | **non** | idem |
| T2 | **OUI** | trois appels fournisseur en série ; queue mesurée à 48,9 s contre 43,3 s de médiane |
| Fast `ttfi` | **OUI** | déjà le cas — `p95_contractuel_ms` est le champ normatif |
| T3 | **OUI** (en SLO) | queue observée jusqu'à 218,5 s |

Forcer un p95 sur T0/T1 serait un contresens statistique : ce sont des grandeurs locales
déterministes, où `max` est à la fois plus exigeant et plus interprétable. Le §11 le demandait
explicitement, et c'est le bon arbitrage.

## M. SLO / failure / timeout

| phase | SLO (cible) | FAILURE THRESHOLD (gate rouge) | HARD TIMEOUT (comportement) |
|---|---|---|---|
| T0 | < 100 ms | ≥ 1 s | — |
| T1 | < 100 ms | ≥ 2 s | — |
| Fast `ttfi` | p50 ≤ 2 s, p95 ≤ 3 s | p95 > 5 s (`DEGRADED`), > 10 s (`FAIL`) | inchangé |
| **T2** | p50 ≤ 50 s, p95 ≤ 65 s | **p95 > 90 s** | **120 s → `degraded_state`** |
| **T3** | p95 ≤ 120 s (non bloquant) | — | **180 s → `degraded_state`** |

**Les trois notions sont distinctes et ne doivent jamais être confondues.** Le SLO est ce qu'on visait
; le seuil d'échec est ce qui casse le gate ; le timeout dur est ce qui arrête le travail.
`p95 target ≠ timeout` : un p95 à 65 s avec un timeout à 120 s laisse la queue exister sans qu'un tour
puisse durer indéfiniment.

**Comportement au dépassement du timeout — fail-closed, avec les primitives existantes.** Le tour se
termine en `degraded_state`, état OPRIE public et légitime, atteignable depuis `understanding`, rendu
en HTTP 200. C'est exactement ce que fait déjà `degradedResultFromProviderChainError` sur épuisement de
chaîne. Jamais un `READY` fabriqué, jamais une bascule silencieuse, jamais une question inventée.
`isLegalTransition` continue de refuser tout état illégal.

Note : cela suppose un plafond là où le pilote déclare aujourd'hui « aucun timeout arbitraire ». C'est
un changement de contrat, il est proposé ici et non implémenté.

## N. Saisie utilisateur

```js
function oprieAsk(question,intro,chips){
  …
  $('#v11-answer').value='';   // ← efface la réponse en cours
```

**Invariant, normatif, obligatoire pour tout lot d'implémentation futur :**

```
USER_TYPED_INPUT_MUST_NEVER_BE_SILENTLY_ERASED
```

Portée : toute arrivée tardive — lot Critique, Arbitre, réconciliation, changement d'état — qui
conduirait à réécrire une question déjà affichée **ne doit jamais vider un champ de réponse non
vide**, ni sans trace, ni sans que la personne puisse retrouver ce qu'elle avait écrit.

Ce n'est pas corrigé dans ce lot, conformément au §13. Mais la question ouverte n'est pas technique —
ne pas écraser un champ non vide est trivial à écrire. La question est **ce que le produit doit faire**
quand l'autorité contredit une question à laquelle la personne est en train de répondre. Cela n'a
jamais été décidé, et aucun seuil ne le décidera.

## O. Gates

| gate | métrique | seuil | population | statistique | type de test | bloquant |
|---|---|---|---|---|---|---|
| `INTERACTION_T0_GATE` | clic → bouton désactivé + état visible | **max < 100 ms** | tous les tours | `max` | déterministe navigateur (`loadPilot`) | **bloquant** |
| `INTERACTION_T1_GATE` | clic → bandeau de traitement honnête | **max < 100 ms** | tous les tours | `max` | déterministe navigateur | **bloquant** |
| `FAST_TTFI_GATE` *(existant, inchangé)* | envoi → candidate rapide valide | p50 ≤ 2 s, p95 ≤ 3 s, dégradé ≤ 5 s, échec > 10 s | plan rapide, 48 échantillons | p50 + p95 | mesure réelle | **bloquant** — actuellement `DEGRADED` |
| `SAFE_SEMANTIC_ACTION_GATE` *(nouveau)* | clic → premier état OPRIE terminal | **p50 ≤ 50 s, p95 ≤ 65 s**, échec p95 > 90 s | tours gouvernés, **`degraded_state` inclus** | p50 + p95 | mesure réelle bornée | **bloquant**, état initial `NOT_MET` |
| `CANONICAL_COMPLETION_GATE` *(nouveau)* | clic → contrat canonique + readiness + `adn_summary` | SLO p95 ≤ 120 s ; timeout dur 180 s | tours gouvernés | p95 + max | mesure réelle | **avertissement**, sauf le timeout qui est bloquant |
| `DEEP_TURN_VARIANCE_GATE` *(nouveau)* | sortie du Critique, jetons | p95 ≤ 3 000 jetons | tours avec lot | p95 | déterministe sur trace | **avertissement** |

Le dernier gate existe pour une raison précise, développée au §R : la variance de sortie du Critique
est la grandeur qui a explosé sans que rien ne le détecte.

## P. Compatibilité CDC

```
CURRENT_10S_CONTRACT_STATUS = VALID_FOR_SUBSET
CDC_CHANGE_CLASS            = AMENDMENT
```

**`VALID_FOR_SUBSET`, et non `OBSOLETE` ni `CONTRADICTED_BY_MEASUREMENTS`.** Le seuil est valide,
gelé, testé et pertinent — pour le sous-ensemble qu'il a toujours gouverné : le `ttfi` du plan rapide.
Il n'a jamais porté sur la clarification profonde, et le dépôt le disait déjà
(`ANTHROPIC-DEEP-CAPACITY-01` : « le contrat produit ne fixe aucun seuil »).

**`AMENDMENT`, et non `BREAKING_CHANGE`.** Aucun seuil existant n'est assoupli : `FAST_TTFI_GATE` reste
identique à l'octet, y compris son verdict `DEGRADED` actuel. La proposition **ajoute** quatre phases
normatives (T0, T1, T2, T3) là où trois d'entre elles n'avaient aucun contrat. Un ajout de contraintes
sur des phases non contractualisées est un amendement.

La composante `CLARIFICATION` porte sur un point : dire explicitement que le seuil de 10 s gouverne le
`ttfi` rapide et rien d'autre. Cette ambiguïté a produit une erreur de catégorie dans deux de mes
propres rapports.

## Q. Impact documentaire

| document | action | justification |
|---|---|---|
| `docs/ATELIER-INTERACTION-LATENCY-CONTRACT-01.md` | **ADDED** | le présent rapport, seul fichier créé |
| `evaluation/perf-real-01/results-01b.json` | **UNCHANGED** | mesure gelée, « figes avant la mesure, inchanges apres » — un artefact de mesure ne se réécrit jamais |
| `tests/fast-rate-control-perfreal01d.test.mjs`, `…perfreal01g`, `…perfreal01b` | **UNCHANGED** | gates rapides préservés à l'identique (§16) |
| `docs/ATELIER-EARLY-CLARIFICATION-AUDIT-01.md` | **UNCHANGED** (à annoter en 1D-N) | contient « > 10 s = échec interactif » appliqué au Deep ; la correction est portée par le §C du présent rapport plutôt que par une réécriture d'un rapport daté |
| `docs/ATELIER-DEEP-OUTPUT-MINIMIZATION-AUDIT-01.md` | **UNCHANGED** (idem) | idem |
| `docs/ATELIER-DEEP-PROVIDER-THROUGHPUT-AUDIT-01.md`, `…-CRITICAL-PATH-ROLE-…`, `…-CRITIC-PREDISPLAY-BUDGET-…` | **UNCHANGED** | leurs mesures restent valides ; seuls leurs verdicts contractuels sont requalifiés ici |
| `docs/OPEN-DEBTS.md` | **À MODIFIER en 1D-N** | y inscrire `USER_TYPED_INPUT_MUST_NEVER_BE_SILENTLY_ERASED` et l'absence de timeout dur |
| aucun CDC / roadmap | **N/A** | **il n'en existe aucun dans le dépôt** — vérifié |

**Je n'ai modifié aucun document existant.** Le périmètre autorisé était conditionné à une
démonstration ; la démonstration conclut que le périmètre est vide.

## R. Tests futurs

**Ne pas masquer la régression — l'obligation du §16.** Le nouveau contrat doit continuer de détecter :

| dérive à détecter | gate qui la voit | mécanisme |
|---|---|---|
| 45 s → 90 s | `SAFE_SEMANTIC_ACTION_GATE` | p50 > 50 s **ou** p95 > 65 s : rouge bien avant 90 s |
| 50 s → 120 s | `SAFE_SEMANTIC_ACTION_GATE` + timeout | seuil d'échec p95 > 90 s, puis timeout dur à 120 s |
| variance qui explose | `DEEP_TURN_VARIANCE_GATE` | sortie Critique p95 > 3 000 jetons — 1D-K a mesuré 223 → 5 940 sans qu'aucun gate ne le voie |
| fournisseur qui ralentit | `SAFE_SEMANTIC_ACTION_GATE` + jetons/s | 1D-K mesure 48–62 tok/s ; un gate de débit p5 ≥ 40 tok/s isolerait le fournisseur du volume |
| régression rapide | `FAST_TTFI_GATE` | inchangé, déjà `DEGRADED` |
| bandeau déplacé derrière un `await` | `INTERACTION_T1_GATE` | `max < 100 ms` échoue immédiatement |

**Distinction que le contrat doit porter explicitement** : 43 s est une **réalité structurelle
démontrée** — trois appels en série, 2 152 jetons, 50,5 tok/s, un seul fournisseur routable. 90 s
serait une **régression**. Le contrat sépare les deux par la position du seuil, pas par un
commentaire.

Tests à écrire en 1D-N : T0 et T1 déterministes navigateur ; préservation d'une saisie non vide ;
timeout dur → `degraded_state` ; et un test de non-régression asserting que `seuils_contrat` du plan
rapide est **inchangé**, pour interdire qu'un lot futur ne « fasse passer » T2 en touchant au Fast.

## S. Définition 1D-N

**Périmètre strict, UX seulement.**

À faire :
1. instrumenter et mesurer T0 et T1 (`loadPilot`), poser les deux gates déterministes ;
2. garantir l'invariant `USER_TYPED_INPUT_MUST_NEVER_BE_SILENTLY_ERASED` — ne jamais vider un champ
   de réponse non vide ;
3. inscrire au registre des dettes l'absence de timeout dur ;
4. inscrire `SAFE_SEMANTIC_ACTION_GATE` et `CANONICAL_COMPLETION_GATE` comme gates déclarés, avec leur
   état initial mesuré et documenté `NOT_MET`.

**Explicitement hors périmètre de 1D-N** : refonte du Deep, compression des prompts, nouveau
fournisseur, nouvelle architecture, exposition anticipée de la clarification. Cette dernière est le
candidat naturel pour 1D-O, et elle exige d'abord la décision du §N — que faire quand l'autorité
contredit une question en cours de réponse.

## T. Verdict

Le contrat de 10 secondes n'était pas trop ambitieux : il ne parlait pas de cette phase. Il gouverne
le `ttfi` du plan rapide — « réception d'une candidate rapide valide » — et il le gouverne toujours,
gelé, testé, actuellement `DEGRADED` à 3 394,9 ms. La clarification profonde, elle, n'avait **aucun
seuil**, et `ANTHROPIC-DEEP-CAPACITY-01` l'avait écrit avant que cette série d'audits ne commence.

J'ai propagé cette confusion dans 1D-K et 1D-L en confrontant des mesures Deep à un seuil Fast. Les
mesures tiennent ; les verdicts « échec de contrat » n'avaient pas d'objet, et je les requalifie ici.

Ce que ce sous-lot produit n'est donc pas un assouplissement, c'est une première écriture : quatre
phases séparées, chacune avec sa cible, son seuil d'échec et son autorité. T0 et T1 sont déjà tenus
par le code existant et deviennent mesurables. T2 ne l'est pas aujourd'hui — 74,6 s au p50 contre une
cible de 50 s — et je le déclare `NOT_MET` plutôt que de tailler le seuil à la mesure. T3 reçoit un
SLO et un timeout, pas un seuil dur, parce qu'il ne bloque plus la conversation.

Le contrat reste exigeant là où c'est possible et honnête là où ce ne l'est pas. Il conserve toutes
les portes de régression existantes, en ajoute une sur la variance que personne ne surveillait, et il
ne rend rien plus facile à passer.
