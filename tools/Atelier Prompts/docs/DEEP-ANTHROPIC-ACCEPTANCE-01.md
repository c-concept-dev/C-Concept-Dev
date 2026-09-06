# DEEP-ANTHROPIC-ACCEPTANCE-01 — Qualifier Anthropic sur la chaîne enfin complète

Sept lots ont refermé la chaîne matériau : transport, contexte, contenu, provenance, champ de
disponibilité, livraison au Critique, livraison à l'Arbitre. Ce lot ne corrige rien. Il mesure ce
que le système fait, maintenant qu'il est entier.

**Aucune modification pendant la campagne** : ni code, ni prompt, ni schéma, ni modèle, ni
paramètre.

---

## A. Point de départ

| | |
| --- | --- |
| Checkpoint mesuré | `2a27fb07f6fe3ed8a439b0ccf99b81548d6e4fd1` |
| Empreinte de l'artefact | `4ade8759…` |
| Fournisseur | Anthropic **seul** — épinglé, aucun repli, Groq exclu (§38) |
| Modèle | `claude-sonnet-4-6`, `temperature: 0` |
| Cadence | 12 s entre deux tours |
| Tours exécutés | **68** — 30 synthétiques, 12 contrôles, 26 cas d'oracle |

---

## B. Le 53,3 % historique n'était plus vrai

Le §5 interdisait de réutiliser l'ancien taux comme vérité. Il a été remesuré, et il a changé :

| | avant la chaîne complète | **maintenant** |
| --- | --- | --- |
| Prise en compte du matériau | 16 / 30 = **53,3 %** | **30 / 30 = 100 %** |

**Définition employée**, imposée par le §10 : depuis `available_inputs`, la valeur n'a plus à être
recopiée dans le candidat — l'y chercher mesurerait l'inverse de ce que le contrat demande. La
preuve de prise en compte retenue est donc : provenance `user_provided_material` émise,
`available_inputs` pertinent, et aucune affirmation d'absence de matériau. Les trente tours la
satisfont.

**La valeur n'est recopiée dans le candidat dans aucun des trente tours** — le contrat de phase
tient.

---

## C. Phase 1 — cas synthétique matériau, trente tours

| | |
| --- | --- |
| `operational_request_ready` | **30 / 30** |
| `blocked` | 0 |
| `clarification_required` | 0 |
| Faux READY | **0** — les trente déclarent la disponibilité de l'intrant |
| Dégradations techniques | 0 |
| `user_provided_material` émis | 30 / 30 |
| Valeur recopiée dans `expected_deliverable` | **0 / 30** |
| Latence p50 | 20,7 s |

---

## D, E. Contrôles

| Contrôle | Attendu | Obtenu |
| --- | --- | --- |
| Matériau **absent** (`present:false`) | pas de provenance matériau, pas de valeur inventée | 3/3 `clarification_required`, **0** valeur inventée, **0** provenance matériau — PASS |
| Matériau **présent, contenu non transmis** | ne pas prétendre l'avoir lu | 3/3 `clarification_required`, **0** valeur inventée, **0** provenance matériau — PASS |
| Fait dans `original_request` | `explicit_user_statement`, pas `user_provided_material` | 3/3 sans provenance matériau — PASS |

Sur les douze tours de contrôle, `user_provided_material` n'est **jamais** émis. Le système ne
revendique le matériau que lorsqu'il l'a.

**Un contrôle a d'abord échoué par ma faute, pas par celle du système.** La fixture
`clarification_answer` omettait la clé `turn`, requise par le contrat
(`{turn, question, answer, provenance}`, `turn === index + 1`) : le transport l'a refusée en 400.
La garde avait raison ; la fixture a été corrigée et le contrôle rejoué.

Le contrôle rejoué : **3 tours valides sur 3** portent la valeur issue de `clarification_history`,
sans provenance matériau. Un quatrième tour a rendu 502 — panne technique, comptée comme telle.

---

## F. R08–R13, et une découverte sur l'oracle

| Fixture | Attendu par l'oracle | Obtenu | Lecture |
| --- | --- | --- | --- |
| R08 | `clarification_required` | `operational_request_ready` | **oracle périmé** |
| R09 | `clarification_required` | `degraded_state` | technique |
| R10 | `clarification_required` | `operational_request_ready` | **oracle périmé** |
| R11 | `clarification_required` | `degraded_state` | technique |
| R12 | `clarification_required` | `degraded_state` | technique |
| R13 | `clarification_required` | `operational_request_ready` | **oracle périmé** |

**L'oracle dit lui-même pourquoi son attente ne tient plus.** Le rationale de R08, R10 et R13 est
explicite :

> *« clarification_required parce que la demande présuppose un intrant distinct […] **que le tour
> ne reçoit pas : le contrat de transport d'OPRIE ne porte que original_request** […] »*

L'attente était **conditionnée à l'absence de canal matériau**. Ce canal existe depuis
`OPRIE-MATERIAL-CONTENT-02`, et le matériau est désormais transmis. `operational_request_ready`
est donc le comportement **correct**, et c'est l'oracle qui est dépassé — par construction, sur les
cas où le matériau est fourni.

**L'oracle n'a pas été modifié.** Le lot qui l'a produit interdit de le retoucher pour faire passer
une campagne ; la supersession est documentée, la référence reste intacte.

---

## G, H. Oracle — 26 cas résolus

| | |
| --- | --- |
| Concordance directe | **18 / 26** |
| Périmés par le canal matériau (R08, R10, R13) | 3 |
| Dégradations techniques (A03, R09, R11, R12) | 4 |
| Divergence sémantique réelle | **1 — R05** |
| Cas *owner-pending* (A01, A05, A06, A07) | non scorés, conformément au §22 |

**Concordance sur les cas réellement évaluables : 18 / 19 = 94,7 %** — 26 résolus, moins 4
techniques, moins 3 périmés.

---

## I. La seule divergence sémantique : R05

Attendu `operational_request_ready`, obtenu `clarification_required`. L'oracle indique
`required_information_missing: []`.

La question posée :

> *« L'atelier est-il destiné aux nouveaux salariés eux-mêmes, aux personnes chargées de les
> accueillir (managers, référents RH), ou à un groupe mixte ? »*

Pour un ordre du jour d'atelier sur *« l'accueil des nouveaux salariés »*, l'audience change
réellement le livrable. **Ce n'est pas manifestement une fausse clarification** : c'est une
ambiguïté défendable que l'oracle n'avait pas anticipée. Elle est comptée comme divergence — je ne
la requalifie pas en défaut, et je ne la fais pas disparaître en retouchant l'oracle. **Décision
propriétaire.**

---

## J. Défaillances techniques

| | |
| --- | --- |
| `degraded_state` | **4 / 68 = 5,9 %** |
| HTTP non-200 | 3 (dont un 502 sur un contrôle) |
| Classe observée | `technical_failover` — échec de transport côté fournisseur |
| Limite de sortie, timeout, schéma, quota | **0 observé** |

**Ces quatre échecs sont un artefact du protocole de mesure, pas du produit.** L'épinglage exigé
par le §3 supprime tout repli : une seule défaillance Anthropic épuise la chaîne. En production, la
chaîne HA rattraperait ces cas. Le taux réel de dégradation en production n'est pas mesuré ici et
ne doit pas être déduit de ce chiffre.

---

## K. Faux READY / blocked / clarification

| | |
| --- | --- |
| `FALSE_READY` | **0** — les 30 READY synthétiques déclarent tous la disponibilité |
| `FALSE_BLOCKED` | **0** |
| `FALSE_CLARIFICATION` | **0 avéré** — R05 est une divergence défendable, soumise au propriétaire |
| `FALSE_CONFIRMATION` | **non mesurable** |

**Couverture réelle, dite franchement :** l'oracle ne contient **aucun cas `confirmation_required`
résolu** — 18 `clarification_required` et 8 `operational_request_ready`. Cet état n'est donc pas
qualifié par ce lot. Conformément au §25, aucun chantier d'oracle n'a été ouvert pour le combler.

---

## L. Latence et jetons observés

| | |
| --- | --- |
| Latence Deep p50 | **26,9 s** |
| Latence Deep p95 | **96,2 s** |
| Jetons d'entrée Analyste, p50 | **5 573** |
| Jetons d'entrée Analyste, p95 | 5 573 (min 5 516, 8 valeurs distinctes, n = 45) |

Relevé pour information, conformément au §35 : **aucune qualification de capacité n'en est tirée**,
et le SLA du plan rapide n'est pas rouvert.

---

## M. Classement d'acceptation

**`ACCEPTED_WITH_NON_BLOCKING_ISSUES`.**

Ce que la campagne établit :

1. **La prise en compte du matériau est passée de 53,3 % à 100 %** sur trente tours identiques —
   le chiffre historique était bien périmé, comme le §5 le soupçonnait.
2. **Zéro faux READY, zéro faux blocked, zéro fausse clarification avérée.**
3. **Les contrôles négatifs tiennent** : douze tours sans matériau disponible, et pas une seule
   revendication de matériau, pas une seule valeur inventée.
4. **La séparation des phases tient** : la valeur-résultat n'est recopiée dans `expected_deliverable`
   dans aucun des trente tours.
5. **Concordance de 18/19 sur les cas d'oracle réellement évaluables.**

Ce qui n'est pas bloquant :

- **R05** — une clarification défendable que l'oracle n'attendait pas ; décision propriétaire.
- **`confirmation_required` non qualifié** — l'oracle n'en contient aucun cas résolu.
- **4 dégradations techniques sur 68**, artefact de l'épinglage sans repli exigé par le protocole.

Aucun de ces trois points n'empêche Anthropic de servir le plan profond conformément au CDC.

---

## N. Défauts bloquants

**Aucun.**

Le filtre du §32 a été appliqué à chaque anomalie : aucune n'empêche Anthropic Deep de respecter le
contrat. Conformément au §33, aucun micro-lot n'est proposé pour les traiter — elles vont au
backlog.

---

## O. Prochaine action sûre

**`ANTHROPIC-DEEP-CAPACITY-01`**, comme le prévoit la porte finale.

Ce lot livre deux entrées utiles à ce prochain, et **rien de plus** : latence Deep p50 26,9 s /
p95 96,2 s, et entrée Analyste ~5 573 jetons au p50. Le prompt a grossi au fil des sept lots
(≈ 4 537 → 5 573 jetons), ce qui pèsera sur le calcul de capacité — c'est un fait relevé, pas une
qualification.

**Backlog non bloquant**, à ne pas transformer en série de micro-lots :

1. R05 — trancher si la clarification d'audience est légitime ; décision propriétaire.
2. Couverture `confirmation_required` de l'oracle — absente aujourd'hui.
3. Les trois attentes d'oracle périmées par le canal matériau (R08, R10, R13) — à mettre à jour le
   jour où l'oracle sera révisé, jamais pour faire passer une campagne.
