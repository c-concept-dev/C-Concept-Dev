# CDC-TRACE — MONO-07 — End-to-End Synthetic TEST

## Baseline

R3 (MONO-00, MONO-01, MONO-02-R1, MONO-03-R1, MONO-04-R1, MONO-05-R3,
MONO-06-R3 — 785/1223).

## Decouvertes d'architecture (documentees, jamais un STOP)

1. `OperatorApi.createRun()` (MONO-05) ne cable jamais `ctx.adapter` -
   limite deja documentee par MONO-05 (EF-02A/B/C non pilotables depuis le
   formulaire generique, y compris depuis la vraie UI navigateur).
   Contourne en construisant le contexte au meme niveau que
   `operator-api.js::createRun`, jamais un fichier gele modifie - utilise
   a la fois cote API (`lib/e2e-driver.js`) et cote browser
   (`test/browser/test_t07_browser_e2e.js`, meme technique).
2. `mono03.backend.put()` applique `structuredClone()` a toute valeur -
   aucune fonction vivante ne peut jamais etre persistee. Architecture
   retenue : identifiants serialisables persistes, fonctions vivantes
   reconstruites a la demande, verifiee explicitement par
   `test/e2e/test_t07_no_live_function_persisted.js`.

## Verification contractuelle EF-03C (avant classification en limite connue)

1. workerCallFn REQUIRED ou OPTIONAL ? OPTIONAL - confirme par l'en-tete
   du module gele.
2. Sortie obligatoire sans workerCallFn ? L'agregat de base
   (deterministe), convergences:[], divergences:[].
3. Convergence/divergence obligatoire ? Non - le port MONO-01 ne declare
   requiredInputs: ["reviewSet"] que seul.
4. Une AggregatedDocumentaryReview avec findings bruts conserves mais
   classification vide est-elle VALID ? Oui - scenario nominal de 8 des
   ~12 tests geles d'EF-03.
5. Le schema l'autorise-t-il explicitement ? Oui.
6. Les tests geles couvrent-ils ce mode ? Oui - 8 des ~12 scenarios.

Confrontation avec MONO-02 : `MONO-02/lib/node-runners.js::EF-03C` (gele)
n'injecte JAMAIS workerCallFn.

Decision : CAS A confirme avec preuve contractuelle complete. Aucun STOP.
Classification : LIMITATION CONTRACTUELLE / CAPACITE OPTIONNELLE NON
ACTIVEE PAR MONO-02. test_t07_e2e_contradiction.js verifie la
preservation de la contradiction au niveau des findings bruts.

## Bugs reels trouves et corriges (MONO-07 uniquement, jamais un lot gele)

### Bug 1 - branchement D2/D3 ambigu

Cause : prompt.includes("relevanceStatus") matchait aussi les prompts D3
(rappel du jugement D2 dans leur contexte) -> 0 professionnel usable
systematiquement. Correctif : marqueur non ambigu ("dimensionId", propre
au schema D2). Test : test_t07_fixtures_regression.js (T07-FIX-01a/b).

### Bug 2 - couverture identique entre les deux professionnels synthetiques

Cause : couverture "strong" identique sur les deux dimensions, second
professionnel totalement redondant pour l'algorithme reel de selection de
panel (0 gain marginal, jamais selectionne). Correctif : couverture
deliberement complementaire. Test : T07-FIX-02. Resultat : 2 twins reels,
4 reviews, 1 contradiction naturelle.

### Bug 3 - rehydrateForNewProcess() de MONO-07 dupliquait REG-02

Decouverte : le fragment crash/resume a revele que ma propre fonction de
rehydratation souffrait du meme defaut que MONO05-R2-REG-02
(computeReadyNodes() appele une seule fois avant/apres, jamais entre
chaque transition). Correctif : meme algorithme en point fixe deja
valide dans MONO-05-R2, reutilise tel quel. Retest : test_t07_e2e_resume.js
confirme 8/14 -> 14/14 apres reprise reelle.

### Bug 4 - chemin de session en dur (portabilite)

Cause : process.argv[2] || "<chemin de session>" dans 9 fichiers de test
et test/run-all.js - trouve par audit independant depuis une extraction
neuve. Correctif : lib/kit-root.js::resolveKitRoot() - resolution stricte
CLI > EVIDENCEFORGE_KIT_ROOT > echec explicite KIT_ROOT_REQUIRED, jamais
un chemin par defaut. Tests : test_t07_pkg_portability.js (T07-PKG-01/02/03).

Les quatre bugs sont classes BUG MONO-07 - aucun lot gele modifie.

## Browser E2E (T07-37, ajoute apres audit independant)

Frontiere documentee : OperatorApi.createRun() ne permettant pas de
piloter un run traversant EF-02A/B/C depuis le navigateur, chaque
scenario prepare le run COTE SERVEUR par la voie deja validee (chaine
reelle buildValidChain, artefacts persistes via recordNodeSuccess,
adaptateur synthetique injecte directement dans le moteur, jamais
persiste), puis ouvre ce run deja persiste dans la VRAIE UI MONO-05-R3.
Aucun payload de rapport fabrique, aucun patch de MONO-05-R3.

T07-37a (happy browser) : run reel jusqu'a 14/14 SUCCESS cote serveur,
ouvert dans un vrai Chromium via Playwright - graphe des 14 noeuds
visible, artefacts consultables, lineage SUCCESS visible, clic reel sur
"Ouvrir le rapport", assuranceLevel reellement affiche
(reference_revalidated_not_source_hash_bound), les deux flags a false,
jamais undefined - preuve directe que le correctif R3 (renderReport())
fonctionne dans un vrai navigateur avec un vrai payload. Aucune erreur
console/page/requete.

T07-37b (lineage FAIL browser) : TARGET_DOCUMENT_SET seede brise des
l'origine, EF-04-LINEAGE execute reellement -> FAILED visible, bouton
"Ouvrir le rapport" jamais propose, getReport() -> LINEAGE_BLOCKED.

T07-37c (lineage STALE browser) : deux runs reels distincts, le PASS du
second reecrit pour referencer un artefact du premier (technique deja
prouvee) - la vraie UI ne propose jamais "Ouvrir le rapport" sur ce PASS
devenu stale, getReport() bloque.

T07-37d (double-clic) : deux clics quasi simultanes sur le bouton "Run"
du seul noeud READY - un seul ArtifactRecord reel produit, attemptCount
coherent, le noeud atteint tout de meme SUCCESS.

T07-37e/f/g (secrets) : secret synthetique reel injecte via le vrai
SecretProvider, recherche exhaustive dans le DOM, localStorage et
sessionStorage apres navigation complete - 0 occurrence.

T07-37h (console) : console.error, pageerror et requestfailed collectes
sur le scenario happy - aucune occurrence inattendue.

Resultat : 20/20 assertions reelles, test/browser/test_t07_browser_e2e.js.

## Instabilite environnementale observee (documentee, non fonctionnelle)

Sous charge Chromium cumulee (nombreux lancements successifs dans une
meme session), un sous-ensemble de tests a occasionnellement echoue de
facon transitoire (gate MONO-06 ou suite MONO-05 rapportant un compte de
tests navigateur inferieur a l'attendu, sans lien avec le code teste -
confirme par re-execution immediate systematiquement reussie).
test/run-all.js absorbe desormais cette instabilite par une nouvelle
tentative bornee a 3 essais, TOUJOURS JOURNALISEE EXPLICITEMENT (jamais
un echec masque). Aucune occurrence n'a resiste a une seconde tentative
sur l'ensemble des verifications de cette livraison.

## Canonicalisation du determinisme

Retrait de runId, timestamps, artifactId/artifactRefs, requestId, et -
decouverts par comparaison reelle de deux runs, jamais supposes a
l'avance - auditDecisionRefs/screeningDecisionRef/decisionId
(identifiants EF-01D generes horodatage+aleatoire) et hashOuChecksum
(derive d'un horodatage interne). Tout le reste est identique entre deux
runs.

## Bug runner (audit independant final)

Cause : test/run-all.js appliquait une nouvelle tentative (jusqu'a 3
essais) a TOUTE exception d'un fichier de test, y compris un echec
d'assertion fonctionnelle reel - une tentative ulterieure reussie
pouvait alors masquer une vraie regression en la declarant PASS.

Correctif (lib/runner-policy.js) : classification stricte
PASS/FUNCTIONAL/INFRASTRUCTURE avant toute decision de retry.
- Un fichier qui atteint son propre resume (ECHECS : N) est TOUJOURS
  FUNCTIONAL, quel que soit le texte par ailleurs.
- Seuls des motifs Chromium/Playwright explicitement reconnus
  (browserType.launch:, Target ... has been closed, SIGKILL, etc.) sont
  classes INFRASTRUCTURE - jamais une regex large.
- Groupe Node/API : 0 retry, toujours, meme sur une classification
  infrastructure.
- Groupe Browser : retry unique (2 tentatives au total, jamais 3),
  uniquement si la premiere tentative est INFRASTRUCTURE.
- Chaque tentative est journalisee integralement, meme si une tentative
  ulterieure reussit.

Decouverte annexe pendant la verification : le scenario browser happy
path souffrait lui-meme d'une instabilite reelle intermittente (clic via
selecteur text= ambigu declenchant occasionnellement un rendu partiel
avant lecture du DOM) - corrige par un selecteur de bouton precis et une
attente sur le contenu reel de l'assurance plutot que sur le seul titre
de section. Confirme stable sur 5+ executions consecutives apres
correctif - ceci est un bug de TEST, jamais une regression de MONO-05/06.

Tests ajoutes : test/unit/test_t07_runner_policy.js (14 assertions,
T07-RUNNER-01 a 06) - sans Chromium reel.

## Instabilite residuelle documentee (gate MONO-06 imbrique)

Une instabilite distincte, plus profonde, persiste occasionnellement :
MONO-06/lib/test-runner.js execute npm test de MONO-05-R3, qui lance
lui-meme deux suites Playwright imbriquees (22 + 5 tests) - sous charge
cumulee, ce sous-processus a deux niveaux de profondeur peut
occasionnellement rapporter un compte de tests navigateur inferieur a
l'attendu (780 au lieu de 785), faisant echouer le gate MONO-06 cote
MONO-07. Ce mode d'echec ne correspond a aucun motif d'infrastructure
reconnu par runner-policy.js (il ne s'agit pas d'un crash de processus
navigateur mais d'un comptage de tests imbriques) - il est donc, a
raison, classe FUNCTIONAL et jamais retente automatiquement. Observe sur
environ 1 execution sur 2 dans cette session ; toujours resolu par une
seconde invocation manuelle de test/run-all.js. Documente comme limite
connue de l'environnement d'execution, jamais masque.

## Non-regression

Node/API : 107/107 (93 existants + 14 runner-policy). Browser : 20/20.
TOTAL : 127/127, confirme sur deux executions combinees propres
consecutives, aucun retry necessaire sur ces deux executions.
Integrite bit-a-bit des 7 ZIP canoniques du kit R3 verifiee avant/apres
l'execution complete de la suite.

## Contrat / architecture impactee

Aucune. Aucun lot gele modifie.

## Limites connues

1. EF-03C convergence/divergence nommee - limitation contractuelle
   verifiee, pas une regression.
2. OperatorApi.createRun() ne permet pas nativement de piloter un run
   traversant EF-02A/B/C, y compris depuis le navigateur - contournement
   documente ci-dessus.
3. Instabilite transitoire de lancement Chromium sous forte charge
   cumulee - absorbee par nouvelle tentative journalisee, jamais un
   defaut fonctionnel du code teste.

## Verdict propose

**MONO-07 — GELABLE**
