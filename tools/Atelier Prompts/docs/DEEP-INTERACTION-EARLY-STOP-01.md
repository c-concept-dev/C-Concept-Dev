# DEEP-INTERACTION-EARLY-STOP-01

> Une fois la prochaine question nécessaire prouvée, on la pose.
> On n'instruit pas aujourd'hui ce que l'utilisateur clarifiera au prochain tour.

**`EARLY_STOP_PASS`** — `SEMANTIC_PASS = YES`, `PERFORMANCE_GAIN = YES`,
`CONVERSATIONAL_CONTRACT = PASS`. 8 tours Sonnet réels, 39 appels, **1,1483 USD**.

## 1. Le déclencheur

Ni seuil, ni score, ni compteur de batches, ni délai. Une propriété logique du contrat :

1. la revue de la cible est **structurellement valide** — `materializeSubstitutionReviewFromCandidates`
   ne lève pas ;
2. le **Substitution Gate déterministe** est appliqué à cette revue ;
3. **aucune famille de la ladder ne survit** comme raisonnablement disponible ;
4. **toutes les cibles de priorité supérieure sont résolues validement**.

À ce point `READY` est logiquement impossible, et la question suivante est déterminée : les cibles
restantes sont de priorité inférieure, et chaque revue est strictement auto-contenue.

> **Une contradiction du brief, levée.** Le §3 demandait « `GATE_PASS` **et**
> `question_is_last_resort` ». Or le Gate n'ACCEPTE une alternative que lorsque la question n'est
> *pas* dernier recours : la conjonction littérale décrit un état impossible. Le §2 de la décision
> propriétaire a tranché dans le même sens que ma lecture — le Gate est **évalué**, et son verdict
> laisse la question comme dernier recours.

**Trois refus d'arrêter**, hérités de Q02 mesuré en réel : un échec technique, une sortie
structurellement invalide, une matérialisation qui lève. On ne s'arrête jamais sur une absence.

## 2. Vagues bornées, et l'invariant qui compte

L'exécution se fait par vagues de taille `concurrency`. À l'intérieur, rien ne change : mêmes appels
simultanés, même borne (`max_inflight = 2` chez Anthropic), même ordre, même réassemblage par index.
Entre deux vagues, l'arrêt est évalué. **Aucune vague nouvelle après la preuve.**

La clé technique est ailleurs : **la sortie autoritaire est tronquée à la cible gagnante.** Un batch
spéculatif de la même vague peut terminer — il n'entre pas dans `question_substitution_review`.
Sans cette troncature, `concurrency=2` produirait un jeu de revues différent de `concurrency=1`, et
la borne de débit deviendrait une autorité sémantique.

| invariant | sort |
|---|---|
| résultat gouverné séquentiel == concurrent | **conservé**, prouvé par `deepEqual` (T-ESO01-B) |
| nombre d'appels séquentiel == concurrent | remplacé — la concurrence ne peut qu'ajouter du déjà-en-vol |
| toutes les tâches tentées | remplacé — toutes les tâches **requises** |

Un échec sur une cible de priorité supérieure ou égale à la gagnante reste pleinement gouverné. Un
échec spéculatif ne dégrade jamais une clarification déjà établie (`T-ESO01-E`).

## 3. Mesure Sonnet réelle

| cas | batches | sortie | latence | coût | état |
|---|---|---|---|---|---|
| A01 | 3 → **2** | 6 110 → 5 179 | 92,6 s → 74,4 s | 0,197 → 0,159 | `clarification_required` ↔ |
| Q07 | 3 → **2** | 5 081 → 4 791 | 83,5 s → 74,9 s | 0,178 → 0,151 | ↔ |
| Q02 | 1 → 1 | 3 862 → 3 174 | 75,7 s → 60,4 s | 0,119 → 0,108 | ↔ |
| Q08 | 1 → 2 | 2 849 → 3 892 | 57,0 s → 62,7 s | 0,102 → 0,135 | ↔ |

**4/4 états identiques. 0 faux READY. 0 intrant inventé. 0 divergence critique.**

Sur les deux cas où l'arrêt s'applique : batches **−33 %**, sortie de batch **−33 %**, latence
**−15,1 %**, coût **−17,4 %**. Sur l'agrégat des quatre : appels de batch −12,5 %, latence −11,7 %,
coût −7,3 %.

**Limite déclarée.** Q08 porte *plus* de batches en candidate qu'en baseline : l'Analyste — dont le
code est identique dans les deux variantes — y a émis deux cibles au lieu d'une. Un arrêt anticipé
ne peut qu'en retirer ; c'est du non-déterminisme de génération. Avec un tour par cellule, la
campagne montre une direction, **pas une attribution**. La preuve du mécanisme est déterministe
(`T-ESO01-A` à `H`), pas statistique.

Sur A01, les deux variantes posent une question différente — les villes d'un côté, le livrable
attendu de l'autre. Les deux sont légitimes sur une demande ouverte sans matériau, aucune n'invente
d'intrant, et l'origine est encore l'Analyste. Non critique.

## 4. Les tests

Huit tests obligatoires, tous verts : `T-ESO01-A` à `H`. Les deux qui comptent le plus sont **B**
— le résultat gouverné est `deepEqual` entre `concurrency=1` et `2` — et **D** — une cible de rang
inférieur ne peut jamais conclure à la place d'une priorité supérieure non résolue.

**Aucune assertion sémantique n'a été affaiblie.** Ce sont des **fixtures** qui ont été remises au
contrat courant. Le cas le plus instructif : les helpers de M-02 et M-03 produisaient encore la
forme d'avant X2-C.4 (`treatment` / `available` / `substitution_value`…), que le Gate ne lit plus.
Toutes leurs familles étaient donc rejetées, chaque cible ressortait « dernier recours », et ces
tests de **concurrence** déclenchaient l'arrêt au premier batch. Une fois la fixture corrigée, les
**16 tests M-02/M-03 passent sans qu'une seule de leurs assertions ait bougé** — y compris
`T-M02-20` et `T-M02-31`. L'autorisation de les redéfinir n'a finalement pas eu besoin d'être
exercée : en l'absence d'arrêt, le comportement historique est inchangé.

Même traitement pour R1, R2, R2.1, R3B, R5.2, X2C1, X2C4 et XB, dont les fixtures demandaient
explicitement « aucune alternative disponible ». `XB-29` voit son compte d'`illegitimate_question_found`
passer de 1 à 4 — conséquence directe et documentée de sa nouvelle fixture. `X2C3-14` et `X2C3-15`
conservent délibérément l'absence d'alternative : c'est leur sujet.

## 5. Vérifications

`GLOBAL` **2973/2973**, trois fois. `FROZEN` 7 empreintes. `BROWSER_RUNTIME` régénéré.
`SECRET_SCAN` propre. `ROUTING` couvert par GLOBAL. Aucun rôle, routeur, modèle, cache ou seuil
introduit ; Analyste, Critique global, Arbitre et chemin READY inchangés.
