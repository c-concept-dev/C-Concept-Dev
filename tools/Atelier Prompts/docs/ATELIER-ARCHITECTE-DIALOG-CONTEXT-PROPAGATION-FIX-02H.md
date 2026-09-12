# ATELIER_ARCHITECTE_DIALOG_CONTEXT_PROPAGATION_FIX_02H

**Nature annoncée** — `TARGETED PRODUCTION FIX`
**Nature réelle** — **aucune correction de production n'était nécessaire.** La cause racine décrite
n'existe pas dans le parcours que le produit fait suivre à la personne.
**Sur** — `8737ece`
**`PRODUCTION_CODE_CHANGED = NO` · `PUSH = NO` · `DEPLOY = NO`**

> Principe du lot : *une information obtenue pendant le dialogue ne doit jamais redevenir inconnue
> dans l'analyse Architecte du même tour.*
>
> **Elle ne le redevient pas. Mon smoke avait tort, et voici la preuve.**

---

## A. Baseline

```text
git status --short -- 'tools/Atelier Prompts'   → (vide)
git branch --show-current                       → main
git rev-parse HEAD                              → 8737ece5c9ac37d69280f099b3c9000061b4e80d

8737ece  REAL_PRODUCT_BETA_SMOKE 01
0991365  Update index.js                    ← hors sous-arbre Atelier
be44ee3  Merge branch 'main'
ef644c3  Delete index.js                    ← hors sous-arbre Atelier
f17f5ef  Auto-update index.html [skip ci]   ← hors sous-arbre Atelier
1da2584  Merge branch 'main'
1b77de4  Update studio-clinique.html        ← hors sous-arbre Atelier
003b304  02G (suite) GHOST_SOURCE_REFERENCE
```

Mutation externe du sous-arbre Atelier depuis `003b304` : **aucune**
(`git diff --name-only 003b304 HEAD -- 'tools/Atelier Prompts'` ne rend que mon propre rapport de
smoke). Le propriétaire a poussé du travail ailleurs dans le dépôt.

```text
LOT = ATELIER_ARCHITECTE_DIALOG_CONTEXT_PROPAGATION_FIX_02H

PROBLÈME PRODUIT ANNONCÉ = Architecte repose des questions déjà répondues.

CAUSE RACINE ANNONCÉE = l'analyse Architecte reçoit la demande brute et
                        clarification_history = [].

CONSTAT APRÈS REPRODUCTION = la cause n'est pas celle-là. Le contexte du dialogue atteint
                        bien l'entrée de l'analyse, par une primitive existante. Le défaut
                        observé dans le smoke venait de MON harnais.
```

---

## B. Blocker B7 — ce que le smoke avait rapporté

Le smoke avait livré, pour « Aide-moi à préparer une présentation. » après six échanges, un prompt
contenant à la fois l'objectif acquis et l'ordre de redemander le sujet :

```text
## OBJECTIF            … bilan annuel d'activité de service … à la direction en 15 minutes
## Questionner sur le sujet    Demandez à l'utilisateur : "Quel est le sujet … ?"
## VÉRIFICATION        - Le sujet de la présentation doit être connu …
```

Ce prompt a réellement été produit. Ce qui était faux, c'est la conclusion que j'en ai tirée sur sa
cause — et donc sur le produit.

---

## C. Cause racine — réfutée, avec la preuve

### C.1 — Ce que j'avais tracé

```javascript
// ligne 7508, sélecteur de parcours de la page d'accueil
const demande = $('#accueil-demande').value.trim();
$('#arch-demande').value = demande;

// archPreparerAvecApi
runOprieTurnWithExecutor({ original_request: c.demande, clarification_history: [] })
```

J'en avais conclu que l'analyse ne voyait jamais les réponses. **Je n'avais pas tracé tous les
écrivains de `#arch-demande`.**

### C.2 — Ce que le produit fait réellement

```javascript
// ligne 10522
function compositeDemand(){
  const d=$('#v11-demande').value.trim();
  if(!state.answers.length)return d;
  return d+'\n\nPrécisions apportées pendant le dialogue :\n'
          +state.answers.map((a,i)=>'- '+a.question+' — Réponse : '+a.answer).join('\n');
}

// ligne 10531
function syncLegacy(){
  const demande=compositeDemand();
  const materiau=materialText();
  const a=$('#arch-demande'),m=$('#arch-materiau');
  if(a){a.value=demande;a.dispatchEvent(new Event('input',{bubbles:true}))}
  if(m){m.value=materiau;m.dispatchEvent(new Event('input',{bubbles:true}))}
}
```

`syncLegacy()` est appelée à **cinq** endroits, dont les deux qui comptent :

```text
ligne 10735   answerQuestion()      juste après state.answers.push(...)
                                    → à CHAQUE réponse, #arch-demande est réécrit
ligne 10456   beginApiAnalysis()    juste avant window.__ARCHITECTE_V10__
                                    → avant CHAQUE analyse lancée depuis le parcours
```

`archContexte()` lit `#arch-demande`. **L'analyse reçoit donc la demande initiale suivie de
« Précisions apportées pendant le dialogue : » et de chaque question avec sa réponse.**

### C.3 — La mesure qui tranche

Même tour d'Arbitre réel, même analyse réelle, deux entrées :

| entrée de l'analyse | `action_recommandee` | `questions_a_poser` | `informations_manquantes` | prompt |
|---|---|---|---|---|
| demande brute, 37 o — *ce que mon smoke avait fourni* | `questionner` | 1 | 3 | reposait le sujet |
| `compositeDemand()`, 2 359 o — *ce que le produit fournit* | **`continuer`** | **0** | **0** | **ne repose rien** |

```text
CONTEXT_PRESENT_BEFORE = oui, dans state.answers puis dans #arch-demande
CONTEXT_LOST_AT        = nulle part dans le produit — perdu dans MON harnais de smoke
CONTEXT_ABSENT_AFTER   = sans objet
```

---

## D. État conversationnel existant

```text
AUTHORITATIVE_DIALOG_HISTORY_SOURCE = state.answers  (ligne 10426), unique, alimentée par
                                      answerQuestion() et remise à zéro par resetAll()
AUTHORITATIVE_CANONICAL_SOURCE      = le tour OPRIE READY → mapOprieToCanonicalContract
ARCH_ANALYSIS_CURRENT_SOURCE        = #arch-demande, écrit par syncLegacy() depuis
                                      compositeDemand()
```

Aucune source nouvelle n'était nécessaire, et aucune n'a été créée.

---

## E. Point de perte — dans mon harnais, pas dans le produit

```text
/tmp/beta/arch.mjs (smoke)   contexte = { demande: d.demande, … }
                             → la demande BRUTE, parce que j'avais raisonné depuis la ligne 7508

production                   contexte = archContexte() = { demande: #arch-demande, … }
                             → le composite, réécrit à chaque réponse
```

J'avais même vu le symptôme sans le comprendre : mon **premier** passage Architecte du smoke
transmettait, lui, la demande enrichie — et les deux analyses avaient été refusées pour
« Citation introuvable dans la source utilisateur : à la direction ». J'ai alors « corrigé » mon
harnais **dans le mauvais sens**, en alignant l'analyse sur la demande brute, alors que le refus
disait exactement l'inverse : le validateur cherchait ces citations parce que l'entrée de l'analyse
est censée les contenir.

C'est la deuxième fois dans cette session qu'une conclusion tirée d'un seul chemin de code sans
tracer tous ses appelants m'a conduit à une affirmation fausse — la première étant les extensions
V11.1/V11.2 de `ARCH_SCHEMA`. Le remède est le même : suivre les appelants avant de conclure.

---

## F. Correction minimale

**Aucune.** Le §5 du lot impose l'ordre de préférence
`EXISTING CLARIFICATION HISTORY > EXISTING CANONICAL CONTEXT > EXISTING RUNTIME STATE > ADD NEW
REPRESENTATION`. La première option existe déjà, fonctionne, et est celle que le produit emploie.

Modifier `archPreparerAvecApi` pour y passer un `clarification_history` structuré aurait été une
correction **sans défaut à corriger** : le contexte est déjà présent, porté dans `original_request`
par une section explicitement intitulée « Précisions apportées pendant le dialogue ». Le §6 demande
de prouver que la concaténation est le contrat officiel du système avant de l'accepter : elle l'est,
elle est nommée, et elle est appelée à chaque réponse.

Ce que j'ai fait à la place — et c'est le seul manque réel :

**J'ai écrit les tests qui manquaient.** Le trou est structurel et explique tout :

```javascript
// tests/perf04-frontend-harness.helper.mjs:206
syncLegacy: () => {},
```

Le harnais de test **neutralise** la fonction qui porte tout le contexte conversationnel vers
l'Architecte, et aucun test ne chargeait `compositeDemand`. Sur 3 058 tests, **zéro** assertion ne
touchait cette propagation. C'est ce qui l'a rendue invisible — à moi, et à quiconque relirait le
code par le seul chemin du sélecteur de parcours.

---

## G. Clarification history

`state.answers` est la source unique. Chaque entrée est `{question, answer}` ; `compositeDemand()`
la rend sous une forme lisible et attribuée. Aucune seconde histoire n'a été créée. `T-02H-01` et
`T-02H-02` figent la propagation ; `T-02H-07` figent son déclencheur.

---

## H. Architecte analysis

Après propagation réelle, sur le cas B7, l'analyse ne rouvre **rien** :

```text
action_recommandee        = continuer
questions_a_poser         = []
informations_manquantes   = []
validation                = 0 erreur
composants retenus        Calibrage temporel strict · Public cible : direction ·
                          Nature du bilan : activité uniquement · Trame générique à compléter ·
                          Structure en diapositives titre + contenu ·
                          Sections standards du bilan d'activité ·
                          Suggestions de contenu génériques et transposables ·
                          Vérification du calibrage temporel ·
                          Contrôle d'absence de données inventées
```

```text
RESOLVED_INFORMATION_REOPENED = NO
```

---

## I. Canonical authority

Rien n'a été touché : ni OPRIE, ni l'Arbitre, ni le contrat canonique, ni les schémas Architecte,
ni le Prompt Contract Gate, ni Fast/Deep.

`T-02H-06` établit par lecture du code que `syncLegacy` n'écrit que dans deux champs —
`#arch-demande` et `#arch-materiau` — et dans aucun champ sous autorité OPRIE ou canonique.

```text
OPRIE_AUTHORITY_CHANGED             = NO
CANONICAL_AUTHORITY_CHANGED         = NO
ARCHITECTE_SECOND_AUTHORITY_CREATED = NO
```

---

## J. Non-répétition

Le prompt B7 livré sous le parcours réel ne contient **aucune** formulation redemandant le sujet, le
public ou la durée. La seule occurrence de « quel sujet » se trouve dans la section
`## DEMANDE ORIGINALE`, qui reprend la transcription du dialogue — **la question accompagnée de sa
réponse**. Ce n'est pas une question posée, c'est un compte rendu.

```text
FINAL_PROMPT_REASKS_RESOLVED_FIELDS = NO
```

---

## K. Remaining unknowns

La propagation ne transporte **que** ce qui a été répondu : `T-02H-03` vérifie qu'une réponse donnée
produit une ligne, et qu'aucune réponse non donnée n'apparaît. Rien n'est comblé d'office, donc
l'Architecte reste libre de signaler ce qui manque encore. La correction ne s'est pas transformée en
« ne plus jamais rien demander après un dialogue » — il n'y a d'ailleurs pas eu de correction.

---

## L. Stale protection

`resetAll()` (ligne 10745) exécute `state.docs=[];state.answers=[];state.exchangeId=null;`.
`state.answers` étant la source unique de l'historique, une nouvelle demande le vide et les réponses
d'une conversation antérieure ne peuvent pas atteindre la suivante. `T-02H-05` éprouve les deux
moitiés : la remise à zéro dans le code, et l'absence de fuite après remise à zéro.

```text
STALE_CLARIFICATION_LEAK = NO
```

---

## M. B7 — rejoué sous le parcours réel · **PASS**

15 221 octets, 22 sections, validation 0 erreur.

```text
## OBJECTIF
Préparer une trame de présentation générique pour un bilan annuel d'activité de service,
destinée à être présentée à la direction en 15 minutes

## FORMAT DE SORTIE
- Quantité : minimum 10 ; maximum 14 diapositives
- Ton : Professionnel, synthétique, orienté direction …

## Public cible : direction
Adapter le ton, le niveau de détail et la hiérarchie des messages au public direction …

## Nature du bilan : activité uniquement
… Exclure strictement les aspects financiers détaillés, comptables ou budgétaires …

## Contrôle d'absence de données inventées
Vérifier systématiquement avant livraison que la trame ne contient aucune :
- Donnée chiffrée spécifique présentée comme réelle …
- Nom de projet, d'initiative, de partenaire … présenté comme existant …
```

Les quatre informations acquises — sujet, public, durée, forme — sont toutes utilisées. L'estimation
« 10-12 diapositives » est étiquetée **hypothèse** dans `PROVENANCE DES AFFIRMATIONS`. Le contrôle
d'absence de données inventées est remarquablement adapté à une trame générique.

`FIDELITY = PASS` · `NON_INVENTION = PASS` · `NO_CONTRADICTION = PASS` ·
`CONSTRAINTS = PASS` · `USABILITY = PASS`

**Réserve mineure** : trois bornes voisines coexistent — `Quantité : minimum 10 ; maximum 14`,
l'obligation « 8 à 14 diapositives » et la recommandation « 10-12 ». L'obligation autorise 8 là où
la ligne de quantité l'interdit. Elles viennent de l'analyse (`livrable.quantites` vs
`criteres_bloquants`), pas de la propagation. Sans effet sur l'exécutabilité ; consigné.

---

## N. B8 — non-régression · **PASS**

Rejoué sous le même parcours réel : 18 708 octets, 22 sections, validation 0 erreur,
`action = continuer`, `questions_a_poser = []`, `informations_manquantes = []`.

```text
occurrences interrogatives dans le prompt : 0   → aucune clarification inutile fabriquée
```

Toutes les contraintes sont conservées : trois stratégies, les cinq dimensions, la recommandation
finale argumentée, le contexte « petite entreprise », et la réponse « (A) prompt autonome » rendue
par « immédiatement soumissible sans modification ». La non-invention ne régresse pas — et
s'améliore même : les affirmations réellement soutenues par le dialogue sont désormais étiquetées
**« soutenue »** au lieu de « non vérifiée ».

La confirmation de délégation que j'avais validée est transportée dans la transcription.

---

## O. Rapide — non-régression · **PASS**

Aucune ligne de production n'a été modifiée. Vérifié plutôt que supposé : B3 (matériau fourni) et
B4 (quantité) réassemblés et comparés aux prompts du smoke.

```text
B3 : IDENTIQUE octet pour octet
B4 : IDENTIQUE octet pour octet
```

```text
RAPIDE_NON_REGRESSION = PASS
```

---

## P. Tests ciblés

`tests/architecte-dialog-context-02h.test.mjs` — **8 tests, 8 pass**, sans réseau. Ils chargent
`compositeDemand`, `syncLegacy` et `answerQuestion` **telles qu'écrites en production**, avec leurs
seules dépendances remplacées.

```text
T-02H-01  les réponses du dialogue atteignent l'entrée de l'analyse Architecte
T-02H-02  une information résolue figure dans l'entrée de l'analyse  (générique, 3 champs)
T-02H-03  la propagation n'ajoute que ce qui a été répondu
T-02H-04  sans réponse, l'entrée est la demande seule — aucun en-tête ajouté
T-02H-05  aucune fuite d'un dialogue antérieur — resetAll vide l'unique source
T-02H-06  syncLegacy n'écrit que la demande et le matériau — aucune autorité déplacée
T-02H-07  répondre à une question déclenche la propagation, APRÈS l'entrée dans l'historique
T-02H-08  B7 — sujet, public, durée et forme acquis atteignent tous l'analyse
```

Correspondance avec les noms demandés : `T-02H-01` et `T-02H-02` couvrent les §10 et §11 ;
`T-02H-03` le §12 ; `T-02H-04`/`05` le §13 ; `T-02H-06` le §8 ; `T-02H-07` le maillon que le smoke
avait manqué ; `T-02H-08` le §9. Les deux derniers noms du §17 — non-régression B8 et Rapide — sont
établis par les §N et §O, par exécution réelle : un test unitaire ne pouvait pas les couvrir sans
figer une sortie de modèle.

**`T-02H-07` est le test qui aurait empêché mon erreur.** Il observe que `answerQuestion` appelle
`syncLegacy()` exactement une fois, après que la réponse soit entrée dans l'historique — le maillon
que le stub du harnais rendait invisible.

---

## Q. Global

```text
GLOBAL = 3066 / 3066 pass / 0 fail
```

Un seul échec au premier lancement : `T-HTMLFINAL02-10`, le manifeste, parce que le nombre de tests
passait de 3 058 à 3 066. Manifeste régénéré. Aucun échec comportemental.

---

## R. FROZEN

`PASS`, sept empreintes **inchangées** — attendu, puisque l'artefact n'a pas été touché.

```text
moteur Rapide · moteur Architecte · moteur Atelier · FORMATS · VERROUS · ARCH_SYSTEM · ARCH_SCHEMA
```

---

## S. Mini smoke final

Quatre cas, chaîne réelle, sous le parcours que le produit fait suivre.

| cas | mode | fidélité | non-invention | contradiction | contraintes | utilisabilité | verdict |
|---|---|---|---|---|---|---|---|
| **B7** | Architecte après dialogue | ✓ | ✓ | aucune | ✓ | ✓ | **PASS** |
| **B8** | Architecte complexe | ✓ | ✓ | aucune | ✓ | ✓ | **PASS** |
| **B4** | Rapide quantité | ✓ | ✓ | aucune | ✓ | ✓ | **PASS** |
| **B3** | Rapide matériau | ✓ | ✓ | aucune | ✓ | ✓ | **PASS** |

```text
MINI_SMOKE_PASS = 4/4
UNSUPPORTED_ASSERTIONS = 0
SELF_CONTRADICTIONS = 0
BETA_BLOCKER = CLOSED
```

---

## T. Verdict

Il n'y avait rien à corriger dans le produit. Le contexte du dialogue atteint l'analyse Architecte
par `compositeDemand()` et `syncLegacy()`, appelées à chaque réponse, et le prompt B7 rejoué sous ce
parcours utilise les quatre informations acquises sans en redemander aucune.

Le blocker que j'ai rapporté au smoke était une erreur de ma part. Elle avait une cause précise :
j'ai raisonné depuis le sélecteur de parcours de la page d'accueil sans tracer les autres écrivains
de `#arch-demande`. Et j'avais sous les yeux le signal qui la contredisait — un refus de validation
pour citations introuvables — que j'ai interprété à l'envers, en alignant mon harnais sur la demande
brute alors que ce refus disait que l'entrée devait contenir le dialogue.

Ce que le lot laisse derrière lui n'est donc pas un correctif, mais huit tests qui rendent cette
propagation visible et la protègent. Le trou était réel : le harnais de test remplaçait `syncLegacy`
par une fonction vide, et sur 3 058 tests, aucun ne touchait la primitive qui porte tout le contexte
conversationnel vers l'Architecte.

Le blocker bêta est fermé. Le produit est essayable dans les deux modes.

### Verdict formel

```text
SUBLOT = ATELIER_ARCHITECTE_DIALOG_CONTEXT_PROPAGATION_FIX_02H

ROOT_CAUSE_FIXED                              = NO — aucune cause de production à corriger ;
                                                la propagation existait et fonctionnait
AUTHORITATIVE_DIALOG_HISTORY_SOURCE           = state.answers → compositeDemand() → syncLegacy()
                                                → #arch-demande → archContexte()

ARCH_ANALYSIS_RECEIVES_CLARIFICATION_HISTORY  = YES  (transportée dans original_request, sous une
                                                section nommée « Précisions apportées pendant le
                                                dialogue » — contrat officiel, non une
                                                concaténation naïve)
ARCH_ANALYSIS_RECEIVES_CURRENT_CONVERSATION_STATE = YES

RESOLVED_INFORMATION_REOPENED                 = NO
FINAL_PROMPT_REASKS_RESOLVED_FIELDS           = NO

OPRIE_AUTHORITY_CHANGED                       = NO
CANONICAL_AUTHORITY_CHANGED                   = NO
ARCHITECTE_SECOND_AUTHORITY_CREATED           = NO
STALE_CLARIFICATION_LEAK                      = NO

B7                                            = PASS
B8                                            = PASS
RAPIDE_NON_REGRESSION                         = PASS  (B3 et B4 identiques octet pour octet)

MINI_SMOKE_CASES                              = 4/4
MINI_SMOKE_PASS                               = 4/4

UNSUPPORTED_ASSERTIONS                        = 0
SELF_CONTRADICTIONS                           = 0

TARGETED_TESTS                                = 8/8 PASS
GLOBAL_TESTS                                  = 3066/3066 PASS
FROZEN                                        = PASS

NEW_COMPONENT_CREATED                         = NO
NEW_ARCHITECTURE_CREATED                      = NO
PROMPT_SCHEMA_CHANGED                         = NO
FAST_DEEP_CHANGED                             = NO

PRODUCTION_CODE_CHANGED                       = NO
PUSH                                          = NO
DEPLOY                                        = NO

REPORT = docs/ATELIER-ARCHITECTE-DIALOG-CONTEXT-PROPAGATION-FIX-02H.md

LOT_GATE                                      = GELABLE
BETA_BLOCKER                                  = CLOSED

NEXT_SAFE_ACTION                              = OWNER_BETA_TRIAL
```
