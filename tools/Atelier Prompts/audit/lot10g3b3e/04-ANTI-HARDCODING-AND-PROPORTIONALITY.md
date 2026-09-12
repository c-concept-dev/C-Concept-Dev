# Anti-hardcoding et proportionnalité

Le moteur ne contient aucun mapping :
- voyage -> route ;
- CV -> route ;
- code -> route ;
- médical -> route ;
- budget -> route.

Il n'utilise pas non plus :
- longueur de la demande ;
- nombre de contraintes ;
- nombre de sections ;
- nombre de verrous ;
comme preuves suffisantes de complexité.

La route découle uniquement :
1. de l'exploitabilité ;
2. d'une décision provider valide ;
3. ou, en fallback, d'un besoin de préparation positivement établi.
