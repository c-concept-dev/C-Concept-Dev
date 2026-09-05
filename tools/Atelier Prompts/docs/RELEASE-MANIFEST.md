# Manifeste de release — Atelier Prompts

> Ce document est **documentaire**. Aucun code de production ne le lit, il ne
> décide de rien. Il constate ce que contient l'artefact local à un instant
> donné, pour qu'une publication ultérieure sache exactement ce qu'elle publie.
>
> Régénérer avec `node tools/build-release-manifest.mjs --tests=<N>`.
> Tout y est calculé, sauf les deux observations signalées comme telles.

## Identité

| Champ | Valeur |
| --- | --- |
| Lot | HTML-FINAL-02 |
| Artefact | Atelier de prompts — V11.5 LOT 10G Adaptive Decision Pipeline |
| Commit local | `0ab187e50a2a676cec7ad5fb9b5fd86b7c17674d` |
| Date du commit | 2026-09-05T19:10:53+02:00 |

## Artefact canonique

Un seul HTML est servi. Il est autonome : aucun script, aucune feuille de style,
aucune police et aucune image ne sont chargés depuis un tiers.

| Champ | Valeur |
| --- | --- |
| Chemin | `atelier-prompts-v11.5-lot10g-decision-provider.html` |
| Taille | 1325798 octets |
| SHA-256 | `6be95369eaf3611bc72b7d5d7972ffbb6a1f19c8901355c58da171b4274eccde` |

## Runtime compilé

Le bloc embarqué dans la page et le fichier généré sont comparés octet pour octet.

| Champ | Valeur |
| --- | --- |
| Fichier | `core/adn/browser-runtime.generated.js` |
| SHA-256 du fichier | `f00c82ca9a61d56565c7fd586aae6ded349cba5e3cfbd00c014da11e0d3d8f8a` |
| SHA-256 du bloc embarqué | `f00c82ca9a61d56565c7fd586aae6ded349cba5e3cfbd00c014da11e0d3d8f8a` |
| Identiques | oui |
| Blocs de runtime dans la page | 1 |
| Empreinte des sources compilées | `dbbf18cf36e6d58bc93b151ef33fb07459106a494f39afe14c5194173e8ecffa` |

## Plages gelées

| Plage | SHA-256 |
| --- | --- |
| moteur Rapide | `3725f2c9335cb176084cf62c51472b5f02a1faa5bed496c424954c841a689664` |
| moteur Architecte | `bebb29dc9a0b6f70fb23b22cf13e6573688d8e2dbfbfd54356a14bf1522b6d1e` |
| moteur Atelier | `8c3511538a96d4be3953270c4a5463da6b8d4807187a0b7d4b1c31c0e4589802` |
| FORMATS | `f4c9f1da5a14ecbe28d3cd0853871aa621909360ab6475bebeb76bc2191e141b` |
| VERROUS | `0019d7e26efab37164b435667d89494135cc4ae7f9f8206e95472435d1dd63ff` |
| ARCH_SYSTEM | `7fc7b736f6b80049c42a39d74a0fae76eee26d9e2af8249c7761de1ec3236317` |
| ARCH_SCHEMA | `a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b` |

## Jeu de release

53 fichiers. C'est ce qui doit exister pour **servir** la page,
**redéployer** les workers qui la soutiennent, et **reconstruire puis vérifier**
l'artefact. Le manifeste lui-même en est exclu : un document ne peut pas contenir
sa propre empreinte.

| Empreinte du jeu | `31b6a280df588568e8f68cb5522614e806e8d114856692c56de52ec0ebd8f70e` |
| --- | --- |

| Classe | Fichier | SHA-256 |
| --- | --- | --- |
| REQUIRED_BUILD | `anti-regression-baseline.json` | `7bd0fcca3f3ed226e3fdd30ee52dc204dae158dbde8842c08731054a1f58e7d6` |
| REQUIRED_HTML | `atelier-prompts-v11.5-lot10g-decision-provider.html` | `6be95369eaf3611bc72b7d5d7972ffbb6a1f19c8901355c58da171b4274eccde` |
| REQUIRED_BUILD | `core/adn/adaptive-lock-selector.js` | `15d3154d639b761747a26215f2ec59eb6b121e6072187b6a2dd611eefe5b65ea` |
| REQUIRED_BUILD | `core/adn/adn-state.js` | `323c60c3b224193bf957fba38d5668fa2a881a06c8bf301161b1751f1d6bb2e0` |
| REQUIRED_BUILD | `core/adn/arch-canonical-enrichment.js` | `ee87dff7cd6c822b8aaba63edd05eff0614749ec6044fe0bacd22531b1ab8fc0` |
| REQUIRED_BUILD | `core/adn/browser-runtime.generated.js` | `f00c82ca9a61d56565c7fd586aae6ded349cba5e3cfbd00c014da11e0d3d8f8a` |
| REQUIRED_BUILD | `core/adn/engine-adapters.js` | `81e206b5bb1705c404a494dd136fea1fd17bb7cd502aca2855b6bf6f9b161255` |
| REQUIRED_BUILD | `core/adn/execution-lifecycle.js` | `accdee01c6c294f33e28be321024501c152e2fdd6e53298575c2450adebf8ec7` |
| REQUIRED_BUILD | `core/adn/execution-readiness.js` | `5276f0f8cfafd9b1fdae72b4f26193ab6f7639196bee15d80c048844545bfb18` |
| REQUIRED_BUILD | `core/adn/index.js` | `83897c9958d4102243efdd180e43872c91df20104884cbffe8a4c9c621056513` |
| REQUIRED_BUILD | `core/adn/intent-preservation.js` | `9e3dfcc8acecd0169e2f3238fa2feb07199d6652394cfbf6e00b390e3f890484` |
| REQUIRED_BUILD | `core/adn/mode-contracts.js` | `3c8c7f414213166b1790674e9195cf072c73eb427ddac37f9a51399167149359` |
| REQUIRED_BUILD | `core/adn/operational-request-state.js` | `dbb6261d95d2d7b09fe1531cb95050315f13b2cdc2e570662ace98aa74c56953` |
| REQUIRED_BUILD | `core/adn/oprie-canonical-mapping.js` | `865450f49e471eb48dbcd8ef97b7922384d67f18e9d2925d7dda3f38e220cb4c` |
| REQUIRED_BUILD | `core/adn/oprie-manual-roundtrip.js` | `34eaf03a4b68a6932f5a7a5767d3a3e4c8a9c1e335539f88372c7510ae1042af` |
| REQUIRED_BUILD | `core/adn/orchestration-policy.js` | `53007469046156d821085862cc1264d18c196681206a0cb0ee92041de5340dc1` |
| REQUIRED_BUILD | `core/adn/output-compliance-gate.js` | `182ec76d44014121dbfba67d3442131fc4c525ce9989eb4948cb5f82c16466e2` |
| REQUIRED_BUILD | `core/adn/prompt-contract-gate.js` | `49a31369b431ab8d93007a6ddc4a9acd0d9923145bf4c076b1cb3d179a56d1b8` |
| REQUIRED_BUILD | `core/adn/rapide-canonical-enrichment.js` | `b856015972aeb206b1af337c4a50cfa09c95098d8ba29e9a04e93ce9685ea06a` |
| REQUIRED_BUILD | `core/adn/routing-engine.js` | `529a73614a5ebf8262367bb1b2facc3fcedd40df73bd6c4ed16048a825a9930c` |
| REQUIRED_DOC | `docs/CAPACITY-SLA-DEFINITION-01.md` | `7df757a294b95567cac340b3824d05aaf9ab8fea915fa7ed51917163b7e69fde` |
| REQUIRED_DOC | `docs/DEEP-COUT-JETONS-01.md` | `5d298c68b4b7d5fe6adc285e828abd6c0a33a611c2407013835162009302e3a2` |
| REQUIRED_DOC | `docs/FAST-CAPACITY-ADMISSION-01.md` | `27bb4a5f4c197828cdf65f60e0c9de2d775f637cb7eb691c52162cbe8c279d12` |
| REQUIRED_DOC | `docs/OPEN-DEBTS.md` | `cce92ba10b4bb7e8698fc8a6db8791f1af85c6466028baf6bd7f421c7c42a65d` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-CONTENT-01.md` | `f054f6b5a0c39e92b00a1ef49ce701f7623ae1f6976760e8efa3f733e6382427` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-CONTENT-02.md` | `4a2cb1bfc2915099b982df7ab1fb35e2e05eaa0424b81813f963c80c67f405bf` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-CONTEXT-01.md` | `2ce2729e3e6ccae1aa4d740d2302afe19f07ba80336d108a406a41daa621ef76` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-CONTEXT-02.md` | `32570d057739a6042d9d367d721a20035b02621f72ae61e90f6b7e0280bbff3b` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-INTERPRETATION-01.md` | `e453ca80c15e984fbf549dc6b26c3313103bc4dc7b287be8ff5d07084552946b` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-PROVENANCE-01.md` | `291cdf010a20e1bdbc8788db7e49c71c41b3d437bd70fa165d62dd2fc3325ce1` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-PROVENANCE-02.md` | `57a928e2037c95c04038e51cc6691d55e99f2672ef8c918377f4a878cbcc2148` |
| REQUIRED_DOC | `docs/OPRIE-QUALITY-PARITY-01.md` | `d46a60a86d4883e935e575e0ec8e1ce9f177614942903ee64ec88560d6eb1a2b` |
| REQUIRED_DOC | `docs/OPRIE-REFERENCE-ORACLE-01.md` | `e09e87dd9092a3e98f59aa1773dc19ede0cda8fbf63fdd8be226c8d127a8814f` |
| REQUIRED_DOC | `docs/PERF-CAPACITY-DECISION-01.md` | `6a0e659414e4d3e28c320646b8a8f839a619f80455a037ba823bc8329eb7c553` |
| REQUIRED_DOC | `docs/PERF-NOMINAL-PROVIDER-01.md` | `2bd66e87aedf0b0e29fe095db6177a503bb29d5928d222befa87012378eea0fd` |
| REQUIRED_DOC | `docs/PERF-REAL-01-REPORT.md` | `4d3b16bf400738cffb21995deb9302788dc67dd8da25649cecc7592b345bd77e` |
| REQUIRED_BUILD | `package.json` | `c89fdaa9b4ce892b8a75eac66b42ddc20868098b608c24fc6ed1d30c8e064693` |
| BUILD_TOOL | `tools/build-adn-browser-runtime.mjs` | `c484c3b6603464a4d2c6e140eb3ed605ea4704ada4c334498b05ba9c8f4f5aeb` |
| BUILD_TOOL | `tools/build-release-manifest.mjs` | `70bcb641500d52f5cea1fa095932f8b004c59467e97d4e1669f82e64330ba8fb` |
| BUILD_TOOL | `tools/frozen-guard.mjs` | `fa1d9b3e323bf350157f623e49e4d91d40afabe12a0adf7415ac90343bfe038c` |
| REQUIRED_RUNTIME | `workers/groq/src/index.js` | `d4020d27f72d38bfd770e6e1fc243daba22aee2d1bfb0191f773cb3be8970e51` |
| REQUIRED_RUNTIME | `workers/groq/wrangler.jsonc` | `a49272421d15e9348d5e389e37e36a493f40c6a65c13ec0bbd8e56ac964ebfb7` |
| REQUIRED_RUNTIME | `workers/shared/bounded-concurrency.js` | `033c06782be23a64103b193ce005dccc894d0a741f3687dcf7ee566b0a817973` |
| REQUIRED_RUNTIME | `workers/shared/decision-core.js` | `2879c8e720146b4d2a620f76e329aa1a2e9f1ae3c7725749bbe6cbaf31b32869` |
| REQUIRED_RUNTIME | `workers/shared/fast-interaction-endpoint.js` | `37fe4af9be7a7e9aa1e8672004fe4f4d688e4e7eaa4bd24a78be8f6c4e9855e9` |
| REQUIRED_RUNTIME | `workers/shared/fast-interactive-plane.js` | `3259b2d54357d1e2d60be4e891887d7e3f0b493090589b5861aa96c672016eea` |
| REQUIRED_RUNTIME | `workers/shared/operational-request-core.js` | `a4ca581ea29091be80b9e9352fd73c2cd48f791c4df4d0aa112a43a3efe6def6` |
| REQUIRED_RUNTIME | `workers/shared/operational-request-orchestrator.js` | `0a267e72665c49b98f6b7bcc59bc40737dbd3aba64d6193a9cd0e979643a11fc` |
| REQUIRED_RUNTIME | `workers/shared/provider-ha.js` | `19ae3e7af098a875b30e59e9a8c0257a09b4709b810b2c8fe5fa2a4dbcabf1da` |
| REQUIRED_RUNTIME | `workers/shared/provider-rate-control.js` | `38da9840452fa70e444108559d78b9423e733208cf05e0a23f350936e3a94abd` |
| REQUIRED_RUNTIME | `workers/shared/role-degradation.js` | `2259190f7f3a2b2f224605fc1b3ae8c4d6552f88e4cf4d56e34875b61a6a9ab7` |
| REQUIRED_RUNTIME | `workers/workers-ai/src/index.js` | `a198c0f8e845122f42e57e1fae18ba21f50a4c822cfca45acea6ca8ee2167643` |
| REQUIRED_RUNTIME | `workers/workers-ai/wrangler.jsonc` | `2bb01da47bbb8d869da3ab0b31d2cd7d40ed98c9008fcced69c3e94072a3be6f` |

## Ce qui ne part pas en release

| Classe | Fichiers | Raison |
| --- | --- | --- |
| REQUIRED_TEST_ONLY | 145 | preuves ; ne sont pas servies |
| EVALUATION_ONLY | 210 | bancs et campagnes, dont le worker `…-local-only` |
| AUDIT_ONLY | 74 | relevés des lots passés |
| PROVENANCE | 2 | trace de la dérivation de l'artefact courant |

## Dépendances réseau

| Type | Nombre | Détail |
| --- | --- | --- |
| Ressource statique distante | 0 | aucune : images en `data:`, styles et scripts inclus |
| Fournisseur à l'exécution | 3 | les deux workers de décision, et l'API du fournisseur avec la clé de la personne |

## État des chaînes

*Observation reportée d'un lancement de tests : ces lignes ne sont pas recalculées
par ce script.*

| Chaîne | État |
| --- | --- |
| IA / orchestration | CLOSED |
| MODE | CLOSED |
| CLEAN | CLOSED |
| FORMAT-STRUCT-01 | CLOSED |
| EXEC-PHASE-INSTRUMENT-01 | CLOSED |
| FC01b FINAL | CLOSED |
| HTML-FINAL-01 / 01A | CLOSED |
| Tests au vert | 2851 |

## Dette encore ouverte

- **PERF-REAL-01** — la latence réelle d'un fournisseur réel n'est pas mesurée.

## Publication

| Champ | Valeur |
| --- | --- |
| LOCAL_ARTIFACT_READY | YES |
| RELEASE_READY | NO |
| PUSH_PERFORMED | NO |
| DEPLOY_PERFORMED | NO |

`RELEASE_READY` reste **NO** tant que `PERF-REAL-01` est ouverte : l'artefact est
complet et vérifié localement, mais rien ici ne dit ce qu'il coûte en temps réel
à quelqu'un qui l'utilise avec un vrai fournisseur.
