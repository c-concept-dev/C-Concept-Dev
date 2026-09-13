# ATELIER-INTERMEDIATE-DEEP-VALUE-01 — Ce que le Critique et l'Arbitre font vraiment sur un tour intermédiaire

Audit hors ligne. **Aucun appel API.** Aucun fichier de production modifié.

La question posée était : peut-on alléger le Deep sur les tours qui n'aboutissent pas ?
La réponse est non, et elle ne vient pas d'une statistique — elle vient du contrat lui-même.

---

## A. Inventaire des preuves

469 tours Deep enregistrés dans 21 fichiers de campagne.

| État final | Tours |
| --- | --- |
| `operational_request_ready` | 174 |
| **`clarification_required`** | **166** |
| `blocked` | 68 |
| `degraded_state` | 39 |
| **`confirmation_required`** | **11** |

**`INTERMEDIATE_TURNS_IDENTIFIED` = 177.**

## B. Et ce que ces preuves ne contiennent pas

Champs disponibles sur ces 177 tours : `final_state`, `latence_ms`, `status`, `cas`, `reason`,
`next_question` (43), `issue_1` (43), `blocked_reason`.

Champs **absents, sur les 177** : `analyst_output`, `critic_output`, toute sortie de rôle
intermédiaire.

Ce n'est pas un oubli de collecte, c'est le contrat : l'orchestrateur exécute les trois rôles côté
serveur et ne rend au client que le tour final (`return jsonResponse(turn, …)`). Les journaux
n'émettent que des métadonnées — `role_start`, `provider_ha_*`, `usage`, `role_ok` — jamais un
contenu de rôle. `RAW_MATERIAL_LOGGING_COUNT = 0` est un invariant tenu depuis des lots.

**Conséquence directe : `INTERMEDIATE_TURNS_EVALUABLE` = 0** pour l'analyse contrefactuelle du § 7.
Comparer « ce que l'Analyste proposait » à « ce que le tour a rendu » exige la sortie de l'Analyste.
Elle n'a jamais été conservée. Les compteurs des § 8 et § 10 sont donc **non calculables**, et je ne
vais pas les remplir avec des nombres que je ne peux pas justifier.

---

## C, D, E, F. Ce qui EST mesuré, et qui suffit à trancher

Deux lots ont mesuré causalement l'effet du Critique et de l'Arbitre, par campagnes appariées.

**Critique** — `oprie-critic-material-context-delivery-01`, 30 tours réels :

| | Avant | Après |
| --- | --- | --- |
| Vetos d'absence de matériau **erronés** | 11 | **0** |
| `operational_request_ready` | 0 | 11 |
| Classement du Critique sur 16 tours conformes | — | **ACCEPT 10 · PHASE_SEMANTICS 4 · OTHER_SEMANTIC 2** |

Sur seize tours où l'Analyste était conforme, **le Critique n'a pas simplement acquiescé six fois**
— quatre objections de phase, deux autres objections sémantiques. Le Critique modifie donc l'issue
du tour dans 6 cas sur 16.

**Arbitre** — `oprie-arbiter-material-context-delivery-01`, 30 tours + 6 de contrôle négatif :

| | Avant | Après |
| --- | --- | --- |
| Vetos « matériau invérifiable » erronés | 16 | **0** |
| `P_accept` évaluable | 0/16 | 29/29 |
| **Faux READY** | **1** | **0** |
| Contrôle négatif (matériau annoncé, contenu inaccessible) | — | 5 `clarification_required` + 1 `blocked`, **0 READY, 0 valeur inventée** |

Le lot le formule mieux que je ne le ferais : *« l'Arbitre se sert du champ pour REFUSER autant que
pour accepter — ce n'est pas un assouplissement »*. Et son fonctionnement correct a supprimé **un
faux READY**.

---

## G, H, I. Décision matérielle, cosmétique, faux READY

Ce qui est établi : le Critique et l'Arbitre **changent l'issue** — vetos supprimés, états
retournés, un faux READY évité. Ce qui n'est pas établi, faute des sorties de rôle : la répartition
de ces changements entre tours intermédiaires et tours de consolidation.

`FALSE_READY_RISK_IF_SHORTCUT` : les preuves montrent l'Arbitre en position d'**empêcher** le faux
READY (1 → 0). Court-circuiter l'étage qui a joué ce rôle augmenterait ce risque. Le § 19 l'interdit.

---

## J, L. La frontière structurelle recherchée — et pourquoi elle n'existe pas

Le § 13 demande une condition déterministe disant « ce tour ne peut pas devenir READY avant une
réponse utilisateur ». Le candidat évident, et le seul qui soit générique et non sémantique :

> *l'Analyste propose au moins une issue avec `impact === "material"` et
> `recommended_treatment === "question"` ⟹ le tour exigera une réponse ⟹ inutile de faire tourner
> le Critique et l'Arbitre.*

**Ce raisonnement est exactement à l'envers, et le code le dit.**

Cette condition est précisément celle qui construit `question_review_targets` — le filtre est
littéralement `impact === "material" && recommended_treatment === "question"`. C'est elle qui
déclenche les batches de revue de substitution. Et à quoi sert cette revue ? À examiner, pour chaque
question que l'Analyste veut poser, si l'une des six alternatives non-question de la ladder était
raisonnablement disponible. Son verdict par issue est `question_is_last_resort`, et
`illegitimate_question_found` désigne les questions qui **n'auraient pas dû être posées**.

Autrement dit : **le moment où l'Analyste veut poser une question est exactement le moment où le
Critique a le plus de travail utile à faire.** Sauter le Critique là revient à supprimer la garantie
« QUESTIONNER = dernier recours » et à laisser passer les questions inutiles.

L'économie serait réelle — et payée en questions supplémentaires posées à l'utilisateur. C'est
échanger du coût API contre du temps utilisateur, ce que le § 30 range explicitement du mauvais côté.

**`STRUCTURAL_SAFE_BOUNDARY_FOUND = NO`** — non pas faute d'avoir cherché, mais parce que la
condition candidate est l'inverse d'une condition de sortie.

Quant à l'Arbitre : il est l'**unique** autorité d'état. Sans lui il n'y a pas d'état du tour, donc
pas de tour. Il n'est pas différable.

---

## K. Coût par étage

Découpage au p50, à partir des jetons déjà mesurés :

| Étage | Entrée | Sortie | Coût | Valeur matérielle démontrée |
| --- | --- | --- | --- | --- |
| Analyste | 5 573 | 448 | ≈ 0,023 $ | oui — produit le candidat |
| Critique (global + batches) | 3 653 | 227 | ≈ 0,014 $ | **oui — 6/16 objections, garantie du dernier recours** |
| Arbitre | 3 853 | 521 | ≈ 0,019 $ | **oui — autorité d'état, 1 faux READY évité** |
| **Total** | 13 081 | 1 193 | **≈ 0,057 $** | |

Le Critique est **l'étage le moins cher des trois**, batches compris. L'intuition du lot précédent
— « les batches coûtent cher » — était juste en *latence* et fausse en *coût* : ils s'ajoutent en
appels, pas en dollars.

---

## M. Les trois options

| | Appels / tour interm. | Latence | Coût | Risque sémantique |
| --- | --- | --- | --- | --- |
| **Option 0** — actuel | 3 à 5 | ~92 s (ouvert) | 0,057 $ | aucun |
| **Option 1** — Fast d'abord | 3 à 5 | **inchangée** | **inchangé** | aucun |
| **Option 2** — Deep allégé | 1 à 2 | ~25 s | ~0,023 $ | **inacceptable** |

**Option 1 ne gagne rien.** Le code lance déjà `oprieRequestTurn()` puis `oprieStartFastPlane()`
coup sur coup, sans `await` entre les deux : l'écart réel est de quelques microsecondes de
JavaScript. Le Fast répond déjà en ~1 s, bien avant le Deep. Il n'y a pas de gain de latence perçue
à récupérer, et aucun gain de coût — le § 16 avait raison de demander la distinction.

**Option 2** supprime la garantie du dernier recours et l'autorité d'état. Écartée.

---

## N. Recommandation

`CONCLUSION = FULL_DEEP_REQUIRED_ON_INTERMEDIATE_TURNS`.

Ne rien changer au déclenchement. Le Critique et l'Arbitre ne sont pas du zèle sur les tours
intermédiaires : ce sont les deux étages qui empêchent respectivement la question inutile et le faux
READY, et ce sont exactement les tours intermédiaires qui les sollicitent le plus.

**Le problème économique du lot précédent reste entier, mais il n'est pas là où on le cherchait.**
Le coût ne vient pas d'étages superflus ; il vient de ce que **chaque message relance les trois**.
Le levier restant n'est donc pas « faire moins par tour » mais « refaire moins d'un tour à
l'autre » : entre deux tours consécutifs, l'entrée ne diffère que d'une réponse, et rien n'est
amorti. C'est un sujet de conception distinct, qui n'est pas tranché ici et qui ne doit pas l'être
sans mesure.

**Sur les 92 secondes** — le vrai grief produit — la cause est établie depuis
DEEP-PRODUCTION-BLOCKERS-01 : la latence suit les jetons de **sortie** (×4,41 de latence pour ×3,68
de sortie). Les demandes ouvertes font produire trois longues sorties. Cela se traite par la
longueur des sorties, pas par la suppression d'un étage — et c'est hors du périmètre de ce lot.
