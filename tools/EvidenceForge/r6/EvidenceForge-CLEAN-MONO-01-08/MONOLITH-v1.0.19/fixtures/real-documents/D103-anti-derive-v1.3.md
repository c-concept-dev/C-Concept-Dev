# D103 - FEUILLE DE ROUTE MAITRE / ANTI-DERIVE v1.3
## Je marche comme je suis
### Base de pilotage a utiliser si le projet s'ecarte du cap

**Date :** 21 aout 2026  
**Reference produit :** D103 v4.1 - moteur Activite global / local-first / LLM-assisted  
**Reference revue :** D103C3 v2.0  
**Statut :** document de pilotage operationnel  
**Regle :** si une proposition future contredit cette feuille, revenir d'abord au CDC v4.1 avant de coder.

## Mise a jour v1.3 - etat reel au 21 aout 2026

Cette revision enregistre l'etat reel apres D103B3 et D103P0-00N, et clarifie la methode des cas sentinelles :

- l'accueil utilisateur reste organise autour de **deux portes** : `Ma balade sur mesure` et `Mon elan sante` ;
- `gentle_return`, `maintain` et `progress` restent des intentions utilisateur de la branche Activite, jamais trois moteurs ;
- D103B2 a supprime toute selection silencieuse d'une intention a l'entree dans `Mon elan sante` ;
- D103B3 a uniformise l'identite visuelle et les logos sur les ecrans conserves ;
- **D103B / D103B2 / D103B3 sont desormais geles hors bug** ;
- D103P0-00N a retire les prototypes anticipes D103C/C2/D/E et leurs raccords actifs non conformes ;
- la branche `Mon elan sante` ouvre temporairement un ecran neutre sans collecte, recommandation ni raccord au moteur Balade ;
- **D103P0-00N est gele hors bug** ;
- P0.0 demarre sur deux cas sentinelles reels, de-identifies et volontairement contrastes ;
- ces deux cas ne constituent **ni un echantillon representatif, ni une validation de couverture populationnelle** ;
- aucune matrice de diversite, taxonomie generale ou batterie de cas synthetiques ne doit etre construite avant P0.1/P0.2 ;
- les variantes fictives restent en P0.8 et ne peuvent varier que des dimensions effectivement justifiees par les cas reels, la revue professionnelle et les etapes precedentes ;
- la page definitive `Comment etes-vous aujourd'hui ?` reste reportee a D103C.

Le CDC D103 v4.1 reste l'autorite produit. Cette v1.3 ne modifie ni l'architecture scientifique ni le moteur cible ; elle corrige l'etat operationnel et renforce l'anti-deriva methodologique de P0.

---

# 1. CAP PRODUIT - NE PAS LE MODIFIER SANS DECISION EXPLICITE

JMJS contient **deux produits complementaires** :

## A. ME BALADER

Objectif :
> proposer une vraie balade adaptee aux envies et contraintes du moment.

Architecture :

```text
utilisateur
-> preparer ma balade
-> contraintes / envies / temps
-> ORS
-> 0 a 3 parcours reels
-> GPX / suivi / export
```

Regles :
- `activityIntent = leisure`
- moteur D102G3 conserve
- ORS reste le moteur geographique
- pas de logique d'entrainement
- pas de course / renforcement
- aucune regression toleree

## B. ACTIVITE PHYSIQUE

Intentions utilisateur :

```text
gentle_return = Reprendre doucement
maintain      = Maintenir mon rythme
progress      = Progresser
```

**Ces trois intentions ne sont pas trois moteurs.** Elles orientent un moteur Activite global unique.

Objectif :
> construire des seances adaptees a la personne, a son historique, a son etat connu, a son evolution et a ce qu'elle souhaite aujourd'hui.

Le moteur distingue toujours :

```text
requestedIntent = souhait utilisateur
decision        = explore | maintain | reduce | clarify
sessionStrategy = forme concrete de la seance
```

Modalites possibles a terme :
- marche
- marche active
- marche-course
- course
- renforcement
- gainage
- activite mixte
- recuperation active
- autres modalites uniquement apres validation

Architecture :

```text
profil longitudinal
+ historique reel
+ temps ecoule
+ contexte actuel connu
+ objectif
-> moteur local
-> strategie
-> seance
-> route ORS seulement si necessaire
-> execution
-> retour qualite
-> memoire mise a jour
```

---

# 2. ARCHITECTURE IA - DECISION GELEE

## Principe

**LOCAL FIRST. LLM ASSISTED. JAMAIS LLM DEPENDENT.**

Le moteur local doit pouvoir produire une seance valide sans API.

Le LLM peut seulement :
- reformuler
- expliquer
- varier
- structurer un commentaire libre
- aider a departager des options deja valides

Le LLM ne peut jamais :
- inventer une donnee
- ajouter un exercice non valide
- outrepasser le suitability gate
- rendre valide une seance invalide
- diagnostiquer
- decider seul d'une progression

Architecture fournisseur cible :

```text
Groq = primaire
OpenAI = fallback 1
Anthropic = fallback 2
```

Toute sortie LLM repasse par un **validateur local final**.

Si toutes les API sont indisponibles :
> JMJS continue de fonctionner.

---

# 3. MOTEUR LONGITUDINAL - COMPORTEMENT ATTENDU

L'application connait l'utilisateur dans le temps.

Elle conserve localement :
- anamnese / baseline
- preferences
- objectifs
- materiel
- environnement
- seances prevues
- seances reellement faites
- reactions pendant
- reactions apres
- reactions plus tard
- commentaires utiles
- dates et intervalles entre seances
- provenance / qualite des donnees

## Regle majeure

**Ne jamais refaire inutilement l'anamnese.**

A chaque retour :
- J+1
- J+2
- J+7
- J+21
- plusieurs mois plus tard

le moteur reutilise ce qu'il sait deja.

Le temps ecoule est un **contexte**, jamais un coefficient.

INTERDIT :

```text
3 semaines sans activite
-> baisse automatique de 30 %
```

ATTENDU :

```text
temps ecoule
+ derniere seance reelle
+ historique comparable
+ reactions
+ intention
+ contexte actuel disponible
-> strategie du jour
```

---

# 4. QUESTIONS DU JOUR - MINIMUM STRICT

L'utilisateur ne doit pas remplir un nouveau questionnaire a chaque seance.

UX cible possible :

> Quelque chose d'important a change aujourd'hui ?
> Non / Oui

et/ou :

> Quelque chose a me signaler aujourd'hui ?
> [champ libre facultatif]

Regle :
- ne demander que ce qui est vraiment necessaire
- ne pas redemander une information stable connue
- ne pas inventer une donnee du jour absente

Etats de connaissance :

```text
stable_known
last_known
today_confirmed
unknown_today
```

`unknown_today` reste inconnu.

---

# 5. ADAPTATION PENDANT LA SEANCE

Le moteur ne s'arrete pas a la proposition initiale.

Il peut reagir a :

```text
block_completed
block_skipped
recovery_extended
user_slows_down
user_stops
user_requests_easier
user_requests_continue
duringReaction
```

Adaptations possibles apres validation :
- prolonger une recuperation
- proposer une variante plus simple
- supprimer un bloc non essentiel
- stopper une progression
- terminer plus tot
- revenir a une logique de maintien

Interdit :
- diagnostic
- augmentation silencieuse de plusieurs dimensions
- invention de regles non sourcees

---

# 6. RETOUR QUALITE - BOUCLE D'APPRENTISSAGE

Apres chaque seance, recueillir peu d'informations mais utiles.

Minimum cible :
- seance terminee ou non
- difficulte globale qualitative
- aurait pu continuer / non
- besoin de recuperation supplementaire
- reaction inhabituelle
- commentaire libre facultatif

Puis :

```text
planned
vs
actual
vs
reactions
vs
contexte
-> mise a jour de la memoire
-> prochaine decision
```

La memoire n'est pas un score de capacite maximale.

---

# 7. REGLES SCIENTIFIQUES - INVARIANTS

Toujours respecter :

1. fonction avant diagnostic
2. personne comparee a elle-meme
3. etat habituel != etat du jour
4. age jamais decisionnel seul
5. douleur jamais decisionnaire seule
6. inconnu reste inconnu
7. pas de score composite cache
8. pas de progression universelle arbitraire
9. pas de coefficient automatique de deconditionnement
10. prevu != reel
11. provenance des donnees
12. adaptation explicable
13. progression non imposee
14. suitability separe du composer
15. aucune inference diagnostique automatique
16. toute regle scientifique doit etre sourcee
17. toute heuristique produit doit etre nommee comme telle
18. un LLM ne complete jamais une donnee manquante

---

# 8. P0 - CAS SENTINELLES AVANT TAXONOMIE GENERALE

NE PAS commencer par une taxonomie abstraite des capacites physiques.

Ordre :

```text
cas sentinelles reels de-identifies
-> revue professionnelle de structure
-> besoins fonctionnels observes
-> taxonomie minimale
-> premieres regles
-> premieres fiches exercices
-> simulation longitudinale
-> revision
-> extension eventuelle
```

Les cas servent a reveler la structure necessaire.
Ils ne deviennent jamais des profils types ou des raccourcis diagnostiques.

## 8.1 Portee epistemologique des cas sentinelles

Les deux cas sentinelles de P0.0 sont des **cas de rupture / stress tests humains reels**, choisis pour etre contrastes et informatifs. Ils ne sont pas un echantillon statistique et ne permettent aucune inference de representativite populationnelle.

Ils servent uniquement a :
- mettre en defaut des hypotheses prematures ;
- faire emerger des besoins de representation concrets ;
- identifier des donnees potentiellement necessaires ;
- fournir une base factuelle a la revue professionnelle de structure.

INTERDIT avant P0.1 / P0.2 :
- conclure qu'une dimension observee chez un ou deux cas est generale ;
- construire une matrice de diversite a priori pour compenser le faible nombre de cas ;
- fabriquer 8 a 12 cas synthetiques avant la revue professionnelle ;
- figer une taxonomie parce qu'elle semble raisonnable en theorie ;
- presenter les deux cas comme representatifs de la population cible.

Le principe est :

```text
2 cas reels contrastes
-> revue professionnelle
-> besoins fonctionnels observes
-> taxonomie minimale candidate
-> moteur pilote
-> trajectoires
-> variantes fictives seulement ensuite
```

## 8.2 Regle pour P0.8 - variantes fictives et couverture

Les variantes fictives de P0.8 servent a tester la robustesse d'une structure deja confrontee au reel. Elles ne servent pas a inventer retrospectivement la structure.

Les axes de variation utilises en P0.8 doivent etre justifies par au moins une des sources suivantes :
- besoin observe dans un cas sentinelle ;
- point identifie lors de la revue professionnelle ;
- dimension retenue dans la taxonomie minimale P0.2 ;
- comportement necessaire observe lors des simulations P0.5-P0.7.

Une matrice de couverture peut etre construite **a partir de P0.8 seulement**, si elle aide a verifier les dimensions deja justifiees. Elle ne doit pas devenir une taxonomie parallele inventee a priori.

## Chaine qualite d'une regle

```text
source
-> principe scientifique
-> interpretation JMJS
-> regle produit
-> statut scientifique / heuristique
-> test
```

## Trois validations distinctes

1. scientifique : la source soutient le principe ;
2. professionnelle : la traduction fonctionnelle est raisonnable ;
3. produit : le logiciel ne depasse pas la regle.

## Demarrage P0

Commencer par :

```text
5 a 8 regles
5 a 8 fiches exercices prototypes
2 cas sentinelles
```

Puis seulement, si utile :

```text
10 a 15 regles
10 a 15 exercices
20 a 30 profils / variantes fictifs
```

Generaliser apres observation.

---

# 9. EXERCICES - GOUVERNANCE

Workflow obligatoire :

```text
draft
-> professional_review_pending
-> validated
-> published
```

Seuls les exercices `published` peuvent etre proposes en production.

Validation professionnelle :
- versionnee
- datee
- qualification du relecteur
- reserves conservees
- sources conservees

Pas de logique :
> diagnostic -> exercice interdit

Le filtrage doit rester fonctionnel.

---

# 10. FILTRAGE FONCTIONNEL EN AMONT

Avant de composer une seance, certains blocs peuvent etre filtres selon des prerequis fonctionnels.

Exemples candidats :
- passage au sol
- retour du sol
- besoin d'une chaise
- appui stable
- appui unipodal
- impact
- materiel
- environnement

Trois niveaux a ne pas confondre :

```text
AVANT
filtrer les blocs candidats

PENDANT
ralentir / variante / stop / clarification

APRES
apprendre de l'experience
```

La mecanique finale doit etre validee par D103C3.

---

# 11. SUITABILITY GATE

Sorties de travail :

```text
proceed
proceed_without_progression
clarify
professional_advice_recommended
```

Le gate ne doit jamais :
- diagnostiquer
- calculer un risque medical
- transformer une pathologie en programme
- remplacer un professionnel

D103C3 doit definir :
- les donnees utilisables
- le niveau de filtrage fonctionnel autorise
- les formulations
- les limites de l'individualisation

---

# 12. CONFIDENTIALITE

Par defaut :
> donnees longitudinales et anamnese en local.

Si un LLM externe est utilise :
- pas d'anamnese brute par defaut
- contexte fonctionnel minimise
- aucun identifiant direct
- traitement externe clairement documente
- politique de confidentialite coherente
- arbitrage D103C3 avant production

Ne jamais afficher "vos donnees restent ici" si un mode actif transmet effectivement des donnees externes sans explication.

---

# 13. FEUILLE DE ROUTE OFFICIELLE

## PHASE 0 - BASE STABLE

### D103A
Coeur longitudinal initial  
**STATUT : FAIT / CONSERVE**

### D103A2
Persistance / migrations / confidentialite  
**STATUT : FAIT / CONSERVE**

### D103B
Accueil principal refondu en **2 portes utilisateur** :

```text
Ma balade sur mesure
Mon elan sante
```

**STATUT : FAIT / VISUEL VALIDE**

Regles gelees :
- `Ma balade sur mesure` ouvre la branche `leisure` ;
- `Mon elan sante` ouvre la branche Activite globale ;
- `gentle_return`, `maintain` et `progress` ne sont plus trois cartes d'accueil ;
- aucune des trois intentions Activite ne doit etre choisie silencieusement par l'accueil.

### D103B2
Alignement **2 portes UI <-> moteur Activite global**.

Realise :
- conservation des quatre valeurs internes `leisure`, `gentle_return`, `maintain`, `progress` pour compatibilite et longitudinal ;
- suppression de l'attribution implicite de `gentle_return` / `maintain` a l'entree dans `Mon elan sante` ;
- recueil explicite de l'objectif / intention dans la branche Activite ;
- maintien d'un seul moteur Activite global.

**STATUT : FAIT / CONSERVE**

### D103B3
Uniformisation finale de l'identite visuelle avant gel.

Realise :
- inventaire des logos / marques visibles sur les ecrans conserves ;
- remplacement des anciens logos par l'identite visuelle validee ;
- uniformisation du header de **Preparer ma balade** ;
- verification desktop + responsive ;
- aucun changement du moteur, des formulaires, d'ORS / GPX.

**STATUT : FAIT / VISUEL VALIDE / GELE HORS BUG**

> **D103B + D103B2 + D103B3 sont geles hors bug.**

A ne pas casser :
- `leisure`
- ORS
- GPX
- POI
- services
- suivi
- PWA
- persistance D103A/A2
- raccord explicite des intentions Activite

### D103P0-00N
Nettoyage des prototypes anticipes actifs avant demarrage des cas sentinelles.

Realise :
- retrait des modules anticipes baseline / today / adaptation / presenter ;
- retrait des tests associes ;
- suppression des raccords actifs vers les regles non validees ;
- suppression du coefficient automatique de reprise et des marges de prudence inventees ;
- conservation integrale de D103A/A2/B/B2/B3 et de la branche `leisure` ;
- `Mon elan sante` raccorde temporairement a un ecran neutre sans collecte ni recommandation ;
- build, audit et suite complete valides.

**STATUT : FAIT / GELE HORS BUG**

---

# 14. PHASE 1 - DEUX CHANTIERS EN PARALLELE

## D103C3 - CADRE DE PRODUCTION

Objectif :
> definir ce qui sera autorise en production.

A traiter :
- intended purpose
- prudence
- suitability
- filtrage fonctionnel
- course
- renforcement
- adaptation en direct
- talk test
- confidentialite LLM
- gouvernance exercices

Livrable :
> avis externe + contraintes integrees au CDC

**NE BLOQUE PAS LE PROTOTYPE EXPERIMENTAL.**

## D103P0 - PILOTE TECHNIQUE LOCAL, ANCRE SUR CAS SENTINELLES

Objectif :
> eprouver une structure minimale provisoire a partir de situations concretes avant de generaliser, sans pretendre representer une population a partir de deux cas.

### P0.0 - cas sentinelles reels de-identifies

- utiliser **2 cas reels volontairement contrastes** ;
- les choisir pour leur pouvoir de mise a l'epreuve, pas pour une representativite statistique impossible a deux cas ;
- recueillir d'abord les faits, l'historique reel, les objectifs, preferences, recommandations deja recues, reactions et inconnues ;
- privilegier les questions ouvertes lorsque le but est de faire emerger la structure ;
- ne pas imposer une taxonomie candidate dans le recueil ;
- ne pas creer de matrice de diversite ni de cas synthetiques avant P0.1/P0.2.

Ordre :

```text
P0.0 cas sentinelles de-identifies
P0.1 revue professionnelle de structure
P0.2 taxonomie minimale issue des cas
P0.3 5-8 regles pilote
P0.4 5-8 fiches exercices prototypes
P0.5 moteur de regles + strategy selector
P0.6 composer local + validateur
P0.7 trajectoires J+1 / J+2 / J+7 / J+21 / J+60
P0.8 variantes fictives des cas + matrice de couverture derivee si utile
P0.9 revision du schema
P0.10 extension vers 10-15 seulement si utile
P0.11 comparaison local seul vs local + LLM
P0.12 decision de generalisation
```

**PAS DE PUBLICATION UTILISATEUR.**

---

# 15. PHASE 2 - MODELE UTILISATEUR DEFINITIF

## D103C

Geler :
- anamnese / baseline
- donnees stables
- donnees du jour
- questions minimales
- preferences
- objectifs
- materiel
- acceptation marche-course
- donnees necessaires au filtrage fonctionnel

Ne collecter que ce qui sert reellement au moteur.

Consequence UX :
- la page actuelle `Comment etes-vous aujourd'hui ?` est une implementation transitoire ;
- ne pas investir dans une refonte visuelle definitive avant les retours D103C3 / D103P0 ;
- corriger seulement les bugs manifestes qui genent l'usage ou les tests ;
- D103C devra reconstruire l'etat du jour autour du **minimum necessaire**, en reutilisant les donnees stables deja connues.

---

# 16. PHASE 3 - MODELE DE SEANCE DEFINITIF

## D103D

Geler :

```text
ActivitySession
ActivityBlock
temporalContext
plannedExposure
actualExposure
reactions
dataQuality
```

Migration propre depuis les structures existantes.

---

# 17. PHASE 4 - BIBLIOTHEQUE V1

## D103E

Transformer le pilote en bibliotheque validee.

Conditions :
- chaque fiche revue
- chaque source tracee
- chaque variante testee
- aucun diagnostic dans les regles
- seules les fiches `published` utilisables

---

# 18. PHASE 5 - SESSION COMPOSER LOCAL DE PRODUCTION

## D103F

Construire le moteur final :

```text
profil
+ historique
+ temporalContext
+ intention
+ contraintes
+ suitability
-> strategies admissibles
-> composition
-> validation
-> proposition
```

Le LLM reste facultatif.

---

# 19. PHASE 6 - MOTEUR GLOBAL ET INTENTIONS UTILISATEUR

## D103G - Decision globale N+1

Construire un seul moteur qui recoit `requestedIntent` mais decide selon l'ensemble du contexte :

```text
requestedIntent
+ historique
+ reactions
+ temps ecoule
+ contexte
+ suitability
-> explore | maintain | reduce | clarify
-> sessionStrategy
```

## D103G-U1 - Reprendre doucement

Verifier que cette intention ouvre les strategies de reprise adaptees sans creer un moteur separe.

## D103G-U2 - Maintenir mon rythme

Verifier que cette intention privilegie la continuite / variation sans augmentation recherchee, dans le meme moteur.

## D103G-U3 - Progresser

Verifier que cette intention permet d'explorer une dimension lorsqu'elle est justifiee. Une demande de progression peut toutefois aboutir a `maintain`, `reduce` ou `clarify` avec explication.

**INTERDIT : trois Session Composers, trois historiques ou trois moteurs de regles distincts.**

---

# 20. PHASE 7 - ROUTE BRIDGE

## D103H

Pour les seances exterieures :

```text
Session Composer
-> besoin locomoteur
-> Route Bridge
-> buildRequest()
-> ORS
```

ORS ne decide jamais du programme.

---

# 21. PHASE 8 - SUIVI REEL

## D103I

Suivi bloc par bloc :
- termine
- saute
- rallonge
- raccourci
- variante
- stop

Toujours conserver :
> planned != actual

---

# 22. PHASE 9 - REACTIONS

## D103J

Collecter :
- pendant
- juste apres
- plus tard

Avec un minimum de friction.

---

# 23. PHASE 10 - PROFIL DE TOLERANCE OBSERVEE

## D103K

Construire des observations contextualisees.

Jamais :
- score global
- capacite maximale
- diagnostic

---

# 24. PHASE 11 - DECISION N+1

## D103L

Sorties :

```text
explore
maintain
reduce
clarify
```

Chaque decision doit indiquer :
- dimension
- raisons
- observations utilisees
- informations manquantes
- contradictions

---

# 25. PHASE 12 - HISTORIQUE

## D103M

Afficher une trajectoire simple :
- seances
- regularite
- types d'activite
- evolution observee
- sans classement ni score global

---

# 26. PHASE 13 - TESTS TERRAIN

## D103N

Tester avec de vrais utilisateurs apres validation du cadre.

Objectifs :
- comprehension
- charge cognitive
- pertinence des propositions
- capacite d'adaptation
- securite fonctionnelle
- acceptabilite des questions
- robustesse apres absences longues
- fonctionnement sans LLM
- fonctionnement avec LLM

---

# 27. REGLES DE NON-DERIVE

Apres validation de D103B3, l'accueil et son raccord initial sont consideres comme **geles hors bug**.

Si une future proposition fait l'une des choses suivantes, **STOP et retour au CDC** :

- recabler Reprendre / Maintenir / Progresser vers le simple moteur de balade
- construire trois moteurs Activite separes pour Reprendre / Maintenir / Progresser
- faire du LLM le moteur obligatoire
- reposer sur une API pour fonctionner
- envoyer l'anamnese brute au LLM
- coder des +10 %, +5 min, 3 semaines = X sans base validee
- creer un score utilisateur global
- utiliser l'age seul
- utiliser la douleur seule
- transformer un diagnostic en exercice
- inventer des exercices sans validation
- recopier les dosages d'un programme externe comme universels
- confondre route ORS et programme d'activite
- redemander l'anamnese a chaque seance
- oublier le temps ecoule depuis la derniere activite
- oublier planned vs actual
- demander trop de donnees avant d'avoir prouve leur utilite
- construire une enorme Knowledge Base avant les cas sentinelles et la revue professionnelle de structure
- presenter les 2 cas sentinelles comme representatifs d'une population
- construire une matrice de diversite ou des cas synthetiques avant P0.1/P0.2 pour compenser artificiellement le faible nombre de cas reels
- utiliser en P0.8 des axes de variation non justifies par les cas, la revue, la taxonomie minimale ou les simulations precedentes
- publier avant D103C3
- presenter une sortie LLM comme valide sans validation locale

---

# 28. QUESTION A POSER AVANT CHAQUE NOUVEAU LOT

Avant de coder, verifier :

1. Quel probleme precis ce lot resout-il ?
2. Est-il prevu dans cette feuille de route ?
3. Quelles donnees sont necessaires ?
4. Quelles donnees sont deja connues ?
5. Y a-t-il une regle scientifique sourcee ?
6. Est-ce une heuristique produit ?
7. Peut-on le tester sans LLM ?
8. Le LLM est-il seulement facultatif ?
9. Quelles non-regressions doivent etre protegees ?
10. Quels tests doivent passer avant livraison ?
11. Le lot touche-t-il un ecran gele ? Si oui, est-ce reellement un bug ou une decision produit explicite ?

Si une reponse manque :
> ne pas inventer ; documenter le point ouvert.

---

# 29. DEFINITION DE "TERMINE" POUR UN LOT

Un lot n'est termine que si :

- code / document livre
- tests cibles passes
- suite complete passee
- audit non-regression propre
- migrations traitees si necessaire
- wording valide
- documentation mise a jour
- aucune donnee inconnue transformee en hypothese
- aucun ancien comportement stable casse
- ZIP / fichiers a pousser propres si code
- etape suivante clairement identifiee

---

# 30. ETAT DE DEPART APRES CE DOCUMENT

## A faire maintenant

### 1. D103P0.0 - lancer les deux cas sentinelles reels

Objectif :
> recueillir deux situations reelles, de-identifiees et volontairement contrastees afin de mettre a l'epreuve les hypotheses du futur moteur sans construire de taxonomie a l'avance.

Regles :
- les deux cas ne sont pas un echantillon representatif ;
- ils sont des stress tests humains reels ;
- recueil principalement ouvert ;
- faits / recommandations / preferences / inconnues clairement separes ;
- aucune generalisation avant P0.1 ;
- aucune matrice de diversite ni cas synthetiques avant P0.8.

Sortie :
> deux dossiers sentinelles de-identifies prets pour la revue professionnelle P0.1.

### 2. D103C3 reste le chantier de cadre de production

Revue externe / prudence / confidentialite / filtrage / suitability / gouvernance.

### 3. D103P0 avance selon l'ordre gele

```text
P0.0  2 cas sentinelles reels de-identifies et contrastes
P0.1  revue professionnelle de structure
P0.2  taxonomie minimale issue des cas + revue
P0.3  5-8 regles pilote tracees
P0.4  5-8 fiches exercices prototypes
P0.5  moteur de regles + strategy selector
P0.6  composer local + validateur
P0.7  trajectoires J+1 / J+2 / J+7 / J+21 / J+60
P0.8  variantes fictives + matrice de couverture derivee si utile
P0.9  revision du schema
P0.10 extension vers 10-15 seulement si utile
P0.11 comparaison local seul vs local + LLM
P0.12 decision de generalisation
```

La matrice de couverture, si elle devient utile en P0.8, doit etre construite uniquement a partir de dimensions deja justifiees par P0.0-P0.7.

### 4. Ne pas lancer la refonte definitive de `Comment etes-vous aujourd'hui ?`

Cette page sera reprise dans **D103C**, apres les retours de D103C3 et D103P0.

Avant D103C, seuls sont admis :
- correction de bug ;
- correction de doublon / chevauchement manifeste ;
- raccord fonctionnel indispensable ;
- uniformisation d'identite relevant explicitement de D103B3.

---

# 31. PHRASE DE RAPPEL DU PROJET

> **JMJS doit connaitre la personne dans le temps, comprendre ce qu'elle souhaite aujourd'hui sans l'enfermer dans un mode, proposer une activite valide localement, s'adapter a ce qu'elle fait reellement et a son rythme de retour, et continuer a fonctionner meme sans aucune IA externe.**

Si une future solution s'eloigne de cette phrase, elle doit etre rejustifiee avant d'etre acceptee.

---

# 32. DOCUMENTS DE REFERENCE

1. `D103-v4.1-CDC-directeur-moteur-global-sentinelles-2026-08-20.md`
2. `D103C3-v2.0-dossier-revue-reglementaire-local-first-2026-08-20.md`
3. matrice scientifique D103-SCI
4. matrice de preuves
5. presente feuille de route v1.3 (etat reel au 21 aout 2026)

**Cette feuille sert de garde-fou operationnel. Le CDC reste l'autorite produit.**
