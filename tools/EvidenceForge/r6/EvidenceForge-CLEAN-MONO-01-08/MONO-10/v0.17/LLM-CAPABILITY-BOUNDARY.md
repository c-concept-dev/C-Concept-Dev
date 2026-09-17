# MONO-10 v0.17 — frontière de capacité LLM

## 1. Le défaut fermé (B13)

En v0.5, la sonde de capacité acceptait un transport passé par l'appelant. Un
transport local rendant `httpStatus: 200` faisait conclure `usable = true` sous
un run de PRODUCTION. Un succès technique fabriqué devenait une capacité
prouvée.

## 2. La frontière charge son propre transport

```js
createOperatorLlmCapabilityBoundary({
  transportModuleRef,      // chemin de module, lu dans la config de l'exploitant
  allowedProviders, allowedModels, allowedWorkers
})
```

La frontière **ne reçoit jamais de transport** : elle reçoit une référence de
module et le charge elle-même. `createTestLlmCapabilityBoundary` existe, est
marquée TEST, et sa capacité n'est jamais utilisable sous un contexte de
PRODUCTION.

## 3. Le transport de l'appelant est ignoré et consigné

`runActiveProbe` rend systématiquement :

```
transportOrigin: "ENVIRONMENT"
callerTransportIgnored: true   // si l'appelant en a fourni un
```

L'appelant n'est pas seulement ignoré : le fait qu'il ait essayé est **inscrit
à titre déclaratif** dans l'artefact de capacité.

> **Attention — ceci n'est pas une garantie de sécurité.**
> `callerTransportIgnored` relève de la **traçabilité déclarative**, et de rien
> d'autre. Ce n'est **pas** une autorité critique : sa valeur peut être absente
> ou modifiée **sans changer aucune décision critique**, et l'effacer fait même
> *passer* un artefact que l'honnêteté ferait échouer. Ce qui bloque réellement
> l'attaque du transport d'appelant est ailleurs : l'impossibilité d'obtenir une
> `probeRef` hors de la vraie frontière de capacité.
> Voir « `callerTransportIgnored` : traçabilité, pas garantie » plus bas, et
> `OPEN-FINDINGS.md` (R3).

Le lecteur de cette section seule ne doit donc pas comprendre cette inscription
comme une protection.

## 4. Liste blanche

Un fournisseur, un modèle ou un identifiant de worker hors liste blanche rend
`status: "UNAVAILABLE"`. La liste blanche vient de la configuration de
l'exploitant, jamais de l'appel.

## 5. Absence de frontière : *fail closed*

Sans frontière de capacité provisionnée, la sonde rend `UNAVAILABLE` avec le
motif « aucune frontière de capacité LLM provisionnée ». Elle ne rend jamais
`UNKNOWN` interprétable comme un succès, et elle n'invente aucun transport.

## 6. Liaison au run

Une capacité prouvée dans un run n'est pas utilisable dans un autre :
`assertCapabilityUsable` vérifie `runId`, `missionHash` et la classe de preuve.
`llmBoundaryNamespace` porte le namespace de la frontière qui l'a produite, et
une capacité `TEST` n'est jamais utilisable sous un contexte `PRODUCTION`.

## 7. Aucun appel réel

`REAL_LLM_CALLS = 0`, `NETWORK_CALLS = 0`. `tools/reference-llm-transport.js`
est un transport de référence **hors ligne**, livré pour que la frontière ait un
module à charger dans les tests ; il n'ouvre aucune connexion et le dit.


## Fermeture v0.11 (§3 à §8) — la décision lie le sujet exact

### Le défaut de v0.10, dit sans détour

La liste blanche ci-dessus était vraie **de la sonde**, et fausse **de la
capacité certifiée**. La décision de sonde était inscrite avant que l'artefact
n'existe : elle ne portait aucun `artifactHash`, et sa vérification ne comparait
que `requestId` et le run. Une sonde légitime sur le seul triplet autorisé
certifiait donc un artefact déclarant un fournisseur, un modèle et un worker
hors liste blanche, `usable = true`. Une seule sonde certifiait quatre artefacts.

> **Une décision réelle ne suffit pas si elle ne lie pas le sujet exact qui est
> certifié.**

### Inscription en deux temps

```
1. runLlmProbe      -> recordProbe(sujet réellement sondé, résultat)
                       conserve le sujet, rend une probeRef
                       NE CERTIFIE RIEN

2. certifyLlmCapability
                    -> certifyProbedArtifact({probeRef, artifactId,
                                              artifactHash, sujet reconstruit
                                              DEPUIS L'ARTEFACT})
                       compare champ par champ
                       ré-applique la liste blanche
                       inscrit la DÉCISION, avec artifactHash
                       et decisionSubjectHash
```

Les six champs confrontés sont `providerId`, `modelId`, `workerBindingId`,
`requestId`, `runId`, `missionHash`. Toute divergence donne
`LLM_SUBJECT_MISMATCH`.

### Unicité

Une sonde ne vaut que pour **un** artefact : `LLM_PROBE_ALREADY_CONSUMED`. La
re-certification du même artefact, à contenu identique, reste idempotente.

### Vérification du sujet complet

`verifyDecision` exige sept dimensions — `providerId`, `modelId`,
`workerBindingId`, `artifactId`, `artifactHash`, `runId`, `missionHash`
(`REQUIRED`) — plus `executionMode`. **Une attente absente est un refus**,
jamais une dispense. `requestId` n'est comparé que **si** l'appelant le
présente : il fait partie des huit champs du **sujet enregistré** (six inscrits
par la sonde, plus `artifactId` et `artifactHash`), pas des dimensions exigées —
la différence entre ces deux objets est mesurée dans le code et exposée dans
`OPEN-FINDINGS.md` R1 (`DOC-25`).

### Ce que le contrat garantit désormais

| | |
|---|---|
| **Garanti** | une capacité `PRODUCTION_LLM_CAPABILITY` ne nomme que le triplet fournisseur/modèle/worker **réellement sondé**, pour l'artefact exact qui porte la concession, dans ce run et cette mission |
| **Garanti** | un sujet hors liste blanche de l'exploitant **ne peut pas devenir une capacité utilisable** |
| **Garanti** | un sujet **jamais sondé** ne peut pas devenir utilisable : `recordProbe` n'est appelé que sur le chemin `AVAILABLE`, donc aucune `probeRef` n'existe pour une sonde qui n'a pas abouti |
| **Non garanti** | qu'un LLM réel ait répondu : aucun appel réseau n'a lieu dans ce lot (`THREAT-MODEL.md`) |
| **Non garanti** | que **tous** les champs de l'artefact soient véridiques. La décision atteste *quels octets* ont été certifiés et *pour quel sujet* ; elle n'atteste pas le reste. Voir « Champs non attestés » ci-dessous |
| **Non garanti** | qu'un **code de refus précis** soit observé. Voir « Liste blanche : garantie comportementale » |

## Champs non attestés (v0.12 ; liste canonique depuis v0.14)

L'artefact `EvidenceForge.LlmCapability` est **construit par l'appelant**. Seules
les dimensions du sujet sont confrontées à la sonde réellement exécutée. Les
champs suivants sont **déclarés par l'appelant et jamais recoupés**.

**Cette énumération est la source canonique.** Tout nombre de « champs non
attestés » cité dans le lot — `README.md`, `THREAT-MODEL.md`, `TRUST-MODEL.md`,
`ARTIFACT-REGISTRY-TRUST.md`, `OPEN-FINDINGS.md` R3, `MANIFEST.json` — est
**dérivé** de la liste ci-dessous par le contrôle `DOC-12`, jamais recopié. Le
tableau de `OPEN-FINDINGS.md` R3 doit porter exactement les mêmes champs
(`DOC-02`). Avant v0.14, quatre documents annonçaient treize champs et le
`MANIFEST` douze : le chiffre treize comptait la ligne « champs additionnels
arbitraires », qui est une propriété du schéma et non un champ.

<!-- CANONICAL:NON_ATTESTED_FIELDS -->
1. `costUsd`
2. `configurationPresent`
3. `llmBoundaryId`
4. `callerVerifierIgnored`
5. `schemaVersion`
6. `probeTimestamp`
7. `capabilities[]`
8. `authMode`
9. `probeContract`
10. `failureReason`
11. `credentialPresenceProblem`
12. `callerTransportIgnored`
<!-- /CANONICAL:NON_ATTESTED_FIELDS -->

Soit **douze champs nommés**. Et, parce que **le schéma n'est pas fermé à
l'enregistrement**, tout champ additionnel arbitraire est toléré — c'est une
propriété du schéma, comptée à part, pas un treizième champ.

Trois précisions qui comptent :

- **`llmBoundaryId` n'est pas une preuve d'origine.** L'identité de l'émetteur
  qui fait foi est dans la **concession** — `issuerAuthorityId`,
  `issuerDescriptorHash` — jamais dans l'artefact.
- **`probeTimestamp` n'est vérifié que comme date analysable.** Il n'est
  **jamais comparé** à l'horodatage enregistré par l'émetteur. Une date de 1999
  ou de 2999 passe.
- **`schemaVersion` n'est comparé nulle part dans le lot.**

**Ces champs peuvent être informatifs ou diagnostiques. Ils ne sont PAS
attestés, sauf mention explicite du contraire. Aucun consommateur critique ne
doit s'appuyer sur eux comme preuve** — et, à la mesure, aucun ne le fait.

À l'inverse, `llmBoundaryNamespace` **est** lu : le déclarer `"TEST"` rend la
capacité inutilisable.

### `callerTransportIgnored` : traçabilité, pas garantie

Ce champ doit être isolé parce que son comportement est **auto-défaisant** :

- un artefact déclarant honnêtement `callerTransportIgnored: true` est
  **refusé** par `assertCapabilityUsable` ;
- l'effacer, ou le mettre à `false`, fait **passer** l'artefact.

Un appelant qui a présenté un transport et veut le dissimuler n'a donc qu'à ne
pas l'écrire. **Ce champ est un enregistrement de traçabilité, pas un contrôle
de capacité, et v0.12 cesse de le présenter comme une garantie autonome.** Ce
qui bloque réellement l'attaque du transport d'appelant est ailleurs :
l'impossibilité d'obtenir une `probeRef` hors de la vraie frontière.

## Résultat de sonde déclaré ≠ résultat enregistré (v0.12)

Le champ déclaratif `probeStatus` **ne fait pas partie du sujet vérifié**. Une
capacité peut donc être **certifiée** alors que ce champ ne correspond pas au
résultat enregistré par l'émetteur : un artefact déclarant `TIMEOUT`,
`DEGRADED` ou `UNAVAILABLE` par-dessus une sonde réellement `AVAILABLE` obtient
la concession.

**Ce que cela ne permet pas.** Le mensonge va dans le sens de la dégradation, et
il est rattrapé : `assertCapabilityUsable` refuse, la préparation retombe,
`qualifyProcess` refuse, l'autorisation aval refuse. Dans le sens de
l'escalade, il n'y a pas de chemin du tout — aucune `probeRef` n'existe pour une
sonde qui n'a pas abouti.

**Ce qu'il ne faut donc pas écrire** : que la certification vaudrait, à elle
seule, preuve de l'ensemble du contenu de l'artefact. Elle établit le sujet,
l'artefact et son empreinte. Rien de plus. Consigné en
`OPEN-FINDINGS.md` (R1).

## Liste blanche : garantie comportementale (v0.12)

La garantie est celle-ci, et elle tient :

> **un sujet hors liste blanche ne peut pas devenir une capacité utilisable.**

Ce qui ne tient **pas**, c'est la promesse qu'un code de refus précis soit
observé. `LLM_SUBJECT_OUT_OF_ALLOWLIST` est **inatteignable** dans
l'ordonnancement actuel. Il existe comme défense en profondeur — la
liste blanche est ré-appliquée à la certification — mais l'ordonnancement rend
cette branche **inatteignable en pratique** : la comparaison du sujet
(`LLM_SUBJECT_MISMATCH`) sort avant, et `probe()` refuse une intention hors liste
avant tout enregistrement.

v0.12 formule donc la garantie au niveau du **comportement**, pas du code de
retour. Consigné en `OPEN-FINDINGS.md` (R5).
