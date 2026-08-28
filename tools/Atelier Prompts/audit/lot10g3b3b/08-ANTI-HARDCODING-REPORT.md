# Rapport anti-hardcoding

## Contrôles exécutés

- Scan du module et du schéma pour les champs interdits : `travel_budget`, `cv_job`, `medical_context`, `computer_type`.
- Scan de plusieurs domaines des corpus.
- Mutation de demande, destinataire, noms et cible en conservant la même structure logique.
- Vérification de l'enum des verrous : uniquement 13 primitives universelles.

## Résultat

**PASS.** Aucun domaine métier, personne, profession, route par mot-clé ou champ sectoriel n'existe dans le builder ou le schéma.

## Règles structurelles admises

- statuts fermés ;
- unités/cibles de quantité fournies par le runtime ;
- formats projetés sans classification ;
- IDs, bornes, sources et types de contrôle ;
- états et routes existants.

## Protection architecturale

Le builder ne reçoit aucune fonction de classification et n'importe ni `FORMATS`, ni corpus, ni moteur. Les corpus sont utilisés par les tests seulement.

