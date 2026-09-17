# MONO-10 v0.5 — Modèle de confiance

## 1. Le principe

> **EVIDENCEFORGE MAY CHOOSE WHAT TO VERIFY.**
> **EVIDENCEFORGE MAY NOT CHOOSE WHOM TO TRUST.**

## 2. La récursion qu'il fallait arrêter

Trois versions ont déplacé la même auto-déclaration d'un cran :

| Version | Où vivait la racine | Audit |
|---|---|---|
| v0.1 / v0.2 | dans l'**artefact** (`executionEvidenceClass`) | `NON_GELABLE` |
| v0.3 | dans le **manifeste** (`manifestHash` auto-calculé) | `NON_GELABLE` |
| v0.4 | dans un **argument de fonction** (`anchorSet`) | `NON_GELABLE` |
| **v0.5** | **hors du processus appelant** | — |

v0.4 était cryptographiquement correct — Ed25519, charge signée complète — et
restait contournable : l'appelant générait sa paire de clés, la déclarait comme
ancrage, signait une attestation `PRODUCTION` et atteignait `AUTHORIZED`.

## 3. Ce que v0.5 change

### 3.1 Une frontière, deux voies d'obtention

```
provisionProductionTrustBoundary()   lit EVIDENCEFORGE_OPERATOR_TRUST_CONFIG
                                     → fichier hors processus → espace PRODUCTION
provisionTestTrustBoundary(cfg)      construction en processus → espace TEST, baked
```

`provisionTestTrustBoundary` **refuse par construction** de produire un espace
`PRODUCTION` (`OPERATOR_TRUST_BOUNDARY_NOT_PRODUCTION`). Il n'existe aucune
troisième voie.

### 3.2 Aucune API de production n'accepte de matière de confiance

L'interface de vérification est :

```js
verifier.verifyRuntimeAttestation({
  attestation, expectedRunId, expectedMissionHash,
  expectedProducer, expectedExecutionMode, expectedRunManifestRootHash })
```

L'appelant déclare **ce qu'il veut faire vérifier**. Aucun paramètre n'accepte
une clé, un ancrage, une carte de confiance ni un callback de vérification.
Le test `HYG-04` scanne la surface de production pour s'en assurer.

### 3.3 Marques d'origine — l'imitation ne suffit pas

Quatre objets critiques portent une marque qu'un appelant ne peut pas obtenir,
même en reproduisant exactement la forme de l'interface :

| Objet | Marque vérifiée par |
|---|---|
| `OperatorTrustBoundary` | `isOperatorTrustBoundary` |
| `OperatorTrustVerifier` | `isOperatorTrustVerifier` / `assertProductionVerifier` |
| `ReplayProtectionStore` | `isProvisionedStore` |
| `AuthenticatedArtifactRegistry` | `isAuthenticatedRegistry` |

Un objet de même forme fabriqué par l'appelant est refusé (`*_FORGED`).

### 3.4 Séparation des espaces

Un ancrage vaut pour **un seul** `executionMode`, et le mode est couvert par la
signature. Une même clé publique ne peut pas être déclarée deux fois dans une
frontière (`TRUST_ANCHOR_KEY_REUSED`). Une autorité `PRODUCTION` ne peut même
pas signer un mode `TEST`.

### 3.5 Ordre de création, sans circularité

```
1. l'exploitant provisionne la frontière                  (hors processus)
2. l'exploitant fige l'INTENTION d'ouverture du run        → runManifestRootHash
3. l'autorité signe l'attestation, qui ENGAGE cette racine
4. EvidenceForge vérifie l'attestation
5. le manifeste est créé À PARTIR de l'attestation vérifiée
6. les artefacts sont enregistrés ENSUITE, liés par empreinte croisée
```

La racine engage **l'ouverture du run**, jamais les artefacts — ils n'existent
pas encore au moment de la signature.

## 4. Qui contrôle quoi

| Élément | Exploitant | EvidenceForge | Appelant (mission / run) |
|---|---|---|---|
| Clé privée de production | **détient** | jamais | jamais |
| Ancrages de confiance | **provisionne** | lit | **ne peut pas fournir** |
| Espace TEST / PRODUCTION | **décide** | dérive | ne peut pas choisir |
| Mécanisme d'authentification humaine | **provisionne** | interroge | **ne peut pas fournir** |
| Store anti-rejeu | **provisionne** | consomme | **ne peut pas fournir** |
| Registre d'artefacts | — | **construit depuis le run** | ne peut pas déclarer |
| Ce qui est vérifié (run, mission, producteur) | — | vérifie | **déclare** |

## 5. Où vivent les clés

| Matière | Emplacement | Dans le paquet ? |
|---|---|---|
| Clé **privée** de production | système de l'autorité, hors EvidenceForge | **jamais** |
| Clé **publique** ancrée | configuration de l'exploitant, lue par variable d'environnement | **non** |
| Vérificateur | `core/operator-trust-verifier.js` | oui |
| Outillage d'exploitant | `tools/operator-provisioning.js` | oui, **sans aucune clé** |

`makeKeyRecord` et `createTrustAnchorSet` refusent toute matière privée. Les
tests `HYG-03` / `HYG-03b` scannent le paquet et prouvent par témoin positif que
le détecteur distingue une vraie clé d'un simple marqueur.

## 6. En l'absence de frontière

`EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` non définie ⇒ `OPERATOR_TRUST_NOT_PROVISIONED`.
Pas d'avertissement, pas de repli permissif : **fail closed**. De même pour un
store anti-rejeu absent (`REPLAY_PROTECTION_MISSING`) et pour un mécanisme
d'authentification humaine absent (`NOT_AUTHENTICATED`).

## 7. La limite honnête

`tools/operator-provisioning.js` peut générer une autorité et écrire une
configuration. Cela exige de **contrôler le système de fichiers et
l'environnement de l'exploitant** — c'est la définition même du rôle
d'exploitant. Ce que v0.5 ferme, c'est que l'**appelant de l'API EvidenceForge**
— le code de mission et de run — ne peut plus choisir à qui faire confiance.

La question d'audit n'est donc plus « la chaîne est-elle cohérente ? » ni
« l'appelant peut-il injecter une racine ? », mais : **qui contrôle
l'environnement et le fichier de configuration de l'exploitant ?** Voir
`THREAT-MODEL.md` §2.
