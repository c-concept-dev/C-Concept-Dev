# MONO-10 v0.11 — frontière de capacité LLM

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

L'appelant n'est pas seulement ignoré : le fait qu'il ait essayé est inscrit
dans l'artefact de capacité.

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
`workerBindingId`, `artifactId`, `artifactHash`, `runId`, `missionHash` — plus
`executionMode`. **Une attente absente est un refus**, jamais une dispense.

### Ce que le contrat garantit désormais

| | |
|---|---|
| **Garanti** | une capacité `PRODUCTION_LLM_CAPABILITY` ne nomme que le triplet fournisseur/modèle/worker réellement sondé, pour l'artefact exact qui porte la concession, dans ce run et cette mission ; un triplet hors liste blanche reste inutilisable |
| **Non garanti** | qu'un LLM réel ait répondu : aucun appel réseau n'a lieu dans ce lot (`THREAT-MODEL.md`) |
