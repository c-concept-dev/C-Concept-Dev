# EvidenceForge — Charte d’Identité, ADN et Gouvernance du Projet
## Document garant du pipeline, de la direction produit et de la non-régression

**Statut :** document directeur permanent  
**Portée :** EvidenceForge, tous lots, tous prompts, tous opérateurs, tous successeurs  
**Usage obligatoire :** à relire et réinjecter avant tout nouveau prompt d’architecture, d’implémentation, d’audit, de correction, de test ou d’exécution réelle  
**Autorité :** ce document prime sur toute commodité locale, raccourci d’implémentation, hypothèse de test ou dérive liée au cas d’usage courant  
**Cas d’usage actuel :** JMJS P0.1 est un cas d’application et de validation d’EvidenceForge ; il ne définit pas l’architecture générale d’EvidenceForge

---

# 1. IDENTITÉ DU SYSTÈME

EvidenceForge est un **moteur universel de consultation professionnelle simulée fondée sur des preuves publiques, traçables et attribuables**.

À partir d’une **phrase d’audit libre**, EvidenceForge doit être capable de :

1. comprendre la mission ;
2. déterminer dynamiquement les expertises nécessaires ;
3. découvrir de vrais professionnels pertinents ;
4. vérifier leur identité, leur légitimité documentaire et leur pertinence pour la mission ;
5. construire pour chacun un **jumeau professionnel documentaire** ;
6. faire examiner la même question par ces jumeaux, de façon indépendante ;
7. produire leurs analyses, réserves, inconnus, désaccords et conclusions ;
8. agréger ces productions sans écraser les divergences ;
9. qualifier la robustesse du processus ;
10. produire un verdict final traçable, auditable et révisable.

EvidenceForge n’est pas un moteur de réponse générique, un simple moteur de recherche, un système de vote d’experts, un RAG ordinaire, une base de professions, une collection de prompts métier ou un pipeline JMJS.

---

# 2. ADN FONDAMENTAL

## 2.1 Universalité

Le système doit fonctionner, en principe, pour toute mission nécessitant une consultation professionnelle structurée.

**Aucun métier, aucune discipline, aucun expert, aucune taxonomie de panel, aucun cas d’usage ne doit être hardcodé.**

## 2.2 Adaptativité

La composition du panel doit émerger de la mission.

Le système ne doit jamais appliquer une règle prédéfinie du type :

> « Pour ce type de problème, convoquer X, Y et Z. »

Il doit au contraire déterminer, au moment de l’exécution :

- quelles dimensions de la mission sont pertinentes ;
- quelles expertises sont nécessaires ;
- quelles disciplines sont éventuellement complémentaires ;
- quels professionnels disposent de travaux documentés utiles ;
- quels contrepoints ou domaines adjacents sont nécessaires pour éviter l’angle mort.

## 2.3 Intelligence sans hardcoding métier

L’intelligence du système doit résider dans l’analyse de la mission, la découverte, la vérification, le raisonnement documentaire, la composition dynamique du panel, la construction des jumeaux, la confrontation des analyses, l’agrégation et la qualification épistémique.

Elle ne doit jamais être remplacée par des listes de métiers pré-écrites, des correspondances sujet→profession, des règles spécifiques à JMJS, des tables de décision figées, des noms d’experts codés, des quotas disciplinaires ou des taxonomies imposées avant observation.

---

# 3. PRINCIPE NON NÉGOCIABLE : AUCUN CAS D’USAGE NE DEVIENT L’ARCHITECTURE

> **Aucune décision d’architecture ne doit transformer une caractéristique du cas d’usage courant en règle générale du moteur.**

Exemples :

- les disciplines découvertes pour une mission ne deviennent pas les disciplines d’EvidenceForge ;
- les sources retenues pour JMJS ne deviennent pas le modèle d’un corpus professionnel ;
- les auteurs-graines observés ne deviennent pas une règle de composition de panel ;
- JMJS ne doit apparaître dans aucun contrat générique du moteur ;
- une solution adaptée à OpenAlex ne doit pas être confondue avec la définition conceptuelle d’un professionnel.

---

# 4. PIPELINE CANONIQUE

```text
PHRASE D’AUDIT
      ↓
COMPRÉHENSION DE LA MISSION
      ↓
DÉCOMPOSITION DYNAMIQUE DES DIMENSIONS À EXAMINER
      ↓
DÉTERMINATION DES EXPERTISES NÉCESSAIRES
      ↓
STRATÉGIE DE RECHERCHE
      ↓
DÉCOUVERTE DOCUMENTAIRE
      ↓
SCREENING / QUALIFICATION DES SOURCES
      ↓
DÉCOUVERTE DE PROFESSIONNELS RÉELS
      ↓
VÉRIFICATION D’IDENTITÉ ET DE PERTINENCE
      ↓
PRÉQUALIFICATION DOCUMENTAIRE DES CANDIDATS
      ↓
VALIDATION HUMAINE DU PANEL DOCUMENTAIRE
      ↓
CONSTRUCTION DES CORPUS PROFESSIONNELS
      ↓
ÉLIGIBILITÉ DES JUMEAUX
      ↓
CONSTRUCTION DES JUMEAUX PROFESSIONNELS
      ↓
MÊME MISSION SOUMISE À CHAQUE JUMEAU
      ↓
REVUES INDÉPENDANTES
      ↓
AGRÉGATION
      ↓
CONVERGENCES / DIVERGENCES / RÉSERVES / INCONNUS
      ↓
ANALYSE DE STABILITÉ ET CONTRADICTIONS
      ↓
QUALIFICATION SCIENTIFIQUE DU PROCESSUS
      ↓
RAPPORT UNIFIÉ ET VERDICT
      ↓
ACCEPTATION HUMAINE POUR USAGE EN AVAL
```

Chaque étage doit avoir des entrées explicites, des sorties explicites, une provenance, une validation, un état d’échec clair, un lineage et aucune promotion silencieuse d’un statut vers un autre.

---

# 5. LE JUMEAU PROFESSIONNEL

Un jumeau professionnel n’est pas la personne réelle, une imitation psychologique, une imitation de style, un avatar conversationnel générique, un LLM auquel on donne seulement le nom d’un expert, une fiche biographique ou un résumé de quelques publications.

C’est une **représentation documentaire contrainte d’un professionnel réel**, construite uniquement à partir de preuves publiques, attribuables et traçables.

Il doit représenter, selon ce que les sources permettent réellement :

- positions documentées ;
- cadres théoriques ;
- méthodes ;
- concepts mobilisés ;
- arguments ;
- résultats publiés ;
- réserves ;
- limites ;
- controverses ;
- évolutions éventuelles ;
- désaccords documentés ;
- champs couverts ;
- champs non couverts ;
- incertitudes.

---

# 6. RÈGLE DE RAISONNEMENT DU JUMEAU

Le jumeau peut traiter une question nouvelle, mais il doit toujours distinguer :

```text
DOCUMENTÉ
INFÉRÉ À PARTIR DU CORPUS
NON DÉTERMINABLE
HORS CHAMP
```

Il est interdit de faire passer une inférence pour une position documentée, de compléter silencieusement un manque documentaire par la connaissance générale du LLM ou de faire parler un jumeau au-delà de ce que son corpus permet.

Le système doit préférer « non déterminable à partir du corpus disponible » à une hallucination plausible.

---

# 7. PANEL PROFESSIONNEL

Le panel doit être découvert dynamiquement, justifié par la mission, fondé sur des preuves, documenté, traçable, ouvert à la pluralité, capable d’inclure des positions divergentes et indépendant du verdict attendu.

Il ne doit jamais être prédéfini, choisi par popularité seule, choisi par nombre de citations seul, choisi pour confirmer une hypothèse, construit uniquement à partir des auteurs déjà présents dans le corpus, validé automatiquement parce qu’un ORCID existe, validé automatiquement parce qu’un auteur a publié dans un domaine proche ou rempli pour atteindre un quota.

---

# 8. STATUTS PROFESSIONNELS À NE PAS CONFONDRE

```text
SEED_AUTHOR
DISCOVERED_CANDIDATE
IDENTITY_RESOLVED
DOCUMENTARILY_RELEVANT
PRESENT_FOR_HUMAN_REVIEW
APPROVED_FOR_DOCUMENTARY_PANEL
VERIFIED_PROFESSIONAL
ELIGIBLE_FOR_TWIN
TWIN_CREATED
```

Aucun statut ne doit entraîner automatiquement le suivant sans le gate prévu.

Exemple :

```text
ORCID_PRESENT
≠
APPROVED_FOR_DOCUMENTARY_PANEL
```

---

# 9. HUMAN-IN-THE-LOOP

L’humain ne valide pas que l’expert « a raison ».

Pour le panel, il valide uniquement :

- identité correcte ;
- preuves rattachées à la bonne personne ;
- pertinence documentaire plausible ;
- absence d’ambiguïté bloquante ;
- admissibilité au panel documentaire.

Décisions possibles :

```text
APPROVE_FOR_DOCUMENTARY_PANEL
REJECT
DEFER
```

`DEFER` doit rester un état valide.

---

# 10. INVARIANT ÉPISTÉMIQUE

> **Unknown remains unknown.**

Il faut préserver explicitement :

- UNKNOWN ;
- DEFER ;
- AMBIGUOUS ;
- NOT_ASSESSED ;
- IMPOSSIBLE_TO_ASSESS ;
- reservations[] ;
- unknowns[].

Une absence de preuve n’est jamais une preuve d’absence. Une absence de résumé n’est pas une preuve de non-pertinence. Une identité non résolue n’est pas une identité fausse. Une divergence n’est pas une erreur à supprimer.

---

# 11. AGRÉGATION DES AVIS

L’agrégation doit distinguer :

```text
CONVERGENCE
DIVERGENCE
MINORITY_POSITION
RESERVATION
NON_DETERMINABLE
CONTRADICTION
SOURCE_SENSITIVE
DISCIPLINE_SENSITIVE
FRAGILE_CONCLUSION
STABLE_CONCLUSION
```

Majorité ≠ vérité. Minorité ≠ erreur. Contradiction ≠ donnée à nettoyer. Absence de convergence ≠ échec du système.

---

# 12. QUALITÉ DU PROCESSUS ≠ CONTENU DU VERDICT

EvidenceForge doit toujours séparer la **qualification du processus** du **verdict sur la question**.

Exemples valides :

```text
PROCESS_QUALIFICATION = QUALIFIED
JMJS_VERDICT = NO_GO
```

```text
PROCESS_QUALIFICATION = QUALIFIED_WITH_RESERVATIONS
JMJS_VERDICT = IMPOSSIBLE_TO_CONCLUDE
```

Un processus `NOT_QUALIFIED` ne supprime pas le verdict technique éventuellement produit. Il interdit seulement de le présenter comme scientifiquement qualifié ou de l’utiliser comme base d’une étape aval.

---

# 13. QUALIFICATION SCIENTIFIQUE ADDITIVE

Les anciens artefacts ne sont jamais réécrits pour paraître plus valides qu’ils ne l’étaient.

```text
legacy.scientificValidity = false
```

reste `false`.

Un nouvel artefact peut dire :

```text
ScientificQualification.status =
QUALIFIED
QUALIFIED_WITH_RESERVATIONS
NOT_QUALIFIED
IMPOSSIBLE_TO_ASSESS
```

Il qualifie le processus. Il ne réécrit pas l’histoire.

---

# 14. LLM : CAPACITÉ RÉELLE

Un booléen comme :

```text
dependenciesAvailable.llm = true
```

ne prouve rien.

La disponibilité réelle doit être démontrée par un artefact de capacité avec provider réel, modèle réel, worker réel, configuration, preuve de présence des credentials sans exposer le secret, sonde réelle, requestId, réponse conforme, validation du schéma, horodatage et état de la sonde.

Un probe de fixture ou de test ne peut jamais être utilisé comme preuve d’un run réel.

---

# 15. INTERDICTION ABSOLUE DE FABRICATION

EvidenceForge ne doit jamais fabriquer :

- DOI ;
- ORCID ;
- OpenAlex ID ;
- PMID ;
- identifiant professionnel ;
- institution ;
- affiliation ;
- auteur ;
- référence ;
- date ;
- preuve humaine.

Si une valeur n’existe pas, elle reste `null`, `unknown`, `not_available` ou état contractuel équivalent.

---

# 16. LINEAGE OBLIGATOIRE

Toute conclusion doit être retraçable :

```text
verdict
→ agrégation
→ revues
→ jumeaux
→ corpus professionnels
→ panel
→ validation humaine
→ découverte professionnelle
→ sources
→ stratégie de recherche
→ mission
```

Une conclusion sans lineage est invalide.

---

# 17. FAIL-CLOSED

Interdictions :

```text
0 professionnels → SUCCESS scientifique
0 jumeaux → SUCCESS scientifique
0 revues → SUCCESS scientifique
LLM absent → SUCCESS
identité ambiguë → panel approuvé
validation humaine absente → continuation automatique
```

Un succès technique n’est pas un succès scientifique.

---

# 18. CHECKLIST ANTI-HARDCODING

Avant chaque implémentation, rechercher explicitement :

- noms de professions ;
- disciplines fixes ;
- spécialités fixes ;
- listes d’experts ;
- panels fixes ;
- règles JMJS dans une brique générique ;
- taxonomies propres à une mission ;
- schéma fournisseur confondu avec le modèle métier ;
- seuils arbitraires ;
- quotas disciplinaires ;
- verdict par défaut ;
- booléens déclaratifs tenant lieu de preuve.

Classer tout hardcoding détecté :

```text
NECESSARY_INFRASTRUCTURE_CONSTANT
CONTRACTUAL_CONSTANT
CONFIGURATION
CASE_SPECIFIC_LEAK
DOMAIN_HARDCODING
BUG
```

`CASE_SPECIFIC_LEAK` et `DOMAIN_HARDCODING` sont interdits.

---

# 19. GOUVERNANCE DES RÔLES

## Propriétaire produit

Le propriétaire décide des objectifs, approuve les changements majeurs, valide les gates humains, accepte ou refuse une rupture de contrat, décide du dégel éventuel d’un lot et décide de l’usage final du verdict.

## ChatGPT

ChatGPT maintient l’architecture, la cohérence système, les invariants, les frontières des lots, les cahiers des charges, les critères d’acceptation, l’audit indépendant, le contrôle anti-régression, les statuts GELABLE / NON GELABLE / GELÉ et l’autorisation de passage au lot suivant.

## Claude Code / opérateur de code

Claude Code inspecte, implémente, teste, corrige, documente, package et produit les preuves. Il propose un verdict technique.

Il ne peut pas seul changer l’architecture, modifier un contrat gelé, simuler une décision humaine, changer les invariants scientifiques, changer la gouvernance, autoriser le lot suivant ou transformer un cas particulier en règle générale.

---

# 20. STATUT DES LOTS

```text
EN_CONCEPTION
IMPLEMENTÉ
TESTÉ
AUDITÉ
GELABLE
NON_GELABLE
GELÉ
HISTORIQUE
REMPLACÉ_PAR_SUCCESSEUR
```

`tests pass` ≠ `GELABLE`.  
`GELABLE` ≠ `GELÉ`.

---

# 21. POLITIQUE DE GEL

Si un défaut est découvert :

1. reproduire ;
2. identifier la cause ;
3. déterminer si le défaut est local ou contractuel ;
4. préférer un successeur additif ;
5. ne dégeler qu’en dernier recours ;
6. documenter la décision propriétaire ;
7. conserver l’historique.

Préférer :

```text
composition
+ adaptateur
+ successeur
+ nouveau gate
```

avant une réécriture du gelé.

---

# 22. NON-RÉGRESSION

Ne jamais se fier uniquement à une constante de hash écrite par le même lot, un rapport produit par l’implémenteur ou une assertion tautologique.

Préférer :

- SHA256SUMS existants ;
- packages livrés antérieurement ;
- références croisées indépendantes ;
- fresh extraction ;
- test par mutation ;
- comparaison byte-identique ;
- validateurs gelés réellement appelés.

---

# 23. TESTS

Les tests doivent être discriminants.

Ils doivent inclure, selon le risque :

- positifs ;
- négatifs ;
- forme réelle ;
- raccord runtime réel ;
- mutation ;
- fresh extraction ;
- fail-closed ;
- lineage ;
- anti-fabrication ;
- anti-hardcoding.

Un mock ne doit jamais masquer le raccord réel que l’on prétend valider.

---

# 24. DETTES ET BUGS

Classer toute anomalie :

```text
BUG
CONTRACT_GAP
INTEGRATION_GAP
TEST_GAP
FIXTURE_GAP
SCIENTIFIC_LIMITATION
DOCUMENTATION_DEBT
PACKAGING_DEBT
PORTABILITY_DEBT
CASE_SPECIFIC_LEAK
HARDCODING
```

Aucune dette bloquante ne doit être reportée silencieusement.

---

# 25. ANTI-DIGRESSION

Avant chaque prompt, demander :

1. Cette étape rapproche-t-elle directement EvidenceForge de son objectif ?
2. Corrige-t-on le système ou seulement le cas courant ?
3. Ajoute-t-on du hardcoding ?
4. Modifie-t-on un invariant sans décision propriétaire ?
5. Introduit-on une nouvelle couche alors que la précédente n’est pas prouvée ?
6. Le résultat sera-t-il réutilisable hors JMJS ?
7. Le prochain état DONE est-il clair ?

Si une dérive apparaît : STOP et recentrage.

---

# 26. ANTI-SURINGÉNIERIE

Toute nouvelle abstraction doit justifier :

```text
PROBLÈME RÉEL
CONTRAT MANQUANT
RISQUE COUVERT
POINT D’INSERTION
CRITÈRE DE SUCCÈS
```

Pas de module simplement parce qu’il serait « propre ».

---

# 27. INDÉPENDANCE AU FOURNISSEUR

OpenAlex, Crossref, PubMed ou tout autre provider sont des moyens, pas l’ontologie du système.

```text
CONCEPT INTERNE
↕ adaptateur
SCHÉMA FOURNISSEUR
```

Une propriété absente chez un provider ne doit jamais être inventée.

---

# 28. PROTECTION CONTRE LA CIRCULARITÉ

Éviter :

```text
source retenue
→ auteur retenu
→ expert validé
→ jumeau
→ conclusion confirmant la source
```

sans contrôle indépendant.

Protections :

- seed ≠ panel ;
- identité ≠ expertise ;
- expertise ≠ vérité ;
- source citée ≠ sélection automatique ;
- découverte secondaire ;
- validation documentaire ;
- gate humain ;
- divergences conservées ;
- sélection indépendante du résultat attendu.

---

# 29. VÉRITÉ DES ARTEFACTS

```text
technicalSuccess = true
```

ne signifie pas `scientificSuccess = true`.

```text
identityVerified = true
```

ne signifie pas `expertiseRelevant = true`.

```text
ORCID_PRESENT
```

ne signifie pas `APPROVED_PANEL_MEMBER`.

```text
LLM_DECLARED
```

ne signifie pas `LLM_AVAILABLE`.

```text
sourceIncluded
```

ne signifie pas `claimTrue`.

---

# 30. RAPPORT FINAL

Un rapport final EvidenceForge doit permettre de comprendre :

1. la mission ;
2. comment le panel a émergé ;
3. qui a été retenu et pourquoi ;
4. quelles preuves supportent chaque professionnel ;
5. comment les jumeaux ont été construits ;
6. quelles analyses ils ont produites ;
7. quelles conclusions convergent ;
8. quelles conclusions divergent ;
9. quelles réserves subsistent ;
10. ce qui reste inconnu ;
11. la robustesse du processus ;
12. le verdict ;
13. ce que le verdict autorise ;
14. ce qu’il n’autorise pas ;
15. le lineage complet.

---

# 31. ÉTAPES AVAL

Aucune étape aval ne doit démarrer simplement parce que le pipeline a techniquement produit un rapport.

Elle exige :

- processus suffisamment qualifié ;
- verdict compatible ;
- réserves explicites ;
- lineage valide ;
- éventuelle acceptation humaine finale prévue par le contrat.

Pour JMJS, P0.2 reste interdit tant que P0.1 n’a pas produit un résultat scientifiquement exploitable et explicitement accepté pour usage aval.

---

# 32. CRITÈRE ULTIME DE SUCCÈS

EvidenceForge réussit lorsque l’on peut lui donner une phrase d’audit nouvelle, dans un domaine nouveau, sans modifier son code métier, et qu’il peut :

```text
comprendre
→ découvrir
→ vérifier
→ constituer
→ représenter
→ analyser
→ confronter
→ qualifier
→ conclure
```

avec aucune profession pré-écrite, aucun expert pré-écrit, aucune réponse pré-écrite, aucune taxonomie imposée, aucune décision humaine simulée, aucune preuve fabriquée, aucun raccourci silencieux et aucun résultat sans lineage.

---

# 33. TEST D’UNIVERSALITÉ

> **Si demain la mission n’était plus JMJS mais un problème de pont, de droit fiscal, de cybersécurité, de biodiversité ou de politique publique, cette architecture fonctionnerait-elle sans modifier sa logique métier ?**

Si NON : chercher le hardcoding ou la fuite de cas d’usage.

---

# 34. PRÉAMBULE OBLIGATOIRE À TOUT NOUVEAU PROMPT

```text
EVIDENCEFORGE — RAPPEL D’IDENTITÉ ET D’ADN

EvidenceForge est un moteur universel de consultation professionnelle simulée
fondée sur des preuves publiques.

À partir d’une phrase d’audit, il doit déterminer dynamiquement les expertises
nécessaires, découvrir de vrais professionnels, vérifier leur pertinence,
construire des jumeaux professionnels documentaires, leur faire étudier la même
question indépendamment, puis agréger convergences, divergences, réserves,
inconnus et conclusions dans un verdict traçable.

INVARIANTS ABSOLUS :

- aucun métier hardcodé ;
- aucune discipline hardcodée ;
- aucun panel hardcodé ;
- aucun expert hardcodé ;
- aucun cas d’usage hardcodé ;
- aucune taxonomie imposée avant observation ;
- aucune preuve ou identité fabriquée ;
- aucune décision humaine simulée ;
- unknown reste unknown ;
- seed ≠ expert ;
- identité ≠ pertinence ;
- pertinence ≠ vérité ;
- succès technique ≠ succès scientifique ;
- qualité du processus ≠ contenu du verdict ;
- les artefacts gelés ne sont jamais réécrits silencieusement ;
- chaque conclusion doit conserver son lineage ;
- une caractéristique du cas courant ne devient jamais une règle générale.

JMJS est un cas d’application d’EvidenceForge.
JMJS ne définit pas EvidenceForge.

Toute proposition qui viole un de ces invariants doit être stoppée,
signalée et corrigée avant poursuite.
```

---

# 35. CHECKLIST AVANT CHAQUE PROMPT

```text
[ ] Le prompt respecte l’identité universelle d’EvidenceForge.
[ ] Aucun métier ou domaine n’est hardcodé.
[ ] Aucun élément JMJS n’est injecté dans une brique générique.
[ ] Le problème traité est réel et prouvé.
[ ] Le lot précédent est suffisamment stable pour avancer.
[ ] Les entrées et sorties sont contractuellement définies.
[ ] Unknown/DEFER/AMBIGUOUS restent représentables.
[ ] Aucun acte humain ne peut être simulé.
[ ] Aucun identifiant ne peut être fabriqué.
[ ] Aucun booléen déclaratif ne tient lieu de preuve réelle.
[ ] Le vrai raccord runtime est testé.
[ ] Les tests sont discriminants.
[ ] La non-régression est mesurable.
[ ] Le lineage est conservé.
[ ] Le fournisseur n’est pas confondu avec le modèle conceptuel.
[ ] Le cas courant ne devient pas l’architecture.
[ ] La dette créée est nulle ou explicitement documentée.
[ ] Le prochain état DONE est défini.
[ ] Aucun travail aval prématuré n’est lancé.
```

---

# 36. CHECKLIST APRÈS CHAQUE LIVRABLE

```text
[ ] La fonction annoncée est réellement utilisable, pas seulement testée en isolation.
[ ] Le vrai port/runtime est traversé.
[ ] Les sorties réelles correspondent aux schémas attendus.
[ ] Aucun empty-success trompeur.
[ ] Aucun identifiant synthétique.
[ ] Aucun hardcoding métier ou cas d’usage ajouté.
[ ] Aucun lot gelé modifié.
[ ] Aucun test tautologique.
[ ] Mutation tests effectués sur les risques majeurs.
[ ] Fresh extraction PASS.
[ ] SHA256SUMS / manifest cohérents.
[ ] Limitations et réserves explicites.
[ ] Le verdict technique est distinct du verdict scientifique.
[ ] Les conditions du lot suivant sont satisfaites.
```

---

# 37. RÈGLE DE STOP

Le système doit s’arrêter si l’un des éléments suivants survient :

- contrat contradictoire ;
- identité non résolue critique ;
- artefact obligatoire absent ;
- human gate requis mais absent ;
- LLM requis mais non réellement disponible ;
- lineage cassé ;
- source ou professionnel fabriqué ;
- dépendance déclarative non prouvée ;
- modification d’un lot gelé non autorisée ;
- hardcoding métier introduit ;
- résultat scientifique produit à partir d’un pipeline vide ;
- tentative de transformer un inconnu en certitude.

**Fail closed. Toujours.**

---

# 38. SERMENT D’ARCHITECTURE

> Je construis EvidenceForge, pas le cas d’usage courant.

> Le système découvre ce qu’il doit savoir ; je ne le lui préprogramme pas.

> Les professionnels sont découverts, jamais prédéfinis.

> Les jumeaux sont documentaires, jamais imaginaires.

> Les divergences sont conservées, jamais lissées.

> L’inconnu reste inconnu.

> Un succès technique n’est jamais maquillé en succès scientifique.

> Aucun acte humain n’est simulé.

> Aucun identifiant n’est fabriqué.

> Aucun résultat n’existe sans preuve et sans lineage.

> Les lots gelés restent intacts jusqu’à décision explicite.

> Toute nouvelle couche doit renforcer l’universalité, pas enfermer le système dans son premier cas.

Si l’une de ces phrases devient fausse, le chantier doit être stoppé et recentré.

---

# 39. PHRASE DIRECTRICE

> **Une phrase d’audit entre. Un panel professionnel pertinent émerge. Des jumeaux documentaires de professionnels réels étudient indépendamment la question. EvidenceForge confronte leurs analyses, conserve leurs désaccords et leurs inconnus, qualifie la solidité du processus et produit un verdict traçable — sans métier, expert, réponse ou cas d’usage hardcodé.**

---

# 40. AUTORITÉ DE CE DOCUMENT

Ce document est le **garant de direction du projet**.

Avant tout prompt important :

1. le relire ;
2. vérifier que le prompt le respecte ;
3. signaler toute contradiction ;
4. corriger le prompt avant exécution ;
5. refuser toute dérive qui sacrifierait l’universalité, la traçabilité ou l’intégrité scientifique au profit de la facilité d’implémentation.

Aucun succès local ne justifie une régression globale.  
Aucun raccourci de test ne justifie une dette architecturale.  
Aucun cas particulier ne justifie du hardcoding.  
Aucun résultat séduisant ne justifie la perte de preuve.

---

**FIN — DOCUMENT DIRECTEUR EVIDENCEFORGE**
