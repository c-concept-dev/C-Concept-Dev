# Implémentation

## Autorité unique

`core/adn/conversation-orchestrator.js` fournit :

- `nextConversationAction()` ;
- `conversationQuestionsSimilar()` ;
- `createConversationAuditEvent()` ;
- `validateConversationAuditEvent()`.

Cette couche ne comprend pas elle-même les domaines. Elle traduit uniquement les primitives sémantiques déjà produites par le Decision Provider ou le Readiness Gate.

## Runtime HTML

- Rapide et Architecte appellent tous deux le Decision Provider avant routing.
- Chaque réponse relance la même fonction avec `compositeDemand()`, `state.answers` et le matériau courant.
- Une décision valide Architecte ne déclenche pas de fallback provider.
- Après une analyse Architecte, le Readiness Gate repasse par le même orchestrateur.
- L'historique reste unique et conservé lors des changements de route.
- L'audit est exposé par copie via `getAudit()` sans demande ni réponse brute.

## Sémantique provider

Le prompt partagé distingue désormais :

- contractualisable : assez complet pour analyser ;
- `EXECUTION_READY` : assez complet pour exécuter le livrable entier.

Une route ne peut être choisie qu'après `EXECUTION_READY`. Les traitements universels DECIDER, ESTIMER, RECHERCHER, SCENARISER, CONDITIONNER et IGNORER restent prioritaires avant QUESTIONNER.

## Génération navigateur

Le générateur inclut l'orchestrateur dans le bundle ADN et synchronise mécaniquement ce bundle dans l'HTML autonome afin d'éviter une divergence source/embarqué.
