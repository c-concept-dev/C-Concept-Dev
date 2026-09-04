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
| Commit local | `b52589bb8b69396ea874c27ac0165cf3a04b20e4` |
| Date du commit | 2026-09-04T15:43:57+02:00 |

## Artefact canonique

Un seul HTML est servi. Il est autonome : aucun script, aucune feuille de style,
aucune police et aucune image ne sont chargés depuis un tiers.

| Champ | Valeur |
| --- | --- |
| Chemin | `atelier-prompts-v11.5-lot10g-decision-provider.html` |
| Taille | 1304930 octets |
| SHA-256 | `3efa45ff351f1d293023c062a70540241871e6f7d605c70670db6e1227b2a6dc` |

## Runtime compilé

Le bloc embarqué dans la page et le fichier généré sont comparés octet pour octet.

| Champ | Valeur |
| --- | --- |
| Fichier | `core/adn/browser-runtime.generated.js` |
| SHA-256 du fichier | `b7abd82ec53792441e3480cb6b6b73625d1c0b3d36fbd6a7a723358a7bccf139` |
| SHA-256 du bloc embarqué | `b7abd82ec53792441e3480cb6b6b73625d1c0b3d36fbd6a7a723358a7bccf139` |
| Identiques | oui |
| Blocs de runtime dans la page | 1 |
| Empreinte des sources compilées | `8f6f8922a038b95b3870f63c1ae4578558f80eba494b7f1a4a7521cbb97ebc60` |

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

39 fichiers. C'est ce qui doit exister pour **servir** la page,
**redéployer** les workers qui la soutiennent, et **reconstruire puis vérifier**
l'artefact. Le manifeste lui-même en est exclu : un document ne peut pas contenir
sa propre empreinte.

| Empreinte du jeu | `806a55ba1aff1631edfd641ab8ed0179f2884341c50761a32fc4191490c504fd` |
| --- | --- |

| Classe | Fichier | SHA-256 |
| --- | --- | --- |
| REQUIRED_BUILD | `anti-regression-baseline.json` | `7bd0fcca3f3ed226e3fdd30ee52dc204dae158dbde8842c08731054a1f58e7d6` |
| REQUIRED_HTML | `atelier-prompts-v11.5-lot10g-decision-provider.html` | `3efa45ff351f1d293023c062a70540241871e6f7d605c70670db6e1227b2a6dc` |
| REQUIRED_BUILD | `core/adn/adaptive-lock-selector.js` | `15d3154d639b761747a26215f2ec59eb6b121e6072187b6a2dd611eefe5b65ea` |
| REQUIRED_BUILD | `core/adn/adn-state.js` | `323c60c3b224193bf957fba38d5668fa2a881a06c8bf301161b1751f1d6bb2e0` |
| REQUIRED_BUILD | `core/adn/arch-canonical-enrichment.js` | `ee87dff7cd6c822b8aaba63edd05eff0614749ec6044fe0bacd22531b1ab8fc0` |
| REQUIRED_BUILD | `core/adn/browser-runtime.generated.js` | `b7abd82ec53792441e3480cb6b6b73625d1c0b3d36fbd6a7a723358a7bccf139` |
| REQUIRED_BUILD | `core/adn/engine-adapters.js` | `81e206b5bb1705c404a494dd136fea1fd17bb7cd502aca2855b6bf6f9b161255` |
| REQUIRED_BUILD | `core/adn/execution-lifecycle.js` | `accdee01c6c294f33e28be321024501c152e2fdd6e53298575c2450adebf8ec7` |
| REQUIRED_BUILD | `core/adn/execution-readiness.js` | `5276f0f8cfafd9b1fdae72b4f26193ab6f7639196bee15d80c048844545bfb18` |
| REQUIRED_BUILD | `core/adn/index.js` | `83897c9958d4102243efdd180e43872c91df20104884cbffe8a4c9c621056513` |
| REQUIRED_BUILD | `core/adn/intent-preservation.js` | `9e3dfcc8acecd0169e2f3238fa2feb07199d6652394cfbf6e00b390e3f890484` |
| REQUIRED_BUILD | `core/adn/mode-contracts.js` | `3c8c7f414213166b1790674e9195cf072c73eb427ddac37f9a51399167149359` |
| REQUIRED_BUILD | `core/adn/operational-request-state.js` | `10eb9dcdeb674b68d70118612c9c4cf827dbce2685ca533d5a58b93d82ca0c6c` |
| REQUIRED_BUILD | `core/adn/oprie-canonical-mapping.js` | `865450f49e471eb48dbcd8ef97b7922384d67f18e9d2925d7dda3f38e220cb4c` |
| REQUIRED_BUILD | `core/adn/oprie-manual-roundtrip.js` | `34eaf03a4b68a6932f5a7a5767d3a3e4c8a9c1e335539f88372c7510ae1042af` |
| REQUIRED_BUILD | `core/adn/orchestration-policy.js` | `53007469046156d821085862cc1264d18c196681206a0cb0ee92041de5340dc1` |
| REQUIRED_BUILD | `core/adn/output-compliance-gate.js` | `182ec76d44014121dbfba67d3442131fc4c525ce9989eb4948cb5f82c16466e2` |
| REQUIRED_BUILD | `core/adn/prompt-contract-gate.js` | `49a31369b431ab8d93007a6ddc4a9acd0d9923145bf4c076b1cb3d179a56d1b8` |
| REQUIRED_BUILD | `core/adn/rapide-canonical-enrichment.js` | `b856015972aeb206b1af337c4a50cfa09c95098d8ba29e9a04e93ce9685ea06a` |
| REQUIRED_BUILD | `core/adn/routing-engine.js` | `529a73614a5ebf8262367bb1b2facc3fcedd40df73bd6c4ed16048a825a9930c` |
| REQUIRED_DOC | `docs/OPEN-DEBTS.md` | `38a3cdb074f85a2549b8549160871adea896bbc241fa8fecae5aa17cea870eee` |
| REQUIRED_DOC | `docs/PERF-REAL-01-REPORT.md` | `84fc84c864afc92f156d2bbe801cd54aa57070c3a1b6caf018b02f0a05ccc104` |
| REQUIRED_BUILD | `package.json` | `c89fdaa9b4ce892b8a75eac66b42ddc20868098b608c24fc6ed1d30c8e064693` |
| BUILD_TOOL | `tools/build-adn-browser-runtime.mjs` | `c484c3b6603464a4d2c6e140eb3ed605ea4704ada4c334498b05ba9c8f4f5aeb` |
| BUILD_TOOL | `tools/build-release-manifest.mjs` | `70bcb641500d52f5cea1fa095932f8b004c59467e97d4e1669f82e64330ba8fb` |
| BUILD_TOOL | `tools/frozen-guard.mjs` | `fa1d9b3e323bf350157f623e49e4d91d40afabe12a0adf7415ac90343bfe038c` |
| REQUIRED_RUNTIME | `workers/groq/src/index.js` | `132c14c6404266deca2385abb03a56428bbb19549e1eaecc5201c85c15d25329` |
| REQUIRED_RUNTIME | `workers/groq/wrangler.jsonc` | `90a49443fde0f6735a676887b6047b1746f0d6176a6465a923234e5471c0f71f` |
| REQUIRED_RUNTIME | `workers/shared/bounded-concurrency.js` | `033c06782be23a64103b193ce005dccc894d0a741f3687dcf7ee566b0a817973` |
| REQUIRED_RUNTIME | `workers/shared/decision-core.js` | `2879c8e720146b4d2a620f76e329aa1a2e9f1ae3c7725749bbe6cbaf31b32869` |
| REQUIRED_RUNTIME | `workers/shared/fast-interaction-endpoint.js` | `37fe4af9be7a7e9aa1e8672004fe4f4d688e4e7eaa4bd24a78be8f6c4e9855e9` |
| REQUIRED_RUNTIME | `workers/shared/fast-interactive-plane.js` | `3259b2d54357d1e2d60be4e891887d7e3f0b493090589b5861aa96c672016eea` |
| REQUIRED_RUNTIME | `workers/shared/operational-request-core.js` | `9bf134a653c6270113ec429932eefbf8d41962fc5eb3bd46f08549c0164f6b8e` |
| REQUIRED_RUNTIME | `workers/shared/operational-request-orchestrator.js` | `82b806abcd7e3054dd070cfac533746efeb5fdb508365af4ad21baf4885281e8` |
| REQUIRED_RUNTIME | `workers/shared/provider-ha.js` | `19ae3e7af098a875b30e59e9a8c0257a09b4709b810b2c8fe5fa2a4dbcabf1da` |
| REQUIRED_RUNTIME | `workers/shared/provider-rate-control.js` | `38da9840452fa70e444108559d78b9423e733208cf05e0a23f350936e3a94abd` |
| REQUIRED_RUNTIME | `workers/shared/role-degradation.js` | `2259190f7f3a2b2f224605fc1b3ae8c4d6552f88e4cf4d56e34875b61a6a9ab7` |
| REQUIRED_RUNTIME | `workers/workers-ai/src/index.js` | `a198c0f8e845122f42e57e1fae18ba21f50a4c822cfca45acea6ca8ee2167643` |
| REQUIRED_RUNTIME | `workers/workers-ai/wrangler.jsonc` | `2bb01da47bbb8d869da3ab0b31d2cd7d40ed98c9008fcced69c3e94072a3be6f` |

## Ce qui ne part pas en release

| Classe | Fichiers | Raison |
| --- | --- | --- |
| REQUIRED_TEST_ONLY | 127 | preuves ; ne sont pas servies |
| EVALUATION_ONLY | 193 | bancs et campagnes, dont le worker `…-local-only` |
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
| Tests au vert | 2632 |

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
