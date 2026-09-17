# MONO-10 v0.5 — Contrat de gestion des clés

Ce contrat est **exécutable et testable localement**. Il n'impose aucune
technologie : HSM, KMS, keychain système, secret manager ou fichier protégé
produisent tous la même description.

## 1. Description d'une clé

```
authorityId             identifiant opaque de l'autorité
keyId                   identifiant opaque de la clé au sein de l'autorité
publicKeyPem            clé PUBLIQUE, jamais privée
publicKeyFingerprint    sha256 du corps DER — dérivée, jamais déclarée
status                  ACTIVE | RETIRED | REVOKED
validFrom               obligatoire
validUntil              optionnelle
revokedAt               obligatoire si REVOKED
revocationReason        optionnelle
supersedesKeyId         lien de rotation, optionnel
```

`makeKeyRecord` **refuse** `PRIVATE KEY`, `privateKeyPem` et `secret`
(`KEY_RECORD_CONTAINS_SECRET`), et refuse une empreinte déclarée qui ne
correspond pas à la clé (`KEY_FINGERPRINT_MISMATCH`).

## 2. Provisionnement

L'exploitant écrit la configuration lue par la frontière :

```json
{
  "operatorTrustBoundaryId": "otb-production-2026",
  "namespace": "PRODUCTION",
  "authorities": [{ "authorityId": "AUT-RUNTIME", "keys": [ { "keyId": "k-2026-01", "...": "..." } ] }],
  "replayProtection": { "kind": "FILE", "directory": "/var/lib/evidenceforge/nonces" },
  "humanAuth": { "kind": "OPERATOR_REGISTRY", "registryPath": "/etc/evidenceforge/actors.json" }
}
```

Puis `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG=/etc/evidenceforge/trust.json`.
Le fichier est refusé s'il contient de la matière privée
(`OPERATOR_TRUST_CONFIG_CONTAINS_SECRET`).

## 3. Activation

Une clé `ACTIVE` signe et vérifie, **dans sa fenêtre de validité**. La fenêtre
est évaluée à la **date d'émission de la signature**, pas à celle de la
vérification : c'est ce qui rend l'histoire stable.

## 4. Rotation

```
k-2026-01  ACTIVE    validFrom 2026-01-01                       ← signe aujourd'hui
k-2025-01  RETIRED   validFrom 2025-01-01  validUntil 2026-01-01  supersededBy k-2026-01
```

Une clé `RETIRED` **ne signe plus**, mais ce qu'elle a signé pendant sa validité
**reste vérifiable**. Une rotation ne réécrit pas l'histoire (Charte §13).

Les deux clés coexistent dans la même autorité ; elles ont des `keyId` distincts
et des empreintes distinctes. Une attestation porte son `keyId` dans la charge
signée : la clé de vérification est donc déterminée sans ambiguïté.

## 5. Retrait

Passer `status` à `RETIRED` et fixer `validUntil`. Effet immédiat sur les
signatures **nouvelles** ; aucun effet sur les signatures antérieures valides.

## 6. Révocation

```
status: "REVOKED", revokedAt: "...", revocationReason: "compromission supposée"
```

Une clé révoquée n'est **jamais** valide — y compris **rétroactivement**, pour
des signatures antérieures à la révocation. C'est délibéré : une clé compromise
a pu servir à antidater. Ce choix est plus strict que la simple expiration et
doit être assumé : révoquer invalide l'historique signé par cette clé.

## 7. Expiration

`validUntil` dépassé à la date de signature ⇒ refus. Une attestation de
`PRODUCTION` doit en outre porter une échéance explicite (`expiresAt`) : sans
elle, elle est refusée.

## 8. Séparation TEST / PRODUCTION

- Un ancrage vaut pour **un seul** `executionMode`.
- Le mode est **couvert par la signature**.
- Une même clé publique ne peut pas figurer deux fois dans une frontière
  (`TRUST_ANCHOR_KEY_REUSED`).
- L'espace `PRODUCTION` n'est atteignable que par provisionnement environnement.

## 9. Empreintes

`publicKeyFingerprint` est **dérivée** de la clé, jamais acceptée sur
déclaration. Elle sert à comparer, tracer et détecter la réutilisation — et ne
révèle aucun secret. C'est la valeur à publier dans un registre d'exploitation.

## 10. Traitement d'incident

1. **Révoquer** la clé dans la configuration (`REVOKED` + `revokedAt` + raison).
2. Les runs ouverts sous cette clé cessent de vérifier — **c'est l'effet voulu**.
3. Provisionner une nouvelle clé `ACTIVE`, `supersedesKeyId` renseigné.
4. Ne **pas** réécrire les lots gelés : un lot qualifié sous une clé ensuite
   révoquée conserve son historique ; c'est son **usage aval** qui est bloqué,
   pas son existence (Charte §12, §13).
5. Consigner la décision propriétaire.

## 11. Ce qui reste hors du lot

La génération, le stockage, la sauvegarde et la destruction de la matière privée
sont **hors d'EvidenceForge** : le lot n'en contient aucune et n'en manipule
jamais. Voir `THREAT-MODEL.md` §2.
