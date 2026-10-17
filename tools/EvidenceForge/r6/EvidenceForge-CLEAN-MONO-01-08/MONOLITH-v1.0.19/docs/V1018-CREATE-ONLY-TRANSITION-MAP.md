# Transition après création seule

`POST /api/runs/create` → validation locale → documents/chunks/budget/state/events persistés → réponse 201 `{runId,state,documents,rejected,budget}`. `state` provient de `store.publicState(store.read())` : CREATED / MISSION, toutes les étapes PENDING, attempts=0, reformulated=null. Aucun appel différé ou démarrage automatique.

`GET /api/runs` et `GET /api/runs/:id` consultent ce run. Le redémarrage ne modifie que les runs RUNNING (markInterruptedRuns) ; CREATED reste identique. Sans ledger, les champs coût public sont null (contrat historique), et non un montant artificiellement ajouté. Le compteur LLM vaut 0.

## Action future explicite

La route historique `POST /api/runs/:id/resume` accepte CREATED : elle refuse RUNNING et FAILED non reprenable, puis appelle advance et répond 202 `{ok:true}`. advance met RUNNING, incrémente attempts, vérifie le sceau MONO-11, prépare la comptabilité puis appelle llm.preflight. Si le fournisseur est absent, le run s’arrête avec une erreur fournisseur reprenable. En cas de succès, il continue vers reformulation, disciplines et plan jusqu’à la gate humaine. Ce comportement n’est pas modifié ici et aucun vrai fournisseur n’a été utilisé pour le valider.

Attention : publicState.resumable vaut false pour CREATED. C’est un indicateur historique de reprise après arrêt/échec, pas la liste des états acceptés par la route resume. Une UI future ne doit pas utiliser ce seul booléen pour déduire la capacité de démarrage initial.

## Limite pour APP-04B

resume permet de **démarrer le pipeline**, pas de faire un preflight isolé puis attendre une seconde action. Si APP-04B exige cette seconde frontière, il reste un API_GAP à spécifier/auditer. POST /api/preflight est un assistant de cadrage payant hors run : ce n’est pas une transition du run créé. Ni cette route ni une nouvelle transition ne sont intégrées dans ce lot.

L’ancienne route POST /api/runs garde son contrôle fournisseur préalable et son advance automatique. Le diagnostic fournisseur au boot (ou GET /api/provider) reste inchangé ; avec credentials réels il peut sonder le worker. La nouvelle capacité est sans appel fournisseur, mais n’est pas un mode réseau désactivé pour tout le serveur.
