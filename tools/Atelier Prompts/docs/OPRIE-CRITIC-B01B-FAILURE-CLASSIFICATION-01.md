# OPRIE-CRITIC-B01B-FAILURE-CLASSIFICATION-01 — Le rejet était commun, le classement ne l'était pas

Un tour sur vingt-six s'est terminé en 502, sans aucun état sémantique. La règle violée était
partagée par les trois rôles. Le classement de sa violation ne l'était pas.

---

## A. Le défaut observé en production

Campagne de contrôle de DEEP-PRODUCTION-BLOCKERS-01, runtime final, 26 tours :

```
provider_ha_failure       role=critic  provider=anthropic  failure_class=programming_error
provider_ha_fail_closed   role=critic  remaining_providers=[]
operational_request_error recommended_treatment="question" exige impact="material" (B-01B) :
                          l'issue "M-01" est non matérielle et ne peut jamais être traitée par question.
```

→ **HTTP 502**, `operational_request_failure`, **aucun état sémantique** rendu au client.

Reproduit à l'identique par fixture synthétique, journal compris. `B01B_FAILURE_REPRODUCED = YES`.

---

## B. Le contrat B-01B

`normalizeRoleIssues` interdit `recommended_treatment="question"` sur une issue dont
`impact !== "material"`. La raison est écrite dans le code et n'a pas été rouverte :
`buildQuestionReviewTargets` filtre exactement sur `impact==="material" && recommended_treatment==="question"`.
Une issue non matérielle marquée « question » n'entre donc jamais dans `question_review_targets`,
n'est jamais examinée par `question_substitution_review` ni par `illegitimate_question_found` — un
contournement complet et silencieux de tout le mécanisme d'audit.

La fonction est **partagée par les trois rôles** : `Analyst.issues`,
`Critic.missed_material_issues`, `Arbiter.issues`. Elle existe pour fermer ce contournement
« aux trois niveaux à la fois ».

**`B01B_RULE_CHANGED = NO`.** Mêmes combinaisons refusées, même message, une seule écriture de la
règle.

---

## C, D, E. La taxonomie tranche elle-même

La question — sortie syntaxiquement valide mais contractuellement invalide : bug à nous, ou défaut
du modèle ? — est déjà répondue mot pour mot dans `provider-ha.js` :

> **STRUCTURED_OUTPUT_INVALID** : le provider a répondu, mais sa sortie est techniquement
> inexploitable (enveloppe non parsable, structured output absent, JSON invalide, **sortie refusée
> par la validation structurelle**). C'est un défaut de **CE modèle sur CET appel**, pas un
> désaccord sémantique.

> **PROGRAMMING_ERROR** : **défaut de notre propre code** (erreur non étiquetée, invariant interne
> rompu). Fail-closed immédiat : un bug ne doit jamais être masqué par une cascade de providers.

Un rejet B-01B est le premier cas, pas le second. Le validateur a **raison** de refuser ; ce qui est
fautif, c'est la sortie du modèle.

**`CONTRACTUAL_ERROR_CLASS = structured_output_invalid`.**

Pourquoi le mauvais classement, alors ? Par défaut, pas par décision. `normalizeRoleIssues` levait
une `TypeError` nue. `parseRoleOutput`, qui enveloppe l'Analyste et l'Arbitre, étiquette **tout**
échec de validation en `STRUCTURED_OUTPUT_INVALID`. Le pipeline Critic, lui, n'étiquette que ce qui
porte un marqueur explicite — et la règle par défaut de la taxonomie s'applique alors :
« une erreur non étiquetée est un PROGRAMMING_ERROR ».

---

## F, G. Ce que recevait le client — l'asymétrie, mesurée

Même issue, même règle, trois rôles, avant correction :

| Rôle produisant l'issue illégale | Classe | HTTP | État client |
| --- | --- | --- | --- |
| Analyste | `structured_output_invalid` | 200 | `degraded_state` |
| Arbitre | `structured_output_invalid` | 200 | `degraded_state` |
| **Critique** | **`programming_error`** | **502** | **aucun** |

Le 502 est le comportement que le contrat réserve à **nos** bugs. `degraded_state` est l'état OPRIE
canonique quand aucun fournisseur n'a pu servir un rôle. Ici, aucun fournisseur ne pouvait servir le
Critique : c'est un `degraded_state`.

---

## H. Le correctif minimal

Une fonction, six lignes, dans le validateur **partagé** :

```js
function assertRoleIssueContract(condition, message) {
  if (!condition) throw Object.assign(new TypeError(message), { output_contract_violation: true });
}
```

`normalizeRoleIssues` l'utilise à la place de `assert`. Le marqueur `output_contract_violation` est
la convention déjà en place — celle que `assembleSubstitutionReviews` pose depuis CSR-01, et que
`tagCriticPipelineFailure` lit **sans jamais inspecter un message d'erreur**.

Rien d'autre n'a été touché. Aucune règle, aucun prompt, aucun schéma, aucun routage, aucun plafond.
Les validations rendent exactement les mêmes verdicts qu'avant : seule change l'étiquette portée par
une erreur déjà levée.

**Ce que ce marqueur ne dit pas** : que *tout* rejet de `validateCriticOutput` soit un défaut de
modèle. CSR-01 avait tranché l'inverse pour les rejets non marqués, et cette question plus large
n'est pas rouverte ici. Ce lot corrige l'incohérence **prouvée**, sur la seule fonction que les trois
rôles partagent — pas une catégorie entière sur laquelle il n'a pas de mesure.

Après correction, les trois lignes du tableau § F sont identiques :
`structured_output_invalid` · 200 · `degraded_state`.

---

## I. Rejeu ciblé

**Fixture, déterministe.** Le même tour, avant et après, avec la même sortie de modèle :

| | Avant | Après |
| --- | --- | --- |
| B-01B rejette | oui | **oui** |
| Classe | `programming_error` | **`structured_output_invalid`** |
| HTTP | 502 | **200** |
| État client | aucun | **`degraded_state`** |
| READY fabriqué | non | **non** |
| Fournisseur de repli contacté | aucun | **aucun** |

Journal après correctif, à comparer mot pour mot avec celui du § A :

```
provider_ha_failure       role=critic  provider=anthropic  failure_class=structured_output_invalid
provider_ha_exhausted     role=critic  provider_order=["anthropic"]
operational_request_degraded role=critic
```

**Réel, sans épinglage.** Deux campagnes, 32 tours, Anthropic, `claude-sonnet-4-6` :

| | Campagne 1 | Campagne 2 (ciblée) |
| --- | --- | --- |
| Tours | 20 (14 matériau + 6 sans) | 12 (sans matériau) |
| Journal complet | 11 / 20 | **12 / 12** |
| HTTP 200 | 19 | **12** |
| `degraded_state` | 3 | 0 |
| READY fabriqué | 0 | 0 |

---

## J. Fréquence de production

Sur les **23 tours dont le journal a été intégralement capturé** :

| Compteur | Valeur |
| --- | --- |
| `B01B_VIOLATION_COUNT` | **0** |
| `PROGRAMMING_ERROR_COUNT` | **0** |
| `STRUCTURED_OUTPUT_INVALID_COUNT` | 0 |
| `TECHNICAL_FAILOVER_COUNT` | 2 |
| `CRITIC_SUCCESS_COUNT` | 19 |
| `FALSE_READY_COUNT` | **0** |

Les deux seules dégradations journalisées viennent d'un `anthropic_transport_error` — une panne de
transport du fournisseur, classée `technical_failover` et rendue en `degraded_state` 200. C'est le
comportement attendu, et il n'a rien à voir avec B-01B.

**La violation B-01B n'est pas réapparue.** Conformément au § 18 du cahier des charges, le prompt du
Critique n'est donc pas touché. `CRITIC_B01B_OUTPUT_CONFORMANCE_DEFECT = NO` sur les preuves
disponibles.

---

## K. Impact release

Le défaut nommé est fermé. Mais la campagne a laissé **un 502 que je n'ai pas pu attribuer**, et il
faut le dire tel quel plutôt que l'arrondir.

| | |
| --- | --- |
| Occurrences | **1 sur 32** tours après correctif |
| Cas | sans matériau |
| Latence | 54 094 ms — nettement sous les 75–98 s habituels de ce cas |
| Journalisé | **non** — `wrangler tail` n'a livré que 11 des 20 invocations de la campagne 1 |
| Reproduction | **12 tours ciblés sur exactement le même cas, journal complet : 12 × HTTP 200, zéro échec** |

**Est-ce le défaut que ce lot ferme ?** Rien ne le prouve, et deux faits plaident contre : le
correctif rend ce chemin déterministe — une violation B-01B produit désormais `degraded_state`, ce
qui est vérifié par fixture — et zéro violation B-01B apparaît sur les 23 tours journalisés.

**Mais je ne l'ai pas attribué.** La preuve est tombée hors de la fenêtre capturée, et douze
tentatives ciblées ne l'ont pas ramenée. Je ne peux ni le nommer, ni le reproduire, ni affirmer
qu'il est inoffensif. C'est un trou d'observabilité autant qu'un défaut possible.

---

## L. Verdict

**L'objectif du lot est atteint.** La classification était fausse, elle est corrigée sur l'argument
de la taxonomie elle-même ; B-01B rejette exactement comme avant ; les trois rôles se comportent
enfin identiquement sur la règle qu'ils partagent ; le client reçoit un état OPRIE au lieu d'un 502
muet ; le fail-closed, l'absence de repli et l'absence de READY fabriqué sont préservés et testés.

**Le Release Gate n'est pas autorisé pour autant.** Le cahier des charges exige « aucun 502
injustifié ». Il en reste exactement un, et il est injustifié au sens littéral : non expliqué. Je ne
vais pas le déclarer acceptable — ce jugement appartient au propriétaire, pas à moi.

`BLOCKING_DEFECT` (un seul) : **un 502 non attribué, 1 sur 32 tours après correctif, non reproduit en
12 tentatives ciblées, preuve perdue à l'échantillonnage de `wrangler tail`.**

`NEXT_SAFE_ACTION` : le rendre observable avant de le juger. Une campagne courte avec une capture de
journal fiable — plusieurs sessions `wrangler tail` courtes plutôt qu'une longue, ou une lecture des
journaux côté plateforme — suffit à trancher entre « incident intermittent du fournisseur, déjà
correctement dégradé ailleurs » et « seconde classe de rejet de sortie encore mal étiquetée ». Cette
seconde hypothèse a un nom précis et une adresse : les rejets de `validateCriticOutput` que CSR-01 a
délibérément laissés en `programming_error`, et que ce lot n'a pas rouverts faute de mesure.
