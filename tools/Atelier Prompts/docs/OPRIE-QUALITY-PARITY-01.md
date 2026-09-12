# OPRIE-QUALITY-PARITY-01 — Groq contre Anthropic, à parité

**Question :** à comportement produit identique, Anthropic fournit-il une qualité profonde
équivalente à Groq sur la chaîne Analyste → Critique → Arbitre ?

**La question a été rendue partiellement caduque par sa propre mesure.** Épinglé sans repli,
**Groq n'a produit que 2 décisions gouvernées sur 12** — les dix autres tours se sont dégradés
avant d'aboutir. La référence comportementale que ce lot devait utiliser **n'existe pas** au
niveau de quota actuel.

Ce que la mesure établit malgré tout : Anthropic tient 11 tours sur 12, sans aucune panne
fournisseur, sans reprise, sans défaut critique — mais il **sur-questionne systématiquement**
contre la vérité terrain du corpus. Verdict : **PARTIAL**.

Ce document **n'est pas une autorité**. Aucun code ne le lit. OPRIE reste l'autorité sémantique
unique.

---

## A. Inventaire

Route `/operational-request`, séquence `analyst → critic → arbiter`, toujours complète. OPRIE
n'est pas un appel fournisseur séparé : il **est** cette séquence. Comparer la qualité OPRIE,
c'est donc comparer la qualité composée de la chaîne.

Un épinglage diagnostic du plan profond a dû être ajouté — `DEEP_BENCH_PROVIDER`, miroir exact
de `FAST_BENCH_PROVIDER` : sans lui, un run « Groq » aurait contenu des réponses d'Anthropic
par bascule, et n'aurait comparé rien du tout. `PRODUCTION_CODE_CHANGED = YES`, minimal, et la
valeur déclarée du Worker reste `"ha"` — `ROLE_PROVIDER_ORDER` est intact.

---

## B. Méthode

**Aucune similarité textuelle, aucun embedding, aucun juge LLM, aucun seuil sémantique.** Deux
sorties lexicalement différentes peuvent être sémantiquement équivalentes ; la comparaison
porte donc exclusivement sur le **comportement gouverné** : état OPRIE, présence d'une question,
nombre et traitement des issues, préservation d'intention, validité de schéma, fiabilité.

**Vérité terrain.** Le corpus porte un oracle `{route, question_required}`. Seul
`question_required` est utilisé, et uniquement pour la dimension à laquelle il correspond
directement : *une question doit-elle être posée à ce tour ?* — ce qui est exactement la
raison d'être de l'état `clarification_required`.

**Limite de cet oracle, énoncée d'emblée :** il a été écrit pour le contrat `/decision`
(route rapide contre architecte), non pour les états OPRIE. Aucune vérité terrain n'existe pour
`operational_request_ready`, `confirmation_required` ni `blocked` ; ces dimensions relèvent donc
de l'accord et de l'audit, jamais d'un score.

---

## C. Corpus

`evaluation/corpus-lot10g2a.json`, corpus de régression existant. **Aucun cas inventé, aucune
orientation vers un fournisseur.** Douze fixtures, cinq catégories, trois classes d'oracle :

| Oracle | Cas |
| --- | --- |
| rapide, sans question | 5 |
| architecte, sans question | 3 |
| architecte, **avec** question | 4 |

**Manque documenté :** le corpus ne contient aucun cas dont l'attente serait
`confirmation_required` ou `blocked`. Ces deux états n'ont donc pas pu être éprouvés contre une
attente. Aucun cas artificiel n'a été ajouté pour combler ce trou.

---

## D. Configuration

| | Groq | Anthropic |
| --- | --- | --- |
| Modèle | `openai/gpt-oss-20b` | `claude-sonnet-4-6` |
| Prompts | identiques | identiques |
| Schémas | identiques | identiques |
| Plafonds de sortie | inchangés | inchangés |
| Espacement | 90 000 ms | 90 000 ms |

**Asymétrie assumée :** les politiques de reprise diffèrent par construction — Groq possède une
boucle 429/`Retry-After`, Anthropic n'en a pas. C'est une propriété du produit, pas du banc.

**Épinglage vérifié dans les traces, pas supposé :**

| Run | Ordre observé | Invocations | Bascules |
| --- | --- | --- | --- |
| Groq | `["groq"]` | 12 | **0** |
| Anthropic | `["anthropic"]` | 12 | **0** |

`FAILOVER_CONTAMINATION_COUNT = 0`. Les deux runs sont valides.

---

## E, F, G. Comparaison par rôle

| Rôle | | Groq | Anthropic |
| --- | --- | --- | --- |
| **Analyste** | cas atteints | 12 | 12 |
| | appels réussis | **9** | **12** |
| | échecs fournisseur | **3** | **0** |
| | échecs de schéma | 0 | 0 |
| **Critique** | cas atteints | **9** | 12 |
| | appels | 14 | 36 |
| | reprises | 6 | 0 |
| | échecs fournisseur | **2** | **0** |
| **Arbitre** | cas atteints | **7** | 12 |
| | appels | 2 | 12 |
| | reprises | 3 | 0 |
| | échecs fournisseur | **5** | **0** |
| | échecs de schéma | 0 | **1** |

**Le nombre de cas atteints décroît chez Groq** — 12, puis 9, puis 7 — parce qu'un rôle qui
échoue empêche les suivants de s'exécuter. Ce n'est pas un défaut de qualité : c'est
l'épuisement du budget de jetons en cours de tour, déjà établi par DEEP-TOKEN-COST-01.

**Classes d'échec observées :**

| Groq | | Anthropic | |
| --- | --- | --- | --- |
| `arbiter / technical_failover` | 4 | `arbiter / structured_output_invalid` | 1 |
| `critic / technical_failover` | 2 | | |
| `analyst / request_rejected` | 2 | | |
| `analyst / technical_failover` | 1 | | |
| `arbiter / request_rejected` | 1 | | |
| **total** | **10** | **total** | **1** |

Anthropic produit **un seul** échec sur 60 appels : une sortie structurée invalide de l'Arbitre.
Groq en produit dix.

---

## H. Parité de décision OPRIE

| | Groq | Anthropic |
| --- | --- | --- |
| **Tours gouvernés** | **2 / 12** | **11 / 12** |
| Tours dégradés | **10** | 1 |
| `operational_request_ready` | 2 | 2 |
| `clarification_required` | 0 | **9** |
| `confirmation_required` | 0 | 0 |
| `blocked` | 0 | 0 |

**Cas comparables — ceux où les DEUX ont produit une décision : 2 sur 12.** Accord d'état : 1
sur 2. C'est trop peu pour constituer un accord de référence, et le dire est plus utile que de
publier un pourcentage sur deux points.

### Vérité terrain, dimension question

| | Conforme | Fausse clarification | Clarification manquée |
| --- | --- | --- | --- |
| Groq (2 décisions) | 2 | 0 | 0 |
| **Anthropic (11 décisions)** | **6** | **5** | **0** |

**Anthropic n'a manqué aucune clarification requise** : les quatre cas où l'oracle en exige une
— Q01, Q02, Q07, Q08 — l'ont tous reçue. Mais il en a demandé **cinq de trop** : R08, R09, A01,
A02, A03, où l'oracle n'en attend aucune. Il questionne dans 9 cas sur 11 quand l'attente est
de 4.

**Aucun faux READY, dans aucun des deux runs.** C'est le critère que la section 11 déclare
critique, et il est tenu : aucun des deux fournisseurs n'a déclaré `operational_request_ready`
sur un cas où l'oracle exige une question.

### Désaccords

Un seul cas comparable est en désaccord : **R09**, où Groq rend `operational_request_ready` et
Anthropic `clarification_required`. L'oracle n'attend pas de question → classé `GROQ_BETTER`.

```
DISAGREEMENT_COUNT                        = 1
DISAGREEMENT_GROQ_BETTER                  = 1
DISAGREEMENT_ANTHROPIC_BETTER             = 0
DISAGREEMENT_EQUIVALENT_DIFFERENT_FORM    = 0
DISAGREEMENT_UNCERTAIN                    = 0
NON COMPARABLES (Groq n'a pas décidé)     = 10
```

---

## I. Schéma et fiabilité

`SCHEMA_FAILURE` : Groq 0, Anthropic 1. `RETRY` : Groq 9, Anthropic 0. `PROVIDER_FAILURE` :
Groq 10, Anthropic 0.

Une précision qui évite un contresens : **aucune réponse n'a été invalide au sens du contrat.**
Un tour dégradé est un résultat **contractuel** — le noyau le valide explicitement — et non une
sortie malformée. Les 12 réponses des deux runs sont exploitables ; c'est leur contenu gouverné
qui diffère.

**Latence, observationnelle et trompeuse si on la lit vite.** Groq rend un p50 de 3,4 s contre
77,2 s pour Anthropic — mais la médiane de Groq est celle de ses *échecs rapides*, pas de ses
tours aboutis. Comparer ces deux nombres n'aurait aucun sens, et ce lot ne le fait pas.

---

## J. Audit des désaccords

Le seul désaccord comparable, R09, a été classé par la vérité terrain, pas par jugement.
Les cinq fausses clarifications d'Anthropic sont, elles, classées contre l'oracle — et c'est là
que la limite de la section B pèse : cet oracle a été écrit pour décider d'une *route*, pas d'un
*état OPRIE*. Il est possible qu'une demande légitimement routée vers Architecte sans question
appelle malgré tout une clarification au sens d'OPRIE. **Ce lot ne trancherait pas cette
question sans inventer une autorité qu'il n'a pas.**

C'est pourquoi le sur-questionnement est classé **MAJOR** et non **CRITICAL** : il est
systématique, il est mesuré, et son statut de défaut dépend d'une attente qui n'a pas été écrite
pour cet usage.

---

## K. Défauts critiques

| | Critical | Major | Minor | Cosmetic |
| --- | --- | --- | --- | --- |
| **Anthropic** | **0** | **5** | 0 | 0 |
| **Groq** | **0** | 0 | 0 | 0 |

Le zéro de Groq n'est pas un satisfecit : avec 2 décisions observées, il n'y a pas assez de
comportement pour lui imputer un défaut de qualité. **Son problème mesuré est la fiabilité, pas
la qualité.**

---

## L. Limites

1. **La référence n'a pas pu être établie.** Groq rend 10 tours dégradés sur 12. Le lot demandait
   de comparer à une référence comportementale ; elle n'existe pas au quota actuel.
2. **Deux cas comparables.** Tout accord d'état calculé sur cette base serait un artefact.
3. **L'oracle du corpus a été écrit pour `/decision`**, pas pour les états OPRIE. Son autorité
   est réelle mais étroite.
4. **`confirmation_required` et `blocked` ne sont éprouvés par aucune attente** — le corpus n'en
   contient pas, et aucun cas n'a été fabriqué.
5. **Douze fixtures.** Suffisant pour révéler un biais systématique de 5/11, insuffisant pour en
   mesurer l'ampleur avec précision.
6. **Aucun jugement de qualité rédactionnelle.** Ce lot compare des comportements gouvernés ; il
   ne dit rien de la valeur des textes produits.

---

## M. Verdict

```
ANTHROPIC_DEEP_QUALITY_PARITY = PARTIAL
```

**Pourquoi pas PASS.** La section 46 exige, entre autres, des décisions gouvernées
« comparables ou meilleures ». Cinq fausses clarifications sur onze décisions ne sont pas
démontrablement comparables, et la référence qui aurait permis d'en juger n'a pas pu être
établie.

**Pourquoi pas FAIL.** Aucun défaut critique, aucun faux READY, aucune clarification manquée,
aucune régression de schéma, et une fiabilité sans commune mesure : 1 échec contre 10. Rien
dans ces données ne disqualifie Anthropic.

**Ce que le lot a réellement démontré** dépasse la question posée : ce n'est pas qu'Anthropic
serait un candidat imparfait pour le plan profond — c'est que **Groq n'en est plus un du tout**.
Épinglé, sans le repli qui masquait le problème, il échoue quatre tours sur cinq. La chaîne HA
ne compense pas une insuffisance passagère : elle dissimule une inadéquation structurelle, déjà
chiffrée par DEEP-TOKEN-COST-01.

---

## N. Action suivante

`DEEP-PROVIDER-ROUTING-01` **n'est pas déclenché** : la section 46 le réserve à un verdict PASS.

La preuve manquante est étroite et nommée : **le sur-questionnement d'Anthropic est-il un défaut,
ou un artefact d'un oracle écrit pour une autre question ?** Y répondre demande une attente
explicite au niveau OPRIE — écrite par le propriétaire produit, pas dérivée d'un corpus de
routage — sur un jeu de cas couvrant aussi `confirmation_required` et `blocked`.

Tant que cette attente n'existe pas, la situation à retenir est celle-ci : la production
s'exécute aujourd'hui sur une chaîne où le fournisseur primaire du plan profond échoue quatre
fois sur cinq et où le repli, non choisi, fait l'essentiel du travail.
