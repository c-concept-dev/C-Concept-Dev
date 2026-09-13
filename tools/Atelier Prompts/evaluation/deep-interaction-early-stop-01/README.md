# DEEP-INTERACTION-EARLY-STOP-01

**`EARLY_STOP_PASS`.** Le tour cesse d'instruire les questions suivantes dès que la prochaine est prouvée.

## Le déclencheur

Ni seuil, ni score, ni compteur : une propriété logique du contrat.

Une cible est prouvée dernier recours quand sa revue est **structurellement valide**, que le
**Substitution Gate déterministe** a été appliqué, qu'**aucune alternative de la ladder ne survit**,
et que **toutes les cibles de priorité supérieure sont résolues validement**. À ce point `READY` est
logiquement impossible et la question suivante est déterminée.

Trois refus d'arrêter, hérités de Q02 : échec technique, sortie invalide, matérialisation qui lève.
**On ne s'arrête jamais sur une absence de preuve.**

## Ce que la concurrence peut et ne peut pas changer

Elle décide de **combien de travail spéculatif était déjà parti**. Elle ne décide de **rien d'autre**.

C'est pourquoi la sortie autoritaire est tronquée à la cible gagnante : un batch spéculatif de la
même vague peut terminer, il n'entre pas dans `question_substitution_review`. `T-ESO01-B` le prouve
par `deepEqual` entre `concurrency=1` et `concurrency=2`.

| | avant | après |
|---|---|---|
| résultat gouverné séq. == conc. | invariant | **invariant conservé** |
| nombre d'appels séq. == conc. | invariant | remplacé par « la concurrence ne peut qu'ajouter du déjà-en-vol » |
| toutes les tâches tentées | invariant | remplacé par « toutes les tâches *requises* » |

## Mesure Sonnet réelle — 8 tours, 39 appels, 1,1483 USD

| cas | batches | latence | état |
|---|---|---|---|
| A01 | 3 → **2** | 92,6 s → 74,4 s | `clarification_required` des deux côtés |
| Q07 | 3 → **2** | 83,5 s → 74,9 s | idem |
| Q02 | 1 → 1 | 75,7 s → 60,4 s | idem — une seule cible, rien à arrêter |
| Q08 | 1 → 2 | 57,0 s → 62,7 s | idem — l'Analyste a émis une cible de plus |

**4/4 états identiques. 0 faux READY. 0 intrant inventé.**

Sur les cas où l'arrêt s'applique : batches **−33 %**, latence **−15,1 %**, coût **−17,4 %**.

**Limite à déclarer** : l'Analyste est byte-identique dans les deux variantes et produit pourtant des
plans différents (Q08). Avec un tour par cellule, la campagne montre une direction, pas une
attribution. La preuve du mécanisme est déterministe — `T-ESO01-A` à `H` —, pas statistique.

## Une surprise

Les 16 tests M-02/M-03 passent **sans aucune modification de leurs assertions**. Leur fixture
portait encore la forme d'avant X2-C.4, que le Gate ne lit plus : toutes leurs familles étaient
rejetées, chaque cible ressortait « dernier recours », et ces tests de concurrence déclenchaient
l'arrêt au premier batch. Fixture corrigée, leurs invariants historiques survivent intacts.
L'autorisation de les redéfinir n'a pas eu besoin d'être exercée.
