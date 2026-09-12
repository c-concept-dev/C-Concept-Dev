# Preuve anti-hardcoding

La nouvelle couche ne contient :

- aucun domaine ;
- aucun pays ou ville ;
- aucun questionnaire ;
- aucune liste de champs obligatoires par activité ;
- aucun seuil de nombre de questions.

Ses seules primitives sont : état, question, répétition, source, disponibilité provider, route demandée et métadonnées de progression.

Le corpus peut contenir voyage, rédaction, enseignement, code, analyse, stratégie ou création : ces termes restent exclusivement dans les tests et ne sont jamais importés par le runtime.

Un test scanne explicitement `conversation-orchestrator.js` contre les exemples métier interdits. Un autre vérifie que la couche HTML située entre l'orchestrateur et l'UI ne contient aucun exemple de recette.
