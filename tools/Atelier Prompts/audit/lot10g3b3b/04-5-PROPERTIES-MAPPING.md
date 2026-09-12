# Mapping des cinq propriétés

| Propriété | Blocs du contrat | Preuve représentable | Autorité future possible |
|---|---|---|---|
| Intentionalité | `original_request`, `intent`, contraintes | objectif et demande conservés | `intent` |
| Exécutabilité | `executability`, `routing` | état, confiance, manques et route | `executability` |
| Discipline | `execution_policy` | exécution immédiate, interdiction confort/méta/échappatoire | `execution_policy` |
| Complétude | `obligations`, `quantities` | exigences, sources, bornes et traçabilité | obligations + quantités |
| Conformité | `output`, `checks` | format attendu et contrôles opposables | output + checks |

`deriveAdnSummary()` calcule purement `adn_summary` depuis les blocs du contrat. Le validateur refuse une vue modifiée ou divergente. La valeur `represented` signifie que la langue du contrat sait porter la propriété ; elle ne prétend pas que le runtime historique la satisfait déjà.
