# MONO-10 v0.7 — autorité d'entrée historique

## 1. Ce que v0.6 appelait un contrôle

Franchir un run demandait, en v0.6 :

```js
historicalInputContract: {
  contractKind: "IMMUTABLE_HISTORICAL_INPUT",
  relations: [...],
  operatorAuthenticated: true       // « requis »
}
```

`LINEAGE.md` affirmait : « Un appelant ne s'accorde pas à lui-même le droit de
traverser les runs. » L'audit indépendant a montré qu'il suffisait d'écrire ce
booléen dans un objet littéral. **Le contrôle documenté était une
auto-déclaration.** La suite livrée ne testait que la valeur `false`.

## 2. Le principe v0.7

> L'appelant peut **demander**. Il ne peut pas **déclarer**.

```js
// refusé — CALLER_AUTHORITY_ASSERTION_REFUSED
authority.authorize({ operatorAuthenticated: true, ... })

// le seul chemin
const r = verifier.authorizeHistoricalInput(request, contexteAttendu);
```

`OperatorHistoricalInputAuthority` est provisionnée depuis la configuration de
l'exploitant (`historicalInput.registryPath`). Absente, le franchissement de run
reste refusé — c'est le défaut, pas une exception.

## 3. Les neuf champs engagés (§8)

Une autorisation ne vaut que pour la **référence exacte** qu'elle nomme :

```
sourceRunId              artifactType        destinationRunId
sourceMissionHash        relation            destinationMissionHash
artifactId               purpose
artifactHash
```

plus une **preuve d'immuabilité** obligatoire (`frozenIdentity`) : un lot
historique se cite, il ne se redécouvre pas. Les champs facultatifs
`authorizedAt` et `version` sont consignés.

La correspondance doit être exacte sur les neuf champs. Une autorisation
`AMBIGUOUS` — plusieurs entrées concurrentes pour la même référence — est
refusée, jamais arbitrée en silence.

## 4. L'autorisation porte sur un artefact, pas sur une relation

En v0.6, le contrat autorisait des **relations** : `[QUALIFICATION]` ouvrait la
porte à tout artefact de qualification d'un autre run. En v0.7 la vérification
compare, pour chaque référence :

| Champ de l'autorisation | Comparé à |
|---|---|
| `artifactHash` | l'empreinte réellement enregistrée |
| `artifactType`, `relation` | le type et la relation lus **sur le registre** |
| `sourceRunId`, `sourceMissionHash` | le run et la mission de l'artefact |
| `destinationRunId`, `destinationMissionHash` | le run et la mission qui consomment |

Une autorisation présente mais désappariée est un refus explicite, pas un
silence.

## 5. Ce qui reste refusé par défaut

- `crossRunAllowedRelations` fourni par l'appelant : ignoré et signalé ;
- `historicalInputContract` fourni par l'appelant : ignoré et signalé ;
- toute référence inter-run ou inter-mission sans autorisation correspondante.

## 6. Limite déclarée

L'exploitant qui rédige le registre d'entrées historiques décide ce qui peut
traverser. C'est le même déplacement de confiance que pour la racine de
confiance et les racines de provenance : il est énoncé en `TRUST-MODEL.md` §7,
pas présenté comme résolu.
