# DEEP-OUTPUT-ROBUSTNESS-01

> Le validateur avait raison de refuser. Ce qui manquait n'était pas un assouplissement,
> c'était une provenance.

## Ce que le lot devait trancher

**Question A.** Une sortie LLM structurée invalide peut-elle encore produire un `HTTP 502`
sans aucun état OPRIE ?

**Question B.** Les échecs de Haiku viennent-ils de plafonds de sortie trop bas — et un
ajustement minimal suffirait-il à lui faire respecter les contrats existants ?

Rien d'autre.

## A — la chaîne causale du tour qui disparaît

DEEP-HAIKU-FIT-01 avait mesuré deux tours sur huit terminés avec `semantic_state = null`.
Pas dégradés : **absents**. Voici pourquoi, pas à pas.

1. Le Critique global rend un objet amputé d'un ou plusieurs de ses six champs racine requis.
2. `runCriticBatchedPipeline` assemble et appelle `validateCriticOutput`.
3. `exactKeys` refuse — **à juste titre**.
4. `exactKeys` lève via `assert`, qui produit un `TypeError` **nu**, sans marqueur structurel.
5. `tagCriticPipelineFailure` ne voit ni `partial_failure` ni `output_contract_violation` : elle laisse passer.
6. `failureClassOf`, faute d'étiquette, retourne `PROGRAMMING_ERROR` — « défaut de NOTRE code ».
7. `isFailoverEligible` répond `false` : `provider_ha_fail_closed`, l'erreur remonte telle quelle.
8. Ce n'est donc **jamais** une `ProviderChainError` — et `degradedResultFromProviderChainError`,
   qui aurait produit l'état gouverné, ne s'applique pas.
9. `handleRoleRequest` répond `502 role_provider_failure`, dont le contrat gelé R1-9/R1-10
   interdit tout champ `state`.
10. Le tour disparaît.

### L'asymétrie, qui est le vrai défaut

L'Analyste et l'Arbitre traversent `parseRoleOutput`, qui étiquette **tout** refus de leur
validateur en `STRUCTURED_OUTPUT_INVALID` — classe éligible au repli. C'est exactement pourquoi
un Arbitre omettant `reason` a produit un `degraded_state` gouverné sur C8, là où un Critique
omettant `vetoes` a produit un trou sur C6.

**La même faute de contrat, deux traitements opposés, selon le rôle qui l'avait commise.**

Ce n'était pas une décision : c'était un angle mort. Deux lots l'avaient d'ailleurs nommé sans
le fermer — `OPRIE-CRITIC-B01B-FAILURE-CLASSIFICATION-01` (« cette question, plus large, reste
ouverte et hors de ce lot ») puis `UNTAGGED-ASSERT-FAMILY-02` (« le lot n'a pas tout converti »).

### La correction

Six lignes hors commentaire, un seul site, aucun mécanisme nouveau :

```js
try {
  return validateCriticOutput(derived);
} catch (error) {
  if (error && typeof error === "object") error.output_contract_violation = true;
  throw error;
}
```

`output_contract_violation` est le marqueur que `tagCriticPipelineFailure` lit **déjà** depuis
UAF-02. La portée est stricte : `deriveCriticConsequences` reste **hors** de l'enveloppe, pour
qu'un défaut de notre propre dérivation continue de sortir nu et bruyant.

Ce qui n'a pas changé : aucun champ rendu facultatif, aucun `exactKeys` assoupli, aucune valeur
par défaut fabriquée, aucun message modifié, aucun prompt, aucun schéma. **OPRIE reste seule
autorité sémantique** — le marqueur ouvre la dégradation, il ne décide d'aucun état.

Vérifié de bout en bout : le scénario exact de C6, rejoué sur le chemin HTTP réel, rend
désormais `HTTP 200` et un `DegradedRoleResult` canonique, sans aucun verdict fabriqué.

## B — les plafonds étaient largement innocents

La preuve tient dans une seule colonne des 45 appels déjà payés :
**43 se terminent en `tool_use`, 2 en `max_tokens`.**

| étage | CONFIGURED | EFFECTIVE | OBSERVED | STOP_REASON | verdict |
|---|---|---|---|---|---|
| Analyst | 4096 | 4096 | 529 – 1928 | `tool_use` 10/10 | non causal |
| Critic global | 2048 | 2048 | 213 – 962 | `tool_use` 14/14 | **non causal** |
| Critic batch | 2048 | **1600** | 1163 – 1600 | `max_tokens` 2/10 | **causal** |
| Arbiter | 4096 | 4096 | 565 – 1789 | `tool_use` 7/7 | non causal |

Le plafond effectif de batch n'est pas posé, il est dérivé :
`ceil((20 + 1260 × 1) × 1,25) = 1600`, où `1260 = 6 familles × 7 champs × 30 jetons`.

Le résultat décisif est celui du Critique global : **7 sorties invalides sur 14, toutes émises
entre 10 % et 47 % d'un plafond jamais atteint.** Le modèle s'arrête de lui-même en omettant des
champs obligatoires. Aucune valeur de plafond ne corrige cela.

### Pourquoi aucun plafond n'a été touché

§13 n'autorise l'élévation que d'un plafond réellement causal. Il ne l'est que pour un défaut
sur trois. Élever 1600 corrigerait la troncature de C1 et laisserait intacts les 7 refus du
Critique, les 2 omissions de l'Arbitre et D3. Haiku échouerait à l'identique.

§24 se prononce donc **avant** toute correction mécanique, et sans dépenser un appel.

> **Risque latent, documenté et non traité.** Le plafond de 1600 est calibré sur la verbosité de
> Sonnet. Tout modèle sensiblement plus verbeux le heurtera : Haiku l'a fait de façon déterministe,
> deux passes sur deux, à 1600/1600 exactement. Un futur changement de modèle Deep doit recalibrer
> ce plafond **avant**, pas après.

## Verdict Haiku

`HAIKU_FINAL_FIT = FAIL`, établi sur la mesure déjà payée, **zéro appel API**.

Les trois défauts restants sont survenus entre 16 % et 47 % du plafond de leur rôle, tous en
`tool_use`. Aucun n'est mécanique :

- Critique global incomplet — `MODEL_BEHAVIOR`
- Arbitre sans `reason` — `MODEL_BEHAVIOR`
- `available_inputs` portant la valeur du livrable — `MODEL_SEMANTIC_ERROR`

Conformément à §24 : pas d'hybride, pas de routeur, pas de prompt retouché, pas d'autre modèle
testé. **Le sujet Haiku est clos. `claude-sonnet-4-6` reste le modèle Deep.**

## Point d'attention pour le propriétaire

Quatre tests de lots antérieurs ont dû être mis à jour : `T-UAF02-09`, `T-CPT01-06`, `CSR01-8`,
`ORCH01-19b`. Ils n'étaient pas obsolètes par accident — **ils épinglaient délibérément la
classification que ce lot change**, et l'un d'eux l'argumentait au nom du refus du model shopping.

Les modifier est une décision d'architecture, pas de l'entretien. Elle est assumée ici parce que
§3 QUESTION A la demandait explicitement, et chacun porte le commentaire qui l'explique. Aucun
n'assouplit un contrat : tous continuent de refuser la même sortie, avec le même message, sans
verdict fabriqué. Le détail est dans `evaluation/deep-output-robustness-01/regressions.json`.

Les invariants voisins restent gardés : assertions internes toujours nues (`T-UAF02-04/04b`),
portée de UAF-02 toujours à cinq sites (`T-UAF02-10`), pipeline ne décidant toujours aucun état
(`XB-37`), erreur de programmation toujours fail-closed (`ORCH01-20`).

## Vérifications

`GLOBAL` **2965/2965**, trois fois de suite. `FROZEN` 7 empreintes inchangées.
`SECRET_SCAN` propre. `T-HTMLFINAL02-10`, en échec préexistant depuis quatre lots documentaires,
est résolu par la régénération du manifeste que tout lot touchant au noyau embarqué doit faire.

## Dette connue, non traitée

`evaluation/deep-haiku-fit-01/tokens-cost.json` reste exclu par la règle `**/*token*` du
`.gitignore` — une règle d'hygiène anti-secret attrapant ici un faux positif. Les chiffres
essentiels sont dupliqués dans `summary.json`, et le lot économique a depuis publié
`cout-jetons.json` sous un nom qui échappe à la règle. Non bloquant, `.gitignore` non modifié.
