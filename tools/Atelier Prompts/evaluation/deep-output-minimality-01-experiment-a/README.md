# DEEP-OUTPUT-MINIMALITY-01 — Expérience A

**`SEMANTIC_PASS_PERFORMANCE_UNMEASURED`.** Le code est fait et vert ; la mesure ne peut pas l'être
dans le budget, et **aucun gain n'est revendiqué**.

> Décision propriétaire : budget non relevé, modification conservée, commit exceptionnel autorisé,
> `PERFORMANCE_CLAIM = NONE`.

## Ce qui est établi

`candidate_action` était bien mort. `evaluateSubstitutionCandidateGate` lit exactement six champs —
`applicable`, `justification`, `requires_user_reserved_choice`, `preserves_objective`,
`contradicts_known_facts`, `produces_complete_deliverable` — et `candidate_action` n'en fait pas
partie. Le matérialiseur ne retient que `justification` et le verdict du gate. Le champ était
demandé au modèle, validé, puis jeté.

**0 consommateur runtime. 0 persistance downstream.** L'audit Codex est confirmé.

La suppression est faite : prompt, schéma, `SUBSTITUTION_CANDIDATE_FIELDS`, et la prose qui disait
« sept champs ». Rien d'autre. Les constantes dérivées ont suivi toutes seules —
`per_target_output_units` 1 260 → 1 080, plafond de batch 1 600 → 1 375, **cardinalité inchangée**.

`GLOBAL` 2965/2965 trois fois. `FROZEN` OK. `SECRET_SCAN` OK. Tous les invariants PASS.

## Ce qui bloque

La seule trace par fixture qui existait — `deep-cout-jetons-01`, d'où viennent Q01, Q02, Q07, Q08,
A01, A02 — **n'a pas été mesurée sur Sonnet** :

```
jetons_par_fournisseur : { groq: 8724, anthropic: 0, openai: 0 }
modele                 : openai/gpt-oss-20b
```

L'utiliser comme baseline attribuerait à la suppression de `candidate_action` tout ce qui n'est
qu'une différence de modèle. La baseline doit donc être rejouée sur Sonnet — ce que le §11 espérait
précisément éviter — et le coût de l'expérience double :

| expérience | coût estimé | plafond 0,30 USD |
|---|---|---|
| §12 nominal, 6 cas avant/après | ~1,22 USD | ×4 |
| 4 clarifications lentes | ~0,82 USD | ×2,7 |
| 2 fixtures avant/après | ~0,41 USD | dépassé |
| 2 fixtures légères | ~0,24 USD | tient, mais échantillon trop mince |

`§13` imposait STOP et décision propriétaire. Le propriétaire a tranché : on garde la modification
sans revendiquer de performance.

## Correction d'un lot antérieur

Cette découverte oblige à corriger DEEP-INTERACTION-LATENCY-01, qui présentait ces 12 tours comme
des mesures du Deep de production.

**Tient toujours** — appels de Critique = 1 + issues `material`+`question` (lu dans le code) ;
cardinalité de batch à 1 ; revues auto-contenues donc early-stop sûr ; latence ∝ jetons de sortie
(confirmé séparément sur données Sonnet) ; clarification ouverte Sonnet p50 = 91,7 s.

**Ne tient pas comme fait Sonnet** — la queue à 218 s, les 13 appels de Critique, les coûts par
tour, et surtout **la part du Critique à 52–86 % de la sortie**. Sur Sonnet, le Critique ne pèse que
**25,5 %** d'un tour de clarification, et c'est l'**Arbitre** qui domine à **42,4 %**.

Autrement dit : sur le modèle de production, le levier que cette expérience actionne est plus petit
qu'annoncé, et il n'est pas le principal.
