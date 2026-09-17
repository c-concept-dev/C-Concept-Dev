# Non-régression — MONO-10 v0.1

## Méthode : référence croisée interne, jamais une constante auto-écrite

`RELEASE-MANIFEST.md` ne porte aucune empreinte par fichier et le bundle n'est pas
versionné : aucune baseline cryptographique tierce n'existe. La méthode exploite les
copies imbriquées, que deux altérations cohérentes seraient nécessaires pour tromper.
```
MONO-01 <-> copie MONO-02 : 65 fichiers, 0 divergence(s)
MONO-03 <-> copie MONO-04 : 190 fichiers, 0 divergence(s)
MONO-09 v0.1 et v0.2 : verifies a leurs propres SHA256SUMS
  MONO-09/v0.1 : 0 ligne(s) non-OK
  MONO-09/v0.2 : 0 ligne(s) non-OK
```

## Artefacts réels du workspace (non touchés)
```
e183295b4b2caee14fc8c95af3ad0081dad449b242b623d2fb7e7ee71679e765  retrieval-snapshot-v08.json
9558e9502a101e1ff0055f9d001d11dc695b621a54d117f802b847aaf152a171  audit-decisions-v08-confirmed.json
9b84f69ab3b5a1c89f4d1964a497c3cd1b8e4805011793156a78c662a33ffae0  retrieval-snapshot.json
a4c2cec1a720a4d1d5e297b8eb44b7cd6695dbb84238d1de4949662cf9b07c9e  audit-decisions-confirmed.json
```

NETWORK_CALLS = 0 · REAL_LLM_CALLS = 0 · REAL_EF02_RUNS = 0 · P0_2_RUNS = 0
