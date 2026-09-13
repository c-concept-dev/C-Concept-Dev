# ATELIER-RAPIDE-CANONICAL-FAIL-CLOSED-FIX-02C

**Lot :** `ATELIER_RAPIDE_CANONICAL_FAIL_CLOSED_FIX_02C`
**Nature :** correctif de production ciblé. **GELABLE.**

**Résultat.** Un contrat canonique refusé n'ouvre plus l'exécution. Mesuré avant/après sur la branche
de refus réelle : `executed = 1 → 0`, bandeau `thinking → technical`, marque de refus
`(aucune) → canonical_contract_refused`. Le chemin accepté est inchangé, **8/8**. Une ligne de
production, deux primitives déjà présentes, aucun composant, aucune autorité.

---

## A. Baseline

```
git status --short -- 'tools/Atelier Prompts'  → 3 rapports non suivis (1D-O, 02A, 02B)
git branch --show-current                      → main
git rev-parse HEAD                             → 99dea8776d0abcbdb11d29dc255ecb74d37bd687
git log -5  → 99dea87 (02B) / 51ecbfb / e6d1371 (1D-N) / 01e08fb / 7f3f245
```

```
LOT = ATELIER_RAPIDE_CANONICAL_FAIL_CLOSED_FIX_02C
PROBLÈME PRODUIT RÉEL = Rapide produit un prompt quand le contrat canonique est refusé
CAUSE RACINE PROUVÉE  = le refus est converti en null, puis oprieEnterExecution poursuit
BÉNÉFICE UTILISATEUR  = aucun prompt non gouverné n'est livré après échec du contrat canonique
SCOPE                 = propagation du refus canonique + arrêt fail-closed
```

## B. Rappel 02B

02B avait levé l'hypothèse du double prompt : sur le chemin gouverné **avec** contrat, il n'existe
qu'un prompt, le gate le contrôle (`qg = PASS`), et c'est celui-là qui est livré — 8/8 à l'octet. Et
02B avait nommé le défaut réellement atteignable, que ce lot corrige.

## C. Fail-open avant correction

```
REJECTION_LOCATION            = core/adn/oprie-canonical-mapping.js :: validateCanonicalContract
NULL_CONVERSION_LOCATION      = HTML:21277 — oprieBuildCanonicalContract
                                if(!verdict||verdict.ok!==true){console.warn('Contrat canonique refusé.',…);return null}
FAIL_OPEN_GUARD_LOCATION      = HTML, assemblerRapideAdaptatif (PLAGE GELÉE)
                                if(!p&&rapideContratCanonique&&rapideContratCanonique.executability…)
                                ◀── teste la valeur qui vient d'être annulée : ne peut pas se déclencher
NON_CANONICAL_FALLBACK_LOC.   = HTML, adpRunRapide → rapideAppliquerContratCanonique(null)
DELIVERY_LOCATION             = adpRunRapide (suite) ; copierRapideAdaptatif pour la copie directe
```

Chemin réel :

```
OPRIE READY
 └─ oprieBuildCanonicalContract(turn)
      └─ validateCanonicalContract → verdict.ok = false
      └─ console.warn + return null                         ← le refus devient une absence
 └─ oprieEnterExecution
      └─ oprieState.canonicalContract = null
      └─ (aucune garde)                                     ← le fail-open
      └─ route → adpRunRapide(demande, materiau, {canonical:null})
           └─ rapideAppliquerContratCanonique(null)
           └─ assemblerRapideAdaptatif : p = null ⇒ if(p){…gate…} SAUTÉ
           └─ verrous historiques + fusion ADN ⇒ réassemblage
 └─ prompt livré, jamais contrôlé
```

## D. Cause racine

Le refus était converti en `null`, et `null` portait alors deux sens incompatibles :
« contrat explicitement refusé » et « pas de contrat, repli autorisé ».

**Et la catégorie B n'existe pas à ce point d'appel.** C'est le résultat qui a rendu la correction
simple, et il fallait l'établir avant de coder. `oprieBuildCanonicalContract` a **exactement un
appelant** (HTML:21561, dans `oprieEnterExecution`) et rend `null` dans trois cas :

| branche | nature |
|---|---|
| `!runtime \|\| typeof runtime.mapOprieToCanonicalContract!=='function'` | échec technique |
| `verdict.ok !== true` | **refus sémantique** |
| `catch(error)` | échec technique |

Aucune n'est une absence légitime. La seule voie qui travaille légitimement sans contrat canonique
est la **vue Rapide directe** (`copierRapideAdaptatif`), qui n'appelle jamais
`oprieBuildCanonicalContract`. Sur ce point d'appel, `null` signifie donc toujours « échec ».

Conformément au §5, je n'ai donc eu ni à distinguer A de B, ni à inventer une distinction : j'ai
prouvé que B est vide. `CANONICAL_REJECTION_DISTINGUISHABLE = NO` au point d'appel — et sans
conséquence, puisqu'il n'y a rien à distinguer.

## E. Primitive fail-closed existante

`REUSE > ADD`, et la primitive était déjà dans la fonction à corriger, trois lignes plus haut :

```js
// oprieEnterExecution, comportement préexistant
if(!route){oprieMark('execution_target_unknown',{mode:requestedMode});return oprieShowNetworkFailure()}
```

`oprieMark` pour la trace, `oprieShowNetworkFailure()` pour le refus visible. Rien d'autre n'était
nécessaire.

Le précédent Architecte a servi de référence de comportement, non de code :

```js
// core/adn/oprie-manual-roundtrip.js:239 — buildArchitecteContractFromTurn
return refuse('technical', `Contrat canonique refusé : ${(verdict && verdict.problems || []).join(' · ')}`);
```

Les deux modes partagent désormais l'invariant `REJECTED_CANONICAL_NEVER_PRODUCES_PROMPT` **sans
partager de code**, ce que le §6 autorisait explicitement.

## F. Correction minimale

Une ligne exécutable, dans `oprieEnterExecution`, immédiatement après la construction du contrat et
**avant** la branche de route :

```js
const canonical=oprieBuildCanonicalContract(turn);
oprieState.canonicalContract=canonical;
if(!canonical){oprieMark('canonical_contract_refused',{mode:requestedMode,state:turn&&turn.state||null});return oprieShowNetworkFailure()}
```

Ce qui n'a pas été fait, et qui aurait été plus gros : aucune modification de
`oprieBuildCanonicalContract` (sa forme de retour est inchangée), aucune modification du moteur
Rapide — qui est de toute façon **gelé** —, aucun nouvel état, aucune machine d'état, aucune
taxonomie de refus, aucun seuil.

## G. Rejet canonique — mesure avant / après

Branche de refus obtenue avec le **vrai** validateur : la fixture de tour prête produisait un contrat
que `validateCanonicalContract` refuse (`problems: ["intent.deliverable vide sur une demande
prête."]`), puis, une fois la fixture corrigée, le refus est forcé par le harnais
(`canonicalRejected: true`) sans toucher la production.

| | avant correction | après correction |
|---|---|---|
| `oprieState.canonicalContract` | `null` | `null` |
| `EXECUTION_CONTINUES` | **YES** (`executed = 1`) | **NO** (`executed = 0`) |
| `orientation.canonical` reçu par le moteur | `null` | *jamais transmis* |
| dernier bandeau | `thinking` | **`technical`** |
| marque de refus | *(aucune)* | **`canonical_contract_refused`** |
| Prompt Contract Gate | non exécuté | **sans objet : aucun prompt** |

```
REJECTED_CANONICAL_PROMPT_COUNT    = 0
REJECTED_CANONICAL_DELIVERY_COUNT  = 0
REJECTED_CANONICAL_ASSEMBLER_CALLED = NO
FAIL_CLOSED_REASON_OBSERVABLE       = YES
```

## H. Canonical accepté

Inchangé, et la preuve est de niveau code : sur le chemin accepté, `canonical` est vrai, donc la
garde est un **no-op** et rien en aval n'est modifié. La garde est la seule instruction ajoutée au
fichier de production.

```
ACCEPTED_CANONICAL_CONTINUES = YES        (executed = 1, orientation.canonical présent)
ACCEPTED_CANONICAL_GATE_RUNS = YES        (qg = PASS, 8/8)
```

## I. Rapide

Seul mode visé. `tests/rapide-*` : **189 tests, 0 échec**. Aucune modification du moteur — la plage
gelée « moteur Rapide » est intacte (`FROZEN PASS`, 7/7).

## J. Architecte

```
ARCHITECTE_REJECTION_CHANGED = NO
```

La garde est posée avant la branche de route, donc elle s'applique aux deux modes. Pour Architecte,
**l'issue observable est identique** à ce qu'elle était : un refus technique, aucun prompt. Ce qui
change est le *moment* — le refus survient à l'entrée en exécution au lieu de survenir plus bas dans
`buildArchitecteContractFromTurn`, qui refusait déjà le même cas. `T-02C-08` vérifie les deux : aucune
entrée en exécution, bandeau `technical`, et la primitive `refuse('technical', …)` d'Architecte
toujours présente et intacte. `tests/arch*` + `tests/architecte*` : **227 tests, 0 échec**.

## K. Prompt Gate

Sur contrat accepté : `prompt → gate → livraison`, inchangé (`qg = PASS`, 8/8, §M).

Sur contrat refusé : **aucun prompt**, donc `QG_NOT_RUN` est le comportement correct — et non une
lacune. Conformément au §7, je n'ai pas cherché à gater un artefact qui ne doit jamais exister. Les
internes du gate ne sont pas touchés (`tests/prompt-contract-gate*` : 79/0).

## L. Delivery

`REJECTED_CANONICAL_NEVER_REACHES_DELIVERY = PASS`. `T-02C-05` le prouve par le chemin plutôt que par
l'effet : la garde précède, dans la source, l'unique branche `route==='rapide'?adpRunRapide(…)` — donc
aucun moteur, aucun assembleur, aucune copie ne peut être atteint après un refus. `T-02C-03` vérifie
en plus que `#rapide-sortie` et `#v11-question` restent vides.

Recherche exhaustive demandée au §10 : `assemblerRapideAdaptatif`, `assembler` et
`copierRapideAdaptatif` ne sont joignables depuis un tour gouverné que par `adpRunRapide` ou
`copierRapideAdaptatif` — le premier est derrière la garde, le second appartient à la vue directe qui
ne passe pas par `oprieBuildCanonicalContract`.

## M. Corpus 02B

Les huit cas gouvernés rejoués sur le chemin accepté :

| cas | canonical | `qg` | empreinte gaté | empreinte livré | identique | ≡ 02B |
|---|---|---|---|---|---|---|
| R05 | présent | PASS | `36b52d69392c` | `36b52d69392c` | **oui** | **oui** |
| R01 | présent | PASS | `13b4d401ef9d` | `13b4d401ef9d` | **oui** | **oui** |
| R07 | présent | PASS | `4bd0b0a50505` | `4bd0b0a50505` | **oui** | **oui** |
| R11 | présent | PASS | `a57af18e12f9` | `a57af18e12f9` | **oui** | matériau différent¹ |
| R03 | présent | PASS | `dbfef5f6664b` | `dbfef5f6664b` | **oui** | **oui** |
| R13 | présent | PASS | `d81cc1f4a15d` | `d81cc1f4a15d` | **oui** | matériau différent¹ |
| R14 | présent | PASS | `4cae46773b1f` | `4cae46773b1f` | **oui** | **oui** |
| R06 | présent | PASS | `ce33326df4de` | `ce33326df4de` | **oui** | **oui** |

```
CORPUS_ACCEPTED_PATH = 8/8
```

¹ R11 et R13 sont les deux cas à matériau. J'ai passé dans ce run un CSV plus court que celui de 02B ;
leurs empreintes diffèrent donc pour cette raison, et pour elle seule. Les six cas sans matériau sont
**identiques à l'octet** à ceux de 02B, ce qui suffit à établir que le correctif n'a pas touché
l'assemblage. Je le signale plutôt que de refaire le run avec le même matériau.

## N. Quantités — hors scope

Le défaut reste : 5 cas sur 8 portent une quantité explicite sans verrou `volume` ni section
`CONTRAINTES QUANTIFIÉES`, et `qg` passe. `CAUSE = NOT_PROVEN` — mon contrat canonique vient d'une
fixture, non d'un Arbitre réel par cas. **Ni le mapper ni le gate n'ont été touchés ici.**

## O. Tests ciblés

`tests/rapide-canonical-fail-closed-02c.test.mjs` — **9 tests, 0 échec** :

| test | ce qu'il éprouve |
|---|---|
| `T-02C-01` | contrat accepté ⇒ Rapide poursuit, avec le contrat, jamais `null` |
| `T-02C-02` | contrat refusé ⇒ exécution jamais entrée |
| `T-02C-03` | contrat refusé ⇒ aucun prompt, `#rapide-sortie` et `#v11-question` vides |
| `T-02C-04` | contrat refusé ⇒ aucune livraison, dans les **deux** modes |
| `T-02C-05` | preuve de chemin : la garde précède la branche de route dans la source |
| `T-02C-06` | contrat accepté ⇒ le gate reste atteignable, avec un contrat opposable |
| `T-02C-07` | le refus est observable : marque de télémétrie **et** bandeau `technical` |
| `T-02C-08` | le refus Architecte reste un refus technique sans prompt ; `refuse('technical', …)` intact |
| `T-02C-09` | la garde n'emploie que `oprieMark` et `oprieShowNetworkFailure` ; aucune structure nouvelle |

### Deux compléments de harnais, et pourquoi ce ne sont pas des assouplissements

**1. Les harnais ne câblaient pas le runtime canonique.** `perf04-frontend-harness.helper.mjs` et
`frontend-oprie-integration-fc01b.test.mjs` exposaient un `adnRuntime()` sans
`mapOprieToCanonicalContract` ni `validateCanonicalContract` — alors que le pilote les appelle.
`oprieBuildCanonicalContract` y rendait donc **toujours** `null` : les harnais mesuraient le
fail-open en croyant mesurer le comportement normal. Les deux fonctions **réelles** sont désormais
câblées. C'est le même type de défaut que le `clearTimeout` manquant corrigé en 1D-N.

**2. La fixture `arbiterTurn` décrivait un tour impossible.** Son candidat portait `objective` sans
`expected_deliverable`, et le vrai validateur refuse ce contrat :
`"intent.deliverable vide sur une demande prête."` Un tour **prêt** dont le contrat canonique serait
refusé est une contradiction ; la fixture a reçu un livrable. Sans cette correction, le nouveau garde
aurait refusé tous les tours prêts des suites existantes — non parce qu'il est faux, mais parce que
la fixture était fausse.

`canonicalRejected` est un **joint de test** : il force le verdict à refuser, sans jamais remplacer la
validation ni toucher la production.

## P. Tests globaux

```
GLOBAL_RUN_1 = 3012 / 3012 / 0
GLOBAL_RUN_2 = 3012 / 3012 / 0
GLOBAL_RUN_3 = 3012 / 3012 / 0     (3003 → 3012, +9)

ciblés 02C  9/0 · 02B 7/0 · Rapide 189/0 · canonical 319/0 · Gate 79/0 · Architecte 227/0
```

Classification des échecs rencontrés en cours de route :

| échecs | classe | traitement |
|---|---|---|
| 21 (empreinte HTML épinglée + manifeste) | rituel connu | 15 fichiers mis à jour, manifeste régénéré |
| 3 (`FC01B-10`, `FC01B-18/19`, `FC01B-27`) | **`STALE_FIXTURE`** | second harnais incomplet : runtime canonique + fixture (§O) |
| 1 (`T-02C-09`) | **`TEST_BUG`** de ma part | regex butant sur l'accolade de l'objet de télémétrie |
| — | `NEW_REGRESSION` | **0** |

## Q. FROZEN

`PASS` — `{"status": "OK"}`, 7/7 plages gelées conformes. Le moteur Rapide gelé n'est pas touché : la
garde vit dans `oprieEnterExecution`. Rituel d'empreinte exécuté — nouvelle empreinte HTML
`d7c9e4a7…217486`, propagée dans les **15** fichiers qui l'épinglent, manifeste régénéré par l'outil
canonique (`--tests=3012`, `nonClasses: []`).

## R. Dette

```
DEBT_REMOVED = le fail-open actif après refus du contrat canonique ;
               le double sens de `null` (« refusé » / « absent, repli autorisé ») au point d'appel ;
               deux harnais qui mesuraient le fail-open en croyant mesurer le nominal ;
               une fixture de tour PRÊT dont le contrat canonique était refusé.

DEBT_CREATED = aucune.
```

Aucune autorité dupliquée : le refus n'est pas une décision sémantique, c'est l'absence d'un contrat
sans lequel rien ne peut être gouverné. Aucune machine d'état. Aucune autorité propre à Rapide : la
garde est en amont de la branche de route, donc commune aux deux modes.

## S. Défauts restants

| défaut | état |
|---|---|
| quantités explicites non promues en contrainte (5/8) | **ouvert**, `CAUSE = NOT_PROVEN`, hors scope |
| `adnMergeLegacyLocks` union stricte | ouvert — et le dépôt le sait : `T-RAPCHAR-13b` s'intitule « **[CARACTÉRISATION — COMPORTEMENT DESTINÉ À DISPARAÎTRE]** » |
| `assemblerRapideAdaptatif` : garde interne inopérante | **désormais inatteignable** — la garde amont refuse avant. La garde interne reste dans le code gelé, sans effet. `FOLLOW_UP` |
| `oprieBuildCanonicalContract` ne distingue pas refus et échec technique | sans conséquence au point d'appel (§D). `FOLLOW_UP` si un second appelant apparaissait |
| `TECHNICAL_STOP` non implémenté comme type Fast ; CDC §15 en retard | hérités, `FOLLOW_UP_ONLY` |

## T. Verdict

Le défaut est corrigé, et il l'est par une ligne. Un contrat canonique refusé arrête désormais le
tour : `executed = 0`, bandeau technique, refus tracé. Ce qui rendait ce défaut vicieux, c'est que la
garde censée le fermer testait `rapideContratCanonique` — la valeur qui venait précisément d'être
annulée — de sorte qu'elle ne pouvait pas se déclencher dans le seul cas pour lequel elle avait été
écrite.

La correction a été petite parce qu'une mesure l'a précédée : au point d'appel, `null` ne signifie
jamais « absence légitime ». Il n'y avait donc pas de distinction à inventer, et pas de machine d'état
à construire — seulement un refus à ne plus convertir en permission. La primitive existait déjà dans
la fonction, trois lignes plus haut.

Deux compléments de harnais ont été nécessaires, et ils disent quelque chose d'inconfortable : deux
suites de tests mesuraient le fail-open en croyant mesurer le comportement nominal, parce qu'aucune
n'exposait au pilote le mapper canonique qu'il appelle, et parce qu'une fixture décrivait un tour
prêt dont le contrat aurait été refusé. Le correctif ferme le défaut ; les compléments ferment
l'angle mort qui l'avait laissé passer.

Le chemin accepté est intact — six des huit prompts sont identiques à l'octet à ceux de 02B, les deux
autres ne diffèrent que par le matériau que j'ai passé.
