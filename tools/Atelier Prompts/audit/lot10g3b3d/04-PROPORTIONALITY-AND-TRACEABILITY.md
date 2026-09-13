# Proportionnalité et traçabilité

## Proportionnalité

Le sélecteur retourne :
- la liste des verrous actifs ;
- les 13 décisions `selected=true/false` ;
- le nombre de verrous actifs ;
- le ratio de proportionnalité.

Une demande minimale de test sélectionne 2/13 verrous. Une demande structurellement riche + signal `scope` peut sélectionner 13/13.

## Traçabilité

Chaque verrou actif transporte :
- `reason` ;
- `priority` ;
- `source` ;
- `source_ids` ;
- `associated_checks` ;
- `active=true` ;
- `origins` dans la vue du sélecteur (`deterministic`, `semantic_signal`).

Le verrou `volume` conserve la chaîne quantité/obligation/contrôle. `final_check` référence tous les contrôles existants.
