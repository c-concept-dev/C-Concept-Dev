# OPRIE-REFERENCE-ORACLE-01 — Un oracle qui ne doit rien à aucun fournisseur

## A. Objet

Le lot précédent s'est arrêté sur une impasse : il comparait Anthropic à Groq, et Groq s'est
révélé incapable de servir de référence — 2 décisions gouvernées sur 12. Il manquait donc une
vérité terrain **indépendante de tout fournisseur**.

Ce lot la construit. Trente cas du corpus de régression existant reçoivent un état OPRIE
attendu, dérivé **du contrat OPRIE lui-même** et du contenu de chaque fixture — jamais d'une
sortie de modèle, jamais d'un vote entre fournisseurs, jamais d'un juge LLM.

**Aucun appel fournisseur n'a été émis. Aucun déploiement. Aucun code de production modifié.**

Ce document **n'est pas une autorité de production**. L'oracle évalue ; il ne décide rien, ne
route rien, ne produit aucun READY à l'exécution.

---

## B. Méthode

Pour chaque fixture, la même séquence, dans cet ordre : lire la demande ; lire ce qu'elle
fournit réellement ; lire le contrat ; déterminer s'il manque une information **matérielle et
non substituable** ; déterminer si une confirmation explicite est requise ; déterminer si le
travail est exécutable ; déterminer s'il y a blocage réel ; écrire l'état, la justification et
les comportements interdits.

**Construction à l'aveugle des fournisseurs.** Aucune sortie Groq ou Anthropic n'a été consultée
pour fixer l'attente d'un cas. Les cinq cas que le lot précédent avait signalés — R08, R09, A01,
A02, A03 — ont été traités par la même règle uniforme que les vingt-cinq autres, sans que leur
historique n'entre dans le raisonnement.

**Aucune similarité textuelle.** Ni distance d'édition, ni appariement flou, ni embeddings, ni
cosinus, ni BLEU, ni seuil sémantique. L'oracle porte sur le comportement gouverné, jamais sur
la formulation.

---

## C. Sources d'autorité

1. **Les définitions des quatre états**, écrites dans le prompt de l'Arbitre :
   - `operational_request_ready` — le livrable peut être produit sans ambiguïté matérielle non
     résolue, sans arbitrage silencieux, sans donnée fabriquée. *« Le simple fait qu'une réponse
     générale soit possible n'est jamais un critère suffisant. »*
   - `clarification_required` — une inconnue **matérielle non substituable** subsiste réellement.
   - `confirmation_required` — candidat structurellement prêt, mais risque de dérive significatif.
     *« N'utilisez jamais cet état comme échappatoire à un problème matériel non résolu. »*
   - `blocked` — aucune question utile ni aucune stratégie substitutive ne permet de progresser.
2. **L'échelle de substitution** — rechercher, décider, estimer, scénariser, conditionner,
   laisser inconnue. Une inconnue n'est non substituable que si **aucune** de ces six voies ne
   permet de progresser honnêtement.
3. **Le contrat de transport du tour** — `validateAnalystInput` n'accepte que `original_request`
   et `clarification_history`. Rien d'autre n'entre.
4. **Le contenu explicite de chaque fixture.**

### Ce que la source 3 impose, et qui n'avait jamais été relevé

**Le tour profond ne possède aucun canal de matériau.** La route `/decision` reçoit
`materiau_present` comme *fait fiable* et son prompt lui dit quoi en faire ; `/operational-request`
ne le reçoit pas. Le champ `materiau_present` du corpus appartient donc à un **autre contrat**.

Conséquence directe : pour OPRIE, les demandes qui présupposent un intrant — « résume **ce
texte** », « analyse **ce tableau CSV** », « à partir **du schéma fourni** » — ont cet intrant
**structurellement absent**, que le corpus les ait étiquetées « matériau présent » ou « matériau
absent ». Les deux étiquettes sont indistinguables du point de vue d'OPRIE.

C'est la raison pour laquelle le lot précédent a compté cinq « fausses clarifications » : son
oracle avait été écrit pour `/decision`, où le matériau est un champ d'entrée.

### `degraded_state` : absent par construction

Le contrat est explicite — *« Vous ne produisez jamais l'état `degraded_state` : il n'est déclaré
que par le système en cas de panne technique, jamais par un jugement de votre part. »* Il ne peut
donc jamais être une attente d'évaluation sémantique, et il n'apparaît nulle part dans cet
oracle. Une indisponibilité du plan rapide, un 429 Groq, l'absence de candidate rapide : rien de
cela n'est un état OPRIE.

---

## D. Couverture du corpus

Source : `evaluation/corpus-lot10g2a.json`, **30 cas, tous inclus**. Aucun cas n'a été créé.

| État attendu | Cas | Résolus | Non résolus |
| --- | --- | --- | --- |
| `operational_request_ready` | **8** | 8 | 0 |
| `clarification_required` | **18** | 18 | 0 |
| `confirmation_required` | **0** | 0 | 0 |
| `blocked` | **0** | 0 | 0 |
| *(non tranchés)* | **4** | — | 4 |
| **Total** | **30** | **26** | **4** |

### `CORPUS_COVERAGE_GAP = YES`

**`confirmation_required` : aucun cas.** Le contrat exige un candidat structurellement prêt
**et** un risque de dérive significatif — plusieurs ambiguïtés importantes résolues, un conflit
complexe arbitré, une restructuration lourde, une hiérarchisation d'objectifs, une délégation
importante, ou des conséquences sensibles. Le corpus, écrit pour le routage, ne contient aucun
cas construit pour déclencher cela.

**`blocked` : aucun cas.** Le contrat exige l'épuisement de toute question utile **et** de toute
stratégie substitutive. Aucune fixture n'est dans cette situation.

**Aucun cas n'a été fabriqué pour combler ce trou.** Le manque est constaté, comme demandé, avant
toute proposition.

---

## E. Schéma de l'oracle

```
case_id, request_summary, corpus_category,
oracle_status               resolved | unresolved
expected_oprie_state        l'un des quatre états, ou null si non résolu
rationale                   pourquoi cet état, ET pourquoi pas les trois autres
required_information_present  ce que la fixture fournit réellement
required_information_missing  ce qui manque, et pourquoi c'est matériel
confirmation_needed, blocking_reason, ready_reason
forbidden_behavior          les comportements clairement interdits sur ce cas
clarification_class         required | unnecessary | undetermined
confidence                  high | medium | low, justifiée qualitativement
requires_product_owner_decision
decision_pattern            le motif uniforme appliqué
```

**Trois motifs uniformes**, appliqués à tous les cas — aucune règle propre à un cas, aucun
domaine, aucun scénario codé en dur :

| Motif | Critère | État |
| --- | --- | --- |
| **AUTOPORTANT** | la demande nomme son objet, son livrable et sa forme | `operational_request_ready` |
| **MATERIAU_ABSENT** | la demande présuppose un intrant que le tour ne reçoit pas | `clarification_required` |
| **OBJET_INDETERMINE** | l'objet même du travail n'est pas déterminé | `clarification_required` |
| **LIVRABLE_INDETERMINE_OBJET_CONNU** | l'objet est déterminé, le livrable non | **non tranché** |

---

## F. Cas résolus — 26

**READY (8)** — R01 à R07, R14. Demandes autoportantes : livrable, format et quantité explicites.
R14 est classé `medium` plutôt que `high` : le service concerné n'est pas nommé, mais la demande
réclame explicitement des *scénarios* assortis de *conditions*, ce qui est exactement la
substitution que l'échelle autorise.

**CLARIFICATION (18)** — dont :
- **R08 à R13 et Q01 à Q06** (12) : intrant présupposé, absent du transport. `high`.
- **Q07, Q08** (2) : l'objet lui-même est désigné par un déictique sans référent — « ce
  contenu », « ça ». `high`.
- **A02, A03, A04, A08** (4) : l'objet du travail n'est pas déterminé — « mieux organiser mon
  entreprise », « améliorer ma communication », « créer quelque chose », « mieux exploiter mes
  données ». Scénariser exige un axe, et il n'y en a aucun ; décider reviendrait à arbitrer
  silencieusement. `medium` pour trois d'entre eux, `high` pour A04 dont l'objet est
  littéralement « quelque chose ».

---

## G. Cas non résolus — 4

**A01, A05, A06, A07** : *« Je veux préparer mon voyage en Italie »*, *« Je voudrais apprendre
Python »*, *« Je veux lancer une newsletter »*, *« Je veux repenser l'accueil des nouveaux
salariés »*.

Dans ces quatre cas, **l'objet est déterminé mais le livrable ne l'est pas**. Deux lectures
s'appuient chacune sur une clause réelle du contrat :

- l'échelle de substitution autorise à **scénariser** ou **conditionner** un livrable, ce qui
  rendrait le tour `operational_request_ready` ;
- le choix du livrable est un arbitrage qui appartient à l'utilisateur, et l'opérer en silence
  est nommément interdit — ce qui rendrait le tour `clarification_required`.

Aucune ne l'emporte sans une décision produit. Trancher ici reviendrait à fabriquer l'autorité
que ce lot a précisément pour objet de ne pas inventer.

`REQUIRES_PRODUCT_OWNER_DECISION = YES` — et c'est **une seule question**, pas quatre :

> Lorsque l'objet du travail est déterminé mais que le livrable ne l'est pas, OPRIE doit-il
> proposer un livrable scénarisé ou conditionnel, ou poser une question ?

---

## H. Les cinq cas du lot précédent

Ils ont été traités par la règle uniforme, sans consulter leur historique. Résultat :

| Cas | État de l'oracle | Ce que cela dit du verdict précédent |
| --- | --- | --- |
| **R08** | `clarification_required` | la clarification était **fondée** — intrant absent |
| **R09** | `clarification_required` | la clarification était **fondée** — intrant absent |
| **A01** | **non tranché** | ni fondée ni infondée : la question n'est pas décidée |
| **A02** | `clarification_required` | la clarification était **fondée** — objet indéterminé |
| **A03** | `clarification_required` | la clarification était **fondée** — objet indéterminé |

**Quatre des cinq « fausses clarifications » attribuées à Anthropic n'en étaient pas.** Elles
étaient conformes au contrat OPRIE ; c'est l'oracle utilisé alors — écrit pour `/decision`, où le
matériau est un champ d'entrée — qui ne l'était pas. Le cinquième cas reste ouvert.

Cette correction ne réhabilite pas Anthropic et ne le condamne pas : elle dit que la mesure
précédente était faite contre la mauvaise règle, et qu'il faut la refaire contre celle-ci.

---

## I. Garanties d'anti-codage en dur

L'oracle vit dans `evaluation/`. Il n'est importé par aucun code d'exécution, et aucun
comportement de production ne dépend d'un `case_id`, d'un état attendu ou d'un domaine du corpus.
Une preuve statique le vérifie sur le worker, le noyau partagé, l'artefact canonique et le
générateur de runtime.

```
USER_COUNT_HARDCODING_COUNT        = 0
DOMAIN_HARDCODING_COUNT            = 0
SCENARIO_HARDCODING_COUNT          = 0
CASE_ID_RUNTIME_LOGIC_COUNT        = 0
PROVIDER_SPECIFIC_ORACLE_RULE_COUNT = 0
```

Les motifs de décision ne nomment aucun domaine : ils portent sur la présence d'un intrant, la
détermination de l'objet et celle du livrable — des propriétés de forme, jamais de sujet.

---

## J. Limites

1. **Deux états ne sont couverts par aucun cas** — `confirmation_required` et `blocked`. Tant que
   le corpus ne les couvre pas, un fournisseur ne peut être évalué sur eux.
2. **Quatre cas restent non tranchés**, faute d'une décision produit.
3. **La confiance `medium` des quatre cas OBJET_INDETERMINE** reflète un jugement réel : la
   frontière entre « objet indéterminé » et « livrable indéterminé » est nette sur A04, moins sur
   A02 et A03.
4. **L'oracle porte sur l'état, pas sur le contenu.** Il ne dit rien de la qualité de la question
   posée, du candidat produit ou des issues relevées — seulement de la décision gouvernée.
5. **Un seul auteur.** Aucune revue indépendante n'a confirmé ces 26 résolutions.

---

## K. Action suivante

`OPRIE-QUALITY-PARITY-02` — rejouer l'évaluation **contre cet oracle**, et non plus contre un
fournisseur. Anthropic épinglé d'abord, puisque c'est le seul qui produise assez de décisions ;
Groq à titre informatif, en sachant qu'il n'en produira que quelques-unes.

Deux choses doivent y être refaites plutôt que reprises : le décompte des sur-questionnements,
qui reposait sur la mauvaise règle, et l'évaluation des états `confirmation_required` et
`blocked`, qui n'a jamais eu lieu faute de cas.
