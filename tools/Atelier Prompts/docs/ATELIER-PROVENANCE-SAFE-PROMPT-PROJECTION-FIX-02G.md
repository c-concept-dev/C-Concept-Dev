# ATELIER_PROVENANCE_SAFE_PROMPT_PROJECTION_FIX_02G

**Nature** — `TARGETED PRODUCTION FIX`
**Sur** — `ba11cac` (smoke produit 02F-bis)
**Objet jugé** — le prompt que la personne reçoit. Rien d'autre.
**Aucun secret, aucune clé. `PUSH = NO` · `DEPLOY = NO`**

> Principe du lot :
> *Un verrou peut contraindre le comportement du futur modèle. Il ne peut pas inventer l'histoire de
> la demande utilisateur.*

---

## A. Baseline

```text
git status --short -- 'tools/Atelier Prompts'   → (vide)
git branch --show-current                       → main
git rev-parse HEAD                              → ba11cac14ad986707cef785a26f08825f0385d7b
```

| commit | contenu |
|---|---|
| `1a1e285` | **02F** — la quantité demandée atteint le prompt livré (`FINAL_PROMPT_PRESERVES_QUANTITY` 1/3 → 3/3) |
| `76968cf` | **02F-bis + smoke produit** — cible avant le nombre, accents, élision |
| `ba11cac` | **correction de mon verdict de smoke** — le prompt livré échouait sur le contenu |

```text
LOT = ATELIER_PROVENANCE_SAFE_PROMPT_PROJECTION_FIX_02G

PROBLÈME PRODUIT = des projecteurs injectent dans le prompt des faits absents de la demande

CAUSE RACINE = la projection de certains verrous produit du contenu assertif sans dépendre
               de données canoniques sourcées

BÉNÉFICE UTILISATEUR = le prompt reste fidèle et n'invente plus son contexte
```

---

## B. Smoke blocker — les quatre cas, en chaîne réelle

| cas | demande | OPRIE | matériau |
|---|---|---|---|
| **S1** | « Fais-moi un plan de révision en 5 séances pour un examen de droit constitutionnel dans 3 semaines » | READY au **4ᵉ** essai (3 × `degraded_state`) | aucun |
| **S2** | « Compare les avantages et inconvénients du train et de l'avion pour Paris-Marseille, sous forme de tableau » | READY | aucun |
| **S3** | « Corrige les fautes d'orthographe et de grammaire de ce texte » | READY | **279 octets fournis** |
| **S4** | « Donne exactement 7 idées de cadeaux pour un enfant de 8 ans » | READY | aucun |

Tours d'Arbitre réels, obtenus par appel HTTP au Worker déployé avec le corps exact de
`oprieBuildBody()` — `material_context` compris, ce que mon harnais de smoke précédent omettait.

---

## C. Cause racine

Mesurée, pas supposée. L'arité des treize projecteurs de sections, lue dans le produit :

```text
role 1 · destinataire 1 · donnees 1 · provenance 1 · perimetre 0 · format 1 · gabarit 1
amorce 1 · volume 1 · interdits 1 · hypotheses 1 · longueur 1 · controle 1
```

**`perimetre` était le seul des treize à ne recevoir aucun argument.** Un projecteur qui ne reçoit
rien de la demande ne peut rien en dire : il rendait donc un texte écrit d'avance. C'est la forme
exacte du principe causal du lot —

```text
LOCK SELECTED  ≠  PERMISSION TO INVENT LOCK CONTENT
PROJECTED ASSERTION  →  MUST HAVE SOURCE
```

Le second mécanisme était différent : `provenance` recevait bien `ctx`, mais servait des **valeurs de
repli** dès que ses champs étaient vides. Or `ctx.droit`, `ctx.provenance` et `ctx.usage` valent
`""` dans les quatre cas réels — les replis étaient donc la règle, pas l'exception.

---

## D. Projecteurs responsables

### D.1 — `perimetre` (ligne 3759 avant correction)

```text
PROJECTOR          = perimetre
LOCK               = scope → perimetre
INPUT_ARGUMENTS    = AUCUN  (`perimetre: () => …`)
CANONICAL_DATA_READ = AUCUNE
STATIC_ASSERTIONS  = « Ce qui est demandé : la structure. Code, logique de calcul, interface,
                       navigation, mise en forme, export »
                     « aucun libellé d'item, aucun extrait d'article, aucun barème publié »
                     « Le contenu protégé est fourni séparément … depuis un fichier local »
                     « employez des données factices »
OUTPUT_SECTION     = ## PÉRIMÈTRE DU LIVRABLE
```

### D.2 — `provenance` (ligne 3744 avant correction)

```text
PROJECTOR          = provenance
LOCK               = provenance
INPUT_ARGUMENTS    = ctx
CANONICAL_DATA_READ = ctx.droit · ctx.provenance · ctx.usage   (vides dans les 4 cas réels)
STATIC_ASSERTIONS  = « Titre d'accès : accès professionnel régulier »
                     « matériau professionnel dont l'utilisateur dispose régulièrement »
                     « Usage du livrable : usage professionnel interne »
                     « Le matériau nécessaire est fourni dans ce prompt »
                     « Il ne s'agit pas de reproduire la source. Ne restituez pas de passage
                       étendu de l'original »
                     « rappel de précaution adressé à un professionnel du domaine »
OUTPUT_SECTION     = ## PROVENANCE ET USAGE DU MATÉRIAU
```

### D.3 — `volume`, branche énumérable (ligne 3802)

```text
STATIC_ASSERTION   = « Couverture : 100 % des éléments présents dans les données sources »
OUTPUT_SECTION     = ## CONTRAINTES QUANTIFIÉES
```

Affirmait des données sources dans **tout** prompt énumérable. Observé dans S4, qui n'a aucun
matériau.

### D.4 — `donnees` : NON MODIFIÉ

Ce projecteur peut émettre `[coller ici le matériau à traiter, ou supprimer cette section]` quand un
format exige des données absentes — un espace réservé, que la section `INTERDICTIONS` du même prompt
interdit. **Aucun des quatre cas ne l'a produit.** Le §3 du lot est explicite : un projecteur ne se
modifie pas parce que son nom paraît suspect. Consigné en `FOLLOW_UP-02G-A`, non touché.

---

## E. Sources canoniques disponibles

Relevées sur les contrats réels, pas sur la documentation :

| donnée | champ canonique | état dans les cas réels |
|---|---|---|
| bornes du livrable | `intent.explicit_constraints[].text` | **peuplé** : S1 2 entrées, S3 2, S4 2, S2 0 |
| provenance | `evidence.provenance` | **vide** 4/4 |
| faits externes | `evidence.external_facts` | S2 : 4 entrées `to_research` |
| faits du matériau | `evidence.material_facts` | vide (extraction non effectuée) |
| droit / usage / origine | `ctx.droit` · `ctx.usage` · `ctx.provenance` (champs de l'atelier) | `""` 4/4 |
| matériau réel | `material_content` → `ctx.materiau` | S3 seulement |
| périmètre dédié | *(aucun champ `intent.scope`)* | n'existe pas |

Ordre de préférence appliqué : **donnée canonique existante > dérivée d'une donnée établie > omission**.
Jamais d'hypothèse de domaine écrite en dur.

---

## F. Périmètre

`ctx` ne transportait pas les contraintes confirmées. Deux corrections, toutes deux hors gel.

**1. `rapideAppliquerCanoniqueAuContexte` (ligne 7996)** — le contexte porte enfin ce que le signal
déclare comme sa source :

```js
ctx.perimetre=(Array.isArray(intent.explicit_constraints)?intent.explicit_constraints:[])
  .map(c=>(c&&typeof c.text==='string')?c.text.trim():'').filter(Boolean);
```

**2. Le projecteur reçoit `ctx` et n'énonce que l'établi** :

```js
perimetre: ctx => {
  const DISCIPLINE = '- Restez strictement dans le périmètre de la demande : n’ajoutez ni ' +
    'besoin, ni contrainte, ni livrable qui n’y figure pas.';
  const etablies = Array.isArray(ctx.perimetre) ? ctx.perimetre.filter(Boolean) : [];
  const t = '## PÉRIMÈTRE DU LIVRABLE\n' + DISCIPLINE;
  if(!etablies.length) return t;
  return t + '\n- Contraintes établies par la personne, à respecter telles quelles :\n' +
    etablies.map(c => '  - ' + c).join('\n');
}
```

La discipline générique est écrite ici parce qu'**aucune primitive équivalente n'existait** dans le
produit — recherche faite (`hors du périmètre`, `non demandé`, `n'ajoutez pas` : aucune occurrence
utilisable). Elle n'affirme aucun fait.

---

## G. Matériau

```text
matériau réellement fourni  → peut être déclaré fourni          (S3)
matériau absent             → jamais déclaré fourni             (S1, S2, S4)
matériau requis mais absent → contrat produit existant, non touché  (FOLLOW_UP-02G-A)
```

Ni le dialogue ni OPRIE n'ont été modifiés.

---

## H. Provenance

Chaque ligne est désormais conditionnée à la donnée qui l'établit :

```js
if(ctx.droit)      l.push('- Titre d’accès : ' + ctx.droit + '.');
if(ctx.provenance) l.push('- Origine : ' + ctx.provenance + '.');
if(ctx.usage)      l.push('- Usage du livrable : ' + ctx.usage + '.');
if(ctx.materiau)   l.push('- Le matériau à traiter est fourni dans ce prompt, entre les marqueurs …');
```

Restent sans condition deux lignes qui n'affirment l'existence de rien :

```text
- Distinguez ce qui est établi par la demande ou par le matériau de ce que vous apportez
  vous-même : présentez le second comme tel, jamais comme une donnée fournie.
- Respectez les droits et restrictions explicitement fournis, sans en supposer d’autres.
```

Le verrou n'est donc jamais désactivé : il garde une discipline utile même quand il n'a aucun fait à
énoncer (§10).

---

## I. Droits / accès

Même règle, et le §8 du lot autorise exactement la forme retenue : une discipline générique qui
demande de respecter les restrictions **explicitement fournies**, sans affirmer qu'il en existe.

Retirée : « rappel de précaution adressé à un professionnel du domaine » — elle affirmait la qualité
du destinataire, qu'aucun champ n'établissait.

---

## J. Transformation de matériau

Le cas le plus grave du smoke. Pour « Corrige les fautes de ce texte », le prompt livré contenait
simultanément le texte à corriger **et** :

```text
« Il ne s'agit pas de reproduire la source. Ne restituez pas de passage étendu de l'original »
« Ne recopiez dans le livrable aucun libellé d'item, aucun extrait d'article »
```

Corriger un texte exige de le restituer. La tâche devenait infaisable pour un modèle obéissant.

**La résolution n'a demandé aucun classifieur de tâche.** Ces deux interdictions étaient elles-mêmes
des affirmations sur ce que la personne voulait — elle n'a jamais demandé qu'on ne reproduise pas son
texte. L'invariant du lot les élimine donc de lui-même : `NO ASSERTION WITHOUT PROVENANCE`. C'est la
même règle qui répare les trois cas, pas une exception pour celui-ci.

`SELF_CONTRADICTION = NO`, figé par `T-02G-09`.

---

## K. Sélection des locks

La question posée par le smoke est tranchée par la mesure : `core/adn/rapide-canonical-enrichment.js:444`

```js
if (constraints.length) {
  addLockSignal(lockSignals, 'scope', 'Des contraintes confirmées bornent le périmètre du livrable.',
                ['intent.explicit_constraints']);
}
```

Le verrou `scope` est levé **parce que des contraintes confirmées existent**, et il déclare lui-même
sa source. Pour S4, ces contraintes sont « Le nombre d'idées doit être exactement 7 » et « Les idées
doivent être adaptées à un enfant de 8 ans » : elles bornent réellement le livrable. Idem pour
`provenance`, levé par `evidence.external_facts` (S2 : 4 faits à rechercher).

C'est donc le cas **A** du §11 — *verrou sélectionné correctement, projection inventée* — et non le
cas B. Conformément au lot, **la politique de sélection n'est pas touchée** :
`LOCK_SELECTION_POLICY_CHANGED = NO`.

Et la correction rend la question largement sans objet : un verrou sélectionné sans rien de sourcé à
dire se limite désormais à une discipline qui n'affirme rien.

---

## L. Projection

Ce que les quatre prompts disent maintenant, aux endroits qui mentaient :

```text
S1  ## PÉRIMÈTRE DU LIVRABLE
    - Restez strictement dans le périmètre de la demande : n'ajoutez ni besoin, ni contrainte,
      ni livrable qui n'y figure pas.
    - Contraintes établies par la personne, à respecter telles quelles :
      - 5 séances exactement
      - Examen dans 3 semaines

S2  ## PROVENANCE ET USAGE DU MATÉRIAU
    - Distinguez ce qui est établi par la demande ou par le matériau de ce que vous apportez
      vous-même : présentez le second comme tel, jamais comme une donnée fournie.
    - Respectez les droits et restrictions explicitement fournis, sans en supposer d'autres.
    (aucune section DONNÉES SOURCES, aucun titre d'accès, aucun usage affirmé)

S3  ## PROVENANCE ET USAGE DU MATÉRIAU
    - Le matériau à traiter est fourni dans ce prompt, entre les marqueurs de la section
      DONNÉES SOURCES. Travaillez dessus : n'en vérifiez pas l'accès, n'en recherchez pas
      d'autre copie, ne demandez pas confirmation avant de commencer.
    ## PÉRIMÈTRE DU LIVRABLE
      - Ne pas modifier le sens du texte
      - Ne pas modifier la structure ou le style des phrases

S4  ## CONTRAINTES QUANTIFIÉES
    - Exactement 7 idées, sans doublon.
    - Volume attendu : aussi court que le sujet le permet, sans remplissage mots.
    - Traitez la totalité de ce qui est demandé.      ← était « … présents dans les données sources »
```

---

## M. Assertions sourcées

Audit ligne par ligne, chaque assertion confrontée à **sa** source (et non à l'existence d'une
donnée quelconque — mon premier critère était trop laxiste et le comptait « sourcé » dès qu'une
contrainte existait ; corrigé avant conclusion).

| compteur | avant | après |
|---|---|---|
| `UNSUPPORTED_PERIMETER_ASSERTIONS` | **12** | **0** |
| `UNSUPPORTED_PROVENANCE_ASSERTIONS` | **3** | **0** |
| `UNSUPPORTED_MATERIAL_ASSERTIONS` | **3** | **0** |
| `UNSUPPORTED_RIGHTS_ASSERTIONS` | **2** | **0** |
| **total** | **20** | **0** |

Mesure « avant » obtenue en restaurant l'artefact de `HEAD` et en rejouant le même audit sur les
mêmes quatre tours réels, puis en remettant la version 02G (empreinte vérifiée identique).

---

## N. Anti-invention

`DOMAIN_TERMS_ADDED_FOR_TEST_CASES = NO`, vérifié sur le diff de production :

- les mots `train`, `avion`, `révision`, `cadeau`, `photosynthèse`, `interface`, `barème`
  n'apparaissent **que dans des commentaires** documentant ce qui a été retiré ;
- chaque condition ajoutée porte sur un champ : `ctx.droit`, `ctx.provenance`, `ctx.usage`,
  `ctx.materiau`, `ctx.perimetre`, `intent.explicit_constraints` ;
- aucun `if request contains …`, aucune liste de métiers, de domaines, de fichiers, de plateformes
  ou de droits ;
- aucun classifieur, routeur, appel de modèle, autorité ou machine à états nouveaux.

`T-02G-15` fige la propriété structurelle : **aucun projecteur d'arité 0**. C'est la mesure même qui
avait révélé la cause.

---

## O. Smoke réel — lecture humaine des quatre prompts

### S1 — plan de révision en 5 séances

```text
UNSUPPORTED ASSERTIONS : aucune
CONTRADICTIONS         : aucune
FIDÉLITÉ               : le périmètre cite « 5 séances exactement » et « Examen dans 3 semaines »
EXPLOITABILITÉ         : le prompt est exécutable tel quel
VERDICT                : PASS
```

### S2 — comparaison train / avion, sans matériau

```text
UNSUPPORTED ASSERTIONS : aucune — plus de titre d'accès, plus d'usage, plus de matériau déclaré
CONTRADICTIONS         : aucune
RÉSERVE                : la section garde le titre « PROVENANCE ET USAGE DU MATÉRIAU » alors
                         qu'aucun matériau n'existe. Le titre est l'ancre de MARQUEURS et de la
                         trace de projection ; le renommer sort du périmètre du lot.
                         → FOLLOW_UP-02G-B
VERDICT                : PASS
```

### S3 — correction d'un texte fourni

```text
UNSUPPORTED ASSERTIONS : aucune
CONTRADICTIONS         : aucune — la tâche est redevenue faisable
FIDÉLITÉ               : le matériau est déclaré fourni (il l'est), et les deux contraintes de la
                         personne sont citées telles quelles
RÉSERVE                : « Le volume tient-il dans la fourchette indiquée (aussi court que le sujet
                         le permet, sans remplissage mots) sans remplissage ? » — défaut
                         rédactionnel antérieur, déjà consigné FOLLOW_UP-02F-A
VERDICT                : PASS
```

### S4 — 7 idées de cadeaux

```text
UNSUPPORTED ASSERTIONS : aucune — plus de code, plus de barème, plus de données sources
CONTRADICTIONS         : aucune
FIDÉLITÉ               : « Exactement 7 idées » + les deux contraintes confirmées
VERDICT                : PASS
```

`SMOKE_FAILED_CASES = 0/4`.

---

## P. Tests ciblés

`tests/provenance-safe-projection-02g.test.mjs` — **15 tests, 15 pass**, sans réseau. Les
contraintes confirmées citées sont celles de l'Arbitre réel, reprises mot pour mot des tours
capturés ; les prompts en chaîne réelle vivent dans ce rapport.

```text
T-02G-01  le projecteur de périmètre n'invente aucun détail de domaine
T-02G-02  un périmètre établi est projeté fidèlement, mot pour mot
T-02G-03  un matériau absent n'est jamais déclaré fourni
T-02G-04  un matériau fourni reste déclaré fourni
T-02G-05  une provenance inconnue n'est pas fabriquée
T-02G-06  une provenance explicite est préservée
T-02G-07  un droit ou un titre d'accès inconnu n'est pas inventé
T-02G-08  une restriction de droits explicite est préservée
T-02G-09  un prompt de transformation de matériau ne se contredit pas
T-02G-10  une demande banale ne contient aucune assertion de domaine héritée  (4 demandes)
T-02G-11  smoke S1 PASS
T-02G-12  smoke S2 PASS
T-02G-13  smoke S3 PASS
T-02G-14  la couverture ne parle de données sources que s'il en existe
T-02G-15  tout projecteur reçoit le contexte — aucun d'arité 0
```

`ASSERTION_WITH_SOURCE = allowed` (T-02G-02/04/06/08) ·
`ASSERTION_WITHOUT_SOURCE = forbidden` (T-02G-01/03/05/07/10/14).

---

## Q. Tests globaux

**3054 / 3054 pass / 0 fail.**

Les 18 échecs du premier lancement étaient **tous** d'empreinte ou de manifeste
(`CANONICAL_HTML_CHANGED = NO` × 15, `T-HTMLFINAL02-02/03/10`). `NEW_REGRESSION = 0`,
`UNKNOWN = 0`.

**Un fait qui mérite d'être dit** : aucun test existant n'a échoué sur le changement de contenu.
Le texte qui affirmait du code, des barèmes et un titre d'accès n'était couvert par **aucune
assertion** — c'est précisément pour cela qu'il a survécu à 3 000 tests. Les quinze tests de ce lot
ferment ce trou.

Rituel exécuté : nouvelle empreinte HTML propagée dans les **15** fichiers qui l'épinglent, manifeste
régénéré. Le runtime compilé n'a pas changé : les quatre corrections sont dans le pilote, pas dans
`core/`.

---

## R. FROZEN

`PASS`. Vérifié **avant** toute modification, sur les lignes actuelles et non sur une affirmation
héritée (§22) :

```text
PLAGES GELÉES              3064–3244 FORMATS · 3356–3391 VERROUS · 3966–4023 moteur Atelier
                           8014–8043 et 8070–8113 moteur Rapide · 8449–8470 ARCH_SCHEMA
                           8470–8472 ARCH_SYSTEM · 8498–9386 moteur Architecte

PROJECTEURS TOUCHÉS        donnees 3734 · provenance 3744 · perimetre 3759 · volume 3802
                           → tous HORS plage gelée
rapideAppliquerCanoniqueAuContexte 7996 → hors plage gelée (la plage commence à 8014)
```

Sept empreintes **identiques** après correction. Aucune plage gelée ouverte.

À noter : `contexte()` (3966–4023), qui peuple `ctx.droit` / `ctx.provenance` / `ctx.usage`, **est**
gelé — et n'avait pas besoin d'être touché. Ces champs étaient déjà vides et corrects ; ce sont les
projecteurs qui inventaient.

---

## S. Dette

**Retirée**

- `perimetre` n'est plus un projecteur aveugle : 20 assertions sans source → 0.
- La provenance, les droits et l'usage ne sont plus fabriqués.
- La contradiction qui rendait une tâche de transformation infaisable a disparu.
- La couverture n'affirme plus des données sources inexistantes.
- Le trou de couverture de tests sur le contenu des sections est comblé (15 tests).

**Créée** — aucune.

**Constatée, non traitée**

1. **`FOLLOW_UP-02G-A`** — `donnees` peut émettre `[coller ici le matériau à traiter…]` quand un
   format exige des données absentes : un espace réservé que la section `INTERDICTIONS` du même
   prompt interdit. Aucun des quatre cas ne l'a produit ; non touché par discipline de périmètre.
2. **`FOLLOW_UP-02G-B`** — le titre `PROVENANCE ET USAGE DU MATÉRIAU` s'affiche même sans matériau
   (S2). Le titre est l'ancre de `MARQUEURS` et de la trace de projection ; le renommer touche la
   correspondance verrou → section.
3. **`FOLLOW_UP-02G-C`** — le Prompt Contract Gate ne peut pas détecter l'invention sémantique :
   pour `scope` il compare `constraint_count` au nombre de `source_ids` du signal (1 ≥ 1), ce qui
   passe quel que soit le texte rendu. Constat, pas chantier : le §17 interdit d'en faire un moteur
   sémantique ici.
4. **`FOLLOW_UP-02F-A`** — « sans remplissage mots », défaut rédactionnel antérieur, toujours visible.
5. **`FOLLOW_UP-SMOKE-A`** — fiabilité OPRIE : S1 a demandé **4 essais** (3 × `degraded_state`,
   « le rôle critic n'a pu être exécuté par aucun fournisseur »), P1 2 essais, latences 23 à 95 s.
   C'est la seule réserve qui reste entre cette version et une bêta tranquille, et elle est hors
   périmètre de 02G.

---

## T. Verdict

Les quatre prompts ont été lus, pas comptés. Ce qu'ils affirment est soutenu par ce que la personne
a dit, ou n'est pas affirmé. Le cas qui rendait la tâche infaisable est résolu par la même règle que
les autres, sans classifieur ni exception.

La cause racine se mesurait en un chiffre — un projecteur d'arité 0 parmi treize — et se referme de
la même façon : plus aucun projecteur ne parle sans recevoir la demande.

Le blocage bêta identifié par le smoke est levé. Ce qui reste avant une bêta sereine n'est plus le
contenu du prompt, mais la fiabilité d'en obtenir un.

### Verdict formel

```text
SUBLOT = ATELIER_PROVENANCE_SAFE_PROMPT_PROJECTION_FIX_02G

ROOT_CAUSE_FIXED                     = YES
PROVENANCE_SAFE_PROJECTION           = PASS

PERIMETER_PROJECTOR_SOURCE_AWARE     = YES
MATERIAL_PROJECTOR_SOURCE_AWARE      = YES
PROVENANCE_PROJECTOR_SOURCE_AWARE    = YES
RIGHTS_PROJECTOR_SOURCE_AWARE        = YES

UNSUPPORTED_PERIMETER_ASSERTIONS     = 0   (12 avant)
UNSUPPORTED_MATERIAL_ASSERTIONS      = 0   (3 avant)
UNSUPPORTED_PROVENANCE_ASSERTIONS    = 0   (3 avant)
UNSUPPORTED_RIGHTS_ASSERTIONS        = 0   (2 avant)
SELF_CONTRADICTIONS_FOUND            = 0   (1 avant, sur S3)

EXPLICIT_PERIMETER_PRESERVED         = YES
EXPLICIT_MATERIAL_PRESERVED          = YES
EXPLICIT_PROVENANCE_PRESERVED        = YES

LOCK_SELECTION_POLICY_CHANGED        = NO
PROMPT_GATE_CHANGED                  = NO
CANONICAL_SCHEMA_CHANGED             = NO
ARBITER_CHANGED                      = NO
FAST_DEEP_CHANGED                    = NO
NEW_COMPONENT_CREATED                = NO
NEW_ARCHITECTURE_CREATED             = NO
SECOND_AUTHORITY_CREATED             = NO
DOMAIN_HARDCODING_ADDED              = NO

SMOKE_S1                             = PASS
SMOKE_S2                             = PASS
SMOKE_S3                             = PASS
SMOKE_S4                             = PASS
SMOKE_FAILED_CASES                   = 0/4

TARGETED_TESTS                       = 15/15 PASS
GLOBAL_TESTS                         = 3054/3054 PASS
FROZEN                               = PASS

DEBT_REMOVED                         = 20 assertions sans source → 0 ; contradiction de
                                       transformation ; couverture affirmant des données sources
                                       inexistantes ; trou de couverture de tests sur le contenu
DEBT_CREATED                         = aucune
                                       (constatées : 02G-A espace réservé de `donnees` ;
                                        02G-B titre de section sans matériau ;
                                        02G-C le gate ne détecte pas l'invention sémantique ;
                                        02F-A « sans remplissage mots » ;
                                        SMOKE-A fiabilité OPRIE)

PRODUCTION_CODE_CHANGED              = YES
PUSH                                 = NO
DEPLOY                               = NO

REPORT                               = docs/ATELIER-PROVENANCE-SAFE-PROMPT-PROJECTION-FIX-02G.md

LOT_GATE                             = GELABLE
BETA_BLOCKER                         = CLOSED

NEXT_SAFE_ACTION                     = REAL_PRODUCT_BETA_SMOKE
```
