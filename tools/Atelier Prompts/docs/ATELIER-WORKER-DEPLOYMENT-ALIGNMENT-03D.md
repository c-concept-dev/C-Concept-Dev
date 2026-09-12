# ATELIER_WORKER_DEPLOYMENT_ALIGNMENT_03D

## Périmètre et source

Release autorisée par la mission fournie le 12 septembre 2026. Aucun changement de code, de schéma, de modèle, de HTML ou de consigne. Aucun push, commit, benchmark ni correction Anthropic 400.

SOURCE_COMMIT = 893c292519a83774af176ff238e0838e015254e9

SOURCE_TREE_CLEAN = YES (worktree détaché, contrôle `git status --porcelain` vide avant build et avant déploiement).

SOURCE_PATH = `/private/tmp/atelier-deployment-03d-893c292/tools/Atelier Prompts/workers/groq/src/index.js`

WRANGLER_CONFIG = `workers/groq/wrangler.jsonc`

Le candidat A du manifeste `ATELIER-WORKER-RELEASE-ALIGNMENT-03D.json` est retenu. Les fichiers Workers de ce commit sont identiques à ceux du commit b29b10de9e969b69a90d78407137658196c8a25c audité précédemment (diff vide). Le HEAD local 169a74ab23d45589d1a6e89a411d23da019ae167 contient 03B : il n'est PAS la source de livraison. Le main distant observé au démarrage est 8f3ae5d5713740905e023ee3334afb3d0398a1d4 ; cette livraison n'affirme pas déployer le dernier main.

## Inventaire avant mutation Cloudflare

| WORKER / CLOUDFLARE_SERVICE | SOURCE_PATH relatif au projet | ACTIVE_VERSION | USED_BY_ATELIER | SOURCE_RUNTIME_MATCH | DEPLOY_REQUIRED |
|---|---|---|---|---|---|
| atelier-decision-groq | workers/groq/src/index.js | 9a4d536a-12ba-4bff-bc6d-eeba86cffb91 | Oui : Fast et OPRIE ; /decision historique | NO : ancien Critic sans waveStart | YES |
| atelier-decision-workers-ai | workers/workers-ai/src/index.js | d9825f13-32ed-4581-8176-0611e8f4ff60 | Référencé par la façade /decision, pas par le parcours Fast/OPRIE actuel | NO : ancien service /decision seul, source actuelle avec rôles OPRIE | NO pour ce lot ; désalignement signalé avant déploiement principal |
| atelier-decision-evaluation-local-only | workers/evaluation/src/index.js | Non consultée, hors cible de production | Non : pas appelé par le HTML | Non évalué | NO |

Preuve des URLs : HTML validé, lignes 1506–1509 et 21022. Aucune autre URL workers.dev dans ce HTML. Les adaptateurs Anthropic/OpenAI sont dans le service Groq, pas des Workers distincts. La fin du contenu Cloudflare de Workers AI ne route que vers `handleDecisionRequest`; le fichier Git importe également `operational-request-core.js`. Il n'existe pas de dépendance de déploiement du parcours actuel vers ces nouvelles routes Workers AI.

## Sauvegarde de l'état avant

SERVICE = atelier-decision-groq

ACTIVE_DEPLOYMENT_ID = d311d2d8-f61f-4001-a552-e0b24c8927a8

ACTIVE_VERSION_ID = 9a4d536a-12ba-4bff-bc6d-eeba86cffb91

ACTIVE_VERSION_NUMBER = 115

SCRIPT_ETAG = 7f61f4e6f471340df9e63bd89d83f13c64c74783a4c96d519bbbede3309b6af5

CREATED_AT = 2026-09-07T11:35:28.999687Z (version), 2026-09-07T11:35:30.726991Z (déploiement)

Trafic : 100 %. SHA-256 du module actif extrait du multipart Cloudflare : `1e9ddaab80b1009f00a5aa5b335ad30db7c8aa20543eced9431dfe837592a8c3`. Early-stop absent.

Workers AI : déploiement d8c4c84a-1bcc-46f3-937c-18ec227be8c8, version 13, créée 2026-08-28T16:52:12.072457Z ; ETag 64e25e1c92eacabefc186f7899155e076c647bc447b2731b3b6d32979766be2d ; SHA-256 module actif 1534b41489a7b5b0d1d4d274ca2fc7a36bb870fb53f2e4e2078224b5bb7dcdff.

Les versions antérieures sont conservées. Valeurs secrètes jamais lues ni affichées. Bindings secrets présents avant : ANTHROPIC_API_KEY, GROQ_API_KEY, OPenAI-API (noms seulement). Variables et compatibilité conformes au fichier Git.

## Construction et contrôles préalables

Wrangler installé et authentifié : 4.75.0, version compatible avec `^4.0.0` du package. Pas de mise à jour de dépendances. Le manifeste antérieur utilise 4.131.1 : son hash de bundle n'est donc pas repris comme preuve de ce build. La comparaison décisive porte sur notre bundle et le module actif relu après livraison.

Préfixe `W` ci-dessous : `/Users/christophebonnet/Documents/GitHub/C-Concept-Dev/node_modules/.bin/wrangler`.

Répertoire de travail : `/private/tmp/atelier-deployment-03d-893c292/tools/Atelier Prompts`.

BUILD_COMMAND = `W deploy --dry-run --config workers/groq/wrangler.jsonc --outdir /private/tmp/atelier-deployment-03d-build-groq`

DEPLOY_COMMAND = `W deploy --config workers/groq/wrangler.jsonc --outdir /private/tmp/atelier-deployment-03d-deployed-groq --message ATELIER_WORKER_DEPLOYMENT_ALIGNMENT_03D-source-893c292-without-03B`

Le mécanisme est celui de `package.json` (script dry-run:groq), avec sortie explicite pour preuve. Construction Workers AI en dry-run uniquement. L'avertissement Wrangler concernant le champ expérimental secrets n'est pas une erreur ; aucune valeur secrète n'est fournie au build.

BUNDLE_SHA256 = 5bc56349956f1d29d8cf93d1ab73462696aee45b9309ce0880e7fba4e31a1a8f

BUNDLE_BYTES = 264376

FAST_PROMPT_HASH = 9a88899127b09d194ea73bc3ca91f8d2111945f204d7d2cf3b884b6a8472c4c4

CRITIC_PIPELINE_HASH = 3a62416aac28580ede36bb853c87ff17e945eb2c3f3b0da79f12db3a5253ef2f

Méthode : SHA-256 UTF-8 du module complet ; pour Fast, valeur de la constante après décodage des littéraux et `.join(" ")` (813 octets UTF-8) ; pour Critic, texte compilé depuis `async function runCriticBatchedPipeline(` jusqu'avant la ligne `__name(runCriticBatchedPipeline` (sans le saut de ligne précédent). Ce hash de fonction compilée ne se compare pas directement à un hash de source non compilée.

Paramètres présents dans le bundle : Fast=[groq], Deep/ROLE_PROVIDER_ORDER=[anthropic], modèle Groq openai/gpt-oss-20b, Anthropic claude-sonnet-4-6, OpenAI historique gpt-5.6-sol ; plafond rôles 4096. Early-stop : boucle waveStart lignes 2042–2044 du bundle ; fonction Critic lignes 1991–2134. Consigne Fast pré-03B à la ligne 3641. Aucune modification de ces paramètres.

Contrôles hors réseau fournisseur : 74/74 tests réussis (early-stop ESO01, Fast plane PERF03A, endpoint PERF04, routage DPRF01). Frozen guard : OK sur les sept régions protégées. Aucun fichier de production modifié.

Documentation de procédure consultée : [commandes Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/) et aide de la version installée. Les skills Cloudflare/Wrangler ont guidé le dry-run, la vérification d'authentification et la préparation du rollback ; aucune recommandation de changement de configuration n'a été appliquée.

## Déploiement et relecture

CLOUDFLARE_DEPLOYMENT_ID = 853265bc-7959-42f8-94c0-820f0697f833

CLOUDFLARE_VERSION_ID = 396d4152-3aa1-419a-8d05-4eb9e3538102

CLOUDFLARE_VERSION_NUMBER = 116

Version créée le 2026-09-12 à 19:18:07.803529 UTC ; déploiement à 19:18:09.679275 UTC. Trafic actif : 100 %. ETag : 6e3fda007f6e613206ddb1ae014d76c83f0191200334fd499ec04832dba50a2a.

Wrangler a terminé sans erreur : upload 9,33 s, activation des triggers 4,82 s, startup Worker 4 ms. Ces durées ne mesurent pas la latence d'une réponse LLM.

Relecture par l'API Cloudflare `GET /accounts/{account_id}/workers/scripts/atelier-decision-groq/content/v2`. Extraction du module hors enveloppe multipart, sans normalisation du code. Son SHA-256 est exactement `5bc56349956f1d29d8cf93d1ab73462696aee45b9309ce0880e7fba4e31a1a8f`, 264376 octets, identique au dry-run ET au bundle généré lors du déploiement. Cette égalité binaire couvre également le prompt, tous les schémas et les paramètres compilés.

DEPLOYED_SOURCE_MATCHES_EXPECTED = YES

EARLY_STOP_PRESENT = YES

FAST_PROVIDER_ORDER = [groq]

ROLE_PROVIDER_ORDER = [anthropic]

FAST_PROMPT_MATCHES_SOURCE = YES (déclaration relue identique ; hash de la valeur : 9a88899127b09d194ea73bc3ca91f8d2111945f204d7d2cf3b884b6a8472c4c4)

CRITIC_PIPELINE_MATCHES_SOURCE = YES (hash de la fonction compilée relue : 3a62416aac28580ede36bb853c87ff17e945eb2c3f3b0da79f12db3a5253ef2f)

Les bindings, noms des trois secrets, variables, date et drapeau de compatibilité sont conservés. Aucun autre Worker déployé.

## Health checks et rollback

Contrôles légers exécutés après activation : OPTIONS avec origine GitHub Pages et POST `{}` rejeté par validation sur chaque endpoint, sans inférence payante. Un PASS de ces sondes prouve le routage, la validation d'entrée et CORS, pas un tour sémantique complet ni la disponibilité des fournisseurs.

| Endpoint | Sonde | Résultat attendu et obtenu | Durée observée |
|---|---|---|---|
| /fast-interaction | OPTIONS, origine GitHub Pages | 204 ; Allow-Origin exact ; POST, OPTIONS autorisés | 232 ms |
| /fast-interaction | POST `{}` | 400 invalid_turn_snapshot ; Allow-Origin exact | 116 ms |
| /fast-interaction | OPTIONS, origine non autorisée | 403 ; aucun Allow-Origin | — |
| /operational-request | OPTIONS, origine GitHub Pages | 204 ; Allow-Origin exact ; POST, OPTIONS autorisés | 30 ms |
| /operational-request | POST `{}` | 400 invalid_input ; Allow-Origin exact ; invocation_id a3a1426ddd173843 | 30 ms |
| /operational-request | OPTIONS, origine non autorisée | 403 ; aucun Allow-Origin | — |

HEALTH_FAST = PASS (transport/validation uniquement)

HEALTH_DEEP = PASS (transport/validation uniquement)

CORS = PASS

Aucune erreur 5xx sur ces six sondes. Aucun appel d'inférence, aucune campagne. La correction Anthropic 400 n'est ni effectuée ni revendiquée.

ROLLBACK_REQUIRED = NO

Commande de retour arrière préparée : `W rollback 9a4d536a-12ba-4bff-bc6d-eeba86cffb91 --config workers/groq/wrangler.jsonc --yes --message ATELIER_03D_health_failure`.

## Bilan

PRIMARY_SERVICE = atelier-decision-groq

WORKERS_DEPLOYED = atelier-decision-groq

WORKERS_NOT_DEPLOYED = atelier-decision-workers-ai ; atelier-decision-evaluation-local-only (hors parcours)

SOURCE_RUNTIME_MATCH_BEFORE = NO

SOURCE_RUNTIME_MATCH_AFTER = YES (service principal, source épinglée 893c292 ; ne signifie pas que tous les Workers ou le dernier main sont alignés)

PRODUCTION_CODE_CHANGED = NO

DEPLOY = YES

VERDICT = ALIGNED

Le code servi est mis à niveau conformément à la mission, mais aucun code source de production n'a été édité. Seul ce rapport a été ajouté au dépôt par cette intervention. Aucun commit/push ; worktree de livraison resté propre. Les versions Cloudflare précédentes ne sont pas supprimées.
