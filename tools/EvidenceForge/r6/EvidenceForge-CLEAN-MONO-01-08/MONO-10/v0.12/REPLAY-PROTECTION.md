# MONO-10 v0.11 — protection anti-rejeu

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

## 2. Ce que v0.7 laissait ouvert

v0.7 dérivait bien le namespace, mais l'emplacement restait une **valeur de
configuration** (`replayRoot`). L'audit A a montré que deux `replayRoot`
déclarées par le même exploitant acceptaient le même nonce : la clé
`ANTI_REPLAY_SHARED_AT_AUTHORITY_KEY_SCOPE = YES` était donc **surévaluée**.

## 3. v0.8 — la réserve est ANCRÉE à la configuration de confiance (§21-§24)

```
replayNamespaceId = H( namespace , { authorityId -> keyIds } , ancre de configuration )
réserve           = dirname(trustConfigPath)/.evidenceforge-replay/<replayNamespaceId>
```

`replayProtection.directory` **et** `replayProtection.replayRoot` sont refusés
(`REPLAY_LOCATION_REFUSED`). L'emplacement n'est plus configurable du tout.

**Conséquence exacte : pour une configuration de confiance donnée — c'est-à-dire
pour une racine de confiance donnée — il existe exactement UNE réserve par
autorité et par clé.** C'est l'option §24-A : plusieurs racines pour la même
autorité/clé sont interdites, parce qu'aucune racine n'est déclarable.

**Note de conception (§23).** `replayNamespaceId` n'inclut PAS
`operatorBoundaryId` : deux frontières de la même autorité et de la même clé
doivent **partager** la réserve, et inclure leur identifiant respectif
détruirait précisément la propriété à garantir. Il inclut l'identité de la
configuration de confiance, et il est engagé dans `boundaryDescriptorHash` avec
l'ancre.

## 3bis. v0.9 — l'ancre est PHYSIQUE, pas textuelle (R2)

v0.8 dérivait l'ancre et l'emplacement avec `path.resolve`, qui normalise une
chaîne sans suivre les liens. L'audit A a montré que
`/réel/config.json` et `/alias/config.json → /réel/config.json` donnaient deux
ancres, donc deux réserves, donc un nonce rejouable via l'alias.

v0.9 résout le **chemin canonique** (`realpathSync`) et y ajoute l'identité
d'inode du fichier quand le système la fournit — pour l'ancre **et** pour
l'emplacement de la réserve. Conséquences vérifiées :

| Cas | Résultat |
|---|---|
| alias symbolique du même fichier | **même** ancre, **même** réserve (T08, T10) |
| alias relatif (`./config.json`) | **même** ancre (T09) |
| deux fichiers réellement distincts | deux racines distinctes (T11) |
| chemin canonique non établissable | `TRUST_CONFIG_ANCHOR_UNRESOLVABLE` — une ancre approximative vaudrait une réserve approximative |

## 4. Trois verrous complémentaires

| Verrou | Ce qu'il ferme | Code d'échec |
|---|---|---|
| ancrage physique | l'emplacement ne peut être ni choisi ni contourné par un alias | `REPLAY_LOCATION_REFUSED`, `TRUST_CONFIG_ANCHOR_UNRESOLVABLE` |
| marqueur `.replay-namespace` | une réserve étrangère ou substituée | `REPLAY_NAMESPACE_MARKER_MISMATCH` |
| registre de processus | deux frontières de même autorité/clé sous deux namespaces | `REPLAY_NAMESPACE_CONFLICT` |

## 5. Le namespace est engagé par le descripteur (§11, §23)

`boundaryDescriptorHash` inclut `replayNamespaceId`. Le manifeste de run engage
ce hash ; `assertManifestAuthentic` compare. Changer de réserve change donc le
descripteur, donc le manifeste : la substitution est détectée en aval, pas
seulement à l'ouverture.

## 6. Consommation obligatoire

Sous PRODUCTION, la consommation du nonce est **forcée**. `consumeNonce: false`,
`0`, `null`, `undefined`, `""` et les formes imbriquées sont ignorés et
consignés. Seule exception nommée : `readOnlyRevalidation: true`, réservée à la
revérification d'un manifeste **déjà** authentifié — elle échoue si le nonce
n'a jamais été consommé, et `openRunEvidenceManifest` ne la propage pas depuis
l'appel.

## 7. Propriétés vérifiées

| Attaque | Résultat |
|---|---|
| rejeu sur la même frontière | refusé |
| rejeu par un second vérificateur | refusé |
| **rejeu par une seconde frontière de la même autorité** | **refusé** (T15) |
| rejeu après réinitialisation du registre de processus | refusé (T16) |
| **racine de réserve choisie (`replayRoot` ou `directory`)** | **`REPLAY_LOCATION_REFUSED` (T41)** |
| **seconde réserve pour la même autorité sous la même racine de confiance** | **impossible : namespace et emplacement identiques (T42)** |
| marqueur de namespace désapparié | `REPLAY_NAMESPACE_MARKER_MISMATCH` (T43) |
| réserve en mémoire en PRODUCTION | `REPLAY_PROTECTION_INSUFFICIENT` |
| aucune protection anti-rejeu | `REPLAY_PROTECTION_MISSING` |

## 8. LIMITE DÉCLARÉE, réduite

Il reste qu'un exploitant peut écrire **une seconde configuration de confiance**
et l'exposer via `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG`. Mais ce n'est plus
« deux réserves d'une même racine » : **deux fichiers de configuration sont deux
racines de confiance distinctes**, ce qui est exactement l'hypothèse déjà
déclarée en `TRUST-MODEL.md` §7 — ni plus, ni moins.

Ce qui est acquis : à racine de confiance donnée, le partage de la réserve n'est
plus une convention de configuration que l'on peut oublier ou détourner. Il est
structurel, parce que l'emplacement n'est plus un paramètre.


## Décision §15 (v0.10) — renommage de la configuration de confiance

L'ancre est `H(chemin canonique, identité physique)`. Un **renommage** ou un
**déplacement** du fichier de configuration change donc l'ancre, donc
`replayNamespaceId`, donc la réserve. Il fallait décider, et le dire.

**Décision retenue : NOUVELLE GÉNÉRATION DE CONFIANCE.** Renommer la
configuration de confiance est un acte d'exploitation qui ouvre une nouvelle
génération, avec une réserve neuve.

**L'alternative a été écartée, et voici pourquoi.** N'ancrer que sur `dev`/`ino`
rendrait le renommage transparent — mais les numéros d'inode sont réutilisés par
le système après suppression, et une configuration sans aucun rapport pourrait
alors hériter de la réserve d'une autre. Le remède serait pire.

### Ce que le contrat garantit, et ce qu'il ne garantit pas

| | |
|---|---|
| **Garanti** | aucun nonce n'est accepté deux fois **dans** une génération de confiance ; deux alias du même fichier partagent la même réserve (chemin canonique + inode) |
| **Non garanti** | la protection anti-rejeu **ne traverse pas** un changement de génération |

Le lot ne prétend pas protéger plus que cela.

### Ce n'est pas silencieux

1. `trustConfigAnchor` est engagé dans `boundaryDescriptorHash`, donc dans le
   manifeste de run, donc dans chaque attestation : un changement de génération
   est **visible dans tout artefact** produit après lui ;
2. dans un même processus, présenter la même autorité et la même clé sous un
   autre namespace anti-rejeu est **refusé** — `REPLAY_NAMESPACE_CONFLICT`. Le
   lot ne fait pas suivre la réserve ; il refuse de faire semblant.

### Où se situe le résidu

Seul le détenteur de la racine de confiance peut renommer ce fichier. Cette
capacité est déjà incluse dans la TCB déclarée (TRUST-MODEL.md §7), et elle
permet de toute façon de remplacer les clés. Le résidu ne s'étend donc pas
au-delà de l'hypothèse déjà publiée.
