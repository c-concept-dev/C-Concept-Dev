# Routing Engine v1 — spécification

## But
Choisir `rapide` ou `architecte` selon le **besoin réel de préparation avant exécution**, sans utiliser le domaine, la longueur, le nombre de sections, le nombre de verrous ni une panne provider comme approximation de complexité.

## Règles
1. Une demande non exploitable ne route pas.
2. Une décision provider valide reste utilisable telle quelle dans cette étape.
3. Une indisponibilité provider n'est jamais une preuve de complexité.
4. En fallback, `architecte` exige au moins un signal positif de préparation.
5. Sans preuve de préparation, le fallback proportionné est `rapide`.
6. Les moteurs ne sont pas encore branchés sur ce module ; l'intégration produit est réservée aux adapters.

## Signaux génériques
- strategy_design
- dependent_components
- constraint_arbitration
- linked_scenarios
- architecture_coordination
- research_planning

Aucun identifiant métier n'est admis.
