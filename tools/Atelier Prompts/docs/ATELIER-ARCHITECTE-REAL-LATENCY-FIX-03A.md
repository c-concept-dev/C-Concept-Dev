# ATELIER_ARCHITECTE_REAL_LATENCY_FIX_03A

**Sur** — `8737ece` … `5d24e75` (checkpoint bêta)
**Demande réelle mesurée** — « je veux préparer un voyage a malaga fin novembre », mode architecte
**`PRODUCTION_CODE_CHANGED = NO` · `PUSH = NO` · `DEPLOY = NO`**

> Question unique : *où est dépensé le temps entre le clic et le premier résultat exploitable ?*
>
> **Réponse mesurée : 99,5 % dans le plan profond, qui met deux minutes à rendre une question que le
> plan rapide savait poser en 0,6 seconde — et le court-circuit construit pour l'éviter ne se
> déclenche jamais.**

---

## A. Le parcours réellement emprunté

Le message que vous avez vu — « Analyse de votre demande… / Votre demande est en cours d'analyse. »
— vient de `oprieShowAnalysing()`, ligne 21741, appelée par `oprieRunTurn()` ligne 22039. C'est le
pilote OPRIE du parcours d'accueil, **pas** l'onglet Architecte.

Cela oriente toute la mesure : le chemin en cause est Fast → Deep via le Worker déployé, et non
l'exécution des rôles côté client.

---

## B. Mesure — 3 runs, chaîne réelle

Corps de requête identiques à la production (`oprieFastSnapshot` puis `oprieBuildBody`).

| jalon | run 1 | run 2 | run 3 |
|---|---|---|---|
| `T1→T2` plan rapide | **638 ms** | **671 ms** | **407 ms** |
| `fast.type` | `ACKNOWLEDGE` | `ACKNOWLEDGE` | `ACKNOWLEDGE` |
| court-circuit armé ? | **non** | **non** | **non** |
| `T4→T9` plan profond | **117 732 ms** | **115 713 ms** | **122 717 ms** |
| `deep.state` | `clarification_required` | `clarification_required` | `clarification_required` |
| traitement local | **0 ms** | **0 ms** | **0 ms** |
| **total** | **118 370 ms** | **116 384 ms** | **123 124 ms** |

```text
REAL_ARCHITECTE_CALL_GRAPH =

  T0_CLICK
    │
    ├─► POST /fast-interaction      407–671 ms   200   1 tentative   SÉRIEL   BLOCKS_NEXT_STAGE = YES
    │     provider Groq · schéma à deux champs {type,text}
    │     → type = ACKNOWLEDGE  (non sollicitant)
    │     → « D'accord, je prends note de votre souhait de préparer un voyage à Malaga fin novembre. »
    │     → 1D-G le démote en WAIT_FOR_DEEP_VALIDATION : rien n'est affiché à la personne
    │
    └─► POST /operational-request   115 713–122 717 ms   200   1 tentative   SÉRIEL
          │   trois rôles, séquentiels, inconditionnels
          ├── analyst    ≈ 27 604 ms   (mesuré isolément sur /analyst, même demande)
          ├── critic     ┐
          └── arbiter    ┘ ≈ 88 000–95 000 ms  (déduit : total − analyst)
          → state = clarification_required
          → « Combien de jours dure votre séjour à Malaga ? »

  T12_UI_RENDER
```

```text
TOTAL_LATENCY_MS       = 118 370 · 116 384 · 123 124      médiane 118 370
LLM_LATENCY_MS         = 118 370 · 116 384 · 123 124      (100 % du total)
LOCAL_PROCESSING_MS    = 0
WAIT_OR_IDLE_MS        = 0
DOMINANT_STAGE         = plan profond (/operational-request), et dans celui-ci critic + arbiter
DOMINANT_STAGE_SHARE   = 99,5 % du total · critic+arbiter ≈ 76 % du total
```

Aucune attente artificielle, aucun polling, aucune tempo locale : le produit n'ajoute **rien**. Tout
le temps est du temps fournisseur.

---

## C. Ce que j'ai cherché explicitement, et ce que j'ai trouvé

| recherche demandée | résultat mesuré |
|---|---|
| appels LLM séquentiels | **OUI** — 1 rapide puis 1 profond ; dans le profond, 3 rôles enchaînés |
| appels répétés au même contenu | non |
| retries | non sur ces 3 runs (1 tentative chacun) ; `degraded_state` observé 2 fois sur des runs antérieurs |
| timeout/retry silencieux | non |
| fallback provider | non déclenché |
| appels Deep inutiles | **c'est le cœur du sujet** — voir §D |
| Analyst/Critic/Arbiter non exigés par l'état | la séquence est inconditionnelle par contrat |
| double exécution OPRIE | **non** — `T-03A-05` le fige : 1 rapide + au plus 1 profond par tour |
| attente artificielle | non — 0 ms local |
| fetch séquentiel évitable | non — critic dépend d'analyst, arbiter des deux |
| polling | non |
| appel après résultat suffisant | **non prouvable** : le rapide n'a produit aucun résultat suffisant |
| UI bloquée sur un travail non nécessaire au premier affichage | **OUI** — 2 minutes sans progression |

---

## D. `ROOT_CAUSE` — deux artefacts de production qui se contredisent

Le lot 1D-N avait construit exactement le mécanisme qui éviterait ce temps. Il fonctionne :

```javascript
// artefact, oprieRunTurn
if(projected&&FAST_SOLICITING_TYPES.indexOf(projected.type)!==-1){
  oprieMark('deep_not_started',{reason:'FAST_ASK_ONE_QUESTION',type:projected.type});
  return true;                       // le plan profond ne part pas
}
const FAST_SOLICITING_TYPES=Object.freeze(['ASK_CLARIFICATION','ASK_CONFIRMATION']);
```

Il ne se déclenche jamais, parce que le plan rapide ne sollicite jamais :

```javascript
// workers/groq/src/index.js:1179 — FAST_INTERACTION_SYSTEM_PROMPT
"Une information manquante n'appelle pas automatiquement une question : elle peut être recherchée,",
"décidée, estimée, traitée par scénario, conditionnée, ou laissée explicitement inconnue.",
"Demander une précision est le dernier recours, jamais le premier : ne le faites que si aucune de ces voies n'est sûre.",
"Types possibles : ACKNOWLEDGE (accuser réception), ASK_CLARIFICATION (une seule question), …"
```

**Mesuré sur 6 demandes, 6 fois `ACKNOWLEDGE`, 0 fois une sollicitation :**

```text
  546 ms  ACKNOWLEDGE  → escalade   « je veux préparer un voyage a malaga fin novembre »
  391 ms  ACKNOWLEDGE  → escalade   « Aide-moi à préparer une présentation. »
  227 ms  ACKNOWLEDGE  → escalade   « je veux un plan de repas »
  972 ms  ACKNOWLEDGE  → escalade   « fais moi un budget »
  445 ms  ACKNOWLEDGE  → escalade   « Explique la photosynthèse … cinq paragraphes. »
  465 ms  ACKNOWLEDGE  → escalade   « Donne exactement sept idées de cadeaux … »
```

```text
ROOT_CAUSE =
Le plan rapide est explicitement instruit de ne PAS poser de question (« dernier recours, jamais
le premier »), et ACKNOWLEDGE lui est proposé en premier. Il rend donc ACKNOWLEDGE 6/6 — un type
que le CDC §7 n'autorise même pas, et que 1D-G interdit d'afficher. Or la question est la SEULE
sortie qui évite le plan profond. Les deux artefacts s'annulent : le court-circuit existe, est
testé, et ne peut structurellement jamais s'armer. 100 % des tours paient 116–123 s.

Et sur cette demande, le plan profond conclut lui-même clarification_required : la question
était nécessaire. La personne attend deux minutes pour qu'on lui demande combien de jours dure
son séjour.
```

`PRODUCT_LATENCY` = **0 ms** — le produit n'ajoute aucune attente.
`PROVIDER_LATENCY` = **116–123 s** — dont ≈ 27,6 s d'Analyste et ≈ 90 s de Critique + Arbitre.

---

## E. Correction minimale — non appliquée, et pourquoi

L'ordre de préférence du lot a été parcouru, mesure en main :

| # | levier | applicable ? |
|---|---|---|
| 1 | supprimer un appel inutile | **non** — le plan rapide est utile en principe ; le supprimer enterrerait le défaut au lieu de le corriger |
| 2 | éviter un appel dupliqué | **non** — aucun doublon (`T-03A-05`) |
| 3 | rendre conditionnelle une étape non nécessaire | **non prouvable** — le plan profond conclut `clarification_required`, donc son travail n'était pas superflu |
| 4 | paralléliser des étapes indépendantes | **impossible** — critic dépend d'analyst, arbiter des deux |
| 5 | éviter retry/fallback pathologique | **sans objet** — 1 tentative par appel sur ces runs |
| 6 | premier résultat visible avant travail secondaire | **le seul levier réel, et il exige une décision** |

Le levier 6 se réduit à une question de contrat : **le plan rapide doit-il pouvoir poser la
question ?** Aujourd'hui la consigne le lui déconseille. La rendre sollicitante quand la demande
est manifestement incomplète supprimerait 99,5 % du temps sur ce parcours — c'est une modification
d'une seule consigne, à un seul endroit nommé : `workers/groq/src/index.js:1179`.

**Je ne l'ai pas faite, et je vous la remets.** Trois raisons, toutes vérifiables :

1. Elle change **ce que le produit a le droit de dire à chaque tour**, pas un réglage de
   performance. C'est le contrat conversationnel du CDC §7, et l'arc 1D-B → 1D-F avait déjà tranché
   une décision de fournisseur sur exactement ce périmètre.
2. Le §INTERDIT de ce lot exclut le `provider tuning`, et cette consigne vit dans le Worker.
3. La consigne actuelle n'est pas une erreur : elle applique la discipline du GARDE-FOU — *« les
   questions ne sont pas le produit »*, une inconnue peut être décidée, estimée, mise en scénario.
   Le conflit n'est pas entre une bonne et une mauvaise règle, mais entre **deux règles justes** :
   ne pas questionner par réflexe, et ne pas faire attendre deux minutes pour une question.

Trancher cela vous appartient. Les deux options, avec leur coût mesuré :

```text
OPTION A — le plan rapide peut demander quand la demande est manifestement incomplète
  gain     ≈ 117 000 ms → ≈ 600 ms sur ce parcours  (−99,5 %)
  coût     le plan rapide pose parfois une question qu'une estimation aurait pu éviter
  portée   1 consigne, 1 fichier, 1 ligne
  risque   sémantique : il ne décide toujours rien (schéma à deux champs), mais il parle plus tôt

OPTION B — statu quo : seul l'Arbitre peut faire poser une question
  gain     aucun
  coût     116–123 s d'attente sans progression, sur CHAQUE tour, y compris pour une demande
           complète comme « exactement cinq paragraphes »
  portée   nulle
```

---

## F. Avant / après

Aucune correction appliquée : les deux colonnes sont identiques, et c'est le fait à retenir.

| run | `BEFORE_MS` | `AFTER_MS` | `CALL_COUNT_BEFORE` | `CALL_COUNT_AFTER` |
|---|---|---|---|---|
| 1 | 118 370 | 118 370 | 2 (1 rapide + 1 profond) | 2 |
| 2 | 116 384 | 116 384 | 2 | 2 |
| 3 | 123 124 | 123 124 | 2 | 2 |
| **médiane** | **118 370** | **118 370** | **2** | **2** |

---

## G. Un second défaut, distinct, trouvé en route

En mesurant l'onglet Architecte (`archPreparerAvecApi`, qui exécute les rôles côté client via
Anthropic), les trois runs ont échoué en **moins d'une seconde** :

```text
POST api.anthropic.com/v1/messages  →  400
output_config.format.schema: Invalid schema:
Enum value 'logical_contradiction' does not match declared type '['string','null']'
```

Le schéma du rôle Analyste est refusé par l'API : un champ déclaré `['string','null']` porte un
`enum`, ce que l'API valide strictement. `transportAnthropic` ne réessaie que sur 429/5xx, donc un
400 remonte immédiatement et l'onglet affiche « La préparation n'a pas abouti ».

**Ce n'est pas votre symptôme** — c'est un échec rapide, pas une attente — et ce n'est pas le
parcours que vous avez emprunté. Je ne l'ai pas corrigé : le lot interdit l'audit général, et une
correction de schéma de rôle sort de la frontière annoncée. Mais l'onglet Architecte « Préparer avec
API » est, lui, **inutilisable avec Anthropic** en l'état. Consigné comme
`FOLLOW_UP-03A-A`, à traiter dans son propre lot.

---

## H. Tests

`tests/architecte-real-latency-03a.test.mjs` — **5 tests, 5 pass**, sans réseau. Ils figent la
cause technique mesurée, sans dépendre d'aucune limite de latence absolue.

```text
T-03A-01  le court-circuit ne s'arme que sur une sollicitation, et le tour reste adossé à cette liste
T-03A-02  [CARACTÉRISATION — ANOMALIE ATTENDUE À ÉVOLUER] le plan rapide est instruit de ne pas
          demander, alors que demander est la seule sortie qui évite le plan profond
T-03A-03  le plan rapide peut proposer des types que le CDC §7 n'autorise pas (ACKNOWLEDGE,
          ORIENT_ARCHITECTE), et ces types conduisent à l'escalade
T-03A-04  le coût du plan profond est structurel : trois rôles séquentiels inconditionnels,
          aucune parallélisation possible
T-03A-05  un tour n'ouvre qu'une requête profonde — aucun double appel OPRIE
```

`T-03A-02` est étiqueté selon la convention du dépôt : il **doit** échouer le jour où la consigne
change. C'est le signal que la décision a été prise.

Deux méta-tests ont échoué au premier lancement et ont été traités :
`T-CLEAN05-21` — un `.DS_Store` créé par macOS dans le dossier (non suivi, interdit par le test) :
supprimé. `T-CLEAN05-22` / `T-FC01BFINAL-44` — ma borne de tranche `'\nasync function '` était
générique : remplacée par une borne concrète et unique.

```text
TARGETED = 5/5 PASS
GLOBAL   = 3071/3071 PASS
FROZEN   = PASS  (sept empreintes inchangées)
```

---

## I. Mini smoke réel

| cas | total mesuré | appels | prompt final | fidélité | non-invention | contradiction | verdict |
|---|---|---|---|---|---|---|---|
| « voyage à Malaga » | **116–123 s par tour**, puis une question | 2 / tour | non atteint en 1 tour | — | — | — | **FAIL latence** |
| « Aide-moi à préparer une présentation. » | 99,7 · 146,5 · 106,3 s par tour, 6 tours | 2 / tour | OUI | PASS | PASS | aucune | **PASS qualité · FAIL latence** |
| B8 complexe | 68,6 · 72,7 · 72,1 s, 3 tours | 2 / tour | OUI | PASS | PASS | aucune | **PASS qualité · FAIL latence** |

Les verdicts de qualité des cas 2 et 3 sont ceux du lot 02H, mesurés sur les mêmes tours réels et
non rejoués ici : aucune ligne de production n'a changé depuis, donc rien ne pouvait bouger.

**La qualité du prompt n'est pas en cause. C'est le temps pour l'obtenir.**

---

## J. Verdict

Le temps est entièrement fournisseur, et il est dépensé dans un plan profond que le produit possède
déjà les moyens d'éviter. Le mécanisme d'évitement a été construit, testé, et vérifié fonctionnel au
lot 1D-O. Il ne s'arme jamais, parce qu'une consigne écrite ailleurs demande au plan rapide de ne
pas faire la seule chose qui l'armerait.

Je n'ai pas appliqué de correctif. Non par prudence de principe : parce que le seul levier réel
consiste à décider si le plan rapide peut poser une question, et que c'est le contrat
conversationnel du produit — pas un réglage de latence. Le conflit n'oppose pas une erreur à une
règle, mais deux règles justes du GARDE-FOU.

Ce que le lot laisse : la mesure complète, la cause nommée à la ligne près, les deux options
chiffrées, et cinq tests dont un qui vous avertira le jour où la consigne bougera.

```text
SUBLOT = ATELIER_ARCHITECTE_REAL_LATENCY_FIX_03A

ROOT_CAUSE = le plan rapide est instruit de ne pas poser de question (« dernier recours, jamais
             le premier », workers/groq/src/index.js:1179) et rend ACKNOWLEDGE 6/6 ; le
             court-circuit IA-04 ne s'arme que sur ASK_CLARIFICATION / ASK_CONFIRMATION ; donc
             100 % des tours exécutent le plan profond, 116–123 s, pour rendre une question

DOMINANT_STAGE          = plan profond /operational-request  (99,5 %)
                          dont critic + arbiter ≈ 76 % du total, analyst ≈ 23 %

BEFORE_MEDIAN_MS        = 118 370
AFTER_MEDIAN_MS         = 118 370   (aucune correction appliquée — décision requise)
CALL_COUNT_BEFORE       = 2 par tour
CALL_COUNT_AFTER        = 2 par tour

QUALITY_REGRESSION      = NO
B7                      = PASS  (qualité — latence hors qualité)
B8                      = PASS  (qualité — latence hors qualité)
MALAGA_REAL_SMOKE       = FAIL  (latence : 116–123 s pour obtenir une question)

GLOBAL                  = 3071/3071 PASS
FROZEN                  = PASS

PRODUCTION_CODE_CHANGED = NO
PUSH                    = NO
DEPLOY                  = NO

REPORT = docs/ATELIER-ARCHITECTE-REAL-LATENCY-FIX-03A.md

BETA_LATENCY_BLOCKER    = OPEN
LOT_GATE                = NON_GELABLE

NEXT_SAFE_ACTION        = décider si le plan rapide peut poser UNE question quand la demande est
                          manifestement incomplète — une consigne, un fichier, une ligne
                          (workers/groq/src/index.js:1179). C'est la seule cause dominante
                          restante, et elle vaut 99,5 % du temps mesuré.
```
