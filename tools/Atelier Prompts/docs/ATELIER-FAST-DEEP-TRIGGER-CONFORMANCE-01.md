# ATELIER-FAST-DEEP-TRIGGER-CONFORMANCE-01

**Sous-lot :** `ATELIER_FAST_DEEP_TRIGGER_CONFORMANCE_01D_M`
**Nature :** audit de conformité architecturale. Lecture seule, aucune implémentation, aucun appel API.
**Question :** le runtime respecte-t-il la décision Fast `ASK_ONE_QUESTION` / `CONTINUE_WITH_DEEP_VALIDATION` / `TECHNICAL_STOP`, ou Deep est-il lancé indépendamment ?

**Réponse en une ligne.** Deep est lancé **inconditionnellement**, à la ligne qui précède le
démarrage du plan rapide, donc **avant que la décision Fast existe**. Le contrat `IA-04` fait de
`CONTINUE_WITH_DEEP_VALIDATION` le déclencheur de Deep ; le runtime ne lit jamais cette décision pour
décider de lancer. Le garde-fou §9 interdit explicitement d'utiliser Deep « comme rituel obligatoire
pour afficher la prochaine interaction utilisateur » : c'est précisément ce que fait la ligne 21752.

---

## A. Référentiel produit

Les cinq documents de gouvernance **ne sont pas dans le dépôt** ; ils ont été fournis par le
propriétaire dans `Garde fou Atelier.zip` et lus intégralement pour ce sous-lot :

| document | date | rôle |
|---|---|---|
| `GARDE-FOU-MAITRE-ATELIER-PROMPTS-ANTI-DETTE-REGRESSION-DIGRESSION.md` | 2026-09-08 | garde-fou supérieur |
| `MD ATELIER.md` (directive maître) | 2026-09-11 | mission produit |
| `CDC-Atelier-Prompts-Interactive-Architecture-v1.7.md` | 2026-09-02 | contrat directeur |
| `ROADMAP-Atelier-Prompts-Interactive-Architecture-v1.7.md` | 2026-09-02 | roadmap directrice |
| `ADN-ATELIER-PROMPTS-REFERENTIEL-V1.0.md` | 2026-09-02 | référentiel ADN |

Mission, `MD ATELIER.md` : **Atelier Prompts est un atelier de conception de prompts.**
`COMPRENDRE → CLARIFIER SEULEMENT SI NÉCESSAIRE → CONSTRUIRE AVEC L'ADN → CONTRÔLER → LIVRER LE PROMPT`.
Les questions ne sont pas le produit ; le dialogue sert uniquement à rendre la demande exploitable.

**Fait à signaler avant tout le reste** : aucun de ces cinq documents n'est versionné dans le dépôt.
L'ensemble du code a donc été écrit et testé sans que son contrat directeur soit lisible depuis le
worktree. C'est la condition qui rend une divergence de trigger possible sans qu'aucun test ne la voie.

### État Git

```
git branch  → main        git rev-parse HEAD → 2dfd1377c455afb78b19d02957fd4c2ec88d5798
git log -5  → 2dfd137 Merge / 8380a97 Merge / 770bf94 audit / 18c9ceb Worker LIKE Phase 3 / 615159e index.html
```

Le subtree Atelier diffère de la baseline `1d5eed5` des audits précédents **uniquement** par le
commit `770bf94 audit`, qui a versionné mes cinq rapports 1D-H à 1D-L — 5 fichiers, 2 214 insertions.
`git diff --name-only 1d5eed5..HEAD -- 'tools/Atelier Prompts' | grep -v '/docs/'` rend **0 fichier**.
Aucune mutation de production.

**Régression préexistante découverte, non causée par ce sous-lot.**
`T-HTMLFINAL02-10` échoue : « le compte du jeu de release est juste ». Cause : le commit `770bf94` a
rendu les cinq rapports *suivis* sans régénérer `docs/RELEASE-MANIFEST.md`. Vérifié en retirant mon
propre fichier non suivi de l'arbre : le test échoue quand même. `GLOBAL = 2984/2985, 1 échec`,
`FROZEN = OK`. Correction : `node tools/build-release-manifest.mjs --tests=<N>` puis commit. Je ne l'ai
pas faite — aucune mutation n'est autorisée ici.

## B. Contrat Fast

`CDC v1.7 §7 — Fast Dialogue Plane` :

```text
Sorties autorisées : ASK_ONE_QUESTION | CONTINUE_WITH_DEEP_VALIDATION | TECHNICAL_STOP
Interdits : operational_request_ready, clarification_required, confirmation_required,
            blocked, degraded_state, routing, execution
```

`GARDE-FOU §9` : Fast **peut** proposer une question candidate, aider à poursuivre le dialogue,
produire une interaction rapide. Il **ne doit pas** fabriquer READY, router, exécuter, devenir une
nouvelle autorité.

### Correspondance contrat → implémentation

| CDC §7 | implémenté (`FAST_INTERACTION_TYPES`) | conformité |
|---|---|---|
| `ASK_ONE_QUESTION` | `ASK_CLARIFICATION` + `ASK_CONFIRMATION` | **conforme** — un contrat, deux spécialisations ; `ONE_NEXT_INTERACTION_MAX = 1` garde l'unicité |
| `CONTINUE_WITH_DEEP_VALIDATION` | `WAIT_FOR_DEEP_VALIDATION` | **conforme**, renommé |
| `TECHNICAL_STOP` | **absent** | **non implémenté comme type Fast** — l'échec technique passe par la chaîne HA, un 502 et `ADP_TECHNICAL_FAILURE_UI` |
| — | `ACKNOWLEDGE` | **hors contrat CDC** |
| — | `ORIENT_ARCHITECTE` | **hors contrat CDC** |

Deux types existent que le CDC n'autorise pas. Et un fait qu'il faut porter au crédit du lot 1D-G :
en rétrogradant `ACKNOWLEDGE → WAIT_FOR_DEEP_VALIDATION` dans les modes conversationnels, **1D-G a
rapproché l'implémentation du contrat CDC sans le savoir** — un `ACKNOWLEDGE` non affiché *est* un
`CONTINUE_WITH_DEEP_VALIDATION`.

## C. Contrat Deep

`ROADMAP §20 — IA-04 — Deep OPRIE Trigger` :

```text
CONTINUE_WITH_DEEP_VALIDATION
→ Analyst
→ Critic
→ Arbiter

READY seulement par Arbiter.
```

`ROADMAP §19 — IA-03` : « **Deep OPRIE obligatoire avant READY** ». Avant READY — pas avant une
question.

`GARDE-FOU §9` :

```text
DEEP = ESCALADE
PAS = CHEMIN RÉFLEXE
```

> « Il ne doit pas être utilisé comme rituel obligatoire pour : poser une question évidente ;
> reformuler une demande ; confirmer une absence de matériau évidente ; **afficher la prochaine
> interaction utilisateur**. »

`MD ATELIER §6` — interdits : « faire passer toute demande par une chaîne lourde ; **lancer Critic /
Arbiter / analyses multiples par réflexe** ». Et : « La profondeur doit être méritée par la difficulté
réelle de la demande. »

### Matrice des sources

| SOURCE | CONTRACT | NORMATIF / HISTORIQUE | IMPLÉMENTÉ | TESTÉ | COMPORTEMENT RUNTIME ACTUEL |
|---|---|---|---|---|---|
| CDC §7 | 3 sorties Fast autorisées | **normatif** | partiellement (5 types, dont 2 hors contrat, 1 manquant) | oui | 5 types |
| CDC §6 | `FINAL_READY_AUTHORITY = ARBITER` | **normatif** | **oui** | oui | **conforme** |
| ROADMAP §20 IA-04 | `CONTINUE_WITH_DEEP_VALIDATION → Deep` | **normatif** | **NON** | **non** | Deep lancé inconditionnellement |
| ROADMAP §19 IA-03 | Deep obligatoire **avant READY** | normatif | oui | oui | conforme (par surabondance) |
| GARDE-FOU §9 | `DEEP = ESCALADE, PAS RÉFLEXE` | **normatif supérieur** | **NON** | **non** | chemin réflexe |
| MD ATELIER §6 | pas de Critic/Arbiter par réflexe | **normatif** | **NON** | **non** | réflexe à chaque tour |
| CDC §15 | `RAPIDE_DIALOG_LOOP = NONE` | normatif (v1.7, 09-02) | **divergent, par décision propriétaire** | oui | Rapide converse depuis `ATELIER-RAPIDE-CONVERSATIONAL-FIX-01` |
| `tests/fast-frontend-integration-perf04.test.mjs:41` | « le plan profond part à chaque tour » | **historique** | oui | **oui, bloquant** | verrouille l'écart |

## D. Contrat de fluidité

`GARDE-FOU §10` et `CDC §8`, pour un tour de dialogue ordinaire :
`TARGET 1–2 s · P95 ≤ 3 s · > 5 s non conforme · > 10 s échec interactif`.

Non modifié par ce sous-lot. Et il éclaire rétrospectivement les audits 1D-H à 1D-L : ce contrat porte
sur le **tour de dialogue ordinaire**, que Fast est censé servir — pas sur une escalade Deep. Mesures
Fast réelles : 416–469 ms (1D-B/1D-C), `ttfi p95 = 1 617 ms` hors saturation. **Fast tient le contrat.
C'est Deep qui n'aurait jamais dû être sur ce chemin.**

## E. Runtime actuel

```
saisie utilisateur
 └─ oprieRunTurn(requestedMode)                                  HTML:21742
      ├─ if(oprieState.running) return false                      21743
      ├─ oprieState.running = true ; …                            21744
      ├─ oprieSetBusy(true) ; oprieShowAnalysing()                 21745   T0/T1, synchrone
      ├─ oprieState.fastInteraction = null ; …                     21746
      ├─ const deepPromise = oprieRequestTurn()                    21752   ◀── DEEP LANCÉ ICI
      ├─ const seq = oprieState.seq                                21753
      ├─ oprieMark('deep_start')                                   21754
      ├─ oprieStartFastPlane(seq, requestedMode)                   21755   ◀── FAST DÉMARRE APRÈS
      ├─ turn = await deepPromise                                  21758
      └─ oprieApplyTurn(turn, requestedMode)                       21767
```

| | valeur |
|---|---|
| FUNCTION / FILE | `oprieRunTurn`, `atelier-prompts-v11.5-lot10g-decision-provider.html:21742` |
| CONDITION de lancement de Deep | **aucune** — instruction inconditionnelle |
| PROMISE CREATED | ligne **21752** |
| PROMISE STARTED | immédiatement (appel de fonction, pas `lazy`) |
| PROMISE AWAITED | ligne **21758**, après le démarrage de Fast |
| `DEEP_PROMISE_CREATED_BEFORE_FAST_RESULT` | **YES** — et même avant l'*appel* Fast |
| `DEEP_LAUNCH_DEPENDS_ON_FAST_DECISION` | **NO** |

Le commentaire du code énonce l'intention sans détour :

> « PERF-04 : LE PLAN PROFOND PART D'ABORD. L'appel est lancé — pas attendu — avant que le plan
> rapide n'existe : c'est ce qui retire le plan rapide du chemin de la décision, et le plan profond du
> chemin de l'affichage. »

## F. Création de deepPromise — l'intention et son effet de bord

L'intention est légitime et elle est même doublement bonne : retirer Fast du chemin de la **décision**
(Fast ne décide rien) et retirer Deep du chemin de l'**affichage** (on n'attend pas Deep pour
montrer quelque chose). Les deux objectifs sont conformes au CDC.

**Mais l'ordonnancement et l'inconditionnalité sont deux propriétés distinctes, et le code les a
fusionnées.** « Ne pas attendre Deep pour afficher » n'implique pas « lancer Deep toujours ». On peut
lancer Deep *après* la réponse Fast, conditionnellement, et continuer à ne pas l'attendre. L'écart de
conformité tient entièrement dans cette confusion.

## G. ASK_ONE_QUESTION

| | |
|---|---|
| FAST_OUTPUT | `ASK_CLARIFICATION` / `ASK_CONFIRMATION` |
| USER_VISIBLE_ACTION | `oprieAsk(...)` + `oprieReleaseForFastQuestion(seq)` — question affichée, saisie déverrouillée sans attendre Deep |
| DEEP_STARTED | **OUI** — il l'était déjà avant que Fast réponde |
| DEEP_REQUIRED_BY_CONTRACT | **NON** — `IA-04` ne déclenche Deep que sur `CONTINUE_WITH_DEEP_VALIDATION` ; `IA-03` l'exige avant READY, et une question n'est pas READY |
| DEEP_CAN_BE_SKIPPED | **oui** pour ce tour ; il s'exécutera sur le tour qui devra conclure |
| DEEP_CAN_RUN_LATER | **oui** |
| CURRENT_CONFORMANCE | **NON CONFORME** |

Cause classée : **`HISTORICAL_IMPLEMENTATION`**, verrouillée par test. Aucun document de gouvernance
n'exige Deep sur un tour où Fast pose une question.

```
ASK_ONE_QUESTION_LAUNCHES_DEEP          = YES
ASK_ONE_QUESTION_REQUIRES_IMMEDIATE_DEEP = NO
```

**Le coût observable de cet écart.** Sur un tour où Fast pose une question à ~450 ms, la personne
répond en quelques secondes. La réponse déclenche un nouveau tour, et `oprieRequestTurn` commence par
`if(oprieState.controller)oprieState.controller.abort()` : **le Deep du tour précédent est abandonné
en vol**, après avoir consommé de 35 à 90 secondes de travail fournisseur selon les mesures de 1D-L.
Coût mesuré d'un tour Deep : **≈ 0,144 USD** (1D-K, 8 tours réels, 1,1483 USD). Que le fournisseur
cesse de facturer à l'abandon côté client n'est **pas établi** par le dépôt : je le marque UNKNOWN, et
la perte de travail côté client, elle, est certaine.

## H. CONTINUE_WITH_DEEP_VALIDATION

| | |
|---|---|
| FAST_OUTPUT | `WAIT_FOR_DEEP_VALIDATION` (et, depuis 1D-G, tout `ACKNOWLEDGE` en mode conversationnel) |
| USER_VISIBLE_ACTION | aucune — `oprieMark('fast_silent')`, le bandeau de T1 reste |
| DEEP_STARTED | **OUI** |
| DEEP_REQUIRED_BY_CONTRACT | **OUI** — `IA-04` |
| CURRENT_CONFORMANCE | **conforme dans l'effet, non dans la cause** |

Le chemin `→ Analyst → Critic → Arbiter` correspond exactement à `IA-04`, et
`OPERATIONAL_REQUEST_ROLE_SEQUENCE = ["analyst","critic","arbiter"]` le garde.

Mais la conformité est **accidentelle** : Deep n'est pas lancé *parce que* Fast a rendu
`WAIT_FOR_DEEP_VALIDATION` — il était déjà parti. Le runtime obtient le bon résultat sans exécuter la
règle. C'est une conformité qu'aucun test ne protège, et qu'un changement d'ordonnancement ferait
disparaître sans alerte.

## I. TECHNICAL_STOP

`TECHNICAL_STOP` n'existe pas comme type Fast. L'échec technique du plan rapide est traité par la
chaîne HA, un 502, et côté client par `context.fast_failed === true` → la politique rend
`WAIT_FOR_DEEP` (`FAST_UNAVAILABLE`).

```
TECHNICAL_STOP_LAUNCHES_DEEP = YES
```

Et c'est **testé explicitement** — `tests/fast-frontend-integration-perf04.test.mjs:85` :
`assert.equal(spy.deepCalls.length, 1, 'le plan profond part malgré l'échec rapide.')`.

**Je ne classe pas ceci comme non conforme, et c'est le seul point du dossier où je défends le
comportement actuel.** Si Fast échoue techniquement et que Deep n'est pas lancé, le tour n'a plus
aucune autorité : ni question, ni état, ni readiness. Ce serait un fail-open. Lancer Deep sur échec
Fast est un invariant **fail-closed légitime**, et le test de la ligne 85 doit être **préservé** par
tout correctif futur. Le CDC ne le contredit pas : il ne dit pas ce que `TECHNICAL_STOP` déclenche.

## J. Candidate ASK vs état OPRIE

```
ARE_THEY_SEMANTICALLY_IDENTICAL = NO
```

| | Fast `ASK_ONE_QUESTION` | OPRIE `clarification_required` |
|---|---|---|
| nature | interaction **candidate** | **état** de tour |
| schéma | `{type, text}`, `additionalProperties:false` — **physiquement incapable** de porter un état | `ARBITER_OUTPUT_FIELDS`, 8 champs |
| autorité | `authority: "candidate"`, `can_execute: false`, `can_mark_ready: false` | autorité sémantique unique |
| garde | `FAST_FORBIDDEN_AUTHORITY_FIELDS` | `isLegalTransition("understanding", state)` |
| producteur | plan rapide | **Arbitre seul** |
| effet sur le contrat canonique | **aucun** | `mapOprieToCanonicalContract` |

```
CAN_FAST_ASK_EXIST_WITHOUT_OPRIE_CLARIFICATION_STATE = YES
```

**Prouvé, et déjà en production.** Quand Fast rend une sollicitation, `oprieRenderFastInteraction`
appelle `oprieAsk(...)` puis `oprieReleaseForFastQuestion(seq)` — la question est affichée et la
saisie déverrouillée **alors qu'aucun état OPRIE n'existe encore**. La table de politique le prévoit
explicitement avec `KEEP_CURRENT_INTERACTION` / `DEEP_CONFIRMS_FAST_*` lorsque l'état arrive plus tard
et coïncide.

### `FAST_MAY_DISPLAY` / `FAST_MAY_NOT_DECIDE`

| Fast PEUT afficher | Fast NE PEUT PAS décider |
|---|---|
| une question candidate unique (`ONE_NEXT_INTERACTION_MAX = 1`) | qu'une clarification est *requise* (état OPRIE) |
| une orientation vers le parcours guidé | qu'une demande est prête (`operational_request_ready`) |
| un silence (`WAIT_FOR_DEEP_VALIDATION`) | qu'une demande est bloquée ou dégradée |
| le texte de sa propre interaction | la route, le moteur d'exécution, la readiness |

La frontière n'est pas une discipline : elle est **structurelle**. Le schéma à deux champs ne peut pas
transporter un état, et la validation le revérifie côté serveur et côté client.

## K. Rapide

| | |
|---|---|
| CDC §15 | `RAPIDE_POLICY = R1`, `RAPIDE_DIALOG_LOOP = NONE` ; si clarification nécessaire → `STOP → Continuer avec Architecte → Reformuler`, sans perte de contexte |
| implémentation | `CONVERSATIONAL_MODES = ["architecte","rapide"]` — Rapide converse |
| origine de l'écart | lot `ATELIER-RAPIDE-CONVERSATIONAL-FIX-01`, **décision propriétaire explicite** levant l'invariant R1 |
| statut | **divergence assumée**, antérieure à ce sous-lot ; le CDC v1.7 est daté du 02-09, la décision lui est postérieure |

Je le consigne comme un fait de conformité documentaire, pas comme un défaut : la décision a été prise
en connaissance de cause. Mais le CDC n'a pas été mis à jour, et un futur lot lisant le CDC seul
conclurait à une régression.

## L. Architecte

`CDC §16` : Architecte est conversationnel — `1 question prioritaire → réponse → progression`.
Conforme : la ladder de substitution garantit une seule question par tour, et l'Analyste trie ses
candidates par valeur informationnelle décroissante (`ANALYST_SYSTEM_PROMPT` point 8).

### Matrice des modes

| MODE | FAST_ALLOWED | FAST_ASK_ALLOWED | DEEP_TRIGGER attendu | DIALOG_LOOP | READY_AUTHORITY |
|---|---|---|---|---|---|
| **Rapide** | oui | oui (divergence assumée vs CDC §15) | `CONTINUE_WITH_DEEP_VALIDATION` | CDC : NONE — réel : oui | Arbitre |
| **Architecte** | oui | **oui** | `CONTINUE_WITH_DEEP_VALIDATION` | oui, 1 question/tour | Arbitre |
| **Atelier** | oui, mais `ASK_*` projeté en `ORIENT_ARCHITECTE` | non | hors tour gouverné | non | — |

Dans les trois modes, le trigger réel est aujourd'hui identique et inconditionnel : le mode n'entre
pas dans la décision de lancer Deep.

## M. Tests historiques

| TEST | CE QU'IL AFFIRME | NATURE |
|---|---|---|
| `fast-frontend-integration-perf04.test.mjs:41` | « **le plan profond part à chaque tour** » | **CONTRAT D'IMPLÉMENTATION HISTORIQUE** — aucun document de gouvernance ne l'énonce ; c'est ce test qui verrouille l'écart |
| `fast-frontend-integration-perf04.test.mjs:85` | « le plan profond part malgré l'échec rapide » | **INVARIANT PRODUIT RÉEL** — fail-closed, à préserver (§I) |
| `fast-frontend-integration-perf04.test.mjs:58` | les deux plans portent le même `turn_id` | invariant produit réel |
| `architecte-mode-closure-mode03.test.mjs:102` | « cinq tours OPRIE complets » | contrat d'implémentation — compte des tours, pas du trigger |
| `atelier-mode-closure-mode04.test.mjs:279` | « le pipeline reste ouvert après la bascule » | invariant produit (continuité de contexte) |
| `fast-solicitation-only-dg01.test.mjs:99` | « le plan profond a bien été lancé » | **mien, 1D-G** — contrat d'implémentation ; il constatait l'existant, il ne l'exigeait pas |

Un seul test énonce le comportement fautif comme une règle : la ligne 41. Aucun test ne vérifie
`IA-04`. Aucun test n'échouerait si Deep devenait conditionnel sur `WAIT_FOR_DEEP_VALIDATION` — sauf
ce test-là, et le mien.

## N. Cause racine

```
ROOT_CAUSE =
Le démarrage parallèle et inconditionnel de deepPromise, introduit sous l'étiquette PERF-04
(HTML:21752) pour retirer Deep du chemin d'affichage, a fusionné deux propriétés séparables —
l'ORDONNANCEMENT (ne pas attendre Deep) et l'INCONDITIONNALITÉ (toujours lancer Deep) — puis a
été verrouillé par l'assertion « le plan profond part à chaque tour ».
```

Trois éléments rendent cette cause précise plutôt que plausible.

**Premier.** L'instruction est inconditionnelle et antérieure : ligne 21752 pour Deep, 21755 pour
Fast. Aucune lecture de la décision Fast n'intervient.

**Deuxième.** Dans la ROADMAP, `PERF-04` est intitulé **« Structured Output Reliability — Corriger la
cause prouvée sans assouplir le schéma invalide »** (§16). Le démarrage parallèle du plan profond
n'entre pas dans ce périmètre. La décision a été prise à l'intérieur d'un lot dont la charte portait
sur autre chose, et les commentaires du code la datent de ce lot.

**Troisième.** Le test qui la verrouille porte le même préfixe `T-P04-01`. Le comportement et sa preuve
sont nés ensemble, hors charte, et rien n'a jamais confronté l'un ou l'autre à `IA-04`.

Cause **non retenue** : ce n'est pas une exigence de sûreté. La sûreté exige Deep avant READY
(`IA-03`), et avant un affichage lorsque Fast a échoué (§I) — pas avant une question que Fast vient de
poser. Ce n'est pas non plus un couplage architectural : `oprieReleaseForFastQuestion` fournit déjà une
sortie de tour sans Deep.

## O. Écart de conformité

```
CURRENT_DEEP_TRIGGER = UNCONDITIONAL
CURRENT_RUNTIME_CONFORMS_TO_FAST_DEEP_CONTRACT = NO
NON_CONFORMITY_CLASS = PRODUCT_CONTRACT_VIOLATION
```

Trois clauses normatives sont contredites, et la troisième nomme le cas littéralement :

1. `ROADMAP §20 IA-04` — `CONTINUE_WITH_DEEP_VALIDATION → Deep`. Le runtime ne lit pas cette sortie.
2. `MD ATELIER §6` — interdit de « lancer Critic / Arbiter / analyses multiples **par réflexe** ».
3. `GARDE-FOU §9` — interdit d'utiliser Deep « comme rituel obligatoire pour **afficher la prochaine
   interaction utilisateur** », et pose `DEEP = ESCALADE / PAS = CHEMIN RÉFLEXE`.

Je classe en `PRODUCT_CONTRACT_VIOLATION` et non en `HISTORICAL_IMPLEMENTATION_CONTRACT` : l'origine
est bien historique, mais l'effet contredit une interdiction explicite du garde-fou supérieur.
Qualifier l'effet par son origine l'atténuerait.

**Ce qui reste conforme, et il faut le dire :** `FINAL_READY_AUTHORITY = ARBITER`,
`ONE_SEMANTIC_READINESS_AUTHORITY = OPRIE`, l'incapacité structurelle de Fast à porter un état, la
séquence `analyst → critic → arbiter`, et `IA-03` (Deep avant READY). **Aucune autorité n'a dérivé.**
L'écart porte sur *quand* Deep est lancé, jamais sur *qui décide*.

## P. Correction minimale candidate

Ordre de préférence imposé : `SUPPRIMER > SIMPLIFIER > RENDRE CONDITIONNEL > RÉUTILISER > AJOUTER`.

| | option | évaluation |
|---|---|---|
| **A** | déplacer la création de `deepPromise` après le résultat Fast | nécessaire mais insuffisant seul : déplacé sans condition, Deep resterait réflexe |
| **B** | **conditionner le lancement à la sortie Fast** | **retenu** — c'est exactement `IA-04` |
| C | Deep parallèle seulement pour certaines sorties | équivalent à B, formulé à l'envers |
| D | autre primitive existante | aucune autre n'est nécessaire |

```
MINIMAL_CORRECTION_CLASS = CONDITION_DEEP_ON_FAST_OUTPUT
```

**Forme minimale, décrite et non implémentée.** Lancer Deep si et seulement si l'interaction Fast
projetée est `WAIT_FOR_DEEP_VALIDATION`, **ou** si le plan rapide a échoué (`fast_failed`), **ou** si
aucun endpoint Fast n'est configuré. Ne pas le lancer lorsque Fast a rendu une sollicitation valide :
il sera lancé au tour suivant, sur la réponse.

**Primitives réutilisées, toutes existantes, aucune créée :**

- `projectInteractionForMode` calcule déjà le type effectif, après la rétrogradation de 1D-G ;
- `WAIT_FOR_DEEP_VALIDATION` signifie déjà « rien à demander, le plan profond poursuit » ;
- `FAST_SOLICITING_TYPES` distingue déjà une sollicitation d'un silence ;
- `oprieReleaseForFastQuestion(seq)` fournit déjà la sortie de tour sans attendre Deep ;
- `context.fast_failed` et `noFastEndpoint` portent déjà les deux cas de repli fail-closed.

**Le point structurel que le lot d'implémentation devra traiter** : `oprieRunTurn` est aujourd'hui
construit autour de `turn = await deepPromise`. Rendre Deep conditionnel exige une seconde sortie de
fonction — celle qu'emprunte déjà un ASK rapide via `oprieReleaseForFastQuestion`. C'est une
réorganisation du flot de contrôle d'une seule fonction, sans composant nouveau.

```
NEW_COMPONENT_REQUIRED = NO
NEW_ARCHITECTURE_REQUIRED = NO
SECOND_SEMANTIC_AUTHORITY_REQUIRED = NO
```

## Q. Risques

| risque | EXISTE | ATTÉNUÉ PAR UNE PRIMITIVE EXISTANTE | MÉCANISME NOUVEAU REQUIS |
|---|---|---|---|
| **fausse question** (Fast demande ce qui n'était pas nécessaire) | **oui** — 1D-C a mesuré 0 `UNNECESSARY_ASK` sur 48, mais 12 `WRONG_ACKNOWLEDGE` | partiellement : 1D-G a fermé la voie `ACKNOWLEDGE` ; une question inutile reste possible et sera tranchée au tour suivant par l'Arbitre | non |
| **validation Deep manquante** | **non** — `IA-03` reste tenu : Deep s'exécute sur le tour qui conclut, et READY n'existe que par l'Arbitre | `isLegalTransition`, `FINAL_READY_AUTHORITY` | non |
| **Fast devient autorité** | **non** — impossibilité structurelle (§J) | schéma à 2 champs, `FAST_FORBIDDEN_AUTHORITY_FIELDS`, double validation | non |
| **tour périmé** | oui | `seq`, `concludedTurn`, `pendingQuestion`, `AbortController`, `TURN_STALE`, `IGNORE_STALE` | non |
| **contexte perdu** | oui | `clarification_history` ; `original_request` toujours la demande brute ; `MODE-02` garde la bascule sans perte | non |
| **mauvaise transition de mode** | oui | `turn.mode !== mode → IGNORE_STALE` (`MODE_SWITCHED`) | non |
| **régression Rapide** | oui | `MODE-01`/`R1` gardés par `tests/…mode04`, `functional-closure` | non |
| **régression Architecte** | oui | `tests/architecte-mode-closure-mode03` — **mais il assert « cinq tours OPRIE complets »** : ce compte changerait si Deep devenait conditionnel. À requalifier, pas à supprimer | non |
| **READY fabriqué hors OPRIE** | **non** | `ARBITER_STATES`, `isLegalTransition`, mapping canonique | non |
| **dialogue sans fin** (Fast questionne indéfiniment, Deep jamais lancé) | **oui, et c'est le risque réel du correctif** | `ONE_NEXT_INTERACTION_MAX = 1` borne une question par tour, mais **rien ne borne le nombre de tours Fast consécutifs** | **à décider** — pas un mécanisme nouveau, une règle de garde à expliciter |

Le dernier est le seul qui demande une décision produit : après combien de sollicitations Fast
consécutives le tour doit-il obligatoirement escalader vers Deep ? Le référentiel ne le dit pas. Je ne
propose aucun seuil — ce serait un seuil arbitraire, interdit.

## R. Tests nécessaires

**Conformité du trigger** (le cœur, aujourd'hui non testé)
1. `WAIT_FOR_DEEP_VALIDATION` ⇒ `deepCalls.length === 1`.
2. `ASK_CLARIFICATION` / `ASK_CONFIRMATION` ⇒ `deepCalls.length === 0` **sur ce tour**.
3. Échec Fast ⇒ `deepCalls.length === 1` — **préserve l'assertion existante de la ligne 85**.
4. Aucun endpoint Fast ⇒ `deepCalls.length === 1`.
5. Réponse de l'utilisateur à un ASK Fast ⇒ nouveau tour, Deep lancé si Fast ne sollicite plus.

**Autorité** (non-régression)
6. Un ASK Fast ne fabrique jamais `operational_request_ready`.
7. Un ASK Fast ne fabrique jamais `clarification_required` — aucun état dans la réponse Fast.
8. `FINAL_READY_AUTHORITY = ARBITER` : `state` reste la production exclusive de l'Arbitre.
9. `FAST_FORBIDDEN_AUTHORITY_FIELDS` inchangé ; `authority: "candidate"` inchangé.

**Fluidité**
10. ASK Fast visible dans le contrat Fast (p95 ≤ 3 s), mesuré sur le chemin frontend réel.
11. T0/T1 inchangés.

**Modes et contexte**
12. Rapide : politique préservée. 13. Architecte : dialogue préservé, une question par tour.
14. Atelier : non concerné, `ASK_*` toujours projeté en `ORIENT_ARCHITECTE`.
15. `clarification_history` intègre correctement la réponse à un ASK Fast.
16. Tour périmé toujours rejeté. 17. Aucun codage en dur, aucune règle de domaine.

**Comptage** — nouveaux tests de `call-count` par sortie Fast : c'est la classe de test qui manque
entièrement aujourd'hui, et c'est elle qui aurait détecté l'écart.

**À requalifier, non à supprimer** : `perf04:41` (« part à chaque tour ») devient « part quand le
contrat le demande » ; `mode03:102` (« cinq tours OPRIE complets ») doit recompter selon le nouveau
trigger ; `dg01:99` (mien) doit cibler le cas `WAIT_FOR_DEEP_VALIDATION`.

## S. Impact utilisateur

Ce que la correction change, formulé du point de vue de la personne et non du budget :

**Une demande simple reste simple.** « Je veux préparer mon voyage en Italie » — Fast répond en
~450 ms. Aujourd'hui, une chaîne de trois rôles part en même temps, tourne 35 à 90 secondes, et se
fait abandonner dès que la personne répond. Demain, elle ne part pas.

**Une question utile arrive vite, et reste la seule chose qui arrive.** Le contrat de fluidité
(1–2 s, p95 ≤ 3 s) est tenu par Fast — mesuré à 416–469 ms. Il n'a jamais été tenable par Deep, et
les audits 1D-H à 1D-L l'ont démontré cinq fois. La correction ne rend pas Deep plus rapide : elle le
retire d'un chemin où il n'avait pas à être.

**Deep n'est appelé que quand le travail le mérite.** C'est `DEEP = ESCALADE` appliqué littéralement.

**Le prompt final reste fidèle.** Aucune autorité ne bouge : l'Arbitre reste seul à déclarer READY,
OPRIE reste l'autorité sémantique unique, l'ADN reste appliqué par la même chaîne. Deep s'exécute sur
le tour qui doit conclure — simplement pas sur ceux qui n'ont qu'une question à poser.

## T. Verdict

Le runtime ne respecte pas la décision Fast : il ne la lit pas. `deepPromise` est créé à la ligne
21752, trois lignes avant que le plan rapide ne démarre, sans condition. `IA-04` fait de
`CONTINUE_WITH_DEEP_VALIDATION` le déclencheur de Deep ; le garde-fou §9 interdit d'employer Deep pour
« afficher la prochaine interaction utilisateur » ; la directive §6 interdit de lancer Critic et
Arbitre « par réflexe ». Les trois sont contredites par une seule instruction.

L'origine est identifiable sans conjecture : une décision d'ordonnancement prise dans un lot intitulé
« Structured Output Reliability », qui a fusionné *ne pas attendre Deep* avec *toujours lancer Deep*,
et qu'un test nommé d'après ce même lot a figée en règle. Aucun test ne vérifie `IA-04` ; un seul
verrouille son contraire.

Ce que l'audit ne trouve pas, et c'est important : aucune dérive d'autorité. Fast reste
structurellement incapable de porter un état, l'Arbitre reste seul à déclarer READY, et 1D-G a même
rapproché l'implémentation du contrat CDC en rendant `ACKNOWLEDGE` silencieux. L'écart est un écart de
déclenchement, pas de gouvernance.

Enfin, ceci éclaire rétrospectivement les cinq audits précédents. Ils ont cherché à faire tenir Deep
dans un contrat de 1–2 secondes, et ont prouvé cinq fois que c'était impossible. Ils cherchaient à
optimiser un chemin qui n'aurait pas dû exister : **le contrat de fluidité porte sur le tour de
dialogue ordinaire, que Fast tient déjà à 450 ms.** La bonne question n'était pas « comment rendre Deep
assez rapide » mais « pourquoi Deep est-il sur ce chemin ». La réponse tient en une ligne de code.
