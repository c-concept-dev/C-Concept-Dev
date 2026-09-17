# MONO-10 v0.6 — protection anti-rejeu

## 1. Les deux défauts fermés

**B06 — `consumeNonce: false`.** En v0.5, l'appelant pouvait demander de ne pas
consommer le nonce, et rejouer indéfiniment la même attestation. En v0.6, sous
PRODUCTION, la consommation est **forcée** ; `consumeNonce: false` est ignoré et
le refus est consigné : « consumeNonce=false ignoré : la consommation du nonce
est obligatoire en production ».

Une seule exception, explicite et nommée : `readOnlyRevalidation: true`, utilisée
lorsqu'un consommateur revérifie un manifeste **déjà** authentifié. Elle ne
permet pas d'ouvrir un run.

**B07 — seconde réserve.** En v0.5, un second vérificateur avec sa propre
réserve de nonces rejouait l'attestation. En v0.6, la réserve est **provisionnée
par l'exploitant** et porte un **périmètre d'autorité** :

```js
createFileReplayStore({ directory, authorityScope: ["AUT-..."] })
```

Sans `authorityScope`, la création lève `REPLAY_STORE_SCOPE_MISSING`. Une
frontière dont la réserve ne couvre pas toutes ses autorités lève
`REPLAY_PROTECTION_SCOPE_INCOMPLETE`. Il n'y a pas de réserve « par défaut ».

## 2. Clé de nonce

```js
nonceKey(authorityId, keyId, nonce)
```

Le nonce seul n'est pas la clé : deux autorités distinctes ne se marchent pas
dessus, et une même autorité ne peut pas rejouer sous un autre `keyId`.

## 3. Contrat de réserve

```
hasSeen / getSeen / markSeen / checkAndConsume / coversAuthority
```

`assertStoreContract` refuse toute réserve incomplète. `isProvisionedStore`
n'accepte que les réserves marquées à la construction par le module.

`authorityNamespaceHash` est l'empreinte du **namespace logique de la réserve**
— répertoire résolu et périmètre d'autorité trié. Il est publiable et comparable
entre frontières : deux frontières de la même autorité qui ne partagent pas ce
namespace sont en échec fermé. Ce n'est pas l'empreinte du namespace
TEST/PRODUCTION, qui est contrôlé séparément (§5).

## 4. Propriétés vérifiées

| Attaque | Résultat |
|---|---|
| rouvrir un run avec la même attestation | `RUNTIME_ATTESTATION_INVALID` — nonce déjà consommé |
| second vérificateur, même réserve | refusé |
| seconde frontière, même autorité et même namespace, même répertoire de réserve | refusé |
| réserve sans périmètre | `REPLAY_STORE_SCOPE_MISSING` |
| périmètre ne couvrant pas l'autorité | `REPLAY_PROTECTION_SCOPE_INCOMPLETE` |
| `consumeNonce: false` sous PRODUCTION | ignoré et consigné |

## 5. Réserve en mémoire, et absence de réserve

`createMemoryReplayStore` existe pour les runs TEST. Provisionnée sur une
frontière de PRODUCTION, elle lève `REPLAY_PROTECTION_INSUFFICIENT` :
« un store en mémoire ne protège pas un espace de PRODUCTION : il ne survit pas
au processus. »

Aucune protection anti-rejeu du tout lève `REPLAY_PROTECTION_MISSING` : une
frontière de PRODUCTION ne peut pas s'en passer. Il n'y a pas de mode dégradé
silencieux.
