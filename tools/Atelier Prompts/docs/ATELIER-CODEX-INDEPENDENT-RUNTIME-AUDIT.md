# ATELIER — CODEX INDEPENDENT RUNTIME AUDIT

12 septembre 2026 — audit indépendant, sans changement de production.

## Synthèse

**Le HTML V11.5 servi par GitHub Pages correspond exactement au checkpoint bêta. Le Worker actif ne correspond pas au pipeline Deep de main.**

Le contrôle Cloudflare en lecture seule identifie la version active `9a4d536a-12ba-4bff-bc6d-eeba86cffb91`, à 100 % depuis le 7 septembre. Son Critic lance tous les batches prévus. Le code de main contient, lui, un arrêt anticipé par vagues après preuve d'une question de dernier recours. Cet écart est démontré par lecture du code déployé, pas déduit de la seule date.

Le diagnostic 03A est **partiellement confirmé** :

- ACKNOWLEDGE ne produit plus de retour utile dans les modes conversationnels ; il devient silence et entraîne Deep.
- Deep précède alors nécessairement l'affichage de la clarification finale.
- La consigne Fast autorise déjà une question nécessaire, mais lui impose une forte retenue. Elle ne rend pas ACKNOWLEDGE obligatoire.
- Les trois durées rapportées sont cohérentes avec cette architecture, sans constituer une mesure indépendante de cet audit.
- « Trois rôles » ne signifie pas « trois appels fournisseur » : Critic comprend un appel global puis des batches.
- Les batches sont concurrents avec borne 2, pas tous strictement séquentiels.
- L'arrêt anticipé du dépôt n'est pas dans le backend actif observé.

Enfin, poser une question Fast sans déclarer READY est possible aujourd'hui. Mais le court-circuit ne soumet pas cette sollicitation à OPRIE : l'affirmation « aucune autorité nouvelle » doit préciser si elle concerne seulement READY ou également la nécessité de clarifier.

## Méthode et limites

Les conclusions sont fondées sur quatre sources distinctes :

1. Objets Git immuables de main au SHA ci-dessous.
2. GET publics de l'accueil et du HTML GitHub Pages, sans exécution de la page.
3. GET administratifs Cloudflare : déploiements, version et contenu du Worker. Aucun secret en clair lu ou affiché, aucune mutation.
4. Lecture et exécution de tests locaux à réseau simulé, dans une copie isolée de main.

Aucun appel de génération Groq/Anthropic/OpenAI, aucune campagne API, aucun clic de génération dans le site, aucun déploiement ni compilation de production. Les consultations de documentation et de métadonnées de déploiement ne sont pas des appels d'inférence.

Les références de code sont des permaliens **figés sur main audité**, car le dépôt local a changé pendant l'audit sous une autre activité. Les résultats de Claude restent des observations rapportées, jamais nos propres mesures.

La revue Cloudflare a guidé la séparation source/runtime, la lecture des configurations et la vérification de l'orchestration. Aucun changement recommandé par ces consignes n'a été appliqué.

## Audit 1 — identité du dépôt et inventaire

### États observés

| Référence | Valeur / constat |
|---|---|
| Repository | c-concept-dev/C-Concept-Dev |
| Default branch distant | main, vérifié par ls-remote --symref |
| Main distant au début et à la contre-vérification | `b29b10de9e969b69a90d78407137658196c8a25c` |
| HEAD local au début | `893c292519a83774af176ff238e0838e015254e9` |
| État local initial | Worker Groq modifié ; test fast-necessary-question-03b non suivi |
| HEAD local observé ensuite | `916774d582bdd638bd277d0fde9dc5fe38d0a208`, commit 03B effectué par une autre activité |
| Checkpoint demandé | `5d24e75` |
| Base de cet audit | Objets Git de main b29b10d, pas le correctif local 03B |

Le diff local initial ajoutait au prompt Fast un test de lectures substantiellement différentes. Ce correctif n'est ni évalué comme production ni attribué à cet audit. Je n'ai effectué aucun commit.

### Inventaire suivi sous tools/Atelier Prompts/

718 fichiers à main : racine 5 ; audit 74 ; core 18 ; docs 65 ; evaluation 373 ; tests 165 ; tools 3 ; workers 15. Ce comptage porte sur l'arbre Git, pas sur les caches locaux.

Les cinq fichiers racine : HTML principal, package.json, anti-regression-baseline.json, DIFF-COMPLET.patch, RAPPORT-LOT10G.2A.md. Les patches et rapports ne sont pas chargés comme code par la page.

Les 15 fichiers Workers sont :

- `workers/groq/src/index.js`, `workers/groq/wrangler.jsonc`.
- `workers/workers-ai/src/index.js`, `workers/workers-ai/wrangler.jsonc`.
- `workers/evaluation/src/index.js`, `workers/evaluation/wrangler.jsonc`.
- `workers/shared/decision-core.js`.
- `workers/shared/fast-interaction-endpoint.js`, `fast-interactive-plane.js`.
- `workers/shared/operational-request-core.js`, `operational-request-orchestrator.js`.
- `workers/shared/bounded-concurrency.js`, `provider-rate-control.js`, `provider-ha.js`, `role-degradation.js`.

### Composants effectifs

| Élément / source | Rôle et appelant | Réseau / fournisseur | Déploiement |
|---|---|---|---|
| HTML principal | Interface, pilote du tour, runtime embarqué | Metas Fast/OPRIE + API Anthropic directe | GitHub Pages |
| groq/src/index.js | Service multi-routes, malgré son nom | Groq pour Fast ; Anthropic pour Deep ; autres adaptateurs historiques | Wrangler, service atelier-decision-groq |
| workers-ai/src/index.js | Decision Provider et routes de rôles secondaires | Binding AI, modèle @cf/meta/llama-3.3-70b-instruct-fp8-fast | Wrangler, atelier-decision-workers-ai |
| evaluation/src/index.js | Harnais /evaluate, pas le parcours utilisateur | Binding AI remote | Configuration local-only ; aucun appel depuis le HTML |
| decision-core.js | Contrat /decision, transport et validation | Aucun fournisseur autonome | Embarqué dans Workers |
| fast-interactive-plane.js | Schéma, projection, coordination Fast | Aucun réseau intrinsèque | Embarqué dans Worker et runtime navigateur |
| fast-interaction-endpoint.js | Entrée /fast-interaction | executeFast injecté | Même service Groq |
| operational-request-orchestrator.js | Analyst → Critic → Arbiter, état final validé | executeRole injecté | Worker et runtime navigateur |
| operational-request-core.js | Prompts, schémas, validateurs, batching Critic | Adaptateurs du Worker ou navigateur | Importé / embarqué |
| core/adn/operational-request-state.js | Énumérations et invariants canoniques | Aucun réseau | Embarqué |
| core/adn/oprie-canonical-mapping.js | État OPRIE → contrat canonique | Aucun réseau | Navigateur |
| core/adn/orchestration-policy.js | Action UI à partir des verdicts | Aucun fournisseur | Navigateur |

Preuves : [HTML:1506](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L1506), [Groq source:1](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L1), [Groq source:2235](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L2235), [workers/workers-ai/src/index.js:15](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/workers-ai/src/index.js#L15), [workers/evaluation/src/index.js:17](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/evaluation/src/index.js#L17).

**Pas de Worker Anthropic ou OpenAI séparé identifié dans le parcours Atelier.** Ce sont des adaptateurs dans le service nommé Groq. Le navigateur possède en plus son propre transport Anthropic direct : [HTML:5701](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L5701). Ne pas confondre ces deux chemins.

Les autres modules core concernent modes, routage, readiness, sélection de verrous, préservation d'intention, gates prompt/sortie, cycle d'exécution, enrichissements Rapide/Architecte, adaptations et roundtrip manuel. Ils n'ajoutent pas un endpoint Fast ou un fournisseur Deep autonome : [index:1](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/core/adn/index.js#L1).

## Audit 2 — HTML réel

Le HTML attendu est bien :

`tools/Atelier Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html`

| Vérification | Résultat |
|---|---|
| Git blob au checkpoint 5d24e75 | cd0afbcfe37851d6a4964b6fa45f735f44a1e2f3 |
| Git blob à main b29b10d | Identique |
| Taille | 1 387 248 octets |
| SHA-256 checkpoint, main, HEAD initial et réponse Pages | f3e399a3f59d10281141d764f6bd6f26417e2fdad0cb86c677a99f1cfd12821f |
| Réponse HTTP V11.5 | 200, sans redirection |
| Last-Modified observé | Sat, 12 Sep 2026 17:56:03 GMT |

Le runtime ADN est **embarqué dans le HTML** ([HTML:10760](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L10760)). Modifier un module source ou `browser-runtime.generated.js` ne change pas magiquement les octets déjà servis : le constructeur du runtime et l'injection doivent être pris en compte, [tools/build-adn-browser-runtime.mjs:1](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/tools/build-adn-browser-runtime.mjs#L1). Aucun build n'a été lancé dans cet audit.

Les quatre metas réseau pointent vers les services nommés dans l'audit 4. Le choix du mode Rapide/Architecte ne change pas le fournisseur Deep ; il choisit la destination d'exécution après readiness ([HTML:21796](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21796)).

## Audit 3 — GitHub Pages et accueil

GET vérifiés :

- [Accueil réel](https://c-concept-dev.github.io/C-Concept-Dev/) : HTTP 200, 43 689 octets, SHA-256 `c70f15575fc1a89dbfe2346f5f36000b716143b09fc71914805f68dc0cfb2bf0`.
- [V11.5 réellement servi](https://c-concept-dev.github.io/C-Concept-Dev/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html) : empreinte identique au checkpoint.

L'accueil contient **deux entrées différentes** :

1. Le lien de la rubrique Atelier Prompts vise le bon HTML V11.5.
2. La carte mise en avant « V10.3 Ultime » vise `tools/Outils/atelier-prompts-v10.html` : le GET de cette cible retourne **404**, pas une ancienne version fonctionnelle.

Le parcours correct est donc accueil → lien V11.5 de la rubrique → fichier attendu. Dire simplement « le lien Atelier de l'accueil » est ambigu. L'ancien lien n'explique toutefois pas deux minutes d'analyse dans V11.5 : il conduit à une erreur 404.

Le workflow [deploy-pages.yml](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/.github/workflows/deploy-pages.yml#L24) dépose le répertoire courant comme artefact Pages, sans compilation spécifique d'Atelier. La comparaison HTTP des octets est une preuve plus directe que l'existence de ce workflow. Aucun service worker/intermédiaire de redirection propre à cette cible n'a été identifié dans le HTML audité. Un ancien onglet ou cache d'un navigateur particulier n'a pas été inspecté.

## Audit 4 — endpoints et runtime déployé

### Endpoints du client

| Endpoint / appelant | Provider et modèle | Timeout / retry / fallback |
|---|---|---|
| atelier-decision-groq…/fast-interaction ; oprieStartFastPlane | Production configurée : Groq, openai/gpt-oss-20b | Client 10 s ; transport Groq 8 s/tentative ; capacité avec seuil 0 ; ordre Fast par défaut Groq seul |
| atelier-decision-groq…/operational-request ; oprieRequestTurn | Anthropic seul, claude-sonnet-4-6 | Aucun timeout global frontend ; 60 s par appel Deep ; pas de retry Anthropic ni de fallback Deep vers un autre provider |
| atelier-decision-groq…/decision ; askDecisionProvider | Chaîne historique Groq → Anthropic → OpenAI ; défaut OpenAI gpt-5.6-sol, surcharge possible | Groq 8 s, reprise courte max 3 s ; Anthropic/OpenAI 20 s ; hors parcours Malaga actuel |
| atelier-decision-workers-ai…/decision ; même façade historique | Binding Workers AI | Pas de minuterie locale dédiée au binding identifiée ; pas appelé par oprieRunTurn |
| api.anthropic.com/v1/messages ; transportAnthropic navigateur | Modèle choisi dans l'interface, pas nécessairement Sonnet du Worker | 90 s par tentative par défaut ; 3 tentatives max ; retry 429/500/502/503/529, attente 500 × tentative ; pas de retry 400 |
| api.anthropic.com/v1/models ; liste des modèles | Anthropic direct | GET auxiliaire, hors clarification Malaga |
| api.anthropic.com/v1/messages/count_tokens | Anthropic direct | Mesure de tokens, hors chemin Malaga tracé |

URLs complètes des quatre metas : [HTML:1506](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L1506). Adaptateurs/configuration : [Groq source:34](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L34), [Groq source:94](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L94), [Groq source:130](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L130), [Groq source:744](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L744), [Groq source:760](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L760), [Groq source:773](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L773), [Groq source:981](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L981), [Groq source:1004](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L1004), [Groq source:1451](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L1451), [Groq source:1865](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L1865), [HTML:5699](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L5699), [HTML:5786](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L5786), [HTML:5823](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L5823).

La façade `askDecisionProvider` subsiste pour compatibilité et évaluation ; le pilote principal appelle OPRIE, pas cette façade : [HTML:21377](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21377), [HTML:22204](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L22204). Les noms « ha » dans les variables ne rétablissent pas une chaîne de trois fournisseurs : ils renvoient aux listes actuelles, réduites à un fournisseur pour Fast et Deep.

### Preuve plateforme

Contrôles GET via le connecteur Cloudflare, sans mutation :

| Objet | Valeur observée |
|---|---|
| Service | atelier-decision-groq |
| Déploiement actif | d311d2d8-f61f-4001-a552-e0b24c8927a8 |
| Version active, 100 % | 9a4d536a-12ba-4bff-bc6d-eeba86cffb91 |
| Numéro de version | 115 |
| Création déploiement | 2026-09-07T11:35:30.726991Z |
| Origine du déploiement | wrangler |
| ETag de script, métadonnée plateforme | 7f61f4e6f471340df9e63bd89d83f13c64c74783a4c96d519bbbede3309b6af5 |
| Variables vérifiées | ALLOWED_ORIGINS=https://c-concept-dev.github.io ; FAST_BENCH_PROVIDER=ha ; DEEP_BENCH_PROVIDER=ha ; FAST_CAPACITY_RETRY_THRESHOLD_MS=0 |
| Secrets présents par nom, sans valeur lue | GROQ_API_KEY, ANTHROPIC_API_KEY, OPenAI-API |

La contre-vérification après lecture du contenu donne le même déploiement et la même version.

Le service Workers AI est identifié séparément : déploiement `d8c4c84a-1bcc-46f3-937c-18ec227be8c8`, version `d9825f13-32ed-4581-8176-0611e8f4ff60`, 100 %, 28 août. Sa correspondance intégrale au code source n'a pas été comparée ; il n'est pas dans le chemin Malaga.

### Écart de code prouvé

Le contenu de `atelier-decision-groq/content/v2` contient :

- l'ancien prompt Fast, identique aux instructions de main avant 03B ;
- FAST_PROVIDER_ORDER = ["groq"] ;
- ROLE_PROVIDER_ORDER = ["anthropic"] ;
- ROLE_MAX_OUTPUT_UNITS = 4096 ;
- un Critic qui construit **toutes** les tâches puis appelle une fois runBounded sur leur totalité.

Main, à [operational-request-core:1960](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/operational-request-core.js#L1960) et [operational-request-core:2019](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/operational-request-core.js#L2019), comporte une boucle de vagues et un arrêt anticipé. L'annexe A reproduit l'extrait de production démontrant l'autre comportement.

**DEPLOYED_SOURCE_MATCHES_MAIN = NO**, sur cette différence fonctionnelle précise. Une identité de version plateforme est connue ; une équivalence intégrale repo/runtime ne l'est pas, et l'égalité à main est même réfutée.

Le workflow général [deploy-worker.yml](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/.github/workflows/deploy-worker.yml#L1) vise le dossier racine `Worker/**`, pas les Workers Atelier. Un push du HTML ou des sources Atelier ne suffit donc pas à démontrer leur déploiement. Le manifeste du projet indique lui-même DEPLOY_PERFORMED=NO : [docs/RELEASE-MANIFEST.md:211](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/docs/RELEASE-MANIFEST.md#L211).

Pour fermer complètement la chaîne de provenance : associer version Cloudflare, commit source, versions du bundler et empreinte du bundle publié ; comparer les modules et leurs paramètres, pas seulement le nom du service. Aucun déploiement correctif n'est autorisé par cet audit.

## Audit 5 — call graph Malaga

Demande : « je veux preparer un voyage a malaga fin novembre ». Mode conversationnel Rapide ou Architecte, historique initial vide.

| Fonction / étape | Entrée → sortie → suite | Preuve |
|---|---|---|
| routeCurrentMode, listener ui-main-action | Mode sélectionné → routeur | [HTML:22324](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L22324) |
| __V11_ROUTER__.start | Rapide/Architecte → v11StartRapide/v11StartArchitecte | [HTML:22214](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L22214), [HTML:22174](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L22174) |
| oprieRunTurn | Verrou de tour, bandeau « Analyse… », seq | [HTML:22036](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L22036) |
| oprieStartFastPlane | Snapshot original_request + historique + current_answer=null | [HTML:21703](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21703) |
| oprieRequestFastInteraction | POST /fast-interaction → {type,text} | [HTML:21643](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21643) |
| handleFastInteractionRequest | Valide snapshot → executeFast → revalide la candidate | [fast-interaction-endpoint:74](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/fast-interaction-endpoint.js#L74) |
| runFastInteractionWithHaChain | Prompt Fast + schema minimal → Groq → candidate | [Groq source:1255](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L1255) |
| validateFastInteraction puis projectInteractionForMode | Deux clés exactes, type connu, texte non vide ; ACKNOWLEDGE → WAIT_FOR_DEEP_VALIDATION | [fast-interactive-plane:115](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/fast-interactive-plane.js#L115), [fast-interactive-plane:186](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/fast-interactive-plane.js#L186) |
| oprieRenderFastInteraction | Silence → aucun affichage ; question → modale et déverrouillage | [HTML:21676](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21676) |
| Branche de oprieRunTurn | Question effectivement affichée → return sans Deep ; sinon POST Deep | [HTML:22062](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L22062) |
| oprieRequestTurn | original_request + historique + material_context → /operational-request | [HTML:21556](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21556) |
| handleOperationalRequest | Validation entrée → runOperationalRequestTurn | [operational-request-orchestrator:460](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/operational-request-orchestrator.js#L460) |
| Analyst | Demande/historique/matériau → candidat, issues, provenance | [operational-request-orchestrator:104](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/operational-request-orchestrator.js#L104), [Groq source:2022](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L2022) |
| Critic global puis batches | Analyst → revue globale ; cibles material+question → six alternatives par cible | [operational-request-core:360](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/operational-request-core.js#L360), [Groq source:1806](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L1806) ; annexe A pour runtime actif |
| Arbiter | Analyst + Critic + contexte → état canonique et question éventuelle | [operational-request-orchestrator:121](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/operational-request-orchestrator.js#L121), [operational-request-core:665](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/operational-request-core.js#L665) |
| oprieApplyTurn | État reçu → politique d'orchestration → afficheur | [HTML:22014](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L22014) |
| oprieShowClarification / oprieAsk | next_question.text → modale, bandeau effacé | [HTML:21777](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21777), [HTML:21761](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21761) |
| answerQuestion | Réponse → historique utilisateur → nouveau tour | [HTML:10738](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L10738) |

### Conditions exactes

- **ASK_CLARIFICATION / ASK_CONFIRMATION Fast** : choisis par le modèle, pas par une règle déterministe sur « voyage ». La validation contrôle la forme, pas la nécessité sémantique. Seuls ces deux types **effectivement affichés** empêchent l'escalade.
- **ACKNOWLEDGE** : type valide ; projeté en WAIT_FOR_DEEP_VALIDATION dans les modes Rapide/Architecte ; pas de feedback utile.
- **CONTINUE_WITH_DEEP_VALIDATION** : aucun symbole de ce nom trouvé dans le runtime core/Workers. L'équivalent observé est la branche vers Deep lorsque Fast ne fournit pas de sollicitation affichée ; le type réel est WAIT_FOR_DEEP_VALIDATION.
- **READY** : Fast ne peut pas le transporter. Le chemin gouverné exige operational_request_ready issu d'OPRIE, puis un contrat canonique accepté, avant l'entrée en exécution : [HTML:21800](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21800).
- **Clarification OPRIE** : exige une next_question valide et des raisons de confirmation/blocage nulles : [operational-request-core:678](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/operational-request-core.js#L678).

Le compte réseau nominal jusqu'à la question finale, si Fast répond ACKNOWLEDGE, est **2 POST navigateur**, mais **1 + (3 + B) appels fournisseur**, où B est le nombre de batches Critic. Les requêtes CORS OPTIONS éventuelles sont des transports auxiliaires, pas des appels LLM. B exact du run Malaga n'est pas déductible de la seule phrase.

## Audit 6 — politique Fast exacte et quatre cas

Consigne de main [Groq source:1179](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L1179), également retrouvée dans le contenu déployé :

> Vous proposez UNE interaction utilisateur, et une seule, pour le tour en cours.
> Vous ne décidez rien : ni que la demande est prête, ni quelle route suivre, ni aucun état.
> Une information manquante n'appelle pas automatiquement une question : elle peut être recherchée,
> décidée, estimée, traitée par scénario, conditionnée, ou laissée explicitement inconnue.
> Demander une précision est le dernier recours, jamais le premier : ne le faites que si aucune de ces voies n'est sûre.
> Types possibles : ACKNOWLEDGE (accuser réception), ASK_CLARIFICATION (une seule question),
> ASK_CONFIRMATION (une seule confirmation), ORIENT_ARCHITECTE (orienter vers le parcours guidé),
> WAIT_FOR_DEEP_VALIDATION (rien à demander pour l'instant).
> Répondez exactement au schéma fourni : un type, un texte. Rien d'autre.

Les fragments sont joints par des espaces dans le code. La consigne **autorise déjà** le dernier recours ; elle ne dit pas « ne jamais demander ».

FAST_CAN_ASK_NECESSARY_QUESTION = YES.

FAST_DEFAULT_BIAS = OTHER — retenue / ne pas solliciter tant qu'une alternative sûre paraît possible. ACKNOWLEDGE est une tendance rapportée sur l'échantillon 03A, pas un défaut déterministe imposé par le programme.

| Cas | EXPECTED_FAST_DECISION_FROM_CODE | WHY |
|---|---|---|
| Voyage Malaga fin novembre | Indéterminée ; ASK_CLARIFICATION admissible, ACKNOWLEDGE ou WAIT également compatibles selon le jugement du modèle | Le livrable et la durée peuvent nécessiter clarification, mais le code n'encode pas cette appréciation |
| Comparer train/avion en tableau, avantages/inconvénients/critères | Non-sollicitation attendue : ACKNOWLEDGE ou WAIT ; pas garantie | Livrable et forme explicites ; comparaison générique possible sans trajet personnalisé |
| Aide-moi à préparer une présentation | ASK_CLARIFICATION raisonnable, non imposé ; ACK/WAIT restent des sorties valides | Sujet/public/livrable à préciser, mais le prompt autorise une préparation générique |
| Photosynthèse à un enfant de 10 ans, exactement cinq paragraphes | Non-sollicitation attendue : ACK/WAIT | Sujet, public et structure sont explicités |

Ces quatre cas sont un raisonnement de contrat, **pas quatre sorties mesurées**. Inventer une sortie certaine serait remplacer le modèle par notre propre jugement.

Autre limite : le schéma contrôle une seule enveloppe `{type,text}`, pas le nombre réel de questions contenues dans le texte. Un texte non vide comportant plusieurs questions satisfait le validateur actuel. « Un questionnaire structurellement impossible » est donc trop fort : un seul objet ne signifie pas une seule interrogation.

## Audit 7 — latence Deep

### Architecture du runtime actif

Analyst est attendu avant Critic ; Critic global est attendu avant ses batches ; Arbiter attend la totalité du Critic. Les batches sont exécutés avec concurrence 2 par pipeline, pas avec un quota global à l'ensemble des utilisateurs. Sources des paramètres : [Groq source:1806](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L1806), [provider-rate-control:48](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/provider-rate-control.js#L48). Le code actif ne coupe pas après la première clarification prouvée (annexe A).

Les cibles sont les issues Analyst telles que impact=material et recommended_treatment=question. Avec le budget de sortie configuré, le plan ne peut traiter qu'une cible par batch : [Groq source:1645](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L1645). Chaque batch examine les six alternatives, pas une simple phrase de question.

| Stage | Appels nominaux | Dépendance | Plafond de sortie source actuelle | Timeout |
|---|---:|---|---:|---:|
| Analyst | 1 | Demande/historique | 4096 tokens | 60 s |
| Critic global | 1 | Analyst complet | 2048 | 60 s |
| Substitution Review | B | Analyst + plan de batches ; après global | Calculé, plafonné 2048/batch | 60 s/appel |
| Arbiter | 1 | Analyst + Critic agrégé | 4096 | 60 s |

Les plafonds sont des maxima, pas les tokens réellement émis. Anthropic n'a pas de reprise locale ici et la chaîne Deep ne contient que lui ; une panne remonte vers dégradation ou échec technique selon la classe. L'architecture n'exige pas deux minutes exactement et ne dispose pas d'un plafond global de deux minutes.

Approximation nominale :
`T_deep = T_analyst + T_global + makespan(B batches, concurrence 2) + T_arbiter + validation/transport`.

Cela rend 115–123 s **plausibles**, même sans retry. L'accumulation de sorties structurées et le nombre de cibles sont des amplificateurs crédibles. Critic est un candidat dominant lorsque B grandit ; aucun stage précis n'est déclaré dominant pour les trois incidents sans traces corrélées.

### Ce que les chiffres 03A permettent réellement

Durées rapportées dans le document local 03A : Fast 638/671/407 ms ; Deep 117732/115713/122717 ms. Elles donnent environ **99,46 % / 99,42 % / 99,67 %** de la somme Fast+Deep. « Environ 99,5 % » est donc arithmétiquement compatible.

Mais ce rapport ne contient pas à lui seul une preuve indépendante de :

- 0 ms de traitement local réel : une mesure arrondie n'est pas une absence de travail ;
- 100 % de temps LLM : un aller-retour comprend réseau, orchestration et parsing ;
- la part individuelle de Critic ou Arbiter ;
- l'absence de retry fournisseur à partir du seul nombre de POST frontend.

L'Analyst mesuré isolément à 27,6 s ne permet pas de soustraire précisément sa durée d'un autre run complet. Les valeurs critic+arbiter « déduites » restent estimatives.

**DOMINANT_LATENCY_CAUSE** : attendre un Deep multi-appels avant toute interaction utile lorsque Fast ne sollicite pas ; backend actif sans l'arrêt anticipé présent au dépôt. Le gain de cet arrêt pour Malaga dépend du rang de la cible gagnante et n'est pas mesuré ici.

## Audit 8 — autorité sémantique

### Ce qui est réellement garanti

Le schéma Fast refuse tout champ d'état ou de readiness. Le court-circuit ne crée ni contrat canonique ni cycle d'exécution. READY demeure inaccessible au seul Fast. Ces garanties sont confirmées par le code et les tests.

### Ce qui ne l'est pas

Dans oprieRunTurn, la candidate Fast est affichée, puis le tour retourne **avant** oprieRequestTurn et oprieApplyTurn. Aucun validateur OPRIE ne vérifie sa nécessité avant WAIT utilisateur. Le marqueur authority=candidate n'annule pas cet effet de contrôle du dialogue.

| Option | READY par Fast ? | Nécessité de clarification validée par OPRIE ? | Verdict |
|---|---|---|---|
| B1 : Fast → question → attente, tel qu'actuel | Non | Non | Compatible seulement avec une autorité OPRIE restreinte à l'état canonique/readiness ; pas avec l'invariant étendu de sollicitation |
| B2 : Fast → validation déterministe minimale → OPRIE minimal → attente | Peut être empêché | À définir et prouver | Direction compatible avec l'invariant strict, mais contrat minimal non présent dans le code audité |

OPRIE actuel exécute trois rôles et valide un ArbiterOutput complet. Il n'existe pas d'entrée canonique prête à l'emploi transformant simplement `{type,text}` en clarification autorisée. Définir B2 demande une évolution explicite du contrat, pas rebaptiser la validation Fast « OPRIE ».

OPTION_A_ARCHITECTURALLY_SAFE = CONDITIONAL.

Si Option A signifie seulement mieux formuler le prompt Fast sans lui permettre READY : compatible avec le branchement existant. Si elle doit préserver l'autorité exclusive sur **clarification_required et confirmation_required au sens décisionnel**, B1 ne suffit pas. Ne pas approuver une correction de prompt comme preuve que cette frontière est résolue.

Un seul appel Fast peut donc suffire à afficher une première question dans le code actuel ; cela ne démontre ni sa nécessité ni sa conformité à l'invariant strict. Une latence de 0,4–0,7 s reste une observation 03A, pas une promesse sur les prochains tours.

## Audit 9 — HTTP 400 Anthropic, séparément

### Chemin exact

Onglet Architecte → archPreparerAvecApi → archExecuteurFournisseur → createProviderRoleExecutor → ROLE_DEFINITIONS.analyst → appelFournisseur → transportAnthropic → `output_config.format.schema`.

Sources : [HTML:9033](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L9033), [HTML:9043](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L9043), [HTML:19562](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L19562), [HTML:5861](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L5861), [HTML:5701](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L5701).

Ce n'est **pas** le transport Deep du Worker, qui utilise `tools[].input_schema` avec un tool forcé ([Groq source:791](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/groq/src/index.js#L791)). Réussir sur le Worker ne qualifie pas la voie de sortie JSON contrainte du navigateur.

### Schéma concerné

`ANALYST_JSON_SCHEMA.properties.issues.items.properties.kind`, construit à partir du schéma Issue :

```json
{
  "type": ["string", "null"],
  "enum": ["logical_contradiction", "constraint_tension", "priority_conflict", null]
}
```

Définition [operational-request-core:891](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/operational-request-core.js#L891), vocabulaire [operational-request-state:86](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/core/adn/operational-request-state.js#L86) ; copie embarquée dans le HTML [HTML:15376](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L15376). Le même contrat Issue est réutilisé dans d'autres schémas de rôles.

Aucune transformation destructrice type/enum n'a été trouvée dans ce chemin. `appelFournisseur` transmet le schéma ; `transportAnthropic` le place tel quel dans output_config. `normaliserSchema`, utilisé dans une autre entrée, ajoute seulement additionalProperties aux objets et ne convertit pas l'union en type simple ([HTML:3268](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L3268)).

### Pourquoi le diagnostic doit rester borné

La chaîne `logical_contradiction` **satisfait bien** le type JSON Schema string|null et appartient à l'enum. Cette construction n'est pas globalement invalide : [spécification du mot-clé type](https://json-schema.org/understanding-json-schema/reference/type).

Le message fourni localise un refus du validateur/compilateur de schéma Anthropic sur cette combinaison, avant génération. La documentation précise que les sorties structurées ne couvrent qu'un sous-ensemble de JSON Schema, sans permettre d'attribuer ici le message exact à une limitation documentée précise : [Anthropic — structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

**SCHEMA_IS_INVALID = UNKNOWN** au sens de la cause exacte du refus fournisseur. **GLOBAL est réfuté pour ce champ ; TRANSFORMATION_BUG n'est pas démontré.** L'hypothèse forte est une incompatibilité propre au chemin output_config Anthropic observé, à distinguer d'un bug du service ou d'une variante effective du payload. Le corps réseau exact et le request-id des échecs n'ont pas été fournis comme capture indépendante.

Le 400 n'est pas réessayé et remonte immédiatement ([HTML:5720](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L5720)). Cela explique un échec rapide de préparation, pas les minutes d'attente du parcours d'accueil. Confirmer la compatibilité d'une variante éventuelle demanderait un mandat de test fournisseur distinct ; aucune correction ni sonde d'inférence n'a été faite.

## Audit 10 — tests et différences avec la production

### Exécutions indépendantes

Dans une extraction isolée de main :

- Six suites Fast, routage Deep et schémas : **94/94 PASS**.
- Suites arrêt anticipé Deep et contexte de dialogue Architecte : **16/16 PASS**.
- **Total ciblé : 110/110 PASS**, aucun test ignoré.
- **Frozen guard : PASS** sur les sept ensembles hachés.

Les 3066/3066 ou 3071/3071 rapportés ne sont pas revendiqués comme rejoués ici. Frozen prouve la stabilité de régions, pas la compatibilité d'un schéma chez Anthropic ni l'identité d'un Worker déployé.

### Matrice de couverture

| Sujet | Couvert | Non couvert / risque de lecture |
|---|---|---|
| Fast question → zéro Deep | T-DN01-A, réponses injectées | Ne démontre pas que Groq choisit cette réponse pour Malaga |
| ACK → silence → Deep | T-DG01-I | Ne mesure pas sa fréquence réelle |
| Champs d'autorité interdits | Tests de schéma Fast | Ne démontre pas la nécessité de la question ni qu'un texte n'en contient qu'une |
| Deep = Anthropic seul | DPRF01, fetch simulé | Ne prouve pas à lui seul la configuration de plateforme |
| Early-stop main | ESO01, fixtures de candidats | Ne qualifie pas le Worker actif : code différent |
| Schémas rôles | required/properties/null vérifiés localement | Ce n'est pas le compilateur output_config Anthropic |
| Dialogue Architecte | 02H, syncLegacy réel dans ces tests | Ne remplace pas un test navigateur complet du pilote et de l'onglet |
| Latence | Tests de délais simulés / lecture de résultats historiques | Pas de chronométrage réel du parcours Pages dans cet audit |

Preuves : [fast-deep-trigger-dn01.test:27](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/tests/fast-deep-trigger-dn01.test.mjs#L27), [fast-solicitation-only-dg01.test:1](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/tests/fast-solicitation-only-dg01.test.mjs#L1), [deep-provider-routing-final-dprf01.test:1](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/tests/deep-provider-routing-final-dprf01.test.mjs#L1), [deep-interaction-early-stop-eso01.test:1](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/tests/deep-interaction-early-stop-eso01.test.mjs#L1), [operational-request-groq-schema-compat.test:1](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/tests/operational-request-groq-schema-compat.test.mjs#L1).

### Écarts concrets de harnais

1. **Deux orchestrations différentes vertes.** runInteractiveTurn démarre Deep immédiatement et l'attend toujours ([fast-interactive-plane:289](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/workers/shared/fast-interactive-plane.js#L289)). Ses tests disent « Deep s'exécute toujours ». Le vrai pilote HTML attend Fast et peut ne pas démarrer Deep. Ces tests restent valides pour leur fonction, mais leur intitulé n'est pas une preuve du parcours principal.
2. **syncLegacy est encore neutralisé** dans loadAnswerQuestion, [perf04-frontend-harness.helper:206](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/tests/perf04-frontend-harness.helper.mjs#L206). En production il propage la demande composite et le matériau avec événements input ([HTML:10531](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L10531)). Le harnais isole donc le dispatch, pas cette propagation. Les tests 02H compensent une partie de la lacune ; ne pas les ignorer.
3. **Moteurs d'exécution remplacés par des espions** : adpRunRapide/adpEnterArchitecte sont simulés dans loadPilot, [perf04-frontend-harness.helper:143](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/tests/perf04-frontend-harness.helper.mjs#L143). Un test d'entrée READY ne prouve pas le cycle d'exécution réel.
4. **État production incomplet** : le runtime synthétique n'expose pas createExecutionLifecycle ni le même accès window.__ATELIER_ADN_RUNTIME__/TRANSPORT_LIMITS. state.docs est vide par défaut. Ces tests n'exercent pas la construction d'un payload de matériau complet ni l'ouverture réelle du cycle.
5. **Réseau entièrement simulé**, avec réponse READY par défaut si deep n'est pas fourni ([perf04-frontend-harness.helper:111](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/tests/perf04-frontend-harness.helper.mjs#L111)). Cela valide le branchement, pas la conformité de la sortie réelle d'Arbiter.
6. **Absence de plafond de tours Fast testée comme invariant**, T-DN01-H. Une série indéfinie de questions Fast peut différer OPRIE indéfiniment ; les tests n'établissent pas qu'une réponse utilisateur entraîne nécessairement une escalade.

Aucun de ces points ne signifie que tous les tests sont inutiles. Ils imposent de borner la conclusion à ce qu'ils exécutent vraiment.

## Audit 11 — doublons et dette active uniquement

- **Lien V10 actif mais mort : 404**, confirmé depuis l'accueil réel.
- **Code Deep source / code Deep déployé divergents**, démontré ; facteur direct du runtime.
- **Runtime embarqué / source partagé / generated.js** : plusieurs représentations ; qualifier le HTML par hash ne qualifie pas le Worker.
- **Ancien coordinateur parallèle encore exporté/testé**, alors que le pilote principal est Fast-first ; les commentaires « Deep part le premier » dans le HTML ne décrivent plus oprieRunTurn ([HTML:21579](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L21579), [HTML:22036](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L22036)).
- **Façade Decision Provider encore exposée** avec endpoints Workers AI/Groq ; pas dans le chemin Malaga, pas une seconde décision à imputer au clic principal ([HTML:22204](https://github.com/c-concept-dev/C-Concept-Dev/blob/b29b10de9e969b69a90d78407137658196c8a25c/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html#L22204)).
- **Deux mécanismes OPRIE accessibles** : serveur dans le parcours d'accueil, exécuteur navigateur dans l'onglet Architecte. Même registre sémantique, mais mécanismes de schema output différents.
- **03B local distinct de main** : ne pas faire passer sa nouvelle consigne pour celle testée ou déployée.

Aucun nettoyage général, suppression de doublon ou refactor réalisé.

## Audit 12 — verdict et suites recommandées

### Ordre recommandé, sans mise en œuvre

1. **Fermer la provenance de release** : décider quelle version doit être testée et aligner explicitement les preuves HTML / bundle Worker / configuration. L'écart early-stop est déjà démontré ; ne pas diagnostiquer la production comme si cette optimisation y tournait.
2. **Trancher le contrat de sollicitation Fast** : READY reste protégé, mais l'autorité sur la nécessité de clarifier n'est pas exercée par OPRIE dans B1. Une correction de prompt seule ne tranche pas ce point.
3. **Traiter le 400 Architecte comme défaut de compatibilité de transport distinct**, avec payload exact et request-id avant de modifier le contrat partagé.
4. **Qualifier le parcours bout en bout**, puis seulement mesurer l'effet sur Malaga avec logs corrélés par invocation_id et temps par rôle/batch.

### Blocages bêta

- Identité source/runtime non alignée pour Deep.
- Latence réelle rapportée incompatible avec une première interaction fluide lorsque Fast reste silencieux.
- Frontière d'autorité de la sollicitation à expliciter si l'invariant porte sur les cinq états, pas seulement READY.
- Parcours Architecte/API Anthropic signalé en échec 400, non qualifié par les tests locaux.
- Lien principal ancien de l'accueil cassé.

### Rapport final demandé

```text
REPOSITORY =
c-concept-dev/C-Concept-Dev

MAIN_HEAD =
b29b10de9e969b69a90d78407137658196c8a25c

ACTUAL_ATELIER_HTML =
tools/Atelier Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html

HTML_MATCHES_BETA_CHECKPOINT =
YES

GITHUB_PAGES_SERVES_EXPECTED_HTML =
YES

FAST_WORKER_SOURCE =
tools/Atelier Prompts/workers/groq/src/index.js

FAST_WORKER_DEPLOYMENT_IDENTITY =
UNPROVEN
Correspondance intégrale au checkpoint non prouvée.
Version active identifiée : 9a4d536a-12ba-4bff-bc6d-eeba86cffb91.
Prompt Fast et routage vérifiés ; divergence Deep dans le même service.

ANTHROPIC_WORKER_DEPLOYMENT_IDENTITY =
UNPROVEN
Pas de Worker Anthropic séparé sur ce chemin.
Même service atelier-decision-groq ; correspondance à main réfutée pour Critic.
REPO_RUNTIME_MATCH = NO.

MALAGA_CALL_GRAPH =
click → routeCurrentMode → oprieRunTurn → Fast/Groq
→ ACKNOWLEDGE projeté en silence, si cette sortie est produite
→ Deep/Anthropic → Analyst → Critic global → B batches (concurrence 2)
→ Arbiter → OPRIE → clarification UI.

FAST_DECISION_FOR_MALAGA =
ACKNOWLEDGE dans les runs 03A rapportés ; non remesuré.
Aucune décision déterministe pour cette phrase dans le code.

FAST_CAN_ASK_NECESSARY_QUESTION =
YES

DEEP_REQUIRED_FOR_FIRST_QUESTION =
NO
Le court-circuit actuel permet une question Fast sans Deep,
mais ne fait pas valider sa nécessité par OPRIE.

DOMINANT_LATENCY_CAUSE =
Attente du pipeline Deep multi-appels lorsque Fast ne sollicite pas.
Backend actif sans early-stop présent dans main.
Répartition exacte par rôle non mesurée indépendamment.

CLAUDE_03A_DIAGNOSIS =
PARTIALLY_CONFIRMED

OPTION_A_ARCHITECTURALLY_SAFE =
CONDITIONAL

ANTHROPIC_400_ROOT_CAUSE =
Refus signalé du schéma nullable-enum via output_config.format,
sur le transport navigateur, distinct du tool_use Worker.
Schéma du champ valide en JSON Schema ; cause précise du rejet fournisseur UNKNOWN.

PRODUCTION_TEST_GAPS =
Choix réel Fast ; compilation Anthropic output_config ;
identité de déploiement ; intégration complète DOM/état/transport ;
ancien coordinateur parallèle ; syncLegacy neutralisé dans un harnais.

DEPLOYMENT_UNCERTAINTIES =
Version plateforme connue, équivalence source complète non établie.
Écart Critic main/runtime confirmé ; navigateur particulier non inspecté.

BETA_BLOCKERS =
Désalignement Deep ; latence de première interaction rapportée ;
autorité de sollicitation à clarifier ; 400 Architecte ; lien V10 cassé.

FIRST_FIX_RECOMMENDED =
Fermer l'identité de release et l'écart source/runtime avant de qualifier
un changement Fast. Aucun déploiement autorisé ou effectué dans cet audit.

PRODUCTION_CODE_CHANGED =
NO

COMMIT =
NO

PUSH =
NO

DEPLOY =
NO
```

## Annexe A — preuve du Critic déployé

Lecture GET `/accounts/{account_id}/workers/scripts/atelier-decision-groq/content/v2`. Les numéros 1997–2068 correspondent à la réponse multipart brute, pas au fichier source Git. Le déploiement actif a été revérifié après la lecture.

Extrait exact du code compilé reçu :

```javascript
async function runCriticBatchedPipeline({ original_request, clarification_history = [], analyst_output, previous_vetoes = [], material_context, capability, candidateFamilyGroups } = {}, { executeGlobal, executeBatch, concurrency, signal } = {}) {
  const questionReviewTargets = buildQuestionReviewTargets(analyst_output);
  const batchPlan = computeBatchPlan(questionReviewTargets, capability);
  const familyGroups = list2(candidateFamilyGroups).length > 0 ? candidateFamilyGroups : [LADDER_ALTERNATIVE_VALUES];
  const globalRaw = await executeGlobal({ original_request, clarification_history, analyst_output, previous_vetoes, material_context });
  const globalOutput = filterEmptyCandidateUnsupportedAdditions(
    typeof globalRaw === "string" ? parseJsonMaybeFenced(globalRaw) : globalRaw,
    analyst_output
  );
  const tasks = [];
  for (let index = 0; index < batchPlan.length; index += 1) {
    const batchTargets = batchPlan[index];
    const issueIds = batchTargets.map((t) => t.issue_id);
    for (let groupIndex = 0; groupIndex < familyGroups.length; groupIndex += 1) {
      const familyGroup = familyGroups[groupIndex];
      tasks.push({
        batchIndex: index,
        groupIndex,
        issueIds,
        familyGroup,
        run: /* @__PURE__ */ __name(() => executeBatch({ original_request, clarification_history, analyst_output, batchTargets, batchIndex: index, issueIds, familyGroup, groupIndex }), "run")
      });
    }
  }
  const settled = await runBounded(tasks.map((task) => task.run), { concurrency, signal });
  const groupRawsByBatch = batchPlan.map(() => new Array(familyGroups.length));
  const batchSucceeded = batchPlan.map(() => true);
  const batchFailures = [];
  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
    const { batchIndex, groupIndex, issueIds, familyGroup } = tasks[taskIndex];
    const verdict = settled[taskIndex];
    if (verdict.status === "fulfilled") {
      const raw = verdict.value;
      try {
        groupRawsByBatch[batchIndex][groupIndex] = typeof raw === "string" ? parseJsonMaybeFenced(raw) : raw;
        continue;
      } catch (error2) {
        batchFailures.push({ batchIndex, groupIndex, issueIds, familyGroup, error: error2 instanceof Error ? error2.message : String(error2) });
        batchSucceeded[batchIndex] = false;
        continue;
      }
    }
    const error = verdict.reason;
    batchFailures.push({ batchIndex, groupIndex, issueIds, familyGroup, error: error instanceof Error ? error.message : String(error) });
    batchSucceeded[batchIndex] = false;
  }
  const batchResults = [];
  for (let index = 0; index < batchPlan.length; index += 1) {
    if (!batchSucceeded[index]) continue;
    const groupRaws = groupRawsByBatch[index];
    batchResults.push(familyGroups.length === 1 ? groupRaws[0] : mergeCandidateGroups(familyGroups, groupRaws));
  }
  if (batchFailures.length > 0) {
    throw Object.assign(new Error("runCriticBatchedPipeline: un ou plusieurs batches de Substitution Review ont \xE9chou\xE9 techniquement."), {
      technical_state: "partial_failure",
      batchFailures,
      succeededBatchCount: batchResults.length,
      totalBatchCount: batchPlan.length
    });
  }
  const materializedBatchResults = batchResults.map(
    (batchResult) => Object.fromEntries(Object.entries(batchResult).map(([issueId, entry]) => [issueId, materializeSubstitutionReviewFromCandidates(entry?.candidates)]))
  );
  const assembledReviews = assembleSubstitutionReviews(questionReviewTargets, materializedBatchResults);
  const gatedReviews = applySubstitutionGate(assembledReviews, {
    vetoes: globalOutput?.vetoes,
    semantic_drift_detected: globalOutput?.semantic_drift_detected === true
  });
  const derived = deriveCriticConsequences({ ...globalOutput, question_substitution_review: gatedReviews });
  return validateCriticOutput(derived);
}
__name(runCriticBatchedPipeline, "runCriticBatchedPipeline");
```

La différence observable est `tasks` construite pour tout batchPlan puis un unique `await runBounded(...)`, sans boucle waveStart ni branche de dernier recours.

## Annexe B — paramètres retrouvés dans le contenu déployé

Extraits contrôlés directement dans la réponse de la plateforme :

```text
FAST_PROVIDER_ORDER = Object.freeze(["groq"])
ROLE_PROVIDER_ORDER = Object.freeze(["anthropic"])
ROLE_MAX_OUTPUT_UNITS = 4096
FAST_INTERACTION_SYSTEM_PROMPT = ancien prompt de dernier recours, reproduit audit 6
```

Ces extraits prouvent ces paramètres, pas l'identité complète des 261 088 caractères de l'enveloppe de contenu. L'ETag plateforme est reporté comme métadonnée, pas présenté comme un SHA calculé localement.

---

Seul ce livrable documentaire est ajouté au dépôt par l'audit. Les modifications/commit 03B observés pendant la revue sont extérieurs à mon intervention.

