# EXTERNAL_OUTCOME_UNKNOWN — contrat technique EF-01 V1

Une invocation fetch ne prouve ni livraison ni refus. Dès le départ possible, timeout/rupture/body incomplet/statut ambigu entraîne EXTERNAL_OUTCOME_UNKNOWN, sans deuxième départ automatique. Ce code n'est pas un verdict scientifique.

MONO-04 conserve sa structure de résultat. La composition remplace le diagnostic technique ambigu et conserve requestId/provider/operation, statut FAILED, httpStatus observé et compte de départs. EF-01B/C1 enveloppent nativement cette cause en LLM_PROVIDER_UNAVAILABLE. Pipeline inchangé : STOPPED à l'étape courante, pas de PLAN confirmé ni de traitement aval. L'erreur et la trace exposent remoteCostUsd=null/remoteCostKnown=false. Aucun succès ni montant nul n'est déduit du silence.

Une erreur HTTP terminale explicitement reconnue reste EXTERNAL_HTTP_ERROR. Un refus rate-limit complet peut autoriser une seconde tentative ; si celle-ci devient ambiguë, arrêt immédiat. La durée totale avant headers n'est pas réarmée par ce refus. On ne prétend pas connaître le code Worker déployé, annuler sa requête amont, ni dédupliquer la facturation à distance.

Le ledger v1.0.18 convertissait usage null en coût 0 sur modèle tarifé. La candidate corrige uniquement les enregistrements KIT_CALL portant transportOutcome=EXTERNAL_OUTCOME_UNKNOWN avec usage absent : null/cost null/priced false, interrupted=true, usageIncomplete=true. Un usage effectivement reçu conserve sa tarification. Totaux historiques = somme des coûts connus ; calls.unpriced signale que le total facturé est incomplet. L'UI et le budget scientifiques ne sont pas réécrits.

Pas de réémission automatique à la suite de cette cause, ni dans MONO-04 ni dans kitAttempts. Le cache in-process conserve l'échec enrichi pour le même requestId. Ce n'est pas une garantie distribuée : un arrêt brutal du processus peut précéder l'écriture des preuves, et la route de reprise explicite reste historique. Le contrat ne fournit pas de réconciliation fournisseur automatique ni de récupération de facture. Pour un run LIMITED, l'entrée non tarifée bloque les appels suivants avec le garde budgétaire existant ; ne pas relever/contourner ce garde pour « essayer ».

## Après audit indépendant et gel séparé seulement

1. Examiner les preuves de cette candidate et la configuration du Worker déployé lors d'une préparation autorisée ; aucun réseau dans cette mission.
2. Intégrer séparément la version gelée dans le Desktop, épingler son identité et vérifier son workspace isolé.
3. Obtenir une nouvelle autorisation explicite propriétaire pour un unique smoke et son plafond. L'autorisation historique a déjà été consommée.
4. Nouveau run dédié ; ne pas reprendre efm-20261009-d16ac129. Credentials injectés seulement dans cette future mission autorisée.
5. Un lancement, traces de chaque départ, coûts connus/inconnus distincts ; STOP à toute issue ambiguë, aucun deuxième POST automatique.
6. Si WAITING_USER/CONFIRM_PLAN est atteint, conserver gate/reformulation/missionDeliverables/coût puis STOP AVANT confirmation PLAN.

Cette candidate n'est ni gelée ni activée ; aucun smoke n'est autorisé ou exécuté par ce document.
