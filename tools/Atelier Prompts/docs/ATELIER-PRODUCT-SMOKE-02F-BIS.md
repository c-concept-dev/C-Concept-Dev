# ATELIER_PRODUCT_SMOKE — 02F-bis

**Nature** — `SMOKE PRODUIT FINAL` (Rapide + Architecte) et le correctif qu'il a rendu nécessaire
**Sur** — `1a1e285` (02F)
**Objet jugé** — le prompt que la personne reçoit. Rien d'autre.
**Aucun secret, aucune clé. `PUSH = NO` · `DEPLOY = NO`**

---

## A. Méthode — ce qui est réel, et ce qui ne l'est pas

| étape | réel ? | comment |
|---|---|---|
| Arbitre / OPRIE | **RÉEL** | appel HTTP au Worker déployé, route `/operational-request` |
| Analyse Architecte | **RÉEL** | appel HTTP à `api.anthropic.com`, avec `ARCH_SYSTEM` et `ARCH_SCHEMA` du produit |
| Contrat canonique | **RÉEL** | `mapOprieToCanonicalContract` + enrichissement, chemin de production |
| Assemblage du prompt | **RÉEL** | moteurs Rapide et Architecte du produit, exécutés dans `vm` par les harnais |
| Navigateur | non | les harnais exécutent le moteur hors DOM ; c'est la seule pièce simulée |

Aucune fixture n'a remplacé une sortie de modèle. 8 appels OPRIE réels et 4 appels d'analyse réels.

**La clé Anthropic a été lue dans l'environnement du seul process Node appelant, jamais affichée,
jamais journalisée, jamais écrite dans un fichier, jamais commitée.**

---

## B. Une erreur de méthode que j'ai commise, et corrigée avant de conclure

Mon premier passage Architecte extrayait `ARCH_SCHEMA` et `ARCH_SYSTEM` de leurs littéraux bruts.
Or le produit les **complète juste après leur déclaration** (V11.1 DECISION-FIRST ligne 8451,
V11.2 RC1 ligne 8471), notamment avec `strategie.pilotage_incertitude`. J'ai donc envoyé au modèle
un schéma et un prompt système incomplets, et `archValider` a rejeté les deux analyses sur
« Pilotage décisionnel incomplet ».

J'étais à deux doigts de rapporter que le chemin Architecte est structurellement incapable de livrer
un prompt — un défaut majeur, et faux. Ce qui m'a arrêté est d'avoir vérifié où
`pilotage_incertitude` est déclaré avant de l'affirmer. Avec le schéma et le prompt réellement
utilisés par le produit, **les deux analyses valident sans une seule erreur**.

Je le consigne parce que l'écart entre « le littéral » et « ce que le produit envoie » est un piège
que tout futur harnais rencontrera.

---

## C. Rapide — 6 cas, 4 prompts livrés

| cas | demande | OPRIE | prompt | quantité |
|---|---|---|---|---|
| **S1** | « Explique-moi ce qu'est un bilan comptable » | READY 30 s | 1 796 o · 6 sections | — (aucune, aucune inventée) |
| **S2** | « Rédige un courriel pour annuler un rendez-vous chez le dentiste » | **clarification** 78 s | aucun | — |
| **S3** | « Écris un court paragraphe de présentation pour un profil professionnel » | **clarification** 70 s | aucun | — |
| **C1** | « Donne exactement 7 idées de cadeaux pour un enfant de 8 ans » | READY 38 s | 2 705 o · 8 sections | `Exactement 7 idées` |
| **C2** | « Écris une note de synthèse en quatre paragraphes maximum sur le télétravail » | READY 69 s | 2 730 o · 8 sections | `Au maximum 4 paragraphes` |
| **C3** | « Propose entre trois et cinq titres d'articles sur le vélo en ville » | READY 36 s | 2 740 o · 8 sections | `Entre 3 et 5 titres` |

Sur les 4 prompts livrés : **aucune section vide, aucun espace réservé, demande reprise
intégralement 4/4, quantité juste avec sa modalité et sa cible 3/3, aucune quantité inventée sur le
cas qui n'en portait pas.**

---

## D. Ce que le smoke a trouvé — et qui a été corrigé (02F-bis)

Ces trois défauts n'ont pas été trouvés en relisant le code. Ils ont été trouvés en lisant des
prompts réellement livrés.

### D.1 — La cible précède souvent le nombre, et elle était perdue

Interrogé sur « exactement 7 idées de cadeaux », l'Arbitre confirme :

```text
« Le nombre d'idées doit être exactement 7 »
```

Le nom **avant** le nombre. `QUANTITY_TARGET` ne lisait qu'après, donc la cible retombait sur le
repli et le prompt livré disait **« Exactement 7 éléments »**. Idem pour C3 : « Le nombre de titres
proposés doit être compris entre trois et cinq » → « Entre 3 et 5 éléments ».

**2 cas contraints sur 3 étaient touchés, et c'est la tournure que l'Arbitre produit le plus
souvent.** Le corpus 02D ne l'avait pas révélé parce que ses trois formulations plaçaient le nom
après le nombre.

Correction : une position de plus, `nombre de X`, qui nomme explicitement ce qui est compté. Pas une
règle par cas, aucun mot de domaine ajouté.

### D.2 — La cible perdait ses accents

Une fois la cible lue, le prompt disait **« Exactement 7 idees »**. Les motifs travaillent sur un
texte normalisé sans accents — nécessaire pour qu'ils n'aient pas à les connaître — mais la cible,
elle, est **écrite à la personne**. Elle est désormais relue dans le texte d'origine, aux mêmes
positions, après vérification que la normalisation ne les a pas déplacées. Elle garde aussi sa
casse : « Exactement 120 BPM », et non « bpm ».

### D.3 — L'élision manquait

La ligne de vérification disait **« Le nombre de idées est-il exactement 7 ? »** — et disait
« Le nombre de éléments » bien avant ces lots. Corrigé par la règle générale : « de » s'élide devant
une voyelle ou un h. Pas une liste de mots.

---

## E. Architecte — 2 cas, 2 prompts livrés

| cas | demande | analyse réelle | OPRIE | prompt |
|---|---|---|---|---|
| **A1** | « Explique-moi comment fonctionne un compteur électrique Linky » | 11 891 o en 68 s · niveau `standard` · 5 composants retenus / 3 écartés | READY (après un 502 transitoire) | **10 355 o · 19 sections** |
| **A2** | « Rédige une procédure de sauvegarde en exactement 6 étapes numérotées, pour une équipe non technique » | 16 456 o en 77 s · niveau `standard` · 7 retenus / 3 écartés | READY (après 2 `degraded_state`) | **11 647 o · 20 sections** |

Validation : **0 erreur** sur les deux. Aucune section vide, aucun espace réservé, demande reprise
2/2.

Le prompt A2 porte la contrainte quantitative à quatre endroits distincts et cohérents :

```text
## FORMAT DE SORTIE
- Quantité : minimum 6 ; maximum 6 étapes numérotées
- Structure : plan imposé (6 éléments)

## Structure rigide en exactement 6 étapes
La procédure DOIT contenir exactement 6 étapes numérotées. Aucune étape supplémentaire…

## VÉRIFICATION AVANT ENVOI
- La procédure contient exactement 6 étapes numérotées de 1 à 6
```

Le rôle est formulé pour la demande, pas choisi dans un catalogue (« Rédacteur de procédures
opérationnelles pour publics non techniques »), et les composants écartés le sont explicitement.

---

## F. Réserves — ce qui n'est pas corrigé

### F.1 — `FOLLOW_UP-SMOKE-A` · fiabilité de la chaîne OPRIE

Sur **8 appels réels** :

```text
1 × HTTP 502                       (A1, transitoire — READY au réessai)
2 × degraded_state consécutifs     (A2 : « Le rôle critic n'a pu être exécuté par aucun
                                    fournisseur disponible ») puis READY au 3ᵉ appel
latences                           27 s · 30 s · 36 s · 38 s · 53 s · 69 s · 78 s · 83 s
```

**C'est la réserve la plus sérieuse de ce smoke, et elle ne concerne pas le prompt : elle concerne
le fait d'en obtenir un.** Un utilisateur réel aurait vu un échec technique sur 3 de ces 8 tentatives
sans réessayer lui-même, et aurait attendu entre 27 et 83 secondes dans les autres cas. C'est
cohérent avec ce que l'arc 1D avait mesuré (p50 43 s sur le chemin Deep) et avec
`ANTHROPIC-DEEP-CAPACITY-01.md` : aucun seuil produit n'a jamais été fixé pour Deep.

### F.2 — `FOLLOW_UP-02F-A` · une phrase mal formée dans le prompt livré

```text
- Volume attendu : aussi court que le sujet le permet, sans remplissage mots.
3. Le volume tient-il dans la fourchette indiquée (aussi court que le sujet le permet,
   sans remplissage mots) sans remplissage ?
```

`ctx.mots` vaut une phrase, et le gabarit lui ajoute « mots ». Défaut **antérieur**, purement
rédactionnel, sans effet sur la contrainte — mais visible, et présent dans 2 des 4 prompts Rapide
livrés. Hors objectif de 02F ; une décision de gabarit vous revient.

### F.3 — `FOLLOW_UP-SMOKE-B` · « minimum 6 ; maximum 6 » au lieu de « exactement 6 »

Côté Architecte, une quantité exacte est encodée `min = max` — le schéma d'analyse `livrable.quantites`
n'a pas de champ `exact` — et la ligne rendue dit « minimum 6 ; maximum 6 ». Ce n'est pas faux, et le
reste du prompt dit « exactement 6 » trois fois. C'est la même dette que celle corrigée côté Rapide
en 02E. Elle vit dans la plage gelée `moteur Architecte` : **la corriger demande votre décision.**

### F.4 — `OBSERVATION` · 2 demandes simples sur 3 partent en clarification

S2 (« annuler un rendez-vous chez le dentiste ») et S3 (« paragraphe de présentation ») sont partis
en `clarification_required`. Les deux sont traitables sous hypothèse explicite. Le GARDE-FOU dit
*« les questions ne sont pas le produit »*, et c'est exactement le motif que l'arc 1D avait relevé.
Ce n'est pas un défaut de prompt — c'est une politique de readiness, et elle est hors de tout lot
en cours. Je la signale parce qu'un essai libre la rencontre immédiatement.

---

## H. ESSAIS LIBRES — ET CORRECTION DE MON PROPRE VERDICT

Le §G ci-dessous conclut `PASS sur le prompt`. **Cette conclusion était fausse, et je la corrige
ici.** Elle reposait sur des critères structurels — sections non vides, aucun espace réservé,
quantité préservée, demande reprise. Tous étaient vérifiés. Aucun ne lit ce que le prompt *dit*.

Quatre essais libres, choisis comme un utilisateur les choisirait, ont suffi.

### H.1 — `PÉRIMÈTRE DU LIVRABLE` décrit un logiciel, quelle que soit la demande

Prompt livré pour **« Fais-moi un plan de révision en 5 séances pour un examen de droit
constitutionnel dans 3 semaines »** :

```text
## PÉRIMÈTRE DU LIVRABLE
- Ce qui est demandé : la structure. Code, logique de calcul, interface, navigation,
  mise en forme, export. Cette structure est une production originale.
- Ce qui n'est pas demandé : le contenu source. Ne recopiez dans le livrable aucun
  libellé d'item, aucun extrait d'article, aucun barème publié, aucune illustration.
- Le contenu protégé est fourni séparément par l'utilisateur, à l'exécution, depuis un
  fichier local qu'il maîtrise. Prévoyez le point d'entrée correspondant…
```

La cause est explicite dans le code (ligne 3759) :

```js
perimetre: () => '## PÉRIMÈTRE DU LIVRABLE\n' + …
```

**Le projecteur ne prend aucun argument.** C'est une constante. Dès que le verrou `perimetre` est
sélectionné, ce texte part tel quel — pour un plan de révision, pour des idées de cadeaux, pour
n'importe quoi.

**Et il était déjà dans 3 des 4 prompts du smoke formel** (C1, C2, C3). « Donne exactement 7 idées
de cadeaux pour un enfant de 8 ans » reçoit un prompt qui parle de code, de navigation, d'export et
de barèmes publiés. Je ne l'ai pas vu parce que je ne l'ai pas lu — j'ai compté des sections.

### H.2 — `PROVENANCE` affirme des faits que personne n'a fournis

Prompt livré pour **« Compare les avantages et inconvénients du train et de l'avion pour
Paris-Marseille, sous forme de tableau »** — sans aucun matériau :

```text
## PROVENANCE ET USAGE DU MATÉRIAU
- Titre d'accès : accès professionnel régulier.
- Origine : matériau professionnel dont l'utilisateur dispose régulièrement.
  Le matériau nécessaire est fourni dans ce prompt…
- Usage du livrable : usage professionnel interne.
```

Trois affirmations inventées, dont une matériellement fausse : **aucun matériau n'a été fourni.**
Ce sont les valeurs de repli du projecteur (ligne 3744) quand `ctx.droit`, `ctx.provenance` et
`ctx.usage` sont vides. L'ADN interdit précisément cela : *« une information absente ne peut jamais
être décrite comme fournie, communiquée, confirmée, observée ou vérifiée »*.

### H.3 — Un prompt qui se contredit et rend la tâche infaisable

**« Corrige les fautes d'orthographe et de grammaire de ce texte »**, avec le texte fourni. Le
prompt livré contient à la fois :

```text
## DONNÉES SOURCES
<<<DONNEES
Le télétravail c'est developpé tres vite depuis 2020. …
DONNEES>>>

## PROVENANCE ET USAGE DU MATÉRIAU
- Nature de la tâche : transformation du matériau… Il ne s'agit pas de reproduire la
  source. Ne restituez pas de passage étendu de l'original ; appuyez-vous dessus.

## PÉRIMÈTRE DU LIVRABLE
- Ce qui est demandé : la structure. Code, logique de calcul, interface…
- Ce qui n'est pas demandé : le contenu source. Ne recopiez dans le livrable aucun
  libellé d'item, aucun extrait d'article…
```

Corriger un texte **exige** de le restituer. Le prompt l'interdit deux fois, et réclame du code.
Un modèle qui suit ce prompte à la lettre ne peut pas faire le travail demandé.

### H.4 — Une quantité inventée dans la vérification

Toujours sur le tableau train/avion, sans qu'aucune quantité n'ait été demandée :

```text
2. Le nombre de lignes est-il au moins 3 ?
```

Le seuil vient du profil de format. Sur un format énumérable, il est projeté dans la vérification
alors que la section `CONTRAINTES QUANTIFIÉES` n'en dit rien — le prompt contrôle donc une
contrainte qu'il n'énonce pas. C'est le symétrique du cas que 02F a gardé protégé sur les formats
non énumérables.

### H.5 — Deux observations d'usage

- **Latence** : 130 s puis 171 s sur deux essais libres, dont un `degraded_state` intermédiaire.
  Au-delà de ce que l'arc 1D avait mesuré.
- **Corps de requête** : mon harnais d'essai envoyait `{original_request, clarification_history}`
  sans `material_context`, que la production envoie toujours (`oprieBuildBody`). L'endpoint
  l'accepte, mais OPRIE n'était donc pas informé de l'absence de matériau, au lieu de l'être
  explicitement. Corrigé dans l'outil d'essai ; les mesures des §C et §E s'entendent sous cette
  réserve.

### H.6 — Verdict corrigé

```text
CHAÎNE QUANTITÉ (02E + 02F + 02F-bis)   = PASS
  valeur · modalité · cible · accents · élision · contrôlée   3/3 corpus, 3/3 smoke

PROMPT LIVRÉ DANS SON ENSEMBLE           = FAIL
  PÉRIMÈTRE hors sujet                   3/4 prompts du smoke formel + 2/4 essais libres
  PROVENANCE inventée                     2/4 essais libres
  contradiction rendant la tâche infaisable   1/4 essais libres
  quantité inventée dans la vérification      1/4 essais libres

SMOKE_PRODUIT                            = FAIL sur le contenu
BETA_ESSAYABLE                           = NON — pas en l'état
```

Les deux projecteurs en cause (`perimetre` ligne 3759, `provenance` ligne 3744) **ne sont dans
aucune plage gelée** : ils sont accessibles. Mais ce qu'il faut corriger n'est pas un mécanisme,
c'est ce que le produit *dit* — quand le verrou `perimetre` doit être sélectionné, et ce qu'une
section de périmètre doit énoncer pour une demande qui n'est pas un logiciel. C'est une décision de
produit, et elle vous appartient.

Ce que 02E, 02F et 02F-bis ont réparé tient. Ce n'est simplement pas ce qui empêche aujourd'hui
d'ouvrir une bêta.

---

## G. Verdict (structurel — voir §H pour la correction)

```text
SMOKE = ATELIER_PRODUCT_SMOKE_02F_BIS

RAPIDE_PROMPTS_LIVRÉS                = 4/4 des cas READY  (6 cas soumis)
RAPIDE_QUANTITÉ_JUSTE                = 3/3
RAPIDE_QUANTITÉ_INVENTÉE             = 0
ARCHITECTE_PROMPTS_LIVRÉS            = 2/2
ARCHITECTE_ANALYSES_VALIDES          = 2/2  (0 erreur)
SECTIONS_VIDES                       = 0/6 prompts
ESPACES_RÉSERVÉS                     = 0/6 prompts
DEMANDE_REPRISE                      = 6/6

DÉFAUTS_TROUVÉS_PAR_LE_SMOKE         = 3
DÉFAUTS_CORRIGÉS                     = 3  (cible avant le nombre · accents · élision)
DÉFAUTS_LAISSÉS_OUVERTS              = 3  (F.2 · F.3 · F.4)

FIABILITÉ_CHAÎNE                     = RÉSERVE  (3 échecs techniques sur 8 appels ; 27–83 s)

TESTS_CIBLÉS                         = 15/15 PASS  (02F, dont 3 ajoutés par le smoke)
TESTS_GLOBAUX                        = 3039/3039 PASS
FROZEN                               = PASS  (7 empreintes identiques)

SMOKE_PRODUIT                        = PASS sur le prompt
                                       RÉSERVE sur la fiabilité d'obtention
BETA_ESSAYABLE                        = OUI, sous la réserve F.1
```

Le produit livre. Sur les six prompts obtenus, ce que la personne a demandé — sa quantité, sa
modalité, ses mots — se retrouve dans le prompt qu'elle reçoit. Ce qui n'est pas fiable, c'est
d'obtenir le prompt : trois tentatives sur huit ont échoué techniquement avant d'aboutir au réessai.
C'est la seule chose qui, à mon avis, sépare cette version d'une bêta tranquille.
