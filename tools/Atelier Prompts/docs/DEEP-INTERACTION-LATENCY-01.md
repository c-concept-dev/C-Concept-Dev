# DEEP-INTERACTION-LATENCY-01

> Le Critique instruit douze questions pour en poser une.
> C'est là qu'est la minute.

Diagnostic complet. **Aucune expérience, 0 appel API, 0 ligne de production modifiée.**
Verdict : `INTERACTION_LATENCY_PARTIAL_OWNER_DECISION_REQUIRED`.

## 1. La loi

La latence Deep n'est pas gouvernée par le nombre d'appels, ni par les reprises, ni par le
fournisseur. Elle est une fonction linéaire des **jetons que les rôles écrivent**.

| tour | jetons de sortie | latence | ms/jeton |
|---|---|---|---|
| R09 | 651 | 1 559 ms | 2,4 |
| R03 | 900 | 11 454 ms | 12,7 |
| Q01 | 2 829 | 39 412 ms | 13,9 |
| Q08 | 5 217 | 79 083 ms | 15,2 |
| A01 | 12 569 | 136 744 ms | 10,9 |
| A02 | 17 812 | **218 533 ms** | 12,3 |

Un second jeu de mesures, pris à une autre date sur une autre population, donne la même loi à
18–19 ms/jeton par étage. Monotone sur deux ordres de grandeur.

La conséquence est directe : **toute seconde gagnée doit venir d'un jeton non écrit.** Accélérer
l'écriture n'est pas à notre portée ; ne pas l'écrire l'est.

Et la population qui rend une **clarification** écrit **3,7 fois plus** que celle qui rend un
livrable — 4 180 jetons contre 1 135. Le tour le moins productif est le plus coûteux.

## 2. Où va le temps

Sur les tours lents, le **Critique produit 52 à 86 % de toute la sortie du tour** : 83 % sur A02,
86 % sur A01, 66 % sur Q02, 64 % sur Q08.

Le mécanisme est exact. `buildQuestionReviewTargets` retient les issues Analyst portant
`impact = material` **et** `recommended_treatment = question`. `maxAnswerableTargetsPerBatch()` vaut
1 — une cible, un batch, un appel. Donc :

```
appels de Critique = 1 (global) + nombre d'issues material+question
```

13 appels sur A02 = 12 issues. 9 sur A01 = 8 issues. 1 sur R09 = aucune.

**Et une seule question est posée par tour.** Le prompt Analyste l'énonce : « un rôle ultérieur ne
retient toujours qu'UNE seule prochaine question effectivement posée ».

Le Critique instruit donc douze dossiers pour en plaider un.

## 3. Les trois causes

| cause | verdict | preuve |
|---|---|---|
| A — inflation des issues Analyst | **CONFIRMED** | le compte d'appels est exactement le compte d'issues |
| B — mécanique des batches | **CONTRIBUTING** | découpage déterministe et dérivé ; amplificateur fidèle, jamais cause |
| C — capacité / backoff / 429 | **NOT_OBSERVED** | 0 refus 429 sur 12 tours, 0 dans le lot capacité, 0 troncature |

Les reprises existent (2 sur A02) mais ne corrèlent pas : R01 en porte 2 et ne met que 9 s.
`RETRY_OR_REGENERATION_CONTRIBUTION = LOW`.

**§31 ne s'applique pas** : il n'y a pas de problème fournisseur qu'une modification d'orchestration
viendrait masquer.

## 4. L'arrêt le plus précoce qui reste sûr

`EARLIEST_SAFE_CLARIFICATION_POINT` — dans `runCriticBatchedPipeline`, à la fin du **premier** batch
dont l'entrée conclut `question_is_last_resort = true` après passage du Substitution Gate, les
cibles étant traitées dans l'ordre de priorité fixé par l'Analyste.

La démonstration tient en trois lignes du contrat existant :

1. Une seule question est posée par tour.
2. L'Analyste classe les candidats par valeur informationnelle décroissante — « la première est
   celle qu'un rôle ultérieur retiendra en priorité ».
3. Le code déclare les revues **strictement auto-contenues** : « une seule entrée de
   `question_substitution_review`, indépendamment des autres ».

Donc dès qu'une issue matérielle survit comme non substituable, `READY` est **logiquement
impossible** et la question suivante est **déterminée**. Les revues des cibles de priorité
inférieure ne peuvent changer ni l'état, ni la question, ni la provenance, ni la substituabilité.

Ce n'est ni un score, ni un seuil, ni une heuristique, ni une autorité nouvelle : c'est une
propriété logique de ce qui est déjà écrit.

`EARLY_STOP_SAFE = YES`.

## 5. Pourquoi il n'est pas implémenté

`assembleSubstitutionReviews` refuse toute cible non couverte — *« issue(s) manquante(s), aucun
batch ne les a couvertes »* — et le validateur exige *« une revue par issue material+question, ni
plus ni moins »*.

Un early-stop laisserait des cibles non couvertes et serait rejeté comme une violation de contrat de
sortie du modèle : précisément le mécanisme que DEEP-OUTPUT-ROBUSTNESS-01 vient de fiabiliser.

Le lever exige de remplacer « une revue par cible » par « une revue par cible **examinée**, et la
liste des cibles examinées est explicite ». C'est un changement de **contrat sémantique
structurel** — et ce contrat de cardinalité est ce qui rend la revue de substitution auditable.

La gouvernance de ce lot me défend de le faire seul. Je m'arrête donc ici, la conception faite.

## 6. Ce que cela donnerait — et ce que cela ne donnerait pas

| tour | avant | projeté | appels |
|---|---|---|---|
| A02 | 218 s | ~60 s | 15 → 4 |
| A01 | 137 s | ~42 s | 11 → 4 |
| Q02 | 90 s | ~54 s | 7 → 4 |
| Q07 | 86 s | ~58 s | 6 → 4 |
| Q08 | 79 s | ~54 s | 6 → 4 |
| Q01 | 39 s | ~35 s | 5 → 4 |

Sans effet sur R01, R02, R03, R08, R09 et A03 : ces tours ne portent aucune revue excédentaire.

**Le plancher resterait de 33 à 60 secondes.** Il se compose de l'Analyste (536–1 066 jetons), du
Critique global (~800), d'une revue (333–1 250) et de l'Arbitre (828–1 894), en série à ~13 ms le
jeton.

L'objectif « quelques secondes » du §29 est **hors d'atteinte de toute modification
d'orchestration** : sur la population ouverte, supprimer intégralement l'Arbitre *et* tous les
batches laisserait encore 21 secondes, parce que l'Analyste seul écrit 1 340 jetons. Descendre plus
bas signifie réduire ce que les rôles écrivent — donc toucher aux prompts, ce que §17 et §22
interdisent ici.

Ces chiffres sont des **projections** dérivées de la loi mesurée. Aucune n'a été vérifiée par un
appel réel.

## 7. Sur l'Arbitre

`ARBITER_ALWAYS_REQUIRED = INCONCLUSIVE`, et je ne prétends pas mieux. Les traces portent l'état
final, jamais l'état intermédiaire Analyste+Critique auquel le comparer : mesurer combien de fois
l'Arbitre **change** la convergence demanderait une instrumentation que §7 n'autorise pas ici.

Ce qui est mesuré, en revanche : sur les tours de clarification, l'Arbitre écrit 828 à 1 894 jetons,
soit 11 à 46 % de la sortie du tour — 11 à 25 secondes.

Une observation contractuelle mérite d'être notée. Le prompt Analyste envisage explicitement un
chemin sans Arbitre : *« l'Arbitre s'il est appelé, ou le mécanisme qui sélectionne la prochaine
question lorsqu'il n'est pas appelé »*. **Aucun tel mécanisme n'existe dans le code** — l'Arbitre est
appelé inconditionnellement. Le contrat a laissé une porte ouverte que l'implémentation n'a jamais
franchie. Je ne la franchis pas non plus.

## 8. Décision demandée

1. **Autoriser le changement du contrat de cardinalité** de la revue de substitution — condition
   nécessaire à tout early-stop. Sans cela, aucune des réductions ci-dessus n'est atteignable.
2. **Accepter qu'une clarification restera de l'ordre de 30 à 60 secondes**, même après early-stop,
   et que descendre plus bas exigerait un lot dédié touchant aux prompts.

`NEXT_SAFE_ACTION = STOP — OWNER DECISION`
