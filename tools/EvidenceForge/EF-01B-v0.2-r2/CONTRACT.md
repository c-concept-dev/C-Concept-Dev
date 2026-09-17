# EF-01B v0.2-r1 — Contract

Correctif ciblé, en réponse à `EvidenceForge-AUDIT-INDEPENDANT-EF-01B-C1-v0.2.md`,
findings **F-01, F-02, F-03, F-04, F-05, F-06**.

## EF01B_SEMANTIC_ROLE (F-01, BLOCKER — fermé)

EF-01B v0.2 (précédent) demandait au LLM de proposer des **professionnels**
pour une discipline déjà connue — inversion fonctionnelle par rapport au
contrat gelé v0.1 (`ef-orch-ef01b-executor-v0.1.js`, entête : « la
résolution LLM appartient à la pré-analyse [...] et produit les
disciplines »). **EF-01B v0.2-r1 propose des DISCIPLINES**, jamais des
professionnels — un seul appel LLM au niveau **mission** (pas un appel par
discipline déjà connue), à partir de `EF-01A` (question + targetDocuments +
suppliedEvidence) uniquement.

Schéma de sortie : `{ proposals: [{disciplineId, label, rationale,
evidenceContextRefs}], targetContextReport: [...] }`. `lib/parser.js`
rejette explicitement (`RESOLVER_OUTPUT_INVALID`) toute réponse portant des
clés de résolution de professionnels (`candidates`/`professionals`/
`authors`/`experts` au niveau racine, `displayName`/`affiliation`/`orcid`/
`sourceHint`/`professional`/`author`/`person`/`candidate`/`expert` par
proposition) — une régression vers l'ancien objet résolu ne peut jamais
passer silencieusement.

## RUNCONTRACT_TEMPORAL_CAUSALITY (F-02, BLOCKER — fermé)

EF-01B v0.2 (précédent) exigeait `runContractHash` en entrée — impossible
puisque le RunContract est confirmé **après** cet appel. **EF-01B v0.2-r1
ne référence JAMAIS de RunContract** : `acquireResolverRun(opts)` n'accepte
ni ne requiert `runContractHash`. Test dédié (`T-F02-01`) : le resolver
s'exécute sans jamais recevoir ce champ.

### EF01B_INPUT_HASH_SPEC

`inputHash = sha256CanonicalJson({stage:"EF-01B", promptId, promptVersion,
missionId, missionQuestion, targetDocuments, suppliedEvidence, transport,
prompt})` — uniquement des données réellement disponibles **avant**
confirmation du RunContract (vérifié par lecture de
`ef-orch-ef01-output-contracts-v0.1.js::validateEF01AOutput` : aucune
structure pré-contractuelle alternative n'existe dans R6 au-delà de la
sortie EF-01A elle-même — décision documentée, pas un identifiant inventé).

### EF01B_RESPONSE_HASH_SPEC (F-05, MAJOR — fermé)

`rawResponseHash = sha256Bytes(UTF8(rawResponseText))` où `rawResponseText`
est le **texte assistant extrait** (`content[0].text`), jamais l'enveloppe
HTTP/provider complète — `provenance.rawResponseHashScope = "assistant_text"`
le déclare explicitement (champ additif, jamais ambigu). Capturer
l'enveloppe complète exigerait de contourner le Gateway MONO-04 (interdit).

### RESOLVER_OUTPUT_HASH_SPEC (F-07, côté consommateur EF-01C1-v0.2-r1)

`resolverOutputHash = sha256CanonicalJson({proposals: storedProposals,
targetContextReport})` — le contenu CAUSAL réel du resolver, à transmettre
tel quel au planner (`EF-01C1-v0.2-r1::acquirePlannerRun`).

## MODEL_PROVENANCE_BINDING (F-03, BLOCKER — fermé)

`provenance.model` est désormais le modèle **réellement utilisé/observé**,
jamais une valeur déclarative indépendante :

1. `resolveRealLlmModel(env)` (exportée par `real-external-adapter.js`, R6,
   gelée — **même fonction** que `buildRealLlmWorkerCallFn()` utilise en
   interne pour construire son payload) résout la valeur envoyée.
2. Si le provider **échoue** un modèle réel dans l'enveloppe de réponse
   (`result.result.model` — le cas réel Anthropic), cette valeur OBSERVÉE
   prime toujours sur (1).
3. Un `opts.declaredModel` optionnel n'est jamais qu'une **assertion** :
   s'il diverge de la valeur effective, `acquireResolverRun()` lève
   `MODEL_PROVENANCE_MISMATCH` — jamais une contradiction silencieuse.

## TRANSPORT_PROVENANCE_BINDING (F-04, MAJOR — fermé)

`provenance.transport` est dérivé de la configuration **réellement
enregistrée** sur l'instance `mono04` fournie
(`mono04.providerRegistry.getProviderConfig("llm-worker").requiredSecret`,
`MONO-04/lib/provider-registry.js`, gelé — `ANTHROPIC_API_KEY` → `direct`,
`EVIDENCEFORGE_WORKER_API_KEY` → `delegated`), jamais d'une variable
d'environnement relue indépendamment. Un `opts.declaredTransport` optionnel
est une assertion : divergence → `TRANSPORT_PROVENANCE_MISMATCH`.

## REQUEST_ID_SEMANTICS (F-06, MAJOR — fermé)

`provenance.localInvocationId` : identifiant **local**, généré par ce lot
pour cet appel (jamais présenté comme un id provider).
`provenance.providerRequestId` : identifiant **observé** dans l'enveloppe
de réponse (`result.result.id`), ou `null` si le provider (ou la fixture
LOCAL_CONTROLLED) ne l'a jamais fourni — jamais inventé. Les deux valeurs
ne sont jamais confondues.

## Sortie (`acquireResolverRun(opts)`)

`{ resolverRuns, resolverOutputHash, provenance, storedProposals,
evidenceDir }`. `resolverRuns[]` : **un enregistrement v0.1-compatible par
discipline retenue**, tous partageant la même provenance d'appel (un seul
appel LLM réel à l'origine de toutes les propositions) — validé par
`validateRealResolverRunFields()`/`assertResolverTraceConsistent()` (R6,
v0.1, gelées, sans modification).

## STRUCTURAL_COMPATIBILITY_V01 vs SEMANTIC_COMPATIBILITY_V01

Ces deux notions sont **volontairement distinctes** (jamais un seul PASS
global) :

- **STRUCTURAL_COMPATIBILITY_V01** : `assertResolverTraceConsistent()` (R6,
  gelée) accepte la FORME du `ResolverTrace` construit — prouvé par test.
- **SEMANTIC_COMPATIBILITY_V01** : le CONTENU matérialisé
  (`disciplinesProposees[].discipline`) est réellement un identifiant de
  discipline, jamais un nom de personne — prouvé par test dédié
  (`T-SEMANTIC-01`), en plus de la structure.

## Erreurs typées

`LLM_PROVIDER_UNAVAILABLE`, `LLM_RESPONSE_INVALID`,
`LLM_OUTPUT_SCHEMA_INVALID`, `RESOLVER_OUTPUT_INVALID`,
`PROMPT_VERSION_MISMATCH`, `MODEL_PROVENANCE_MISMATCH` (F-03),
`TRANSPORT_PROVENANCE_MISMATCH` (F-04) — voir `lib/errors.js`.

## Périmètre explicitement HORS de ce lot

- Aucune modification de R6/MONO-01→07/EF-01B v0.1.
- La construction du `RunContract`/`ResolverTrace` complet reste hors
  périmètre opérationnel de `acquireResolverRun()` (démontrée par test,
  jamais exécutée en production par ce lot).
- La sélection humaine des disciplines retenues (entre ce resolver et la
  confirmation du RunContract) reste un acte humain réel, hors logiciel —
  jamais simulée comme réelle (voir `EF-01B-C1-v0.2-r1-INTEGRATION`, fixture
  `SYNTHETIC_HUMAN_SELECTION_FIXTURE`, toujours classée LOCAL_CONTROLLED).
