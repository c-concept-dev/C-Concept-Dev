# MONO-10 v0.6 — lignée

## 1. Le défaut fermé (B11, B12)

En v0.5, la relation portée par une référence de lignée n'était pas contrainte
par le **type** de l'artefact visé. Réétiqueter une référence suffisait à faire
passer un artefact pour un autre. Par ailleurs, l'appelant pouvait fournir
`crossRunAllowedRelations` et autoriser lui-même des arêtes inter-runs.

## 2. Table d'arêtes typées, autoritaire

`ARTIFACT_TYPE_OF_RELATION` associe chaque relation à **exactement un** schéma
d'artefact :

```
MISSION               → EvidenceForge.Mission
PRIOR_REPORT          → EvidenceForge.PriorUnifiedReport
DOCUMENTARY_EVIDENCE  → EvidenceForge.DocumentaryEvidenceRecord
DISCOVERY             → EvidenceForge.ProfessionalDiscovery
VERIFICATION          → EvidenceForge.ProfessionalVerification
ASSESSMENT            → EvidenceForge.ProfessionalCandidateAssessment
PANEL_DECISION        → EvidenceForge.ProfessionalPanelValidation
EFFECTIVE_ELIGIBILITY → EvidenceForge.EffectiveCorpusEligibilitySet
CORPUS                → EvidenceForge.ProfessionalCorpusSet
TWINS                 → EvidenceForge.DocumentaryTwinSet
REVIEWS               → EvidenceForge.ReviewSet
AGGREGATION           → EvidenceForge.Aggregation
READINESS_PRE         → EvidenceForge.ScientificReadiness
READINESS_FULL        → EvidenceForge.ScientificReadiness
CAPABILITY            → EvidenceForge.LlmCapability
QUALIFICATION         → EvidenceForge.ScientificQualification
REPORT                → EvidenceForge.ScientificUnifiedReport
ACCEPTANCE            → EvidenceForge.FinalReportAcceptance
AUTHORIZATION         → EvidenceForge.DownstreamUseAuthorization
```

`artifactRef(artifact, id, relation)` **lève** `LINEAGE_TYPE_RELATION_MISMATCH`
si le schéma de l'artefact ne correspond pas à la relation déclarée. Ce garde a
attrapé une erreur d'étiquetage dans le code de fixture de ce lot même : un
rapport antérieur classé sous `RELATION.MISSION`. La relation `PRIOR_REPORT` a
été ajoutée, et l'erreur corrigée là où elle était — dans la fixture.

Deux relations peuvent viser le même schéma (`READINESS_PRE` / `READINESS_FULL`) :
la distinction porte alors sur l'arête, pas sur le type.

## 3. Parents attendus

`EXPECTED_PARENTS` définit le graphe amont de chaque relation. Une résolution
qui ne trouve pas les parents attendus échoue ; elle ne se rabat pas sur un
résultat partiel.

## 4. Arêtes inter-runs

`crossRunAllowedRelations` fourni par l'appelant est **explicitement ignoré**, et
le fait de l'avoir fourni est consigné dans le résultat.

Le seul chemin légitime est un **contrat d'entrée historique** :

```js
historicalInputContract: {
  contractKind: "IMMUTABLE_HISTORICAL_INPUT",
  relations: [...],
  operatorAuthenticated: true        // requis
}
```

Sans `operatorAuthenticated === true`, le contrat ne résout rien. Un appelant ne
s'accorde pas à lui-même le droit de traverser les runs.

## 5. Type absent : *fail closed*

Une entrée de registre dont la relation ou le type d'artefact est nul ne résout
pas. Un type absent n'est pas un type compatible.

## 6. Artefacts dérivés

`adapters/upstream-evidence-binder.js` produit une `ProfessionalDiscovery`
**dérivée** dont les références résolvent contre le registre authentifié.
L'artefact amont n'est ni modifié ni remplacé : il reste enregistré, il est
référencé par `derivedFrom.upstreamDiscoveryRef`, et chaque candidat conserve
ses références amont d'origine dans `upstreamEvidenceRefs`.

Aucun statut historique n'est réécrit ; chaque conclusion conserve son lineage.
