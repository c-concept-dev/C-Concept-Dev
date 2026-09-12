# Matrice des duplications

| Concept | Implémentation 1 | Implémentation 2 | Implémentation 3 | Risque |
|---|---|---|---|---|
| Intentionalité | Decision Provider, procédure sémantique | `mesurerDemande` + `detecterFormat` lexical | Architecte `comprehension` | divergences non arbitrées |
| Exploitabilité | provider `exploitable/clarification` | blocage source manquante Atelier | Architecte complet/partiel/action | double questionnement ou requalification |
| Quantité | `detecterQuantite` | `ARCH_SCHEMA.livrable.quantites` | proportions Architecte | unités et bornes différentes |
| Format | `FORMATS` | `livrable.format_technique` | réglage manuel Architecte | projections incohérentes |
| Hypothèses | verrou `hypotheses` | pilotage d'incertitude | composants/fondements | répétition dans prompt final |
| Provenance | section Atelier | déclarations | fondements + contrôle_provenance | coût élevé, politiques différentes |
| Contrôle | verrou `controle` dans prompt | `CONTROLES` post-exécution | critères Architecte dans prompt | aucun statut final commun |
| Correction | `construirePromptCorrection` | `archPromptCorrection` | erreur exécution Architecte | mécanismes non composables |
| Assemblage | `assembler` | `assemblerAnnote` miroir manuel | `archCompiler` | dérive lors des changements |
| Schéma/validation décision | `decision-core.js` | miroir HTML `adpDecisionValide` | tests regex/intégration | dérive client/serveur possible |
| Préférences | stockage Atelier | Architecte `preferences_confirmees` | apprentissage/corroboration | autorité distribuée |
| Qualité | contrôles Atelier | module Qualité copié verbatim | juge ponctuel Architecte | plusieurs vocabulaires/états |

## Duplications les plus coûteuses

1. **Analyse de la demande** : routeur puis Architecte, sans réutilisation de l'état déjà acquis.
2. **ARCH_SYSTEM + ARCH_SCHEMA à chaque appel** : coût fixe d'environ 9 670 tokens d'entrée.
3. **Vérifications** : critères produits dans l'analyse, répétés dans le prompt, non réutilisés par un validateur final.
4. **Miroirs manuels** : `assemblerAnnote` indique explicitement qu'un changement doit être reporté ; le validateur décision est recodé dans le HTML.

## Déduplication cible

Un `ExecutionContract` devrait être l'autorité unique ; Rapide, Architecte, Atelier, le validateur et la correction n'en recevraient que des projections. Les implémentations spécifiques au format restent légitimes, mais ne doivent plus redécouvrir intention, obligations ou risques.

