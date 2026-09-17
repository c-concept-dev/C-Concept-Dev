# MONO-10 v0.6 — cycle de vie des clés

## 1. Le lot ne détient aucune clé privée

Les clés sont frappées par l'exploitant (`tools/operator-provisioning.js`, outil
d'exploitation). Le noyau ne lit que des `keyRecord` publics. Un scan du paquet
vérifie l'absence de matière privée, avec témoin positif sur une clé éphémère
réelle pour prouver que le détecteur discrimine.

## 2. Enregistrement de clé

```
keyRecord {
  authorityId, keyId, publicKeyPem, namespace,
  validFrom, validUntil?,
  status,                 // ACTIVE | RETIRED | REVOKED
  revokedAt?, revocationReason?
}
```

Trois statuts, et trois seulement :

| Statut | Effet |
|---|---|
| `ACTIVE` | signe et vérifie dans sa fenêtre de validité |
| `RETIRED` | ne signe plus ; **ce qu'elle a signé pendant sa validité reste vérifiable** (politique historique explicite) |
| `REVOKED` | ne vérifie plus rien, même a posteriori ; `revokedAt` est obligatoire |

Tout autre statut lève `KEY_STATUS_UNKNOWN` — « fail closed, jamais ACTIVE par
défaut ». Il n'existe pas de statut par défaut permissif, et un statut absent
vaut `ACTIVE` seulement parce que `validFrom` et `validUntil` bornent alors la
fenêtre.

La distinction `RETIRED` / `REVOKED` est le cœur de la politique : une rotation
normale ne doit pas invalider l'histoire, une compromission doit l'invalider.

## 3. Séparation TEST / PRODUCTION (B08)

Une **même clé physique** ne peut pas figurer dans deux frontières de namespaces
différents : `TRUST_ANCHOR_KEY_CROSS_NAMESPACE`. La séparation porte sur le
matériel de clé, pas sur une étiquette.

`provisionTestTrustBoundary` refuse structurellement `namespace: "PRODUCTION"`.

## 4. Révocation vivante

`revocationModel = "LIVE_CONFIG_LOOKUP"`. Le vérificateur relit la configuration
de l'exploitant à chaque vérification. Séquence vérifiée par test :

1. l'attestation est acceptée ;
2. l'exploitant réécrit sa configuration avec `status: "REVOKED"` ;
3. la même attestation est refusée, motif « clé RÉVOQUÉE ».

Aucun cache ne survit à une révocation.

## 5. Rotation

La rotation est portée par la structure, pas par un mécanisme séparé : une
autorité déclare **plusieurs `keyRecord`**, chacun avec sa fenêtre
`validFrom` / `validUntil` et son statut. L'ancienne clé passe à `RETIRED`, la
nouvelle est `ACTIVE`. Une attestation est vérifiée contre la clé désignée par
son `keyId`, évaluée **à son propre `signedAt`**.

Mesures, et leur portée exacte :

| Situation | Résultat | Comment c'est mesuré |
|---|---|---|
| clé `ACTIVE` nouvelle, signature du jour | acceptée | bout en bout, attestation réelle |
| clé `RETIRED`, signature émise **après** `validUntil` | refusée — « signature émise après validUntil de la clé » | bout en bout, attestation réelle |
| clé `RETIRED`, signature émise **dans** sa fenêtre | `usable: true`, motif « ce qu'elle a signé pendant sa validité reste vérifiable » | `evaluateKeyAt` directement |
| clé `REVOKED`, signature émise dans sa fenêtre | `usable: false` | `evaluateKeyAt` directement |

Les deux dernières lignes ne sont **pas** mesurées de bout en bout, et cela n'est
pas une omission : `runtime-attestation.js` horodate lui-même la signature et
refuse un `signedAt` fourni par l'appelant. Produire une attestation réellement
datée de 2020 exigerait de fabriquer un horodatage — ce que l'ADN interdit. La
branche historique est donc vérifiée au niveau du contrat qui la porte, et cette
limite est déclarée plutôt que contournée.

## 6. Validité temporelle

`validFrom` / `validUntil` sont contrôlés contre l'horodatage de l'attestation.
Une attestation antérieure à `validFrom` ou postérieure à `validUntil` est
refusée.

## 7. Algorithme

Ed25519 via `crypto.sign` / `crypto.verify` (algorithme `null`). Aucune
dépendance externe. Vérifié disponible sur Node v24.

## 8. Secret d'attestation d'acte

Le secret servant au HMAC des `HumanActProof` est détenu dans le registre
d'acteurs de l'exploitant. Un acteur sans secret provisionné est refusé en
*fail closed* — jamais authentifié par défaut.
