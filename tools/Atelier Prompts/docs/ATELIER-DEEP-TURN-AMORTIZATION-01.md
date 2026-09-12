# ATELIER-DEEP-TURN-AMORTIZATION-01 — On ne repaie pas le raisonnement, on repaie l'énoncé

Audit hors ligne. **Aucun appel API.** Aucun fichier de production modifié.

La question était : que peut-on réutiliser d'un tour à l'autre ? La mesure a déplacé la réponse.
**97 % de ce qu'Atelier paie en entrée à chaque tour n'est pas du contexte de conversation — ce sont
les prompts et les schémas, identiques à l'octet près, renvoyés et refacturés à chaque appel.**

---

## A. Le chemin de recalcul actuel

`oprieRunTurn()` → `oprieRequestTurn()` → `POST /operational-request`. Le corps transmis
(`oprieBuildBody`) contient **exactement quatre champs** :

```js
{ original_request, clarification_history, material_context, material_content? }
```

Rien d'autre. Pas de candidat précédent, pas de sortie de rôle, pas d'identifiant de session, pas
même un numéro de tour. Le serveur est **sans état d'un tour à l'autre**, par construction.

## B. Inventaire de l'état conservé

| Élément | Persisté | Disponible au tour suivant | Réutilisé aujourd'hui |
| --- | --- | --- | --- |
| `original_request` | client | oui | renvoyé tel quel |
| `clarification_history` | client | oui | renvoyé en entier |
| `material_context` / `material_content` | client | oui | renvoyés en entier |
| `oprieState.lastTurn` | client | **oui** | **jamais relu** — écrit en 21531, lu nulle part |
| Candidat Analyste, verdicts Critique, décision Arbitre | **non** | non | — |

Réponse au § 17 : **C — absence d'état intermédiaire.** Tout redémarre parce que rien n'est
transmis. Ce n'est pas une protection contre le *stale state*, c'est qu'il n'y a rien à protéger.

## C. Le delta réel entre deux tours

| Champ | Tour N → N+1 | Classe |
| --- | --- | --- |
| `original_request` | inchangé | `IMMUTABLE_REUSABLE` |
| `clarification_history` | **+ une entrée** | `APPEND_ONLY_REUSABLE` |
| `material_context` / `material_content` | inchangés | `IMMUTABLE_REUSABLE` |
| Prompts système (×4) | inchangés | `IMMUTABLE_REUSABLE` |
| Schémas JSON (×3) | inchangés | `IMMUTABLE_REUSABLE` |
| Candidat, issues, provenance | doivent être rejugés | `TURN_DEPENDENT_RECOMPUTE` |
| État OPRIE, question suivante | doivent être rejugés | `VERDICT_MUST_RECOMPUTE` |

## D, E, F. La mesure qui change la question

| Bloc | Caractères | ≈ Jetons | Varie entre deux tours ? |
| --- | --- | --- | --- |
| Prompt Analyste | 13 339 | 3 605 | **non** |
| Prompt Critique global | 6 912 | 1 868 | **non** |
| Prompt Revue de substitution | 12 487 | 3 375 | **non** |
| Prompt Arbitre | 6 211 | 1 679 | **non** |
| Schémas JSON (3) | — | 2 214 | **non** |
| **Total constant** | | **≈ 12 741** | |
| Entrée totale mesurée p50 | | **13 081** | |
| **Part constante** | | **≈ 97 %** | |

Le contexte de conversation — demande, historique, matériau — pèse **environ 340 jetons**, soit 3 %.

**Conséquence.** Amortir les *sorties d'étage* viserait une fraction du problème et rouvrirait le
risque sémantique que le lot précédent a démontré. Ce qui est massivement repayé, ce n'est pas le
raisonnement du tour précédent : c'est l'énoncé du contrat, réémis douze mille fois.

## G, H, I, J. Réutilisation par étage

`SAFE_ANALYST_REUSE = NO` · `SAFE_CRITIC_REUSE = NO` · `SAFE_ARBITER_REUSE = NO`.

Rien n'est transmis à réutiliser, et le lot précédent a établi que les trois étages font un travail
matériel sur les tours intermédiaires. `OPRIE_AUTHORITY_PRESERVED = YES` — aucune option retenue ici
n'y touche.

## K. Les options

| | Appels | Coût / tour | Risque sémantique | Complexité |
| --- | --- | --- | --- | --- |
| **0** — recalcul complet (actuel) | 3–5 | 0,057 $ | aucun | — |
| **1** — réinjecter le contexte établi | 3–5 | **plus cher** (entrée plus grosse) | faible | moyenne |
| **2** — réutiliser des sous-résultats | 2–4 | ~0,04 $ | **élevé** | élevée |
| **3** — candidat incrémental | 2–3 | ~0,04 $ | **élevé** | élevée |
| **4** — **cache de préfixe fournisseur** | 3–5 | **0,023 $** | **aucun** | **faible** |

L'Option 1 est contre-productive : réinjecter les résultats précédents *augmente* l'entrée, donc le
coût, sur les 3 % variables — pour économiser zéro appel.

Les options 2 et 3 attaquent les 3 % en prenant le risque que le lot précédent a écarté.

## L. Option 4 — ne pas refacturer le même préfixe

Les prompts système et les schémas d'outil sont **immuables** et forment le préfixe de chaque appel
(`callAnthropicMessages` construit `system` puis `tools[].input_schema`). Anthropic facture la
lecture d'un préfixe mis en cache à une fraction du tarif d'entrée.

**Hypothèse tarifaire, non vérifiée dans cette session** : écriture de cache ≈ 1,25 × l'entrée,
lecture ≈ 0,10 × l'entrée, TTL par défaut de quelques minutes. **À confirmer dans la documentation
et la console avant toute décision** — comme le tarif de base du lot précédent.

| | Coût / tour | Écart |
| --- | --- | --- |
| Aujourd'hui | 0,0571 $ | — |
| Cache **chaud** | **0,0227 $** | **−60 %** |
| Cache **froid** (première écriture) | 0,0667 $ | +17 % |

| Session | Aujourd'hui | Avec cache | Écart |
| --- | --- | --- | --- |
| 5 tours | 0,286 $ | 0,158 $ | **−45 %** |
| 10 tours | 0,571 $ | 0,271 $ | **−53 %** |
| 20 tours | 1,143 $ | 0,499 $ | **−56 %** |

| Échelle mensuelle | Aujourd'hui | Avec cache |
| --- | --- | --- |
| 1 000 sessions × 10 tours | 571 $ | **271 $** |
| 10 000 sessions × 10 tours | 5 714 $ | **2 713 $** |

**Latence.** Un préfixe mis en cache n'est pas retraité : le temps jusqu'au premier jeton diminue.
L'effet est réel mais **je ne l'ai pas mesuré et je ne vais pas l'inventer**. Il faudrait ≤ 5 tours
réels pour l'établir, si l'option est retenue. Le gros de la latence reste la **génération** des
sorties, établie ailleurs (×4,41 de latence pour ×3,68 de sortie) : le cache réduit le coût
franchement, la latence probablement, mais pas dans les mêmes proportions.

## M. Protection contre l'état obsolète

C'est ce qui rend l'option 4 sûre là où 2 et 3 ne le sont pas. La règle d'invalidation demandée au
§ 19 — *« si X n'a pas changé, Y reste réutilisable »* — est ici littérale : **X est la suite d'octets
du prompt elle-même.** Le fournisseur indexe le cache sur ce contenu ; si un prompt change d'un seul
caractère, la clé change et le cache est manqué, automatiquement. Aucun TTL à choisir, aucune
similarité, aucun score, aucune heuristique. `STALE_STATE_CAN_BE_DETERMINISTICALLY_INVALIDATED = YES`.

Et rien de sémantique ne bouge : le modèle reçoit exactement les mêmes octets qu'aujourd'hui. Les
trois étages s'exécutent, OPRIE décide, `FALSE_READY_RISK = inchangé (nul)`.

## N. Recommandation

`CONCLUSION = SAFE_AMORTIZATION_PATH_FOUND` — mais pas là où le lot la cherchait.

Le travail sémantique ne peut pas être amorti : il n'est pas transmis, et le lot précédent a montré
qu'il ne doit pas être sauté. **L'énoncé du contrat, lui, est repayé intégralement à chaque appel**,
et c'est 97 % de la facture d'entrée.

Le lot d'implémentation minimal tient en une phrase : **marquer le préfixe immuable — prompt système
et schéma d'outil — comme cacheable dans `callAnthropicMessages`.** Un seul fichier, un seul point
d'appel, aucun changement de prompt, de schéma, de rôle, de routage ni d'autorité. Le seul travail
d'ingénierie réel est la mise en forme du champ `system` en blocs, exigée par le fournisseur pour
poser le marqueur.

**Avant de coder** : vérifier en console le tarif et le TTL réels du cache. Toute la valeur de cette
proposition repose sur ce ratio, et je ne l'ai pas vérifié.
