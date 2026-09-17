# MONO-10 v0.5 — Contrat de protection anti-rejeu

## 1. Pourquoi un contrat

En v0.4, l'anti-rejeu reposait sur un `Set` en mémoire **facultatif**, fourni par
l'appelant. Sans lui, une attestation valide se rejouait indéfiniment dans sa
fenêtre de validité. L'audit a classé cela `REPLAY_PROTECTION_SUFFICIENT = NO`.

En v0.5, la protection est **provisionnée par la frontière opérateur** et
**obligatoire en production**.

## 2. Le contrat

```
hasSeen(authorityId, nonce)              -> bool
getSeen(authorityId, nonce)              -> enregistrement de consommation | null
markSeen(authorityId, nonce, meta)       -> bool
checkAndConsume(authorityId, nonce, meta)-> { consumed, reason }
```

`checkAndConsume` doit être **atomique** du point de vue de l'appelant : deux
consommations du même nonce ne peuvent pas réussir toutes les deux.

## 3. Portée du nonce

La clé est le couple **(authorityId, nonce)**. Deux autorités distinctes ont des
espaces de nonces distincts : la compromission d'un espace n'affecte pas l'autre.

## 4. Consommation à l'ouverture, pas à chaque lecture

Le nonce est consommé **une seule fois**, à l'ouverture du run
(`openRunEvidenceManifest`, `consumeNonce: true`). Les vérifications ultérieures
du même run passent `consumeNonce: false`.

`getSeen` permet alors de distinguer deux situations que v0.4 confondait :

| Situation | Décision |
|---|---|
| nonce consommé **par ce run** | reverification légitime — acceptée |
| nonce consommé **par un autre run** | **rejeu** — refusé |

## 5. Persistance

| Implémentation | `persistent` | Admise en PRODUCTION |
|---|---|---|
| `createMemoryReplayStore` | `false` | **non** (`REPLAY_PROTECTION_INSUFFICIENT`) |
| `createFileReplayStore(dir)` | `true` | oui |

Le store fichier crée une entrée par nonce en **création exclusive** (`flag: "wx"`) :
l'opération échoue si l'entrée existe déjà, ce qui donne l'atomicité au niveau du
système de fichiers, y compris entre processus concurrents.

## 6. Comportement au redémarrage

Un store persistant **survit au processus**. Le test le vérifie : après
reconstruction du store sur le même répertoire, `hasSeen` reste vrai.

## 7. Absence de store

En `PRODUCTION`, une frontière sans protection anti-rejeu est **refusée au
provisionnement** (`REPLAY_PROTECTION_MISSING`). Pas d'avertissement, pas de
mode dégradé : **fail closed**.

## 8. Marque d'origine

Un objet fourni par l'appelant qui imiterait exactement le contrat est refusé :
seul un store construit par `core/replay-protection.js` porte la marque que
`isProvisionedStore` vérifie.

## 9. Concurrence

Le store fichier est sûr entre processus grâce à la création exclusive. Un store
distribué (Redis, base transactionnelle) devrait offrir la même garantie
d'atomicité sur `checkAndConsume` ; le contrat ne prescrit pas la technologie.

## 10. Expiration des entrées

Le contrat ne purge pas. Une entrée peut être supprimée sans risque **après
l'expiration de l'attestation correspondante** (`expiresAt`), puisqu'une
attestation expirée est de toute façon refusée. La politique de purge relève de
l'exploitation ; purger trop tôt rouvrirait une fenêtre de rejeu.
