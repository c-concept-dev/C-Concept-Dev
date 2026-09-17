# MONO-10 v0.7 — protection anti-rejeu

## 1. Le défaut que v0.7 ferme (B3)

L'audit indépendant de v0.6 a rejoué une attestation déjà consommée :

```
frontiere A (autorite X, cle K) consomme le nonce      -> valid
frontiere B (autorite X, cle K), REPERTOIRE DISTINCT   -> valid AUSSI
```

v0.6 vérifiait seulement qu'une réserve couvrait les autorités de **sa**
frontière. Le partage effectif reposait donc sur une **convention de
configuration** : faire pointer deux fichiers vers le même répertoire.
`authorityNamespaceHash` était calculé, publié… et jamais comparé.

## 2. Le namespace est DÉRIVÉ, donc non choisissable (§9, §10)

```
replayNamespaceId = H( namespace , { authorityId -> keyIds } )
repertoire        = <replayRoot>/<replayNamespaceId>
```

Une frontière de PRODUCTION ne déclare plus de répertoire : elle déclare une
**racine**, et l'emplacement en découle. `replayProtection.directory` est
désormais **refusé** (`REPLAY_DIRECTORY_REFUSED`) : un emplacement choisi
permettrait de réinitialiser le namespace.

Deux frontières portant la même autorité et la même clé calculent
nécessairement le même identifiant, donc partagent la même réserve.

## 3. Trois verrous complémentaires

| Verrou | Ce qu'il ferme | Code d'échec |
|---|---|---|
| dérivation | l'identifiant ne peut pas être choisi | — |
| marqueur `.replay-namespace` | une réserve étrangère ou substituée | `REPLAY_NAMESPACE_MARKER_MISMATCH` |
| registre de processus | deux frontières de même autorité/clé sous deux namespaces | `REPLAY_NAMESPACE_CONFLICT` |

## 4. Le namespace est engagé par le descripteur (§11)

`boundaryDescriptorHash` inclut `replayNamespaceId`. Le manifeste de run engage
ce hash ; `assertManifestAuthentic` compare. Changer de réserve change donc le
descripteur, donc le manifeste : la substitution est détectée en aval, pas
seulement à l'ouverture.

## 5. Consommation obligatoire

Sous PRODUCTION, la consommation du nonce est **forcée**. `consumeNonce: false`,
`0`, `null`, `undefined`, `""` et les formes imbriquées sont ignorés et
consignés. Seule exception nommée : `readOnlyRevalidation: true`, réservée à la
revérification d'un manifeste **déjà** authentifié — elle échoue si le nonce
n'a jamais été consommé, et `openRunEvidenceManifest` ne la propage pas depuis
l'appel.

## 6. Propriétés vérifiées

| Attaque | Résultat |
|---|---|
| rejeu sur la même frontière | refusé |
| rejeu par un second vérificateur | refusé |
| **rejeu par une seconde frontière de la même autorité** | **refusé** (T15) |
| rejeu après réinitialisation du registre de processus | refusé (T16) |
| répertoire de réserve choisi | `REPLAY_DIRECTORY_REFUSED` (T17) |
| marqueur de namespace modifié | `REPLAY_NAMESPACE_MARKER_MISMATCH` (T18) |
| réserve en mémoire en PRODUCTION | `REPLAY_PROTECTION_INSUFFICIENT` |
| aucune protection anti-rejeu | `REPLAY_PROTECTION_MISSING` |

## 7. LIMITE DÉCLARÉE

**Un exploitant qui écrit une seconde configuration désignant une autre
`replayRoot` crée une seconde réserve physique.** Aucun mécanisme interne au
processus ne peut l'en empêcher : il faudrait un service central de nonces, que
ce lot ne fournit pas.

C'est la même hypothèse d'environnement d'exploitation que la racine de
confiance (`TRUST-MODEL.md` §7). Ce qui **est** acquis : le partage n'est plus
une convention que l'on peut oublier, c'est une dérivation que l'on ne peut pas
contourner **à `replayRoot` donnée**, et toute divergence de réserve se voit
dans le descripteur de frontière.
