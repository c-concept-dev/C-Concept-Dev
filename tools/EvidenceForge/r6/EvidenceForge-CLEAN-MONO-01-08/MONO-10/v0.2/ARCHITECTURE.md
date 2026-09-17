# MONO-10 v0.2 — Qualification scientifique, noyau générique

Lot **entièrement additif**. MONO-01 → MONO-09 et MONO-10 v0.1 sont inchangés.

## Frontière physique du générique

```
core/       noyau universel — aucun cas, domaine, fournisseur ni registre
adapters/   traductions vers le vocabulaire d'un cas — optionnelles
```

Le noyau ignore totalement `adapters/`. Une mission qui n'est pas un cas donné
ne rencontre jamais son vocabulaire. Cette frontière est vérifiée par un test
d'hygiène lui-même contrôlé pour être discriminant.

## Identité — générique par construction

`core/identity-evidence.js` ne connaît **aucun registre**. Une preuve porte
`evidenceType`, `provider`, `identifier`, `subjectBinding`, `verificationStatus`
et une `confidenceContribution` fournie par l'appelant.

`STRONG` dérive de la **structure** : au moins deux sources indépendantes,
toutes à liaison confirmée, dont une vérifiée, atteignant un seuil de politique
injectable. Un registre professionnel non académique y donne accès aussi bien
qu'un identifiant académique — c'est le défaut de v0.1 qui est fermé.

`AMBIGUOUS` prime toujours : une liaison ambiguë ou deux identifiants
divergents du même type interdisent `STRONG`, quelle que soit la force des
autres preuves.

## Pertinence — sans égalité de libellés

`core/relevance.js` combine un recouvrement **structurel** (jetons partagés,
inclusion) et un `semanticOracle` **injecté**. Aucune taxonomie, aucune liste de
disciplines, aucun dictionnaire.

`"civil engineering"` face à `"engineering"` donne `PLAUSIBLE`. Sans recouvrement
ni oracle, le verdict est `UNKNOWN` — **jamais** `OUT_OF_SCOPE`. Le hors-champ
n'est prononcé que sur avis explicite d'un oracle.

## Porte humaine — binding réel

Chaque décision porte `candidateBindingHash` (identité + preuves + mission) et
l'artefact porte `missionBindingHash`. À la consommation, les deux sont
**recalculés et comparés**. Une approbation ne survit ni à un changement
d'évaluation, ni de mission, ni de preuves, ni de candidat.

## Fixtures étanches

Tout artefact porte `executionEvidenceClass ∈ {TEST_FIXTURE, REAL_RUNTIME}`.
En mode production, la classe doit être `REAL_RUNTIME` **et** aucun marqueur de
fixture ne doit subsister. Il n'existe aucun défaut permissif.

## Qualification — validateurs, pas statuts de surface

`qualifyProcess` **appelle** `validatePanelValidation`, `assertCapabilityUsable`,
`assertLineageNonEmpty` et `assertProductionEvidence`. Elle ne lit jamais un
`status` sur parole. Une fixture est rejetée avant qualification.

## Inconnus — lineage-first

Chaque unknown porte `unknownId`, `originArtifact`, `reason`, `blockingStatus`,
`evidenceRefs`, `status`, `transitions`. Il ne sort du flux que par
`RESOLVED`, `SUPERSEDED` ou `RECLASSIFIED`, chacune exigeant un motif **et** une
preuve. `assertNoSilentLoss` détecte toute disparition.

Un unknown `BLOCKING` interdit `QUALIFIED`. Un `NON_BLOCKING` permet au mieux
`QUALIFIED_WITH_RESERVATIONS` et **reste visible** dans les réserves.

## Verdict antérieur et autorisation aval

Le verdict antérieur est **toujours** conservé, quelle que soit sa valeur — testé
avec des verdicts génériques (`OUTCOME_A`, `OUTCOME_B`), pas seulement GO/NO_GO.
Une qualification insuffisante rend `scientificallyActionableVerdict = NONE` et
`downstreamUseAuthorized = false` : l'**usage** est bloqué, jamais
l'enregistrement.

`resolveDownstreamUseAuthorization` produit `AUTHORIZED`, `NOT_AUTHORIZED` ou
`DEFERRED`. Elle ne réécrit jamais le verdict.
