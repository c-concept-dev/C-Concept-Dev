# OPRIE-EXPECTED-DELIVERABLE-SEMANTICS-01 — Le candidat prépare, il n'exécute pas

Quatre vetos sur seize reprochaient à l'Analyste d'inscrire la valeur extraite d'un matériau dans
`expected_deliverable` : *« confond la phase de préparation et la phase d'exécution »*. Personne ne
pouvait trancher, parce que le champ n'était défini nulle part.

L'usage, lui, n'avait jamais varié.

---

## A. État du champ

| | |
| --- | --- |
| Déclaré dans | `CANDIDATE_SCALAR_FIELDS`, `core/adn/operational-request-state.js` |
| Type | `{"type":"string"}` |
| Description dans le schéma JSON | **aucune** — et aucun des dix champs du candidat n'en porte |
| Référence | « CDC §5.3 » en commentaire — **aucun fichier CDC dans le dépôt** |
| Mention dans le prompt Analyste | le nom du champ n'apparaissait pas |
| Mention dans les prompts Critique | le nom du champ n'apparaît pas |

**`EXPECTED_DELIVERABLE_WRITTEN_DEFINITION_FOUND = NO`.** Troisième fois que ce motif apparaît dans
ce programme, après le vocabulaire de provenance et la règle d'ancrage : le nom existe, le sens
n'existe pas.

---

## B. Schéma

Aucun changement de structure n'a été nécessaire. Les dix champs, leurs types et leur ordre sont
inchangés ; `expected_deliverable` reste une chaîne. **Définir n'est pas contraindre la forme
technique.**

---

## C. Usage historique — la définition existait, dans les faits

Toutes les valeurs présentes dans les fixtures du dépôt :

| Valeur historique | Classement |
| --- | --- |
| « Compte rendu structuré en trois sections : décisions, actions, points en suspens. » | forme + structure |
| « Liste de 10 conseils. » | forme + paramètre structurel |
| « Document d'une page avec les trois indicateurs clés. » | forme + volume |
| « Plan de voyage détaillé (itinéraire, hébergement, transport, budget) » | forme + structure |
| « Un message court de suivi client. » | forme |
| « Compte rendu structuré. » | forme |

**Aucune ne contient un fait, une valeur ou un contenu.** Des paramètres structurels apparaissent —
trois sections, une page, dix éléments — jamais le contenu lui-même.

`HISTORICAL_USAGE_CLASSIFICATION` = **forme et structure, exclusivement**.

---

## D, E, F, G. Consommateurs

| Rôle | Ce qu'il fait de `expected_deliverable` |
| --- | --- |
| **Analyste** | l'écrit ; y a inscrit `ZX-4821` dans 11 des 16 tours conformes mesurés |
| **Critique** | aucune règle nommant le champ ; dérive son objection de sa propre règle de rôle, *« Vous ne rédigez jamais le livrable »* |
| **Arbitre** | ne le nomme pas ; retient le veto du Critique |
| **`assessProvenance`** | apparie `field` + `value`, sans lire la sémantique du champ |

Les champs voisins, eux, ont un usage net : `objective` = l'intention (« Rédiger 10 conseils
génériques pour bien dormir. »), `confirmed_constraints` = une exigence sur le résultat (« Ton
formel obligatoire. »).

---

## G. Sémantique de phase

Le candidat est un artefact **préparatoire**. Y écrire `ZX-4821` pour une demande d'extraction,
c'est produire le livrable pendant la préparation — puisque, pour cette demande, la valeur **est**
le livrable.

**Le veto du Critique était donc contractuellement valide.** Il appliquait une règle qui existe,
à un champ dont l'usage constant lui donnait raison.

---

## H. Définition normative

Écrite dans `CANDIDATE_FIELD_DEFINITIONS`, à côté du contrat de champs :

```
objective
  Ce que la demande vise à obtenir, formulé comme une intention.
  Jamais le résultat lui-même.

expected_deliverable
  La forme du résultat attendu et ses caractéristiques structurelles — nature, structure,
  volume, sections. Jamais le contenu final, jamais une valeur qui constituerait à elle seule
  le résultat demandé.
```

Deux champs seulement : ceux que ce lot a dû trancher. Les huit autres restent définis par leurs
usages, inchangés.

---

## I. Où vit un fait matériau

**La ligne de partage n'est pas « fait ou pas fait », c'est le rôle du fait.**

| Le fait… | Sa place |
| --- | --- |
| **spécifie** la demande — une contrainte, un paramètre que le résultat doit respecter | dans le candidat (`objective`, `confirmed_constraints`), **avec sa provenance** `user_provided_material` |
| **est** le résultat demandé | **aucun champ** — le candidat constate que le matériau est disponible, l'exécution produit le contenu |

`NEW_FIELD_REQUIRED = NO`. Les champs existants couvrent le cas « spécifie » ; le cas « est le
résultat » n'a besoin d'aucun champ.

`user_provided_material` reste entièrement valide et garde son emploi : il trace précisément les
faits du premier type.

---

## J. Le correctif

**Une phrase, dans le seul prompt de l'Analyste**, ajoutée à MISSION 1 :

> *« Le candidat PRÉPARE la demande, il ne l'exécute pas : expected_deliverable décrit la FORME du
> résultat attendu et ses caractéristiques structurelles — nature, structure, volume, sections — et
> jamais le contenu final ni une valeur qui constituerait à elle seule le résultat demandé ;
> objective énonce l'intention, jamais le résultat. Un fait que vous lisez dans le matériau n'entre
> donc dans le candidat QUE s'il SPÉCIFIE la demande — une contrainte, un paramètre que le résultat
> doit respecter — et il y entre alors avec sa provenance. S'il EST le résultat demandé, il n'a sa
> place dans aucun champ : constatez qu'il est disponible, et laissez l'exécution le produire. »*

Plus la définition normative en contrat. **Aucun changement du Critique, de l'Arbitre, du schéma,
de la provenance, de `material_context`, du transport, du plan rapide ou du routage.**

---

## K. Le correctif a été mesuré, et il régresse

Trente tours, même cas, même modèle, `temperature: 0`, seul le correctif diffère.

| | avant | avec le correctif |
| --- | --- | --- |
| Vetos de phase | **4 / 16** | **0** |
| `user_provided_material` émis | 16 / 30 | **0 / 30** |
| Valeur présente dans la réponse | 16 / 30 | **0 / 30** |
| `operational_request_ready` | 11 / 30 | **5 / 30** |
| `blocked` | 10 / 30 | **23 / 30** |

**L'objection de phase disparaît — mais parce que la valeur disparaît.** Ce n'est pas le placement
qui s'est amélioré : c'est la trace du matériau qui s'est effacée.

Le mécanisme est lisible dans les vingt-neuf tours journalisés : tous ne déclarent plus que
`explicit_user_statement`. L'Analyste a retenu la première moitié de la consigne — *« il n'a sa
place dans aucun champ »* — et abandonné la seconde — *« constatez qu'il est disponible »*. Plus
rien, dans sa sortie, n'enregistre que le matériau a été lu. L'Arbitre conclut alors, à raison au
regard de ce qu'il voit : *« le matériau censé contenir le numéro de dossier est absent de
l'entrée »*.

C'est exactement le mode d'échec des deux lots précédents, recréé par l'autre bout.

---

## L. La cause n'est pas la phrase, c'est un trou de contrat

La définition est juste : l'usage historique est unanime, et le veto de phase du Critique est
fondé. Mais l'appliquer suppose que l'Analyste puisse consigner quelque part :

> « l'intrant requis existe, il est disponible, et je ne le recopie pas »

**Aucun des dix champs du candidat ne porte cela.**

| Champ | Ce qu'il porte |
| --- | --- |
| `remaining_unknowns` | les inconnues — or l'intrant n'est pas inconnu |
| `assumptions_allowed` | les hypothèses — or ce n'est pas une hypothèse |
| `confirmed_constraints` | les exigences sur le résultat — or ce n'est pas une exigence |
| `external_facts_to_research` | ce qu'il faut aller chercher — or il est déjà là |

Le seul mécanisme qui enregistrait la disponibilité était **un effet de bord** : la valeur inscrite
dans `expected_deliverable` avec la provenance `user_provided_material`. En interdisant l'effet de
bord sans fournir le canal propre, on perd l'information.

**`ROOT_CAUSE = FIELD_CONTRACT_MISSING`.** Le §29 et le §61 prévoient ce cas : STOP, ne pas créer
de champ sans décision dédiée.

---

## M. Ce qui a été gardé, ce qui a été retiré

| | |
| --- | --- |
| Définition normative de `objective` et `expected_deliverable` | **gardée** — établie par l'usage unanime, ne change aucun comportement |
| Amendement du prompt Analyste | **retiré** — mesuré, régressif |
| Critique, Arbitre, schéma, provenance, `material_context`, transport, plan rapide, routage | **inchangés** |

Production redéployée dans l'état exactement mesuré par le lot précédent.

**La preuve du retour en arrière est au niveau du code, pas de la mesure.** Le texte du prompt est
byte-identique à celui qui avait été mesuré — une assertion du jeu de tests le vérifie sur la source
même qui est empaquetée et déployée — et le seul autre écart est une constante exportée que
personne ne lit.

Une vérification de huit tours a bien été lancée après redéploiement, et elle rend 8 READY sur 8 ;
**elle n'est pas comparable** et n'est pas présentée comme telle : l'épinglage ayant été retiré
avant ce déploiement, ces huit tours ont été servis par la chaîne HA, avec l'Analyste et le
Critique sur **Groq**, alors que la référence de 11/30 était épinglée sur Anthropic.

Elle laisse au passage une observation qui n'appartient pas à ce lot mais mérite d'être notée :
sur ces huit tours, Groq a émis `user_provided_material` **8 fois sur 8**, là où Anthropic
l'émettait 16 fois sur 30. La conformité de lecture pourrait dépendre du fournisseur — question à
traiter par `OPRIE-MATERIAL-READING-CONFORMANCE-01`, pas ici.

---

## N. Jugement du run 22

**`INDETERMINATE`, et la mesure explique pourquoi.**

Le run 22 avait atteint `READY` sans que la valeur figure nulle part — la forme même que la
définition normative recommande. Sous le correctif, cette forme est devenue majoritaire… et elle
produit `blocked` 23 fois sur 30, parce que rien n'enregistre plus la disponibilité du matériau.

Le run 22 n'est donc ni un faux READY ni un READY valide : c'est la **bonne forme de candidat privée
du signal qui la rend défendable**. Le trancher exige le canal de disponibilité manquant.

---

## O. Verdict

**BLOCKED.**

L'audit est complet : le champ n'avait aucune définition écrite, l'usage historique est unanime, le
veto de phase du Critique est contractuellement fondé, et l'Analyste écrivait bien au mauvais
endroit. La définition normative est écrite et conservée.

Ce qui bloque est un manque, pas une incertitude : il n'existe aucun champ où consigner qu'un
intrant requis est disponible sans le recopier. Créer ce champ est une décision de contrat, et le
§61 la place hors de ce lot.

---

## P. Prochaine action sûre

Un lot de contrat dédié, `OPRIE-INPUT-AVAILABILITY-FIELD-01`, à autoriser explicitement puisqu'il
touche la structure du candidat :

1. **Décider comment le candidat consigne qu'un intrant requis est disponible sans le recopier.**
   Trois options à peser, pas une à présumer : un champ de liste nouveau ; l'élargissement documenté
   d'un champ existant ; ou un enregistrement de provenance sans valeur copiée — la provenance
   existe déjà et sait nommer l'origine.
2. **Puis seulement, réappliquer la définition normative** au prompt de l'Analyste, avec le canal
   disponible, et rejouer les trente tours : les quatre vetos de phase doivent disparaître **sans**
   que `blocked` augmente.
3. **Rejuger le run 22** à ce moment-là : il deviendra tranchable.

`OPRIE-MATERIAL-READING-CONFORMANCE-01` — les 53,3 % de lecture — reste derrière tout cela.
