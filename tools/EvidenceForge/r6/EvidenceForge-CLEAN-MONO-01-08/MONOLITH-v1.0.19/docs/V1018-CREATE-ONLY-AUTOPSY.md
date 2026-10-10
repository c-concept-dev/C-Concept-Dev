# Autopsie avant codage — v1.0.18 candidate

Base : v1.0.17 gelée, 197 fichiers scellés vérifiés. Aucun fichier de la base ne sera édité.

1. La validation question (trim, 12 caractères), intakeDocuments, acquittement des rejets, newRunId, createRunStore, documents, documents-chunks.json, makeState, budget et événements sont locaux. state.json porte la question et les identités documentaires ; mission.json est réservé à la reformulation ultérieure.
2. Seul le callback assertProviderReady injecté par le serveur exige le fournisseur dans startRun. Il précède le store mais suit question/intake. Le budget historique est validé après les écritures documentaires : conserver cet ordre pour la voie historique.
3. Le serveur appelle advance après startRun. advance incrémente attempts, pose RUNNING puis appelle llm.preflight et SM.reformulate. Aucun de ces actes n’appartient à la création seule.
4. makeState produit CREATED / MISSION, stages PENDING, attempts=0, reformulated=null, compteurs nuls, aucun gate/checkpoint/seal. publicState restitue cet état avec coût/budget. CREATED a resumable=false, même si la route resume accepte cet état.
5. Changements de production prévus : server.js, lib/pipeline.js, config/monolith.config.json (version seulement). Outil manifeste/provenance, tests et documents sont également ajoutés/actualisés.
6. Une factorisation est possible mais non nécessaire : conserver startRun intégralement et ajouter une primitive locale utilisant les mêmes helpers canoniques minimise le risque historique. La petite séquence de création est dupliquée ; une comparaison différentielle des sorties/persistances vérifie son équivalence. Dans la nouvelle primitive uniquement, normaliser ET valider le budget avant newRunId (normalizeBudgetMode puis normalizeBudgetInput, comme budget.set).
7. Restent identiques : ancienne route, startRun, advance, run-store, validations documentaires et budget, coûts, gates, reuse, lineage, qualification, report, lots gelés. Le hash de documents et les métadonnées de chunks restent canoniques ; aucun checkpoint de lineage n’existe encore à ce stade.

Erreurs : MISSION_INVALID / DOCUMENTS_REJECTED / BUDGET_REQUIRED / BUDGET_INVALID via errOut existant. L’absence fournisseur bloque encore la route historique (409), pas la nouvelle. Pas de nouvelle taxonomie métier.

Le diagnostic fournisseur automatique au démarrage serveur reste historique : avec credentials utilisables, il peut sonder le worker. La preuve zéro réseau fournisseur de ce lot utilise un environnement sans credentials et un garde réseau de test. La nouvelle route ne déclenche pas ce diagnostic.
