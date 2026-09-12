# LOT 10G.3B.3F.1 — Execution Readiness Gate

## Problème corrigé

Le Decision Provider utilisait deux états : `clarification_necessaire` et `exploitable`.
Après `exploitable`, l'ExecutionContract activait immédiatement `execute_now`, l'interdiction des
questions de confort et la technique 9. Pour Architecte, cette activation était trop précoce :
`exploitable` signifie que la demande peut être analysée et contractualisée, pas nécessairement
que le contrat est déjà suffisamment complet pour l'exécution finale.

## Nouvelle séparation

```text
clarification_necessaire
→ contractualization
→ clarification_required (0..n cycles)
→ execution_ready
→ execute_now
```

`contractualization` autorise les clarifications réellement non substituables.
`execution_ready` réactive la technique 9 et autorise la compilation finale.

## Règle de complétude

Une inconnue n'entraîne une question que si :
1. elle peut modifier matériellement le résultat ;
2. elle appartient à l'utilisateur ou à son contexte ;
3. elle ne peut pas être honnêtement recherchée, décidée, estimée, scénarisée, conditionnée
   ou laissée inconnue localement ;
4. son absence empêche de considérer le livrable complet comme opérationnel.

Il n'existe aucun nombre cible ou plafond de questions.
