# EvidenceForge — CDC directeur de reprise JMJS / Revue professionnelle documentaire v1.0

**Date :** 28 août 2026  
**Statut :** nouvelle référence de reprise opérationnelle, dérivée des CDC et roadmaps EvidenceForge v0.3/v1.1 et du CDC directeur JMJS D103 v4.1  
**Objet :** remettre EvidenceForge sur sa finalité initiale : permettre à JMJS de franchir l'étape D103P0.1 de revue professionnelle de structure en construisant des jumeaux documentaires à partir de professionnels réels et de leurs travaux publics, puis en leur faisant traiter la grille P0.1 de façon traçable.

---

# 0. Décision directrice

Le blocage actuel de JMJS n'est pas un problème d'UX générale ni un problème du moteur de balade.

Le blocage est méthodologique :

```text
D103P0.0-A
S01 / S02 réels, dé-identifiés
        ↓
D103P0.0-B
analyse descriptive comparative
        ↓
D103P0.1
grille de revue professionnelle
        ↓
BLOCAGE HISTORIQUE :
pas de panel professionnel disponible pour effectuer la revue
```

EvidenceForge doit lever ce blocage.

La finalité est :

```text
S01 + S02 + P0.0-B + grille P0.1
        ↓
corpus scientifique général
        ↓
découverte de professionnels réels pertinents
        ↓
vérification d'identité
        ↓
corpus public attribuable par professionnel
        ↓
éligibilité documentaire
        ↓
jumeaux documentaires
        ↓
passage de la même grille P0.1 par chaque jumeau
        ↓
agrégation / divergences / réserves / non-déterminables
        ↓
verdict documentaire synthétique
        ↓
D103P0.2 — taxonomie minimale
```

Le système ne doit jamais prétendre que les professionnels réels ont participé.

---

# 1. Autorité documentaire

Ordre d'autorité pour ce chantier :

1. `D103-v4.1-CDC-directeur-moteur-global-sentinelles-2026-08-20`
2. `D103-FEUILLE-DE-ROUTE-MAITRE-ANTI-DERIVE-v1.3-2026-08-21`
3. `D103P0.0-B — Analyse descriptive comparative S01 / S02 v0.3`
4. `D103P0.1 — Grille de revue professionnelle de structure v0.2`
5. `EvidenceForge-CDC-v0.3-2026-08-24`
6. `EvidenceForge-CDC-technique-v0.3-2026-08-24`
7. `EvidenceForge-ROADMAP-v1.1-2026-08-24`
8. `EvidenceForge-EF-02G0-GOUVERNANCE-JUMEAUX-v0.1-2026-08-24`
9. `EF-ORCH-RELEASE v0.1` gelée et archivée
10. `EF-ORCH-RC-AUDIT v0.2` clos, empreinte méthodologique additive uniquement

Toute proposition qui contredit D103 v4.1 ou la feuille anti-dérive doit être stoppée avant codage.

---

# 2. État réel au 28 août 2026

## 2.1 JMJS

Déjà réalisés :

- S01 et S02 ont été recueillis comme cas sentinelles réels, dé-identifiés et contrastés ;
- ils restent des cas d'observation, jamais des profils produit ;
- l'analyse descriptive comparative P0.0-B existe ;
- la grille de revue professionnelle P0.1 v0.2 existe ;
- la prochaine étape méthodologique autorisée après revue est P0.2 — taxonomie minimale ;
- aucune taxonomie, règle métier, seuil, prescription ou bibliothèque d'exercices ne doit être produite avant la revue P0.1.

## 2.2 EvidenceForge

Le socle documentaire EF-01 a été industrialisé dans `EF-ORCH-RELEASE v0.1` :

```text
EF-01A Mission Draft
EF-01B Discipline Resolver
EF-01C1 Search Planner
EF-01C2 Search Execution
EF-01D Screening
EF-01E Qualification TEST
EF-01F Corpus Freeze
```

Ce moteur A→F est gelé. Il ne doit pas être réécrit.

Il fournit notamment :

- RunContract ;
- SearchProtocol ;
- recherche OpenAlex / Crossref / PubMed ;
- screening ;
- CorpusSnapshot ;
- persistance IndexedDB ;
- reprise durable ;
- intégrité et checkpoints ;
- monolithe reproductible.

Limite connue : EF-01E reste TEST/non scientifique. Cela doit être affiché honnêtement et ne doit pas être maquillé.

## 2.3 Gouvernance des jumeaux

EF-02G0 existe comme barrière de gouvernance :

```text
personne réelle
≠ corpus public associé
≠ jumeau documentaire
≠ avis réel de la personne
```

Les statuts épistémiques obligatoires sont :

```text
documented
cautious_inference
not_determinable
```

Pendant le pilote JMJS :

```text
intendedUse = research_internal
```

Aucun jumeau public persistant.

---

# 3. Ce que doit devenir le monolithe

Le monolithe final recherché n'est pas un remplacement du monolithe EF-ORCH v0.1.

Il doit être une **extension additive** ou un **nouveau monolithe de niveau supérieur** qui embarque/réutilise le socle gelé A→F et ajoute la chaîne professionnelle.

Architecture cible :

```text
EvidenceForge Professional Review Monolith
|
+-- CORE GELÉ
|   `EF-ORCH-RELEASE v0.1`
|   EF-01A → EF-01F
|
+-- PROFESSIONAL DISCOVERY
|   EF-02A
|
+-- PROFESSIONAL VERIFICATION
|   EF-02B
|
+-- PROFESSIONAL CORPUS
|   EF-02C
|
+-- TWIN ELIGIBILITY
|   EF-02D
|
+-- DOCUMENTARY TWIN BUILDER
|   EF-02E
|
+-- QUESTIONNAIRE / REVIEW RUNNER
|   EF-03A
|
+-- AGGREGATION
|   EF-03B
|
+-- STABILITY / CONTRADICTION
|   EF-03C
|
+-- REPORT / EXPORT
    EF-04
```

Le monolithe v0.1 ne doit pas être modifié rétroactivement. Toute nouvelle brique doit être additive et versionnée.

---

# 4. Entrées du pilote JMJS

La mission JMJS doit accepter au minimum :

```text
1. HTML / export du sujet S01
2. HTML / export du sujet S02
3. D103P0.0-B — analyse comparative
4. D103P0.1 — grille de revue professionnelle v0.2
5. D103 v4.1
6. feuille de route anti-dérive v1.3
7. corpus / documents scientifiques utiles déjà fournis
8. paramètres éventuels de langue / géographie / période
```

S01 et S02 sont des `targetDocuments` / documents de contexte de la revue.

Ils ne deviennent jamais automatiquement des preuves.

La grille P0.1 est le **questionnaire à faire traiter** par les jumeaux documentaires.

---

# 5. Principe anti-hardcoding de S01 / S02

Invariant absolu :

```text
S01 / S02
= cas d'observation
≠ profils produit
≠ catégories
≠ règles métier
≠ seuils
≠ exceptions codées
```

Aucune valeur, préférence, difficulté, activité, formulation, combinaison ou chiffre propre à S01/S02 ne peut devenir directement :

- une branche de code ;
- un seuil ;
- une taxonomie ;
- un profil ;
- une règle de progression ;
- une règle de suitability ;
- une recommandation automatique.

Les jumeaux doivent répondre à la question de P0.1 :

> Qu'est-ce que la structure doit savoir représenter pour pouvoir accueillir correctement ces deux personnes, sans connaître à l'avance qui elles sont ?

---

# 6. EF-02A — Professional Discovery

## Objectif

Identifier les professionnels réels pertinents pour la mission, sans quota prédéfini.

## Entrées

- disciplines retenues ;
- CorpusSnapshot EF-01F ;
- question / grille P0.1 ;
- documents JMJS pour contexte ;
- paramètres de recherche.

## Connecteurs prioritaires

- OpenAlex ;
- Crossref ;
- PubMed lorsque pertinent ;
- ORCID si disponible ;
- pages institutionnelles ;
- sociétés savantes ;
- web public traçable.

## Sortie

`ProfessionalCandidate[]`

Chaque candidat conserve :

- nom ;
- discipline ;
- fonction/institution déclarée ;
- identifiants publics connus ;
- source de découverte ;
- requête exacte ;
- connecteur ;
- date ;
- références d'identification.

Un candidat n'est jamais encore considéré comme vérifié.

Aucun quota de professionnels n'est codé.

---

# 7. EF-02B — Professional Verification

Objectif : prouver que le candidat correspond bien à une personne réelle et résoudre les homonymies.

Sources possibles :

- site institutionnel ;
- ORCID ;
- OpenAlex ;
- Crossref ;
- PubMed ;
- société savante ;
- éditeur universitaire ;
- CV ou profil académique public.

Sortie :

`ProfessionalRecord`

Doit contenir :

- identité vérifiée ;
- institutions ;
- disciplines ;
- domaines documentés ;
- identifiants publics ;
- preuves d'identité ;
- ambiguïtés ;
- date de vérification ;
- statut de vérification.

Si l'identité reste ambiguë :

```text
pas de jumeau
```

---

# 8. EF-02C — Professional Corpus Builder

Pour chaque professionnel vérifié, construire un corpus public attribuable.

Peuvent entrer :

- publications ;
- ouvrages ;
- guidelines ;
- recommandations signées/co-écrites ;
- conférences ou supports publics ;
- documents institutionnels ;
- pages professionnelles pertinentes ;
- autres traces publiques attribuables.

Chaque document doit porter une attribution traçable :

```text
professionalAttribution
- professionalRef
- attributionType
- attributionEvidence
- confidence
```

Interdit :

- attribution sur simple similarité de nom ;
- réutilisation d'un document non attribuable ;
- réinterrogation inutile d'OpenAlex si le corpus a déjà été extrait et figé ;
- invention pour compléter un corpus faible.

Le système doit privilégier la réutilisation locale des données EF-02C déjà extraites.

---

# 9. EF-02D — Twin Eligibility

Décider si un professionnel possède un corpus suffisant pour construire un jumeau utile à la mission.

Critères explicables :

- identité suffisamment vérifiée ;
- corpus attribuable ;
- pertinence du corpus pour la mission ;
- volume utile ;
- couverture temporelle ;
- diversité documentaire ;
- ambiguïtés majeures ;
- conflits d'attribution.

Statuts :

```text
eligible
insufficient_public_corpus
identity_ambiguous
mission_irrelevant
excluded
```

Le nombre de jumeaux est **le résultat de ce filtre**, jamais un objectif fixé à l'avance.

---

# 10. EF-02E — Documentary Twin Builder

Un `DocumentaryTwin` n'est pas une persona créative.

Il compile :

- identité publique vérifiée ;
- domaines documentés ;
- corpus attribué ;
- limites du corpus ;
- règles d'inférence ;
- provenance ;
- version du moteur/prompt.

Le jumeau ne peut jamais inventer :

- une publication ;
- une expérience ;
- une opinion ;
- une compétence ;
- une recommandation ;
- une position personnelle absente du corpus.

Toute sortie doit distinguer :

```text
documented
cautious_inference
not_determinable
```

---

# 11. EF-03A — Questionnaire / Review Runner

C'est le cœur du cas d'usage JMJS.

Chaque jumeau reçoit **exactement la même grille D103P0.1** ainsi que les mêmes documents de mission.

La grille n'est pas remplacée par un résumé générique.

Le runner doit conserver la structure des questions et produire une réponse question par question.

Sortie conceptuelle :

```text
TwinReview
- reviewId
- twinRef
- questionnaireRef
- questionResults[]
- overallVerdict
- genericRepresentationNeeds[]
- reservations[]
- excludedPrematureConclusions[]
- requiredChangesBeforeP0_2[]
- sourcesMobilized[]
- epistemicSummary
- generatedAt
```

Chaque `questionResult` contient au minimum :

```text
questionId
answer
status
rationale
supportingEvidence[]
contradictoryEvidence[]
limitations[]
```

`status` ∈ :

```text
documented
cautious_inference
not_determinable
```

Le jumeau ne répond jamais à une question hors corpus en inventant.

Le runner doit respecter les interdictions de P0.1 :

- pas de diagnostic ;
- pas de traitement ;
- pas de prescription ;
- pas de taxonomie finale ;
- pas de règle métier ;
- pas de seuil ;
- pas de profil-type ;
- pas de généralisation populationnelle.

---

# 12. EF-03B — Aggregation

Le système agrège des **revues synthétiques**, jamais des votes humains.

Doivent être distingués :

```text
professionnels trouvés
professionnels vérifiés
professionnels suffisamment documentés
jumeaux éligibles
revues produites
réponses documented
réponses cautious_inference
réponses not_determinable
```

L'agrégation doit faire apparaître :

- convergences ;
- divergences ;
- réserves ;
- objections critiques ;
- signaux minoritaires ;
- éléments non déterminables ;
- besoins génériques de représentation ;
- modifications proposées ;
- points à exclure explicitement de P0.2 ;
- verdicts sur le passage à P0.2.

Aucune moyenne ou majorité ne transforme une inférence fragile en vérité.

---

# 13. EF-03C — Stability / Contradiction

Objectif : vérifier que la synthèse ne dépend pas d'un artefact de génération ou d'un sous-ensemble arbitraire.

Les passes supplémentaires servent à tester la stabilité, jamais à augmenter artificiellement le nombre de « professionnels ».

Tester au minimum :

- stabilité des convergences majeures ;
- persistance des divergences ;
- impact du retrait d'un jumeau ;
- sensibilité aux réponses non déterminables ;
- contradictions internes ;
- stabilité du verdict P0.1.

Si l'agrégation reste instable :

```text
ne pas forcer un verdict
→ documenter l'instabilité
→ demander une revue complémentaire ou conserver impossible_to_conclude
```

---

# 14. EF-04 — Rapport de sortie

Le rapport doit permettre à JMJS de reprendre P0.2.

Il contient au minimum :

1. mission JMJS ;
2. documents S01 / S02 ;
3. analyse P0.0-B ;
4. grille P0.1 ;
5. corpus scientifique général ;
6. disciplines ;
7. protocole de recherche ;
8. professionnels identifiés ;
9. vérification d'identité ;
10. corpus professionnel par personne ;
11. critères d'éligibilité ;
12. jumeaux construits ;
13. réponses individuelles à la grille ;
14. convergences ;
15. divergences ;
16. réserves ;
17. non-déterminables ;
18. besoins génériques de représentation ;
19. points à exclure de P0.2 ;
20. verdict synthétique ;
21. limites ;
22. provenance et versions.

Bandeau obligatoire :

> Ce rapport contient des simulations d'avis produites par IA à partir de documents publics associés à des professionnels réels. Les professionnels cités n'ont pas participé à cette revue et n'ont pas validé les réponses synthétiques. Toute position non explicitement documentée est signalée comme inférence prudente ou non déterminable.

---

# 15. Go / No-Go pour reprendre JMJS

EvidenceForge n'autorise le passage à D103P0.2 que si :

- S01 et S02 ont été pris en compte sans hardcoding ;
- la grille P0.1 a été traitée intégralement ;
- chaque réponse synthétique est traçable ;
- les identités des professionnels utilisés sont suffisamment vérifiées ;
- chaque jumeau possède un corpus attribuable ;
- les inconnues ont été conservées ;
- les divergences ne sont pas masquées ;
- les besoins génériques de représentation sont explicités ;
- les conclusions prématurées sont listées ;
- un verdict synthétique est produit :

```text
GO
GO_WITH_RESERVATIONS
NO_GO
IMPOSSIBLE_TO_CONCLUDE
```

`GO` ou `GO_WITH_RESERVATIONS` permet de reprendre :

```text
D103P0.2 — taxonomie minimale
```

Ce n'est pas une validation professionnelle humaine réelle.

---

# 16. Non-régression

Ne jamais :

- modifier rétroactivement `EF-ORCH-RELEASE v0.1` ;
- remplacer `runContractHash` historique ;
- présenter EF-01E TEST comme validation scientifique ;
- hardcoder S01/S02 ;
- fixer un nombre arbitraire de professionnels ;
- dire « les professionnels ont répondu » ;
- dire « le Pr X valide » ;
- attribuer un document sur simple homonymie ;
- transformer une absence de preuve en opinion synthétique ;
- faire d'OpenAlex la seule preuve d'identité ;
- demander au LLM de combler un manque documentaire ;
- coder P0.2 avant le verdict P0.1.

---

# 17. Critère de réussite du chantier

Le chantier est réussi lorsque, avec les documents réels JMJS :

```text
S01.html
S02.html
P0.0-B
P0.1
D103 v4.1
anti-dérive v1.3
```

EvidenceForge peut exécuter :

```text
EF-01
→ EF-02A
→ EF-02B
→ EF-02C
→ EF-02D
→ EF-02E
→ EF-03A
→ EF-03B
→ EF-03C
→ EF-04
```

et produire un dossier de revue documentaire suffisamment traçable pour décider si JMJS peut passer à P0.2.

---

# 18. Principe final

Le but n'est pas de fabriquer des experts fictifs.

Le but est de construire un dispositif reproductible où :

```text
vraies personnes
+ vrais travaux publics
+ attribution vérifiée
+ corpus individuel
+ simulation documentaire contrainte
+ questionnaire réel
+ traçabilité
+ divergences conservées
=
revue professionnelle documentaire synthétique utilisable comme pilote interne
```
