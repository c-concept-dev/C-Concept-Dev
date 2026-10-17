# EF01_TRANSPORT_POLICY_V1

Candidate MONOLITH-v1.0.19. Configuration normative : `config/monolith.config.json:ef01Transport`.

| Champ | Valeur candidate | Contrat |
|---|---:|---|
| responseStartTimeoutMs | 180000 | Budget jusqu'aux headers terminaux du fetch composé, incluant lecture des refus sûrs et backoff. Aligné explicitement sur llm.timeoutMs de v1.0.18. Pas une mesure du Worker ni une garantie de latence. |
| bodyReadTimeoutMs | 90000 | Borne TOTALE de lecture JSON après headers ; alignée sur la tolérance de lecture historique 90s, sans en reprendre la sémantique d'inactivité SSE. |
| maxAttempts | 2 | Maximum de départs, seulement après refus sûr reconnu. Contrat EF-01 historique conservé en nombre maximal. |
| backoffMs | 2000 | Attente historique, incluse dans le budget response-start ; pas de réarmement du budget lors d'un retry. |
| issueUnknown | STOP_NO_RETRY | Aucune réémission après résultat distant ambigu. |

Délais : nombres entiers stricts entre 1000 et 900000ms, borne supérieure égale au plafond technique de durée LLM historique. Strings (même numériques), NaN, Infinity, zéro, négatifs, fractions, champs inconnus, politique absente/version inconnue sont refusés avant réseau. Les deux délais sont indépendants. L'enveloppe maximale est response-start + body ; elle ne contourne pas une limite distante plus courte. L'option explicite `request.timeoutPolicy.timeoutMs` valide prime sur responseStartTimeoutMs ; absence seule autorise le défaut versionné. Le providerConfig à 8000 reste intact.

## Composition et périmètre

`stage-ef01` et `build-real-mono04` byte-identiques construisent MONO-04 ; `mono04-fence-adapter` reçoit déjà cost.stage DISCIPLINES/PLAN et compose alors le transport sur le Gateway canonique. Les doubles historiques sans schéma Gateway gardent leur contrat de test. Une instance Gateway gelée utilise le même registre/secretProvider et un fetch décoré ; aucune configuration gelée mutée.

La nouvelle requête est une copie qui ne modifie que timeoutPolicy/retryPolicy. Les retries natifs indifférenciés sont remplacés sur cette instance par une tentative Gateway et jusqu'à deux départs **conditionnels** dans le port fetch. Ce n'est pas une désactivation globale : TP-09 exerce refus sûr puis succès avec deux départs. Le cache de résultat/fingerprint et le circuit-breaker du Gateway restent actifs ; le circuit compte les appels logiques EF-01 (une tentative Gateway), la trace compte les départs physiques. Une couche d'idempotence autour du résultat enrichi empêche de comptabiliser deux fois un même échec inconnu.

Sans objet cost, le même adaptateur exclusivement appelé par stage-ef01 applique la portée EF01 ; l'absence optionnelle de ledger ne désactive pas la protection (test dédié pour les deux kits). Filtre cumulatif : stage DISCIPLINES/PLAN ou EF01 dans ce cas, provider llm-worker, module real-llm-call, operation call. OpenAlex/Crossref/diagnostic passent au Gateway original, avec sa politique intacte. Aucun effet sur llm.js, llm-stream.js, llm-transport.js, Worker, prompts, scientific validators, payload, lineage, reuse, qualification, rapports ou gates. Aucun passage à SSE.

Le timer natif MONO-04 applique le budget response-start explicite. Une course Promise/AbortSignal borne aussi un fetch non coopératif. Après headers, une course de lecture dédiée arme la borne body et annule le contrôleur local en cas d'expiration. Aucune réponse partielle ne devient SUCCESS. La fin locale n'atteste jamais l'annulation distante.

## Matrice de reprise

| Observation | Retry | Justification |
|---|---|---|
| Configuration/secret/budget refusé avant fetch | Non, zéro départ | Corriger/revoir explicitement ; attendre ne corrige pas ces refus. |
| Exception réseau déclarant DNS/refus de connexion | Non | fetch ne fournit pas de preuve contractuelle de zéro octet/absence d'acceptation ; aucun diagnostic déduit d'un message libre. |
| HTTP429, JSON type=error, error.type=rate_limit_error, sans usage/id/content | Oui, au plus 2 départs | Contrat technique du refus de génération explicite ; même payload, identité locale et délai total borné. |
| HTTP429 sans cette enveloppe, 5xx, 504 | Non | Statut seul insuffisant pour exclure une génération amont acceptée. |
| HTTP400/401/403/404 + enveloppe d'erreur explicite reconnue | Non | Refus terminal explicite, distinct de UNKNOWN. |
| Timeout après départ possible | Non | OUTCOME_UNKNOWN. |
| Connexion interrompue / body tronqué ou bloqué | Non | OUTCOME_UNKNOWN. |
| Parsing de l'enveloppe HTTP invalide | Non | Le serveur a pu générer ; pas de retry transport. |
| Sortie scientifique invalide après enveloppe complète réussie | Contrat historique du kit | Les validations et kitAttempts sont inchangés : ce n'est pas une issue transport inconnue. Usage connu conservé. |

Aucune autre catégorie n'est affirmée « sûre ». Les réponses d'overload ne sont pas ajoutées à une liste spéculative. Une expansion de cette liste demanderait une preuve et une nouvelle version de politique.

## Comptabilité et preuves

Succès : chemin fence/ledger historique, une écriture KIT_CALL. Le résultat EF-01 déjà comptabilisé est reconnu par identité objet pour éviter une double écriture lors d'une répétition du même requestId. Une enveloppe réussie sans usage reste une sortie réussie, mais son coût devient explicitement non tarifé sur ce chemin ciblé (aucun zéro inventé). Échec après départ potentiellement accepté : une écriture KIT_CALL interrupted/usageIncomplete ; usage connu conservé, absence d'usage explicitement null/cost null/priced false grâce à une extension opt-in du ledger monolithe. Aucun tarif ni règle du budget modifié. Le budget LIMITED bloque ensuite un ledger non tarifé. Les anciens appels ledger sans le marqueur technique sont couverts par parité différentielle.

`ef01-evidence/transport-policy.jsonl` contient politique effective, stage, runId/requestId/provider/model, phases, nombre de départs et statuts. Aucun prompt, header Authorization ou corps de réponse n'y est stocké. Les preuves natives des kits restent intactes.

Test8500 : une frontière de régression, pas le timeout produit. Tests utilisent une politique explicite 12000/3000 et une horloge virtuelle ; les défauts produit versionnés sont également validés strictement.
