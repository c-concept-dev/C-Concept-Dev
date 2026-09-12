# Anti-hardcoding 3C

Le cœur `core/adn/adn-state.js` ne contient aucune branche fondée sur une catégorie métier.

Les décisions acceptées concernent seulement :

- exploitabilité ;
- route héritée ;
- statut de preuve ;
- contraintes ;
- obligations ;
- quantités ;
- format/structure ;
- contrôles.

Si la sémantique n'est pas disponible, le moteur préserve la demande brute au lieu de l'inférer localement.
