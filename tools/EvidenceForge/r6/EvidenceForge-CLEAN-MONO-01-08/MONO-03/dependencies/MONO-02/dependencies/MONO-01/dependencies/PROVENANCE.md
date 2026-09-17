# Provenance des dépendances gelées — MONO-01

Chaque fichier de ce dossier est une **copie bytewise** d'un fichier source d'un paquet
canonique gelé (MONO-00), jamais modifiée ici. MONO-01 les `require()` pour appeler les
vraies fonctions gelées depuis les ports — jamais pour les réécrire ou les copier-coller
dans un port.

| Fichier | Paquet source | Hash SHA-256 (recalculé ici) |
|---|---|---|
| ef-orch-hash-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 8722ec43529d848d3f1a0bebfe75d12682ba2ac7963e94edf4c18c006d8032e4 |
| ef-pr-gen-mission-dimension-set-v1.js | EF-PR-GEN-01-FINAL.zip | 750cb892d674e402d6cf16980a41ca1174bd5bc3b66d22715d98d76dc79040de |
| ef-pr-gen-mission-document-mapping-v1.js | EF-PR-GEN-01-FINAL.zip | a10fcd0919a2e6fda32b5bd3c44b6ec4e0e1f12d01eda1220c94584eaaa69ef0 |
| ef-pr-gen-heuristic-policy-v1.js | EF-PR-GEN-01-FINAL.zip | 08bcb7c93080b3156d9a5f27bc6234c7015081efeb48146ef1d61ce615f55e45 |
| ef-02d1-eligibility-v1.js | EF-02D-v1.zip / src/ | f1a74043093d873c1b70af8bc9a78ace66c62a58e834eb8412dd979abe3478e0 |
| ef-02d2-mission-relevance-v1.js | EF-02D-v1.zip / src/ | d24d3f953025c21b1f1af5a0d44feb04deb5102777a1c03aaaa560b78f09d96f |
| ef-02d1d2-orchestrator-v1.js | EF-02D-v1.zip / src/ | c5d0f9b74de7b7c898f2ded6f10dbfdb75ee7712a73c4b181f451d501a78da78 |
| ef-02d3-coverage-panel-v1.js | EF-02D-v1.zip / src/ | 547bd49c36521f30536e422a99524d47a617451d2ba2e158f357b6d1a2eb6b03 |
| ef-02e-twin-builder-v1.js | EF-02E-v1.zip / src/ | dce18f9dfeb7f64750e70c8f022a44bdd09cc9d2f249bba9ed6371e2630c7654 |
| ef-02e-exclusion-registry-v1.js | EF-02E-v1.zip / src/ | 5ad01ab1dd8286f04d6251193196f25f4193eb6ae48daaaafdb30a982d0c4ca3 |
| ef-03-target-document-set-v1.js | EF-03-v1.zip / src/ | 00b6d0d582b36fe2de3cec40af7517cebc762aee22a204e5f0b617bf393542e7 |
| ef-03a-review-schema-v1.js | EF-03-v1.zip / src/ | 9a44f8d6c17de5c21b646934ff1c46c8fa187bbf5d959da211fb7ffac2752b54 |
| ef-03b-review-runner-v1.js | EF-03-v1.zip / src/ | e033b704754ab0e3c61724c44a9698fea2ddeee45dde7392db81dabc3eb276b4 |
| ef-03c-aggregation-v1.js | EF-03-v1.zip / src/ | 7787d3237a1690ad0e141ce02bca42c0013d47182e3538889247b53f6c6c92f6 |
| ef-03d-stability-contradiction-v1.js | EF-03-v1.zip / src/ | b19947fcd56c5bbd121c91ffdc223f912ad71752af93a54fb5de599da3974387 |
| ef-04-lineage-guard-v1.js | EF-04-v1.zip / src/ | 5d090cff78803d027e16d5a502146249606a60f863642282fe552629a676fb83 |
| ef-04a-unified-report-v1.js | EF-04-v1.zip / src/ | af0c16a6f25a0854aff120587289d0b4c7d864d70ca4a8a393eeaf1d268dca9d |

Ces hashes ont été recalculés indépendamment par Claude à partir des ZIP canoniques
fournis dans le kit de migration (`EvidenceForge-MIGRATION-KIT/packages/*.zip`), après
`sha256sum -c` réussi à 100% de chaque manifeste de paquet. Ils concordent avec les
`expectedHashes`/`computedHashes` déclarés dans `mono-00-frozen-baseline-registry-v1.json`
pour les fichiers qui y apparaissent déjà comme dépendance croisée (`ef-orch-hash-v0.1.js`,
`ef-pr-gen-mission-dimension-set-v1.js`).

| ef-orch-runcontract-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | cd09e1c775143a7e55adcb66905d800ecf154ba7ca9dff6d65f3f335d575696b |
| ef-orch-state-machine-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | c18c533c1c931d13f5c4ac1a9df70c950a7518f60e87ffa86dbbc50773ae66c8 |
| ef-orch-stage-adapter-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 21f6ac84f60d2779ca918454849be249d4fff4e59bdbb7c12e87bcb118867af9 |
| ef-orch-execute-stage-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 9f23e5f89c184b0f50e8b4384c0e08066918086a843cc37a1626da4e08404ab9 |
| ef-orch-durable-stage-runner-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 3cb94414d69a8302fd181d3380ac098841a456dd5e588c7a1358190cef221939 |
| ef-orch-ef01-stage-registry-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 45fc27100e3929e4dc9a2bde3bfc5e029e825429c0c6e0d8431c0dc167bc6929 |
| ef-orch-durable-backend-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | ea84d1d8d62abd53af84f918e661b5b3e4c52a26199256ab2f5b83d1a6d38ef1 |
| ef-orch-durable-run-output-store-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 3f0e365b18ac909992a1fe137000815ab9837a2f9bde07557ce2e740c220c79a |
| ef-orch-durable-checkpoint-identity-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | b0f8790f6aaa07112f09b33073b84d7ae265ccce04705f9d31124e9939b7ce90 |
| ef-orch-run-state-snapshot-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | bf0bf5d5dfc3ad3be38f0b47cce8972cd390137f578d1b3f780472bc3d5c2f0f |
| ef-orch-stage-input-resolver-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 93235032cb0049309e4258ce2049082083f14050acab26a873f386c74c15811f |
| ef-orch-ef01-output-contracts-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 284d030003d7a1134d35834848f52c6a95caf01228fd9b9d8a0a6e9db153b716 |
| ef-orch-ef01a-executor-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 6b791ea6403239058526f4632fbe80e00a6324ce5834edcccb2e8fec99249edc |
| ef-orch-ef01b-executor-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 15c14dc7682097c6ee3ec6757975b8b7f734fab5e11634ffe27369f54433c17e |
| ef-orch-ef01b-resolver-trace-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 754087f4ed5b923342d3600c038d1aa115b7c5b245be3c3724b99c3b22546e02 |
| ef-orch-ef01c1-executor-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 69a07125f5a34ac52e4609c493c897d9d44c6484521f59186b510ea6cbe0a4c2 |
| ef-orch-ef01c1-planner-trace-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | ac0c4037103b87830efc202991d9a24d01f8aec0e36ef2ed06fa6164eb5f3dd7 |
| ef-orch-ef01c2-executor-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 766de16caa2f4c3c00e8b461d5882449cd4e820b23b72e84523b98e58d4148bf |
| ef-orch-ef01c2-runner-openalex-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | c08799ac6e1fed01b0c17d72d41f0ec5272e07b47d6cc049249be028096c7bbb |
| ef-orch-ef01c2-connector-capabilities-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 588d0d016a4577f5670e3215b1478be436e614c9d94029ff75f771365718f531 |
| ef-orch-ef01c2-checkpoint-contract-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 56f9631bfe357aac1b7cb65c0d519686c96a8839b949e00d4246802d00704000 |
| ef-orch-ef01d-executor-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | c9a9341820869f8dda0522caccd3e92abad33025fcb7f1e00d34c237400b6091 |
| ef-orch-ef01d-screening-artifact-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | fb6f7fe96fc4adb2331c65841aafe337e3338b8adf4513e72040eb976b149d89 |
| ef-orch-ef01e-executor-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | d27dbe992a56cf5ad6cbb2909532611d294af471ea3fe4cb061a9f2b837ec4f8 |
| ef-orch-ef01e-qualification-test-artifact-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 88a52d356f5e469686a5ac49dc3d1d1c465e1b760b05b19f3c09edd6b848b4de |
| ef-orch-ef01e-test-qualification-generator-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 42627eda9da0c6f0498c85dba31dc598580d27c611160fa068eb7c152a9061e1 |
| ef-orch-ef01f-executor-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | 4d66e45f5a6156c4d12b05ff71f23d8528095d4ea1c474a2f7f7d66b4219dd1e |

| ef-orch-run-output-store-v0.1.js | EF-ORCH-RELEASE-v0.1.zip / code/ | bc60d642fcda3bb73291060dc4a983af75502da8c83c5168a639c47abfbf487a |
**EF-02A/B/C ne sont volontairement PAS copiés ici** : ce sont des outils HTML avec dépôt
de fichier manuel (pas des modules Node exportables), et le choix de leur interface
d'intégration reste une décision d'architecture ouverte de MONO-00 (voir
`START-HERE.md` section 4). Voir `ports/professional-pipeline-port.js` et
`reports/mono-01-port-coverage-report-v1.md`.
