# Adapter Rapide

Le moteur Rapide historique reste intact.

Le nouvel adapter :
1. exécute l'assemblage historique ;
2. enrichit l'ADN State avec le format, les bornes, la quantité explicite et le destinataire disponibles ;
3. sélectionne les verrous ADN ;
4. mappe les 13 identifiants ADN vers les 13 identifiants historiques ;
5. réalise l'union `verrous historiques ∪ verrous ADN` ;
6. réassemble seulement si l'union apporte un verrou absent ;
7. fige `contratDuPrompt` pour le contrôle futur.

Aucun verrou historique n'est retiré en 3F. La sélection adaptative devient donc active de façon additive, réversible et anti-régression.
