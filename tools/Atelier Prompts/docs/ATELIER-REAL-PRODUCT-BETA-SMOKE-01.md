# ATELIER — REAL PRODUCT BETA SMOKE 01

**Nature** — `REAL USER PRODUCT SMOKE` · `READ / RUN / OBSERVE / REPORT`
**Sur** — `003b304` (clôture 02G)
**Produit jugé** — le prompt final réellement livré. Rien d'autre.
**`PRODUCTION_CODE_CHANGED = NO` · `PUSH = NO` · `DEPLOY = NO`**
**Aucun secret, aucune clé dans ce document.**

> Question posée : *Atelier Prompts est-il suffisamment fiable et utile pour que son propriétaire
> commence à l'essayer librement comme utilisateur bêta ?*

**Réponse : pas encore. Un blocker produit, sur un seul cas, et il annule le travail que la personne
vient de fournir.**

---

## A. Baseline

```text
git status --short -- 'tools/Atelier Prompts'   → (vide)
git branch --show-current                       → main
git rev-parse HEAD                              → 003b3045d92ad892a8eff7e5f9dbaaedce9b2410

003b304  02G (suite) GHOST_SOURCE_REFERENCE
4211aa1  02G (suite) SOURCE_COVERAGE_WITHOUT_SOURCE
4cb9b93  ATELIER-PROVENANCE-SAFE-PROMPT-PROJECTION-FIX-02G
ba11cac  SMOKE PRODUIT — correction de mon verdict
76968cf  02F-bis + SMOKE PRODUIT
1a1e285  ATELIER-QUANTITY-PROJECTION-FIX-02F
39cd74a  Merge branch 'main'
2154fc4  audit
```

Arbre de travail propre. Aucun fichier modifié pendant ce smoke.

---

## B. Méthode

| étape | réel ? |
|---|---|
| OPRIE / Arbitre | **RÉEL** — appels HTTP au Worker déployé, corps exact de `oprieBuildBody()` |
| dialogue de clarification | **RÉEL** — questions lues, réponses écrites comme une personne les écrirait |
| contrat canonique | **RÉEL** — `mapOprieToCanonicalContract` + enrichissement |
| analyse Architecte | **RÉEL** — `api.anthropic.com`, avec `ARCH_SYSTEM` et `ARCH_SCHEMA` évalués **après** leurs extensions V11.1/V11.2 |
| assemblage du prompt | **RÉEL** — moteurs Rapide et Architecte du produit |
| navigateur | simulé (harnais `vm`) — seule pièce non réelle |

**Aucun prompt synthétique. Aucune fixture canonique substituée au comportement réel.**
Clé Anthropic lue dans l'environnement du seul process appelant : jamais affichée, jamais
journalisée, jamais écrite, jamais commitée.

### Une erreur de méthode, corrigée avant de conclure

Mon premier passage Architecte transmettait à l'analyse la demande **enrichie du dialogue**. Les deux
analyses ont été refusées — 6 et 1 erreurs de citation — parce que le modèle citait des réponses
absentes de `ctx.demande`. J'ai vérifié ce que le produit fait réellement : `archContexte()` ne lit
que le champ de demande. **L'écart venait de mon harnais.** Refait à l'identique de la production,
les deux analyses valident sans une seule erreur.

Cette vérification est ce qui a mis au jour le blocker du §J.

---

## C. Corpus

8 demandes, 6 en Rapide, 2 en Architecte. Aucune n'a été choisie pour réussir.

---

## D. B1 — simple et complète · Rapide · **PASS**

```text
REQUEST  Explique la photosynthèse à un enfant de 10 ans en exactement cinq paragraphes.
```

```text
## CONTRAINTES QUANTIFIÉES
- Exactement 5 paragraphes, sans doublon.

## PÉRIMÈTRE DU LIVRABLE
- Contraintes établies par la personne, à respecter telles quelles :
  - Exactement cinq paragraphes
  - Niveau de langage et de complexité adapté à un enfant de 10 ans

## VÉRIFICATION AVANT ENVOI
2. Le nombre de paragraphes est-il exactement 5 ?
```

Quantité exacte, cible « paragraphes », destinataire préservé comme contrainte, vérification alignée.
2 116 octets, 7 sections — proportionné.
`UNSUPPORTED_ASSERTIONS = 0` · `SELF_CONTRADICTIONS = 0`.

Réserve mineure, connue (`FOLLOW_UP-02F-A`) : « Le volume tient-il dans la fourchette indiquée
(aussi court que le sujet le permet, sans remplissage mots) sans remplissage ? » — phrase mal formée,
sans effet sur la contrainte.

---

## E. B2 — comparaison structurée, sans matériau · Rapide · **RESERVE**

```text
REQUEST  Compare le train et l'avion pour un trajet, sous forme de tableau clair avec
         avantages, inconvénients et critères de choix.
```

**Non-invention : parfaite.** Aucune source fantôme, aucun fichier, aucun usage professionnel, aucun
titre d'accès. C'est exactement ce que 02G devait garantir, et c'est tenu sur le prompt livré.

**Deux réserves de fidélité :**

1. Les trois dimensions demandées — *avantages, inconvénients, critères de choix* — n'apparaissent
   **que dans le rappel de la tâche**. Aucune section ne les élève en contrainte, aucun point de
   vérification ne les contrôle. Le contrat canonique n'a retenu aucune `explicit_constraints` : il
   n'y a donc pas de section `PÉRIMÈTRE DU LIVRABLE`. L'information survit, mais sans force.
2. `« 2. Le nombre de lignes est-il au moins 3 ? »` — **une contrainte que personne n'a demandée.**
   Elle vient du seuil du profil de format, projeté par le projecteur `controle` sur les formats
   énumérables. Le prompt contrôle ainsi une quantité qu'il n'énonce nulle part.

Même réserve n°2 sur B5. Aucune des deux n'atteint le seuil de blocker du §13 : le prompt reste
vrai, cohérent et utilisable ; « au moins 3 lignes » est satisfait d'office par tout tableau
comparatif.

---

## F. B3 — matériau réellement fourni · Rapide · **PASS**

```text
REQUEST   Corrige ce texte en conservant le sens
MATÉRIAU  "Les utilisateur doit pouvoir retrouvé facilement leurs documents et les classé."
```

```text
## DONNÉES SOURCES
<<<DONNEES
Les utilisateur doit pouvoir retrouvé facilement leurs documents et les classé.
DONNEES>>>

## PROVENANCE ET USAGE DU MATÉRIAU
- Le matériau à traiter est fourni dans ce prompt … Travaillez dessus : n'en vérifiez pas
  l'accès, n'en recherchez pas d'autre copie, ne demandez pas confirmation avant de commencer.

## PÉRIMÈTRE DU LIVRABLE
  - Le sens du texte original doit être intégralement conservé
```

Matériau correctement délimité et déclaré fourni — c'est vrai. **Aucune interdiction contradictoire,
aucune demande de code** : la tâche de transformation est exécutable. C'est précisément le cas qui
échouait avant 02G, et il est réparé sur le prompt livré.

---

## G. B4 — quantité différente · Rapide · **PASS**

```text
REQUEST    Donne exactement sept idées originales de cadeaux pour un enfant de 8 ans.
DIALOGUE   Q : « L'enfant a-t-il des centres d'intérêt marqués … ? »
           R : « Il aime beaucoup la nature et les expériences scientifiques. »
```

```text
## CONTRAINTES QUANTIFIÉES
- Exactement 7 idées, sans doublon.

## PÉRIMÈTRE DU LIVRABLE
  - Exactement sept idées — ni plus, ni moins
  - Destinataire : enfant de 8 ans
  - Thématiques : nature et expériences scientifiques      ← réponse du dialogue intégrée

## VÉRIFICATION AVANT ENVOI
2. Le nombre d'idées est-il exactement 7 ?
```

`7` conservé · cible **« idées »** conservée · **« exactement »** conservé · ni « au moins 7 » ni
« 7 éléments ». Tout ce que 02E/02F/02F-bis visaient est tenu sur un cas neuf, et la réponse au
dialogue est intégrée comme contrainte.

**Réserve de conception, pas de prompt** : la question posée portait sur une lacune que l'Arbitre
avait lui-même classée `substituable = True`, `recommended_treatment = estimate`. Une demande complète
et chiffrée a donc reçu une question là où son propre diagnostic prévoyait une estimation. Voir §J.2.

---

## H. B5 — périmètre / exclusion explicite · Rapide · **PASS**

```text
REQUEST    Prépare un prompt pour construire une checklist de voyage. Inclus transport,
           hébergement et documents. N'inclus ni restaurants ni activités touristiques.
DIALOGUE   Q : « … un prompt à soumettre à une IA, ou un gabarit prêt à remplir ? »
           R : « Un prompt à soumettre à une IA, qui lui fera générer la checklist. »
```

```text
## PÉRIMÈTRE DU LIVRABLE
  - La checklist générée par l'IA doit couvrir les catégories : transport, hébergement, documents
  - La checklist générée par l'IA ne doit inclure ni restaurants ni activités touristiques
```

**Inclusions et exclusions conservées, et conservées au bon niveau** : l'Arbitre a compris le
méta-niveau (« la checklist générée par l'IA »), ce qui est le point délicat de cette demande.
Aucun périmètre inventé. La question posée était la plus utile du corpus : `deliverable_unclear`,
`substituable = False`. Réserve : la même ligne « au moins 3 éléments » qu'en B2.

---

## I. B6 — destinataire / usage explicite · Rapide · **PASS**

```text
REQUEST    Crée un prompt pour rédiger un email professionnel destiné à mon responsable afin
           de demander un changement d'horaire. Le ton doit rester cordial et concis.
DIALOGUE   Q : « ponctuel ou récurrent ? »   R : « ponctuel, le vendredi 3 octobre. »
```

```text
## PÉRIMÈTRE DU LIVRABLE
  - Ton cordial et concis
  - Destinataire : le responsable de l'utilisateur
  - Changement d'horaire ponctuel, limité au vendredi 3 octobre

## INTERDICTIONS
- Aucune adresse à l'utilisateur de l'atelier : le message s'adresse uniquement à son
  destinataire final.
```

Destinataire, usage, ton, livrable : les quatre préservés. **Aucune information personnelle
inventée** — pas de nom, pas d'entreprise, pas de motif supposé. L'interdiction spécifique aux
formats de communication est pertinente et bien placée.

---

## J. B7 — demande ambiguë · Architecte · **FAIL — BETA BLOCKER**

```text
REQUEST   Aide-moi à préparer une présentation.
```

### J.1 — Le dialogue, d'abord : correct dans sa forme

Six échanges, **une seule question à la fois**, jamais de questionnaire simultané :

```text
Q1  Sur quel sujet ou thème porte la présentation ?
Q2  Sous quelle forme souhaitez-vous recevoir le livrable … ?
Q3  « bilan annuel » : compte-rendu d'activité ou bilan financier ?
Q4  Pouvez-vous communiquer les éléments concrets, ou préférez-vous une trame générique ?
Q5  Votre réponse confirme-t-elle que vous souhaitez une trame entièrement générique … ?
C6  confirmation des ambiguïtés résolues  →  operational_request_ready
```

`QUESTION_COUNT_BEFORE_USEFUL_PROGRESS = 5` · `QUESTION_WAS_NECESSARY = YES` pour Q1–Q4
(toutes `substituable = False`, `recommended_treatment = question`).

**Q5 est une répétition** : elle redemande confirmation d'une réponse déjà donnée en Q4. Cinq
questions pour une demande de quatre mots est défendable ; redemander la même chose ne l'est pas.

### J.2 — Le prompt livré se contredit, dans le même document

```text
## OBJECTIF
Préparer une trame de présentation générique pour un bilan annuel d'activité de service,
destinée à être présentée à la direction en 15 minutes

## FORMAT DE SORTIE
- Livrable : Une trame de diapositives structurée … couvrant les rubriques typiques d'un bilan
  annuel d'activité (réalisations, projets menés, indicateurs clés, faits marquants) et
  calibrée pour une présentation orale de 15 minutes
```

puis, treize lignes plus bas :

```text
## Questionner sur le sujet
Demandez à l'utilisateur : "Quel est le sujet ou le thème de votre présentation ?"
Cette information détermine l'intégralité de l'approche structurelle et du contenu.

## Questions de cadrage complémentaires
Une fois le sujet connu, précisez si nécessaire : Quel est votre objectif … ?
Quelle est la durée prévue ? Quel est le profil du public ?

## VÉRIFICATION AVANT ENVOI
- Le sujet de la présentation doit être connu pour produire un livrable complet
```

**Le prompt énonce le sujet, le public et la durée — puis ordonne au modèle de demander le sujet et
la durée, et de vérifier que le sujet est connu avant de produire.**

```text
VISIBLE_FAILURE = le prompt livré demande au modèle de reposer les questions auxquelles la
                  personne vient de répondre, et conditionne la production à une information
                  qu'il contient déjà.
```

### J.3 — Première cause prouvée

Deux moitiés du même prompt sont construites à partir de **deux états différents de la
conversation** :

```text
accueil, transfert vers l'Architecte           (ligne 7508)
  const demande = $('#accueil-demande').value.trim();
  $('#arch-demande').value = demande;
  → le texte BRUT saisi. Les réponses du dialogue ne sont jamais repliées dedans.

archPreparerAvecApi()                          (ligne ~9050)
  runOprieTurnWithExecutor({original_request: c.demande, clarification_history: []})
  → clarification_history VIDE, en dur.

archContexte()                                 (ligne ~8497)
  → ne lit que le champ de demande.
```

Conséquence enchaînée, vérifiée sur l'exécution réelle :

```text
l'ANALYSE Architecte ne voit que « Aide-moi à préparer une présentation. »
  → action_recommandee = questionner
  → composants retenus : « Questionner sur le sujet », « Questions de cadrage complémentaires »

le CONTRAT canonique, construit depuis le tour READY, porte TOUTES les réponses
  → OBJECTIF, FORMAT DE SORTIE, PRÉFÉRENCES : exacts

archCompiler() fusionne les deux dans un seul prompt.
```

```text
FIRST_PROVEN_CAUSE = en Architecte, les réponses de clarification alimentent le contrat
                     canonique mais jamais l'entrée de l'analyse ; l'analyse juge donc la
                     demande d'origine et ses composants, compilés avec le contrat enrichi,
                     contredisent ce que le contrat établit.
```

```text
USER_IMPACT = la personne répond à cinq questions, puis reçoit un prompt qui fera reposer
              ces questions. Le dialogue est annulé au dernier pas. Sur une demande
              initialement vague — le cas où l'Architecte est le plus utile — le produit
              rend un artefact contradictoire.
```

Conformément au §14 : **arrêt, aucune correction, aucune recherche de défaut supplémentaire.**

---

## K. B8 — demande complexe multi-contraintes · Architecte · **PASS**

```text
REQUEST    Crée un prompt pour comparer trois stratégies possibles de remplacement d'un
           logiciel de gestion de projet dans une petite entreprise. […] avantages, risques,
           coûts, conséquences organisationnelles et critères de décision, puis une
           recommandation finale argumentée. […] structuré et immédiatement exploitable.
DIALOGUE   Q : « immédiatement exploitable : (A) prompt autonome ou (B) avec espaces réservés ? »
           R : « (A) un prompt complet et autonome. »
           C : confirmation de deux délégations  →  READY
```

15 224 octets, 21 sections, niveau `approfondi`.

```text
## OBLIGATIONS À RESPECTER
- Le prompt produit couvre explicitement les cinq dimensions demandées pour chaque stratégie
- Une recommandation finale argumentée est structurellement exigée
- Le format de sortie est exploitable immédiatement (markdown structuré avec tableaux)
- Les trois stratégies sont analysées de manière homogène et comparable
```

**Les cinq dimensions, les trois stratégies et la recommandation finale sont toutes conservées**, et
élevées en obligations vérifiées. La réponse « (A) autonome » se retrouve dans « immédiatement
soumissible sans modification ».

Non-invention exemplaire — le contenu apporté est **étiqueté** :

```text
## PROVENANCE DES AFFIRMATIONS
- Les trois stratégies types (SaaS marché, on-premise alternatif, open-source) sont les
  options couramment rencontrées en contexte PME — non vérifiée
- Le TCO sur 3 ans est un horizon standard pour l'évaluation de solutions IT — non vérifiée
- Une petite entreprise privilégie la simplicité opérationnelle … — hypothèse
```

et réversible : *« Si les stratégies réellement envisagées sont différentes, remplacez ces scénarios
types par les options spécifiques à analyser. »*

Aucune contrainte métier inventée. `HYPOTHÈSES INTERDITES` interdit explicitement de recommander
sans analyse et de donner des montants précis sans contexte. **Le point remarquable : la
confirmation de délégation.** Avant de produire, OPRIE a nommé les deux décisions qu'il avait prises
seul — choix des trois stratégies, profil de l'entreprise — et a demandé validation. C'est la
non-invention appliquée au dialogue, pas seulement au texte.

---

## L. Rapide — `RAPIDE_USABLE = PASS`

6 cas, **6 prompts livrés**. Fidélité 5/6 (B2 en réserve), non-invention 6/6, contradictions 0/6,
contraintes explicites préservées 6/6, proportionnalité 6/6, utilisabilité immédiate 6/6.

La chaîne quantité réparée en 02E/02F/02F-bis tient sur des cas neufs : « exactement cinq
paragraphes » → `Exactement 5 paragraphes` ; « exactement sept idées » → `Exactement 7 idées`. Les
garanties de non-invention de 02G tiennent : zéro source fantôme, y compris sur B2 qui est
précisément le cas qui les avait révélées.

---

## M. Architecte — `ARCHITECTE_USABLE = FAIL`

2 cas, 2 prompts livrés, mais **1 contradictoire**.

B8 montre que l'Architecte sait produire un prompt de haute qualité sur une demande riche : 21
sections, provenance étiquetée, obligations vérifiables, délégations confirmées.

B7 montre que dès qu'un dialogue de clarification a été nécessaire, le prompt produit contredit ce
que ce dialogue a établi. Or **la demande vague est le cas d'usage principal de l'Architecte**. Le
mode n'est donc pas utilisable en confiance en l'état.

Observation de conception, non fautive : le mode Architecte n'héberge pas le dialogue et renvoie
explicitement vers le parcours « Préparer une demande » — *« les précisions y sont demandées une par
une »*. Le message est clair et honnête. Le défaut n'est pas là : il est que ce parcours ne transmet
ensuite à l'analyse que le texte d'origine.

---

## N. Fidélité

| cas | objectif | quantité | exclusions | matériau | destinataire | format | ajout non demandé |
|---|---|---|---|---|---|---|---|
| B1 | ✓ | ✓ 5 | — | — | ✓ 10 ans | ✓ | — |
| B2 | ✓ | — | — | — | — | ✓ | « au moins 3 lignes » |
| B3 | ✓ | — | — | ✓ | — | ✓ | — |
| B4 | ✓ | ✓ 7 | — | — | ✓ 8 ans | ✓ | — |
| B5 | ✓ | — | ✓ | — | — | ✓ | « au moins 3 éléments » |
| B6 | ✓ | — | — | — | ✓ | ✓ | — |
| B7 | ✓ | — | — | — | ✓ | ✓ | **questions déjà répondues** |
| B8 | ✓ | ✓ 3 | ✓ | — | — | ✓ | — |

`FIDELITY_PASS = 6/8` (B2 réserve, B7 échec).

---

## O. Non-invention

Recherche effective, dans chaque prompt, de : faits absents, source/matériau fantôme, fichier,
usage, droit ou licence, contexte professionnel, technologie, livrable secondaire.

```text
UNSUPPORTED_ASSERTIONS = 0   sur les 8 prompts
```

Les seules affirmations apportées par le produit sont, en B8, explicitement étiquetées
« non vérifiée » ou « hypothèse » dans `PROVENANCE DES AFFIRMATIONS`, et présentées comme
remplaçables. C'est la différence entre apporter et inventer.

Aucun prompt sans matériau ne mentionne un matériau, des données sources, un fichier, un titre
d'accès ou un usage professionnel. La classe `GHOST_SOURCE_REFERENCE` fermée en 02G reste fermée sur
huit cas neufs.

---

## P. Contradictions

```text
B1 · B2 · B3 · B4 · B5 · B6 · B8   →  aucune
B7                                  →  UNE, structurelle (§J.2)
```

`SELF_CONTRADICTIONS = 1`.

Aucun couple « utiliser le matériau » / « ne pas le restituer » — le défaut majeur d'avant 02G —
n'est réapparu, y compris sur B3 qui est exactement ce cas.

---

## Q. Proportionnalité

| cas | octets | sections | jugement |
|---|---|---|---|
| B1 | 2 116 | 7 | chaque section sert : rôle, tâche, périmètre, format, quantité, interdits, contrôle |
| B2 | 1 933 | 6 | sobre ; c'est plutôt de contrainte qu'il manque |
| B3 | 2 996 | 9 | justifié : matériau, provenance, périmètre |
| B4 | 2 412 | 8 | justifié |
| B5 | 1 747 | 6 | le plus court du corpus, pour la demande la plus cadrée — bon signe |
| B6 | 2 438 | 7 | justifié |
| B7 | 7 172 | 17 | disproportionné, et pour une mauvaise raison : quatre composants sur six servent à questionner |
| B8 | 15 224 | 21 | proportionné à une demande à cinq dimensions et trois options |

`PROPORTIONALITY_PASS = 7/8`. Aucune demande simple n'est devenue une usine à gaz : B1, B4 et B5
restent entre 1 747 et 2 412 octets.

---

## R. Fiabilité technique

| cas | tours | états rencontrés | latences (s) |
|---|---|---|---|
| B1 | 1 | READY | 23,1 |
| B2 | 1 | READY | 56,3 |
| B3 | 1 | READY | 34,1 |
| B4 | 2 | clarification → READY | 55,3 · 36,6 |
| B5 | 2 | clarification → READY | 95,2 · 26,9 |
| B6 | 2 | clarification → READY | 77,9 · 61,2 |
| B7 | 6 | 5 × clarification → confirmation → READY | 99,7 · 146,5 · 106,3 … |
| B8 | 3 | **degraded_state** → clarification → confirmation → READY | 68,6 · 72,7 · 72,1 |

```text
TECHNICAL_FAILURES = 0
DEGRADED_STATES    = 1   (B8, résolu au réessai unique)
TIMEOUTS           = 0
latence par échange : 23 à 147 s · médiane ≈ 70 s
```

**Meilleur que les smokes précédents** : 1 état dégradé sur 18 appels, contre 3 échecs sur 8
auparavant. Aucun échec n'a empêché d'exécuter le corpus. Par le §13, ce n'est **pas** un blocker.

Mais l'expérience reste lente : B7 a demandé environ **dix minutes d'attente cumulée** pour six
échanges. Ce n'est pas un blocker, c'est ce que la personne ressentira d'abord.

---

## S. Tests finaux

```text
GLOBAL = 3058 / 3058 pass / 0 fail
FROZEN = PASS  (sept empreintes inchangées)
fichiers modifiés pendant le smoke = 0
```

**La suite est verte et le blocker existe quand même.** C'est le point de méthode de ce smoke :
aucun des 3 058 tests ne lit un prompt livré en se demandant s'il se contredit. `T-02G-09` vérifie
l'absence de contradiction *matériau*, pas l'absence de contradiction *dialogue*. Un compteur vert
n'a jamais transformé un prompt faux en PASS, et ne l'a pas fait ici.

---

## T. Verdict bêta

Sept cas sur huit sont bons, et plusieurs le sont franchement : B4 et B6 intègrent la réponse du
dialogue comme une contrainte, B3 est exactement le cas qui échouait avant 02G, B8 étiquette ce
qu'il apporte et fait confirmer ses délégations avant de produire. Les corrections 02E à 02G tiennent
sur des cas neufs.

Un cas casse, et il casse là où ça compte : quand la personne a pris le temps de répondre. B7 lui
rend un prompt qui lui reposera ses propres questions. Ce n'est pas cosmétique, ce n'est pas de la
dette inactive — c'est un prompt contradictoire sur le mode et le scénario où l'Architecte est censé
être le plus utile.

Je ne peux donc pas dire que le produit est prêt à être essayé librement. Il l'est pour le Rapide.
Il ne l'est pas pour l'Architecte après un dialogue.

```text
SUBLOT = REAL_PRODUCT_BETA_SMOKE

PRODUCT_TESTED                 = FINAL_PROMPT_AS_DELIVERED_TO_USER

CASES_EXECUTED                 = 8/8
RAPIDE_CASES                   = 6
ARCHITECTE_CASES               = 2
FINAL_PROMPTS_PRODUCED         = 8/8

FIDELITY_PASS                  = 6/8   (B2 RESERVE · B7 FAIL)
NON_INVENTION_PASS             = 8/8
NO_CONTRADICTION_PASS          = 7/8   (B7)
EXPLICIT_CONSTRAINTS_PRESERVED = 7/8   (B2)
PROPORTIONALITY_PASS           = 7/8   (B7)
IMMEDIATE_USABILITY_PASS       = 7/8   (B7)

QUESTIONS_ONLY_WHEN_NEEDED     = PASS
  (1 question à la fois, 8/8 ; nécessaires sur B5, B7-Q1..Q4, B8 ;
   discutables sur B4 et B6 — lacunes classées substituables par l'Arbitre lui-même ;
   1 répétition réelle : B7-Q5 redemande une réponse déjà donnée)

RAPIDE_USABLE                  = PASS
ARCHITECTE_USABLE              = FAIL

TECHNICAL_FAILURES             = 0
DEGRADED_STATES                = 1
UNSUPPORTED_ASSERTIONS         = 0
SELF_CONTRADICTIONS            = 1

BETA_BLOCKERS                  = 1

TARGETED_TESTS                 = 3058/3058 PASS (aucun test ciblé ajouté : smoke en lecture seule)
GLOBAL_TESTS                   = 3058/3058 PASS
FROZEN                         = PASS

PRODUCTION_CODE_CHANGED        = NO
PUSH                           = NO
DEPLOY                         = NO

REPORT                         = docs/ATELIER-REAL-PRODUCT-BETA-SMOKE-01.md

BETA_STATUS                    = NOT_READY

NEXT_SAFE_ACTION               = en Architecte, les réponses de clarification n'atteignent pas
                                 l'entrée de l'analyse : le transfert accueil → Architecte
                                 recopie le texte brut saisi et archPreparerAvecApi appelle
                                 OPRIE avec clarification_history vide. L'analyse conclut
                                 « questionner » et ses composants contredisent, dans le même
                                 prompt, le contrat enrichi qui porte les réponses.
```

---

### Ce qui n'est pas un blocker, et que je consigne sans y toucher

1. `« au moins 3 lignes / éléments »` — seuil de profil projeté dans la vérification sur les formats
   énumérables, sans contrainte correspondante. B2, B5.
2. B2 — les dimensions demandées ne sont pas élevées en contraintes faute d'`explicit_constraints`
   dans le contrat.
3. `FOLLOW_UP-02F-A` — « sans remplissage mots », défaut rédactionnel antérieur.
4. B4 et B6 — questions posées sur des lacunes que l'Arbitre a classées `substituable = True`.
5. B7-Q5 — une question qui redemande une réponse déjà donnée.
6. Latence — 23 à 147 s par échange ; environ dix minutes cumulées pour B7.
