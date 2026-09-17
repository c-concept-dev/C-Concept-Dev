# MONO-09 v0.2 — Adaptateur professionnel réellement injectable

Successeur additif de v0.1, déclaré **NON GELABLE** par l'audit indépendant.
v0.1 reste inchangée.

## Les deux bloqueurs corrigés

### A-04 — aucun adaptateur injectable

v0.1 exportait des primitives pures. Le port gelé
`MONO-01/ports/professional-pipeline-port.js` attend un objet portant
exactement `discoverProfessionals`, `verifyProfessionals`,
`buildProfessionalCorpus`. Injecté tel quel, v0.1 produisait
`DEPENDENCY_UNAVAILABLE` (reproduit par T01b).

v0.2 exporte `createProfessionalPipelineAdapter(deps)` — un adaptateur concret,
injectable directement dans `ctx.adapter`, sans wrapper de test.

### A-04b — forme d'entrée incompatible, en silence

EF-02A reçoit un `CorpusSnapshot` dont les sources portent `id`,
`provenance.originalReference` et `statutScreening` **inline**. v0.1 attendait
`sourceId`, `providerNativeId` et un objet `auditDecisions` séparé. Elle ne
levait pas : elle rendait **0 graine en silence** (T02).

`normalizeProfessionalDiscoveryInput` consomme la forme réelle et **refuse
explicitement** toute forme inattendue (`CORPUS_SNAPSHOT_SHAPE_UNEXPECTED`) ou
un `sources[]` vide — un échec silencieux est pire qu'une exception.

## Chemin runtime réellement traversé

`MONO-02/lib/node-runners.js` l.164/172/180 appelle
`mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot,
missionDimensionSet, {adapter: ctx.adapter, …})`.

Les tests T15/T16 pilotent **ces runners de nœuds**, avec le vrai `mono01`, le
vrai port, la vraie validation de schéma, et propagent `ctx.nodeOutputs[nodeId]
= result.output` exactement comme `orchestration-engine.js` l.220. **Aucune
sortie d'EF-02A n'est mockée.** T16d vérifie qu'un adaptateur absent produit
toujours `DEPENDENCY_UNAVAILABLE` sur ce même chemin.

C'est le test qui manquait à v0.1.

## Politique d'identité

| Élément | Règle |
|---|---|
| `PROVIDER_AUTHOR_ID` | conservé tel quel ; absent → `null`, `resolutionStatus` explicite |
| `ORCID` | absent → `null`, jamais fabriqué |
| `AFFILIATION` | absente → `null` |
| `DISPLAY_NAME` | **jamais** une identité forte : deux occurrences d'un même nom sur des œuvres distinctes restent des candidats **distincts**, marqués `HOMONYM_UNRESOLVED_WITHOUT_PROVIDER_ID` |
| `SEED_REFERENCE` | œuvre-source réelle, avec `providerWorkId` |
| `EVIDENCE_REFS` | identifiants d'œuvres réelles uniquement |

Aucun auteur ne devient `VERIFIED_PROFESSIONAL` dans la découverte. Un homonyme
non résolu ressort `AMBIGUOUS` d'EF-02B et **n'entre pas** dans le corpus.

## Durcissement A-03 — règle exacte

Un identifiant est tenu pour fabriqué si :

1. c'est un DOI de préfixe **`10.0000/`** — plage officiellement non attribuée ;
2. il porte le marqueur de lot **`mono08-`** ou **`mono09-`** ;
3. il correspond à **`work-<1 à 12 caractères alphanumériques minuscules>`**,
   sans schéma d'URL — forme locale de l'ancien générateur.

v0.1 exigeait exactement 6 caractères : `work-ab1` passait. Vérifié non rejetés
(T13) : DOI réels, identifiants OpenAlex, ORCID, préfixes d'enregistrant réels.

## Ce que ce lot ne fait toujours pas

`scientificValidity` et `humanProfessionalValidation` restent des littéraux
codés en dur dans MONO-01. MONO-09 ne les touche pas (T19). Ce sujet relève de
MONO-10, après gel de v0.2.
