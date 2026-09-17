# MONO-10 v0.6 — confiance du registre d'artefacts

## 1. Le défaut fermé (B04)

En v0.5, le registre d'artefacts était une carte ouverte. Après l'attestation du
run, un appelant pouvait y insérer un artefact et le voir résoudre comme une
preuve du run. Rien ne distinguait « enregistré » de « authentifié ».

## 2. Ouverture

```js
const registry = openAuthenticatedArtifactRegistry(manifest, ctx);
```

`openAuthenticatedArtifactRegistry` appelle `RM.assertManifestAuthentic` : sans
frontière opérateur et sans attestation vérifiée, **aucun registre n'est ouvert**.
Un manifeste de forme valide mais non authentique — par exemple dont
`operatorTrustBoundaryId` a été remplacé et `manifestBindingHash` recalculé en
conséquence — est refusé. La cohérence interne ne suffit pas.

## 3. Journal append-only

Chaque enregistrement produit un événement :

```
registryEvent { sequence, artifactId, relation, artifactType,
                artifactHash, previousEventHash, eventHash }
```

`registryRootHash` est la racine courante. Les propriétés vérifiées par tests :

| Attaque | Résultat |
|---|---|
| suppression d'un événement | chaîne invalide |
| réordonnancement | chaîne invalide |
| mutation de `previousEventHash` | chaîne invalide |
| registre d'un autre run | `ARTIFACT_REGISTRY_RUN_MISMATCH` |
| mutation du contenu d'un artefact enregistré | contenu **gelé en profondeur** ; `get()` réempreinte et lève `ARTIFACT_CONTENT_MUTATED` |

`verifyExportedEventChain(initialRootHash, events)` permet de revérifier un
journal exporté sans faire confiance à l'objet registre.

## 4. Racine « telle qu'à l'enregistrement »

Un rapport lie la racine du registre. Mais enregistrer l'acceptation **après** le
rapport fait avancer la racine. `rootBeforeSequence(n)` et `sequenceOf(id)`
permettent de comparer la racine **telle qu'elle était au moment de
l'enregistrement du rapport**. Sans cela, la vérification échouait pour une
raison purement chronologique — ce qui aurait été un faux négatif, pas une
sécurité.

## 5. Niveaux de confiance

`register()` accorde `BOUND_TO_RUN` : l'artefact est lié au run par empreinte
croisée. Rien de plus.

`elevate(artifactId, level, justificationHash)` est le seul chemin vers
`AUTHENTICATED_PROVENANCE`, `HUMAN_AUTHENTICATED` ou
`PRODUCTION_CAPABILITY_PROVED`, et exige une justification empreintée.

Conséquence directe, testée : un artefact de preuve documentaire inséré après
l'attestation reste `BOUND_TO_RUN`, et `assertAtLeast(..., AUTHENTICATED_PROVENANCE)`
lève `TRUST_LEVEL_INSUFFICIENT`. Être dans le registre n'est pas être une preuve.
