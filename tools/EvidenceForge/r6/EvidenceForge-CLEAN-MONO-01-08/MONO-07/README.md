# EvidenceForge — MONO-07 : End-to-End Synthetic TEST

Premier run synthétique bout-en-bout réel du monolithe EvidenceForge, contre
la baseline gelée R3. Aucune donnée réelle, aucun accès externe non
contrôlé, aucun lot gelé modifié.

## Baseline R3

```
MONO-00       27/27
MONO-01.x    172/172
MONO-02-R1   334/334
MONO-03-R1    64/64
MONO-04-R1    69/69
MONO-05-R3   119/119
TOTAL MONO   785/785
Historiques 1223/1223
MONO-06-R3 : 22/22 tests propres, gate PASS
```

## Contenu

```
lib/
  kit-root.js                   - resolution portable du kit (CLI > EVIDENCEFORGE_KIT_ROOT > echec explicite)
  harness-env.js                - assemble MONO-01->05 via extraction fraiche de MONO-05
  mono06-gate.js                 - gate obligatoire : bloque tout E2E si MONO-06 n'est pas PASS avec la baseline R3 exacte (785/1223)
  synthetic-fixtures.js         - mission, professionnels, cibles synthetiques (SYNTHETIC_*)
  synthetic-external-server.js  - vrai serveur HTTP local, routes par scenario
  provider-configs.js           - configurations MONO-04 centralisees par scenario
  e2e-driver.js                 - pilote un run reel a travers les 14 noeuds, rehydratation en point fixe
fixtures/synthetic-run-artifacts-v1.json - inventaire des 14 artefacts attendus
test/unit/                     - tests de regression des bugs MONO-07
test/e2e/                      - happy path, contradiction, resume, failure, lineage negatif, secrets, idempotence/concurrence, no-live-function, determinisme
test/browser/                  - scenario Playwright reel (T07-37, vraie UI MONO-05-R3)
test/unit/test_t07_runner_policy.js - tests du runner (retry restreint aux incidents d'infrastructure)
reports/
  mono-07-e2e-report-v1.md
  mono-07-test-report-v1.md
  mono-07-e2e-trace-v1.json
manifest/SHA256SUMS
package/EvidenceForge-MONO-07-v1.zip
```

## Utilisation

```bash
node test/run-all.js /chemin/vers/le/kit/racine/R3
```

ou :

```bash
EVIDENCEFORGE_KIT_ROOT=/chemin/vers/le/kit npm test
```

Resolution stricte CLI > variable d'environnement > `KIT_ROOT_REQUIRED` -
jamais un chemin de session implicite.

`test/run-all.js` retente automatiquement jusqu'a 3 fois chaque fichier de
test en cas d'echec (instabilite transitoire de lancement Chromium sous
charge documentee - jamais masquee : chaque nouvelle tentative est
journalisee explicitement dans la sortie).

## Ce qui a ete reellement prouve

- Gate MONO-06-R3 (785/1223) verifie explicitement avant tout E2E.
- Happy path reel : 14/14 noeuds SUCCESS, artefacts structurellement
  valides, 2 twins x 2 targets = 4 reviews, lineage PASS, rapport
  accessible, assuranceLevel jamais surelevé.
- Contradiction reelle preservee (support/concern), sans dependre de la
  classification convergence/divergence (limitation contractuelle
  verifiee, non cablee par MONO-02).
- Crash/resume reel, failure/recovery reel avec vrai timeout MONO-04.
- Idempotence et concurrence sur le vrai Gateway MONO-04.
- Secrets : vrai SecretProvider, usage reel confirme, 0 fuite (API et navigateur).
- Lineage PASS/FAIL/STALE, tous reels, y compris via la vraie UI.
- **Browser E2E reel (T07-37a-h)** : vraie UI MONO-05-R3, vrai OperatorApi,
  happy path navigateur avec assuranceLevel reellement visible, lineage
  FAIL/STALE via la vraie UI, double-clic sans double execution, secrets
  absents du DOM/localStorage/sessionStorage, aucune erreur console
  inattendue.
- Determinisme entre deux runs (canonicalisation documentee et justifiee).
- Integrite bit-a-bit des 7 ZIP canoniques avant/apres la suite complete.

**Node/API : 107/107 (93 existants + 14 runner-policy). Browser : 20/20. TOTAL : 127/127, aucune regression fonctionnelle (voir CDC-TRACE.md pour la note sur une instabilite residuelle documentee du gate MONO-06 imbrique).**

## Bugs reels trouves et corriges (MONO-07 uniquement)

Voir `reports/mono-07-test-report-v1.md` et `CDC-TRACE.md` : branchement
D2/D3 ambigu, couverture panel redondante, `rehydrateForNewProcess()`
dupliquant une regression deja corrigee dans MONO-05, chemin de session en
dur dans les fichiers de test (portabilite), runner appliquant un retry a
tout echec y compris fonctionnel (corrige via `lib/runner-policy.js`).

## Limites connues

1. **EF-03C convergence/divergence nommee** - limitation contractuelle
   verifiee (workerCallFn optionnel, jamais injecte par MONO-02), pas une
   regression.
2. `OperatorApi.createRun()` ne permet pas nativement de piloter un run
   traversant EF-02A/B/C (limite deja documentee par MONO-05) -
   contournement documente dans `lib/e2e-driver.js` et dans les tests
   browser, jamais un fichier gele modifie.
3. Sous forte charge Chromium cumulee (executions repetees dans une meme
   session), un lancement isole peut occasionnellement echouer de facon
   transitoire - absorbe par la logique de nouvelle tentative de
   `test/run-all.js`, toujours journalisee explicitement.
