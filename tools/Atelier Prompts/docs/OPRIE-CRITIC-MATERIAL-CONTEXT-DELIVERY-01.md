# OPRIE-CRITIC-MATERIAL-CONTEXT-DELIVERY-01 — Une ligne, et le veto disparaît

Le lot précédent avait établi que le Critique de production ne reçoit pas `material_context`, et
que la règle d'ancrage écrite deux lots plus tôt était donc inerte. Ce lot livre le champ. Le faux
veto disparaît, mesuré sur les mêmes trente tours.

---

## A. Le chemin manquant, prouvé

`/operational-request` route **toujours** le rôle Critique vers `CRITIC_PIPELINES`, donc vers le
pipeline batché et `makeCriticGlobalUserMessage`. `runRoleWithAnthropic("critic", …)` existe, il
est testé, la production ne l'emprunte jamais.

| | avant | après |
| --- | --- | --- |
| Clés du message Critique de production | `original_request`, `clarification_history`, `analyst_output`, `previous_vetoes` | + **`material_context`** |
| `deep_content_available` visible | non | **oui** |
| Contenu brut | absent | **absent** |

---

## B. Les deux constructeurs

| | `makeCriticUserMessage` (simple) | `makeCriticGlobalUserMessage` (production) |
| --- | --- | --- |
| Portait `material_context` | oui, depuis `MATERIAL-CONTEXT-02` | **non** → **oui** |
| Emprunté par `/operational-request` | non | **oui** |

Leur contrat `material_context` est désormais **aligné** : même champ, même normalisation,
absence valant `unknown`. Le reste de leurs responsabilités diffère et n'a pas été touché.

---

## C. Le correctif minimal

Deux endroits, aucune sémantique nouvelle, aucun champ nouveau :

1. `makeCriticGlobalUserMessage` accepte et émet `material_context`, normalisé comme ailleurs.
2. `runCriticBatchedPipeline` le transmet à `executeGlobal` — **et à elle seule** : la review de
   substitution juge la substituabilité des questions, jamais la provenance ; aucune de ses règles
   n'emploierait ce champ.

**La règle d'ancrage n'a pas été retouchée.** Elle conditionne l'acceptation à
`deep_content_available === true` ; cette condition est simplement devenue évaluable.

---

## D. Preuve tour par tour

Une trace metadata a été ajoutée — **dans l'orchestrateur**, pas dans le noyau : `T-CLEAN03-10`
compte les journaux worker embarqués dans le bundle navigateur, et un journal placé dans le core en
aurait créé un troisième. La garde a refusé la première tentative, à raison.

```
critic_global_material_context_observation
  critic_global_material_context_present
  critic_global_deep_content_available
```

Deux booléens, jamais un octet de matériau. **30 tours sur 30** portent la preuve, tous avec
`deep_content_available = true`, tous les rôles servis par Anthropic.

---

## E. Couverture de test

`tests/critic-material-context-delivery-cmcd01.test.mjs`, huit assertions, dont celles qui
manquaient :

| | |
| --- | --- |
| `T-CMCD01-01` | le constructeur **de production** émet `material_context` ; absent, il vaut `unknown` |
| `T-CMCD01-02` | simple et batché ne divergent plus sur ce champ |
| `T-CMCD01-03` | le pipeline le transmet à l'étape globale, et **pas** à la review de substitution |
| `T-CMCD01-03B` | `true`, `false` et `unknown` se propagent ; la trace les reflète |
| `T-CMCD01-04` | vérifié sur le **corps réellement émis** vers les trois fournisseurs |
| `T-CMCD01-05` | aucun contenu brut, même quand `material_content` est présent en entrée |
| `T-CMCD01-06` | la règle d'ancrage est intacte, sa condition est désormais évaluable |
| `T-CMCD01-07` | la review de substitution reste inchangée, délibérément |

**La leçon est gravée dans le fichier** : deux lots ont été crus appliqués parce qu'un test vert
portait sur un chemin mort.

---

## F, G, H. Rejeu de trente tours

Même cas, même fournisseur, même modèle, `temperature: 0`, mêmes paramètres, seul le correctif
diffère.

| | avant | après |
| --- | --- | --- |
| Tours | 30 | 30 |
| Techniquement dégradés | 0 | 1 |
| **`ANALYST_CONFORMANT_RUNS`** | 16 | **16** |
| **`P(ACCEPT │ conforme)`** | **0 / 16 = 0 %** | **10 / 16 = 62,5 %** |
| `operational_request_ready` | 0 / 30 | **11 / 30** |
| Fait conservé dans le candidat final de l'Arbitre | 0 / 30 | **8 / 30** |
| Lecture Analyste | 16 / 30 | 16 / 30 |

La population conforme est **identique** (16/30) : ce lot n'a rien changé à la lecture de
l'Analyste, et le taux de 53,3 % est reproduit à l'unité près.

---

## I. Faux veto d'absence

| | |
| --- | --- |
| `CRITIC_WRONG_MATERIAL_ABSENCE_VETO_COUNT` avant | **11 / 16** |
| après | **0** |

C'est le critère du §45, et il est atteint. Le Critique n'affirme plus qu'aucun matériau n'a été
transmis, parce qu'il sait désormais qu'il l'a été.

---

## J. Vetos de phase — ce qui reste

Sur les seize tours conformes :

| Classement | n |
| --- | --- |
| `ACCEPT` | 10 |
| `PHASE_SEMANTICS` | **4** |
| `OTHER_SEMANTIC` | 2 |
| `WRONG_MATERIAL_ABSENCE` | **0** |

Les vetos résiduels portent **majoritairement sur la phase** : inscrire la valeur dans
`expected_deliverable` *« confond la phase de préparation et la phase d'exécution »*. Conformément
au §46, ce lot ne les corrige pas et confirme le suivant.

---

## K. Dégradations techniques

**1 / 30**, isolée, comptée séparément et exclue de la population sémantique.

---

## Faux READY — un cas, et il est indécidable ici

Onze tours atteignent `operational_request_ready`. **Dix** portent la valeur exacte, lue dans le
matériau, avec la provenance correcte : ils sont légitimes sans discussion.

**Le onzième (run 22) mérite d'être exposé plutôt que compté.** L'Analyste n'y a pas lu le
matériau — provenance `explicit_user_statement` seule, aucune valeur dans le candidat — et la
chaîne a néanmoins déclaré la demande prête : *« l'objectif est clair, le livrable est précis, la
contrainte de restitution fidèle est explicite et tracée »*.

Rien n'y est fabriqué : aucun numéro inventé, aucune provenance mensongère. La question est de
savoir si une demande d'extraction est prête **sans** que la valeur figure dans le candidat, le
matériau étant disponible pour l'exécution.

| Lecture | Statut du run 22 |
| --- | --- |
| Le candidat doit porter la valeur | faux READY |
| Le candidat décrit le livrable, l'exécutant lit le matériau | **comportement correct** |

C'est exactement la question que les quatre vetos de phase posent, et que ce lot ne tranche pas.
`FALSE_READY_REGRESSION_COUNT = 0` **fabriqué** ; un cas suspendu à la définition de
`expected_deliverable`. Il devra être rejugé par le lot suivant, dans un sens ou dans l'autre.

---

## L. Limites

1. **`expected_deliverable` reste sans définition** — quatre vetos sur seize en dépendent.
2. **La lecture de l'Analyste reste à 53,3 %** : c'est désormais le plafond du système, et ce lot
   n'y touche pas.
3. **La review de substitution ne reçoit pas `material_context`** — choix délibéré, aucune de ses
   règles ne l'emploierait aujourd'hui.
4. **`FALSE_PROVENANCE_CONTROL` n'est pas constructible de bout en bout** : l'Analyste n'émet jamais
   `user_provided_material` quand aucun contenu n'est transmis (0 sur 6 contrôles mesurés au lot
   précédent). La règle d'incohérence est vérifiée au niveau du contrat, pas en production.

---

## M. Verdict

**PASS.**

Le chemin réel est confirmé, le champ est livré, `true`/`false`/`unknown` se propagent, aucun
contenu brut n'atteint le Critique ni l'Arbitre, la règle d'ancrage n'a pas bougé, et le faux veto
d'absence est passé de onze sur seize à **zéro**. L'acceptation du Critique sur les tours conformes
passe de 0 % à 62,5 %, et le système produit pour la première fois des états `READY` sur un fait
matériau : onze sur trente.

---

## N. Prochaine action sûre

**`OPRIE-EXPECTED-DELIVERABLE-SEMANTICS-01`.** Les vetos résiduels sur les tours conformes portent
majoritairement sur le champ, pas sur le matériau. Il faut définir ce que `expected_deliverable`
contient — la forme du livrable, ou les paramètres nécessaires à sa production — et décider où un
fait matériau doit être porté. C'est une décision de contrat, du même ordre que l'extension du
vocabulaire de provenance, sur un champ qui n'est défini nulle part aujourd'hui.

Ensuite seulement, `OPRIE-MATERIAL-READING-CONFORMANCE-01` : les 53,3 % de lecture deviendront le
plafond une fois la sémantique de phase tranchée.
