# D103 v4.1 - Cahier des charges directeur
## Je marche comme je suis - Balade personnalisee + accompagnement d'activite physique adaptatif

**Date :** 20 aout 2026  
**Statut :** document directeur de reference - moteur Activite global, longitudinal, local-first ; cas sentinelles et revue professionnelle integres a la methode P0  
**Remplace :** D103 v2.1, v3.0, v3.1, v3.2, v3.3 et v4.0, conserves comme archives  
**Lot actif :** D103C3 - revue intended purpose, prudence, confidentialite et gouvernance  
**Architecture cible :** local-first, LLM-assisted, jamais LLM-dependent

---

# 0. Decision directrice

JMJS est desormais compose de deux experiences complementaires partageant un socle commun.

```text
JMJS
|
+-- BALADE
|   activityIntent = leisure
|   route-first
|   moteur D102G3 + ORS + GPX
|
+-- ACTIVITE
    moteur global unique, session-first
    moteur longitudinal local + Session Composer
    marche + marche/course + course + renforcement + gainage
    |
    +-- intention utilisateur = gentle_return
    +-- intention utilisateur = maintain
    +-- intention utilisateur = progress
```

La branche `leisure` reste un produit de promenade personnalisee.

Les trois libelles `gentle_return`, `maintain` et `progress` ne sont **pas trois moteurs**. Ils representent l'intention exprimee par l'utilisateur au moment d'entrer dans la branche Activite. Le meme moteur global traite ensuite toutes les donnees longitudinales, le contexte du jour et l'historique reel.

La marche reste une modalite centrale, mais elle n'est plus l'unique activite possible.

Le changement fondamental est le suivant :

```text
Ancien modele :
parcours -> adaptation superficielle selon l'intention

Nouveau modele :
profil + historique + contexte -> strategie d'activite -> seance -> route eventuelle
```

ORS reste l'unique moteur geographique. Il ne decide jamais du programme d'activite.

---

# 1. Autorite documentaire

Ordre d'autorite pour D103 :

1. decisions humaines gelees dans le present CDC ;
2. contraintes issues de la revue D103C3 une fois integrees et versionnees ;
3. matrice scientifique D103-SCI et matrice de preuves ;
4. regles de non-regression D102G3 et D103A/A2/B deja validees ;
5. documents D103 anterieurs uniquement comme archives historiques.

Aucune ancienne version ne peut reintroduire silencieusement une regle abandonnee.

---

# 2. Etat technique retenu comme base

La lignee GitHub D103A / D103A2 / D103B reste la base technique de la suite.

Principes de reprise :

- ne pas fusionner le cablage JS de prototypes visuels isoles ;
- reutiliser uniquement les elements visuels approuves lorsque necessaire ;
- conserver `leisure` strictement equivalent au moteur stable de balade ;
- un lot a la fois ;
- build, audit et tests complets apres chaque integration ;
- aucune adaptation future ne doit casser ORS, GPX, POI, services, suivi ou PWA.

Le wording `maintain` est gele :

> **Maintenir mon rythme**  
> Continuer une activite physique qui vous convient, sans chercher a augmenter.

---

# 3. Positionnement produit

## 3.1 Promesse

> JMJS aide la personne a construire une activite physique reguliere, progressive et adaptee a sa situation, en s'appuyant sur ce qu'elle a declare, ce qu'elle a reellement fait et la maniere dont elle l'a vecu.

L'activite physique reguliere est associee a de nombreux benefices generaux de sante.

## 3.2 Ce que JMJS ne revendique pas

JMJS ne revendique pas :

- diagnostic ;
- traitement d'une pathologie ;
- reeducation d'une lesion identifiee ;
- prescription medicale automatisee ;
- depistage clinique ;
- interpretation pathologique d'une donnee physiologique ;
- prediction de guerison ;
- garantie individuelle d'amelioration de sante.

La qualification reglementaire de la branche Activite n'est pas presumee. Elle fait l'objet de D103C3.

---

# 4. Fondations scientifiques non negociables

Les principes suivants sont geles :

1. fonction avant diagnostic ;
2. personne comparee a elle-meme ;
3. etat habituel distinct de l'etat du jour ;
4. age jamais decisionnel seul ;
5. douleur jamais decisionnaire seule ;
6. inconnu reste inconnu ;
7. aucun score global ou composite opaque ;
8. aucune progression universelle arbitraire ;
9. aucun coefficient automatique de deconditionnement ;
10. provenance des donnees explicite ;
11. prevu et reel toujours distincts ;
12. toute adaptation importante est explicable ;
13. aucune progression imposee sans choix utilisateur ;
14. suitability distinct du moteur de composition ;
15. aucune inference diagnostique automatique ;
16. toute regle scientifique utilisee par le moteur doit etre tracable a une source ;
17. toute heuristique produit doit etre etiquetee comme telle ;
18. une donnee manquante ne peut pas etre completee par une supposition du LLM.

---

# 5. Base documentaire et transposition

Le corpus disponible soutient une architecture multi-modale comprenant activite aerobie, renforcement musculaire et, selon le contexte et la population, composantes multicomposantes.

## 5.1 WHO

Les recommandations WHO presentes dans le corpus soutiennent notamment :

- le principe que faire un peu d'activite vaut mieux que ne rien faire ;
- un demarrage par de petites quantites lorsque la personne est inactive ;
- une augmentation graduelle de la frequence, de l'intensite et de la duree ;
- l'association de l'activite aerobie et du renforcement musculaire ;
- l'adaptation de l'activite aux capacites fonctionnelles.

Ces recommandations sont populationnelles. Elles ne deviennent pas automatiquement des doses individuelles JMJS.

## 5.2 ACSM 12e edition

L'ACSM structure la prescription d'exercice autour des principes FITT :

- Frequency ;
- Intensity ;
- Time ;
- Type.

Le manuel souligne egalement la variabilite individuelle des reponses a l'exercice et la necessite d'adapter la prescription aux caracteristiques et objectifs de la personne.

Le **talk test** est confirme dans l'ACSM 12e comme methode valide et fiable de mesure pratique de l'intensite et comme methode utilisable pour prescrire et surveiller l'intensite. Dans JMJS, son usage eventuel reste qualitatif : jamais score cardio, jamais seuil clinique autonome.

## 5.3 Clinique du Coureur et programmes du corpus

Les programmes fournis montrent l'interet de distinguer plusieurs types de seances :

- endurance ;
- recuperation ;
- intervalles ;
- activite croisee ;
- renforcement ;
- repos.

Le principe qualitatif avancer / repeter / revenir selon la tolerance est pertinent pour JMJS.

Les dosages particuliers de ces programmes ne doivent pas etre recopies comme constantes universelles.

---

# 5 bis. Un moteur Activite global, trois intentions utilisateur

## 5 bis.1 Decision d'architecture

JMJS ne doit pas maintenir trois moteurs distincts pour `gentle_return`, `maintain` et `progress`.

Il existe **un seul moteur Activite global** :

```text
MEMOIRE LONGITUDINALE
+ CONTEXTE CONNU
+ HISTORIQUE REEL
+ TEMPS ECOULE
+ PREFERENCES / OBJECTIFS
+ INTENTION UTILISATEUR
        ↓
MOTEUR ACTIVITE GLOBAL
        ↓
SUITABILITY / FILTRAGE
        ↓
STRATEGIES CANDIDATES
        ↓
DECISION DU JOUR
        ↓
SESSION COMPOSER
```

L'intention utilisateur influence l'espace des strategies et la maniere de presenter les propositions, mais elle ne remplace jamais l'analyse du contexte.

## 5 bis.2 Intention utilisateur != decision du moteur

Le moteur distingue explicitement :

```text
requestedIntent
= ce que l'utilisateur souhaite aujourd'hui

decision
= explore | maintain | reduce | clarify

sessionStrategy
= la forme concrete de la seance proposee
```

Exemple :

```text
requestedIntent = progress
historique = reprise recente, retour tres rapproche, donnees du jour incompletes

possible decision = maintain ou clarify
```

Le systeme peut alors expliquer :

> Vous souhaitez progresser. Aujourd'hui, les informations disponibles conduisent plutot a consolider ce que vous faites deja / a verifier un point avant d'augmenter.

Le moteur respecte donc le projet de l'utilisateur sans faire semblant que toute demande de progression implique automatiquement une progression effective.

## 5 bis.3 Utilite des trois intentions

Les trois intentions restent utiles en UX parce qu'elles repondent a trois questions humaines differentes :

- **Reprendre doucement** : « je veux remettre de l'activite dans ma vie » ;
- **Maintenir mon rythme** : « je veux continuer sans chercher a augmenter » ;
- **Progresser** : « je souhaite faire evoluer quelque chose ».

Elles ne doivent pas devenir des identites permanentes ni des niveaux de personne.

Un utilisateur peut changer d'intention d'une seance a l'autre sans migration de profil.

## 5 bis.4 Consequence technique

En V1, conserver `activityIntent` pour compatibilite avec D103B, mais l'interpreter comme **orientation de la demande**, pas comme choix d'un moteur.

Aucune duplication du Session Composer, du moteur de regles ou de la memoire longitudinale par intention.


---

# 6. Les quatre intentions

## 6.1 `leisure` - Me balader

> Une balade simple, adaptee a votre envie du moment.

Moteur : route-first.

Caracteristiques :

- D102G3 conserve ;
- aucune obligation longitudinale ;
- aucune logique d'entrainement ;
- aucune proposition de course ou renforcement ;
- ORS / GPX / suivi existants.

## 6.2 `gentle_return` - Reprendre doucement (intention utilisateur)

> Retrouver progressivement une activite physique qui vous convient.

Objectifs :

- repartir de la situation actuelle ;
- retrouver de la regularite ;
- proposer un format realisable ;
- favoriser l'adhesion et la progressivite ;
- eviter toute logique de rattrapage brutal.

Modalites possibles apres validation :

- marche facile ;
- marche active ;
- marche avec pauses ;
- marche-course si explicitement acceptee ;
- renforcement simple ;
- gainage simple ;
- activite mixte ;
- recuperation active.

Interdit :

- course imposee ;
- coefficient lie a la duree d'arret ;
- niveau attribue par age ;
- transition automatique vers `progress`.

## 6.3 `maintain` - Maintenir mon rythme (intention utilisateur)

> Continuer une activite physique qui vous convient, sans chercher a augmenter.

Le maintien est un resultat positif.

Le moteur peut varier :

- le type de seance ;
- l'environnement ;
- le parcours ;
- les exercices ;
- l'ordre des blocs ;
- la modalite.

Il ne vise pas volontairement une augmentation de la dimension suivie.

## 6.4 `progress` - Progresser (intention utilisateur)

> Faire evoluer progressivement une dimension de votre activite physique.

Dimensions candidates :

- duree aerobie ;
- continuite de course ;
- structure marche-course ;
- exposition au relief ;
- terrain ;
- volume de renforcement ;
- complexite d'un exercice ;
- volume de gainage ;
- structure des pauses ;
- regularite.

Regle produit V1 : une seule dimension est exploree par proposition automatique.

Cette regle est une heuristique de lisibilite et de controle, pas une loi physiologique.

---

# 7. Doctrine du moteur longitudinal adaptatif

## 7.1 Memoire utilisateur

La branche Activite ne traite jamais chaque seance comme une premiere visite.

Elle maintient une memoire locale versionnee contenant :

```text
baseline / anamnese fonctionnelle
preferences
objectifs
materiel
contexte habituel
historique des activites realisees
plannedExposure / actualExposure
reactions pendant / apres / plus tard
commentaires libres structures si possible
dates des activites
qualite et provenance de chaque donnee
```

Une information stable n'est pas redemandee a chaque ouverture.

## 7.2 Temps ecoule

Le moteur connait le temps ecoule depuis les activites pertinentes.

Exemples :

- retour le lendemain ;
- retour deux jours plus tard ;
- retour apres trois semaines ;
- retour apres plusieurs mois ;
- historique incomplet.

Le temps ecoule est un **contexte**, jamais un coefficient de deconditionnement.

Interdit :

```text
if gap >= 21 days:
    reduce_program_by_30_percent
```

Autorise :

```text
elapsedTime
+ lastActualExposure
+ recentComparableHistory
+ reactions
+ activityIntent
+ currentKnownContext
-> strategy selection
```

Aucun delai universel ne declenche a lui seul une baisse ou une progression.

## 7.3 Questions du jour minimales

JMJS doit pouvoir proposer une activite sans refaire l'anamnese.

Option UX cible :

> Quelque chose d'important a change aujourd'hui ?  
> Non / Oui

Champ libre facultatif possible :

> Quelque chose a me signaler aujourd'hui ?

Une question supplementaire n'est posee que si :

- une donnee importante est reellement inconnue ;
- elle est necessaire pour choisir entre plusieurs strategies ;
- une contradiction doit etre clarifiee ;
- le cadre de prudence l'exige.

Le moteur distingue :

```text
stable_known
last_known
today_confirmed
unknown_today
```

## 7.4 Adaptation pendant la seance

Le programme peut evoluer pendant son execution a partir d'evenements observables ou declares :

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

- prolonger une recuperation ;
- proposer une variante plus simple ;
- retirer un bloc non indispensable ;
- interrompre une progression ;
- terminer plus tot ;
- basculer vers une logique de maintien.

Aucune adaptation en direct ne peut inventer un diagnostic ou augmenter silencieusement plusieurs dimensions.

## 7.5 Retour qualite

Apres l'activite, JMJS cherche peu de donnees, mais des donnees utiles :

- terminee comme prevu ou non ;
- difficulte globale qualitative ;
- capacite ressentie a continuer ;
- recuperation necessaire ;
- reaction inhabituelle ;
- commentaire libre facultatif.

Le moteur compare :

```text
plannedBlocks
actualBlocks
reactions
context
```

et met a jour l'historique.

## 7.6 ObservedToleranceProfile

Le profil de tolerance observee represente uniquement ce qui a ete observe dans des contextes documentes.

Il ne represente jamais :

- une capacite maximale ;
- un diagnostic ;
- une aptitude medicale ;
- une garantie sur une prochaine seance.

---

# 8. Local-first : architecture moteur de reference

## 8.1 Decision gelee

**Le moteur local est l'autorite principale. Le LLM est facultatif.**

Une seance valide doit pouvoir etre produite sans aucun appel externe.

Architecture :

```text
DONNEES LOCALES
      |
      v
NORMALISATION
      |
      v
SUITABILITY / PRUDENCE
      |
      v
MOTEUR DE REGLES LOCAL
      |
      v
STRATEGY SELECTOR
      |
      v
SESSION COMPOSER LOCAL
      |
      v
VALIDATEUR LOCAL
      |
      +----------------------+
      |                      |
      | seance deja valide   |
      v                      v
AFFICHAGE LOCAL        LLM OPTIONNEL
                            |
                            v
                   reformulation / variation /
                   texte libre / explication
                            |
                            v
                    VALIDATEUR LOCAL FINAL
                            |
                            v
                         AFFICHAGE
```

## 8.2 Pourquoi local-first

Avantages :

- fonctionnement hors API ;
- confidentialite maximale ;
- cout marginal nul ;
- comportement testable ;
- rules auditables ;
- aucun fournisseur indispensable ;
- pas d'hallucination comme source de validite ;
- meme logique scientifique quel que soit le fournisseur LLM.

## 8.3 Ce que signifie "sans hardcoding"

JMJS interdit le hardcoding arbitraire :

- pas de `+10 %` universel ;
- pas de `3 semaines = niveau X` ;
- pas de diagnostic -> exercice ;
- pas de profil -> programme fixe ;
- pas de seuils inventes ;
- pas de scores caches.

Mais JMJS conserve des regles deterministes indispensables :

- schema de donnees ;
- provenance ;
- contraintes interdites ;
- validation des exercices ;
- regles scientifiques tracees ;
- transitions d'etat ;
- controles de prudence ;
- validations finales.

Le bon modele est donc : **moteur de regles parametre**, pas foret de `if/else` arbitraires.

---

# 9. Qualite des regles et du catalogue : methode sentinelle avant generalisation

## 9.1 Decision de methode

Ne pas partir d'une taxonomie abstraite complete ni d'une grande Knowledge Base.

P0 commence par **deux cas sentinelles reels, de-identifies**, deja documentes et pouvant etre discutes avec un professionnel qualifie.

Objectif : decouvrir ce que le moteur doit reellement representer avant de figer la taxonomie.

```text
CAS SENTINELLE
    ↓
RECOMMANDATIONS / OBJECTIFS DEJA ETABLIS PAR LES PROFESSIONNELS
    ↓
BESOINS FONCTIONNELS OBSERVABLES
    ↓
DONNEES NECESSAIRES
    ↓
FAMILLES D'ACTIVITE / BLOCS NECESSAIRES
    ↓
REGLES ET FICHES EXERCICES CANDIDATES
    ↓
REVUE PROFESSIONNELLE
    ↓
SIMULATION LONGITUDINALE
    ↓
GENERALISATION SI JUSTIFIEE
```

Les cas sentinelles ne deviennent jamais des profils types ou des raccourcis diagnostiques.

Interdit :

```text
diagnostic X -> programme Y
```

## 9.2 Le professionnel intervient avant la bibliotheque

La revue professionnelle ne doit pas attendre que 15 exercices soient deja ecrits.

Avant le gel du schema `ExerciseDefinition`, soumettre :

- la taxonomie candidate ;
- les champs `functionalRequirements` ;
- les variantes plus simples / plus complexes ;
- les `techniqueCues` ;
- les `stopOrClarifyCues` ;
- quelques prototypes de fiches ;
- les cas sentinelles qui ont revele ces besoins.

Questions de revue structurelle :

1. ces champs decrivent-ils ce qu'il faut reellement savoir ?
2. quels champs manquent ?
3. lesquels sont inutiles ou dangereux a interpreter ?
4. quelles exigences fonctionnelles sont pertinentes avant proposition ?
5. quels signaux justifient variante, arret ou clarification ?

## 9.3 Trois niveaux de validation distincts

Chaque regle ou exercice doit pouvoir passer trois controles differents :

### Validation scientifique
La source soutient-elle correctement le principe utilise ?

### Validation professionnelle
La traduction fonctionnelle / l'exercice / les variantes sont-ils raisonnables et utilisables ?

### Validation produit
Le logiciel applique-t-il la regle sans depasser ce qu'elle autorise ?

Aucun de ces niveaux ne remplace les deux autres.

## 9.4 Chaine de tracabilite obligatoire

Pour toute regle :

```text
SOURCE
→ PRINCIPE SCIENTIFIQUE
→ INTERPRETATION JMJS
→ REGLE PRODUIT
→ STATUT (scientifique / heuristique produit)
→ TEST
```

Une heuristique produit ne doit jamais etre presentee comme une loi physiologique.

## 9.5 Familles de regles P0

P0 doit tester au minimum quatre familles :

1. **invariants / interdictions** ;
2. **eligibilite fonctionnelle** ;
3. **strategie de seance** ;
4. **adaptation longitudinale**.

Une regle de strategie produit un candidat, pas une prescription.

> **Candidat != prescrit.**

## 9.6 Structure minimale d'une regle pilote

```text
PilotRule
- ruleId
- source
- scientificPrinciple
- jmjsInterpretation
- ruleType
- requiredInputs
- conditions
- allowedActions
- forbiddenInferences
- rationale
- status
- testIds[]
```

Pas d'ontologie plus complexe tant que les cas sentinelles et le pilote ne montrent pas sa necessite.

## 9.7 Structure candidate d'un exercice

```text
ExerciseDefinition
- exerciseId
- name
- category
- movementPattern
- instructions
- equipment
- easierVariants[]
- harderVariants[]
- techniqueCues[]
- functionalRequirements[]
- stopOrClarifyCues[]
- sourceBasis[]
- professionalReview
- version
- status
```

Cette structure reste **candidate** jusqu'a revue professionnelle de structure.

## 9.8 Les variantes appartiennent a l'exercice

Ne jamais transformer les variantes en niveau permanent de la personne.

Attendu :

> aujourd'hui, une variante plus simple convient mieux.

Interdit :

> vous etes revenu au niveau 1.

## 9.9 Pilotage progressif

P0 commence avec 5 a 8 regles et 5 a 8 fiches prototypes issues des cas sentinelles.

Apres revue et simulation :

- corriger le schema ;
- creer des variantes artificielles des cas ;
- etendre ensuite vers 10 a 15 regles / exercices uniquement si necessaire.

Generaliser apres observation, jamais avant.

---

# 10. Filtrage fonctionnel en amont

Le retrait des `contraindicationFlags` ne suffit pas.

Avant de composer une seance, JMJS doit pouvoir filtrer les blocs selon des informations **fonctionnelles** deja declarees, sans tirer de conclusion medicale.

Exemples de proprietes candidates a soumettre a D103C3 :

- exercice necessitant passage au sol ;
- exercice necessitant retour du sol ;
- besoin d'une chaise ;
- besoin d'un appui stable ;
- exercice avec appui unipodal ;
- activite avec impact ;
- environnement interieur / exterieur ;
- materiel requis.

Trois niveaux sont distingues :

1. **avant la seance** : filtrage des candidats ;
2. **pendant la seance** : stop / variante / clarification ;
3. **apres la seance** : apprentissage longitudinal.

La mecanique precise du filtrage est soumise a D103C3.

---

# 11. Modele canonique de donnees

## 11.1 ActivitySession

```text
ActivitySession
- id
- activityIntent
- functionalGoal?
- sessionStrategy
- plannedBlocks[]
- actualBlocks[]
- plannedExposure
- actualExposure
- environmentContext
- equipmentContext
- dailyContext
- temporalContext
- duringReaction
- postActivityReaction
- laterReaction
- progressionDecision
- dataQuality
```

`temporalContext` contient notamment :

```text
lastRelevantActivityAt
elapsedTime
recentActivityPattern
historyAvailability
```

## 11.2 ActivityBlock

```text
ActivityBlock
- id
- modality
- target?
- duration?
- repetitions?
- sets?
- recovery?
- intensityCue?
- routeSegment?
- equipment[]
- alternatives[]
- exerciseId?
```

Liste provisoire de `modality` :

```text
walk
brisk_walk
walk_run
run
strength
core
mobility
balance
recovery
rest
```

La liste doit etre gelee avant publication de D103E.

---

# 12. Session Composer local

Le Session Composer local recoit :

```text
activityIntent
baseline
knownTodayState
functionalGoal
suitabilityResult
availableTime
environment
equipment
recentComparableHistory
elapsedTime
userPreferences
allowedStrategies
publishedExercises
```

Il produit 0 a N propositions.

Chaque proposition comporte :

- strategie ;
- blocs ;
- duree estimee ;
- modalites ;
- raisons principales ;
- donnees utilisees ;
- inconnues pertinentes ;
- alternatives possibles.

Le moteur ne doit pas forcer artificiellement trois propositions.

---

# 13. Strategies candidates V1

## 13.1 Reprendre doucement

```text
gentle_continuous
gentle_intervals
walk_run_intro
light_strength
light_core
mixed_restart
active_recovery
clarify_first
```

## 13.2 Maintenir mon rythme

```text
stable_continuous
stable_mixed
same_load_new_context
maintenance_strength
maintenance_aerobic
active_recovery
clarify_first
```

## 13.3 Progresser

```text
explore_duration
explore_run_continuity
explore_walk_run
explore_ascent
explore_terrain
explore_strength
explore_core
explore_pause_structure
clarify_first
```

Ces noms sont techniques et non du wording utilisateur final.

---

# 14. Pont vers ORS

Le Session Composer ne genere pas de geometrie.

```text
ActivitySession
|
+-- indoor-only -> aucun ORS
|
+-- locomotion exterieure
    -> Route Bridge
    -> buildRequest() existant
    -> ORS
```

Le Route Bridge traduit les besoins de la seance en contraintes geographiques compatibles avec le moteur existant.

Exemple : une seance marche-course peut demander une boucle relativement reguliere, une duree geographique compatible et un retour au point de depart.

ORS ne decide jamais de l'intensite, des blocs, de la progression ou des exercices.

---

# 15. Suitability Gate

Sorties de travail :

```text
proceed
proceed_without_progression
clarify
professional_advice_recommended
```

Le gate :

- ne diagnostique pas ;
- ne calcule pas de score medical ;
- ne transforme pas un diagnostic en programme ;
- ne remplace pas un professionnel ;
- peut limiter la composition a un espace plus prudent ;
- peut demander une clarification lorsque necessaire.

Sa mecanique finale est soumise a D103C3.

---

# 16. Intensite

V1 privilegie un langage qualitatif :

- tres facile ;
- facile ;
- soutenu mais confortable ;
- difficile ;
- trop difficile aujourd'hui.

Le talk test peut etre integre apres transcription dans la matrice scientifique et validation du wording produit.

Aucune donnee cardio n'est obligatoire en V1.

---

# 17. LLM : role secondaire et optionnel

## 17.1 Decision gelee

Le LLM n'est ni l'autorite scientifique ni l'autorite de prudence.

Il peut :

- reformuler une seance locale valide ;
- proposer une variation parmi des options deja admissibles ;
- produire une explication plus naturelle ;
- resumer un commentaire libre ;
- extraire des informations structurees d'un texte libre, avec validation locale ;
- aider a departager plusieurs propositions toutes valides.

Il ne peut pas :

- rendre valide une seance invalide ;
- ajouter un exercice non publie ;
- inventer une donnee utilisateur ;
- outrepasser le suitability gate ;
- creer une progression interdite ;
- diagnostiquer ;
- modifier silencieusement plusieurs dimensions.

## 17.2 Fournisseurs cibles

Architecture fournisseur V1 :

```text
Groq - primaire gratuit
OpenAI - fallback payant
Anthropic - second fallback payant
```

Le fournisseur est masque derriere un `LLMAdapter` ou un gateway serveur.

L'application ne depend jamais d'un modele particulier.

## 17.3 Validation locale finale

Toute sortie LLM doit etre :

- JSON structure si elle modifie le programme ;
- conforme au schema ;
- limitee aux strategies et exercices autorises ;
- revalidee par le moteur local avant affichage.

Une reponse HTTP 200 n'est pas une preuve de validite metier.

---

# 18. Confidentialite et donnees

## 18.1 Principe local

La memoire longitudinale et l'anamnese restent locales par defaut.

## 18.2 LLM externe

L'envoi de donnees a Groq, OpenAI ou Anthropic doit etre considere comme un traitement externe.

Avant production, D103C3 doit arbitrer :

- quelles donnees peuvent etre envoyees ;
- sous quelle forme minimisee ;
- quels identifiants sont interdits ;
- information / consentement utilisateur ;
- conservation et logs ;
- compatibilite avec la promesse de confidentialite.

Architecture cible : envoyer au LLM un contexte fonctionnel reduit plutot que l'anamnese brute.

---

# 19. Gouvernance des exercices

Workflow gele :

```text
draft
-> professional_review_pending
-> validated
-> published
```

Seules les fiches `published` peuvent etre proposees en production.

La revue professionnelle conserve au minimum :

- version ;
- date ;
- role / qualification ;
- statut ;
- reserves ;
- sources.

Profil de reference V1 : professionnel qualifie dans le mouvement / exercice, avec le kinesitherapeute comme profil privilegie pour la revue des exercices.

---

# 20. Construction experimentale vs autorisation production

## 20.1 Peut etre construit maintenant

- moteur longitudinal local ;
- modele ActivitySession / ActivityBlock ;
- temporalContext ;
- petit moteur de regles ;
- pilote 10-15 regles ;
- pilote 10-15 exercices `draft` ;
- Session Composer local experimental ;
- simulateur de profils fictifs ;
- integration Groq optionnelle ;
- fallback OpenAI / Anthropic ;
- validateur local ;
- adaptation a J+1, J+2, apres plusieurs semaines ;
- suivi planned vs actual ;
- traitement de commentaires libres en environnement de test.

## 20.2 Ne peut pas etre publie avant validation

- recommandations individualisees course / renforcement non revues ;
- progression automatisee non validee ;
- exercice non `published` ;
- filtrage fonctionnel individualise non arbitre ;
- suitability gate non valide ;
- envoi externe de donnees non cadre ;
- wording pouvant constituer une revendication medicale.

Doctrine :

> **Construire maintenant, autoriser plus tard.**

---

# 21. Pilote D103P0

Objectif : apprendre a partir de situations concretes avant de generaliser.

Ordre obligatoire :

```text
P0.0  cas sentinelles reels de-identifies
P0.1  revue professionnelle de structure
P0.2  premiere taxonomie issue des cas
P0.3  5 a 8 regles pilote
P0.4  5 a 8 fiches exercices prototypes
P0.5  simulation longitudinale des cas sentinelles
P0.6  variantes artificielles des cas
P0.7  revision du modele
P0.8  extension eventuelle vers 10 a 15 regles / exercices
P0.9  generalisation seulement si le besoin est demontre
```

Scenarios temporels :

- retours J+1, J+2, J+7, J+21, J+60 ;
- historique complet / incomplet ;
- changement de preference ;
- interruption de seance ;
- reaction inhabituelle ;
- absence de donnees du jour ;
- comparaison local seul vs local + LLM.

Mesures :

- nombre de clarifications ;
- coherence des strategies ;
- respect des interdictions ;
- stabilite des sorties ;
- diversite utile ;
- donnees manquantes recurrentes ;
- besoin reel ou non d'un schema plus generique.

---

# 22. Feuille de route revisee

| Lot | Contenu | Statut |
|---|---|---|
| D103A | coeur longitudinal initial | fait / conserve |
| D103A2 | persistance, migrations, confidentialite | fait / conserve |
| D103B | accueil 4 intentions | fait, validation visuelle finale a terminer |
| **D103C3** | intended purpose, prudence, filtrage fonctionnel, confidentialite IA | **lot reglementaire actif** |
| **D103P0** | pilote local 10-15 regles + 10-15 exercices + simulateur | **lot technique experimental actif** |
| D103C | baseline / anamnese et etat du jour definitifs | apres retour C3/P0 |
| D103D | ActivitySession / ActivityBlock definitifs | apres P0/C |
| D103E | bibliotheque V1 validee | apres revue professionnelle |
| D103F | Session Composer local de production | apres D/E |
| **D103G** | **Moteur de decision global N+1 + gestion des intentions utilisateur** (`gentle_return` / `maintain` / `progress`) | apres F |
| D103G-U1 | tests UX / logique Reprendre doucement dans le moteur global | apres G |
| D103G-U2 | tests UX / logique Maintenir mon rythme dans le moteur global | apres G-U1 |
| D103G-U3 | tests UX / logique Progresser dans le moteur global | apres G-U2 |
| D103H | Route Bridge vers ORS | apres policies |
| D103I | suivi bloc par bloc | apres H |
| D103J | reactions pendant / apres / plus tard | apres I |
| D103K | observedToleranceProfile multi-modal | apres J |
| D103L | decision N+1 | apres K |
| D103M | historique / trajectoire | apres L |
| D103N | tests terrain | final |

D103C3 et D103P0 peuvent avancer en parallele : le premier protege la future mise en production, le second permet de tester l'architecture sans attendre.

---

# 23. Criteres d'acceptation globaux

Le produit D103 est acceptable lorsque :

1. `leisure` reste strictement non regresse ;
2. les trois intentions Activite orientent le meme moteur global sans creer trois moteurs dupliques ;
3. une seance peut exister sans trajet ;
4. une seance peut combiner plusieurs blocs ;
5. le local peut produire une seance valide sans LLM ;
6. un LLM ne peut jamais rendre valide une sortie interdite ;
7. la memoire longitudinale evite de redemander l'anamnese ;
8. le temps ecoule influence le contexte sans coefficient automatique ;
9. les retours utilisateur modifient la connaissance longitudinale ;
10. les inconnues restent inconnues ;
11. planned et actual restent distincts ;
12. chaque progression est explicable ;
13. aucune progression universelle arbitraire ;
14. aucune course imposee ;
15. `maintain` reste un resultat positif ;
16. `gentle_return` ne devient jamais automatiquement `progress` ;
17. chaque exercice de production est professionnellement revu ;
18. aucune fiche d'exercice ne contient de logique diagnostique ;
19. le filtrage en amont est fonctionnel et valide par D103C3 ;
20. aucun score clinique cache ;
21. tout usage du talk test reste qualitatif ;
22. toute sortie LLM est revalidee localement ;
23. l'application reste utilisable si toutes les API externes sont indisponibles ;
24. la confidentialite des donnees externes est documentee avant production ;
25. aucune promesse individuelle de sante n'est formulee;
26. `requestedIntent`, `decision` et `sessionStrategy` restent distincts;
27. une demande `progress` peut aboutir a `maintain`, `reduce` ou `clarify` avec explication;
28. les schemas de regles et d'exercices ne sont geles qu'apres revue professionnelle structurelle du pilote sentinelle.

---

# 24. Non-regression

Doivent rester stables :

- ORS ;
- POI ;
- services ;
- envies ;
- Juste prendre l'air ;
- heure de retour ;
- D-024 ;
- GPX ;
- Google Maps / Apple Plans selon implementation ;
- suivi actuel ;
- PWA ;
- confidentialite locale existante ;
- D102 A a E ;
- D103A/A2/B retenus comme base.

---

# 25. Statut de sortie

## Pret pour

- finaliser D103B visuellement ;
- conduire D103C3 ;
- lancer D103P0 ;
- construire le moteur longitudinal local ;
- tester l'adaptation temporelle ;
- construire le petit corpus pilote ;
- tester Groq comme assistance facultative ;
- implementer les fallbacks OpenAI / Anthropic derriere un adaptateur ;
- preparer la gouvernance de la bibliotheque.

## Pas encore pret pour

- publication d'un Session Composer multi-modal non valide ;
- publication d'une progression course / renforcement individualisee sans cadre C3 ;
- exercice non revu ;
- decision diagnostique ;
- envoi d'anamnese brute a une API externe ;
- utilisation d'un LLM comme autorite de securite ;
- extrapolation du pilote en grande Knowledge Base avant observation de son besoin.

**Nouvelle base de travail : D103 v4.1.**
