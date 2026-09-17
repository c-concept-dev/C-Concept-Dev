# MONO-10 — Migration v0.2 → v0.3

La v0.2 reste **historique et intacte**. Rien n'y a été réécrit. Ce document
décrit ce qu'un appelant doit changer pour consommer la v0.3.

## 1. Ruptures de contrat

### 1.1 `executionEvidenceClass` n'a plus aucune force probante

`core/execution-evidence.js` **n'existe plus**. La provenance vient du runtime :

```js
const RM = require("./core/run-evidence-manifest.js");
const manifest = RM.createRunEvidenceManifest({ runId, executionMode: RM.MODE.PRODUCTION });
const bound = RM.bindArtifact(manifest, artifact, "candidate-assessment", artifact.schema);
// plus tard, à la consommation :
RM.assertProductionEvidence(bound, manifest, "ProfessionalCandidateAssessment");
```

Le champ peut subsister dans des artefacts anciens ; il n'est plus **lu** comme
preuve nulle part.

### 1.2 `IdentityEvidence.provider` → `sourceAuthorityId` + `sourceFamilyId`

`provider` n'est plus interprété. Une preuve sans `sourceAuthorityId` produit
`INDEPENDENCE_UNKNOWN` — jamais `INDEPENDENT`. Fournir ces champs est le rôle
d'un adaptateur de domaine :

```js
const { createDeclaredAuthorityExtractor } = require("./adapters/declared-authority-identity-adapter.js");
const extractor = createDeclaredAuthorityExtractor({ "clé": { authorityId: "AUT-A", familyId: "FAM-1" } });
CA.assessCandidates({ discovery, verification, missionLabels, identityExtractor: extractor });
```

Conséquence attendue : des identités qui obtenaient `STRONG` en v0.2 tombent à
`MODERATE`. **C'est la correction, pas une régression** — l'indépendance n'avait
jamais été démontrée.

### 1.3 `Unknown.status` est dérivé

Écrire `status` à la main lève `UNKNOWN_STATUS_FORGED`. Pour fermer un inconnu :

```js
const closed = UNK.transition(u, UNK.STATUS.RESOLVED, { reason: "…", evidenceRefs: ["e1"] });
```

Motif **et** `evidenceRefs` non vide sont obligatoires.

### 1.4 La lignée doit résoudre

`assertLineageNonEmpty` est remplacé par `resolveLineage` / `assertLineageResolved`,
qui exigent un **registre** des artefacts réellement disponibles :

```js
const registry = LIN.createArtifactRegistry([{ artifactId: "candidate-assessment", artifact: assessment }, …]);
LIN.assertLineageResolved(refs, registry, { requiredRelations: [...] }, "lineage");
```

### 1.5 Préparation : PRE et FULL

`evaluateReadiness` expose `requiredDimensions`, `assessedDimensions` et
`inputsBindingHash`. À la consommation, utiliser `assertReadinessPhase(readiness, "FULL")` :
une PRE réétiquetée est rejetée parce que les dimensions FULL manquent.

### 1.6 Qualification : recalcul, pas lecture

`qualifyProcess` ne consomme plus `readinessPre` / `readinessFull` comme source
de vérité. Il **recalcule** les deux à partir des artefacts sources ; les
artefacts présentés sont comparés, et toute divergence est un échec dur.
Passer désormais les sources :

```js
SQ.qualifyProcess({ candidateAssessment, panelValidation, llmCapability, llmConfig,
                    professionalCorpus, twinSet, reviewSet, aggregation,
                    lineageRefs, artifactRegistry, readinessPre, readinessFull });
```

### 1.7 Acceptation : le rapport est obligatoire

`validateAcceptance(acceptance, report, mode)` — `report` n'est plus facultatif.
De plus, `reservationsPresented` / `unknownsPresented` doivent correspondre au
contenu du rapport : l'humain a décidé au vu de ce qui lui a été montré.

### 1.8 Autorisation aval : revalidation par défaut

`policy.revalidationRequired` vaut `true`. Fournir `qualificationSources`,
`report`, `acceptance`, `acceptanceValidator`, `lineageRefs` et
`artifactRegistry`, faute de quoi l'autorisation est refusée — fail-closed.

### 1.9 La porte de panel est un module livré

```js
const { createPanelGatedAdapter } = require("./core/panel-gated-adapter.js");
const gated = createPanelGatedAdapter(baseAdapter, { panelValidation, candidateAssessment });
```

L'adaptateur de base doit exposer `discoverProfessionals`, `verifyProfessionals`
et `buildProfessionalCorpus`. Son statut de vérification **n'est pas modifié** ;
seuls les candidats éligibles lui sont transmis à l'étape corpus.

## 2. Tableau des renommages

| v0.2 | v0.3 |
|---|---|
| `core/execution-evidence.js` | `core/run-evidence-manifest.js` |
| `stamp(CLASS.REAL_RUNTIME)` | `bindArtifact(manifest, artifact, id, type)` |
| `assertProductionEvidence(a, label, mode)` | `assertProductionEvidence(a, manifest, label)` |
| `assertLineageNonEmpty(refs, label)` | `assertLineageResolved(refs, registry, opts, label)` |
| `IdentityEvidence.provider` | `sourceAuthorityId` + `sourceFamilyId` |
| `providerOf(id)` | **supprimé** — une URL ne démontre aucune indépendance |
| `schemaVersion: "MONO-10-v2"` | `schemaVersion: "MONO-10-v3"` |

## 3. Ce qui n'a pas changé

`core/relevance.js` est repris **à l'identique** : l'audit l'a trouvé conforme.
Les invariants de fond sont inchangés — aucun métier codé en dur, aucune décision
humaine simulée, `unknown` reste `unknown`, un lot gelé n'est jamais réécrit.
