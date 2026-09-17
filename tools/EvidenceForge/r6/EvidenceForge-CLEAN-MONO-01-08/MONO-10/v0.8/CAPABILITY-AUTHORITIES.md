# MONO-10 v0.8 — autorités de capacité

## 1. Le défaut que ce lot ferme

v0.7 avait supprimé les drapeaux, les hashes de justification et les échelles
décoratives. L'audit A clean-room a montré que la décision critique n'avait pas
quitté la main de l'appelant : elle était passée du **champ** à l'**objet**, et
l'objet avait un constructeur exporté.

```
caller écrit /tmp/à-moi/roots.json
caller appelle createOperatorProvenanceAuthority({namespace:"PRODUCTION", registryPath})
  -> objet AUTHENTIQUEMENT marqué
  -> AUTHENTICATED_PROVENANCE sur ses artefacts
  -> identité STRONG depuis deux racines inventées
  -> candidat PRESENT_FOR_HUMAN_REVIEW
```

Aucun fichier de l'exploitant n'était touché. La marque d'origine était vraie,
parce que l'objet était vrai. Une marque prouve « créé par ce module » ; elle ne
prouve pas « émis par **cette** frontière provisionnée ».

## 2. Principe v0.8

> **Une capacité de sécurité n'est fiable que si son émetteur descend de
> l'`OperatorTrustBoundary` déjà provisionnée.**
>
> Un constructeur public n'est pas une frontière opérateur.

## 3. Racine unique

```
OperatorTrustBoundary  (provisionnée depuis EVIDENCEFORGE_OPERATOR_TRUST_CONFIG)
  │
  └── poignée d'émission  ← créée dans buildBoundary, JAMAIS exportée
        ├── EvidenceProvenanceAuthority
        ├── OperatorHistoricalInputAuthority
        ├── HumanActAuthority
        ├── LlmCapabilityAuthority
        └── réserve anti-rejeu (namespace ancré à la configuration)
```

La poignée est marquée dans un `WeakSet` module-privé de
`operator-trust-boundary.js`. Le seul prédicat exporté est
`isBoundaryIssuanceHandle` ; **aucun export ne produit une poignée**. Les quatre
modules d'autorité n'exposent plus que :

| Export | Rôle |
|---|---|
| `createFromBoundary(issuance, cfg)` | exige la poignée — `AUTHORITY_ISSUER_NOT_BOUNDARY` sinon |
| `createTest*Authority(...)` | fabrique TEST explicite, `executionMode: TEST` |
| `isProvisioned*(a, expected)` | vérifie la marque **et** l'appartenance à la frontière attendue |
| `descriptorOf(a)` | descripteur d'émission, en lecture |

Les noms `createOperatorProvenanceAuthority`,
`createOperatorHistoricalInputAuthority`, `createOperatorActProofMechanism` et
`createOperatorLlmCapabilityBoundary` **n'existent plus**.

## 4. Les chemins ne créent rien (§7, §8)

Un appelant peut formuler une **demande** ; il ne fournit aucun chemin. Les
emplacements viennent de la configuration **déjà chargée** par la frontière :

```
provenanceRegistryPath   historicalInputRegistryPath
humanActorsRegistryPath  llmTransportModuleRef
trustConfigPath          (ancre de la réserve anti-rejeu)
```

## 5. `provisionedFrom` est dérivé (§9)

v0.7 inscrivait `"ENVIRONMENT"` dès qu'un chemin non nul était fourni : la
propriété **mentait**, dans le lot dont le principe est *caller declaration ≠
authority*. v0.8 la dérive du contexte réel de provisionnement. Une fabrique de
TEST rend `IN_PROCESS_TEST`, et n'est jamais acceptée là où la production est
exigée.

## 6. Descripteur d'autorité (§10)

```
AuthorityDescriptor {
  operatorBoundaryId   authorityKind    authorityId
  executionMode        provisionedFrom  configBindingHash
  issuerGeneration     issuedAt         descriptorHash
}
```

Immuable, conservé dans une `WeakMap` module-privée : il n'est pas portable, il
ne se recopie pas, et `isProvisioned*` le consulte.

## 7. Liaison de la capacité (§11, §12)

Chaque concession porte `operatorBoundaryId`, `issuerAuthorityId`,
`issuerAuthorityKind`, `issuerDescriptorHash`, `issuerGeneration`,
`executionMode`, plus l'artefact, le run et la mission. Nommer la frontière est
**obligatoire** (`CAPABILITY_BOUNDARY_UNNAMED`) : on ne vérifie pas une origine
contre rien.

Refus vérifiés :

| Attaque | Code |
|---|---|
| autorité d'une autre frontière | `CAPABILITY_ISSUER_INVALID` |
| frontière non nommée | `CAPABILITY_BOUNDARY_UNNAMED` |
| genre d'autorité croisé | `CAPABILITY_ISSUER_INVALID` |
| autorité TEST pour une capacité de production | `CAPABILITY_ISSUER_NAMESPACE` |
| concession enregistrée sous une autre frontière | `CAPABILITY_GRANT_CROSS_BOUNDARY` |
| capacité présentée sous une autre frontière au sink | `ARTIFACT_CAPABILITY_CROSS_BOUNDARY` |
| capacité présente sans concession tracée | `ARTIFACT_CAPABILITY_UNTRACED` |
| concession sans dérivation nommée | `CAPABILITY_DERIVATION_MISSING` |

## 8. Inventaire (§32, §33)

| Capacité | Émetteur | Sink qui l'exige |
|---|---|---|
| `RUN_BOUND` | l'enregistrement lui-même | — (base) |
| `AUTHENTICATED_PROVENANCE` | `EvidenceProvenanceAuthority` | `panel-gate:evidence-presented-to-human` |
| `HUMAN_AUTHENTICATED` | mécanisme d'acte de l'exploitant | `panel-gated-adapter:corpus-sink` |
| `PRODUCTION_LLM_CAPABILITY` | frontière de capacité LLM | `llm-capability:production-use` |

`CALLER_ACCESSIBLE_PRODUCTION_SECURITY_ISSUER_COUNT = 0`, vérifié par un
inventaire qui énumère les exports réels du paquet.

## 9. Ce qui reste, et qui est déclaré

Qui peut écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` ou les fichiers qu'il
désigne obtient une frontière de PRODUCTION (`TRUST-MODEL.md` §7). v0.8 ne
supprime pas cette hypothèse : il supprime le fait qu'un appelant puisse
**contourner** l'exploitant sans toucher à ses fichiers.
