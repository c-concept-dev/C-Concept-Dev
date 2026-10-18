# E5, étape 4 — la cérémonie : plan soumis avant tout code

Écrit le 18 octobre 2026, après la clôture des trois étapes de mécanique.

---

## 1. La réserve d'E1, pied par pied

Elle tenait sur quatre appuis. Un seul a bougé.

| appui | état aujourd'hui |
|---|---|
| « il n'existe pas encore de page web pour l'exécuter » | **tombé** — E5 la construit |
| « dix dépendances transitives, pour l'essentiel de la vérification d'attestation » | debout |
| « écrire moi-même l'analyse CBOR et COSE serait pire » | debout, et je le maintiens |
| « SEC-02 dit *idéalement* ; l'exigence dure est la session de 90 jours » | **à corriger** — voir ci-dessous |

## 2. Ce que la vérification a trouvé, et qui change la question

La note d'E1 écrit : « l'exigence dure est la session de 90 jours sans ressaisie, révocable à
distance, **et elle est tenue** ». Elle décrit une **conception**, pas un comportement.

| pièce | état réel |
|---|---|
| tables `utilisateur`, `cle_acces`, `session`, `droit` | créées par la migration 2, **lues et écrites par rien** |
| logique des droits (`packages/noyau/src/droits.ts`) | écrite et testée, **appelée nulle part dans le Worker** |
| porte du Worker | **un jeton de service unique**, comparé en temps constant |
| cérémonie | pas écrite |

**Il n'y a aujourd'hui aucune personne dans le système en marche.** Un jeton unique ouvre tout,
pour tout le monde. Les tables portent la forme ; aucun code ne la remplit, et aucune session
n'est ni créée, ni vérifiée, ni révoquée.

Ce n'est pas un reproche à E1 : la note dit clairement « les tables l'attendent ». Mais la phrase
« et elle est tenue » laisse croire qu'une session existe, et il faut la lire autrement — **la
session est spécifiée, pas vivante.**

**Conséquence pour E5 :** l'étape 4 n'est pas « ajouter une cérémonie à un système de sessions
existant ». C'est **bâtir le chemin de l'identité**, dont la cérémonie n'est qu'un des deux
moments.

## 3. Ce que la cérémonie exige réellement

Deux moments, et ils n'ont pas le même coût.

**L'enrôlement.** Le navigateur crée une paire de clés, garde la privée dans l'appareil, et rend
la publique. C'est ici que vit l'attestation — et c'est elle qui apporte CBOR, COSE et les dix
dépendances.

**L'authentification.** Le navigateur signe un défi avec la clé privée. Le serveur vérifie la
signature avec la clé publique enrôlée. **Aucune attestation, aucun CBOR** : une vérification de
signature, et le compteur anti-rejeu.

## 4. Les trois voies, et leur coût

### Voie A — la bibliothèque de référence

Dix dépendances transitives, pour l'essentiel de la vérification des certificats d'attestation,
dont deux utilisateurs connus n'ont pas l'usage. C'est ce qu'E1 a écarté, et la raison tient.

### Voie B — écrire CBOR et COSE ici

Écartée par E1, et je la maintiens écartée. De l'analyse binaire dans un chemin
d'authentification est exactement là où une erreur ne se voit pas.

### Voie C — laisser le navigateur rendre la clé publique

`AuthenticatorAttestationResponse.getPublicKey()` rend la clé publique **déjà en SPKI**, et
`getPublicKeyAlgorithm()` son algorithme. Le serveur n'a alors plus rien à analyser : il importe
la clé avec `crypto.subtle.importKey("spki", …)` et vérifie les signatures avec
`crypto.subtle.verify`. Les deux sont dans WebCrypto, présent nativement dans les Workers.

**Zéro dépendance. Aucun CBOR, aucun COSE, aucune attestation.**

Ce qu'elle coûte, et qu'il faut accepter :

- **On ne vérifie pas l'attestation**, donc on ne prouve pas *quel modèle* d'appareil garde la
  clé. Pour deux personnes connues qui enrôlent leurs propres appareils, cela ne protège de
  rien — et c'est déjà le choix d'E1, qui écartait l'attestation pour la même raison.
- **`getPublicKey()` peut rendre `null`** si l'algorithme n'est pas reconnu du navigateur.
  L'enrôlement doit alors **échouer en le disant**, jamais se rabattre en silence.
- Elle repose sur une API de navigateur, à vérifier sur les navigateurs réellement employés
  avant d'aller plus loin. C'est la première chose que fera l'étape.

## 5. Ma recommandation : la voie C

Elle lève le seul appui qui empêchait d'écrire la cérémonie — les dix dépendances — sans
ramener celui qu'E1 avait eu raison d'écarter. Le compromis qu'elle demande, renoncer à
l'attestation, est **déjà le compromis d'E1**, assumé pour les mêmes utilisateurs.

## 6. Les étapes, dans l'ordre où elles se vérifient

| # | ce qui est fait | comment on sait que c'est fait |
|---|---|---|
| 4.1 | **Vérifier la voie C** : `getPublicKey()` rend bien une clé SPKI importable, sur les navigateurs employés | Une mesure, pas une supposition. Si elle échoue, le plan revient devant vous |
| 4.2 | Le registre sait écrire et lire une personne, une clé, une session | Tests sur les quatre tables, aujourd'hui vides de tout code |
| 4.3 | L'enrôlement : défi, création, clé publique rangée | Une clé enrôlée se relit ; `getPublicKey()` nul **refuse** et le dit |
| 4.4 | L'authentification : défi, signature, vérification, session ouverte | Une signature valide ouvre ; une signature rejouée est refusée (le compteur) |
| 4.5 | La session : cookie 90 jours, repoussé une fois par jour, révocable | Une session révoquée refuse à la requête suivante |
| 4.6 | Les droits enfin appliqués : `droits.ts` branché à la porte | Une action absente de la table est refusée à tout le monde |

L'étape 4.6 n'était pas au plan d'E5. Elle y entre parce que la vérification l'a rendue
nécessaire : une identité sans droits appliqués ne sert à rien.

## 7. Ce que je ne fais pas sans un accord séparé

- **Aucun déploiement**, aucun changement de secret ou de configuration (CLAUDE.md, règle 7).
- **Aucune nouvelle dépendance** sans vous la soumettre — c'est tout l'objet de ce document.
- **Rien sur le vrai corpus** : la mini-bibliothèque reste le terrain d'épreuve.
- **Jamais `clone-proxy` ni `therapeute-library`.**

## 8. Ce qui reste ouvert

**Le jeton de service ne disparaît pas.** Il protège la façade pour les appels de machine à
machine ; la session protège les personnes. Les deux coexisteront, et il faudra dire clairement
lequel ouvre quoi — sans quoi on aura deux portes et une seule serrure vérifiée.

**La révocation à distance** demande un écran pour la déclencher. Il n'existe pas, et il
n'appartient pas à l'étape 4.
