# MONOLITH-v1.0.18 — Création seule

Candidate pour audit indépendant ; aucun gel, aucune activation, aucune intégration App.

## Changement

Ajout de `POST /api/runs/create` et `pipeline.createRunOnly`. Contrat documentaire et budget identique à la création canonique ; état public relu après persistance. Le run reste CREATED / MISSION, attempts=0, étapes PENDING. Aucun diagnostic fournisseur, advance, preflight, reformulation ou traitement aval n’est appelé par cette voie.

Exemple d’entrée : `{ "question": "Analyser les documents disponibles.", "files": [], "budget": { "mode": "LIMITED", "costBudgetUsd": 2 } }`. Les fichiers éventuels portent name/contentBase64 ; acknowledgeRejected conserve sa signification historique. Le plafond de cet exemple est une donnée de test, jamais une valeur par défaut produit. Réponse 201 : `{runId,state,documents,rejected,budget}` ; utiliser state.status et state.stage.

L’ancienne route et toutes les fonctions historiques du pipeline restent byte-identiques (comparaison après retrait des seuls ajouts). Les helpers de persistance, validation, coûts, qualification, lineage, reuse et gates restent inchangés. Le numéro de version et la provenance du manifeste évoluent.

## Vérification

- Intégration HTTP locale : absence fournisseur, runId réel, fichiers sur disque, liste/détail, réponse conforme à publicState, aucun déclenchement aval.
- Nouveau processus serveur : création, fermeture, redémarrage, state.json byte-identique et run toujours consultable.
- Documents rejetés : PDF, vide, surdimensionné, mélange accepté/rejeté et acquittement. Budget : absent, invalide, plafond, mode implicite canonique, confirmation illimitée. Question trop courte refusée.
- Parité différentielle : 31 échanges historiques HTTP/SSE (dont première frame SSE), états et artefacts de création, six variantes documentaires/budget. Normalisation uniquement des identifiants et métadonnées temporelles/processus, version attendue vérifiée séparément. Les transitions nécessitant un fournisseur utilisent des doubles de test ; aucune exécution fournisseur réelle n’est revendiquée. La route preflight est comparée en erreur sous garde LLM, pas en succès réel.
- Six mutants compilés en mémoire et exécutés contre la suite : garde fournisseur ajoutée, advance ajouté, preflight ajouté, state non persisté, route historique détournée vers create-only, faux statut retourné. Sources sur disque jamais mutées par cette campagne.
- Suite historique : voir test/results.json et journal externe. Deux assertions épinglant v1.0.17 ont été ajustées à v1.0.18 ; aucune autre attente historique modifiée.
- Comparaison SHA-256 exhaustive avant/après : v1.0.17 et MONO-01/04/05/07/08/09/10/11. ACTIVE_VERSION reste MONOLITH-v1.0.16.

Les tests utilisent des racines temporaires isolées, nettoyées en fin de campagne. Aucun run historique utilisé. Garde sockets limitée à loopback ; aucun credential réel transmis. 0 appel fournisseur réel, 0 USD réel (les ledgers des tests historiques contiennent des coûts simulés).

## Limites explicites

Le coût public d’un run nouvellement créé reste null sans ledger, conformément au contrat ; la preuve de dépense nulle vient des gardes d’exécution et compteurs, pas d’un montant inventé dans la réponse. Le diagnostic au démarrage serveur reste historique et peut sonder le worker si un opérateur fournit des credentials : create-only ne désactive pas globalement le réseau du serveur.

La voie de création conserve une courte séquence dupliquée de startRun, couverte par parité ; sa validation budget intervient avant newRunId, contrairement à l’ordre historique conservé. Les écritures restent celles du store canonique : pas de nouvelle transaction globale en cas d’erreur disque.

La route resume accepte CREATED mais avance jusqu’aux étapes suivantes ; publicState.resumable reste false pour CREATED. Un preflight isolé rattaché au run demanderait un autre contrat (voir TRANSITION-MAP). Aucun client desktop ni test Windows natif dans ce lot moteur.

## Artefacts d’audit

Dans la candidate : autopsie, transition map, ce rapport, tests reproductibles et résultats ; MANIFEST.json et SHA256SUMS.txt générés avec l’outil existant enrichi de la provenance v1.0.18.

Dans `tools/EvidenceForge/reports/MONOLITH-v1.0.18-create-only/` : EVIDENCEFORGE-v1.0.18-CANDIDATE-RECORD.json, mutants-create-only.json, diff-v1017-v1018.patch, logs, inventaires protégés, vérification du manifeste, liste exacte des fichiers et SHA-256. Le record et le diff sont des sidecars externes afin de ne pas introduire un hash autoréférentiel dans le manifeste.

Les documents de gel hérités dans la copie sont l’historique des anciennes versions, jamais une décision de gel de v1.0.18. Le verdict final et les mesures exactes figurent dans le record candidate. STOP pour audit indépendant.
