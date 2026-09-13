# ATELIER-SINGLE-DELIVERED-PROMPT-GATE-FIX-02B

**Lot :** `ATELIER_SINGLE_DELIVERED_PROMPT_GATE_FIX_02B`
**Nature :** correctif ciblé — **aucun code de production modifié, et c'est le résultat de la mesure.**

**Le résultat qui reformule le lot.** L'invariant demandé — un seul prompt par tour, celui qui est
contrôlé étant celui qui est livré — **tient déjà sur le chemin gouverné**, et je l'ai mesuré :
`8/8` d'identité d'octets, gate `PASS`, verrous inchangés par la fusion. Les `0/8` de 02A avaient été
mesurés **sans contrat canonique** — la seule branche où le gate ne tourne pas du tout. J'ai figé
l'invariant par sept tests, et j'ai caractérisé le défaut réellement atteignable, qui est un autre :
un contrat canonique **refusé** n'arrête pas le tour.

---

## A. Baseline

```
git status --short -- 'tools/Atelier Prompts'  → ?? docs/…REAL-SMOKE-01.md · ?? docs/…E2E-CONFORMANCE-02A.md
git branch --show-current                      → main
git rev-parse HEAD                             → 51ecbfb97d95fae5b73cbcfde97ead07ec3337d4
git log -5  → 51ecbfb / e6d1371 (1D-N) / 01e08fb / 7f3f245 / 305f544
```

```
LOT = ATELIER_SINGLE_DELIVERED_PROMPT_GATE_FIX_02B
PROBLÈME PRODUIT ANNONCÉ = le prompt livré n'est pas celui contrôlé
CAUSE RACINE ANNONCÉE    = réassemblage post-gate dans adpRunRapide
BÉNÉFICE ATTENDU         = le contrôle porte sur le prompt réellement reçu
PLUS PETITE CORRECTION   = supprimer ou déplacer le second assemblage
```

## B. Rappel 02A

02A avait mesuré `0/8` d'identité entre prompt contrôlé et prompt livré, et conclu que le gate
contrôlait un artefact jamais livré. Le rapport 02A signalait explicitement la portée de sa mesure —
« mes huit exécutions ont été lancées **sans contrat canonique** (`orientation.canonical = null`) […]
Pour la branche canonique, je n'ai **pas** exécuté ». Ce lot a commencé par exécuter cette branche.

## C. Double assemblage avant correction

```
ASSEMBLY_1  = atelier-prompts-v11.5-lot10g-decision-provider.html
              function assemblerRapideAdaptatif()        ← PLAGE GELÉE « moteur Rapide »
              blocs = assemblerAnnote(ctx, actifs) ; prompt = blocs joints

GATE        = même fonction, immédiatement après
              if(p){ verdict = rapideControleQg(p.contract, prompt, locks, trace)
                     if(verdict.status==='FAIL'){ signaler(...) ; return null } }
              ◀── le gate ne tourne QUE si p existe, c'est-à-dire si un contrat canonique existe

LOCK_MUTATION_AFTER_GATE = HTML, function adpRunRapide(demande,materiau,orientation)   (~21867)
              refined    = adnRefineRapidEnvelope(r, orientation, materiau)
              projection = adnRuntime().projectToRapide(refined, …)
              actifs     = adnMergeLegacyLocks(r.actifs, projection)        ← union stricte

ASSEMBLY_2  = même fonction, ligne suivante
              if(typeof assembler==='function' && JSON.stringify(actifs)!==JSON.stringify(r.actifs)){
                r.actifs = actifs ; r.prompt = assembler(r.ctx, actifs) }
              ◀── CONDITIONNÉE au changement de verrous

DELIVERY    = adpRunRapide (suite) ; et copierRapideAdaptatif() pour la copie directe
```

Graphe réel :

```
contexte + (contrat canonique | rien)
 └─ verrous A
 └─ prompt A
 └─ gate        (si et seulement si contrat canonique)
 └─ verrous B = union(A, projection ADN)
 └─ si B ≠ A : prompt B                ← sinon prompt A survit intact
 └─ livraison
```

**`assemblerRapideAdaptatif` est dans une plage gelée** (`['function assemblerRapideAdaptatif(){',
'async function copierRapideAdaptatif']`, `tools/frozen-guard.mjs:12-15`). Toute correction devait
donc vivre dans `adpRunRapide`.

## D. Choix de correction

### La mesure qui a précédé le choix

Le lot demandait d'évaluer Option A (un seul assemblage) contre Option B (gater après le dernier
assemblage), avec préférence A. Avant de choisir, j'ai mesuré la branche que 02A n'avait pas
exécutée : le chemin gouverné **avec** contrat canonique, construit par le mapper de production
(`canonicalFrom(oprieReadyTurn(...))`, harnais `post-oprie-validation-harness.helper.mjs`).

| cas | `r.canonical` | `r.qg` | verrous A | verrous ADN | verrous B | A ≡ B | prompt A ≡ prompt B |
|---|---|---|---|---|---|---|---|
| R03 | présent | **PASS** | `role,format,interdits,controle` | identiques | identiques | **oui** | **oui** |
| R06 | présent | **PASS** | `role,interdits,controle` | identiques | identiques | **oui** | **oui** |
| R11 | présent | **PASS** | `role,format,interdits,controle` | identiques | identiques | **oui** | **oui** |
| R05, R01, R07, R13, R14 | présent | PASS | — | — | — | oui | **oui** |

**8/8.** La raison est lisible dans le code :

```js
// adnRefineRapidEnvelope
if(r.canonical&&r.canonical.envelope)return r.canonical.envelope;
```

Quand un contrat canonique existe, l'affinage **réutilise l'enveloppe que le moteur a déjà
construite**. La projection ADN dérive donc du même contrat que les verrous déjà posés, l'union est un
**no-op**, la condition `JSON.stringify(actifs)!==JSON.stringify(r.actifs)` est fausse, et
`ASSEMBLY_2` **ne se déclenche jamais**.

### Conséquence sur le choix

- **Option A** — supprimer `ASSEMBLY_2`. Elle est déjà inopérante sur le chemin gouverné avec
  contrat : la supprimer n'y change rien. Sur le chemin **sans** contrat, la supprimer changerait le
  jeu de verrous effectivement livré — c'est-à-dire l'effet de `adnMergeLegacyLocks`, que le §4 de ce
  lot interdit de toucher (« ne modifie pas adnMergeLegacyLocks semantic policy »).
- **Option B** — gater après le dernier assemblage. Sur le chemin gouverné avec contrat, le gate
  gate déjà l'artefact livré : un second appel serait un **doublon permanent**, que le §14 qualifie
  explicitement de dette (« Si la correction ajoute un second gate permanent alors qu'un seul prompt
  pourrait suffire : DEBT_CREATED = YES → reconsidérer la solution »). Sur le chemin **sans**
  contrat, le gate ne peut pas tourner du tout : `rapideControleQg(p.contract, …)` exige `p`.

**Aucune des deux options ne corrige quoi que ce soit d'atteignable sans sortir du périmètre.** Le
correctif retenu est donc : **figer l'invariant par des tests**, et caractériser le défaut réellement
atteignable — qui est ailleurs (§K).

Je n'ai pas modifié la production. Le §« VERDICT FINAL » du lot attendait
`PRODUCTION_CODE_CHANGED = YES` ; je rends `NO`, et la mesure ci-dessus est la raison.

## E. Flux après correction

Inchangé — c'est le point. Ce qui change est qu'il est désormais **opposable** :

```
contrat canonique valide
 └─ verrous canoniques
 └─ UN prompt
 └─ gate → PASS ou refus fail-closed
 └─ livraison du MÊME prompt        ← T-02B-02 / T-02B-06, 8/8, identité d'octets
```

## F. Artefact autoritatif

```
AUTHORITATIVE_PROMPT_COUNT_PER_TURN = 1        (chemin gouverné avec contrat)
```

Éprouvé deux fois, par deux voies indépendantes : `T-02B-01` compare les jeux de verrous
(`deepEqual(mergedLocks, legacyLocks)` sur 8 cas — donc `ASSEMBLY_2` ne peut pas se déclencher) et
`T-02B-03` compte les occurrences d'assemblage dans la source de `adpRunRapide` (**exactement une**,
conditionnée, et rien après elle).

## G. Gate

Le gate tourne réellement : `r.qg === 'PASS'` sur 8/8 — ce n'est pas une inférence, c'est le champ
que l'assembleur rend. Et il est fail-closed, vérifié dans la source par `T-02B-04` sur trois
maillons :

```js
if(verdict.status==='FAIL'){signaler(verdict.public_message||QG_MESSAGE_INDISPONIBLE,'alerte');return null}
const r=assemblerRapideAdaptatif();if(!r)return false          // chemin gouverné
const r=assemblerRapideAdaptatif();if(!r)return                // copie directe
```

```
GATE_FAILURE_BLOCKS_DELIVERY = YES
```

## H. Livraison

Le prompt livré est `r.prompt`, celui qu'a produit `ASSEMBLY_1` et qu'a contrôlé le gate. `T-02B-05`
vérifie en plus que la demande originale y figure **mot pour mot** sur 8/8.

## I. Identité gate/livraison

```
PROMPT_GATED_EQUALS_PROMPT_DELIVERED = YES
```

`strictEqual(promptFinal, promptLegacy)` — identité d'octets, pas équivalence sémantique — sur les
huit cas, avec `r.qg === 'PASS'` exigé dans la même assertion.

## J. Corpus 8 cas

| cas | verrous canoniques | `qté` demande | `CONTRAINTES QUANTIFIÉES` | car. livrés | empreinte gaté = livré |
|---|---|---|---|---|---|
| R05 | role, interdits, controle | 45 min | **NON** | 1 263 | **oui** |
| R01 | role, format, **volume**, interdits, controle | 20 pts | **OUI** | 1 496 | **oui** |
| R07 | role, format, interdits, controle | 300 km | **NON** | 1 389 | **oui** |
| R11 | role, donnees, provenance, format, interdits, controle | — | NON | 2 263 | **oui** |
| R03 | role, format, interdits, controle | cinq § | **NON** | 1 481 | **oui** |
| R13 | role, donnees, provenance, format, interdits, controle | — | NON | 2 206 | **oui** |
| R14 | role, interdits, controle | trois, 15 % | **NON** | 1 286 | **oui** |
| R06 | role, interdits, controle | dix, 8 mots | **NON** | 1 262 | **oui** |

```
CORPUS_IDENTITY = 8/8
```

## K. Défaut #2 — observation

**Absent du chemin gaté.** Comparaison directe, mêmes huit cas :

| | sans contrat canonique (02A) | avec contrat canonique (ici) |
|---|---|---|
| verrous livrés | 7 à 12 | **3 à 6** |
| prompt livré | 1 997 à 3 587 car. | **1 262 à 2 263 car.** |
| R03 (21 mots) | 2 026 car., 7 verrous | **1 481 car., 4 verrous** |

La sur-contrainte que 02A avait mesurée — `role, amorce, longueur, controle` ajoutés par la fusion —
**n'existe pas** quand un contrat canonique gouverne la sélection. L'union `adnMergeLegacyLocks` ne
peut rien ajouter parce qu'elle reçoit deux fois le même jeu.

```
DEFECT_2_NOW_DETECTED_BY_GATE = NO — parce qu'il ne se produit pas sur le chemin gaté.
```

C'est une correction nette de 02A : le défaut #2 était un artefact de la branche non canonique.

## L. Défaut #3 — observation

**Persiste, et le gate passe quand même.** Cinq cas sur huit portent une quantité explicite dans la
demande sans obtenir le verrou `volume` ni la section `CONTRAINTES QUANTIFIÉES` — R05 (45 minutes),
R07 (300 km), R03 (cinq paragraphes), R14 (trois scénarios, 15 %), R06 (dix slogans, huit mots) — et
`r.qg === 'PASS'` sur les cinq.

```
DEFECT_3_NOW_DETECTED_BY_GATE = NO
```

`QUANTITY_MISMATCH` n'est pas déclenché. L'explication la plus probable est que le contrat canonique
ne porte **aucune** quantité à faire respecter : on ne peut pas signaler un écart à une exigence qui
n'existe pas. Cela déplacerait la cause du défaut #3 **en amont du gate** — dans la capture des
quantités par le contrat, non dans son contrôle.

**Mais je ne peux pas le prouver ici**, et je ne l'affirme pas : mon contrat canonique provient de
`oprieReadyTurn()`, une **fixture** générique, non d'une sortie d'Arbitre réelle par cas. Un Arbitre
réel sur R06 pourrait renseigner `quantities`. L'attribution — contrat ou gate — est donc
`NOT_PROVEN`, et c'est exactement la question que le lot suivant doit trancher.

## M. Rapide

Seul mode touché par l'analyse. Aucune modification. `tests/rapide-*` : **180 tests, 0 échec.**

`ARCHITECTE_TOUCHED = NO`. Une asymétrie relevée au passage, `FOLLOW_UP` : le constructeur de contrat
Architecte **refuse techniquement** un contrat invalide —

```js
// core/adn/oprie-manual-roundtrip.js:239  (buildArchitecteContractFromTurn)
return refuse('technical', `Contrat canonique refusé : ${(verdict && verdict.problems || []).join(' · ')}`);
```

— là où `oprieBuildCanonicalContract`, utilisé par `oprieEnterExecution` pour **les deux** routes,
rend `null` avec un simple `console.warn`. Voir §S.

## N. Non-régression

| invariant | vérification |
|---|---|
| demande originale préservée | `T-02B-05`, 8/8, mot pour mot |
| matériau préservé | sections `DONNÉES SOURCES` + `PROVENANCE` sur R11, R13 |
| destinataire, périmètre, contraintes explicites | conservés (mesure 02A, inchangée) |
| aucune invention | aucune |
| même mode, même routage, même contrat canonique | aucun code touché |
| politique de verrous | `adnMergeLegacyLocks` **inchangée** |

## O. Tests ciblés

`tests/single-delivered-prompt-02b.test.mjs` — **7 tests, 0 échec** :

| test | ce qu'il fige |
|---|---|
| `T-02B-01` | un seul prompt autoritaire : la fusion rend le même jeu de verrous, donc `ASSEMBLY_2` ne peut se déclencher |
| `T-02B-02` | `strictEqual(livré, gaté)` **et** `qg === 'PASS'` — identité d'octets |
| `T-02B-03` | exactement **une** réassemblage dans la source, conditionnée, et rien après |
| `T-02B-04` | fail-closed sur les trois maillons : gate → assembleur → chemin gouverné et copie directe |
| `T-02B-05` | la demande canonique atteint le prompt final |
| `T-02B-06` | identité sur les 8 cas du corpus 02A |
| `T-02B-07` | **caractérisation** du défaut ouvert : un contrat refusé n'arrête pas le tour |

Deux corrections que j'ai dû faire sur mes propres tests, signalées : une tranche de source ouverte
sur la mauvaise déclaration (`async function adpRunRapide` au lieu de `function adpRunRapide(`), et
une borne littérale `'\nfunction v11StartAtelier'` que les méta-tests `T-CLEAN05-22` /
`T-FC01BFINAL-44` refusent à juste titre — ils exigent que toute borne de tranche existe telle quelle
dans le produit.

## P. Tests globaux

```
GLOBAL = 3003 / 3003 / 0        (2996 → 3003, +7)
tests ciblés 02B       7/0
tests Rapide         180/0
Prompt Contract Gate  79/0
```

Classification des deux échecs rencontrés en cours de route : `TEST_BUG` × 2, tous deux dans **mon**
fichier de test, corrigés. `NEW_REGRESSION = 0`.

## Q. FROZEN

`PASS` — `{"status": "OK"}`, 7/7 plages gelées conformes. Aucun octet de production modifié, donc
aucune empreinte déplacée et aucun rituel d'empreinte à exécuter.

## R. Dette

```
DEBT_REMOVED = aucune — il n'y avait rien à retirer sur le chemin gouverné avec contrat.
DEBT_CREATED = aucune — aucun second gate, aucun composant, aucune autorité, aucun codage en dur.
```

Ce que le lot **ajoute** : sept tests qui rendent l'invariant opposable. Il ne pouvait pas se perdre
sans qu'on le sache ; désormais il ne peut plus se perdre du tout sans faire rougir la suite.

## S. Défauts restants

### Défaut réellement atteignable — un contrat canonique refusé n'arrête pas le tour

```
CLASSE = fail-open        USER_VISIBLE = YES        IMPACT = HIGH
```

```js
// HTML:21277 — oprieBuildCanonicalContract
if(!verdict||verdict.ok!==true){console.warn('Contrat canonique refusé.',verdict&&verdict.problems);return null}
```

`oprieEnterExecution` place ce `null` dans `orientation.canonical` et poursuit. Alors :

1. `rapideAppliquerContratCanonique(null)` ⇒ `rapideContratCanonique = null` ;
2. `p = rapideProjectionCanonique(materiau)` ⇒ `null` ;
3. la garde censée fermer cette voie ne peut pas se déclencher — elle teste la valeur qu'on vient de
   mettre à `null` :

   ```js
   if(!p&&rapideContratCanonique&&rapideContratCanonique.executability&&…==='exploitable'){…return null}
   ```

4. **aucun gate ne tourne** (`if(p){ … }` sauté) — mesuré : `r.qg === null` ;
5. les verrous viennent du chemin historique, la fusion les augmente, `ASSEMBLY_2` se déclenche ;
6. un prompt **non gouverné et non contrôlé** est livré.

C'est exactement la branche que 02A avait mesurée sans le savoir, et c'est le vrai défaut. Il est
figé par `T-02B-07`, qui vérifie les trois maillons dans la source **et** mesure `r.qg === null`.

L'asymétrie avec l'Architecte (`refuse('technical', …)`) montre que la forme fail-closed existe déjà
dans le dépôt : il n'y a pas d'architecture à inventer, seulement une décision produit à prendre —
un contrat refusé doit-il produire un prompt ?

### Défauts hérités, non touchés

`adnMergeLegacyLocks` union stricte — et le dépôt le sait : `T-RAPCHAR-13b` s'intitule
« **[CARACTÉRISATION — COMPORTEMENT DESTINÉ À DISPARAÎTRE]** ». Quantités non promues en contrainte
(défaut #3, §L). `CONTRAINTES QUANTIFIÉES` absente sur 5/8. Architecte ADN, Output Compliance Gate :
hors périmètre.

## T. Verdict

Le lot demandait de supprimer une duplication. La mesure a montré qu'il n'y en avait pas là où on la
croyait : sur le chemin gouverné par un contrat canonique, il n'existe **qu'un** prompt, le gate le
contrôle réellement (`qg = PASS`), et c'est celui-là qui est livré — huit fois sur huit, à l'octet.
L'union de verrous est un no-op sur ce chemin parce que l'affinage réutilise l'enveloppe que le
moteur a déjà construite.

Les `0/8` de 02A étaient exacts, et mesuraient autre chose : la branche sans contrat canonique, la
seule où l'assembleur ne lance pas le gate. 02A avait signalé cette limite de portée ; ce lot l'a
levée, et le diagnostic change de nature. Le défaut n'est pas « le gate contrôle le mauvais
prompt » — c'est « **un contrat refusé continue quand même** », avec un `console.warn` pour seule
trace, et une garde fail-closed qui teste précisément la valeur qui vient d'être annulée.

Je n'ai donc rien corrigé en production, parce qu'aucune des deux options du lot ne corrigeait
quelque chose d'atteignable sans sortir de son périmètre : l'Option A est déjà inopérante là où le
contrat gouverne, et l'Option B ajouterait le doublon de gate que le §14 interdit. J'ai figé
l'invariant par sept tests, et transformé le défaut réel en test de caractérisation pour qu'il soit
mesuré plutôt que raconté.

Le lot suivant a une question nette et une seule : **un contrat canonique refusé doit-il produire un
prompt ?** L'Architecte répond déjà non.
