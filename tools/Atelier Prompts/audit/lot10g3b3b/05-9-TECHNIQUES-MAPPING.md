# Mapping des neuf techniques

| # | Technique | Représentation v1 |
|---:|---|---|
| 1 | Contrat préalable | contrat versionné + intention + obligations + contrôles |
| 2 | Blocage échappatoires | `execution_policy.evasion_blocked` |
| 3 | Questions inutiles interdites | `comfort_questions_forbidden`, état et manques |
| 4 | Format strict | `output` + checks de format |
| 5 | Démarrage forcé | `output.opening` + `execute_now` |
| 6 | Interdictions explicites | verrou `forbidden`, `meta_discussion_forbidden` |
| 7 | Obligations absolues | `obligations[].mandatory` |
| 8 | Règles quantifiées | `quantities[]` liées aux obligations et checks |
| 9 | Injonction finale | `execute_now` + `final_injunction_active` |

## Technique 9

La validation impose l'équivalence stricte :

```text
executability.state == exploitable
⇔ execution_policy.execute_now == true
⇔ execution_policy.final_injunction_active == true
```

En clarification, ces deux drapeaux sont obligatoirement faux et la route est nulle. Cette représentation ne modifie encore aucun prompt.

