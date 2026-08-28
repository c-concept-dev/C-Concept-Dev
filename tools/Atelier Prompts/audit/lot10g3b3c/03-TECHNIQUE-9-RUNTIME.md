# Technique 9 — Garantie runtime

## Lacune 3A

La technique 9 n'était pas garantie transversalement.

## Règle 3C

`final_injunction_active` n'est plus une formulation diffuse : c'est un invariant runtime.

| État | execute_now | comfort_questions_forbidden | final_injunction_active |
|---|---:|---:|---:|
| exploitable | true | true | true |
| clarification_necessaire | false | false | false |

Le validateur refuse toute divergence entre ces valeurs et l'état d'exécutabilité.
