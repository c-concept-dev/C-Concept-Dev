# DEEP-RESIDUAL-502-ATTRIBUTION-01 — Ce qui manquait n'était pas un correctif, c'était le journal

Un 502, une fois sur trente-deux, jamais reproduit, jamais expliqué. Le lot précédent l'a laissé
ouvert plutôt que de l'arrondir. Ce lot ne corrige rien : il regarde correctement.

---

## A. Le point de départ

| | |
| --- | --- |
| Base | `c5b9752` — sous-arbre `tools/Atelier Prompts` **byte-identique** à `bbf8b52` |
| Mutation externe de l'Atelier | **non** |
| Défaut à attribuer | 1 × HTTP 502, cas sans matériau, 54 094 ms |
| Reproduction au lot précédent | 0 / 12 tours ciblés |
| Pourquoi il n'avait pas été attribué | `wrangler tail` n'avait livré que **11 des 20** invocations : le tour fautif était hors de la fenêtre capturée |

Le blocage n'était donc pas « un défaut qu'on ne sait pas corriger ». C'était **un défaut qu'on ne
sait pas voir** — et on ne corrige pas à l'aveugle.

---

## B. Ce qui a changé : la capture, pas le produit

`PRODUCTION_BEHAVIOR_CHANGED = NO`. Aucun prompt, aucun schéma, aucun validateur, aucun routage,
aucune reprise, aucun timeout, aucun plafond. **Aucune instrumentation ajoutée au produit** : le
journal exploité est exactement celui que le Worker émettait déjà.

Ce qui change est la manière de le recueillir : **une session `wrangler tail` courte par tour**, au
lieu d'une seule session longue pour toute la campagne. Un tour, une session, une vérification.

Un tour n'est compté comme évaluable que si son journal porte les trois marques d'un tour entier :
au moins une `isolate_observation`, au moins un `operational_request_role_start`, et **exactement un**
événement terminal — `turn_ok`, `degraded` ou `error`. Un journal partiel ne compte pas.

| | Lot précédent | Ce lot |
| --- | --- | --- |
| Tours | 20 | 20 |
| Journaux complets | 11 | **20** |
| `JOURNAL_CAPTURE_COMPLETENESS_RATE` | 0,55 | **1,00** |

---

## C. La campagne

Population réutilisée à l'identique, aucun scénario inventé : **14 × le cas qui a produit le 502**
(sans matériau) et **6 × le cas matériau** du même rejeu. Anthropic, `claude-sonnet-4-6`,
séquentiel, aucun épinglage.

| Compteur | Valeur |
| --- | --- |
| `RUN_COUNT_COMPLETED` | 20 |
| `ATTRIBUTION_EVALUABLE_RUNS` | **20** |
| **`HTTP_502_COUNT`** | **0** |
| `B01B_VIOLATION_COUNT` | **0** |
| `DEGRADED_STATE_COUNT` | 1 |
| `FALSE_READY_COUNT` | **0** |
| `DEEP_GROQ_CALL_COUNT` | **0** |
| `DEEP_OPENAI_CALL_COUNT` | **0** |

`provider_order` observé à chaque tentative : `["anthropic"]`, sans exception.

---

## D. Le seul échec de la campagne — et c'est lui qui répond à la vraie question

Tour 14. L'Arbitre produit **1864 jetons**, `finish_reason = tool_use` — donc une réponse **complète**,
loin sous le plafond de 4096. Sa sortie est néanmoins refusée par la validation structurelle.

```
provider_ha_attempt   role=arbiter provider=anthropic provider_order=["anthropic"]
  usage: sortie=1864  finish=tool_use  plafond=4096
provider_ha_failure   role=arbiter failure_class=structured_output_invalid
provider_ha_exhausted role=arbiter provider_order=["anthropic"]
operational_request_degraded role=arbiter
```

→ **HTTP 200, `degraded_state`.** Aucun repli, aucun READY fabriqué, aucun verdict inventé.

Ce n'est **pas** une troncature : le plafond n'est pas en cause, et il n'est pas touché. C'est une
sortie de modèle non conforme, classée pour ce qu'elle est et fermée proprement.

Le § 17 du cahier des charges pose la bonne question — non pas « zéro incident », mais « quand un
incident survient, Atelier le classe-t-il et le ferme-t-il correctement ? ». **Ce tour en est la
démonstration directe**, sur le chemin réel, avec le journal complet à l'appui.

---

## E. Attribution

`OUTCOME = NO_502_REPRODUCED`, avec journal complet.

Sur la question centrale, la réponse est **D — incident ponctuel non reproductible**, dont
l'attribution avait été empêchée par **E — un défaut d'observabilité**, lequel est désormais corrigé
méthodologiquement.

Cumul depuis le correctif B-01B : **32 tours consécutifs à journal complet** (20 ici + 12 ciblés au
lot précédent), **zéro 502**.

Ce que ce lot **ne** prouve **pas**, et qu'il ne prétendra pas : qu'un tel 502 soit impossible. Une
non-reproduction n'est pas une preuve d'impossibilité. Ce qui est prouvé est plus modeste et plus
utile : l'événement ne se reproduit pas sous observation correcte, et les échecs qui surviennent
réellement sont classés et fermés conformément au contrat.

---

## F. Verdict

`RELEASE_GATE_AUTHORIZED = YES`, au titre de la condition A du § 23 : aucun 502 ne s'est reproduit
sur une campagne correctement journalisée — et « correctement journalisée » n'est pas une affirmation
en l'air ici, c'est un taux mesuré de 20/20.

Aucun code de production n'a été modifié. Aucun défaut non reproduit n'a été « corrigé » au jugé.

---

## ADDENDUM — LOT INTERROMPU, ET MÉTHODE DÉPASSÉE

**Ce lot s'est arrêté sur la règle § 0** : `tools/Atelier Prompts` a été modifié par un acteur
externe pendant son exécution. Le commit `a8f0131 OBSERVABILITY-COMPLETENESS-01` a été déposé
pendant la campagne. Rien n'a été intégré, rien n'a été commité, rien n'a été réconcilié.

**Et il faut dire plus que « interrompu ».** Ce commit corrige une limite réelle de la méthode
ci-dessus, sur deux points que cette campagne n'a pas vus :

1. **La complétude ne suffisait pas.** Ce document mesure 20/20 journaux complets et en tire
   « campagne correctement journalisée ». C'est vrai de la *capture des événements*, et faux de
   l'*attribution* : aucun identifiant ne reliait la réponse vue par le client à un enregistrement
   serveur. Avec 100 % des journaux, le 502 d'origine serait resté inattribuable. La bonne mesure
   manquait, pas seulement les bons journaux.

2. **La preuve a été prise au mauvais endroit.** `observability.enabled` et
   `head_sampling_rate = 1` étaient posés sur les Workers depuis leur création : un magasin durable
   existait pendant toute la campagne. Avoir bâti un harnais de sessions `wrangler tail` courtes
   traite le symptôme d'un flux vivant qui expire, là où la source durable était déjà disponible.

Ce qui reste valable ici : les 20 tours réels, leur classification, le tour 14 — Arbitre à 1864
jetons, non tronqué, refusé structurellement, classé `structured_output_invalid`, rendu en
`degraded_state` 200 sans repli ni verdict fabriqué. Cette observation-là tient, et elle répond au
§ 17. Ce qui ne tient pas, c'est la conclusion « attribution possible » : elle l'était devenue par
construction, pas par preuve.
