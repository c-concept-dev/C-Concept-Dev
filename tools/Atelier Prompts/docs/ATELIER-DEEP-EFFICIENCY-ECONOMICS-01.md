# ATELIER-DEEP-EFFICIENCY-ECONOMICS-01 — Un atelier de prompts, pas une usine à jetons

Audit sur code et preuves existantes. **Aucune campagne API n'a été lancée pour ce lot** — tout ce
qui suit vient du code, des journaux déjà capturés et des mesures déjà payées.

---

## A. Carte du déclenchement Deep

Le plan profond a **trois points d'entrée dans tout le produit**, et aucun n'est conditionnel.

| Ligne | Appelant | Situation | Condition |
| --- | --- | --- | --- |
| 21672 | `v11StartRapide()` | demande initiale, mode rapide | **aucune** |
| 21677 | `v11StartArchitecte()` | demande initiale, mode architecte | **aucune** |
| 10599 | soumission d'une réponse | **l'utilisateur répond à une question** | **aucune** |

Les trois appellent `oprieRunTurn()`, dont la première instruction utile est :

```js
const deepPromise = oprieRequestTurn();   // Analyste -> Critique -> Arbitre
const seq = oprieState.seq;
oprieStartFastPlane(seq, requestedMode);  // lancé APRÈS, en parallèle
```

Le commentaire du code l'assume explicitement : *« LE PLAN PROFOND PART D'ABORD. L'appel est lancé —
pas attendu — avant que le plan rapide n'existe »*. Et pour la réponse à une question : *« Le tour
suivant est un nouvel appel OPRIE complet — jamais une décision locale »*.

**Conclusion factuelle : le Deep est déclenché parce qu'un message est arrivé, pas parce qu'une
analyse lourde est nécessaire.** C'est exactement ce que le § 14 du cahier des charges désigne comme
ce qu'il ne faut pas faire.

---

## B. Appels par tour utilisateur

| Rôle | Appels fournisseur | Source |
| --- | --- | --- |
| Analyste | 1 | journaux réels |
| Critique | 1 global **+ 0 à 2 batches** | `runCriticBatchedPipeline` |
| Arbitre | 1 | journaux réels |
| **Total** | **3 à 5 appels Sonnet par tour utilisateur** | observé : 3, 4 et 5 |

Le nombre de batches du Critique suit `question_review_targets`, filtré sur
`impact === "material" && recommended_treatment === "question"`.

**Conséquence contre-intuitive et importante : les tours les PLUS chers sont les tours
intermédiaires.** Quand l'Analyste propose des questions — c'est-à-dire quand la demande n'est
*pas* prête — le Critique ajoute une à deux revues de substitution. Un tour qui aboutit à
`operational_request_ready` coûte souvent *moins* qu'un tour qui demande une clarification.

---

## C. Responsabilités Fast / Deep, telles qu'implémentées

Le plan rapide **ne conditionne rien**. Il part après le Deep, en parallèle, et
`reconcileFastWithDeep` jette sa proposition dès qu'OPRIE a parlé :

```js
display: confirme ? fastInteraction : null,
authoritative_state: deepTurn.state
```

Sa valeur est donc réelle mais purement **ergonomique** : montrer quelque chose pendant les 21 à
92 secondes d'attente. Il n'économise aucun appel, ne décide rien, et c'est conforme au § 15 — le
Fast n'est jamais une autorité sémantique. Ce n'est pas un défaut : c'est simplement qu'il ne joue
aucun rôle économique aujourd'hui.

---

## D, E. Économie du jeton et coût par tour

Chiffres **déjà mesurés** (ANTHROPIC-DEEP-CAPACITY-01), non repayés :

| | p50 | p95 |
| --- | --- | --- |
| Jetons d'entrée (3 rôles) | 13 081 | 19 907 |
| Jetons de sortie (3 rôles) | 1 193 | 4 372 |

**Hypothèse tarifaire, à vérifier par le propriétaire** : tarif public de classe Sonnet,
**3 $ / M en entrée, 15 $ / M en sortie**. Je ne l'ai pas vérifié contre la console pour cet
identifiant de modèle exact ni pour la date du jour : **c'est votre console qui fait foi**, et tout
ce qui suit se rééchelonne linéairement si le tarif diffère.

| | Coût |
| --- | --- |
| **`COST_PER_DEEP_TURN_P50`** | **≈ 0,057 $ (≈ 0,053 €)** |
| **`COST_PER_DEEP_TURN_P95`** | **≈ 0,125 $ (≈ 0,115 €)** |

---

## F. Coût par session

| Session | Deep à chaque tour (actuel) | Deep seulement quand nécessaire |
| --- | --- | --- |
| 5 tours | 0,29 $ — 0,63 $ | **0,06 $ — 0,13 $** |
| 10 tours | 0,57 $ — 1,25 $ | **0,06 $ — 0,13 $** |
| 20 tours | 1,14 $ — 2,51 $ | **0,07 $ — 0,14 $** |

*(colonne optimisée : un seul Deep de consolidation, Fast Groq ailleurs à ~0,0008 $ le tour)*

Le rapport n'est pas marginal : **×4,7 sur cinq tours, ×8,9 sur dix, ×15,8 sur vingt.** Plus le
dialogue est long — c'est-à-dire plus l'atelier fait son travail — plus l'architecture actuelle
coûte cher, linéairement.

---

## G. Projections mensuelles

| Sessions / mois | Tours | Actuel | Optimisé |
| --- | --- | --- | --- |
| 100 | 5 | 28,57 $ | 6,03 $ |
| 100 | 10 | 57,14 $ | 6,43 $ |
| 1 000 | 5 | 285,69 $ | 60,34 $ |
| 1 000 | 10 | **571,38 $** | **64,34 $** |
| 10 000 | 5 | 2 856,90 $ | 603,38 $ |
| 10 000 | 10 | **5 713,80 $** | **643,38 $** |

À mille sessions de dix tours — un usage modeste pour un produit — l'écart annuel est de l'ordre de
**6 000 $ contre 770 $**.

---

## H. Économie de la latence

| Cas | p50 | Classe |
| --- | --- | --- |
| Matériau nominal | ≈ 21 s | `DEEP_JUSTIFIED` |
| Ouvert, sans matériau | ≈ 92 s | `DEEP_EXPENSIVE_BUT_JUSTIFIED` si final, **`DEEP_WASTEFUL` si intermédiaire** |
| Fast (Groq) | sous la seconde | `INTERACTIVE_CHEAP` |

Coût et latence pointent **au même endroit**. Un tour intermédiaire coûte le plus cher *et* fait
attendre le plus longtemps, pour produire… une question.

---

## I. Cas de gaspillage

1. **Réponse à une clarification → pipeline complet.** Seul `clarification_history` a changé d'une
   entrée. Analyste, Critique (global + batches) et Arbitre repartent de zéro et re-litigent les
   mêmes issues. C'est le gaspillage principal, et il est structurel.
2. **Batches de substitution sur les tours intermédiaires.** Ils rendent les tours non-prêts plus
   chers que les tours prêts.
3. **Dialogue long = coût linéaire.** Rien n'amortit : le dixième tour coûte autant que le premier.

## J. Cas où le Deep est justifié

- consolidation avant `operational_request_ready` ;
- arbitrage d'un désaccord réel Analyste/Critique ;
- matériau à analyser réellement ;
- blocage à prononcer.

Dans ces cas, 21 s et 0,06 $ sont un prix raisonnable pour une décision d'autorité.

---

## K. Optimisation minimale — proposition, non codée

**Je n'ai pas trouvé dans le code une séparation déjà exploitable qui permettrait de sauter le Deep
sans lui retirer son autorité.** Le dire est plus utile que d'inventer une règle.

Ce qui est vrai : le déclencheur est *« un message est arrivé »*. Ce qu'il devrait être, selon
le § 14 : *« une nécessité fonctionnelle réelle »*. Passer de l'un à l'autre demande de répondre à
une question sémantique — **quels tours peuvent changer le verdict de readiness ?** — et cette
réponse ne se déduit pas du code seul. La produire mérite un lot dédié avec mesure, pas une règle
improvisée ici.

Deux pistes, à valider et non à appliquer :

- **Piste 1 — le tour intermédiaire.** Quand l'Analyste conclut lui-même que la demande n'est pas
  prête, la revue de substitution complète et l'arbitrage apportent-ils une valeur proportionnée à
  leurs 2 à 4 appels supplémentaires ? Question mesurable sur les campagnes **déjà payées**.
- **Piste 2 — l'amortissement.** Rien ne réutilise le travail du tour précédent alors que l'entrée
  ne diffère que d'une réponse. Là encore : à mesurer avant de concevoir.

`NEW_ARCHITECTURE_REQUIRED = NO` pour poser la question. Peut-être `YES` pour y répondre — c'est
précisément ce qu'un lot d'audit sémantique doit trancher.

---

## L. Stratégie de test économe

Les campagnes de ce projet ont consommé, d'après les preuves versionnées, **469 tours Deep
enregistrés**, dont ≈ 296 servis par Anthropic — soit **≈ 17 $ à 37 $** selon qu'on les compte au
p50 ou au p95. À quoi s'ajoutent les tours de sonde et les campagnes interrompues, non versionnés.

| Priorité | Moyen | Coût | Quand |
| --- | --- | --- | --- |
| 1 | test déterministe (fixture, `fetch` bouchonné) | **0 $** | par défaut, toujours |
| 2 | rejeu synthétique hors ligne | 0 $ | dès qu'un enchaînement est en cause |
| 3 | petit échantillon réel, 3 à 5 tours | ≈ 0,3 $ | pour lever une ambiguïté précise |
| 4 | grande campagne 20-30 tours | 1 à 4 $ | **exceptionnel** |

Le lot CRITIC-POSTPROVIDER-TYPEERROR-01 est la démonstration du principe : la cause racine a été
trouvée par **exécution locale et comparaison d'empreinte** — coût zéro — après que trois campagnes
réelles ne l'aient pas identifiée.

**Règle proposée :** une campagne de 20 tours ou plus n'est justifiée que si le défaut est
probabiliste, non reproductible déterministiquement, et que l'information attendue vaut son prix.
Sinon, non.

## M. Budget du Release Gate

| | Proposition |
| --- | --- |
| Tours réels | **10 à 12**, pas 30 |
| Coût attendu | **≈ 0,6 à 1,5 $** |
| Composition | 4 matériau nominal, 4 sans matériau, 2 à 4 contrôles ciblés |
| Le reste | déterministe, hors ligne |

## N. Recommandation produit

`PRODUCT_EFFICIENCY_VERDICT = TOO_SLOW_AND_EXPENSIVE` — **pour les tours intermédiaires uniquement**.
Sur le tour de consolidation, l'architecture est bonne et le prix est juste.

L'ordre du § 33 est respecté par cette recommandation : le dialogue fluide vient d'abord, et c'est
justement lui que les 92 s d'un tour intermédiaire abîment. Corriger le déclenchement servirait à la
fois l'expérience et le coût — ce qui est le signe qu'on tient le bon levier.

**Ne rien coder maintenant.** Le déclencheur inconditionnel est un choix de conception explicite,
commenté et testé ; le changer sans mesurer ce que le Critique et l'Arbitre apportent sur un tour
intermédiaire reviendrait à échanger un problème de coût contre un problème de justesse.
