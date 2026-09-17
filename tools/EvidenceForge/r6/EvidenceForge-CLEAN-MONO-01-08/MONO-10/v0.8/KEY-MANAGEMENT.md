# MONO-10 v0.7 — cycle de vie des clés

## 1. Le lot ne détient aucune clé privée

Les clés sont frappées par l'exploitant (`tools/operator-provisioning.js`). Le
noyau ne lit que des `keyRecord` publics. Un scan du paquet vérifie l'absence de
matière privée, avec témoin positif sur une clé éphémère réelle pour prouver que
le détecteur discrimine.

## 2. Les trois statuts — source canonique, pas recopie

Cette liste n'est **pas écrite ici**. Elle est lue dans
`contracts/canonical-contracts.json`, le code l'importe, et un test compare ce
document à cette source. En v0.6, ce même document annonçait quatre statuts
alors que le code n'en connaissait que trois : la divergence est désormais
impossible sans faire échouer un test.

<!-- contract:keyStatuses -->

| Statut | Effet |
|---|---|
| `ACTIVE` | signe et vérifie dans sa fenêtre de validité |
| `RETIRED` | ne signe plus ; **ce qu'elle a signé pendant sa validité reste vérifiable** (politique historique explicite) |
| `REVOKED` | ne vérifie plus rien, même a posteriori ; `revokedAt` est obligatoire |

<!-- /contract -->

## 3. Absence, nul, inconnu : INVALIDE (§38)

v0.6 faisait valoir `ACTIVE` par défaut quand `status` était absent ou nul :
une clé sans statut devenait utilisable par accident. v0.7 lève
`KEY_STATUS_INVALID` pour `undefined`, `null`, `""`, `0` et toute chaîne hors
liste. Il n'existe plus aucun chemin par lequel l'absence devient une
autorisation.

## 4. Séparation TEST / PRODUCTION

Une **même clé physique** ne peut pas figurer dans deux frontières de namespaces
différents : `TRUST_ANCHOR_KEY_CROSS_NAMESPACE`. La séparation porte sur le
matériel de clé, pas sur une étiquette. `provisionTestTrustBoundary` refuse
structurellement `namespace: "PRODUCTION"`.

## 5. Rotation

La rotation est portée par la structure : une autorité déclare plusieurs
`keyRecord`, chacun avec sa fenêtre `validFrom` / `validUntil` et son statut.
L'ancienne passe à `RETIRED`, la nouvelle est `ACTIVE`. Une attestation est
vérifiée contre la clé désignée par son `keyId`, évaluée **à son propre
`signedAt`**.

| Situation | Résultat | Mesure |
|---|---|---|
| clé `ACTIVE` nouvelle, signature du jour | acceptée | bout en bout |
| clé `RETIRED`, signature après `validUntil` | refusée | bout en bout |
| clé `RETIRED`, signature dans sa fenêtre | `usable: true`, motif historique | `evaluateKeyAt` |
| clé `REVOKED`, signature dans sa fenêtre | `usable: false` | `evaluateKeyAt` |

Les deux dernières lignes ne sont pas mesurées de bout en bout : le module
d'attestation horodate lui-même la signature et refuse un `signedAt` fourni par
l'appelant. Produire une attestation réellement datée du passé exigerait de
fabriquer un horodatage, ce que l'ADN interdit. La limite est déclarée, pas
contournée.

## 6. Révocation vivante

`revocationModel = "LIVE_CONFIG_LOOKUP"` : le vérificateur relit la
configuration de l'exploitant à chaque vérification. Une clé révoquée **après**
provisionnement cesse d'authentifier immédiatement.

## 7. Rejeu : la clé fait partie du périmètre

La clé logique du nonce est `authorityId + keyId + nonce`, et le namespace
anti-rejeu est **dérivé** de l'ensemble autorité/clés. Voir
`REPLAY-PROTECTION.md`.

## 8. Secret d'attestation d'acte

Le secret du HMAC des `HumanActProof` est détenu dans le registre d'acteurs de
l'exploitant. Un acteur sans secret provisionné est refusé en *fail closed*.
