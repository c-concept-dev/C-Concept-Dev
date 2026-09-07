# DEEP-INTERACTION-LATENCY-01

**Diagnostic complet, aucune expérience, zéro appel API, zéro ligne de production modifiée.**

## Ce que la mesure dit

La latence Deep n'est pas un problème d'orchestration, de reprises ou de fournisseur.
Elle est, à quelques pour cent près, une **fonction linéaire des jetons que les rôles écrivent**.

| tour | jetons de sortie | latence |
|---|---|---|
| R09 | 651 | 1,6 s |
| Q08 | 5 217 | 79 s |
| A02 | 17 812 | **218 s** |

Deux jeux de mesures indépendants donnent la même loi : ~13 ms/jeton sur l'un, ~19 ms/jeton sur
l'autre, monotone sur deux ordres de grandeur.

Ce qui rend la clarification lente n'est donc pas qu'elle réfléchisse mal. C'est qu'elle **écrit
3,7 fois plus** qu'un tour qui produit un livrable.

## Où va le temps

Sur les tours lents, **le Critique produit 52 à 86 % de toute la sortie** — 83 % sur A02, 86 % sur A01.

Le mécanisme est exact et sans mystère : les appels de Critique valent `1 + (nombre d'issues Analyst
material+question)`, car le plan de batch tient exactement une cible. 13 appels = 12 issues.

Et une seule question est posée par tour.

**Le Critique instruit donc douze questions pour en poser une.**

## Les trois causes du §8

| cause | verdict |
|---|---|
| A — inflation des issues Analyst | **CONFIRMED** |
| B — mécanique des batches | **CONTRIBUTING** — amplificateur fidèle, jamais cause |
| C — capacité / backoff / 429 | **NOT_OBSERVED** — 0 refus 429, 0 troncature |

§31 ne s'applique pas : il n'y a pas de problème fournisseur à ne pas déguiser.

## L'arrêt le plus précoce qui reste sûr

Dès qu'une issue matérielle survit au Substitution Gate comme non substituable, `READY` devient
**logiquement impossible**, et la question suivante est déterminée — parce que l'Analyste a déjà
classé les candidats par priorité, et parce que le code déclare les revues **strictement
auto-contenues** : la revue de l'issue *k* ne peut pas modifier le verdict de l'issue *j*.

Les revues suivantes ne peuvent donc changer ni l'état, ni la question, ni la provenance, ni la
substituabilité. Ce n'est ni un score ni un seuil : c'est une propriété logique du contrat existant.

`EARLY_STOP_SAFE = YES`. `EARLY_STOP_IMPLEMENTED = NO`.

## Pourquoi il n'a pas été implémenté

`assembleSubstitutionReviews` exige **une revue par cible, ni plus ni moins**, et refuse toute cible
non couverte. Un early-stop violerait ce contrat — exactement le mécanisme que
DEEP-OUTPUT-ROBUSTNESS-01 vient de fiabiliser.

Le lever demande de remplacer « une revue par cible » par « une revue par cible **examinée**, liste
explicite ». C'est un changement de contrat sémantique structurel, que la gouvernance de ce lot me
défend de faire seul.

## Ce que l'early-stop donnerait, et ce qu'il ne donnerait pas

| tour | avant | projeté | appels |
|---|---|---|---|
| A02 | 218 s | ~60 s | 15 → 4 |
| A01 | 137 s | ~42 s | 11 → 4 |
| Q02 | 90 s | ~54 s | 7 → 4 |
| Q08 | 79 s | ~54 s | 6 → 4 |

Queue divisée par trois. Mais le **plancher resterait de 33 à 60 secondes** — l'Analyste seul écrit
21 secondes sur la population ouverte. L'objectif « quelques secondes » du §29 est hors d'atteinte
de **toute** modification d'orchestration : il faudrait réduire ce que les rôles écrivent, donc
toucher aux prompts, ce que §17 et §22 interdisent ici.

Ces chiffres sont des **projections** dérivées de la loi mesurée. Aucune expérience n'a été menée.
