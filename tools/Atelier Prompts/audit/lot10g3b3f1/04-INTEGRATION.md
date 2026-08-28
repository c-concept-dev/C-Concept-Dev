# Intégration

## Architecte copier-coller

Le fichier `demande-pour-ia-*.json` reçoit :
- un ExecutionContract placé en phase `contractualization` ;
- `execute_now=false` et `final_injunction_active=false` pendant l'analyse ;
- une instruction `EXECUTION READINESS GATE` ajoutée après le système Architecte historique.

Le moteur Architecte gelé n'est pas modifié.

## Architecte via API

Le parcours normal V11 appelle le transport API partagé depuis la couche d'adaptation, en ajoutant
la même instruction readiness au système historique sans modifier `ARCH_SYSTEM`.

## Retour d'analyse

`assessAnalysisReadiness()` décide :
- `clarification_required` → poser une question puis réanalyser ;
- `execution_ready` → compiler ;
- `blocked` → ne pas compiler un contrat incomplet.

## Livraison finale

Après `execution_ready`, la sortie compilée reçoit la directive transversale d'exécution immédiate :
plus de question de confort, exécution complète, contrôle silencieux puis livraison.
