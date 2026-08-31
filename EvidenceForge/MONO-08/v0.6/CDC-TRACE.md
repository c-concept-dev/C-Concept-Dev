# CDC-TRACE — MONO-08 — Real Smoke Execution Kit

## MONO-08 v0.6 — Delegated LLM Authentication (implementation)

Cette copie de travail (`EvidenceForge/MONO-08/v0.6/`) est une nouvelle
version derivee du checkpoint MONO-08 v0.5 (copie, pas une modification du
ZIP canonique v0.5). Reference normative :
`EvidenceForge/MONO-08/MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md` et
`EvidenceForge/MONO-08/MONO-08-v0.6-ACCEPTANCE-MATRIX.md`, tous deux
audites independamment et declares `GELABLE COMME SPECIFICATION` avant le
debut de cette implementation.

### Phase 1 — inspection : decouverte de contrat sur le header du credential Worker

Lecture en lecture seule de `MONO-04/lib/external-execution-gateway.js`
(depuis `EvidenceForge-MONO-04-R1.zip`, jamais modifie, jamais extrait
ailleurs qu'en zone de travail temporaire pour cette inspection) :
`performHttpCall()` construit **toujours** le header sortant
`Authorization: Bearer <secretValue>` a partir de
`providerConfig.requiredSecret` (une simple cle de nom, resolue via
`secretProvider.getSecret(requiredSecret)`), quel que soit le nom du
secret — et n'utilise **jamais** `providerConfig.headers` pour construire
un header d'authentification. C'est deja, sans aucun changement, le
comportement du vrai run v0.5 en mode direct (`requiredSecret:
"ANTHROPIC_API_KEY"` -> `Authorization: Bearer <ANTHROPIC_API_KEY>` reel
vers Anthropic via MONO-04) — independant du header `x-api-key` envoye par
le *preflight*, qui est un client HTTP totalement separe
(`lib/preflight.js::httpRequest()`, jamais le Gateway).

**Ceci n'est ni un defaut ni une incompatibilite de MONO-04** (le
CONTRAT/ARCHITECTURE IMPACT de la regle absolue n'a pas lieu d'etre
declenche) : le Gateway est deja generique par construction, agnostique du
nom du secret. Decision d'implementation, deja permise explicitement par
le CDC section 4.3.2 (« un nom de header different peut etre utilise... a
condition que MONO-04 ne soit pas modifie ») : le mode `delegated` envoie
`Authorization: Bearer <EVIDENCEFORGE_WORKER_API_KEY>` au Worker
`evidenceforge-llm-proxy`, exactement le meme mecanisme que MONO-04
applique deja sans modification, plutot que le header `X-API-Key`
esquisse a titre d'exemple dans le CDC. Le probe de preflight `delegated`
(`lib/preflight.js::buildLlmWorkerProviderDelegated`) utilise le meme
header, pour que le resultat du preflight predise fidelement le
comportement du vrai run. Detail complet dans
`worker/evidenceforge-llm-proxy/README.md` (section « Pourquoi
Authorization: Bearer, pas X-API-Key »).

**MONO-04 n'a subi aucune modification.** Aucune ligne de
`external-execution-gateway.js` ni d'aucun autre fichier MONO-04 n'a ete
touchee ; seule la VALEUR de `requiredSecret` retournee par
`lib/real-provider-configs.js::buildLlmWorkerConfigDelegated()` differe de
`ANTHROPIC_API_KEY`.

### Fichiers modifies

- `lib/preflight.js` — ajout de `LLM_AUTH_MODE` (`resolveAuthMode()`),
  branche `buildLlmWorkerProviderDelegated()` (credential
  `EVIDENCEFORGE_WORKER_API_KEY`, header `Authorization: Bearer`, jamais de
  reference a `ANTHROPIC_API_KEY` dans cette branche — verifie par revue
  structurelle automatisee, voir `test/test_t08_v06_delegated_auth.js` cas
  H2), champ `authMode` additif dans chaque resultat provider et dans le
  rapport top-level. Toute valeur `LLM_AUTH_MODE` explicite non reconnue
  fait lever une exception AVANT la construction de la moindre entree
  provider — `bin/run-preflight.js` (INCHANGE) la traduit deja en
  `PRODUCT_CONFIG_ERROR` / exit code 3 via son `try/catch` existant.
  `buildProviders()` pour le mode `direct` est un copier-coller exact du
  code v0.5 (fonction `buildLlmWorkerProviderDirect()`), aucun
  comportement modifie.
- `lib/real-provider-configs.js` — meme logique `resolveAuthMode()` (petite
  duplication volontaire plutot que d'introduire un fichier partage non
  prevu par le CDC), `buildLlmWorkerConfigDelegated()` (`requiredSecret:
  "EVIDENCEFORGE_WORKER_API_KEY"`, jamais de reference a
  `ANTHROPIC_API_KEY`). La forme de configuration retournee au Gateway
  MONO-04 reste strictement `{ endpoint, timeoutMs, method, requiredSecret,
  retryPolicy, headers }`, identique a v0.5.
- `test/test_t08_v06_delegated_auth.js` (nouveau) — cas A, B, C, D, E, F,
  J, K + revue structurelle H2, 16 assertions, toutes `LOCAL_CONTROLLED`.
  Cas G (REAL) explicitement non execute.
- `worker/evidenceforge-llm-proxy/` (nouveau) — Worker dedie (CDC section
  7), `src/worker.js`, `test/worker.test.js` (28 assertions
  `LOCAL_CONTROLLED`, aucun deploiement Cloudflare), `wrangler.jsonc`
  (secrets jamais commit, binding `RATE_LIMITER`), `README.md`.
- `.env.example`, `README-REAL-SMOKE.md`, `package.json` — documentation
  additive des deux modes, `LLM_AUTH_MODE`/`EVIDENCEFORGE_WORKER_API_KEY`.

### Non-regression (cas I)

`test/test_t08_preflight.js`, `test/test_t08_eforch.js`,
`test/test_t08_matrix.js`, `test/test_t08_runner_orchestration.js`
executes sans aucune modification, sortie comparee octet pour octet
(`diff`) contre la meme execution sur la copie non modifiee du kit v0.5
source : **identique dans les 4 cas**. Voir le rapport d'implementation
livre avec ce lot pour le detail (chemins, horodatages).

### Ce qui n'a PAS ete fait dans cette implementation (volontairement)

- Aucun deploiement Cloudflare reel du Worker (pas de `wrangler deploy`,
  pas de secret Cloudflare defini).
- Aucune execution du cas G (REAL) — reste soumis a audit independant et
  autorisation distincte (CDC section 5.3, 11.3).
- Aucun `bin/run-real-smoke.js` execute.
- Aucune modification de MONO-00->07, EF-ORCH, MONO-04, MONO-08 v0.5
  canonique.
- MONO-09 / JMMJS non entame.

### Statut de cette etape

`IMPLEMENTATION READY FOR INDEPENDENT AUDIT` (jamais `GELABLE`, jamais
`GELE` — reserves a un audit et une decision independants). Voir le
rapport d'implementation livre avec ce lot pour le detail complet
(tests, secret scan, integrite frozen, packaging).

---

## Corrections apportees suite au second audit (v0.2 -> v0.3)

### LLM payload contract — verifie, resolu, jamais un STOP

Lecture directe du code gele confirme : `MONO-04/lib/response-validation.js
::validateHttpResponse()` retourne `JSON.parse(bodyText)` BRUT — pour un
vrai appel Anthropic, `result.result` = `{content:[{type:"text",
text:"..."}], ...}`, jamais un champ racine "text" plat. Le wrapper de
commodite `createGatewayWorkerCallFn(gateway, {responseTextField})`
n'accepte qu'un NOM DE CHAMP PLAT — structurellement incompatible avec
cette forme imbriquee (indexation de tableau).

**Ceci n'est PAS un defaut du contrat gele** : `gateway.executeRequest()`
lui-meme (l'API bas niveau, deja utilisee pour OpenAlex) reste pleinement
utilisable. Seul le wrapper de commodite ne convient pas a cette forme
precise. Resolu par `lib/real-external-adapter.js::buildRealLlmWorkerCallFn()`
— appel direct a `gateway.executeRequest()`, extraction de
`result.result.content[0].text` cote MONO-08 (integration, jamais une
modification du contrat gele). Aucun STOP necessaire.

### driveRun reellement enchaine (v0.3)

`bin/run-real-smoke.js::runFullPipeline()` appelle desormais reellement,
dans l'ordre : `createRealMissionRun()` -> `driveRun()` (reutilise tel
quel depuis MONO-07, jamais recopie) -> `rehydrateRealMissionRun()`
(nouvelle instance/nouveau registre) -> readback -> UI smoke (vrai
`createHttpServer` + Playwright, reconstruit dans son propre backend
frais car `createHttpServer()` ne permet pas d'injecter un backend
existant) -> secret scan. Si `driveRun` echoue ou ne produit pas 14/14
SUCCESS : `persistence-restart`/`ui-smoke`/`secret-scan` sont
explicitement `NOT_RUN` (aucune etape downstream presentee valide).

### DECOUVERTE : rehydrateForNewProcess() de MONO-07 n'est PAS generique

Test reel effectue : `MONO-07/lib/e2e-driver.js::rehydrateForNewProcess()`
appelle en interne `materializeContext()`, qui reconstruit TOUJOURS un
adaptateur SYNTHETIQUE (`fx.buildSyntheticAdapter()`) — jamais l'adapter
reel/local-controlled fourni. Reutiliser cette fonction telle quelle pour
MONO-08 produisait silencieusement 0 noeud SUCCESS apres redemarrage.

Corrige : `lib/real-e2e-driver.js::rehydrateRealMissionRun()` — MEME
algorithme de reconstruction en point fixe (deja valide dans
MONO05-R2-REG-02 puis MONO-07), avec l'adapter et le workerCallFn REELS
passes explicitement. Jamais une reimplementation de logique metier
gelee — uniquement la meme mecanique de transitions publiques du moteur
MONO-02-R1 deja documentee ailleurs dans ce projet. Preuve : T08-RUNNER-09
(LOCAL_CONTROLLED) confirme que l'etat reel est fidelement preserve apres
reconstruction, jamais corrompu ni faussement promu SUCCESS.

### DECOUVERTE : runContract n'est pas un objet plat

Test reel effectue : EF-ORCH-SUBSYSTEM rejette `{missionQuestion}` avec
`SCHEMA_VERSION_MISMATCH` ("attendu EvidenceForge.RunContract, trouve
undefined"). Le vrai RunContract doit etre construit via le builder gele
`MONO-01/dependencies/ef-orch-runcontract-v0.1.js`
(`buildRunContractDraft()` puis `confirmRunContract()`), jamais un objet
invente. Corrige dans `lib/real-e2e-driver.js::buildRealRunContract()` —
reutilise ce builder gele tel quel.

### DECOUVERTE (limite honnete, non resolue dans cette livraison) : EF-ORCH-SUBSYSTEM porte son propre sous-pipeline interne

Apres le correctif RunContract, EF-ORCH-SUBSYSTEM progresse mais reste
`BLOCKED` avec `DEPENDENCY_UNAVAILABLE` ("en attente, stage EF-01A") —
preuve reelle qu'EF-ORCH-SUBSYSTEM porte en interne ses propres stages
(EF-01A a EF-01E), necessitant `connectorRunners.openalex` (via
`createOpenAlexRunner`/`mono04.createGatewayFetchImpl`) ET une
coordination d'un `screeningArtifact` pre-construit avec un identifiant
deterministe (mentionne dans un commentaire deja present dans
MONO-07/lib/e2e-driver.js) — une profondeur d'integration distincte et
non triviale, separee de l'adaptateur EF-02A/B/C deja cable.

**Decision honnete, jamais une correction silencieuse** : cette
integration precise (EF-ORCH interne) n'est PAS cablee dans cette
livraison v0.3, faute de temps suffisant pour l'explorer et la verifier
avec la meme rigueur que le reste. Consequence explicite :
`implementationStatus = PARTIAL` (jamais `READY`) pour full-pipeline,
persistence-restart, ui-smoke et toutes les preuves REAL en aval
(T08-05 a T08-21) — conformement a la regle de la section 13 de l'audit.
Ce qui EST prouve reellement (LOCAL_CONTROLLED) : `createRealMissionRun`
construit un run reel valide (14 noeuds, MONO-02-R1 gele) ;
`driveRun()` est reellement invoque et rapporte une raison technique
precise et exploitable (jamais un plantage silencieux) ; la reprise
(`rehydrateRealMissionRun`) preserve fidelement l'etat reel sans jamais
le corrompre ni le faire progresser artificiellement.

### Tests mis a jour

test/test_t08_runner_orchestration.js — desormais 15 assertions
(T08-RUNNER-01 a 10, 13, 14 + les verifications initiales), toutes
PASS, honnetement libellees [LOCAL_CONTROLLED] et [PARTIAL] la ou
applicable.



## Corrections apportees suite au premier audit (v0.1 -> v0.2)

### Correctif 1 — pre-vol pouvait produire un faux READY

Cause : la classification precedente considerait tout HTTP < 500
"reachable" comme suffisant. Exemple concret trouve par l'audit : GET
/v1/messages sur Anthropic donne toujours 405 (mauvaise methode) — avec
un identifiant present, ce 405 aurait pu etre interprete a tort comme
READY.

Correctif (lib/preflight.js) : chaque fournisseur definit desormais sa
PROPRE operation reelle (POST /v1/messages avec corps minimal pour
Anthropic, jamais GET) et son propre validateur de reponse structurel.
READY exige desormais 4 etapes prouvees : HOST_REACHABLE, AUTH_VALID (si
requis), OPERATION_VALID, RESPONSE_VALID.

Tests ajoutes : test/test_t08_preflight.js - 10 assertions
(T08-PREFLIGHT-01 a 10), LOCAL_CONTROLLED, incluant precisement le cas
405 identifie par l'audit (T08-PREFLIGHT-04 et T08-PREFLIGHT-07).

### Correctif 2 — runner incomplet (NOT_IMPLEMENTED sur le happy path)

Correctif : sequence complete assemblee, aucune branche NOT_IMPLEMENTED
restante :
- lib/real-provider-configs.js - configurations reelles, fail-closed
  explicite si un endpoint localhost/synthetic/mock est detecte.
- lib/real-external-adapter.js - implementation reelle (jamais
  synthetique) des 3 methodes attendues par
  mono01.professionalPipelinePort, appelant le vrai Gateway MONO-04.
  Avertissement conserve dans le code : jamais execute contre une vraie
  reponse, a valider par l'operateur.
- lib/real-e2e-driver.js - glue code de construction de run reel ;
  driveRun() lui-meme est REUTILISE tel quel depuis MONO-07.
- bin/run-real-smoke.js - orchestre desormais : baseline gate ->
  frozen-zip-integrity (avant) -> preflight -> [si READY: connectivity
  -> full-pipeline -> persistence-restart -> ui-smoke -> secret-scan] ->
  frozen-zip-integrity (apres) -> reports. Baseline gate et integrite
  ZIP sont desormais INDEPENDANTS du reseau - verifie par execution
  reelle meme avec preflight BLOCKED.

Tests ajoutes : test/test_t08_runner_orchestration.js - 6 assertions
LOCAL_CONTROLLED.

### Mission — completee partiellement, jamais fabriquee

fixtures/mission-real-smoke-v1.json cree avec readyForExecution=false
tant que 1 professionnel et 1 document cible restent
OPERATOR_INPUT_REQUIRED. README corrige pour ne plus affirmer "sans
aucune modification" mais "configuration + confirmation des references
reelles requises".

## Corrections apportees suite au troisieme audit (v0.3 -> v0.4) — EF-ORCH-SUBSYSTEM SUCCESS + 14/14 LOCAL_CONTROLLED atteints

### Matrice de dependances EF-ORCH (MONO-08A)

| Stage | Executor gele | Input (pipeline) | Artefact prerequis | Producteur | Durable ? | Dependance externe |
|---|---|---|---|---|---|---|
| EF-01A | `ef-orch-ef01a-executor-v0.1.js::createEF01AExecutor(injected)` | RunContract confirme | `ef01aInjected` (metadata+documentBytes) | MONO-08 (construction directe, aucun builder dedie — confirme par fixtures-eforch.js) | oui (backend EF-ORCH) | aucune |
| EF-01B | `ef-orch-ef01b-executor-v0.1.js::createEF01BExecutor(runContract, trace)` | sortie EF-01A | `resolverTrace` | MONO-08, schema/version via `ef-orch-ef01b-resolver-trace-v0.1.js` | oui | aucune (LLM deja execute en pre-analyse, jamais ici) |
| EF-01C1 | `ef-orch-ef01c1-executor-v0.1.js::createEF01C1Executor(runContract, searchProtocol)` | sortie EF-01B | `searchProtocol` (statut EXACTEMENT `"figé"`) | MONO-08 via `sha256LikeRealSearchProtocol` (ef-orch-ef01-output-contracts-v0.1.js) | oui | aucune |
| EF-01C2 | `ef-orch-ef01c2-executor-v0.1.js::createEF01C2Executor({store,runId,runContractHash,connectorRunners})` | sortie EF-01C1 | `connectorRunners.openalex` (fonction) | MONO-08 via `createOpenAlexRunner()` (ef-orch-ef01c2-runner-openalex-v0.1.js) — retourne directement la fonction, jamais `{runner}` | oui | **SEULE etape reellement externe** (OpenAlex/Crossref/PubMed) |
| EF-01D | `ef-orch-ef01d-executor-v0.1.js::createEF01DExecutor(screeningArtifact)` | resolu manuellement (protocolHash requis) | `screeningArtifact` | MONO-08 (construction directe — aucun builder dedie, confirme par fixtures-eforch.js) | oui | aucune |
| EF-01E | `ef-orch-ef01e-executor-v0.1.js::createEF01EExecutor(qualificationTestArtifact)` | sortie EF-01D | `qualificationTestArtifact` (TEST, explicitement non-scientifique) | MONO-08 via `generateQualificationTestArtifact()` | oui | aucune |
| EF-01F | `ef-orch-ef01f-executor-v0.1.js::createEF01FExecutor(injected)` | sortie EF-01E | `ef01fInjected` | MONO-08 (construction directe) | oui | aucune |

`RunContract` : `ef-orch-runcontract-v0.1.js::buildRunContractDraft()` + `confirmRunContract()`.
`CorpusSnapshot` : produit par EF-01F, contrat `EvidenceForge.CorpusSnapshot`/`EF-01F-v1`, transmis a `mono01.corpusSnapshotPort.receive()` par `node-runners.js::EF-ORCH-SUBSYSTEM` — jamais un artefact individuel par sous-stage dans MONO-03 (confirme par T08-EFORCH-14).

Backend durable EF-ORCH : injecte a `createMono01(registry, {efOrchDurableBackend})` (deja fait par MONO-05/app/server/config.js — in-memory par defaut, jamais reimplemente par MONO-08). Distinct de MONO-03 (confirme par T08-EFORCH-13/14 : aucun artefact `EF-01[A-F]` n'apparait jamais dans `operatorApi.listArtifacts()`).

### Bugs reels trouves et corriges pendant le cablage (chacun avec preuve exacte)

1. `disciplinesProposees` est a la RACINE du RunContract confirme, jamais sous `perimetre`.
2. `SearchProtocol.statut` attendu est EXACTEMENT `"figé"` (avec accent) — une chaine sans accent est rejetee silencieusement.
3. `validateEF01C1Output` exige `retrievalPolicies.length === sourcesActivees.length` (une politique par SOURCE active, jamais par discipline).
4. `createOpenAlexRunner()` retourne DIRECTEMENT la fonction runner, jamais un objet `{runner, counter}`.
5. `missionDimensionSet`/`missionDocumentMapping`/`heuristicPolicy` doivent etre construits via leurs builders geles respectifs (`EFPrGenMissionDimensionSet`, `EFPrGenMissionDocumentMapping`, `EFPrGenHeuristicPolicy`) — un objet plat est rejete silencieusement (`raw.output === false`, jamais un message explicite).
6. `ctx.externalInputs.documents`/`reviewTargets` exigent `{targetId, role, content}` — `targetId` doit provenir de `buildReviewTargets(labels)` et etre PARTAGE entre les deux.
7. `ProfessionalCorpusSet` exige `professionalCorpora` (jamais `corpora`), chaque entree portant `{professionalRef, status:"complete", identityRef, corpus:{works:[{doi, publicationYear, topics}]}, summary}`.
8. `exclusionRegistry` doit etre `{schema, schemaVersion, entries:[]}`, jamais `{}`.

Aucun de ces bugs n'a revele une incompatibilite de contrat — chacun s'est resolu par une construction plus precise, en reutilisant exclusivement des builders/factories deja geles. **Aucun STOP necessaire a aucun moment.**

### Fichiers ajoutes/corriges (v0.4)

- `lib/eforch-artifacts.js` (nouveau) — construit RunContract confirme, ResolverTrace, SearchProtocol, ScreeningArtifact, QualificationTestArtifact, ef01a/ef01fInjected, connectorRunner OpenAlex.
- `lib/real-e2e-driver.js` (reecrit) — `buildEForchArtifacts()`, `createRealMissionRun()` (construit tout, y compris `efOrchExecutionDependencies` complet), `rehydrateRealMissionRun()` (reconstruit `connectorRunners` fraichement, jamais persiste).
- `lib/real-external-adapter.js` (corrige) — `buildProfessionalCorpus()` produit `professionalCorpora` dans la forme exacte exigee.
- `test/test_t08_eforch.js` (nouveau) — T08-EFORCH-01 a 14 + T08-RUNNER-READY-01 a 05, **23/23 PASS**, confirme stable sur executions repetees.
- `bin/run-real-smoke.js` (v0.4) — `extractDocumentPayloads()` lit le contenu documentaire depuis la mission (jamais un fetch automatique — EF-01A est une interface de saisie humaine par conception) ; `realOpenAlexFetchImpl()` utilise le fetch global de Node directement (EF-01C2 est un sous-systeme HTTP gele autonome, concu pour recevoir un fetch reel en production, deliberement decouple de MONO-04 — jamais un contournement).

### Preuve de reussite (objectif MONO-08)

```
EF-ORCH-SUBSYSTEM -> SUCCESS                    [LOCAL_CONTROLLED, confirme x2]
CorpusSnapshot (EvidenceForge.CorpusSnapshot/EF-01F-v1) -> valide
14/14 SUCCESS (vrai moteur MONO-02-R1)          [LOCAL_CONTROLLED, confirme x2]
Lineage PASS, rapport accessible, assuranceLevel correct
Persistence restart : etat fidelement preserve, poursuite jusqu'a 14/14
UI smoke reel (vrai serveur MONO-05-R3 + Playwright) : 14 noeuds, assuranceLevel visible, 0 erreur console
Secret scan et frozen ZIP integrity reellement executes sur un run 14/14 complet
```

### Mission — contenu documentaire reel ajoute (target-01)

Le texte reel de la page d'accessibilite du Governor's Office of Planning
and Research (target-01) a ete recupere via recherche web publique lors
de la preparation et ajoute dans fixtures/mission-real-smoke-v1.json
(champs content/contentBase64) — jamais fabrique. target-02 et le second
professionnel restent OPERATOR_INPUT_REQUIRED, readyForExecution reste
`false`, honnetement.

## Corrections apportees suite au quatrieme audit (v0.4 -> v0.5) — deux faux positifs methodologiques fermes

### Bug 1 — secret scan trivial (SECRET ABSENCE TEST WITHOUT SECRET INJECTION)

Cause : le test v0.4 verifiait l'absence d'une valeur (`MONO08_LOCAL_
CONTROLLED_SECRET_TEST_VALUE`) qui n'avait jamais ete injectee dans le
systeme — prouvait uniquement "jamais introduit -> absent", jamais une
non-fuite reelle.

Correctif (test/test_t08_eforch.js) : injection REELLE via la voie gelee
`createStaticSecretProvider` (MONO-04/lib/secret-provider.js, deja
utilisee par MONO-05/app/server/config.js). Un provider "secret-probe"
avec `requiredSecret` est configure, pointant vers un serveur HTTP local
INDEPENDANT qui capture l'en-tete `Authorization` reellement recu — preuve
directe que `SecretProvider.getSecret()` a ete sollicite ET que la valeur
a transite jusqu'a la requete HTTP reelle du Gateway MONO-04 (jamais une
supposition). Puis scan exhaustif de la valeur brute dans RunState,
ArtifactRecord, reponses OperatorApi, rapport final, trace du test, DOM,
localStorage, sessionStorage — 0 occurrence.

Tests : T08-RUNNER-READY-04a (consommation prouvee : `Bearer
MONO08_LOCAL_CONTROLLED_SECRET_TEST_VALUE` recu sur le serveur de
capture), T08-RUNNER-READY-04b (0 fuite, scan exhaustif).

### Bug 2 — frozen ZIP integrity mesuree deux fois apres le run (FROZEN_INTEGRITY_BASELINE_CAPTURED_TOO_LATE)

Cause : `hBefore`/`hAfter` etaient tous deux captures a la FIN du
scenario v0.4 — une mutation pendant le run aurait ete invisible.

Correctif : `frozenHashesBefore` capture desormais AVANT
`createRealMissionRun`/`driveRun`/restart/UI smoke ; `frozenHashesAfter`
capture a la toute fin, apres l'UI smoke inclus. Test :
T08-RUNNER-READY-05.

### Decouverte annexe : MONO-07 absent de la couverture d'integrite

Verifie : kit-r3 (04-ARTEFACTS-CANONIQUES/MONO/) n'a jamais inclus le ZIP
de MONO-07 — c'est un livrable FRERE, distinct, reference par MONO-08 via
son repertoire lib/ (EVIDENCEFORGE_MONO07_LIB_PATH), jamais copie dans le
kit. `lib/frozen-zip-integrity.js::hashKit()` accepte desormais un second
parametre optionnel `mono07ZipPath` (resolu par defaut relatif a
`EVIDENCEFORGE_MONO07_LIB_PATH`, ou via `EVIDENCEFORGE_MONO07_ZIP_PATH`
explicite) — retro-compatible, couvre desormais 8 ZIP (MONO-00 a MONO-07)
au lieu de 7. Mis a jour dans bin/run-real-smoke.js,
test/test_t08_eforch.js, test/test_t08_matrix.js (T08-23).

### Test adversarial ajoute (preuve que le mecanisme detecte reellement une mutation)

Copie jetable du kit -> snapshot before -> mutation volontaire d'un octet
sur le ZIP MONO-00 de la COPIE (jamais le ZIP canonique) -> snapshot
after -> `compareHashes.identical === false`, diff exact identifie.
Verification finale que le ZIP canonique original reste, lui,
bit-a-bit identique. Tests : T08-ADVERSARIAL-INTEGRITY,
T08-ADVERSARIAL-INTEGRITY-b.

### Resultat

test/test_t08_eforch.js : **26/26** (23 precedents + 3 nouveaux :
T08-RUNNER-READY-04a corrige en profondeur, T08-ADVERSARIAL-INTEGRITY,
T08-ADVERSARIAL-INTEGRITY-b), confirme stable sur executions repetees.
Aucun re-cablage EF-ORCH necessaire — le coeur du jalon v0.4
(EF-ORCH-SUBSYSTEM SUCCESS, CorpusSnapshot, 14/14, restart, UI smoke)
reste acquis tel quel.

## Statut

ENVIRONMENT_BLOCKED (ni GELABLE, ni NON GELABLE).

```
productRegressionDetected = false
realSmokeExecuted = false
preflightStatus = BLOCKED
```

## Baseline utilisee

R3 (MONO-00 a MONO-06-R3, 785/1223) - reutilisee telle quelle, jamais
modifiee. Gate MONO-06-R3 confirme reellement PASS (785/785, 1223/1223)
via reutilisation directe de lib/mono06-gate.js de MONO-07.

## Pre-vol - resultats reels

Requetes HTTPS reelles effectuees depuis l'environnement d'execution :

| Fournisseur | Reseau atteint | Classification | Statut |
|---|---|---|---|
| OpenAlex | oui (proxy repond) | EGRESS_PROXY_BLOCK | NETWORK_BLOCKED |
| Crossref | oui (proxy repond) | EGRESS_PROXY_BLOCK | NETWORK_BLOCKED |
| PubMed/NCBI | oui (proxy repond) | EGRESS_PROXY_BLOCK | NETWORK_BLOCKED |
| LLM (Anthropic) | oui (HTTP 405 du fournisseur) | PROVIDER_HTTP_ERROR | AUTHENTICATION_BLOCKED |

Preuve brute conservee dans reports/mono-08-preflight-v1.json (en-tete
x-deny-reason: host_not_allowed pour les trois premiers ; reponse JSON
reelle du fournisseur pour le quatrieme).

Distinction explicite maintenue (section 8 du CDC) : les trois premiers
sont bloques par le PROXY de l'environnement d'execution (jamais une
reponse du fournisseur reel) ; le quatrieme atteint reellement le
fournisseur mais manque d'identifiant.

## Pourquoi le Real Smoke ne peut pas s'executer ici

bin/run-real-smoke.js s'arrete immediatement apres le pre-vol si non
READY, sans jamais basculer vers un provider synthetique. Verifie par
execution reelle (exit code 2, ENVIRONMENT_BLOCKED).

## Real-smoke kit construit

- lib/preflight.js - classification reelle a 4 etapes prouvees (v0.2 :
  operation exacte par fournisseur, validation structurelle, jamais un
  simple HTTP<500).
- bin/run-preflight.js - CLI avec exit codes 0/2/3.
- bin/run-real-smoke.js - orchestrateur COMPLET (v0.2, aucun
  NOT_IMPLEMENTED sur le happy path) ; baseline gate et integrite ZIP
  desormais independants du reseau.
- lib/real-provider-configs.js (v0.2) - configurations reelles,
  fail-closed anti-synthetique.
- lib/real-external-adapter.js (v0.2) - adaptateur reel EF-02A/B/C.
- lib/real-e2e-driver.js (v0.2) - glue code de construction de run reel.
- lib/frozen-zip-integrity.js - verifie reellement le SHA-256 des ZIP
  canoniques.
- lib/secret-scan.js - recherche de valeur, jamais un affichage.
- lib/kit-root.js - meme mecanisme de portabilite deja valide en MONO-07.
- test/test_t08_matrix.js - matrice de statuts reelle avec
  implementationStatus distinct de evidenceStatus (v0.2).
- test/test_t08_preflight.js (v0.2, nouveau) - 10 assertions LOCAL_CONTROLLED.
- test/test_t08_runner_orchestration.js (v0.2, nouveau) - 6 assertions LOCAL_CONTROLLED.
- MISSION.md + fixtures/mission-real-smoke-v1.json (v0.2) - professionnel
  et document n°1 reellement verifies, n°2 de chaque explicitement
  OPERATOR_INPUT_REQUIRED, readyForExecution=false.
- .env.example - placeholders uniquement.
- README-REAL-SMOKE.md - procedure exacte, mission correctement decrite
  comme partiellement prete (plus "sans aucune modification").
- lib/eforch-artifacts.js (v0.4) - construit RunContract confirme,
  ResolverTrace, SearchProtocol, ScreeningArtifact, QualificationTestArtifact,
  ef01a/ef01fInjected, connectorRunner OpenAlex - exclusivement via les
  builders geles identifies par inspection contractuelle.
- lib/frozen-zip-integrity.js (v0.5) - hashKit() accepte desormais un
  second parametre optionnel mono07ZipPath, couvre 8 ZIP au lieu de 7
  (MONO-07 ajoute, retro-compatible).
- test/test_t08_eforch.js (v0.4, etendu v0.5) - T08-EFORCH-01 a 14 +
  T08-RUNNER-READY-01 a 05 + T08-ADVERSARIAL-INTEGRITY(-b), **26/26 PASS**,
  confirme stable sur executions repetees.

## Tests LOCAL_CONTROLLED (executes reellement dans cet environnement)

- T08-01 baseline R3 gate - PASS (785/785, 1223/1223).
- T08-02 preflight (logique elle-meme) - PASS.
- T08-22 secret scan (logique de detection, valeur factice locale) - PASS.
- T08-23 frozen ZIP integrity - PASS.
- T08-24 static check - PASS.
- test_t08_preflight.js (10/10) - PRE-FLIGHT SELF TESTS.
- test_t08_runner_orchestration.js (6/6) - RUNNER ORCHESTRATION SELF TESTS.

## Tests BLOCKED / NOT_RUN

T08-03 a T08-21 (19 tests) - NOT_RUN_ENVIRONMENT_BLOCKED, documente
explicitement. Aucun total global trompeur - repartition par statut :
{ FAIL: 0, PASS: 5, NOT_RUN_ENVIRONMENT_BLOCKED: 19 }.

Une flakiness transitoire deja documentee du gate MONO-06 imbrique
(comptage Playwright nested) a ete observee deux fois durant cette
construction et resolue par nouvelle tentative manuelle - exactement
comme documente dans MONO-07, jamais un defaut de MONO-08.

## Evidence matrix

Voir reports/mono-08-evidence-matrix-v1.json - distingue explicitement
REAL / LOCAL_CONTROLLED / NOT_RUN pour chaque preuve requise.

## Secret handling

Aucun identifiant reel present dans cet environnement. La LOGIQUE de
detection est validee localement (T08-22) avec une valeur factice.

## Portabilite

0 occurrence de chemin de session dans le code fonctionnel - verifie
par T08-24.

## Frozen baseline integrity

SHA-256 reel des 7 ZIP canoniques verifie identique avant/apres (T08-23).

## Regressions

Aucune regression de lot gele detectee.

## Limites connues / Environment limitations

1. Egress reseau restreint par liste blanche - OpenAlex/Crossref/PubMed
   explicitement hors liste.
2. Aucun identifiant LLM exploitable dans cet environnement.
3. Consequence : aucune preuve REAL requise par le CDC n'a pu etre
   produite ici - toutes classees NOT_RUN, jamais FAIL, jamais fabriquees.

## Contrat / architecture impactee

Aucune. Aucun lot gele modifie, aucun contournement synthetique tente.

## Statut final de cette etape

MONO-08 — ENVIRONMENT_BLOCKED

Ni GELABLE ni NON GELABLE - evaluation incomplete faute de reseau reel.
CODE READY confirme jusqu'au niveau LOCAL_CONTROLLED le plus exigeant,
y compris injection/consommation reelle de secret et integrite
avant/apres verifiee correctement (EF-ORCH-SUBSYSTEM SUCCESS, 14/14,
restart, UI smoke, secret no-leak, mutation adversariale detectee —
26/26 tests). Kit d'execution pret pour un environnement autorise ;
seule la connectivite reseau reelle (OpenAlex/Crossref/PubMed/LLM) et la
confirmation des 2 references mission restantes separent ce kit d'un
Real Smoke complet.
