# ATELIER-FAST-DEEP-TRIGGER-FIX-01

**Sous-lot :** `ATELIER_FAST_DEEP_TRIGGER_FIX_01D_N`
**Nature :** correctif de production ciblé. **GELABLE.**

**Résultat.** Le plan profond ne part plus quand le plan rapide sait poser une vraie question.
`IA-04` est restauré : `ASK_ONE_QUESTION` → 0 appel profond, `CONTINUE_WITH_DEEP_VALIDATION` → 1,
échec rapide → 1, fail-closed. **2996/2996 tests verts, FROZEN PASS.** Aucune autorité déplacée,
aucun composant créé, aucun plafond de tours inventé.

---

## A. État Git

```
git branch  → main      git rev-parse HEAD → 01e08fb02a3231f53b4e66077ae16eb1042f600a
git log -5  → 01e08fb / 7f3f245 / 305f544 / 81c6f44 / 2dfd137
```

Au départ : `git status --porcelain -- 'tools/Atelier Prompts'` → seul mon rapport 1D-M non suivi.
`git diff --name-only 1d5eed5..HEAD -- 'tools/Atelier Prompts' | grep -v '/docs/'` → **0 fichier** :
le code de production était inchangé depuis la baseline des audits.

## B. Rappel 1D-M

`CURRENT_DEEP_TRIGGER = UNCONDITIONAL` · `DEEP_PROMISE_CREATED_BEFORE_FAST_RESULT = YES` ·
`ASK_ONE_QUESTION_REQUIRES_IMMEDIATE_DEEP = NO` · `NON_CONFORMITY_CLASS = PRODUCT_CONTRACT_VIOLATION` ·
`MINIMAL_CORRECTION_CLASS = CONDITION_DEEP_ON_FAST_OUTPUT`.

Clauses normatives restaurées : `ROADMAP §20 IA-04` (`CONTINUE_WITH_DEEP_VALIDATION → Deep`),
`GARDE-FOU §9` (`DEEP = ESCALADE / PAS = CHEMIN RÉFLEXE`, interdit d'employer Deep « pour afficher la
prochaine interaction utilisateur »), `MD ATELIER §6` (pas de Critic/Arbitre « par réflexe »).

## C. Cause racine

`const deepPromise=oprieRequestTurn()` à `HTML:21752`, trois lignes avant `oprieStartFastPlane(...)`,
sans condition. L'intention — ne pas *attendre* Deep pour afficher — avait fusionné avec une seconde
propriété, séparable : *toujours lancer* Deep.

Deux couplages sous-jacents, découverts en écrivant le correctif et non visibles à l'audit :

1. **`oprieRequestTurn` allouait le numéro de tour** (`const seq=++oprieState.seq`). Ouvrir un tour et
   escalader étaient *la même instruction* — c'est ce qui rendait l'escalade structurellement
   inévitable, indépendamment de la ligne 21752.
2. **`oprieRequestFastInteraction` n'avait aucune borne de temps.** Inoffensif tant que personne ne
   l'attendait ; bloquant dès que l'escalade en dépend.

## D. Code avant

```
CURRENT_TRIGGER_LOCATION = atelier-prompts-v11.5-lot10g-decision-provider.html:21752
CURRENT_TEST_LOCK        = 5 verrous, tous textuels ou de comptage :
  tests/fast-frontend-integration-perf04.test.mjs:41   « le plan profond part à chaque tour »
  tests/fast-frontend-integration-perf04.test.mjs:732  T-P04-ORDER — interdit NOMMÉMENT
      /await\s+oprieStartFastPlane/ avant le départ profond
  tests/orchestration-closure-ia05.test.mjs:477        ordre source
  tests/orchestration-runtime-closure-ia02b.test.mjs:516  ordre source
  tests/orchestration-sequences-ia03.test.mjs:484      ordre source
  + tests/mode-contracts-mode01.test.mjs (T-MODE01-39/40/41/42) : deepCalls=1 sur un ASK, par mode
```

## E. Correction minimale

Cinq éditions, toutes locales au pilote. Aucun composant, aucune taxonomie nouvelle.

**1. Séparer l'ouverture du tour de l'escalade.**

```js
function oprieOpenTurn(){
  const seq=++oprieState.seq;
  if(oprieState.controller){oprieState.controller.abort();oprieState.controller=null}
  return seq;
}
async function oprieRequestTurn(seqOuvert){
  const seq=Number.isInteger(seqOuvert)?seqOuvert:++oprieState.seq;   // appelant direct : contrat intact
```

Ouvrir un tour n'appelle aucun fournisseur. Le repli sans argument préserve exactement le contrat des
appelants directs (`tests/frontend-oprie-integration-fc01b.test.mjs` appelle `oprieRequestTurn()`
sans argument et reste vert).

**2. Le plan rapide ne rend que ce qui a été réellement montré.**

```js
return oprieRenderFastInteraction(projected,seq)?projected:null;
```

Une candidate écartée — tour périmé, tour déjà tranché, question déjà ouverte — n'est pas une
interaction : le tour escalade. Fail-closed par construction, et c'est ce qui rend le correctif sûr
sans condition supplémentaire.

**3. Borner l'attente du plan rapide.**

```js
const minuteur=setTimeout(()=>controller.abort(),FAST_CONTRACT_FAILURE_MS);
try{ … }finally{clearTimeout(minuteur)}
```

`FAST_CONTRACT_FAILURE_MS = 10000` : ce n'est pas un seuil choisi ici, c'est le
`seuils.echec_contrat_ms` du contrat rapide, **gelé avant la première mesure réelle**
(`evaluation/perf-real-01/results-01b.json`, « figes avant la mesure, inchanges apres »). Cité, non
redéfini. La borne n'ajoute **aucun comportement** : elle fait entrer une absence de réponse dans le
chemin d'échec qui existait déjà — `abort` → `catch` → `fast_failure` → le plan profond part.

**4. Conditionner l'escalade.**

```js
const seq=oprieOpenTurn();
let projected=null;
try{projected=await oprieStartFastPlane(seq,requestedMode)}catch(error){projected=null}
if(seq!==oprieState.seq)return false;
if(projected&&FAST_SOLICITING_TYPES.indexOf(projected.type)!==-1){
  oprieMark('deep_not_started',{reason:'FAST_ASK_ONE_QUESTION',type:projected.type});
  return true;
}
const deepPromise=oprieRequestTurn(seq);
```

**5. Le harnais expose `clearTimeout`.** Le contexte `vm` de `loadPilot` fournissait `setTimeout`
mais pas `clearTimeout` : le `finally` levait une `ReferenceError`, absorbée par le `catch` du plan
rapide, et **chaque appel rapide était compté comme un échec**. C'est un défaut de complétude du
harnais, pas un assouplissement de test — et il a d'abord produit un faux diagnostic de ma part, que
je corrige explicitement au §T.

### Mapping contrat → implémentation, minimal

| CDC §7 | implémenté | escalade ? |
|---|---|---|
| `ASK_ONE_QUESTION` | `ASK_CLARIFICATION` \| `ASK_CONFIRMATION` (= `FAST_SOLICITING_TYPES`) | **non** |
| `CONTINUE_WITH_DEEP_VALIDATION` | `WAIT_FOR_DEEP_VALIDATION` | oui |
| — | `ACKNOWLEDGE` (projeté en silence depuis 1D-G, modes conversationnels) | oui |
| — | `ORIENT_ARCHITECTE` | oui — **comportement inchangé** |
| `TECHNICAL_STOP` | non implémenté comme type Fast | oui, via le chemin d'échec |

Aucun type créé, aucun type retiré. `FOLLOW_UP_ONLY` : `TECHNICAL_STOP` absent, `ACKNOWLEDGE` et
`ORIENT_ARCHITECTE` hors contrat CDC — signalés en 1D-M, hors périmètre ici.

## F. ASK_ONE_QUESTION

```
fastCalls = 1   deepCalls = 0   question affichée   saisie déverrouillée
télémétrie : fast_start → fast_end → fast_render{soliciting:true} → deep_not_started{FAST_ASK_ONE_QUESTION}
```

Éprouvé par `T-DN01-A` sur les deux types sollicitants, `T-P04-TRIGGER-1`, `T-P04-11`, `T-IA05-07`,
`T-MODE01-39/40/41/42`.

## G. CONTINUE_WITH_DEEP_VALIDATION

```
fastCalls = 1   deepCalls = 1   ni zéro, ni deux
```

Chemin `Analyst → Critic → Arbiter` inchangé (`OPERATIONAL_REQUEST_ROLE_SEQUENCE`). Éprouvé par
`T-DN01-B`, `T-P04-TRIGGER-2`, `T-MODE01-39/40/41/42`. **Désormais conforme par la règle**, non plus
par surabondance.

## H. Fast failure

```
fastCalls = 1   deepCalls = 1   fail-closed
```

Quatre formes d'échec couvertes par `T-DN01-C` : exception réseau, HTTP 502, type hors énumération,
texte vide. Plus `T-DN01-D` : aucun endpoint rapide → escalade quand même. Plus `T-P04-TRIGGER-3` et
`T-P04-04`. **Invariant légitime, préservé et renforcé** — une absence de réponse y entre maintenant
aussi (§E.3). Je ne le requalifie pas en dette.

## I. Fast consecutive turns

Aucun plafond. `T-DN01-H` éprouve six tours rapides consécutifs — six appels rapides, zéro escalade —
et scanne le source du pilote pour `MAX_FAST`, `fastTurns`, `tourRapideCount` : aucun.

```
ARBITRARY_FAST_TURN_LIMIT_ADDED = NO
MATERIAL_PROGRESS_CONTRACT_PRESERVED = NOT_APPLICABLE
```

`NOT_APPLICABLE`, et non `YES` : les sorties Fast **distinguent bien** `ASK_ONE_QUESTION` de
`CONTINUE_WITH_DEEP_VALIDATION` — la réutilisation suffit donc pour le trigger, conformément au §5.
Mais aucune sortie Fast ne porte de notion de **progrès matériel** : rien dans `{type, text}` ne dit
si la question précédente a fait avancer quoi que ce soit. `MATERIAL_PROGRESS_REQUIRED` n'est ni
préservé ni violé — il n'est pas représentable dans le contrat Fast actuel. Je ne l'invente pas.

Un garde existant limite néanmoins la boucle sans compter : `adpState.pendingQuestion`. Tant qu'une
question reste ouverte, une candidate suivante est écartée et **le tour escalade** — vérifié en
écrivant `T-DN01-H`, dont la première version échouait pour cette raison précise.

## J. Autorité OPRIE

Inchangée, et éprouvée explicitement par `T-DN01-E` et `T-DN01-F` :

- `lastTurn` et `canonicalContract` restent `null` sur un tour d'ASK — aucun état autoritaire ;
- aucun des six champs de l'Arbitre n'est présent sur la candidate ;
- `authority === 'candidate'`, `lifecycle === null`, `executed === []` ;
- aucun des cinq états OPRIE n'apparaît dans la sérialisation de la candidate.

`T-DN01-G` clôt le raisonnement : au tour suivant, la personne ayant répondu, le plan rapide n'a plus
rien à demander et **l'autorité reprend la main** (`operational_request_ready`). Un dialogue rapide ne
remplace jamais OPRIE : il le précède.

## K. Rapide

Non régressé. `MODE_CONTRACTS.rapide.usesFastPlane/usesDeepPlane` inchangés, `T-MODE01`,
`T-MODE02-29/30`, `T-P04-19/20/23` verts. Divergence documentaire rappelée, non traitée : CDC §15
pose `RAPIDE_DIALOG_LOOP = NONE` alors que `ATELIER-RAPIDE-CONVERSATIONAL-FIX-01` a levé R1 sur
décision propriétaire. **CDC non modifié** (§11). `FOLLOW_UP_ONLY`.

## L. Architecte

Dialogue préservé : `T-MODE03-*` verts (142 tests de mode, 0 échec), une question par tour,
`T-P04-24` vert.

## M. Stale / abort

Gardes instrumentés explicitement :

- `oprieOpenTurn` met fin au tour précédent **à l'ouverture** du suivant — sans quoi un plan profond
  abandonné continuerait de courir pendant que le nouveau tour dialogue ;
- `if(seq!==oprieState.seq)return false` après l'attente rapide ;
- `seq`, `concludedTurn`, `pendingQuestion`, `TURN_STALE`, `IGNORE_STALE`, `AbortController` :
  inchangés.

`STALE/ABORT` : 54 tests, 0 échec. `T-P04-15/16/17/18`, `T-IA03-16`, `T-MODE02-29/30`,
`T-MODE03-16/17` verts.

**Un effet de bord qu'il faut nommer** : `fast_discarded_concluded` devient **inatteignable depuis un
tour normal**, parce que le tour ne peut plus conclure avant que la candidate existe. Le garde reste
dans le code, en défense. Les tests qui l'éprouvaient ont été transformés pour éprouver
l'impossibilité elle-même — qui est plus forte que le garde.

## N. Tests corrigés — couverture transformée, jamais retirée

**Verrous historiques (5) → les invariants produits.** `T-P04-ORDER` (ordre textuel + interdiction
d'attendre le plan rapide) devient `T-P04-TRIGGER-1/2/3/4` : trois comptages d'appels et une
assertion d'ordre inversée. Les trois autres verrous d'ordre source deviennent
`indexOf('await oprieStartFastPlane(') < indexOf('oprieRequestTurn(seq)')` **plus** un comptage
`deepCalls === 0`. `T-MODE01-39/40/41/42` se scinde : ASK → 0, silence → 1, par mode.

**Scénarios « candidate affichée + plan profond » (11).** Leur invariant ne dépendait pas de la
sollicitation ; seule la fixture le supposait. `ORIENT_ARCHITECTE` — affiché **et** non sollicitant —
est désormais la seule forme qui met une candidate à l'écran et laisse l'escalade partir. Fixture
changée, **assertions inchangées** : `T-P04-05`, `-07`, `-12`, `-13`, `-14`, `-28`, `-43`,
`T-IA05-09`, `T-IA02B-05`, `T-IA02B-32`, `T-MODE03-14/15`.

**Scénarios rendus impossibles (5), transformés vers l'impossibilité.** `T-P04-11` (pas de
clignotement), `T-IA05-07`, `T-IA03-17` (candidate tardive), `T-IA04-42`, `T-MODE02-29/30`,
`T-MODE03-16/17`.

**Ce qui n'est plus atteignable depuis le pilote, et où la couverture subsiste.**
`DEEP_CONFIRMS_FAST` exige une candidate sollicitante et un plan profond sur le même tour
(`OPRIE_STATE_TO_INTERACTION` ne mappe que vers `ASK_*`). Il reste éprouvé **là où il vit** : sur le
noyau, dans `tests/fast-interactive-plane-perf03a.test.mjs` — `reconcileFastWithDeep` en direct
(l. 427), `runInteractiveTurn` (l. 353) et l'énumération complète `RECONCILIATION_OUTCOMES` (l. 462).
Vérifié avant de m'appuyer dessus.

**Bornes de tranche (2).** `tests/functional-closure-fc01bfinal.test.mjs` et
`tests/html-surface-final-htmlfinal01.test.mjs` découpaient le HTML sur le littéral
`async function oprieRequestTurn()`, que le paramètre a modifié. Borne mise à jour, tranches non
vacantes (`T-CLEAN05-22`, `T-FC01BFINAL-44` verts).

### Classification des 25 échecs initiaux

| classe | n | traitement |
|---|---|---|
| `TEST_BUG` (harnais incomplet) | — | `clearTimeout` absent du contexte `vm` : **cause de 9 des 25**, corrigée en §E.5 |
| `HISTORICAL_IMPLEMENTATION_CONTRACT` | 5 | remplacés par les invariants de trigger |
| `STALE_FIXTURE` | 11 | fixture `ASK_*` → `ORIENT_ARCHITECTE`, assertions intactes |
| `REAL_INVARIANT` devenu inatteignable | 5 | transformés vers l'impossibilité ; couverture noyau vérifiée |
| `STALE_FIXTURE` (borne de tranche) | 2 | littéral de borne mis à jour |
| `NEW_REGRESSION` | **0** | — |

## O. Tests ajoutés

`tests/fast-deep-trigger-dn01.test.mjs`, 8 tests : `T-DN01-A` (comptages ASK), `-B` (escalade),
`-C` (quatre formes d'échec), `-D` (aucun endpoint rapide), `-E` et `-F` (non-autorité, §10),
`-G` (l'autorité reprend au tour suivant), `-H` (aucun plafond de tours).
Plus `T-P04-TRIGGER-1/2/3/4`. **2985 → 2996 tests.**

## P. Suite globale

```
GLOBAL_RUN_1 = 2996 / 2996 / 0
GLOBAL_RUN_2 = 2996 / 2996 / 0
GLOBAL_RUN_3 = 2996 / 2996 / 0
OPRIE 97/0 · MODE 142/0 · STALE-ABORT 54/0 · RELEASE 20/0 · SECRET 61/0
```

## Q. FROZEN

`PASS` — `{"status": "OK"}`, 7/7 plages gelées conformes. Le correctif ne touche aucune plage gelée.
Rituel d'empreinte exécuté : nouvelle empreinte HTML `f5c15206…bb0b67`, propagée dans les
**15** fichiers de test qui l'épinglent, puis manifeste régénéré par l'outil canonique
(`--tests=2996`, 89 fichiers de release, `nonClasses: []`).

## R. Dette supprimée / créée

```
DEBT_REMOVED =
  le déclenchement réflexe du plan profond (couplage historique inconditionnel) ;
  l'allocation du numéro de tour couplée à l'escalade dans oprieRequestTurn ;
  l'absence de borne de temps sur oprieRequestFastInteraction ;
  l'incomplétude du contexte vm du harnais (clearTimeout).

DEBT_CREATED = aucune.
```

Les trois premières avaient été **révélées** par la tentative précédente et sont fermées ici. Une
seule addition : `FAST_CONTRACT_FAILURE_MS`, valeur citée du contrat gelé, sans laquelle le
fail-closed du §7 ne serait pas atteignable sous le nouveau flot de contrôle.

`FOLLOW_UP_ONLY` : `TECHNICAL_STOP` non implémenté ; `ACKNOWLEDGE` et `ORIENT_ARCHITECTE` hors
contrat CDC §7 ; CDC §15 en retard sur la décision Rapide ; `DEEP_CONFIRMS_FAST` et
`fast_discarded_concluded` inatteignables depuis le pilote.

## S. Régressions préexistantes

`T-HTMLFINAL02-10` (« le compte du jeu de release est juste ») échouait **avant** ce sous-lot :
les commits `770bf94`, `305f544` et `01e08fb` avaient versionné des documents sans régénérer le
manifeste. Vérifié en retirant mon propre fichier non suivi de l'arbre.

Elle est **résolue** ici, non par mélange de causes mais parce que le §17 le prévoit : le changement
de HTML impose une régénération mécanique du manifeste, qui recalcule aussi l'inventaire.

## T. Verdict

Le contrat est restauré. Le plan profond ne part plus pour poser une question que le plan rapide
savait poser en un demi-tour — `ASK_ONE_QUESTION` → 0 appel, `CONTINUE_WITH_DEEP_VALIDATION` → 1,
échec rapide → 1, fail-closed. `IA-04`, `GARDE-FOU §9` et `MD ATELIER §6` sont satisfaits sans
qu'aucune autorité ait bougé : `T-DN01-E/F` prouvent qu'un tour d'ASK ne produit ni état, ni contrat
canonique, ni cycle d'exécution, et `T-DN01-G` que l'autorité reprend la main au tour suivant.

**Une correction que je dois porter sur ma propre tentative précédente.** J'avais conclu `BLOCKED` en
rapportant 25 échecs, dont huit censés encoder une « ratification sur le tour même ». Ce diagnostic
était faux, et sa cause est identifiée : le contexte `vm` du harnais n'exposait pas `clearTimeout`,
donc **chaque appel rapide échouait** et neuf des vingt-cinq échecs n'avaient rien à voir avec le
contrat. Une fois le harnais complété, il restait seize échecs, dont **zéro régression** : cinq
verrous historiques, treize fixtures périmées, cinq scénarios devenus impossibles. Le blocker
n'existait pas. Je ne l'aurais pas découvert sans réexécuter — et j'aurais dû vérifier la complétude
du harnais avant d'accuser le contrat.

Ce qui reste vrai de cette tentative : `DEEP_CONFIRMS_FAST` et `fast_discarded_concluded` deviennent
inatteignables depuis le pilote, parce qu'inverser l'ordre élimine toute course où le plan profond
gagnerait contre le plan rapide. Ce n'est pas une perte de sûreté — ces courses ne peuvent plus se
produire — et la couverture des contrats correspondants subsiste sur le noyau, vérifiée.

Le bénéfice utilisateur est celui que le brief visait : une demande simple reste simple. Sur un tour
où le plan rapide pose une question, aucune chaîne de trois rôles ne part, ne tourne trente à quatre-
vingt-dix secondes, et ne se fait abandonner dès que la personne répond. Le contrat de fluidité
— 1–2 s, p95 ≤ 3 s — reste celui du plan rapide, mesuré à 416–469 ms, et il est désormais le seul en
jeu quand le plan rapide suffit.
