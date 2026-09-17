# Non-régression — MONO-09 v0.2

## Méthode : référence croisée interne (pas une constante auto-écrite)

`RELEASE-MANIFEST.md` ne contient aucune empreinte par fichier et le bundle n'est
pas versionné : aucune baseline cryptographique tierce n'existe. La méthode retenue
exploite les copies imbriquées : `MONO-02/dependencies/MONO-01` embarque sa propre
copie de MONO-01. Les deux devraient être altérées de façon cohérente pour tromper
ce contrôle.
```
BASELINE_METHOD        = CROSS_REFERENCE_MONO01_VS_MONO02_EMBEDDED_COPY
BASELINE_FILES_COMPARED = 62
BASELINE_DIVERGENCES    = 0
```

## Empreintes agrégées (contenu + chemin relatif, indépendantes du chemin absolu)
```
MONO-01       db6bf1b45d2ac85de3d6d34dba7bc93ee61c9d9a8cddc57d7431b5fcc1f03597
MONO-02       7fcb0432f39b62f2e091a49b5fa86f5e8c6aabed5b1409f2e6fd71391e097935
MONO-03       bf7ae5f8cc4c60296fd865599920a56c40465cc3bbca31c2d18ada31b5adb387
MONO-04       d074b5277e020b282d85d9ea69f0d9b25501f28845823e9ed99cb320b34e3901
MONO-05       a98896ae3911f145cc5475a3a4de234b98f2fc7a5fc9357a0699cbebc9a7050f
MONO-06       2aa20db5dc6446af8e9dcdf92c037f583b6b29355046573da8c6c03471ac7450
MONO-07       cae33db34ade8ce479740f04a815d67484fd36cbe283b4085c423742a06b556d
MONO-08/v0.6  b6821e044d93add12cbc7d4a8533ad9aac2c1ea780ac7702fbb9adad3a845d56
MONO-08/v0.7  286b632f633d28586445e83221cf1ffda47b5fba7d0e74728d627fa324d822a6
MONO-08/v0.8  c67d93d437c1fd11527f8efa9d14f12dde8c5aaf6a76d3058a38f42cee7cf5b4
MONO-09/v0.1  c29f08fe36f5dbe6c29cf5607a38739bee6550611e500422ccc11d1778029206
```

## Artefacts réels du workspace (non touchés)
```
e183295b4b2caee14fc8c95af3ad0081dad449b242b623d2fb7e7ee71679e765  retrieval-snapshot-v08.json
9558e9502a101e1ff0055f9d001d11dc695b621a54d117f802b847aaf152a171  audit-decisions-v08-confirmed.json
9b84f69ab3b5a1c89f4d1964a497c3cd1b8e4805011793156a78c662a33ffae0  retrieval-snapshot.json
a4c2cec1a720a4d1d5e297b8eb44b7cd6695dbb84238d1de4949662cf9b07c9e  audit-decisions-confirmed.json
bb109e3da85d5759cf10661c715584b74556426883fc42f50943acadab6f7d67  runcontract-confirmed.json
518320998aa0ad3fc83a7b838e95914bdb4f2900b297f837fc74ad17183e02a1  searchprotocol-confirmed.json
90f395106881314d6d6f7cc35f41155156d08cb0f9124b1e06a8be36f83f057e  mission-real-jmjs-execution.json
```

NETWORK_CALLS = 0 · LLM_CALLS = 0 · EF02_REAL_RUNS = 0 · PREPARE_CALLS = 0 · RESUME_CALLS = 0
