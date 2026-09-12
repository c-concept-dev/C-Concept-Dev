# Matrice des contrôles

| Contrôle | Type | Rapide/Atelier | Architecte analyse | Livrable Architecte | Correction |
|---|---|---|---|---|---|
| JSON parseable / schéma | Déterministe | Oui si format JSON | Oui, schéma + validations locales | Non | Prompt manuel |
| HTML / code brut | Heuristique/déterministe | Oui | N/A | Non | Prompt manuel Atelier seulement |
| Amorce / préambule | Déterministe/heuristique | Oui | N/A | Consigne seulement | Manuel |
| Clôture / postambule | Heuristique | Oui | N/A | Consigne seulement | Manuel |
| Quantité / seuil | Déterministe partiel | Oui si détectable | Cohérence de `quantites` par schéma | Non recomptée | Manuel |
| Troncature | Signal fournisseur | Oui via `stop_reason` | Erreur structurée | Affichée comme échec API, sans contrôle contrat | Aucun cycle |
| Placeholders / réserves | Heuristique | Oui | Schéma impose champs non vides | Non | Manuel |
| Hypothèses | Heuristique | Oui | Structure riche + fondements | Texte de consigne | Non |
| Provenance/citations | Heuristique côté Atelier | Très stricte dans l'analyse | Citations recherchées dans sources | Non vérifiée dans le livrable | Correction analyse seulement |
| Couverture obligations | Absente | Non | Critères produits | Non | Non |
| Promesse sans exécution | Absente | Seulement approchée par préambule/clôture | Non | Non | Non |
| Sécurité/légalité | Fournisseur + consignes | Pas de registre commun | Limites du rôle | Fournisseur | Non contournée explicitement |

## Blocage et score

`BLOQUANTS` contient seulement `syntaxe`, `seuil`, `troncature` (`4184`). La conformité est un indicateur de contrôles disponibles, non une preuve de conformité ADN complète. Les contrôles `execution` et `exactitude` sont explicitement non vérifiables automatiquement.

## Lacunes prioritaires

1. Aucun contrôle commun issu d'obligations versionnées.
2. Aucun contrôle post-exécution Architecte malgré la production de critères.
3. Pas de statut final `PASS/FAIL` commun à toutes les routes.
4. Pas de distinction systématique entre déterministe, heuristique, sémantique et non vérifiable dans une trace.
5. Pas de contrôle explicite de la technique 9.

