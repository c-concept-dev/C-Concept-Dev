# OPRIE-CRITIC-MATERIAL-AWARENESS-01 — Il ne l'ignorait pas, il ne l'avait jamais

Le lot précédent avait mesuré un refus du Critique sur seize cas sur seize, alors que l'Analyste
faisait exactement ce que le contrat demande. La question posée ici était : pourquoi refuse-t-il,
puisqu'il reçoit `material_context.deep_content_available = true` ?

**Il ne le reçoit pas.**

**Aucun code de production n'a été modifié.**

---

## A. Point de départ mesuré

| | |
| --- | --- |
| Tours | 30, Anthropic, `temperature: 0`, bruit technique nul |
| Analyste conforme | 16 / 30 — fait lu, valeur exacte, portée au candidat, provenance `user_provided_material` |
| Acceptation du Critique | **0 / 16** |
| Succès final | 0 / 30 |

---

## B. Ce que le Critique reçoit réellement

Capture du corps émis vers le fournisseur, par le chemin **que la production emprunte**.

```
clés du message Critique : original_request, clarification_history, analyst_output, previous_vetoes
material_context           : ABSENT
deep_content_available     : ABSENT
user_provided_material     : visible (dans analyst_output.provenance_records)
contenu brut               : absent
```

**`MATERIAL_CONTEXT_PRESENT_IN_FINAL_CRITIC_INPUT = NO`.**

Le Critique voit donc une provenance qui affirme qu'un fait vient d'un matériau, et n'a **aucun
moyen** de savoir qu'un matériau a été transmis. Son veto *« aucun matériau n'a été transmis »*
n'est pas de l'entêtement : il est **littéralement vrai de son entrée**.

---

## C. Pourquoi la capture précédente disait le contraire

Il existe deux chemins Critique, et deux constructeurs de message :

| | `makeCriticUserMessage` | `makeCriticGlobalUserMessage` |
| --- | --- | --- |
| Émet `material_context` | **oui** | **non** |
| Emprunté par `/operational-request` | **non** | **oui** |

`runRoleWithHaChain` route le rôle `critic` vers `CRITIC_PIPELINES`, donc vers le pipeline
**batché**, toujours — jamais vers `runRoleWithAnthropic("critic", …)`. Le chemin simple existe,
il est testé, et la production ne l'emprunte pas.

**Une lacune de test l'avait masqué.** `T-MPROV02-10`, écrit au lot précédent, vérifiait la
présence de `material_context` dans le message du Critique — via le constructeur **simple**. Il
passait, et il ne prouvait rien du chemin réel.

---

## D. La règle d'ancrage est inerte

`OPRIE-MATERIAL-PROVENANCE-02` a donné au Critique cette règle, dans les deux prompts :

> *« Un élément portant la provenance `user_provided_material` est ancré dans ce matériau : son
> absence de `original_request` et de `clarification_history` n'est donc pas en soi un défaut
> **lorsque `material_context.deep_content_available` vaut `true`** »*

La condition porte sur un champ que le Critique de production ne reçoit jamais. **La règle ne peut
donc jamais s'appliquer.** Elle a été écrite, déployée, testée sur le chemin simple — et elle est
sans effet là où elle compte.

C'est ce qui explique le `0 / 16` sans rien invoquer d'autre.

---

## E. Sémantique de phase — réelle, et secondaire

Cinq des seize vetos ne portent pas sur l'absence de matériau mais sur le **champ** : inscrire la
valeur dans `expected_deliverable` *« confond la phase de préparation et la phase d'exécution »*.

Cette objection est fondée sur une règle qui existe, et qui précède `material_content` :

> Analyste — *« Vous ne rédigez jamais le livrable final »*
> Critique — *« Vous ne rédigez jamais le livrable »*

Quand la demande est une extraction, le livrable **est** la valeur. L'inscrire dans le candidat
revient donc, littéralement, à produire le livrable pendant la préparation.

---

## F. Matrice du champ candidat

Sur les 16 tours conformes :

| | n |
| --- | --- |
| Valeur nommée dans `expected_deliverable` par l'Arbitre | 11 |
| Champ non nommé dans la raison | 5 |
| Champs porteurs d'une provenance : `objective` + `expected_deliverable` + `confirmed_constraints` | 9 |
| Champs porteurs d'une provenance : `objective` + `expected_deliverable` | 7 |

**Familles de veto sur ces 16 tours :**

| Famille | n |
| --- | --- |
| phase préparation / exécution | 5 |
| matériau déclaré absent | 4 |
| variantes de la même absence | 3 |
| ancienne règle des deux sources | 2 |
| disponibilité non confirmée | 2 |

Onze des seize vetos relèvent de l'absence de `material_context` ; cinq relèvent du champ.

---

## G. `expected_deliverable` n'est défini nulle part

| Où | Ce qu'on trouve |
| --- | --- |
| `core/adn/operational-request-state.js` | un nom dans `CANDIDATE_SCALAR_FIELDS` |
| Schéma JSON | aucun `description` |
| Prompt Analyste | le nom du champ n'apparaît pas |
| Prompts Critique | le nom du champ n'apparaît pas |

**Même motif que le vocabulaire de provenance :** le champ existe, son sens n'existe pas. On ne
peut donc pas **prouver** que le placement est faux — seulement constater qu'il est contestable, et
que le Critique le conteste.

`ANALYST_FIELD_PLACEMENT_CONTRACTUALLY_CORRECT = AMBIGUOUS`.

---

## H. Tests Critique isolés

**Non exécutés.** Le §24 demandait de tester le Critique indépendamment de l'instabilité de
lecture de l'Analyste. La capture du §B rend la mesure sans objet : quelle que soit la sortie
d'Analyste injectée, le Critique de production ne recevra pas `material_context`, donc ne pourra
pas appliquer la règle. Dix répétitions auraient reproduit une cause déjà établie par lecture
directe du corps émis.

Il n'existe par ailleurs aucune route HTTP `/critic` : un test réellement isolé exigerait d'en
ajouter une, ce que ce lot n'autorise pas.

---

## I. Correctif

**Aucun, et c'est la conclusion.**

Le correctif nécessaire est d'ajouter `material_context` au message du Critique batché — une
ligne, symétrique de ce que le constructeur simple fait déjà. Ce n'est ni un prompt, ni de
l'observabilité, ni un test : c'est le **contrat d'entrée** du Critique. Le §60 ne l'autorise pas.

Un correctif de prompt seul est impossible sans mentir : on ne peut pas demander à un rôle de
tenir compte d'un champ qu'il ne reçoit pas, et lui faire accepter `user_provided_material` sans
condition serait exactement l'exemption aveugle que les §13 et §34 interdisent.

---

## K. Faux READY

`FALSE_READY_REGRESSION_COUNT = 0` — aucun changement, donc aucune régression possible.

---

## L. Limites

1. **Le chemin simple du Critique reste non emprunté** et pourtant maintenu, testé et amendé. Il
   diverge désormais du chemin réel sur `material_context`. Cette divergence est un piège : elle a
   déjà fait passer un lot pour appliqué alors qu'il était inerte.
2. **La sémantique de phase reste ouverte**, et elle ne se dissoudra pas entièrement avec
   `material_context` : cinq vetos sur seize portent sur le champ, pas sur la disponibilité.
3. **`expected_deliverable` reste sans définition**, comme le vocabulaire de provenance l'était
   avant `PROVENANCE-01`.

---

## M. Verdict

**BLOCKED.**

L'audit est complet et la cause est établie par lecture directe du corps émis, sans statistique et
sans interprétation : le Critique de production ne reçoit pas `material_context`. Les onze vetos
d'absence sur seize s'expliquent entièrement par là, et la règle posée au lot précédent est inerte.

Ce qui bloque n'est pas une incertitude, c'est le périmètre : la correction touche le contrat
d'entrée du Critique, que ce lot n'autorise pas à modifier.

---

## N. Prochaine action sûre

Un lot borné, `OPRIE-CRITIC-MATERIAL-CONTEXT-DELIVERY-01`, dont le cœur tient en une ligne :

1. **Faire porter `material_context` par `makeCriticGlobalUserMessage`**, exactement comme
   `makeCriticUserMessage` le fait déjà — aucun contenu brut, seulement les deux booléens de
   disponibilité. La règle d'ancrage existante devient alors applicable sans être retouchée.
2. **Ajouter le test qui manquait** : vérifier la présence de `material_context` sur le chemin
   **réellement emprunté par la production**, et non sur le constructeur simple.
3. **Rejouer le banc des trente tours** à l'identique : le taux d'acceptation du Critique sur les
   tours conformes est la seule mesure qui dira si la cause était bien celle-là.
4. **Puis seulement**, traiter la sémantique de phase — définir `expected_deliverable`, et décider
   où un fait matériau doit être porté. C'est une décision de contrat, du même ordre que
   l'extension du vocabulaire de provenance, et elle mérite son propre lot.

La conformité de lecture de l'Analyste, à 53 %, reste derrière tout cela : elle deviendra le
plafond du système une fois le Critique débloqué.
