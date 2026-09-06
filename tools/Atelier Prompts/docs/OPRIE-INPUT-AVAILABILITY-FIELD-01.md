# OPRIE-INPUT-AVAILABILITY-FIELD-01 — Dire qu'un intrant est là, sans le recopier

Le candidat savait dire ce qu'il ignore, ce qu'il suppose, ce qu'il faut aller chercher. Il ne
savait pas dire l'inverse : **« cet intrant est nécessaire, et il est là »**.

Faute de cet emplacement, la disponibilité s'enregistrait par effet de bord — la valeur recopiée
dans `expected_deliverable` — ce que le Critique sanctionnait à raison. Et l'interdire sans fournir
le canal a fait passer `blocked` de 10/30 à 23/30 : l'information disparaissait au lieu de changer
de place.

---

## A. Le gap, confirmé

| Question | Réponse |
| --- | --- |
| Un champ existant convient-il ? | **NON** — les dix audités, aucun n'exprime « requis ET disponible » |
| La provenance seule suffit-elle ? | **NON** — prouvé par le validateur |
| Un nouveau champ est-il nécessaire ? | **OUI**, un seul |

**Les dix champs, audités un par un :**

| Champ | Ce qu'il porte | Peut porter la disponibilité ? |
| --- | --- | --- |
| `objective` | l'intention | non |
| `expected_deliverable` | la forme du résultat | non — défini par le lot précédent pour l'exclure |
| `secondary_objectives` | d'autres buts | non |
| `confirmed_constraints` | une exigence **sur le résultat** | non |
| `confirmed_priorities` | des priorités relatives | non |
| `confirmed_preferences` | des préférences souples | non |
| `delegated_decisions` | ce qui est délégué à l'IA | non |
| `external_facts_to_research` | ce qu'il faut aller chercher — **le contraire** | non |
| `assumptions_allowed` | des hypothèses | non |
| `remaining_unknowns` | ce qui reste inconnu — **le contraire** | non |

**Et la provenance seule ne peut pas non plus.** `validateProvenanceRecord` exige un `field`
appartenant à `CANDIDATE_FIELDS` **et** une `value` non vide : un enregistrement de provenance est
une annotation de lignage **sur une valeur du candidat**, il ne peut pas exister seul. Provenance =
origine d'un fait ; disponibilité = état d'un intrant. Les deux notions ne se recouvrent pas.

---

## B. Le champ

**`available_inputs`**, tableau de chaînes.

> *Intrant que l'Analyste juge nécessaire à l'exécution et dont la disponibilité est établie à ce
> tour. Décrit l'intrant — ce dont l'exécution aura besoin — jamais son contenu, jamais le résultat
> qu'il permettra de produire. Disponible ne signifie ni suffisant, ni correct, ni pertinent, et ne
> rend jamais une demande prête.*

Le nom suit la famille des champs de liste (`<qualificatif>_<nom pluriel>`) et n'encode ni format,
ni domaine, ni fournisseur, ni MIME, ni nom de fichier. Il ne porte **pas** le préfixe `confirmed_`,
réservé à ce que la personne confirme : la disponibilité, elle, est établie par le système.

---

## C. Optionnel côté validateur, exigé côté modèle

C'est la décision de conception du lot, et elle a été forcée par une mesure.

Le schéma du candidat a `required` **égal à** `properties`. Ajouter un champ invalidait donc d'un
coup **tout candidat écrit avant ce lot** : le rejeu manuel Architecte est parti en échec, et le
fichier de test a mis 38 secondes à rendre la main — assez, en parallèle, pour faire dépasser dix
minutes à la suite complète.

| | |
| --- | --- |
| Schéma JSON envoyé au fournisseur | `available_inputs` **requis** — pour que le modèle s'en serve |
| `normalizeCandidate` | **toléré absent**, vaut alors `[]` |
| Les dix autres champs | **strictement requis**, `exactKeys` inchangé |

On nomme une exception ; on n'ouvre pas le contrat.

---

## D. Propagation automatique

Une seule édition dans `CANDIDATE_LIST_FIELDS` propage à tout ce qui dérive de la liste :

| Consommateur | Effet |
| --- | --- |
| Schéma JSON du candidat | `required` et `properties` — automatique |
| `enum` du champ de provenance | automatique — une disponibilité se trace comme tout élément |
| `createEmptyCandidate` | automatique |
| `validateOperationalRequestCandidate` | automatique |
| `assessProvenance` / `diffCandidates` | automatique |

**Aucune règle spéciale n'a été écrite pour le Critique ni pour l'Arbitre.** Une valeur
d'`available_inputs` porte une provenance comme les autres ; leur règle d'ancrage à trois sources
la couvre déjà. Le Critique ne reçoit toujours aucun contenu brut, l'Arbitre non plus.

---

## E. L'Analyste, enfin muni d'une destination

Le lot précédent avait dû retirer la règle de phase : elle disait *« il n'a sa place dans aucun
champ »* sans dire où consigner, et l'Analyste effaçait la trace du matériau. La règle revient,
avec sa destination :

> *« S'il EST le résultat demandé, ne le recopiez nulle part : consignez dans available_inputs
> l'INTRANT dont l'exécution aura besoin et dont vous constatez la disponibilité, DÉCRIT et jamais
> recopié — « le numéro de dossier, présent dans le matériau transmis », jamais sa valeur — avec sa
> provenance. available_inputs n'est ni une readiness, ni une garantie […] et laisser ce champ vide
> reste parfaitement valide. »*

---

## F. Rejeu de trente tours

Même cas, même modèle, `temperature: 0`, Anthropic (29/30 tours entièrement Anthropic), zéro bruit
technique.

| | référence | correctif seul (lot précédent) | **avec `available_inputs`** |
| --- | --- | --- | --- |
| `blocked` | 10 / 30 | 23 / 30 | **16 / 30** |
| `operational_request_ready` | 11 / 30 | 5 / 30 | **13 / 30** |
| Vetos de phase | 4 / 16 | 0 | **0** |
| `user_provided_material` émis | 16 / 30 | 0 / 30 | **30 / 30** |
| Valeur recopiée dans le candidat | 8 / 30 | 0 / 30 | **1 / 30** |
| `available_inputs` renseigné | — | — | **29 / 30** |
| Dégradations techniques | 1 | 1 | **0** |

**Le besoin de recopier la valeur a disparu** — 8/30 → 1/30 — **sans que la trace du matériau
disparaisse avec lui** : la provenance matérielle passe de 16/30 à **30 sur 30**. Le champ n'a pas
seulement déplacé l'information ; il a rendu la manipulation du matériau cohérente pour le modèle,
qui la déclare désormais à chaque tour.

Les quatre vetos de phase sont éteints, et aucun n'est réapparu.

---

## G. Ce qui bloque encore, et ce n'est plus le champ

Seize tours restent `blocked`, au-dessus de la référence de dix. L'Arbitre nomme lui-même la cause,
et elle est identique sur les seize :

> *« L'Analyste et le Critique **s'accordent** sur la structure de la demande, mais le matériau
> censé contenir le numéro de dossier est absent du contexte transmis. **Le champ available_inputs
> mentionne** "le numéro de dossier, présent dans le matériau transmis", **or aucun matériau n'a
> été effectivement fourni** »*

Trois faits, dans cet ordre :

1. **l'Analyste renseigne correctement `available_inputs`** — 29/30 ;
2. **le Critique accepte** — plus aucun veto de phase, plus aucun veto d'absence de sa part ;
3. **l'Arbitre écarte l'affirmation**, parce qu'il ne reçoit **pas** `material_context` et ne peut
   donc pas la vérifier.

C'est la cécité de l'Arbitre, identifiée à `OPRIE-MATERIAL-INTERPRETATION-01` et délibérément
laissée intacte depuis. Elle était masquée tant que la valeur était recopiée dans le candidat ; elle
devient le seul obstacle restant dès que le candidat cesse de la recopier.

**Le §15 de ce lot demande de ne pas modifier l'Arbitre sans nécessité démontrée.** La nécessité est
désormais démontrée — mais la corriger consiste à lui livrer `material_context`, exactement ce que
`OPRIE-CRITIC-MATERIAL-CONTEXT-DELIVERY-01` a fait pour le Critique. C'est un lot de livraison, pas
celui-ci.

---

## H. Faux READY

Treize tours atteignent `READY`. **Douze** déclarent la disponibilité de l'intrant et portent la
provenance matérielle : ils sont fondés. **Un** ne déclare pas `available_inputs` — c'est un faux
READY, du même type que le run 22, et il est compté comme tel.

`FALSE_READY_REGRESSION_COUNT = 1`, contre 1 également à la référence : le taux n'augmente pas.

---

## I. Jugement du run 22

**`FALSE_READY`.**

Le run 22 avait atteint `READY` sans que la valeur figure nulle part — la forme que la définition
recommande — **mais sans rien déclarer non plus**. Le contrat est désormais complet : ne pas
recopier le résultat est correct, et il faut alors consigner la disponibilité de l'intrant dans
`available_inputs`. Un candidat qui ne fait ni l'un ni l'autre n'établit pas que la demande est
exécutable. Le run 22 est donc un faux READY, et il est aujourd'hui tranchable — ce qu'il n'était
pas au lot précédent.

---

## J. Verdict

**PARTIAL.**

Le gap structurel est confirmé, audité champ par champ, et comblé par **un seul** champ générique,
optionnel et rétrocompatible. `expected_deliverable` est préservé, la valeur-résultat n'y est plus
recopiée, la disponibilité est représentée sans aucun contenu brut, aucune nouvelle autorité n'est
créée, et ni le Critique ni l'Arbitre n'ont reçu de règle spéciale. La régression de 23/30 est
ramenée à 16/30 et la provenance matérielle atteint 30/30.

Ce qui empêche le PASS est nommé et mesuré : `blocked` reste à 16/30 contre 10/30 à la référence,
et les seize tours ont une seule et même cause, extérieure à ce lot — l'Arbitre ne peut pas
vérifier une disponibilité qu'il ne voit pas.

---

## K. Prochaine action sûre

**`OPRIE-ARBITER-MATERIAL-CONTEXT-DELIVERY-01`**, strictement calqué sur le lot qui a fait la même
chose pour le Critique :

1. **Livrer `material_context` à l'Arbitre** — les deux booléens de disponibilité, **aucun contenu
   brut**, aucune règle nouvelle. Sa question n'est pas de lire le matériau, c'est de savoir si
   l'affirmation de l'Analyste est vérifiable.
2. **Vérifier le chemin réellement emprunté**, comme l'a appris `CMCD-01` : un test vert sur un
   constructeur que la production n'utilise pas ne prouve rien.
3. **Rejouer les trente tours** : `blocked` doit revenir vers la référence sans que les vetos de
   phase réapparaissent et sans faux READY supplémentaire.

Ensuite seulement, `OPRIE-MATERIAL-READING-CONFORMANCE-01` — la lecture de l'Analyste, et la
question restée ouverte de sa dépendance au fournisseur.
