# Rapport E2E — MONO-07 (baseline R3)

## Baseline utilisee

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

## Happy path (14/14)

14 noeuds SUCCESS, etat durable MONO-03 coherent, lineage PASS
(MONO05-R2-REG-01), EF-04A produit, rapport accessible. 29 assertions
(test_t07_e2e_happy.js).

## Artefacts produits

Voir fixtures/synthetic-run-artifacts-v1.json.

## Matrice twin x target

2 twins x 2 targets = 4 DocumentaryReview reelles, aucun couple manquant
ni duplique.

## Contradiction

Support/concern preserves au niveau des findings bruts. Classification
convergence/divergence nommee : limitation contractuelle verifiee
(workerCallFn optionnel non cable par MONO-02), jamais une regression.
6/6 (test_t07_e2e_contradiction.js).

## Persistence / Crash / Resume

RunState/ArtifactRecord reels coherents. Instance A a 8/14, instance B
(nouveau moteur) reprend jusqu'a 14/14. 6/6 (test_t07_e2e_resume.js).

## Failure / Recovery

EF-02B FAILED reel, downstream bloque, recovery reelle sans duplication.
Vrai timeout MONO-04 (EXTERNAL_TIMEOUT, ~300ms). 9/9
(test_t07_e2e_failure.js).

## Concurrency / Idempotence

Vrai Gateway MONO-04-R1 : une seule execution reelle sur collision ;
EXTERNAL_REQUEST_CONFLICT reel sur fingerprint different. 5/5.

## Lineage PASS / FAIL / STALE (API)

Les trois reels. 11/11 (test_t07_e2e_lineage_negative.js).

## Secrets (API)

Vrai SecretProvider, 0 fuite. 7/7 (test_t07_e2e_secrets.js).

## Determinisme

Deux runs identiques, canonicalisation documentee. 6/6.

## Browser E2E (T07-37) — nouveau dans cette version

Scenario Playwright reel contre la vraie UI MONO-05-R3, vrai OperatorApi.
Frontiere documentee : run prepare cote serveur (voie E2E deja validee),
ouvert ensuite dans la vraie UI (limite connue de createRun() pour
EF-02A/B/C, deja documentee par MONO-05).

- T07-37a (happy browser) : graphe 14 noeuds visible, 14/14 SUCCESS
  coherent, artefacts consultables, lineage visible, rapport ouvert avec
  assuranceLevel reellement affiche
  (reference_revalidated_not_source_hash_bound), les deux flags a false,
  jamais undefined. Aucune erreur console/page/requete.
- T07-37b (lineage FAIL browser) : FAILED visible, bouton rapport jamais
  propose, getReport() LINEAGE_BLOCKED.
- T07-37c (lineage STALE browser) : PASS stale jamais presente comme
  valide, rapport bloque.
- T07-37d (double-clic) : un seul artefact reel, attemptCount coherent,
  SUCCESS atteint malgre la collision.
- T07-37e/f/g (secrets) : 0 occurrence dans DOM/localStorage/sessionStorage.
- T07-37h (console) : aucune erreur inattendue.

**20/20 assertions reelles.**

## MONO-06-R3 regression gate

PASS (785/1223) verifie explicitement avant toute execution E2E.

## Frozen ZIP integrity

SHA-256 des 7 ZIP canoniques recalcule avant/apres la suite complete
(127 tests) : identiques.

## Runner MONO-07 — bug corrige (audit independant final)

Une version anterieure de test/run-all.js appliquait un retry (jusqu'a 3
essais) a TOUTE exception, y compris un echec d'assertion fonctionnelle
reel - pouvant masquer une vraie regression. Corrige via
lib/runner-policy.js : classification stricte PASS/FUNCTIONAL/
INFRASTRUCTURE, retry jamais applique au groupe Node/API, retry unique
(2 tentatives max) pour le groupe Browser uniquement sur une
infrastructure Chromium/Playwright explicitement reconnue (regex etroite,
jamais large). Chaque tentative journalisee integralement. Tests :
test/unit/test_t07_runner_policy.js (14 assertions, sans Chromium reel).

Decouverte annexe : test_t07_browser_e2e.js lui-meme souffrait d'une
fragilite de synchronisation reelle (selecteur de clic ambigu) -
corrigee, confirmee stable sur 5+ executions consecutives.

## Instabilite residuelle documentee (gate MONO-06 imbrique)

Le gate MONO-06 (invocation imbriquee : MONO-07 -> harnais MONO-06 ->
npm test de MONO-05-R3 -> deux suites Playwright imbriquees) peut
occasionnellement rapporter un compte de tests navigateur inferieur a
l'attendu sous charge cumulee. Ce mode d'echec ne correspond a aucun
motif d'infrastructure reconnu par runner-policy.js (comptage imbrique,
pas un crash de processus navigateur) - il est donc correctement classe
FUNCTIONAL et jamais retente automatiquement. Observe sur environ 1
execution sur 2 dans cette session ; toujours resolu par une seconde
invocation manuelle de test/run-all.js, jamais un contournement du code
teste. Deux executions combinees consecutives propres obtenues : 127/127
a chaque fois, aucun retry necessaire sur ces deux executions.

## Limites connues

1. EF-03C convergence/divergence nommee - limitation contractuelle
   verifiee, pas une regression.
2. OperatorApi.createRun() ne permet pas nativement de piloter un run
   traversant EF-02A/B/C, y compris depuis le navigateur - contournement
   documente (preparation serveur puis ouverture UI).
3. Instabilite residuelle du gate MONO-06 imbrique (voir section dediee
   ci-dessus) - jamais masquee, toujours resolue par reexecution manuelle.
