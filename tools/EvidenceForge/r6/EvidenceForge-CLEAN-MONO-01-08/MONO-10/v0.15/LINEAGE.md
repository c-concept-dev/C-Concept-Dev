# MONO-10 v0.7 — lignée

## 1. Arêtes typées, table autoritaire

`ARTIFACT_TYPE_OF_RELATION` associe chaque relation à **exactement un** schéma
d'artefact. `artifactRef(artifact, id, relation)` lève
`LINEAGE_TYPE_RELATION_MISMATCH` si le schéma ne correspond pas. La relation
retenue à la résolution est celle **lue sur le registre**, jamais l'étiquette
portée par la référence. Deux relations peuvent viser le même schéma
(`READINESS_PRE` / `READINESS_FULL`) : la distinction porte alors sur l'arête.

Ces propriétés, acquises en v0.6, ont résisté à l'audit et ne changent pas.

## 2. Franchissement de run : ce qui change en v0.7 (B2)

v0.6 acceptait un objet `historicalInputContract` portant
`operatorAuthenticated: true`. Ce booléen était écrit par l'appelant. v0.7 le
remplace par une capacité provisionnée :

```js
resolveLineage(refs, registry, {
  verifier: verifier,                 // §6 (v0.10) : l'opération, pas l'émetteur
  manifest: manifest,                 // contexte attendu du run de destination
  historicalInputRequests: [ /* §8 : neuf champs */ ],
})
```

- `historicalInputContract` fourni par l'appelant : **ignoré et signalé** ;
- `crossRunAllowedRelations` fourni par l'appelant : **ignoré et signalé** ;
- l'autorisation porte sur **l'artefact exact**, pas sur une classe de relation.

Voir `HISTORICAL-INPUT-AUTHORITY.md`.

## 3. Cross-mission

Refusé par défaut. Seule une autorisation d'entrée historique dont les champs
`destinationMissionHash` et `sourceMissionHash` correspondent exactement peut le
lever.

## 4. Métadonnée absente : *fail closed*

`runId`, `missionHash`, `artifactType`, `relation`, empreinte : l'absence de
l'une fait échouer la résolution. Un type absent n'est pas un type compatible.

## 5. Liaison sémantique des dimensions de préparation (B4)

La lignée dit qu'une référence **résout**. Elle ne dit pas ce qu'elle
**établit**. L'audit a fabriqué une phase FULL en empruntant à une dimension
réellement sourcée ses `derivedFromRefs`.

v0.7 ajoute `DIMENSION_EXPECTED_RELATIONS` : chaque dimension de préparation ne
peut être établie que par un artefact du type attendu, et le type est lu sur le
registre. Une preuve empruntée porte donc la mauvaise relation et n'établit
rien (`READINESS_DIMENSION_EVIDENCE_UNBOUND`). La phase est **dérivée** des
liaisons valides, jamais lue sur l'étiquette. Voir `ARCHITECTURE.md` §5 et
`scientific-readiness.js`.

## 6. Artefacts dérivés

`adapters/upstream-evidence-binder.js` produit une `ProfessionalDiscovery`
dérivée dont les références résolvent. L'artefact amont n'est ni modifié ni
remplacé : il reste enregistré, référencé par `derivedFrom.upstreamDiscoveryRef`,
et chaque candidat conserve `upstreamEvidenceRefs`. Aucune propriété amont n'est
renforcée (§18).

Aucun statut historique n'est réécrit ; chaque conclusion conserve son lineage.
