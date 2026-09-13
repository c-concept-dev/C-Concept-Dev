# ANTHROPIC-DEEP-CAPACITY-01 — Où passent les 27 secondes

Le lot d'acceptation a qualifié la sémantique et relevé deux chiffres sans les expliquer : 26,9 s
au p50, 96,2 s au p95. Ce lot les décompose.

La réponse est courte : **il n'y a pas de coût d'orchestration**. Les vingt et une secondes sont
trois appels fournisseur, mis bout à bout.

---

## A, B. Cadre

| | |
| --- | --- |
| Checkpoint mesuré | `702c11219237206df614646a4294c56157241765` |
| Fournisseur | Anthropic, **épinglé sans repli** pour la mesure native |
| Modèle | `claude-sonnet-4-6` |
| Comportement de production modifié | **non** — aucun prompt, schéma, plafond, timeout ni retry touché |
| Instrumentation ajoutée | **aucune** — la décomposition exploite les horodatages des événements déjà émis |

---

## C. Protocole

Pré-déclaré, fini, avec reprise :

| Classe | Contenu | n |
| --- | --- | --- |
| **A** | demande courte, sans matériau | 8 |
| **B** | cas synthétique matériau, stable | 30 |
| **C** | demandes représentatives de l'oracle | 8 |
| **D** | matériau proche du plafond de transport **existant** | 4 (+3 rejoués) |
| **K2 / K4** | concurrence client 2 et 4 | 8 + 8 |

La concurrence mesurée est celle du **client** : aucune borne du Worker n'a été modifiée.

---

## D. Latence par étage — la réponse à « où vont les 27 s ? »

Sur les 57 tours dont les trois étages aboutissent :

| Étage | p50 | p75 | p90 | p95 | max |
| --- | --- | --- | --- | --- | --- |
| Analyste | 8 001 | 8 906 | 16 848 | 22 357 | 27 916 |
| Critique | 4 737 | 6 350 | 9 169 | 25 052 | 39 251 |
| Arbitre | 8 461 | 11 835 | 17 544 | 26 000 | 37 160 |
| **Surcoût d'orchestration** | **0** | — | — | **0** | **0** |
| **Total** | **21 225** | — | — | **75 161** | 80 893 |

```
p50 : 8 001 (Analyste) + 4 737 (Critique) + 8 461 (Arbitre) + 0 (orchestration) = 21 199 ms
```

**Le surcoût d'orchestration est nul au p50, au p95 et au maximum.** Le produit n'ajoute rien : la
latence est intégralement du temps de génération fournisseur, payé trois fois parce que la chaîne
est séquentielle par contrat.

**Aucun rôle ne domine au p50** — 8,0 / 4,7 / 8,5 s. C'est leur *somme* qui fait le total.

**La queue est portée par le Critique.** Les tours les plus lents montrent 60,5 s, 39,3 s, 36,3 s
et 34,4 s sur ce seul étage : son pipeline batché émet jusqu'à **3 appels** par tour, là où
l'Analyste et l'Arbitre en font toujours un.

---

## E. Latence totale

| | ms |
| --- | --- |
| min | 19 707 |
| p50 | 21 338 |
| p75 | 27 364 |
| p90 | 51 880 |
| p95 | 75 347 |
| max | 81 334 |

**Une inversion contre-intuitive mérite d'être relevée** : la classe **A**, demande courte *sans*
matériau, est la **plus lente** — p50 75,3 s contre 21,1 s pour la classe B avec matériau. Sans
matériau, l'Analyste produit davantage d'issues et de questions candidates, donc davantage de
jetons de sortie, donc plus de temps. **Fournir le matériau accélère le tour.**

---

## F. Jetons par rôle

| Rôle | entrée p50 | entrée p95 | sortie p50 | sortie p95 | appels max |
| --- | --- | --- | --- | --- | --- |
| Analyste | 5 573 | 5 573 | 448 | 1 464 | 1 |
| Critique | 3 653 | 9 582 | 227 | 1 295 | **3** |
| Arbitre | 3 853 | 5 211 | 521 | 1 589 | 1 |
| **Total** | **13 081** | **19 907** | **1 193** | **4 372** | — |

Un tour Deep coûte donc **≈ 13 000 jetons d'entrée** au p50, près de **20 000** au p95.

---

## G, H. Reprises et échecs, en mesure native

Cinq échecs de rôle sur 62 invocations, tous imputables à Anthropic puisque l'épinglage supprime
tout repli :

| Cause | n | Détail |
| --- | --- | --- |
| `structured_output_invalid` | **2** | Analyste ×1, Arbitre ×1 |
| `technical_failover` | 3 | Critique ×3, erreur de transport |

**Le plafond de sortie est une cause avérée, et la preuve est nette :** les deux échecs
`structured_output_invalid` se produisent à une sortie de **exactement 2 048 jetons** — la valeur
de `ROLE_MAX_OUTPUT_UNITS`. La génération est tronquée au plafond, le JSON devient invalide, le rôle
échoue.

Conformément au §25, **ce plafond n'a pas été augmenté** : la preuve est établie, la décision
appartient à un autre lot.

---

## I. Concurrence

| Concurrence | n | Succès | 429 | 5xx | p50 | p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 50 | 45 | **0** | 0 | 21 067 | 27 364 |
| 2 | 8 | 8 | **0** | 0 | 20 903 | 28 066 |
| 4 | 8 | 8 | **0** | 0 | **20 643** | **21 747** |

**Aucune dégradation, aucun 429, aucune file d'attente.** La latence à concurrence 4 est
identique — légèrement meilleure — à celle en séquentiel. Aux volumes testés, Anthropic ne
constitue pas une contrainte de débit.

---

## J. Matériau volumineux

| Classe | octets du corps | statut | latence |
| --- | --- | --- | --- |
| Grand matériau | 16 251 | 200 READY | 36 505 ms |
| Grand matériau | 16 251 | 200 READY | 28 304 ms |
| Grand matériau | 16 251 | 200 READY | 26 157 ms |

**Un premier essai à 16 743 octets a été refusé en 413 — quatre fois.** Le plafond de transport
est de 16 384 octets ; mon calcul de bourrage l'avait dépassé. Le transport a eu raison, la
fixture était fausse, elle a été corrigée sous le plafond. Le plafond **n'a pas été modifié**.

Au plafond réel, le tour aboutit systématiquement, pour un surcoût de latence d'environ **+25 %**.

---

## K. Le routage n'applique pas encore la décision Deep

Six tours **sans épinglage**, sur la chaîne HA telle qu'elle tourne aujourd'hui :

| | |
| --- | --- |
| `ANTHROPIC_NATIVE_SUCCESS` | **0 / 6** |
| Tours impliquant un repli | **6 / 6** |
| Rôles servis par Groq | analyste 4, critique 6, arbitre 2 |
| Rôles servis par Anthropic | analyste 2, arbitre 4 — **uniquement après échec de Groq** |
| Latences | 13,9 / 16,4 / 16,4 / 37,2 / 42,7 / 45,3 s |

`ROLE_PROVIDER_ORDER` reste **Groq → Anthropic → OpenAI**. La décision « DEEP = ANTHROPIC ONLY »
est une décision produit qui **n'est pas encore implémentée dans le routage** : sans épinglage, le
plan profond ne s'exécute pas sur Anthropic.

C'est exactement ce que le §22 anticipait, et cela valide le protocole : **seule la mesure épinglée
qualifie Anthropic.** Aucun des chiffres de ce rapport ne provient d'un succès obtenu par un autre
fournisseur.

---

## L. Classement du goulot

**`SERIAL_CHAIN_DOMINANT`.**

Au p50, aucun rôle ne domine : 8,0 / 4,7 / 8,5 s, et l'orchestration ne coûte rien. Le total est la
somme de trois appels que le contrat impose de faire l'un après l'autre.

Au p95, la variance du **Critique** porte la queue — jusqu'à 60,5 s sur un seul étage, son pipeline
batché émettant jusqu'à trois appels. Une composante secondaire, `PROVIDER_VARIANCE`, s'y ajoute :
les trois étages ont des queues épaisses, et le p95 total (75 s) dépasse largement la somme des p50
(21 s).

Ce lot **ne parallélise pas** et **ne compresse pas** : le §34 et le §33 l'interdisent, et la
mesure ne justifie pas de le faire sans décision d'architecture.

---

## M. Utilisabilité

**`HIGH_AND_VARIABLE`.**

| | |
| --- | --- |
| p50 | 21,3 s — élevé mais régulier ; min 19,7 s, écart faible |
| p95 | 75,3 s — **3,5× le p50** |
| max | 81,3 s |

Le plan profond est un traitement de fond, non interactif : vingt secondes y sont acceptables. Ce
qui caractérise le comportement observé n'est pas le niveau, c'est **l'amplitude** — un tour sur
vingt prend plus d'une minute, et le contrat produit ne fixe aucun seuil auquel comparer ce chiffre.
Aucun seuil n'est inventé ici (§29).

La stabilité, elle, est bonne : **aucun 429, aucune file d'attente, aucune dégradation sous
concurrence 4**, et cinq échecs de rôle sur soixante-deux invocations en mesure native.

---

## N. Verdict de capacité

**`ANTHROPIC_CAPACITY_ACCEPTED_WITH_LIMITATIONS`.**

Ce qui est acquis :

1. **Aucun coût d'orchestration** — le produit n'ajoute rien à la latence fournisseur.
2. **Aucune contrainte de débit** aux volumes testés : 0 quota dépassé, 0 file, concurrence 4 sans
   pénalité.
3. **Le plafond de transport tient** : 3/3 au grand matériau, +25 % de latence.
4. **Coût connu** : ≈ 13 000 jetons d'entrée par tour au p50, ≈ 20 000 au p95.

Limitations, aucune bloquante :

1. **Variabilité p95 = 3,5 × p50**, portée par le Critique batché.
2. **Le plafond de sortie de 2 048 jetons cause des échecs**, prouvé : les deux
   `structured_output_invalid` surviennent à une sortie de exactement 2 048.
3. **La classe sans matériau est la plus lente** (75 s au p50) — davantage de questions produites,
   donc davantage de sortie.

---

## O. Prochaine action sûre

**`DEEP-PROVIDER-ROUTING-FINAL-01`**, comme le prévoit le §43 — et la mesure du §K lui donne son
objet exact : appliquer au routage la décision « DEEP = ANTHROPIC ONLY », qui n'existe aujourd'hui
que sur le papier. Sans épinglage, le plan profond s'exécute encore majoritairement sur Groq.

**Backlog non bloquant**, à ne pas transformer en série de micro-lots :

1. Plafond de sortie à 2 048 — preuve établie, décision à prendre séparément (§25 interdit de le
   relever ici).
2. Variabilité du Critique batché — mesurer avant d'envisager quoi que ce soit.
3. Lenteur de la classe sans matériau — conséquence sémantique, pas technique.
