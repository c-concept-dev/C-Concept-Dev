# Rapport anti-hardcoding

## Verdict

PASS.

Le nouveau module `core/adn/adaptive-lock-selector.js` ne contient aucune taxonomie métier et n'accepte que les 13 verrous canoniques.

Les tests vérifient :
- rejet d'un verrou inventé `travel_budget` ;
- stabilité de la sélection lorsque seuls les noms de contexte changent ;
- activation par propriétés structurelles plutôt que domaine.

Les seules règles codées sont des propriétés génériques du contrat : présence d'un format, d'une quantité, d'une structure, d'un matériau, etc.
