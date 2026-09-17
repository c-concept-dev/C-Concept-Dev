# EF-01C1 v0.2-r1 — Contract

Correctif ciblé, en réponse à `EvidenceForge-AUDIT-INDEPENDANT-EF-01B-C1-v0.2.md`,
finding **F-07** (+ réutilisation des fixes F-03/F-04/F-05/F-06, identiques
à EF-01B-v0.2-r1).

## PLANNER_RESOLVER_CAUSAL_BINDING (F-07, MAJOR — fermé)

Le planner v0.2 (précédent) ne recevait qu'un résumé `{discipline,
candidateCount}` — deux sorties resolver substantiellement différentes
avec le même compte produisaient le même prompt/`inputHash`. **Corrigé** :

- `acquirePlannerRun(opts)` exige désormais `resolvedDisciplines[]`
  (`{id, label, rationale}` — le contenu **réel** fourni par le resolver,
  jamais un simple compteur) ET `resolverOutputHash` (hash du contenu
  causal complet de la sortie resolver, produit par
  `EF-01B-v0.2-r1::acquireResolverRun`).
- Les deux sont inclus dans `canonicalInputObject` (garantie
  cryptographique : `inputHash` diffère toujours si le contenu resolver
  diffère) **ET** littéralement dans le texte du prompt (garantie
  lisible : le prompt diffère aussi, sauf coïncidence textuelle totale sur
  les rationales — auquel cas `resolverOutputHash`, également embarqué en
  texte, suffit seul à faire différer le prompt). Double garantie, prouvée
  par test (`T-F07-01`, `T-F07-01b`, `T-F07-02`).

### EF01C1_INPUT_HASH_SPEC

`inputHash = sha256CanonicalJson({stage:"EF-01C1", promptId, promptVersion,
missionId, runContractHash, resolverOutputHash, disciplines, transport,
prompt})`.

### EF01C1_RESPONSE_HASH_SPEC (F-05)

Identique à EF-01B-v0.2-r1 : `rawResponseHash` porte sur le texte assistant
extrait ; `provenance.rawResponseHashScope = "assistant_text"` le déclare
explicitement.

## MODEL/TRANSPORT/REQUEST_ID (F-03/F-04/F-06 — fermés, réutilisation)

Identique à EF-01B-v0.2-r1 : délégué à `lib/real-llm-call.js` (copie
intentionnelle, même lot versionné indépendamment) —
`provenance.model`/`.transport` sont toujours des valeurs **observées**
(jamais déclaratives), `localInvocationId`/`providerRequestId` toujours
distingués. Voir `EF-01B-v0.2-r1/CONTRACT.md` pour le détail complet
(identique ici).

## Note : `runContractHash` conservé (pas de F-02 ici)

Contrairement à EF-01B, EF-01C1 s'exécute **après** confirmation du
RunContract (contrat gelé v0.1 inchangé sur ce point) — `runContractHash`
reste donc une entrée légitime, jamais une inversion de causalité.

## Sortie (`acquirePlannerRun(opts)`)

`{ plannerRun, plannerOutput, provenance, evidenceDir }` — inchangé en
forme par rapport à v0.2, compatible `validateRealPlannerRunFields()`/
`validateRealPlannerOutputFields()`/`buildSearchProtocolForMission()`/
`assertSearchProtocolFrozenAndValid()` (R6, v0.1, gelées), prouvé par test.

## STRUCTURAL_COMPATIBILITY_V01 vs SEMANTIC_COMPATIBILITY_V01

Comme pour EF-01B-v0.2-r1, ces deux notions restent distinctes. Ici,
`SEMANTIC_COMPATIBILITY_V01` recouvre spécifiquement le lien causal réel
prouvé par `T-F07-*` — un `SearchProtocol` structurellement valide mais
dont le contenu ne dépendrait pas réellement du resolver resterait
sémantiquement invalide (c'était le défaut avant ce correctif).

## Erreurs typées

Identique à v0.2, plus `MODEL_PROVENANCE_MISMATCH` (F-03) et
`TRANSPORT_PROVENANCE_MISMATCH` (F-04).

## Périmètre explicitement HORS de ce lot

Identique à v0.2 (aucune modification R6/MONO-01→07 ; validation humaine
réelle du `SearchProtocol` hors logiciel ; `EF-01B-C1-v0.2-r1-INTEGRATION`
assemble le tout).
