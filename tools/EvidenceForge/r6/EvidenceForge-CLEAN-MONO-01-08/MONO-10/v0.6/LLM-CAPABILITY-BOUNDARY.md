# MONO-10 v0.6 — frontière de capacité LLM

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
