# Dérivation légitime des `*.baseline.exit` (non fabriquée)

## Pourquoi ce document

Le gate de non-régression réécrit (`NON-REGRESSION-GATE-FIX.md`) exige une
comparaison stricte exit-code + sortie contre une baseline **immuable et
préexistante**. Les fichiers `*.v05-baseline.out` existaient déjà (commit `4952ce4`,
jamais modifiés depuis), mais aucun exit code n'avait jamais été consigné à leurs
côtés. Ce document trace la méthode exacte utilisée pour produire les 4 fichiers
`*.baseline.exit`, afin de prouver qu'ils ne constituent pas une baseline fabriquée à
partir du code actuel.

## Méthode

1. Confirmation que le code source des 4 fichiers de test historiques n'a jamais
   changé depuis leur introduction :

   ```text
   $ git log --oneline -- EvidenceForge/MONO-08/v0.6/test/test_t08_preflight.js
   4952ce4 feat(mono08): implement MONO-08 v0.6 delegated LLM auth + evidenceforge-llm-proxy Worker
   ```

   (Un seul commit pour chacun des 4 fichiers — aucune modification depuis.)

2. Exécution fraîche de chaque fichier (`node test/test_t08_<nom>.js`), capture de
   stdout+stderr et de l'exit code.

3. Comparaison **octet pour octet** de la sortie fraîche contre le fichier
   `*.v05-baseline.out` déjà figé et commité : dans les 4 cas, 0 ligne de diff.

4. Seulement après confirmation du point 3, l'exit code obtenu à l'étape 2 a été
   enregistré tel quel dans le fichier `*.baseline.exit` correspondant — aucune valeur
   n'a été choisie a priori ou ajustée.

Cette méthode ne fabrique pas de baseline à partir du code actuel : le code testé est
prouvé identique à celui qui a produit la `.v05-baseline.out` originale, donc l'exit
code obtenu en le ré-exécutant aujourd'hui est, par construction, le même exit code
que celui qui aurait accompagné la baseline si elle avait été consignée dès l'origine.

## Valeurs dérivées

| Fichier test | Exit code baseline | `.v05-baseline.out` — 0 diff confirmé |
|---|---|---|
| `test_t08_preflight.js` | `0` | oui |
| `test_t08_eforch.js` | `2` | oui |
| `test_t08_matrix.js` | `0` | oui |
| `test_t08_runner_orchestration.js` | `1` | oui |

Les exit codes non nuls pour `eforch` (2) et `runner_orchestration` (1) sont attendus
et documentés depuis le commit d'origine (voir commentaire historique dans la version
pré-correctif du script : « `EVIDENCEFORGE_MONO07_LIB_PATH` non fourni pour eforch, 2
FAILs connus/documentés pour runner_orchestration liés à l'état de la mission, pas à
ce correctif »).

## Intégrité (SHA-256)

```text
53c234e5e8472b6ac51c1ae1cab3fe06fad053beb8ebfd8977b010655bfdd3c3  test_t08_eforch.js.baseline.exit
9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa  test_t08_matrix.js.baseline.exit
9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa  test_t08_preflight.js.baseline.exit
4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865  test_t08_runner_orchestration.js.baseline.exit
c92318ddc86c4a561d51c0d52b4b6866b3ca7cb27ef40247a4334f2f4cf8b076  test_t08_eforch.js.v05-baseline.out
d6dab416184e072e0644281a0d8b935b5d33395df1823af86f379df72690c48b  test_t08_matrix.js.v05-baseline.out
886dfce0721b20e17ad1db88de46271a82890a04c47d00dd40f68a1a3e08ff9e  test_t08_preflight.js.v05-baseline.out
6466f7d53913817a701962a3f9b913bb2d9aa90e7ad8a1745e38250a5f807035  test_t08_runner_orchestration.js.v05-baseline.out
```

(Note : `test_t08_matrix.js.baseline.exit` et `test_t08_preflight.js.baseline.exit`
partagent le même hash — les deux fichiers contiennent la même valeur littérale `0`,
ce qui est attendu et sans signification particulière au-delà de la coïncidence de
contenu.)

Ces hashes sont également couverts par `manifest/SHA256SUMS` (généré en dernier, sur
l'arbre figé) dans le package final — voir `INTEGRITY-CHECK-R2.md`.
