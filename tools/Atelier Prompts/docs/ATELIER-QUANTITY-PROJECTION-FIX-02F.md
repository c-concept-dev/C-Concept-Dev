# ATELIER_QUANTITY_PROJECTION_FIX_02F

**Nature** — `TARGETED PRODUCTION FIX`
**Lot précédent** — `ATELIER_CANONICAL_QUANTITY_TO_ADN_FIX_02E` (`27df9c3`)
**Objectif fixé par le propriétaire** — `FINAL_PROMPT_PRESERVES_QUANTITY = 3/3`
**Aucun secret, aucune clé. `PUSH = NO` · `DEPLOY = NO`**

---

## A. Correction préalable d'une erreur de mon rapport 02E

Mon rapport 02E affirmait que la garde de projection vit dans la plage gelée `moteur Rapide`, et
mon `NEXT_SAFE_ACTION` en concluait qu'il fallait ouvrir cette plage. **C'était faux, et c'est la
première chose que 02F a vérifiée.**

```text
garde  !ctx.fmt.enumerable        → ligne ~3808
plages gelées « moteur Rapide »   → 7975–8004  et  8031–8074
```

Aucune plage gelée ne la contient. `tools/frozen-guard.mjs` est resté `PASS` après modification,
avec les sept empreintes **inchangées**. Aucune ouverture de gel n'a été nécessaire. L'errata est
inscrit en tête du rapport 02E et aux quatre endroits concernés.

---

## B. Ce qui bloquait, mesuré

02E avait amené la quantité jusqu'au contrat, à l'ADN, au verrou et au gate — 3/3. Le prompt livré
ne la portait que 1/3. Deux causes distinctes, toutes deux dans le rendu :

1. **`if(!ctx.fmt.enumerable) return …`** — le projecteur `volume` retournait avant d'écrire la
   quantité dès que le format n'était pas énumérable (R03 `explication`, R06 `reponse_simple`).
2. **`ctx.fmt.unite || 'éléments'`** — la ligne écrite lisait l'unité du **format**, jamais la cible
   du **contrat**. R01 rendait « Exactement 20 éléments » là où la personne avait écrit
   « 20 points ».

---

## C. La garde d'origine avait raison, sur un cas qui existe

Le commentaire du code disait : *« Un courriel n'a pas d'“éléments distincts ”. »* J'ai cherché à
vérifier si ce cas était réel plutôt que de le supposer périmé. Il l'est, et voici la mesure :

```text
« Rédige un article de fond sur la transition énergétique en France »
  format            = article
  fmt.enumerable    = false
  quantiteExplicite = false
  ctx.quantite      = {min:3}        ← seuil du PROFIL, personne n'a rien dénombré
  verrous           = [… volume …]   ← le profil porte Volume par défaut
```

Sans garde, ce prompt dirait « Minimum 3 éléments » dans un article de fond. Le contresens est
exact. **02F ne retire donc pas la garde : il la requalifie.**

### Ce qui décide n'est pas le format — c'est l'origine de la quantité

```js
const demandee = !!(ctx.quantiteExplicite && (q.exact != null || q.min != null || q.max != null));
```

`ctx.quantiteExplicite` distingue déjà « la personne a dénombré » de « le profil a posé un seuil ».
Ce n'est pas un drapeau introduit pour ce lot : c'est celui que `actifsAdaptes()` consulte depuis
toujours pour décider d'ajouter le verrou Volume, avec ce commentaire déjà présent dans le code —
*« une quantité explicitement tapée par l'utilisateur ne doit pas disparaître parce que le profil
léger ne prévoit pas le verrou Volume : c'est l'inverse du principe qui gouverne cet atelier ».*

Une quantité **demandée** se projette sur tout format. Un **seuil de profil** reste réservé aux
formats énumérables, exactement comme avant. Aucune liste de formats n'a été écrite.

---

## D. Une tentative que j'ai dû abandonner, et pourquoi

Ma première règle était « une quantité qui **nomme sa cible** se projette partout ». Elle était plus
fine, et elle n'a pas tenu.

`target` n'est jamais nul dans le contrat : 02E y écrivait `text(quantity.target) || 'éléments'`.
« 5 minimum » — règle `lower_bound_suffix`, qui ne nomme rien — arrivait donc au rendu comme une
cible nommée « éléments ». La distinction était déjà détruite en amont.

J'ai alors voulu rendre `target` sincère (`|| null`), puisqu'un contrat ne devrait pas affirmer une
cible qu'il ignore. **L'ADN l'interdit, pour une bonne raison :**

```js
// core/adn/adn-state.js:365
assert(quantity.unit || quantity.target, "Une quantité doit avoir une unité ou une cible.");
```

Un nombre qui ne compte rien n'est pas une quantité exploitable — règle antérieure à ces lots. Avec
`target: null`, la projection canonique entière était refusée et `mergedLocks` tombait à `[]` : une
régression bien pire que le mot « éléments ». Le repli est donc **conservé**, avec le commentaire qui
explique pourquoi il n'est pas un oubli, et la distinction est portée par `quantiteExplicite`.

Je consigne cette tentative parce qu'elle a coûté un aller-retour et qu'elle documente une contrainte
réelle du système, pas une préférence.

---

## E. Les trois éditions, toutes hors plages gelées

**1. `rapideAppliquerCanoniqueAuContexte`** — la cible voyage avec le nombre :

```js
ctx.quantite={exact:…,min:…,max:…,
  cible:typeof q.target==='string'&&q.target.trim()?q.target.trim():null};
```

**2. Projecteur `volume`** — la cible du contrat l'emporte sur l'unité du format, et une quantité
demandée se projette sur tout format :

```js
const unite = (typeof q.cible === 'string' && q.cible.trim()) ? q.cible.trim() : (ctx.fmt.unite || 'éléments');
```

Les six formes de rendu (`exact`, fourchette, `min===max`, `max`, `min`) sont **inchangées** ;
elles sont seulement extraites dans `ligneQuantite()` pour être partagées par les deux branches.

**3. Projecteur `controle`** — une contrainte énoncée doit être contrôlable. Si la vérification était
restée réservée aux formats énumérables, le prompt aurait énoncé une contrainte que sa propre liste
de contrôle ignore. La condition est la même des deux côtés, et le contrôle de volume n'est pas
évincé : les deux coexistent.

---

## F. Résultat — corpus 02D rejoué, sept étapes

| cas | ARBITER | CANONICAL | ADN | LOCK | PROJECTION | GATE | FINAL | `FIRST_BREAK` |
|---|---|---|---|---|---|---|---|---|
| **R01** | OK | OK | OK | OK | OK | OK | OK | **NONE** |
| **R03** | OK | OK | OK | OK | OK | OK | OK | **NONE** |
| **R06** | OK | OK | OK | OK | OK | OK | OK | **NONE** |

Ce que le prompt livré porte désormais, textuellement :

```text
R01  ## CONTRAINTES QUANTIFIÉES
     - Exactement 20 points, sans doublon.          ← était « 20 éléments »
     ## VÉRIFICATION AVANT ENVOI
     2. Le nombre de points est-il exactement 20 ?  ← était « Le nombre de éléments »

R03  - Exactement 5 paragraphes, sans doublon.      ← était absent
     2. Le nombre de paragraphes est-il exactement 5 ?

R06  - Exactement 10 slogans, sans doublon.         ← était absent
     2. Le nombre de slogans est-il exactement 10 ?
```

`FINAL_PROMPT_PRESERVES_QUANTITY = 3/3` · `QUANTITY_PROJECTED = 3/3`.

`FOLLOW_UP-02E-A` et `FOLLOW_UP-02E-B` sont tous deux refermés.

---

## G. Tests

`tests/quantity-projection-02f.test.mjs` — **12 tests, 12 pass.**

```text
T-02F-01/02/03  les trois cas réels du corpus 02D atteignent le prompt avec leur cible
T-02F-04        un seuil de profil n'est PAS projeté sur un format non énumérable
T-02F-05        ce format garde exactement sa ligne de volume historique
T-02F-06        la vérification ne contrôle une quantité que si le prompt en énonce une
T-02F-07        la vérification contrôle la quantité projetée, avec la même cible
T-02F-08        la quantité contrôlée n'évince pas le contrôle de volume
T-02F-09/10/11  minimum, maximum et fourchette survivent à la projection
T-02F-12        une cible jamais vue par le correctif se projette sans ajout de code
```

**Un mot sur `T-02F-04/05/06`.** Ma première version les écrivait sur une demande sans quantité : le
verrou Volume n'étant alors pas sélectionné, la section était absente et les assertions passaient
**par vacuité** — elles ne prouvaient rien. Reconstruites sur le cas de l'article de fond (§C), elles
vérifient d'abord leurs trois prémisses (format non énumérable, quantité non explicite, verrou
pourtant sélectionné) et que la section existe, avant d'affirmer que la quantité n'y est pas.

---

## H. Suite globale, FROZEN, rituel

| | |
|---|---|
| Suite globale | **3036 / 3036 pass / 0 fail** |
| Échecs comportementaux introduits | **0** |
| `FROZEN` | `PASS` — sept empreintes **identiques** à 02E |

Les 20 échecs du premier lancement étaient tous d'empreinte ou de manifeste
(`STALE_FIXTURE`) : `CANONICAL_HTML_CHANGED = NO` × 15, `T-HTMLFINAL02-02/03/04/05/10`.
`UNKNOWN = 0`, `NEW_REGRESSION = 0`.

Rituel exécuté : reconstruction du runtime (`status OK`), nouvelle empreinte HTML propagée dans les
**15** fichiers qui l'épinglent, manifeste régénéré.

---

## I. Dette

**Retirée** — `FOLLOW_UP-02E-A` (garde de projection) et `FOLLOW_UP-02E-B` (unité du format au lieu
de la cible du contrat). L'erreur de localisation du rapport 02E est rectifiée.

**Créée** — aucune.

**Constatée, non traitée**

1. **`FOLLOW_UP-02F-A` — une phrase mal formée dans un prompt livré.** Sur les formats non
   énumérables, `ctx.mots` vaut une phrase et non une fourchette, et le gabarit lui ajoute
   « mots » :
   ```text
   - Volume attendu : aussi court que le sujet le permet, sans remplissage mots.
   3. Le volume tient-il dans la fourchette indiquée (aussi court que le sujet le permet,
      sans remplissage mots) sans remplissage ?
   ```
   Défaut **antérieur** à 02E et 02F, purement rédactionnel, sans effet sur la contrainte — mais
   visible par la personne qui reçoit le prompt. Hors objectif de ce lot ; signalé parce que le
   smoke produit qui suit juge des prompts livrés.

2. **`FOLLOW_UP-02E-C`** — `detecterQuantite` / `adnQuantitiesFromRapid` restent branchés sur la voie
   legacy. Inchangé par 02F.

3. **`FOLLOW_UP-02E-D`** — `moins de` ajouté à `upper_bound` en 02E. Toujours réversible.

---

## J. Verdict

```text
SUBLOT = ATELIER_QUANTITY_PROJECTION_FIX_02F

OBJECTIF_ATTEINT                     = YES
FINAL_PROMPT_PRESERVES_QUANTITY      = 3/3
QUANTITY_PROJECTED                   = 3/3
FIRST_BREAK                          = NONE (3/3)

CANONICAL_TARGET_USED_IN_PROMPT      = YES
PROFILE_THRESHOLD_STILL_GUARDED      = YES
STATED_CONSTRAINT_IS_CHECKED         = YES

FORMAT_LIST_HARDCODED                = NO
DOMAIN_HARDCODING_ADDED              = NO
FROZEN_RANGE_OPENED                  = NO
CANONICAL_SCHEMA_CHANGED             = NO
GATE_CHANGED                         = NO
ARBITER_CHANGED                      = NO
NEW_COMPONENT_CREATED                = NO

TARGETED_TESTS                       = 12/12 PASS
GLOBAL_TESTS                         = 3036/3036 PASS
NEW_REGRESSION                       = 0
FROZEN                               = PASS

02E_REPORT_CORRECTED                 = YES
PRODUCTION_CODE_CHANGED              = YES
PUSH                                 = NO
DEPLOY                               = NO

LOT_GATE                             = GELABLE
```
