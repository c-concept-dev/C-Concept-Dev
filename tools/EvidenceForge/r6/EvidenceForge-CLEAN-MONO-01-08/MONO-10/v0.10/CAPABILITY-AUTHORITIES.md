# MONO-10 v0.10 — autorités de capacité

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

## 2. Principe v0.8, toujours en vigueur

> **Une capacité de sécurité n'est fiable que si son émetteur descend de
> l'`OperatorTrustBoundary` déjà provisionnée.**
>
> Un constructeur public n'est pas une frontière opérateur.

## 2 bis. Ce que v0.9 laissait ouvert, et le principe v0.10

v0.9 avait bien fermé la construction d'autorités parallèles. Elle laissait
deux choses ouvertes :

1. l'émetteur **réel** était atteignable — `verifier.provenanceAuthority()`,
   `verifier.llmCapabilityBoundary()`, `verifier.historicalInputAuthority()`,
   `boundary.humanAuthMechanism` ;
2. la frappe elle-même était libre : `mintCapabilityGrant` acceptait n'importe
   quelle `derivationRef`, y compris `"je-decrete-que-cest-authentifie"`.

> **Principe v0.10 — une capacité de sécurité n'est digne de confiance que si
> sa dérivation est vérifiable auprès de son émetteur.**
>
> L'appelant peut **demander** une opération. Il ne doit pas **recevoir**
> l'émetteur.

### Le registre de décisions

Chaque émetteur tient une carte privée `derivationRef -> décision`. Une décision
n'y est inscrite que par l'**opération causale réelle** :

| Émetteur | Opération qui inscrit | `decisionKind` |
|---|---|---|
| `EvidenceProvenanceAuthority` | `resolveRoots` aboutissant à `AUTHENTICATED` | `PROVENANCE_ROOT_RESOLUTION` |
| `HumanActAuthority` | `certifyArtifact` après vérification de **chaque** acte | `HUMAN_ACT_CERTIFICATION` |
| `LlmCapabilityAuthority` | `recordProbe`, appelé par le déroulement réel de la sonde | `LLM_PROBE_EXECUTION` |
| `OperatorHistoricalInputAuthority` | `authorize` aboutissant à une autorisation | `HISTORICAL_INPUT_AUTHORIZATION` |

`mintCapabilityGrant` interroge ce registre — `verifyDecision(derivationRef,
attentes)` — et refuse :

| Code | Cause |
|---|---|
| `CAPABILITY_DERIVATION_UNVERIFIABLE` | la dérivation n'est pas au registre, ou porte sur un autre artefact, run, mission ou mode |
| `CAPABILITY_ISSUER_HAS_NO_LEDGER` | l'émetteur présenté ne tient aucun registre de décisions |

La concession porte désormais `decisionKind` et `decisionHash` : elle **nomme**
la décision dont elle découle.

### La surface

Les quatre émetteurs ne sont plus des champs de l'objet frontière. Ils sont
détenus dans `ISSUERS`, une `WeakMap` non exportée de
`operator-trust-boundary.js`. `verifierFor(boundary)` est la seule fonction qui
l'ouvre, et elle ne rend pas les émetteurs : elle les passe à
`operator-trust-verifier.js`.

Le vérificateur n'expose que des **opérations** :

| Opération | Rend |
|---|---|
| `resolveProvenanceRoots(descriptor, contexteAttendu)` | une résolution, avec sa `derivationRef` si elle a authentifié |
| `certifyProvenance({registry, artifactId})` | un verdict ; la capacité est émise et concédée **dans** la frontière |
| `runLlmProbe(config, ctx)` | l'artefact de capacité, sonde réellement exécutée |
| `certifyLlmCapability({registry, artifactId})` | un verdict, sur `probeDerivationRef` inscrite |
| `verifyHumanAct(act, expected)` | un verdict d'authentification |
| `certifyHumanAuthenticated({registry, artifactId, acts})` | un verdict ; **chaque** acte est vérifié |
| `authorizeHistoricalInput(request, contexteAttendu)` | une autorisation marquée, ou un refus |
| `verifyIssuerDecision(capability, derivationRef, attentes)` | lecture seule |

`boundary.issuerInventory` déclare la **présence** d'un émetteur ;
`verifier.provenanceAuthorityId()`, `.humanAuthMechanismId()` et
`.llmBoundaryId()` rendent des **identifiants opaques**. Un identifiant n'est
pas un émetteur : `isProvisionedProvenanceAuthority("provenance-authority:…")`
rend `false`.

`ACCESSIBLE_ISSUER_COUNT = 0`. Ce n'est pas une liste de noms : le test T03
balaie la surface réelle de la frontière, du vérificateur, du registre et du
manifeste jusqu'à la profondeur 3, appelle tout getter sans argument, et demande
aux quatre prédicats d'origine si l'objet obtenu est un émetteur.

### La seule remise interne

`operator-trust-verifier.js` exporte `__build(boundary, issuers)` : c'est ainsi
que `operator-trust-boundary.js` lui remet les émetteurs sans passer par le code
appelant. Cette surface est **bornée par construction** :

- appelée avec des émetteurs que l'appelant a construits, elle lève
  `VERIFIER_ISSUER_FOREIGN` — chaque émetteur remis doit appartenir à la
  frontière, identité composite comparée ;
- appelée sans émetteur, elle rend un vérificateur **stérile** : il refuse toute
  certification. Jamais un vérificateur permissif.

C'est la seule surface `__` du lot, et le test d'hygiène HYG-09 la nomme
explicitement au lieu de tolérer un motif.

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
